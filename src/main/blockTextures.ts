import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './paths';

/**
 * Real block textures for the profile icons, taken from a game jar the launcher has already
 * downloaded for the player (Mojang's art is not shipped with SlashClient). The page draws
 * the 3D icons from them.
 */

/** Icon name → the textures of its top and sides (file names in assets/minecraft/textures/block/). */
export const BLOCK_FACES: Record<string, { top: string; side: string; front?: string; tint?: 'grass' }> = {
  grass: { top: 'grass_block_top', side: 'grass_block_side', tint: 'grass' },
  dirt: { top: 'dirt', side: 'dirt' },
  stone: { top: 'stone', side: 'stone' },
  cobblestone: { top: 'cobblestone', side: 'cobblestone' },
  sand: { top: 'sand', side: 'sand' },
  planks: { top: 'oak_planks', side: 'oak_planks' },
  log: { top: 'oak_log_top', side: 'oak_log' },
  'crafting-table': { top: 'crafting_table_top', side: 'crafting_table_side', front: 'crafting_table_front' },
  bookshelf: { top: 'oak_planks', side: 'bookshelf' },
  tnt: { top: 'tnt_top', side: 'tnt_side' },
  'diamond-ore': { top: 'diamond_ore', side: 'diamond_ore' },
  obsidian: { top: 'obsidian', side: 'obsidian' },
  netherrack: { top: 'netherrack', side: 'netherrack' },
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Downloaded game jars, newest folder first (any version has these blocks). */
async function clientJars(versionsDir: string): Promise<string[]> {
  const dirs = await fs.readdir(versionsDir, { withFileTypes: true }).catch(() => []);
  const jars: { file: string; at: number }[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const file = path.join(versionsDir, d.name, `${d.name}.jar`);
    const stat = await fs.stat(file).catch(() => undefined);
    // loader profiles have tiny or no jars; a real client is many MB
    if (stat && stat.size > 5_000_000) jars.push({ file, at: stat.mtimeMs });
  }
  return jars.sort((a, b) => b.at - a.at).map((j) => j.file);
}

let cached: Record<string, string> | null | undefined;

/** texture name → data:image/png URL; null when no game has been downloaded yet. */
export async function blockTextures(versionsDir = paths.versions): Promise<Record<string, string> | null> {
  if (cached !== undefined) return cached;
  const wanted = new Set(Object.values(BLOCK_FACES).flatMap((f) => [f.top, f.side, f.front].filter((x): x is string => !!x)));
  for (const jar of await clientJars(versionsDir)) {
    try {
      const zip = new AdmZip(jar);
      const out: Record<string, string> = {};
      for (const name of wanted) {
        const data = zip.getEntry(`assets/minecraft/textures/block/${name}.png`)?.getData();
        if (data?.subarray(0, 4).equals(PNG)) out[name] = `data:image/png;base64,${data.toString('base64')}`;
      }
      if (Object.keys(out).length === wanted.size) return (cached = out);
    } catch {
      // a broken jar: try the next one
    }
  }
  // not cached: the next call (after a game is downloaded) looks again
  return null;
}

/**
 * The game's pictures for the cosmetics in the launcher: spawn eggs for the pets, particles for
 * trails and auras (taken from a downloaded game jar, like the blocks). Each path is under
 * assets/minecraft/textures/, without .png; missing ones (older games) are left out.
 */
export const COSMETIC_TEXTURES = [
  ...['allay', 'vex', 'bat', 'parrot', 'bee'].map((m) => `item/${m}_spawn_egg`),
  // the pets' own pictures, for their models in the preview (the bat's moved into a folder in 26.1)
  'entity/allay/allay', 'entity/illager/vex', 'entity/bat/bat', 'entity/bat', 'entity/parrot/parrot_red_blue', 'entity/bee/bee',
  'particle/heart', 'particle/glow', 'particle/note', 'particle/flame',
  ...Array.from({ length: 8 }, (_, i) => `particle/generic_${i}`),
  ...'abcdefghijklmnop'.split('').map((c) => `particle/sga_${c}`),
  ...Array.from({ length: 12 }, (_, i) => `particle/cherry_${i}`),
  ...Array.from({ length: 11 }, (_, i) => `particle/soul_${i}`),
  ...Array.from({ length: 8 }, (_, i) => `particle/glitter_${i}`),
];

let cosmeticCache: Record<string, string> | null | undefined;

/** path → data:image/png URL; null when no game has been downloaded yet. */
export async function cosmeticTextures(versionsDir = paths.versions): Promise<Record<string, string> | null> {
  if (cosmeticCache !== undefined) return cosmeticCache;
  for (const jar of await clientJars(versionsDir)) {
    try {
      const zip = new AdmZip(jar);
      const out: Record<string, string> = {};
      for (const name of COSMETIC_TEXTURES) {
        const data = zip.getEntry(`assets/minecraft/textures/${name}.png`)?.getData();
        if (data?.subarray(0, 4).equals(PNG)) out[name] = `data:image/png;base64,${data.toString('base64')}`;
      }
      // a game with the pets' own spawn eggs (1.21.5 and newer); older ones only have plain eggs
      if (out['item/allay_spawn_egg'] && out['particle/heart']) return (cosmeticCache = out);
    } catch {
      // a broken jar: try the next one
    }
  }
  return null;
}
