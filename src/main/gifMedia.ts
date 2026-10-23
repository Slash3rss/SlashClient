import { isGifUrl } from '../shared/gifMessage';

/**
 * GIFs and stickers in the chat (server 0.9.40+): the page shows them as slash-gif://m/?u=<CDN
 * address>, and this asks for the file where the server says. With "Multimedia przez serwer" on in
 * the admin panel (the default) it comes through the server, so GIPHY and Tenor never see the
 * player's address; off (or an older server), straight from the provider's CDN. Only addresses on
 * the providers' CDN hosts are ever asked for, whatever a message says.
 */

const CONFIG_MS = 5 * 60_000;
/** The most the game gets for one picture (a still frame is a few KB). */
const MAX_GAME_BYTES = 8 * 1024 * 1024;

export interface GifMediaOptions {
  /** The server's /v1/gifs; throws when there is none (an older server). */
  config: () => Promise<{ proxy?: boolean }>;
  serverUrl: () => string;
  fetch: (url: string) => Promise<Response>;
  now?: () => number;
}

export function createGifMedia(opts: GifMediaOptions) {
  const now = opts.now ?? Date.now;
  let known: { at: number; server: string; proxy: Promise<boolean> } | undefined;

  /** Whether files go through the server, asked again every few minutes or when the server changes. */
  function proxied(): Promise<boolean> {
    const server = opts.serverUrl();
    if (!known || known.server !== server || now() - known.at > CONFIG_MS) {
      known = { at: now(), server, proxy: opts.config().then((c) => c?.proxy === true, () => false) };
    }
    return known.proxy;
  }

  /** Where the file is asked for; undefined for an address off the providers' CDN. */
  async function source(url: string): Promise<string | undefined> {
    if (!isGifUrl(url)) return undefined;
    return (await proxied()) ? `${opts.serverUrl().replace(/\/+$/, '')}/v1/gifs/media?u=${encodeURIComponent(url)}` : url;
  }

  /** slash-gif://m/?u=…, for the page's <img>. */
  async function handle(request: Request): Promise<Response> {
    const at = await source(new URL(request.url).searchParams.get('u') ?? '');
    if (!at) return new Response('Not found', { status: 404 });
    try {
      const res = await opts.fetch(at);
      if (!res.ok) return new Response('Not found', { status: 404 });
      const type = res.headers.get('content-type') ?? '';
      if (!/^(image\/(gif|webp|png|jpeg)|video\/mp4)\b/i.test(type)) return new Response('Not found', { status: 404 });
      return new Response(res.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800, immutable' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  /** A file's bytes for the game (its still frame), at most a few MB. */
  async function bytes(url: string): Promise<{ type: string; data: Buffer }> {
    const at = await source(url);
    if (!at) throw new Error('bad_url');
    const res = await opts.fetch(at);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(gif|png|jpeg|webp)$/.test(type)) throw new Error('bad_type');
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_GAME_BYTES) throw new Error('too_big');
    return { type, data };
  }

  return { handle, bytes, source };
}
