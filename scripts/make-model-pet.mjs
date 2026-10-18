// Turns a Blockbench item model (Java block/item model JSON with its picture) into a SlashClient pet:
// the game draws pets as entity models (boxes with the box layout of their picture), so every face's
// picture is copied, through its place in 3D, into a new box-layout picture (each animation frame).
//   hud/src/main/resources/assets/slashclient-hud/textures/pet/<id>_<frame>.png  the pictures
//   hud/src/main/resources/assets/slashclient-hud/textures/pet/icon/<id>.png     a view of it for the menus
//   hud/src/main/resources/assets/slashclient-hud/pet/<id>.json                  the boxes for the mod
//   src/renderer/ourPetModels.ts                                                 the same for the 3D previews
// (build.mjs copies the pictures to the launcher and the website.)
// Run with: node scripts/make-model-pet.mjs [model.json] [picture.png] [id]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { boxQuads } from '../src/shared/clothing.ts';

const pack = '/Users/slash3rss/Github/SkyUP-Resourcepack/assets/skyup';
const [modelPath = `${pack}/models/item/przedmioty/czapki/podpis_haze.json`, picturePath = `${pack}/textures/item/przedmioty/czapki/podpis_haze.png`, id = 'duszek_haze'] = process.argv.slice(2);
const assets = 'hud/src/main/resources/assets/slashclient-hud';
/** The new picture: 64×64 model pixels (as boxQuads expects), painted 4× finer. */
const TW = 64, TH = 64, K = 4;

// ---------- PNG ----------

function decodePng(buf) {
  let o = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), t = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; if (d[8] !== 8 || (type !== 6 && type !== 2)) throw new Error('Only 8-bit RGB(A) pictures'); }
    if (t === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4), prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = (cur[i] + p) & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) px[(y * w + x) * 4 + k] = k < bpp ? cur[x * bpp + k] : 255;
    cur.copy(prev);
  }
  return { w, h, px };
}
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- the model, in the entity models' space ----------

const model = JSON.parse(readFileSync(modelPath, 'utf8'));
const src = decodePng(readFileSync(picturePath));
// a picture of several frames, one under another (an .mcmeta animation): each frame is square
const frames = Math.max(1, Math.floor(src.h / src.w));
const S = src.w / 16;

// item models: 0..16, y up; entity models: y down, the feet 24 pixels under the origin (as the
// game's mobs, which the pets are placed like). Both face north (-z): turned half round about z.
const bottom = Math.min(...model.elements.map((e) => e.from[1]));
const toEntity = ([x, y, z]) => [8 - x, 24 + bottom - y, z - 8];
const toItem = ([x, y, z]) => [8 - x, 24 + bottom - y, z + 8];
// the entity face a box face is, and the item model's face it shows
const ITEM_FACE = { north: 'north', south: 'south', west: 'east', east: 'west', down: 'up', up: 'down' };
const DEG = Math.PI / 180;

const parts = model.elements.map((e) => {
  const lo = toEntity([e.to[0], e.to[1], e.from[2]]);
  // a leaf (no thickness) gets a hair of it: its top and underside then lie apart and never fight
  const size = [0, 1, 2].map((i) => e.to[i] - e.from[i] || 0.01);
  const r = e.rotation ?? { angle: 0, axis: 'y', origin: [8, 8, 8] };
  const pivot = toEntity(r.origin);
  // turning the space half round about z keeps a turn about z and reverses those about x and y
  const a = r.angle * DEG;
  const rotation = r.axis === 'x' ? [-a, 0, 0] : r.axis === 'y' ? [0, -a, 0] : [0, 0, a];
  return { element: e, pivot, rotation, from: [0, 1, 2].map((i) => lo[i] - pivot[i]), size };
});

// each box's place in the new picture: rows from the top left
{
  let x = 0, y = 0, row = 0;
  for (const p of parts) {
    const [w, h, d] = p.size.map(Math.ceil);
    const bw = 2 * (w + d), bh = d + h;
    if (x + bw > TW) { x = 0; y += row; row = 0; }
    p.uv = [x, y];
    x += bw;
    row = Math.max(row, bh);
  }
}

/** Where on an item model's face (its own uv, 0..16) a point of the box is. */
function itemUv(e, face, [x, y, z]) {
  const f = e.from, t = e.to;
  const span = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const [s, r] = {
    north: [span(t[0], f[0], x), span(t[1], f[1], y)],
    south: [span(f[0], t[0], x), span(t[1], f[1], y)],
    west: [span(f[2], t[2], z), span(t[1], f[1], y)],
    east: [span(t[2], f[2], z), span(t[1], f[1], y)],
    up: [span(f[0], t[0], x), span(f[2], t[2], z)],
    down: [span(f[0], t[0], x), span(t[2], f[2], z)],
  }[face];
  const [u1, v1, u2, v2] = e.faces[face].uv;
  const rot = e.faces[face].rotation ?? 0;
  // a face's picture turned in quarters
  const [ss, rr] = rot === 90 ? [r, 1 - s] : rot === 180 ? [1 - s, 1 - r] : rot === 270 ? [1 - r, s] : [s, r];
  return [u1 + ss * (u2 - u1), v1 + rr * (v2 - v1), Math.min(u1, u2), Math.max(u1, u2), Math.min(v1, v2), Math.max(v1, v2)];
}

const pictures = [];
for (let frame = 0; frame < frames; frame++) {
  const W = TW * K, H = TH * K, out = Buffer.alloc(W * H * 4);
  for (const p of parts) {
    for (const q of boxQuads({ bone: 'head', from: p.from, size: p.size }, p.uv)) {
      const face = ITEM_FACE[q.face];
      if (!p.element.faces[face]) continue;
      const [c0, c1, c2, c3] = q.corners;
      const u1 = c1[3] * W, u2 = c0[3] * W, v1 = c0[4] * H, v2 = c3[4] * H;
      const lerp = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
      for (let ty = Math.round(Math.min(v1, v2)); ty < Math.round(Math.max(v1, v2)); ty++) {
        for (let tx = Math.round(Math.min(u1, u2)); tx < Math.round(Math.max(u1, u2)); tx++) {
          const a = (tx + 0.5 - u1) / (u2 - u1), b = (ty + 0.5 - v1) / (v2 - v1);
          const local = lerp(lerp(c1, c0, a), lerp(c2, c3, a), b).slice(0, 3);
          const point = toItem(local.map((v, i) => v + p.pivot[i]));
          const [u, v, umin, umax, vmin, vmax] = itemUv(p.element, face, point);
          const sx = Math.min(Math.ceil(umax * S) - 1, Math.max(Math.floor(umin * S), Math.floor(u * S)));
          const sy = Math.min(Math.ceil(vmax * S) - 1, Math.max(Math.floor(vmin * S), Math.floor(v * S)));
          if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.w) continue;
          src.px.copy(out, (ty * W + tx) * 4, ((sy + frame * src.w) * src.w + sx) * 4, ((sy + frame * src.w) * src.w + sx) * 4 + 4);
        }
      }
    }
  }
  pictures.push(out);
}

// see-through boxes (a ghost's body) are drawn last, so what is inside them still shows through
for (const p of parts) {
  let seeThrough = false;
  for (const q of boxQuads({ bone: 'head', from: p.from, size: p.size }, p.uv)) {
    const us = q.corners.map((c) => c[3] * TW * K), vs = q.corners.map((c) => c[4] * TH * K);
    for (let y = Math.round(Math.min(...vs)); y < Math.round(Math.max(...vs)); y++) for (let x = Math.round(Math.min(...us)); x < Math.round(Math.max(...us)); x++) {
      const a = pictures[0][(y * TW * K + x) * 4 + 3];
      if (a > 0 && a < 200) seeThrough = true;
    }
  }
  p.seeThrough = seeThrough;
}
parts.sort((a, b) => Number(a.seeThrough) - Number(b.seeThrough));

const dir = path.join(assets, 'textures', 'pet');
mkdirSync(path.join(dir, 'icon'), { recursive: true });
pictures.forEach((px, f) => writeFileSync(path.join(dir, `${id}_${f}.png`), encodePng(TW * K, TH * K, px)));
mkdirSync(path.join(assets, 'pet'), { recursive: true });
const round = (v) => Math.round(v * 1e5) / 1e5;
const boxes = parts.map((p) => ({ pivot: p.pivot.map(round), rotation: p.rotation.map(round), from: p.from.map(round), size: p.size, uv: p.uv }));
writeFileSync(path.join(assets, 'pet', `${id}.json`), `{"texture": [${TW}, ${TH}], "frames": ${frames}, "boxes": [\n${boxes.map((b) => `\t${JSON.stringify(b)}`).join(',\n')}\n]}\n`);

// ---------- for the 3D previews: the faces of each box, as the game builds them ----------

const ts = 'src/renderer/ourPetModels.ts';
const previous = (() => { try { return readFileSync(ts, 'utf8'); } catch { return ''; } })();
const known = JSON.parse(/OUR_PET_MODELS[^=]*= (\{.*\});/.exec(previous)?.[1] ?? '{}');
const knownFrames = JSON.parse(/OUR_PET_FRAMES[^=]*= (\{.*\});/.exec(previous)?.[1] ?? '{}');
known[id] = {
  name: 'root', pose: [0, 0, 0, 0, 0, 0], quads: [],
  children: parts.map((p, i) => ({
    name: `box${i}`, pose: [...p.pivot, ...p.rotation].map(round), children: [],
    quads: boxQuads({ bone: 'head', from: p.from, size: p.size }, p.uv).map((q) => q.corners.flat().map(round)),
  })),
};
knownFrames[id] = frames;
writeFileSync(ts, `/**
 * Our own pets' shapes (made from Blockbench models by scripts/make-model-pet.mjs), in the same form as
 * the game's (petModels.ts); their pictures are ours (textures/pet/<id>_<frame>.png), one per second.
 */
import type { PetPart } from './petModels';
export const OUR_PET_MODELS: Record<string, PetPart> = ${JSON.stringify(known)};
export const OUR_PET_FRAMES: Record<string, number> = ${JSON.stringify(knownFrames)};
`);

// ---------- the icon: seen from the front, a little from above and the side ----------

const ICON = 64;
{
  const rotate = ([x, y, z], [rx, ry, rz]) => {
    // the game's order: z, then y, then x (applied to the point: x first)
    let p = [x, y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    p = [p[0] * Math.cos(ry) + p[2] * Math.sin(ry), p[1], -p[0] * Math.sin(ry) + p[2] * Math.cos(ry)];
    return [p[0] * Math.cos(rz) - p[1] * Math.sin(rz), p[0] * Math.sin(rz) + p[1] * Math.cos(rz), p[2]];
  };
  const A = 0.45;
  const quads = parts.flatMap((p) => boxQuads({ bone: 'head', from: p.from, size: p.size }, p.uv).map((q) => ({
    face: q.face,
    corners: q.corners.map((c) => {
      const [x, y, z] = rotate(c.slice(0, 3), p.rotation).map((v, i) => v + p.pivot[i]);
      return [x + A * z, y - A * z, z, c[3], c[4]];
    }),
  })));
  const xs = quads.flatMap((q) => q.corners.map((c) => c[0])), ys = quads.flatMap((q) => q.corners.map((c) => c[1]));
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
  const s = (ICON - 4) / Math.max(w, h), ox = (ICON - w * s) / 2, oy = (ICON - h * s) / 2;
  const img = Buffer.alloc(ICON * ICON * 4), depth = new Float32Array(ICON * ICON).fill(Infinity);
  const LIGHT = { down: 1.05, north: 0.9, east: 0.72, west: 0.72, south: 0.6, up: 0.5 };
  const tex = pictures[0], W = TW * K, H = TH * K;
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
        const ti = (Math.min(H - 1, Math.floor(v * H)) * W + Math.min(W - 1, Math.floor(u * W))) * 4;
        if (tex[ti + 3] < 26) continue;
        depth[py * ICON + px] = z;
        const i = (py * ICON + px) * 4, l = LIGHT[q.face];
        for (let k = 0; k < 3; k++) img[i + k] = Math.min(255, tex[ti + k] * l);
        img[i + 3] = 255;
      }
    }
  }
  writeFileSync(path.join(dir, 'icon', `${id}.png`), encodePng(ICON, ICON, img));
}
console.log(`${id}: ${parts.length} boxes, ${frames} frame(s) -> ${dir}`);
