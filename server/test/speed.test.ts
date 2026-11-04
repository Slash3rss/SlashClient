import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { Db } from '../src/db.ts';
import { Wallet } from '../src/economy.ts';
import { RequestLog } from '../src/requests.ts';
import { statements } from '../src/statements.ts';
import { SUPPORTER_SCHEMA, setSupporterLevel } from '../src/supporterItems.ts';
import { serveWeb } from '../src/web.ts';

// What makes the server answer faster (kept statements, fewer queries, caches) must not change any answer.

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-speed-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text, headers: res.headers };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; handle: string } };

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('kept statements', () => {
  it('gives the same statement for the same SQL, per connection, and keeps only so many', () => {
    const sql = new DatabaseSync(':memory:');
    const stmt = statements(sql, 2);
    const a = stmt('SELECT 1 AS n');
    assert.equal(stmt('SELECT 1 AS n'), a);
    // another store on the same connection shares them
    assert.equal(statements(sql)('SELECT 1 AS n'), a);
    // a statement that cannot be prepared throws every time, as before
    assert.throws(() => stmt('SELECT x FROM nothing_here'));
    sql.exec('CREATE TABLE nothing_here (x)');
    assert.equal(stmt('SELECT x FROM nothing_here').all().length, 0);
    stmt('SELECT 2 AS n');
    stmt('SELECT 3 AS n');
    // the oldest went
    assert.notEqual(stmt('SELECT 1 AS n'), a);
    assert.deepEqual({ ...stmt('SELECT 1 AS n').get() as object }, { n: 1 });
    // fewer arguments than places: the missing ones are NULL, not what the last call left
    const two = stmt('SELECT ? AS a, ? AS b');
    two.get(1, 2);
    assert.deepEqual({ ...two.get(3) as object }, { a: 3, b: null });
    sql.close();
  });
});

describe('the database in fewer queries', () => {
  it('finds the newest message with each friend as the old query did', () => {
    const db = new Db(path.join(dir, 'messages.db'));
    const ids = ['a', 'b', 'c', 'd'].map((n) => db.signIn('dev', n, { handle: n, name: n, avatar: '' }).id);
    const [me, ...others] = ids;
    let t = 1000;
    const raw = db.sql;
    for (let i = 0; i < 40; i++) {
      const other = others[i % others.length];
      const [from, to] = i % 3 ? [me, other] : [other, me];
      raw.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at) VALUES (?, ?, ?, ?)').run(from, to, 'x', (t += (i * 7919) % 500));
    }
    // others talking among themselves do not count, a note to oneself does
    raw.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at) VALUES (?, ?, ?, ?)').run(others[0], others[1], 'x', 999_999);
    raw.prepare('INSERT INTO messages (from_uuid, to_uuid, text, created_at) VALUES (?, ?, ?, ?)').run(me, me, 'x', 5);
    const old = raw.prepare(`SELECT CASE WHEN from_uuid = ? THEN to_uuid ELSE from_uuid END AS other, MAX(created_at) AS at
      FROM messages WHERE from_uuid = ? OR to_uuid = ? GROUP BY other`).all(me, me, me) as { other: string; at: number }[];
    assert.deepEqual(db.lastMessageTimes(me), Object.fromEntries(old.map((r) => [r.other, Number(r.at)])));
    assert.equal(Object.keys(db.lastMessageTimes(me)).length, 4);
    // the indexes it reads are there (also in a database made before them: CREATE … IF NOT EXISTS on start)
    const indexes = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'messages'").all() as { name: string }[]).map((r) => r.name);
    assert.ok(indexes.includes('messages_from_at') && indexes.includes('messages_to_at'), indexes.join());
    db.close();
  });

  it("lists the admin panel's accounts with everything it listed before", () => {
    const db = new Db(path.join(dir, 'admin.db'));
    const ala = db.signIn('dev', 'ala', { handle: 'Ala', name: 'Ala', avatar: '' });
    const bob = db.signIn('discord', '42', { handle: 'Bob', name: 'Bob', avatar: 'https://cdn.discordapp.com/x.png' });
    db.link('minecraft', 'f'.repeat(32), ala.id, 'AlaMC');
    db.link('minecraft', 'e'.repeat(32), ala.id, 'AlaAlt');
    db.link('github', '7', ala.id);
    db.setCape(ala.id, 'rose');
    db.setCharacterLoadout(ala.id, 'e'.repeat(32), { cape: 'ocean', wings: 'angel' });
    db.addFriendship(ala.id, bob.id);
    db.addSession('h1', ala.id);
    db.addSession('h2', ala.id);
    // what adminUser counted before, one query at a time
    const before = (uuid: string) => {
      const u = db.user(uuid)!;
      const raw = db.sql.prepare('SELECT created_at, last_seen FROM users WHERE uuid = ?').get(uuid) as { created_at: number; last_seen: number };
      const n = (q: string, ...a: string[]) => (db.sql.prepare(q).get(...a) as { n: number }).n;
      return {
        ...u, createdAt: raw.created_at, lastSeen: raw.last_seen, providers: db.providers(uuid),
        friends: n('SELECT COUNT(*) AS n FROM friendships WHERE a = ? OR b = ?', uuid, uuid), sessions: n('SELECT COUNT(*) AS n FROM sessions WHERE uuid = ?', uuid),
        worn: db.minecraftAccounts(uuid).map((a) => ({ name: a.name, cape: a.loadout ? a.loadout.cape ?? '' : u.cape })),
      };
    };
    const { users, total } = db.listUsers('', 10, 0);
    assert.equal(total, 2);
    for (const u of users) assert.equal(JSON.stringify(u), JSON.stringify(before(u.id)));
    assert.deepEqual(users.find((u) => u.id === ala.id)!.worn, [{ name: 'AlaMC', cape: 'rose' }, { name: 'AlaAlt', cape: 'ocean' }]);
    assert.deepEqual(users.find((u) => u.id === ala.id)!.providers, ['dev', 'github', 'minecraft']);
    assert.equal(JSON.stringify(db.adminUser(bob.id)), JSON.stringify(before(bob.id)));
    assert.equal(db.adminUser('nobody'), undefined);
    assert.equal(db.listUsers('bo', 10, 0).users[0].handle, 'Bob');
    db.close();
  });

  it('gives the admin log with the handle of who did it', async () => {
    const boss = await login('Szef');
    const ala = await login('LogAla');
    await call('POST', `/v1/admin/users/${ala.user.id}`, boss.token, { rank: 'friend' });
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries;
    const entry = log.find((e: any) => e.action === 'set_rank' && e.target === 'LogAla');
    assert.ok(entry, JSON.stringify(log.slice(0, 3)));
    assert.equal(entry.admin, boss.user.id);
    assert.equal(entry.adminHandle, 'Szef');
    for (const key of ['id', 'at', 'action', 'detail']) assert.ok(key in entry);
  });

  it('gives the friends list as before, with the status and the badge', async () => {
    const ola = await login('ListaOla');
    const ewa = await login('ListaEwa');
    await call('POST', '/v1/friends/requests', ola.token, { handle: ewa.user.handle });
    await call('POST', `/v1/friends/requests/${ola.user.id}/accept`, ewa.token);
    const list = (await call('GET', '/v1/friends', ola.token)).body;
    const ewaRow = list.friends.find((f: any) => f.id === ewa.user.id);
    assert.ok(ewaRow, JSON.stringify(list));
    assert.deepEqual(Object.keys(ewaRow).slice(0, 5), ['id', 'handle', 'name', 'avatar', 'since']);
    assert.equal(ewaRow.presence.status, 'offline');
    assert.ok(ewaRow.presence.lastSeen > 0);
    assert.equal(ewaRow.unread, 0);
  });
});

describe('request log for the panel', () => {
  it('gives only what came after `since`, and counts the summary at most every few seconds', () => {
    const log = new RequestLog();
    const entry = (at: number, path: string) => ({ at, method: 'GET', path, route: path, status: 200, ms: 1, user: '', ip: '', client: 'launcher', version: '', error: '' });
    const now = Date.now();
    log.add(entry(now - 3000, '/v1/a'));
    log.add(entry(now - 2000, '/v1/b'));
    const all = log.query({});
    assert.deepEqual(all.entries.map((e) => e.path), ['/v1/b', '/v1/a']);
    assert.equal(all.summary.lastHour, 2);
    log.add(entry(now - 1000, '/v1/c'));
    const news = log.query({ since: now - 2000 });
    assert.deepEqual(news.entries.map((e) => e.path), ['/v1/c']);
    assert.equal(news.kept, 3);
    // the summary is the one counted a moment ago
    assert.equal(news.summary.lastHour, 2);
  });
});

/** A Minecraft account of the player, in a game with the launcher (what the HUD asks about). */
async function inGame(token: string, userId: string, n: number) {
  const hex = String(n).repeat(32).slice(0, 32);
  app.db.link('minecraft', hex, userId, `Mc${n}`);
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  assert.equal((await call('POST', '/v1/mc/link', token, { uuid })).status, 200);
  return uuid;
}
const NEW_HUD = ['friend_pink', 'supporter', 'colors', 'live'];
const lookup = async (uuids: string[], knownRanks?: string[]) => (await call('POST', '/v1/mc/lookup', undefined, { uuids, ...(knownRanks ? { knownRanks } : {}) })).text;

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

describe('cosmetics settings kept in memory', () => {
  it('reads them again after every change, from the panel, the shop and the supporters', () => {
    const db = new Db(path.join(dir, 'settings.db'));
    const wallet = new Wallet(db.sql);
    db.sql.exec(SUPPORTER_SCHEMA);
    assert.equal(db.cosmeticSettings().size, 0);
    db.setCosmetic('rose', false, true);
    assert.deepEqual({ ...db.cosmeticSettings().get('rose') }, { id: 'rose', enabled: false, exclusive: true });
    wallet.setPrice('galaxy', 250);
    assert.equal(db.cosmeticSettings().get('galaxy')?.price, 250);
    wallet.setPrice('galaxy', undefined);
    assert.equal(db.cosmeticSettings().get('galaxy'), undefined);
    setSupporterLevel(db.sql, 'ember', 2);
    assert.equal(db.cosmeticSettings().get('ember')?.supporter, 2);
    // each caller gets its own map; the settings themselves cannot be changed in place
    const mine = db.cosmeticSettings();
    mine.delete('rose');
    assert.ok(db.cosmeticSettings().has('rose'));
    assert.throws(() => {
      (db.cosmeticSettings().get('rose') as { enabled: boolean }).enabled = true;
    });
    db.close();
  });
});

describe("the game's lookup", () => {
  it('answers the same for the same state, and at once after a change', async () => {
    const boss = await login('Szef');
    const ala = await login('LookAla');
    const ola = await login('LookOla');
    const alaMc = await inGame(ala.token, ala.user.id, 3);
    const olaMc = await inGame(ola.token, ola.user.id, 4);
    await call('POST', '/v1/me', ala.token, { cape: 'ember', loadout: { wings: 'angel' } });
    const first = await lookup([alaMc, olaMc], NEW_HUD);
    assert.equal(await lookup([alaMc, olaMc], NEW_HUD), first);
    assert.deepEqual(JSON.parse(first).cosmetics[alaMc], { wings: 'angel', cape: 'ember' });
    // an older HUD is answered for what it knows, not with what the newer one got
    assert.equal(JSON.parse(await lookup([alaMc])).cosmetics[alaMc].cape, 'ember');
    // her own change: at once
    await call('POST', '/v1/me', ala.token, { cape: 'galaxy' });
    assert.equal(JSON.parse(await lookup([alaMc, olaMc], NEW_HUD)).cosmetics[alaMc].cape, 'galaxy');
    // a rank given in the panel: at once
    await call('POST', `/v1/admin/users/${ola.user.id}`, boss.token, { rank: 'friend' });
    assert.equal(JSON.parse(await lookup([alaMc, olaMc], NEW_HUD)).ranks[olaMc], 'friend');
    // an item switched off in the panel: at once, for everyone wearing it
    await call('POST', '/v1/admin/cosmetics/angel', boss.token, { enabled: false });
    assert.equal(JSON.parse(await lookup([alaMc, olaMc], NEW_HUD)).cosmetics[alaMc].wings, undefined);
    await call('POST', '/v1/admin/cosmetics/angel', boss.token, { enabled: true });
    // a ban: gone at once
    await call('POST', `/v1/admin/users/${ala.user.id}`, boss.token, { banned: true });
    const banned = JSON.parse(await lookup([alaMc, olaMc], NEW_HUD));
    assert.equal(banned.cosmetics[alaMc], undefined);
    assert.ok(banned.active.includes(alaMc));
  });

  it('shows a game that just started to the players around at once', async () => {
    const eva = await login('StartEva');
    const piotr = await login('StartPiotr');
    await call('POST', '/v1/me', eva.token, { cape: 'ember' });
    const piotrLive = await connect(piotr.token, { status: 'online', activity: { kind: 'server', server: 'skyup.pl' } });
    const evaLive = await connect(eva.token, { status: 'online', activity: { kind: 'server', server: 'skyup.pl' } });
    const evaMc = await inGame(eva.token, eva.user.id, 5);
    const got = await piotrLive.waitFor((e) => e.type === 'cosmetics');
    assert.ok(got.uuids.includes(evaMc), JSON.stringify(got));
    assert.deepEqual(got.cosmetics[evaMc], { cape: 'ember' });
    // the launcher saying it again every few minutes is no news
    await new Promise((r) => setTimeout(r, 400));
    await call('POST', '/v1/mc/link', eva.token, { uuid: evaMc });
    await new Promise((r) => setTimeout(r, 450));
    assert.equal(piotrLive.events.filter((e) => e.type === 'cosmetics').length, 1);
    piotrLive.ws.close();
    evaLive.ws.close();
  });
});

describe("the site's files in browsers", () => {
  /** What serveWeb answered: status, headers and the body. */
  async function serve(web: string, pathname: string, ifModifiedSince?: string, version?: string) {
    const out = { status: 0, headers: {} as Record<string, string>, body: '' as string | Buffer };
    const res = {
      writeHead: (status: number, headers: Record<string, string>) => Object.assign(out, { status, headers }),
      end: (data?: string | Buffer) => {
        out.body = data ?? '';
      },
    } as never;
    const ok = await serveWeb(web, pathname, res, ifModifiedSince, version);
    return { ok, ...out };
  }

  it('keeps versioned CSS and JS for good, pictures a day, and checks pages and the rest every time', async () => {
    const web = path.join(dir, 'web');
    mkdirSync(path.join(web, 'img'), { recursive: true });
    mkdirSync(path.join(web, 'vendor', 'fonts'), { recursive: true });
    writeFileSync(path.join(web, 'index.html'), '<!doctype html><link href="/style.css" rel="stylesheet"><script src="/app.js"></script>');
    writeFileSync(path.join(web, 'style.css'), 'body{}');
    writeFileSync(path.join(web, 'app.js'), "import './other.js';");
    writeFileSync(path.join(web, 'img', 'cape.png'), 'png');
    writeFileSync(path.join(web, 'logo.png'), 'png');
    writeFileSync(path.join(web, 'vendor', 'fonts', 'x.woff2'), 'font');
    const page = await serve(web, '/');
    assert.equal(page.headers['Cache-Control'], 'no-cache');
    const version = /style\.css\?v=([\w]+)"/.exec(String(page.body))![1];
    assert.equal((await serve(web, '/style.css', undefined, version)).headers['Cache-Control'], 'public, max-age=31536000, immutable');
    assert.equal((await serve(web, '/app.js', undefined, version)).headers['Cache-Control'], 'public, max-age=31536000, immutable');
    // without the version, or with another one (an older deploy's), as before
    assert.equal((await serve(web, '/style.css')).headers['Cache-Control'], 'no-cache');
    assert.equal((await serve(web, '/style.css', undefined, 'old')).headers['Cache-Control'], 'no-cache');
    assert.equal((await serve(web, '/', undefined, version)).headers['Cache-Control'], 'no-cache');
    const picture = await serve(web, '/img/cape.png');
    assert.equal(picture.headers['Cache-Control'], 'public, max-age=86400, stale-while-revalidate=604800');
    assert.ok(picture.headers['Last-Modified']);
    assert.equal((await serve(web, '/vendor/fonts/x.woff2')).headers['Cache-Control'], 'public, max-age=86400, stale-while-revalidate=604800');
    // pictures elsewhere are checked every time
    assert.equal((await serve(web, '/logo.png')).headers['Cache-Control'], 'no-cache');
    const again = await serve(web, '/img/cape.png', picture.headers['Last-Modified']);
    assert.equal(again.status, 304);
    assert.equal(again.headers['Cache-Control'], 'public, max-age=86400, stale-while-revalidate=604800');
  });

  it('serves a file changed on disk at once, though it keeps files in memory', async () => {
    const web = path.join(dir, 'web2');
    mkdirSync(web, { recursive: true });
    const file = path.join(web, 'note.txt');
    writeFileSync(file, 'first');
    assert.equal(String((await serve(web, '/note.txt')).body), 'first');
    assert.equal(String((await serve(web, '/note.txt')).body), 'first');
    writeFileSync(file, 'second version');
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    assert.equal(String((await serve(web, '/note.txt')).body), 'second version');
  });
});

describe('public API answers with an ETag', () => {
  it('answers "not changed" to a client that has the catalog, the switches and the ranks already', async () => {
    for (const url of ['/v1/cosmetics', '/v1/features', '/v1/ranks']) {
      const first = await call('GET', url, undefined, undefined, { 'X-SlashClient': 'launcher/0.9.69' });
      assert.equal(first.status, 200);
      const tag = first.headers.get('etag');
      assert.match(tag ?? '', /^W\/"/, url);
      assert.equal(first.headers.get('cache-control'), 'no-cache');
      assert.match(first.headers.get('vary') ?? '', /X-SlashClient/);
      const again = await fetch(base + url, { headers: { 'If-None-Match': tag!, 'X-SlashClient': 'launcher/0.9.69' } });
      assert.equal(again.status, 304, url);
      assert.equal(await again.text(), '');
      // a stale tag: the whole answer
      const stale = await fetch(base + url, { headers: { 'If-None-Match': 'W/"old"', 'X-SlashClient': 'launcher/0.9.69' } });
      assert.equal(stale.status, 200);
      assert.equal(await stale.text(), first.text);
    }
  });

  it('never keeps what a signed-in player gets', async () => {
    const ala = await login('TagAla');
    const mine = await call('GET', '/v1/cosmetics', ala.token);
    assert.equal(mine.headers.get('cache-control'), 'no-store');
    assert.equal(mine.headers.get('etag'), null);
    assert.equal((await call('GET', '/v1/me', ala.token)).headers.get('cache-control'), 'no-store');
    assert.equal((await call('GET', '/v1/health')).headers.get('etag'), null);
  });
});

describe('only what each client reads', () => {
  const as = async (url: string, client?: string, token?: string) => (await call('GET', url, token, undefined, client ? { 'X-SlashClient': client } : {})).body;

  it('sends the capes list of the catalog only to launchers before 0.8 and the website, and the emotes to nobody', async () => {
    const fresh = await as('/v1/cosmetics', 'launcher/0.9.69');
    assert.equal(fresh.capes, undefined);
    assert.ok(fresh.items.some((i: any) => i.slot === 'cape'));
    assert.equal(fresh.emotes, undefined);
    assert.equal((await as('/v1/cosmetics', 'mod/0.9.70')).capes, undefined);
    assert.equal((await as('/v1/cosmetics', 'launcher/0.8.0')).capes, undefined);
    // a launcher before 0.8, an unnamed client and the website still get them
    for (const client of ['launcher/0.7.3', undefined]) {
      const old = await as('/v1/cosmetics', client);
      assert.ok(Array.isArray(old.capes) && old.capes.length, String(client));
      assert.deepEqual(Object.keys(old.capes[0]), ['id', 'name', 'exclusive', 'available']);
    }
    const site = await (await fetch(base + '/v1/cosmetics', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json() as any;
    assert.ok(site.capes.length);
    // every item keeps all its fields for everyone (games read `available` as it is)
    assert.ok(fresh.items.every((i: any) => typeof i.available === 'boolean' && typeof i.exclusive === 'boolean'));
  });

  it("leaves out the lookup's capes for HUDs reading cosmetics, and the clans' logos nobody draws", async () => {
    const ewa = await login('TrimEwa');
    const mc = await inGame(ewa.token, ewa.user.id, 6);
    await call('POST', '/v1/me', ewa.token, { cape: 'ember' });
    const fresh = JSON.parse(await lookup([mc], NEW_HUD));
    assert.equal(fresh.capes, undefined);
    assert.equal(fresh.cosmetics[mc].cape, 'ember');
    assert.equal(fresh.clanLogos, undefined);
    // HUDs before 0.9.23 still get them
    assert.deepEqual(JSON.parse(await lookup([mc], ['friend_pink', 'supporter'])).capes, { [mc]: 'ember' });
    assert.deepEqual(JSON.parse(await lookup([mc])).capes, { [mc]: 'ember' });
  });

  it("leaves out of the account what only the website reads, for launchers from 0.9.70", async () => {
    const ala = await login('TrimAla');
    const full = await as('/v1/me', undefined, ala.token);
    for (const key of ['grants', 'avatars', 'avatarSource']) assert.ok(key in full, key);
    const older = await as('/v1/me', 'launcher/0.9.69', ala.token);
    assert.deepEqual(Object.keys(older), Object.keys(full));
    const lean = await as('/v1/me', 'launcher/0.9.70', ala.token);
    for (const key of ['grants', 'avatars', 'avatarSource']) assert.equal(lean[key], undefined, key);
    // and nothing else is missing
    assert.deepEqual(Object.keys(lean), Object.keys(full).filter((k) => !['grants', 'avatars', 'avatarSource'].includes(k)));
    assert.equal((await as('/v1/me', 'launcher/0.9.70-beta.1', ala.token)).grants, undefined);
    assert.equal((await as('/v1/me', 'mod/0.9.70', ala.token)).avatars, undefined);
    // changing the account answers the same way
    const changed = (await call('POST', '/v1/me', ala.token, { showServer: false }, { 'X-SlashClient': 'launcher/0.9.70' })).body;
    assert.equal(changed.showServer, false);
    assert.equal(changed.grants, undefined);
    assert.ok('avatars' in (await call('POST', '/v1/me', ala.token, { showServer: true })).body);

    // the live connection: only a launcher that names itself and its version
    const ready = async (extra: Record<string, unknown>) => {
      const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
      await new Promise((r) => ws.once('open', r));
      const got = new Promise<any>((r) => ws.on('message', (d) => {
        const e = JSON.parse(String(d));
        if (e.type === 'ready') r(e);
      }));
      ws.send(JSON.stringify({ type: 'auth', token: ala.token, ...extra }));
      const e = await got;
      ws.close();
      return e.me;
    };
    assert.ok('grants' in await ready({}));
    assert.ok('grants' in await ready({ client: 'launcher', version: '0.9.69' }));
    assert.ok('avatars' in await ready({ client: 'app' }));
    const leanReady = await ready({ client: 'launcher', version: '0.9.70' });
    assert.equal(leanReady.grants, undefined);
    assert.equal(leanReady.handle, 'TrimAla');
    await new Promise((r) => setTimeout(r, 200));
  });
});

describe('live events', () => {
  it('sends the features and the banner with the features event', async () => {
    const boss = await login('Szef');
    const live = await connect(boss.token);
    const before = (await call('GET', '/v1/features')).body;
    await call('POST', '/v1/admin/settings', boss.token, { values: { 'feature.clans': false } });
    const e = await live.waitFor((x) => x.type === 'features');
    const now = (await call('GET', '/v1/features')).body;
    assert.deepEqual(e.features, now.features);
    assert.deepEqual(e.banner, now.banner);
    assert.notDeepEqual(before.features, now.features);
    await call('POST', '/v1/admin/settings', boss.token, { values: { 'feature.clans': true } });
    live.ws.close();
    // the server sees the connection end (and notes the player's last visit) before it shuts down
    await new Promise((r) => setTimeout(r, 200));
  });
});
