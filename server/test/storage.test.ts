import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { EMPTY_SHA256, S3Backend, S3Error, cleanEndpoint, signV4 } from '../src/s3.ts';
import { BUILTIN, LocalBackend, Storage, parseRange, readAll, secretBox, type BackendRow, type StorageTenant } from '../src/storage.ts';
import { startFakeS3, type FakeS3 } from './fakeS3.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-storage-'));
const KEY = Buffer.alloc(32, 7).toString('base64');
let fake: FakeS3;

before(async () => {
  fake = await startFakeS3({ bucket: 'slash-test', region: 'auto', keys: { AKTEST: 'sekret-testowy' } });
});
after(async () => {
  await fake.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('AWS Signature Version 4', () => {
  // AWS's examples: S3 API Reference, "Signature Calculations for the Authorization Header"
  const s3 = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 's3', date: new Date('2013-05-24T00:00:00Z') };
  const signature = (h: Record<string, string>) => /Signature=([0-9a-f]+)$/.exec(h.authorization)?.[1];

  it('signs the GET Object example', () => {
    const h = signV4({ ...s3, method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'), payloadHash: EMPTY_SHA256, headers: { Range: 'bytes=0-9', 'x-amz-content-sha256': EMPTY_SHA256 } });
    assert.equal(signature(h), 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
    assert.match(h.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/);
    assert.equal(h['x-amz-date'], '20130524T000000Z');
  });

  it('signs the PUT Object example', () => {
    const hash = createHash('sha256').update('Welcome to Amazon S3.').digest('hex');
    const h = signV4({ ...s3, method: 'PUT', url: new URL('https://examplebucket.s3.amazonaws.com/test%24file.text'), payloadHash: hash,
      headers: { Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY', 'x-amz-content-sha256': hash } });
    assert.equal(signature(h), '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
  });

  it('signs the GET Bucket (list objects) example, with a query', () => {
    const h = signV4({ ...s3, method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J'), payloadHash: EMPTY_SHA256, headers: { 'x-amz-content-sha256': EMPTY_SHA256 } });
    assert.equal(signature(h), '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
  });

  it('signs the get-vanilla case of the SigV4 test suite', () => {
    const h = signV4({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 'service',
      date: new Date('2015-08-30T12:36:00Z'), method: 'GET', url: new URL('https://example.amazonaws.com/'), payloadHash: EMPTY_SHA256, headers: {} });
    assert.equal(h.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });

  it('takes only https endpoints (plain http to this machine for tests)', () => {
    assert.equal(cleanEndpoint('https://abc.r2.cloudflarestorage.com/'), 'https://abc.r2.cloudflarestorage.com');
    assert.equal(cleanEndpoint('https://s3.eu-central-003.backblazeb2.com'), 'https://s3.eu-central-003.backblazeb2.com');
    assert.equal(cleanEndpoint('http://example.com'), undefined);
    assert.equal(cleanEndpoint('http://127.0.0.1:9000'), undefined);
    assert.equal(cleanEndpoint('http://127.0.0.1:9000', true), 'http://127.0.0.1:9000');
    assert.equal(cleanEndpoint('http://example.com', true), undefined);
    assert.equal(cleanEndpoint('https://user:pw@example.com'), undefined);
    assert.equal(cleanEndpoint('https://example.com/bucket'), undefined);
    assert.equal(cleanEndpoint('nonsense'), undefined);
  });
});

describe('byte ranges', () => {
  it('reads one range, the rest is served whole', () => {
    assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
    assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange('bytes=50-500', 100), { start: 50, end: 99 });
    assert.equal(parseRange('bytes=100-', 100), 'unsatisfiable');
    assert.equal(parseRange('bytes=0-1,5-6', 100), undefined);
    assert.equal(parseRange('items=0-1', 100), undefined);
    assert.equal(parseRange(undefined, 100), undefined);
  });
});

describe('sealed secrets', () => {
  it('round-trips, is tied to its row and its key, and refuses a bad key', () => {
    const { box } = secretBox(KEY);
    assert.ok(box);
    const sealed = box.seal('tajne-haslo', 's_1:secret');
    assert.match(sealed, /^v1:[0-9a-f]{8}:/);
    assert.ok(!sealed.includes('tajne'));
    assert.notEqual(box.seal('tajne-haslo', 's_1:secret'), sealed);
    assert.equal(box.open(sealed, 's_1:secret'), 'tajne-haslo');
    assert.throws(() => box.open(sealed, 's_2:secret'));
    const other = secretBox(Buffer.alloc(32, 9).toString('base64')).box!;
    assert.throws(() => other.open(sealed, 's_1:secret'), /innym kluczem/);
    // hex works too; anything that is not 32 bytes is an error, an empty one is "not set"
    assert.ok(secretBox('ab'.repeat(32)).box);
    assert.match(secretBox('za-krotki').error ?? '', /32 bajty/);
    assert.deepEqual(secretBox(''), {});
  });
});

describe('S3 backend', () => {
  const backend = () => new S3Backend({ endpoint: fake.url, region: 'auto', bucket: 'slash-test', accessKeyId: 'AKTEST', secretAccessKey: 'sekret-testowy', prefix: 'unit/' });

  it('puts, reads (whole and in parts), lists and deletes', async () => {
    const b = backend();
    const data = Buffer.from('0123456789abcdef');
    await b.put('media/abc', data, 'image/png');
    assert.equal(fake.objects.get('unit/media/abc')?.type, 'image/png');
    assert.equal(await b.head('media/abc'), 16);
    assert.equal(await b.head('media/none'), undefined);
    assert.deepEqual(await readAll(b, 'media/abc'), data);
    const part = await b.get('media/abc', 'bytes=2-5');
    assert.ok(part && !('unsatisfiable' in part));
    assert.deepEqual(part.range, { start: 2, end: 5 });
    assert.equal(part.total, 16);
    assert.equal(part.length, 4);
    assert.deepEqual(await readAll({ ...b, get: async () => part } as never, ''), Buffer.from('2345'));
    assert.deepEqual(await b.get('media/abc', 'bytes=99-'), { unsatisfiable: true, total: 16 });
    assert.equal(await b.get('media/none'), undefined);

    // a listing over several pages, with the prefix taken off
    fake.pageSize = 2;
    for (const n of ['b', 'c', 'd']) await b.put(`media/${n}`, Buffer.from(n));
    await b.put('cloud/x.mrpack', Buffer.from('x'));
    const listed = await b.list('media/');
    fake.pageSize = 1000;
    assert.deepEqual(listed.map((o) => o.key).sort(), ['media/abc', 'media/b', 'media/c', 'media/d']);
    assert.ok(listed.every((o) => o.modifiedMs > 0));
    for (const o of [...listed, { key: 'cloud/x.mrpack' }]) await b.delete(o.key);
    assert.equal([...fake.objects.keys()].filter((k) => k.startsWith('unit/')).length, 0);
  });

  it('checks the connection, and says what is wrong', async () => {
    await backend().check();
    assert.equal([...fake.objects.keys()].filter((k) => k.includes('slashclient-test')).length, 0);
    const wrong = new S3Backend({ endpoint: fake.url, region: 'auto', bucket: 'slash-test', accessKeyId: 'AKTEST', secretAccessKey: 'zly' });
    await assert.rejects(wrong.check(), (err: S3Error) => err.code === 'SignatureDoesNotMatch' && err.status === 403);
    const noBucket = new S3Backend({ endpoint: fake.url, region: 'auto', bucket: 'inny', accessKeyId: 'AKTEST', secretAccessKey: 'sekret-testowy' });
    await assert.rejects(noBucket.check(), (err: S3Error) => err.code === 'NoSuchBucket');
  });
});

describe('placing files', () => {
  /** A storage over a fresh database with one tenant whose usage the test sets. */
  function setup(free = 100 * 1024 ** 3) {
    const sql = new DatabaseSync(':memory:');
    sql.exec('CREATE TABLE users (uuid TEXT PRIMARY KEY, handle TEXT)');
    const disk = { free };
    const base = mkdtempSync(path.join(dir, 'place-'));
    const storage = new Storage({
      sql, secretKey: KEY, localDirs: { media: path.join(base, 'media'), cloud: path.join(base, 'cloud') }, minFreeBytes: 1000, localHttp: true,
      diskSpace: async () => ({ total: 10 * 1024 ** 3, free: disk.free }),
      fail: (status, code) => {
        throw Object.assign(new Error(code), { status, code });
      },
    });
    const rows = new Map<string, { store: string; bytes: number }>();
    const tenant: StorageTenant = {
      usage: () => [...rows.values()].map((r) => ({ store: r.store, kind: 'image', files: 1, bytes: r.bytes })),
      owners: () => [],
      held: (store) => [...rows].filter(([, r]) => r.store === store).map(([ref, r]) => ({ ref, keys: [`media/${ref}`], bytes: r.bytes })),
      relocate: (ref, from, to) => {
        const r = rows.get(ref);
        if (r?.store !== from) return false;
        r.store = to;
        return true;
      },
    };
    storage.register(tenant);
    const add = (id: string, bytes: number, at: string) => rows.set(id, { store: at, bytes });
    const put = (id: string, bytes: number) => storage.place([{ key: `media/${id}`, data: Buffer.alloc(bytes) }], (at) => {
      add(id, bytes, at);
      return at;
    });
    const bucket = (id: string, over: Partial<BackendRow> = {}) => {
      const now = Date.now();
      storage.save({
        id, type: 's3', name: id, endpoint: fake.url, region: 'auto', bucket: 'slash-test', keyId: storage.box!.seal('AKTEST', `${id}:key`),
        secret: storage.box!.seal('sekret-testowy', `${id}:secret`), keyHint: 'TEST', prefix: `${id}/`, pathStyle: true, dir: '', capacity: 0, enabled: true,
        priority: 10, createdAt: now, updatedAt: now, ...over,
      });
    };
    return { storage, disk, rows, add, put, bucket, base };
  }
  const local = (s: Storage, over: Partial<BackendRow>) => s.save({ ...s.row(BUILTIN)!, updatedAt: Date.now() + 1, ...over });

  it('starts on the server disk, keeps a free-space floor there', async () => {
    const t = setup();
    assert.equal(await t.put('a', 10), BUILTIN);
    assert.ok(readdirSync(path.join(t.base, 'media')).includes('a'));
    // the disk is nearly full: the floor (1000 bytes free after the write) stops it
    t.disk.free = 1005;
    await assert.rejects(t.put('b', 10), { status: 507, code: 'storage_full' });
    t.disk.free = 1010;
    assert.equal(await t.put('b', 10), BUILTIN);
  });

  it('goes by priority, skips full and switched-off backends', async () => {
    const t = setup();
    t.bucket('s_00000001', { priority: 10, capacity: 100 });
    t.bucket('s_00000002', { priority: 20 });
    assert.equal(await t.put('a', 60), 's_00000001');
    assert.ok(fake.objects.has('s_00000001/media/a'));
    // 60 + 60 > 100: the next one by priority
    assert.equal(await t.put('b', 60), 's_00000002');
    assert.equal(await t.put('c', 40), 's_00000001');
    t.bucket('s_00000002', { priority: 20, enabled: false, updatedAt: Date.now() + 5 });
    assert.equal(await t.put('d', 60), BUILTIN);
    local(t.storage, { enabled: false });
    await assert.rejects(t.put('e', 60), { code: 'storage_full' });
    assert.equal(t.storage.usage().get('s_00000001')?.bytes, 100);
  });

  it('counts uploads under way, so two at once do not both take the last room', async () => {
    const t = setup();
    local(t.storage, { enabled: false });
    t.bucket('s_00000003', { capacity: 100 });
    const results = await Promise.allSettled([t.put('x', 70), t.put('y', 70)]);
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  });

  it('tries the next backend when a write fails, and cleans up after itself', async () => {
    const t = setup();
    t.bucket('s_00000004', { priority: 1 });
    fake.failNext(1);
    assert.equal(await t.put('f', 5), BUILTIN);
    assert.ok(!fake.objects.has('s_00000004/media/f'));
    // nothing else works: 503 instead of "full"
    local(t.storage, { enabled: false });
    fake.failNext(1);
    await assert.rejects(t.put('g', 5), { status: 503, code: 'storage_unavailable' });
  });

  it('reads and deletes where the file is, and a bucket without its key is unusable', async () => {
    const t = setup();
    t.bucket('s_00000005');
    assert.equal(await t.put('r', 3), 's_00000005');
    assert.deepEqual(await readAll(t.storage.backend('s_00000005')!, 'media/r'), Buffer.alloc(3));
    assert.equal(await t.storage.backend(BUILTIN)!.head('media/r'), undefined);
    await t.storage.remove('s_00000005', ['media/r']);
    assert.ok(!fake.objects.has('s_00000005/media/r'));
    assert.equal(t.storage.backend('s_nothere'), undefined);
    // the same database without STORAGE_SECRET_KEY: the bucket is listed but cannot be used
    const blind = new Storage({ sql: t.storage.sql, localDirs: t.storage.localDirs, fail: () => { throw new Error('x'); } });
    assert.equal(blind.backend('s_00000005'), undefined);
    assert.match(blind.instance('s_00000005').problem ?? '', /STORAGE_SECRET_KEY/);
  });

  it('sweeps files no row points at, once they are an hour old, on every backend', async () => {
    const t = setup();
    t.bucket('s_00000006');
    assert.equal(await t.put('keep', 1), 's_00000006');
    const b = t.storage.backend('s_00000006')!;
    await b.put('media/orphan', Buffer.from('o'));
    await b.put('media/fresh', Buffer.from('f'));
    fake.objects.get('s_00000006/media/orphan')!.modifiedMs = Date.now() - 2 * 3_600_000;
    // a copy on another backend than its row says is an orphan there too
    await t.storage.backend(BUILTIN)!.put('media/keep', Buffer.from('k'));
    await t.storage.sweep('media', (store, name) => t.rows.get(name)?.store === store, Date.now() + 0);
    assert.ok(fake.objects.has('s_00000006/media/keep'));
    assert.ok(!fake.objects.has('s_00000006/media/orphan'));
    assert.ok(fake.objects.has('s_00000006/media/fresh'));
    await t.storage.sweep('media', (store, name) => t.rows.get(name)?.store === store, Date.now() + 2 * 3_600_000);
    assert.ok(!readdirSync(path.join(t.base, 'media')).includes('keep'));
    assert.ok(fake.objects.has('s_00000006/media/keep'));
  });

  it('moves every file to another backend in the background', async () => {
    const t = setup();
    local(t.storage, { priority: 1 });
    for (const id of ['m1', 'm2', 'm3']) assert.equal(await t.put(id, 4), BUILTIN);
    t.bucket('s_00000007');
    const state = t.storage.startMove(BUILTIN, 's_00000007');
    assert.equal(state.total, 3);
    while (state.running) await new Promise((r) => setTimeout(r, 10));
    assert.equal(state.done, 3);
    assert.equal(state.failed, 0);
    assert.equal(state.bytes, 12);
    assert.deepEqual([...t.rows.values()].map((r) => r.store), ['s_00000007', 's_00000007', 's_00000007']);
    assert.ok(fake.objects.has('s_00000007/media/m2'));
    assert.deepEqual(readdirSync(path.join(t.base, 'media')), []);
    // a full target stops the move
    t.bucket('s_00000008', { capacity: 5 });
    const full = t.storage.startMove('s_00000007', 's_00000008');
    while (full.running) await new Promise((r) => setTimeout(r, 10));
    assert.equal(full.done, 1);
    assert.equal(full.error, 'storage_full');
  });

  it('local folders other than the built-in one use subfolders', async () => {
    const root = mkdtempSync(path.join(dir, 'extra-'));
    const b = new LocalBackend((ns) => path.join(root, ns));
    await b.put('cloud/x.mrpack', Buffer.from('pack'));
    assert.deepEqual(readdirSync(path.join(root, 'cloud')), ['x.mrpack']);
    await assert.rejects(b.put('cloud/../../evil', Buffer.from('x')));
    await b.check();
  });
});
