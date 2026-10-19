/**
 * SlashClient props ("prop" slot): something the player pushes in front of them with both hands,
 * so far wheelbarrows. One definition for all: scripts/make-props.mjs paints each item's picture
 * from it and writes it for the mod (assets/slashclient-hud/props.json), and the launcher's and the
 * website's 3D previews build the same boxes from it.
 *
 * Units are the game's model pixels (y down). A prop is a tree of parts, each turned like the game's
 * ModelPart (z, then y, then x); its own origin is the wheel's axle, the handles run back from it
 * towards +z (the player), so it is placed in the player model's space (the face towards -z, the neck
 * at 0, the feet at 24) with `propPose`: the wheel on the ground in front, the grips in the hands.
 * The part named "wheel" turns with the distance walked.
 */

export type Vec3 = [number, number, number];
/** What a box is made of: each item paints it its own way (scripts/make-props.mjs). */
export type PropMaterial = 'frame' | 'grip' | 'tub' | 'rim' | 'tire' | 'hub' | 'axle' | 'soil' | 'stem'
  | 'petal_red' | 'petal_yellow' | 'petal_blue' | 'petal_pink' | 'petal_white' | 'petal_orange' | 'bloom';

export interface PropBox {
  from: Vec3;
  size: Vec3;
  mat: PropMaterial;
  /** Grows the box on every side without changing its picture (as the game's CubeDeformation). */
  inflate?: number;
}

export interface PropPart {
  name: string;
  /** Where the part's pivot is in its parent, and its turn there (radians): x, y, z, xRot, yRot, zRot. */
  pose?: [number, number, number, number, number, number];
  boxes?: PropBox[];
  children?: PropPart[];
}

export interface PropItem {
  id: string;
  slot: 'prop';
  name: string;
  /** How it is painted: the classic one (wood and a galvanised tub), gold, or wood with flowers. */
  look: 'classic' | 'gold' | 'flowers';
}

/** The picture of every item is this big, in model pixels (painted 4× finer). */
export const PROP_TEXTURE: [number, number] = [128, 64];
export const PROP_SCALE = 4;

export const PROPS: PropItem[] = [
  { id: 'wheelbarrow', slot: 'prop', name: 'Taczka', look: 'classic' },
  { id: 'wheelbarrow_gold', slot: 'prop', name: 'Taczka złota', look: 'gold' },
  { id: 'wheelbarrow_flowers', slot: 'prop', name: 'Taczka z kwiatami', look: 'flowers' },
];

/** The wheel's radius, and where the middle of a grip is from the axle (y, z) before the prop is tilted. */
export const WHEEL_RADIUS = 4;
export const GRIP: [number, number] = [-3, 22];
/**
 * The arms holding the grips: turned forwards this much (radians, the game's xRot; more when
 * crouching, the body leaning over them), the hand this far down the arm from the shoulder.
 */
export const HOLD = -0.5;
export const HOLD_CROUCHING = -0.75;
export const HAND = 10;

/** How far the wheel turns (radians) for a distance walked, in blocks: it rolls without slipping. */
export const wheelTurn = (blocks: number) => (blocks * 16) / WHEEL_RADIUS;

/**
 * Where the prop stands in the player model's space: its axle on the ground (`ground`, 24 when
 * standing) in front, tilted (`pitch`, the game's xRot) so the grips are where the hands are
 * (`handY`, `handZ`: the shoulder `armY`, `armZ` plus the arm turned by `hold`).
 */
export function propPose(armY: number, armZ: number, hold: number, ground = 24): { y: number; z: number; pitch: number } {
  const handY = armY + HAND * Math.cos(hold), handZ = armZ + HAND * Math.sin(hold);
  const axleY = ground - WHEEL_RADIUS;
  // the grip (gy, gz) turned by `pitch` about the axle must reach handY: gy·cos − gz·sin = handY − axleY
  const [gy, gz] = GRIP;
  const r = Math.hypot(gy, gz), phi = Math.atan2(gz, -gy);
  const pitch = phi - Math.acos(Math.max(-1, Math.min(1, -(handY - axleY) / r)));
  const along = gy * Math.sin(pitch) + gz * Math.cos(pitch);
  return { y: axleY, z: handZ - along, pitch };
}

const box = (from: Vec3, size: Vec3, mat: PropMaterial, inflate?: number): PropBox => ({ from, size, mat, ...(inflate ? { inflate } : {}) });

/** A wheel: an octagon of four boxes (two turned by 45°), each a little thinner, so their sides never fight. */
function wheel(): PropPart {
  const r = WHEEL_RADIUS, s = 3.5;
  const pair = (w: number): PropBox[] => [
    box([-w / 2, -r, -s / 2], [w, 2 * r, s], 'tire'),
    box([-(w - 0.2) / 2, -s / 2, -r], [w - 0.2, s, 2 * r], 'tire'),
  ];
  return {
    name: 'wheel',
    pose: [0, 0, 0, 0, 0, 0],
    boxes: [...pair(2), box([-1.5, -1, -1], [3, 2, 2], 'hub')],
    children: [{ name: 'wheel_diagonal', pose: [0, 0, 0, Math.PI / 4, 0, 0], boxes: pair(1.6) }],
  };
}

/** A flower in the tub: a stem and a blossom with its middle on top. */
function flower(n: number, x: number, z: number, h: number, petal: PropMaterial): PropPart {
  return {
    name: `flower${n}`,
    pose: [x, -6.5, z, 0, (n * 0.7) % 1.2, 0],
    boxes: [
      box([-0.5, -h, -0.5], [1, h, 1], 'stem'),
      box([-1.5, -h - 1.5, -1.5], [3, 1.5, 3], petal),
      box([-0.5, -h - 2, -0.5], [1, 0.5, 1], 'bloom'),
    ],
  };
}

/** The whole prop, as parts: the frame (rails, grips, fork, legs, axle), the tub and the wheel. */
export function propModel(item: PropItem): PropPart {
  const rail = (side: 1 | -1): PropPart => ({
    // from the fork by the wheel back to the grips, spreading out (6 pixels to each side at the back)
    name: side > 0 ? 'left_rail' : 'right_rail',
    pose: [2 * side, -3, 0, 0, side * Math.asin(4 / 24.3), 0],
    boxes: [box([-0.5, -0.5, 0], [1, 1, 19.3], 'frame'), box([-0.5, -0.5, 19.3], [1, 1, 5], 'grip', 0.15)],
  });
  const tub: PropPart = {
    // tilted back on the frame, so it stands level when the grips are lifted
    name: 'tub',
    pose: [0, -3.5, 9.5, -0.26, 0, 0],
    boxes: [
      box([-3.5, -1, -5], [7, 1, 10], 'tub'),
      box([-4.5, -8, 5], [9, 8, 1], 'tub'),
      box([-4.5, -8, -6], [9, 8, 1], 'tub'),
      box([3.5, -8, -5], [1, 7, 10], 'tub'),
      box([-4.5, -8, -5], [1, 7, 10], 'tub'),
    ],
    children: item.look === 'flowers' ? [
      { name: 'soil', pose: [0, 0, 0, 0, 0, 0], boxes: [box([-3.5, -6.5, -5], [7, 1, 10], 'soil')] },
      flower(0, -2, -3, 3, 'petal_red'),
      flower(1, 1.5, -2.5, 4, 'petal_yellow'),
      flower(2, -1, 0.5, 4.5, 'petal_blue'),
      flower(3, 2, 2, 3, 'petal_pink'),
      flower(4, -2, 3.5, 3.5, 'petal_white'),
      flower(5, 1, 4, 4.5, 'petal_orange'),
    ] : [],
  };
  return {
    name: 'prop',
    boxes: [
      // the fork holding the axle, and the axle
      box([1.5, -3.5, -0.5], [0.8, 4, 1], 'frame'),
      box([-2.3, -3.5, -0.5], [0.8, 4, 1], 'frame'),
      box([-2.4, -0.6, -0.6], [4.8, 1.2, 1.2], 'axle'),
      // two legs under the back of the tub (in the air while it is pushed)
      box([3.4, -2.5, 13.5], [1, 6, 1], 'frame'),
      box([-4.4, -2.5, 13.5], [1, 6, 1], 'frame'),
    ],
    children: [rail(1), rail(-1), tub, wheel()],
  };
}

export const propItem = (id: string): PropItem | undefined => PROPS.find((p) => p.id === id);

/** Every box of a part tree in order (the order their pictures are laid out in), with its part's path. */
export function propBoxes(part: PropPart, path: string[] = []): { path: string[]; box: PropBox }[] {
  const here = [...path, part.name];
  return [...(part.boxes ?? []).map((b) => ({ path: here, box: b })), ...(part.children ?? []).flatMap((c) => propBoxes(c, here))];
}

/**
 * Where each box's picture lies in the item's texture (the game's box layout: the top and bottom
 * in a row above the four sides), packed in rows from the top left, the tallest first; listed in
 * the order of `propBoxes`.
 */
export function propLayout(model: PropPart): [number, number][] {
  const [tw, th] = PROP_TEXTURE;
  const sizes = propBoxes(model).map(({ box: b }) => {
    const [w, h, d] = b.size.map(Math.ceil);
    return [2 * (w + d), d + h];
  });
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b][1] - sizes[a][1] || a - b);
  const at: [number, number][] = [];
  let x = 0, y = 0, row = 0;
  for (const i of order) {
    const [bw, bh] = sizes[i];
    if (x + bw > tw) {
      x = 0;
      y += row;
      row = 0;
    }
    if (y + bh > th) throw new Error('The prop does not fit its texture');
    at[i] = [x, y];
    x += bw;
    row = Math.max(row, bh);
  }
  return at;
}

export type Face = 'down' | 'up' | 'west' | 'north' | 'east' | 'south';
/** A face as the game draws it: four corners, each [x, y, z, u, v] (u, v from 0 to 1). */
export interface Quad { face: Face; corners: number[][] }

/** The six faces of a box whose picture starts at (u, v), exactly as the game's ModelPart.Cube builds them. */
export function propQuads(box: PropBox, [u, v]: [number, number]): Quad[] {
  const [tw, th] = PROP_TEXTURE;
  const [sx, sy, sz] = box.size;
  const g = box.inflate ?? 0;
  const x0 = box.from[0] - g, y0 = box.from[1] - g, z0 = box.from[2] - g;
  const x1 = box.from[0] + sx + g, y1 = box.from[1] + sy + g, z1 = box.from[2] + sz + g;
  const p1 = [x0, y0, z0], p2 = [x1, y0, z0], p3 = [x1, y1, z0], p4 = [x0, y1, z0];
  const p5 = [x0, y0, z1], p6 = [x1, y0, z1], p7 = [x1, y1, z1], p8 = [x0, y1, z1];
  const j = u, k = u + sz, l = u + sz + sx, m = u + sz + sx + sx, n = u + sz + sx + sz, o = u + sz + sx + sz + sx;
  const p = v, q = v + sz, r = v + sz + sy;
  const quad = (face: Face, ps: number[][], u1: number, v1: number, u2: number, v2: number): Quad => ({
    face,
    corners: [[...ps[0], u2 / tw, v1 / th], [...ps[1], u1 / tw, v1 / th], [...ps[2], u1 / tw, v2 / th], [...ps[3], u2 / tw, v2 / th]],
  });
  return [
    quad('down', [p6, p5, p1, p2], k, p, l, q),
    quad('up', [p3, p4, p8, p7], l, q, m, p),
    quad('west', [p1, p5, p8, p4], j, q, k, r),
    quad('north', [p2, p1, p4, p3], k, q, l, r),
    quad('east', [p6, p2, p3, p7], l, q, n, r),
    quad('south', [p5, p6, p7, p8], n, q, o, r),
  ];
}
