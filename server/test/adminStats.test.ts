import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { ActivityTracker, dayKey } from '../src/adminStats.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-adminstats-'));
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
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };
const sql = () => app.db.sql;

/** An account straight in the database, made and last seen when the test says. */
function fakeUser(name: string, createdAt: number, lastSeen = createdAt): string {
  const uuid = randomUUID();
  sql().prepare('INSERT INTO users (uuid, handle, handle_lower, name, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uuid, name, name.toLowerCase(), name, '', createdAt, lastSeen);
  return uuid;
}

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, adminHandles: ['Szef'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('admin dashboard statistics', () => {
  it('counts activity, platforms, servers, the social side, the economy, supporters and streams', async () => {
    const now = Date.now();
    const boss = await login('Szef');
    const gracz = await login('Gracz');
    const ala = await login('Ala');
    // the launcher says its version on every request: the accounts' launchers are remembered
    await call('GET', '/v1/me', gracz.token, undefined, { 'X-SlashClient': 'launcher/0.9.25' });
    await call('GET', '/v1/me', ala.token, undefined, { 'X-SlashClient': 'launcher/0.9.24' });

    // made 10 days ago: one came back 2 days ago, one never did; one made 40 days ago never came back
    const old1 = fakeUser('Stary1', now - 10 * DAY);
    const old2 = fakeUser('Stary2', now - 10 * DAY, now - 2 * DAY);
    fakeUser('Stary3', now - 40 * DAY);
    sql().prepare("INSERT INTO identities (provider, subject, uuid) VALUES ('discord', 'd-1', ?)").run(old1);

    // play time: two players on SkyUp today, one long ago on another server
    const today = dayKey(now);
    const addServer = sql().prepare('INSERT INTO play_server_days (uuid, server, day, seconds) VALUES (?, ?, ?, ?)');
    addServer.run(gracz.user.id, 'skyup.pl', today, 3600);
    addServer.run(ala.user.id, 'skyup.pl', today, 7200);
    addServer.run(old1, 'inny.net', dayKey(now - 40 * DAY), 1800);
    sql().prepare('INSERT INTO play_days (uuid, day, seconds) VALUES (?, ?, ?)').run(old2, dayKey(now - 2 * DAY), 3600);

    // messages: one plain, one "join me" from a party
    const msg = sql().prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at, invite) VALUES (?, ?, ?, ?, ?)');
    msg.run(gracz.user.id, ala.user.id, 'hej', now, null);
    msg.run(gracz.user.id, ala.user.id, '', now, JSON.stringify({ server: 'skyup.pl', party: 'p1' }));

    // a group, a clan and a community
    sql().prepare("INSERT INTO chat_groups (id, name, owner, created_at) VALUES ('g1', 'Ekipa', ?, ?)").run(gracz.user.id, now);
    const member = sql().prepare('INSERT INTO chat_group_members (group_id, uuid, joined_at) VALUES (?, ?, ?)');
    member.run('g1', gracz.user.id, now);
    member.run('g1', ala.user.id, now);
    sql().prepare("INSERT INTO clans (id, tag, tag_lower, name, owner, created_at) VALUES ('c1', 'ABC', 'abc', 'Klan', ?, ?)").run(ala.user.id, now);
    sql().prepare("INSERT INTO clan_members (uuid, clan_id, role, joined_at) VALUES (?, 'c1', 'owner', ?)").run(ala.user.id, now);
    sql().prepare("INSERT INTO communities (id, name, owner, member_count, created_at) VALUES ('k1', 'Społeczność', ?, 1, ?)").run(gracz.user.id, now);
    sql().prepare("INSERT INTO community_members (community_id, uuid, role, joined_at) VALUES ('k1', ?, 'owner', ?)").run(gracz.user.id, now);

    // sparks: 100 given by the admin, 30 spent on a cape
    app.wallet.change(gracz.user.id, 100, 'admin', '', 'test', boss.user.id);
    app.wallet.change(gracz.user.id, -30, 'purchase', 'cape_test');
    // an achievement two players have
    const ach = app.achievements.registry.active()[0];
    const unlock = sql().prepare('INSERT INTO achievements (uuid, id, unlocked_at) VALUES (?, ?, ?)');
    unlock.run(gracz.user.id, ach.id, now);
    unlock.run(ala.user.id, ach.id, now);

    // a supporter, money in (one paid, one refunded, one in test mode) and a refund waiting
    const tier = (sql().prepare('SELECT id, name FROM support_tiers ORDER BY level LIMIT 1').get() as { id: string; name: string });
    sql().prepare("INSERT INTO support_grants (user, tier, source, starts_at, expires_at, created_at) VALUES (?, ?, 'admin', ?, ?, ?)").run(old2, tier.id, now - DAY, now + 10 * DAY, now - DAY);
    const pay = sql().prepare(`INSERT INTO support_payments (id, provider, user, tier, kind, amount, currency, status, mode, created_at, paid_at)
      VALUES (?, 'stripe', ?, ?, 'one_time', ?, 'PLN', ?, ?, ?, ?)`);
    pay.run('p-1', old2, tier.id, 2500, 'paid', 'live', now, now);
    pay.run('p-2', old2, tier.id, 1000, 'refunded', 'live', now, now);
    pay.run('p-3', old2, tier.id, 999, 'paid', 'test', now, now);
    sql().prepare("INSERT INTO support_refunds (id, payment, user, status, created_at, updated_at) VALUES ('r-1', 'p-1', ?, 'pending', ?, ?)").run(old2, now, now);
    sql().prepare("INSERT INTO bugs (author, title, body, status, created_at, updated_at) VALUES (?, 'Błąd', 'opis', 'open', ?, ?)").run(old1, now, now);

    // a linked Twitch channel, live with 12 viewers
    sql().prepare("INSERT INTO stream_accounts (uuid, platform, subject, login, linked_at) VALUES (?, 'twitch', 't-1', 'stary', ?)").run(old1, now);
    sql().prepare("INSERT INTO stream_live (platform, subject, live, viewers) VALUES ('twitch', 't-1', 1, 12)").run();

    // a launcher connected, in game on SkyUp
    const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
    const ready = new Promise<void>((r) => ws.on('message', (d) => JSON.parse(String(d)).type === 'ready' && r()));
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'auth', token: gracz.token, presence: { status: 'online', activity: { kind: 'server', version: '1.21.4 · Fabric', server: 'SkyUp.pl:25565' } } }));
    await ready;

    const s = (await call('GET', '/v1/admin/stats?fresh=1', boss.token)).body;
    assert.equal(s.days, 30);
    assert.equal(s.users, 6);
    assert.equal(s.signups.length, 30);

    // activity: Szef, Gracz and Ala today; Stary2 this week; Stary1 this month
    assert.equal(s.activity.dau, 3);
    assert.equal(s.activity.wau, 4);
    assert.equal(s.activity.mau, 5);
    assert.equal(s.activity.daily.length, 30);
    assert.equal(s.activity.daily.at(-1), 3);
    assert.equal(s.activity.daily.at(-3), 1);
    assert.deepEqual(s.activity.retention, { d7: { cohort: 2, returned: 1 }, d30: { cohort: 1, returned: 0 } });
    assert.equal(s.activity.playHours.at(-3), 1);
    assert.equal(s.activity.messages.at(-1), 2);
    // the launcher that connected made today's peak
    assert.ok(s.activity.peakOnline.at(-1) >= 1);
    assert.equal(s.activity.peakBest.day, today);

    // platforms
    assert.equal(s.platforms.providers.dev, 3);
    assert.equal(s.platforms.providers.discord, 1);
    assert.deepEqual(s.platforms.launchers, { '0.9.25': 1, '0.9.24': 1 });

    // what is going on now
    assert.equal(s.online, 1);
    assert.deepEqual(s.now.kinds, { server: 1 });
    assert.deepEqual(s.now.versions, { '1.21.4': 1 });
    assert.deepEqual(s.now.loaders, { Fabric: 1 });
    assert.deepEqual(s.now.servers, [{ server: 'skyup.pl', name: 'SkyUp.pl', players: 1 }]);
    assert.equal(s.now.parties, 0);

    // servers by play time in the period: only SkyUp in the last 30 days, both in 90
    assert.deepEqual(s.servers.played, [{ server: 'skyup.pl', name: 'SkyUp.pl', hours: 3, players: 2 }]);

    // social
    assert.equal(s.social.invites, 1);
    assert.equal(s.social.partyInvites, 1);
    assert.equal(s.social.groups, 1);
    assert.equal(s.social.groupMembers, 2);
    assert.equal(s.social.clans, 1);
    assert.equal(s.social.clanMembers, 1);
    assert.equal(s.social.communities, 1);
    assert.equal(s.social.communityMembers, 1);

    // economy
    assert.equal(s.economy.given, 100);
    assert.equal(s.economy.spent, 30);
    assert.equal(s.economy.purchases, 1);
    assert.ok(s.economy.issued >= 100);
    assert.deepEqual(s.economy.topItems, [{ id: 'cape_test', n: 1 }]);
    assert.ok(s.economy.circulating >= 70);
    assert.ok(s.achievements.total >= 2);
    assert.equal(s.achievements.top.find((a: { id: string }) => a.id === ach.id).n, 2);
    assert.equal(s.achievements.defined, app.achievements.registry.active().length);

    // supporters: only live money, refunded ones not counted
    assert.equal(s.support.active, 1);
    assert.deepEqual(s.support.tiers, { [tier.name]: 1 });
    assert.deepEqual(s.support.revenueMonth, { PLN: 2500 });
    assert.deepEqual(s.support.revenueTotal, { PLN: 2500 });
    assert.equal(s.support.payments, 2);
    assert.equal(s.support.testPayments, 1);
    assert.equal(s.support.refundsPending, 1);
    assert.deepEqual(s.bugs, { open: 1, total: 1 });

    // streams
    assert.deepEqual(s.streams, { linked: { twitch: 1 }, live: { twitch: 1 }, viewers: 12 });
    assert.equal(typeof s.storage.used, 'number');

    // another period: the charts follow it, a period not offered is 30 days
    const week = (await call('GET', '/v1/admin/stats?days=7', boss.token)).body;
    assert.equal(week.days, 7);
    assert.equal(week.signups.length, 7);
    assert.equal(week.activity.daily.length, 7);
    const quarter = (await call('GET', '/v1/admin/stats?days=90&fresh=1', boss.token)).body;
    assert.equal(quarter.activity.daily.length, 90);
    assert.deepEqual(quarter.servers.played.map((p: { server: string }) => p.server), ['skyup.pl', 'inny.net']);
    assert.equal((await call('GET', '/v1/admin/stats?days=12', boss.token)).body.days, 30);

    // what comes from the database is kept a while; "fresh" counts it again
    fakeUser('Nowy', Date.now());
    const cached = (await call('GET', '/v1/admin/stats', boss.token)).body;
    assert.equal(cached.users, 6);
    assert.equal(cached.countedAt, s.countedAt);
    assert.equal((await call('GET', '/v1/admin/stats?fresh=1', boss.token)).body.users, 7);
    ws.close();
    await new Promise((r) => ws.once('close', r));
    await new Promise((r) => setTimeout(r, 50));
  });

  it('is for admins only', async () => {
    const player = await login('Zwykly');
    assert.equal((await call('GET', '/v1/admin/stats?days=7')).status, 401);
    const denied = await call('GET', '/v1/admin/stats?days=7&fresh=1', player.token);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, 'not_admin');
    assert.equal(denied.body.activity, undefined);
  });

  it('keeps the day peak and each account once a day', () => {
    let at = Date.parse('2026-05-01T10:00:00Z');
    const t = new ActivityTracker(sql(), () => at);
    t.sample(3, 1);
    t.sample(2, 4);
    t.sample(1, 1);
    assert.deepEqual({ ...sql().prepare("SELECT online, in_game AS inGame FROM stats_peaks WHERE day = '2026-05-01'").get() }, { online: 3, inGame: 4 });
    const u = randomUUID();
    t.seen(u);
    t.seen(u);
    at += 86_400_000;
    t.seen(u);
    assert.equal((sql().prepare('SELECT COUNT(*) AS n FROM stats_active_days WHERE uuid = ?').get(u) as { n: number }).n, 2);
    t.client(u, 'launcher', '0.9.20');
    t.client(u, 'launcher', '0.9.21');
    assert.equal((sql().prepare("SELECT version FROM stats_clients WHERE uuid = ? AND client = 'launcher'").get(u) as { version: string }).version, '0.9.21');
  });
});
