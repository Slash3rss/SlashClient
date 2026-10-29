import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { limitAddress } from '../src/requests.ts';

// The limits from the security review: each is an admin panel setting, answers 429 { error: 'rate_limited' }
// like the rest of the server, and per-address ones count an IPv6 /64 as one visitor.

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-limits-'));
let base = '';
let app: ReturnType<typeof createApp>;
/** Versions the server asked GitHub about. */
const asked: string[] = [];

const fakeGitHub = (async (input: string | URL | Request) => {
  const url = String(input);
  const tag = /\/releases\/tags\/v([\d.]+)$/.exec(url)?.[1];
  if (tag) {
    asked.push(tag);
    return new Response('{"message":"Not Found"}', { status: 404 });
  }
  return new Response('', { status: 500 });
}) as typeof fetch;

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, trustProxy: true, fetchImpl: fakeGitHub, releasesRepo: 'x/y' });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => setTimeout(r, 200));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(method: string, url: string, o: { token?: string; body?: unknown; ip?: string } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.ip ? { 'X-Forwarded-For': o.ip } : {}) },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', { body: { name } })).body as { token: string; user: { id: string } };
const set = (values: Record<string, unknown>) => app.settings.set(values, 'test');

/** A launcher's live connection: the events it gets and how it was closed. */
async function connect(token: string, ip: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws', { headers: { 'X-Forwarded-For': ip } });
  const events: any[] = [];
  let closed: number | undefined;
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  ws.on('close', (code) => (closed = code));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token }));
  for (let i = 0; i < 100 && !events.some((e) => e.type === 'ready'); i++) await new Promise((r) => setTimeout(r, 20));
  return { ws, events, closed: () => closed };
}
const until = async (pred: () => boolean) => {
  for (let i = 0; i < 100 && !pred(); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(pred(), 'did not happen');
};

describe('per-address limits and IPv6', () => {
  it('counts an IPv6 /64 as one address, IPv4 as it is', () => {
    assert.equal(limitAddress('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
    assert.equal(limitAddress('2001:0db8:0001:0002::1'), '2001:db8:1:2::/64');
    assert.equal(limitAddress('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(limitAddress('::1:2:3:4:5:6'), '0:0:1:2::/64');
    assert.equal(limitAddress('fe80::1%eth0'), 'fe80:0:0:0::/64');
    assert.equal(limitAddress('203.0.113.7'), '203.0.113.7');
    assert.equal(limitAddress('::ffff:203.0.113.7'), '::ffff:203.0.113.7');
    assert.equal(limitAddress(''), '');
  });

  it('opening shared logs: per address, one /64 sharing the limit (logs.viewsPerMinute)', async () => {
    set({ 'logs.viewsPerMinute': 2 });
    assert.equal((await call('GET', '/v1/logs/abcdefghij', { ip: '2001:db8:5:6::1' })).status, 404);
    assert.equal((await call('GET', '/v1/logs/abcdefghij', { ip: '2001:db8:5:6::2' })).status, 404);
    const third = await call('GET', '/v1/logs/abcdefghij', { ip: '2001:db8:5:6:ffff::3' });
    assert.equal(third.status, 429);
    assert.equal(third.body.error, 'rate_limited');
    // another /64, and IPv4, have their own
    assert.equal((await call('GET', '/v1/logs/abcdefghij', { ip: '2001:db8:5:7::1' })).status, 404);
    assert.equal((await call('GET', '/v1/logs/abcdefghij', { ip: '198.51.100.1' })).status, 404);
  });

  it('partner backgrounds (partners.picturesPerMinute)', async () => {
    set({ 'partners.picturesPerMinute': 2 });
    const ip = '198.51.100.20';
    assert.equal((await call('GET', '/v1/partners/nope/background', { ip })).status, 404);
    assert.equal((await call('GET', '/v1/partners/nope/background', { ip })).status, 404);
    const third = await call('GET', '/v1/partners/nope/background', { ip });
    assert.equal(third.status, 429);
    assert.equal(third.body.error, 'rate_limited');
  });
});

describe('older releases from GitHub', () => {
  it('keeps a missing version for a while and limits lookups per address (security.releaseLookupsPerMinute)', async () => {
    set({ 'security.releaseLookupsPerMinute': 3 });
    const ip = '198.51.100.30';
    assert.equal((await call('GET', '/v1/changelog/7.7.7', { ip })).status, 404);
    assert.equal((await call('GET', '/v1/changelog/7.7.7', { ip })).status, 404);
    // asked of GitHub once, the second answer came from memory
    assert.deepEqual(asked.filter((v) => v === '7.7.7'), ['7.7.7']);
    // the update feed of an older version counts too
    assert.equal((await fetch(`${base}/aktualizacje/v/7.7.7/latest.yml`, { headers: { 'X-Forwarded-For': ip } })).status, 404);
    const limited = await fetch(`${base}/aktualizacje/v/7.7.8/latest.yml`, { headers: { 'X-Forwarded-For': ip } });
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { error: string }).error, 'rate_limited');
    assert.equal((await call('GET', '/v1/changelog/7.7.9', { ip })).body.error, 'rate_limited');
    assert.ok(!asked.includes('7.7.8') && !asked.includes('7.7.9'));
    // the latest release's feed is not limited by it
    assert.notEqual((await fetch(`${base}/aktualizacje/latest.yml`, { headers: { 'X-Forwarded-For': ip } })).status, 429);
  });

  it('asks once for many visitors at the same time', async () => {
    set({ 'security.releaseLookupsPerMinute': 1000 });
    await Promise.all(Array.from({ length: 5 }, (_, i) => call('GET', '/v1/changelog/6.6.6', { ip: `198.51.100.${40 + i}` })));
    assert.deepEqual(asked.filter((v) => v === '6.6.6'), ['6.6.6']);
  });
});

describe('per-account limits', () => {
  it('device chat keys (chatKeys.devicesPerMinute)', async () => {
    set({ 'chatKeys.devicesPerMinute': 2 });
    const me = await login('Klucznik');
    const key = { device: 'a'.repeat(24), pub: 'A'.repeat(60) };
    assert.equal((await call('POST', '/v1/keys', { token: me.token, body: key })).status, 200);
    assert.equal((await call('POST', '/v1/keys', { token: me.token, body: key })).status, 200);
    const third = await call('POST', '/v1/keys', { token: me.token, body: key });
    assert.equal(third.status, 429);
    assert.equal(third.body.error, 'rate_limited');
    // another account is not held back by it
    assert.equal((await call('POST', '/v1/keys', { token: (await login('Inny')).token, body: key })).status, 200);
  });

  it('profile changes that go to friends (security.profileChangesPerMinute)', async () => {
    set({ 'security.profileChangesPerMinute': 2 });
    const me = await login('Zmienny');
    assert.equal((await call('POST', '/v1/me', { token: me.token, body: { showServer: true } })).status, 200);
    assert.equal((await call('POST', '/v1/me', { token: me.token, body: { showServer: false } })).status, 200);
    const third = await call('POST', '/v1/me', { token: me.token, body: { showServer: true } });
    assert.equal(third.status, 429);
    assert.equal(third.body.error, 'rate_limited');
  });
});

describe('live connections', () => {
  it('an account keeps at most security.socketsPerUser connections: the oldest goes', async () => {
    set({ 'security.socketsPerUser': 2, 'security.socketConnectsPerMinute': 1000 });
    const me = await login('Wielogniazdo');
    const first = await connect(me.token, '198.51.100.50');
    const second = await connect(me.token, '198.51.100.50');
    const third = await connect(me.token, '198.51.100.50');
    await until(() => first.closed() === 4008);
    assert.equal(second.closed(), undefined);
    assert.equal(third.closed(), undefined);
    assert.ok(third.events.some((e) => e.type === 'ready'));
    for (const c of [second, third]) c.ws.close();
    set({ 'security.socketsPerUser': null });
  });

  it('new connections per address (security.socketConnectsPerMinute)', async () => {
    set({ 'security.socketConnectsPerMinute': 2 });
    const me = await login('Laczacy');
    const ip = '2001:db8:9:9::1';
    const a = await connect(me.token, ip);
    const b = await connect(me.token, '2001:db8:9:9::2');
    const refused = await new Promise<number>((r) => {
      const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws', { headers: { 'X-Forwarded-For': '2001:db8:9:9::3' } });
      ws.on('unexpected-response', (_req, res) => r(res.statusCode ?? 0));
      ws.on('error', () => {});
      ws.on('open', () => r(101));
    });
    assert.equal(refused, 429);
    // another address still connects
    const c = await connect(me.token, '198.51.100.60');
    assert.ok(c.events.some((e) => e.type === 'ready'));
    for (const x of [a, b, c]) x.ws.close();
    set({ 'security.socketConnectsPerMinute': 1000 });
  });

  it('the message budget is per account, all its connections together (security.socketMessagesPer10s)', async () => {
    set({ 'security.socketMessagesPer10s': 5 });
    const a = await login('Gadula');
    const b = await login('Sluchacz');
    await call('POST', '/v1/friends/requests', { token: a.token, body: { handle: 'Sluchacz' } });
    await call('POST', `/v1/friends/requests/${a.user.id}/accept`, { token: b.token });
    const listener = await connect(b.token, '198.51.100.70');
    const one = await connect(a.token, '198.51.100.71');
    const two = await connect(a.token, '198.51.100.72');
    await new Promise((r) => setTimeout(r, 100));
    const from = () => listener.events.filter((e) => e.type === 'presence' && e.id === a.user.id).length;
    const before = from();
    for (let i = 0; i < 4; i++) {
      one.ws.send(JSON.stringify({ type: 'presence', presence: { status: i % 2 ? 'online' : 'away' } }));
      two.ws.send(JSON.stringify({ type: 'presence', presence: { status: i % 2 ? 'away' : 'online' } }));
    }
    await new Promise((r) => setTimeout(r, 300));
    // eight sent over two connections, five let through
    assert.equal(from() - before, 5);
    for (const x of [listener, one, two]) x.ws.close();
  });
});

describe('LAN joins', () => {
  async function lan(first: unknown) {
    const ws = new WebSocket(base.replace('http', 'ws') + '/v1/lan');
    let closed: number | undefined;
    ws.on('close', (code) => (closed = code));
    ws.on('error', () => {});
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify(first));
    return { ws, closed: () => closed };
  }

  it('joins waiting for the host count towards lan.tunnels, and joins per minute are limited (lan.joinsPerMinute)', async () => {
    const host = await login('Gospodarz');
    const guest = await login('Przybysz');
    await call('POST', '/v1/friends/requests', { token: host.token, body: { handle: 'Przybysz' } });
    await call('POST', `/v1/friends/requests/${host.user.id}/accept`, { token: guest.token });
    const hostWs = await connect(host.token, '198.51.100.80');
    hostWs.ws.send(JSON.stringify({ type: 'lan', open: true }));
    await new Promise((r) => setTimeout(r, 100));

    set({ 'lan.tunnels': 1, 'lan.joinsPerMinute': 100 });
    const waiting = await lan({ type: 'join', token: guest.token, host: host.user.id });
    await until(() => hostWs.events.some((e) => e.type === 'lan-connect'));
    const second = await lan({ type: 'join', token: guest.token, host: host.user.id });
    await until(() => second.closed() === 4029);
    waiting.ws.close();
    await until(() => waiting.closed() !== undefined);
    await new Promise((r) => setTimeout(r, 50));

    set({ 'lan.tunnels': 100, 'lan.joinsPerMinute': 1 });
    const one = await lan({ type: 'join', token: guest.token, host: host.user.id });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(one.closed(), undefined);
    const over = await lan({ type: 'join', token: guest.token, host: host.user.id });
    await until(() => over.closed() === 4029);
    one.ws.close();
    hostWs.ws.close();
  });
});
