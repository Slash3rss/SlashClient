import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-chat-extras-'));
const imagesDir = path.join(dir, 'images');
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
async function upload(token: string, to: string, data: Buffer) {
  const res = await fetch(`${base}/v1/images/${to}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` }, body: new Uint8Array(data) });
  return { status: res.status, body: (await res.json()) as any };
}
async function download(token: string | undefined, id: string) {
  const res = await fetch(`${base}/v1/images/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, data: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') };
}
type Login = { token: string; user: { id: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Login;
async function befriend(a: Login, b: Login, bHandle: string) {
  await call('POST', '/v1/friends/requests', a.token, { handle: bHandle });
  await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
}

async function connect(token: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token }));
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
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {},
    imagesDir, imageLimits: { maxBytes: 4096, perDay: 4, bytesPerDay: 1_000_000 },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Stands in for an encrypted envelope: the server only checks its shape. */
const envelope = (s: string) => `e2e1:${Buffer.from(s).toString('base64')}`;

describe('muted friends', () => {
  it('keeps the mute on the account, tells the other launchers, and only for friends', async () => {
    const ala = await login('MuteAla');
    const bob = await login('MuteBob');
    const stranger = await login('MuteObcy');
    await befriend(ala, bob, 'MuteBob');
    const alaOther = await connect(ala.token);

    let list = await call('GET', '/v1/friends', ala.token);
    assert.equal(list.body.friends[0].muted, false);
    const res = await call('POST', `/v1/friends/${bob.user.id}/mute`, ala.token, { muted: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.friends.find((f: any) => f.id === bob.user.id).muted, true);
    // the same account's other launcher refreshes its list
    await alaOther.waitFor((e) => e.type === 'friends');
    // only for Ala: Bob still sees Ala unmuted
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.friends[0].muted, false);
    list = await call('GET', '/v1/friends', ala.token);
    assert.equal(list.body.friends[0].muted, true);

    // messages from a muted friend still arrive
    const sent = await call('POST', `/v1/messages/${ala.user.id}`, bob.token, { text: 'hej' });
    assert.equal(sent.status, 200);
    await alaOther.waitFor((e) => e.type === 'message' && e.message.text === 'hej');

    assert.equal((await call('POST', `/v1/friends/${stranger.user.id}/mute`, ala.token, { muted: true })).status, 403);
    assert.equal((await call('POST', `/v1/friends/${bob.user.id}/mute`, ala.token, { muted: 'yes' })).status, 400);
    assert.equal((await call('POST', `/v1/friends/${bob.user.id}/mute`, undefined, { muted: true })).status, 401);

    await call('POST', `/v1/friends/${bob.user.id}/mute`, ala.token, { muted: false });
    assert.equal((await call('GET', '/v1/friends', ala.token)).body.friends[0].muted, false);

    // a friendship that ends takes the mute with it
    await call('POST', `/v1/friends/${bob.user.id}/mute`, ala.token, { muted: true });
    await call('DELETE', `/v1/friends/${bob.user.id}`, ala.token);
    await befriend(ala, bob, 'MuteBob');
    assert.equal((await call('GET', '/v1/friends', ala.token)).body.friends[0].muted, false);
    alaOther.ws.close();
  });
});

describe('pictures in the chat', () => {
  it('stores an encrypted blob for one friend and hands it only to the two of them', async () => {
    const ala = await login('ImgAla');
    const bob = await login('ImgBob');
    const cyr = await login('ImgCyr');
    await befriend(ala, bob, 'ImgBob');
    const bobLive = await connect(bob.token);

    const blob = Buffer.alloc(1000, 7);
    const up = await upload(ala.token, bob.user.id, blob);
    assert.equal(up.status, 200);
    assert.match(up.body.id, /^[\w-]{22}$/);
    assert.equal(readdirSync(imagesDir).length, 1);

    // the message carries it, with its key encrypted (the server checks only the shape)
    const key = envelope('{"k":"..."}');
    const sent = await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('caption'), image: { id: up.body.id, key } });
    assert.equal(sent.status, 200);
    assert.deepEqual(sent.body.message.image, { id: up.body.id, key, size: 1000 });
    const live = await bobLive.waitFor((e) => e.type === 'message' && e.message.image);
    assert.equal(live.message.image.id, up.body.id);
    // and the conversation lists it later too
    const conv = await call('GET', `/v1/messages/${ala.user.id}`, bob.token);
    assert.equal(conv.body.messages.at(-1).image.key, key);

    // both may fetch it; nobody else, and not without a session
    const got = await download(bob.token, up.body.id);
    assert.equal(got.status, 200);
    assert.equal(got.type, 'application/octet-stream');
    assert.deepEqual(got.data, blob);
    assert.equal((await download(ala.token, up.body.id)).status, 200);
    assert.equal((await download(cyr.token, up.body.id)).status, 404);
    assert.equal((await download(undefined, up.body.id)).status, 401);
    assert.equal((await download(bob.token, 'x'.repeat(22))).status, 404);

    // one picture, one message
    const again = await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('again'), image: { id: up.body.id, key } });
    assert.equal(again.status, 404);
    assert.equal(again.body.error, 'bad_image');
    bobLive.ws.close();
  });

  it('refuses pictures for strangers, someone else\'s uploads, plain keys and too big ones', async () => {
    const ala = await login('ImgAla2');
    const bob = await login('ImgBob2');
    const cyr = await login('ImgCyr2');
    await befriend(ala, bob, 'ImgBob2');
    await befriend(cyr, bob, 'ImgBob2');
    assert.equal((await upload(ala.token, cyr.user.id, Buffer.alloc(100))).status, 403);
    assert.equal((await upload(ala.token, bob.user.id, Buffer.alloc(5000))).status, 413);
    assert.equal((await upload(ala.token, bob.user.id, Buffer.alloc(10))).status, 400);

    const up = await upload(ala.token, bob.user.id, Buffer.alloc(100, 1));
    // Cyr cannot send Ala's picture, even to the same friend
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}`, cyr.token, { text: envelope('x'), image: { id: up.body.id, key: envelope('k') } })).status, 404);
    // the key must be encrypted, and so must the text that carries it
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('x'), image: { id: up.body.id, key: 'plain key' } })).status, 400);
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: 'plain', image: { id: up.body.id, key: envelope('k') } })).status, 400);
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('x'), image: 'nope' })).status, 400);
    // a plain message is as before
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: 'zwykła' })).body.message.image, undefined);
  });

  it('limits pictures per day and drops old and unused ones', async () => {
    const ala = await login('ImgAla3');
    const bob = await login('ImgBob3');
    await befriend(ala, bob, 'ImgBob3');
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const up = await upload(ala.token, bob.user.id, Buffer.alloc(64, i));
      assert.equal(up.status, 200);
      ids.push(up.body.id);
    }
    const over = await upload(ala.token, bob.user.id, Buffer.alloc(64));
    assert.equal(over.status, 429);
    assert.equal(over.body.error, 'image_quota');

    await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('x'), image: { id: ids[0], key: envelope('k') } });
    // an hour on: uploads no message took are gone, the sent one stays
    await app.chatImages.cleanup(Date.now() + 2 * 3_600_000);
    assert.equal((await download(bob.token, ids[0])).status, 200);
    assert.equal((await download(ala.token, ids[1])).status, 404);
    assert.ok(!existsSync(path.join(imagesDir, `${ids[1]}.bin`)));
    // a month on, the sent one goes too; the message stays and says the picture is gone
    await app.chatImages.cleanup(Date.now() + 31 * 86_400_000);
    assert.equal((await download(bob.token, ids[0])).status, 404);
    const conv = await call('GET', `/v1/messages/${ala.user.id}`, bob.token);
    assert.equal(conv.body.messages.at(-1).image, undefined);
  });
});
