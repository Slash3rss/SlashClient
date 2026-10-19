import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { clipFrame, clipInfo, parseAvi, trimClip, trimmedName, writeAvi } from '../src/main/clipTrim';
import { galleryFile, uploadMedia } from '../src/main/mediaShare';
import { clampRange, clipTime } from '../src/renderer/mediaTools';

/** A JPEG-looking frame: only its bytes matter here (the trim copies them as they are). */
const frame = (i: number, extra = 0) => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(10 + extra, i), Buffer.from([0xff, 0xd9])]);

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'slash-clips-'));
}

describe('clip trimming', () => {
  it('writes an AVI the parser reads back, odd-sized frames included', () => {
    const frames = [frame(1), frame(2, 1), frame(3, 2)];
    const avi = writeAvi(frames, 1280, 720, 30);
    const clip = parseAvi(avi)!;
    assert.equal(clip.width, 1280);
    assert.equal(clip.height, 720);
    assert.equal(clip.handler, 'MJPG');
    assert.equal(clip.usPerFrame, 33_333);
    assert.deepEqual(clip.frames.map((f) => avi.subarray(f.offset, f.offset + f.length)), frames);
    // the RIFF size covers the whole file, so players accept it
    assert.equal(avi.readUInt32LE(4) + 8, avi.length);
    assert.equal(parseAvi(Buffer.from('RIFF....WAVE')), undefined);
  });

  it('keeps the frames before a broken one', () => {
    const avi = writeAvi([frame(1), frame(2), frame(3)], 64, 64, 30);
    // the game closed while saving: the end of the file is missing
    assert.equal(parseAvi(avi.subarray(0, avi.length - 60))?.frames.length, 2);
  });

  it('saves the chosen frames as a new clip next to the original, byte for byte', async () => {
    const dir = await tempDir();
    const frames = Array.from({ length: 30 }, (_, i) => frame(i, i % 3));
    const src = path.join(dir, 'clip-2026-10-19_20.00.00.avi');
    await fs.writeFile(src, writeAvi(frames, 640, 360, 25));
    const info = await clipInfo(src);
    assert.deepEqual(info, { frames: 30, fps: 25, width: 640, height: 360, durationMs: 1200, trimmable: true });
    assert.deepEqual(await clipFrame(src, 7), frames[7]);
    assert.deepEqual(await clipFrame(src, 999), frames[29]);

    const name = await trimClip(src, 5, 14);
    assert.equal(name, 'clip-2026-10-19_20.00.00-trim.avi');
    const out = parseAvi(await fs.readFile(path.join(dir, name)))!;
    const data = await fs.readFile(path.join(dir, name));
    assert.deepEqual(out.frames.map((f) => data.subarray(f.offset, f.offset + f.length)), frames.slice(5, 15));
    assert.equal(Math.round(1_000_000 / out.usPerFrame), 25);
    // the original is untouched; a second cut gets its own name, also when cut from the cut
    assert.equal(parseAvi(await fs.readFile(src))!.frames.length, 30);
    assert.equal(await trimClip(path.join(dir, name), 0, 3), 'clip-2026-10-19_20.00.00-trim2.avi');
    assert.equal(await trimmedName(dir, 'clip-2026-10-19_20.00.00.avi'), 'clip-2026-10-19_20.00.00-trim3.avi');
    await assert.rejects(trimClip(src, 4, 4), /too short/);
    assert.ok(!(await fs.readdir(dir)).some((f) => f.endsWith('.part')));
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('says an mp4 cannot be trimmed', async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, 'a.mp4'), 'x');
    assert.equal((await clipInfo(path.join(dir, 'a.mp4'))).trimmable, false);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('keeps the handles inside the clip and apart', () => {
    assert.deepEqual(clampRange(-5, 200, 100, 'start'), [0, 99]);
    assert.deepEqual(clampRange(50, 40, 100, 'start'), [39, 40]);
    assert.deepEqual(clampRange(50, 40, 100, 'end'), [50, 51]);
    assert.deepEqual(clampRange(99, 99, 100, 'start'), [98, 99]);
    assert.deepEqual(clampRange(0, 0, 100, 'end'), [0, 1]);
    assert.equal(clipTime(65.25), '1:05.3');
    assert.equal(clipTime(3), '0:03.0');
  });
});

describe('sharing screenshots and clips', () => {
  it('reads only plain names of the gallery', () => {
    assert.equal(galleryFile('/g', 'clips', 'clip-1.avi'), path.join('/g', 'clips', 'clip-1.avi'));
    assert.equal(galleryFile('/g', 'screenshots', 'a.png'), path.join('/g', 'screenshots', 'a.png'));
    for (const bad of ['../options.txt', '..\\x.avi', '.hidden.png', 'a.txt', 'clip.mp4', '', 5]) {
      assert.throws(() => galleryFile('/g', bad === 'a.txt' ? 'screenshots' : 'clips', bad as string), String(bad));
    }
  });

  it('uploads with the session and returns the full link', async () => {
    let seen: { url?: string; type?: string; auth?: string; size: number } = { size: 0 };
    const server = http.createServer(async (req, res) => {
      let size = 0;
      for await (const c of req) size += (c as Buffer).length;
      seen = { url: req.url, type: req.headers['content-type'], auth: req.headers.authorization, size };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ media: { id: 'AbCdEfGhIj', kind: 'clip', url: '/media/AbCdEfGhIj', size } }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const dir = await tempDir();
    const file = path.join(dir, 'clip.avi');
    await fs.writeFile(file, writeAvi([frame(1), frame(2)], 16, 16, 30));
    try {
      const base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/`;
      const media = await uploadMedia({ server: base, token: 'tok', file, title: 'Mój klip' });
      assert.equal(media.url, `${base.replace(/\/$/, '')}/media/AbCdEfGhIj`);
      assert.equal(seen.type, 'video/x-msvideo');
      assert.equal(seen.auth, 'Bearer tok');
      assert.equal(seen.url, `/v1/media?title=M%C3%B3j+klip`);
      assert.equal(seen.size, (await fs.stat(file)).size);
    } finally {
      server.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('explains an older server without media sharing', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"not_found"}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const dir = await tempDir();
    const file = path.join(dir, 'a.png');
    await fs.writeFile(file, 'png');
    try {
      await assert.rejects(uploadMedia({ server: `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`, token: 't', file }), /nie obsługuje|does not support/);
    } finally {
      server.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
