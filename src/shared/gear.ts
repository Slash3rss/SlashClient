/**
 * SlashClient back items ("back": a backpack, a quiver, a katana…) and tails ("tail"), made of
 * boxes the way the game makes its models, like the clothing (clothing.ts). One definition for
 * all: scripts/make-gear.mjs paints each item's picture from it and writes it for the mod
 * (assets/slashclient-hud/gear.json), and the launcher's and the website's 3D previews build the
 * same boxes from it and move the tails the same way (`tailAngles`, mirrored in the mod's Gear.java).
 *
 * Units are the game's model pixels in the body's space (y down, the face towards -z, the back at
 * z 2, the body from y 0 at the neck to 12 at the hips). A box may turn round a pivot of its own
 * (`pivot`, `rot` in radians, turned as the game turns a model part: z, then y, then x); its `from`
 * is then from that pivot.
 *
 * How they go with the rest of the back: a back item takes the place of the cape and the wings
 * (they are not drawn while it is worn) and hides under a real elytra; a tail is always there,
 * hanging lower under a cape so the cape falls over it.
 */

/** A box as clothing.ts's `boxQuads` takes it (always on the body here). */
export interface ClothingBox {
  bone: 'body';
  from: [number, number, number];
  size: [number, number, number];
  inflate?: number;
}

export type GearSlot = 'back' | 'tail';

export interface GearBox {
  from: [number, number, number];
  size: [number, number, number];
  inflate?: number;
  pivot?: [number, number, number];
  rot?: [number, number, number];
  /** A jet's flame: flickers longer and shorter from its top (the pivot). */
  flame?: boolean;
  /** What holds it on (left out of its icon). */
  strap?: boolean;
}

export interface BackItem {
  id: string;
  slot: 'back';
  name: string;
  boxes: GearBox[];
}

/** One piece of a tail: a box `size` [width, height, length] going back (+z) from its joint, and anything stuck on it. */
export interface TailSegment {
  size: [number, number, number];
  extras?: { from: [number, number, number]; size: [number, number, number] }[];
}

export interface TailChain {
  segments: TailSegment[];
  /** Turned to the side (a fan of tails), radians. */
  spread?: number;
  /** Raised more than the item's `droop`, radians. */
  lift?: number;
}

export interface TailItem {
  id: string;
  slot: 'tail';
  name: string;
  chains: TailChain[];
  /** The first piece's tilt (negative: hanging down), radians. */
  droop: number;
  /** How much each further piece bends up, radians. */
  curl: number;
}

export type GearItem = BackItem | TailItem;

/** Where a tail grows from, in the body's space: low on the back, above the hips. */
export const TAIL_BASE: [number, number, number] = [0, 10.75, 2.1];
/** How far a piece's box starts before its joint, and how much of it the next piece overlaps. */
export const TAIL_OVERLAP = 0.8;

/** The two straps over the shoulders and down the chest that hold a back item. */
function straps(): GearBox[] {
  return [
    { from: [-3, -0.75, -2.75], size: [1.25, 0.6, 5.5], strap: true },
    { from: [1.75, -0.75, -2.75], size: [1.25, 0.6, 5.5], strap: true },
    { from: [-3, -0.15, -2.75], size: [1.25, 8, 0.35], strap: true },
    { from: [1.75, -0.15, -2.75], size: [1.25, 8, 0.35], strap: true },
  ];
}

/** One strap across the chest, from a shoulder to the other hip (`turn` > 0: from the left shoulder). */
function sash(turn: number): GearBox {
  return { pivot: [0, 6, -2.6], rot: [0, 0, turn], from: [-0.6, -6.5, -0.2], size: [1.2, 13, 0.4], strap: true };
}

export const BACK_ITEMS: BackItem[] = [
  { id: 'backpack', slot: 'back', name: 'Plecak', boxes: [
    { from: [-3.5, 0.75, 2.5], size: [7, 9, 3.5] },
    { from: [-3.75, 0.25, 2.3], size: [7.5, 1.75, 4] },
    { from: [-2.5, 5, 6], size: [5, 3.5, 1.25] },
    ...straps(),
  ] },
  { id: 'quiver', slot: 'back', name: 'Kołczan', boxes: [
    { pivot: [0.5, 5.5, 4], rot: [0, 0, 0.45], from: [-1.5, -5.5, -1.5], size: [3, 11, 3] },
    { pivot: [0.5, 5.5, 4], rot: [0, 0, 0.45], from: [-1.5, -5.5, -1.5], size: [3, 1, 3], inflate: 0.3 },
    // three arrows, each a shaft and its feathers
    { pivot: [0.5, 5.5, 4], rot: [0, 0, 0.45], from: [-1, -8.5, -0.8], size: [0.5, 3, 0.5] },
    { pivot: [0.5, 5.5, 4], rot: [0, 0, 0.45], from: [-1.25, -10.5, -0.55], size: [1, 2, 0] },
    { pivot: [0.5, 5.5, 4], rot: [0, 0, 0.45], from: [0.35, -8, 0.1], size: [0.5, 2.5, 0.5] },
    { pivot: [0.5, 5.5, 4], rot: [0, 0, 0.45], from: [0.1, -10, 0.35], size: [1, 2, 0] },
    { pivot: [0.5, 5.5, 4], rot: [0, 0, 0.45], from: [-0.2, -9, 0.6], size: [0.5, 3.5, 0.5] },
    { pivot: [0.5, 5.5, 4], rot: [0, 0, 0.45], from: [-0.45, -11, 0.85], size: [1, 2, 0] },
    sash(0.6),
  ] },
  { id: 'katana', slot: 'back', name: 'Katana', boxes: [
    { pivot: [0, 5.5, 3.3], rot: [0, 0, -0.6], from: [-0.8, -4, -0.6], size: [1.6, 13, 1.2] },
    { pivot: [0, 5.5, 3.3], rot: [0, 0, -0.6], from: [-1.6, -4.6, -1], size: [3.2, 0.6, 2] },
    { pivot: [0, 5.5, 3.3], rot: [0, 0, -0.6], from: [-0.6, -9.4, -0.5], size: [1.2, 4.8, 1] },
    { pivot: [0, 5.5, 3.3], rot: [0, 0, -0.6], from: [-0.75, -9.9, -0.65], size: [1.5, 0.5, 1.3] },
    sash(-0.6),
  ] },
  { id: 'guitar', slot: 'back', name: 'Gitara', boxes: [
    { pivot: [0.5, 6.5, 3.6], rot: [0, 0, 0.35], from: [-3.5, 1.5, -1], size: [7, 5, 2] },
    { pivot: [0.5, 6.5, 3.6], rot: [0, 0, 0.35], from: [-2.75, -2, -1], size: [5.5, 3.5, 2] },
    { pivot: [0.5, 6.5, 3.6], rot: [0, 0, 0.35], from: [-0.6, -11, 0.25], size: [1.2, 9, 0.75] },
    { pivot: [0.5, 6.5, 3.6], rot: [0, 0, 0.35], from: [-1, -13.5, 0.15], size: [2, 2.5, 0.9] },
    sash(0.6),
  ] },
  { id: 'jetpack', slot: 'back', name: 'Plecak odrzutowy', boxes: [
    { from: [-3.75, 1, 2.6], size: [3, 8.5, 3] },
    { from: [0.75, 1, 2.6], size: [3, 8.5, 3] },
    { from: [-0.75, 2, 2.3], size: [1.5, 6, 2] },
    { from: [-3.25, 9.5, 3.1], size: [2, 1.5, 2] },
    { from: [1.25, 9.5, 3.1], size: [2, 1.5, 2] },
    { pivot: [-2.25, 11, 4.1], from: [-0.75, 0, -0.75], size: [1.5, 3, 1.5], flame: true },
    { pivot: [2.25, 11, 4.1], from: [-0.75, 0, -0.75], size: [1.5, 3, 1.5], flame: true },
    ...straps(),
  ] },
  // small folded feather wings, swept back from the shoulder blades
  { id: 'angelpack', slot: 'back', name: 'Anielskie piórka', boxes: [
    { pivot: [1, 1.5, 2.6], rot: [0.12, -0.55, -0.12], from: [0, 0, -0.5], size: [5, 9, 1] },
    { pivot: [1, 1.5, 2.6], rot: [0.12, -0.55, -0.12], from: [0.5, 8.5, -0.25], size: [3.5, 3, 0.5] },
    { pivot: [-1, 1.5, 2.6], rot: [0.12, 0.55, 0.12], from: [-5, 0, -0.5], size: [5, 9, 1] },
    { pivot: [-1, 1.5, 2.6], rot: [0.12, 0.55, 0.12], from: [-4, 8.5, -0.25], size: [3.5, 3, 0.5] },
    { from: [-1.5, 1, 2.25], size: [3, 3, 1] },
  ] },
  { id: 'minichest', slot: 'back', name: 'Mała skrzynia', boxes: [
    { from: [-3.5, 3.25, 2.5], size: [7, 5, 4.5] },
    { from: [-3.5, 1, 2.5], size: [7, 2.25, 4.5] },
    { from: [-0.6, 2.5, 7], size: [1.2, 2, 0.5] },
    ...straps(),
  ] },
  { id: 'backshield', slot: 'back', name: 'Tarcza', boxes: [
    { from: [-4, 0.5, 2.5], size: [8, 10.5, 1] },
    { from: [-1, 4.5, 3.5], size: [2, 2, 0.75] },
    ...straps(),
  ] },
];

/** A tail of `n` pieces of the same thickness. */
const even = (n: number, w: number, len: number): TailSegment[] => Array.from({ length: n }, () => ({ size: [w, w, len] }));
/** The dragon's: thick at the root, thin at the end, a spike on top of each piece. */
const dragon: TailSegment[] = ([[4, 3.4], [3.4, 2.9], [2.8, 2.4], [2.2, 1.9], [1.7, 1.5], [1.2, 1.1]] as [number, number][]).map(([w, h]) => ({
  size: [w, h, 3],
  extras: [{ from: [-0.4, -h / 2 - 1.1, 0.6], size: [0.8, 1.1, 1.2] }],
}));
const kitsune: TailSegment[] = ([[2, 2.6], [2.8, 3], [3.2, 3], [2.6, 2.8], [1.8, 2.2]] as [number, number][]).map(([w, len]) => ({ size: [w, w, len] }));

export const TAILS: TailItem[] = [
  { id: 'cattail', slot: 'tail', name: 'Koci ogon', droop: -0.8, curl: 0.3, chains: [{ segments: even(6, 1.5, 2.6) }] },
  { id: 'foxtail', slot: 'tail', name: 'Lisi ogon', droop: -0.85, curl: 0.12, chains: [{ segments: ([[2.2, 2.6], [3, 3], [3.8, 3.2], [3.8, 3.2], [3, 2.8], [2, 2.2]] as [number, number][]).map(([w, len]) => ({ size: [w, w * 0.95, len] as [number, number, number] })) }] },
  // a fan of five rising behind
  { id: 'kitsune', slot: 'tail', name: 'Kitsune', droop: -0.1, curl: 0.25, chains: [
    { segments: kitsune, spread: -0.9, lift: 0.05 },
    { segments: kitsune, spread: -0.45, lift: 0.3 },
    { segments: kitsune, spread: 0, lift: 0.5 },
    { segments: kitsune, spread: 0.45, lift: 0.3 },
    { segments: kitsune, spread: 0.9, lift: 0.05 },
  ] },
  { id: 'deviltail', slot: 'tail', name: 'Diabelski ogon', droop: -1, curl: 0.3, chains: [{ segments: [
    ...even(6, 0.9, 2.4),
    { size: [0.9, 0.9, 1.6], extras: [{ from: [-1.5, -0.3, 0.6], size: [3, 0.6, 3] }] },
  ] }] },
  { id: 'dragontail', slot: 'tail', name: 'Smoczy ogon', droop: -0.95, curl: 0.14, chains: [{ segments: dragon }] },
  { id: 'wolftail', slot: 'tail', name: 'Wilczy ogon', droop: -1.15, curl: 0.08, chains: [{ segments: [{ size: [2.4, 2.4, 3] }, { size: [3, 3, 3.2] }, { size: [3, 3, 3.2] }, { size: [2.4, 2.4, 2.6] }] }] },
  { id: 'squirreltail', slot: 'tail', name: 'Wiewiórczy ogon', droop: -0.4, curl: 0.42, chains: [{ segments: ([[2, 2], [3.2, 2.6], [4.2, 3], [4.6, 3], [4.6, 3], [4, 2.6], [3, 2]] as [number, number][]).map(([w, len]) => ({ size: [w, w * 0.95, len] as [number, number, number] })) }] },
];

export const GEAR: GearItem[] = [...BACK_ITEMS, ...TAILS];
export const gearItem = (id: string): GearItem | undefined => GEAR.find((g) => g.id === id);

/** What a box of a tail stands for: its chain, its piece, and whether it is stuck on the piece (a spike). */
export interface TailBoxInfo { chain: number; segment: number; extra: boolean }

/**
 * Every box of an item in one list, in the order their pictures are laid out (`layout`): a back
 * item's as they are; a tail's pieces chain by chain, each followed by what is stuck on it, in
 * the piece's own space (its joint at 0, going back along +z).
 */
export function gearBoxes(item: GearItem): { box: ClothingBox; gear?: GearBox; tail?: TailBoxInfo }[] {
  if (item.slot === 'back') return item.boxes.map((b) => ({ box: { bone: 'body', from: b.from, size: b.size, inflate: b.inflate }, gear: b }));
  const out: { box: ClothingBox; tail: TailBoxInfo }[] = [];
  item.chains.forEach((c, chain) => c.segments.forEach((s, segment) => {
    const [w, h, len] = s.size;
    out.push({ box: { bone: 'body', from: [-w / 2, -h / 2, -TAIL_OVERLAP / 2], size: [w, h, len] }, tail: { chain, segment, extra: false } });
    for (const e of s.extras ?? []) out.push({ box: { bone: 'body', from: e.from, size: e.size }, tail: { chain, segment, extra: true } });
  }));
  return out;
}

/** The picture of every item is this big, in model pixels (painted 4× finer), as the clothing's. */
export const GEAR_TEXTURE: [number, number] = [64, 64];

/**
 * Where each box's picture lies in the item's texture (the game's box layout, packed in rows
 * from the top left in the order of `gearBoxes`), as clothing.ts lays out the clothing's.
 */
export function gearLayout(item: GearItem): [number, number][] {
  const [tw] = GEAR_TEXTURE;
  let x = 0, y = 0, row = 0;
  return gearBoxes(item).map(({ box: b }) => {
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

/**
 * How a tail's piece is turned now: [tilt up, turn to the side] in radians. `time` in seconds,
 * `walk` how fast the player walks (0 standing … 1 running, the game's walk animation speed),
 * `phase` where the legs are in their swing (radians), `caped` when a cape hangs over it.
 * A slow sway standing, a swing with the steps walking, the whole tail raised a little running.
 * The mod's Gear.java does exactly the same.
 */
export function tailAngles(item: TailItem, chain: number, segment: number, time: number, walk: number, phase: number, caped: boolean): [number, number] {
  const c = item.chains[chain];
  const w = Math.max(0, Math.min(1, walk));
  const sway = 0.11 * Math.sin(time * 1.7 - segment * 0.55 + chain * 1.3) + w * 0.32 * Math.sin(phase - segment * 0.7);
  let pitch = segment === 0 ? item.droop + (c.lift ?? 0) + (caped ? -0.6 : 0) + w * 0.45 : item.curl * (1 - 0.35 * w);
  pitch += 0.04 * Math.sin(time * 1.1 + segment * 0.4) + w * 0.07 * Math.sin(2 * phase - segment * 0.5);
  // (each piece turns on from the one before: further ones turn less, or the tip would whip round)
  const yaw = (segment === 0 ? c.spread ?? 0 : 0) + sway * (segment === 0 ? 0.6 : 0.3);
  return [pitch, yaw];
}

/** How long a jet's flame is now (1: as built), flickering. */
export function flameScale(time: number, index: number): number {
  return 0.75 + 0.2 * Math.sin(time * 23 + index * 2.1) + 0.12 * Math.sin(time * 37 + index);
}
