import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { crc32 } from 'node:zlib';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { DAY_MIN_SECONDS, dayOf } from '../src/achievements.ts';
import { addDays } from '../src/challenges.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-user-extras-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown, raw?: Buffer) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': raw ? 'application/zip' : 'application/json', 'X-SlashClient': 'launcher/test', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ? new Uint8Array(raw) : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };
const extras = (id: string, section: string, token: string) => call('GET', `/v1/admin/users/${id}/extras/${section}`, token);

/** A connected launcher that collects the events it gets. */
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

/** A zip with stored entries, enough for the server's check of a profile pack. */
function zip(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    local.push(head, nameBuf, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
const pack = () => zip({ 'modrinth.index.json': '{"formatVersion":1,"game":"minecraft","files":[],"dependencies":{"minecraft":"1.21.1"}}' });

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef', 'Wlasciciel'],
    cloudDir: path.join(dir, 'cloud'), mediaDir: path.join(dir, 'media'), sharesDir: path.join(dir, 'profiles'), imagesDir: path.join(dir, 'chat-images'),
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("the account drawer's further sections", () => {
  it('lets only admins look, and keeps admins by configuration from other admins', async () => {
    const boss = await login('Szef');
    const owner = await login('Wlasciciel');
    const player = await login('ExtraGracz');
    assert.equal((await extras(player.user.id, 'friends', player.token)).body.error, 'not_admin');
    assert.equal((await extras(player.user.id, 'nope', boss.token)).status, 404);
    assert.equal((await extras('no-such-user', 'friends', boss.token)).status, 404);
    // a database admin looks at the owner's account but changes nothing there
    await call('POST', `/v1/admin/users/${player.user.id}`, boss.token, { role: 'admin' });
    const view = await extras(owner.user.id, 'achievements', player.token);
    assert.equal(view.body.protected, true);
    assert.equal((await call('POST', `/v1/admin/users/${owner.user.id}/extras/streak`, player.token, { days: 0 })).body.error, 'config_admin');
    // another admin by configuration may
    assert.equal((await extras(owner.user.id, 'achievements', boss.token)).body.protected, false);
    assert.equal((await call('POST', `/v1/admin/users/${owner.user.id}/extras/streak`, boss.token, { days: 0, dryRun: true })).status, 200);
    await call('POST', `/v1/admin/users/${player.user.id}`, boss.token, { role: '' });
  });

  it('lists achievements, takes any of them away (the reward only when asked) and starts counters again', async () => {
    const boss = await login('Szef');
    const p = await login('Odbierany');
    const id = p.user.id;
    // a friend unlocks "the first friend" (an achievement counted by the server, not given by hand)
    const f = await login('KumpelOdb');
    await call('POST', '/v1/friends/requests', p.token, { handle: 'KumpelOdb' });
    await call('POST', `/v1/friends/requests/${id}/accept`, f.token);
    let view = (await extras(id, 'achievements', boss.token)).body;
    const first = view.achievements.find((a: any) => a.group === 'friends' && a.unlockedAt);
    assert.ok(first, 'a friends achievement unlocked');
    assert.equal(first.reached, true);
    assert.ok(view.counters.some((c: any) => c.key === 'sprays'));
    assert.equal(view.streak.recent.length, 14);
    const balance = app.wallet.balance(id);
    // taken away without the reward: the sparks stay
    let res = await call('POST', `/v1/admin/users/${id}/extras/achievements/${first.id}/revoke`, boss.token, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.taken, 0);
    assert.equal(app.wallet.balance(id), balance);
    assert.equal(res.body.achievements.find((a: any) => a.id === first.id).unlockedAt, null);
    assert.equal((await call('POST', `/v1/admin/users/${id}/extras/achievements/${first.id}/revoke`, boss.token, {})).body.error, 'not_held');
    // still reached: it comes back at the next check, and is not paid twice
    app.achievements.check(id);
    assert.equal(app.wallet.balance(id), balance);
    // with the reward: the sparks it paid go back (never below zero)
    res = await call('POST', `/v1/admin/users/${id}/extras/achievements/${first.id}/revoke`, boss.token, { clawback: true });
    assert.equal(res.body.taken, Math.min(first.paid, balance));
    assert.equal(app.wallet.balance(id), balance - res.body.taken);
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries;
    assert.ok(log.some((e: any) => e.action === 'ach_revoke' && e.target === 'Odbierany' && /odebrano/.test(e.detail)));
    // a counter
    app.achievements.store.bump(id, 'sprays');
    assert.equal(app.achievements.store.counter(id, 'sprays'), 1);
    view = (await call('POST', `/v1/admin/users/${id}/extras/achievements/counters/sprays/reset`, boss.token)).body;
    assert.equal(view.counters.find((c: any) => c.key === 'sprays').n, 0);
    assert.equal((await call('POST', `/v1/admin/users/${id}/extras/achievements/counters/money/reset`, boss.token)).body.error, 'bad_counter');
  });

  it('sets the streak: longer fills the missing days, shorter cuts the day that breaks it', async () => {
    const boss = await login('Szef');
    const p = await login('Seria');
    const id = p.user.id;
    const today = dayOf(Date.now());
    // the account is "older" so there are days to fill
    app.db.sql.prepare('UPDATE users SET created_at = ? WHERE uuid = ?').run(Date.now() - 40 * 86_400_000, id);
    const play = app.db.sql.prepare('INSERT INTO play_days (uuid, day, seconds) VALUES (?, ?, ?)');
    play.run(id, today, 3600);
    play.run(id, addDays(today, -1), 7200);
    play.run(id, addDays(today, -2), 1800);
    assert.equal((await extras(id, 'achievements', boss.token)).body.streak.current, 3);
    // shorter: the third day back is cut to just under the minimum
    let res = await call('POST', `/v1/admin/users/${id}/extras/streak`, boss.token, { days: 2, dryRun: true });
    assert.deepEqual(res.body.plan.cut, [{ day: addDays(today, -2), seconds: 1800 }]);
    assert.equal(res.body.plan.lost, 1800 - (DAY_MIN_SECONDS - 1));
    // a dry run changes nothing
    assert.equal((await extras(id, 'achievements', boss.token)).body.streak.current, 3);
    res = await call('POST', `/v1/admin/users/${id}/extras/streak`, boss.token, { days: 2 });
    assert.equal(res.body.streak.current, 2);
    // longer: the days before are filled with the minimum
    res = await call('POST', `/v1/admin/users/${id}/extras/streak`, boss.token, { days: 7 });
    assert.equal(res.body.streak.current, 7);
    assert.equal(res.body.plan.fill.length, 5);
    // a day that already had play keeps it
    assert.equal((app.db.sql.prepare('SELECT seconds FROM play_days WHERE uuid = ? AND day = ?').get(id, addDays(today, -1)) as { seconds: number }).seconds, 7200);
    // reset
    res = await call('POST', `/v1/admin/users/${id}/extras/streak`, boss.token, { days: 0 });
    assert.equal(res.body.streak.current, 0);
    assert.equal((await call('POST', `/v1/admin/users/${id}/extras/streak`, boss.token, { days: 400 })).body.error, 'bad_days');
    assert.equal((await call('POST', `/v1/admin/users/${id}/extras/streak`, boss.token, { days: -1 })).body.error, 'bad_days');
    assert.ok((await call('GET', '/v1/admin/log', boss.token)).body.entries.some((e: any) => e.action === 'streak_set' && e.target === 'Seria'));
  });

  it("shows the challenges of now and starts one's progress again", async () => {
    const boss = await login('Szef');
    const p = await login('Wyzwany');
    const id = p.user.id;
    await call('GET', '/v1/challenges', p.token);
    const view = (await extras(id, 'achievements', boss.token)).body;
    const daily = view.challenges.periods.find((x: any) => x.kind === 'daily');
    assert.ok(daily.challenges.length > 0);
    const c = daily.challenges[0];
    app.challenges.store.add(id, daily.key, c.counter, 1);
    const res = await call('POST', `/v1/admin/users/${id}/extras/challenges/reset`, boss.token, { period: daily.key, challenge: c.id });
    assert.equal(res.status, 200);
    assert.equal(app.challenges.store.get(id, daily.key, c.counter), 0);
    assert.equal((await call('POST', `/v1/admin/users/${id}/extras/challenges/reset`, boss.token, { period: 'd:2000-01-01', challenge: c.id })).body.error, 'bad_period');
    assert.equal((await call('POST', `/v1/admin/users/${id}/extras/challenges/reset`, boss.token, { period: daily.key, challenge: 'nope' })).status, 404);
  });

  it('removes friends, requests and mutes, and both launchers hear it', async () => {
    const boss = await login('Szef');
    const a = await login('FrA');
    const b = await login('FrB');
    const c = await login('FrC');
    await call('POST', '/v1/friends/requests', a.token, { handle: 'FrB' });
    await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
    await call('POST', '/v1/friends/requests', c.token, { handle: 'FrA' });
    await call('POST', `/v1/friends/${b.user.id}/mute`, a.token, { muted: true });
    let view = (await extras(a.user.id, 'friends', boss.token)).body;
    assert.equal(view.friends.length, 1);
    assert.equal(view.friends[0].muted, true);
    assert.ok(view.friends[0].since > 0);
    assert.equal(view.incoming[0].handle, 'FrC');
    // nothing of the messages
    assert.ok(!JSON.stringify(view).includes('text'));
    view = (await call('DELETE', `/v1/admin/users/${a.user.id}/extras/mutes/${b.user.id}`, boss.token)).body;
    assert.equal(view.friends[0].muted, false);
    view = (await call('DELETE', `/v1/admin/users/${a.user.id}/extras/requests/${c.user.id}`, boss.token)).body;
    assert.equal(view.incoming.length, 0);
    const other = await connect(b.token);
    const mine = await connect(a.token);
    view = (await call('DELETE', `/v1/admin/users/${a.user.id}/extras/friends/${b.user.id}`, boss.token)).body;
    assert.equal(view.friends.length, 0);
    await other.waitFor((e) => e.type === 'friends');
    await mine.waitFor((e) => e.type === 'friends');
    other.ws.close();
    mine.ws.close();
    assert.equal((await call('DELETE', `/v1/admin/users/${a.user.id}/extras/friends/${b.user.id}`, boss.token)).status, 404);
    const actions = (await call('GET', '/v1/admin/log', boss.token)).body.entries.map((e: any) => e.action);
    for (const x of ['friend_remove', 'friend_request_remove', 'mute_clear']) assert.ok(actions.includes(x), x);
  });

  it('lists clans, communities and groups and takes the player out, owners only after handing over', async () => {
    const boss = await login('Szef');
    const own = await login('GrOwner');
    const mem = await login('GrMember');
    await call('POST', '/v1/friends/requests', own.token, { handle: 'GrMember' });
    await call('POST', `/v1/friends/requests/${own.user.id}/accept`, mem.token);
    const clan = (await call('POST', '/v1/clans', own.token, { tag: 'XTR', name: 'Ekstra' })).body.clan;
    const group = (await call('POST', '/v1/groups', own.token, { name: 'Paczka', members: [mem.user.id] })).body.group;
    const community = (await call('POST', '/v1/communities', own.token, { name: 'Ekstrasi' })).body.community;
    await call('POST', `/v1/communities/${community.id}/join`, mem.token);
    let view = (await extras(own.user.id, 'memberships', boss.token)).body;
    assert.equal(view.clan.tag, 'XTR');
    assert.equal(view.clan.role, 'owner');
    assert.ok(view.groups.some((g: any) => g.clan) && view.groups.some((g: any) => g.id === group.id && g.owner));
    assert.equal(view.communities[0].owner, true);
    // the owner of a community hands it over first; a clan's chat goes with the clan
    assert.equal((await call('DELETE', `/v1/admin/users/${own.user.id}/extras/communities/${community.id}`, boss.token)).body.error, 'owner_must_transfer');
    const clanChat = view.groups.find((g: any) => g.clan).id;
    assert.equal((await call('DELETE', `/v1/admin/users/${own.user.id}/extras/groups/${clanChat}`, boss.token)).body.error, 'clan_chat');
    assert.ok(clan.id);
    // a member is taken out of the community; the group's owner out of the group (the member takes it over)
    const kicked = await connect(mem.token);
    view = (await call('DELETE', `/v1/admin/users/${mem.user.id}/extras/communities/${community.id}`, boss.token)).body;
    assert.equal(view.communities.length, 0);
    await kicked.waitFor((e) => e.type === 'community' && e.kicked);
    kicked.ws.close();
    view = (await call('DELETE', `/v1/admin/users/${own.user.id}/extras/groups/${group.id}`, boss.token)).body;
    assert.ok(!view.groups.some((g: any) => g.id === group.id));
    const left = (await extras(mem.user.id, 'memberships', boss.token)).body.groups.find((g: any) => g.id === group.id);
    assert.equal(left.owner, true);
    // the last one out: the group goes
    await call('DELETE', `/v1/admin/users/${mem.user.id}/extras/groups/${group.id}`, boss.token);
    assert.equal(app.db.sql.prepare('SELECT 1 FROM chat_groups WHERE id = ?').get(group.id), undefined);
  });

  it('shows invites and takes a wrong pending code off', async () => {
    const boss = await login('Szef');
    const inviter = await login('Zapraszacz');
    const friend = await login('Zaproszony');
    const code = (await call('GET', '/v1/referrals', inviter.token)).body.code;
    assert.equal((await call('POST', '/v1/referrals/redeem', friend.token, { code })).status, 200);
    let view = (await extras(friend.user.id, 'referrals', boss.token)).body;
    assert.equal(view.invitedBy.handle, 'Zapraszacz');
    assert.equal(view.invitedBy.status, 'pending');
    assert.equal((await extras(inviter.user.id, 'referrals', boss.token)).body.invited[0].handle, 'Zaproszony');
    assert.equal((await extras(inviter.user.id, 'referrals', boss.token)).body.code, code);
    view = (await call('POST', `/v1/admin/users/${friend.user.id}/extras/referral/detach`, boss.token)).body;
    assert.equal(view.invitedBy, null);
    // the player may type a code again
    assert.equal((await call('POST', '/v1/referrals/redeem', friend.token, { code })).status, 200);
    await call('POST', `/v1/admin/referrals/${friend.user.id}/reject`, boss.token, { reason: 'test' });
    assert.equal((await call('POST', `/v1/admin/users/${friend.user.id}/extras/referral/detach`, boss.token)).body.error, 'not_pending');
  });

  it('shows support grants by the account', async () => {
    const boss = await login('Szef');
    const p = await login('Wspierajacy');
    const tier = (await call('GET', '/v1/admin/support', boss.token)).body.tiers[0];
    await call('POST', '/v1/admin/support/grants', boss.token, { handle: 'Wspierajacy', tier: tier.id, days: 30 });
    const view = (await extras(p.user.id, 'support', boss.token)).body;
    assert.equal(view.active.tier, tier.id);
    assert.equal(view.grants[0].by, 'Szef');
    assert.deepEqual(view.payments, []);
  });

  it("lists what the player stored and deletes one thing at a time, files too, never a chat picture's content", async () => {
    const boss = await login('Szef');
    const p = await login('Tworca');
    const f = await login('TworcaKumpel');
    const id = p.user.id;
    await call('POST', '/v1/friends/requests', p.token, { handle: 'TworcaKumpel' });
    await call('POST', `/v1/friends/requests/${id}/accept`, f.token);
    const share = (await call('POST', '/v1/profile-shares?name=Paczka', p.token, undefined, pack())).body.share;
    assert.ok(share?.code);
    const cloudId = '0f8e2a4c-1111-4222-8333-944455556666';
    assert.equal((await call('PUT', `/v1/cloud-profiles/${cloudId}?name=Survival`, p.token, undefined, pack())).status, 200);
    // a chat picture as the launcher leaves it (encrypted bytes)
    const imgId = 'abcdefghijklmnopqrstuv';
    mkdirSync(path.join(dir, 'chat-images'), { recursive: true });
    writeFileSync(path.join(dir, 'chat-images', `${imgId}.bin`), Buffer.alloc(64));
    app.db.sql.prepare('INSERT INTO chat_images (id, owner, recipient, size, created_at, message_id, key) VALUES (?, ?, ?, ?, ?, ?, ?)').run(imgId, id, f.user.id, 64, Date.now(), 1, 'e2e1:SECRETKEY');
    app.db.sql.prepare('INSERT INTO logs (id, owner, size, lines, created_at) VALUES (?, ?, ?, ?, ?)').run('AbCdEfGh12', id, 10, 2, Date.now());
    let view = (await extras(id, 'content', boss.token)).body;
    assert.equal(view.shares[0].code, share.code);
    assert.equal(view.cloud[0].name, 'Survival');
    assert.equal(view.chatImages[0].to.handle, 'TworcaKumpel');
    assert.equal(view.logs[0].id, 'AbCdEfGh12');
    assert.ok(!JSON.stringify(view).includes('SECRETKEY'));
    // the pack's file goes with its code
    assert.ok(existsSync(path.join(dir, 'profiles', `${share.code}.mrpack`)));
    view = (await call('DELETE', `/v1/admin/users/${id}/extras/shares/${share.code}`, boss.token)).body;
    assert.equal(view.shares.length, 0);
    assert.ok(!existsSync(path.join(dir, 'profiles', `${share.code}.mrpack`)));
    view = (await call('DELETE', `/v1/admin/users/${id}/extras/cloud/${cloudId}`, boss.token)).body;
    assert.equal(view.cloud.length, 0);
    assert.equal((await call('GET', '/v1/cloud-profiles', p.token)).body.profiles.length, 0);
    // a picture is taken down: the file goes, the message shows it was
    view = (await call('DELETE', `/v1/admin/users/${id}/extras/chat-images/${imgId}`, boss.token)).body;
    assert.ok(view.chatImages[0].removedAt);
    assert.ok(!existsSync(path.join(dir, 'chat-images', `${imgId}.bin`)));
    assert.equal((await call('DELETE', `/v1/admin/users/${id}/extras/chat-images/${imgId}`, boss.token)).status, 404);
    // someone else's picture is not this player's to take down here
    assert.equal((await call('DELETE', `/v1/admin/users/${f.user.id}/extras/chat-images/${imgId}`, boss.token)).status, 404);
    const actions = (await call('GET', '/v1/admin/log', boss.token)).body.entries.map((e: any) => e.action);
    for (const x of ['share_remove', 'cloud_remove', 'chat_image_remove']) assert.ok(actions.includes(x), x);
  });
});
