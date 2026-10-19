import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Trimming the game's clips. A clip is an AVI with one Motion-JPEG stream (hud AviWriter.java):
 * every frame is a whole JPEG, so a trimmed copy is just the chosen frames written into a new
 * AVI, byte for byte. Nothing is decoded or encoded again, so there is no quality loss, no
 * ffmpeg to ship and the cut is exact to the frame. The same index serves the trim window's
 * preview: it asks for single frames (as JPEG pictures) through the slash-media protocol.
 */

export interface ClipIndex {
  width: number;
  height: number;
  /** Microseconds per frame, from the main header. */
  usPerFrame: number;
  /** The video stream's codec ("MJPG" for the game's clips). */
  handler: string;
  /** Where each frame's JPEG is in the file. */
  frames: { offset: number; length: number }[];
}

const MAX_FRAMES = 100_000;

/** The frames of an AVI, in file order; undefined when the data is not one with a video stream. */
export function parseAvi(buf: Buffer): ClipIndex | undefined {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'AVI ') return undefined;
  const clip: ClipIndex = { width: 0, height: 0, usPerFrame: 0, handler: '', frames: [] };
  const walk = (start: number, end: number, inMovi: boolean) => {
    let at = start;
    while (at + 8 <= end && clip.frames.length < MAX_FRAMES) {
      const id = buf.toString('latin1', at, at + 4);
      const size = buf.readUInt32LE(at + 4);
      const data = at + 8;
      // a clip cut short (the game closed while saving): the frames before the broken one stay
      const cut = data + size > end;
      if (id === 'LIST' && size >= 4) {
        const type = buf.toString('latin1', data, data + 4);
        if (type === 'hdrl' || type === 'strl' || type === 'movi' || type === 'rec ') walk(data + 4, Math.min(data + size, end), inMovi || type === 'movi');
      } else if (cut) return;
      else if (id === 'avih' && size >= 40) {
        clip.usPerFrame = buf.readUInt32LE(data);
        clip.width = buf.readUInt32LE(data + 32);
        clip.height = buf.readUInt32LE(data + 36);
      } else if (id === 'strh' && size >= 8 && !clip.handler && buf.toString('latin1', data, data + 4) === 'vids') {
        clip.handler = buf.toString('latin1', data + 4, data + 8);
      } else if (inMovi && (id === '00dc' || id === '00db') && size > 0) {
        clip.frames.push({ offset: data, length: size });
      }
      at = data + size + (size & 1);
    }
  };
  walk(12, Math.min(buf.length, 8 + buf.readUInt32LE(4)), false);
  return clip.frames.length ? clip : undefined;
}

export const fpsOf = (clip: Pick<ClipIndex, 'usPerFrame'>) => (clip.usPerFrame > 0 && clip.usPerFrame < 10_000_000 ? 1_000_000 / clip.usPerFrame : 30);

/** An AVI with one Motion-JPEG stream, laid out like the game writes it (AviWriter.java). */
export function writeAvi(frames: Buffer[], width: number, height: number, fps: number): Buffer {
  const n = frames.length;
  const biggest = frames.reduce((m, f) => Math.max(m, f.length), 0);
  const moviData = frames.reduce((sum, f) => sum + 8 + f.length + (f.length & 1), 0);
  const strl = 4 + (8 + 56) + (8 + 40);
  const hdrl = 4 + (8 + 56) + (8 + strl);
  const movi = 4 + moviData;
  const riff = 4 + (8 + hdrl) + (8 + movi) + (8 + 16 * n);
  if (riff > 0xffffffff) throw new Error('clip too large');

  const head = Buffer.alloc(8 + 4 + 8 + hdrl + 12);
  let at = 0;
  const tag = (s: string) => {
    head.write(s, at, 'latin1');
    at += 4;
  };
  const u32 = (v: number) => {
    head.writeUInt32LE(v >>> 0, at);
    at += 4;
  };
  const u16 = (v: number) => {
    head.writeUInt16LE(v & 0xffff, at);
    at += 2;
  };
  tag('RIFF'); u32(riff); tag('AVI ');
  tag('LIST'); u32(hdrl); tag('hdrl');
  tag('avih'); u32(56);
  u32(Math.round(1_000_000 / fps)); // microseconds per frame
  u32(Math.min(0x7fffffff, biggest * Math.round(fps)));
  u32(0); u32(0x10); // has an index
  u32(n); u32(0); u32(1); u32(biggest); u32(width); u32(height);
  u32(0); u32(0); u32(0); u32(0);
  tag('LIST'); u32(strl); tag('strl');
  tag('strh'); u32(56); tag('vids'); tag('MJPG');
  u32(0); u16(0); u16(0); u32(0);
  u32(1000); u32(Math.round(fps * 1000)); // scale, rate: rate / scale = frames per second
  u32(0); u32(n); u32(biggest); u32(0xffffffff); u32(0);
  u16(0); u16(0); u16(width); u16(height);
  tag('strf'); u32(40); u32(40); u32(width); u32(height);
  u16(1); u16(24); tag('MJPG'); u32(width * height * 3);
  u32(0); u32(0); u32(0); u32(0);
  tag('LIST'); u32(movi); tag('movi');

  const parts: Buffer[] = [head];
  const idx = Buffer.alloc(8 + 16 * n);
  idx.write('idx1', 0, 'latin1');
  idx.writeUInt32LE(16 * n, 4);
  let offset = 4; // from the "movi" name
  frames.forEach((f, i) => {
    const chunk = Buffer.alloc(8);
    chunk.write('00dc', 0, 'latin1');
    chunk.writeUInt32LE(f.length, 4);
    parts.push(chunk, f);
    if (f.length & 1) parts.push(Buffer.alloc(1));
    idx.write('00dc', 8 + 16 * i, 'latin1');
    idx.writeUInt32LE(0x10, 12 + 16 * i);
    idx.writeUInt32LE(offset, 16 + 16 * i);
    idx.writeUInt32LE(f.length, 20 + 16 * i);
    offset += 8 + f.length + (f.length & 1);
  });
  parts.push(idx);
  return Buffer.concat(parts);
}

/** What the trim window needs to know about a clip. */
export interface ClipInfo { frames: number; fps: number; width: number; height: number; durationMs: number; trimmable: boolean }

/** Indexes of recently opened clips: the preview asks for many frames of the same one. */
const cache = new Map<string, { key: string; index: ClipIndex }>();

export async function clipIndex(file: string): Promise<ClipIndex | undefined> {
  const st = await fs.stat(file);
  const key = `${st.size}:${st.mtimeMs}`;
  const hit = cache.get(file);
  if (hit?.key === key) return hit.index;
  const index = parseAvi(await fs.readFile(file));
  if (!index) return undefined;
  cache.delete(file);
  cache.set(file, { key, index });
  while (cache.size > 4) cache.delete(cache.keys().next().value!);
  return index;
}

export async function clipInfo(file: string): Promise<ClipInfo> {
  const index = /\.avi$/i.test(file) ? await clipIndex(file) : undefined;
  if (!index) return { frames: 0, fps: 0, width: 0, height: 0, durationMs: 0, trimmable: false };
  const fps = fpsOf(index);
  return {
    frames: index.frames.length, fps, width: index.width, height: index.height,
    durationMs: Math.round((index.frames.length * 1000) / fps), trimmable: index.handler.toUpperCase() === 'MJPG',
  };
}

/** One frame of a clip as a JPEG picture, for the preview. */
export async function clipFrame(file: string, frame: number): Promise<Buffer | undefined> {
  const index = await clipIndex(file);
  const f = index?.frames[Math.max(0, Math.min(index.frames.length - 1, Math.floor(frame)))];
  if (!f) return undefined;
  const handle = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(f.length);
    await handle.read(buf, 0, f.length, f.offset);
    return buf;
  } finally {
    await handle.close();
  }
}

/** A free name next to the clip for its trimmed copy: clip-…-trim.avi, clip-…-trim2.avi… */
export async function trimmedName(dir: string, name: string): Promise<string> {
  const base = name.replace(/\.avi$/i, '').replace(/-trim\d*$/, '');
  for (let i = 1; ; i++) {
    const candidate = `${base}-trim${i > 1 ? i : ''}.avi`;
    if (!(await fs.access(path.join(dir, candidate)).then(() => true, () => false))) return candidate;
  }
}

/**
 * Writes frames [start, end] (inclusive) of a clip as a new clip next to it and returns its
 * name. The original stays as it is.
 */
export async function trimClip(file: string, start: number, end: number): Promise<string> {
  const data = await fs.readFile(file);
  const index = parseAvi(data);
  if (!index || index.handler.toUpperCase() !== 'MJPG') throw new Error('not an MJPEG clip');
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(index.frames.length - 1, Math.floor(end));
  if (to - from < 1) throw new Error('too short');
  const frames = index.frames.slice(from, to + 1).map((f) => data.subarray(f.offset, f.offset + f.length));
  const dir = path.dirname(file);
  const name = await trimmedName(dir, path.basename(file));
  const out = path.join(dir, name);
  // written aside and moved in, so the gallery never lists half a clip
  await fs.writeFile(`${out}.part`, writeAvi(frames, index.width, index.height, fpsOf(index)));
  await fs.rename(`${out}.part`, out);
  return name;
}
