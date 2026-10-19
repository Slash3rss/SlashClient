import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { SprayLimit, cleanSpray } from '../src/sprays.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-sprays-'));
let base = '';
let app: ReturnType<typeof createApp>;

/** Players who "joined" at Mojang: server id → Minecraft profile (what hasJoined answers). */
const joined = new Map<string, { id: string; name: string }>();
const fakeFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.startsWith('https://sessionserver.mojang.com/session/minecraft/hasJoined?')) {
    const q = new URL(url).searchParams;
    const p = joined.get(q.get('serverId') ?? '');
    return p && p.name === q.get('username') ? Response.json({ ...p, properties: [] }) : new Response(null, { status: 204 });
  }
  throw new Error(`unexpected ${url}`);
};

async function call(method: string, url: string, token?: string, body?: unknown, client?: string) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(client ? { 'X-SlashClient': client } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

/** A Minecraft account proven at Mojang, linked as the player the launcher's game plays as. */
async function inGame(token: string, name: string, uuid: string) {
  const { serverId } = (await call('POST', '/v1/auth/minecraft/start')).body;
  joined.set(serverId, { id: uuid.replace(/-/g, ''), name });
  await call('POST', '/v1/auth/minecraft/finish', token, { serverId, name });
  await call('POST', '/v1/mc/link', token, { uuid });
}

/** A connected launcher that collects the events it gets. */
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

const settle = () => new Promise((r) => setTimeout(r, 120));
/** Closes the launchers' connections and lets the server see them go (it notes when each was last seen). */
async function disconnect(...live: { ws: WebSocket }[]) {
  await Promise.all(live.map((l) => new Promise((r) => { l.ws.once('close', r); l.ws.close(); })));
  await settle();
}

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, adminHandles: [], oauth: {}, fetchImpl: fakeFetch });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('sprays', () => {
  const at = { spray: 'spray_heart', server: 'SkyUp.pl', dimension: 'minecraft:overworld', x: 10, y: 64, z: -5, face: 'north', rot: 0 };

  it('accepts only well-formed sprays', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    assert.deepEqual(cleanSpray({ uuid: uuid.toUpperCase(), ...at }), { uuid, ...at });
    // no server (a singleplayer or LAN world) and no turn are fine
    assert.deepEqual(cleanSpray({ uuid, ...at, server: undefined, rot: undefined }), { uuid, ...at, server: '', rot: 0 });
    for (const bad of [
      { uuid: 'nope' }, { spray: '../x' }, { spray: 'x'.repeat(40) }, { dimension: 'overworld' }, { dimension: 'minecraft:<b>' },
      { server: 'evil.pl/x' }, { x: 1.5 }, { x: 40_000_000 }, { y: 9999 }, { z: '3' }, { face: 'inside' }, { rot: 4 }, { rot: -1 },
    ]) assert.equal(cleanSpray({ uuid, ...at, ...bad }), undefined, JSON.stringify(bad));
    assert.equal(cleanSpray(null), undefined);
    assert.equal(cleanSpray('spray'), undefined);
  });

  it('limits sprays to one every 3 seconds and 20 a minute', () => {
    const limit = new SprayLimit();
    let now = 1_000_000;
    assert.ok(limit.allow('a', now));
    assert.ok(!limit.allow('a', now + 2999));
    // someone else is not held up
    assert.ok(limit.allow('b', now + 10));
    assert.ok(limit.allow('a', now + 3000));
    // a fast (modified) game: one every 3 seconds is 20 a minute, the 21st within the minute waits
    const fast = new SprayLimit(3000, 5);
    for (let i = 0; i < 5; i++) assert.ok(fast.allow('c', now + i * 3000), `spray ${i}`);
    assert.ok(!fast.allow('c', now + 5 * 3000));
    assert.ok(fast.allow('c', now + 60_000));
    now += 120_000;
    assert.ok(limit.allow('a', now));
  });

  it('is in the catalog for 0.9.20 on', async () => {
    const ewa = await login('SprayCatalog');
    const sprays = (await call('GET', '/v1/cosmetics', ewa.token, undefined, 'launcher/0.9.20')).body.items.filter((i: any) => i.slot === 'spray');
    assert.equal(sprays.length, 8);
    assert.ok(sprays.every((i: any) => i.available && i.id.startsWith('spray_')));
    assert.ok(!(await call('GET', '/v1/cosmetics', ewa.token, undefined, 'launcher/0.9.19')).body.items.some((i: any) => i.slot === 'spray'));
    assert.ok(!(await call('GET', '/v1/cosmetics', ewa.token, undefined, 'mod/0.9.19')).body.items.some((i: any) => i.slot === 'spray'));
    // worn like the other slots, only in its own
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { spray: 'spray_gg' } })).body.loadout.spray, 'spray_gg');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { spray: 'confetti' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { kill: 'spray_gg' } })).body.error, 'bad_item');
  });

  it('reaches players on the same server only, and not too often', async () => {
    const ewa = await login('SprayEwa');
    const tom = await login('SprayTom');
    const ola = await login('SprayOla');
    const ewaMc = '1a1a1a1a-2222-3333-4444-555555555555';
    const tomMc = '2b2b2b2b-2222-3333-4444-555555555555';
    await inGame(ewa.token, 'SprayEwa', ewaMc);
    await inGame(tom.token, 'SprayTom', tomMc);
    await call('POST', '/v1/me', ewa.token, { loadout: { spray: 'spray_heart' } });
    const ewaLive = await connect(ewa.token, { status: 'online', activity: { kind: 'server', server: 'SkyUp.pl:25565' } });
    const tomLive = await connect(tom.token, { status: 'online', activity: { kind: 'server', server: 'skyup.pl' } });
    const olaLive = await connect(ola.token, { status: 'online', activity: { kind: 'server', server: 'other.pl' } });

    // only as one's own player in the game, only what one wears, only sane places
    assert.equal((await call('POST', '/v1/mc/spray', ewa.token, { uuid: tomMc, ...at })).body.error, 'not_linked');
    assert.equal((await call('POST', '/v1/mc/spray', ewa.token, { uuid: ewaMc, ...at, spray: 'spray_skull' })).body.error, 'not_worn');
    assert.equal((await call('POST', '/v1/mc/spray', ewa.token, { uuid: ewaMc, ...at, face: 'inside' })).status, 400);
    assert.equal((await call('POST', '/v1/mc/spray', undefined, { uuid: ewaMc, ...at })).status, 401);

    assert.deepEqual((await call('POST', '/v1/mc/spray', ewa.token, { uuid: ewaMc, ...at })).body, { ok: true });
    const got = await tomLive.waitFor((e) => e.type === 'spray');
    assert.deepEqual({ ...got, at: 0 }, { type: 'spray', uuid: ewaMc, ...at, at: 0 });
    // again at once: too soon (the game waits 3 seconds itself)
    assert.equal((await call('POST', '/v1/mc/spray', ewa.token, { uuid: ewaMc, ...at, x: 11 })).status, 429);
    await settle();
    assert.equal(tomLive.events.filter((e) => e.type === 'spray').length, 1);
    // not to another server, and not back to the sprayer (the game drew it already)
    assert.ok(!olaLive.events.some((e) => e.type === 'spray'));
    assert.ok(!ewaLive.events.some((e) => e.type === 'spray'));
    await disconnect(ewaLive, tomLive, olaLive);
  });

  it('in a world opened to LAN reaches only friends in a game', async () => {
    const host = await login('SprayHost');
    const friend = await login('SprayFriend');
    const stranger = await login('SprayStranger');
    const hostMc = '3c3c3c3c-2222-3333-4444-555555555555';
    await inGame(host.token, 'SprayHost', hostMc);
    await call('POST', '/v1/me', host.token, { loadout: { spray: 'spray_lol' } });
    await call('POST', '/v1/friends/requests', host.token, { handle: 'SprayFriend' });
    await call('POST', `/v1/friends/requests/${host.user.id}/accept`, friend.token);
    const inWorld = { status: 'online', activity: { kind: 'singleplayer' } };
    const hostLive = await connect(host.token, inWorld);
    const friendLive = await connect(friend.token, inWorld);
    const strangerLive = await connect(stranger.token, inWorld);
    assert.deepEqual((await call('POST', '/v1/mc/spray', host.token, { uuid: hostMc, ...at, spray: 'spray_lol', server: '', face: 'up', rot: 2 })).body, { ok: true });
    const got = await friendLive.waitFor((e) => e.type === 'spray');
    assert.equal(got.spray, 'spray_lol');
    assert.equal(got.face, 'up');
    assert.equal(got.rot, 2);
    await settle();
    assert.ok(!strangerLive.events.some((e) => e.type === 'spray'));
    await disconnect(hostLive, friendLive, strangerLive);
  });
});
