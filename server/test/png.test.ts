import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodePng, encodePng, faceOf } from '../src/png.ts';

/** A 64×64 skin: the face red, its top-left hat pixel blue, the rest of the hat see-through. */
export function testSkin(): Buffer {
  const rgba = Buffer.alloc(64 * 64 * 4);
  const set = (x: number, y: number, c: number[]) => rgba.set(c, (y * 64 + x) * 4);
  for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) set(x, y, [200, 30, 30, 255]);
  set(40, 8, [20, 40, 220, 255]);
  return encodePng({ width: 64, height: 64, rgba });
}

describe('avatar pictures', () => {
  it('reads and writes PNG, and cuts the face with its hat out of a skin', () => {
    const skin = decodePng(testSkin());
    assert.equal(skin.width, 64);
    const face = faceOf(skin);
    assert.equal(face.width, 64);
    const at = (x: number, y: number) => [...face.rgba.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    // the hat's pixel covers the face, scaled 8×; elsewhere the face shows
    assert.deepEqual(at(3, 3), [20, 40, 220, 255]);
    assert.deepEqual(at(10, 3), [200, 30, 30, 255]);
    assert.deepEqual(at(63, 63), [200, 30, 30, 255]);
    // what it writes reads back the same
    assert.deepEqual(decodePng(encodePng(face)).rgba, face.rgba);
    assert.throws(() => decodePng(Buffer.from('not a png')), /not_png/);
    // an old 64×32 skin with a fully opaque (black) hat area: the face shows, as in the game
    const old = Buffer.alloc(64 * 32 * 4);
    for (let i = 0; i < 64 * 32; i++) old.set([0, 0, 0, 255], i * 4);
    for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) old.set([238, 180, 159, 255], (y * 64 + x) * 4);
    const notch = faceOf(decodePng(encodePng({ width: 64, height: 32, rgba: old })));
    assert.deepEqual([...notch.rgba.subarray(0, 4)], [238, 180, 159, 255]);
  });
});
