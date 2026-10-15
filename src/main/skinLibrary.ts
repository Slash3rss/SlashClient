import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { t } from '../shared/i18n';
import { paths } from './paths';
import { readSkinFile } from './skins';

/** A saved look: a skin file, its arm model and optionally the cape to wear with it. */
export interface SkinPreset {
  id: string;
  name: string;
  variant: 'classic' | 'slim';
  /** Cape to show with this skin: an owned cape's id, null = no cape, undefined = leave the cape alone. */
  capeId?: string | null;
  addedAt: number;
}

export interface SkinPresetWithImage extends SkinPreset {
  /** data:image/png;base64,… */
  dataUrl: string;
}

/** Shared by all accounts: skins/library.json plus one <id>.png per preset. */
export function libraryDir(root = paths.root): string {
  return path.join(root, 'skins');
}

async function readIndex(dir: string): Promise<SkinPreset[]> {
  try {
    const list = JSON.parse(await fs.readFile(path.join(dir, 'library.json'), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeIndex(dir: string, list: SkinPreset[]): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'library.json');
  await fs.writeFile(`${file}.tmp`, JSON.stringify(list, null, 2));
  await fs.rename(`${file}.tmp`, file);
}

function pngPath(dir: string, id: string): string {
  // ids are our own UUIDs; anything else must not walk out of the folder
  if (!/^[\w-]+$/.test(id)) throw new Error(t('Nie znaleziono skina w bibliotece.'));
  return path.join(dir, `${id}.png`);
}

/** Every preset with its picture, newest first; entries whose file is gone are skipped. */
export async function listPresets(dir = libraryDir()): Promise<SkinPresetWithImage[]> {
  const list = await readIndex(dir);
  const withImages = await Promise.all(list.map(async (p) => {
    const png = await fs.readFile(pngPath(dir, p.id)).catch(() => undefined);
    return png ? { ...p, dataUrl: `data:image/png;base64,${png.toString('base64')}` } : undefined;
  }));
  return withImages.filter((p): p is SkinPresetWithImage => !!p).sort((a, b) => b.addedAt - a.addedAt);
}

export async function addPreset(png: Buffer, fields: Pick<SkinPreset, 'name' | 'variant' | 'capeId'>, dir = libraryDir()): Promise<SkinPreset> {
  readSkinFile(png);
  const preset: SkinPreset = { id: randomUUID(), addedAt: Date.now(), ...fields, name: cleanName(fields.name) };
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(pngPath(dir, preset.id), png);
  await writeIndex(dir, [...(await readIndex(dir)), preset]);
  return preset;
}

/** Changes the name, arm model or cape of a preset. */
export async function updatePreset(id: string, changes: Partial<Pick<SkinPreset, 'name' | 'variant' | 'capeId'>>, dir = libraryDir()): Promise<SkinPreset> {
  const list = await readIndex(dir);
  const preset = list.find((p) => p.id === id);
  if (!preset) throw new Error(t('Nie znaleziono skina w bibliotece.'));
  if (changes.name !== undefined) preset.name = cleanName(changes.name);
  if (changes.variant === 'classic' || changes.variant === 'slim') preset.variant = changes.variant;
  if ('capeId' in changes) preset.capeId = changes.capeId;
  await writeIndex(dir, list);
  return preset;
}

export async function removePreset(id: string, dir = libraryDir()): Promise<void> {
  await writeIndex(dir, (await readIndex(dir)).filter((p) => p.id !== id));
  await fs.rm(pngPath(dir, id), { force: true });
}

/** The preset and its skin file, ready to upload. */
export async function readPreset(id: string, dir = libraryDir()): Promise<{ preset: SkinPreset; png: Buffer }> {
  const preset = (await readIndex(dir)).find((p) => p.id === id);
  if (!preset) throw new Error(t('Nie znaleziono skina w bibliotece.'));
  return { preset, png: await fs.readFile(pngPath(dir, id)) };
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Skin';
}

/**
 * Guesses the arm model from a decoded 64×64 skin (RGBA or BGRA, alpha last):
 * slim (Alex) arms are 3 pixels wide, which leaves the end of the right arm's rows empty.
 */
export function looksSlim(bitmap: Buffer, width: number, height: number): boolean {
  if (width !== 64 || height !== 64) return false;
  const empty = (x: number, y: number) => bitmap[(y * width + x) * 4 + 3] === 0;
  for (let y = 16; y < 20; y++) if (!empty(50, y) || !empty(51, y)) return false;
  for (let y = 20; y < 32; y++) if (!empty(54, y) || !empty(55, y)) return false;
  return true;
}
