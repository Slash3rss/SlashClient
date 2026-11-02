import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureFreshAccount, FORCED_RENEW_GAP_MS, GAME_RENEW_MS, gameSessionAccount, LAUNCH_RENEW_MS, gameSessionMargin, needsRefresh } from '../src/main/auth';
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

  it('starts a game with a token for many hours, renewing one with only a few left', () => {
    const now = 1_000_000_000;
    const hour = 3_600_000;
    // a day-old sign-in with five hours left: renewed before the start, not hours later on a server
    assert.equal(needsRefresh(now + 5 * hour, now, LAUNCH_RENEW_MS), true);
    assert.equal(needsRefresh(now + 20 * hour, now, LAUNCH_RENEW_MS), false);
    // longer than the running game's margin, so a fresh start never renews again soon after
    assert.ok(LAUNCH_RENEW_MS > GAME_RENEW_MS);
  });

  it('gives each running game the session of its own account, also with two games on two accounts', () => {
    const msa = (id: string, uuid: string) => ({ id, type: 'msa', name: id, uuid, accessToken: 't', refreshToken: 'r', xuid: '', expiresAt: 0 }) as unknown as MicrosoftAccount;
    const guardes = msa('a1', '11111111-2222-3333-4444-555555555555');
    const slash = msa('a2', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const offline = { id: 'a3', type: 'offline' as const, name: 'Guardes', uuid: '11111111-2222-3333-4444-555555555555' };
    const accounts = [offline, guardes, slash];
    // the game on Guardes asks while the last game started plays as Slash3rss
    assert.equal(gameSessionAccount(accounts, '11111111222233334444555555555555', 'a2'), guardes);
    assert.equal(gameSessionAccount(accounts, 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', 'a1'), slash);
    // an account the launcher does not have: nothing, not another account's token
    assert.equal(gameSessionAccount(accounts, '99999999-2222-3333-4444-555555555555', 'a1'), undefined);
    // an older game says nothing: the last started game's account, as before
    assert.equal(gameSessionAccount(accounts, undefined, 'a2'), slash);
    assert.equal(gameSessionAccount(accounts, undefined, undefined), undefined);
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

  it('asks Microsoft once when the skin panel, the launch and the game renew together', async () => {
    let calls = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'stop here' }), { status: 400 });
    }) as typeof fetch;
    const account: MicrosoftAccount = { id: 'shared', type: 'msa', name: 'Steve', uuid: 'u', xuid: 'x', accessToken: 't', expiresAt: 0, refreshToken: secrets.encrypt('r'), clientId: 'app' };
    try {
      const all = [ensureFreshAccount(account, 'app'), ensureFreshAccount(account, 'app'), ensureFreshAccount({ ...account }, 'app', GAME_RENEW_MS)];
      for (const one of all) await assert.rejects(one, /zaloguj się ponownie/);
      assert.equal(calls, 1);
      // once it is over, the next renewal asks again
      await assert.rejects(ensureFreshAccount(account, 'app'), /zaloguj się ponownie/);
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = real;
    }
  });
});
