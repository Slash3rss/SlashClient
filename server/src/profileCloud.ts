import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { zipEntryNames } from './profileShares.ts';
import { addColumn, sendObject, type Storage } from './storage.ts';
import { withDefaults } from './settings.ts';

/**
 * Profiles kept on the player's account, so the same profile works on a second computer. The
 * launcher uploads the profile as a .mrpack (the same file as a share code, profileShares.ts)
 * under its own id; only the owner lists, downloads or deletes it. Every upload bumps the
 * profile's revision: a launcher sends the revision it last saw, and when another computer
 * uploaded in between the server answers "cloud_conflict" instead of overwriting, so the player
 * decides which copy wins. The table lives here (not in db.ts); the files on the server's disk or
 * in a bucket (storage.ts), the row's `store` says which.
 */

export interface CloudLimits {
  /** Largest pack accepted. */
  maxBytes: number;
  /** Profiles one account may keep. */
  maxProfiles: number;
  /** All of one account's packs together. */
  quotaBytes: number;
}
export const CLOUD_LIMITS: CloudLimits = { maxBytes: 50 * 1024 * 1024, maxProfiles: 10, quotaBytes: 300 * 1024 * 1024 };

/** What the launcher and the owner's list see. */
export interface CloudProfile {
  id: string;
  name: string;
  gameVersion: string;
  loader: string;
  /** The computer that uploaded it last, as the launcher named it. */
  device: string;
  size: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

/** Ids are made by the launcher (a uuid); anything else is refused before the database sees it. */
export const validCloudId = (raw: unknown): string | undefined =>
  typeof raw === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(raw) ? raw.toLowerCase() : undefined;

const COLUMNS = 'id, name, game_version AS gameVersion, loader, device, size, revision, created_at AS createdAt, updated_at AS updatedAt';

class CloudStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS cloud_profiles (owner TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, id TEXT NOT NULL, file TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', game_version TEXT NOT NULL DEFAULT '', loader TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (owner, id));
`);
    // where the file is: rows from before storage backends are on the server's disk
    addColumn(sql, 'cloud_profiles', 'store', "TEXT NOT NULL DEFAULT 'local'");
  }

  list(owner: string): CloudProfile[] {
    return this.sql.prepare(`SELECT ${COLUMNS} FROM cloud_profiles WHERE owner = ? ORDER BY updated_at DESC`).all(owner) as unknown as CloudProfile[];
  }

  get(owner: string, id: string): (CloudProfile & { file: string; store: string }) | undefined {
    return this.sql.prepare(`SELECT ${COLUMNS}, file, store FROM cloud_profiles WHERE owner = ? AND id = ?`).get(owner, id) as (CloudProfile & { file: string; store: string }) | undefined;
  }

  put(owner: string, p: Omit<CloudProfile, 'createdAt'> & { file: string; store: string }) {
    this.sql.prepare(`INSERT INTO cloud_profiles (owner, id, file, name, game_version, loader, device, size, revision, created_at, updated_at, store) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (owner, id) DO UPDATE SET file = excluded.file, name = excluded.name, game_version = excluded.game_version, loader = excluded.loader,
      device = excluded.device, size = excluded.size, revision = excluded.revision, updated_at = excluded.updated_at, store = excluded.store`)
      .run(owner, p.id, p.file, p.name, p.gameVersion, p.loader, p.device, p.size, p.revision, p.updatedAt, p.updatedAt, p.store);
  }

  remove(owner: string, id: string) {
    this.sql.prepare('DELETE FROM cloud_profiles WHERE owner = ? AND id = ?').run(owner, id);
  }

  /** "<store>:<file>" of every row (the rest is left over from deleted accounts). */
  files(): Set<string> {
    return new Set((this.sql.prepare('SELECT store, file FROM cloud_profiles').all() as { store: string; file: string }[]).map((r) => `${r.store}:${r.file}`));
  }

  // what the storage needs to know (storage.ts)
  usage() {
    return this.sql.prepare("SELECT store, 'profile' AS kind, COUNT(*) AS files, SUM(size) AS bytes FROM cloud_profiles GROUP BY store").all() as { store: string; kind: string; files: number; bytes: number }[];
  }
  owners() {
    return this.sql.prepare('SELECT owner, COUNT(*) AS files, SUM(size) AS bytes FROM cloud_profiles GROUP BY owner').all() as { owner: string; files: number; bytes: number }[];
  }
  held(store: string) {
    return this.sql.prepare('SELECT file, size FROM cloud_profiles WHERE store = ?').all(store) as { file: string; size: number }[];
  }
  relocate(file: string, from: string, to: string): boolean {
    return Number(this.sql.prepare('UPDATE cloud_profiles SET store = ? WHERE file = ? AND store = ?').run(to, file, from).changes) > 0;
  }
}

const keyOf = (file: string) => `cloud/${file}.mrpack`;

export interface CloudContext {
  sql: DatabaseSync;
  /** Where the packs go (storage.ts). */
  storage: Storage;
  limits?: Partial<CloudLimits>;
  /** How many times more profiles and room an account gets (supporters, payments/support.ts); 1 when missing. */
  limitFactor?: (userId: string) => number;
  authed: (req: http.IncomingMessage) => string;
  /** Throw (429) when this caller did it too often lately. */
  limitUploads: (key: string) => void;
  limitDownloads: (key: string) => void;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const text = (v: string | null, max: number) => (v ?? '').trim().slice(0, max);

export function profileCloudRoutes(ctx: CloudContext) {
  const store = new CloudStore(ctx.sql);
  // live: the admin panel's settings are read when used
  const limits = withDefaults(CLOUD_LIMITS, ctx.limits);
  const { storage } = ctx;
  storage.register({
    usage: () => store.usage(),
    owners: () => store.owners(),
    held: (from) => store.held(from).map((p) => ({ ref: p.file, keys: [keyOf(p.file)], bytes: p.size })),
    relocate: (file, from, to) => store.relocate(file, from, to),
  });
  /** The account's own limits: more profiles and room for supporters, the same size of one pack. */
  const limitsOf = (userId: string): CloudLimits => {
    const f = Math.max(1, ctx.limitFactor?.(userId) ?? 1);
    return f === 1 ? limits : { ...limits, maxProfiles: Math.floor(limits.maxProfiles * f), quotaBytes: Math.floor(limits.quotaBytes * f) };
  };
  const view = ({ file: _file, store: _store, ...p }: CloudProfile & { file?: string; store?: string }): CloudProfile => p;
  const idOf = (raw: string) => validCloudId(raw) ?? ctx.fail(404, 'not_found');

  /** The upload, up to the limit; the rest of a too big one is read and dropped so the launcher gets the answer. */
  async function readPack(req: http.IncomingMessage): Promise<Buffer> {
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

  const routes: [string, RegExp, Handler][] = [
    // the account's profiles, with what is left of the quota
    ['GET', /^\/v1\/cloud-profiles$/, (req) => {
      const me = ctx.authed(req);
      const profiles = store.list(me);
      return { profiles, limits: { ...limitsOf(me), used: profiles.reduce((sum, p) => sum + p.size, 0) } };
    }],
    ['GET', /^\/v1\/cloud-profiles\/([\w-]+)$/, (req, [raw]) => {
      const me = ctx.authed(req);
      const p = store.get(me, idOf(raw));
      if (!p) ctx.fail(404, 'not_found');
      return { profile: view(p) };
    }],
    /**
     * Saves a new copy. `base` is the revision the launcher last uploaded or downloaded; when the
     * account holds another one (or any, and the launcher saw none) the answer is a conflict,
     * unless `force=1` says the player chose to overwrite it.
     */
    ['PUT', /^\/v1\/cloud-profiles\/([\w-]+)$/, async (req, [raw], url) => {
      const me = ctx.authed(req);
      const id = validCloudId(raw);
      if (!id) {
        req.resume();
        ctx.fail(400, 'bad_id');
      }
      ctx.limitUploads(`cloud:${me}`);
      const current = store.get(me, id);
      const all = store.list(me);
      const force = url.searchParams.get('force') === '1';
      const base = Number(url.searchParams.get('base') ?? 0);
      if (current && !force && base !== current.revision) {
        req.resume();
        ctx.fail(409, 'cloud_conflict');
      }
      if (!current && all.length >= limitsOf(me).maxProfiles) {
        req.resume();
        ctx.fail(409, 'cloud_limit');
      }
      const data = await readPack(req);
      if (!zipEntryNames(data)?.includes('modrinth.index.json')) ctx.fail(400, 'not_a_pack');
      const used = all.reduce((sum, p) => sum + p.size, 0) - (current?.size ?? 0);
      if (used + data.length > limitsOf(me).quotaBytes) ctx.fail(409, 'cloud_quota');
      // a new file each time, on a backend with room (storage.ts): a download running now keeps reading the old one
      const file = randomBytes(16).toString('hex');
      await storage.place([{ key: keyOf(file), data, type: 'application/x-modrinth-modpack+zip' }], (where) => store.put(me, {
        id, file, size: data.length, revision: (current?.revision ?? 0) + 1, updatedAt: Date.now(),
        name: text(url.searchParams.get('name'), 60), gameVersion: text(url.searchParams.get('game'), 40),
        loader: text(url.searchParams.get('loader'), 20), device: text(url.searchParams.get('device'), 60), store: where,
      }));
      if (current) await storage.remove(current.store, [keyOf(current.file)]);
      return { profile: view(store.get(me, id)!) };
    }],
    ['DELETE', /^\/v1\/cloud-profiles\/([\w-]+)$/, async (req, [raw]) => {
      const me = ctx.authed(req);
      const p = store.get(me, idOf(raw));
      if (!p) ctx.fail(404, 'not_found');
      store.remove(me, p.id);
      await storage.remove(p.store, [keyOf(p.file)]);
      return { ok: true };
    }],
  ];

  /** GET /v1/cloud-profiles/<id>/file: the pack itself, for its owner only. Answers true when the request was this. */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const m = /^\/v1\/cloud-profiles\/([\w-]+)\/file$/.exec(url.pathname);
    if (req.method !== 'GET' || !m) return false;
    const answer = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
      return true;
    };
    let me: string;
    try {
      me = ctx.authed(req);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 401;
      return answer(status, (err as { code?: string }).code ?? 'unauthorized');
    }
    try {
      ctx.limitDownloads(`cloud:${me}`);
    } catch {
      return answer(429, 'rate_limited');
    }
    const id = validCloudId(m[1]);
    const p = id ? store.get(me, id) : undefined;
    if (!p) return answer(404, 'not_found');
    // through this server from wherever the row says
    const sent = await sendObject(req, res, storage.backend(p.store), keyOf(p.file), {
      'Content-Type': 'application/x-modrinth-modpack+zip',
      'Content-Disposition': `attachment; filename="${p.id}.mrpack"`,
      'X-Content-Type-Options': 'nosniff',
      'X-Cloud-Revision': String(p.revision),
    });
    return sent || answer(404, 'not_found');
  }

  /** Drops files no row points at any more (their account was deleted), once they are an hour old, on every backend. */
  async function cleanup(now = Date.now()) {
    const used = store.files();
    await storage.sweep('cloud', (where, name) => used.has(`${where}:${name.replace(/\.mrpack(\.part)?$/, '')}`), now);
  }

  return { routes, serve, cleanup };
}
