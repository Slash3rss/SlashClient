import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-server-votes-'));
const LIST = 'https://list.test';
const KEY = 'vote-key-123456';
const joined = new Map<string, { id: string; name: string }>();

/** The list's API as api.slash3rss.dev answers: the trusted vote with its key, one vote per nick and per address a day. */
const votes: { id: string; nick: string; ip: string; at: number }[] = [];
const servers = new Map([['abc', 10], ['def', 3]]);
const asked: { url: string; key: string | null; body?: any }[] = [];
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith('https://sessionserver.mojang.com/session/minecraft/hasJoined?')) {
    const q = new URL(url).searchParams;
    const p = joined.get(q.get('serverId') ?? '');
    return p && p.name === q.get('username') ? Response.json({ ...p, properties: [] }) : new Response(null, { status: 204 });
  }
  const key = new Headers(init?.headers).get('x-slashclient-key');
  asked.push({ url, key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  let m = /^https:\/\/list\.test\/servers\/([^/]+)\/voted\/([^/]+)$/.exec(url);
  if (m) {
    if (!servers.has(m[1])) return Response.json({ error: 'Nie znaleziono serwera.' }, { status: 404 });
    const v = votes.find((x) => x.id === m![1] && x.nick.toLowerCase() === decodeURIComponent(m![2]).toLowerCase());
    return Response.json({ voted: !!v, votedAt: v ? new Date(v.at).toISOString() : null });
  }
  m = /^https:\/\/list\.test\/servers\/([^/]+)\/vote\/slashclient$/.exec(url);
  if (m && init?.method === 'POST') {
    if (key !== KEY) return Response.json({ error: 'Nieprawidłowy klucz SlashClient.', code: 'bad_key' }, { status: 401 });
    const id = m[1];
    if (!servers.has(id)) return Response.json({ error: 'Nie znaleziono serwera.', code: 'not_found' }, { status: 404 });
    const { nick, ip } = JSON.parse(String(init.body));
    if (votes.some((v) => v.id === id && v.nick.toLowerCase() === nick.toLowerCase())) return Response.json({ error: 'Głosowałeś już dzisiaj na ten serwer.', code: 'already_voted_nick' }, { status: 400 });
    if (votes.some((v) => v.id === id && v.ip === ip)) return Response.json({ error: 'Z Twojego adresu IP głosowano już dzisiaj na ten serwer.', code: 'already_voted_ip' }, { status: 400 });
    votes.push({ id, nick, ip, at: Date.now() });
    servers.set(id, servers.get(id)! + 1);
    return Response.json({ id, votes: servers.get(id) });
  }
  throw new Error(`unexpected ${url}`);
}) as typeof fetch;

let app: ReturnType<typeof createApp>;
let noBox: ReturnType<typeof createApp>;
const urlOf = (a: ReturnType<typeof createApp>) => `http://127.0.0.1:${(a.server.address() as AddressInfo).port}`;

async function call(method: string, url: string, token?: string, body?: unknown, on = app) {
  const res = await fetch(urlOf(on) + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string, on = app) => (await call('POST', '/v1/auth/dev', undefined, { name }, on)).body as { token: string; user: { id: string } };

async function linkMinecraft(token: string, id: string, name: string) {
  const { serverId } = (await call('POST', '/v1/auth/minecraft/start')).body;
  joined.set(serverId, { id, name });
  assert.equal((await call('POST', '/v1/auth/minecraft/finish', token, { serverId, name })).body.linked, true);
}

before(async () => {
  const cfg = { publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, fetchImpl: fakeFetch, adminHandles: ['Szef'], loginsPerMinute: 10_000 };
  app = createApp({ ...cfg, dbFile: path.join(dir, 'a.db'), storage: { secretKey: randomBytes(32).toString('base64') } });
  noBox = createApp({ ...cfg, dbFile: path.join(dir, 'b.db') });
  await new Promise<void>((r) => app.server.listen(0, r));
  await new Promise<void>((r) => noBox.server.listen(0, r));
});
after(async () => {
  await app.close();
  await noBox.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('voting for a server on the list from the launcher', () => {
  let ala: { token: string; user: { id: string } };
  let admin: { token: string };

  it('is off until the admin enters the key: the launcher opens the list page instead', async () => {
    ala = await login('Ala');
    admin = await login('Szef');
    await linkMinecraft(ala.token, 'a'.repeat(32), 'AlaMC');
    const before = asked.length;
    assert.deepEqual((await call('POST', '/v1/servers/voted', ala.token, { ids: ['abc'] })).body, { enabled: false, nick: null, voted: {} });
    const vote = await call('POST', '/v1/servers/abc/vote', ala.token, {});
    assert.equal(vote.status, 503);
    assert.equal(vote.body.error, 'votes_unavailable');
    assert.equal(asked.length, before, 'the list is not asked');
  });

  it('keeps the key sealed and write-only in the admin panel and its log', async () => {
    const saved = await call('POST', '/v1/admin/settings', admin.token, { values: { 'serverList.apiUrl': LIST, 'serverList.voteKey': KEY } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const view = (await call('GET', '/v1/admin/settings', admin.token)).body;
    const key = view.settings.find((s: any) => s.key === 'serverList.voteKey');
    assert.equal(key.type, 'secret');
    assert.equal(key.value, '');
    assert.equal(key.secretSet, true);
    assert.ok(!JSON.stringify(view).includes(KEY), 'the key never goes back to the panel');
    const row = app.db.sql.prepare("SELECT value FROM app_settings WHERE key = 'serverList.voteKey'").get() as { value: string };
    assert.ok(!row.value.includes(KEY), 'sealed in the database');
    const log = JSON.stringify(app.db.sql.prepare('SELECT * FROM admin_log').all());
    assert.ok(!log.includes(KEY), 'and not in the admin log');
    // a server without STORAGE_SECRET_KEY refuses to keep a key in plain text
    const other = await login('Szef', noBox);
    const refused = await call('POST', '/v1/admin/settings', other.token, { values: { 'serverList.voteKey': KEY } }, noBox);
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, 'setting_no_secret_key:serverList.voteKey');
  });

  it('refuses players without a linked Minecraft account and anyone signed out', async () => {
    const ola = await login('Ola');
    const vote = await call('POST', '/v1/servers/abc/vote', ola.token, {});
    assert.equal(vote.status, 403);
    assert.equal(vote.body.error, 'mc_not_linked');
    const voted = (await call('POST', '/v1/servers/voted', ola.token, { ids: ['abc'] })).body;
    assert.equal(voted.enabled, true);
    assert.equal(voted.linked, false);
    assert.equal((await call('POST', '/v1/servers/abc/vote', undefined, {})).status, 401);
    assert.deepEqual((await call('POST', '/v1/servers/voted', undefined, { ids: ['abc'] })).body, { enabled: true, nick: null, voted: {} });
    // someone else's Minecraft name
    const other = await call('POST', '/v1/servers/abc/vote', ala.token, { nick: 'Notch' });
    assert.equal(other.status, 403);
    assert.equal(other.body.error, 'mc_account_not_linked');
  });

  it('votes as the verified name with the player\'s address and the key, once a day', async () => {
    assert.deepEqual((await call('POST', '/v1/servers/voted', ala.token, { ids: ['abc', 'def'] })).body, { enabled: true, nick: 'AlaMC', linked: true, voted: { abc: 0, def: 0 } });
    const vote = await call('POST', '/v1/servers/abc/vote', ala.token, { nick: 'alamc' });
    assert.equal(vote.status, 200, JSON.stringify(vote.body));
    assert.deepEqual(vote.body, { ok: true, nick: 'AlaMC', votes: 11 });
    const sent = asked.findLast((a) => a.url.endsWith('/vote/slashclient'))!;
    assert.equal(sent.url, `${LIST}/servers/abc/vote/slashclient`);
    assert.equal(sent.key, KEY);
    assert.equal(sent.body.nick, 'AlaMC');
    assert.match(sent.body.ip, /127\.0\.0\.1/);
    const voted = (await call('POST', '/v1/servers/voted', ala.token, { ids: ['abc', 'def'] })).body;
    assert.ok(voted.voted.abc > 0);
    assert.equal(voted.voted.def, 0);
    const again = await call('POST', '/v1/servers/abc/vote', ala.token, {});
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'already_voted');
  });

  it('maps the list\'s answers: the same address, an unknown server, a wrong key', async () => {
    // another player from the same address
    const ewa = await login('Ewa');
    await linkMinecraft(ewa.token, 'e'.repeat(32), 'EwaMC');
    const sameIp = await call('POST', '/v1/servers/abc/vote', ewa.token, {});
    assert.equal(sameIp.status, 409);
    assert.equal(sameIp.body.error, 'already_voted_ip');
    const missing = await call('POST', '/v1/servers/nope/vote', ewa.token, {});
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'server_not_found');
    assert.equal((await call('POST', '/v1/servers/bad%20id/vote', ewa.token, {})).status, 404);
    assert.equal((await call('POST', '/v1/servers/voted', ewa.token, { ids: ['a/b'] })).status, 400);
    await call('POST', '/v1/admin/settings', admin.token, { values: { 'serverList.voteKey': 'wrong-key-0000' } });
    const wrong = await call('POST', '/v1/servers/def/vote', ewa.token, {});
    assert.equal(wrong.status, 503);
    assert.equal(wrong.body.error, 'votes_unavailable');
    // ↺ removes the key: off again
    await call('POST', '/v1/admin/settings', admin.token, { values: { 'serverList.voteKey': null } });
    assert.equal((await call('POST', '/v1/servers/voted', ewa.token, { ids: ['def'] })).body.enabled, false);
  });
});
