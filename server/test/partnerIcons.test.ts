import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.ts';
import { Db } from '../src/db.ts';
import { makeIcon } from '../src/partnerIcons.ts';
import { decodePng, encodePng } from '../src/png.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-partner-icons-'));
const partnersDir = path.join(dir, 'partners');
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown, raw?: Buffer, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(raw ? { 'Content-Type': 'image/gif' } : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ? new Uint8Array(raw) : body === undefined ? undefined : JSON.stringify(body),
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
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

// ---------- a tiny GIF encoder, so the tests make their own animations ----------

/** GIF's LZW, with a growing table (and a clear when it is full), the way real encoders write it. */
function lzwEncode(indexes: number[], minCode: number): Buffer {
  const clear = 1 << minCode, end = clear + 1;
  const bytes: number[] = [];
  let acc = 0, bits = 0;
  let size = minCode + 1, next = end + 1;
  let dict = new Map<string, number>();
  const write = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      bytes.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  };
  write(clear);
  let prefix = indexes[0];
  for (let i = 1; i < indexes.length; i++) {
    const k = indexes[i];
    const key = `${prefix},${k}`;
    const known = dict.get(key);
    if (known !== undefined) {
      prefix = known;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      write(clear);
      size = minCode + 1;
      next = end + 1;
      dict = new Map();
    }
    prefix = k;
  }
  write(prefix);
  write(end);
  if (bits > 0) bytes.push(acc & 0xff);
  const data = Buffer.from(bytes);
  const blocks: Buffer[] = [];
  for (let i = 0; i < data.length; i += 255) blocks.push(Buffer.from([Math.min(255, data.length - i)]), data.subarray(i, i + 255));
  return Buffer.concat([Buffer.from([minCode]), ...blocks, Buffer.from([0])]);
}

interface GifFrame { left?: number; top?: number; w: number; h: number; pixels: number[]; delay: number; disposal?: number; transparent?: number; interlace?: boolean }

const PALETTE = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255]];

function gif(width: number, height: number, frames: GifFrame[]): Buffer {
  const head = Buffer.alloc(13);
  head.write('GIF89a', 0, 'latin1');
  head.writeUInt16LE(width, 6);
  head.writeUInt16LE(height, 8);
  head[10] = 0x80 | 2; // a global table of 8 colours
  const parts: Buffer[] = [head, Buffer.from(PALETTE.flat())];
  for (const f of frames) {
    const gce = Buffer.from([0x21, 0xf9, 4, ((f.disposal ?? 0) << 2) | (f.transparent !== undefined ? 1 : 0), 0, 0, f.transparent ?? 0, 0]);
    gce.writeUInt16LE(f.delay, 4);
    const desc = Buffer.alloc(10);
    desc[0] = 0x2c;
    desc.writeUInt16LE(f.left ?? 0, 1);
    desc.writeUInt16LE(f.top ?? 0, 3);
    desc.writeUInt16LE(f.w, 5);
    desc.writeUInt16LE(f.h, 7);
    desc[9] = f.interlace ? 0x40 : 0;
    let pixels = f.pixels;
    if (f.interlace) {
      const order: number[] = [];
      for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < f.h; y += step) order.push(y);
      pixels = order.flatMap((y) => f.pixels.slice(y * f.w, (y + 1) * f.w));
    }
    parts.push(gce, desc, lzwEncode(pixels, 3));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

const fill = (w: number, h: number, at: (x: number, y: number) => number) => Array.from({ length: w * h }, (_, i) => at(i % w, Math.floor(i / w)));
const solid = (w: number, h: number, c: number, delay = 10): GifFrame => ({ w, h, pixels: fill(w, h, () => c), delay });

/** The pixel (x, y) of frame `n` of a sprite sheet. */
function px(sheet: { width: number; rgba: Buffer }, n: number, x: number, y: number): number[] {
  const i = ((n * sheet.width + y) * sheet.width + x) * 4;
  return [...sheet.rgba.subarray(i, i + 4)];
}

/**
 * Three frames, 40×20: white sides around a red middle; then green over the middle's top half
 * (cleared afterwards); then blue over its bottom half, interlaced, with one see-through pixel.
 */
const ANIMATION = gif(40, 20, [
  { w: 40, h: 20, pixels: fill(40, 20, (x) => (x < 10 || x >= 30 ? 4 : 1)), delay: 10, disposal: 1 },
  { left: 10, top: 0, w: 20, h: 10, pixels: fill(20, 10, () => 2), delay: 25, disposal: 2 },
  { left: 10, top: 10, w: 20, h: 10, pixels: fill(20, 10, (x, y) => (x === 0 && y === 0 ? 7 : 3)), delay: 0, transparent: 7, interlace: true },
]);

describe('animated icon conversion', () => {
  it('turns a GIF into a square sprite sheet with the frames composited', () => {
    const icon = makeIcon(ANIMATION, { frames: 64, side: 128 });
    assert.equal(icon.size, 20);
    assert.deepEqual(icon.delays, [100, 250, 100]);
    const sheet = decodePng(icon.png);
    assert.equal(sheet.width, 20);
    assert.equal(sheet.height, 60);
    // the middle square only: no white sides
    assert.deepEqual(px(sheet, 0, 0, 0), [255, 0, 0, 255]);
    assert.deepEqual(px(sheet, 0, 19, 19), [255, 0, 0, 255]);
    assert.deepEqual(px(sheet, 1, 5, 5), [0, 255, 0, 255]);
    assert.deepEqual(px(sheet, 1, 5, 15), [255, 0, 0, 255]);
    // the green was cleared to see-through, the blue covers the bottom, the red shows through its hole
    assert.deepEqual(px(sheet, 2, 5, 5), [0, 0, 0, 0]);
    assert.deepEqual(px(sheet, 2, 5, 15), [0, 0, 255, 255]);
    assert.deepEqual(px(sheet, 2, 0, 10), [255, 0, 0, 255]);
  });

  it('plays delays the way browsers do', () => {
    const icon = makeIcon(gif(4, 4, [solid(4, 4, 1, 0), solid(4, 4, 2, 1), solid(4, 4, 3, 2), solid(4, 4, 4, 7)]), { frames: 64, side: 128 });
    assert.deepEqual(icon.delays, [100, 100, 20, 70]);
  });

  it('scales big pictures down, keeping see-through edges clean, and never up', () => {
    const half = gif(64, 64, [{ w: 64, h: 64, pixels: fill(64, 64, (x) => (x < 32 ? 1 : 0)), delay: 10, transparent: 0 }]);
    const icon = makeIcon(half, { frames: 64, side: 16 });
    assert.equal(icon.size, 16);
    const sheet = decodePng(icon.png);
    assert.equal(sheet.height, 16);
    assert.deepEqual(px(sheet, 0, 7, 8), [255, 0, 0, 255]);
    assert.deepEqual(px(sheet, 0, 8, 8)[3], 0);
    // an uneven ratio: the column across the edge is half see-through red, not darkened
    const odd = decodePng(makeIcon(half, { frames: 64, side: 9 }).png);
    const edge = px(odd, 0, 4, 4);
    assert.deepEqual(edge.slice(0, 3), [255, 0, 0]);
    assert.ok(edge[3] > 0 && edge[3] < 255, String(edge));
    assert.equal(makeIcon(gif(8, 8, [solid(8, 8, 1)]), { frames: 64, side: 128 }).size, 8);
  });

  it('reads APNG, with blending and disposal', () => {
    const icon = makeIcon(apng(), { frames: 64, side: 128 });
    assert.equal(icon.size, 4);
    assert.deepEqual(icon.delays, [100, 500]);
    const sheet = decodePng(icon.png);
    assert.equal(sheet.height, 8);
    assert.deepEqual(px(sheet, 0, 0, 0), [255, 0, 0, 255]);
    // frame 2 blends a half see-through blue square over the red corner
    const mixed = px(sheet, 1, 0, 0);
    assert.ok(mixed[0] > 100 && mixed[2] > 100 && mixed[3] === 255, String(mixed));
    assert.deepEqual(px(sheet, 1, 3, 3), [255, 0, 0, 255]);
    // a plain PNG is a one-frame icon
    const still = makeIcon(encodePng({ width: 6, height: 6, rgba: Buffer.alloc(6 * 6 * 4, 200) }), { frames: 64, side: 128 });
    assert.equal(still.size, 6);
    assert.deepEqual(still.delays, [100]);
  });

  it('refuses what is not a GIF or PNG, broken files, huge canvases and long animations', () => {
    const code = (data: Buffer, limits = { frames: 64, side: 128 }) => {
      try {
        makeIcon(data, limits);
        return 'ok';
      } catch (e) {
        return (e as Error).message;
      }
    };
    assert.equal(code(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])), 'bad_icon');
    assert.equal(code(Buffer.from('this is not a picture at all')), 'bad_icon');
    assert.equal(code(ANIMATION.subarray(0, 20)), 'bad_icon');
    assert.equal(code(Buffer.concat([Buffer.from('RIFF0000WEBPVP8X'), Buffer.alloc(16)])), 'webp_unsupported');
    const huge = Buffer.from(ANIMATION);
    huge.writeUInt16LE(5000, 6);
    assert.equal(code(huge), 'bad_icon');
    assert.equal(code(ANIMATION, { frames: 2, side: 128 }), 'too_many_frames');
  });
});

// ---------- a tiny APNG ----------

function crc32(data: Buffer): number {
  let c = -1;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ -1) >>> 0;
}
function chunk(kind: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(kind, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])));
  return Buffer.concat([head, body, crc]);
}
const rgbaRows = (w: number, h: number, rgba: number[]) => deflateSync(Buffer.concat(Array.from({ length: h }, () => Buffer.from([0, ...Array.from({ length: w }, () => rgba).flat()]))));
function fctl(seq: number, w: number, h: number, x: number, y: number, num: number, den: number, dispose: number, blend: number) {
  const b = Buffer.alloc(26);
  b.writeUInt32BE(seq, 0);
  b.writeUInt32BE(w, 4);
  b.writeUInt32BE(h, 8);
  b.writeUInt32BE(x, 12);
  b.writeUInt32BE(y, 16);
  b.writeUInt16BE(num, 20);
  b.writeUInt16BE(den, 22);
  b[24] = dispose;
  b[25] = blend;
  return chunk('fcTL', b);
}
/** 4×4 red, then a 2×2 half see-through blue square blended over its top left corner. */
function apng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(4, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(2, 0);
  const seq = Buffer.alloc(4);
  seq.writeUInt32BE(2);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('acTL', actl),
    fctl(0, 4, 4, 0, 0, 0, 0, 0, 0), chunk('IDAT', rgbaRows(4, 4, [255, 0, 0, 255])),
    fctl(1, 2, 2, 0, 0, 1, 2, 0, 1), chunk('fdAT', Buffer.concat([seq, rgbaRows(2, 2, [0, 0, 255, 128])])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- the routes ----------

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const iconFiles = () => readdirSync(partnersDir).filter((f) => f.includes('-icon-'));

describe('partner servers\' animated icons', () => {
  it('lets the owner and the admin set and remove it, and serves it to the game', async () => {
    const boss = await login('Szef');
    const owner = await login('IkonaWlasciciel');
    const stranger = await login('IkonaObcy');
    const p = (await call('POST', '/v1/admin/partners', boss.token, { address: 'icons.example.pl', name: 'Ikony', owner: '@IkonaWlasciciel' })).body;
    assert.equal(p.icon, null);
    assert.equal(p.iconSize, 0);
    assert.deepEqual(p.iconDelays, []);
    const listedBefore = (await call('GET', '/v1/partners')).body.partners.find((x: any) => x.id === p.id);
    assert.equal(listedBefore.icon, null);
    assert.equal(listedBefore.iconSize, 0);
    assert.deepEqual(listedBefore.iconDelays, []);
    assert.equal(listedBefore.background, null);

    // only GIF or PNG bytes, whatever the name or type says
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
    const refused = await call('PUT', `/v1/me/partners/${p.id}/icon`, owner.token, undefined, jpg, { 'Content-Type': 'image/gif', 'X-File-Name': 'ikona.gif' });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, 'bad_icon');
    assert.equal((await call('PUT', `/v1/me/partners/${p.id}/icon`, owner.token, undefined, Buffer.from('GIF89a garbage'))).body.error, 'bad_icon');
    assert.equal((await call('PUT', `/v1/me/partners/${p.id}/icon`, owner.token, undefined, Buffer.alloc(3 * 1024 * 1024, 7))).status, 413);

    // someone else may not
    assert.equal((await call('PUT', `/v1/me/partners/${p.id}/icon`, stranger.token, undefined, ANIMATION)).body.error, 'not_owner');
    assert.equal((await call('DELETE', `/v1/me/partners/${p.id}/icon`, stranger.token)).status, 403);
    assert.equal((await call('PUT', `/v1/admin/partners/${p.id}/icon`, stranger.token, undefined, ANIMATION)).body.error, 'not_admin');

    const set = await call('PUT', `/v1/me/partners/${p.id}/icon`, owner.token, undefined, ANIMATION);
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.match(set.body.icon, new RegExp(`^/v1/partners/${p.id}/icon\\?v=\\d+$`));
    assert.equal(set.body.iconSize, 20);
    assert.deepEqual(set.body.iconDelays, [100, 250, 100]);
    assert.equal(iconFiles().length, 1);

    const listed = (await call('GET', '/v1/partners')).body.partners.find((x: any) => x.id === p.id);
    assert.equal(listed.icon, set.body.icon);
    assert.equal(listed.iconSize, 20);
    assert.deepEqual(listed.iconDelays, [100, 250, 100]);
    const mine = (await call('GET', '/v1/me/partners', owner.token)).body;
    assert.deepEqual(mine.iconLimits, { bytes: 2 * 1024 * 1024, frames: 64, side: 128 });

    // served as a PNG strip, with an ETag the game sends back
    const got = await call('GET', listed.icon);
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'image/png');
    assert.equal(got.headers.get('cache-control'), 'public, max-age=86400');
    const etag = got.headers.get('etag')!;
    assert.match(etag, /^"[0-9a-f]+"$/);
    const sheet = decodePng(got.buf);
    assert.equal(sheet.width, 20);
    assert.equal(sheet.height, 60);
    assert.deepEqual(px(sheet, 1, 5, 5), [0, 255, 0, 255]);
    const again = await call('GET', `/v1/partners/${p.id}/icon`, undefined, undefined, undefined, { 'If-None-Match': etag });
    assert.equal(again.status, 304);
    assert.equal(again.buf.length, 0);
    assert.equal((await call('GET', `/v1/partners/${p.id}/icon`, undefined, undefined, undefined, { 'If-None-Match': '"other"' })).status, 200);

    // the admin replaces it: the old file goes
    const replaced = (await call('PUT', `/v1/admin/partners/${p.id}/icon`, boss.token, undefined, gif(30, 30, [solid(30, 30, 5, 3)]))).body;
    assert.equal(replaced.iconSize, 30);
    assert.deepEqual(replaced.iconDelays, [30]);
    assert.equal(iconFiles().length, 1);
    assert.notEqual((await call('GET', `/v1/partners/${p.id}/icon`)).headers.get('etag'), etag);

    assert.equal((await call('DELETE', `/v1/admin/partners/${p.id}/icon`, boss.token)).body.icon, null);
    assert.equal(iconFiles().length, 0);
    assert.equal((await call('GET', `/v1/partners/${p.id}/icon`)).status, 404);

    // the owner sets it again and removes it
    assert.equal((await call('PUT', `/v1/me/partners/${p.id}/icon`, owner.token, undefined, ANIMATION)).status, 200);
    const cleared = (await call('DELETE', `/v1/me/partners/${p.id}/icon`, owner.token)).body;
    assert.equal(cleared.icon, null);
    assert.equal(cleared.iconSize, 0);
    assert.deepEqual(cleared.iconDelays, []);

    // removing the partner removes its icon file
    await call('PUT', `/v1/admin/partners/${p.id}/icon`, boss.token, undefined, ANIMATION);
    const file = path.join(partnersDir, iconFiles()[0]);
    assert.ok(existsSync(file));
    assert.equal((await call('DELETE', `/v1/admin/partners/${p.id}`, boss.token)).status, 200);
    assert.ok(!existsSync(file));
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries.map((e: any) => e.action);
    assert.ok(log.includes('partner_icon'));
  });

  it('keeps partners of a database from before animated icons', () => {
    const file = path.join(dir, 'old.db');
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE partners (id TEXT PRIMARY KEY, address TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, rotate INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)");
    old.exec("INSERT INTO partners (id, address, name, updated_at) VALUES ('abc', 'old.example.pl', 'Stary', 1)");
    old.close();
    const db = new Db(file);
    const p = db.partner('abc')!;
    assert.equal(p.address, 'old.example.pl');
    assert.equal(p.icon, '');
    assert.equal(p.iconSize, 0);
    assert.deepEqual(p.iconDelays, []);
    db.setPartnerIcon('abc', 'abc-icon-1.png', 32, [100, 200]);
    assert.deepEqual(db.partners()[0].iconDelays, [100, 200]);
    db.close();
  });

  it('takes its limits from the admin panel', async () => {
    const boss = await login('Szef');
    const p = (await call('POST', '/v1/admin/partners', boss.token, { address: 'limits.example.pl' })).body;
    const settings = (values: Record<string, unknown>) => call('POST', '/v1/admin/settings', boss.token, { values });
    assert.equal((await settings({ 'partners.iconFrames': 2, 'partners.iconSide': 16, 'partners.iconBytes': 64 * 1024 })).status, 200);
    assert.equal((await call('PUT', `/v1/admin/partners/${p.id}/icon`, boss.token, undefined, ANIMATION)).body.error, 'too_many_frames');
    const small = (await call('PUT', `/v1/admin/partners/${p.id}/icon`, boss.token, undefined, gif(64, 64, [solid(64, 64, 1)]))).body;
    assert.equal(small.iconSize, 16);
    const big = Buffer.concat([gif(4, 4, [solid(4, 4, 1)]), Buffer.alloc(100 * 1024)]);
    assert.equal((await call('PUT', `/v1/admin/partners/${p.id}/icon`, boss.token, undefined, big)).status, 413);
    assert.deepEqual((await call('GET', '/v1/admin/partners', boss.token)).body.iconLimits, { bytes: 64 * 1024, frames: 2, side: 16 });
    await settings({ 'partners.iconFrames': null, 'partners.iconSide': null, 'partners.iconBytes': null });
  });
});
