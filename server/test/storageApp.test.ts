import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { crc32 } from 'node:zlib';
import { createApp } from '../src/app.ts';
import { startFakeS3, type FakeS3 } from './fakeS3.ts';

/** Screenshots, clips and cloud profiles kept in a bucket (a fake S3), and the panel that sets it up. */

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-storage-app-'));
const mediaDir = path.join(dir, 'media');
const cloudDir = path.join(dir, 'cloud');
const SECRET = 'sekret-bardzo-tajny-123';
const KEY_ID = 'AKIDSLASHCLIENT9876';
let base = '';
let app: ReturnType<typeof createApp>;
let fake: FakeS3;
const disk = { free: 50 * 1024 ** 3 };

async function call(method: string, url: string, token?: string, body?: unknown, raw?: Buffer, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', 'X-SlashClient': 'launcher/test', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ? new Uint8Array(raw) : body === undefined ? undefined : JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: any;
  try {
    json = JSON.parse(buf.toString('utf8'));
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, buf, text: buf.toString('utf8'), headers: res.headers };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

function png(width: number, height: number, extra = 0): Buffer {
  const b = Buffer.alloc(45 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
function jpeg(width: number, height: number, fill = 0): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, fill, 0x00]), sof, Buffer.from([0xff, 0xd9])]);
}
function avi(frames: Buffer[], width: number, height: number): Buffer {
  const chunk = (id: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'latin1');
    head.writeUInt32LE(data.length, 4);
    return Buffer.concat([head, data, Buffer.alloc(data.length & 1)]);
  };
  const list = (type: string, ...parts: Buffer[]) => chunk('LIST', Buffer.concat([Buffer.from(type, 'latin1'), ...parts]));
  const avih = Buffer.alloc(56);
  avih.writeUInt32LE(33_333, 0);
  avih.writeUInt32LE(width, 32);
  avih.writeUInt32LE(height, 36);
  const strh = Buffer.alloc(56);
  strh.write('vids', 0, 'latin1');
  strh.write('MJPG', 4, 'latin1');
  const body = Buffer.concat([Buffer.from('AVI ', 'latin1'), list('hdrl', chunk('avih', avih), list('strl', chunk('strh', strh), chunk('strf', Buffer.alloc(40)))), list('movi', ...frames.map((f) => chunk('00dc', f)))]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}
/** A zip with one stored entry: enough to count as a .mrpack. */
function pack(extra = ''): Buffer {
  const name = Buffer.from('modrinth.index.json');
  const data = Buffer.from(`{"formatVersion":1,"x":"${extra}"}`);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt32LE(crc32(data), 16);
  entry.writeUInt32LE(data.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12);
  end.writeUInt32LE(30 + name.length + data.length, 16);
  return Buffer.concat([local, name, data, entry, name, end]);
}
const bucketKeys = (prefix: string) => [...fake.objects.keys()].filter((k) => k.startsWith(prefix)).sort();

before(async () => {
  fake = await startFakeS3({ bucket: 'slash-files', region: 'auto', keys: { [KEY_ID]: SECRET } });
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: true, oauth: {}, adminHandles: ['Magazynier'],
    mediaDir, cloudDir, mediaLimits: { imageBytes: 4000, clipBytes: 8000, maxActive: 20, quotaBytes: 100_000 },
    storage: { secretKey: Buffer.alloc(32, 3).toString('base64'), minFreeBytes: 1024 ** 3, localHttp: true, diskSpace: async () => ({ total: 100 * 1024 ** 3, free: disk.free }) },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  await fake.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('storage in the admin panel', () => {
  let admin: string;
  let r2: string;

  it('is for admins only', async () => {
    admin = (await login('Magazynier')).token;
    const player = await login('ZwyklyGracz');
    assert.equal((await call('GET', '/v1/admin/storage')).status, 401);
    assert.equal((await call('GET', '/v1/admin/storage', player.token)).status, 403);
    assert.equal((await call('POST', '/v1/admin/storage', player.token, { type: 'r2', name: 'x' })).status, 403);
    assert.equal((await call('POST', '/v1/admin/storage/test', player.token, { type: 'local', name: 'x', dir: dir })).status, 403);
    const overview = await call('GET', '/v1/admin/storage', admin);
    assert.equal(overview.status, 200);
    assert.equal(overview.body.backends.length, 1);
    assert.equal(overview.body.backends[0].id, 'local');
    assert.equal(overview.body.backends[0].builtin, true);
    assert.equal(overview.body.disk.free, disk.free);
    assert.equal(overview.body.secretKey.set, true);
  });

  it('tests a bucket before saving it', async () => {
    const form = { type: 'r2', name: 'R2', endpoint: fake.url, bucket: 'slash-files', prefix: 'slash', keyId: KEY_ID, secret: SECRET };
    const ok = await call('POST', '/v1/admin/storage/test', admin, form);
    assert.equal(ok.body.ok, true);
    const bad = await call('POST', '/v1/admin/storage/test', admin, { ...form, secret: 'zle' });
    assert.equal(bad.body.ok, false);
    assert.equal(bad.body.code, 'SignatureDoesNotMatch');
    assert.equal((await call('POST', '/v1/admin/storage/test', admin, { ...form, endpoint: 'http://example.com' })).body.error, 'storage_bad_endpoint');
  });

  it('adds a bucket with its keys sealed and never sent back', async () => {
    const res = await call('POST', '/v1/admin/storage', admin, { type: 'r2', name: 'R2 darmowe', endpoint: fake.url, bucket: 'slash-files', prefix: 'slash/', keyId: KEY_ID, secret: SECRET, capacity: 10 * 1024 ** 3 });
    assert.equal(res.status, 200);
    r2 = res.body.id;
    assert.match(r2, /^s_[0-9a-f]{8}$/);
    assert.equal(res.body.region, 'auto');
    assert.equal(res.body.prefix, 'slash/');
    assert.equal(res.body.keyIdHint, '9876');
    assert.equal(res.body.secretSet, true);
    assert.equal(res.body.available, true);
    // nothing of the keys in any answer
    const overview = await call('GET', '/v1/admin/storage', admin);
    for (const text of [res.text, overview.text]) {
      assert.ok(!text.includes(SECRET));
      assert.ok(!text.includes(KEY_ID));
    }
    // and only sealed in the database
    const db = new DatabaseSync(path.join(dir, 'test.db'));
    const row = db.prepare('SELECT key_id, secret FROM storage_backends WHERE id = ?').get(r2) as { key_id: string; secret: string };
    db.close();
    assert.match(row.secret, /^v1:/);
    assert.ok(!row.secret.includes(SECRET) && !row.key_id.includes(KEY_ID));
    // the same bucket and prefix twice would sweep each other's files
    assert.equal((await call('POST', '/v1/admin/storage', admin, { type: 's3', name: 'Kopia', endpoint: fake.url, region: 'auto', bucket: 'slash-files', prefix: 'slash/sub', keyId: 'a', secret: 'b' })).body.error, 'storage_duplicate');
    assert.equal((await call('POST', '/v1/admin/storage', admin, { type: 'local', name: 'Ten sam dysk', dir })).body.error, 'storage_duplicate');
    // a bucket needs its keys
    assert.equal((await call('POST', '/v1/admin/storage', admin, { type: 'b2', name: 'B2', endpoint: 'https://s3.eu-central-003.backblazeb2.com', bucket: 'slash-b2' })).body.error, 'storage_need_keys');
    // a saved bucket can be tested with its stored keys
    assert.equal((await call('POST', '/v1/admin/storage/test', admin, { id: r2 })).body.ok, true);
    // the log has it
    const log = await call('GET', '/v1/admin/log', admin);
    assert.ok(log.body.entries.some((e: { action: string; target: string }) => e.action === 'storage_add' && e.target === 'R2 darmowe'));
  });

  it('keeps new screenshots and clips in the bucket, serving them as before', async () => {
    const { token } = await login('Fotograf');
    const up = await call('POST', '/v1/media', token, undefined, png(64, 32, 500));
    assert.equal(up.status, 200);
    const id = up.body.media.id;
    assert.equal(up.body.media.store, undefined);
    assert.deepEqual(bucketKeys('slash/media/'), [`slash/media/${id}`]);
    assert.deepEqual(readdirSync(mediaDir), []);
    const file = await call('GET', `/v1/media/${id}/file`);
    assert.equal(file.status, 200);
    assert.deepEqual(file.buf, png(64, 32, 500));
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.equal(file.headers.get('content-length'), String(png(64, 32, 500).length));
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.match(file.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.equal(file.headers.get('accept-ranges'), 'bytes');
    const head = await fetch(`${base}/v1/media/${id}/file`, { method: 'HEAD' });
    assert.equal(head.headers.get('content-length'), String(png(64, 32, 500).length));

    const frames = [jpeg(32, 16), Buffer.concat([jpeg(32, 16, 1), Buffer.alloc(900)])];
    const clip = await call('POST', '/v1/media', token, undefined, avi(frames, 32, 16));
    const cid = clip.body.media.id;
    assert.deepEqual(bucketKeys(`slash/media/${cid}`), [`slash/media/${cid}`, `slash/media/${cid}.poster.jpg`]);
    assert.deepEqual((await call('GET', `/v1/media/${cid}/poster`)).buf, frames[0]);
    // a part of the clip, as a player seeking would ask
    const part = await call('GET', `/v1/media/${cid}/file`, undefined, undefined, undefined, { Range: 'bytes=4-11' });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 4-11/${avi(frames, 32, 16).length}`);
    assert.deepEqual(part.buf, avi(frames, 32, 16).subarray(4, 12));
    assert.equal(part.headers.get('content-type'), 'video/x-msvideo');
    assert.equal((await call('GET', `/v1/media/${cid}/file`, undefined, undefined, undefined, { Range: 'bytes=99999-' })).status, 416);

    // the panel counts them, per kind and per player
    const overview = (await call('GET', '/v1/admin/storage', admin)).body;
    const b = overview.backends.find((x: { id: string }) => x.id === r2);
    assert.equal(b.files, 2);
    assert.equal(b.kinds.image.files, 1);
    assert.equal(b.kinds.clip.bytes, avi(frames, 32, 16).length + frames[0].length);
    assert.equal(overview.top[0].handle, 'Fotograf');

    // a bucket that holds files cannot be removed, nor pointed elsewhere
    assert.equal((await call('DELETE', `/v1/admin/storage/${r2}`, admin)).body.error, 'storage_in_use');
    assert.equal((await call('POST', `/v1/admin/storage/${r2}`, admin, { bucket: 'other-bucket' })).body.error, 'storage_in_use');
    assert.equal((await call('DELETE', '/v1/admin/storage/local', admin)).body.error, 'storage_builtin');

    // the owner deletes: gone from the bucket
    assert.equal((await call('DELETE', `/v1/media/${id}`, token)).status, 200);
    assert.deepEqual(bucketKeys(`slash/media/${id}`), []);
    assert.equal((await call('GET', `/v1/media/${id}/file`)).status, 404);
  });

  it('keeps cloud profiles in the bucket', async () => {
    const { token } = await login('Chmurowiec');
    const ID = '1a2b3c4d-1111-4222-8333-944455556666';
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ID}?name=A`, token, undefined, pack('a'))).status, 200);
    const first = bucketKeys('slash/cloud/');
    assert.equal(first.length, 1);
    const file = await call('GET', `/v1/cloud-profiles/${ID}/file`, token);
    assert.deepEqual(file.buf, pack('a'));
    assert.equal(file.headers.get('x-cloud-revision'), '1');
    assert.equal(file.headers.get('content-type'), 'application/x-modrinth-modpack+zip');
    // a new revision replaces the object
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ID}?base=1`, token, undefined, pack('b'))).body.profile.revision, 2);
    const second = bucketKeys('slash/cloud/');
    assert.equal(second.length, 1);
    assert.notEqual(second[0], first[0]);
    assert.deepEqual((await call('GET', `/v1/cloud-profiles/${ID}/file`, token)).buf, pack('b'));
    assert.deepEqual(readdirSync(cloudDir), []);
    assert.equal((await call('DELETE', `/v1/cloud-profiles/${ID}`, token)).status, 200);
    assert.deepEqual(bucketKeys('slash/cloud/'), []);
  });

  it('says when no backend has room, and keeps the disk floor', async () => {
    const { token } = await login('Pelny');
    // the bucket is switched off and the server disk is below its floor
    assert.equal((await call('POST', `/v1/admin/storage/${r2}`, admin, { enabled: false })).body.enabled, false);
    disk.free = 1024 ** 3 + 100;
    const full = await call('POST', '/v1/media', token, undefined, png(8, 8, 200));
    assert.equal(full.status, 507);
    assert.equal(full.body.error, 'storage_full');
    // with room on the disk again, the file goes there
    disk.free = 50 * 1024 ** 3;
    const local = await call('POST', '/v1/media', token, undefined, png(8, 8, 200));
    assert.equal(local.status, 200);
    assert.deepEqual(readdirSync(mediaDir), [local.body.media.id]);
    // a full bucket is passed over the same way
    assert.equal((await call('POST', `/v1/admin/storage/${r2}`, admin, { enabled: true, capacity: 10 })).body.capacity, 10);
    const next = await call('POST', '/v1/media', token, undefined, png(8, 8, 300));
    assert.equal(readdirSync(mediaDir).length, 2);
    // files already in a switched-off or full bucket are still served
    const fromBucket = bucketKeys('slash/media/')[0].slice('slash/media/'.length, 'slash/media/'.length + 10);
    assert.equal((await call('GET', `/v1/media/${fromBucket}/file`)).status, 200);
    assert.equal((await call('POST', `/v1/admin/storage/${r2}`, admin, { capacity: 0 })).status, 200);
    await call('DELETE', `/v1/media/${next.body.media.id}`, token);
  });

  it('sweeps expired links and orphans in the bucket', async () => {
    const { token } = await login('Sprzatacz');
    const up = await call('POST', '/v1/media', token, undefined, png(4, 4));
    const id = up.body.media.id;
    assert.ok(fake.objects.has(`slash/media/${id}`));
    const db = new DatabaseSync(path.join(dir, 'test.db'));
    db.prepare('UPDATE shared_media SET expires_at = ? WHERE id = ?').run(Date.now() - 1, id);
    db.close();
    fake.objects.set('slash/media/ZZZZZZZZZZ', { data: Buffer.from('x'), type: 'image/png', modifiedMs: Date.now() - 2 * 3_600_000 });
    fake.objects.set('slash/cloud/deadbeef.mrpack', { data: Buffer.from('x'), type: 'application/zip', modifiedMs: Date.now() - 2 * 3_600_000 });
    await app.cleanupFiles();
    assert.ok(!fake.objects.has(`slash/media/${id}`));
    assert.ok(!fake.objects.has('slash/media/ZZZZZZZZZZ'));
    assert.ok(!fake.objects.has('slash/cloud/deadbeef.mrpack'));
    assert.ok(bucketKeys('slash/media/').length > 0, 'files with rows stay');
  });

  it('moves files between backends from the panel', async () => {
    const before = bucketKeys('slash/media/').length;
    const local = readdirSync(mediaDir).length;
    const start = await call('POST', `/v1/admin/storage/local/move`, admin, { to: r2 });
    assert.equal(start.status, 200);
    let state = start.body.move;
    while (state.running) {
      await new Promise((r) => setTimeout(r, 20));
      state = (await call('GET', '/v1/admin/storage', admin)).body.move;
    }
    assert.equal(state.done, local);
    assert.equal(state.failed, 0);
    assert.deepEqual(readdirSync(mediaDir), []);
    assert.equal(bucketKeys('slash/media/').length, before + local);
    assert.equal((await call('POST', `/v1/admin/storage/${r2}/move`, admin, { to: r2 })).body.error, 'storage_bad_target');
    const log = await call('GET', '/v1/admin/log', admin);
    assert.ok(log.body.entries.some((e: { action: string }) => e.action === 'storage_move'));
  });

  it('changes keys without showing them, and removes an empty backend', async () => {
    const edit = await call('POST', `/v1/admin/storage/${r2}`, admin, { name: 'R2 główne', keyId: KEY_ID, secret: SECRET, priority: 5 });
    assert.equal(edit.body.name, 'R2 główne');
    assert.equal(edit.body.priority, 5);
    assert.ok(!edit.text.includes(SECRET));
    const log = await call('GET', '/v1/admin/log', admin);
    const entry = log.body.entries.find((e: { action: string }) => e.action === 'storage_edit');
    assert.match(entry.detail, /klucze zmienione/);
    assert.ok(!entry.detail.includes(SECRET));
    const extra = await call('POST', '/v1/admin/storage', admin, { type: 'local', name: 'Drugi dysk', dir: path.join(dir, 'second') });
    assert.equal(extra.status, 200);
    assert.equal((await call('DELETE', `/v1/admin/storage/${extra.body.id}`, admin)).body.ok, true);
  });
});

describe('storage without STORAGE_SECRET_KEY', () => {
  it('refuses to save bucket keys, and adds the new columns to an older database', async () => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'slash-storage-nokey-'));
    // an older database: shared_media and cloud_profiles without `store`
    const old = new DatabaseSync(path.join(d, 'old.db'));
    old.exec(`CREATE TABLE shared_media (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, width INTEGER NOT NULL,
      height INTEGER NOT NULL, frames INTEGER NOT NULL DEFAULT 1, duration_ms INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL DEFAULT '', views INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE cloud_profiles (owner TEXT NOT NULL, id TEXT NOT NULL, file TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', game_version TEXT NOT NULL DEFAULT '',
      loader TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner, id));
      INSERT INTO shared_media (id, owner, kind, type, size, width, height, created_at, expires_at) VALUES ('OldOldOld1', 'x', 'image', 'image/png', 1, 1, 1, 0, 0);`);
    old.close();
    const a = createApp({ dbFile: path.join(d, 'old.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['BezKlucza'] });
    await new Promise<void>((r) => a.server.listen(0, r));
    const url = `http://127.0.0.1:${(a.server.address() as AddressInfo).port}`;
    try {
      const db = new DatabaseSync(path.join(d, 'old.db'));
      assert.equal((db.prepare("SELECT store FROM shared_media WHERE id = 'OldOldOld1'").get() as { store: string }).store, 'local');
      assert.ok((db.prepare('PRAGMA table_info(cloud_profiles)').all() as { name: string }[]).some((c) => c.name === 'store'));
      db.close();
      const { token } = (await (await fetch(`${url}/v1/auth/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'BezKlucza' }) })).json()) as { token: string };
      const post = (p: string, body: unknown) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() as any }));
      const res = await post('/v1/admin/storage', { type: 'r2', name: 'R2', endpoint: 'https://abc.r2.cloudflarestorage.com', bucket: 'slash', keyId: 'k', secret: 's' });
      assert.equal(res.status, 409);
      assert.equal(res.body.error, 'storage_no_key');
      const overview = await fetch(`${url}/v1/admin/storage`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()) as any;
      assert.equal(overview.secretKey.set, false);
      assert.equal(overview.backends.length, 1);
    } finally {
      await a.close();
      rmSync(d, { recursive: true, force: true });
    }
  });
});
