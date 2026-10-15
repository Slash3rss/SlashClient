import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

/**
 * Storage for players, friendships and messages. One SQLite file; every query lives
 * here so the HTTP layer never touches SQL.
 */

/** A SlashClient account; `handle` is the unique name friends search for. */
export interface User { id: string; handle: string; name: string; avatar: string; showServer: boolean }
export type Provider = 'discord' | 'dev';
export interface Message { id: number; from: string; to: string; text: string; at: number; readAt: number | null }
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

/** Friendships are stored once, with the smaller uuid first. */
const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

export class Db {
  private db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  // ---- players and sessions ----

  /**
   * The account behind a login (Discord user, Minecraft profile…), created on first
   * sign-in. The name and avatar follow the provider; the handle stays once chosen.
   */
  signIn(provider: Provider, subject: string, wanted: { handle: string; name: string; avatar: string }): User {
    const now = Date.now();
    const known = this.db.prepare('SELECT uuid FROM identities WHERE provider = ? AND subject = ?').get(provider, subject) as { uuid: string } | undefined;
    if (known) {
      this.db.prepare('UPDATE users SET name = ?, avatar = ?, last_seen = ? WHERE uuid = ?').run(wanted.name, wanted.avatar, now, known.uuid);
      return this.user(known.uuid)!;
    }
    const uuid = randomUUID();
    const handle = this.freeHandle(wanted.handle);
    this.db.prepare('INSERT INTO users (uuid, handle, handle_lower, name, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuid, handle, handle.toLowerCase(), wanted.name, wanted.avatar, now, now);
    this.db.prepare('INSERT INTO identities (provider, subject, uuid) VALUES (?, ?, ?)').run(provider, subject, uuid);
    return this.user(uuid)!;
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
    const row = this.db.prepare('SELECT uuid, handle, name, avatar, show_server FROM users WHERE uuid = ?').get(uuid) as
      { uuid: string; handle: string; name: string; avatar: string; show_server: number } | undefined;
    return row && { id: row.uuid, handle: row.handle, name: row.name, avatar: row.avatar, showServer: !!row.show_server };
  }

  userByHandle(handle: string): User | undefined {
    const row = this.db.prepare('SELECT uuid FROM users WHERE handle_lower = ?').get(handle.toLowerCase()) as { uuid: string } | undefined;
    return row && this.user(row.uuid);
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

  addMessage(from: string, to: string, text: string): Message {
    const at = Date.now();
    const { lastInsertRowid } = this.db.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at) VALUES (?, ?, ?, ?)').run(from, to, text, at);
    return { id: Number(lastInsertRowid), from, to, text, at, readAt: null };
  }

  /** The conversation between two players, newest last; `before` pages back by message id. */
  conversation(x: string, y: string, limit: number, before?: number): Message[] {
    const rows = this.db.prepare(`SELECT id, from_uuid AS "from", to_uuid AS "to", text, created_at AS at, read_at AS readAt FROM messages
      WHERE ((from_uuid = ? AND to_uuid = ?) OR (from_uuid = ? AND to_uuid = ?)) AND id < ?
      ORDER BY id DESC LIMIT ?`).all(x, y, y, x, before ?? Number.MAX_SAFE_INTEGER, limit) as unknown as Message[];
    return rows.reverse();
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
