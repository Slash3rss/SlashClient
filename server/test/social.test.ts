import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-social-'));
let base = '';
let app: ReturnType<typeof createApp>;

// a fake Discord, so sign-in can be tested without the internet
const fakeFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'discord-token' });
  if (url.endsWith('/users/@me')) return Response.json({ id: '42', username: 'kasia', global_name: 'Kasia', avatar: 'abc' });
  throw new Error(`unexpected ${url}`);
};

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

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

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, discord: { clientId: 'id', clientSecret: 'secret' }, fetchImpl: fakeFetch });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('social server', () => {
  it('needs a session', async () => {
    assert.equal((await call('GET', '/v1/friends')).status, 401);
    assert.equal((await call('GET', '/v1/friends', 'nope')).status, 401);
  });

  it('signs in with Discord through the browser and polling', async () => {
    const { state, url } = (await call('POST', '/v1/auth/discord/start')).body;
    assert.match(url, /discord\.com\/oauth2\/authorize/);
    assert.equal((await call('GET', `/v1/auth/discord/poll?state=${state}`)).body.pending, true);
    const page = await fetch(`${base}/v1/auth/discord/callback?state=${state}&code=xyz`);
    assert.equal(page.status, 200);
    const done = (await call('GET', `/v1/auth/discord/poll?state=${state}`)).body;
    assert.equal(done.user.handle, 'kasia');
    assert.equal(done.user.name, 'Kasia');
    // the result is handed out once
    assert.equal((await call('GET', `/v1/auth/discord/poll?state=${state}`)).status, 404);
  });

  it('gives a free handle when the name is taken', async () => {
    const other = await call('POST', '/v1/auth/dev', undefined, { name: 'Kasia' });
    assert.equal(other.body.user.handle, 'Kasia2');
  });

  it('makes friends, shows statuses and delivers messages live', async () => {
    const ala = await login('Ala');
    const bob = await login('Bob');
    assert.equal((await call('POST', '/v1/friends/requests', ala.token, { handle: 'nikt' })).status, 404);
    assert.equal((await call('POST', '/v1/friends/requests', ala.token, { handle: 'Ala' })).body.error, 'self');
    // messages need a friendship
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: 'hej' })).status, 403);

    const bobLive = await connect(bob.token, { status: 'online', activity: { kind: 'launcher' } });
    const sent = await call('POST', '/v1/friends/requests', ala.token, { handle: '@bob' });
    assert.equal(sent.body.status, 'sent');
    await bobLive.waitFor((e) => e.type === 'friends' && e.request?.handle === 'Ala');
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.incoming[0].handle, 'Ala');
    await call('POST', `/v1/friends/requests/${ala.user.id}/accept`, bob.token);

    const alaLive = await connect(ala.token, { status: 'online', activity: { kind: 'server', server: 'mc.example.com', version: '1.21.4' } });
    const seen = await bobLive.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && e.presence.status === 'online');
    assert.equal(seen.presence.activity.server, 'mc.example.com');

    // hiding the server address
    await call('POST', '/v1/me', ala.token, { showServer: false });
    const hidden = await bobLive.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && e.presence.activity && !e.presence.activity.server);
    assert.equal(hidden.presence.activity.version, '1.21.4');

    const msg = await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: '  cześć!  ' });
    assert.equal(msg.body.message.text, 'cześć!');
    await bobLive.waitFor((e) => e.type === 'message' && e.message.text === 'cześć!');
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.friends[0].unread, 1);
    await call('POST', `/v1/messages/${ala.user.id}/read`, bob.token);
    await alaLive.waitFor((e) => e.type === 'read' && e.by === bob.user.id);
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.friends[0].unread, 0);
    const history = (await call('GET', `/v1/messages/${ala.user.id}`, bob.token)).body.messages;
    assert.equal(history.length, 1);
    assert.ok(history[0].readAt);

    alaLive.ws.send(JSON.stringify({ type: 'typing', to: bob.user.id }));
    await bobLive.waitFor((e) => e.type === 'typing' && e.from === ala.user.id);

    // invisible looks offline
    alaLive.ws.send(JSON.stringify({ type: 'presence', presence: { status: 'invisible' } }));
    await bobLive.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && e.presence.status === 'offline');

    alaLive.ws.close();
    bobLive.ws.close();
  });

  it('accepts at once when both sides asked', async () => {
    const x = await login('Xavier');
    const y = await login('Yvonne');
    await call('POST', '/v1/friends/requests', x.token, { handle: 'Yvonne' });
    const back = await call('POST', '/v1/friends/requests', y.token, { handle: 'Xavier' });
    assert.equal(back.body.status, 'friends');
    assert.equal(back.body.friends[0].handle, 'Xavier');
    const removed = await call('DELETE', `/v1/friends/${x.user.id}`, y.token);
    assert.equal(removed.body.friends.length, 0);
  });

  it('rejects messages that are empty or too long', async () => {
    const p = await login('Piotr');
    const q = await login('Quinn');
    await call('POST', '/v1/friends/requests', p.token, { handle: 'Quinn' });
    await call('POST', `/v1/friends/requests/${p.user.id}/accept`, q.token);
    assert.equal((await call('POST', `/v1/messages/${q.user.id}`, p.token, { text: '   ' })).body.error, 'empty');
    assert.equal((await call('POST', `/v1/messages/${q.user.id}`, p.token, { text: 'x'.repeat(2001) })).body.error, 'too_long');
  });
});
