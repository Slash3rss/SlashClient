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
    assert.equal((await req('/v1/me')).status, 403);
    assert.equal((await req('/v1/auth/logout', { method: 'POST' })).status, 403);
    assert.equal((await req('/v1/friends/x', { method: 'DELETE' })).status, 403);
    assert.equal((await req('/clipboard/image', { method: 'POST', body: JSON.stringify({ path: '/x/screenshots/a.png' }) })).status, 200);
    assert.equal((await req('/clipboard/image', { method: 'POST', body: JSON.stringify({ path: '/etc/passwd' }) })).status, 403);
    // invites and emotes go through; changing the account (the cape) does not
    assert.equal((await req('/v1/invites/abc', { method: 'POST', body: JSON.stringify({ server: 'skyup.pl' }) })).status, 200);
    assert.equal((await req('/v1/mc/emote', { method: 'POST', body: JSON.stringify({ emote: 'wave' }) })).status, 200);
    assert.equal((await req('/v1/me', { method: 'POST', body: JSON.stringify({ cape: 'gold' }) })).status, 403);
    assert.deepEqual(calls, ['GET /v1/friends', 'POST /v1/messages/abc {"text":"hej"}', 'copy /x/screenshots/a.png',
      'POST /v1/invites/abc {"server":"skyup.pl"}', 'POST /v1/mc/emote {"emote":"wave"}']);
    assert.deepEqual(await (await req('/state')).json(), { signedIn: true, user: { name: 'Slash3rss' } });

    // a waiting poll wakes up on the next event; launcher-only events are not passed on
    const poll = req('/events?after=0').then((r) => r.json());
    await new Promise((r) => setTimeout(r, 50));
    bridge.push({ type: 'login', url: 'secret' });
    bridge.push({ type: 'message', message: { text: 'cześć' } });
    bridge.push({ type: 'join', server: 'skyup.pl' });
    bridge.push({ type: 'emote', uuid: 'u', emote: 'gg' });
    const got = await poll;
    const types = got.events.map((e: { type: string }) => e.type);
    assert.equal(types[0], 'message');
    assert.ok(!types.includes('login'));
    assert.deepEqual(bridge.jvmArgs(), [`-Dslashclient.bridge=${url}`, `-Dslashclient.bridgeKey=${key}`]);
    bridge.stop();
  });
});
