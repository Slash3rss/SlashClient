import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { KILL_EFFECT_IDS } from '../src/renderer/killEffects';
import { ITEMS, compareVersions } from '../server/src/cosmetics';

describe('kill effects', () => {
  it('are the same list in the server catalog, the mod and the previews', () => {
    const catalog = ITEMS.filter((i) => i.slot === 'kill');
    assert.deepEqual(catalog.map((i) => i.id), [...KILL_EFFECT_IDS]);
    const mod = readFileSync('hud/src/main/java/dev/slash3rss/slashclient/hud/cosmetics/KillEffects.java', 'utf8');
    const list = /IDS = List\.of\(([^)]*)\)/.exec(mod)?.[1] ?? '';
    assert.deepEqual([...list.matchAll(/"(\w+)"/g)].map((m) => m[1]), [...KILL_EFFECT_IDS]);
    // the mod draws each one, and knows the slot
    for (const id of KILL_EFFECT_IDS) assert.ok(mod.includes(`case "${id}"`) || mod.includes(`"${id}" ->`) || new RegExp(`case [^>]*"${id}"`).test(mod), id);
    assert.ok(readFileSync('hud/src/main/java/dev/slash3rss/slashclient/hud/cosmetics/Cosmetics.java', 'utf8').includes('"kill", KillEffects.IDS'));
  });

  it('come with the unreleased launcher, free for everyone', () => {
    for (const i of ITEMS.filter((x) => x.slot === 'kill')) {
      assert.equal(i.since, '0.9.14', i.id);
      assert.ok(compareVersions(i.since!, '0.9.13') > 0);
      assert.equal(i.rank, undefined, i.id);
      assert.equal(i.achievement, undefined, i.id);
    }
  });

  it('have an icon and a name in the launcher, on the website and in the game', () => {
    const app = readFileSync('src/renderer/app.ts', 'utf8');
    const web = readFileSync('server/web/common.js', 'utf8');
    const screen = readFileSync('hud/src/main/java/dev/slash3rss/slashclient/hud/cosmetics/CosmeticsScreen.java', 'utf8');
    for (const id of KILL_EFFECT_IDS) {
      assert.ok(new RegExp(`\\b${id}: 'fa-`).test(app), `launcher icon ${id}`);
      assert.ok(new RegExp(`\\b${id}: 'fa-`).test(web), `website icon ${id}`);
      assert.ok(screen.includes(`Map.entry("${id}"`), `game icon ${id}`);
    }
    for (const lang of ['pl_pl', 'en_us']) {
      const strings = JSON.parse(readFileSync(`hud/src/main/resources/assets/slashclient-hud/lang/${lang}.json`, 'utf8'));
      for (const key of ['cosmetics.slot.kill', 'cosmetics.preview', 'cosmetics.killHint', 'cosmetics.killWorld', 'set.killEffects', 'set.killEffects.others']) {
        assert.ok(strings[`slashclient-hud.${key}`], `${lang}: ${key}`);
      }
    }
  });
});
