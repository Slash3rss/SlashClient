import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Benchmark results shared by link. The launcher sends one run of the SlashClient benchmark with
 * the computer it ran on (processor, graphics card, RAM, system, Java: names and sizes only) and
 * gets /benchmark/<id>. Anyone with the link sees it without signing in; the page carries an
 * OpenGraph preview ("143 FPS · RTX 3070 · Ryzen 7 5800X") for Discord and the like. A row is a
 * few hundred bytes, kept in the database for `days`. Only known fields are kept, every text cut
 * short, so nothing else a client sends ends up on the page.
 */

export const BENCHMARK_DAYS = 365;
const BENCH_ID = /^[A-Za-z0-9]{10}$/;
/** The test scene's parts, as the mod names them. */
const SCENES = ['forest', 'panorama', 'village', 'water', 'entities', 'particles', 'night'];

export interface SharedBenchmark {
  kind: 'scene' | 'world';
  version: string;
  /** Epoch ms the run ended. */
  at: number;
  fps: { avg: number; low1: number; low01: number };
  frames: number;
  stutters: number;
  /** Average use during the run, 0..100, when the game could read it. */
  cpuUse?: number;
  gpuUse?: number;
  scenes?: { id: string; avg: number; low1: number }[];
  settings: { renderDistance: number; width: number; height: number; vsync: boolean; fullscreen: boolean; mods: number; memoryMb?: number };
  device: { os?: string; cpu?: string; threads?: number; ramGb?: number; gpu?: string; java?: string };
}

const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v)) * 10) / 10 : undefined;
// names only: printable characters, no backslashes (a Windows path), short
const name = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return s || undefined;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The run as kept, or undefined when it is not one. */
export function cleanBenchmark(raw: unknown): SharedBenchmark | undefined {
  const r = obj(raw);
  const fps = obj(r.fps), s = obj(r.settings), d = obj(r.device);
  const avg = num(fps.avg, 0, 100_000), low1 = num(fps.low1, 0, 100_000);
  const version = name(r.version)?.slice(0, 24);
  const renderDistance = num(s.renderDistance, 2, 64);
  if (avg === undefined || low1 === undefined || !version || renderDistance === undefined) return undefined;
  const scenes = Array.isArray(r.scenes)
    ? r.scenes.slice(0, SCENES.length).map(obj).filter((x) => typeof x.id === 'string' && SCENES.includes(x.id) && num(x.avg, 0, 100_000) !== undefined)
      .map((x) => ({ id: x.id as string, avg: num(x.avg, 0, 100_000)!, low1: num(x.low1, 0, 100_000) ?? 0 }))
    : [];
  const out: SharedBenchmark = {
    kind: r.kind === 'scene' ? 'scene' : 'world',
    version,
    at: num(r.at, 0, Date.now() + 86_400_000) ?? Date.now(),
    fps: { avg, low1, low01: num(fps.low01, 0, 100_000) ?? 0 },
    frames: Math.round(num(r.frames, 0, 1e8) ?? 0),
    stutters: Math.round(num(r.stutters, 0, 1e8) ?? 0),
    cpuUse: num(r.cpuUse, 0, 100),
    gpuUse: num(r.gpuUse, 0, 100),
    scenes: scenes.length ? scenes : undefined,
    settings: {
      renderDistance, width: Math.round(num(s.width, 0, 20_000) ?? 0), height: Math.round(num(s.height, 0, 20_000) ?? 0),
      vsync: s.vsync === true, fullscreen: s.fullscreen === true, mods: Math.round(num(s.mods, 0, 10_000) ?? 0),
      memoryMb: num(s.memoryMb, 0, 1_048_576),
    },
    device: {
      os: name(d.os)?.slice(0, 48), cpu: name(d.cpu), threads: num(d.threads, 1, 1024), ramGb: num(d.ramGb, 1, 65_536),
      gpu: name(d.gpu), java: name(d.java)?.slice(0, 48),
    },
  };
  return JSON.parse(JSON.stringify(out));
}

export interface BenchmarkShareContext {
  sql: DatabaseSync;
  webDir?: string;
  publicUrl: string;
  /** Days a link works (the admin panel's benchmarks.days), read when used. */
  days: () => number;
  clientIp: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  /** Throw (429) when this caller did it too often lately. */
  limitShares: (key: string) => void;
  limitViews: (key: string) => void;
  versioned: (html: string) => string;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** "NVIDIA GeForce RTX 3070" as "RTX 3070", "AMD Ryzen 7 5800X 8-Core Processor" as "Ryzen 7 5800X": the preview's short line. */
export function shortName(s: string | undefined): string {
  return (s ?? '')
    .replace(/^(NVIDIA|AMD|Intel|Apple)\s+/i, '').replace(/^GeForce\s+/i, '')
    .replace(/\s+\d+-Core Processor$/i, '').replace(/\s+(CPU\s+)?@.*$/, '').replace(/\s+Processor$/i, '').trim();
}

export function benchmarkShareRoutes(ctx: BenchmarkShareContext) {
  ctx.sql.exec(`
CREATE TABLE IF NOT EXISTS benchmark_shares (id TEXT PRIMARY KEY, data TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS benchmark_shares_expires ON benchmark_shares(expires_at);
`);
  const get = (id: string): { run: SharedBenchmark; createdAt: number; expiresAt: number } | undefined => {
    if (!BENCH_ID.test(id)) return undefined;
    const row = ctx.sql.prepare('SELECT data, created_at AS createdAt, expires_at AS expiresAt FROM benchmark_shares WHERE id = ? AND expires_at > ?').get(id, Date.now()) as
      { data: string; createdAt: number; expiresAt: number } | undefined;
    return row && { run: JSON.parse(row.data), createdAt: row.createdAt, expiresAt: row.expiresAt };
  };

  const routes: [string, RegExp, Handler][] = [
    // without an account: the result says nothing about who sent it
    ['POST', /^\/v1\/benchmarks$/, async (req) => {
      ctx.limitShares(`bench:${ctx.clientIp(req)}`);
      const run = cleanBenchmark(await ctx.body(req));
      if (!run) ctx.fail(400, 'bad_request');
      let id: string;
      do id = randomBytes(8).toString('base64url').replace(/[-_]/g, '').padEnd(10, 'x').slice(0, 10);
      while (ctx.sql.prepare('SELECT 1 FROM benchmark_shares WHERE id = ?').get(id));
      const now = Date.now();
      const expiresAt = now + ctx.days() * 86_400_000;
      ctx.sql.prepare('INSERT INTO benchmark_shares (id, data, created_at, expires_at) VALUES (?, ?, ?, ?)').run(id, JSON.stringify(run), now, expiresAt);
      return { id, url: `/benchmark/${id}`, expiresAt };
    }],
    ['GET', /^\/v1\/benchmarks\/(\w+)$/, (req, [id]) => {
      ctx.limitViews(`bench-view:${ctx.clientIp(req)}`);
      const shared = get(id);
      if (!shared) ctx.fail(404, 'not_found');
      return { id, ...shared };
    }],
  ];

  /** The OpenGraph tags and title of a result's page. */
  function previewTags(id: string, b: ReturnType<typeof get>): string {
    if (!b) return '<title>SlashClient – Nie znaleziono</title>\n  <meta name="robots" content="noindex">';
    const base = ctx.publicUrl.replace(/\/$/, '');
    const r = b.run;
    const title = `${Math.round(r.fps.avg)} FPS · ${r.kind === 'scene' ? 'scena testowa' : 'benchmark'} · Minecraft ${r.version}`;
    const desc = [
      `1% low ${Math.round(r.fps.low1)}`, shortName(r.device.gpu), shortName(r.device.cpu), r.device.ramGb ? `${r.device.ramGb} GB RAM` : '',
      `${r.settings.width}×${r.settings.height}`, `zasięg ${r.settings.renderDistance}`,
    ].filter(Boolean).join(' · ');
    return [
      `<title>${escapeHtml(title)} – SlashClient</title>`,
      `<meta name="description" content="${escapeHtml(desc)}">`,
      '<meta name="robots" content="noindex">',
      '<meta property="og:site_name" content="SlashClient Benchmark">',
      `<meta property="og:title" content="${escapeHtml(title)}">`,
      `<meta property="og:description" content="${escapeHtml(desc)}">`,
      `<meta property="og:url" content="${escapeHtml(`${base}/benchmark/${id}`)}">`,
      '<meta property="og:type" content="website">',
      `<meta property="og:image" content="${escapeHtml(`${base}/img/og.jpg`)}">`,
      '<meta name="twitter:card" content="summary">',
    ].join('\n  ');
  }

  /** GET /benchmark/<id>: the page with the preview. Answers true when the request was this. */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const page = /^\/benchmark\/(\w+)\/?$/.exec(url.pathname);
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !page || !ctx.webDir) return false;
    try {
      ctx.limitViews(`bench-view:${ctx.clientIp(req)}`);
    } catch {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'rate_limited' }));
      return true;
    }
    const html = await readFile(path.join(ctx.webDir, 'benchmark.html'), 'utf8').catch(() => undefined);
    if (html === undefined) return false;
    const b = get(page[1]);
    if (b && req.method === 'GET') ctx.sql.prepare('UPDATE benchmark_shares SET views = views + 1 WHERE id = ?').run(page[1]);
    res.writeHead(b ? 200 : 404, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : ctx.versioned(html.replace('<!--preview-->', () => previewTags(page[1], b))));
    return true;
  }

  /** Drops results past their time. */
  function cleanup() {
    ctx.sql.prepare('DELETE FROM benchmark_shares WHERE expires_at <= ?').run(Date.now());
  }

  return { routes, serve, cleanup };
}
