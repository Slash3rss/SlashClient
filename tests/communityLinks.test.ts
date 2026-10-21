import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setLang, t } from '../src/shared/i18n';
import { COMMUNITY_LINKS_EN } from '../src/shared/i18nCommunityLinks';
import { LINK_EXPIRIES, LINK_USES, expiryText, linkCodeOf, linkErrorText, linkLogName, linkStatusText, playingText, usesText, versionFromPing } from '../src/renderer/communityLinks';

describe('community invite links and game servers in the launcher', () => {
  it('offers the same expiries and uses as the server', () => {
    const server = readFileSync('server/src/communityLinks.ts', 'utf8');
    assert.match(server, new RegExp(`LINK_EXPIRIES = \\[${LINK_EXPIRIES.join(', ')}\\]`));
    assert.match(server, new RegExp(`LINK_USES = \\[${LINK_USES.join(', ')}\\]`));
  });

  it('reads a code or a whole link pasted', () => {
    assert.equal(linkCodeOf('ab3def7h'), 'ab3def7h');
    assert.equal(linkCodeOf('  https://client.slash3rss.dev/c/AB3DEF7H  '), 'ab3def7h');
    assert.equal(linkCodeOf('client.slash3rss.dev/c/ab3def7h/'), 'ab3def7h');
    assert.equal(linkCodeOf('https://client.slash3rss.dev/c/ab3def7h#x'), 'ab3def7h');
    for (const bad of ['', 'abc', 'https://client.slash3rss.dev/s/TAG/x', 'ab3d ef7h', 'ab3def7h!']) assert.equal(linkCodeOf(bad), undefined, bad);
  });

  it('says how long a link lives and how often it was used', () => {
    assert.deepEqual(LINK_EXPIRIES.map(expiryText), ['30 min', '1 godz.', '1 dzień', '7 dni', 'Nigdy']);
    assert.deepEqual(LINK_USES.map(usesText), ['1 użycie', '5 użyć', '10 użyć', '25 użyć', '100 użyć', 'Bez limitu']);
    const now = 1_000_000_000;
    assert.equal(linkStatusText({ expiresAt: 0, maxUses: 0, uses: 3 }, now), 'użyto 3 · bez terminu');
    assert.equal(linkStatusText({ expiresAt: now + 25 * 60_000, maxUses: 5, uses: 2 }, now), 'użyto 2 z 5 · wygasa za 25 min');
    assert.equal(linkStatusText({ expiresAt: now + 90 * 60_000, maxUses: 0, uses: 0 }, now), 'użyto 0 · wygasa za 2 godz.');
    assert.equal(linkStatusText({ expiresAt: now + 6.5 * 86_400_000, maxUses: 1, uses: 0 }, now), 'użyto 0 z 1 · wygasa za 7 dni');
    assert.equal(playingText(1), '1 członek gra teraz');
    assert.equal(playingText(4), '4 członków gra teraz');
  });

  it('finds the version a server runs in what it says of itself', () => {
    assert.equal(versionFromPing('1.21.4'), '1.21.4');
    assert.equal(versionFromPing('Paper 1.20.1'), '1.20.1');
    assert.equal(versionFromPing('Velocity 1.8.x-1.21.4'), '1.21.4');
    assert.equal(versionFromPing('BungeeCord 1.8-1.21'), '1.21');
    assert.equal(versionFromPing('Velocity 3.4.0'), undefined);
    assert.equal(versionFromPing(undefined), undefined);
  });

  it('names the new log entries and errors, in English too', () => {
    assert.equal(linkLogName('link_create'), 'tworzy link zaproszenia');
    assert.equal(linkLogName('pin'), undefined);
    assert.equal(linkErrorText('invite_expired'), 'To zaproszenie wygasło albo wykorzystano już wszystkie jego użycia.');
    assert.equal(linkErrorText('nope'), undefined);
    setLang('en');
    try {
      assert.equal(linkErrorText('invite_not_found'), 'There is no such invite, or it was revoked.');
      assert.equal(expiryText(10080), '7 days');
      assert.equal(t('Dołącz przez zaproszenie'), 'Join with an invite');
    } finally {
      setLang('pl');
    }
  });

  it('has an English text for every Polish one', () => {
    const source = readFileSync('src/renderer/communityLinks.ts', 'utf8');
    const keys = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
    assert.ok(keys.length > 40);
    setLang('en');
    try {
      for (const k of keys) assert.ok(k in COMMUNITY_LINKS_EN || t(k) !== k, `no English for "${k}"`);
    } finally {
      setLang('pl');
    }
  });
});
