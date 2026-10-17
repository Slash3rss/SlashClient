import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

/**
 * Storage for players, friendships and messages. One SQLite file; every query lives
 * here so the HTTP layer never touches SQL.
 */

/** A SlashClient account; `handle` is the unique name friends search for. */
/** `cape`: one of the SlashClient capes (cosmetics.ts), '' for none. `role`: 'admin' or ''. */
export interface User { id: string; handle: string; name: string; avatar: string; showServer: boolean; cape: string; role: string; banned: boolean }
/** An account as the admin panel lists it. */
export interface AdminUser extends User { createdAt: number; lastSeen: number; providers: string[]; friends: number; sessions: number }
export interface CosmeticSetting { id: string; enabled: boolean; exclusive: boolean }
export interface LogEntry { id: number; at: number; admin: string; action: string; target: string; detail: string }
export type Provider = 'discord' | 'microsoft' | 'google' | 'github' | 'dev' | 'minecraft';
/** "Join me": a server to play on together, sent as a message so it stays in the chat. */
export interface Invite { server: string; version?: string }
export interface Message { id: number; from: string; to: string; text: string; at: number; readAt: number | null; invite?: Invite }
/** Another player as friends lists show them. */
export interface Person { id: string; handle: string; name: string; avatar: string }
export interface Request extends Person { at: number }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  uuid TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  handle_lower TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  show_server INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  PRIMARY KEY (provider, subject)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friendships (
  a TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS requests (
  from_uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  to_uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_uuid, to_uuid)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  to_uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_uuid, to_uuid, id);
CREATE INDEX IF NOT EXISTS messages_unread ON messages(to_uuid, read_at);
`;

interface UserRow { uuid: string; handle: string; name: string; avatar: string; show_server: number; cape: string; role: string; banned: number }
const toUser = (r: UserRow): User => ({ id: r.uuid, handle: r.handle, name: r.name, avatar: r.avatar, showServer: !!r.show_server, cape: r.cape, role: r.role, banned: !!r.banned });

/** Friendships are stored once, with the smaller uuid first. */
const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

export class Db {
  private db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    // added after the first release: older files get the column on start
    const columns = this.db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'invite')) this.db.exec('ALTER TABLE messages ADD COLUMN invite TEXT');
    const userColumns = this.db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    if (!userColumns.some((c) => c.name === 'cape')) this.db.exec("ALTER TABLE users ADD COLUMN cape TEXT NOT NULL DEFAULT ''");
    if (!userColumns.some((c) => c.name === 'role')) this.db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT ''");
    if (!userColumns.some((c) => c.name === 'banned')) this.db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
    // the Minecraft name of a linked Minecraft account (other providers leave it empty)
    const identityColumns = this.db.prepare('PRAGMA table_info(identities)').all() as { name: string }[];
    if (!identityColumns.some((c) => c.name === 'label')) this.db.exec("ALTER TABLE identities ADD COLUMN label TEXT NOT NULL DEFAULT ''");
    this.db.exec(`
CREATE TABLE IF NOT EXISTS cosmetics (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, exclusive INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS cape_grants (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, cape TEXT NOT NULL, PRIMARY KEY (uuid, cape));
CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, admin TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
`);
  }

  close() {
    this.db.close();
  }

  // ---- players and sessions ----

  /**
   * The account behind a login, created on first sign-in (Minecraft and the test login create
   * accounts; Discord and the rest only sign in to accounts they are linked to, see `owner`).
   * The name stays as it was at the start; the avatar follows the provider when it has one.
   */
  signIn(provider: Provider, subject: string, wanted: { handle: string; name: string; avatar: string }, label = ''): User {
    const now = Date.now();
    const known = this.owner(provider, subject);
    if (known) {
      if (wanted.avatar) this.db.prepare('UPDATE users SET avatar = ? WHERE uuid = ?').run(wanted.avatar, known);
      this.db.prepare('UPDATE users SET last_seen = ? WHERE uuid = ?').run(now, known);
      if (label) this.db.prepare('UPDATE identities SET label = ? WHERE provider = ? AND subject = ?').run(label, provider, subject);
      return this.user(known)!;
    }
    const uuid = randomUUID();
    const handle = this.freeHandle(wanted.handle);
    this.db.prepare('INSERT INTO users (uuid, handle, handle_lower, name, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuid, handle, handle.toLowerCase(), wanted.name, wanted.avatar, now, now);
    this.db.prepare('INSERT INTO identities (provider, subject, uuid, label) VALUES (?, ?, ?, ?)').run(provider, subject, uuid, label);
    return this.user(uuid)!;
  }

  /** Whose account a login belongs to, if anyone's. */
  owner(provider: Provider, subject: string): string | undefined {
    return (this.db.prepare('SELECT uuid FROM identities WHERE provider = ? AND subject = ?').get(provider, subject) as { uuid: string } | undefined)?.uuid;
  }

  /** The Minecraft accounts linked to an account: Mojang uuid (no dashes) and name. */
  minecraftAccounts(uuid: string): { uuid: string; name: string }[] {
    return (this.db.prepare("SELECT subject, label FROM identities WHERE uuid = ? AND provider = 'minecraft' ORDER BY label").all(uuid) as { subject: string; label: string }[])
      .map((r) => ({ uuid: r.subject, name: r.label }));
  }

  /** How many ways there are to sign in to an account (each Minecraft account counts). */
  identityCount(uuid: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM identities WHERE uuid = ?').get(uuid) as { n: number }).n;
  }

  unlinkIdentity(uuid: string, provider: Provider, subject: string): boolean {
    return this.db.prepare('DELETE FROM identities WHERE uuid = ? AND provider = ? AND subject = ?').run(uuid, provider, subject).changes > 0;
  }

  /** Adds a sign-in method to an account; false when it already belongs to someone. */
  link(provider: Provider, subject: string, uuid: string, label = ''): boolean {
    const owner = this.owner(provider, subject);
    if (owner) {
      if (owner === uuid && label) this.db.prepare('UPDATE identities SET label = ? WHERE provider = ? AND subject = ?').run(label, provider, subject);
      return owner === uuid;
    }
    this.db.prepare('INSERT INTO identities (provider, subject, uuid, label) VALUES (?, ?, ?, ?)').run(provider, subject, uuid, label);
    return true;
  }

  unlink(uuid: string, provider: string) {
    this.db.prepare('DELETE FROM identities WHERE uuid = ? AND provider = ?').run(uuid, provider);
  }

  providers(uuid: string): string[] {
    return (this.db.prepare('SELECT DISTINCT provider FROM identities WHERE uuid = ? ORDER BY provider').all(uuid) as { provider: string }[]).map((r) => r.provider);
  }

  /** `base`, or `base2`, `base3`… when someone already has it. */
  private freeHandle(base: string): string {
    const clean = base.replace(/[^\w.]/g, '').slice(0, 24) || 'gracz';
    for (let n = 1; ; n++) {
      const handle = n === 1 ? clean : `${clean}${n}`;
      if (!this.db.prepare('SELECT 1 FROM users WHERE handle_lower = ?').get(handle.toLowerCase())) return handle;
    }
  }

  user(uuid: string): User | undefined {
    const row = this.db.prepare('SELECT uuid, handle, name, avatar, show_server, cape, role, banned FROM users WHERE uuid = ?').get(uuid) as UserRow | undefined;
    return row && toUser(row);
  }

  userByHandle(handle: string): User | undefined {
    const row = this.db.prepare('SELECT uuid FROM users WHERE handle_lower = ?').get(handle.toLowerCase()) as { uuid: string } | undefined;
    return row && this.user(row.uuid);
  }

  setCape(uuid: string, cape: string) {
    this.db.prepare('UPDATE users SET cape = ? WHERE uuid = ?').run(cape, uuid);
  }

  setRole(uuid: string, role: string) {
    this.db.prepare('UPDATE users SET role = ? WHERE uuid = ?').run(role, uuid);
  }

  setBanned(uuid: string, banned: boolean) {
    this.db.prepare('UPDATE users SET banned = ? WHERE uuid = ?').run(banned ? 1 : 0, uuid);
    if (banned) this.removeSessions(uuid);
  }

  /** Removes an account with everything that hangs on it (sign-ins, sessions, friends, messages, grants). */
  deleteUser(uuid: string) {
    this.db.prepare('DELETE FROM messages WHERE from_uuid = ? OR to_uuid = ?').run(uuid, uuid);
    this.db.prepare('DELETE FROM users WHERE uuid = ?').run(uuid);
  }

  removeSessions(uuid: string) {
    this.db.prepare('DELETE FROM sessions WHERE uuid = ?').run(uuid);
  }

  // ---- the admin panel ----

  /** Accounts matching `query` (handle, name or id), newest first. */
  listUsers(query: string, limit: number, offset: number): { users: AdminUser[]; total: number } {
    const like = `%${query.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const where = "WHERE handle_lower LIKE ? ESCAPE '\\' OR lower(name) LIKE ? ESCAPE '\\' OR uuid = ?";
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM users ${where}`).get(like, like, query) as { n: number }).n;
    const rows = this.db.prepare(`SELECT uuid FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(like, like, query, limit, offset) as { uuid: string }[];
    return { users: rows.map((r) => this.adminUser(r.uuid)!), total };
  }

  adminUser(uuid: string): AdminUser | undefined {
    const row = this.db.prepare('SELECT uuid, handle, name, avatar, show_server, cape, role, banned, created_at, last_seen FROM users WHERE uuid = ?').get(uuid) as
      (UserRow & { created_at: number; last_seen: number }) | undefined;
    if (!row) return undefined;
    const count = (sql: string, ...args: string[]) => (this.db.prepare(sql).get(...args) as { n: number }).n;
    return {
      ...toUser(row), createdAt: row.created_at, lastSeen: row.last_seen, providers: this.providers(uuid),
      friends: count('SELECT COUNT(*) AS n FROM friendships WHERE a = ? OR b = ?', uuid, uuid),
      sessions: count('SELECT COUNT(*) AS n FROM sessions WHERE uuid = ?', uuid),
    };
  }

  stats(since: number) {
    const n = (sql: string, ...args: (string | number)[]) => (this.db.prepare(sql).get(...args) as { n: number }).n;
    const capes = this.db.prepare("SELECT cape, COUNT(*) AS n FROM users WHERE cape != '' GROUP BY cape").all() as { cape: string; n: number }[];
    return {
      users: n('SELECT COUNT(*) AS n FROM users'),
      newUsers: n('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', since),
      activeUsers: n('SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?', since),
      banned: n('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
      friendships: n('SELECT COUNT(*) AS n FROM friendships'),
      messages: n('SELECT COUNT(*) AS n FROM messages'),
      newMessages: n('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ?', since),
      capes: Object.fromEntries(capes.map((c) => [c.cape, c.n])),
    };
  }

  /** Accounts made per day over the last `days` days (oldest first), for the chart. */
  signupsPerDay(days: number): number[] {
    const dayMs = 86_400_000;
    const start = Math.floor(Date.now() / dayMs) * dayMs - (days - 1) * dayMs;
    const out = new Array<number>(days).fill(0);
    for (const r of this.db.prepare('SELECT created_at FROM users WHERE created_at >= ?').all(start) as { created_at: number }[]) {
      out[Math.floor((r.created_at - start) / dayMs)]++;
    }
    return out;
  }

  cosmeticSettings(): Map<string, CosmeticSetting> {
    const rows = this.db.prepare('SELECT id, enabled, exclusive FROM cosmetics').all() as { id: string; enabled: number; exclusive: number }[];
    return new Map(rows.map((r) => [r.id, { id: r.id, enabled: !!r.enabled, exclusive: !!r.exclusive }]));
  }

  setCosmetic(id: string, enabled: boolean, exclusive: boolean) {
    this.db.prepare('INSERT INTO cosmetics (id, enabled, exclusive) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, exclusive = excluded.exclusive')
      .run(id, enabled ? 1 : 0, exclusive ? 1 : 0);
  }

  grants(uuid: string): string[] {
    return (this.db.prepare('SELECT cape FROM cape_grants WHERE uuid = ? ORDER BY cape').all(uuid) as { cape: string }[]).map((r) => r.cape);
  }

  /** Who may wear an exclusive cape. */
  grantees(cape: string): { id: string; handle: string; name: string }[] {
    return (this.db.prepare('SELECT u.uuid AS id, u.handle, u.name FROM cape_grants g JOIN users u ON u.uuid = g.uuid WHERE g.cape = ? ORDER BY u.handle_lower').all(cape)) as { id: string; handle: string; name: string }[];
  }

  grant(uuid: string, cape: string) {
    this.db.prepare('INSERT OR IGNORE INTO cape_grants (uuid, cape) VALUES (?, ?)').run(uuid, cape);
  }

  revoke(uuid: string, cape: string) {
    this.db.prepare('DELETE FROM cape_grants WHERE uuid = ? AND cape = ?').run(uuid, cape);
  }

  /** Takes a cape off everyone wearing it who may not any more. */
  clearCape(cape: string, exceptGranted: boolean) {
    this.db.prepare(`UPDATE users SET cape = '' WHERE cape = ?${exceptGranted ? ' AND uuid NOT IN (SELECT uuid FROM cape_grants WHERE cape = ?)' : ''}`)
      .run(...(exceptGranted ? [cape, cape] : [cape]));
  }

  log(admin: string, action: string, target: string, detail = '') {
    this.db.prepare('INSERT INTO admin_log (at, admin, action, target, detail) VALUES (?, ?, ?, ?, ?)').run(Date.now(), admin, action, target, detail);
  }

  logEntries(limit: number): LogEntry[] {
    return this.db.prepare('SELECT id, at, admin, action, target, detail FROM admin_log ORDER BY id DESC LIMIT ?').all(limit) as unknown as LogEntry[];
  }

  setShowServer(uuid: string, show: boolean) {
    this.db.prepare('UPDATE users SET show_server = ? WHERE uuid = ?').run(show ? 1 : 0, uuid);
  }

  touch(uuid: string) {
    this.db.prepare('UPDATE users SET last_seen = ? WHERE uuid = ?').run(Date.now(), uuid);
  }

  lastSeen(uuid: string): number {
    return (this.db.prepare('SELECT last_seen FROM users WHERE uuid = ?').get(uuid) as { last_seen: number } | undefined)?.last_seen ?? 0;
  }

  addSession(tokenHash: string, uuid: string) {
    const now = Date.now();
    this.db.prepare('INSERT INTO sessions (token_hash, uuid, created_at, last_used) VALUES (?, ?, ?, ?)').run(tokenHash, uuid, now, now);
  }

  /** The player behind a session; sessions unused for `maxIdleMs` are gone. */
  sessionUser(tokenHash: string, maxIdleMs: number): string | undefined {
    const row = this.db.prepare('SELECT uuid, last_used FROM sessions WHERE token_hash = ?').get(tokenHash) as { uuid: string; last_used: number } | undefined;
    if (!row) return undefined;
    const now = Date.now();
    if (now - row.last_used > maxIdleMs) {
      this.removeSession(tokenHash);
      return undefined;
    }
    // writing on every request is wasteful; once an hour is enough for expiry
    if (now - row.last_used > 3_600_000) this.db.prepare('UPDATE sessions SET last_used = ? WHERE token_hash = ?').run(now, tokenHash);
    return row.uuid;
  }

  removeSession(tokenHash: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  // ---- friends ----

  areFriends(x: string, y: string): boolean {
    const [a, b] = pair(x, y);
    return !!this.db.prepare('SELECT 1 FROM friendships WHERE a = ? AND b = ?').get(a, b);
  }

  friends(uuid: string): (Person & { since: number })[] {
    return this.db.prepare(`SELECT u.uuid AS id, u.handle, u.name, u.avatar, f.created_at AS since FROM friendships f
      JOIN users u ON u.uuid = CASE WHEN f.a = ? THEN f.b ELSE f.a END
      WHERE f.a = ? OR f.b = ? ORDER BY u.handle_lower`).all(uuid, uuid, uuid) as unknown as (Person & { since: number })[];
  }

  addFriendship(x: string, y: string) {
    const [a, b] = pair(x, y);
    this.db.prepare('INSERT OR IGNORE INTO friendships (a, b, created_at) VALUES (?, ?, ?)').run(a, b, Date.now());
    this.db.prepare('DELETE FROM requests WHERE (from_uuid = ? AND to_uuid = ?) OR (from_uuid = ? AND to_uuid = ?)').run(x, y, y, x);
  }

  removeFriendship(x: string, y: string): boolean {
    const [a, b] = pair(x, y);
    return Number(this.db.prepare('DELETE FROM friendships WHERE a = ? AND b = ?').run(a, b).changes) > 0;
  }

  hasRequest(from: string, to: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM requests WHERE from_uuid = ? AND to_uuid = ?').get(from, to);
  }

  addRequest(from: string, to: string) {
    this.db.prepare('INSERT OR IGNORE INTO requests (from_uuid, to_uuid, created_at) VALUES (?, ?, ?)').run(from, to, Date.now());
  }

  removeRequest(from: string, to: string): boolean {
    return Number(this.db.prepare('DELETE FROM requests WHERE from_uuid = ? AND to_uuid = ?').run(from, to).changes) > 0;
  }

  incoming(uuid: string): Request[] {
    return this.db.prepare(`SELECT u.uuid AS id, u.handle, u.name, u.avatar, r.created_at AS at FROM requests r JOIN users u ON u.uuid = r.from_uuid
      WHERE r.to_uuid = ? ORDER BY r.created_at DESC`).all(uuid) as unknown as Request[];
  }

  outgoing(uuid: string): Request[] {
    return this.db.prepare(`SELECT u.uuid AS id, u.handle, u.name, u.avatar, r.created_at AS at FROM requests r JOIN users u ON u.uuid = r.to_uuid
      WHERE r.from_uuid = ? ORDER BY r.created_at DESC`).all(uuid) as unknown as Request[];
  }

  // ---- messages ----

  addMessage(from: string, to: string, text: string, invite?: Invite): Message {
    const at = Date.now();
    const { lastInsertRowid } = this.db.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at, invite) VALUES (?, ?, ?, ?, ?)')
      .run(from, to, text, at, invite ? JSON.stringify(invite) : null);
    return { id: Number(lastInsertRowid), from, to, text, at, readAt: null, ...(invite ? { invite } : {}) };
  }

  /** The conversation between two players, newest last; `before` pages back by message id. */
  conversation(x: string, y: string, limit: number, before?: number): Message[] {
    const rows = this.db.prepare(`SELECT id, from_uuid AS "from", to_uuid AS "to", text, created_at AS at, read_at AS readAt, invite FROM messages
      WHERE ((from_uuid = ? AND to_uuid = ?) OR (from_uuid = ? AND to_uuid = ?)) AND id < ?
      ORDER BY id DESC LIMIT ?`).all(x, y, y, x, before ?? Number.MAX_SAFE_INTEGER, limit) as unknown as (Omit<Message, 'invite'> & { invite: string | null })[];
    return rows.reverse().map(({ invite, ...m }) => (invite ? { ...m, invite: JSON.parse(invite) as Invite } : m));
  }

  /** Marks what `from` sent to `reader` as read; returns the time used, or undefined when nothing was unread. */
  markRead(reader: string, from: string): number | undefined {
    const at = Date.now();
    const { changes } = this.db.prepare('UPDATE messages SET read_at = ? WHERE to_uuid = ? AND from_uuid = ? AND read_at IS NULL').run(at, reader, from);
    return Number(changes) > 0 ? at : undefined;
  }

  unreadCounts(uuid: string): Record<string, number> {
    const rows = this.db.prepare('SELECT from_uuid AS "from", COUNT(*) AS n FROM messages WHERE to_uuid = ? AND read_at IS NULL GROUP BY from_uuid').all(uuid) as { from: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.from, Number(r.n)]));
  }

  /** Time of the newest message with each friend, for sorting conversations. */
  lastMessageTimes(uuid: string): Record<string, number> {
    const rows = this.db.prepare(`SELECT CASE WHEN from_uuid = ? THEN to_uuid ELSE from_uuid END AS other, MAX(created_at) AS at
      FROM messages WHERE from_uuid = ? OR to_uuid = ? GROUP BY other`).all(uuid, uuid, uuid) as { other: string; at: number }[];
    return Object.fromEntries(rows.map((r) => [r.other, Number(r.at)]));
  }
}
