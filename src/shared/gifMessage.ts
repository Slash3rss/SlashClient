/**
 * GIFs and stickers in chat messages: the same reading and writing as the server's gifs.ts (keep the
 * two alike; tests/gifs.test.ts checks a message written by one is read by the other). A GIF is a
 * message whose text is "[GIF] title" (what older launchers and the game show) and, on the next
 * line, a reference to the provider's CDN. In direct and group chats that text is encrypted like any
 * other, so the server never learns which GIF was sent.
 */

export type GifProvider = 'giphy' | 'tenor';
export type GifKind = 'gif' | 'sticker';

/** A GIF as a message carries it (short keys: it has to fit in a chat message with its encryption). */
export interface GifRef {
  v: 1;
  /** provider */
  p: GifProvider;
  /** gif or sticker */
  k: GifKind;
  id: string;
  /** title */
  t: string;
  /** size of the shown animation */
  w: number;
  h: number;
  /** a still frame (shown when motion is reduced, and in the game) */
  s?: string;
  /** the animation as shown in the chat (small, webp or gif) */
  a: string;
  /** the bigger one, when clicked */
  f: string;
  /** mp4, when the provider has one */
  m?: string;
}

/** One result of a search, in one shape for both providers. */
export interface GifResult {
  id: string;
  title: string;
  kind: GifKind;
  w: number;
  h: number;
  still?: string;
  preview: string;
  full: string;
  mp4?: string;
}

export const GIF_MARK = 'slashgif:';
const MAX_TEXT = 2000;
const MAX_TITLE = 100;
const MAX_URL = 500;

/** The CDN hosts media may come from; anything else in a message is refused. */
export const GIF_HOSTS: Record<GifProvider, RegExp> = {
  giphy: /^(media\d?|i)\.giphy\.com$/,
  tenor: /^(media\d?|c)\.tenor\.com$/,
};

/** An https address on one of the providers' CDN hosts (any provider: older messages stay readable after a switch). */
export function isGifUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > MAX_URL) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && Object.values(GIF_HOSTS).some((re) => re.test(u.hostname));
}

const cleanTitle = (raw: unknown) => (typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : '');
const side = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(4096, Math.max(1, Math.round(n))) : undefined);

/** A reference from a message (or a client) checked and cleaned; undefined when it is not a valid one. */
export function validGif(raw: unknown): GifRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || (r.p !== 'giphy' && r.p !== 'tenor') || (r.k !== 'gif' && r.k !== 'sticker')) return undefined;
  if (typeof r.id !== 'string' || !/^[\w-]{1,64}$/.test(r.id)) return undefined;
  const w = side(r.w);
  const h = side(r.h);
  if (!w || !h || !isGifUrl(r.a) || !isGifUrl(r.f)) return undefined;
  if (r.s !== undefined && !isGifUrl(r.s)) return undefined;
  if (r.m !== undefined && !isGifUrl(r.m)) return undefined;
  // always in this order, so the same GIF is the same text
  return { v: 1, p: r.p, k: r.k, id: r.id, t: cleanTitle(r.t), w, h, ...(r.s ? { s: r.s as string } : {}), a: r.a, f: r.f, ...(r.m ? { m: r.m as string } : {}) };
}

/** The message text of a GIF: a line older launchers and the game show, then the reference. */
export function gifText(ref: GifRef): string {
  const r: GifRef = validGif(ref) ?? { ...ref };
  const head = `[GIF]${r.t ? ` ${r.t}` : ''}`;
  const text = () => `${head}\n${GIF_MARK}${JSON.stringify(r)}`;
  // a very long set of addresses: the mp4 and then the still go first, the chat needs neither
  if (text().length > MAX_TEXT) delete r.m;
  if (text().length > MAX_TEXT) delete r.s;
  return text();
}

/** Whether a text means to be a GIF (it carries the mark), valid or not. */
export const looksLikeGif = (text: unknown) => typeof text === 'string' && text.includes(`\n${GIF_MARK}`);

/** The GIF a message's text carries; undefined for any other text (or a broken reference). */
export function parseGifText(text: unknown): GifRef | undefined {
  if (typeof text !== 'string' || text.length > MAX_TEXT) return undefined;
  const at = text.indexOf(`\n${GIF_MARK}`);
  if (at < 0 || !text.startsWith('[GIF]')) return undefined;
  try {
    return validGif(JSON.parse(text.slice(at + 1 + GIF_MARK.length)));
  } catch {
    return undefined;
  }
}

/** What a notification or a quote shows for a text: a GIF's first line, any other text as it is. */
export const gifFallback = (text: string) => (looksLikeGif(text) ? text.slice(0, text.indexOf(`\n${GIF_MARK}`)) : text);
