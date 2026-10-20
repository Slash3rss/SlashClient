import type { DatabaseSync } from 'node:sqlite';
import type { LiveInfo, Platform } from './providers.ts';

/**
 * "Streamy"'s tables, each its own (added next to the rest, nothing else changes):
 * - stream_accounts: the Twitch or Kick channel an account linked (one per platform), with the
 *   ids of its event subscriptions;
 * - stream_live: whether that channel is live now and its stream (title, category, viewers…),
 *   with when it last went offline and when friends were last told (for the debounce);
 * - stream_prefs: the player's own choices (hide from friends, be told about friends);
 * - stream_providers: the apps' keys from the admin panel (the secrets sealed with STORAGE_SECRET_KEY);
 * - stream_events: webhook message ids already handled (a repeated one does nothing).
 */

export interface StreamAccount { uuid: string; platform: Platform; subject: string; login: string; name: string; linkedAt: number; subs: string[] }
export interface LiveRow extends LiveInfo { platform: Platform; live: boolean; updatedAt: number; offlineAt: number; notifiedAt: number }
export interface Prefs { hide: boolean; notify: boolean }
export interface ProviderRow { id: Platform; enabled: boolean; clientId: string; secret: string; hint: string; hookSecret: string; updatedAt: number; updatedBy: string }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stream_accounts (
  uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, platform TEXT NOT NULL, subject TEXT NOT NULL, login TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '', linked_at INTEGER NOT NULL, subs TEXT NOT NULL DEFAULT '', PRIMARY KEY (uuid, platform), UNIQUE (platform, subject));
CREATE TABLE IF NOT EXISTS stream_live (
  platform TEXT NOT NULL, subject TEXT NOT NULL, live INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
  viewers INTEGER NOT NULL DEFAULT 0, started_at INTEGER NOT NULL DEFAULT 0, thumbnail TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0,
  offline_at INTEGER NOT NULL DEFAULT 0, notified_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (platform, subject));
CREATE TABLE IF NOT EXISTS stream_prefs (uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, hide INTEGER NOT NULL DEFAULT 0, notify INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS stream_providers (
  id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, client_id TEXT NOT NULL DEFAULT '', secret TEXT NOT NULL DEFAULT '', hint TEXT NOT NULL DEFAULT '',
  hook_secret TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS stream_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL);`;

type Raw = Record<string, any>;
const account = (r: Raw): StreamAccount => ({ uuid: r.uuid, platform: r.platform, subject: r.subject, login: r.login, name: r.name || r.login, linkedAt: r.linked_at, subs: r.subs ? String(r.subs).split(',').filter(Boolean) : [] });
const live = (r: Raw): LiveRow => ({
  platform: r.platform, subject: r.subject, live: !!r.live, title: r.title, category: r.category, viewers: r.viewers, startedAt: r.started_at, thumbnail: r.thumbnail,
  updatedAt: r.updated_at, offlineAt: r.offline_at, notifiedAt: r.notified_at,
});

export class StreamStore {
  private readonly sql: DatabaseSync;
  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(SCHEMA);
  }

  accounts(uuid: string): StreamAccount[] {
    return (this.sql.prepare('SELECT * FROM stream_accounts WHERE uuid = ? ORDER BY platform').all(uuid) as Raw[]).map(account);
  }

  account(uuid: string, platform: Platform): StreamAccount | undefined {
    const r = this.sql.prepare('SELECT * FROM stream_accounts WHERE uuid = ? AND platform = ?').get(uuid, platform) as Raw | undefined;
    return r && account(r);
  }

  bySubject(platform: Platform, subject: string): StreamAccount | undefined {
    const r = this.sql.prepare('SELECT * FROM stream_accounts WHERE platform = ? AND subject = ?').get(platform, subject) as Raw | undefined;
    return r && account(r);
  }

  /** Every linked channel of a platform (a reconcile walks them in batches). */
  all(platform?: Platform): StreamAccount[] {
    const rows = platform ? this.sql.prepare('SELECT * FROM stream_accounts WHERE platform = ? ORDER BY linked_at').all(platform) : this.sql.prepare('SELECT * FROM stream_accounts ORDER BY linked_at DESC').all();
    return (rows as Raw[]).map(account);
  }

  /** False when that channel is linked to another account already. */
  link(a: Omit<StreamAccount, 'subs'>): boolean {
    const other = this.bySubject(a.platform, a.subject);
    if (other && other.uuid !== a.uuid) return false;
    this.sql.prepare(`INSERT INTO stream_accounts (uuid, platform, subject, login, name, linked_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (uuid, platform) DO UPDATE SET subject = excluded.subject, login = excluded.login, name = excluded.name, linked_at = excluded.linked_at, subs = CASE WHEN stream_accounts.subject = excluded.subject THEN stream_accounts.subs ELSE '' END`)
      .run(a.uuid, a.platform, a.subject, a.login, a.name, a.linkedAt);
    return true;
  }

  setSubs(uuid: string, platform: Platform, subs: string[]) {
    this.sql.prepare('UPDATE stream_accounts SET subs = ? WHERE uuid = ? AND platform = ?').run(subs.join(','), uuid, platform);
  }

  /** The channel goes, and its live row with it (another account linking it later starts clean). */
  unlink(uuid: string, platform: Platform): StreamAccount | undefined {
    const a = this.account(uuid, platform);
    if (!a) return undefined;
    this.sql.prepare('DELETE FROM stream_accounts WHERE uuid = ? AND platform = ?').run(uuid, platform);
    this.sql.prepare('DELETE FROM stream_live WHERE platform = ? AND subject = ?').run(platform, a.subject);
    return a;
  }

  live(platform: Platform, subject: string): LiveRow | undefined {
    const r = this.sql.prepare('SELECT * FROM stream_live WHERE platform = ? AND subject = ?').get(platform, subject) as Raw | undefined;
    return r && live(r);
  }

  setLive(platform: Platform, info: LiveInfo, now: number, notified: boolean) {
    this.sql.prepare(`INSERT INTO stream_live (platform, subject, live, title, category, viewers, started_at, thumbnail, updated_at, notified_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (platform, subject) DO UPDATE SET live = 1, title = excluded.title, category = excluded.category, viewers = excluded.viewers, started_at = excluded.started_at,
      thumbnail = excluded.thumbnail, updated_at = excluded.updated_at, notified_at = CASE WHEN ? THEN excluded.notified_at ELSE stream_live.notified_at END`)
      .run(platform, info.subject, info.title, info.category, info.viewers, info.startedAt, info.thumbnail, now, notified ? now : 0, notified ? 1 : 0);
  }

  setOffline(platform: Platform, subject: string, now: number) {
    this.sql.prepare(`INSERT INTO stream_live (platform, subject, live, updated_at, offline_at) VALUES (?, ?, 0, ?, ?)
      ON CONFLICT (platform, subject) DO UPDATE SET live = 0, viewers = 0, updated_at = excluded.updated_at, offline_at = excluded.offline_at`).run(platform, subject, now, now);
  }

  liveCount(): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM stream_live l JOIN stream_accounts a ON a.platform = l.platform AND a.subject = l.subject WHERE l.live = 1').get() as { n: number }).n;
  }

  prefs(uuid: string): Prefs {
    const r = this.sql.prepare('SELECT hide, notify FROM stream_prefs WHERE uuid = ?').get(uuid) as { hide: number; notify: number } | undefined;
    return { hide: !!r?.hide, notify: r ? !!r.notify : true };
  }

  setPrefs(uuid: string, p: Prefs) {
    this.sql.prepare('INSERT INTO stream_prefs (uuid, hide, notify) VALUES (?, ?, ?) ON CONFLICT (uuid) DO UPDATE SET hide = excluded.hide, notify = excluded.notify').run(uuid, p.hide ? 1 : 0, p.notify ? 1 : 0);
  }

  provider(id: Platform): ProviderRow {
    const r = this.sql.prepare('SELECT * FROM stream_providers WHERE id = ?').get(id) as Raw | undefined;
    return { id, enabled: !!r?.enabled, clientId: r?.client_id ?? '', secret: r?.secret ?? '', hint: r?.hint ?? '', hookSecret: r?.hook_secret ?? '', updatedAt: r?.updated_at ?? 0, updatedBy: r?.updated_by ?? '' };
  }

  saveProvider(p: ProviderRow) {
    this.sql.prepare(`INSERT INTO stream_providers (id, enabled, client_id, secret, hint, hook_secret, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled, client_id = excluded.client_id, secret = excluded.secret, hint = excluded.hint, hook_secret = excluded.hook_secret,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(p.id, p.enabled ? 1 : 0, p.clientId, p.secret, p.hint, p.hookSecret, p.updatedAt, p.updatedBy);
  }

  /** Notes a webhook message as handled; false when it was already (a replay or a retry). */
  firstTime(id: string, now: number): boolean {
    this.sql.prepare('DELETE FROM stream_events WHERE at < ?').run(now - 2 * 86_400_000);
    return this.sql.prepare('INSERT OR IGNORE INTO stream_events (id, at) VALUES (?, ?)').run(id, now).changes > 0;
  }
}
