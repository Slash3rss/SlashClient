import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

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
 * macOS only lets signed apps replace themselves, so there the player gets a download button.
 */
const MANUAL = process.platform === 'darwin';
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
  autoUpdater.on('update-available', (info) => set(MANUAL ? { state: 'available', version: info.version, manual: true } : { state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ ...status, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    onLog?.(`Aktualizacja: ${err.message}`);
    if (status.state !== 'ready') set({ state: 'error', error: err.message });
  });
  void checkForUpdates();
  setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000);
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
  autoUpdater.quitAndInstall();
}
