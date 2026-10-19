// Paints the SlashClient suits (full-body costumes, src/shared/suits.ts) and writes them for the mod:
//   hud/src/main/resources/assets/slashclient-hud/textures/suit/<id>.png       the picture on the boxes
//   hud/src/main/resources/assets/slashclient-hud/textures/suit/icon/<id>.png  a small view of it for the menus
//   hud/src/main/resources/assets/slashclient-hud/suits.json                   the boxes, with where their pictures are
// (build.mjs copies the pictures to the launcher and the website.) Run with: node scripts/make-suits.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { boxQuads } from '../src/shared/clothing.ts';
import { SUITS, SUIT_SCALE as K, SUIT_TEXTURE, slimSuitBox, suitLayout, suitPart } from '../src/shared/suits.ts';

const assets = 'hud/src/main/resources/assets/slashclient-hud';
const [TW, TH] = SUIT_TEXTURE;
const ICON = 64;
/** Where the parts the boxes hang on are, in the player model (the neck is 0). */
const BONES = { head: [0, 0, 0], body: [0, 0, 0], right_arm: [-5, 2, 0], left_arm: [5, 2, 0], right_leg: [-1.9, 12, 0], left_leg: [1.9, 12, 0] };

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
/** The same small unevenness for the same model pixel every time (cloth and metal are never flat). */
function grain(seed, x, y) {
  let h = (seed * 374761393 + x * 668265263 + y * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) & 0xffff) / 0xffff;
}
/** A colour with a little grain on each model pixel. */
const tone = (c, seed, px, py, amp = 0.14) => shade(hex(c), 1 - amp / 2 + grain(seed, px, py) * amp);
const isSide = (face) => face === 'north' || face === 'south' || face === 'east' || face === 'west';
/** The side of a limb that faces away from the body. */
const outer = (bone) => (bone.startsWith('right') ? 'west' : 'east');
/** Inside an ellipse round (cx, cy) with radii rx, ry (model pixels). */
const inEllipse = (mx, my, cx, cy, rx, ry) => ((mx - cx) / rx) ** 2 + ((my - cy) / ry) ** 2 <= 1;

/**
 * How each suit is painted: called for every texel of every face with { name (the box's), bone,
 * face, x, y (texel in the face, from its top left as it appears in the picture), w, h (the face's
 * size in texels), mx, my, mw, mh (the same in model pixels, mx and my at the texel's middle),
 * px, py (the model pixel in the picture) } → [r, g, b] or null (see-through).
 * The faces: north is the front, south the back, west the wearer's right, east the left,
 * down the top of a box and up its bottom (the game's names, with y pointing down).
 */
const PAINT = {
  astronaut({ name, bone, face, mx, my, mw, mh, px, py }) {
    const white = tone('#eef1f5', 1, px, py, 0.06);
    const grey = tone('#aeb6c2', 2, px, py, 0.08);
    switch (name) {
      case 'head': {
        if (face === 'up') return hex('#4a5260');
        if (face === 'north') {
          // the gold visor, rounded, with a sky reflected in it
          const dx = Math.max(0, Math.abs(mx - mw / 2) - 2.2), dy = Math.max(0, Math.abs(my - 4.2) - 1.2);
          const r = Math.hypot(dx, dy);
          if (r < 1.3) {
            if (r > 1.0) return hex('#d9a520');
            const t = (my - 2) / 4.5;
            const glass = mix(hex('#3a5fa8'), hex('#0d1424'), Math.max(0, Math.min(1, t)));
            const streak = Math.abs((mx - mw / 2) + (my - 4.2) * 0.9 + 1.2) < 0.35;
            return streak ? mix(glass, hex('#ffffff'), 0.55) : glass;
          }
          // a little lamp on each side of the visor
          if (my > 6.2 && my < 7 && (Math.abs(mx - 1) < 0.4 || Math.abs(mx - (mw - 1)) < 0.4)) return hex('#9fe7ff');
        }
        // a grey rim round the bottom (where it locks to the suit)
        if (isSide(face) && my > mh - 0.8) return shade(grey, 0.85);
        return white;
      }
      case 'body': {
        if (my > 8.6 && my < 9.6) return face === 'north' && Math.abs(mx - mw / 2) < 0.7 ? hex('#4a5260') : grey;
        if (face === 'north') {
          // a blue mission patch with a star, on the wearer's left
          if (inEllipse(mx, my, mw - 1.6, 1.6, 0.9, 0.9)) return inEllipse(mx, my, mw - 1.6, 1.6, 0.35, 0.35) ? hex('#ffffff') : hex('#2f5bd0');
          if (my > 6.3 && my < 6.9) return hex('#f08a24');
        }
        if (face === 'east' || face === 'west') return my > 1 && my < 8 && Math.abs(mx - mw / 2) < 0.8 ? grey : white;
        return white;
      }
      case 'panel': {
        if (face !== 'north') return hex('#5b6472');
        if (mx < 2.2 && my > 0.6 && my < 2.4 && mx > 0.5) return mix(hex('#4ee6ff'), hex('#1e6f86'), my / 2.4);
        const lamps = ['#ff4a4a', '#5ce05c', '#ffd23f'];
        for (let i = 0; i < 3; i++) if (inEllipse(mx, my, 2.9 + i * 0.75, 1.5, 0.28, 0.28)) return hex(lamps[i]);
        return tone('#3a414d', 3, px, py, 0.1);
      }
      case 'pack': {
        if (face === 'south') {
          if (mx > 1 && mx < mw - 1 && my > 1 && my < 4 && Math.floor(my * 2) % 2 === 0) return hex('#5b6472');
          if (inEllipse(mx, my, mw / 2, 5.8, 1.1, 1.1)) return grey;
        }
        if (isSide(face) && (my < 0.5 || my > mh - 0.5)) return grey;
        return white;
      }
      case 'arm': {
        if (my > 9.5 || face === 'up') return tone('#9aa3b0', 4, px, py, 0.1);
        if (my > 2.6 && my < 3.4) return hex('#f08a24');
        return face === outer(bone) && my > 4 && my < 8 && Math.abs(mx - mw / 2) < 0.6 ? grey : white;
      }
      case 'leg':
        if (face === 'north' && my > 4.5 && my < 6.8 && mx > 0.6 && mx < mw - 0.6) return grey;
        return white;
      case 'boot':
        if (face === 'up' || (isSide(face) && my > mh - 1)) return hex('#4a5260');
        return tone('#9aa3b0', 5, px, py, 0.1);
    }
    return white;
  },

  samurai({ name, bone, face, mx, my, mw, mh, px, py }) {
    const red = tone('#a31f24', 10, px, py, 0.12);
    const black = tone('#1d1b20', 11, px, py, 0.12);
    const gold = tone('#d4a640', 12, px, py, 0.12);
    /** Lacquered plates in rows, laced together with dark blue cord. */
    const plates = (c, rowH = 2) => {
      const r = my / rowH, f = r - Math.floor(r);
      if (f < 0.12) return shade(c, 0.6);
      if (f < 0.55 && Math.floor(mx * 2) % 2 === 0) return tone('#23305e', 13, px, py, 0.1);
      return c;
    };
    switch (name) {
      case 'head': {
        if (face === 'up') return black;
        if (face === 'north') {
          // the helmet's brow, the eyes in shadow, a red mask with a golden moustache below
          if (my < 2.4) return Math.floor(mx) % 2 ? black : shade(black, 1.3);
          if (my < 2.9) return gold;
          if (my < 4.4) return inEllipse(mx, my, 2.2, 3.7, 0.5, 0.35) || inEllipse(mx, my, mw - 2.2, 3.7, 0.5, 0.35) ? hex('#f4e9c8') : hex('#120c0c');
          if (my > 5 && my < 5.5 && Math.abs(mx - mw / 2) < 2 && Math.abs(mx - mw / 2) > 0.3) return gold;
          if (my > 6.3 && my < 6.6 && Math.abs(mx - mw / 2) < 1.3) return hex('#120c0c');
          return red;
        }
        // the bowl: black lacquer with gold ridges from the top down
        return Math.floor(mx + 0.5) % 2 === 0 && face !== 'down' ? shade(black, 1.35) : face === 'down' && Math.abs(mx - mw / 2) < 0.5 ? gold : black;
      }
      case 'crest':
      case 'horn':
        return face === 'south' ? shade(gold, 0.8) : gold;
      case 'guard':
        if (face === 'down') return black;
        if (face === 'up') return shade(red, 0.7);
        return plates(red, 1);
      case 'body': {
        if (face === 'down') return black;
        if (my > 8.4 && my < 9.4) return tone('#23305e', 14, px, py, 0.1);
        // a golden crest in a circle on the chest
        if (face === 'north' && inEllipse(mx, my, mw / 2, 3, 1.2, 1.2)) return inEllipse(mx, my, mw / 2, 3, 0.85, 0.85) ? black : gold;
        if (face === 'north' && inEllipse(mx, my, mw / 2, 3, 0.45, 0.45)) return gold;
        return plates(red);
      }
      case 'sode':
        if (face === 'down') return black;
        if (face === 'up') return shade(red, 0.6);
        return my > mh - 0.4 ? gold : plates(red, 1.25);
      case 'skirt':
        if (face === 'down') return black;
        if (face === 'up') return shade(red, 0.5);
        // separate panels hang round the hips
        if (isSide(face) && Math.abs((mx % 2.67) - 2.67) < 0.15) return shade(red, 0.45);
        return my > mh - 0.4 ? gold : plates(red, 1.33);
      case 'arm':
        if (my > 9.6 || face === 'up') return tone('#3b2a1f', 15, px, py, 0.12);
        // dark sleeves with small plates and chain stitched on
        return (Math.floor(mx * 2) + Math.floor(my * 2)) % 4 === 0 ? shade(gold, 0.75) : face === outer(bone) && my > 4 ? plates(shade(red, 0.85), 1.5) : black;
      case 'leg':
        return face === 'north' || face === outer(bone) ? plates(shade(red, 0.9), 1.6) : black;
      case 'boot':
        if (face === 'up' || (isSide(face) && my > mh - 0.6)) return tone('#c9a66b', 16, px, py, 0.1);
        return black;
    }
    return red;
  },

  pandasuit({ name, bone, face, mx, my, mw, mh, px, py }) {
    const white = tone('#f2f2ee', 20, px, py, 0.08);
    const black = tone('#1d1d22', 21, px, py, 0.12);
    switch (name) {
      case 'head': {
        if (face !== 'north') return white;
        // black patches round the eyes, the eyes shining in them
        for (const cx of [2.2, mw - 2.2]) {
          const side = cx < mw / 2 ? -1 : 1;
          if (inEllipse(mx, my, cx + side * 0.15, 4.4, 0.4, 0.45)) return inEllipse(mx, my, cx + side * 0.15 - 0.1, 4.3, 0.15, 0.15) ? hex('#ffffff') : hex('#0a0a0c');
          if (inEllipse(mx, my, cx, 4.6, 1.35, 1.1)) return black;
        }
        return white;
      }
      case 'ear':
        return face === 'north' && inEllipse(mx, my, mw / 2, mh / 2 + 0.2, 0.8, 0.8) ? tone('#3a3a42', 22, px, py) : black;
      case 'snout':
        if (face === 'north' || face === 'down') {
          if (face === 'north' && inEllipse(mx, my, mw / 2, 0.75, 0.8, 0.55)) return hex('#141418');
          if (face === 'north' && Math.abs(mx - mw / 2) < 0.15 && my > 1 && my < 2.2) return hex('#141418');
          if (face === 'north' && my > 2.1 && my < 2.35 && Math.abs(mx - mw / 2) < 0.8) return hex('#141418');
        }
        return white;
      case 'body':
        // black over the shoulders and round the arms, a softer belly
        if (my < 2.6 || face === 'down') return black;
        if (face === 'north' && inEllipse(mx, my, mw / 2, 7.4, 2.6, 3.4)) return tone('#faf6ea', 23, px, py, 0.06);
        return white;
      case 'arm':
        return black;
      case 'leg':
        return black;
      case 'boot':
        // pads under the feet, little claws in front
        if (face === 'up') return inEllipse(mx, my, mw / 2, mh / 2 + 0.4, 1.2, 1) || (Math.abs(my - 0.9) < 0.4 && Math.floor(mx) % 2 === 0) ? hex('#5a4a4e') : black;
        if (face === 'north' && my > mh - 0.8 && Math.floor(mx + 0.5) % 1.5 < 0.4) return hex('#d8d8d8');
        return black;
      case 'tail':
        return white;
    }
    return white;
  },

  dinosuit({ name, bone, face, mx, my, mw, mh, px, py }) {
    const green = tone('#45a049', 30, px, py, 0.12);
    const spot = grain(31, Math.floor(px / 2), Math.floor(py / 2)) > 0.84;
    const skin = spot ? tone('#2e6b30', 32, px, py) : green;
    const belly = tone('#d6e6a0', 33, px, py, 0.08);
    const tooth = hex('#fbfaf2');
    switch (name) {
      case 'head': {
        if (face !== 'north') return face === 'up' ? belly : skin;
        // round eyes with slit pupils, a brow over each
        for (const cx of [1.8, mw - 1.8]) {
          if (inEllipse(mx, my, cx, 2.6, 1.05, 0.95)) return Math.abs(mx - cx) < 0.2 ? hex('#121212') : inEllipse(mx, my, cx, 2.6, 0.8, 0.75) ? hex('#ffd23f') : hex('#ffffff');
          if (my > 1.2 && my < 1.6 && Math.abs(mx - cx) < 1.2) return shade(green, 0.6);
        }
        return skin;
      }
      case 'snout': {
        if (face === 'up') return belly;
        if (face === 'down') return inEllipse(mx, my, 1.5, 0.7, 0.35, 0.3) || inEllipse(mx, my, mw - 1.5, 0.7, 0.35, 0.3) ? hex('#1d3d1e') : skin;
        // a mouth line, and a row of teeth along the bottom (zigzag), all round the front and sides
        if (my > mh - 1.1) {
          const t = (mx * 2) % 1;
          if (my > mh - 1.1 + Math.abs(t - 0.5) * 1.4) return tooth;
          return hex('#7a1d1d');
        }
        if (my > mh - 1.35) return hex('#4a1010');
        return skin;
      }
      case 'spike':
        return face === 'down' || face === 'north' ? tone('#f59a3a', 34, px, py) : tone('#d9741c', 35, px, py);
      case 'body':
        // a pale belly with ridges across it
        if (face === 'north' && Math.abs(mx - mw / 2) < 2.6 && my > 1.5) return Math.floor(my * 1.4) % 2 === 0 ? shade(belly, 0.9) : belly;
        return skin;
      case 'tail':
      case 'tailtip':
        return face === 'up' ? belly : skin;
      case 'arm':
        if (face === 'north' && my > mh - 0.9 && Math.floor(mx * 1.6) % 2 === 0) return tooth;
        return skin;
      case 'leg':
        return skin;
      case 'boot':
        if (face === 'north' && my > mh - 1 && Math.floor(mx * 1.3) % 2 === 0) return tooth;
        if (face === 'up') return shade(green, 0.6);
        return shade(skin, 0.9);
    }
    return skin;
  },

  knight({ name, bone, face, mx, my, mw, mh, px, py }) {
    const steel = shade(tone('#aeb6c2', 40, px, py, 0.08), 0.92 + 0.12 * Math.sin(my * 0.9 + (face === 'north' ? 0 : 1)));
    const dark = tone('#5f6774', 41, px, py, 0.1);
    const mail = (Math.floor(mx * 2) + Math.floor(my * 2)) % 2 === 0 ? tone('#8c939e', 42, px, py, 0.1) : tone('#6b7280', 43, px, py, 0.1);
    const gold = tone('#e3b341', 44, px, py, 0.1);
    const blue = tone('#1f3f8f', 45, px, py, 0.1);
    const rivet = (x, y) => inEllipse(mx, my, x, y, 0.22, 0.22);
    switch (name) {
      case 'head': {
        if (face === 'up') return dark;
        if (isSide(face) && my > mh - 0.8) return [0.5, 2, 4, 6, 7.5].some((x) => rivet(x, mh - 0.4)) ? hex('#3a3f48') : dark;
        if (face === 'north') {
          // the eye slit, a ridge down the middle, breathing holes on one cheek
          if (Math.abs(mx - mw / 2) < 0.28) return shade(steel, 1.2);
          if (my > 3 && my < 3.7 && mx > 0.6 && mx < mw - 0.6) return hex('#0c0d10');
          if (mx > mw / 2 + 1 && mx < mw - 0.8 && my > 4.6 && my < 6.8 && (mx * 2) % 1.4 < 0.5 && (my * 2) % 1.4 < 0.5) return hex('#0c0d10');
        }
        return steel;
      }
      case 'plume':
        if (face === 'up') return null;
        return shade(tone('#c0272d', 46, px, py, 0.16), Math.floor(mx * 3 + my) % 3 === 0 ? 0.75 : 1);
      case 'pauldron':
        if (face === 'up') return dark;
        if (isSide(face) && Math.floor(my / 1.34) !== Math.floor((my - 0.2) / 1.34)) return dark;
        if (isSide(face) && rivet(0.6, mh - 0.6)) return hex('#3a3f48');
        return steel;
      case 'body': {
        if (face === 'north' || face === 'south') {
          // the belt, then a blue tabard with a golden cross over the steel
          if (my > 8.5 && my < 9.4) return Math.abs(mx - mw / 2) < 0.6 && face === 'north' ? gold : tone('#4a2f1d', 47, px, py);
          if (mx > 1 && mx < mw - 1) {
            if (mx < 1.35 || mx > mw - 1.35) return gold;
            if (face === 'north' && (Math.abs(mx - mw / 2) < 0.5 && my > 1.5 && my < 7.5 || Math.abs(my - 3.5) < 0.5 && Math.abs(mx - mw / 2) < 2)) return gold;
            return blue;
          }
          return steel;
        }
        if (face === 'down') return steel;
        return mail;
      }
      case 'arm':
        if (my > 8.4 || face === 'up') return my > 8.4 && my < 8.8 ? dark : shade(steel, 0.95);
        return mail;
      case 'leg':
        if (face === 'north' && my > 3.2 && my < 5.4) return inEllipse(mx, my, mw / 2, 4.3, 1, 0.8) ? shade(steel, 1.15) : steel;
        return mail;
      case 'boot':
        if (face === 'up') return dark;
        return Math.floor(my * 1.5) % 2 === 0 ? steel : shade(steel, 0.82);
    }
    return steel;
  },

  ghostsheet({ name, face, mx, my, mw, mh, px, py }) {
    // soft folds running down the sheet
    const fold = 0.93 + 0.07 * Math.sin(mx * 2.3 + (face === 'east' ? 1.5 : face === 'south' ? 3 : 0)) + (grain(50, px, py) - 0.5) * 0.04;
    const white = shade(hex('#f4f5f8'), fold);
    /** The hem: torn in a wave along the bottom, see-through below it. */
    const ragged = () => isSide(face) && my > mh - 0.9 + 0.55 * Math.sin(mx * 3.1 + mh) - 0.4;
    switch (name) {
      case 'head':
        if (face === 'north') {
          if (inEllipse(mx, my, 2.4, 3.9, 0.85, 1.15) || inEllipse(mx, my, mw - 2.4, 3.9, 0.85, 1.15)) return hex('#101014');
          if (inEllipse(mx, my, mw / 2, 6.2, 0.6, 0.75)) return hex('#2a2a30');
        }
        return white;
      case 'body':
      case 'arm':
        if (face === 'up' || ragged()) return null;
        return white;
      case 'leg':
        return white;
      case 'boot':
        if (face === 'up') return shade(white, 0.8);
        return isSide(face) && my > mh - 0.6 ? shade(white, 0.85) : white;
    }
    return white;
  },

  mech({ name, bone, face, mx, my, mw, mh, px, py }) {
    const metal = tone('#3b4048', 60, px, py, 0.08);
    const dark = tone('#262a31', 61, px, py, 0.08);
    const light = tone('#5d6570', 62, px, py, 0.08);
    const cyan = hex('#4ee6ff');
    const hazard = () => ((mx + my) % 1.6 < 0.8 ? hex('#f2c230') : hex('#1a1a1a'));
    const seam = (step) => (mx % step < 0.2 || my % step < 0.2);
    switch (name) {
      case 'head':
        if (face === 'north') {
          if (my > 2.8 && my < 4.5 && mx > 0.8 && mx < mw - 0.8) return Math.abs(my - 3.65) < 0.25 ? hex('#d9fbff') : cyan;
          if (my > 5.4 && my < 7 && Math.abs(mx - mw / 2) < 1.6) return Math.floor(my * 3) % 2 === 0 ? hex('#121418') : light;
        }
        if (face === 'up') return dark;
        return seam(4) ? dark : metal;
      case 'antenna':
        if (face === 'down' || my < 0.8) return hex('#ff3030');
        return light;
      case 'earpiece':
        if ((face === 'west' && bone === 'head' && mx < mw) || face === 'east') {
          if (inEllipse(mx, my, mw / 2, mh / 2, 0.6, 0.6)) return cyan;
        }
        return light;
      case 'shoulder':
        if (face === 'up') return dark;
        if (isSide(face) && my > mh - 1.1) return hazard();
        if (isSide(face) && (inEllipse(mx, my, 0.6, 0.6, 0.25, 0.25) || inEllipse(mx, my, mw - 0.6, 0.6, 0.25, 0.25))) return dark;
        return light;
      case 'core':
        if (face !== 'north') return dark;
        return inEllipse(mx, my, mw / 2, mh / 2, 0.7, 0.7) ? hex('#e8feff') : inEllipse(mx, my, mw / 2, mh / 2, 1.3, 1.3) ? cyan : hex('#1d6f80');
      case 'body':
        if (my > 9 && my < 10.4) return hazard();
        if (face === 'down') return light;
        return seam(face === 'north' ? 4 : 3) ? dark : metal;
      case 'thruster':
        if (face === 'up') return inEllipse(mx, my, mw / 2, mh / 2, 1, 0.7) ? hex('#ffd29a') : hex('#ff7a1a');
        if (isSide(face) && my > mh - 1.2) return dark;
        if (face === 'south' && my > 1 && my < 4.5 && Math.floor(my * 2) % 2 === 0 && mx > 0.5 && mx < mw - 0.5) return dark;
        return light;
      case 'arm':
        if (face === 'up' || my > 10.2) return dark;
        if (face === outer(bone) && Math.abs(mx - mw / 2) < 0.6 && my > 3 && my < 9) return light;
        return my > 6.5 ? (my < 6.9 ? dark : light) : metal;
      case 'leg':
        if (face === 'north' && inEllipse(mx, my, mw / 2, 6.4, 1, 1)) return inEllipse(mx, my, mw / 2, 6.4, 0.4, 0.4) ? cyan : light;
        return seam(4) ? dark : metal;
      case 'boot':
        if (face === 'up') return hex('#16181c');
        if (face === 'north' && my > mh - 1.2) return hazard();
        return dark;
    }
    return metal;
  },

  pirate({ name, bone, face, mx, my, mw, mh, px, py }) {
    const red = tone('#9e1b23', 70, px, py, 0.12);
    const black = tone('#1c1a1f', 71, px, py, 0.1);
    const gold = tone('#e3b341', 72, px, py, 0.1);
    const bandana = inEllipse(mx % 2, my % 2, 1, 1, 0.3, 0.3) ? hex('#f4efe6') : tone('#b3202a', 73, px, py, 0.1);
    switch (name) {
      case 'head': {
        // a bandana over the top and back of the head; the face and ears show through
        if (face === 'up') return null;
        if (face === 'down') return bandana;
        if (face === 'north') {
          // the eyepatch over the right eye, its strap across the brow
          if (inEllipse(mx, my, 2, 4.4, 1.1, 0.9)) return hex('#121014');
          const strap = 3.7 - 0.3 * mx;
          if (Math.abs(my - strap) < 0.22) return hex('#121014');
          return my < 2.2 ? bandana : null;
        }
        if (face === 'south') return my < 4 || (my < 6.5 && Math.abs(mx - mw / 2) < 0.8) ? bandana : null;
        if (face === 'west' && Math.abs(my - (3.7 + 0.3 * (mw - mx) * 0.2)) < 0.22) return hex('#121014');
        return my < 2.6 ? bandana : null;
      }
      case 'brim': {
        // round, with a golden edge; the corners of its box cut away
        const r = 6;
        if (face === 'down' || face === 'up') {
          const d = Math.hypot(mx - mw / 2, my - mh / 2);
          if (d > r) return null;
          return d > r - 0.5 ? gold : black;
        }
        if (Math.abs(mx - mw / 2) > 2) return null;
        return gold;
      }
      case 'crown':
        if (face === 'up') return black;
        if (isSide(face) && my > mh - 0.5) return gold;
        // a skull and crossbones on the front
        if (face === 'north') {
          if (inEllipse(mx, my, mw / 2, 0.75, 0.55, 0.45)) return inEllipse(mx, my, mw / 2 - 0.22, 0.75, 0.12, 0.12) || inEllipse(mx, my, mw / 2 + 0.22, 0.75, 0.12, 0.12) ? black : hex('#f4efe6');
          if (my > 1 && my < 1.4 && (Math.abs((mx - mw / 2) - (my - 1.2) * 3) < 0.25 || Math.abs((mx - mw / 2) + (my - 1.2) * 3) < 0.25) && Math.abs(mx - mw / 2) < 1.2) return hex('#f4efe6');
        }
        return black;
      case 'body': {
        if (face === 'down') return red;
        if (my > 7.6 && my < 8.8) return face === 'north' && Math.abs(mx - mw / 2) < 0.8 ? (Math.abs(mx - mw / 2) < 0.4 && Math.abs(my - 8.2) < 0.25 ? black : gold) : black;
        if (face === 'north') {
          // the coat open over a white shirt, laced at the neck, gold buttons down both sides
          const off = Math.abs(mx - mw / 2);
          if (off < 1.4) return off < 0.15 && my < 3.2 ? tone('#6b4a2b', 74, px, py) : my < 3 && Math.abs(off - 0.5) < 0.12 && Math.floor(my * 2) % 2 === 0 ? tone('#6b4a2b', 74, px, py) : tone('#efe8dc', 75, px, py, 0.06);
          if (off < 1.8) return shade(red, 0.7);
          if (Math.abs(off - 2.4) < 0.3 && my > 1.5 && my < 7 && Math.floor(my) % 2 === 0 && my % 1 < 0.6) return gold;
        }
        return red;
      }
      case 'coattail': {
        if (face === 'up' || face === 'down') return null;
        if (face === 'north' && Math.abs(mx - mw / 2) < 1.8) return null;
        if (face === 'south' && my > 1.5 && Math.abs(mx - mw / 2) < 0.15) return shade(red, 0.55);
        return my > mh - 0.5 ? gold : red;
      }
      case 'arm':
        // bare hands: the sleeve stops at a gold-trimmed cuff
        if (face === 'up' || my > 10) return null;
        if (my > 8) return my > 9.5 ? gold : shade(red, 0.8);
        return red;
      case 'leg':
        return isSide(face) && Math.abs(mx - mw / 2) < 0.12 && face !== 'north' && face !== 'south' ? tone('#4f361f', 76, px, py) : tone('#6b4a2b', 77, px, py, 0.1);
      case 'boot':
        if (face === 'up') return hex('#141012');
        if (my < 0.9) return tone('#3a2a20', 78, px, py);
        if (face === 'north' && my > 1.4 && my < 2.4 && Math.abs(mx - mw / 2) < 1) return Math.abs(mx - mw / 2) < 0.6 && Math.abs(my - 1.9) < 0.25 ? black : gold;
        return black;
    }
    return red;
  },
};

// ---------- the pictures ----------

const out = path.join(assets, 'textures', 'suit');
mkdirSync(path.join(out, 'icon'), { recursive: true });
const items = [];
for (const suit of SUITS) {
  const paint = PAINT[suit.id];
  if (!paint) throw new Error(`No paint for ${suit.id}`);
  const W = TW * K, H = TH * K;
  const tex = Buffer.alloc(W * H * 4);
  const { uv, slimUv } = suitLayout(suit);
  const draw = (b, at) => {
    for (const q of boxQuads(b, at, SUIT_TEXTURE)) {
      // the face's region in the picture (its corners' u, v)
      const us = q.corners.map((c) => c[3] * W), vs = q.corners.map((c) => c[4] * H);
      const u0 = Math.round(Math.min(...us)), u1 = Math.round(Math.max(...us));
      const v0 = Math.round(Math.min(...vs)), v1 = Math.round(Math.max(...vs));
      for (let ty = v0; ty < v1; ty++) for (let tx = u0; tx < u1; tx++) {
        const x = tx - u0, y = ty - v0, w = u1 - u0, h = v1 - v0;
        const c = paint({ name: b.name, bone: b.bone, face: q.face, x, y, w, h, mx: (x + 0.5) / K, my: (y + 0.5) / K, mw: w / K, mh: h / K, px: Math.floor(tx / K), py: Math.floor(ty / K) });
        if (!c) continue;
        const i = (ty * W + tx) * 4;
        tex[i] = c[0];
        tex[i + 1] = c[1];
        tex[i + 2] = c[2];
        tex[i + 3] = 255;
      }
    }
  };
  suit.boxes.forEach((b, i) => {
    draw(b, uv[i]);
    if (slimUv[i]) draw(slimSuitBox(b), slimUv[i]);
  });
  writeFileSync(path.join(out, `${suit.id}.png`), png(W, H, tex));
  writeFileSync(path.join(out, 'icon', `${suit.id}.png`), png(ICON, ICON, icon(suit, uv, tex, W, H)));
  items.push({
    id: suit.id,
    boxes: suit.boxes.map((b, i) => {
      const slim = slimSuitBox(b);
      return { bone: b.bone, part: suitPart(b), from: b.from, size: b.size, inflate: b.inflate ?? 0, uv: uv[i],
        ...(slimUv[i] ? { slimFrom: slim.from, slimSize: slim.size, slimUv: slimUv[i] } : {}) };
    }),
  });
}
// one line per suit, for readable diffs
writeFileSync(path.join(assets, 'suits.json'), `{"texture": ${JSON.stringify(SUIT_TEXTURE)}, "items": [\n${items.map((i) => `\t${JSON.stringify(i)}`).join(',\n')}\n]}\n`);
console.log(`${items.length} suits -> ${out}`);

// ---------- the icons: the suit seen from the front, a little from above and the side ----------

/** The plain player inside the icons: skin with a face (u, v across each face, from 0 to 1, as in the picture). */
function mannequin() {
  const SKIN = hex('#c99a6e'), HAIR = hex('#4a2f1d');
  return [
  { bone: 'head', from: [-4, -8, -4], size: [8, 8, 8], paint(face, u, v) {
    // the north face's picture runs from u 1 (its left) to 0; a fringe of hair, two eyes
    if (face === 'down' || v < 0.2) return HAIR;
    if (face === 'north') {
      const x = (1 - u) * 8, y = v * 8;
      if (y >= 4 && y < 5 && ((x >= 1 && x < 3) || (x >= 5 && x < 7))) return x % 2 < 1 ? hex('#ffffff') : hex('#3b5bdb');
      if (y >= 6 && y < 6.6 && x >= 3 && x < 5) return hex('#8a5a44');
    }
    return SKIN;
  } },
  { bone: 'body', from: [-4, 0, -2], size: [8, 12, 4], paint: () => hex('#3f8fd2') },
  { bone: 'right_arm', from: [-3, -2, -2], size: [4, 12, 4], paint: () => SKIN },
  { bone: 'left_arm', from: [-1, -2, -2], size: [4, 12, 4], paint: () => SKIN },
  { bone: 'right_leg', from: [-2, 0, -2], size: [4, 12, 4], paint: () => hex('#3a3f8f') },
  { bone: 'left_leg', from: [-2, 0, -2], size: [4, 12, 4], paint: () => hex('#3a3f8f') },
  ];
}

function icon(suit, uvs, tex, W, H) {
  // oblique view: the further back, the higher and more to the right
  const A = 0.35;
  const project = ([x, y, z]) => [x + A * z, y - A * z, z];
  const place = (b, q) => q.corners.map((c) => [...project([c[0] + BONES[b.bone][0], c[1] + BONES[b.bone][1], c[2] + BONES[b.bone][2]]), c[3], c[4]]);
  const quads = [
    ...suit.boxes.flatMap((b, i) => boxQuads(b, uvs[i], SUIT_TEXTURE).map((q) => ({ face: q.face, corners: place(b, q) }))),
    // a plain player under it, for what the suit leaves bare (the pirate's face and hands)
    ...mannequin().flatMap((b) => boxQuads(b, [0, 0], [8, 8]).map((q) => ({ face: q.face, corners: place(b, q), paint: (u, v) => b.paint(q.face, u, v) }))),
  ];
  const xs = quads.flatMap((q) => q.corners.map((c) => c[0])), ys = quads.flatMap((q) => q.corners.map((c) => c[1]));
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  const s = (ICON - 2) / size;
  const ox = (ICON - (Math.max(...xs) - minX) * s) / 2, oy = (ICON - (Math.max(...ys) - minY) * s) / 2;
  const img = Buffer.alloc(ICON * ICON * 4);
  const depth = new Float32Array(ICON * ICON).fill(Infinity);
  const LIGHT = { down: 1.05, north: 0.92, east: 0.72, west: 0.72, south: 0.6, up: 0.5 };
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
        let rgb;
        if (q.paint) rgb = q.paint(u, v);
        else {
          const tx = Math.min(W - 1, Math.floor(u * W)), ty = Math.min(H - 1, Math.floor(v * H));
          const ti = (ty * W + tx) * 4;
          if (tex[ti + 3] === 0) continue;
          rgb = [tex[ti], tex[ti + 1], tex[ti + 2]];
        }
        depth[py * ICON + px] = z;
        const i = (py * ICON + px) * 4;
        const l = LIGHT[q.face];
        img[i] = Math.min(255, rgb[0] * l);
        img[i + 1] = Math.min(255, rgb[1] * l);
        img[i + 2] = Math.min(255, rgb[2] * l);
        img[i + 3] = 255;
      }
    }
  }
  return img;
}
