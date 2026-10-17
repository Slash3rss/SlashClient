import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Db, type User } from './db.ts';
import { PROVIDERS, type DeviceStart, type Identity, type OAuthApp, type Provider, type ProviderId } from './oauth.ts';
import { cleanPresence, publicPresence, type Presence } from './presence.ts';
import { CAPE_NAMES, CAPES, EMOTES, ITEMS, SLOTS, capeSetting, mayWear, type Slot } from './cosmetics.ts';
import { adminRoutes } from './admin.ts';
import { partnerRoutes } from './partners.ts';
import { trackerRoutes } from './tracker.ts';
import { RequestLog, clientOf, maskIp, routeOf } from './requests.ts';
import { serveWeb } from './web.ts';
import { createDownloads, isDownloadOs } from './downloads.ts';

/**
 * Friends, statuses and direct messages for SlashClient.
 *
 * REST under /v1 for everything that changes data, one WebSocket per launcher for
 * live events (statuses, new messages, "typing…"). Errors are `{ error: <code> }`;
 * the launcher turns codes into text in the player's language.
 */

export interface Config {
  dbFile: string;
  /** Address the server is reachable at, for the sign-in redirects. */
  publicUrl: string;
  /** Sign-in providers that are configured (Discord, Microsoft, Google, GitHub). */
  oauth: Partial<Record<ProviderId, OAuthApp>>;
  /** Sign-in with just a name, for local testing only. */
  allowDevLogin: boolean;
  fetchImpl?: typeof fetch;
  /** Handles that are admins whatever the database says (ADMIN_HANDLES), so the first admin can get in. */
  adminHandles?: string[];
  /** The website's files (web/); without it only the API is served. */
  webDir?: string;
  /** Behind a reverse proxy (Caddy): the player's address is the last one in X-Forwarded-For. */
  trustProxy?: boolean;
  /** Sign-ins allowed per address per minute (tests raise it). */
  loginsPerMinute?: number;
  /** GitHub repository with the launcher's releases, for /pobierz/<system> (owner/name). */
  releasesRepo?: string;
  /** Read access to that repository when it is private. */
  releasesToken?: string;
}

/** Names for the test sign-in: like Minecraft nicks. */
const VALID_NAME = /^\w{3,16}$/;
const SESSION_IDLE_MS = 90 * 24 * 3_600_000;
const LOGIN_TTL_MS = 10 * 60_000;
const MC_CHALLENGE_MS = 2 * 60_000;
const MAX_MESSAGE = 2000;
/** An encrypted message: the text plus a wrapped key for each launcher of both friends. */
const MAX_ENCRYPTED = 14_000;
/** A game counts as running this long after its last report (the mod reports every 4 minutes). */
const IN_GAME_TTL_MS = 10 * 60_000;
/** The uuid an offline-mode server gives a player: UUID.nameUUIDFromBytes("OfflinePlayer:" + name). */
export function offlineUuid(name: string): string {
  const h = createHash('md5').update(`OfflinePlayer:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** host or host:port, as players type it in the server list. */
const SERVER_ADDRESS = /^[\w.-]{1,253}(:\d{1,5})?$/;
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** A small token bucket per player and action, so one client cannot flood others. */
function rateLimiter(perMinute: number) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return (key: string) => {
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
    b.at = now;
    if (b.tokens < 1) throw new HttpError(429, 'rate_limited');
    b.tokens--;
    buckets.set(key, b);
  };
}

/** What the request log learns while a request is handled. */
type SeenRequest = http.IncomingMessage & { slashUser?: string; slashError?: string };

export function createApp(cfg: Config) {
  const db = new Db(cfg.dbFile);
  const providers: Partial<Record<ProviderId, Provider>> = {};
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    const app = cfg.oauth[id];
    if (app) providers[id] = PROVIDERS[id](app);
  }
  const redirectUri = (provider: string) => `${cfg.publicUrl}/v1/auth/${provider}/callback`;
  /**
   * Sign-ins in progress: the launcher opens the browser and polls with `state` until the
   * browser part is done. With `linkTo` the login adds a provider to an existing account.
   */
  /** Minecraft sign-ins waiting for the launcher to "join" at Mojang: server id → when. */
  const mcChallenges = new Map<string, number>();
  type Login = { provider: ProviderId; at: number; linkTo?: string; result?: unknown; error?: string };
  const logins = new Map<string, Login>();

  /** Who the provider says signed in: a new session, or the provider added to the account. */
  function finishLogin(login: Login, provider: ProviderId, id: Identity): boolean {
    if (login.linkTo) {
      if (db.link(provider, id.subject, login.linkTo)) {
        login.result = { linked: true, user: meWithProviders(login.linkTo) };
        return true;
      }
      login.error = 'already_linked';
      return false;
    }
    // Discord and the rest only open an account they were linked to (accounts start with Minecraft)
    if (!db.owner(provider, id.subject)) {
      login.error = 'not_linked';
      return false;
    }
    try {
      login.result = newSession(db.signIn(provider, id.subject, id));
      return true;
    } catch (err) {
      login.error = err instanceof HttpError && err.code === 'banned' ? 'banned' : 'provider_failed';
      return false;
    }
  }

  /** Asks the provider, at the pace it wants, until the player has typed the code (or gives up). */
  async function waitForDevice(state: string, login: Login, p: Provider, d: DeviceStart) {
    let interval = Math.max(200, d.intervalMs);
    const until = Date.now() + Math.min(d.expiresMs, LOGIN_TTL_MS);
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, interval));
      // picked up, expired or cancelled
      if (logins.get(state) !== login) return;
      try {
        const r = await p.device!.poll(d.deviceCode, cfg.fetchImpl ?? fetch);
        if (r === 'pending') continue;
        if (r === 'slow_down') {
          interval += 5000;
          continue;
        }
        finishLogin(login, login.provider, r);
      } catch (err) {
        console.error('logowanie kodem:', (err as Error).message);
        login.error = 'provider_failed';
      }
      return;
    }
    login.error = 'login_expired';
  }
  const sockets = new Map<string, Set<WebSocket>>();
  const presences = new Map<string, Presence>();
  const limitMessages = rateLimiter(40);
  const limitRequests = rateLimiter(15);
  const limitLogins = rateLimiter(cfg.loginsPerMinute ?? 10);
  /** Who is asking, for the rate limits: behind Caddy every request comes from 127.0.0.1. */
  const requests = new RequestLog();
  const clientIp = (req: http.IncomingMessage): string => {
    const forwarded = cfg.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim() : '';
    return forwarded || req.socket.remoteAddress || '';
  };
  /**
   * Minecraft players in a game with SlashClient right now (uuid → last report), for the
   * logo next to their name. Kept in memory: the mod reports again every few minutes.
   */
  const inGame = new Map<string, number>();
  /** Minecraft uuid (lower case) → the SlashClient account playing as it, from the launcher. */
  /** uuid in game → the SlashClient account and which of its Minecraft accounts (no dashes) plays. */
  const linked = new Map<string, { user: string; at: number; character?: string }>();
  const limitGame = rateLimiter(30);
  const limitEmotes = rateLimiter(20);

  function newSession(user: User) {
    if (user.banned) throw new HttpError(403, 'banned');
    const token = randomBytes(32).toString('base64url');
    db.addSession(hashToken(token), user.id);
    return { token, user };
  }

  // ---- live events ----

  function push(userId: string, event: unknown) {
    const data = JSON.stringify(event);
    for (const ws of sockets.get(userId) ?? []) ws.send(data);
  }

  function presenceOf(userId: string) {
    const user = db.user(userId);
    return publicPresence(sockets.get(userId)?.size ? presences.get(userId) : undefined, user?.showServer ?? false, db.lastSeen(userId));
  }

  function broadcastPresence(userId: string) {
    const presence = presenceOf(userId);
    for (const f of db.friends(userId)) push(f.id, { type: 'presence', id: userId, presence });
  }

  // ---- HTTP ----

  async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16_384) throw new HttpError(413, 'too_large');
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      throw new HttpError(400, 'bad_request');
    }
  }

  function authed(req: http.IncomingMessage): string {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const userId = token && db.sessionUser(hashToken(token), SESSION_IDLE_MS);
    if (!userId) throw new HttpError(401, 'unauthorized');
    if (db.user(userId)?.banned) throw new HttpError(403, 'banned');
    (req as SeenRequest).slashUser = userId;
    return userId;
  }

  const configAdmins = new Set((cfg.adminHandles ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean));
  /** The logo colour in game: admins red, then the rank the admin panel gave (support, partner). */
  const badgeOf = (u: { role: string; handle: string; rank: string }) =>
    u.role === 'admin' || configAdmins.has(u.handle.toLowerCase()) ? 'admin' : u.rank === 'support' || u.rank === 'partner' ? u.rank : '';
  const isAdmin = (userId: string) => {
    const u = db.user(userId);
    return !!u && (u.role === 'admin' || configAdmins.has(u.handle.toLowerCase()));
  };
  function admin(req: http.IncomingMessage): string {
    const me = authed(req);
    if (!isAdmin(me)) throw new HttpError(403, 'not_admin');
    return me;
  }
  /** Ends every live connection of an account (after a ban, a sign-out from the panel, a deletion). */
  function kick(userId: string) {
    for (const ws of sockets.get(userId) ?? []) ws.close(4003, 'signed out');
  }
  /** Which session each live connection signed in with, so signing out also closes it. */
  const sessionOf = new WeakMap<WebSocket, string>();
  function closeSession(tokenHash: string) {
    for (const set of sockets.values()) for (const ws of set) if (sessionOf.get(ws) === tokenHash) ws.close(4003, 'signed out');
  }
  /** At most 20 messages per 10 seconds from one connection. */
  const socketBudget = new WeakMap<WebSocket, { at: number; n: number }>();
  function socketLimit(ws: WebSocket): boolean {
    const now = Date.now();
    const b = socketBudget.get(ws);
    if (!b || now - b.at > 10_000) {
      socketBudget.set(ws, { at: now, n: 1 });
      return true;
    }
    return ++b.n <= 20;
  }

  function friendList(me: string) {
    const unread = db.unreadCounts(me);
    const last = db.lastMessageTimes(me);
    return {
      friends: db.friends(me).map((f) => ({ ...f, presence: presenceOf(f.id), unread: unread[f.id] ?? 0, lastMessageAt: last[f.id] ?? 0 })),
      incoming: db.incoming(me),
      outgoing: db.outgoing(me),
    };
  }

  function meWithProviders(me: string) {
    const { banned: _banned, ...user } = db.user(me)!;
    return { ...user, providers: db.providers(me), minecraft: db.minecraftAccounts(me), admin: isAdmin(me), badge: badgeOf(user), grants: db.grants(me) };
  }

  function friendOrThrow(me: string, other: string) {
    if (!db.areFriends(me, other)) throw new HttpError(403, 'not_friends');
  }

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const partners = partnerRoutes({
    db, authed, admin, body, dir: path.join(path.dirname(cfg.dbFile), 'partners'),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  const limitReports = rateLimiter(6);
  const tracker = trackerRoutes({
    db, authed, isAdmin, body, clientIp, limit: limitReports, dir: path.join(path.dirname(cfg.dbFile), 'logs'),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  const routes: [string, RegExp, Handler][] = [
    // the request log: newest first, with who asked (handles looked up once per request)
    ['GET', /^\/v1\/admin\/requests$/, (req, _p, url) => {
      admin(req);
      const res = requests.query({
        q: url.searchParams.get('q') ?? '', errors: url.searchParams.get('errors') === '1',
        client: url.searchParams.get('client') ?? '', user: url.searchParams.get('user') ?? '', limit: Number(url.searchParams.get('limit')) || 200,
      });
      const handles = new Map<string, string>();
      for (const e of res.entries) if (e.user && !handles.has(e.user)) handles.set(e.user, db.user(e.user)?.handle ?? '');
      return { ...res, entries: res.entries.map((e) => ({ ...e, handle: e.user ? handles.get(e.user) || null : null })) };
    }],
    // the cosmetics one can pick: switched-off ones are left out, exclusive and rank ones say whether they are yours
    ['GET', /^\/v1\/cosmetics$/, (req) => {
      const me = req.headers.authorization ? authed(req) : undefined;
      const settings = db.cosmeticSettings();
      const granted = me ? db.grants(me) : [];
      const user = me ? db.user(me) : undefined;
      const badge = user ? badgeOf(user) : '';
      const items = ITEMS.filter((i) => capeSetting(settings, i.id).enabled).map((i) => ({
        id: i.id, slot: i.slot, name: i.name, rank: i.rank, frames: i.frames,
        exclusive: capeSetting(settings, i.id).exclusive, available: mayWear(settings, granted, i.id, i.slot, badge),
      }));
      return {
        // the launcher before 0.8 knows capes only
        capes: items.filter((i) => i.slot === 'cape').map(({ id, name, exclusive, available }) => ({ id, name, exclusive: exclusive || !!ITEMS.find((x) => x.id === id)?.rank, available })),
        items,
        emotes: EMOTES,
      };
    }],
    ['GET', /^\/v1\/health$/, () => ({ ok: true, providers: Object.keys(providers), dev: cfg.allowDevLogin })],

    // -- signing in --
    ['POST', /^\/v1\/auth\/dev$/, async (req) => {
      if (!cfg.allowDevLogin) throw new HttpError(404, 'provider_disabled');
      const { name } = await body(req);
      if (typeof name !== 'string' || !VALID_NAME.test(name)) throw new HttpError(400, 'bad_name');
      return newSession(db.signIn('dev', name.toLowerCase(), { handle: name, name, avatar: '' }));
    }],
    // Minecraft: the launcher proves it plays as a Minecraft account the way a Minecraft server
    // checks it (it "joins" a random server id at Mojang, the server asks Mojang whether it did),
    // so its Minecraft token never comes here. With a session the account is linked to it.
    ['POST', /^\/v1\/auth\/minecraft\/start$/, (req) => {
      limitLogins(clientIp(req));
      const serverId = randomBytes(20).toString('hex');
      mcChallenges.set(serverId, Date.now());
      for (const [id, at] of mcChallenges) if (Date.now() - at > MC_CHALLENGE_MS) mcChallenges.delete(id);
      return { serverId };
    }],
    ['POST', /^\/v1\/auth\/minecraft\/finish$/, async (req) => {
      limitLogins(clientIp(req));
      const { serverId, name } = await body(req);
      if (typeof serverId !== 'string' || typeof name !== 'string' || !/^\w{1,16}$/.test(name)) throw new HttpError(400, 'bad_request');
      const at = mcChallenges.get(serverId);
      mcChallenges.delete(serverId);
      if (!at || Date.now() - at > MC_CHALLENGE_MS) throw new HttpError(400, 'login_expired');
      const res = await (cfg.fetchImpl ?? fetch)(`https://sessionserver.mojang.com/session/minecraft/hasJoined?${new URLSearchParams({ username: name, serverId })}`, { signal: AbortSignal.timeout(10_000) });
      if (res.status !== 200) throw new HttpError(403, 'not_verified');
      const profile = (await res.json()) as { id?: string; name?: string };
      if (!profile.id || !/^[0-9a-f]{32}$/.test(profile.id) || !profile.name) throw new HttpError(403, 'not_verified');
      const me = req.headers.authorization ? authed(req) : undefined;
      const owner = db.owner('minecraft', profile.id);
      if (me && (!owner || owner === me)) {
        db.link('minecraft', profile.id, me, profile.name);
        return { linked: true, user: meWithProviders(me) };
      }
      // a new player, or the account this Minecraft account belongs to (someone else's: the launcher switches to it)
      const session = newSession(db.signIn('minecraft', profile.id, { handle: profile.name, name: profile.name, avatar: '' }, profile.name));
      return { ...session, user: meWithProviders(session.user.id), switched: !!me };
    }],
    // with a session this links the provider to the account instead of signing in
    ['POST', /^\/v1\/auth\/(discord|microsoft|google|github)\/start$/, (req, [provider]) => {
      const p = providers[provider as ProviderId];
      if (!p) throw new HttpError(404, 'provider_disabled');
      limitLogins(clientIp(req));
      const linkTo = req.headers.authorization ? authed(req) : undefined;
      const state = randomBytes(24).toString('base64url');
      const login = { provider: provider as ProviderId, at: Date.now(), linkTo };
      logins.set(state, login);
      if (!p.device) return { state, url: p.authorizeUrl(state, redirectUri(provider)) };
      // a code to type on the provider's page; the server waits for it and /v1/auth/poll reports as usual
      return p.device.start(cfg.fetchImpl ?? fetch).then((d) => {
        void waitForDevice(state, login, p, d);
        return { state, url: d.url, code: d.userCode };
      });
    }],
    ['GET', /^\/v1\/auth\/poll$/, (_req, _p, url) => {
      const state = url.searchParams.get('state') ?? '';
      const login = logins.get(state);
      if (!login || Date.now() - login.at > LOGIN_TTL_MS) throw new HttpError(404, 'login_expired');
      if (login.error) {
        logins.delete(state);
        throw new HttpError(400, login.error);
      }
      if (!login.result) return { pending: true };
      logins.delete(state);
      return login.result;
    }],
    ['POST', /^\/v1\/auth\/logout$/, (req) => {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      if (token) {
        db.removeSession(hashToken(token));
        closeSession(hashToken(token));
      }
      return { ok: true };
    }],

    // -- my account --
    ['GET', /^\/v1\/me$/, (req) => meWithProviders(authed(req))],
    // a provider can go as long as another one is left to sign in with
    ['DELETE', /^\/v1\/me\/providers\/(discord|microsoft|google|github)$/, (req, [provider]) => {
      const me = authed(req);
      const linked = db.providers(me);
      if (!linked.includes(provider)) throw new HttpError(404, 'not_found');
      if (db.identityCount(me) < 2) throw new HttpError(400, 'last_provider');
      db.unlink(me, provider);
      return meWithProviders(me);
    }],
    ['DELETE', /^\/v1\/me\/minecraft\/([0-9a-f]{32})$/, (req, [mcUuid]) => {
      const me = authed(req);
      if (db.owner('minecraft', mcUuid) !== me) throw new HttpError(404, 'not_found');
      if (db.identityCount(me) < 2) throw new HttpError(400, 'last_provider');
      db.unlinkIdentity(me, 'minecraft', mcUuid);
      return meWithProviders(me);
    }],
    ['POST', /^\/v1\/me$/, async (req) => {
      const me = authed(req);
      const { showServer, cape, loadout, character, own } = await body(req);
      if (typeof showServer === 'boolean') {
        db.setShowServer(me, showServer);
        broadcastPresence(me);
      }
      const badge = badgeOf(db.user(me)!);
      // one Minecraft account's own set: { character, cape?, loadout? }; { character, own: false } goes back to the account's
      if (character !== undefined) {
        const subject = typeof character === 'string' ? character.toLowerCase().replace(/-/g, '') : '';
        if (!db.minecraftAccounts(me).some((m) => m.uuid === subject)) throw new HttpError(403, 'not_linked');
        if (own === false) {
          db.setCharacterLoadout(me, subject, null);
          return meWithProviders(me);
        }
        const user = db.user(me)!;
        const next = db.characterLoadout(me, subject) ?? { ...user.loadout, ...(user.cape ? { cape: user.cape } : {}) };
        const settings = db.cosmeticSettings();
        const granted = db.grants(me);
        const changes: [string, unknown][] = [...(cape !== undefined ? [['cape', cape] as [string, unknown]] : []), ...Object.entries(loadout && typeof loadout === 'object' && !Array.isArray(loadout) ? loadout : {})];
        if (loadout !== undefined && (!loadout || typeof loadout !== 'object' || Array.isArray(loadout))) throw new HttpError(400, 'bad_request');
        for (const [slot, id] of changes) {
          if (!SLOTS.includes(slot as Slot) || typeof id !== 'string') throw new HttpError(400, 'bad_item');
          if (id === '') delete next[slot];
          else if (mayWear(settings, granted, id, slot as Slot, badge)) next[slot] = id;
          else throw new HttpError(400, slot === 'cape' ? 'bad_cape' : 'bad_item');
        }
        db.setCharacterLoadout(me, subject, next);
        return meWithProviders(me);
      }
      if (cape !== undefined) {
        if (cape !== '' && !mayWear(db.cosmeticSettings(), db.grants(me), cape as string, 'cape', badge)) throw new HttpError(400, 'bad_cape');
        db.setCape(me, cape as string);
      }
      // the other slots: { wings: 'angel', trail: '' … }, '' takes the item off
      if (loadout !== undefined) {
        if (!loadout || typeof loadout !== 'object' || Array.isArray(loadout)) throw new HttpError(400, 'bad_request');
        const next = { ...db.user(me)!.loadout };
        const settings = db.cosmeticSettings();
        const granted = db.grants(me);
        for (const [slot, id] of Object.entries(loadout as Record<string, unknown>)) {
          if (slot === 'cape' || !SLOTS.includes(slot as Slot) || typeof id !== 'string') throw new HttpError(400, 'bad_item');
          if (id === '') delete next[slot];
          else if (mayWear(settings, granted, id, slot as Slot, badge)) next[slot] = id;
          else throw new HttpError(400, 'bad_item');
        }
        db.setLoadout(me, next);
      }
      return meWithProviders(me);
    }],

    // -- friends --
    ['GET', /^\/v1\/friends$/, (req) => friendList(authed(req))],
    ['POST', /^\/v1\/friends\/requests$/, async (req) => {
      const me = authed(req);
      limitRequests(me);
      const { handle } = await body(req);
      if (typeof handle !== 'string') throw new HttpError(400, 'bad_request');
      const other = db.userByHandle(handle.trim().replace(/^@/, ''));
      if (!other) throw new HttpError(404, 'not_found');
      if (other.id === me) throw new HttpError(400, 'self');
      if (db.areFriends(me, other.id)) throw new HttpError(409, 'already_friends');
      // they already asked us: that is a yes from both sides
      if (db.hasRequest(other.id, me)) {
        db.addFriendship(me, other.id);
        push(other.id, { type: 'friends' });
        broadcastPresence(me);
        broadcastPresence(other.id);
        return { status: 'friends', ...friendList(me) };
      }
      db.addRequest(me, other.id);
      push(other.id, { type: 'friends', request: db.user(me) });
      return { status: 'sent', ...friendList(me) };
    }],
    ['POST', /^\/v1\/friends\/requests\/([\w-]+)\/accept$/, (req, [from]) => {
      const me = authed(req);
      if (!db.hasRequest(from, me)) throw new HttpError(404, 'not_found');
      db.addFriendship(me, from);
      push(from, { type: 'friends', accepted: db.user(me) });
      broadcastPresence(me);
      broadcastPresence(from);
      return friendList(me);
    }],
    // declines a request to me, or cancels mine
    ['DELETE', /^\/v1\/friends\/requests\/([\w-]+)$/, (req, [other]) => {
      const me = authed(req);
      if (!db.removeRequest(other, me) && !db.removeRequest(me, other)) throw new HttpError(404, 'not_found');
      push(other, { type: 'friends' });
      return friendList(me);
    }],
    ['DELETE', /^\/v1\/friends\/([\w-]+)$/, (req, [other]) => {
      const me = authed(req);
      if (!db.removeFriendship(me, other)) throw new HttpError(404, 'not_found');
      push(other, { type: 'friends' });
      return friendList(me);
    }],

    // -- who plays with SlashClient (the logo on the tab list and above heads) --
    ['POST', /^\/v1\/mc\/heartbeat$/, async (req) => {
      limitGame(clientIp(req));
      const { uuid } = await body(req);
      if (typeof uuid !== 'string' || !UUID.test(uuid)) throw new HttpError(400, 'bad_request');
      inGame.set(uuid.toLowerCase(), Date.now());
      return { ok: true, ttl: IN_GAME_TTL_MS };
    }],
    ['POST', /^\/v1\/mc\/lookup$/, async (req) => {
      limitGame(clientIp(req));
      const { uuids } = await body(req);
      if (!Array.isArray(uuids) || uuids.length > 250) throw new HttpError(400, 'bad_request');
      const now = Date.now();
      const active = uuids.filter((u): u is string => typeof u === 'string' && now - (inGame.get(u.toLowerCase()) ?? 0) < IN_GAME_TTL_MS);
      // the capes of players whose launcher said which account they play as
      const capes: Record<string, string> = {};
      // the logo's colour: only for a Minecraft account proven to be that SlashClient account's own
      const ranks: Record<string, string> = {};
      // everything the player wears; HUDs before 0.8 read only `capes`
      const cosmetics: Record<string, Record<string, string>> = {};
      const settings = db.cosmeticSettings();
      for (const u of active) {
        const link = linked.get(u.toLowerCase());
        const owner = link && now - link.at < IN_GAME_TTL_MS ? db.user(link.user) : undefined;
        if (!owner || owner.banned) continue;
        const badge = badgeOf(owner);
        if (badge) ranks[u] = badge;
        // only what the player may still wear: the admin may have switched it off, or the rank may be gone
        const granted = db.grants(owner.id);
        const worn: Record<string, string> = {};
        // the character's own set, or the account's
        const own = link?.character ? db.characterLoadout(owner.id, link.character) : null;
        const all = own ?? { ...owner.loadout, ...(owner.cape ? { cape: owner.cape } : {}) };
        for (const [slot, id] of Object.entries(all)) if (mayWear(settings, granted, id, slot as Slot, badge)) worn[slot] = id;
        if (worn.cape) capes[u] = worn.cape;
        if (Object.keys(worn).length) cosmetics[u] = worn;
      }
      return { active, capes, ranks, cosmetics };
    }],
    // the launcher says which Minecraft player its SlashClient account plays as, while the game runs
    ['POST', /^\/v1\/mc\/link$/, async (req) => {
      const me = authed(req);
      limitGame(clientIp(req));
      const { uuid } = await body(req);
      if (typeof uuid !== 'string' || !UUID.test(uuid)) throw new HttpError(400, 'bad_request');
      const key = uuid.toLowerCase();
      // only a Minecraft account proven to be ours, or anyone could wear their cape as someone else
      if (db.owner('minecraft', key.replace(/-/g, '')) !== me) throw new HttpError(403, 'not_linked');
      const now = Date.now();
      const character = key.replace(/-/g, '');
      linked.set(key, { user: me, at: now, character });
      inGame.set(key, now);
      // servers in offline mode (many Polish networks, e.g. behind a proxy) give players a uuid made
      // from their name: the same player's cape and rank go with that one too, while this game runs
      const name = db.minecraftAccounts(me).find((m) => m.uuid === key.replace(/-/g, ''))?.name;
      if (name) linked.set(offlineUuid(name), { user: me, at: now, character });
      return { ok: true, ttl: IN_GAME_TTL_MS };
    }],
    // an emote: shown above the player's head to launcher players on the same server
    ['POST', /^\/v1\/mc\/emote$/, async (req) => {
      const me = authed(req);
      limitEmotes(me);
      const { uuid, emote } = await body(req);
      if (typeof uuid !== 'string' || !UUID.test(uuid) || !EMOTES.includes(emote as string)) throw new HttpError(400, 'bad_request');
      if (linked.get(uuid.toLowerCase())?.user !== me) throw new HttpError(403, 'not_linked');
      const where = presences.get(me)?.activity;
      const event = { type: 'emote', uuid: uuid.toLowerCase(), emote, at: Date.now() };
      push(me, event);
      if (where?.kind === 'server' && where.server) {
        const server = where.server.toLowerCase();
        for (const [other, p] of presences) {
          if (other !== me && p.activity?.kind === 'server' && p.activity.server?.toLowerCase() === server) push(other, event);
        }
      }
      return { ok: true };
    }],

    // -- chat encryption: launchers publish their public key; friends fetch them to encrypt --
    ['POST', /^\/v1\/keys$/, async (req) => {
      const me = authed(req);
      const { device, pub } = await body(req);
      // an X25519 public key in DER (spki) is 44 bytes: 60 characters of base64
      if (typeof device !== 'string' || !/^[0-9a-f]{24}$/.test(device) || typeof pub !== 'string' || !/^[A-Za-z0-9+/=]{40,80}$/.test(pub)) throw new HttpError(400, 'bad_request');
      db.setDeviceKey(me, device, pub);
      push(me, { type: 'keys', user: me });
      for (const f of db.friends(me)) push(f.id, { type: 'keys', user: me });
      return { ok: true };
    }],
    ['GET', /^\/v1\/keys\/([\w-]+)$/, (req, [other]) => {
      const me = authed(req);
      if (other !== me) friendOrThrow(me, other);
      return { keys: db.deviceKeys(other) };
    }],

    // -- messages --
    ['GET', /^\/v1\/messages\/([\w-]+)$/, (req, [other], url) => {
      const me = authed(req);
      friendOrThrow(me, other);
      const before = Number(url.searchParams.get('before')) || undefined;
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      return { messages: db.conversation(me, other, limit, before) };
    }],
    ['POST', /^\/v1\/messages\/([\w-]+)$/, async (req, [other]) => {
      const me = authed(req);
      friendOrThrow(me, other);
      limitMessages(me);
      const { text } = await body(req);
      if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'empty');
      // an encrypted message is longer than its text (the launcher keeps the text itself to MAX_MESSAGE)
      const encrypted = text.startsWith('e2e1:');
      if (text.length > (encrypted ? MAX_ENCRYPTED : MAX_MESSAGE)) throw new HttpError(400, 'too_long');
      if (encrypted && !/^e2e1:[A-Za-z0-9+/=]+$/.test(text)) throw new HttpError(400, 'bad_request');
      const message = db.addMessage(me, other, text.trim());
      push(other, { type: 'message', message });
      push(me, { type: 'message', message }); // the player's other launchers
      return { message };
    }],
    // "join me": a server address (and the game version) as a message with a Join button
    ['POST', /^\/v1\/invites\/([\w-]+)$/, async (req, [other]) => {
      const me = authed(req);
      friendOrThrow(me, other);
      limitMessages(me);
      const { server, version } = await body(req);
      if (typeof server !== 'string' || !SERVER_ADDRESS.test(server)) throw new HttpError(400, 'bad_server');
      const invite = { server: server.toLowerCase(), ...(typeof version === 'string' && /^[\w.+ -]{1,32}$/.test(version) ? { version } : {}) };
      const message = db.addMessage(me, other, invite.server, invite);
      push(other, { type: 'message', message });
      push(me, { type: 'message', message });
      return { message };
    }],
    ['POST', /^\/v1\/messages\/([\w-]+)\/read$/, (req, [other]) => {
      const me = authed(req);
      friendOrThrow(me, other);
      const at = db.markRead(me, other);
      if (at) push(other, { type: 'read', by: me, at });
      return { ok: true };
    }],
    ...partners.routes,
    ...tracker.routes,
    ...adminRoutes({
      db, admin, body, kick, configAdmins,
      fail: (status, code) => {
        throw new HttpError(status, code);
      },
      live: () => ({ online: sockets.size, inGame: [...inGame.values()].filter((at) => Date.now() - at < IN_GAME_TTL_MS).length }),
    }),
  ];

  /** Skins by Minecraft uuid, kept an hour so the page does not ask Mojang on every visit. */
  const skins = new Map<string, { at: number; data: Buffer; slim: boolean } | null>();
  async function skinOf(uuid: string): Promise<{ data: Buffer; slim: boolean } | undefined> {
    if (!/^[0-9a-f]{32}$/.test(uuid)) return undefined;
    const kept = skins.get(uuid);
    if (kept !== undefined && (kept === null || Date.now() - kept.at < 3_600_000)) return kept ?? undefined;
    const doFetch = cfg.fetchImpl ?? fetch;
    const profile = await doFetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
    if (!profile.ok) {
      skins.set(uuid, null);
      return undefined;
    }
    const prop = ((await profile.json()) as { properties?: { name: string; value: string }[] }).properties?.find((p) => p.name === 'textures');
    const textures = prop ? JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')) as { textures?: { SKIN?: { url: string; metadata?: { model?: string } } } } : undefined;
    const link = textures?.textures?.SKIN?.url;
    // only Mojang's own picture server
    if (!link || !/^https?:\/\/textures\.minecraft\.net\//.test(link)) {
      skins.set(uuid, null);
      return undefined;
    }
    const png = await doFetch(link.replace(/^http:/, 'https:'));
    if (!png.ok) return undefined;
    const data = Buffer.from(await png.arrayBuffer());
    if (data.length > 256 * 1024) return undefined;
    if (skins.size > 2000) skins.clear();
    const found = { at: Date.now(), data, slim: textures?.textures?.SKIN?.metadata?.model === 'slim' };
    skins.set(uuid, found);
    return found;
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');

    // a Minecraft player's skin for the site's 3D preview, from Mojang through here (the page may only talk to us)
    const skin = /^\/v1\/skin\/([0-9a-fA-F-]{32,36})$/.exec(url.pathname);
    if (req.method === 'GET' && skin) {
      const found = await skinOf(skin[1].replace(/-/g, '').toLowerCase()).catch(() => undefined);
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'X-Skin-Model': found.slim ? 'slim' : 'default', 'X-Content-Type-Options': 'nosniff' });
      res.end(found.data);
      return;
    }

    // a partner server's picture: the address carries its version, so it may be kept for long
    const picture = /^\/v1\/partners\/(\w+)\/background$/.exec(url.pathname);
    if (req.method === 'GET' && picture) {
      const found = await partners.picture(picture[1]);
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': found.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      res.end(found.data);
      return;
    }

    // the browser lands here after the provider; it shows a short page and the launcher picks the result up
    const callback = /^\/v1\/auth\/(discord|microsoft|google|github)\/callback$/.exec(url.pathname);
    if (req.method === 'GET' && callback) {
      const provider = callback[1] as ProviderId;
      const login = logins.get(url.searchParams.get('state') ?? '');
      const code = url.searchParams.get('code');
      let ok = false;
      if (login && login.provider === provider && providers[provider] && code) {
        try {
          const id = await providers[provider]!.identityFromCode(code, redirectUri(provider), cfg.fetchImpl ?? fetch);
          ok = finishLogin(login, provider, id);
        } catch (err) {
          console.error(`logowanie ${provider}:`, (err as Error).message);
          login.error = 'provider_failed';
        }
      } else if (login) login.error = 'provider_denied';
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(callbackPage(ok));
      return;
    }

    for (const [method, pattern, fn] of routes) {
      const m = pattern.exec(url.pathname);
      if (!m || method !== req.method) continue;
      try {
        const result = await fn(req, m.slice(1), url);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result ?? null));
      } catch (err) {
        const known = err instanceof HttpError;
        if (!known) console.error(err);
        (req as SeenRequest).slashError = known ? err.code : 'server_error';
        res.writeHead(known ? err.status : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: known ? err.code : 'server_error' }));
      }
      return;
    }
    // the installer for one system, straight from the latest release
    // English addresses too (/download, /updates); the Polish ones stay for links and launchers out there
    const download = /^\/(?:pobierz|download)\/([\w-]+)$/.exec(url.pathname);
    if (req.method === 'GET' && download && isDownloadOs(download[1])) {
      try {
        const to = await downloads.link(download[1]);
        res.writeHead(to ? 302 : 404, to ? { Location: to, 'Cache-Control': 'no-store' } : { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(to ? undefined : 'Brak instalatora dla tego systemu w najnowszym wydaniu.');
      } catch (err) {
        console.error('pobieranie:', (err as Error).message);
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Pobieranie jest chwilowo niedostępne. Spróbuj za chwilę.');
      }
      return;
    }
    // the launcher's update feed: what is new (latest*.yml) from here, the files as signed links
    const update = /^\/(?:aktualizacje|updates)\/([\w][\w.-]{0,120})$/.exec(url.pathname);
    if (req.method === 'GET' && update) {
      const name = update[1];
      try {
        if (name.endsWith('.yml')) {
          const text = await downloads.fileText(name);
          res.writeHead(text === undefined ? 404 : 200, { 'Content-Type': 'text/yaml; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(text ?? '');
        } else {
          const to = await downloads.fileLink(name);
          res.writeHead(to ? 302 : 404, to ? { Location: to, 'Cache-Control': 'no-store' } : {});
          res.end();
        }
      } catch (err) {
        console.error('aktualizacje:', (err as Error).message);
        res.writeHead(503);
        res.end();
      }
      return;
    }
    // everything that is not the API is the website
    if (cfg.webDir && req.method === 'GET' && !url.pathname.startsWith('/v1/') && await serveWeb(cfg.webDir, url.pathname, res, req.headers['if-modified-since'])) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }

  const downloads = createDownloads({ repo: cfg.releasesRepo ?? 'Slash3rss/SlashClient', token: cfg.releasesToken, fetchImpl: cfg.fetchImpl ?? fetch });

  // every API request (not the site's files) goes into the request log for the admin panel
  const server = http.createServer((req, res) => {
    const started = performance.now();
    res.on('finish', () => {
      const path = (req.url ?? '/').split('?')[0];
      if (!/^\/(v1|pobierz|download|aktualizacje|updates)\//.test(path)) return;
      // the panel asking for this list every few seconds would fill it
      if (path === '/v1/admin/requests') return;
      const seen = req as SeenRequest;
      requests.add({
        at: Date.now(), method: req.method ?? '', path: path.slice(0, 200), route: routeOf(path), status: res.statusCode,
        ms: Math.round(performance.now() - started), user: seen.slashUser ?? '', ip: maskIp(clientIp(req)), ...clientOf(req), error: seen.slashError ?? '',
      });
    });
    void handle(req, res);
  });

  // ---- WebSocket: /v1/ws, the first message must be { type: 'auth', token } ----

  const wss = new WebSocketServer({ server, path: '/v1/ws', maxPayload: 8192 });
  const alive = new WeakSet<WebSocket>();
  wss.on('connection', (ws) => {
    let me: string | undefined;
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    const authTimer = setTimeout(() => !me && ws.close(4001, 'auth timeout'), 5000);
    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!me) {
        const userId = msg.type === 'auth' && typeof msg.token === 'string' ? db.sessionUser(hashToken(msg.token), SESSION_IDLE_MS) : undefined;
        if (!userId || db.user(userId)?.banned) return ws.close(4001, 'unauthorized');
        clearTimeout(authTimer);
        me = userId;
        sessionOf.set(ws, hashToken(msg.token as string));
        const first = !sockets.get(me)?.size;
        if (!sockets.has(me)) sockets.set(me, new Set());
        sockets.get(me)!.add(ws);
        const presence = cleanPresence(msg.presence);
        if (presence) presences.set(me, presence);
        ws.send(JSON.stringify({ type: 'ready', me: meWithProviders(me) }));
        if (first || presence) broadcastPresence(me);
        return;
      }
      // a connection that floods (presence or typing many times a second) is only ignored, friends are not spammed
      if (!socketLimit(ws)) return;
      if (msg.type === 'presence') {
        const presence = cleanPresence(msg.presence);
        if (!presence) return;
        presences.set(me, presence);
        broadcastPresence(me);
      } else if (msg.type === 'typing' && typeof msg.to === 'string' && db.areFriends(me, msg.to)) {
        push(msg.to, { type: 'typing', from: me });
      }
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (!me) return;
      const set = sockets.get(me);
      set?.delete(ws);
      if (!set?.size) {
        sockets.delete(me);
        presences.delete(me);
        db.touch(me);
        broadcastPresence(me);
      }
    });
  });
  // drops launchers that vanished without closing (sleep, lost Wi-Fi)
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
    for (const [state, login] of logins) if (Date.now() - login.at > LOGIN_TTL_MS) logins.delete(state);
    for (const [uuid, at] of inGame) if (Date.now() - at > IN_GAME_TTL_MS) inGame.delete(uuid);
    for (const [uuid, l] of linked) if (Date.now() - l.at > IN_GAME_TTL_MS) linked.delete(uuid);
  }, 30_000);
  // shared logs past their time, once an hour
  const logCleanup = setInterval(() => void tracker.cleanup().catch((err) => console.error('logi:', (err as Error).message)), 3_600_000);

  return {
    server,
    close: () => new Promise<void>((resolve) => {
      clearInterval(heartbeat);
      clearInterval(logCleanup);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.close(() => {
        db.close();
        resolve();
      });
    }),
  };
}

function callbackPage(ok: boolean): string {
  const text = ok
    ? ['Zalogowano', 'Możesz zamknąć tę kartę i wrócić do SlashClient.', 'Signed in, you can close this tab.']
    : ['Nie udało się zalogować', 'Wróć do SlashClient i spróbuj ponownie.', 'Sign-in failed, go back to SlashClient and try again.'];
  return `<!doctype html><meta charset="utf-8"><title>SlashClient</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0e14;color:#e5e7eb;font:16px system-ui">
<div style="text-align:center"><h1 style="color:${ok ? '#60a5fa' : '#f87171'}">${text[0]}</h1><p>${text[1]}</p><p style="color:#6b7280">${text[2]}</p></div>`;
}
