import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { downloadAll, fetchJson, sha1File, type ProgressFn } from './download';
import { t } from '../shared/i18n';
import { USER_AGENT } from '../shared/version';

const API = 'https://api.modrinth.com/v2';
// Modrinth asks every client to identify itself.
const HEADERS = { 'User-Agent': USER_AGENT };

export type ContentType = 'mod' | 'resourcepack' | 'shader';
export type ProjectType = ContentType | 'modpack';

export const FOLDERS: Record<ContentType, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };

const get = <T>(url: string) => fetchJson<T>(url, { headers: HEADERS });
const post = <T>(url: string, body: unknown) =>
  fetchJson<T>(url, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export interface ProjectHit {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl?: string;
  downloads: number;
  categories: string[];
  /** The project's page, for CurseForge projects (Modrinth's is built from the slug). */
  pageUrl?: string;
  /** CurseForge only: the author allows downloads only from CurseForge's site. */
  manualOnly?: boolean;
}

export interface SearchOptions {
  query: string;
  type: ProjectType;
  gameVersion?: string;
  loader?: string;
  offset?: number;
}

export async function search({ query, type, gameVersion, loader, offset = 0 }: SearchOptions): Promise<{ hits: ProjectHit[]; total: number }> {
  const facets: string[][] = [[`project_type:${type}`]];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  // loaders only matter for mods and modpacks
  if (loader && (type === 'mod' || type === 'modpack')) facets.push([`categories:${loader}`]);
  const params = new URLSearchParams({
    query,
    facets: JSON.stringify(facets),
    limit: '20',
    offset: String(offset),
    index: query ? 'relevance' : 'downloads',
  });
  const res = await get<{ hits: Record<string, any>[]; total_hits: number }>(`${API}/search?${params}`);
  return {
    total: res.total_hits,
    hits: res.hits.map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      iconUrl: h.icon_url || undefined,
      downloads: h.downloads,
      categories: h.display_categories ?? h.categories ?? [],
    })),
  };
}

interface ModrinthFile { url: string; filename: string; primary: boolean; size: number; hashes: { sha1: string; sha512?: string } }
interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: 'release' | 'beta' | 'alpha';
  date_published: string;
  game_versions: string[];
  loaders: string[];
  downloads: number;
  files: ModrinthFile[];
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: string }[];
}

/** One version of a project, as shown in the version picker. */
export interface VersionInfo {
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  type: 'release' | 'beta' | 'alpha';
  date: string;
  gameVersions: string[];
  loaders: string[];
  downloads: number;
  /** CurseForge only: the author does not allow downloads outside CurseForge, so this file is fetched by hand from this page. */
  manualUrl?: string;
}

const toInfo = (v: ModrinthVersion): VersionInfo => ({
  id: v.id, projectId: v.project_id, name: v.name, versionNumber: v.version_number, type: v.version_type,
  date: v.date_published, gameVersions: v.game_versions, loaders: v.loaders, downloads: v.downloads,
});

/** Loaders Modrinth uses for each kind of content, for compatibility filters. */
function loadersFor(type: ContentType, loader?: string): string[] | undefined {
  if (type === 'mod') return loader ? [loader] : undefined;
  if (type === 'resourcepack') return ['minecraft'];
  return ['iris', 'optifine', 'canvas', 'vanilla'];
}

/** Versions of a project, newest first; optionally only those for this game version / loader. */
export async function listVersions(projectId: string, filter: { gameVersion?: string; loaders?: string[] } = {}): Promise<VersionInfo[]> {
  const params = new URLSearchParams();
  if (filter.gameVersion) params.set('game_versions', JSON.stringify([filter.gameVersion]));
  if (filter.loaders) params.set('loaders', JSON.stringify(filter.loaders));
  const versions = await get<ModrinthVersion[]>(`${API}/project/${projectId}/version?${params}`);
  return versions.map(toInfo);
}

export async function listContentVersions(projectId: string, type: ProjectType, gameVersion?: string, loader?: string): Promise<VersionInfo[]> {
  if (type === 'modpack') return listVersions(projectId);
  return listVersions(projectId, { gameVersion, loaders: loadersFor(type, loader) });
}

/** Newest version of a project that fits the game version (and loader, for mods). */
async function pickVersion(projectId: string, gameVersion: string, loader?: string): Promise<ModrinthVersion> {
  const params = new URLSearchParams({ game_versions: JSON.stringify([gameVersion]) });
  if (loader) params.set('loaders', JSON.stringify([loader]));
  const versions = await get<ModrinthVersion[]>(`${API}/project/${projectId}/version?${params}`);
  if (!versions.length) throw new Error(t('Brak wersji dla Minecraft {0}{1}.', gameVersion, loader ? ` (${loader})` : ''));
  return versions[0];
}

/**
 * A project (by slug or id) that has a version for this game version and loader,
 * or undefined when it doesn't exist or doesn't fit.
 */
export async function findFitting(slugOrId: string, gameVersion: string, loader?: string): Promise<{ projectId: string; slug: string; title: string; iconUrl?: string } | undefined> {
  try {
    const project = await get<{ id: string; slug: string; title: string; icon_url?: string; project_type: string }>(`${API}/project/${encodeURIComponent(slugOrId)}`);
    if (project.project_type !== 'mod') return undefined;
    await pickVersion(project.id, gameVersion, loader);
    return { projectId: project.id, slug: project.slug, title: project.title, iconUrl: project.icon_url };
  } catch {
    return undefined;
  }
}

/**
 * The newest fitting file of a mod, kept in `dir` (outside any mods/ folder) and reused
 * while it is still the newest. Without a connection the copy already there is used.
 */
export async function cachedModFile(slugOrId: string, gameVersion: string, loader: string, dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const present = (await fs.readdir(dir)).filter((f) => f.endsWith('.jar'));
  let version: ModrinthVersion;
  try {
    version = await pickVersion(slugOrId, gameVersion, loader);
  } catch (err) {
    if (present[0]) return path.join(dir, present[0]);
    throw err;
  }
  const file = version.files.find((f) => f.primary) ?? version.files[0];
  const dest = path.join(dir, path.basename(file.filename));
  if (!(present.includes(path.basename(dest)) && (await sha1File(dest)) === file.hashes.sha1)) {
    await downloadAll([{ url: file.url, dest, sha1: file.hashes.sha1, size: file.size }], undefined, { verifyHash: true });
  }
  // only one version in the folder, or Fabric would see the mod twice
  for (const f of present) if (f !== path.basename(dest)) await fs.rm(path.join(dir, f), { force: true });
  return dest;
}

/** Mod ids that are already installed (by Modrinth project id), so a pack doesn't reinstall them. */
export async function installedProjectIds(gameDir: string): Promise<Set<string>> {
  return new Set((await readManifest(gameDir)).map((m) => m.projectId));
}

// ---------- installed content, tracked per instance ----------

export interface InstalledItem {
  type: ContentType;
  filename: string;
  enabled: boolean;
  title: string;
  projectId?: string;
  versionId?: string;
  versionNumber?: string;
  iconUrl?: string;
  /** Where projectId/versionId come from; Modrinth when unset. */
  source?: 'curseforge';
}

export interface ManifestEntry { type: ContentType; filename: string; projectId: string; versionId: string; versionNumber: string; title: string; iconUrl?: string; source?: 'curseforge' }

const manifestPath = (gameDir: string) => path.join(gameDir, '.slashclient', 'content.json');

export async function readManifest(gameDir: string): Promise<ManifestEntry[]> {
  try {
    return JSON.parse(await fs.readFile(manifestPath(gameDir), 'utf8'));
  } catch {
    return [];
  }
}

export async function writeManifest(gameDir: string, entries: ManifestEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(manifestPath(gameDir)), { recursive: true });
  await fs.writeFile(manifestPath(gameDir), JSON.stringify(entries, null, 2));
}

/** Everything in mods/, resourcepacks/ and shaderpacks/, including files added by hand. */
export async function listInstalled(gameDir: string): Promise<InstalledItem[]> {
  const manifest = await readManifest(gameDir);
  const out: InstalledItem[] = [];
  for (const [type, folder] of Object.entries(FOLDERS) as [ContentType, string][]) {
    const files = await fs.readdir(path.join(gameDir, folder)).catch(() => [] as string[]);
    for (const file of files) {
      if (file.startsWith('.')) continue;
      const enabled = !file.endsWith('.disabled');
      const filename = file.replace(/\.disabled$/, '');
      const entry = manifest.find((m) => m.type === type && m.filename === filename);
      out.push({ type, filename, enabled, title: entry?.title ?? filename.replace(/\.(jar|zip)$/, ''), projectId: entry?.projectId, versionId: entry?.versionId, versionNumber: entry?.versionNumber, iconUrl: entry?.iconUrl, source: entry?.source });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, 'pl'));
}

/** Only bare file names inside the content folders are accepted, never paths. */
export function contentFile(gameDir: string, type: ContentType, filename: string): string {
  if (!FOLDERS[type] || filename !== path.basename(filename) || filename.startsWith('.')) throw new Error('Nieprawidłowa nazwa pliku');
  return path.join(gameDir, FOLDERS[type], filename);
}

export async function setEnabled(gameDir: string, type: ContentType, filename: string, enabled: boolean): Promise<void> {
  const file = contentFile(gameDir, type, filename);
  if (enabled) await fs.rename(`${file}.disabled`, file);
  else await fs.rename(file, `${file}.disabled`);
}

export async function removeContent(gameDir: string, type: ContentType, filename: string): Promise<void> {
  const file = contentFile(gameDir, type, filename);
  await fs.rm(file, { force: true });
  await fs.rm(`${file}.disabled`, { force: true });
  await writeManifest(gameDir, (await readManifest(gameDir)).filter((m) => !(m.type === type && m.filename === filename)));
}

/**
 * Installs a project and, for mods, its required dependencies. Replaces older
 * files of the same project. Returns the titles that were installed.
 */
export async function installProject(
  gameDir: string,
  projectId: string,
  type: ContentType,
  gameVersion: string,
  loader: string | undefined,
  onProgress?: ProgressFn,
  /** Install exactly this version of the project (dependencies still get their newest fitting version). */
  versionId?: string,
): Promise<string[]> {
  const manifest = await readManifest(gameDir);
  const installed: string[] = [];
  const queue = [projectId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const version = id === projectId && versionId
      ? await get<ModrinthVersion>(`${API}/version/${versionId}`)
      : await pickVersion(id, gameVersion, type === 'mod' ? loader : undefined);
    const project = await get<{ title: string; icon_url?: string }>(`${API}/project/${id}`);
    const file = version.files.find((f) => f.primary) ?? version.files[0];
    const dest = contentFile(gameDir, type, path.basename(file.filename));

    // drop the previous file of this project, if any (a disabled mod stays disabled after an update)
    let keepDisabled = false;
    for (const old of manifest.filter((m) => m.projectId === id && m.filename !== file.filename)) {
      keepDisabled ||= await fs.access(`${contentFile(gameDir, old.type, old.filename)}.disabled`).then(() => true, () => false);
      await removeContent(gameDir, old.type, old.filename).catch(() => {});
    }
    await downloadAll([{ url: file.url, dest, sha1: file.hashes.sha1, size: file.size }], onProgress, { verifyHash: true });
    if (keepDisabled) await fs.rename(dest, `${dest}.disabled`);

    const entry: ManifestEntry = {
      type, filename: path.basename(file.filename), projectId: id, versionId: version.id, versionNumber: version.version_number, title: project.title, iconUrl: project.icon_url,
    };
    const i = manifest.findIndex((m) => m.projectId === id);
    if (i >= 0) manifest[i] = entry;
    else manifest.push(entry);
    installed.push(project.title);

    if (type === 'mod') {
      for (const dep of version.dependencies) {
        if (dep.dependency_type === 'required' && dep.project_id && !manifest.some((m) => m.projectId === dep.project_id)) queue.push(dep.project_id);
      }
    }
  }
  await writeManifest(gameDir, await readManifest(gameDir).then((current) => mergeManifest(current, manifest)));
  return installed;
}

export function mergeManifest(current: ManifestEntry[], updated: ManifestEntry[]): ManifestEntry[] {
  const byKey = new Map(current.map((m) => [`${m.type}:${m.filename}`, m]));
  for (const m of updated) byKey.set(`${m.type}:${m.filename}`, m);
  return [...byKey.values()];
}

// ---------- updates ----------

export interface UpdateInfo {
  type: ContentType;
  filename: string;
  projectId: string;
  title: string;
  currentVersion: string;
  latestVersionId: string;
  latestVersion: string;
  source?: 'curseforge';
}

interface ProjectSummary { id: string; title: string; icon_url?: string }

/** Every content file with its SHA1, including disabled ones. */
async function hashedFiles(gameDir: string) {
  const out: { type: ContentType; filename: string; sha1: string }[] = [];
  for (const [type, folder] of Object.entries(FOLDERS) as [ContentType, string][]) {
    for (const file of await fs.readdir(path.join(gameDir, folder)).catch(() => [] as string[])) {
      if (file.startsWith('.') || !/\.(jar|zip)(\.disabled)?$/.test(file)) continue;
      out.push({ type, filename: file.replace(/\.disabled$/, ''), sha1: await sha1File(path.join(gameDir, folder, file)) });
    }
  }
  return out;
}

/**
 * Finds newer versions of everything installed, by asking Modrinth about each
 * file's SHA1 (so mods added by hand or by a modpack are recognised too). Files
 * Modrinth knows but the launcher didn't track yet get a proper name and icon.
 */
export async function checkUpdates(gameDir: string, gameVersion: string, loader: string | undefined): Promise<UpdateInfo[]> {
  const files = await hashedFiles(gameDir);
  if (!files.length) return [];
  const hashes = files.map((f) => f.sha1);
  const current = await post<Record<string, ModrinthVersion>>(`${API}/version_files`, { hashes, algorithm: 'sha1' });

  // adopt files Modrinth recognises into the manifest
  const manifest = await readManifest(gameDir);
  const unknown = files.filter((f) => current[f.sha1] && !manifest.some((m) => m.type === f.type && m.filename === f.filename));
  if (unknown.length) {
    const ids = [...new Set(unknown.map((f) => current[f.sha1].project_id))];
    const projects = await get<ProjectSummary[]>(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`);
    for (const f of unknown) {
      const v = current[f.sha1];
      const p = projects.find((x) => x.id === v.project_id);
      manifest.push({ type: f.type, filename: f.filename, projectId: v.project_id, versionId: v.id, versionNumber: v.version_number, title: p?.title ?? f.filename, iconUrl: p?.icon_url });
    }
    await writeManifest(gameDir, manifest);
  }

  // files installed from CurseForge are checked there (curseforge.ts), not here
  const fromCurseForge = new Set(manifest.filter((m) => m.source === 'curseforge').map((m) => `${m.type}:${m.filename}`));
  // never "update" a stable release to a beta or alpha: each file only gets versions at least as stable as it is
  const CHANNELS: Record<string, string[]> = { release: ['release'], beta: ['release', 'beta'], alpha: ['release', 'beta', 'alpha'] };
  const updates: UpdateInfo[] = [];
  for (const type of Object.keys(FOLDERS) as ContentType[]) {
    for (const [channel, versionTypes] of Object.entries(CHANNELS)) {
      const ofType = files.filter((f) => f.type === type && current[f.sha1] && !fromCurseForge.has(`${f.type}:${f.filename}`) && (current[f.sha1].version_type ?? 'release') === channel);
      if (!ofType.length) continue;
      const latest = await post<Record<string, ModrinthVersion>>(`${API}/version_files/update`, {
        hashes: ofType.map((f) => f.sha1), algorithm: 'sha1', loaders: loadersFor(type, loader), game_versions: [gameVersion], version_types: versionTypes,
      });
      for (const f of ofType) {
        const now = current[f.sha1];
        const next = latest[f.sha1];
        if (!next || next.id === now.id) continue;
        const entry = manifest.find((m) => m.type === type && m.filename === f.filename);
        updates.push({
          type, filename: f.filename, projectId: now.project_id, title: entry?.title ?? f.filename,
          currentVersion: now.version_number, latestVersionId: next.id, latestVersion: next.version_number,
        });
      }
    }
  }
  return updates;
}

// ---------- modpacks (.mrpack) ----------

export interface ModpackInfo {
  name: string;
  gameVersion: string;
  loader: 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge';
  loaderVersion: string;
}

interface MrpackIndex {
  name: string;
  files: { path: string; hashes: { sha1: string }; downloads: string[]; fileSize: number; env?: { client?: string } }[];
  dependencies: Record<string, string>;
}

/** Joins `rel` onto `root`, refusing anything that would escape it ("../", absolute paths). */
export function safeJoin(root: string, rel: string): string {
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(t('Niebezpieczna ścieżka w modpacku: {0}', rel));
  return full;
}

/** Reads a .mrpack, downloads its files into `gameDir` and copies its overrides. */
export type StageProgress = (stage: string, done: number, total: number, stats?: { bytes: number; totalBytes: number; speed: number }) => void;

/** `include` (by path in the game folder) leaves out parts the player unticked when importing a profile. */
export async function installMrpack(mrpack: string, gameDir: string, onStage?: StageProgress, include: (rel: string) => boolean = () => true): Promise<ModpackInfo> {
  const zip = new AdmZip(mrpack);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error('To nie jest modpack Modrinth (.mrpack).');
  const index = JSON.parse(indexEntry.getData().toString('utf8')) as MrpackIndex;
  const deps = index.dependencies;

  await fs.mkdir(gameDir, { recursive: true });
  const tasks = index.files
    .filter((f) => f.env?.client !== 'unsupported' && include(f.path))
    .map((f) => {
      const url = f.downloads.find((u) => u.startsWith('https://'));
      if (!url) throw new Error(t('Brak adresu pobierania dla {0}', f.path));
      return { url, dest: safeJoin(gameDir, f.path), sha1: f.hashes.sha1, size: f.fileSize };
    });
  await downloadAll(tasks, (d, n, s) => onStage?.(t('Pobieranie plików'), d, n, s), { verifyHash: true });

  const overrides = zip.getEntries().filter((e) => !e.isDirectory && /^(overrides|client-overrides)\//.test(e.entryName) && include(e.entryName.replace(/^[^/]+\//, '')));
  let copied = 0;
  for (const entry of overrides) {
    onStage?.(t('Kopiowanie konfiguracji'), copied++, overrides.length);
    const m = entry.entryName.match(/^(overrides|client-overrides)\/(.+)$/);
    if (!m) continue;
    const dest = safeJoin(gameDir, m[2]);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, entry.getData());
  }

  // remember what this pack version installed, so an update can remove files it no longer ships
  await fs.mkdir(path.join(gameDir, '.slashclient'), { recursive: true });
  await fs.writeFile(packSnapshot(gameDir), JSON.stringify(tasks.map((task) => path.relative(gameDir, task.dest))));

  return {
    name: index.name,
    gameVersion: deps.minecraft,
    loader: deps['fabric-loader'] ? 'fabric' : deps['quilt-loader'] ? 'quilt' : deps.neoforge ? 'neoforge' : deps.forge ? 'forge' : 'vanilla',
    loaderVersion: deps['fabric-loader'] ?? deps['quilt-loader'] ?? deps.neoforge ?? deps.forge ?? '',
  };
}

export const packSnapshot = (gameDir: string) => path.join(gameDir, '.slashclient', 'modpack-files.json');

/**
 * Updates (or changes the version of) a modpack in place: files the old version
 * installed but the new one doesn't ship are removed, then the new version is installed
 * over it (its config overrides replace the old ones; worlds and the player's own files stay).
 */
export async function updateMrpack(mrpack: string, gameDir: string, onStage?: StageProgress): Promise<ModpackInfo> {
  const zip = new AdmZip(mrpack);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error('To nie jest modpack Modrinth (.mrpack).');
  const index = JSON.parse(indexEntry.getData().toString('utf8')) as MrpackIndex;
  const keep = new Set(index.files.filter((f) => f.env?.client !== 'unsupported').map((f) => path.normalize(f.path)));
  const previous: string[] = JSON.parse(await fs.readFile(packSnapshot(gameDir), 'utf8').catch(() => '[]'));
  for (const rel of previous) {
    if (keep.has(path.normalize(rel))) continue;
    const file = safeJoin(gameDir, rel);
    await fs.rm(file, { force: true });
    await fs.rm(`${file}.disabled`, { force: true });
  }
  return installMrpack(mrpack, gameDir, onStage);
}

/** Downloads a modpack's .mrpack (the given version, or the newest) to a temp file. */
export async function downloadModpack(projectId: string, onProgress?: ProgressFn, versionId?: string): Promise<{ file: string; version: VersionInfo }> {
  onProgress?.(0, 1, { bytes: 0, totalBytes: 0, speed: 0 });
  const version = versionId
    ? await get<ModrinthVersion>(`${API}/version/${versionId}`)
    : (await get<ModrinthVersion[]>(`${API}/project/${projectId}/version`))[0];
  const file = version?.files.find((f) => f.filename.endsWith('.mrpack'));
  if (!file) throw new Error('Ten modpack nie ma pliku .mrpack.');
  const dest = path.join(os.tmpdir(), `slashclient-${version.id}.mrpack`);
  await downloadAll([{ url: file.url, dest, sha1: file.hashes.sha1, size: file.size }], onProgress, { verifyHash: true });
  return { file: dest, version: toInfo(version) };
}

/** Recognises an imported .mrpack file as a Modrinth modpack version (by its SHA1), so it can be updated later. */
export async function identifyModpack(file: string): Promise<VersionInfo | undefined> {
  const sha1 = await sha1File(file);
  const found = await post<Record<string, ModrinthVersion>>(`${API}/version_files`, { hashes: [sha1], algorithm: 'sha1' }).catch(() => ({}));
  const version = (found as Record<string, ModrinthVersion>)[sha1];
  return version ? toInfo(version) : undefined;
}

/** The newest version of a modpack, preferring full releases over betas. */
export async function latestModpackVersion(projectId: string): Promise<VersionInfo | undefined> {
  const versions = await listVersions(projectId);
  return versions.find((v) => v.type === 'release') ?? versions[0];
}

// ---------- exporting a profile ----------

/** Download links of the files Modrinth hosts, by SHA1 (files it doesn't know are left out). */
export async function modrinthLinks(sha1s: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  for (let i = 0; i < sha1s.length; i += 500) {
    const found = await post<Record<string, ModrinthVersion>>(`${API}/version_files`, { hashes: sha1s.slice(i, i + 500), algorithm: 'sha1' });
    for (const [sha1, version] of Object.entries(found)) {
      const file = version.files.find((f) => f.hashes.sha1 === sha1);
      if (file?.url.startsWith('https://')) links.set(sha1, file.url);
    }
  }
  return links;
}
