import { app } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { netFetch } from './download';
import { throttled } from './rateLimit';

/**
 * Updates on macOS without Apple's signature: macOS lets only signed apps replace themselves
 * through its own updater, so SlashClient does it by hand. The new version's .zip (the one for
 * this Mac's processor) is downloaded from the SlashClient server and checked against the
 * feed's SHA-512, unpacked next to the old files, and on restart a small script waits for the
 * launcher to close, puts the new SlashClient.app in place of the old one and opens it.
 * Files the launcher downloads itself carry no quarantine flag, so macOS does not ask again.
 */

export interface MacFile { url: string; sha512: string; size?: number }

/** The .zip for this processor among the release's files (arm64 ones say so in the name). */
export function pickMacZip(files: MacFile[], arch = process.arch): MacFile | undefined {
  const zips = files.filter((f) => f.url.endsWith('.zip'));
  return arch === 'arm64' ? zips.find((f) => /arm64/.test(f.url)) : zips.find((f) => !/arm64/.test(f.url));
}

/** The running SlashClient.app, or undefined when it cannot replace itself (not packaged, or run from a read-only place). */
export async function appBundle(execPath = process.execPath): Promise<string | undefined> {
  const bundle = path.resolve(execPath, '..', '..', '..');
  if (!bundle.endsWith('.app')) return undefined;
  // opened straight from the download (macOS runs it from a random read-only copy) or from the disk image
  if (bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return undefined;
  try {
    await fs.access(path.dirname(bundle), fs.constants.W_OK);
    await fs.access(bundle, fs.constants.W_OK);
    return bundle;
  } catch {
    return undefined;
  }
}

const workDir = () => path.join(app.getPath('userData'), 'update');

/** Downloads and unpacks a version; resolves to the unpacked app (named SlashClient.next until the swap). */
export async function downloadMacUpdate(feed: string, version: string, file: MacFile, progress: (percent: number) => void): Promise<string> {
  const dir = workDir();
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const zip = path.join(dir, `SlashClient-${version}.zip`);
  const res = await netFetch(`${feed.replace(/\/$/, '')}/${encodeURIComponent(file.url)}`);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = file.size ?? Number(res.headers.get('content-length') ?? 0);
  const hash = createHash('sha512');
  const out = createWriteStream(zip);
  let got = 0;
  let shown = -1;
  for await (const chunk of throttled(res.body as unknown as AsyncIterable<Uint8Array>)) {
    hash.update(chunk);
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    got += chunk.length;
    const percent = total ? Math.floor((got / total) * 100) : 0;
    if (percent !== shown) progress((shown = percent));
  }
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  if (hash.digest('base64') !== file.sha512) throw new Error('Pobrana aktualizacja jest uszkodzona (zła suma kontrolna).');
  // macOS 15 lets no unsigned app write into another app's bundle, so the new one is unpacked under
  // a name that is not one yet (SlashClient.app → SlashClient.next); the swap script names it back
  const unpacked = path.join(dir, 'app');
  const name = await unpackApp(zip, unpacked);
  await fs.rm(zip, { force: true });
  return path.join(unpacked, name);
}

/**
 * Unpacks the release's .zip with the app folder renamed <name>.next, keeping what an app needs:
 * the links inside its frameworks and the files' permissions. Resolves to the folder's name.
 */
export async function unpackApp(zip: string, into: string): Promise<string> {
  const archive = new AdmZip(zip);
  let top = '';
  for (const entry of archive.getEntries()) {
    const [first] = entry.entryName.split('/');
    if (!first.endsWith('.app')) continue;
    top = `${first.slice(0, -4)}.next`;
    const target = path.join(into, top, entry.entryName.slice(first.length));
    if (!path.resolve(target).startsWith(path.resolve(into) + path.sep)) throw new Error('W aktualizacji jest zła ścieżka.');
    const mode = (entry.header.attr >>> 16) & 0o170777;
    if (entry.isDirectory) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    if ((mode & 0o170000) === 0o120000) await fs.symlink(entry.getData().toString('utf8'), target);
    else await fs.writeFile(target, entry.getData(), { mode: mode & 0o777 || 0o644 });
  }
  if (!top) throw new Error('W aktualizacji nie ma aplikacji.');
  return top;
}

/** The script that swaps the apps once the launcher has quit, and opens the new one (the old one comes back if anything fails). */
export function swapScript(pid: number, current: string, next: string, open = 'open'): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return [
    `while kill -0 ${pid} 2>/dev/null; do sleep 0.3; done`,
    `rm -rf ${q(`${current}.old`)}`,
    `if mv ${q(current)} ${q(`${current}.old`)} && mv ${q(next)} ${q(current)}; then`,
    `  rm -rf ${q(`${current}.old`)}`,
    `  xattr -dr com.apple.quarantine ${q(current)} 2>/dev/null`,
    `else`,
    `  [ -d ${q(`${current}.old`)} ] && [ ! -d ${q(current)} ] && mv ${q(`${current}.old`)} ${q(current)}`,
    `fi`,
    `${open} ${q(current)}`,
  ].join('\n');
}

/** Quits and lets the script put the new version in place. */
export function installMacUpdate(current: string, next: string): void {
  const child = spawn('/bin/sh', ['-c', swapScript(process.pid, current, next)], { detached: true, stdio: 'ignore' });
  child.unref();
  app.quit();
}
