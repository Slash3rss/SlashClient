import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';

/**
 * The last requests to the API, for the admin panel: what launchers, games and pages asked for,
 * how it went and how long it took. Without bodies, tokens or query strings, and with the last
 * part of the address hidden. Kept in memory and, with a database, written to it every few
 * seconds and read back at start, so a restart does not empty the list (a week at most).
 */

export interface RequestEntry {
  at: number;
  method: string;
  path: string;
  /** The path with ids replaced, to group requests of one kind. */
  route: string;
  status: number;
  ms: number;
  user: string;
  ip: string;
  client: string;
  version: string;
  error: string;
}

/** How many the panel keeps when no setting says (the admin panel's `storage.requestsKept`). */
export const KEEP = 50_000;
/** How long requests stay in the database, and at least how many it may hold (more when the panel keeps more). */
const KEEP_DAYS = 7;
const KEEP_ROWS = 50_000;
const FLUSH_MS = 2000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS request_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, route TEXT NOT NULL,
  status INTEGER NOT NULL, ms INTEGER NOT NULL, user TEXT NOT NULL, ip TEXT NOT NULL, client TEXT NOT NULL, version TEXT NOT NULL, error TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS request_log_at ON request_log (at);
`;

/** "launcher", "mod", "strona" or "inne", with a version when the client says it. */
export function clientOf(req: http.IncomingMessage): { client: string; version: string } {
  // the phone app (web/app) says 'app/<version>'
  const named = /^(launcher|mod|app)\/([\w.+-]{1,32})$/.exec(String(req.headers['x-slashclient'] ?? ''));
  if (named) return { client: named[1], version: named[2] };
  const ua = String(req.headers['user-agent'] ?? '');
  const launcher = /SlashClient\/([\w.+-]+)/.exec(ua);
  if (launcher) return { client: 'launcher', version: launcher[1] };
  if (/^Java-http-client/.test(ua)) return { client: 'mod', version: '' };
  if (/Mozilla\//.test(ua)) return { client: 'strona', version: '' };
  return { client: 'inne', version: '' };
}

/** "/v1/messages/9f3…/read" → "/v1/messages/:id/read". */
export function routeOf(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/[0-9a-f]{32}(?=\/|$)/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
    .replace(/^(\/(?:v1\/logs|logi|v1\/media)\/)[A-Za-z0-9]{10}/, '$1:id');
}

/** 203.0.113.57 → 203.0.113.x, and IPv6 cut to its network part. */
export function maskIp(ip: string): string {
  const v4 = /(\d+\.\d+\.\d+)\.\d+$/.exec(ip);
  if (v4) return `${v4[1]}.x`;
  const parts = ip.split(':').filter(Boolean);
  return parts.length > 3 ? `${parts.slice(0, 3).join(':')}::x` : ip;
}

export class RequestLog {
  private entries: RequestEntry[] = [];
  private readonly sql?: DatabaseSync;
  /** Not written yet: they go in one transaction every FLUSH_MS. */
  private pending: RequestEntry[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private prunedAt = 0;
  /** How many are kept (read on every request, so a change in the panel applies at once). */
  private readonly keep: () => number;

  constructor(sql?: DatabaseSync, keep: () => number = () => KEEP) {
    this.sql = sql;
    this.keep = keep;
    if (!sql) return;
    sql.exec(SCHEMA);
    this.prune(Date.now());
    const rows = sql.prepare('SELECT at, method, path, route, status, ms, user, ip, client, version, error FROM request_log ORDER BY id DESC LIMIT ?').all(this.keep()) as unknown as RequestEntry[];
    this.entries = rows.reverse().map((r) => ({ ...r }));
  }

  add(e: RequestEntry) {
    this.entries.push(e);
    const keep = this.keep();
    if (this.entries.length > keep) this.entries.splice(0, this.entries.length - keep);
    if (!this.sql) return;
    this.pending.push(e);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), FLUSH_MS);
      this.timer.unref?.();
    }
  }

  /** Writes what is waiting (also called by the tests); a failed write only loses those entries. */
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const batch = this.pending;
    this.pending = [];
    if (!this.sql || !batch.length) return;
    try {
      const insert = this.sql.prepare('INSERT INTO request_log (at, method, path, route, status, ms, user, ip, client, version, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      this.sql.exec('BEGIN');
      for (const e of batch) insert.run(e.at, e.method, e.path, e.route, e.status, e.ms, e.user, e.ip, e.client, e.version, e.error);
      this.sql.exec('COMMIT');
    } catch {
      try { this.sql.exec('ROLLBACK'); } catch { /* not in a transaction */ }
    }
    const now = Date.now();
    if (now - this.prunedAt > 3_600_000) this.prune(now);
  }

  /** Older than a week, or beyond the newest KEEP_ROWS (or as many as the panel keeps), goes. */
  private prune(now: number) {
    this.prunedAt = now;
    try {
      this.sql!.prepare('DELETE FROM request_log WHERE at < ?').run(now - KEEP_DAYS * 86_400_000);
      this.sql!.prepare('DELETE FROM request_log WHERE id <= (SELECT id FROM request_log ORDER BY id DESC LIMIT 1 OFFSET ?)').run(Math.max(KEEP_ROWS, this.keep()));
    } catch { /* the next hour tries again */ }
  }

  /** Newest first, filtered; with a summary of the last hour. */
  query(f: { q?: string; errors?: boolean; client?: string; user?: string; limit?: number }) {
    const q = (f.q ?? '').toLowerCase();
    const out: RequestEntry[] = [];
    const limit = Math.min(500, f.limit ?? 200);
    for (let i = this.entries.length - 1; i >= 0 && out.length < limit; i--) {
      const e = this.entries[i];
      if (f.errors && e.status < 400) continue;
      if (f.client && e.client !== f.client) continue;
      if (f.user && e.user !== f.user) continue;
      if (q && !e.path.toLowerCase().includes(q) && !e.error.includes(q)) continue;
      out.push(e);
    }
    const hour = Date.now() - 3_600_000;
    const recent = this.entries.filter((e) => e.at >= hour);
    const routes = new Map<string, { route: string; count: number; errors: number; totalMs: number; maxMs: number }>();
    const clients: Record<string, number> = {};
    for (const e of recent) {
      const key = `${e.method} ${e.route}`;
      const r = routes.get(key) ?? { route: key, count: 0, errors: 0, totalMs: 0, maxMs: 0 };
      r.count++;
      if (e.status >= 400) r.errors++;
      r.totalMs += e.ms;
      r.maxMs = Math.max(r.maxMs, e.ms);
      routes.set(key, r);
      clients[e.client] = (clients[e.client] ?? 0) + 1;
    }
    const minute = Date.now() - 60_000;
    return {
      entries: out,
      kept: this.entries.length,
      since: this.entries[0]?.at ?? Date.now(),
      summary: {
        lastHour: recent.length,
        lastMinute: recent.filter((e) => e.at >= minute).length,
        errors: recent.filter((e) => e.status >= 400).length,
        serverErrors: recent.filter((e) => e.status >= 500).length,
        clients,
        routes: [...routes.values()].sort((a, b) => b.count - a.count).slice(0, 12)
          .map((r) => ({ route: r.route, count: r.count, errors: r.errors, avgMs: Math.round(r.totalMs / r.count), maxMs: r.maxMs })),
      },
    };
  }
}
