import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { addToLibrary, iconId, libraryFile, libraryIcons, removeFromLibrary } from '../src/main/iconLibrary';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'iconlib-'));

describe('icon library', () => {
  it('keeps each icon once, the newest used first', async () => {
    const dir = path.join(await tmp(), 'lib');
    const a = await addToLibrary(dir, Buffer.from('a'), 'png');
    const b = await addToLibrary(dir, Buffer.from('b'), 'gif');
    // the same picture again: no copy, only moved to the front
    await fs.utimes(path.join(dir, b), new Date(Date.now() + 1000), new Date(Date.now() + 1000));
    assert.equal(await addToLibrary(dir, Buffer.from('a'), 'png'), a);
    await fs.utimes(path.join(dir, a), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    const icons = await libraryIcons(dir);
    assert.deepEqual(icons.map((i) => i.id), [a, b]);
    assert.equal(a, iconId(Buffer.from('a'), 'png'));
  });

  it('takes in the profiles icons from before, once', async () => {
    const root = await tmp();
    const dir = path.join(root, 'lib');
    const old = path.join(root, 'icon.webp');
    await fs.writeFile(old, 'old');
    assert.deepEqual((await libraryIcons(dir, [old, path.join(root, 'missing.png')])).map((i) => i.id), [iconId(Buffer.from('old'), 'webp')]);
    // removed by the player: it does not come back from the profile that still has it
    await removeFromLibrary(dir, iconId(Buffer.from('old'), 'webp'));
    assert.deepEqual(await libraryIcons(dir, [old]), []);
  });

  it('refuses ids that are not its own files', async () => {
    const dir = path.join(await tmp(), 'lib');
    await addToLibrary(dir, Buffer.from('x'), 'png');
    assert.throws(() => libraryFile(dir, '../profiles.json'));
    assert.throws(() => libraryFile(dir, '0123456789abcdef.png'));
    assert.equal(libraryFile(dir, iconId(Buffer.from('x'), 'png')), path.join(dir, iconId(Buffer.from('x'), 'png')));
  });
});
