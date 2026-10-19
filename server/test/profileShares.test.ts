import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { crc32 } from 'node:zlib';
import { createApp } from '../src/app.ts';
import { normalizeCode, zipEntryNames } from '../src/profileShares.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-shares-'));
const sharesDir = path.join(dir, 'shares');
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
const pack = (extra = '') => zip({ 'modrinth.index.json': '{"formatVersion":1,"game":"minecraft","files":[],"dependencies":{"minecraft":"1.21.1"}}', 'overrides/config/a.txt': `x${extra}` });

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
  return { status: res.status, body: json, buf, type: res.headers.get('content-type') ?? '' };
}
const login = async (name: string) => {
  const res = await fetch(`${base}/v1/auth/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  return (await res.json()) as { token: string; user: { id: string } };
};

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, sharesDir,
    shareLimits: { maxBytes: 4096, maxActive: 3, quotaBytes: 1500 },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('profile codes', () => {
  it('normalizes what the player typed', () => {
    assert.equal(normalizeCode('abcd-efgh'), 'ABCDEFGH');
    assert.equal(normalizeCode(' ABCD EFGH '), 'ABCDEFGH');
    assert.equal(normalizeCode('ABCDEFG0'), undefined);
    assert.equal(normalizeCode('ABC'), undefined);
    assert.equal(normalizeCode('../../etc'), undefined);
    assert.equal(normalizeCode(42), undefined);
  });

  it('reads entry names of a zip and refuses what is not one', () => {
    assert.deepEqual(zipEntryNames(pack()), ['modrinth.index.json', 'overrides/config/a.txt']);
    assert.equal(zipEntryNames(Buffer.from('not a zip at all, really not')), undefined);
    assert.equal(zipEntryNames(pack().subarray(0, 60)), undefined);
  });
});

describe('sharing a profile by code', () => {
  it('needs a session to upload', async () => {
    assert.equal((await call('POST', '/v1/profile-shares', undefined, pack())).status, 401);
  });

  it('uploads a pack, shows it to anyone with the code and lets the owner delete it', async () => {
    const owner = await login('Dzielacy');
    const sent = await call('POST', '/v1/profile-shares?name=M%C3%B3j%20profil&game=1.21.1&loader=fabric', owner.token, pack());
    assert.equal(sent.status, 200);
    const code: string = sent.body.share.code;
    assert.match(code, /^[A-Z2-9]{8}$/);
    assert.equal(sent.body.share.name, 'Mój profil');
    assert.equal(sent.body.share.owner, undefined);
    assert.ok(sent.body.share.expiresAt > Date.now() + 29 * 86_400_000);
    assert.ok(existsSync(path.join(sharesDir, `${code}.mrpack`)));

    // anyone, no sign-in, also typed in lower case with a dash
    const info = await call('GET', `/v1/profile-shares/${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
    assert.equal(info.body.share.gameVersion, '1.21.1');
    assert.equal(info.body.share.ownerHandle, 'Dzielacy');
    const file = await call('GET', `/v1/profile-shares/${code}/file`);
    assert.equal(file.status, 200);
    assert.equal(file.type, 'application/x-modrinth-modpack+zip');
    assert.deepEqual(file.buf, pack());

    const mine = await call('GET', '/v1/profile-shares', owner.token);
    assert.equal(mine.body.shares.length, 1);
    assert.equal(mine.body.shares[0].downloads, 1);
    assert.equal(mine.body.limits.used, pack().length);

    // somebody else cannot take it down
    const other = await login('Obcy');
    assert.equal((await call('DELETE', `/v1/profile-shares/${code}`, other.token)).status, 404);
    assert.equal((await call('DELETE', `/v1/profile-shares/${code}`, owner.token)).body.ok, true);
    assert.equal((await call('GET', `/v1/profile-shares/${code}`)).status, 404);
    assert.equal((await call('GET', `/v1/profile-shares/${code}/file`)).status, 404);
    assert.equal(existsSync(path.join(sharesDir, `${code}.mrpack`)), false);
  });

  it('refuses what is not a pack, too big packs and more than the quota', async () => {
    const p = await login('Limitowy');
    assert.equal((await call('POST', '/v1/profile-shares', p.token, Buffer.from('hello'))).body.error, 'not_a_pack');
    assert.equal((await call('POST', '/v1/profile-shares', p.token, zip({ 'x.txt': 'y' }))).body.error, 'not_a_pack');
    const big = await call('POST', '/v1/profile-shares', p.token, pack('a'.repeat(5000)));
    assert.equal(big.status, 413);
    // three codes at a time (each small pack is ~250 bytes, well within the 1500 bytes for all)
    const n = await login('Liczony');
    for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/v1/profile-shares', n.token, pack())).status, 200);
    assert.equal((await call('POST', '/v1/profile-shares', n.token, pack())).body.error, 'share_limit');
    const q = await login('Kwotowy');
    assert.equal((await call('POST', '/v1/profile-shares', q.token, pack('b'.repeat(900)))).status, 200);
    assert.equal((await call('POST', '/v1/profile-shares', q.token, pack('b'.repeat(900)))).body.error, 'share_quota');
    // no files left behind by the refused ones
    assert.equal(readdirSync(sharesDir).filter((f) => f.endsWith('.part')).length, 0);
  });

  it('answers unknown and malformed codes with 404', async () => {
    assert.equal((await call('GET', '/v1/profile-shares/ZZZZZZZZ')).status, 404);
    assert.equal((await call('GET', '/v1/profile-shares/nope/file')).status, 404);
  });
});
