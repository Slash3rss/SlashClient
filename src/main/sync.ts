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

/** Before launch: give the profile the shared settings (if there are any yet). */
export async function pullShared(gameDir: string): Promise<string[]> {
  const copied: string[] = [];
  for (const f of SYNCED_FILES) if (await copyIfExists(path.join(sharedDir(), f), path.join(gameDir, f))) copied.push(f);
  return copied;
}

/** After the game closes: what the player changed becomes the shared settings for all profiles. */
export async function pushShared(gameDir: string): Promise<void> {
  for (const f of SYNCED_FILES) await copyIfExists(path.join(gameDir, f), path.join(sharedDir(), f));
}
