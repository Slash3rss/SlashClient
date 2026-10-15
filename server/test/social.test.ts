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
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith('discord.com/api/oauth2/token')) return Response.json({ access_token: 'discord-token' });
  if (url === 'https://oauth2.googleapis.com/token') {
    const claims = Buffer.from(JSON.stringify({ sub: 'g-1', name: 'Zosia Nowak', picture: 'https://evil.example/x.png' })).toString('base64url');
    return Response.json({ id_token: `x.${claims}.y` });
  }
  if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'gh-token' });
  if (url === 'https://api.github.com/user') return Response.json({ id: 7, login: 'octo', name: null, avatar_url: 'https://avatars.githubusercontent.com/u/7' });
  if (url.endsWith('/oauth2/v2.0/token')) {
    // the code says which Microsoft user signed in
    const code = new URLSearchParams(String(init?.body)).get('code');
    const claims = Buffer.from(JSON.stringify({ sub: `ms-${code}`, name: code === 'jan' ? 'Jan Kowalski' : 'Ola' })).toString('base64url');
    return Response.json({ id_token: `x.${claims}.y` });
  }
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
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: { discord: { clientId: 'id', clientSecret: 'secret' }, microsoft: { clientId: 'ms', clientSecret: 'secret' }, google: { clientId: 'g', clientSecret: 's' }, github: { clientId: 'gh', clientSecret: 's' } }, fetchImpl: fakeFetch });
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
    assert.equal((await call('GET', `/v1/auth/poll?state=${state}`)).body.pending, true);
    const page = await fetch(`${base}/v1/auth/discord/callback?state=${state}&code=xyz`);
    assert.equal(page.status, 200);
    const done = (await call('GET', `/v1/auth/poll?state=${state}`)).body;
    assert.equal(done.user.handle, 'kasia');
    assert.equal(done.user.name, 'Kasia');
    // the result is handed out once
    assert.equal((await call('GET', `/v1/auth/poll?state=${state}`)).status, 404);
  });

  /** Runs a browser sign-in with a Microsoft "code" (which user), optionally linking to a session. */
  async function microsoftLogin(code: string, token?: string) {
    const { state } = (await call('POST', '/v1/auth/microsoft/start', token)).body;
    await fetch(`${base}/v1/auth/microsoft/callback?state=${state}&code=${code}`);
    return call('GET', `/v1/auth/poll?state=${state}`);
  }

  it('signs in with Microsoft and links it to an existing account', async () => {
    const jan = (await microsoftLogin('jan')).body;
    assert.equal(jan.user.handle, 'JanKowalski');
    assert.equal(jan.user.name, 'Jan Kowalski');

    const dev = await login('Linker');
    const linked = (await microsoftLogin('ola', dev.token)).body;
    assert.equal(linked.linked, true);
    assert.deepEqual(linked.user.providers, ['dev', 'microsoft']);
    // signing in with that Microsoft account now opens the same SlashClient account
    assert.equal((await microsoftLogin('ola')).body.user.id, dev.user.id);
    // Jan's Microsoft account already has its own SlashClient account
    assert.equal((await microsoftLogin('jan', dev.token)).body.error, 'already_linked');
    // the last way to sign in cannot be removed
    assert.equal((await call('DELETE', '/v1/me/providers/microsoft', jan.token)).body.error, 'last_provider');
    const after = await call('DELETE', '/v1/me/providers/microsoft', dev.token);
    assert.deepEqual(after.body.providers, ['dev']);
  });

  it('signs in with Google and GitHub', async () => {
    for (const [provider, handle, avatar] of [['google', 'ZosiaNowak', ''], ['github', 'octo', 'https://avatars.githubusercontent.com/u/7']]) {
      const { state, url } = (await call('POST', `/v1/auth/${provider}/start`)).body;
      assert.match(url, provider === 'google' ? /accounts\.google\.com/ : /github\.com\/login\/oauth/);
      await fetch(`${base}/v1/auth/${provider}/callback?state=${state}&code=c`);
      const done = (await call('GET', `/v1/auth/poll?state=${state}`)).body;
      assert.equal(done.user.handle, handle);
      // pictures only from the provider's own host
      assert.equal(done.user.avatar, avatar);
    }
    assert.deepEqual((await call('GET', '/v1/health')).body.providers, ['discord', 'microsoft', 'google', 'github']);
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

  it('knows which Minecraft players use SlashClient', async () => {
    const steve = '8667ba71-b85a-4004-af54-457a9734eed7';
    const alex = 'ec561538-f3fd-461d-aff5-086b22154bce';
    assert.equal((await call('POST', '/v1/mc/heartbeat', undefined, { uuid: 'nope' })).status, 400);
    assert.equal((await call('POST', '/v1/mc/heartbeat', undefined, { uuid: steve })).body.ok, true);
    const found = await call('POST', '/v1/mc/lookup', undefined, { uuids: [steve, alex, 'x'] });
    assert.deepEqual(found.body.active, [steve]);
    assert.equal((await call('POST', '/v1/mc/lookup', undefined, { uuids: 'all' })).status, 400);
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
