import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { keepLast } from './gamelog';

/** What a console window shows: the game's lines, whether it still runs, and how it ended. */
export interface ConsoleState { profileId: string; name: string; lines: string[]; running: boolean; exit?: { code: number | null; byUser: boolean } }

/**
 * "Okno konsoli": a game's log in a window of its own, beside the game or on another screen, so the
 * launcher's Play screen does not have to stay open. One window per profile; it keeps the lines of the
 * game after it closes, and the profile's next start begins it again.
 */
export function createConsoleWindows(opts: { dir: string; icon: string; name: (profileId: string) => string }) {
  const windows = new Map<string, BrowserWindow>();
  const states = new Map<string, ConsoleState>();
  const deliver = (profileId: string, channel: string, payload: unknown) => {
    const w = windows.get(profileId);
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  };
  return {
    /** A game of this profile starts: an open window starts over. */
    started(profileId: string) {
      states.set(profileId, { profileId, name: opts.name(profileId), lines: [], running: true });
      deliver(profileId, 'console:state', states.get(profileId));
    },
    lines(profileId: string, lines: string[]) {
      const state = states.get(profileId);
      if (!state) return;
      keepLast(state.lines, lines);
      deliver(profileId, 'game:logBatch', { profileId, lines });
    },
    exited(profileId: string, code: number | null, byUser: boolean) {
      const state = states.get(profileId);
      if (!state) return;
      state.running = false;
      state.exit = { code, byUser };
      deliver(profileId, 'console:state', state);
    },
    state(profileId: string): ConsoleState {
      return states.get(profileId) ?? { profileId, name: opts.name(profileId), lines: [], running: false };
    },
    /** Opens (or brings forward) the profile's console window. */
    open(profileId: string, focus = true) {
      const open = windows.get(profileId);
      if (open && !open.isDestroyed()) {
        if (focus) {
          if (open.isMinimized()) open.restore();
          open.focus();
        }
        return;
      }
      const w = new BrowserWindow({
        width: 900, height: 560, minWidth: 520, minHeight: 300,
        title: opts.name(profileId), backgroundColor: '#0a0d14', icon: opts.icon, show: false,
        webPreferences: { preload: path.join(opts.dir, 'preload.js'), contextIsolation: true, sandbox: true },
      });
      w.removeMenu();
      // started with the game: it comes up beside it without taking the keyboard from the game
      w.once('ready-to-show', () => (focus ? w.show() : w.showInactive()));
      windows.set(profileId, w);
      w.on('closed', () => {
        if (windows.get(profileId) === w) windows.delete(profileId);
      });
      w.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) void shell.openExternal(url);
        return { action: 'deny' };
      });
      // only its own page: another one would get the launcher's API (preload)
      w.webContents.on('will-navigate', (event) => event.preventDefault());
      void w.loadFile(path.join(opts.dir, 'renderer', 'console.html'), { query: { profile: profileId } });
    },
    /** The launcher quits: its console windows go with it. */
    closeAll() {
      for (const w of windows.values()) if (!w.isDestroyed()) w.close();
    },
  };
}
