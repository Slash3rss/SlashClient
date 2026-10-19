import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BACK_ITEMS, GEAR, GEAR_TEXTURE, TAILS, flameScale, gearBoxes, gearLayout, tailAngles } from '../src/shared/gear';
import { ITEMS } from '../server/src/cosmetics';

const assets = 'hud/src/main/resources/assets/slashclient-hud';

describe('back items and tails', () => {
  it('lays every box out on its own part of the picture', () => {
    const [tw, th] = GEAR_TEXTURE;
    for (const item of GEAR) {
      const boxes = gearBoxes(item);
      const taken: [number, number, number, number][] = [];
      gearLayout(item).forEach(([u, v], i) => {
        const [w, h, d] = boxes[i].box.size.map(Math.ceil);
        const r: [number, number, number, number] = [u, v, u + 2 * (w + d), v + d + h];
        assert.ok(r[2] <= tw && r[3] <= th, `${item.id}: box ${i} is off the picture`);
        for (const o of taken) assert.ok(r[2] <= o[0] || o[2] <= r[0] || r[3] <= o[1] || o[3] <= r[1], `${item.id}: box ${i} overlaps another`);
        taken.push(r);
      });
    }
  });

  it('is what the mod reads, with a picture and an icon for each item (node scripts/make-gear.mjs)', () => {
    const mod = JSON.parse(readFileSync(`${assets}/gear.json`, 'utf8'));
    assert.deepEqual(mod.texture, GEAR_TEXTURE);
    assert.deepEqual(mod.items.map((i: { id: string; slot: string }) => [i.id, i.slot]), GEAR.map((i) => [i.id, i.slot]));
    for (const item of BACK_ITEMS) {
      const boxes = mod.items.find((i: { id: string }) => i.id === item.id).boxes;
      assert.deepEqual(boxes.map((b: { from: number[]; size: number[]; uv: number[] }) => [b.from, b.size, b.uv]), item.boxes.map((b, i) => [b.from, b.size, gearLayout(item)[i]]));
    }
    for (const item of TAILS) {
      const chains = mod.items.find((i: { id: string }) => i.id === item.id).chains;
      assert.deepEqual(chains.map((c: { segments: { size: number[] }[] }) => c.segments.map((s) => s.size)), item.chains.map((c) => c.segments.map((s) => s.size)));
    }
    for (const item of GEAR) assert.ok(existsSync(`${assets}/textures/gear/${item.id}.png`) && existsSync(`${assets}/textures/gear/icon/${item.id}.png`), item.id);
  });

  it('is in the server catalog, in the same slots and with the same names, for 0.9.20 on', () => {
    const server = ITEMS.filter((i) => i.slot === 'back' || i.slot === 'tail');
    assert.deepEqual(server.map((i) => [i.id, i.slot, i.name]), GEAR.map((i) => [i.id, i.slot, i.name]));
    assert.ok(server.every((i) => i.since === '0.9.20'));
    // ids are one name space for every slot
    assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  });

  it('sways a tail standing, swings it with the steps walking, and lowers it under a cape', () => {
    const fox = TAILS.find((t) => t.id === 'foxtail')!;
    const still = [0, 0.5, 1, 1.5].map((s) => tailAngles(fox, 0, 3, s, 0, 0, false)[1]);
    assert.ok(Math.max(...still) - Math.min(...still) > 0.03 && Math.max(...still.map(Math.abs)) < 0.2);
    const walking = [0, 1, 2, 3, 4].map((p) => tailAngles(fox, 0, 0, 0, 1, p, false)[1]);
    assert.ok(Math.max(...walking) - Math.min(...walking) > 0.3);
    assert.ok(tailAngles(fox, 0, 0, 0, 0, 0, true)[0] < tailAngles(fox, 0, 0, 0, 0, 0, false)[0] - 0.5);
    // running raises it
    assert.ok(tailAngles(fox, 0, 0, 0, 1, 0, false)[0] > tailAngles(fox, 0, 0, 0, 0, 0, false)[0]);
    // the kitsune's tails fan out
    const kitsune = TAILS.find((t) => t.id === 'kitsune')!;
    assert.ok(tailAngles(kitsune, 0, 0, 0, 0, 0, false)[1] < -0.5 && tailAngles(kitsune, 4, 0, 0, 0, 0, false)[1] > 0.5);
    for (let t = 0; t < 2; t += 0.1) assert.ok(flameScale(t, 0) > 0.4 && flameScale(t, 1) < 1.1);
  });
});
