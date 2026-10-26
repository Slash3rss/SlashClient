import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { MOVE_ICONS, MOVE_IDS, RING_FRAMES, RING_IDS, RING_STILL } from '../src/renderer/ringMovePreview';
import { ITEMS, compareVersions } from '../server/src/cosmetics';

const MOD = 'hud/src/main/java/dev/slash3rss/slashclient/hud/cosmetics';

describe('rings and movement effects', () => {
  it('are the same lists in the server catalog, the mod and the previews', () => {
    assert.deepEqual(ITEMS.filter((i) => i.slot === 'ring').map((i) => i.id), [...RING_IDS]);
    assert.deepEqual(ITEMS.filter((i) => i.slot === 'move').map((i) => i.id), [...MOVE_IDS]);
    const list = (file: string) => [...(/IDS = List\.of\(([^)]*)\)/.exec(readFileSync(`${MOD}/${file}`, 'utf8'))?.[1] ?? '').matchAll(/"(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(list('RingEffects.java'), [...RING_IDS]);
    assert.deepEqual(list('MoveEffects.java'), [...MOVE_IDS]);
    // the mod plays each movement effect, and knows both slots
    const moves = readFileSync(`${MOD}/MoveEffects.java`, 'utf8');
    for (const id of MOVE_IDS) assert.ok(moves.includes(`case "${id}"`) || moves.includes(`"${id}".equals`), id);
    const cosmetics = readFileSync(`${MOD}/Cosmetics.java`, 'utf8');
    assert.ok(cosmetics.includes('Map.entry("ring", RingEffects.IDS)') && cosmetics.includes('Map.entry("move", MoveEffects.IDS)'));
  });

  it('have every ring picture, with the same frames in the mod', () => {
    const mod = readFileSync(`${MOD}/RingEffects.java`, 'utf8');
    for (const id of RING_IDS) {
      const frames = RING_FRAMES[id];
      if (frames) assert.ok(mod.includes(`"${id}", ${frames}`), `${id} frames in the mod`);
      const files = frames ? Array.from({ length: frames }, (_, n) => `${id}_${n}`) : [id];
      for (const f of files) assert.ok(existsSync(`hud/src/main/resources/assets/slashclient-hud/textures/ring/${f}.png`), f);
    }
    // the website's own copy says which are animated too
    const web = readFileSync('server/web/common.js', 'utf8');
    assert.ok(web.includes(`const RING_FRAMES = ${JSON.stringify(RING_FRAMES).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ').replace(/\{/, '{ ').replace(/\}$/, ' }')}`));
  });

  it('come with the unreleased launcher, free for everyone (except the shop ones), with ids no other slot uses', () => {
    for (const i of ITEMS.filter((x) => x.slot === 'ring' || x.slot === 'move')) {
      // the shop's rings came later, sold for sparks, and the leaf rings later still
      assert.equal(i.since, i.id.startsWith('ring_leaves_') ? '0.9.29' : i.price ? '0.9.22' : '0.9.20', i.id);
      assert.ok(compareVersions(i.since!, '0.9.19') > 0);
      assert.equal(i.rank, undefined, i.id);
      assert.equal(i.achievement, undefined, i.id);
    }
    const ids = ITEMS.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique across all slots');
  });

  it('have the autumn leaves: two auras and two still rings, with every leaf picture in the mod', () => {
    const auras = ITEMS.filter((i) => i.id.startsWith('leaves_'));
    assert.deepEqual(auras.map((i) => [i.id, i.slot, i.since]), [['leaves_gold', 'aura', '0.9.29'], ['leaves_autumn', 'aura', '0.9.29']]);
    const cosmetics = readFileSync(`${MOD}/Cosmetics.java`, 'utf8');
    // in the auras' list for every game version (fireflies only from 1.21.5)
    assert.equal(cosmetics.match(/"tears", (?:"fireflies", )?"leaves_gold", "leaves_autumn"\);/g)?.length, 2);
    const effects = readFileSync(`${MOD}/CosmeticEffects.java`, 'utf8');
    assert.ok(effects.includes('case "leaves_gold", "leaves_autumn"'));
    // the rings with leaves lie still, in the mod and the previews alike
    assert.deepEqual([...RING_STILL], ['ring_leaves_gold', 'ring_leaves_autumn']);
    assert.ok(readFileSync(`${MOD}/RingEffects.java`, 'utf8').includes('STILL = Set.of("ring_leaves_gold", "ring_leaves_autumn")'));
    // what falls: golden leaves, or red, brown and golden ones, five shapes each
    const leaves = readFileSync(`${MOD}/Leaves.java`, 'utf8');
    assert.ok(leaves.includes('Map.of("gold", new String[] {"gold"}, "autumn", new String[] {"red", "brown", "gold"})'));
    for (const colour of ['gold', 'red', 'brown']) {
      for (let n = 0; n < 5; n++) assert.ok(existsSync(`hud/src/main/resources/assets/slashclient-hud/textures/particle/leaf_${colour}_${n}.png`), `leaf_${colour}_${n}`);
    }
    // with an icon in the launcher and on the website, and the leaves in the previews
    for (const id of ['leaves_gold', 'leaves_autumn']) {
      assert.ok(new RegExp(`\\b${id}: 'fa-`).test(readFileSync('src/renderer/app.ts', 'utf8')), `launcher icon ${id}`);
      assert.ok(new RegExp(`\\b${id}: 'fa-`).test(readFileSync('server/web/common.js', 'utf8')), `website icon ${id}`);
      assert.ok(new RegExp(`\\b${id}: \\{ kind: 'aura', frames: leaves\\(`).test(readFileSync('src/renderer/cosmeticPreview.ts', 'utf8')), `preview ${id}`);
    }
  });

  it('have an icon and a name in the launcher, on the website and in the game', () => {
    const app = readFileSync('src/renderer/app.ts', 'utf8');
    const web = readFileSync('server/web/common.js', 'utf8');
    const screen = readFileSync(`${MOD}/CosmeticsScreen.java`, 'utf8');
    for (const id of MOVE_IDS) {
      assert.ok(MOVE_ICONS[id], `preview icon ${id}`);
      assert.ok(new RegExp(`\\b${id}: 'fa-`).test(app), `launcher icon ${id}`);
      assert.ok(new RegExp(`\\b${id}: 'fa-`).test(web), `website icon ${id}`);
      assert.ok(screen.includes(`Map.entry("${id}"`), `game icon ${id}`);
    }
    for (const slot of ['ring', 'move']) {
      assert.ok(app.includes(`['${slot}', '`), `launcher tab ${slot}`);
      assert.ok(web.includes(`['${slot}', '`), `website tab ${slot}`);
      assert.ok(screen.includes(`"${slot}"`), `game tab ${slot}`);
    }
    for (const lang of ['pl_pl', 'en_us']) {
      const strings = JSON.parse(readFileSync(`hud/src/main/resources/assets/slashclient-hud/lang/${lang}.json`, 'utf8'));
      for (const key of ['cosmetics.slot.ring', 'cosmetics.slot.move', 'cosmetics.moveHint', 'set.ringEffects', 'set.ringEffects.others', 'set.moveEffects', 'set.moveEffects.others']) {
        assert.ok(strings[`slashclient-hud.${key}`], `${lang}: ${key}`);
      }
    }
  });
});
