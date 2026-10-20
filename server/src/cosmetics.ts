import type { CosmeticSetting } from './db.ts';

/**
 * The SlashClient cosmetics. Their pictures live in the HUD mod (textures/cape, textures/elytra,
 * textures/wings, textures/clothing with the clothing's, shoes', hand, face and ears items' boxes in src/shared/clothing.ts, textures/suit with the
 * suits' in src/shared/suits.ts, textures/item/held, textures/gear with the back items' and tails' in src/shared/gear.ts,
 * textures/ring, textures/spray, textures/prop with the props' boxes in src/shared/props.ts; trails,
 * auras, kill effects, movement effects and pets are drawn from the game's own particles and mobs) and on the website (web/vendor);
 * the server checks choices against these and the admin's settings.
 *
 * A player wears one item per slot. `rank` items are for that rank only (admins may wear all);
 * any item can also be made exclusive in the admin panel and granted to chosen players.
 */
export type Slot = 'cape' | 'wings' | 'elytra' | 'trail' | 'aura' | 'pet' | 'hat' | 'top' | 'kill' | 'suit' | 'shield' | 'weapon' | 'shoes' | 'hands' | 'face' | 'ears' | 'back' | 'tail' | 'ring' | 'move' | 'spray' | 'prop';
export const SLOTS: Slot[] = ['cape', 'wings', 'elytra', 'trail', 'aura', 'pet', 'hat', 'top', 'kill', 'suit', 'shield', 'weapon', 'shoes', 'hands', 'face', 'ears', 'back', 'tail', 'ring', 'move', 'spray', 'prop'];
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
  /**
   * Sold in the shop for this many sparks (economy.ts; the admin may change the price there): a
   * purchase grants it, like an achievement does. Free items never get a price.
   */
  price?: number;
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
  // bought in the shop with sparks earned from achievements
  { id: 'emberstar', slot: 'cape', name: 'Iskra', since: '0.9.22', price: 600 },
  { id: 'obsidian', slot: 'cape', name: 'Obsydian', since: '0.9.22', price: 500 },
  { id: 'coral', slot: 'cape', name: 'Rafa koralowa', since: '0.9.22', price: 500 },
  { id: 'thunder', slot: 'cape', name: 'Grom', since: '0.9.22', price: 700 },
  { id: 'regal', slot: 'cape', name: 'Purpura', since: '0.9.22', price: 800 },
  { id: 'cosmos', slot: 'cape', name: 'Kosmos', since: '0.9.22', price: 1000 },
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
  { id: 'emberwings', slot: 'wings', name: 'Iskrzące', since: '0.9.22', price: 1200 },
  { id: 'sapphire', slot: 'wings', name: 'Szafirowe', since: '0.9.22', price: 1000 },
  { id: 'obsidianwings', slot: 'wings', name: 'Obsydianowe', since: '0.9.22', price: 1000 },
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
  { id: 'aurum', slot: 'elytra', name: 'Złoty blask', since: '0.9.22', price: 800 },
  { id: 'glacier', slot: 'elytra', name: 'Lodowiec', since: '0.9.22', price: 700 },
  { id: 'acid', slot: 'elytra', name: 'Kwas', since: '0.9.22', price: 700 },
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
  // suits: full-body costumes over the skin (they hide the hat and the top; real armour hides their parts)
  { id: 'astronaut', slot: 'suit', name: 'Astronauta', since: '0.9.20' },
  { id: 'samurai', slot: 'suit', name: 'Zbroja samuraja', since: '0.9.20' },
  { id: 'pandasuit', slot: 'suit', name: 'Panda', since: '0.9.20' },
  { id: 'dinosuit', slot: 'suit', name: 'Dinozaur', since: '0.9.20' },
  { id: 'knight', slot: 'suit', name: 'Rycerz', since: '0.9.20' },
  { id: 'ghostsheet', slot: 'suit', name: 'Duch z prześcieradła', since: '0.9.20' },
  { id: 'mech', slot: 'suit', name: 'Mech', since: '0.9.20' },
  { id: 'pirate', slot: 'suit', name: 'Pirat', since: '0.9.20' },
  // held item skins (textures/item/held, scripts/make-held.mjs): the look of a held shield, and of every
  // sword (sword_…) or the bow (bow_…); only in the hand, and other players see them only if they switch it on
  { id: 'shield_dragon', slot: 'shield', name: 'Smocza', since: '0.9.20' },
  { id: 'shield_demon', slot: 'shield', name: 'Demoniczna', since: '0.9.20' },
  { id: 'shield_cardboard', slot: 'shield', name: 'Kartonowa', since: '0.9.20' },
  { id: 'shield_golden', slot: 'shield', name: 'Złota', since: '0.9.20' },
  { id: 'shield_ice', slot: 'shield', name: 'Lodowa', since: '0.9.20' },
  { id: 'shield_slash', slot: 'shield', name: 'SlashClient', since: '0.9.20' },
  { id: 'shield_heart', slot: 'shield', name: 'Pikselowe serce', since: '0.9.20' },
  { id: 'sword_beam', slot: 'weapon', name: 'Miecz świetlny', since: '0.9.20' },
  { id: 'sword_katana', slot: 'weapon', name: 'Katana', since: '0.9.20' },
  { id: 'sword_flame', slot: 'weapon', name: 'Płonący miecz', since: '0.9.20' },
  { id: 'sword_ice', slot: 'weapon', name: 'Lodowy miecz', since: '0.9.20' },
  { id: 'bow_dragon', slot: 'weapon', name: 'Smoczy łuk', since: '0.9.20' },
  { id: 'bow_crystal', slot: 'weapon', name: 'Kryształowy łuk', since: '0.9.20' },
  // shoes on both feet (hidden under real boots) and things on the hands, boxes over the skin like the clothing
  { id: 'sneakers_red', slot: 'shoes', name: 'Trampki czerwone', since: '0.9.20' },
  { id: 'sneakers_blue', slot: 'shoes', name: 'Trampki niebieskie', since: '0.9.20' },
  { id: 'hikingboots', slot: 'shoes', name: 'Traperki', since: '0.9.20' },
  { id: 'slippers', slot: 'shoes', name: 'Kapcie', since: '0.9.20' },
  { id: 'bunnyslippers', slot: 'shoes', name: 'Kapcie króliczki', since: '0.9.20' },
  { id: 'rocketboots', slot: 'shoes', name: 'Buty rakietowe', since: '0.9.20' },
  { id: 'rollerskates', slot: 'shoes', name: 'Wrotki', since: '0.9.20' },
  { id: 'flippers', slot: 'shoes', name: 'Płetwy', since: '0.9.20' },
  { id: 'boxinggloves', slot: 'hands', name: 'Rękawice bokserskie', since: '0.9.20' },
  { id: 'wristwatch', slot: 'hands', name: 'Zegarek', since: '0.9.20' },
  { id: 'bracelet', slot: 'hands', name: 'Bransoletka', since: '0.9.20' },
  { id: 'spikedgauntlets', slot: 'hands', name: 'Kolczaste rękawice', since: '0.9.20' },
  { id: 'mittens', slot: 'hands', name: 'Rękawiczki zimowe', since: '0.9.20' },
  { id: 'goldring', slot: 'hands', name: 'Złoty pierścień', since: '0.9.20' },
  { id: 'smartband', slot: 'hands', name: 'Opaska sportowa', since: '0.9.20' },
  // on the face (glasses stay on under a helmet, masks hide) and on top of the head (ears twitch): boxes like the clothing's
  { id: 'sunglasses', slot: 'face', name: 'Okulary przeciwsłoneczne', since: '0.9.20' },
  { id: 'aviators', slot: 'face', name: 'Pilotki', since: '0.9.20' },
  { id: 'glasses3d', slot: 'face', name: 'Okulary 3D', since: '0.9.20' },
  { id: 'monocle', slot: 'face', name: 'Monokl', since: '0.9.20' },
  { id: 'mustache', slot: 'face', name: 'Wąsy', since: '0.9.20' },
  { id: 'gasmask', slot: 'face', name: 'Maska gazowa', since: '0.9.20' },
  { id: 'kitsune', slot: 'face', name: 'Maska kitsune', since: '0.9.20' },
  { id: 'oni', slot: 'face', name: 'Maska oni', since: '0.9.20' },
  { id: 'skigoggles', slot: 'face', name: 'Gogle narciarskie', since: '0.9.20' },
  { id: 'catears', slot: 'ears', name: 'Kocie uszy', since: '0.9.20' },
  { id: 'foxears', slot: 'ears', name: 'Lisie uszy', since: '0.9.20' },
  { id: 'bunnyears', slot: 'ears', name: 'Królicze uszy', since: '0.9.20' },
  { id: 'elfears', slot: 'ears', name: 'Uszy elfa', since: '0.9.20' },
  { id: 'devilhorns', slot: 'ears', name: 'Rogi diabła', since: '0.9.20' },
  { id: 'ramhorns', slot: 'ears', name: 'Rogi barana', since: '0.9.20' },
  { id: 'antlers', slot: 'ears', name: 'Poroże', since: '0.9.20' },
  { id: 'unicorn', slot: 'ears', name: 'Róg jednorożca', since: '0.9.20' },
  // on the back (in the cape's and the wings' place) and tails, boxes like the clothing (src/shared/gear.ts)
  { id: 'backpack', slot: 'back', name: 'Plecak', since: '0.9.20' },
  { id: 'quiver', slot: 'back', name: 'Kołczan', since: '0.9.20' },
  { id: 'katana', slot: 'back', name: 'Katana', since: '0.9.20' },
  { id: 'guitar', slot: 'back', name: 'Gitara', since: '0.9.20' },
  { id: 'jetpack', slot: 'back', name: 'Plecak odrzutowy', since: '0.9.20' },
  { id: 'angelpack', slot: 'back', name: 'Anielskie piórka', since: '0.9.20' },
  { id: 'minichest', slot: 'back', name: 'Mała skrzynia', since: '0.9.20' },
  { id: 'backshield', slot: 'back', name: 'Tarcza', since: '0.9.20' },
  { id: 'cattail', slot: 'tail', name: 'Koci ogon', since: '0.9.20' },
  { id: 'foxtail', slot: 'tail', name: 'Lisi ogon', since: '0.9.20' },
  { id: 'kitsunetail', slot: 'tail', name: 'Kitsune', since: '0.9.20' },
  { id: 'deviltail', slot: 'tail', name: 'Diabelski ogon', since: '0.9.20' },
  { id: 'dragontail', slot: 'tail', name: 'Smoczy ogon', since: '0.9.20' },
  { id: 'wolftail', slot: 'tail', name: 'Wilczy ogon', since: '0.9.20' },
  { id: 'squirreltail', slot: 'tail', name: 'Wiewiórczy ogon', since: '0.9.20' },
  // rings: a flat, slowly turning picture on the ground under the feet (textures/ring, some animated)
  { id: 'ring_runes', slot: 'ring', name: 'Krąg run', since: '0.9.20' },
  { id: 'ring_flame', slot: 'ring', name: 'Ognisty krąg', since: '0.9.20' },
  { id: 'ring_frost', slot: 'ring', name: 'Mroźny krąg', since: '0.9.20' },
  { id: 'ring_rainbow', slot: 'ring', name: 'Tęczowy krąg', since: '0.9.20' },
  { id: 'ring_mushroom', slot: 'ring', name: 'Grzybowy krąg', since: '0.9.20' },
  { id: 'ring_galaxy', slot: 'ring', name: 'Galaktyka', since: '0.9.20' },
  { id: 'ring_halo', slot: 'ring', name: 'Korona światła', since: '0.9.20' },
  { id: 'ring_toxic', slot: 'ring', name: 'Toksyczny krąg', since: '0.9.20' },
  { id: 'ring_sparks', slot: 'ring', name: 'Krąg iskier', since: '0.9.22', price: 900 },
  { id: 'ring_ocean', slot: 'ring', name: 'Krąg fal', since: '0.9.22', price: 700 },
  // movement effects: the game's particles when the wearer walks, jumps, lands, sprints, swims or shoots (seen only by SlashClient players)
  { id: 'move_steps', slot: 'move', name: 'Ślady stóp', since: '0.9.20' },
  { id: 'move_jump', slot: 'move', name: 'Obłoczek przy skoku', since: '0.9.20' },
  { id: 'move_landing', slot: 'move', name: 'Fala lądowania', since: '0.9.20' },
  { id: 'move_arrows', slot: 'move', name: 'Smuga pocisków', since: '0.9.20' },
  { id: 'move_sprint', slot: 'move', name: 'Iskry sprintu', since: '0.9.20' },
  { id: 'move_bubbles', slot: 'move', name: 'Wybuch bąbelków', since: '0.9.20' },
  { id: 'move_petals', slot: 'move', name: 'Płatki', since: '0.9.20' },
  // sprays: a picture the player sprays on a block with a key, seen for a minute by SlashClient players there (sprays.ts)
  { id: 'spray_logo', slot: 'spray', name: 'SlashClient', since: '0.9.20' },
  { id: 'spray_gg', slot: 'spray', name: 'GG', since: '0.9.20' },
  { id: 'spray_heart', slot: 'spray', name: 'Serce', since: '0.9.20' },
  { id: 'spray_skull', slot: 'spray', name: 'Czaszka', since: '0.9.20' },
  { id: 'spray_lol', slot: 'spray', name: 'Śmiech', since: '0.9.20' },
  { id: 'spray_crown', slot: 'spray', name: 'Korona', since: '0.9.20' },
  { id: 'spray_emblem', slot: 'spray', name: 'Emblemat', since: '0.9.20' },
  { id: 'spray_pumpkin', slot: 'spray', name: 'Dynia', since: '0.9.20' },
  { id: 'spray_spark', slot: 'spray', name: 'Iskra', since: '0.9.22', price: 200 },
  { id: 'spray_trophy', slot: 'spray', name: 'Puchar', since: '0.9.22', price: 300 },
  // props: something the player pushes in front of them with both hands (src/shared/props.ts), hidden while the hands are busy
  { id: 'wheelbarrow', slot: 'prop', name: 'Taczka', since: '0.9.20' },
  { id: 'wheelbarrow_gold', slot: 'prop', name: 'Taczka złota', since: '0.9.20' },
  { id: 'wheelbarrow_flowers', slot: 'prop', name: 'Taczka z kwiatami', since: '0.9.20' },
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

/** Whether the shop may sell an item at all: not a rank's, not one only an achievement of cosmetics.ts gives. */
export const sellable = (it: Item) => !it.rank && !it.achievement;

/**
 * What an item costs in the shop now: the admin's price (economy.ts; null there = taken off sale),
 * else the one above; undefined = not sold.
 */
export function priceOf(settings: Map<string, CosmeticSetting>, id: string): number | undefined {
  const it = item(id);
  if (!it || !sellable(it)) return undefined;
  const set = settings.get(id)?.price;
  return set === undefined ? it.price : set ?? undefined;
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
  // earned (an achievement) or bought (the shop): only with the grant
  if ((it.achievement || priceOf(settings, id)) && !granted.includes(id)) return false;
  const s = capeSetting(settings, id);
  if (!s.enabled || (s.exclusive && !granted.includes(id))) return false;
  return !it.rank || badge === 'admin' || badge === it.rank || granted.includes(id);
}

/** What a player wears in every slot ('' or missing = nothing). */
export type Loadout = Partial<Record<Slot, string>>;
