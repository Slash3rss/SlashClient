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
    assert.deepEqual(calls, ['GET /v1/friends', 'POST /v1/messages/abc {"text":"hej"}']);
    assert.deepEqual(await (await req('/state')).json(), { signedIn: true, user: { name: 'Slash3rss' } });

    // a waiting poll wakes up on the next event; launcher-only events are not passed on
    const poll = req('/events?after=0').then((r) => r.json());
    await new Promise((r) => setTimeout(r, 50));
    bridge.push({ type: 'login', url: 'secret' });
    bridge.push({ type: 'message', message: { text: 'cześć' } });
    const got = await poll;
    assert.deepEqual(got.events.map((e: { type: string }) => e.type), ['message']);
    assert.deepEqual(bridge.jvmArgs(), [`-Dslashclient.bridge=${url}`, `-Dslashclient.bridgeKey=${key}`]);
    bridge.stop();
  });
});
