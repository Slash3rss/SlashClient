// How the face and ears items (src/shared/clothing.ts) are painted, for scripts/make-clothing.mjs:
// each is called for every texel of every face, as the other items' paints there (null = see-through).
// Texel coordinates run from the face's top left as it appears in the picture; on a front ('north')
// face x grows towards the player's left (the viewer's right), y downwards.

export function headwearPaint({ hex, shade, grain, isSide, K }) {
  /** Where a texel is in its face, from 0 to 1 (its middle). */
  const at = (x, y, w, h) => [(x + 0.5) / w, (y + 0.5) / h];
  const front = (face) => face === 'north' || face === 'south';

  /** Glasses' lens: a dark glass, lighter at the bottom, with a bright streak across. */
  function lens(x, y, w, h, top, bottom) {
    const [u, v] = at(x, y, w, h);
    const c = top.map((t, i) => Math.round(t + (bottom[i] - t) * v));
    const streak = Math.abs(u - v * 0.6 - 0.15);
    if (streak < 0.07) return shade(c, 1.9);
    if (streak < 0.12) return shade(c, 1.35);
    return c;
  }

  /** A pair of steps of an ear: which step (from the base up) and on which side (0 left, 1 right). */
  const step = (box, n) => [box % n, Math.floor(box / n)];

  return {
    sunglasses({ box, face, x, y, w, h }) {
      const black = hex('#15151a');
      if (box > 1 || !front(face)) return black;
      // rounded at the bottom outer and inner corners, a black rim round a purple-blue glass
      const [u, v] = at(x, y, w, h);
      if (v > 0.75 && (u < 0.12 || u > 0.88) && Math.hypot((u < 0.5 ? u - 0.12 : u - 0.88) * w, (v - 0.75) * h) > 0.25 * h) return null;
      if (x < 2 || x >= w - 2 || y < 2 || y >= h - 1) return black;
      return face === 'south' ? hex('#101018') : lens(x, y, w, h, hex('#1d1838'), hex('#3a3f7a'));
    },
    aviators({ box, face, x, y, w, h }) {
      const gold = shade(hex('#d9b04a'), 0.9 + grain(40, x, y) * 0.2);
      if (box > 1) return gold;
      if (!front(face)) return null;
      // a drop: wide at the top, round at the bottom, a thin golden rim
      const [u, v] = at(x, y, w, h);
      const half = v < 0.45 ? 0.5 : 0.5 * Math.sqrt(Math.max(0, 1 - ((v - 0.45) / 0.55) ** 2));
      const d = Math.abs(u - 0.5);
      if (d > half) return null;
      if (d > half - 1.2 / w || y < 1) return gold;
      return face === 'south' ? hex('#2a1e10') : lens(x, y, w, h, hex('#5a3a12'), hex('#c99a4a'));
    },
    glasses3d({ box, face, x, y, w, h }) {
      const white = shade(hex('#f2f0ea'), 0.94 + grain(41, x, y) * 0.08);
      if (box > 0 || !front(face)) return white;
      const [u, v] = at(x, y, w, h);
      // a notch for the nose
      if (Math.abs(u - 0.5) < 0.07 && v > 0.55) return null;
      // red for the left eye, cyan for the right (as seen by the wearer: red on the right of the picture's front)
      const left = face === 'north' ? u > 0.5 : u < 0.5;
      const inLens = y >= 2 && y < h - 2 && Math.abs(u - 0.5) > 0.1 && Math.abs(u - 0.5) < 0.45;
      if (!inLens) return white;
      return lens(x, y, w, h, left ? hex('#d8202e') : hex('#18b8d0'), left ? hex('#ff5a5a') : hex('#6ae8f5'));
    },
    monocle({ box, face, x, y, w, h }) {
      const gold = shade(hex('#e3b84a'), 0.85 + grain(42, x, y) * 0.25);
      if (box === 1) return y % 4 < 2 ? gold : shade(gold, 0.7);
      if (!front(face)) return null;
      const r = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) / (w / 2);
      if (r > 1) return null;
      if (r < 0.72) return null;
      return r > 0.9 ? shade(gold, 0.75) : gold;
    },
    mustache({ face, x, y, w, h, px, py }) {
      if (!front(face)) return null;
      const [u, v] = at(x, y, w, h);
      const d = Math.abs(u - 0.5) * 2;
      // thick in the middle (a little gap under the nose), thinner towards the ends, which curl up
      const centre = 0.6 - 0.5 * Math.max(0, (d - 0.5) / 0.5) ** 2;
      const half = 0.36 * (1 - 0.75 * d) + 0.1;
      if (Math.abs(v - centre) > half || (d < 0.06 && v < 0.5)) return null;
      const brown = shade(hex('#3b2414'), 0.85 + grain(43, px * 7 + x, py) * 0.3);
      return v < centre - half * 0.4 ? shade(brown, 1.35) : brown;
    },
    gasmask({ box, face, x, y, w, h, px, py }) {
      const rubber = shade(hex('#3f4636'), 0.88 + grain(44, px, py) * 0.18);
      if (box === 2) {
        // the strap: its sides only
        if (!isSide(face)) return null;
        return shade(hex('#24271f'), Math.floor(x / K) % 3 ? 1 : 0.8);
      }
      if (box === 1) {
        // the filter: a metal can, holes on its front
        const metal = shade(hex('#8b9097'), 0.9 + grain(45, x, y) * 0.15);
        if (face === 'north') {
          if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) return shade(metal, 0.75);
          return (x % 3 === 1 && y % 3 === 1) ? hex('#202326') : metal;
        }
        return isSide(face) && y % 4 === 0 ? shade(metal, 0.7) : metal;
      }
      if (face !== 'north') return shade(rubber, 0.85);
      // two round glass eyes in metal rings (the eyes are at x ±2, y -3.5; the plate starts at x -3.5, y -5.25)
      for (const ex of [1.5 * K, 5.5 * K]) {
        const r = Math.hypot(x + 0.5 - ex, y + 0.5 - 1.75 * K);
        if (r < 1.1 * K) return lens(x, y, w, h, hex('#1b2b33'), hex('#3d6070'));
        if (r < 1.5 * K) return shade(hex('#9aa0a8'), 0.85 + grain(46, x, y) * 0.2);
      }
      return rubber;
    },
    kitsune({ box, face, x, y, w, h }) {
      const white = shade(hex('#f6f2ea'), 0.95 + grain(47, x, y) * 0.06);
      const red = hex('#c8102e');
      if (box === 4) return isSide(face) ? shade(red, 0.85 + (x % 4 < 2 ? 0.15 : 0)) : null;
      if (box === 1 || box === 2) {
        // the ears' points: a triangle with its upright side outside, red inside
        const outer = box === 1 ? 'west' : 'east';
        if (face === outer || face === 'down') return white;
        if (!front(face)) return null;
        const fromOut = (box === 1) === (face === 'north') ? x + 0.5 : w - x - 0.5;
        if (fromOut / w > (y + 0.5) / h) return null;
        return fromOut / w < (y + 0.5) / h - 0.3 && y > h * 0.35 ? red : white;
      }
      if (box === 3) {
        // the snout: a black nose on top of its front, a red mouth line
        if (face === 'north' && y < 3 && Math.abs(x + 0.5 - w / 2) < 3) return hex('#151515');
        if (face === 'north' && y === h - 3 && Math.abs(x + 0.5 - w / 2) < w * 0.35) return red;
        return white;
      }
      if (face !== 'north') return shade(white, 0.9);
      // the plate (x -4…4, y -6.25…0): slanted eyes outlined in red, red marks on the forehead and cheeks
      const mx = x / K - 4, my = y / K - 6.25;
      for (const side of [-1, 1]) {
        // the eyes' outer ends higher
        const dx = mx - side * 2, off = my - (-3.5 - 0.35 * side * dx);
        if (Math.abs(dx) < 1.2 && Math.abs(off) < 0.3) return hex('#151515');
        if (Math.abs(dx) < 1.6 && Math.abs(off) < 0.7) return red;
        // whiskers
        if (Math.abs(mx - side * 3) < 0.9 && (Math.abs(my + 1.7) < 0.15 || Math.abs(my + 1.0) < 0.15)) return red;
      }
      if (Math.abs(mx) < 0.5 && my > -6 && my < -4.6) return red;
      if (Math.abs(mx) < 1.2 && my > -5.6 && my < -5.1) return red;
      return white;
    },
    oni({ box, face, x, y, w, h, px, py }) {
      const red = shade(hex('#b3202a'), 0.88 + grain(48, px * 4 + x, py * 4 + y) * 0.18);
      if (box === 1 || box === 2) {
        // the horns: ivory, narrower and darker towards the tips
        const [u, v] = at(x, y, w, h);
        if (face === 'up') return null;
        if (isSide(face) && Math.abs(u - 0.5) > 0.2 + 0.3 * v) return null;
        return shade(hex('#efe5c8'), 0.6 + 0.4 * v);
      }
      if (box === 3) return shade(red, 0.75);
      if (face !== 'north') return shade(red, 0.8);
      // the plate (x -4…4, y -7…0): heavy brows, golden eyes, a grin with fangs
      const mx = x / K - 4, my = y / K - 7;
      for (const side of [-1, 1]) {
        const dx = mx - side * 2;
        if (Math.abs(dx) < 1.4 && Math.abs(my + 4.9 + dx * side * 0.35) < 0.35) return hex('#140808');
        if (Math.hypot(dx * 0.8, my + 3.6) < 0.7) return Math.hypot(dx, my + 3.6) < 0.3 ? hex('#140808') : hex('#f2c232');
      }
      if (my > -2 && my < -0.7 && Math.abs(mx) < 2.9 - (my + 2) * 0.6) {
        // fangs from the corners and the middle of the lower lip
        const fang = [-2.2, -0.6, 0.6, 2.2].some((f) => Math.abs(mx - f) < 0.3 + (my + 0.7) * -0.15 && my > -1.6);
        return fang ? hex('#f4efe2') : hex('#1a0606');
      }
      return red;
    },
    skigoggles({ box, face, x, y, w, h }) {
      if (box === 1) {
        if (!isSide(face)) return null;
        // the strap: blue, a white stripe along it
        return Math.abs(y + 0.5 - h / 2) < 1 ? hex('#f2f4f8') : shade(hex('#2350c8'), 0.9 + grain(49, x, y) * 0.15);
      }
      const frame = hex('#1a1c22');
      if (face !== 'north') return frame;
      const [u, v] = at(x, y, w, h);
      // a notch for the nose
      if (Math.abs(u - 0.5) < 0.08 && v > 0.7) return null;
      if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2 || (Math.abs(u - 0.5) < 0.12 && v > 0.6)) return frame;
      // a mirrored lens, orange at the top to purple at the bottom
      return lens(x, y, w, h, hex('#ff8a1c'), hex('#8a2be2'));
    },
    catears({ box, face, x, y, w, h, px, py }) {
      const [n] = step(box, 3);
      const fur = shade(hex('#26232a'), 0.85 + grain(50, px * 5 + x, py * 5 + y) * 0.3);
      // pink inside the ear, on its front, round the rim
      if (face === 'north' && n < 2 && x >= (n === 0 ? 3 : 2) && x < w - (n === 0 ? 3 : 2) && (n === 1 || y >= 2)) return shade(hex('#f0a3b9'), 0.95 + grain(51, x, y) * 0.1);
      return fur;
    },
    foxears({ box, face, x, y, w, px, py }) {
      const [n] = step(box, 4);
      if (n === 3) return shade(hex('#2a1c14'), 0.9 + grain(52, x, y) * 0.2);
      const orange = shade(hex('#e0742a'), 0.88 + grain(53, px * 5 + x, py * 5 + y) * 0.22);
      if (face === 'north' && n < 3 && x >= 2 && x < w - 2) return shade(hex('#f5e6cf'), 0.95 + grain(54, x, y) * 0.08);
      return orange;
    },
    bunnyears({ face, x, y, w, h, px, py }) {
      const white = shade(hex('#f4f1ec'), 0.9 + grain(55, px * 5 + x, py * 5 + y) * 0.12);
      if (face === 'up') return null;
      // rounded at the top
      if (isSide(face) && y < 2 && (x === 0 || x === w - 1)) return null;
      if (face === 'north' && x >= w * 0.25 && x < w * 0.75 && y >= 3 && y < h - 3) return shade(hex('#f3a8bf'), 0.95 + grain(56, x, y) * 0.1);
      return white;
    },
    elfears({ box, face, x, y, px, py }) {
      const [n, side] = step(box, 3);
      const skin = shade(hex('#e8b490'), 0.92 + grain(57, px * 5 + x, py * 5 + y) * 0.1);
      // the hollow on the outer side, a little pink at the tip
      const outer = side === 0 ? 'east' : 'west';
      if (n === 2) return shade(skin, 1.04);
      if (face === outer && n === 0 && x >= 1 && y >= 1 && y < 10) return shade(hex('#d18f74'), 0.95);
      return isSide(face) ? skin : shade(skin, 0.9);
    },
    devilhorns({ box, x, y, px, py }) {
      const [n] = step(box, 3);
      const base = ['#8e1212', '#b81c1c', '#d9332b'][n];
      return shade(hex(base), 0.88 + grain(58, px * 5 + x, py * 5 + y) * 0.2);
    },
    ramhorns({ box, face, x, y, px, py }) {
      const [n] = step(box, 4);
      const horn = shade(hex('#c9b38a'), (0.86 + grain(59, px * 5 + x, py * 5 + y) * 0.16) * (1 - n * 0.05));
      // ridges across the horn
      const along = face === 'up' || face === 'down' ? y : n === 1 ? y : x;
      return along % 4 === 0 ? shade(horn, 0.72) : horn;
    },
    antlers({ box, face, x, y, h, px, py }) {
      const [n] = step(box, 6);
      const brown = shade(hex('#6b4a2b'), 0.85 + grain(60, px * 5 + x, py * 5 + y) * 0.25);
      // the tines' tips pale
      if (n >= 3 && n <= 4 && (face === 'up' || (isSide(face) && y < h * 0.35))) return shade(hex('#d8c6a0'), 0.95);
      if (n === 5 && face === 'north') return shade(hex('#d8c6a0'), 0.95);
      return brown;
    },
    unicorn({ box, face, x, y, px, py }) {
      const pearl = shade(hex('#f6f2ff'), 0.92 + grain(61, px * 5 + x, py * 5 + y) * 0.08);
      if (box === 3 && face === 'up') return hex('#f6cf55');
      // a golden spiral round it
      if (isSide(face) && (x + y) % 8 < 2) return shade(hex('#f0c040'), 0.95);
      return face === 'down' ? shade(pearl, 0.8) : pearl;
    },
    earmuffs({ box, face, x, y, w, h, px, py }) {
      // the band over the head and down to the muffs: burgundy, a lighter line along its top
      const n = box === 0 ? -1 : (box - 1) % 4;
      if (n <= 0) {
        const red = shade(hex('#8e1c2c'), 0.9 + grain(62, px, py) * 0.14);
        if (face === 'down') return shade(red, 1.25);
        if (box === 0 && isSide(face) && y === 0) return shade(red, 1.2);
        return red;
      }
      // the muffs: thick cream fur in tufts (strands of lighter and darker), puffed out in the middle of the outer side
      const left = box < 5;
      const tuft = grain(63, Math.floor(x / 2) + px * 7, Math.floor(y / 3) + py * 5);
      let fur = shade(hex('#f3e9dc'), 0.86 + tuft * 0.2 + grain(64, x + px * 9, y + py * 9) * 0.06);
      if (tuft > 0.9) fur = shade(hex('#e6d2bd'), 0.95);
      if (face === (left ? 'west' : 'east')) return shade(hex('#d9c6b0'), 0.85);
      if (face === (left ? 'east' : 'west') && n === 1) {
        const r = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) / (Math.min(w, h) / 2);
        if (r < 0.55) return shade(fur, 1.06);
      }
      return fur;
    },
  };
}
