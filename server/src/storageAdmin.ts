import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import path from 'node:path';
import { S3Backend, S3Error, cleanEndpoint } from './s3.ts';
import { BACKEND_TYPES, BUILTIN, LocalBackend, type Backend, type BackendRow, type BackendType, type Storage } from './storage.ts';

/**
 * The admin panel's "Miejsce na pliki": what each storage backend holds and how full it is, the
 * server's disk, the biggest users, and adding, changing, testing, switching off and removing
 * backends, plus moving all files from one backend to another. A bucket's access key id and
 * secret are write-only: they are sealed with STORAGE_SECRET_KEY before they reach the database
 * and never sent back (the panel sees "set" and the key id's last 4 characters).
 */

export interface StorageAdminContext {
  storage: Storage;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  /** The folder of the database, for the disk's numbers. */
  dataDir: string;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const ID = '(local|s_[0-9a-f]{8})';
const BUCKET = /^[A-Za-z0-9][A-Za-z0-9._-]{1,62}$/;
const REGION = /^[a-z0-9-]{1,40}$/;
const PREFIX_PART = /^[A-Za-z0-9._-]+$/;
const TYPE_NAMES: Record<BackendType, string> = { local: 'folder na serwerze', r2: 'Cloudflare R2', b2: 'Backblaze B2', s3: 'S3' };

export function storageAdminRoutes(ctx: StorageAdminContext): [string, RegExp, Handler][] {
  const { storage } = ctx;
  const rowOr404 = (id: string) => storage.row(id) ?? ctx.fail(404, 'not_found');
  const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

  /** What the panel sees of a backend: everything but the keys. */
  async function view(r: BackendRow, usage: ReturnType<Storage['usage']>) {
    const { backend, problem } = storage.instance(r.id);
    const u = usage.get(r.id) ?? { files: 0, bytes: 0, kinds: {} };
    const space = backend?.space ? await backend.space('media').catch(() => undefined) : undefined;
    return {
      id: r.id, type: r.type, name: r.name, endpoint: r.endpoint, region: r.region, bucket: r.bucket, prefix: r.prefix, pathStyle: r.pathStyle,
      dir: r.id === BUILTIN ? Object.values(storage.localDirs).join(', ') : r.dir, capacity: r.capacity, enabled: r.enabled, priority: r.priority,
      builtin: r.id === BUILTIN, keyIdHint: r.keyHint, keyIdSet: !!r.keyId, secretSet: !!r.secret,
      available: !!backend, problem: problem ?? null, used: u.bytes, files: u.files, kinds: u.kinds, disk: space ?? null,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  }

  /**
   * A backend from the panel's form, on top of what it was (when changed). Fails with a code the
   * panel shows; keys left empty stay as they were.
   */
  function fromBody(b: Record<string, unknown>, was?: BackendRow): { row: BackendRow; keyId?: string; secret?: string } {
    const type = (str(b.type) ?? was?.type) as BackendType;
    if (!BACKEND_TYPES.includes(type) || (was && was.id === BUILTIN && type !== 'local')) ctx.fail(400, 'storage_bad_type');
    const name = str(b.name, 40) ?? was?.name ?? '';
    if (!name) ctx.fail(400, 'storage_bad_name');
    const now = Date.now();
    const row: BackendRow = {
      id: was?.id ?? `s_${randomBytes(4).toString('hex')}`, type, name,
      endpoint: '', region: '', bucket: '', keyId: was?.keyId ?? '', secret: was?.secret ?? '', keyHint: was?.keyHint ?? '', prefix: '', pathStyle: true, dir: '',
      capacity: was?.capacity ?? 0, enabled: was?.enabled ?? true, priority: was?.priority ?? (type === 'local' ? 100 : 10),
      createdAt: was?.createdAt ?? now, updatedAt: Math.max(now, (was?.updatedAt ?? 0) + 1),
    };
    if (b.capacity !== undefined) {
      const c = Number(b.capacity);
      if (!Number.isSafeInteger(c) || c < 0) ctx.fail(400, 'storage_bad_capacity');
      row.capacity = c;
    }
    if (b.priority !== undefined) {
      const p = Number(b.priority);
      if (!Number.isInteger(p) || p < -1000 || p > 1000) ctx.fail(400, 'storage_bad_priority');
      row.priority = p;
    }
    if (typeof b.enabled === 'boolean') row.enabled = b.enabled;
    let keyId: string | undefined;
    let secret: string | undefined;
    if (type === 'local') {
      row.keyId = row.secret = row.keyHint = '';
      if (row.id !== BUILTIN) {
        const dir = str(b.dir, 400) ?? was?.dir ?? '';
        if (!dir || !path.isAbsolute(dir)) ctx.fail(400, 'storage_bad_dir');
        row.dir = path.resolve(dir);
      }
    } else {
      const endpoint = cleanEndpoint(str(b.endpoint) ?? was?.endpoint ?? '', storage.localHttp);
      if (!endpoint) ctx.fail(400, 'storage_bad_endpoint');
      row.endpoint = endpoint;
      let region = str(b.region, 40) ?? was?.region ?? '';
      if (!region && type === 'r2') region = 'auto';
      if (!region && type === 'b2') region = /^https:\/\/s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(endpoint)?.[1] ?? '';
      if (!REGION.test(region)) ctx.fail(400, 'storage_bad_region');
      row.region = region;
      const bucket = str(b.bucket, 63) ?? was?.bucket ?? '';
      if (!BUCKET.test(bucket)) ctx.fail(400, 'storage_bad_bucket');
      row.bucket = bucket;
      const prefix = (str(b.prefix, 100) ?? was?.prefix ?? '').replace(/^\/+|\/+$/g, '');
      if (prefix && prefix.split('/').some((p) => !PREFIX_PART.test(p) || p === '.' || p === '..')) ctx.fail(400, 'storage_bad_prefix');
      row.prefix = prefix ? `${prefix}/` : '';
      row.pathStyle = typeof b.pathStyle === 'boolean' ? b.pathStyle : was?.pathStyle ?? true;
      keyId = str(b.keyId, 200) || undefined;
      secret = str(b.secret, 300) || undefined;
      // a bucket that changed its type keeps no keys of the old one
      if (was && was.type !== type) row.keyId = row.secret = row.keyHint = '';
    }
    return { row, keyId, secret };
  }

  /** Two backends on the same folder or the same bucket and prefix would clean each other's files away. */
  function overlaps(r: BackendRow): boolean {
    const nsDirs = (x: BackendRow) => (x.id === BUILTIN ? Object.values(storage.localDirs) : ['media', 'cloud'].map((ns) => path.join(x.dir, ns))).map((d) => path.resolve(d).toLowerCase());
    for (const o of storage.rows()) {
      if (o.id === r.id) continue;
      if (r.type === 'local' && o.type === 'local') {
        const mine = nsDirs(r);
        if (nsDirs(o).some((d) => mine.some((m) => m === d || m.startsWith(d + path.sep) || d.startsWith(m + path.sep)))) return true;
      } else if (r.type !== 'local' && o.type !== 'local') {
        if (new URL(o.endpoint).host === new URL(r.endpoint).host && o.bucket === r.bucket && (o.prefix.startsWith(r.prefix) || r.prefix.startsWith(o.prefix))) return true;
      }
    }
    return false;
  }

  /** Seals new keys into the row (the key id's last 4 characters stay readable). */
  function seal(row: BackendRow, keyId?: string, secret?: string) {
    if (row.type === 'local') return;
    if ((keyId || secret) && !storage.box) ctx.fail(409, 'storage_no_key');
    if (keyId) {
      row.keyId = storage.box!.seal(keyId, `${row.id}:key`);
      row.keyHint = keyId.slice(-4);
    }
    if (secret) row.secret = storage.box!.seal(secret, `${row.id}:secret`);
    if (!row.keyId || !row.secret) ctx.fail(400, 'storage_need_keys');
  }

  const changes = (was: BackendRow, now: BackendRow, keys: boolean) => {
    const out: string[] = [];
    for (const k of ['type', 'name', 'endpoint', 'region', 'bucket', 'prefix', 'pathStyle', 'dir', 'capacity', 'enabled', 'priority'] as const) {
      if (was[k] !== now[k]) out.push(`${k}: ${String(was[k]) || '—'} → ${String(now[k]) || '—'}`);
    }
    if (keys) out.push('klucze zmienione');
    return out.join(', ');
  };

  /** Runs the backend's check (write, read back, delete a small file), within 20 seconds. */
  async function check(backend: Backend) {
    const started = Date.now();
    try {
      await Promise.race([backend.check(), new Promise((_, reject) => setTimeout(() => reject(new Error('brak odpowiedzi w 20 s')), 20_000).unref())]);
      return { ok: true, ms: Date.now() - started };
    } catch (err) {
      const e = err as Error & { cause?: { code?: string; message?: string } };
      return { ok: false, ms: Date.now() - started, code: err instanceof S3Error ? err.code : e.cause?.code ?? '', error: e.cause?.message ? `${e.message}: ${e.cause.message}` : e.message };
    }
  }

  return [
    ['GET', /^\/v1\/admin\/storage$/, async (req) => {
      ctx.admin(req);
      const usage = storage.usage();
      const kinds: Record<string, { files: number; bytes: number }> = {};
      for (const u of usage.values()) {
        for (const [k, v] of Object.entries(u.kinds)) {
          const t = (kinds[k] ??= { files: 0, bytes: 0 });
          t.files += v.files;
          t.bytes += v.bytes;
        }
      }
      const backends = await Promise.all(storage.rows().map((r) => view(r, usage)));
      // files whose backend was removed some other way (by hand in the database) are still counted
      const orphaned = [...usage].filter(([id]) => !backends.some((b) => b.id === id)).map(([id, u]) => ({ id, files: u.files, bytes: u.bytes }));
      return {
        backends, kinds, orphaned,
        disk: { ...(await storage.disk(ctx.dataDir).catch(() => ({ total: 0, free: 0 }))), minFree: storage.minFree },
        top: storage.topOwners(10).map(({ owner: _owner, ...t }) => t),
        secretKey: { set: !!storage.box, error: storage.keyError ?? null },
        move: storage.move ?? null,
      };
    }],
    // the check, for a backend being filled in (keys typed now) or a saved one (`id`: its keys)
    ['POST', /^\/v1\/admin\/storage\/test$/, async (req) => {
      ctx.admin(req);
      const b = await ctx.body(req);
      const was = typeof b.id === 'string' ? rowOr404(b.id) : undefined;
      const { row, keyId, secret } = fromBody(b, was);
      let backend: Backend;
      if (row.type === 'local') backend = row.id === BUILTIN ? storage.build(row).backend! : new LocalBackend((ns) => path.join(row.dir, ns), storage.disk);
      else {
        // the saved keys are opened only for this check and never leave the server
        const open = (sealed: string, what: string) => (sealed && storage.box ? storage.box.open(sealed, `${row.id}:${what}`) : '');
        let accessKeyId: string;
        let secretAccessKey: string;
        try {
          accessKeyId = keyId ?? open(row.keyId, 'key');
          secretAccessKey = secret ?? open(row.secret, 'secret');
        } catch {
          return { ok: false, ms: 0, code: 'storage_no_key', error: 'Zapisanego klucza nie da się odczytać (inny STORAGE_SECRET_KEY?). Wpisz klucze ponownie.' };
        }
        if (!accessKeyId || !secretAccessKey) ctx.fail(400, 'storage_need_keys');
        backend = new S3Backend({ endpoint: row.endpoint, region: row.region, bucket: row.bucket, prefix: row.prefix, pathStyle: row.pathStyle, accessKeyId, secretAccessKey });
      }
      return check(backend);
    }],
    ['POST', /^\/v1\/admin\/storage$/, async (req) => {
      const me = ctx.admin(req);
      const b = await ctx.body(req);
      const { row, keyId, secret } = fromBody(b);
      if (overlaps(row)) ctx.fail(409, 'storage_duplicate');
      seal(row, keyId, secret);
      storage.save(row);
      ctx.audit(me, 'storage_add', row.name, `${TYPE_NAMES[row.type]}${row.bucket ? `, ${row.bucket}` : row.dir ? `, ${row.dir}` : ''}`);
      return view(row, storage.usage());
    }],
    ['POST', new RegExp(`^/v1/admin/storage/${ID}$`), async (req, [id]) => {
      const me = ctx.admin(req);
      const was = rowOr404(id);
      const b = await ctx.body(req);
      const { row, keyId, secret } = fromBody(b, was);
      // with files there, where they are may not change (they would be lost); the address and keys may
      const files = storage.usage().get(id)?.files ?? 0;
      if (files && (row.type !== was.type || row.bucket !== was.bucket || row.prefix !== was.prefix || row.dir !== was.dir)) ctx.fail(409, 'storage_in_use');
      if (overlaps(row)) ctx.fail(409, 'storage_duplicate');
      seal(row, keyId, secret);
      storage.save(row);
      const detail = changes(was, row, !!(keyId || secret));
      if (detail) ctx.audit(me, 'storage_edit', row.name, detail);
      return view(row, storage.usage());
    }],
    ['DELETE', new RegExp(`^/v1/admin/storage/${ID}$`), (req, [id]) => {
      const me = ctx.admin(req);
      const r = rowOr404(id);
      if (id === BUILTIN) ctx.fail(400, 'storage_builtin');
      // its files would be lost: switch it off (no new files) or move them first
      if (storage.usage().get(id)?.files) ctx.fail(409, 'storage_in_use');
      if (storage.move?.running && (storage.move.from === id || storage.move.to === id)) ctx.fail(409, 'storage_moving');
      storage.removeRow(id);
      ctx.audit(me, 'storage_remove', r.name, TYPE_NAMES[r.type]);
      return { ok: true };
    }],
    ['POST', new RegExp(`^/v1/admin/storage/${ID}/move$`), async (req, [id]) => {
      const me = ctx.admin(req);
      const from = rowOr404(id);
      const { to } = await ctx.body(req);
      const target = typeof to === 'string' ? storage.row(to) : undefined;
      if (!target || target.id === from.id) ctx.fail(400, 'storage_bad_target');
      if (!storage.backend(from.id) || !storage.backend(target.id)) ctx.fail(409, 'storage_unavailable');
      const state = storage.startMove(from.id, target.id);
      ctx.audit(me, 'storage_move', from.name, `→ ${target.name} (${state.total} plików)`);
      return { move: state };
    }],
    ['POST', /^\/v1\/admin\/storage\/move\/stop$/, (req) => {
      const me = ctx.admin(req);
      if (storage.move?.running) {
        storage.cancelMove();
        ctx.audit(me, 'storage_move_stop', storage.row(storage.move.from)?.name ?? storage.move.from);
      }
      return { move: storage.move ?? null };
    }],
  ];
}
