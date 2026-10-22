import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, describe, it } from 'node:test';
import { Db } from '../src/db.ts';

// Linking Spotify accounts is gone (the launcher reads what plays from the computer): a database
// from before keeps no Spotify tokens and no Spotify app keys once the server starts, every time.

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-spotify-gone-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('Spotify linking removed', () => {
  it('drops the linked accounts and the app keys on start, and starts again fine', () => {
    const file = path.join(dir, 'social.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE spotify_accounts (uuid TEXT PRIMARY KEY, spotify_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', refresh TEXT NOT NULL, linked_at INTEGER NOT NULL);
INSERT INTO spotify_accounts VALUES ('u1', 's1', 'Ola', 'sealed-refresh-token', 1);
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL DEFAULT '');
INSERT INTO app_settings VALUES ('spotify.clientSecret', '"sealed"', 1, 'Szef'), ('spotify.clientId', '"id"', 1, 'Szef'), ('streams.enabled', 'true', 1, 'Szef');`);
    old.close();
    for (let run = 0; run < 2; run++) {
      const db = new Db(file);
      const tables = (db.sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
      assert.ok(!tables.includes('spotify_accounts'));
      const keys = (db.sql.prepare('SELECT key FROM app_settings').all() as { key: string }[]).map((r) => r.key);
      assert.deepEqual(keys, ['streams.enabled']);
      db.close();
    }
  });
});
