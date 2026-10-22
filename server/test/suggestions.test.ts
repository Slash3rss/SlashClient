import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { score } from '../src/suggestions.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-suggestions-'));
let base = '';
let app: ReturnType<typeof createApp>;
const sockets: WebSocket[] = [];

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; handle: string } };

/** A launcher connected with this presence (as the launcher sends it), waiting for "ready". */
async function connect(token: string, presence: unknown) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  sockets.push(ws);
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token, presence }));
  for (let i = 0; i < 100 && !events.some((e) => e.type === 'ready'); i++) await new Promise((r) => setTimeout(r, 20));
  return ws;
}
const onServer = (server: string, status = 'online') => ({ status, activity: { kind: 'server', server, version: '1.21.4' } });
/** Changes the presence of a connected launcher and waits for the server to have it. */
async function setPresence(ws: WebSocket, presence: unknown) {
  ws.send(JSON.stringify({ type: 'presence', presence }));
  await new Promise((r) => setTimeout(r, 60));
}
/** `minutes` minutes of the encounter tick, ending now. */
function play(minutes: number, now = Date.now()) {
  for (let i = minutes - 1; i >= 0; i--) app.suggestions.tick(now - i * 60_000, 60);
}
const list = async (token: string) => (await call('GET', '/v1/friends/suggestions?limit=30', token)).body;
const ids = async (token: string) => (await list(token)).suggestions.map((s: any) => s.handle);
let users = 0;
/** A fresh player, with a unique name per test. */
const player = async (name: string) => login(`${name}${++users}`);
/** A Minecraft uuid (no dashes) linked to an account. */
const mc = (n: number) => n.toString(16).padStart(32, 'a');

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, adminHandles: ['Szef'], oauth: {} });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  // every launcher gone (the server notes when it was last seen) before the database closes
  await Promise.all(sockets.map((ws) => (ws.readyState === WebSocket.CLOSED ? undefined : new Promise((r) => {
    ws.once('close', r);
    ws.close();
  }))));
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('friend suggestions', () => {
  it('suggests players who played on the same server at the same time, with where and how long', async () => {
    const ala = await player('Ala');
    const bob = await player('Bob');
    const far = await player('Far');
    // the same server however it was typed; another server is another place
    const wa = await connect(ala.token, onServer('Play.Meet1.pl:25565'));
    const wb = await connect(bob.token, onServer('play.meet1.pl'));
    const wf = await connect(far.token, onServer('other1.pl'));
    play(20);
    const res = await list(ala.token);
    assert.equal(res.enabled, true);
    assert.equal(res.visible, true);
    assert.deepEqual(res.suggestions.map((s: any) => s.handle), [bob.user.handle]);
    const s = res.suggestions[0];
    assert.equal(s.id, bob.user.id);
    assert.equal(s.server, 'play.meet1.pl');
    assert.equal(s.minutes, 20);
    assert.equal(s.nearbyMinutes, 0);
    assert.equal(s.mutual, 0);
    assert.ok(Date.now() - s.lastAt < 5000);
    // both ways
    assert.deepEqual(await ids(bob.token), [ala.user.handle]);
    assert.deepEqual(await ids(far.token), []);
    for (const ws of [wa, wb, wf]) ws.close();
  });

  it('needs the least time together the admin set', async () => {
    const a = await player('Short');
    const b = await player('Short');
    const wa = await connect(a.token, onServer('short1.pl'));
    const wb = await connect(b.token, onServer('short1.pl'));
    play(5);
    assert.deepEqual(await ids(a.token), []);
    app.settings.set({ 'suggestions.minMinutes': 5 }, 'test');
    assert.deepEqual(await ids(a.token), [b.user.handle]);
    app.settings.set({ 'suggestions.minMinutes': 15 }, 'test');
    wa.close();
    wb.close();
  });

  it('never counts invisible players, players who turned suggestions off, the menu or singleplayer', async () => {
    const ala = await player('Vis');
    const ghost = await player('Ghost');
    const shy = await player('Shy');
    const menu = await player('Menu');
    const wa = await connect(ala.token, onServer('privacy1.pl'));
    const wg = await connect(ghost.token, onServer('privacy1.pl', 'invisible'));
    assert.deepEqual((await call('POST', '/v1/me/suggestions', shy.token, { visible: false })).body, { visible: false, enabled: true });
    const ws = await connect(shy.token, onServer('privacy1.pl'));
    const wm = await connect(menu.token, { status: 'online', activity: { kind: 'menu' } });
    play(30);
    assert.deepEqual(await ids(ala.token), []);
    // the hidden player sees nobody either
    const own = await list(shy.token);
    assert.equal(own.visible, false);
    assert.deepEqual(own.suggestions, []);
    assert.equal((await call('GET', '/v1/me/suggestions', shy.token)).body.visible, false);
    assert.equal((await call('POST', '/v1/me/suggestions', shy.token, { visible: 'yes' })).status, 400);
    for (const w of [wa, wg, ws, wm]) w.close();
  });

  it('forgets everything about a player who turns suggestions off', async () => {
    const a = await player('Forget');
    const b = await player('Forget');
    const wa = await connect(a.token, onServer('forget1.pl'));
    const wb = await connect(b.token, onServer('forget1.pl'));
    play(20);
    assert.deepEqual(await ids(a.token), [b.user.handle]);
    await call('POST', '/v1/me/suggestions', b.token, { visible: false });
    assert.deepEqual(await ids(a.token), []);
    // on again: the old minutes are gone, not just hidden
    await call('POST', '/v1/me/suggestions', b.token, { visible: true });
    assert.deepEqual(await ids(a.token), []);
    play(20);
    assert.deepEqual(await ids(a.token), [b.user.handle]);
    wa.close();
    wb.close();
  });

  it('leaves out friends, players with a request either way, and banned players', async () => {
    const me = await player('Me');
    const friend = await player('Friend');
    const asked = await player('Asked');
    const asker = await player('Asker');
    const stranger = await player('Stranger');
    const banned = await player('Banned');
    const all = [me, friend, asked, asker, stranger, banned];
    const open = await Promise.all(all.map((p) => connect(p.token, onServer('excl1.pl'))));
    play(20);
    await call('POST', '/v1/friends/requests', me.token, { handle: friend.user.handle });
    await call('POST', '/v1/friends/requests', friend.token, { handle: me.user.handle });
    await call('POST', '/v1/friends/requests', me.token, { handle: asked.user.handle });
    await call('POST', '/v1/friends/requests', asker.token, { handle: me.user.handle });
    app.db.sql.prepare('UPDATE users SET banned = 1 WHERE uuid = ?').run(banned.user.id);
    assert.deepEqual(await ids(me.token), [stranger.user.handle]);
    // the friend's other encounters are untouched: the stranger still sees me and the friend
    assert.deepEqual((await ids(stranger.token)).sort(), [asked, asker, friend, me].map((p) => p.user.handle).sort());
    for (const w of open) w.close();
  });

  it('hides a dismissed player both ways, for the admin\'s number of days', async () => {
    const a = await player('Dis');
    const b = await player('Dis');
    const c = await player('Dis');
    const open = await Promise.all([a, b, c].map((p) => connect(p.token, onServer('dismiss1.pl'))));
    play(20);
    assert.equal((await ids(a.token)).length, 2);
    const res = await call('POST', `/v1/friends/suggestions/${b.user.id}/dismiss`, a.token);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.suggestions.map((s: any) => s.handle), [c.user.handle]);
    assert.deepEqual(await ids(b.token), [c.user.handle]);
    assert.equal((await call('POST', '/v1/friends/suggestions/nobody/dismiss', a.token)).status, 404);
    assert.equal((await call('POST', `/v1/friends/suggestions/${a.user.id}/dismiss`, a.token)).status, 404);
    // long ago: back (and pruned)
    app.db.sql.prepare('UPDATE suggestion_dismissals SET at = ? WHERE uuid = ?').run(Date.now() - 181 * 86_400_000, a.user.id);
    assert.equal((await ids(a.token)).length, 2);
    app.suggestions.prune();
    assert.equal((app.db.sql.prepare('SELECT COUNT(*) AS n FROM suggestion_dismissals WHERE uuid = ?').get(a.user.id) as { n: number }).n, 0);
    for (const w of open) w.close();
  });

  it('ranks by time together, nearby time, recency and shared friends', async () => {
    const me = await player('Rank');
    const long = await player('Long');
    const short = await player('Short');
    const mutualA = await player('Mut');
    const mutualB = await player('Mut');
    const wm = await connect(me.token, onServer('rank1.pl'));
    const wl = await connect(long.token, onServer('rank1.pl'));
    play(90);
    const ws = await connect(short.token, onServer('rank1.pl'));
    play(20);
    // long met for 110 minutes, short for 20 (the first ticks of `long` overlap only `me`)
    let res = (await list(me.token)).suggestions;
    assert.deepEqual(res.map((s: any) => s.handle), [long.user.handle, short.user.handle]);
    assert.equal(res[0].minutes, 110);
    // two friends shared with short: still second, but the reason says so
    for (const m of [mutualA, mutualB]) {
      for (const [x, y] of [[me, m], [short, m]]) {
        await call('POST', '/v1/friends/requests', x.token, { handle: y.user.handle });
        await call('POST', '/v1/friends/requests', y.token, { handle: x.user.handle });
      }
    }
    res = (await list(me.token)).suggestions;
    assert.equal(res.find((s: any) => s.id === short.user.id).mutual, 2);
    assert.equal(res.find((s: any) => s.id === long.user.id).mutual, 0);
    // the formula: shared friends and a fresh meeting each lift a suggestion
    const now = Date.now();
    const keep = 14 * 86_400_000;
    assert.ok(score({ seconds: 3600, nearby: 0, lastAt: now, mutual: 3 }, now, keep) > score({ seconds: 3600, nearby: 0, lastAt: now, mutual: 0 }, now, keep));
    assert.ok(score({ seconds: 3600, nearby: 0, lastAt: now, mutual: 0 }, now, keep) > score({ seconds: 3600, nearby: 0, lastAt: now - 10 * 86_400_000, mutual: 0 }, now, keep));
    assert.ok(score({ seconds: 600, nearby: 600, lastAt: now, mutual: 0 }, now, keep) > score({ seconds: 1200, nearby: 0, lastAt: now, mutual: 0 }, now, keep));
    for (const w of [wm, wl, ws]) w.close();
  });

  it('counts players the game saw nearby, keeping only linked SlashClient players on the same server', async () => {
    const me = await player('Near');
    const buddy = await player('Buddy');
    const elsewhere = await player('Else');
    app.db.link('minecraft', mc(1), buddy.user.id, 'BuddyMC');
    app.db.link('minecraft', mc(2), elsewhere.user.id, 'ElseMC');
    const wm = await connect(me.token, onServer('near1.pl'));
    const wb = await connect(buddy.token, onServer('near1.pl'));
    const we = await connect(elsewhere.token, onServer('notnear1.pl'));
    // one minute on the server: too short alone
    play(1);
    assert.deepEqual(await ids(me.token), []);
    const before = app.suggestions.store.count();
    const dashed = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    const strangers = Array.from({ length: 20 }, (_, i) => dashed(mc(1000 + i)));
    const res = await call('POST', '/v1/mc/nearby', me.token, { server: 'near1.pl', uuids: [dashed(mc(1)), mc(2), ...strangers, 'not-a-uuid'] });
    assert.deepEqual(res.body, { ok: true });
    // only the pair with buddy got a row (it had one already): nobody else is kept
    assert.equal(app.suggestions.store.count(), before);
    const s = (await list(me.token)).suggestions;
    assert.deepEqual(s.map((x: any) => x.handle), [buddy.user.handle]);
    assert.equal(s[0].nearbyMinutes, 1);
    // a report for another server than the launcher says is ignored; so is one right after the last
    await call('POST', '/v1/mc/nearby', me.token, { server: 'notnear1.pl', uuids: [mc(2)] });
    await call('POST', '/v1/mc/nearby', me.token, { server: 'near1.pl', uuids: [mc(1)] });
    assert.equal((await list(me.token)).suggestions[0].nearbyMinutes, 1);
    assert.deepEqual(await ids(elsewhere.token), []);
    assert.equal((await call('POST', '/v1/mc/nearby', me.token, { server: 'near1.pl', uuids: Array(101).fill(mc(1)) })).status, 400);
    assert.equal((await call('POST', '/v1/mc/nearby', me.token, { server: 'bad server', uuids: [] })).status, 400);
    assert.equal((await call('POST', '/v1/mc/nearby', undefined, { server: 'near1.pl', uuids: [] })).status, 401);
    // rate limited per account (6 a minute by default; 5 used above)
    assert.equal((await call('POST', '/v1/mc/nearby', me.token, { server: 'near1.pl', uuids: [] })).status, 200);
    assert.equal((await call('POST', '/v1/mc/nearby', me.token, { server: 'near1.pl', uuids: [] })).status, 429);
    for (const w of [wm, wb, we]) w.close();
  });

  it('prunes encounters older than the days kept', async () => {
    const a = await player('Old');
    const b = await player('Old');
    const wa = await connect(a.token, onServer('old1.pl'));
    const wb = await connect(b.token, onServer('old1.pl'));
    play(20, Date.now() - 15 * 86_400_000);
    // too old to suggest even before the hourly pruning
    assert.deepEqual(await ids(a.token), []);
    const rows = () => (app.db.sql.prepare('SELECT COUNT(*) AS n FROM encounters WHERE a = ? OR b = ?').get(a.user.id, a.user.id) as { n: number }).n;
    assert.equal(rows(), 1);
    app.suggestions.prune();
    assert.equal(rows(), 0);
    // a longer time kept in the admin panel keeps them
    app.settings.set({ 'suggestions.keepDays': 30 }, 'test');
    play(20, Date.now() - 15 * 86_400_000);
    app.suggestions.prune();
    assert.equal(rows(), 1);
    assert.deepEqual(await ids(a.token), [b.user.handle]);
    app.settings.set({ 'suggestions.keepDays': 14 }, 'test');
    wa.close();
    wb.close();
  });

  it('skips servers with more players than the admin allows in pairs', async () => {
    app.settings.set({ 'suggestions.maxPerServer': 2 }, 'test');
    const ps = await Promise.all([1, 2, 3].map(() => player('Crowd')));
    const open = await Promise.all(ps.map((p) => connect(p.token, onServer('crowd1.pl'))));
    play(20);
    assert.deepEqual(await ids(ps[0].token), []);
    app.settings.set({ 'suggestions.maxPerServer': 150 }, 'test');
    for (const w of open) w.close();
  });

  it('switched off in the admin panel: nothing counted, nothing suggested', async () => {
    const a = await player('Off');
    const b = await player('Off');
    const wa = await connect(a.token, onServer('off1.pl'));
    const wb = await connect(b.token, onServer('off1.pl'));
    play(20);
    app.settings.set({ 'suggestions.enabled': false }, 'test');
    const res = await list(a.token);
    assert.equal(res.enabled, false);
    assert.deepEqual(res.suggestions, []);
    assert.deepEqual(app.suggestions.tick(Date.now(), 60), { pairs: 0 });
    app.settings.set({ 'suggestions.enabled': true }, 'test');
    assert.deepEqual(await ids(a.token), [b.user.handle]);
    assert.equal((await call('GET', '/v1/friends/suggestions')).status, 401);
    wa.close();
    wb.close();
  });

  it('shows its settings in the admin panel', async () => {
    const admin = await login('Szef');
    const res = (await call('GET', '/v1/admin/settings', admin.token)).body;
    assert.ok(res.categories.some((c: any) => c.id === 'suggestions'));
    const keys = res.settings.filter((s: any) => s.category === 'suggestions').map((s: any) => s.key);
    for (const k of ['suggestions.enabled', 'suggestions.keepDays', 'suggestions.minMinutes', 'suggestions.dismissDays']) assert.ok(keys.includes(k), k);
  });
});
