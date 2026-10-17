import type http from 'node:http';

/**
 * The last requests to the API, for the admin panel: what launchers, games and pages asked for,
 * how it went and how long it took. Kept in memory only (a restart starts it again), without
 * bodies, tokens or query strings, and with the last part of the address hidden.
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

const KEEP = 5000;

/** "launcher", "mod", "strona" or "inne", with a version when the client says it. */
export function clientOf(req: http.IncomingMessage): { client: string; version: string } {
  const named = /^(launcher|mod)\/([\w.+-]{1,32})$/.exec(String(req.headers['x-slashclient'] ?? ''));
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
    .replace(/^(\/(?:v1\/logs|logi)\/)[A-Za-z0-9]{10}/, '$1:id');
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

  add(e: RequestEntry) {
    this.entries.push(e);
    if (this.entries.length > KEEP) this.entries.splice(0, this.entries.length - KEEP);
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
