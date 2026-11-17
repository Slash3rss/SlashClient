import { BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { clipFrames, clipIndex, fpsOf, saveWebm } from './clipTrim';
import { demuxWebm, webmPlan, type WebmIndex, type WebmPlan, type WebmQuality } from '../shared/webm';

/**
 * Turning clips into WebM in the background. The game records Motion-JPEG AVI (the cheapest to
 * record: every frame is a JPEG squeezed on a spare thread), which Discord does not play; the
 * launcher makes a WebM of each new clip in a hidden window (renderer/converter.ts, WebCodecs)
 * at a low priority, so a game still running loses as little as possible. The AVI goes to the
 * system's trash only once the WebM is on disk, plays in Chromium and is as long as the clip.
 * The same queue makes WebMs of old AVIs on request and trims WebMs (encoded again).
 */

export interface ConvertJob {
  id: number;
  source: 'avi' | 'webm';
  /** Frames [from, to] of the source, inclusive. */
  from: number;
  to: number;
  /** For a WebM: where decoding starts (the key frame at or before `from`), its codec and size. */
  keyFrom: number;
  codec: string;
  width: number;
  height: number;
  fps: number;
  plan: WebmPlan;
}

export interface ConvertOptions {
  from?: number;
  to?: number;
  /** The whole AVI made into a WebM, then the AVI moved to the trash. */
  replace?: boolean;
  quality?: WebmQuality;
}

/** What the gallery shows about a clip being made into a WebM. */
export interface ConvertState {
  file: string;
  state: 'queued' | 'working' | 'done' | 'failed';
  progress: number;
  /** The WebM's name once done. */
  result?: string;
  error?: string;
  /** A part of the clip (trimming): the gallery shows no bar on the clip for it. */
  part: boolean;
}

export interface ConverterDeps {
  /** The built files (dist): preload and renderer/converter.html. */
  dir: string;
  notify: (state: ConvertState) => void;
  trash: (file: string) => Promise<void>;
  quality: () => WebmQuality;
  log?: (message: string) => void;
}

interface Pending extends ConvertOptions {
  file: string;
  resolve: (name: string) => void;
  reject: (err: Error) => void;
  abort: boolean;
}

/** How far a WebM's length may be off the clip's: a frame and a bit, or a quarter second. */
export function lengthMatches(expectedMs: number, gotMs: number, frameMs: number): boolean {
  return Number.isFinite(gotMs) && Math.abs(gotMs - expectedMs) <= Math.max(250, 2 * frameMs);
}

/** "clip-….avi" has its WebM already when "clip-….webm" is next to it. */
export const webmTwin = (aviFile: string) => aviFile.replace(/\.avi$/i, '.webm');

/** True when the game finished writing the AVI: the RIFF size covers the whole file. */
export async function aviComplete(file: string): Promise<boolean> {
  const handle = await fs.open(file, 'r').catch(() => undefined);
  if (!handle) return false;
  try {
    const head = Buffer.alloc(12);
    const { bytesRead } = await handle.read(head, 0, 12, 0);
    const { size } = await handle.stat();
    return bytesRead === 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.readUInt32LE(4) + 8 === size;
  } finally {
    await handle.close();
  }
}

export function createClipConverter(d: ConverterDeps) {
  const queue: Pending[] = [];
  const states = new Map<string, ConvertState>();
  let current: { job: ConvertJob; pending: Pending; webm?: { data: Buffer; index: WebmIndex }; finish: (data: Uint8Array, probe: { durationMs: number; width: number; height: number }) => Promise<void>; fail: (err: Error) => void } | undefined;
  let win: BrowserWindow | undefined;
  let ready: Promise<BrowserWindow> | undefined;
  let idle: NodeJS.Timeout | undefined;
  let nextId = 1;
  const failedOnce = new Set<string>();
  const watched = new Map<string, NodeJS.Timeout>();

  const set = (file: string, patch: Partial<ConvertState>) => {
    const s: ConvertState = { file, state: 'queued', progress: 0, part: false, ...states.get(file), ...patch };
    states.set(file, s);
    d.notify(s);
    if (s.state === 'done' || s.state === 'failed') setTimeout(() => states.get(file) === s && states.delete(file), 60_000).unref?.();
  };

  function page(): Promise<BrowserWindow> {
    if (ready && win && !win.isDestroyed()) return ready;
    win = new BrowserWindow({
      show: false, width: 320, height: 240,
      webPreferences: { preload: path.join(d.dir, 'converterPreload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    const w = win;
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    w.webContents.on('render-process-gone', () => {
      current?.fail(new Error('the converter stopped'));
      win = undefined;
      ready = undefined;
    });
    ready = w.loadFile(path.join(d.dir, 'renderer', 'converter.html')).then(() => {
      // a game may be running: the encoding gives way to it
      try {
        os.setPriority(w.webContents.getOSProcessId(), os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch { /* not allowed here: it runs at the normal priority */ }
      return w;
    });
    return ready;
  }

  const fromConverter = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent, id: number) => !!current && !!win && e.sender === win.webContents && current.job.id === id;
  ipcMain.handle('conv:jpegs', (e, id: number, from: number, count: number) => (fromConverter(e, id) ? clipFrames(current!.pending.file, from, count) : []));
  ipcMain.handle('conv:chunks', (e, id: number, from: number, count: number) => {
    if (!fromConverter(e, id) || !current!.webm) return [];
    const { data, index } = current!.webm;
    return index.frames.slice(Math.max(0, from), Math.max(0, from) + Math.min(120, Math.max(0, count)))
      .map((f) => ({ data: data.subarray(f.offset, f.offset + f.length), key: f.key }));
  });
  ipcMain.on('conv:progress', (e, id: number, done: number) => {
    if (fromConverter(e, id) && Number.isFinite(done)) set(current!.pending.file, { state: 'working', progress: Math.max(0, Math.min(1, done)) });
  });
  ipcMain.handle('conv:done', (e, id: number, data: Uint8Array, probe: { durationMs: number; width: number; height: number }) => (fromConverter(e, id) && data instanceof Uint8Array ? current!.finish(data, probe) : undefined));
  ipcMain.on('conv:failed', (e, id: number, message: string) => {
    if (fromConverter(e, id)) current!.fail(new Error(String(message)));
  });

  async function run(p: Pending): Promise<string> {
    const avi = /\.avi$/i.test(p.file);
    let job: ConvertJob;
    let webm: { data: Buffer; index: WebmIndex } | undefined;
    let total: number;
    if (avi) {
      const index = await clipIndex(p.file);
      if (!index || index.handler.toUpperCase() !== 'MJPG') throw new Error('not a clip from the game');
      total = index.frames.length;
      job = { id: 0, source: 'avi', from: 0, to: 0, keyFrom: 0, codec: '', width: index.width, height: index.height, fps: fpsOf(index), plan: undefined as never };
    } else {
      const data = await fs.readFile(p.file);
      const index = demuxWebm(data);
      if (!index) throw new Error('not a WebM this launcher reads');
      webm = { data, index };
      total = index.frames.length;
      job = { id: 0, source: 'webm', from: 0, to: 0, keyFrom: 0, codec: index.codec, width: index.width, height: index.height, fps: 1_000_000 / index.frameDuration, plan: undefined as never };
    }
    job.from = Math.max(0, Math.min(total - 1, Math.floor(p.from ?? 0)));
    job.to = Math.max(0, Math.min(total - 1, Math.floor(p.to ?? total - 1)));
    if (job.to - job.from < 1) throw new Error('too short');
    if (webm) for (let i = job.from; i >= 0; i--) if (webm.index.frames[i].key) {
      job.keyFrom = i;
      break;
    }
    const count = job.to - job.from + 1;
    const frameMs = 1000 / job.fps;
    const expectedMs = count * frameMs;
    job.plan = webmPlan(job.width, job.height, expectedMs, p.quality ?? d.quality());
    job.id = nextId++;
    const part = p.from !== undefined || p.to !== undefined;

    const w = await page();
    clearTimeout(idle);
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      // a page that stops answering does not hold the queue up forever; progress keeps it quiet
      let watchdog: NodeJS.Timeout | undefined;
      const kick = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => fail(new Error('the converter stopped answering')), 120_000);
      };
      const onProgress = (_e: unknown, id: number) => id === job.id && kick();
      const cancelCheck = setInterval(() => {
        if (!p.abort) return;
        w.webContents.send('conv:cancel', job.id);
        fail(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }, 200);
      const settle = () => {
        settled = true;
        clearTimeout(watchdog);
        clearInterval(cancelCheck);
        ipcMain.removeListener('conv:progress', onProgress);
        current = undefined;
      };
      const fail = (err: Error) => {
        if (settled) return;
        settle();
        reject(err);
      };
      const finish = async (data: Uint8Array, probe: { durationMs: number; width: number; height: number }) => {
        if (settled) return;
        try {
          // kept only when it is a WebM of the whole part that really plays
          const index = demuxWebm(data);
          if (!index || index.frames.length !== count || index.width !== job.plan.width || index.height !== job.plan.height) throw new Error('the WebM came out incomplete');
          if (!lengthMatches(expectedMs, probe?.durationMs, frameMs) || probe.width !== job.plan.width || probe.height !== job.plan.height) {
            throw new Error(`the WebM plays ${probe?.durationMs} ms instead of ${Math.round(expectedMs)} ms`);
          }
          const name = await saveWebm(p.file, data, part);
          const saved = path.join(path.dirname(p.file), name);
          // read back from the disk before the clip itself goes anywhere
          if (!Buffer.from(data).equals(await fs.readFile(saved))) throw new Error('the WebM on the disk differs');
          if (p.replace && avi && !p.abort) await d.trash(p.file).catch((err) => d.log?.(`clip ${p.file} stays: ${(err as Error).message}`));
          if (settled) return;
          settle();
          resolve(name);
        } catch (err) {
          fail(err as Error);
        }
      };
      current = { job, pending: p, webm, finish, fail };
      ipcMain.on('conv:progress', onProgress);
      kick();
      set(p.file, { state: 'working', progress: 0, part });
      w.webContents.send('conv:job', job);
    });
  }

  let busy = false;
  async function pump() {
    if (busy) return;
    busy = true;
    try {
      for (let p = queue.shift(); p; p = queue.shift()) {
        if (p.abort) {
          p.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          continue;
        }
        try {
          const name = await run(p);
          set(p.file, { state: 'done', progress: 1, result: name });
          p.resolve(name);
        } catch (err) {
          const e = err as Error;
          set(p.file, { state: 'failed', error: e.name === 'AbortError' ? 'aborted' : e.message });
          p.reject(e);
        }
      }
    } finally {
      busy = false;
      clearTimeout(idle);
      // the hidden window is let go after a while with nothing to do
      idle = setTimeout(() => {
        if (!busy && win && !win.isDestroyed()) win.destroy();
        win = undefined;
        ready = undefined;
      }, 120_000);
    }
  }

  /** Queues a clip (or a part of it); resolves with the new WebM's name. */
  function convert(file: string, opts: ConvertOptions = {}): Promise<string> {
    const same = queue.find((q) => q.file === file && !q.abort && q.from === opts.from && q.to === opts.to);
    if (same || (current?.pending.file === file && current.pending.from === opts.from && current.pending.to === opts.to)) {
      return new Promise((resolve, reject) => {
        const target = same ?? current!.pending;
        const { resolve: r0, reject: j0 } = target;
        target.resolve = (n) => (r0(n), resolve(n));
        target.reject = (e) => (j0(e), reject(e));
        if (opts.replace) target.replace = true;
      });
    }
    return new Promise((resolve, reject) => {
      queue.push({ ...opts, file, resolve, reject, abort: false });
      set(file, { state: 'queued', progress: 0, part: opts.from !== undefined || opts.to !== undefined });
      void pump();
    });
  }

  function cancel(file: string) {
    for (const q of queue) if (q.file === file) q.abort = true;
    if (current?.pending.file === file) current.pending.abort = true;
  }

  /** New AVIs in a clips folder (since `since`) made into WebMs; the AVIs go to the trash. */
  async function scan(dir: string, since: number) {
    for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
      if (!/\.avi$/i.test(name)) continue;
      const file = path.join(dir, name);
      const st = await fs.stat(file).catch(() => undefined);
      if (!st || st.mtimeMs < since) continue;
      const key = `${file}|${st.size}|${st.mtimeMs}`;
      if (failedOnce.has(key) || states.get(file)?.state === 'queued' || states.get(file)?.state === 'working') continue;
      if (await fs.access(webmTwin(file)).then(() => true, () => false)) continue;
      // still being written by the game
      if (!(await aviComplete(file))) continue;
      convert(file, { replace: true }).catch((err) => {
        failedOnce.add(key);
        if ((err as Error).name !== 'AbortError') d.log?.(`could not make a WebM of ${file}: ${(err as Error).message}`);
      });
    }
  }

  /** Looks for new clips every few seconds while a game writes into this folder. */
  function watch(dir: string, since: () => number) {
    if (watched.has(dir)) return;
    watched.set(dir, setInterval(() => void scan(dir, since()), 4_000));
  }
  function unwatch(dir: string, since: number) {
    clearInterval(watched.get(dir));
    watched.delete(dir);
    void scan(dir, since);
  }

  return { convert, cancel, scan, watch, unwatch, states: () => [...states.values()] };
}

export type ClipConverter = ReturnType<typeof createClipConverter>;
