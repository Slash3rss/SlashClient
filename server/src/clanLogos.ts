import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';

/**
 * A clan's logo: a 64×64 PNG the owner uploads (the launcher crops and scales the picture before
 * it leaves the computer), shown instead of the tag's mark in the launcher and in the game. Kept
 * in the database (it is small), served to anyone at /v1/clans/<id>/logo.png; its version goes in
 * the address (?v=), so a client may keep it for good and fetch again only when it changes.
 *
 * Communities (communities.ts) have logos the same way, in a table of their own (LogoStore with
 * another table), served at /v1/communities/<id>/logo.png.
 */

export const LOGO_SIZE = 64;
export const MAX_LOGO_BYTES = 32 * 1024;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/**
 * Why these bytes are not a logo ('not_png', 'bad_logo_size', 'too_large'), or undefined when they
 * are: a PNG by its signature, its header (IHDR, first) saying 64×64, and its end (IEND) in place.
 * Nothing is decoded here; the clients read it as any PNG.
 */
/** The largest logo accepted now: the admin panel's setting once the app says so (clans' and communities' alike). */
let maxLogoBytes = () => MAX_LOGO_BYTES;
export function useLogoLimit(fn?: () => number) {
  maxLogoBytes = fn ?? (() => MAX_LOGO_BYTES);
}

export function logoProblem(data: Buffer): 'not_png' | 'bad_logo_size' | 'too_large' | undefined {
  if (data.length > maxLogoBytes()) return 'too_large';
  if (data.length < 8 + 25 + 12 || !data.subarray(0, 8).equals(SIGNATURE)) return 'not_png';
  if (data.readUInt32BE(8) !== 13 || data.toString('latin1', 12, 16) !== 'IHDR') return 'not_png';
  if (!data.subarray(data.length - 12).equals(IEND)) return 'not_png';
  if (data.readUInt32BE(16) !== LOGO_SIZE || data.readUInt32BE(20) !== LOGO_SIZE) return 'bad_logo_size';
  return undefined;
}

/** Logos of one kind of owner (clans, communities): a table of their own, keyed by the owner's id. */
export class LogoStore {
  private sql: DatabaseSync;
  private table: string;
  private key: string;
  /** The part of the address before /<id>/logo.png, e.g. /v1/clans. */
  readonly prefix: string;
  constructor(sql: DatabaseSync, table: string, owners: string, prefix: string, key = 'owner_id') {
    this.sql = sql;
    this.table = table;
    this.key = key;
    this.prefix = prefix;
    sql.exec(`CREATE TABLE IF NOT EXISTS ${table} (${key} TEXT PRIMARY KEY REFERENCES ${owners}(id) ON DELETE CASCADE, png BLOB NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  }

  /** The logo's version (what goes in its address), or undefined when the owner has none. */
  version(owner: string): number | undefined {
    return (this.sql.prepare(`SELECT version FROM ${this.table} WHERE ${this.key} = ?`).get(owner) as { version: number } | undefined)?.version;
  }

  get(owner: string): { png: Buffer; version: number } | undefined {
    const row = this.sql.prepare(`SELECT png, version FROM ${this.table} WHERE ${this.key} = ?`).get(owner) as { png: Uint8Array; version: number } | undefined;
    return row ? { png: Buffer.from(row.png), version: row.version } : undefined;
  }

  /** A new logo; its version always grows (also after one was removed), so an old address never shows it. */
  set(owner: string, png: Buffer, now = Date.now()): number {
    const version = Math.max(now, (this.version(owner) ?? 0) + 1);
    this.sql.prepare(`INSERT OR REPLACE INTO ${this.table} (${this.key}, png, version, updated_at) VALUES (?, ?, ?, ?)`).run(owner, png, version, now);
    return version;
  }

  remove(owner: string): boolean {
    return Number(this.sql.prepare(`DELETE FROM ${this.table} WHERE ${this.key} = ?`).run(owner).changes) > 0;
  }

  /** The public address of a logo of this version. */
  url(owner: string, version: number): string {
    return `${this.prefix}/${owner}/logo.png?v=${version}`;
  }
}

/** Clans' logos (clan_logos), at /v1/clans/<id>/logo.png. */
export class ClanLogoStore extends LogoStore {
  constructor(sql: DatabaseSync) {
    super(sql, 'clan_logos', 'clans', '/v1/clans', 'clan_id');
  }
}

/** The raw body of an upload, up to the logo's limit (413 past it). */
export async function readLogo(req: http.IncomingMessage, fail: (status: number, code: string) => never): Promise<Buffer> {
  const max = maxLogoBytes();
  if (Number(req.headers['content-length']) > max) {
    req.resume();
    fail(413, 'too_large');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= max) chunks.push(chunk);
  }
  if (size > max) fail(413, 'too_large');
  return Buffer.concat(chunks);
}

/**
 * A logo upload: `check` first (who may, the rate limit; the body is drained when it throws), then
 * the PNG read and checked. Returns the bytes to store.
 */
export async function takeLogo(req: http.IncomingMessage, fail: (status: number, code: string) => never, check: () => void): Promise<Buffer> {
  try {
    check();
  } catch (err) {
    req.resume();
    throw err;
  }
  const png = await readLogo(req, fail);
  const problem = logoProblem(png);
  if (problem) fail(problem === 'too_large' ? 413 : 400, problem);
  return png;
}

/** GET <prefix>/<id>/logo.png (/v1/clans/…) for anyone; true when the request was this. */
export function serveLogo(store: LogoStore, req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean {
  if (req.method !== 'GET' || !url.pathname.startsWith(`${store.prefix}/`)) return false;
  const m = /^\/([\w-]{1,32})\/logo\.png$/.exec(url.pathname.slice(store.prefix.length));
  if (!m) return false;
  const logo = store.get(m[1]);
  if (!logo) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return true;
  }
  // the address with this version never shows another picture; without it, check again soon
  const pinned = url.searchParams.get('v') === String(logo.version);
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': logo.png.length,
    'Cache-Control': pinned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(logo.png);
  return true;
}
