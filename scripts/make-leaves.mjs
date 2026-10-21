// Paints the autumn leaves of the SlashClient cosmetics and writes them for the mod:
//   hud/src/main/resources/assets/slashclient-hud/textures/particle/leaf_<colour>_<n>.png  one falling leaf (8×8),
//     in the game's particle atlas as slashclient-hud:leaf_<colour>_<n> (Leaves.java: the auras' leaves and the ones kicked up)
//   hud/src/main/resources/assets/slashclient-hud/textures/ring/ring_leaves_<variant>.png  the leaves lying under the feet,
//     a ring picture like scripts/make-rings.mjs's (two squares side by side: the leaves on the left, the right one see-through)
// The golden variant is golden leaves only, the autumn one red, brown and golden ones together. build.mjs copies
// both folders to the launcher and the website.
// Run with: node scripts/make-leaves.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

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

// ---------- the leaves ----------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * The leaves' shapes, 8×8: `o` the dark edge, `b` the leaf, `l` its lit half, `h` the vein, `v` the stalk,
 * `.` see-through. An oval one, a maple, a birch, an oak and a long one.
 */
export const SHAPES = [
  ['.....oo.', '...oolbo', '..olllho', '.olllhbo', '.ollhbo.', 'olhbbo..', '.vhoo...', 'v.......'],
  ['...o....', '.o.lo.o.', '.ollohbo', 'olllhbbo', '.olhhbo.', '..ohbo..', '...vo...', '...v....'],
  ['...oo...', '..olbo..', '.ollhbo.', '.olhbbo.', 'ollhbbbo', '.olhbbo.', '..ovoo..', '...v....'],
  ['...o....', '..olo...', '.ollho..', '..olhbo.', '.ollhbo.', '..olhbo.', '...vo...', '...v....'],
  ['......oo', '....ollo', '...ollho', '..olhbo.', '.olhbo..', '.ohbo...', 'vho.....', 'v.......'],
];

/** Each colour: the edge, the leaf, its lit half, the vein, the stalk. */
export const COLOURS = {
  gold: { o: '#a86f0c', b: '#e2a51a', l: '#f7cf3b', h: '#ffe98a', v: '#6e4a12' },
  red: { o: '#7a1a10', b: '#b8301c', l: '#dc4a26', h: '#f08a4a', v: '#4e2412' },
  brown: { o: '#4e2f14', b: '#86532a', l: '#a46a36', h: '#c99a5e', v: '#3a2410' },
};
/** What falls in each variant (the same in Leaves.java). */
export const VARIANTS = { gold: ['gold'], autumn: ['red', 'brown', 'gold'] };

function leafPixels(shape, colour) {
  const palette = COLOURS[colour];
  return SHAPES[shape].map((row) => [...row].map((c) => (palette[c] ? hex(palette[c]) : null)));
}

function leafPng(shape, colour) {
  const px = leafPixels(shape, colour);
  const out = Buffer.alloc(8 * 8 * 4);
  px.forEach((row, y) => row.forEach((c, x) => {
    if (!c) return;
    const i = (y * 8 + x) * 4;
    out[i] = c[0];
    out[i + 1] = c[1];
    out[i + 2] = c[2];
    out[i + 3] = 255;
  }));
  return png(8, 8, out);
}

// ---------- the leaves under the feet ----------

/** The same pseudo-random numbers every run. */
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 0xffffffff;
  };
}

const S = 64;

/** A patch of leaves lying on the ground: thick in the middle, a few scattered towards the edge. */
function carpet(variant, seed) {
  const W = S * 2;
  const out = Buffer.alloc(W * S * 4);
  const rnd = random(seed);
  const colours = VARIANTS[variant];
  const put = (x, y, c, a, onGround = false) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const dx = x + 0.5 - S / 2, dy = y + 0.5 - S / 2;
    if (Math.hypot(dx, dy) > S / 2 - 0.5) return;
    const i = (y * W + x) * 4;
    if (onGround && out[i + 3] > 120) return;
    const was = out[i + 3] / 255;
    const k = a + was * (1 - a);
    for (let j = 0; j < 3; j++) out[i + j] = Math.round((c[j] * a + out[i + j] * was * (1 - a)) / (k || 1));
    out[i + 3] = Math.round(k * 255);
  };
  const leaves = [];
  for (let n = 0; n < 95; n++) {
    // more of them near the middle; the outer ones only now and then
    const r = Math.sqrt(rnd()) * 0.9;
    if (r > 0.6 && rnd() < (r - 0.6) * 2.6) continue;
    const a = rnd() * Math.PI * 2;
    leaves.push({ x: S / 2 + Math.cos(a) * r * S / 2, y: S / 2 + Math.sin(a) * r * S / 2, shape: Math.floor(rnd() * SHAPES.length),
      colour: colours[Math.floor(rnd() * colours.length)], turn: Math.floor(rnd() * 4), flip: rnd() < 0.5, shade: 0.86 + rnd() * 0.2 });
  }
  // the lower ones darker, as if in the shade of those on top
  leaves.forEach((leaf, i) => { leaf.shade *= 0.9 + 0.1 * (i / leaves.length); });
  for (const leaf of leaves) {
    const px = leafPixels(leaf.shape, leaf.colour);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const c = px[y][x];
      if (!c) continue;
      // turned a quarter at a time and maybe mirrored
      let u = leaf.flip ? 7 - x : x, v = y;
      for (let t = 0; t < leaf.turn; t++) [u, v] = [7 - v, u];
      const gx = Math.round(leaf.x - 4 + u), gy = Math.round(leaf.y - 4 + v);
      // a soft shadow on the ground under it, then the leaf
      put(gx + 1, gy + 1, [40, 26, 12], 0.35, true);
      put(gx, gy, c.map((ch) => Math.min(255, ch * leaf.shade)), 1);
    }
  }
  return png(W, S, out);
}

const textures = 'hud/src/main/resources/assets/slashclient-hud/textures';
mkdirSync(path.join(textures, 'particle'), { recursive: true });
let n = 0;
for (const colour of Object.keys(COLOURS)) {
  for (let i = 0; i < SHAPES.length; i++, n++) writeFileSync(path.join(textures, 'particle', `leaf_${colour}_${i}.png`), leafPng(i, colour));
}
writeFileSync(path.join(textures, 'ring', 'ring_leaves_gold.png'), carpet('gold', 7));
writeFileSync(path.join(textures, 'ring', 'ring_leaves_autumn.png'), carpet('autumn', 11));
console.log(`${n} leaves and 2 leaf rings written to ${textures}`);
