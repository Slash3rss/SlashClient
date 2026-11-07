import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { lookup, setLang } from '../src/shared/i18n';
import { profileLinkHandle } from '../src/shared/profileLinks';

describe("a player's profile in the launcher", () => {
  it('opens profile links of SlashClient and its server here, other links in the browser', () => {
    assert.equal(profileLinkHandle('https://slashclient.pl/u/Slash3rss'), 'Slash3rss');
    assert.equal(profileLinkHandle('https://client.slash3rss.dev/gracz/gracz.1/'), 'gracz.1');
    assert.equal(profileLinkHandle('http://localhost:8811/u/Szef', 'http://localhost:8811'), 'Szef');
    assert.equal(profileLinkHandle('http://slashclient.pl/u/Szef'), undefined);
    assert.equal(profileLinkHandle('https://evil.example/u/Szef'), undefined);
    assert.equal(profileLinkHandle('https://slashclient.pl/u/Szef/achievements'), undefined);
    assert.equal(profileLinkHandle('https://slashclient.pl/u/%E0%A4%A'), undefined);
    assert.equal(profileLinkHandle('nie link'), undefined);
  });
  it('has an English text for every Polish one', () => {
    setLang('en');
    const page = readFileSync('src/renderer/playerProfile.ts', 'utf8');
    const texts = [...page.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]);
    assert.ok(texts.length > 20);
    const missing = texts.filter((text) => !lookup(text));
    setLang('pl');
    assert.deepEqual(missing, []);
  });
});
