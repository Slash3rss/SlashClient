import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import nodeFs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { fetchWatched } from './download';
import { throttled } from './rateLimit';
import { t } from '../shared/i18n';

// Electron's own fs looks into app.asar as if it were a folder (copying, unpacking and deleting the
// new version's app.asar then fails); original-fs handles it as the plain file it is
const fs: typeof nodeFs = process.versions.electron ? require('original-fs').promises : nodeFs;

/**
 * Updates on Windows without the installer, the way macOS does it (macUpdate.ts): instead of
 * uninstalling and installing again, the new files are downloaded in the background (the whole app,
 * or only its resources folder when the Electron underneath has not changed), checked against the
 * release's SHA-512 and unpacked next to the installed folder (<folder>.new). On restart (or quit)
 * a small PowerShell script waits for the launcher to close, renames the old folder to <folder>.old,
 * puts the new one in its place, updates the version Windows shows in "Apps", opens SlashClient
 * again and deletes the old folder; if anything fails, the old folder comes back. The path stays
 * the same, so shortcuts and the uninstaller keep working. Files the launcher writes itself carry
 * no Mark of the Web, so SmartScreen does not ask about the new version.
 * Only for the per-user installation (the installer's default, in %LOCALAPPDATA%\Programs): the
 * folder must be writable without administrator rights; otherwise the installer does the update.
 */

export interface WinFile { url: string; sha512: string; size?: number }

/** win-update-<version>.json of a release (scripts/win-update-artifacts.cjs). */
export interface WinManifest { version: string; electronVersion?: string; full: WinFile; app?: WinFile }

export const manifestName = (version: string) => `win-update-${version}.json`;

function isFile(f: unknown): f is WinFile {
  const x = f as WinFile | undefined;
  return !!x && typeof x.url === 'string' && /^[\w][\w.-]*\.zip$/.test(x.url) && typeof x.sha512 === 'string' && x.sha512.length > 40;
}

/** The release description, if it is one and for this version. */
export function parseManifest(data: unknown, version: string): WinManifest | undefined {
  const m = data as WinManifest | undefined;
  if (!m || m.version !== version || !isFile(m.full) || (m.app !== undefined && !isFile(m.app))) return undefined;
  return m;
}

/** Only the resources folder when the new version runs on the same Electron, else the whole app. */
export function pickWinArtifact(m: WinManifest, electron = process.versions.electron): { file: WinFile; appOnly: boolean } {
  if (m.app && m.electronVersion && m.electronVersion === electron) return { file: m.app, appOnly: true };
  return { file: m.full, appOnly: false };
}

/** The installed launcher, as far as updating it in place goes. */
export interface WinInstall {
  /** The installation folder (…\Programs\SlashClient). */
  dir: string;
  /** The launcher's executable in it. */
  exe: string;
  /** The NSIS uninstaller's file name ("Uninstall SlashClient.exe"); the release's zip has none. */
  uninstaller: string;
  /** Its entry in "Apps" (HKCU:\…\Uninstall\<guid>), where the shown version lives. */
  registryKey: string;
}

export interface UninstallEntry { key: string; uninstallString?: string }

const UNINSTALL_ROOT = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

/** The per-user "Apps" entry whose uninstaller is this one (electron-builder names the key after the app's id). */
export function findUninstallKey(entries: UninstallEntry[], uninstaller: string): string | undefined {
  const want = path.resolve(uninstaller).toLowerCase();
  for (const e of entries) {
    // "C:\…\Uninstall SlashClient.exe" /currentuser
    const m = /^\s*"([^"]+)"/.exec(e.uninstallString ?? '') ?? /^\s*(\S+)/.exec(e.uninstallString ?? '');
    if (m && path.resolve(m[1]).toLowerCase() === want && /^[\w{}. -]+$/.test(e.key)) return `${UNINSTALL_ROOT}\\${e.key}`;
  }
  return undefined;
}

const POWERSHELL = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

/** The current user's "Apps" entries (only HKCU: a per-machine installation needs administrator rights to update). */
export function readUninstallEntries(): Promise<UninstallEntry[]> {
  const script = [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    `$e = @(Get-ChildItem -LiteralPath '${UNINSTALL_ROOT}' -ErrorAction SilentlyContinue | ForEach-Object { @{ key = $_.PSChildName; uninstallString = [string]$_.GetValue('UninstallString') } })`,
    'ConvertTo-Json -InputObject $e -Compress',
  ].join('; ');
  return new Promise((resolve) => {
    execFile(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 20_000, encoding: 'utf8' }, (err, stdout) => {
      if (err) return resolve([]);
      try {
        const data = JSON.parse(stdout.trim() || '[]') as UninstallEntry | UninstallEntry[];
        resolve(Array.isArray(data) ? data : [data]);
      } catch {
        resolve([]);
      }
    });
  });
}

/** Whether files can be created in a folder (an actual write: permissions alone don't tell about Program Files). */
export async function canWrite(dir: string): Promise<boolean> {
  const probe = path.join(dir, `.slashclient-write-test-${process.pid}-${Date.now()}`);
  try {
    await fs.writeFile(probe, '');
    await fs.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * The installation this launcher runs from, when it can update itself in place; otherwise why not
 * (the installer then does the update, as before).
 */
export async function winInstall(execPath = process.execPath, entries: () => Promise<UninstallEntry[]> = readUninstallEntries): Promise<WinInstall | string> {
  // the portable build runs from a temporary copy
  if (process.env.PORTABLE_EXECUTABLE_DIR) return 'wersja przenośna';
  const dir = path.dirname(execPath);
  const uninstaller = (await fs.readdir(dir).catch(() => [] as string[])).find((f) => /^Uninstall .+\.exe$/i.test(f));
  if (!uninstaller) return 'nie zainstalowany instalatorem';
  if (!(await canWrite(dir)) || !(await canWrite(path.dirname(dir)))) return `brak prawa zapisu w ${dir}`;
  const registryKey = findUninstallKey(await entries(), path.join(dir, uninstaller));
  if (!registryKey) return 'brak wpisu instalacji dla bieżącego użytkownika';
  return { dir, exe: execPath, uninstaller, registryKey };
}

/** What the update leaves next to the installation: the download, the unpacked version, the replaced one. */
export const workDirs = (dir: string) => ({ download: `${dir}.update`, next: `${dir}.new`, old: `${dir}.old`, failed: `${dir}.failed` });

/** Removes what an earlier update left behind (run at start, before looking for a new version). */
export async function cleanupWinUpdate(dir: string): Promise<void> {
  for (const d of Object.values(workDirs(dir))) await fs.rm(d, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}

/** Downloads a file to `dest`, checking it against the release's SHA-512 (base64, as electron-builder writes it). */
export async function downloadVerified(url: string, file: WinFile, dest: string, progress: (percent: number) => void): Promise<void> {
  const { res, chunks } = await fetchWatched(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = file.size ?? Number(res.headers.get('content-length') ?? 0);
  const hash = createHash('sha512');
  const out = createWriteStream(dest);
  let got = 0;
  let shown = -1;
  try {
    for await (const chunk of throttled(chunks)) {
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      got += chunk.length;
      const percent = total ? Math.min(100, Math.floor((got / total) * 100)) : 0;
      if (percent !== shown) progress((shown = percent));
    }
  } finally {
    await new Promise<void>((resolve) => out.end(() => resolve()));
  }
  if (hash.digest('base64') !== file.sha512) throw new Error(t('Pobrana aktualizacja jest uszkodzona (zła suma kontrolna).'));
}

/** Unpacks a release zip into a folder (no entry may land outside it). */
export async function unpackZip(zip: string, into: string): Promise<void> {
  const root = path.resolve(into);
  const archive = new AdmZip(zip);
  for (const entry of archive.getEntries()) {
    const target = path.resolve(root, entry.entryName);
    if (!target.startsWith(root + path.sep)) throw new Error(t('W aktualizacji jest zła ścieżka.'));
    if (entry.isDirectory) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.getData());
  }
}

/**
 * Builds the new version's folder next to the installed one (<folder>.new): the whole app from the
 * zip, or a copy of the installed one with the new resources folder. The uninstaller comes along.
 */
export async function stageWinUpdate(install: WinInstall, zip: string, appOnly: boolean): Promise<string> {
  const { next } = workDirs(install.dir);
  await fs.rm(next, { recursive: true, force: true });
  const resources = path.join(install.dir, 'resources');
  if (appOnly) await fs.cp(install.dir, next, { recursive: true, filter: (src) => path.resolve(src) !== resources });
  else await fs.mkdir(next, { recursive: true });
  await unpackZip(zip, next);
  const exe = path.basename(install.exe);
  await fs.access(path.join(next, exe)).catch(() => { throw new Error(t('W aktualizacji nie ma {0}.', exe)); });
  await fs.access(path.join(next, 'resources', 'app.asar')).catch(() => { throw new Error(t('W aktualizacji nie ma aplikacji.')); });
  const uninstaller = path.join(next, install.uninstaller);
  if (!(await fs.access(uninstaller).then(() => true, () => false))) await fs.copyFile(path.join(install.dir, install.uninstaller), uninstaller);
  return next;
}

/** Downloads and stages a version; resolves to the new folder (<folder>.new). */
export async function downloadWinUpdate(feed: string, install: WinInstall, manifest: WinManifest, progress: (percent: number) => void, log?: (m: string) => void): Promise<string> {
  const { download } = workDirs(install.dir);
  await fs.rm(download, { recursive: true, force: true });
  await fs.mkdir(download, { recursive: true });
  const { file, appOnly } = pickWinArtifact(manifest);
  log?.(`pobieranie ${file.url} (${appOnly ? 'tylko aplikacja' : 'całość'}, ${file.size ?? '?'} B)`);
  const zip = path.join(download, 'update.zip');
  await downloadVerified(`${feed.replace(/\/$/, '')}/${encodeURIComponent(file.url)}`, file, zip, progress);
  try {
    return await stageWinUpdate(install, zip, appOnly);
  } finally {
    await fs.rm(download, { recursive: true, force: true }).catch(() => {});
  }
}

/** A string literal for PowerShell ('…'; it also takes the typographic quotes as quotes). */
export function psQuote(s: string): string {
  return `'${s.replace(/['\u2018\u2019\u201A\u201B]/g, (q) => q + q)}'`;
}

/** One command-line argument as Windows programs read it (CommandLineToArgvW rules). */
export function winArg(a: string): string {
  if (a && !/[\s"]/.test(a)) return a;
  return `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

export interface SwapOptions {
  /** The launcher's process, waited for. */
  pid: number;
  install: WinInstall;
  /** The staged new version (<folder>.new). */
  next: string;
  version: string;
  /** Where the script writes what it did. */
  log: string;
  /** Open SlashClient again afterwards, with these arguments (null: the player quit). */
  relaunch: string[] | null;
  /** Seconds to wait for the launcher's processes before giving up (the old version stays). */
  waitSeconds?: number;
  /** Tries of each file step, half a second apart. */
  retries?: number;
}

/**
 * The PowerShell script that swaps the folders once the launcher has quit. Every step that touches
 * the files is retried for a while (antivirus scanners hold new files open for a moment); when the
 * new folder cannot be put in place the old one is moved back.
 */
export function swapScript(o: SwapOptions): string {
  const { dir } = o.install;
  const { old, failed } = workDirs(dir);
  const wait = o.waitSeconds ?? 60;
  const retries = o.retries ?? 40;
  const args = o.relaunch?.length ? ` -ArgumentList ${psQuote(o.relaunch.map(winArg).join(' '))}` : '';
  return [
    `$ErrorActionPreference = 'Stop'`,
    `$dir = ${psQuote(dir)}; $next = ${psQuote(o.next)}; $old = ${psQuote(old)}; $failed = ${psQuote(failed)}`,
    `$exe = ${psQuote(o.install.exe)}; $log = ${psQuote(o.log)}; $key = ${psQuote(o.install.registryKey)}; $version = ${psQuote(o.version)}`,
    `function Log([string]$m) { try { Add-Content -LiteralPath $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' [aktualizacja] ' + $m) -Encoding UTF8 } catch {} }`,
    `function Retry([scriptblock]$step, [string]$what) { for ($i = 1; ; $i++) { try { & $step; return } catch { if ($i -ge ${retries}) { throw ($what + ': ' + $_.Exception.Message) }; Start-Sleep -Milliseconds 500 } } }`,
    `Log ('start ' + $version + ' -> ' + $dir)`,
    // the launcher, then whatever else still runs from its folder (its helper processes)
    `try { Wait-Process -Id ${o.pid} -Timeout ${wait} -ErrorAction Stop } catch {}`,
    `$until = (Get-Date).AddSeconds(${wait})`,
    `do { $busy = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dir + '\\', [StringComparison]::OrdinalIgnoreCase) }); if ($busy.Count -eq 0) { break }; Start-Sleep -Milliseconds 300 } while ((Get-Date) -lt $until)`,
    `$ok = $false`,
    `if ($busy.Count -gt 0) { Log ('wciąż działa z tego folderu: ' + (($busy | ForEach-Object { $_.Id }) -join ', ') + '; bez zmian') }`,
    `elseif (-not (Test-Path -LiteralPath $next)) { Log 'brak nowej wersji; bez zmian' }`,
    `else {`,
    `  try {`,
    `    if (Test-Path -LiteralPath $old) { Retry { Remove-Item -LiteralPath $old -Recurse -Force } 'usuwanie starej kopii' }`,
    `    Retry { Move-Item -LiteralPath $dir -Destination $old } 'odsuwanie obecnej wersji'`,
    `    try {`,
    `      Retry { Move-Item -LiteralPath $next -Destination $dir } 'wstawianie nowej wersji'`,
    `      if (-not (Test-Path -LiteralPath $exe)) { throw ('brak ' + $exe) }`,
    `      foreach ($u in @(Get-ChildItem -LiteralPath $old -Filter 'Uninstall *.exe')) { $t = Join-Path $dir $u.Name; if (-not (Test-Path -LiteralPath $t)) { Copy-Item -LiteralPath $u.FullName -Destination $t } }`,
    `      $ok = $true`,
    `    } catch {`,
    `      Log ('wycofywanie: ' + $_.Exception.Message)`,
    `      if (Test-Path -LiteralPath $dir) { $away = $next; if (Test-Path -LiteralPath $next) { $away = $failed }; Retry { Move-Item -LiteralPath $dir -Destination $away } 'odsuwanie nowej wersji' }`,
    `      Retry { Move-Item -LiteralPath $old -Destination $dir } 'przywracanie poprzedniej wersji'`,
    `      Log 'przywrócono poprzednią wersję'`,
    `    }`,
    `  } catch { Log ('bez zmian: ' + $_.Exception.Message) }`,
    `}`,
    `if ($ok) { try { Set-ItemProperty -LiteralPath $key -Name DisplayVersion -Value $version } catch { Log ('rejestr: ' + $_.Exception.Message) }; Log ('zaktualizowano do ' + $version) }`,
    o.relaunch ? `try { Start-Process -FilePath $exe -WorkingDirectory $dir${args} } catch { Log ('uruchamianie: ' + $_.Exception.Message) }` : '',
    `if ($ok) { try { Retry { Remove-Item -LiteralPath $old -Recurse -Force } 'usuwanie starej wersji' } catch { Log $_.Exception.Message } }`,
    // this script's own folder (PowerShell has read it already)
    `try { Remove-Item -LiteralPath ${psQuote(workDirs(dir).download)} -Recurse -Force } catch {}`,
  ].filter(Boolean).join('\r\n');
}

/** Appends a line to the update log (the swap script writes to the same file). */
export function appendUpdateLog(file: string, message: string): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    // local time, as the script writes it
    const d = new Date();
    const stamp = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().replace('T', ' ').slice(0, 19);
    appendFileSync(file, `${stamp} [launcher] ${message}\r\n`, 'utf8');
  } catch {
    // only a log
  }
}

/**
 * Writes the script next to the download and starts it so it outlives the launcher. PowerShell
 * started detached (without a console) quits at once, and a child started normally is ended with the
 * launcher (Node keeps its children in a job object). So a short-lived PowerShell starts the script
 * with Start-Process: that one leaves the job, gets its own hidden console and keeps running.
 * Synchronous (about half a second): it also runs while the launcher quits.
 */
export function startSwap(o: SwapOptions): void {
  const { download } = workDirs(o.install.dir);
  mkdirSync(download, { recursive: true });
  mkdirSync(path.dirname(o.log), { recursive: true });
  const file = path.join(download, 'swap.ps1');
  // with a BOM: Windows PowerShell reads a file without one in the system's code page (Polish paths)
  writeFileSync(file, `\uFEFF${swapScript(o)}\r\n`, 'utf8');
  const cwd = path.dirname(o.install.dir);
  // the paths go through the environment, so no quoting can break the command
  const start = 'Start-Process -FilePath $env:SLASHCLIENT_SWAP_PS -WindowStyle Hidden -WorkingDirectory $env:SLASHCLIENT_SWAP_CWD'
    + ` -ArgumentList ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $env:SLASHCLIENT_SWAP_FILE + '"')`;
  const res = spawnSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', start], {
    windowsHide: true, stdio: 'ignore', timeout: 20_000, cwd,
    env: { ...process.env, SLASHCLIENT_SWAP_PS: POWERSHELL, SLASHCLIENT_SWAP_CWD: cwd, SLASHCLIENT_SWAP_FILE: file },
  });
  if (res.status !== 0) throw new Error(t('Nie udało się uruchomić podmiany plików ({0}).', res.error?.message ?? t('kod {0}', String(res.status))));
}
