import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ConsoleHistory } from '../src/main/consoleHistory';

describe('console history', () => {
  it('keeps each session’s console, lists them newest first, and only the last ten', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-console-'));
    const history = new ConsoleHistory(root);
    for (let i = 1; i <= 12; i++) {
      const s = await history.start('profile-1', 1000 + i);
      s.line(`[12:00:0${i % 10}] [Render thread/INFO]: line ${i}`);
      await s.end(i === 12 ? 1 : 0, i === 12);
    }
    const list = await history.list('profile-1');
    assert.equal(list.length, 10);
    assert.equal(list[0].id, '1012');
    assert.equal(list[0].crashed, true);
    assert.equal(list.at(-1)!.id, '1003');
    assert.match(await history.read('profile-1', '1012'), /line 12/);
    // a session the launcher did not see end is still listed
    await fs.writeFile(path.join(root, 'profile-1', '2000.log'), 'unfinished\n');
    assert.equal((await history.list('profile-1'))[0].id, '2000');
    // no way out of its folder
    await assert.rejects(history.read('profile-1', '../../etc/passwd'), /bad_session/);
    await assert.rejects(history.list('../x'), /bad_profile/);
    assert.deepEqual(await history.list('nothing-yet'), []);
    await history.forget('profile-1');
    assert.deepEqual(await history.list('profile-1'), []);
    await fs.rm(root, { recursive: true });
  });
});
