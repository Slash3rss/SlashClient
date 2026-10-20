import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { BurstLimiter, COUNTED_PER_DAY, EDIT_WINDOW_MS, SlowDown, editRefusal } from '../src/chatLimits.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-chat-edits-'));
const imagesDir = path.join(dir, 'images');
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any, retryAfter: res.headers.get('retry-after') };
}
async function upload(token: string, url: string, data: Buffer) {
  const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` }, body: new Uint8Array(data) });
  return { status: res.status, body: (await res.json()) as any };
}
type Login = { token: string; user: { id: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Login;
async function befriend(a: Login, b: Login, bHandle: string) {
  await call('POST', '/v1/friends/requests', a.token, { handle: bHandle });
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
/** Closes live connections and lets the server finish with them (it notes the last time seen). */
async function bye(...lives: { ws: WebSocket }[]) {
  await Promise.all(lives.map((l) => new Promise((r) => {
    l.ws.once('close', r);
    l.ws.close();
  })));
  await new Promise((r) => setTimeout(r, 50));
}
/** Stands in for an encrypted envelope: the server only checks its shape. */
const envelope = (s: string) => `e2e1:${Buffer.from(s).toString('base64')}`;
/** Makes a message older than it is (the edit window). */
const age = (table: 'messages' | 'chat_group_messages', id: number, ms: number) => app.db.sql.prepare(`UPDATE ${table} SET created_at = created_at - ? WHERE id = ?`).run(ms, id);

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {},
    imagesDir, adminHandles: ['EdAdmin'],
    // most tests here are not about bursts: the burst test has its own limiter
    chatBurst: { messages: 1000 },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('editing and deleting direct messages', () => {
  it('lets only the author edit text, within the window, encrypted as before, and tells both sides', async () => {
    const ala = await login('EdAla');
    const bob = await login('EdBob');
    await befriend(ala, bob, 'EdBob');
    const bobLive = await connect(bob.token);
    const alaLive = await connect(ala.token);
    const sent = (await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('hej') })).body.message;
    const history = await call('GET', `/v1/messages/${bob.user.id}`, ala.token);
    assert.equal(history.body.editWindowMs, EDIT_WINDOW_MS);

    const edited = await call('POST', `/v1/messages/${bob.user.id}/${sent.id}/edit`, ala.token, { text: envelope('cześć') });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.message.text, envelope('cześć'));
    assert.ok(edited.body.message.editedAt >= sent.at);
    const seen = await bobLive.waitFor((e) => e.type === 'message-edit');
    assert.equal(seen.message.id, sent.id);
    assert.equal(seen.message.text, envelope('cześć'));
    await alaLive.waitFor((e) => e.type === 'message-edit');
    // only the latest text is kept
    const after = (await call('GET', `/v1/messages/${ala.user.id}`, bob.token)).body.messages;
    assert.equal(after.length, 1);
    assert.equal(after[0].text, envelope('cześć'));
    assert.ok(after[0].editedAt);

    // not the friend, not as plain text after encryption, not empty or broken
    assert.equal((await call('POST', `/v1/messages/${ala.user.id}/${sent.id}/edit`, bob.token, { text: envelope('nope') })).body.error, 'not_author');
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/${sent.id}/edit`, ala.token, { text: 'jawnie' })).body.error, 'bad_request');
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/${sent.id}/edit`, ala.token, { text: 'e2e1:!!!' })).body.error, 'bad_request');
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/${sent.id}/edit`, ala.token, { text: ' ' })).body.error, 'empty');
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/999999/edit`, ala.token, { text: envelope('x') })).status, 404);
    // a stranger cannot reach it at all
    const eve = await login('EdEve');
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/${sent.id}/edit`, eve.token, { text: envelope('x') })).status, 403);

    // past the window: no more editing
    age('messages', sent.id, EDIT_WINDOW_MS + 1000);
    const late = await call('POST', `/v1/messages/${bob.user.id}/${sent.id}/edit`, ala.token, { text: envelope('za późno') });
    assert.equal(late.status, 403);
    assert.equal(late.body.error, 'edit_expired');
    await bye(bobLive, alaLive);
  });

  it('does not edit invites or pictures, and deletes for everyone with a tombstone, the picture file too', async () => {
    const ala = await login('DelAla');
    const bob = await login('DelBob');
    await befriend(ala, bob, 'DelBob');
    const bobLive = await connect(bob.token);
    const invite = (await call('POST', `/v1/invites/${bob.user.id}`, ala.token, { server: 'skyup.pl' })).body.message;
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/${invite.id}/edit`, ala.token, { text: envelope('x') })).body.error, 'not_editable');

    const blob = Buffer.alloc(200, 7);
    const up = await upload(ala.token, `/v1/images/${bob.user.id}`, blob);
    assert.equal(up.status, 200);
    const pic = (await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('[Zrzut ekranu]'), image: { id: up.body.id, key: envelope('key') } })).body.message;
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/${pic.id}/edit`, ala.token, { text: envelope('x') })).body.error, 'not_editable');
    assert.equal(readdirSync(imagesDir).length, 1);

    // only the author deletes in direct messages
    assert.equal((await call('DELETE', `/v1/messages/${ala.user.id}/${pic.id}`, bob.token)).body.error, 'not_author');
    const del = await call('DELETE', `/v1/messages/${bob.user.id}/${pic.id}`, ala.token);
    assert.equal(del.status, 200);
    assert.equal(del.body.message.deleted, true);
    assert.equal(del.body.message.text, '');
    assert.equal(del.body.message.image, undefined);
    const pushed = await bobLive.waitFor((e) => e.type === 'message-delete');
    assert.equal(pushed.message.id, pic.id);
    assert.equal(pushed.message.deleted, true);
    // the file and its row are gone; the picture is not served any more
    assert.equal(readdirSync(imagesDir).length, 0);
    assert.equal((await fetch(`${base}/v1/images/${up.body.id}`, { headers: { Authorization: `Bearer ${bob.token}` } })).status, 404);
    // the history keeps a tombstone in its place, without text, and it is not unread
    const history = (await call('GET', `/v1/messages/${ala.user.id}`, bob.token)).body.messages;
    const tomb = history.find((m: any) => m.id === pic.id);
    assert.deepEqual([tomb.deleted, tomb.text, tomb.image], [true, '', undefined]);
    const unread = (await call('GET', '/v1/friends', bob.token)).body.friends.find((f: any) => f.id === ala.user.id).unread;
    assert.equal(unread, 1);
    // an invite may be deleted too, and its server goes with it; a tombstone is not edited
    const inv = (await call('DELETE', `/v1/messages/${bob.user.id}/${invite.id}`, ala.token)).body.message;
    assert.equal(inv.invite, undefined);
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/${invite.id}/edit`, ala.token, { text: envelope('x') })).body.error, 'not_editable');
    // deleting again is harmless; an old message may be deleted any time
    assert.equal((await call('DELETE', `/v1/messages/${bob.user.id}/${pic.id}`, ala.token)).status, 200);
    const old = (await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('stara') })).body.message;
    age('messages', old.id, 30 * 86_400_000);
    assert.equal((await call('DELETE', `/v1/messages/${bob.user.id}/${old.id}`, ala.token)).status, 200);
    assert.ok(!existsSync(path.join(imagesDir, `${up.body.id}.bin`)));
    await bye(bobLive);
  });
});

describe('editing and deleting in group and clan chats', () => {
  it('lets the author edit for those who see it, and the group owner delete others\' messages', async () => {
    const [own, ola, kuba, nowy] = await Promise.all(['GrOwner', 'GrOla', 'GrKuba', 'GrNowy'].map(login));
    for (const [p, h] of [[ola, 'GrOla'], [kuba, 'GrKuba'], [nowy, 'GrNowy']] as const) await befriend(own, p, h);
    const g = (await call('POST', '/v1/groups', own.token, { name: 'Ekipa', members: [ola.user.id, kuba.user.id] })).body.group;
    const olaLive = await connect(ola.token);
    const sent = (await call('POST', `/v1/groups/${g.id}/messages`, ola.token, { text: envelope('siema') })).body.message;
    // someone added later does not see it, nor its edits
    await call('POST', `/v1/groups/${g.id}/members`, own.token, { members: [nowy.user.id] });
    const nowyLive = await connect(nowy.token);

    const list = await call('GET', `/v1/groups/${g.id}/messages`, ola.token);
    assert.equal(list.body.editWindowMs, EDIT_WINDOW_MS);
    assert.equal(list.body.moderator, undefined);
    assert.equal((await call('GET', `/v1/groups/${g.id}/messages`, own.token)).body.moderator, 'all');

    const edited = await call('POST', `/v1/groups/${g.id}/messages/${sent.id}/edit`, ola.token, { text: envelope('siemka') });
    assert.equal(edited.status, 200);
    assert.ok(edited.body.message.editedAt);
    await olaLive.waitFor((e) => e.type === 'group-message-edit' && e.message.id === sent.id);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!nowyLive.events.some((e) => e.type === 'group-message-edit'));
    assert.equal((await call('POST', `/v1/groups/${g.id}/messages/${sent.id}/edit`, nowy.token, { text: envelope('x') })).status, 404);
    // only the author edits, even the owner does not
    assert.equal((await call('POST', `/v1/groups/${g.id}/messages/${sent.id}/edit`, own.token, { text: envelope('x') })).body.error, 'not_author');
    // the group's own lines are not edited or deleted
    const line = (await call('GET', `/v1/groups/${g.id}/messages`, own.token)).body.messages.find((m: any) => m.event);
    assert.equal((await call('POST', `/v1/groups/${g.id}/messages/${line.id}/edit`, own.token, { text: envelope('x') })).body.error, 'not_editable');
    assert.equal((await call('DELETE', `/v1/groups/${g.id}/messages/${line.id}`, own.token)).body.error, 'not_editable');
    age('chat_group_messages', sent.id, EDIT_WINDOW_MS + 1000);
    assert.equal((await call('POST', `/v1/groups/${g.id}/messages/${sent.id}/edit`, ola.token, { text: envelope('x') })).body.error, 'edit_expired');

    // a member may not delete someone else's; the owner may (moderation)
    const kubas = (await call('POST', `/v1/groups/${g.id}/messages`, kuba.token, { text: envelope('spam') })).body.message;
    assert.equal((await call('DELETE', `/v1/groups/${g.id}/messages/${kubas.id}`, ola.token)).body.error, 'not_allowed');
    const del = await call('DELETE', `/v1/groups/${g.id}/messages/${kubas.id}`, own.token);
    assert.equal(del.status, 200);
    assert.equal(del.body.message.deleted, true);
    const pushed = await olaLive.waitFor((e) => e.type === 'group-message-delete' && e.message.id === kubas.id);
    assert.equal(pushed.by, own.user.id);
    assert.equal(pushed.message.text, '');
    // the author deletes their own any time, with its picture
    const up = await upload(ola.token, `/v1/groups/${g.id}/images`, Buffer.alloc(100, 3));
    const pic = (await call('POST', `/v1/groups/${g.id}/messages`, ola.token, { text: envelope('[Zrzut ekranu]'), image: { id: up.body.id, key: envelope('k') } })).body.message;
    assert.equal((await call('POST', `/v1/groups/${g.id}/messages/${pic.id}/edit`, ola.token, { text: envelope('x') })).body.error, 'not_editable');
    assert.ok(existsSync(path.join(imagesDir, `${up.body.id}.bin`)));
    assert.equal((await call('DELETE', `/v1/groups/${g.id}/messages/${pic.id}`, ola.token)).status, 200);
    assert.ok(!existsSync(path.join(imagesDir, `${up.body.id}.bin`)));
    const history = (await call('GET', `/v1/groups/${g.id}/messages`, kuba.token)).body.messages;
    for (const id of [kubas.id, pic.id]) {
      const m = history.find((x: any) => x.id === id);
      assert.deepEqual([m.deleted, m.text, m.image], [true, '', undefined]);
    }
    await bye(olaLive, nowyLive);
  });

  it('lets the clan owner delete anyone\'s messages in its chat, officers only plain members\'', async () => {
    const [boss, off, mem] = await Promise.all(['KlBoss', 'KlOff', 'KlMem'].map(login));
    const clan = (await call('POST', '/v1/clans', boss.token, { tag: 'EDT', name: 'Edytorzy' })).body.clan;
    for (const [p, h] of [[off, 'KlOff'], [mem, 'KlMem']] as const) {
      await call('POST', '/v1/clans/invites', boss.token, { handle: h });
      assert.equal((await call('POST', `/v1/clans/${clan.id}/accept`, p.token)).status, 200);
    }
    await call('POST', `/v1/clans/members/${off.user.id}/role`, boss.token, { role: 'officer' });
    const chat = clan.chat;
    const say = async (p: Login, text: string) => (await call('POST', `/v1/groups/${chat}/messages`, p.token, { text: envelope(text) })).body.message;
    const fromBoss = await say(boss, 'szef');
    const fromOff = await say(off, 'oficer');
    const fromMem = await say(mem, 'członek');
    assert.equal((await call('GET', `/v1/groups/${chat}/messages`, off.token)).body.moderator, 'members');
    assert.equal((await call('GET', `/v1/groups/${chat}/messages`, boss.token)).body.moderator, 'all');
    assert.equal((await call('GET', `/v1/groups/${chat}/messages`, mem.token)).body.moderator, undefined);
    // the officer: a member's yes, the owner's no
    assert.equal((await call('DELETE', `/v1/groups/${chat}/messages/${fromBoss.id}`, off.token)).body.error, 'not_allowed');
    assert.equal((await call('DELETE', `/v1/groups/${chat}/messages/${fromMem.id}`, off.token)).status, 200);
    // the member: nobody else's
    assert.equal((await call('DELETE', `/v1/groups/${chat}/messages/${fromOff.id}`, mem.token)).body.error, 'not_allowed');
    // the owner: the officer's too
    assert.equal((await call('DELETE', `/v1/groups/${chat}/messages/${fromOff.id}`, boss.token)).status, 200);
  });
});

describe('the burst limit', () => {
  it('stops a fast sender in one conversation with the seconds to wait, and holds one who keeps at it', () => {
    const b = new BurstLimiter({ messages: 3, seconds: 10, strikes: 2, muteSeconds: 30 });
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) b.hit('ala', 'd:bob', t + i);
    assert.throws(() => b.hit('ala', 'd:bob', t + 1000), (e: unknown) => e instanceof SlowDown && e.retryAfter === 9);
    // another conversation, and another sender, are not held up
    b.hit('ala', 'g:ekipa', t + 1000);
    b.hit('cyr', 'd:bob', t + 1000);
    // the window moves on
    for (let i = 0; i < 3; i++) b.hit('ala', 'd:bob', t + 10_010 + i);
    // running into it a second time within a minute: held everywhere for a while
    assert.throws(() => b.hit('ala', 'd:bob', t + 10_020), (e: unknown) => e instanceof SlowDown && e.retryAfter === 30);
    assert.throws(() => b.hit('ala', 'g:ekipa', t + 10_030), (e: unknown) => e instanceof SlowDown && e.retryAfter === 30);
    b.hit('ala', 'g:ekipa', t + 41_000);
  });

  it('answers 429 slow_down with Retry-After for direct and group messages and pictures', async () => {
    const strict = createApp({ dbFile: path.join(dir, 'burst.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, imagesDir: path.join(dir, 'burst-images') });
    await new Promise<void>((r) => strict.server.listen(0, r));
    const was = base;
    base = `http://127.0.0.1:${(strict.server.address() as AddressInfo).port}`;
    try {
      const [ala, bob, cyr] = await Promise.all(['BuAla', 'BuBob', 'BuCyr'].map(login));
      await befriend(ala, bob, 'BuBob');
      await befriend(ala, cyr, 'BuCyr');
      for (let i = 0; i < 6; i++) assert.equal((await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope(`m${i}`) })).status, 200);
      const over = await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('za dużo') });
      assert.equal(over.status, 429);
      assert.equal(over.body.error, 'slow_down');
      assert.ok(over.body.retryAfter >= 1 && over.body.retryAfter <= 10);
      assert.equal(over.retryAfter, String(over.body.retryAfter));
      // a picture is a message there too
      assert.equal((await upload(ala.token, `/v1/images/${bob.user.id}`, Buffer.alloc(100))).body.error, 'slow_down');
      // another friend is fine meanwhile
      assert.equal((await call('POST', `/v1/messages/${cyr.user.id}`, ala.token, { text: envelope('hej') })).status, 200);
      // a group chat the same
      const g = (await call('POST', '/v1/groups', ala.token, { name: 'Szybcy', members: [bob.user.id, cyr.user.id] })).body.group;
      for (let i = 0; i < 6; i++) assert.equal((await call('POST', `/v1/groups/${g.id}/messages`, bob.token, { text: envelope(`g${i}`) })).status, 200);
      assert.equal((await call('POST', `/v1/groups/${g.id}/messages`, bob.token, { text: envelope('za dużo') })).body.error, 'slow_down');
    } finally {
      base = was;
      await strict.close();
    }
  });
});

describe('messages for achievements', () => {
  it('counts real conversations only, at most a day\'s worth, and deleting gives nothing back', async () => {
    const [ala, bob, cyr] = await Promise.all(['CntAla', 'CntBob', 'CntCyr'].map(login));
    await befriend(ala, bob, 'CntBob');
    await befriend(ala, cyr, 'CntCyr');
    const counter = app.achievements.store.messages;
    const first = (await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('1') })).body.message;
    assert.equal(counter.day(ala.user.id), 1);
    // deleting does not take it back; writing it again counts while the day has room
    await call('DELETE', `/v1/messages/${bob.user.id}/${first.id}`, ala.token);
    assert.equal(counter.total(ala.user.id), 1);
    // a group with one other person is not a real group chat: not counted
    const pair = (await call('POST', '/v1/groups', ala.token, { name: 'Dwoje', members: [bob.user.id] })).body.group;
    await call('POST', `/v1/groups/${pair.id}/messages`, ala.token, { text: envelope('x') });
    assert.equal(counter.day(ala.user.id), 1);
    const trio = (await call('POST', '/v1/groups', ala.token, { name: 'Troje', members: [bob.user.id, cyr.user.id] })).body.group;
    await call('POST', `/v1/groups/${trio.id}/messages`, ala.token, { text: envelope('x') });
    assert.equal(counter.day(ala.user.id), 2);
    // edits and invites count for nothing
    const m = (await call('POST', `/v1/messages/${cyr.user.id}`, ala.token, { text: envelope('a') })).body.message;
    await call('POST', `/v1/messages/${cyr.user.id}/${m.id}/edit`, ala.token, { text: envelope('b') });
    await call('POST', `/v1/invites/${cyr.user.id}`, ala.token, { server: 'skyup.pl' });
    assert.equal(counter.day(ala.user.id), 3);
    // a flood: the day stops at the cap (the per-minute limit is per account, so through the counter itself)
    for (let i = 0; i < 40; i++) counter.count(ala.user.id);
    assert.equal(counter.day(ala.user.id), COUNTED_PER_DAY);
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('więcej') })).status, 200);
    assert.equal(counter.total(ala.user.id), COUNTED_PER_DAY);
    // a past day counts on its own
    assert.ok(counter.count(ala.user.id, Date.now() - 86_400_000));
    assert.equal(counter.total(ala.user.id), COUNTED_PER_DAY + 1);
    const got = (await call('GET', '/v1/achievements', ala.token)).body.achievements.filter((a: any) => a.unlockedAt).map((a: any) => a.id);
    assert.ok(got.includes('messages_10'));
    assert.ok(!got.includes('messages_100'));
  });

  it('is what the achievement creator\'s "messages" metric counts too', async () => {
    const boss = await login('EdAdmin');
    const p = await login('CntMetryka');
    const sql = app.db.sql;
    // rows in the table alone are not counted any more
    for (let i = 0; i < 20; i++) sql.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at) VALUES (?, ?, ?, ?)').run(p.user.id, boss.user.id, 'x', Date.now());
    const res = await call('POST', '/v1/admin/achievements', boss.token, {
      id: 'talk_five', metric: 'messages', goal: 5, sparks: 1, category: 'social', icon: 'fa-star', name: 'Piątka', nameEn: 'Five', description: 'Pięć wiadomości.', descriptionEn: 'Five messages.',
    });
    assert.equal(res.status, 200);
    const has = () => !!sql.prepare("SELECT 1 FROM achievements WHERE uuid = ? AND id = 'talk_five'").get(p.user.id);
    assert.ok(!has());
    for (let i = 0; i < 5; i++) app.achievements.store.messages.count(p.user.id);
    app.achievements.check(p.user.id);
    assert.ok(has());
  });

  it('refuses edits by rule (unit)', () => {
    const now = 10_000_000;
    const m = { from: 'a', at: now - 1000 };
    assert.equal(editRefusal(m, 'a', false, now), undefined);
    assert.deepEqual(editRefusal(m, 'b', false, now), [403, 'not_author']);
    assert.deepEqual(editRefusal(m, 'a', true, now), [400, 'not_editable']);
    assert.deepEqual(editRefusal({ ...m, deleted: true }, 'a', false, now), [400, 'not_editable']);
    assert.deepEqual(editRefusal({ ...m, at: now - EDIT_WINDOW_MS - 1 }, 'a', false, now), [403, 'edit_expired']);
  });
});
