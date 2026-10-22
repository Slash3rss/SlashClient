import { t } from '../shared/i18n';
import { ask } from './dialog';

/**
 * Profile snapshots (the card in a profile's settings), world export and import as .zip,
 * and datapacks per world (the panel under a world, the world picker for installing one).
 */

interface SnapshotInfo {
  id: string;
  createdAt: number;
  reason: 'update' | 'manual';
  label?: string;
  sizeBytes: number;
  files: number;
  profile: { versionId: string; loader: string; modpack?: { versionNumber: string; title: string } };
}
interface WorldZipSummary { name: string; folder: string; sizeBytes: number; files: number }
interface DatapackItem { filename: string; title: string; folder: boolean; sizeBytes: number; projectId?: string; versionNumber?: string; iconUrl?: string }
interface World { folder: string; name: string; version?: string; icon?: string }

export interface ProfileFilesDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  busy: <T>(button: HTMLButtonElement, work: () => Promise<T>, label?: string) => Promise<T>;
  fmtSize: (bytes: number) => string;
  fmtDate: (ms: number) => string;
  /** A picture for a project (Modrinth CDN only), or the launcher's logo. */
  projectIcon: (url?: string) => HTMLImageElement;
  /** The world's own icon.png, or the launcher's logo. */
  worldIcon: (world: World) => HTMLImageElement;
  /** The profile changed in the main process (a snapshot was restored): reload and redraw. */
  profileChanged: (profileId: string) => Promise<void>;
  /** Opens the content browser on datapacks for this profile. */
  browseDatapacks: (profileId: string) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function iconButton(icon: string, title: string, onClick: () => void, extra = '') {
  const b = el('button', { type: 'button', className: `icon-btn ${extra}`.trim(), title }, el('i', { className: icon }));
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}

export function createProfileFiles(deps: ProfileFilesDeps) {
  const { api, toast, guard, busy, fmtSize, fmtDate } = deps;

  // ---------- snapshots ----------

  let shownSnapshots: string | undefined;

  async function renderSnapshots(profileId: string, list: HTMLElement) {
    shownSnapshots = profileId;
    const snapshots: SnapshotInfo[] = (await guard(() => api.listSnapshots(profileId))) ?? [];
    // the player picked another profile meanwhile
    if (shownSnapshots !== profileId) return;
    if (!snapshots.length) {
      list.replaceChildren(el('p', { className: 'muted', textContent: t('Brak migawek. Pierwsza powstanie sama przed aktualizacją modpacka.') }));
      return;
    }
    list.replaceChildren(...snapshots.map((s) => {
      const title = s.reason === 'update' ? t('Przed aktualizacją modpacka') : t('Migawka ręczna');
      const restore = el('button', { type: 'button' }, el('i', { className: 'fa-solid fa-clock-rotate-left' }), t('Przywróć'));
      restore.addEventListener('click', async () => {
        if (!(await ask(t('Przywrócić migawkę z {0}? Foldery mods i config wrócą do stanu z tamtej chwili, a zmiany wprowadzone od tego czasu zostaną usunięte.', fmtDate(s.createdAt)), t('Przywróć'), { danger: true, okIcon: 'fa-rotate-left' }))) return;
        const done = await busy(restore, () => guard(() => api.restoreSnapshot(profileId, s.id)), t('Przywracam…'));
        if (!done) return;
        toast(t('Przywrócono migawkę z {0}.', fmtDate(s.createdAt)));
        await deps.profileChanged(profileId);
      });
      const remove = iconButton('fa-regular fa-trash-can', t('Usuń'), async () => {
        if (await ask(t('Usunąć migawkę z {0}?', fmtDate(s.createdAt)), t('Usuń'), { danger: true, okIcon: 'fa-trash-can' })) guard(() => api.deleteSnapshot(profileId, s.id)).then(() => renderSnapshots(profileId, list));
      }, 'danger');
      const pack = s.profile.modpack ? `${s.profile.modpack.title} ${s.profile.modpack.versionNumber}` : t('Minecraft {0}', s.profile.versionId);
      return el('div', { className: 'version-row' },
        el('div', {},
          el('b', { textContent: title }, ...(s.label ? [el('span', { className: 'tag', textContent: s.label })] : [])),
          el('div', { className: 'version-meta' },
            el('span', { textContent: fmtDate(s.createdAt) }),
            el('span', { textContent: pack }),
            el('span', { textContent: t('plików: {0}', s.files) }),
            el('span', { textContent: fmtSize(s.sizeBytes) }))),
        el('div', { className: 'actions' }, restore, remove));
    }));
  }

  async function makeSnapshot(profileId: string, button: HTMLButtonElement, list: HTMLElement) {
    const made = await busy(button, () => guard(() => api.createSnapshot(profileId)), t('Zapisuję…'));
    if (!made) return;
    toast(t('Zapisano migawkę ({0}).', fmtSize((made as SnapshotInfo).sizeBytes)));
    await renderSnapshots(profileId, list);
  }

  // ---------- worlds: export, import, datapacks ----------

  async function importWorld(profileId: string, button: HTMLButtonElement): Promise<boolean> {
    const picked: { key: string; summary: WorldZipSummary } | undefined = await busy(button, () => guard(() => api.pickWorldZip()));
    if (!picked) return false;
    const { name, sizeBytes, files } = picked.summary;
    if (!(await ask(t('Zaimportować świat „{0}” ({1}, plików: {2}) do tego profilu?', name, fmtSize(sizeBytes), files), t('Importuj'), { okIcon: 'fa-file-import' }))) return false;
    const folder = await busy(button, () => guard(() => api.importWorld(profileId, picked.key)), t('Importuję…'));
    return !!folder;
  }

  async function renderDatapacks(profileId: string, world: World, panel: HTMLElement) {
    const items: DatapackItem[] = (await guard(() => api.listDatapacks(profileId, world.folder))) ?? [];
    const add = el('button', { type: 'button' }, el('i', { className: 'fa-solid fa-magnifying-glass' }), t('Szukaj na Modrinth'));
    add.addEventListener('click', () => deps.browseDatapacks(profileId));
    const rows = items.map((d) => el('div', { className: 'version-row' },
      el('div', { className: 'datapack-main' }, deps.projectIcon(d.iconUrl),
        el('div', {},
          el('b', { textContent: d.title }),
          el('div', { className: 'version-meta' },
            el('span', { textContent: d.versionNumber ?? (d.folder ? t('folder') : d.filename) }),
            ...(d.sizeBytes ? [el('span', { textContent: fmtSize(d.sizeBytes) })] : [])))),
      el('div', { className: 'actions' }, iconButton('fa-regular fa-trash-can', t('Usuń'), async () => {
        if (!(await ask(t('Usunąć datapack {0} ze świata „{1}”?', d.title, world.name), t('Usuń'), { danger: true, okIcon: 'fa-trash-can' }))) return;
        guard(() => api.removeDatapack(profileId, world.folder, d.filename)).then(() => renderDatapacks(profileId, world, panel));
      }, 'danger'))));
    panel.replaceChildren(
      el('div', { className: 'datapack-head' }, el('b', { textContent: t('Datapacki w tym świecie') }), add),
      ...(rows.length ? rows : [el('p', { className: 'muted', textContent: t('Ten świat nie ma datapacków.') })]));
  }

  /** The world's own buttons in the Worlds list: export, and datapacks (a panel opening under `card`). */
  function worldButtons(profileId: string, world: World, card: HTMLElement): HTMLElement[] {
    const exportBtn = iconButton('fa-solid fa-file-export', t('Eksportuj świat (.zip)'), () => {
      busy(exportBtn, () => guard(() => api.exportWorld(profileId, world.folder)));
    });
    let panel: HTMLElement | undefined;
    const packs = iconButton('fa-solid fa-cubes', t('Datapacki'), () => {
      if (panel) {
        panel.remove();
        panel = undefined;
        packs.classList.remove('active');
        return;
      }
      panel = el('div', { className: 'datapack-panel glass-panel' }, el('p', { className: 'muted', textContent: t('Wczytywanie…') }));
      packs.classList.add('active');
      card.after(panel);
      renderDatapacks(profileId, world, panel);
    });
    return [exportBtn, packs];
  }

  /** Asks which world of the profile a datapack goes to; undefined when the player cancels. */
  async function pickWorld(profileId: string, title: string): Promise<string | undefined> {
    const worlds: World[] = (await guard(() => api.listWorlds(profileId))) ?? [];
    if (!worlds.length) {
      toast(t('Ten profil nie ma jeszcze żadnych światów. Stwórz świat w grze, a potem zainstaluj datapack.'), true);
      return undefined;
    }
    return new Promise((resolve) => {
      const close = iconButton('fa-solid fa-xmark', t('Zamknij'), () => done(undefined), 'modal-close');
      const modal = el('div', { className: 'modal' },
        el('div', { className: 'modal-box glass-panel versions-box' }, close,
          el('div', { className: 'modal-body' },
            el('h2', { textContent: t('Do którego świata?') }),
            el('p', { className: 'muted', textContent: t('Datapack „{0}” zadziała tylko w wybranym świecie.', title) }),
            el('div', { className: 'version-list' }, ...worlds.map((w) => {
              const pick = el('button', { type: 'button', className: 'primary' }, el('i', { className: 'fa-solid fa-download' }), t('Instaluj tutaj'));
              pick.addEventListener('click', () => done(w.folder));
              return el('div', { className: 'version-row' },
                el('div', { className: 'datapack-main' }, deps.worldIcon(w),
                  el('div', {}, el('b', { textContent: w.name }),
                    el('div', { className: 'version-meta' }, el('span', { textContent: w.folder }), ...(w.version ? [el('span', { textContent: t('Minecraft {0}', w.version) })] : [])))),
                el('div', { className: 'actions' }, pick));
            })))));
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done(undefined);
      function done(folder: string | undefined) {
        document.removeEventListener('keydown', onKey);
        modal.remove();
        resolve(folder);
      }
      modal.addEventListener('click', (e) => e.target === e.currentTarget && done(undefined));
      document.addEventListener('keydown', onKey);
      document.body.append(modal);
    });
  }

  return { renderSnapshots, makeSnapshot, importWorld, worldButtons, pickWorld };
}
