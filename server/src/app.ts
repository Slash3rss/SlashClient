import { decodePng, encodePng, faceOf } from './png.ts';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Db, type User } from './db.ts';
import { PROVIDERS, type DeviceStart, type Identity, type OAuthApp, type Provider, type ProviderId } from './oauth.ts';
import { cleanPresence, publicPresence, serverKeyOf, type Presence } from './presence.ts';
import { SprayLimit, cleanSpray } from './sprays.ts';
import { CAPE_NAMES, CAPES, EMOTES, ITEMS, SLOTS, capeSetting, framesFor, knownTo, mayWear, priceOf, supporterLevel, type Slot } from './cosmetics.ts';
import { adminRoutes } from './admin.ts';
import { partnerRoutes } from './partners.ts';
import { trackerRoutes } from './tracker.ts';
import { sharingRoutes } from './sharing.ts';
import { RequestLog, clientOf, maskIp, routeOf } from './requests.ts';
import { serveWeb, versioned } from './web.ts';
import { mediaRoutes, type MediaLimits } from './media.ts';
import { createDownloads, isDownloadOs } from './downloads.ts';
import { createCurseForge } from './curseforge.ts';
import { profileShareRoutes, type ShareLimits } from './profileShares.ts';
import { profileCloudRoutes, type CloudLimits } from './profileCloud.ts';
import { createAchievements, TICK_MS } from './achievements.ts';
import { achievementsAdminRoutes } from './achievementsAdmin.ts';
import { Wallet, economyRoutes } from './economy.ts';
import { createGroups } from './groups.ts';
import { createClans } from './clans.ts';
import { Storage, type DiskSpace } from './storage.ts';
import { storageAdminRoutes } from './storageAdmin.ts';
import { muteRoutes } from './mutes.ts';
import { chatImageRoutes, type ImageLimits } from './chatImages.ts';
import { DEFAULT_ELEMENTS, profileRoutes, type Visibility } from './profiles.ts';
import { legalRoutes } from './legal/routes.ts';
import { BurstLimiter, SlowDown, editRefusal, type BurstLimits } from './chatLimits.ts';
import { supportRoutes } from './payments/support.ts';
import { createCommunities } from './communities.ts';
import { COMMUNITY_LIMITS, type CommunityLimits } from './communityStore.ts';
import { Settings, liveSettings, type SettingValue } from './settings.ts';
import { SETTING_DEFS } from './settingsDefs.ts';
import { settingsAdminRoutes } from './settingsAdmin.ts';
import { disabledPage, featureKey, featuresFor } from './features.ts';
import { useBlocklist } from './clans.ts';
import { useLogoLimit } from './clanLogos.ts';
import { createRanks, gameBadge, type RankUser } from './ranks.ts';
import { createStreams } from './streams/streams.ts';
import type { KICK, TWITCH } from './streams/providers.ts';

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
  /** Profile pages and their pictures per address per minute (tests raise it). */
  profileViewsPerMinute?: number;
  /** GitHub repository with the launcher's releases, for /pobierz/<system> (owner/name). */
  releasesRepo?: string;
  /** Read access to that repository when it is private. */
  releasesToken?: string;
  /** CurseForge API key (CURSEFORGE_API_KEY) for the launcher's CurseForge searches; without it CurseForge is off. */
  curseforgeKey?: string;
  /** Folder for profiles shared by code (SHARES_DIR); default "profiles" next to the database. */
  sharesDir?: string;
  /** Size, time and quota of shared profiles (tests lower them). */
  shareLimits?: Partial<ShareLimits>;
  /** Folder for screenshots and clips shared by link (MEDIA_DIR); default "media" next to the database. */
  mediaDir?: string;
  /** Size, time and quota of shared screenshots and clips (tests lower them). */
  mediaLimits?: Partial<MediaLimits>;
  /** Folder for profiles kept on accounts (CLOUD_DIR); default "cloud-profiles" next to the database. */
  cloudDir?: string;
  /** Size and quota of profiles kept on accounts (tests lower them). */
  cloudLimits?: Partial<CloudLimits>;
  /** Where players' files are kept (storage.ts): the key that seals the buckets' keys, the disk's floor; tests swap the disk's numbers. */
  storage?: { secretKey?: string; minFreeBytes?: number; diskSpace?: DiskSpace; localHttp?: boolean };
  /** Folder for pictures sent in the chat (CHAT_IMAGES_DIR); default "chat-images" next to the database. */
  imagesDir?: string;
  /** Size, quota and time of chat pictures (tests lower them). */
  imageLimits?: Partial<ImageLimits>;
  /** The "draft" banner on the legal documents when an admin has not chosen one in the panel (LEGAL_DRAFT, on unless "0"). */
  legalDraft?: boolean;
  /** Messages in a row per conversation (chatLimits.ts; tests change it). */
  chatBurst?: Partial<BurstLimits>;
  /** Supporting the project with money (payments/support.ts): tests point the providers at fakes and set the clock. */
  payments?: { stripeApi?: string; paypalApi?: string; now?: () => number; checkoutsPerMinute?: number; refundsPerMinute?: number };
  /** Communities' limits (communityStore.ts; tests lower the members per community). */
  communityLimits?: Partial<CommunityLimits>;
  /** "Streamy" (streams/streams.ts): tests point Twitch and Kick at fakes, set the clock and stop the timer. */
  streams?: { twitch?: Partial<typeof TWITCH>; kick?: Partial<typeof KICK>; now?: () => number; timers?: boolean };
}

/** Names for the test sign-in: like Minecraft nicks. */
const VALID_NAME = /^\w{3,16}$/;
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
  /** Seconds to wait (a 429 'slow_down'): sent as Retry-After and in the body. */
  readonly retryAfter?: number;
  constructor(status: number, code: string, retryAfter?: number) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * A small token bucket per player and action, so one client cannot flood others. `rate` may be a
 * function (an admin panel's setting): read on every request, so a change applies at once.
 */
function rateLimiter(rate: number | (() => number)) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return (key: string) => {
    const perMinute = typeof rate === 'function' ? rate() : rate;
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
  // the admin panel's settings (settings.ts): the config's numbers (env, tests) are their defaults here
  const base: Record<string, SettingValue | undefined> = {
    'security.loginsPerMinute': cfg.loginsPerMinute,
    'profiles.viewsPerMinute': cfg.profileViewsPerMinute,
    'support.checkoutsPerMinute': cfg.payments?.checkoutsPerMinute,
    'support.refundsPerMinute': cfg.payments?.refundsPerMinute,
    'storage.minFreeMb': cfg.storage?.minFreeBytes !== undefined ? cfg.storage.minFreeBytes / (1024 * 1024) : undefined,
  };
  const take = (prefix: string, o: object | undefined, names: Record<string, string> = {}) => {
    for (const [k, v] of Object.entries(o ?? {})) if (typeof v === 'number') base[prefix + (names[k] ?? k)] = v;
  };
  take('media.', cfg.mediaLimits);
  take('cloud.', cfg.cloudLimits);
  take('shares.', cfg.shareLimits);
  take('chatImages.', cfg.imageLimits);
  take('communities.', cfg.communityLimits);
  take('chat.', cfg.chatBurst, { messages: 'burstMessages', seconds: 'burstSeconds', strikes: 'burstStrikes', muteSeconds: 'holdSeconds' });
  const settings = new Settings(db.sql, SETTING_DEFS, base);
  /** A rate limiter whose per-minute number is that setting. */
  const limiter = (key: string) => rateLimiter(() => settings.num(key));
  const sessionIdleMs = () => settings.num('security.sessionIdleDays') * 86_400_000;
  // the word lists and the logo's size are module-wide (clans and communities share them)
  useBlocklist(() => ({ words: settings.list('moderation.blockedWords'), tags: settings.list('moderation.blockedTags') }));
  useLogoLimit(() => settings.num('clans.logoBytes'));
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
  /** Who has a world open to LAN for friends (their launcher said so). */
  const lanHosts = new Set<string>();
  const presences = new Map<string, Presence>();
  const limitMessages = limiter('chat.messagesPerMinute');
  /** On top of that, a few in a row per conversation (chatLimits.ts): throws 429 'slow_down' with the seconds to wait. */
  const bursts = new BurstLimiter(liveSettings(settings, { messages: 'chat.burstMessages', seconds: 'chat.burstSeconds', strikes: 'chat.burstStrikes', muteSeconds: 'chat.holdSeconds' }));
  const limitBurst = (user: string, conversation: string) => {
    try {
      bursts.hit(user, conversation);
    } catch (err) {
      if (err instanceof SlowDown) throw new HttpError(429, 'slow_down', err.retryAfter);
      throw err;
    }
  };
  /** Edits and deletions of one's messages. */
  const limitEdits = limiter('chat.editsPerMinute');
  const limitRequests = limiter('chat.friendRequestsPerMinute');
  const limitLogins = limiter('security.loginsPerMinute');
  const editWindowMs = () => settings.num('chat.editWindowMinutes') * 60_000;
  /** Searching and installing a modpack asks a lot at once, but one address should not drain the key's quota. */
  const limitCurseForge = limiter('security.curseforgePerMinute');
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
  const limitGame = limiter('security.gamePerMinute');
  const limitEmotes = limiter('security.emotesPerMinute');
  /** Sprays: one every 3 seconds, 20 a minute, per account (the admin panel's settings). */
  const sprayLimit = new SprayLimit(() => settings.num('security.sprayGapSeconds') * 1000, () => settings.num('security.spraysPerMinute'));

  /** New accounts may be made (the admin panel's "Rejestracja nowych kont"); throws 503 feature_disabled when not. */
  function registrationOpen() {
    if (!settings.bool(featureKey('registration'))) throw new HttpError(503, 'feature_disabled');
  }

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

  /** One event to many accounts at once (a community's chat): serialised once, sent only to those connected (whichever set is smaller is walked). */
  function pushMany(users: ReadonlySet<string>, event: unknown) {
    let data: string | undefined;
    const send = (set: Set<WebSocket> | undefined) => {
      if (!set?.size) return;
      data ??= JSON.stringify(event);
      for (const ws of set) ws.send(data);
    };
    if (sockets.size < users.size) {
      for (const [id, set] of sockets) if (users.has(id)) send(set);
    } else for (const id of users) send(sockets.get(id));
  }

  // a feature switched or the banner changed: every launcher connected asks /v1/features again
  settings.onChange((changes) => {
    if (!changes.some((c) => c.key.startsWith('feature.') || c.key.startsWith('banner.'))) return;
    const data = JSON.stringify({ type: 'features' });
    for (const set of sockets.values()) for (const ws of set) ws.send(data);
  });

  function presenceOf(userId: string) {
    const user = db.user(userId);
    const presence = publicPresence(sockets.get(userId)?.size ? presences.get(userId) : undefined, user?.showServer ?? false, db.lastSeen(userId));
    // a world opened to LAN: friends can join it through the relay below
    return lanHosts.has(userId) && presence.status !== 'offline' ? { ...presence, lan: true } : presence;
  }

  function broadcastPresence(userId: string) {
    const presence = presenceOf(userId);
    for (const f of db.friends(userId)) push(f.id, { type: 'presence', id: userId, presence });
  }

  /** What a player in a game shows: the character's own set or the account's, only what they may still wear. */
  function wornBy(owner: User, character: string | undefined): Record<string, string> {
    const settings = db.cosmeticSettings();
    const granted = db.grants(owner.id);
    const badge = wearOf(owner);
    const own = character ? db.characterLoadout(owner.id, character) : null;
    const all = own ?? { ...owner.loadout, ...(owner.cape ? { cape: owner.cape } : {}) };
    const worn: Record<string, string> = {};
    const level = support.cosmeticsLevel(owner.id);
    for (const [slot, id] of Object.entries(all)) if (mayWear(settings, granted, id, slot as Slot, badge, level)) worn[slot] = id;
    return worn;
  }

  // ---- cosmetics changed: everyone who may see that player in a game hears it at once ----
  // (HUDs ask /v1/mc/lookup only every few minutes, so without this a new cape showed late)

  /** Changes in a burst (several slots clicked through) go out as one event. */
  const COSMETICS_COALESCE_MS = 300;
  const cosmeticsTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function cosmeticsChanged(userId: string) {
    if (cosmeticsTimers.has(userId)) return;
    const timer = setTimeout(() => {
      cosmeticsTimers.delete(userId);
      pushCosmetics(userId);
    }, COSMETICS_COALESCE_MS);
    timer.unref?.();
    cosmeticsTimers.set(userId, timer);
  }

  /** Launchers that may have this player in sight: their own, and those in a game on the same server. */
  function cosmeticsAudience(userId: string): Set<string> {
    const out = new Set([userId]);
    const where = presences.get(userId)?.activity;
    const server = where?.kind === 'server' ? serverKeyOf(where.server) : '';
    if (server) {
      for (const [other, p] of presences) {
        if (p.activity?.kind === 'server' && serverKeyOf(p.activity.server) === server) out.add(other);
      }
    } else {
      // a world opened to LAN, or a server whose address the launcher did not see: only friends in a game can be there
      for (const f of db.friends(userId)) {
        const kind = presences.get(f.id)?.activity?.kind;
        if (kind === 'server' || kind === 'singleplayer') out.add(f.id);
      }
    }
    return out;
  }

  function pushCosmetics(userId: string) {
    const owner = db.user(userId);
    if (!owner) return;
    const now = Date.now();
    // every Minecraft uuid this account plays as now (the online one and the offline-mode one), dashed as games write it
    const cosmetics: Record<string, Record<string, string>> = {};
    for (const [uuid, l] of linked) {
      if (l.user !== userId || now - l.at >= IN_GAME_TTL_MS) continue;
      const hex = uuid.replace(/-/g, '');
      cosmetics[`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`] = owner.banned ? {} : wornBy(owner, l.character);
    }
    const uuids = Object.keys(cosmetics);
    if (!uuids.length) return;
    const event = { type: 'cosmetics', uuids, cosmetics };
    for (const other of cosmeticsAudience(userId)) push(other, event);
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
    const userId = token && db.sessionUser(hashToken(token), sessionIdleMs());
    if (!userId) throw new HttpError(401, 'unauthorized');
    if (db.user(userId)?.banned) throw new HttpError(403, 'banned');
    (req as SeenRequest).slashUser = userId;
    return userId;
  }

  const configAdmins = new Set((cfg.adminHandles ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean));
  // the ranks: given in the admin panel, the admin role's and the supporters' (ranks.ts)
  const ranks = createRanks({
    sql: db.sql, authed, admin, body, user: (uuid) => db.user(uuid),
    isAdmin: (u) => u.role === 'admin' || configAdmins.has(u.handle.toLowerCase()),
    supporter: (uuid) => support.rank(uuid),
    changed: (uuid) => cosmeticsChanged(uuid),
    setting: (key) => settings.get(key),
    audit: (who, action, target, detail) => db.log(who, action, target, detail),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });
  /** The rank whose badge goes next to the nick ('' for none): the one the player picked, else the most important. */
  const badgeOf = (u: RankUser) => ranks.shown(u)?.id ?? '';
  /** Every rank the player holds: rank cosmetics are for any of them (admins may wear everything). */
  const wearOf = (u: RankUser) => ranks.wear(u);
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
    const muted = mutes.store.muted(me);
    return {
      friends: db.friends(me).map((f) => {
        const clan = clanTag(f.id);
        // the clan's logo (its id and version) next to the tag, when it has one
        const clanLogo = clan ? clans.logoOf(f.id) : undefined;
        // the rank badge they show next to their nick (ranks.ts); launchers before 0.9.23 ignore it
        const u = db.user(f.id);
        const shown = u ? ranks.shown(u) : undefined;
        const badgeRank = shown ? { id: shown.id, name: shown.name, nameEn: shown.nameEn, color: shown.color, ...(shown.icon ? { icon: shown.icon } : {}) } : undefined;
        // live on Twitch or Kick (streams.ts), unless they hide it; launchers before 0.9.24 ignore it
        const stream = streams.friendView(f.id);
        return { ...f, ...(stream ? { stream } : {}), presence: presenceOf(f.id), unread: unread[f.id] ?? 0, lastMessageAt: last[f.id] ?? 0, muted: muted.has(f.id), ...(clan ? { clan } : {}), ...(clanLogo ? { clanLogo } : {}), ...(badgeRank ? { badgeRank } : {}) };
      }),
      incoming: db.incoming(me),
      outgoing: db.outgoing(me),
    };
  }

  function meWithProviders(me: string) {
    const { banned: _banned, ...user } = db.user(me)!;
    const minecraft = db.minecraftAccounts(me);
    const choice = db.avatarChoice(me);
    return { ...user, providers: db.providers(me), minecraft, admin: isAdmin(me), badge: badgeOf(user), grants: db.grants(me), supporter: support.summary(me),
      // every rank held, the pick of the badge and the rank shown (ranks.ts)
      ...ranks.forMe(user),
      // the two avatars to pick from on the account page: the Minecraft face and the sign-in provider's picture
      // what is picked: 'provider', or the Minecraft account whose face it is (the first one unless another was picked)
      avatarSource: choice.source === 'provider' && choice.provider ? 'provider'
        : minecraft.some((m) => `mc:${m.uuid}` === choice.source) ? choice.source.slice(3) : minecraft[0]?.uuid ?? '',
      avatars: { minecraft: minecraft.map((m) => ({ uuid: m.uuid, name: m.name, url: `/v1/head/${m.uuid}` })), provider: choice.provider } };
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

  // achievements: play time from what this server sees (a launcher connected, its game reporting, in a world);
  // each pays sparks, spent in the shop (economy.ts)
  const wallet = new Wallet(db.sql);
  const achievements = createAchievements({
    sql: db.sql, wallet, push, authed, areFriends: (a, b) => db.areFriends(a, b),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
    playing: (now) => {
      const out = new Map<string, string | undefined>();
      for (const l of linked.values()) {
        const a = presences.get(l.user)?.activity;
        if (now - l.at >= IN_GAME_TTL_MS || !sockets.get(l.user)?.size || (a?.kind !== 'singleplayer' && a?.kind !== 'server')) continue;
        out.set(l.user, a.kind === 'server' ? a.server : undefined);
      }
      return out;
    },
  });

  // messages counted for achievements a day (the admin panel's setting)
  achievements.store.messages.capOf = () => settings.num('sparks.messagesPerDay');

  const limitReports = limiter('security.reportsPerMinute');
  const tracker = trackerRoutes({
    db, authed, isAdmin, body, clientIp, limit: limitReports, dir: path.join(path.dirname(cfg.dbFile), 'logs'),
    logDays: () => settings.num('logs.days'), maxLog: () => settings.num('logs.maxBytes'),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  const shares = profileShareRoutes({
    db, authed, clientIp, dir: cfg.sharesDir ?? path.join(path.dirname(cfg.dbFile), 'profiles'),
    limits: liveSettings(settings, { maxBytes: 'shares.maxBytes', days: 'shares.days', maxActive: 'shares.maxActive', quotaBytes: 'shares.quotaBytes' }),
    limitUploads: limiter('shares.uploadsPerMinute'), limitDownloads: limiter('shares.downloadsPerMinute'),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // the server's disk and the buckets the admin added, for screenshots, clips and profiles (storage.ts)
  const storage = new Storage({
    sql: db.sql, secretKey: cfg.storage?.secretKey, minFreeBytes: () => settings.num('storage.minFreeMb') * 1024 * 1024, diskSpace: cfg.storage?.diskSpace, localHttp: cfg.storage?.localHttp,
    localDirs: { media: cfg.mediaDir ?? path.join(path.dirname(cfg.dbFile), 'media'), cloud: cfg.cloudDir ?? path.join(path.dirname(cfg.dbFile), 'cloud-profiles') },
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // screenshots and clips shared by link, /media/<id> (media.ts)
  const media = mediaRoutes({
    sql: db.sql, storage, webDir: cfg.webDir, publicUrl: cfg.publicUrl, limitFactor: (u) => support.limitFactor(u),
    limits: liveSettings(settings, { imageBytes: 'media.imageBytes', clipBytes: 'media.clipBytes', days: 'media.days', maxActive: 'media.maxActive', quotaBytes: 'media.quotaBytes' }),
    authed, isAdmin, clientIp, limitUploads: limiter('media.uploadsPerMinute'), limitViews: limiter('media.viewsPerMinute'),
    audit: (who, action, target, detail) => db.log(who, action, target, detail),
    versioned: (html) => versioned(html, 'text/html'),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // profiles kept on the player's account, for their other computers (profileCloud.ts)
  const cloud = profileCloudRoutes({
    sql: db.sql, authed, storage, limitFactor: (u) => support.limitFactor(u),
    limits: liveSettings(settings, { maxBytes: 'cloud.maxBytes', maxProfiles: 'cloud.maxProfiles', quotaBytes: 'cloud.quotaBytes' }),
    limitUploads: limiter('cloud.uploadsPerMinute'), limitDownloads: limiter('cloud.downloadsPerMinute'),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // waypoints and parties shared with friends (sharing.ts)
  const sharing = sharingRoutes({
    db, authed, body, push, limitWaypoints: limiter('security.waypointsPerMinute'), limitParties: limiter('security.partiesPerMinute'),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // group chats and clans (groups.ts, clans.ts); a clan's chat is one of the groups
  const limitGroupChanges = limiter('groups.changesPerMinute');
  let clanTag: (uuid: string) => string | undefined = () => undefined;
  const groups = createGroups({
    db, authed, push, limitMessages, limitChanges: limitGroupChanges,
    clanTag: (clanId) => clans.tagOfClan(clanId),
    clanLogo: (clanId) => clans.logoOfClan(clanId),
    images: () => images,
    limitBurst, limitEdits, editWindowMs,
    limits: liveSettings(settings, { size: 'groups.size', maxGroups: 'groups.maxGroups' }),
    countMessage: (user) => achievements.store.messages.count(user),
    clanRole: (clanId, uuid) => clans.roleIn(clanId, uuid),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });
  const clans = createClans({
    db, authed, admin, body, push, groups, limitChanges: limitGroupChanges, limitLogos: limiter('clans.logosPerMinute'),
    limits: liveSettings(settings, { members: 'clans.maxMembers', invites: 'clans.maxInvites', nameMax: 'clans.nameMax' }),
    status: (userId) => presenceOf(userId).status,
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });
  clanTag = clans.tagOf;

  // communities: big groups with roles, a directory and a chat kept on the server (communities.ts)
  const communities = createCommunities({
    db, authed, admin, body, push, pushMany, clientIp, editWindowMs,
    limits: liveSettings(settings, Object.fromEntries(Object.keys(COMMUNITY_LIMITS).map((k) => [k, `communities.${k}`])) as Record<keyof CommunityLimits, string>),
    status: (userId) => presenceOf(userId).status,
    limitCreate: limiter('communities.createPerMinute'), limitJoin: limiter('communities.joinPerMinute'), limitChanges: limiter('communities.changesPerMinute'), limitLogos: limiter('communities.logosPerMinute'),
    limitMessages, limitEdits, limitBurst, limitReports: limiter('communities.reportsPerMinute'), limitViews: limiter('profiles.viewsPerMinute'),
    countMessage: (user) => achievements.store.messages.count(user),
    checkAchievements: (user) => achievements.check(user),
    sizeGoals: () => achievements.registry.active().filter((a) => a.group === 'community_size').map((a) => a.goal),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // muted friends (mutes.ts) and pictures in the chat (chatImages.ts)
  const mutes = muteRoutes({
    sql: db.sql, authed, body, push, friendList, areFriends: (a, b) => db.areFriends(a, b),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });
  const images = chatImageRoutes({
    sql: db.sql, authed, areFriends: (a, b) => db.areFriends(a, b), isGroupMember: (group, uuid) => groups.store.isMember(group, uuid), dir: cfg.imagesDir ?? path.join(path.dirname(cfg.dbFile), 'chat-images'),
    limits: Object.assign(liveSettings(settings, { maxBytes: 'chatImages.maxBytes', perDay: 'chatImages.perDay', bytesPerDay: 'chatImages.bytesPerDay', days: 'chatImages.days' }),
      cfg.imageLimits?.orphanMs !== undefined ? { orphanMs: cfg.imageLimits.orphanMs } : {}),
    limitUploads: limiter('chatImages.uploadsPerMinute'), limitDownloads: limiter('chatImages.downloadsPerMinute'), limitBurst,
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // supporting the project: tiers, checkouts at Stripe and PayPal, their webhooks (payments/support.ts)
  const support = supportRoutes({
    sql: db.sql, box: storage.box, keyError: storage.keyError, publicUrl: cfg.publicUrl,
    user: (id) => db.user(id), userByHandle: (h) => db.userByHandle(h),
    authed, admin, body, clientIp, limitCheckout: limiter('support.checkoutsPerMinute'), limitWebhooks: rateLimiter(600),
    limitRefunds: limiter('support.refundsPerMinute'), refundWindowDays: () => settings.num('support.refundWindowDays'), refundsPerDay: () => settings.num('support.refundsPerDay'), notify: (userId, event) => push(userId, event), isAdmin: (userId) => isAdmin(userId),
    audit: (who, action, target, detail) => db.log(who, action, target, detail),
    changed: (userId) => cosmeticsChanged(userId),
    fetchImpl: cfg.fetchImpl, apiBase: { stripe: cfg.payments?.stripeApi, paypal: cfg.payments?.paypalApi }, now: cfg.payments?.now,
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // public player profiles, /u/<handle>, with what the owner lets others see (profiles.ts)
  const profiles = profileRoutes({
    db, webDir: cfg.webDir, publicUrl: cfg.publicUrl, authed, admin, isAdmin, body, clientIp, limitViews: limiter('profiles.viewsPerMinute'),
    defaults: () => ({ visibility: settings.str('profiles.defaultVisibility') as Visibility, elements: { ...DEFAULT_ELEMENTS }, indexable: settings.bool('profiles.defaultIndexable') }),
    achievements: (uuid) => achievements.list(uuid),
    // the Iskry balance as a stats tile
    sparks: (uuid) => wallet.balance(uuid),
    worn: (user) => wornBy(user, undefined),
    badge: badgeOf,
    ranks: (user) => ranks.held(user).slice(0, settings.num('ranks.profileMax')),
    supporter: (uuid) => support.profileDecor(uuid),
    communities: (uuid) => communities.onProfile(uuid),
    streams: (uuid) => streams.profileView(uuid),
    embeds: () => settings.bool(featureKey('streams')),
    status: (uuid) => presenceOf(uuid).status,
    skinOf, headOf,
    audit: (who, action, target, detail) => db.log(who, action, target, detail),
    versioned: (html) => versioned(html, 'text/html'),
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // linked Twitch and Kick channels: live badges, notifications, the profile's stream (streams/streams.ts)
  const streams = createStreams({
    sql: db.sql, box: storage.box, keyError: storage.keyError, publicUrl: cfg.publicUrl, settings,
    enabled: () => settings.bool(featureKey('streams')),
    user: (uuid) => db.user(uuid), friends: (uuid) => db.friends(uuid).map((f) => f.id), mutedBy: (uuid) => mutes.store.muted(uuid), push: (uuid, event) => push(uuid, event),
    authed, admin, body, clientIp, limitLinks: limiter('streams.linksPerMinute'), limitWebhooks: limiter('streams.webhooksPerMinute'),
    audit: (who, action, target, detail) => db.log(who, action, target, detail),
    fetchImpl: cfg.fetchImpl, base: { twitch: cfg.streams?.twitch, kick: cfg.streams?.kick }, now: cfg.streams?.now, timers: cfg.streams?.timers,
    fail: (status, code) => {
      throw new HttpError(status, code);
    },
  });

  // the terms, the privacy policy and the support terms, edited in the admin panel (legal/routes.ts)
  const legal = legalRoutes({
    sql: db.sql, publicUrl: cfg.publicUrl, bannerDefault: cfg.legalDraft ?? true, authed, admin,
    createdAt: (uuid) => db.adminUser(uuid)?.createdAt ?? 0,
    audit: (who, action, target, detail) => db.log(who, action, target, detail),
    versioned: (html) => versioned(html, 'text/html'),
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
      const badge = user ? wearOf(user) : [];
      const known = knownTo(req.headers);
      const frames = framesFor(req.headers);
      const items = ITEMS.filter((i) => (capeSetting(settings, i.id).enabled || badge.includes('admin')) && known(i)).map((i) => ({
        id: i.id, slot: i.slot, name: i.name, rank: i.rank, frames: frames(i),
        exclusive: capeSetting(settings, i.id).exclusive, available: mayWear(settings, granted, i.id, i.slot, badge, me ? support.cosmeticsLevel(me) : 0),
        // supporters only, from this tier level (cosmetics.ts, or the admin panel's: supporterItems.ts)
        ...(supporterLevel(settings, i) ? { supporter: supporterLevel(settings, i) } : {}),
        // given by an achievement (as the admin set them now): which one, and how to get it
        ...achievements.rewardHint(i.id),
        // sold in the shop for sparks (items only the shop has come only to launchers that know it: `since`)
        ...(priceOf(settings, i.id) ? { price: priceOf(settings, i.id), owned: granted.includes(i.id) } : {}),
      }));
      return {
        // the launcher before 0.8 knows capes only
        capes: items.filter((i) => i.slot === 'cape').map(({ id, name, exclusive, available }) => ({ id, name, exclusive: exclusive || !!ITEMS.find((x) => x.id === id)?.rank, available })),
        items,
        emotes: EMOTES,
        ...(me ? { wallet: { balance: wallet.balance(me) } } : {}),
      };
    }],
    ['GET', /^\/v1\/health$/, () => ({ ok: true, providers: Object.keys(providers), dev: cfg.allowDevLogin })],

    // -- signing in --
    ['POST', /^\/v1\/auth\/dev$/, async (req) => {
      if (!cfg.allowDevLogin) throw new HttpError(404, 'provider_disabled');
      const { name } = await body(req);
      if (typeof name !== 'string' || !VALID_NAME.test(name)) throw new HttpError(400, 'bad_name');
      if (!db.owner('dev', name.toLowerCase())) registrationOpen();
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
      if (!owner) registrationOpen();
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
      const { showServer, cape, loadout, character, own, avatarSource } = await body(req);
      // the avatar: the Minecraft face (the default) or the sign-in provider's picture
      // avatarSource: 'provider', or the uuid of one of the account's Minecraft accounts ('minecraft' = the first)
      if (avatarSource !== undefined) {
        const mc = typeof avatarSource === 'string' ? avatarSource.toLowerCase().replace(/-/g, '') : '';
        if (avatarSource === 'provider') db.setAvatarSource(me, 'provider');
        else if (avatarSource === 'minecraft') db.setAvatarSource(me, '');
        else if (db.minecraftAccounts(me).some((m) => m.uuid === mc)) db.setAvatarSource(me, `mc:${mc}`);
        else throw new HttpError(400, 'bad_request');
      }
      if (typeof showServer === 'boolean') {
        db.setShowServer(me, showServer);
        broadcastPresence(me);
      }
      const badge = wearOf(db.user(me)!);
      const level = support.cosmeticsLevel(me);
      // one Minecraft account's own set: { character, cape?, loadout? }; { character, own: false } goes back to the account's
      if (character !== undefined) {
        const subject = typeof character === 'string' ? character.toLowerCase().replace(/-/g, '') : '';
        if (!db.minecraftAccounts(me).some((m) => m.uuid === subject)) throw new HttpError(403, 'not_linked');
        if (own === false) {
          db.setCharacterLoadout(me, subject, null);
          cosmeticsChanged(me);
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
          else if (mayWear(settings, granted, id, slot as Slot, badge, level)) next[slot] = id;
          else throw new HttpError(400, slot === 'cape' ? 'bad_cape' : 'bad_item');
        }
        db.setCharacterLoadout(me, subject, next);
        cosmeticsChanged(me);
        return meWithProviders(me);
      }
      if (cape !== undefined) {
        if (cape !== '' && !mayWear(db.cosmeticSettings(), db.grants(me), cape as string, 'cape', badge, level)) throw new HttpError(400, 'bad_cape');
        db.setCape(me, cape as string);
        cosmeticsChanged(me);
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
          else if (mayWear(settings, granted, id, slot as Slot, badge, level)) next[slot] = id;
          else throw new HttpError(400, 'bad_item');
        }
        db.setLoadout(me, next);
        cosmeticsChanged(me);
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
        achievements.check(me);
        achievements.check(other.id);
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
      achievements.check(me);
      achievements.check(from);
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
      mutes.store.forget(me, other);
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
      const { uuids, knownRanks } = await body(req);
      // the pink friend came in 0.9.12, the supporter and any rank in its colour ('colors') in 0.9.23: older HUDs get what they know (ranks.ts)
      const known = Array.isArray(knownRanks) ? knownRanks.filter((k): k is string => typeof k === 'string') : [];
      if (!Array.isArray(uuids) || uuids.length > 250) throw new HttpError(400, 'bad_request');
      const now = Date.now();
      const active = uuids.filter((u): u is string => typeof u === 'string' && now - (inGame.get(u.toLowerCase()) ?? 0) < IN_GAME_TTL_MS);
      // the capes of players whose launcher said which account they play as
      const capes: Record<string, string> = {};
      // the logo's colour: only for a Minecraft account proven to be that SlashClient account's own
      const rankOf: Record<string, string> = {};
      // everything the player wears; HUDs before 0.8 read only `capes`
      const cosmetics: Record<string, Record<string, string>> = {};
      // the clan tag next to the name ([ABC]); HUDs before clans ignore it
      const clanTags: Record<string, string> = {};
      // and its logo, when it has one (clan id and version, for /v1/clans/<id>/logo.png?v=)
      const clanLogos: Record<string, { id: string; v: number }> = {};
      // a supporter's logo in their tier's colour; HUDs before 0.9.23 show the white one
      const supporterColors: Record<string, string> = {};
      // the shown rank's colour, for HUDs from 0.9.23 (any rank, also ones made in the admin panel)
      const badgeColors: Record<string, string> = {};
      // live on Twitch or Kick with an allowed game, not hidden (streams.ts): "● NA ŻYWO" above the head, for HUDs that know it ('live', 0.9.24+)
      const live: Record<string, { platform: string }> = {};
      const wantsLive = known.includes('live');
      for (const u of active) {
        const link = linked.get(u.toLowerCase());
        const owner = link && now - link.at < IN_GAME_TTL_MS ? db.user(link.user) : undefined;
        if (!owner || owner.banned) continue;
        const held = ranks.held(owner);
        const badge = gameBadge(ranks.shown(owner, held), held, known);
        if (badge) rankOf[u] = badge.rank;
        if (badge?.color) badgeColors[u] = badge.color;
        if (badge?.supporterColor) supporterColors[u] = badge.supporterColor;
        // only what the player may still wear: the admin may have switched it off, or the rank may be gone
        const worn = wornBy(owner, link?.character);
        if (worn.cape) capes[u] = worn.cape;
        if (Object.keys(worn).length) cosmetics[u] = worn;
        const tag = clanTag(owner.id);
        if (tag) clanTags[u] = tag;
        const logo = tag ? clans.logoOf(owner.id) : undefined;
        if (logo) clanLogos[u] = logo;
        const stream = wantsLive ? streams.friendView(owner.id) : undefined;
        if (stream) live[u] = { platform: stream.platform };
      }
      return { active, capes, ranks: rankOf, cosmetics, ...(Object.keys(clanTags).length ? { clans: clanTags } : {}), ...(Object.keys(clanLogos).length ? { clanLogos } : {}), ...(Object.keys(supporterColors).length ? { supporterColors } : {}),
        ...(Object.keys(badgeColors).length ? { badgeColors } : {}), ...(Object.keys(live).length ? { live } : {}) };
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
        const server = serverKeyOf(where.server);
        for (const [other, p] of presences) {
          if (other !== me && p.activity?.kind === 'server' && serverKeyOf(p.activity.server) === server) push(other, event);
        }
      }
      return { ok: true };
    }],

    // a spray on a block: passed on to the launchers of players who may be there to see it (sprays.ts)
    ['POST', /^\/v1\/mc\/spray$/, async (req) => {
      const me = authed(req);
      const spray = cleanSpray(await body(req));
      if (!spray) throw new HttpError(400, 'bad_request');
      const link = linked.get(spray.uuid);
      if (link?.user !== me || Date.now() - link.at >= IN_GAME_TTL_MS) throw new HttpError(403, 'not_linked');
      // only the spray that player wears now (an admin may have switched it off since)
      if (wornBy(db.user(me)!, link.character).spray !== spray.spray) throw new HttpError(403, 'not_worn');
      if (!sprayLimit.allow(me)) throw new HttpError(429, 'rate_limited');
      const event = { type: 'spray', ...spray, at: Date.now() };
      for (const other of cosmeticsAudience(me)) if (other !== me) push(other, event);
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
      // how long one's own messages may be edited (server 0.9.23+; without it the clients offer no editing)
      return { messages: images.decorate(db.conversation(me, other, limit, before)), editWindowMs: editWindowMs() };
    }],
    ['POST', /^\/v1\/messages\/([\w-]+)$/, async (req, [other]) => {
      const me = authed(req);
      friendOrThrow(me, other);
      limitMessages(me);
      const { text, image } = await body(req);
      // a picture's message was counted with its upload
      if (image === undefined) limitBurst(me, `d:${other}`);
      if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'empty');
      // an encrypted message is longer than its text (the launcher keeps the text itself to MAX_MESSAGE)
      const encrypted = text.startsWith('e2e1:');
      if (text.length > (encrypted ? MAX_ENCRYPTED : MAX_MESSAGE)) throw new HttpError(400, 'too_long');
      if (encrypted && !/^e2e1:[A-Za-z0-9+/=]+$/.test(text)) throw new HttpError(400, 'bad_request');
      // a picture uploaded just before (POST /v1/images/<friend>), with its key encrypted like the text
      const picture = images.forMessage(me, other, image);
      if (picture && !encrypted) throw new HttpError(400, 'bad_image');
      const plain = db.addMessage(me, other, text.trim());
      if (picture) images.attach(picture, plain.id);
      const message = picture ? { ...plain, image: picture } : plain;
      push(other, { type: 'message', message });
      push(me, { type: 'message', message }); // the player's other launchers
      achievements.store.messages.count(me);
      achievements.check(me);
      return { message };
    }],
    // the author changes their text within EDIT_WINDOW_MS, encrypted again like a new one (not pictures, invites or waypoints)
    ['POST', /^\/v1\/messages\/([\w-]+)\/(\d{1,15})\/edit$/, async (req, [other, raw]) => {
      const me = authed(req);
      friendOrThrow(me, other);
      limitEdits(me);
      const old = db.messageBetween(me, other, Number(raw));
      if (!old) throw new HttpError(404, 'not_found');
      const refusal = editRefusal(old, me, !!old.invite || !!old.waypoint || images.has(old.id), Date.now(), editWindowMs());
      if (refusal) throw new HttpError(...refusal);
      const { text } = await body(req);
      if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'empty');
      const encrypted = text.startsWith('e2e1:');
      if (text.length > (encrypted ? MAX_ENCRYPTED : MAX_MESSAGE)) throw new HttpError(400, 'too_long');
      // an encrypted message stays encrypted
      if ((encrypted && !/^e2e1:[A-Za-z0-9+/=]+$/.test(text)) || (old.text.startsWith('e2e1:') && !encrypted)) throw new HttpError(400, 'bad_request');
      db.editMessage(old.id, text.trim());
      const message = db.messageBetween(me, other, old.id)!;
      push(other, { type: 'message-edit', message });
      push(me, { type: 'message-edit', message });
      return { message };
    }],
    // the author takes a message back, for both: no text stays, its picture goes too
    ['DELETE', /^\/v1\/messages\/([\w-]+)\/(\d{1,15})$/, async (req, [other, raw]) => {
      const me = authed(req);
      friendOrThrow(me, other);
      limitEdits(me);
      const old = db.messageBetween(me, other, Number(raw));
      if (!old) throw new HttpError(404, 'not_found');
      if (old.from !== me) throw new HttpError(403, 'not_author');
      if (old.deleted) return { message: old };
      db.deleteMessage(old.id);
      await images.remove(old.id);
      const message = db.messageBetween(me, other, old.id)!;
      push(other, { type: 'message-delete', message });
      push(me, { type: 'message-delete', message });
      return { message };
    }],
    // "join me": a server address (and the game version) as a message with a Join button
    ['POST', /^\/v1\/invites\/([\w-]+)$/, async (req, [other]) => {
      const me = authed(req);
      friendOrThrow(me, other);
      limitMessages(me);
      const { server, version } = await body(req);
      if (typeof server !== 'string' || !SERVER_ADDRESS.test(server)) throw new HttpError(400, 'bad_server');
      limitBurst(me, `d:${other}`);
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
    ...achievements.routes,
    ...economyRoutes({
      db, wallet, authed, admin, body, push,
      label: (reason, ref) => {
        const a = reason === 'achievement' ? achievements.registry.get(ref) : undefined;
        const name = reason === 'purchase' ? CAPE_NAMES[ref] ?? ref : '';
        return a ? { label: a.name, labelEn: a.nameEn || a.name } : { label: name, labelEn: name };
      },
      bought: (userId) => achievements.check(userId),
      keepWorn: (id) => {
        const who = db.wearers(id);
        for (const uuid of who) db.grant(uuid, id);
        return who.length;
      },
      fail: (status, code) => {
        throw new HttpError(status, code);
      },
    }),
    ...tracker.routes,
    ...shares.routes,
    ...media.routes,
    ...cloud.routes,
    ...sharing.routes,
    ...groups.routes,
    ...clans.routes,
    ...communities.routes,
    ...storageAdminRoutes({
      storage, admin, body, dataDir: path.dirname(cfg.dbFile),
      audit: (who, action, target, detail) => db.log(who, action, target, detail),
      fail: (status, code) => {
        throw new HttpError(status, code);
      },
    }),
    ...mutes.routes,
    ...images.routes,
    // the achievement creator and how each cosmetic can be got (achievementsAdmin.ts)
    ...achievementsAdminRoutes({
      db, wallet, achievements, admin, body, push,
      fail: (status, code) => {
        throw new HttpError(status, code);
      },
    }),
    ...profiles.routes,
    ...ranks.routes,
    ...support.routes,
    ...legal.routes,
    ...streams.routes,
    // the admin panel's settings, the feature switches and the banner (settingsAdmin.ts)
    ...settingsAdminRoutes({
      settings, admin, body, handleOf: (id) => db.user(id)?.handle ?? '',
      audit: (who, action, target, detail) => db.log(who, action, target, detail),
      fail: (status, code) => {
        throw new HttpError(status, code);
      },
    }),
    ...adminRoutes({
      db, admin, body, kick, configAdmins, cosmeticsChanged, supporterLevel: (id) => support.cosmeticsLevel(id), badge: wearOf,
      setRank: (id, rank, by) => ranks.setOnly(id, rank, by),
      ranksOf: (id) => {
        const u = db.user(id);
        return u ? ranks.held(u).map((h) => h.id) : [];
      },
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

  /** The face cut out of a player's skin, kept with the skin (an hour). */
  const heads = new Map<string, Buffer>();
  async function headOf(uuid: string): Promise<Buffer | undefined> {
    const skin = await skinOf(uuid);
    if (!skin) return undefined;
    const kept = heads.get(uuid + skin.data.length);
    if (kept) return kept;
    const face = encodePng(faceOf(decodePng(skin.data)));
    if (heads.size > 2000) heads.clear();
    heads.set(uuid + skin.data.length, face);
    return face;
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');

    // a feature the admin switched off (features.ts): its endpoints say so, its pages too
    const feature = featuresFor(req.method ?? 'GET', url.pathname, (id) => groups.store.group(id)?.clan).find((f) => !settings.bool(featureKey(f)));
    if (feature) {
      (req as SeenRequest).slashError = 'feature_disabled';
      if (url.pathname.startsWith('/v1/')) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'feature_disabled', feature }));
      } else {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(disabledPage());
      }
      req.resume();
      return;
    }

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

    // a Minecraft player's face (with the hat), 64×64: the default avatar of SlashClient accounts
    const head = /^\/v1\/head\/([0-9a-fA-F-]{32,36})$/.exec(url.pathname);
    if (req.method === 'GET' && head) {
      const face = await headOf(head[1].replace(/-/g, '').toLowerCase()).catch(() => undefined);
      if (!face) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' });
      res.end(face);
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

    // CurseForge for the launcher, with the server's key (see curseforge.ts)
    const cf = /^\/v1\/curseforge(\/[\w/]*)$/.exec(url.pathname);
    if (cf) {
      let answer;
      try {
        limitCurseForge(clientIp(req));
        answer = await curseforge.request(req.method ?? 'GET', cf[1], url.searchParams, req.method === 'POST' ? await body(req) : undefined);
      } catch (err) {
        const known = err instanceof HttpError;
        if (!known) console.error(err);
        answer = { status: known ? err.status : 500, body: JSON.stringify({ error: known ? err.code : 'server_error' }) };
      }
      if (answer.status !== 200) (req as SeenRequest).slashError = JSON.parse(answer.body).error ?? String(answer.status);
      res.writeHead(answer.status, { 'Content-Type': 'application/json' });
      res.end(answer.body);
      return;
    }

    // a shared profile's file: not JSON, so not one of the routes
    try {
      if (await shares.serve(req, res, url)) return;
      if (await cloud.serve(req, res, url)) return;
      if (await images.serve(req, res, url)) return;
      if (clans.serveLogo(req, res, url)) return;
      if (communities.serveLogo(req, res, url)) return;
      if (ranks.serveIcon(req, res, url)) return;
    } catch (err) {
      console.error('profil:', (err as Error).message);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server_error' }));
      return;
    }

    // a player's profile page, its pictures and the sitemap of profiles (profiles.ts)
    try {
      if (await profiles.serve(req, res, url)) return;
    } catch (err) {
      console.error('profil gracza:', (err as Error).message);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server_error' }));
      return;
    }

    // the payment providers' webhooks (raw bodies, for their signatures) and PayPal's way back
    try {
      if (await support.serve(req, res, url)) return;
    } catch (err) {
      console.error('wsparcie:', (err as Error).message);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server_error' }));
      return;
    }

    // the legal documents' pages, from the database
    if (legal.serve(req, res, url)) return;

    // Twitch and Kick: the browser back from linking a channel, and the platforms' webhooks (raw bodies, for their signatures)
    try {
      if (await streams.serve(req, res, url)) return;
    } catch (err) {
      console.error('streamy:', (err as Error).message);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server_error' }));
      return;
    }

    // a shared screenshot or clip: its file, and its page with the preview
    try {
      if (await media.serve(req, res, url)) return;
    } catch (err) {
      console.error('media:', (err as Error).message);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server_error' }));
      return;
    }

    for (const [method, pattern, fn] of routes) {
      const m = pattern.exec(url.pathname);
      if (!m || method !== req.method) continue;
      try {
        const result = await fn(req, m.slice(1), url);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result ?? null));
        // what it did may unlock an achievement (a screenshot shared, a party, a group…)
        try {
          achievements.after(method, url.pathname, (req as SeenRequest).slashUser);
        } catch (err) {
          console.error('osiągnięcia:', (err as Error).message);
        }
      } catch (err) {
        const known = err instanceof HttpError;
        if (!known) console.error(err);
        (req as SeenRequest).slashError = known ? err.code : 'server_error';
        const wait = known && err.retryAfter ? err.retryAfter : undefined;
        res.writeHead(known ? err.status : 500, { 'Content-Type': 'application/json', ...(wait ? { 'Retry-After': String(wait) } : {}) });
        res.end(JSON.stringify({ error: known ? err.code : 'server_error', ...(wait ? { retryAfter: wait } : {}) }));
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

  const curseforge = createCurseForge({ apiKey: cfg.curseforgeKey, fetchImpl: cfg.fetchImpl ?? fetch });
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

  // two WebSocket endpoints on one server: each upgrade goes to its own
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  const lanWss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
  server.on('upgrade', (req, socket, head) => {
    const at = new URL(req.url ?? '/', 'http://x').pathname;
    const to = at === '/v1/ws' ? wss : at === '/v1/lan' ? lanWss : undefined;
    if (!to) return socket.destroy();
    to.handleUpgrade(req, socket, head, (ws) => to.emit('connection', ws, req));
  });
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
        const userId = msg.type === 'auth' && typeof msg.token === 'string' ? db.sessionUser(hashToken(msg.token), sessionIdleMs()) : undefined;
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
        // achievements reached before they existed (friends, messages) come with the first connection
        achievements.check(me);
        return;
      }
      // a connection that floods (presence or typing many times a second) is only ignored, friends are not spammed
      if (!socketLimit(ws)) return;
      if (msg.type === 'presence') {
        const presence = cleanPresence(msg.presence);
        if (!presence) return;
        presences.set(me, presence);
        broadcastPresence(me);
      } else if (msg.type === 'lan' && typeof msg.open === 'boolean') {
        const was = lanHosts.has(me);
        if (msg.open) lanHosts.add(me);
        else lanHosts.delete(me);
        if (was !== msg.open) broadcastPresence(me);
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
        lanHosts.delete(me);
        db.touch(me);
        broadcastPresence(me);
      }
    });
  });
  // ---- WebSocket: /v1/lan, a friend joining a world opened to LAN ----
  //
  // The joining launcher connects with { type: 'join', token, host }; the host's launcher is told
  // over /v1/ws ('lan-connect') and connects with { type: 'accept', token, id }. Then each side's
  // binary messages go to the other: one Minecraft connection, carried through here, so nobody has
  // to open a port. Only friends, and only to a world that is open.

  const pendingLan = new Map<string, { joiner: WebSocket; host: string; timer: ReturnType<typeof setTimeout> }>();
  const tunnels = new Map<string, number>();
  const LAN_TUNNELS = 16;
  const tunnelCount = (user: string, by: number) => {
    const n = (tunnels.get(user) ?? 0) + by;
    if (n > 0) tunnels.set(user, n);
    else tunnels.delete(user);
  };
  function pair(a: WebSocket, b: WebSocket, users: string[]) {
    for (const u of users) tunnelCount(u, 1);
    let open = true;
    const end = () => {
      if (!open) return;
      open = false;
      for (const u of users) tunnelCount(u, -1);
      a.close();
      b.close();
    };
    for (const [from, to] of [[a, b], [b, a]] as const) {
      from.on('message', (data, binary) => {
        if (binary && to.readyState === to.OPEN) to.send(data, { binary: true });
      });
      from.on('close', end);
      from.on('error', end);
    }
    a.send(JSON.stringify({ type: 'ok' }));
    b.send(JSON.stringify({ type: 'ok' }));
  }
  lanWss.on('connection', (ws) => {
    const timer = setTimeout(() => ws.close(4001, 'auth timeout'), 10_000);
    ws.once('message', (raw) => {
      clearTimeout(timer);
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return ws.close(4000, 'bad');
      }
      const me = typeof msg.token === 'string' ? db.sessionUser(hashToken(msg.token), sessionIdleMs()) : undefined;
      if (!me || db.user(me)?.banned) return ws.close(4001, 'unauthorized');
      if (msg.type === 'join' && typeof msg.host === 'string') {
        const host = msg.host;
        if (!db.areFriends(me, host) || !lanHosts.has(host)) return ws.close(4003, 'not_open');
        if ((tunnels.get(me) ?? 0) >= LAN_TUNNELS || (tunnels.get(host) ?? 0) >= LAN_TUNNELS) return ws.close(4029, 'too_many');
        const id = randomBytes(12).toString('base64url');
        pendingLan.set(id, { joiner: ws, host, timer: setTimeout(() => {
          pendingLan.delete(id);
          ws.close(4004, 'no_answer');
        }, 15_000) });
        ws.once('close', () => pendingLan.delete(id));
        push(host, { type: 'lan-connect', id, from: me });
      } else if (msg.type === 'accept' && typeof msg.id === 'string') {
        const p = pendingLan.get(msg.id);
        if (!p || p.host !== me || p.joiner.readyState !== p.joiner.OPEN) return ws.close(4004, 'gone');
        pendingLan.delete(msg.id);
        clearTimeout(p.timer);
        pair(p.joiner, ws, [me]);
      } else ws.close(4000, 'bad');
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
  const playTick = setInterval(() => achievements.tick(), TICK_MS);
  // achievements from before the sparks get paid, and ones already reached in the data unlock (once; safe on every start)
  const backfilled = achievements.backfill();
  if (backfilled.paid || backfilled.unlocked) console.log(`osiągnięcia: wypłacono ${backfilled.paid}, odblokowano ${backfilled.unlocked}`);
  // shared logs past their time, once an hour
  const logCleanup = setInterval(() => {
    void tracker.cleanup().catch((err) => console.error('logi:', (err as Error).message));
    void shares.cleanup().catch((err) => console.error('profile:', (err as Error).message));
    void media.cleanup().catch((err) => console.error('media:', (err as Error).message));
    void cloud.cleanup().catch((err) => console.error('chmura:', (err as Error).message));
    void images.cleanup().catch((err) => console.error('obrazy czatu:', (err as Error).message));
  }, 3_600_000);

  return {
    server,
    /** For tests: play-time ticks with a chosen clock. */
    achievements,
    /** For tests: the database (data from before an update) and the sparks. */
    db,
    wallet,
    /** For tests: the storage backends, and the hourly cleanup of screenshots, clips and profiles run now. */
    storage,
    cleanupFiles: async (now = Date.now()) => {
      await media.cleanup(now);
      await cloud.cleanup(now);
    },
    /** For tests: dropping old chat pictures with a chosen clock. */
    chatImages: images,
    /** For tests: the profiles' settings. */
    profiles,
    /** For tests: the supporters' tiers and payments. */
    support,
    /** For tests: the communities' data. */
    communities,
    /** For tests: the admin panel's settings. */
    settings,
    /** For tests: linked channels, the live state and the reconcile. */
    streams,
    close: () => new Promise<void>((resolve) => {
      clearInterval(heartbeat);
      clearInterval(playTick);
      clearInterval(logCleanup);
      streams.close();
      for (const timer of cosmeticsTimers.values()) clearTimeout(timer);
      cosmeticsTimers.clear();
      for (const ws of wss.clients) ws.terminate();
      for (const ws of lanWss.clients) ws.terminate();
      wss.close();
      lanWss.close();
      server.close(() => {
        // the module-wide lists go back to the code's (another app in the same process starts clean)
        useBlocklist();
        useLogoLimit();
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
