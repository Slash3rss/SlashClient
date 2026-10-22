import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { SettingDef, Settings } from './settings.ts';
import { sitePage } from './sitePages.ts';
import type { SecretBox } from './storage.ts';

/**
 * Spotify: a player links their Spotify account (OAuth Authorization Code, scopes
 * user-read-currently-playing and user-read-playback-state), and the launcher asks what plays now
 * for the HUD's "Spotify" module (the game asks the launcher through its bridge, only while the
 * module is on).
 *
 * The Spotify app's Client ID and Client Secret are settings in the admin panel (Ustawienia →
 * Spotify; the secret sealed with STORAGE_SECRET_KEY); without both the feature is off and the
 * launcher and the site do not offer it. The player's refresh token is kept sealed with the same
 * key, the access token only in memory (renewed by the server when it ends). What plays is asked
 * of Spotify at most once per spotify.cacheSeconds per account; a 429 pauses every call for as
 * long as Spotify's Retry-After says (the last answer is served meanwhile). Unlinking deletes the
 * tokens (Spotify has no endpoint to revoke them: the player can also remove the app at
 * spotify.com/account/apps).
 */

/** The real addresses; tests catch them in their fake fetch. */
export const SPOTIFY = { accounts: 'https://accounts.spotify.com', api: 'https://api.spotify.com' };
export const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';

export const SPOTIFY_SETTING_DEFS: SettingDef[] = ([
  { key: 'spotify.clientId', label: 'Client ID aplikacji Spotify', labelEn: 'Spotify app Client ID', description: 'Z aplikacji na developer.spotify.com/dashboard (Web API). W aplikacji wpisz adres przekierowania (Redirect URI) dokładnie tak: {publicUrl}/v1/spotify/callback. Bez Client ID i Client Secret łączenie Spotify i moduł „Spotify” są wyłączone. Uwaga: aplikacja w trybie deweloperskim (Development mode) działa tylko dla najwyżej 25 kont Spotify dodanych ręcznie w panelu Spotify (User Management); dla wszystkich graczy trzeba poprosić Spotify o rozszerzenie limitu (Extended Quota Mode).', type: 'string', default: '', maxLength: 100 },
  { key: 'spotify.clientSecret', label: 'Client Secret aplikacji Spotify', labelEn: 'Spotify app Client Secret', description: 'Z tej samej aplikacji („View client secret”). Zapisany zaszyfrowany kluczem STORAGE_SECRET_KEY, nigdy nie wraca do panelu.', type: 'secret', default: '', maxLength: 200 },
  { key: 'spotify.cacheSeconds', label: 'Pytanie Spotify o utwór najczęściej co', labelEn: 'Spotify asked about the track at most every', description: 'Na konto: launchery i gra w tym czasie dostają zapamiętaną odpowiedź (moduł w grze sam przesuwa czas utworu). Po 429 serwer czeka tyle, ile każe Spotify (Retry-After).', type: 'duration', default: 4, min: 1, max: 60, unit: 's' },
  { key: 'spotify.linksPerMinute', label: 'Łączenie Spotify na minutę', labelEn: 'Spotify links per minute', description: 'Na konto.', type: 'int', default: 6, min: 1, max: 1000, unit: '/min' },
] as Omit<SettingDef, 'category'>[]).map((d) => ({ ...d, category: 'spotify' as const }));

export interface SpotifyContext {
  sql: DatabaseSync;
  box?: SecretBox;
  publicUrl: string;
  settings: Settings;
  authed: (req: http.IncomingMessage) => string;
  /** Linking per account (a rate limit). */
  limitLinks: (key: string) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

/** What plays, as the launcher and the game get it. */
export interface NowPlaying {
  kind: 'track' | 'episode';
  title: string;
  artists: string[];
  album: string;
  /** The smallest picture of the album (Spotify's own image host only), '' when there is none. */
  cover: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  url: string;
}

interface Account { uuid: string; spotifyId: string; name: string; refresh: string; linkedAt: number }

const SCHEMA = `CREATE TABLE IF NOT EXISTS spotify_accounts (
  uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, spotify_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  refresh TEXT NOT NULL, linked_at INTEGER NOT NULL)`;

const LINK_TTL_MS = 10 * 60_000;
/** Pictures only from Spotify's image host (the game downloads them through the launcher). */
export const COVER = /^https:\/\/i\.scdn\.co\/image\/[0-9a-f]{16,64}$/;
const TRACK_URL = /^https:\/\/open\.spotify\.com\/(track|episode)\/[A-Za-z0-9]{1,40}$/;

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const ms = (v: unknown) => Math.max(0, Math.min(24 * 3600_000, Math.floor(Number(v) || 0)));

/** The smallest picture of a list (Spotify sends 640, 300 and 64 px), when it is on Spotify's host. */
function smallest(images: unknown): string {
  if (!Array.isArray(images)) return '';
  const ok = images.filter((i) => i && typeof i.url === 'string' && COVER.test(i.url));
  ok.sort((a, b) => (Number(a.width) || 9999) - (Number(b.width) || 9999));
  return ok[0]?.url ?? '';
}

/** Spotify's currently-playing answer as SlashClient keeps it; null for nothing (or an ad, an unknown item). */
export function parseNowPlaying(body: any): NowPlaying | null {
  const item = body?.item;
  if (!item || typeof item !== 'object') return null;
  const episode = body.currently_playing_type === 'episode' || item.type === 'episode';
  const title = clip(item.name, 200);
  if (!title) return null;
  const artists = episode
    ? [clip(item.show?.publisher, 100) || clip(item.show?.name, 100)].filter(Boolean)
    : (Array.isArray(item.artists) ? item.artists : []).map((a: any) => clip(a?.name, 100)).filter(Boolean).slice(0, 8);
  const url = clip(item.external_urls?.spotify, 200);
  const duration = ms(item.duration_ms);
  return {
    kind: episode ? 'episode' : 'track', title, artists,
    album: episode ? clip(item.show?.name, 200) : clip(item.album?.name, 200),
    cover: episode ? smallest(item.images) || smallest(item.show?.images) : smallest(item.album?.images),
    durationMs: duration, progressMs: Math.min(duration || Infinity, ms(body.progress_ms)), isPlaying: body.is_playing === true,
    url: TRACK_URL.test(url) ? url : '',
  };
}

class SpotifyError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function createSpotify(ctx: SpotifyContext) {
  const now = ctx.now ?? Date.now;
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const fail: (status: number, code: string) => never = ctx.fail;
  const sql = ctx.sql;
  sql.exec(SCHEMA);
  const base = ctx.publicUrl.replace(/\/$/, '');
  const redirectUri = () => `${base}/v1/spotify/callback`;

  // ---------- the app's keys ----------

  const keys = () => {
    const clientId = ctx.settings.str('spotify.clientId').trim();
    const clientSecret = ctx.settings.str('spotify.clientSecret').trim();
    return clientId && clientSecret && ctx.box ? { clientId, clientSecret } : undefined;
  };
  const available = () => !!keys();

  // ---------- accounts ----------

  const row = (uuid: string): Account | undefined => {
    const r = sql.prepare('SELECT * FROM spotify_accounts WHERE uuid = ?').get(uuid) as Record<string, any> | undefined;
    return r && { uuid: r.uuid, spotifyId: r.spotify_id, name: r.name, refresh: r.refresh, linkedAt: r.linked_at };
  };
  const seal = (token: string, uuid: string) => ctx.box!.seal(token, `spotify:${uuid}`);
  const open = (sealed: string, uuid: string) => {
    try {
      return ctx.box?.open(sealed, `spotify:${uuid}`) ?? '';
    } catch {
      return '';
    }
  };
  /** Access tokens in memory only, by account. */
  const access = new Map<string, { token: string; until: number }>();
  /** The last answer per account, and the call on its way (so a burst of launchers asks Spotify once). */
  const cache = new Map<string, { at: number; value: NowPlaying | null; error?: string; pending?: Promise<void> }>();
  /** After a 429: no call to Spotify until then (its limits are per app). */
  let pausedUntil = 0;

  function forget(uuid: string) {
    access.delete(uuid);
    cache.delete(uuid);
  }

  function unlink(uuid: string): boolean {
    forget(uuid);
    return sql.prepare('DELETE FROM spotify_accounts WHERE uuid = ?').run(uuid).changes > 0;
  }

  function mine(uuid: string) {
    const a = row(uuid);
    return { available: available(), linked: !!a, name: a?.name ?? '', linkedAt: a?.linkedAt ?? null };
  }

  // ---------- talking to Spotify ----------

  async function call(url: string, init: RequestInit): Promise<Response> {
    if (now() < pausedUntil) throw new SpotifyError('rate_limited', 429);
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
    if (res.status === 429) {
      const after = Number(res.headers.get('retry-after'));
      pausedUntil = now() + Math.min(3600, after > 0 ? after : 30) * 1000;
      throw new SpotifyError('rate_limited', 429);
    }
    return res;
  }

  async function token(form: Record<string, string>): Promise<Record<string, any>> {
    const k = keys();
    if (!k) throw new SpotifyError('provider_disabled', 400);
    const res = await call(`${SPOTIFY.accounts}/api/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${k.clientId}:${k.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form),
    });
    const body = await res.json().catch(() => ({})) as Record<string, any>;
    // the refresh token was revoked (the app removed at spotify.com/account/apps, the secret changed)
    if (res.status === 400 && body.error === 'invalid_grant') throw new SpotifyError('relink', 400);
    if (!res.ok || typeof body.access_token !== 'string') throw new SpotifyError('provider_failed', res.status);
    return body;
  }

  function keepAccess(uuid: string, body: Record<string, any>) {
    access.set(uuid, { token: body.access_token, until: now() + Math.max(60, (Number(body.expires_in) || 3600) - 120) * 1000 });
  }

  /** The account's access token, renewed with its refresh token when it ended (Spotify may hand a new refresh token too). */
  async function accessToken(a: Account): Promise<string> {
    const kept = access.get(a.uuid);
    if (kept && now() < kept.until) return kept.token;
    const refresh = open(a.refresh, a.uuid);
    if (!refresh) throw new SpotifyError('relink', 400);
    const body = await token({ grant_type: 'refresh_token', refresh_token: refresh });
    keepAccess(a.uuid, body);
    if (typeof body.refresh_token === 'string' && body.refresh_token && body.refresh_token !== refresh) {
      sql.prepare('UPDATE spotify_accounts SET refresh = ? WHERE uuid = ?').run(seal(body.refresh_token, a.uuid), a.uuid);
    }
    return body.access_token;
  }

  /** Asks Spotify what plays for this account (one retry with a fresh token after a 401). */
  async function ask(a: Account): Promise<NowPlaying | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = await accessToken(a);
      const res = await call(`${SPOTIFY.api}/v1/me/player/currently-playing?additional_types=episode`, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } });
      // nothing plays (and nothing paused) on any device
      if (res.status === 204) return null;
      if (res.status === 401 && attempt === 0) {
        access.delete(a.uuid);
        continue;
      }
      // a Spotify app in development mode answers 403 for accounts not added in its dashboard
      if (res.status === 403) throw new SpotifyError('spotify_not_allowed', 403);
      if (!res.ok) throw new SpotifyError('provider_failed', res.status);
      const text = await res.text();
      return text ? parseNowPlaying(JSON.parse(text)) : null;
    }
    throw new SpotifyError('relink', 401);
  }

  /** What plays now for the account: from the cache while it is fresh, else from Spotify. */
  async function nowPlaying(uuid: string) {
    const a = row(uuid);
    if (!available()) return { available: false, linked: !!a, playing: null, at: now() };
    if (!a) return { available: true, linked: false, playing: null, at: now() };
    const ttl = ctx.settings.num('spotify.cacheSeconds') * 1000;
    let c = cache.get(uuid);
    const fresh = c && now() - c.at < ttl;
    if (!fresh && !c?.pending && now() >= pausedUntil) {
      const entry = c ?? { at: 0, value: null };
      cache.set(uuid, entry);
      entry.pending = ask(a).then((value) => {
        entry.value = value;
        entry.error = undefined;
      }, (err) => {
        const code = err instanceof SpotifyError ? err.code : 'provider_failed';
        if (code === 'relink') {
          unlink(uuid);
          console.error('spotify: token odrzucony, konto odłączone');
        } else if (code !== 'rate_limited' && code !== 'spotify_not_allowed') console.error(`spotify: ${(err as Error).message}`);
        // after a 429 the last answer stays; anything else says nothing plays
        if (code !== 'rate_limited') entry.value = null;
        entry.error = code;
      }).finally(() => {
        entry.at = now();
        entry.pending = undefined;
      });
      c = entry;
    }
    if (c?.pending) await c.pending;
    if (!row(uuid)) return { available: true, linked: false, playing: null, at: now(), error: 'relink' };
    const value = c?.value ?? null;
    // the progress moved on since the answer was kept (the game moves it further between its own asks)
    const playing = value && value.isPlaying ? { ...value, progressMs: Math.min(value.durationMs || Infinity, value.progressMs + Math.max(0, now() - (c?.at ?? now()))) } : value;
    return { available: true, linked: true, playing, at: now(), ...(c?.error ? { error: c.error } : {}) };
  }

  // ---------- linking ----------

  type Link = { uuid: string; at: number; result?: unknown; error?: string };
  const links = new Map<string, Link>();
  const sweep = () => {
    for (const [s, l] of links) if (now() - l.at > LINK_TTL_MS) links.delete(s);
  };

  async function finishLink(link: Link, code: string): Promise<boolean> {
    const tok = await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
    if (typeof tok.refresh_token !== 'string' || !tok.refresh_token) throw new SpotifyError('provider_failed');
    const res = await call(`${SPOTIFY.api}/v1/me`, { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/json' } });
    if (res.status === 403) {
      link.error = 'spotify_not_allowed';
      return false;
    }
    const me = await res.json().catch(() => ({})) as Record<string, any>;
    if (!res.ok || typeof me.id !== 'string' || !me.id) throw new SpotifyError('provider_failed', res.status);
    sql.prepare(`INSERT INTO spotify_accounts (uuid, spotify_id, name, refresh, linked_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (uuid) DO UPDATE SET spotify_id = excluded.spotify_id, name = excluded.name, refresh = excluded.refresh, linked_at = excluded.linked_at`)
      .run(link.uuid, clip(me.id, 100), clip(me.display_name, 60) || clip(me.id, 60), seal(tok.refresh_token, link.uuid), now());
    forget(link.uuid);
    keepAccess(link.uuid, tok);
    link.result = { linked: true, spotify: mine(link.uuid) };
    return true;
  }

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/me\/spotify$/, (req) => mine(ctx.authed(req))],
    // the launcher (or the site) opens the URL in the browser and asks /poll until it is done
    ['POST', /^\/v1\/me\/spotify\/start$/, (req) => {
      const me = ctx.authed(req);
      ctx.limitLinks(`spotify:${me}`);
      const k = keys();
      if (!k) fail(400, 'provider_disabled');
      sweep();
      const state = randomBytes(24).toString('base64url');
      links.set(state, { uuid: me, at: now() });
      const q = new URLSearchParams({ client_id: k.clientId, response_type: 'code', redirect_uri: redirectUri(), scope: SPOTIFY_SCOPES, state, show_dialog: 'true' });
      return { state, url: `${SPOTIFY.accounts}/authorize?${q}` };
    }],
    ['GET', /^\/v1\/me\/spotify\/poll$/, (req, _p, url) => {
      const me = ctx.authed(req);
      const state = url.searchParams.get('state') ?? '';
      const link = links.get(state);
      // only the account that started it learns how it ended
      if (!link || link.uuid !== me || now() - link.at > LINK_TTL_MS) fail(404, 'login_expired');
      if (link.error) {
        links.delete(state);
        fail(400, link.error);
      }
      if (!link.result) return { pending: true };
      links.delete(state);
      return link.result;
    }],
    ['DELETE', /^\/v1\/me\/spotify$/, (req) => {
      const me = ctx.authed(req);
      if (!unlink(me)) fail(404, 'not_found');
      return mine(me);
    }],
    // what plays now (the launcher asks for the game's module)
    ['GET', /^\/v1\/me\/spotify\/now$/, (req) => nowPlaying(ctx.authed(req))],
  ];

  /** The browser back from Spotify's consent page. */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== '/v1/spotify/callback' || req.method !== 'GET') return false;
    const state = url.searchParams.get('state') ?? '';
    const link = links.get(state);
    const code = url.searchParams.get('code');
    let ok = false;
    if (link && now() - link.at <= LINK_TTL_MS && !link.result && !link.error && code) {
      try {
        ok = await finishLink(link, code);
      } catch (err) {
        console.error(`spotify: łączenie: ${(err as Error).message}`);
        link.error = err instanceof SpotifyError && err.code === 'rate_limited' ? 'rate_limited' : 'provider_failed';
      }
    } else if (link && !link.result) link.error ??= url.searchParams.get('error') ? 'provider_denied' : 'provider_failed';
    res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(linkPage(ok, link?.error));
    return true;
  }

  return { routes, serve, mine, nowPlaying, available, unlink, redirectUri };
}

function linkPage(ok: boolean, error?: string): string {
  const [icon, tone, title, text] = ok
    ? ['fa-brands fa-spotify', 'ok', 'Połączono Spotify', 'Możesz zamknąć tę kartę i wrócić do SlashClient. Moduł „Spotify” w grze pokaże, czego słuchasz.']
    : error === 'spotify_not_allowed'
      ? ['fa-solid fa-user-lock', 'warning', 'Spotify nie wpuścił tego konta', 'Aplikacja SlashClient w Spotify działa na razie tylko dla kont dodanych przez administratora. Napisz do niego, żeby dodał Twoje konto Spotify.']
      : ['fa-solid fa-circle-xmark', 'error', 'Nie udało się połączyć Spotify', 'Wróć do SlashClient i spróbuj ponownie.'];
  return sitePage({ lang: 'pl', icon, tone: tone as 'ok' | 'warning' | 'error', title, text });
}
