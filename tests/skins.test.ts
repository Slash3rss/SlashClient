import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readSkinFile } from '../src/main/skins';
import { setLang } from '../src/shared/i18n';

/** The first bytes of a PNG: signature + IHDR with the given size (enough for the size check). */
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe('skin files', () => {
  setLang('pl');
  it('accepts 64×64 and legacy 64×32 skins', () => {
    assert.match(readSkinFile(pngHeader(64, 64)), /^data:image\/png;base64,/);
    assert.match(readSkinFile(pngHeader(64, 32)), /^data:image\/png;base64,/);
  });
  it('rejects other sizes and non-PNG files with a clear message', () => {
    assert.throws(() => readSkinFile(pngHeader(128, 128)), /64×64 albo 64×32 piksele \(ten ma 128×128\)/);
    assert.throws(() => readSkinFile(Buffer.from('GIF89a......................')), /PNG/);
  });
});
