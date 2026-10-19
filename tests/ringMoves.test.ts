import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { MOVE_ICONS, MOVE_IDS, RING_FRAMES, RING_IDS } from '../src/renderer/ringMovePreview';
import { ITEMS, compareVersions } from '../server/src/cosmetics';

const MOD = 'hud/src/main/java/dev/slash3rss/slashclient/hud';

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

  it('come with the unreleased launcher, free for everyone, with ids no other slot uses', () => {
    for (const i of ITEMS.filter((x) => x.slot === 'ring' || x.slot === 'move')) {
      assert.equal(i.since, '0.9.20', i.id);
      assert.ok(compareVersions(i.since!, '0.9.19') > 0);
      assert.equal(i.rank, undefined, i.id);
      assert.equal(i.achievement, undefined, i.id);
    }
    const ids = ITEMS.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique across all slots');
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
