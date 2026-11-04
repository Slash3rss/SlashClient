import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { Db } from '../src/db.ts';
import { RequestLog } from '../src/requests.ts';
import { statements } from '../src/statements.ts';

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
