import { Transform } from 'node:stream';

/**
 * Download speed limit shared by every download of the launcher (Settings → "Limit prędkości
 * pobierania"), so installing a modpack doesn't take the whole connection. A token bucket:
 * bytes are let through at `rate` per second with a short burst; the caller waits for its share.
 * Waiting stops reading the response, so TCP slows the server down too.
 */
export class RateLimiter {
  /** Bytes per second; 0 = no limit. */
  private rate = 0;
  private tokens = 0;
  private last = 0;
  /** Takes are served one after another, so concurrent downloads share the limit fairly. */
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  setRate(bytesPerSecond: number): void {
    const rate = Number.isFinite(bytesPerSecond) && bytesPerSecond > 0 ? bytesPerSecond : 0;
    if (rate === this.rate) return;
    this.rate = rate;
    this.tokens = 0;
    this.last = this.now();
  }

  get bytesPerSecond(): number {
    return this.rate;
  }

  /** Burst: a quarter of a second of traffic, at least 16 KiB (one stream chunk). */
  private get burst(): number {
    return Math.max(16 * 1024, this.rate / 4);
  }

  /** Resolves once `bytes` may pass. Immediate when there is no limit. */
  take(bytes: number): Promise<void> {
    if (!this.rate || bytes <= 0) return Promise.resolve();
    const run = this.tail.then(() => this.consume(bytes));
    this.tail = run.catch(() => {});
    return run;
  }

  private async consume(bytes: number): Promise<void> {
    // the limit may have been turned off while this take waited in the queue
    if (!this.rate) return;
    const now = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    this.tokens -= bytes;
    if (this.tokens < 0) {
      // a chunk bigger than what is left: wait until the debt is paid off
      const ms = (-this.tokens / this.rate) * 1000;
      await this.sleep(ms);
      this.tokens = 0;
      this.last = this.now();
    }
  }
}

/** The launcher's one limiter: download.ts and every other download share it. */
export const downloadLimiter = new RateLimiter();

/** Sets the limit from the setting in MB/s (0 or less = no limit). */
export function setDownloadLimit(megabytesPerSecond: number | undefined): void {
  downloadLimiter.setRate((megabytesPerSecond ?? 0) > 0 ? megabytesPerSecond! * 1024 * 1024 : 0);
}

/** A pass-through stream that holds each chunk back until the limiter lets it through. */
export function throttleStream(limiter: RateLimiter = downloadLimiter): Transform {
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      limiter.take(chunk.length).then(() => done(null, chunk), done);
    },
  });
}

/** The same for a response body read with `for await` (e.g. profile share packs, macOS updates). */
export async function* throttled<T extends Uint8Array>(body: AsyncIterable<T>, limiter: RateLimiter = downloadLimiter): AsyncGenerator<T> {
  for await (const chunk of body) {
    await limiter.take(chunk.length);
    yield chunk;
  }
}
