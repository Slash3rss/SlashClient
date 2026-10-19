import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadAll, fetchJson, sha1File, type ProgressFn } from './download';
import { contentFile, readManifest, writeManifest, type ManifestEntry } from './modrinth';
import type { Profile } from './store';
import { t } from '../shared/i18n';
import { USER_AGENT } from '../shared/version';

/**
 * Moving a profile to another Minecraft version. Every mod in mods/ is looked up on Modrinth by
 * its hash, then Modrinth is asked for the newest version of the same project for the target
 * game version and loader. Mods with such a version are swapped for it in one go (after a
 * snapshot, so the move is one click from undone); mods without one are disabled and listed,
 * so the player sees what is not ready yet and can check again later (the list stays in
 * .slashclient/version-move.json). Resource packs and shaders rarely depend on the version and stay.
 */

/** The parts of a Modrinth version this needs. */
export interface MoveVersion {
  id: string;
  project_id: string;
  version_number: string;
  version_type?: 'release' | 'beta' | 'alpha';
  game_versions: string[];
  loaders: string[];
  files: { url: string; filename: string; primary: boolean; size: number; hashes: { sha1: string } }[];
  dependencies?: { project_id: string | null; dependency_type: string }[];
}

/** A mod file in the profile's mods/ folder. */
export interface ModFile { filename: string; enabled: boolean; sha1: string }

/**
 * - ready: Modrinth has a version for the target, it replaces the file
 * - same: this very file already works on the target version
 * - missing: the project is on Modrinth but has nothing for the target yet
 * - unknown: Modrinth does not know the file (added by hand, from CurseForge…), nothing can be checked
 */
export type MoveStatus = 'ready' | 'same' | 'missing' | 'unknown';

export interface MoveItem {
  filename: string;
  enabled: boolean;
  title: string;
  status: MoveStatus;
  projectId?: string;
  iconUrl?: string;
  currentVersion?: string;
  /** The version the file is replaced with (status ready). */
  targetVersionId?: string;
  targetVersion?: string;
  /** The target version is a beta or alpha: Modrinth has no release for it yet. */
  prerelease?: boolean;
}

export interface MovePlan { from: string; to: string; loader: string; items: MoveItem[] }

/** Loaders whose mods a profile runs: Quilt also loads Fabric mods. */
export const modLoaders = (loader: string): string[] => (loader === 'quilt' ? ['quilt', 'fabric'] : [loader]);

const fits = (v: MoveVersion | undefined, gameVersion: string, loaders: string[]) =>
  !!v && v.game_versions.includes(gameVersion) && v.loaders.some((l) => loaders.includes(l));

/**
 * What happens to each mod. `current` is what Modrinth says each file (by SHA1) is, `target` the
 * newest version of its project for the target game version and loader (Modrinth's
 * version_files/update answer), `projects` the titles and icons by project id.
 */
export function planMove(
  files: ModFile[], current: Record<string, MoveVersion>, target: Record<string, MoveVersion>,
  to: string, loader: string, projects: Map<string, { title: string; iconUrl?: string }> = new Map(),
): MoveItem[] {
  const loaders = modLoaders(loader);
  const items = files.map((f): MoveItem => {
    const now = current[f.sha1];
    const base = { filename: f.filename, enabled: f.enabled, title: f.filename.replace(/\.jar$/i, '') };
    if (!now) return { ...base, status: 'unknown' };
    const project = projects.get(now.project_id);
    const known = { ...base, title: project?.title ?? base.title, projectId: now.project_id, iconUrl: project?.iconUrl, currentVersion: now.version_number };
    const next = target[f.sha1];
    if (fits(next, to, loaders) && next!.id !== now.id) {
      return { ...known, status: 'ready', targetVersionId: next!.id, targetVersion: next!.version_number, ...(next!.version_type && next!.version_type !== 'release' ? { prerelease: true } : {}) };
    }
    if (fits(now, to, loaders)) return { ...known, status: 'same' };
    return { ...known, status: 'missing' };
  });
  // what needs the player's attention first, then by name
  const order: Record<MoveStatus, number> = { missing: 0, unknown: 1, ready: 2, same: 3 };
  return items.sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title, 'pl'));
}

/** How many mods of each kind; the page shows it above the list. */
export function moveCounts(items: MoveItem[]): Record<MoveStatus, number> {
  const counts: Record<MoveStatus, number> = { ready: 0, same: 0, missing: 0, unknown: 0 };
  for (const i of items) counts[i.status]++;
  return counts;
}

/**
 * Required dependencies of the new versions that the profile does not have: their project ids.
 * `have` are the projects the profile keeps (moved, already fitting).
 */
export function missingDependencies(versions: MoveVersion[], have: Set<string>): string[] {
  const out = new Set<string>();
  for (const v of versions) {
    for (const d of v.dependencies ?? []) if (d.dependency_type === 'required' && d.project_id && !have.has(d.project_id)) out.add(d.project_id);
  }
  return [...out];
}

// ---------- talking to Modrinth ----------

const API = 'https://api.modrinth.com/v2';
const HEADERS = { 'User-Agent': USER_AGENT };

/** Modrinth's answers, replaceable in tests. */
export interface MoveSource {
  /** What each file is, by SHA1. */
  identify: (sha1s: string[]) => Promise<Record<string, MoveVersion>>;
  /** The newest version of each file's project for the game version and loaders, by SHA1; `types` limits how stable. */
  newest: (sha1s: string[], gameVersion: string, loaders: string[], types: string[]) => Promise<Record<string, MoveVersion>>;
  projects: (ids: string[]) => Promise<{ id: string; title: string; icon_url?: string }[]>;
}

const post = <T>(url: string, body: unknown) =>
  fetchJson<T>(url, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const modrinthSource: MoveSource = {
  identify: (hashes) => (hashes.length ? post(`${API}/version_files`, { hashes, algorithm: 'sha1' }) : Promise.resolve({})),
  newest: (hashes, gameVersion, loaders, types) => (hashes.length
    ? post(`${API}/version_files/update`, { hashes, algorithm: 'sha1', loaders, game_versions: [gameVersion], version_types: types })
    : Promise.resolve({})),
  projects: (ids) => (ids.length ? fetchJson(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`, { headers: HEADERS }) : Promise.resolve([])),
};

/** Mods in mods/, enabled and disabled, with their SHA1. */
export async function modFiles(gameDir: string, only?: Set<string>): Promise<ModFile[]> {
  const dir = path.join(gameDir, 'mods');
  const out: ModFile[] = [];
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    if (name.startsWith('.') || !/\.jar(\.disabled)?$/i.test(name)) continue;
    const filename = name.replace(/\.disabled$/, '');
    if (only && !only.has(filename)) continue;
    out.push({ filename, enabled: !name.endsWith('.disabled'), sha1: await sha1File(path.join(dir, name)) });
  }
  return out;
}

/** A plan with Modrinth's answers behind it (by SHA1), which applyMove needs; the page only gets `plan`. */
export interface CheckedMove { plan: MovePlan; current: Record<string, MoveVersion>; target: Record<string, MoveVersion> }

/** Asks Modrinth about every mod (or the `only` ones): releases first, then betas and alphas for what has no release. */
export async function checkMove(gameDir: string, from: string, to: string, loader: string, source: MoveSource = modrinthSource, only?: Set<string>): Promise<CheckedMove> {
  const files = await modFiles(gameDir, only);
  const sha1s = [...new Set(files.map((f) => f.sha1))];
  const current = await source.identify(sha1s);
  const known = sha1s.filter((h) => current[h]);
  const loaders = modLoaders(loader);
  const target = await source.newest(known, to, loaders, ['release']);
  const rest = known.filter((h) => !fits(target[h], to, loaders) && !fits(current[h], to, loaders));
  Object.assign(target, await source.newest(rest, to, loaders, ['release', 'beta', 'alpha']));
  const ids = [...new Set(known.map((h) => current[h].project_id))];
  const projects = new Map((await source.projects(ids).catch(() => [])).map((p) => [p.id, { title: p.title, iconUrl: p.icon_url }]));
  return { plan: { from, to, loader, items: planMove(files, current, target, to, loader, projects) }, current, target };
}

// ---------- moving ----------

/** What a move left for later: kept in the profile's folder, shown on the profile's card. */
export interface MoveReport {
  from: string;
  to: string;
  at: number;
  moved: number;
  /** Mods disabled because they have no version for `to` yet (or could not be checked). */
  pending: { filename: string; title: string; status: 'missing' | 'unknown'; projectId?: string }[];
  /** Required dependencies of the new versions that could not be installed. */
  failedDeps?: string[];
}

const reportFile = (gameDir: string) => path.join(gameDir, '.slashclient', 'version-move.json');

export async function readMoveReport(gameDir: string): Promise<MoveReport | undefined> {
  try {
    return JSON.parse(await fs.readFile(reportFile(gameDir), 'utf8')) as MoveReport;
  } catch {
    return undefined;
  }
}

async function writeMoveReport(gameDir: string, report: MoveReport | undefined): Promise<void> {
  if (!report || (!report.pending.length && !report.failedDeps?.length)) {
    await fs.rm(reportFile(gameDir), { force: true });
    return;
  }
  await fs.mkdir(path.dirname(reportFile(gameDir)), { recursive: true });
  await fs.writeFile(reportFile(gameDir), JSON.stringify(report, null, 2));
}

export interface ApplyOptions {
  gameDir: string;
  checked: CheckedMove;
  /** Also disable mods Modrinth does not know (they may not work on the new version). */
  disableUnknown: boolean;
  /** Mods to turn on when they fit now (the pending ones of an earlier move); others keep their state. */
  enable?: Set<string>;
  /** Installs a required dependency the new versions need; answers its title. */
  installDependency: (projectId: string) => Promise<string>;
  onProgress?: (stage: string, done: number, total: number) => void;
  /** Downloads, replaceable in tests. */
  download?: (tasks: { url: string; dest: string; sha1: string; size: number }[], onProgress?: ProgressFn) => Promise<void>;
}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

/**
 * Swaps the mods for their versions for `plan.to` and disables those without one. The profile's
 * game version is changed by the caller, after this succeeds; a snapshot is taken before.
 */
export async function applyMove(opts: ApplyOptions): Promise<MoveReport> {
  const { gameDir } = opts;
  const { plan, target } = opts.checked;
  const download = opts.download ?? ((tasks, onProgress) => downloadAll(tasks, onProgress, { verifyHash: true }).then(() => {}));
  const files = await modFiles(gameDir);
  const byName = new Map(files.map((f) => [f.filename, f]));
  const manifest = await readManifest(gameDir);
  const ready = plan.items.filter((i) => i.status === 'ready');
  let done = 0;
  const moved: MoveVersion[] = [];
  for (const item of ready) {
    opts.onProgress?.(t('Pobieranie nowych wersji modów'), done++, ready.length);
    const f = byName.get(item.filename);
    const next = f && target[f.sha1];
    if (!f || !next) continue;
    const file = next.files.find((x) => x.primary) ?? next.files[0];
    if (!file) continue;
    const filename = path.basename(file.filename);
    const dest = contentFile(gameDir, 'mod', filename);
    const old = contentFile(gameDir, 'mod', item.filename);
    // downloaded aside first: a failed download leaves the old file where it was
    const tmp = path.join(gameDir, 'mods', `.move-${filename}`);
    await download([{ url: file.url, dest: tmp, sha1: file.hashes.sha1, size: file.size }]);
    await fs.rm(old, { force: true });
    await fs.rm(`${old}.disabled`, { force: true });
    const on = f.enabled || !!opts.enable?.has(item.filename);
    await fs.rename(tmp, on ? dest : `${dest}.disabled`);
    const entry: ManifestEntry = {
      type: 'mod', filename, projectId: next.project_id, versionId: next.id, versionNumber: next.version_number,
      title: item.title, ...(item.iconUrl ? { iconUrl: item.iconUrl } : {}),
    };
    const at = manifest.findIndex((m) => m.type === 'mod' && (m.filename === item.filename || m.projectId === next.project_id));
    if (at >= 0) manifest[at] = entry;
    else manifest.push(entry);
    moved.push(next);
  }
  await writeManifest(gameDir, manifest);

  const pending: MoveReport['pending'] = [];
  for (const item of plan.items) {
    const file = contentFile(gameDir, 'mod', item.filename);
    if (item.status === 'same' && opts.enable?.has(item.filename) && await exists(`${file}.disabled`)) await fs.rename(`${file}.disabled`, file);
    if (item.status !== 'missing' && !(item.status === 'unknown' && opts.disableUnknown)) continue;
    if (await exists(file)) await fs.rename(file, `${file}.disabled`);
    // only what was on (or waited from an earlier move) is waiting: a mod the player had off stays theirs
    if (byName.get(item.filename)?.enabled || opts.enable?.has(item.filename)) {
      pending.push({ filename: item.filename, title: item.title, status: item.status, ...(item.projectId ? { projectId: item.projectId } : {}) });
    }
  }

  // libraries the new versions need (e.g. a new Fabric API module)
  const have = new Set(plan.items.filter((i) => i.projectId && (i.status === 'ready' || i.status === 'same')).map((i) => i.projectId!));
  for (const m of manifest) if (m.type === 'mod') have.add(m.projectId);
  const failedDeps: string[] = [];
  for (const id of missingDependencies(moved, have)) {
    await opts.installDependency(id).catch(() => failedDeps.push(id));
  }
  return { from: plan.from, to: plan.to, at: Date.now(), moved: moved.length, pending, ...(failedDeps.length ? { failedDeps } : {}) };
}

/** Saves what a move (or a later check) left waiting; an empty list clears it. */
export async function saveMoveReport(gameDir: string, report: MoveReport, previous?: MoveReport): Promise<MoveReport> {
  // a recheck keeps the original move's versions and adds nothing new to wait for
  const merged = previous && previous.to === report.to ? { ...report, from: previous.from, moved: previous.moved + report.moved } : report;
  await writeMoveReport(gameDir, merged);
  return merged;
}

/** The Minecraft versions a profile can move to: releases other than the current one, newest first. */
export function moveTargets(versions: { id: string; type: string }[], current: string): string[] {
  return versions.filter((v) => v.type === 'release' && v.id !== current).map((v) => v.id);
}

// ---------- the launcher's side (IPC) ----------

type Handle = <T extends unknown[], R>(channel: string, fn: (...args: T) => Promise<R> | R) => void;
type Stage = (stage: string, done: number, total: number) => void;

export interface MoveDeps {
  handle: Handle;
  profiles: () => Profile[];
  gameDir: (profile: Profile) => string;
  running: (profileId: string) => boolean;
  persist: () => Promise<void>;
  startTask: (title: string) => { progress: Stage; finish: (ok: boolean, message: string, profileId?: string) => void };
  /** "latest-release" and the like as an exact version. */
  resolveVersion: (versionId: string) => Promise<string>;
  /** Whether the loader has a build for that game version. */
  loaderSupports: (loader: Profile['loader'], gameVersion: string) => Promise<boolean>;
  snapshot: (profile: Profile, label: string) => Promise<unknown>;
  /** Installs a mod (newest fitting version) with its dependencies; answers the titles. */
  installMod: (gameDir: string, projectId: string, gameVersion: string, loader: string) => Promise<string[]>;
}

/** Checked plans kept for the move that follows, per profile (the page only holds the list). */
const CHECK_TTL_MS = 15 * 60_000;

export function registerVersionMove(deps: MoveDeps): void {
  const { handle } = deps;
  const checked = new Map<string, { at: number; check: CheckedMove }>();
  const busy = new Set<string>();
  const profileById = (id: string) => {
    const profile = deps.profiles().find((p) => p.id === id);
    if (!profile) throw new Error(t('Nie znaleziono profilu.'));
    return profile;
  };
  const usable = (profile: Profile) => {
    if (profile.modpack) throw new Error(t('Ten profil pochodzi z modpacka: zmień wersję modpacka, a on sam przeniesie się na inną wersję Minecrafta.'));
    if (deps.running(profile.id)) throw new Error(t('Zamknij grę tego profilu przed zmianą wersji.'));
  };
  async function locked<T>(profileId: string, work: () => Promise<T>): Promise<T> {
    if (busy.has(profileId)) throw new Error(t('Ten profil właśnie zmienia wersję.'));
    busy.add(profileId);
    try {
      return await work();
    } finally {
      busy.delete(profileId);
    }
  }
  /** The report of the last move, as long as the profile is still on that version. */
  async function currentReport(profile: Profile): Promise<MoveReport | undefined> {
    const report = await readMoveReport(deps.gameDir(profile));
    return report && report.to === (await deps.resolveVersion(profile.versionId)) ? report : undefined;
  }

  handle('move:check', async (profileId: string, to: string) => {
    const profile = profileById(profileId);
    usable(profile);
    if (typeof to !== 'string' || !/^[\w.-]{1,40}$/.test(to)) throw new Error(t('Wybierz wersję Minecrafta.'));
    const from = await deps.resolveVersion(profile.versionId);
    if (profile.loader !== 'vanilla' && !(await deps.loaderSupports(profile.loader, to))) {
      throw new Error(t('{0} nie ma jeszcze wersji dla Minecrafta {1}.', profile.loader, to));
    }
    const check = await checkMove(deps.gameDir(profile), from, to, profile.loader);
    checked.set(profileId, { at: Date.now(), check });
    return check.plan;
  });

  handle('move:apply', async (profileId: string, to: string, opts?: { disableUnknown?: boolean }) => {
    const profile = profileById(profileId);
    usable(profile);
    return locked(profileId, async () => {
      const gameDir = deps.gameDir(profile);
      const from = await deps.resolveVersion(profile.versionId);
      const task = deps.startTask(t('Przenoszenie {0} na Minecraft {1}', profile.name, to));
      try {
        let entry = checked.get(profileId);
        if (!entry || entry.check.plan.to !== to || entry.check.plan.from !== from || Date.now() - entry.at > CHECK_TTL_MS) {
          task.progress(t('Sprawdzanie modów'), 0, 1);
          entry = { at: Date.now(), check: await checkMove(gameDir, from, to, profile.loader) };
        }
        checked.delete(profileId);
        // the whole profile as it is now, one click from undone
        task.progress(t('Zapisywanie migawki profilu'), 0, 1);
        await deps.snapshot(profile, t('Przed przeniesieniem: {0} → {1}', from, to));
        const report = await applyMove({
          gameDir, checked: entry.check, disableUnknown: opts?.disableUnknown !== false,
          installDependency: async (id) => (await deps.installMod(gameDir, id, to, profile.loader)).join(', '),
          onProgress: task.progress,
        });
        profile.versionId = to;
        // loader builds are made per game version: the newest stable one for the new version
        if (profile.loader !== 'vanilla') profile.loaderVersion = '';
        await deps.persist();
        const saved = await saveMoveReport(gameDir, report);
        const waiting = saved.pending.length ? ` ${t('Czeka na nowe wersje: {0}.', saved.pending.length)}` : '';
        task.finish(true, t('Profil {0} jest teraz na Minecrafcie {1}. Przeniesione mody: {2}.', profile.name, to, saved.moved) + waiting, profile.id);
        return saved;
      } catch (err) {
        task.finish(false, t('Nie udało się przenieść profilu: {0}', (err as Error).message));
        throw err;
      }
    });
  });

  handle('move:report', async (profileId: string) => currentReport(profileById(profileId)));
  handle('move:dismiss', async (profileId: string) => fs.rm(path.join(deps.gameDir(profileById(profileId)), '.slashclient', 'version-move.json'), { force: true }));

  /** Checks the mods a move left waiting: those that got a version are updated and turned on. */
  handle('move:recheck', async (profileId: string) => {
    const profile = profileById(profileId);
    if (deps.running(profileId)) throw new Error(t('Zamknij grę tego profilu przed zmianą wersji.'));
    return locked(profileId, async () => {
      const gameDir = deps.gameDir(profile);
      const report = await currentReport(profile);
      if (!report) return { report: undefined, enabled: 0 };
      // the ones the player turned on by hand meanwhile are theirs now
      const still = new Set<string>();
      for (const p of report.pending) {
        if (await exists(`${contentFile(gameDir, 'mod', p.filename)}.disabled`)) still.add(p.filename);
      }
      const check = await checkMove(gameDir, report.from, report.to, profile.loader, modrinthSource, still);
      const next = await applyMove({
        gameDir, checked: check, disableUnknown: true, enable: still,
        installDependency: async (id) => (await deps.installMod(gameDir, id, report.to, profile.loader)).join(', '),
      });
      const saved = await saveMoveReport(gameDir, next, report);
      return { report: saved.pending.length || saved.failedDeps?.length ? saved : undefined, enabled: still.size - next.pending.length };
    });
  });
}
