import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { may, offensive, tagProblem, type ClanAction, type ClanRole } from '../src/clans.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-clans-'));
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
type Player = { token: string; user: { id: string; handle: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Player;
async function befriend(a: Player, b: Player) {
  await call('POST', '/v1/friends/requests', a.token, { handle: b.user.handle });
  await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
}
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
/** A clan with an owner, an officer and a member (and the invite answered). */
async function clanOf(prefix: string, tag: string) {
  const owner = await login(`${prefix}Own`);
  const officer = await login(`${prefix}Off`);
  const member = await login(`${prefix}Mem`);
  const made = await call('POST', '/v1/clans', owner.token, { tag, name: `Klan ${prefix}` });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.clan.id;
  for (const p of [officer, member]) {
    assert.equal((await call('POST', '/v1/clans/invites', owner.token, { handle: p.user.handle })).status, 200);
    assert.equal((await call('POST', `/v1/clans/${id}/accept`, p.token)).status, 200);
  }
  assert.equal((await call('POST', `/v1/clans/members/${officer.user.id}/role`, owner.token, { role: 'officer' })).status, 200);
  return { id, owner, officer, member };
}

/** Mojang saying who "joined" a server id, for linking a Minecraft account. */
const joined = new Map<string, { id: string; name: string }>();
const fakeFetch: typeof fetch = async (input) => {
  const q = new URL(String(input)).searchParams;
  const p = joined.get(q.get('serverId') ?? '');
  return p && p.name === q.get('username') ? Response.json({ ...p, properties: [] }) : new Response(null, { status: 204 });
};

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, adminHandles: ['ClanAdmin'], fetchImpl: fakeFetch });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('clan tags', () => {
  it('takes 2–5 letters or digits', () => {
    for (const ok of ['AB', 'SKY', 'Pro1', 'XD123', 'skys']) assert.equal(tagProblem(ok), undefined, ok);
    for (const bad of ['A', 'ABCDEF', 'A B', 'ŁÓD', '[AB]', '', 5, null]) assert.equal(tagProblem(bad), 'bad_tag', String(bad));
  });

  it('keeps out offensive tags, also written with digits', () => {
    for (const bad of ['KURWA', 'chuj', 'HUJ', 'Jebac', 'FUCK', 'n1gga', 'Sh1t', 'NAZI', 'SS', 'hh', '88', '1488', 'kkk', 'HWDP', 'JP', 'pizda', 'SEX']) {
      assert.equal(tagProblem(bad), 'offensive_tag', bad);
    }
    assert.ok(offensive('Ekipa Kurwiszonów'));
    assert.ok(offensive('k.u.r.w.a'));
    assert.ok(!offensive('Ekipa ze SkyUp'));
    assert.ok(!offensive('Wojownicy Północy'));
  });
});

describe('clan permissions', () => {
  it('lets the owner do everything, officers invite and kick members only, members nothing', () => {
    const table: [ClanRole | undefined, ClanAction, ClanRole | undefined, boolean][] = [
      ['owner', 'invite', undefined, true], ['officer', 'invite', undefined, true], ['member', 'invite', undefined, false], [undefined, 'invite', undefined, false],
      ['owner', 'kick', 'officer', true], ['owner', 'kick', 'member', true], ['owner', 'kick', 'owner', false],
      ['officer', 'kick', 'member', true], ['officer', 'kick', 'officer', false], ['officer', 'kick', 'owner', false], ['member', 'kick', 'member', false],
      ['owner', 'setRole', 'member', true], ['officer', 'setRole', 'member', false], ['owner', 'setRole', 'owner', false],
      ['owner', 'rename', undefined, true], ['officer', 'rename', undefined, false], ['member', 'rename', undefined, false],
      ['owner', 'delete', undefined, true], ['officer', 'delete', undefined, false], ['member', 'delete', undefined, false],
      ['owner', 'transfer', 'officer', true], ['officer', 'transfer', 'member', false],
    ];
    for (const [role, action, target, want] of table) assert.equal(may(role, action, target), want, `${role} ${action} ${target}`);
  });

  it('creates a clan with a unique tag, one clan per player', async () => {
    const ala = await login('TagAla');
    const bob = await login('TagBob');
    assert.equal((await call('POST', '/v1/clans', ala.token, { tag: 'KURWA', name: 'Klan' })).body.error, 'offensive_tag');
    assert.equal((await call('POST', '/v1/clans', ala.token, { tag: 'OK', name: 'x' })).body.error, 'bad_name');
    assert.equal((await call('POST', '/v1/clans', ala.token, { tag: 'OK', name: 'Klan chujów' })).body.error, 'offensive_name');
    const made = await call('POST', '/v1/clans', ala.token, { tag: 'Wolf', name: 'Wilki' });
    assert.equal(made.body.clan.tag, 'Wolf');
    assert.equal(made.body.clan.role, 'owner');
    assert.equal((await call('POST', '/v1/clans', bob.token, { tag: 'WOLF', name: 'Inne wilki' })).body.error, 'tag_taken');
    assert.equal((await call('POST', '/v1/clans', ala.token, { tag: 'Two', name: 'Drugi klan' })).body.error, 'already_in_clan');
    // the clan's chat is one of the owner's groups, with the tag
    const groups = (await call('GET', '/v1/groups', ala.token)).body.groups;
    assert.equal(groups[0].clan.tag, 'Wolf');
    assert.equal(groups[0].id, made.body.clan.chat);
  });

  it('checks who may invite, kick, change roles, rename and delete', async () => {
    const { id, owner, officer, member } = await clanOf('Perm', 'PERM');
    const outsider = await login('PermOut');
    const other = await login('PermOther');
    // members cannot invite; officers can
    assert.equal((await call('POST', '/v1/clans/invites', member.token, { handle: outsider.user.handle })).body.error, 'not_allowed');
    assert.equal((await call('POST', '/v1/clans/invites', officer.token, { handle: outsider.user.handle })).status, 200);
    // an outsider has no clan to act on
    assert.equal((await call('POST', '/v1/clans/invites', outsider.token, { handle: other.user.handle })).body.error, 'no_clan');
    assert.equal((await call('DELETE', `/v1/clans/members/${member.user.id}`, outsider.token)).body.error, 'no_clan');
    // kicking: member nobody, officer only members, nobody the owner
    assert.equal((await call('DELETE', `/v1/clans/members/${officer.user.id}`, member.token)).body.error, 'not_allowed');
    assert.equal((await call('DELETE', `/v1/clans/members/${owner.user.id}`, officer.token)).body.error, 'not_allowed');
    // roles and renaming: only the owner
    assert.equal((await call('POST', `/v1/clans/members/${member.user.id}/role`, officer.token, { role: 'officer' })).body.error, 'not_allowed');
    assert.equal((await call('POST', '/v1/clans/rename', officer.token, { name: 'Przejęty' })).body.error, 'not_allowed');
    assert.equal((await call('POST', '/v1/clans/rename', member.token, { tag: 'MINE' })).body.error, 'not_allowed');
    assert.equal((await call('DELETE', '/v1/clans/mine', officer.token)).body.error, 'not_allowed');
    assert.equal((await call('DELETE', '/v1/clans/mine', member.token)).body.error, 'not_allowed');
    assert.equal((await call('POST', '/v1/clans/owner', officer.token, { user: officer.user.id })).body.error, 'not_allowed');
    // the owner renames (checked like a new tag) …
    assert.equal((await call('POST', '/v1/clans/rename', owner.token, { tag: 'hwdp' })).body.error, 'offensive_tag');
    const renamed = await call('POST', '/v1/clans/rename', owner.token, { tag: 'PRM', name: 'Nowa nazwa' });
    assert.equal(renamed.body.clan.tag, 'PRM');
    assert.equal(renamed.body.clan.name, 'Nowa nazwa');
    // … and an officer kicks a member
    const memberLive = await connect(member.token);
    assert.equal((await call('DELETE', `/v1/clans/members/${member.user.id}`, officer.token)).status, 200);
    await memberLive.waitFor((e) => e.type === 'clan' && e.kicked?.tag === 'PRM');
    assert.equal((await call('GET', '/v1/clans/mine', member.token)).body.clan, null);
    memberLive.ws.close();
    // the owner cannot walk away from a clan with people in it, but can hand it over
    assert.equal((await call('POST', '/v1/clans/leave', owner.token)).body.error, 'owner_must_transfer');
    const handed = await call('POST', '/v1/clans/owner', owner.token, { user: officer.user.id });
    assert.equal(handed.body.clan.role, 'officer');
    assert.equal((await call('POST', '/v1/clans/leave', owner.token)).status, 200);
    // the new owner deletes it
    assert.equal((await call('DELETE', '/v1/clans/mine', officer.token)).status, 200);
    assert.equal((await call('GET', '/v1/clans/mine', officer.token)).body.clan, null);
    assert.equal((await call('POST', `/v1/clans/${id}/accept`, outsider.token)).status, 404);
  });

  it('joins only by invite, keeps the clan chat in step and shows who is online', async () => {
    const { id, owner, member } = await clanOf('Chat', 'CHAT');
    const stranger = await login('ChatStr');
    // no invite, no way in
    assert.equal((await call('POST', `/v1/clans/${id}/accept`, stranger.token)).status, 404);
    const ownerLive = await connect(owner.token);
    const mine = (await call('GET', '/v1/clans/mine', member.token)).body.clan;
    assert.equal(mine.members.length, 3);
    assert.equal(mine.members[0].role, 'owner');
    assert.equal(mine.members.find((m: any) => m.id === owner.user.id).online, true);
    assert.equal(mine.members.find((m: any) => m.id === member.user.id).online, false);
    // members do not see pending invites; officers and the owner do
    assert.equal(mine.invites, undefined);
    // the clan chat: everyone in it, and a message reaches the owner
    const chat = mine.chat;
    const sent = await call('POST', `/v1/groups/${chat}/messages`, member.token, { text: 'Hej klanie' });
    assert.equal(sent.status, 200);
    await ownerLive.waitFor((e) => e.type === 'group-message' && e.message.text === 'Hej klanie');
    // its members are changed through the clan, not as a group
    assert.equal((await call('POST', `/v1/groups/${chat}/leave`, member.token)).body.error, 'clan_chat');
    assert.equal((await call('POST', '/v1/clans/leave', member.token)).status, 200);
    assert.equal((await call('GET', `/v1/groups/${chat}/messages`, member.token)).status, 404);
    // declining an invite
    await call('POST', '/v1/clans/invites', owner.token, { handle: stranger.user.handle });
    assert.equal((await call('GET', '/v1/clans/mine', stranger.token)).body.invites[0].clan.tag, 'CHAT');
    assert.equal((await call('POST', `/v1/clans/${id}/decline`, stranger.token)).status, 200);
    assert.equal((await call('GET', '/v1/clans/mine', stranger.token)).body.invites.length, 0);
    ownerLive.ws.close();
  });

  it('shows the tag to friends and in game', async () => {
    const ala = await login('ShowAla');
    const bob = await login('ShowBob');
    await befriend(ala, bob);
    await call('POST', '/v1/clans', ala.token, { tag: 'SHOW', name: 'Pokazowy' });
    const friend = (await call('GET', '/v1/friends', bob.token)).body.friends.find((f: any) => f.id === ala.user.id);
    assert.equal(friend.clan, 'SHOW');
    // in game: the Minecraft player the launcher plays as gets the tag next to the name
    const mc = 'abcdefab-cdef-abcd-efab-cdefabcdef12';
    const { serverId } = (await call('POST', '/v1/auth/minecraft/start')).body;
    joined.set(serverId, { id: mc.replace(/-/g, ''), name: 'ShowAlaMC' });
    assert.equal((await call('POST', '/v1/auth/minecraft/finish', ala.token, { serverId, name: 'ShowAlaMC' })).body.linked, true);
    await call('POST', '/v1/mc/link', ala.token, { uuid: mc });
    assert.deepEqual((await call('POST', '/v1/mc/lookup', undefined, { uuids: [mc] })).body.clans, { [mc]: 'SHOW' });
    // leaving the clan takes it off
    await call('POST', '/v1/clans/leave', ala.token);
    assert.equal((await call('POST', '/v1/mc/lookup', undefined, { uuids: [mc] })).body.clans, undefined);
  });

  it('lets an admin remove a clan', async () => {
    const admin = await login('ClanAdmin');
    const ala = await login('ModAla');
    const made = (await call('POST', '/v1/clans', ala.token, { tag: 'B4D', name: 'Do usunięcia' })).body.clan;
    assert.equal((await call('GET', '/v1/admin/clans', ala.token)).status, 403);
    assert.ok((await call('GET', '/v1/admin/clans', admin.token)).body.clans.some((c: any) => c.id === made.id));
    assert.equal((await call('DELETE', `/v1/admin/clans/${made.id}`, admin.token)).status, 200);
    assert.equal((await call('GET', '/v1/clans/mine', ala.token)).body.clan, null);
    assert.equal((await call('GET', '/v1/groups', ala.token)).body.groups.length, 0);
  });
});
