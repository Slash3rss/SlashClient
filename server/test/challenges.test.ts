import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import {
  DEFAULT_CHALLENGES, addDays, counterOf, dayStart, localDay, mondayOf, onServer, periodOf, pick, render, type Challenge, type PlayCredit,
} from '../src/challenges.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-challenges-'));
let base = '';
let app: ReturnType<typeof createApp>;
const joined = new Map<string, { id: string; name: string }>();

const fakeFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.startsWith('https://sessionserver.mojang.com/session/minecraft/hasJoined?')) {
    const q = new URL(url).searchParams;
    const p = joined.get(q.get('serverId') ?? '');
    return p && p.name === q.get('username') ? Response.json({ ...p, properties: [] }) : new Response(null, { status: 204 });
  }
  throw new Error(`unexpected ${url}`);
};

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

async function player(name: string, mc: string) {
  const p = await login(name);
  const { serverId } = (await call('POST', '/v1/auth/minecraft/start')).body;
  joined.set(serverId, { id: mc, name });
  assert.equal((await call('POST', '/v1/auth/minecraft/finish', p.token, { serverId, name })).status, 200);
  return p;
}

async function connect(token: string, presence?: unknown) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token, presence }));
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

/** Only these challenges of the pool on (with changes), the rest off; K and M as given. */
function only(on: Record<string, Partial<Challenge>>, daily = 1, weekly = 1) {
  for (const c of DEFAULT_CHALLENGES) app.challenges.registry.save({ ...c, ...(on[c.id] ?? {}), enabled: c.id in on }, 'test');
  app.settings.set({ 'challenges.daily': daily, 'challenges.weekly': weekly }, 'test');
}
function reset() {
  for (const c of DEFAULT_CHALLENGES) app.challenges.registry.remove(c.id);
  app.settings.set({ 'challenges.daily': null, 'challenges.weekly': null, 'challenges.enabled': null, 'challenges.dailyBonus': null, 'challenges.weeklyBonus': null }, 'test');
}
const credit = (uuid: string, seconds: number, server?: string, extra: Partial<PlayCredit> = {}) =>
  new Map<string, PlayCredit>([[uuid, { seconds, server, stayed: !!server, ticks: 5, ...extra }]]);
const ledger = (uuid: string) => app.db.sql.prepare("SELECT amount, ref FROM sparks_ledger WHERE uuid = ? AND reason = 'challenge' ORDER BY id").all(uuid) as { amount: number; ref: string }[];

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, fetchImpl: fakeFetch, adminHandles: ['SzefWyzwan'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('challenges: periods in Warsaw time', () => {
  it('starts days at midnight in Poland, summer and winter', () => {
    // CEST (UTC+2)
    assert.equal(localDay(Date.UTC(2026, 9, 21, 21, 59, 59)), '2026-10-21');
    assert.equal(localDay(Date.UTC(2026, 9, 21, 22, 0, 0)), '2026-10-22');
    assert.equal(dayStart('2026-10-22'), Date.UTC(2026, 9, 21, 22));
    // CET (UTC+1)
    assert.equal(localDay(Date.UTC(2026, 11, 31, 22, 59)), '2026-12-31');
    assert.equal(localDay(Date.UTC(2026, 11, 31, 23, 0)), '2027-01-01');
    assert.equal(dayStart('2027-01-01'), Date.UTC(2026, 11, 31, 23));
  });

  it('has a 25-hour day when the clocks go back and a 23-hour one when they go forward', () => {
    assert.equal(dayStart('2026-10-25'), Date.UTC(2026, 9, 24, 22));
    assert.equal(dayStart('2026-10-26'), Date.UTC(2026, 9, 25, 23));
    assert.equal(dayStart('2026-10-26') - dayStart('2026-10-25'), 25 * 3_600_000);
    assert.equal(dayStart('2026-03-30') - dayStart('2026-03-29'), 23 * 3_600_000);
    // 2:30 a.m. on the autumn day is there twice; both are the same day
    assert.equal(localDay(Date.UTC(2026, 9, 25, 0, 30)), '2026-10-25');
    assert.equal(localDay(Date.UTC(2026, 9, 25, 1, 30)), '2026-10-25');
  });

  it('starts weeks on Monday and gives the reset times', () => {
    assert.equal(mondayOf('2026-10-25'), '2026-10-19');
    assert.equal(mondayOf('2026-10-26'), '2026-10-26');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    // Sunday 23:59 after the clocks went back: still the old week, which ends at 23:00 UTC
    const sunday = periodOf('weekly', Date.UTC(2026, 9, 25, 22, 59));
    assert.equal(sunday.key, 'w:2026-10-19');
    assert.equal(sunday.start, Date.UTC(2026, 9, 18, 22));
    assert.equal(sunday.end, Date.UTC(2026, 9, 25, 23));
    assert.equal(periodOf('weekly', Date.UTC(2026, 9, 25, 23, 0)).key, 'w:2026-10-26');
    const day = periodOf('daily', Date.UTC(2026, 9, 22, 10));
    assert.deepEqual([day.key, day.end], ['d:2026-10-22', Date.UTC(2026, 9, 22, 22)]);
  });
});

describe('challenges: picks', () => {
  const daily = DEFAULT_CHALLENGES.filter((c) => c.period === 'daily');

  it('picks the same set for the same player and period, never two counting the same thing', () => {
    const a = pick(daily, 'u-1', 'd:2026-10-22', 3).map((c) => c.id);
    assert.deepEqual(pick([...daily].reverse(), 'u-1', 'd:2026-10-22', 3).map((c) => c.id), a);
    assert.equal(a.length, 3);
    for (let i = 0; i < 50; i++) {
      const set = pick(daily, `u-${i}`, 'd:2026-10-22', 5);
      assert.equal(new Set(set.map(counterOf)).size, set.length);
    }
    // other days and other players get other sets (not always, but across many)
    const sets = new Set(Array.from({ length: 20 }, (_, i) => pick(daily, `u-${i}`, 'd:2026-10-22', 3).map((c) => c.id).sort().join()));
    assert.ok(sets.size > 5);
    const days = new Set(Array.from({ length: 20 }, (_, i) => pick(daily, 'u-1', `d:2026-11-${10 + i}`, 3).map((c) => c.id).sort().join()));
    assert.ok(days.size > 5);
  });

  it('follows the weights and leaves out weight 0', () => {
    const pool: Challenge[] = [
      { ...daily[0], id: 'heavy', metric: 'media', weight: 100 },
      { ...daily[0], id: 'light', metric: 'sprays', weight: 1 },
      { ...daily[0], id: 'never', metric: 'votes', weight: 0 },
    ];
    let heavy = 0;
    for (let i = 0; i < 200; i++) {
      const [first] = pick(pool, `w-${i}`, 'd:2026-10-22', 1);
      if (first.id === 'heavy') heavy++;
      assert.ok(!pick(pool, `w-${i}`, 'd:2026-10-22', 3).some((c) => c.id === 'never'));
    }
    assert.ok(heavy > 180, `heavy first ${heavy} times`);
  });

  it('writes its numbers into the texts and knows subdomains', () => {
    assert.equal(render('Graj {n} min na {server}', { target: 30, server: 'skyup.pl' }), 'Graj 30 min na skyup.pl');
    assert.ok(onServer('play.skyup.pl', 'skyup.pl'));
    assert.ok(onServer('skyup.pl:25566', 'skyup.pl'));
    assert.ok(!onServer('notskyup.pl', 'skyup.pl'));
  });
});

let alaId = '';

describe('challenges: counting and paying', () => {
  it('gives every player their set, the same on every call, with the reset times', async () => {
    reset();
    const a = await login('ChalAla');
    alaId = a.user.id;
    const first = (await call('GET', '/v1/challenges', a.token)).body;
    assert.equal(first.enabled, true);
    assert.equal(first.daily.challenges.length, 3);
    assert.equal(first.weekly.challenges.length, 3);
    assert.equal(first.daily.endsAt, periodOf('daily', Date.now()).end);
    assert.equal(first.daily.bonus, 30);
    // voting is not set up on this server: never given
    assert.ok(![...first.daily.challenges, ...first.weekly.challenges].some((c: any) => c.metric === 'votes'));
    const again = (await call('GET', '/v1/challenges', a.token)).body;
    assert.deepEqual(again.daily.challenges.map((c: any) => c.id), first.daily.challenges.map((c: any) => c.id));
    // the pool changed: the set of this period stays
    for (const c of first.daily.challenges) app.challenges.registry.save({ ...app.challenges.registry.get(c.id)!, enabled: false }, 'test');
    const still = (await call('GET', '/v1/challenges', a.token)).body;
    assert.deepEqual(still.daily.challenges.map((c: any) => c.id), first.daily.challenges.map((c: any) => c.id));
    reset();
    assert.equal((await call('GET', '/v1/challenges')).status, 401);
  });

  it('counts only from the start of the day and the week, and pays once', () => {
    only({ d_play_30: {}, w_play_300: { target: 40 } }, 1, 1);
    app.settings.set({ 'challenges.dailyBonus': 7, 'challenges.weeklyBonus': 9 }, 'test');
    const me = alaId;
    // Wednesday 23:30 in Warsaw: 20 minutes
    app.challenges.played(credit(me, 20 * 60), Date.UTC(2025, 10, 12, 22, 30));
    // Thursday 00:05: a new day, 15 minutes: the daily one starts from 0 again, the weekly one goes on
    const thu = Date.UTC(2025, 10, 12, 23, 5);
    app.challenges.played(credit(me, 15 * 60), thu);
    let view = app.challenges.list(me, thu) as any;
    assert.equal(view.daily.key, 'd:2025-11-13');
    assert.equal(view.daily.challenges[0].id, 'd_play_30');
    assert.equal(view.daily.challenges[0].value, 15);
    assert.equal(view.weekly.challenges[0].value, 35);
    assert.deepEqual(ledger(me), []);
    // 15 more: both done, each paid once, and both bonuses (one challenge each)
    app.challenges.played(credit(me, 15 * 60), thu + 60_000);
    view = app.challenges.list(me, thu + 60_000) as any;
    assert.ok(view.daily.challenges[0].completedAt);
    assert.equal(view.daily.challenges[0].progress, 1);
    assert.equal(view.weekly.challenges[0].value, 40);
    assert.deepEqual(ledger(me).map((r) => [r.amount, r.ref]).sort(), [
      [15, 'd:2025-11-13:d_play_30'], [7, 'd:2025-11-13:*'], [100, 'w:2025-11-10:w_play_300'], [9, 'w:2025-11-10:*'],
    ].sort());
    assert.equal(view.daily.bonusAt !== null, true);
    // more play, another check: nothing more
    app.challenges.played(credit(me, 60 * 60), thu + 120_000);
    app.challenges.check(me, thu + 180_000);
    assert.equal(ledger(me).length, 4);
    assert.equal(app.wallet.balance(me), 15 + 7 + 100 + 9);
    // the ledger says what it was for
    const wallet = app.db.sql.prepare("SELECT note FROM sparks_ledger WHERE uuid = ? AND ref = 'd:2025-11-13:d_play_30'").get(me) as { note: string };
    assert.equal(wallet.note, 'Wyzwanie: Graj 30 min');
    // the next Monday: a new week, nothing carried over
    const monday = Date.UTC(2025, 10, 16, 23, 30);
    view = app.challenges.list(me, monday) as any;
    assert.equal(view.weekly.key, 'w:2025-11-17');
    assert.equal(view.weekly.challenges[0].value, 0);
    assert.equal(view.weekly.challenges[0].completedAt, null);
    reset();
  });

  it('counts days with 10 minutes, servers, a server and a party friend', async () => {
    only({ w_days_4: { target: 2 }, d_servers_2: {}, d_skyup_30: { target: 2 }, d_party_20: { target: 2 } }, 3, 1);
    const a = await login('ChalBolek');
    const b = await login('ChalLolek');
    const t = Date.UTC(2026, 9, 20, 10);
    // 9 minutes: no day yet; the 10th: a day
    app.challenges.played(credit(a.user.id, 9 * 60), t);
    assert.equal(app.challenges.store.get(a.user.id, 'w:2026-10-19', 'play_days'), 0);
    app.challenges.played(credit(a.user.id, 60), t + 60_000);
    app.challenges.played(credit(a.user.id, 60 * 60), t + 120_000);
    assert.equal(app.challenges.store.get(a.user.id, 'w:2026-10-19', 'play_days'), 1);
    // a server counts after two ticks there, once
    app.challenges.played(credit(a.user.id, 60, 'mc.example.com', { ticks: 1, stayed: false }), t + 180_000);
    assert.equal(app.challenges.store.get(a.user.id, 'd:2026-10-20', 'servers'), 0);
    app.challenges.played(credit(a.user.id, 60, 'mc.example.com', { ticks: 2 }), t + 240_000);
    app.challenges.played(credit(a.user.id, 60, 'mc.example.com', { ticks: 3 }), t + 300_000);
    assert.equal(app.challenges.store.get(a.user.id, 'd:2026-10-20', 'servers'), 1);
    // minutes on skyup.pl (a subdomain too), only when there the tick before as well
    app.challenges.played(credit(a.user.id, 60, 'play.skyup.pl', { ticks: 1, stayed: false }), t + 360_000);
    app.challenges.played(credit(a.user.id, 60, 'play.skyup.pl', { ticks: 2 }), t + 420_000);
    app.challenges.played(credit(a.user.id, 60, 'play.skyup.pl', { ticks: 3 }), t + 480_000);
    assert.equal(app.challenges.store.get(a.user.id, 'd:2026-10-20', 'server_minutes:skyup.pl'), 120);
    assert.equal(app.challenges.store.get(a.user.id, 'd:2026-10-20', 'servers'), 2);
    // with a friend from a party on the same server: only once both are friends in an accepted party
    const both = new Map<string, PlayCredit>([
      [a.user.id, { seconds: 60, server: 'mc.example.com', stayed: true, ticks: 5 }],
      [b.user.id, { seconds: 60, server: 'mc.example.com', stayed: true, ticks: 5 }],
    ]);
    app.challenges.played(both, t + 540_000);
    assert.equal(app.challenges.store.get(a.user.id, 'd:2026-10-20', 'party_minutes'), 0);
    await call('POST', '/v1/friends/requests', a.token, { handle: 'ChalLolek' });
    await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
    const party = (await call('POST', '/v1/parties', a.token, { members: [b.user.id], server: 'mc.example.com' })).body;
    assert.ok(party.party?.id ?? party.id, JSON.stringify(party));
    const id = party.party?.id ?? party.id;
    assert.equal((await call('POST', `/v1/parties/${id}/accept`, b.token)).status, 200);
    app.challenges.played(both, t + 600_000);
    assert.equal(app.challenges.store.get(a.user.id, 'd:2026-10-20', 'party_minutes'), 60);
    assert.equal(app.challenges.store.get(b.user.id, 'd:2026-10-20', 'party_minutes'), 60);
    // the party was counted for both too (creating and accepting) on today's real day
    const today = periodOf('daily', Date.now()).key;
    assert.equal(app.challenges.store.get(a.user.id, today, 'parties'), 1);
    assert.equal(app.challenges.store.get(b.user.id, today, 'parties'), 1);
    reset();
  });

  it('counts messages under the daily cap, sprays one in 30 seconds, and tells the launcher', async () => {
    only({ d_messages_5: { target: 2, sparks: 11 } }, 1, 0);
    app.settings.set({ 'sparks.messagesPerDay': 3, 'challenges.dailyBonus': 0 }, 'test');
    const a = await player('ChalReksio', '7'.repeat(32));
    const b = await login('ChalFilemon');
    await call('POST', '/v1/friends/requests', a.token, { handle: 'ChalFilemon' });
    await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
    const live = await connect(a.token);
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', `/v1/messages/${b.user.id}`, a.token, { text: `hej ${i}` })).status, 200);
    const today = periodOf('daily', Date.now()).key;
    assert.equal(app.challenges.store.get(a.user.id, today, 'messages'), 3);
    const done = await live.waitFor((e) => e.type === 'challenge');
    assert.equal(done.challenge.id, 'd_messages_5');
    assert.equal(done.challenge.sparks, 11);
    assert.equal(done.challenge.name, 'Wyślij 2 wiadomości znajomym');
    await live.waitFor((e) => e.type === 'wallet' && e.reason === 'challenge');
    assert.ok(!live.events.some((e) => e.type === 'challenges-bonus'));
    // the history names it
    const w = (await call('GET', '/v1/wallet', a.token)).body;
    const row = w.ledger.find((e: any) => e.reason === 'challenge');
    assert.equal(row.label, 'Wyślij 2 wiadomości znajomym');
    assert.equal(row.labelEn, 'Send 2 messages to friends');
    // sprays: the second within 30 seconds does not count
    const t = Date.now();
    app.challenges.after('POST', '/v1/mc/spray', a.user.id, t);
    app.challenges.after('POST', '/v1/mc/spray', a.user.id, t + 10_000);
    app.challenges.after('POST', '/v1/mc/spray', a.user.id, t + 31_000);
    assert.equal(app.challenges.store.get(a.user.id, today, 'sprays'), 2);
    // the launcher on two different days of a week
    app.challenges.online(a.user.id, Date.UTC(2026, 8, 15, 10));
    app.challenges.online(a.user.id, Date.UTC(2026, 8, 15, 11));
    app.challenges.online(a.user.id, Date.UTC(2026, 8, 16, 10));
    assert.equal(app.challenges.store.get(a.user.id, 'w:2026-09-14', 'launcher_days'), 2);
    // and connecting counts today
    assert.equal(app.challenges.store.get(a.user.id, periodOf('weekly', Date.now()).key, 'launcher_days'), 1);
    live.ws.close();
    await new Promise((r) => setTimeout(r, 50));
    app.settings.set({ 'sparks.messagesPerDay': null }, 'test');
    reset();
  });

  it('does nothing while switched off', async () => {
    reset();
    app.settings.set({ 'challenges.enabled': false }, 'test');
    const a = await login('ChalOff');
    assert.deepEqual((await call('GET', '/v1/challenges', a.token)).body, { enabled: false });
    app.challenges.played(credit(a.user.id, 3600), Date.now());
    assert.equal(app.challenges.store.get(a.user.id, periodOf('daily', Date.now()).key, 'play_minutes'), 0);
    reset();
  });
});

describe('challenges: the admin panel', () => {
  it('is for admins, changes the pool and says who did what', async () => {
    reset();
    const boss = await login('SzefWyzwan');
    const pleb = await login('ChalPleb');
    assert.equal((await call('GET', '/v1/admin/challenges', pleb.token)).status, 403);
    const view = (await call('GET', '/v1/admin/challenges', boss.token)).body;
    assert.equal(view.challenges.length, DEFAULT_CHALLENGES.length);
    assert.deepEqual(view.settings, { enabled: true, daily: 3, weekly: 3, dailyBonus: 30, weeklyBonus: 100 });
    assert.equal(view.metrics.find((m: any) => m.id === 'votes').available, false);
    // a built-in one changed: only the difference kept, marked as changed
    let res = await call('POST', '/v1/admin/challenges/d_play_30', boss.token, { target: 45, sparks: 20 });
    assert.equal(res.status, 200);
    const changed = res.body.challenges.find((c: any) => c.id === 'd_play_30');
    assert.deepEqual([changed.target, changed.sparks, changed.overridden, changed.preview], [45, 20, true, 'Graj 45 min']);
    // checked: too much, a weekly-only metric as daily, a server missing
    assert.equal((await call('POST', '/v1/admin/challenges/d_play_30', boss.token, { target: 100_000 })).body.error, 'bad_target');
    assert.equal((await call('POST', '/v1/admin/challenges/d_play_30', boss.token, { metric: 'play_days' })).body.error, 'bad_period');
    assert.equal((await call('POST', '/v1/admin/challenges/my_skyup', boss.token, { metric: 'server_minutes', name: 'X {n}' })).body.error, 'bad_server');
    assert.equal((await call('POST', '/v1/admin/challenges/Bad-Id', boss.token, { name: 'X' })).body.error, 'bad_id');
    // a new one
    res = await call('POST', '/v1/admin/challenges/my_skyup', boss.token, { metric: 'server_minutes', server: 'SkyUp.pl:25565', period: 'weekly', target: 90, sparks: 70, weight: 3, name: 'Wyspa {n} min na {server}', nameEn: 'Island {n} min on {server}' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const mine = res.body.challenges.find((c: any) => c.id === 'my_skyup');
    assert.deepEqual([mine.custom, mine.server, mine.preview], [true, 'skyup.pl', 'Wyspa 90 min na skyup.pl']);
    // back to the default, and deleted
    res = await call('DELETE', '/v1/admin/challenges/d_play_30', boss.token);
    assert.equal(res.body.challenges.find((c: any) => c.id === 'd_play_30').target, 30);
    res = await call('DELETE', '/v1/admin/challenges/my_skyup', boss.token);
    assert.ok(!res.body.challenges.some((c: any) => c.id === 'my_skyup'));
    const log = app.db.sql.prepare("SELECT action FROM admin_log WHERE target IN ('d_play_30', 'my_skyup') ORDER BY id").all() as { action: string }[];
    assert.deepEqual(log.map((r) => r.action), ['challenge_edit', 'challenge_create', 'challenge_reset', 'challenge_delete']);
    // K, M and the bonuses through the settings
    assert.equal((await call('POST', '/v1/admin/settings', boss.token, { values: { 'challenges.daily': 4, 'challenges.weeklyBonus': 0 } })).status, 200);
    const after = (await call('GET', '/v1/admin/challenges', boss.token)).body;
    assert.equal(after.settings.daily, 4);
    assert.equal(after.settings.weeklyBonus, 0);
    // completions show in the numbers
    assert.ok(after.recent.some((r: any) => r.id === 'd_play_30' && r.uuid === alaId), JSON.stringify(after.recent));
    assert.ok(after.challenges.find((c: any) => c.id === 'd_messages_5').stats.today.done >= 1);
    reset();
  });
});
