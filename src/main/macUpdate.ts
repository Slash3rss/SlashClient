import { app } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import nodeFs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { fetchWatched } from './download';
import { throttled } from './rateLimit';
import { t } from '../shared/i18n';

// Electron treats app.asar as a virtual directory. Update bundles must be handled
// as real files, including cleanup and replacing an archive left by a failed unpack.
const diskFs: typeof import('node:fs') = process.versions.electron ? require('original-fs') : require('node:fs');
const fs: typeof nodeFs = diskFs.promises;
const { createWriteStream } = diskFs;

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

/** Why the running app cannot replace itself: opened from the download or the disk image (moving it to Applications helps), or no right to write there. */
export type BundleProblem = 'not-packaged' | 'translocated' | 'disk-image' | 'read-only';

/** The running SlashClient.app, or why it cannot replace itself. */
export async function bundleState(execPath = process.execPath): Promise<{ bundle: string } | { problem: BundleProblem }> {
  const bundle = path.resolve(execPath, '..', '..', '..');
  if (!bundle.endsWith('.app')) return { problem: 'not-packaged' };
  // opened straight from the download (macOS runs it from a random read-only copy) or from the disk image
  const where = bundle.replace(/\\/g, '/');
  if (where.includes('/AppTranslocation/')) return { problem: 'translocated' };
  if (/^([A-Za-z]:)?\/Volumes\//.test(where)) return { problem: 'disk-image' };
  try {
    await fs.access(path.dirname(bundle), fs.constants.W_OK);
    await fs.access(bundle, fs.constants.W_OK);
    return { bundle };
  } catch {
    return { problem: 'read-only' };
  }
}

/** The running SlashClient.app, or undefined when it cannot replace itself (not packaged, or run from a read-only place). */
export async function appBundle(execPath = process.execPath): Promise<string | undefined> {
  const state = await bundleState(execPath);
  return 'bundle' in state ? state.bundle : undefined;
}

const workDir = () => path.join(app.getPath('userData'), 'update');

/**
 * Removes a folder that may hold an old unpacked app. macOS can still be adding to a bundle being
 * removed (Spotlight, quarantine), so a plain removal may fail with ENOTEMPTY: it is retried, and
 * when it still fails the folder is moved out of the way (renaming always works) and removed later.
 */
export async function clearDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    const aside = `${dir}.old-${Date.now()}`;
    await fs.rename(dir, aside);
    void fs.rm(aside, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }).catch(() => {});
  }
}

/** Downloads and unpacks a version; resolves to the unpacked app (named SlashClient.next until the swap). */
export async function downloadMacUpdate(feed: string, version: string, file: MacFile, progress: (percent: number) => void): Promise<string> {
  const dir = workDir();
  await clearDir(dir);
  // what an earlier failed removal moved aside
  const parent = path.dirname(dir);
  for (const old of (await fs.readdir(parent).catch(() => [] as string[])).filter((n) => n.startsWith(`${path.basename(dir)}.old-`))) {
    void fs.rm(path.join(parent, old), { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }).catch(() => {});
  }
  await fs.mkdir(dir, { recursive: true });
  const zip = path.join(dir, `SlashClient-${version}.zip`);
  const { res, chunks } = await fetchWatched(`${feed.replace(/\/$/, '')}/${encodeURIComponent(file.url)}`);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = file.size ?? Number(res.headers.get('content-length') ?? 0);
  const hash = createHash('sha512');
  const out = createWriteStream(zip);
  let got = 0;
  let shown = -1;
  for await (const chunk of throttled(chunks)) {
    hash.update(chunk);
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    got += chunk.length;
    const percent = total ? Math.floor((got / total) * 100) : 0;
    if (percent !== shown) progress((shown = percent));
  }
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  if (hash.digest('base64') !== file.sha512) throw new Error(t('Pobrana aktualizacja jest uszkodzona (zła suma kontrolna).'));
  // macOS 15 lets no unsigned app write into another app's bundle, so the new one is unpacked under
  // a name that is not one yet (SlashClient.app → SlashClient.next); the swap script names it back
  const unpacked = path.join(dir, 'app');
  const name = await unpackRelease(zip, unpacked);
  await fs.rm(zip, { force: true });
  return path.join(unpacked, name);
}

/**
 * Unpacks the release on macOS with the system's own ditto (as Finder does: links, permissions and
 * attributes exactly as packed), into a staging folder, then names the app <name>.next; anything
 * ditto cannot do falls back to unpackApp.
 */
export async function unpackRelease(zip: string, into: string): Promise<string> {
  if (process.platform !== 'darwin') return unpackApp(zip, into);
  const staging = `${into}.ditto`;
  try {
    await clearDir(staging);
    await new Promise<void>((resolve, reject) => execFile('/usr/bin/ditto', ['-x', '-k', zip, staging], (err, _out, stderr) => (err ? reject(new Error(`ditto: ${stderr || err.message}`.trim())) : resolve())));
    const app = (await fs.readdir(staging)).find((n) => n.endsWith('.app'));
    if (!app) throw new Error(t('W aktualizacji nie ma aplikacji.'));
    const name = `${app.slice(0, -4)}.next`;
    await fs.mkdir(into, { recursive: true });
    await fs.rename(path.join(staging, app), path.join(into, name));
    await fs.rm(staging, { recursive: true, force: true });
    return name;
  } catch (err) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    await fs.rm(into, { recursive: true, force: true }).catch(() => {});
    console.error(`Aktualizacja (macOS): ${(err as Error).message}; rozpakowywanie po swojemu`);
    return unpackApp(zip, into);
  }
}

/**
 * Unpacks the release's .zip with the app folder renamed <name>.next, keeping what an app needs:
 * the links inside its frameworks and the files' permissions. Resolves to the folder's name.
 */
export async function unpackApp(zip: string, into: string): Promise<string> {
  const archive = new AdmZip(zip);
  let top = '';
  // links last: one may come before the folder it points to, and a folder made for files under a link's name gives way to it
  const links: { target: string; to: string }[] = [];
  for (const entry of archive.getEntries()) {
    const [first] = entry.entryName.split('/');
    if (!first.endsWith('.app')) continue;
    top = `${first.slice(0, -4)}.next`;
    const target = path.join(into, top, entry.entryName.slice(first.length));
    if (!path.resolve(target).startsWith(path.resolve(into) + path.sep)) throw new Error(t('W aktualizacji jest zła ścieżka.'));
    const mode = (entry.header.attr >>> 16) & 0o170777;
    if (entry.isDirectory) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    if ((mode & 0o170000) === 0o120000) {
      links.push({ target, to: entry.getData().toString('utf8') });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.getData(), { mode: mode & 0o777 || 0o644 });
  }
  for (const { target, to } of links) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rm(target, { recursive: true, force: true });
    await fs.symlink(to, target);
  }
  if (!top) throw new Error(t('W aktualizacji nie ma aplikacji.'));
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
