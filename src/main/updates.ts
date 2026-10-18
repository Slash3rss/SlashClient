import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { appBundle, downloadMacUpdate, installMacUpdate, pickMacZip, type MacFile } from './macUpdate';

/** What the update bar and Settings show. */
export interface UpdateStatus {
  state: 'dev' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  /** macOS: the new version is downloaded by hand from the website (see below). */
  manual?: boolean;
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
 * folder it may not write to) the player gets a download button.
 */
const MANUAL = process.platform === 'darwin';
/** macOS: the unpacked new SlashClient.app and the one it replaces, once downloaded. */
let macReady: { current: string; next: string } | undefined;
let macDownloading = false;
let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'dev' };
let send: (status: UpdateStatus) => void = () => {};

function set(next: UpdateStatus) {
  status = next;
  send(status);
}

export function startUpdateChecks({ serverUrl, send: sendStatus, onLog }: UpdateOptions): void {
  send = sendStatus;
  if (!app.isPackaged) return;
  autoUpdater.setFeedURL({ provider: 'generic', url: `${serverUrl().replace(/\/$/, '')}/aktualizacje` });
  autoUpdater.autoDownload = !MANUAL;
  autoUpdater.autoInstallOnAppQuit = !MANUAL;
  autoUpdater.on('checking-for-update', () => {
    // a found or downloaded update stays on screen while the next check runs
    if (!['available', 'downloading', 'ready'].includes(status.state)) set({ state: 'checking' });
  });
  autoUpdater.on('update-not-available', () => set({ state: 'none' }));
  autoUpdater.on('update-available', (info) => {
    if (!MANUAL) return set({ state: 'downloading', version: info.version, percent: 0 });
    void macDownload(serverUrl(), info.version, info.files as MacFile[], onLog);
  });
  autoUpdater.on('download-progress', (p) => set({ ...status, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    onLog?.(`Aktualizacja: ${err.message}`);
    if (status.state !== 'ready') set({ state: 'error', error: err.message });
  });
  void checkForUpdates();
  setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000);
}

/** macOS: downloads the new version in the background, or falls back to the download button. */
async function macDownload(server: string, version: string, files: MacFile[], onLog?: (message: string) => void) {
  if (macDownloading || (macReady && status.version === version)) return;
  const manual = () => set({ state: 'available', version, manual: true });
  const current = await appBundle();
  const file = pickMacZip(files ?? []);
  if (!current || !file) return manual();
  macDownloading = true;
  try {
    set({ state: 'downloading', version, percent: 0 });
    const next = await downloadMacUpdate(`${server.replace(/\/$/, '')}/aktualizacje`, version, file, (percent) => set({ state: 'downloading', version, percent }));
    macReady = { current, next };
    set({ state: 'ready', version });
  } catch (err) {
    onLog?.(`Aktualizacja (macOS): ${(err as Error).message}`);
    manual();
  } finally {
    macDownloading = false;
  }
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

export function installUpdate(): void {
  if (MANUAL) {
    if (macReady) installMacUpdate(macReady.current, macReady.next);
    return;
  }
  autoUpdater.quitAndInstall();
}
