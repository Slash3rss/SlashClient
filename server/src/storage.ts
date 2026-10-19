import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream';
import type { DatabaseSync } from 'node:sqlite';
import { S3Backend, cleanEndpoint } from './s3.ts';

/**
 * Where players' files live: shared screenshots and clips (media.ts) and profiles kept on
 * accounts (profileCloud.ts). A "backend" is the server's own disk (the folders it always used)
 * or an S3-compatible bucket (Cloudflare R2, Backblaze B2, …); the admin adds buckets in the
 * panel. Every file's row says which backend holds it (`store`), so reads, deletes and cleanup
 * go there. A new file goes to the first enabled backend, by priority, with room for it: under
 * its capacity (counted from the database) and, on the server's disk, never below a floor of
 * free space. Files are always streamed through this server, never handed out as bucket links.
 */

/** A part of a file, or all of it. */
export type ObjectRead =
  | { body: Readable; length?: number; total?: number; range?: { start: number; end: number } }
  | { unsatisfiable: true; total: number };

export interface ListedObject { key: string; size: number; modifiedMs: number }

/** One place for files. Keys look like "media/<id>" or "cloud/<file>.mrpack". */
export interface Backend {
  readonly kind: 'local' | 's3';
  put(key: string, data: Buffer, type?: string): Promise<void>;
  /** The object, or undefined when there is none; `range` is a single "bytes=a-b" range. */
  get(key: string, range?: string): Promise<ObjectRead | undefined>;
  /** The object's size, or undefined when there is none. */
  head(key: string): Promise<number | undefined>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<ListedObject[]>;
  /** Throws (with a message for the admin) when the backend does not work. */
  check(): Promise<void>;
  /** Total and free bytes of the disk under a namespace (local only). */
  space?(ns: string): Promise<{ total: number; free: number }>;
}

export type DiskSpace = (dir: string) => Promise<{ total: number; free: number }>;
const realDiskSpace: DiskSpace = async (dir) => {
  const s = await statfs(dir);
  return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
};

// ---------- the server's own disk ----------

/** "media/<name>" → [namespace, name]; anything that could leave the folder is refused. */
function splitKey(key: string): [string, string] {
  const at = key.indexOf('/');
  const ns = key.slice(0, at);
  const name = key.slice(at + 1);
  if (at < 1 || !/^[\w-]+$/.test(ns) || !/^[\w.-]+$/.test(name) || name === '.' || name === '..') throw new Error(`bad key ${key}`);
  return [ns, name];
}

/** A single "bytes=a-b", "bytes=a-" or "bytes=-n" range against a size; undefined for anything else (served whole). */
export function parseRange(spec: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | undefined {
  const m = spec ? /^bytes=(\d*)-(\d*)$/.exec(spec.trim()) : null;
  if (!m || (!m[1] && !m[2])) return undefined;
  let start: number;
  let end: number;
  if (!m[1]) {
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (m[2] && Number(m[2]) < start) return undefined;
  }
  return start >= size || start > end ? 'unsatisfiable' : { start, end };
}

export class LocalBackend implements Backend {
  readonly kind = 'local';
  private readonly dirOf: (ns: string) => string;
  private readonly disk: DiskSpace;

  constructor(dirOf: (ns: string) => string, disk: DiskSpace = realDiskSpace) {
    this.dirOf = dirOf;
    this.disk = disk;
  }

  private fileOf(key: string): string {
    const [ns, name] = splitKey(key);
    return path.join(this.dirOf(ns), name);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.fileOf(key);
    mkdirSync(path.dirname(file), { recursive: true });
    // written aside and moved in, so a half-written file is never served
    await writeFile(`${file}.part`, data);
    await rename(`${file}.part`, file);
  }

  async get(key: string, range?: string): Promise<ObjectRead | undefined> {
    const file = this.fileOf(key);
    const size = await stat(file).then((s) => (s.isFile() ? s.size : undefined), () => undefined);
    if (size === undefined) return undefined;
    const r = parseRange(range, size);
    if (r === 'unsatisfiable') return { unsatisfiable: true, total: size };
    if (!r) return { body: createReadStream(file), length: size, total: size };
    return { body: createReadStream(file, { start: r.start, end: r.end }), length: r.end - r.start + 1, total: size, range: r };
  }

  async head(key: string): Promise<number | undefined> {
    return stat(this.fileOf(key)).then((s) => (s.isFile() ? s.size : undefined), () => undefined);
  }

  async delete(key: string): Promise<void> {
    await rm(this.fileOf(key), { force: true });
  }

  async list(prefix: string): Promise<ListedObject[]> {
    const ns = prefix.replace(/\/$/, '');
    const dir = this.dirOf(ns);
    const out: ListedObject[] = [];
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const s = await stat(path.join(dir, name)).catch(() => undefined);
      if (s?.isFile()) out.push({ key: `${ns}/${name}`, size: s.size, modifiedMs: s.mtimeMs });
    }
    return out;
  }

  async check(): Promise<void> {
    for (const ns of ['media', 'cloud']) {
      const key = `${ns}/.slashclient-test-${randomBytes(6).toString('hex')}`;
      const data = Buffer.from('SlashClient');
      try {
        await this.put(key, data);
        if (!(await readFile(this.fileOf(key))).equals(data)) throw new Error('odczytany plik testowy różni się od zapisanego');
      } finally {
        await this.delete(key).catch(() => undefined);
      }
    }
  }

  space(ns: string) {
    const dir = this.dirOf(ns);
    mkdirSync(dir, { recursive: true });
    return this.disk(dir);
  }
}

// ---------- secrets of the buckets ----------

/** Seals the buckets' keys in the database (AES-256-GCM); the key itself is only in the environment. */
export interface SecretBox {
  seal(text: string, aad: string): string;
  open(sealed: string, aad: string): string;
}

/**
 * The box from STORAGE_SECRET_KEY: 32 bytes as base64 (`openssl rand -base64 32`) or hex.
 * Answers an error text when the key is set but is not such a value.
 */
export function secretBox(raw: string | undefined): { box?: SecretBox; error?: string } {
  if (!raw?.trim()) return {};
  const text = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(text) ? Buffer.from(text, 'hex') : Buffer.from(text, 'base64');
  if (key.length !== 32) return { error: 'STORAGE_SECRET_KEY musi mieć 32 bajty (wygeneruj: openssl rand -base64 32).' };
  // a short fingerprint ties sealed values to this key, so a changed key is reported, not a garbled secret
  const tag = createHash('sha256').update(key).digest('hex').slice(0, 8);
  return {
    box: {
      seal(plain, aad) {
        const iv = randomBytes(12);
        const c = createCipheriv('aes-256-gcm', key, iv);
        c.setAAD(Buffer.from(aad));
        const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
        return `v1:${tag}:${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')}`;
      },
      open(sealed, aad) {
        const [v, t, data] = sealed.split(':');
        if (v !== 'v1' || !data) throw new Error('nieznany format sekretu');
        if (t !== tag) throw new Error('sekret zapisano innym kluczem STORAGE_SECRET_KEY');
        const buf = Buffer.from(data, 'base64');
        const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
        d.setAAD(Buffer.from(aad));
        d.setAuthTag(buf.subarray(12, 28));
        return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
      },
    },
  };
}

// ---------- the backends the admin set up ----------

export type BackendType = 'local' | 'r2' | 'b2' | 's3';
export const BACKEND_TYPES: BackendType[] = ['local', 'r2', 'b2', 's3'];

export interface BackendRow {
  id: string;
  type: BackendType;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  /** Sealed access key id and secret (SecretBox); '' when not set. */
  keyId: string;
  secret: string;
  /** The last 4 characters of the access key id, all the panel ever shows of it. */
  keyHint: string;
  prefix: string;
  pathStyle: boolean;
  /** A local backend's folder ('' for the built-in one, which uses MEDIA_DIR and CLOUD_DIR). */
  dir: string;
  /** Bytes it may hold, 0 = no limit. */
  capacity: number;
  enabled: boolean;
  /** Lower goes first. */
  priority: number;
  createdAt: number;
  updatedAt: number;
}

/** The built-in backend: the folders on the server's disk that files always went to. */
export const BUILTIN = 'local';

/** Adds a column to a table that does not have it yet (older databases). */
export function addColumn(sql: DatabaseSync, table: string, column: string, definition: string) {
  const cols = sql.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** What a kind of file (media.ts, profileCloud.ts) tells the storage about its rows. */
export interface StorageTenant {
  /** Files and bytes per backend and kind ("image", "clip", "profile"). */
  usage(): { store: string; kind: string; files: number; bytes: number }[];
  /** Files and bytes per account, for the biggest users. */
  owners(): { owner: string; files: number; bytes: number }[];
  /** What one backend holds: a row (`ref`), its keys (the first one must be there) and bytes. */
  held(store: string): { ref: string; keys: string[]; bytes: number }[];
  /** Points a row at another backend; false when the row changed or went away meanwhile. */
  relocate(ref: string, from: string, to: string): boolean;
}

export interface MoveState {
  from: string;
  to: string;
  total: number;
  done: number;
  failed: number;
  bytes: number;
  running: boolean;
  /** Why it stopped early ("storage_full", "stopped", a message). */
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface StorageOptions {
  sql: DatabaseSync;
  /** The built-in backend's folder per namespace: { media: MEDIA_DIR, cloud: CLOUD_DIR }. */
  localDirs: Record<string, string>;
  /** STORAGE_SECRET_KEY, for the buckets' keys. */
  secretKey?: string;
  /** The server's disk is never filled below this (default 2 GB). */
  minFreeBytes?: number;
  /** Tests swap the disk's numbers. */
  diskSpace?: DiskSpace;
  /** Tests: buckets at plain http://127.0.0.1 (a fake S3). */
  localHttp?: boolean;
  fail: (status: number, code: string) => never;
}

export const DEFAULT_MIN_FREE = 2 * 1024 ** 3;

const ROW_COLUMNS = `id, type, name, endpoint, region, bucket, key_id AS keyId, secret, key_hint AS keyHint, prefix, path_style AS pathStyle, dir, capacity,
  enabled, priority, created_at AS createdAt, updated_at AS updatedAt`;

export class Storage {
  readonly sql: DatabaseSync;
  readonly minFree: number;
  readonly box?: SecretBox;
  /** Set when STORAGE_SECRET_KEY is there but unusable. */
  readonly keyError?: string;
  readonly localDirs: Record<string, string>;
  readonly localHttp: boolean;
  /** Total and free bytes of the disk under a folder (statfs; tests swap it). */
  readonly disk: DiskSpace;
  private readonly fail: (status: number, code: string) => never;
  private readonly tenants: StorageTenant[] = [];
  private readonly cache = new Map<string, { at: number; backend?: Backend; problem?: string }>();
  /** Bytes of uploads being written now, per backend: counted as used until their rows exist. */
  private readonly reserved = new Map<string, number>();
  move?: MoveState;
  private stopMove = false;

  constructor(o: StorageOptions) {
    this.sql = o.sql;
    this.localDirs = o.localDirs;
    this.localHttp = !!o.localHttp;
    this.minFree = o.minFreeBytes ?? DEFAULT_MIN_FREE;
    this.disk = o.diskSpace ?? realDiskSpace;
    this.fail = o.fail;
    const key = secretBox(o.secretKey);
    this.box = key.box;
    this.keyError = key.error;
    if (key.error) console.error(`przechowywanie: ${key.error}`);
    for (const dir of Object.values(o.localDirs)) mkdirSync(dir, { recursive: true });
    o.sql.exec(`
CREATE TABLE IF NOT EXISTS storage_backends (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, endpoint TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', bucket TEXT NOT NULL DEFAULT '',
  key_id TEXT NOT NULL DEFAULT '', secret TEXT NOT NULL DEFAULT '', key_hint TEXT NOT NULL DEFAULT '', prefix TEXT NOT NULL DEFAULT '', path_style INTEGER NOT NULL DEFAULT 1,
  dir TEXT NOT NULL DEFAULT '', capacity INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, priority INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    // the server's own disk is always there; the panel may limit, reorder or switch it off, not remove it
    o.sql.prepare(`INSERT OR IGNORE INTO storage_backends (id, type, name, priority, created_at, updated_at) VALUES (?, 'local', 'Dysk serwera', 100, ?, ?)`).run(BUILTIN, Date.now(), Date.now());
  }

  register(tenant: StorageTenant) {
    this.tenants.push(tenant);
  }

  rows(): BackendRow[] {
    const rows = this.sql.prepare(`SELECT ${ROW_COLUMNS} FROM storage_backends ORDER BY priority, created_at`).all() as unknown as BackendRow[];
    return rows.map((r) => ({ ...r, pathStyle: !!r.pathStyle, enabled: !!r.enabled }));
  }

  row(id: string): BackendRow | undefined {
    return this.rows().find((r) => r.id === id);
  }

  /** Saves a backend (new or changed) and forgets its client, so the next use builds a new one. */
  save(r: BackendRow) {
    this.sql.prepare(`INSERT INTO storage_backends (id, type, name, endpoint, region, bucket, key_id, secret, key_hint, prefix, path_style, dir, capacity, enabled, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET type = excluded.type, name = excluded.name, endpoint = excluded.endpoint, region = excluded.region, bucket = excluded.bucket,
      key_id = excluded.key_id, secret = excluded.secret, key_hint = excluded.key_hint, prefix = excluded.prefix, path_style = excluded.path_style, dir = excluded.dir,
      capacity = excluded.capacity, enabled = excluded.enabled, priority = excluded.priority, updated_at = excluded.updated_at`)
      .run(r.id, r.type, r.name, r.endpoint, r.region, r.bucket, r.keyId, r.secret, r.keyHint, r.prefix, r.pathStyle ? 1 : 0, r.dir, r.capacity, r.enabled ? 1 : 0, r.priority, r.createdAt, r.updatedAt);
    this.cache.delete(r.id);
  }

  removeRow(id: string) {
    this.sql.prepare('DELETE FROM storage_backends WHERE id = ?').run(id);
    this.cache.delete(id);
  }

  /** A client for a row (not cached): a bucket needs its keys opened with STORAGE_SECRET_KEY. */
  build(r: BackendRow): { backend?: Backend; problem?: string } {
    if (r.type === 'local') {
      if (r.id === BUILTIN) return { backend: new LocalBackend((ns) => this.localDirs[ns] ?? path.join(Object.values(this.localDirs)[0], ns), this.disk) };
      return { backend: new LocalBackend((ns) => path.join(r.dir, ns), this.disk) };
    }
    if (!r.keyId || !r.secret) return { problem: 'Brak klucza dostępu.' };
    if (!this.box) return { problem: this.keyError ?? 'Brak STORAGE_SECRET_KEY na serwerze: klucze tego miejsca nie dają się odczytać.' };
    try {
      const endpoint = cleanEndpoint(r.endpoint, this.localHttp);
      if (!endpoint) return { problem: 'Zły adres endpointu.' };
      return {
        backend: new S3Backend({
          endpoint, region: r.region, bucket: r.bucket, prefix: r.prefix, pathStyle: r.pathStyle,
          accessKeyId: this.box.open(r.keyId, `${r.id}:key`), secretAccessKey: this.box.open(r.secret, `${r.id}:secret`),
        }),
      };
    } catch (err) {
      return { problem: `Nie da się odczytać klucza: ${(err as Error).message}.` };
    }
  }

  /** The client of a backend, or why there is none. */
  instance(id: string): { backend?: Backend; problem?: string } {
    const r = this.row(id);
    if (!r) return { problem: 'Nie ma takiego miejsca.' };
    const hit = this.cache.get(id);
    if (hit && hit.at === r.updatedAt) return hit;
    const built = { at: r.updatedAt, ...this.build(r) };
    this.cache.set(id, built);
    return built;
  }

  /** Where a file's row says it is; undefined when that backend is gone or unusable. */
  backend(store: string): Backend | undefined {
    return this.instance(store).backend;
  }

  /** Files and bytes per backend, all kinds together and per kind. */
  usage(): Map<string, { files: number; bytes: number; kinds: Record<string, { files: number; bytes: number }> }> {
    const out = new Map<string, { files: number; bytes: number; kinds: Record<string, { files: number; bytes: number }> }>();
    for (const t of this.tenants) {
      for (const u of t.usage()) {
        const s = out.get(u.store) ?? { files: 0, bytes: 0, kinds: {} };
        s.files += u.files;
        s.bytes += u.bytes;
        const k = (s.kinds[u.kind] ??= { files: 0, bytes: 0 });
        k.files += u.files;
        k.bytes += u.bytes;
        out.set(u.store, s);
      }
    }
    return out;
  }

  /** The accounts that use the most space, with their handles. */
  topOwners(limit = 10): { owner: string; handle: string | null; files: number; bytes: number }[] {
    const sum = new Map<string, { files: number; bytes: number }>();
    for (const t of this.tenants) {
      for (const o of t.owners()) {
        const s = sum.get(o.owner) ?? { files: 0, bytes: 0 };
        s.files += o.files;
        s.bytes += o.bytes;
        sum.set(o.owner, s);
      }
    }
    const handle = this.sql.prepare('SELECT handle FROM users WHERE uuid = ?');
    return [...sum].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, limit)
      .map(([owner, s]) => ({ owner, handle: (handle.get(owner) as { handle: string } | undefined)?.handle ?? null, ...s }));
  }

  private reserve(store: string, bytes: number): () => void {
    this.reserved.set(store, (this.reserved.get(store) ?? 0) + bytes);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.reserved.set(store, (this.reserved.get(store) ?? 0) - bytes);
    };
  }

  /** Whether a backend can take `bytes` more in namespace `ns` (its capacity, and the disk's floor); uploads under way count too. */
  async hasRoom(r: BackendRow, backend: Backend, bytes: number, ns: string, used = this.usage()): Promise<boolean> {
    const pending = this.reserved.get(r.id) ?? 0;
    if (r.capacity > 0 && (used.get(r.id)?.bytes ?? 0) + pending + bytes > r.capacity) return false;
    if (backend.space) {
      const s = await backend.space(ns).catch(() => undefined);
      if (!s || s.free - pending - bytes < this.minFree) return false;
    }
    return true;
  }

  /**
   * Writes a new file's objects to the first enabled backend with room, trying the next one when
   * a write fails, and calls `commit` (which saves the row) before the room it took is released.
   * Fails with 507 storage_full when no backend has room, 503 storage_unavailable when all failed.
   */
  async place<T>(objects: { key: string; data: Buffer; type?: string }[], commit: (store: string) => T): Promise<T> {
    const bytes = objects.reduce((sum, o) => sum + o.data.length, 0);
    const ns = splitKey(objects[0].key)[0];
    const used = this.usage();
    let tried = false;
    for (const r of this.rows()) {
      if (!r.enabled) continue;
      const { backend } = this.instance(r.id);
      if (!backend) continue;
      // taken before looking, so two uploads at once cannot both count the same room
      const release = this.reserve(r.id, bytes);
      if (!(await this.hasRoom(r, backend, 0, ns, used))) {
        release();
        continue;
      }
      tried = true;
      const written: string[] = [];
      try {
        for (const o of objects) {
          await backend.put(o.key, o.data, o.type);
          written.push(o.key);
        }
        return commit(r.id);
      } catch (err) {
        console.error(`przechowywanie (${r.name}): zapis nie udał się: ${(err as Error).message}`);
        for (const key of written) await backend.delete(key).catch(() => undefined);
      } finally {
        release();
      }
    }
    return this.fail(tried ? 503 : 507, tried ? 'storage_unavailable' : 'storage_full');
  }

  /** Deletes a file's objects where they are; a failure is left to the hourly cleanup. */
  async remove(store: string, keys: string[]) {
    const backend = this.backend(store);
    if (!backend) return;
    for (const key of keys) {
      await backend.delete(key).catch((err) => console.error(`przechowywanie: nie usunięto ${key}: ${(err as Error).message}`));
    }
  }

  /**
   * Drops what no row points at in one namespace of every backend (files of deleted accounts,
   * uploads cut short, copies left by a move), once it is an hour old: an upload being written
   * right now has no row yet.
   */
  async sweep(ns: string, known: (store: string, name: string) => boolean, now = Date.now()) {
    for (const r of this.rows()) {
      const { backend } = this.instance(r.id);
      if (!backend) continue;
      let items: ListedObject[];
      try {
        items = await backend.list(`${ns}/`);
      } catch (err) {
        console.error(`przechowywanie (${r.name}): nie da się wylistować: ${(err as Error).message}`);
        continue;
      }
      for (const it of items) {
        const name = it.key.slice(ns.length + 1);
        if (!name || name.includes('/') || known(r.id, name) || now - it.modifiedMs <= 3_600_000) continue;
        await backend.delete(it.key).catch(() => undefined);
      }
    }
  }

  /** Starts moving every file from one backend to another in the background; progress is in `move`. */
  startMove(from: string, to: string) {
    if (this.move?.running) this.fail(409, 'storage_moving');
    const items = this.tenants.flatMap((t) => t.held(from).map((h) => ({ ...h, tenant: t })));
    this.move = { from, to, total: items.length, done: 0, failed: 0, bytes: 0, running: true, startedAt: Date.now() };
    this.stopMove = false;
    const state = this.move;
    void this.runMove(state, items).catch((err) => {
      state.error = (err as Error).message;
    }).finally(() => {
      state.running = false;
      state.finishedAt = Date.now();
    });
    return state;
  }

  cancelMove() {
    if (this.move?.running) this.stopMove = true;
  }

  private async runMove(state: MoveState, items: { ref: string; keys: string[]; bytes: number; tenant: StorageTenant }[]) {
    const source = this.backend(state.from);
    const target = this.backend(state.to);
    const targetRow = this.row(state.to);
    if (!source || !target || !targetRow) throw new Error('miejsce jest niedostępne');
    for (const it of items) {
      if (this.stopMove) {
        state.error = 'stopped';
        return;
      }
      const ns = splitKey(it.keys[0])[0];
      const release = this.reserve(state.to, it.bytes);
      if (!(await this.hasRoom(targetRow, target, 0, ns))) {
        release();
        state.error = 'storage_full';
        return;
      }
      const copied: string[] = [];
      try {
        for (const [i, key] of it.keys.entries()) {
          const data = await readAll(source, key);
          if (!data) {
            // the main file must be there; a missing preview is not worth stopping for
            if (i === 0) throw new Error(`brak pliku ${key}`);
            continue;
          }
          await target.put(key, data);
          copied.push(key);
        }
        if (it.tenant.relocate(it.ref, state.from, state.to)) {
          for (const key of it.keys) await source.delete(key).catch(() => undefined);
          state.bytes += it.bytes;
        } else {
          // deleted or replaced meanwhile: the copy is not needed
          for (const key of copied) await target.delete(key).catch(() => undefined);
        }
        state.done++;
      } catch (err) {
        console.error(`przechowywanie: przenoszenie ${it.keys[0]}: ${(err as Error).message}`);
        for (const key of copied) await target.delete(key).catch(() => undefined);
        state.failed++;
      } finally {
        release();
      }
    }
  }
}

/** A whole object in memory (moves only; the biggest file is a 90 MB clip). */
export async function readAll(backend: Backend, key: string): Promise<Buffer | undefined> {
  const read = await backend.get(key);
  if (!read || 'unsatisfiable' in read) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of read.body) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Sends an object with the caller's headers (type, nosniff, CSP…): HEAD, and with `ranges` a
 * single byte range (206, or 416). Answers false when there is no such object (the caller says
 * 404); when the backend does not answer, the player gets 503 storage_unavailable.
 */
export async function sendObject(req: http.IncomingMessage, res: http.ServerResponse, backend: Backend | undefined, key: string,
  headers: Record<string, string | number>, opts: { ranges?: boolean } = {}): Promise<boolean> {
  if (!backend) return false;
  const extra: Record<string, string | number> = opts.ranges ? { 'Accept-Ranges': 'bytes' } : {};
  try {
    if (req.method === 'HEAD') {
      const size = await backend.head(key);
      if (size === undefined) return false;
      res.writeHead(200, { ...headers, ...extra, 'Content-Length': size });
      res.end();
      return true;
    }
    const range = opts.ranges && typeof req.headers.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range.trim()) ? req.headers.range.trim() : undefined;
    const read = await backend.get(key, range);
    if (!read) return false;
    if ('unsatisfiable' in read) {
      res.writeHead(416, { ...headers, ...extra, 'Content-Range': `bytes */${read.total}` });
      res.end();
      return true;
    }
    const out: Record<string, string | number> = { ...headers, ...extra };
    if (read.length !== undefined) out['Content-Length'] = read.length;
    if (read.range) out['Content-Range'] = `bytes ${read.range.start}-${read.range.end}/${read.total ?? '*'}`;
    res.writeHead(read.range ? 206 : 200, out);
    pipeline(read.body, res, () => undefined);
    return true;
  } catch (err) {
    console.error(`przechowywanie: odczyt ${key}: ${(err as Error).message}`);
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'storage_unavailable' }));
    } else res.destroy();
    return true;
  }
}
