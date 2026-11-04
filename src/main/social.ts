/**
 * Friends, statuses and messages: the launcher's side of the SlashClient social server.
 *
 * The session token stays in the main process (encrypted in the config); the page
 * talks to the server only through `call()`, which adds it. One WebSocket brings
 * live events and carries the player's status; it reconnects on its own.
 */

import { APP_VERSION } from '../shared/version';

export type Status = 'online' | 'away' | 'busy' | 'invisible';

export interface Activity {
  kind: 'launcher' | 'menu' | 'singleplayer' | 'server';
  version?: string;
  server?: string;
  /** What the server's tab list says ("S3 (Wyspy)", from the HUD): with the server only (server 0.9.25+). */
  detail?: string;
  since?: number;
}

export interface SocialUser {
  id: string; handle: string; name: string; avatar: string; showServer: boolean; providers: string[];
  /** Minecraft accounts linked to this SlashClient account (Mojang uuid without dashes, name). */
  minecraft?: { uuid: string; name: string }[];
}

export interface SocialState {
  url: string;
  user?: SocialUser;
  connected: boolean;
  status: Status;
}

/**
 * The error code of a failed answer; too many messages in a row (server 0.9.23+) and a community
 * channel's slow mode (0.9.27+) carry the seconds to wait in it, "slow_down:5", "slow_mode:30", so
 * the page and the game can say how long without another field.
 */
export function errorCode(data: { error?: string; retryAfter?: unknown }, status: number): string {
  const code = data.error ?? `http_${status}`;
  const wait = Number(data.retryAfter);
  return (code === 'slow_down' || code === 'slow_mode') && Number.isInteger(wait) && wait > 0 && wait <= 3600 ? `${code}:${wait}` : code;
}


/** How long to wait before reconnect try `n` (0 = the first): 1–5 s, then 2 s·2ⁿ up to a minute, ±30%. */
export function retryDelay(n: number, random = Math.random): number {
  if (n <= 0) return Math.round(1000 + random() * 4000);
  return Math.round(Math.min(60_000, 2000 * 2 ** n) * (0.7 + random() * 0.6));
}

export class SocialError extends Error {
  constructor(readonly code: string, readonly httpStatus = 0) {
    super(code);
  }
}

/** What the game is doing, from one line of its log; undefined when the line says nothing new. */
export function activityFromLog(line: string): Pick<Activity, 'kind' | 'server'> | undefined {
  const server = line.match(/Connecting to ([^,\s]+), (\d+)/);
  if (server) return { kind: 'server', server: `${server[1]}${server[2] === '25565' ? '' : `:${server[2]}`}` };
  if (/Starting integrated minecraft server/.test(line)) return { kind: 'singleplayer' };
  if (/Stopping server|Disconnected from server|Lost connection/i.test(line)) return { kind: 'menu' };
  return undefined;
}

interface Options {
  url: () => string;
  token: () => string | undefined;
  saveToken: (token: string | undefined) => Promise<void>;
  status: () => Status;
  /** Live events for the page. */
  emit: (event: Record<string, unknown>) => void;
  /** Connected and signed in (again): e.g. publish this launcher's chat key. */
  onReady?: () => void;
  fetchImpl?: typeof fetch;
}

export class SocialClient {
  private ws?: WebSocket;
  private user?: SocialUser;
  /** When `user` was last told by the server (ready, /v1/me or an answer that carries it). */
  private userAt = 0;
  private connected = false;
  private retry = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private activity: Activity = { kind: 'launcher', since: Date.now() };
  private away = false;
  private stopped = true;

  constructor(private opts: Options) {}

  state(): SocialState {
    return { url: this.opts.url(), user: this.user, connected: this.connected, status: this.opts.status() };
  }

  /** A request to the server with the session; errors come back as SocialError codes. */
  async call<T = unknown>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const token = this.opts.token();
    if (auth && !token) throw new SocialError('unauthorized', 401);
    let res: Response;
    try {
      res = await (this.opts.fetchImpl ?? fetch)(this.opts.url().replace(/\/$/, '') + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-SlashClient': `launcher/${APP_VERSION}`, ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new SocialError('offline');
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; retryAfter?: unknown };
    if (!res.ok) {
      if (res.status === 401 && auth) await this.dropSession();
      throw new SocialError(errorCode(data, res.status), res.status);
    }
    return data as T;
  }

  /** Raw bytes to the server (an encrypted chat picture); the answer is JSON as with `call`. */
  async upload<T = unknown>(path: string, data: Uint8Array): Promise<T> {
    return this.raw(path, { method: 'POST', body: data, type: 'application/octet-stream' }).then((res) => res.json() as Promise<T>);
  }

  /** Raw bytes from the server (an encrypted chat picture). */
  async download(path: string): Promise<Buffer> {
    return this.raw(path, { method: 'GET' }).then(async (res) => Buffer.from(await res.arrayBuffer()));
  }

  private async raw(path: string, opts: { method: string; body?: Uint8Array; type?: string }): Promise<Response> {
    const token = this.opts.token();
    if (!token) throw new SocialError('unauthorized', 401);
    let res: Response;
    try {
      res = await (this.opts.fetchImpl ?? fetch)(this.opts.url().replace(/\/$/, '') + path, {
        method: opts.method,
        headers: { 'X-SlashClient': `launcher/${APP_VERSION}`, Authorization: `Bearer ${token}`, ...(opts.type ? { 'Content-Type': opts.type } : {}) },
        body: opts.body as unknown as BodyInit | undefined,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new SocialError('offline');
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; retryAfter?: unknown };
      if (res.status === 401) await this.dropSession();
      throw new SocialError(errorCode(data, res.status), res.status);
    }
    return res;
  }

  /** Keeps the session from a sign-in and goes online. */
  async signedIn(result: { token: string; user: SocialUser }) {
    await this.opts.saveToken(result.token);
    this.setUser(result.user);
    this.start();
    return this.state();
  }

  /** After a provider was linked or unlinked: the page shows the new list. */
  updateUser(user: SocialUser) {
    this.setUser(user);
    this.opts.emit({ type: 'state', state: this.state() });
  }

  private setUser(user: SocialUser | undefined) {
    this.user = user;
    this.userAt = user ? Date.now() : 0;
  }

  /**
   * The account as the server last told it (the WebSocket's ready, /v1/me, or the answer of a change), so
   * the page does not ask /v1/me again for a field like the supporter tier; asked again when older than `maxAgeMs`.
   */
  async me(maxAgeMs = 60_000): Promise<SocialUser> {
    if (this.user && Date.now() - this.userAt < maxAgeMs) return this.user;
    const me = await this.call<SocialUser>('GET', '/v1/me');
    this.setUser(me);
    return me;
  }

  /** An answer of POST /v1/me (the same account, changed): kept quietly, without a 'state' event. */
  noteUser(user: unknown) {
    const u = user as SocialUser | undefined;
    if (u && typeof u === 'object' && typeof u.id === 'string' && u.id === this.user?.id) this.setUser(u);
  }

  async logout() {
    await this.call('POST', '/v1/auth/logout').catch(() => {});
    await this.dropSession();
  }

  private async dropSession() {
    this.stop();
    this.setUser(undefined);
    await this.opts.saveToken(undefined);
    this.opts.emit({ type: 'state', state: this.state() });
  }

  /** Connects when there is a session; safe to call again (e.g. after the address changed). */
  start() {
    this.stop();
    if (!this.opts.token()) return;
    this.stopped = false;
    this.connect();
    // the WebSocket's ready says who we are (every server version sends `me` with it); only when it is slow
    // (the server is down, a proxy holds the upgrade) is /v1/me asked, so the page still gets the name soon
    clearTimeout(this.meTimer);
    this.meTimer = setTimeout(() => {
      if (this.stopped || this.connected) return;
      this.call<SocialUser>('GET', '/v1/me').then((me) => {
        // the WebSocket was quicker after all, or the session is gone
        if (this.stopped || this.connected) return;
        this.setUser(me);
        this.opts.emit({ type: 'state', state: this.state() });
      }, () => {});
    }, SocialClient.ME_FALLBACK_MS);
  }

  private meTimer?: ReturnType<typeof setTimeout>;
  static ME_FALLBACK_MS = 3000;

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.meTimer);
    this.ws?.close();
    this.ws = undefined;
    this.setConnected(false);
  }

  private connect() {
    const url = this.opts.url().replace(/^http/, 'ws').replace(/\/$/, '') + '/v1/ws';
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return this.scheduleRetry();
    }
    this.ws = ws;
    // naming ourselves lets a newer server leave out of `ready` what only the website reads (LEAN_SINCE)
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'auth', client: 'launcher', version: APP_VERSION, token: this.opts.token(), presence: this.presence() })));
    ws.addEventListener('message', (e) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (event.type === 'ready') {
        this.setUser(event.me as SocialUser);
        this.retry = 0;
        this.setConnected(true);
        this.opts.onReady?.();
        return;
      }
      this.opts.emit(event);
    });
    ws.addEventListener('close', (e) => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      this.setConnected(false);
      // 4001: the session is no longer valid, so retrying would not help
      if (e.code === 4001) void this.dropSession();
      else this.scheduleRetry();
    });
  }

  /**
   * 1–5 s, then about 4 s, 8 s… up to a minute, each ±30%: a server that is down is not hammered, and after
   * it restarts the launchers do not all come back in the same second.
   */
  private scheduleRetry() {
    if (this.stopped) return;
    this.retryTimer = setTimeout(() => !this.stopped && this.connect(), retryDelay(this.retry++));
  }

  /**
   * The computer woke up or the network came back: a launcher waiting for its next try connects now; a
   * connection that looks open sends the status, which closes it at once when it died during the sleep.
   */
  reconnectNow() {
    if (this.stopped || !this.opts.token()) return;
    if (this.connected) return this.sendPresence();
    // a try is already under way
    if (this.ws) return;
    clearTimeout(this.retryTimer);
    this.retry = 0;
    this.connect();
  }

  private setConnected(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    this.opts.emit({ type: 'state', state: this.state() });
  }

  private presence() {
    const chosen = this.opts.status();
    // automatic "away" only replaces a plain "online"
    const status = chosen === 'online' && this.away && this.activity.kind === 'launcher' ? 'away' : chosen;
    // the tab list's status says where the player is, like the address: it does not leave when that is hidden
    const detail = this.activity.kind === 'server' && this.activity.server && this.user?.showServer && this.detail ? this.detail : undefined;
    return { status, activity: detail ? { ...this.activity, detail } : this.activity };
  }

  private sendPresence() {
    if (this.ws?.readyState === WebSocket.OPEN && this.connected) this.ws.send(JSON.stringify({ type: 'presence', presence: this.presence() }));
  }

  private detail?: string;
  /** A change of the status goes at most every few seconds (a sector switch, then another): the last one wins. */
  private detailTimer?: ReturnType<typeof setTimeout>;
  private detailSentAt = 0;
  static readonly DETAIL_GAP_MS = 3000;

  /** The status from the server's tab list (the HUD found it), or undefined; only while on a server. */
  setDetail(detail: string | undefined) {
    if (this.activity.kind !== 'server') detail = undefined;
    if (detail === this.detail) return;
    this.detail = detail;
    // hidden from friends: nothing to tell
    if (!this.user?.showServer) return;
    if (this.detailTimer) return;
    const wait = this.detailSentAt + SocialClient.DETAIL_GAP_MS - Date.now();
    const send = () => {
      this.detailTimer = undefined;
      this.detailSentAt = Date.now();
      this.sendPresence();
    };
    if (wait <= 0) send();
    else this.detailTimer = setTimeout(send, wait);
  }

  /** The status as it is sent now (for the tests). */
  presenceForTest() {
    return this.presence();
  }

  /** What the player is doing now, as friends see it. */
  currentActivity(): Activity {
    return this.activity;
  }

  setActivity(activity: Activity) {
    const same = activity.kind === this.activity.kind && activity.server === this.activity.server && activity.version === this.activity.version;
    if (same) return;
    // another server (or none): the status was about the old one
    if (activity.kind !== this.activity.kind || activity.server !== this.activity.server) this.detail = undefined;
    this.activity = { ...activity, since: activity.since ?? Date.now() };
    this.sendPresence();
  }

  /** Call after the player picked a different status. */
  statusChanged() {
    this.sendPresence();
    this.opts.emit({ type: 'state', state: this.state() });
  }

  /** The computer has been idle for a while (or is in use again). */
  setAway(away: boolean) {
    if (away === this.away) return;
    this.away = away;
    this.sendPresence();
  }

  /** Any other message on the live connection (a world opened to LAN); dropped while offline, sent again on ready by its owner. */
  send(message: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN && this.connected) this.ws.send(JSON.stringify(message));
  }

  typing(to: string) {
    if (this.ws?.readyState === WebSocket.OPEN && this.connected) this.ws.send(JSON.stringify({ type: 'typing', to }));
  }
}
