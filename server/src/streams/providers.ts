import { createHash, createVerify, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Twitch and Kick for "Streamy": linking a channel (OAuth, only to learn who it is; no token is
 * kept), asking whether channels are live (Twitch Helix /streams, Kick /channels) with the app's
 * own token, EventSub / Kick event subscriptions, and checking their webhooks' signatures.
 *
 * Every call goes through a `Gate`: a per-minute budget (the admin panel's settings) and a pause
 * when the platform answers 429, so a reconcile never runs into the platforms' rate limits.
 */

export type Platform = 'twitch' | 'kick';
export const PLATFORMS: Platform[] = ['twitch', 'kick'];

/** The real addresses; tests point them at fakes. */
export const TWITCH = { id: 'https://id.twitch.tv', api: 'https://api.twitch.tv' };
export const KICK = { id: 'https://id.kick.com', api: 'https://api.kick.com' };

export interface AppKeys { clientId: string; clientSecret: string }

/** Who linked: the platform's user id, the login (channel name in addresses), the name shown. */
export interface ChannelIdentity { subject: string; login: string; name: string }

/** A live stream as both platforms describe it. */
export interface LiveInfo { subject: string; title: string; category: string; viewers: number; startedAt: number; thumbnail: string }

export class ProviderError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

export class RateLimited extends Error {}

/** A request budget per minute and a pause after a 429 (until the platform's reset time). */
export class Gate {
  private tokens: number;
  private at: number;
  private pausedUntil = 0;
  private readonly perMinute: () => number;
  private readonly now: () => number;
  constructor(perMinute: () => number, now: () => number = Date.now) {
    this.perMinute = perMinute;
    this.now = now;
    this.tokens = perMinute();
    this.at = now();
  }

  /** Takes one request from the budget; throws RateLimited when there is none (the caller tries next round). */
  take() {
    const now = this.now();
    if (now < this.pausedUntil) throw new RateLimited('paused');
    const per = Math.max(1, this.perMinute());
    this.tokens = Math.min(per, this.tokens + ((now - this.at) / 60_000) * per);
    this.at = now;
    if (this.tokens < 1) throw new RateLimited('budget');
    this.tokens--;
  }

  /** What a 429 said: Twitch's Ratelimit-Reset (epoch seconds), else Retry-After, else a minute. */
  pause(res: Response) {
    const reset = Number(res.headers.get('ratelimit-reset'));
    const after = Number(res.headers.get('retry-after'));
    const until = reset > 0 ? reset * 1000 : this.now() + (after > 0 ? after * 1000 : 60_000);
    this.pausedUntil = Math.min(until, this.now() + 10 * 60_000);
  }

  get paused() {
    return this.now() < this.pausedUntil;
  }
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** PKCE (RFC 7636): a random verifier kept on the server, its SHA-256 sent with the authorize request. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const LOGIN = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,39}$/;
const timeOf = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};
/** Only pictures from the platforms' own image hosts. */
const thumb = (v: unknown, hosts: RegExp) => (typeof v === 'string' && hosts.test(v) ? v.slice(0, 500) : '');

interface Ctx { fetchImpl: typeof fetch; gate: Gate }

async function send(ctx: Ctx, url: string, init: RequestInit = {}): Promise<Response> {
  ctx.gate.take();
  const res = await ctx.fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) {
    ctx.gate.pause(res);
    throw new RateLimited('429');
  }
  return res;
}

async function json(ctx: Ctx, url: string, init: RequestInit = {}): Promise<any> {
  const res = await send(ctx, url, init);
  const text = await res.text();
  if (!res.ok) throw new ProviderError(`${new URL(url).host}${new URL(url).pathname}: HTTP ${res.status}`, res.status);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ProviderError(`${new URL(url).pathname}: not JSON`, res.status);
  }
}

const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(o) });

/** An app access token (client credentials), kept until shortly before it ends. */
class AppToken {
  private token = '';
  private until = 0;
  private readonly get: () => Promise<{ access_token?: string; expires_in?: number }>;
  constructor(get: () => Promise<{ access_token?: string; expires_in?: number }>) {
    this.get = get;
  }
  async value(now = Date.now()): Promise<string> {
    if (this.token && now < this.until) return this.token;
    const r = await this.get();
    if (!r.access_token) throw new ProviderError('no app token');
    this.token = r.access_token;
    this.until = now + Math.max(60, (r.expires_in ?? 3600) - 300) * 1000;
    return this.token;
  }
  forget() {
    this.token = '';
  }
}

// ---------------- Twitch ----------------

export function twitchClient(keys: AppKeys, opts: { base?: Partial<typeof TWITCH>; fetchImpl?: typeof fetch; gate: Gate }) {
  const base = { ...TWITCH, ...opts.base };
  const ctx: Ctx = { fetchImpl: opts.fetchImpl ?? fetch, gate: opts.gate };
  const app = new AppToken(() => json(ctx, `${base.id}/oauth2/token`, form({ client_id: keys.clientId, client_secret: keys.clientSecret, grant_type: 'client_credentials' })));
  const helix = async (method: string, path: string, body?: unknown) => {
    const token = await app.value();
    const init = { method, headers: { Authorization: `Bearer ${token}`, 'Client-Id': keys.clientId, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined };
    const res = await send(ctx, `${base.api}/helix${path}`, init);
    // the token ended early (revoked, rotated secret): once more with a fresh one
    if (res.status === 401) {
      app.forget();
      const again = await send(ctx, `${base.api}/helix${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await app.value()}` } });
      return again;
    }
    return res;
  };

  return {
    /** Only identity: no scope, the token is revoked right after. */
    authorizeUrl: (state: string, redirectUri: string) =>
      `${base.id}/oauth2/authorize?${new URLSearchParams({ client_id: keys.clientId, redirect_uri: redirectUri, response_type: 'code', scope: '', state, force_verify: 'true' })}`,

    async identityFromCode(code: string, redirectUri: string): Promise<ChannelIdentity> {
      const tok = await json(ctx, `${base.id}/oauth2/token`, form({ client_id: keys.clientId, client_secret: keys.clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }));
      if (!tok.access_token) throw new ProviderError('Twitch: no token');
      try {
        const me = await json(ctx, `${base.api}/helix/users`, { headers: { Authorization: `Bearer ${tok.access_token}`, 'Client-Id': keys.clientId } });
        const u = me.data?.[0];
        if (!u?.id || !LOGIN.test(String(u.login ?? ''))) throw new ProviderError('Twitch: no user');
        return { subject: String(u.id), login: String(u.login).toLowerCase(), name: clip(u.display_name, 40) || String(u.login) };
      } finally {
        // nothing of the player's Twitch account is kept: the token goes back at once
        await ctx.fetchImpl(`${base.id}/oauth2/revoke`, { ...form({ client_id: keys.clientId, token: tok.access_token }), signal: AbortSignal.timeout(5000) }).catch(() => undefined);
      }
    },

    /** Live streams of up to 100 users (Helix GET /streams); the others are offline. */
    async liveOf(subjects: string[]): Promise<LiveInfo[]> {
      if (!subjects.length) return [];
      if (subjects.length > 100) throw new Error('at most 100');
      const q = new URLSearchParams(subjects.map((s) => ['user_id', s]));
      q.set('first', '100');
      const res = await helix('GET', `/streams?${q}`);
      if (!res.ok) throw new ProviderError(`Twitch streams: HTTP ${res.status}`, res.status);
      const body = (await res.json()) as { data?: Record<string, unknown>[] };
      return (body.data ?? []).filter((s) => s.type === 'live' || s.type === undefined).map((s) => ({
        subject: String(s.user_id), title: clip(s.title, 140), category: clip(s.game_name, 80), viewers: Math.max(0, Number(s.viewer_count) || 0),
        startedAt: timeOf(s.started_at), thumbnail: thumb(String(s.thumbnail_url ?? '').replace('{width}', '440').replace('{height}', '248'), /^https:\/\/static-cdn\.jtvnw\.net\//),
      }));
    },

    /** EventSub over a webhook for one event of one broadcaster; answers the subscription's id. */
    async subscribe(type: 'stream.online' | 'stream.offline', subject: string, callback: string, secret: string): Promise<string> {
      const res = await helix('POST', '/eventsub/subscriptions', { type, version: '1', condition: { broadcaster_user_id: subject }, transport: { method: 'webhook', callback, secret } });
      const body = (await res.json().catch(() => ({}))) as { data?: { id: string }[]; message?: string };
      // already there (a link made again): fine, the reconcile and the webhooks keep working
      if (res.status === 409) return '';
      if (!res.ok || !body.data?.[0]?.id) throw new ProviderError(`Twitch EventSub: HTTP ${res.status} ${clip(body.message, 120)}`, res.status);
      return body.data[0].id;
    },

    async unsubscribe(id: string) {
      const res = await helix('DELETE', `/eventsub/subscriptions?${new URLSearchParams({ id })}`);
      if (!res.ok && res.status !== 404) throw new ProviderError(`Twitch EventSub delete: HTTP ${res.status}`, res.status);
    },

    /** The panel's "Test połączenia": an app token and one Helix call. */
    async test() {
      const res = await helix('GET', '/streams?first=1');
      if (!res.ok) throw new ProviderError(`Twitch: HTTP ${res.status}`, res.status);
    },
  };
}
export type TwitchClient = ReturnType<typeof twitchClient>;

/** How old an EventSub message may be; older ones (and repeated ids) are replays. */
export const EVENTSUB_MAX_AGE_MS = 10 * 60_000;

/**
 * An EventSub webhook's signature: "sha256=" + hex HMAC-SHA256(secret, message id + timestamp +
 * raw body), compared in constant time; the timestamp no older than 10 minutes.
 */
export function verifyEventSub(headers: Record<string, string | string[] | undefined>, raw: Buffer, secret: string, nowMs: number): { ok: true; id: string; type: string } | { ok: false; reason: string } {
  const h = (k: string) => String(headers[k] ?? '');
  const id = h('twitch-eventsub-message-id');
  const ts = h('twitch-eventsub-message-timestamp');
  const sig = h('twitch-eventsub-message-signature');
  if (!id || !ts || !sig.startsWith('sha256=') || !secret) return { ok: false, reason: 'missing' };
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(id).update(ts).update(raw).digest('hex')}`);
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'signature' };
  const at = Date.parse(ts);
  if (!Number.isFinite(at) || Math.abs(nowMs - at) > EVENTSUB_MAX_AGE_MS) return { ok: false, reason: 'old' };
  return { ok: true, id, type: h('twitch-eventsub-message-type') };
}

// ---------------- Kick ----------------

export function kickClient(keys: AppKeys, opts: { base?: Partial<typeof KICK>; fetchImpl?: typeof fetch; gate: Gate }) {
  const base = { ...KICK, ...opts.base };
  const ctx: Ctx = { fetchImpl: opts.fetchImpl ?? fetch, gate: opts.gate };
  const app = new AppToken(() => json(ctx, `${base.id}/oauth/token`, form({ client_id: keys.clientId, client_secret: keys.clientSecret, grant_type: 'client_credentials' })));
  const call = async (method: string, path: string, body?: unknown) => {
    const token = await app.value();
    const init = { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined };
    let res = await send(ctx, `${base.api}/public/v1${path}`, init);
    if (res.status === 401) {
      app.forget();
      res = await send(ctx, `${base.api}/public/v1${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await app.value()}` } });
    }
    return res;
  };
  let publicKey: { pem: string; at: number } | undefined;

  const channelOf = (c: Record<string, any>): LiveInfo & { live: boolean; slug: string } => ({
    subject: String(c.broadcaster_user_id ?? ''), slug: String(c.slug ?? '').toLowerCase(), live: !!c.stream?.is_live,
    title: clip(c.stream_title, 140), category: clip(c.category?.name, 80), viewers: Math.max(0, Number(c.stream?.viewer_count) || 0),
    startedAt: timeOf(c.stream?.start_time), thumbnail: thumb(c.stream?.thumbnail, /^https:\/\/([\w-]+\.)*kick\.com\//),
  });

  return {
    /** OAuth 2.1 with PKCE (S256); scopes to read who it is and their channel. */
    authorizeUrl: (state: string, redirectUri: string, challenge: string) =>
      `${base.id}/oauth/authorize?${new URLSearchParams({ client_id: keys.clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'user:read channel:read', state, code_challenge: challenge, code_challenge_method: 'S256' })}`,

    async identityFromCode(code: string, redirectUri: string, verifier: string): Promise<ChannelIdentity> {
      const tok = await json(ctx, `${base.id}/oauth/token`, form({ grant_type: 'authorization_code', client_id: keys.clientId, client_secret: keys.clientSecret, redirect_uri: redirectUri, code_verifier: verifier, code }));
      if (!tok.access_token) throw new ProviderError('Kick: no token');
      const auth = { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/json' } };
      try {
        const users = await json(ctx, `${base.api}/public/v1/users`, auth);
        const u = users.data?.[0];
        if (!u?.user_id) throw new ProviderError('Kick: no user');
        // the channel's slug is its address (kick.com/<slug>); the user's own channel without parameters
        const channels = await json(ctx, `${base.api}/public/v1/channels`, auth);
        const c = channels.data?.[0];
        const slug = String(c?.slug ?? u.name ?? '').toLowerCase();
        if (!LOGIN.test(slug)) throw new ProviderError('Kick: no channel');
        return { subject: String(u.user_id), login: slug, name: clip(u.name, 40) || slug };
      } finally {
        await ctx.fetchImpl(`${base.id}/oauth/revoke?${new URLSearchParams({ token: tok.access_token, token_hint_type: 'access_token' })}`, { method: 'POST', signal: AbortSignal.timeout(5000) }).catch(() => undefined);
      }
    },

    /** Channels of up to 50 broadcasters with their stream (GET /channels). */
    async channels(subjects: string[]) {
      if (!subjects.length) return [];
      if (subjects.length > 50) throw new Error('at most 50');
      const res = await call('GET', `/channels?${new URLSearchParams(subjects.map((s) => ['broadcaster_user_id', s]))}`);
      if (!res.ok) throw new ProviderError(`Kick channels: HTTP ${res.status}`, res.status);
      const body = (await res.json()) as { data?: Record<string, any>[] };
      return (body.data ?? []).map(channelOf).filter((c) => c.subject);
    },

    /** livestream.status.updated for one broadcaster, to the webhook URL set in the Kick app. */
    async subscribe(subject: string): Promise<string> {
      const res = await call('POST', '/events/subscriptions', { broadcaster_user_id: Number(subject), events: [{ name: 'livestream.status.updated', version: 1 }], method: 'webhook' });
      const body = (await res.json().catch(() => ({}))) as { data?: { subscription_id?: string; error?: string }[]; message?: string };
      const id = body.data?.find((d) => d.subscription_id)?.subscription_id;
      if (!res.ok || !id) throw new ProviderError(`Kick subscription: HTTP ${res.status} ${clip(body.message ?? body.data?.[0]?.error, 120)}`, res.status);
      return id;
    },

    async unsubscribe(id: string) {
      const res = await call('DELETE', `/events/subscriptions?${new URLSearchParams({ id })}`);
      if (!res.ok && res.status !== 404) throw new ProviderError(`Kick subscription delete: HTTP ${res.status}`, res.status);
    },

    /** The key Kick signs webhooks with (kept a day). */
    async publicKey(now = Date.now()): Promise<string> {
      if (publicKey && now - publicKey.at < 86_400_000) return publicKey.pem;
      const body = await json(ctx, `${base.api}/public/v1/public-key`);
      const pem = String(body.data?.public_key ?? '');
      if (!pem.includes('PUBLIC KEY')) throw new ProviderError('Kick: no public key');
      publicKey = { pem, at: now };
      return pem;
    },

    async test() {
      const res = await call('GET', '/livestreams?limit=1');
      if (!res.ok) throw new ProviderError(`Kick: HTTP ${res.status}`, res.status);
    },
  };
}
export type KickClient = ReturnType<typeof kickClient>;

/**
 * A Kick webhook: Kick-Event-Signature is base64 RSA-SHA256 (PKCS#1 v1.5) over
 * "<message id>.<timestamp>.<raw body>", checked with Kick's public key; old ones are replays.
 */
export function verifyKick(headers: Record<string, string | string[] | undefined>, raw: Buffer, pem: string, nowMs: number): { ok: true; id: string; type: string } | { ok: false; reason: string } {
  const h = (k: string) => String(headers[k] ?? '');
  const id = h('kick-event-message-id');
  const ts = h('kick-event-message-timestamp');
  const sig = h('kick-event-signature');
  if (!id || !ts || !sig) return { ok: false, reason: 'missing' };
  let good = false;
  try {
    good = createVerify('RSA-SHA256').update(`${id}.${ts}.`).update(raw).verify(pem, sig, 'base64');
  } catch {
    good = false;
  }
  if (!good) return { ok: false, reason: 'signature' };
  const at = /^\d+$/.test(ts) ? Number(ts) * (ts.length <= 10 ? 1000 : 1) : Date.parse(ts);
  if (!Number.isFinite(at) || Math.abs(nowMs - at) > EVENTSUB_MAX_AGE_MS) return { ok: false, reason: 'old' };
  return { ok: true, id, type: h('kick-event-type') };
}

/** Where a channel is watched, and its player for an iframe (Twitch needs the embedding sites' hosts). */
export function channelUrl(platform: Platform, login: string): string {
  return platform === 'twitch' ? `https://www.twitch.tv/${encodeURIComponent(login)}` : `https://kick.com/${encodeURIComponent(login)}`;
}

export function embedUrl(platform: Platform, login: string, parents: string[]): string {
  if (platform === 'kick') return `https://player.kick.com/${encodeURIComponent(login)}?muted=true&autoplay=false`;
  const q = new URLSearchParams([['channel', login], ...parents.map((p) => ['parent', p]), ['muted', 'true'], ['autoplay', 'false']]);
  return `https://player.twitch.tv/?${q}`;
}
