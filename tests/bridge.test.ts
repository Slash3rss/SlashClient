import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';

describe('game bridge', () => {
  it('needs the key, passes only friends and messages, and streams events', async () => {
    const calls: string[] = [];
    const bridge = new GameBridge({
      call: async (method, path, body) => {
        calls.push(`${method} ${path} ${body ? JSON.stringify(body) : ''}`.trim());
        return { ok: true };
      },
      state: () => ({ signedIn: true, user: { name: 'Slash3rss' } }),
      copyImage: async (file) => {
        if (!file.endsWith('/screenshots/a.png')) throw new Error('not_a_screenshot');
        calls.push(`copy ${file}`);
      },
    });
    const { url, key } = await bridge.start();
    const req = (path: string, init: RequestInit = {}, k = key) =>
      fetch(url + path, { ...init, headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' } });

    assert.equal((await req('/v1/friends', {}, 'wrong')).status, 401);
    assert.equal((await req('/v1/friends')).status, 200);
    assert.equal((await req('/v1/messages/abc', { method: 'POST', body: JSON.stringify({ text: 'hej' }) })).status, 200);
    assert.equal((await req('/v1/me')).status, 200);
    assert.equal((await req('/v1/auth/logout', { method: 'POST' })).status, 403);
    assert.equal((await req('/v1/friends/x', { method: 'DELETE' })).status, 403);
    assert.equal((await req('/clipboard/image', { method: 'POST', body: JSON.stringify({ path: '/x/screenshots/a.png' }) })).status, 200);
    assert.equal((await req('/clipboard/image', { method: 'POST', body: JSON.stringify({ path: '/etc/passwd' }) })).status, 403);
    // invites, emotes and cosmetics go through; other changes to the account do not
    assert.equal((await req('/v1/invites/abc', { method: 'POST', body: JSON.stringify({ server: 'skyup.pl' }) })).status, 200);
    assert.equal((await req('/v1/mc/emote', { method: 'POST', body: JSON.stringify({ emote: 'wave' }) })).status, 200);
    assert.equal((await req('/v1/me', { method: 'POST', body: JSON.stringify({ character: 'abc', cape: 'gold', loadout: { pet: 'bee' } }) })).status, 200);
    assert.equal((await req('/v1/me', { method: 'POST', body: JSON.stringify({ showServer: false }) })).status, 403);
    assert.equal((await req('/v1/cosmetics')).status, 200);
    assert.equal((await req('/v1/achievements')).status, 200);
    assert.equal((await req('/v1/achievements/someone')).status, 403);
    assert.deepEqual(calls, ['GET /v1/friends', 'POST /v1/messages/abc {"text":"hej"}', 'GET /v1/me', 'copy /x/screenshots/a.png',
      'POST /v1/invites/abc {"server":"skyup.pl"}', 'POST /v1/mc/emote {"emote":"wave"}',
      'POST /v1/me {"character":"abc","cape":"gold","loadout":{"pet":"bee"}}', 'GET /v1/cosmetics', 'GET /v1/achievements']);
    // the state says which events this launcher passes on (the HUD asks less often when cosmetics come live)
    const state = await (await req('/state')).json();
    assert.deepEqual({ ...state, events: undefined }, { signedIn: true, user: { name: 'Slash3rss' }, events: undefined });
    assert.ok(state.events.includes('cosmetics') && !state.events.includes('login'));

    // a waiting poll wakes up on the next event; launcher-only events are not passed on
    const poll = req('/events?after=0').then((r) => r.json());
    await new Promise((r) => setTimeout(r, 50));
    bridge.push({ type: 'login', url: 'secret' });
    bridge.push({ type: 'message', message: { text: 'cześć' } });
    bridge.push({ type: 'join', server: 'skyup.pl' });
    bridge.push({ type: 'emote', uuid: 'u', emote: 'gg' });
    bridge.push({ type: 'achievement', achievement: { id: 'hours_100' } });
    const cosmetics = { type: 'cosmetics', uuids: ['abcdef01-2222-3333-4444-555555555555'], cosmetics: { 'abcdef01-2222-3333-4444-555555555555': { cape: 'ember', pet: 'allay' } } };
    bridge.push(cosmetics);
    const got = await poll;
    const types = got.events.map((e: { type: string }) => e.type);
    assert.equal(types[0], 'message');
    assert.ok(!types.includes('login'));
    assert.ok(types.includes('achievement'));
    // a change of cosmetics reaches the game whole, with the new set
    const { seq: _seq, ...passed } = got.events.find((e: { type: string }) => e.type === 'cosmetics');
    assert.deepEqual(passed, cosmetics);
    assert.deepEqual(bridge.jvmArgs(), [`-Dslashclient.bridge=${url}`, `-Dslashclient.bridgeKey=${key}`]);
    bridge.stop();
  });

  it('lets the game read and write communities\' chat, not manage them', async () => {
    const calls: string[] = [];
    const bridge = new GameBridge({ call: async (method, path) => (calls.push(`${method} ${path}`), { ok: true }), state: () => ({}) });
    const { url, key } = await bridge.start();
    const req = (path: string, method = 'GET') => fetch(url + path, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    const ok = ['/v1/communities/mine', '/v1/communities/c1/channels/g1/messages?limit=50', '/v1/communities/c1/members?limit=50'];
    for (const p of ok) assert.equal((await req(p)).status, 200, p);
    for (const p of ['/v1/communities/c1/channels/g1/messages', '/v1/communities/c1/channels/g1/read', '/v1/communities/c1/channels/g1/messages/5/edit', '/v1/communities/c1/channels/g1/messages/5/report', '/v1/communities/c1/notify']) assert.equal((await req(p, 'POST')).status, 200, p);
    assert.equal((await req('/v1/communities/c1/channels/g1/messages/5', 'DELETE')).status, 200);
    // managing stays in the launcher
    for (const p of ['/v1/communities', '/v1/communities/c1/settings', '/v1/communities/c1/bans', '/v1/communities/c1/members/u/role', '/v1/communities/c1/join']) assert.equal((await req(p, 'POST')).status, 403, p);
    assert.equal((await req('/v1/communities/c1', 'DELETE')).status, 403);
    assert.equal((await req('/v1/communities/discover')).status, 403);
    bridge.push({ type: 'community-message', message: { text: 'hej' } });
    bridge.push({ type: 'communities', id: 'c1' });
    const got = await (await req('/events?after=0')).json();
    assert.deepEqual(got.events.map((e: { type: string }) => e.type), ['community-message', 'communities']);
    bridge.stop();
  });
});
