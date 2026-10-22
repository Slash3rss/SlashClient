import { randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { rename, rm, stat, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { withDefaults } from './settings.ts';
import { cleanOverrides, effective, type ChatMediaLimits, type LimitsView, type OverrideStore } from './chatMediaLimits.ts';

/**
 * Pictures in the chat with friends and in group (and clan) chats (a screenshot sent from the game).
 * The launcher encrypts the picture with a fresh key before it leaves the computer and uploads only
 * that blob; the key travels inside the message, encrypted for the friend's (or the members')
 * launchers like any text. So this server keeps bytes it cannot read, gives them only to the sender
 * and the friend (or the group's members), and drops them after a while. A group's picture has the
 * recipient "g:<group id>". Files live in their own folder next to the database.
 *
 * The Multimedia panel (server 0.9.36+): a conversation's pictures newest first (`/media`), and
 * taking a picture down without its message: the sender their own, in a group its moderators too
 * (the same rules as deleting messages). The file goes at once; the row stays as a mark, so the
 * message says the picture was removed (`imageRemoved`; older launchers show its caption). Pictures
 * past their time leave the same mark (`expired`). Group and clan chats have limits of their own
 * (chatMediaLimits.ts): a store per chat, a keeping time, a size and pictures per member a day.
 */

export interface ImageLimits {
  /** Largest blob accepted (an encrypted JPEG; the launcher scales screenshots down first). */
  maxBytes: number;
  /** Pictures one player may send per day, and their bytes together. */
  perDay: number;
  bytesPerDay: number;
  /** How long a picture is kept. */
  days: number;
  /** An upload never attached to a message goes after this long. */
  orphanMs: number;
}
export const IMAGE_LIMITS: ImageLimits = { maxBytes: 4 * 1024 * 1024, perDay: 60, bytesPerDay: 100 * 1024 * 1024, days: 30, orphanMs: 3_600_000 };

/** What a message carries: the picture and its key, encrypted for the devices (chatCrypto in the launcher). */
export interface ChatImage { id: string; key: string; size: number }
/** In place of `image` once the picture is gone but its message is not: when, and whether it ran out or who took it down. */
export interface RemovedImage { at: number; expired?: true; by?: string }

/** The key's envelope; it is small (a key and an iv per device), but leave room for many launchers. */
const MAX_KEY = 8000;
const ID = /^[\w-]{22}$/;
/** iv (12) + tag (16) + at least something. */
const MIN_BYTES = 32;
/** Pictures taken down in one request (the panel's selection). */
const MAX_BULK = 100;

export interface ImageContext {
  sql: DatabaseSync;
  dir: string;
  limits?: Partial<ImageLimits>;
  authed: (req: http.IncomingMessage) => string;
  areFriends: (a: string, b: string) => boolean;
  /** Whether someone is in a group chat now (groups.ts): they may send it pictures and see its pictures. */
  isGroupMember?: (group: string, uuid: string) => boolean;
  /** Throw (429) when this caller did it too often lately. */
  limitUploads: (key: string) => void;
  limitDownloads: (key: string) => void;
  /** The burst limit of the conversation ("d:<friend>" or "g:<group>"): a picture counts as a message there. */
  limitBurst?: (user: string, conversation: string) => void;
  fail: (status: number, code: string) => never;
  body?: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  /** A group chat's limits from the panel (a clan's chat has its own); undefined: no group media limits (tests of old). */
  groupLimits?: (group: string) => ChatMediaLimits | undefined;
  /** The chats' own lower limits (chatMediaLimits.ts). */
  overrides?: OverrideStore;
  /** Whether `me` may take down `author`'s things in the group (its moderators), and set its own limits (its owner). */
  mayModerate?: (group: string, me: string, author: string) => boolean;
  manages?: (group: string, me: string) => boolean;
  /** The id of the last message before `me` came to the group: what came before is not theirs. */
  sinceOf?: (group: string, me: string) => number;
  /** A message's picture went: the message as it is now goes to whoever sees it (direct: the two; group: its readers). */
  changedDirect?: (a: string, b: string, messageId: number) => void;
  changedGroup?: (group: string, messageId: number, by: string) => void;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
interface Row {
  id: string; owner: string; recipient: string; size: number; created_at: number; message_id: number | null; key: string;
  removed_at: number | null; removed_by: string | null;
}

/** An item of the Multimedia panel: the message (its id, who sent it and when) and its picture. */
export interface MediaItem { id: number; from: string; to?: string; group?: string; at: number; image: ChatImage }

export function chatImageRoutes(ctx: ImageContext) {
  const { sql } = ctx;
  // live: the admin panel's settings are read when used
  const limits = withDefaults(IMAGE_LIMITS, ctx.limits);
  mkdirSync(ctx.dir, { recursive: true });
  sql.exec(`CREATE TABLE IF NOT EXISTS chat_images (id TEXT PRIMARY KEY, owner TEXT NOT NULL, recipient TEXT NOT NULL, size INTEGER NOT NULL,
    created_at INTEGER NOT NULL, message_id INTEGER, key TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS chat_images_message ON chat_images (message_id);`);
  // taken down or run out, the message kept (0.9.36+)
  const columns = (sql.prepare('PRAGMA table_info(chat_images)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('removed_at')) sql.exec('ALTER TABLE chat_images ADD COLUMN removed_at INTEGER');
  if (!columns.includes('removed_by')) sql.exec('ALTER TABLE chat_images ADD COLUMN removed_by TEXT');
  sql.exec('CREATE INDEX IF NOT EXISTS chat_images_recipient ON chat_images (recipient, created_at)');
  const fileOf = (id: string) => path.join(ctx.dir, `${id}.bin`);
  const row = (id: string) => sql.prepare('SELECT * FROM chat_images WHERE id = ?').get(id) as Row | undefined;
  const body = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => (ctx.body ? ctx.body(req) : {});

  /** A group chat's limits now: the panel's, lowered by the chat's own. */
  function chatLimits(group: string): ChatMediaLimits | undefined {
    const global = ctx.groupLimits?.(group);
    if (!global) return undefined;
    return effective(global, ctx.overrides?.get(`g:${group}`) ?? {});
  }

  /** Pictures kept in a chat now, and their bytes (taken down and run out ones do not count). */
  function usage(recipient: string): { bytes: number; count: number } {
    const r = sql.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM chat_images WHERE recipient = ? AND removed_at IS NULL').get(recipient) as { n: number; bytes: number };
    return { bytes: Number(r.bytes), count: Number(r.n) };
  }

  async function readBlob(req: http.IncomingMessage, max: number): Promise<Buffer> {
    if (Number(req.headers['content-length']) > max) {
      req.resume();
      ctx.fail(413, 'too_large');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size <= max) chunks.push(chunk);
    }
    if (size > max) ctx.fail(413, 'too_large');
    return Buffer.concat(chunks);
  }

  /** Stores one encrypted picture for a friend or a group ("g:<id>"); the message that carries its key comes next. */
  async function upload(req: http.IncomingMessage, me: string, recipient: string) {
    const group = recipient.startsWith('g:') ? recipient.slice(2) : undefined;
    const chat = group ? chatLimits(group) : undefined;
    const since = Date.now() - 86_400_000;
    try {
      ctx.limitUploads(`image:${me}`);
      ctx.limitBurst?.(me, group ? recipient : `d:${recipient}`);
      const today = sql.prepare('SELECT COUNT(*) AS n FROM chat_images WHERE owner = ? AND created_at > ?').get(me, since) as { n: number };
      if (today.n >= limits.perDay) ctx.fail(429, 'image_quota');
      if (chat) {
        // the chat's own: pictures per member a day, and its store
        const mine = sql.prepare('SELECT COUNT(*) AS n FROM chat_images WHERE owner = ? AND recipient = ? AND created_at > ?').get(me, recipient, since) as { n: number };
        if (mine.n >= chat.perMemberDay) ctx.fail(429, 'chat_media_daily');
        if (usage(recipient).count >= chat.quotaCount) ctx.fail(409, 'chat_media_full');
      }
    } catch (err) {
      req.resume();
      throw err;
    }
    const data = await readBlob(req, chat ? Math.min(limits.maxBytes, chat.maxBytes) : limits.maxBytes);
    if (data.length < MIN_BYTES) ctx.fail(400, 'bad_request');
    const bytesToday = (sql.prepare('SELECT COALESCE(SUM(size), 0) AS bytes FROM chat_images WHERE owner = ? AND created_at > ?').get(me, since) as { bytes: number }).bytes;
    if (Number(bytesToday) + data.length > limits.bytesPerDay) ctx.fail(429, 'image_quota');
    if (chat && usage(recipient).bytes + data.length > chat.quotaBytes) ctx.fail(409, 'chat_media_full');
    const id = randomBytes(16).toString('base64url');
    // written aside and moved in, so a half-written file is never served
    await writeFile(`${fileOf(id)}.part`, data);
    await rename(`${fileOf(id)}.part`, fileOf(id));
    sql.prepare('INSERT INTO chat_images (id, owner, recipient, size, created_at) VALUES (?, ?, ?, ?, ?)').run(id, me, recipient, data.length, Date.now());
    return { id, size: data.length };
  }

  /** Takes pictures down: the file goes, the row stays as a mark (`expired`: they ran out). */
  async function takeDown(rows: Row[], by: string | undefined, now = Date.now()) {
    for (const r of rows) {
      sql.prepare('UPDATE chat_images SET removed_at = ?, removed_by = ? WHERE id = ? AND removed_at IS NULL').run(now, by ?? null, r.id);
      await rm(fileOf(r.id), { force: true });
    }
  }

  // ---------- the Multimedia panel ----------

  const page = (url: URL) => ({
    before: Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER,
    limit: Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40)),
  });

  /** A conversation's pictures still there, newest first, by their message's id. */
  function directMedia(me: string, other: string, before: number, limit: number): MediaItem[] {
    const rows = sql.prepare(`SELECT ci.id, ci.key, ci.size, ci.message_id AS mid, m.from_uuid AS "from", m.to_uuid AS "to", m.created_at AS at FROM chat_images ci
      JOIN messages m ON m.id = ci.message_id
      WHERE ci.recipient NOT LIKE 'g:%' AND ci.removed_at IS NULL AND m.deleted_at IS NULL AND ci.message_id < ?
        AND ((m.from_uuid = ? AND m.to_uuid = ?) OR (m.from_uuid = ? AND m.to_uuid = ?))
      ORDER BY ci.message_id DESC LIMIT ?`).all(before, me, other, other, me, limit) as { id: string; key: string; size: number; mid: number; from: string; to: string; at: number }[];
    return rows.map((r) => ({ id: r.mid, from: r.from, to: r.to, at: r.at, image: { id: r.id, key: r.key, size: r.size } }));
  }

  /** A group's pictures `me` may see (what came since they joined), newest first. */
  function groupMedia(group: string, me: string, before: number, limit: number): MediaItem[] {
    const since = ctx.sinceOf?.(group, me) ?? 0;
    const rows = sql.prepare(`SELECT ci.id, ci.key, ci.size, ci.message_id AS mid, x.from_uuid AS "from", x.created_at AS at FROM chat_images ci
      JOIN chat_group_messages x ON x.id = ci.message_id AND x.group_id = ?
      WHERE ci.recipient = ? AND ci.removed_at IS NULL AND x.deleted_at IS NULL AND ci.message_id < ? AND ci.message_id > ?
      ORDER BY ci.message_id DESC LIMIT ?`).all(group, `g:${group}`, before, since, limit) as { id: string; key: string; size: number; mid: number; from: string; at: number }[];
    return rows.map((r) => ({ id: r.mid, group, from: r.from, at: r.at, image: { id: r.id, key: r.key, size: r.size } }));
  }

  /** The rows of these messages' pictures in that conversation that are still there. */
  function rowsOf(messages: number[], recipientCheck: (r: Row) => boolean, group?: string): Row[] {
    if (!messages.length) return [];
    const where = group ? 'recipient = ?' : "recipient NOT LIKE 'g:%'";
    const rows = sql.prepare(`SELECT * FROM chat_images WHERE ${where} AND removed_at IS NULL AND message_id IN (${messages.map(() => '?').join(',')})`)
      .all(...(group ? [`g:${group}`] : []), ...messages) as unknown as Row[];
    return rows.filter(recipientCheck);
  }

  /** Message ids from a request: one (the route's) or the panel's selection. */
  function messageIds(raw: unknown): number[] {
    if (!Array.isArray(raw) || !raw.length || raw.length > MAX_BULK || raw.some((n) => !Number.isSafeInteger(n) || n <= 0)) ctx.fail(400, 'bad_request');
    return [...new Set(raw as number[])];
  }

  /** Takes down the pictures of these direct messages that `me` sent; tells both of each. */
  async function removeDirect(me: string, other: string, messages: number[]) {
    const rows = rowsOf(messages, (r) => (r.owner === me && r.recipient === other) || (r.owner === other && r.recipient === me));
    const mine = rows.filter((r) => r.owner === me);
    await takeDown(mine, me);
    for (const r of mine) ctx.changedDirect?.(me, other, r.message_id!);
    return { removed: mine.map((r) => r.message_id!), refused: rows.filter((r) => r.owner !== me).map((r) => r.message_id!) };
  }

  /** The same in a group: one's own, and others' for its moderators. */
  async function removeGroup(group: string, me: string, messages: number[]) {
    const since = ctx.sinceOf?.(group, me) ?? 0;
    const rows = rowsOf(messages, (r) => (r.message_id ?? 0) > since, group);
    const allowed = rows.filter((r) => r.owner === me || !!ctx.mayModerate?.(group, me, r.owner));
    await takeDown(allowed, me);
    for (const r of allowed) ctx.changedGroup?.(group, r.message_id!, me);
    const ok = new Set(allowed.map((r) => r.id));
    return { removed: allowed.map((r) => r.message_id!), refused: rows.filter((r) => !ok.has(r.id)).map((r) => r.message_id!) };
  }

  /** What a group's member sees of its limits: the limits; its use and own ones for those who moderate it. */
  function limitsView(group: string, me: string): LimitsView | undefined {
    const global = ctx.groupLimits?.(group);
    if (!global) return undefined;
    const own = ctx.overrides?.get(`g:${group}`) ?? {};
    const moderates = !!ctx.mayModerate?.(group, me, '');
    return {
      limits: effective(global, own),
      ...(moderates ? { usage: usage(`g:${group}`) } : {}),
      ...(ctx.manages?.(group, me) ? { global, own } : {}),
    };
  }

  const memberOrThrow = (group: string, me: string) => {
    if (!ctx.isGroupMember?.(group, me)) ctx.fail(404, 'not_found');
  };
  const friendOrThrow = (me: string, other: string) => {
    if (!ctx.areFriends(me, other)) ctx.fail(403, 'not_friends');
  };

  const routes: [string, RegExp, Handler][] = [
    // the encrypted picture for one friend (raw bytes)
    ['POST', /^\/v1\/images\/([\w-]+)$/, async (req, [other]) => {
      const me = ctx.authed(req);
      if (!ctx.areFriends(me, other)) {
        req.resume();
        ctx.fail(403, 'not_friends');
      }
      return upload(req, me, other);
    }],
    // the same for a group chat, by one of its members
    ['POST', /^\/v1\/groups\/([\w-]{1,32})\/images$/, async (req, [group]) => {
      const me = ctx.authed(req);
      if (!ctx.isGroupMember?.(group, me)) {
        req.resume();
        ctx.fail(404, 'not_found');
      }
      return upload(req, me, `g:${group}`);
    }],
    // the Multimedia panel of a conversation with a friend: pictures newest first, `before` a message id
    ['GET', /^\/v1\/messages\/([\w-]+)\/media$/, (req, [other], url) => {
      const me = ctx.authed(req);
      friendOrThrow(me, other);
      const { before, limit } = page(url);
      const media = directMedia(me, other, before, limit);
      return { media, more: media.length === limit };
    }],
    // one picture taken down (the sender's own), its message kept
    ['DELETE', /^\/v1\/messages\/([\w-]+)\/(\d{1,15})\/image$/, async (req, [other, raw]) => {
      const me = ctx.authed(req);
      friendOrThrow(me, other);
      const res = await removeDirect(me, other, [Number(raw)]);
      if (!res.removed.length) ctx.fail(res.refused.length ? 403 : 404, res.refused.length ? 'not_author' : 'not_found');
      return res;
    }],
    // several at once (the panel's selection): `messages` their ids; what may not be taken down is in `refused`
    ['POST', /^\/v1\/messages\/([\w-]+)\/media\/delete$/, async (req, [other]) => {
      const me = ctx.authed(req);
      friendOrThrow(me, other);
      return removeDirect(me, other, messageIds((await body(req)).messages));
    }],
    // a group's (or clan's) panel: its pictures, its limits, and its use for its moderators
    ['GET', /^\/v1\/groups\/([\w-]{1,32})\/media$/, (req, [group], url) => {
      const me = ctx.authed(req);
      memberOrThrow(group, me);
      const { before, limit } = page(url);
      const media = groupMedia(group, me, before, limit);
      const view = limitsView(group, me);
      return { media, more: media.length === limit, ...(ctx.mayModerate?.(group, me, '') ? { moderator: true } : {}), ...(view ?? {}) };
    }],
    ['DELETE', /^\/v1\/groups\/([\w-]{1,32})\/messages\/(\d{1,15})\/image$/, async (req, [group, raw]) => {
      const me = ctx.authed(req);
      memberOrThrow(group, me);
      const res = await removeGroup(group, me, [Number(raw)]);
      if (!res.removed.length) ctx.fail(res.refused.length ? 403 : 404, res.refused.length ? 'not_allowed' : 'not_found');
      return res;
    }],
    ['POST', /^\/v1\/groups\/([\w-]{1,32})\/media\/delete$/, async (req, [group]) => {
      const me = ctx.authed(req);
      memberOrThrow(group, me);
      return removeGroup(group, me, messageIds((await body(req)).messages));
    }],
    // the chat's own lower limits, by its owner (a clan's: its owner); nothing set: the panel's
    ['POST', /^\/v1\/groups\/([\w-]{1,32})\/media\/limits$/, async (req, [group]) => {
      const me = ctx.authed(req);
      memberOrThrow(group, me);
      const global = ctx.groupLimits?.(group);
      if (!global || !ctx.overrides || !ctx.manages?.(group, me)) ctx.fail(403, 'not_allowed');
      const own = cleanOverrides(await body(req), global!);
      if (own === 'bad_limits') ctx.fail(400, 'bad_limits');
      ctx.overrides!.set(`g:${group}`, own as Exclude<typeof own, 'bad_limits'>, me);
      return limitsView(group, me);
    }],
  ];

  /**
   * The picture a new message carries, checked: uploaded by the sender for this friend and not
   * used by another message yet. Undefined when the message has none; throws when it is wrong.
   */
  function forMessage(from: string, to: string, image: unknown): ChatImage | undefined {
    if (image === undefined) return undefined;
    const i = image as { id?: unknown; key?: unknown };
    if (!i || typeof i !== 'object' || typeof i.id !== 'string' || !ID.test(i.id) || typeof i.key !== 'string'
      || i.key.length > MAX_KEY || !/^e2e1:[A-Za-z0-9+/=]+$/.test(i.key)) ctx.fail(400, 'bad_image');
    const r = row(i.id as string);
    if (!r || r.owner !== from || r.recipient !== to || r.message_id !== null || r.removed_at !== null) ctx.fail(404, 'bad_image');
    return { id: r.id, key: i.key as string, size: r.size };
  }

  /** The message now exists: the picture belongs to it. */
  function attach(image: ChatImage, messageId: number) {
    sql.prepare('UPDATE chat_images SET message_id = ?, key = ? WHERE id = ?').run(messageId, image.key, image.id);
  }

  /**
   * Messages as the conversation lists them, each with its picture while it is kept, or the mark
   * that it is gone (`imageRemoved`; older launchers ignore it and show the caption). Direct and
   * group messages count their ids apart: `group` says which.
   */
  function decorate<M extends { id: number }>(messages: M[], group?: string): (M & { image?: ChatImage; imageRemoved?: RemovedImage })[] {
    if (!messages.length) return messages;
    const ids = messages.map((m) => m.id);
    const whose = group ? 'recipient = ?' : "recipient NOT LIKE 'g:%'";
    const rows = sql.prepare(`SELECT id, size, message_id, key, removed_at, removed_by FROM chat_images WHERE ${whose} AND message_id IN (${ids.map(() => '?').join(',')})`)
      .all(...(group ? [`g:${group}`] : []), ...ids) as unknown as Row[];
    const byMessage = new Map(rows.map((r) => [r.message_id, r]));
    return messages.map((m) => {
      const r = byMessage.get(m.id);
      if (!r || (m as { deleted?: boolean }).deleted) return m;
      if (r.removed_at !== null) return { ...m, imageRemoved: { at: r.removed_at, ...(r.removed_by ? { by: r.removed_by } : { expired: true as const }) } };
      return { ...m, image: { id: r.id, key: r.key, size: r.size } };
    });
  }

  /** Rows of a message's picture: direct and group message ids count apart (`group` says which). */
  const ofMessage = (messageId: number, group?: string) => group
    ? sql.prepare('SELECT id FROM chat_images WHERE message_id = ? AND recipient = ?').all(messageId, `g:${group}`) as { id: string }[]
    : sql.prepare("SELECT id FROM chat_images WHERE message_id = ? AND recipient NOT LIKE 'g:%'").all(messageId) as { id: string }[];

  /** Whether a message carries a picture (those are not edited). */
  function has(messageId: number, group?: string): boolean {
    return ofMessage(messageId, group).length > 0;
  }

  /** A deleted message's picture goes with it, file and all. */
  async function remove(messageId: number, group?: string) {
    for (const { id } of ofMessage(messageId, group)) {
      sql.prepare('DELETE FROM chat_images WHERE id = ?').run(id);
      await rm(fileOf(id), { force: true });
    }
  }

  /** A group chat went (a group emptied, a clan deleted): its pictures' files and rows, and its own limits. */
  async function removeChat(group: string) {
    const rows = sql.prepare('SELECT id FROM chat_images WHERE recipient = ?').all(`g:${group}`) as { id: string }[];
    for (const { id } of rows) await rm(fileOf(id), { force: true });
    sql.prepare('DELETE FROM chat_images WHERE recipient = ?').run(`g:${group}`);
    ctx.overrides?.remove(`g:${group}`);
  }

  /** GET /v1/images/<id>: the encrypted bytes, only to the sender and the friend (or the group's members). True when the request was this. */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const m = /^\/v1\/images\/([\w-]+)$/.exec(url.pathname);
    if (req.method !== 'GET' || !m) return false;
    const answer = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
      return true;
    };
    let me: string;
    try {
      me = ctx.authed(req);
      ctx.limitDownloads(`image:${me}`);
    } catch (err) {
      const e = err as { status?: number; code?: string };
      return answer(e.status ?? 401, e.code ?? 'unauthorized');
    }
    const r = ID.test(m[1]) ? row(m[1]) : undefined;
    const allowed = r && r.removed_at === null && (r.owner === me || r.recipient === me || (r.recipient.startsWith('g:') && !!ctx.isGroupMember?.(r.recipient.slice(2), me)));
    const size = r && allowed ? await stat(fileOf(r.id)).then((s) => s.size, () => undefined) : undefined;
    if (!r || size === undefined) return answer(404, 'not_found');
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': size,
      // the bytes never change; the launcher keeps what it decrypted itself
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(fileOf(r.id)).on('error', () => res.destroy()).pipe(res);
    return true;
  }

  /**
   * Pictures past their time (direct ones after `days`; a group's after its own keeping time) are
   * taken down, their messages keep the mark; uploads no message took go entirely. Those who see
   * a group's message hear of it as of a change.
   */
  async function cleanup(now = Date.now()) {
    const orphans = sql.prepare('SELECT id FROM chat_images WHERE message_id IS NULL AND created_at < ?').all(now - limits.orphanMs) as { id: string }[];
    for (const { id } of orphans) {
      await rm(fileOf(id), { force: true });
      sql.prepare('DELETE FROM chat_images WHERE id = ?').run(id);
    }
    const direct = sql.prepare("SELECT * FROM chat_images WHERE removed_at IS NULL AND message_id IS NOT NULL AND recipient NOT LIKE 'g:%' AND created_at < ?")
      .all(now - limits.days * 86_400_000) as unknown as Row[];
    await takeDown(direct, undefined, now);
    // groups: each by its own keeping time (only groups with a picture older than a day are looked at)
    const groups = sql.prepare("SELECT recipient FROM chat_images WHERE removed_at IS NULL AND message_id IS NOT NULL AND recipient LIKE 'g:%' GROUP BY recipient HAVING MIN(created_at) < ?")
      .all(now - 86_400_000) as { recipient: string }[];
    for (const { recipient } of groups) {
      const days = chatLimits(recipient.slice(2))?.days ?? limits.days;
      const expired = sql.prepare('SELECT * FROM chat_images WHERE removed_at IS NULL AND message_id IS NOT NULL AND recipient = ? AND created_at < ?')
        .all(recipient, now - days * 86_400_000) as unknown as Row[];
      await takeDown(expired, undefined, now);
      for (const r of expired) ctx.changedGroup?.(recipient.slice(2), r.message_id!, '');
    }
  }

  return { routes, serve, forMessage, attach, decorate, cleanup, has, remove, removeChat, usage, chatLimits };
}
