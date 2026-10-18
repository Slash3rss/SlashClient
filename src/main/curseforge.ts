import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { downloadAll, httpMessage, netFetch, type DownloadTask, type ProgressFn } from './download';
import { fromCurseForge } from './importers';
import {
  contentFile, FOLDERS, mergeManifest, packSnapshot, readManifest, removeContent, safeJoin, writeManifest,
  type ContentType, type ManifestEntry, type ModpackInfo, type ProjectHit, type ProjectType, type StageProgress, type UpdateInfo, type VersionInfo,
} from './modrinth';
import { t } from '../shared/i18n';

/**
 * CurseForge, next to Modrinth: search, mods/packs/shaders into a profile, modpacks as profiles.
 * The CurseForge API needs a key, so every call goes through the SlashClient server
 * (/v1/curseforge/..., see server/src/curseforge.ts), which adds it. Files whose author does
 * not allow downloads outside CurseForge come without a link: they are listed for the player
 * to fetch by hand from the file's page, never fetched some other way.
 */

let api = 'https://client.slash3rss.dev/v1/curseforge';
/** The SlashClient server the calls go through (Settings → server address). */
export function setCurseForgeServer(serverUrl: string): void {
  api = `${serverUrl.replace(/\/$/, '')}/v1/curseforge`;
}

/** The server has no CurseForge key (or CurseForge refused it): the page shows CurseForge as unavailable. */
export class CurseForgeUnavailable extends Error {
  readonly code = 'curseforge_unavailable';
  constructor() {
    super(t('CurseForge jest teraz niedostępny w SlashClient. Modrinth działa normalnie.'));
  }
}

/** One call through the server; a body makes it a POST (the bulk lookups). */
async function request<T>(pathAndQuery: string, body?: unknown): Promise<T> {
  const url = `${api}${pathAndQuery}`;
  const res = await netFetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const code = await res.json().then((j: { error?: string }) => j?.error, () => undefined);
    // a SlashClient server from before CurseForge has no such address at all
    if (code === 'curseforge_unavailable' || (res.status === 404 && pathAndQuery.startsWith('/mods/search'))) throw new CurseForgeUnavailable();
    throw new Error(httpMessage(res.status, url));
  }
  return (await res.json()) as T;
}
const call = async <T>(pathAndQuery: string, body?: unknown) => (await request<{ data: T }>(pathAndQuery, body)).data;

// ---------- the API's shapes (only what is used) ----------

export interface CfMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  classId?: number;
  authors?: { name: string }[];
  logo?: { thumbnailUrl?: string; url?: string } | null;
  categories?: { name: string }[];
  links?: { websiteUrl?: string };
  allowModDistribution?: boolean | null;
}

export interface CfFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  releaseType: 1 | 2 | 3;
  fileDate: string;
  fileLength: number;
  downloadCount: number;
  downloadUrl: string | null;
  gameVersions: string[];
  hashes: { value: string; algo: number }[];
  dependencies: { modId: number; relationType: number }[];
  isAvailable?: boolean;
}

/** CurseForge's "classes" (sections of the site). */
const CLASS: Record<ProjectType, number> = { mod: 6, resourcepack: 12, shader: 6552, modpack: 4471 };
const DATAPACKS = 6945;
const LOADER_TYPE: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const LOADERS = ['forge', 'fabric', 'quilt', 'neoforge'];
const RELEASE: Record<number, VersionInfo['type']> = { 1: 'release', 2: 'beta', 3: 'alpha' };
const REQUIRED_DEPENDENCY = 3;
const SHA1 = 1;

const sha1Of = (f: CfFile) => f.hashes.find((h) => h.algo === SHA1)?.value.toLowerCase();
/** The project's page on curseforge.com (from the API, so no guessing of the section's address). */
const pageOf = (mod: Pick<CfMod, 'links'>) => mod.links?.websiteUrl?.startsWith('https://') ? mod.links.websiteUrl : undefined;
/** The page of one file: where the player downloads a file the author keeps on CurseForge. */
export const filePage = (mod: Pick<CfMod, 'links' | 'id'>, fileId: number) =>
  `${pageOf(mod) ?? `https://www.curseforge.com/projects/${mod.id}`}/files/${fileId}`;

function toInfo(f: CfFile, mod?: Pick<CfMod, 'links' | 'id'>): VersionInfo {
  return {
    id: String(f.id),
    projectId: String(f.modId),
    name: f.displayName,
    versionNumber: f.displayName || f.fileName,
    type: RELEASE[f.releaseType] ?? 'release',
    date: f.fileDate,
    // gameVersions mixes game versions with loaders and sides ("1.20.1", "Fabric", "Client")
    gameVersions: f.gameVersions.filter((v) => /^\d/.test(v)).reverse(),
    loaders: f.gameVersions.map((v) => v.toLowerCase()).filter((v) => LOADERS.includes(v)),
    downloads: f.downloadCount,
    manualUrl: f.downloadUrl ? undefined : filePage(mod ?? { id: f.modId }, f.id),
  };
}

// ---------- search and versions ----------

export async function searchCurseForge(opts: { query: string; type: ProjectType; gameVersion?: string; loader?: string; offset?: number }): Promise<{ hits: ProjectHit[]; total: number }> {
  const params = new URLSearchParams({
    classId: String(CLASS[opts.type]),
    // 2 = popularity: CurseForge has no "relevance" order, popularity with the query works like it
    sortField: opts.query ? '2' : '6',
    sortOrder: 'desc',
    pageSize: '20',
    index: String(opts.offset ?? 0),
  });
  if (opts.query) params.set('searchFilter', opts.query);
  if (opts.gameVersion) params.set('gameVersion', opts.gameVersion);
  if (opts.loader && LOADER_TYPE[opts.loader] && (opts.type === 'mod' || opts.type === 'modpack')) params.set('modLoaderType', String(LOADER_TYPE[opts.loader]));
  const json = await request<{ data: CfMod[]; pagination?: { totalCount?: number } }>(`/mods/search?${params}`);
  return {
    // CurseForge never pages past 10 000 results
    total: Math.min(json.pagination?.totalCount ?? json.data.length, 10_000 - 20),
    hits: json.data.map(toHit),
  };
}

export function toHit(m: CfMod): ProjectHit {
  return {
    id: String(m.id),
    slug: m.slug,
    title: m.name,
    description: m.summary,
    author: m.authors?.[0]?.name ?? '',
    iconUrl: m.logo?.thumbnailUrl || m.logo?.url || undefined,
    downloads: m.downloadCount,
    categories: (m.categories ?? []).map((c) => c.name),
    pageUrl: pageOf(m),
    manualOnly: m.allowModDistribution === false || undefined,
  };
}

const getMod = (id: string | number) => call<CfMod>(`/mods/${Number(id)}`);

/** Files of a project, newest first; optionally only those for this game version / loader. */
async function listFiles(projectId: string | number, filter: { gameVersion?: string; loader?: string } = {}): Promise<CfFile[]> {
  const params = new URLSearchParams({ pageSize: '50' });
  if (filter.gameVersion) params.set('gameVersion', filter.gameVersion);
  if (filter.loader && LOADER_TYPE[filter.loader]) params.set('modLoaderType', String(LOADER_TYPE[filter.loader]));
  const files = await call<CfFile[]>(`/mods/${Number(projectId)}/files?${params}`);
  return files.filter((f) => f.isAvailable !== false).sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));
}

/** Only mods are filtered by loader; packs and shaders work with any. */
const loaderFor = (type: ProjectType, loader?: string) => (type === 'mod' ? loader : undefined);

export async function listCurseForgeVersions(projectId: string, type: ProjectType, gameVersion?: string, loader?: string): Promise<VersionInfo[]> {
  const [mod, files] = await Promise.all([getMod(projectId), type === 'modpack' ? listFiles(projectId) : listFiles(projectId, { gameVersion, loader: loaderFor(type, loader) })]);
  return files.map((f) => toInfo(f, mod));
}

async function pickFile(projectId: string | number, gameVersion: string, loader?: string): Promise<CfFile> {
  const files = await listFiles(projectId, { gameVersion, loader });
  if (!files.length) throw new Error(t('Brak wersji dla Minecraft {0}{1}.', gameVersion, loader ? ` (${loader})` : ''));
  return files[0];
}

// ---------- mods, resource packs, shaders into a profile ----------

/** A file the player has to download from CurseForge's page and put into the folder. */
export interface ManualFile { title: string; fileName: string; url: string; folder: string }

const taskOf = (file: CfFile, dest: string): DownloadTask =>
  ({ url: file.downloadUrl!, dest, sha1: sha1Of(file), size: file.fileLength || undefined });

/**
 * Installs a CurseForge project and, for mods, its required dependencies, replacing older
 * files of the same project. Files the author keeps on CurseForge are returned in `manual`.
 */
export async function installCurseForgeProject(
  gameDir: string,
  projectId: string,
  type: ContentType,
  gameVersion: string,
  loader: string | undefined,
  onProgress?: ProgressFn,
  fileId?: string,
): Promise<{ installed: string[]; manual: ManualFile[] }> {
  const manifest = await readManifest(gameDir);
  const installed: string[] = [];
  const manual: ManualFile[] = [];
  const queue = [projectId];
  const seen = new Set<string>();
  const present = new Set(await fs.readdir(path.join(gameDir, FOLDERS[type])).catch(() => [] as string[]));
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const mod = await getMod(id);
    const file = id === projectId && fileId
      ? await call<CfFile>(`/mods/${Number(id)}/files/${Number(fileId)}`)
      : await pickFile(id, gameVersion, loaderFor(type, loader));
    const filename = path.basename(file.fileName);
    const dest = contentFile(gameDir, type, filename);

    if (!file.downloadUrl) {
      manual.push({ title: mod.name, fileName: filename, url: filePage(mod, file.id), folder: FOLDERS[type] });
    } else if (id !== projectId && (present.has(filename) || present.has(`${filename}.disabled`))) {
      // a dependency that is already there under the same file name (e.g. from Modrinth)
    } else {
      let keepDisabled = false;
      for (const old of manifest.filter((m) => m.source === 'curseforge' && m.projectId === id && m.filename !== filename)) {
        keepDisabled ||= await fs.access(`${contentFile(gameDir, old.type, old.filename)}.disabled`).then(() => true, () => false);
        await removeContent(gameDir, old.type, old.filename).catch(() => {});
      }
      await downloadAll([taskOf(file, dest)], onProgress, { verifyHash: true });
      if (keepDisabled) await fs.rename(dest, `${dest}.disabled`);
      const entry: ManifestEntry = {
        type, filename, projectId: id, versionId: String(file.id), versionNumber: file.displayName || filename, title: mod.name, iconUrl: mod.logo?.thumbnailUrl || undefined, source: 'curseforge',
      };
      const i = manifest.findIndex((m) => m.source === 'curseforge' && m.projectId === id);
      if (i >= 0) manifest[i] = entry;
      else manifest.push(entry);
      installed.push(mod.name);
    }

    if (type === 'mod') {
      for (const dep of file.dependencies) {
        const depId = String(dep.modId);
        if (dep.relationType === REQUIRED_DEPENDENCY && !manifest.some((m) => m.source === 'curseforge' && m.projectId === depId)) queue.push(depId);
      }
    }
  }
  await writeManifest(gameDir, mergeManifest(await readManifest(gameDir), manifest));
  return { installed, manual };
}

/**
 * Newer files of everything installed from CurseForge, never moving a release to a beta
 * or alpha. (Modrinth's check by file hash skips these files.)
 */
export async function checkCurseForgeUpdates(gameDir: string, gameVersion: string, loader: string | undefined): Promise<UpdateInfo[]> {
  const tracked = (await readManifest(gameDir)).filter((m) => m.source === 'curseforge');
  if (!tracked.length) return [];
  const current = await call<CfFile[]>('/mods/files', { fileIds: tracked.map((m) => Number(m.versionId)) });
  const updates: UpdateInfo[] = [];
  for (const entry of tracked) {
    const now = current.find((f) => String(f.id) === entry.versionId);
    const files = await listFiles(entry.projectId, { gameVersion, loader: loaderFor(entry.type, loader) }).catch(() => []);
    const next = files.find((f) => f.releaseType <= (now?.releaseType ?? 1) && f.downloadUrl);
    if (!next || String(next.id) === entry.versionId || (now && Date.parse(next.fileDate) <= Date.parse(now.fileDate))) continue;
    updates.push({
      type: entry.type, filename: entry.filename, projectId: entry.projectId, title: entry.title,
      currentVersion: entry.versionNumber, latestVersionId: String(next.id), latestVersion: next.displayName || next.fileName, source: 'curseforge',
    });
  }
  return updates;
}

// ---------- modpacks (CurseForge .zip: manifest.json + overrides/) ----------

export interface CurseManifest {
  name: string;
  version: string;
  gameVersion: string;
  loader: ModpackInfo['loader'];
  loaderVersion: string;
  files: { projectID: number; fileID: number; required: boolean }[];
  overrides: string;
}

/** Reads a modpack's manifest.json; throws for anything that is not a CurseForge Minecraft modpack. */
export function parseCurseManifest(text: string): CurseManifest {
  let json: {
    manifestType?: string; name?: string; version?: string; overrides?: string;
    minecraft?: { version?: string; modLoaders?: { id?: string; primary?: boolean }[] };
    files?: { projectID?: unknown; fileID?: unknown; required?: unknown }[];
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(t('To nie jest modpack CurseForge (.zip z manifest.json).'));
  }
  if (json?.manifestType !== 'minecraftModpack' || !json.minecraft?.version) throw new Error(t('To nie jest modpack CurseForge (.zip z manifest.json).'));
  const loaders = json.minecraft.modLoaders ?? [];
  const primary = loaders.find((l) => l.primary) ?? loaders[0];
  // modLoaders ids look like baseModLoader names of an instance: "forge-47.2.0", "fabric-0.15.7", "neoforge-20.4.190"
  const info = fromCurseForge({ baseModLoader: { name: primary?.id ?? '', minecraftVersion: json.minecraft.version } });
  const files = (json.files ?? [])
    .filter((f) => Number.isSafeInteger(f.projectID) && Number.isSafeInteger(f.fileID))
    .map((f) => ({ projectID: f.projectID as number, fileID: f.fileID as number, required: f.required !== false }));
  const overrides = typeof json.overrides === 'string' && json.overrides ? json.overrides.replace(/^\/+|\/+$/g, '') : 'overrides';
  return { name: json.name || 'Modpack', version: json.version ?? '', gameVersion: info.versionId, loader: info.loader, loaderVersion: info.loaderVersion, files, overrides };
}

/** Where a pack's file goes, by its project's class. */
function folderOf(classId: number | undefined): string {
  if (classId === CLASS.resourcepack) return FOLDERS.resourcepack;
  if (classId === CLASS.shader) return FOLDERS.shader;
  if (classId === DATAPACKS) return 'datapacks';
  return FOLDERS.mod;
}

/** Bulk lookups in chunks the server takes. */
async function bulk<T>(endpoint: '/mods' | '/mods/files', key: 'modIds' | 'fileIds', ids: number[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...(await call<T[]>(endpoint, { [key]: ids.slice(i, i + 500) })));
  return out;
}

export type CurseModpackInfo = ModpackInfo & { manual: ManualFile[] };

function readPack(zipFile: string): { zip: AdmZip; manifest: CurseManifest } {
  const zip = new AdmZip(zipFile);
  const entry = zip.getEntry('manifest.json');
  if (!entry) throw new Error(t('To nie jest modpack CurseForge (.zip z manifest.json).'));
  return { zip, manifest: parseCurseManifest(entry.getData().toString('utf8')) };
}

/** Whether a zip is a CurseForge modpack (as opposed to a Modrinth .mrpack). */
export function isCurseForgePack(zipFile: string): boolean {
  try {
    return !!new AdmZip(zipFile).getEntry('manifest.json');
  } catch {
    return false;
  }
}

/**
 * Installs a CurseForge modpack zip into `gameDir`: its files (checked by SHA1), then the
 * overrides. Files the authors keep on CurseForge are returned in `manual` (with the folder
 * to put them in); everything else is installed.
 */
export async function installCurseForgePack(zipFile: string, gameDir: string, onStage?: StageProgress): Promise<CurseModpackInfo> {
  const { zip, manifest } = readPack(zipFile);
  const wanted = manifest.files.filter((f) => f.required);
  await fs.mkdir(gameDir, { recursive: true });

  onStage?.(t('Sprawdzanie plików modpacka'), 0, 1);
  const files = wanted.length ? await bulk<CfFile>('/mods/files', 'fileIds', wanted.map((f) => f.fileID)) : [];
  const mods = wanted.length ? await bulk<CfMod>('/mods', 'modIds', [...new Set(wanted.map((f) => f.projectID))]) : [];
  const tasks: DownloadTask[] = [];
  const manual: ManualFile[] = [];
  const placed: string[] = [];
  for (const want of wanted) {
    const file = files.find((f) => f.id === want.fileID);
    const mod = mods.find((m) => m.id === want.projectID) ?? { id: want.projectID, name: String(want.projectID), links: undefined, classId: undefined };
    if (!file) throw new Error(t('CurseForge nie zna pliku {0} z modpacka.', want.fileID));
    const folder = folderOf(mod.classId);
    const dest = safeJoin(gameDir, path.join(folder, path.basename(file.fileName)));
    placed.push(path.relative(gameDir, dest));
    if (file.downloadUrl) tasks.push(taskOf(file, dest));
    else if (!(await fs.access(dest).then(() => true, () => false))) manual.push({ title: mod.name, fileName: path.basename(file.fileName), url: filePage(mod, file.id), folder });
  }
  await downloadAll(tasks, (d, n, s) => onStage?.(t('Pobieranie plików'), d, n, s), { verifyHash: true });

  const prefix = `${manifest.overrides}/`;
  const overrides = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.startsWith(prefix));
  let copied = 0;
  for (const entry of overrides) {
    onStage?.(t('Kopiowanie konfiguracji'), copied++, overrides.length);
    const dest = safeJoin(gameDir, entry.entryName.slice(prefix.length));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, entry.getData());
  }

  // remember what this pack version installed, so an update can remove files it no longer ships
  await fs.mkdir(path.join(gameDir, '.slashclient'), { recursive: true });
  await fs.writeFile(packSnapshot(gameDir), JSON.stringify(placed));

  return { name: manifest.name, gameVersion: manifest.gameVersion, loader: manifest.loader, loaderVersion: manifest.loaderVersion, manual };
}

/** Moves a CurseForge modpack profile to another version, like updateMrpack does for Modrinth. */
export async function updateCurseForgePack(zipFile: string, gameDir: string, onStage?: StageProgress): Promise<CurseModpackInfo> {
  const { manifest } = readPack(zipFile);
  const wanted = manifest.files.filter((f) => f.required);
  const files = wanted.length ? await bulk<CfFile>('/mods/files', 'fileIds', wanted.map((f) => f.fileID)) : [];
  const keep = new Set(files.map((f) => path.basename(f.fileName)));
  const previous: string[] = JSON.parse(await fs.readFile(packSnapshot(gameDir), 'utf8').catch(() => '[]'));
  for (const rel of previous) {
    if (keep.has(path.basename(rel))) continue;
    const file = safeJoin(gameDir, rel);
    await fs.rm(file, { force: true });
    await fs.rm(`${file}.disabled`, { force: true });
  }
  return installCurseForgePack(zipFile, gameDir, onStage);
}

/** Downloads a modpack's zip (the given file, or the newest) to a temp file. */
export async function downloadCurseForgePack(projectId: string, onProgress?: ProgressFn, fileId?: string): Promise<{ file: string; version: VersionInfo }> {
  onProgress?.(0, 1, { bytes: 0, totalBytes: 0, speed: 0 });
  const mod = await getMod(projectId);
  const file = fileId ? await call<CfFile>(`/mods/${Number(projectId)}/files/${Number(fileId)}`) : (await listFiles(projectId))[0];
  if (!file) throw new Error(t('Ten modpack nie ma plików do pobrania.'));
  if (!file.downloadUrl) throw new Error(t('Autor tego modpacka pozwala go pobrać tylko ze strony CurseForge: {0}', filePage(mod, file.id)));
  const dest = path.join(os.tmpdir(), `slashclient-cf-${file.id}.zip`);
  await downloadAll([taskOf(file, dest)], onProgress, { verifyHash: true });
  return { file: dest, version: toInfo(file, mod) };
}

/** The newest version of a CurseForge modpack, preferring full releases. */
export async function latestCurseForgePack(projectId: string): Promise<VersionInfo | undefined> {
  const mod = await getMod(projectId);
  const files = await listFiles(projectId);
  const best = files.find((f) => f.releaseType === 1) ?? files[0];
  return best && toInfo(best, mod);
}
