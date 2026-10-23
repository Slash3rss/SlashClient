import type http from 'node:http';
import { Readable } from 'node:stream';
import type { SettingDef } from './settings.ts';
import type { Settings } from './settings.ts';

/**
 * GIFs and stickers in the chats (server 0.9.40+), from GIPHY or Tenor.
 *
 * Search: the provider's API needs a key that must not ship inside the launcher or the phone app,
 * so /v1/gifs/search asks the provider here (like the CurseForge proxy) and answers a short list of
 * results in one shape for both providers; answers are kept in memory for a short while, so a
 * popular search (or the trending list) does not spend the key's quota. Without a key, or with the
 * feature switched off in the panel, /v1/gifs says { enabled: false } and the clients hide the
 * button.
 *
 * Messages: a GIF is a message whose text is a short line for older launchers and the game
 * ("[GIF] title") and, on the next line, a reference: the provider, the GIF's id and a few media
 * addresses on the provider's CDN. In direct and group chats that text is end-to-end encrypted like
 * any other (so the server never sees which GIF went where); in communities it is checked here.
 * Every client checks the addresses against the same list of CDN hosts before it shows one.
 *
 * Media: /v1/gifs/media?u=<CDN address> passes the file through from an allow-listed CDN host, so
 * players' addresses are not shown to GIPHY or Tenor. Nothing is written to disk; sizes and types
 * are checked, and the answer may be kept by browsers and the launcher for a long time (the files
 * never change). The admin may switch this off; the clients then load from the CDN directly.
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
const MAX_QUERY = 50;

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

// ---------- settings ----------

export const GIF_SETTING_DEFS: SettingDef[] = ([
  { key: 'gifs.enabled', label: 'GIF-y i naklejki w czatach', labelEn: 'GIFs and stickers in chats', description: 'Przycisk „GIF” w launcherze i aplikacji na telefon. Bez klucza API poniżej i tak jest ukryty.', type: 'bool', default: true },
  { key: 'gifs.provider', label: 'Dostawca', labelEn: 'Provider', description: 'giphy: GIPHY (developers.giphy.com). tenor: Tenor od Google – nowe klucze nie są wydawane od stycznia 2026, a API przestało działać 30 czerwca 2026, więc zostaw GIPHY, chyba że masz działający klucz Tenora.', type: 'enum', options: ['giphy', 'tenor'], default: 'giphy' },
  { key: 'gifs.apiKey', label: 'Klucz API dostawcy', labelEn: 'Provider API key', description: 'Klucz GIPHY (developers.giphy.com → Create an App → API) albo Tenora. Zostaje na serwerze; launcher i aplikacja szukają przez serwer. Pusty: GIF-y są wyłączone.', type: 'secret', default: '', maxLength: 200 },
  { key: 'gifs.giphyRating', label: 'Ograniczenie treści (GIPHY)', labelEn: 'Content rating (GIPHY)', description: 'Najwyższa kategoria wyników GIPHY: g, pg, pg-13, r.', type: 'enum', options: ['g', 'pg', 'pg-13', 'r'], default: 'pg-13' },
  { key: 'gifs.tenorContentFilter', label: 'Ograniczenie treści (Tenor)', labelEn: 'Content filter (Tenor)', description: 'contentfilter Tenora: high (najbezpieczniej), medium, low, off.', type: 'enum', options: ['high', 'medium', 'low', 'off'], default: 'medium' },
  { key: 'gifs.locale', label: 'Język wyszukiwania', labelEn: 'Search locale', description: 'Np. pl_PL albo en_US: język zapytań i kraj popularnych GIF-ów.', type: 'string', default: 'pl_PL', maxLength: 10 },
  { key: 'gifs.proxy', label: 'Multimedia przez serwer', labelEn: 'Media through the server', description: 'GIF-y i naklejki płyną przez ten serwer (bez zapisu na dysk), więc GIPHY i Tenor nie widzą adresów IP graczy. Wyłączone: launcher i aplikacja ładują je prosto z serwerów dostawcy.', type: 'bool', default: true },
  { key: 'gifs.mediaMaxBytes', label: 'Największy plik GIF-a', labelEn: 'Largest GIF file', description: 'Większy plik serwer odrzuca (przy multimediach przez serwer).', type: 'bytes', default: 10 * 1024 * 1024, min: 256 * 1024, max: 50 * 1024 * 1024, bytesUnit: 'MB' },
  { key: 'gifs.pageSize', label: 'Wyników na stronę', labelEn: 'Results per page', description: 'Ile GIF-ów przychodzi naraz w wyszukiwarce (przewijanie dociąga kolejne).', type: 'int', default: 24, min: 8, max: 50 },
  { key: 'gifs.cacheSeconds', label: 'Pamięć wyników wyszukiwania', labelEn: 'Search results kept', description: 'Jak długo serwer pamięta odpowiedź dostawcy na to samo zapytanie (oszczędza limit klucza).', type: 'duration', default: 300, min: 0, max: 86_400, unit: 's' },
  { key: 'gifs.searchesPerMinute', label: 'Wyszukiwania GIF-ów na minutę', labelEn: 'GIF searches per minute', description: 'Na konto (także popularne i kolejne strony).', type: 'int', default: 60, min: 1, max: 10_000, unit: '/min' },
  { key: 'gifs.sendPerMinute', label: 'GIF-y w społecznościach na minutę', labelEn: 'GIFs in communities per minute', description: 'Na konto. W czatach szyfrowanych serwer nie wie, co jest GIF-em: tam działają zwykłe limity wiadomości.', type: 'int', default: 10, min: 1, max: 10_000, unit: '/min' },
  { key: 'gifs.mediaPerMinute', label: 'Pobrania GIF-ów na minutę', labelEn: 'GIF downloads per minute', description: 'Na adres IP, przy multimediach przez serwer (siatka wyszukiwarki to kilkadziesiąt naraz).', type: 'int', default: 1200, min: 10, max: 100_000, unit: '/min' },
] as Omit<SettingDef, 'category'>[]).map((d) => ({ ...d, category: 'gifs' as const }));

// ---------- providers ----------

const PROVIDER_API = { giphy: 'https://api.giphy.com/v1', tenor: 'https://tenor.googleapis.com/v2' };
const TENOR_FORMATS = 'gif,tinygif,mediumgif,mp4,tinymp4,gifpreview,tinygifpreview,webp_transparent,tinywebp_transparent,gif_transparent,tinygif_transparent';
const MAX_CACHED = 500;

export interface GifSearch { provider: GifProvider; results: GifResult[]; next?: string }

type Json = Record<string, any>;
const url = (u: unknown) => (isGifUrl(u) ? u : undefined);

function fromGiphy(d: Json, kind: GifKind): GifResult | undefined {
  const i = d?.images ?? {};
  const fw = i.fixed_width ?? {};
  const preview = url(fw.webp) ?? url(fw.url);
  const full = url(i.original?.webp) ?? url(i.original?.url) ?? preview;
  const w = side(Number(fw.width));
  const h = side(Number(fw.height));
  if (typeof d?.id !== 'string' || !/^[\w-]{1,64}$/.test(d.id) || !preview || !full || !w || !h) return undefined;
  return { id: d.id, title: cleanTitle(d.title), kind, w, h, still: url(i.fixed_width_still?.url), preview, full, mp4: url(i.original?.mp4) ?? url(fw.mp4) };
}

function fromTenor(d: Json, kind: GifKind): GifResult | undefined {
  const f = d?.media_formats ?? {};
  const pick = (...names: string[]) => names.map((n) => f[n]).find((x) => isGifUrl(x?.url));
  const small = kind === 'sticker' ? pick('tinywebp_transparent', 'tinygif_transparent', 'tinygif') : pick('tinygif', 'mediumgif', 'gif');
  const big = kind === 'sticker' ? pick('webp_transparent', 'gif_transparent', 'gif') : pick('mediumgif', 'gif', 'tinygif');
  const dims = Array.isArray(small?.dims) ? small.dims : [];
  const w = side(dims[0]);
  const h = side(dims[1]);
  if (typeof d?.id !== 'string' || !/^[\w-]{1,64}$/.test(d.id) || !small || !big || !w || !h) return undefined;
  return { id: d.id, title: cleanTitle(d.content_description || d.title), kind, w, h, still: pick('tinygifpreview', 'gifpreview')?.url, preview: small.url, full: big.url, mp4: pick('mp4', 'tinymp4')?.url };
}

export class GifError extends Error {
  readonly status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

export function createGifs(opts: { settings: Settings; fetchImpl?: typeof fetch; now?: () => number }) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const s = opts.settings;
  const cache = new Map<string, { at: number; answer: GifSearch }>();

  const provider = () => s.str('gifs.provider') as GifProvider;
  const enabled = () => s.bool('gifs.enabled') && !!s.str('gifs.apiKey');
  /** What the clients need: whether to show the button, whose attribution, and how to load media. */
  const config = () => ({ enabled: enabled(), provider: provider(), proxy: s.bool('gifs.proxy') });

  async function search(kind: GifKind, rawQuery: string, pos: string): Promise<GifSearch> {
    if (!enabled()) throw new GifError(503, 'gifs_unavailable');
    const q = rawQuery.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_QUERY);
    if (pos && !/^[\w.:=+/-]{1,200}$/.test(pos)) throw new GifError(400, 'bad_request');
    const p = provider();
    const key = s.str('gifs.apiKey');
    const limit = s.num('gifs.pageSize');
    const locale = /^[a-z]{2}(_[A-Z]{2})?$/.test(s.str('gifs.locale')) ? s.str('gifs.locale') : 'pl_PL';
    const params = new URLSearchParams();
    let endpoint: string;
    if (p === 'giphy') {
      endpoint = `${PROVIDER_API.giphy}/${kind === 'sticker' ? 'stickers' : 'gifs'}/${q ? 'search' : 'trending'}`;
      params.set('api_key', key);
      if (q) params.set('q', q);
      params.set('limit', String(limit));
      if (pos) params.set('offset', String(Math.min(4999, Number(pos) || 0)));
      params.set('rating', s.str('gifs.giphyRating'));
      if (q) params.set('lang', locale.slice(0, 2));
      if (locale.length === 5) params.set('country_code', locale.slice(3));
    } else {
      endpoint = `${PROVIDER_API.tenor}/${q ? 'search' : 'featured'}`;
      params.set('key', key);
      params.set('client_key', 'slashclient');
      if (q) params.set('q', q);
      params.set('limit', String(limit));
      if (pos) params.set('pos', pos);
      params.set('locale', locale);
      if (locale.length === 5) params.set('country', locale.slice(3));
      params.set('contentfilter', s.str('gifs.tenorContentFilter'));
      params.set('media_filter', TENOR_FORMATS);
      if (kind === 'sticker') params.set('searchfilter', 'sticker');
    }
    // the cache's key leaves the API key out (a new key need not empty it, the answers are the same)
    const cacheKey = `${endpoint}?${[...params].filter(([k]) => k !== 'api_key' && k !== 'key').map(([k, v]) => `${k}=${v.toLowerCase()}`).join('&')}`;
    const kept = cache.get(cacheKey);
    const ttl = s.num('gifs.cacheSeconds') * 1000;
    if (kept && now() - kept.at < ttl) return kept.answer;

    let res: Response;
    try {
      res = await fetchImpl(`${endpoint}?${params}`, { headers: { Accept: 'application/json', 'User-Agent': 'SlashClient-server' }, signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      console.error('gify:', (err as Error).message);
      throw new GifError(502, 'gifs_failed');
    }
    if (res.status === 401 || res.status === 403) {
      // a wrong or revoked key: to the clients it is the same as none (the log says which)
      console.error(`gify: ${p} odrzucił klucz (${res.status}), sprawdź gifs.apiKey w panelu`);
      throw new GifError(503, 'gifs_unavailable');
    }
    if (res.status === 429) throw new GifError(429, 'rate_limited');
    if (!res.ok) {
      console.error(`gify: ${p} ${res.status}`);
      throw new GifError(502, 'gifs_failed');
    }
    const data = (await res.json().catch(() => ({}))) as Json;
    let answer: GifSearch;
    if (p === 'giphy') {
      const results = (Array.isArray(data.data) ? data.data : []).map((d: Json) => fromGiphy(d, kind)).filter(Boolean) as GifResult[];
      const pg = data.pagination ?? {};
      const end = (Number(pg.offset) || 0) + (Number(pg.count) || 0);
      answer = { provider: p, results, ...(results.length && end < Math.min(Number(pg.total_count) || 0, 4999) ? { next: String(end) } : {}) };
    } else {
      const results = (Array.isArray(data.results) ? data.results : []).map((d: Json) => fromTenor(d, kind)).filter(Boolean) as GifResult[];
      const next = typeof data.next === 'string' && /^[\w.:=+/-]{1,200}$/.test(data.next) && data.next !== '0' ? data.next : undefined;
      answer = { provider: p, results, ...(results.length && next ? { next } : {}) };
    }
    if (ttl > 0) {
      if (cache.size >= MAX_CACHED) cache.clear();
      cache.set(cacheKey, { at: now(), answer });
    }
    return answer;
  }

  /** The types a GIF's file may be; anything else from the CDN is refused. */
  const MEDIA_TYPES = /^(image\/(gif|webp|png|jpeg)|video\/mp4)$/;

  /**
   * /v1/gifs/media?u=…: the file passed through from the CDN as it comes (never kept on disk).
   * Redirects are followed only to allow-listed hosts. The player's own headers (cookies, their
   * browser) are not passed on: GIPHY and Tenor see only this server.
   */
  async function media(req: http.IncomingMessage, res: http.ServerResponse, target: string | null): Promise<void> {
    const send = (status: number, code: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: code }));
    };
    if (!s.bool('gifs.proxy')) return send(404, 'not_found');
    if (!isGifUrl(target)) return send(400, 'bad_url');
    let at: string = target;
    let upstream: Response | undefined;
    for (let hops = 0; hops < 3; hops++) {
      try {
        upstream = await fetchImpl(at, { redirect: 'manual', headers: { 'User-Agent': 'SlashClient-server', Accept: 'image/webp,image/gif,image/*,video/mp4' }, signal: AbortSignal.timeout(20_000) });
      } catch (err) {
        console.error('gify (plik):', (err as Error).message);
        return send(502, 'gifs_failed');
      }
      if (upstream.status < 300 || upstream.status >= 400) break;
      const to = upstream.headers.get('location');
      const next = to ? new URL(to, at).toString() : '';
      await upstream.body?.cancel().catch(() => undefined);
      upstream = undefined;
      if (!isGifUrl(next)) return send(502, 'gifs_failed');
      at = next;
    }
    if (!upstream) return send(502, 'gifs_failed');
    if (upstream.status === 404 || upstream.status === 410) {
      await upstream.body?.cancel().catch(() => undefined);
      return send(404, 'not_found');
    }
    const type = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const max = s.num('gifs.mediaMaxBytes');
    const length = Number(upstream.headers.get('content-length'));
    if (!upstream.ok || !upstream.body || !MEDIA_TYPES.test(type) || (Number.isFinite(length) && length > max)) {
      await upstream.body?.cancel().catch(() => undefined);
      return send(upstream.ok ? 415 : 502, upstream.ok ? (length > max ? 'too_big' : 'bad_type') : 'gifs_failed');
    }
    res.writeHead(200, {
      'Content-Type': type,
      ...(Number.isFinite(length) && length > 0 ? { 'Content-Length': String(length) } : {}),
      // a CDN file never changes under its address: browsers and the launcher keep it
      'Cache-Control': 'public, max-age=604800, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
    });
    if (req.method === 'HEAD') {
      await upstream.body.cancel().catch(() => undefined);
      res.end();
      return;
    }
    // counted on the way: a CDN that says nothing of the size (or lies) is cut off at the limit
    let seen = 0;
    const body = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream<Uint8Array>);
    await new Promise<void>((resolve) => {
      body.on('data', (chunk: Buffer) => {
        seen += chunk.length;
        if (seen > max) {
          body.destroy();
          res.destroy();
          resolve();
          return;
        }
        if (!res.write(chunk)) body.pause();
      });
      res.on('drain', () => body.resume());
      res.on('close', () => {
        body.destroy();
        resolve();
      });
      body.on('end', () => {
        res.end();
        resolve();
      });
      body.on('error', () => {
        res.destroy();
        resolve();
      });
    });
  }

  return { config, search, media, enabled };
}

export type Gifs = ReturnType<typeof createGifs>;
type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function gifRoutes(ctx: { gifs: Gifs; authed: (req: http.IncomingMessage) => string; limitSearch: (key: string) => void; fail: (status: number, code: string) => never }): [string, RegExp, Handler][] {
  return [
    // whether the clients show the button (public: nothing in it is secret)
    ['GET', /^\/v1\/gifs$/, () => ctx.gifs.config()],
    // ?kind=gif|sticker&q=…&pos=…; no q: what is popular now
    ['GET', /^\/v1\/gifs\/search$/, async (req, _p, url) => {
      const me = ctx.authed(req);
      const kind = url.searchParams.get('kind') ?? 'gif';
      if (kind !== 'gif' && kind !== 'sticker') ctx.fail(400, 'bad_request');
      if (!ctx.gifs.enabled()) ctx.fail(503, 'gifs_unavailable');
      ctx.limitSearch(me);
      try {
        return await ctx.gifs.search(kind as GifKind, url.searchParams.get('q') ?? '', url.searchParams.get('pos') ?? '');
      } catch (err) {
        if (err instanceof GifError) ctx.fail(err.status, err.message);
        throw err;
      }
    }],
  ];
}
