import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setLang, t } from '../src/shared/i18n';
import { cleanSharing, sharingSummary, togglePicked } from '../src/renderer/positionSharing';
import { GameBridge } from '../src/main/bridge';

describe('friends on the minimap', () => {
  const friends = [{ id: 'ala', name: 'Ala' }, { id: 'bob', name: 'Bob' }];

  it('keeps the server\'s choice only when it makes sense', () => {
    assert.deepEqual(cleanSharing({ mode: 'some', friends: ['ala', 'ala', 'bad id!', 5] }), { mode: 'some', friends: ['ala'] });
    assert.deepEqual(cleanSharing({ mode: 'everyone' }), { mode: 'off', friends: [] });
    assert.deepEqual(cleanSharing(null), { mode: 'off', friends: [] });
    assert.deepEqual(togglePicked({ mode: 'some', friends: ['ala'] }, 'bob', true), { mode: 'some', friends: ['ala', 'bob'] });
    assert.deepEqual(togglePicked({ mode: 'some', friends: ['ala', 'bob'] }, 'ala', false), { mode: 'some', friends: ['bob'] });
  });

  it('says who sees it, in Polish and in English', () => {
    assert.equal(sharingSummary({ mode: 'off', friends: ['ala'] }, friends), 'Twoja pozycja nie jest wysyłana nikomu.');
    assert.equal(sharingSummary({ mode: 'some', friends: ['bob', 'ala'] }, friends), 'Widzą Cię na minimapie: Ala, Bob.');
    assert.equal(sharingSummary({ mode: 'some', friends: [] }, friends), 'Nikt nie jest wybrany: nikt Cię nie widzi.');
    setLang('en');
    try {
      assert.equal(sharingSummary({ mode: 'all', friends: [] }, friends), 'All friends on the same server see you on their minimap.');
      // every text of the section has its English
      const texts = [...readFileSync('src/renderer/positionSharing.ts', 'utf8').matchAll(/t\('([^']+)'/g)].map((m) => m[1]);
      assert.ok(texts.length >= 8);
      for (const text of texts) assert.notEqual(t(text), text, text);
    } finally {
      setLang('pl');
    }
  });

  it('lets the game send its position and switch sharing, not pick friends', async () => {
    const calls: string[] = [];
    const bridge = new GameBridge({ call: async (method, path, body) => (calls.push(`${method} ${path} ${body ? JSON.stringify(body) : ''}`.trim()), { ok: true }), state: () => ({}) });
    const { url, key } = await bridge.start();
    const req = (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const pos = { server: 'skyup.pl', dimension: 'minecraft:overworld', x: 1, y: 64, z: 2, yaw: 90 };
    assert.equal((await req('/v1/mc/position', 'POST', pos)).status, 200);
    assert.equal((await req('/v1/me/position-sharing')).status, 200);
    assert.equal((await req('/v1/me/position-sharing', 'POST', { mode: 'all' })).status, 200);
    assert.equal((await req('/v1/me/position-sharing', 'POST', { mode: 'some', friends: ['x'] })).status, 403);
    assert.equal((await req('/v1/me/position-sharing', 'POST', { mode: 'everyone' })).status, 403);
    assert.deepEqual(calls, [`POST /v1/mc/position ${JSON.stringify(pos)}`, 'GET /v1/me/position-sharing', 'POST /v1/me/position-sharing {"mode":"all"}']);
    // friends' positions reach the game; the state says so (older launchers do not, and the HUD sends nothing to them)
    bridge.push({ type: 'friend-position', from: 'ala', x: 1, y: 2, z: 3 });
    bridge.push({ type: 'message', message: { text: 'hej' } });
    bridge.push({ type: 'friend-position', from: 'bob', x: 5, y: 2, z: 3 });
    // only the newest of each friend waits for the game
    bridge.push({ type: 'friend-position', from: 'ala', x: 9, y: 2, z: 3 });
    const got = await (await req('/events?after=0')).json();
    assert.deepEqual(got.events.map((e: { type: string; from?: string; x?: number }) => `${e.type}${e.from ? ` ${e.from} ${e.x}` : ''}`),
      ['message', 'friend-position bob 5', 'friend-position ala 9']);
    assert.ok((await (await req('/state')).json()).events.includes('friend-position'));
    bridge.stop();
  });
});
