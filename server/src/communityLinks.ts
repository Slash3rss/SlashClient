import { randomInt } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from './db.ts';
import type { createCommunities } from './communities.ts';
import { may, type CommunityRole, type CommunityRow } from './communityStore.ts';
import { serverKeyOf } from './presence.ts';

/**
 * Communities, more of them (server 0.9.30+; older launchers ignore the new fields):
 *
 * - Invite links: those who may change the community (admins and the owner) make links with an
 *   expiry (EXPIRIES) and a number of uses (USES), list them and revoke them. A link is
 *   `<publicUrl>/c/<code>`: the website shows the community (name, logo, members) and how to get in;
 *   the launcher joins with the code or the whole link pasted. A link lets one in even when the
 *   community is private or takes requests (it is an invite), never when banned or it is full.
 *   Looking codes up is rate limited (per address on the website, per account in the launcher).
 * - Its game server: admins set a Minecraft server's address (and a version hint). Every summary
 *   carries `server: { address, version?, playing }`, `playing` being how many members are on it now
 *   (only those who let friends see their server, and are not invisible); the launcher pings it and
 *   starts the game straight into it.
 * - Verified: the site's admins mark official communities (`verified: true` in every summary); the
 *   launcher and the website show a badge by the name.
 */

/** A link's lives, in minutes (0: never expires). */
export const LINK_EXPIRIES = [30, 60, 1440, 10080, 0];
/** A link's uses (0: unlimited). */
export const LINK_USES = [1, 5, 10, 25, 100, 0];
/** Links a community may have at once (the dead ones do not count). */
export const LINKS_MAX = 50;
/** No letters that read alike (l/1, o/0): a code may be typed from a screenshot. */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;

export function newLinkCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** The code from a code or a link pasted as it is (".../c/<code>", any case); undefined when it is neither. */
export function linkCodeOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  const m = /(?:^|\/c\/)([A-Za-z0-9]{6,16})\/?(?:[?#].*)?$/.exec(text);
  return m ? m[1].toLowerCase() : undefined;
}

/**
 * A game server's address from a request: host[:port], lower case, the default port dropped; '' to
 * take it off; undefined when it is not one, or points at a machine of the player's own network (every
 * member's launcher pings it).
 */
export function cleanServerAddress(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim().toLowerCase().replace(/^minecraft:\/\//, '');
  if (!text) return '';
  const m = /^([a-z0-9.-]{1,253}|\[[0-9a-f:]{2,39}\])(?::(\d{1,5}))?$/.exec(text);
  if (!m) return undefined;
  const host = m[1].replace(/\.+$/, '');
  const port = m[2] === undefined ? 25565 : Number(m[2]);
  if (!host || port < 1 || port > 65535 || host.startsWith('[') || !host.includes('.')) return undefined;
  if (/^[.-]|[.-]{2}/.test(host) || /(^|\.)(localhost|local|lan|internal|home|localdomain)$/.test(host)) return undefined;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (ip.slice(1).some((x) => Number(x) > 255)) return undefined;
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return undefined;
  } else if (/^\d+(\.\d+)*$/.test(host)) return undefined;
  return port === 25565 ? host : `${host}:${port}`;
}

/** A version hint ("1.21.4", "1.20.1"); '' for none; undefined when it is not one. */
export function cleanVersionHint(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  return !v || /^\d{1,2}\.\d{1,3}(\.\d{1,3})?$/.test(v) ? v : undefined;
}

export interface LinkRow { code: string; community: string; by: string; createdAt: number; expiresAt: number; maxUses: number; uses: number }
/** Whether a link still lets anyone in. */
export const linkAlive = (l: Pick<LinkRow, 'expiresAt' | 'maxUses' | 'uses'>, now = Date.now()) => (!l.expiresAt || l.expiresAt > now) && (!l.maxUses || l.uses < l.maxUses);

const LINK_COLUMNS = 'code, community_id AS community, by_uuid AS by, created_at AS createdAt, expires_at AS expiresAt, max_uses AS maxUses, uses';

export class CommunityLinkStore {
  private sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS community_links (code TEXT PRIMARY KEY, community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE, by_uuid TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL DEFAULT 0, max_uses INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS community_links_community ON community_links(community_id, created_at);
CREATE TABLE IF NOT EXISTS community_extras (community_id TEXT PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE, verified INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER NOT NULL DEFAULT 0, verified_by TEXT NOT NULL DEFAULT '', server TEXT NOT NULL DEFAULT '', server_version TEXT NOT NULL DEFAULT '');
`);
  }

  // ---------- links ----------

  create(community: string, by: string, expiresAt: number, maxUses: number, now = Date.now()): LinkRow {
    for (;;) {
      const code = newLinkCode();
      const done = this.sql.prepare('INSERT OR IGNORE INTO community_links (code, community_id, by_uuid, created_at, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?)')
        .run(code, community, by, now, expiresAt, maxUses);
      if (Number(done.changes)) return this.link(code)!;
    }
  }

  link(code: string): LinkRow | undefined {
    return this.sql.prepare(`SELECT ${LINK_COLUMNS} FROM community_links WHERE code = ?`).get(code) as LinkRow | undefined;
  }

  /** A community's links that still work, the newest first; the dead ones go away. */
  links(community: string, now = Date.now()): LinkRow[] {
    this.sql.prepare('DELETE FROM community_links WHERE community_id = ? AND ((expires_at > 0 AND expires_at <= ?) OR (max_uses > 0 AND uses >= max_uses))').run(community, now);
    return this.sql.prepare(`SELECT ${LINK_COLUMNS} FROM community_links WHERE community_id = ? ORDER BY created_at DESC, code`).all(community) as never;
  }

  used(code: string) {
    this.sql.prepare('UPDATE community_links SET uses = uses + 1 WHERE code = ?').run(code);
  }

  revoke(community: string, code: string): boolean {
    return Number(this.sql.prepare('DELETE FROM community_links WHERE community_id = ? AND code = ?').run(community, code).changes) > 0;
  }

  // ---------- verified, the game server ----------

  extras(community: string): { verified: boolean; server: string; serverVersion: string } {
    const r = this.sql.prepare('SELECT verified, server, server_version AS serverVersion FROM community_extras WHERE community_id = ?').get(community) as
      { verified: number; server: string; serverVersion: string } | undefined;
    return { verified: !!r?.verified, server: r?.server ?? '', serverVersion: r?.serverVersion ?? '' };
  }

  setVerified(community: string, verified: boolean, by: string, now = Date.now()) {
    this.sql.prepare(`INSERT INTO community_extras (community_id, verified, verified_at, verified_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(community_id) DO UPDATE SET verified = excluded.verified, verified_at = excluded.verified_at, verified_by = excluded.verified_by`).run(community, verified ? 1 : 0, now, by);
  }

  setServer(community: string, server: string, version: string) {
    this.sql.prepare(`INSERT INTO community_extras (community_id, server, server_version) VALUES (?, ?, ?)
      ON CONFLICT(community_id) DO UPDATE SET server = excluded.server, server_version = excluded.server_version`).run(community, server, version);
  }
}

interface Deps {
  db: Db;
  communities: ReturnType<typeof createCommunities>;
  publicUrl: string;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  clientIp: (req: http.IncomingMessage) => string;
  fail: (status: number, code: string) => never;
  /** Looking a code up (per address or account): throws when too many. */
  limitLookups: (key: string) => void;
  limitJoin: (key: string) => void;
  limitChanges: (key: string) => void;
  /** How many of these accounts are on this server now (and let it be seen). */
  playingOn: (members: ReadonlySet<string>, server: string) => number;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
const ID = '([\\w-]{1,32})';
const CODE = '([A-Za-z0-9]{6,16})';
const route = (path: string) => new RegExp(`^/v1/communities${path}$`);

/**
 * Links and the game server are for those who may change the community (admins and the owner);
 * invite links also for a custom role given `invite` (communityRoles.ts; the built-in moderators'
 * own invites stay by nick).
 */
export const mayManage = (role: CommunityRole | undefined, custom?: { permissions: string[] }, what: 'links' | 'server' = 'server') =>
  may(role, 'edit') || (what === 'links' && !!custom?.permissions.includes('invite'));

export function createCommunityLinks(deps: Deps) {
  const { communities, authed, body, fail } = deps;
  const { communityOf, admit, mine, joinState, listChanged, summary, person } = communities.internals;
  const store = communities.store;
  const links = new CommunityLinkStore(deps.db.sql);
  const urlOf = (code: string) => `${deps.publicUrl.replace(/\/+$/, '')}/c/${code}`;

  // every summary (lists, the directory, the public page) says whether it is verified and where its members play
  communities.extend((c: CommunityRow) => {
    const x = links.extras(c.id);
    return {
      ...(x.verified ? { verified: true } : {}),
      ...(x.server ? { server: { address: x.server, ...(x.serverVersion ? { version: x.serverVersion } : {}), playing: deps.playingOn(store.memberSet(c.id), serverKeyOf(x.server)) } } : {}),
    };
  });

  /** A member who may manage the links (or the server), and the community; 404 or 403 otherwise. */
  function manager(id: string, me: string, what: 'links' | 'server' = 'links'): CommunityRow {
    const c = communityOf(id);
    const m = c && store.member(id, me);
    if (!c || !m) return fail(404, 'not_found');
    if (!mayManage(m.role, communities.roles.role(id, m.customRole), what)) fail(403, 'not_allowed');
    return c;
  }

  const linkView = (l: LinkRow) => ({ code: l.code, url: urlOf(l.code), by: person(l.by), createdAt: l.createdAt, expiresAt: l.expiresAt, maxUses: l.maxUses, uses: l.uses });

  /** The link and its community when it still works: 404 for no such code, 410 when it is spent or expired. */
  function alive(code: string): { link: LinkRow; c: CommunityRow } {
    const link = links.link(code.toLowerCase());
    const c = link && communityOf(link.community);
    if (!link || !c) return fail(404, 'invite_not_found');
    if (!linkAlive(link)) fail(410, 'invite_expired');
    return { link, c };
  }

  /** What a link shows: the community (private ones too: the link is an invite), and when it stops working. */
  const preview = (link: LinkRow, c: CommunityRow) => ({ community: summary(c), expiresAt: link.expiresAt, ...(link.maxUses ? { usesLeft: Math.max(0, link.maxUses - link.uses) } : {}) });

  /** How I would get in with a link: already in, banned, it is full, or in at once. */
  const linkState = (c: CommunityRow, me: string) => {
    const s = joinState(c, me);
    return s === 'member' || s === 'banned' || s === 'full' ? s : 'open';
  };

  const routes: [string, RegExp, Handler][] = [
    // the website's invite page (no sign-in): limited per address, so codes cannot be guessed
    ['GET', new RegExp(`^/v1/public/communities/links/${CODE}$`), (req, [code]) => {
      deps.limitLookups(`link:${deps.clientIp(req)}`);
      const { link, c } = alive(code);
      const { owner, ...rest } = preview(link, c).community;
      return { ...preview(link, c), community: { ...rest, owner: { name: owner.name, handle: owner.handle }, logoUrl: rest.logo ? `/v1/communities/${encodeURIComponent(c.id)}/logo.png?v=${rest.logo}` : null } };
    }],
    // the launcher: a code or a link pasted
    ['GET', route(`/links/${CODE}`), (req, [code]) => {
      const me = authed(req);
      deps.limitLookups(`link:${me}`);
      const { link, c } = alive(code);
      return { ...preview(link, c), community: { ...summary(c), state: linkState(c, me) } };
    }],
    ['POST', route(`/links/${CODE}/join`), (req, [code]) => {
      const me = authed(req);
      deps.limitLookups(`link:${me}`);
      // already in: fine, whatever the link's state (nothing used up)
      const known = links.link(code.toLowerCase());
      if (known && store.member(known.community, me) && communityOf(known.community)) return { status: 'member', id: known.community, ...mine(me) };
      const { link, c } = alive(code);
      deps.limitJoin(me);
      // admit checks bans, the size and the player's own limit
      admit(c, me, me);
      links.used(link.code);
      store.log(c.id, me, 'link_join', me, link.code);
      listChanged(c.id, store.staff(c.id));
      return { status: 'joined', id: c.id, ...mine(me) };
    }],
    ['GET', route(`/${ID}/links`), (req, [id]) => {
      const me = authed(req);
      manager(id, me);
      return { links: links.links(id).map(linkView), expiries: LINK_EXPIRIES, uses: LINK_USES, max: LINKS_MAX };
    }],
    // `minutes`: one of LINK_EXPIRIES (0: never), `uses`: one of LINK_USES (0: unlimited)
    ['POST', route(`/${ID}/links`), async (req, [id]) => {
      const me = authed(req);
      manager(id, me);
      const { minutes, uses } = await body(req);
      if (typeof minutes !== 'number' || !LINK_EXPIRIES.includes(minutes) || typeof uses !== 'number' || !LINK_USES.includes(uses)) fail(400, 'bad_request');
      if (links.links(id).length >= LINKS_MAX) fail(400, 'too_many_links');
      deps.limitChanges(me);
      const link = links.create(id, me, minutes ? Date.now() + (minutes as number) * 60_000 : 0, uses as number);
      store.log(id, me, 'link_create', '', link.code);
      return { link: linkView(link) };
    }],
    ['DELETE', route(`/${ID}/links/${CODE}`), (req, [id, code]) => {
      const me = authed(req);
      manager(id, me);
      if (!links.revoke(id, code.toLowerCase())) fail(404, 'not_found');
      store.log(id, me, 'link_revoke', '', code.toLowerCase());
      return { ok: true };
    }],
    // the game server: `address` ('' takes it off) and `version` (a hint, optional)
    ['POST', route(`/${ID}/server`), async (req, [id]) => {
      const me = authed(req);
      const c = manager(id, me, 'server');
      const raw = await body(req);
      const address = cleanServerAddress(raw.address);
      if (address === undefined) fail(400, 'bad_server');
      const version = address ? cleanVersionHint(raw.version) : '';
      if (version === undefined) fail(400, 'bad_version');
      deps.limitChanges(me);
      const old = links.extras(id);
      if (old.server !== address || old.serverVersion !== version) {
        links.setServer(id, address!, version!);
        store.log(id, me, 'server', '', [address, version].filter(Boolean).join(' · '));
        listChanged(id);
      }
      return { community: summary(communityOf(c.id)!) };
    }],
    // the site's admins: official communities get a badge
    ['POST', /^\/v1\/admin\/communities\/([\w-]{1,32})\/verified$/, async (req, [id]) => {
      const me = deps.admin(req);
      const c = communityOf(id) ?? fail(404, 'not_found');
      const { verified } = await body(req);
      if (typeof verified !== 'boolean') fail(400, 'bad_request');
      if (links.extras(id).verified !== verified) {
        links.setVerified(id, verified as boolean, me);
        store.log(id, me, verified ? 'admin_verify' : 'admin_unverify');
        deps.db.log(me, verified ? 'community.verify' : 'community.unverify', id, c.name);
        listChanged(id);
      }
      return { ok: true, verified };
    }],
    // the admin panel's view of a community's links (who made which, how used)
    ['GET', /^\/v1\/admin\/communities\/([\w-]{1,32})\/links$/, (req, [id]) => {
      deps.admin(req);
      if (!communityOf(id)) fail(404, 'not_found');
      return { links: links.links(id).map(linkView), ...links.extras(id) };
    }],
  ];

  return { routes, store: links };
}
