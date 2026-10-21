import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { cleanJpeg, cleanPoll, pollFallback } from '../src/communityMedia.ts';

/** Pictures and polls in a community's chat (0.9.30): plain JPEGs for members only, polls with live results. */

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-community-media-'));
const imagesDir = path.join(dir, 'community-images');
let base = '';
let app: ReturnType<typeof createApp>;

/** 4×3 red, with EXIF (the camera "SecretCam") and a comment "gps here" (PIL). */
const EXIF_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/4QAsRXhpZgAATU0AKgAAAAgAAQEPAAIAAAAKAAAAGgAAAABTZWNyZXRDYW0A//4ACmdwcyBoZXJl/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8AAEQgAAwAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A4qiiivAP1s//2Q==', 'base64');
/** The same picture, progressive, without metadata. */
const PROGRESSIVE_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVAQEBAAAAAAAAAAAAAAAAAAAFBv/aAAwDAQACEAMQAAABiA+t/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/AP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z', 'base64');

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
async function upload(url: string, token: string, data: Uint8Array) {
  const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` }, body: new Uint8Array(data) });
  return { status: res.status, body: (await res.json()) as any };
}
async function download(url: string, token?: string) {
  const res = await fetch(base + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, type: res.headers.get('content-type'), data: Buffer.from(await res.arrayBuffer()) };
}
type Player = { token: string; user: { id: string; handle: string; name: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Player;
async function connect(token: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token, presence: { status: 'online' } }));
  const waitFor = async (pred: (e: any) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const hit = events.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('event did not come');
  };
  await waitFor((e) => e.type === 'ready');
  return { ws, events, waitFor };
}

/** A community with an owner, a moderator and two members, and a player outside it. */
async function community(prefix: string) {
  const owner = await login(`${prefix}Own`);
  const mod = await login(`${prefix}Mod`);
  const member = await login(`${prefix}Mem`);
  const second = await login(`${prefix}Sec`);
  const outsider = await login(`${prefix}Out`);
  const made = await call('POST', '/v1/communities', owner.token, { name: `Media ${prefix}` });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.community.id as string;
  for (const p of [mod, member, second]) assert.equal((await call('POST', `/v1/communities/${id}/join`, p.token)).status, 200);
  assert.equal((await call('POST', `/v1/communities/${id}/members/${mod.user.id}/role`, owner.token, { role: 'moderator' })).status, 200);
  const general = made.body.community.channels.find((c: any) => c.kind === 'general').id as string;
  const news = made.body.community.channels.find((c: any) => c.kind === 'announcements').id as string;
  return { id, owner, mod, member, second, outsider, general, news };
}
type C = Awaited<ReturnType<typeof community>>;
const msgs = (c: C, ch = c.general) => `/v1/communities/${c.id}/channels/${ch}/messages`;
const images = (c: C, ch = c.general) => `/v1/communities/${c.id}/channels/${ch}/images`;
const poll = (question: string, options: string[], extra: Record<string, unknown> = {}) => ({ poll: { question, options, ...extra } });

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 10_000, oauth: {},
    communityImagesDir: imagesDir, adminHandles: ['Szef'], chatBurst: { messages: 100, seconds: 10 }, profileViewsPerMinute: 10_000,
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('community pictures', () => {
  it('takes only whole JPEGs and leaves their metadata out', () => {
    const clean = cleanJpeg(EXIF_JPEG)!;
    assert.deepEqual([clean.width, clean.height], [4, 3]);
    assert.ok(EXIF_JPEG.includes('SecretCam') && EXIF_JPEG.includes('gps here'));
    assert.ok(!clean.jpeg.includes('SecretCam') && !clean.jpeg.includes('gps here') && !clean.jpeg.includes('Exif'));
    assert.ok(clean.jpeg.length < EXIF_JPEG.length);
    assert.deepEqual([clean.jpeg[0], clean.jpeg[1], clean.jpeg.at(-2), clean.jpeg.at(-1)], [0xff, 0xd8, 0xff, 0xd9]);
    // cleaning again changes nothing
    assert.deepEqual(cleanJpeg(clean.jpeg)!.jpeg, clean.jpeg);
    assert.equal(cleanJpeg(PROGRESSIVE_JPEG)!.width, 4);
    // bytes after the end go too
    assert.deepEqual(cleanJpeg(Buffer.concat([clean.jpeg, Buffer.from('<script>')]))!.jpeg, clean.jpeg);
    // not pictures, cut short, a PNG, or too big a side
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    for (const bad of [Buffer.alloc(0), Buffer.from('hello'), png, EXIF_JPEG.subarray(0, 300), EXIF_JPEG.subarray(0, EXIF_JPEG.length - 2)]) assert.equal(cleanJpeg(bad), undefined);
    assert.equal(cleanJpeg(EXIF_JPEG, 3), undefined);
  });

  it('sends a picture to members: uploaded, carried by a message with a text for older launchers, served only to members', async () => {
    const c = await community('Pic');
    const live = await connect(c.member.token);
    const up = await upload(images(c), c.owner.token, EXIF_JPEG);
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.deepEqual([up.body.w, up.body.h], [4, 3]);
    assert.match(up.body.id, /^[\w-]{22}$/);
    // stored without the metadata
    const stored = readdirSync(imagesDir);
    assert.ok(stored.includes(`${up.body.id}.jpg`));
    const sent = await call('POST', msgs(c), c.owner.token, { image: up.body.id, lang: 'pl' });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.message.text, '[Zdjęcie]');
    assert.deepEqual(sent.body.message.image, { id: up.body.id, w: 4, h: 3, size: up.body.size });
    const pushed = await live.waitFor((e) => e.type === 'community-message' && e.message.image);
    assert.equal(pushed.message.image.id, up.body.id);
    const history = await call('GET', msgs(c), c.second.token);
    assert.equal(history.body.messages.at(-1).image.id, up.body.id);
    // the picture: to members, as a JPEG without metadata
    const got = await download(`/v1/communities/${c.id}/images/${up.body.id}`, c.second.token);
    assert.equal(got.status, 200);
    assert.equal(got.type, 'image/jpeg');
    assert.ok(!got.data.includes('SecretCam'));
    assert.deepEqual(cleanJpeg(got.data)!.jpeg, got.data);
    assert.equal((await download(`/v1/communities/${c.id}/images/${up.body.id}`, c.outsider.token)).status, 404);
    assert.equal((await download(`/v1/communities/${c.id}/images/${up.body.id}`)).status, 401);
    assert.equal((await download(`/v1/communities/nope/images/${up.body.id}`, c.second.token)).status, 404);
    // one picture, one message; not in another channel or by someone else
    assert.equal((await call('POST', msgs(c), c.owner.token, { image: up.body.id })).body.error, 'bad_image');
    const other = await upload(images(c), c.member.token, PROGRESSIVE_JPEG);
    assert.equal((await call('POST', msgs(c), c.owner.token, { image: other.body.id })).body.error, 'bad_image');
    assert.equal((await call('POST', msgs(c, c.news), c.owner.token, { image: other.body.id })).status, 400);
    // a picture not sent yet: only its owner sees it
    assert.equal((await download(`/v1/communities/${c.id}/images/${other.body.id}`, c.second.token)).status, 404);
    assert.equal((await download(`/v1/communities/${c.id}/images/${other.body.id}`, c.member.token)).status, 200);
    // a caption (English fallback when none)
    const captioned = await call('POST', msgs(c), c.member.token, { image: other.body.id, text: 'Moja baza' });
    assert.equal(captioned.body.message.text, 'Moja baza');
    const third = await upload(images(c), c.member.token, PROGRESSIVE_JPEG);
    assert.equal((await call('POST', msgs(c), c.member.token, { image: third.body.id, lang: 'en' })).body.message.text, '[Picture]');
    // not edited like a text
    assert.equal((await call('POST', `${msgs(c)}/${sent.body.message.id}/edit`, c.owner.token, { text: 'x' })).body.error, 'not_editable');
    live.ws.close();
  });

  it('refuses what is not a picture, outsiders, read-only channels, timeouts and the switched-off feature', async () => {
    const c = await community('Ref');
    assert.equal((await upload(images(c), c.member.token, Buffer.from('not a picture at all, just text'))).body.error, 'not_an_image');
    assert.equal((await upload(images(c), c.outsider.token, EXIF_JPEG)).status, 404);
    assert.equal((await upload(images(c, c.news), c.member.token, EXIF_JPEG)).body.error, 'read_only_channel');
    assert.equal((await upload(images(c, c.news), c.owner.token, EXIF_JPEG)).status, 200);
    assert.equal((await call('POST', `/v1/communities/${c.id}/members/${c.member.user.id}/mute`, c.mod.token, { minutes: 5 })).status, 200);
    assert.equal((await upload(images(c), c.member.token, EXIF_JPEG)).body.error, 'community_muted');
    // too big for the admin's limit
    const admin = await login('Szef');
    assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values: { 'communities.imageBytes': 64 * 1024 } })).status, 200);
    assert.equal((await upload(images(c), c.second.token, Buffer.concat([EXIF_JPEG, Buffer.alloc(70 * 1024)]))).status, 413);
    // the owner's switch for chat pictures stops new ones (polls and text go on)
    assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values: { 'feature.chatImages': false } })).status, 200);
    const off = await upload(images(c), c.second.token, EXIF_JPEG);
    assert.equal(off.status, 503);
    assert.equal(off.body.feature, 'chatImages');
    assert.equal((await call('POST', msgs(c), c.second.token, poll('Działa?', ['Tak', 'Nie']))).status, 200);
    assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values: { 'feature.chatImages': true, 'communities.imageBytes': 4 * 1024 * 1024 } })).status, 200);
  });

  it('goes with its message when the author or a moderator deletes it, and with the community', async () => {
    const c = await community('Del');
    const up = await upload(images(c), c.member.token, EXIF_JPEG);
    const sent = await call('POST', msgs(c), c.member.token, { image: up.body.id });
    assert.equal((await call('DELETE', `${msgs(c)}/${sent.body.message.id}`, c.mod.token)).status, 200);
    assert.ok(!existsSync(path.join(imagesDir, `${up.body.id}.jpg`)));
    assert.equal((await download(`/v1/communities/${c.id}/images/${up.body.id}`, c.member.token)).status, 404);
    const history = await call('GET', msgs(c), c.member.token);
    assert.equal(history.body.messages.at(-1).deleted, true);
    assert.equal(history.body.messages.at(-1).image, undefined);
    const kept = await upload(images(c), c.member.token, EXIF_JPEG);
    await call('POST', msgs(c), c.member.token, { image: kept.body.id });
    assert.equal((await call('DELETE', `/v1/communities/${c.id}`, c.owner.token)).status, 200);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!existsSync(path.join(imagesDir, `${kept.body.id}.jpg`)));
  });

  it('drops uploads no message took, and old pictures leave the message saying so', async () => {
    const c = await community('Old');
    const orphan = await upload(images(c), c.member.token, EXIF_JPEG);
    const up = await upload(images(c), c.member.token, EXIF_JPEG);
    const sent = await call('POST', msgs(c), c.member.token, { image: up.body.id });
    await app.cleanupCommunityImages(Date.now() + 2 * 3_600_000);
    assert.ok(!existsSync(path.join(imagesDir, `${orphan.body.id}.jpg`)));
    assert.ok(existsSync(path.join(imagesDir, `${up.body.id}.jpg`)));
    await app.cleanupCommunityImages(Date.now() + 400 * 86_400_000);
    assert.ok(!existsSync(path.join(imagesDir, `${up.body.id}.jpg`)));
    const m = (await call('GET', msgs(c), c.second.token)).body.messages.find((x: any) => x.id === sent.body.message.id);
    assert.equal(m.image.expired, true);
    assert.equal((await download(`/v1/communities/${c.id}/images/${up.body.id}`, c.second.token)).status, 404);
  });

  it('tells the launchers it has pictures and polls', async () => {
    const c = await community('Lim');
    const mine = await call('GET', '/v1/communities/mine', c.member.token);
    assert.equal(mine.body.limits.pollOptions, 10);
    assert.ok(mine.body.limits.imageBytes > 0);
  });
});

describe('community polls', () => {
  it('checks a poll: a question, 2–10 different options, one or several choices, an end within a month', () => {
    const now = 1_000_000_000;
    assert.deepEqual(cleanPoll({ question: '  Kiedy  gramy? ', options: ['Sobota', 'Niedziela'] }, now), { question: 'Kiedy gramy?', options: ['Sobota', 'Niedziela'], multiple: false, endsAt: null });
    assert.equal((cleanPoll({ question: 'Q', options: ['a', 'b'], multiple: true, endsAt: now + 3_600_000 }, now) as any).endsAt, now + 3_600_000);
    for (const bad of [null, 'x', {}, { question: '', options: ['a', 'b'] }, { question: 'Q', options: ['a'] }, { question: 'Q', options: Array.from({ length: 11 }, (_, i) => `o${i}`) },
      { question: 'Q', options: ['a', 'A'] }, { question: 'Q', options: ['a', ''] }, { question: 'Q', options: ['a', 5] }, { question: 'x'.repeat(301), options: ['a', 'b'] },
      { question: 'Q', options: ['a', 'x'.repeat(81)] }, { question: 'Q', options: ['a', 'b'], multiple: 'yes' }]) assert.equal(cleanPoll(bad, now), 'bad_poll', JSON.stringify(bad));
    assert.equal(cleanPoll({ question: 'Q', options: ['a', 'b'], endsAt: now + 1000 }, now), 'bad_poll_end');
    assert.equal(cleanPoll({ question: 'Q', options: ['a', 'b'], endsAt: now + 31 * 86_400_000 }, now), 'bad_poll_end');
    assert.match(pollFallback({ question: 'Kiedy?', options: ['A', 'B'] }, 'pl'), /^📊 Ankieta: Kiedy\?\n• A\n• B\n/);
    assert.match(pollFallback({ question: 'When?', options: ['A', 'B'] }, 'en'), /^📊 Poll: When\?/);
  });

  it('votes: one choice, changed or taken back, results live for everyone; several when allowed', async () => {
    const c = await community('Vote');
    const live = await connect(c.second.token);
    const made = await call('POST', msgs(c), c.member.token, { ...poll('Kiedy gramy?', ['Sobota', 'Niedziela', 'Nigdy']), lang: 'pl' });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const m = made.body.message;
    assert.match(m.text, /^📊 Ankieta: Kiedy gramy\?/);
    assert.deepEqual(m.poll, { question: 'Kiedy gramy?', options: [{ text: 'Sobota', votes: 0 }, { text: 'Niedziela', votes: 0 }, { text: 'Nigdy', votes: 0 }], multiple: false, voters: 0, mine: [] });
    const vote = (p: Player, options: unknown) => call('POST', `${msgs(c)}/${m.id}/vote`, p.token, { options });
    const first = await vote(c.owner, [1]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body.message.poll.mine, [1]);
    assert.equal(first.body.message.poll.options[1].votes, 1);
    const pushed = await live.waitFor((e) => e.type === 'community-poll' && e.poll.voters === 1);
    assert.equal(pushed.message, m.id);
    assert.equal(pushed.poll.mine, undefined);
    assert.equal(pushed.user, c.owner.user.id);
    await vote(c.second, [1]);
    // changed
    const changed = await vote(c.owner, [0]);
    assert.deepEqual(changed.body.message.poll.options.map((o: any) => o.votes), [1, 1, 0]);
    // one only
    assert.equal((await vote(c.owner, [0, 1])).body.error, 'bad_vote');
    for (const bad of [[3], [-1], ['0'], 'x', [0, 0]]) assert.equal((await vote(c.owner, bad)).body.error, 'bad_vote', JSON.stringify(bad));
    // taken back
    const back = await vote(c.owner, []);
    assert.equal(back.body.message.poll.voters, 1);
    assert.deepEqual(back.body.message.poll.mine, []);
    // each reader sees their own choice in the history
    const seen = await call('GET', msgs(c), c.second.token);
    assert.deepEqual(seen.body.messages.at(-1).poll.mine, [1]);
    // outsiders do not vote; a timeout does not either
    assert.equal((await vote(c.outsider, [0])).status, 404);
    await call('POST', `/v1/communities/${c.id}/members/${c.second.user.id}/mute`, c.mod.token, { minutes: 5 });
    assert.equal((await vote(c.second, [0])).body.error, 'community_muted');
    // several choices
    const multi = await call('POST', msgs(c), c.member.token, poll('Co budujemy?', ['Zamek', 'Farma', 'Most'], { multiple: true }));
    const many = await call('POST', `${msgs(c)}/${multi.body.message.id}/vote`, c.owner.token, { options: [2, 0] });
    assert.deepEqual(many.body.message.poll.mine, [0, 2]);
    assert.equal(many.body.message.poll.voters, 1);
    // not a poll
    const text = await call('POST', msgs(c), c.member.token, { text: 'zwykła' });
    assert.equal((await call('POST', `${msgs(c)}/${text.body.message.id}/vote`, c.owner.token, { options: [0] })).status, 404);
    assert.equal(text.body.message.poll, undefined);
    // not edited like a text
    assert.equal((await call('POST', `${msgs(c)}/${m.id}/edit`, c.member.token, { text: 'x' })).body.error, 'not_editable');
    live.ws.close();
  });

  it('closes: early by its author or a moderator (not others), or at its end; no votes after', async () => {
    const c = await community('Close');
    const live = await connect(c.second.token);
    const made = await call('POST', msgs(c), c.member.token, poll('Mapa?', ['Tak', 'Nie']));
    const id = made.body.message.id;
    assert.equal((await call('POST', `${msgs(c)}/${id}/poll/close`, c.second.token)).body.error, 'not_allowed');
    const closed = await call('POST', `${msgs(c)}/${id}/poll/close`, c.mod.token);
    assert.equal(closed.status, 200);
    assert.equal(closed.body.message.poll.closed, true);
    await live.waitFor((e) => e.type === 'community-poll' && e.message === id && e.poll.closed);
    assert.equal((await call('POST', `${msgs(c)}/${id}/vote`, c.second.token, { options: [0] })).body.error, 'poll_closed');
    assert.equal((await call('POST', `${msgs(c)}/${id}/poll/close`, c.member.token)).body.error, 'poll_closed');
    // the moderator's closing is in the log
    const log = await call('GET', `/v1/communities/${c.id}/log`, c.owner.token);
    assert.ok(log.body.log.some((e: any) => e.action === 'poll_close'));
    // the author closes their own
    const own = await call('POST', msgs(c), c.member.token, poll('Druga?', ['A', 'B']));
    assert.equal((await call('POST', `${msgs(c)}/${own.body.message.id}/poll/close`, c.member.token)).status, 200);
    // one with an end: closed once it is past (the clock moved in the database)
    const timed = await call('POST', msgs(c), c.member.token, poll('Szybka?', ['A', 'B'], { endsAt: Date.now() + 120_000 }));
    assert.equal(timed.status, 200, JSON.stringify(timed.body));
    assert.ok(timed.body.message.poll.endsAt > Date.now());
    app.db.sql.prepare('UPDATE community_polls SET ends_at = ? WHERE message_id = ?').run(Date.now() - 1, timed.body.message.id);
    assert.equal((await call('POST', `${msgs(c)}/${timed.body.message.id}/vote`, c.owner.token, { options: [0] })).body.error, 'poll_closed');
    assert.equal((await call('GET', msgs(c), c.owner.token)).body.messages.at(-1).poll.closed, true);
    // bad polls; read-only channels (announcements: admins make polls there)
    assert.equal((await call('POST', msgs(c), c.member.token, poll('Q', ['jedna']))).body.error, 'bad_poll');
    assert.equal((await call('POST', msgs(c), c.member.token, poll('Q', ['a', 'b'], { endsAt: Date.now() + 1000 }))).body.error, 'bad_poll_end');
    assert.equal((await call('POST', msgs(c, c.news), c.member.token, poll('Q', ['a', 'b']))).body.error, 'read_only_channel');
    assert.equal((await call('POST', msgs(c, c.news), c.owner.token, poll('Q', ['a', 'b']))).status, 200);
    // members vote in announcements too
    const news = (await call('GET', msgs(c, c.news), c.member.token)).body.messages.at(-1);
    assert.equal((await call('POST', `${msgs(c, c.news)}/${news.id}/vote`, c.member.token, { options: [1] })).status, 200);
    live.ws.close();
  });

  it('goes with its message when deleted', async () => {
    const c = await community('PollDel');
    const made = await call('POST', msgs(c), c.member.token, poll('Zniknie?', ['Tak', 'Nie']));
    await call('POST', `${msgs(c)}/${made.body.message.id}/vote`, c.owner.token, { options: [0] });
    assert.equal((await call('DELETE', `${msgs(c)}/${made.body.message.id}`, c.member.token)).status, 200);
    const m = (await call('GET', msgs(c), c.owner.token)).body.messages.at(-1);
    assert.equal(m.deleted, true);
    assert.equal(m.poll, undefined);
    assert.equal((await call('POST', `${msgs(c)}/${made.body.message.id}/vote`, c.owner.token, { options: [0] })).status, 404);
    assert.equal(app.db.sql.prepare('SELECT COUNT(*) AS n FROM community_poll_votes WHERE message_id = ?').get(made.body.message.id)!.n, 0);
  });
});
