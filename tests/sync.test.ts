import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('shared game settings', () => {
  it('passes options and the server list from one profile to another', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-sync-'));
    // paths are resolved when the module loads, so point it at a temp folder first
    process.env.SLASHCLIENT_HOME = root;
    const { pullShared, pushShared } = await import('../src/main/sync.js');
    const a = path.join(root, 'instances', 'a');
    const b = path.join(root, 'instances', 'b');
    await fs.mkdir(a, { recursive: true });
    await fs.mkdir(b, { recursive: true });

    // nothing shared yet: the first profile keeps its own files
    assert.deepEqual(await pullShared(a), []);
    await fs.writeFile(path.join(a, 'options.txt'), 'fov:0.5\nkey_key.jump:key.keyboard.space\n');
    await fs.writeFile(path.join(a, 'servers.dat'), 'SERVERS');
    await pushShared(a);

    // the second profile starts with them
    assert.deepEqual((await pullShared(b)).sort(), ['options.txt', 'servers.dat']);
    assert.equal(await fs.readFile(path.join(b, 'options.txt'), 'utf8'), 'fov:0.5\nkey_key.jump:key.keyboard.space\n');

    // and changes made there come back to the first one
    await fs.writeFile(path.join(b, 'options.txt'), 'fov:1.0\n');
    await pushShared(b);
    await pullShared(a);
    assert.equal(await fs.readFile(path.join(a, 'options.txt'), 'utf8'), 'fov:1.0\n');
  });
});
