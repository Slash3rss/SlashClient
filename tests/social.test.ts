import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activityFromLog, SocialClient, SocialError } from '../src/main/social';

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
});
