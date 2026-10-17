import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureFreshAccount } from '../src/main/auth';
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
});
