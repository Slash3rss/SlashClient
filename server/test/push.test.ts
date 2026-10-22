import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { allowedEndpoint, PUSH_HOSTS } from '../src/push.ts';
import { encryptPayload, newVapidKeys, validVapidKeys, vapidHeader } from '../src/webPush.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-push-'));
let base = '';
let app: ReturnType<typeof createApp>;

/** What the "push service" got: the address, the headers and the encrypted body. */
const sent: { url: string; headers: Record<string, string>; body: Buffer }[] = [];
/** Addresses the fake service says are gone. */
const gone = new Set<string>();

const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith('https://fcm.googleapis.com/') || url.startsWith('https://web.push.apple.com/')) {
    sent.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: Buffer.from(init?.body as Uint8Array) });
    return new Response(null, { status: gone.has(url) ? 410 : 201 });
  }
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
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; name: string } };
type Player = Awaited<ReturnType<typeof login>>;

async function befriend(a: Player, b: Player) {
  await call('POST', '/v1/friends/requests', a.token, { handle: b.user.name });
  assert.equal((await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token)).status, 200);
}

/** A phone's browser: its key pair and auth secret, as PushManager.subscribe() makes them. */
function phone(name: string, host = 'https://fcm.googleapis.com/fcm/send/') {
  const ecdh = createECDH('prime256v1');
  const pub = ecdh.generateKeys();
  const auth = randomBytes(16);
  const endpoint = `${host}${name}-${randomBytes(6).toString('hex')}`;
  return { ecdh, auth, endpoint, json: { endpoint, keys: { p256dh: pub.toString('base64url'), auth: auth.toString('base64url') } } };
}
type Phone = ReturnType<typeof phone>;

/** RFC 8291 the way the phone's browser reads it: the record's key from our one-time key and its own. */
function decrypt(p: Phone, body: Buffer): any {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const shared = p.ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, p.auth, Buffer.concat([Buffer.from('WebPush: info\0'), p.ecdh.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const ct = body.subarray(21 + idlen);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2);
  return JSON.parse(plain.subarray(0, -1).toString('utf8'));
}

/** Waits for the notifications to one phone (they go out after the request answered). */
async function received(p: Phone, count = 1) {
  for (let i = 0; i < 100; i++) {
    const got = sent.filter((s) => s.url === p.endpoint);
    if (got.length >= count) return got.map((s) => ({ ...s, payload: decrypt(p, s.body) }));
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('no notification came');
}
const settle = () => new Promise((r) => setTimeout(r, 80));
const subscribe = (who: Player, p: Phone, extra: Record<string, unknown> = {}) => call('POST', '/v1/push/subscriptions', who.token, { ...p.json, ...extra });

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: true, loginsPerMinute: 10_000, oauth: {}, fetchImpl: fakeFetch, chatBurst: { messages: 100, seconds: 10 } });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Web Push itself', () => {
  it('encrypts so that only the phone reads it, and signs with VAPID', () => {
    const p = phone('unit');
    const body = encryptPayload(p.json.keys, Buffer.from(JSON.stringify({ hello: 'świat' })));
    assert.deepEqual(decrypt(p, body), { hello: 'świat' });
    const keys = newVapidKeys();
    assert.ok(validVapidKeys(keys));
    assert.ok(!validVapidKeys({ publicKey: keys.publicKey, privateKey: newVapidKeys().privateKey }));
    const header = vapidHeader('https://fcm.googleapis.com/fcm/send/x', keys, 'mailto:a@b.c');
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    assert.equal(k, keys.publicKey);
    const [h, c, s] = jwt.split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    assert.equal(claims.aud, 'https://fcm.googleapis.com');
    const pub = Buffer.from(keys.publicKey, 'base64url');
    const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
    assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  });

  it('takes only the push services, over https', () => {
    assert.ok(allowedEndpoint('https://fcm.googleapis.com/fcm/send/abc', PUSH_HOSTS));
    assert.ok(allowedEndpoint('https://web.push.apple.com/QGx', PUSH_HOSTS));
    assert.ok(allowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x', PUSH_HOSTS));
    assert.ok(!allowedEndpoint('http://fcm.googleapis.com/fcm/send/abc', PUSH_HOSTS));
    assert.ok(!allowedEndpoint('https://127.0.0.1/x', PUSH_HOSTS));
    assert.ok(!allowedEndpoint('https://evil-fcm.googleapis.com.example/x', PUSH_HOSTS));
    assert.ok(!allowedEndpoint('https://notify.windows.com.evil/x', PUSH_HOSTS));
    assert.ok(!allowedEndpoint('https://fcm.googleapis.com:8443/x', PUSH_HOSTS));
  });
});

describe('push subscriptions', () => {
  it('gives the key and keeps a phone per account', async () => {
    const info = await call('GET', '/v1/push');
    assert.equal(info.body.enabled, true);
    assert.equal(Buffer.from(info.body.publicKey, 'base64url').length, 65);
    // the same key on the next ask (made once, kept)
    assert.equal((await call('GET', '/v1/push')).body.publicKey, info.body.publicKey);

    const ola = await login('PushOla');
    assert.equal((await call('POST', '/v1/push/subscriptions', undefined, phone('x').json)).status, 401);
    assert.equal((await subscribe(ola, phone('x', 'https://127.0.0.1/'))).body.error, 'bad_endpoint');
    assert.equal((await subscribe(ola, { ...phone('x'), json: { endpoint: phone('x').endpoint, keys: { p256dh: 'abc', auth: 'x' } } } as Phone)).status, 400);
    const p = phone('ola');
    const saved = await subscribe(ola, p, { prefs: { group: false }, lang: 'en', label: 'Pixel' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.current, true);
    assert.deepEqual(saved.body.subscription.prefs, { dm: true, group: false, clan: true, mention: true, invite: true });
    const list = await call('GET', '/v1/push/subscriptions', ola.token);
    assert.equal(list.body.subscriptions.length, 1);
    assert.equal(list.body.subscriptions[0].label, 'Pixel');
    // saved again: the same one, updated
    await subscribe(ola, p, { prefs: { group: true } });
    assert.equal((await call('GET', '/v1/push/subscriptions', ola.token)).body.subscriptions.length, 1);

    // someone else cannot remove it by its address; its owner can
    const ewa = await login('PushEwa');
    await call('POST', '/v1/push/subscriptions/remove', ewa.token, { endpoint: p.endpoint });
    assert.equal((await call('GET', '/v1/push/subscriptions', ola.token)).body.subscriptions.length, 1);
    await call('POST', '/v1/push/subscriptions/remove', ola.token, { endpoint: p.endpoint });
    assert.equal((await call('GET', '/v1/push/subscriptions', ola.token)).body.subscriptions.length, 0);
  });

  it('keeps at most the admin\'s number of phones, the oldest go', async () => {
    app.settings.set({ 'push.maxDevices': 2 }, 'test');
    const kuba = await login('PushKuba');
    for (const n of ['a', 'b', 'c']) await subscribe(kuba, phone(n));
    assert.equal((await call('GET', '/v1/push/subscriptions', kuba.token)).body.subscriptions.length, 2);
    app.settings.set({ 'push.maxDevices': null }, 'test');
  });
});

describe('notifications', () => {
  it('a direct message: who wrote, never the text; muted friends and switched-off kinds stay quiet', async () => {
    const ala = await login('NotAla');
    const bob = await login('NotBob');
    await befriend(ala, bob);
    const bobPhone = phone('bob');
    await subscribe(bob, bobPhone, { label: 'iPhone' });
    // a friend request accepted reaches Ala only if she has a phone: she has none, nothing is sent for her
    const before = sent.length;
    await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: 'e2e1:QUJD' });
    const [n] = await received(bobPhone);
    assert.equal(n.payload.title, 'NotAla');
    assert.equal(n.payload.body, 'Nowa wiadomość');
    assert.equal(n.payload.kind, 'dm');
    assert.equal(n.payload.url, `/app/#/chat/${ala.user.id}`);
    assert.ok(!JSON.stringify(n.payload).includes('e2e1'));
    assert.equal(n.headers['content-encoding'], 'aes128gcm');
    assert.match(n.headers.authorization, /^vapid t=.+, k=.+$/);
    assert.equal(n.headers.ttl, String(24 * 3600));
    assert.ok(n.headers.topic && n.headers.topic.length <= 32);
    // the sender's own message is not a notification for them
    assert.equal(sent.filter((s) => s.url !== bobPhone.endpoint).length, before);

    // a game invite says where
    await call('POST', `/v1/invites/${bob.user.id}`, ala.token, { server: 'mc.example.com' });
    const [, invite] = await received(bobPhone, 2);
    assert.match(invite.payload.body, /mc\.example\.com/);

    // muted: nothing
    await call('POST', `/v1/friends/${ala.user.id}/mute`, bob.token, { muted: true });
    await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: 'e2e1:QUJD' });
    await settle();
    assert.equal(sent.filter((s) => s.url === bobPhone.endpoint).length, 2);
    await call('POST', `/v1/friends/${ala.user.id}/mute`, bob.token, { muted: false });

    // direct messages switched off on that phone, in English
    await subscribe(bob, bobPhone, { prefs: { dm: false }, lang: 'en' });
    await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: 'e2e1:QUJD' });
    await settle();
    assert.equal(sent.filter((s) => s.url === bobPhone.endpoint).length, 2);
    await subscribe(bob, bobPhone, { lang: 'en' });
    await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: 'e2e1:QUJD' });
    const third = (await received(bobPhone, 3))[2];
    assert.equal(third.payload.body, 'New message');
  });

  it('invitations: a friend request, a clan\'s and a community\'s', async () => {
    const zosia = await login('InvZosia');
    const marek = await login('InvMarek');
    const p = phone('marek');
    await subscribe(marek, p);
    await call('POST', '/v1/friends/requests', zosia.token, { handle: 'InvMarek' });
    const [req] = await received(p);
    assert.equal(req.payload.kind, 'invite');
    assert.equal(req.payload.body, 'InvZosia zaprasza Cię do znajomych');

    assert.equal((await call('POST', '/v1/clans', zosia.token, { tag: 'PSH', name: 'Pusherzy' })).status, 200);
    await call('POST', '/v1/clans/invites', zosia.token, { handle: 'InvMarek' });
    const [, clan] = await received(p, 2);
    assert.match(clan.payload.body, /do klanu \[PSH\] Pusherzy/);

    const made = await call('POST', '/v1/communities', zosia.token, { name: 'Powiadomienia' });
    await call('POST', `/v1/communities/${made.body.community.id}/invites`, zosia.token, { handle: 'InvMarek' });
    const [, , com] = await received(p, 3);
    assert.match(com.payload.body, /do społeczności Powiadomienia/);
  });

  it('a group message and a community mention', async () => {
    const a = await login('GrpA');
    const b = await login('GrpB');
    const c = await login('GrpC');
    await befriend(a, b);
    await befriend(a, c);
    const p = phone('grpb');
    await subscribe(b, p);
    const g = await call('POST', '/v1/groups', a.token, { name: 'Ekipa', members: [b.user.id, c.user.id] });
    // the "created" line is not a notification
    await settle();
    assert.equal(sent.filter((s) => s.url === p.endpoint).length, 0);
    await call('POST', `/v1/groups/${g.body.group.id}/messages`, a.token, { text: 'e2e1:QUJD' });
    const [n] = await received(p);
    assert.equal(n.payload.title, 'Ekipa');
    assert.equal(n.payload.body, 'GrpA: nowa wiadomość');
    assert.equal(n.payload.kind, 'group');

    const made = await call('POST', '/v1/communities', a.token, { name: 'Wzmianki' });
    const id = made.body.community.id;
    const general = made.body.community.channels.find((x: any) => x.kind === 'general').id;
    assert.equal((await call('POST', `/v1/communities/${id}/join`, b.token)).status, 200);
    // a message without a mention: nothing
    await call('POST', `/v1/communities/${id}/channels/${general}/messages`, a.token, { text: 'cześć wszystkim' });
    await settle();
    assert.equal(sent.filter((s) => s.url === p.endpoint).length, 1);
    await call('POST', `/v1/communities/${id}/channels/${general}/messages`, a.token, { text: '@GrpB wbijasz?' });
    const [, mention] = await received(p, 2);
    assert.equal(mention.payload.kind, 'mention');
    assert.equal(mention.payload.title, 'Wzmianki · #Ogólny');
    assert.equal(mention.payload.body, 'GrpA: @GrpB wbijasz?');
    // the admin keeps the text out
    app.settings.set({ 'push.mentionText': false }, 'test');
    await call('POST', `/v1/communities/${id}/channels/${general}/messages`, a.token, { text: '@GrpB halo' });
    const [, , quiet] = await received(p, 3);
    assert.equal(quiet.payload.body, 'GrpA wspomina o Tobie');
    app.settings.set({ 'push.mentionText': null }, 'test');
  });

  it('forgets a phone the service says is gone, and stops when the admin switches it off', async () => {
    const x = await login('GoneX');
    const y = await login('GoneY');
    await befriend(x, y);
    const p = phone('gone');
    gone.add(p.endpoint);
    await subscribe(y, p);
    await call('POST', `/v1/messages/${y.user.id}`, x.token, { text: 'e2e1:QUJD' });
    await received(p);
    await settle();
    assert.equal((await call('GET', '/v1/push/subscriptions', y.token)).body.subscriptions.length, 0);

    const q = phone('off');
    await subscribe(y, q);
    app.settings.set({ 'push.enabled': false }, 'test');
    assert.deepEqual((await call('GET', '/v1/push')).body, { enabled: false });
    assert.equal((await subscribe(y, phone('later'))).body.error, 'push_disabled');
    await call('POST', `/v1/messages/${y.user.id}`, x.token, { text: 'e2e1:QUJD' });
    await settle();
    assert.equal(sent.filter((s) => s.url === q.endpoint).length, 0);
    app.settings.set({ 'push.enabled': null }, 'test');

    // the test button reaches every phone of mine
    const t = await call('POST', '/v1/push/test', y.token);
    assert.equal(t.body.sent, 1);
    const [test] = await received(q);
    assert.equal(test.payload.body, 'Powiadomienia działają.');
  });

  it('drops what goes past the per-minute limit', async () => {
    app.settings.set({ 'push.perMinute': 2 }, 'test');
    const m = await login('LimM');
    const n = await login('LimN');
    await befriend(m, n);
    const p = phone('lim');
    await subscribe(n, p);
    for (let i = 0; i < 4; i++) await call('POST', `/v1/messages/${n.user.id}`, m.token, { text: 'e2e1:QUJD' });
    await settle();
    assert.equal(sent.filter((s) => s.url === p.endpoint).length, 2);
    app.settings.set({ 'push.perMinute': null }, 'test');
  });

  it('keys typed in the panel replace the server\'s own; phones made with the old key are skipped', async () => {
    const old = (await call('GET', '/v1/push')).body.publicKey;
    const r = await login('KeyR');
    const s = await login('KeyS');
    await befriend(r, s);
    const p = phone('keys');
    await subscribe(s, p);
    const keys = newVapidKeys();
    // the panel's secret needs STORAGE_SECRET_KEY; without it the server keeps its own pair
    assert.throws(() => app.settings.set({ 'push.vapidPublicKey': keys.publicKey, 'push.vapidPrivateKey': keys.privateKey }, 'test'));
    assert.equal((await call('GET', '/v1/push')).body.publicKey, old);
    app.settings.set({ 'push.vapidPublicKey': keys.publicKey }, 'test');
    // half a pair does not fit: the server's own stays in use
    assert.equal((await call('GET', '/v1/push')).body.publicKey, old);
    app.settings.set({ 'push.vapidPublicKey': null }, 'test');
    // a subscription made with another key gets nothing until the phone subscribes again
    await subscribe(s, p, { vapid: keys.publicKey });
    await call('POST', `/v1/messages/${s.user.id}`, r.token, { text: 'e2e1:QUJD' });
    await settle();
    assert.equal(sent.filter((x) => x.url === p.endpoint).length, 0);
    assert.equal((await subscribe(s, p, { vapid: old })).body.current, true);
  });
});

describe('the phone and a launcher connected at once', () => {
  it('a launcher\'s status wins; with only the phone left, friends see "on the phone", not the launcher\'s last game', async () => {
    const { default: WebSocket } = await import('ws');
    const p = await login('TwoP');
    const f = await login('TwoF');
    await befriend(p, f);
    const open = async (token: string, presence?: unknown, client?: string) => {
      const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
      const events: any[] = [];
      ws.on('message', (d) => events.push(JSON.parse(String(d))));
      await new Promise((r) => ws.once('open', r));
      ws.send(JSON.stringify({ type: 'auth', token, presence, ...(client ? { client } : {}) }));
      for (let i = 0; i < 100 && !events.some((e) => e.type === 'ready'); i++) await new Promise((r) => setTimeout(r, 10));
      return { ws, events };
    };
    const friend = await open(f.token);
    const seen = async (pred: (presence: any) => boolean) => {
      for (let i = 0; i < 100; i++) {
        const last = friend.events.filter((e) => e.type === 'presence' && e.id === p.user.id).at(-1);
        if (last && pred(last.presence)) return last.presence;
        await new Promise((r) => setTimeout(r, 10));
      }
      return friend.events.filter((e) => e.type === 'presence' && e.id === p.user.id).at(-1)?.presence;
    };
    const launcher = await open(p.token, { status: 'online', activity: { kind: 'server', server: 'mc.example.com' } });
    // the phone comes later and says it is busy: the game on the server still shows, not "on the phone"
    const phone = await open(p.token, { status: 'busy' }, 'app');
    phone.ws.send(JSON.stringify({ type: 'presence', presence: { status: 'busy' } }));
    await settle();
    const both = friend.events.filter((e) => e.type === 'presence' && e.id === p.user.id).at(-1).presence;
    assert.equal(both.activity?.kind, 'server');
    assert.equal(both.mobile, undefined);
    // the launcher goes: what the phone says, marked as the phone
    launcher.ws.close();
    const onPhone = await seen((x) => x.status === 'busy');
    assert.equal(onPhone.status, 'busy');
    assert.equal(onPhone.activity, undefined);
    assert.equal(onPhone.mobile, true);
    // invisible on the phone: offline for friends, no phone either
    phone.ws.send(JSON.stringify({ type: 'presence', presence: { status: 'invisible' } }));
    const hidden = await seen((x) => x.status === 'offline');
    assert.equal(hidden.status, 'offline');
    assert.equal(hidden.mobile, undefined);
    // closed before the server goes, so their goodbyes do not reach a closed database
    for (const ws of [phone.ws, friend.ws]) {
      ws.close();
      await new Promise((r) => ws.once('close', r));
    }
    await settle();
  });
});
