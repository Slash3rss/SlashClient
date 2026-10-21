import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { DAY_CAP_SECONDS, dayOf, serverKey, streaks } from '../src/achievements.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-achievements-'));
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

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

/** A dev account with a Minecraft account linked (needed for /v1/mc/link). */
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

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, fetchImpl: fakeFetch });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  // the closed launchers' last updates first
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('achievements', () => {
  it('counts streaks of UTC days, alive until the day after the last one', () => {
    assert.deepEqual(streaks([], '2026-10-19'), { current: 0, best: 0 });
    assert.deepEqual(streaks(['2026-10-17', '2026-10-18', '2026-10-19'], '2026-10-19'), { current: 3, best: 3 });
    // today has no 10 minutes yet: yesterday's streak still counts
    assert.deepEqual(streaks(['2026-10-17', '2026-10-18'], '2026-10-19'), { current: 2, best: 2 });
    assert.deepEqual(streaks(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-17'], '2026-10-19'), { current: 0, best: 3 });
    // across a month's end
    assert.deepEqual(streaks(['2026-09-30', '2026-10-01'], '2026-10-01'), { current: 2, best: 2 });
    assert.equal(dayOf(Date.UTC(2026, 9, 19, 23, 59)), '2026-10-19');
  });

  it('counts only real servers', () => {
    assert.equal(serverKey('SkyUp.pl'), 'skyup.pl');
    assert.equal(serverKey('mc.example.com:25565'), 'mc.example.com');
    assert.equal(serverKey('mc.example.com:25566'), 'mc.example.com:25566');
    for (const local of ['127.0.0.1:51234', 'localhost', '192.168.1.5', '10.0.0.2:25565', undefined, '']) assert.equal(serverKey(local), undefined);
  });

  it('credits play time only while the game runs in a world, with the launcher connected', async () => {
    const mc = '1'.repeat(32);
    const ala = await player('AlaPlay', mc);
    const live = await connect(ala.token, { status: 'online', activity: { kind: 'server', server: 'skyup.pl' } });
    // a friend sees each change of her presence: the server has taken it in (a fixed wait was too short on a busy CI machine)
    const watcher = await login('AlaWatcher');
    await call('POST', '/v1/friends/requests', ala.token, { handle: 'AlaWatcher' });
    await call('POST', `/v1/friends/requests/${ala.user.id}/accept`, watcher.token);
    const watching = await connect(watcher.token);
    const seen = (kind: string | undefined) => watching.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && (kind ? e.presence?.activity?.kind === kind : e.presence?.status === 'offline'));
    const t0 = Date.now();
    // the launcher connected, but no game reported: nothing
    app.achievements.tick(t0);
    app.achievements.tick(t0 + 60_000);
    let s = app.achievements.store.stats(ala.user.id, t0 + 60_000);
    assert.equal(s.todaySeconds, 0);
    await call('POST', '/v1/mc/link', ala.token, { uuid: mc });
    // the first tick starts the clock, the next one credits the minute
    app.achievements.tick(t0 + 120_000);
    app.achievements.tick(t0 + 180_000);
    s = app.achievements.store.stats(ala.user.id, t0 + 180_000);
    assert.equal(s.todaySeconds, 60);
    assert.equal(s.servers, 1);
    // a long gap (the server was busy) gives at most two minutes
    app.achievements.tick(t0 + 480_000);
    assert.equal(app.achievements.store.stats(ala.user.id, t0 + 480_000).todaySeconds, 180);
    // in the menu: no time
    live.ws.send(JSON.stringify({ type: 'presence', presence: { status: 'online', activity: { kind: 'menu' } } }));
    await seen('menu');
    app.achievements.tick(t0 + 540_000);
    app.achievements.tick(t0 + 560_000);
    assert.equal(app.achievements.store.stats(ala.user.id, t0 + 560_000).todaySeconds, 180);
    // the launcher gone: no time either, even with the game's last report still fresh
    live.ws.send(JSON.stringify({ type: 'presence', presence: { status: 'online', activity: { kind: 'singleplayer' } } }));
    await seen('singleplayer');
    live.ws.close();
    await seen(undefined);
    watching.ws.close();
    app.achievements.tick(t0 + 570_000);
    app.achievements.tick(t0 + 580_000);
    assert.equal(app.achievements.store.stats(ala.user.id, t0 + 580_000).todaySeconds, 180);
  });

  it('caps a day at 12 hours', async () => {
    const ola = await login('OlaCap');
    const day = dayOf(Date.now());
    app.achievements.store.addPlay(ola.user.id, day, 10 * 3600);
    app.achievements.store.addPlay(ola.user.id, day, 10 * 3600);
    assert.equal(app.achievements.store.stats(ola.user.id, Date.now()).todaySeconds, DAY_CAP_SECONDS);
  });

  it('unlocks the Veteran cape at 100 hours and pushes the event', async () => {
    const jan = await login('JanVet');
    const live = await connect(jan.token);
    // the cape is not for everyone, and older launchers do not know it
    assert.equal((await call('POST', '/v1/me', jan.token, { cape: 'veteran' })).body.error, 'bad_cape');
    const newer = (await call('GET', '/v1/cosmetics', jan.token, undefined, { 'X-SlashClient': 'launcher/0.9.14' })).body.items.find((i: any) => i.id === 'veteran');
    assert.equal(newer.available, false);
    assert.equal(newer.achievement, 'hours_100');
    assert.match(newer.hint, /Weteran/);
    assert.match(newer.hintEn, /100 hours/);
    const older = (await call('GET', '/v1/cosmetics', jan.token, undefined, { 'X-SlashClient': 'launcher/0.9.13' })).body.items;
    assert.ok(!older.some((i: any) => i.id === 'veteran' || i.id === 'streak30'));
    // 100 hours over ten days (each under the day's cap)
    const now = Date.now();
    for (let d = 0; d < 10; d++) app.achievements.store.addPlay(jan.user.id, dayOf(now - d * 86_400_000), 10 * 3600);
    const fresh = app.achievements.check(jan.user.id, now);
    assert.deepEqual(fresh.map((a) => a.id).sort(), ['hours_1', 'hours_10', 'hours_100', 'hours_50', 'longday_4', 'streak_3', 'streak_7', 'weekend_1']);
    const event = await live.waitFor((e) => e.type === 'achievement' && e.achievement.id === 'hours_100');
    assert.equal(event.achievement.name, 'Weteran');
    assert.deepEqual(event.achievement.reward, { id: 'veteran', slot: 'cape', name: 'Weteran' });
    // only once
    assert.deepEqual(app.achievements.check(jan.user.id, now), []);
    assert.equal((await call('POST', '/v1/me', jan.token, { cape: 'veteran' })).body.cape, 'veteran');
    assert.equal((await call('GET', '/v1/cosmetics', jan.token, undefined, { 'X-SlashClient': 'launcher/0.9.14' })).body.items.find((i: any) => i.id === 'veteran').available, true);
    // still locked: the streak cape
    assert.equal((await call('POST', '/v1/me', jan.token, { cape: 'streak30' })).body.error, 'bad_cape');
    const list = (await call('GET', '/v1/achievements', jan.token)).body;
    assert.equal(list.stats.hours, 100);
    assert.equal(list.stats.streak, 10);
    const h500 = list.achievements.find((a: any) => a.id === 'hours_500');
    assert.equal(h500.unlockedAt, null);
    assert.equal(h500.progress, 0.2);
    assert.equal(h500.tier, 6);
    live.ws.close();
  });

  it('unlocks the 30-day streak cape', async () => {
    const zosia = await login('ZosiaStreak');
    const now = Date.now();
    for (let d = 0; d < 30; d++) app.achievements.store.addPlay(zosia.user.id, dayOf(now - d * 86_400_000), 600);
    assert.ok(app.achievements.check(zosia.user.id, now).some((a) => a.id === 'streak_30'));
    assert.equal((await call('POST', '/v1/me', zosia.token, { cape: 'streak30' })).body.cape, 'streak30');
  });

  it('gives the first friend and message, and shows friends each other\'s', async () => {
    const a = await login('AdaFriend');
    const b = await login('BartFriend');
    const stranger = await login('ObcyX');
    await call('POST', '/v1/friends/requests', a.token, { handle: 'BartFriend' });
    const live = await connect(b.token);
    await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
    await live.waitFor((e) => e.type === 'achievement' && e.achievement.id === 'friend_1');
    await call('POST', `/v1/messages/${a.user.id}`, b.token, { text: 'hej' });
    await live.waitFor((e) => e.type === 'achievement' && e.achievement.id === 'message_1');
    const seen = (await call('GET', `/v1/achievements/${b.user.id}`, a.token)).body.achievements;
    assert.ok(seen.find((x: any) => x.id === 'message_1').unlockedAt > 0);
    assert.equal(seen.find((x: any) => x.id === 'streak_3').unlockedAt, null);
    // a friend sees what is unlocked, not the hours behind it
    assert.equal(seen[0].value, undefined);
    assert.equal((await call('GET', `/v1/achievements/${b.user.id}`, stranger.token)).body.error, 'not_friends');
    assert.equal((await call('GET', '/v1/achievements')).status, 401);
    live.ws.close();
  });
});
