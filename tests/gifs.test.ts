import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gifFallback, gifText, isGifUrl, looksLikeGif, parseGifText, type GifRef } from '../src/shared/gifMessage';
import { gifRef, gifSearchPath, gifSize } from '../src/renderer/gifs';
import { canEdit } from '../src/renderer/chatEdits';
import { createGifMedia } from '../src/main/gifMedia';

const ref: GifRef = {
  v: 1, p: 'giphy', k: 'gif', id: 'abc123', t: 'Kot tańczy', w: 200, h: 150,
  s: 'https://media0.giphy.com/media/abc123/200w_s.gif', a: 'https://media0.giphy.com/media/abc123/200w.webp?cid=x&rid=200w.webp&ct=g', f: 'https://media0.giphy.com/media/abc123/giphy.webp',
  m: 'https://media0.giphy.com/media/abc123/giphy.mp4',
};
/** The same message as the server's tests (server/test/gifs.test.ts) write and read: the two must agree. */
const WIRE = '[GIF] Kot tańczy\nslashgif:{"v":1,"p":"giphy","k":"gif","id":"abc123","t":"Kot tańczy","w":200,"h":150,"s":"https://media0.giphy.com/media/abc123/200w_s.gif","a":"https://media0.giphy.com/media/abc123/200w.webp?cid=x&rid=200w.webp&ct=g","f":"https://media0.giphy.com/media/abc123/giphy.webp","m":"https://media0.giphy.com/media/abc123/giphy.mp4"}';

describe('gif messages in the launcher', () => {
  it('writes and reads the same text as the server', () => {
    assert.equal(gifText(ref), WIRE);
    assert.deepEqual(parseGifText(WIRE), ref);
    const sticker: GifRef = { v: 1, p: 'tenor', k: 'sticker', id: '987', t: '', w: 220, h: 220, a: 'https://media.tenor.com/x/tiny.webp', f: 'https://media.tenor.com/x/big.webp' };
    assert.ok(gifText(sticker).startsWith('[GIF]\nslashgif:'));
    assert.deepEqual(parseGifText(gifText(sticker)), sticker);
  });

  it('shows only a GIF on the providers\' CDN, and a readable line elsewhere', () => {
    assert.equal(parseGifText(gifText(ref).replace('media0.giphy.com/media/abc123/giphy.webp', 'tracker.example/x.webp')), undefined);
    assert.equal(parseGifText('[GIF] x\nslashgif:not json'), undefined);
    assert.equal(parseGifText('hej'), undefined);
    assert.equal(gifFallback(gifText(ref)), '[GIF] Kot tańczy');
    assert.ok(looksLikeGif(gifText(ref)));
    assert.ok(!isGifUrl('https://media.giphy.com.example/x.gif'));
  });

  it('a GIF cannot be edited', () => {
    const now = 1_000_000;
    assert.ok(canEdit({ id: 1, from: 'me', at: now, text: 'hej' }, 'me', 60_000, now));
    assert.ok(!canEdit({ id: 1, from: 'me', at: now, text: gifText(ref) }, 'me', 60_000, now));
  });
});

describe('the gif picker', () => {
  it('asks the server with a path the main process lets through', () => {
    const allowed = /^\/v1\/(gifs)(\/[\w-]+)*(\?[\w=&%.-]*)?$/;
    for (const [kind, q, pos] of [['gif', '', undefined], ['sticker', 'kot tańczy!*(x)', 'CAgQ+/='], ['gif', "it's ~ok", '24']] as const) {
      const p = gifSearchPath(kind, q, pos);
      assert.match(p, allowed, p);
      const params = new URL(`http://x${p}`).searchParams;
      assert.equal(params.get('kind'), kind);
      assert.equal(params.get('q'), q.trim() || null);
      assert.equal(params.get('pos'), pos ?? null);
    }
  });

  it('turns a result into a message reference', () => {
    const r = { id: 'abc123', title: 'Kot tańczy', kind: 'gif' as const, w: 200, h: 150, still: ref.s, preview: ref.a, full: ref.f, mp4: ref.m };
    assert.deepEqual(gifRef(r, 'giphy'), ref);
    assert.deepEqual(parseGifText(gifText(gifRef(r, 'giphy'))), ref);
  });

  it('sizes GIFs and stickers sensibly', () => {
    assert.deepEqual(gifSize(200, 150, 'gif'), { w: 240, h: 180 });
    assert.deepEqual(gifSize(480, 960, 'gif'), { w: 110, h: 220 });
    assert.deepEqual(gifSize(500, 500, 'sticker'), { w: 160, h: 160 });
    assert.deepEqual(gifSize(100, 100, 'sticker'), { w: 100, h: 100 }, 'a small sticker is not blown up');
    assert.deepEqual(gifSize(0, 0, 'gif'), { w: 240, h: 180 });
  });
});

describe('gif files in the launcher', () => {
  const ok = (type = 'image/gif') => new Response(new Uint8Array([71, 73, 70]), { headers: { 'Content-Type': type } });

  it('through the server when it says so, straight from the CDN when not, never elsewhere', async () => {
    const asked: string[] = [];
    let proxy = true;
    let configs = 0;
    let now = 0;
    const media = createGifMedia({
      config: async () => (configs++, { proxy }),
      serverUrl: () => 'https://client.example/',
      fetch: async (u) => (asked.push(u), ok()),
      now: () => now,
    });
    const page = (u: string) => new Request(`slash-gif://m/?u=${encodeURIComponent(u)}`);
    assert.equal((await media.handle(page(ref.a))).status, 200);
    assert.equal(asked.at(-1), `https://client.example/v1/gifs/media?u=${encodeURIComponent(ref.a)}`);
    proxy = false;
    await media.handle(page(ref.f));
    assert.equal(configs, 1, 'the server is asked once in a while, not per file');
    now += 6 * 60_000;
    await media.handle(page(ref.f));
    assert.equal(asked.at(-1), ref.f);
    const before = asked.length;
    assert.equal((await media.handle(page('https://tracker.example/x.gif'))).status, 404);
    assert.equal(asked.length, before);
    await assert.rejects(media.bytes('http://media0.giphy.com/x.gif'));
  });

  it('an older server (no /v1/gifs): straight from the CDN; other types are refused', async () => {
    const media = createGifMedia({ config: async () => { throw new Error('not_found'); }, serverUrl: () => 'https://old.example', fetch: async () => ok('text/html') });
    assert.equal(await media.source(ref.a), ref.a);
    assert.equal((await media.handle(new Request(`slash-gif://m/?u=${encodeURIComponent(ref.a)}`))).status, 404);
    await assert.rejects(media.bytes(ref.s!), /bad_type/);
  });
});
