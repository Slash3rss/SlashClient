import type { DatabaseSync } from 'node:sqlite';

/**
 * The numbers on the admin panel's dashboard ("Pulpit") beyond the basic counts in db.ts: activity,
 * platforms, servers, the social side, the economy, supporters, streams and storage. Everything is
 * read from what the server already keeps (one aggregate query each, with indexes on the time
 * columns), plus three small records this file keeps itself, all written at most once in a while:
 *
 * - `stats_active_days` (day, account): an account that used the API or connected that day. Written
 *   once per account and UTC day (remembered in memory), for the daily-active chart and DAU/WAU/MAU.
 * - `stats_clients` (account, client, version, last seen): the launcher version an account last
 *   used (the launcher's `X-SlashClient: launcher/<version>` header), written when it changes or
 *   at most once an hour per account.
 * - `stats_peaks` (day, most online, most in game): the day's peak of connected launchers and of
 *   players in game with the mod, sampled every 30 s and on each connection; written only when the
 *   day's peak goes up.
 *
 * Days are UTC days, as everywhere else on this server (achievements.ts).
 */

export const STATS_PERIODS = [7, 30, 90] as const;
export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const dayKey = (at: number) => new Date(at).toISOString().slice(0, 10);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stats_active_days (day TEXT NOT NULL, uuid TEXT NOT NULL, PRIMARY KEY (day, uuid)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS stats_clients (uuid TEXT NOT NULL, client TEXT NOT NULL, version TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uuid, client));
CREATE INDEX IF NOT EXISTS stats_clients_at ON stats_clients(client, at);
CREATE TABLE IF NOT EXISTS stats_peaks (day TEXT PRIMARY KEY, online INTEGER NOT NULL DEFAULT 0, in_game INTEGER NOT NULL DEFAULT 0);
`;

/**
 * Indexes the dashboard's time-range queries need on tables kept elsewhere. Each only when its
 * table is there (a store that was not created yet gets none), and IF NOT EXISTS: safe on every start.
 */
const INDEXES: [table: string, sql: string][] = [
  ['users', 'CREATE INDEX IF NOT EXISTS users_created ON users(created_at)'],
  ['users', 'CREATE INDEX IF NOT EXISTS users_last_seen ON users(last_seen)'],
  ['sessions', 'CREATE INDEX IF NOT EXISTS sessions_last_used ON sessions(last_used)'],
  ['messages', 'CREATE INDEX IF NOT EXISTS messages_created ON messages(created_at)'],
  ['play_days', 'CREATE INDEX IF NOT EXISTS play_days_day ON play_days(day)'],
  ['play_server_days', 'CREATE INDEX IF NOT EXISTS play_server_days_day ON play_server_days(day)'],
  ['sparks_ledger', 'CREATE INDEX IF NOT EXISTS sparks_ledger_reason ON sparks_ledger(reason, at)'],
  ['achievements', 'CREATE INDEX IF NOT EXISTS achievements_unlocked ON achievements(unlocked_at)'],
  ['chat_group_messages', 'CREATE INDEX IF NOT EXISTS chat_group_messages_created ON chat_group_messages(created_at)'],
  ['community_messages', 'CREATE INDEX IF NOT EXISTS community_messages_created ON community_messages(created_at)'],
];

/** Who was active and with which launcher, and the day's peak online: the records described above. */
export class ActivityTracker {
  private readonly sql: DatabaseSync;
  private readonly now: () => number;
  private day = '';
  private seenToday = new Set<string>();
  private clients = new Map<string, { version: string; at: number }>();
  private peak = { day: '', online: 0, inGame: 0 };

  constructor(sql: DatabaseSync, now: () => number = Date.now) {
    this.sql = sql;
    this.now = now;
    sql.exec(SCHEMA);
  }

  /** An account used the API or connected: once a day it goes into the day's list. */
  seen(uuid: string) {
    const today = dayKey(this.now());
    if (today !== this.day) {
      this.day = today;
      this.seenToday = new Set();
    }
    if (this.seenToday.has(uuid)) return;
    this.seenToday.add(uuid);
    try {
      this.sql.prepare('INSERT OR IGNORE INTO stats_active_days (day, uuid) VALUES (?, ?)').run(today, uuid);
    } catch {
      // the account was deleted in the meantime: nothing to record
    }
  }

  /** The client an account uses ('launcher' and its version): written when it changes, else once an hour. */
  client(uuid: string, client: string, version: string) {
    if (!version) return;
    const key = `${uuid}:${client}`;
    const at = this.now();
    const was = this.clients.get(key);
    if (was && was.version === version && at - was.at < HOUR_MS) return;
    this.clients.set(key, { version, at });
    this.sql.prepare(`INSERT INTO stats_clients (uuid, client, version, at) VALUES (?, ?, ?, ?)
      ON CONFLICT (uuid, client) DO UPDATE SET version = excluded.version, at = excluded.at`).run(uuid, client, version.slice(0, 32), at);
  }

  /** How many are online and in game now: kept when it beats the day's peak. */
  sample(online: number, inGame: number) {
    const today = dayKey(this.now());
    if (this.peak.day !== today) {
      const row = this.sql.prepare('SELECT online, in_game AS inGame FROM stats_peaks WHERE day = ?').get(today) as { online: number; inGame: number } | undefined;
      this.peak = { day: today, online: row?.online ?? 0, inGame: row?.inGame ?? 0 };
    }
    if (online <= this.peak.online && inGame <= this.peak.inGame) return;
    this.peak.online = Math.max(this.peak.online, online);
    this.peak.inGame = Math.max(this.peak.inGame, inGame);
    this.sql.prepare(`INSERT INTO stats_peaks (day, online, in_game) VALUES (?, ?, ?)
      ON CONFLICT (day) DO UPDATE SET online = MAX(online, excluded.online), in_game = MAX(in_game, excluded.in_game)`).run(today, this.peak.online, this.peak.inGame);
  }
}

/** What a connected launcher reports (presence.ts), for the "now" numbers. */
export interface LiveActivity { kind?: string; version?: string; server?: string }

export interface AdminStatsDeps {
  sql: DatabaseSync;
  now?: () => number;
  /** The activity of every connected account (aggregated here, never listed). */
  activities: () => Iterable<LiveActivity>;
  /** Parties going on now (sharing.ts). */
  parties?: () => number;
  /** A server's key as play time keeps it (achievements.ts `serverKey`); undefined for LAN and local addresses. */
  serverKey: (address: string | undefined) => string | undefined;
  /** A server's name from its status rule ("SkyUp.pl"). */
  serverName?: (server: string) => string | undefined;
  /** The achievements in use, with their names. */
  achievements?: () => { id: string; name: string; hidden?: boolean }[];
  /** Files kept and room for them (storage.ts). */
  storage?: () => { used: number; files: number; capacity: number; unlimited: boolean };
}

type Row = Record<string, number | string | null>;

export function createAdminStats(deps: AdminStatsDeps) {
  const { sql } = deps;
  const now = deps.now ?? Date.now;
  const tables = new Set((sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name));
  for (const [table, index] of INDEXES) if (tables.has(table)) sql.exec(index);
  /** Tables made by stores after this ran are looked up again when asked. */
  const has = (table: string) => tables.has(table) || (!!sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) && !!tables.add(table));

  const one = (q: string, ...args: (string | number)[]) => sql.prepare(q).get(...args) as Row | undefined;
  const all = (q: string, ...args: (string | number)[]) => sql.prepare(q).all(...args) as Row[];
  const num = (q: string, ...args: (string | number)[]) => Number(one(q, ...args)?.n ?? 0);
  /** A count from a table that may not be there yet: 0 then. */
  const count = (table: string, q: string, ...args: (string | number)[]) => (has(table) ? num(q, ...args) : 0);

  /** Every day of the period, oldest first, as UTC day keys. */
  function daysOf(days: number, at: number): string[] {
    const start = Math.floor(at / DAY_MS) * DAY_MS - (days - 1) * DAY_MS;
    return Array.from({ length: days }, (_, i) => dayKey(start + i * DAY_MS));
  }
  /** Rows of (day, n) into one number per day of the period. */
  function perDay(keys: string[], rows: Row[], field = 'n'): number[] {
    const by = new Map(rows.map((r) => [String(r.day), Number(r[field] ?? 0)]));
    return keys.map((k) => by.get(k) ?? 0);
  }
  const DAY_OF = (col: string) => `strftime('%Y-%m-%d', ${col} / 1000, 'unixepoch')`;

  /**
   * Who was active on which day: the accounts this file saw (`stats_active_days`), and from before it
   * kept them, those who played (play_days), wrote a message or made the account that day.
   */
  function activeSources(fromDay: string, fromMs: number): { sql: string; args: (string | number)[] } {
    const parts: string[] = ['SELECT day, uuid FROM stats_active_days WHERE day >= ?'];
    const args: (string | number)[] = [fromDay];
    if (has('play_days')) {
      parts.push('SELECT day, uuid FROM play_days WHERE day >= ? AND seconds > 0');
      args.push(fromDay);
    }
    parts.push(`SELECT ${DAY_OF('created_at')} AS day, from_uuid AS uuid FROM messages WHERE created_at >= ?`);
    args.push(fromMs);
    parts.push(`SELECT ${DAY_OF('created_at')} AS day, uuid FROM users WHERE created_at >= ?`);
    args.push(fromMs);
    return { sql: parts.join(' UNION ALL '), args };
  }

  /** Accounts active since `from`: any of the day sources, a sign-in or the last time they were seen. */
  function activeSince(from: number): number {
    const src = activeSources(dayKey(from), from);
    return num(`SELECT COUNT(*) AS n FROM (SELECT uuid FROM (${src.sql})
      UNION SELECT uuid FROM users WHERE last_seen >= ? UNION SELECT uuid FROM sessions WHERE last_used >= ?)`, ...src.args, from, from);
  }

  function activity(days: number, at: number, keys: string[]) {
    const from = Date.parse(`${keys[0]}T00:00:00Z`);
    const src = activeSources(keys[0], from);
    const daily = perDay(keys, all(`SELECT day, COUNT(DISTINCT uuid) AS n FROM (${src.sql}) GROUP BY day`, ...src.args));
    const play = has('play_days') ? all('SELECT day, SUM(seconds) AS s FROM play_days WHERE day >= ? GROUP BY day', keys[0]) : [];
    const peaks = all('SELECT day, online, in_game FROM stats_peaks WHERE day >= ?', keys[0]);
    const best = one('SELECT day, online AS n FROM stats_peaks ORDER BY online DESC, day DESC LIMIT 1');
    /** Of the accounts made between `older` and `newer` days ago, how many were active in the last `newer` days. */
    const retention = (newer: number, older: number) => {
      const cohortFrom = at - older * DAY_MS;
      const cohortTo = at - newer * DAY_MS;
      const since = at - newer * DAY_MS;
      const cohort = num('SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?', cohortFrom, cohortTo);
      const back = activeSources(dayKey(since), since);
      const returned = num(`SELECT COUNT(*) AS n FROM users u WHERE u.created_at >= ? AND u.created_at < ? AND (u.last_seen >= ?
        OR EXISTS (SELECT 1 FROM sessions s WHERE s.uuid = u.uuid AND s.last_used >= ?)
        OR u.uuid IN (SELECT uuid FROM (${back.sql})))`, cohortFrom, cohortTo, since, since, ...back.args);
      return { cohort, returned };
    };
    return {
      dau: activeSince(at - DAY_MS),
      wau: activeSince(at - 7 * DAY_MS),
      mau: activeSince(at - 30 * DAY_MS),
      daily,
      playHours: perDay(keys, play, 's').map((s) => Math.round((s / 3600) * 10) / 10),
      peakOnline: perDay(keys, peaks, 'online'),
      peakInGame: perDay(keys, peaks, 'in_game'),
      peakBest: best ? { n: Number(best.n), day: String(best.day) } : null,
      retention: { d7: retention(7, 14), d30: retention(30, 60) },
      days,
    };
  }

  function platforms(from: number) {
    const providers: Record<string, number> = {};
    for (const r of all('SELECT provider, COUNT(DISTINCT uuid) AS n FROM identities GROUP BY provider')) providers[String(r.provider)] = Number(r.n);
    const launchers: Record<string, number> = {};
    for (const r of all("SELECT version, COUNT(*) AS n FROM stats_clients WHERE client = 'launcher' AND at >= ? GROUP BY version", from)) launchers[String(r.version)] = Number(r.n);
    return { providers, launchers };
  }

  function servers(from: string) {
    if (!has('play_server_days')) return { played: [] };
    const played = all(`SELECT server, SUM(seconds) AS s, COUNT(DISTINCT uuid) AS players FROM play_server_days WHERE day >= ?
      GROUP BY server ORDER BY s DESC LIMIT 10`, from).map((r) => ({
      server: String(r.server), name: deps.serverName?.(String(r.server)) ?? '', hours: Math.round((Number(r.s) / 3600) * 10) / 10, players: Number(r.players),
    }));
    return { played };
  }

  function social(from: number) {
    return {
      requests: num('SELECT COUNT(*) AS n FROM requests'),
      invites: num('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ? AND invite IS NOT NULL', from),
      partyInvites: num("SELECT COUNT(DISTINCT json_extract(invite, '$.party')) AS n FROM messages WHERE created_at >= ? AND invite IS NOT NULL AND json_extract(invite, '$.party') IS NOT NULL", from),
      waypoints: num('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ? AND waypoint IS NOT NULL', from),
      groups: count('chat_groups', 'SELECT COUNT(*) AS n FROM chat_groups'),
      groupMembers: count('chat_group_members', 'SELECT COUNT(*) AS n FROM chat_group_members'),
      groupMessages: count('chat_group_messages', 'SELECT COUNT(*) AS n FROM chat_group_messages WHERE created_at >= ? AND event IS NULL', from),
      clans: count('clans', 'SELECT COUNT(*) AS n FROM clans'),
      clanMembers: count('clan_members', 'SELECT COUNT(*) AS n FROM clan_members'),
      communities: count('communities', 'SELECT COUNT(*) AS n FROM communities'),
      communityMembers: count('community_members', 'SELECT COUNT(*) AS n FROM community_members'),
      communityMessages: count('community_messages', 'SELECT COUNT(*) AS n FROM community_messages WHERE created_at >= ? AND deleted_at IS NULL', from),
      reports: count('community_reports', 'SELECT COUNT(*) AS n FROM community_reports WHERE resolved_at IS NULL'),
    };
  }

  function messagesDaily(keys: string[], from: number): number[] {
    const rows = all(`SELECT ${DAY_OF('created_at')} AS day, COUNT(*) AS n FROM messages WHERE created_at >= ? GROUP BY day`, from);
    if (has('chat_group_messages')) {
      // group chats and communities count too: every message written that day
      const add = (q: string) => {
        for (const r of all(q, from)) rows.push(r);
      };
      add(`SELECT ${DAY_OF('created_at')} AS day, COUNT(*) AS n FROM chat_group_messages WHERE created_at >= ? AND event IS NULL GROUP BY day`);
      if (has('community_messages')) add(`SELECT ${DAY_OF('created_at')} AS day, COUNT(*) AS n FROM community_messages WHERE created_at >= ? GROUP BY day`);
    }
    const sum = new Map<string, number>();
    for (const r of rows) sum.set(String(r.day), (sum.get(String(r.day)) ?? 0) + Number(r.n));
    return keys.map((k) => sum.get(k) ?? 0);
  }

  function economy(from: number) {
    if (!has('sparks_ledger')) return undefined;
    const period = one(`SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS issued, COALESCE(-SUM(CASE WHEN reason = 'purchase' THEN amount END), 0) AS spent,
      COALESCE(SUM(CASE WHEN reason = 'purchase' THEN 1 END), 0) AS purchases, COALESCE(SUM(CASE WHEN reason = 'admin' AND amount > 0 THEN amount END), 0) AS given,
      COALESCE(-SUM(CASE WHEN reason = 'admin' AND amount < 0 THEN amount END), 0) AS taken FROM sparks_ledger WHERE at >= ?`, from)!;
    const total = one(`SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS issued, COALESCE(-SUM(CASE WHEN reason = 'purchase' THEN amount END), 0) AS spent,
      COALESCE(SUM(CASE WHEN reason = 'purchase' THEN 1 END), 0) AS purchases FROM sparks_ledger`)!;
    const wallets = one('SELECT COUNT(*) AS wallets, COALESCE(SUM(balance), 0) AS balance FROM sparks_wallets WHERE balance > 0')!;
    const topItems = all("SELECT ref AS id, COUNT(*) AS n FROM sparks_ledger WHERE reason = 'purchase' GROUP BY ref ORDER BY n DESC, ref LIMIT 8")
      .map((r) => ({ id: String(r.id), n: Number(r.n) }));
    return {
      issued: Number(period.issued), spent: Number(period.spent), purchases: Number(period.purchases), given: Number(period.given), taken: Number(period.taken),
      issuedTotal: Number(total.issued), spentTotal: Number(total.spent), purchasesTotal: Number(total.purchases),
      circulating: Number(wallets.balance), wallets: Number(wallets.wallets), topItems,
    };
  }

  function achievementStats(from: number, users: number) {
    if (!has('achievements')) return undefined;
    const list = deps.achievements?.() ?? [];
    const counts = new Map(all('SELECT id, COUNT(*) AS n FROM achievements GROUP BY id').map((r) => [String(r.id), Number(r.n)]));
    const named = list.map((a) => ({ id: a.id, name: a.hidden ? `${a.name} (ukryte)` : a.name, n: counts.get(a.id) ?? 0 }));
    const byCount = [...named].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'pl'));
    return {
      total: num('SELECT COUNT(*) AS n FROM achievements'),
      period: num('SELECT COUNT(*) AS n FROM achievements WHERE unlocked_at >= ?', from),
      holders: num('SELECT COUNT(DISTINCT uuid) AS n FROM achievements'),
      defined: list.length,
      users,
      top: byCount.slice(0, 5),
      rare: byCount.slice(-5).reverse(),
    };
  }

  function support(at: number, from: number) {
    if (!has('support_payments')) return undefined;
    const month = new Date(at).toISOString().slice(0, 7);
    const money = (where: string, ...args: (string | number)[]) => {
      const out: Record<string, number> = {};
      for (const r of all(`SELECT currency, SUM(CASE WHEN status IN ('refunded', 'disputed') THEN 0 ELSE amount END) AS n FROM support_payments
        WHERE mode = 'live' AND paid_at > 0 ${where} GROUP BY currency`, ...args)) out[String(r.currency)] = Number(r.n);
      return out;
    };
    const tiers: Record<string, number> = {};
    for (const r of all(`SELECT t.name AS name, COUNT(DISTINCT g.user) AS n FROM support_grants g JOIN support_tiers t ON t.id = g.tier
      WHERE g.revoked_at = 0 AND g.starts_at <= ? AND (g.expires_at IS NULL OR g.expires_at > ?) GROUP BY t.id ORDER BY t.level DESC`, at, at)) tiers[String(r.name)] = Number(r.n);
    return {
      active: num(`SELECT COUNT(DISTINCT g.user) AS n FROM support_grants g JOIN support_tiers t ON t.id = g.tier
        WHERE g.revoked_at = 0 AND g.starts_at <= ? AND (g.expires_at IS NULL OR g.expires_at > ?)`, at, at),
      ever: num('SELECT COUNT(DISTINCT user) AS n FROM support_grants WHERE revoked_at = 0'),
      tiers,
      revenueMonth: money(`AND strftime('%Y-%m', paid_at / 1000, 'unixepoch') = ?`, month),
      revenuePeriod: money('AND paid_at >= ?', from),
      revenueTotal: money(''),
      payments: num("SELECT COUNT(*) AS n FROM support_payments WHERE mode = 'live' AND paid_at >= ?", from),
      testPayments: num("SELECT COUNT(*) AS n FROM support_payments WHERE mode = 'test' AND paid_at >= ?", from),
      subscriptions: count('support_subscriptions', "SELECT COUNT(*) AS n FROM support_subscriptions WHERE mode = 'live' AND status IN ('active', 'trialing', 'past_due')"),
      refundsPending: count('support_refunds', "SELECT COUNT(*) AS n FROM support_refunds WHERE status = 'pending'"),
    };
  }

  function bugs() {
    if (!has('bugs')) return undefined;
    return { open: num("SELECT COUNT(*) AS n FROM bugs WHERE status IN ('open', 'confirmed')"), total: num('SELECT COUNT(*) AS n FROM bugs') };
  }

  function streams() {
    if (!has('stream_accounts')) return undefined;
    const linked: Record<string, number> = {};
    for (const r of all('SELECT platform, COUNT(*) AS n FROM stream_accounts GROUP BY platform')) linked[String(r.platform)] = Number(r.n);
    const live: Record<string, number> = {};
    for (const r of all(`SELECT l.platform AS platform, COUNT(*) AS n FROM stream_live l JOIN stream_accounts a ON a.platform = l.platform AND a.subject = l.subject
      WHERE l.live = 1 GROUP BY l.platform`)) live[String(r.platform)] = Number(r.n);
    const viewers = num('SELECT COALESCE(SUM(l.viewers), 0) AS n FROM stream_live l JOIN stream_accounts a ON a.platform = l.platform AND a.subject = l.subject WHERE l.live = 1');
    return { linked, live, viewers };
  }

  /** Everything from the database, for a period of `days` days (7, 30 or 90). */
  function stored(days: number) {
    const at = now();
    const keys = daysOf(days, at);
    const fromMs = Date.parse(`${keys[0]}T00:00:00Z`);
    const users = num('SELECT COUNT(*) AS n FROM users');
    return {
      activity: { ...activity(days, at, keys), messages: messagesDaily(keys, fromMs) },
      platforms: platforms(fromMs),
      servers: servers(keys[0]),
      social: social(fromMs),
      economy: economy(fromMs),
      achievements: achievementStats(fromMs, users),
      support: support(at, fromMs),
      bugs: bugs(),
      streams: streams(),
      storage: deps.storage?.(),
      from: keys[0],
    };
  }

  /** What connected launchers say right now: kinds of activity, game versions and loaders, servers. */
  function live() {
    const kinds: Record<string, number> = {};
    const versions: Record<string, number> = {};
    const loaders: Record<string, number> = {};
    const servers = new Map<string, number>();
    for (const a of deps.activities()) {
      if (!a.kind) continue;
      kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
      if (a.version && a.kind !== 'launcher') {
        // "1.21.4 · Fabric": the game's version and the loader
        const [game, loader] = a.version.split('·').map((s) => s.trim());
        if (game) versions[game] = (versions[game] ?? 0) + 1;
        if (loader) loaders[loader] = (loaders[loader] ?? 0) + 1;
      }
      const key = a.kind === 'server' ? deps.serverKey(a.server) : undefined;
      if (key) servers.set(key, (servers.get(key) ?? 0) + 1);
    }
    return {
      kinds, versions, loaders, parties: deps.parties?.() ?? 0,
      servers: [...servers].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10)
        .map(([server, players]) => ({ server, name: deps.serverName?.(server) ?? '', players })),
    };
  }

  return { stored, live };
}

export type AdminStats = ReturnType<typeof createAdminStats>;
