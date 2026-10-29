import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { DB_KEY, LEASE_KEY, Leader, Replica, restore, type Lease } from '../src/failover.ts';
import { S3Backend } from '../src/s3.ts';
import { startFakeS3, type FakeS3 } from './fakeS3.ts';

// A spare server ready to take over: one lease at a time, the copies it restores from.

let fake: FakeS3;
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'slash-failover-'));
  dirs.push(d);
  return d;
};
let prefixN = 0;
/** A fresh corner of the bucket for each test. */
const bucket = () => new S3Backend({ endpoint: fake.url, region: 'auto', bucket: 'fo', accessKeyId: 'AKFO', secretAccessKey: 'sekret', prefix: `t${++prefixN}/` });

before(async () => {
  fake = await startFakeS3({ bucket: 'fo', region: 'auto', keys: { AKFO: 'sekret' } });
});
after(async () => {
  await fake.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('the failover lease', () => {
  it('goes to one server; the other takes it only once it is stale, and the first then stops', async () => {
    const store = bucket();
    let clock = 1_000_000;
    const lost: (Lease | undefined)[] = [];
    const a = new Leader({ node: 'pl1', store, now: () => clock, onLost: (h) => lost.push(h) });
    const b = new Leader({ node: 'de1', store, now: () => clock, onLost: () => assert.fail('b lost') });
    assert.deepEqual(await a.acquire(), { ok: true, term: 1 });
    // the spare cannot start while the main one renews
    clock += 60_000;
    await a.renew();
    clock += 60_000;
    const refused = await b.acquire();
    assert.equal(refused.ok, false);
    assert.equal(!refused.ok && refused.holder?.node, 'pl1');
    // the main one stops renewing (down): after 90 s the spare takes it, in a new term
    clock += 91_000;
    assert.deepEqual(await b.acquire(), { ok: true, term: 2 });
    // the old one, back, finds it gone at its next renewal and stops
    await a.renew();
    assert.equal(lost.length, 1);
    assert.equal(lost[0]?.node, 'de1');
    assert.equal(a.holding, false);
    // and restarted, it does not start while the new one holds it
    const again = new Leader({ node: 'pl1', store, now: () => clock, onLost: () => {} });
    assert.equal((await again.acquire()).ok, false);
    // a restart of the holder keeps its term
    const bAgain = new Leader({ node: 'de1', store, now: () => clock, onLost: () => {} });
    assert.deepEqual(await bAgain.acquire(), { ok: true, term: 2 });
  });

  it('two servers racing for a free lease: only one gets it', async () => {
    const store = bucket();
    const results = await Promise.all(['x1', 'x2', 'x3'].map((node) => new Leader({ node, store, onLost: () => {} }).acquire()));
    assert.equal(results.filter((r) => r.ok).length, 1);
    const lease = JSON.parse((await store.readTagged(LEASE_KEY))!.data.toString('utf8')) as Lease;
    assert.equal(lease.term, 1);
  });

  it('a bucket out of reach does not stop the main server', async () => {
    const store = bucket();
    const a = new Leader({ node: 'pl1', store, onLost: () => assert.fail('lost'), log: () => {} });
    await a.acquire();
    fake.failNext(2);
    await a.renew();
    assert.equal(a.holding, true);
    await a.renew();
    assert.equal(a.holding, true);
  });
});

describe('the copies the spare restores from', () => {
  it('copies the database and the files, and the spare puts them back in place', async () => {
    const store = bucket();
    const mainDir = tmp();
    const dbFile = path.join(mainDir, 'social.db');
    const app = createApp({ dbFile, publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {} });
    await new Promise<void>((r) => app.server.listen(0, r));
    const base = `http://127.0.0.1:${(app.server.address() as import('node:net').AddressInfo).port}`;
    try {
      const leader = new Leader({ node: 'pl1', store, onLost: () => {} });
      await leader.acquire();
      let clock = Date.parse('2026-10-29T08:00:00Z');
      const replica = new Replica({ node: 'pl1', store, db: app.db.sql, dbFile, dataDir: mainDir, leader, now: () => clock });
      await fetch(base + '/v1/auth/dev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Zapasowy' }) });
      assert.equal(await replica.copyDb(), true);
      // nothing changed: no copy
      clock += 30_000;
      assert.equal(await replica.copyDb(), false);
      assert.ok(fake.objects.has(`t${prefixN}/${DB_KEY}`));
      assert.ok(fake.objects.has(`t${prefixN}/db/hourly/2026-10-29T08.db.gz`));
      assert.ok(fake.objects.has(`t${prefixN}/db/daily/2026-10-29.db.gz`));

      await fs.mkdir(path.join(mainDir, 'logs', 'ab'), { recursive: true });
      await fs.writeFile(path.join(mainDir, 'logs', 'ab', 'log1.gz'), 'pierwszy');
      await fs.writeFile(path.join(mainDir, 'gone.txt'), 'zniknie');
      assert.deepEqual(await replica.copyFiles(), { sent: 2, removed: 0 });
      // unchanged: nothing sent; one changed, one removed
      assert.deepEqual(await replica.copyFiles(), { sent: 0, removed: 0 });
      await fs.writeFile(path.join(mainDir, 'logs', 'ab', 'log1.gz'), 'drugi, dłuższy');
      await fs.rm(path.join(mainDir, 'gone.txt'));
      assert.deepEqual(await replica.copyFiles(), { sent: 1, removed: 1 });

      // the spare: an old database of its own is kept aside, the copy put in its place
      const spareDir = tmp();
      const spareDb = path.join(spareDir, 'social.db');
      await fs.writeFile(spareDb, 'stara baza');
      const done = await restore({ store, dbFile: spareDb, dataDir: spareDir, now: () => 42 });
      assert.equal(done.files, 1);
      assert.equal(await fs.readFile(path.join(spareDir, 'logs', 'ab', 'log1.gz'), 'utf8'), 'drugi, dłuższy');
      assert.equal(await fs.readFile(path.join(spareDir, 'social.db.before-restore-42'), 'utf8'), 'stara baza');
      await assert.rejects(fs.access(path.join(spareDir, 'gone.txt')));
      const restored = new DatabaseSync(spareDb);
      const user = restored.prepare("SELECT name FROM users WHERE name = 'Zapasowy'").get() as { name: string } | undefined;
      restored.close();
      assert.equal(user?.name, 'Zapasowy');
      // the same again: nothing more to fetch
      assert.equal((await restore({ store, dbFile: spareDb, dataDir: spareDir })).files, 0);
    } finally {
      await app.close();
    }
  });

  it('a server without the lease copies nothing (the new main server copies)', async () => {
    const store = bucket();
    const dir = tmp();
    const db = new DatabaseSync(path.join(dir, 'social.db'));
    db.exec('CREATE TABLE t (x)');
    const leader = new Leader({ node: 'pl1', store, onLost: () => {} });
    const replica = new Replica({ node: 'pl1', store, db, dbFile: path.join(dir, 'social.db'), dataDir: dir, leader });
    assert.equal(await replica.copyDb(true), false);
    assert.deepEqual(await replica.copyFiles(), { sent: 0, removed: 0 });
    db.close();
  });

  it('hourly copies older than 48 hours and daily ones older than 30 days go', async () => {
    const store = bucket();
    const dir = tmp();
    const dbFile = path.join(dir, 'social.db');
    const db = new DatabaseSync(dbFile);
    db.exec('CREATE TABLE t (x)');
    await store.put('db/hourly/2026-10-26T08.db.gz', Buffer.from('x'));
    await store.put('db/hourly/2026-10-28T09.db.gz', Buffer.from('x'));
    await store.put('db/daily/2026-09-01.db.gz', Buffer.from('x'));
    await store.put('db/daily/2026-10-20.db.gz', Buffer.from('x'));
    const leader = new Leader({ node: 'pl1', store, onLost: () => {} });
    await leader.acquire();
    const replica = new Replica({ node: 'pl1', store, db, dbFile, dataDir: dir, leader, now: () => Date.parse('2026-10-29T08:30:00Z') });
    await replica.copyDb(true);
    const keys = (await store.list('db/')).map((o) => o.key).sort();
    assert.deepEqual(keys, ['db/daily/2026-10-20.db.gz', 'db/daily/2026-10-29.db.gz', 'db/hourly/2026-10-28T09.db.gz', 'db/hourly/2026-10-29T08.db.gz', 'db/latest.db.gz', 'db/latest.json']);
    db.close();
  });
});
