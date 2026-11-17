import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { clipFrames, saveWebm, webmName, writeAvi } from '../src/main/clipTrim';
import { EBML_IDS as ID, muxWebm, readEbml, vint, type EbmlNode } from '../src/shared/webm';
import { DISCORD_BYTES, fitSize, webmPlan } from '../src/renderer/clipWebm';

const find = (nodes: EbmlNode[] | undefined, id: number) => nodes?.find((n) => n.id === id);
const all = (nodes: EbmlNode[] | undefined, id: number) => nodes?.filter((n) => n.id === id) ?? [];
const uintAt = (buf: Uint8Array, n: EbmlNode) => {
  let v = 0;
  for (let i = 0; i < n.size; i++) v = v * 256 + buf[n.dataStart + i];
  return v;
};

/** 3 seconds at 30 fps, a key frame every second. */
const chunks = Array.from({ length: 90 }, (_, i) => ({ data: new Uint8Array(100 + (i % 7)).fill(i), timestamp: Math.round((i * 1_000_000) / 30), key: i % 30 === 0 }));

describe('WebM writer', () => {
  it('writes sizes as EBML numbers', () => {
    assert.deepEqual([...vint(0)], [0x80]);
    assert.deepEqual([...vint(126)], [0xfe]);
    // 127 would be all ones (unknown size), so it takes two bytes
    assert.deepEqual([...vint(127)], [0x40, 0x7f]);
    assert.deepEqual([...vint(5, 8)], [0x01, 0, 0, 0, 0, 0, 0, 5]);
  });

  it('writes a WebM the reader walks: header, track, clusters at key frames, cues', () => {
    const webm = muxWebm({ codec: 'V_VP9', width: 1280, height: 720, frameDuration: 1_000_000 / 30 }, chunks);
    const top = readEbml(webm);
    assert.deepEqual(top.map((n) => n.id), [ID.EBML, ID.Segment]);
    const doc = find(top[0].children, ID.DocType)!;
    assert.equal(Buffer.from(webm.subarray(doc.dataStart, doc.dataStart + doc.size)).toString(), 'webm');
    const seg = top[1];
    // the segment covers the rest of the file exactly
    assert.equal(seg.dataStart + seg.size, webm.length);
    const entry = find(find(seg.children, ID.Tracks)?.children, ID.TrackEntry)!;
    const codec = find(entry.children, ID.CodecID)!;
    assert.equal(Buffer.from(webm.subarray(codec.dataStart, codec.dataStart + codec.size)).toString(), 'V_VP9');
    const video = find(entry.children, ID.Video)!;
    assert.equal(uintAt(webm, find(video.children, ID.PixelWidth)!), 1280);
    assert.equal(uintAt(webm, find(video.children, ID.PixelHeight)!), 720);
    const info = find(seg.children, ID.Info)!;
    const dur = find(info.children, ID.Duration)!;
    assert.equal(new DataView(webm.buffer, webm.byteOffset + dur.dataStart, 8).getFloat64(0), 3000);

    const clusters = all(seg.children, ID.Cluster);
    assert.equal(clusters.length, 3);
    const blocks = clusters.flatMap((c) => all(c.children, ID.SimpleBlock));
    assert.equal(blocks.length, 90);
    // every frame's bytes are there, in order, key frames marked
    blocks.forEach((b, i) => {
      assert.equal(webm[b.dataStart], 0x81);
      assert.equal(webm[b.dataStart + 3] & 0x80 ? 1 : 0, i % 30 === 0 ? 1 : 0);
      assert.deepEqual(webm.subarray(b.dataStart + 4, b.dataStart + b.size), chunks[i].data);
    });
    assert.deepEqual(clusters.map((c) => uintAt(webm, find(c.children, ID.Timestamp)!)), [0, 1000, 2000]);

    // the seek head and the cues point at the right elements
    const seekTo = (id: number) => {
      const s = all(find(seg.children, ID.SeekHead)?.children, ID.Seek).find((x) => uintAt(webm, find(x.children, ID.SeekID)!) === id)!;
      return seg.dataStart + uintAt(webm, find(s.children, ID.SeekPosition)!);
    };
    assert.equal(seekTo(ID.Info), info.start);
    assert.equal(seekTo(ID.Cues), find(seg.children, ID.Cues)!.start);
    const points = all(find(seg.children, ID.Cues)?.children, ID.CuePoint);
    assert.deepEqual(points.map((p) => seg.dataStart + uintAt(webm, find(find(p.children, ID.CueTrackPositions)?.children, ID.CueClusterPosition)!)), clusters.map((c) => c.start));
  });

  it('refuses a stream that does not start with a key frame', () => {
    assert.throws(() => muxWebm({ codec: 'V_VP8', width: 2, height: 2, frameDuration: 33_333 }, [{ ...chunks[1] }]));
  });
});

describe('WebM size plan', () => {
  it('fits 30 s for Discord under its limit and never makes the picture bigger', () => {
    const plan = webmPlan(1920, 1080, 30_000, 'discord');
    assert.equal(plan.maxBytes, DISCORD_BYTES);
    assert.ok((plan.bitrate / 8) * 30 < DISCORD_BYTES * 0.9);
    assert.deepEqual([plan.width, plan.height], [1280, 720]);
    // a long clip gets a smaller picture
    assert.deepEqual(fitSize(1920, 1080, 854, 480).map((n) => n % 2), [0, 0]);
    assert.equal(webmPlan(1920, 1080, 120_000, 'discord').height, 480);
    assert.deepEqual(fitSize(640, 361, 1280, 720), [640, 362]);
    assert.equal(webmPlan(2560, 1440, 30_000, 'high').width, 1920);
  });
});

describe('WebM next to a clip', () => {
  it('reads runs of frames and saves without touching the clip or other files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-webm-'));
    const frames = [1, 2, 3, 4].map((i) => Buffer.from([0xff, 0xd8, i, i, 0xff, 0xd9]));
    const clip = path.join(dir, 'clip-1.avi');
    await fs.writeFile(clip, writeAvi(frames, 4, 4, 30));
    assert.deepEqual(await clipFrames(clip, 1, 2), [frames[1], frames[2]]);
    assert.deepEqual(await clipFrames(clip, 3, 10), [frames[3]]);

    const webm = muxWebm({ codec: 'V_VP8', width: 4, height: 4, frameDuration: 33_333 }, chunks.slice(0, 3));
    assert.equal(await saveWebm(clip, webm, false), 'clip-1.webm');
    assert.equal(await saveWebm(clip, webm, false), 'clip-1-2.webm');
    assert.equal(await saveWebm(clip, webm, true), 'clip-1-trim.webm');
    // a trimmed clip keeps one -trim; the name is taken, so the next one
    assert.equal(await webmName(dir, 'clip-1-trim.avi', true), 'clip-1-trim-2.webm');
    await assert.rejects(saveWebm(clip, new Uint8Array(100), false));
    const names = (await fs.readdir(dir)).sort();
    assert.deepEqual(names, ['clip-1-2.webm', 'clip-1-trim.webm', 'clip-1.avi', 'clip-1.webm']);
    assert.deepEqual(await fs.readFile(path.join(dir, 'clip-1.webm')), Buffer.from(webm));
    await fs.rm(dir, { recursive: true, force: true });
  });
});
