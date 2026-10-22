import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setLang } from '../src/shared/i18n';
import { SPARKS_EN } from '../src/shared/i18nSparks';
import { bonusText, completedText, timeLeft } from '../src/renderer/challenges';

describe('challenges in the launcher', () => {
  it('says how long until the next ones', () => {
    setLang('pl');
    assert.equal(timeLeft(4 * 60_000), '4 min');
    assert.equal(timeLeft(4 * 60_000 + 1), '5 min');
    assert.equal(timeLeft((5 * 60 + 12) * 60_000), '5 h 12 min');
    assert.equal(timeLeft((2 * 1440 + 3 * 60 + 5) * 60_000), '2 d 3 h');
    assert.equal(timeLeft(-5000), '0 min');
  });

  it('words a completed challenge and the bonus in both languages', () => {
    setLang('pl');
    const c = { name: 'Graj 30 min', nameEn: 'Play for 30 min', sparks: 15, period: 'daily' as const };
    assert.deepEqual(completedText(c), { title: 'Wyzwanie ukończone: Graj 30 min', body: '+15 Iskier. Pozostałe wyzwania znajdziesz w zakładce Osiągnięcia.' });
    assert.deepEqual(bonusText('weekly', 100), { title: 'Wszystkie wyzwania tygodnia ukończone!', body: 'Premia: +100 Iskier.' });
    setLang('en');
    assert.deepEqual(completedText(c), { title: 'Challenge completed: Play for 30 min', body: '+15 Sparks. Find the others in the Achievements tab.' });
    assert.equal(bonusText('daily', 1).body, 'Bonus: +1 Spark.');
    assert.equal(timeLeft((5 * 60 + 12) * 60_000), '5 h 12 min');
    setLang('pl');
  });

  it('has every text in English', () => {
    const source = readFileSync('src/renderer/challenges.ts', 'utf8');
    const texts = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, '\''));
    assert.ok(texts.length > 10);
    for (const text of texts) assert.ok(text in SPARKS_EN, `no English for: ${text}`);
  });

  it('asks the server for them and passes their events on to the game', () => {
    assert.match(readFileSync('src/main/main.ts', 'utf8'), /\|achievements\|challenges\|/);
    const bridge = readFileSync('src/main/bridge.ts', 'utf8');
    assert.ok(bridge.includes("'challenge', 'challenges-bonus'"));
  });
});
