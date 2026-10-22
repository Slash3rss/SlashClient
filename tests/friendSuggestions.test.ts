import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';
import { durationText, mutualText, reasons, whenText, type Suggestion } from '../src/renderer/friendSuggestions';
import { setLang, t } from '../src/shared/i18n';
import { SUGGESTIONS_EN } from '../src/shared/i18nSuggestions';

const DAY = 86_400_000;
const suggestion = (extra: Partial<Suggestion> = {}): Suggestion => ({
  id: 'u1', handle: 'Ola', name: 'Ola', avatar: '', server: 'skyup.pl', minutes: 125, nearbyMinutes: 0, lastAt: Date.now(), mutual: 0, ...extra,
});

describe('friend suggestions in the launcher', () => {
  it('says why someone is suggested', () => {
    const now = new Date(2026, 9, 22, 18, 0).getTime();
    assert.deepEqual(reasons(suggestion({ lastAt: now - DAY }), now), ['Graliście razem na skyup.pl · 2 h · wczoraj']);
    assert.deepEqual(reasons(suggestion({ minutes: 40, lastAt: now - 60_000, mutual: 3 }), now), ['Graliście razem na skyup.pl · 40 min · dzisiaj', '3 wspólnych znajomych']);
    assert.deepEqual(reasons(suggestion({ minutes: 0, nearbyMinutes: 2, lastAt: now - 3 * DAY, mutual: 1 }), now), ['Byliście obok siebie na skyup.pl · 3 dni temu', '1 wspólny znajomy']);
    assert.deepEqual(reasons(suggestion({ minutes: 30, nearbyMinutes: 5, lastAt: now }), now), ['Graliście razem na skyup.pl · 30 min · dzisiaj', 'Widzieliście się w grze']);
    // just after midnight a meeting late yesterday is "yesterday", not "today"
    assert.equal(whenText(new Date(2026, 9, 21, 23, 50).getTime(), new Date(2026, 9, 22, 0, 10).getTime()), 'wczoraj');
    assert.equal(durationText(0.2), '1 min');
    assert.equal(durationText(59), '59 min');
    assert.equal(durationText(150), '3 h');
    assert.equal(mutualText(1), '1 wspólny znajomy');
    setLang('en');
    try {
      assert.deepEqual(reasons(suggestion({ lastAt: now - DAY, mutual: 2 }), now), ['You played together on skyup.pl · 2 h · yesterday', '2 mutual friends']);
      assert.equal(mutualText(1), '1 mutual friend');
    } finally {
      setLang('pl');
    }
  });

  it('has every text in English', () => {
    const texts = [...readFileSync('src/renderer/friendSuggestions.ts', 'utf8').matchAll(/t\('([^']+)'/g)].map((m) => m[1]);
    assert.ok(texts.length > 10);
    setLang('en');
    try {
      // "{0} min" and "{0} h" are the same in both languages
      for (const text of texts) if (!/^\{0\} (min|h)$/.test(text)) assert.notEqual(t(text), text, text);
    } finally {
      setLang('pl');
    }
    for (const [pl, en] of Object.entries(SUGGESTIONS_EN)) assert.equal(pl.split(/\{\d\}/).length, en.split(/\{\d\}/).length, pl);
  });

  it('shows the switch for being suggested in profile privacy', () => {
    const src = readFileSync('src/renderer/profilePrivacy.ts', 'utf8');
    assert.match(src, /Pokazuj mnie w propozycjach znajomych/);
    assert.match(src, /\/v1\/me\/suggestions/);
  });

  it('lets the game list, dismiss and add suggestions and report players nearby through the bridge, nothing more', async () => {
    const calls: string[] = [];
    const bridge = new GameBridge({
      call: async (method, path, body) => {
        calls.push(`${method} ${path} ${JSON.stringify(body ?? null)}`);
        return { ok: true };
      },
      state: () => ({ signedIn: true }),
    });
    const { url, key } = await bridge.start();
    const req = (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    try {
      assert.equal((await req('/v1/friends/suggestions')).status, 200);
      assert.equal((await req('/v1/friends/suggestions?limit=6')).status, 200);
      assert.equal((await req('/v1/friends/suggestions/abc-1/dismiss', 'POST')).status, 200);
      assert.equal((await req('/v1/friends/requests', 'POST', { handle: 'Ola' })).status, 200);
      assert.equal((await req('/v1/mc/nearby', 'POST', { server: 'skyup.pl', uuids: [] })).status, 200);
      // only a handle: nothing else rides along a request from the game
      assert.equal((await req('/v1/friends/requests', 'POST', { handle: 'Ola', note: 'x' })).status, 403);
      assert.equal((await req('/v1/friends/requests', 'POST', { handle: 'a b' })).status, 403);
      // the switch for being suggested stays in the launcher
      assert.equal((await req('/v1/me/suggestions', 'POST', { visible: false })).status, 403);
      assert.equal((await req('/v1/friends/suggestions?limit=6&x=1')).status, 403);
      assert.deepEqual(calls, [
        'GET /v1/friends/suggestions null',
        'GET /v1/friends/suggestions?limit=6 null',
        'POST /v1/friends/suggestions/abc-1/dismiss null',
        'POST /v1/friends/requests {"handle":"Ola"}',
        'POST /v1/mc/nearby {"server":"skyup.pl","uuids":[]}',
      ]);
    } finally {
      bridge.stop();
    }
  });
});
