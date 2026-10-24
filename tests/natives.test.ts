import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { clearNatives } from '../src/main/install';

describe('natives folder before a launch', () => {
  it('empties what it can and does not fail on a file a running game keeps open', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'natives-'));
    await fs.mkdir(path.join(dir, 'jna'));
    await fs.writeFile(path.join(dir, 'lwjgl.dll'), 'x');
    // read-only stands in for a DLL loaded by the other game: Windows refuses to delete it (EPERM)
    const held = path.join(dir, 'jna', 'jna123.dll');
    await fs.writeFile(held, 'x');
    await fs.chmod(held, 0o444);
    await clearNatives(dir);
    assert.equal(existsSync(path.join(dir, 'lwjgl.dll')), false);
    await fs.chmod(held, 0o644).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  });
});
