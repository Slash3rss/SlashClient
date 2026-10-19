// Paints the SlashClient held-item skins (shields and weapons) and writes them for the mod:
//   hud/src/main/resources/assets/slashclient-hud/textures/item/held/<id>.png          the picture in the game
//       (weapons: a 16×16 item sprite, bows also <id>_pulling_<0-2>.png; shields: the game's shield layout, 4× (256×256))
//   hud/src/main/resources/assets/slashclient-hud/textures/held_figure/<id>.png        a weapon's sprite with each pixel spread
//       over a 4×2 cell, for the menu figure, which draws a weapon as one small box a pixel (Held.java)
//   hud/src/main/resources/assets/slashclient-hud/models/item/held/…, items/held/…     the item models (1.21.4+ through
//       items/held, 1.20.1–1.21.1 through models/item/held/legacy)
//   hud/src/main/resources/assets/slashclient-hud/held.json                            the items, and each weapon's pixels
// (build.mjs copies textures/item/held to the launcher and the website.) Run with: node scripts/make-held.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const assets = 'hud/src/main/resources/assets/slashclient-hud';
const NS = 'slashclient-hud';

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
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, t))));
/** The same small unevenness for the same pixel every time. */
function grain(seed, x, y) {
  let h = (seed * 374761393 + x * 668265263 + y * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) & 0xffff) / 0xffff;
}

// ---------- weapons: 16×16 sprites, held like the game's own (blade or bow from the bottom left) ----------

/** A sprite being painted: null is see-through. */
function sprite() {
  const px = Array.from({ length: 16 }, () => Array(16).fill(null));
  return {
    px,
    put(x, y, c) {
      if (x >= 0 && y >= 0 && x < 16 && y < 16) px[y][x] = c;
    },
    get(x, y) {
      return x >= 0 && y >= 0 && x < 16 && y < 16 ? px[y][x] : null;
    },
    /** A dark edge round everything (as the game's items have), in a dark shade of what it borders. */
    outline(f = 0.32) {
      const add = [];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (px[y][x]) continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => this.get(x + dx, y + dy)).find((c) => c && !c.edge);
        if (n) add.push([x, y, Object.assign(shade(n, f), { edge: true })]);
      }
      for (const [x, y, c] of add) px[y][x] = c;
    },
  };
}
const edge = (c) => Object.assign([...c], { edge: true });

/** A line of pixels from (x0, y0) to (x1, y1). */
function line(s, x0, y0, x1, y1, color) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    s.put(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), typeof color === 'function' ? color(t, i) : color);
  }
}

/**
 * A sword: the blade from (5, 10) up to the top right, `len` pixels, in three shades across
 * (`edge` on the top left, `hi`, `mid`), a guard across its foot and the grip down to the bottom left.
 */
function sword({ len = 9, blade, guard, guardLen = 2, grip, pommel, extra }) {
  const s = sprite();
  const bx = 5, by = 10;
  for (let k = 0; k < len; k++) {
    const t = k / (len - 1);
    const [dark, hi, mid] = blade(t, k);
    if (dark) s.put(bx + k - 1, by - k, dark);
    s.put(bx + k, by - k, hi);
    if (k < len - 1 && mid) s.put(bx + k + 1, by - k, mid);
  }
  // the guard across the blade's foot, two pixels thick
  for (let j = -guardLen; j <= guardLen; j++) {
    s.put(4 + j, 11 + j, guard(j, 0));
    s.put(5 + j, 11 + j, guard(j, 1));
  }
  // the grip and the pommel
  grip.forEach((c, i) => s.put(3 - i, 12 + i, c));
  if (pommel) s.put(3 - grip.length, 12 + grip.length, pommel);
  extra?.(s);
  s.outline();
  return s;
}

/** A bow: a quarter circle round the bottom right corner (the arc on the top left), its string, and an arrow when drawn. */
function bow({ wood, grip, string, tips, arrow, pull }) {
  const s = sprite();
  // the arc: a ring round the bottom right corner, a little thicker at the grip
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = 16 - (x + 0.5), dy = 16 - (y + 0.5);
    const r = Math.hypot(dx, dy), a = Math.atan2(dx, dy) / (Math.PI / 2);
    const thick = 1.1 + 0.6 * Math.sin(Math.max(0, Math.min(1, a)) * Math.PI);
    if (Math.abs(r - 13.2) <= thick && x < 16 && y < 16 && dx > 0.5 && dy > 0.5) s.put(x, y, wood(Math.max(0, Math.min(1, a)), r > 13.2));
  }
  // the grip in the middle of the arc
  for (const [x, y] of [[5, 6], [6, 5], [6, 6], [5, 5]]) if (s.get(x, y)) s.put(x, y, grip);
  tips?.(s);
  // the string: straight at rest, pulled back to the bottom right with the arrow on it
  const top = [14, 3], bottom = [3, 14];
  // at rest the string is not drawn (as the game's bow)
  if (pull !== undefined) {
    const p = 10 + pull;
    line(s, top[0], top[1], p, p, string);
    line(s, bottom[0], bottom[1], p, p, string);
    // the arrow along the diagonal: its head at the top left, feathers by the string
    for (let i = 2; i <= p; i++) s.put(i, i, arrow.shaft);
    s.put(p - 1, p, arrow.feather);
    s.put(p, p - 1, arrow.feather);
    s.put(1, 1, arrow.head[0]);
    s.put(2, 2, arrow.head[1]);
    s.put(2, 1, arrow.head[1]);
    s.put(1, 2, arrow.head[1]);
  }
  s.outline(0.3);
  return s;
}

const WEAPONS = {
  // a blade of light: white in the middle, glowing cyan, a short metal hilt with no guard to speak of
  sword_beam: () => sword({
    len: 10,
    blade: (t) => [mix(hex('#1fb6ff'), hex('#7ff6ff'), t), hex('#f4ffff'), mix(hex('#38d4ff'), hex('#a8fbff'), t)],
    guard: (j, side) => (Math.abs(j) > 1 ? null : side ? hex('#5b6573') : hex('#c3ccd6')),
    guardLen: 1,
    grip: [hex('#2b2f36'), hex('#9aa4b0'), hex('#2b2f36')],
    pommel: hex('#c3ccd6'),
    extra: (s) => s.put(4, 11, hex('#e5f2ff')),
  }),
  // a long thin steel blade with a dark back, a round gold guard and a wrapped grip
  sword_katana: () => sword({
    len: 10,
    blade: (t, k) => [k % 3 === 1 ? hex('#5d6670') : hex('#7d8792'), mix(hex('#e9eef3'), hex('#ffffff'), t), null],
    guard: (j, side) => (Math.abs(j) > 1 ? null : j === 0 ? hex('#ffe08a') : side ? hex('#9c6b12') : hex('#d6a425')),
    guardLen: 1,
    grip: [hex('#1a1a1f'), hex('#e8e2d0'), hex('#1a1a1f'), hex('#e8e2d0')],
    pommel: hex('#d6a425'),
  }),
  // a blade of fire: yellow at the core, orange to red at the edges, flames licking off it
  sword_flame: () => sword({
    blade: (t) => [mix(hex('#c41e0a'), hex('#ff5a12'), t), mix(hex('#ffd23f'), hex('#fff3a8'), t), mix(hex('#ff8a1f'), hex('#ffb21f'), t)],
    guard: (j, side) => (j === 0 ? hex('#ff4d1a') : side ? hex('#2a1f24') : hex('#4a3a40')),
    grip: [hex('#3a2418'), hex('#5a3420')],
    pommel: hex('#ff4d1a'),
    extra: (s) => {
      // flames off the blade's back
      for (const [x, y, c] of [[6, 7, '#ff6a1f'], [8, 5, '#ffb21f'], [10, 3, '#ff6a1f'], [5, 8, '#ffd23f'], [12, 1, '#ffd23f'], [9, 4, '#ff3d12']]) s.put(x, y, hex(c));
    },
  }),
  // a blade of ice: pale blue crystal with white facets and frosty spikes, a blue crystal guard
  sword_ice: () => sword({
    blade: (t, k) => [k % 2 ? hex('#5fb8ff') : hex('#8fd3ff'), hex('#f2fbff'), mix(hex('#b9e6ff'), hex('#d8f3ff'), t)],
    guard: (j, side) => (Math.abs(j) === 2 ? hex('#8fd3ff') : side ? hex('#2f6fd6') : hex('#5fa8ff')),
    grip: [hex('#1d3f7a'), hex('#2f5fa8')],
    pommel: hex('#a8e3ff'),
    extra: (s) => {
      for (const [x, y] of [[7, 6], [11, 2]]) s.put(x, y, hex('#d8f3ff'));
      for (const [x, y] of [[9, 7], [13, 3]]) s.put(x, y, hex('#8fd3ff'));
    },
  }),
};

const BOWS = {
  // dark scaly wood with red scales, bone horns at the tips, a glowing red string
  bow_dragon: {
    wood: (t, outer) => (outer ? (Math.round(t * 10) % 3 === 0 ? hex('#b3202a') : hex('#3b2033')) : mix(hex('#5a2d4a'), hex('#7a3a5c'), Math.sin(t * Math.PI))),
    grip: hex('#d4a54a'),
    string: hex('#ff5a4a'),
    tips: (s) => {
      for (const [x, y] of [[15, 2], [15, 1], [2, 15], [1, 15]]) s.put(x, y, hex('#e8dcc0'));
    },
    arrow: { shaft: hex('#e8dcc0'), feather: hex('#d93a3a'), head: [hex('#ffe08a'), hex('#ff7a1f')] },
  },
  // a bow of amethyst and ice crystal: pale violet to cyan, a white string, a crystal shard at the grip
  bow_crystal: {
    wood: (t, outer) => mix(outer ? hex('#a77bff') : hex('#d6c2ff'), outer ? hex('#38c9ff') : hex('#b8f0ff'), t),
    grip: hex('#ffffff'),
    string: hex('#f2f7ff'),
    tips: (s) => {
      for (const [x, y] of [[15, 2], [2, 15]]) s.put(x, y, hex('#ffffff'));
    },
    arrow: { shaft: hex('#c9b8ff'), feather: hex('#38c9ff'), head: [hex('#ffffff'), hex('#a77bff')] },
  },
};

function spritePng(s) {
  const buf = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = s.px[y][x];
    if (!c) continue;
    const i = (y * 16 + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = 255;
  }
  return png(16, 16, buf);
}

/** The sprite for the menu figure: pixel (x, y) fills the 4×2 cell at (4x, 2y), so a 1×1×1 box there shows its colour on every face. */
function figurePng(s) {
  const W = 64, H = 32;
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = s.px[y][x];
    if (!c) continue;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 4; dx++) {
      const i = ((2 * y + dy) * W + 4 * x + dx) * 4;
      // the sides a little darker than the faces, as the game shades them
      const f = dy === 1 && (dx === 0 || dx === 2) ? 0.85 : 1;
      buf[i] = Math.round(c[0] * f);
      buf[i + 1] = Math.round(c[1] * f);
      buf[i + 2] = Math.round(c[2] * f);
      buf[i + 3] = 255;
    }
  }
  return png(W, H, buf);
}

const mask = (s) => s.px.map((row) => row.map((c) => (c ? '#' : '.')).join(''));

// ---------- shields: the game's shield layout (64×64) at 4×, the face 12×22 pixels ----------

const K = 4;
const SW = 64 * K;
/** The plate's face (front) and back, and its rim, in the layout (pixels); the handle's box at (26, 0), 2×6×6. */
const FACE = [1, 1, 12, 22], BACK = [14, 1, 12, 22];

/** The SlashClient logo (the badge next to names), as in make-capes.py: a pixel "S" cut by a "/" whose halves slide apart. */
function logoAt(u, v, w, h) {
  const rows = ['.XXXX.', 'XX..XX', 'XX....', '.XXXX.', '....XX', 'XX..XX', '.XXXX.'];
  const cell = Math.min(w / 6, h / 7);
  const x0 = (w - 6 * cell) / 2, y0 = (h - 7 * cell) / 2;
  const cx = w / 2, cy = h / 2;
  const gap = (cell * 30) / 62, shift = ((cell * 18) / 62) / Math.SQRT2;
  const letter = (x, y) => {
    const c = Math.floor((x - x0) / cell), r = Math.floor((y - y0) / cell);
    return r >= 0 && r < 7 && c >= 0 && c < 6 && rows[r][c] === 'X';
  };
  // which side of the cut (through the middle, rising to the right) a point is on
  const side = (x, y) => ((x - cx) + (y - cy)) / Math.SQRT2;
  const o = gap / 2;
  // the upper half slides down to the left, the lower one up to the right
  const ux = u + shift, uy = v - shift;
  if (side(ux, uy) < -o && letter(ux, uy)) return true;
  const lx = u - shift, ly = v + shift;
  return side(lx, ly) > o && letter(lx, ly);
}

/** A heart as the game draws them (9×8). */
const HEART = ['.##...##.', '#hh#.#hh#', '#h#######', '#########', '.#######.', '..#####..', '...###...', '....#....'];

/**
 * How each shield is painted: `face(x, y, w, h)` for every texel of the front (x, y from its top
 * left, w × h texels), `back`, `rim` and `handle` colours.
 */
const SHIELDS = {
  // emerald scales with a gold rim and a dragon's slit eye in the middle
  shield_dragon: {
    face(x, y, w, h) {
      if (x < 4 || y < 4 || x >= w - 4 || y >= h - 4) return (x + y) % 8 < 4 ? hex('#e0b23a') : hex('#b8860b');
      // the eye: a yellow almond with a black slit
      const ex = (x - w / 2) / 14, ey = (y - h / 2) / 7;
      if (ex * ex + ey * ey < 1) {
        if (Math.abs(x - w / 2) < 2.2 - Math.abs(ey) * 1.2) return hex('#140a05');
        return mix(hex('#ffe45c'), hex('#ff7a1a'), Math.sqrt(ex * ex + ey * ey));
      }
      if (ex * ex + ey * ey < 1.35) return hex('#3a0d08');
      // scales: rows of half circles
      const row = Math.floor(y / 6), sx = (x + (row % 2) * 4) % 8, sy = y % 6;
      const d = Math.hypot(sx - 4, sy - 0.5) / 4.5;
      const base = mix(hex('#1f7a3d'), hex('#0d3f22'), y / h);
      return d > 0.86 ? shade(base, 0.55) : mix(shade(base, 1.35), base, d);
    },
    back: hex('#0d3f22'), rim: hex('#b8860b'), handle: hex('#3a2a1a'),
  },
  // dark red with horns, glowing eyes and a fanged grin, a black iron rim
  shield_demon: {
    face(x, y, w, h) {
      if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) return hex('#1a1414');
      const cx = w / 2;
      const ax = Math.abs(x + 0.5 - cx);
      // horns: two curved spikes from the top corners
      for (const s of [-1, 1]) {
        const hx = cx + s * (6 + (y - 6) * 0.15) + s * Math.pow(Math.max(0, 22 - y) / 22, 2) * 12;
        if (y > 4 && y < 26 && Math.abs(x + 0.5 - hx) < 1 + (y - 4) * 0.12) return mix(hex('#f0e6d0'), hex('#8a7a66'), (26 - y) / 22);
      }
      // eyes: slanted glowing slits
      if (y >= 34 && y < 41 && ax > 5 && ax < 15 && y - 34 > (ax - 5) * 0.45 - 1) return y < 37 ? hex('#fff36a') : hex('#ffb21a');
      // the grin with fangs
      if (y >= 56 && y < 62 && ax < 15) {
        const fang = (Math.floor(ax / 3) % 2 === 0) && y < 60;
        return fang ? hex('#f5f0e6') : hex('#140404');
      }
      const g = grain(7, x >> 1, y >> 1);
      return mix(hex('#8e0f12'), hex('#3d0507'), y / h * 0.7 + g * 0.2);
    },
    back: hex('#3d0507'), rim: hex('#1a1414'), handle: hex('#2a2a2a'),
  },
  // a box flattened into a shield: corrugated brown card, packing tape and a drawn smiley
  shield_cardboard: {
    face(x, y, w, h) {
      // the tape: a strip across and one down
      if ((y >= 38 && y < 46) || (x >= 20 && x < 28)) return grain(3, x, y) > 0.92 ? hex('#e8d9a8') : hex('#d8c48a');
      // the smiley, drawn with a marker
      const dx = x + 0.5 - 12, dy = y + 0.5 - 20;
      const r = Math.hypot(dx, dy);
      if (Math.abs(r - 7.5) < 0.9) return hex('#2b2b2b');
      if ((Math.hypot(dx + 3, dy + 2) < 1.2) || (Math.hypot(dx - 3, dy + 2) < 1.2)) return hex('#2b2b2b');
      if (r > 3 && r < 4.6 && dy > 0.8) return hex('#2b2b2b');
      // "this side up" arrow at the bottom
      if (y >= 62 && y < 68 && Math.abs(x + 0.5 - 12) < y - 61) return hex('#2b2b2b');
      if (x >= 10 && x < 14 && y >= 68 && y < 80) return hex('#2b2b2b');
      const ridge = x % 4 < 1 ? 0.88 : 1;
      return shade(mix(hex('#c79a5b'), hex('#b8874a'), grain(11, x >> 2, y >> 3)), ridge);
    },
    back: hex('#a87a42'), rim: hex('#8c6334'), handle: hex('#8c6334'),
  },
  // polished gold with a light shine across it, an embossed border and a diamond in the middle
  shield_golden: {
    face(x, y, w, h) {
      const shine = Math.max(0, 1 - Math.abs((x - y * 0.45) - 2) / 5);
      if (x < 4 || y < 4 || x >= w - 4 || y >= h - 4) return x < 2 || y < 2 || x >= w - 2 || y >= h - 2 ? hex('#8a5a00') : hex('#ffe680');
      // the diamond: a rhombus in cyan facets
      const dx = Math.abs(x + 0.5 - w / 2), dy = Math.abs(y + 0.5 - h / 2);
      if (dx / 9 + dy / 13 < 1) return dx / 9 + dy / 13 < 0.45 ? hex('#d4fffb') : x + 0.5 < w / 2 ? hex('#4ae6dc') : hex('#1fb5ad');
      if (dx / 9 + dy / 13 < 1.18) return hex('#b07800');
      // rivets in the corners
      for (const [rx, ry] of [[9, 9], [w - 9, 9], [9, h - 9], [w - 9, h - 9]]) if (Math.hypot(x + 0.5 - rx, y + 0.5 - ry) < 2) return hex('#fff3b0');
      return mix(mix(hex('#f0b81c'), hex('#c98a0a'), y / h), hex('#fff6c8'), shine);
    },
    back: hex('#a87000'), rim: hex('#ffd447'), handle: hex('#6b4a10'),
  },
  // clear blue ice with white cracks and frost round the edge
  shield_ice: {
    face(x, y, w, h) {
      const edgeDist = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edgeDist < 3 + grain(5, x, y >> 1) * 3) return hex('#f4fbff');
      // cracks: a few straight lines from a point
      const cx = 30, cy = 30;
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      for (const ang of [-2.6, -1.2, 0.4, 1.7, 2.6]) {
        let d = Math.abs(((a - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < 0.05 && Math.hypot(x - cx, y - cy) < 40) return hex('#ffffff');
      }
      const g = grain(9, x >> 2, y >> 2);
      return mix(mix(hex('#8fdcff'), hex('#3a9be8'), y / h), hex('#c9f0ff'), g * 0.35);
    },
    back: hex('#3a9be8'), rim: hex('#c9f0ff'), handle: hex('#1d4f8a'),
  },
  // the SlashClient logo on a dark blue plate with a blue rim (as the SlashClient cape)
  shield_slash: {
    face(x, y, w, h) {
      if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) return hex('#60a5fa');
      if (logoAt(x + 0.5 - 8, y + 0.5 - 26, w - 16, 36)) return hex('#f3f4f6');
      if (logoAt(x - 0.5 - 8, y - 0.5 - 26, w - 16, 36)) return hex('#1e3a8a');
      return mix(hex('#0b1220'), hex('#1d4ed8'), y / h);
    },
    back: hex('#0b1220'), rim: hex('#60a5fa'), handle: hex('#1e293b'),
  },
  // a big pixel heart, as the game's health hearts, on a soft pink plate
  shield_heart: {
    face(x, y, w, h) {
      if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) return hex('#ff9ec4');
      // the heart, each of its pixels 4×4 pixels of ours (16 texels... here 4 texels a model pixel: 1 heart pixel = 4 model px... scaled to fit)
      const s = 4.5, hx = Math.floor((x - (w - 9 * s) / 2) / s), hy = Math.floor((y - 26) / s);
      const c = hy >= 0 && hy < 8 && hx >= 0 && hx < 9 ? HEART[hy][hx] : '.';
      if (c === 'h') return hex('#ffd0d0');
      if (c === '#') {
        // the game's heart: dark red edge, red inside
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (HEART[hy + dy]?.[hx + dx] ?? '.') === '.');
        return n ? hex('#7a0d0d') : hex('#e8262b');
      }
      const dots = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 && x % 8 > 2 && x % 8 < 5 && y % 8 > 2 && y % 8 < 5;
      return dots ? hex('#ffd6e7') : hex('#ffb8d2');
    },
    back: hex('#d94f87'), rim: hex('#ff9ec4'), handle: hex('#7a1f45'),
  },
};

function shieldPng(id, s) {
  const buf = Buffer.alloc(SW * SW * 4);
  const set = (x, y, c) => {
    const i = (y * SW + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = 255;
  };
  const fill = (u, v, w, h, f) => {
    for (let y = v * K; y < (v + h) * K; y++) for (let x = u * K; x < (u + w) * K; x++) set(x, y, f(x - u * K, y - v * K, w * K, h * K));
  };
  // the plate (12×22×1 at 0, 0): its top and bottom edges, sides, face and back
  const rim = (x, y) => shade(s.rim, 0.85 + grain(1, x >> 1, y >> 1) * 0.2);
  fill(1, 0, 12, 1, rim);
  fill(13, 0, 12, 1, rim);
  fill(0, 1, 1, 22, rim);
  fill(13, 1, 1, 22, rim);
  fill(...FACE, s.face);
  fill(...BACK, (x, y, w, h) => (x < 3 || y < 3 || x >= w - 3 || y >= h - 3 ? shade(s.rim, 0.7) : shade(s.back, (x >> 3) % 2 ? 0.85 : 1)));
  // the handle (2×6×6 at 26, 0)
  const handle = (x, y) => shade(s.handle, 0.9 + grain(2, x, y) * 0.2);
  fill(32, 0, 4, 6, handle);
  fill(26, 6, 16, 6, handle);
  return png(SW, SW, buf);
}

// ---------- the models ----------

/** The shield's plate and handle as model elements (the game's shield model, turned as its renderer turns it). */
const SHIELD_ELEMENTS = (() => {
  const uv = (u, v, w, h) => [u / 4, v / 4, (u + w) / 4, (v + h) / 4];
  const face = (u, v, w, h) => ({ uv: uv(u, v, w, h), texture: '#shield' });
  return [
    { from: [-6, -11, 1], to: [6, 11, 2], faces: {
      south: face(1, 1, 12, 22), north: face(14, 1, 12, 22), up: face(1, 0, 12, 1), down: face(13, 0, 12, 1),
      west: face(0, 1, 1, 22), east: face(13, 1, 1, 22) } },
    { from: [-1, -3, -5], to: [1, 3, 1], faces: {
      north: face(40, 6, 2, 6), south: face(32, 6, 2, 6), up: face(32, 0, 2, 6), down: face(34, 0, 2, 6),
      west: face(26, 6, 6, 6), east: face(34, 6, 6, 6) } },
  ];
})();

/** The game's shield placement in the hands before 1.21.2 (it changed in 1.21.2, blocking also in 1.20.2…1.21.1). */
const LEGACY_SHIELD_DISPLAY = {
  thirdperson_righthand: { rotation: [0, 90, 0], translation: [10, 6, -4], scale: [1, 1, 1] },
  thirdperson_lefthand: { rotation: [0, 90, 0], translation: [10, 6, 12], scale: [1, 1, 1] },
  firstperson_righthand: { rotation: [0, 180, 5], translation: [-10, 2, -10], scale: [1.25, 1.25, 1.25] },
  firstperson_lefthand: { rotation: [0, 180, 5], translation: [10, 0, -10], scale: [1.25, 1.25, 1.25] },
};
const LEGACY_BLOCKING = {
  // 1.20.2…1.21.1
  '': {
    thirdperson_righthand: { rotation: [45, 155, 0], translation: [-3.49, 11, -2], scale: [1, 1, 1] },
    thirdperson_lefthand: { rotation: [45, 155, 0], translation: [11.51, 7, 2.5], scale: [1, 1, 1] },
    firstperson_righthand: { rotation: [0, 180, -5], translation: [-15, 3.25, -11], scale: [1.25, 1.25, 1.25] },
    firstperson_lefthand: { rotation: [0, 180, -5], translation: [5, 5, -11], scale: [1.25, 1.25, 1.25] },
  },
  // 1.20.1
  _120: {
    thirdperson_righthand: { rotation: [45, 135, 0], translation: [3.51, 11, -2], scale: [1, 1, 1] },
    thirdperson_lefthand: { rotation: [45, 135, 0], translation: [13.51, 3, 5], scale: [1, 1, 1] },
    firstperson_righthand: { rotation: [0, 180, -5], translation: [-15, 5, -11], scale: [1.25, 1.25, 1.25] },
    firstperson_lefthand: { rotation: [0, 180, -5], translation: [5, 5, -11], scale: [1.25, 1.25, 1.25] },
  },
};

const json = (v) => `${JSON.stringify(v, null, '\t')}\n`;
const models = path.join(assets, 'models', 'item', 'held');
const items = path.join(assets, 'items', 'held');
const textures = path.join(assets, 'textures', 'item', 'held');
const figure = path.join(assets, 'textures', 'held_figure');
for (const d of [models, items, textures, figure]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}
mkdirSync(path.join(models, 'legacy'), { recursive: true });
const write = (dir, name, text) => writeFileSync(path.join(dir, name), text);
const tex = (name) => `${NS}:item/held/${name}`;
const model = (name) => `${NS}:item/held/${name}`;

const list = [];
// the shield's shape once, for every shield: new versions place it as the game's own shield (its model's display), old ones as below
write(models, 'shield_shape.json', json({ parent: 'minecraft:item/shield', textures: { particle: '#shield' }, elements: SHIELD_ELEMENTS }));
write(models, 'shield_shape_blocking.json', json({ parent: 'minecraft:item/shield_blocking', textures: { particle: '#shield' }, elements: SHIELD_ELEMENTS }));
write(path.join(models, 'legacy'), 'shield_shape.json', json({ gui_light: 'front', textures: { particle: '#shield' }, display: LEGACY_SHIELD_DISPLAY, elements: SHIELD_ELEMENTS }));
for (const [suffix, display] of Object.entries(LEGACY_BLOCKING)) {
  write(path.join(models, 'legacy'), `shield_shape_blocking${suffix}.json`, json({ parent: model('legacy/shield_shape'), display }));
}
for (const [id, s] of Object.entries(SHIELDS)) {
  writeFileSync(path.join(textures, `${id}.png`), shieldPng(id, s));
  const t = { shield: tex(id) };
  write(models, `${id}.json`, json({ parent: model('shield_shape'), textures: t }));
  write(models, `${id}_blocking.json`, json({ parent: model('shield_shape_blocking'), textures: t }));
  write(path.join(models, 'legacy'), `${id}.json`, json({ parent: model('legacy/shield_shape'), textures: t }));
  for (const suffix of Object.keys(LEGACY_BLOCKING)) write(path.join(models, 'legacy'), `${id}_blocking${suffix}.json`, json({ parent: model(`legacy/shield_shape_blocking${suffix}`), textures: t }));
  write(items, `${id}.json`, json({ model: {
    type: 'minecraft:condition', property: 'minecraft:using_item',
    on_false: { type: 'minecraft:model', model: model(id) },
    on_true: { type: 'minecraft:model', model: model(`${id}_blocking`) },
  } }));
  list.push({ id, kind: 'shield' });
}
for (const [id, make] of Object.entries(WEAPONS)) {
  const s = make();
  writeFileSync(path.join(textures, `${id}.png`), spritePng(s));
  writeFileSync(path.join(figure, `${id}.png`), figurePng(s));
  write(models, `${id}.json`, json({ parent: 'minecraft:item/handheld', textures: { layer0: tex(id) } }));
  write(items, `${id}.json`, json({ model: { type: 'minecraft:model', model: model(id) } }));
  list.push({ id, kind: 'sword', mask: mask(s) });
}
for (const [id, b] of Object.entries(BOWS)) {
  const rest = bow(b);
  writeFileSync(path.join(textures, `${id}.png`), spritePng(rest));
  writeFileSync(path.join(figure, `${id}.png`), figurePng(rest));
  write(models, `${id}.json`, json({ parent: 'minecraft:item/bow', textures: { layer0: tex(id) } }));
  for (let p = 0; p < 3; p++) {
    writeFileSync(path.join(textures, `${id}_pulling_${p}.png`), spritePng(bow({ ...b, pull: p })));
    write(models, `${id}_pulling_${p}.json`, json({ parent: 'minecraft:item/bow', textures: { layer0: tex(`${id}_pulling_${p}`) } }));
  }
  // before 1.21.4 the model itself picks the drawn picture (as the game's bow model)
  write(path.join(models, 'legacy'), `${id}.json`, json({ parent: model(id), overrides: [
    { predicate: { pulling: 1 }, model: model(`${id}_pulling_0`) },
    { predicate: { pulling: 1, pull: 0.65 }, model: model(`${id}_pulling_1`) },
    { predicate: { pulling: 1, pull: 0.9 }, model: model(`${id}_pulling_2`) },
  ] }));
  write(items, `${id}.json`, json({ model: {
    type: 'minecraft:condition', property: 'minecraft:using_item',
    on_false: { type: 'minecraft:model', model: model(id) },
    on_true: {
      type: 'minecraft:range_dispatch', property: 'minecraft:use_duration', scale: 0.05,
      entries: [
        { threshold: 0.65, model: { type: 'minecraft:model', model: model(`${id}_pulling_1`) } },
        { threshold: 0.9, model: { type: 'minecraft:model', model: model(`${id}_pulling_2`) } },
      ],
      fallback: { type: 'minecraft:model', model: model(`${id}_pulling_0`) },
    },
  } }));
  list.push({ id, kind: 'bow', mask: mask(rest) });
}
// one line per item, for readable diffs
writeFileSync(path.join(assets, 'held.json'), `{"items": [\n${list.map((i) => `\t${JSON.stringify(i)}`).join(',\n')}\n]}\n`);
console.log(`${list.length} held items -> ${textures}`);
