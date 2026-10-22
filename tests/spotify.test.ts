import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';
import { CoverCache, NowPlayingPoller, cleanNow } from '../src/main/spotify';
import { setLang, t } from '../src/shared/i18n';
import { SPOTIFY_EN } from '../src/shared/i18nSpotify';

// Spotify for the game's module: the server's answer checked, the server asked every few seconds
// at most, album covers only from i.scdn.co (small, as PNG), and the bridge's two routes.

const PLAYING = {
  available: true, linked: true, at: 1,
  playing: {
    kind: 'track', title: 'Pszczółka Maja', artists: ['Zespół A', 'Gość B'], album: 'Album C', cover: 'https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb',
    durationMs: 200_000, progressMs: 61_000, isPlaying: true, url: 'https://open.spotify.com/track/abc',
  },
};

describe('Spotify in the launcher', () => {
  it('passes on a checked copy: the cover as its id on Spotify\'s host only, nothing odd', () => {
    assert.deepEqual(cleanNow(PLAYING), {
      available: true, linked: true,
      playing: { kind: 'track', title: 'Pszczółka Maja', artists: ['Zespół A', 'Gość B'], album: 'Album C', cover: 'ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb', durationMs: 200_000, progressMs: 61_000, isPlaying: true },
    });
    const odd = cleanNow({ available: true, linked: true, playing: { ...PLAYING.playing, cover: 'https://evil.example/image/abcdefabcdefabcdef', title: 'A\u0000B', progressMs: 999_999, artists: [1, 'X'] } });
    assert.equal(odd.playing?.cover, '');
    assert.equal(odd.playing?.title, 'A B');
    assert.equal(odd.playing?.progressMs, 200_000);
    assert.deepEqual(odd.playing?.artists, ['X']);
    assert.deepEqual(cleanNow({ available: true, linked: true, playing: { title: '' } }), { available: true, linked: true, playing: null });
    assert.deepEqual(cleanNow(null), { available: false, linked: false, playing: null });
    assert.equal(cleanNow({ linked: false, error: 'relink' }).error, 'relink');
  });

  it('asks the server at most every two seconds, once for several asks at a time', async () => {
    let clock = 0;
    let asked = 0;
    const poller = new NowPlayingPoller(async () => {
      asked++;
      await new Promise((r) => setTimeout(r, 10));
      return PLAYING;
    }, 2000, () => clock);
    const [a, b] = await Promise.all([poller.get(), poller.get()]);
    assert.equal(asked, 1);
    assert.equal(a.playing?.title, 'Pszczółka Maja');
    assert.deepEqual(a, b);
    clock = 1500;
    await poller.get();
    assert.equal(asked, 1);
    clock = 2500;
    await poller.get();
    assert.equal(asked, 2);
    // signed out or offline: the game is told why, not an error
    const out = new NowPlayingPoller(async () => {
      throw Object.assign(new Error('unauthorized'), { code: 'unauthorized' });
    });
    assert.deepEqual(await out.get(), { available: true, linked: false, playing: null, error: 'signed_out' });
  });

  it('fetches covers only from i.scdn.co, small, once each, as PNG', async () => {
    const asked: string[] = [];
    let type = 'image/jpeg';
    let body = Buffer.from('jpeg-bytes');
    const covers = new CoverCache((data, size) => Buffer.from(`png:${size}:${data.toString()}`), async (url) => {
      asked.push(String(url));
      return new Response(body, { headers: { 'Content-Type': type } });
    });
    assert.equal((await covers.get('ab67616d00004851bbbbbbbbbbbbbbbb')).toString(), 'png:64:jpeg-bytes');
    await covers.get('ab67616d00004851bbbbbbbbbbbbbbbb');
    assert.deepEqual(asked, ['https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbb']);
    await assert.rejects(covers.get('../../etc/passwd'), /bad_request/);
    await assert.rejects(covers.get('ABCDEF'), /bad_request/);
    type = 'text/html';
    await assert.rejects(covers.get('cccccccccccccccccccc'), /not_an_image/);
    type = 'image/jpeg';
    body = Buffer.alloc(600 * 1024);
    await assert.rejects(covers.get('dddddddddddddddddddd'), /too_large/);
    // a failed one is tried again later
    body = Buffer.from('ok');
    assert.equal((await covers.get('dddddddddddddddddddd')).toString(), 'png:64:ok');
  });

  it('the bridge: what plays and covers for the game, with its key only', async () => {
    const bridge = new GameBridge({
      call: async () => ({}), state: () => ({ signedIn: true }),
      spotifyNow: async () => cleanNow(PLAYING),
      spotifyCover: async (id) => {
        if (id !== 'ab67616d00004851bbbbbbbbbbbbbbbb') throw new Error('not_an_image');
        return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      },
    });
    const { url, key } = await bridge.start();
    const req = (path: string, k = key) => fetch(url + path, { headers: { Authorization: `Bearer ${k}` } });
    try {
      assert.equal((await req('/spotify/now', 'wrong')).status, 401);
      const now = await (await req('/spotify/now')).json();
      assert.equal(now.playing.title, 'Pszczółka Maja');
      const cover = await req('/spotify/cover/ab67616d00004851bbbbbbbbbbbbbbbb');
      assert.equal(cover.status, 200);
      assert.equal(cover.headers.get('content-type'), 'image/png');
      assert.equal((await req('/spotify/cover/cccccccccccccccccccc')).status, 404);
      assert.equal((await req('/spotify/cover/..%2F..%2Fetc')).status, 403);
      // the server's Spotify routes themselves are not open to the game
      assert.equal((await req('/v1/me/spotify')).status, 403);
    } finally {
      bridge.stop();
    }
  });

  it('has an English text for every Polish one', () => {
    const source = readFileSync('src/renderer/spotify.ts', 'utf8');
    const keys = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
    assert.ok(keys.length >= 10);
    setLang('en');
    try {
      for (const k of keys) assert.ok(k in SPOTIFY_EN && t(k) !== k, `no English for "${k}"`);
    } finally {
      setLang('pl');
    }
  });
});
