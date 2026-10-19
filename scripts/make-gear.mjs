// Paints the SlashClient back items and tails (src/shared/gear.ts) and writes them for the mod:
//   hud/src/main/resources/assets/slashclient-hud/textures/gear/<id>.png       the picture on the boxes
//   hud/src/main/resources/assets/slashclient-hud/textures/gear/icon/<id>.png  a small view of it for the menus
//   hud/src/main/resources/assets/slashclient-hud/gear.json                    the boxes, with where their pictures are
// (build.mjs copies the pictures to the launcher and the website.) Run with: node scripts/make-gear.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { CLOTHING_SCALE as K, boxQuads } from '../src/shared/clothing.ts';
import { GEAR, GEAR_TEXTURE, TAIL_BASE, TAIL_OVERLAP, gearBoxes, gearLayout, tailAngles } from '../src/shared/gear.ts';

const assets = 'hud/src/main/resources/assets/slashclient-hud';
const [TW, TH] = GEAR_TEXTURE;
const ICON = 64;

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
function grain(seed, x, y) {
  let h = (seed * 374761393 + x * 668265263 + y * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) & 0xffff) / 0xffff;
}
const isSide = (face) => face === 'north' || face === 'south' || face === 'east' || face === 'west';
/** A rim `r` texels wide round the face. */
const rim = (x, y, w, h, r) => x < r || y < r || x >= w - r || y >= h - r;

/** Fur: a colour with long strands along the tail (`t` along it, `px`/`py` the model pixel). */
function fur(c, seed, px, py, t) {
  return shade(c, 0.86 + grain(seed, px, Math.floor(py / 2)) * 0.2 + Math.sin(t * 40) * 0.02);
}

/**
 * How each item is painted: called for every texel of every face with
 * { box, face, x, y, w, h (texel in the face, its size), px, py (the model pixel), gear (the box as
 * defined), tail ({ chain, segment, extra }), t (0 at a tail's root … 1 at its tip), lp (the texel's
 * point in the box's own space) } → [r, g, b] or null (see-through).
 */
const STRAP = hex('#3b2a1e');
function strap({ face, x, w, px, py }) {
  if (face === 'north' && Math.abs(x + 0.5 - w / 2) < K / 2 && py % 5 === 2) return hex('#c9a227');
  return shade(STRAP, 0.88 + grain(40, px, py) * 0.18);
}
const PAINT = {
  backpack(p) {
    const { box, face, x, y, w, h, px, py } = p;
    if (box >= 3) return strap(p);
    const canvas = hex('#c0492f');
    if (box === 1) {
      // the flap, a buckle at its bottom middle at the back
      if (face === 'south' && y >= h - K * 1.5 && Math.abs(x + 0.5 - w / 2) < K * 0.75) return hex('#e2b13c');
      return shade(hex('#8e2f1f'), 0.9 + grain(41, px, py) * 0.14);
    }
    if (box === 2) {
      if (face === 'south' && Math.abs(y + 0.5 - K * 0.75) < K / 3) return hex('#2a1a12');
      return shade(hex('#a83c26'), 0.9 + grain(42, px, py) * 0.14);
    }
    // stitched seams along the edges
    if (isSide(face) && rim(x, y, w, h, 1)) return shade(canvas, 0.7);
    return shade(canvas, 0.9 + grain(43, px, py) * 0.14);
  },
  quiver(p) {
    const { box, face, x, y, w, h, px, py } = p;
    if (box === 8) return strap(p);
    if (box === 1) return face === 'up' ? null : shade(hex('#d9a441'), 0.9 + grain(44, px, py) * 0.12);
    if (box === 0) {
      if (face === 'up') return hex('#2a170a');
      // tooled leather: a gold band low down
      if (isSide(face) && y >= h - 2 * K && y < h - K) return hex('#d9a441');
      return shade(hex('#7a4a22'), 0.88 + grain(45, px, py) * 0.16);
    }
    // shafts and their feathers (red and white)
    if (box % 2 === 0) return shade(hex('#c9a36b'), 0.9 + grain(46, px, py) * 0.1);
    if (y > h - K / 2 && (x + y) % 3 === 0) return null;
    return (box === 5 ? hex('#f4f4f4') : hex('#d23a3a')).map((c) => Math.round(c * (0.9 + (y / h) * 0.1)));
  },
  katana(p) {
    const { box, face, x, y, w, h, px, py } = p;
    if (box === 4) return shade(hex('#8e1b22'), 0.88 + grain(47, px, py) * 0.14);
    if (box === 0) {
      // black lacquer with two red bands
      if (isSide(face) && (Math.abs(y - h * 0.2) < K * 0.6 || Math.abs(y - h * 0.62) < K * 0.6)) return hex('#b3202a');
      if (face === 'down') return hex('#c9a227');
      return shade(hex('#16161c'), 0.9 + grain(48, px, py) * 0.25 + (x / w) * 0.1);
    }
    if (box === 1 || box === 3) return shade(hex('#c9a227'), 0.88 + grain(49, px, py) * 0.16);
    // the handle's wrap: white diamonds on black
    const d = (Math.floor(y / (K / 2)) + Math.floor(x / (K / 2))) % 2;
    return d ? hex('#e9e4d8') : hex('#1a1a20');
  },
  guitar(p) {
    const { box, face, x, y, w, h, px, py, lp } = p;
    if (box === 4) return shade(hex('#2b2b33'), 0.9 + grain(50, px, py) * 0.14);
    const wood = hex('#c97b2c');
    if (box <= 1) {
      if (!isSide(face) || face === 'east' || face === 'west' || face === 'north') return shade(hex('#5e3415'), 0.9 + grain(51, px, py) * 0.14);
      // the front (towards the back of the player): a sound hole, strings, a dark edge
      if (rim(x, y, w, h, K / 2)) return hex('#3a210f');
      if (box === 0 && Math.hypot(lp[0], lp[1] - 2.7) < 1.2) return hex('#1a0f07');
      if (box === 0 && Math.abs(lp[0]) < 1.2 && Math.abs(lp[1] - 5) < 0.3) return hex('#2a170a');
      if (Math.abs(lp[0]) < 0.55 && (Math.floor(x) % 3 === 0)) return hex('#e8e2d0');
      return shade(wood, 0.9 + grain(52, px, py) * 0.12 + Math.sin(lp[1] * 1.7) * 0.03);
    }
    if (box === 2) {
      if (face === 'south' && y % K === 0) return hex('#c0c4cc');
      if (face === 'south' && Math.abs(x + 0.5 - w / 2) < 1) return hex('#e8e2d0');
      return shade(hex('#4a2c17'), 0.9 + grain(53, px, py) * 0.12);
    }
    // the head, with tuning pegs
    if (face === 'south' && (x === 1 || x === w - 2) && y % 3 === 1) return hex('#e6e6e6');
    return shade(hex('#2a1a0f'), 0.9 + grain(54, px, py) * 0.12);
  },
  jetpack(p) {
    const { box, face, x, y, w, h, px, py, gear } = p;
    if (box >= 7) return strap(p);
    if (gear.flame) {
      // white-hot at the nozzle, orange, then red at the end
      const f = y / h;
      if (face === 'up') return hex('#fff6c8');
      const c = f < 0.3 ? mix(hex('#fff6c8'), hex('#ffc93c'), f / 0.3) : mix(hex('#ffc93c'), hex('#ff4a1c'), (f - 0.3) / 0.7);
      if (f > 0.75 && grain(55, x, y) > 1.6 - f) return null;
      return shade(c, 0.95 + grain(56, px, py) * 0.08);
    }
    if (box <= 1) {
      if (face === 'up') return hex('#8b93a0');
      // a red stripe round each tank, rivets
      if (isSide(face) && Math.abs(y - h * 0.3) < K * 0.5) return hex('#d23a3a');
      return shade(hex('#b8c0cc'), 0.86 + (x / w) * 0.18 + grain(57, px, py) * 0.08);
    }
    if (box === 2) return shade(hex('#4a4f58'), 0.9 + grain(58, px, py) * 0.12);
    return face === 'down' ? hex('#15161b') : shade(hex('#3a3f47'), 0.9 + grain(59, px, py) * 0.12);
  },
  angelpack(p) {
    const { box, face, x, y, w, h, px, py } = p;
    if (box === 4) return shade(hex('#e3b341'), 0.9 + grain(60, px, py) * 0.14);
    const white = hex('#f4f6fb');
    // feathers: rows of rounded tips, the lower ones longer, a soft blue-grey between them
    if (box === 1 || box === 3) {
      if (y >= h - K && ((x / K) % 1.5) > 1) return null;
      return shade(mix(white, hex('#c8d4ea'), (y / h) * 0.5), 0.92 + grain(61, px, py) * 0.08);
    }
    if (!isSide(face)) return shade(white, 0.9);
    const row = Math.floor(y / (K * 1.5));
    if (y % (K * 1.5) === 0) return hex('#c8d4ea');
    if (y >= h - K && ((x + row) % 5) === 0) return hex('#c8d4ea');
    return shade(white, 0.92 + grain(62, px, row) * 0.08);
  },
  minichest(p) {
    const { box, face, x, y, w, h, px, py } = p;
    if (box >= 3) return strap(p);
    if (box === 2) return shade(hex('#c7c7c7'), 0.9 + grain(63, px, py) * 0.1);
    const wood = hex('#a8742f');
    if (rim(x, y, w, h, K / 2)) return hex('#4f3415');
    // planks
    if (isSide(face) && y % (K * 1.5) === 0) return shade(wood, 0.75);
    return shade(wood, 0.86 + grain(64, Math.floor(px / 2), py) * 0.2);
  },
  backshield(p) {
    const { box, face, x, y, w, h, px, py } = p;
    if (box >= 2) return strap(p);
    if (box === 1) return shade(hex('#cfd5df'), 0.9 + (x / w) * 0.15);
    if (face !== 'south') return shade(hex('#6b4423'), 0.88 + grain(65, px, py) * 0.14);
    // a gold rim, a blue field with the SlashClient slash across it
    if (rim(x, y, w, h, K * 0.75)) return shade(hex('#d8b43c'), 0.9 + grain(66, px, py) * 0.12);
    const sx = (x - w / 2) + (y - h / 2) * 0.55;
    if (Math.abs(sx) < K * 1.1) return hex('#f1d25a');
    return shade(hex('#2a4f9e'), 0.9 + grain(67, px, py) * 0.12);
  },
  cattail({ face, px, py, t }) {
    const grey = hex('#7d7d86');
    // dark rings round it, the tip dark
    if (t > 0.88 || Math.sin(t * 34) > 0.55) return fur(hex('#45454d'), 70, px, py, t);
    return fur(face === 'down' ? shade(grey, 1.15) : grey, 71, px, py, t);
  },
  foxtail({ face, px, py, t }) {
    if (t > 0.78 - grain(72, px, py) * 0.06) return fur(hex('#f6f2ea'), 73, px, py, t);
    return fur(face === 'down' ? hex('#ef9a54') : hex('#e07a2e'), 74, px, py, t);
  },
  kitsunetail({ face, px, py, t }) {
    if (t > 0.72 - grain(75, px, py) * 0.08) return fur(hex('#fbfaf6'), 76, px, py, t);
    // a red flame mark half way along, on top
    if (face === 'up' && Math.abs(t - 0.45) < 0.08) return hex('#d8433a');
    return fur(mix(hex('#e9c46a'), hex('#f6e3a8'), t), 77, px, py, t);
  },
  deviltail({ face, x, y, w, h, px, py, tail, lp }) {
    const red = hex('#c4161c');
    if (tail.extra) {
      // the spade: an arrowhead pointing back, cut out of a flat box
      const zf = (lp[2] - 0.6) / 3;
      const hw = zf < 0.3 ? 0.5 + (zf / 0.3) * 1.0 : 1.5 * (1 - (zf - 0.3) / 0.7);
      if (Math.abs(lp[0]) > hw) return null;
      if (face === 'north' || face === 'south') return null;
      return shade(red, face === 'up' ? 1 : 0.8);
    }
    void x; void y; void w; void h;
    return shade(face === 'up' ? red : hex('#8e0f13'), 0.9 + grain(78, px, py) * 0.14);
  },
  dragontail({ face, x, y, px, py, tail }) {
    if (tail.extra) return shade(hex('#e8dfc8'), 0.86 + y * 0.03);
    if (face === 'down') return shade(hex('#d9c98a'), 0.9 + grain(79, px, py) * 0.1);
    // scales: rows of little arcs
    const s = (Math.floor(y / 3) % 2) * 1.5;
    if ((x + s) % 3 < 0.8) return shade(hex('#2c5a29'), 0.9 + grain(80, px, py) * 0.1);
    return shade(hex('#3f7d3a'), 0.9 + grain(81, px, py) * 0.16);
  },
  wolftail({ face, px, py, t }) {
    if (t > 0.85) return fur(hex('#3b3d42'), 82, px, py, t);
    if (face === 'down') return fur(hex('#c9cbd0'), 83, px, py, t);
    return fur(face === 'up' ? hex('#5c5f66') : hex('#8a8d93'), 84, px, py, t);
  },
  squirreltail({ face, px, py, t }) {
    // reddish brown with lighter strands at the edges
    if (grain(85, px, py) > 0.8) return fur(hex('#d8894e'), 86, px, py, t);
    return fur(face === 'down' ? hex('#c96d3a') : hex('#b4582a'), 87, px, py, t);
  },
};

// ---------- matrices (the game's: a part's pivot, then its turn z, y, x) ----------

const mul = (a, b) => a.map((row, i) => b[0].map((_, j) => row.reduce((s, _, k) => s + a[i][k] * b[k][j], 0)));
function transform(t, r = [0, 0, 0]) {
  const [x, y, z] = r;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  const rx = [[1, 0, 0, 0], [0, cx, -sx, 0], [0, sx, cx, 0], [0, 0, 0, 1]];
  const ry = [[cy, 0, sy, 0], [0, 1, 0, 0], [-sy, 0, cy, 0], [0, 0, 0, 1]];
  const rz = [[cz, -sz, 0, 0], [sz, cz, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const tr = [[1, 0, 0, t[0]], [0, 1, 0, t[1]], [0, 0, 1, t[2]], [0, 0, 0, 1]];
  return mul(tr, mul(rz, mul(ry, rx)));
}
const apply = (m, p) => [0, 1, 2].map((i) => m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3]);
const IDENTITY = transform([0, 0, 0]);

/** Each box's place in the body's space, a tail at rest (standing, no cape). */
function placements(item) {
  if (item.slot === 'back') return item.boxes.map((b) => (b.pivot || b.rot ? transform(b.pivot ?? [0, 0, 0], b.rot) : IDENTITY));
  const out = [];
  item.chains.forEach((c, ci) => {
    let m = transform(TAIL_BASE);
    c.segments.forEach((s, si) => {
      const [pitch, yaw] = tailAngles(item, ci, si, 0, 0, 0, false);
      m = mul(m, transform([0, 0, 0], [pitch, yaw, 0]));
      out.push(m);
      for (const _ of s.extras ?? []) out.push(m);
      m = mul(m, transform([0, 0, s.size[2] - TAIL_OVERLAP]));
    });
  });
  return out;
}

// ---------- the pictures ----------

const out = path.join(assets, 'textures', 'gear');
mkdirSync(path.join(out, 'icon'), { recursive: true });
const items = [];
for (const item of GEAR) {
  const paint = PAINT[item.id];
  if (!paint) throw new Error(`No paint for ${item.id}`);
  const W = TW * K, H = TH * K;
  const tex = Buffer.alloc(W * H * 4);
  const uvs = gearLayout(item);
  const boxes = gearBoxes(item);
  const lengths = item.slot === 'tail' ? item.chains.map((c) => c.segments.length) : [];
  boxes.forEach(({ box: b, gear, tail }, box) => {
    for (const q of boxQuads(b, uvs[box])) {
      const us = q.corners.map((c) => c[3] * W), vs = q.corners.map((c) => c[4] * H);
      const u0 = Math.round(Math.min(...us)), u1 = Math.round(Math.max(...us));
      const v0 = Math.round(Math.min(...vs)), v1 = Math.round(Math.max(...vs));
      // the texel's point on the box, from the face's corners (u, v → x, y, z)
      const at = (u, v) => {
        const c = q.corners;
        const du = (c[0][3] - c[1][3]) * W, dv = (c[2][4] - c[1][4]) * H;
        const a = du ? (u - c[1][3] * W) / du : 0, bb = dv ? (v - c[1][4] * H) / dv : 0;
        return [0, 1, 2].map((i) => c[1][i] + a * (c[0][i] - c[1][i]) + bb * (c[2][i] - c[1][i]));
      };
      for (let ty = v0; ty < v1; ty++) for (let tx = u0; tx < u1; tx++) {
        const x = tx - u0, y = ty - v0;
        const lp = at(tx + 0.5, ty + 0.5);
        const t = tail ? (tail.segment + Math.max(0, Math.min(1, (lp[2] + TAIL_OVERLAP / 2) / b.size[2]))) / lengths[tail.chain] : 0;
        const c = paint({ box, face: q.face, x, y, w: u1 - u0, h: v1 - v0, px: Math.floor(tx / K), py: Math.floor(ty / K), gear, tail, t, lp });
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
  const r = (n) => Math.round(n * 10000) / 10000;
  const uvAt = (i) => uvs[i];
  if (item.slot === 'back') {
    items.push({ id: item.id, slot: item.slot, boxes: item.boxes.map((b, i) => ({
      from: b.from, size: b.size, inflate: b.inflate ?? 0, uv: uvAt(i), pivot: b.pivot ?? [0, 0, 0], rot: (b.rot ?? [0, 0, 0]).map(r), ...(b.flame ? { flame: true } : {}),
    })) });
  } else {
    let i = 0;
    items.push({ id: item.id, slot: item.slot, droop: item.droop, curl: item.curl, chains: item.chains.map((c) => ({
      spread: c.spread ?? 0, lift: c.lift ?? 0,
      segments: c.segments.map((s) => ({ size: s.size, uv: uvAt(i++), extras: (s.extras ?? []).map((e) => ({ from: e.from, size: e.size, uv: uvAt(i++) })) })),
    })) });
  }
}
// one line per item, for readable diffs
writeFileSync(path.join(assets, 'gear.json'), `{"texture": ${JSON.stringify(GEAR_TEXTURE)}, "tailBase": ${JSON.stringify(TAIL_BASE)}, "overlap": ${TAIL_OVERLAP}, "items": [\n${items.map((i) => `\t${JSON.stringify(i)}`).join(',\n')}\n]}\n`);
console.log(`${items.length} back items and tails -> ${out}`);

// ---------- the icons: a back item seen from behind, a tail from behind and the side, a little from above ----------

function icon(item, uvs, tex, W, H) {
  const view = transform([0, 0, 0], [0, Math.PI + (item.slot === 'tail' ? 0.95 : 0.3), 0]);
  const A = 0.35;
  const project = ([x, y, z]) => [x + A * z, y - A * z, z];
  const places = placements(item);
  const boxes = gearBoxes(item);
  const quads = boxes.flatMap(({ box: b, gear }, i) => gear?.strap ? [] : boxQuads(b, uvs[i]).map((q) => {
    const world = q.corners.map((c) => apply(view, apply(places[i], c)));
    // light from the viewer's upper left
    const e1 = world[1].map((v, k) => v - world[0][k]), e2 = world[3].map((v, k) => v - world[0][k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...n) || 1;
    const light = 0.6 + 0.45 * Math.abs((n[0] * -0.3 + n[1] * -0.5 + n[2] * -0.8) / len);
    return { light, corners: world.map((p, k) => [...project(p), q.corners[k][3], q.corners[k][4]]) };
  }));
  const xs = quads.flatMap((q) => q.corners.map((c) => c[0])), ys = quads.flatMap((q) => q.corners.map((c) => c[1]));
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  const s = (ICON - 4) / size;
  const ox = (ICON - (Math.max(...xs) - minX) * s) / 2, oy = (ICON - (Math.max(...ys) - minY) * s) / 2;
  const img = Buffer.alloc(ICON * ICON * 4);
  const depth = new Float32Array(ICON * ICON).fill(Infinity);
  for (const q of quads) {
    const c = q.corners.map((p) => [(p[0] - minX) * s + ox, (p[1] - minY) * s + oy, p[2], p[3], p[4]]);
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
        img[i] = Math.min(255, tex[ti] * q.light);
        img[i + 1] = Math.min(255, tex[ti + 1] * q.light);
        img[i + 2] = Math.min(255, tex[ti + 2] * q.light);
        img[i + 3] = 255;
      }
    }
  }
  return img;
}
