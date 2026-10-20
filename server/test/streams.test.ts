import assert from 'node:assert/strict';
import { createHash, createHmac, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.ts';
import { Gate, RateLimited, verifyEventSub, verifyKick } from '../src/streams/providers.ts';

// "Streamy": linking Twitch (OAuth) and Kick (OAuth 2.1 + PKCE), webhooks with their signatures,
// the reconcile, live/offline with the debounce, notifications to friends, the profile and the
// admin panel, all against fake Twitch and Kick servers (never the real ones, never real keys).

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-streams-'));
let clock = Date.now();
let base = '';
let app: ReturnType<typeof createApp>;

const TW_ID = 'twitchclientid123';
const TW_SECRET = 'twitchsecret-abcdef';
const KICK_ID = 'kickclientid123';
const KICK_SECRET = 'kicksecret-abcdef';
const { publicKey: KICK_PUB, privateKey: KICK_PRIV } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });

// ---------- fake Twitch ----------

const twitchCalls: { method: string; path: string; body: string; query: URLSearchParams; auth: string }[] = [];
/** Users behind each authorization code. */
const twitchUsers: Record<string, { id: string; login: string; display_name: string }> = {
  'code-ala': { id: '1001', login: 'Ala_TV', display_name: 'AlaTV' },
  'code-bob': { id: '1001', login: 'Ala_TV', display_name: 'AlaTV' },
};
/** Who is live now, by user id. */
const twitchLive = new Map<string, Record<string, unknown>>();
let twitchSubs = 0;
let twitchFailToken = false;
const fakeTwitch = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const url = new URL(req.url ?? '/', 'http://x');
  twitchCalls.push({ method: req.method ?? '', path: url.pathname, body: raw, query: url.searchParams, auth: String(req.headers.authorization ?? '') });
  const send = (status: number, body?: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(body === undefined ? '' : JSON.stringify(body));
  if (url.pathname === '/oauth2/token') {
    const f = new URLSearchParams(raw);
    if (twitchFailToken || f.get('client_id') !== TW_ID || f.get('client_secret') !== TW_SECRET) return send(403, { message: 'invalid client secret' });
    if (f.get('grant_type') === 'client_credentials') return send(200, { access_token: 'app-twitch', expires_in: 3600 });
    if (f.get('grant_type') === 'authorization_code' && twitchUsers[f.get('code') ?? '']) return send(200, { access_token: `user-${f.get('code')}` });
    return send(400, { message: 'bad code' });
  }
  if (url.pathname === '/oauth2/revoke') return send(200);
  if (req.headers['client-id'] !== TW_ID) return send(401, { message: 'no client id' });
  if (url.pathname === '/helix/users') {
    const code = String(req.headers.authorization).replace('Bearer user-', '');
    const u = twitchUsers[code];
    return u ? send(200, { data: [u] }) : send(401, {});
  }
  if (req.headers.authorization !== 'Bearer app-twitch') return send(401, {});
  if (url.pathname === '/helix/streams') return send(200, { data: url.searchParams.getAll('user_id').filter((id) => twitchLive.has(id)).map((id) => twitchLive.get(id)) });
  if (url.pathname === '/helix/eventsub/subscriptions' && req.method === 'POST') return send(202, { data: [{ id: `sub-${++twitchSubs}` }] });
  if (url.pathname === '/helix/eventsub/subscriptions' && req.method === 'DELETE') return send(204);
  send(404, {});
});

// ---------- fake Kick ----------

const kickCalls: { method: string; path: string; body: string; query: URLSearchParams }[] = [];
/** The PKCE challenge Kick saw for each code (the authorize page "remembers" it). */
const kickChallenges = new Map<string, string>();
const kickLive = new Map<string, Record<string, unknown>>();
let kickCategory = 'Minecraft';
const fakeKick = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const url = new URL(req.url ?? '/', 'http://x');
  kickCalls.push({ method: req.method ?? '', path: url.pathname, body: raw, query: url.searchParams });
  const send = (status: number, body?: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(body === undefined ? '' : JSON.stringify(body));
  if (url.pathname === '/oauth/token') {
    const f = new URLSearchParams(raw);
    if (f.get('client_id') !== KICK_ID || f.get('client_secret') !== KICK_SECRET) return send(401, { message: 'bad client' });
    if (f.get('grant_type') === 'client_credentials') return send(200, { access_token: 'app-kick', expires_in: 3600 });
    const challenge = kickChallenges.get(f.get('code') ?? '');
    // PKCE: the verifier must hash to the challenge sent with the authorize request
    if (!challenge || createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url') !== challenge) return send(400, { message: 'invalid_grant' });
    return send(200, { access_token: 'user-kick' });
  }
  if (url.pathname === '/oauth/revoke') return send(200);
  if (url.pathname === '/public/v1/public-key') return send(200, { data: { public_key: KICK_PUB } });
  const auth = String(req.headers.authorization ?? '');
  if (url.pathname === '/public/v1/users' && auth === 'Bearer user-kick') return send(200, { data: [{ user_id: 2002, name: 'BobK' }] });
  if (url.pathname === '/public/v1/channels' && auth === 'Bearer user-kick') return send(200, { data: [{ broadcaster_user_id: 2002, slug: 'bobk' }] });
  if (auth !== 'Bearer app-kick') return send(401, {});
  if (url.pathname === '/public/v1/channels') {
    return send(200, { data: url.searchParams.getAll('broadcaster_user_id').map((id) => ({ broadcaster_user_id: Number(id), slug: 'bobk', stream_title: 'Kick title', category: { id: 1, name: kickCategory }, stream: kickLive.get(id) ?? { is_live: false, viewer_count: 0 } })) });
  }
  if (url.pathname === '/public/v1/events/subscriptions' && req.method === 'POST') return send(200, { data: [{ name: 'livestream.status.updated', version: 1, subscription_id: 'ksub-1' }] });
  if (url.pathname === '/public/v1/events/subscriptions' && req.method === 'DELETE') return send(204);
  if (url.pathname === '/public/v1/livestreams') return send(200, { data: [] });
  send(404, {});
});

// ---------- helpers ----------

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text, headers: res.headers };
}
type Login = { token: string; user: { id: string; handle: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Login;
async function befriend(a: Login, b: Login) {
  await call('POST', '/v1/friends/requests', a.token, { handle: b.user.handle });
  await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
}
async function connect(token: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token }));
  const waitFor = async (pred: (e: any) => boolean) => {
    for (let i = 0; i < 150; i++) {
      const hit = events.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('event did not come');
  };
  await waitFor((e) => e.type === 'ready');
  return { ws, events, waitFor };
}
const settle = () => new Promise((r) => setTimeout(r, 150));

/** What our EventSub secret is: only the server knows it (sealed); the test opens the database to sign like Twitch. */
let hookSecret = '';
let msgs = 0;
async function eventsub(type: string, body: Record<string, unknown>, o: { id?: string; at?: number; secret?: string } = {}) {
  const raw = JSON.stringify(body);
  const id = o.id ?? `msg-${++msgs}`;
  const ts = new Date(o.at ?? clock).toISOString();
  const sig = `sha256=${createHmac('sha256', o.secret ?? hookSecret).update(id + ts + raw).digest('hex')}`;
  return call('POST', '/v1/streams/twitch/eventsub', undefined, raw, {
    'Twitch-Eventsub-Message-Id': id, 'Twitch-Eventsub-Message-Timestamp': ts, 'Twitch-Eventsub-Message-Signature': sig, 'Twitch-Eventsub-Message-Type': type,
  });
}
const online = (subject: string) => ({ subscription: { id: 'sub-x', type: 'stream.online', condition: { broadcaster_user_id: subject } }, event: { broadcaster_user_id: subject, type: 'live', started_at: new Date(clock).toISOString() } });
const update = (subject: string, category: string) => ({ subscription: { id: 'sub-z', type: 'channel.update', version: '2', condition: { broadcaster_user_id: subject } }, event: { broadcaster_user_id: subject, title: 'x', category_name: category } });
const offline = (subject: string) => ({ subscription: { id: 'sub-y', type: 'stream.offline', condition: { broadcaster_user_id: subject } }, event: { broadcaster_user_id: subject } });
let kmsgs = 0;
async function kickHook(body: Record<string, unknown>, o: { id?: string; bad?: boolean; type?: string } = {}) {
  const raw = JSON.stringify(body);
  const id = o.id ?? `k-${++kmsgs}`;
  const ts = new Date(clock).toISOString();
  const sig = createSign('RSA-SHA256').update(`${id}.${ts}.${raw}`).sign(KICK_PRIV, 'base64');
  return call('POST', '/v1/streams/kick/webhook', undefined, raw, {
    'Kick-Event-Message-Id': id, 'Kick-Event-Message-Timestamp': ts, 'Kick-Event-Signature': o.bad ? sig.replace(/^./, sig[0] === 'A' ? 'B' : 'A') : sig, 'Kick-Event-Type': o.type ?? 'livestream.status.updated', 'Kick-Event-Version': '1',
  });
}

let admin: Login, ala: Login, bob: Login, cid: Login, dan: Login;
/** Minecraft accounts Mojang "saw" join (the sign-in with Minecraft), for the lookup's test. */
const joined = new Map<string, { id: string; name: string }>();
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://sessionserver.mojang.com/session/minecraft/hasJoined')) {
    const p = joined.get(new URL(url).searchParams.get('serverId') ?? '');
    return new Response(p ? JSON.stringify(p) : '', { status: p ? 200 : 204 });
  }
  return fetch(input, init);
};

before(async () => {
  await new Promise<void>((r) => fakeTwitch.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => fakeKick.listen(0, '127.0.0.1', r));
  const tw = `http://127.0.0.1:${(fakeTwitch.address() as AddressInfo).port}`;
  const kk = `http://127.0.0.1:${(fakeKick.address() as AddressInfo).port}`;
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: true, oauth: {}, adminHandles: ['StreamAdmin'], loginsPerMinute: 1000,
    profileViewsPerMinute: 10_000, storage: { secretKey: randomBytes(32).toString('base64') }, webDir: path.resolve('web'),
    streams: { twitch: { id: tw, api: tw }, kick: { id: kk, api: kk }, now: () => clock, timers: false }, fetchImpl: fakeFetch,
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  admin = await login('StreamAdmin');
  ala = await login('AlaStream');
  bob = await login('BobStream');
  cid = await login('CidStream');
  dan = await login('DanStream');
  // Ala streams; Bob and Cid are her friends (Cid mutes her), Dan is not
  await befriend(ala, bob);
  await befriend(ala, cid);
  await call('POST', `/v1/friends/${ala.user.id}/mute`, cid.token, { muted: true });
});
after(async () => {
  await app.close();
  fakeTwitch.close();
  fakeKick.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('signatures and the request budget', () => {
  it('checks EventSub: the HMAC of id + timestamp + body, in constant time, and the age', () => {
    const raw = Buffer.from('{"a":1}');
    const ts = new Date(clock).toISOString();
    const sig = `sha256=${createHmac('sha256', 'secret-1234567890').update(`m1${ts}`).update(raw).digest('hex')}`;
    const h = { 'twitch-eventsub-message-id': 'm1', 'twitch-eventsub-message-timestamp': ts, 'twitch-eventsub-message-signature': sig, 'twitch-eventsub-message-type': 'notification' };
    assert.deepEqual(verifyEventSub(h, raw, 'secret-1234567890', clock), { ok: true, id: 'm1', type: 'notification' });
    assert.deepEqual(verifyEventSub(h, raw, 'other-secret', clock), { ok: false, reason: 'signature' });
    assert.deepEqual(verifyEventSub(h, Buffer.from('{"a":2}'), 'secret-1234567890', clock), { ok: false, reason: 'signature' });
    assert.deepEqual(verifyEventSub(h, raw, 'secret-1234567890', clock + 11 * 60_000), { ok: false, reason: 'old' });
    assert.deepEqual(verifyEventSub({ ...h, 'twitch-eventsub-message-signature': '' }, raw, 'secret-1234567890', clock), { ok: false, reason: 'missing' });
    assert.deepEqual(verifyEventSub(h, raw, '', clock), { ok: false, reason: 'missing' });
  });
  it('checks Kick: RSA-SHA256 over "id.timestamp.body" with Kick\'s key', () => {
    const raw = Buffer.from('{"is_live":true}');
    const ts = new Date(clock).toISOString();
    const sig = createSign('RSA-SHA256').update(`k1.${ts}.${raw}`).sign(KICK_PRIV, 'base64');
    const h = { 'kick-event-message-id': 'k1', 'kick-event-message-timestamp': ts, 'kick-event-signature': sig, 'kick-event-type': 'livestream.status.updated' };
    assert.equal(verifyKick(h, raw, KICK_PUB, clock).ok, true);
    assert.deepEqual(verifyKick(h, Buffer.from('{"is_live":false}'), KICK_PUB, clock), { ok: false, reason: 'signature' });
    assert.deepEqual(verifyKick(h, raw, KICK_PUB, clock + 20 * 60_000), { ok: false, reason: 'old' });
    const other = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    assert.deepEqual(verifyKick(h, raw, other.publicKey, clock), { ok: false, reason: 'signature' });
  });
  it('keeps to a budget per minute and pauses after a 429 until the reset', () => {
    let now = 1_000_000;
    const gate = new Gate(() => 2, () => now);
    gate.take();
    gate.take();
    assert.throws(() => gate.take(), RateLimited);
    now += 30_000;
    gate.take();
    gate.pause(new Response('', { status: 429, headers: { 'Ratelimit-Reset': String(Math.floor((now + 20_000) / 1000)) } }));
    now += 60_000;
    assert.equal(gate.paused, false);
    const g2 = new Gate(() => 100, () => now);
    g2.pause(new Response('', { status: 429, headers: { 'Retry-After': '5' } }));
    assert.throws(() => g2.take(), RateLimited);
    now += 6000;
    g2.take();
  });
});

describe('the admin panel', () => {
  it('keeps the apps\' keys write-only and sealed, logs every change, tests the connection', async () => {
    assert.equal((await call('GET', '/v1/admin/streams', ala.token)).status, 403);
    assert.equal((await call('POST', '/v1/admin/streams/providers/twitch', ala.token, { clientId: TW_ID })).status, 403);
    assert.equal((await call('POST', '/v1/admin/streams/providers/twitch', admin.token, { clientId: 'x y' })).body.error, 'bad_clientId');
    // switched on without keys: refused
    assert.equal((await call('POST', '/v1/admin/streams/providers/twitch', admin.token, { enabled: true })).body.error, 'provider_not_configured');
    const saved = await call('POST', '/v1/admin/streams/providers/twitch', admin.token, { clientId: TW_ID, clientSecret: TW_SECRET, enabled: true });
    assert.equal(saved.status, 200, saved.text);
    assert.ok(!saved.text.includes(TW_SECRET));
    const tw = saved.body.providers.find((p: any) => p.id === 'twitch');
    assert.equal(tw.ready, true);
    assert.equal(tw.hint, 'cdef');
    assert.equal(tw.redirectUrl, 'https://client.example/v1/streams/twitch/callback');
    assert.equal(tw.webhookUrl, 'https://client.example/v1/streams/twitch/eventsub');
    assert.equal(tw.hookSecretSet, true);
    assert.equal((await call('POST', '/v1/admin/streams/providers/kick', admin.token, { clientId: KICK_ID, clientSecret: KICK_SECRET, enabled: true })).status, 200);
    // at rest: sealed; the EventSub secret too (the test opens it the way the server does, to sign like Twitch)
    const sql = new DatabaseSync(path.join(dir, 'test.db'));
    const rows = sql.prepare('SELECT * FROM stream_providers').all() as Record<string, string>[];
    const log = sql.prepare("SELECT detail FROM admin_log WHERE action = 'streams_provider'").all() as { detail: string }[];
    sql.close();
    for (const r of rows) {
      assert.ok(r.secret.startsWith('v1:') && !r.secret.includes(TW_SECRET) && !r.secret.includes(KICK_SECRET));
    }
    assert.ok(log.length >= 2 && log.every((l) => !l.detail.includes(TW_SECRET)));
    // the test connection
    assert.deepEqual((await call('POST', '/v1/admin/streams/providers/twitch/test', admin.token)).body, { ok: true, message: '' });
    twitchFailToken = true;
    const bad = await call('POST', '/v1/admin/streams/providers/twitch/test', admin.token);
    twitchFailToken = false;
    assert.equal(bad.body.ok, false);
    assert.match(bad.body.message, /403/);
    // a secret that cannot be read back
    assert.ok(!(await call('GET', '/v1/admin/streams', admin.token)).text.includes(TW_SECRET));
  });
});

describe('linking channels', () => {
  it('links Twitch with OAuth (state checked, token revoked) and subscribes to EventSub', async () => {
    const start = await call('POST', '/v1/me/streams/twitch/start', ala.token);
    assert.equal(start.status, 200, start.text);
    const auth = new URL(start.body.url);
    assert.equal(auth.pathname, '/oauth2/authorize');
    assert.equal(auth.searchParams.get('client_id'), TW_ID);
    assert.equal(auth.searchParams.get('redirect_uri'), 'https://client.example/v1/streams/twitch/callback');
    assert.equal(auth.searchParams.get('scope'), '');
    assert.equal(auth.searchParams.get('state'), start.body.state);
    assert.deepEqual((await call('GET', `/v1/me/streams/poll?state=${start.body.state}`, ala.token)).body, { pending: true });
    // someone else's state is unknown to them
    assert.equal((await call('GET', `/v1/me/streams/poll?state=${start.body.state}`, bob.token)).status, 404);
    // a forged state does nothing
    assert.equal((await call('GET', '/v1/streams/twitch/callback?state=forged&code=code-ala')).status, 400);
    // the wrong platform's callback for this state does not finish it
    assert.equal((await call('GET', `/v1/streams/kick/callback?state=${start.body.state}&code=code-ala`)).status, 400);
    const page = await call('GET', `/v1/streams/twitch/callback?state=${start.body.state}&code=code-ala`);
    assert.equal(page.status, 400, 'the state was spent by the wrong callback');
    // again, properly
    const again = await call('POST', '/v1/me/streams/twitch/start', ala.token);
    const ok = await call('GET', `/v1/streams/twitch/callback?state=${again.body.state}&code=code-ala`);
    assert.equal(ok.status, 200, ok.text);
    assert.match(ok.text, /Połączono Twitch/);
    // a state is used once
    assert.equal((await call('GET', `/v1/streams/twitch/callback?state=${again.body.state}&code=code-ala`)).status, 400);
    const done = await call('GET', `/v1/me/streams/poll?state=${again.body.state}`, ala.token);
    assert.equal(done.body.linked, true);
    assert.deepEqual(done.body.streams.accounts.map((a: any) => [a.platform, a.login, a.name, a.url]), [['twitch', 'ala_tv', 'AlaTV', 'https://www.twitch.tv/ala_tv']]);
    await settle();
    // the player's token went back at once
    assert.ok(twitchCalls.some((c) => c.path === '/oauth2/revoke' && c.body.includes('token=user-code-ala')));
    // stream.online and stream.offline, to our https address, signed with our secret
    const subs = twitchCalls.filter((c) => c.path === '/helix/eventsub/subscriptions' && c.method === 'POST').map((c) => JSON.parse(c.body));
    // and channel.update (version 2): the game changing mid-stream
    assert.deepEqual(subs.map((s) => s.type).sort(), ['channel.update', 'stream.offline', 'stream.online']);
    assert.equal(subs.find((s) => s.type === 'channel.update').version, '2');
    assert.ok(subs.every((s) => s.condition.broadcaster_user_id === '1001' && s.transport.callback === 'https://client.example/v1/streams/twitch/eventsub' && s.transport.secret.length >= 10));
    hookSecret = subs[0].transport.secret;
    // the same Twitch channel cannot go to another account
    const bobStart = await call('POST', '/v1/me/streams/twitch/start', bob.token);
    const taken = await call('GET', `/v1/streams/twitch/callback?state=${bobStart.body.state}&code=code-bob`);
    assert.equal(taken.status, 400);
    assert.match(taken.text, /już połączony/);
    assert.equal((await call('GET', `/v1/me/streams/poll?state=${bobStart.body.state}`, bob.token)).body.error, 'already_linked');
  });

  it('links Kick with PKCE (S256), the verifier staying on the server', async () => {
    const start = await call('POST', '/v1/me/streams/kick/start', dan.token);
    const auth = new URL(start.body.url);
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(auth.searchParams.get('scope'), 'user:read channel:read');
    const challenge = auth.searchParams.get('code_challenge')!;
    assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!start.text.includes('verifier'));
    kickChallenges.set('kick-code-1', challenge);
    const ok = await call('GET', `/v1/streams/kick/callback?state=${start.body.state}&code=kick-code-1`);
    assert.equal(ok.status, 200, ok.text);
    const done = await call('GET', `/v1/me/streams/poll?state=${start.body.state}`, dan.token);
    assert.deepEqual(done.body.streams.accounts.map((a: any) => [a.platform, a.login]), [['kick', 'bobk']]);
    // a code issued for another challenge (someone else's authorize request) fails at Kick
    const other = await call('POST', '/v1/me/streams/kick/start', cid.token);
    kickChallenges.set('kick-code-2', 'not-this-ones-challenge-aaaaaaaaaaaaaaaaaaaaa');
    assert.equal((await call('GET', `/v1/streams/kick/callback?state=${other.body.state}&code=kick-code-2`)).status, 400);
    assert.equal((await call('GET', `/v1/me/streams/poll?state=${other.body.state}`, cid.token)).body.error, 'provider_failed');
    // denied on Kick's page
    const denied = await call('POST', '/v1/me/streams/kick/start', cid.token);
    await call('GET', `/v1/streams/kick/callback?state=${denied.body.state}&error=access_denied`);
    assert.equal((await call('GET', `/v1/me/streams/poll?state=${denied.body.state}`, cid.token)).body.error, 'provider_denied');
    await settle();
    assert.ok(kickCalls.some((c) => c.path === '/public/v1/events/subscriptions' && c.method === 'POST' && JSON.parse(c.body).broadcaster_user_id === 2002));
  });
});

describe('live and offline', () => {
  it('answers EventSub\'s challenge, refuses bad signatures and replays, and tells friends once', async () => {
    const bobWs = await connect(bob.token);
    const cidWs = await connect(cid.token);
    const danWs = await connect(dan.token);
    const challenge = await eventsub('webhook_callback_verification', { challenge: 'pogchamp-123', subscription: { id: 'sub-1' } });
    assert.equal(challenge.status, 200);
    assert.equal(challenge.text, 'pogchamp-123');
    assert.match(challenge.headers.get('content-type') ?? '', /text\/plain/);
    assert.equal((await eventsub('notification', online('1001'), { secret: 'wrong-secret-123' })).status, 403);
    assert.equal((await eventsub('notification', online('1001'), { at: clock - 11 * 60_000 })).status, 403);
    twitchLive.set('1001', { user_id: '1001', user_login: 'ala_tv', type: 'live', title: 'Budujemy zamek', game_name: 'Minecraft', viewer_count: 42, started_at: new Date(clock).toISOString(), thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_ala_tv-{width}x{height}.jpg' });
    const first = await eventsub('notification', online('1001'), { id: 'dup-1' });
    assert.equal(first.status, 204);
    const e = await bobWs.waitFor((x) => x.type === 'stream' && x.id === ala.user.id);
    assert.equal(e.notify, true);
    assert.equal(e.stream.platform, 'twitch');
    assert.equal(e.stream.title, 'Budujemy zamek');
    assert.equal(e.stream.viewers, 42);
    assert.equal(e.stream.url, 'https://www.twitch.tv/ala_tv');
    assert.equal(e.stream.thumbnail, 'https://static-cdn.jtvnw.net/previews-ttv/live_user_ala_tv-440x248.jpg');
    // Cid muted Ala: the badge, no notification; Dan is not a friend: nothing
    const c = await cidWs.waitFor((x) => x.type === 'stream' && x.id === ala.user.id);
    assert.equal(c.notify, undefined);
    assert.ok(!danWs.events.some((x) => x.type === 'stream'));
    // the same message again (a retry or a replay): nothing more
    const before = bobWs.events.filter((x) => x.type === 'stream').length;
    assert.equal((await eventsub('notification', online('1001'), { id: 'dup-1' })).status, 204);
    await settle();
    assert.equal(bobWs.events.filter((x) => x.type === 'stream').length, before);
    // the friends list carries it too
    const list = await call('GET', '/v1/friends', bob.token);
    assert.equal(list.body.friends.find((f: any) => f.id === ala.user.id).stream.title, 'Budujemy zamek');

    // the stream drops and comes back within the window: the badge follows, no second notification
    twitchLive.delete('1001');
    await eventsub('notification', offline('1001'));
    await bobWs.waitFor((x) => x.type === 'stream' && x.stream === null);
    clock += 5 * 60_000;
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Wróciłam', game_name: 'Minecraft', viewer_count: 3, started_at: new Date(clock).toISOString() });
    bobWs.events.length = 0;
    await eventsub('notification', online('1001'));
    const back = await bobWs.waitFor((x) => x.type === 'stream' && x.stream);
    assert.equal(back.notify, undefined);
    assert.equal(back.stream.title, 'Wróciłam');
    // offline long enough (the window is the admin's setting): a new stream is news again
    twitchLive.delete('1001');
    await eventsub('notification', offline('1001'));
    clock += 31 * 60_000;
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Nowy stream', game_name: 'Minecraft', viewer_count: 5, started_at: new Date(clock).toISOString() });
    bobWs.events.length = 0;
    await eventsub('notification', online('1001'));
    assert.equal((await bobWs.waitFor((x) => x.type === 'stream' && x.stream)).notify, true);
    // the window set to 0 in the panel: every start notifies
    assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values: { 'streams.renotifyMinutes': 0 } })).status, 200);
    twitchLive.delete('1001');
    await eventsub('notification', offline('1001'));
    clock += 1000;
    bobWs.events.length = 0;
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Znowu', game_name: 'Minecraft', viewer_count: 1, started_at: new Date(clock).toISOString() });
    await eventsub('notification', online('1001'));
    assert.equal((await bobWs.waitFor((x) => x.type === 'stream' && x.stream)).notify, true);
    await call('POST', '/v1/admin/settings', admin.token, { values: { 'streams.renotifyMinutes': null } });
    for (const w of [bobWs, cidWs, danWs]) w.ws.close();
  });

  it('follows the reconcile: titles and viewers refreshed, missed ends caught', async () => {
    const bobWs = await connect(bob.token);
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Nowy tytuł', game_name: 'Minecraft', viewer_count: 77, started_at: new Date(clock).toISOString() });
    const r = await app.streams.reconcile('twitch');
    assert.deepEqual(r, { checked: 1, ok: true, message: '' });
    const upd = await bobWs.waitFor((x) => x.type === 'stream' && x.stream?.viewers === 77);
    assert.equal(upd.notify, undefined);
    assert.equal(upd.stream.category, 'Minecraft');
    // Helix asked in one batch, with the app's token
    const asked = twitchCalls.filter((c) => c.path === '/helix/streams').at(-1)!;
    assert.deepEqual(asked.query.getAll('user_id'), ['1001']);
    assert.equal(asked.auth, 'Bearer app-twitch');
    // the offline webhook never came: the reconcile ends it
    twitchLive.delete('1001');
    await app.streams.reconcile('twitch');
    await bobWs.waitFor((x) => x.type === 'stream' && x.stream === null);
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.friends.find((f: any) => f.id === ala.user.id).stream, undefined);
    bobWs.ws.close();
  });

  it('takes Kick\'s signed webhooks and polls its channels', async () => {
    await befriend(dan, bob);
    const bobWs = await connect(bob.token);
    assert.equal((await kickHook({ broadcaster: { user_id: 2002, channel_slug: 'bobk' }, is_live: true, title: 'Kick live' }, { bad: true })).status, 403);
    kickLive.set('2002', { is_live: true, viewer_count: 9, start_time: new Date(clock).toISOString() });
    assert.equal((await kickHook({ broadcaster: { user_id: 2002, channel_slug: 'bobk' }, is_live: true, title: 'Kick live', started_at: new Date(clock).toISOString() }, { id: 'kdup' })).status, 204);
    const e = await bobWs.waitFor((x) => x.type === 'stream' && x.id === dan.user.id);
    assert.equal(e.notify, true);
    assert.equal(e.stream.platform, 'kick');
    assert.equal(e.stream.url, 'https://kick.com/bobk');
    assert.equal((await kickHook({ broadcaster: { user_id: 2002 }, is_live: true }, { id: 'kdup' })).status, 204);
    // polling: Kick says it ended
    kickLive.set('2002', { is_live: false, viewer_count: 0 });
    const r = await app.streams.reconcile('kick');
    assert.equal(r.checked, 1);
    await bobWs.waitFor((x) => x.type === 'stream' && x.id === dan.user.id && x.stream === null);
    bobWs.ws.close();
  });

  it('counts only Minecraft streams (the admin\'s list), also when the game changes mid-stream', async () => {
    const bobWs = await connect(bob.token);
    clock += 2 * 60 * 60_000;
    // another game: nothing at all for friends, the profile shows only the channel
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Terraria wieczorem', game_id: '31376', game_name: 'Terraria', viewer_count: 20, started_at: new Date(clock).toISOString() });
    await eventsub('notification', online('1001'));
    await settle();
    assert.ok(!bobWs.events.some((x) => x.type === 'stream' && x.id === ala.user.id));
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.friends.find((f: any) => f.id === ala.user.id).stream, undefined);
    assert.deepEqual((await call('GET', `/v1/profiles/${ala.user.handle}`)).body.profile.streams.live, []);
    // channel.update: switched to Minecraft mid-stream: live now, and news
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Teraz Minecraft', game_id: '27471', game_name: 'Minecraft', viewer_count: 21, started_at: new Date(clock).toISOString() });
    await eventsub('notification', update('1001', 'Minecraft'));
    const on = await bobWs.waitFor((x) => x.type === 'stream' && x.id === ala.user.id && x.stream);
    assert.equal(on.notify, true);
    assert.equal(on.stream.title, 'Teraz Minecraft');
    // and away again: offline for SlashClient, though still streaming
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Just Chatting', game_id: '509658', game_name: 'Just Chatting', viewer_count: 22, started_at: new Date(clock).toISOString() });
    bobWs.events.length = 0;
    await eventsub('notification', update('1001', 'Just Chatting'));
    await bobWs.waitFor((x) => x.type === 'stream' && x.id === ala.user.id && x.stream === null);
    // back to Minecraft within the window: live again, without a second notification
    clock += 60_000;
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Wracam do Minecrafta', game_id: '27471', game_name: 'Minecraft', viewer_count: 23, started_at: new Date(clock).toISOString() });
    bobWs.events.length = 0;
    await app.streams.reconcile('twitch');
    const back = await bobWs.waitFor((x) => x.type === 'stream' && x.id === ala.user.id && x.stream);
    assert.equal(back.notify, undefined);
    // the admin adds a game: it counts from the next check
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Dungeons', game_id: '508124', game_name: 'Minecraft Dungeons', viewer_count: 5, started_at: new Date(clock).toISOString() });
    await app.streams.reconcile('twitch');
    await bobWs.waitFor((x) => x.type === 'stream' && x.id === ala.user.id && x.stream === null);
    assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values: { 'streams.categories': ['Minecraft', 'Minecraft Dungeons'] } })).status, 200);
    await app.streams.reconcile('twitch');
    assert.equal((await bobWs.waitFor((x) => x.type === 'stream' && x.id === ala.user.id && x.stream?.title === 'Dungeons')).stream.category, 'Minecraft Dungeons');
    await call('POST', '/v1/admin/settings', admin.token, { values: { 'streams.categories': null } });
    twitchLive.delete('1001');
    await app.streams.reconcile('twitch');

    // Kick: livestream.metadata.updated to another category ends it, back to Minecraft starts it
    clock += 2 * 60 * 60_000;
    kickLive.set('2002', { is_live: true, viewer_count: 4, start_time: new Date(clock).toISOString() });
    kickCategory = 'Minecraft';
    await kickHook({ broadcaster: { user_id: 2002 }, is_live: true });
    await bobWs.waitFor((x) => x.type === 'stream' && x.id === dan.user.id && x.stream);
    kickCategory = 'Fortnite';
    bobWs.events.length = 0;
    await kickHook({ broadcaster: { user_id: 2002 }, title: 'x', category: { name: 'Fortnite' } }, { type: 'livestream.metadata.updated' });
    await bobWs.waitFor((x) => x.type === 'stream' && x.id === dan.user.id && x.stream === null);
    // polling sees the same
    kickCategory = 'minecraft';
    await app.streams.reconcile('kick');
    await bobWs.waitFor((x) => x.type === 'stream' && x.id === dan.user.id && x.stream);
    kickCategory = 'Minecraft';
    kickLive.set('2002', { is_live: false, viewer_count: 0 });
    await app.streams.reconcile('kick');
    bobWs.ws.close();
  });
});

describe('the player\'s choices', () => {
  it('hides the live status from friends, and turns notifications off', async () => {
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Ukryty', game_name: 'Minecraft', viewer_count: 4, started_at: new Date(clock).toISOString() });
    clock += 60 * 60_000;
    await app.streams.reconcile('twitch');
    const bobWs = await connect(bob.token);
    const hidden = await call('POST', '/v1/me/streams/prefs', ala.token, { hide: true });
    assert.deepEqual(hidden.body.prefs, { hide: true, notify: true });
    await bobWs.waitFor((x) => x.type === 'stream' && x.id === ala.user.id && x.stream === null);
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.friends.find((f: any) => f.id === ala.user.id).stream, undefined);
    await call('POST', '/v1/me/streams/prefs', ala.token, { hide: false });
    await bobWs.waitFor((x) => x.type === 'stream' && x.id === ala.user.id && x.stream?.title === 'Ukryty');
    // Bob does not want to be told: the badge still comes, the notification not
    assert.equal((await call('POST', '/v1/me/streams/prefs', bob.token, { notify: false })).body.prefs.notify, false);
    twitchLive.delete('1001');
    await app.streams.reconcile('twitch');
    clock += 60 * 60_000;
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Bez powiadomień', game_id: '27471', game_name: 'Minecraft', viewer_count: 4, started_at: new Date(clock).toISOString() });
    bobWs.events.length = 0;
    await app.streams.reconcile('twitch');
    const e = await bobWs.waitFor((x) => x.type === 'stream' && x.stream?.title === 'Bez powiadomień');
    assert.equal(e.notify, undefined);
    await call('POST', '/v1/me/streams/prefs', bob.token, { notify: true });
    bobWs.ws.close();
  });
});

describe('the public profile', () => {
  it('shows the stream with its player, as privacy allows', async () => {
    const anon = await call('GET', `/v1/profiles/${ala.user.handle}`);
    const s = anon.body.profile.streams;
    assert.deepEqual(s.channels.map((c: any) => [c.platform, c.login, c.url]), [['twitch', 'ala_tv', 'https://www.twitch.tv/ala_tv']]);
    assert.equal(s.live[0].title, 'Bez powiadomień');
    const embed = new URL(s.live[0].embed);
    assert.equal(embed.origin, 'https://player.twitch.tv');
    assert.equal(embed.searchParams.get('channel'), 'ala_tv');
    assert.deepEqual(embed.searchParams.getAll('parent'), ['client.example', 'client.slash3rss.dev']);
    // Kick's player by the channel's slug
    const dans = (await call('GET', `/v1/profiles/${dan.user.handle}`)).body.profile.streams;
    assert.deepEqual(dans.channels.map((c: any) => c.url), ['https://kick.com/bobk']);
    assert.deepEqual(dans.live, []);
    // the "Streamy" part switched off: strangers and friends do not see it, the owner does
    await call('POST', '/v1/me/profile-privacy', ala.token, { elements: { streams: false } });
    assert.equal('streams' in (await call('GET', `/v1/profiles/${ala.user.handle}`)).body.profile, false);
    assert.equal('streams' in (await call('GET', `/v1/profiles/${ala.user.handle}`, bob.token)).body.profile, false);
    assert.ok((await call('GET', `/v1/profiles/${ala.user.handle}`, ala.token)).body.profile.streams.live.length);
    // friends only: a stranger gets nothing at all
    await call('POST', '/v1/me/profile-privacy', ala.token, { visibility: 'friends', elements: { streams: true } });
    assert.equal((await call('GET', `/v1/profiles/${ala.user.handle}`, dan.token)).status, 403);
    assert.ok((await call('GET', `/v1/profiles/${ala.user.handle}`, bob.token)).body.profile.streams.live.length);
    await call('POST', '/v1/me/profile-privacy', ala.token, { visibility: 'public' });
  });

  it('allows the players\' frames only on profile pages', async () => {
    const page = await call('GET', `/u/${ala.user.handle}`);
    const csp = page.headers.get('content-security-policy') ?? '';
    assert.match(csp, /frame-src https:\/\/player\.twitch\.tv https:\/\/embed\.twitch\.tv https:\/\/player\.kick\.com;/);
    assert.match(csp, /frame-ancestors 'none'/);
    const home = await call('GET', '/');
    assert.doesNotMatch(home.headers.get('content-security-policy') ?? '', /frame-src/);
    const account = await call('GET', '/konto');
    assert.doesNotMatch(account.headers.get('content-security-policy') ?? '', /frame-src/);
  });
});

describe('in game: "● NA ŻYWO" above the head', () => {
  it('tells HUDs that know it which players are live, only with an allowed game and not hidden', async () => {
    const mc = 'aaaabbbb-cccc-dddd-eeee-ffff00001111';
    const { serverId } = (await call('POST', '/v1/auth/minecraft/start')).body;
    joined.set(serverId, { id: mc.replace(/-/g, ''), name: 'AlaStreamMC' });
    assert.equal((await call('POST', '/v1/auth/minecraft/finish', ala.token, { serverId, name: 'AlaStreamMC' })).body.linked, true);
    await call('POST', '/v1/mc/heartbeat', undefined, { uuid: mc });
    await call('POST', '/v1/mc/link', ala.token, { uuid: mc });
    const lookup = async (known: string[]) => (await call('POST', '/v1/mc/lookup', undefined, { uuids: [mc], knownRanks: known })).body;
    // Ala is live with Minecraft (the tests above): HUDs that say 'live' get it, older ones nothing new
    assert.deepEqual((await lookup(['colors', 'live'])).live, { [mc]: { platform: 'twitch' } });
    assert.equal((await lookup(['colors'])).live, undefined);
    // hidden from friends: hidden above the head too
    await call('POST', '/v1/me/streams/prefs', ala.token, { hide: true });
    assert.equal((await lookup(['live'])).live, undefined);
    await call('POST', '/v1/me/streams/prefs', ala.token, { hide: false });
    // another game: not live for SlashClient
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Inna gra', game_name: 'Fortnite', viewer_count: 4, started_at: new Date(clock).toISOString() });
    await app.streams.reconcile('twitch');
    assert.equal((await lookup(['live'])).live, undefined);
    twitchLive.set('1001', { user_id: '1001', type: 'live', title: 'Bez powiadomień', game_name: 'Minecraft', viewer_count: 4, started_at: new Date(clock).toISOString() });
    await app.streams.reconcile('twitch');
    assert.deepEqual((await lookup(['live'])).live, { [mc]: { platform: 'twitch' } });
  });
});

describe('the feature switch and the admin\'s tools', () => {
  it('switched off: no linking, badges or profile section, webhooks still answered', async () => {
    const bobWs = await connect(bob.token);
    await call('POST', '/v1/admin/settings', admin.token, { values: { 'feature.streams': false } });
    const res = await call('GET', '/v1/me/streams', ala.token);
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { error: 'feature_disabled', feature: 'streams' });
    assert.equal((await call('POST', '/v1/me/streams/twitch/start', ala.token)).status, 503);
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.friends.find((f: any) => f.id === ala.user.id).stream, undefined);
    assert.deepEqual((await call('GET', `/v1/profiles/${ala.user.handle}`)).body.profile.streams, { channels: [], live: [] });
    assert.doesNotMatch((await call('GET', `/u/${ala.user.handle}`)).headers.get('content-security-policy') ?? '', /frame-src/);
    bobWs.events.length = 0;
    twitchLive.delete('1001');
    assert.equal((await eventsub('notification', offline('1001'))).status, 204);
    await settle();
    assert.ok(!bobWs.events.some((x) => x.type === 'stream'));
    // the panel keeps working
    assert.equal((await call('GET', '/v1/admin/streams', admin.token)).status, 200);
    await call('POST', '/v1/admin/settings', admin.token, { values: { 'feature.streams': null } });
    bobWs.ws.close();
  });

  it('reconciles on demand and unlinks by force, both in the log', async () => {
    const r = await call('POST', '/v1/admin/streams/reconcile', admin.token);
    assert.equal(r.status, 200);
    assert.equal(r.body.result.twitch.checked, 1);
    assert.equal(r.body.result.kick.checked, 1);
    assert.equal((await call('POST', '/v1/admin/streams/reconcile', ala.token)).status, 403);
    const listed = (await call('GET', '/v1/admin/streams', admin.token)).body.accounts;
    assert.deepEqual(listed.map((a: any) => [a.handle, a.platform, a.login]).sort(), [[ala.user.handle, 'twitch', 'ala_tv'], [dan.user.handle, 'kick', 'bobk']].sort());
    assert.equal((await call('DELETE', `/v1/admin/streams/accounts/${ala.user.id}/twitch`, ala.token)).status, 403);
    const before = twitchCalls.filter((c) => c.method === 'DELETE').length;
    const gone = await call('DELETE', `/v1/admin/streams/accounts/${ala.user.id}/twitch`, admin.token);
    assert.equal(gone.status, 200);
    assert.equal(gone.body.accounts.some((a: any) => a.platform === 'twitch'), false);
    // its EventSub subscriptions went too
    assert.equal(twitchCalls.filter((c) => c.method === 'DELETE').length - before, 3);
    const log = (await call('GET', '/v1/admin/log', admin.token)).body;
    const entries = JSON.stringify(log);
    assert.match(entries, /streams_unlink/);
    assert.match(entries, /streams_reconcile/);
    assert.equal((await call('DELETE', `/v1/admin/streams/accounts/${ala.user.id}/twitch`, admin.token)).status, 404);
    // the player unlinks their own
    const mine = await call('DELETE', '/v1/me/streams/kick', dan.token);
    assert.deepEqual(mine.body.accounts, []);
    assert.equal((await call('DELETE', '/v1/me/streams/kick', dan.token)).status, 404);
  });
});
