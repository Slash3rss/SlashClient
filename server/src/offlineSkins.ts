import { createHash } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from './db.ts';
import { pngSize } from './png.ts';
import type { SettingDef } from './settings.ts';

/**
 * Skins of offline (non-premium) Minecraft accounts: the player sets one in the launcher for a nick, and
 * other SlashClient players on the same server see it (the HUD asks /v1/mc/lookup with the server's
 * address). The skin belongs to the SlashClient account whose launcher really plays as that nick on that
 * server right now (app.ts: `offlineLinked`), never to the nick itself: nobody reserves a nick.
 */

export const OFFLINE_SKIN_LIMITS = { perUser: 10, maxBytes: 64 * 1024 };
/** A nick as Minecraft allows it. */
export const OFFLINE_NAME = /^[A-Za-z0-9_]{1,16}$/;

export const OFFLINE_SKIN_SETTING_DEFS: SettingDef[] = ([
  { key: 'skins.offlinePerUser', label: 'Skinów offline na konto', labelEn: 'Offline skins per account', description: 'Ile nicków offline jeden gracz może mieć ze skinem (każdy nick jeden skin).', type: 'int', default: OFFLINE_SKIN_LIMITS.perUser, min: 1, max: 1000 },
  { key: 'skins.uploadsPerMinute', label: 'Wgrywanie skinów na minutę', labelEn: 'Skin uploads per minute', description: 'Na konto.', type: 'int', default: 10, min: 1, max: 10_000, unit: '/min' },
] as Omit<SettingDef, 'category'>[]).map((d) => ({ ...d, category: 'skins' as const }));

export interface OfflineSkin { name: string; hash: string; slim: boolean; updatedAt: number }

export class OfflineSkinStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS offline_skins (user_id TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, name_lower TEXT NOT NULL, name TEXT NOT NULL,
  hash TEXT NOT NULL, slim INTEGER NOT NULL DEFAULT 0, png BLOB NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, name_lower));
CREATE INDEX IF NOT EXISTS offline_skins_hash ON offline_skins (hash);
`);
  }

  list(user: string): OfflineSkin[] {
    return (this.sql.prepare('SELECT name, hash, slim, updated_at FROM offline_skins WHERE user_id = ? ORDER BY name_lower').all(user) as { name: string; hash: string; slim: number; updated_at: number }[])
      .map((r) => ({ name: r.name, hash: r.hash, slim: !!r.slim, updatedAt: r.updated_at }));
  }

  get(user: string, name: string): OfflineSkin | undefined {
    const r = this.sql.prepare('SELECT name, hash, slim, updated_at FROM offline_skins WHERE user_id = ? AND name_lower = ?').get(user, name.toLowerCase()) as { name: string; hash: string; slim: number; updated_at: number } | undefined;
    return r && { name: r.name, hash: r.hash, slim: !!r.slim, updatedAt: r.updated_at };
  }

  count(user: string): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM offline_skins WHERE user_id = ?').get(user) as { n: number }).n;
  }

  put(user: string, name: string, png: Buffer, slim: boolean, at = Date.now()): OfflineSkin {
    const hash = createHash('sha256').update(png).digest('hex').slice(0, 32);
    this.sql.prepare(`INSERT INTO offline_skins (user_id, name_lower, name, hash, slim, png, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, name_lower) DO UPDATE SET name = excluded.name, hash = excluded.hash, slim = excluded.slim, png = excluded.png, updated_at = excluded.updated_at`)
      .run(user, name.toLowerCase(), name, hash, slim ? 1 : 0, png, at);
    return { name, hash, slim, updatedAt: at };
  }

  remove(user: string, name: string): boolean {
    return Number(this.sql.prepare('DELETE FROM offline_skins WHERE user_id = ? AND name_lower = ?').run(user, name.toLowerCase()).changes) > 0;
  }

  /** The picture with this hash (any account's: the same file is the same skin). */
  picture(hash: string): Buffer | undefined {
    const r = this.sql.prepare('SELECT png FROM offline_skins WHERE hash = ? LIMIT 1').get(hash) as { png: Uint8Array } | undefined;
    return r ? Buffer.from(r.png) : undefined;
  }
}

/** A skin file as the game takes it: a PNG, 64×64 or the old 64×32, not over 64 KB. */
export function checkSkin(data: Buffer): boolean {
  if (data.length > OFFLINE_SKIN_LIMITS.maxBytes) return false;
  const size = pngSize(data);
  return !!size && size.width === 64 && (size.height === 64 || size.height === 32);
}

/** The upload's JSON: a skin in base64 is larger than the API's usual limit for a request (security.bodyKb). */
const MAX_BODY = Math.ceil((OFFLINE_SKIN_LIMITS.maxBytes * 4) / 3) + 4096;
async function readJson(req: http.IncomingMessage, fail: (status: number, code: string) => never): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  // the rest of a too big upload is read and dropped, so the sender gets the answer instead of a broken connection
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= MAX_BODY) chunks.push(chunk);
  }
  if (size > MAX_BODY) fail(413, 'too_large');
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return fail(400, 'bad_request');
  }
}

type Handler =(req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export interface OfflineSkinContext {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  perUser: () => number;
  limitUploads: (key: string) => void;
  /** Players around this one see the new skin at once (their HUDs ask again). */
  cosmeticsChanged: (userId: string) => void;
  /** Handles that are admins by configuration: only such an admin changes their accounts. */
  configAdmins: Set<string>;
  fail: (status: number, code: string) => never;
}

export function offlineSkinRoutes(ctx: OfflineSkinContext) {
  const store = new OfflineSkinStore(ctx.db.sql);
  const { fail } = ctx;
  const view = (s: OfflineSkin) => ({ name: s.name, hash: s.hash, slim: s.slim });
  const nameOr400 = (raw: string) => {
    const name = decodeURIComponent(raw);
    if (!OFFLINE_NAME.test(name)) fail(400, 'bad_name');
    return name;
  };
  const isConfig = (handle: string | undefined) => !!handle && ctx.configAdmins.has(handle.toLowerCase());

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/me\/offline-skins$/, (req) => ({ skins: store.list(ctx.authed(req)).map(view) })],
    ['PUT', /^\/v1\/me\/offline-skins\/([^/]{1,64})$/, async (req, [raw]) => {
      const me = ctx.authed(req);
      const name = nameOr400(raw);
      ctx.limitUploads(me);
      const { png, slim } = await readJson(req, fail);
      if (typeof png !== 'string' || (slim !== undefined && typeof slim !== 'boolean')) fail(400, 'bad_request');
      const data = Buffer.from(png as string, 'base64');
      if (!checkSkin(data)) fail(400, 'bad_skin');
      // a new nick counts against the limit; changing one already there does not
      if (!store.get(me, name) && store.count(me) >= ctx.perUser()) fail(400, 'too_many');
      const saved = store.put(me, name, data, slim === true);
      ctx.cosmeticsChanged(me);
      return view(saved);
    }],
    ['DELETE', /^\/v1\/me\/offline-skins\/([^/]{1,64})$/, (req, [raw]) => {
      const me = ctx.authed(req);
      const name = nameOr400(raw);
      if (!store.remove(me, name)) fail(404, 'not_found');
      ctx.cosmeticsChanged(me);
      return { ok: true };
    }],
    // the admin panel's account drawer ("Pliki i treści"): answers with the account's skins left
    ['DELETE', /^\/v1\/admin\/users\/([\w-]+)\/offline-skins\/([^/]{1,64})$/, (req, [id, raw]) => {
      const me = ctx.admin(req);
      const user = ctx.db.user(id) ?? fail(404, 'not_found');
      if (isConfig(user.handle) && !isConfig(ctx.db.user(me)?.handle)) fail(403, 'config_admin');
      const name = nameOr400(raw);
      const s = store.get(id, name) ?? fail(404, 'not_found');
      store.remove(id, name);
      ctx.db.log(me, 'offline_skin_remove', user.handle, s.name, id);
      ctx.cosmeticsChanged(id);
      return { offlineSkins: store.list(id) };
    }],
  ];
  return { store, routes };
}
