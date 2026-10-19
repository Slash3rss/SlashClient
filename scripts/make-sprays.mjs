// Paints the SlashClient sprays (pixel art on a 32×32 grid, written 2× as 64×64 pictures) for the mod:
//   hud/src/main/resources/assets/slashclient-hud/textures/spray/<id>.png
// (build.mjs copies them to the launcher and the website.) The ids are the server's (server/src/cosmetics.ts).
// Run with: node scripts/make-sprays.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const out = 'hud/src/main/resources/assets/slashclient-hud/textures/spray';
const N = 32;
const SCALE = 2;
const OUTLINE = [17, 19, 33, 255];

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
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- a 32×32 canvas ----------

const hex = (h, a = 255) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

class Canvas {
  px = Array.from({ length: N * N }, () => null);

  set(x, y, c) {
    if (x >= 0 && y >= 0 && x < N && y < N && c) this.px[y * N + x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < N && y < N ? this.px[y * N + x] : null;
  }
  /** Every pixel whose centre `inside(x, y)` holds gets `color(x, y)` (a colour or a function of the pixel). */
  shape(inside, color) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (inside(x + 0.5, y + 0.5)) this.set(x, y, typeof color === 'function' ? color(x + 0.5, y + 0.5) : color);
    }
  }
  circle(cx, cy, r, color) {
    this.shape((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, color);
  }
  ellipse(cx, cy, rx, ry, color) {
    this.shape((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, color);
  }
  rect(x0, y0, w, h, color) {
    this.shape((x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h, color);
  }
  /** A polygon (points [x, y]), by the even-odd rule. */
  poly(points, color) {
    this.shape((x, y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, color);
  }
  /** Rows of characters, `.` empty, the rest from `palette`, with the top-left at (x, y) and each cell `s` pixels. */
  bitmap(rows, x0, y0, palette, s = 1) {
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
        const c = palette[ch];
        this.set(x0 + x * s + dx, y0 + y * s + dy, typeof c === 'function' ? c(x0 + x * s + dx, y0 + y * s + dy) : c);
      }
    }));
  }
  /** A dark line round everything painted (so the picture reads on any block), as sprays in games have. */
  outline() {
    const add = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (this.get(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (this.get(x + dx, y + dy) && this.get(x + dx, y + dy) !== OUTLINE) near = true;
      if (near) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, OUTLINE);
  }
  png() {
    const W = N * SCALE;
    const buf = Buffer.alloc(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const c = this.px[Math.floor(y / SCALE) * N + Math.floor(x / SCALE)];
      if (c) buf.set(c, (y * W + x) * 4);
    }
    return png(W, W, buf);
  }
}

/** From `top` to `bottom` colour down the picture (rows y0..y1). */
const vertical = (top, bottom, y0, y1) => (x, y) => {
  const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
  const a = hex(top), b = hex(bottom);
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
};

// ---------- the sprays ----------

const SPRAYS = {
  // the logo: the blocky S, cut by the slash
  spray_logo(c) {
    const S = [
      '..########',
      '.#########',
      '###.......',
      '###.......',
      '.########.',
      '..########',
      '.......###',
      '.......###',
      '#########.',
      '########..',
    ];
    const blue = vertical('#93c5fd', '#2563eb', 4, 27);
    c.bitmap(S, 6, 5, { '#': blue }, 2);
    // the slash: a gap from bottom left to top right, with a light stroke in it
    const along = (x, y) => x + y - 32;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = along(x + 0.5, y + 0.5);
      if (Math.abs(d) < 1.6) c.px[y * N + x] = null;
    }
    c.shape((x, y) => Math.abs(along(x, y)) < 0.8 && x > 4 && x < 28 && y > 3 && y < 28, hex('#e0f2fe'));
  },

  spray_gg(c) {
    const G = [
      '.####.',
      '##..##',
      '##....',
      '##.###',
      '##..##',
      '##..##',
      '.#####',
    ];
    const gold = vertical('#fde68a', '#f59e0b', 8, 24);
    c.bitmap(G, 2, 8, { '#': gold }, 2);
    c.bitmap(G, 18, 8, { '#': gold }, 2);
    // a little shine on each
    c.set(5, 9, hex('#fffbeb'));
    c.set(21, 9, hex('#fffbeb'));
  },

  spray_heart(c) {
    // (x² + y² − 1)³ − x²y³ ≤ 0, the classic heart curve
    const inside = (x, y) => {
      const u = (x - 16) / 11.5, v = -(y - 15.5) / 11.5 + 0.1;
      return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0;
    };
    c.shape(inside, (x, y) => (x + y > 38 ? hex('#b91c1c') : hex('#ef4444')));
    c.circle(10.5, 10.5, 2.2, hex('#fecaca'));
    c.set(13, 8, hex('#fecaca'));
  },

  spray_skull(c) {
    const bone = (x, y) => (x > 20 && y > 12 ? hex('#cbc6b6') : hex('#f4f2ea'));
    c.circle(16, 13, 10.5, bone);
    c.rect(10, 19, 12, 8, bone);
    // the eyes and the nose
    c.circle(11.8, 14.5, 3.1, hex('#1f2937'));
    c.circle(20.2, 14.5, 3.1, hex('#1f2937'));
    c.set(11, 13, hex('#ef4444'));
    c.set(20, 13, hex('#ef4444'));
    c.poly([[16, 18], [14, 21.5], [18, 21.5]], hex('#1f2937'));
    // the teeth
    for (const x of [12, 15, 18]) c.rect(x, 24, 1, 3, hex('#1f2937'));
    c.rect(10, 23, 12, 1, hex('#9b9584'));
    // a crack
    c.set(17, 4, hex('#9b9584'));
    c.set(18, 5, hex('#9b9584'));
    c.set(17, 6, hex('#9b9584'));
  },

  spray_lol(c) {
    c.circle(16, 16, 13, (x, y) => (x + y > 40 ? hex('#eab308') : hex('#fde047')));
    const dark = hex('#422006');
    // eyes squeezed shut: > <
    c.bitmap(['#...', '.##.', '...#', '.##.', '#...'], 7, 9, { '#': dark });
    c.bitmap(['...#', '.##.', '#...', '.##.', '...#'], 21, 9, { '#': dark });
    // the open mouth, laughing, with the tongue
    c.shape((x, y) => y >= 17 && (x - 16) ** 2 / 64 + (y - 17) ** 2 / 64 <= 1, dark);
    c.shape((x, y) => y >= 22 && (x - 16) ** 2 / 20 + (y - 24.5) ** 2 / 6 <= 1, hex('#f87171'));
    c.rect(9, 17, 14, 1, hex('#ffffff'));
    // tears of laughter
    c.bitmap(['.#.', '###', '###', '.#.'], 2, 13, { '#': hex('#60a5fa') });
    c.bitmap(['.#.', '###', '###', '.#.'], 27, 13, { '#': hex('#60a5fa') });
  },

  spray_crown(c) {
    const gold = vertical('#fde68a', '#d97706', 6, 26);
    c.poly([[4, 25], [4, 11], [10, 17], [16, 7], [22, 17], [28, 11], [28, 25]], gold);
    c.rect(4, 22, 24, 4, hex('#b45309'));
    for (const [x, y] of [[4, 9.5], [16, 5.5], [28, 9.5]]) c.circle(x, y, 2, hex('#fef3c7'));
    c.circle(16, 17, 2.4, hex('#ef4444'));
    c.circle(9.5, 21, 1.6, hex('#3b82f6'));
    c.circle(22.5, 21, 1.6, hex('#22c55e'));
    c.set(15, 16, hex('#fecaca'));
  },

  // a shield with a star: a badge of rank
  spray_emblem(c) {
    const shield = (inset) => [[5 + inset, 4 + inset], [27 - inset, 4 + inset], [27 - inset, 15], [16, 28 - inset * 1.3], [5 + inset, 15]];
    c.poly(shield(0), hex('#fbbf24'));
    c.poly(shield(2), vertical('#a78bfa', '#5b21b6', 6, 26));
    const star = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 2.8 : 6.6;
      star.push([16 + Math.cos(a) * r, 14.5 + Math.sin(a) * r]);
    }
    c.poly(star, hex('#fef9c3'));
  },

  // the season's: a carved pumpkin (Halloween)
  spray_pumpkin(c) {
    const ribs = (x) => (Math.floor((x - 3) / 4.4) % 2 ? hex('#f97316') : hex('#ea580c'));
    c.ellipse(16, 18, 13, 10.5, (x) => ribs(x));
    c.rect(14, 4, 4, 5, hex('#65a30d'));
    c.rect(17, 4, 3, 1, hex('#4d7c0f'));
    const glow = hex('#fde047');
    c.poly([[8, 17], [11, 12], [14, 17]], glow);
    c.poly([[18, 17], [21, 12], [24, 17]], glow);
    c.poly([[15, 19], [16, 17.5], [17, 19]], glow);
    c.poly([[7, 21], [25, 21], [23, 25], [20, 23], [16, 26], [12, 23], [9, 25]], glow);
  },
};

mkdirSync(out, { recursive: true });
for (const [id, paint] of Object.entries(SPRAYS)) {
  const c = new Canvas();
  paint(c);
  c.outline();
  writeFileSync(path.join(out, `${id}.png`), c.png());
}
console.log(`${Object.keys(SPRAYS).length} sprays -> ${out}`);
