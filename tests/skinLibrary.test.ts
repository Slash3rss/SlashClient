import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { addPreset, listPresets, looksSlim, readPreset, removePreset, updatePreset } from '../src/main/skinLibrary';
import { setLang } from '../src/shared/i18n';

function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe('skin library', () => {
  setLang('pl');
  it('adds, renames, lists and removes presets', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skinlib-'));
    const a = await addPreset(pngHeader(64, 64), { name: '  Mój   skin ', variant: 'classic', capeId: null }, dir);
    await new Promise((r) => setTimeout(r, 5));
    const b = await addPreset(pngHeader(64, 32), { name: 'Stary', variant: 'slim' }, dir);
    assert.equal(a.name, 'Mój skin');
    assert.deepEqual((await listPresets(dir)).map((p) => p.id), [b.id, a.id]);
    await updatePreset(a.id, { name: 'PvP', variant: 'slim', capeId: 'cape-1' }, dir);
    const { preset, png } = await readPreset(a.id, dir);
    assert.deepEqual([preset.name, preset.variant, preset.capeId], ['PvP', 'slim', 'cape-1']);
    assert.equal(png.length, 33);
    await removePreset(b.id, dir);
    assert.deepEqual((await listPresets(dir)).map((p) => p.id), [a.id]);
    await assert.rejects(readPreset(b.id, dir), /Nie znaleziono/);
    await assert.rejects(readPreset('../../etc/passwd', dir), /Nie znaleziono/);
  });
  it('refuses files that are not skins', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skinlib-'));
    await assert.rejects(addPreset(pngHeader(32, 32), { name: 'x', variant: 'classic' }, dir), /64×64/);
    assert.deepEqual(await listPresets(dir), []);
  });
  it('tells slim arms from classic ones', () => {
    const bitmap = Buffer.alloc(64 * 64 * 4, 255);
    assert.equal(looksSlim(bitmap, 64, 64), false);
    for (let y = 16; y < 32; y++) for (const x of y < 20 ? [50, 51] : [54, 55]) bitmap[(y * 64 + x) * 4 + 3] = 0;
    assert.equal(looksSlim(bitmap, 64, 64), true);
    assert.equal(looksSlim(bitmap, 64, 32), false);
  });
});
