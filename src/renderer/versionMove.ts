import { confirmDialog, el } from './dialog';
import { t } from '../shared/i18n';

/**
 * The "Przenieś na inną wersję Minecrafta" card in a profile's settings: pick a version, see
 * which mods Modrinth has for it, move in one click, and later check again the mods that were
 * not ready. The checking and moving live in the main process (src/main/versionMove.ts).
 */

type MoveStatus = 'ready' | 'same' | 'missing' | 'unknown';
interface MoveItem { filename: string; enabled: boolean; title: string; status: MoveStatus; iconUrl?: string; currentVersion?: string; targetVersion?: string; prerelease?: boolean }
interface MovePlan { from: string; to: string; loader: string; items: MoveItem[] }
interface MoveReport { from: string; to: string; at: number; moved: number; pending: { filename: string; title: string; status: 'missing' | 'unknown' }[]; failedDeps?: string[] }

interface MoveProfile { id: string; versionId: string; loader: string; modpack?: unknown }

export interface MoveDeps {
  api: any;
  $: <T extends HTMLElement = HTMLElement>(sel: string) => T;
  guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  toast: (message: string, isError?: boolean) => void;
  busy: <T>(button: HTMLButtonElement, work: () => Promise<T>, label?: string) => Promise<T>;
  editing: () => string | undefined;
  /** Minecraft versions from Mojang's list, newest first. */
  versions: () => { id: string; type: string }[];
  /** "latest-release" and the like as the version they stand for now. */
  resolve: (versionId: string) => string;
  /** A picture for a project (Modrinth CDN only), or the launcher's logo. */
  projectIcon: (url?: string) => HTMLImageElement;
}

export function initVersionMove(d: MoveDeps) {
  const { api, $, guard } = d;
  let shown: string | undefined;
  let plan: MovePlan | undefined;
  let shownKey: string | undefined;

  function statusOf(i: MoveItem, to: string): { text: string; fit: boolean } {
    switch (i.status) {
      case 'ready': return { text: `${i.currentVersion} → ${i.targetVersion}${i.prerelease ? ` (${t('wersja testowa')})` : ''}`, fit: true };
      case 'same': return { text: t('już działa na {0}', to), fit: true };
      case 'missing': return { text: t('brak wersji dla {0}: zostanie wyłączony', to), fit: false };
      default: return { text: t('nie ma go na Modrinth: nie da się sprawdzić'), fit: false };
    }
  }

  function row(title: string, iconUrl: string | undefined, sub: string, side: string, fit: boolean, off = false) {
    return el('div', { className: `join-choice move-item${off ? ' off' : ''}` },
      d.projectIcon(iconUrl),
      el('div', { className: 'grow' }, title, el('small', { textContent: sub })),
      el('span', { className: fit ? 'fit' : 'unfit', textContent: side }));
  }

  function renderPlan(p: MovePlan) {
    const counts = { ready: 0, same: 0, missing: 0, unknown: 0 };
    for (const i of p.items) counts[i.status]++;
    const parts = [
      t('do przeniesienia: {0}', counts.ready), t('już pasują: {0}', counts.same),
      t('czekają na nową wersję: {0}', counts.missing), counts.unknown ? t('spoza Modrinth: {0}', counts.unknown) : '',
    ];
    $('#move-summary').textContent = p.items.length
      ? `Minecraft ${p.from} → ${p.to}: ${parts.filter(Boolean).join(' · ')}`
      : t('Ten profil nie ma modów: zmieni się tylko wersja gry ({0} → {1}).', p.from, p.to);
    $('#move-list').replaceChildren(...p.items.map((i) => {
      const s = statusOf(i, p.to);
      const label = i.status === 'ready' ? t('gotowy') : i.status === 'same' ? t('pasuje') : i.status === 'missing' ? t('niegotowy') : t('nieznany');
      return row(i.title, i.iconUrl, s.text + (i.enabled ? '' : ` · ${t('wyłączony')}`), label, s.fit, !i.enabled);
    }));
    $('#move-unknown-row').classList.toggle('hidden', !counts.unknown);
    $('#move-go').replaceChildren(el('i', { className: 'fa-solid fa-right-left' }), ' ', t('Przenieś na {0}', p.to));
    $('#move-result').classList.remove('hidden');
  }

  function renderReport(report: MoveReport | undefined) {
    const box = $('#move-pending');
    box.classList.toggle('hidden', !report);
    if (!report) return;
    const deps = report.failedDeps?.length ? ` ${t('Nie udało się doinstalować wymaganych bibliotek: {0}.', report.failedDeps.length)}` : '';
    $('#move-pending-title').replaceChildren(el('i', { className: 'fa-solid fa-hourglass-half' }), ' ',
      t('Po przeniesieniu na {0} czekają (wyłączone): {1}.', report.to, report.pending.length) + deps);
    $('#move-pending-list').replaceChildren(...report.pending.map((p) => row(p.title, undefined, p.filename,
      p.status === 'missing' ? t('brak wersji') : t('spoza Modrinth'), false, true)));
  }

  /** Fills the card; the same profile on the same version again only when `force` (the store is redrawn often). */
  async function render(profile: MoveProfile, force = false) {
    const key = `${profile.id}|${profile.versionId}|${profile.loader}|${!!profile.modpack}|${d.versions().length}`;
    if (!force && shownKey === key) return;
    shownKey = key;
    shown = profile.id;
    plan = undefined;
    $('#move-result').classList.add('hidden');
    const current = d.resolve(profile.versionId);
    const select = $<HTMLSelectElement>('#move-target');
    const targets = d.versions().filter((v) => v.type === 'release' && v.id !== current);
    select.replaceChildren(...targets.map((v) => el('option', { value: v.id, textContent: v.id })));
    // the newest release is the usual destination
    if (targets[0]) select.value = targets[0].id;
    const fromPack = !!profile.modpack;
    select.disabled = fromPack;
    $<HTMLButtonElement>('#move-check').disabled = fromPack || !targets.length;
    $('#move-intro').textContent = fromPack
      ? t('Ten profil pochodzi z modpacka: zmień wersję modpacka (wyżej), a on sam przeniesie się na inną wersję Minecrafta.')
      : t('SlashClient sprawdzi na Modrinth, które mody mają wersję dla wybranego Minecrafta, i przeniesie profil jednym kliknięciem (najpierw zrobi migawkę). Mody, które nie są jeszcze gotowe, zostaną wyłączone i będą widoczne na liście.');
    const report: MoveReport | undefined = await guard(() => api.moveReport(profile.id));
    if (shown === profile.id) renderReport(report);
  }

  $('#move-target').addEventListener('change', () => {
    plan = undefined;
    $('#move-result').classList.add('hidden');
  });
  $('#move-check').addEventListener('click', async (e) => {
    const id = d.editing();
    const to = $<HTMLSelectElement>('#move-target').value;
    if (!id || !to) return;
    const found: MovePlan | undefined = await d.busy(e.currentTarget as HTMLButtonElement, () => guard(() => api.moveCheck(id, to)), t('Sprawdzam…'));
    if (!found || d.editing() !== id) return;
    plan = found;
    renderPlan(found);
  });
  $('#move-go').addEventListener('click', async (e) => {
    const id = d.editing();
    const p = plan;
    if (!id || !p) return;
    const button = e.currentTarget as HTMLButtonElement;
    const waiting = p.items.filter((i) => i.status === 'missing' || (i.status === 'unknown' && $<HTMLInputElement>('#move-disable-unknown').checked)).filter((i) => i.enabled);
    const ok = await confirmDialog({
      title: t('Przenieść profil na Minecraft {0}?', p.to),
      body: [
        el('p', { className: 'muted', textContent: t('Najpierw powstanie migawka profilu: z karty „Migawki profilu” wrócisz do wersji {0} jednym kliknięciem.', p.from) }),
        ...(waiting.length ? [el('p', { className: 'share-warn', textContent: t('Te mody zostaną wyłączone, bo nie są jeszcze gotowe: {0}.', waiting.map((i) => i.title).join(', ')) })] : []),
      ],
      ok: t('Przenieś'), okIcon: 'fa-right-left',
    });
    if (!ok) return;
    const report: MoveReport | undefined = await d.busy(button, () => guard(() => api.moveApply(id, p.to, { disableUnknown: $<HTMLInputElement>('#move-disable-unknown').checked })), t('Przenoszę…'));
    if (!report) return;
    plan = undefined;
    $('#move-result').classList.add('hidden');
    if (d.editing() === id) renderReport(report.pending.length || report.failedDeps?.length ? report : undefined);
  });
  $('#move-recheck').addEventListener('click', async (e) => {
    const id = d.editing();
    if (!id) return;
    const res: { report?: MoveReport; enabled: number } | undefined = await d.busy(e.currentTarget as HTMLButtonElement, () => guard(() => api.moveRecheck(id)), t('Sprawdzam…'));
    if (!res) return;
    d.toast(res.enabled ? t('Włączono mody, które mają już nową wersję: {0}.', res.enabled) : t('Żaden z czekających modów nie ma jeszcze nowej wersji.'));
    if (d.editing() === id) renderReport(res.report);
  });
  $('#move-dismiss').addEventListener('click', async () => {
    const id = d.editing();
    if (!id) return;
    await guard(() => api.moveDismiss(id));
    renderReport(undefined);
  });

  // a move (or a snapshot restore) finished: its list of waiting mods
  api.on('task:done', async ({ profileId }: { profileId?: string }) => {
    if (!profileId || profileId !== shown || d.editing() !== profileId) return;
    const report: MoveReport | undefined = await guard(() => api.moveReport(profileId));
    if (shown === profileId) renderReport(report);
  });

  return { render };
}
