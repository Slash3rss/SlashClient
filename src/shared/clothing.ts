/**
 * SlashClient clothing: hats and tops worn over the skin, made of boxes the way the game makes its
 * models. One definition for all: scripts/make-clothing.mjs paints each item's picture from it and
 * writes it for the mod (assets/slashclient-hud/clothing.json), and the launcher's and the website's
 * 3D previews build the same boxes from it.
 *
 * Units are the game's model pixels, in the space of the part the box is fixed to (y down, the face
 * towards -z): the head's from (-4,-8,-4) to (4,0,4) above the neck, the body's from (-4,0,-2) to
 * (4,12,2) below it, an arm's from (-3,-2,-2) (the right one; the left from (-1,-2,-2)) 4 wide, 12 long.
 * The skin's own outer layer stands 0.25 (body, arms) or 0.5 (head) off the skin; what lies over it
 * stands further off, so the two never fight.
 */

export type ClothingSlot = 'hat' | 'top' | 'face' | 'ears';
export type Bone = 'head' | 'body' | 'right_arm' | 'left_arm';

export interface ClothingBox {
  bone: Bone;
  from: [number, number, number];
  size: [number, number, number];
  /** Grows the box on every side without changing its picture (as the game's CubeDeformation). */
  inflate?: number;
  /**
   * A box that turns on a pivot of its own (in the part's space): tipped by `rotate` (degrees about
   * x, y, z, as the game turns parts), and with `twitch` wiggling now and then (ears; see headwear.ts).
   */
  pivot?: [number, number, number];
  rotate?: [number, number, number];
  twitch?: { axis: 'x' | 'z'; amp: number; phase: number };
  /** Shown with only these hats (any other hat would go through it); without it, with every hat. */
  hats?: string[];
}

export interface ClothingItem {
  id: string;
  slot: ClothingSlot;
  name: string;
  boxes: ClothingBox[];
  /** Face things that lie under a real helmet's face (glasses): kept on with one; the rest hide. */
  underHelmet?: boolean;
}

/** The picture of every item is this big, in model pixels (painted 4× finer). */
export const CLOTHING_TEXTURE: [number, number] = [64, 64];
export const CLOTHING_SCALE = 4;

export const CLOTHING: ClothingItem[] = [
  // ---------- on the head ----------
  { id: 'tophat', slot: 'hat', name: 'Cylinder', boxes: [
    { bone: 'head', from: [-6, -9, -6], size: [12, 1, 12] },
    { bone: 'head', from: [-3.5, -16, -3.5], size: [7, 7, 7] },
  ] },
  // a ring: the top and bottom are see-through, the points cut out of the sides
  { id: 'crown', slot: 'hat', name: 'Korona', boxes: [
    { bone: 'head', from: [-4, -11, -4], size: [8, 4, 8], inflate: 0.75 },
  ] },
  { id: 'cap', slot: 'hat', name: 'Czapka z daszkiem', boxes: [
    { bone: 'head', from: [-4, -9, -4], size: [8, 3, 8], inflate: 0.75 },
    { bone: 'head', from: [-4, -6.5, -9], size: [8, 1, 4] },
  ] },
  { id: 'headphones', slot: 'hat', name: 'Słuchawki', boxes: [
    { bone: 'head', from: [-5, -10, -1], size: [10, 1, 2] },
    { bone: 'head', from: [-5, -9, -1], size: [1, 3, 2] },
    { bone: 'head', from: [4, -9, -1], size: [1, 3, 2] },
    { bone: 'head', from: [-6, -6, -2], size: [2, 4, 4] },
    { bone: 'head', from: [4, -6, -2], size: [2, 4, 4] },
  ] },
  { id: 'beanie', slot: 'hat', name: 'Czapka zimowa', boxes: [
    { bone: 'head', from: [-4, -9, -4], size: [8, 4, 8], inflate: 0.75 },
    { bone: 'head', from: [-1.5, -12.5, -1.5], size: [3, 3, 3] },
  ] },
  { id: 'wizard', slot: 'hat', name: 'Kapelusz czarodzieja', boxes: [
    { bone: 'head', from: [-6.5, -9, -6.5], size: [13, 1, 13] },
    { bone: 'head', from: [-3.5, -12, -3.5], size: [7, 3, 7] },
    { bone: 'head', from: [-2.5, -15, -2], size: [5, 3, 5] },
    { bone: 'head', from: [-1.5, -18, -0.5], size: [3, 3, 3] },
    { bone: 'head', from: [-0.5, -20, 0.5], size: [1, 2, 1] },
  ] },
  // a ring floating over the head (the middle of its top and bottom is see-through)
  { id: 'halo', slot: 'hat', name: 'Aureola', boxes: [
    { bone: 'head', from: [-3, -12, -3], size: [6, 1, 6] },
  ] },
  // ---------- on the body ----------
  { id: 'scarf', slot: 'top', name: 'Szalik', boxes: [
    { bone: 'body', from: [-4, 0.5, -2], size: [8, 2, 4], inflate: 0.6 },
    { bone: 'body', from: [1, 3, -3.6], size: [2, 6, 1] },
  ] },
  { id: 'bowtie', slot: 'top', name: 'Muszka', boxes: [
    { bone: 'body', from: [-3, 0.5, -3.25], size: [2, 2, 1] },
    { bone: 'body', from: [1, 0.5, -3.25], size: [2, 2, 1] },
    { bone: 'body', from: [-1, 1, -3.5], size: [2, 1, 1] },
  ] },
  { id: 'tie', slot: 'top', name: 'Krawat', boxes: [
    { bone: 'body', from: [-1, 0.5, -3.25], size: [2, 1, 1] },
    { bone: 'body', from: [-1, 1.5, -2.75], size: [2, 7, 0.5] },
  ] },
  { id: 'medal', slot: 'top', name: 'Medal', boxes: [
    { bone: 'body', from: [-4, 0, -2], size: [8, 1, 4], inflate: 0.45 },
    { bone: 'body', from: [-1, 1.5, -2.75], size: [2, 3, 0.5] },
    { bone: 'body', from: [-1.5, 4, -3.25], size: [3, 3, 1] },
  ] },
  // over the body and both arms (slim arms get sleeves a pixel narrower, see `slimBox`)
  { id: 'jacket', slot: 'top', name: 'Kurtka', boxes: [
    { bone: 'body', from: [-4, 0, -2], size: [8, 12, 4], inflate: 0.4 },
    { bone: 'right_arm', from: [-3, -2, -2], size: [4, 10, 4], inflate: 0.4 },
    { bone: 'left_arm', from: [-1, -2, -2], size: [4, 10, 4], inflate: 0.4 },
  ] },
  // ---------- on the face (over the skin's outer layer, whose front stands at z -4.5) ----------
  // glasses lie inside a real helmet's face (its front stands at -5), so they stay on with one
  { id: 'sunglasses', slot: 'face', name: 'Okulary przeciwsłoneczne', underHelmet: true, boxes: [
    { bone: 'head', from: [-4.6, -4.75, -4.95], size: [3.8, 2.25, 0.3] },
    { bone: 'head', from: [0.8, -4.75, -4.95], size: [3.8, 2.25, 0.3] },
    { bone: 'head', from: [-0.8, -4.5, -4.9], size: [1.6, 0.5, 0.25] },
    { bone: 'head', from: [-4.9, -4.5, -4.75], size: [0.3, 0.5, 2.5] },
    { bone: 'head', from: [4.6, -4.5, -4.75], size: [0.3, 0.5, 2.5] },
  ] },
  { id: 'aviators', slot: 'face', name: 'Pilotki', underHelmet: true, boxes: [
    { bone: 'head', from: [-4.4, -4.75, -4.95], size: [3.6, 2.5, 0.3] },
    { bone: 'head', from: [0.8, -4.75, -4.95], size: [3.6, 2.5, 0.3] },
    { bone: 'head', from: [-0.8, -4.75, -4.9], size: [1.6, 0.35, 0.25] },
    { bone: 'head', from: [-4.7, -4.6, -4.75], size: [0.3, 0.35, 2.5] },
    { bone: 'head', from: [4.4, -4.6, -4.75], size: [0.3, 0.35, 2.5] },
  ] },
  { id: 'glasses3d', slot: 'face', name: 'Okulary 3D', underHelmet: true, boxes: [
    { bone: 'head', from: [-4.6, -5, -4.95], size: [9.2, 2.5, 0.3] },
    { bone: 'head', from: [-4.9, -4.5, -4.75], size: [0.3, 0.5, 2.5] },
    { bone: 'head', from: [4.6, -4.5, -4.75], size: [0.3, 0.5, 2.5] },
  ] },
  // a ring round the right eye (its middle see-through) and a chain down the cheek
  { id: 'monocle', slot: 'face', name: 'Monokl', underHelmet: true, boxes: [
    { bone: 'head', from: [-3.4, -4.9, -4.95], size: [2.8, 2.8, 0.3] },
    { bone: 'head', from: [-3.3, -2.3, -4.85], size: [0.25, 2.3, 0.2] },
  ] },
  { id: 'mustache', slot: 'face', name: 'Wąsy', underHelmet: true, boxes: [
    { bone: 'head', from: [-3.5, -2.75, -4.9], size: [7, 2, 0.4] },
  ] },
  // masks and goggles: a strap round the head (only its sides drawn, a little inside the hats); a helmet hides them
  { id: 'gasmask', slot: 'face', name: 'Maska gazowa', boxes: [
    { bone: 'head', from: [-3.5, -5.25, -5.05], size: [7, 5, 0.5] },
    { bone: 'head', from: [-1.25, -2.5, -6.55], size: [2.5, 2.5, 1.5] },
    { bone: 'head', from: [-4, -5, -4], size: [8, 1, 8], inflate: 0.6 },
  ] },
  { id: 'kitsune', slot: 'face', name: 'Maska kitsune', boxes: [
    { bone: 'head', from: [-4, -6.25, -5.05], size: [8, 6.25, 0.5] },
    { bone: 'head', from: [-4, -8.25, -5], size: [2.5, 2, 0.4], hats: ['cap', 'beanie', 'headphones', 'halo'] },
    { bone: 'head', from: [1.5, -8.25, -5], size: [2.5, 2, 0.4], hats: ['cap', 'beanie', 'headphones', 'halo'] },
    { bone: 'head', from: [-1.5, -3.75, -6.05], size: [3, 2.25, 1] },
    { bone: 'head', from: [-4, -4.5, -4], size: [8, 0.5, 8], inflate: 0.6 },
  ] },
  { id: 'oni', slot: 'face', name: 'Maska oni', boxes: [
    { bone: 'head', from: [-4, -7, -5.05], size: [8, 7, 0.5] },
    { bone: 'head', from: [-3.5, -9.5, -5], size: [1.25, 2.5, 1.25], hats: ['cap', 'beanie', 'headphones', 'halo'] },
    { bone: 'head', from: [2.25, -9.5, -5], size: [1.25, 2.5, 1.25], hats: ['cap', 'beanie', 'headphones', 'halo'] },
    { bone: 'head', from: [-1, -4, -5.55], size: [2, 1.5, 0.5] },
  ] },
  { id: 'skigoggles', slot: 'face', name: 'Gogle narciarskie', boxes: [
    { bone: 'head', from: [-4.4, -5.25, -5.05], size: [8.8, 2.5, 0.55] },
    { bone: 'head', from: [-4, -5, -4], size: [8, 1.75, 8], inflate: 0.6 },
  ] },
  // ---------- ears and horns (the skin's outer layer ends at y -8.5 on top, x ±4.5 on the sides) ----------
  // ears twitch now and then about their base; `hats` are the hats they poke out of (the tall
  // ones and the crown's ring would have them go through, so there they hide)
  { id: 'catears', slot: 'ears', name: 'Kocie uszy', boxes:
    ear([[1, -9.5, 3, 1.5], [1.75, -10.5, 2, 1], [2.5, -11.5, 1, 1]], [2.5, -8, -2.25], 10, ['cap', 'beanie', 'headphones']) },
  { id: 'foxears', slot: 'ears', name: 'Lisie uszy', boxes:
    ear([[0.75, -9.5, 3.5, 1.5], [1.25, -10.5, 3, 1], [1.75, -11.5, 2, 1], [2.25, -12.5, 1, 1]], [2.5, -8, -2.25], 9, ['cap', 'beanie', 'headphones']) },
  { id: 'bunnyears', slot: 'ears', name: 'Królicze uszy', boxes:
    ear([[1, -15.5, 2, 7.5]], [2, -8, -2.25], 7, ['cap', 'beanie', 'headphones'], 12) },
  // on the sides, pointing up and back (where the headphones' cups sit)
  { id: 'elfears', slot: 'ears', name: 'Uszy elfa', boxes: sides([
    { bone: 'head', from: [4.25, -5, -0.5], size: [1.25, 3, 1.5] },
    { bone: 'head', from: [4.5, -6.5, 0.25], size: [1, 1.5, 1.25] },
    { bone: 'head', from: [4.5, -7.75, 1], size: [0.75, 1.25, 1] },
  ], { pivot: [4.5, -3.5, 0.25], twitch: { axis: 'z', amp: 7, phase: 0 }, hats: ['tophat', 'crown', 'cap', 'beanie', 'wizard', 'halo'] }) },
  { id: 'devilhorns', slot: 'ears', name: 'Rogi diabła', boxes: sides([
    { bone: 'head', from: [1.5, -9.5, -3.25], size: [1.5, 1.5, 1.5] },
    { bone: 'head', from: [2, -10.5, -3], size: [1.25, 1, 1.25] },
    { bone: 'head', from: [2.5, -11.25, -2.75], size: [0.75, 0.75, 0.75] },
  ], { hats: ['cap', 'beanie', 'headphones'] }) },
  // curled on the sides: back from the top, down, forward and up to the tip
  { id: 'ramhorns', slot: 'ears', name: 'Rogi barana', boxes: sides([
    { bone: 'head', from: [4.25, -7.75, -2], size: [1.75, 1.75, 3] },
    { bone: 'head', from: [4.5, -6, 0], size: [1.75, 3, 2] },
    { bone: 'head', from: [4.75, -3.5, -2], size: [1.5, 1.5, 2.5] },
    { bone: 'head', from: [4.75, -4.75, -2.75], size: [1.25, 1.5, 1] },
  ], { hats: ['tophat', 'crown', 'cap', 'beanie', 'wizard', 'halo'] }) },
  { id: 'antlers', slot: 'ears', name: 'Poroże', boxes: sides([
    { bone: 'head', from: [1.5, -9.5, -2.75], size: [1, 1.5, 1] },
    { bone: 'head', from: [2, -12.5, -2.75], size: [1, 3, 1] },
    { bone: 'head', from: [3, -11.5, -2.75], size: [2, 1, 1] },
    { bone: 'head', from: [4, -13.5, -2.75], size: [1, 2, 1] },
    { bone: 'head', from: [2, -14.5, -2.75], size: [1, 2, 1] },
    { bone: 'head', from: [2, -11, -3.75], size: [1, 1, 1] },
  ], { hats: ['cap', 'beanie', 'headphones'] }) },
  // on the forehead, tipped forward
  { id: 'unicorn', slot: 'ears', name: 'Róg jednorożca', boxes: ([
    [[-1, -10, -4], [2, 1.5, 2]], [[-0.75, -11.5, -3.75], [1.5, 1.5, 1.5]], [[-0.5, -13, -3.5], [1, 1.5, 1]], [[-0.25, -14.25, -3.25], [0.5, 1.25, 0.5]],
  ] as [number, number, number][][]).map(([from, size]): ClothingBox => ({ bone: 'head', from, size, pivot: [0, -8.5, -3], rotate: [20, 0, 0], hats: ['crown', 'cap', 'beanie', 'headphones', 'halo'] })) },
];

/** The same boxes on the left (as given, +x) and mirrored on the right, with the pivot, turn and twitch mirrored too. */
function sides(left: ClothingBox[], extra: Partial<ClothingBox> = {}): ClothingBox[] {
  const { pivot: p, rotate: r, twitch: tw } = extra;
  return [
    ...left.map((b) => ({ ...b, ...extra })),
    ...left.map((b): ClothingBox => ({
      ...b, ...extra,
      from: [-(b.from[0] + b.size[0]), b.from[1], b.from[2]],
      ...(p ? { pivot: [-p[0], p[1], p[2]] as [number, number, number] } : {}),
      ...(r ? { rotate: [r[0], -r[1], -r[2]] as [number, number, number] } : {}),
      // the other ear a moment later
      ...(tw ? { twitch: { ...tw, amp: -tw.amp, phase: tw.phase + 0.12 } } : {}),
    })),
  ];
}

/**
 * A pair of ears on top of the head, each a stack of steps [x, y, width, height] (the left ear's,
 * 1 deep), twitching outward by up to `amp` degrees about `pivot` (its base), tipped out by `tilt`.
 */
function ear(steps: [number, number, number, number][], pivot: [number, number, number], amp: number, hats: string[], tilt = 0): ClothingBox[] {
  return sides(steps.map(([x, y, w, h]): ClothingBox => ({ bone: 'head', from: [x, y, -2.75], size: [w, h, 1] })),
    { pivot, twitch: { axis: 'z', amp, phase: 0 }, hats, ...(tilt ? { rotate: [0, 0, tilt] as [number, number, number] } : {}) });
}

/** A box on a slim (3 pixels wide) arm: the same box a pixel narrower on the outer side. */
export function slimBox(box: ClothingBox): ClothingBox {
  if (box.bone === 'right_arm') return { ...box, from: [box.from[0] + 1, box.from[1], box.from[2]], size: [box.size[0] - 1, box.size[1], box.size[2]] };
  if (box.bone === 'left_arm') return { ...box, size: [box.size[0] - 1, box.size[1], box.size[2]] };
  return box;
}

/**
 * Where each box's picture lies in the item's texture (the game's box layout: the top and bottom
 * in a row above the four sides), packed in rows from the top left in the order of the boxes.
 */
export function layout(item: ClothingItem): [number, number][] {
  const [tw] = CLOTHING_TEXTURE;
  let x = 0, y = 0, row = 0;
  return item.boxes.map((b) => {
    const [w, h, d] = b.size.map(Math.ceil);
    const bw = 2 * (w + d), bh = d + h;
    if (x + bw > tw) {
      x = 0;
      y += row;
      row = 0;
    }
    const at: [number, number] = [x, y];
    x += bw;
    row = Math.max(row, bh);
    return at;
  });
}

export type Face = 'down' | 'up' | 'west' | 'north' | 'east' | 'south';
/** A face as the game draws it: four corners, each [x, y, z, u, v] (u, v from 0 to 1). */
export interface Quad { face: Face; corners: number[][] }

/** The six faces of a box whose picture starts at (u, v), exactly as the game's ModelPart.Cube builds them. */
export function boxQuads(box: ClothingBox, [u, v]: [number, number]): Quad[] {
  const [tw, th] = CLOTHING_TEXTURE;
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

export const clothingItem = (id: string): ClothingItem | undefined => CLOTHING.find((c) => c.id === id);
