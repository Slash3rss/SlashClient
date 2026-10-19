import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A small HTTP server on 127.0.0.1 through which SlashClient HUD (in the game) reaches
 * friends and messages. The game never sees the SlashClient account token: it gets this
 * server's address and a random key for the launcher's run, and the launcher makes the
 * real calls. Only the friends list and messages are reachable, nothing about the account.
 */

export interface BridgeEvent { seq: number; type: string; [key: string]: unknown }

export interface BridgeOptions {
  /** The SlashClient server call, with the launcher's token. */
  call: (method: string, path: string, body?: unknown) => Promise<unknown>;
  /** Signed in or not, and who. */
  state: () => unknown;
  /** Puts a screenshot on the clipboard; rejects paths that are not a profile's screenshot. */
  copyImage?: (file: string) => Promise<void>;
  /** The launcher's accounts, without tokens; `current` is the one the game plays as. */
  accounts?: () => { id: string; name: string; type: string; current: boolean }[];
  /** The game opened its world to LAN on this port, or closed it (undefined): friends may join. */
  lanHost?: (port: number | undefined) => void;
  /** A port on this computer that leads into a friend's LAN world. */
  lanJoin?: (host: string) => Promise<number>;
  /** The session for one account, picked in the game's menu (a fresh token for Microsoft). */
  useAccount?: (id: string) => Promise<{ name: string; uuid: string; accessToken: string; xuid: string; type: string }>;
}

/** What the game may ask for: its friends and the messages with them. */
const ALLOWED: [string, RegExp][] = [
  ['GET', /^\/v1\/friends$/],
  ['GET', /^\/v1\/messages\/[\w-]{1,64}(\?(before=\d+&?|limit=\d+&?)*)?$/],
  ['POST', /^\/v1\/messages\/[\w-]{1,64}$/],
  ['POST', /^\/v1\/messages\/[\w-]{1,64}\/read$/],
  ['POST', /^\/v1\/invites\/[\w-]{1,64}$/],
  // waypoints shared with friends, and parties (several friends invited at once)
  ['POST', /^\/v1\/waypoints$/],
  ['GET', /^\/v1\/parties$/],
  ['POST', /^\/v1\/parties$/],
  ['POST', /^\/v1\/parties\/[\w-]{1,32}\/(accept|decline|leave)$/],
  ['DELETE', /^\/v1\/parties\/[\w-]{1,32}$/],
  ['POST', /^\/v1\/mc\/emote$/],
  // the cosmetics menu in the game: what there is, what is worn, and changing it
  ['GET', /^\/v1\/cosmetics$/],
  ['GET', /^\/v1\/me$/],
  ['POST', /^\/v1\/me$/],
  // the player's achievements (the cosmetics menu says how to earn the locked rewards)
  ['GET', /^\/v1\/achievements$/],
];
/** From the game, /v1/me changes only cosmetics (not, say, whether friends see the server). */
const ME_KEYS = new Set(['cape', 'loadout', 'character', 'own']);

/** Events the game cares about; the rest (login flow, account state) stays in the launcher. */
const FORWARDED = new Set(['message', 'presence', 'friends', 'typing', 'read', 'state', 'join', 'emote', 'achievement', 'party']);
const KEEP = 200;
const LONG_POLL_MS = 25_000;

export class GameBridge {
  private server?: http.Server;
  private key = randomBytes(24).toString('base64url');
  private seq = 0;
  private events: BridgeEvent[] = [];
  private waiting = new Set<() => void>();
  url = '';

  constructor(private readonly opts: BridgeOptions) {}

  /** Starts once; later calls return the same address. */
  async start(): Promise<{ url: string; key: string }> {
    if (!this.server) {
      this.server = http.createServer((req, res) => this.handle(req, res).catch((err) => this.send(res, 500, { error: String((err as Error).message ?? err) })));
      await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
      this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    }
    return { url: this.url, key: this.key };
  }

  stop() {
    this.server?.close();
    this.server = undefined;
    for (const wake of this.waiting) wake();
  }

  /** JVM arguments that tell the HUD where the bridge is. */
  jvmArgs(): string[] {
    return this.url ? [`-Dslashclient.bridge=${this.url}`, `-Dslashclient.bridgeKey=${this.key}`] : [];
  }

  /** A social event from the launcher's WebSocket, passed on to the game. */
  push(event: { type: string; [key: string]: unknown }) {
    if (!FORWARDED.has(event.type)) return;
    this.events.push({ ...event, seq: ++this.seq });
    if (this.events.length > KEEP) this.events.splice(0, this.events.length - KEEP);
    for (const wake of this.waiting) wake();
  }

  private authorized(req: http.IncomingMessage): boolean {
    const given = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
    const want = Buffer.from(this.key);
    return given.length === want.length && timingSafeEqual(given, want);
  }

  private send(res: http.ServerResponse, status: number, body: unknown) {
    if (res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  private async body(req: http.IncomingMessage): Promise<unknown> {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 16_384) throw new Error('too_large');
    }
    return raw ? JSON.parse(raw) : undefined;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    // only the game on this computer, with the key; a browser page can't send the header cross-origin without a preflight we never answer
    if (!this.authorized(req)) return this.send(res, 401, { error: 'unauthorized' });
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/state') return this.send(res, 200, this.opts.state());

    if (method === 'GET' && url === '/accounts') return this.send(res, 200, { accounts: this.opts.accounts?.() ?? [] });
    if (method === 'POST' && url === '/accounts/use') {
      const { id } = ((await this.body(req)) ?? {}) as { id?: unknown };
      if (typeof id !== 'string' || !this.opts.useAccount) return this.send(res, 400, { error: 'bad_request' });
      try {
        return this.send(res, 200, await this.opts.useAccount(id));
      } catch (err) {
        return this.send(res, 502, { error: (err as Error).message });
      }
    }

    // a world opened to LAN, for friends: the game says its port; joining one gets a local port
    if (method === 'POST' && url === '/lan/host') {
      const { port } = ((await this.body(req)) ?? {}) as { port?: unknown };
      const valid = typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536;
      if (!this.opts.lanHost || (port !== null && !valid)) return this.send(res, 400, { error: 'bad_request' });
      this.opts.lanHost(valid ? port : undefined);
      return this.send(res, 200, { ok: true });
    }
    if (method === 'POST' && url === '/lan/join') {
      const { host } = ((await this.body(req)) ?? {}) as { host?: unknown };
      if (typeof host !== 'string' || !/^[\w-]{1,64}$/.test(host) || !this.opts.lanJoin) return this.send(res, 400, { error: 'bad_request' });
      return this.send(res, 200, { port: await this.opts.lanJoin(host) });
    }

    if (method === 'POST' && url === '/clipboard/image') {
      const { path } = ((await this.body(req)) ?? {}) as { path?: unknown };
      if (typeof path !== 'string' || !this.opts.copyImage) return this.send(res, 400, { error: 'bad_request' });
      try {
        await this.opts.copyImage(path);
        return this.send(res, 200, { ok: true });
      } catch (err) {
        return this.send(res, 403, { error: (err as Error).message });
      }
    }

    if (method === 'GET' && url.startsWith('/events')) {
      const after = Number(new URL(url, 'http://x').searchParams.get('after') ?? 0);
      const pending = () => this.events.filter((e) => e.seq > after);
      // a new launcher run starts counting from 0 again: the game catches up from there
      if (after > this.seq) return this.send(res, 200, { seq: this.seq, events: [] });
      if (!pending().length) {
        await new Promise<void>((resolve) => {
          const wake = () => {
            clearTimeout(timer);
            this.waiting.delete(wake);
            resolve();
          };
          const timer = setTimeout(wake, LONG_POLL_MS);
          this.waiting.add(wake);
          req.on('close', wake);
        });
      }
      return this.send(res, 200, { seq: this.seq, events: pending() });
    }

    if (!ALLOWED.some(([m, re]) => m === method && re.test(url))) return this.send(res, 403, { error: 'forbidden' });
    try {
      const body = method === 'POST' ? await this.body(req) : undefined;
      if (url === '/v1/me' && Object.keys((body as object | undefined) ?? {}).some((k) => !ME_KEYS.has(k))) return this.send(res, 403, { error: 'forbidden' });
      this.send(res, 200, (await this.opts.call(method, url, body)) ?? {});
    } catch (err) {
      const code = (err as { code?: string }).code ?? (err as Error).message;
      this.send(res, 502, { error: code });
    }
  }
}
