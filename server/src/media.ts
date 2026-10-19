import { randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Screenshots and clips shared by link, like logs: a signed-in player uploads a picture (PNG or
 * JPEG) or a clip (the game's Motion-JPEG AVI) from the launcher's gallery and gets /media/<id>.
 * Anyone with the link sees it without signing in; the page carries an OpenGraph preview (the
 * picture, or a clip's first frame) for Discord and the like. Files live in their own folder next
 * to the database, never in it, and go away after `days`; the owner (or an admin) may take one
 * down sooner.
 */

export interface MediaLimits {
  /** Largest picture accepted. */
  imageBytes: number;
  /** Largest clip accepted (an MJPEG clip is about 2 MB a second). */
  clipBytes: number;
  /** How long a link works. */
  days: number;
  /** Links one player may have at a time. */
  maxActive: number;
  /** All of one player's files together. */
  quotaBytes: number;
}
export const MEDIA_LIMITS: MediaLimits = { imageBytes: 10 * 1024 * 1024, clipBytes: 90 * 1024 * 1024, days: 30, maxActive: 50, quotaBytes: 500 * 1024 * 1024 };

export const MEDIA_ID = /^[A-Za-z0-9]{10}$/;
const MAX_SIDE = 16_384;
const MAX_FRAMES = 20_000;

export type MediaKind = 'image' | 'clip';
export interface MediaInfo { kind: MediaKind; type: string; ext: string; width: number; height: number; frames: number; durationMs: number; poster?: Buffer }

// ---------- what the bytes are ----------

/** Width and height of a JPEG from its frame header (SOFn); undefined when it is not one. */
export function jpegSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;
  let at = 2;
  while (at + 9 < buf.length) {
    if (buf[at] !== 0xff) return undefined;
    const marker = buf[at + 1];
    // fill bytes and markers without a length
    if (marker === 0xff) {
      at++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const len = buf.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
    }
    if (marker === 0xda || len < 2) return undefined;
    at += 2 + len;
  }
  return undefined;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIGNATURE) || buf.toString('latin1', 12, 16) !== 'IHDR') return undefined;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export interface AviClip { width: number; height: number; usPerFrame: number; handler: string; frames: { offset: number; length: number }[] }

/**
 * The frames of an AVI: RIFF 'AVI ' ( LIST hdrl ( avih, LIST strl ( strh, strf ) ), LIST movi
 * ( 00dc… ), idx1 ). Only what the game's clips use is read: the main header and the video
 * chunks of the first stream, in file order. Undefined when the data is not such a file.
 */
export function parseAvi(buf: Buffer): AviClip | undefined {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'AVI ') return undefined;
  const clip: AviClip = { width: 0, height: 0, usPerFrame: 0, handler: '', frames: [] };
  let ok = true;
  const walk = (start: number, end: number, inMovi: boolean) => {
    let at = start;
    while (ok && at + 8 <= end) {
      const id = buf.toString('latin1', at, at + 4);
      const size = buf.readUInt32LE(at + 4);
      const data = at + 8;
      // a clip cut short: the frames before the broken one stay
      const cut = data + size > end;
      if (id === 'LIST' && size >= 4) {
        const type = buf.toString('latin1', data, data + 4);
        if (type === 'hdrl' || type === 'strl' || type === 'movi' || type === 'rec ') walk(data + 4, Math.min(data + size, end), inMovi || type === 'movi');
      } else if (cut) return;
      else if (id === 'avih' && size >= 40) {
        clip.usPerFrame = buf.readUInt32LE(data);
        clip.width = buf.readUInt32LE(data + 32);
        clip.height = buf.readUInt32LE(data + 36);
      } else if (id === 'strh' && size >= 8 && !clip.handler && buf.toString('latin1', data, data + 4) === 'vids') {
        clip.handler = buf.toString('latin1', data + 4, data + 8);
      } else if (inMovi && (id === '00dc' || id === '00db') && size > 0) {
        if (clip.frames.length >= MAX_FRAMES) {
          ok = false;
          return;
        }
        clip.frames.push({ offset: data, length: size });
      }
      at = data + size + (size & 1);
    }
  };
  walk(12, Math.min(buf.length, 8 + buf.readUInt32LE(4)), false);
  return ok && clip.frames.length ? clip : undefined;
}

/** What an upload is, or undefined when it is none of the kinds taken. */
export function inspectMedia(buf: Buffer): MediaInfo | undefined {
  const png = pngSize(buf);
  if (png) return { kind: 'image', type: 'image/png', ext: 'png', ...png, frames: 1, durationMs: 0 };
  const jpg = jpegSize(buf);
  if (jpg) return { kind: 'image', type: 'image/jpeg', ext: 'jpg', ...jpg, frames: 1, durationMs: 0 };
  const avi = parseAvi(buf);
  if (avi && avi.handler.toUpperCase() === 'MJPG') {
    const first = buf.subarray(avi.frames[0].offset, avi.frames[0].offset + avi.frames[0].length);
    const size = jpegSize(first);
    if (!size) return undefined;
    const us = avi.usPerFrame > 0 && avi.usPerFrame < 10_000_000 ? avi.usPerFrame : 33_333;
    return { kind: 'clip', type: 'video/x-msvideo', ext: 'avi', ...size, frames: avi.frames.length, durationMs: Math.round((avi.frames.length * us) / 1000), poster: Buffer.from(first) };
  }
  return undefined;
}

// ---------- storage ----------

export interface SharedMedia {
  id: string;
  owner: string;
  kind: MediaKind;
  type: string;
  size: number;
  width: number;
  height: number;
  frames: number;
  durationMs: number;
  title: string;
  views: number;
  createdAt: number;
  expiresAt: number;
}

class MediaStore {
  private readonly sql: DatabaseSync;
  constructor(sql: DatabaseSync) {
    this.sql = sql;
    // its own table, added next to the others: an older database just gains it
    sql.exec(`
CREATE TABLE IF NOT EXISTS shared_media (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, kind TEXT NOT NULL, type TEXT NOT NULL,
  size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, frames INTEGER NOT NULL DEFAULT 1, duration_ms INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '', views INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS shared_media_owner ON shared_media(owner);
CREATE INDEX IF NOT EXISTS shared_media_expires ON shared_media(expires_at);`);
  }

  private static readonly COLUMNS = 'id, owner, kind, type, size, width, height, frames, duration_ms AS durationMs, title, views, created_at AS createdAt, expires_at AS expiresAt';

  add(m: Omit<SharedMedia, 'views'>) {
    this.sql.prepare('INSERT INTO shared_media (id, owner, kind, type, size, width, height, frames, duration_ms, title, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(m.id, m.owner, m.kind, m.type, m.size, m.width, m.height, m.frames, m.durationMs, m.title, m.createdAt, m.expiresAt);
  }
  /** One link, while it works. */
  get(id: string, now = Date.now()): SharedMedia | undefined {
    return this.sql.prepare(`SELECT ${MediaStore.COLUMNS} FROM shared_media WHERE id = ? AND expires_at > ?`).get(id, now) as SharedMedia | undefined;
  }
  exists(id: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM shared_media WHERE id = ?').get(id);
  }
  ofOwner(owner: string, now = Date.now()): SharedMedia[] {
    return this.sql.prepare(`SELECT ${MediaStore.COLUMNS} FROM shared_media WHERE owner = ? AND expires_at > ? ORDER BY created_at DESC`).all(owner, now) as unknown as SharedMedia[];
  }
  handleOf(owner: string): string | null {
    return (this.sql.prepare('SELECT handle FROM users WHERE uuid = ?').get(owner) as { handle: string } | undefined)?.handle ?? null;
  }
  countView(id: string) {
    this.sql.prepare('UPDATE shared_media SET views = views + 1 WHERE id = ?').run(id);
  }
  remove(id: string) {
    this.sql.prepare('DELETE FROM shared_media WHERE id = ?').run(id);
  }
  expired(now: number): string[] {
    return (this.sql.prepare('SELECT id FROM shared_media WHERE expires_at <= ?').all(now) as { id: string }[]).map((r) => r.id);
  }
  allIds(): Set<string> {
    return new Set((this.sql.prepare('SELECT id FROM shared_media').all() as { id: string }[]).map((r) => r.id));
  }
}

// ---------- routes ----------

export interface MediaContext {
  sql: DatabaseSync;
  dir: string;
  /** The site's files (web/), for the page with the preview; without it there is no page. */
  webDir?: string;
  /** The server's public address, for the absolute links a preview needs. */
  publicUrl: string;
  limits?: Partial<MediaLimits>;
  authed: (req: http.IncomingMessage) => string;
  isAdmin: (userId: string) => boolean;
  clientIp: (req: http.IncomingMessage) => string;
  /** Throw (429) when this caller did it too often lately. */
  limitUploads: (key: string) => void;
  limitViews: (key: string) => void;
  /** Admin actions go into the audit log. */
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  /** The page's HTML with the site's own links versioned (web.ts). */
  versioned: (html: string) => string;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cleanTitle = (v: string | null) => (v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);

/** "1:05" from milliseconds. */
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function mediaRoutes(ctx: MediaContext) {
  const store = new MediaStore(ctx.sql);
  const limits = { ...MEDIA_LIMITS, ...ctx.limits };
  mkdirSync(ctx.dir, { recursive: true });
  const fileOf = (id: string) => path.join(ctx.dir, id);
  const posterOf = (id: string) => path.join(ctx.dir, `${id}.poster.jpg`);
  /** What the page and the launcher see: the owner's id stays here, their handle is shown. */
  const view = ({ owner, ...m }: SharedMedia) => ({ ...m, ownerHandle: store.handleOf(owner), url: `/media/${m.id}` });
  const optionalUser = (req: http.IncomingMessage) => {
    if (!req.headers.authorization) return '';
    try {
      return ctx.authed(req);
    } catch {
      return '';
    }
  };

  /** The upload, up to the largest kind; the rest of a too big one is read and dropped so the launcher gets the answer. */
  async function readUpload(req: http.IncomingMessage, max: number): Promise<Buffer> {
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

  async function removeFiles(id: string) {
    await rm(fileOf(id), { force: true });
    await rm(posterOf(id), { force: true });
  }

  const routes: [string, RegExp, Handler][] = [
    ['POST', /^\/v1\/media$/, async (req, _p, url) => {
      const me = ctx.authed(req);
      ctx.limitUploads(`media:${me}`);
      const mine = store.ofOwner(me);
      if (mine.length >= limits.maxActive) {
        req.resume();
        ctx.fail(409, 'media_limit');
      }
      const data = await readUpload(req, Math.max(limits.imageBytes, limits.clipBytes));
      const info = inspectMedia(data);
      if (!info) ctx.fail(400, 'bad_media');
      if (data.length > (info.kind === 'image' ? limits.imageBytes : limits.clipBytes)) ctx.fail(413, 'too_large');
      if (!info.width || !info.height || info.width > MAX_SIDE || info.height > MAX_SIDE) ctx.fail(400, 'bad_media');
      if (mine.reduce((sum, m) => sum + m.size, 0) + data.length > limits.quotaBytes) ctx.fail(409, 'media_quota');
      let id: string;
      do id = randomBytes(8).toString('base64url').replace(/[-_]/g, '').padEnd(10, 'x').slice(0, 10);
      while (store.exists(id));
      // written aside and moved in, so a half-written file is never served
      await writeFile(`${fileOf(id)}.part`, data);
      await rename(`${fileOf(id)}.part`, fileOf(id));
      if (info.poster) await writeFile(posterOf(id), info.poster);
      const now = Date.now();
      store.add({
        id, owner: me, kind: info.kind, type: info.type, size: data.length, width: info.width, height: info.height, frames: info.frames,
        durationMs: info.durationMs, title: cleanTitle(url.searchParams.get('title')), createdAt: now, expiresAt: now + limits.days * 86_400_000,
      });
      return { media: view(store.get(id)!) };
    }],
    // the player's own links, with what is left of the quota
    ['GET', /^\/v1\/media$/, (req) => {
      const me = ctx.authed(req);
      const mine = store.ofOwner(me);
      return { media: mine.map(view), limits: { ...limits, used: mine.reduce((sum, m) => sum + m.size, 0) } };
    }],
    // what a link holds (no sign-in needed); `mine` tells the page to offer deleting
    ['GET', /^\/v1\/media\/(\w+)$/, (req, [id]) => {
      ctx.limitViews(`media:${ctx.clientIp(req)}`);
      const m = MEDIA_ID.test(id) ? store.get(id) : undefined;
      if (!m) ctx.fail(404, 'not_found');
      const me = optionalUser(req);
      return { media: view(m), mine: !!me && (m.owner === me || ctx.isAdmin(me)) };
    }],
    ['DELETE', /^\/v1\/media\/(\w+)$/, async (req, [id]) => {
      const me = ctx.authed(req);
      const m = MEDIA_ID.test(id) ? store.get(id) : undefined;
      const admin = ctx.isAdmin(me);
      if (!m || (m.owner !== me && !admin)) ctx.fail(404, 'not_found');
      store.remove(m.id);
      await removeFiles(m.id);
      if (m.owner !== me) ctx.audit(me, 'media_remove', m.id, m.title);
      return { ok: true };
    }],
  ];

  /** The OpenGraph tags and title of a link's page. */
  function previewTags(m: SharedMedia | undefined): string {
    if (!m) return '<title>SlashClient – Nie znaleziono</title>\n  <meta name="robots" content="noindex">';
    const base = ctx.publicUrl.replace(/\/$/, '');
    const who = store.handleOf(m.owner);
    const kindName = m.kind === 'clip' ? 'Klip' : 'Zrzut ekranu';
    const title = m.title || `${kindName}${who ? ` od ${who}` : ''}`;
    const desc = m.kind === 'clip' ? `Klip z Minecrafta (${clock(m.durationMs)}) udostępniony przez SlashClient.` : 'Zrzut ekranu z Minecrafta udostępniony przez SlashClient.';
    const image = `${base}/v1/media/${m.id}/${m.kind === 'clip' ? 'poster' : 'file'}`;
    return [
      `<title>${escapeHtml(title)} – SlashClient</title>`,
      `<meta name="description" content="${escapeHtml(desc)}">`,
      '<meta name="robots" content="noindex">',
      '<meta property="og:site_name" content="SlashClient">',
      `<meta property="og:title" content="${escapeHtml(title)}">`,
      `<meta property="og:description" content="${escapeHtml(desc)}">`,
      `<meta property="og:url" content="${escapeHtml(`${base}/media/${m.id}`)}">`,
      `<meta property="og:type" content="${m.kind === 'clip' ? 'video.other' : 'website'}">`,
      `<meta property="og:image" content="${escapeHtml(image)}">`,
      `<meta property="og:image:width" content="${m.width}">`,
      `<meta property="og:image:height" content="${m.height}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    ].join('\n  ');
  }

  /**
   * What is not JSON: the file itself (/v1/media/<id>/file), a clip's first frame (/poster) and
   * the page with the preview (/media/<id>). Answers true when the request was one of these.
   */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const file = /^\/v1\/media\/(\w+)\/(file|poster)$/.exec(url.pathname);
    const page = /^\/media\/(\w+)\/?$/.exec(url.pathname);
    if (!file && !(page && ctx.webDir)) return false;
    const answer = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
      return true;
    };
    try {
      ctx.limitViews(`media:${ctx.clientIp(req)}`);
    } catch {
      return answer(429, 'rate_limited');
    }
    const id = (file ?? page)![1];
    const m = MEDIA_ID.test(id) ? store.get(id) : undefined;

    if (page) {
      const html = await readFile(path.join(ctx.webDir!, 'media.html'), 'utf8').catch(() => undefined);
      if (html === undefined) return false;
      if (m && req.method === 'GET') store.countView(m.id);
      res.writeHead(m ? 200 : 404, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        'Referrer-Policy': 'no-referrer',
      });
      res.end(req.method === 'HEAD' ? undefined : ctx.versioned(html.replace('<!--preview-->', previewTags(m))));
      return true;
    }

    const poster = file![2] === 'poster';
    // a picture is its own poster
    const source = m && (poster && m.kind === 'clip' ? posterOf(m.id) : fileOf(m.id));
    const size = source && (await stat(source).then((s) => s.size, () => undefined));
    if (!m || !source || size === undefined) return answer(404, 'not_found');
    const ext = m.kind === 'clip' ? 'avi' : m.type === 'image/png' ? 'png' : 'jpg';
    res.writeHead(200, {
      'Content-Type': poster && m.kind === 'clip' ? 'image/jpeg' : m.type,
      'Content-Length': size,
      // the content of a link never changes; a deleted one may linger in caches for this long
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="slashclient-${m.id}.${poster && m.kind === 'clip' ? 'jpg' : ext}"`,
      'X-Content-Type-Options': 'nosniff',
      // a player's upload is never a page that runs anything
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Access-Control-Allow-Origin': '*',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(source).on('error', () => res.destroy()).pipe(res);
    return true;
  }

  /** Drops links past their time, with their files, and files left by deleted accounts (their rows went with them). */
  async function cleanup(now = Date.now()) {
    for (const id of store.expired(now)) {
      store.remove(id);
      await removeFiles(id);
    }
    const known = store.allIds();
    for (const name of await readdir(ctx.dir).catch(() => [] as string[])) {
      const id = name.slice(0, 10);
      if (known.has(id)) continue;
      // an upload being written right now has no row yet
      const at = await stat(path.join(ctx.dir, name)).then((s) => s.mtimeMs, () => now);
      if (now - at > 3_600_000) await rm(path.join(ctx.dir, name), { force: true });
    }
  }

  return { routes, serve, cleanup, limits };
}
