import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Just enough PNG for Minecraft skins: reading 8-bit RGB or RGBA pictures (what Mojang serves),
 * and writing RGBA ones. Used to cut a player's face out of their skin for avatars.
 */

export interface Picture { width: number; height: number; rgba: Buffer }

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(data: Buffer): Picture {
  if (!data.subarray(0, 8).equals(SIGNATURE)) throw new Error('not_png');
  let width = 0, height = 0, type = 0, depth = 0, interlace = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at + 8 <= data.length;) {
    const length = data.readUInt32BE(at);
    const kind = data.toString('latin1', at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    at += 12 + length;
  }
  if (depth !== 8 || (type !== 6 && type !== 2) || interlace !== 0 || width < 1 || height < 1 || width > 1024 || height > 1024) throw new Error('unsupported_png');
  const channels = type === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('short_png');
  const rows = Buffer.alloc(stride * height);
  // undo each row's filter, against the row above
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels] : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
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
  if (channels === 4) return { width, height, rgba: rows };
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rows.copy(rgba, i * 4, i * 3, i * 3 + 3);
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(data: Buffer): number {
  let c = -1;
  for (const byte of data) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
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

export function encodePng({ width, height, rgba }: Picture): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * A player's face from their skin (64×64 or the old 64×32), with the hat layer over it where it
 * is not see-through, each pixel `scale` times larger: the avatar of a SlashClient account.
 */
export function faceOf(skin: Picture, scale = 8): Picture {
  const unit = skin.width / 64;
  const size = 8 * scale;
  const out = Buffer.alloc(size * size * 4);
  const pixel = (x: number, y: number) => {
    const sx = Math.floor(x * unit), sy = Math.floor(y * unit);
    const i = (sy * skin.width + sx) * 4;
    return skin.rgba.subarray(i, i + 4);
  };
  // old 64×32 skins: a hat area with no see-through pixel is no hat at all (the game ignores it too,
  // or many old skins would wear a black or white box on their heads)
  let hatShown = true;
  if (skin.height * 2 === skin.width) {
    hatShown = false;
    for (let y = 0; y < 16 && !hatShown; y++) for (let x = 32; x < 64; x++) if (pixel(x, y)[3] < 128) { hatShown = true; break; }
  }
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const face = pixel(8 + x, 8 + y);
      const hat = pixel(40 + x, 8 + y);
      // the hat over the face; a face without its own alpha is opaque
      const a = hatShown ? hat[3] / 255 : 0;
      const rgb = [0, 1, 2].map((c) => Math.round(hat[c] * a + face[c] * (1 - a)));
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const o = ((y * scale + dy) * size + x * scale + dx) * 4;
          out[o] = rgb[0];
          out[o + 1] = rgb[1];
          out[o + 2] = rgb[2];
          out[o + 3] = 255;
        }
      }
    }
  }
  return { width: size, height: size, rgba: out };
}
