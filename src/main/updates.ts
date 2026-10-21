import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { bundleState, downloadMacUpdate, installMacUpdate, pickMacZip, type BundleProblem, type MacFile } from './macUpdate';
import { netFetch } from './download';
import { appendUpdateLog, cleanupWinUpdate, downloadWinUpdate, manifestName, parseManifest, startSwap, winInstall, type WinInstall } from './winUpdate';

/** What the update bar and Settings show. */
export interface UpdateStatus {
  state: 'dev' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  /** macOS: the new version is downloaded by hand from the website (see below). */
  manual?: boolean;
  /** macOS, with `manual`: why the launcher could not update itself ('failed': the download or unpacking went wrong). */
  reason?: BundleProblem | 'no-file' | 'failed';
  error?: string;
}

export interface UpdateOptions {
  /** The SlashClient server: its /aktualizacje is the update feed. */
  serverUrl: () => string;
  send: (status: UpdateStatus) => void;
  onLog?: (message: string) => void;
}

/**
 * Updates come from the SlashClient server, which serves the latest GitHub release of the
 * (private) repository: latest*.yml from itself, the files as short-lived links. Windows and
 * Linux download in the background and install on restart. macOS builds are not signed, and
 * macOS only lets signed apps replace themselves through its updater: there SlashClient downloads
 * and swaps the app itself (macUpdate.ts); only when it cannot (run from the disk image or a
 * folder it may not write to) the player gets a download button. Windows swaps the files in
 * place the same way (winUpdate.ts) when the launcher is installed for the current user; otherwise,
 * or when that fails, electron-updater runs the installer as before.
 */
const MANUAL = process.platform === 'darwin';
/** macOS: the unpacked new SlashClient.app and the one it replaces, once downloaded. */
let macReady: { current: string; next: string } | undefined;
let macDownloading = false;
/** macOS: the last update found, so "Spróbuj ponownie" downloads it again straight away. */
let macLast: { feed: string; version: string; files: MacFile[]; onLog?: (message: string) => void } | undefined;
/** Windows: the installation that updates itself in place (undefined: the installer does it). */
let winInstalled: WinInstall | undefined;
/** Windows: the staged new version, once downloaded. */
let winReady: { next: string; version: string } | undefined;
let winDownloading = false;
let winSwapped = false;
let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'dev' };
let send: (status: UpdateStatus) => void = () => {};

function set(next: UpdateStatus) {
  status = next;
  send(status);
}

/** The update feed: the server's /aktualizacje, or SLASHCLIENT_UPDATE_URL (for testing updates against a local feed). */
function feedUrl(server: string): string {
  return (process.env.SLASHCLIENT_UPDATE_URL || `${server.replace(/\/$/, '')}/aktualizacje`).replace(/\/$/, '');
}

export function startUpdateChecks({ serverUrl, send: sendStatus, onLog }: UpdateOptions): void {
  send = sendStatus;
  if (!app.isPackaged) return;
  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl(serverUrl()) });
  autoUpdater.autoDownload = !MANUAL;
  autoUpdater.autoInstallOnAppQuit = !MANUAL;
  autoUpdater.on('checking-for-update', () => {
    // a found or downloaded update stays on screen while the next check runs
    if (!['available', 'downloading', 'ready'].includes(status.state)) set({ state: 'checking' });
  });
  autoUpdater.on('update-not-available', () => set({ state: 'none' }));
  autoUpdater.on('update-available', (info) => {
    if (winInstalled) return void winDownload(feedUrl(serverUrl()), info.version, onLog);
    if (!MANUAL) return set({ state: 'downloading', version: info.version, percent: 0 });
    void macDownload(feedUrl(serverUrl()), info.version, info.files as MacFile[], onLog);
  });
  autoUpdater.on('download-progress', (p) => set({ ...status, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    onLog?.(`Aktualizacja: ${err.message}`);
    if (status.state !== 'ready') set({ state: 'error', error: err.message });
  });
  void (async () => {
    if (process.platform === 'win32') await winSetup(onLog);
    await checkForUpdates();
  })();
  setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000);
}

const updateLog = () => path.join(app.getPath('logs'), 'update.log');

/** Windows: what the in-place update does goes to logs/update.log too (next to what the swap script writes). */
function winLog(message: string, onLog?: (message: string) => void) {
  onLog?.(`Aktualizacja (Windows): ${message}`);
  appendUpdateLog(updateLog(), message);
}

/** Windows: whether this installation updates itself in place (it then downloads by itself, not the installer). */
async function winSetup(onLog?: (message: string) => void) {
  const found = await winInstall().catch((err: Error) => err.message);
  if (typeof found === 'string') return winLog(`instalatorem (${found})`, onLog);
  await cleanupWinUpdate(found.dir);
  winInstalled = found;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // quitting with a downloaded update puts it in place too (as the installer would), without reopening
  app.on('will-quit', () => {
    if (winReady && !winSwapped) winSwap(null, onLog);
  });
}

/** Windows: downloads the new version next to the installed one, or leaves it to the installer. */
async function winDownload(feed: string, version: string, onLog?: (message: string) => void) {
  const install = winInstalled;
  if (!install || winDownloading || winReady?.version === version) return;
  winDownloading = true;
  // a newer version than the one already downloaded replaces it
  winReady = undefined;
  try {
    set({ state: 'downloading', version, percent: 0 });
    const res = await netFetch(`${feed}/${manifestName(version)}`);
    const manifest = res.ok ? parseManifest(await res.json().catch(() => undefined), version) : undefined;
    if (!manifest) throw new Error(`brak ${manifestName(version)} (HTTP ${res.status})`);
    const next = await downloadWinUpdate(feed, install, manifest, (percent) => set({ state: 'downloading', version, percent }), (m) => winLog(m, onLog));
    winReady = { next, version };
    winLog(`${version} gotowa w ${next}`, onLog);
    set({ state: 'ready', version });
  } catch (err) {
    winLog(`${(err as Error).message}; pobieranie instalatora`, onLog);
    await cleanupWinUpdate(install.dir);
    // the installer, as before this existed
    winInstalled = undefined;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    void autoUpdater.downloadUpdate().catch(() => {});
  } finally {
    winDownloading = false;
  }
}

/** Windows: starts the script that swaps the folders once the launcher has quit. */
function winSwap(relaunch: string[] | null, onLog?: (message: string) => void) {
  if (!winInstalled || !winReady) return;
  winSwapped = true;
  try {
    startSwap({ pid: process.pid, install: winInstalled, next: winReady.next, version: winReady.version, log: updateLog(), relaunch });
  } catch (err) {
    winLog((err as Error).message, onLog);
  }
}

/** macOS: downloads the new version in the background, or falls back to the download button. */
async function macDownload(feed: string, version: string, files: MacFile[], onLog?: (message: string) => void) {
  macLast = { feed, version, files, onLog };
  if (macDownloading || (macReady && status.version === version)) return;
  // taken at once, before anything is awaited: two checks at the same moment (the start, the hourly
  // one, "Spróbuj ponownie") would otherwise both download into the same folder and delete each
  // other's files (a download stuck at 0%, "ENOTEMPTY" while unpacking)
  macDownloading = true;
  const manual = (reason: NonNullable<UpdateStatus['reason']>, error?: string) => {
    macLog(`bez samodzielnej podmiany (${reason})${error ? `: ${error}` : ''}`, onLog);
    set({ state: 'available', version, manual: true, reason, ...(error ? { error } : {}) });
  };
  try {
    const state = await bundleState();
    const file = pickMacZip(files ?? []);
    if (!('bundle' in state)) return manual(state.problem);
    if (!file) return manual('no-file');
    const current = state.bundle;
    set({ state: 'downloading', version, percent: 0 });
    // the steps go to logs/update.log too: a download that stops can be told apart from one that never started
    macLog(`pobieranie ${version}: ${file.url} (${Math.round((file.size ?? 0) / 1e6)} MB)`, onLog);
    let logged = 0;
    const next = await downloadMacUpdate(feed, version, file, (percent) => {
      set({ state: 'downloading', version, percent });
      if (percent >= logged + 25) macLog(`pobrano ${(logged = percent)}%`, onLog);
    });
    macLog(`gotowe: ${next}`, onLog);
    macReady = { current, next };
    set({ state: 'ready', version });
  } catch (err) {
    manual('failed', (err as Error).message);
  } finally {
    macDownloading = false;
  }
}

/** macOS: what the update does goes to logs/update.log too, so a failed one can be told about. */
function macLog(message: string, onLog?: (message: string) => void) {
  onLog?.(`Aktualizacja (macOS): ${message}`);
  appendUpdateLog(updateLog(), message);
}

/** Checks now (the button in Settings); the result also arrives as a status event. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status;
  await autoUpdater.checkForUpdates().catch(() => {});
  return status;
}

export function updateStatus(): UpdateStatus {
  return status;
}

/** macOS: tries the download again (after a failed one). */
export async function retryMacUpdate(): Promise<void> {
  if (process.platform !== 'darwin' || !app.isPackaged) return;
  // the update already found: downloaded again now (a new check could find nothing new to say)
  if (macLast && !macDownloading) return macDownload(macLast.feed, macLast.version, macLast.files, macLast.onLog);
  status = { ...status, manual: false };
  await autoUpdater.checkForUpdates().catch(() => {});
}

/** macOS: moves SlashClient into Applications (Electron asks for the password if needed) and starts it from there, where it can update itself. */
export function moveToApplications(): boolean {
  if (process.platform !== 'darwin' || app.isInApplicationsFolder()) return false;
  // an older copy already in Applications is replaced by this newer one
  return app.moveToApplicationsFolder({ conflictHandler: () => true });
}

export function installUpdate(): void {
  if (MANUAL) {
    if (macReady) installMacUpdate(macReady.current, macReady.next);
    return;
  }
  if (winInstalled) {
    if (!winReady) return;
    winSwap(process.argv.slice(1));
    app.quit();
    return;
  }
  autoUpdater.quitAndInstall();
}
