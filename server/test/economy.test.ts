import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { ACHIEVEMENTS, TOTAL_SPARKS, anniversaryYears, createAchievements, dayOf, specialDays, weekends } from '../src/achievements.ts';
import { ITEMS } from '../src/cosmetics.ts';
import { sparksText } from '../src/economy.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-economy-'));
let base = '';
let app: ReturnType<typeof createApp>;
const DAY = 86_400_000;

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; handle: string } };

/** An account straight in the database (many of them for friends and clans). */
function fakeUser(sql: DatabaseSync, name: string, createdAt = Date.now()): string {
  const uuid = randomUUID();
  sql.prepare('INSERT INTO users (uuid, handle, handle_lower, name, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uuid, name, name.toLowerCase(), name, '', createdAt, createdAt);
  return uuid;
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

const NEW = { 'X-SlashClient': 'launcher/0.9.22' };
const OLD = { 'X-SlashClient': 'launcher/0.9.21' };
const unlockedIds = (uuid: string) => [...app.achievements.store.unlocked(uuid).keys()];
const days = (from: number, n: number, step = 1) => Array.from({ length: n }, (_, i) => dayOf(from - i * step * DAY));

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, adminHandles: ['SzefEko'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('sparks and achievements', () => {
  it('says the currency in Polish and English forms', () => {
    assert.equal(sparksText(1), '1 Iskra');
    assert.equal(sparksText(3), '3 Iskry');
    assert.equal(sparksText(5), '5 Iskier');
    assert.equal(sparksText(12), '12 Iskier');
    assert.equal(sparksText(22), '22 Iskry');
    assert.equal(sparksText(0), '0 Iskier');
    assert.equal(sparksText(1, 'en'), '1 Spark');
    assert.equal(sparksText(40, 'en'), '40 Sparks');
  });

  it('has unique ids, sparks for each, and a shop that all achievements together buy only partly', () => {
    assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
    assert.ok(ACHIEVEMENTS.length >= 50);
    for (const a of ACHIEVEMENTS) assert.ok(a.sparks >= 5 && a.sparks <= 1000, a.id);
    const shop = ITEMS.filter((i) => i.price);
    assert.ok(shop.length >= 12);
    const total = shop.reduce((n, i) => n + i.price!, 0);
    assert.ok(TOTAL_SPARKS < total && TOTAL_SPARKS > total * 0.5, `${TOTAL_SPARKS} of ${total}`);
    // nothing free became paid, nothing earned is sold
    for (const i of shop) assert.equal(i.since, '0.9.22');
    assert.ok(!shop.some((i) => i.achievement || i.rank));
  });

  it('counts weekends, special days and anniversaries from the days played', () => {
    // Saturday 2026-10-17 and Sunday 2026-10-18 are one weekend; Sunday 2026-10-25 another
    assert.equal(weekends(['2026-10-17', '2026-10-18', '2026-10-25', '2026-10-20']), 2);
    assert.deepEqual(specialDays(['2027-01-01', '2026-11-13']), { newyear: 1, halloween: 0, friday13: 1 });
    assert.deepEqual(specialDays(['2026-10-31', '2026-10-13']), { newyear: 0, halloween: 1, friday13: 0 });
    const created = Date.UTC(2025, 9, 20, 12);
    assert.equal(anniversaryYears(['2026-10-19'], created), 0);
    assert.equal(anniversaryYears(['2026-10-20'], created), 1);
    assert.equal(anniversaryYears(['2027-10-21', '2026-01-01'], created), 2);
  });

  it('unlocks the play-time ones from play days, and pays each once', async () => {
    const sql = app.db.sql;
    const now = Date.UTC(2026, 9, 20, 15);
    const u = fakeUser(sql, 'Gracz1', now - 800 * DAY);
    const store = app.achievements.store;
    // 400 days in a row, 2.5 hours each = 1000 hours; one day of 12 hours; a New Year's Day, a Halloween and a Friday the 13th inside
    for (const d of days(now, 400)) store.addPlay(u, d, 2.5 * 3600);
    store.addPlay(u, dayOf(now - 3 * DAY), 12 * 3600);
    const fresh = app.achievements.check(u, now).map((a) => a.id);
    for (const id of ['hours_1', 'hours_250', 'hours_1000', 'days_30', 'days_100', 'days_365', 'longday_4', 'full_day', 'weekend_1', 'weekends_10',
      'anniversary_1', 'anniversary_2', 'streak_14', 'streak_60', 'streak_100', 'streak_365', 'new_year', 'halloween', 'friday13']) assert.ok(fresh.includes(id), id);
    assert.ok(!fresh.includes('night_owl'));
    const paid = ACHIEVEMENTS.filter((a) => fresh.includes(a.id)).reduce((n, a) => n + a.sparks, 0);
    assert.equal(app.wallet.balance(u), paid);
    // again: nothing new, nothing paid twice
    assert.deepEqual(app.achievements.check(u, now), []);
    assert.equal(app.wallet.balance(u), paid);
    assert.equal(app.wallet.ledger(u, 500).length, fresh.length);
  });

  it('a young account has no anniversary, and a day under 4 hours is not a long one', () => {
    const now = Date.UTC(2026, 9, 20, 15);
    const u = fakeUser(app.db.sql, 'Gracz2', now - 100 * DAY);
    app.achievements.store.addPlay(u, dayOf(now), 3.9 * 3600);
    const ids = app.achievements.check(u, now).map((a) => a.id);
    assert.ok(ids.includes('hours_1'));
    assert.ok(!ids.includes('longday_4') && !ids.includes('anniversary_1') && !ids.includes('weekends_10'));
  });

  it('gives the night owl for play time after midnight UTC, not in the day', () => {
    const owl = fakeUser(app.db.sql, 'NocnyMarek');
    const lark = fakeUser(app.db.sql, 'Skowronek');
    // the same achievements on the same tables, with a chosen list of who plays
    let who = owl;
    const solo = createAchievements({
      sql: app.db.sql, wallet: app.wallet, playing: () => new Map([[who, undefined]]), push: () => undefined,
      authed: () => '', areFriends: () => false, fail: () => { throw new Error('fail'); },
    });
    const night = Date.UTC(2026, 9, 20, 1, 0);
    solo.tick(night);
    solo.tick(night + 60_000);
    assert.ok(unlockedIds(owl).includes('night_owl'));
    who = lark;
    const noon = Date.UTC(2026, 9, 20, 12, 0);
    solo.tick(noon);
    solo.tick(noon + 60_000);
    assert.equal(app.achievements.store.counter(lark, 'night'), 0);
    assert.ok(!unlockedIds(lark).includes('night_owl'));
  });

  it('counts friends from the tables, and messages from before the counter once, capped per day like new ones', async () => {
    // a server from before the message counter, with messages written on many days
    const file = path.join(dir, 'counted.db');
    const first = createApp({ dbFile: file, publicUrl: 'http://localhost', allowDevLogin: true, oauth: {} });
    let sql = first.db.sql;
    const u = fakeUser(sql, 'Lubiany');
    for (let i = 0; i < 50; i++) first.db.addFriendship(u, fakeUser(sql, `Kumpel${i}`));
    const friend = fakeUser(sql, 'Rozmowca');
    const t0 = Date.UTC(2026, 0, 1, 12);
    // 40 days × 40 messages: 30 of each day count
    for (let d = 0; d < 40; d++) for (let i = 0; i < 40; i++) sql.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at) VALUES (?, ?, ?, ?)').run(u, friend, 'hej', t0 + d * DAY + i);
    // invites and waypoints were never counted as messages here
    sql.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at, invite) VALUES (?, ?, ?, ?, ?)').run(friend, u, 'skyup.pl', t0, '{"server":"skyup.pl"}');
    // group messages count too (not the groups' own lines), and a whole day of them is capped
    const v = fakeUser(sql, 'Grupowy');
    sql.prepare("INSERT INTO chat_groups (id, name, owner, clan, created_at) VALUES ('g_test1', 'G', ?, '', 0)").run(v);
    sql.prepare('INSERT INTO chat_group_members (group_id, uuid, joined_at) VALUES (?, ?, 0)').run('g_test1', v);
    for (let i = 0; i < 9; i++) sql.prepare("INSERT INTO chat_group_messages (group_id, from_uuid, text, created_at) VALUES ('g_test1', ?, 'x', ?)").run(v, t0 + i);
    for (let i = 0; i < 100; i++) sql.prepare("INSERT INTO chat_group_messages (group_id, from_uuid, text, created_at) VALUES ('g_test1', ?, 'x', ?)").run(v, t0 + DAY + i);
    sql.prepare("INSERT INTO chat_group_messages (group_id, from_uuid, text, event, created_at) VALUES ('g_test1', ?, '', '{}', 0)").run(v);
    sql.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at) VALUES (?, ?, ?, ?)').run(v, friend, 'hej', t0 + 2 * DAY);
    // someone who already has the big one keeps it
    sql.prepare("INSERT INTO achievements (uuid, id, unlocked_at) VALUES (?, 'messages_1000', ?)").run(friend, t0);
    await first.close();
    const raw = new DatabaseSync(file);
    raw.exec('DROP TABLE message_counts');
    raw.close();

    const second = createApp({ dbFile: file, publicUrl: 'http://localhost', allowDevLogin: true, oauth: {} });
    sql = second.db.sql;
    const counter = second.achievements.store.messages;
    assert.equal(counter.total(u), 40 * 30);
    assert.equal(counter.total(friend), 0);
    assert.equal(counter.total(v), 9 + 30 + 1);
    // the start's pass over everyone unlocks what the counts show
    second.achievements.checkAll();
    const ids = [...second.achievements.store.unlocked(u).keys()];
    for (const id of ['friend_1', 'friends_5', 'friends_10', 'friends_25', 'friends_50', 'message_1', 'messages_10', 'messages_100', 'messages_1000']) assert.ok(ids.includes(id), id);
    const vIds = [...second.achievements.store.unlocked(v).keys()];
    assert.ok(vIds.includes('messages_10'));
    assert.ok(vIds.includes('group_create'));
    assert.ok(second.achievements.store.unlocked(friend).has('messages_1000'));

    // after that, only what is counted when sent: rows put in the table by hand do not count
    for (let i = 0; i < 50; i++) sql.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at) VALUES (?, ?, ?, ?)').run(friend, u, 'hej', Date.now());
    assert.equal(counter.total(friend), 0);
    // a day holds 30, and the table is not filled again on the next start
    for (let i = 0; i < 35; i++) counter.count(friend);
    assert.equal(counter.day(friend), 30);
    await second.close();
    const third = createApp({ dbFile: file, publicUrl: 'http://localhost', allowDevLogin: true, oauth: {} });
    assert.equal(third.achievements.store.messages.total(friend), 30);
    assert.equal(third.achievements.store.messages.total(u), 40 * 30);
    await third.close();
  });

  it('unlocks the group ones for the founder and the members, and the waypoint and party ones', async () => {
    const ala = await login('AlaGrupa');
    const friends = [];
    for (let i = 0; i < 4; i++) {
      const f = await login(`Grupka${i}`);
      app.db.addFriendship(ala.user.id, f.user.id);
      friends.push(f);
    }
    assert.equal((await call('POST', '/v1/groups', ala.token, { name: 'Piątka', members: friends.map((f) => f.user.id) })).status, 200);
    assert.ok(unlockedIds(ala.user.id).includes('group_create'));
    assert.ok(unlockedIds(ala.user.id).includes('group_big'));
    // the members, checked as the group was made
    assert.ok(unlockedIds(friends[0].user.id).includes('group_join'));
    assert.ok(unlockedIds(friends[0].user.id).includes('group_big'));
    assert.ok(!unlockedIds(friends[0].user.id).includes('group_create'));
    // a waypoint, a party and joining it
    const wp = { to: [friends[0].user.id], name: 'Baza', x: 1, y: 64, z: 2, dimension: 'minecraft:overworld', world: 'server:skyup.pl' };
    assert.equal((await call('POST', '/v1/waypoints', ala.token, wp)).status, 200);
    assert.ok(unlockedIds(ala.user.id).includes('waypoint_1'));
    const party = (await call('POST', '/v1/parties', ala.token, { members: [friends[1].user.id], server: 'skyup.pl' })).body.party;
    assert.ok(unlockedIds(ala.user.id).includes('party_create'));
    assert.equal((await call('POST', `/v1/parties/${party.id}/accept`, friends[1].token)).status, 200);
    assert.ok(unlockedIds(friends[1].user.id).includes('party_join'));
    // 25 waypoints from before (messages with one) count as well
    const sql = app.db.sql;
    for (let i = 0; i < 25; i++) sql.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at, waypoint) VALUES (?, ?, ?, ?, ?)').run(friends[2].user.id, ala.user.id, 'wp', Date.now(), '{}');
    assert.ok(app.achievements.check(friends[2].user.id).some((a) => a.id === 'waypoints_25'));
  });

  it('unlocks the clan ones: founding, joining, ten members', async () => {
    const boss = await login('ShefKlanu');
    const member = await login('CzlonekKl');
    assert.equal((await call('POST', '/v1/clans', boss.token, { tag: 'ISK', name: 'Iskrownicy' })).status, 200);
    assert.ok(unlockedIds(boss.user.id).includes('clan_found'));
    assert.equal((await call('POST', '/v1/clans/invites', boss.token, { handle: member.user.handle })).status, 200);
    const clan = (await call('GET', '/v1/clans/mine', boss.token)).body.clan;
    assert.equal((await call('POST', `/v1/clans/${clan.id}/accept`, member.token)).status, 200);
    assert.ok(unlockedIds(member.user.id).includes('clan_join'));
    assert.ok(!unlockedIds(member.user.id).includes('clan_10'));
    // eight more (straight in the table): everyone in the clan gets "Clan power" with the next look
    const sql = app.db.sql;
    for (let i = 0; i < 8; i++) sql.prepare("INSERT INTO clan_members (uuid, clan_id, role, joined_at) VALUES (?, ?, 'member', 0)").run(fakeUser(sql, `Klanowy${i}`), clan.id);
    assert.ok(app.achievements.check(boss.user.id).some((a) => a.id === 'clan_10'));
    assert.ok(app.achievements.check(member.user.id).some((a) => a.id === 'clan_10'));
  });

  it('counts shared things from before the counters and keeps counting after they expire', () => {
    const sql = app.db.sql;
    const u = fakeUser(sql, 'Fotograf');
    const now = Date.now();
    // shared before this update: 9 screenshots, a profile by code, one in the cloud
    for (let i = 0; i < 9; i++) sql.prepare("INSERT INTO shared_media (id, owner, kind, type, size, width, height, created_at, expires_at) VALUES (?, ?, 'image', 'image/png', 1, 1, 1, ?, ?)").run(`m${i}${u.slice(0, 8)}`, u, now, now + DAY);
    sql.prepare('INSERT INTO profile_shares (code, owner, size, created_at, expires_at) VALUES (?, ?, 1, ?, ?)').run(`P${u.slice(0, 7)}`, u, now, now + DAY);
    sql.prepare("INSERT INTO cloud_profiles (owner, id, file, size, revision, created_at, updated_at) VALUES (?, 'p1', 'f', 1, 1, ?, ?)").run(u, now, now);
    const ids = app.achievements.check(u).map((a) => a.id);
    assert.ok(ids.includes('media_1') && ids.includes('share_1') && ids.includes('cloud_1'));
    assert.ok(!ids.includes('media_10'));
    // a tenth one (the request succeeded), then all of them expire: the count stays
    sql.prepare("INSERT INTO shared_media (id, owner, kind, type, size, width, height, created_at, expires_at) VALUES (?, ?, 'image', 'image/png', 1, 1, 1, ?, ?)").run(`m9${u.slice(0, 8)}`, u, now, now + DAY);
    app.achievements.after('POST', '/v1/media', u);
    assert.ok(unlockedIds(u).includes('media_10'));
    sql.prepare('DELETE FROM shared_media WHERE owner = ?').run(u);
    assert.equal(app.achievements.store.stats(u, now).media, 10);
    // a failed upload never reaches `after`; other paths count nothing
    app.achievements.after('GET', '/v1/media', u);
    assert.equal(app.achievements.store.counter(u, 'media'), 10);
  });

  it('counts at most one spray in 30 seconds', () => {
    const u = fakeUser(app.db.sql, 'Graficiarz');
    const t0 = Date.now();
    for (let i = 0; i < 300; i++) app.achievements.after('POST', '/v1/mc/spray', u, t0 + i * 1000);
    assert.equal(app.achievements.store.counter(u, 'sprays'), 10);
    assert.ok(unlockedIds(u).includes('spray_1'));
    for (let i = 0; i < 100; i++) app.achievements.after('POST', '/v1/mc/spray', u, t0 + 400_000 + i * 30_000);
    assert.ok(unlockedIds(u).includes('sprays_100'));
  });

  it('counts the cosmetics worn: the account\'s set or a character\'s', () => {
    const sql = app.db.sql;
    const u = fakeUser(sql, 'Elegancik');
    sql.prepare('UPDATE users SET cape = ?, loadout = ? WHERE uuid = ?').run('ocean', JSON.stringify({ wings: 'angel', trail: 'hearts', aura: 'glow', pet: 'bee' }), u);
    assert.ok(app.achievements.check(u).some((a) => a.id === 'wear_5'));
    const ten = { cape: 'ocean', wings: 'angel', trail: 'hearts', aura: 'glow', pet: 'bee', hat: 'crown', top: 'scarf', kill: 'blood', shoes: 'slippers', ring: 'ring_frost' };
    sql.prepare("INSERT INTO identities (provider, subject, uuid, label, loadout) VALUES ('minecraft', ?, ?, 'Postac', ?)").run(randomUUID().replace(/-/g, ''), u, JSON.stringify(ten));
    assert.ok(app.achievements.check(u).some((a) => a.id === 'wear_10'));
  });

  it('hides the secret ones until they unlock, from the player and from friends', async () => {
    const p = await login('Tajemniczy');
    const list = (await call('GET', '/v1/achievements', p.token)).body;
    const secret = list.achievements.find((a: any) => a.id === 'halloween');
    assert.equal(secret.name, '???');
    assert.equal(secret.hidden, true);
    assert.equal(secret.value, undefined);
    assert.match(secret.description, /Ukryte/);
    assert.ok(list.categories.includes('secret'));
    assert.equal(list.sparks.total, ACHIEVEMENTS.reduce((n, a) => n + a.sparks, 0));
    app.achievements.store.addPlay(p.user.id, '2025-10-31', 3600);
    app.achievements.check(p.user.id);
    const open = (await call('GET', '/v1/achievements', p.token)).body.achievements.find((a: any) => a.id === 'halloween');
    assert.equal(open.name, 'Cukierek albo psikus');
    assert.equal(open.sparks, 100);
  });

  it('shows shop items only to clients that know the shop, with price and ownership', async () => {
    const p = await login('Klient');
    const newer = (await call('GET', '/v1/cosmetics', p.token, undefined, NEW)).body;
    const cosmos = newer.items.find((i: any) => i.id === 'cosmos');
    assert.deepEqual([cosmos.price, cosmos.owned, cosmos.available], [1000, false, false]);
    assert.equal(newer.wallet.balance, 0);
    // a free item is still free and has no price
    assert.equal(newer.items.find((i: any) => i.id === 'ocean').price, undefined);
    assert.equal(newer.items.find((i: any) => i.id === 'ocean').available, true);
    for (const h of [OLD, { 'X-SlashClient': 'mod/0.9.21' }, {}]) {
      const items = (await call('GET', '/v1/cosmetics', p.token, undefined, h)).body.items;
      assert.ok(!items.some((i: any) => i.price || i.id === 'cosmos' || i.id === 'emberwings'));
    }
    // the website (a browser) sees everything
    const site = (await call('GET', '/v1/cosmetics', undefined, undefined, { 'User-Agent': 'Mozilla/5.0' })).body.items;
    assert.equal(site.find((i: any) => i.id === 'cosmos').price, 1000);
  });

  it('sells items: not enough sparks, achievement-only and free items refused, owned ones wearable', async () => {
    const p = await login('Kupiec');
    const live = await connect(p.token);
    assert.equal((await call('POST', '/v1/shop/emberwings/buy', p.token)).body.error, 'not_enough_sparks');
    assert.equal((await call('POST', '/v1/me', p.token, { loadout: { wings: 'emberwings' } })).body.error, 'bad_item');
    app.wallet.change(p.user.id, 1500, 'admin', '', 'test');
    assert.equal((await call('POST', '/v1/shop/veteran/buy', p.token)).body.error, 'not_for_sale');
    assert.equal((await call('POST', '/v1/shop/ocean/buy', p.token)).body.error, 'not_for_sale');
    assert.equal((await call('POST', '/v1/shop/staff_admin/buy', p.token)).body.error, 'not_for_sale');
    assert.equal((await call('POST', '/v1/shop/nothing_here/buy', p.token)).status, 404);
    assert.equal((await call('POST', '/v1/shop/cosmos/buy')).status, 401);
    const bought = await call('POST', '/v1/shop/emberwings/buy', p.token);
    assert.equal(bought.status, 200);
    // 1200 spent at once: "First purchase" and the hidden "Big spender" pay right away
    assert.equal(bought.body.balance, 300 + 20 + 100);
    assert.deepEqual(bought.body.item, { id: 'emberwings', slot: 'wings', name: 'Iskrzące' });
    const event = await live.waitFor((e) => e.type === 'wallet' && e.reason === 'purchase');
    assert.equal(event.change, -1200);
    // the first purchase is an achievement (paid at once)
    assert.ok(unlockedIds(p.user.id).includes('shop_1') && unlockedIds(p.user.id).includes('big_spender'));
    assert.equal((await call('POST', '/v1/shop/emberwings/buy', p.token)).body.error, 'owned');
    assert.equal((await call('POST', '/v1/me', p.token, { loadout: { wings: 'emberwings' } })).body.loadout.wings, 'emberwings');
    const item = (await call('GET', '/v1/cosmetics', p.token, undefined, NEW)).body.items.find((i: any) => i.id === 'emberwings');
    assert.deepEqual([item.owned, item.available], [true, true]);
    const wallet = (await call('GET', '/v1/wallet', p.token)).body;
    assert.equal(wallet.balance, 420);
    assert.deepEqual(wallet.ledger.map((e: any) => [e.reason, e.amount]), [['achievement', 100], ['achievement', 20], ['purchase', -1200], ['admin', 1500]]);
    assert.equal(wallet.ledger[2].label, 'Iskrzące');
    assert.equal(wallet.ledger[1].labelEn, 'First purchase');
    assert.equal(wallet.ledger[3].note, 'test');
    live.ws.close();
  });

  it('never spends twice: concurrent purchases leave the balance at zero or above', async () => {
    const p = await login('Rownolegly');
    app.wallet.change(p.user.id, 1000, 'admin', '', 'test');
    // 1000 sparks: cosmos (1000) or two of the 500 capes, never all three
    const tries = await Promise.all(['cosmos', 'obsidian', 'coral', 'cosmos', 'obsidian'].map((id) => call('POST', `/v1/shop/${id}/buy`, p.token)));
    const ok = tries.filter((r) => r.status === 200);
    const spent = ok.reduce((n, r) => n + ({ cosmos: 1000, obsidian: 500, coral: 500 } as Record<string, number>)[r.body.item.id], 0);
    assert.ok(spent <= 1000 && ok.length >= 1);
    for (const r of tries.filter((t) => t.status !== 200)) assert.ok(['not_enough_sparks', 'owned'].includes(r.body.error), r.body.error);
    const balance = app.wallet.balance(p.user.id);
    assert.ok(balance >= 0);
    // what is left is exactly what came in less what was spent (plus the shop achievement)
    const earned = app.wallet.ledger(p.user.id).filter((e) => e.reason === 'achievement').reduce((n, e) => n + e.amount, 0);
    assert.equal(balance, 1000 - spent + earned);
    // the same item bought at once twice: one purchase only
    const q = await login('Podwojny');
    app.wallet.change(q.user.id, 5000, 'admin', '', 'test');
    const twice = await Promise.all([1, 2, 3].map(() => call('POST', '/v1/shop/regal/buy', q.token)));
    assert.equal(twice.filter((r) => r.status === 200).length, 1);
    assert.equal(app.wallet.purchases(q.user.id).count, 1);
    // the table itself refuses a negative balance
    assert.equal(app.wallet.change(q.user.id, -1_000_000, 'admin'), undefined);
  });

  it('gives Collector and Big spender for five purchases worth 1000', async () => {
    const p = await login('Kolekcjoner');
    app.wallet.change(p.user.id, 10_000, 'admin', '', 'test');
    for (const id of ['spray_spark', 'spray_trophy', 'ring_ocean', 'acid', 'glacier']) assert.equal((await call('POST', `/v1/shop/${id}/buy`, p.token)).status, 200);
    const ids = unlockedIds(p.user.id);
    assert.ok(ids.includes('shop_1') && ids.includes('shop_5') && ids.includes('big_spender'));
  });

  it('lets only admins give and take sparks, with a reason, in the admin log, and change prices', async () => {
    const boss = await login('SzefEko');
    const p = await login('Obdarowany');
    assert.equal((await call('POST', `/v1/admin/users/${p.user.id}/wallet`, p.token, { amount: 100, reason: 'test' })).status, 403);
    assert.equal((await call('GET', `/v1/admin/users/${p.user.id}/wallet`, p.token)).status, 403);
    assert.equal((await call('POST', `/v1/admin/users/${p.user.id}/wallet`, boss.token, { amount: 100 })).body.error, 'bad_reason');
    assert.equal((await call('POST', `/v1/admin/users/${p.user.id}/wallet`, boss.token, { amount: 0, reason: 'nic' })).body.error, 'bad_amount');
    assert.equal((await call('POST', `/v1/admin/users/${p.user.id}/wallet`, boss.token, { amount: 1e9, reason: 'dużo' })).body.error, 'bad_amount');
    const given = (await call('POST', `/v1/admin/users/${p.user.id}/wallet`, boss.token, { amount: 250, reason: 'Wygrana w konkursie' })).body;
    assert.equal(given.balance, 250);
    assert.equal(given.ledger[0].note, 'Wygrana w konkursie');
    assert.equal(given.ledger[0].by, 'SzefEko');
    assert.equal((await call('POST', `/v1/admin/users/${p.user.id}/wallet`, boss.token, { amount: -300, reason: 'Za dużo' })).body.error, 'not_enough_sparks');
    assert.equal((await call('POST', `/v1/admin/users/${p.user.id}/wallet`, boss.token, { amount: -50, reason: 'Korekta' })).body.balance, 200);
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries;
    assert.ok(log.some((e: any) => e.action === 'sparks_give' && e.detail === '+250: Wygrana w konkursie'));
    assert.ok(log.some((e: any) => e.action === 'sparks_take' && e.detail === '-50: Korekta'));
    // prices: the list, a change that the shop follows, and back to the default
    const shop = (await call('GET', '/v1/admin/shop', boss.token)).body.items;
    assert.ok(shop.some((i: any) => i.id === 'spray_spark' && i.price === 200));
    assert.equal((await call('POST', '/v1/admin/shop/spray_spark', p.token, { price: 1 })).status, 403);
    assert.equal((await call('POST', '/v1/admin/shop/nothing_here', boss.token, { price: 10 })).status, 404);
    // only an achievement gives it: never sold
    assert.equal((await call('POST', '/v1/admin/shop/veteran', boss.token, { price: 10 })).body.error, 'not_sellable');
    assert.equal((await call('POST', '/v1/admin/shop/spray_spark', boss.token, { price: 0 })).body.error, 'bad_price');
    assert.equal((await call('POST', '/v1/admin/shop/spray_spark', boss.token, { price: 150 })).body.price, 150);
    assert.equal((await call('POST', '/v1/shop/spray_spark/buy', p.token)).body.balance, 200 - 150 + 20);
    assert.equal((await call('POST', '/v1/admin/shop/spray_spark', boss.token, { reset: true })).body.price, 200);
  });
});

describe('sparks for players from before the update', () => {
  it('pays old achievements once, unlocks what the data already shows, and tells it as one summary', async () => {
    const file = path.join(dir, 'old.db');
    // the server as it was: some players with achievements, nothing paid
    const first = createApp({ dbFile: file, publicUrl: 'http://localhost', allowDevLogin: true, oauth: {} });
    const sql = first.db.sql;
    const now = Date.now();
    const old = fakeUser(sql, 'Weteranek', now - 30 * DAY);
    const idle = fakeUser(sql, 'Nieobecny', now - 30 * DAY);
    for (let i = 0; i < 5; i++) first.db.addFriendship(idle, fakeUser(sql, `Znajomy${i}`));
    await first.close();
    const raw = new DatabaseSync(file);
    raw.exec('PRAGMA foreign_keys = ON');
    raw.exec('DELETE FROM sparks_ledger; DELETE FROM sparks_wallets; DELETE FROM achievements;');
    for (const [id, at] of [['hours_10', now - 5 * DAY], ['hours_100', now - 2 * DAY], ['friend_1', now - 9 * DAY]] as const) {
      raw.prepare('INSERT INTO achievements (uuid, id, unlocked_at) VALUES (?, ?, ?)').run(old, id, at);
    }
    raw.prepare("INSERT INTO cape_grants (uuid, cape) VALUES (?, 'veteran')").run(old);
    raw.close();

    // the update starts: old achievements paid, the idle player's five friends unlock two without them playing
    const second = createApp({ dbFile: file, publicUrl: 'http://localhost', allowDevLogin: true, oauth: {} });
    const pay = (ids: string[]) => ACHIEVEMENTS.filter((a) => ids.includes(a.id)).reduce((n, a) => n + a.sparks, 0);
    assert.equal(second.wallet.balance(old), pay(['hours_10', 'hours_100', 'friend_1']));
    assert.deepEqual(second.wallet.ledger(old).map((e) => e.ref).sort(), ['friend_1', 'hours_10', 'hours_100']);
    // paid at the time it was earned, and the cape is still theirs
    assert.equal(second.wallet.ledger(old).find((e) => e.ref === 'hours_100')!.at, now - 2 * DAY);
    assert.ok(second.db.grants(old).includes('veteran'));
    assert.deepEqual([...second.achievements.store.unlocked(idle).keys()].sort(), ['friend_1', 'friends_5']);
    assert.equal(second.wallet.balance(idle), pay(['friend_1', 'friends_5']));
    // the launcher shows it once: "+N sparks for X achievements"
    assert.deepEqual(second.wallet.unseen(old), { count: 3, amount: pay(['hours_10', 'hours_100', 'friend_1']) });
    second.wallet.markSeen(old);
    assert.deepEqual(second.wallet.unseen(old), { count: 0, amount: 0 });
    // every start after that: nothing paid or unlocked twice
    assert.deepEqual(second.achievements.backfill(), { paid: 0, unlocked: 0 });
    await second.close();
    const third = createApp({ dbFile: file, publicUrl: 'http://localhost', allowDevLogin: true, oauth: {} });
    assert.equal(third.wallet.balance(old), pay(['hours_10', 'hours_100', 'friend_1']));
    assert.equal(third.wallet.ledger(old).length, 3);
    assert.equal(third.wallet.ledger(idle).length, 2);
    await third.close();
  });

  it('sends one summary for many unlocks at once, with the single events marked quiet', async () => {
    const p = await login('Hurtowy');
    const live = await connect(p.token);
    const now = Date.now();
    for (const d of days(now, 8)) app.achievements.store.addPlay(p.user.id, d, 3 * 3600);
    const fresh = app.achievements.check(p.user.id, now);
    assert.ok(fresh.length > 2);
    const summary = await live.waitFor((e) => e.type === 'achievements-summary');
    assert.equal(summary.count, fresh.length);
    assert.equal(summary.sparks, fresh.reduce((n, a) => n + a.sparks, 0));
    const singles = live.events.filter((e) => e.type === 'achievement');
    assert.equal(singles.length, fresh.length);
    assert.ok(singles.every((e) => e.quiet === true && e.achievement.sparks > 0));
    const wallet = await live.waitFor((e) => e.type === 'wallet' && e.reason === 'achievement');
    assert.equal(wallet.balance, summary.sparks);
    // one more alone: a normal notice
    app.db.addFriendship(p.user.id, fakeUser(app.db.sql, 'Pojedynczy'));
    app.achievements.check(p.user.id, now);
    const single = await live.waitFor((e) => e.type === 'achievement' && e.achievement.id === 'friend_1');
    assert.equal(single.quiet, undefined);
    live.ws.close();
  });
});
