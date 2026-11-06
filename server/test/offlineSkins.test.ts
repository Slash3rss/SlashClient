import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp, offlineUuid } from '../src/app.ts';
import { encodePng } from '../src/png.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-offline-skins-'));
let base = '';
let app: ReturnType<typeof createApp>;
const sockets: WebSocket[] = [];

/** `ip`: the address the request seems to come from (the test server trusts X-Forwarded-For from itself). */
async function call(method: string, url: string, o: { token?: string; body?: unknown; ip?: string } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), 'X-Forwarded-For': o.ip ?? '198.51.100.1' },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, headers: res.headers };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', { body: { name } })).body as { token: string; user: { id: string } };
/** A launcher connected with this status (where its game is). */
async function online(token: string, server?: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  sockets.push(ws);
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token, presence: { status: 'online', activity: server === undefined ? { kind: 'singleplayer' } : { kind: 'server', server } } }));
  for (let i = 0; i < 100 && !events.some((e) => e.type === 'ready'); i++) await new Promise((r) => setTimeout(r, 20));
  return ws;
}
const skin = (height = 64) => encodePng({ width: 64, height, rgba: Buffer.alloc(64 * height * 4, 0x80) });
const b64 = (b: Buffer) => b.toString('base64');
const heartbeat = (uuid: string, ip: string) => call('POST', '/v1/mc/heartbeat', { body: { uuid }, ip });
const lookup = (uuid: string, server?: string, ip = '203.0.113.50') =>
  call('POST', '/v1/mc/lookup', { body: { uuids: [uuid], knownRanks: ['friend_pink', 'supporter', 'colors'], ...(server === undefined ? {} : { server }) }, ip }).then((r) => r.body);

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'], loginsPerMinute: 1000, trustProxy: true });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  app.settings.set({ 'skins.uploadsPerMinute': 1000 }, 'test');
});
after(async () => {
  await Promise.all(sockets.map((ws) => new Promise((r) => {
    ws.once('close', r);
    ws.close();
  })));
  // the server notes the launchers leaving before it closes
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('offline skins: the account\'s list', () => {
  it('stores a skin per nick, checks the nick and the picture, and serves it by its hash for good', async () => {
    const { token } = await login('Ala');
    assert.equal((await call('GET', '/v1/me/offline-skins')).status, 401);
    assert.deepEqual((await call('GET', '/v1/me/offline-skins', { token })).body, { skins: [] });
    const put = (name: string, body: unknown) => call('PUT', `/v1/me/offline-skins/${name}`, { token, body });
    assert.equal((await put('bad-nick', { png: b64(skin()), slim: false })).status, 400);
    assert.equal((await put('a'.repeat(17), { png: b64(skin()), slim: false })).status, 400);
    assert.equal((await put('Steve', { png: b64(Buffer.from('not a png')), slim: false })).status, 400);
    assert.equal((await put('Steve', { png: b64(encodePng({ width: 32, height: 32, rgba: Buffer.alloc(32 * 32 * 4) })), slim: false })).status, 400);
    assert.equal((await put('Steve', { png: 42 })).status, 400);
    // over 64 KB: a valid header with junk behind it; far over it, the request itself is too large
    assert.equal((await put('Steve', { png: b64(Buffer.concat([skin(), Buffer.alloc(64 * 1024)])), slim: false })).status, 400);
    assert.equal((await put('Steve', { png: b64(Buffer.alloc(200 * 1024)), slim: false })).status, 413);
    // a skin near the limit fits in the request (more than the API's usual 16 KB)
    const big = encodePng({ width: 64, height: 64, rgba: randomBytes(64 * 64 * 4) });
    assert.ok(big.length > 16 * 1024 && big.length <= 64 * 1024, String(big.length));
    assert.equal((await put('Big', { png: b64(big), slim: false })).status, 200);
    assert.equal((await call('DELETE', '/v1/me/offline-skins/Big', { token })).status, 200);

    const file = skin();
    const saved = await put('Steve', { png: b64(file), slim: true });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.name, 'Steve');
    assert.equal(saved.body.slim, true);
    assert.match(saved.body.hash, /^[0-9a-f]{32}$/);
    // the old 64×32 skins too
    assert.equal((await put('Old_One', { png: b64(skin(32)), slim: false })).status, 200);
    assert.deepEqual((await call('GET', '/v1/me/offline-skins', { token })).body.skins.map((s: any) => s.name), ['Old_One', 'Steve']);

    const res = await fetch(`${base}/v1/skin/${saved.body.hash}.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), file);
    assert.equal((await fetch(`${base}/v1/skin/${'0'.repeat(32)}.png`)).status, 404);

    // the same nick in other letters is the same skin, changed
    assert.equal((await put('steve', { png: b64(file), slim: false })).body.slim, false);
    assert.equal((await call('GET', '/v1/me/offline-skins', { token })).body.skins.length, 2);

    // the limit (the admin panel's setting) counts new nicks only
    app.settings.set({ 'skins.offlinePerUser': 2 }, 'test');
    try {
      const over = await put('Third', { png: b64(file), slim: false });
      assert.equal(over.status, 400);
      assert.equal(over.body.error, 'too_many');
      assert.equal((await put('Steve', { png: b64(file), slim: true })).status, 200);
    } finally {
      app.settings.set({ 'skins.offlinePerUser': null }, 'test');
    }

    assert.equal((await call('DELETE', '/v1/me/offline-skins/Old_One', { token })).status, 200);
    assert.equal((await call('DELETE', '/v1/me/offline-skins/Old_One', { token })).status, 404);
    assert.deepEqual((await call('GET', '/v1/me/offline-skins', { token })).body.skins.map((s: any) => s.name), ['Steve']);
  });

  it('is a feature the admin can switch off: no new skins, and /v1/features says so', async () => {
    assert.equal((await call('GET', '/v1/features')).body.features.offlineSkins, true);
    const { token } = await login('Beata');
    app.settings.set({ 'feature.offlineSkins': false }, 'test');
    try {
      assert.equal((await call('GET', '/v1/features')).body.features.offlineSkins, false);
      assert.equal((await call('PUT', '/v1/me/offline-skins/Beata', { token, body: { png: b64(skin()), slim: false } })).status, 503);
      assert.equal((await call('GET', '/v1/me/offline-skins', { token })).status, 200);
    } finally {
      app.settings.set({ 'feature.offlineSkins': null }, 'test');
    }
  });
});

describe('offline skins in the game', () => {
  it('only links the nick\'s own offline uuid, keeping the old shape as it was', async () => {
    const { token } = await login('Cezary');
    assert.equal((await call('POST', '/v1/mc/link', { token, body: { uuid: offlineUuid('Other'), name: 'Cezary', offline: true } })).status, 400);
    assert.equal((await call('POST', '/v1/mc/link', { token, body: { uuid: offlineUuid('bad nick'), name: 'bad nick', offline: true } })).status, 400);
    assert.equal((await call('POST', '/v1/mc/link', { token, body: { uuid: offlineUuid('Cezary'), name: 'Cezary', offline: true } })).status, 200);
    // without a dash, as some launchers write it
    assert.equal((await call('POST', '/v1/mc/link', { token, body: { uuid: offlineUuid('Cezary').replace(/-/g, ''), name: 'Cezary', offline: true } })).status, 200);
    // the old shape: a Minecraft account that is not this player's own
    assert.equal((await call('POST', '/v1/mc/link', { token, body: { uuid: offlineUuid('Cezary') } })).status, 403);
  });

  it('shows the skin and the account\'s set to HUDs on the same server, from the computer that plays', async () => {
    const ala = await login('Ola');
    app.db.grant(ala.user.id, 'aurora');
    app.db.setCape(ala.user.id, 'aurora');
    const file = skin();
    const hash = (await call('PUT', '/v1/me/offline-skins/Kowal', { token: ala.token, body: { png: b64(file), slim: true } })).body.hash;
    const uuid = offlineUuid('Kowal');
    const home = '192.0.2.10';
    await online(ala.token, 'mc.example.pl');
    assert.equal((await heartbeat(uuid, home)).status, 200);
    assert.equal((await call('POST', '/v1/mc/link', { token: ala.token, body: { uuid, name: 'Kowal', offline: true }, ip: home })).status, 200);

    // a HUD on the same server, however its address is typed
    const seen = await lookup(uuid, 'MC.Example.pl:25565');
    assert.deepEqual(seen.skins, { [uuid]: { hash, slim: true } });
    assert.equal(seen.cosmetics[uuid]?.cape, 'aurora');
    // an old HUD that does not say its server: nothing for the offline account
    const old = await lookup(uuid);
    assert.equal(old.skins, undefined);
    assert.equal(old.cosmetics[uuid], undefined);
    // another server: nothing
    const other = await lookup(uuid, 'other.pl');
    assert.equal(other.skins, undefined);
    assert.equal(other.cosmetics[uuid], undefined);
    // a single-player world or LAN: the key of no server
    assert.equal((await lookup(uuid, '')).skins, undefined);

    // switched off: the game gets neither
    app.settings.set({ 'feature.offlineSkins': false }, 'test');
    try {
      const off = await lookup(uuid, 'mc.example.pl');
      assert.equal(off.skins, undefined);
      assert.equal(off.cosmetics[uuid], undefined);
    } finally {
      app.settings.set({ 'feature.offlineSkins': null }, 'test');
    }

    // a nick with no skin: the set still shows
    await heartbeat(offlineUuid('Bez_Skina'), home);
    await call('POST', '/v1/mc/link', { token: ala.token, body: { uuid: offlineUuid('Bez_Skina'), name: 'Bez_Skina', offline: true }, ip: home });
    const plain = await lookup(offlineUuid('Bez_Skina'), 'mc.example.pl');
    assert.equal(plain.skins, undefined);
    assert.equal(plain.cosmetics[offlineUuid('Bez_Skina')]?.cape, 'aurora');
  });

  it('gives nothing when the game reporting that uuid is on another address', async () => {
    const eve = await login('Ewa');
    app.db.grant(eve.user.id, 'aurora');
    app.db.setCape(eve.user.id, 'aurora');
    await call('PUT', '/v1/me/offline-skins/Zed', { token: eve.token, body: { png: b64(skin()), slim: false } });
    const uuid = offlineUuid('Zed');
    await online(eve.token, 'mc.example.pl');
    // the real Zed plays from home; someone else's launcher claims the nick from elsewhere
    await heartbeat(uuid, '192.0.2.20');
    assert.equal((await call('POST', '/v1/mc/link', { token: eve.token, body: { uuid, name: 'Zed', offline: true }, ip: '192.0.2.99' })).status, 200);
    const seen = await lookup(uuid, 'mc.example.pl');
    assert.equal(seen.skins, undefined);
    assert.equal(seen.cosmetics[uuid], undefined);
  });

  it('tells the launchers on the server when the skin changes', async () => {
    const p = await login('Piotr');
    const ws = await online(p.token, 'skins.example.pl');
    const events: any[] = [];
    ws.on('message', (d) => events.push(JSON.parse(String(d))));
    const uuid = offlineUuid('Piotrek');
    await heartbeat(uuid, '192.0.2.30');
    await call('POST', '/v1/mc/link', { token: p.token, body: { uuid, name: 'Piotrek', offline: true }, ip: '192.0.2.30' });
    events.length = 0;
    await call('PUT', '/v1/me/offline-skins/Piotrek', { token: p.token, body: { png: b64(skin()), slim: false } });
    for (let i = 0; i < 100 && !events.some((e) => e.type === 'cosmetics'); i++) await new Promise((r) => setTimeout(r, 20));
    const event = events.find((e) => e.type === 'cosmetics');
    assert.ok(event, 'no cosmetics event');
    assert.ok(event.uuids.includes(uuid));
  });
});

describe('offline skins in the admin panel and with the account', () => {
  it('lists them in the drawer, deletes one with a log entry, and they go with the account (and come back with it)', async () => {
    const boss = await login('Szef');
    const g = await login('Gosia');
    await call('PUT', '/v1/me/offline-skins/Gosia_PL', { token: g.token, body: { png: b64(skin()), slim: false } });
    await call('PUT', '/v1/me/offline-skins/Druga', { token: g.token, body: { png: b64(skin()), slim: true } });
    const content = (await call('GET', `/v1/admin/users/${g.user.id}/extras/content`, { token: boss.token })).body;
    assert.deepEqual(content.offlineSkins.map((s: any) => s.name), ['Druga', 'Gosia_PL']);
    assert.equal((await call('DELETE', `/v1/admin/users/${g.user.id}/offline-skins/Gosia_PL`, { token: g.token })).status, 403);
    const del = await call('DELETE', `/v1/admin/users/${g.user.id}/offline-skins/Gosia_PL`, { token: boss.token });
    assert.equal(del.status, 200);
    assert.deepEqual(del.body.offlineSkins.map((s: any) => s.name), ['Druga']);
    assert.equal((await call('DELETE', `/v1/admin/users/${g.user.id}/offline-skins/Gosia_PL`, { token: boss.token })).status, 404);
    assert.ok(app.db.logFor(g.user.id, 50).some((l: any) => l.action === 'offline_skin_remove'));

    // the player's data export has them
    const exported = (await call('GET', `/v1/admin/users/${g.user.id}/export`, { token: boss.token })).body;
    assert.equal(exported.tables.offline_skins?.length, 1);

    await app.accounts.remove(g.user.id, boss.user.id);
    assert.equal(app.offlineSkins.store.list(g.user.id).length, 0);
    const deleted = (await call('GET', '/v1/admin/deleted-accounts', { token: boss.token })).body;
    const row = (deleted.accounts ?? deleted.deleted ?? deleted).find((d: any) => d.handle === 'Gosia');
    assert.equal((await call('POST', `/v1/admin/deleted-accounts/${row.id}/restore`, { token: boss.token })).status, 200);
    assert.deepEqual(app.offlineSkins.store.list(g.user.id).map((s) => s.name), ['Druga']);
  });
});
