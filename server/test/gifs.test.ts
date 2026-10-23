import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { gifFallback, gifText, isGifUrl, parseGifText, validGif, type GifRef } from '../src/gifs.ts';

/** GIFs and stickers (gifs.ts): the search with the server's key, the media passed through, the messages checked. */

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-gifs-'));
const asked: string[] = [];
const GIF_BYTES = Buffer.from('GIF89a-made-up-bytes');

const giphyItem = (id: string, title: string) => ({
  id, title,
  images: {
    fixed_width: { url: `https://media0.giphy.com/media/${id}/200w.gif?cid=x&rid=200w.gif&ct=g`, webp: `https://media0.giphy.com/media/${id}/200w.webp?cid=x`, mp4: `https://media0.giphy.com/media/${id}/200w.mp4`, width: '200', height: '150' },
    fixed_width_still: { url: `https://media0.giphy.com/media/${id}/200w_s.gif` },
    original: { url: `https://media0.giphy.com/media/${id}/giphy.gif`, webp: `https://media0.giphy.com/media/${id}/giphy.webp`, mp4: `https://media0.giphy.com/media/${id}/giphy.mp4`, width: '480', height: '360' },
  },
});

/** GIPHY, Tenor and their CDNs as they answer the key "test-key"; one result points somewhere else and must be dropped. */
const fakeProviders = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  asked.push(String(input));
  if (url.hostname === 'api.giphy.com') {
    if (url.searchParams.get('api_key') !== 'test-key') return new Response('', { status: 401 });
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const data = [giphyItem('abc123', 'Kot tańczy'), { ...giphyItem('evil', 'x'), images: { ...giphyItem('evil', 'x').images, fixed_width: { url: 'https://evil.example/a.gif', width: '1', height: '1' } } }];
    return Response.json({ data, pagination: { total_count: 100, count: 2, offset } });
  }
  if (url.hostname === 'tenor.googleapis.com') {
    if (url.searchParams.get('key') !== 'test-key') return new Response('', { status: 403 });
    const sticker = url.searchParams.get('searchfilter') === 'sticker';
    const fmt = (name: string) => ({ url: `https://media.tenor.com/Tn1/${name}.gif`, dims: [220, 220] });
    return Response.json({
      results: [{ id: '1234567', content_description: 'Pies macha', media_formats: sticker
        ? { tinywebp_transparent: fmt('tinywebp'), webp_transparent: fmt('webp'), tinygifpreview: fmt('still') }
        : { tinygif: fmt('tinygif'), mediumgif: fmt('mediumgif'), mp4: fmt('mp4'), gifpreview: fmt('still') } }],
      next: 'CAgQ',
    });
  }
  if (url.hostname === 'media0.giphy.com' || url.hostname === 'media.tenor.com') {
    if (url.pathname.includes('redirect-out')) return new Response('', { status: 302, headers: { Location: 'https://evil.example/x.gif' } });
    if (url.pathname.includes('redirect-in')) return new Response('', { status: 302, headers: { Location: 'https://media.tenor.com/Tn1/ok.gif' } });
    if (url.pathname.includes('html')) return new Response('<html>', { headers: { 'Content-Type': 'text/html' } });
    if (url.pathname.includes('huge')) return new Response(new Uint8Array(400 * 1024), { headers: { 'Content-Type': 'image/gif', 'Content-Length': String(400 * 1024) } });
    return new Response(GIF_BYTES, { headers: { 'Content-Type': 'image/gif', 'Set-Cookie': 'tracker=1' } });
  }
  return new Response('', { status: 500 });
}) as typeof fetch;

let app: ReturnType<typeof createApp>;
let base = '';

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as any, text };
}
type Player = { token: string; user: { id: string; handle: string; name: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Player;

const sample: GifRef = {
  v: 1, p: 'giphy', k: 'gif', id: 'abc123', t: 'Kot tańczy', w: 200, h: 150,
  s: 'https://media0.giphy.com/media/abc123/200w_s.gif', a: 'https://media0.giphy.com/media/abc123/200w.webp?cid=x', f: 'https://media0.giphy.com/media/abc123/giphy.webp',
};

/** The same message as the launcher's tests (tests/gifs.test.ts) write and read: the two must agree. */
const WIRE = '[GIF] Kot tańczy\nslashgif:{"v":1,"p":"giphy","k":"gif","id":"abc123","t":"Kot tańczy","w":200,"h":150,"s":"https://media0.giphy.com/media/abc123/200w_s.gif","a":"https://media0.giphy.com/media/abc123/200w.webp?cid=x&rid=200w.webp&ct=g","f":"https://media0.giphy.com/media/abc123/giphy.webp","m":"https://media0.giphy.com/media/abc123/giphy.mp4"}';

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'social.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, fetchImpl: fakeProviders, storage: { secretKey: randomBytes(32).toString('base64') } });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('gif messages', () => {
  it('only takes addresses on the providers\' CDN hosts', () => {
    assert.ok(isGifUrl('https://media.giphy.com/media/x/giphy.gif'));
    assert.ok(isGifUrl('https://media3.giphy.com/media/x/giphy.webp?cid=1'));
    assert.ok(isGifUrl('https://i.giphy.com/x.webp'));
    assert.ok(isGifUrl('https://media.tenor.com/abc/x.gif'));
    assert.ok(isGifUrl('https://c.tenor.com/abc/x.gif'));
    for (const bad of ['http://media.giphy.com/x.gif', 'https://media.giphy.com.evil.example/x.gif', 'https://evil.example/media.giphy.com/x.gif', 'https://user@media.giphy.com/x.gif', 'https://media.giphy.com:8443/x.gif', 'javascript:alert(1)', 'https://giphy.com/x.gif', 42]) {
      assert.equal(isGifUrl(bad), false, String(bad));
    }
  });

  it('writes and reads the same text as the launcher', () => {
    const ref: GifRef = { ...sample, a: 'https://media0.giphy.com/media/abc123/200w.webp?cid=x&rid=200w.webp&ct=g', m: 'https://media0.giphy.com/media/abc123/giphy.mp4' };
    assert.equal(gifText(ref), WIRE);
    assert.deepEqual(parseGifText(WIRE), ref);
  });

  it('writes and reads the text, with a readable first line', () => {
    const text = gifText(sample);
    assert.ok(text.startsWith('[GIF] Kot tańczy\nslashgif:'));
    assert.deepEqual(parseGifText(text), sample);
    assert.equal(gifFallback(text), '[GIF] Kot tańczy');
    assert.equal(gifFallback('zwykły tekst'), 'zwykły tekst');
    assert.equal(parseGifText('zwykły tekst'), undefined);
    // a title cannot break the first line, and the reference cannot point elsewhere
    assert.equal(validGif({ ...sample, t: 'a\nslashgif:{}' })!.t, 'a slashgif:{}');
    assert.equal(validGif({ ...sample, a: 'https://evil.example/a.gif' }), undefined);
    assert.equal(validGif({ ...sample, id: '../x' }), undefined);
    assert.equal(validGif({ ...sample, p: 'imgur' }), undefined);
    // too long for a chat message: the mp4 and the still go, the rest stays
    const long = gifText({ ...sample, m: `https://media0.giphy.com/${'m'.repeat(470)}`, s: `https://media0.giphy.com/${'s'.repeat(470)}`, a: `https://media0.giphy.com/${'a'.repeat(470)}`, f: `https://media0.giphy.com/${'f'.repeat(470)}` });
    assert.ok(long.length <= 2000);
    assert.equal(parseGifText(long)!.m, undefined);
  });
});

describe('gif search', () => {
  it('without a key: hidden, and the provider is never asked', async () => {
    const p = await login('GifNoKey');
    assert.deepEqual((await call('GET', '/v1/gifs')).body, { enabled: false, provider: 'giphy', proxy: true });
    const before = asked.length;
    const res = await call('GET', '/v1/gifs/search?q=kot', p.token);
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'gifs_unavailable');
    assert.equal(asked.length, before);
  });

  it('asks GIPHY with the key, never shows the key, keeps answers, drops results off the CDN', async () => {
    app.settings.set({ 'gifs.apiKey': 'test-key' }, 'test');
    const p = await login('GifSearch');
    const config = await call('GET', '/v1/gifs');
    assert.deepEqual(config.body, { enabled: true, provider: 'giphy', proxy: true });
    assert.ok(!config.text.includes('test-key'));
    assert.equal((await call('GET', '/v1/gifs/search?q=kot')).status, 401, 'only for players signed in');
    const before = asked.length;
    const first = await call('GET', '/v1/gifs/search?q=Kot', p.token);
    assert.equal(first.status, 200);
    assert.ok(!first.text.includes('test-key'));
    assert.equal(first.body.provider, 'giphy');
    assert.equal(first.body.results.length, 1, 'the result pointing off the CDN is left out');
    assert.deepEqual(first.body.results[0], {
      id: 'abc123', title: 'Kot tańczy', kind: 'gif', w: 200, h: 150, still: 'https://media0.giphy.com/media/abc123/200w_s.gif',
      preview: 'https://media0.giphy.com/media/abc123/200w.webp?cid=x', full: 'https://media0.giphy.com/media/abc123/giphy.webp', mp4: 'https://media0.giphy.com/media/abc123/giphy.mp4',
    });
    assert.equal(first.body.next, '2');
    // the same question (in other letters' case) comes from memory
    assert.equal((await call('GET', '/v1/gifs/search?q=kot', p.token)).status, 200);
    const sent = asked.slice(before);
    assert.equal(sent.length, 1);
    const params = new URL(sent[0]).searchParams;
    assert.equal(new URL(sent[0]).pathname, '/v1/gifs/search');
    assert.equal(params.get('rating'), 'pg-13');
    assert.equal(params.get('lang'), 'pl');
    // no question: trending; stickers from their own endpoint; the next page by offset
    await call('GET', '/v1/gifs/search?kind=sticker&pos=24', p.token);
    const trending = new URL(asked.at(-1)!);
    assert.equal(trending.pathname, '/v1/stickers/trending');
    assert.equal(trending.searchParams.get('offset'), '24');
    assert.equal((await call('GET', '/v1/gifs/search?kind=video', p.token)).status, 400);
    assert.equal((await call('GET', `/v1/gifs/search?pos=${encodeURIComponent('<x>')}`, p.token)).status, 400);
  });

  it('asks Tenor when chosen, stickers with searchfilter', async () => {
    app.settings.set({ 'gifs.provider': 'tenor' }, 'test');
    const p = await login('GifTenor');
    const res = await call('GET', '/v1/gifs/search?kind=sticker&q=pies', p.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.provider, 'tenor');
    assert.equal(res.body.results[0].kind, 'sticker');
    assert.equal(res.body.results[0].preview, 'https://media.tenor.com/Tn1/tinywebp.gif');
    assert.equal(res.body.next, 'CAgQ');
    const sent = new URL(asked.at(-1)!);
    assert.equal(sent.pathname, '/v2/search');
    assert.equal(sent.searchParams.get('searchfilter'), 'sticker');
    assert.equal(sent.searchParams.get('contentfilter'), 'medium');
    assert.equal(sent.searchParams.get('locale'), 'pl_PL');
    assert.equal((await call('GET', '/v1/gifs/search', p.token)).status, 200);
    assert.equal(new URL(asked.at(-1)!).pathname, '/v2/featured');
    app.settings.set({ 'gifs.provider': null }, 'test');
  });

  it('a refused key looks like no key to the players', async () => {
    app.settings.set({ 'gifs.apiKey': 'wrong', 'gifs.cacheSeconds': 0 }, 'test');
    const p = await login('GifWrong');
    assert.equal((await call('GET', '/v1/gifs/search?q=nowe', p.token)).status, 503);
    app.settings.set({ 'gifs.apiKey': 'test-key', 'gifs.cacheSeconds': null }, 'test');
  });

  it('searches are limited per account', async () => {
    app.settings.set({ 'gifs.searchesPerMinute': 2 }, 'test');
    const p = await login('GifLimit');
    assert.equal((await call('GET', '/v1/gifs/search?q=a', p.token)).status, 200);
    assert.equal((await call('GET', '/v1/gifs/search?q=b', p.token)).status, 200);
    assert.equal((await call('GET', '/v1/gifs/search?q=c', p.token)).status, 429);
    app.settings.set({ 'gifs.searchesPerMinute': null }, 'test');
  });

  it('switched off in the panel: hidden even with a key', async () => {
    app.settings.set({ 'gifs.enabled': false }, 'test');
    const p = await login('GifOff');
    assert.equal((await call('GET', '/v1/gifs')).body.enabled, false);
    assert.equal((await call('GET', '/v1/gifs/search?q=a', p.token)).status, 503);
    app.settings.set({ 'gifs.enabled': null }, 'test');
  });
});

describe('gif media through the server', () => {
  const media = (u: string, init?: RequestInit) => fetch(`${base}/v1/gifs/media?u=${encodeURIComponent(u)}`, init);

  it('passes a CDN file through with long caching and none of the CDN\'s cookies', async () => {
    const res = await media('https://media0.giphy.com/media/abc123/200w.gif?cid=x');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/gif');
    assert.match(res.headers.get('cache-control') ?? '', /public, max-age=\d+, immutable/);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), GIF_BYTES);
    assert.equal(asked.at(-1), 'https://media0.giphy.com/media/abc123/200w.gif?cid=x');
  });

  it('refuses other hosts, redirects out, other types and files over the limit', async () => {
    const before = asked.length;
    assert.equal((await media('https://evil.example/x.gif')).status, 400);
    assert.equal((await media('http://media0.giphy.com/x.gif')).status, 400);
    assert.equal((await fetch(`${base}/v1/gifs/media`)).status, 400);
    assert.equal(asked.length, before, 'nothing is asked for an address off the list');
    assert.equal((await media('https://media0.giphy.com/redirect-out.gif')).status, 502);
    assert.ok(!asked.some((u) => u.includes('evil.example')));
    assert.equal((await media('https://media0.giphy.com/redirect-in.gif')).status, 200);
    assert.equal((await media('https://media0.giphy.com/page.html')).status, 415);
    app.settings.set({ 'gifs.mediaMaxBytes': 256 * 1024 }, 'test');
    assert.equal((await media('https://media0.giphy.com/huge.gif')).status, 415);
    app.settings.set({ 'gifs.mediaMaxBytes': null }, 'test');
  });

  it('is off when the admin turns the proxy off', async () => {
    app.settings.set({ 'gifs.proxy': false }, 'test');
    assert.equal((await call('GET', '/v1/gifs')).body.proxy, false);
    assert.equal((await media('https://media0.giphy.com/media/abc123/200w.gif')).status, 404);
    app.settings.set({ 'gifs.proxy': null }, 'test');
  });

  it('is limited per address', async () => {
    app.settings.set({ 'gifs.mediaPerMinute': 10 }, 'test');
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await media(`https://media0.giphy.com/media/n${i}/200w.gif`)).status;
    assert.equal(last, 429);
    app.settings.set({ 'gifs.mediaPerMinute': null }, 'test');
  });
});

describe('gifs in a community', () => {
  it('a valid GIF is written again by the server; a broken one, an edit and a disabled feature are refused', async () => {
    const owner = await login('GifOwner');
    const member = await login('GifMember');
    const made = await call('POST', '/v1/communities', owner.token, { name: 'Gify' });
    const id = made.body.community.id as string;
    const ch = made.body.community.channels.find((c: any) => c.kind === 'general').id as string;
    assert.equal((await call('POST', `/v1/communities/${id}/join`, member.token)).status, 200);
    const post = (text: string, token = member.token) => call('POST', `/v1/communities/${id}/channels/${ch}/messages`, token, { text });

    // extra keys from a client are dropped; the stored text is the server's own
    const text = gifText(sample).replace('"v":1', '"v":1,"extra":"https://evil.example"');
    const sent = await post(text);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.message.text, gifText(sample));
    assert.deepEqual(parseGifText(sent.body.message.text), sample);

    assert.equal((await post(gifText(sample).replace('media0.giphy.com', 'evil.example'))).body.error, 'bad_gif');
    assert.equal((await post('[GIF] x\nslashgif:{nope')).body.error, 'bad_gif');
    // the addresses do not count against a short message limit
    app.settings.set({ 'communities.message': 20 }, 'test');
    assert.equal((await post(gifText(sample))).status, 200);
    app.settings.set({ 'communities.message': null }, 'test');

    const edit = await call('POST', `/v1/communities/${id}/channels/${ch}/messages/${sent.body.message.id}/edit`, member.token, { text: 'inny' });
    assert.equal(edit.body.error, 'not_editable');
    const plain = await post('zwykła wiadomość');
    const sneaky = await call('POST', `/v1/communities/${id}/channels/${ch}/messages/${plain.body.message.id}/edit`, member.token, { text: gifText(sample) });
    assert.equal(sneaky.body.error, 'not_editable');

    app.settings.set({ 'gifs.enabled': false }, 'test');
    assert.equal((await post(gifText(sample))).body.error, 'gifs_disabled');
    app.settings.set({ 'gifs.enabled': null }, 'test');
  });

  it('GIFs are limited per member', async () => {
    app.settings.set({ 'gifs.sendPerMinute': 1, 'chat.burstMessages': 100 }, 'test');
    const owner = await login('GifOwn2');
    const made = await call('POST', '/v1/communities', owner.token, { name: 'Gify dwa' });
    const id = made.body.community.id as string;
    const ch = made.body.community.channels.find((c: any) => c.kind === 'general').id as string;
    const post = (text: string) => call('POST', `/v1/communities/${id}/channels/${ch}/messages`, owner.token, { text });
    assert.equal((await post(gifText(sample))).status, 200);
    assert.equal((await post(gifText(sample))).status, 429);
    assert.equal((await post('tekst nadal idzie')).status, 200);
    app.settings.set({ 'gifs.sendPerMinute': null, 'chat.burstMessages': null }, 'test');
  });
});
