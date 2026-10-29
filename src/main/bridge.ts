import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { cleanDetail, cleanValues } from './serverStatus';

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
  /**
   * The running game's own session, so it renews its token without a restart: `{ type: 'offline' }` for an
   * offline account, nothing when the launcher started no game. Refreshed through Microsoft when under
   * two hours are left, or at once with `force` (a server refused the session).
   */
  session?: (force: boolean) => Promise<{ type: 'msa'; name: string; uuid: string; accessToken: string; xuid: string; expiresAt: number } | { type: 'offline' } | undefined>;
  /** Sends a screenshot to a friend (encrypted by the launcher); rejects paths that are not a profile's screenshot. */
  sendImage?: (friendId: string, file: string) => Promise<unknown>;
  /** The same to a group (or clan) chat the player is in. */
  sendGroupImage?: (groupId: string, file: string) => Promise<unknown>;
  /** A picture from the chat, decrypted, as PNG. */
  chatImage?: (id: string) => Promise<Buffer>;
  /** A screenshot to a community's channel (not encrypted; server 0.9.30+). */
  sendCommunityImage?: (communityId: string, channelId: string, file: string) => Promise<unknown>;
  /** A picture from a community's chat, as PNG. */
  communityImage?: (communityId: string, id: string) => Promise<Buffer>;
  /** A GIF's or sticker's still frame from the provider's CDN (through the server when it says so), as it comes: GIF, PNG or JPEG. */
  gifStill?: (url: string) => Promise<{ type: string; data: Buffer }>;
  /** A clan's logo (PNG, 64×64) by the clan's id and the logo's version. */
  clanLogo?: (id: string, version: number) => Promise<Buffer>;
  /** A community's logo, the same way. */
  communityLogo?: (id: string, version: number) => Promise<Buffer>;
  /** What the server's tab list says (serverStatus.ts): the server, the short status and its values; or nothing. */
  gameStatus?: (status: { server: string; detail?: string; values: Record<string, string> } | undefined) => void;
  /** What plays on this computer (nowPlaying.ts), asked by the game only while its "Now playing" module is on; `onlySpotify` leaves out browsers and other players. */
  spotifyNow?: (onlySpotify: boolean) => Promise<unknown>;
  /** The cover of what plays by its id (from the system, or Spotify's image host), as a 64×64 PNG. */
  spotifyCover?: (id: string) => Promise<Buffer>;
  /** The SkyUp.pl wiki for the game's "Wiki SkyUp" screen (skyupWiki.ts): its articles, one as blocks, a search, a picture as PNG. */
  skyupWikiIndex?: () => Promise<unknown>;
  skyupWikiArticle?: (slug: string) => Promise<unknown>;
  skyupWikiSearch?: (query: string) => Promise<unknown>;
  skyupWikiPicture?: (id: string) => Promise<Buffer>;
}

/** What the game may ask for: its friends and the messages with them. */
const ALLOWED: [string, RegExp][] = [
  ['GET', /^\/v1\/friends$/],
  ['GET', /^\/v1\/messages\/[\w-]{1,64}(\?(before=\d+&?|limit=\d+&?)*)?$/],
  ['POST', /^\/v1\/messages\/[\w-]{1,64}$/],
  ['POST', /^\/v1\/messages\/[\w-]{1,64}\/read$/],
  ['POST', /^\/v1\/invites\/[\w-]{1,64}$/],
  // muting a friend from the game's friends list (on the account, so the launcher follows)
  ['POST', /^\/v1\/friends\/[\w-]{1,64}\/mute$/],
  // waypoints shared with friends, and parties (several friends invited at once)
  ['POST', /^\/v1\/waypoints$/],
  ['GET', /^\/v1\/parties$/],
  ['POST', /^\/v1\/parties$/],
  ['POST', /^\/v1\/parties\/[\w-]{1,32}\/(accept|decline|leave)$/],
  ['DELETE', /^\/v1\/parties\/[\w-]{1,32}$/],
  ['POST', /^\/v1\/mc\/emote$/],
  // friends on the minimap: the game's position while the player shares it, and the switch for it (only the mode: picking friends stays in the launcher)
  ['POST', /^\/v1\/mc\/position$/],
  ['GET', /^\/v1\/me\/position-sharing$/],
  ['POST', /^\/v1\/me\/position-sharing$/],
  // a spray on a block, for players there with SlashClient
  ['POST', /^\/v1\/mc\/spray$/],
  // the SkyUp fish atlas, for the admin panel only (in parts under the size limit)
  ['POST', /^\/v1\/mc\/fish-atlas$/],
  // the cosmetics menu in the game: what there is, what is worn, and changing it
  ['GET', /^\/v1\/cosmetics$/],
  ['GET', /^\/v1\/me$/],
  ['POST', /^\/v1\/me$/],
  // the player's achievements (the cosmetics menu says how to earn the locked rewards)
  ['GET', /^\/v1\/achievements$/],
  // sparks from achievements: the balance, and buying a cosmetic with them in the game's menu
  ['GET', /^\/v1\/wallet$/],
  ['POST', /^\/v1\/shop\/\w{1,64}\/buy$/],
  // group chats (clan chats too): reading, writing, a new group, adding friends, leaving
  ['GET', /^\/v1\/groups$/],
  ['POST', /^\/v1\/groups$/],
  ['GET', /^\/v1\/groups\/[\w-]{1,32}\/messages(\?(before=\d+&?|limit=\d+&?)*)?$/],
  ['POST', /^\/v1\/groups\/[\w-]{1,32}\/(messages|read|members|leave)$/],
  // editing one's message for a while, and deleting it (in a group also others', for its moderators) (server 0.9.23+)
  ['POST', /^\/v1\/messages\/[\w-]{1,64}\/\d{1,15}\/edit$/],
  ['DELETE', /^\/v1\/messages\/[\w-]{1,64}\/\d{1,15}$/],
  ['POST', /^\/v1\/groups\/[\w-]{1,32}\/messages\/\d{1,15}\/edit$/],
  ['DELETE', /^\/v1\/groups\/[\w-]{1,32}\/messages\/\d{1,15}$/],
  // the clan: who is in it and online (managing it stays in the launcher)
  ['GET', /^\/v1\/clans\/mine$/],
  // communities: the list, their chat (read, write, edit and delete one's own or as a moderator, report), members to look at (managing stays in the launcher)
  ['GET', /^\/v1\/communities\/mine$/],
  ['GET', /^\/v1\/communities\/[\w-]{1,32}\/channels\/[\w-]{1,32}\/messages(\?(before=\d+&?|limit=\d+&?)*)?$/],
  ['POST', /^\/v1\/communities\/[\w-]{1,32}\/channels\/[\w-]{1,32}\/(messages|read)$/],
  ['POST', /^\/v1\/communities\/[\w-]{1,32}\/channels\/[\w-]{1,32}\/messages\/\d{1,15}\/(edit|report|reactions)$/],
  ['DELETE', /^\/v1\/communities\/[\w-]{1,32}\/channels\/[\w-]{1,32}\/messages\/\d{1,15}$/],
  ['GET', /^\/v1\/communities\/[\w-]{1,32}\/members(\?(offset=\d+&?|limit=\d+&?)*)?$/],
  ['POST', /^\/v1\/communities\/[\w-]{1,32}\/notify$/],
  // a vote in a community's poll (server 0.9.30+)
  ['POST', /^\/v1\/communities\/[\w-]{1,32}\/channels\/[\w-]{1,32}\/messages\/\d{1,15}\/vote$/],
  // friend suggestions (players met recently on the same server): the list, "×", and a friend request to one of them
  ['GET', /^\/v1\/friends\/suggestions(\?limit=\d{1,2})?$/],
  ['POST', /^\/v1\/friends\/suggestions\/[\w-]{1,64}\/dismiss$/],
  ['POST', /^\/v1\/friends\/requests$/],
  // friend requests to the player, taken or turned down in the game's friends window
  ['POST', /^\/v1\/friends\/requests\/[\w-]{1,64}\/accept$/],
  ['DELETE', /^\/v1\/friends\/requests\/[\w-]{1,64}$/],
  // the Minecraft uuids of players in sight on this server, now and then (the server keeps only SlashClient players)
  ['POST', /^\/v1\/mc\/nearby$/],
];
/** From the game, /v1/me changes only cosmetics (not, say, whether friends see the server). */
const ME_KEYS = new Set(['cape', 'loadout', 'character', 'own']);
/** From the game, sharing the position is switched on or off (all friends, or those picked in the launcher), nothing more. */
const POSITION_MODES = new Set(['off', 'all', 'some']);

/** Events the game cares about; the rest (login flow, account state) stays in the launcher. */
const FORWARDED = new Set(['message', 'presence', 'friends', 'typing', 'read', 'state', 'join', 'emote', 'achievement', 'party',
  // someone in sight changed what they wear: the HUD shows it at once instead of at its next lookup
  'cosmetics',
  // someone there sprayed on a block: the HUD draws it
  'spray',
  // group and clan chats
  'groups', 'group-message', 'clan',
  // a message edited or deleted, direct or in a group
  'message-edit', 'message-delete', 'group-message-edit', 'group-message-delete',
  // sparks: the balance changed, and many achievements unlocked at once (one toast)
  'wallet', 'achievements-summary',
  // a daily or weekly challenge completed, and all of a day's or week's (server 0.9.36+): a toast
  'challenge', 'challenges-bonus',
  // communities: the list changed, their chat, and news for one (invited, accepted, kicked…)
  'communities', 'community-message', 'community-message-edit', 'community-message-delete', 'community',
  // a reaction under a community message, a message pinned or unpinned (server 0.9.27+)
  'community-reaction', 'community-pin',
  // a community poll's results changed (server 0.9.30+)
  'community-poll',

  // a friend sharing their position on the same server (the minimap), or no longer sharing it
  'friend-position',

  // a friend went live on Twitch or Kick, or ended: the LIVE badge, and a toast when `notify`
  'stream']);
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

  /** Starts once; later calls (also while the first is still starting: two games at once) return the same address. */
  async start(): Promise<{ url: string; key: string }> {
    this.starting ??= (async () => {
      this.server = http.createServer((req, res) => this.handle(req, res).catch((err) => this.send(res, 500, { error: String((err as Error).message ?? err) })));
      await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
      this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    })();
    await this.starting;
    return { url: this.url, key: this.key };
  }

  private starting?: Promise<void>;

  stop() {
    this.server?.close();
    this.server = undefined;
    this.starting = undefined;
    for (const wake of this.waiting) wake();
  }

  /** JVM arguments that tell the HUD where the bridge is. */
  jvmArgs(): string[] {
    return this.url ? [`-Dslashclient.bridge=${this.url}`, `-Dslashclient.bridgeKey=${this.key}`] : [];
  }

  /** A social event from the launcher's WebSocket, passed on to the game. */
  push(event: { type: string; [key: string]: unknown }) {
    if (!FORWARDED.has(event.type)) return;
    // a friend's position every 2 seconds: only the newest one of each friend waits, so they never crowd out messages
    if (event.type === 'friend-position') this.events = this.events.filter((e) => e.type !== 'friend-position' || e.from !== event.from);
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

    // `events`: what this launcher passes on, so the HUD knows whether to wait for news or keep asking (cosmetics)
    if (method === 'GET' && url === '/state') {
      const state = this.opts.state();
      return this.send(res, 200, { ...(state && typeof state === 'object' ? state : {}), events: [...FORWARDED] });
    }

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

    // the game's session renewed before its token runs out (HUD 0.9.40+); the token goes only to the game, through this keyed bridge
    const session = /^\/session(\?force=1)?$/.exec(url);
    if (method === 'GET' && session) {
      if (!this.opts.session) return this.send(res, 404, { error: 'not_found' });
      try {
        const answer = await this.opts.session(!!session[1]);
        return answer ? this.send(res, 200, answer) : this.send(res, 404, { error: 'no_game_account' });
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

    // the tab list's status on a server (HUD 0.9.25+): for friends and Discord; null when there is none
    if (method === 'POST' && url === '/status') {
      const { server, detail, values } = ((await this.body(req)) ?? {}) as { server?: unknown; detail?: unknown; values?: unknown };
      if (!this.opts.gameStatus) return this.send(res, 404, { error: 'not_found' });
      if (server === null || server === undefined) {
        this.opts.gameStatus(undefined);
        return this.send(res, 200, { ok: true });
      }
      if (typeof server !== 'string' || !/^[\w.-]{1,253}(:\d{1,5})?$/.test(server)) return this.send(res, 400, { error: 'bad_request' });
      this.opts.gameStatus({ server, detail: cleanDetail(detail), values: cleanValues(values) });
      return this.send(res, 200, { ok: true });
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

    // pictures in the chat: a screenshot to send, and one to show (PNG bytes, not JSON)
    if (method === 'POST' && url === '/chat/image') {
      const { friend, group, community, channel, path } = ((await this.body(req)) ?? {}) as { friend?: unknown; group?: unknown; community?: unknown; channel?: unknown; path?: unknown };
      // a community's channel (HUD 0.9.30+)
      if (community !== undefined) {
        const ok = typeof community === 'string' && /^[\w-]{1,32}$/.test(community) && typeof channel === 'string' && /^[\w-]{1,32}$/.test(channel) && typeof path === 'string' && !!this.opts.sendCommunityImage;
        if (!ok) return this.send(res, 400, { error: 'bad_request' });
        try {
          return this.send(res, 200, { message: await this.opts.sendCommunityImage!(community as string, channel as string, path as string) });
        } catch (err) {
          return this.send(res, 502, { error: (err as { code?: string }).code ?? (err as Error).message });
        }
      }
      const toGroup = typeof group === 'string' && /^[\w-]{1,32}$/.test(group) && !!this.opts.sendGroupImage;
      if ((!toGroup && (typeof friend !== 'string' || !/^[\w-]{1,64}$/.test(friend) || !this.opts.sendImage)) || typeof path !== 'string') return this.send(res, 400, { error: 'bad_request' });
      try {
        return this.send(res, 200, toGroup ? await this.opts.sendGroupImage!(group as string, path) : await this.opts.sendImage!(friend as string, path));
      } catch (err) {
        return this.send(res, 502, { error: (err as { code?: string }).code ?? (err as Error).message });
      }
    }
    const image = /^\/chat\/image\/([\w-]{22})$/.exec(url);
    if (method === 'GET' && image) {
      if (!this.opts.chatImage) return this.send(res, 404, { error: 'not_found' });
      try {
        const png = await this.opts.chatImage(image[1]);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'no-store' });
        return res.end(png);
      } catch (err) {
        return this.send(res, 404, { error: (err as { code?: string }).code ?? (err as Error).message });
      }
    }

    const communityImage = /^\/community\/image\/([\w-]{1,32})\/([\w-]{22})$/.exec(url);
    if (method === 'GET' && communityImage) {
      if (!this.opts.communityImage) return this.send(res, 404, { error: 'not_found' });
      try {
        const png = await this.opts.communityImage(communityImage[1], communityImage[2]);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'no-store' });
        return res.end(png);
      } catch (err) {
        return this.send(res, 404, { error: (err as { code?: string }).code ?? (err as Error).message });
      }
    }

    // a GIF's still frame (HUD 0.9.40+): only addresses on the providers' CDN hosts (gifMedia.ts checks)
    const gif = /^\/gif\/still\?u=([\w%.~*-]{1,1500})$/.exec(url);
    if (method === 'GET' && gif) {
      if (!this.opts.gifStill) return this.send(res, 404, { error: 'not_found' });
      try {
        const still = await this.opts.gifStill(decodeURIComponent(gif[1]));
        res.writeHead(200, { 'Content-Type': still.type, 'Content-Length': still.data.length, 'Cache-Control': 'no-store' });
        return res.end(still.data);
      } catch (err) {
        return this.send(res, 404, { error: (err as Error).message });
      }
    }

    // "Now playing" (HUD 0.9.36+, the routes keep their old name): what plays on this computer, and its cover
    const now = /^\/spotify\/now(\?only=spotify)?$/.exec(url);
    if (method === 'GET' && now) {
      if (!this.opts.spotifyNow) return this.send(res, 404, { error: 'not_found' });
      return this.send(res, 200, await this.opts.spotifyNow(!!now[1]));
    }
    const cover = /^\/spotify\/cover\/([0-9a-f]{16,64})$/.exec(url);
    if (method === 'GET' && cover) {
      if (!this.opts.spotifyCover) return this.send(res, 404, { error: 'not_found' });
      try {
        const png = await this.opts.spotifyCover(cover[1]);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'no-store' });
        return res.end(png);
      } catch (err) {
        return this.send(res, 404, { error: (err as Error).message });
      }
    }

    // the SkyUp.pl wiki for the game (HUD 0.9.52+): the articles, an article, a search, a picture by its id
    const wiki = /^\/skyup-wiki\/(index|article\/([a-z0-9][a-z0-9-]{0,79})|search\?q=([^&]{1,300})|image\/([0-9a-f]{20}))$/.exec(url);
    if (method === 'GET' && wiki) {
      const o = this.opts;
      if (!o.skyupWikiIndex || !o.skyupWikiArticle || !o.skyupWikiSearch || !o.skyupWikiPicture) return this.send(res, 404, { error: 'not_found' });
      try {
        if (wiki[4]) {
          const png = await o.skyupWikiPicture(wiki[4]);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'no-store' });
          return res.end(png);
        }
        if (wiki[1] === 'index') return this.send(res, 200, await o.skyupWikiIndex());
        if (wiki[2]) return this.send(res, 200, await o.skyupWikiArticle(wiki[2]));
        let q = '';
        try {
          q = decodeURIComponent(wiki[3].replace(/\+/g, ' '));
        } catch {
          return this.send(res, 400, { error: 'bad_request' });
        }
        return this.send(res, 200, await o.skyupWikiSearch(q));
      } catch (err) {
        return this.send(res, 502, { error: (err as Error).message });
      }
    }

    // a clan's (or a community's) logo for the friends window (kept by version, so the game may keep it too)
    const logo = /^\/(clan|community)\/logo\/([\w-]{1,32})\?v=(\d{1,16})$/.exec(url);
    if (method === 'GET' && logo) {
      const fetchLogo = logo[1] === 'clan' ? this.opts.clanLogo : this.opts.communityLogo;
      if (!fetchLogo) return this.send(res, 404, { error: 'not_found' });
      try {
        const png = await fetchLogo(logo[2], Number(logo[3]));
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'no-store' });
        return res.end(png);
      } catch (err) {
        return this.send(res, 404, { error: (err as { code?: string }).code ?? (err as Error).message });
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
      // a friend request from the game names only the player (by handle)
      if (url === '/v1/friends/requests') {
        const b = (body ?? {}) as Record<string, unknown>;
        if (Object.keys(b).some((k) => k !== 'handle') || typeof b.handle !== 'string' || !/^@?[\w.]{1,40}$/.test(b.handle)) return this.send(res, 403, { error: 'forbidden' });
      }
      if (url === '/v1/me/position-sharing' && method === 'POST') {
        const b = (body ?? {}) as Record<string, unknown>;
        if (Object.keys(b).some((k) => k !== 'mode') || !POSITION_MODES.has(b.mode as string)) return this.send(res, 403, { error: 'forbidden' });
      }
      this.send(res, 200, (await this.opts.call(method, url, body)) ?? {});
    } catch (err) {
      const code = (err as { code?: string }).code ?? (err as Error).message;
      this.send(res, 502, { error: code });
    }
  }
}
