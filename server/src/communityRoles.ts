import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { offensive } from './clans.ts';
import { RANK, type ChannelRow, type CommunityRole, type MemberRow } from './communityStore.ts';

/**
 * Communities' own channels, custom roles and the moderation log's pages (0.9.30). The routes are in
 * communityManage.ts; the chat's checks in communities.ts ask the functions here.
 *
 * Custom roles: a community's admins make roles with a name, a colour and permissions ("VIP", may
 * write in read-only channels…), ordered (position 1 is the lowest), and give one of them to a
 * member, on top of the built-in role (owner, admin, moderator, member) that stays as it was: older
 * launchers and mods know only that one and keep working with it. A member's power is the built-in
 * role first, then the custom role's position: a moderator is above every plain member whatever
 * their custom role, a "Senior" moderator above a moderator without one, and a member with a
 * custom role that may kick only kicks members below their own custom role.
 *
 * Own channels: besides the two built-in ones ("Ogólny" and "Ogłoszenia", which cannot be renamed
 * or deleted), admins (or a custom role with `manageChannels`) make text channels with a name and
 * who reads and writes them: the lowest built-in role, and custom roles let in besides. Admins and
 * the owner read and write everywhere (no one locks the community's managers out). A channel one
 * cannot read is not in one's list at all, and its messages are never sent to one: older clients
 * simply never see it.
 */

/** What a custom role may grant (built-in roles have their own, see `BASE`). */
export const ROLE_PERMISSIONS = [
  'postReadOnly', 'pin', 'deleteMessage', 'mute', 'kick', 'ban', 'invite', 'requests', 'reports', 'log', 'slowMode', 'manageChannels', 'manageRoles',
] as const;
export type RolePermission = typeof ROLE_PERMISSIONS[number];
const PERMISSION_SET = new Set<string>(ROLE_PERMISSIONS);

/** The lowest built-in role that has each permission without a custom role. */
const BASE: Record<RolePermission, CommunityRole> = {
  postReadOnly: 'admin', pin: 'moderator', deleteMessage: 'moderator', mute: 'moderator', kick: 'moderator', ban: 'admin', invite: 'moderator',
  requests: 'moderator', reports: 'moderator', log: 'moderator', slowMode: 'admin', manageChannels: 'admin', manageRoles: 'admin',
};
/** Permissions that act on someone (they need the target below one). */
const ON_SOMEONE = new Set<RolePermission>(['deleteMessage', 'mute', 'kick', 'ban']);

/** Roles a channel's read/write may start from (the owner reads everything anyway). */
export const CHANNEL_ROLES: CommunityRole[] = ['member', 'moderator', 'admin'];

export interface CustomRoleRow { id: string; community: string; name: string; color: string; permissions: RolePermission[]; position: number; createdAt: number }
/** A member as the rules see them: the built-in role and the custom one, if any. */
export interface Actor { role: CommunityRole; custom?: CustomRoleRow }

/** Built-in role first, then the custom role's position. */
export const power = (a: Actor) => RANK[a.role] * 1000 + (a.custom?.position ?? 0);

/** Whether this member may do it at all (on someone: see `allowedOn`). */
export function allowed(a: Actor | undefined, p: RolePermission): boolean {
  if (!a) return false;
  return RANK[a.role] >= RANK[BASE[p]] || !!a.custom?.permissions.includes(p);
}

/** Whether this member may do it to that one (who must be below them). */
export function allowedOn(a: Actor | undefined, p: RolePermission, target: Actor): boolean {
  return !!a && allowed(a, p) && power(a) > power(target);
}

/** Every permission a member has, for the clients (the server asks again each time). */
export function permissionsOf(a: Actor): Record<RolePermission, boolean> {
  return Object.fromEntries(ROLE_PERMISSIONS.map((p) => [p, allowed(a, p)])) as Record<RolePermission, boolean>;
}

/**
 * Whether this member may manage that custom role (change it, delete it, give it or take it away):
 * with `manageRoles`, admins and the owner any of them, others only the ones below their own.
 */
export function mayManageRole(a: Actor, r: Pick<CustomRoleRow, 'position'>): boolean {
  if (!allowed(a, 'manageRoles')) return false;
  return RANK[a.role] >= RANK.admin || r.position < (a.custom?.position ?? 0);
}

/** Who reads a channel: admins and up always, else from its lowest role, or a custom role let in. */
export function canRead(a: Actor | undefined, ch: Pick<ChannelRow, 'readRole' | 'readRoles'>): boolean {
  if (!a) return false;
  return RANK[a.role] >= RANK.admin || RANK[a.role] >= RANK[ch.readRole] || (!!a.custom && ch.readRoles.includes(a.custom.id));
}

/** Who writes there: a reader from its lowest role to write, a custom role let in, or with `postReadOnly`. */
export function canPost(a: Actor | undefined, ch: Pick<ChannelRow, 'readRole' | 'readRoles' | 'postRole' | 'writeRoles'>): boolean {
  if (!a || !canRead(a, ch)) return false;
  return RANK[a.role] >= RANK[ch.postRole] || (!!a.custom && ch.writeRoles.includes(a.custom.id)) || allowed(a, 'postReadOnly');
}

/** Whether `p` acts on someone (the clients compare the target's power). */
export const actsOnSomeone = (p: RolePermission) => ON_SOMEONE.has(p);

/**
 * A channel's name from a request: "#Handel ludzi" → "handel-ludzi" (letters of any language,
 * digits, - and _; 2–24 characters), or undefined.
 */
export function cleanChannelName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.normalize('NFC').trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '-');
  if (name.length < 2 || name.length > 24 || !/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(name)) return undefined;
  return name;
}

/** A role's name: 1–24 characters, no control characters, inner spaces folded; or undefined. */
export function cleanRoleName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 24 || /[\u0000-\u001f\u007f]/.test(name)) return undefined;
  return name;
}

/** "#a1b2c3" (any case, the # optional) as "#a1b2c3", or undefined. */
export function cleanColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(raw.trim());
  return m ? `#${m[1].toLowerCase()}` : undefined;
}

/** Known permissions only, each once, in the list's order; undefined when it is not a list of them. */
export function cleanPermissions(raw: unknown): RolePermission[] | undefined {
  if (!Array.isArray(raw) || raw.some((p) => typeof p !== 'string' || !PERMISSION_SET.has(p))) return undefined;
  return ROLE_PERMISSIONS.filter((p) => raw.includes(p));
}

export const offensiveName = (name: string) => offensive(name);

/**
 * The moderation log's kinds, for its filter: who moderated whom, roles, the community's settings
 * and channels, and members coming and going. Anything else (new kinds) shows under "all".
 */
export const LOG_GROUPS: Record<string, string[]> = {
  moderation: ['kick', 'ban', 'unban', 'mute', 'unmute', 'message_delete', 'report_delete', 'report_dismiss', 'admin_report_delete', 'admin_report_dismiss', 'pin', 'unpin', 'poll_close'],
  roles: ['role', 'transfer', 'heir', 'admin_transfer', 'role_create', 'role_edit', 'role_delete', 'role_order', 'member_role'],
  settings: ['create', 'edit', 'logo', 'logo_remove', 'admin_logo_remove', 'admin_description_remove', 'slowmode', 'channel_create', 'channel_edit', 'channel_delete', 'channel_order',
    'link_create', 'link_revoke', 'server', 'admin_verify', 'admin_unverify'],
  members: ['join', 'leave', 'accept', 'decline', 'invite', 'link_join'],
};

const ROLE_COLUMNS = 'id, community_id AS community, name, color, permissions, position, created_at AS createdAt';
type RawRole = Omit<CustomRoleRow, 'permissions'> & { permissions: string };
const toRole = (r: RawRole): CustomRoleRow => ({ ...r, permissions: cleanPermissions(JSON.parse(r.permissions || '[]')) ?? [] });

export class CommunityRoleStore {
  private sql: DatabaseSync;
  /** Each community's roles (a handful), dropped on every change of them. */
  private cache = new Map<string, CustomRoleRow[]>();

  /** After CommunityStore (its tables, and the columns added in 0.9.30). */
  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS community_roles (id TEXT PRIMARY KEY, community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE, name TEXT NOT NULL,
  color TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT '[]', position INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS community_roles_community ON community_roles(community_id, position);
CREATE INDEX IF NOT EXISTS community_members_custom_role ON community_members(community_id, custom_role);
`);
  }

  // ---------- custom roles ----------

  /** A community's roles, the highest first. */
  list(id: string): CustomRoleRow[] {
    let roles = this.cache.get(id);
    if (!roles) {
      roles = (this.sql.prepare(`SELECT ${ROLE_COLUMNS} FROM community_roles WHERE community_id = ? ORDER BY position DESC`).all(id) as unknown as RawRole[]).map(toRole);
      if (this.cache.size > 2000) this.cache.clear();
      this.cache.set(id, roles);
    }
    return roles;
  }

  role(id: string, rid: string | null | undefined): CustomRoleRow | undefined {
    return rid ? this.list(id).find((r) => r.id === rid) : undefined;
  }

  /** A member as the rules see them (no membership: a plain member). */
  actor(id: string, m: Pick<MemberRow, 'role' | 'customRole'> | undefined): Actor {
    if (!m) return { role: 'member' };
    const custom = this.role(id, m.customRole);
    return custom ? { role: m.role, custom } : { role: m.role };
  }

  nameTaken(id: string, name: string, except = ''): boolean {
    return this.list(id).some((r) => r.id !== except && r.name.toLowerCase() === name.toLowerCase());
  }

  /** A new role goes to the bottom (position 1; the others move up). */
  create(id: string, r: { name: string; color: string; permissions: RolePermission[] }, now = Date.now()): string {
    const rid = randomBytes(9).toString('base64url');
    this.sql.prepare('UPDATE community_roles SET position = position + 1 WHERE community_id = ?').run(id);
    this.sql.prepare('INSERT INTO community_roles (id, community_id, name, color, permissions, position, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
      .run(rid, id, r.name, r.color, JSON.stringify(r.permissions), now);
    this.cache.delete(id);
    return rid;
  }

  update(id: string, rid: string, r: { name: string; color: string; permissions: RolePermission[] }) {
    this.sql.prepare('UPDATE community_roles SET name = ?, color = ?, permissions = ? WHERE id = ? AND community_id = ?').run(r.name, r.color, JSON.stringify(r.permissions), rid, id);
    this.cache.delete(id);
  }

  /** Gone from its members and from the channels that let it in; the rest close the gap. */
  remove(id: string, rid: string) {
    const r = this.role(id, rid);
    if (!r) return;
    this.sql.prepare('DELETE FROM community_roles WHERE id = ?').run(rid);
    this.sql.prepare('UPDATE community_roles SET position = position - 1 WHERE community_id = ? AND position > ?').run(id, r.position);
    this.sql.prepare('UPDATE community_members SET custom_role = NULL WHERE community_id = ? AND custom_role = ?').run(id, rid);
    for (const ch of this.sql.prepare('SELECT id, read_roles AS readRoles, write_roles AS writeRoles FROM community_channels WHERE community_id = ?').all(id) as { id: string; readRoles: string | null; writeRoles: string | null }[]) {
      const read = JSON.parse(ch.readRoles || '[]') as string[], write = JSON.parse(ch.writeRoles || '[]') as string[];
      if (read.includes(rid) || write.includes(rid)) this.setAccessLists(ch.id, read.filter((x) => x !== rid), write.filter((x) => x !== rid));
    }
    this.cache.delete(id);
  }

  /** New positions: `order` the ids from the highest. */
  reorder(id: string, order: string[]) {
    const n = order.length;
    const set = this.sql.prepare('UPDATE community_roles SET position = ? WHERE id = ? AND community_id = ?');
    order.forEach((rid, i) => set.run(n - i, rid, id));
    this.cache.delete(id);
  }

  setMemberRole(id: string, uuid: string, rid: string | null) {
    this.sql.prepare('UPDATE community_members SET custom_role = ? WHERE community_id = ? AND uuid = ?').run(rid, id, uuid);
  }

  /** How many members have each role. */
  counts(id: string): Map<string, number> {
    const rows = this.sql.prepare('SELECT custom_role AS role, COUNT(*) AS n FROM community_members WHERE community_id = ? AND custom_role IS NOT NULL GROUP BY custom_role').all(id) as { role: string; n: number }[];
    return new Map(rows.map((r) => [r.role, r.n]));
  }

  /** Members whose custom role has one of these permissions (staff by a custom role: they hear of requests and reports). */
  holdersWith(id: string, perms: RolePermission[]): string[] {
    const roles = this.list(id).filter((r) => r.permissions.some((p) => perms.includes(p))).map((r) => r.id);
    if (!roles.length) return [];
    return (this.sql.prepare(`SELECT uuid FROM community_members WHERE community_id = ? AND custom_role IN (${roles.map(() => '?').join(',')})`).all(id, ...roles) as { uuid: string }[]).map((r) => r.uuid);
  }

  // ---------- channels ----------

  /**
   * The members who read a channel, when it is not for everyone (undefined then: all of them).
   * By the role index and the custom role's; admins and up always.
   */
  readers(id: string, ch: Pick<ChannelRow, 'readRole' | 'readRoles'>): Set<string> | undefined {
    if (ch.readRole === 'member') return undefined;
    const roles = (['owner', 'admin', 'moderator'] as CommunityRole[]).filter((r) => RANK[r] >= RANK[ch.readRole] || RANK[r] >= RANK.admin);
    const custom = ch.readRoles.filter((r) => this.role(id, r));
    const rows = this.sql.prepare(`SELECT uuid FROM community_members WHERE community_id = ? AND (role IN (${roles.map(() => '?').join(',')})${custom.length ? ` OR custom_role IN (${custom.map(() => '?').join(',')})` : ''})`)
      .all(id, ...roles, ...custom) as { uuid: string }[];
    return new Set(rows.map((r) => r.uuid));
  }

  channelCount(id: string): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM community_channels WHERE community_id = ?').get(id) as { n: number }).n;
  }

  /** A custom channel at the end of the list. */
  addChannel(id: string, c: { name: string; readRole: CommunityRole; postRole: CommunityRole; readRoles: string[]; writeRoles: string[] }, now = Date.now()): string {
    const ch = randomBytes(9).toString('base64url');
    const position = (this.sql.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM community_channels WHERE community_id = ?').get(id) as { n: number }).n;
    this.sql.prepare(`INSERT INTO community_channels (id, community_id, kind, name, post_role, position, created_at, read_role, read_roles, write_roles) VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?)`)
      .run(ch, id, c.name, c.postRole, position, now, c.readRole, c.readRoles.length ? JSON.stringify(c.readRoles) : null, c.writeRoles.length ? JSON.stringify(c.writeRoles) : null);
    return ch;
  }

  updateChannel(ch: string, c: { name: string; readRole: CommunityRole; postRole: CommunityRole; readRoles: string[]; writeRoles: string[] }) {
    this.sql.prepare('UPDATE community_channels SET name = ?, read_role = ?, post_role = ? WHERE id = ?').run(c.name, c.readRole, c.postRole, ch);
    this.setAccessLists(ch, c.readRoles, c.writeRoles);
  }

  private setAccessLists(ch: string, read: string[], write: string[]) {
    this.sql.prepare('UPDATE community_channels SET read_roles = ?, write_roles = ? WHERE id = ?').run(read.length ? JSON.stringify(read) : null, write.length ? JSON.stringify(write) : null, ch);
  }

  /** The channel and everything in it (messages, reactions, pins, reads), and its open reports. */
  removeChannel(id: string, ch: string) {
    this.sql.prepare('DELETE FROM community_reports WHERE community_id = ? AND message_id IN (SELECT id FROM community_messages WHERE channel_id = ?)').run(id, ch);
    this.sql.prepare('DELETE FROM community_channels WHERE id = ? AND community_id = ?').run(ch, id);
  }

  /** New positions: `order` every channel's id, the first at the top. */
  reorderChannels(id: string, order: string[]) {
    const set = this.sql.prepare('UPDATE community_channels SET position = ? WHERE id = ? AND community_id = ?');
    order.forEach((ch, i) => set.run(i, ch, id));
  }

  // ---------- the moderation log ----------

  /** A page of the log, the newest first: older than `before` (an entry's id), only these actions when given. */
  logPage(id: string, limit: number, before?: number, actions?: string[]): { id: number; at: number; by: string; action: string; target: string; detail: string }[] {
    const only = actions?.length ? `AND action IN (${actions.map(() => '?').join(',')})` : '';
    return this.sql.prepare(`SELECT id, at, by_uuid AS by, action, target, detail FROM community_log WHERE community_id = ? AND id < ? ${only} ORDER BY id DESC LIMIT ?`)
      .all(id, before ?? Number.MAX_SAFE_INTEGER, ...(actions ?? []), limit) as never;
  }
}
