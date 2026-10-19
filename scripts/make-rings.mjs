// Paints the SlashClient rings (the "ring" cosmetic: a flat picture on the ground under the feet) and writes them for the mod:
//   hud/src/main/resources/assets/slashclient-hud/textures/ring/<id>.png      a still ring
//   hud/src/main/resources/assets/slashclient-hud/textures/ring/<id>_<n>.png  an animated ring's frames (RING_FRAMES)
// Each picture is two squares side by side: the ring on the left, the right one see-through. The mod draws
// the ring as a flat box whose top face takes the left square and whose bottom face the right one, so only
// one side shows (the launcher and the website use the left square). build.mjs copies them to both.
// Run with: node scripts/make-rings.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

/** How many pixels a side the ring's square has. */
const S = 64;
/** The animated rings and how many frames each has (the same in RingEffects.java and src/renderer/ringPreview.ts). */
export const RING_FRAMES = { ring_runes: 8, ring_flame: 8, ring_rainbow: 8, ring_galaxy: 8, ring_toxic: 8 };
const IDS = ['ring_runes', 'ring_flame', 'ring_frost', 'ring_rainbow', 'ring_mushroom', 'ring_galaxy', 'ring_halo', 'ring_toxic'];

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

// ---------- helpers ----------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
/** 1 inside [a, b], easing to 0 over `soft` outside it. */
const band = (r, a, b, soft) => clamp(Math.min((r - a) / soft + 1, (b - r) / soft + 1));
/** The same pseudo-random number for the same inputs. */
function hash(...n) {
  let h = 2166136261;
  for (const x of n) h = Math.imul(h ^ Math.floor(x * 1000 + 7919), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 0xffffffff;
}
/** Smooth noise round the circle: `k` bumps a turn, moved on by `shift` (0…1 a whole bump). */
function wave(theta, k, shift, seed = 0) {
  const t = (theta / (Math.PI * 2)) * k + shift;
  const i = Math.floor(t), f = t - i;
  const a = hash(seed, ((i % k) + k) % k), b = hash(seed, (((i + 1) % k) + k) % k);
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}
function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6].map((x) => x * 255);
}

/** Small runes, 5×5 (1 = lit), laid round the circle. */
const RUNES = [
  ['10001', '01010', '00100', '01010', '10001'], ['11111', '00100', '00100', '00100', '11111'], ['10101', '10101', '11111', '00100', '00100'],
  ['01110', '10001', '10101', '10001', '01110'], ['11100', '10010', '11100', '10010', '11100'], ['00100', '01110', '10101', '00100', '00100'],
];

/**
 * How each ring looks at a texel: `r` from the middle (1 = the square's edge), `theta` the angle,
 * `x`, `y` the texel, `f` the frame (0…1 round the loop). Returns [r, g, b, a] (0…255, a 0…1).
 */
const PAINT = {
  ring_runes(r, theta, x, y, f) {
    const violet = hex('#a46cff'), light = hex('#f0e2ff'), dark = hex('#2a1257');
    const edges = band(r, 0.9, 0.93, 0.03) + band(r, 0.56, 0.59, 0.03);
    const fill = band(r, 0.59, 0.9, 0.02) * 0.45;
    // the runes: lit in a wave that goes round the ring
    let rune = 0;
    const n = RUNES.length * 2;
    const slot = Math.round((theta / (Math.PI * 2)) * n);
    const a = (slot / n) * Math.PI * 2, cx = S / 2 + Math.cos(a) * S * 0.37, cy = S / 2 + Math.sin(a) * S * 0.37;
    const gx = Math.round(x - cx + 2), gy = Math.round(y - cy + 2);
    if (gx >= 0 && gx < 5 && gy >= 0 && gy < 5 && RUNES[((slot % RUNES.length) + RUNES.length) % RUNES.length][gy][gx] === '1') {
      rune = 0.2 + 0.8 * Math.max(0, Math.cos((slot / n - f) * Math.PI * 2)) ** 2;
    }
    const lit = clamp(edges * 0.8 + rune);
    const c = lit > 0.05 ? mix(violet, light, rune) : dark;
    return [...c, clamp(fill + lit * 0.95)];
  },
  ring_flame(r, theta, x, y, f) {
    // flames lick out of the ring, flickering
    const lick = wave(theta, 14, f * 3, 1) * 0.6 + wave(theta, 31, -f * 5, 2) * 0.4;
    const outer = 0.72 + lick * 0.26;
    const heat = band(r, 0.6, outer, 0.05);
    const core = band(r, 0.64, 0.72 + lick * 0.08, 0.03);
    const c = mix(mix(hex('#c8240c'), hex('#ff8a1f'), heat), hex('#fff1a0'), core);
    return [...c, clamp(heat * 0.85 + core * 0.15)];
  },
  ring_frost(r, theta) {
    const ice = hex('#8fd8ff'), white = hex('#f2fbff');
    const rim = band(r, 0.66, 0.7, 0.03) + band(r, 0.86, 0.88, 0.025);
    const fill = band(r, 0.7, 0.86, 0.02) * 0.35;
    // six crystals pointing out, and small ones between
    const sector = ((theta / (Math.PI * 2)) * 12 + 0.5) % 1 - 0.5;
    const big = Math.round((theta / (Math.PI * 2)) * 12) % 2 === 0;
    const reach = big ? 0.99 : 0.93;
    const spike = r > 0.62 && r < reach ? clamp((1 - Math.abs(sector) * (big ? 4.5 : 6.5) / (1 - (r - 0.62) / (reach - 0.62) * 0.85)) * 2) : 0;
    const lit = clamp(rim + spike);
    return [...mix(ice, white, lit), clamp(fill + lit * 0.9)];
  },
  ring_rainbow(r, theta, x, y, f) {
    const c = hsv(theta / (Math.PI * 2) + f, 0.75, 1);
    const body = band(r, 0.66, 0.9, 0.04);
    const shine = band(r, 0.76, 0.8, 0.03);
    return [...mix(c, [255, 255, 255], shine * 0.6), clamp(body * 0.75 + shine * 0.2)];
  },
  ring_mushroom(r, theta, x, y) {
    // a fairy ring: grass round, little red mushrooms on it (seen from above)
    const grass = band(r, 0.64, 0.92, 0.04) * (0.35 + 0.2 * hash(Math.floor(x / 2), Math.floor(y / 2)));
    const n = 9;
    let best = 99, bi = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2, rr = S * (0.39 + 0.03 * Math.sin(i * 2.3));
      const d = Math.hypot(x + 0.5 - (S / 2 + Math.cos(a) * rr), y + 0.5 - (S / 2 + Math.sin(a) * rr));
      if (d < best) { best = d; bi = i; }
    }
    const size = 4.2 + (bi % 3) * 0.6;
    if (best < size) {
      const dots = hash(bi, Math.floor(x / 2), Math.floor(y / 2)) > 0.78 && best < size - 1;
      const edge = best > size - 1;
      const cap = dots ? hex('#fff6ea') : edge ? hex('#8c1410') : hex('#d8281e');
      return [...cap, 1];
    }
    return [...mix(hex('#3f8f2f'), hex('#7cc95a'), hash(x, y)), grass];
  },
  ring_galaxy(r, theta, x, y, f) {
    const swirl = wave(theta + r * 5, 3, -f, 4);
    const body = band(r, 0.6, 0.94, 0.06);
    const c = mix(hex('#1b0f4a'), mix(hex('#6a2bd8'), hex('#ff6ad5'), swirl), 0.4 + swirl * 0.5);
    // stars, twinkling in turn
    const star = hash(x, y, 3) > 0.94 ? 0.5 + 0.5 * Math.sin((hash(x, y, 5) + f) * Math.PI * 2) : 0;
    const lit = star * body;
    return [...mix(c, [255, 255, 255], lit), clamp(body * (0.55 + swirl * 0.25) + lit * 0.4)];
  },
  ring_halo(r, theta) {
    const gold = hex('#ffd34a'), white = hex('#fffbe0');
    const ring = band(r, 0.7, 0.76, 0.05);
    const glow = band(r, 0.6, 0.86, 0.14) * 0.35;
    // short rays all round
    const ray = r > 0.78 && r < 0.98 ? clamp(1 - Math.abs((((theta / (Math.PI * 2)) * 16 + 0.5) % 1) - 0.5) * 8) * (1 - (r - 0.78) / 0.2) : 0;
    const lit = clamp(ring + ray * 0.8);
    return [...mix(gold, white, ring), clamp(glow + lit * 0.9)];
  },
  ring_toxic(r, theta, x, y, f) {
    const goo = band(r, 0.64, 0.86 + wave(theta, 10, 0, 6) * 0.06, 0.04);
    let c = mix(hex('#2f9e1a'), hex('#9dff3b'), wave(theta, 7, f, 7));
    let a = goo * 0.7;
    // bubbles growing and popping on the goo, each in its own time
    for (let i = 0; i < 10; i++) {
      const life = (f + hash(i, 1)) % 1;
      const ang = (i / 10) * Math.PI * 2 + hash(i, 2), rr = S * (0.36 + hash(i, 3) * 0.06);
      const d = Math.hypot(x + 0.5 - (S / 2 + Math.cos(ang) * rr), y + 0.5 - (S / 2 + Math.sin(ang) * rr));
      const size = 1 + life * 3.2;
      if (life < 0.9 && Math.abs(d - size) < 0.8) {
        c = hex('#e8ffb8');
        a = 0.95;
      }
    }
    return [...c, a];
  },
};

function paint(id, frame) {
  const W = S * 2;
  const out = Buffer.alloc(W * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - S / 2, dy = y + 0.5 - S / 2;
      const r = Math.hypot(dx, dy) / (S / 2);
      if (r > 1) continue;
      const theta = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      const [cr, cg, cb, ca] = PAINT[id](r, theta, x, y, frame);
      const a = Math.round(clamp(ca) * 255);
      if (a < 6) continue;
      const i = (y * W + x) * 4;
      out[i] = clamp(Math.round(cr), 0, 255);
      out[i + 1] = clamp(Math.round(cg), 0, 255);
      out[i + 2] = clamp(Math.round(cb), 0, 255);
      out[i + 3] = a;
    }
  }
  return png(W, S, out);
}

const out = path.join('hud/src/main/resources/assets/slashclient-hud/textures', 'ring');
mkdirSync(out, { recursive: true });
for (const id of IDS) {
  const frames = RING_FRAMES[id];
  if (!frames) writeFileSync(path.join(out, `${id}.png`), paint(id, 0));
  else for (let n = 0; n < frames; n++) writeFileSync(path.join(out, `${id}_${n}.png`), paint(id, n / frames));
}
console.log(`${IDS.length} rings written to ${out}`);
