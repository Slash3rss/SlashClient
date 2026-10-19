/**
 * SlashClient suits ("suit", Polish "Strój"): full-body costumes worn over the skin, a second
 * layer of boxes a little bigger than the body on all six parts (head, body, both arms, both legs),
 * so they move with the limbs. One definition for all, as for the clothing (clothing.ts):
 * scripts/make-suits.mjs paints each suit's picture from it and writes it for the mod
 * (assets/slashclient-hud/suits.json, textures/suit), and the launcher's and the website's 3D
 * previews build the same boxes from it (src/renderer/suitPreview.ts).
 *
 * Units and spaces are the clothing's (see clothing.ts): the game's model pixels in the space of the
 * part a box hangs on; a leg's box is from (-2,0,-2), 4×12×4 below the hip.
 *
 * Rules (the mod, the launcher and the website keep them alike):
 * - a suit hides the hat and the top (and any other cosmetic worn on the head or the body, see
 *   Suits.hides in the mod), since all of them would stick through it;
 * - real armour hides the part of the suit it covers: a helmet (or anything worn on the head) the
 *   head's boxes, a chestplate the body's and the arms', leggings the legs' upper boxes, boots the
 *   boots; an elytra or a chestplate also hides what the suit carries on the back;
 * - a cape, wings or an elytra on the back hide the suit's back boxes (a backpack, a tail), which
 *   would go through them.
 */

export type SuitBone = 'head' | 'body' | 'right_arm' | 'left_arm' | 'right_leg' | 'left_leg';
/** What hides a box: the armour piece over it, or something worn on the back. */
export type SuitPart = 'head' | 'chest' | 'legs' | 'feet' | 'back';

export interface SuitBox {
  /** What it is, for painting it (several boxes may share a name). */
  name: string;
  bone: SuitBone;
  from: [number, number, number];
  size: [number, number, number];
  inflate?: number;
  /** Hidden by this (the bone's own by default: head, chest for the body and arms, legs). */
  part?: SuitPart;
}

export interface SuitItem {
  id: string;
  name: string;
  boxes: SuitBox[];
}

/** The picture of every suit is this big, in model pixels (painted 4× finer). */
export const SUIT_TEXTURE: [number, number] = [128, 64];
export const SUIT_SCALE = 4;

/** How far each layer stands off the skin: over its outer layer (0.25, the head's 0.5) and leggings (0.5). */
const BODY = 0.6, LIMB = 0.55, BOOT = 0.65;

/** The second skin every suit is made of: the head (a hood or a helmet), the body, the arms, the legs and boots. */
function base(head = 1): SuitBox[] {
  return [
    { name: 'head', bone: 'head', from: [-4, -8, -4], size: [8, 8, 8], inflate: head },
    { name: 'body', bone: 'body', from: [-4, 0, -2], size: [8, 12, 4], inflate: BODY },
    { name: 'arm', bone: 'right_arm', from: [-3, -2, -2], size: [4, 12, 4], inflate: LIMB },
    { name: 'arm', bone: 'left_arm', from: [-1, -2, -2], size: [4, 12, 4], inflate: LIMB },
    // the boots a little bigger than the legs, so their sides never lie in the same plane
    { name: 'leg', bone: 'right_leg', from: [-2, 0, -2], size: [4, 8, 4], inflate: LIMB },
    { name: 'leg', bone: 'left_leg', from: [-2, 0, -2], size: [4, 8, 4], inflate: LIMB },
    { name: 'boot', bone: 'right_leg', from: [-2, 8, -2], size: [4, 4, 4], inflate: BOOT, part: 'feet' },
    { name: 'boot', bone: 'left_leg', from: [-2, 8, -2], size: [4, 4, 4], inflate: BOOT, part: 'feet' },
  ];
}

/** A box on both arms (the right one given; the left one mirrored). */
function onArms(name: string, from: [number, number, number], size: [number, number, number], inflate?: number): SuitBox[] {
  return [
    { name, bone: 'right_arm', from, size, inflate },
    { name, bone: 'left_arm', from: [-from[0] - size[0], from[1], from[2]], size, inflate },
  ];
}

export const SUITS: SuitItem[] = [
  // a round helmet with a gold visor, a life-support pack on the back
  { id: 'astronaut', name: 'Astronauta', boxes: [
    ...base(1.25),
    { name: 'panel', bone: 'body', from: [-2.5, 2.5, -3.1], size: [5, 3, 0.5] },
    { name: 'pack', bone: 'body', from: [-3, 1, 2.6], size: [6, 8, 3], part: 'back' },
  ] },
  // red lacquered plates laced together, a helmet with a golden crest and a neck guard, shoulder plates and a skirt
  { id: 'samurai', name: 'Zbroja samuraja', boxes: [
    ...base(1),
    { name: 'crest', bone: 'head', from: [-1.5, -10, -5.5], size: [3, 2, 1] },
    { name: 'horn', bone: 'head', from: [-4, -13, -5.25], size: [1, 4, 1] },
    { name: 'horn', bone: 'head', from: [3, -13, -5.25], size: [1, 4, 1] },
    { name: 'guard', bone: 'head', from: [-5.5, -4, -3], size: [11, 3, 9] },
    ...onArms('sode', [-3, -2, -2], [4, 5, 4], 1.2),
    { name: 'skirt', bone: 'body', from: [-4, 9, -2], size: [8, 4, 4], inflate: 1.1 },
  ] },
  // white and black, with round ears, a snout and a stubby tail
  { id: 'pandasuit', name: 'Panda', boxes: [
    ...base(1),
    { name: 'ear', bone: 'head', from: [-5, -10.5, -1], size: [3, 3, 2] },
    { name: 'ear', bone: 'head', from: [2, -10.5, -1], size: [3, 3, 2] },
    { name: 'snout', bone: 'head', from: [-2, -4, -5.75], size: [4, 3, 1] },
    { name: 'tail', bone: 'body', from: [-1, 9, 2.6], size: [2, 2, 1], part: 'back' },
  ] },
  // a green hood with a toothy snout, spikes down the back and a tail
  { id: 'dinosuit', name: 'Dinozaur', boxes: [
    ...base(1),
    { name: 'snout', bone: 'head', from: [-3, -5, -8], size: [6, 4, 3] },
    { name: 'spike', bone: 'head', from: [-0.5, -10, -2], size: [1, 1, 3] },
    { name: 'spike', bone: 'head', from: [-0.5, -9, 3], size: [1, 2, 3] },
    { name: 'spike', bone: 'body', from: [-0.5, 1, 2.6], size: [1, 2, 2], part: 'back' },
    { name: 'spike', bone: 'body', from: [-0.5, 4.5, 2.6], size: [1, 2, 2], part: 'back' },
    { name: 'tail', bone: 'body', from: [-2, 8, 2.6], size: [4, 3, 4], part: 'back' },
    { name: 'tailtip', bone: 'body', from: [-1, 9, 6.6], size: [2, 2, 3], part: 'back' },
  ] },
  // steel plates with rivets, a great helm with a plume, pauldrons and a blue tabard
  { id: 'knight', name: 'Rycerz', boxes: [
    ...base(1),
    { name: 'plume', bone: 'head', from: [-0.5, -12, -2], size: [1, 3, 6] },
    ...onArms('pauldron', [-3, -2, -2], [4, 4, 4], 1.1),
  ] },
  // a sheet thrown over: loose all round, eye holes, ragged hems
  { id: 'ghostsheet', name: 'Duch z prześcieradła', boxes: [
    ...base(1.3).map((b) => (b.name === 'body' ? { ...b, inflate: 1 } : b.name === 'arm' ? { ...b, inflate: 0.8 } : b)),
  ] },
  // a robot's armour: big shoulders, a glowing core and visor, an antenna, thrusters on the back
  { id: 'mech', name: 'Mech', boxes: [
    ...base(1),
    { name: 'antenna', bone: 'head', from: [2.5, -12.5, -0.5], size: [1, 4, 1] },
    { name: 'earpiece', bone: 'head', from: [-6, -6, -1.5], size: [1, 3, 3] },
    { name: 'earpiece', bone: 'head', from: [5, -6, -1.5], size: [1, 3, 3] },
    ...onArms('shoulder', [-3, -2, -2], [4, 4, 4], 1.3),
    { name: 'core', bone: 'body', from: [-1.5, 3, -3.1], size: [3, 3, 0.5] },
    { name: 'thruster', bone: 'body', from: [-3.5, 2, 2.6], size: [3, 7, 2], part: 'back' },
    { name: 'thruster', bone: 'body', from: [0.5, 2, 2.6], size: [3, 7, 2], part: 'back' },
  ] },
  // a tricorne over a bandana (the face shows), an eyepatch, a long red coat, bare hands
  { id: 'pirate', name: 'Pirat', boxes: [
    ...base(0.75),
    { name: 'brim', bone: 'head', from: [-6, -10, -6], size: [12, 1, 12] },
    { name: 'crown', bone: 'head', from: [-4.5, -12, -4.5], size: [9, 2, 9] },
    { name: 'coattail', bone: 'body', from: [-4, 9, -2], size: [8, 6, 4], inflate: 0.9 },
  ] },
];

const ARM_BONES = new Set<SuitBone>(['right_arm', 'left_arm']);

/** A box as on slim (3 pixels wide) arms: a pixel narrower on the outer side (other boxes as they are). */
export function slimSuitBox(box: SuitBox): SuitBox {
  if (box.bone === 'right_arm') return { ...box, from: [box.from[0] + 1, box.from[1], box.from[2]], size: [box.size[0] - 1, box.size[1], box.size[2]] };
  if (box.bone === 'left_arm') return { ...box, size: [box.size[0] - 1, box.size[1], box.size[2]] };
  return box;
}

/**
 * Where each box's picture lies (the game's box layout: the top and bottom in a row above the four sides, packed in rows from the top left), and
 * for boxes on the arms a second picture for slim (3 pixels wide) arms, packed after the rest, so
 * both arm widths are painted to fit instead of one being cut from the other.
 */
export function suitLayout(suit: SuitItem): { uv: [number, number][]; slimUv: ([number, number] | undefined)[] } {
  const slim = suit.boxes.map((b, i) => (ARM_BONES.has(b.bone) ? i : -1)).filter((i) => i >= 0);
  const [tw, th] = SUIT_TEXTURE;
  let x = 0, y = 0, row = 0;
  const all = [...suit.boxes, ...slim.map((i) => slimSuitBox(suit.boxes[i]))].map((b): [number, number] => {
    const [w, h, d] = b.size.map(Math.ceil);
    const bw = 2 * (w + d), bh = d + h;
    if (x + bw > tw) {
      x = 0;
      y += row;
      row = 0;
    }
    if (y + bh > th) throw new Error(`${suit.id} does not fit its picture`);
    const at: [number, number] = [x, y];
    x += bw;
    row = Math.max(row, bh);
    return at;
  });
  const uv = all.slice(0, suit.boxes.length);
  const slimUv = suit.boxes.map((_, i) => (slim.includes(i) ? all[suit.boxes.length + slim.indexOf(i)] : undefined));
  return { uv, slimUv };
}

/** The part that hides a box (see the rules at the top). */
export const suitPart = (box: SuitBox): SuitPart => box.part ?? (box.bone === 'head' ? 'head' : box.bone.endsWith('_leg') ? 'legs' : 'chest');

export const suitItem = (id: string): SuitItem | undefined => SUITS.find((s) => s.id === id);
