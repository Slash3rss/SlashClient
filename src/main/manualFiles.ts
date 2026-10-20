import { createHash } from 'node:crypto';
import { createReadStream, watch, type FSWatcher } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * CurseForge files the player downloads by hand (the author forbids other launchers), found
 * again on disk like Prism Launcher's "Blocked mods" dialog: the watched folders (Downloads by
 * default) are checked at their top level, and a file counts only if its SHA-1 matches the one
 * CurseForge gave (older lists without a hash: the exact file name and, when known, its size).
 * Found files are copied into the profile's folder.
 */

/** A file the player has to download from CurseForge's page and put into the folder. */
export interface ManualFile {
  title: string;
  fileName: string;
  url: string;
  folder: string;
  /** CurseForge's SHA-1 of the file (lists from before 0.9.27 lack it). */
  sha1?: string;
  /** Its size in bytes, when known. */
  size?: number;
}

/** Downloads still in progress (Chrome, Firefox, Edge, Safari and friends). */
const PARTIAL = /\.(crdownload|part|partial|tmp|download|opdownload)$/i;
/** Bigger than any mod: not worth reading. */
const MAX_SIZE = 1024 * 1024 * 1024;

export const manualKey = (f: Pick<ManualFile, 'folder' | 'fileName'>) => `${f.folder}/${f.fileName}`;

/** Old lists link to the file's page (…/files/<id>); the download page (…/download/<id>) starts the download right away. */
export function downloadLink(url: string): string {
  return /^https:\/\/(www\.)?curseforge\.com\//.test(url) ? url.replace(/\/files\/(\d+)\/?$/, '/download/$1') : url;
}

/** SHA-1 read from the file now, without the remembered ones. */
async function freshSha1(file: string): Promise<string> {
  const hash = createHash('sha1');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

const hashes = new Map<string, string>();
/** SHA-1 of a file, remembered by path, size and modification time (a folder is scanned every few seconds). */
async function sha1Of(file: string, size: number, mtimeMs: number): Promise<string> {
  const key = `${file}|${size}|${mtimeMs}`;
  const known = hashes.get(key);
  if (known) return known;
  const hash = createHash('sha1');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  const value = hash.digest('hex');
  if (hashes.size > 2000) hashes.clear();
  hashes.set(key, value);
  return value;
}

/** Whether a file on disk is this manual file. `explicit`: the player dropped it, so any name is checked by its hash. */
async function matches(f: ManualFile, file: string, name: string, size: number, mtimeMs: number, explicit: boolean): Promise<boolean> {
  if (f.size && size !== f.size) return false;
  const sameName = name.toLowerCase() === f.fileName.toLowerCase();
  if (f.sha1) {
    // without a size to go by, only files with the same name are read (Downloads can be huge)
    if (!f.size && !sameName && !explicit) return false;
    return (await sha1Of(file, size, mtimeMs).catch(() => '')) === f.sha1.toLowerCase();
  }
  return name === f.fileName;
}

/**
 * Finds the manual files in the given folders (top level only, like Prism) and in `extra` files
 * (dropped on the dialog). Returns where each found one is, by manualKey.
 */
export async function findManualFiles(files: ManualFile[], folders: string[], extra: string[] = []): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const candidates: { file: string; explicit: boolean }[] = extra.map((file) => ({ file, explicit: true }));
  for (const dir of folders) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) if (e.isFile()) candidates.push({ file: path.join(dir, e.name), explicit: false });
  }
  for (const { file, explicit } of candidates) {
    if (found.size === files.length) break;
    const name = path.basename(file);
    if (PARTIAL.test(name)) continue;
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat?.isFile() || stat.size === 0 || stat.size > MAX_SIZE) continue;
    for (const f of files) {
      const key = manualKey(f);
      if (found.has(key)) continue;
      if (await matches(f, file, name, stat.size, stat.mtimeMs, explicit)) {
        found.set(key, file);
        break;
      }
    }
  }
  return found;
}

/** Where a manual file goes in the profile; undefined for a folder or name that would leave it. */
export function manualDest(gameDir: string, f: Pick<ManualFile, 'folder' | 'fileName'>): string | undefined {
  if (!/^[a-z]+$/.test(f.folder) || !f.fileName || path.basename(f.fileName) !== f.fileName || f.fileName.startsWith('.')) return undefined;
  const root = path.resolve(gameDir);
  const dest = path.resolve(root, f.folder, f.fileName);
  return dest.startsWith(root + path.sep) ? dest : undefined;
}

/**
 * Copies the found files into the profile (checked once more, so a file changed since the scan
 * is not copied). Returns the keys of those now in place.
 */
export async function copyManualFiles(gameDir: string, files: ManualFile[], found: Map<string, string>): Promise<string[]> {
  const copied: string[] = [];
  for (const f of files) {
    const from = found.get(manualKey(f));
    const dest = manualDest(gameDir, f);
    if (!from || !dest) continue;
    const again = await findManualFiles([f], [], [from]);
    if (!again.has(manualKey(f))) continue;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const temp = `${dest}.${process.pid}.copying`;
    await fs.copyFile(from, temp);
    // the copy itself checked against the expected hash (a file changed since the scan may keep its size and time)
    if (f.sha1 && (await freshSha1(temp)) !== f.sha1.toLowerCase()) {
      await fs.rm(temp, { force: true });
      continue;
    }
    await fs.rename(temp, dest);
    copied.push(manualKey(f));
  }
  return copied;
}

/**
 * Watches folders while the dialog is open: fs.watch (debounced) plus a rescan every few seconds,
 * since watching is not reliable everywhere (network drives, some file systems).
 */
export class FolderWatch {
  private watchers: FSWatcher[] = [];
  private timer?: NodeJS.Timeout;
  private interval?: NodeJS.Timeout;

  constructor(private readonly onChange: () => void, private readonly debounceMs = 400, private readonly everyMs = 4000) {}

  start(folders: string[]) {
    this.stop();
    for (const dir of folders) {
      try {
        const w = watch(dir, () => this.poke());
        w.on('error', () => {});
        this.watchers.push(w);
      } catch {
        // a folder that is gone: the rescan still covers it if it comes back
      }
    }
    this.interval = setInterval(() => this.onChange(), this.everyMs);
  }

  private poke() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.onChange(), this.debounceMs);
  }

  stop() {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    clearTimeout(this.timer);
    clearInterval(this.interval);
    this.timer = this.interval = undefined;
  }
}
