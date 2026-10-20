import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { ACHIEVEMENTS, CATEGORIES, DAY_CAP_SECONDS, createAchievements, dayOf, hintOf, serverRule } from '../src/achievements.ts';
import { ITEMS, mayWear } from '../src/cosmetics.ts';
import { Wallet } from '../src/economy.ts';

// The achievements of one server (SkyUp.pl and the ones made in the admin panel): time and days there, been there.

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-server-ach-'));
let base = '';
let app: ReturnType<typeof createApp>;
const joined = new Map<string, { id: string; name: string }>();
const DAY = 86_400_000;

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
  for (let i = 0; i < 100 && !events.some((e) => e.type === 'ready'); i++) await new Promise((r) => setTimeout(r, 20));
  return { ws, events };
}

let boss: { token: string; user: { id: string } };

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, fetchImpl: fakeFetch, adminHandles: ['SzefSerwerow'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  boss = await login('SzefSerwerow');
});
after(async () => {
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const sql = () => app.db.sql;
const has = (uuid: string, id: string) => app.achievements.store.unlocked(uuid).has(id);
const paid = (uuid: string, id: string) => ({ ...(sql().prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM sparks_ledger WHERE uuid = ? AND reason = 'achievement' AND ref = ?").get(uuid, id) as { n: number; s: number }) });
const onServer = (uuid: string, rule: string) => app.achievements.store.serverStats(uuid, rule);
const serverDay = (uuid: string, server: string, day: string, seconds: number) =>
  sql().prepare('INSERT INTO play_server_days (uuid, server, day, seconds) VALUES (?, ?, ?, ?)').run(uuid, server, day, seconds);
/** May the player wear the cape now (as the server checks a choice). */
const wears = (uuid: string, id: string) => mayWear(app.db.cosmeticSettings(), app.db.grants(uuid), id, 'cape');

describe('the server an achievement names', () => {
  it('is kept as a server key: lower case, no scheme, no path, no default port', () => {
    assert.equal(serverRule('SkyUp.pl'), 'skyup.pl');
    assert.equal(serverRule(' https://Play.SkyUp.pl/sklep '), 'play.skyup.pl');
    assert.equal(serverRule('skyup.pl:25565'), 'skyup.pl');
    assert.equal(serverRule('skyup.pl.'), 'skyup.pl');
    assert.equal(serverRule('mc.example.com:25566'), 'mc.example.com:25566');
    assert.equal(serverRule('51.83.10.2'), '51.83.10.2');
    for (const bad of ['', 'skyup', 'localhost', '127.0.0.1', '192.168.1.5', 'sky_up.pl', '%.pl', 'sky%up.pl', 'a..pl', '-a.pl', 'a b.pl', 'skyup.pl:abc', 123, undefined, null]) {
      assert.equal(serverRule(bad), undefined, String(bad));
    }
  });

  it('matches itself and its subdomains, never a longer name or another domain', () => {
    const u = app.achievements.store.users()[0];
    const d = '2026-01-05';
    serverDay(u, 'skyup.pl', d, 100);
    serverDay(u, 'play.skyup.pl', d, 200);
    serverDay(u, 'mc.skyup.pl:25570', d, 300);
    serverDay(u, 'evilskyup.pl', d, 1000);
    serverDay(u, 'skyup.pl.evil.com', d, 1000);
    assert.equal(onServer(u, 'skyup.pl').seconds, 600);
    assert.equal(onServer(u, 'play.skyup.pl').seconds, 200);
    // a rule with a port: only that port
    assert.equal(onServer(u, 'mc.skyup.pl:25570').seconds, 300);
    assert.equal(onServer(u, 'skyup.pl:25570').seconds, 300);
    sql().prepare('DELETE FROM play_server_days WHERE uuid = ?').run(u);
  });
});

describe('time on a server', () => {
  /** The tick with who plays where given by the test (the real rules of who plays: the next test). */
  function ticker() {
    const playing = new Map<string, string | undefined>();
    const ach = createAchievements({
      sql: sql(), wallet: new Wallet(sql()), playing: () => playing, push: () => {}, authed: () => '', areFriends: () => false,
      fail: () => { throw new Error('fail'); },
    });
    return { playing, ach };
  }

  it('goes to the server the player was on for the whole tick, with the same caps as all time', async () => {
    const ola = (await login('OlaWyspa')).user.id;
    const { playing, ach } = ticker();
    const t0 = Date.UTC(2026, 9, 20, 12, 0);
    const total = () => ach.store.stats(ola, t0).todaySeconds;
    playing.set(ola, 'Play.SkyUp.pl:25565');
    ach.tick(t0);
    // the first tick only starts the clock
    assert.equal(onServer(ola, 'skyup.pl').seconds, 0);
    ach.tick(t0 + 60_000);
    assert.equal(total(), 60);
    assert.equal(onServer(ola, 'skyup.pl').seconds, 60);
    // late tick: two minutes at most, there too
    ach.tick(t0 + 600_000);
    assert.equal(total(), 180);
    assert.equal(onServer(ola, 'skyup.pl').seconds, 180);
    // another server: the minute of the move goes to neither, the next one to the new one
    playing.set(ola, 'mc.inny.pl');
    ach.tick(t0 + 660_000);
    ach.tick(t0 + 720_000);
    assert.equal(total(), 300);
    assert.equal(onServer(ola, 'skyup.pl').seconds, 180);
    assert.equal(onServer(ola, 'inny.pl').seconds, 60);
    // singleplayer and a LAN world: all time, no server
    playing.set(ola, undefined);
    ach.tick(t0 + 780_000);
    ach.tick(t0 + 840_000);
    playing.set(ola, '192.168.1.20:51234');
    ach.tick(t0 + 900_000);
    ach.tick(t0 + 960_000);
    assert.equal(total(), 540);
    assert.equal(onServer(ola, 'skyup.pl').seconds, 180);
    const rows = sql().prepare('SELECT server FROM play_server_days WHERE uuid = ? ORDER BY server').all(ola) as { server: string }[];
    assert.deepEqual(rows.map((r) => r.server), ['mc.inny.pl', 'play.skyup.pl']);
    // the day's cap: what the day still takes, and no more
    playing.set(ola, 'skyup.pl');
    ach.tick(t0 + 1_020_000);
    ach.store.addPlay(ola, dayOf(t0), DAY_CAP_SECONDS - total() - 30);
    ach.tick(t0 + 1_080_000);
    assert.equal(total(), DAY_CAP_SECONDS);
    assert.equal(onServer(ola, 'skyup.pl').seconds, 180 + 30);
    ach.tick(t0 + 1_140_000);
    assert.equal(onServer(ola, 'skyup.pl').seconds, 180 + 30);
  });

  it('counts only a game in a world with the launcher connected, once per account however many launchers', async () => {
    const mc = '7'.repeat(32);
    const ala = await player('AlaChmury', mc);
    const onSky = { status: 'online', activity: { kind: 'server', server: 'mc.skyup.pl' } };
    const one = await connect(ala.token, onSky);
    const two = await connect(ala.token, onSky);
    const t0 = Date.now();
    // no game reported: nothing
    app.achievements.tick(t0);
    app.achievements.tick(t0 + 60_000);
    assert.equal(onServer(ala.user.id, 'skyup.pl').seconds, 0);
    await call('POST', '/v1/mc/link', ala.token, { uuid: mc });
    app.achievements.tick(t0 + 120_000);
    app.achievements.tick(t0 + 180_000);
    assert.equal(onServer(ala.user.id, 'skyup.pl').seconds, 60);
    assert.equal(onServer(ala.user.id, 'skyup.pl').visited, 1);
    // in the menu: nothing
    for (const l of [one, two]) l.ws.send(JSON.stringify({ type: 'presence', presence: { status: 'online', activity: { kind: 'menu' } } }));
    await new Promise((r) => setTimeout(r, 100));
    app.achievements.tick(t0 + 240_000);
    app.achievements.tick(t0 + 300_000);
    assert.equal(onServer(ala.user.id, 'skyup.pl').seconds, 60);
    one.ws.close();
    two.ws.close();
  });

  it('counts a day on a server with 10 minutes there, its subdomains together', async () => {
    const jan = (await login('JanDni')).user.id;
    serverDay(jan, 'skyup.pl', '2026-10-01', 600);
    serverDay(jan, 'play.skyup.pl', '2026-10-02', 300);
    serverDay(jan, 'mc.skyup.pl', '2026-10-02', 300);
    serverDay(jan, 'skyup.pl', '2026-10-03', 599);
    serverDay(jan, 'inny.pl', '2026-10-03', 3600);
    assert.deepEqual(onServer(jan, 'skyup.pl'), { seconds: 1799, days: 2, visited: 0 });
    assert.equal(onServer(jan, 'inny.pl').days, 1);
  });
});

describe('the SkyUp.pl achievements', () => {
  const skyup = ACHIEVEMENTS.filter((a) => a.category === 'skyup');

  it('are in their own category, each on skyup.pl, with the SkyUp capes as rewards earned only there', () => {
    assert.ok(CATEGORIES.includes('skyup'));
    assert.equal(skyup.length, 11);
    for (const a of skyup) assert.equal(a.server, 'skyup.pl', a.id);
    const capes = ITEMS.filter((i) => i.id.startsWith('skyup_'));
    assert.equal(capes.length, 10);
    for (const c of capes) {
      const a = ACHIEVEMENTS.find((x) => x.id === c.achievement);
      assert.ok(a, c.id);
      assert.equal(a.reward, c.id);
      assert.equal(a.category, 'skyup');
    }
    assert.match(hintOf(ACHIEVEMENTS.find((a) => a.id === 'skyup_50h')!).hint, /^Osiągnięcie „Nocna zmiana”: Spędź 50 godzin na SkyUp\.pl\. Liczy się czas od wprowadzenia/);
  });

  it('greet who played there before (the visits kept), and unlock with time and days there: capes and Iskry once', async () => {
    const zosia = await login('ZosiaSkyUp');
    const z = zosia.user.id;
    const now = Date.UTC(2026, 9, 20, 12, 0);
    // locked capes in the catalog of a 0.9.24 launcher, with how to get them; older launchers do not know them
    const catalog = async (v: string) => (await call('GET', '/v1/cosmetics', zosia.token, undefined, { 'X-SlashClient': `launcher/${v}` })).body.items;
    const niebo = (await catalog('0.9.24')).find((i: any) => i.id === 'skyup_niebo');
    assert.equal(niebo.available, false);
    assert.equal(niebo.achievement, 'skyup_1h');
    assert.match(niebo.hint, /^Osiągnięcie „Pierwsza wyspa”: Spędź godzinę na SkyUp\.pl\./);
    assert.match(niebo.hintEn, /^Achievement "First island": Spend an hour on SkyUp\.pl\./);
    assert.ok(!(await catalog('0.9.23')).some((i: any) => i.id.startsWith('skyup_')));
    assert.equal((await call('POST', '/v1/me', zosia.token, { cape: 'skyup_niebo' })).body.error, 'bad_cape');
    assert.equal(wears(z, 'skyup_niebo'), false);

    // been on a subdomain before the per-server time existed: the visit counts, nothing else
    app.achievements.store.addServer(z, 'gra.skyup.pl', now - 300 * DAY);
    const first = app.achievements.check(z, now).map((a) => a.id);
    assert.deepEqual(first, ['skyup_visit']);
    assert.deepEqual(paid(z, 'skyup_visit'), { n: 1, s: 10 });

    // an hour there
    serverDay(z, 'gra.skyup.pl', dayOf(now), 3600);
    assert.deepEqual(app.achievements.check(z, now).map((a) => a.id), ['skyup_1h']);
    assert.deepEqual(paid(z, 'skyup_1h'), { n: 1, s: 20 });
    assert.equal(wears(z, 'skyup_niebo'), true);
    assert.equal((await call('POST', '/v1/me', zosia.token, { cape: 'skyup_niebo' })).body.cape, 'skyup_niebo');
    assert.equal(wears(z, 'skyup_wyspa'), false);

    // seven days with 10 minutes there (six more)
    for (let d = 1; d <= 6; d++) serverDay(z, 'skyup.pl', dayOf(now - d * DAY), 600);
    assert.deepEqual(app.achievements.check(z, now).map((a) => a.id), ['skyup_days_7']);
    assert.equal(wears(z, 'skyup_wyspa'), true);
    assert.deepEqual(paid(z, 'skyup_days_7'), { n: 1, s: 50 });
    // nothing twice
    assert.deepEqual(app.achievements.check(z, now), []);
    assert.equal(paid(z, 'skyup_visit').n, 1);

    // 500 hours over many days (each under the day's cap): everything of hours and days at once
    for (let d = 7; d < 107; d++) serverDay(z, 'skyup.pl', dayOf(now - d * DAY), 5 * 3600);
    const rest = app.achievements.check(z, now).map((a) => a.id).filter((id) => id.startsWith('skyup_')).sort();
    assert.deepEqual(rest, ['skyup_100h', 'skyup_10h', 'skyup_250h', 'skyup_25h', 'skyup_500h', 'skyup_50h', 'skyup_days_100', 'skyup_days_30']);
    for (const c of ITEMS.filter((i) => i.id.startsWith('skyup_'))) assert.equal(wears(z, c.id), true, c.id);
    assert.deepEqual(paid(z, 'skyup_500h'), { n: 1, s: 800 });

    // the list: the category, the server, progress
    const list = (await call('GET', '/v1/achievements', zosia.token)).body;
    assert.ok(list.categories.includes('skyup'));
    const h500 = list.achievements.find((a: any) => a.id === 'skyup_500h');
    assert.equal(h500.category, 'skyup');
    assert.equal(h500.server, 'skyup.pl');
    assert.equal(h500.icon, 'fa-house-chimney');
    assert.deepEqual(h500.reward, { id: 'skyup_caveblock_domek', slot: 'cape', name: 'SkyUp – Caveblock: Domek' });
  });

  it('show progress to who has not got them', async () => {
    const kuba = await login('KubaPostep');
    serverDay(kuba.user.id, 'skyup.pl', dayOf(Date.now()), 5 * 3600);
    const list = (await call('GET', '/v1/achievements', kuba.token)).body.achievements;
    const h10 = list.find((a: any) => a.id === 'skyup_10h');
    assert.equal(h10.value, 5);
    assert.equal(h10.progress, 0.5);
    // the tier among the same server's hours
    assert.equal(h10.tier, 2);
    assert.equal(list.find((a: any) => a.id === 'skyup_days_7').value, 1);
  });
});

describe('the creator with a server', () => {
  const make = (id: string, extra: Record<string, unknown>) => call('POST', '/v1/admin/achievements', boss.token, {
    id, category: 'explore', sparks: 33, name: 'Na serwerze', nameEn: 'On a server', description: 'Zagraj tam.', descriptionEn: 'Play there.', ...extra,
  });

  it('offers the metrics of one server, and checks the server', async () => {
    const state = (await call('GET', '/v1/admin/achievements', boss.token)).body;
    for (const m of ['server_hours', 'server_days', 'server_visit']) assert.equal(state.metrics.find((x: any) => x.id === m)?.server, true, m);
    assert.ok(state.categories.includes('skyup'));
    assert.equal(state.achievements.find((a: any) => a.id === 'skyup_10h').server, 'skyup.pl');
    assert.equal((await make('srv_none', { metric: 'server_hours', goal: 2 })).body.error, 'bad_server');
    assert.equal((await make('srv_bad', { metric: 'server_hours', goal: 2, server: 'localhost' })).body.error, 'bad_server');
    assert.equal((await make('srv_bad2', { metric: 'server_days', goal: 2, server: 'nie serwer' })).body.error, 'bad_server');
    assert.equal((await make('srv_goal', { metric: 'server_visit', goal: 2, server: 'example.pl' })).body.error, 'bad_goal');
    const ok = await make('srv_hours', { metric: 'server_hours', goal: 2, server: 'https://Gra.Example.PL:25565/' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.achievements.find((a: any) => a.id === 'srv_hours').server, 'gra.example.pl');
    // another metric: no server any more
    const moved = await call('POST', '/v1/admin/achievements/srv_hours', boss.token, { metric: 'friends', goal: 100, server: 'example.pl' });
    assert.equal(moved.body.achievements.find((a: any) => a.id === 'srv_hours').server, undefined);
  });

  it('unlocks a visit at once for who played there before, and pays it once', async () => {
    const piotr = (await login('PiotrBywal')).user.id;
    const other = (await login('NieBywal')).user.id;
    app.achievements.store.addServer(piotr, 'pvp.przyklad.pl', Date.now() - 100 * DAY);
    app.achievements.store.addServer(other, 'przyklad.pl.inny.com', Date.now() - 100 * DAY);
    const res = await make('srv_visit', { metric: 'server_visit', goal: 1, server: 'Przyklad.pl' });
    assert.equal(res.status, 200);
    assert.ok(res.body.unlocked >= 1);
    assert.equal(has(piotr, 'srv_visit'), true);
    assert.equal(has(other, 'srv_visit'), false);
    assert.deepEqual(paid(piotr, 'srv_visit'), { n: 1, s: 33 });
    // saved again (more sparks): nothing more for who has it
    await call('POST', '/v1/admin/achievements/srv_visit', boss.token, { sparks: 99 });
    assert.deepEqual(paid(piotr, 'srv_visit'), { n: 1, s: 33 });
    assert.match(res.body.achievements.find((a: any) => a.id === 'srv_visit').server, /^przyklad\.pl$/);
  });

  it('lets a built-in one move to another address and back to default', async () => {
    const res = await call('POST', '/v1/admin/achievements/skyup_25h', boss.token, { server: 'SkyUp.eu' });
    assert.equal(res.status, 200);
    const a = res.body.achievements.find((x: any) => x.id === 'skyup_25h');
    assert.equal(a.server, 'skyup.eu');
    assert.equal(a.overridden, true);
    assert.equal(a.defaults.server, 'skyup.pl');
    assert.equal((await call('POST', '/v1/admin/achievements/skyup_25h', boss.token, { server: '' })).body.error, 'bad_server');
    const back = await call('POST', '/v1/admin/achievements/skyup_25h/reset', boss.token);
    assert.equal(back.body.achievements.find((x: any) => x.id === 'skyup_25h').server, 'skyup.pl');
    // a built-in one counts what it counts: its metric stays
    await call('POST', '/v1/admin/achievements/skyup_25h', boss.token, { metric: 'friends' });
    assert.equal(app.achievements.registry.get('skyup_25h')!.group, 'server_hours');
  });
});
