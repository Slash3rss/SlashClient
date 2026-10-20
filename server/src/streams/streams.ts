import { randomBytes } from 'node:crypto';
import { sitePage } from '../sitePages.ts';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { User } from '../db.ts';
import type { Settings } from '../settings.ts';
import type { SecretBox } from '../storage.ts';
import {
  Gate, KICK, PLATFORMS, ProviderError, RateLimited, TWITCH, channelUrl, embedUrl, kickClient, pkce, twitchClient, verifyEventSub, verifyKick,
  type KickClient, type LiveInfo, type Platform, type TwitchClient,
} from './providers.ts';
import { StreamStore, type StreamAccount } from './store.ts';

/**
 * "Streamy": players link their Twitch or Kick channel (not a way to sign in: only to show that
 * they are live), friends see a LIVE badge and get one notification when a stream starts, and the
 * public profile shows the stream (an embedded player) or links to the channels.
 *
 * Live state comes from the platforms' webhooks (Twitch EventSub stream.online/offline, Kick
 * livestream.status.updated), each checked by its signature and never handled twice, and from a
 * reconcile on a timer (Helix /streams in batches of 100, Kick /channels in batches of 50) that
 * also refreshes the title and viewers and catches what a webhook missed. Every call to the
 * platforms goes through a per-minute budget (the admin panel's settings) and pauses on a 429.
 *
 * Only a stream of an allowed game counts (the admin panel's streams.categories, Minecraft by
 * default: Twitch's game, Kick's category): any other is treated as offline everywhere, so
 * switching to Minecraft mid-stream starts it for friends (notifying as usual) and switching away
 * ends it. Twitch says so at once with EventSub channel.update, Kick with
 * livestream.metadata.updated; the reconcile catches it either way.
 *
 * The apps' keys are typed in the admin panel ("Streamy"), sealed with STORAGE_SECRET_KEY and never
 * sent back; no player's token is kept (they are revoked right after the link). The feature switch
 * "Streamy" stops linking, badges, notifications and the profile's section; webhooks are still
 * checked and answered, so the platforms do not drop the subscriptions while it is off.
 */

export interface StreamsContext {
  sql: DatabaseSync;
  box?: SecretBox;
  keyError?: string;
  publicUrl: string;
  settings: Settings;
  /** The feature switch (features.ts 'streams'). */
  enabled: () => boolean;
  user: (uuid: string) => User | undefined;
  friends: (uuid: string) => string[];
  /** Who this player muted (mutes.ts): no notification about them. */
  mutedBy: (uuid: string) => Set<string>;
  push: (uuid: string, event: Record<string, unknown>) => void;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  /** Linking per account (a rate limit). */
  limitLinks: (key: string) => void;
  limitWebhooks: (key: string) => void;
  clientIp: (req: http.IncomingMessage) => string;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  fetchImpl?: typeof fetch;
  /** Tests: fake platforms, the clock, and no timers. */
  base?: { twitch?: Partial<typeof TWITCH>; kick?: Partial<typeof KICK> };
  now?: () => number;
  timers?: boolean;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

/** A live stream as friends and the profile see it. */
export interface LiveView {
  platform: Platform; login: string; name: string; url: string;
  title: string; category: string; viewers: number; startedAt: number; thumbnail: string;
}

const LINK_TTL_MS = 10 * 60_000;
const NAMES: Record<Platform, string> = { twitch: 'Twitch', kick: 'Kick' };
const CLIENT_ID = /^[A-Za-z0-9_-]{5,100}$/;
const CLIENT_SECRET = /^[A-Za-z0-9_.~-]{8,200}$/;

export function createStreams(ctx: StreamsContext) {
  const now = ctx.now ?? Date.now;
  const store = new StreamStore(ctx.sql);
  const fail: (status: number, code: string) => never = ctx.fail;
  const base = ctx.publicUrl.replace(/\/$/, '');
  const num = (key: string) => ctx.settings.num(key);
  const redirectUri = (p: Platform) => `${base}/v1/streams/${p}/callback`;
  const hookUrl = (p: Platform) => (p === 'twitch' ? `${base}/v1/streams/twitch/eventsub` : `${base}/v1/streams/kick/webhook`);
  const gates: Record<Platform, Gate> = {
    twitch: new Gate(() => num('streams.twitchRequestsPerMinute'), now),
    kick: new Gate(() => num('streams.kickRequestsPerMinute'), now),
  };
  /** What the last reconcile of each platform did, for the panel. */
  const lastRun: Record<Platform, { at: number; ok: boolean; message: string; checked: number }> = {
    twitch: { at: 0, ok: true, message: '', checked: 0 }, kick: { at: 0, ok: true, message: '', checked: 0 },
  };

  // ---------- the apps' keys ----------

  const open = (sealed: string, aad: string) => {
    if (!sealed || !ctx.box) return '';
    try {
      return ctx.box.open(sealed, aad);
    } catch (err) {
      console.error(`streamy: klucz ${aad}: ${(err as Error).message}`);
      return '';
    }
  };
  const keysOf = (p: Platform) => {
    const row = store.provider(p);
    return { row, clientId: row.clientId, clientSecret: open(row.secret, `streams:${p}:secret`), hookSecret: open(row.hookSecret, `streams:${p}:hook`) };
  };
  /** The provider can be used: switched on in the panel, both keys there, the box to open them. */
  const ready = (p: Platform) => {
    const k = keysOf(p);
    return k.row.enabled && !!k.clientId && !!k.clientSecret ? k : undefined;
  };
  // clients are kept until the keys change (their app tokens with them)
  const clients = new Map<string, TwitchClient | KickClient>();
  function client(p: 'twitch'): TwitchClient | undefined;
  function client(p: 'kick'): KickClient | undefined;
  function client(p: Platform) {
    const k = ready(p);
    if (!k) return undefined;
    const key = `${p}:${k.row.updatedAt}`;
    let c = clients.get(key);
    if (!c) {
      for (const old of clients.keys()) if (old.startsWith(`${p}:`)) clients.delete(old);
      const opts = { fetchImpl: ctx.fetchImpl, gate: gates[p] };
      c = p === 'twitch' ? twitchClient(k, { ...opts, base: ctx.base?.twitch }) : kickClient(k, { ...opts, base: ctx.base?.kick });
      clients.set(key, c);
    }
    return c;
  }

  // ---------- views ----------

  function liveOf(a: StreamAccount): LiveView | undefined {
    const l = store.live(a.platform, a.subject);
    if (!l?.live) return undefined;
    return { platform: a.platform, login: a.login, name: a.name, url: channelUrl(a.platform, a.login), title: l.title, category: l.category, viewers: l.viewers, startedAt: l.startedAt, thumbnail: l.thumbnail };
  }

  /** The stream friends see by the name: the one live (the bigger one when both are), unless the player hides it or the feature is off. */
  function friendView(uuid: string): LiveView | undefined {
    if (!ctx.enabled() || store.prefs(uuid).hide) return undefined;
    const live = store.accounts(uuid).map(liveOf).filter((v): v is LiveView => !!v);
    return live.sort((a, b) => b.viewers - a.viewers)[0];
  }

  /** The hosts Twitch's player may be embedded on: this site and the admin's list. */
  const parents = () => [...new Set([new URL(base).hostname, ...ctx.settings.list('streams.embedParents')].filter(Boolean))];

  /** For the public profile (profiles.ts, under its own "Streamy" switch): channels, and the live ones with their player. */
  function profileView(uuid: string): { channels: Record<string, unknown>[]; live: Record<string, unknown>[] } | undefined {
    if (!ctx.enabled()) return undefined;
    const accounts = store.accounts(uuid);
    if (!accounts.length) return undefined;
    return {
      channels: accounts.map((a) => ({ platform: a.platform, login: a.login, name: a.name, url: channelUrl(a.platform, a.login) })),
      live: accounts.map((a) => {
        const v = liveOf(a);
        return v && { ...v, embed: embedUrl(a.platform, a.login, parents()) };
      }).filter(Boolean) as Record<string, unknown>[],
    };
  }

  function mine(uuid: string) {
    return {
      enabled: ctx.enabled(),
      platforms: PLATFORMS.filter((p) => !!ready(p)),
      accounts: store.accounts(uuid).map((a) => ({ platform: a.platform, login: a.login, name: a.name, url: channelUrl(a.platform, a.login), linkedAt: a.linkedAt, live: !!liveOf(a) })),
      prefs: store.prefs(uuid),
    };
  }

  // ---------- going live and offline ----------

  /**
   * Tells the owner's friends what their stream is now. `news`: it just started (and not within
   * streams.renotifyMinutes of the last one): friends who did not mute the owner and want to be
   * told get `notify`, the rest only the badge.
   */
  function fanOut(owner: string, news: boolean) {
    if (!ctx.enabled()) return;
    const view = friendView(owner) ?? null;
    for (const f of ctx.friends(owner)) {
      const tell = news && !!view && store.prefs(f).notify && !ctx.mutedBy(f).has(owner);
      ctx.push(f, { type: 'stream', id: owner, stream: view, ...(tell ? { notify: true } : {}) });
    }
    ctx.push(owner, { type: 'streams' });
  }

  /** Whether a stream's game is one SlashClient shows (by its name or the platform's id, any case). */
  function allowed(info: LiveInfo): boolean {
    const list = ctx.settings.list('streams.categories').map((c) => c.toLowerCase());
    return list.includes(info.category.trim().toLowerCase()) || (!!info.categoryId && list.includes(info.categoryId.toLowerCase()));
  }

  /** A channel's state from a webhook or a reconcile; `info` undefined (or another game than the allowed ones): offline. */
  function apply(platform: Platform, subject: string, given: LiveInfo | undefined) {
    const a = store.bySubject(platform, subject);
    if (!a) return;
    const info = given && allowed(given) ? given : undefined;
    const at = now();
    const prev = store.live(platform, subject);
    if (!info) {
      if (prev?.live) {
        store.setOffline(platform, subject, at);
        fanOut(a.uuid, false);
      }
      return;
    }
    const startedAt = info.startedAt || (prev?.live ? prev.startedAt : at);
    const merged = { ...info, startedAt, title: info.title || (prev?.live ? prev.title : '') };
    if (prev?.live) {
      store.setLive(platform, merged, at, false);
      // the title, category or viewers changed: the badges show it (no notification)
      if (prev.title !== merged.title || prev.category !== merged.category || prev.viewers !== merged.viewers) fanOut(a.uuid, false);
      return;
    }
    // a restart (the stream dropped and came back) within the window is not news again
    const window = num('streams.renotifyMinutes') * 60_000;
    const news = (!prev?.offlineAt || at - prev.offlineAt >= window) && (!prev?.notifiedAt || at - prev.notifiedAt >= window);
    store.setLive(platform, merged, at, news);
    fanOut(a.uuid, news);
  }

  // ---------- reconcile ----------

  const callbackFor = (p: Platform) => hookUrl(p);
  const webhooksPossible = () => base.startsWith('https://');

  async function subscribeTwitch(a: StreamAccount, c: TwitchClient): Promise<void> {
    const secret = keysOf('twitch').hookSecret;
    if (!secret || !ctx.settings.bool('streams.twitchEventSub') || !webhooksPossible()) return;
    const ids: string[] = [];
    for (const type of ['stream.online', 'stream.offline', 'channel.update'] as const) {
      const id = await c.subscribe(type, a.subject, callbackFor('twitch'), secret);
      if (id) ids.push(id);
    }
    // a 409 (already there) leaves a marker, so the reconcile does not ask again every round
    store.setSubs(a.uuid, 'twitch', ids.length ? ids : ['existing']);
  }

  async function subscribeKick(a: StreamAccount, c: KickClient): Promise<void> {
    if (!ctx.settings.bool('streams.kickWebhooks') || !webhooksPossible()) return;
    store.setSubs(a.uuid, 'kick', (await c.subscribe(a.subject)).split(','));
  }

  async function unsubscribe(a: StreamAccount) {
    const c = a.platform === 'twitch' ? client('twitch') : client('kick');
    for (const id of a.subs) {
      if (id === 'existing') continue;
      await c?.unsubscribe(id).catch((err) => console.error(`streamy: usuwanie subskrypcji ${a.platform}: ${(err as Error).message}`));
    }
  }

  /** One platform's channels asked about in batches; stops (until the next round) when the budget runs out. */
  async function reconcile(p: Platform, only?: StreamAccount[]): Promise<{ checked: number; ok: boolean; message: string }> {
    const c = p === 'twitch' ? client('twitch') : client('kick');
    if (!c) return { checked: 0, ok: false, message: 'not_configured' };
    const accounts = (only ?? store.all(p)).filter((a) => !ctx.user(a.uuid)?.banned);
    const size = p === 'twitch' ? 100 : 50;
    let checked = 0;
    let message = '';
    try {
      for (let i = 0; i < accounts.length; i += size) {
        const batch = accounts.slice(i, i + size);
        if (p === 'twitch') {
          const live = new Map((await (c as TwitchClient).liveOf(batch.map((a) => a.subject))).map((s) => [s.subject, s]));
          for (const a of batch) apply('twitch', a.subject, live.get(a.subject));
        } else {
          const found = new Map((await (c as KickClient).channels(batch.map((a) => a.subject))).map((s) => [s.subject, s]));
          for (const a of batch) {
            const ch = found.get(a.subject);
            // a channel Kick did not answer about is left as it was
            if (ch) apply('kick', a.subject, ch.live ? ch : undefined);
          }
        }
        checked += batch.length;
      }
      // webhooks for channels that have none yet (a few per round, within the budget)
      if (!only) {
        let made = 0;
        for (const a of accounts) {
          if (a.subs.length || made >= 10) continue;
          made++;
          if (p === 'twitch') await subscribeTwitch(a, c as TwitchClient);
          else await subscribeKick(a, c as KickClient);
        }
      }
    } catch (err) {
      message = err instanceof RateLimited ? 'rate_limited' : (err as Error).message;
      if (!(err instanceof RateLimited)) console.error(`streamy: ${NAMES[p]}: ${message}`);
    }
    const out = { checked, ok: !message, message };
    if (!only) lastRun[p] = { at: now(), ...out };
    return out;
  }

  const due: Record<Platform, number> = { twitch: 0, kick: 0 };
  // the allowed games changed: every channel is asked about again at the next tick
  ctx.settings.onChange((changes) => {
    if (changes.some((c) => c.key === 'streams.categories')) due.twitch = due.kick = 0;
  });
  let running = false;
  async function tick() {
    if (running || !ctx.enabled()) return;
    running = true;
    try {
      for (const p of PLATFORMS) {
        const every = num(p === 'twitch' ? 'streams.twitchReconcileSeconds' : 'streams.kickPollSeconds') * 1000;
        if (now() < due[p] || !ready(p)) continue;
        due[p] = now() + every;
        await reconcile(p);
      }
    } finally {
      running = false;
    }
  }
  const timer = ctx.timers === false ? undefined : setInterval(() => void tick().catch((err) => console.error('streamy:', (err as Error).message)), 15_000);
  timer?.unref?.();

  // ---------- linking ----------

  type Link = { uuid: string; platform: Platform; at: number; verifier?: string; result?: unknown; error?: string };
  const links = new Map<string, Link>();
  const sweep = () => {
    for (const [s, l] of links) if (now() - l.at > LINK_TTL_MS) links.delete(s);
  };

  async function finishLink(link: Link, code: string) {
    const p = link.platform;
    const c = p === 'twitch' ? client('twitch') : client('kick');
    if (!c) throw new ProviderError('not configured');
    const id = p === 'twitch' ? await (c as TwitchClient).identityFromCode(code, redirectUri(p)) : await (c as KickClient).identityFromCode(code, redirectUri(p), link.verifier ?? '');
    if (!store.link({ uuid: link.uuid, platform: p, subject: id.subject, login: id.login, name: id.name, linkedAt: now() })) {
      link.error = 'already_linked';
      return false;
    }
    link.result = { linked: true, streams: mine(link.uuid) };
    // its webhooks and whether it is live already, in the background
    const a = store.account(link.uuid, p)!;
    void (async () => {
      if (!a.subs.length) {
        if (p === 'twitch') await subscribeTwitch(a, c as TwitchClient);
        else await subscribeKick(a, c as KickClient);
      }
    })().catch((err) => console.error(`streamy: subskrypcja ${NAMES[p]}: ${(err as Error).message}`));
    void reconcile(p, [a]).catch(() => undefined);
    return true;
  }

  async function unlinkAccount(uuid: string, platform: Platform): Promise<StreamAccount | undefined> {
    const a = store.account(uuid, platform);
    if (!a) return undefined;
    const wasLive = !!store.live(platform, a.subject)?.live;
    store.unlink(uuid, platform);
    await unsubscribe(a);
    if (wasLive) fanOut(uuid, false);
    else ctx.push(uuid, { type: 'streams' });
    return a;
  }

  const platformOr404 = (raw: string): Platform => (PLATFORMS.includes(raw as Platform) ? (raw as Platform) : fail(404, 'not_found'));

  // ---------- the admin panel ----------

  function providerView(p: Platform) {
    const k = keysOf(p);
    return {
      id: p, name: NAMES[p], enabled: k.row.enabled, clientId: k.row.clientId, secretSet: !!k.row.secret, hint: k.row.hint, ready: !!ready(p),
      redirectUrl: redirectUri(p), webhookUrl: hookUrl(p), hookSecretSet: !!k.row.hookSecret, updatedAt: k.row.updatedAt || null,
      lastRun: lastRun[p], paused: gates[p].paused,
    };
  }

  function adminView() {
    return {
      keyReady: !!ctx.box, keyError: ctx.keyError ?? null, enabled: ctx.enabled(), webhooksPossible: webhooksPossible(),
      providers: PLATFORMS.map(providerView), live: store.liveCount(),
      accounts: store.all().slice(0, 1000).map((a) => {
        const l = store.live(a.platform, a.subject);
        return {
          uuid: a.uuid, handle: ctx.user(a.uuid)?.handle ?? '', platform: a.platform, login: a.login, name: a.name, url: channelUrl(a.platform, a.login), linkedAt: a.linkedAt,
          live: !!l?.live, title: l?.live ? l.title : '', viewers: l?.live ? l.viewers : 0, startedAt: l?.live ? l.startedAt : 0, updatedAt: l?.updatedAt ?? 0, webhooks: a.subs.length > 0,
        };
      }),
    };
  }

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/me\/streams$/, (req) => mine(ctx.authed(req))],
    // the launcher (or the site) opens the URL in the browser and asks /poll until it is done
    ['POST', /^\/v1\/me\/streams\/(\w+)\/start$/, (req, [raw]) => {
      const me = ctx.authed(req);
      const p = platformOr404(raw);
      ctx.limitLinks(`link:${me}`);
      const c = p === 'twitch' ? client('twitch') : client('kick');
      if (!c) fail(400, 'provider_disabled');
      sweep();
      const state = randomBytes(24).toString('base64url');
      const link: Link = { uuid: me, platform: p, at: now() };
      if (p === 'kick') {
        const { verifier, challenge } = pkce();
        link.verifier = verifier;
        links.set(state, link);
        return { state, url: (c as KickClient).authorizeUrl(state, redirectUri(p), challenge) };
      }
      links.set(state, link);
      return { state, url: (c as TwitchClient).authorizeUrl(state, redirectUri(p)) };
    }],
    ['GET', /^\/v1\/me\/streams\/poll$/, (req, _p, url) => {
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
    ['DELETE', /^\/v1\/me\/streams\/(\w+)$/, async (req, [raw]) => {
      const me = ctx.authed(req);
      const p = platformOr404(raw);
      if (!(await unlinkAccount(me, p))) fail(404, 'not_found');
      return mine(me);
    }],
    // { hide?: boolean, notify?: boolean }
    ['POST', /^\/v1\/me\/streams\/prefs$/, async (req) => {
      const me = ctx.authed(req);
      const b = await ctx.body(req);
      const was = store.prefs(me);
      const next = { hide: typeof b.hide === 'boolean' ? b.hide : was.hide, notify: typeof b.notify === 'boolean' ? b.notify : was.notify };
      store.setPrefs(me, next);
      // hidden or shown again: friends' badges follow at once (no notification)
      if (next.hide !== was.hide) fanOut(me, false);
      return mine(me);
    }],

    ['GET', /^\/v1\/admin\/streams$/, (req) => {
      ctx.admin(req);
      return adminView();
    }],
    // { enabled?, clientId?, clientSecret? ('' keeps it, null removes it) }; the secret is write-only
    ['POST', /^\/v1\/admin\/streams\/providers\/(\w+)$/, async (req, [raw]) => {
      const me = ctx.admin(req);
      const p = platformOr404(raw);
      const b = await ctx.body(req);
      const row = { ...store.provider(p) };
      const changed: string[] = [];
      if (typeof b.enabled === 'boolean' && b.enabled !== row.enabled) {
        row.enabled = b.enabled;
        changed.push(b.enabled ? 'włączony' : 'wyłączony');
      }
      if (typeof b.clientId === 'string' && b.clientId.trim() !== row.clientId) {
        const id = b.clientId.trim();
        if (id && !CLIENT_ID.test(id)) fail(400, 'bad_clientId');
        row.clientId = id;
        changed.push('Client ID');
      }
      if (b.clientSecret === null && row.secret) {
        row.secret = '';
        row.hint = '';
        changed.push('usunięto Client Secret');
      } else if (typeof b.clientSecret === 'string' && b.clientSecret.trim()) {
        const s = b.clientSecret.trim();
        if (!CLIENT_SECRET.test(s)) fail(400, 'bad_clientSecret');
        if (!ctx.box) fail(503, 'secret_key_missing');
        row.secret = ctx.box.seal(s, `streams:${p}:secret`);
        row.hint = s.slice(-4);
        changed.push('Client Secret');
      }
      // EventSub signs with a secret of ours: made once, sealed, never shown
      if (p === 'twitch' && !row.hookSecret && ctx.box && row.clientId) row.hookSecret = ctx.box.seal(randomBytes(32).toString('hex'), `streams:${p}:hook`);
      if (row.enabled && (!row.clientId || !row.secret)) fail(400, 'provider_not_configured');
      row.updatedAt = now();
      row.updatedBy = me;
      store.saveProvider(row);
      if (changed.length) ctx.audit(me, 'streams_provider', NAMES[p], changed.join(', '));
      // a new provider (or keys): channels are asked about soon
      due[p] = 0;
      return adminView();
    }],
    ['POST', /^\/v1\/admin\/streams\/providers\/(\w+)\/test$/, async (req, [raw]) => {
      const me = ctx.admin(req);
      const p = platformOr404(raw);
      const k = keysOf(p);
      if (!k.clientId || !k.clientSecret) fail(400, 'provider_not_configured');
      const c = p === 'twitch' ? twitchClient(k, { fetchImpl: ctx.fetchImpl, gate: gates.twitch, base: ctx.base?.twitch }) : kickClient(k, { fetchImpl: ctx.fetchImpl, gate: gates.kick, base: ctx.base?.kick });
      let res: { ok: boolean; message: string };
      try {
        await c.test();
        res = { ok: true, message: '' };
      } catch (err) {
        res = { ok: false, message: err instanceof RateLimited ? 'rate_limited' : (err as Error).message.slice(0, 200) };
      }
      ctx.audit(me, 'streams_test', NAMES[p], res.ok ? 'działa' : res.message);
      return res;
    }],
    // "Sprawdź teraz": both platforms at once, whatever the timer says
    ['POST', /^\/v1\/admin\/streams\/reconcile$/, async (req) => {
      const me = ctx.admin(req);
      const out: Record<string, unknown> = {};
      for (const p of PLATFORMS) if (ready(p)) out[p] = await reconcile(p);
      ctx.audit(me, 'streams_reconcile', 'Streamy', Object.entries(out).map(([p, r]) => `${p}: ${(r as { checked: number }).checked}`).join(', ') || 'brak operatorów');
      return { result: out, ...adminView() };
    }],
    ['DELETE', /^\/v1\/admin\/streams\/accounts\/([\w-]{1,64})\/(\w+)$/, async (req, [uuid, raw]) => {
      const me = ctx.admin(req);
      const p = platformOr404(raw);
      const a = await unlinkAccount(uuid, p);
      if (!a) fail(404, 'not_found');
      ctx.audit(me, 'streams_unlink', ctx.user(uuid)?.handle ?? uuid, `${NAMES[p]}: ${a.login}`);
      return adminView();
    }],
  ];

  // ---------- raw requests: the browser coming back, the webhooks ----------

  async function rawBody(req: http.IncomingMessage, max: number): Promise<Buffer | undefined> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > max) return undefined;
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  const answer = (res: http.ServerResponse, status: number, body = '', type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };

  /**
   * stream.online or channel.update: Helix says what is live now, with its game (the events alone
   * do not say both). When Helix cannot be asked, the reconcile decides later.
   */
  async function askTwitch(subject: string) {
    const c = client('twitch');
    if (!c) return;
    try {
      apply('twitch', subject, (await c.liveOf([subject]))[0]);
    } catch {
      // the next reconcile
    }
  }

  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const back = /^\/v1\/streams\/(twitch|kick)\/callback$/.exec(url.pathname);
    if (back && req.method === 'GET') {
      const p = back[1] as Platform;
      const state = url.searchParams.get('state') ?? '';
      const link = links.get(state);
      const code = url.searchParams.get('code');
      let ok = false;
      if (link && link.platform === p && now() - link.at <= LINK_TTL_MS && !link.result && !link.error && code) {
        try {
          ok = await finishLink(link, code);
        } catch (err) {
          console.error(`streamy: łączenie ${NAMES[p]}: ${(err as Error).message}`);
          link.error = 'provider_failed';
        }
      } else if (link && !link.result) link.error ??= url.searchParams.get('error') ? 'provider_denied' : 'provider_failed';
      answer(res, ok ? 200 : 400, linkPage(ok, NAMES[p], link?.error), 'text/html; charset=utf-8');
      return true;
    }

    if (req.method !== 'POST') return false;
    const twitchHook = url.pathname === '/v1/streams/twitch/eventsub';
    const kickHook = url.pathname === '/v1/streams/kick/webhook';
    if (!twitchHook && !kickHook) return false;
    try {
      ctx.limitWebhooks(`hook:${ctx.clientIp(req)}`);
    } catch {
      answer(res, 429);
      req.resume();
      return true;
    }
    const raw = await rawBody(req, 64 * 1024);
    if (!raw) {
      answer(res, 413);
      return true;
    }

    if (twitchHook) {
      const check = verifyEventSub(req.headers, raw, keysOf('twitch').hookSecret, now());
      if (!check.ok) {
        console.error(`streamy: odrzucony webhook Twitch (${check.reason})`);
        answer(res, 403);
        return true;
      }
      let msg: any;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        answer(res, 400);
        return true;
      }
      // Twitch asks once whether this is really us: its challenge back, as plain text
      if (check.type === 'webhook_callback_verification') {
        answer(res, 200, String(msg.challenge ?? ''));
        return true;
      }
      if (!store.firstTime(`twitch:${check.id}`, now())) {
        answer(res, 204);
        return true;
      }
      answer(res, 204);
      const subject = String(msg.event?.broadcaster_user_id ?? msg.subscription?.condition?.broadcaster_user_id ?? '');
      if (check.type === 'revocation') {
        // the subscription is gone (the user was banned, the app's access was revoked): the reconcile makes it again
        const a = store.bySubject('twitch', subject);
        if (a) store.setSubs(a.uuid, 'twitch', a.subs.filter((s) => s !== msg.subscription?.id));
        return true;
      }
      if (check.type !== 'notification' || !subject) return true;
      // started, or the game or title changed: whether it counts depends on the game, so Helix is asked
      if (msg.subscription?.type === 'stream.online' || msg.subscription?.type === 'channel.update') void askTwitch(subject);
      else if (msg.subscription?.type === 'stream.offline') apply('twitch', subject, undefined);
      return true;
    }

    // Kick: signed with Kick's key
    const c = client('kick');
    let pem = '';
    try {
      pem = c ? await c.publicKey(now()) : '';
    } catch (err) {
      console.error(`streamy: klucz Kick: ${(err as Error).message}`);
    }
    if (!pem) {
      answer(res, 503);
      return true;
    }
    const check = verifyKick(req.headers, raw, pem, now());
    if (!check.ok) {
      console.error(`streamy: odrzucony webhook Kick (${check.reason})`);
      answer(res, 403);
      return true;
    }
    if (!store.firstTime(`kick:${check.id}`, now())) {
      answer(res, 204);
      return true;
    }
    answer(res, 204);
    if (check.type !== 'livestream.status.updated' && check.type !== 'livestream.metadata.updated') return true;
    let msg: any;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return true;
    }
    const subject = String(msg.broadcaster?.user_id ?? '');
    const a = subject ? store.bySubject('kick', subject) : undefined;
    if (!a) return true;
    // ended: at once; started or changed (title, category): the channel asked with one call, as the game decides whether it counts
    if (check.type === 'livestream.status.updated' && msg.is_live === false) apply('kick', subject, undefined);
    else void reconcile('kick', [a]).catch(() => undefined);
    return true;
  }

  return {
    routes, serve, store, friendView, profileView, reconcile, apply, tick,
    close: () => timer && clearInterval(timer),
  };
}

function linkPage(ok: boolean, name: string, error?: string): string {
  const [icon, tone, title, text] = ok
    ? ['fa-solid fa-circle-check', 'ok', `Połączono ${name}`, 'Możesz zamknąć tę kartę i wrócić do SlashClient.']
    : error === 'already_linked'
      ? ['fa-solid fa-link-slash', 'warning', 'Ten kanał jest już połączony', 'Jest podpięty do innego konta SlashClient.']
      : ['fa-solid fa-circle-xmark', 'error', 'Nie udało się połączyć', 'Wróć do SlashClient i spróbuj ponownie.'];
  return sitePage({ lang: 'pl', icon, tone: tone as 'ok' | 'warning' | 'error', title, text });
}
