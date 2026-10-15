import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

export interface UpdateEvents {
  onReady: (version: string) => void;
  onLog?: (message: string) => void;
}

/**
 * Checks GitHub Releases for a newer version and downloads it in the
 * background (installed builds only). macOS needs a signed app for this to work;
 * unsigned builds simply log the error and keep running.
 */
export function startUpdateChecks({ onReady, onLog }: UpdateEvents): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => onReady(info.version));
  autoUpdater.on('error', (err) => onLog?.(`Aktualizacja: ${err.message}`));
  const check = () => autoUpdater.checkForUpdates().catch((err: Error) => onLog?.(`Aktualizacja: ${err.message}`));
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}
