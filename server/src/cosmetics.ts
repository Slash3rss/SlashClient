import type { CosmeticSetting } from './db.ts';

/**
 * The SlashClient cosmetics. Their pictures live in the HUD mod (textures/cape, textures/elytra,
 * textures/wings, textures/clothing with the clothing's boxes in src/shared/clothing.ts; trails,
 * auras, kill effects and pets are drawn from the game's own particles and mobs) and on the website (web/vendor);
 * the server checks choices against these and the admin's settings.
 *
 * A player wears one item per slot. `rank` items are for that rank only (admins may wear all);
 * any item can also be made exclusive in the admin panel and granted to chosen players.
 */
export type Slot = 'cape' | 'wings' | 'elytra' | 'trail' | 'aura' | 'pet' | 'hat' | 'top' | 'kill' | 'spray';
export const SLOTS: Slot[] = ['cape', 'wings', 'elytra', 'trail', 'aura', 'pet', 'hat', 'top', 'kill', 'spray'];
export type Rank = 'admin' | 'support' | 'partner' | 'friend' | 'friend_pink';

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  /** Only for players with this rank (admins may wear every rank's items). */
  rank?: Rank;
  /** An animated cape: how many frames (textures/cape/<id>_<n>.png). */
  frames?: number;
  /**
   * The first launcher version with pictures for it (it came after the first launchers with
   * cosmetics, 0.9.0): older ones leave it out of their menu (see `knownTo`).
   */
  since?: string;
  /** When the cape's frames came later than the cape: older launchers get it still. */
  framesSince?: string;
  /** Only earned with this achievement (achievements.ts), which grants it; it cannot be picked otherwise. */
  achievement?: string;
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
  { id: 'sakura', slot: 'cape', name: 'Sakura', since: '0.9.1' },
  { id: 'night', slot: 'cape', name: 'Noc', since: '0.9.1' },
  { id: 'rainbow', slot: 'cape', name: 'Tęcza', since: '0.9.1' },
  { id: 'ice', slot: 'cape', name: 'Lód', since: '0.9.1' },
  { id: 'toxic', slot: 'cape', name: 'Toksyczna', since: '0.9.1' },
  { id: 'checker', slot: 'cape', name: 'Szachownica', since: '0.9.1' },
  { id: 'matrix', slot: 'cape', name: 'Matrix', frames: 8, since: '0.9.1' },
  { id: 'storm', slot: 'cape', name: 'Burza', frames: 8, since: '0.9.1' },
  { id: 'lava', slot: 'cape', name: 'Lawa', since: '0.9.2' },
  { id: 'desert', slot: 'cape', name: 'Pustynia', since: '0.9.2' },
  { id: 'cyber', slot: 'cape', name: 'Cyber', since: '0.9.2' },
  { id: 'honey', slot: 'cape', name: 'Miód', since: '0.9.2' },
  { id: 'mint', slot: 'cape', name: 'Mięta', since: '0.9.2' },
  { id: 'vortex', slot: 'cape', name: 'Wir', frames: 8, since: '0.9.2' },
  { id: 'starfall', slot: 'cape', name: 'Gwiezdny deszcz', frames: 8, since: '0.9.2' },
  // earned with achievements only
  { id: 'veteran', slot: 'cape', name: 'Weteran', since: '0.9.14', achievement: 'hours_100' },
  { id: 'streak30', slot: 'cape', name: 'Seria 30 dni', since: '0.9.14', achievement: 'streak_30' },
  { id: 'staff_admin', slot: 'cape', name: 'Admin', rank: 'admin', frames: 16, framesSince: '0.9.4' },
  { id: 'staff_support', slot: 'cape', name: 'Support', rank: 'support', frames: 16, framesSince: '0.9.4' },
  { id: 'staff_partner', slot: 'cape', name: 'Partner', rank: 'partner', frames: 16, framesSince: '0.9.4' },
  { id: 'staff_friend', slot: 'cape', name: 'Przyjaciel', rank: 'friend', since: '0.9.4', frames: 16 },
  { id: 'staff_friend_pink', slot: 'cape', name: 'Przyjaciel', rank: 'friend_pink', since: '0.9.12', frames: 16 },
  // wings: drawn with the game's elytra model, folded and opened like it
  { id: 'angel', slot: 'wings', name: 'Anielskie' },
  { id: 'demon', slot: 'wings', name: 'Demona' },
  { id: 'butterfly', slot: 'wings', name: 'Motyle' },
  { id: 'dragon', slot: 'wings', name: 'Smocze' },
  { id: 'phoenix', slot: 'wings', name: 'Feniks', rank: 'partner' },
  { id: 'crystal', slot: 'wings', name: 'Kryształowe', rank: 'support' },
  { id: 'batwing', slot: 'wings', name: 'Nietoperza', since: '0.9.1' },
  { id: 'frost', slot: 'wings', name: 'Lodowe', since: '0.9.1' },
  { id: 'prism', slot: 'wings', name: 'Pryzmat', since: '0.9.1' },
  { id: 'shadow', slot: 'wings', name: 'Cienia', since: '0.9.1' },
  { id: 'fairy', slot: 'wings', name: 'Wróżki', since: '0.9.2' },
  { id: 'bone', slot: 'wings', name: 'Kościane', since: '0.9.2' },
  { id: 'gilded', slot: 'wings', name: 'Złote', since: '0.9.2' },
  // elytras: worn instead of the cape's picture on a real elytra
  { id: 'feather', slot: 'elytra', name: 'Pióra' },
  { id: 'neon', slot: 'elytra', name: 'Neon' },
  { id: 'void', slot: 'elytra', name: 'Pustka' },
  { id: 'sunset', slot: 'elytra', name: 'Zachód słońca' },
  { id: 'nebula', slot: 'elytra', name: 'Mgławica', since: '0.9.1' },
  { id: 'venom', slot: 'elytra', name: 'Jad', since: '0.9.1' },
  { id: 'tide', slot: 'elytra', name: 'Przypływ', since: '0.9.1' },
  { id: 'magma', slot: 'elytra', name: 'Magma', since: '0.9.2' },
  { id: 'circuit', slot: 'elytra', name: 'Obwód', since: '0.9.2' },
  { id: 'autumn', slot: 'elytra', name: 'Jesień', since: '0.9.2' },
  // trails (while moving) and auras (around a player standing still): the game's particles
  { id: 'hearts', slot: 'trail', name: 'Serca' },
  { id: 'sparks', slot: 'trail', name: 'Iskry' },
  { id: 'snow', slot: 'trail', name: 'Śnieg' },
  { id: 'notes', slot: 'trail', name: 'Nuty' },
  { id: 'flames', slot: 'trail', name: 'Płomienie' },
  { id: 'clouds', slot: 'trail', name: 'Chmurki', since: '0.9.1' },
  { id: 'stars', slot: 'trail', name: 'Fajerwerki', since: '0.9.1' },
  { id: 'bubbles', slot: 'trail', name: 'Bąbelki', since: '0.9.1' },
  { id: 'emerald', slot: 'trail', name: 'Szmaragdy', since: '0.9.1' },
  { id: 'soulfire', slot: 'trail', name: 'Błękitny ogień', since: '0.9.1' },
  { id: 'crits', slot: 'trail', name: 'Krytyki', since: '0.9.2' },
  { id: 'witch', slot: 'trail', name: 'Czary', since: '0.9.2' },
  { id: 'ink', slot: 'trail', name: 'Atrament', since: '0.9.2' },
  { id: 'ash', slot: 'trail', name: 'Popiół', since: '0.9.2' },
  { id: 'enchant', slot: 'aura', name: 'Runy' },
  { id: 'portal', slot: 'aura', name: 'Portal' },
  { id: 'cherry', slot: 'aura', name: 'Wiśnia' },
  { id: 'souls', slot: 'aura', name: 'Dusze' },
  { id: 'royal', slot: 'aura', name: 'Królewska', rank: 'admin' },
  { id: 'glow', slot: 'aura', name: 'Poświata', since: '0.9.1' },
  { id: 'magic', slot: 'aura', name: 'Magia', since: '0.9.1' },
  { id: 'amber', slot: 'aura', name: 'Bursztyn', since: '0.9.1' },
  { id: 'sculk', slot: 'aura', name: 'Sculk', since: '0.9.1' },
  { id: 'spores', slot: 'aura', name: 'Zarodniki', since: '0.9.2' },
  { id: 'nautilus', slot: 'aura', name: 'Głębiny', since: '0.9.2' },
  { id: 'tears', slot: 'aura', name: 'Łzy', since: '0.9.2' },
  { id: 'fireflies', slot: 'aura', name: 'Świetliki', since: '0.9.2' },
  // pets: a small copy of one of the game's mobs flying at the shoulder
  { id: 'allay', slot: 'pet', name: 'Allay' },
  { id: 'vex', slot: 'pet', name: 'Vex' },
  { id: 'bat', slot: 'pet', name: 'Nietoperz' },
  { id: 'parrot', slot: 'pet', name: 'Papuga' },
  { id: 'bee', slot: 'pet', name: 'Pszczoła' },
  { id: 'blaze', slot: 'pet', name: 'Blaze', since: '0.9.1' },
  { id: 'phantom', slot: 'pet', name: 'Fantom', since: '0.9.1' },
  { id: 'axolotl', slot: 'pet', name: 'Aksolotl', since: '0.9.2' },
  { id: 'frog', slot: 'pet', name: 'Żaba', since: '0.9.2' },
  { id: 'fox', slot: 'pet', name: 'Lis', since: '0.9.2' },
  // ours, made from a Blockbench model (scripts/make-model-pet.mjs)
  { id: 'duszek_haze', slot: 'pet', name: 'Duszek Haze', since: '0.9.12' },
  // clothing: hats on the head and tops over the body (and arms), made of boxes over the skin
  { id: 'tophat', slot: 'hat', name: 'Cylinder', since: '0.9.11' },
  { id: 'crown', slot: 'hat', name: 'Korona', since: '0.9.11' },
  { id: 'cap', slot: 'hat', name: 'Czapka z daszkiem', since: '0.9.11' },
  { id: 'headphones', slot: 'hat', name: 'Słuchawki', since: '0.9.11' },
  { id: 'beanie', slot: 'hat', name: 'Czapka zimowa', since: '0.9.11' },
  { id: 'wizard', slot: 'hat', name: 'Kapelusz czarodzieja', since: '0.9.11' },
  { id: 'halo', slot: 'hat', name: 'Aureola', since: '0.9.11' },
  { id: 'scarf', slot: 'top', name: 'Szalik', since: '0.9.11' },
  { id: 'bowtie', slot: 'top', name: 'Muszka', since: '0.9.11' },
  { id: 'tie', slot: 'top', name: 'Krawat', since: '0.9.11' },
  { id: 'medal', slot: 'top', name: 'Medal', since: '0.9.11' },
  { id: 'jacket', slot: 'top', name: 'Kurtka', since: '0.9.11' },
  // kill effects: a short burst of particles where a mob or player the wearer killed falls (seen only by SlashClient players)
  { id: 'lightning', slot: 'kill', name: 'Piorun', since: '0.9.14' },
  { id: 'blood', slot: 'kill', name: 'Krew', since: '0.9.14' },
  { id: 'heartburst', slot: 'kill', name: 'Wybuch serc', since: '0.9.14' },
  { id: 'firework', slot: 'kill', name: 'Fajerwerk', since: '0.9.14' },
  { id: 'soulrise', slot: 'kill', name: 'Ulatujące dusze', since: '0.9.14' },
  { id: 'enderpoof', slot: 'kill', name: 'Teleport Endu', since: '0.9.14' },
  { id: 'confetti', slot: 'kill', name: 'Konfetti', since: '0.9.14' },
  { id: 'blast', slot: 'kill', name: 'Wybuch', since: '0.9.14' },
  { id: 'shatter', slot: 'kill', name: 'Lodowy rozprysk', since: '0.9.14' },
  { id: 'coins', slot: 'kill', name: 'Złote monety', since: '0.9.14' },
  { id: 'ghost', slot: 'kill', name: 'Duch', since: '0.9.14' },
  { id: 'flamering', slot: 'kill', name: 'Krąg ognia', since: '0.9.14' },
  // sprays: a picture the player sprays on a block with a key, seen for a minute by SlashClient players there (sprays.ts)
  { id: 'spray_logo', slot: 'spray', name: 'SlashClient', since: '0.9.20' },
  { id: 'spray_gg', slot: 'spray', name: 'GG', since: '0.9.20' },
  { id: 'spray_heart', slot: 'spray', name: 'Serce', since: '0.9.20' },
  { id: 'spray_skull', slot: 'spray', name: 'Czaszka', since: '0.9.20' },
  { id: 'spray_lol', slot: 'spray', name: 'Śmiech', since: '0.9.20' },
  { id: 'spray_crown', slot: 'spray', name: 'Korona', since: '0.9.20' },
  { id: 'spray_emblem', slot: 'spray', name: 'Emblemat', since: '0.9.20' },
  { id: 'spray_pumpkin', slot: 'spray', name: 'Dynia', since: '0.9.20' },
];

/** Compares two versions like 0.9.1 number by number: below 0, 0 or above 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Which items a client can draw: launchers from 0.9.1 on name their version in X-SlashClient
 * (launcher/<version>, also for the game they start, through their bridge) and get the items up
 * to it; the page shows everything; without the header it is a launcher from before (0.9.0).
 */
export function knownTo(headers: Record<string, string | string[] | undefined>): (i: Item) => boolean {
  const has = hasVersion(headers);
  return (i) => !i.since || has(i.since);
}

/** How many frames of a cape the asking launcher can show (none: the still picture). */
export function framesFor(headers: Record<string, string | string[] | undefined>): (i: Item) => number | undefined {
  const has = hasVersion(headers);
  return (i) => (i.frames && (!i.framesSince || has(i.framesSince)) ? i.frames : undefined);
}

/** Whether the asking launcher or mod is at least `version` (the website always is, it comes with the server). */
function hasVersion(headers: Record<string, string | string[] | undefined>): (version: string) => boolean {
  const named = /^(?:launcher|mod)\/([\w.+-]{1,32})$/.exec(String(headers['x-slashclient'] ?? ''));
  const browser = /Mozilla\//.test(String(headers['user-agent'] ?? ''));
  const mine = named ? named[1] : '0.9.0';
  return (version) => (!named && browser) || compareVersions(mine, version) >= 0;
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
 * Admins may wear everything, also what is switched off or exclusive.
 */
export function mayWear(settings: Map<string, CosmeticSetting>, granted: string[], id: string, slot: Slot = 'cape', badge = ''): boolean {
  const it = item(id);
  if (!it || it.slot !== slot) return false;
  if (badge === 'admin') return true;
  if (it.achievement && !granted.includes(id)) return false;
  const s = capeSetting(settings, id);
  if (!s.enabled || (s.exclusive && !granted.includes(id))) return false;
  return !it.rank || badge === 'admin' || badge === it.rank || granted.includes(id);
}

/** What a player wears in every slot ('' or missing = nothing). */
export type Loadout = Partial<Record<Slot, string>>;
