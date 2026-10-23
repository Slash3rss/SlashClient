import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Every icon a profile ever got (uploaded, from a modpack), kept once by its content so any
 * profile can pick it again. The files stay as the profile icons were stored (PNG 128 px, or
 * WebP/GIF as they came); the newest used comes first.
 */
export interface LibraryIcon { id: string; file: string }

const ID = /^[0-9a-f]{16}\.(png|webp|gif)$/;
/** Written once the profiles' icons from before the library were put into it. */
const SEEDED = '.seeded';

export const iconId = (data: Buffer, ext: string) => `${createHash('sha1').update(data).digest('hex').slice(0, 16)}.${ext}`;

/** Puts an icon into the library (or marks it as just used, when it is there already). */
export async function addToLibrary(dir: string, data: Buffer, ext: string): Promise<string> {
  const id = iconId(data, ext);
  const file = path.join(dir, id);
  await fs.mkdir(dir, { recursive: true });
  if (existsSync(file)) {
    const now = new Date();
    await fs.utimes(file, now, now);
  } else {
    await fs.writeFile(file, data);
  }
  return id;
}

/** The library's icons, newest used first. The first time, the given profiles' icons are added to it. */
export async function libraryIcons(dir: string, existing: string[] = []): Promise<LibraryIcon[]> {
  if (!existsSync(path.join(dir, SEEDED))) {
    for (const file of existing) {
      const data = await fs.readFile(file).catch(() => undefined);
      if (data) await addToLibrary(dir, data, path.extname(file).slice(1).toLowerCase());
    }
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, SEEDED), '');
  }
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => ID.test(n));
  const withTime = await Promise.all(names.map(async (id) => {
    const file = path.join(dir, id);
    return { id, file, at: (await fs.stat(file).catch(() => undefined))?.mtimeMs ?? 0 };
  }));
  return withTime.sort((a, b) => b.at - a.at).map(({ id, file }) => ({ id, file }));
}

/** The file of a library icon, or an error for an id that is not one. */
export function libraryFile(dir: string, id: string): string {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error('Nieprawidłowa ikona');
  const file = path.join(dir, id);
  if (!existsSync(file)) throw new Error('Nieprawidłowa ikona');
  return file;
}

/** Takes an icon out of the library; profiles that use it keep their own copy. */
export async function removeFromLibrary(dir: string, id: string): Promise<void> {
  await fs.rm(libraryFile(dir, id), { force: true });
}
