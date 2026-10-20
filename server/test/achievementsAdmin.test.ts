import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { ACHIEVEMENTS, METRICS, type Achievement } from '../src/achievements.ts';
import { item, mayWear } from '../src/cosmetics.ts';
import type { CosmeticSetting } from '../src/db.ts';
import { howToGet } from '../src/obtain.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-ach-admin-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-SlashClient': 'launcher/0.9.22', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; handle: string } };

function fakeUser(sql: DatabaseSync, name: string): string {
  const uuid = randomUUID();
  sql.prepare('INSERT INTO users (uuid, handle, handle_lower, name, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uuid, name, name.toLowerCase(), name, '', Date.now(), Date.now());
  return uuid;
}
const befriend = (sql: DatabaseSync, a: string, n: number) => {
  for (let i = 0; i < n; i++) sql.prepare('INSERT INTO friendships (a, b, created_at) VALUES (?, ?, ?)').run(a, fakeUser(sql, `Kolega${randomUUID().slice(0, 8)}`), Date.now());
};
const has = (uuid: string, id: string) => app.achievements.store.unlocked(uuid).has(id);
const paidFor = (uuid: string, id: string) => ({ ...(app.db.sql.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM sparks_ledger WHERE uuid = ? AND reason = 'achievement' AND ref = ?").get(uuid, id) as { n: number; s: number }) });

let boss: { token: string; user: { id: string; handle: string } };

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, adminHandles: ['SzefKreator'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  boss = await login('SzefKreator');
});
after(async () => {
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const auto = (id: string, extra: Record<string, unknown> = {}) => ({
  id, metric: 'friends', goal: 3, sparks: 77, category: 'social', icon: 'fa-crown', name: 'Trójka', nameEn: 'Three', description: 'Miej 3 znajomych.', descriptionEn: 'Have 3 friends.', ...extra,
});

describe('the achievement creator', () => {
  it('is for admins only', async () => {
    const p = await login('ZwyklyGracz');
    assert.equal((await call('GET', '/v1/admin/achievements', p.token)).status, 403);
    assert.equal((await call('POST', '/v1/admin/achievements', p.token, auto('nope_one'))).status, 403);
    assert.equal((await call('POST', '/v1/admin/achievements/hours_1', p.token, { goal: 1 })).status, 403);
    assert.equal((await call('GET', '/v1/admin/achievements')).status, 401);
    const res = await call('GET', '/v1/admin/achievements', boss.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.achievements.length, ACHIEVEMENTS.length);
    assert.ok(res.body.metrics.some((m: any) => m.id === 'hours'));
    assert.ok(!res.body.metrics.some((m: any) => m.id === 'manual'));
    assert.ok(res.body.icons.includes('fa-trophy'));
  });

  it('checks the id, the metric, the goal, the icon and the reward', async () => {
    const bad = async (body: unknown) => (await call('POST', '/v1/admin/achievements', boss.token, body)).body.error;
    assert.equal(await bad(auto('X')), 'bad_id');
    assert.equal(await bad(auto('a b')), 'bad_id');
    assert.equal(await bad(auto('hours_1')), 'id_taken');
    assert.equal(await bad(auto('cheat_one', { metric: 'client_kills' })), 'bad_metric');
    assert.equal(await bad(auto('cheat_two', { metric: undefined })), 'bad_metric');
    assert.equal(await bad(auto('goal_zero', { goal: 0 })), 'bad_goal');
    assert.equal(await bad(auto('goal_big', { metric: 'longday', goal: METRICS.longday.max + 1 })), 'bad_goal');
    assert.equal(await bad(auto('goal_half', { goal: 1.5 })), 'bad_goal');
    assert.equal(await bad(auto('icon_bad', { icon: 'fa-not-a-thing' })), 'bad_icon');
    assert.equal(await bad(auto('reward_bad', { reward: 'no_such_item' })), 'bad_reward');
    assert.equal(await bad(auto('sparks_bad', { sparks: -5 })), 'bad_sparks');
    assert.equal(await bad(auto('name_empty', { name: '  ' })), 'bad_name');
    assert.equal(await bad(auto('cat_bad', { category: 'nowhere' })), 'bad_category');
    // the same id twice
    assert.equal((await call('POST', '/v1/admin/achievements', boss.token, auto('twice_one'))).status, 200);
    assert.equal((await call('POST', '/v1/admin/achievements', boss.token, auto('twice_one'))).status, 409);
  });

  it('unlocks a new automatic one at once for who has reached it, pays once, and shows it to players', async () => {
    const sql = app.db.sql;
    const p = await login('Towarzyski');
    befriend(sql, p.user.id, 4);
    const res = await call('POST', '/v1/admin/achievements', boss.token, auto('three_friends', { reward: 'ocean' }));
    assert.equal(res.status, 200);
    assert.ok(res.body.unlocked >= 1);
    assert.ok(has(p.user.id, 'three_friends'));
    assert.deepEqual(paidFor(p.user.id, 'three_friends'), { n: 1, s: 77 });
    const mine = (await call('GET', '/v1/achievements', p.token)).body;
    const v = mine.achievements.find((a: any) => a.id === 'three_friends');
    assert.equal(v.icon, 'fa-crown');
    assert.equal(v.custom, true);
    assert.equal(v.reward.id, 'ocean');
    assert.ok(mine.sparks.total >= 77);
    // a changed reward pays nobody again
    await call('POST', '/v1/admin/achievements/three_friends', boss.token, { sparks: 500 });
    app.achievements.checkAll();
    assert.deepEqual(paidFor(p.user.id, 'three_friends'), { n: 1, s: 77 });
    // the log says what was done
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries.map((e: any) => e.action);
    assert.ok(log.includes('ach_create') && log.includes('ach_edit'));
  });

  it('changes a built-in one apart from the code, lowers and raises its goal, and goes back to default', async () => {
    const sql = app.db.sql;
    const p = await login('Prawie');
    befriend(sql, p.user.id, 4);
    app.achievements.check(p.user.id);
    assert.ok(!has(p.user.id, 'friends_5'));
    // lowered: unlocked with the payout right away
    const res = await call('POST', '/v1/admin/achievements/friends_5', boss.token, { goal: 4, name: 'Czwórka', icon: 'fa-star' });
    assert.equal(res.status, 200);
    const edited = res.body.achievements.find((a: any) => a.id === 'friends_5');
    assert.equal(edited.overridden, true);
    assert.equal(edited.defaults.goal, 5);
    assert.ok(has(p.user.id, 'friends_5'));
    assert.equal(paidFor(p.user.id, 'friends_5').n, 1);
    const seen = (await call('GET', '/v1/achievements', p.token)).body.achievements.find((a: any) => a.id === 'friends_5');
    assert.equal(seen.name, 'Czwórka');
    assert.equal(seen.icon, 'fa-star');
    // raised: who has it keeps it
    await call('POST', '/v1/admin/achievements/friends_5', boss.token, { goal: 40 });
    app.achievements.checkAll();
    assert.ok(has(p.user.id, 'friends_5'));
    assert.equal((await call('POST', '/v1/admin/achievements/friends_5', boss.token, { goal: METRICS.friends.max + 1 })).body.error, 'bad_goal');
    // a built-in one cannot count something else
    await call('POST', '/v1/admin/achievements/friends_5', boss.token, { metric: 'hours' });
    assert.equal(app.achievements.registry.get('friends_5')!.group, 'friends');
    // back to default
    const reset = await call('POST', '/v1/admin/achievements/friends_5/reset', boss.token);
    const back = reset.body.achievements.find((a: any) => a.id === 'friends_5');
    assert.equal(back.overridden, false);
    assert.equal(back.goal, 5);
    assert.equal(back.name, ACHIEVEMENTS.find((a) => a.id === 'friends_5')!.name);
    assert.ok(has(p.user.id, 'friends_5'));
  });

  it('does not award a switched-off one, and hides it from who does not have it', async () => {
    const sql = app.db.sql;
    await call('POST', '/v1/admin/achievements/friends_10', boss.token, { enabled: false });
    const p = await login('Wylaczony');
    befriend(sql, p.user.id, 11);
    app.achievements.check(p.user.id);
    assert.ok(!has(p.user.id, 'friends_10'));
    assert.ok(has(p.user.id, 'friend_1'));
    const mine = (await call('GET', '/v1/achievements', p.token)).body.achievements;
    assert.ok(!mine.some((a: any) => a.id === 'friends_10'));
    // switched on again: unlocked at once
    await call('POST', '/v1/admin/achievements/friends_10', boss.token, { enabled: true });
    assert.ok(has(p.user.id, 'friends_10'));
  });

  it('gives and takes a manual one by nick, without the sparks unless asked, and keeps the paid one paid', async () => {
    const res = await call('POST', '/v1/admin/achievements', boss.token, { id: 'helper', metric: 'manual', sparks: 300, category: 'community', name: 'Pomocnik', description: 'Pomógł przy testach.', reward: 'veteran' });
    assert.equal(res.status, 200);
    const made = res.body.achievements.find((a: any) => a.id === 'helper');
    assert.equal(made.manual, true);
    assert.equal(made.goal, 1);
    const p = await login('Pomocny');
    const q = await login('Drugi');
    // automatic ones cannot be given by hand
    assert.equal((await call('POST', '/v1/admin/achievements/hours_1/grant', boss.token, { players: [p.user.handle] })).body.error, 'not_manual');
    const g = (await call('POST', '/v1/admin/achievements/helper/grant', boss.token, { players: [`@${p.user.handle}`, q.user.handle, 'NikogoTakiego'] })).body;
    assert.deepEqual(g.granted.sort(), [p.user.handle, q.user.handle].sort());
    assert.deepEqual(g.unknown, ['NikogoTakiego']);
    assert.equal((await call('POST', '/v1/admin/achievements/helper/grant', boss.token, { players: [p.user.handle] })).body.had[0], p.user.handle);
    assert.equal(paidFor(p.user.id, 'helper').s, 300);
    assert.ok(app.db.grants(p.user.id).includes('veteran'));
    // taken without a clawback: the sparks stay
    const balance = app.wallet.balance(p.user.id);
    assert.equal((await call('POST', '/v1/admin/achievements/helper/revoke', boss.token, { player: p.user.handle })).body.taken, 0);
    assert.ok(!has(p.user.id, 'helper'));
    assert.equal(app.wallet.balance(p.user.id), balance);
    // given again: no second payout
    await call('POST', '/v1/admin/achievements/helper/grant', boss.token, { players: [p.user.handle] });
    assert.equal(app.wallet.balance(p.user.id), balance);
    // with a clawback: what it paid comes off (and its cosmetic), never below zero
    const r = (await call('POST', '/v1/admin/achievements/helper/revoke', boss.token, { player: q.user.handle, clawback: true })).body;
    assert.equal(r.taken, Math.min(300, r.taken));
    assert.ok(r.taken > 0);
    assert.ok(app.wallet.balance(q.user.id) >= 0);
    assert.ok(!app.db.grants(q.user.id).includes('veteran'));
    assert.equal((await call('POST', '/v1/admin/achievements/helper/revoke', boss.token, { player: q.user.handle })).body.error, 'not_held');
    // the holders' list
    const holders = (await call('GET', '/v1/admin/achievements/helper/holders', boss.token)).body.holders;
    assert.deepEqual(holders.map((h: any) => h.handle), [p.user.handle]);
  });

  it('shows panel-made ones on public profiles with their icon and the balance, never a hidden one before it unlocks', async () => {
    await call('POST', '/v1/admin/achievements', boss.token, { id: 'secret_handshake', metric: 'manual', sparks: 40, category: 'secret', hidden: true, icon: 'fa-key', name: 'Tajny uścisk', description: 'Sekret.' });
    await call('POST', '/v1/admin/achievements', boss.token, { id: 'open_one', metric: 'manual', sparks: 15, category: 'play', icon: 'fa-gift', name: 'Jawne', description: 'Widać je.' });
    const p = await login('ProfilowyGracz');
    await call('POST', '/v1/admin/achievements/open_one/grant', boss.token, { players: [p.user.handle] });
    const viewer = await login('Ogladajacy');
    const prof = (await call('GET', `/v1/profiles/${p.user.handle}`, viewer.token)).body.profile;
    const list = prof.achievements.list;
    assert.ok(!list.some((a: any) => a.id === 'secret_handshake'));
    const open = list.find((a: any) => a.id === 'open_one');
    assert.equal(open.icon, 'fa-gift');
    assert.ok(open.unlockedAt);
    assert.equal(prof.stats.sparks, app.wallet.balance(p.user.id));
    // unlocked: now it is there
    await call('POST', '/v1/admin/achievements/secret_handshake/grant', boss.token, { players: [p.user.handle] });
    const after = (await call('GET', `/v1/profiles/${p.user.handle}`, viewer.token)).body.profile.achievements.list;
    assert.equal(after.find((a: any) => a.id === 'secret_handshake').icon, 'fa-key');
  });

  it('deletes only a panel-made one nobody has', async () => {
    assert.equal((await call('DELETE', '/v1/admin/achievements/hours_1', boss.token)).body.error, 'built_in');
    assert.equal((await call('DELETE', '/v1/admin/achievements/helper', boss.token)).status, 409);
    await call('POST', '/v1/admin/achievements', boss.token, { id: 'nobody_has', metric: 'manual', sparks: 5, category: 'play', name: 'Nikt', description: 'Nikt tego nie ma.' });
    const res = await call('DELETE', '/v1/admin/achievements/nobody_has', boss.token);
    assert.equal(res.status, 200);
    assert.ok(!res.body.achievements.some((a: any) => a.id === 'nobody_has'));
  });
});

describe('how a cosmetic can be got', () => {
  const settings = (entries: [string, Partial<CosmeticSetting>][] = []) => new Map(entries.map(([id, s]) => [id, { id, enabled: true, exclusive: false, ...s }]));
  const ach = (id: string, reward: string, extra: Partial<Achievement> = {}): Achievement =>
    ({ id, group: 'hours', category: 'play', goal: 1, sparks: 1, name: id, nameEn: id, description: '', descriptionEn: '', reward, ...extra });

  it('says free, shop, achievement, rank, grant only and switched off', () => {
    const ways = (id: string, s = settings(), list: Achievement[] = []) => howToGet(item(id)!, s, list).ways.map((w) => w.kind);
    assert.deepEqual(ways('ocean'), ['free']);
    assert.deepEqual(ways('emberstar'), ['shop']);
    assert.equal((howToGet(item('emberstar')!, settings(), []).ways[0] as any).price, 600);
    assert.deepEqual(ways('veteran', settings(), [ach('hours_100', 'veteran')]), ['achievement']);
    // its achievement switched off: only a grant gives it now
    assert.deepEqual(ways('veteran', settings(), [ach('hours_100', 'veteran', { enabled: false })]), ['achievement', 'grant']);
    assert.deepEqual(ways('staff_support'), ['rank']);
    assert.deepEqual(ways('ocean', settings([['ocean', { exclusive: true }]])), ['grant']);
    // a free item as a reward too, and one put on sale by the admin
    assert.deepEqual(ways('ocean', settings(), [ach('x', 'ocean', { custom: true })]), ['free', 'achievement']);
    assert.deepEqual(ways('ocean', settings([['ocean', { price: 250 }]])), ['shop']);
    // a shop item taken off sale is free again
    assert.deepEqual(ways('emberstar', settings([['emberstar', { price: null }]])), ['free']);
    const off = howToGet(item('ocean')!, settings([['ocean', { enabled: false }]]), []);
    assert.equal(off.disabled, true);
    assert.match(off.text, /^Wyłączony/);
    assert.equal(howToGet(item('veteran')!, settings(), []).sellable, false);
    assert.match(howToGet(item('emberstar')!, settings(), [ach('a', 'emberstar', { name: 'Zbieracz' })]).text, /Sklep: 600.*„Zbieracz”/);
  });

  it('is in the admin panel for every item, matching the catalog and the editor', async () => {
    const res = await call('GET', '/v1/admin/cosmetics/obtain', boss.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.items.veteran.ways[0].kind, 'achievement');
    assert.equal(res.body.items.veteran.ways[0].id, 'hours_100');
    assert.equal(res.body.items.emberstar.price, 600);
    // the custom one's reward from the test above
    assert.ok(res.body.items.ocean.ways.some((w: any) => w.kind === 'achievement' && w.id === 'three_friends' && w.custom));
    const editor = (await call('GET', '/v1/admin/achievements', boss.token)).body.items.find((i: any) => i.id === 'veteran');
    assert.deepEqual(editor.obtain.ways, res.body.items.veteran.ways);
    assert.equal((await call('GET', '/v1/admin/cosmetics/obtain', (await login('Ciekawski')).token)).status, 403);
  });

  it('puts a free item on sale without taking it from who wears it, and back', async () => {
    const p = await login('NosiOcean');
    assert.equal((await call('POST', '/v1/me', p.token, { cape: 'ocean' })).status, 200);
    const other = await login('NieNosi');
    const res = await call('POST', '/v1/admin/shop/ocean', boss.token, { price: 250 });
    assert.equal(res.body.price, 250);
    assert.equal(res.body.kept, 1);
    const s = app.db.cosmeticSettings();
    assert.ok(mayWear(s, app.db.grants(p.user.id), 'ocean'));
    assert.ok(!mayWear(s, app.db.grants(other.user.id), 'ocean'));
    const cat = (await call('GET', '/v1/cosmetics', other.token)).body.items.find((i: any) => i.id === 'ocean');
    assert.equal(cat.price, 250);
    assert.equal(cat.available, false);
    // off sale: free again for everyone
    assert.equal((await call('POST', '/v1/admin/shop/ocean', boss.token, { price: null })).body.price, null);
    assert.ok(mayWear(app.db.cosmeticSettings(), [], 'ocean'));
    assert.equal((await call('POST', '/v1/admin/shop/staff_support', boss.token, { price: 5 })).body.error, 'not_sellable');
  });
});
