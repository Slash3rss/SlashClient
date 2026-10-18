import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-admin-'));
const web = path.join(dir, 'web');
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text, type: res.headers.get('content-type') ?? '', csp: res.headers.get('content-security-policy') ?? '' };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

before(async () => {
  mkdirSync(path.join(web, 'vendor'), { recursive: true });
  writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>strona</title>');
  writeFileSync(path.join(web, 'admin.html'), '<!doctype html><title>panel</title>');
  writeFileSync(path.join(web, 'style.css'), 'body{}');
  writeFileSync(path.join(dir, 'secret.txt'), 'nie dla ciebie');
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'], webDir: web });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('website', () => {
  it('serves the pages and their files, nothing outside web/', async () => {
    const page = await call('GET', '/');
    assert.equal(page.status, 200);
    assert.match(page.text, /strona/);
    assert.match(page.csp, /default-src 'self'/);
    assert.match((await call('GET', '/admin')).text, /panel/);
    assert.equal((await call('GET', '/style.css')).type, 'text/css; charset=utf-8');
    // unchanged files answer 304 to a browser that has them
    const first = await fetch(base + '/style.css');
    const again = await fetch(base + '/style.css', { headers: { 'If-Modified-Since': first.headers.get('last-modified')! } });
    assert.equal(again.status, 304);
    for (const evil of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%5csecret.txt', '/.env', '/x.exe']) {
      assert.equal((await call('GET', evil)).status, 404, evil);
    }
    // the API stays JSON
    assert.equal((await call('GET', '/v1/nope')).body.error, 'not_found');
  });
});

describe('admin panel', () => {
  it('lets only admins in', async () => {
    const player = await login('Gracz');
    assert.equal((await call('GET', '/v1/admin/stats')).status, 401);
    assert.equal((await call('GET', '/v1/admin/stats', player.token)).body.error, 'not_admin');
    const boss = await login('Szef');
    const me = (await call('GET', '/v1/me', boss.token)).body;
    assert.equal(me.admin, true);
    assert.equal(me.banned, undefined);
    const stats = (await call('GET', '/v1/admin/stats', boss.token)).body;
    assert.ok(stats.users >= 2);
    assert.equal(stats.signups.length, 30);
  });

  it('finds accounts, gives the admin role, and keeps the configured admin', async () => {
    const boss = await login('Szef');
    const ola = await login('Ola');
    const found = (await call('GET', '/v1/admin/users?q=ol', boss.token)).body;
    assert.deepEqual(found.users.map((u: any) => u.handle), ['Ola']);
    // a search with SQL wildcards finds nothing extra
    assert.equal((await call('GET', '/v1/admin/users?q=%25', boss.token)).body.total, 0);
    await call('POST', `/v1/admin/users/${ola.user.id}`, boss.token, { role: 'admin' });
    assert.equal((await call('GET', '/v1/admin/stats', ola.token)).status, 200);
    // nobody takes the role from the configured admin, nor bans themselves
    assert.equal((await call('POST', `/v1/admin/users/${boss.user.id}`, ola.token, { role: '' })).body.error, 'config_admin');
    assert.equal((await call('POST', `/v1/admin/users/${ola.user.id}`, ola.token, { banned: true })).body.error, 'self');
    assert.equal((await call('POST', `/v1/admin/users/${boss.user.id}`, ola.token, { banned: true })).body.error, 'config_admin');
    await call('POST', `/v1/admin/users/${ola.user.id}`, boss.token, { role: '' });
    assert.equal((await call('GET', '/v1/admin/stats', ola.token)).body.error, 'not_admin');
  });

  it('gives ranks: support, partner and friend, admins are red anyway; only admins can', async () => {
    const boss = await login('Szef');
    const kuba = await login('Kuba');
    assert.equal((await call('GET', '/v1/me', boss.token)).body.badge, 'admin');
    assert.equal((await call('POST', `/v1/admin/users/${kuba.user.id}`, boss.token, { rank: 'king' })).body.error, 'bad_rank');
    const after = (await call('POST', `/v1/admin/users/${kuba.user.id}`, boss.token, { rank: 'partner' })).body;
    assert.equal(after.rank, 'partner');
    assert.equal((await call('GET', '/v1/me', kuba.token)).body.badge, 'partner');
    // a player cannot give themselves a rank
    assert.equal((await call('POST', `/v1/admin/users/${kuba.user.id}`, kuba.token, { rank: 'support' })).body.error, 'not_admin');
    assert.equal((await call('POST', '/v1/me', kuba.token, { rank: 'support' })).body.rank, 'partner');
    // friends of SlashClient: a green logo, and their own cape (others may not wear it)
    const ola = await login('Ola');
    assert.equal((await call('POST', '/v1/me', ola.token, { cape: 'staff_friend' })).body.error, 'bad_cape');
    assert.equal((await call('POST', `/v1/admin/users/${ola.user.id}`, boss.token, { rank: 'friend' })).body.rank, 'friend');
    assert.equal((await call('GET', '/v1/me', ola.token)).body.badge, 'friend');
    assert.equal((await call('POST', '/v1/me', ola.token, { cape: 'staff_friend' })).body.cape, 'staff_friend');
    assert.equal((await call('POST', '/v1/me', kuba.token, { cape: 'staff_friend' })).body.error, 'bad_cape');
    const log = (await call('GET', '/v1/admin/log', boss.token)).body;
    assert.ok(JSON.stringify(log).includes('set_rank'));
  });

  it('bans: the session ends, the live connection closes, signing in again is refused', async () => {
    const boss = await login('Szef');
    const bad = await login('Troll');
    const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'auth', token: bad.token }));
    await new Promise((r) => ws.once('message', r));
    const closed = new Promise<number>((r) => ws.once('close', (code) => r(code)));
    await call('POST', `/v1/admin/users/${bad.user.id}`, boss.token, { banned: true });
    assert.equal(await closed, 4003);
    assert.equal((await call('GET', '/v1/me', bad.token)).status, 401);
    assert.equal((await call('POST', '/v1/auth/dev', undefined, { name: 'Troll' })).body.error, 'banned');
    assert.equal((await call('GET', '/v1/admin/users?q=troll', boss.token)).body.users[0].banned, true);
    await call('POST', `/v1/admin/users/${bad.user.id}`, boss.token, { banned: false });
    assert.equal((await call('POST', '/v1/auth/dev', undefined, { name: 'Troll' })).status, 200);
  });

  it('switches capes off, makes them exclusive and grants them', async () => {
    const boss = await login('Szef');
    const ann = await login('Ania');
    const bob = await login('Bartek');
    await call('POST', '/v1/me', ann.token, { cape: 'gold' });
    await call('POST', '/v1/me', bob.token, { cape: 'gold' });
    // exclusive: those without a grant lose it, the granted one may wear it
    await call('POST', '/v1/admin/cosmetics/gold/grants', boss.token, { handle: '@Ania' });
    await call('POST', '/v1/admin/cosmetics/gold', boss.token, { exclusive: true });
    assert.equal((await call('GET', '/v1/me', ann.token)).body.cape, 'gold');
    assert.equal((await call('GET', '/v1/me', bob.token)).body.cape, '');
    assert.equal((await call('POST', '/v1/me', bob.token, { cape: 'gold' })).body.error, 'bad_cape');
    const catalog = (await call('GET', '/v1/cosmetics', bob.token)).body.capes;
    assert.deepEqual(catalog.find((c: any) => c.id === 'gold'), { id: 'gold', name: 'Gold', exclusive: true, available: false });
    // taking the grant back takes the cape off
    await call('DELETE', `/v1/admin/cosmetics/gold/grants/${ann.user.id}`, boss.token);
    assert.equal((await call('GET', '/v1/me', ann.token)).body.cape, '');
    // switched off: gone from the catalog and from everyone
    await call('POST', '/v1/me', bob.token, { cape: 'rose' });
    await call('POST', '/v1/admin/cosmetics/rose', boss.token, { enabled: false });
    assert.equal((await call('GET', '/v1/me', bob.token)).body.cape, '');
    assert.ok(!(await call('GET', '/v1/cosmetics')).body.capes.some((c: any) => c.id === 'rose'));
    const admin = (await call('GET', '/v1/admin/cosmetics', boss.token)).body.capes;
    assert.equal(admin.find((c: any) => c.id === 'rose').enabled, false);
    // the admin may still put any cape on anyone
    await call('POST', `/v1/admin/users/${bob.user.id}`, boss.token, { cape: 'gold' });
    assert.equal((await call('GET', '/v1/me', bob.token)).body.cape, 'gold');
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries.map((e: any) => e.action);
    assert.ok(['grant', 'cape_settings', 'revoke', 'set_cape'].every((a) => log.includes(a)));
  });

  it('switches any cosmetic off or makes it exclusive, which takes it off who may not wear it', async () => {
    const boss = await login('Szef');
    const nina = await login('Nina');
    await call('POST', '/v1/me', nina.token, { loadout: { wings: 'dragon', trail: 'snow' } });
    const list = (await call('GET', '/v1/admin/cosmetics', boss.token)).body;
    assert.ok(list.items.some((i: any) => i.id === 'dragon' && i.slot === 'wings' && i.wearing >= 1));
    await call('POST', '/v1/admin/cosmetics/dragon', boss.token, { exclusive: true });
    assert.deepEqual((await call('GET', '/v1/me', nina.token)).body.loadout, { trail: 'snow' });
    // granted, she may wear it again; the rank items can be granted too
    await call('POST', '/v1/admin/cosmetics/dragon/grants', boss.token, { handle: 'Nina' });
    await call('POST', '/v1/admin/cosmetics/phoenix/grants', boss.token, { handle: 'Nina' });
    assert.equal((await call('POST', '/v1/me', nina.token, { loadout: { wings: 'phoenix' } })).body.loadout.wings, 'phoenix');
    await call('POST', '/v1/admin/cosmetics/dragon', boss.token, { exclusive: false });
  });

  it('lets admins wear every cosmetic: exclusive, switched off, any rank, and keeps theirs on', async () => {
    const boss = await login('Szef');
    await call('POST', '/v1/me', boss.token, { cape: 'mono', loadout: { pet: 'bee' } });
    // made exclusive or switched off: the admin keeps them, and may still pick them
    await call('POST', '/v1/admin/cosmetics/mono', boss.token, { exclusive: true });
    await call('POST', '/v1/admin/cosmetics/bee', boss.token, { enabled: false });
    const me = (await call('GET', '/v1/me', boss.token)).body;
    assert.equal(me.cape, 'mono');
    assert.equal(me.loadout.pet, 'bee');
    assert.equal((await call('POST', '/v1/me', boss.token, { cape: 'staff_friend' })).body.cape, 'staff_friend');
    assert.equal((await call('POST', '/v1/me', boss.token, { loadout: { pet: 'bee', wings: 'phoenix' } })).body.loadout.wings, 'phoenix');
    // the catalog shows the admin everything, and all of it available
    const items = (await call('GET', '/v1/cosmetics', boss.token)).body.items;
    assert.ok(items.some((i: any) => i.id === 'bee'));
    assert.ok(items.every((i: any) => i.available));
    // others: the switched-off one is gone, the exclusive one locked
    const ola = await login('Ola2');
    const theirs = (await call('GET', '/v1/cosmetics', ola.token)).body.items;
    assert.ok(!theirs.some((i: any) => i.id === 'bee'));
    assert.equal(theirs.find((i: any) => i.id === 'mono').available, false);
    await call('POST', '/v1/admin/cosmetics/mono', boss.token, { exclusive: false });
    await call('POST', '/v1/admin/cosmetics/bee', boss.token, { enabled: true });
  });

  it('deletes an account with its friends and messages', async () => {
    const boss = await login('Szef');
    const x = await login('Usuwany');
    const y = await login('Kolega');
    await call('POST', '/v1/friends/requests', x.token, { handle: 'Kolega' });
    await call('POST', `/v1/friends/requests/${x.user.id}/accept`, y.token);
    await call('POST', `/v1/messages/${y.user.id}`, x.token, { text: 'hej' });
    assert.equal((await call('DELETE', `/v1/admin/users/${x.user.id}`, boss.token)).status, 200);
    assert.equal((await call('GET', `/v1/admin/users/${x.user.id}`, boss.token)).status, 404);
    assert.deepEqual((await call('GET', '/v1/friends', y.token)).body.friends, []);
    assert.equal((await call('DELETE', `/v1/admin/users/${boss.user.id}`, boss.token)).body.error, 'self');
  });
});
