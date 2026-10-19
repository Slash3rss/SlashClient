import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadAll } from './download';
import { clientJars } from './blockTextures';
import { paths } from './paths';
import { resourcePackFile } from './modrinth';
import { curseForgePackFile } from './curseforge';
import { t } from '../shared/i18n';

/**
 * A resource pack's look before it is installed: the pack is downloaded into a small cache (the
 * same file the install would take), and its block and item textures are put next to the game's
 * own from a client jar the launcher already has. The common blocks and items come first; a pack
 * that changes only some textures shows those, and says how many it changes in all.
 */

/** Blocks and items most players know, in the order they are shown. */
export const COMMON_BLOCKS = [
  'grass_block_side', 'grass_block_top', 'dirt', 'stone', 'cobblestone', 'oak_planks', 'oak_log', 'oak_leaves', 'sand', 'gravel',
  'glass', 'bricks', 'stone_bricks', 'crafting_table_front', 'furnace_front', 'bookshelf', 'tnt_side', 'coal_ore', 'iron_ore',
  'gold_ore', 'diamond_ore', 'obsidian', 'netherrack', 'glowstone', 'deepslate', 'white_wool', 'oak_door_top', 'furnace_side',
];
export const COMMON_ITEMS = [
  'diamond_sword', 'iron_sword', 'diamond_pickaxe', 'iron_pickaxe', 'bow', 'arrow', 'diamond', 'iron_ingot', 'gold_ingot', 'emerald',
  'apple', 'golden_apple', 'bread', 'cooked_beef', 'ender_pearl', 'stick', 'totem_of_undying', 'diamond_helmet', 'experience_bottle', 'potion',
];
/** The names packs for 1.12 and older use (textures/blocks/, textures/items/), for packs made for those. */
const LEGACY: Record<string, string> = {
  grass_block_side: 'grass_side', grass_block_top: 'grass_top', oak_planks: 'planks_oak', oak_log: 'log_oak', oak_leaves: 'leaves_oak',
  stone_bricks: 'stonebrick', bricks: 'brick', furnace_front: 'furnace_front_off', white_wool: 'wool_colored_white', oak_door_top: 'door_wood_upper',
  golden_apple: 'apple_golden', cooked_beef: 'beef_cooked', bow: 'bow_standby', potion: 'potion_bottle_drinkable',
};

/** How many pairs are shown at most. */
export const MAX_PAIRS = 36;
/** Bigger pictures are left out (a 4K pack's texture is several MB). */
const MAX_TEXTURE = 1_500_000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export interface TexturePair { kind: 'block' | 'item'; name: string; pack: string; vanilla: string }
export interface PackPreview {
  pairs: TexturePair[];
  /** Block and item textures the pack replaces, of those the game has. */
  changed: { blocks: number; items: number };
  /** The game's block and item textures, for "changes X of Y". */
  total: { blocks: number; items: number };
  description: string;
  icon?: string;
  /** The pack has no block or item textures but other files (sounds, GUI, fonts, models). */
  other: string[];
  versionNumber?: string;
  /** The game version the vanilla textures come from. */
  vanillaFrom?: string;
}

const dataUrl = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;
const isPng = (buf: Buffer | null | undefined): buf is Buffer => !!buf && buf.length <= MAX_TEXTURE && buf.subarray(0, 4).equals(PNG);

/** Where pack.mcmeta is: packs are sometimes zipped with their folder around them. */
export function packRoot(names: string[]): string | undefined {
  let best: string | undefined;
  for (const n of names) {
    if (n !== 'pack.mcmeta' && !n.endsWith('/pack.mcmeta')) continue;
    const root = n.slice(0, -'pack.mcmeta'.length);
    if (best === undefined || root.length < best.length) best = root;
  }
  return best;
}

/** The text of a pack's description: a string, a text component or a list of them. */
export function descriptionText(d: unknown): string {
  if (typeof d === 'string') return d.replace(/§./g, '');
  if (Array.isArray(d)) return d.map(descriptionText).join('');
  if (d && typeof d === 'object') {
    const o = d as { text?: unknown; translate?: unknown; extra?: unknown };
    return descriptionText(o.text ?? o.translate ?? '') + (Array.isArray(o.extra) ? descriptionText(o.extra) : '');
  }
  return '';
}

/** Compares a pack's block and item textures with the game's. */
export function comparePack(pack: AdmZip, vanilla: AdmZip, max = MAX_PAIRS): PackPreview {
  const entries = pack.getEntries().filter((e) => !e.isDirectory);
  const names = entries.map((e) => e.entryName.replace(/\\/g, '/'));
  const root = packRoot(names) ?? '';
  const byName = new Map(entries.map((e, i) => [names[i], e]));
  const read = (name: string) => {
    try {
      return byName.get(name)?.getData();
    } catch {
      return undefined;
    }
  };

  // the game's own textures: what can be compared at all
  const game = { block: new Set<string>(), item: new Set<string>() };
  for (const e of vanilla.getEntries()) {
    const m = /^assets\/minecraft\/textures\/(block|item)\/([\w-]+)\.png$/.exec(e.entryName);
    if (m) game[m[1] as 'block' | 'item'].add(m[2]);
  }
  const vanillaPng = (kind: 'block' | 'item', name: string) => vanilla.getEntry(`assets/minecraft/textures/${kind}/${name}.png`)?.getData();

  // the pack's textures, under their modern names
  const tex = `${root}assets/minecraft/textures/`;
  const inPack = { block: new Map<string, string>(), item: new Map<string, string>() };
  const legacyBack = new Map(Object.entries(LEGACY).map(([modern, old]) => [old, modern]));
  for (const n of names) {
    if (!n.startsWith(tex)) continue;
    const m = /^(block|item|blocks|items)\/([\w-]+)\.png$/.exec(n.slice(tex.length));
    if (!m) continue;
    const kind = m[1].startsWith('block') ? 'block' : 'item';
    const legacy = m[1].endsWith('s');
    const name = legacy ? legacyBack.get(m[2]) ?? m[2] : m[2];
    if (!game[kind].has(name)) continue;
    // the modern name wins over a legacy one for the same texture
    if (!legacy || !inPack[kind].has(name)) inPack[kind].set(name, n);
  }

  const pairs: TexturePair[] = [];
  const add = (kind: 'block' | 'item', name: string) => {
    if (pairs.length >= max || pairs.some((p) => p.kind === kind && p.name === name)) return;
    const file = inPack[kind].get(name);
    const pack = file ? read(file) : undefined;
    const original = vanillaPng(kind, name);
    // a "replacement" that is the game's picture byte for byte changes nothing
    if (!isPng(pack) || !isPng(original) || pack.equals(original)) return;
    pairs.push({ kind, name, pack: dataUrl(pack), vanilla: dataUrl(original) });
  };
  // the well-known ones first, blocks and items mixed so both show; then whatever else the pack changes
  for (let i = 0; i < Math.max(COMMON_BLOCKS.length, COMMON_ITEMS.length); i++) {
    if (COMMON_BLOCKS[i]) add('block', COMMON_BLOCKS[i]);
    if (COMMON_ITEMS[i]) add('item', COMMON_ITEMS[i]);
  }
  for (const kind of ['block', 'item'] as const) for (const name of [...inPack[kind].keys()].sort()) add(kind, name);

  let description = '';
  try {
    description = descriptionText(JSON.parse(read(`${root}pack.mcmeta`)?.toString('utf8').replace(/^﻿/, '') ?? '{}')?.pack?.description).trim();
  } catch {
    // a pack.mcmeta that is not JSON: no description
  }
  const icon = read(`${root}pack.png`);
  // what else the pack has, when it has no block or item textures
  const other = new Set<string>();
  for (const n of names) {
    const m = /^assets\/[\w.-]+\/(sounds|textures\/gui|textures\/entity|textures\/particle|font|models|shaders|lang|textures\/environment)\//.exec(n.slice(root.length));
    if (m) other.add(m[1].replace('textures/', ''));
  }
  return {
    pairs,
    changed: { blocks: inPack.block.size, items: inPack.item.size },
    total: { blocks: game.block.size, items: game.item.size },
    description: description.slice(0, 300),
    icon: isPng(icon) ? dataUrl(icon) : undefined,
    other: [...other].sort(),
  };
}

// ---------- the files ----------

const cacheDir = (temp: string) => path.join(temp, 'slashclient-pack-previews');
/** Packs bigger than this are not downloaded just to look at them. */
export const MAX_PREVIEW_BYTES = 300 * 1024 * 1024;
const KEEP = 6;

/** Keeps the cache small: the newest few packs, none older than a day. */
async function trimCache(dir: string) {
  const files: { file: string; at: number }[] = [];
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const file = path.join(dir, name);
    const st = await fs.stat(file).catch(() => undefined);
    if (st?.isFile()) files.push({ file, at: st.mtimeMs });
  }
  files.sort((a, b) => b.at - a.at);
  for (const [i, f] of files.entries()) if (i >= KEEP || Date.now() - f.at > 86_400_000) await fs.rm(f.file, { force: true }).catch(() => {});
}

let vanillaCache: { jar: string; zip: AdmZip } | undefined;

/**
 * The game's jar for this version when it is downloaded and has the textures under their modern
 * names (1.13 and newer), otherwise the newest one there is.
 */
async function vanillaJar(gameVersion: string, versionsDir = paths.versions): Promise<{ jar: string; zip: AdmZip }> {
  const own = path.join(versionsDir, gameVersion, `${gameVersion}.jar`);
  const ownOk = await fs.stat(own).then((s) => s.size > 5_000_000, () => false);
  for (const jar of [...(ownOk ? [own] : []), ...(await clientJars(versionsDir))]) {
    if (vanillaCache?.jar === jar) return vanillaCache;
    try {
      const zip = new AdmZip(jar);
      if (zip.getEntry('assets/minecraft/textures/block/stone.png')) return (vanillaCache = { jar, zip });
    } catch {
      // a broken jar: try the next one
    }
  }
  throw new Error(t('Do podglądu potrzebna jest pobrana gra: uruchom raz dowolny profil.'));
}

export interface PreviewRequest { projectId: string; source: 'modrinth' | 'curseforge'; gameVersion: string; versionId?: string; temp: string }

/** Downloads the pack (or takes it from the cache) and compares it with the game. */
export async function previewPack(req: PreviewRequest): Promise<PackPreview> {
  const file = req.source === 'curseforge'
    ? await curseForgePackFile(req.projectId, req.gameVersion, req.versionId)
    : await resourcePackFile(req.projectId, req.gameVersion, req.versionId);
  if (!file.url) throw new Error(t('Autor tej paczki pozwala ją pobrać tylko ze strony CurseForge, więc launcher nie pokaże podglądu.'));
  if (file.size > MAX_PREVIEW_BYTES) throw new Error(t('Paczka jest za duża na podgląd ({0} MB).', Math.round(file.size / 1024 / 1024)));
  const dir = cacheDir(req.temp);
  await fs.mkdir(dir, { recursive: true });
  const key = (file.sha1 ?? `${req.source}-${req.projectId}-${file.filename}`).replace(/[^\w.-]/g, '_');
  const dest = path.join(dir, `${key}.zip`);
  await downloadAll([{ url: file.url, dest, sha1: file.sha1, size: file.size || undefined }], undefined, { verifyHash: !!file.sha1 });
  // a cached pack counts as fresh again
  await fs.utimes(dest, new Date(), new Date()).catch(() => {});
  await trimCache(dir);
  let pack: AdmZip;
  try {
    pack = new AdmZip(dest);
  } catch {
    await fs.rm(dest, { force: true });
    throw new Error(t('To nie jest paczka zasobów (.zip).'));
  }
  const { zip, jar } = await vanillaJar(req.gameVersion);
  return { ...comparePack(pack, zip), versionNumber: file.versionNumber, vanillaFrom: path.basename(jar, '.jar') };
}
