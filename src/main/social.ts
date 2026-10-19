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
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      if (res.status === 401 && auth) await this.dropSession();
      throw new SocialError(data.error ?? `http_${res.status}`, res.status);
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
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) await this.dropSession();
      throw new SocialError(data.error ?? `http_${res.status}`, res.status);
    }
    return res;
  }

  /** Keeps the session from a sign-in and goes online. */
  async signedIn(result: { token: string; user: SocialUser }) {
    await this.opts.saveToken(result.token);
    this.user = result.user;
    this.start();
    return this.state();
  }

  /** After a provider was linked or unlinked: the page shows the new list. */
  updateUser(user: SocialUser) {
    this.user = user;
    this.opts.emit({ type: 'state', state: this.state() });
  }

  async logout() {
    await this.call('POST', '/v1/auth/logout').catch(() => {});
    await this.dropSession();
  }

  private async dropSession() {
    this.stop();
    this.user = undefined;
    await this.opts.saveToken(undefined);
    this.opts.emit({ type: 'state', state: this.state() });
  }

  /** Connects when there is a session; safe to call again (e.g. after the address changed). */
  start() {
    this.stop();
    if (!this.opts.token()) return;
    this.stopped = false;
    this.connect();
    // the WebSocket says who we are too, but the page wants the name right away
    this.call<SocialUser>('GET', '/v1/me').then((me) => {
      this.user = me;
      this.opts.emit({ type: 'state', state: this.state() });
    }, () => {});
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
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
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'auth', token: this.opts.token(), presence: this.presence() })));
    ws.addEventListener('message', (e) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (event.type === 'ready') {
        this.user = event.me as SocialUser;
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

  /** 2 s, 4 s, 8 s… up to a minute, so a server that is down is not hammered. */
  private scheduleRetry() {
    if (this.stopped) return;
    const delay = Math.min(60_000, 2000 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => !this.stopped && this.connect(), delay);
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
    return { status, activity: this.activity };
  }

  private sendPresence() {
    if (this.ws?.readyState === WebSocket.OPEN && this.connected) this.ws.send(JSON.stringify({ type: 'presence', presence: this.presence() }));
  }

  /** What the player is doing now, as friends see it. */
  currentActivity(): Activity {
    return this.activity;
  }

  setActivity(activity: Activity) {
    const same = activity.kind === this.activity.kind && activity.server === this.activity.server && activity.version === this.activity.version;
    if (same) return;
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
