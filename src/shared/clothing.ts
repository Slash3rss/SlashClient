/**
 * SlashClient clothing: hats, tops, shoes and things on the hands worn over the skin, made of boxes the way the game makes its
 * models. One definition for all: scripts/make-clothing.mjs paints each item's picture from it and
 * writes it for the mod (assets/slashclient-hud/clothing.json), and the launcher's and the website's
 * 3D previews build the same boxes from it.
 *
 * Units are the game's model pixels, in the space of the part the box is fixed to (y down, the face
 * towards -z): the head's from (-4,-8,-4) to (4,0,4) above the neck, the body's from (-4,0,-2) to
 * (4,12,2) below it, an arm's from (-3,-2,-2) (the right one; the left from (-1,-2,-2)) 4 wide, 12 long
 * (the hand's end at y 10), a leg's from (-2,0,-2) 4 wide, 12 long (the sole at y 12, on the ground).
 * The skin's own outer layer stands 0.25 (body, arms) or 0.5 (head) off the skin; what lies over it
 * stands further off, so the two never fight.
 */

export type ClothingSlot = 'hat' | 'top' | 'shoes' | 'hands';
export type Bone = 'head' | 'body' | 'right_arm' | 'left_arm' | 'right_leg' | 'left_leg';

export interface ClothingBox {
  bone: Bone;
  from: [number, number, number];
  size: [number, number, number];
  /** Grows the box on every side without changing its picture (as the game's CubeDeformation). */
  inflate?: number;
}

export interface ClothingItem {
  id: string;
  slot: ClothingSlot;
  name: string;
  boxes: ClothingBox[];
}

/** The picture of every item is this big, in model pixels (painted 4× finer). */
export const CLOTHING_TEXTURE: [number, number] = [64, 64];
export const CLOTHING_SCALE = 4;

/** A low shoe: the upper round the foot, a sole a little longer in front. */
const SNEAKER: Omit<ClothingBox, 'bone'>[] = [
  { from: [-2.5, 9, -2.75], size: [5, 2.5, 5.25] },
  { from: [-2.75, 11.25, -3.25], size: [5.5, 0.75, 6] },
];

/**
 * The same boxes on both legs (a leg's own space is the same for both). The legs stand closer than
 * a shoe is wide, so the left shoe is a hair smaller: where the two meet their faces never lie in one plane.
 */
function legs(boxes: Omit<ClothingBox, 'bone'>[]): ClothingBox[] {
  return [...boxes.map((b) => ({ bone: 'right_leg' as Bone, ...b })), ...boxes.map((b) => ({ bone: 'left_leg' as Bone, ...b, inflate: (b.inflate ?? 0) - 0.02 }))];
}

/** Boxes given for the right arm, on the left arm mirrored. */
function mirrored(b: Omit<ClothingBox, 'bone'>): Omit<ClothingBox, 'bone'> {
  return { ...b, from: [-(b.from[0] + b.size[0]), b.from[1], b.from[2]] };
}

/** Boxes given for the right arm, on both arms. */
function arms(boxes: Omit<ClothingBox, 'bone'>[]): ClothingBox[] {
  return [...boxes.map((b) => ({ bone: 'right_arm' as Bone, ...b })), ...leftArm(boxes)];
}

/** Boxes given for the right arm (the outer side at -x), on the left one only. */
function leftArm(boxes: Omit<ClothingBox, 'bone'>[]): ClothingBox[] {
  return boxes.map((b) => ({ bone: 'left_arm' as Bone, ...mirrored(b) }));
}

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
  // ---------- on the feet: the same pair on both legs (hidden under real boots) ----------
  { id: 'sneakers_red', slot: 'shoes', name: 'Trampki czerwone', boxes: legs(SNEAKER) },
  { id: 'sneakers_blue', slot: 'shoes', name: 'Trampki niebieskie', boxes: legs(SNEAKER) },
  { id: 'hikingboots', slot: 'shoes', name: 'Traperki', boxes: legs([
    { from: [-2.5, 6.5, -2.5], size: [5, 5, 5] },
    { from: [-2.5, 9.5, -3.25], size: [5, 2, 0.75] },
    { from: [-2.75, 11.5, -3.5], size: [5.5, 0.5, 6.25] },
  ]) },
  { id: 'slippers', slot: 'shoes', name: 'Kapcie', boxes: legs([
    { from: [-2.5, 10, -3], size: [5, 1.5, 5.5] },
    { from: [-2.75, 11.5, -3.25], size: [5.5, 0.5, 6] },
    { from: [-0.75, 9.25, -3], size: [1.5, 0.75, 1] },
  ]) },
  // a fluffy bunny on each foot: its ears stand up in front of the shin
  { id: 'bunnyslippers', slot: 'shoes', name: 'Kapcie króliczki', boxes: legs([
    { from: [-2.75, 9.25, -3.5], size: [5.5, 2.75, 6.25] },
    { from: [-2, 6.5, -3.25], size: [1, 2.75, 0.5] },
    { from: [1, 6.5, -3.25], size: [1, 2.75, 0.5] },
  ]) },
  // a nozzle behind each heel (the mod and the previews add little flames under them)
  { id: 'rocketboots', slot: 'shoes', name: 'Buty rakietowe', boxes: legs([
    { from: [-2.5, 7, -2.5], size: [5, 4.5, 5] },
    { from: [-2.75, 11.5, -3], size: [5.5, 0.5, 5.75] },
    { from: [-1.5, 9.5, 2.5], size: [3, 2, 1] },
  ]) },
  // a boot on a plate, four wheels at its corners
  { id: 'rollerskates', slot: 'shoes', name: 'Wrotki', boxes: legs([
    { from: [-2.5, 7.75, -2.75], size: [5, 3, 5.25] },
    { from: [-2.5, 10.75, -3], size: [5, 0.5, 5.75] },
    { from: [-1.25, 11.25, -2.25], size: [2.5, 0.5, 4.5] },
    { from: [-2.75, 11, -2.75], size: [1.25, 1, 1.25] },
    { from: [1.5, 11, -2.75], size: [1.25, 1, 1.25] },
    { from: [-2.75, 11, 1.25], size: [1.25, 1, 1.25] },
    { from: [1.5, 11, 1.25], size: [1.25, 1, 1.25] },
  ]) },
  { id: 'flippers', slot: 'shoes', name: 'Płetwy', boxes: legs([
    { from: [-2.5, 9.5, -2.75], size: [5, 2.5, 5.25] },
    { from: [-3, 11.5, -9], size: [6, 0.5, 6.25] },
  ]) },
  // ---------- on the hands: gloves on both, a watch or a band on the left wrist (the off hand), a ring on the right ----------
  { id: 'boxinggloves', slot: 'hands', name: 'Rękawice bokserskie', boxes: arms([
    { from: [-3, 6, -2], size: [4, 4, 4], inflate: 0.9 },
    { from: [-3, 4, -2], size: [4, 1.5, 4], inflate: 0.6 },
  ]) },
  { id: 'wristwatch', slot: 'hands', name: 'Zegarek', boxes: leftArm([
    { from: [-3, 6.5, -2], size: [4, 1, 4], inflate: 0.3 },
    { from: [-3.65, 6.25, -1], size: [0.5, 1.5, 2] },
  ]) },
  { id: 'bracelet', slot: 'hands', name: 'Bransoletka', boxes: leftArm([
    { from: [-3, 6.25, -2], size: [4, 0.75, 4], inflate: 0.3 },
    { from: [-3.7, 6.75, -0.5], size: [0.5, 1, 1] },
  ]) },
  // spikes on the outer side and over the knuckles
  { id: 'spikedgauntlets', slot: 'hands', name: 'Kolczaste rękawice', boxes: arms([
    { from: [-3, 4, -2], size: [4, 6, 4], inflate: 0.45 },
    { from: [-4.4, 5, -0.5], size: [1, 1, 1] },
    { from: [-4.4, 7.5, -0.5], size: [1, 1, 1] },
    { from: [-2.25, 8.25, -3.4], size: [1, 1, 1] },
    { from: [-0.25, 8.25, -3.4], size: [1, 1, 1] },
  ]) },
  { id: 'mittens', slot: 'hands', name: 'Rękawiczki zimowe', boxes: arms([
    { from: [-3, 6.5, -2], size: [4, 3.75, 4], inflate: 0.55 },
    { from: [-3, 4.75, -2], size: [4, 1.5, 4], inflate: 0.75 },
  ]) },
  { id: 'goldring', slot: 'hands', name: 'Złoty pierścień', boxes: [
    { bone: 'right_arm', from: [-3, 8.75, -2], size: [4, 0.5, 4], inflate: 0.28 },
    { bone: 'right_arm', from: [-1.5, 8.5, -2.75], size: [1, 1, 0.5] },
  ] },
  { id: 'smartband', slot: 'hands', name: 'Opaska sportowa', boxes: leftArm([
    { from: [-3, 6.25, -2], size: [4, 1.25, 4], inflate: 0.3 },
    { from: [-3.65, 6.25, -1.25], size: [0.5, 1.25, 2.5] },
  ]) },
];

/**
 * A box on a slim (3 pixels wide) arm: one round the whole arm a pixel narrower on the outer side;
 * a smaller one (a spike, a watch's face) as big as it was, moved to the same place on the narrower arm.
 */
export function slimBox(box: ClothingBox): ClothingBox {
  if (box.bone !== 'right_arm' && box.bone !== 'left_arm') return box;
  // the wide arm's sides (x)
  const [lo, hi] = box.bone === 'right_arm' ? [-3, 1] : [-1, 3];
  const [x, y, z] = box.from;
  const [w, h, d] = box.size;
  if (x <= lo && x + w >= hi) return box.bone === 'right_arm' ? { ...box, from: [x + 1, y, z], size: [w - 1, h, d] } : { ...box, size: [w - 1, h, d] };
  // the slim arm is the wide one squeezed towards its inner side (the right arm's +x, the left's -x)
  const inner = box.bone === 'right_arm' ? hi : lo;
  const centre = x + w / 2;
  return { ...box, from: [Math.round((inner + (centre - inner) * 0.75 - w / 2) * 1000) / 1000, y, z] };
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

/**
 * The six faces of a box whose picture starts at (u, v), exactly as the game's ModelPart.Cube builds them
 * (in a picture of the clothing's size, or of `[tw, th]`: the suits', suits.ts).
 */
export function boxQuads<B extends Pick<ClothingBox, 'from' | 'size' | 'inflate'>>(box: B, [u, v]: [number, number], [tw, th] = CLOTHING_TEXTURE): Quad[] {
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
