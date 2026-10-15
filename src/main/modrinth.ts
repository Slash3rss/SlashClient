import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { downloadAll, fetchJson, type ProgressFn } from './download';
import { t } from '../shared/i18n';

const API = 'https://api.modrinth.com/v2';
// Modrinth asks every client to identify itself.
const HEADERS = { 'User-Agent': 'slash3rss/SlashClient/0.1.0 (https://slash3rss.dev)' };

export type ContentType = 'mod' | 'resourcepack' | 'shader';
export type ProjectType = ContentType | 'modpack';

export const FOLDERS: Record<ContentType, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };

const get = <T>(url: string) => fetchJson<T>(url, { headers: HEADERS });

export interface ProjectHit {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl?: string;
  downloads: number;
  categories: string[];
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

interface ModrinthFile { url: string; filename: string; primary: boolean; size: number; hashes: { sha1: string } }
interface ModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  files: ModrinthFile[];
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: string }[];
}

/** Newest version of a project that fits the game version (and loader, for mods). */
async function pickVersion(projectId: string, gameVersion: string, loader?: string): Promise<ModrinthVersion> {
  const params = new URLSearchParams({ game_versions: JSON.stringify([gameVersion]) });
  if (loader) params.set('loaders', JSON.stringify([loader]));
  const versions = await get<ModrinthVersion[]>(`${API}/project/${projectId}/version?${params}`);
  if (!versions.length) throw new Error(t('Brak wersji dla Minecraft {0}{1}.', gameVersion, loader ? ` (${loader})` : ''));
  return versions[0];
}

// ---------- installed content, tracked per instance ----------

export interface InstalledItem {
  type: ContentType;
  filename: string;
  enabled: boolean;
  title: string;
  projectId?: string;
  versionNumber?: string;
  iconUrl?: string;
}

interface ManifestEntry { type: ContentType; filename: string; projectId: string; versionId: string; versionNumber: string; title: string; iconUrl?: string }

const manifestPath = (gameDir: string) => path.join(gameDir, '.slashclient', 'content.json');

async function readManifest(gameDir: string): Promise<ManifestEntry[]> {
  try {
    return JSON.parse(await fs.readFile(manifestPath(gameDir), 'utf8'));
  } catch {
    return [];
  }
}

async function writeManifest(gameDir: string, entries: ManifestEntry[]): Promise<void> {
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
      out.push({ type, filename, enabled, title: entry?.title ?? filename.replace(/\.(jar|zip)$/, ''), projectId: entry?.projectId, versionNumber: entry?.versionNumber, iconUrl: entry?.iconUrl });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, 'pl'));
}

/** Only bare file names inside the content folders are accepted, never paths. */
function contentFile(gameDir: string, type: ContentType, filename: string): string {
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
): Promise<string[]> {
  const manifest = await readManifest(gameDir);
  const installed: string[] = [];
  const queue = [projectId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const version = await pickVersion(id, gameVersion, type === 'mod' ? loader : undefined);
    const project = await get<{ title: string; icon_url?: string }>(`${API}/project/${id}`);
    const file = version.files.find((f) => f.primary) ?? version.files[0];
    const dest = contentFile(gameDir, type, path.basename(file.filename));

    // drop the previous file of this project, if any
    for (const old of manifest.filter((m) => m.projectId === id && m.filename !== file.filename)) {
      await removeContent(gameDir, old.type, old.filename).catch(() => {});
    }
    await downloadAll([{ url: file.url, dest, sha1: file.hashes.sha1, size: file.size }], onProgress, { verifyHash: true });

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

function mergeManifest(current: ManifestEntry[], updated: ManifestEntry[]): ManifestEntry[] {
  const byKey = new Map(current.map((m) => [`${m.type}:${m.filename}`, m]));
  for (const m of updated) byKey.set(`${m.type}:${m.filename}`, m);
  return [...byKey.values()];
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
function safeJoin(root: string, rel: string): string {
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(t('Niebezpieczna ścieżka w modpacku: {0}', rel));
  return full;
}

/** Reads a .mrpack, downloads its files into `gameDir` and copies its overrides. */
export type StageProgress = (stage: string, done: number, total: number, stats?: { bytes: number; totalBytes: number; speed: number }) => void;

export async function installMrpack(mrpack: string, gameDir: string, onStage?: StageProgress): Promise<ModpackInfo> {
  const zip = new AdmZip(mrpack);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error('To nie jest modpack Modrinth (.mrpack).');
  const index = JSON.parse(indexEntry.getData().toString('utf8')) as MrpackIndex;
  const deps = index.dependencies;

  await fs.mkdir(gameDir, { recursive: true });
  const tasks = index.files
    .filter((f) => f.env?.client !== 'unsupported')
    .map((f) => {
      const url = f.downloads.find((u) => u.startsWith('https://'));
      if (!url) throw new Error(t('Brak adresu pobierania dla {0}', f.path));
      return { url, dest: safeJoin(gameDir, f.path), sha1: f.hashes.sha1, size: f.fileSize };
    });
  await downloadAll(tasks, (d, n, s) => onStage?.(t('Pobieranie plików'), d, n, s), { verifyHash: true });

  const overrides = zip.getEntries().filter((e) => !e.isDirectory && /^(overrides|client-overrides)\//.test(e.entryName));
  let copied = 0;
  for (const entry of overrides) {
    onStage?.(t('Kopiowanie konfiguracji'), copied++, overrides.length);
    const m = entry.entryName.match(/^(overrides|client-overrides)\/(.+)$/);
    if (!m) continue;
    const dest = safeJoin(gameDir, m[2]);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, entry.getData());
  }

  return {
    name: index.name,
    gameVersion: deps.minecraft,
    loader: deps['fabric-loader'] ? 'fabric' : deps['quilt-loader'] ? 'quilt' : deps.neoforge ? 'neoforge' : deps.forge ? 'forge' : 'vanilla',
    loaderVersion: deps['fabric-loader'] ?? deps['quilt-loader'] ?? deps.neoforge ?? deps.forge ?? '',
  };
}

/** Downloads the newest .mrpack of a Modrinth modpack project to a temp file. */
export async function downloadModpack(projectId: string, onProgress?: ProgressFn): Promise<string> {
  onProgress?.(0, 1, { bytes: 0, totalBytes: 0, speed: 0 });
  const versions = await get<ModrinthVersion[]>(`${API}/project/${projectId}/version`);
  const file = versions[0]?.files.find((f) => f.filename.endsWith('.mrpack'));
  if (!file) throw new Error('Ten modpack nie ma pliku .mrpack.');
  const dest = path.join(os.tmpdir(), `slashclient-${versions[0].id}.mrpack`);
  await downloadAll([{ url: file.url, dest, sha1: file.hashes.sha1, size: file.size }], onProgress, { verifyHash: true });
  return dest;
}
