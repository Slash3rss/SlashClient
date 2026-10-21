import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import {
  ROLE_PERMISSIONS, allowed, allowedOn, canPost, canRead, cleanChannelName, cleanColor, cleanPermissions, cleanRoleName, mayManageRole, power, type Actor, type CustomRoleRow,
} from '../src/communityRoles.ts';
import { CommunityStore } from '../src/communityStore.ts';

/** Own channels, custom roles and the moderation log in pages (0.9.30). */

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-community-roles-'));
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
type Player = { token: string; user: { id: string; handle: string; name: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Player;
async function connect(token: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token, presence: { status: 'online' } }));
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

/** A community with an owner, an admin, a moderator and three members. */
async function community(prefix: string) {
  const owner = await login(`${prefix}Own`);
  const admin = await login(`${prefix}Adm`);
  const mod = await login(`${prefix}Mod`);
  const vip = await login(`${prefix}Vip`);
  const member = await login(`${prefix}Mem`);
  const other = await login(`${prefix}Oth`);
  const made = await call('POST', '/v1/communities', owner.token, { name: `Role ${prefix}` });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.community.id as string;
  for (const p of [admin, mod, vip, member, other]) assert.equal((await call('POST', `/v1/communities/${id}/join`, p.token)).status, 200);
  assert.equal((await call('POST', `/v1/communities/${id}/members/${admin.user.id}/role`, owner.token, { role: 'admin' })).status, 200);
  assert.equal((await call('POST', `/v1/communities/${id}/members/${mod.user.id}/role`, owner.token, { role: 'moderator' })).status, 200);
  const general = made.body.community.channels.find((c: any) => c.kind === 'general').id as string;
  const news = made.body.community.channels.find((c: any) => c.kind === 'announcements').id as string;
  return { id, owner, admin, mod, vip, member, other, general, news };
}
type C = Awaited<ReturnType<typeof community>>;
const mine = async (c: C, p: Player) => (await call('GET', `/v1/communities/${c.id}`, p.token)).body.community;
const newRole = (c: C, p: Player, body: Record<string, unknown>) => call('POST', `/v1/communities/${c.id}/roles`, p.token, { color: '#22c55e', permissions: [], ...body });
const newChannel = (c: C, p: Player, body: Record<string, unknown>) => call('POST', `/v1/communities/${c.id}/channels`, p.token, body);
const give = (c: C, p: Player, user: Player, role: string | null) => call('POST', `/v1/communities/${c.id}/members/${user.user.id}/custom-role`, p.token, { role });
const post = (c: C, p: Player, ch: string, text: string) => call('POST', `/v1/communities/${c.id}/channels/${ch}/messages`, p.token, { text });

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 10_000, oauth: {},
    communityLimits: { members: 30, channels: 5, roles: 3 }, chatBurst: { messages: 100, seconds: 10 }, profileViewsPerMinute: 10_000,
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('custom roles and own channels: the rules', () => {
  const role = (position: number, permissions: CustomRoleRow['permissions'] = [], id = `r${position}`): CustomRoleRow => ({ id, community: 'c', name: id, color: '#ffffff', permissions, position, createdAt: 0 });

  it('ranks a built-in role over any custom one, and custom ones by their order', () => {
    const vip: Actor = { role: 'member', custom: role(2, ['kick']) };
    const low: Actor = { role: 'member', custom: role(1) };
    assert.ok(power({ role: 'moderator' }) > power(vip));
    assert.ok(power({ role: 'moderator', custom: role(1) }) > power({ role: 'moderator' }));
    assert.ok(power(vip) > power(low) && power(low) > power({ role: 'member' }));
    // a custom role's permission works only on those below it
    assert.equal(allowedOn(vip, 'kick', { role: 'member' }), true);
    assert.equal(allowedOn(vip, 'kick', low), true);
    assert.equal(allowedOn(vip, 'kick', { role: 'member', custom: role(3) }), false);
    assert.equal(allowedOn(vip, 'kick', { role: 'moderator' }), false);
    assert.equal(allowedOn(vip, 'ban', { role: 'member' }), false);
    // the built-in roles keep what they had; the log is for moderators now
    assert.equal(allowed({ role: 'moderator' }, 'log'), true);
    assert.equal(allowed({ role: 'member' }, 'log'), false);
    assert.equal(allowed({ role: 'moderator' }, 'manageChannels'), false);
    assert.equal(allowed({ role: 'admin' }, 'manageRoles'), true);
    for (const p of ROLE_PERMISSIONS) assert.equal(allowed({ role: 'owner' }, p), true, p);
  });

  it('lets managers below admins manage only the roles below their own', () => {
    const manager: Actor = { role: 'member', custom: role(2, ['manageRoles']) };
    assert.equal(mayManageRole(manager, role(1)), true);
    assert.equal(mayManageRole(manager, role(2)), false);
    assert.equal(mayManageRole(manager, role(3)), false);
    assert.equal(mayManageRole({ role: 'admin' }, role(3)), true);
    assert.equal(mayManageRole({ role: 'moderator' }, role(1)), false);
  });

  it('reads and writes channels by role, custom roles let in besides; admins everywhere', () => {
    const ch = { readRole: 'moderator' as const, readRoles: ['vip'], postRole: 'admin' as const, writeRoles: ['vip'] };
    const vip: Actor = { role: 'member', custom: role(1, [], 'vip') };
    assert.equal(canRead({ role: 'member' }, ch), false);
    assert.equal(canRead(vip, ch), true);
    assert.equal(canPost(vip, ch), true);
    assert.equal(canRead({ role: 'moderator' }, ch), true);
    assert.equal(canPost({ role: 'moderator' }, ch), false);
    assert.equal(canPost({ role: 'admin' }, { ...ch, readRole: 'admin', readRoles: [] }), true);
    // "write in read-only channels"
    const announcements = { readRole: 'member' as const, readRoles: [], postRole: 'admin' as const, writeRoles: [] };
    assert.equal(canPost({ role: 'member' }, announcements), false);
    assert.equal(canPost({ role: 'member', custom: role(1, ['postReadOnly']) }, announcements), true);
  });

  it('cleans names, colours and permissions', () => {
    assert.equal(cleanChannelName('#Handel ludzi'), 'handel-ludzi');
    assert.equal(cleanChannelName('pvp'), 'pvp');
    assert.equal(cleanChannelName('żółć_1'), 'żółć_1');
    for (const bad of ['a', '#', '-abc', 'x'.repeat(25), 'a!b', 5, '']) assert.equal(cleanChannelName(bad), undefined, String(bad));
    assert.equal(cleanRoleName('  Stały   bywalec '), 'Stały bywalec');
    for (const bad of ['', '   ', 'x'.repeat(25), 'a\u0007']) assert.equal(cleanRoleName(bad), undefined);
    assert.equal(cleanColor('AABBCC'), '#aabbcc');
    assert.equal(cleanColor('#12ab9F'), '#12ab9f');
    for (const bad of ['#abc', 'red', '#gggggg', 1]) assert.equal(cleanColor(bad), undefined);
    assert.deepEqual(cleanPermissions(['kick', 'pin', 'kick']), ['pin', 'kick']);
    assert.equal(cleanPermissions(['fly']), undefined);
    assert.equal(cleanPermissions('pin'), undefined);
  });

  it('moves a database from before 0.9.30: old channels stay for everyone, members have no custom role', () => {
    const file = path.join(dir, 'old.db');
    const sql = new DatabaseSync(file);
    sql.exec(`CREATE TABLE users (uuid TEXT PRIMARY KEY);
CREATE TABLE communities (id TEXT PRIMARY KEY, name TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '', tag_lower TEXT, description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public', join_mode TEXT NOT NULL DEFAULT 'open', owner TEXT NOT NULL, member_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, last_message_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE community_members (community_id TEXT NOT NULL, uuid TEXT NOT NULL, role TEXT NOT NULL, joined_at INTEGER NOT NULL, notify TEXT NOT NULL DEFAULT 'mentions',
  on_profile INTEGER NOT NULL DEFAULT 1, muted_until INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (community_id, uuid));
CREATE TABLE community_channels (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', post_role TEXT NOT NULL DEFAULT 'member',
  position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, slow_seconds INTEGER NOT NULL DEFAULT 0);
INSERT INTO users VALUES ('u1');
INSERT INTO communities (id, name, owner, member_count, created_at) VALUES ('c1', 'Stara', 'u1', 1, 1);
INSERT INTO community_members (community_id, uuid, role, joined_at) VALUES ('c1', 'u1', 'owner', 1);
INSERT INTO community_channels (id, community_id, kind, post_role, position, created_at) VALUES ('g', 'c1', 'general', 'member', 0, 1), ('n', 'c1', 'announcements', 'admin', 1, 1);`);
    const store = new CommunityStore(sql);
    assert.deepEqual(store.channels('c1').map((ch) => [ch.id, ch.readRole, ch.readRoles, ch.postRole, ch.writeRoles]), [['g', 'member', [], 'member', []], ['n', 'member', [], 'admin', []]]);
    assert.equal(store.member('c1', 'u1')?.customRole, null);
    // a second start does not alter again
    new CommunityStore(sql);
    sql.close();
  });
});

describe('custom roles and own channels over HTTP', () => {
  it('admins make, change, order and delete roles; give them to members; the colour shows by the nick', async () => {
    const c = await community('Ro');
    assert.equal((await newRole(c, c.mod, { name: 'VIP' })).status, 403);
    for (const bad of [{ name: '' }, { name: 'VIP', color: 'red' }, { name: 'VIP', permissions: ['fly'] }]) assert.equal((await newRole(c, c.admin, bad)).status, 400, JSON.stringify(bad));
    const vip = await newRole(c, c.admin, { name: 'VIP', color: '#F59E0B', permissions: ['postReadOnly'] });
    assert.equal(vip.status, 200, JSON.stringify(vip.body));
    assert.deepEqual([vip.body.role.name, vip.body.role.color, vip.body.role.position, vip.body.role.permissions], ['VIP', '#f59e0b', 1, ['postReadOnly']]);
    assert.equal((await newRole(c, c.admin, { name: 'vip' })).status, 409);
    const helper = (await newRole(c, c.admin, { name: 'Pomocnik', permissions: ['deleteMessage', 'mute'] })).body.role;
    // a new one goes to the bottom
    const list = (await call('GET', `/v1/communities/${c.id}/roles`, c.member.token)).body;
    assert.deepEqual(list.roles.map((r: any) => [r.name, r.position]), [['VIP', 2], ['Pomocnik', 1]]);
    assert.equal(list.manage, false);
    assert.ok(list.permissions.some((p: any) => p.id === 'manageChannels'));
    // given: the member's list has it, and so do their messages and the members' list
    const live = await connect(c.other.token);
    assert.equal((await give(c, c.mod, c.vip, vip.body.role.id)).status, 403);
    assert.equal((await give(c, c.admin, c.vip, vip.body.role.id)).status, 200);
    assert.deepEqual((await mine(c, c.vip)).customRole, { id: vip.body.role.id, name: 'VIP', color: '#f59e0b' });
    assert.equal((await mine(c, c.vip)).permissions.postReadOnly, true);
    const sent = await post(c, c.vip, c.general, 'Cześć');
    assert.equal(sent.body.message.author.customRole.name, 'VIP');
    assert.equal((await live.waitFor((e) => e.type === 'community-message' && e.message.id === sent.body.message.id)).message.author.customRole.color, '#f59e0b');
    const members = (await call('GET', `/v1/communities/${c.id}/members`, c.member.token)).body.members;
    assert.equal(members.find((m: any) => m.id === c.vip.user.id).customRole.name, 'VIP');
    // "write in read-only channels": VIP writes announcements, a plain member does not
    assert.equal((await post(c, c.vip, c.news, 'Ogłoszenie VIP')).status, 200);
    assert.equal((await post(c, c.member, c.news, 'Nie wolno')).status, 403);
    // the limit, changed, ordered, deleted (and gone from its members)
    assert.equal((await newRole(c, c.admin, { name: 'Trzecia' })).status, 200);
    assert.equal((await newRole(c, c.admin, { name: 'Czwarta' })).status, 400);
    assert.equal((await call('POST', `/v1/communities/${c.id}/roles/${vip.body.role.id}`, c.admin.token, { name: 'Złoty VIP', color: '#ffd700' })).body.role.name, 'Złoty VIP');
    const ids = (await call('GET', `/v1/communities/${c.id}/roles`, c.admin.token)).body.roles.map((r: any) => r.id);
    assert.equal((await call('POST', `/v1/communities/${c.id}/roles/order`, c.admin.token, { order: ids.slice(1) })).status, 400);
    assert.equal((await call('POST', `/v1/communities/${c.id}/roles/order`, c.admin.token, { order: [...ids].reverse() })).status, 200);
    assert.deepEqual((await call('GET', `/v1/communities/${c.id}/roles`, c.admin.token)).body.roles.map((r: any) => r.id), [...ids].reverse());
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/roles/${vip.body.role.id}`, c.admin.token)).status, 200);
    assert.equal((await mine(c, c.vip)).customRole, undefined);
    assert.equal((await post(c, c.vip, c.news, 'Już nie')).status, 403);
    assert.equal(helper.position, 1);
    live.ws.close();
  });

  it('a custom role moderates only those below it, and manages only roles below its own', async () => {
    const c = await community('Rm');
    const lead = (await newRole(c, c.owner, { name: 'Lider', permissions: ['kick', 'manageRoles', 'mute'] })).body.role;
    const low = (await newRole(c, c.owner, { name: 'Nowy' })).body.role;
    // Lider above Nowy
    assert.equal((await give(c, c.owner, c.vip, lead.id)).status, 200);
    assert.equal((await give(c, c.vip, c.member, low.id)).status, 200);
    // not a role at or above one's own, not oneself, not someone above
    assert.equal((await give(c, c.vip, c.other, lead.id)).status, 403);
    assert.equal((await give(c, c.vip, c.vip, null)).status, 403);
    assert.equal((await give(c, c.vip, c.mod, low.id)).status, 403);
    // nor permissions one does not have
    assert.equal((await newRole(c, c.vip, { name: 'Banujący', permissions: ['ban'] })).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/roles/${lead.id}`, c.vip.token, { color: '#000000' })).status, 403);
    // a timeout and a kick of a plain member; never a moderator
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${c.other.user.id}/mute`, c.vip.token, { minutes: 5 })).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${c.mod.user.id}/mute`, c.vip.token, { minutes: 5 })).status, 403);
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/members/${c.member.user.id}`, c.vip.token)).status, 200);
    // deleting messages it was not given
    const m = await post(c, c.mod, c.general, 'moje');
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/channels/${c.general}/messages/${m.body.message.id}`, c.vip.token)).status, 403);
    // the moderators still moderate those with a custom role
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${c.vip.user.id}/mute`, c.mod.token, { minutes: 5 })).status, 200);
  });

  it('admins make channels with who reads and writes them; the others never see a closed one', async () => {
    const c = await community('Ch');
    assert.equal((await newChannel(c, c.mod, { name: 'handel' })).status, 403);
    for (const bad of ['a', '!!', 'x'.repeat(30)]) assert.equal((await newChannel(c, c.admin, { name: bad })).status, 400, bad);
    assert.equal((await newChannel(c, c.admin, { name: 'pvp', readRole: 'owner' })).status, 400);
    const trade = await newChannel(c, c.admin, { name: '#Handel' });
    assert.equal(trade.status, 200, JSON.stringify(trade.body));
    assert.deepEqual([trade.body.channel.kind, trade.body.channel.name, trade.body.channel.position], ['custom', 'handel', 2]);
    assert.equal((await newChannel(c, c.admin, { name: 'handel' })).status, 409);
    const vip = (await newRole(c, c.owner, { name: 'VIP' })).body.role;
    await give(c, c.owner, c.vip, vip.id);
    const lounge = (await newChannel(c, c.admin, { name: 'vip', readRole: 'moderator', readRoles: [vip.id], postRole: 'admin', writeRoles: [vip.id] })).body.channel;
    // the member's list: no closed channel; the VIP's and the moderator's: it is there (the moderator only reads)
    const channelsOf = async (p: Player) => (await mine(c, p)).channels.map((ch: any) => ch.name || ch.kind);
    assert.deepEqual(await channelsOf(c.member), ['general', 'announcements', 'handel']);
    assert.deepEqual(await channelsOf(c.vip), ['general', 'announcements', 'handel', 'vip']);
    assert.equal((await mine(c, c.mod)).channels.find((ch: any) => ch.id === lounge.id).canPost, false);
    assert.equal((await mine(c, c.vip)).channels.find((ch: any) => ch.id === lounge.id).canPost, true);
    // its messages: not to read, not to write, not pushed to who may not read it, mentions only for readers
    const memberLive = await connect(c.member.token);
    const vipLive = await connect(c.vip.token);
    const sent = await post(c, c.vip, lounge.id, `tajne @${c.member.user.handle}`);
    assert.equal(sent.status, 200);
    assert.deepEqual(sent.body.message.mentions ?? [], []);
    await vipLive.waitFor((e) => e.type === 'community-message' && e.message.id === sent.body.message.id);
    assert.equal((await call('GET', `/v1/communities/${c.id}/channels/${lounge.id}/messages`, c.member.token)).status, 404);
    assert.equal((await post(c, c.member, lounge.id, 'wpuść')).status, 404);
    assert.equal((await post(c, c.mod, lounge.id, 'tylko czytam')).status, 403);
    const open = await post(c, c.member, trade.body.channel.id, 'sprzedam diaxy');
    await memberLive.waitFor((e) => e.type === 'community-message' && e.message.id === open.body.message.id);
    assert.equal(memberLive.events.some((e) => e.type === 'community-message' && e.message.channel === lounge.id), false);
    // renamed, its access changed: the built-in ones keep their names and stay open to all
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/${trade.body.channel.id}`, c.admin.token, { name: 'targ' })).body.channel.name, 'targ');
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/${c.general}`, c.admin.token, { name: 'inny' })).status, 400);
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/${c.general}`, c.admin.token, { readRole: 'moderator' })).status, 400);
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/${c.news}`, c.admin.token, { writeRoles: [vip.id] })).status, 200);
    assert.equal((await post(c, c.vip, c.news, 'news od VIP')).status, 200);
    // ordered (every channel, once), the limit, deleted (the built-in ones not)
    const ids = (await call('GET', `/v1/communities/${c.id}/channels`, c.admin.token)).body.channels.map((ch: any) => ch.id);
    assert.equal((await call('GET', `/v1/communities/${c.id}/channels`, c.mod.token)).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/order`, c.admin.token, { order: [ids[0]] })).status, 400);
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/order`, c.admin.token, { order: [...ids].reverse() })).status, 200);
    assert.deepEqual((await mine(c, c.owner)).channels.map((ch: any) => ch.id), [...ids].reverse());
    assert.equal((await newChannel(c, c.admin, { name: 'piąty' })).status, 200);
    assert.equal((await newChannel(c, c.admin, { name: 'szósty' })).status, 400);
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/channels/${c.general}`, c.owner.token)).status, 400);
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/channels/${lounge.id}`, c.owner.token)).status, 200);
    await vipLive.waitFor((e) => e.type === 'community-channel-delete' && e.channel === lounge.id);
    assert.equal((await call('GET', `/v1/communities/${c.id}/channels/${lounge.id}/messages`, c.vip.token)).status, 404);
    memberLive.ws.close();
    vipLive.ws.close();
  });

  it('a custom role may manage channels', async () => {
    const c = await community('Cm');
    const keeper = (await newRole(c, c.owner, { name: 'Kanały', permissions: ['manageChannels'] })).body.role;
    await give(c, c.owner, c.vip, keeper.id);
    assert.equal((await newChannel(c, c.vip, { name: 'pvp' })).status, 200);
    assert.equal((await newChannel(c, c.member, { name: 'pvp2' })).status, 403);
  });

  it('keeps a moderation log for moderators and up, in pages and by kind', async () => {
    const c = await community('Lg');
    await post(c, c.member, c.general, 'zła wiadomość');
    const bad = (await post(c, c.member, c.general, 'zła 2')).body.message;
    await call('DELETE', `/v1/communities/${c.id}/channels/${c.general}/messages/${bad.id}`, c.mod.token);
    await call('POST', `/v1/communities/${c.id}/members/${c.member.user.id}/mute`, c.mod.token, { minutes: 5 });
    await call('DELETE', `/v1/communities/${c.id}/members/${c.other.user.id}`, c.mod.token);
    await call('POST', `/v1/communities/${c.id}/bans`, c.admin.token, { user: c.vip.user.id, reason: 'spam' });
    await newChannel(c, c.admin, { name: 'handel' });
    await newRole(c, c.admin, { name: 'VIP' });
    assert.equal((await call('GET', `/v1/communities/${c.id}/log`, c.member.token)).status, 403);
    // an older launcher: no page asked, the newest 100
    const all = (await call('GET', `/v1/communities/${c.id}/log`, c.mod.token)).body;
    const actions = all.log.map((e: any) => e.action);
    for (const a of ['message_delete', 'mute', 'kick', 'ban', 'channel_create', 'role_create', 'role', 'join', 'create']) assert.ok(actions.includes(a), a);
    const kick = all.log.find((e: any) => e.action === 'kick');
    assert.deepEqual([kick.byName, kick.targetName], [c.mod.user.name, c.other.user.name]);
    assert.ok(typeof kick.at === 'number');
    assert.equal(all.log.find((e: any) => e.action === 'channel_create').detail, '#handel');
    // pages
    const first = (await call('GET', `/v1/communities/${c.id}/log?limit=3`, c.mod.token)).body;
    assert.equal(first.log.length, 3);
    assert.equal(first.more, true);
    const second = (await call('GET', `/v1/communities/${c.id}/log?limit=3&before=${first.log[2].id}`, c.mod.token)).body;
    assert.ok(second.log.every((e: any) => e.id < first.log[2].id));
    assert.deepEqual([...first.log, ...second.log].map((e: any) => e.id), all.log.slice(0, 6).map((e: any) => e.id));
    // by kind
    const moderation = (await call('GET', `/v1/communities/${c.id}/log?group=moderation`, c.mod.token)).body;
    assert.deepEqual(moderation.log.map((e: any) => e.action), ['ban', 'kick', 'mute', 'message_delete']);
    assert.ok(moderation.groups.includes('settings'));
    assert.equal((await call('GET', `/v1/communities/${c.id}/log?group=nope`, c.mod.token)).status, 400);
    const settings = (await call('GET', `/v1/communities/${c.id}/log?group=settings`, c.mod.token)).body.log.map((e: any) => e.action);
    assert.ok(settings.includes('channel_create') && settings.includes('create'));
  });
});
