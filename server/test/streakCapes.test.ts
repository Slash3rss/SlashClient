import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { ACHIEVEMENTS, dayOf } from '../src/achievements.ts';
import { ITEMS, mayWear } from '../src/cosmetics.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-streak-capes-'));
const file = path.join(dir, 'old.db');
const DAY = 86_400_000;
const STREAKS: [string, string][] = [['streak_7', 'streak7'], ['streak_14', 'streak14'], ['streak_30', 'streak30'], ['streak_60', 'streak60'], ['streak_100', 'streak100'], ['streak_365', 'streak365']];
const SETS = ['dragonscale', 'hellfire', 'heavens', 'jollyroger', 'autumnleaves', 'sapphirecape', 'dragonelytra', 'obsidianelytra', 'sapphireelytra'];
let app: ReturnType<typeof createApp>;
let base = '';
let veteran = '';

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };
const wearable = (uuid: string, id: string) => mayWear(app.db.cosmeticSettings(), app.db.grants(uuid), id, ITEMS.find((i) => i.id === id)!.slot);

async function start() {
  app = createApp({ dbFile: file, publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {} });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

before(async () => {
  // a database from before 0.9.70: a player who had reached a 14-day streak when those achievements gave no cape
  const sql = new DatabaseSync(file);
  sql.exec(`CREATE TABLE users (uuid TEXT PRIMARY KEY, handle TEXT NOT NULL, handle_lower TEXT NOT NULL UNIQUE, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '',
    show_server INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, cape TEXT NOT NULL DEFAULT '');
    CREATE TABLE cape_grants (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, cape TEXT NOT NULL, PRIMARY KEY (uuid, cape));
    CREATE TABLE achievements (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, id TEXT NOT NULL, unlocked_at INTEGER NOT NULL, PRIMARY KEY (uuid, id));`);
  veteran = randomUUID();
  const at = Date.now() - 100 * DAY;
  sql.prepare('INSERT INTO users (uuid, handle, handle_lower, name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)').run(veteran, 'Wytrwaly', 'wytrwaly', 'Wytrwaly', at, at);
  for (const id of ['streak_3', 'streak_7', 'streak_14']) sql.prepare('INSERT INTO achievements (uuid, id, unlocked_at) VALUES (?, ?, ?)').run(veteran, id, at);
  sql.close();
  await start();
});

after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the streak capes and the sets\' capes and elytras', () => {
  it('makes every streak achievement give its cape, and sells the sets\' items', () => {
    for (const [achievement, cape] of STREAKS) {
      assert.equal(ACHIEVEMENTS.find((a) => a.id === achievement)?.reward, cape);
      assert.equal(ITEMS.find((i) => i.id === cape)?.achievement, achievement);
    }
    assert.deepEqual(['streak100', 'streak365'].map((id) => ITEMS.find((i) => i.id === id)?.frames), [8, 8]);
    for (const id of SETS) assert.ok((ITEMS.find((i) => i.id === id)?.price ?? 0) >= 400, id);
  });

  it('is hidden from launchers before 0.9.70', async () => {
    const ids = async (version: string) => (await call('GET', '/v1/cosmetics', undefined, undefined, { 'X-SlashClient': `launcher/${version}` })).body.items as { id: string; frames?: number }[];
    const older = (await ids('0.9.69')).map((i) => i.id);
    assert.ok(older.includes('streak30'));
    for (const id of ['streak7', 'streak365', ...SETS]) assert.ok(!older.includes(id), id);
    const newer = await ids('0.9.70');
    for (const id of ['streak7', 'streak365', ...SETS]) assert.ok(newer.some((i) => i.id === id), id);
    assert.equal(newer.find((i) => i.id === 'streak100')?.frames, 8);
  });

  it('gives the capes to whoever had the streak already, once', async () => {
    assert.ok(wearable(veteran, 'streak7') && wearable(veteran, 'streak14'));
    assert.ok(!wearable(veteran, 'streak30') && !wearable(veteran, 'streak60'));
    // an admin's revoke after it stays: a restart does not give it again
    app.db.revoke(veteran, 'streak7');
    await app.close();
    await start();
    assert.ok(!wearable(veteran, 'streak7') && wearable(veteran, 'streak14'));
  });

  it('gives a new player the 7- and 14-day capes with the streak', async () => {
    const p = await login('NowaSeria');
    assert.equal((await call('POST', '/v1/me', p.token, { cape: 'streak7' })).body.error, 'bad_cape');
    const now = Date.now();
    for (let d = 0; d < 14; d++) app.achievements.store.addPlay(p.user.id, dayOf(now - d * DAY), 600);
    const fresh = app.achievements.check(p.user.id, now).map((a) => a.id);
    assert.ok(fresh.includes('streak_7') && fresh.includes('streak_14'));
    assert.equal((await call('POST', '/v1/me', p.token, { cape: 'streak14' })).body.cape, 'streak14');
    assert.ok(wearable(p.user.id, 'streak7') && !wearable(p.user.id, 'streak60'));
  });

  it('sells the sets\' capes and elytras for sparks', async () => {
    const p = await login('Kupiec');
    app.wallet.change(p.user.id, 1500, 'admin', '', 'test');
    assert.equal((await call('POST', '/v1/shop/dragonscale/buy', p.token)).status, 200);
    assert.equal((await call('POST', '/v1/shop/dragonelytra/buy', p.token)).status, 200);
    assert.ok(wearable(p.user.id, 'dragonscale') && wearable(p.user.id, 'dragonelytra'));
    assert.equal((await call('POST', '/v1/shop/streak7/buy', p.token)).body.error, 'not_for_sale');
  });
});
