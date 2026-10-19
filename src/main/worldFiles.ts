import AdmZip from 'adm-zip';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadAll, type ProgressFn } from './download';
import { readNbt } from './nbt';
import { t } from '../shared/i18n';

/**
 * Worlds as .zip files to send to a friend (export and import), and datapacks
 * installed into one world's datapacks/ folder.
 */

/** A zip larger than this is not read: adm-zip keeps the whole file in memory. */
export const MAX_WORLD_ZIP_BYTES = 2 * 1024 ** 3;
/** Unpacked size and file count a world may have, so a crafted zip cannot fill the disk. */
export const MAX_WORLD_BYTES = 8 * 1024 ** 3;
export const MAX_WORLD_FILES = 200_000;

/** Only plain folder/file names, never paths, so nothing outside the instance is touched. */
function plainName(name: string): string {
  if (!name || name !== path.basename(name) || name.startsWith('.') || name.includes('\\')) throw new Error(t('Nieprawidłowa nazwa'));
  return name;
}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

// ---------- export ----------

/** Zips saves/<folder> with the world folder at the zip's root (session.lock is left out). */
export async function exportWorld(gameDir: string, folder: string, out: string): Promise<number> {
  const src = path.join(gameDir, 'saves', plainName(folder));
  if (!(await exists(path.join(src, 'level.dat')))) throw new Error(t('To nie jest świat Minecrafta (brak level.dat).'));
  const zip = new AdmZip();
  // session.lock is held open by a running game and means nothing on another computer
  await zip.addLocalFolderPromise(src, { zipPath: folder, filter: (p) => !/(^|[\\/])session\.lock$/.test(p) });
  await zip.writeZipPromise(out);
  return (await fs.stat(out)).size;
}

// ---------- import ----------

export interface WorldZipSummary {
  /** The world's name from its level.dat (or the folder's name). */
  name: string;
  /** The folder the world gets in saves/ (before making it unique). */
  folder: string;
  sizeBytes: number;
  files: number;
}

/** True for zip entry names that stay inside the folder they are unpacked to. */
export function safeEntryName(name: string): boolean {
  if (!name || name.includes('\0') || name.includes('\\')) return false;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false;
  return !name.split('/').some((part) => part === '..');
}

/** A folder name made from a world's name: no characters Windows refuses, never empty or hidden. */
export function folderNameFor(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').replace(/^[. ]+/, '').trim().slice(0, 60);
  // names Windows keeps for devices
  return !clean || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) ? t('Świat') : clean;
}

/** `name`, or "name (2)", "name (3)"… when saves/ already has a folder of that name. */
export async function uniqueFolder(saves: string, name: string): Promise<string> {
  const taken = new Set((await fs.readdir(saves).catch(() => [] as string[])).map((n) => n.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} (${i})`.toLowerCase())) return `${name} (${i})`;
}

interface WorldRoot { zip: AdmZip; prefix: string; entries: AdmZip.IZipEntry[]; summary: WorldZipSummary }

/**
 * Finds the world in a zip: the folder holding level.dat, at the root or nested one or two
 * levels ("World/level.dat", "Download/World/level.dat"). Refuses zips with unsafe paths,
 * no world or one too big to be real.
 */
export async function readWorldZip(file: string): Promise<WorldRoot> {
  const { size } = await fs.stat(file);
  if (size > MAX_WORLD_ZIP_BYTES) throw new Error(t('Plik jest za duży (ponad {0} GB).', MAX_WORLD_ZIP_BYTES / 1024 ** 3));
  let zip: AdmZip;
  try {
    zip = new AdmZip(file);
  } catch {
    throw new Error(t('To nie jest poprawny plik .zip.'));
  }
  const all = zip.getEntries();
  if (all.some((e) => !safeEntryName(e.entryName))) throw new Error(t('Plik .zip ma niebezpieczne ścieżki i nie zostanie rozpakowany.'));
  // macOS adds its own metadata folder to zips made in Finder
  const levels = all
    .filter((e) => !e.isDirectory && !e.entryName.startsWith('__MACOSX/') && /(^|\/)level\.dat$/.test(e.entryName))
    .map((e) => e.entryName.slice(0, -'level.dat'.length))
    .filter((prefix) => prefix.split('/').length - 1 <= 2)
    .sort((a, b) => a.split('/').length - b.split('/').length);
  if (!levels.length) throw new Error(t('W pliku nie ma świata Minecrafta (brak level.dat).'));
  const prefix = levels[0];
  const entries = all.filter((e) => !e.isDirectory && e.entryName.startsWith(prefix) && e.entryName !== prefix && !/(^|\/)session\.lock$/.test(e.entryName));
  const bytes = entries.reduce((sum, e) => sum + e.header.size, 0);
  if (entries.length > MAX_WORLD_FILES || bytes > MAX_WORLD_BYTES) throw new Error(t('Świat w pliku jest za duży, żeby go zaimportować.'));

  const folderOfZip = prefix ? prefix.slice(0, -1).split('/').pop()! : path.basename(file).replace(/\.zip$/i, '');
  let name = folderOfZip;
  try {
    const data = (readNbt(zip.getEntry(`${prefix}level.dat`)!.getData()).Data ?? {}) as Record<string, unknown>;
    if (typeof data.LevelName === 'string' && data.LevelName.trim()) name = data.LevelName.trim();
  } catch {
    throw new Error(t('Plik level.dat w tym świecie jest uszkodzony.'));
  }
  return { zip, prefix, entries, summary: { name, folder: folderNameFor(folderOfZip), sizeBytes: bytes, files: entries.length } };
}

/**
 * Unpacks the world from a zip into saves/, under a folder name not taken yet. It is unpacked
 * into a hidden folder first and renamed at the end, so a failed import leaves nothing behind.
 * Returns the folder it got.
 */
export async function importWorldZip(gameDir: string, file: string, onProgress?: (done: number, total: number) => void): Promise<string> {
  const { prefix, entries, summary } = await readWorldZip(file);
  const saves = path.join(gameDir, 'saves');
  await fs.mkdir(saves, { recursive: true });
  const tmp = path.join(saves, `.import-${randomBytes(4).toString('hex')}`);
  try {
    let written = 0;
    for (const [i, entry] of entries.entries()) {
      const rel = entry.entryName.slice(prefix.length);
      const out = path.resolve(tmp, rel);
      if (!out.startsWith(tmp + path.sep)) throw new Error(t('Plik .zip ma niebezpieczne ścieżki i nie zostanie rozpakowany.'));
      const data = entry.getData();
      // the sizes in the zip's index can lie: count what really comes out
      written += data.length;
      if (written > MAX_WORLD_BYTES) throw new Error(t('Świat w pliku jest za duży, żeby go zaimportować.'));
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, data);
      if (i % 50 === 0) onProgress?.(i, entries.length);
    }
    const folder = await uniqueFolder(saves, summary.folder);
    await fs.rename(tmp, path.join(saves, folder));
    return folder;
  } catch (err) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

// ---------- datapacks ----------

/** What the launcher knows about a datapack it installed (title and version from Modrinth). */
export interface DatapackEntry { world: string; filename: string; projectId: string; versionId: string; versionNumber: string; title: string; iconUrl?: string }

export interface DatapackItem {
  filename: string;
  title: string;
  /** A folder datapack (unpacked) rather than a .zip. */
  folder: boolean;
  sizeBytes: number;
  projectId?: string;
  versionNumber?: string;
  iconUrl?: string;
}

const datapackManifest = (gameDir: string) => path.join(gameDir, '.slashclient', 'datapacks.json');

export async function readDatapackManifest(gameDir: string): Promise<DatapackEntry[]> {
  try {
    const list = JSON.parse(await fs.readFile(datapackManifest(gameDir), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeDatapackManifest(gameDir: string, entries: DatapackEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(datapackManifest(gameDir)), { recursive: true });
  await fs.writeFile(datapackManifest(gameDir), JSON.stringify(entries, null, 2));
}

const datapacksDir = (gameDir: string, world: string) => path.join(gameDir, 'saves', plainName(world), 'datapacks');

/** Datapacks in a world: .zip files and unpacked folders with a pack.mcmeta. */
export async function listDatapacks(gameDir: string, world: string): Promise<DatapackItem[]> {
  const dir = datapacksDir(gameDir, world);
  const known = (await readDatapackManifest(gameDir)).filter((m) => m.world === world);
  const out: DatapackItem[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, entry.name);
    const isZip = entry.isFile() && /\.zip$/i.test(entry.name);
    const isFolder = entry.isDirectory() && (await exists(path.join(p, 'pack.mcmeta')));
    if (!isZip && !isFolder) continue;
    const meta = known.find((m) => m.filename === entry.name);
    out.push({
      filename: entry.name, title: meta?.title ?? entry.name.replace(/\.zip$/i, ''), folder: isFolder,
      sizeBytes: isZip ? (await fs.stat(p)).size : 0, projectId: meta?.projectId, versionNumber: meta?.versionNumber, iconUrl: meta?.iconUrl,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** Downloads a datapack into saves/<world>/datapacks/, replacing an older file of the same project there. */
export async function installDatapack(
  gameDir: string, world: string, file: Omit<DatapackEntry, 'world'> & { url: string; sha1: string; size: number }, onProgress?: ProgressFn,
): Promise<void> {
  const dir = datapacksDir(gameDir, world);
  if (!(await exists(path.join(gameDir, 'saves', world, 'level.dat')))) throw new Error(t('Nie znaleziono świata.'));
  const filename = plainName(file.filename);
  await fs.mkdir(dir, { recursive: true });
  const manifest = await readDatapackManifest(gameDir);
  for (const old of manifest.filter((m) => m.world === world && m.projectId === file.projectId && m.filename !== filename)) {
    await fs.rm(path.join(dir, plainName(old.filename)), { force: true }).catch(() => {});
  }
  await downloadAll([{ url: file.url, dest: path.join(dir, filename), sha1: file.sha1, size: file.size }], onProgress, { verifyHash: true });
  const entry: DatapackEntry = {
    world, filename, projectId: file.projectId, versionId: file.versionId, versionNumber: file.versionNumber, title: file.title, iconUrl: file.iconUrl,
  };
  await writeDatapackManifest(gameDir, [...manifest.filter((m) => !(m.world === world && (m.projectId === file.projectId || m.filename === filename))), entry]);
}

export async function removeDatapack(gameDir: string, world: string, filename: string): Promise<void> {
  await fs.rm(path.join(datapacksDir(gameDir, world), plainName(filename)), { recursive: true, force: true });
  const manifest = await readDatapackManifest(gameDir);
  const left = manifest.filter((m) => !(m.world === world && m.filename === filename));
  if (left.length !== manifest.length) await writeDatapackManifest(gameDir, left);
}
