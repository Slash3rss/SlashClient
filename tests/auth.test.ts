import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureFreshAccount, FORCED_RENEW_GAP_MS, GAME_RENEW_MS, gameSessionMargin, needsRefresh } from '../src/main/auth';
import { secrets, type MicrosoftAccount } from '../src/main/store';
import { setLang } from '../src/shared/i18n';

setLang('pl');

describe('Microsoft sign-in', () => {
  it('refreshes a session with the app that issued it, not the launcher default', async () => {
    const sent: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sent.push(new URLSearchParams(String(init?.body)).get('client_id') ?? '');
      return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'stop here' }), { status: 400 });
    }) as typeof fetch;
    const account: MicrosoftAccount = { id: 'a', type: 'msa', name: 'Steve', uuid: 'u', xuid: 'x', accessToken: '', expiresAt: 0, refreshToken: secrets.encrypt('r') };
    try {
      await assert.rejects(ensureFreshAccount({ ...account, clientId: 'old-app' }, 'new-app'), /zaloguj się ponownie/);
      // accounts from before the launcher remembered it: the default
      await assert.rejects(ensureFreshAccount(account, 'new-app'), /zaloguj się ponownie/);
    } finally {
      globalThis.fetch = real;
    }
    assert.deepEqual(sent, ['old-app', 'new-app']);
  });

  it('renews a running game\'s token two hours before its end, or at once when a server refused it', () => {
    const now = 1_000_000_000;
    const hour = 3_600_000;
    // a token from launch (about a day): left alone
    assert.equal(needsRefresh(now + 20 * hour, now, gameSessionMargin(false, undefined, now)), false);
    // under two hours left: renewed
    assert.equal(needsRefresh(now + GAME_RENEW_MS - 1, now, gameSessionMargin(false, undefined, now)), true);
    assert.equal(needsRefresh(now - 1, now), true);
    assert.equal(needsRefresh(now + 1, now), false);
    // "invalid session" from a server: renewed even with a day left, but not again a moment later
    assert.equal(needsRefresh(now + 20 * hour, now, gameSessionMargin(true, undefined, now)), true);
    assert.equal(gameSessionMargin(true, now - 1000, now), GAME_RENEW_MS);
    assert.equal(gameSessionMargin(true, now - FORCED_RENEW_GAP_MS, now), Infinity);
  });

  it('keeps a token with enough time left and refreshes one with too little', async () => {
    let calls = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'stop here' }), { status: 400 });
    }) as typeof fetch;
    const account: MicrosoftAccount = { id: 'a', type: 'msa', name: 'Steve', uuid: 'u', xuid: 'x', accessToken: 't', expiresAt: Date.now() + 3 * 3_600_000, refreshToken: secrets.encrypt('r'), clientId: 'app' };
    try {
      assert.equal(await ensureFreshAccount(account, 'app'), account);
      assert.equal(await ensureFreshAccount(account, 'app', GAME_RENEW_MS), account);
      assert.equal(calls, 0);
      await assert.rejects(ensureFreshAccount(account, 'app', 4 * 3_600_000), /zaloguj się ponownie/);
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = real;
    }
  });
});
