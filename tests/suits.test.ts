import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SUITS, SUIT_TEXTURE, slimSuitBox, suitLayout, suitPart } from '../src/shared/suits';
import { ITEMS } from '../server/src/cosmetics';

const assets = 'hud/src/main/resources/assets/slashclient-hud';

describe('suits', () => {
  it('lays every box (and the slim arms\' own) out on its own part of the picture', () => {
    const [tw, th] = SUIT_TEXTURE;
    for (const suit of SUITS) {
      const { uv, slimUv } = suitLayout(suit);
      const taken: [number, number, number, number][] = [];
      const place = ([u, v]: [number, number], size: number[], what: string) => {
        const [w, h, d] = size.map(Math.ceil);
        const r: [number, number, number, number] = [u, v, u + 2 * (w + d), v + d + h];
        assert.ok(r[2] <= tw && r[3] <= th, `${suit.id}: ${what} is off the picture`);
        for (const o of taken) assert.ok(r[2] <= o[0] || o[2] <= r[0] || r[3] <= o[1] || o[3] <= r[1], `${suit.id}: ${what} overlaps another`);
        taken.push(r);
      };
      suit.boxes.forEach((b, i) => {
        place(uv[i], b.size, `box ${i}`);
        if (slimUv[i]) place(slimUv[i]!, slimSuitBox(b).size, `slim box ${i}`);
        assert.equal(!!slimUv[i], b.bone.endsWith('_arm'), `${suit.id}: box ${i}`);
      });
    }
  });

  it('covers all six parts of the body, each hidden by the armour over it', () => {
    for (const suit of SUITS) {
      for (const bone of ['head', 'body', 'right_arm', 'left_arm', 'right_leg', 'left_leg']) assert.ok(suit.boxes.some((b) => b.bone === bone), `${suit.id}: ${bone}`);
      for (const part of ['head', 'chest', 'legs', 'feet']) assert.ok(suit.boxes.some((b) => suitPart(b) === part), `${suit.id}: ${part}`);
    }
    assert.equal(suitPart({ name: 'arm', bone: 'left_arm', from: [0, 0, 0], size: [1, 1, 1] }), 'chest');
    assert.equal(suitPart({ name: 'leg', bone: 'left_leg', from: [0, 0, 0], size: [1, 1, 1] }), 'legs');
  });

  it('gives slim arms narrower sleeves on the outer side', () => {
    assert.deepEqual(slimSuitBox({ name: 'arm', bone: 'right_arm', from: [-3, -2, -2], size: [4, 12, 4] }).from, [-2, -2, -2]);
    assert.deepEqual(slimSuitBox({ name: 'arm', bone: 'left_arm', from: [-1, -2, -2], size: [4, 12, 4] }).size, [3, 12, 4]);
    assert.deepEqual(slimSuitBox({ name: 'leg', bone: 'left_leg', from: [-2, 0, -2], size: [4, 8, 4] }).size, [4, 8, 4]);
  });

  it('is what the mod reads, with a picture and an icon for each suit (node scripts/make-suits.mjs)', () => {
    const mod = JSON.parse(readFileSync(`${assets}/suits.json`, 'utf8'));
    assert.deepEqual(mod.texture, SUIT_TEXTURE);
    assert.deepEqual(mod.items.map((i: { id: string }) => i.id), SUITS.map((s) => s.id));
    for (const suit of SUITS) {
      const { uv, slimUv } = suitLayout(suit);
      const boxes = mod.items.find((i: { id: string }) => i.id === suit.id).boxes;
      assert.deepEqual(boxes.map((b: { bone: string; part: string; from: number[]; size: number[]; uv: number[]; slimUv?: number[] }) => [b.bone, b.part, b.from, b.size, b.uv, b.slimUv]),
        suit.boxes.map((b, i) => [b.bone, suitPart(b), b.from, b.size, uv[i], slimUv[i]]));
      assert.ok(existsSync(`${assets}/textures/suit/${suit.id}.png`) && existsSync(`${assets}/textures/suit/icon/${suit.id}.png`), suit.id);
    }
  });

  it('is in the server catalog, with the same names, for launchers from 0.9.20', () => {
    const server = ITEMS.filter((i) => i.slot === 'suit');
    assert.deepEqual(server.map((i) => [i.id, i.name, i.since]), SUITS.map((s) => [s.id, s.name, '0.9.20']));
  });
});
