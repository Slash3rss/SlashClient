import { backup, type DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Backend } from './s3.ts';
import type { ListedObject } from './storage.ts';

/**
 * A spare server, ready to take over when the main one goes down (deploy/failover/README.md).
 *
 * Only one server at a time takes in players' changes: the one holding the lease, a small file in
 * the bucket (R2) it renews every 15 s and writes only if nobody changed it since it read it. A
 * server that finds the lease taken by another does not start, and one that loses it while running
 * stops at once: after a takeover the old one, coming back, cannot write over what the new one did.
 *
 * The one holding it copies its database to the bucket every 30 s (when something changed), with
 * hourly and daily copies kept as backups, and the files next to the database (shared profiles,
 * clips on the server's disk, logs, chat pictures) as they change. The spare, taking over, restores
 * both from there (failoverRestore.ts) and starts.
 */

/** What failover asks of the bucket (S3Backend; the tests' fake S3 answers the same). */
export interface FailoverStore {
  readTagged(key: string): Promise<{ data: Buffer; etag: string } | undefined>;
  putIf(key: string, data: Buffer, etag: string | null): Promise<string | undefined>;
  put(key: string, data: Buffer, type?: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<ListedObject[]>;
}

export interface Lease {
  node: string;
  /** Goes up by one each time another server takes the lease over. */
  term: number;
  renewedAt: number;
}

export const LEASE_KEY = 'leader.json';
export const DB_KEY = 'db/latest.db.gz';
export const DB_META_KEY = 'db/latest.json';
export const FILES_PREFIX = 'files/';
export const MANIFEST_KEY = 'files-manifest.json';
/** A lease not renewed for this long is free: the server holding it is down (or cut off). */
export const LEASE_TTL_MS = 90_000;

const json = (v: unknown) => Buffer.from(JSON.stringify(v));

export interface LeaderOptions {
  node: string;
  store: FailoverStore;
  ttlMs?: number;
  renewMs?: number;
  now?: () => number;
  /** The lease went to another server: this one must stop taking changes at once. */
  onLost: (holder: Lease | undefined) => void;
  log?: (message: string) => void;
}

export class Leader {
  term = 0;
  holding = false;
  private etag: string | null = null;
  private timer?: NodeJS.Timeout;
  private readonly now: () => number;
  private readonly ttl: number;

  private readonly o: LeaderOptions;

  constructor(o: LeaderOptions) {
    this.o = o;
    this.now = o.now ?? Date.now;
    this.ttl = o.ttlMs ?? LEASE_TTL_MS;
  }

  async read(): Promise<{ lease?: Lease; etag: string | null }> {
    const got = await this.o.store.readTagged(LEASE_KEY);
    if (!got) return { etag: null };
    try {
      return { lease: JSON.parse(got.data.toString('utf8')) as Lease, etag: got.etag };
    } catch {
      // a broken file is taken over like a free lease
      return { etag: got.etag };
    }
  }

  /** Takes the lease when it is free, stale or this server's already; says who holds it otherwise. */
  async acquire(): Promise<{ ok: true; term: number } | { ok: false; holder?: Lease }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { lease, etag } = await this.read();
      const now = this.now();
      if (lease && lease.node !== this.o.node && now - lease.renewedAt < this.ttl) return { ok: false, holder: lease };
      const next: Lease = { node: this.o.node, term: !lease ? 1 : lease.node === this.o.node ? lease.term : lease.term + 1, renewedAt: now };
      const tag = await this.o.store.putIf(LEASE_KEY, json(next), etag);
      if (tag !== undefined) {
        this.term = next.term;
        this.etag = tag;
        this.holding = true;
        return { ok: true, term: next.term };
      }
      // another server wrote in between: read again and judge anew
    }
    return { ok: false, holder: (await this.read()).lease };
  }

  /** Renews the lease every 15 s while this server runs. */
  start() {
    this.timer = setInterval(() => void this.renew(), this.o.renewMs ?? 15_000);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }

  async renew(): Promise<void> {
    if (!this.holding) return;
    const next: Lease = { node: this.o.node, term: this.term, renewedAt: this.now() };
    try {
      let tag = await this.o.store.putIf(LEASE_KEY, json(next), this.etag);
      if (tag === undefined) {
        const { lease, etag } = await this.read();
        if (!lease || lease.node !== this.o.node || lease.term !== this.term) return this.lose(lease);
        // still ours (its tag read anew): renewed on the second go
        tag = await this.o.store.putIf(LEASE_KEY, json(next), etag);
        if (tag === undefined) return;
      }
      this.etag = tag;
    } catch (err) {
      // the bucket out of reach: this server goes on serving (the spare only takes over when it cannot reach this one either)
      this.o.log?.(`awaryjność: nie udało się odnowić dzierżawy: ${(err as Error).message}`);
    }
  }

  private lose(holder: Lease | undefined) {
    this.holding = false;
    this.stop();
    this.o.onLost(holder);
  }
}

/** Files next to the database that are the database itself (copied as a whole, not as files). */
const SKIP = /(\.db|\.db-wal|\.db-shm|\.db-journal|\.snapshot|\.tmp|\.before-restore-\d+)$/;

async function walk(dir: string, base = dir, out: Map<string, { size: number; mtimeMs: number }> = new Map()) {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile() && !SKIP.test(e.name)) {
      const st = await fs.stat(full).catch(() => undefined);
      if (st) out.set(path.relative(base, full).split(path.sep).join('/'), { size: st.size, mtimeMs: Math.round(st.mtimeMs) });
    }
  }
  return out;
}

type Manifest = Record<string, [size: number, mtimeMs: number]>;

export interface ReplicaOptions {
  node: string;
  store: FailoverStore;
  db: DatabaseSync;
  dbFile: string;
  /** The folder whose files are copied (the database's own folder). */
  dataDir: string;
  leader: Leader;
  now?: () => number;
  log?: (message: string) => void;
}

export class Replica {
  private changes = -1;
  private lastDb = 0;
  private manifest?: Manifest;
  private timers: NodeJS.Timeout[] = [];
  private busy = false;
  private readonly now: () => number;

  private readonly o: ReplicaOptions;

  constructor(o: ReplicaOptions) {
    this.o = o;
    this.now = o.now ?? Date.now;
  }

  start() {
    const every = (ms: number, fn: () => Promise<unknown>) => {
      const t = setInterval(() => void this.once(fn), ms);
      t.unref?.();
      this.timers.push(t);
    };
    every(30_000, () => this.copyDb());
    every(60_000, () => this.copyFiles());
    void this.once(async () => {
      await this.copyDb(true);
      await this.copyFiles();
    });
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
  }

  /** One copy at a time (a big first copy of the files may outlast the next tick). */
  private async once(fn: () => Promise<unknown>) {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } catch (err) {
      this.o.log?.(`awaryjność: kopia do magazynu nie wyszła: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  /**
   * The database to the bucket, when anything changed since the last copy (or 10 minutes passed),
   * plus an hourly and a daily copy kept 48 hours and 30 days. Only while holding the lease.
   */
  async copyDb(force = false): Promise<boolean> {
    if (!this.o.leader.holding) return false;
    const changes = Number((this.o.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n);
    const now = this.now();
    if (!force && changes === this.changes && now - this.lastDb < 10 * 60_000) return false;
    const tmp = `${this.o.dbFile}.snapshot`;
    await backup(this.o.db, tmp);
    let data: Buffer;
    try {
      data = gzipSync(await fs.readFile(tmp));
    } finally {
      await fs.rm(tmp, { force: true });
    }
    // lost in the meantime: the new holder's copy is the one that counts
    if (!this.o.leader.holding) return false;
    await this.o.store.put(DB_KEY, data, 'application/gzip');
    await this.o.store.put(DB_META_KEY, json({ node: this.o.node, term: this.o.leader.term, at: now, bytes: data.length }), 'application/json');
    const iso = new Date(now).toISOString();
    const hour = `db/hourly/${iso.slice(0, 13)}.db.gz`;
    const day = `db/daily/${iso.slice(0, 10)}.db.gz`;
    if (new Date(this.lastDb).toISOString().slice(0, 13) !== iso.slice(0, 13) || force) await this.o.store.put(hour, data, 'application/gzip');
    if (new Date(this.lastDb).toISOString().slice(0, 10) !== iso.slice(0, 10) || force) {
      await this.o.store.put(day, data, 'application/gzip');
      await this.prune(now);
    }
    this.changes = changes;
    this.lastDb = now;
    return true;
  }

  /** Hourly copies older than 48 hours and daily ones older than 30 days go. */
  private async prune(now: number) {
    for (const [prefix, keepMs] of [['db/hourly/', 48 * 3600_000], ['db/daily/', 30 * 86400_000]] as const) {
      for (const o of await this.o.store.list(prefix)) {
        // "2026-10-29T08" or "2026-10-29"
        const name = o.key.slice(prefix.length).replace('.db.gz', '');
        const when = Date.parse(name.length === 13 ? `${name}:00:00Z` : `${name}T00:00:00Z`);
        if (Number.isFinite(when) && now - when > keepMs) await this.o.store.delete(o.key);
      }
    }
  }

  /** The files next to the database: new and changed ones sent, removed ones removed. */
  async copyFiles(): Promise<{ sent: number; removed: number }> {
    if (!this.o.leader.holding) return { sent: 0, removed: 0 };
    if (!this.manifest) {
      const got = await this.o.store.readTagged(MANIFEST_KEY);
      this.manifest = got ? (JSON.parse(got.data.toString('utf8')) as Manifest) : {};
    }
    const local = await walk(this.o.dataDir);
    const manifest = this.manifest;
    let sent = 0;
    let removed = 0;
    for (const [rel, st] of local) {
      const known = manifest[rel];
      if (known && known[0] === st.size && known[1] === st.mtimeMs) continue;
      const data = await fs.readFile(path.join(this.o.dataDir, rel)).catch(() => undefined);
      if (!data || !this.o.leader.holding) continue;
      await this.o.store.put(FILES_PREFIX + rel, data);
      manifest[rel] = [st.size, st.mtimeMs];
      sent++;
    }
    for (const rel of Object.keys(manifest)) {
      if (local.has(rel) || !this.o.leader.holding) continue;
      await this.o.store.delete(FILES_PREFIX + rel);
      delete manifest[rel];
      removed++;
    }
    if (sent || removed) await this.o.store.put(MANIFEST_KEY, json(manifest), 'application/json');
    return { sent, removed };
  }
}

/**
 * The spare taking over: the last copy of the database and the files from the bucket put in place.
 * A database already there is kept aside (`.before-restore-<time>`), never deleted.
 */
export async function restore(o: { store: FailoverStore; dbFile: string; dataDir: string; log?: (m: string) => void; now?: () => number }): Promise<{ dbAt?: number; files: number }> {
  const log = o.log ?? (() => {});
  const stamp = (o.now ?? Date.now)();
  await fs.mkdir(o.dataDir, { recursive: true });
  const db = await o.store.readTagged(DB_KEY);
  const meta = await o.store.readTagged(DB_META_KEY);
  const dbAt = meta ? (JSON.parse(meta.data.toString('utf8')) as { at: number }).at : undefined;
  if (db) {
    for (const suffix of ['', '-wal', '-shm']) {
      const file = o.dbFile + suffix;
      await fs.rename(file, `${file}.before-restore-${stamp}`).catch(() => undefined);
    }
    await fs.writeFile(o.dbFile, gunzipSync(db.data));
    log(`baza z ${dbAt ? new Date(dbAt).toISOString() : '?'} odtworzona`);
  } else log('w magazynie nie ma kopii bazy');
  const got = await o.store.readTagged(MANIFEST_KEY);
  const manifest = got ? (JSON.parse(got.data.toString('utf8')) as Manifest) : {};
  let files = 0;
  for (const [rel, [size, mtimeMs]] of Object.entries(manifest)) {
    // nothing outside the data folder, whatever the manifest says
    const target = path.resolve(o.dataDir, rel);
    if (!target.startsWith(path.resolve(o.dataDir) + path.sep)) continue;
    const st = await fs.stat(target).catch(() => undefined);
    if (st && st.size === size && Math.round(st.mtimeMs) === mtimeMs) continue;
    const obj = await o.store.readTagged(FILES_PREFIX + rel);
    if (!obj) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, obj.data);
    // the same time as on the main server, so the main one's next copy does not send it all again after a failback
    await fs.utimes(target, new Date(mtimeMs), new Date(mtimeMs)).catch(() => undefined);
    files++;
  }
  log(`pliki: ${files} pobranych`);
  return { dbAt, files };
}

/** The bucket and the node's name from the environment (FAILOVER_*); undefined: failover is off. */
export function failoverFromEnv(env = process.env): { node: string; store: S3Backend } | undefined {
  const node = env.FAILOVER_NODE?.trim();
  if (!node || !env.FAILOVER_S3_ENDPOINT || !env.FAILOVER_S3_BUCKET || !env.FAILOVER_S3_KEY_ID || !env.FAILOVER_S3_SECRET) return undefined;
  return {
    node,
    store: new S3Backend({
      endpoint: env.FAILOVER_S3_ENDPOINT,
      region: env.FAILOVER_S3_REGION || 'auto',
      bucket: env.FAILOVER_S3_BUCKET,
      accessKeyId: env.FAILOVER_S3_KEY_ID,
      secretAccessKey: env.FAILOVER_S3_SECRET,
      prefix: env.FAILOVER_S3_PREFIX ?? 'slashclient-failover/',
    }),
  };
}
