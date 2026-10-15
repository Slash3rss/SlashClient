import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boxFaces, floodRegion, regionAt, skinRegions, upgradeLegacySkin } from '../src/shared/skinLayout';

describe('skin layout', () => {
  it('unfolds the head where the game expects it', () => {
    const head = boxFaces(0, 0, 8, 8, 8);
    assert.deepEqual(head.front, { x: 8, y: 8, w: 8, h: 8 });
    assert.deepEqual(head.back, { x: 24, y: 8, w: 8, h: 8 });
    assert.deepEqual(head.bottom, { x: 16, y: 0, w: 8, h: 8 });
  });

  it('finds parts under pixels and leaves unused space empty', () => {
    const classic = skinRegions(false);
    assert.equal(regionAt(classic, 9, 9)?.part, 'Głowa');
    assert.equal(regionAt(classic, 40, 9)?.outer, true);
    assert.equal(regionAt(classic, 0, 0), undefined);
    // slim arms are a pixel narrower, so the back of the arm moves left
    assert.equal(regionAt(skinRegions(true), 51, 25)?.face, 'back');
    assert.equal(regionAt(classic, 51, 25)?.face, 'left');
  });

  it('mirrors the right leg into the left one on legacy skins', () => {
    const legacy = new Uint8ClampedArray(64 * 32 * 4);
    // a red pixel at the leftmost column of the right leg's front (4, 20)
    legacy.set([255, 0, 0, 255], (20 * 64 + 4) * 4);
    const skin = upgradeLegacySkin(legacy);
    assert.equal(skin.length, 64 * 64 * 4);
    // left leg front starts at (20, 52); mirrored, the pixel lands in its rightmost column
    assert.deepEqual([...skin.subarray((52 * 64 + 23) * 4, (52 * 64 + 23) * 4 + 4)], [255, 0, 0, 255]);
  });

  it('fills only one face of one colour', () => {
    const pixels = new Uint8ClampedArray(64 * 64 * 4);
    const front = skinRegions(false).find((r) => r.part === 'Głowa' && r.face === 'front' && !r.outer)!;
    pixels.set([1, 2, 3, 255], (8 * 64 + 12) * 4); // one different pixel in the face
    const filled = floodRegion(pixels, front, 8, 8);
    assert.equal(filled.length, 63);
  });
});
