import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { openLoopback } from '../src/main/oauthLoopback';

describe('signing in through the browser back to this launcher', () => {
  it('ends only its own sign-in, once, with the secret behind the challenge', async () => {
    const seen: { key: string; verifier: string }[] = [];
    const loop = await openLoopback(() => 'stan1', async (key, verifier) => {
      seen.push({ key, verifier });
      return key === 'dobry';
    }, (ok, lang) => `https://example.test/v1/auth/done?ok=${ok ? 1 : 0}&lang=${lang}`);
    try {
      const base = `http://127.0.0.1:${loop.port}`;
      const get = (path: string) => fetch(base + path, { redirect: 'manual' });
      // another sign-in's state, or no key: turned away, nothing ended
      assert.equal((await get('/slashclient-login?state=obcy&key=dobry')).status, 404);
      assert.equal((await get('/slashclient-login?state=stan1')).status, 404);
      assert.equal((await get('/inne?state=stan1&key=dobry')).status, 404);
      assert.equal(seen.length, 0);

      const back = await get('/slashclient-login?state=stan1&key=dobry&lang=en');
      assert.equal(back.status, 302);
      assert.equal(back.headers.get('location'), 'https://example.test/v1/auth/done?ok=1&lang=en');
      assert.equal(seen.length, 1);
      assert.equal(seen[0].key, 'dobry');
      // the server checks the verifier against the challenge it was given at the start
      assert.equal(createHash('sha256').update(seen[0].verifier).digest('base64url'), loop.challenge);
      // a second visit (refresh, someone else) does nothing
      assert.equal((await get('/slashclient-login?state=stan1&key=dobry')).status, 404);
      assert.equal(seen.length, 1);
    } finally {
      loop.close();
    }
  });

  it('sends the browser to the failure page when the server refuses', async () => {
    const loop = await openLoopback(() => 's', async () => {
      throw new Error('offline');
    }, (ok) => `https://example.test/done?ok=${ok ? 1 : 0}`);
    try {
      const back = await fetch(`http://127.0.0.1:${loop.port}/slashclient-login?state=s&key=k`, { redirect: 'manual' });
      assert.equal(back.headers.get('location'), 'https://example.test/done?ok=0');
    } finally {
      loop.close();
    }
  });
});
