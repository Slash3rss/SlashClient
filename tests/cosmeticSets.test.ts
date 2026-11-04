import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setLang, t } from '../src/shared/i18n';
import { SETS_EN } from '../src/shared/i18nSets';
import { missingText, setParts, setWorn, wearBody, type CosmeticSet, type SetItem } from '../src/renderer/cosmeticSets';

const frost: CosmeticSet = { id: 'frost', name: 'Lód', nameEn: 'Frost', parts: { cape: 'ice', wings: 'frost', elytra: 'glacier', aura: 'frostaura', kill: 'shatter' } };
const catalog: SetItem[] = [
  { id: 'ice', slot: 'cape', name: 'Lód', available: false, hint: 'Osiągnięcie „Pięciu znajomych”', hintEn: 'Achievement “Five friends”' },
  { id: 'frost', slot: 'wings', name: 'Lodowe', available: true },
  { id: 'glacier', slot: 'elytra', name: 'Lodowiec', available: false, price: 700 },
  { id: 'shatter', slot: 'kill', name: 'Lodowy rozprysk', available: true },
  // an item of the same id in another slot is not the set's part
  { id: 'frostaura', slot: 'trail', name: 'Nie ten', available: true },
];
const sparks = (n: number) => `${n} Iskier`;

describe('cosmetic sets in the launcher', () => {
  it('takes the parts from the catalogue in the set\'s order, leaving out ones it has not got', () => {
    assert.deepEqual(setParts(frost, catalog).map((p) => `${p.slot}:${p.id}`), ['cape:ice', 'wings:frost', 'elytra:glacier', 'kill:shatter']);
    assert.deepEqual(setParts({ ...frost, parts: { ears: 'wolfears' } }, catalog), []);
  });

  it('puts on only the parts we have, the cape apart from the rest', () => {
    const parts = setParts(frost, catalog);
    assert.deepEqual(wearBody(parts), { loadout: { wings: 'frost', kill: 'shatter' } });
    assert.deepEqual(wearBody(parts.map((p) => ({ ...p, available: true }))), { cape: 'ice', loadout: { wings: 'frost', elytra: 'glacier', kill: 'shatter' } });
    assert.deepEqual(wearBody(parts.filter((p) => p.slot === 'cape').map((p) => ({ ...p, available: true }))), { cape: 'ice' });
    assert.deepEqual(wearBody([]), {});
  });

  it('knows when the set is worn: every part we have', () => {
    const parts = setParts(frost, catalog);
    assert.equal(setWorn(parts, { wings: 'frost', kill: 'shatter' }), true);
    assert.equal(setWorn(parts, { wings: 'frost' }), false);
    assert.equal(setWorn(parts.filter((p) => !p.available), {}), false);
  });

  it('says how to get a missing part', () => {
    setLang('pl');
    const [ice, , glacier] = setParts(frost, catalog);
    assert.equal(missingText(glacier, sparks, (r) => r), 'Lodowiec: w sklepie za 700 Iskier');
    assert.equal(missingText(ice, sparks, (r) => r), 'Lód: Osiągnięcie „Pięciu znajomych”');
    assert.equal(missingText({ id: 'royal', slot: 'aura', name: 'Królewska', available: false, rank: 'admin' }, sparks, () => 'Admin'), 'Królewska: tylko dla rangi Admin');
    setLang('en');
    assert.equal(missingText(ice, sparks, (r) => r), 'Lód: Achievement “Five friends”');
    assert.equal(missingText({ id: 'x', slot: 'hat', name: 'X', available: false }, sparks, (r) => r), 'X: exclusive, given by an admin');
    setLang('pl');
  });

  it('has every text in English', () => {
    setLang('en');
    for (const file of ['src/renderer/cosmeticSets.ts', 'src/renderer/app.ts']) {
      const source = readFileSync(file, 'utf8');
      const texts = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, '\''))
        .filter((text) => file.endsWith('cosmeticSets.ts') || text in SETS_EN);
      assert.ok(texts.length >= 3, file);
      for (const text of texts) assert.notEqual(t(text), text, `no English for: ${text}`);
    }
    for (const text of Object.keys(SETS_EN)) assert.ok(readFileSync('src/renderer/app.ts', 'utf8').includes(`t('${text}'`) || readFileSync('src/renderer/cosmeticSets.ts', 'utf8').includes(`t('${text}'`), text);
    setLang('pl');
  });
});
