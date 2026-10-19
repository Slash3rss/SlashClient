import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { cleanGroupName, GROUP_SIZE } from '../src/groups.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-groups-'));
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
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {} });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('group chats', () => {
  it('checks names', () => {
    assert.equal(cleanGroupName('  Ekipa   na  SkyUp '), 'Ekipa na SkyUp');
    assert.equal(cleanGroupName(''), undefined);
    assert.equal(cleanGroupName('x'.repeat(33)), undefined);
    assert.equal(cleanGroupName('a\u0000b'), undefined);
    assert.equal(cleanGroupName(5), undefined);
  });

  it('is made with friends only, and everyone in it gets the messages', async () => {
    const ala = await login('GrAla');
    const bob = await login('GrBob');
    const cyr = await login('GrCyr');
    const obcy = await login('GrObcy');
    await befriend(ala, bob);
    await befriend(ala, cyr);
    // a stranger cannot be put in
    assert.equal((await call('POST', '/v1/groups', ala.token, { name: 'Ekipa', members: [bob.user.id, obcy.user.id] })).body.error, 'not_friends');
    assert.equal((await call('POST', '/v1/groups', ala.token, { name: '', members: [bob.user.id] })).body.error, 'bad_name');
    assert.equal((await call('POST', '/v1/groups', ala.token, { name: 'Sama', members: [] })).status, 400);
    const bobLive = await connect(bob.token);
    const cyrLive = await connect(cyr.token);
    const made = await call('POST', '/v1/groups', ala.token, { name: 'Ekipa', members: [bob.user.id, cyr.user.id] });
    assert.equal(made.status, 200);
    const group = made.body.group;
    assert.equal(group.owner, ala.user.id);
    assert.deepEqual(group.members.map((m: any) => m.id).sort(), [ala.user.id, bob.user.id, cyr.user.id].sort());
    await bobLive.waitFor((e) => e.type === 'groups' && e.id === group.id);
    // the "created" line is in the history for everyone
    const first = await call('GET', `/v1/groups/${group.id}/messages`, bob.token);
    assert.equal(first.body.messages[0].event.kind, 'created');
    assert.equal(first.body.messages[0].event.by, 'GrAla');

    const sent = await call('POST', `/v1/groups/${group.id}/messages`, ala.token, { text: 'Siema ekipa' });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.message.group, group.id);
    await bobLive.waitFor((e) => e.type === 'group-message' && e.message.text === 'Siema ekipa');
    await cyrLive.waitFor((e) => e.type === 'group-message' && e.message.text === 'Siema ekipa');
    // unread for the others, not the sender
    const bobGroups = (await call('GET', '/v1/groups', bob.token)).body.groups;
    assert.equal(bobGroups.find((g: any) => g.id === group.id).unread, 2);
    assert.equal((await call('GET', '/v1/groups', ala.token)).body.groups[0].unread, 0);
    await call('POST', `/v1/groups/${group.id}/read`, bob.token);
    assert.equal((await call('GET', '/v1/groups', bob.token)).body.groups[0].unread, 0);
    // someone outside sees nothing of it
    assert.equal((await call('GET', `/v1/groups/${group.id}/messages`, obcy.token)).status, 404);
    assert.equal((await call('POST', `/v1/groups/${group.id}/messages`, obcy.token, { text: 'hej' })).status, 404);
    assert.equal((await call('GET', `/v1/groups/${group.id}/keys`, obcy.token)).status, 404);
    bobLive.ws.close();
    cyrLive.ws.close();
  });

  it('hands out the members\' launcher keys to members, for encryption', async () => {
    const ala = await login('KeyAla');
    const bob = await login('KeyBob');
    const cyr = await login('KeyCyr');
    await befriend(ala, bob);
    await befriend(ala, cyr);
    const pub = (n: number) => Buffer.alloc(44, n).toString('base64');
    for (const [p, n] of [[ala, 1], [bob, 2], [cyr, 3]] as const) {
      // more launchers than are used for groups: only the newest ones come back
      for (let i = 0; i < 6; i++) await call('POST', '/v1/keys', p.token, { device: `${n}${i}`.padEnd(24, '0'), pub: pub(n * 10 + i) });
    }
    const { group } = (await call('POST', '/v1/groups', ala.token, { name: 'Klucze', members: [bob.user.id, cyr.user.id] })).body;
    // bob and cyr are not friends, but in one group they can encrypt for each other
    const keys = (await call('GET', `/v1/groups/${group.id}/keys`, bob.token)).body.keys as { user: string; device: string; pub: string }[];
    for (const p of [ala, bob, cyr]) assert.equal(keys.filter((k) => k.user === p.user.id).length, 4);
    const encrypted = 'e2e1:' + Buffer.from('x'.repeat(30_000)).toString('base64');
    assert.equal((await call('POST', `/v1/groups/${group.id}/messages`, cyr.token, { text: encrypted })).status, 200);
    assert.equal((await call('POST', `/v1/groups/${group.id}/messages`, cyr.token, { text: 'x'.repeat(2001) })).body.error, 'too_long');
    assert.equal((await call('POST', `/v1/groups/${group.id}/messages`, cyr.token, { text: 'e2e1:<script>' })).body.error, 'bad_request');
  });

  it('lets members add their friends, the owner take people out, anyone rename or leave', async () => {
    const ala = await login('MemAla');
    const bob = await login('MemBob');
    const cyr = await login('MemCyr');
    const dan = await login('MemDan');
    await befriend(ala, bob);
    await befriend(bob, cyr);
    await befriend(ala, dan);
    const { group } = (await call('POST', '/v1/groups', ala.token, { name: 'Paczka', members: [bob.user.id] })).body;
    // bob brings his friend cyr (not ala's friend)
    const added = await call('POST', `/v1/groups/${group.id}/members`, bob.token, { members: [cyr.user.id] });
    assert.equal(added.status, 200);
    assert.equal(added.body.group.members.length, 3);
    // only friends of the one adding
    assert.equal((await call('POST', `/v1/groups/${group.id}/members`, cyr.token, { members: [dan.user.id] })).body.error, 'not_friends');
    // cyr does not get what came before he joined (his launcher's key was not in it anyway), only "added"
    assert.equal((await call('GET', '/v1/groups', cyr.token)).body.groups[0].unread, 1);
    assert.deepEqual((await call('GET', `/v1/groups/${group.id}/messages`, cyr.token)).body.messages.map((m: any) => m.event?.kind), ['added']);
    // only the owner removes others
    assert.equal((await call('DELETE', `/v1/groups/${group.id}/members/${bob.user.id}`, cyr.token)).body.error, 'not_owner');
    const cyrLive = await connect(cyr.token);
    assert.equal((await call('DELETE', `/v1/groups/${group.id}/members/${cyr.user.id}`, ala.token)).status, 200);
    await cyrLive.waitFor((e) => e.type === 'groups' && e.id === group.id);
    assert.equal((await call('GET', `/v1/groups/${group.id}/messages`, cyr.token)).status, 404);
    cyrLive.ws.close();
    // renaming, by any member
    const renamed = await call('POST', `/v1/groups/${group.id}/name`, bob.token, { name: 'Nowa nazwa' });
    assert.equal(renamed.body.group.name, 'Nowa nazwa');
    const history = (await call('GET', `/v1/groups/${group.id}/messages`, ala.token)).body.messages.map((m: any) => m.event?.kind);
    assert.deepEqual(history, ['created', 'added', 'removed', 'renamed']);
    // the owner leaving hands the group to the one who stays
    assert.equal((await call('POST', `/v1/groups/${group.id}/leave`, ala.token)).status, 200);
    const left = (await call('GET', '/v1/groups', bob.token)).body.groups[0];
    assert.equal(left.owner, bob.user.id);
    assert.equal(left.members.length, 1);
    // the last one leaving ends it
    await call('POST', `/v1/groups/${group.id}/leave`, bob.token);
    assert.equal((await call('GET', '/v1/groups', bob.token)).body.groups.length, 0);
  });

  it('holds at most GROUP_SIZE members', async () => {
    const owner = await login('BigOwner');
    const friends: Player[] = [];
    for (let i = 0; i < GROUP_SIZE; i++) {
      const p = await login(`Big${i}`);
      // they ask (one request each): the owner asking 16 times in a row would hit the rate limit
      await befriend(p, owner);
      friends.push(p);
    }
    assert.equal((await call('POST', '/v1/groups', owner.token, { name: 'Za duża', members: friends.map((f) => f.user.id) })).body.error, 'too_many');
    const { group } = (await call('POST', '/v1/groups', owner.token, { name: 'Pełna', members: friends.slice(0, GROUP_SIZE - 1).map((f) => f.user.id) })).body;
    assert.equal(group.members.length, GROUP_SIZE);
    assert.equal((await call('POST', `/v1/groups/${group.id}/members`, owner.token, { members: [friends[GROUP_SIZE - 1].user.id] })).body.error, 'too_many');
  });
});
