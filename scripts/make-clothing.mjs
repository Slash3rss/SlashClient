// Paints the SlashClient clothing (hats and tops, src/shared/clothing.ts) and writes it for the mod:
//   hud/src/main/resources/assets/slashclient-hud/textures/clothing/<id>.png       the picture on the boxes
//   hud/src/main/resources/assets/slashclient-hud/textures/clothing/icon/<id>.png  a small view of it for the menus
//   hud/src/main/resources/assets/slashclient-hud/clothing.json                    the boxes, with where their pictures are
// (build.mjs copies the pictures to the launcher and the website.) Run with: node scripts/make-clothing.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { CLOTHING, CLOTHING_SCALE as K, CLOTHING_TEXTURE, boxQuads, layout, slimBox } from '../src/shared/clothing.ts';
import { headwearPaint } from './paint-headwear.mjs';

const assets = 'hud/src/main/resources/assets/slashclient-hud';
const [TW, TH] = CLOTHING_TEXTURE;
const ICON = 64;
/** Where the parts the boxes hang on are, in the player model (the neck is 0). */
const BONES = { head: [0, 0, 0], body: [0, 0, 0], right_arm: [-5, 2, 0], left_arm: [5, 2, 0] };

// ---------- PNG ----------

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- colours ----------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (c, f) => c.map((x) => Math.max(0, Math.min(255, Math.round(x * f))));
/** The same small unevenness for the same model pixel every time (painted cloth and metal are never flat). */
function grain(seed, x, y) {
  let h = (seed * 374761393 + x * 668265263 + y * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) & 0xffff) / 0xffff;
}

/**
 * How each item is painted: called for every texel of every face with
 * { box (its index), face, x, y (texel in the face, from its top left as it appears in the
 * picture), w, h (the face's size in texels), px, py (the model pixel) } → [r, g, b] or null (see-through).
 */
const PAINT = {
  tophat({ box, face, y, h, px, py }) {
    const black = shade(hex('#1c1c24'), 0.92 + grain(1, px, py) * 0.16);
    // a red band just above the brim, on the crown's sides
    if (box === 1 && isSide(face) && y >= h - 2 * K && y < h - K / 2) return shade(hex('#b3202a'), 0.9 + grain(2, px, 0) * 0.15);
    if (box === 1 && face === 'down') return shade(black, 1.15);
    return black;
  },
  crown({ face, x, y, w, h, px, py }) {
    if (face === 'down' || face === 'up') return null;
    const gold = shade(hex('#f2c230'), 0.88 + grain(3, px, py) * 0.18);
    // four points along the top of each side
    const spike = 2 * K;
    if (y < 2 * K) {
      const xm = (x % spike) - (spike - 1) / 2;
      if (Math.abs(xm) > (y + 1) / 2) return null;
      if (y < K / 2 + 1 && Math.abs(xm) < K / 2) return hex('#fff3b0');
    }
    // a dark rim along the bottom, a ruby in the middle of each side and sapphires by it
    if (y >= h - K) return shade(gold, 0.72);
    const gx = x + 0.5, gy = y + 0.5 - (h - 1.5 * K);
    if (Math.abs(gy) < K / 2 && Math.abs(gx - w / 2) < K / 2) return Math.abs(gy) < K / 4 && Math.abs(gx - w / 2) < K / 4 ? hex('#ff6b7a') : hex('#c0142c');
    if (Math.abs(gy) < K / 2 - 0.5 && (Math.abs(gx - w / 8) < K / 2 - 0.5 || Math.abs(gx - (7 * w) / 8) < K / 2 - 0.5)) return hex('#2f6bea');
    return gold;
  },
  cap({ box, face, x, y, w, h, px, py }) {
    const red = shade(hex('#d42a3c'), 0.9 + grain(4, px, py) * 0.14);
    if (box === 1) return face === 'down' ? shade(red, 1.08) : face === 'up' ? hex('#3a0d14') : shade(red, 0.82);
    if (face === 'up') return hex('#3a0d14');
    // a button on top, the SlashClient slash on the front
    if (face === 'down' && Math.abs(x - w / 2) < K && Math.abs(y - h / 2) < K) return hex('#f4f4f4');
    if (face === 'north' && y >= K && y < h - K / 2) {
      const sx = (x - w / 2) + (y - h / 2) * 0.6;
      if (Math.abs(sx) < K * 0.75) return hex('#f4f4f4');
    }
    return red;
  },
  headphones({ box, face, x, y, w, h, px, py }) {
    const dark = shade(hex('#2a2d36'), 0.9 + grain(5, px, py) * 0.18);
    if (box < 3) return box === 0 && face === 'down' ? shade(dark, 1.3) : dark;
    // the cups: a blue ring on the outer side, padding towards the head
    const outer = box === 3 ? 'west' : 'east';
    if (face === outer) {
      const r = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) / (Math.min(w, h) / 2);
      if (r < 0.35) return hex('#93c5fd');
      if (r < 0.75) return hex('#3b82f6');
      return dark;
    }
    if (face === (box === 3 ? 'east' : 'west')) return hex('#15161b');
    return dark;
  },
  beanie({ box, face, x, y, h, px, py }) {
    if (box === 1) return shade(hex('#f1ece0'), 0.86 + grain(6, px, py) * 0.2);
    if (face === 'up') return hex('#123b36');
    // knitted ribs (every other column darker), a turned-up cuff along the bottom
    const teal = hex('#2f8f83');
    const rib = Math.floor(x / (K / 2)) % 2 ? 0.86 : 1;
    if (isSide(face) && y >= h - 1.5 * K) return shade(hex('#e8c25a'), rib * (0.92 + grain(7, px, py) * 0.12));
    return shade(teal, rib * (0.9 + grain(8, px, py) * 0.14));
  },
  wizard({ box, face, y, h, px, py, x }) {
    const purple = shade(hex('#3b2a8a'), 0.88 + grain(9, px, py) * 0.18);
    // a golden band round the bottom of the hat, little stars on it
    if (box === 1 && isSide(face) && y >= h - K) return hex('#e8b923');
    if (face !== 'up' && grain(10 + box, Math.floor(x / 2), Math.floor(y / 2)) > 0.965) return hex('#ffe680');
    return face === 'up' ? shade(purple, 0.6) : purple;
  },
  halo({ face, x, y, w, h }) {
    const ring = x < K || y < K || x >= w - K || y >= h - K;
    if ((face === 'down' || face === 'up') && !ring) return null;
    return shade(hex('#ffe680'), 0.92 + (Math.sin(x * 0.7 + y * 0.3) + 1) * 0.05);
  },
  scarf({ box, face, x, y, h, px, py }) {
    const red = hex('#c62f3a'), cream = hex('#f2ece0');
    const f = 0.9 + grain(11, px, py) * 0.14;
    if (face === 'up' && box === 0) return shade(red, 0.5);
    if (box === 1) {
      // the end hangs down: stripes across it, a fringe at the bottom
      if (y >= h - K && Math.floor(x / (K / 2)) % 2) return null;
      return shade(Math.floor(y / K) % 2 ? cream : red, f);
    }
    return shade(Math.floor(x / K) % 2 ? cream : red, f);
  },
  bowtie({ box, face, px, py }) {
    const red = hex('#b0182c');
    if (box === 2) return shade(red, 0.72);
    return shade(red, (face === 'north' ? 1 : 0.85) * (0.9 + grain(12, px, py) * 0.14));
  },
  tie({ box, face, x, y, w, h, px, py }) {
    const navy = shade(hex('#1e3a8a'), 0.9 + grain(13, px, py) * 0.12);
    if (box === 0) return shade(navy, 0.8);
    // the point at the bottom
    if ((face === 'north' || face === 'south') && y >= h - K && Math.abs(x + 0.5 - w / 2) > (h - y) * (w / 2) / K) return null;
    if ((x + y) % (2 * K) < K / 2) return hex('#d4a72c');
    return navy;
  },
  medal({ box, face, x, y, w, h, px, py }) {
    if (box < 2) {
      if (face === 'up') return hex('#14306e');
      // a blue ribbon with a white stripe along it
      const along = box === 0 ? y : x;
      const across = box === 0 ? h : w;
      return Math.abs(along + 0.5 - across / 2) < K / 4 + 0.5 ? hex('#f4f4f4') : shade(hex('#2563eb'), 0.9 + grain(14, px, py) * 0.12);
    }
    const gold = shade(hex('#f2c230'), 0.9 + grain(15, px, py) * 0.14);
    if (face !== 'north') return shade(gold, 0.8);
    // a rim, and a star in the middle
    if (x < K / 2 || y < K / 2 || x >= w - K / 2 || y >= h - K / 2) return shade(gold, 0.7);
    const dx = Math.abs(x + 0.5 - w / 2), dy = y + 0.5 - h / 2;
    if (dx + Math.abs(dy) * 0.5 < K * 0.6 || (Math.abs(dy + K * 0.2) < K * 0.25 && dx < K * 1.1)) return hex('#fff3b0');
    return gold;
  },
  jacket({ box, face, x, y, w, h, px, py }) {
    const blue = shade(hex('#1f3b73'), 0.9 + grain(16, px, py) * 0.12);
    const band = shade(hex('#15284f'), Math.floor(x / (K / 2)) % 2 ? 0.9 : 1);
    if (box === 0) {
      if (face === 'up') return shade(hex('#15284f'), 0.8);
      // a ribbed hem, a zip down the front, two pockets
      if (isSide(face) && y >= h - K) return band;
      if (face === 'north') {
        if (Math.abs(x + 0.5 - w / 2) < K / 4 + 0.5) return hex('#c7ccd6');
        if (y >= 7 * K && y < 9 * K && ((x >= K && x < 3 * K) || (x >= w - 3 * K && x < w - K))) return y < 7 * K + 2 ? hex('#0f1f40') : shade(blue, 0.88);
        // the collar, turned down on both sides of the zip
        if (y < 1.5 * K && Math.abs(x + 0.5 - w / 2) < 2.5 * K) return shade(hex('#2c4f94'), 1);
      }
      return blue;
    }
    // the sleeves: a ribbed cuff, dark inside
    if (face === 'up') return hex('#0b1530');
    if (isSide(face) && y >= h - K) return band;
    return blue;
  },
};
const isSide = (face) => face === 'north' || face === 'south' || face === 'east' || face === 'west';
// the face and ears slots
Object.assign(PAINT, headwearPaint({ hex, shade, grain, isSide, K }));

// ---------- the pictures ----------

const out = path.join(assets, 'textures', 'clothing');
mkdirSync(path.join(out, 'icon'), { recursive: true });
const items = [];
for (const item of CLOTHING) {
  const paint = PAINT[item.id];
  if (!paint) throw new Error(`No paint for ${item.id}`);
  const W = TW * K, H = TH * K;
  const tex = Buffer.alloc(W * H * 4);
  const uvs = layout(item);
  item.boxes.forEach((b, box) => {
    for (const q of boxQuads(b, uvs[box])) {
      // the face's region in the picture (its corners' u, v)
      const us = q.corners.map((c) => c[3] * W), vs = q.corners.map((c) => c[4] * H);
      const u0 = Math.round(Math.min(...us)), u1 = Math.round(Math.max(...us));
      const v0 = Math.round(Math.min(...vs)), v1 = Math.round(Math.max(...vs));
      for (let ty = v0; ty < v1; ty++) for (let tx = u0; tx < u1; tx++) {
        const x = tx - u0, y = ty - v0;
        const c = paint({ box, face: q.face, x, y, w: u1 - u0, h: v1 - v0, px: Math.floor(tx / K), py: Math.floor(ty / K) });
        if (!c) continue;
        const i = (ty * W + tx) * 4;
        tex[i] = c[0];
        tex[i + 1] = c[1];
        tex[i + 2] = c[2];
        tex[i + 3] = 255;
      }
    }
  });
  writeFileSync(path.join(out, `${item.id}.png`), png(W, H, tex));
  writeFileSync(path.join(out, 'icon', `${item.id}.png`), png(ICON, ICON, icon(item, uvs, tex, W, H)));
  items.push({
    id: item.id,
    slot: item.slot,
    boxes: item.boxes.map((b, i) => {
      const slim = slimBox(b);
      return { bone: b.bone, from: b.from, size: b.size, inflate: b.inflate ?? 0, uv: uvs[i], ...(slim !== b ? { slimFrom: slim.from, slimSize: slim.size } : {}),
        ...(b.pivot ? { pivot: b.pivot, rotate: b.rotate ?? [0, 0, 0] } : {}), ...(b.twitch ? { twitch: b.twitch } : {}), ...(b.hats ? { hats: b.hats } : {}) };
    }),
    ...(item.underHelmet ? { underHelmet: true } : {}),
  });
}
// one line per item, for readable diffs
writeFileSync(path.join(assets, 'clothing.json'), `{"texture": ${JSON.stringify(CLOTHING_TEXTURE)}, "items": [\n${items.map((i) => `\t${JSON.stringify(i)}`).join(',\n')}\n]}\n`);
console.log(`${items.length} clothing items -> ${out}`);

// ---------- the icons: the item seen from the front, a little from above and the side ----------

/** A corner of a box that turns on a pivot (`rotate`, degrees), turned as the game turns a part: x first, then y, then z. */
function turned(box, c) {
  if (!box.pivot) return c;
  const [rx, ry, rz] = (box.rotate ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  let [x, y, z] = [c[0] - box.pivot[0], c[1] - box.pivot[1], c[2] - box.pivot[2]];
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return [x + box.pivot[0], y + box.pivot[1], z + box.pivot[2], c[3], c[4]];
}

function icon(item, uvs, tex, W, H) {
  // oblique view: the further back, the higher and more to the right
  const A = 0.45;
  const project = ([x, y, z]) => [x + A * z, y - A * z, z];
  // (without the straps round the head of masks and goggles: they would hide the face)
  const quads = item.boxes.flatMap((b, i) => (item.slot === 'face' && b.inflate ? [] : boxQuads(b, uvs[i])).map((q) => ({
    face: q.face,
    corners: q.corners.map((c) => turned(b, c)).map((c) => [...project([c[0] + BONES[b.bone][0], c[1] + BONES[b.bone][1], c[2] + BONES[b.bone][2]]), c[3], c[4]]),
  })));
  const xs = quads.flatMap((q) => q.corners.map((c) => c[0])), ys = quads.flatMap((q) => q.corners.map((c) => c[1]));
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  const s = (ICON - 4) / size;
  const ox = (ICON - (Math.max(...xs) - minX) * s) / 2, oy = (ICON - (Math.max(...ys) - minY) * s) / 2;
  const img = Buffer.alloc(ICON * ICON * 4);
  const depth = new Float32Array(ICON * ICON).fill(Infinity);
  const LIGHT = { down: 1.05, north: 0.9, east: 0.72, west: 0.72, south: 0.6, up: 0.5 };
  for (const q of quads) {
    const c = q.corners.map((p) => [(p[0] - minX) * s + ox, (p[1] - minY) * s + oy, p[2], p[3], p[4]]);
    // a parallelogram: c0 + a·(c1 − c0) + b·(c3 − c0)
    const ex = [c[1][0] - c[0][0], c[1][1] - c[0][1]], ey = [c[3][0] - c[0][0], c[3][1] - c[0][1]];
    const det = ex[0] * ey[1] - ex[1] * ey[0];
    if (Math.abs(det) < 1e-6) continue;
    const bx = c.map((p) => p[0]), by = c.map((p) => p[1]);
    for (let py = Math.max(0, Math.floor(Math.min(...by))); py < Math.min(ICON, Math.ceil(Math.max(...by))); py++) {
      for (let px = Math.max(0, Math.floor(Math.min(...bx))); px < Math.min(ICON, Math.ceil(Math.max(...bx))); px++) {
        const dx = px + 0.5 - c[0][0], dy = py + 0.5 - c[0][1];
        const a = (dx * ey[1] - dy * ey[0]) / det, b = (ex[0] * dy - ex[1] * dx) / det;
        if (a < 0 || a > 1 || b < 0 || b > 1) continue;
        const z = c[0][2] + a * (c[1][2] - c[0][2]) + b * (c[3][2] - c[0][2]);
        if (z >= depth[py * ICON + px]) continue;
        const u = c[0][3] + a * (c[1][3] - c[0][3]) + b * (c[3][3] - c[0][3]);
        const v = c[0][4] + a * (c[1][4] - c[0][4]) + b * (c[3][4] - c[0][4]);
        const tx = Math.min(W - 1, Math.floor(u * W)), ty = Math.min(H - 1, Math.floor(v * H));
        const ti = (ty * W + tx) * 4;
        if (tex[ti + 3] === 0) continue;
        depth[py * ICON + px] = z;
        const i = (py * ICON + px) * 4;
        const l = LIGHT[q.face];
        img[i] = Math.min(255, tex[ti] * l);
        img[i + 1] = Math.min(255, tex[ti + 1] * l);
        img[i + 2] = Math.min(255, tex[ti + 2] * l);
        img[i + 3] = 255;
      }
    }
  }
  return img;
}
