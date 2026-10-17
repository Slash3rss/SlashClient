/**
 * The game's pictures for the cosmetics in the launcher and on the website: spawn eggs for the pets, particles for
 * trails and auras (taken from a downloaded game jar, like the blocks). Each path is under
 * assets/minecraft/textures/, without .png; missing ones (older games) are left out.
 */
export const COSMETIC_TEXTURES = [
  ...['allay', 'vex', 'bat', 'parrot', 'bee', 'blaze', 'phantom'].map((m) => `item/${m}_spawn_egg`),
  // the pets' own pictures, for their models in the preview (the bat's moved into a folder in 26.1)
  'entity/allay/allay', 'entity/illager/vex', 'entity/bat/bat', 'entity/bat', 'entity/parrot/parrot_red_blue', 'entity/bee/bee',
  'entity/blaze/blaze', 'entity/blaze', 'entity/phantom/phantom', 'entity/phantom',
  'particle/heart', 'particle/glow', 'particle/note', 'particle/flame',
  ...Array.from({ length: 8 }, (_, i) => `particle/generic_${i}`),
  ...'abcdefghijklmnop'.split('').map((c) => `particle/sga_${c}`),
  ...Array.from({ length: 12 }, (_, i) => `particle/cherry_${i}`),
  ...Array.from({ length: 11 }, (_, i) => `particle/soul_${i}`),
  ...Array.from({ length: 8 }, (_, i) => `particle/glitter_${i}`),
  ...Array.from({ length: 8 }, (_, i) => `particle/spark_${i}`),
  ...Array.from({ length: 10 }, (_, i) => `particle/sculk_soul_${i}`),
  'particle/bubble', 'particle/glint', 'particle/soul_fire_flame', 'particle/enchanted_hit',
];
