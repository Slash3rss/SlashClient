// Paints the SlashClient props (wheelbarrows, src/shared/props.ts) and writes them for the mod:
//   hud/src/main/resources/assets/slashclient-hud/textures/prop/<id>.png       the picture on the boxes
//   hud/src/main/resources/assets/slashclient-hud/textures/prop/icon/<id>.png  a small view of it for the menus
//   hud/src/main/resources/assets/slashclient-hud/props.json                   the parts and boxes, with where their pictures are
// (build.mjs copies the pictures to the launcher and the website.) Run with: node scripts/make-props.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { GRIP, HAND, HOLD, HOLD_CROUCHING, PROPS, PROP_SCALE as K, PROP_TEXTURE, WHEEL_RADIUS, propBoxes, propLayout, propModel, propQuads } from '../src/shared/props.ts';

const assets = 'hud/src/main/resources/assets/slashclient-hud';
const [TW, TH] = PROP_TEXTURE;
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
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
/** The same small unevenness for the same texel every time (wood and metal are never flat). */
function grain(seed, x, y) {
  let h = (seed * 374761393 + x * 668265263 + y * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) & 0xffff) / 0xffff;
}
const isEnd = (face) => face === 'north' || face === 'south';

/** Planks along the box's longest side: a board every 2 pixels, grain streaks along them. */
function wood(base, { face, x, y, w, h }, seed) {
  const along = w >= h ? x : y, across = w >= h ? y : x;
  const board = Math.floor(across / (2 * K));
  const streak = grain(seed + board, Math.floor(along / 3), Math.floor(across / 1.5)) * 0.14;
  let c = shade(base, 0.88 + streak + (board % 2) * 0.05);
  // the gap between boards
  if (across % (2 * K) === 0 && across > 0) c = shade(base, 0.62);
  return face === 'up' || face === 'down' ? shade(c, 0.95) : c;
}

/** Sheet metal: faint brushing, a darker rolled rim along the top edge, rivets at the corners. */
function metal(base, { face, x, y, w, h }, seed, shine) {
  let c = shade(base, 0.93 + grain(seed, Math.floor(x / 2), y) * 0.1);
  if (shine) {
    // a soft highlight sweeping across, as on polished gold
    const t = Math.sin((x + y * 0.6) / (w + h) * Math.PI * 2) * 0.5 + 0.5;
    c = mix(c, hex('#fff2b3'), t * 0.35);
  }
  if (face !== 'up' && face !== 'down' && y < K * 0.75) c = shade(base, shine ? 1.18 : 1.12);
  if (face !== 'up' && face !== 'down' && y >= K * 0.75 && y < K) c = shade(base, 0.7);
  const rx = Math.min(x, w - 1 - x), ry = h - 1 - y;
  if (face !== 'up' && face !== 'down' && rx >= K * 0.4 && rx < K * 0.9 && ry >= K * 0.4 && ry < K * 0.9) return shade(base, 0.6);
  return c;
}

const PALETTES = {
  classic: { frame: '#9a6a3a', tub: '#9aa4ad', rim: '#d23a2a', grip: '#2a2420', shine: false, woodTub: false },
  gold: { frame: '#e0a92a', tub: '#f2c230', rim: '#f6d76a', grip: '#5a3416', shine: true, woodTub: false },
  flowers: { frame: '#8a5a30', tub: '#b07a44', rim: '#3f8f4a', grip: '#2a2420', shine: false, woodTub: true },
};
const PETALS = { petal_red: '#d8283c', petal_yellow: '#f4cf2a', petal_blue: '#3b6fe0', petal_pink: '#f08ac0', petal_white: '#f2f2ec', petal_orange: '#f08a24' };

/** One texel of a box: { mat, box (its index), face, x, y (in the face), w, h (the face's size), look } → [r, g, b] or null. */
function paint(t) {
  const p = PALETTES[t.look];
  const { mat, face, x, y, w, h, box } = t;
  switch (mat) {
    case 'frame':
      return p.shine ? metal(hex(p.frame), t, 30 + box, true) : wood(hex(p.frame), t, 30 + box);
    case 'grip': {
      // wound handles: a ring every pixel
      const along = Math.max(w, h) === w ? x : y;
      return shade(hex(p.grip), (Math.floor(along / (K / 2)) % 2 ? 0.85 : 1.05) * (0.92 + grain(40, x, y) * 0.1));
    }
    case 'tub':
      return p.woodTub ? wood(hex(p.tub), t, 50 + box) : metal(hex(p.tub), t, 50 + box, p.shine);
    case 'axle':
      return shade(hex('#4a4d52'), 0.9 + grain(60, x, y) * 0.15);
    case 'hub':
      return face === 'west' || face === 'east' ? shade(hex(p.rim), 0.75) : shade(hex('#55585e'), 1);
    case 'tire': {
      const rubber = shade(hex('#26262a'), 0.9 + grain(70, x, y) * 0.15);
      if (face !== 'west' && face !== 'east') {
        // the tread: ribs across the tyre
        const along = Math.max(w, h) === w ? x : y;
        return Math.floor(along / K) % 2 ? shade(rubber, 0.78) : rubber;
      }
      // the side: tyre, rim, spokes from the hub, a white valve on one spoke so the turning shows
      const cx = x + 0.5 - w / 2, cy = y + 0.5 - h / 2;
      const r = Math.hypot(cx, cy) / K;
      if (r > WHEEL_RADIUS - 1.1) return rubber;
      if (r > WHEEL_RADIUS - 1.6) return shade(hex(p.rim), 1.1);
      const spoke = (h > w ? Math.abs(cx) : Math.abs(cy)) < K * 0.55;
      if (box === 0 && spoke && cy < 0 && r > 1.5 && r < 2.5) return hex('#f4f4f4');
      if (spoke) return shade(hex(p.rim), 1.15);
      return shade(hex('#2c2c30'), 0.9 + grain(71, x, y) * 0.1);
    }
    case 'soil': {
      const c = shade(hex('#5a3c24'), 0.8 + grain(80, x, y) * 0.35);
      return grain(81, Math.floor(x / 2), Math.floor(y / 2)) > 0.9 ? shade(c, 0.6) : c;
    }
    case 'stem':
      return shade(hex('#3f8f2e'), 0.85 + grain(90, x, y) * 0.2);
    case 'bloom':
      return hex('#ffd23a');
    default: {
      const petal = hex(PETALS[mat]);
      // the blossom's top is lighter in the middle, its sides darker towards the stem
      if (face === 'up') return mix(petal, hex('#ffffff'), Math.max(0, 0.35 - Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) / (w * 1.4)));
      return shade(petal, isEnd(face) || face === 'west' || face === 'east' ? 0.85 : 0.7);
    }
  }
}

// ---------- the pictures ----------

const out = path.join(assets, 'textures', 'prop');
mkdirSync(path.join(out, 'icon'), { recursive: true });
const items = [];
for (const item of PROPS) {
  const model = propModel(item);
  const W = TW * K, H = TH * K;
  const tex = Buffer.alloc(W * H * 4);
  const uvs = propLayout(model);
  propBoxes(model).forEach(({ box: b }, box) => {
    for (const q of propQuads(b, uvs[box])) {
      const us = q.corners.map((c) => c[3] * W), vs = q.corners.map((c) => c[4] * H);
      const u0 = Math.round(Math.min(...us)), u1 = Math.round(Math.max(...us));
      const v0 = Math.round(Math.min(...vs)), v1 = Math.round(Math.max(...vs));
      for (let ty = v0; ty < v1; ty++) for (let tx = u0; tx < u1; tx++) {
        const c = paint({ look: item.look, mat: b.mat, box, face: q.face, x: tx - u0, y: ty - v0, w: u1 - u0, h: v1 - v0 });
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
  writeFileSync(path.join(out, 'icon', `${item.id}.png`), png(ICON, ICON, icon(model, uvs, tex, W, H)));
  let n = 0;
  const part = (p) => ({
    name: p.name,
    pose: p.pose ?? [0, 0, 0, 0, 0, 0],
    boxes: (p.boxes ?? []).map((b) => ({ from: b.from, size: b.size, inflate: b.inflate ?? 0, uv: uvs[n++] })),
    children: (p.children ?? []).map(part),
  });
  items.push({ id: item.id, model: part(model) });
}
writeFileSync(path.join(assets, 'props.json'), JSON.stringify({
  texture: PROP_TEXTURE, wheelRadius: WHEEL_RADIUS, grip: GRIP, hold: HOLD, holdCrouching: HOLD_CROUCHING, hand: HAND, items,
}) + '\n');
console.log(`${items.length} props -> ${out}`);

// ---------- the icons: the prop seen from the side and a little from the front and above ----------

/** The game's turn of a part: z, then y, then x (a 3×3 matrix, rows). */
function rotation(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const X = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]], Y = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], Z = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  return mul(mul(Z, Y), X);
}
function mul(a, b) {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}
function apply(m, v) {
  return [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
}

function icon(model, uvs, tex, W, H) {
  // pushed as in the game (tilted so the grips are up), seen from its right side, a little from the front and above
  const view = mul(rotation(0.42, 0, 0), rotation(0, -1.05, 0));
  const quads = [];
  let n = 0;
  const walk = (p, m, t) => {
    const [x, y, z, rx, ry, rz] = p.pose ?? [0, 0, 0, 0, 0, 0];
    const at = [t[0] + apply(m, [x, y, z])[0], t[1] + apply(m, [x, y, z])[1], t[2] + apply(m, [x, y, z])[2]];
    const turn = mul(m, rotation(rx, ry, rz));
    for (const b of p.boxes ?? []) {
      for (const q of propQuads(b, uvs[n])) {
        const corners = q.corners.map((c) => {
          const w = apply(turn, c.slice(0, 3));
          return [...apply(view, [w[0] + at[0], w[1] + at[1], w[2] + at[2]]), c[3], c[4]];
        });
        quads.push(corners);
      }
      n++;
    }
    for (const c of p.children ?? []) walk(c, turn, at);
  };
  walk(model, rotation(0.27, 0, 0), [0, 0, 0]);
  const xs = quads.flatMap((q) => q.map((c) => c[0])), ys = quads.flatMap((q) => q.map((c) => c[1]));
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  const s = (ICON - 4) / size;
  const ox = (ICON - (Math.max(...xs) - minX) * s) / 2, oy = (ICON - (Math.max(...ys) - minY) * s) / 2;
  const img = Buffer.alloc(ICON * ICON * 4);
  const depth = new Float32Array(ICON * ICON).fill(Infinity);
  // light from the top front (y is down; the viewer looks along +z)
  const light = [0.3, -0.8, -0.5];
  const ll = Math.hypot(...light);
  for (const q of quads) {
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
    const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(...nrm) || 1;
    const lit = 0.55 + 0.5 * Math.abs((nrm[0] * light[0] + nrm[1] * light[1] + nrm[2] * light[2]) / nl / ll);
    const c = q.map((p) => [(p[0] - minX) * s + ox, (p[1] - minY) * s + oy, p[2], p[3], p[4]]);
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
        const tx = Math.max(0, Math.min(W - 1, Math.floor(u * W))), ty = Math.max(0, Math.min(H - 1, Math.floor(v * H)));
        const ti = (ty * W + tx) * 4;
        if (tex[ti + 3] === 0) continue;
        depth[py * ICON + px] = z;
        const i = (py * ICON + px) * 4;
        img[i] = Math.min(255, tex[ti] * lit);
        img[i + 1] = Math.min(255, tex[ti + 1] * lit);
        img[i + 2] = Math.min(255, tex[ti + 2] * lit);
        img[i + 3] = 255;
      }
    }
  }
  return img;
}
