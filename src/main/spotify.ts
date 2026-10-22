/**
 * Spotify for the game's "Spotify" module (server 0.9.36+, spotify.ts there): the game asks the
 * bridge what plays (only while its module is on), the launcher asks the server (at most every
 * couple of seconds, however often the game asks) and passes on a checked copy; album covers are
 * fetched here from Spotify's image host only, small, and handed to the game as 64×64 PNGs (the
 * game reads only PNG, Spotify serves JPEG).
 */

export interface NowPlaying {
  kind: 'track' | 'episode';
  title: string;
  artists: string[];
  album: string;
  /** The cover's id on i.scdn.co ('' when there is none): the game asks /spotify/cover/<id>. */
  cover: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
}

export interface SpotifyNow {
  /** The server has a Spotify app set up. */
  available: boolean;
  linked: boolean;
  playing: NowPlaying | null;
  /** Why there is nothing: 'relink', 'rate_limited', 'spotify_not_allowed', 'signed_out', 'offline'… */
  error?: string;
}

/** A cover's address on Spotify's image host; its id is what the game may ask for. */
const COVER_URL = /^https:\/\/i\.scdn\.co\/image\/([0-9a-f]{16,64})$/;
export const COVER_ID = /^[0-9a-f]{16,64}$/;
const MAX_COVER_BYTES = 512 * 1024;
export const COVER_SIZE = 64;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const ms = (v: unknown) => Math.max(0, Math.min(24 * 3600_000, Math.floor(Number(v) || 0)));

/** The server's answer as the game gets it; anything odd is dropped. */
export function cleanNow(raw: unknown): SpotifyNow {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const p = r.playing && typeof r.playing === 'object' ? r.playing as Record<string, unknown> : undefined;
  const title = text(p?.title, 200);
  const cover = COVER_URL.exec(typeof p?.cover === 'string' ? p.cover : '');
  const duration = ms(p?.durationMs);
  const playing: NowPlaying | null = p && title ? {
    kind: p.kind === 'episode' ? 'episode' : 'track', title,
    artists: (Array.isArray(p.artists) ? p.artists : []).map((a) => text(a, 100)).filter(Boolean).slice(0, 8),
    album: text(p.album, 200), cover: cover ? cover[1] : '', durationMs: duration, progressMs: Math.min(duration || Infinity, ms(p.progressMs)), isPlaying: p.isPlaying === true,
  } : null;
  const error = text(r.error, 40);
  return { available: r.available === true, linked: r.linked === true, playing, ...(error ? { error } : {}) };
}

/**
 * The server asked at most every `minMs` (one call at a time): a game asking more often, or
 * several asks at once, get the same answer. Errors (signed out, no network) say so instead.
 */
export class NowPlayingPoller {
  private last?: { at: number; value: SpotifyNow };
  private pending?: Promise<SpotifyNow>;
  constructor(private readonly ask: () => Promise<unknown>, private readonly minMs = 2000, private readonly now: () => number = Date.now) {}

  get(): Promise<SpotifyNow> {
    if (this.last && this.now() - this.last.at < this.minMs) return Promise.resolve(this.last.value);
    this.pending ??= this.ask().then(cleanNow, (err: { code?: string; message?: string }) => {
      const code = err?.code ?? err?.message ?? 'offline';
      return { available: true, linked: false, playing: null, error: code === 'unauthorized' || code === 'not_signed_in' ? 'signed_out' : text(code, 40) || 'offline' };
    }).then((value) => {
      this.last = { at: this.now(), value };
      return value;
    }).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
}

/**
 * Album covers by their id on i.scdn.co, as 64×64 PNGs: fetched once, the last few kept. `fetchImpl`
 * gets only i.scdn.co addresses; `toPng` decodes JPEG or PNG and scales (Electron's nativeImage).
 */
export class CoverCache {
  private readonly kept = new Map<string, Promise<Buffer>>();
  constructor(
    private readonly toPng: (data: Buffer, size: number) => Buffer,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly keep = 16,
  ) {}

  get(id: string): Promise<Buffer> {
    if (!COVER_ID.test(id)) return Promise.reject(new Error('bad_request'));
    let found = this.kept.get(id);
    if (found) {
      this.kept.delete(id);
      this.kept.set(id, found);
      return found;
    }
    found = this.download(id);
    // a failed one is tried again next time
    found.catch(() => this.kept.delete(id));
    this.kept.set(id, found);
    while (this.kept.size > this.keep) this.kept.delete(this.kept.keys().next().value!);
    return found;
  }

  private async download(id: string): Promise<Buffer> {
    const res = await this.fetchImpl(`https://i.scdn.co/image/${id}`, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(jpeg|png)$/.test(type.split(';')[0].trim())) throw new Error('not_an_image');
    if (Number(res.headers.get('content-length') ?? 0) > MAX_COVER_BYTES) throw new Error('too_large');
    // read with a cap: a server that lies about its length is cut off
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new Error('not_an_image');
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_COVER_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('too_large');
      }
      chunks.push(value);
    }
    const png = this.toPng(Buffer.concat(chunks), COVER_SIZE);
    if (!png.length) throw new Error('not_an_image');
    return png;
  }
}
