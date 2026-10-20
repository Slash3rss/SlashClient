import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setLang } from '../src/shared/i18n';
import { CURRENCY, polishForm, signedSparks, sparks } from '../src/shared/sparks';
import { byCategory, summaryText, unlockText, type Achievement } from '../src/renderer/achievements';
import { shortBy } from '../src/renderer/sparkShop';
import { ITEMS } from '../server/src/cosmetics';

const a = (id: string, category: string, unlocked: boolean, sparksPaid = 10): Achievement => ({
  id, group: 'hours', category, tier: 1, goal: 1, sparks: sparksPaid, name: id, nameEn: id, description: '', descriptionEn: '', unlockedAt: unlocked ? 1 : null,
});

describe('sparks', () => {
  it('uses the Polish plural forms and English ones', () => {
    setLang('pl');
    assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 102, 112, 0].map(polishForm), [0, 1, 1, 2, 2, 2, 2, 2, 1, 2, 1, 2, 2]);
    assert.equal(sparks(1), '1 Iskra');
    assert.equal(sparks(3), '3 Iskry');
    assert.equal(sparks(13), '13 Iskier');
    assert.equal(signedSparks(40), '+40 Iskier');
    assert.equal(signedSparks(-2), '−2 Iskry');
    setLang('en');
    assert.equal(sparks(1), '1 Spark');
    assert.equal(sparks(40), '40 Sparks');
    setLang('pl');
  });

  it('has the same name in the launcher and on the server', () => {
    // the server's files import with .ts endings, so they are read here, not imported
    const server = readFileSync('server/src/economy.ts', 'utf8');
    assert.ok(server.includes(`pl: [${CURRENCY.pl.map((f) => `'${f}'`).join(', ')}] as const`));
    assert.ok(server.includes(`en: [${CURRENCY.en.map((f) => `'${f}'`).join(', ')}] as const`));
  });

  it('words an unlock with its sparks, and many unlocks as one notice', () => {
    setLang('pl');
    const one = unlockText({ name: 'Weteran', nameEn: 'Veteran', sparks: 200, reward: { id: 'veteran', slot: 'cape', name: 'Weteran' } });
    assert.equal(one.title, 'Osiągnięcie odblokowane: Weteran');
    assert.match(one.body, /^\+200 Iskier\. Nagroda: peleryna Weteran/);
    assert.match(unlockText({ name: 'X', nameEn: 'X' }).body, /^Zobacz/);
    assert.deepEqual(summaryText(5, 320), { title: 'Odblokowano osiągnięcia: 5', body: '+320 Iskier za osiągnięcia. Wydaj je w sklepie w zakładce Osiągnięcia.' });
    setLang('en');
    assert.equal(summaryText(3, 22).title, '3 achievements unlocked');
    assert.match(summaryText(3, 22).body, /^\+22 Sparks for achievements/);
    setLang('pl');
  });

  it('groups achievements by category in the order given, unknown ones last', () => {
    const groups = byCategory([a('x', 'style', false), a('y', 'play', true), a('z', 'play', false), a('w', 'future', true)], ['play', 'streak', 'style']);
    assert.deepEqual(groups.map((g) => [g.category, g.items.length, g.unlocked]), [['play', 2, 1], ['style', 1, 0], ['future', 1, 1]]);
  });

  it('has a name and an icon for every category and an icon for every group of the server', () => {
    const source = readFileSync('src/renderer/achievements.ts', 'utf8');
    const server = readFileSync('server/src/achievements.ts', 'utf8');
    const list = /CATEGORIES: Category\[\] = \[([^\]]*)\]/.exec(server)?.[1] ?? '';
    const categories = [...list.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    assert.ok(categories.length >= 8);
    for (const c of categories) assert.ok(source.includes(` ${c}: ['`), c);
    const groups = new Set([...server.matchAll(/group: '(\w+)'/g)].map((m) => m[1]));
    assert.ok(groups.size >= 25);
    for (const g of groups) assert.ok(source.includes(` ${g}: 'fa-`), g);
  });

  it('says how many sparks are missing for an item', () => {
    setLang('pl');
    assert.equal(shortBy(600, 600), '');
    assert.equal(shortBy(600, 598), 'Brakuje Ci 2 Iskry.');
    assert.ok(ITEMS.some((i) => i.price));
  });
});
