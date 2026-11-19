import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';

/** Ranks as Discord roles (discordRoles.ts), against a made-up Discord: only the roles picked for ranks change. */

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-discord-roles-'));
const GUILD = '1561334627208003616';
const BOT = '1000000000000000099';
const R = { vip: '1000000000000000002', partner: '1000000000000000003', other: '1000000000000000004', bot: '1000000000000000009', high: '1000000000000000010' };
const D1 = '2000000000000000001';
const D2 = '2000000000000000002';
const D3 = '2000000000000000003';

/** The server's members and their roles, what was asked, and how many 429s are still to come. */
const members = new Map<string, Set<string>>();
const asked: string[] = [];
const waits: number[] = [];
let limitNext = 0;
let forbid = '';

const fakeDiscord = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? 'GET';
  const p = url.pathname.replace(/^\/api/, '');
  asked.push(`${method} ${p}`);
  if ((init?.headers as Record<string, string>)?.Authorization !== 'Bot test-token') return Response.json({ message: '401: Unauthorized', code: 0 }, { status: 401 });
  let m: RegExpExecArray | null;
  if (method === 'GET' && p === '/users/@me') return Response.json({ id: BOT });
  if (method === 'GET' && p === `/guilds/${GUILD}/roles`) {
    return Response.json([
      { id: GUILD, name: '@everyone', color: 0, position: 0, managed: false },
      { id: R.vip, name: 'VIP', color: 0xfacc15, position: 2, managed: false },
      { id: R.partner, name: 'Partner', color: 0, position: 3, managed: false },
      { id: R.other, name: 'Ręczna', color: 0, position: 1, managed: false },
      { id: R.bot, name: 'SlashBot', color: 0, position: 5, managed: true },
      { id: R.high, name: 'Zarząd', color: 0, position: 7, managed: false },
    ]);
  }
  if (method === 'GET' && p === `/guilds/${GUILD}/members`) {
    const after = url.searchParams.get('after') ?? '0';
    return Response.json([...members].filter(([id]) => BigInt(id) > BigInt(after)).map(([id, roles]) => ({ user: { id }, roles: [...roles] })));
  }
  if ((m = new RegExp(`^/guilds/${GUILD}/members/(\\d+)$`).exec(p)) && method === 'GET') {
    const roles = members.get(m[1]);
    return roles ? Response.json({ user: { id: m[1] }, roles: [...roles] }) : Response.json({ message: 'Unknown Member', code: 10007 }, { status: 404 });
  }
  if ((m = new RegExp(`^/guilds/${GUILD}/members/(\\d+)/roles/(\\d+)$`).exec(p)) && (method === 'PUT' || method === 'DELETE')) {
    if (limitNext > 0) {
      limitNext--;
      return Response.json({ message: 'You are being rate limited.', retry_after: 0.25, global: false }, { status: 429 });
    }
    if (m[2] === forbid) return Response.json({ message: 'Missing Permissions', code: 50013 }, { status: 403 });
    const roles = members.get(m[1]);
    if (!roles) return Response.json({ message: 'Unknown Member', code: 10007 }, { status: 404 });
    if (method === 'PUT') roles.add(m[2]);
    else roles.delete(m[2]);
    return new Response(null, { status: 204 });
  }
  return Response.json({ message: 'Not found', code: 0 }, { status: 404 });
}) as typeof fetch;

let app: ReturnType<typeof createApp>;
let base = '';
async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };
const roles = (id: string) => [...(members.get(id) ?? [])].sort();
const changes = () => asked.filter((a) => a.startsWith('PUT') || a.startsWith('DELETE'));
const settle = () => app.discordRoles.idle();

let boss: { token: string; user: { id: string } };
let p1: { token: string; user: { id: string } };
let p2: { token: string; user: { id: string } };

const on = () => app.settings.set({ 'discordRoles.enabled': true, 'discordRoles.guildId': GUILD, 'discordRoles.botToken': 'test-token' }, 'test');

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'social.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'], loginsPerMinute: 1000,
    fetchImpl: fakeDiscord, storage: { secretKey: randomBytes(32).toString('base64') },
    discordRoles: { apiBase: 'https://discord.test/api', timers: false, sleep: async (ms) => { waits.push(ms); } },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  boss = await login('Szef');
  p1 = await login('Gracz1');
  p2 = await login('Gracz2');
  app.db.link('discord', D1, p1.user.id);
  app.db.link('discord', D2, p2.user.id);
  members.set(BOT, new Set([R.bot]));
  // Gracz1 is on the server with a role given by hand; Gracz2 is not on the server
  members.set(D1, new Set([R.other]));
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  asked.length = 0;
  waits.length = 0;
});

describe('discord roles', () => {
  it('switched off: nothing is asked of Discord', async () => {
    const r = await call('GET', '/v1/admin/discord-roles', boss.token);
    assert.equal(r.status, 200);
    assert.equal(r.body.blocked, 'disabled');
    assert.equal(r.body.roles, undefined);
    assert.equal((await call('POST', `/v1/admin/users/${p1.user.id}/ranks`, boss.token, { rank: 'partner' })).status, 200);
    app.discordRoles.player(p1.user.id);
    await app.discordRoles.syncNow();
    await settle();
    assert.equal((await call('POST', '/v1/admin/discord-roles/sync', boss.token)).body.error, 'discord_disabled');
    // the token is missing even with the switch on
    app.settings.set({ 'discordRoles.enabled': true }, 'test');
    assert.equal((await call('GET', '/v1/admin/discord-roles', boss.token)).body.blocked, 'no_token');
    app.settings.set({ 'discordRoles.enabled': null }, 'test');
    assert.deepEqual(asked, []);
  });

  it('the admin endpoints are for admins only', async () => {
    assert.equal((await call('GET', '/v1/admin/discord-roles')).status, 401);
    assert.equal((await call('GET', '/v1/admin/discord-roles', p1.token)).status, 403);
    assert.equal((await call('POST', '/v1/admin/discord-roles/sync', p1.token)).status, 403);
    assert.equal((await call('POST', '/v1/admin/discord-roles/ranks/partner', p1.token, { roleId: R.vip })).status, 403);
    assert.deepEqual(asked, []);
  });

  it('lists the server\'s roles without @everyone and the bots\' own', async () => {
    on();
    const r = (await call('GET', '/v1/admin/discord-roles', boss.token)).body;
    assert.equal(r.blocked, '');
    assert.deepEqual(r.roles.map((x: { name: string }) => x.name), ['Zarząd', 'Partner', 'VIP', 'Ręczna']);
    // above the bot's role: shown as one the bot cannot give
    assert.equal(r.roles.find((x: { id: string }) => x.id === R.high).assignable, false);
    assert.equal(r.roles.find((x: { id: string }) => x.id === R.vip).assignable, true);
    assert.equal(r.roles.find((x: { id: string }) => x.id === R.vip).color, '#facc15');
    assert.equal((await call('POST', '/v1/admin/discord-roles/ranks/partner', boss.token, { roleId: GUILD })).body.error, 'bad_role');
    assert.equal((await call('POST', '/v1/admin/discord-roles/ranks/nosuch', boss.token, { roleId: R.vip })).status, 404);
  });

  it('gives a rank\'s role, takes it with the rank, and leaves other roles alone', async () => {
    // Gracz1 holds partner (given above while it was off): picking its role gives it at once
    const r = await call('POST', '/v1/admin/discord-roles/ranks/partner', boss.token, { roleId: R.partner, roleName: 'Partner' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.mappings.partner, { roleId: R.partner, roleName: 'Partner' });
    await settle();
    assert.deepEqual(roles(D1), [R.partner, R.other].sort());
    // Gracz2 is not on the server: skipped, nothing given
    assert.ok(asked.includes(`GET /guilds/${GUILD}/members`));
    assert.ok(!changes().some((c) => c.includes(D2)));
    // another rank: given with the rank, at once
    await call('POST', '/v1/admin/discord-roles/ranks/support', boss.token, { roleId: R.vip, roleName: 'VIP' });
    await settle();
    assert.equal((await call('POST', `/v1/admin/users/${p1.user.id}/ranks`, boss.token, { rank: 'support' })).status, 200);
    await new Promise((r) => setTimeout(r, 50));
    await settle();
    assert.deepEqual(roles(D1), [R.partner, R.vip, R.other].sort());
    asked.length = 0;
    // the rank taken back: only its role goes
    assert.equal((await call('DELETE', `/v1/admin/users/${p1.user.id}/ranks/support`, boss.token)).status, 200);
    await new Promise((r) => setTimeout(r, 50));
    await settle();
    assert.deepEqual(roles(D1), [R.partner, R.other].sort());
    assert.deepEqual(changes(), [`DELETE /guilds/${GUILD}/members/${D1}/roles/${R.vip}`]);
    // a full pass with nothing to do changes nothing
    asked.length = 0;
    const s = (await call('POST', '/v1/admin/discord-roles/sync', boss.token)).body;
    assert.deepEqual(changes(), []);
    assert.equal(s.lastSync.checked, 2);
    assert.equal(s.lastSync.onServer, 1);
    assert.deepEqual(s.stats, { linkedPlayers: 2, linkedAccounts: 2, onServer: 1 });
  });

  it('a role taken by hand on Discord comes back on the full pass; one who joined later gets theirs', async () => {
    members.get(D1)!.delete(R.partner);
    assert.equal((await call('POST', `/v1/admin/users/${p2.user.id}/ranks`, boss.token, { rank: 'partner' })).status, 200);
    await new Promise((r) => setTimeout(r, 50));
    await settle();
    members.set(D2, new Set());
    const s = (await call('POST', '/v1/admin/discord-roles/sync', boss.token)).body;
    assert.deepEqual(roles(D1), [R.partner, R.other].sort());
    assert.deepEqual(roles(D2), [R.partner]);
    assert.equal(s.lastSync.added, 2);
    assert.equal(s.lastSync.removed, 0);
  });

  it('a new pick for a rank moves its holders from the old role to the new one', async () => {
    await call('POST', '/v1/admin/discord-roles/ranks/partner', boss.token, { roleId: R.vip, roleName: 'VIP' });
    await settle();
    assert.deepEqual(roles(D1), [R.vip, R.other].sort());
    assert.deepEqual(roles(D2), [R.vip]);
    // a later pass forgets the old role: someone given it by hand keeps it
    await app.discordRoles.syncNow();
    members.get(D2)!.add(R.partner);
    await app.discordRoles.syncNow();
    assert.ok(roles(D2).includes(R.partner));
    members.get(D2)!.delete(R.partner);
  });

  it('waits out Discord\'s 429 and goes on', async () => {
    members.get(D1)!.delete(R.vip);
    limitNext = 2;
    await app.discordRoles.syncNow();
    assert.deepEqual(roles(D1), [R.vip, R.other].sort());
    assert.equal(waits.length, 2);
    assert.ok(waits.every((ms) => ms > 200 && ms <= 250), String(waits));
  });

  it('a role the bot may not give: an error the panel shows, and the rest still goes', async () => {
    members.get(D1)!.delete(R.vip);
    forbid = R.vip;
    const s = (await call('POST', '/v1/admin/discord-roles/sync', boss.token)).body;
    forbid = '';
    assert.equal(s.lastSync.errors, 1);
    assert.match(s.lastError.text, /403/);
    assert.match(s.lastError.text, /VIP/);
    const ok = (await call('POST', '/v1/admin/discord-roles/sync', boss.token)).body;
    assert.equal(ok.lastError, null);
    assert.deepEqual(roles(D1), [R.vip, R.other].sort());
  });

  it('a wrong token: nothing changes, the error says so', async () => {
    app.settings.set({ 'discordRoles.botToken': 'wrong' }, 'test');
    const s = (await call('POST', '/v1/admin/discord-roles/sync', boss.token)).body;
    assert.match(s.lastError.text, /401/);
    assert.match(s.rolesError, /401/);
    assert.deepEqual(changes(), []);
    on();
  });

  it('an unlinked Discord account loses the ranks\' roles, and only those', async () => {
    assert.deepEqual(roles(D1), [R.vip, R.other].sort());
    const r = await call('DELETE', '/v1/me/providers/discord', p1.token);
    assert.equal(r.status, 200);
    await settle();
    assert.deepEqual(roles(D1), [R.other]);
    // linked again (here: straight in the database, the full pass finds it)
    app.db.link('discord', D3, p1.user.id);
    members.set(D3, new Set());
    await app.discordRoles.syncNow();
    assert.deepEqual(roles(D3), [R.vip]);
    assert.deepEqual(roles(D1), [R.other]);
  });

  it('a mapping removed: its role goes from the holders on the full pass', async () => {
    await call('POST', '/v1/admin/discord-roles/ranks/partner', boss.token, { roleId: '' });
    await settle();
    assert.deepEqual(roles(D3), []);
    assert.deepEqual(roles(D2), []);
    assert.deepEqual(roles(D1), [R.other]);
  });
});
