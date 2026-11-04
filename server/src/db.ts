import { randomUUID } from 'node:crypto';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { statements } from './statements.ts';

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
  /** Why the account is banned (shown to the player when they try to sign in) and until when (0 = for good). */
  banReason: string; banUntil: number;
  /** the cape each linked Minecraft account wears in game: its own set's, or else the account's ('' for none) */
  worn: { name: string; cape: string }[];
}
export interface CosmeticSetting {
  id: string; enabled: boolean; exclusive: boolean;
  /** The shop's price set in the admin panel (economy.ts): a number, null = not sold, missing = as cosmetics.ts has it. */
  price?: number | null;
  /** The supporter level set in the admin panel (supporterItems.ts): 0 = for everyone, missing = as cosmetics.ts has it. */
  supporter?: number;
}
export interface LogEntry { id: number; at: number; admin: string; action: string; target: string; detail: string; adminHandle?: string | null; targetId?: string }
export type Provider = 'discord' | 'microsoft' | 'google' | 'github' | 'dev' | 'minecraft';
/** "Join me": a server to play on together, sent as a message so it stays in the chat. */
/** `party`: the invite is one of a party's (sharing.ts), so Join also says "I'm in". */
/** `expiresAt`: after it Join is gone ("Zaproszenie wygasło"); none: it does not expire (server 0.9.25+). */
export interface Invite { server: string; version?: string; party?: string; expiresAt?: number }
/** A waypoint a friend shared: where it is and in which world (`server:<address>` or `world:<name>`, as the HUD keys them). */
/** `mode`: the server's mode it belongs to ("AnyBlock · S3 (Wyspy)"); none: every mode (HUDs before modes send none). */
export interface SharedWaypoint { name: string; x: number; y: number; z: number; dimension: string; world: string; mode?: string }
/** `editedAt`: when the author last changed the text; `deleted`: taken back (no text, invite or waypoint left) (server 0.9.23+). */
export interface Message { id: number; from: string; to: string; text: string; at: number; readAt: number | null; invite?: Invite; waypoint?: SharedWaypoint; editedAt?: number; deleted?: true }
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
-- friends() looks up both sides of a friendship, the avatar an account's Minecraft identity, incoming() the requests to
-- a player, and signing out everywhere a player's sessions: each without a full scan
CREATE INDEX IF NOT EXISTS friendships_b ON friendships(b);
CREATE INDEX IF NOT EXISTS identities_uuid ON identities(uuid, provider);
CREATE INDEX IF NOT EXISTS requests_to ON requests(to_uuid);
CREATE INDEX IF NOT EXISTS sessions_uuid ON sessions(uuid);
-- the newest message with each friend (lastMessageTimes), read from the indexes alone, sent and received
CREATE INDEX IF NOT EXISTS messages_from_at ON messages(from_uuid, to_uuid, created_at);
CREATE INDEX IF NOT EXISTS messages_to_at ON messages(to_uuid, from_uuid, created_at);
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

/**
 * Whether an account is banned now (table alias `t`): a ban with an end (ban_until) is over once it
 * passes, at once for everything that asks, before the minute's tick clears it (adminAccount.ts).
 */
const BANNED = (t: string) => `(${t}.banned != 0 AND (${t}.ban_until = 0 OR ${t}.ban_until > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)))`;

const toUser = (r: UserRow): User => ({ id: r.uuid, handle: r.handle, name: r.name, avatar: r.avatar, showServer: !!r.show_server, cape: r.cape, role: r.role, rank: r.rank, banned: !!r.banned, loadout: parseLoadout(r.loadout) });

/**
 * An account as the admin panel lists it, in one query: its friends and sessions counted, its sign-in
 * providers (in order, once each) and its Minecraft accounts (in the order they were linked) as JSON.
 */
const ADMIN_USER = `SELECT uuid, handle, name, ${AVATAR('users')} AS avatar, show_server, cape, role, rank, ${BANNED('users')} AS banned, loadout, created_at, last_seen, ban_reason, ban_until,
  (SELECT COUNT(*) FROM friendships f WHERE f.a = users.uuid OR f.b = users.uuid) AS friends,
  (SELECT COUNT(*) FROM sessions s WHERE s.uuid = users.uuid) AS sessions,
  (SELECT json_group_array(p ORDER BY p) FROM (SELECT DISTINCT i.provider AS p FROM identities i WHERE i.uuid = users.uuid)) AS providers,
  (SELECT json_group_array(json_object('name', i.label, 'loadout', i.loadout) ORDER BY i.rowid) FROM identities i WHERE i.uuid = users.uuid AND i.provider = 'minecraft') AS characters
  FROM users`;
type AdminUserRow = UserRow & { created_at: number; last_seen: number; friends: number; sessions: number; providers: string; characters: string; ban_reason: string; ban_until: number };
const toAdminUser = (row: AdminUserRow): AdminUser => ({
  ...toUser(row), createdAt: row.created_at, lastSeen: row.last_seen, providers: JSON.parse(row.providers) as string[],
  friends: Number(row.friends), sessions: Number(row.sessions),
  banReason: row.banned ? row.ban_reason : '', banUntil: row.banned ? Number(row.ban_until) : 0,
  // a character with its own set wears that set's cape (none: ''), the others the account's
  worn: (JSON.parse(row.characters) as { name: string; loadout: string }[]).map((c) => ({ name: c.name, cape: c.loadout ? parseLoadout(c.loadout).cape ?? '' : row.cape })),
});

/** A bug report as the tracker lists it; `authorHandle` is null once the account is gone. */
export interface Bug { id: number; author: string; authorHandle: string | null; title: string; body: string; logId: string; version: string; os: string; status: string; createdAt: number; updatedAt: number; comments: number }
export interface BugComment { id: number; author: string; authorHandle: string | null; authorRole: string | null; body: string; createdAt: number }

/** A profile pack shared by code: what the lists show, the file itself is on disk. */
export interface ProfileShare { code: string; owner: string; ownerHandle: string | null; name: string; gameVersion: string; loader: string; size: number; downloads: number; createdAt: number; expiresAt: number }
/** A direct message's columns, and the row as the API gives it. */
const MESSAGE_COLUMNS = 'id, from_uuid AS "from", to_uuid AS "to", text, created_at AS at, read_at AS readAt, invite, waypoint, edited_at AS editedAt, deleted_at AS deletedAt';
type MessageRow = Omit<Message, 'invite' | 'waypoint' | 'editedAt' | 'deleted'> & { invite: string | null; waypoint: string | null; editedAt: number | null; deletedAt: number | null };
const toMessage = ({ invite, waypoint, editedAt, deletedAt, ...m }: MessageRow): Message => (deletedAt ? { ...m, text: '', deleted: true } : {
  ...m, ...(invite ? { invite: JSON.parse(invite) as Invite } : {}), ...(waypoint ? { waypoint: JSON.parse(waypoint) as SharedWaypoint } : {}), ...(editedAt ? { editedAt } : {}),
});
const PARTNER_COLUMNS = 'id, address, name, owner, background, pinned, rotate, updated_at AS updatedAt, icon, icon_size AS iconSize, icon_delays AS iconDelays, icon_updated_at AS iconUpdatedAt, aliases, co_owners AS coOwners';
type PartnerRow = Omit<import('./partners.ts').Partner, 'pinned' | 'rotate' | 'iconDelays' | 'aliases' | 'coOwners'> & { pinned: number; rotate: number; iconDelays: string; aliases: string; coOwners: string };
const toPartner = (p: PartnerRow): import('./partners.ts').Partner => {
  let iconDelays: number[] = [];
  let aliases: string[] = [];
  try {
    iconDelays = JSON.parse(p.iconDelays) as number[];
  } catch {
    // a broken value: the icon simply has no delays
  }
  try {
    const list: unknown = JSON.parse(p.aliases);
    if (Array.isArray(list)) aliases = list.filter((a): a is string => typeof a === 'string');
  } catch {
    // a broken value: no other addresses
  }
  let coOwners: string[] = [];
  try {
    const list: unknown = JSON.parse(p.coOwners);
    if (Array.isArray(list)) coOwners = list.filter((a): a is string => typeof a === 'string');
  } catch {
    // a broken value: only the first owner
  }
  return { ...p, pinned: !!p.pinned, rotate: !!p.rotate, iconDelays, aliases, coOwners };
};
const SHARE_COLUMNS ='s.code, s.owner, s.name, s.game_version AS gameVersion, s.loader, s.size, s.downloads, s.created_at AS createdAt, s.expires_at AS expiresAt';

/** How many times each connection's cosmetics settings changed (Db.cosmeticSettings keeps them while this stays). */
const cosmeticVersions = new WeakMap<DatabaseSync, number>();
/** Call after writing an item's settings, price or supporter level outside Db (economy.ts, supporterItems.ts). */
export function cosmeticSettingsChanged(sql: DatabaseSync) {
  cosmeticVersions.set(sql, (cosmeticVersions.get(sql) ?? 0) + 1);
}

/** Admin log actions whose target is an account (its nick or id), so the entry is linked to the account (Db.log). */
export const USER_ACTIONS = new Set(['ban', 'unban', 'make_admin', 'remove_admin', 'set_cape', 'logout', 'delete', 'grant', 'revoke', 'set_rank', 'sparks_give', 'sparks_take',
  'ach_grant', 'ach_revoke', 'profile_hide', 'profile_show', 'rank_grant', 'rank_revoke', 'support_grant', 'support_extend', 'support_revoke', 'streams_unlink']);

/** Friendships are stored once, with the smaller uuid first. */
const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

export class Db {
  private db: DatabaseSync;
  /** Prepared statements kept for reuse (statements.ts): every query below runs often. */
  private stmt: (sql: string) => StatementSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.stmt = statements(this.db);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    // added after the first release: older files get the column on start
    const columns = this.db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'invite')) this.db.exec('ALTER TABLE messages ADD COLUMN invite TEXT');
    // shared waypoints ride along with a message too (JSON), so they stay in the chat
    if (!columns.some((c) => c.name === 'waypoint')) this.db.exec('ALTER TABLE messages ADD COLUMN waypoint TEXT');
    // edited and deleted messages (chatLimits.ts): only the latest text is kept, a deleted one keeps none
    if (!columns.some((c) => c.name === 'edited_at')) this.db.exec('ALTER TABLE messages ADD COLUMN edited_at INTEGER');
    if (!columns.some((c) => c.name === 'deleted_at')) this.db.exec('ALTER TABLE messages ADD COLUMN deleted_at INTEGER');
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
    // a ban's reason (the player sees it when signing in) and end (0 = for good), from the admin panel
    if (!userColumns.some((c) => c.name === 'ban_reason')) this.db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''");
    if (!userColumns.some((c) => c.name === 'ban_until')) this.db.exec('ALTER TABLE users ADD COLUMN ban_until INTEGER NOT NULL DEFAULT 0');
    // the Minecraft name of a linked Minecraft account (other providers leave it empty)
    const identityColumns = this.db.prepare('PRAGMA table_info(identities)').all() as { name: string }[];
    if (!identityColumns.some((c) => c.name === 'label')) this.db.exec("ALTER TABLE identities ADD COLUMN label TEXT NOT NULL DEFAULT ''");
    // a Minecraft account's own cosmetics (cape and the other slots, JSON); '' = the account's default
    if (!identityColumns.some((c) => c.name === 'loadout')) this.db.exec("ALTER TABLE identities ADD COLUMN loadout TEXT NOT NULL DEFAULT ''");
    // linking Spotify accounts is gone (the launcher reads what plays from the computer itself): no tokens are kept
    this.db.exec('DROP TABLE IF EXISTS spotify_accounts');
    if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'").get()) this.db.exec("DELETE FROM app_settings WHERE key LIKE 'spotify.%'");
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
    // chat keys of each launcher (chatKeys.ts, 0.9.47+): a name, when it first came, whether it is the
    // account's password backup, and what the player decided about handing it the history. Keys
    // from before are 'old': nobody is asked about them.
    const keyColumns = (this.db.prepare('PRAGMA table_info(device_keys)').all() as { name: string }[]).map((c) => c.name);
    if (!keyColumns.includes('name')) this.db.exec("ALTER TABLE device_keys ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    if (!keyColumns.includes('created_at')) this.db.exec('ALTER TABLE device_keys ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
    if (!keyColumns.includes('kind')) this.db.exec("ALTER TABLE device_keys ADD COLUMN kind TEXT NOT NULL DEFAULT ''");
    if (!keyColumns.includes('handover')) this.db.exec("ALTER TABLE device_keys ADD COLUMN handover TEXT NOT NULL DEFAULT 'old'");
    this.db.exec(`
CREATE TABLE IF NOT EXISTS device_revoked (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, device TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uuid, device));
CREATE TABLE IF NOT EXISTS chat_wraps (seq INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, device TEXT NOT NULL,
  kind TEXT NOT NULL, msg INTEGER NOT NULL, field TEXT NOT NULL, wrap TEXT NOT NULL, at INTEGER NOT NULL, UNIQUE (uuid, device, kind, msg, field));
CREATE INDEX IF NOT EXISTS chat_wraps_msg ON chat_wraps(kind, msg);
CREATE TABLE IF NOT EXISTS chat_backups (uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, device TEXT NOT NULL, blob TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
`);
    // a partner's animated icon (partnerIcons.ts): the sprite sheet's file, a frame's side and each frame's delay (JSON);
    // added after partners existed, so every file (a new one too, the table above has none of them) gets the columns here
    const iconColumns = this.db.prepare('PRAGMA table_info(partners)').all() as { name: string }[];
    if (!iconColumns.some((c) => c.name === 'icon')) {
      this.db.exec("ALTER TABLE partners ADD COLUMN icon TEXT NOT NULL DEFAULT ''");
      this.db.exec('ALTER TABLE partners ADD COLUMN icon_size INTEGER NOT NULL DEFAULT 0');
      this.db.exec("ALTER TABLE partners ADD COLUMN icon_delays TEXT NOT NULL DEFAULT '[]'");
      this.db.exec('ALTER TABLE partners ADD COLUMN icon_updated_at INTEGER NOT NULL DEFAULT 0');
    }
    // a partner's other addresses (another domain, a raw IP) as a JSON list, added the same way
    if (!iconColumns.some((c) => c.name === 'aliases')) this.db.exec("ALTER TABLE partners ADD COLUMN aliases TEXT NOT NULL DEFAULT '[]'");
    // the owners after the first one (who stays in `owner`, for what reads only that), as a JSON list
    if (!iconColumns.some((c) => c.name === 'co_owners')) this.db.exec("ALTER TABLE partners ADD COLUMN co_owners TEXT NOT NULL DEFAULT '[]'");
    // one-time changes to the data, each written down once it is done (so a restart never repeats one)
    this.db.exec(`
CREATE TABLE IF NOT EXISTS data_migrations (id TEXT PRIMARY KEY, at INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS cape_grants_kept (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, cape TEXT NOT NULL, PRIMARY KEY (uuid, cape));
`);
    // whom an admin log entry is about (an account's id; '' = not an account, or from before), so an
    // account's own log in the panel survives a change of nick
    const logColumns = this.db.prepare('PRAGMA table_info(admin_log)').all() as { name: string }[];
    if (!logColumns.some((c) => c.name === 'target_id')) this.db.exec("ALTER TABLE admin_log ADD COLUMN target_id TEXT NOT NULL DEFAULT ''");
    this.db.exec(`
CREATE INDEX IF NOT EXISTS admin_log_target ON admin_log(target_id, id);
-- nicks an account had before an admin changed it: /u/<old nick> leads to the profile while nobody else has it
CREATE TABLE IF NOT EXISTS handle_history (handle_lower TEXT PRIMARY KEY, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, handle TEXT NOT NULL, changed_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS handle_history_uuid ON handle_history(uuid);
-- accounts deleted in the admin panel, kept whole for a while so a mistake can be undone (adminAccount.ts)
CREATE TABLE IF NOT EXISTS deleted_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL, handle TEXT NOT NULL, name TEXT NOT NULL,
  data TEXT NOT NULL, deleted_at INTEGER NOT NULL, by_uuid TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS deleted_accounts_at ON deleted_accounts(deleted_at);
`);
  }

  /**
   * Capes that were free for everyone and no longer are (cosmetics.ts FORMERLY_FREE_CAPES): every
   * account there is when this first runs gets a grant of each, all in one transaction, and the run is
   * written down, so it happens once (a later start, a new account: nothing). Accounts made after it
   * earn or buy them like everyone else. The grants it added are also listed in cape_grants_kept, so
   * the collection's achievements count only what a player got themselves (an achievement that gives
   * one of them later takes it off that list). Returns how many grants it added (0 when done before).
   */
  keepFormerlyFree(capes: readonly string[], id = 'free-capes-0.9.69', now = Date.now()): number {
    if (this.stmt('SELECT 1 FROM data_migrations WHERE id = ?').get(id)) return 0;
    let added = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const cape of capes) {
        // an admin's grant from before stays the player's own (it counts for the collection)
        this.stmt('INSERT OR IGNORE INTO cape_grants_kept (uuid, cape) SELECT u.uuid, ? FROM users u WHERE NOT EXISTS (SELECT 1 FROM cape_grants g WHERE g.uuid = u.uuid AND g.cape = ?)').run(cape, cape);
        added += Number(this.stmt('INSERT OR IGNORE INTO cape_grants (uuid, cape) SELECT uuid, ? FROM users').run(cape).changes);
      }
      const users = (this.stmt('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
      this.stmt('INSERT INTO data_migrations (id, at, detail) VALUES (?, ?, ?)').run(id, now, `${users} kont, ${added} przyznań`);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return added;
  }

  /**
   * Rewards given later to achievements players may have unlocked already (the streak capes of 0.9.70):
   * every player who has the achievement gets its item, as an unlock now would give it. Written down
   * like keepFormerlyFree, so it runs once (an admin's later revoke stays). `rewards` is
   * [achievement, item] pairs; returns how many grants it added (0 when done before).
   */
  grantLateRewards(rewards: readonly (readonly [string, string])[], id: string, now = Date.now()): number {
    if (this.db.prepare('SELECT 1 FROM data_migrations WHERE id = ?').get(id)) return 0;
    let added = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [achievement, item] of rewards) {
        added += Number(this.db.prepare('INSERT OR IGNORE INTO cape_grants (uuid, cape) SELECT uuid, ? FROM achievements WHERE id = ?').run(item, achievement).changes);
      }
      this.db.prepare('INSERT INTO data_migrations (id, at, detail) VALUES (?, ?, ?)').run(id, now, `${added} przyznań`);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return added;
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
      if (wanted.avatar) this.stmt('UPDATE users SET avatar = ? WHERE uuid = ?').run(wanted.avatar, known);
      this.stmt('UPDATE users SET last_seen = ? WHERE uuid = ?').run(now, known);
      if (label) this.stmt('UPDATE identities SET label = ? WHERE provider = ? AND subject = ?').run(label, provider, subject);
      return this.user(known)!;
    }
    const uuid = randomUUID();
    const handle = this.freeHandle(wanted.handle);
    this.stmt('INSERT INTO users (uuid, handle, handle_lower, name, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuid, handle, handle.toLowerCase(), wanted.name, wanted.avatar, now, now);
    this.stmt('INSERT INTO identities (provider, subject, uuid, label) VALUES (?, ?, ?, ?)').run(provider, subject, uuid, label);
    return this.user(uuid)!;
  }

  /** Whose account a login belongs to, if anyone's. */
  owner(provider: Provider, subject: string): string | undefined {
    return (this.stmt('SELECT uuid FROM identities WHERE provider = ? AND subject = ?').get(provider, subject) as { uuid: string } | undefined)?.uuid;
  }

  /**
   * The Minecraft accounts linked to an account: Mojang uuid (no dashes), name, and what that
   * character wears when it has its own set (cape among the slots), else null: the account's default.
   */
  minecraftAccounts(uuid: string): { uuid: string; name: string; loadout: Record<string, string> | null }[] {
    // in the order they were linked (the table's own row numbers grow with each link)
    return (this.stmt("SELECT subject, label, loadout FROM identities WHERE uuid = ? AND provider = 'minecraft' ORDER BY rowid").all(uuid) as { subject: string; label: string; loadout: string }[])
      .map((r) => ({ uuid: r.subject, name: r.label, loadout: r.loadout ? parseLoadout(r.loadout) : null }));
  }

  /** A character's own set (null = none: it wears the account's), only for one of `uuid`'s own. */
  characterLoadout(uuid: string, subject: string): Record<string, string> | null {
    const row = this.stmt("SELECT loadout FROM identities WHERE uuid = ? AND provider = 'minecraft' AND subject = ?").get(uuid, subject) as { loadout: string } | undefined;
    return row?.loadout ? parseLoadout(row.loadout) : null;
  }

  /** Gives a character its own set, or (null) sends it back to the account's default. */
  setCharacterLoadout(uuid: string, subject: string, loadout: Record<string, string> | null) {
    this.stmt("UPDATE identities SET loadout = ? WHERE uuid = ? AND provider = 'minecraft' AND subject = ?").run(loadout ? JSON.stringify(loadout) : '', uuid, subject);
  }

  /** How many ways there are to sign in to an account (each Minecraft account counts). */
  identityCount(uuid: string): number {
    return (this.stmt('SELECT COUNT(*) AS n FROM identities WHERE uuid = ?').get(uuid) as { n: number }).n;
  }

  unlinkIdentity(uuid: string, provider: Provider, subject: string): boolean {
    return this.stmt('DELETE FROM identities WHERE uuid = ? AND provider = ? AND subject = ?').run(uuid, provider, subject).changes > 0;
  }

  /** Adds a sign-in method to an account; false when it already belongs to someone. */
  link(provider: Provider, subject: string, uuid: string, label = ''): boolean {
    const owner = this.owner(provider, subject);
    if (owner) {
      if (owner === uuid && label) this.stmt('UPDATE identities SET label = ? WHERE provider = ? AND subject = ?').run(label, provider, subject);
      return owner === uuid;
    }
    this.stmt('INSERT INTO identities (provider, subject, uuid, label) VALUES (?, ?, ?, ?)').run(provider, subject, uuid, label);
    return true;
  }

  unlink(uuid: string, provider: string) {
    this.stmt('DELETE FROM identities WHERE uuid = ? AND provider = ?').run(uuid, provider);
  }

  providers(uuid: string): string[] {
    return (this.stmt('SELECT DISTINCT provider FROM identities WHERE uuid = ? ORDER BY provider').all(uuid) as { provider: string }[]).map((r) => r.provider);
  }

  /** `base`, or `base2`, `base3`… when someone already has it. */
  private freeHandle(base: string): string {
    const clean = base.replace(/[^\w.]/g, '').slice(0, 24) || 'gracz';
    for (let n = 1; ; n++) {
      const handle = n === 1 ? clean : `${clean}${n}`;
      if (!this.stmt('SELECT 1 FROM users WHERE handle_lower = ?').get(handle.toLowerCase())) return handle;
    }
  }

  user(uuid: string): User | undefined {
    const row = this.stmt(`SELECT uuid, handle, name, ${AVATAR('users')} AS avatar, show_server, cape, role, rank, ${BANNED('users')} AS banned, loadout FROM users WHERE uuid = ?`).get(uuid) as UserRow | undefined;
    return row && toUser(row);
  }

  userByHandle(handle: string): User | undefined {
    const row = this.stmt('SELECT uuid FROM users WHERE handle_lower = ?').get(handle.toLowerCase()) as { uuid: string } | undefined;
    return row && this.user(row.uuid);
  }

  /**
   * The avatar the player picked ('' = the first Minecraft account's face, 'mc:<uuid>' = that account's,
   * 'provider' = the sign-in provider's picture), and that picture.
   */
  avatarChoice(uuid: string): { source: string; provider: string } {
    const row = this.stmt('SELECT avatar_source, avatar FROM users WHERE uuid = ?').get(uuid) as { avatar_source: string; avatar: string } | undefined;
    return { source: row?.avatar_source ?? '', provider: row?.avatar ?? '' };
  }

  setAvatarSource(uuid: string, source: string) {
    this.stmt('UPDATE users SET avatar_source = ? WHERE uuid = ?').run(source, uuid);
  }

  setCape(uuid: string, cape: string) {
    this.stmt('UPDATE users SET cape = ? WHERE uuid = ?').run(cape, uuid);
  }

  // ---- chat encryption: the public keys of each account's launchers ----

  /**
   * Adds or refreshes a launcher's key; an account keeps its `max` most recent launchers (the
   * password backup's key, chatKeys.ts, is not one of them and is never pushed out). A key that
   * is new (or a device whose key changed) waits for the player's answer on another launcher
   * about the history, unless the account has no other launcher to ask. A device the player
   * removed cannot come back under the same id: 'revoked'.
   */
  setDeviceKey(uuid: string, device: string, pub: string, name = '', max = 10): 'added' | 'refreshed' | 'revoked' {
    if (this.stmt('SELECT 1 FROM device_revoked WHERE uuid = ? AND device = ?').get(uuid, device)) return 'revoked';
    const now = Date.now();
    const old = this.stmt('SELECT pub, kind FROM device_keys WHERE uuid = ? AND device = ?').get(uuid, device) as { pub: string; kind: string } | undefined;
    // the backup's id is not a launcher's: a launcher claiming it is refused like a removed one
    if (old?.kind === 'backup') return 'revoked';
    if (old && old.pub === pub) {
      this.stmt("UPDATE device_keys SET at = ?, name = CASE WHEN ? != '' THEN ? ELSE name END WHERE uuid = ? AND device = ?").run(now, name, name, uuid, device);
      return 'refreshed';
    }
    const others = (this.stmt("SELECT COUNT(*) AS n FROM device_keys WHERE uuid = ? AND device != ? AND kind = ''").get(uuid, device) as { n: number }).n;
    this.stmt(`INSERT INTO device_keys (uuid, device, pub, at, name, created_at, kind, handover) VALUES (?, ?, ?, ?, ?, ?, '', ?)
      ON CONFLICT (uuid, device) DO UPDATE SET pub = excluded.pub, at = excluded.at, name = excluded.name, created_at = excluded.created_at, handover = excluded.handover`)
      .run(uuid, device, pub, now, name, now, others ? 'pending' : 'none');
    // what was wrapped for the old key cannot be opened by the new one
    if (old) this.stmt('DELETE FROM chat_wraps WHERE uuid = ? AND device = ?').run(uuid, device);
    const gone = this.stmt(`SELECT device FROM device_keys WHERE uuid = ? AND kind = '' AND device NOT IN
      (SELECT device FROM device_keys WHERE uuid = ? AND kind = '' ORDER BY at DESC LIMIT ?)`).all(uuid, uuid, max) as { device: string }[];
    for (const g of gone) this.dropDevice(uuid, g.device);
    return 'added';
  }

  /** A device's key and what was wrapped for it, gone (pushed out, removed by the player, or a replaced backup). */
  dropDevice(uuid: string, device: string) {
    this.stmt('DELETE FROM device_keys WHERE uuid = ? AND device = ?').run(uuid, device);
    this.stmt('DELETE FROM chat_wraps WHERE uuid = ? AND device = ?').run(uuid, device);
  }

  /** The keys to encrypt for: the password backup's first (when there is one), then the launchers, most recent first. */
  deviceKeys(uuid: string): { device: string; pub: string }[] {
    return this.stmt("SELECT device, pub FROM device_keys WHERE uuid = ? ORDER BY kind = 'backup' DESC, at DESC").all(uuid) as { device: string; pub: string }[];
  }

  /** The keys for a group's message: the backup's, and at most `max` launchers. */
  deviceKeysFor(uuid: string, max: number): { device: string; pub: string }[] {
    const all = this.stmt("SELECT device, pub, kind FROM device_keys WHERE uuid = ? ORDER BY kind = 'backup' DESC, at DESC").all(uuid) as { device: string; pub: string; kind: string }[];
    const backup = all.filter((k) => k.kind === 'backup');
    return [...backup, ...all.filter((k) => k.kind !== 'backup').slice(0, max)].map(({ device, pub }) => ({ device, pub }));
  }

  setRank(uuid: string, rank: string) {
    this.stmt('UPDATE users SET rank = ? WHERE uuid = ?').run(rank, uuid);
  }

  setRole(uuid: string, role: string) {
    this.stmt('UPDATE users SET role = ? WHERE uuid = ?').run(role, uuid);
  }

  /** A ban (with what the player is told and its end, 0 = for good) signs the account out everywhere; lifting one clears both. */
  setBanned(uuid: string, banned: boolean, reason = '', until = 0) {
    this.stmt('UPDATE users SET banned = ?, ban_reason = ?, ban_until = ? WHERE uuid = ?').run(banned ? 1 : 0, banned ? reason : '', banned ? until : 0, uuid);
    if (banned) this.removeSessions(uuid);
  }

  /** Why an account is banned and until when (0 = for good), while the ban lasts; undefined when it is not banned. */
  banInfo(uuid: string): { reason: string; until: number } | undefined {
    const row = this.stmt(`SELECT ban_reason AS reason, ban_until AS until FROM users WHERE uuid = ? AND ${BANNED('users')}`).get(uuid) as { reason: string; until: number } | undefined;
    return row && { reason: row.reason, until: Number(row.until) };
  }

  /** Bans whose end has passed are lifted (they stopped counting already, see BANNED); returns whose. */
  liftExpiredBans(now = Date.now()): { id: string; handle: string }[] {
    const rows = this.stmt('SELECT uuid AS id, handle FROM users WHERE banned != 0 AND ban_until != 0 AND ban_until <= ?').all(now) as { id: string; handle: string }[];
    for (const r of rows) this.stmt("UPDATE users SET banned = 0, ban_reason = '', ban_until = 0 WHERE uuid = ?").run(r.id);
    return rows;
  }

  // ---- account details the admin panel changes (adminAccount.ts) ----

  /** Whether a nick is someone else's (case does not matter). */
  handleTaken(handle: string, except = ''): boolean {
    return !!this.stmt('SELECT 1 FROM users WHERE handle_lower = ? AND uuid != ?').get(handle.toLowerCase(), except);
  }

  setName(uuid: string, name: string) {
    this.stmt('UPDATE users SET name = ? WHERE uuid = ?').run(name, uuid);
  }

  /** A new nick; the old one is remembered (handle_history) so links to the old profile address keep working. */
  setHandle(uuid: string, handle: string, now = Date.now()) {
    const old = this.stmt('SELECT handle FROM users WHERE uuid = ?').get(uuid) as { handle: string } | undefined;
    if (!old || old.handle === handle) return;
    this.stmt('UPDATE users SET handle = ?, handle_lower = ? WHERE uuid = ?').run(handle, handle.toLowerCase(), uuid);
    // the account's own nick is nobody's "former" one any more
    this.stmt('DELETE FROM handle_history WHERE handle_lower = ?').run(handle.toLowerCase());
    if (old.handle.toLowerCase() !== handle.toLowerCase()) {
      this.stmt('INSERT OR REPLACE INTO handle_history (handle_lower, uuid, handle, changed_at) VALUES (?, ?, ?, ?)').run(old.handle.toLowerCase(), uuid, old.handle, now);
    }
  }

  /** The account a former nick leads to now, while nobody has it as their nick. */
  formerHandle(handle: string): User | undefined {
    if (this.stmt('SELECT 1 FROM users WHERE handle_lower = ?').get(handle.toLowerCase())) return undefined;
    const row = this.stmt('SELECT uuid FROM handle_history WHERE handle_lower = ?').get(handle.toLowerCase()) as { uuid: string } | undefined;
    return row && this.user(row.uuid);
  }

  /** The nicks an account had before, newest first. */
  formerHandles(uuid: string): string[] {
    return (this.stmt('SELECT handle FROM handle_history WHERE uuid = ? ORDER BY changed_at DESC').all(uuid) as { handle: string }[]).map((r) => r.handle);
  }

  /** Every way to sign in to an account, in the order they were linked (a Minecraft account with whether it has its own set). */
  identitiesOf(uuid: string): { provider: string; subject: string; label: string; ownLoadout: boolean }[] {
    return (this.stmt('SELECT provider, subject, label, loadout FROM identities WHERE uuid = ? ORDER BY rowid').all(uuid) as { provider: string; subject: string; label: string; loadout: string }[])
      .map((r) => ({ provider: r.provider, subject: r.subject, label: r.label, ownLoadout: !!r.loadout }));
  }

  /** An account's sessions (signed-in launchers and browsers), newest first; `id` is the row's number, never the token's hash. */
  sessionsOf(uuid: string): { id: number; createdAt: number; lastUsed: number }[] {
    return (this.stmt('SELECT rowid AS id, created_at AS createdAt, last_used AS lastUsed FROM sessions WHERE uuid = ? ORDER BY last_used DESC').all(uuid) as { id: number; createdAt: number; lastUsed: number }[])
      .map((r) => ({ id: Number(r.id), createdAt: r.createdAt, lastUsed: r.lastUsed }));
  }

  /** Ends one of an account's sessions; gives its token's hash (to close its live connections), or undefined when there was none. */
  removeSessionById(uuid: string, id: number): string | undefined {
    const row = this.stmt('SELECT token_hash FROM sessions WHERE rowid = ? AND uuid = ?').get(id, uuid) as { token_hash: string } | undefined;
    if (row) this.removeSession(row.token_hash);
    return row?.token_hash;
  }

  /** How many chat devices (launchers' keys, the password backup's) an account has; the panel only shows the number. */
  deviceKeyCount(uuid: string): number {
    return (this.stmt('SELECT COUNT(*) AS n FROM device_keys WHERE uuid = ?').get(uuid) as { n: number }).n;
  }

  /** Removes an account with everything that hangs on it (sign-ins, sessions, friends, messages, grants). */
  deleteUser(uuid: string) {
    this.stmt('DELETE FROM messages WHERE from_uuid = ? OR to_uuid = ?').run(uuid, uuid);
    // what has no link to the account in the database (payments stay: the law keeps them, see the privacy policy)
    if (this.stmt("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'support_prefs'").get()) this.stmt('DELETE FROM support_prefs WHERE user = ?').run(uuid);
    // the admin statistics' rows of the account (adminStats.ts), where they exist
    for (const table of ['stats_active_days', 'stats_clients']) {
      if (this.stmt("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) this.stmt(`DELETE FROM ${table} WHERE uuid = ?`).run(uuid);
    }
    this.stmt('DELETE FROM users WHERE uuid = ?').run(uuid);
  }

  removeSessions(uuid: string) {
    this.stmt('DELETE FROM sessions WHERE uuid = ?').run(uuid);
  }

  // ---- the admin panel ----

  /** Accounts matching `query` (handle, name or id), newest first. */
  listUsers(query: string, limit: number, offset: number): { users: AdminUser[]; total: number } {
    const like = `%${query.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const where = "WHERE handle_lower LIKE ? ESCAPE '\\' OR lower(name) LIKE ? ESCAPE '\\' OR uuid = ?";
    const total = (this.stmt(`SELECT COUNT(*) AS n FROM users ${where}`).get(like, like, query) as { n: number }).n;
    // the whole page in one query (counts, sign-ins and characters as subqueries), not five per account
    const rows = this.stmt(`${ADMIN_USER} ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(like, like, query, limit, offset) as unknown as AdminUserRow[];
    return { users: rows.map(toAdminUser), total };
  }

  adminUser(uuid: string): AdminUser | undefined {
    const row = this.stmt(`${ADMIN_USER} WHERE uuid = ?`).get(uuid) as unknown as AdminUserRow | undefined;
    return row && toAdminUser(row);
  }

  stats(since: number) {
    const n = (sql: string, ...args: (string | number)[]) => (this.stmt(sql).get(...args) as { n: number }).n;
    // what players wear in game: each Minecraft account's own cape (set in the client), or else the account's; a player counts once per cape
    const capes: Record<string, number> = {};
    const own = new Map<string, string[]>();
    for (const r of this.stmt("SELECT uuid, loadout FROM identities WHERE provider = 'minecraft'").all() as { uuid: string; loadout: string }[]) {
      own.set(r.uuid, [...(own.get(r.uuid) ?? []), r.loadout]);
    }
    for (const u of this.stmt('SELECT uuid, cape FROM users').all() as { uuid: string; cape: string }[]) {
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
    for (const r of this.stmt('SELECT created_at FROM users WHERE created_at >= ?').all(start) as { created_at: number }[]) {
      out[Math.floor((r.created_at - start) / dayMs)]++;
    }
    return out;
  }

  /**
   * Every item's admin settings, kept in memory: the game's lookup and every catalog read them, and
   * they change only in the admin panel (setCosmetic, the shop's prices, supporters' levels: each of
   * those writes calls cosmeticSettingsChanged). Each call gets its own map of the same settings.
   */
  cosmeticSettings(): Map<string, CosmeticSetting> {
    const version = cosmeticVersions.get(this.db) ?? 0;
    if (this.cosmeticsKept?.version !== version) {
      const value = this.readCosmeticSettings();
      // shared by every caller until the next change: nobody may change one in place
      for (const s of value.values()) Object.freeze(s);
      this.cosmeticsKept = { version, value };
    }
    return new Map(this.cosmeticsKept.value);
  }

  private cosmeticsKept?: { version: number; value: Map<string, CosmeticSetting> };

  /**
   * Goes up with every admin action (the admin log) and every change of the cosmetics settings, so
   * what is kept from them (the game's lookup, app.ts) knows to count again.
   */
  changeMark(): number {
    return (cosmeticVersions.get(this.db) ?? 0) + this.logged;
  }

  private logged = 0;

  private readCosmeticSettings(): Map<string, CosmeticSetting> {
    const rows =this.stmt('SELECT id, enabled, exclusive FROM cosmetics').all() as { id: string; enabled: number; exclusive: number }[];
    const out = new Map<string, CosmeticSetting>(rows.map((r) => [r.id, { id: r.id, enabled: !!r.enabled, exclusive: !!r.exclusive }]));
    // the shop's prices (economy.ts keeps them; not there in a database without the shop)
    try {
      for (const r of this.stmt('SELECT id, price FROM shop_prices').all() as { id: string; price: number | null }[]) {
        out.set(r.id, { ...(out.get(r.id) ?? { id: r.id, enabled: true, exclusive: false }), price: r.price });
      }
    } catch {
      // no shop table yet
    }
    // supporter-only levels the admin set (supporterItems.ts)
    // (read here, not through supporterItems.ts: the launcher's type check takes this file in through cosmetics.ts)
    try {
      for (const r of this.stmt('SELECT id, level FROM cosmetic_supporter').all() as { id: string; level: number }[]) {
        out.set(r.id, { ...(out.get(r.id) ?? { id: r.id, enabled: true, exclusive: false }), supporter: r.level });
      }
    } catch {
      // no such table yet
    }
    return out;
  }

  setCosmetic(id: string, enabled: boolean, exclusive: boolean) {
    this.stmt('INSERT INTO cosmetics (id, enabled, exclusive) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, exclusive = excluded.exclusive')
      .run(id, enabled ? 1 : 0, exclusive ? 1 : 0);
    cosmeticSettingsChanged(this.db);
  }

  grants(uuid: string): string[] {
    return (this.stmt('SELECT cape FROM cape_grants WHERE uuid = ? ORDER BY cape').all(uuid) as { cape: string }[]).map((r) => r.cape);
  }

  /** Who may wear an exclusive cape. */
  grantees(cape: string): { id: string; handle: string; name: string }[] {
    return (this.stmt('SELECT u.uuid AS id, u.handle, u.name FROM cape_grants g JOIN users u ON u.uuid = g.uuid WHERE g.cape = ? ORDER BY u.handle_lower').all(cape)) as { id: string; handle: string; name: string }[];
  }

  grant(uuid: string, cape: string) {
    this.stmt('INSERT OR IGNORE INTO cape_grants (uuid, cape) VALUES (?, ?)').run(uuid, cape);
  }

  revoke(uuid: string, cape: string) {
    this.stmt('DELETE FROM cape_grants WHERE uuid = ? AND cape = ?').run(uuid, cape);
  }

  /** Takes a cape off everyone wearing it who may not any more (those `spare` says so keep it: admins). */
  clearCape(cape: string, exceptGranted: boolean, spare: (uuid: string) => boolean = () => false) {
    const granted = new Set(exceptGranted ? this.grantees(cape).map((g) => g.id) : []);
    for (const r of this.stmt('SELECT uuid FROM users WHERE cape = ?').all(cape) as { uuid: string }[]) {
      if (!granted.has(r.uuid) && !spare(r.uuid)) this.setCape(r.uuid, '');
    }
    this.clearFromCharacters(cape, exceptGranted, spare);
  }

  /** The same for the characters' own sets. */
  private clearFromCharacters(id: string, exceptGranted: boolean, spare: (uuid: string) => boolean) {
    const granted = new Set(exceptGranted ? this.grantees(id).map((g) => g.id) : []);
    const rows = this.stmt("SELECT uuid, subject, loadout FROM identities WHERE provider = 'minecraft' AND loadout LIKE ?").all(`%"${id}"%`) as { uuid: string; subject: string; loadout: string }[];
    for (const r of rows) {
      if (granted.has(r.uuid) || spare(r.uuid)) continue;
      const l = parseLoadout(r.loadout);
      for (const [slot, v] of Object.entries(l)) if (v === id) delete l[slot];
      this.setCharacterLoadout(r.uuid, r.subject, l);
    }
  }

  setLoadout(uuid: string, loadout: Record<string, string>) {
    this.stmt('UPDATE users SET loadout = ? WHERE uuid = ?').run(JSON.stringify(loadout), uuid);
  }

  /** Takes an item (wings, elytra, trail, aura, pet) off everyone wearing it who may not any more. */
  clearItem(id: string, exceptGranted: boolean, spare: (uuid: string) => boolean = () => false) {
    const granted = new Set(exceptGranted ? this.grantees(id).map((g) => g.id) : []);
    const rows = this.stmt('SELECT uuid, loadout FROM users WHERE loadout LIKE ?').all(`%"${id}"%`) as { uuid: string; loadout: string }[];
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
    for (const r of this.stmt('SELECT uuid, cape, loadout FROM users WHERE cape = ? OR loadout LIKE ?').all(id, `%"${id}"%`) as { uuid: string; cape: string; loadout: string }[]) {
      if (r.cape === id || Object.values(parseLoadout(r.loadout)).includes(id)) out.add(r.uuid);
    }
    for (const r of this.stmt("SELECT uuid, loadout FROM identities WHERE provider = 'minecraft' AND loadout LIKE ?").all(`%"${id}"%`) as { uuid: string; loadout: string }[]) {
      if (Object.values(parseLoadout(r.loadout)).includes(id)) out.add(r.uuid);
    }
    return [...out];
  }

  /** How many players wear each item (cape and the other slots). */
  wornCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const r of this.stmt("SELECT cape, loadout FROM users WHERE cape != '' OR loadout != '{}'").all() as { cape: string; loadout: string }[]) {
      for (const id of [r.cape, ...Object.values(parseLoadout(r.loadout))]) if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const r of this.stmt("SELECT loadout FROM identities WHERE provider = 'minecraft' AND loadout != ''").all() as { loadout: string }[]) {
      for (const id of Object.values(parseLoadout(r.loadout))) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * An admin's action. `targetId`: the account it is about; when not given, an action about an account
   * (USER_ACTIONS) or a target that is an account's id finds the account itself (by id or nick).
   */
  log(admin: string, action: string, target: string, detail = '', targetId?: string) {
    let about = targetId ?? '';
    if (targetId === undefined && target) {
      const byId = this.stmt('SELECT uuid FROM users WHERE uuid = ?').get(target) as { uuid: string } | undefined;
      const byHandle = !byId && USER_ACTIONS.has(action)
        ? this.stmt('SELECT uuid FROM users WHERE handle_lower = ?').get(target.replace(/^@/, '').toLowerCase()) as { uuid: string } | undefined : undefined;
      about = byId?.uuid ?? byHandle?.uuid ?? '';
    }
    this.stmt('INSERT INTO admin_log (at, admin, action, target, detail, target_id) VALUES (?, ?, ?, ?, ?, ?)').run(Date.now(), admin, action, target, detail, about);
    this.logged++;
  }

  /** The admin log about one account: by its id, and (entries from before ids were kept) by its nicks now and before. */
  logFor(uuid: string, limit: number): LogEntry[] {
    const handles = [this.user(uuid)?.handle ?? '', ...this.formerHandles(uuid)].filter(Boolean).map((h) => h.toLowerCase());
    const actions = [...USER_ACTIONS];
    return this.db.prepare(`SELECT l.id, l.at, l.admin, l.action, l.target, l.detail, l.target_id AS targetId, u.handle AS adminHandle FROM admin_log l LEFT JOIN users u ON u.uuid = l.admin
      WHERE l.target_id = ? OR (l.target_id = '' AND l.action IN (${actions.map(() => '?').join(',')}) AND lower(l.target) IN (${handles.map(() => '?').join(',') || "''"}))
      ORDER BY l.id DESC LIMIT ?`).all(uuid, ...actions, ...handles, limit) as unknown as LogEntry[];
  }

  /** The admin log keeps moderation accountable for a set time (the privacy policy names it), not forever. */
  pruneAdminLog(maxAgeMs: number): number {
    return Number(this.stmt('DELETE FROM admin_log WHERE at < ?').run(Date.now() - maxAgeMs).changes);
  }

  logEntries(limit: number): LogEntry[] {
    // with the admin's handle (null once the account is gone), so the panel need not look each one up
    return this.stmt(`SELECT l.id, l.at, l.admin, l.action, l.target, l.detail, u.handle AS adminHandle FROM admin_log l LEFT JOIN users u ON u.uuid = l.admin
      ORDER BY l.id DESC LIMIT ?`).all(limit) as unknown as LogEntry[];
  }

  setShowServer(uuid: string, show: boolean) {
    this.stmt('UPDATE users SET show_server = ? WHERE uuid = ?').run(show ? 1 : 0, uuid);
  }

  touch(uuid: string) {
    this.stmt('UPDATE users SET last_seen = ? WHERE uuid = ?').run(Date.now(), uuid);
  }

  lastSeen(uuid: string): number {
    return (this.stmt('SELECT last_seen FROM users WHERE uuid = ?').get(uuid) as { last_seen: number } | undefined)?.last_seen ?? 0;
  }

  addSession(tokenHash: string, uuid: string) {
    const now = Date.now();
    this.stmt('INSERT INTO sessions (token_hash, uuid, created_at, last_used) VALUES (?, ?, ?, ?)').run(tokenHash, uuid, now, now);
  }

  /** The player behind a session; sessions unused for `maxIdleMs` are gone. */
  sessionUser(tokenHash: string, maxIdleMs: number): string | undefined {
    const row = this.stmt('SELECT uuid, last_used FROM sessions WHERE token_hash = ?').get(tokenHash) as { uuid: string; last_used: number } | undefined;
    if (!row) return undefined;
    const now = Date.now();
    if (now - row.last_used > maxIdleMs) {
      this.removeSession(tokenHash);
      return undefined;
    }
    // writing on every request is wasteful; once an hour is enough for expiry
    if (now - row.last_used > 3_600_000) this.stmt('UPDATE sessions SET last_used = ? WHERE token_hash = ?').run(now, tokenHash);
    return row.uuid;
  }

  removeSession(tokenHash: string) {
    this.stmt('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  /** Sessions nobody used for `maxIdleMs` (they would be refused anyway), so the table does not grow for good. */
  removeIdleSessions(maxIdleMs: number): number {
    return Number(this.stmt('DELETE FROM sessions WHERE last_used < ?').run(Date.now() - maxIdleMs).changes);
  }

  // ---- friends ----

  areFriends(x: string, y: string): boolean {
    const [a, b] = pair(x, y);
    return !!this.stmt('SELECT 1 FROM friendships WHERE a = ? AND b = ?').get(a, b);
  }

  friends(uuid: string): (Person & { since: number })[] {
    return this.stmt(`SELECT u.uuid AS id, u.handle, u.name, ${AVATAR('u')} AS avatar, f.created_at AS since FROM friendships f
      JOIN users u ON u.uuid = CASE WHEN f.a = ? THEN f.b ELSE f.a END
      WHERE f.a = ? OR f.b = ? ORDER BY u.handle_lower`).all(uuid, uuid, uuid) as unknown as (Person & { since: number })[];
  }

  /**
   * The friends list's rows in one query: each friend as `friends` gives them, with their account
   * (for the rank badge) and when they were last seen (for the status), not two more queries each.
   */
  friendsWithUsers(uuid: string): { friend: Person & { since: number }; user: User; lastSeen: number }[] {
    const rows = this.stmt(`SELECT u.uuid, u.handle, u.name, ${AVATAR('u')} AS avatar, f.created_at AS since, u.show_server, u.cape, u.role, u.rank, u.banned, u.loadout, u.last_seen
      FROM friendships f JOIN users u ON u.uuid = CASE WHEN f.a = ? THEN f.b ELSE f.a END
      WHERE f.a = ? OR f.b = ? ORDER BY u.handle_lower`).all(uuid, uuid, uuid) as unknown as (UserRow & { since: number; last_seen: number })[];
    return rows.map((r) => ({ friend: { id: r.uuid, handle: r.handle, name: r.name, avatar: r.avatar, since: r.since }, user: toUser(r), lastSeen: r.last_seen }));
  }

  addFriendship(x: string, y: string) {
    const [a, b] = pair(x, y);
    this.stmt('INSERT OR IGNORE INTO friendships (a, b, created_at) VALUES (?, ?, ?)').run(a, b, Date.now());
    this.stmt('DELETE FROM requests WHERE (from_uuid = ? AND to_uuid = ?) OR (from_uuid = ? AND to_uuid = ?)').run(x, y, y, x);
  }

  removeFriendship(x: string, y: string): boolean {
    const [a, b] = pair(x, y);
    return Number(this.stmt('DELETE FROM friendships WHERE a = ? AND b = ?').run(a, b).changes) > 0;
  }

  hasRequest(from: string, to: string): boolean {
    return !!this.stmt('SELECT 1 FROM requests WHERE from_uuid = ? AND to_uuid = ?').get(from, to);
  }

  addRequest(from: string, to: string) {
    this.stmt('INSERT OR IGNORE INTO requests (from_uuid, to_uuid, created_at) VALUES (?, ?, ?)').run(from, to, Date.now());
  }

  removeRequest(from: string, to: string): boolean {
    return Number(this.stmt('DELETE FROM requests WHERE from_uuid = ? AND to_uuid = ?').run(from, to).changes) > 0;
  }

  incoming(uuid: string): Request[] {
    return this.stmt(`SELECT u.uuid AS id, u.handle, u.name, ${AVATAR('u')} AS avatar, r.created_at AS at FROM requests r JOIN users u ON u.uuid = r.from_uuid
      WHERE r.to_uuid = ? ORDER BY r.created_at DESC`).all(uuid) as unknown as Request[];
  }

  outgoing(uuid: string): Request[] {
    return this.stmt(`SELECT u.uuid AS id, u.handle, u.name, ${AVATAR('u')} AS avatar, r.created_at AS at FROM requests r JOIN users u ON u.uuid = r.to_uuid
      WHERE r.from_uuid = ? ORDER BY r.created_at DESC`).all(uuid) as unknown as Request[];
  }

  // ---- messages ----

  addMessage(from: string, to: string, text: string, invite?: Invite, waypoint?: SharedWaypoint): Message {
    const at = Date.now();
    const { lastInsertRowid } = this.stmt('INSERT INTO messages (from_uuid, to_uuid, text, created_at, invite, waypoint) VALUES (?, ?, ?, ?, ?, ?)')
      .run(from, to, text, at, invite ? JSON.stringify(invite) : null, waypoint ? JSON.stringify(waypoint) : null);
    return { id: Number(lastInsertRowid), from, to, text, at, readAt: null, ...(invite ? { invite } : {}), ...(waypoint ? { waypoint } : {}) };
  }

  /** The conversation between two players, newest last; `before` pages back by message id. */
  conversation(x: string, y: string, limit: number, before?: number): Message[] {
    const rows = this.stmt(`SELECT ${MESSAGE_COLUMNS} FROM messages
      WHERE ((from_uuid = ? AND to_uuid = ?) OR (from_uuid = ? AND to_uuid = ?)) AND id < ?
      ORDER BY id DESC LIMIT ?`).all(x, y, y, x, before ?? Number.MAX_SAFE_INTEGER, limit) as unknown as MessageRow[];
    return rows.reverse().map(toMessage);
  }

  /** One message between the two (either way), or undefined. */
  messageBetween(x: string, y: string, id: number): Message | undefined {
    const row = this.stmt(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE id = ? AND ((from_uuid = ? AND to_uuid = ?) OR (from_uuid = ? AND to_uuid = ?))`)
      .get(id, x, y, y, x) as unknown as MessageRow | undefined;
    return row && toMessage(row);
  }

  /** The author's new text; the old one is not kept. */
  editMessage(id: number, text: string, at = Date.now()) {
    this.stmt('UPDATE messages SET text = ?, edited_at = ? WHERE id = ? AND deleted_at IS NULL').run(text, at, id);
    // keys handed over for the old text cannot open the new one (chatKeys.ts); the picture's stay
    this.stmt("DELETE FROM chat_wraps WHERE kind = 'm' AND msg = ? AND field = 'text'").run(id);
  }

  /** Takes a message back: what stays is that there was one (no text, invite or waypoint); it does not count as unread. */
  deleteMessage(id: number, at = Date.now()) {
    this.stmt("UPDATE messages SET text = '', invite = NULL, waypoint = NULL, edited_at = NULL, deleted_at = ? WHERE id = ?").run(at, id);
    this.stmt("DELETE FROM chat_wraps WHERE kind = 'm' AND msg = ?").run(id);
  }

  /** Marks what `from` sent to `reader` as read; returns the time used, or undefined when nothing was unread. */
  markRead(reader: string, from: string): number | undefined {
    const at = Date.now();
    const { changes } = this.stmt('UPDATE messages SET read_at = ? WHERE to_uuid = ? AND from_uuid = ? AND read_at IS NULL').run(at, reader, from);
    return Number(changes) > 0 ? at : undefined;
  }

  unreadCounts(uuid: string): Record<string, number> {
    const rows = this.stmt('SELECT from_uuid AS "from", COUNT(*) AS n FROM messages WHERE to_uuid = ? AND read_at IS NULL AND deleted_at IS NULL GROUP BY from_uuid').all(uuid) as { from: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.from, Number(r.n)]));
  }

  /** Time of the newest message with each friend, for sorting conversations. */
  lastMessageTimes(uuid: string): Record<string, number> {
    // each side on its own index (messages_from_at, messages_to_at), then the newer of the two per friend
    const rows = this.stmt(`SELECT other, MAX(at) AS at FROM (
      SELECT to_uuid AS other, MAX(created_at) AS at FROM messages WHERE from_uuid = ? GROUP BY to_uuid
      UNION ALL SELECT from_uuid AS other, MAX(created_at) AS at FROM messages WHERE to_uuid = ? GROUP BY from_uuid
    ) GROUP BY other`).all(uuid, uuid) as { other: string; at: number }[];
    return Object.fromEntries(rows.map((r) => [r.other, Number(r.at)]));
  }

  // ---- partner servers ----

  partners(): import('./partners.ts').Partner[] {
    return (this.stmt(`SELECT ${PARTNER_COLUMNS} FROM partners ORDER BY address`).all() as unknown as PartnerRow[]).map(toPartner);
  }

  partner(id: string): import('./partners.ts').Partner | undefined {
    const p = this.stmt(`SELECT ${PARTNER_COLUMNS} FROM partners WHERE id = ?`).get(id) as unknown as PartnerRow | undefined;
    return p ? toPartner(p) : undefined;
  }

  partnerByAddress(address: string): import('./partners.ts').Partner | undefined {
    const p = this.stmt(`SELECT ${PARTNER_COLUMNS} FROM partners WHERE address = ?`).get(address) as unknown as PartnerRow | undefined;
    return p ? toPartner(p) : undefined;
  }

  /** A partner's animated icon: the sprite sheet's file ('' for none), a frame's side and the frames' delays in ms. */
  setPartnerIcon(id: string, icon: string, size: number, delays: number[]) {
    this.stmt('UPDATE partners SET icon = ?, icon_size = ?, icon_delays = ?, icon_updated_at = ? WHERE id = ?').run(icon, size, JSON.stringify(delays), Date.now(), id);
  }

  addPartner(p: import('./partners.ts').Partner) {
    this.stmt('INSERT INTO partners (id, address, name, owner, co_owners, background, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(p.id, p.address, p.name, p.owner, JSON.stringify(p.coOwners), p.background, p.updatedAt);
  }

  updatePartner(id: string, name: string, owner: string, coOwners: string[]) {
    this.stmt('UPDATE partners SET name = ?, owner = ?, co_owners = ?, updated_at = ? WHERE id = ?').run(name, owner, JSON.stringify(coOwners), Date.now(), id);
  }

  setPartnerBackground(id: string, background: string) {
    this.stmt('UPDATE partners SET background = ?, updated_at = ? WHERE id = ?').run(background, Date.now(), id);
  }

  removePartner(id: string) {
    this.stmt('DELETE FROM partners WHERE id = ?').run(id);
  }

  /** The partner's other addresses (normalized), which the game treats as the partner too; its pictures keep their version. */
  setPartnerAliases(id: string, aliases: string[]) {
    this.stmt('UPDATE partners SET aliases = ? WHERE id = ?').run(JSON.stringify(aliases), id);
  }

  /** Whether the game pins this partner on top of its server list, and lets it take turns at the very top. */
  setPartnerPinning(id: string, pinned: boolean, rotate: boolean) {
    this.stmt('UPDATE partners SET pinned = ?, rotate = ?, updated_at = ? WHERE id = ?').run(pinned ? 1 : 0, rotate ? 1 : 0, Date.now(), id);
  }

  // ---- shared logs ----

  addLog(id: string, owner: string, size: number, lines: number) {
    this.stmt('INSERT INTO logs (id, owner, size, lines, created_at) VALUES (?, ?, ?, ?, ?)').run(id, owner, size, lines, Date.now());
  }

  sharedLog(id: string): { id: string; owner: string; size: number; lines: number; createdAt: number } | undefined {
    return this.stmt('SELECT id, owner, size, lines, created_at AS createdAt FROM logs WHERE id = ?').get(id) as { id: string; owner: string; size: number; lines: number; createdAt: number } | undefined;
  }

  /** Shared logs for the admin panel, newest first, with who sent them and the reports that point at them. */
  logs(query: string, limit: number, offset: number): { logs: { id: string; owner: string; ownerHandle: string | null; size: number; lines: number; createdAt: number; bugs: number }[]; total: number } {
    const like = `%${query.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const where = `WHERE (? = '' OR lower(l.id) LIKE ? ESCAPE '\\' OR lower(coalesce(u.handle, '')) LIKE ? ESCAPE '\\')`;
    const args = [query, like, like];
    const total = (this.stmt(`SELECT COUNT(*) AS n FROM logs l LEFT JOIN users u ON u.uuid = l.owner ${where}`).get(...args) as { n: number }).n;
    const rows = this.stmt(`SELECT l.id, l.owner, u.handle AS ownerHandle, l.size, l.lines, l.created_at AS createdAt,
      (SELECT COUNT(*) FROM bugs b WHERE b.log_id = l.id) AS bugs
      FROM logs l LEFT JOIN users u ON u.uuid = l.owner ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as unknown as { id: string; owner: string; ownerHandle: string | null; size: number; lines: number; createdAt: number; bugs: number }[];
    return { logs: rows, total };
  }

  /** Logs older than `before`, to remove with their files. */
  /** An account's shared logs, except those a bug report links to (the public bug history keeps them for their time). */
  ownedLogs(owner: string): string[] {
    return (this.stmt('SELECT id FROM logs WHERE owner = ? AND id NOT IN (SELECT log_id FROM bugs)').all(owner) as { id: string }[]).map((r) => r.id);
  }

  oldLogs(before: number): string[] {
    return (this.stmt('SELECT id FROM logs WHERE created_at < ?').all(before) as { id: string }[]).map((r) => r.id);
  }

  removeLog(id: string) {
    this.stmt('DELETE FROM logs WHERE id = ?').run(id);
  }

  // ---- bug reports ----

  addBug(b: { author: string; title: string; body: string; logId: string; version: string; os: string }): number {
    const now = Date.now();
    const { lastInsertRowid } = this.stmt('INSERT INTO bugs (author, title, body, log_id, version, os, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(b.author, b.title, b.body, b.logId, b.version, b.os, 'open', now, now);
    return Number(lastInsertRowid);
  }

  bugs(status: string, query: string, limit: number, offset: number): { bugs: Bug[]; total: number } {
    const like = `%${query.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const where = `WHERE (? = '' OR b.status = ?) AND (lower(b.title) LIKE ? ESCAPE '\\' OR lower(b.body) LIKE ? ESCAPE '\\')`;
    const args = [status, status, like, like];
    const total = (this.stmt(`SELECT COUNT(*) AS n FROM bugs b ${where}`).get(...args) as { n: number }).n;
    const rows = this.stmt(`SELECT b.id, b.author, u.handle AS authorHandle, b.title, b.body, b.log_id AS logId, b.version, b.os, b.status, b.created_at AS createdAt, b.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM bug_comments c WHERE c.bug_id = b.id) AS comments
      FROM bugs b LEFT JOIN users u ON u.uuid = b.author ${where} ORDER BY b.updated_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as unknown as Bug[];
    return { bugs: rows, total };
  }

  bug(id: number): Bug | undefined {
    return this.stmt(`SELECT b.id, b.author, u.handle AS authorHandle, b.title, b.body, b.log_id AS logId, b.version, b.os, b.status, b.created_at AS createdAt, b.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM bug_comments c WHERE c.bug_id = b.id) AS comments
      FROM bugs b LEFT JOIN users u ON u.uuid = b.author WHERE b.id = ?`).get(id) as Bug | undefined;
  }

  setBugStatus(id: number, status: string) {
    this.stmt('UPDATE bugs SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
  }

  removeBug(id: number) {
    this.stmt('DELETE FROM bugs WHERE id = ?').run(id);
  }

  bugComments(id: number): BugComment[] {
    return this.stmt(`SELECT c.id, c.author, u.handle AS authorHandle, u.rank AS authorRole, c.body, c.created_at AS createdAt
      FROM bug_comments c LEFT JOIN users u ON u.uuid = c.author WHERE c.bug_id = ? ORDER BY c.id`).all(id) as unknown as BugComment[];
  }

  addBugComment(bugId: number, author: string, body: string): number {
    const now = Date.now();
    const { lastInsertRowid } = this.stmt('INSERT INTO bug_comments (bug_id, author, body, created_at) VALUES (?, ?, ?, ?)').run(bugId, author, body, now);
    this.stmt('UPDATE bugs SET updated_at = ? WHERE id = ?').run(now, bugId);
    return Number(lastInsertRowid);
  }

  removeBugComment(id: number) {
    this.stmt('DELETE FROM bug_comments WHERE id = ?').run(id);
  }

  // ---- profiles shared by code (the files are next to the database, see profileShares.ts) ----

  addProfileShare(s: { code: string; owner: string; name: string; gameVersion: string; loader: string; size: number; expiresAt: number }) {
    this.stmt('INSERT INTO profile_shares (code, owner, name, game_version, loader, size, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(s.code, s.owner, s.name, s.gameVersion, s.loader, s.size, Date.now(), s.expiresAt);
  }

  /** A share that has not expired yet, with its owner's handle (null once the account is gone). */
  profileShare(code: string): ProfileShare | undefined {
    return this.stmt(`SELECT ${SHARE_COLUMNS}, u.handle AS ownerHandle FROM profile_shares s LEFT JOIN users u ON u.uuid = s.owner
      WHERE s.code = ? AND s.expires_at > ?`).get(code, Date.now()) as ProfileShare | undefined;
  }

  /** One player's shares that still work, newest first. */
  profileShares(owner: string): ProfileShare[] {
    return this.stmt(`SELECT ${SHARE_COLUMNS}, NULL AS ownerHandle FROM profile_shares s WHERE s.owner = ? AND s.expires_at > ? ORDER BY s.created_at DESC`)
      .all(owner, Date.now()) as unknown as ProfileShare[];
  }

  countShareDownload(code: string) {
    this.stmt('UPDATE profile_shares SET downloads = downloads + 1 WHERE code = ?').run(code);
  }

  /** Codes past their time, to remove with their files. */
  expiredProfileShares(now: number): string[] {
    return (this.stmt('SELECT code FROM profile_shares WHERE expires_at <= ?').all(now) as { code: string }[]).map((r) => r.code);
  }

  removeProfileShare(code: string) {
    this.stmt('DELETE FROM profile_shares WHERE code = ?').run(code);
  }
}
