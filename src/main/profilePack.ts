import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ManualFile } from './curseforge';
import type { StageProgress } from './modrinth';
import type { Profile } from './store';
import { t } from '../shared/i18n';

/**
 * A profile as one file to share or move to another computer: a Modrinth .mrpack, so other
 * launchers read it too. Mods, resource packs and shaders that Modrinth or CurseForge host are
 * listed by download link and hash (the file stays small), everything else the player chose
 * goes into overrides/, and the launcher's own settings of the profile into slashclient.profile.json
 * (other launchers ignore it). Accounts are never in a game folder, so they never get here;
 * worlds only when the player ticks them.
 */

/** What a pack can carry; the player picks these when exporting and importing. */
export type PackPart = 'mods' | 'resourcepacks' | 'shaderpacks' | 'config' | 'options' | 'servers' | 'worlds' | 'settings';
export const PACK_PARTS: PackPart[] = ['mods', 'resourcepacks', 'shaderpacks', 'config', 'options', 'servers', 'worlds', 'settings'];
/** Ticked unless the player changes it: everything but the worlds. */
export const DEFAULT_PARTS: PackPart[] = PACK_PARTS.filter((p) => p !== 'worlds');

export const PROFILE_FILE = 'slashclient.profile.json';
/** The profile's own picture (profileIcon.ts), in whichever format it was saved. */
const ICONS = ['png', 'webp', 'gif'].map((ext) => `.slashclient/icon.${ext}`);

/** Folders exported with "config" (mods' settings and scripts). */
const CONFIG_ITEMS = ['config', 'defaultconfigs', 'kubejs', 'scripts'];
const OPTION_FILES = ['options.txt', 'optionsof.txt', 'optionsshaders.txt'];
/** Folders with mods and packs that are matched against Modrinth/CurseForge, by part. */
const CONTENT: Partial<Record<PackPart, string>> = { mods: 'mods', resourcepacks: 'resourcepacks', shaderpacks: 'shaderpacks' };

/** Which part a path inside the game folder belongs to (anything unknown counts as configuration). */
export function partOf(rel: string): PackPart {
  const top = rel.replace(/\\/g, '/').split('/')[0];
  if (top === 'mods') return 'mods';
  if (top === 'resourcepacks') return 'resourcepacks';
  if (top === 'shaderpacks') return 'shaderpacks';
  if (top === 'saves') return 'worlds';
  if (top === 'servers.dat') return 'servers';
  if (OPTION_FILES.includes(top)) return 'options';
  if (top === '.slashclient') return 'settings';
  return 'config';
}

/** The profile settings that travel with it: nothing tied to this computer (Java path, folder, account) or to its play history. */
export interface ProfileSettings {
  name: string;
  versionId: string;
  loader: Profile['loader'];
  loaderVersion: string;
  icon: string;
  hud: boolean;
  syncOptions: boolean;
  memoryMb: number;
  jvmArgs: string;
  jvmPreset: Profile['jvmPreset'];
  width: number;
  height: number;
  /** CurseForge files the authors keep on their site: not packed, the importing player downloads them by hand. */
  manualFiles?: ManualFile[];
}

export function settingsOf(p: Profile): ProfileSettings {
  return {
    name: p.name, versionId: p.versionId, loader: p.loader, loaderVersion: p.loaderVersion, icon: p.icon, hud: p.hud, syncOptions: p.syncOptions,
    memoryMb: p.memoryMb, jvmArgs: p.jvmArgs, jvmPreset: p.jvmPreset, width: p.width, height: p.height,
  };
}

const PRESETS: Profile['jvmPreset'][] = ['default', 'g1', 'zgc'];
const str = (v: unknown, max = 500) => (typeof v === 'string' && v.length <= max ? v : undefined);
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : undefined);

/**
 * Takes the settings from a pack file into a profile. The file comes from someone else, so
 * every field is checked and anything odd is left as it was (the game version and loader come
 * from the pack's index, not from here).
 */
export function applySettings(profile: Profile, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const s = raw as Record<string, unknown>;
  const name = str(s.name, 40)?.trim();
  if (name) profile.name = name;
  const icon = str(s.icon, 40);
  if (icon !== undefined && (icon === '' || icon === 'custom' || /^block:[a-z-]+$/.test(icon))) profile.icon = icon;
  if (typeof s.hud === 'boolean') profile.hud = s.hud;
  if (typeof s.syncOptions === 'boolean') profile.syncOptions = s.syncOptions;
  profile.memoryMb = num(s.memoryMb, 512, 65536) ?? profile.memoryMb;
  profile.width = num(s.width, 320, 16384) ?? profile.width;
  profile.height = num(s.height, 240, 16384) ?? profile.height;
  const jvmArgs = str(s.jvmArgs);
  if (jvmArgs !== undefined) profile.jvmArgs = jvmArgs;
  if (PRESETS.includes(s.jvmPreset as Profile['jvmPreset'])) profile.jvmPreset = s.jvmPreset as Profile['jvmPreset'];
}

/** CurseForge files to fetch by hand, from a pack's settings (only https links to curseforge.com, safe file names and folders). */
export function manualFilesOf(raw: unknown): ManualFile[] {
  const list = (raw as { manualFiles?: unknown })?.manualFiles;
  if (!Array.isArray(list)) return [];
  return list.flatMap((f): ManualFile[] => {
    const title = str(f?.title, 200);
    const fileName = str(f?.fileName, 200);
    const url = str(f?.url, 500);
    const folder = str(f?.folder, 40);
    if (!title || !fileName || !url || !folder) return [];
    if (path.basename(fileName) !== fileName || !/^[a-z]+$/.test(folder) || !/^https:\/\/(www\.)?curseforge\.com\//.test(url)) return [];
    return [{ title, fileName, url, folder }];
  });
}

// ---------- writing ----------

/** A file of the profile that a site may host. */
export interface PackFile { rel: string; filename: string; sha1: string; sha512: string; size: number }
/** Finds where content can be downloaded: link by SHA1, or "manual" for CurseForge files the author keeps on the site. */
export type LinkResolver = (files: PackFile[]) => Promise<{ links: Map<string, string>; manual: Map<string, ManualFile> }>;

async function hashes(file: string): Promise<{ sha1: string; sha512: string; size: number }> {
  const sha1 = createHash('sha1');
  const sha512 = createHash('sha512');
  let size = 0;
  const handle = await fs.open(file, 'r');
  try {
    for await (const chunk of handle.createReadStream()) {
      sha1.update(chunk);
      sha512.update(chunk);
      size += chunk.length;
    }
  } finally {
    await handle.close();
  }
  return { sha1: sha1.digest('hex'), sha512: sha512.digest('hex'), size };
}

const exists = (p: string) => fs.stat(p).then((s) => s, () => undefined);

/** Adds a file or a whole folder to the zip under overrides/; returns how many files went in. */
async function addOverride(zip: AdmZip, gameDir: string, rel: string): Promise<number> {
  const full = path.join(gameDir, rel);
  const stat = await exists(full);
  if (!stat) return 0;
  if (stat.isFile()) {
    zip.addFile(`overrides/${rel}`, await fs.readFile(full));
    return 1;
  }
  if (!stat.isDirectory()) return 0;
  let n = 0;
  for (const name of await fs.readdir(full)) {
    // .disabled mods, the OS's .DS_Store and the like stay home
    if (name.startsWith('.') || name.endsWith('.disabled')) continue;
    n += await addOverride(zip, gameDir, `${rel}/${name}`);
  }
  return n;
}

/** How many items each part has in a game folder, for the export dialog. */
export async function countParts(gameDir: string): Promise<Record<PackPart, number>> {
  const count: Record<PackPart, number> = { mods: 0, resourcepacks: 0, shaderpacks: 0, config: 0, options: 0, servers: 0, worlds: 0, settings: 1 };
  const list = (dir: string) => fs.readdir(path.join(gameDir, dir)).catch(() => [] as string[]);
  for (const [part, dir] of Object.entries(CONTENT) as [PackPart, string][]) {
    count[part] = (await list(dir)).filter((f) => !f.startsWith('.') && !f.endsWith('.disabled')).length;
  }
  for (const item of CONFIG_ITEMS) if (await exists(path.join(gameDir, item))) count.config += (await list(item)).length || 1;
  for (const file of OPTION_FILES) if (await exists(path.join(gameDir, file))) count.options++;
  if (await exists(path.join(gameDir, 'servers.dat'))) count.servers = 1;
  count.worlds = (await list('saves')).filter((f) => !f.startsWith('.')).length;
  return count;
}

export interface WriteResult { linked: number; bundled: number; manual: number }

/**
 * Writes the chosen parts of a game folder as a .mrpack. Content `resolve` finds a link for is
 * listed (with SHA1 and SHA512 of the file on disk), CurseForge files only fetched by hand are
 * listed in the settings file, the rest is packed.
 */
export async function writeProfilePack(opts: {
  gameDir: string;
  out: string;
  name: string;
  gameVersion: string;
  loader: string;
  loaderVersion: string;
  parts: PackPart[];
  settings?: ProfileSettings;
  resolve: LinkResolver;
  onStage?: StageProgress;
}): Promise<WriteResult> {
  const { gameDir, parts } = opts;
  const zip = new AdmZip();
  const result: WriteResult = { linked: 0, bundled: 0, manual: 0 };

  // mods and packs: hash each enabled file, ask the sites about them
  opts.onStage?.(t('Rozpoznawanie modów'), 0, 1);
  const files: PackFile[] = [];
  const folders: string[] = [];
  for (const part of parts) {
    const dir = CONTENT[part];
    if (!dir) continue;
    for (const name of await fs.readdir(path.join(gameDir, dir)).catch(() => [] as string[])) {
      if (name.startsWith('.') || name.endsWith('.disabled')) continue;
      const rel = `${dir}/${name}`;
      const stat = await exists(path.join(gameDir, rel));
      if (stat?.isDirectory()) folders.push(rel); // an unpacked resource pack
      else if (stat?.isFile()) files.push({ rel, filename: name, ...(await hashes(path.join(gameDir, rel))) });
    }
  }
  const { links, manual } = files.length ? await opts.resolve(files) : { links: new Map<string, string>(), manual: new Map<string, ManualFile>() };

  const indexFiles: unknown[] = [];
  const manualFiles: ManualFile[] = [];
  for (const [i, f] of files.entries()) {
    opts.onStage?.(t('Pakowanie'), i, files.length);
    const url = links.get(f.sha1);
    const byHand = manual.get(f.sha1);
    if (url) {
      indexFiles.push({ path: f.rel, hashes: { sha1: f.sha1, sha512: f.sha512 }, env: { client: 'required', server: 'required' }, downloads: [url], fileSize: f.size });
      result.linked++;
    } else if (byHand) {
      // the author lets it be downloaded only from CurseForge: the list, not the file, travels
      manualFiles.push(byHand);
      result.manual++;
    } else {
      zip.addFile(`overrides/${f.rel}`, await fs.readFile(path.join(gameDir, f.rel)));
      result.bundled++;
    }
  }
  for (const rel of folders) result.bundled += await addOverride(zip, gameDir, rel);

  opts.onStage?.(t('Kopiowanie konfiguracji'), 0, 1);
  if (parts.includes('config')) for (const item of CONFIG_ITEMS) await addOverride(zip, gameDir, item);
  if (parts.includes('options')) for (const file of OPTION_FILES) await addOverride(zip, gameDir, file);
  if (parts.includes('servers')) await addOverride(zip, gameDir, 'servers.dat');
  if (parts.includes('worlds')) await addOverride(zip, gameDir, 'saves');
  if (parts.includes('settings') && opts.settings) {
    if (opts.settings.icon === 'custom') for (const icon of ICONS) await addOverride(zip, gameDir, icon);
    const settings: ProfileSettings = { ...opts.settings, ...(manualFiles.length ? { manualFiles } : {}) };
    zip.addFile(PROFILE_FILE, Buffer.from(JSON.stringify({ format: 1, parts, ...settings }, null, 2)));
  }

  const dependencies: Record<string, string> = { minecraft: opts.gameVersion };
  const loaderKey = ({ fabric: 'fabric-loader', quilt: 'quilt-loader', forge: 'forge', neoforge: 'neoforge' } as Record<string, string>)[opts.loader];
  if (loaderKey) dependencies[loaderKey] = opts.loaderVersion;
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify({
    formatVersion: 1, game: 'minecraft', versionId: '1.0.0', name: opts.name, summary: t('Profil wyeksportowany z SlashClient'), files: indexFiles, dependencies,
  }, null, 2)));
  opts.onStage?.(t('Zapisywanie paczki'), 0, 1);
  await zip.writeZipPromise(opts.out);
  return result;
}

// ---------- reading ----------

/** What a pack file holds, shown before importing it. */
export interface PackSummary {
  kind: 'mrpack' | 'curseforge';
  name: string;
  gameVersion: string;
  loader: Profile['loader'];
  loaderVersion: string;
  /** Files per part (downloaded and packed together). */
  parts: Partial<Record<PackPart, number>>;
  /** How many files are downloaded and how many come in the file. */
  linked: number;
  bundled: number;
  /** Launcher settings from SlashClient (absent in packs from elsewhere). */
  settings?: ProfileSettings;
  manual: number;
}

interface MrIndex {
  name?: string;
  files?: { path?: string; env?: { client?: string } }[];
  dependencies?: Record<string, string>;
}

const OVERRIDES = /^(overrides|client-overrides)\/(.+)$/;

/** Reads what a .mrpack holds without installing it. */
export function readPackSummary(file: string): PackSummary {
  const zip = new AdmZip(file);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error(t('To nie jest modpack Modrinth (.mrpack).'));
  let index: MrIndex;
  try {
    index = JSON.parse(indexEntry.getData().toString('utf8'));
  } catch {
    throw new Error(t('To nie jest modpack Modrinth (.mrpack).'));
  }
  const deps = index.dependencies ?? {};
  const parts: Partial<Record<PackPart, number>> = {};
  const add = (rel: string) => {
    const part = partOf(rel);
    parts[part] = (parts[part] ?? 0) + 1;
  };
  const listed = (index.files ?? []).filter((f) => typeof f.path === 'string' && f.env?.client !== 'unsupported');
  for (const f of listed) add(f.path!);
  let bundled = 0;
  for (const entry of zip.getEntries()) {
    const m = !entry.isDirectory && entry.entryName.match(OVERRIDES);
    if (!m) continue;
    add(m[2]);
    bundled++;
  }
  let settings: ProfileSettings | undefined;
  const settingsEntry = zip.getEntry(PROFILE_FILE);
  if (settingsEntry) {
    try {
      settings = JSON.parse(settingsEntry.getData().toString('utf8'));
    } catch {
      // a damaged settings file: the pack itself still installs
    }
  }
  if (settings) parts.settings = 1;
  return {
    kind: 'mrpack',
    name: str(settings?.name, 40) || index.name || path.basename(file).replace(/\.(mrpack|zip)$/i, ''),
    gameVersion: deps.minecraft ?? '',
    loader: deps['fabric-loader'] ? 'fabric' : deps['quilt-loader'] ? 'quilt' : deps.neoforge ? 'neoforge' : deps.forge ? 'forge' : 'vanilla',
    loaderVersion: deps['fabric-loader'] ?? deps['quilt-loader'] ?? deps.neoforge ?? deps.forge ?? '',
    parts,
    linked: listed.length,
    bundled,
    settings,
    manual: manualFilesOf(settings).length,
  };
}

/** Whether a path of the pack is installed, given the parts the player kept ticked. Unknown parts (e.g. a mod's data folder) go with the configuration. */
export const includePath = (parts: PackPart[]) => (rel: string) => parts.includes(partOf(rel));
