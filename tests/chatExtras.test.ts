import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';
import { decrypt, encrypt, newDeviceKey } from '../src/main/chatCrypto';
import { fitSize, ImageCache, keyText, openImage, parseKey, sealImage } from '../src/main/chatImages';
import { COOLDOWN_MS, PlayingWatch, RECONNECT_MS } from '../src/renderer/friendActivity';

const MIN = 60_000;
const offline = { status: 'offline' };
const launcher = { status: 'online', activity: { kind: 'launcher' } };
const onServer = (server = 'skyup.pl') => ({ status: 'online', activity: { kind: 'server', server } });

describe('friend started playing', () => {
  it('says nothing about who was already online when the list loaded', () => {
    const w = new PlayingWatch();
    w.know('a', onServer(), 0);
    w.know('b', launcher, 0);
    assert.equal(w.update('a', onServer('hypixel.net'), MIN), undefined);
    assert.equal(w.update('b', launcher, MIN), undefined);
    // a friend the list did not have yet is only remembered
    assert.equal(w.update('c', onServer(), MIN), undefined);
  });

  it('tells about coming online and starting a game, once each', () => {
    const w = new PlayingWatch();
    w.know('a', offline, 0);
    assert.deepEqual(w.update('a', launcher, 60 * MIN), { kind: 'online' });
    assert.deepEqual(w.update('a', onServer(), 61 * MIN), { kind: 'playing', server: 'skyup.pl' });
    // hopping between servers is not news
    assert.equal(w.update('a', onServer('hypixel.net'), 62 * MIN), undefined);
    assert.equal(w.update('a', { status: 'online', activity: { kind: 'singleplayer' } }, 63 * MIN), undefined);
  });

  it('a launcher started straight into a game is one toast, about the game', () => {
    const w = new PlayingWatch();
    w.know('a', offline, 0);
    assert.deepEqual(w.update('a', { status: 'online', activity: { kind: 'singleplayer' } }, 60 * MIN), { kind: 'playing', server: undefined });
  });

  it('ignores reconnects: offline for a moment, or out of the game for a moment', () => {
    const w = new PlayingWatch();
    w.know('a', onServer(), 0);
    assert.equal(w.update('a', offline, 10 * MIN), undefined);
    assert.equal(w.update('a', onServer(), 10 * MIN + 5000), undefined);
    assert.equal(w.update('a', launcher, 11 * MIN), undefined);
    assert.equal(w.update('a', onServer(), 11 * MIN + RECONNECT_MS - 1000), undefined);
    // away long enough: news again
    assert.equal(w.update('a', offline, 20 * MIN), undefined);
    assert.deepEqual(w.update('a', onServer(), 20 * MIN + RECONNECT_MS), { kind: 'playing', server: 'skyup.pl' });
  });

  it('the same news about one friend at most every few minutes', () => {
    const w = new PlayingWatch();
    w.know('a', offline, 0);
    const t0 = 60 * MIN;
    assert.equal(w.update('a', launcher, t0)?.kind, 'online');
    assert.equal(w.update('a', offline, t0 + MIN), undefined);
    assert.equal(w.update('a', launcher, t0 + MIN + RECONNECT_MS), undefined);
    assert.equal(w.update('a', offline, t0 + 5 * MIN), undefined);
    assert.equal(w.update('a', launcher, t0 + COOLDOWN_MS + RECONNECT_MS)?.kind, 'online');
    // friends are watched apart
    w.know('b', offline, 0);
    assert.equal(w.update('b', launcher, t0)?.kind, 'online');
  });
});

describe('chat pictures', () => {
  it('opens only with its own key, and notices a changed blob', () => {
    const data = Buffer.from('not really a jpeg, but bytes');
    const { blob, key } = sealImage(data, 'image/jpeg', 1920, 1080);
    assert.ok(!blob.includes(data));
    assert.deepEqual(openImage(blob, key), data);
    const other = sealImage(data, 'image/jpeg', 1, 1).key;
    assert.throws(() => openImage(blob, other));
    const changed = Buffer.from(blob);
    changed[0] ^= 1;
    assert.throws(() => openImage(changed, key));
  });

  it('the key travels inside an end-to-end encrypted message', () => {
    const ala = newDeviceKey();
    const bob = newDeviceKey();
    const eve = newDeviceKey();
    const { blob, key } = sealImage(Buffer.from('screenshot'), 'image/jpeg', 800, 600);
    const envelope = encrypt(keyText(key), ala, [ala, bob].map((k) => ({ device: k.device, pub: k.publicKey })), 'ala|bob');
    const opened = parseKey(decrypt(envelope, bob, 'ala|bob')!);
    assert.deepEqual(opened, key);
    assert.equal(openImage(blob, opened!).toString(), 'screenshot');
    assert.equal(decrypt(envelope, eve, 'ala|bob'), undefined);
  });

  it('accepts only a well-formed key', () => {
    const { key } = sealImage(Buffer.from('x'), 'image/png', 10, 20);
    assert.deepEqual(parseKey(keyText(key)), key);
    assert.equal(parseKey('not json'), undefined);
    assert.equal(parseKey(JSON.stringify({ ...key, v: 2 })), undefined);
    assert.equal(parseKey(JSON.stringify({ v: 1, ...key, type: 'text/html' })), undefined);
    assert.equal(parseKey(JSON.stringify({ v: 1, ...key, key: 'c2hvcnQ=' })), undefined);
    assert.equal(parseKey(JSON.stringify({ v: 1, ...key, w: -5 }))?.w, 0);
  });

  it('scales big screenshots down, keeping their shape', () => {
    assert.deepEqual(fitSize(3840, 2160), { w: 1920, h: 1080 });
    assert.deepEqual(fitSize(1080, 2400), { w: 864, h: 1920 });
    assert.deepEqual(fitSize(854, 480), { w: 854, h: 480 });
  });

  it('keeps the newest pictures within its size', () => {
    const cache = new ImageCache(100);
    cache.set('a', Buffer.alloc(40));
    cache.set('b', Buffer.alloc(40));
    cache.get('a');
    cache.set('c', Buffer.alloc(40));
    assert.ok(cache.get('a') && cache.get('c'));
    assert.equal(cache.get('b'), undefined);
    // one picture bigger than the whole cache still stays until the next
    cache.set('big', Buffer.alloc(500));
    assert.equal(cache.size, 1);
  });
});

describe('bridge: pictures and muting from the game', () => {
  async function bridge(opts: Partial<ConstructorParameters<typeof GameBridge>[0]>) {
    const calls: string[] = [];
    const b = new GameBridge({ call: async (m, p) => (calls.push(`${m} ${p}`), { ok: true }), state: () => ({}), ...opts });
    const { url, key } = await b.start();
    const ask = (method: string, path: string, body?: unknown) => new Promise<{ status: number; type: string; data: Buffer }>((resolve, reject) => {
      const req = http.request(url + path, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type']), data: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
    return { b, ask, calls };
  }

  it('passes a mute on to the server and nothing else about friends', async () => {
    const { b, ask, calls } = await bridge({});
    assert.equal((await ask('POST', '/v1/friends/abc/mute', { muted: true })).status, 200);
    assert.equal((await ask('DELETE', '/v1/friends/abc')).status, 403);
    assert.deepEqual(calls, ['POST /v1/friends/abc/mute']);
    b.stop();
  });

  it('sends a screenshot through the launcher and hands back pictures as PNG', async () => {
    const sent: string[] = [];
    const { b, ask } = await bridge({
      sendImage: async (friend, file) => {
        if (!file.endsWith('.png')) throw Object.assign(new Error('x'), { code: 'not_a_screenshot' });
        sent.push(`${friend} ${file}`);
        return { message: { id: 1 } };
      },
      chatImage: async (id) => {
        if (id !== 'a'.repeat(22)) throw new Error('not_found');
        return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      },
    });
    const ok = await ask('POST', '/chat/image', { friend: 'bob', path: 'C:/shots/1.png' });
    assert.equal(ok.status, 200);
    assert.deepEqual(JSON.parse(ok.data.toString()), { message: { id: 1 } });
    assert.deepEqual(sent, ['bob C:/shots/1.png']);
    const refused = await ask('POST', '/chat/image', { friend: 'bob', path: 'C:/secret.txt' });
    assert.equal(refused.status, 502);
    assert.equal(JSON.parse(refused.data.toString()).error, 'not_a_screenshot');
    assert.equal((await ask('POST', '/chat/image', { friend: '../x', path: 'a.png' })).status, 400);

    const png = await ask('GET', `/chat/image/${'a'.repeat(22)}`);
    assert.equal(png.status, 200);
    assert.equal(png.type, 'image/png');
    assert.deepEqual([...png.data], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal((await ask('GET', `/chat/image/${'b'.repeat(22)}`)).status, 404);
    b.stop();
  });
});
