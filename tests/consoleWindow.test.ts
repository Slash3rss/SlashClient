import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { keepLast } from '../src/main/gamelog';
import { lookup, setLang } from '../src/shared/i18n';

describe('the console window', () => {
  it('keeps only the newest lines of a long game', () => {
    const lines = ['a', 'b'];
    assert.deepEqual(keepLast(lines, ['c', 'd'], 3), ['b', 'c', 'd']);
    assert.equal(keepLast([], Array.from({ length: 2500 }, (_, i) => String(i))).length, 2000);
  });
  it('has an English text for every Polish one of the window and its switches', () => {
    setLang('en');
    const page = readFileSync('src/renderer/console.ts', 'utf8');
    const texts = [...page.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]);
    texts.push('Otwórz w osobnym oknie', 'Otwieraj okno konsoli przy starcie gry', 'Konsola');
    assert.ok(texts.length > 10);
    for (const text of texts) assert.ok(lookup(text), `no English for: ${text}`);
    setLang('pl');
  });
});
