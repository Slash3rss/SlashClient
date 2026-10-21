import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { copyManualFiles, downloadLink, findManualFiles, FolderWatch, manualDest, manualKey, type ManualFile } from '../src/main/manualFiles';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-manual-'));
const entry = (fileName: string, content?: string, extra: Partial<ManualFile> = {}): ManualFile => ({
  title: fileName, fileName, url: `https://www.curseforge.com/minecraft/mc-mods/x/download/1`, folder: 'mods',
  ...(content !== undefined ? { sha1: sha1(content), size: Buffer.byteLength(content) } : {}), ...extra,
});

describe('finding files downloaded by hand', () => {
  it('finds a file by its SHA-1 even under another name, and ignores one with the wrong hash', async () => {
    const downloads = await tmp();
    await fs.writeFile(path.join(downloads, 'kept (1).jar'), 'kept mod');
    await fs.writeFile(path.join(downloads, 'other.jar'), 'kept mox');
    const kept = entry('kept.jar', 'kept mod');
    const other = entry('other.jar', 'the real other');
    const found = await findManualFiles([kept, other], [downloads]);
    assert.equal(found.get(manualKey(kept)), path.join(downloads, 'kept (1).jar'));
    assert.equal(found.has(manualKey(other)), false);
  });

  it('with a hash but no size, reads only files of the same name', async () => {
    const downloads = await tmp();
    await fs.writeFile(path.join(downloads, 'renamed.jar'), 'content');
    const f = entry('mod.jar', 'content', { size: undefined });
    assert.equal((await findManualFiles([f], [downloads])).size, 0);
    // a dropped file is checked whatever its name
    assert.equal((await findManualFiles([f], [], [path.join(downloads, 'renamed.jar')])).get(manualKey(f)), path.join(downloads, 'renamed.jar'));
    await fs.writeFile(path.join(downloads, 'mod.jar'), 'content');
    assert.equal((await findManualFiles([f], [downloads])).get(manualKey(f)), path.join(downloads, 'mod.jar'));
  });

  it('an old entry without a hash matches by exact file name and, when known, size', async () => {
    const downloads = await tmp();
    await fs.writeFile(path.join(downloads, 'old.jar'), 'whatever');
    await fs.writeFile(path.join(downloads, 'sized.jar'), '12345');
    const old = entry('old.jar');
    const sizedRight = entry('sized.jar', undefined, { size: 5 });
    const sizedWrong = { ...entry('sized.jar', undefined, { size: 6 }), folder: 'resourcepacks' };
    const found = await findManualFiles([old, sizedRight, sizedWrong], [downloads]);
    assert.equal(found.get(manualKey(old)), path.join(downloads, 'old.jar'));
    assert.equal(found.get(manualKey(sizedRight)), path.join(downloads, 'sized.jar'));
    assert.equal(found.has(manualKey(sizedWrong)), false);
  });

  it('ignores downloads still in progress and looks only at the folder\'s top level', async () => {
    const downloads = await tmp();
    await fs.writeFile(path.join(downloads, 'a.jar.crdownload'), 'a');
    await fs.writeFile(path.join(downloads, 'b.jar.part'), 'b');
    await fs.writeFile(path.join(downloads, 'c.tmp'), 'c');
    await fs.mkdir(path.join(downloads, 'sub'));
    await fs.writeFile(path.join(downloads, 'sub', 'd.jar'), 'd');
    const files = [entry('a.jar', 'a'), entry('b.jar', 'b'), entry('c.jar', 'c'), entry('d.jar', 'd')];
    assert.equal((await findManualFiles(files, [downloads, path.join(downloads, 'missing')])).size, 0);
  });

  it('copies found files into the profile\'s folder, never outside it', async () => {
    const downloads = await tmp();
    const game = await tmp();
    await fs.writeFile(path.join(downloads, 'kept.jar'), 'kept mod');
    await fs.writeFile(path.join(downloads, 'pack.zip'), 'pack');
    const kept = entry('kept.jar', 'kept mod');
    const pack = { ...entry('pack.zip', 'pack'), folder: 'resourcepacks' };
    const evil = { ...entry('evil.jar', 'kept mod'), folder: '..' };
    const found = await findManualFiles([kept, pack], [downloads]);
    found.set(manualKey(evil), path.join(downloads, 'kept.jar'));
    const copied = await copyManualFiles(game, [kept, pack, evil], found);
    assert.deepEqual(copied, [manualKey(kept), manualKey(pack)]);
    assert.equal(await fs.readFile(path.join(game, 'mods', 'kept.jar'), 'utf8'), 'kept mod');
    assert.equal(await fs.readFile(path.join(game, 'resourcepacks', 'pack.zip'), 'utf8'), 'pack');
    assert.deepEqual((await fs.readdir(path.dirname(game))).filter((n) => n === 'evil.jar'), []);
    assert.equal(manualDest(game, { folder: 'mods', fileName: '../x.jar' }), undefined);
    assert.equal(manualDest(game, { folder: '..', fileName: 'x.jar' }), undefined);
    assert.equal(manualDest(game, { folder: 'mods', fileName: 'x.jar' }), path.join(game, 'mods', 'x.jar'));
  });

  it('does not copy a file that changed after it was found', async () => {
    const downloads = await tmp();
    const game = await tmp();
    await fs.writeFile(path.join(downloads, 'kept.jar'), 'kept mod');
    const kept = entry('kept.jar', 'kept mod');
    const found = await findManualFiles([kept], [downloads]);
    await fs.writeFile(path.join(downloads, 'kept.jar'), 'kept moD');
    assert.deepEqual(await copyManualFiles(game, [kept], found), []);
  });

  it('turns old file page links into download links', () => {
    assert.equal(downloadLink('https://www.curseforge.com/minecraft/mc-mods/jei/files/123'), 'https://www.curseforge.com/minecraft/mc-mods/jei/download/123');
    assert.equal(downloadLink('https://www.curseforge.com/minecraft/texture-packs/f/files/9/'), 'https://www.curseforge.com/minecraft/texture-packs/f/download/9');
    assert.equal(downloadLink('https://www.curseforge.com/minecraft/mc-mods/jei/download/123'), 'https://www.curseforge.com/minecraft/mc-mods/jei/download/123');
    assert.equal(downloadLink('https://evil.example/files/1'), 'https://evil.example/files/1');
  });

  it('a watched folder reports a new file', async () => {
    const downloads = await tmp();
    let calls = 0;
    const watch = new FolderWatch(() => calls++, 20, 60_000);
    watch.start([downloads, path.join(downloads, 'gone')]);
    try {
      // macOS starts watching a moment later and drops what came before: a new file now and then until one is seen
      for (let i = 0; i < 250 && !calls; i++) {
        if (i % 25 === 0) await fs.writeFile(path.join(downloads, `new${i}.jar`), 'x');
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.ok(calls >= 1);
    } finally {
      watch.stop();
    }
  });
});
