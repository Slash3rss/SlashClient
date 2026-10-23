import { inflateSync } from 'node:zlib';
import { encodePng } from './png.ts';

/**
 * A partner server's animated icon, which SlashClient HUD draws in place of the server's own icon in
 * the game's server list. The owner uploads an animated GIF (or APNG, or a still GIF/PNG); it is turned
 * here, once, into what the mod can draw cheaply: a square PNG "sprite sheet" with the frames stacked
 * top to bottom (frame 0 on top), plus each frame's delay. No image library: the game cannot read GIFs,
 * and the server keeps no npm dependencies for pictures, so GIF and PNG are decoded by hand.
 */

export interface IconLimits { frames: number; side: number }
export interface Icon { png: Buffer; size: number; delays: number[] }

/** Why an upload was refused; the code goes back to the page as the error. */
export class IconError extends Error {}

// a decompression bomb guard: a tiny file may claim a huge canvas, and every frame is drawn on a
// full canvas; refused before any frame is decoded
const MAX_CANVAS = 1024;
// a GPU texture is at most 16384 pixels tall on many cards; the mod uploads the sheet as one texture
const MAX_SHEET_HEIGHT = 16384;

const bad = (): never => {
  throw new IconError('bad_icon');
};

/** GIF and APNG frame delays, the way browsers play them: "as fast as possible" is 100 ms, nothing under 20 ms. */
function delayOf(ms: number): number {
  return Math.max(20, Math.round(ms <= 10 ? 100 : ms));
}

/** The picture's kind from its first bytes (never from the file's name). */
export function iconType(data: Buffer): 'gif' | 'png' | 'webp' | undefined {
  if (data.length > 6 && (data.toString('latin1', 0, 6) === 'GIF87a' || data.toString('latin1', 0, 6) === 'GIF89a')) return 'gif';
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.length > 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

/**
 * Collects the frames as they are composited: each full canvas is center-cropped to a square and
 * scaled down right away, so a long animation never keeps more than one full canvas in memory.
 */
class Sheet {
  readonly frames: Buffer[] = [];
  readonly delays: number[] = [];
  readonly out: number;
  private readonly crop: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly width: number;
  private readonly limits: IconLimits;

  constructor(width: number, height: number, limits: IconLimits) {
    this.width = width;
    this.limits = limits;
    this.crop = Math.min(width, height);
    this.out = Math.max(1, Math.min(this.crop, limits.side));
    this.x0 = Math.floor((width - this.crop) / 2);
    this.y0 = Math.floor((height - this.crop) / 2);
  }

  /** Throws before the next frame is decoded when it would be one too many. */
  expect(count: number) {
    if (count > this.limits.frames || count * this.out > MAX_SHEET_HEIGHT) throw new IconError('too_many_frames');
  }

  add(canvas: Buffer, delayMs: number) {
    this.expect(this.frames.length + 1);
    this.frames.push(this.cropScale(canvas));
    this.delays.push(delayOf(delayMs));
  }

  /**
   * The square in the middle, scaled down by averaging the area each new pixel covers. Colours are
   * weighted by their alpha, so see-through pixels do not darken the edges of what stays.
   */
  private cropScale(canvas: Buffer): Buffer {
    const { out, crop, x0, y0, width } = this;
    const res = Buffer.alloc(out * out * 4);
    if (out === crop) {
      for (let y = 0; y < out; y++) canvas.copy(res, y * out * 4, ((y0 + y) * width + x0) * 4, ((y0 + y) * width + x0 + out) * 4);
      return res;
    }
    const scale = crop / out;
    for (let oy = 0; oy < out; oy++) {
      const sy0 = oy * scale, sy1 = sy0 + scale;
      for (let ox = 0; ox < out; ox++) {
        const sx0 = ox * scale, sx1 = sx0 + scale;
        let w = 0, a = 0, r = 0, g = 0, b = 0;
        for (let sy = Math.floor(sy0); sy < Math.min(crop, Math.ceil(sy1)); sy++) {
          const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
          for (let sx = Math.floor(sx0); sx < Math.min(crop, Math.ceil(sx1)); sx++) {
            const wt = wy * (Math.min(sx + 1, sx1) - Math.max(sx, sx0));
            const i = ((y0 + sy) * width + x0 + sx) * 4;
            const pa = canvas[i + 3] * wt;
            w += wt;
            a += pa;
            r += canvas[i] * pa;
            g += canvas[i + 1] * pa;
            b += canvas[i + 2] * pa;
          }
        }
        const o = (oy * out + ox) * 4;
        if (a > 0) {
          res[o] = Math.round(r / a);
          res[o + 1] = Math.round(g / a);
          res[o + 2] = Math.round(b / a);
          res[o + 3] = Math.round(a / w);
        }
      }
    }
    return res;
  }

  done(): Icon {
    if (!this.frames.length) bad();
    return { png: encodePng({ width: this.out, height: this.out * this.frames.length, rgba: Buffer.concat(this.frames) }), size: this.out, delays: this.delays };
  }
}

function checkCanvas(width: number, height: number) {
  if (width < 1 || height < 1 || width > MAX_CANVAS || height > MAX_CANVAS) bad();
}

// ---------- GIF ----------

/** GIF's LZW: the colour indexes of one frame, `count` of them (a short stream leaves the rest at 0). */
function lzw(data: Buffer, minCode: number, count: number): Uint8Array {
  if (minCode < 2 || minCode > 8) bad();
  const out = new Uint8Array(count);
  const clear = 1 << minCode, end = clear + 1;
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  let size = minCode + 1, next = end + 1, prev = -1, first = 0;
  let datum = 0, bits = 0, pos = 0, op = 0;
  while (op < count) {
    while (bits < size) {
      if (pos >= data.length) return out;
      datum |= data[pos++] << bits;
      bits += 8;
    }
    const code = datum & ((1 << size) - 1);
    datum >>>= size;
    bits -= size;
    if (code === clear) {
      size = minCode + 1;
      next = end + 1;
      prev = -1;
      continue;
    }
    if (code === end) break;
    if (prev === -1) {
      if (code >= clear) bad();
      out[op++] = code;
      prev = first = code;
      continue;
    }
    if (code > next) bad();
    let sp = 0, c = code;
    if (code === next) {
      stack[sp++] = first;
      c = prev;
    }
    while (c >= clear) {
      if (sp >= 4096) bad();
      stack[sp++] = suffix[c];
      c = prefix[c];
    }
    first = c;
    stack[sp++] = c;
    if (next < 4096) {
      prefix[next] = prev;
      suffix[next] = first;
      next++;
      if (next === 1 << size && size < 12) size++;
    }
    while (sp > 0 && op < count) out[op++] = stack[--sp];
    prev = code;
  }
  return out;
}

function decodeGif(data: Buffer, limits: IconLimits): Icon {
  let at = 6;
  const need = (n: number) => {
    if (at + n > data.length) bad();
  };
  need(7);
  const width = data.readUInt16LE(at), height = data.readUInt16LE(at + 2), flags = data[at + 4];
  at += 7;
  checkCanvas(width, height);
  let globalTable: Buffer | undefined;
  if (flags & 0x80) {
    const n = 3 * (2 << (flags & 7));
    need(n);
    globalTable = data.subarray(at, at + n);
    at += n;
  }
  /** The data sub-blocks that follow, joined. */
  const blocks = (): Buffer => {
    const parts: Buffer[] = [];
    for (;;) {
      need(1);
      const len = data[at++];
      if (!len) return Buffer.concat(parts);
      need(len);
      parts.push(data.subarray(at, at + len));
      at += len;
    }
  };

  const sheet = new Sheet(width, height, limits);
  // browsers start from a see-through canvas (they ignore the GIF's background colour), and so does the mod
  const canvas = Buffer.alloc(width * height * 4);
  let disposal = 0, delay = 0, transparent = -1;
  for (;;) {
    if (at >= data.length) break; // a missing trailer: what was read is kept, like browsers do
    const kind = data[at++];
    if (kind === 0x3b) break;
    if (kind === 0x21) {
      need(1);
      const label = data[at++];
      const body = blocks();
      if (label === 0xf9 && body.length >= 4) {
        disposal = (body[0] >> 2) & 7;
        delay = body.readUInt16LE(1);
        transparent = body[0] & 1 ? body[3] : -1;
      }
      continue;
    }
    if (kind !== 0x2c) bad();
    sheet.expect(sheet.frames.length + 1);
    need(9);
    const left = data.readUInt16LE(at), top = data.readUInt16LE(at + 2), w = data.readUInt16LE(at + 4), h = data.readUInt16LE(at + 6), f = data[at + 8];
    at += 9;
    let table = globalTable;
    if (f & 0x80) {
      const n = 3 * (2 << (f & 7));
      need(n);
      table = data.subarray(at, at + n);
      at += n;
    }
    if (!table) bad();
    need(1);
    const minCode = data[at++];
    const indexes = lzw(blocks(), minCode, w * h);
    const saved = disposal === 3 ? Buffer.from(canvas) : undefined;
    // interlaced frames store rows 0, 8, 16… then 4, 12… then 2, 6… then 1, 3…
    const rows: number[] = [];
    if (f & 0x40) for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < h; y += step) rows.push(y);
    else for (let y = 0; y < h; y++) rows.push(y);
    for (let r = 0; r < h; r++) {
      const cy = top + rows[r];
      if (cy >= height) continue;
      for (let x = 0; x < w; x++) {
        const cx = left + x;
        if (cx >= width) break;
        const index = indexes[r * w + x];
        if (index === transparent || index * 3 + 2 >= table!.length) continue;
        const o = (cy * width + cx) * 4;
        canvas[o] = table![index * 3];
        canvas[o + 1] = table![index * 3 + 1];
        canvas[o + 2] = table![index * 3 + 2];
        canvas[o + 3] = 255;
      }
    }
    // the delay is in hundredths of a second
    sheet.add(canvas, delay * 10);
    if (disposal === 2) {
      for (let y = top; y < Math.min(height, top + h); y++) canvas.fill(0, (y * width + left) * 4, (y * width + Math.min(width, left + w)) * 4);
    } else if (saved) saved.copy(canvas);
    disposal = 0;
    delay = 0;
    transparent = -1;
  }
  return sheet.done();
}

// ---------- PNG and APNG ----------

interface PngHeader { width: number; height: number; depth: number; type: number; palette?: Buffer; trns?: Buffer }

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

/** One (sub)image of a PNG in any of its colour types, as RGBA. */
function pngPixels(z: Buffer, w: number, h: number, hd: PngHeader): Buffer {
  const channels = CHANNELS[hd.type];
  const bitsPerPixel = channels * hd.depth;
  const stride = Math.ceil((w * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  let raw: Buffer;
  try {
    raw = inflateSync(z, { maxOutputLength: (stride + 1) * h + 1 });
  } catch {
    return bad();
  }
  if (raw.length < (stride + 1) * h) bad();
  const rows = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) bad();
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[y * stride + x - bpp] : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? rows[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[y * stride + x] = v & 0xff;
    }
  }
  const max = (1 << hd.depth) - 1;
  /** Sample `n` of a row, as stored (up to 16 bits). */
  const sample = (row: number, n: number): number => {
    if (hd.depth === 8) return rows[row * stride + n];
    if (hd.depth === 16) return rows.readUInt16BE(row * stride + n * 2);
    const bit = n * hd.depth;
    return (rows[row * stride + (bit >> 3)] >> (8 - hd.depth - (bit & 7))) & max;
  };
  const to8 = (v: number) => (hd.depth === 16 ? v >> 8 : hd.depth === 8 ? v : Math.round((v * 255) / max));
  const trnsAt = (i: number) => (hd.trns && hd.trns.length >= i * 2 + 2 ? hd.trns.readUInt16BE(i * 2) : -1);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const s = (k: number) => sample(y, x * channels + k);
      if (hd.type === 3) {
        const i = s(0);
        if (!hd.palette || i * 3 + 2 >= hd.palette.length) bad();
        hd.palette!.copy(out, o, i * 3, i * 3 + 3);
        out[o + 3] = hd.trns && i < hd.trns.length ? hd.trns[i] : 255;
      } else if (hd.type === 0 || hd.type === 4) {
        const g = s(0);
        out[o] = out[o + 1] = out[o + 2] = to8(g);
        out[o + 3] = hd.type === 4 ? to8(s(1)) : g === trnsAt(0) ? 0 : 255;
      } else {
        const r = s(0), g = s(1), b = s(2);
        out[o] = to8(r);
        out[o + 1] = to8(g);
        out[o + 2] = to8(b);
        out[o + 3] = hd.type === 6 ? to8(s(3)) : r === trnsAt(0) && g === trnsAt(1) && b === trnsAt(2) ? 0 : 255;
      }
    }
  }
  return out;
}

interface ApngFrame { w: number; h: number; x: number; y: number; delay: number; dispose: number; blend: number; data: Buffer[] }

function decodePngIcon(data: Buffer, limits: IconLimits): Icon {
  let hd: PngHeader | undefined;
  let animated = false;
  const still: Buffer[] = [];
  const frames: ApngFrame[] = [];
  let current: ApngFrame | undefined;
  let sheet: Sheet | undefined;
  for (let at = 8; at < data.length;) {
    if (at + 12 > data.length) bad();
    const length = data.readUInt32BE(at);
    if (at + 12 + length > data.length) bad();
    const kind = data.toString('latin1', at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + length);
    at += 12 + length;
    if (kind === 'IHDR') {
      if (body.length < 13) bad();
      hd = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], type: body[9] };
      checkCanvas(hd.width, hd.height);
      if (!DEPTHS[hd.type]?.includes(hd.depth)) bad();
      // interlaced (Adam7) PNGs are rare for icons; refusing them keeps this decoder small
      if (body[12] !== 0) bad();
      sheet = new Sheet(hd.width, hd.height, limits);
    } else if (!hd || !sheet) {
      bad();
    } else if (kind === 'PLTE') hd.palette = body;
    else if (kind === 'tRNS') hd.trns = body;
    else if (kind === 'acTL') {
      animated = true;
      if (body.length < 8) bad();
      sheet.expect(body.readUInt32BE(0));
    } else if (kind === 'fcTL') {
      if (body.length < 26) bad();
      sheet.expect(frames.length + 1);
      const den = body.readUInt16BE(22) || 100;
      current = { w: body.readUInt32BE(4), h: body.readUInt32BE(8), x: body.readUInt32BE(12), y: body.readUInt32BE(16), delay: (body.readUInt16BE(20) * 1000) / den, dispose: body[24], blend: body[25], data: [] };
      if (current.w < 1 || current.h < 1 || current.x + current.w > hd.width || current.y + current.h > hd.height) bad();
      frames.push(current);
    } else if (kind === 'IDAT') {
      // with an fcTL before it, the default image is the first frame; otherwise it is not part of the animation
      if (current) current.data.push(body);
      else still.push(body);
    } else if (kind === 'fdAT') {
      if (!current || body.length < 4) bad();
      current!.data.push(body.subarray(4));
    } else if (kind === 'IEND') break;
  }
  if (!hd || !sheet) return bad();
  const { width, height } = hd;
  // a plain PNG, or an APNG whose animation is missing: its one picture
  if (!animated || !frames.length) {
    if (!still.length) bad();
    sheet.add(pngPixels(Buffer.concat(still), width, height, hd), 100);
    return sheet.done();
  }
  const canvas = Buffer.alloc(width * height * 4);
  frames.forEach((f, n) => {
    if (!f.data.length) bad();
    const pixels = pngPixels(Buffer.concat(f.data), f.w, f.h, hd!);
    // "previous" on the first frame means "clear", as the APNG spec says
    const dispose = n === 0 && f.dispose === 2 ? 1 : f.dispose;
    const saved = dispose === 2 ? Buffer.from(canvas) : undefined;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const s = (y * f.w + x) * 4, o = ((f.y + y) * width + f.x + x) * 4;
        if (f.blend === 0) {
          pixels.copy(canvas, o, s, s + 4);
          continue;
        }
        // "over": the frame's pixel on top of what the canvas shows
        const sa = pixels[s + 3] / 255, da = canvas[o + 3] / 255;
        const oa = sa + da * (1 - sa);
        if (oa <= 0) continue;
        for (let k = 0; k < 3; k++) canvas[o + k] = Math.round((pixels[s + k] * sa + canvas[o + k] * da * (1 - sa)) / oa);
        canvas[o + 3] = Math.round(oa * 255);
      }
    }
    sheet!.add(canvas, f.delay);
    if (dispose === 1) for (let y = f.y; y < f.y + f.h; y++) canvas.fill(0, (y * width + f.x) * 4, (y * width + f.x + f.w) * 4);
    else if (saved) saved.copy(canvas);
  });
  return sheet.done();
}

/**
 * An uploaded picture as the mod's sprite sheet. Throws IconError: 'bad_icon' (not a GIF or PNG, or
 * broken), 'webp_unsupported' (animated WebP needs a VP8 decoder, which is not worth it here) or
 * 'too_many_frames'.
 */
export function makeIcon(data: Buffer, limits: IconLimits): Icon {
  const type = iconType(data);
  if (type === 'webp') throw new IconError('webp_unsupported');
  if (type === 'gif') return decodeGif(data, limits);
  if (type === 'png') return decodePngIcon(data, limits);
  return bad();
}
