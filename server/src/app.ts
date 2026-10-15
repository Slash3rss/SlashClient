import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Db, type User } from './db.ts';
import { authorizeUrl, userFromCode, type DiscordConfig } from './discord.ts';

import { cleanPresence, publicPresence, type Presence } from './presence.ts';

/**
 * Friends, statuses and direct messages for SlashClient.
 *
 * REST under /v1 for everything that changes data, one WebSocket per launcher for
 * live events (statuses, new messages, "typing…"). Errors are `{ error: <code> }`;
 * the launcher turns codes into text in the player's language.
 */

export interface Config {
  dbFile: string;
  /** Address the server is reachable at, for the Discord redirect. */
  publicUrl: string;
  discord?: Omit<DiscordConfig, 'redirectUri'>;
  /** Sign-in with just a name, for local testing only. */
  allowDevLogin: boolean;
  fetchImpl?: typeof fetch;
}

/** Names for the test sign-in: like Minecraft nicks. */
const VALID_NAME = /^\w{3,16}$/;
const SESSION_IDLE_MS = 90 * 24 * 3_600_000;
const LOGIN_TTL_MS = 10 * 60_000;
const MAX_MESSAGE = 2000;

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
  const discord = cfg.discord && { ...cfg.discord, redirectUri: `${cfg.publicUrl}/v1/auth/discord/callback` };
  /** Discord sign-ins in progress: the launcher polls with `state` until the browser part is done. */
  const logins = new Map<string, { at: number; result?: { token: string; user: User }; error?: string }>();
  const sockets = new Map<string, Set<WebSocket>>();
  const presences = new Map<string, Presence>();
  const limitMessages = rateLimiter(40);
  const limitRequests = rateLimiter(15);
  const limitLogins = rateLimiter(10);

  function newSession(user: User) {
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
    return userId;
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

  function friendOrThrow(me: string, other: string) {
    if (!db.areFriends(me, other)) throw new HttpError(403, 'not_friends');
  }

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/health$/, () => ({ ok: true, discord: !!discord, dev: cfg.allowDevLogin })],

    // -- signing in --
    ['POST', /^\/v1\/auth\/dev$/, async (req) => {
      if (!cfg.allowDevLogin) throw new HttpError(404, 'provider_disabled');
      const { name } = await body(req);
      if (typeof name !== 'string' || !VALID_NAME.test(name)) throw new HttpError(400, 'bad_name');
      return newSession(db.signIn('dev', name.toLowerCase(), { handle: name, name, avatar: '' }));
    }],
    ['POST', /^\/v1\/auth\/discord\/start$/, (req) => {
      if (!discord) throw new HttpError(404, 'provider_disabled');
      limitLogins(req.socket.remoteAddress ?? '');
      const state = randomBytes(24).toString('base64url');
      logins.set(state, { at: Date.now() });
      return { state, url: authorizeUrl(discord, state) };
    }],
    ['GET', /^\/v1\/auth\/discord\/poll$/, (_req, _p, url) => {
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
    ['GET', /^\/v1\/me$/, (req) => db.user(authed(req))],
    ['POST', /^\/v1\/me$/, async (req) => {
      const me = authed(req);
      const { showServer } = await body(req);
      if (typeof showServer === 'boolean') {
        db.setShowServer(me, showServer);
        broadcastPresence(me);
      }
      return db.user(me);
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
    ['POST', /^\/v1\/messages\/([\w-]+)\/read$/, (req, [other]) => {
      const me = authed(req);
      friendOrThrow(me, other);
      const at = db.markRead(me, other);
      if (at) push(other, { type: 'read', by: me, at });
      return { ok: true };
    }],
  ];

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');

    // the browser lands here after Discord; it shows a short page and the launcher picks the result up
    if (req.method === 'GET' && url.pathname === '/v1/auth/discord/callback') {
      const login = logins.get(url.searchParams.get('state') ?? '');
      const code = url.searchParams.get('code');
      let ok = false;
      if (login && discord && code) {
        try {
          const d = await userFromCode(discord, code, cfg.fetchImpl);
          login.result = newSession(db.signIn('discord', d.id, { handle: d.username, name: d.name, avatar: d.avatar }));
          ok = true;
        } catch {
          login.error = 'discord_failed';
        }
      } else if (login) login.error = 'discord_denied';
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
        if (!userId) return ws.close(4001, 'unauthorized');
        clearTimeout(authTimer);
        me = userId;
        const first = !sockets.get(me)?.size;
        if (!sockets.has(me)) sockets.set(me, new Set());
        sockets.get(me)!.add(ws);
        const presence = cleanPresence(msg.presence);
        if (presence) presences.set(me, presence);
        ws.send(JSON.stringify({ type: 'ready', me: db.user(me) }));
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
