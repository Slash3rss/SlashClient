import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { cleanName, offensive, tagProblem } from './clans.ts';

/**
 * Communities ("Społeczności"): the data and the rules (communities.ts has the routes).
 *
 * Like a clan, but big: up to COMMUNITY_LIMITS.members players, and a player may be in several
 * besides their one clan. A community's tag is optional and never goes next to a nick (that is the
 * clan's [TAG]); lists show it as #TAG, and it is the address of the community's page (/s/<tag>).
 *
 * The chat is NOT end-to-end encrypted: wrapping a key for every member's launcher on every
 * message does not scale to a thousand members, so messages are kept on the server like a forum's
 * posts (the connection is encrypted, the stored text is not) and moderators can read and remove
 * them. The clients say so where one writes.
 */

/** Every limit in one place (tests lower some through the app's config). */
export const COMMUNITY_LIMITS = {
  /** Members of one community, the owner included. */
  members: 1000,
  /** Communities one player may be in (their clan does not count). */
  perPlayer: 10,
  /** Communities one player may own. */
  owned: 3,
  /** Invites a community may have waiting. */
  invites: 100,
  /** Requests to join waiting for an answer. */
  requests: 500,
  nameMin: 3,
  nameMax: 40,
  description: 500,
  message: 2000,
  /** Longest mute, in minutes (a week). */
  muteMinutes: 7 * 24 * 60,
  /** Mentions resolved in one message. */
  mentions: 10,
};
export type CommunityLimits = typeof COMMUNITY_LIMITS;

/** 2–6 letters or digits; a clan's is 2–5, and shown in [brackets] instead. */
export const COMMUNITY_TAG = /^[A-Za-z0-9]{2,6}$/;

export type CommunityRole = 'owner' | 'admin' | 'moderator' | 'member';
export const ROLES: CommunityRole[] = ['owner', 'admin', 'moderator', 'member'];
export const RANK: Record<CommunityRole, number> = { owner: 3, admin: 2, moderator: 1, member: 0 };
export type Visibility = 'public' | 'private';
export type JoinMode = 'open' | 'request';
export type Notify = 'all' | 'mentions' | 'none';
export const NOTIFY: Notify[] = ['all', 'mentions', 'none'];

export type CommunityAction = 'invite' | 'requests' | 'reports' | 'kick' | 'mute' | 'deleteMessage' | 'ban' | 'edit' | 'announce' | 'log' | 'setRole' | 'transfer' | 'delete';

/**
 * Who may do what to whom. Moderators invite, answer requests, look at reports, and take out, mute
 * and delete the messages of those below them; admins also ban, change the community's info, logo
 * and roles below their own, and post announcements; only the owner hands the community over or
 * deletes it. Someone who is not a member (any more) counts as a 'member' target.
 */
export function may(role: CommunityRole | undefined, action: CommunityAction, target?: CommunityRole, next?: CommunityRole): boolean {
  if (!role) return false;
  const r = RANK[role];
  const below = target !== undefined && RANK[target] < r;
  switch (action) {
    case 'invite':
    case 'requests':
    case 'reports':
      return r >= RANK.moderator;
    case 'kick':
    case 'mute':
    case 'deleteMessage':
      return r >= RANK.moderator && below;
    case 'ban':
      return r >= RANK.admin && below;
    case 'edit':
    case 'announce':
    case 'log':
      return r >= RANK.admin;
    case 'setRole':
      return r >= RANK.admin && below && next !== undefined && next !== 'owner' && RANK[next] < r;
    case 'transfer':
      return role === 'owner' && target !== undefined && target !== 'owner';
    case 'delete':
      return role === 'owner';
  }
}

/** Everything a role may do, for the clients (they still ask the server each time). */
export function permissions(role: CommunityRole | undefined) {
  return {
    invite: may(role, 'invite'), requests: may(role, 'requests'), reports: may(role, 'reports'),
    kick: may(role, 'kick', 'member'), mute: may(role, 'mute', 'member'), deleteMessage: may(role, 'deleteMessage', 'member'),
    ban: may(role, 'ban', 'member'), edit: may(role, 'edit'), announce: may(role, 'announce'), log: may(role, 'log'),
    setRole: may(role, 'setRole', 'member', 'moderator'), transfer: role === 'owner', delete: may(role, 'delete'),
  };
}

/** A community's name from a request, or undefined (3–40 characters, no control characters). */
export const cleanCommunityName = (raw: unknown, limits: CommunityLimits = COMMUNITY_LIMITS) => cleanName(raw, limits.nameMin, limits.nameMax);

/** Why a community's tag cannot be used; '' (no tag) is fine. */
export function communityTagProblem(tag: unknown): 'bad_tag' | 'offensive_tag' | undefined {
  if (tag === '') return undefined;
  return tagProblem(tag, COMMUNITY_TAG);
}

/** A description from a request: trimmed, lines kept (at most 6 empty ones in a row are folded), or undefined when too long or odd. */
export function cleanDescription(raw: unknown, limits: CommunityLimits = COMMUNITY_LIMITS): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length <= limits.description && !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text) ? text : undefined;
}

/** Whether a name or description says something that has no place there. */
export const offensiveText = (text: string) => offensive(text);

/** The handles a message mentions (@nick), at most `max`, without duplicates (lower case). */
export function mentionedHandles(text: string, max = COMMUNITY_LIMITS.mentions): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(^|[^\w.@])@([\w.]{1,40})/g)) {
    out.add(m[2].replace(/\.+$/, '').toLowerCase());
    if (out.size >= max) break;
  }
  return [...out].filter(Boolean);
}

export interface CommunityRow {
  id: string; name: string; tag: string; description: string; visibility: Visibility; joinMode: JoinMode;
  owner: string; members: number; createdAt: number; lastMessageAt: number;
}
export interface MemberRow { uuid: string; role: CommunityRole; joinedAt: number; notify: Notify; onProfile: boolean; mutedUntil: number }
export interface ChannelRow { id: string; community: string; kind: 'general' | 'announcements' | 'custom'; name: string; postRole: CommunityRole; position: number }
export interface MessageRow {
  id: number; community: string; channel: string; from: string; text: string; at: number;
  mentions: string[]; editedAt: number | null; deletedAt: number | null; deletedBy: string | null;
}

const COLUMNS = `id, name, tag, description, visibility, join_mode AS joinMode, owner, member_count AS members, created_at AS createdAt, last_message_at AS lastMessageAt`;
const MESSAGE_COLUMNS = `id, community_id AS community, channel_id AS channel, from_uuid AS "from", text, created_at AS at, mentions, edited_at AS editedAt, deleted_at AS deletedAt, deleted_by AS deletedBy`;
type RawMessage = Omit<MessageRow, 'mentions'> & { mentions: string | null };
const toMessage = (r: RawMessage): MessageRow => ({ ...r, mentions: r.mentions ? JSON.parse(r.mentions) as string[] : [] });
/** LIKE with the user's text taken as it is. */
const like = (q: string) => `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
/** Counting unread stops here ("99+"): no long scans for big rooms. */
export const UNREAD_CAP = 100;

export class CommunityStore {
  private sql: DatabaseSync;
  /** Members of each community as a set, for the chat's fan-out (dropped on every change of members). */
  private memberSets = new Map<string, Set<string>>();

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS communities (id TEXT PRIMARY KEY, name TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '', tag_lower TEXT, description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public', join_mode TEXT NOT NULL DEFAULT 'open', owner TEXT NOT NULL, member_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, last_message_at INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS communities_tag ON communities(tag_lower) WHERE tag_lower IS NOT NULL;
CREATE INDEX IF NOT EXISTS communities_directory ON communities(visibility, member_count);
CREATE INDEX IF NOT EXISTS communities_owner ON communities(owner);
CREATE TABLE IF NOT EXISTS community_members (community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  role TEXT NOT NULL, joined_at INTEGER NOT NULL, notify TEXT NOT NULL DEFAULT 'mentions', on_profile INTEGER NOT NULL DEFAULT 1, muted_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (community_id, uuid));
CREATE INDEX IF NOT EXISTS community_members_user ON community_members(uuid);
CREATE INDEX IF NOT EXISTS community_members_role ON community_members(community_id, role, joined_at);
CREATE TABLE IF NOT EXISTS community_channels (id TEXT PRIMARY KEY, community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '', post_role TEXT NOT NULL DEFAULT 'member', position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS community_channels_community ON community_channels(community_id, position);
CREATE TABLE IF NOT EXISTS community_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE, from_uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  text TEXT NOT NULL, mentions TEXT, created_at INTEGER NOT NULL, edited_at INTEGER, deleted_at INTEGER, deleted_by TEXT);
CREATE INDEX IF NOT EXISTS community_messages_channel ON community_messages(channel_id, id);
CREATE TABLE IF NOT EXISTS community_reads (channel_id TEXT NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  read_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (channel_id, uuid));
CREATE TABLE IF NOT EXISTS community_invites (community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  by_uuid TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (community_id, uuid));
CREATE INDEX IF NOT EXISTS community_invites_user ON community_invites(uuid);
CREATE TABLE IF NOT EXISTS community_requests (community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, PRIMARY KEY (community_id, uuid));
CREATE INDEX IF NOT EXISTS community_requests_user ON community_requests(uuid);
CREATE TABLE IF NOT EXISTS community_bans (community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  by_uuid TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY (community_id, uuid));
CREATE TABLE IF NOT EXISTS community_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL, reporter TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, reason TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, resolved_at INTEGER, resolved_by TEXT, outcome TEXT, UNIQUE (message_id, reporter));
CREATE INDEX IF NOT EXISTS community_reports_open ON community_reports(community_id, resolved_at);
CREATE TABLE IF NOT EXISTS community_log (id INTEGER PRIMARY KEY AUTOINCREMENT, community_id TEXT NOT NULL, at INTEGER NOT NULL, by_uuid TEXT NOT NULL,
  action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS community_log_community ON community_log(community_id, id);
`);
  }

  // ---------- communities ----------

  community(id: string): CommunityRow | undefined {
    return this.sql.prepare(`SELECT ${COLUMNS} FROM communities WHERE id = ?`).get(id) as CommunityRow | undefined;
  }

  /** By its tag (any case) or its id: the address of its page. */
  bySlug(slug: string): CommunityRow | undefined {
    return (this.sql.prepare(`SELECT ${COLUMNS} FROM communities WHERE tag_lower = ?`).get(slug.toLowerCase()) as CommunityRow | undefined) ?? this.community(slug);
  }

  tagTaken(tag: string, except = ''): boolean {
    return !!tag && !!this.sql.prepare('SELECT 1 FROM communities WHERE tag_lower = ? AND id != ?').get(tag.toLowerCase(), except);
  }

  create(c: { name: string; tag: string; description: string; visibility: Visibility; joinMode: JoinMode }, owner: string, now = Date.now()): string {
    const id = randomBytes(9).toString('base64url');
    this.sql.prepare('INSERT INTO communities (id, name, tag, tag_lower, description, visibility, join_mode, owner, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, c.name, c.tag, c.tag ? c.tag.toLowerCase() : null, c.description, c.visibility, c.joinMode, owner, now);
    // one channel for talking and one where only admins post
    this.addChannel(id, 'general', '', 'member', 0, now);
    this.addChannel(id, 'announcements', '', 'admin', 1, now);
    this.addMember(id, owner, 'owner', now);
    return id;
  }

  update(id: string, c: { name: string; tag: string; description: string; visibility: Visibility; joinMode: JoinMode }) {
    this.sql.prepare('UPDATE communities SET name = ?, tag = ?, tag_lower = ?, description = ?, visibility = ?, join_mode = ? WHERE id = ?')
      .run(c.name, c.tag, c.tag ? c.tag.toLowerCase() : null, c.description, c.visibility, c.joinMode, id);
  }

  setOwner(id: string, owner: string) {
    this.sql.prepare('UPDATE communities SET owner = ? WHERE id = ?').run(owner, id);
  }

  remove(id: string) {
    this.sql.prepare('DELETE FROM communities WHERE id = ?').run(id);
    this.memberSets.delete(id);
  }

  ownedBy(uuid: string): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM communities WHERE owner = ?').get(uuid) as { n: number }).n;
  }

  /** Public communities for the directory: the biggest first, or those matching `q` by name or tag. */
  directory(q: string, offset: number, limit: number): { list: CommunityRow[]; total: number } {
    const where = q ? "visibility = 'public' AND (lower(name) LIKE ? ESCAPE '\\' OR tag_lower LIKE ? ESCAPE '\\')" : "visibility = 'public'";
    const args = q ? [like(q), like(q)] : [];
    const total = (this.sql.prepare(`SELECT COUNT(*) AS n FROM communities WHERE ${where}`).get(...args) as { n: number }).n;
    const list = this.sql.prepare(`SELECT ${COLUMNS} FROM communities WHERE ${where} ORDER BY member_count DESC, created_at LIMIT ? OFFSET ?`).all(...args, limit, offset) as unknown as CommunityRow[];
    return { list, total };
  }

  /** Every community (the admin panel), matching `q` by name, tag or owner's handle. */
  all(q: string, limit = 500): (CommunityRow & { ownerHandle: string; reports: number })[] {
    const where = q ? "WHERE lower(c.name) LIKE ? ESCAPE '\\' OR c.tag_lower LIKE ? ESCAPE '\\' OR u.handle_lower LIKE ? ESCAPE '\\'" : '';
    const args = q ? [like(q), like(q), like(q)] : [];
    return this.sql.prepare(`SELECT c.id, c.name, c.tag, c.description, c.visibility, c.join_mode AS joinMode, c.owner, c.member_count AS members, c.created_at AS createdAt,
      c.last_message_at AS lastMessageAt, COALESCE(u.handle, '') AS ownerHandle,
      (SELECT COUNT(*) FROM community_reports r WHERE r.community_id = c.id AND r.resolved_at IS NULL) AS reports
      FROM communities c LEFT JOIN users u ON u.uuid = c.owner ${where} ORDER BY c.member_count DESC, c.created_at LIMIT ?`).all(...args, limit) as never;
  }

  // ---------- members ----------

  member(id: string, uuid: string): MemberRow | undefined {
    const r = this.sql.prepare('SELECT uuid, role, joined_at AS joinedAt, notify, on_profile AS onProfile, muted_until AS mutedUntil FROM community_members WHERE community_id = ? AND uuid = ?').get(id, uuid) as
      (Omit<MemberRow, 'onProfile'> & { onProfile: number }) | undefined;
    return r && { ...r, onProfile: !!r.onProfile };
  }

  roleOf(id: string, uuid: string): CommunityRole | undefined {
    return this.member(id, uuid)?.role;
  }

  /** The communities a player is in, with their membership, the newest conversation first. */
  membershipsOf(uuid: string): (CommunityRow & { member: MemberRow })[] {
    const rows = this.sql.prepare(`SELECT c.id, c.name, c.tag, c.description, c.visibility, c.join_mode AS joinMode, c.owner, c.member_count AS members, c.created_at AS createdAt,
      c.last_message_at AS lastMessageAt, m.role, m.joined_at AS joinedAt, m.notify, m.on_profile AS onProfile, m.muted_until AS mutedUntil
      FROM community_members m JOIN communities c ON c.id = m.community_id WHERE m.uuid = ? ORDER BY MAX(c.last_message_at, m.joined_at) DESC`).all(uuid) as Record<string, unknown>[];
    return rows.map((r) => {
      const { role, joinedAt, notify, onProfile, mutedUntil, ...c } = r;
      return { ...(c as unknown as CommunityRow), member: { uuid, role: role as CommunityRole, joinedAt: joinedAt as number, notify: notify as Notify, onProfile: !!onProfile, mutedUntil: mutedUntil as number } };
    });
  }

  countOf(uuid: string): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM community_members WHERE uuid = ?').get(uuid) as { n: number }).n;
  }

  /** A new member reads what was written before as read (but may scroll back to it: it is a forum, not a private chat). */
  addMember(id: string, uuid: string, role: CommunityRole = 'member', now = Date.now()) {
    this.sql.prepare('INSERT INTO community_members (community_id, uuid, role, joined_at) VALUES (?, ?, ?, ?)').run(id, uuid, role, now);
    this.sql.prepare(`INSERT OR REPLACE INTO community_reads (channel_id, uuid, read_id)
      SELECT ch.id, ?, COALESCE((SELECT MAX(x.id) FROM community_messages x WHERE x.channel_id = ch.id), 0) FROM community_channels ch WHERE ch.community_id = ?`).run(uuid, id);
    this.sql.prepare('DELETE FROM community_invites WHERE community_id = ? AND uuid = ?').run(id, uuid);
    this.sql.prepare('DELETE FROM community_requests WHERE community_id = ? AND uuid = ?').run(id, uuid);
    this.recount(id);
  }

  removeMember(id: string, uuid: string): boolean {
    const gone = Number(this.sql.prepare('DELETE FROM community_members WHERE community_id = ? AND uuid = ?').run(id, uuid).changes) > 0;
    this.sql.prepare('DELETE FROM community_reads WHERE uuid = ? AND channel_id IN (SELECT id FROM community_channels WHERE community_id = ?)').run(uuid, id);
    this.recount(id);
    return gone;
  }

  /** The members' number kept on the community (the directory sorts by it); a count over the index. */
  recount(id: string) {
    this.sql.prepare('UPDATE communities SET member_count = (SELECT COUNT(*) FROM community_members WHERE community_id = ?) WHERE id = ?').run(id, id);
    this.memberSets.delete(id);
  }

  setRole(id: string, uuid: string, role: CommunityRole) {
    this.sql.prepare('UPDATE community_members SET role = ? WHERE community_id = ? AND uuid = ?').run(role, id, uuid);
  }

  setNotify(id: string, uuid: string, notify: Notify) {
    this.sql.prepare('UPDATE community_members SET notify = ? WHERE community_id = ? AND uuid = ?').run(notify, id, uuid);
  }

  setOnProfile(id: string, uuid: string, show: boolean) {
    this.sql.prepare('UPDATE community_members SET on_profile = ? WHERE community_id = ? AND uuid = ?').run(show ? 1 : 0, id, uuid);
  }

  setMuted(id: string, uuid: string, until: number) {
    this.sql.prepare('UPDATE community_members SET muted_until = ? WHERE community_id = ? AND uuid = ?').run(until, id, uuid);
  }

  /** Everyone in it, as a set kept until the members change (sending a message to the connected ones). */
  memberSet(id: string): ReadonlySet<string> {
    let set = this.memberSets.get(id);
    if (!set) {
      set = new Set((this.sql.prepare('SELECT uuid FROM community_members WHERE community_id = ?').all(id) as { uuid: string }[]).map((r) => r.uuid));
      if (this.memberSets.size > 2000) this.memberSets.clear();
      this.memberSets.set(id, set);
    }
    return set;
  }

  /** Those who moderate (owner, admins, moderators): few, by the role index. */
  staff(id: string): string[] {
    return (this.sql.prepare("SELECT uuid FROM community_members WHERE community_id = ? AND role IN ('owner', 'admin', 'moderator')").all(id) as { uuid: string }[]).map((r) => r.uuid);
  }

  /** The one to take over when the owner's account is gone: the highest role, longest there. */
  heir(id: string): MemberRow | undefined {
    const r = this.sql.prepare(`SELECT uuid, role, joined_at AS joinedAt FROM community_members WHERE community_id = ?
      ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, joined_at, rowid LIMIT 1`).get(id) as { uuid: string; role: CommunityRole; joinedAt: number } | undefined;
    return r && { ...r, notify: 'mentions', onProfile: true, mutedUntil: 0 };
  }

  /** One page of members: by role, then who came first; `q` matches the name or handle. */
  members(id: string, q: string, offset: number, limit: number): { list: (MemberRow & { handle: string; name: string })[]; total: number } {
    const where = q ? "AND (u.handle_lower LIKE ? ESCAPE '\\' OR lower(u.name) LIKE ? ESCAPE '\\')" : '';
    const args = q ? [like(q), like(q)] : [];
    const total = (this.sql.prepare(`SELECT COUNT(*) AS n FROM community_members m JOIN users u ON u.uuid = m.uuid WHERE m.community_id = ? ${where}`).get(id, ...args) as { n: number }).n;
    const list = this.sql.prepare(`SELECT m.uuid, m.role, m.joined_at AS joinedAt, m.notify, m.on_profile AS onProfile, m.muted_until AS mutedUntil, u.handle, u.name
      FROM community_members m JOIN users u ON u.uuid = m.uuid WHERE m.community_id = ? ${where}
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, m.joined_at, m.rowid LIMIT ? OFFSET ?`).all(id, ...args, limit, offset) as Record<string, unknown>[];
    return { list: list.map((r) => ({ ...(r as unknown as MemberRow & { handle: string; name: string }), onProfile: !!r.onProfile })), total };
  }

  /** Public communities a player shows on their profile (never private ones). */
  onProfile(uuid: string, limit = 10): (CommunityRow & { role: CommunityRole })[] {
    return this.sql.prepare(`SELECT c.id, c.name, c.tag, c.description, c.visibility, c.join_mode AS joinMode, c.owner, c.member_count AS members, c.created_at AS createdAt,
      c.last_message_at AS lastMessageAt, m.role FROM community_members m JOIN communities c ON c.id = m.community_id
      WHERE m.uuid = ? AND m.on_profile = 1 AND c.visibility = 'public' ORDER BY c.member_count DESC, m.joined_at LIMIT ?`).all(uuid, limit) as never;
  }

  // ---------- invites, requests, bans ----------

  invite(id: string, uuid: string, by: string, now = Date.now()) {
    this.sql.prepare('INSERT OR REPLACE INTO community_invites (community_id, uuid, by_uuid, created_at) VALUES (?, ?, ?, ?)').run(id, uuid, by, now);
  }

  hasInvite(id: string, uuid: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM community_invites WHERE community_id = ? AND uuid = ?').get(id, uuid);
  }

  removeInvite(id: string, uuid: string): boolean {
    return Number(this.sql.prepare('DELETE FROM community_invites WHERE community_id = ? AND uuid = ?').run(id, uuid).changes) > 0;
  }

  sentInvites(id: string): { uuid: string; by: string; at: number }[] {
    return this.sql.prepare('SELECT uuid, by_uuid AS by, created_at AS at FROM community_invites WHERE community_id = ? ORDER BY created_at DESC').all(id) as never;
  }

  invitesFor(uuid: string): { community: string; by: string; at: number }[] {
    return this.sql.prepare('SELECT community_id AS community, by_uuid AS by, created_at AS at FROM community_invites WHERE uuid = ? ORDER BY created_at DESC').all(uuid) as never;
  }

  request(id: string, uuid: string, now = Date.now()) {
    this.sql.prepare('INSERT OR IGNORE INTO community_requests (community_id, uuid, created_at) VALUES (?, ?, ?)').run(id, uuid, now);
  }

  hasRequest(id: string, uuid: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM community_requests WHERE community_id = ? AND uuid = ?').get(id, uuid);
  }

  removeRequest(id: string, uuid: string): boolean {
    return Number(this.sql.prepare('DELETE FROM community_requests WHERE community_id = ? AND uuid = ?').run(id, uuid).changes) > 0;
  }

  requests(id: string, limit = 200): { uuid: string; at: number }[] {
    return this.sql.prepare('SELECT uuid, created_at AS at FROM community_requests WHERE community_id = ? ORDER BY created_at LIMIT ?').all(id, limit) as never;
  }

  requestCount(id: string): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM community_requests WHERE community_id = ?').get(id) as { n: number }).n;
  }

  requestsBy(uuid: string): { community: string; at: number }[] {
    return this.sql.prepare('SELECT community_id AS community, created_at AS at FROM community_requests WHERE uuid = ? ORDER BY created_at DESC').all(uuid) as never;
  }

  ban(id: string, uuid: string, by: string, reason: string, now = Date.now()) {
    this.sql.prepare('INSERT OR REPLACE INTO community_bans (community_id, uuid, by_uuid, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(id, uuid, by, reason, now);
    this.sql.prepare('DELETE FROM community_invites WHERE community_id = ? AND uuid = ?').run(id, uuid);
    this.sql.prepare('DELETE FROM community_requests WHERE community_id = ? AND uuid = ?').run(id, uuid);
  }

  isBanned(id: string, uuid: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM community_bans WHERE community_id = ? AND uuid = ?').get(id, uuid);
  }

  unban(id: string, uuid: string): boolean {
    return Number(this.sql.prepare('DELETE FROM community_bans WHERE community_id = ? AND uuid = ?').run(id, uuid).changes) > 0;
  }

  bans(id: string): { uuid: string; by: string; reason: string; at: number }[] {
    return this.sql.prepare('SELECT uuid, by_uuid AS by, reason, created_at AS at FROM community_bans WHERE community_id = ? ORDER BY created_at DESC LIMIT 500').all(id) as never;
  }

  // ---------- channels and messages ----------

  addChannel(id: string, kind: ChannelRow['kind'], name: string, postRole: CommunityRole, position: number, now = Date.now()): string {
    const ch = randomBytes(9).toString('base64url');
    this.sql.prepare('INSERT INTO community_channels (id, community_id, kind, name, post_role, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(ch, id, kind, name, postRole, position, now);
    return ch;
  }

  channels(id: string): ChannelRow[] {
    return this.sql.prepare('SELECT id, community_id AS community, kind, name, post_role AS postRole, position FROM community_channels WHERE community_id = ? ORDER BY position, created_at').all(id) as never;
  }

  channel(id: string, ch: string): ChannelRow | undefined {
    return this.sql.prepare('SELECT id, community_id AS community, kind, name, post_role AS postRole, position FROM community_channels WHERE community_id = ? AND id = ?').get(id, ch) as ChannelRow | undefined;
  }

  addMessage(id: string, ch: string, from: string, text: string, mentions: string[], now = Date.now()): MessageRow {
    const { lastInsertRowid } = this.sql.prepare('INSERT INTO community_messages (community_id, channel_id, from_uuid, text, mentions, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, ch, from, text, mentions.length ? JSON.stringify(mentions) : null, now);
    const mid = Number(lastInsertRowid);
    this.sql.prepare('UPDATE communities SET last_message_at = ? WHERE id = ?').run(now, id);
    // what one writes oneself is read
    this.sql.prepare('UPDATE community_reads SET read_id = ? WHERE channel_id = ? AND uuid = ? AND read_id < ?').run(mid, ch, from, mid);
    return this.message(id, mid)!;
  }

  message(id: string, mid: number): MessageRow | undefined {
    const r = this.sql.prepare(`SELECT ${MESSAGE_COLUMNS} FROM community_messages WHERE community_id = ? AND id = ?`).get(id, mid) as RawMessage | undefined;
    return r && toMessage(r);
  }

  /** Newest last; `before` pages back by id. Every member sees the whole history. */
  messages(ch: string, limit: number, before?: number): MessageRow[] {
    const rows = this.sql.prepare(`SELECT ${MESSAGE_COLUMNS} FROM community_messages WHERE channel_id = ? AND id < ? ORDER BY id DESC LIMIT ?`)
      .all(ch, before ?? Number.MAX_SAFE_INTEGER, limit) as unknown as RawMessage[];
    return rows.reverse().map(toMessage);
  }

  editMessage(mid: number, text: string, mentions: string[], at = Date.now()) {
    this.sql.prepare('UPDATE community_messages SET text = ?, mentions = ?, edited_at = ? WHERE id = ? AND deleted_at IS NULL').run(text, mentions.length ? JSON.stringify(mentions) : null, at, mid);
  }

  /** Only that there was a message stays; `by` is who took it back (the author or a moderator). */
  deleteMessage(mid: number, by: string, at = Date.now()) {
    this.sql.prepare("UPDATE community_messages SET text = '', mentions = NULL, edited_at = NULL, deleted_at = ?, deleted_by = ? WHERE id = ?").run(at, by, mid);
  }

  markRead(ch: string, uuid: string) {
    this.sql.prepare(`UPDATE community_reads SET read_id = (SELECT COALESCE(MAX(id), 0) FROM community_messages WHERE channel_id = ?) WHERE channel_id = ? AND uuid = ?`).run(ch, ch, uuid);
  }

  /** Unread messages of others in a channel (up to UNREAD_CAP), and how many of those mention the reader. */
  unread(ch: string, uuid: string): { unread: number; mentions: number } {
    const read = (this.sql.prepare('SELECT read_id AS n FROM community_reads WHERE channel_id = ? AND uuid = ?').get(ch, uuid) as { n: number } | undefined)?.n ?? 0;
    const r = this.sql.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN mentions IS NOT NULL AND instr(mentions, ?) > 0 THEN 1 ELSE 0 END), 0) AS m FROM
      (SELECT mentions FROM community_messages WHERE channel_id = ? AND id > ? AND from_uuid != ? AND deleted_at IS NULL ORDER BY id LIMIT ${UNREAD_CAP})`).get(`"${uuid}"`, ch, read, uuid) as { n: number; m: number };
    return { unread: r.n, mentions: r.m };
  }

  // ---------- reports ----------

  report(id: string, mid: number, reporter: string, reason: string, text: string, now = Date.now()): boolean {
    return Number(this.sql.prepare('INSERT OR IGNORE INTO community_reports (community_id, message_id, reporter, reason, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, mid, reporter, reason, text, now).changes) > 0;
  }

  /** Open reports, one row per message (the newest reason, how many reported it); all communities when `id` is ''. */
  openReports(id: string, limit = 200): { id: number; community: string; message: number; reporter: string; reason: string; text: string; at: number; count: number }[] {
    return this.sql.prepare(`SELECT MAX(id) AS id, community_id AS community, message_id AS message, reporter, reason, text, MAX(created_at) AS at, COUNT(*) AS count
      FROM community_reports WHERE resolved_at IS NULL ${id ? 'AND community_id = ?' : ''} GROUP BY message_id ORDER BY at DESC LIMIT ?`).all(...(id ? [id, limit] : [limit])) as never;
  }

  openReportCount(id: string): number {
    return (this.sql.prepare('SELECT COUNT(DISTINCT message_id) AS n FROM community_reports WHERE community_id = ? AND resolved_at IS NULL').get(id) as { n: number }).n;
  }

  reportById(rid: number): { id: number; community: string; message: number } | undefined {
    return this.sql.prepare('SELECT id, community_id AS community, message_id AS message FROM community_reports WHERE id = ?').get(rid) as never;
  }

  /** Closes every open report of that message. */
  resolveReports(mid: number, by: string, outcome: string, now = Date.now()): number {
    return Number(this.sql.prepare('UPDATE community_reports SET resolved_at = ?, resolved_by = ?, outcome = ? WHERE message_id = ? AND resolved_at IS NULL').run(now, by, outcome, mid).changes);
  }

  // ---------- the log ----------

  log(id: string, by: string, action: string, target = '', detail = '', now = Date.now()) {
    this.sql.prepare('INSERT INTO community_log (community_id, at, by_uuid, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)').run(id, now, by, action, target, detail.slice(0, 300));
  }

  logOf(id: string, limit = 100): { id: number; at: number; by: string; action: string; target: string; detail: string }[] {
    return this.sql.prepare('SELECT id, at, by_uuid AS by, action, target, detail FROM community_log WHERE community_id = ? ORDER BY id DESC LIMIT ?').all(id, limit) as never;
  }

  // ---------- achievements ----------

  /** Communities someone else owns that the player is in, those they own, and the biggest they are in. */
  stats(uuid: string): { joined: number; founded: number; size: number } {
    const r = this.sql.prepare(`SELECT COALESCE(SUM(CASE WHEN m.role != 'owner' THEN 1 ELSE 0 END), 0) AS joined, COALESCE(MAX(c.member_count), 0) AS size
      FROM community_members m JOIN communities c ON c.id = m.community_id WHERE m.uuid = ?`).get(uuid) as { joined: number; size: number };
    return { joined: r.joined, founded: this.ownedBy(uuid), size: r.size };
  }
}
