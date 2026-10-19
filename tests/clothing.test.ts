import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { CLOTHING, CLOTHING_TEXTURE, boxQuads, layout, slimBox } from '../src/shared/clothing';
import { TWITCH_EVERY, TWITCH_LENGTH, shownWith, twitchAngle } from '../src/shared/headwear';
import { ITEMS } from '../server/src/cosmetics';

const assets = 'hud/src/main/resources/assets/slashclient-hud';

describe('clothing', () => {
  it('lays every box out on its own part of the picture', () => {
    const [tw, th] = CLOTHING_TEXTURE;
    for (const item of CLOTHING) {
      const taken: [number, number, number, number][] = [];
      layout(item).forEach(([u, v], i) => {
        const [w, h, d] = item.boxes[i].size.map(Math.ceil);
        const r: [number, number, number, number] = [u, v, u + 2 * (w + d), v + d + h];
        assert.ok(r[2] <= tw && r[3] <= th, `${item.id}: box ${i} is off the picture`);
        for (const o of taken) assert.ok(r[2] <= o[0] || o[2] <= r[0] || r[3] <= o[1] || o[3] <= r[1], `${item.id}: box ${i} overlaps another`);
        taken.push(r);
      });
    }
  });

  it('builds faces the way the game does: the front of a head-sized box is the skin face', () => {
    const quads = boxQuads({ bone: 'head', from: [-4, -8, -4], size: [8, 8, 8] }, [0, 0]);
    const front = quads.find((q) => q.face === 'north')!;
    // (8, 8)–(16, 16) of a 64×64 picture, its left edge at the player's right (-x), its top at the top (-y)
    assert.deepEqual(front.corners.map((c) => [c[0], c[1], c[2], c[3] * 64, c[4] * 64]), [[4, -8, -4, 16, 8], [-4, -8, -4, 8, 8], [-4, 0, -4, 8, 16], [4, 0, -4, 16, 16]]);
  });

  it('gives slim arms narrower sleeves', () => {
    assert.deepEqual(slimBox({ bone: 'right_arm', from: [-3, -2, -2], size: [4, 10, 4] }).from, [-2, -2, -2]);
    assert.deepEqual(slimBox({ bone: 'left_arm', from: [-1, -2, -2], size: [4, 10, 4] }).size, [3, 10, 4]);
  });

  it('is what the mod reads, with a picture and an icon for each item (node scripts/make-clothing.mjs)', () => {
    const mod = JSON.parse(readFileSync(`${assets}/clothing.json`, 'utf8'));
    assert.deepEqual(mod.texture, CLOTHING_TEXTURE);
    assert.deepEqual(mod.items.map((i: { id: string; slot: string }) => [i.id, i.slot]), CLOTHING.map((i) => [i.id, i.slot]));
    for (const item of CLOTHING) {
      const boxes = mod.items.find((i: { id: string }) => i.id === item.id).boxes;
      assert.deepEqual(boxes.map((b: { from: number[]; size: number[]; uv: number[] }) => [b.from, b.size, b.uv]), item.boxes.map((b, i) => [b.from, b.size, layout(item)[i]]));
      assert.ok(existsSync(`${assets}/textures/clothing/${item.id}.png`) && existsSync(`${assets}/textures/clothing/icon/${item.id}.png`), item.id);
    }
  });

  it('is in the server catalog, in the same slots and with the same names', () => {
    const server = ITEMS.filter((i) => i.slot === 'hat' || i.slot === 'top' || i.slot === 'face' || i.slot === 'ears');
    assert.deepEqual(server.map((i) => [i.id, i.slot, i.name]), CLOTHING.map((i) => [i.id, i.slot, i.name]));
  });

  it('keeps face and ears things where a hat would not go through them, and twitches ears now and then', () => {
    const hats = CLOTHING.filter((i) => i.slot === 'hat').map((i) => i.id);
    for (const item of CLOTHING.filter((i) => i.slot === 'face' || i.slot === 'ears')) {
      for (const b of item.boxes) for (const h of b.hats ?? []) assert.ok(hats.includes(h), `${item.id}: no hat ${h}`);
      // only things on the head, and a pivot for everything that turns
      assert.ok(item.boxes.every((b) => b.bone === 'head' && (!b.twitch && !b.rotate || b.pivot)), item.id);
    }
    const ear = CLOTHING.find((i) => i.id === 'catears')!.boxes[0];
    assert.ok(shownWith(ear, undefined) && shownWith(ear, 'cap') && !shownWith(ear, 'tophat'));
    assert.ok(shownWith(CLOTHING.find((i) => i.id === 'sunglasses')!.boxes[0], 'tophat'));
    // still most of the time, a small wiggle for a moment every few seconds
    const twitch = ear.twitch!;
    assert.equal(twitchAngle(TWITCH_LENGTH + 1, twitch), 0);
    const during = Array.from({ length: 20 }, (_, i) => twitchAngle(TWITCH_EVERY * 3 + (i * TWITCH_LENGTH) / 20, twitch));
    assert.ok(during.some((a) => Math.abs(a) > 0.02) && during.every((a) => Math.abs(a) <= (twitch.amp * Math.PI) / 180));
    // glasses and the mustache stay on under a helmet
    assert.deepEqual(CLOTHING.filter((i) => i.underHelmet).map((i) => i.id), ['sunglasses', 'aviators', 'glasses3d', 'monocle', 'mustache']);
  });
});
