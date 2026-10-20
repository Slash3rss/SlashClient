import { randomInt } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { rename, rm, stat, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { Db, ProfileShare } from './db.ts';
import { withDefaults } from './settings.ts';

/**
 * Profiles shared by code. A signed-in player uploads a profile exported by the launcher (a
 * .mrpack: mods from Modrinth/CurseForge are links in its index, so only the other files take
 * room) and gets a short code; anyone with the code downloads the file, without signing in,
 * until it expires. Files live in their own folder next to the database, never in it.
 */

export interface ShareLimits {
  /** Largest pack accepted. */
  maxBytes: number;
  /** How long a code works. */
  days: number;
  /** Codes one player may have at a time. */
  maxActive: number;
  /** All of one player's packs together. */
  quotaBytes: number;
}
export const SHARE_LIMITS: ShareLimits = { maxBytes: 50 * 1024 * 1024, days: 30, maxActive: 20, quotaBytes: 250 * 1024 * 1024 };

/** No 0/O, 1/I/L: a code is read aloud and typed by hand. 31^8 ≈ 8.5 · 10^11 codes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/** A code as the player typed it ("abcd-efgh", with spaces…), or undefined when it cannot be one. */
export function normalizeCode(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 40) return undefined;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : undefined;
}

export function newCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/**
 * The names of a zip's entries, read from its central directory; undefined when the data is
 * not a whole zip. Only the structure is checked here: the launcher validates the pack again
 * (paths, sizes) when it installs it.
 */
export function zipEntryNames(buf: Buffer, maxEntries = 50_000): string[] | undefined {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return undefined;
  // the end of central directory record: 22 bytes plus a comment of up to 64 KiB
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return undefined;
  const count = buf.readUInt16LE(eocd + 10);
  const size = buf.readUInt32LE(eocd + 12);
  const offset = buf.readUInt32LE(eocd + 16);
  if (count > maxEntries || offset + size > eocd) return undefined;
  const names: string[] = [];
  let at = offset;
  for (let i = 0; i < count; i++) {
    if (at + 46 > eocd || buf.readUInt32LE(at) !== 0x02014b50) return undefined;
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    if (at + 46 + nameLen > eocd) return undefined;
    names.push(buf.toString('utf8', at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

export interface ShareContext {
  db: Db;
  dir: string;
  limits?: Partial<ShareLimits>;
  authed: (req: http.IncomingMessage) => string;
  clientIp: (req: http.IncomingMessage) => string;
  /** Throw (429) when this caller did it too often lately. */
  limitUploads: (key: string) => void;
  limitDownloads: (key: string) => void;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const text = (v: string | null, max: number) => (v ?? '').trim().slice(0, max);

export function profileShareRoutes(ctx: ShareContext) {
  const { db } = ctx;
  // live: the admin panel's settings are read when used
  const limits = withDefaults(SHARE_LIMITS, ctx.limits);
  mkdirSync(ctx.dir, { recursive: true });
  const fileOf = (code: string) => path.join(ctx.dir, `${code}.mrpack`);
  /** What the owner's list and the importing player see (the owner's id stays here). */
  const view = ({ owner: _owner, ...s }: ProfileShare) => s;

  /** The upload, up to the limit; the rest of a too big one is read and dropped so the launcher gets the answer. */
  async function readPack(req: http.IncomingMessage): Promise<Buffer> {
    const declared = Number(req.headers['content-length']);
    if (declared > limits.maxBytes) {
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

  const routes: [string, RegExp, Handler][] = [
    ['POST', /^\/v1\/profile-shares$/, async (req, _p, url) => {
      const me = ctx.authed(req);
      ctx.limitUploads(`share:${me}`);
      const mine = db.profileShares(me);
      if (mine.length >= limits.maxActive) {
        req.resume();
        ctx.fail(409, 'share_limit');
      }
      const data = await readPack(req);
      const names = zipEntryNames(data);
      if (!names?.includes('modrinth.index.json')) ctx.fail(400, 'not_a_pack');
      if (mine.reduce((sum, s) => sum + s.size, 0) + data.length > limits.quotaBytes) ctx.fail(409, 'share_quota');
      let code: string;
      do code = newCode();
      while (db.profileShare(code) || (await stat(fileOf(code)).then(() => true, () => false)));
      // written aside and moved in, so a half-written file is never served
      const tmp = `${fileOf(code)}.part`;
      await writeFile(tmp, data);
      await rename(tmp, fileOf(code));
      const expiresAt = Date.now() + limits.days * 86_400_000;
      db.addProfileShare({
        code, owner: me, size: data.length, expiresAt,
        name: text(url.searchParams.get('name'), 60), gameVersion: text(url.searchParams.get('game'), 40), loader: text(url.searchParams.get('loader'), 20),
      });
      return { share: view(db.profileShare(code)!) };
    }],
    // the player's own codes, with what is left of the quota
    ['GET', /^\/v1\/profile-shares$/, (req) => {
      const me = ctx.authed(req);
      const shares = db.profileShares(me);
      return { shares: shares.map(view), limits: { ...limits, used: shares.reduce((sum, s) => sum + s.size, 0) } };
    }],
    // what a code holds, before downloading it (no sign-in needed: a friend may not have an account)
    ['GET', /^\/v1\/profile-shares\/([\w-]+)$/, (req, [raw]) => {
      ctx.limitDownloads(`share:${ctx.clientIp(req)}`);
      const code = normalizeCode(raw);
      const share = code ? db.profileShare(code) : undefined;
      if (!share) ctx.fail(404, 'not_found');
      return { share: view(share) };
    }],
    ['DELETE', /^\/v1\/profile-shares\/([\w-]+)$/, async (req, [raw]) => {
      const me = ctx.authed(req);
      const code = normalizeCode(raw);
      const share = code ? db.profileShare(code) : undefined;
      if (!share || share.owner !== me) ctx.fail(404, 'not_found');
      db.removeProfileShare(share.code);
      await rm(fileOf(share.code), { force: true });
      return { ok: true };
    }],
  ];

  /** GET /v1/profile-shares/<code>/file: the pack itself. Answers true when the request was this. */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const m = /^\/v1\/profile-shares\/([\w-]+)\/file$/.exec(url.pathname);
    if (req.method !== 'GET' || !m) return false;
    const answer = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
      return true;
    };
    try {
      ctx.limitDownloads(`share:${ctx.clientIp(req)}`);
    } catch {
      return answer(429, 'rate_limited');
    }
    const code = normalizeCode(m[1]);
    const share = code ? db.profileShare(code) : undefined;
    const size = share && (await stat(fileOf(share.code)).then((s) => s.size, () => undefined));
    if (!share || size === undefined) return answer(404, 'not_found');
    db.countShareDownload(share.code);
    res.writeHead(200, {
      'Content-Type': 'application/x-modrinth-modpack+zip',
      'Content-Length': size,
      'Content-Disposition': `attachment; filename="${share.code}.mrpack"`,
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(fileOf(share.code)).on('error', () => res.destroy()).pipe(res);
    return true;
  }

  /** Drops codes past their time, with their files. */
  async function cleanup() {
    for (const code of db.expiredProfileShares(Date.now())) {
      await rm(fileOf(code), { force: true });
      db.removeProfileShare(code);
    }
  }

  return { routes, serve, cleanup };
}
