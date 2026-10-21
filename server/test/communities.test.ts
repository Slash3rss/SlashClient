import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { encodePng } from '../src/png.ts';
import { COMMUNITY_LIMITS, cleanDescription, communityTagProblem, mentionedHandles, may, permissions, RANK, ROLES, type CommunityAction, type CommunityRole } from '../src/communityStore.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-communities-'));
let base = '';
let app: ReturnType<typeof createApp>;
/** Small enough to fill in a test. */
const MEMBERS = 5;

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

/** A community with an owner, an admin, a moderator and a member. */
async function communityOf(prefix: string, settings: Record<string, unknown> = {}) {
  const owner = await login(`${prefix}Own`);
  const admin = await login(`${prefix}Adm`);
  const mod = await login(`${prefix}Mod`);
  const member = await login(`${prefix}Mem`);
  const made = await call('POST', '/v1/communities', owner.token, { name: `Społeczność ${prefix}`, ...settings });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.community.id as string;
  for (const p of [admin, mod, member]) {
    if (settings.visibility === 'private' || settings.joinMode === 'request') {
      assert.equal((await call('POST', `/v1/communities/${id}/invites`, owner.token, { handle: p.user.handle })).status, 200);
      assert.equal((await call('POST', `/v1/communities/${id}/invites/accept`, p.token)).status, 200);
    } else assert.equal((await call('POST', `/v1/communities/${id}/join`, p.token)).status, 200);
  }
  assert.equal((await call('POST', `/v1/communities/${id}/members/${admin.user.id}/role`, owner.token, { role: 'admin' })).status, 200);
  assert.equal((await call('POST', `/v1/communities/${id}/members/${mod.user.id}/role`, owner.token, { role: 'moderator' })).status, 200);
  const general = made.body.community.channels.find((c: any) => c.kind === 'general').id as string;
  const news = made.body.community.channels.find((c: any) => c.kind === 'announcements').id as string;
  return { id, owner, admin, mod, member, general, news };
}
const post = (c: { id: string }, ch: string, p: Player, text: string) => call('POST', `/v1/communities/${c.id}/channels/${ch}/messages`, p.token, { text });

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 10_000, oauth: {}, adminHandles: ['ComAdmin'],
    communityLimits: { members: MEMBERS }, chatBurst: { messages: 5, seconds: 10 }, profileViewsPerMinute: 10_000,
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('community rules', () => {
  it('decides every action × role × target', () => {
    const actions: CommunityAction[] = ['invite', 'requests', 'reports', 'pin', 'kick', 'mute', 'deleteMessage', 'ban', 'edit', 'announce', 'log', 'slowMode', 'setRole', 'transfer', 'delete'];
    for (const role of ROLES) {
      for (const action of actions) {
        for (const target of [undefined, ...ROLES]) {
          for (const next of action === 'setRole' ? ROLES : [undefined]) {
            const got = may(role, action, target, next);
            const r = RANK[role];
            const below = target !== undefined && RANK[target] < r;
            const want = {
              invite: r >= 1, requests: r >= 1, reports: r >= 1, pin: r >= 1, slowMode: r >= 2,
              kick: r >= 1 && below, mute: r >= 1 && below, deleteMessage: r >= 1 && below,
              ban: r >= 2 && below, edit: r >= 2, announce: r >= 2, log: r >= 1,
              setRole: r >= 2 && below && next !== undefined && next !== 'owner' && RANK[next!] < r,
              transfer: role === 'owner' && target !== undefined && target !== 'owner',
              delete: role === 'owner',
            }[action];
            assert.equal(got, want, `${role} ${action} ${target} ${next}`);
          }
        }
      }
      assert.equal(may(undefined, 'invite'), false);
    }
    // the table the clients get matches
    assert.deepEqual(permissions('moderator'), { invite: true, requests: true, reports: true, pin: true, slowMode: false, kick: true,
 mute: true, deleteMessage: true, ban: false, edit: false, announce: false, log: true, setRole: false, transfer: false, delete: false });
    assert.equal(permissions('member').invite, false);
    assert.equal(permissions('owner').delete, true);
  });

  it('checks tags, descriptions and mentions', () => {
    assert.equal(communityTagProblem(''), undefined);
    for (const ok of ['AB', 'MINE6X', 'Sky1']) assert.equal(communityTagProblem(ok), undefined, ok);
    for (const bad of ['A', 'ABCDEFG', '[AB]', 'a b', 5]) assert.equal(communityTagProblem(bad), 'bad_tag', String(bad));
    assert.equal(communityTagProblem('kurwa'), 'offensive_tag');
    assert.equal(cleanDescription('a\r\n\n\n\nb  \n'), 'a\n\nb');
    assert.equal(cleanDescription('x'.repeat(COMMUNITY_LIMITS.description + 1)), undefined);
    assert.equal(cleanDescription('bell\u0007'), undefined);
    assert.deepEqual(mentionedHandles('hej @Ala i @bob. oraz mail@x.pl @ala'), ['ala', 'bob']);
  });
});

describe('communities over HTTP', () => {
  it('founds one with two channels, and checks names, tags and limits', async () => {
    const p = await login('ComFounder');
    assert.equal((await call('POST', '/v1/communities', p.token, { name: 'ab' })).body.error, 'bad_community_name');
    assert.equal((await call('POST', '/v1/communities', p.token, { name: 'Kurwiszony' })).body.error, 'offensive_name');
    assert.equal((await call('POST', '/v1/communities', p.token, { name: 'Dobra', tag: 'A B' })).body.error, 'bad_tag');
    assert.equal((await call('POST', '/v1/communities', p.token, { name: 'Dobra', visibility: 'secret' })).body.error, 'bad_request');
    const made = await call('POST', '/v1/communities', p.token, { name: 'Budowniczowie', tag: 'BUD', description: 'Budujemy razem.' });
    assert.equal(made.status, 200);
    const c = made.body.community;
    assert.equal(c.role, 'owner');
    assert.equal(c.members, 1);
    assert.equal(c.encrypted, false);
    assert.deepEqual(c.channels.map((x: any) => [x.kind, x.canPost]), [['general', true], ['announcements', true]]);
    assert.equal(c.slug, 'BUD');
    // the tag is unique whatever the case
    const other = await login('ComFounder2');
    assert.equal((await call('POST', '/v1/communities', other.token, { name: 'Inni', tag: 'bud' })).body.error, 'tag_taken');
    // a few may be owned
    for (let i = 1; i < COMMUNITY_LIMITS.owned; i++) assert.equal((await call('POST', '/v1/communities', p.token, { name: `Kolejna ${i}` })).status, 200);
    assert.equal((await call('POST', '/v1/communities', p.token, { name: 'Za dużo' })).body.error, 'too_many_owned');
    // the founder's achievement
    const ach = (await call('GET', '/v1/achievements', p.token)).body.achievements;
    assert.ok(ach.find((a: any) => a.id === 'community_found').unlockedAt);
  });

  it('joins an open one at once, asks to join one by request, and keeps private ones out of sight', async () => {
    const owner = await login('JoinOwner');
    const open = (await call('POST', '/v1/communities', owner.token, { name: 'Otwarta', joinMode: 'open' })).body.community;
    const asked = (await call('POST', '/v1/communities', owner.token, { name: 'Na prośbę', joinMode: 'request' })).body.community;
    const hidden = (await call('POST', '/v1/communities', owner.token, { name: 'Ukryta', visibility: 'private' })).body.community;
    const p = await login('Joiner');
    // the directory: public ones with their state for me, never private ones
    const dirList = (await call('GET', '/v1/communities/discover?q=', p.token)).body.communities;
    assert.ok(dirList.some((c: any) => c.id === open.id && c.state === 'open'));
    assert.ok(dirList.some((c: any) => c.id === asked.id && c.state === 'request'));
    assert.ok(!dirList.some((c: any) => c.id === hidden.id));
    assert.equal((await call('GET', '/v1/communities/discover?q=Ukryta', p.token)).body.total, 0);
    assert.equal((await call('GET', `/v1/communities/${hidden.id}`, p.token)).status, 404);
    assert.equal((await call('POST', `/v1/communities/${hidden.id}/join`, p.token)).status, 404);
    // open: in
    const joined = await call('POST', `/v1/communities/${open.id}/join`, p.token);
    assert.equal(joined.body.status, 'joined');
    assert.equal((await call('POST', `/v1/communities/${open.id}/join`, p.token)).body.error, 'already_member');
    assert.ok((await call('GET', '/v1/achievements', p.token)).body.achievements.find((a: any) => a.id === 'community_join').unlockedAt);
    // by request: waits for a moderator
    const ws = await connect(owner.token);
    assert.equal((await call('POST', `/v1/communities/${asked.id}/join`, p.token)).body.status, 'requested');
    assert.equal((await call('POST', `/v1/communities/${asked.id}/join`, p.token)).body.error, 'already_requested');
    await ws.waitFor((e) => e.type === 'community' && e.request);
    assert.equal((await call('GET', '/v1/communities/mine', p.token)).body.requests.length, 1);
    const reqs = (await call('GET', `/v1/communities/${asked.id}/requests`, owner.token)).body.requests;
    assert.deepEqual(reqs.map((r: any) => r.id), [p.user.id]);
    assert.equal((await call('GET', `/v1/communities/${asked.id}/requests`, p.token)).status, 404);
    assert.equal((await call('POST', `/v1/communities/${asked.id}/requests/${p.user.id}/accept`, owner.token)).status, 200);
    assert.equal((await call('GET', `/v1/communities/${asked.id}`, p.token)).body.community.role, 'member');
    ws.ws.close();
    // declined, and a request taken back
    const q = await login('Joiner2');
    await call('POST', `/v1/communities/${asked.id}/join`, q.token);
    assert.equal((await call('POST', `/v1/communities/${asked.id}/requests/${q.user.id}/decline`, owner.token)).status, 200);
    assert.equal((await call('GET', `/v1/communities/${asked.id}`, q.token)).body.community.state, 'request');
    await call('POST', `/v1/communities/${asked.id}/join`, q.token);
    assert.equal((await call('DELETE', `/v1/communities/${asked.id}/requests/mine`, q.token)).status, 200);
    // private: an invite opens it
    assert.equal((await call('POST', `/v1/communities/${hidden.id}/invites`, owner.token, { handle: q.user.handle })).status, 200);
    assert.equal((await call('GET', `/v1/communities/${hidden.id}`, q.token)).body.community.state, 'invited');
    assert.equal((await call('GET', '/v1/communities/mine', q.token)).body.invites.length, 1);
    assert.equal((await call('POST', `/v1/communities/${hidden.id}/join`, q.token)).body.status, 'joined');
  });

  it('keeps the members and communities-per-player limits', async () => {
    const owner = await login('FullOwner');
    const c = (await call('POST', '/v1/communities', owner.token, { name: 'Pełna' })).body.community;
    for (let i = 1; i < MEMBERS; i++) assert.equal((await call('POST', `/v1/communities/${c.id}/join`, (await login(`Full${i}`)).token)).status, 200);
    const late = await login('FullLate');
    assert.equal((await call('POST', `/v1/communities/${c.id}/join`, late.token)).body.error, 'community_full');
    assert.equal((await call('GET', `/v1/communities/${c.id}`, late.token)).body.community.state, 'full');
    // one player in as many as allowed, then no more
    const busy = await login('Busy');
    const owners = await Promise.all(Array.from({ length: COMMUNITY_LIMITS.perPlayer + 1 }, (_, i) => login(`BusyOwn${i}`)));
    const ids: string[] = [];
    for (const o of owners) ids.push((await call('POST', '/v1/communities', o.token, { name: `Dla Busy ${o.user.handle}` })).body.community.id);
    for (const id of ids.slice(0, COMMUNITY_LIMITS.perPlayer)) assert.equal((await call('POST', `/v1/communities/${id}/join`, busy.token)).status, 200);
    assert.equal((await call('POST', `/v1/communities/${ids.at(-1)}/join`, busy.token)).body.error, 'too_many_communities');
    assert.equal((await call('GET', '/v1/communities/mine', busy.token)).body.communities.length, COMMUNITY_LIMITS.perPlayer);
  });

  it('lets each role do what the table says, and no more', async () => {
    const c = await communityOf('Perm');
    const { owner, admin, mod, member } = c;
    // members: by role, then who came first; anyone in it may look, others not
    const list = (await call('GET', `/v1/communities/${c.id}/members?limit=2`, member.token)).body;
    assert.equal(list.total, 4);
    assert.deepEqual(list.members.map((m: any) => m.role), ['owner', 'admin']);
    assert.deepEqual((await call('GET', `/v1/communities/${c.id}/members?offset=2`, member.token)).body.members.map((m: any) => m.role), ['moderator', 'member']);
    assert.equal((await call('GET', `/v1/communities/${c.id}/members?q=permmo`, member.token)).body.members[0].id, mod.user.id);
    const stranger = await login('PermStranger');
    assert.equal((await call('GET', `/v1/communities/${c.id}/members`, stranger.token)).status, 404);
    // a member: no invites, no kicking, no settings
    assert.equal((await call('POST', `/v1/communities/${c.id}/invites`, member.token, { handle: stranger.user.handle })).status, 403);
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/members/${mod.user.id}`, member.token)).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/settings`, member.token, { name: 'Nowa nazwa' })).status, 403);
    // a moderator: invites and mutes members, but not admins, and no bans or roles
    assert.equal((await call('POST', `/v1/communities/${c.id}/invites`, mod.token, { handle: stranger.user.handle })).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${member.user.id}/mute`, mod.token, { minutes: 10 })).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${admin.user.id}/mute`, mod.token, { minutes: 10 })).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/bans`, mod.token, { user: member.user.id })).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${member.user.id}/role`, mod.token, { role: 'moderator' })).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/settings`, mod.token, { name: 'Nowa nazwa' })).status, 403);
    // muted: reads, cannot write
    assert.equal((await post(c, c.general, member, 'hej')).body.error, 'community_muted');
    assert.ok((await call('GET', `/v1/communities/${c.id}/channels/${c.general}/messages`, member.token)).body.mutedUntil > Date.now());
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${member.user.id}/mute`, mod.token, { minutes: 0 })).status, 200);
    assert.equal((await post(c, c.general, member, 'hej')).status, 200);
    // an admin: roles below their own, settings, the log; not another admin's role, not the owner
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${member.user.id}/role`, admin.token, { role: 'moderator' })).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${member.user.id}/role`, admin.token, { role: 'admin' })).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${member.user.id}/role`, admin.token, { role: 'member' })).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${owner.user.id}/role`, admin.token, { role: 'member' })).status, 403);
    assert.equal((await call('POST', `/v1/communities/${c.id}/settings`, admin.token, { description: 'Opis', joinMode: 'request' })).body.community.joinMode, 'request');
    assert.ok((await call('GET', `/v1/communities/${c.id}/log`, admin.token)).body.log.some((e: any) => e.action === 'edit'));
    // the moderation log: moderators read it too (0.9.30)
    assert.equal((await call('GET', `/v1/communities/${c.id}/log`, mod.token)).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/owner`, admin.token, { user: member.user.id })).status, 403);
    assert.equal((await call('DELETE', `/v1/communities/${c.id}`, admin.token)).status, 403);
    // the owner cannot leave with others in it; hands it over and stays an admin
    assert.equal((await call('POST', `/v1/communities/${c.id}/leave`, owner.token)).body.error, 'owner_must_transfer');
    assert.equal((await call('POST', `/v1/communities/${c.id}/owner`, owner.token, { user: admin.user.id })).status, 200);
    assert.equal((await call('GET', `/v1/communities/${c.id}`, owner.token)).body.community.role, 'admin');
    assert.equal((await call('GET', `/v1/communities/${c.id}`, admin.token)).body.community.role, 'owner');
    // kicked by a moderator: out, may come back (no ban)
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/members/${member.user.id}`, mod.token)).status, 200);
    assert.equal((await call('GET', `/v1/communities/${c.id}`, member.token)).body.community.state, 'request');
  });

  it('bans persist: no joining, no requests, no invites until lifted', async () => {
    const c = await communityOf('Ban');
    const { admin, member, mod } = c;
    assert.equal((await call('POST', `/v1/communities/${c.id}/bans`, admin.token, { user: member.user.id, reason: 'spam' })).status, 200);
    assert.equal((await call('GET', `/v1/communities/${c.id}/members?q=banmem`, admin.token)).body.total, 0);
    assert.equal((await call('POST', `/v1/communities/${c.id}/join`, member.token)).body.error, 'community_banned');
    assert.equal((await call('GET', `/v1/communities/${c.id}`, member.token)).body.community.state, 'banned');
    assert.equal((await call('POST', `/v1/communities/${c.id}/invites`, mod.token, { handle: member.user.handle })).body.error, 'banned_user');
    // a stranger can be banned before they ever come
    const troll = await login('BanTroll');
    assert.equal((await call('POST', `/v1/communities/${c.id}/bans`, admin.token, { handle: troll.user.handle })).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/join`, troll.token)).body.error, 'community_banned');
    const bans = (await call('GET', `/v1/communities/${c.id}/bans`, admin.token)).body.bans;
    assert.deepEqual(bans.map((b: any) => b.id).sort(), [member.user.id, troll.user.id].sort());
    assert.equal(bans.find((b: any) => b.id === member.user.id).reason, 'spam');
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/bans/${member.user.id}`, mod.token)).status, 403);
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/bans/${member.user.id}`, admin.token)).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/join`, member.token)).status, 200);
    // an admin cannot ban the owner or another admin
    assert.equal((await call('POST', `/v1/communities/${c.id}/bans`, admin.token, { user: c.owner.user.id })).status, 403);
  });

  it('chats: history for everyone in it, announcements by admins, edits, deletions and mentions, pushed to those connected', async () => {
    const c = await communityOf('Chat');
    const { owner, admin, mod, member } = c;
    const outsider = await login('ChatOut');
    const wsMember = await connect(member.token);
    const wsOut = await connect(outsider.token);
    const sent = await post(c, c.general, owner, `Witajcie @${member.user.handle}!`);
    assert.equal(sent.status, 200);
    assert.deepEqual(sent.body.message.mentions, [member.user.id]);
    assert.equal(sent.body.message.author.handle, owner.user.handle);
    const got = await wsMember.waitFor((e) => e.type === 'community-message');
    assert.equal(got.message.text, `Witajcie @${member.user.handle}!`);
    assert.ok(!wsOut.events.some((e) => e.type === 'community-message'));
    // unread with the mention, then read
    let mine = (await call('GET', '/v1/communities/mine', member.token)).body.communities.find((x: any) => x.id === c.id);
    assert.equal(mine.unread, 1);
    assert.equal(mine.mentions, 1);
    assert.equal(mine.notify, 'mentions');
    await call('POST', `/v1/communities/${c.id}/channels/${c.general}/read`, member.token);
    mine = (await call('GET', '/v1/communities/mine', member.token)).body.communities.find((x: any) => x.id === c.id);
    assert.equal(mine.unread, 0);
    // announcements: only admins and the owner write
    assert.equal((await post(c, c.news, member, 'ogłaszam')).body.error, 'read_only_channel');
    assert.equal((await post(c, c.news, mod, 'ogłaszam')).body.error, 'read_only_channel');
    assert.equal((await post(c, c.news, admin, 'Turniej w sobotę')).status, 200);
    // pages of history, and a newcomer sees what came before (not end-to-end encrypted: a forum)
    for (let i = 0; i < 3; i++) await post(c, c.general, member, `wiadomość ${i}`);
    const page1 = (await call('GET', `/v1/communities/${c.id}/channels/${c.general}/messages?limit=2`, mod.token)).body;
    assert.deepEqual(page1.messages.map((m: any) => m.text), ['wiadomość 1', 'wiadomość 2']);
    assert.equal(page1.encrypted, false);
    assert.equal(page1.moderator, true);
    const page2 = (await call('GET', `/v1/communities/${c.id}/channels/${c.general}/messages?limit=10&before=${page1.messages[0].id}`, mod.token)).body;
    assert.equal(page2.messages.length, 2);
    const newcomer = await login('ChatNew');
    await call('POST', `/v1/communities/${c.id}/join`, newcomer.token);
    assert.equal((await call('GET', `/v1/communities/${c.id}/channels/${c.general}/messages`, newcomer.token)).body.messages.length, 4);
    assert.equal((await call('GET', '/v1/communities/mine', newcomer.token)).body.communities.find((x: any) => x.id === c.id).unread, 0);
    // editing one's own text; not another's
    const own = page1.messages[1];
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/${c.general}/messages/${own.id}/edit`, mod.token, { text: 'nie moje' })).body.error, 'not_author');
    const edited = await call('POST', `/v1/communities/${c.id}/channels/${c.general}/messages/${own.id}/edit`, member.token, { text: 'poprawione' });
    assert.ok(edited.body.message.editedAt);
    await wsMember.waitFor((e) => e.type === 'community-message-edit' && e.message.id === own.id);
    // deleting: the author; a moderator for members; not the admin's message
    const adminMsg = (await post(c, c.general, admin, 'od admina')).body.message;
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/channels/${c.general}/messages/${adminMsg.id}`, mod.token)).status, 403);
    const gone = await call('DELETE', `/v1/communities/${c.id}/channels/${c.general}/messages/${own.id}`, mod.token);
    assert.equal(gone.body.message.deleted, true);
    assert.equal(gone.body.message.moderated, true);
    assert.equal(gone.body.message.text, '');
    await wsMember.waitFor((e) => e.type === 'community-message-delete' && e.message.id === own.id);
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/${c.general}/messages/${own.id}/edit`, member.token, { text: 'x' })).body.error, 'not_editable');
    assert.ok((await call('GET', `/v1/communities/${c.id}/log`, admin.token)).body.log.some((e: any) => e.action === 'message_delete'));
    // too long, empty, and someone not in it
    assert.equal((await post(c, c.general, member, 'x'.repeat(COMMUNITY_LIMITS.message + 1))).body.error, 'too_long');
    assert.equal((await post(c, c.general, member, '   ')).body.error, 'empty');
    assert.equal((await post(c, c.general, outsider, 'hej')).status, 404);
    wsMember.ws.close();
    wsOut.ws.close();
  });

  it('slows down a burst in one channel (chatLimits.ts)', async () => {
    const c = await communityOf('Burst');
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await post(c, c.general, c.member, `${i}`)).status;
    assert.equal(last, 429);
    assert.equal((await post(c, c.general, c.member, 'jeszcze')).body.error, 'slow_down');
  });

  it('reports go to the moderators and the admin panel, who dismiss or delete', async () => {
    const c = await communityOf('Rep');
    const { mod, member, admin } = c;
    const bad = (await post(c, c.general, admin, 'brzydka wiadomość')).body.message;
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/${c.general}/messages/${bad.id}/report`, admin.token, {})).body.error, 'self');
    const ws = await connect(mod.token);
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/${c.general}/messages/${bad.id}/report`, member.token, { reason: 'obraża' })).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/channels/${c.general}/messages/${bad.id}/report`, member.token, { reason: 'znowu' })).body.error, 'already_reported');
    await ws.waitFor((e) => e.type === 'community' && e.report);
    ws.ws.close();
    assert.equal((await call('GET', `/v1/communities/${c.id}/reports`, member.token)).status, 403);
    const reports = (await call('GET', `/v1/communities/${c.id}/reports`, mod.token)).body.reports;
    assert.equal(reports.length, 1);
    assert.equal(reports[0].message.text, 'brzydka wiadomość');
    assert.equal(reports[0].reason, 'obraża');
    assert.equal((await call('GET', '/v1/communities/mine', mod.token)).body.communities.find((x: any) => x.id === c.id).reports, 1);
    // a moderator cannot delete an admin's message, even reported
    assert.equal((await call('POST', `/v1/communities/${c.id}/reports/${reports[0].id}/resolve`, mod.token, { action: 'delete' })).status, 403);
    // the site's admin panel sees every community's reports
    const siteAdmin = await login('ComAdmin');
    assert.equal((await call('GET', '/v1/admin/communities/reports', member.token)).status, 403);
    const all = (await call('GET', '/v1/admin/communities/reports', siteAdmin.token)).body.reports;
    const mineReport = all.find((r: any) => r.community === c.id);
    assert.ok(mineReport);
    assert.equal(mineReport.communityName, 'Społeczność Rep');
    assert.equal((await call('POST', `/v1/admin/communities/reports/${mineReport.id}/resolve`, siteAdmin.token, { action: 'delete' })).status, 200);
    const msgs = (await call('GET', `/v1/communities/${c.id}/channels/${c.general}/messages`, member.token)).body.messages;
    assert.equal(msgs.find((m: any) => m.id === bad.id).deleted, true);
    assert.equal((await call('GET', `/v1/communities/${c.id}/reports`, mod.token)).body.reports.length, 0);
    // a dismissed one
    const ok = (await post(c, c.general, member, 'zwykła')).body.message;
    await call('POST', `/v1/communities/${c.id}/channels/${c.general}/messages/${ok.id}/report`, mod.token, { reason: 'test' });
    const rid = (await call('GET', `/v1/communities/${c.id}/reports`, mod.token)).body.reports[0].id;
    assert.equal((await call('POST', `/v1/communities/${c.id}/reports/${rid}/resolve`, mod.token, { action: 'dismiss' })).body.reports.length, 0);
  });

  it('shows on profiles only public communities left on, and only with the element on', async () => {
    const owner = await login('ProfComOwn');
    const pub = (await call('POST', '/v1/communities', owner.token, { name: 'Publiczna profilowa', tag: 'PUBPRO' })).body.community;
    const priv = (await call('POST', '/v1/communities', owner.token, { name: 'Tajna profilowa', visibility: 'private' })).body.community;
    const p = await login('ProfComMem');
    await call('POST', `/v1/communities/${pub.id}/join`, p.token);
    await call('POST', `/v1/communities/${priv.id}/invites`, owner.token, { handle: p.user.handle });
    await call('POST', `/v1/communities/${priv.id}/invites/accept`, p.token);
    const shown = async () => (await call('GET', `/v1/profiles/${p.user.handle}`)).body.profile.communities;
    assert.deepEqual((await shown()).map((c: any) => [c.name, c.slug]), [['Publiczna profilowa', 'PUBPRO']]);
    // one left off
    await call('POST', `/v1/communities/${pub.id}/profile`, p.token, { show: false });
    assert.deepEqual(await shown(), []);
    await call('POST', `/v1/communities/${pub.id}/profile`, p.token, { show: true });
    // the whole element off
    await call('POST', '/v1/me/profile-privacy', p.token, { elements: { communities: false } });
    assert.equal(await shown(), undefined);
    await call('POST', '/v1/me/profile-privacy', p.token, { elements: { communities: true } });
    // a community turned private leaves every profile
    await call('POST', `/v1/communities/${pub.id}/settings`, owner.token, { visibility: 'private' });
    assert.deepEqual(await shown(), []);
  });

  it('has a public page for public communities only', async () => {
    const owner = await login('PageOwn');
    await call('POST', '/v1/communities', owner.token, { name: 'Strona', tag: 'STRONA', description: 'Opis strony' });
    const priv = (await call('POST', '/v1/communities', owner.token, { name: 'Bez strony', tag: 'NOPAGE', visibility: 'private' })).body.community;
    const page = await call('GET', '/v1/public/communities/strona');
    assert.equal(page.status, 200);
    assert.equal(page.body.community.description, 'Opis strony');
    assert.equal(page.body.community.owner.handle, owner.user.handle);
    assert.equal(page.body.community.owner.id, undefined);
    assert.equal((await call('GET', '/v1/public/communities/NOPAGE')).status, 404);
    assert.equal((await call('GET', `/v1/public/communities/${priv.id}`)).status, 404);
  });

  it('gives the admin panel the list, one in detail, and moderation that goes to both logs', async () => {
    const c = await communityOf('AdmCom', { tag: 'ADMC', description: 'Brzydki opis' });
    const siteAdmin = await login('ComAdmin');
    assert.equal((await call('GET', '/v1/admin/communities', c.owner.token)).status, 403);
    const list = (await call('GET', '/v1/admin/communities?q=admc', siteAdmin.token)).body.communities;
    assert.equal(list.length, 1);
    assert.equal(list[0].members, 4);
    const detail = (await call('GET', `/v1/admin/communities/${c.id}`, siteAdmin.token)).body;
    assert.equal(detail.total, 4);
    assert.ok(detail.log.some((e: any) => e.action === 'create'));
    assert.equal((await call('DELETE', `/v1/admin/communities/${c.id}/description`, siteAdmin.token)).status, 200);
    assert.equal((await call('GET', `/v1/communities/${c.id}`, c.member.token)).body.community.description, '');
    assert.equal((await call('POST', `/v1/admin/communities/${c.id}/owner`, siteAdmin.token, { handle: 'nobodyhere' })).status, 404);
    assert.equal((await call('POST', `/v1/admin/communities/${c.id}/owner`, siteAdmin.token, { handle: c.member.user.handle })).status, 200);
    assert.equal((await call('GET', `/v1/communities/${c.id}`, c.member.token)).body.community.role, 'owner');
    assert.equal((await call('GET', `/v1/communities/${c.id}`, c.owner.token)).body.community.role, 'admin');
    const ws = await connect(c.mod.token);
    assert.equal((await call('DELETE', `/v1/admin/communities/${c.id}`, siteAdmin.token)).status, 200);
    await ws.waitFor((e) => e.type === 'communities' && e.id === c.id && e.removed);
    ws.ws.close();
    assert.equal((await call('GET', `/v1/communities/${c.id}`, c.mod.token)).status, 404);
    const log = (await call('GET', '/v1/admin/log', siteAdmin.token)).body;
    const entries = (log.entries ?? log.log ?? log) as any[];
    assert.ok(entries.some((e) => e.action === 'community.delete' && e.target === c.id));
    assert.ok(entries.some((e) => e.action === 'community.transfer'));
    assert.ok(app.communities.store.logOf(c.id).some((e) => e.action === 'admin_delete'));
  });

  it('counts the size achievements when a community gets big enough', async () => {
    // a custom achievement made in the admin panel can ask for a small size too
    const siteAdmin = await login('ComAdmin');
    const id = 'community_three';
    const made = await call('POST', '/v1/admin/achievements', siteAdmin.token, { id, name: 'Trójka', nameEn: 'Three', description: 'Społeczność 3 osób', descriptionEn: 'Community of 3', metric: 'community_size', goal: 3, sparks: 1, category: 'community' });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const owner = await login('SizeOwn');
    const c = (await call('POST', '/v1/communities', owner.token, { name: 'Rośnie' })).body.community;
    await call('POST', `/v1/communities/${c.id}/join`, (await login('Size1')).token);
    await call('POST', `/v1/communities/${c.id}/join`, (await login('Size2')).token);
    // everyone is looked at right after the answer
    await new Promise((r) => setTimeout(r, 50));
    const have = (await call('GET', '/v1/achievements', owner.token)).body.achievements;
    assert.ok(have.find((a: any) => a.id === id)?.unlockedAt, 'the owner got it when the third came');
    const metrics = (await call('GET', '/v1/admin/achievements', siteAdmin.token)).body.metrics;
    assert.ok(JSON.stringify(metrics).includes('community_size'));
  });

  it('takes a logo from admins (the clan logo pipeline), serves it to anyone, and the site admin can take it off', async () => {
    const c = await communityOf('Logo');
    const png = encodePng({ width: 64, height: 64, rgba: Buffer.alloc(64 * 64 * 4, 200) });
    const up = (token: string, body: Buffer) => fetch(`${base}/v1/communities/${c.id}/logo`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: new Uint8Array(body) });
    assert.equal((await up(c.mod.token, png)).status, 403);
    assert.equal((await up(c.admin.token, Buffer.from('nope'))).status, 400);
    const res = await up(c.admin.token, png);
    assert.equal(res.status, 200);
    const v = ((await res.json()) as any).community.logo;
    assert.ok(v);
    const served = await fetch(`${base}/v1/communities/${c.id}/logo.png?v=${v}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${base}/v1/clans/${c.id}/logo.png`)).status, 404);
    const siteAdmin = await login('ComAdmin');
    assert.equal((await call('DELETE', `/v1/admin/communities/${c.id}/logo`, siteAdmin.token)).status, 200);
    assert.equal((await fetch(`${base}/v1/communities/${c.id}/logo.png`)).status, 404);
  });

  it('lets a member choose how they hear about it, and leave', async () => {
    const c = await communityOf('Pref');
    assert.equal((await call('POST', `/v1/communities/${c.id}/notify`, c.member.token, { notify: 'loud' })).status, 400);
    const res = await call('POST', `/v1/communities/${c.id}/notify`, c.member.token, { notify: 'all' });
    assert.equal(res.body.communities.find((x: any) => x.id === c.id).notify, 'all');
    assert.equal((await call('POST', `/v1/communities/${c.id}/leave`, c.member.token)).body.communities.some((x: any) => x.id === c.id), false);
    // the owner alone: leaving deletes it
    const solo = await login('Solo');
    const s = (await call('POST', '/v1/communities', solo.token, { name: 'Samotnia' })).body.community;
    assert.equal((await call('POST', `/v1/communities/${s.id}/leave`, solo.token)).status, 200);
    assert.equal(app.communities.store.community(s.id), undefined);
  });
});
