import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { t } from '../shared/i18n';

export interface DownloadTask {
  url: string;
  dest: string;
  sha1?: string;
  size?: number;
  executable?: boolean;
}

export interface ByteStats {
  /** Bytes finished so far, including files that were already on disk. */
  bytes: number;
  /** Sum of all known file sizes; 0 when sizes are unknown. */
  totalBytes: number;
  /** Network download speed in bytes per second (averaged over the last few seconds). */
  speed: number;
}

export type ProgressFn = (done: number, total: number, stats: ByteStats) => void;

const USER_AGENT = 'SlashClient/0.1';

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init?.headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}: ${await res.text().catch(() => '')}`);
  return (await res.json()) as T;
}

export async function sha1File(file: string): Promise<string> {
  const hash = createHash('sha1');
  const handle = await fs.open(file, 'r');
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

/**
 * Whether the file on disk already matches the task. Size is checked first; the
 * sha1 is only computed when `verifyHash` is set, since hashing thousands of
 * asset files on every launch is slow.
 */
async function isValid(task: DownloadTask, verifyHash: boolean): Promise<boolean> {
  try {
    const stat = await fs.stat(task.dest);
    if (task.size !== undefined && stat.size !== task.size) return false;
    if (verifyHash && task.sha1) return (await sha1File(task.dest)) === task.sha1;
    return true;
  } catch {
    return false;
  }
}

async function downloadOne(task: DownloadTask, onBytes: (n: number) => void): Promise<void> {
  await fs.mkdir(path.dirname(task.dest), { recursive: true });
  // Unique temp name, so two launches downloading the same file never clash.
  const tmp = `${task.dest}.${process.pid}-${Math.random().toString(36).slice(2)}.part`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let received = 0;
    try {
      const res = await fetch(task.url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const hash = createHash('sha1');
      const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
      body.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        received += chunk.length;
        onBytes(chunk.length);
      });
      await pipeline(body, createWriteStream(tmp));
      const digest = hash.digest('hex');
      if (task.sha1 && digest !== task.sha1) throw new Error(t('zła suma SHA1 ({0} ≠ {1})', digest, task.sha1));
      await fs.rename(tmp, task.dest);
      if (task.executable && process.platform !== 'win32') await fs.chmod(task.dest, 0o755);
      return;
    } catch (err) {
      lastError = err;
      // Bytes of a failed attempt don't count towards progress.
      onBytes(-received);
      await fs.rm(tmp, { force: true });
    }
  }
  throw new Error(t('Nie udało się pobrać {0}: {1}', task.url, String(lastError)));
}

/** Sliding-window speed meter: bytes per second over the last `windowMs`. */
class SpeedMeter {
  private samples: { t: number; bytes: number }[] = [];
  private total = 0;
  constructor(private windowMs = 3000) {}
  add(n: number) {
    this.total += n;
  }
  get speed(): number {
    const now = Date.now();
    this.samples.push({ t: now, bytes: this.total });
    while (this.samples.length > 1 && now - this.samples[0].t > this.windowMs) this.samples.shift();
    const first = this.samples[0];
    const elapsed = (now - first.t) / 1000;
    return elapsed > 0.2 ? Math.max(0, (this.total - first.bytes) / elapsed) : 0;
  }
}

/** Downloads every task that is missing or invalid, `concurrency` at a time. */
export async function downloadAll(
  tasks: DownloadTask[],
  onProgress?: ProgressFn,
  { concurrency = 16, verifyHash = false } = {},
): Promise<void> {
  // Several tasks may point at the same file (e.g. duplicate asset hashes).
  const unique = [...new Map(tasks.map((t) => [t.dest, t])).values()];
  const totalBytes = unique.reduce((sum, t) => sum + (t.size ?? 0), 0);
  const meter = new SpeedMeter();
  let bytes = 0;
  let done = 0;
  let next = 0;
  let lastEmit = 0;

  // Throttled to ~10 updates per second so the UI isn't flooded with IPC messages.
  const emit = (force = false) => {
    const now = Date.now();
    if (!onProgress || (!force && now - lastEmit < 100)) return;
    lastEmit = now;
    onProgress(done, unique.length, { bytes, totalBytes, speed: meter.speed });
  };

  emit(true);
  const ticker = setInterval(() => emit(), 250);
  const worker = async () => {
    while (next < unique.length) {
      const task = unique[next++];
      if (await isValid(task, verifyHash)) {
        bytes += task.size ?? 0;
      } else {
        let fileBytes = 0;
        await downloadOne(task, (n) => {
          fileBytes += n;
          bytes += n;
          meter.add(n);
          emit();
        });
        // Correct for a size missing from the manifest or a server-side mismatch.
        bytes += (task.size ?? fileBytes) - fileBytes;
      }
      done++;
      emit();
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  } finally {
    clearInterval(ticker);
  }
  emit(true);
}
