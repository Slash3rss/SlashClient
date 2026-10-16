import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Db, type User } from './db.ts';
import { PROVIDERS, type OAuthApp, type Provider, type ProviderId } from './oauth.ts';
import { cleanPresence, publicPresence, type Presence } from './presence.ts';
import { CAPE_NAMES, CAPES, EMOTES, capeSetting, mayWear } from './cosmetics.ts';
import { adminRoutes } from './admin.ts';
import { serveWeb } from './web.ts';

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
}

/** Names for the test sign-in: like Minecraft nicks. */
const VALID_NAME = /^\w{3,16}$/;
const SESSION_IDLE_MS = 90 * 24 * 3_600_000;
const LOGIN_TTL_MS = 10 * 60_000;
const MAX_MESSAGE = 2000;
/** A game counts as running this long after its last report (the mod reports every 4 minutes). */
const IN_GAME_TTL_MS = 10 * 60_000;
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
  const logins = new Map<string, { provider: ProviderId; at: number; linkTo?: string; result?: unknown; error?: string }>();
  const sockets = new Map<string, Set<WebSocket>>();
  const presences = new Map<string, Presence>();
  const limitMessages = rateLimiter(40);
  const limitRequests = rateLimiter(15);
  const limitLogins = rateLimiter(10);
  /**
   * Minecraft players in a game with SlashClient right now (uuid → last report), for the
   * logo next to their name. Kept in memory: the mod reports again every few minutes.
   */
  const inGame = new Map<string, number>();
  /** Minecraft uuid (lower case) → the SlashClient account playing as it, from the launcher. */
  const linked = new Map<string, { user: string; at: number }>();
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
    return userId;
  }

  const configAdmins = new Set((cfg.adminHandles ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean));
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
    return { ...user, providers: db.providers(me), admin: isAdmin(me), grants: db.grants(me) };
  }

  function friendOrThrow(me: string, other: string) {
    if (!db.areFriends(me, other)) throw new HttpError(403, 'not_friends');
  }

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Handler][] = [
    // the capes one can pick: switched-off ones are left out, exclusive ones say whether they are yours
    ['GET', /^\/v1\/cosmetics$/, (req) => {
      const me = req.headers.authorization ? authed(req) : undefined;
      const settings = db.cosmeticSettings();
      const granted = me ? db.grants(me) : [];
      return {
        capes: CAPES.filter((id) => capeSetting(settings, id).enabled).map((id) => ({
          id, name: CAPE_NAMES[id], exclusive: capeSetting(settings, id).exclusive, available: mayWear(settings, granted, id),
        })),
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
    // with a session this links the provider to the account instead of signing in
    ['POST', /^\/v1\/auth\/(discord|microsoft|google|github)\/start$/, (req, [provider]) => {
      const p = providers[provider as ProviderId];
      if (!p) throw new HttpError(404, 'provider_disabled');
      limitLogins(req.socket.remoteAddress ?? '');
      const linkTo = req.headers.authorization ? authed(req) : undefined;
      const state = randomBytes(24).toString('base64url');
      logins.set(state, { provider: provider as ProviderId, at: Date.now(), linkTo });
      return { state, url: p.authorizeUrl(state, redirectUri(provider)) };
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
      if (token) db.removeSession(hashToken(token));
      return { ok: true };
    }],

    // -- my account --
    ['GET', /^\/v1\/me$/, (req) => meWithProviders(authed(req))],
    // a provider can go as long as another one is left to sign in with
    ['DELETE', /^\/v1\/me\/providers\/(discord|microsoft|google|github)$/, (req, [provider]) => {
      const me = authed(req);
      const linked = db.providers(me);
      if (!linked.includes(provider)) throw new HttpError(404, 'not_found');
      if (linked.length < 2) throw new HttpError(400, 'last_provider');
      db.unlink(me, provider);
      return meWithProviders(me);
    }],
    ['POST', /^\/v1\/me$/, async (req) => {
      const me = authed(req);
      const { showServer, cape } = await body(req);
      if (typeof showServer === 'boolean') {
        db.setShowServer(me, showServer);
        broadcastPresence(me);
      }
      if (cape !== undefined) {
        if (cape !== '' && !mayWear(db.cosmeticSettings(), db.grants(me), cape as string)) throw new HttpError(400, 'bad_cape');
        db.setCape(me, cape as string);
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
      limitGame(req.socket.remoteAddress ?? '');
      const { uuid } = await body(req);
      if (typeof uuid !== 'string' || !UUID.test(uuid)) throw new HttpError(400, 'bad_request');
      inGame.set(uuid.toLowerCase(), Date.now());
      return { ok: true, ttl: IN_GAME_TTL_MS };
    }],
    ['POST', /^\/v1\/mc\/lookup$/, async (req) => {
      limitGame(req.socket.remoteAddress ?? '');
      const { uuids } = await body(req);
      if (!Array.isArray(uuids) || uuids.length > 250) throw new HttpError(400, 'bad_request');
      const now = Date.now();
      const active = uuids.filter((u): u is string => typeof u === 'string' && now - (inGame.get(u.toLowerCase()) ?? 0) < IN_GAME_TTL_MS);
      // the capes of players whose launcher said which account they play as
      const capes: Record<string, string> = {};
      const settings = db.cosmeticSettings();
      for (const u of active) {
        const link = linked.get(u.toLowerCase());
        const owner = link && now - link.at < IN_GAME_TTL_MS ? db.user(link.user) : undefined;
        // a cape the admin switched off is not shown, nor anything on a banned account
        if (owner?.cape && !owner.banned && capeSetting(settings, owner.cape).enabled) capes[u] = owner.cape;
      }
      return { active, capes };
    }],
    // the launcher says which Minecraft player its SlashClient account plays as, while the game runs
    ['POST', /^\/v1\/mc\/link$/, async (req) => {
      const me = authed(req);
      limitGame(req.socket.remoteAddress ?? '');
      const { uuid } = await body(req);
      if (typeof uuid !== 'string' || !UUID.test(uuid)) throw new HttpError(400, 'bad_request');
      const key = uuid.toLowerCase();
      linked.set(key, { user: me, at: Date.now() });
      inGame.set(key, Date.now());
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
      if (text.length > MAX_MESSAGE) throw new HttpError(400, 'too_long');
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
    ...adminRoutes({
      db, admin, body, kick, configAdmins,
      fail: (status, code) => {
        throw new HttpError(status, code);
      },
      live: () => ({ online: sockets.size, inGame: [...inGame.values()].filter((at) => Date.now() - at < IN_GAME_TTL_MS).length }),
    }),
  ];

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');

    // the browser lands here after the provider; it shows a short page and the launcher picks the result up
    const callback = /^\/v1\/auth\/(discord|microsoft|google|github)\/callback$/.exec(url.pathname);
    if (req.method === 'GET' && callback) {
      const provider = callback[1] as ProviderId;
      const login = logins.get(url.searchParams.get('state') ?? '');
      const code = url.searchParams.get('code');
      let ok = false;
      if (login && login.provider === provider && providers[provider] && code) {
        try {
          const id = await providers[provider].identityFromCode(code, redirectUri(provider), cfg.fetchImpl ?? fetch);
          if (login.linkTo) {
            if (db.link(provider, id.subject, login.linkTo)) {
              login.result = { linked: true, user: meWithProviders(login.linkTo) };
              ok = true;
            } else login.error = 'already_linked';
          } else {
            login.result = newSession(db.signIn(provider, id.subject, id));
            ok = true;
          }
        } catch (err) {
          login.error = err instanceof HttpError && err.code === 'banned' ? 'banned' : 'provider_failed';
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
        res.writeHead(known ? err.status : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: known ? err.code : 'server_error' }));
      }
      return;
    }
    // everything that is not the API is the website
    if (cfg.webDir && req.method === 'GET' && !url.pathname.startsWith('/v1/') && await serveWeb(cfg.webDir, url.pathname, res)) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }

  const server = http.createServer((req, res) => void handle(req, res));

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
        const first = !sockets.get(me)?.size;
        if (!sockets.has(me)) sockets.set(me, new Set());
        sockets.get(me)!.add(ws);
        const presence = cleanPresence(msg.presence);
        if (presence) presences.set(me, presence);
        ws.send(JSON.stringify({ type: 'ready', me: meWithProviders(me) }));
        if (first || presence) broadcastPresence(me);
        return;
      }
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

  return {
    server,
    close: () => new Promise<void>((resolve) => {
      clearInterval(heartbeat);
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
