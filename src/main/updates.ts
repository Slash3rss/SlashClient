import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compareVersion, pauseMarker, pausedUntil } from '../../server/src/releaseNotes';
import { pauseHolds, pauseOver } from '../shared/launcherReleases';
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
  /** After going back to an older version: automatic updates wait for a release newer than this one. */
  pausedUntil?: string;
  /** The older version being downloaded to go back to (the update bar says so). */
  rollback?: string;
}

/** Where the pause after going back to an older version is kept (the player's settings). */
export interface PauseStore {
  get: () => string | undefined;
  set: (version: string | undefined) => Promise<void> | void;
}

export interface UpdateOptions {
  /** The SlashClient server: its /aktualizacje is the update feed. */
  serverUrl: () => string;
  send: (status: UpdateStatus) => void;
  onLog?: (message: string) => void;
  pause?: PauseStore;
  /** The player chose the beta channel (Settings): betas come too. */
  beta?: () => boolean;
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
let pause: PauseStore | undefined;
/** The older version the player chose to go back to, while it downloads (its own feed: /aktualizacje/v/<version>). */
let rollbackTarget: string | undefined;
let feedOverride: string | undefined;
let serverOf: () => string = () => '';
let betaChosen: () => boolean = () => false;
/** The server answered the beta channel with "not here" (an older server): the stable one for this run. */
let betaMissing = false;
let logTo: ((message: string) => void) | undefined;

function set(next: UpdateStatus) {
  const paused = pause?.get();
  status = { ...next, pausedUntil: paused || undefined, rollback: rollbackTarget };
  send(status);
}

/** The feed of the channel chosen: /aktualizacje, or /aktualizacje/beta (the newest release, a beta or not). */
const channelFeed = () => `${feedUrl(serverOf())}${betaChosen() && !betaMissing ? '/beta' : ''}`;

/** The feed the files come from now: the newest release's, or the older one's being gone back to. */
const activeFeed = () => feedOverride ?? channelFeed();

/**
 * electron-updater's own id of this launcher (userData/.updaterId), sent with every update check.
 * While updates are paused it says which version the player left (releaseNotes.ts): launchers from
 * before rollbacks existed know nothing of the pause, but the server holds their update back by it.
 */
const updaterIdFile = () => path.join(app.getPath('userData'), '.updaterId');
function syncUpdaterId(pausedUntilVersion: string | undefined) {
  let id = '';
  try {
    id = readFileSync(updaterIdFile(), 'utf8').trim();
  } catch {
    // none yet
  }
  const ordinary = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) && !pausedUntil(id) ? id : undefined;
  const next = (pausedUntilVersion && pauseMarker(pausedUntilVersion)) || ordinary || randomUUID();
  if (next !== id) {
    try {
      writeFileSync(updaterIdFile(), next);
    } catch (err) {
      logTo?.(`Aktualizacja: nie udało się zapisać .updaterId (${(err as Error).message})`);
    }
  }
  // electron-updater reads its file once: the header carries the id as it is now
  autoUpdater.requestHeaders = { ...(autoUpdater.requestHeaders ?? {}), 'x-user-staging-id': next };
}

/** Pauses automatic updates until a release newer than `version`, or resumes them (undefined). */
async function setPause(version: string | undefined) {
  await pause?.set(version);
  if (app.isPackaged) {
    syncUpdaterId(version);
    // Windows with the installer and Linux download by themselves only while nothing is paused
    if (!winInstalled && !MANUAL) autoUpdater.autoDownload = !version && !rollbackTarget;
  }
  set(status);
}

/** The update feed: the server's /aktualizacje, or SLASHCLIENT_UPDATE_URL (for testing updates against a local feed). */
function feedUrl(server: string): string {
  return (process.env.SLASHCLIENT_UPDATE_URL || `${server.replace(/\/$/, '')}/aktualizacje`).replace(/\/$/, '');
}

export function startUpdateChecks({ serverUrl, send: sendStatus, onLog, pause: pauseStore, beta }: UpdateOptions): void {
  send = sendStatus;
  pause = pauseStore;
  serverOf = serverUrl;
  if (beta) betaChosen = beta;
  logTo = onLog;
  // a version newer than the one left runs already (installed by hand): nothing to wait for any more
  if (pause?.get() && pauseOver(pause.get(), app.getVersion())) void pause.set(undefined);
  status = { ...status, pausedUntil: pause?.get() || undefined };
  if (!app.isPackaged) return;
  syncUpdaterId(pause?.get());
  // the feeds are latest*.yml on both channels: a beta build would otherwise ask for beta*.yml
  // (electron-updater picks the channel from its own version); setting it allows going down, which only going back may
  autoUpdater.channel = 'latest';
  autoUpdater.allowDowngrade = false;
  autoUpdater.setFeedURL({ provider: 'generic', url: channelFeed() });
  autoUpdater.autoDownload = !MANUAL && !pause?.get();
  autoUpdater.autoInstallOnAppQuit = !MANUAL;
  autoUpdater.on('checking-for-update', () => {
    // a found or downloaded update stays on screen while the next check runs
    if (!['available', 'downloading', 'ready'].includes(status.state)) set({ state: 'checking' });
  });
  autoUpdater.on('update-not-available', () => set({ state: 'none' }));
  autoUpdater.on('update-available', (info) => {
    if (rollbackTarget) {
      if (info.version !== rollbackTarget) return;
    } else if (pauseHolds(pause?.get(), info.version)) {
      // after going back: only a release newer than the one left installs by itself
      return set({ state: 'none' });
    } else if (pause?.get()) {
      void setPause(undefined);
    }
    if (winInstalled) return void winDownload(activeFeed(), info.version, onLog);
    if (MANUAL) return void macDownload(activeFeed(), info.version, info.files as MacFile[], onLog);
    set({ state: 'downloading', version: info.version, percent: 0 });
    // with automatic downloads off (a pause, going back) the download starts here
    if (!autoUpdater.autoDownload) void autoUpdater.downloadUpdate().catch(() => {});
  });
  autoUpdater.on('download-progress', (p) => set({ ...status, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    onLog?.(`Aktualizacja: ${err.message}`);
    // the beta channel on a server that has none yet: the stable channel, checked again
    if (!feedOverride && betaChosen() && !betaMissing && /\b404\b/.test(err.message)) {
      betaMissing = true;
      onLog?.('Aktualizacja: serwer nie ma kanału beta, sprawdzam zwykłe wydania');
      autoUpdater.setFeedURL({ provider: 'generic', url: channelFeed() });
      void autoUpdater.checkForUpdates().catch(() => {});
      return;
    }
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

/**
 * Goes back to an older release: the same download, checks (SHA-512) and installation as an update,
 * from that release's own feed on the server (/aktualizacje/v/<version>), with going down allowed.
 * Automatic updates pause until a release newer than the running one (the player can turn them on).
 */
export async function rollbackTo(version: string): Promise<UpdateStatus> {
  if (!app.isPackaged) throw new Error('update:dev');
  if (status.state === 'downloading' || macDownloading || winDownloading) throw new Error('update:busy');
  const current = app.getVersion();
  rollbackTarget = version;
  feedOverride = `${feedUrl(serverOf())}/v/${version}`;
  winReady = undefined;
  macReady = undefined;
  // going back further keeps waiting for the newest version left
  const left = pause?.get();
  await setPause(left && compareVersion(left, current) > 0 ? left : current);
  autoUpdater.allowDowngrade = true;
  if (!winInstalled && !MANUAL) autoUpdater.autoDownload = false;
  autoUpdater.setFeedURL({ provider: 'generic', url: feedOverride });
  logTo?.(`Aktualizacja: powrót z ${current} do ${version}`);
  set({ state: 'checking' });
  await autoUpdater.checkForUpdates().catch((err: Error) => set({ state: 'error', error: err.message }));
  return status;
}

/** Turns automatic updates back on after going back to an older version. */
export async function resumeUpdates(): Promise<UpdateStatus> {
  await setPause(undefined);
  return status;
}

/**
 * The player switched the update channel (Settings): the feed follows and is checked again. Going
 * from the beta back to the stable channel installs nothing older: the next stable release newer
 * than the beta running comes as usual.
 */
export async function updateChannelChanged(): Promise<UpdateStatus> {
  betaMissing = false;
  if (!app.isPackaged || feedOverride) return status;
  autoUpdater.setFeedURL({ provider: 'generic', url: channelFeed() });
  return checkForUpdates();
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
