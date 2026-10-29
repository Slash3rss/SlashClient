import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import type { Db } from './db.ts';

/**
 * Shared logs and the bug tracker. A log is sent by the launcher (already cleaned of tokens and
 * paths), kept packed next to the database for LOG_DAYS and shown at /logi/<id>. Bug reports
 * are written by signed-in players, may point at a log, and are answered and closed by admins.
 */

export const MAX_LOG = 4 * 1024 * 1024;
/** A log sent without an account is smaller: anyone can send one. */
export const MAX_ANONYMOUS_LOG = 1024 * 1024;
/** Bytes of logs taken a day, all together and from one account or address (the disk is shared with everything else). */
export const LOGS_PER_DAY = 2 * 1024 * 1024 * 1024;
export const LOGS_PER_DAY_EACH = 64 * 1024 * 1024;
export const LOG_DAYS = 90;
export const STATUSES = ['open', 'confirmed', 'fixed', 'closed', 'duplicate'] as const;
const LOG_ID = /^[A-Za-z0-9]{10}$/;
const pack = promisify(gzip);
const unpack = promisify(gunzip);

export interface TrackerContext {
  db: Db;
  dir: string;
  authed: (req: http.IncomingMessage) => string;
  isAdmin: (userId: string) => boolean;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  /** Throws (429) when this caller sent too much lately. */
  limit: (key: string) => void;
  clientIp: (req: http.IncomingMessage) => string;
  fail: (status: number, code: string) => never;
  /** The admin panel's settings, read when used: days a log is kept, the largest log. */
  logDays?: () => number;
  maxLog?: () => number;
  /** The largest log from someone without an account, and the bytes a day (all, and per account or address). */
  maxAnonymousLog?: () => number;
  dailyBytes?: () => number;
  dailyBytesEach?: () => number;
  /** Free bytes on the logs' disk and the floor kept free there (storage.minFreeMb): below it no log is taken. */
  diskFree?: (dir: string) => Promise<number>;
  minFreeBytes?: () => number;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

async function text(req: http.IncomingMessage, fail: TrackerContext['fail'], max = MAX_LOG): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  // the rest of a too big log is read and dropped, so the launcher gets the answer
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= max) chunks.push(chunk);
  }
  if (size > max) fail(413, 'too_large');
  return Buffer.concat(chunks).toString('utf8');
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function trackerRoutes(ctx: TrackerContext): { routes: [string, RegExp, Handler][]; cleanup: () => Promise<void> } {
  const { db } = ctx;
  const logDays = () => ctx.logDays?.() ?? LOG_DAYS;
  mkdirSync(ctx.dir, { recursive: true });
  const fileOf = (id: string) => path.join(ctx.dir, `${id}.log.gz`);
  const optionalUser = (req: http.IncomingMessage) => (req.headers.authorization ? ctx.authed(req) : '');
  const bugOr404 = (id: string) => db.bug(Number(id)) ?? ctx.fail(404, 'not_found');
  /** Bytes of logs taken today: all, and per sender (an account, or an address without one); a new day starts afresh. */
  let day = { at: 0, total: 0, each: new Map<string, number>() };
  const today = () => {
    const d = Math.floor(Date.now() / 86_400_000);
    if (day.at !== d) day = { at: d, total: 0, each: new Map() };
    return day;
  };
  /** Answers from the team (admins and support) stand out on the page. */
  const comments = (bugId: number) => db.bugComments(bugId).map(({ authorRole, ...c }) => ({ ...c, staff: ctx.isAdmin(c.author) || authorRole === 'support' }));

  const routes: [string, RegExp, Handler][] = [
    // ---- logs ----
    ['POST', /^\/v1\/logs$/, async (req) => {
      const ip = ctx.clientIp(req);
      ctx.limit(`log:${ip}`);
      const owner = optionalUser(req);
      const max = ctx.maxLog?.() ?? MAX_LOG;
      const log = await text(req, ctx.fail, owner ? max : Math.min(max, ctx.maxAnonymousLog?.() ?? MAX_ANONYMOUS_LOG));
      if (!log.trim()) ctx.fail(400, 'empty');
      // nobody fills the server's disk with logs: a day's share for all and for each sender, and the free space kept
      const size = Buffer.byteLength(log);
      const d = today();
      const sender = owner || `ip:${ip}`;
      if (d.total + size > (ctx.dailyBytes?.() ?? LOGS_PER_DAY) || (d.each.get(sender) ?? 0) + size > (ctx.dailyBytesEach?.() ?? LOGS_PER_DAY_EACH)) ctx.fail(429, 'daily_limit');
      if (ctx.diskFree && (await ctx.diskFree(ctx.dir).catch(() => Infinity)) - size < (ctx.minFreeBytes?.() ?? 0)) ctx.fail(507, 'storage_full');
      d.total += size;
      d.each.set(sender, (d.each.get(sender) ?? 0) + size);
      let id: string;
      do id = randomBytes(8).toString('base64url').replace(/[-_]/g, '').padEnd(10, 'x').slice(0, 10);
      while (db.sharedLog(id));
      await writeFile(fileOf(id), await pack(log));
      db.addLog(id, owner, size, log.split('\n').length);
      return { id, url: `/logi/${id}`, expiresAt: Date.now() + logDays() * 86_400_000 };
    }],
    ['GET', /^\/v1\/logs\/(\w+)$/, async (_req, [id]) => {
      const log = LOG_ID.test(id) ? db.sharedLog(id) : undefined;
      if (!log) ctx.fail(404, 'not_found');
      const data = await readFile(fileOf(id)).catch(() => ctx.fail(404, 'not_found'));
      return { id, size: log.size, lines: log.lines, createdAt: log.createdAt, expiresAt: log.createdAt + logDays() * 86_400_000, text: (await unpack(data)).toString('utf8') };
    }],

    // the admin panel: every log players sent, and taking one down
    ['GET', /^\/v1\/admin\/logs$/, (req, _p, url) => {
      const me = ctx.authed(req);
      if (!ctx.isAdmin(me)) ctx.fail(403, 'not_admin');
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      return { ...db.logs(str(url.searchParams.get('q'), 60), 50, offset), offset, limit: 50, days: logDays() };
    }],
    ['DELETE', /^\/v1\/admin\/logs\/(\w+)$/, async (req, [id]) => {
      const me = ctx.authed(req);
      if (!ctx.isAdmin(me)) ctx.fail(403, 'not_admin');
      if (!LOG_ID.test(id) || !db.sharedLog(id)) ctx.fail(404, 'not_found');
      await rm(fileOf(id), { force: true });
      db.removeLog(id);
      db.log(me, 'log_remove', id);
      return { ok: true };
    }],

    // ---- bugs ----
    ['GET', /^\/v1\/bugs$/, (_req, _p, url) => {
      const status = url.searchParams.get('status') ?? '';
      if (status && !(STATUSES as readonly string[]).includes(status)) ctx.fail(400, 'bad_status');
      const page = Math.max(0, Number(url.searchParams.get('page')) || 0);
      const { bugs, total } = db.bugs(status, str(url.searchParams.get('q'), 100), 30, page * 30);
      // the list shows the start of each report only
      return { bugs: bugs.map((b) => ({ ...b, body: b.body.slice(0, 240) })), total, page, pageSize: 30 };
    }],
    ['GET', /^\/v1\/bugs\/(\d+)$/, (req, [id]) => {
      const bug = bugOr404(id);
      const me = req.headers.authorization ? ctx.authed(req) : '';
      return { bug, comments: comments(bug.id), canModerate: !!me && ctx.isAdmin(me) };
    }],
    ['POST', /^\/v1\/bugs$/, async (req) => {
      const me = ctx.authed(req);
      ctx.limit(`bug:${me}`);
      const b = await ctx.body(req);
      const title = str(b.title, 120), body = str(b.body, 8000), logId = str(b.logId, 10);
      if (title.length < 4) ctx.fail(400, 'title_too_short');
      if (body.length < 10) ctx.fail(400, 'body_too_short');
      if (logId && (!LOG_ID.test(logId) || !db.sharedLog(logId))) ctx.fail(400, 'bad_log');
      const id = db.addBug({ author: me, title, body, logId, version: str(b.version, 40), os: str(b.os, 60) });
      return { bug: db.bug(id) };
    }],
    ['POST', /^\/v1\/bugs\/(\d+)\/comments$/, async (req, [id]) => {
      const me = ctx.authed(req);
      ctx.limit(`bug:${me}`);
      const bug = bugOr404(id);
      const body = str((await ctx.body(req)).body, 4000);
      if (!body) ctx.fail(400, 'empty');
      db.addBugComment(bug.id, me, body);
      return { comments: comments(bug.id) };
    }],
    ['PATCH', /^\/v1\/bugs\/(\d+)$/, async (req, [id]) => {
      const me = ctx.authed(req);
      if (!ctx.isAdmin(me)) ctx.fail(403, 'not_admin');
      const bug = bugOr404(id);
      const status = str((await ctx.body(req)).status, 20);
      if (!(STATUSES as readonly string[]).includes(status)) ctx.fail(400, 'bad_status');
      db.setBugStatus(bug.id, status);
      db.log(me, 'bug_status', `#${bug.id}`, status);
      return { bug: db.bug(bug.id) };
    }],
    ['DELETE', /^\/v1\/bugs\/(\d+)$/, (req, [id]) => {
      const me = ctx.authed(req);
      const bug = bugOr404(id);
      // the author may take a report back while nobody has answered it
      if (!ctx.isAdmin(me) && !(bug.author === me && bug.comments === 0)) ctx.fail(403, 'forbidden');
      db.removeBug(bug.id);
      if (ctx.isAdmin(me)) db.log(me, 'bug_remove', `#${bug.id}`, bug.title);
      return { ok: true };
    }],
    ['DELETE', /^\/v1\/bugs\/(\d+)\/comments\/(\d+)$/, (req, [id, commentId]) => {
      const me = ctx.authed(req);
      const bug = bugOr404(id);
      const comment = db.bugComments(bug.id).find((c) => c.id === Number(commentId)) ?? ctx.fail(404, 'not_found');
      if (!ctx.isAdmin(me) && comment.author !== me) ctx.fail(403, 'forbidden');
      db.removeBugComment(comment.id);
      return { comments: comments(bug.id) };
    }],
  ];

  /** Drops logs past their time, with their files. */
  async function cleanup() {
    for (const id of db.oldLogs(Date.now() - logDays() * 86_400_000)) {
      await rm(fileOf(id), { force: true });
      db.removeLog(id);
    }
  }

  return { routes, cleanup };
}
