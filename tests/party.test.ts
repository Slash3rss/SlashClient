import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';
import { applyPartyEvent, type Party } from '../src/renderer/party';
import { waypointDimension, waypointWorld } from '../src/renderer/sharedWaypoint';

const person = (id: string) => ({ id, handle: id, name: id, avatar: '' });
const party = (id: string, extra: Partial<Party> = {}): Party => ({
  id, leader: person('lead'), server: 'skyup.pl', createdAt: 0, expiresAt: Date.now() + 60_000,
  members: [{ ...person('lead'), status: 'accepted' }, { ...person('ola'), status: 'invited' }], ...extra,
});

describe('parties and shared waypoints in the launcher', () => {
  it('keeps the party list up to date from events', () => {
    let list = applyPartyEvent([], party('a'));
    assert.deepEqual(list.map((p) => p.id), ['a']);
    list = applyPartyEvent(list, party('b'));
    // an update replaces, a disbanded or expired party goes away
    list = applyPartyEvent(list, party('a', { members: [{ ...person('lead'), status: 'accepted' }, { ...person('ola'), status: 'accepted' }] }));
    assert.deepEqual(list.map((p) => p.id), ['a', 'b']);
    assert.equal(list[0].members[1].status, 'accepted');
    assert.deepEqual(applyPartyEvent(list, party('a', { disbanded: true })).map((p) => p.id), ['b']);
    assert.deepEqual(applyPartyEvent(list, party('c', { expiresAt: Date.now() - 1 })).map((p) => p.id), ['a', 'b']);
  });

  it('describes where a shared waypoint is', () => {
    const w = { name: 'Baza', x: 1, y: 2, z: 3, dimension: 'minecraft:the_nether', world: 'server:skyup.pl' };
    assert.equal(waypointWorld(w), 'skyup.pl');
    assert.equal(waypointDimension(w), 'Nether');
    assert.equal(waypointDimension({ ...w, dimension: 'mymod:moon' }), 'mymod:moon');
    assert.match(waypointWorld({ ...w, world: 'world:Nowy świat' }), /Nowy świat/);
  });

  it('lets the game share waypoints and run parties through the bridge', async () => {
    const calls: string[] = [];
    const bridge = new GameBridge({
      call: async (method, path) => {
        calls.push(`${method} ${path}`);
        return { ok: true };
      },
      state: () => ({ signedIn: true }),
    });
    const { url, key } = await bridge.start();
    const req = (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await req('/v1/waypoints', 'POST', { to: ['a'], name: 'x' })).status, 200);
    assert.equal((await req('/v1/parties')).status, 200);
    assert.equal((await req('/v1/parties', 'POST', { members: ['a'], server: 'skyup.pl' })).status, 200);
    assert.equal((await req('/v1/parties/abc/accept', 'POST')).status, 200);
    assert.equal((await req('/v1/parties/abc/leave', 'POST')).status, 200);
    assert.equal((await req('/v1/parties/abc', 'DELETE')).status, 200);
    assert.equal((await req('/v1/parties/abc/kick', 'POST')).status, 403);
    assert.deepEqual(calls, ['POST /v1/waypoints', 'GET /v1/parties', 'POST /v1/parties', 'POST /v1/parties/abc/accept', 'POST /v1/parties/abc/leave', 'DELETE /v1/parties/abc']);
    // party changes reach the game
    bridge.push({ type: 'party', party: { id: 'abc' } });
    const got = await (await req('/events?after=0')).json();
    assert.deepEqual(got.events.map((e: { type: string }) => e.type), ['party']);
    bridge.stop();
  });
});
