import type { DatabaseSync } from 'node:sqlite';
import { withDefaults } from './settings.ts';

/**
 * Keeping the chats readable (server 0.9.23+): how long a message may be edited, a burst limit per
 * conversation on top of the per-minute one, and the messages that count for achievements.
 *
 * Messages are end-to-end encrypted, so nothing here looks at what is written (not even repeated
 * texts: the same text is a different envelope every time). Only how often, and where.
 */

/** The author may change a text message this long after sending it (the clients get it with the history). */
export const EDIT_WINDOW_MS = 15 * 60_000;

/**
 * Why a message may not be edited by `me` now, as [status, code]; undefined when it may. `special`:
 * it carries a picture, an invite or a waypoint (only text is edited).
 */
export function editRefusal(m: { from: string; at: number; deleted?: boolean; event?: unknown }, me: string, special: boolean, now = Date.now(), windowMs = EDIT_WINDOW_MS): [number, string] | undefined {
  if (m.from !== me) return [403, 'not_author'];
  if (m.deleted || m.event || special) return [400, 'not_editable'];
  if (now - m.at > windowMs) return [403, 'edit_expired'];
  return undefined;
}

export interface BurstLimits {
  /** At most this many messages (and pictures) in one conversation within `seconds`… */
  messages: number;
  seconds: number;
  /** …and whoever runs into it `strikes` times within a minute is held for `muteSeconds` in every conversation. */
  strikes: number;
  muteSeconds: number;
}
export const BURST_LIMITS: BurstLimits = { messages: 6, seconds: 10, strikes: 3, muteSeconds: 30 };

/** A burst was too fast: how many seconds to wait (the 429 says it as `retryAfter` and Retry-After). */
export class SlowDown extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super('slow_down');
    this.retryAfter = retryAfter;
  }
}

/**
 * Message times per sender and conversation, in memory (a restart forgets them, which is fine for
 * seconds-long windows). `hit` throws SlowDown when the sender is too fast or held.
 */
export class BurstLimiter {
  private readonly limits: BurstLimits;
  private readonly sent = new Map<string, number[]>();
  private readonly strikes = new Map<string, number[]>();
  private readonly held = new Map<string, number>();

  /** `limits` may be live (read on every message: the admin panel's settings). */
  constructor(limits: Partial<BurstLimits> = {}) {
    this.limits = withDefaults(BURST_LIMITS, limits);
  }

  /** One more message from `user` in `conversation` ("d:<friend>" or "g:<group>"). */
  hit(user: string, conversation: string, now = Date.now()) {
    const { messages, seconds, strikes, muteSeconds } = this.limits;
    const until = this.held.get(user) ?? 0;
    if (until > now) throw new SlowDown(Math.ceil((until - now) / 1000));
    const key = `${user}\n${conversation}`;
    const recent = (this.sent.get(key) ?? []).filter((at) => now - at < seconds * 1000);
    if (recent.length >= messages) {
      this.sent.set(key, recent);
      // running into it again and again: a short break everywhere
      const mine = [...(this.strikes.get(user) ?? []).filter((at) => now - at < 60_000), now];
      this.strikes.set(user, mine);
      if (mine.length >= strikes) {
        this.strikes.delete(user);
        this.held.set(user, now + muteSeconds * 1000);
        throw new SlowDown(muteSeconds);
      }
      throw new SlowDown(Math.max(1, Math.ceil((recent[0] + seconds * 1000 - now) / 1000)));
    }
    recent.push(now);
    this.sent.set(key, recent);
    if (this.sent.size > 10_000) this.prune(now);
  }

  private prune(now: number) {
    const span = this.limits.seconds * 1000;
    for (const [k, v] of this.sent) if (!v.some((at) => now - at < span)) this.sent.delete(k);
    for (const [k, v] of this.held) if (v <= now) this.held.delete(k);
    for (const [k, v] of this.strikes) if (!v.some((at) => now - at < 60_000)) this.strikes.delete(k);
  }
}

/** Messages counted for achievements on one UTC day, at most; the rest of the day's messages count for nothing. */
export const COUNTED_PER_DAY = 30;

const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

/**
 * The messages that count for achievements ('messages' and the admin creator's metric of that
 * name): counted when they are sent, to a friend or to a group with at least two others in it,
 * COUNTED_PER_DAY a day at most. Deleting a message takes nothing back; sending it again counts
 * only while the day has room. Started from the messages already there (the same cap per day),
 * once, when the table is made.
 */
export class MessageCounter {
  private readonly sql: DatabaseSync;
  /** The day's cap now (the admin panel's setting; COUNTED_PER_DAY by default). The start from old messages always uses COUNTED_PER_DAY. */
  capOf: () => number = () => COUNTED_PER_DAY;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    const existed = !!sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'message_counts'").get();
    sql.exec('CREATE TABLE IF NOT EXISTS message_counts (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (uuid, day))');
    if (!existed) this.backfill();
  }

  /** From what was written before the counter: text messages and pictures (no invites, waypoints or group lines), per day, capped. */
  private backfill() {
    const has = (table: string) => !!this.sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    const parts: string[] = [];
    if (has('messages')) {
      const columns = (this.sql.prepare('PRAGMA table_info(messages)').all() as { name: string }[]).map((c) => c.name);
      const plain = ['invite', 'waypoint', 'deleted_at'].filter((c) => columns.includes(c)).map((c) => `${c} IS NULL`);
      parts.push(`SELECT from_uuid AS uuid, created_at AS at FROM messages${plain.length ? ` WHERE ${plain.join(' AND ')}` : ''}`);
    }
    if (has('chat_group_messages')) parts.push('SELECT from_uuid AS uuid, created_at AS at FROM chat_group_messages WHERE event IS NULL');
    if (!parts.length) return;
    this.sql.exec('BEGIN');
    try {
      this.sql.prepare(`INSERT INTO message_counts (uuid, day, n)
        SELECT uuid, date(at / 1000, 'unixepoch') AS day, MIN(${COUNTED_PER_DAY}, COUNT(*)) FROM (${parts.join(' UNION ALL ')})
        WHERE uuid IN (SELECT uuid FROM users) GROUP BY uuid, day`).run();
      this.sql.exec('COMMIT');
    } catch (err) {
      this.sql.exec('ROLLBACK');
      throw err;
    }
  }

  /** One message sent; false when the day was full already. */
  count(uuid: string, at = Date.now()): boolean {
    const r = this.sql.prepare(`INSERT INTO message_counts (uuid, day, n) SELECT ?, ?, 1 WHERE ? > 0
      ON CONFLICT (uuid, day) DO UPDATE SET n = n + 1 WHERE n < ?`).run(uuid, utcDay(at), this.capOf(), this.capOf());
    return Number(r.changes) > 0;
  }

  total(uuid: string): number {
    return Number((this.sql.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM message_counts WHERE uuid = ?').get(uuid) as { n: number }).n);
  }

  /** Counted on one day (tests, the admin's look). */
  day(uuid: string, at = Date.now()): number {
    return Number((this.sql.prepare('SELECT n FROM message_counts WHERE uuid = ? AND day = ?').get(uuid, utcDay(at)) as { n: number } | undefined)?.n ?? 0);
  }
}
