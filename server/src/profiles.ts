import { readFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DAY_MIN_SECONDS } from './achievements.ts';
import { ClanLogoStore } from './clanLogos.ts';
import { ClanStore } from './clans.ts';
import { CAPE_NAMES } from './cosmetics.ts';
import type { Db, User } from './db.ts';

/**
 * Public player profiles: /u/<handle> on the website and GET /v1/profiles/<handle> for the pages,
 * the launcher and anything else. A profile shows what the server itself knows (play time from
 * achievements.ts, achievements, the cosmetics worn, the clan, the linked Minecraft accounts…),
 * never a number a client sent.
 *
 * The owner decides who sees it (everyone, friends only, nobody) and which parts; the server
 * leaves out everything else, so a page or a client never gets what it may not show. The owner and
 * admins always see the whole profile; an admin may hide one (moderation, in the admin log), and a
 * hidden profile is "not found" for everyone else, like one that does not exist.
 *
 * Achievements are read through the adapter in `ProfileDeps` (achievements.ts's list), so changes
 * there (new kinds, secret ones) only touch app.ts's wiring; clans and their logos straight from their stores.
 */

export type Visibility = 'public' | 'friends' | 'private';
export const VISIBILITIES: Visibility[] = ['public', 'friends', 'private'];

/** The parts of a profile the owner can show or hide one by one. */
export const ELEMENTS = ['stats', 'achievements', 'cosmetics', 'clan', 'minecraft', 'servers', 'lastOnline', 'friends'] as const;
export type Element = (typeof ELEMENTS)[number];

/**
 * What a profile shows before the owner changes anything: visible to everyone (players expect a
 * profile link to work), with the parts that say where and when someone plays (the servers they
 * visited, when they were last online) left out until the owner turns them on, and kept out of
 * search engines until they allow that too.
 */
export const DEFAULT_ELEMENTS: Record<Element, boolean> = {
  stats: true, achievements: true, cosmetics: true, clan: true, minecraft: true, servers: false, lastOnline: false, friends: true,
};
export interface Privacy { visibility: Visibility; elements: Record<Element, boolean>; indexable: boolean }
export const DEFAULT_PRIVACY: Privacy = { visibility: 'public', elements: { ...DEFAULT_ELEMENTS }, indexable: false };

export interface Moderation { hidden: boolean; reason: string; by: string; at: number }

/** Who is looking: nobody signed in, a signed-in player who is not a friend, a friend, the owner, an admin. */
export type Viewer = 'anonymous' | 'stranger' | 'friend' | 'self' | 'admin';

export type Access =
  | { ok: true; elements: Set<Element>; full: boolean }
  | { ok: false; error: 'not_found' | 'profile_private' | 'profile_friends_only' };

/**
 * What a viewer gets of a profile. The owner and admins: everything (`full`). A hidden or banned
 * account is not found for the rest; a private profile is closed to them, a friends-only one to
 * all but friends; the others see the parts the owner left on.
 */
export function access(privacy: Privacy, moderation: { hidden: boolean }, banned: boolean, viewer: Viewer): Access {
  if (viewer === 'admin' || (viewer === 'self' && !banned)) return { ok: true, elements: new Set(ELEMENTS), full: true };
  if (moderation.hidden || banned) return { ok: false, error: 'not_found' };
  if (privacy.visibility === 'private') return { ok: false, error: 'profile_private' };
  if (privacy.visibility === 'friends' && viewer !== 'friend') return { ok: false, error: 'profile_friends_only' };
  return { ok: true, elements: new Set(ELEMENTS.filter((e) => privacy.elements[e])), full: false };
}

/** Whether search engines may list a profile: open to everyone, the owner allowed it, not hidden. */
export const indexable = (privacy: Privacy, moderation: { hidden: boolean }, banned: boolean) =>
  privacy.visibility === 'public' && privacy.indexable && !moderation.hidden && !banned;

/** Settings from a request; what is missing or wrong keeps its current value. */
export function cleanPrivacy(input: Record<string, unknown>, current: Privacy): Privacy {
  const out: Privacy = { visibility: current.visibility, elements: { ...current.elements }, indexable: current.indexable };
  if (VISIBILITIES.includes(input.visibility as Visibility)) out.visibility = input.visibility as Visibility;
  if (typeof input.indexable === 'boolean') out.indexable = input.indexable;
  const elements = input.elements;
  if (elements && typeof elements === 'object') {
    for (const e of ELEMENTS) {
      const v = (elements as Record<string, unknown>)[e];
      if (typeof v === 'boolean') out.elements[e] = v;
    }
  }
  return out;
}

/** Handles as accounts get them (db.ts freeHandle), with some room. */
export const HANDLE = /^[\w.]{1,40}$/;

class ProfileStore {
  private readonly sql: DatabaseSync;
  constructor(sql: DatabaseSync) {
    this.sql = sql;
    // its own table: an account without a row has the defaults
    sql.exec(`
CREATE TABLE IF NOT EXISTS profile_privacy (
  uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, visibility TEXT NOT NULL DEFAULT 'public', elements TEXT NOT NULL DEFAULT '{}',
  indexable INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, hidden_reason TEXT NOT NULL DEFAULT '', hidden_by TEXT NOT NULL DEFAULT '',
  hidden_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);`);
  }

  private row(uuid: string) {
    return this.sql.prepare('SELECT visibility, elements, indexable, hidden, hidden_reason, hidden_by, hidden_at FROM profile_privacy WHERE uuid = ?').get(uuid) as
      { visibility: string; elements: string; indexable: number; hidden: number; hidden_reason: string; hidden_by: string; hidden_at: number } | undefined;
  }

  get(uuid: string): { privacy: Privacy; moderation: Moderation } {
    const r = this.row(uuid);
    let saved: Record<string, unknown> = {};
    try {
      saved = r ? JSON.parse(r.elements) : {};
    } catch {
      // broken JSON: the defaults
    }
    const privacy = cleanPrivacy({ visibility: r?.visibility, indexable: r ? !!r.indexable : undefined, elements: saved }, DEFAULT_PRIVACY);
    return { privacy, moderation: { hidden: !!r?.hidden, reason: r?.hidden_reason ?? '', by: r?.hidden_by ?? '', at: r?.hidden_at ?? 0 } };
  }

  setPrivacy(uuid: string, p: Privacy) {
    this.sql.prepare(`INSERT INTO profile_privacy (uuid, visibility, elements, indexable, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (uuid) DO UPDATE SET visibility = excluded.visibility, elements = excluded.elements, indexable = excluded.indexable, updated_at = excluded.updated_at`)
      .run(uuid, p.visibility, JSON.stringify(p.elements), p.indexable ? 1 : 0, Date.now());
  }

  setHidden(uuid: string, hidden: boolean, reason: string, by: string) {
    this.sql.prepare(`INSERT INTO profile_privacy (uuid, hidden, hidden_reason, hidden_by, hidden_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (uuid) DO UPDATE SET hidden = excluded.hidden, hidden_reason = excluded.hidden_reason, hidden_by = excluded.hidden_by, hidden_at = excluded.hidden_at`)
      .run(uuid, hidden ? 1 : 0, hidden ? reason : '', hidden ? by : '', hidden ? Date.now() : 0, Date.now());
  }

  /** Handles of the profiles search engines may list (for the sitemap). */
  indexableHandles(limit: number): string[] {
    return (this.sql.prepare(`SELECT u.handle FROM profile_privacy p JOIN users u ON u.uuid = p.uuid
      WHERE p.visibility = 'public' AND p.indexable = 1 AND p.hidden = 0 AND u.banned = 0 ORDER BY u.handle_lower LIMIT ?`).all(limit) as { handle: string }[]).map((r) => r.handle);
  }

  createdAt(uuid: string): number {
    return (this.sql.prepare('SELECT created_at FROM users WHERE uuid = ?').get(uuid) as { created_at: number } | undefined)?.created_at ?? 0;
  }

  friendCount(uuid: string): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM friendships WHERE a = ? OR b = ?').get(uuid, uuid) as { n: number }).n;
  }

  /** Days with enough play to count for a streak (achievements.ts), and the servers played on, newest first. */
  daysPlayed(uuid: string): number {
    try {
      return (this.sql.prepare('SELECT COUNT(*) AS n FROM play_days WHERE uuid = ? AND seconds >= ?').get(uuid, DAY_MIN_SECONDS) as { n: number }).n;
    } catch {
      return 0;
    }
  }

  servers(uuid: string, limit: number): { address: string; since: number }[] {
    try {
      return this.sql.prepare('SELECT server AS address, first_at AS since FROM play_servers WHERE uuid = ? ORDER BY first_at DESC LIMIT ?').all(uuid, limit) as { address: string; since: number }[];
    } catch {
      return [];
    }
  }
}

/** One achievement as achievements.ts's `view` gives it (only what is used here). */
export interface AchievementView {
  id: string; group: string; name: string; nameEn: string; description: string; descriptionEn: string;
  unlockedAt: number | null; progress?: number; value?: number; tier?: number; goal?: number;
  /** Secret achievements (when achievements.ts has them): never shown before they are unlocked. */
  hidden?: boolean; secret?: boolean;
  reward?: { id: string; slot: string; name: string };
  [key: string]: unknown;
}

export interface ProfileDeps {
  db: Db;
  /** The site's files (web/), for the page; without it there is no page. */
  webDir?: string;
  publicUrl: string;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  isAdmin: (userId: string) => boolean;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  clientIp: (req: http.IncomingMessage) => string;
  limitViews: (key: string) => void;
  /** The player's achievements and play numbers (achievements.ts's `list`). */
  achievements: (uuid: string) => { achievements: AchievementView[]; stats: { hours: number; streak: number; bestStreak: number; servers: number } };
  /** What the account wears in game (its own set; app.ts's wornBy). */
  worn: (user: User) => Record<string, string>;
  /** The logo colour: admin, support, partner, friend… */
  badge: (user: User) => string;
  /** 'offline' for players not connected or invisible. */
  status: (uuid: string) => string;
  /** A Minecraft account's skin and face (app.ts, from Mojang). */
  skinOf: (mcUuid: string) => Promise<{ data: Buffer; slim: boolean } | undefined>;
  headOf: (mcUuid: string) => Promise<Buffer | undefined>;
  /**
   * HOOK (Iskry): the player's balance of the "Iskry" currency, shown with the stats once wired in
   * app.ts (and then under the 'stats' switch).
   */
  sparks?: (uuid: string) => number | undefined;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  versioned: (html: string) => string;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const DAY = 86_400_000;

export function profileRoutes(deps: ProfileDeps) {
  const { db, fail } = deps;
  const store = new ProfileStore(db.sql);
  const clans = new ClanStore(db.sql);
  const logos = new ClanLogoStore(db.sql);

  const optionalUser = (req: http.IncomingMessage): string => {
    if (!req.headers.authorization) return '';
    try {
      return deps.authed(req);
    } catch {
      return '';
    }
  };

  function viewerOf(me: string, owner: string): Viewer {
    if (!me) return 'anonymous';
    if (me === owner) return 'self';
    if (deps.isAdmin(me)) return 'admin';
    return db.areFriends(me, owner) ? 'friend' : 'stranger';
  }

  /** The Minecraft account whose skin and face stand for the player: the one picked as the avatar, else the first. */
  function mainCharacter(uuid: string): { uuid: string; name: string } | undefined {
    const accounts = db.minecraftAccounts(uuid);
    const source = db.avatarChoice(uuid).source;
    return accounts.find((a) => `mc:${a.uuid}` === source) ?? accounts[0];
  }

  /**
   * A profile as `viewer` may see it. Pictures: for everyone who may only see a public profile, the
   * face and skin come through /v1/profiles/<handle>/… (no Minecraft uuid, no Discord picture in
   * the page); friends, the owner and admins get the usual addresses.
   */
  function build(user: User, viewer: Viewer, opts: { asPublic?: boolean } = {}) {
    const { privacy, moderation } = store.get(user.id);
    const effective: Viewer = opts.asPublic && (viewer === 'self' || viewer === 'admin') ? 'anonymous' : viewer;
    const a = access(privacy, moderation, user.banned, effective);
    if (!a.ok) return { error: a.error } as Record<string, unknown>;
    const show = (e: Element) => a.elements.has(e);
    const proxied = effective === 'anonymous' || effective === 'stranger';
    const handle = encodeURIComponent(user.handle);
    const character = mainCharacter(user.id);
    const avatar = proxied ? (character ? `/v1/profiles/${handle}/head` : '') : user.avatar;
    const skin = character ? (proxied ? `/v1/profiles/${handle}/skin` : `/v1/skin/${character.uuid}`) : '';
    const out: Record<string, unknown> = {
      handle: user.handle, name: user.name, avatar, skin, badge: deps.badge(user), memberSince: store.createdAt(user.id),
      url: `/u/${handle}`, viewer: effective, visibility: privacy.visibility,
    };
    if (a.full && !opts.asPublic) {
      out.privacy = privacy;
      out.moderation = moderation.hidden ? { hidden: true, reason: moderation.reason, at: moderation.at, ...(viewer === 'admin' ? { by: db.user(moderation.by)?.handle ?? '' } : {}) } : { hidden: false };
      if (viewer === 'admin') out.adminView = true;
      if (user.banned) out.banned = true;
    }
    if (show('stats') || show('achievements')) {
      const list = deps.achievements(user.id);
      if (show('stats')) {
        out.stats = { hours: list.stats.hours, streak: list.stats.streak, bestStreak: list.stats.bestStreak, daysPlayed: store.daysPlayed(user.id), servers: list.stats.servers };
        const sparks = deps.sparks?.(user.id);
        if (sparks !== undefined) (out.stats as Record<string, unknown>).sparks = sparks;
      }
      if (show('achievements')) {
        // a secret one is never there before it is unlocked; progress says the numbers behind it, so only with them
        const progressFor = (group: string) => (group === 'friends' ? show('friends') : show('stats'));
        const shown = list.achievements.filter((x) => !((x.hidden || x.secret) && !x.unlockedAt)).map((x) => ({
          id: x.id, group: x.group, ...(x.tier === undefined ? {} : { tier: x.tier }), name: x.name, nameEn: x.nameEn,
          description: x.description, descriptionEn: x.descriptionEn, unlockedAt: x.unlockedAt ?? null,
          ...(!x.unlockedAt && x.progress !== undefined && progressFor(x.group) ? { progress: x.progress } : {}),
          ...(x.reward ? { reward: x.reward } : {}),
        }));
        out.achievements = { unlocked: shown.filter((x) => x.unlockedAt).length, total: shown.length, list: shown };
      }
    }
    if (show('friends')) out.friends = store.friendCount(user.id);
    if (show('cosmetics')) {
      out.cosmetics = user.banned ? {} : deps.worn(user);
      // their names, for the list under the figure
      out.cosmeticNames = Object.fromEntries(Object.values(out.cosmetics as Record<string, string>).map((id) => [id, CAPE_NAMES[id] ?? id]));
    }
    if (show('clan')) {
      const m = clans.membership(user.id);
      const c = m && clans.clan(m.clan);
      if (c) {
        // the logo (clanLogos.ts) is public anyway, by the clan's id
        const v = logos.version(c.id);
        out.clan = { tag: c.tag, name: c.name, role: m.role, ...(v === undefined ? {} : { logo: `/v1/clans/${c.id}/logo.png?v=${v}` }) };
      }
    }
    if (show('minecraft')) out.minecraft = db.minecraftAccounts(user.id).map((x) => x.name).filter(Boolean);
    if (show('servers')) out.servers = store.servers(user.id, 20);
    if (show('lastOnline')) {
      const online = deps.status(user.id) !== 'offline';
      const seen = db.lastSeen(user.id);
      // others get the day only: the time would tell when someone invisible was around
      out.lastOnline = { online, at: a.full && !opts.asPublic ? seen : Math.floor(seen / DAY) * DAY };
    }
    return out;
  }

  const userOr404 = (handle: string): User => {
    const u = HANDLE.test(handle) ? db.userByHandle(handle) : undefined;
    return u ?? fail(404, 'not_found');
  };

  const routes: [string, RegExp, Handler][] = [
    // a profile as the one asking may see it (no sign-in needed); ?view=public: the owner or an admin sees what everyone does
    ['GET', /^\/v1\/profiles\/([^/]+)$/, (req, [raw], url) => {
      deps.limitViews(`profile:${deps.clientIp(req)}`);
      const user = userOr404(decodeURIComponent(raw));
      const me = optionalUser(req);
      const p = build(user, viewerOf(me, user.id), { asPublic: url.searchParams.get('view') === 'public' });
      const error = p.error as string | undefined;
      if (error) fail(error === 'not_found' ? 404 : 403, error);
      return { profile: p };
    }],
    // the owner's settings
    ['GET', /^\/v1\/me\/profile-privacy$/, (req) => {
      const me = deps.authed(req);
      const { privacy, moderation } = store.get(me);
      return { privacy, hidden: moderation.hidden, url: `/u/${encodeURIComponent(db.user(me)!.handle)}`, defaults: DEFAULT_PRIVACY };
    }],
    ['POST', /^\/v1\/me\/profile-privacy$/, async (req) => {
      const me = deps.authed(req);
      const privacy = cleanPrivacy(await deps.body(req), store.get(me).privacy);
      store.setPrivacy(me, privacy);
      const { moderation } = store.get(me);
      return { privacy, hidden: moderation.hidden, url: `/u/${encodeURIComponent(db.user(me)!.handle)}`, defaults: DEFAULT_PRIVACY };
    }],
    // moderation: an admin hides a profile from everyone (the owner still sees it, marked); in the admin log
    ['POST', /^\/v1\/admin\/profiles\/([^/]+)$/, async (req, [raw]) => {
      const me = deps.admin(req);
      const user = userOr404(decodeURIComponent(raw));
      const { hidden, reason } = await deps.body(req);
      if (typeof hidden !== 'boolean') return fail(400, 'bad_request');
      const why = typeof reason === 'string' ? reason.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) : '';
      store.setHidden(user.id, hidden, why, me);
      deps.audit(me, hidden ? 'profile_hide' : 'profile_show', user.handle, why);
      return { profile: build(user, 'admin') };
    }],
  ];

  /** The title, description, OpenGraph tags and robots line of a profile's page, from what everyone may see. */
  function previewTags(user: User | undefined): { tags: string; status: number; index: boolean } {
    const notFound = { tags: '<title>Nie znaleziono – SlashClient</title>\n  <meta name="robots" content="noindex">', status: 404, index: false };
    if (!user) return notFound;
    const { privacy, moderation } = store.get(user.id);
    const a = access(privacy, moderation, user.banned, 'anonymous');
    if (!a.ok) {
      if (a.error === 'not_found') return notFound;
      const title = a.error === 'profile_private' ? 'Profil prywatny' : 'Profil tylko dla znajomych';
      return { tags: `<title>${title} – SlashClient</title>\n  <meta name="robots" content="noindex">\n  <meta property="og:site_name" content="SlashClient">\n  <meta property="og:title" content="${title}">`, status: 200, index: false };
    }
    const base = deps.publicUrl.replace(/\/$/, '');
    const p = build(user, 'anonymous') as Record<string, any>;
    const bits: string[] = [];
    if (p.stats) bits.push(`${p.stats.hours} h gry`);
    if (p.achievements) bits.push(`${p.achievements.unlocked}/${p.achievements.total} osiągnięć`);
    if (p.clan) bits.push(`klan [${p.clan.tag}]`);
    const desc = `Profil gracza ${user.name} w SlashClient${bits.length ? `: ${bits.join(', ')}` : ''}.`;
    const title = `${user.name} (@${user.handle})`;
    const index = indexable(privacy, moderation, user.banned);
    const pageUrl = `${base}/u/${encodeURIComponent(user.handle)}`;
    const image = p.avatar ? `${base}${p.avatar}` : `${base}/img/og.jpg`;
    return {
      status: 200, index,
      tags: [
        `<title>${escapeHtml(title)} – SlashClient</title>`,
        `<meta name="description" content="${escapeHtml(desc)}">`,
        `<meta name="robots" content="${index ? 'index, follow' : 'noindex'}">`,
        `<link rel="canonical" href="${escapeHtml(pageUrl)}">`,
        '<meta property="og:site_name" content="SlashClient">',
        `<meta property="og:title" content="${escapeHtml(title)}">`,
        `<meta property="og:description" content="${escapeHtml(desc)}">`,
        `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
        '<meta property="og:type" content="profile">',
        `<meta property="profile:username" content="${escapeHtml(user.handle)}">`,
        `<meta property="og:image" content="${escapeHtml(image)}">`,
        '<meta name="twitter:card" content="summary">',
      ].join('\n  '),
    };
  }

  /**
   * What is not JSON: the page (/u/<handle>, /gracz/<handle> leads there), the face and skin of
   * a public profile and the sitemap of the profiles that may be listed. True when it was one.
   */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const redirect = /^\/(?:gracz|profil|player)\/([^/]+)\/?$/.exec(url.pathname);
    if (redirect && deps.webDir) {
      res.writeHead(301, { Location: `/u/${redirect[1]}`, 'Cache-Control': 'public, max-age=3600' });
      res.end();
      return true;
    }
    const page = /^\/u\/([^/]+)\/?$/.exec(url.pathname);
    const picture = /^\/v1\/profiles\/([^/]+)\/(head|skin)$/.exec(url.pathname);
    const sitemap = url.pathname === '/sitemap-profiles.xml';
    if (!(page && deps.webDir) && !picture && !(sitemap && deps.webDir)) return false;
    try {
      deps.limitViews(`profile:${deps.clientIp(req)}`);
    } catch {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'rate_limited' }));
      return true;
    }

    if (sitemap) {
      const base = deps.publicUrl.replace(/\/$/, '');
      const urls = store.indexableHandles(5000).map((h) => `  <url><loc>${escapeHtml(`${base}/u/${encodeURIComponent(h)}`)}</loc><changefreq>weekly</changefreq><priority>0.3</priority></url>`);
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
      return true;
    }

    let handle = '';
    try {
      handle = decodeURIComponent((page ?? picture)![1]);
    } catch {
      // a broken address: not found below
    }
    const user = HANDLE.test(handle) ? db.userByHandle(handle) : undefined;

    if (picture) {
      // only what everyone may see: a public profile that is not hidden
      const ok = user && access(store.get(user.id).privacy, store.get(user.id).moderation, user.banned, 'anonymous').ok;
      const character = ok ? mainCharacter(user!.id) : undefined;
      const found = character ? await (picture[2] === 'head' ? deps.headOf(character.uuid.toLowerCase()) : deps.skinOf(character.uuid.toLowerCase()).then((s) => s && s.data)).catch(() => undefined) : undefined;
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return true;
      }
      const slim = picture[2] === 'skin' ? (await deps.skinOf(character!.uuid.toLowerCase()).catch(() => undefined))?.slim : false;
      res.writeHead(200, {
        'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600', 'X-Content-Type-Options': 'nosniff',
        ...(picture[2] === 'skin' ? { 'X-Skin-Model': slim ? 'slim' : 'default' } : {}),
      });
      res.end(req.method === 'HEAD' ? undefined : found);
      return true;
    }

    const html = await readFile(path.join(deps.webDir!, 'profil.html'), 'utf8').catch(() => undefined);
    if (html === undefined) return false;
    const preview = previewTags(user);
    res.writeHead(preview.status, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
      'X-Robots-Tag': preview.index ? 'index, follow' : 'noindex',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : deps.versioned(html.replace('<!--preview-->', preview.tags)));
    return true;
  }

  return { routes, serve, store, build };
}
