import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ITEMS } from '../server/src/cosmetics';

const MOD = 'hud/src/main/java/dev/slash3rss/slashclient/hud/cosmetics';
const NEW = [['infernal', 'aura'], ['frostaura', 'aura'], ['feathers', 'trail'], ['leaves_fall', 'trail']];

describe('the sets\' auras and trails', () => {
  it('are sold in the shop from 0.9.70', () => {
    for (const [id, slot] of NEW) {
      const item = ITEMS.find((i) => i.id === id);
      assert.ok(item, id);
      assert.equal(item.slot, slot, id);
      assert.equal(item.since, '0.9.70', id);
      assert.ok((item.price ?? 0) > 0, `${id} has a price`);
    }
  });

  it('are made by the mod on every game version, with an icon everywhere and a preview', () => {
    const cosmetics = readFileSync(`${MOD}/Cosmetics.java`, 'utf8');
    // the auras' list is split by version (fireflies only from 1.21.5): both halves have them
    assert.equal(cosmetics.match(/"leaves_autumn", "infernal", "frostaura"\);/g)?.length, 2);
    assert.ok(cosmetics.includes('"ash", "feathers", "leaves_fall");'));
    const effects = readFileSync(`${MOD}/CosmeticEffects.java`, 'utf8');
    const figure = readFileSync('hud/src/main/java/dev/slash3rss/slashclient/hud/ui/FigureParticles.java', 'utf8');
    const app = readFileSync('src/renderer/app.ts', 'utf8');
    const web = readFileSync('server/web/common.js', 'utf8');
    const preview = readFileSync('src/renderer/cosmeticPreview.ts', 'utf8');
    for (const [id, kind] of NEW) {
      assert.ok(effects.includes(`case "${id}"`), `in the game ${id}`);
      assert.ok(figure.includes(`case "${id}"`) || figure.includes(`"${id}" ->`) || figure.includes(`"${id}",`), `on the menus' figure ${id}`);
      assert.ok(new RegExp(`\\b${id}: 'fa-`).test(app), `launcher icon ${id}`);
      assert.ok(new RegExp(`\\b${id}: 'fa-`).test(web), `website icon ${id}`);
      assert.ok(new RegExp(`\\b${id}: \\{ kind: '${kind}'`).test(preview), `preview ${id}`);
    }
  });

  it('have the feathers\' pictures in the mod and on the website', () => {
    for (let n = 0; n < 4; n++) {
      assert.ok(existsSync(`hud/src/main/resources/assets/slashclient-hud/textures/particle/feather_${n}.png`), `feather_${n}`);
      assert.ok(existsSync(`server/web/vendor/particles/feather_${n}.png`), `website feather_${n}`);
    }
    assert.ok(readFileSync(`${MOD}/Leaves.java`, 'utf8').includes('FEATHERS = 4'));
  });
});
