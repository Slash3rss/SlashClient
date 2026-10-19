import { confirmDialog, el, fmtSize, icon } from './dialog';
import { locale, t } from '../shared/i18n';

/**
 * Profiles on the player's SlashClient account: the "Profil na koncie" card in a profile's
 * settings (sync now, upload, download, automatic sync) and the account's list in the
 * "Importuj profil" window (restore on this computer, delete). The packing, the links and the
 * server live in the main process (src/main/cloudProfiles.ts); this is only the page.
 */

interface CloudProfile { id: string; name: string; gameVersion: string; loader: string; device: string; size: number; revision: number; updatedAt: number }
interface CloudLink { cloudId: string; revision: number; syncedAt: number; auto: boolean }
interface CloudStatus { signedIn: boolean; link?: CloudLink; remote?: CloudProfile; action?: 'upload' | 'download' | 'conflict' | 'none'; localChanged?: boolean }
interface CloudList { profiles: CloudProfile[]; limits?: { maxProfiles: number; quotaBytes: number; used: number }; local: Record<string, string> }

export interface CloudDeps {
  api: any;
  $: <T extends HTMLElement = HTMLElement>(sel: string) => T;
  guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  toast: (message: string, isError?: boolean) => void;
  busy: <T>(button: HTMLButtonElement, work: () => Promise<T>, label?: string) => Promise<T>;
  /** The profile open in the editor. */
  editing: () => string | undefined;
  /** A local profile's name, for the account's list. */
  profileName: (profileId: string) => string | undefined;
  /** Opens a profile in the editor (after restoring it, or from the account's list). */
  openProfile: (profileId: string) => void;
}

const when = (at: number) => new Date(at).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
const errorText = (err: unknown) => String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');

/** A question with several answers in the launcher's window style; resolves the chosen index, or -1. */
function chooseDialog(title: string, body: (Node | string)[], choices: { label: string; icon: string; primary?: boolean }[]): Promise<number> {
  return new Promise((resolve) => {
    const buttons = choices.map((c, i) => {
      const b = el('button', { type: 'button', className: c.primary ? 'primary' : '' }, icon(c.icon), ' ', c.label);
      b.addEventListener('click', () => done(i));
      return b;
    });
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
    const modal = el('div', { className: 'modal' },
      el('div', { className: 'modal-box glass-panel join-box confirm-box' }, close,
        el('div', { className: 'modal-body' }, el('h2', { textContent: title }), ...body, el('div', { className: 'row join-actions' }, cancel, ...buttons))));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      done(-1);
    };
    function done(answer: number) {
      modal.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(answer);
    }
    cancel.addEventListener('click', () => done(-1));
    close.addEventListener('click', () => done(-1));
    modal.addEventListener('click', (e) => e.target === modal && done(-1));
    document.addEventListener('keydown', onKey, true);
    document.body.append(modal);
  });
}

export function initCloudProfiles(d: CloudDeps) {
  const { api, $, guard } = d;
  let shown: string | undefined;
  let last: CloudStatus | undefined;

  const from = (r: CloudProfile) => (r.device ? t('{0}, {1}', r.device, when(r.updatedAt)) : when(r.updatedAt));

  function statusText(s: CloudStatus): { text: string; warn?: boolean } {
    if (!s.signedIn) return { text: t('Zaloguj się do SlashClient (zakładka Znajomi), żeby zapisywać profile na koncie.') };
    if (!s.link) return { text: t('Tego profilu nie ma jeszcze na koncie.') };
    if (!s.remote) return { text: t('Kopii na koncie już nie ma (usunięto ją na innym komputerze). Wyślij profil, żeby zapisać go znowu.'), warn: true };
    switch (s.action) {
      case 'none': return { text: t('Aktualny. Ostatni zapis na koncie: {0}.', from(s.remote)) };
      case 'upload': return { text: t('Zmiany z tego komputera nie są jeszcze na koncie.') };
      case 'download': return { text: t('Na koncie jest nowsza wersja ({0}).', from(s.remote)), warn: true };
      default: return { text: t('Profil zmienił się i tutaj, i na koncie ({0}). Wybierz, którą wersję zostawić.', from(s.remote)), warn: true };
    }
  }

  /** Fills the card; the same profile again only when `force` (the store is redrawn often, the check reads files and asks the server). */
  async function render(profileId: string, force = false) {
    if (!force && shown === profileId) return;
    shown = profileId;
    const status = $('#cloud-status');
    status.textContent = t('Sprawdzam…');
    status.classList.remove('share-warn');
    let s: CloudStatus;
    try {
      s = await api.cloudStatus(profileId);
    } catch (err) {
      if (shown !== profileId) return;
      status.textContent = errorText(err);
      last = undefined;
      return;
    }
    if (shown !== profileId) return;
    last = s;
    const { text, warn } = statusText(s);
    status.textContent = text;
    status.classList.toggle('share-warn', !!warn);
    $<HTMLInputElement>('#cloud-auto').checked = !!s.link?.auto;
    $<HTMLInputElement>('#cloud-auto').disabled = !s.signedIn;
    $<HTMLButtonElement>('#cloud-sync').disabled = !s.signedIn || !s.link || s.action === 'none';
    $<HTMLButtonElement>('#cloud-upload').disabled = !s.signedIn;
    $<HTMLButtonElement>('#cloud-download').disabled = !s.signedIn || !s.remote;
  }

  /** Uploads; when another computer saved in between, the player picks which copy wins. */
  async function upload(profileId: string, force: boolean) {
    const res: { conflict?: CloudProfile; profile?: CloudProfile } | undefined = await guard(() => api.cloudUpload(profileId, force));
    if (res?.conflict) await resolveConflict(profileId, res.conflict);
    else if (res?.profile) d.toast(t('Zapisano profil na koncie.'));
  }

  async function download(profileId: string, remote: CloudProfile) {
    const ok = await confirmDialog({
      title: t('Pobrać profil z konta?'),
      body: [el('p', { className: 'muted', textContent: t('Mody, configi, układ HUD i ustawienia tego profilu zostaną zastąpione wersją z konta ({0}). Przedtem SlashClient zrobi migawkę, więc zmianę da się cofnąć.', from(remote)) })],
      ok: t('Pobierz'), okIcon: 'fa-cloud-arrow-down',
    });
    if (!ok) return;
    await guard(() => api.cloudDownload(profileId));
  }

  async function resolveConflict(profileId: string, remote: CloudProfile | undefined) {
    const choice = await chooseDialog(t('Która wersja profilu ma zostać?'), [
      el('p', { className: 'muted', textContent: remote
        ? t('Profil zmienił się na tym komputerze, a na koncie jest wersja zapisana później na innym ({0}).', from(remote))
        : t('Profil zmienił się na tym komputerze i na koncie.') }),
      el('p', { className: 'muted', textContent: t('Wysłanie zastąpi kopię na koncie. Pobranie zastąpi ten profil (przedtem SlashClient zrobi migawkę).') }),
    ], [
      { label: t('Pobierz z konta'), icon: 'fa-cloud-arrow-down' },
      { label: t('Wyślij ten'), icon: 'fa-cloud-arrow-up', primary: true },
    ]);
    if (choice === 1) await upload(profileId, true);
    else if (choice === 0) await guard(() => api.cloudDownload(profileId));
  }

  const withButton = async (button: HTMLButtonElement, work: (profileId: string) => Promise<void>) => {
    const id = d.editing();
    if (!id) return;
    await d.busy(button, () => work(id));
    if (d.editing() === id) await render(id, true);
  };

  $('#cloud-sync').addEventListener('click', (e) => withButton(e.currentTarget as HTMLButtonElement, async (id) => {
    const s: CloudStatus | undefined = await guard(() => api.cloudStatus(id));
    if (!s) return;
    if (s.action === 'none') d.toast(t('Profil jest aktualny.'));
    else if (s.action === 'download' && s.remote) await download(id, s.remote);
    else if (s.action === 'conflict') await resolveConflict(id, s.remote);
    else await upload(id, false);
  }));
  $('#cloud-upload').addEventListener('click', (e) => withButton(e.currentTarget as HTMLButtonElement, async (id) => {
    const s = last;
    // the account holds a copy this computer has not seen: say so before replacing it
    if (s?.link && s.remote && s.remote.revision !== s.link.revision) {
      const ok = await confirmDialog({
        title: t('Zastąpić kopię na koncie?'),
        body: [el('p', { className: 'muted', textContent: t('Na koncie jest wersja zapisana na innym komputerze ({0}). Wysłanie jej nadpisze.', from(s.remote)) })],
        ok: t('Wyślij'), okIcon: 'fa-cloud-arrow-up', danger: true,
      });
      if (!ok) return;
      await upload(id, true);
    } else await upload(id, false);
  }));
  $('#cloud-download').addEventListener('click', (e) => withButton(e.currentTarget as HTMLButtonElement, async (id) => {
    if (last?.remote) await download(id, last.remote);
  }));
  $('#cloud-auto').addEventListener('change', async (e) => {
    const box = e.currentTarget as HTMLInputElement;
    const id = d.editing();
    if (!id) return;
    box.disabled = true;
    // turned on for a profile not on the account yet: it goes there now
    if (box.checked && !last?.link) await upload(id, false);
    else await guard(() => api.cloudSetAuto(id, box.checked));
    box.disabled = false;
    if (d.editing() === id) await render(id, true);
  });

  // ---- the account's list in the import window ----

  async function renderList() {
    const list = $('#cloud-list');
    list.replaceChildren(el('p', { className: 'muted', textContent: t('Wczytuję…') }));
    let res: CloudList;
    try {
      res = await api.cloudList();
    } catch (err) {
      list.replaceChildren(el('p', { className: 'muted', textContent: errorText(err) }));
      return;
    }
    if (!res.profiles.length) {
      list.replaceChildren(el('p', { className: 'muted', textContent: t('Na koncie nie ma jeszcze profili. Włącz „Synchronizuj z kontem” w ustawieniach profilu.') }));
      return;
    }
    const rows = res.profiles.map((p) => {
      const localId = res.local[p.id];
      const localName = localId && d.profileName(localId);
      const meta = [`Minecraft ${p.gameVersion}`, p.loader !== 'vanilla' ? p.loader : '', fmtSize(p.size), from(p)];
      const main = el('button', { type: 'button', className: localName ? '' : 'primary' }, icon(localName ? 'fa-arrow-right' : 'fa-cloud-arrow-down'), ' ', localName ? t('Otwórz') : t('Pobierz'));
      main.addEventListener('click', async () => {
        if (localId && localName) {
          $('#pack-source-modal').classList.add('hidden');
          d.openProfile(localId);
          return;
        }
        const id: string | undefined = await d.busy(main, () => guard(() => api.cloudRestore(p.id)));
        if (!id) return;
        $('#pack-source-modal').classList.add('hidden');
        d.openProfile(id);
      });
      const del = el('button', { type: 'button', className: 'icon-btn danger', title: t('Usuń z konta') }, el('i', { className: 'fa-regular fa-trash-can' }));
      del.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: t('Usunąć „{0}” z konta?', p.name || p.id),
          body: [el('p', { className: 'muted', textContent: t('Kopia zniknie z konta i przestanie się synchronizować. Profile na komputerach zostaną, jak są.') })],
          ok: t('Usuń'), okIcon: 'fa-trash-can', danger: true,
        });
        if (!ok) return;
        await guard(() => api.cloudDelete(p.id));
        await renderList();
        const open = d.editing();
        if (open) await render(open, true);
      });
      return el('div', { className: 'join-choice' },
        el('i', { className: 'fa-solid fa-cloud pack-part-icon' }),
        el('div', { className: 'grow' }, p.name || p.id,
          el('small', { textContent: meta.filter(Boolean).join(' · ') }),
          ...(localName ? [el('small', { textContent: t('Na tym komputerze: {0}', localName) })] : [])),
        main, del);
    });
    const limits = res.limits;
    const note = limits ? [el('p', { className: 'muted pack-note', textContent: t('Profile: {0} z {1} · miejsce: {2} z {3}', res.profiles.length, limits.maxProfiles, fmtSize(limits.used), fmtSize(limits.quotaBytes)) })] : [];
    list.replaceChildren(...rows, ...note);
  }
  $('#profile-import').addEventListener('click', () => void renderList());
  // an upload after the game, a download or a snapshot restore changed what the card shows
  api.on('task:done', () => {
    const open = d.editing();
    if (open && shown === open) void render(open, true);
  });

  return { render };
}
