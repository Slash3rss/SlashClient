import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { cleanReport } from '../src/friendsPopular.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-popular-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
type Login = { token: string; user: { id: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Login;
async function befriend(a: Login, b: Login, bHandle: string) {
  await call('POST', '/v1/friends/requests', a.token, { handle: bHandle });
  await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
}

const SODIUM = { source: 'modrinth', id: 'AANobbMI', type: 'mod', loader: 'fabric', gameVersion: '1.21.4' };
const IRIS = { source: 'modrinth', id: 'YL57xq9U', type: 'mod', loader: 'fabric', gameVersion: '1.21.4' };
const JEI = { source: 'curseforge', id: '238222', type: 'mod', loader: 'forge', gameVersion: '1.20.1' };
const FAITHFUL = { source: 'modrinth', id: '9pZrDmPq', type: 'resourcepack', loader: 'fabric', gameVersion: '1.21.4' };
const recent = (address: string) => ({ address, at: Date.now() - 86_400_000 });

describe('popular among friends', () => {
  let me: Login, ala: Login, bob: Login, cez: Login, obcy: Login;

  before(async () => {
    app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, adminHandles: ['Szef'], oauth: {} });
    await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    app.settings.set({ 'friendsPopular.cacheSeconds': 0, 'friendsPopular.reportsPerMinute': 600 }, 'test');
    me = await login('Janek');
    ala = await login('Ala');
    bob = await login('Bob');
    cez = await login('Cez');
    obcy = await login('Obcy');
    await befriend(me, ala, 'Ala');
    await befriend(me, bob, 'Bob');
    await befriend(me, cez, 'Cez');
    await befriend(ala, bob, 'Bob');
  });

  after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps only recognised projects and recent servers from a report', () => {
    const s = { maxItems: 3, maxServers: 2, serverDays: 30 };
    const now = Date.now();
    const report = cleanReport({
      content: [SODIUM, SODIUM, { ...SODIUM, id: 'sodium-fabric-0.6.jar' }, { source: 'disk', id: 'AAAAAAAA', type: 'mod' }, { ...JEI, id: '12ab' }, { ...JEI, type: 'world' }, JEI, IRIS, FAITHFUL],
      servers: [{ address: 'Mc.Hypixel.net:25565', at: now - 1000 }, { address: 'mc.hypixel.net', at: now - 5000 }, { address: 'old.pl', at: now - 40 * 86_400_000 }, { address: 'bad address!', at: now }, { address: 'skyup.pl', at: now }, { address: 'third.pl', at: now }],
    }, s, now);
    assert.deepEqual(report.content.map((c) => `${c.source}:${c.id}`), ['modrinth:AANobbMI', 'curseforge:238222', 'modrinth:YL57xq9U']);
    assert.deepEqual(report.servers, [{ address: 'mc.hypixel.net', at: now - 1000 }, { address: 'skyup.pl', at: now }]);
    assert.deepEqual(cleanReport({ content: 'x', servers: null }, s), { content: [], servers: [] });
  });

  it('counts only friends who share, with their nicks and no one\'s own list', async () => {
    // everyone shares with all friends by default
    assert.equal((await call('GET', '/v1/me/popular-sharing', ala.token)).body.mode, 'all');
    assert.equal((await call('POST', '/v1/me/popular', ala.token, { content: [SODIUM, IRIS, FAITHFUL], servers: [recent('skyup.pl'), recent('mc.hypixel.net')] })).status, 200);
    assert.equal((await call('POST', '/v1/me/popular', bob.token, { content: [SODIUM, JEI], servers: [recent('skyup.pl')] })).status, 200);
    // not a friend of mine: never counted
    assert.equal((await call('POST', '/v1/me/popular', obcy.token, { content: [SODIUM, JEI, IRIS], servers: [recent('skyup.pl')] })).status, 200);

    const res = (await call('GET', '/v1/friends/popular', me.token)).body;
    assert.equal(res.enabled, true);
    const sodium = res.content.find((c: any) => c.id === SODIUM.id);
    assert.equal(sodium.count, 2);
    assert.deepEqual(sodium.friends.map((f: any) => f.name), ['Ala', 'Bob']);
    // mods first by count, then packs; nothing but counts and nicks
    assert.deepEqual(res.content.map((c: any) => `${c.type}:${c.id}:${c.count}`), ['mod:AANobbMI:2', 'mod:238222:1', 'mod:YL57xq9U:1', 'resourcepack:9pZrDmPq:1']);
    assert.deepEqual(Object.keys(sodium).sort(), ['count', 'friends', 'id', 'source', 'type']);
    assert.deepEqual(Object.keys(sodium.friends[0]).sort(), ['avatar', 'handle', 'id', 'name']);
    assert.ok(!JSON.stringify(res).includes('1.21.4') && !JSON.stringify(res).includes('fabric'), 'no versions or loaders of friends');
    assert.deepEqual(res.servers.map((s: any) => `${s.address}:${s.count}`), ['skyup.pl:2', 'mc.hypixel.net:1']);
    assert.ok(!JSON.stringify(res).includes(obcy.user.id));
    // a mod for another loader does not fit a Fabric profile; packs fit any
    const fabric = (await call('GET', '/v1/friends/popular?loader=fabric', me.token)).body;
    assert.deepEqual(fabric.content.map((c: any) => c.id), ['AANobbMI', 'YL57xq9U', '9pZrDmPq']);
    assert.equal((await call('GET', '/v1/friends/popular?loader=Fab ric', me.token)).status, 400);
    // another player cannot read someone's list by any route
    assert.equal((await call('GET', `/v1/friends/${ala.user.id}/popular`, me.token)).status, 404);
    assert.equal((await call('GET', '/v1/me/popular', me.token)).status, 404);
    assert.equal((await call('GET', '/v1/friends/popular')).status, 401);
  });

  it('follows the choice: picked friends only, or nobody (then nothing is kept)', async () => {
    // Ala shares only with Bob: I no longer count her
    const picked = (await call('POST', '/v1/me/popular-sharing', ala.token, { mode: 'some', friends: [bob.user.id, obcy.user.id] })).body;
    assert.deepEqual([picked.mode, picked.friends], ['some', [bob.user.id]]);
    let res = (await call('GET', '/v1/friends/popular', me.token)).body;
    assert.equal(res.content.find((c: any) => c.id === SODIUM.id).count, 1);
    assert.equal(res.content.find((c: any) => c.id === IRIS.id), undefined);
    assert.ok(!JSON.stringify(res).includes(ala.user.id));
    // Bob is picked: he still sees her
    const forBob = (await call('GET', '/v1/friends/popular', bob.token)).body;
    assert.deepEqual(forBob.content.find((c: any) => c.id === IRIS.id).friends.map((f: any) => f.name), ['Ala']);
    // picking me again brings her back
    await call('POST', '/v1/me/popular-sharing', ala.token, { mode: 'some', friends: [bob.user.id, me.user.id] });
    res = (await call('GET', '/v1/friends/popular', me.token)).body;
    assert.equal(res.content.find((c: any) => c.id === SODIUM.id).count, 2);

    // nobody: her list is gone, and a new report is not kept
    await call('POST', '/v1/me/popular-sharing', ala.token, { mode: 'off' });
    assert.equal(app.popular.store.rows([ala.user.id], 0, 0).length, 0);
    assert.deepEqual((await call('POST', '/v1/me/popular', ala.token, { content: [SODIUM] })).body, { ok: true, stored: false });
    assert.equal(app.popular.store.rows([ala.user.id], 0, 0).length, 0);
    res = (await call('GET', '/v1/friends/popular', me.token)).body;
    assert.equal(res.content.find((c: any) => c.id === SODIUM.id).count, 1);
    assert.equal(res.servers.find((s: any) => s.address === 'mc.hypixel.net'), undefined);
    // a bad choice changes nothing
    assert.equal((await call('POST', '/v1/me/popular-sharing', ala.token, { mode: 'everyone' })).status, 400);
    assert.equal((await call('GET', '/v1/me/popular-sharing', ala.token)).body.mode, 'off');
    await call('POST', '/v1/me/popular-sharing', ala.token, { mode: 'all' });
  });

  it('keeps to the admin\'s limits', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ source: 'curseforge', id: String(1000 + i), type: 'shader', loader: '', gameVersion: '' }));
    app.settings.set({ 'friendsPopular.maxItems': 20 }, 'test');
    const stored = (await call('POST', '/v1/me/popular', cez.token, { content: many, servers: Array.from({ length: 40 }, (_, i) => recent(`s${i}.pl`)) })).body;
    assert.deepEqual([stored.content, stored.servers], [20, 30]);
    app.settings.set({ 'friendsPopular.maxResults': 5 }, 'test');
    const res = (await call('GET', '/v1/friends/popular', me.token)).body;
    assert.equal(res.content.filter((c: any) => c.type === 'shader').length, 5);
    assert.equal(res.servers.length, 5);
    // an old list stops counting and is pruned
    app.settings.set({ 'friendsPopular.keepDays': 1 }, 'test');
    assert.equal(app.popular.prune(Date.now() + 2 * 86_400_000), 3);
    assert.equal((await call('GET', '/v1/friends/popular', me.token)).body.content.length, 0);
    app.settings.set({ 'friendsPopular.maxItems': 400, 'friendsPopular.maxResults': 12, 'friendsPopular.keepDays': 60 }, 'test');
    // results are kept for the admin's time
    await call('POST', '/v1/me/popular', bob.token, { content: [SODIUM] });
    app.popular.clearCache();
    app.settings.set({ 'friendsPopular.cacheSeconds': 600 }, 'test');
    assert.equal((await call('GET', '/v1/friends/popular', me.token)).body.content.length, 1);
    await call('POST', '/v1/me/popular', bob.token, { content: [SODIUM, IRIS] });
    assert.equal((await call('GET', '/v1/friends/popular', me.token)).body.content.length, 1);
    app.settings.set({ 'friendsPopular.cacheSeconds': 0 }, 'test');
    assert.equal((await call('GET', '/v1/friends/popular', me.token)).body.content.length, 2);
    // reports are rate limited
    app.settings.set({ 'friendsPopular.reportsPerMinute': 1 }, 'test');
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await call('POST', '/v1/me/popular', obcy.token, { content: [SODIUM] })).status);
    assert.ok(statuses.includes(429));
    app.settings.set({ 'friendsPopular.reportsPerMinute': 600 }, 'test');
  });

  it('turns off with the admin\'s switch, and shows its settings in the panel', async () => {
    app.settings.set({ 'friendsPopular.enabled': false }, 'test');
    assert.deepEqual((await call('GET', '/v1/friends/popular', me.token)).body, { enabled: false, content: [], servers: [] });
    assert.equal((await call('POST', '/v1/me/popular', bob.token, { content: [JEI] })).status, 403);
    assert.equal((await call('GET', '/v1/me/popular-sharing', bob.token)).body.enabled, false);
    app.settings.set({ 'friendsPopular.enabled': true }, 'test');
    assert.equal((await call('GET', '/v1/friends/popular', me.token)).body.enabled, true);
    // the default for players who never chose
    app.settings.set({ 'friendsPopular.defaultMode': 'off' }, 'test');
    assert.equal((await call('GET', '/v1/me/popular-sharing', cez.token)).body.mode, 'off');
    assert.equal((await call('GET', '/v1/me/popular-sharing', ala.token)).body.mode, 'all');
    app.settings.set({ 'friendsPopular.defaultMode': 'all' }, 'test');

    const admin = await login('Szef');
    const res = (await call('GET', '/v1/admin/settings', admin.token)).body;
    const keys = res.settings.filter((s: any) => s.category === 'friendsPopular').map((s: any) => s.key);
    for (const k of ['friendsPopular.enabled', 'friendsPopular.maxItems', 'friendsPopular.cacheSeconds', 'friendsPopular.maxResults']) assert.ok(keys.includes(k), k);
  });
});
