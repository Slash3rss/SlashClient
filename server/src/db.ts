import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

/**
 * Storage for players, friendships and messages. One SQLite file; every query lives
 * here so the HTTP layer never touches SQL.
 */

/** A SlashClient account; `handle` is the unique name friends search for. */
/**
 * `cape`: one of the SlashClient capes (cosmetics.ts), '' for none. `role`: 'admin' or ''.
 * `rank`: the colour of the logo next to the name in game: 'support', 'partner', 'friend', 'friend_pink' or '' (admins are red anyway).
 */
export interface User { id: string; handle: string; name: string; avatar: string; showServer: boolean; cape: string; role: string; rank: string; banned: boolean; loadout: Record<string, string> }
/** An account as the admin panel lists it. */
export interface AdminUser extends User {
  createdAt: number; lastSeen: number; providers: string[]; friends: number; sessions: number;
  /** the cape each linked Minecraft account wears in game: its own set's, or else the account's ('' for none) */
  worn: { name: string; cape: string }[];
}
export interface CosmeticSetting {
  id: string; enabled: boolean; exclusive: boolean;
  /** The shop's price set in the admin panel (economy.ts): a number, null = not sold, missing = as cosmetics.ts has it. */
  price?: number | null;
}
export interface LogEntry { id: number; at: number; admin: string; action: string; target: string; detail: string }
export type Provider = 'discord' | 'microsoft' | 'google' | 'github' | 'dev' | 'minecraft';
/** "Join me": a server to play on together, sent as a message so it stays in the chat. */
/** `party`: the invite is one of a party's (sharing.ts), so Join also says "I'm in". */
export interface Invite { server: string; version?: string; party?: string }
/** A waypoint a friend shared: where it is and in which world (`server:<address>` or `world:<name>`, as the HUD keys them). */
export interface SharedWaypoint { name: string; x: number; y: number; z: number; dimension: string; world: string }
export interface Message { id: number; from: string; to: string; text: string; at: number; readAt: number | null; invite?: Invite; waypoint?: SharedWaypoint }
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

interface UserRow { uuid: string; handle: string; name: string; avatar: string; show_server: number; cape: string; role: string; rank: string; banned: number; loadout: string }
/** Wings, elytra, trail, aura, pet, clothing and kill effect (the cape has its own column); broken JSON counts as nothing. */
function parseLoadout(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json || '{}');
    return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string' && x)) as Record<string, string> : {};
  } catch {
    return {};
  }
}
/**
 * The avatar shown for an account (table alias `t`): the face from its first Minecraft account's skin
 * (the server cuts it, /v1/head/<uuid>), or the sign-in provider's picture when the player picked that
 * or has no Minecraft account; '' when there is neither (the pages then show a letter).
 */
const AVATAR = (t: string) => `CASE WHEN ${t}.avatar_source = 'provider' AND ${t}.avatar != '' THEN ${t}.avatar
  ELSE COALESCE(
    (SELECT '/v1/head/' || i.subject FROM identities i WHERE i.uuid = ${t}.uuid AND i.provider = 'minecraft' AND ${t}.avatar_source = 'mc:' || i.subject),
    (SELECT '/v1/head/' || i.subject FROM identities i WHERE i.uuid = ${t}.uuid AND i.provider = 'minecraft' ORDER BY i.rowid LIMIT 1),
    NULLIF(${t}.avatar, ''), '') END`;

const toUser = (r: UserRow): User => ({ id: r.uuid, handle: r.handle, name: r.name, avatar: r.avatar, showServer: !!r.show_server, cape: r.cape, role: r.role, rank: r.rank, banned: !!r.banned, loadout: parseLoadout(r.loadout) });

/** A bug report as the tracker lists it; `authorHandle` is null once the account is gone. */
export interface Bug { id: number; author: string; authorHandle: string | null; title: string; body: string; logId: string; version: string; os: string; status: string; createdAt: number; updatedAt: number; comments: number }
export interface BugComment { id: number; author: string; authorHandle: string | null; authorRole: string | null; body: string; createdAt: number }

/** A profile pack shared by code: what the lists show, the file itself is on disk. */
export interface ProfileShare { code: string; owner: string; ownerHandle: string | null; name: string; gameVersion: string; loader: string; size: number; downloads: number; createdAt: number; expiresAt: number }
const SHARE_COLUMNS = 's.code, s.owner, s.name, s.game_version AS gameVersion, s.loader, s.size, s.downloads, s.created_at AS createdAt, s.expires_at AS expiresAt';

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
    // shared waypoints ride along with a message too (JSON), so they stay in the chat
    if (!columns.some((c) => c.name === 'waypoint')) this.db.exec('ALTER TABLE messages ADD COLUMN waypoint TEXT');
    // partners pinned on top of the game's server list, some of them taking turns at the very top
    const partnerColumns = this.db.prepare('PRAGMA table_info(partners)').all() as { name: string }[];
    if (partnerColumns.length && !partnerColumns.some((c) => c.name === 'pinned')) {
      this.db.exec('ALTER TABLE partners ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
      this.db.exec('ALTER TABLE partners ADD COLUMN rotate INTEGER NOT NULL DEFAULT 0');
      // SkyUp was pinned in the mod itself before: it stays pinned
      this.db.exec("UPDATE partners SET pinned = 1 WHERE address = 'skyup.pl'");
    }
    const userColumns = this.db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    if (!userColumns.some((c) => c.name === 'cape')) this.db.exec("ALTER TABLE users ADD COLUMN cape TEXT NOT NULL DEFAULT ''");
    if (!userColumns.some((c) => c.name === 'role')) this.db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT ''");
    if (!userColumns.some((c) => c.name === 'banned')) this.db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
    if (!userColumns.some((c) => c.name === 'rank')) this.db.exec("ALTER TABLE users ADD COLUMN rank TEXT NOT NULL DEFAULT ''");
    if (!userColumns.some((c) => c.name === 'loadout')) this.db.exec("ALTER TABLE users ADD COLUMN loadout TEXT NOT NULL DEFAULT '{}'");
    // which picture is the avatar: '' (the Minecraft face, the default) or 'provider' (Discord's, Google's…)
    if (!userColumns.some((c) => c.name === 'avatar_source')) this.db.exec("ALTER TABLE users ADD COLUMN avatar_source TEXT NOT NULL DEFAULT ''");
    // the Minecraft name of a linked Minecraft account (other providers leave it empty)
    const identityColumns = this.db.prepare('PRAGMA table_info(identities)').all() as { name: string }[];
    if (!identityColumns.some((c) => c.name === 'label')) this.db.exec("ALTER TABLE identities ADD COLUMN label TEXT NOT NULL DEFAULT ''");
    // a Minecraft account's own cosmetics (cape and the other slots, JSON); '' = the account's default
    if (!identityColumns.some((c) => c.name === 'loadout')) this.db.exec("ALTER TABLE identities ADD COLUMN loadout TEXT NOT NULL DEFAULT ''");
    this.db.exec(`
CREATE TABLE IF NOT EXISTS cosmetics (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, exclusive INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS cape_grants (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, cape TEXT NOT NULL, PRIMARY KEY (uuid, cape));
CREATE TABLE IF NOT EXISTS device_keys (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, device TEXT NOT NULL, pub TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uuid, device));
CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL, lines INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bugs (id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, log_id TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', os TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bug_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, bug_id INTEGER NOT NULL REFERENCES bugs(id) ON DELETE CASCADE, author TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS bug_comments_bug ON bug_comments(bug_id, id);
CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, address TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, rotate INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, admin TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS profile_shares (code TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', game_version TEXT NOT NULL DEFAULT '', loader TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL, downloads INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS profile_shares_owner ON profile_shares(owner, created_at);
`);
  }

  close() {
    this.db.close();
  }

  /** The connection itself, for stores kept in files of their own (achievements.ts). */
  get sql(): DatabaseSync {
    return this.db;
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

  /**
   * The Minecraft accounts linked to an account: Mojang uuid (no dashes), name, and what that
   * character wears when it has its own set (cape among the slots), else null: the account's default.
   */
  minecraftAccounts(uuid: string): { uuid: string; name: string; loadout: Record<string, string> | null }[] {
    // in the order they were linked (the table's own row numbers grow with each link)
    return (this.db.prepare("SELECT subject, label, loadout FROM identities WHERE uuid = ? AND provider = 'minecraft' ORDER BY rowid").all(uuid) as { subject: string; label: string; loadout: string }[])
      .map((r) => ({ uuid: r.subject, name: r.label, loadout: r.loadout ? parseLoadout(r.loadout) : null }));
  }

  /** A character's own set (null = none: it wears the account's), only for one of `uuid`'s own. */
  characterLoadout(uuid: string, subject: string): Record<string, string> | null {
    const row = this.db.prepare("SELECT loadout FROM identities WHERE uuid = ? AND provider = 'minecraft' AND subject = ?").get(uuid, subject) as { loadout: string } | undefined;
    return row?.loadout ? parseLoadout(row.loadout) : null;
  }

  /** Gives a character its own set, or (null) sends it back to the account's default. */
  setCharacterLoadout(uuid: string, subject: string, loadout: Record<string, string> | null) {
    this.db.prepare("UPDATE identities SET loadout = ? WHERE uuid = ? AND provider = 'minecraft' AND subject = ?").run(loadout ? JSON.stringify(loadout) : '', uuid, subject);
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
    const row = this.db.prepare(`SELECT uuid, handle, name, ${AVATAR('users')} AS avatar, show_server, cape, role, rank, banned, loadout FROM users WHERE uuid = ?`).get(uuid) as UserRow | undefined;
    return row && toUser(row);
  }

  userByHandle(handle: string): User | undefined {
    const row = this.db.prepare('SELECT uuid FROM users WHERE handle_lower = ?').get(handle.toLowerCase()) as { uuid: string } | undefined;
    return row && this.user(row.uuid);
  }

  /**
   * The avatar the player picked ('' = the first Minecraft account's face, 'mc:<uuid>' = that account's,
   * 'provider' = the sign-in provider's picture), and that picture.
   */
  avatarChoice(uuid: string): { source: string; provider: string } {
    const row = this.db.prepare('SELECT avatar_source, avatar FROM users WHERE uuid = ?').get(uuid) as { avatar_source: string; avatar: string } | undefined;
    return { source: row?.avatar_source ?? '', provider: row?.avatar ?? '' };
  }

  setAvatarSource(uuid: string, source: string) {
    this.db.prepare('UPDATE users SET avatar_source = ? WHERE uuid = ?').run(source, uuid);
  }

  setCape(uuid: string, cape: string) {
    this.db.prepare('UPDATE users SET cape = ? WHERE uuid = ?').run(cape, uuid);
  }

  // ---- chat encryption: the public keys of each account's launchers ----

  /** Adds or refreshes a launcher's key; an account keeps its 10 most recent launchers. */
  setDeviceKey(uuid: string, device: string, pub: string) {
    this.db.prepare('INSERT INTO device_keys (uuid, device, pub, at) VALUES (?, ?, ?, ?) ON CONFLICT (uuid, device) DO UPDATE SET pub = excluded.pub, at = excluded.at')
      .run(uuid, device, pub, Date.now());
    this.db.prepare('DELETE FROM device_keys WHERE uuid = ? AND device NOT IN (SELECT device FROM device_keys WHERE uuid = ? ORDER BY at DESC LIMIT 10)').run(uuid, uuid);
  }

  deviceKeys(uuid: string): { device: string; pub: string }[] {
    return this.db.prepare('SELECT device, pub FROM device_keys WHERE uuid = ? ORDER BY at DESC').all(uuid) as { device: string; pub: string }[];
  }

  setRank(uuid: string, rank: string) {
    this.db.prepare('UPDATE users SET rank = ? WHERE uuid = ?').run(rank, uuid);
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
    const row = this.db.prepare(`SELECT uuid, handle, name, ${AVATAR('users')} AS avatar, show_server, cape, role, rank, banned, loadout, created_at, last_seen FROM users WHERE uuid = ?`).get(uuid) as
      (UserRow & { created_at: number; last_seen: number }) | undefined;
    if (!row) return undefined;
    const count = (sql: string, ...args: string[]) => (this.db.prepare(sql).get(...args) as { n: number }).n;
    return {
      ...toUser(row), createdAt: row.created_at, lastSeen: row.last_seen, providers: this.providers(uuid),
      friends: count('SELECT COUNT(*) AS n FROM friendships WHERE a = ? OR b = ?', uuid, uuid),
      sessions: count('SELECT COUNT(*) AS n FROM sessions WHERE uuid = ?', uuid),
      worn: this.minecraftAccounts(uuid).map((a) => ({ name: a.name, cape: a.loadout ? a.loadout.cape ?? '' : row.cape })),
    };
  }

  stats(since: number) {
    const n = (sql: string, ...args: (string | number)[]) => (this.db.prepare(sql).get(...args) as { n: number }).n;
    // what players wear in game: each Minecraft account's own cape (set in the client), or else the account's; a player counts once per cape
    const capes: Record<string, number> = {};
    const own = new Map<string, string[]>();
    for (const r of this.db.prepare("SELECT uuid, loadout FROM identities WHERE provider = 'minecraft'").all() as { uuid: string; loadout: string }[]) {
      own.set(r.uuid, [...(own.get(r.uuid) ?? []), r.loadout]);
    }
    for (const u of this.db.prepare('SELECT uuid, cape FROM users').all() as { uuid: string; cape: string }[]) {
      const accounts = own.get(u.uuid);
      const worn = new Set(accounts ? accounts.map((l) => (l ? parseLoadout(l).cape ?? '' : u.cape)) : [u.cape]);
      for (const id of worn) if (id) capes[id] = (capes[id] ?? 0) + 1;
    }
    return {
      users: n('SELECT COUNT(*) AS n FROM users'),
      newUsers: n('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', since),
      activeUsers: n('SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?', since),
      banned: n('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
      friendships: n('SELECT COUNT(*) AS n FROM friendships'),
      messages: n('SELECT COUNT(*) AS n FROM messages'),
      newMessages: n('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ?', since),
      capes,
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
    const out = new Map<string, CosmeticSetting>(rows.map((r) => [r.id, { id: r.id, enabled: !!r.enabled, exclusive: !!r.exclusive }]));
    // the shop's prices (economy.ts keeps them; not there in a database without the shop)
    try {
      for (const r of this.db.prepare('SELECT id, price FROM shop_prices').all() as { id: string; price: number | null }[]) {
        out.set(r.id, { ...(out.get(r.id) ?? { id: r.id, enabled: true, exclusive: false }), price: r.price });
      }
    } catch {
      // no shop table yet
    }
    return out;
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

  /** Takes a cape off everyone wearing it who may not any more (those `spare` says so keep it: admins). */
  clearCape(cape: string, exceptGranted: boolean, spare: (uuid: string) => boolean = () => false) {
    const granted = new Set(exceptGranted ? this.grantees(cape).map((g) => g.id) : []);
    for (const r of this.db.prepare('SELECT uuid FROM users WHERE cape = ?').all(cape) as { uuid: string }[]) {
      if (!granted.has(r.uuid) && !spare(r.uuid)) this.setCape(r.uuid, '');
    }
    this.clearFromCharacters(cape, exceptGranted, spare);
  }

  /** The same for the characters' own sets. */
  private clearFromCharacters(id: string, exceptGranted: boolean, spare: (uuid: string) => boolean) {
    const granted = new Set(exceptGranted ? this.grantees(id).map((g) => g.id) : []);
    const rows = this.db.prepare("SELECT uuid, subject, loadout FROM identities WHERE provider = 'minecraft' AND loadout LIKE ?").all(`%"${id}"%`) as { uuid: string; subject: string; loadout: string }[];
    for (const r of rows) {
      if (granted.has(r.uuid) || spare(r.uuid)) continue;
      const l = parseLoadout(r.loadout);
      for (const [slot, v] of Object.entries(l)) if (v === id) delete l[slot];
      this.setCharacterLoadout(r.uuid, r.subject, l);
    }
  }

  setLoadout(uuid: string, loadout: Record<string, string>) {
    this.db.prepare('UPDATE users SET loadout = ? WHERE uuid = ?').run(JSON.stringify(loadout), uuid);
  }

  /** Takes an item (wings, elytra, trail, aura, pet) off everyone wearing it who may not any more. */
  clearItem(id: string, exceptGranted: boolean, spare: (uuid: string) => boolean = () => false) {
    const granted = new Set(exceptGranted ? this.grantees(id).map((g) => g.id) : []);
    const rows = this.db.prepare('SELECT uuid, loadout FROM users WHERE loadout LIKE ?').all(`%"${id}"%`) as { uuid: string; loadout: string }[];
    for (const r of rows) {
      if (granted.has(r.uuid) || spare(r.uuid)) continue;
      const l = parseLoadout(r.loadout);
      for (const [slot, v] of Object.entries(l)) if (v === id) delete l[slot];
      this.setLoadout(r.uuid, l);
    }
    this.clearFromCharacters(id, exceptGranted, spare);
  }

  /** Who wears an item now (the account's cape or set, or a character's set). */
  wearers(id: string): string[] {
    const out = new Set<string>();
    for (const r of this.db.prepare('SELECT uuid, cape, loadout FROM users WHERE cape = ? OR loadout LIKE ?').all(id, `%"${id}"%`) as { uuid: string; cape: string; loadout: string }[]) {
      if (r.cape === id || Object.values(parseLoadout(r.loadout)).includes(id)) out.add(r.uuid);
    }
    for (const r of this.db.prepare("SELECT uuid, loadout FROM identities WHERE provider = 'minecraft' AND loadout LIKE ?").all(`%"${id}"%`) as { uuid: string; loadout: string }[]) {
      if (Object.values(parseLoadout(r.loadout)).includes(id)) out.add(r.uuid);
    }
    return [...out];
  }

  /** How many players wear each item (cape and the other slots). */
  wornCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const r of this.db.prepare("SELECT cape, loadout FROM users WHERE cape != '' OR loadout != '{}'").all() as { cape: string; loadout: string }[]) {
      for (const id of [r.cape, ...Object.values(parseLoadout(r.loadout))]) if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const r of this.db.prepare("SELECT loadout FROM identities WHERE provider = 'minecraft' AND loadout != ''").all() as { loadout: string }[]) {
      for (const id of Object.values(parseLoadout(r.loadout))) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
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
    return this.db.prepare(`SELECT u.uuid AS id, u.handle, u.name, ${AVATAR('u')} AS avatar, f.created_at AS since FROM friendships f
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
    return this.db.prepare(`SELECT u.uuid AS id, u.handle, u.name, ${AVATAR('u')} AS avatar, r.created_at AS at FROM requests r JOIN users u ON u.uuid = r.from_uuid
      WHERE r.to_uuid = ? ORDER BY r.created_at DESC`).all(uuid) as unknown as Request[];
  }

  outgoing(uuid: string): Request[] {
    return this.db.prepare(`SELECT u.uuid AS id, u.handle, u.name, ${AVATAR('u')} AS avatar, r.created_at AS at FROM requests r JOIN users u ON u.uuid = r.to_uuid
      WHERE r.from_uuid = ? ORDER BY r.created_at DESC`).all(uuid) as unknown as Request[];
  }

  // ---- messages ----

  addMessage(from: string, to: string, text: string, invite?: Invite, waypoint?: SharedWaypoint): Message {
    const at = Date.now();
    const { lastInsertRowid } = this.db.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at, invite, waypoint) VALUES (?, ?, ?, ?, ?, ?)')
      .run(from, to, text, at, invite ? JSON.stringify(invite) : null, waypoint ? JSON.stringify(waypoint) : null);
    return { id: Number(lastInsertRowid), from, to, text, at, readAt: null, ...(invite ? { invite } : {}), ...(waypoint ? { waypoint } : {}) };
  }

  /** The conversation between two players, newest last; `before` pages back by message id. */
  conversation(x: string, y: string, limit: number, before?: number): Message[] {
    const rows = this.db.prepare(`SELECT id, from_uuid AS "from", to_uuid AS "to", text, created_at AS at, read_at AS readAt, invite, waypoint FROM messages
      WHERE ((from_uuid = ? AND to_uuid = ?) OR (from_uuid = ? AND to_uuid = ?)) AND id < ?
      ORDER BY id DESC LIMIT ?`).all(x, y, y, x, before ?? Number.MAX_SAFE_INTEGER, limit) as unknown as (Omit<Message, 'invite' | 'waypoint'> & { invite: string | null; waypoint: string | null })[];
    return rows.reverse().map(({ invite, waypoint, ...m }) => ({
      ...m, ...(invite ? { invite: JSON.parse(invite) as Invite } : {}), ...(waypoint ? { waypoint: JSON.parse(waypoint) as SharedWaypoint } : {}),
    }));
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

  // ---- partner servers ----

  partners(): import('./partners.ts').Partner[] {
    return (this.db.prepare('SELECT id, address, name, owner, background, pinned, rotate, updated_at AS updatedAt FROM partners ORDER BY address').all() as { pinned: number; rotate: number }[])
      .map((p) => ({ ...p, pinned: !!p.pinned, rotate: !!p.rotate })) as unknown as import('./partners.ts').Partner[];
  }

  partner(id: string): import('./partners.ts').Partner | undefined {
    const p = this.db.prepare('SELECT id, address, name, owner, background, pinned, rotate, updated_at AS updatedAt FROM partners WHERE id = ?').get(id) as { pinned: number; rotate: number } | undefined;
    return p ? ({ ...p, pinned: !!p.pinned, rotate: !!p.rotate } as unknown as import('./partners.ts').Partner) : undefined;
  }

  partnerByAddress(address: string): import('./partners.ts').Partner | undefined {
    return this.db.prepare('SELECT id, address, name, owner, background, pinned, rotate, updated_at AS updatedAt FROM partners WHERE address = ?').get(address) as import('./partners.ts').Partner | undefined;
  }

  addPartner(p: import('./partners.ts').Partner) {
    this.db.prepare('INSERT INTO partners (id, address, name, owner, background, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(p.id, p.address, p.name, p.owner, p.background, p.updatedAt);
  }

  updatePartner(id: string, name: string, owner: string) {
    this.db.prepare('UPDATE partners SET name = ?, owner = ?, updated_at = ? WHERE id = ?').run(name, owner, Date.now(), id);
  }

  setPartnerBackground(id: string, background: string) {
    this.db.prepare('UPDATE partners SET background = ?, updated_at = ? WHERE id = ?').run(background, Date.now(), id);
  }

  removePartner(id: string) {
    this.db.prepare('DELETE FROM partners WHERE id = ?').run(id);
  }

  /** Whether the game pins this partner on top of its server list, and lets it take turns at the very top. */
  setPartnerPinning(id: string, pinned: boolean, rotate: boolean) {
    this.db.prepare('UPDATE partners SET pinned = ?, rotate = ?, updated_at = ? WHERE id = ?').run(pinned ? 1 : 0, rotate ? 1 : 0, Date.now(), id);
  }

  // ---- shared logs ----

  addLog(id: string, owner: string, size: number, lines: number) {
    this.db.prepare('INSERT INTO logs (id, owner, size, lines, created_at) VALUES (?, ?, ?, ?, ?)').run(id, owner, size, lines, Date.now());
  }

  sharedLog(id: string): { id: string; owner: string; size: number; lines: number; createdAt: number } | undefined {
    return this.db.prepare('SELECT id, owner, size, lines, created_at AS createdAt FROM logs WHERE id = ?').get(id) as { id: string; owner: string; size: number; lines: number; createdAt: number } | undefined;
  }

  /** Shared logs for the admin panel, newest first, with who sent them and the reports that point at them. */
  logs(query: string, limit: number, offset: number): { logs: { id: string; owner: string; ownerHandle: string | null; size: number; lines: number; createdAt: number; bugs: number }[]; total: number } {
    const like = `%${query.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const where = `WHERE (? = '' OR lower(l.id) LIKE ? ESCAPE '\\' OR lower(coalesce(u.handle, '')) LIKE ? ESCAPE '\\')`;
    const args = [query, like, like];
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM logs l LEFT JOIN users u ON u.uuid = l.owner ${where}`).get(...args) as { n: number }).n;
    const rows = this.db.prepare(`SELECT l.id, l.owner, u.handle AS ownerHandle, l.size, l.lines, l.created_at AS createdAt,
      (SELECT COUNT(*) FROM bugs b WHERE b.log_id = l.id) AS bugs
      FROM logs l LEFT JOIN users u ON u.uuid = l.owner ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as unknown as { id: string; owner: string; ownerHandle: string | null; size: number; lines: number; createdAt: number; bugs: number }[];
    return { logs: rows, total };
  }

  /** Logs older than `before`, to remove with their files. */
  oldLogs(before: number): string[] {
    return (this.db.prepare('SELECT id FROM logs WHERE created_at < ?').all(before) as { id: string }[]).map((r) => r.id);
  }

  removeLog(id: string) {
    this.db.prepare('DELETE FROM logs WHERE id = ?').run(id);
  }

  // ---- bug reports ----

  addBug(b: { author: string; title: string; body: string; logId: string; version: string; os: string }): number {
    const now = Date.now();
    const { lastInsertRowid } = this.db.prepare('INSERT INTO bugs (author, title, body, log_id, version, os, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(b.author, b.title, b.body, b.logId, b.version, b.os, 'open', now, now);
    return Number(lastInsertRowid);
  }

  bugs(status: string, query: string, limit: number, offset: number): { bugs: Bug[]; total: number } {
    const like = `%${query.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const where = `WHERE (? = '' OR b.status = ?) AND (lower(b.title) LIKE ? ESCAPE '\\' OR lower(b.body) LIKE ? ESCAPE '\\')`;
    const args = [status, status, like, like];
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM bugs b ${where}`).get(...args) as { n: number }).n;
    const rows = this.db.prepare(`SELECT b.id, b.author, u.handle AS authorHandle, b.title, b.body, b.log_id AS logId, b.version, b.os, b.status, b.created_at AS createdAt, b.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM bug_comments c WHERE c.bug_id = b.id) AS comments
      FROM bugs b LEFT JOIN users u ON u.uuid = b.author ${where} ORDER BY b.updated_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as unknown as Bug[];
    return { bugs: rows, total };
  }

  bug(id: number): Bug | undefined {
    return this.db.prepare(`SELECT b.id, b.author, u.handle AS authorHandle, b.title, b.body, b.log_id AS logId, b.version, b.os, b.status, b.created_at AS createdAt, b.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM bug_comments c WHERE c.bug_id = b.id) AS comments
      FROM bugs b LEFT JOIN users u ON u.uuid = b.author WHERE b.id = ?`).get(id) as Bug | undefined;
  }

  setBugStatus(id: number, status: string) {
    this.db.prepare('UPDATE bugs SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
  }

  removeBug(id: number) {
    this.db.prepare('DELETE FROM bugs WHERE id = ?').run(id);
  }

  bugComments(id: number): BugComment[] {
    return this.db.prepare(`SELECT c.id, c.author, u.handle AS authorHandle, u.rank AS authorRole, c.body, c.created_at AS createdAt
      FROM bug_comments c LEFT JOIN users u ON u.uuid = c.author WHERE c.bug_id = ? ORDER BY c.id`).all(id) as unknown as BugComment[];
  }

  addBugComment(bugId: number, author: string, body: string): number {
    const now = Date.now();
    const { lastInsertRowid } = this.db.prepare('INSERT INTO bug_comments (bug_id, author, body, created_at) VALUES (?, ?, ?, ?)').run(bugId, author, body, now);
    this.db.prepare('UPDATE bugs SET updated_at = ? WHERE id = ?').run(now, bugId);
    return Number(lastInsertRowid);
  }

  removeBugComment(id: number) {
    this.db.prepare('DELETE FROM bug_comments WHERE id = ?').run(id);
  }

  // ---- profiles shared by code (the files are next to the database, see profileShares.ts) ----

  addProfileShare(s: { code: string; owner: string; name: string; gameVersion: string; loader: string; size: number; expiresAt: number }) {
    this.db.prepare('INSERT INTO profile_shares (code, owner, name, game_version, loader, size, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(s.code, s.owner, s.name, s.gameVersion, s.loader, s.size, Date.now(), s.expiresAt);
  }

  /** A share that has not expired yet, with its owner's handle (null once the account is gone). */
  profileShare(code: string): ProfileShare | undefined {
    return this.db.prepare(`SELECT ${SHARE_COLUMNS}, u.handle AS ownerHandle FROM profile_shares s LEFT JOIN users u ON u.uuid = s.owner
      WHERE s.code = ? AND s.expires_at > ?`).get(code, Date.now()) as ProfileShare | undefined;
  }

  /** One player's shares that still work, newest first. */
  profileShares(owner: string): ProfileShare[] {
    return this.db.prepare(`SELECT ${SHARE_COLUMNS}, NULL AS ownerHandle FROM profile_shares s WHERE s.owner = ? AND s.expires_at > ? ORDER BY s.created_at DESC`)
      .all(owner, Date.now()) as unknown as ProfileShare[];
  }

  countShareDownload(code: string) {
    this.db.prepare('UPDATE profile_shares SET downloads = downloads + 1 WHERE code = ?').run(code);
  }

  /** Codes past their time, to remove with their files. */
  expiredProfileShares(now: number): string[] {
    return (this.db.prepare('SELECT code FROM profile_shares WHERE expires_at <= ?').all(now) as { code: string }[]).map((r) => r.code);
  }

  removeProfileShare(code: string) {
    this.db.prepare('DELETE FROM profile_shares WHERE code = ?').run(code);
  }
}
