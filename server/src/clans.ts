import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Db, Person } from './db.ts';
import { ClanLogoStore, serveLogo, takeLogo } from './clanLogos.ts';
import { CLAN_CHAT_SIZE, type createGroups } from './groups.ts';
import { withDefaults } from './settings.ts';

/**
 * Clans: a group of players with a short tag ([ABC]) shown next to their nick: in the launcher,
 * and in game on the tab list and above heads for players with SlashClient (/v1/mc/lookup).
 *
 * One clan per player. The owner can do everything; officers invite, and take out plain members;
 * members chat and leave. Joining is by invite only (the player accepts). The tag is 2–5 letters
 * or digits, unique whatever the case, and checked against a list of words that have no place
 * in a tag (Polish and English, also written with digits for letters). The clan's chat is a group
 * chat (groups.ts) whose members follow the clan. The owner may give it a logo (clanLogos.ts).
 */

export type ClanRole = 'owner' | 'officer' | 'member';
export type ClanAction = 'invite' | 'kick' | 'setRole' | 'rename' | 'delete' | 'transfer' | 'logo';

export const CLAN_SIZE = CLAN_CHAT_SIZE;
export const MAX_INVITES = 20;
const TAG = /^[A-Za-z0-9]{2,5}$/;
export const MAX_NAME = 32;

export interface ClanLimits { members: number; invites: number; nameMax: number }
export const CLAN_LIMITS: ClanLimits = { members: CLAN_SIZE, invites: MAX_INVITES, nameMax: MAX_NAME };

/** Words a tag or a clan's name may not contain (lower case, letters only). */
export const BLOCKED_WORDS = [
  // Polish
  'kurw', 'chuj', 'huj', 'pizd', 'jeb', 'cipa', 'cipk', 'fiut', 'kutas', 'dziwk', 'pedal', 'pedał', 'cwel', 'szmat', 'zjeb', 'spierd', 'pierdol', 'debil', 'hwdp', 'jbc', 'ciota',
  // English
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'dick', 'cock', 'pussy', 'nigg', 'nigga', 'fag', 'retard', 'porn', 'penis', 'vagin',
  // hate
  'nazi', 'hitler', 'hitl', 'kkk', 'nsdap', 'heil', 'isis', 'jihad',
];
/** Short ones that are fine inside other words but not as the whole tag. */
export const BLOCKED_TAGS = ['ss', 'sa', 'hh', '88', '1488', 'jp', 'cp', 'wtf', 'stfu', 'fu', 'kys', 'sex', 'sexy', 'anal', 'rape', 'xxx', 'milf'];

/** The word lists in use: the admin panel's (Ustawienia → Moderacja) once the app says so, else the ones above. */
let blocklist: () => { words: readonly string[]; tags: readonly string[] } = () => ({ words: BLOCKED_WORDS, tags: BLOCKED_TAGS });
export function useBlocklist(lists?: () => { words: readonly string[]; tags: readonly string[] }) {
  blocklist = lists ?? (() => ({ words: BLOCKED_WORDS, tags: BLOCKED_TAGS }));
}
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };

/** Whether a text has a blocked word in it, as written or with digits read as letters. */
export function offensive(text: string): boolean {
  const lower = text.toLowerCase();
  const plain = lower.replace(/[^a-ząćęłńóśźż]/g, '');
  const leet = lower.replace(/[0-9@$!]/g, (c) => LEET[c] ?? c).replace(/[^a-ząćęłńóśźż]/g, '');
  const folded = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  const words = blocklist().words;
  return [plain, leet, folded(plain), folded(leet)].some((s) => words.some((w) => s.includes(folded(w)) || s.includes(w)));
}

/**
 * Why a tag cannot be used ('bad_tag', 'offensive_tag'), or undefined when it can (uniqueness is the
 * database's). `shape`: what a tag looks like (a clan's by default; communities have their own).
 */
export function tagProblem(tag: unknown, shape: RegExp = TAG): 'bad_tag' | 'offensive_tag' | undefined {
  if (typeof tag !== 'string' || !shape.test(tag)) return 'bad_tag';
  const lower = tag.toLowerCase();
  const tags = blocklist().tags;
  if (tags.includes(lower) || tags.includes(lower.replace(/[0-9]/g, (c) => LEET[c] ?? c)) || offensive(tag)) return 'offensive_tag';
  return undefined;
}

/** A clan's name from a request, or undefined when it is empty, too long, has control characters. */
export const cleanClanName = (raw: unknown, max = MAX_NAME): string | undefined => cleanName(raw, 3, max);

/** A name from a request (spaces folded), or undefined when shorter than `min`, longer than `max` or with control characters. */
export function cleanName(raw: unknown, min: number, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().replace(/\s+/g, ' ');
  return name.length >= min && name.length <= max && !/[\u0000-\u001f\u007f]/.test(name) ? name : undefined;
}

/** Who may do what to whom: the owner everything (not to themselves), officers invite and take out plain members. */
export function may(role: ClanRole | undefined, action: ClanAction, target?: ClanRole): boolean {
  if (!role) return false;
  switch (action) {
    case 'invite':
      return role === 'owner' || role === 'officer';
    case 'kick':
      return target !== undefined && target !== 'owner' && (role === 'owner' || (role === 'officer' && target === 'member'));
    case 'setRole':
    case 'transfer':
      return role === 'owner' && target !== undefined && target !== 'owner';
    case 'rename':
    case 'logo':
    case 'delete':
      return role === 'owner';
  }
}

interface ClanRow { id: string; tag: string; name: string; owner: string; chat: string; createdAt: number }

export class ClanStore {
  private sql: DatabaseSync;
  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS clans (id TEXT PRIMARY KEY, tag TEXT NOT NULL, tag_lower TEXT NOT NULL UNIQUE, name TEXT NOT NULL, owner TEXT NOT NULL, chat TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS clan_members (uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, clan_id TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE, role TEXT NOT NULL, joined_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS clan_members_clan ON clan_members(clan_id);
CREATE TABLE IF NOT EXISTS clan_invites (clan_id TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, by_uuid TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (clan_id, uuid));
`);
  }

  clan(id: string): ClanRow | undefined {
    return this.sql.prepare('SELECT id, tag, name, owner, chat, created_at AS createdAt FROM clans WHERE id = ?').get(id) as never;
  }

  tagTaken(tag: string, except = ''): boolean {
    return !!this.sql.prepare('SELECT 1 FROM clans WHERE tag_lower = ? AND id != ?').get(tag.toLowerCase(), except);
  }

  create(tag: string, name: string, owner: string): string {
    const id = randomBytes(9).toString('base64url');
    this.sql.prepare('INSERT INTO clans (id, tag, tag_lower, name, owner, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, tag, tag.toLowerCase(), name, owner, Date.now());
    this.sql.prepare('INSERT INTO clan_members (uuid, clan_id, role, joined_at) VALUES (?, ?, ?, ?)').run(owner, id, 'owner', Date.now());
    this.sql.prepare('DELETE FROM clan_invites WHERE uuid = ?').run(owner);
    return id;
  }

  setChat(id: string, chat: string) {
    this.sql.prepare('UPDATE clans SET chat = ? WHERE id = ?').run(chat, id);
  }

  rename(id: string, tag: string, name: string) {
    this.sql.prepare('UPDATE clans SET tag = ?, tag_lower = ?, name = ? WHERE id = ?').run(tag, tag.toLowerCase(), name, id);
  }

  remove(id: string) {
    this.sql.prepare('DELETE FROM clans WHERE id = ?').run(id);
  }

  /** The clan a player is in, with their role. */
  membership(uuid: string): { clan: string; role: ClanRole } | undefined {
    return this.sql.prepare('SELECT clan_id AS clan, role FROM clan_members WHERE uuid = ?').get(uuid) as never;
  }

  /** Members: the owner, officers, then the rest, each by when they came. */
  members(id: string): { uuid: string; role: ClanRole; joinedAt: number }[] {
    return this.sql.prepare(`SELECT uuid, role, joined_at AS joinedAt FROM clan_members WHERE clan_id = ?
      ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, joined_at, rowid`).all(id) as never;
  }

  join(id: string, uuid: string) {
    this.sql.prepare('INSERT INTO clan_members (uuid, clan_id, role, joined_at) VALUES (?, ?, ?, ?)').run(uuid, id, 'member', Date.now());
    this.sql.prepare('DELETE FROM clan_invites WHERE uuid = ?').run(uuid);
  }

  leave(uuid: string) {
    this.sql.prepare('DELETE FROM clan_members WHERE uuid = ?').run(uuid);
  }

  setRole(uuid: string, role: ClanRole) {
    this.sql.prepare('UPDATE clan_members SET role = ? WHERE uuid = ?').run(role, uuid);
  }

  setOwner(id: string, owner: string) {
    this.sql.prepare('UPDATE clans SET owner = ? WHERE id = ?').run(owner, id);
  }

  invite(id: string, uuid: string, by: string) {
    this.sql.prepare('INSERT OR REPLACE INTO clan_invites (clan_id, uuid, by_uuid, created_at) VALUES (?, ?, ?, ?)').run(id, uuid, by, Date.now());
  }

  hasInvite(id: string, uuid: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM clan_invites WHERE clan_id = ? AND uuid = ?').get(id, uuid);
  }

  removeInvite(id: string, uuid: string): boolean {
    return Number(this.sql.prepare('DELETE FROM clan_invites WHERE clan_id = ? AND uuid = ?').run(id, uuid).changes) > 0;
  }

  /** Invites a clan sent that wait for an answer. */
  sentInvites(id: string): { uuid: string; by: string; at: number }[] {
    return this.sql.prepare('SELECT uuid, by_uuid AS by, created_at AS at FROM clan_invites WHERE clan_id = ? ORDER BY created_at DESC').all(id) as never;
  }

  /** Invites to a player, newest first. */
  invitesFor(uuid: string): { clan: string; by: string; at: number }[] {
    return this.sql.prepare('SELECT clan_id AS clan, by_uuid AS by, created_at AS at FROM clan_invites WHERE uuid = ? ORDER BY created_at DESC').all(uuid) as never;
  }

  /** Every clan, for the admin panel. */
  all(): (ClanRow & { members: number; logo: number | null })[] {
    return this.sql.prepare(`SELECT c.id, c.tag, c.name, c.owner, c.chat, c.created_at AS createdAt, (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS members,
      (SELECT version FROM clan_logos l WHERE l.clan_id = c.id) AS logo FROM clans c ORDER BY c.tag_lower`).all() as never;
  }
}

interface Deps {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  push: (userId: string, event: unknown) => void;
  /** Whether a player is online for the others (invisible counts as offline), and their status. */
  status: (userId: string) => string;
  limitChanges: (key: string) => void;
  /** Uploading a logo (defaults to limitChanges). */
  limitLogos?: (key: string) => void;
  groups: ReturnType<typeof createGroups>;
  fail: (status: number, code: string) => never;
  /** Members, invites and the name's length (the admin panel's settings; may be live). */
  limits?: Partial<ClanLimits>;
}

export function createClans(deps: Deps) {
  const { db, authed, body, push, fail, groups } = deps;
  const store = new ClanStore(db.sql);
  const logos = new ClanLogoStore(db.sql);
  const limits = withDefaults(CLAN_LIMITS, deps.limits);
  /** The logo's version as clients get it: `logo` is there only when the clan has one. */
  const logoField = (id: string) => {
    const v = logos.version(id);
    return v === undefined ? {} : { logo: v };
  };

  const person = (id: string): Person => {
    const u = db.user(id);
    return { id, handle: u?.handle ?? '', name: u?.name ?? '', avatar: u?.avatar ?? '' };
  };

  /**
   * The clan with an owner who is still in it: an owner whose account is gone is followed by the
   * longest-standing officer, else member; a clan nobody is left in goes away.
   */
  function clanOf(id: string): ClanRow | undefined {
    const c = store.clan(id);
    if (!c) return undefined;
    const members = store.members(id);
    if (!members.length) {
      removeClan(c);
      return undefined;
    }
    if (!members.some((m) => m.role === 'owner')) {
      const next = members.find((m) => m.role === 'officer') ?? members[0];
      store.setRole(next.uuid, 'owner');
      store.setOwner(id, next.uuid);
      if (c.chat) {
        groups.clanChat.setOwner(c.chat, next.uuid);
        groups.clanChat.note(c.chat, next.uuid, { kind: 'heir' });
      }
      return store.clan(id);
    }
    return c;
  }

  function removeClan(c: ClanRow) {
    const members = store.members(c.id).map((m) => m.uuid);
    const invited = store.sentInvites(c.id).map((i) => i.uuid);
    logos.remove(c.id);
    store.remove(c.id);
    if (c.chat) groups.clanChat.remove(c.chat);
    for (const m of [...members, ...invited]) push(m, { type: 'clan' });
    for (const m of members) friendsChanged(m);
  }

  /** The tag of a player's clan, for names in the launcher and in game. */
  function tagOf(uuid: string): string | undefined {
    const m = store.membership(uuid);
    return m ? store.clan(m.clan)?.tag : undefined;
  }

  /** My clan and role, or 404 when I am in none. */
  function mine(me: string): { clan: ClanRow; role: ClanRole } {
    const m = store.membership(me);
    const clan = m && clanOf(m.clan);
    if (!m || !clan) return fail(404, 'no_clan');
    // the role may have changed in clanOf (a new owner)
    return { clan, role: store.membership(me)!.role };
  }

  function view(c: ClanRow, me: string) {
    const role = store.membership(me)?.role;
    return {
      id: c.id, tag: c.tag, name: c.name, createdAt: c.createdAt, chat: c.chat, role, ...logoField(c.id),
      members: store.members(c.id).map((m) => {
        const status = deps.status(m.uuid);
        return { ...person(m.uuid), role: m.role, joinedAt: m.joinedAt, status, online: status !== 'offline' };
      }),
      // only those who may invite see who waits
      ...(may(role, 'invite') ? { invites: store.sentInvites(c.id).map((i) => ({ ...person(i.uuid), at: i.at, by: i.by })) } : {}),
    };
  }

  function invitesFor(me: string) {
    return store.invitesFor(me).flatMap((i) => {
      const c = store.clan(i.clan);
      return c ? [{ clan: { id: c.id, tag: c.tag, name: c.name, members: store.members(c.id).length, ...logoField(c.id) }, by: person(i.by), at: i.at }] : [];
    });
  }

  const answer = (me: string) => {
    const m = store.membership(me);
    const c = m && clanOf(m.clan);
    return { clan: c ? view(c, me) : null, invites: invitesFor(me) };
  };

  /** Everyone in the clan (and those it concerns) fetches it again. */
  function changed(c: ClanRow, also: string[] = []) {
    for (const m of new Set([...store.members(c.id).map((x) => x.uuid), ...also])) push(m, { type: 'clan' });
  }
  /** A player's tag changed: their friends' lists show it. */
  function friendsChanged(uuid: string) {
    for (const f of db.friends(uuid)) push(f.id, { type: 'friends' });
  }

  /** The logo changed: the clan, its chat's header, and the friends lists that show its members fetch it again. */
  function logoChanged(c: ClanRow) {
    changed(c);
    if (c.chat) groups.clanChat.changed(c.chat);
    for (const m of store.members(c.id)) friendsChanged(m.uuid);
  }

  function roleOf(c: ClanRow, uuid: string): ClanRole | undefined {
    const m = store.membership(uuid);
    return m?.clan === c.id ? m.role : undefined;
  }

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Handler][] = [
    // my clan (or null) and the invites waiting for me
    ['GET', /^\/v1\/clans\/mine$/, (req) => answer(authed(req))],
    ['POST', /^\/v1\/clans$/, async (req) => {
      const me = authed(req);
      const { tag, name } = await body(req);
      const problem = tagProblem(tag);
      if (problem) fail(400, problem);
      const clean = cleanClanName(name, limits.nameMax);
      if (!clean) fail(400, 'bad_clan_name');
      if (offensive(clean!)) fail(400, 'offensive_name');
      if (store.membership(me)) fail(409, 'already_in_clan');
      if (store.tagTaken(tag as string)) fail(409, 'tag_taken');
      deps.limitChanges(me);
      const id = store.create(tag as string, clean!, me);
      store.setChat(id, groups.clanChat.create(id, `[${tag}] ${clean}`, me));
      friendsChanged(me);
      return answer(me);
    }],
    // an invite by handle (the player answers it); only owners and officers
    ['POST', /^\/v1\/clans\/invites$/, async (req) => {
      const me = authed(req);
      const { clan, role } = mine(me);
      if (!may(role, 'invite')) fail(403, 'not_allowed');
      const { handle, id } = await body(req);
      const other = typeof id === 'string' ? db.user(id) : typeof handle === 'string' ? db.userByHandle(handle.trim().replace(/^@/, '')) : undefined;
      if (!other) fail(404, 'not_found');
      if (other!.id === me) fail(400, 'self');
      if (store.membership(other!.id)?.clan === clan.id) fail(409, 'already_member');
      if (store.members(clan.id).length >= limits.members) fail(400, 'clan_full');
      if (store.sentInvites(clan.id).length >= limits.invites) fail(400, 'too_many');
      deps.limitChanges(me);
      store.invite(clan.id, other!.id, me);
      push(other!.id, { type: 'clan', invite: { tag: clan.tag, name: clan.name, by: person(me) } });
      changed(clan);
      return answer(me);
    }],
    ['DELETE', /^\/v1\/clans\/invites\/([\w-]{1,64})$/, (req, [user]) => {
      const me = authed(req);
      const { clan, role } = mine(me);
      if (!may(role, 'invite')) fail(403, 'not_allowed');
      if (!store.removeInvite(clan.id, user)) fail(404, 'not_found');
      changed(clan, [user]);
      return answer(me);
    }],
    ['POST', /^\/v1\/clans\/([\w-]{1,32})\/accept$/, (req, [id]) => {
      const me = authed(req);
      if (!store.hasInvite(id, me)) fail(404, 'not_found');
      const c = clanOf(id);
      if (!c) fail(404, 'not_found');
      if (store.membership(me)) fail(409, 'already_in_clan');
      if (store.members(id).length >= limits.members) fail(400, 'clan_full');
      store.join(id, me);
      if (c!.chat) groups.clanChat.join(c!.chat, me);
      changed(c!);
      friendsChanged(me);
      return answer(me);
    }],
    ['POST', /^\/v1\/clans\/([\w-]{1,32})\/decline$/, (req, [id]) => {
      const me = authed(req);
      if (!store.removeInvite(id, me)) fail(404, 'not_found');
      const c = store.clan(id);
      if (c) changed(c);
      return answer(me);
    }],
    // the owner cannot just walk out of a clan with others in it: they hand it over or delete it
    ['POST', /^\/v1\/clans\/leave$/, (req) => {
      const me = authed(req);
      const { clan, role } = mine(me);
      if (role === 'owner' && store.members(clan.id).length > 1) fail(400, 'owner_must_transfer');
      store.leave(me);
      if (clan.chat) groups.clanChat.leave(clan.chat, me);
      if (!store.members(clan.id).length) removeClan(clan);
      else changed(clan, [me]);
      friendsChanged(me);
      return answer(me);
    }],
    ['DELETE', /^\/v1\/clans\/members\/([\w-]{1,64})$/, (req, [user]) => {
      const me = authed(req);
      const { clan, role } = mine(me);
      const target = roleOf(clan, user);
      if (!target) fail(404, 'not_found');
      if (!may(role, 'kick', target)) fail(403, 'not_allowed');
      store.leave(user);
      if (clan.chat) groups.clanChat.leave(clan.chat, user, me);
      push(user, { type: 'clan', kicked: { tag: clan.tag, name: clan.name } });
      changed(clan);
      friendsChanged(user);
      return answer(me);
    }],
    ['POST', /^\/v1\/clans\/members\/([\w-]{1,64})\/role$/, async (req, [user]) => {
      const me = authed(req);
      const { clan, role } = mine(me);
      const { role: wanted } = await body(req);
      if (wanted !== 'officer' && wanted !== 'member') fail(400, 'bad_request');
      const target = roleOf(clan, user);
      if (!target) fail(404, 'not_found');
      if (!may(role, 'setRole', target)) fail(403, 'not_allowed');
      store.setRole(user, wanted as ClanRole);
      // the clan's chat says so, when it is a change
      if (clan.chat && target !== wanted) groups.clanChat.note(clan.chat, me, { kind: wanted === 'officer' ? 'promoted' : 'demoted', users: [db.user(user)?.name || '?'] });
      changed(clan);
      return answer(me);
    }],
    // the owner hands the clan over; they stay on as an officer
    ['POST', /^\/v1\/clans\/owner$/, async (req) => {
      const me = authed(req);
      const { clan, role } = mine(me);
      const { user } = await body(req);
      const target = typeof user === 'string' ? roleOf(clan, user) : undefined;
      if (!target) fail(404, 'not_found');
      if (!may(role, 'transfer', target)) fail(403, 'not_allowed');
      store.setRole(user as string, 'owner');
      store.setRole(me, 'officer');
      store.setOwner(clan.id, user as string);
      if (clan.chat) {
        groups.clanChat.setOwner(clan.chat, user as string);
        groups.clanChat.note(clan.chat, me, { kind: 'owner', users: [db.user(user as string)?.name || '?'] });
      }
      changed(clan);
      return answer(me);
    }],
    // a new name and/or tag (the owner)
    ['POST', /^\/v1\/clans\/rename$/, async (req) => {
      const me = authed(req);
      const { clan, role } = mine(me);
      if (!may(role, 'rename')) fail(403, 'not_allowed');
      const raw = await body(req);
      const tag = raw.tag === undefined ? clan.tag : raw.tag;
      const problem = tagProblem(tag);
      if (problem) fail(400, problem);
      const name = raw.name === undefined ? clan.name : cleanClanName(raw.name, limits.nameMax);
      if (!name) fail(400, 'bad_clan_name');
      if (offensive(name!)) fail(400, 'offensive_name');
      if (store.tagTaken(tag as string, clan.id)) fail(409, 'tag_taken');
      deps.limitChanges(me);
      store.rename(clan.id, tag as string, name!);
      if (clan.chat) groups.clanChat.rename(clan.chat, `[${tag}] ${name}`, me);
      changed(clan);
      if (tag !== clan.tag) for (const m of store.members(clan.id)) friendsChanged(m.uuid);
      return answer(me);
    }],
    // the clan's logo (the owner): a 64×64 PNG as the raw body, or DELETE to take it off
    ...(['POST', 'PUT'] as const).map((method): [string, RegExp, Handler] => [method, /^\/v1\/clans\/mine\/logo$/, async (req) => {
      const me = authed(req);
      let clan!: ClanRow;
      const png = await takeLogo(req, fail, () => {
        const m = mine(me);
        if (!may(m.role, 'logo')) fail(403, 'not_allowed');
        (deps.limitLogos ?? deps.limitChanges)(me);
        clan = m.clan;
      });
      logos.set(clan.id, png);
      if (clan.chat) groups.clanChat.note(clan.chat, me, { kind: 'logo' });
      logoChanged(clan);
      return answer(me);
    }]),
    ['DELETE', /^\/v1\/clans\/mine\/logo$/, (req) => {
      const me = authed(req);
      const { clan, role } = mine(me);
      if (!may(role, 'logo')) fail(403, 'not_allowed');
      if (logos.remove(clan.id)) {
        if (clan.chat) groups.clanChat.note(clan.chat, me, { kind: 'logo', removed: true });
        logoChanged(clan);
      }
      return answer(me);
    }],
    ['DELETE', /^\/v1\/clans\/mine$/, (req) => {
      const me = authed(req);
      const { clan, role } = mine(me);
      if (!may(role, 'delete')) fail(403, 'not_allowed');
      removeClan(clan);
      return answer(me);
    }],
    // moderation: the admin panel can see every clan and remove one (an offensive tag that got through)
    ['GET', /^\/v1\/admin\/clans$/, (req) => {
      deps.admin(req);
      return { clans: store.all() };
    }],
    ['DELETE', /^\/v1\/admin\/clans\/([\w-]{1,32})$/, (req, [id]) => {
      const me = deps.admin(req);
      const c = store.clan(id);
      if (!c) fail(404, 'not_found');
      removeClan(c!);
      db.log(me, 'clan.delete', id, `[${c!.tag}] ${c!.name}`);
      return { ok: true };
    }],
    // an offensive logo: the admin takes it off (the clan stays)
    ['DELETE', /^\/v1\/admin\/clans\/([\w-]{1,32})\/logo$/, (req, [id]) => {
      const me = deps.admin(req);
      const c = store.clan(id);
      if (!c || !logos.remove(id)) fail(404, 'not_found');
      db.log(me, 'clan.logo_remove', id, `[${c!.tag}] ${c!.name}`);
      logoChanged(c!);
      return { ok: true };
    }],
  ];

  /** A player's clan and its logo's version, when it has one (friends lists, the game's lookup). */
  function logoOf(uuid: string): { id: string; v: number } | undefined {
    const m = store.membership(uuid);
    const v = m ? logos.version(m.clan) : undefined;
    return m && v !== undefined ? { id: m.clan, v } : undefined;
  }

  return {
    routes, tagOf, tagOfClan: (id: string) => store.clan(id)?.tag, logoOf,
    /** Someone's role in this clan, or undefined when they are not in it (any more). */
    roleIn: (clanId: string, uuid: string): ClanRole | undefined => {
      const m = store.membership(uuid);
      return m?.clan === clanId ? m.role : undefined;
    },
    logoOfClan: (id: string) => logos.version(id),
    serveLogo: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => serveLogo(logos, req, res, url),
  };
}
