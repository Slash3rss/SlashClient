import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { ACHIEVEMENTS, METRICS, createAchievements, dayOf } from '../src/achievements.ts';
import { FORMERLY_FREE_CAPES, ITEMS, mayWear } from '../src/cosmetics.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-free-capes-'));
const file = path.join(dir, 'old.db');
const ORIGINAL = ['slash', 'ocean', 'ember', 'forest', 'galaxy', 'rose', 'gold', 'mono'];
const DAY = 86_400_000;
let app: ReturnType<typeof createApp>;
let base = '';
let oldOne = '';
let oldTwo = '';

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };
const wearable = (uuid: string, id: string) => mayWear(app.db.cosmeticSettings(), app.db.grants(uuid), id);
const kept = (uuid: string) => (app.db.sql.prepare('SELECT cape FROM cape_grants_kept WHERE uuid = ? ORDER BY cape').all(uuid) as { cape: string }[]).map((r) => r.cape);

async function start() {
  app = createApp({ dbFile: file, publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {} });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

before(async () => {
  // a database from before 0.9.69: two accounts, one wearing a cape that was free then, one with an admin's grant of another
  const sql = new DatabaseSync(file);
  sql.exec(`CREATE TABLE users (uuid TEXT PRIMARY KEY, handle TEXT NOT NULL, handle_lower TEXT NOT NULL UNIQUE, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '',
    show_server INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, cape TEXT NOT NULL DEFAULT '');
    CREATE TABLE cape_grants (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, cape TEXT NOT NULL, PRIMARY KEY (uuid, cape));`);
  oldOne = randomUUID();
  oldTwo = randomUUID();
  const at = Date.now() - 300 * DAY;
  sql.prepare('INSERT INTO users (uuid, handle, handle_lower, name, created_at, last_seen, cape) VALUES (?, ?, ?, ?, ?, ?, ?)').run(oldOne, 'Dawny', 'dawny', 'Dawny', at, at, 'aurora');
  sql.prepare('INSERT INTO users (uuid, handle, handle_lower, name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)').run(oldTwo, 'Dawna', 'dawna', 'Dawna', at, at);
  sql.prepare('INSERT INTO cape_grants (uuid, cape) VALUES (?, ?)').run(oldTwo, 'storm');
  sql.close();
  await start();
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the capes free until 0.9.69', () => {
  it('leaves only the original eight free, the rest earned with achievements or sold', () => {
    const free = ITEMS.filter((i) => i.slot === 'cape' && !i.rank && !i.achievement && !i.price && !i.supporter).map((i) => i.id);
    assert.deepEqual(free.sort(), [...ORIGINAL].sort());
    assert.equal(FORMERLY_FREE_CAPES.length, 19);
    for (const id of FORMERLY_FREE_CAPES) {
      const it = ITEMS.find((i) => i.id === id)!;
      if (it.achievement) assert.equal(ACHIEVEMENTS.find((a) => a.id === it.achievement)?.reward, id, id);
      else assert.ok(it.price && it.price >= 200, id);
    }
    assert.deepEqual(ITEMS.filter((i) => (FORMERLY_FREE_CAPES as readonly string[]).includes(i.id) && i.price).map((i) => [i.id, i.price]), [['waves', 300], ['pulse', 300], ['desert', 200], ['cyber', 250]]);
  });

  it('keeps every one of them for the accounts from before, the worn one too', () => {
    for (const uuid of [oldOne, oldTwo]) {
      for (const id of FORMERLY_FREE_CAPES) assert.ok(wearable(uuid, id), `${uuid} ${id}`);
      for (const id of ORIGINAL) assert.ok(wearable(uuid, id));
    }
    assert.equal(app.db.user(oldOne)?.cape, 'aurora');
    // the admin's grant from before is the player's own (it counts for the collection), the others are only kept
    assert.equal(kept(oldOne).length, 19);
    assert.ok(!kept(oldTwo).includes('storm') && kept(oldTwo).length === 18);
    assert.ok(app.db.sql.prepare("SELECT 1 FROM data_migrations WHERE id = 'free-capes-0.9.69'").get());
  });

  it('gives a new account only the original eight for free', async () => {
    const p = await login('Nowicjusz');
    const items = (await call('GET', '/v1/cosmetics', p.token, undefined, { 'X-SlashClient': 'launcher/0.9.69' })).body.items as any[];
    const free = items.filter((i) => i.slot === 'cape' && i.available).map((i) => i.id);
    assert.deepEqual(free.sort(), [...ORIGINAL].sort());
    const sakura = items.find((i) => i.id === 'sakura');
    assert.deepEqual([sakura.available, sakura.achievement], [false, 'invites_1']);
    assert.match(sakura.hint, /Ktoś z polecenia/);
    assert.deepEqual([items.find((i) => i.id === 'waves').price, items.find((i) => i.id === 'waves').owned], [300, false]);
    // the night cape's achievement is hidden: so is how to get it
    assert.match(items.find((i) => i.id === 'night').hint, /Ukryte/);
    // a launcher from before the shop gets no prices, the capes are only locked
    const older = (await call('GET', '/v1/cosmetics', p.token, undefined, { 'X-SlashClient': 'launcher/0.9.2' })).body.items as any[];
    const waves = older.find((i) => i.id === 'waves');
    assert.deepEqual([waves.available, waves.price], [false, undefined]);
    // it cannot put one on
    assert.equal((await call('POST', '/v1/me', p.token, { cape: 'aurora' })).body.error, 'bad_cape');
    assert.equal((await call('POST', '/v1/me', p.token, { cape: 'ocean' })).status, 200);
    // the shop sells the four
    app.wallet.change(p.user.id, 300, 'admin', '', 'test');
    assert.equal((await call('POST', '/v1/shop/waves/buy', p.token)).status, 200);
    assert.equal((await call('POST', '/v1/me', p.token, { cape: 'waves' })).status, 200);
    assert.equal((await call('POST', '/v1/shop/sakura/buy', p.token)).body.error, 'not_for_sale');
  });

  it('runs once: a restart grants nothing again, and accounts made after it get nothing', async () => {
    const p = await login('PoZmianie');
    const before = (app.db.sql.prepare('SELECT COUNT(*) AS n FROM cape_grants').get() as { n: number }).n;
    await app.close();
    await start();
    assert.equal(app.db.keepFormerlyFree(FORMERLY_FREE_CAPES), 0);
    assert.equal((app.db.sql.prepare('SELECT COUNT(*) AS n FROM cape_grants').get() as { n: number }).n, before);
    assert.ok(!wearable(p.user.id, 'aurora'));
    assert.ok(wearable(oldOne, 'aurora'));
  });

  it('lets an achievement give a cape the account kept, without trouble, and then it counts as got', () => {
    const now = Date.now();
    for (let d = 0; d < 3; d++) app.achievements.store.addPlay(oldOne, dayOf(now - d * DAY), 4 * 3600);
    const fresh = app.achievements.check(oldOne, now).map((a) => a.id);
    assert.ok(fresh.includes('hours_10'));
    assert.ok(wearable(oldOne, 'storm'));
    assert.ok(!kept(oldOne).includes('storm'));
    assert.equal(app.achievements.store.stats(oldOne, now).owned, 1);
  });
});

describe('the new achievements', () => {
  it('has a metric for every new group, for achievements made in the admin panel', () => {
    for (const g of ['invites', 'invited', 'challenges', 'challenge_weeks', 'earned', 'owned', 'early', 'christmas']) assert.ok(g in METRICS, g);
    const ids = ACHIEVEMENTS.map((a) => a.id);
    for (const id of ['invites_1', 'invites_3', 'invites_5', 'invites_10', 'invites_25', 'challenges_10', 'challenges_50', 'challenges_200', 'challenge_week',
      'sparks_1000', 'sparks_5000', 'sparks_20000', 'collector_10', 'collector_25', 'collector_50', 'invited_by_friend', 'early_bird']) assert.ok(ids.includes(id), id);
    for (const [id, reward] of [['hours_10', 'storm'], ['days_30', 'inferno'], ['friends_5', 'ice'], ['servers_10', 'lava'], ['night_owl', 'night']]) {
      assert.equal(ACHIEVEMENTS.find((a) => a.id === id)?.reward, reward);
    }
    assert.ok(ACHIEVEMENTS.filter((a) => a.category === 'invites').length >= 5);
  });

  it('counts sparks earned (not the admins\' gifts) and gives the honey cape', async () => {
    const p = await login('Zbieracz');
    const now = Date.now();
    app.wallet.change(p.user.id, 5000, 'admin', '', 'test');
    assert.ok(!app.achievements.check(p.user.id, now).some((a) => a.id === 'sparks_1000'));
    app.wallet.change(p.user.id, 1000, 'challenge', 'd:2026-01-01:test', 'test');
    assert.ok(app.achievements.check(p.user.id, now).some((a) => a.id === 'sparks_1000'));
    assert.ok(wearable(p.user.id, 'honey'));
  });

  it('counts cosmetics got for the collection', async () => {
    const p = await login('Kolekcjoner');
    for (const id of ['cosmos', 'thunder', 'regal', 'coral']) app.db.grant(p.user.id, id);
    assert.ok(!app.achievements.check(p.user.id).some((a) => a.id === 'collector_5'));
    app.db.grant(p.user.id, 'obsidian');
    // a grant of something that is not in the catalog any more does not count
    app.db.grant(p.user.id, 'gone_item');
    assert.equal(app.achievements.store.stats(p.user.id, Date.now()).owned, 5);
    assert.ok(app.achievements.check(p.user.id).some((a) => a.id === 'collector_5'));
  });

  it('counts challenges done and full weeks, from the ledger too', async () => {
    const p = await login('Wyzwaniowiec');
    for (let i = 0; i < 10; i++) app.wallet.change(p.user.id, 5, 'challenge', `d:2026-01-${String(i + 1).padStart(2, '0')}:x`, 'test');
    app.wallet.change(p.user.id, 5, 'challenge', 'w:2026-01-05:*', 'test');
    const s = app.achievements.store.stats(p.user.id, Date.now());
    assert.deepEqual([s.challenges, s.challengeWeeks], [10, 1]);
    const ids = app.achievements.check(p.user.id).map((a) => a.id);
    assert.ok(ids.includes('challenges_10') && ids.includes('challenge_week'));
    assert.ok(wearable(p.user.id, 'checker') && wearable(p.user.id, 'mint'));
  });

  it('gives the early bird for play between 5 and 7 UTC', async () => {
    const p = await login('Skowronek2');
    const solo = createAchievements({
      sql: app.db.sql, wallet: app.wallet, playing: () => new Map([[p.user.id, undefined]]), push: () => undefined,
      authed: () => '', areFriends: () => false, fail: () => { throw new Error('fail'); },
    });
    const noon = Date.UTC(2026, 9, 20, 12);
    solo.tick(noon);
    solo.tick(noon + 60_000);
    assert.equal(app.achievements.store.counter(p.user.id, 'early'), 0);
    const morning = Date.UTC(2026, 9, 21, 5, 30);
    solo.tick(morning);
    solo.tick(morning + 60_000);
    assert.ok(app.achievements.store.unlocked(p.user.id).has('early_bird'));
  });
});
