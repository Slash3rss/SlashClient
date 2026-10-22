import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { CHAT_MEDIA_DEFAULTS, OverrideStore, cleanOverrides, effective } from '../src/chatMediaLimits.ts';

/** The Multimedia panel of chats (0.9.36): pictures listed and taken down, and the shared chats' limits. */

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-chat-media-'));
const imagesDir = path.join(dir, 'images');
const communityDir = path.join(dir, 'community-images');
let base = '';
let app: ReturnType<typeof createApp>;

/** 4×3 progressive JPEG without metadata (as in communityMedia.test.ts). */
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVAQEBAAAAAAAAAAAAAAAAAAAFBv/aAAwDAQACEAMQAAABiA+t/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/AP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z', 'base64');

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
async function upload(url: string, token: string, data: Uint8Array) {
  const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` }, body: new Uint8Array(data) });
  return { status: res.status, body: (await res.json()) as any };
}
async function download(url: string, token: string) {
  const res = await fetch(base + url, { headers: { Authorization: `Bearer ${token}` } });
  return res.status;
}
type Player = { token: string; user: { id: string; handle: string; name: string } };
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
const envelope = (s: string) => `e2e1:${Buffer.from(s).toString('base64')}`;
const fileOf = (id: string) => path.join(imagesDir, `${id}.bin`);

/** A picture sent to a friend or a group ("/v1/groups/<id>"), and its message's id. */
async function sendDirect(from: Player, to: Player, size = 100) {
  const up = await upload(`/v1/images/${to.user.id}`, from.token, Buffer.alloc(size, 5));
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const sent = await call('POST', `/v1/messages/${to.user.id}`, from.token, { text: envelope('[Zrzut ekranu]'), image: { id: up.body.id, key: envelope('k') } });
  assert.equal(sent.status, 200);
  return { image: up.body.id as string, message: sent.body.message.id as number };
}
async function sendGroup(from: Player, group: string, size = 100) {
  const up = await upload(`/v1/groups/${group}/images`, from.token, Buffer.alloc(size, 6));
  if (up.status !== 200) return { status: up.status, error: up.body.error as string };
  const sent = await call('POST', `/v1/groups/${group}/messages`, from.token, { text: envelope('[Zrzut ekranu]'), image: { id: up.body.id, key: envelope('k') } });
  assert.equal(sent.status, 200);
  return { status: 200, image: up.body.id as string, message: sent.body.message.id as number };
}
const setSettings = async (admin: Player, values: Record<string, unknown>) => assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values })).status, 200);

let admin: Player;
before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 10_000, oauth: {},
    imagesDir, communityImagesDir: communityDir, adminHandles: ['Szef'], chatBurst: { messages: 1000, seconds: 10 }, profileViewsPerMinute: 10_000,
    imageLimits: { perDay: 1000, bytesPerDay: 100_000_000 },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  admin = await login('Szef');
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('chat media limits', () => {
  it('lowers the panel\'s limits only, from megabytes', () => {
    const g = CHAT_MEDIA_DEFAULTS.group;
    assert.deepEqual(cleanOverrides({ quotaMb: 100, perMemberDay: 5 }, g), { quotaBytes: 100 * 1024 * 1024, perMemberDay: 5 });
    assert.equal(cleanOverrides({ quotaCount: g.quotaCount + 1 }, g), 'bad_limits');
    assert.equal(cleanOverrides({ days: -1 }, g), 'bad_limits');
    assert.equal(cleanOverrides({ days: 'x' }, g), 'bad_limits');
    assert.deepEqual(cleanOverrides({ days: null }, g), {});
    assert.deepEqual(effective(g, { days: 7 }), { ...g, days: 7 });
    // an own limit above a lowered panel's: the panel's wins
    assert.equal(effective({ ...g, days: 3 }, { days: 7 }).days, 3);
    const store = new OverrideStore(app.db.sql);
    store.set('g:test', { days: 7 }, 'x');
    assert.deepEqual(store.get('g:test'), { days: 7 });
    store.set('g:test', {}, 'x');
    assert.deepEqual(store.get('g:test'), {});
  });
});

describe('the Multimedia panel of direct messages', () => {
  it('lists pictures newest first, takes one\'s own down (file gone, message kept), live for both', async () => {
    const ala = await login('DmMedAla');
    const bob = await login('DmMedBob');
    const cyr = await login('DmMedCyr');
    await befriend(ala, bob);
    const a = await sendDirect(ala, bob);
    const b = await sendDirect(bob, ala);
    const c = await sendDirect(ala, bob);
    await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: envelope('zwykła') });

    const list = await call('GET', `/v1/messages/${ala.user.id}/media?limit=2`, bob.token);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.media.map((m: any) => m.id), [c.message, b.message]);
    assert.equal(list.body.more, true);
    assert.deepEqual(list.body.media[0].image, { id: c.image, key: envelope('k'), size: 100 });
    assert.equal(list.body.media[0].from, ala.user.id);
    const older = await call('GET', `/v1/messages/${ala.user.id}/media?before=${b.message}`, bob.token);
    assert.deepEqual(older.body.media.map((m: any) => m.id), [a.message]);
    // strangers see nothing
    assert.equal((await call('GET', `/v1/messages/${ala.user.id}/media`, cyr.token)).status, 403);

    const alaLive = await connect(ala.token);
    const bobLive = await connect(bob.token);
    // Bob cannot take Ala's picture down; Ala can
    const refused = await call('DELETE', `/v1/messages/${ala.user.id}/${a.message}/image`, bob.token);
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, 'not_author');
    assert.ok(existsSync(fileOf(a.image)));
    const done = await call('DELETE', `/v1/messages/${bob.user.id}/${a.message}/image`, ala.token);
    assert.equal(done.status, 200);
    assert.deepEqual(done.body.removed, [a.message]);
    assert.ok(!existsSync(fileOf(a.image)));
    assert.equal(await download(`/v1/images/${a.image}`, bob.token), 404);
    for (const live of [alaLive, bobLive]) {
      const e = await live.waitFor((x) => x.type === 'message-edit' && x.message.id === a.message);
      assert.equal(e.message.image, undefined);
      assert.equal(e.message.imageRemoved.by, ala.user.id);
    }
    // the message stays (with its caption for older launchers), marked
    const conv = await call('GET', `/v1/messages/${ala.user.id}`, bob.token);
    const m = conv.body.messages.find((x: any) => x.id === a.message);
    assert.equal(m.text, envelope('[Zrzut ekranu]'));
    assert.equal(m.image, undefined);
    assert.ok(m.imageRemoved.at);
    // a removed picture is not in the panel, and cannot go into a message again
    assert.deepEqual((await call('GET', `/v1/messages/${ala.user.id}/media`, bob.token)).body.media.map((x: any) => x.id), [c.message, b.message]);

    // several at once: Ala's go, Bob's is refused
    const bulk = await call('POST', `/v1/messages/${bob.user.id}/media/delete`, ala.token, { messages: [b.message, c.message] });
    assert.deepEqual(bulk.body, { removed: [c.message], refused: [b.message] });
    assert.ok(existsSync(fileOf(b.image)) && !existsSync(fileOf(c.image)));
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/media/delete`, ala.token, { messages: [] })).status, 400);
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}/media/delete`, ala.token, { messages: ['x'] })).status, 400);
    // already gone: not found
    assert.equal((await call('DELETE', `/v1/messages/${bob.user.id}/${a.message}/image`, ala.token)).status, 404);
    alaLive.ws.close();
    bobLive.ws.close();
  });
});

describe('the Multimedia panel of group and clan chats', () => {
  it('lets the sender and the group\'s owner take pictures down, not other members', async () => {
    const own = await login('GrMedOwn');
    const bob = await login('GrMedBob');
    const cyr = await login('GrMedCyr');
    await befriend(own, bob);
    await befriend(own, cyr);
    const group = (await call('POST', '/v1/groups', own.token, { name: 'Media', members: [bob.user.id, cyr.user.id] })).body.group.id as string;
    const fromBob = await sendGroup(bob, group);
    const fromCyr = await sendGroup(cyr, group);
    const cyrLive = await connect(cyr.token);

    const list = await call('GET', `/v1/groups/${group}/media`, cyr.token);
    assert.deepEqual(list.body.media.map((m: any) => [m.id, m.from]), [[fromCyr.message, cyr.user.id], [fromBob.message, bob.user.id]]);
    // limits for everyone; the use only for its moderator (the owner)
    assert.equal(list.body.limits.quotaCount, CHAT_MEDIA_DEFAULTS.group.quotaCount);
    assert.equal(list.body.usage, undefined);
    const ownView = await call('GET', `/v1/groups/${group}/media`, own.token);
    assert.deepEqual(ownView.body.usage, { bytes: 200, count: 2 });
    assert.equal(ownView.body.moderator, true);
    assert.ok(ownView.body.global && ownView.body.own);

    // Bob may not take Cyr's down; the owner may
    assert.equal((await call('DELETE', `/v1/groups/${group}/messages/${fromCyr.message}/image`, bob.token)).body.error, 'not_allowed');
    const done = await call('DELETE', `/v1/groups/${group}/messages/${fromCyr.message}/image`, own.token);
    assert.deepEqual(done.body.removed, [fromCyr.message]);
    assert.ok(!existsSync(fileOf(fromCyr.image!)));
    const e = await cyrLive.waitFor((x) => x.type === 'group-message-edit' && x.message.id === fromCyr.message);
    assert.equal(e.message.imageRemoved.by, own.user.id);
    assert.equal(e.by, own.user.id);
    const msgs = await call('GET', `/v1/groups/${group}/messages`, bob.token);
    assert.ok(msgs.body.messages.find((m: any) => m.id === fromCyr.message).imageRemoved);
    assert.deepEqual((await call('GET', `/v1/groups/${group}/media`, own.token)).body.usage, { bytes: 100, count: 1 });
    // someone outside sees nothing
    const out = await login('GrMedOut');
    assert.equal((await call('GET', `/v1/groups/${group}/media`, out.token)).status, 404);
    cyrLive.ws.close();
  });

  it('follows the clan\'s roles: an officer takes members\' pictures down, not the owner\'s', async () => {
    const owner = await login('ClMedOwn');
    const officer = await login('ClMedOff');
    const member = await login('ClMedMem');
    const made = await call('POST', '/v1/clans', owner.token, { tag: 'MED', name: 'Klan mediów' });
    const id = made.body.clan.id;
    for (const p of [officer, member]) {
      await call('POST', '/v1/clans/invites', owner.token, { handle: p.user.handle });
      assert.equal((await call('POST', `/v1/clans/${id}/accept`, p.token)).status, 200);
    }
    await call('POST', `/v1/clans/members/${officer.user.id}/role`, owner.token, { role: 'officer' });
    const chat = made.body.clan.chat as string;
    const ofOwner = await sendGroup(owner, chat);
    const ofMember = await sendGroup(member, chat);
    // a clan's chat has the clans' limits
    assert.equal((await call('GET', `/v1/groups/${chat}/media`, member.token)).body.limits.days, CHAT_MEDIA_DEFAULTS.clan.days);
    const bulk = await call('POST', `/v1/groups/${chat}/media/delete`, officer.token, { messages: [ofOwner.message, ofMember.message] });
    assert.deepEqual(bulk.body, { removed: [ofMember.message], refused: [ofOwner.message] });
    // own limits: the clan's owner only
    assert.equal((await call('POST', `/v1/groups/${chat}/media/limits`, officer.token, { days: 10 })).status, 403);
    const set = await call('POST', `/v1/groups/${chat}/media/limits`, owner.token, { days: 10, quotaMb: 50 });
    assert.equal(set.status, 200);
    assert.equal(set.body.limits.days, 10);
    assert.deepEqual(set.body.own, { days: 10, quotaBytes: 50 * 1024 * 1024 });
    assert.equal((await call('POST', `/v1/groups/${chat}/media/limits`, owner.token, { days: 100_000 })).body.error, 'bad_limits');
  });

  it('keeps a chat\'s store and the pictures per member a day, and frees room when pictures go', async () => {
    const own = await login('QuMedOwn');
    const bob = await login('QuMedBob');
    await befriend(own, bob);
    const group = (await call('POST', '/v1/groups', own.token, { name: 'Pełna', members: [bob.user.id] })).body.group.id as string;
    await setSettings(admin, { 'chatMedia.groupQuotaCount': 2, 'chatMedia.groupPerMemberDay': 2 });
    try {
      const one = await sendGroup(bob, group);
      await sendGroup(own, group);
      const full = await sendGroup(bob, group);
      assert.deepEqual([full.status, full.error], [409, 'chat_media_full']);
      // taking one down frees room
      await call('DELETE', `/v1/groups/${group}/messages/${one.message}/image`, bob.token);
      assert.equal((await sendGroup(bob, group)).status, 200);
      // Bob has sent two today (the one taken down counts, the refused one not)
      await call('POST', `/v1/groups/${group}/media/limits`, own.token, {});
      await setSettings(admin, { 'chatMedia.groupQuotaCount': 100 });
      const daily = await sendGroup(bob, group);
      assert.deepEqual([daily.status, daily.error], [429, 'chat_media_daily']);
      // the owner may lower it for the chat, never raise it above the panel's
      assert.equal((await call('POST', `/v1/groups/${group}/media/limits`, own.token, { perMemberDay: 4 })).body.error, 'bad_limits');
      assert.equal((await call('POST', `/v1/groups/${group}/media/limits`, bob.token, { quotaCount: 1 })).status, 403);
      assert.equal((await call('POST', `/v1/groups/${group}/media/limits`, own.token, { quotaCount: 1 })).status, 200);
      const lowered = await sendGroup(own, group);
      assert.deepEqual([lowered.status, lowered.error], [409, 'chat_media_full']);
      // the store's bytes, and the size of one picture
      await call('POST', `/v1/groups/${group}/media/limits`, own.token, {});
      await setSettings(admin, { 'chatMedia.groupQuotaBytes': 1024 * 1024, 'chatMedia.groupMaxBytes': 64 * 1024 });
      const big = await sendGroup(own, group, 70 * 1024);
      assert.deepEqual([big.status, big.error], [413, 'too_large']);
      // direct messages keep their own limits
      assert.equal((await upload(`/v1/images/${bob.user.id}`, own.token, Buffer.alloc(70 * 1024, 1))).status, 200);
    } finally {
      await setSettings(admin, { 'chatMedia.groupQuotaCount': CHAT_MEDIA_DEFAULTS.group.quotaCount, 'chatMedia.groupPerMemberDay': CHAT_MEDIA_DEFAULTS.group.perMemberDay,
        'chatMedia.groupQuotaBytes': CHAT_MEDIA_DEFAULTS.group.quotaBytes, 'chatMedia.groupMaxBytes': CHAT_MEDIA_DEFAULTS.group.maxBytes });
    }
  });

  it('drops pictures past the chat\'s keeping time, the message kept with the mark', async () => {
    const own = await login('RtMedOwn');
    const bob = await login('RtMedBob');
    await befriend(own, bob);
    const group = (await call('POST', '/v1/groups', own.token, { name: 'Krótko', members: [bob.user.id] })).body.group.id as string;
    const other = (await call('POST', '/v1/groups', own.token, { name: 'Długo', members: [bob.user.id] })).body.group.id as string;
    assert.equal((await call('POST', `/v1/groups/${group}/media/limits`, own.token, { days: 2 })).status, 200);
    const short = await sendGroup(bob, group);
    const long = await sendGroup(bob, other);
    const dm = await sendDirect(own, bob);
    const bobLive = await connect(bob.token);
    await app.chatImages.cleanup(Date.now() + 3 * 86_400_000);
    assert.ok(!existsSync(fileOf(short.image!)));
    assert.ok(existsSync(fileOf(long.image!)) && existsSync(fileOf(dm.image)));
    const e = await bobLive.waitFor((x) => x.type === 'group-message-edit' && x.message.id === short.message);
    assert.equal(e.message.imageRemoved.expired, true);
    const msgs = await call('GET', `/v1/groups/${group}/messages`, bob.token);
    assert.equal(msgs.body.messages.find((m: any) => m.id === short.message).imageRemoved.expired, true);
    // the panel's 30 days for the other group and direct messages
    await app.chatImages.cleanup(Date.now() + 31 * 86_400_000);
    assert.ok(!existsSync(fileOf(long.image!)) && !existsSync(fileOf(dm.image)));
    const conv = await call('GET', `/v1/messages/${own.user.id}`, bob.token);
    assert.equal(conv.body.messages.find((m: any) => m.id === dm.message).imageRemoved.expired, true);
    bobLive.ws.close();
  });

  it('removes a group\'s pictures when the group goes', async () => {
    const own = await login('GoMedOwn');
    const bob = await login('GoMedBob');
    await befriend(own, bob);
    const group = (await call('POST', '/v1/groups', own.token, { name: 'Znika', members: [bob.user.id] })).body.group.id as string;
    const pic = await sendGroup(bob, group);
    await call('POST', `/v1/groups/${group}/leave`, bob.token);
    await call('POST', `/v1/groups/${group}/leave`, own.token);
    for (let i = 0; i < 50 && existsSync(fileOf(pic.image!)); i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(!existsSync(fileOf(pic.image!)));
  });
});

describe('the Multimedia panel of communities', () => {
  async function community(prefix: string) {
    const owner = await login(`${prefix}Own`);
    const mod = await login(`${prefix}Mod`);
    const member = await login(`${prefix}Mem`);
    const made = await call('POST', '/v1/communities', owner.token, { name: `Media ${prefix}` });
    const id = made.body.community.id as string;
    for (const p of [mod, member]) assert.equal((await call('POST', `/v1/communities/${id}/join`, p.token)).status, 200);
    await call('POST', `/v1/communities/${id}/members/${mod.user.id}/role`, owner.token, { role: 'moderator' });
    const general = made.body.community.channels.find((c: any) => c.kind === 'general').id as string;
    return { id, owner, mod, member, general };
  }
  async function picture(c: { id: string; general: string }, from: Player) {
    const up = await upload(`/v1/communities/${c.id}/channels/${c.general}/images`, from.token, JPEG);
    if (up.status !== 200) return { status: up.status, error: up.body.error as string };
    const sent = await call('POST', `/v1/communities/${c.id}/channels/${c.general}/messages`, from.token, { image: up.body.id });
    assert.equal(sent.status, 200);
    return { status: 200, image: up.body.id as string, message: sent.body.message.id as number };
  }
  const cfile = (id: string) => path.join(communityDir, `${id}.jpg`);

  it('lists a channel\'s pictures, moderators take members\' down (logged), members only their own', async () => {
    const c = await community('CoMed');
    const ofMember = await picture(c, c.member);
    const ofMod = await picture(c, c.mod);
    const ofOwner = await picture(c, c.owner);
    const list = await call('GET', `/v1/communities/${c.id}/channels/${c.general}/media`, c.member.token);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.media.map((m: any) => m.id), [ofOwner.message, ofMod.message, ofMember.message]);
    assert.equal(list.body.media[0].author.name, c.owner.user.name);
    assert.equal(list.body.usage, undefined);
    assert.equal((await call('GET', `/v1/communities/${c.id}/channels/${c.general}/media`, c.mod.token)).body.usage.count, 3);
    const live = await connect(c.member.token);

    // a member cannot take the moderator's down; the moderator takes the member's, not the owner's
    assert.equal((await call('DELETE', `/v1/communities/${c.id}/channels/${c.general}/messages/${ofMod.message}/image`, c.member.token)).body.error, 'not_allowed');
    const bulk = await call('POST', `/v1/communities/${c.id}/channels/${c.general}/media/delete`, c.mod.token, { messages: [ofMember.message, ofOwner.message] });
    assert.deepEqual(bulk.body, { removed: [ofMember.message], refused: [ofOwner.message] });
    assert.ok(!existsSync(cfile(ofMember.image!)) && existsSync(cfile(ofOwner.image!)));
    const e = await live.waitFor((x) => x.type === 'community-message-edit' && x.message.id === ofMember.message);
    assert.equal(e.message.image.removed, true);
    assert.equal(e.message.image.expired, true);
    assert.equal(await download(`/v1/communities/${c.id}/images/${ofMember.image}`, c.owner.token), 404);
    // in the moderation log
    const log = await call('GET', `/v1/communities/${c.id}/log?actions=image_delete`, c.owner.token);
    const entry = (log.body.log as any[]).find((x) => x.action === 'image_delete');
    assert.ok(entry);
    assert.equal(entry.target, c.member.user.id);
    // the sender's own: not logged
    await call('DELETE', `/v1/communities/${c.id}/channels/${c.general}/messages/${ofMod.message}/image`, c.mod.token);
    const after = await call('GET', `/v1/communities/${c.id}/log`, c.owner.token);
    assert.equal((after.body.log as any[]).filter((x) => x.action === 'image_delete').length, 1);
    live.ws.close();
  });

  it('keeps the community\'s store and pictures per member a day; admins lower them', async () => {
    const c = await community('CoQu');
    assert.equal((await call('POST', `/v1/communities/${c.id}/media/limits`, c.mod.token, { quotaCount: 1 })).status, 403);
    const set = await call('POST', `/v1/communities/${c.id}/media/limits`, c.owner.token, { quotaCount: 2, perMemberDay: 1 });
    assert.equal(set.status, 200);
    assert.equal(set.body.limits.quotaCount, 2);
    assert.equal((await picture(c, c.member)).status, 200);
    const daily = await picture(c, c.member);
    assert.deepEqual([daily.status, daily.error], [429, 'chat_media_daily']);
    assert.equal((await picture(c, c.mod)).status, 200);
    const full = await picture(c, c.owner);
    assert.deepEqual([full.status, full.error], [409, 'chat_media_full']);
    const log = await call('GET', `/v1/communities/${c.id}/log`, c.owner.token);
    assert.ok((log.body.log as any[]).some((x) => x.action === 'media_limits'));
  });

  it('drops pictures past the community\'s own keeping time', async () => {
    const c = await community('CoRt');
    const d = await community('CoRt2');
    await call('POST', `/v1/communities/${c.id}/media/limits`, c.owner.token, { days: 5 });
    const short = await picture(c, c.member);
    const long = await picture(d, d.member);
    await app.cleanupCommunityImages(Date.now() + 6 * 86_400_000);
    assert.ok(!existsSync(cfile(short.image!)) && existsSync(cfile(long.image!)));
    const msgs = await call('GET', `/v1/communities/${c.id}/channels/${c.general}/messages`, c.member.token);
    const m = msgs.body.messages.find((x: any) => x.id === short.message);
    assert.equal(m.image.expired, true);
    assert.equal(m.image.removed, undefined);
  });
});
