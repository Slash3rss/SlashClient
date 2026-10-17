import type { CosmeticSetting } from './db.ts';

/**
 * The SlashClient cosmetics. Their pictures live in the HUD mod (textures/cape, textures/elytra,
 * textures/wings; trails, auras and pets are drawn from the game's own particles and mobs) and on
 * the website (web/capes); the server checks choices against these and the admin's settings.
 *
 * A player wears one item per slot. `rank` items are for that rank only (admins may wear all);
 * any item can also be made exclusive in the admin panel and granted to chosen players.
 */
export type Slot = 'cape' | 'wings' | 'elytra' | 'trail' | 'aura' | 'pet';
export const SLOTS: Slot[] = ['cape', 'wings', 'elytra', 'trail', 'aura', 'pet'];
export type Rank = 'admin' | 'support' | 'partner';

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  /** Only for players with this rank (admins may wear every rank's items). */
  rank?: Rank;
  /** An animated cape: how many frames (textures/cape/<id>_<n>.png). */
  frames?: number;
  /**
   * Added after the first launchers with cosmetics (0.9.0): those have no pictures for it, so
   * their menu leaves it out (see `knownTo`).
   */
  since?: number;
}

export const ITEMS: Item[] = [
  // capes: the original eight, the animated ones, and one in each rank's colour
  { id: 'slash', slot: 'cape', name: 'SlashClient' },
  { id: 'ocean', slot: 'cape', name: 'Ocean' },
  { id: 'ember', slot: 'cape', name: 'Ember' },
  { id: 'forest', slot: 'cape', name: 'Forest' },
  { id: 'galaxy', slot: 'cape', name: 'Galaxy' },
  { id: 'rose', slot: 'cape', name: 'Rose' },
  { id: 'gold', slot: 'cape', name: 'Gold' },
  { id: 'mono', slot: 'cape', name: 'Mono' },
  { id: 'aurora', slot: 'cape', name: 'Zorza', frames: 8 },
  { id: 'inferno', slot: 'cape', name: 'Inferno', frames: 8 },
  { id: 'waves', slot: 'cape', name: 'Fale', frames: 8 },
  { id: 'pulse', slot: 'cape', name: 'Puls', frames: 8 },
  { id: 'sakura', slot: 'cape', name: 'Sakura', since: 2 },
  { id: 'night', slot: 'cape', name: 'Noc', since: 2 },
  { id: 'rainbow', slot: 'cape', name: 'Tęcza', since: 2 },
  { id: 'ice', slot: 'cape', name: 'Lód', since: 2 },
  { id: 'toxic', slot: 'cape', name: 'Toksyczna', since: 2 },
  { id: 'checker', slot: 'cape', name: 'Szachownica', since: 2 },
  { id: 'matrix', slot: 'cape', name: 'Matrix', frames: 8, since: 2 },
  { id: 'storm', slot: 'cape', name: 'Burza', frames: 8, since: 2 },
  { id: 'staff_admin', slot: 'cape', name: 'Admin', rank: 'admin' },
  { id: 'staff_support', slot: 'cape', name: 'Support', rank: 'support' },
  { id: 'staff_partner', slot: 'cape', name: 'Partner', rank: 'partner' },
  // wings: drawn with the game's elytra model, folded and opened like it
  { id: 'angel', slot: 'wings', name: 'Anielskie' },
  { id: 'demon', slot: 'wings', name: 'Demona' },
  { id: 'butterfly', slot: 'wings', name: 'Motyle' },
  { id: 'dragon', slot: 'wings', name: 'Smocze' },
  { id: 'phoenix', slot: 'wings', name: 'Feniks', rank: 'partner' },
  { id: 'crystal', slot: 'wings', name: 'Kryształowe', rank: 'support' },
  { id: 'batwing', slot: 'wings', name: 'Nietoperza', since: 2 },
  { id: 'frost', slot: 'wings', name: 'Lodowe', since: 2 },
  { id: 'prism', slot: 'wings', name: 'Pryzmat', since: 2 },
  { id: 'shadow', slot: 'wings', name: 'Cienia', since: 2 },
  // elytras: worn instead of the cape's picture on a real elytra
  { id: 'feather', slot: 'elytra', name: 'Pióra' },
  { id: 'neon', slot: 'elytra', name: 'Neon' },
  { id: 'void', slot: 'elytra', name: 'Pustka' },
  { id: 'sunset', slot: 'elytra', name: 'Zachód słońca' },
  { id: 'nebula', slot: 'elytra', name: 'Mgławica', since: 2 },
  { id: 'venom', slot: 'elytra', name: 'Jad', since: 2 },
  { id: 'tide', slot: 'elytra', name: 'Przypływ', since: 2 },
  // trails (while moving) and auras (around a player standing still): the game's particles
  { id: 'hearts', slot: 'trail', name: 'Serca' },
  { id: 'sparks', slot: 'trail', name: 'Iskry' },
  { id: 'snow', slot: 'trail', name: 'Śnieg' },
  { id: 'notes', slot: 'trail', name: 'Nuty' },
  { id: 'flames', slot: 'trail', name: 'Płomienie' },
  { id: 'clouds', slot: 'trail', name: 'Chmurki', since: 2 },
  { id: 'stars', slot: 'trail', name: 'Fajerwerki', since: 2 },
  { id: 'bubbles', slot: 'trail', name: 'Bąbelki', since: 2 },
  { id: 'emerald', slot: 'trail', name: 'Szmaragdy', since: 2 },
  { id: 'soulfire', slot: 'trail', name: 'Błękitny ogień', since: 2 },
  { id: 'enchant', slot: 'aura', name: 'Runy' },
  { id: 'portal', slot: 'aura', name: 'Portal' },
  { id: 'cherry', slot: 'aura', name: 'Wiśnia' },
  { id: 'souls', slot: 'aura', name: 'Dusze' },
  { id: 'royal', slot: 'aura', name: 'Królewska', rank: 'admin' },
  { id: 'glow', slot: 'aura', name: 'Poświata', since: 2 },
  { id: 'magic', slot: 'aura', name: 'Magia', since: 2 },
  { id: 'amber', slot: 'aura', name: 'Bursztyn', since: 2 },
  { id: 'sculk', slot: 'aura', name: 'Sculk', since: 2 },
  // pets: a small copy of one of the game's mobs flying at the shoulder
  { id: 'allay', slot: 'pet', name: 'Allay' },
  { id: 'vex', slot: 'pet', name: 'Vex' },
  { id: 'bat', slot: 'pet', name: 'Nietoperz' },
  { id: 'parrot', slot: 'pet', name: 'Papuga' },
  { id: 'bee', slot: 'pet', name: 'Pszczoła' },
  { id: 'blaze', slot: 'pet', name: 'Blaze', since: 2 },
  { id: 'phantom', slot: 'pet', name: 'Fantom', since: 2 },
];

/**
 * Which items a client can draw: launchers from 0.9.1 on say so in X-SlashClient (also for the game
 * they start, through their bridge); the page shows everything; an older launcher knows the first set.
 */
export function knownTo(headers: Record<string, string | string[] | undefined>): (i: Item) => boolean {
  const named = typeof headers['x-slashclient'] === 'string';
  const browser = /Mozilla\//.test(String(headers['user-agent'] ?? ''));
  return (i) => !i.since || named || browser;
}

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const item = (id: string): Item | undefined => BY_ID.get(id);

/** The capes, by the old names the rest still uses. */
export const CAPES = ITEMS.filter((i) => i.slot === 'cape').map((i) => i.id);
export const CAPE_NAMES: Record<string, string> = Object.fromEntries(ITEMS.map((i) => [i.id, i.name]));
export const EMOTES = ['wave', 'heart', 'laugh', 'gg', 'like', 'angry', 'question', 'fire'];

/** What the admin set for an item; items never touched are on and for everyone. */
export function capeSetting(settings: Map<string, CosmeticSetting>, id: string): CosmeticSetting {
  return settings.get(id) ?? { id, enabled: true, exclusive: false };
}

/**
 * Whether a player may wear an item now: it exists (in `slot`, when given), is on, is not exclusive
 * to others, and is not for a rank the player does not have. `badge` is the player's rank colour.
 */
export function mayWear(settings: Map<string, CosmeticSetting>, granted: string[], id: string, slot: Slot = 'cape', badge = ''): boolean {
  const it = item(id);
  if (!it || it.slot !== slot) return false;
  const s = capeSetting(settings, id);
  if (!s.enabled || (s.exclusive && !granted.includes(id))) return false;
  return !it.rank || badge === 'admin' || badge === it.rank || granted.includes(id);
}

/** What a player wears in every slot ('' or missing = nothing). */
export type Loadout = Partial<Record<Slot, string>>;
