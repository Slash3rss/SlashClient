import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { cleanPosition, cleanSharing } from '../src/positions.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-positions-'));
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

const onServer = (server: string) => ({ status: 'online', activity: { kind: 'server', server } });

async function connect(token: string, presence?: unknown) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token, presence }));
  const waitFor = async (pred: (e: any) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const hit = events.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('event did not come');
  };
  await waitFor((e) => e.type === 'ready');
  return { ws, events, waitFor };
}
/** Closed and noticed by the server (its 'close' handler writes to the database, which the last test's end closes). */
async function hangUp(...lives: { ws: WebSocket }[]) {
  await Promise.all(lives.map((l) => new Promise((r) => {
    l.ws.once('close', r);
    l.ws.close();
  })));
  await new Promise((r) => setTimeout(r, 100));
}
const settle = () => new Promise((r) => setTimeout(r, 150));
const positions = (events: any[]) => events.filter((e) => e.type === 'friend-position' && !e.gone);

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {} });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const here = { server: 'Play.SkyUp.pl:25565', dimension: 'minecraft:overworld', x: 120.34, y: 64, z: -3400.06, yaw: -90 };

describe('friends on the minimap', () => {
  it('checks what a position may be', () => {
    assert.deepEqual(cleanPosition(here), { server: 'play.skyup.pl', dimension: 'minecraft:overworld', x: 120.3, y: 64, z: -3400.1, yaw: 270 });
    assert.equal(cleanPosition({ ...here, x: 40_000_000 }), undefined);
    assert.equal(cleanPosition({ ...here, y: Number.NaN }), undefined);
    assert.equal(cleanPosition({ ...here, z: '5' }), undefined);
    assert.equal(cleanPosition({ ...here, server: 'http://evil' }), undefined);
    assert.equal(cleanPosition({ ...here, dimension: 'ResourceKey[x]' }), undefined);
    assert.deepEqual(cleanSharing({ mode: 'some', friends: ['a', 'a', 'b'] }), { mode: 'some', friends: ['a', 'b'] });
    assert.equal(cleanSharing({ mode: 'everyone' }), undefined);
    assert.equal(cleanSharing({ mode: 'all', friends: 'a' }), undefined);
    assert.equal(cleanSharing({ mode: 'some', friends: ['x'.repeat(65)] }), undefined);
  });

  it('is off until switched on, and goes only to friends on the same server', async () => {
    const ala = await login('PosAla');
    const bob = await login('PosBob');
    const cyr = await login('PosCyr');
    const obcy = await login('PosObcy');
    await befriend(ala, bob, 'PosBob');
    await befriend(ala, cyr, 'PosCyr');
    const alaLive = await connect(ala.token, onServer('play.skyup.pl'));
    const bobLive = await connect(bob.token, onServer('PLAY.skyup.pl:25565'));
    const cyrLive = await connect(cyr.token, onServer('other.example.com'));
    const obcyLive = await connect(obcy.token, onServer('play.skyup.pl'));

    // off by default: nothing goes
    assert.deepEqual((await call('GET', '/v1/me/position-sharing', ala.token)).body, { mode: 'off', friends: [] });
    assert.equal((await call('POST', '/v1/mc/position', ala.token, here)).status, 403);

    // on for all friends: Bob (same server) gets it, Cyr (another server) and a stranger do not
    assert.equal((await call('POST', '/v1/me/position-sharing', ala.token, { mode: 'all' })).status, 200);
    const sent = await call('POST', '/v1/mc/position', ala.token, here);
    assert.equal(sent.status, 200);
    assert.deepEqual(sent.body, { ok: true });
    const got = await bobLive.waitFor((e) => e.type === 'friend-position');
    assert.equal(got.from, ala.user.id);
    assert.equal(got.name, 'PosAla');
    assert.equal(got.server, 'play.skyup.pl');
    assert.equal(got.x, 120.3);
    assert.equal(got.dimension, 'minecraft:overworld');
    await settle();
    assert.equal(positions(cyrLive.events).length, 0);
    assert.equal(positions(obcyLive.events).length, 0);
    assert.equal(positions(alaLive.events).length, 0);

    // too soon after the last one: refused, and nothing more goes
    assert.equal((await call('POST', '/v1/mc/position', ala.token, here)).status, 429);
    await settle();
    assert.equal(positions(bobLive.events).length, 1);

    // the game may not claim another server than the one its launcher reported
    await new Promise((r) => setTimeout(r, 1600));
    assert.equal((await call('POST', '/v1/mc/position', ala.token, { ...here, server: 'other.example.com' })).status, 409);

    // only the friends picked: Bob is not, so he hears that the dot is gone and gets nothing more
    const some = await call('POST', '/v1/me/position-sharing', ala.token, { mode: 'some', friends: [cyr.user.id, obcy.user.id] });
    assert.deepEqual(some.body, { mode: 'some', friends: [cyr.user.id] }, 'a stranger cannot be picked');
    await bobLive.waitFor((e) => e.type === 'friend-position' && e.gone && e.from === ala.user.id);
    // Cyr comes to the same server: now he gets it
    cyrLive.ws.send(JSON.stringify({ type: 'presence', presence: onServer('play.skyup.pl') }));
    await settle();
    assert.equal((await call('POST', '/v1/mc/position', ala.token, here)).status, 200);
    await cyrLive.waitFor((e) => e.type === 'friend-position' && !e.gone);
    await settle();
    assert.equal(positions(bobLive.events).length, 1);

    // switched off (the game's switch sends only the mode): refused again, Cyr drops the dot, the pick stays for next time
    assert.deepEqual((await call('POST', '/v1/me/position-sharing', ala.token, { mode: 'off' })).body, { mode: 'off', friends: [cyr.user.id] });
    await cyrLive.waitFor((e) => e.type === 'friend-position' && e.gone);
    await new Promise((r) => setTimeout(r, 1600));
    assert.equal((await call('POST', '/v1/mc/position', ala.token, here)).status, 403);

    // bad requests and no sign-in
    assert.equal((await call('POST', '/v1/me/position-sharing', ala.token, { mode: 'everyone' })).status, 400);
    assert.equal((await call('POST', '/v1/mc/position', undefined, here)).status, 401);
    await hangUp(alaLive, bobLive, cyrLive, obcyLive);
  });

  it('needs the sender to be on a server, and not invisible', async () => {
    const dora = await login('PosDora');
    const ewa = await login('PosEwa');
    await befriend(dora, ewa, 'PosEwa');
    await call('POST', '/v1/me/position-sharing', dora.token, { mode: 'all' });
    // not connected at all
    assert.equal((await call('POST', '/v1/mc/position', dora.token, here)).status, 409);
    const doraLive = await connect(dora.token, { status: 'online', activity: { kind: 'menu' } });
    const ewaLive = await connect(ewa.token, onServer('play.skyup.pl'));
    assert.equal((await call('POST', '/v1/mc/position', dora.token, here)).status, 409);
    doraLive.ws.send(JSON.stringify({ type: 'presence', presence: { status: 'invisible', activity: { kind: 'server', server: 'play.skyup.pl' } } }));
    await settle();
    assert.equal((await call('POST', '/v1/mc/position', dora.token, here)).status, 409);
    await settle();
    assert.equal(positions(ewaLive.events).length, 0);
    await hangUp(doraLive, ewaLive);
  });
});
