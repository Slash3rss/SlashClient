import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { lastTarget, serverFromLog, worldPlayedSince } from '../src/main/sessions';

describe('back to the game', () => {
  it('reads the server from the game log', () => {
    assert.equal(serverFromLog('[12:00:00] [Render thread/INFO]: Connecting to skyup.pl, 25565'), 'skyup.pl');
    assert.equal(serverFromLog('[12:00:00] [Render thread/INFO]: Connecting to 10.0.0.5, 25570'), '10.0.0.5:25570');
    assert.equal(serverFromLog('[12:00:00] [Render thread/INFO]: Setting user: Steve'), undefined);
  });

  it('finds the world saved during the session', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-session-'));
    for (const w of ['Old', 'Played']) {
      await fs.mkdir(path.join(dir, 'saves', w), { recursive: true });
      await fs.writeFile(path.join(dir, 'saves', w, 'level.dat'), 'x');
    }
    const past = new Date(Date.now() - 3_600_000);
    await fs.utimes(path.join(dir, 'saves', 'Old', 'level.dat'), past, past);
    const found = await worldPlayedSince(dir, Date.now() - 60_000);
    assert.equal(found?.folder, 'Played');
  });

  it('picks whatever happened last', () => {
    const server = { address: 'skyup.pl', at: 2000 };
    assert.deepEqual(lastTarget(server, { folder: 'W', name: 'World', savedAt: 3000 }), { kind: 'world', folder: 'W', name: 'World' });
    assert.deepEqual(lastTarget(server, { folder: 'W', name: 'World', savedAt: 1000 }), { kind: 'server', address: 'skyup.pl' });
    assert.equal(lastTarget(undefined, undefined), undefined);
  });
});
