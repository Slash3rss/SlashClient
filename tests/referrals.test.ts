import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setLang } from '../src/shared/i18n';
import { REFERRALS_EN } from '../src/shared/i18nReferrals';
import { connectedText, errorCode, invitesText, nextReward, normalizeCode, progressText, redeemErrorText, rulesText, shouldPrompt, type Referrals } from '../src/renderer/referrals';

const base: Referrals = {
  enabled: true, code: 'MINE12', link: 'https://slashclient.pl/z/MINE12', canRedeem: true, redeemUntil: null, redeemed: null, suggested: null,
  hoursGoal: 3, daysGoal: 2, inviterSparks: 200, inviteeSparks: 100, counted: 0, invited: [], rewards: [],
};

describe('inviting friends in the launcher', () => {
  it('tidies a typed or pasted code', () => {
    assert.equal(normalizeCode('  abc123 '), 'ABC123');
    assert.equal(normalizeCode('abc 12-3'), 'ABC123');
    assert.equal(normalizeCode('https://slashclient.pl/z/xyz789'), 'XYZ789');
    assert.equal(normalizeCode('slashclient.pl/z/Xyz789/?utm=1'), 'XYZ789');
    assert.equal(normalizeCode('ab!c'), 'ABC');
    assert.equal(normalizeCode(''), '');
    assert.equal(normalizeCode('a'.repeat(80)).length, 32);
  });

  it('asks for a friend\'s code only when the account can still enter one', () => {
    const now = 1_000_000;
    assert.equal(shouldPrompt(base, false, now), true);
    assert.equal(shouldPrompt({ ...base, redeemUntil: now + 1 }, false, now), true);
    assert.equal(shouldPrompt({ ...base, redeemUntil: now - 1 }, false, now), false);
    assert.equal(shouldPrompt(base, true, now), false);
    assert.equal(shouldPrompt({ ...base, canRedeem: false }, false, now), false);
    assert.equal(shouldPrompt({ ...base, redeemed: { handle: 'ola', name: 'Ola' } }, false, now), false);
    assert.equal(shouldPrompt({ enabled: false } as Referrals, false, now), false);
    assert.equal(shouldPrompt(undefined, false, now), false);
  });

  it('shows a friend\'s progress without going past the goal', () => {
    setLang('pl');
    assert.equal(progressText(1.5, 1, 3, 2), '1,5/3 h · 1/2 dni');
    assert.equal(progressText(7.25, 4, 3, 2), '3/3 h · 2/2 dni');
    assert.equal(progressText(0, 0, 2, 1), '0/2 h · 0/1 dzień');
    setLang('en');
    assert.equal(progressText(1.5, 1, 3, 2), '1.5/3 h · 1/2 days');
    setLang('pl');
  });

  it('counts invites in Polish forms', () => {
    setLang('pl');
    assert.deepEqual([1, 3, 5, 22, 25].map(invitesText), ['1 zaproszenie', '3 zaproszenia', '5 zaproszeń', '22 zaproszenia', '25 zaproszeń']);
    setLang('en');
    assert.deepEqual([1, 3].map(invitesText), ['1 invite', '3 invites']);
    setLang('pl');
  });

  it('finds the next cape to get', () => {
    const rewards = [5, 1, 3].map((count) => ({ count, item: `ref${count}`, itemName: `R${count}`, sparks: 0, reached: count <= 1 }));
    assert.deepEqual(nextReward(rewards, 1), { reward: rewards[2], missing: 2 });
    assert.equal(nextReward(rewards.map((r) => ({ ...r, reached: true })), 9), undefined);
    assert.equal(nextReward([], 0), undefined);
  });

  it('says what went wrong with a code and what happens after a good one', () => {
    setLang('pl');
    assert.equal(errorCode(new Error("Error invoking remote method 'social:api': Error: social:bad_code")), 'bad_code');
    assert.equal(redeemErrorText('bad_code'), 'Nie ma takiego kodu.');
    assert.equal(redeemErrorText('own_code'), 'To Twój własny kod.');
    assert.equal(redeemErrorText('offline'), undefined);
    assert.equal(connectedText('Ola', base), 'Połączono z Ola. Gdy pograsz 3 h w 2 dni, oboje dostaniecie Iskry.');
    assert.match(rulesText(base), /pogra 3 h w co najmniej 2 dni, dostaniesz 200 Iskier, a on 100 Iskier\.$/);
    setLang('en');
    assert.equal(redeemErrorText('too_late'), 'A code can only be entered within a few days of making the account.');
    assert.equal(connectedText('Ola', base), 'Connected with Ola. Once you play 3 h on 2 days, you both get Sparks.');
    setLang('pl');
  });

  it('has every text in English', () => {
    for (const file of ['src/renderer/referrals.ts']) {
      const source = readFileSync(file, 'utf8');
      const texts = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, '\''));
      assert.ok(texts.length > 20);
      for (const text of texts) assert.ok(text in REFERRALS_EN, `no English for: ${text}`);
    }
    const tab = readFileSync('src/renderer/achievements.ts', 'utf8');
    for (const text of ['Zaproś', ' Zaproszenie: {0}', 'Zaproszenia są teraz wyłączone.']) {
      assert.ok(tab.includes(`t('${text}'`), text);
      assert.ok(text in REFERRALS_EN, text);
    }
  });

  it('may ask the server for invites', () => {
    assert.match(readFileSync('src/main/main.ts', 'utf8'), /\|challenges\|referrals\|/);
  });
});
