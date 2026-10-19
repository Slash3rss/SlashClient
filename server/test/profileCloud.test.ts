import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { crc32 } from 'node:zlib';
import { createApp } from '../src/app.ts';
import { validCloudId } from '../src/profileCloud.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-cloud-'));
const cloudDir = path.join(dir, 'cloud');
let base = '';
let app: ReturnType<typeof createApp>;

/** A zip with stored (uncompressed) entries, enough for the server's check. */
function zip(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    local.push(head, nameBuf, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
const pack = (extra = '') => zip({ 'modrinth.index.json': '{"formatVersion":1,"game":"minecraft","files":[],"dependencies":{"minecraft":"1.21.1"}}', 'overrides/config/slashclient-hud.json': `{"x":"${extra}"}` });

async function call(method: string, url: string, token?: string, raw?: Buffer) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': raw ? 'application/zip' : 'application/json', 'X-SlashClient': 'launcher/test', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ? new Uint8Array(raw) : undefined,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: any;
  try {
    json = JSON.parse(buf.toString('utf8'));
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, buf, headers: res.headers };
}
const login = async (name: string) => {
  const res = await fetch(`${base}/v1/auth/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  return (await res.json()) as { token: string; user: { id: string } };
};

const ID = '0f8e2a4c-1111-4222-8333-944455556666';

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, cloudDir,
    cloudLimits: { maxBytes: 4096, maxProfiles: 2, quotaBytes: 1500 },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('profiles on the account', () => {
  it('accepts only launcher-made ids', () => {
    assert.equal(validCloudId(ID.toUpperCase()), ID);
    assert.equal(validCloudId('short'), undefined);
    assert.equal(validCloudId('../../etc/passwd'), undefined);
    assert.equal(validCloudId(42), undefined);
  });

  it('needs a session for everything, the file too', async () => {
    assert.equal((await call('GET', '/v1/cloud-profiles')).status, 401);
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ID}`, undefined, pack())).status, 401);
    assert.equal((await call('GET', `/v1/cloud-profiles/${ID}/file`)).status, 401);
  });

  it('uploads, lists and downloads for the owner only, with revisions', async () => {
    const owner = await login('Chmurny');
    const first = await call('PUT', `/v1/cloud-profiles/${ID}?name=Survival&game=1.21.1&loader=fabric&device=PC`, owner.token, pack('a'));
    assert.equal(first.status, 200);
    assert.equal(first.body.profile.revision, 1);
    assert.equal(first.body.profile.name, 'Survival');
    assert.equal(first.body.profile.device, 'PC');
    assert.equal(first.body.profile.owner, undefined);
    assert.equal(first.body.profile.file, undefined);

    const list = await call('GET', '/v1/cloud-profiles', owner.token);
    assert.equal(list.body.profiles.length, 1);
    assert.equal(list.body.limits.used, pack('a').length);
    const file = await call('GET', `/v1/cloud-profiles/${ID}/file`, owner.token);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('x-cloud-revision'), '1');
    assert.deepEqual(file.buf, pack('a'));

    // somebody else sees nothing of it, even knowing the id
    const other = await login('Podgladacz');
    assert.equal((await call('GET', `/v1/cloud-profiles/${ID}`, other.token)).status, 404);
    assert.equal((await call('GET', `/v1/cloud-profiles/${ID}/file`, other.token)).status, 404);
    assert.equal((await call('DELETE', `/v1/cloud-profiles/${ID}`, other.token)).status, 404);
    assert.equal((await call('GET', '/v1/cloud-profiles', other.token)).body.profiles.length, 0);
    // and the same id on another account is another profile
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ID}`, other.token, pack('z'))).body.profile.revision, 1);
    assert.deepEqual((await call('GET', `/v1/cloud-profiles/${ID}/file`, owner.token)).buf, pack('a'));

    // the second computer saw revision 1 and uploads on top of it
    const second = await call('PUT', `/v1/cloud-profiles/${ID}?base=1&device=Laptop`, owner.token, pack('b'));
    assert.equal(second.body.profile.revision, 2);
    // the first computer still thinks it is 1: a conflict, the cloud copy stays
    const stale = await call('PUT', `/v1/cloud-profiles/${ID}?base=1`, owner.token, pack('c'));
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'cloud_conflict');
    // a launcher that never synced it does not overwrite either
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ID}`, owner.token, pack('c'))).body.error, 'cloud_conflict');
    assert.deepEqual((await call('GET', `/v1/cloud-profiles/${ID}/file`, owner.token)).buf, pack('b'));
    // unless the player chose to overwrite
    const forced = await call('PUT', `/v1/cloud-profiles/${ID}?base=1&force=1`, owner.token, pack('c'));
    assert.equal(forced.body.profile.revision, 3);
    assert.deepEqual((await call('GET', `/v1/cloud-profiles/${ID}/file`, owner.token)).buf, pack('c'));
    // only the newest file is kept on disk (one per account here)
    assert.equal(readdirSync(cloudDir).filter((f) => f.endsWith('.mrpack')).length, 2);

    assert.equal((await call('DELETE', `/v1/cloud-profiles/${ID}`, owner.token)).body.ok, true);
    assert.equal((await call('GET', `/v1/cloud-profiles/${ID}`, owner.token)).status, 404);
    assert.equal(readdirSync(cloudDir).filter((f) => f.endsWith('.mrpack')).length, 1);
  });

  it('refuses what is not a pack, too big packs, too many profiles and more than the quota', async () => {
    const p = await login('Limitowany');
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ID}`, p.token, Buffer.from('hello'))).body.error, 'not_a_pack');
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ID}`, p.token, zip({ 'x.txt': 'y' }))).body.error, 'not_a_pack');
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ID}`, p.token, pack('a'.repeat(5000)))).status, 413);
    assert.equal((await call('PUT', '/v1/cloud-profiles/bad', p.token, pack())).body.error, 'bad_id');
    const ids = ['aaaaaaaa-1', 'bbbbbbbb-2', 'cccccccc-3'];
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ids[0]}`, p.token, pack())).status, 200);
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ids[1]}`, p.token, pack())).status, 200);
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ids[2]}`, p.token, pack())).body.error, 'cloud_limit');
    // replacing one of the two is fine, as long as everything fits the quota
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ids[0]}?base=1`, p.token, pack('q'.repeat(700)))).status, 200);
    assert.equal((await call('PUT', `/v1/cloud-profiles/${ids[1]}?base=1`, p.token, pack('q'.repeat(700)))).body.error, 'cloud_quota');
    assert.equal(readdirSync(cloudDir).filter((f) => f.endsWith('.part')).length, 0);
  });
});
