import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { parseNowPlaying } from '../src/spotify.ts';

// Spotify: the admin's keys as settings, linking (Authorization Code), the refresh token sealed,
// what plays now with the cache, 204/401/403/429 and a revoked token, and unlinking; all against
// a fake Spotify behind fetchImpl (never the real one, never real keys).

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-spotify-'));
let clock = Date.now();
let base = '';
let app: ReturnType<typeof createApp>;

const CLIENT_ID = 'fakespotifyclientid0001';
const CLIENT_SECRET = 'fakespotifysecret-abcdef';

// ---------- fake Spotify ----------

type Call = { url: URL; method: string; auth: string; form: URLSearchParams };
const calls: Call[] = [];
/** Authorization codes and who is behind them; 'code-blocked' is an account not added to a development-mode app. */
const codes: Record<string, { id: string; display_name: string }> = { 'code-ala': { id: 'ala_spotify', display_name: 'Ala Słucha' }, 'code-blocked': { id: 'blocked', display_name: 'Nope' } };
/** Valid access tokens → Spotify user; refresh tokens → user. */
const accessTokens = new Map<string, string>();
const refreshTokens = new Map<string, string>();
let tokenCount = 0;
/** What the player answers next: a status and a body. */
let player: { status: number; body?: unknown; headers?: Record<string, string> } = { status: 204 };
let rotateRefresh = false;

const TRACK = {
  is_playing: true, progress_ms: 61_000, currently_playing_type: 'track',
  item: {
    type: 'track', name: 'Pszczółka Maja (Remix)', duration_ms: 200_000, external_urls: { spotify: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' },
    artists: [{ name: 'Zespół A' }, { name: 'Gość B' }],
    album: { name: 'Album C', images: [
      { url: 'https://i.scdn.co/image/ab67616d0000b273aaaaaaaaaaaaaaaaaaaaaaaa', width: 640, height: 640 },
      { url: 'https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb', width: 64, height: 64 },
      { url: 'https://i.scdn.co/image/ab67616d00001e02cccccccccccccccccccccccc', width: 300, height: 300 },
    ] },
  },
};

const json = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.host !== 'accounts.spotify.com' && url.host !== 'api.spotify.com') return fetch(input, init);
  const headers = new Headers(init?.headers);
  const form = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : String(init?.body ?? ''));
  calls.push({ url, method: init?.method ?? 'GET', auth: headers.get('authorization') ?? '', form });
  if (url.host === 'accounts.spotify.com' && url.pathname === '/api/token') {
    if (headers.get('authorization') !== `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`) return json(400, { error: 'invalid_client' });
    if (form.get('grant_type') === 'authorization_code') {
      const who = codes[form.get('code') ?? ''];
      if (!who || form.get('redirect_uri') !== 'https://client.example/v1/spotify/callback') return json(400, { error: 'invalid_grant' });
      const access = `access-${++tokenCount}`;
      const refresh = `refresh-${who.id}-${tokenCount}`;
      accessTokens.set(access, who.id);
      refreshTokens.set(refresh, who.id);
      return json(200, { access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh, scope: 'user-read-currently-playing user-read-playback-state' });
    }
    if (form.get('grant_type') === 'refresh_token') {
      const who = refreshTokens.get(form.get('refresh_token') ?? '');
      if (!who) return json(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' });
      const access = `access-${++tokenCount}`;
      accessTokens.set(access, who);
      const out: Record<string, unknown> = { access_token: access, expires_in: 3600 };
      if (rotateRefresh) {
        const refresh = `refresh-${who}-${tokenCount}`;
        refreshTokens.delete(form.get('refresh_token')!);
        refreshTokens.set(refresh, who);
        out.refresh_token = refresh;
      }
      return json(200, out);
    }
    return json(400, { error: 'unsupported_grant_type' });
  }
  const who = accessTokens.get((headers.get('authorization') ?? '').replace('Bearer ', ''));
  if (!who) return json(401, { error: { status: 401, message: 'The access token expired' } });
  if (who === 'blocked') return json(403, { error: { status: 403, message: 'User not registered in the Developer Dashboard' } });
  if (url.pathname === '/v1/me') return json(200, { id: who, display_name: codes[`code-${who.split('_')[0]}`]?.display_name ?? who });
  if (url.pathname === '/v1/me/player/currently-playing') return json(player.status, player.body, player.headers);
  return json(404, {});
};

// ---------- helpers ----------

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  return { status: res.status, body: parsed, text };
}
type Login = { token: string; user: { id: string; handle: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Login;
const spotifyCalls = (path: string) => calls.filter((c) => c.url.pathname === path).length;

/** The whole link: start, Spotify's page (the code), the browser back, the poll. */
async function link(who: Login, code: string) {
  const start = await call('POST', '/v1/me/spotify/start', who.token);
  assert.equal(start.status, 200, start.text);
  const back = await call('GET', `/v1/spotify/callback?code=${code}&state=${encodeURIComponent(start.body.state)}`);
  const poll = await call('GET', `/v1/me/spotify/poll?state=${encodeURIComponent(start.body.state)}`, who.token);
  return { start, back, poll };
}

let admin: Login, ala: Login, bob: Login;

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: true, oauth: {}, adminHandles: ['SpotAdmin'], loginsPerMinute: 1000,
    storage: { secretKey: randomBytes(32).toString('base64') }, webDir: path.resolve('web'),
    streams: { timers: false }, spotifyNow: () => clock, fetchImpl: fakeFetch,
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  admin = await login('SpotAdmin');
  ala = await login('AlaSpot');
  bob = await login('BobSpot');
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Spotify: what plays, as SlashClient keeps it', () => {
  it('takes the smallest cover from Spotify\'s host, the artists, the times and the link', () => {
    assert.deepEqual(parseNowPlaying(TRACK), {
      kind: 'track', title: 'Pszczółka Maja (Remix)', artists: ['Zespół A', 'Gość B'], album: 'Album C',
      cover: 'https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb', durationMs: 200_000, progressMs: 61_000, isPlaying: true,
      url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    });
  });
  it('drops pictures and links from elsewhere, and reads podcast episodes', () => {
    const odd = parseNowPlaying({ ...TRACK, item: { ...TRACK.item, external_urls: { spotify: 'https://evil.example/x' }, album: { name: 'A', images: [{ url: 'https://evil.example/image/abcdefabcdefabcdef', width: 64 }] } } });
    assert.equal(odd?.cover, '');
    assert.equal(odd?.url, '');
    const episode = parseNowPlaying({ is_playing: false, progress_ms: 5000, currently_playing_type: 'episode', item: { type: 'episode', name: 'Odcinek 7', duration_ms: 3_600_000, images: [{ url: 'https://i.scdn.co/image/ab6765630000ba8a0123456789abcdef', width: 64 }], show: { name: 'Podcast X', publisher: 'Wydawca' } } });
    assert.deepEqual([episode?.kind, episode?.title, episode?.artists, episode?.album, episode?.isPlaying, !!episode?.cover], ['episode', 'Odcinek 7', ['Wydawca'], 'Podcast X', false, true]);
    // an ad (no item) or something without a name is nothing
    assert.equal(parseNowPlaying({ is_playing: true, currently_playing_type: 'ad', item: null }), null);
    assert.equal(parseNowPlaying({ item: { name: '' } }), null);
  });
});

describe('Spotify: not set up', () => {
  it('is off without the admin\'s keys: no linking, nothing plays', async () => {
    assert.deepEqual((await call('GET', '/v1/me/spotify', ala.token)).body, { available: false, linked: false, name: '', linkedAt: null });
    const start = await call('POST', '/v1/me/spotify/start', ala.token);
    assert.equal(start.status, 400);
    assert.equal(start.body.error, 'provider_disabled');
    const now = await call('GET', '/v1/me/spotify/now', ala.token);
    assert.equal(now.body.available, false);
    assert.equal(now.body.playing, null);
    assert.equal(calls.length, 0);
  });
  it('needs a sign-in', async () => {
    assert.equal((await call('GET', '/v1/me/spotify/now')).status, 401);
  });
});

describe('Spotify: the admin panel', () => {
  it('lists the keys under "Spotify" with the redirect address to register, the secret write-only', async () => {
    const saved = await call('POST', '/v1/admin/settings', admin.token, { values: { 'spotify.clientId': CLIENT_ID, 'spotify.clientSecret': CLIENT_SECRET } });
    assert.equal(saved.status, 200, saved.text);
    assert.ok(saved.body.categories.some((c: { id: string }) => c.id === 'spotify'));
    const id = saved.body.settings.find((s: { key: string }) => s.key === 'spotify.clientId');
    const secret = saved.body.settings.find((s: { key: string }) => s.key === 'spotify.clientSecret');
    assert.equal(id.value, CLIENT_ID);
    assert.match(id.description, /https:\/\/client\.example\/v1\/spotify\/callback/);
    assert.match(id.description, /25 kont/);
    assert.equal(secret.value, '');
    assert.equal(secret.secretSet, true);
    assert.ok(!saved.text.includes(CLIENT_SECRET));
    assert.equal((await call('POST', '/v1/admin/settings', ala.token, { values: { 'spotify.clientId': 'x' } })).status, 403);
    assert.equal((await call('GET', '/v1/me/spotify', ala.token)).body.available, true);
  });
});

describe('Spotify: linking', () => {
  it('sends the player to Spotify with the scopes, the redirect address and a state', async () => {
    const start = await call('POST', '/v1/me/spotify/start', ala.token);
    const u = new URL(start.body.url);
    assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
    assert.equal(u.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(u.searchParams.get('response_type'), 'code');
    assert.equal(u.searchParams.get('scope'), 'user-read-currently-playing user-read-playback-state');
    assert.equal(u.searchParams.get('redirect_uri'), 'https://client.example/v1/spotify/callback');
    assert.equal(u.searchParams.get('state'), start.body.state);
    assert.ok(!start.body.url.includes(CLIENT_SECRET));
    // pending until the browser is back; another account cannot learn about it
    assert.deepEqual((await call('GET', `/v1/me/spotify/poll?state=${start.body.state}`, ala.token)).body, { pending: true });
    assert.equal((await call('GET', `/v1/me/spotify/poll?state=${start.body.state}`, bob.token)).status, 404);
  });

  it('a cancelled consent tells the launcher so', async () => {
    const start = await call('POST', '/v1/me/spotify/start', ala.token);
    const back = await call('GET', `/v1/spotify/callback?error=access_denied&state=${start.body.state}`);
    assert.equal(back.status, 400);
    const poll = await call('GET', `/v1/me/spotify/poll?state=${start.body.state}`, ala.token);
    assert.equal(poll.body.error, 'provider_denied');
  });

  it('an account a development-mode app does not know is refused with a clear reason', async () => {
    const { back, poll } = await link(bob, 'code-blocked');
    assert.equal(back.status, 400);
    assert.match(back.text, /Spotify nie wpuścił/);
    assert.equal(poll.body.error, 'spotify_not_allowed');
    assert.equal((await call('GET', '/v1/me/spotify', bob.token)).body.linked, false);
  });

  it('links: the refresh token sealed in the database, never in plain text', async () => {
    const { back, poll } = await link(ala, 'code-ala');
    assert.equal(back.status, 200);
    assert.match(back.text, /Połączono Spotify/);
    assert.equal(poll.body.linked, true);
    assert.equal(poll.body.spotify.name, 'Ala Słucha');
    const sql = new DatabaseSync(path.join(dir, 'test.db'));
    const row = sql.prepare('SELECT * FROM spotify_accounts WHERE uuid = ?').get(ala.user.id) as Record<string, string>;
    sql.close();
    assert.equal(row.spotify_id, 'ala_spotify');
    assert.ok(row.refresh && !row.refresh.includes('refresh-ala'));
    // a used state does nothing more
    assert.equal((await call('GET', `/v1/me/spotify/poll?state=x`, ala.token)).status, 404);
  });
});

describe('Spotify: what plays now', () => {
  it('nothing plays: 204 is no track', async () => {
    player = { status: 204 };
    const now = await call('GET', '/v1/me/spotify/now', ala.token);
    assert.deepEqual([now.body.available, now.body.linked, now.body.playing], [true, true, null]);
  });

  it('a track, then the cache: Spotify is asked once per few seconds, the progress moves on', async () => {
    clock += 10_000;
    player = { status: 200, body: TRACK };
    const before = spotifyCalls('/v1/me/player/currently-playing');
    // several launchers at once: one call to Spotify
    const [a, b] = await Promise.all([call('GET', '/v1/me/spotify/now', ala.token), call('GET', '/v1/me/spotify/now', ala.token)]);
    assert.equal(spotifyCalls('/v1/me/player/currently-playing'), before + 1);
    assert.equal(a.body.playing.title, 'Pszczółka Maja (Remix)');
    assert.deepEqual(a.body.playing.artists, ['Zespół A', 'Gość B']);
    assert.equal(a.body.playing.cover, 'https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(b.body.playing.progressMs, 61_000);
    clock += 2000;
    const later = await call('GET', '/v1/me/spotify/now', ala.token);
    assert.equal(spotifyCalls('/v1/me/player/currently-playing'), before + 1);
    assert.equal(later.body.playing.progressMs, 63_000);
    clock += 5000;
    await call('GET', '/v1/me/spotify/now', ala.token);
    assert.equal(spotifyCalls('/v1/me/player/currently-playing'), before + 2);
  });

  it('an access token Spotify no longer takes: renewed with the refresh token, a new refresh token kept', async () => {
    accessTokens.clear();
    rotateRefresh = true;
    clock += 10_000;
    const refreshes = calls.filter((c) => c.form.get('grant_type') === 'refresh_token').length;
    const now = await call('GET', '/v1/me/spotify/now', ala.token);
    assert.equal(now.body.playing.title, 'Pszczółka Maja (Remix)');
    assert.equal(calls.filter((c) => c.form.get('grant_type') === 'refresh_token').length, refreshes + 1);
    // the old refresh token is gone at Spotify: the new one must have been kept
    accessTokens.clear();
    clock += 10_000;
    assert.equal((await call('GET', '/v1/me/spotify/now', ala.token)).body.playing.title, 'Pszczółka Maja (Remix)');
    rotateRefresh = false;
  });

  it('429: the last answer stays and Spotify is left alone for its Retry-After', async () => {
    clock += 10_000;
    player = { status: 429, headers: { 'Retry-After': '30' } };
    const before = spotifyCalls('/v1/me/player/currently-playing');
    const limited = await call('GET', '/v1/me/spotify/now', ala.token);
    assert.equal(limited.status, 200);
    assert.equal(limited.body.playing.title, 'Pszczółka Maja (Remix)');
    assert.equal(limited.body.error, 'rate_limited');
    clock += 10_000;
    await call('GET', '/v1/me/spotify/now', ala.token);
    assert.equal(spotifyCalls('/v1/me/player/currently-playing'), before + 1);
    clock += 25_000;
    player = { status: 200, body: { ...TRACK, is_playing: false } };
    const back = await call('GET', '/v1/me/spotify/now', ala.token);
    assert.equal(spotifyCalls('/v1/me/player/currently-playing'), before + 2);
    assert.equal(back.body.playing.isPlaying, false);
    assert.equal(back.body.error, undefined);
  });

  it('a refresh token revoked at Spotify: the link goes and the launcher is told', async () => {
    accessTokens.clear();
    refreshTokens.clear();
    clock += 10_000;
    const now = await call('GET', '/v1/me/spotify/now', ala.token);
    assert.equal(now.body.linked, false);
    assert.equal(now.body.error, 'relink');
    assert.equal((await call('GET', '/v1/me/spotify', ala.token)).body.linked, false);
  });
});

describe('Spotify: unlinking', () => {
  it('deletes the tokens; the module then has nothing', async () => {
    await link(ala, 'code-ala');
    assert.equal((await call('GET', '/v1/me/spotify', ala.token)).body.linked, true);
    const gone = await call('DELETE', '/v1/me/spotify', ala.token);
    assert.equal(gone.status, 200);
    assert.equal(gone.body.linked, false);
    const sql = new DatabaseSync(path.join(dir, 'test.db'));
    assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM spotify_accounts').get() as { n: number }).n, 0);
    sql.close();
    assert.equal((await call('GET', '/v1/me/spotify/now', ala.token)).body.linked, false);
    assert.equal((await call('DELETE', '/v1/me/spotify', ala.token)).status, 404);
  });
});
