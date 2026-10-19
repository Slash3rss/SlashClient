import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { inspectMedia, jpegSize, parseAvi, pngSize } from '../src/media.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-media-'));
const mediaDir = path.join(dir, 'media');
const webDir = path.join(dir, 'web');
let base = '';
let app: ReturnType<typeof createApp>;

/** The start of a JPEG: enough for the size check (SOI, a baseline frame header, EOI). */
function jpeg(width: number, height: number, fill = 0): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, fill, 0x00]), sof, Buffer.from([0xff, 0xd9])]);
}

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(45);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

/** An MJPEG AVI laid out like the game's clips (AviWriter.java). */
function avi(frames: Buffer[], width: number, height: number, fps = 30, handler = 'MJPG'): Buffer {
  const chunk = (id: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'latin1');
    head.writeUInt32LE(data.length, 4);
    return Buffer.concat([head, data, Buffer.alloc(data.length & 1)]);
  };
  const list = (type: string, ...parts: Buffer[]) => chunk('LIST', Buffer.concat([Buffer.from(type, 'latin1'), ...parts]));
  const avih = Buffer.alloc(56);
  avih.writeUInt32LE(Math.round(1_000_000 / fps), 0);
  avih.writeUInt32LE(0x10, 12);
  avih.writeUInt32LE(frames.length, 16);
  avih.writeUInt32LE(1, 24);
  avih.writeUInt32LE(width, 32);
  avih.writeUInt32LE(height, 36);
  const strh = Buffer.alloc(56);
  strh.write('vids', 0, 'latin1');
  strh.write(handler, 4, 'latin1');
  const strf = Buffer.alloc(40);
  const body = Buffer.concat([
    Buffer.from('AVI ', 'latin1'),
    list('hdrl', chunk('avih', avih), list('strl', chunk('strh', strh), chunk('strf', strf))),
    list('movi', ...frames.map((f) => chunk('00dc', f))),
  ]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

async function call(method: string, url: string, token?: string, raw?: Buffer, type = 'application/octet-stream') {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': raw ? type : 'application/json', 'X-SlashClient': 'launcher/test', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ? new Uint8Array(raw) : undefined,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: any;
  try {
    json = JSON.parse(buf.toString('utf8'));
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, buf, headers: res.headers };
}
const login = async (name: string) => {
  const res = await fetch(`${base}/v1/auth/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  return (await res.json()) as { token: string; user: { id: string } };
};

before(async () => {
  mkdirSync(webDir, { recursive: true });
  writeFileSync(path.join(webDir, 'media.html'), '<!doctype html><head>\n  <!--preview-->\n  <script type="module" src="/media.js"></script>\n</head><body></body>');
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: true, oauth: {}, mediaDir, webDir, adminHandles: ['MediaAdmin'],
    mediaLimits: { imageBytes: 2000, clipBytes: 6000, maxActive: 4, quotaBytes: 9000 },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('media files', () => {
  it('reads sizes of pictures and frames of clips', () => {
    assert.deepEqual(pngSize(png(640, 360)), { width: 640, height: 360 });
    assert.deepEqual(jpegSize(jpeg(1280, 720)), { width: 1280, height: 720 });
    assert.equal(jpegSize(Buffer.from('not a jpeg')), undefined);
    const clip = parseAvi(avi([jpeg(320, 180), jpeg(320, 180, 1), jpeg(320, 180, 2)], 320, 180, 25));
    assert.equal(clip?.frames.length, 3);
    assert.equal(clip?.handler, 'MJPG');
    assert.equal(clip?.usPerFrame, 40_000);
    const info = inspectMedia(avi([jpeg(320, 180), jpeg(320, 180, 1)], 320, 180, 25));
    assert.equal(info?.kind, 'clip');
    assert.equal(info?.durationMs, 80);
    assert.deepEqual(info?.poster, jpeg(320, 180));
    // another codec, or something else entirely, is refused
    assert.equal(inspectMedia(avi([jpeg(320, 180)], 320, 180, 30, 'H264')), undefined);
    assert.equal(inspectMedia(Buffer.from('<html><script>alert(1)</script>')), undefined);
  });
});

describe('sharing screenshots and clips', () => {
  it('needs a sign-in to upload', async () => {
    const res = await call('POST', '/v1/media', undefined, png(10, 10), 'image/png');
    assert.equal(res.status, 401);
  });

  it('uploads a screenshot, shows it to anyone and lets only the owner delete it', async () => {
    const owner = await login('MediaOwner');
    const other = await login('MediaOther');
    const up = await call('POST', '/v1/media?title=Moja%20baza', owner.token, png(800, 450), 'image/png');
    assert.equal(up.status, 200);
    const m = up.body.media;
    assert.match(m.id, /^[A-Za-z0-9]{10}$/);
    assert.equal(m.url, `/media/${m.id}`);
    assert.equal(m.kind, 'image');
    assert.equal(m.width, 800);
    assert.equal(m.title, 'Moja baza');
    assert.equal(m.ownerHandle, 'MediaOwner');
    assert.equal(m.owner, undefined);
    assert.ok(m.expiresAt > Date.now() + 29 * 86_400_000);

    // anyone sees it, no sign-in
    const info = await call('GET', `/v1/media/${m.id}`);
    assert.equal(info.status, 200);
    assert.equal(info.body.mine, false);
    assert.equal((await call('GET', `/v1/media/${m.id}`, owner.token)).body.mine, true);
    const file = await call('GET', `/v1/media/${m.id}/file`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.match(file.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.deepEqual(file.buf, png(800, 450));
    assert.match((await call('GET', `/v1/media/${m.id}/file?download`)).headers.get('content-disposition') ?? '', /^attachment/);

    // the owner's list
    const mine = await call('GET', '/v1/media', owner.token);
    assert.equal(mine.body.media.length, 1);
    assert.equal(mine.body.limits.used, png(800, 450).length);
    assert.equal((await call('GET', '/v1/media', other.token)).body.media.length, 0);

    // someone else cannot take it down; the owner can
    assert.equal((await call('DELETE', `/v1/media/${m.id}`, other.token)).status, 404);
    assert.equal((await call('DELETE', `/v1/media/${m.id}`)).status, 401);
    assert.equal((await call('DELETE', `/v1/media/${m.id}`, owner.token)).status, 200);
    assert.equal((await call('GET', `/v1/media/${m.id}`)).status, 404);
    assert.equal((await call('GET', `/v1/media/${m.id}/file`)).status, 404);
    assert.equal(readdirSync(mediaDir).length, 0);
  });

  it('uploads a clip with its first frame as the preview', async () => {
    const { token } = await login('MediaClipper');
    const frames = [jpeg(320, 180), jpeg(320, 180, 1), jpeg(320, 180, 2), jpeg(320, 180, 3)];
    const up = await call('POST', '/v1/media', token, avi(frames, 320, 180, 30), 'video/x-msvideo');
    assert.equal(up.status, 200);
    const m = up.body.media;
    assert.equal(m.kind, 'clip');
    assert.equal(m.frames, 4);
    assert.equal(m.durationMs, 133);
    const poster = await call('GET', `/v1/media/${m.id}/poster`);
    assert.equal(poster.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(poster.buf, frames[0]);
    assert.equal((await call('GET', `/v1/media/${m.id}/file`)).headers.get('content-type'), 'video/x-msvideo');

    // the page carries the preview for Discord and the like, with absolute links
    const page = await fetch(`${base}/media/${m.id}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, new RegExp(`<meta property="og:image" content="https://client.example/v1/media/${m.id}/poster">`));
    assert.match(html, /og:type" content="video.other"/);
    assert.match(html, /Klip od MediaClipper/);
    assert.match(html, /src="\/media.js\?v=/);
    assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    assert.equal((await call('GET', `/v1/media/${m.id}`)).body.media.views, 1);

    // a missing one still gets the page (it says so), with 404
    const missing = await fetch(`${base}/media/AAAAAAAAAA`);
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Nie znaleziono/);
  });

  it('escapes the title in the preview', async () => {
    const { token } = await login('MediaEscaper');
    const up = await call('POST', `/v1/media?title=${encodeURIComponent('"><script>x</script>')}`, token, png(4, 4), 'image/png');
    const html = await (await fetch(`${base}/media/${up.body.media.id}`)).text();
    assert.ok(!html.includes('<script>x'));
    assert.match(html, /&#34;&#62;&#60;script&#62;/);
  });

  it('refuses what is not a picture or clip, and too big files', async () => {
    const { token } = await login('MediaRefused');
    assert.equal((await call('POST', '/v1/media', token, Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml')).body.error, 'bad_media');
    // a picture over the picture limit, a clip over the clip limit
    assert.equal((await call('POST', '/v1/media', token, Buffer.concat([png(10, 10), Buffer.alloc(2100)]), 'image/png')).status, 413);
    const big = avi(Array.from({ length: 4 }, (_, i) => Buffer.concat([jpeg(16, 16, i), Buffer.alloc(1600)])), 16, 16);
    assert.equal((await call('POST', '/v1/media', token, big, 'video/x-msvideo')).status, 413);
    assert.equal((await call('POST', '/v1/media', token, Buffer.alloc(7000), 'video/x-msvideo')).status, 413);
  });

  it('keeps to the count and space quota per player', async () => {
    const { token } = await login('MediaHoarder');
    const clip = (i: number) => avi([Buffer.concat([jpeg(16, 16, i), Buffer.alloc(2700)])], 16, 16);
    // 3 × ~3 KB fits in 9000 bytes, a fourth does not
    for (let i = 0; i < 2; i++) assert.equal((await call('POST', '/v1/media', token, clip(i), 'video/x-msvideo')).status, 200);
    assert.equal((await call('POST', '/v1/media', token, clip(5), 'video/x-msvideo')).status, 200);
    assert.equal((await call('POST', '/v1/media', token, clip(6), 'video/x-msvideo')).body.error, 'media_quota');
    // and no more than maxActive links, however small
    const { token: t2 } = await login('MediaMany');
    for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/v1/media', t2, png(2, 2), 'image/png')).status, 200, `upload ${i}`);
    assert.equal((await call('POST', '/v1/media', t2, png(2, 2), 'image/png')).body.error, 'media_limit');
  });

  it('limits uploads per minute', async () => {
    const { token } = await login('MediaFlood');
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await call('POST', '/v1/media', token, png(2, 2), 'image/png');
      statuses.push(res.status);
      if (res.status === 200) await call('DELETE', `/v1/media/${res.body.media.id}`, token);
    }
    assert.ok(statuses.includes(429), statuses.join());
  });

  it('lets an admin take one down', async () => {
    const owner = await login('MediaVictim');
    const up = await call('POST', '/v1/media', owner.token, png(2, 2), 'image/png');
    const stranger = await login('MediaStranger');
    assert.equal((await call('DELETE', `/v1/media/${up.body.media.id}`, stranger.token)).status, 404);
    assert.ok(existsSync(path.join(mediaDir, up.body.media.id)));
    const admin = await login('MediaAdmin');
    assert.equal((await call('GET', `/v1/media/${up.body.media.id}`, admin.token)).body.mine, true);
    assert.equal((await call('DELETE', `/v1/media/${up.body.media.id}`, admin.token)).status, 200);
    assert.ok(!existsSync(path.join(mediaDir, up.body.media.id)));
  });

  it('stops showing a link once it expires', async () => {
    const { token } = await login('MediaOld');
    const up = await call('POST', '/v1/media', token, png(2, 2), 'image/png');
    const db = new DatabaseSync(path.join(dir, 'test.db'));
    db.prepare('UPDATE shared_media SET expires_at = ? WHERE id = ?').run(Date.now() - 1, up.body.media.id);
    db.close();
    assert.equal((await call('GET', `/v1/media/${up.body.media.id}`)).status, 404);
    assert.equal((await call('GET', `/v1/media/${up.body.media.id}/file`)).status, 404);
    assert.equal((await call('GET', '/v1/media', token)).body.media.length, 0);
  });
});
