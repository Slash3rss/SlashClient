import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { LINK_EXPIRIES, LINK_USES, cleanServerAddress, cleanVersionHint, linkAlive, linkCodeOf, newLinkCode } from '../src/communityLinks.ts';
import { serveWeb } from '../src/web.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-community-links-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
type Player = { token: string; user: { id: string; handle: string; name: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Player;
async function online(token: string, presence: unknown) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token, presence }));
  for (let i = 0; i < 100 && !events.some((e) => e.type === 'ready'); i++) await new Promise((r) => setTimeout(r, 20));
  return ws;
}

/** A community with its owner, an admin, a moderator and a member. */
async function communityOf(prefix: string, settings: Record<string, unknown> = {}) {
  const owner = await login(`${prefix}Own`);
  const admin = await login(`${prefix}Adm`);
  const mod = await login(`${prefix}Mod`);
  const member = await login(`${prefix}Mem`);
  const made = await call('POST', '/v1/communities', owner.token, { name: `Społeczność ${prefix}`, ...settings });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.community.id as string;
  for (const p of [admin, mod, member]) {
    assert.equal((await call('POST', `/v1/communities/${id}/invites`, owner.token, { handle: p.user.handle })).status, 200);
    assert.equal((await call('POST', `/v1/communities/${id}/invites/accept`, p.token)).status, 200);
  }
  assert.equal((await call('POST', `/v1/communities/${id}/members/${admin.user.id}/role`, owner.token, { role: 'admin' })).status, 200);
  assert.equal((await call('POST', `/v1/communities/${id}/members/${mod.user.id}/role`, owner.token, { role: 'moderator' })).status, 200);
  return { id, owner, admin, mod, member };
}

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: true, loginsPerMinute: 10_000, oauth: {}, adminHandles: ['LinkBoss'],
    communityLimits: { members: 6 }, profileViewsPerMinute: 10_000,
  });
  app.settings.set({ 'communities.linkLookupsPerMinute': 10_000, 'communities.joinPerMinute': 10_000 }, 'test');
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('community invite links: the rules', () => {
  it('makes codes one can type, and reads a code or a whole link', () => {
    for (let i = 0; i < 50; i++) assert.match(newLinkCode(), /^[a-hjkmnp-z2-9]{8}$/);
    assert.equal(linkCodeOf('ab3dEf7h'), 'ab3def7h');
    assert.equal(linkCodeOf(' https://client.slash3rss.dev/c/AB3DEF7H '), 'ab3def7h');
    assert.equal(linkCodeOf('client.slash3rss.dev/c/ab3def7h/'), 'ab3def7h');
    assert.equal(linkCodeOf('https://client.slash3rss.dev/c/ab3def7h?x=1'), 'ab3def7h');
    for (const bad of ['', 'abc', 'ab3def7h!', 'https://x/s/ab3def7h-x', 42, undefined]) assert.equal(linkCodeOf(bad), undefined, String(bad));
  });

  it('knows when a link is spent or expired', () => {
    const now = 1_000_000;
    assert.equal(linkAlive({ expiresAt: 0, maxUses: 0, uses: 99 }, now), true);
    assert.equal(linkAlive({ expiresAt: now + 1, maxUses: 5, uses: 4 }, now), true);
    assert.equal(linkAlive({ expiresAt: now, maxUses: 0, uses: 0 }, now), false);
    assert.equal(linkAlive({ expiresAt: 0, maxUses: 5, uses: 5 }, now), false);
    assert.deepEqual(LINK_EXPIRIES, [30, 60, 1440, 10080, 0]);
    assert.deepEqual(LINK_USES, [1, 5, 10, 25, 100, 0]);
  });

  it('takes game servers on the internet only, and version hints', () => {
    assert.equal(cleanServerAddress(' Mc.Example.COM '), 'mc.example.com');
    assert.equal(cleanServerAddress('mc.example.com:25565'), 'mc.example.com');
    assert.equal(cleanServerAddress('mc.example.com.:25570'), 'mc.example.com:25570');
    assert.equal(cleanServerAddress('51.68.1.2'), '51.68.1.2');
    assert.equal(cleanServerAddress(''), '');
    for (const bad of ['localhost', '127.0.0.1', '192.168.1.10:25565', '10.0.0.1', '172.20.1.1', 'mc.local', 'nas.lan', 'example', 'a..b.com', 'mc.example.com:0', 'mc.example.com:70000', '300.1.1.1', 'mc example.com', 7]) {
      assert.equal(cleanServerAddress(bad), undefined, String(bad));
    }
    assert.equal(cleanVersionHint('1.21.4'), '1.21.4');
    assert.equal(cleanVersionHint(undefined), '');
    assert.equal(cleanVersionHint(''), '');
    assert.equal(cleanVersionHint('1.21 Fabric'), undefined);
  });
});

describe('community invite links', () => {
  it('admins make, list and revoke links; others may not', async () => {
    const c = await communityOf('Lnk');
    for (const p of [c.mod, c.member]) assert.equal((await call('POST', `/v1/communities/${c.id}/links`, p.token, { minutes: 60, uses: 5 })).status, 403);
    assert.equal((await call('GET', `/v1/communities/${c.id}/links`, c.mod.token)).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/links`, c.admin.token, { minutes: 61, uses: 5 })).status, 400);
    assert.equal((await call('POST', `/v1/communities/${c.id}/links`, c.admin.token, { minutes: 60, uses: 7 })).status, 400);
    const made = await call('POST', `/v1/communities/${c.id}/links`, c.admin.token, { minutes: 60, uses: 5 });
    assert.equal(made.status, 200);
    const link = made.body.link;
    assert.match(link.code, /^[a-z2-9]{8}$/);
    assert.equal(link.url, `https://client.example/c/${link.code}`);
    assert.equal(link.maxUses, 5);
    assert.ok(link.expiresAt > Date.now() + 59 * 60_000 && link.expiresAt <= Date.now() + 60 * 60_000);
    const never = (await call('POST', `/v1/communities/${c.id}/links`, c.owner.token, { minutes: 0, uses: 0 })).body.link;
    assert.equal(never.expiresAt, 0);
    const list = await call('GET', `/v1/communities/${c.id}/links`, c.owner.token);
    assert.deepEqual(list.body.links.map((l: any) => l.code).sort(), [link.code, never.code].sort());
    assert.equal(list.body.links.find((l: any) => l.code === link.code).by.handle, c.admin.user.handle);
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/links/${link.code}`, c.member.token)).status, 403);
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/links/${link.code}`, c.owner.token)).status, 200);
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/links/${link.code}`, c.owner.token)).status, 404);
    // a revoked link lets nobody in
    const stranger = await login('LnkStr');
    assert.equal((await call('GET', `/v1/communities/links/${link.code}`, stranger.token)).body.error, 'invite_not_found');
    const log = (await call('GET', `/v1/communities/${c.id}/log`, c.owner.token)).body.log.map((e: any) => e.action);
    assert.ok(log.includes('link_create') && log.includes('link_revoke'));
  });

  it('lets one into a private community, counts its uses and stops when spent', async () => {
    const c = await communityOf('Prv', { visibility: 'private' });
    const code = (await call('POST', `/v1/communities/${c.id}/links`, c.admin.token, { minutes: 30, uses: 1 })).body.link.code;
    const a = await login('PrvA');
    const b = await login('PrvB');
    // without the link: nothing to see
    assert.equal((await call('GET', `/v1/communities/${c.id}`, a.token)).status, 404);
    const seen = await call('GET', `/v1/communities/links/${code.toUpperCase()}`, a.token);
    assert.equal(seen.status, 200);
    assert.equal(seen.body.community.name, 'Społeczność Prv');
    assert.equal(seen.body.community.state, 'open');
    assert.equal(seen.body.usesLeft, 1);
    const joined = await call('POST', `/v1/communities/links/${code}/join`, a.token);
    assert.equal(joined.status, 200);
    assert.equal(joined.body.status, 'joined');
    assert.equal(joined.body.id, c.id);
    assert.ok(joined.body.communities.some((x: any) => x.id === c.id));
    // again: already in, the link is not used up by that
    assert.equal((await call('POST', `/v1/communities/links/${code}/join`, a.token)).body.status, 'member');
    const spent = await call('POST', `/v1/communities/links/${code}/join`, b.token);
    assert.equal(spent.status, 410);
    assert.equal(spent.body.error, 'invite_expired');
    // spent links leave the list
    assert.equal((await call('GET', `/v1/communities/${c.id}/links`, c.owner.token)).body.links.length, 0);
  });

  it('lets one past "on request", never past a ban or a full community', async () => {
    const c = await communityOf('Req', { joinMode: 'request' });
    const code = (await call('POST', `/v1/communities/${c.id}/links`, c.owner.token, { minutes: 1440, uses: 0 })).body.link.code;
    const asker = await login('ReqAsk');
    assert.equal((await call('POST', `/v1/communities/${c.id}/join`, asker.token)).body.status, 'requested');
    assert.equal((await call('POST', `/v1/communities/links/${code}/join`, asker.token)).body.status, 'joined');
    assert.equal((await call('GET', `/v1/communities/${c.id}/requests`, c.owner.token)).body.total, 0);
    const bad = await login('ReqBad');
    assert.equal((await call('POST', `/v1/communities/${c.id}/bans`, c.owner.token, { user: bad.user.id })).status, 200);
    assert.equal((await call('GET', `/v1/communities/links/${code}`, bad.token)).body.community.state, 'banned');
    assert.equal((await call('POST', `/v1/communities/links/${code}/join`, bad.token)).body.error, 'community_banned');
    // 6 members at most: owner, admin, mod, member, asker + one
    assert.equal((await call('POST', `/v1/communities/links/${code}/join`, (await login('ReqSix')).token)).status, 200);
    const late = await login('ReqLate');
    assert.equal((await call('GET', `/v1/communities/links/${code}`, late.token)).body.community.state, 'full');
    assert.equal((await call('POST', `/v1/communities/links/${code}/join`, late.token)).body.error, 'community_full');
  });

  it('shows the invite page data without signing in, and limits lookups per address', async () => {
    const c = await communityOf('Pub', { visibility: 'private' });
    const code = (await call('POST', `/v1/communities/${c.id}/links`, c.owner.token, { minutes: 10080, uses: 100 })).body.link.code;
    const page = await call('GET', `/v1/public/communities/links/${code}`);
    assert.equal(page.status, 200);
    assert.equal(page.body.community.name, 'Społeczność Pub');
    assert.equal(page.body.community.members, 4);
    assert.equal(page.body.community.owner.id, undefined, 'no account ids on the public page');
    assert.equal(page.body.community.logoUrl, null);
    assert.equal(page.body.usesLeft, 100);
    assert.equal((await call('GET', '/v1/public/communities/links/zzzzzzzz')).status, 404);
    app.settings.set({ 'communities.linkLookupsPerMinute': 3 }, 'test');
    try {
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push((await call('GET', '/v1/public/communities/links/yyyyyyyy', undefined, undefined, { 'X-Forwarded-For': '203.0.113.9' })).status);
      assert.ok(statuses.includes(429), statuses.join());
    } finally {
      app.settings.set({ 'communities.linkLookupsPerMinute': 10_000 }, 'test');
    }
  });

  it('has the /c/<code> page on the website', async () => {
    let served = '';
    const res = { writeHead: () => res, end: (data: unknown) => { served = String(data); } } as never;
    assert.equal(await serveWeb(path.join(import.meta.dirname, '..', 'web'), '/c/ab3def7h', res), true);
    assert.match(served, /zaproszenie\.js/);
  });
});

describe('a community\'s game server and the verified badge', () => {
  it('admins set the server; every summary shows it with the members playing there', async () => {
    const c = await communityOf('Srv');
    assert.equal((await call('POST', `/v1/communities/${c.id}/server`, c.mod.token, { address: 'mc.example.com' })).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/server`, c.admin.token, { address: '192.168.0.2' })).body.error, 'bad_server');
    assert.equal((await call('POST', `/v1/communities/${c.id}/server`, c.admin.token, { address: 'mc.example.com', version: 'nowa' })).body.error, 'bad_version');
    const set = await call('POST', `/v1/communities/${c.id}/server`, c.admin.token, { address: 'Mc.Example.com:25565', version: '1.21.4' });
    assert.equal(set.status, 200);
    assert.deepEqual(set.body.community.server, { address: 'mc.example.com', version: '1.21.4', playing: 0 });
    // two members there (one hides the server from friends: not counted), one elsewhere
    await call('POST', '/v1/me', c.admin.token, { showServer: false });
    const sockets = [
      await online(c.member.token, { status: 'online', activity: { kind: 'server', server: 'MC.example.com' } }),
      await online(c.admin.token, { status: 'online', activity: { kind: 'server', server: 'mc.example.com' } }),
      await online(c.mod.token, { status: 'online', activity: { kind: 'server', server: 'other.example.com' } }),
    ];
    try {
      const mine = (await call('GET', '/v1/communities/mine', c.owner.token)).body.communities.find((x: any) => x.id === c.id);
      assert.deepEqual(mine.server, { address: 'mc.example.com', version: '1.21.4', playing: 1 });
      const dir = (await call('GET', `/v1/communities/discover?q=${encodeURIComponent('Społeczność Srv')}`, c.owner.token)).body.communities[0];
      assert.equal(dir.server.address, 'mc.example.com');
      assert.equal(dir.server.playing, 1);
    } finally {
      for (const ws of sockets) ws.close();
    }
    // taken off
    assert.equal((await call('POST', `/v1/communities/${c.id}/server`, c.owner.token, { address: '' })).body.community.server, undefined);
    const log = (await call('GET', `/v1/communities/${c.id}/log`, c.owner.token)).body.log.map((e: any) => e.action);
    assert.equal(log.filter((a: string) => a === 'server').length, 2);
  });

  it('the site admin marks a community verified; everyone sees the badge', async () => {
    const boss = await login('LinkBoss');
    const c = await communityOf('Ver');
    assert.equal((await call('POST', `/v1/admin/communities/${c.id}/verified`, c.owner.token, { verified: true })).status, 403);
    assert.equal((await call('POST', `/v1/admin/communities/${c.id}/verified`, boss.token, { verified: 'yes' })).status, 400);
    assert.equal((await call('POST', `/v1/admin/communities/${c.id}/verified`, boss.token, { verified: true })).status, 200);
    const mine = (await call('GET', '/v1/communities/mine', c.member.token)).body.communities.find((x: any) => x.id === c.id);
    assert.equal(mine.verified, true);
    assert.equal((await call('GET', `/v1/public/communities/${c.id}`)).body.community.verified, true);
    const admin = (await call('GET', `/v1/admin/communities?q=${encodeURIComponent('Społeczność Ver')}`, boss.token)).body.communities[0];
    assert.equal(admin.verified, true);
    assert.equal((await call('POST', `/v1/admin/communities/${c.id}/verified`, boss.token, { verified: false })).status, 200);
    assert.equal((await call('GET', `/v1/public/communities/${c.id}`)).body.community.verified, undefined);
    const log = (await call('GET', `/v1/admin/communities/${c.id}`, boss.token)).body.log.map((e: any) => e.action);
    assert.ok(log.includes('admin_verify') && log.includes('admin_unverify'));
  });

  it('an older community without anything new still looks the same', async () => {
    const c = await communityOf('Old');
    const mine = (await call('GET', '/v1/communities/mine', c.member.token)).body.communities.find((x: any) => x.id === c.id);
    assert.equal(mine.verified, undefined);
    assert.equal(mine.server, undefined);
  });
});
