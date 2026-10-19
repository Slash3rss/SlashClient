import { locale, t } from '../shared/i18n';

/**
 * Sharing a profile by code (the "Udostępnij kodem" window) and getting one from a code (the
 * "Importuj profil" window). The packing, the secret search and the server live in the main
 * process (src/main/profileShare.ts); this is only the page.
 */

type PackPart = 'mods' | 'resourcepacks' | 'shaderpacks' | 'config' | 'options' | 'servers' | 'worlds' | 'settings';
interface SecretHit { rel: string; part: PackPart; keys: string[] }
interface SharedProfile { code: string; name: string; gameVersion: string; loader: string; size: number; downloads: number; createdAt: number; expiresAt: number; ownerHandle?: string | null }

export interface ShareDeps {
  api: any;
  $: <T extends HTMLElement = HTMLElement>(sel: string) => T;
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Partial<HTMLElementTagNameMap[K]>, ...children: (Node | string)[]) => HTMLElementTagNameMap[K];
  guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  toast: (message: string, isError?: boolean) => void;
  skeletons: (kind: 'project', n: number) => HTMLElement[];
  packPartRows: (list: HTMLElement, counts: Partial<Record<PackPart, number>>, chosen: Set<PackPart>, onChange: () => void) => void;
  /** Opens the usual import window for a pack the main process holds under `key`. */
  showPackImport: (picked: { key: string; summary: any }, from?: string) => void;
  /** The profile open in the editor. */
  editing: () => string | undefined;
}

/** Not ticked unless the player wants them: game settings and the server list are personal, worlds are big. */
const OFF_BY_DEFAULT: PackPart[] = ['options', 'servers', 'worlds'];

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
const day = (at: number) => new Date(at).toLocaleDateString(locale(), { dateStyle: 'medium' });
const megabytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

export function initProfileSharing(d: ShareDeps) {
  const { api, $, el, guard } = d;
  let sharingId: string | undefined;
  const chosen = new Set<PackPart>();
  let secrets: SecretHit[] = [];
  /** Files with a likely secret that the player ticked to send anyway. */
  const included = new Set<string>();
  let scanRun = 0;

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(formatCode(code));
    d.toast(t('Skopiowano kod {0}.', formatCode(code)));
  };

  async function renderMine() {
    const list = $('#share-list');
    let shares: SharedProfile[];
    try {
      shares = await api.listShares();
    } catch (err) {
      list.replaceChildren(el('p', { className: 'muted', textContent: String((err as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }));
      return;
    }
    if (!shares.length) {
      list.replaceChildren(el('p', { className: 'muted', textContent: t('Nie masz jeszcze udostępnionych profili.') }));
      return;
    }
    list.replaceChildren(...shares.map((s) => {
      const copyBtn = el('button', { type: 'button', className: 'icon-btn', title: t('Kopiuj kod') }, el('i', { className: 'fa-regular fa-copy' }));
      copyBtn.addEventListener('click', () => void copy(s.code));
      const del = el('button', { type: 'button', className: 'icon-btn danger', title: t('Usuń kod') }, el('i', { className: 'fa-regular fa-trash-can' }));
      del.addEventListener('click', async () => {
        del.disabled = true;
        await guard(() => api.deleteShare(s.code));
        await renderMine();
      });
      const meta = [`Minecraft ${s.gameVersion}`, s.loader !== 'vanilla' ? s.loader : '', megabytes(s.size), t('wygasa {0}', day(s.expiresAt)), t('pobrań: {0}', s.downloads)];
      return el('div', { className: 'join-choice share-mine' },
        el('span', { className: 'share-code-small', textContent: formatCode(s.code) }),
        el('div', { className: 'grow' }, s.name || formatCode(s.code), el('small', { textContent: meta.filter(Boolean).join(' · ') })),
        copyBtn, del);
    }));
  }

  /** Looks for passwords and tokens in what the chosen parts would send. */
  async function rescan() {
    const run = ++scanRun;
    const found: SecretHit[] = (await guard(() => api.shareScan(sharingId!, [...chosen]))) ?? [];
    if (run !== scanRun) return;
    secrets = found;
    $('#share-secrets').classList.toggle('hidden', !secrets.length);
    $('#share-secret-list').replaceChildren(...secrets.map((s) => {
      const box = el('input', { type: 'checkbox', checked: included.has(s.rel) });
      const row = el('label', { className: `join-choice perf-choice${box.checked ? ' selected' : ''}` });
      box.addEventListener('change', () => {
        if (box.checked) included.add(s.rel);
        else included.delete(s.rel);
        row.classList.toggle('selected', box.checked);
      });
      row.append(box, el('i', { className: 'fa-solid fa-key pack-part-icon' }), el('div', { className: 'grow' }, s.rel, el('small', { textContent: t('Ustawienia: {0}', s.keys.join(', ')) })));
      return row;
    }));
  }

  function closeShare() {
    $('#share-modal').classList.add('hidden');
    sharingId = undefined;
  }

  $('#profile-share').addEventListener('click', async () => {
    const id = d.editing();
    if (!id) return;
    sharingId = id;
    included.clear();
    secrets = [];
    $('#share-form').classList.remove('hidden');
    $('#share-result').classList.add('hidden');
    $('#share-secrets').classList.add('hidden');
    $('#share-parts').replaceChildren(...d.skeletons('project', 3));
    $('#share-list').replaceChildren(...d.skeletons('project', 1));
    $<HTMLButtonElement>('#share-go').disabled = true;
    $('#share-modal').classList.remove('hidden');
    void renderMine();
    const counts: Record<PackPart, number> | undefined = await guard(() => api.exportPreview(id));
    if (!counts) return closeShare();
    chosen.clear();
    for (const part of Object.keys(counts) as PackPart[]) if (counts[part] && !OFF_BY_DEFAULT.includes(part)) chosen.add(part);
    const sync = () => ($<HTMLButtonElement>('#share-go').disabled = !chosen.size && Object.values(counts).some(Boolean));
    d.packPartRows($('#share-parts'), counts, chosen, () => {
      sync();
      void rescan();
    });
    sync();
    await rescan();
  });

  $('#share-go').addEventListener('click', async () => {
    const id = sharingId;
    if (!id) return;
    const go = $<HTMLButtonElement>('#share-go');
    go.disabled = true;
    const skip = secrets.filter((s) => !included.has(s.rel)).map((s) => s.rel);
    const share: SharedProfile | undefined = await guard(() => api.shareProfile(id, [...chosen], skip));
    go.disabled = false;
    if (!share || sharingId !== id) return;
    $('#share-form').classList.add('hidden');
    $('#share-result').classList.remove('hidden');
    $('#share-code').textContent = formatCode(share.code);
    $('#share-result').dataset.code = share.code;
    void renderMine();
  });
  $('#share-copy').addEventListener('click', () => {
    const code = $('#share-result').dataset.code;
    if (code) void copy(code);
  });
  $('#share-cancel').addEventListener('click', closeShare);
  $('#share-close').addEventListener('click', closeShare);
  $('#share-modal').addEventListener('click', (e) => e.target === e.currentTarget && closeShare());

  // ---- importing: a file or a code ----

  const closeSource = () => $('#pack-source-modal').classList.add('hidden');
  $('#pack-source-file').addEventListener('click', async () => {
    closeSource();
    const picked = await guard(() => api.pickProfilePack());
    if (picked) d.showPackImport(picked as { key: string; summary: unknown });
  });
  $('#pack-source-code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('#pack-source-code');
    const go = $<HTMLButtonElement>('#pack-source-code-go');
    go.disabled = true;
    const res: { key: string; summary: unknown; share: SharedProfile } | undefined = await guard(() => api.importByCode(input.value));
    go.disabled = false;
    if (!res) return;
    closeSource();
    const by = res.share.ownerHandle ? t('Profil udostępnił {0}, kod ważny do {1}.', res.share.ownerHandle, day(res.share.expiresAt)) : t('Kod ważny do {0}.', day(res.share.expiresAt));
    d.showPackImport(res, by);
  });
  $('#pack-source-close').addEventListener('click', closeSource);
  $('#pack-source-modal').addEventListener('click', (e) => e.target === e.currentTarget && closeSource());
}
