import fs from 'node:fs/promises';
import path from 'node:path';
import { t } from '../shared/i18n';

/**
 * The config editor's files: everything in a profile's config/ folder. The page only ever
 * sends paths relative to that folder; each one is checked here so nothing outside it
 * (`..`, absolute paths, links pointing elsewhere) is read or written.
 */

/** Bigger files are not opened in the editor (a mod's config is a few KB; this is a log or a cache). */
export const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
/** The tree stops here, so a folder full of generated files cannot freeze the page. */
const MAX_FILES = 5000;
const MAX_DEPTH = 12;

export interface ConfigEntry {
  /** Relative to config/, with forward slashes. */
  path: string;
  size: number;
  modifiedAt: number;
}

export interface ConfigFile {
  path: string;
  /** With "\n" line ends and no byte order mark; `crlf` and `bom` put them back on save. */
  text: string;
  crlf: boolean;
  bom: boolean;
  modifiedAt: number;
  size: number;
}

export const configDir = (gameDir: string) => path.join(gameDir, 'config');

const inside = (root: string, file: string) => file.startsWith(root + path.sep);
/** Real paths compare without case on Windows (realpath may spell the drive or folders differently). */
const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);

/**
 * The absolute path of a file in config/, or an error for anything that leaves it. Checks the
 * real location too, so a link inside config/ cannot lead out of it.
 */
export async function resolveConfigPath(gameDir: string, rel: string): Promise<string> {
  const root = path.resolve(configDir(gameDir));
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new Error(t('Nieprawidłowa ścieżka pliku.'));
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => p === '..' || p === '.')) throw new Error(t('Nieprawidłowa ścieżka pliku.'));
  const full = path.resolve(root, ...parts);
  if (!inside(root, full)) throw new Error(t('Nieprawidłowa ścieżka pliku.'));
  const realRoot = norm(await fs.realpath(root).catch(() => root));
  // the deepest part that exists must really be inside config/ (a new file's folder may not exist yet)
  let probe = full;
  while (inside(root, probe)) {
    const real = await fs.realpath(probe).then(norm, () => undefined);
    if (real !== undefined) {
      if (real !== realRoot && !inside(realRoot, real)) throw new Error(t('Nieprawidłowa ścieżka pliku.'));
      break;
    }
    probe = path.dirname(probe);
  }
  return full;
}

/** Every file in config/ (links are not followed), sorted by path. */
export async function listConfigFiles(gameDir: string): Promise<{ files: ConfigEntry[]; truncated: boolean }> {
  const root = configDir(gameDir);
  const files: ConfigEntry[] = [];
  let truncated = false;
  const walk = async (dir: string, rel: string, depth: number) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) await walk(full, relPath, depth + 1);
        else truncated = true;
      } else if (entry.isFile()) {
        const st = await fs.stat(full).catch(() => undefined);
        if (st) files.push({ path: relPath, size: st.size, modifiedAt: st.mtimeMs });
      }
    }
  };
  await walk(root, '', 0);
  files.sort((a, b) => a.path.localeCompare(b.path, 'en', { sensitivity: 'base' }));
  return { files, truncated };
}

/** True when the bytes look like a binary file (a NUL in the first 8 KB). */
export function looksBinary(data: Buffer): boolean {
  return data.subarray(0, 8192).includes(0);
}

export async function readConfigFile(gameDir: string, rel: string): Promise<ConfigFile> {
  const file = await resolveConfigPath(gameDir, rel);
  const st = await fs.stat(file).catch(() => undefined);
  if (!st?.isFile()) throw new Error(t('Nie ma już tego pliku.'));
  if (st.size > MAX_CONFIG_BYTES) throw new Error(t('Plik jest za duży do edycji ({0} MB, najwyżej {1} MB).', (st.size / 1024 / 1024).toFixed(1), MAX_CONFIG_BYTES / 1024 / 1024));
  const data = await fs.readFile(file);
  if (looksBinary(data)) throw new Error(t('To plik binarny, nie da się go edytować jako tekst.'));
  let text = data.toString('utf8');
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  const crlf = /\r\n/.test(text);
  return { path: rel, text: text.replace(/\r\n/g, '\n'), crlf, bom, modifiedAt: st.mtimeMs, size: st.size };
}

export interface SaveOptions {
  crlf?: boolean;
  bom?: boolean;
  /** When the file was opened: a mod that rewrote it since then is not overwritten without `force`. */
  modifiedAt?: number;
  force?: boolean;
}

/** Thrown when the file changed on disk after it was opened; the page asks before overwriting. */
export const CHANGED_ON_DISK = 'config:changed';

/** Saves through a temporary file, so a crash never leaves half a config behind. Returns the new modification time. */
export async function writeConfigFile(gameDir: string, rel: string, text: string, opts: SaveOptions = {}): Promise<number> {
  if (typeof text !== 'string') throw new Error(t('Nieprawidłowa treść pliku.'));
  const file = await resolveConfigPath(gameDir, rel);
  if (Buffer.byteLength(text) > MAX_CONFIG_BYTES) throw new Error(t('Plik jest za duży do edycji ({0} MB, najwyżej {1} MB).', (Buffer.byteLength(text) / 1024 / 1024).toFixed(1), MAX_CONFIG_BYTES / 1024 / 1024));
  const st = await fs.stat(file).catch(() => undefined);
  if (st && !st.isFile()) throw new Error(t('Nieprawidłowa ścieżka pliku.'));
  if (st && opts.modifiedAt !== undefined && !opts.force && Math.abs(st.mtimeMs - opts.modifiedAt) > 1) throw new Error(CHANGED_ON_DISK);
  const body = (opts.bom ? '﻿' : '') + (opts.crlf ? text.replace(/\r?\n/g, '\r\n') : text);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, body);
  try {
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  return (await fs.stat(file)).mtimeMs;
}

/**
 * "Restore defaults": the file goes away (to the system trash, or renamed to .bak when there is
 * no trash) and the mod writes a fresh one with its defaults the next time the game starts.
 * Returns where it went.
 */
export async function restoreDefaultConfig(gameDir: string, rel: string, trash: (file: string) => Promise<void>): Promise<'trash' | 'bak'> {
  const file = await resolveConfigPath(gameDir, rel);
  const st = await fs.stat(file).catch(() => undefined);
  if (!st?.isFile()) throw new Error(t('Nie ma już tego pliku.'));
  try {
    await trash(file);
    return 'trash';
  } catch {
    let bak = `${file}.bak`;
    for (let n = 2; await fs.stat(bak).then(() => true, () => false); n++) bak = `${file}.${n}.bak`;
    await fs.rename(file, bak);
    return 'bak';
  }
}
