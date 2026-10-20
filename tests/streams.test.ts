import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setLang, t } from '../src/shared/i18n';
import { cleanStream, noticeText, streamLine } from '../src/renderer/streams';

describe('friends live on Twitch and Kick', () => {
  const raw = { platform: 'twitch', login: 'ala_tv', name: 'AlaTV', url: 'https://www.twitch.tv/ala_tv', title: 'Budujemy\nzamek', category: 'Minecraft', viewers: 42.7, startedAt: 1700000000000 };

  it('keeps only streams with a link to the platform itself', () => {
    const s = cleanStream(raw)!;
    assert.equal(s.title, 'Budujemy zamek');
    assert.equal(s.viewers, 42);
    assert.equal(cleanStream({ ...raw, platform: 'kick', url: 'https://kick.com/bobk' })?.platform, 'kick');
    for (const bad of [null, 'x', { ...raw, platform: 'youtube' }, { ...raw, url: 'https://evil.example/ala' }, { ...raw, url: 'javascript:alert(1)' }, { ...raw, url: 'https://www.twitch.tv/ala/../../x' }]) {
      assert.equal(cleanStream(bad), undefined, JSON.stringify(bad));
    }
  });

  it('says it in Polish and in English', () => {
    const s = cleanStream(raw)!;
    assert.equal(streamLine(s), 'LIVE na Twitch · Budujemy zamek');
    assert.equal(noticeText('Ala', s), 'Ala nadaje na żywo na Twitch: Budujemy zamek');
    assert.equal(noticeText('Ala', { ...s, title: '' }), 'Ala nadaje na żywo na Twitch');
    setLang('en');
    try {
      assert.equal(noticeText('Ala', { ...s, platform: 'kick' }), 'Ala is live on Kick: Budujemy zamek');
      assert.equal(streamLine({ ...s, title: '' }), 'LIVE on Twitch');
      // every text of the streams' code has its English
      const texts = [...readFileSync('src/renderer/streams.ts', 'utf8').matchAll(/t\('([^']+)'/g)].map((m) => m[1]);
      texts.push(...[...readFileSync('src/renderer/friends.ts', 'utf8').matchAll(/t\('((?:[^']*)(?:Oglądaj|Streamy)[^']*)'/g)].map((m) => m[1]));
      assert.ok(texts.length > 12);
      for (const text of texts) assert.notEqual(t(text), text, text);
    } finally {
      setLang('pl');
    }
  });

  it('passes the server\'s stream events on to the game', () => {
    assert.match(readFileSync('src/main/bridge.ts', 'utf8'), /'stream'\]/);
  });
});
