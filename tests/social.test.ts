import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activityFromLog, retryDelay, SocialClient, SocialError } from '../src/main/social';
import { connectedFlip } from '../src/renderer/connectedFlip';

describe('friends client', () => {
  it('reads what the game is doing from its log', () => {
    assert.deepEqual(activityFromLog('[Render thread/INFO]: Connecting to mc.example.com, 25565'), { kind: 'server', server: 'mc.example.com' });
    assert.deepEqual(activityFromLog('Connecting to 127.0.0.1, 25570'), { kind: 'server', server: '127.0.0.1:25570' });
    assert.deepEqual(activityFromLog('[Server thread/INFO]: Starting integrated minecraft server version 1.21.4'), { kind: 'singleplayer' });
    assert.deepEqual(activityFromLog('[Render thread/INFO]: Stopping server'), { kind: 'menu' });
    assert.equal(activityFromLog('[Render thread/INFO]: Loaded 7 recipes'), undefined);
  });

  it('turns server errors into codes and forgets a dead session', async () => {
    let token: string | undefined = 'abc';
    const events: Record<string, unknown>[] = [];
    const client = new SocialClient({
      url: () => 'http://social.test',
      token: () => token,
      saveToken: async (t) => {
        token = t;
      },
      status: () => 'online',
      emit: (e) => events.push(e),
      fetchImpl: async (input, init) => {
        const auth = (init?.headers as Record<string, string>).Authorization;
        if (String(input).endsWith('/v1/friends')) return Response.json({ error: 'not_found' }, { status: 404 });
        return auth === 'Bearer abc' ? Response.json({ error: 'unauthorized' }, { status: 401 }) : Response.json({ ok: true });
      },
    });
    await assert.rejects(client.call('GET', '/v1/friends'), (e: SocialError) => e.code === 'not_found');
    await assert.rejects(client.call('GET', '/v1/me'), (e: SocialError) => e.code === 'unauthorized');
    assert.equal(token, undefined);
    assert.ok(events.some((e) => e.type === 'state'));
    // without a session nothing is sent
    await assert.rejects(client.call('GET', '/v1/me'), (e: SocialError) => e.code === 'unauthorized');
  });

  it('waits 1–5 s before the first reconnect, then about twice as long each time, ±30%, at most about a minute', () => {
    assert.equal(retryDelay(0, () => 0), 1000);
    assert.equal(retryDelay(0, () => 1), 5000);
    assert.equal(retryDelay(1, () => 0.5), 4000);
    assert.equal(retryDelay(1, () => 0), 2800);
    assert.equal(retryDelay(1, () => 1), 5200);
    assert.equal(retryDelay(3, () => 0.5), 16000);
    assert.equal(retryDelay(20, () => 1), 78000);
    assert.equal(retryDelay(20, () => 0), 42000);
  });

  it('keeps the account the server last told and answers from it for a minute', async () => {
    let asked = 0;
    const client = new SocialClient({
      url: () => 'http://social.test', token: () => 'abc', saveToken: async () => {}, status: () => 'online', emit: () => {},
      fetchImpl: async (input) => {
        if (String(input).endsWith('/v1/me')) asked++;
        return Response.json({ id: 'u1', handle: 'a', name: 'A', avatar: '', showServer: false, providers: [], supporter: asked > 1 ? { tier: 'gold' } : null });
      },
    });
    assert.equal(((await client.me()) as { supporter?: unknown }).supporter, null);
    await client.me();
    assert.equal(asked, 1);
    // a change answered with the whole account: kept without asking
    client.noteUser({ id: 'u1', handle: 'a', name: 'A2', avatar: '', showServer: true, providers: [] });
    assert.equal((await client.me()).name, 'A2');
    // another account's answer is not taken for ours
    client.noteUser({ id: 'u2', handle: 'b', name: 'B', avatar: '', showServer: true, providers: [] });
    assert.equal((await client.me()).name, 'A2');
    assert.equal(asked, 1);
    // asked fresh (after a refund answer): from the server
    assert.deepEqual(((await client.me(0)) as { supporter?: unknown }).supporter, { tier: 'gold' });
    assert.equal(asked, 2);
  });

  it('tells the page once per connection, not on every state event', () => {
    const flip = connectedFlip();
    const me = { id: 'u1' };
    assert.equal(flip({ user: me, connected: false }), false);
    assert.equal(flip({ user: me, connected: true }), true);
    // a status change, /v1/me answering: the same connection
    assert.equal(flip({ user: me, connected: true }), false);
    assert.equal(flip({ user: { id: 'u1' }, connected: true }), false);
    // the connection dropped and came back
    assert.equal(flip({ user: me, connected: false }), false);
    assert.equal(flip({ user: me, connected: true }), true);
    // another account connected
    assert.equal(flip({ user: { id: 'u2' }, connected: true }), true);
    assert.equal(flip({ connected: false }), false);
    assert.equal(flip(undefined), false);
  });
});
