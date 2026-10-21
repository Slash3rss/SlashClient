import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { OUR_PET_FRAMES, OUR_PET_MODELS } from '../src/renderer/ourPetModels';
import { PET_MODELS } from '../src/renderer/petModels';
import { ITEMS } from '../server/src/cosmetics';
import { PROP_PETS, PROP_PET_SCALE, propBoxes, propModel } from '../src/shared/props';
import { COSMETIC_TEXTURES } from '../src/shared/cosmeticTextures';

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

  it('the small wheelbarrows are the props\' wheelbarrow, box for box (node scripts/make-props.mjs)', () => {
    for (const pet of PROP_PETS) {
      const mod = JSON.parse(readFileSync(`${assets}/pet/${pet.id}.json`, 'utf8'));
      assert.equal(mod.scale, PROP_PET_SCALE);
      const boxes = propBoxes(propModel({ id: pet.id, slot: 'prop', name: '', look: pet.look })).map((b) => b.box);
      assert.deepEqual(mod.boxes.map((b: { size: number[] }) => b.size), boxes.map((b) => b.size.map((v) => Math.round(v * 1e5) / 1e5)), pet.id);
      assert.equal(OUR_PET_MODELS[pet.id].children.length, boxes.length);
      assert.equal(ITEMS.find((i) => i.id === pet.id)?.since, '0.9.29');
    }
    // the autumn one carries leaves and a pumpkin
    assert.ok(propBoxes(propModel({ id: 'x', slot: 'prop', name: '', look: 'autumn' })).some((b) => b.box.mat === 'pumpkin'));
    assert.equal(ITEMS.find((i) => i.id === 'pet_wheelbarrow')?.name, 'Taczka');
  });

  it('the cat is the game\'s ginger one, in the previews too', () => {
    assert.equal(ITEMS.find((i) => i.id === 'cat')?.slot, 'pet');
    assert.ok(PET_MODELS.cat.children.some((c) => c.name === 'tail2'));
    for (const p of ['item/cat_spawn_egg', 'entity/cat/cat_red', 'entity/cat/red']) assert.ok(COSMETIC_TEXTURES.includes(p), p);
    const layer = readFileSync('hud/src/main/java/dev/slash3rss/slashclient/hud/CosmeticLayer.java', 'utf8');
    assert.ok(layer.includes('vanilla("cat/cat_red")') && layer.includes('vanilla("cat/red")'));
  });
});
