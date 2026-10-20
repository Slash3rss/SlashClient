import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PROFILES_EN } from '../src/shared/i18nProfiles';
import { setLang, t } from '../src/shared/i18n';

describe('profile privacy window', () => {
  it('has every text in English', () => {
    const texts = [...readFileSync('src/renderer/profilePrivacy.ts', 'utf8').matchAll(/t\('([^']+)'\)/g)].map((m) => m[1]);
    // the elements' names are passed to t() from a list
    texts.push(...[...readFileSync('src/renderer/profilePrivacy.ts', 'utf8').matchAll(/\['\w+', '([^']+)'\]/g)].map((m) => m[1]));
    assert.ok(texts.length > 15);
    setLang('en');
    try {
      for (const text of texts) assert.notEqual(t(text), text, text);
    } finally {
      setLang('pl');
    }
    assert.ok(Object.keys(PROFILES_EN).length > 10);
  });

  it('names the same parts as the server', () => {
    const server = readFileSync('server/src/profiles.ts', 'utf8');
    const list = /export const ELEMENTS = \[([^\]]+)\]/.exec(server)![1].match(/'(\w+)'/g)!.map((s) => s.slice(1, -1)).sort();
    const launcher = [...readFileSync('src/renderer/profilePrivacy.ts', 'utf8').matchAll(/\['(\w+)', '/g)].map((m) => m[1]).sort();
    const site = [...readFileSync('server/web/profilePrivacy.js', 'utf8').matchAll(/\['(\w+)', '[^']+'\]/g)].map((m) => m[1]).sort();
    assert.deepEqual(launcher, list);
    assert.deepEqual(site, list);
  });
});
