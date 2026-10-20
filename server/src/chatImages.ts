import { randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { rename, rm, stat, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Pictures in the chat with friends and in group (and clan) chats (a screenshot sent from the game).
 * The launcher encrypts the picture with a fresh key before it leaves the computer and uploads only
 * that blob; the key travels inside the message, encrypted for the friend's (or the members')
 * launchers like any text. So this server keeps bytes it cannot read, gives them only to the sender
 * and the friend (or the group's members), and drops them after a while. A group's picture has the
 * recipient "g:<group id>". Files live in their own folder next to the database.
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

/** The key's envelope; it is small (a key and an iv per device), but leave room for many launchers. */
const MAX_KEY = 8000;
const ID = /^[\w-]{22}$/;
/** iv (12) + tag (16) + at least something. */
const MIN_BYTES = 32;

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
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
interface Row { id: string; owner: string; recipient: string; size: number; created_at: number; message_id: number | null; key: string }

export function chatImageRoutes(ctx: ImageContext) {
  const { sql } = ctx;
  const limits = { ...IMAGE_LIMITS, ...ctx.limits };
  mkdirSync(ctx.dir, { recursive: true });
  sql.exec(`CREATE TABLE IF NOT EXISTS chat_images (id TEXT PRIMARY KEY, owner TEXT NOT NULL, recipient TEXT NOT NULL, size INTEGER NOT NULL,
    created_at INTEGER NOT NULL, message_id INTEGER, key TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS chat_images_message ON chat_images (message_id);`);
  const fileOf = (id: string) => path.join(ctx.dir, `${id}.bin`);
  const row = (id: string) => sql.prepare('SELECT * FROM chat_images WHERE id = ?').get(id) as Row | undefined;

  async function readBlob(req: http.IncomingMessage): Promise<Buffer> {
    if (Number(req.headers['content-length']) > limits.maxBytes) {
      req.resume();
      ctx.fail(413, 'too_large');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size <= limits.maxBytes) chunks.push(chunk);
    }
    if (size > limits.maxBytes) ctx.fail(413, 'too_large');
    return Buffer.concat(chunks);
  }

  /** Stores one encrypted picture for a friend or a group ("g:<id>"); the message that carries its key comes next. */
  async function upload(req: http.IncomingMessage, me: string, recipient: string) {
    try {
      ctx.limitUploads(`image:${me}`);
      ctx.limitBurst?.(me, recipient.startsWith('g:') ? recipient : `d:${recipient}`);
    } catch (err) {
      req.resume();
      throw err;
    }
    const since = Date.now() - 86_400_000;
    const today = sql.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM chat_images WHERE owner = ? AND created_at > ?').get(me, since) as { n: number; bytes: number };
    if (today.n >= limits.perDay) {
      req.resume();
      ctx.fail(429, 'image_quota');
    }
    const data = await readBlob(req);
    if (data.length < MIN_BYTES) ctx.fail(400, 'bad_request');
    if (today.bytes + data.length > limits.bytesPerDay) ctx.fail(429, 'image_quota');
    const id = randomBytes(16).toString('base64url');
    // written aside and moved in, so a half-written file is never served
    await writeFile(`${fileOf(id)}.part`, data);
    await rename(`${fileOf(id)}.part`, fileOf(id));
    sql.prepare('INSERT INTO chat_images (id, owner, recipient, size, created_at) VALUES (?, ?, ?, ?, ?)').run(id, me, recipient, data.length, Date.now());
    return { id, size: data.length };
  }

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
    if (!r || r.owner !== from || r.recipient !== to || r.message_id !== null) ctx.fail(404, 'bad_image');
    return { id: r.id, key: i.key as string, size: r.size };
  }

  /** The message now exists: the picture belongs to it. */
  function attach(image: ChatImage, messageId: number) {
    sql.prepare('UPDATE chat_images SET message_id = ?, key = ? WHERE id = ?').run(messageId, image.key, image.id);
  }

  /**
   * Messages as the conversation lists them, each with its picture while it is kept (after that only
   * the caption is left). Direct and group messages count their ids apart: `group` says which.
   */
  function decorate<M extends { id: number }>(messages: M[], group?: string): (M & { image?: ChatImage })[] {
    if (!messages.length) return messages;
    const ids = messages.map((m) => m.id);
    const whose = group ? 'recipient = ?' : "recipient NOT LIKE 'g:%'";
    const rows = sql.prepare(`SELECT id, size, message_id, key FROM chat_images WHERE ${whose} AND message_id IN (${ids.map(() => '?').join(',')})`)
      .all(...(group ? [`g:${group}`] : []), ...ids) as unknown as Row[];
    const byMessage = new Map(rows.map((r) => [r.message_id, r]));
    return messages.map((m) => {
      const r = byMessage.get(m.id);
      return r ? { ...m, image: { id: r.id, key: r.key, size: r.size } } : m;
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
    const allowed = r && (r.owner === me || r.recipient === me || (r.recipient.startsWith('g:') && !!ctx.isGroupMember?.(r.recipient.slice(2), me)));
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

  /** Drops pictures past their time, and uploads no message took. */
  async function cleanup(now = Date.now()) {
    const old = sql.prepare('SELECT id FROM chat_images WHERE created_at < ? OR (message_id IS NULL AND created_at < ?)')
      .all(now - limits.days * 86_400_000, now - limits.orphanMs) as { id: string }[];
    for (const { id } of old) {
      await rm(fileOf(id), { force: true });
      sql.prepare('DELETE FROM chat_images WHERE id = ?').run(id);
    }
  }

  return { routes, serve, forMessage, attach, decorate, cleanup, has, remove };
}
