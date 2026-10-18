import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { OUR_PET_FRAMES, OUR_PET_MODELS } from '../src/renderer/ourPetModels';
import { ITEMS } from '../server/src/cosmetics';

const assets = 'hud/src/main/resources/assets/slashclient-hud';

describe('our own pets', () => {
  it('are the same boxes for the mod and the previews, with every frame and an icon (node scripts/make-model-pet.mjs)', () => {
    for (const [id, shape] of Object.entries(OUR_PET_MODELS)) {
      const mod = JSON.parse(readFileSync(`${assets}/pet/${id}.json`, 'utf8'));
      assert.equal(mod.frames, OUR_PET_FRAMES[id]);
      assert.deepEqual(mod.boxes.map((b: { pivot: number[]; rotation: number[] }) => [...b.pivot, ...b.rotation]), shape.children.map((c) => c.pose));
      // six faces a box, inside the picture
      for (const c of shape.children) {
        assert.equal(c.quads.length, 6);
        for (const q of c.quads) for (let i = 0; i < 4; i++) assert.ok(q[i * 5 + 3] >= 0 && q[i * 5 + 3] <= 1 && q[i * 5 + 4] >= 0 && q[i * 5 + 4] <= 1, id);
      }
      for (let f = 0; f < mod.frames; f++) assert.ok(existsSync(`${assets}/textures/pet/${id}_${f}.png`), `${id} frame ${f}`);
      assert.ok(existsSync(`${assets}/textures/pet/icon/${id}.png`));
    }
  });

  it('are pets in the server catalog, and the mod knows them', () => {
    const cosmetics = readFileSync('hud/src/main/java/dev/slash3rss/slashclient/hud/Cosmetics.java', 'utf8');
    const ours = readFileSync('hud/src/main/java/dev/slash3rss/slashclient/hud/OurPets.java', 'utf8');
    for (const id of Object.keys(OUR_PET_MODELS)) {
      assert.equal(ITEMS.find((i) => i.id === id)?.slot, 'pet', id);
      assert.ok(cosmetics.includes(`"${id}"`) && ours.includes(`"${id}"`), id);
    }
    assert.equal(ITEMS.find((i) => i.id === 'duszek_haze')?.name, 'Duszek Haze');
  });
});
