import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

/**
 * Every row of the database that belongs to one account, found from the schema itself (columns that
 * point at users) plus the columns that name an account without such a link (EXTRA). Two uses:
 * - the GDPR export (`export`): what the player may get a copy of, without secrets (session tokens,
 *   keys, push addresses), without encrypted data and without what messages say (only when and to whom);
 * - the snapshot kept for a while after the admin deletes an account (`snapshot`), so a mistake can be
 *   undone (adminAccount.ts): every row that deleting takes away and restoring can put back. Messages'
 *   contents, encrypted chat data, sessions and shared files are not in it (those do not come back).
 */

/** Columns that name an account but have no foreign key to users (the table → its columns). */
const EXTRA: Record<string, string[]> = {
  admin_log: ['target_id'], bugs: ['author'], bug_comments: ['author'], logs: ['owner'], profile_shares: ['owner'],
  chat_images: ['owner', 'recipient'], chat_groups: ['owner'], clans: ['owner'], communities: ['owner'], community_images: ['owner'],
  community_log: ['by_uuid'], referral_minecraft: ['invitee'], request_log: ['user'],
  stats_active_days: ['uuid'], stats_clients: ['uuid'],
  support_customers: ['user'], support_grants: ['user'], support_payments: ['user'], support_prefs: ['user'], support_refunds: ['user'], support_subscriptions: ['user'],
};

/** Left out of the export entirely: encrypted data and what only works as a secret. */
const NOT_EXPORTED = new Set(['chat_wraps', 'chat_backups', 'deleted_accounts']);
/** Columns left out of the export: secrets, encrypted blobs, and what messages say (their metadata stays). */
const HIDDEN: Record<string, string[]> = {
  sessions: ['token_hash'], device_keys: ['pub'], push_subscriptions: ['endpoint', 'p256dh', 'auth', 'vapid'],
  messages: ['text', 'invite', 'waypoint'], chat_group_messages: ['text'], community_messages: ['text', 'mentions'], community_reports: ['text'],
  stream_accounts: ['subs'],
};

/**
 * Not in the snapshot: what deleting does not take away (payments the law keeps, bug reports, the admin
 * log, the request log), what never comes back (messages and their encrypted keys, sessions, phones'
 * subscriptions, launchers' keys, shared files that are deleted with the account) and the reports
 * (they hold a copy of someone's message).
 */
const NOT_SNAPSHOT = new Set([
  'deleted_accounts', 'admin_log', 'request_log', 'bugs', 'bug_comments',
  'support_customers', 'support_grants', 'support_payments', 'support_refunds', 'support_subscriptions',
  'messages', 'chat_group_messages', 'community_messages', 'chat_wraps', 'chat_backups', 'sessions', 'push_subscriptions', 'device_keys', 'device_revoked',
  'chat_images', 'shared_media', 'cloud_profiles', 'profile_shares', 'logs', 'community_images', 'community_reports', 'community_log',
]);

export type Rows = Record<string, Record<string, unknown>[]>;

/** The account's columns of each table: those with a foreign key to users, and EXTRA's. */
export function userColumns(sql: DatabaseSync): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const tables = sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  for (const { name } of tables) {
    const columns = new Set((sql.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map((c) => c.name));
    const linked = (sql.prepare(`PRAGMA foreign_key_list("${name}")`).all() as { table: string; from: string }[]).filter((f) => f.table === 'users').map((f) => f.from);
    const cols = [...new Set([...(name === 'users' ? ['uuid'] : []), ...linked, ...(EXTRA[name] ?? []).filter((c) => columns.has(c))])];
    if (cols.length) out.set(name, cols);
  }
  return out;
}

/** Blobs (pictures kept in the database) as base64, so the rows fit in JSON. */
const toJson = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Uint8Array ? { $base64: Buffer.from(v).toString('base64') } : v]));
const fromJson = (v: unknown): SQLInputValue => {
  if (v && typeof v === 'object' && typeof (v as { $base64?: unknown }).$base64 === 'string') return Buffer.from((v as { $base64: string }).$base64, 'base64');
  return v as SQLInputValue;
};

/** The account's rows of every table (`mode`: what the export may show, or what the snapshot keeps). */
export function collectRows(sql: DatabaseSync, uuid: string, mode: 'export' | 'snapshot'): Rows {
  const out: Rows = {};
  for (const [table, cols] of userColumns(sql)) {
    if (mode === 'export' ? NOT_EXPORTED.has(table) : NOT_SNAPSHOT.has(table)) continue;
    // a group's pictures are named by the group ('g:<id>'), a person's by their id: only theirs match
    const rows = sql.prepare(`SELECT * FROM "${table}" WHERE ${cols.map((c) => `"${c}" = ?`).join(' OR ')}`).all(...cols.map(() => uuid)) as Record<string, unknown>[];
    if (!rows.length) continue;
    const hidden = mode === 'export' ? HIDDEN[table] ?? [] : [];
    out[table] = rows.map((r) => toJson(Object.fromEntries(Object.entries(r).filter(([k]) => !hidden.includes(k)))));
  }
  return out;
}

/**
 * Puts a snapshot's rows back. `users` first, then the rest in passes: a row whose foreign key is not
 * there yet (a clan before its members) waits for the next pass; one whose parent is gone for good
 * (a community deleted meanwhile) or that would repeat what is there now is skipped. Columns the table
 * no longer has are dropped. Returns how many rows went back and how many were skipped.
 */
export function restoreRows(sql: DatabaseSync, rows: Rows): { restored: number; skipped: number } {
  const columnsOf = new Map<string, Set<string>>();
  const columns = (table: string) => {
    let c = columnsOf.get(table);
    if (!c) columnsOf.set(table, (c = new Set((sql.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((x) => x.name))));
    return c;
  };
  const insert = (table: string, row: Record<string, unknown>, ignore: boolean) => {
    const have = columns(table);
    const entries = Object.entries(row).filter(([k]) => have.has(k));
    if (!entries.length) return 0;
    return Number(sql.prepare(`INSERT ${ignore ? 'OR IGNORE ' : ''}INTO "${table}" (${entries.map(([k]) => `"${k}"`).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`)
      .run(...entries.map(([, v]) => fromJson(v))).changes);
  };
  let restored = 0;
  for (const row of rows.users ?? []) restored += insert('users', row, false);
  let waiting = Object.entries(rows).filter(([t]) => t !== 'users' && columns(t).size).flatMap(([t, list]) => list.map((row) => ({ t, row })));
  let skipped = 0;
  for (let pass = 0; waiting.length && pass < 5; pass++) {
    const next: typeof waiting = [];
    for (const w of waiting) {
      try {
        if (insert(w.t, w.row, true)) restored++;
        else skipped++;
      } catch {
        next.push(w);
      }
    }
    if (next.length === waiting.length) break;
    waiting = next;
  }
  return { restored, skipped: skipped + waiting.length };
}
