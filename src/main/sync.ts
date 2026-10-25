import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './paths';

/**
 * Game settings shared by every profile that has sync turned on:
 * options (video, sound, controls), the multiplayer server list and saved hotbars.
 */
export const SYNCED_FILES = ['options.txt', 'servers.dat', 'hotbar.nbt'];

const sharedDir = () => path.join(paths.root, 'shared');

async function copyIfExists(from: string, to: string): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
    return true;
  } catch {
    return false;
  }
}

/**
 * options.txt line by line: `top` wins where both have a setting, and what only `base` has stays.
 * The game writes only the keys it knows at that moment (the mods and the version it runs), so a
 * profile without a mod would otherwise wipe that mod's key bindings for every profile.
 */
export function mergeOptions(base: string, top: string): string {
  const lines = (text: string) => text.split(/\r?\n/).filter((l) => l.includes(':'));
  const keyOf = (l: string) => l.slice(0, l.indexOf(':'));
  const topKeys = new Set(lines(top).map(keyOf));
  const kept = lines(base).filter((l) => !topKeys.has(keyOf(l)));
  return [...lines(top), ...kept].join('\n') + '\n';
}

/** Copies a synced file; options.txt is merged into what is there instead of replacing it. */
async function sync(file: string, from: string, to: string): Promise<boolean> {
  if (file !== 'options.txt') return copyIfExists(from, to);
  try {
    const top = await fs.readFile(from, 'utf8');
    const base = await fs.readFile(to, 'utf8').catch(() => '');
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.writeFile(to, mergeOptions(base, top));
    return true;
  } catch {
    return false;
  }
}

/** Before launch: give the profile the shared settings (if there are any yet). */
export async function pullShared(gameDir: string): Promise<string[]> {
  const copied: string[] = [];
  for (const f of SYNCED_FILES) if (await sync(f, path.join(sharedDir(), f), path.join(gameDir, f))) copied.push(f);
  return copied;
}

/** After the game closes: what the player changed becomes the shared settings for all profiles. */
export async function pushShared(gameDir: string): Promise<void> {
  for (const f of SYNCED_FILES) await sync(f, path.join(gameDir, f), path.join(sharedDir(), f));
}
