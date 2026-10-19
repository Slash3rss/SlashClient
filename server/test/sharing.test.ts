import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { cleanWaypoint } from '../src/sharing.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-sharing-'));
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
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };
async function befriend(a: { token: string; user: { id: string } }, b: { token: string; user: { id: string } }, bHandle: string) {
  await call('POST', '/v1/friends/requests', a.token, { handle: bHandle });
  await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
}

async function connect(token: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token }));
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

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {} });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const point = { name: 'Baza', x: 120, y: 64, z: -3400, dimension: 'minecraft:overworld', world: 'server:SkyUp.pl' };

describe('shared waypoints', () => {
  it('checks what a waypoint may be', () => {
    assert.deepEqual(cleanWaypoint(point), { ...point, world: 'server:skyup.pl' });
    assert.equal(cleanWaypoint({ ...point, name: '' }), undefined);
    assert.equal(cleanWaypoint({ ...point, name: 'x'.repeat(33) }), undefined);
    assert.equal(cleanWaypoint({ ...point, x: 40_000_000 }), undefined);
    assert.equal(cleanWaypoint({ ...point, y: 1.5 }), undefined);
    assert.equal(cleanWaypoint({ ...point, z: '5' }), undefined);
    assert.equal(cleanWaypoint({ ...point, dimension: 'ResourceKey[x]' }), undefined);
    assert.equal(cleanWaypoint({ ...point, world: 'http://evil' }), undefined);
    assert.deepEqual(cleanWaypoint({ ...point, world: 'world:Mój świat' })?.world, 'world:Mój świat');
  });

  it('sends a waypoint to friends only, as a chat message', async () => {
    const ala = await login('WpAla');
    const bob = await login('WpBob');
    const cyr = await login('WpCyr');
    const stranger = await login('WpObcy');
    await befriend(ala, bob, 'WpBob');
    await befriend(ala, cyr, 'WpCyr');
    const bobLive = await connect(bob.token);

    assert.equal((await call('POST', '/v1/waypoints', ala.token, { ...point, to: [bob.user.id, stranger.user.id] })).body.error, 'not_friends');
    assert.equal((await call('POST', '/v1/waypoints', ala.token, { ...point, to: [] })).body.error, 'bad_request');
    assert.equal((await call('POST', '/v1/waypoints', ala.token, { ...point, to: [ala.user.id] })).body.error, 'self');
    assert.equal((await call('POST', '/v1/waypoints', ala.token, { ...point, x: 1e9, to: [bob.user.id] })).body.error, 'bad_waypoint');

    const sent = await call('POST', '/v1/waypoints', ala.token, { ...point, to: [bob.user.id, cyr.user.id, bob.user.id], extra: 1 });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.messages.length, 2);
    assert.deepEqual(sent.body.messages[0].waypoint, { ...point, world: 'server:skyup.pl' });
    assert.match(sent.body.messages[0].text, /Baza \(120, 64, -3400\)/);
    await bobLive.waitFor((e) => e.type === 'message' && e.message.waypoint?.name === 'Baza');
    // it stays in the chat; other messages have no waypoint field
    await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: 'tu jestem' });
    const history = (await call('GET', `/v1/messages/${ala.user.id}`, bob.token)).body.messages;
    assert.equal(history.at(-2).waypoint.name, 'Baza');
    assert.equal(history.at(-1).waypoint, undefined);
    bobLive.ws.close();
  });

  it('limits how many waypoints one player sends', async () => {
    const a = await login('WpSpam');
    const b = await login('WpSpamB');
    await befriend(a, b, 'WpSpamB');
    let limited = false;
    for (let i = 0; i < 25 && !limited; i++) limited = (await call('POST', '/v1/waypoints', a.token, { ...point, to: [b.user.id] })).status === 429;
    assert.ok(limited);
  });
});

describe('parties', () => {
  it('invites several friends at once and shows who accepted', async () => {
    const lead = await login('PtLead');
    const m1 = await login('PtOne');
    const m2 = await login('PtTwo');
    const stranger = await login('PtObcy');
    await befriend(lead, m1, 'PtOne');
    await befriend(lead, m2, 'PtTwo');
    const live1 = await connect(m1.token);
    const live2 = await connect(m2.token);

    assert.equal((await call('POST', '/v1/parties', lead.token, { members: [m1.user.id, stranger.user.id], server: 'skyup.pl' })).body.error, 'not_friends');
    assert.equal((await call('POST', '/v1/parties', lead.token, { members: [m1.user.id], server: 'not a server' })).body.error, 'bad_server');
    const many = Array.from({ length: 8 }, (_, i) => `x${i}`);
    assert.equal((await call('POST', '/v1/parties', lead.token, { members: many, server: 'skyup.pl' })).body.error, 'too_many');

    const made = await call('POST', '/v1/parties', lead.token, { members: [m1.user.id, m2.user.id], server: 'SkyUp.pl', version: '26.3' });
    assert.equal(made.status, 200);
    const party = made.body.party;
    assert.equal(party.leader.id, lead.user.id);
    assert.equal(party.server, 'skyup.pl');
    assert.deepEqual(party.members.map((m: any) => m.status), ['accepted', 'invited', 'invited']);
    // each member gets the usual invite, with the party's id
    const inv = await live1.waitFor((e) => e.type === 'message' && e.message.invite?.party === party.id);
    assert.deepEqual(inv.message.invite, { server: 'skyup.pl', version: '26.3', party: party.id });
    await live2.waitFor((e) => e.type === 'party' && e.party.id === party.id);

    // accepting and declining go to everyone in it
    assert.equal((await call('POST', `/v1/parties/${party.id}/accept`, m1.token)).body.party.members.find((m: any) => m.id === m1.user.id).status, 'accepted');
    await live2.waitFor((e) => e.type === 'party' && e.party.members.some((m: any) => m.id === m1.user.id && m.status === 'accepted'));
    await call('POST', `/v1/parties/${party.id}/decline`, m2.token);
    const listed = (await call('GET', '/v1/parties', lead.token)).body.parties;
    assert.deepEqual(listed[0].members.map((m: any) => m.status), ['accepted', 'accepted', 'declined']);
    // outsiders do not see it; only the leader disbands
    assert.deepEqual((await call('GET', '/v1/parties', stranger.token)).body.parties, []);
    assert.equal((await call('POST', `/v1/parties/${party.id}/accept`, stranger.token)).status, 404);
    assert.equal((await call('DELETE', `/v1/parties/${party.id}`, m1.token)).body.error, 'not_leader');
    assert.equal((await call('POST', `/v1/parties/${party.id}/accept`, lead.token)).body.error, 'leader');
    assert.equal((await call('DELETE', `/v1/parties/${party.id}`, lead.token)).status, 200);
    await live1.waitFor((e) => e.type === 'party' && e.party.id === party.id && e.party.disbanded);
    assert.deepEqual((await call('GET', '/v1/parties', m1.token)).body.parties, []);
    assert.equal((await call('POST', `/v1/parties/${party.id}/accept`, m1.token)).status, 404);
    live1.ws.close();
    live2.ws.close();
  });

  it('keeps one party per leader and ends it when the leader leaves', async () => {
    const lead = await login('PtLead2');
    const m = await login('PtMem2');
    await befriend(lead, m, 'PtMem2');
    const first = (await call('POST', '/v1/parties', lead.token, { members: [m.user.id], server: 'a.pl' })).body.party;
    const second = (await call('POST', '/v1/parties', lead.token, { members: [m.user.id], server: 'b.pl' })).body.party;
    const mine = (await call('GET', '/v1/parties', m.token)).body.parties;
    assert.deepEqual(mine.map((p: any) => p.id), [second.id]);
    assert.notEqual(first.id, second.id);
    assert.equal((await call('POST', `/v1/parties/${second.id}/leave`, m.token)).body.party.members[1].status, 'left');
    await call('POST', `/v1/parties/${second.id}/leave`, lead.token);
    assert.deepEqual((await call('GET', '/v1/parties', m.token)).body.parties, []);
  });
});
