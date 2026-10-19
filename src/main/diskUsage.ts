import fs from 'node:fs/promises';
import path from 'node:path';
import { mavenPath, type Library } from './versions';
import { t } from '../shared/i18n';

/**
 * "Disk cleanup": how much space the launcher's folders take and what can go. Only things that
 * are provably unused are offered: Java runtimes, versions and libraries no profile's game version
 * needs (when every profile's version is known), logs and backups older than a number of days
 * (the newest backup of each world always stays), installer and mod caches of unused versions.
 */

export interface DiskLayout {
  root: string;
  versions: string;
  libraries: string;
  assets: string;
  runtimes: string;
  instances: string;
  /** The launcher's copies of game consoles (console/<profile id>). */
  console: string;
  /** SlashClient HUD jars and the Fabric API it downloads for each game version. */
  hudCache: string;
  /** Where Forge/NeoForge installers are downloaded (the system's temporary folder). */
  tmp: string;
}

export interface CleanupProfile {
  id: string;
  name: string;
  gameDir: string;
  /** The real game version (aliases resolved); undefined when it could not be found out. */
  gameVersion?: string;
  /** The Mojang Java runtime the version wants (e.g. "java-runtime-delta"); undefined when unknown. */
  javaComponent?: string;
  running: boolean;
}

export type CleanupGroup = 'runtimes' | 'versions' | 'libraries' | 'logs' | 'backups' | 'caches' | 'orphans';

export interface CleanupItem {
  id: string;
  group: CleanupGroup;
  label: string;
  detail: string;
  bytes: number;
  files: number;
  /** What goes to the trash: files or whole folders. */
  paths: string[];
  /** Ticked at first; folders that may hold the player's own things are not. */
  selected: boolean;
}

export interface DiskCategory { key: string; label: string; bytes: number }

export interface DiskReport {
  categories: DiskCategory[];
  items: CleanupItem[];
  /** Why some kinds of things are not offered (e.g. a profile's version is unknown). */
  notes: string[];
  olderThanDays: number;
  scannedAt: number;
}

interface Size { bytes: number; files: number }

/** Bytes and files in a folder or file, all the way down (links are not followed). */
export async function sizeOf(target: string): Promise<Size> {
  const st = await fs.lstat(target).catch(() => undefined);
  if (!st) return { bytes: 0, files: 0 };
  if (!st.isDirectory()) return st.isFile() ? { bytes: st.size, files: 1 } : { bytes: 0, files: 0 };
  const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => []);
  const parts = await Promise.all(entries.map((e) => sizeOf(path.join(target, e.name))));
  return parts.reduce((a, b) => ({ bytes: a.bytes + b.bytes, files: a.files + b.files }), { bytes: 0, files: 0 });
}

const exists = (p: string) => fs.stat(p).then(() => true, () => false);
const DAY = 24 * 3_600_000;
const key = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p).replace(/\\/g, '/');

// ---------- versions, libraries and Java ----------

interface LocalVersion {
  id: string;
  inheritsFrom?: string;
  libraries: Library[];
  javaComponent?: string;
  readable: boolean;
}

async function readVersions(dir: string): Promise<Map<string, LocalVersion>> {
  const out = new Map<string, LocalVersion>();
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    try {
      const json = JSON.parse(await fs.readFile(path.join(dir, id, `${id}.json`), 'utf8'));
      out.set(id, { id, inheritsFrom: json.inheritsFrom, libraries: Array.isArray(json.libraries) ? json.libraries : [], javaComponent: json.javaVersion?.component, readable: true });
    } catch {
      out.set(id, { id, libraries: [], readable: false });
    }
  }
  return out;
}

/** The game version a version is built on (itself for vanilla, the inheritsFrom chain's end for loaders); undefined if unreadable. */
function baseVersion(id: string, all: Map<string, LocalVersion>): string | undefined {
  let current = id;
  for (let depth = 0; depth < 10; depth++) {
    const v = all.get(current);
    if (!v) return current; // a parent that is not on disk: its id is still the game version
    if (!v.readable) return undefined;
    if (!v.inheritsFrom) return current;
    current = v.inheritsFrom;
  }
  return undefined;
}

/** Library files a version lists, relative to libraries/ (every OS and classifier: conservative). */
function libraryPaths(v: LocalVersion): string[] {
  const out: string[] = [];
  for (const lib of v.libraries) {
    if (typeof lib?.name === 'string' && lib.name.split(':').length >= 3) out.push(mavenPath(lib.name));
    if (lib?.downloads?.artifact?.path) out.push(lib.downloads.artifact.path);
    for (const c of Object.values(lib?.downloads?.classifiers ?? {})) if (c?.path) out.push(c.path);
  }
  return out;
}

/**
 * Forge and NeoForge installers also put files in libraries/ that no version JSON lists (patched
 * game jars, mappings) but the game reads at start: those groups are never touched.
 */
const PROTECTED_LIBRARIES = ['net/minecraftforge/', 'net/neoforged/', 'net/minecraft/', 'de/oceanlabs/', 'cpw/mods/'];

/** The biggest folders (or single files) under libraries/ whose every file is unused. */
async function unusedLibraries(dir: string, used: Set<string>): Promise<{ paths: string[]; bytes: number; files: number }> {
  const isProtected = (rel: string) => PROTECTED_LIBRARIES.some((p) => key(`${rel}/`).startsWith(p));
  /** `unused`: nothing below is needed (then the caller takes the whole folder); bytes and files count only what can go. */
  const walk = async (full: string, rel: string): Promise<{ unused: boolean; units: string[]; bytes: number; files: number }> => {
    let unused = true;
    const units: string[] = [];
    let bytes = 0;
    let files = 0;
    for (const e of await fs.readdir(full, { withFileTypes: true }).catch(() => [])) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const child = path.join(full, e.name);
      if (isProtected(childRel)) {
        unused = false;
        continue;
      }
      if (e.isDirectory()) {
        const sub = await walk(child, childRel);
        if (sub.unused) {
          if (sub.files) units.push(child);
        } else {
          unused = false;
          units.push(...sub.units);
        }
        bytes += sub.bytes;
        files += sub.files;
      } else if (e.isFile() && !used.has(key(childRel))) {
        units.push(child);
        bytes += (await fs.stat(child).catch(() => undefined))?.size ?? 0;
        files++;
      } else unused = false; // a file a version needs, or a link: stays
    }
    return { unused, units, bytes, files };
  };
  const top = await walk(dir, '');
  return { paths: top.units, bytes: top.bytes, files: top.files };
}

// ---------- logs and backups ----------

/** Files under `dir` last changed before `before`, except the ones named in `keep`. */
async function oldFiles(dir: string, before: number, keep: Set<string> = new Set()): Promise<{ paths: string[]; bytes: number }> {
  const out = { paths: [] as string[], bytes: 0 };
  const walk = async (d: string) => {
    for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && !keep.has(e.name)) {
        const st = await fs.stat(full).catch(() => undefined);
        if (st && st.mtimeMs < before) {
          out.paths.push(full);
          out.bytes += st.size;
        }
      }
    }
  };
  await walk(dir);
  return out;
}

const BACKUP_STAMP = /_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/;

/** World backups older than `before`; the newest backup of each world stays, however old. */
async function oldBackups(dir: string, before: number): Promise<{ paths: string[]; bytes: number }> {
  const out = { paths: [] as string[], bytes: 0 };
  const byWorld = new Map<string, { file: string; at: number; size: number }[]>();
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!name.endsWith('.zip')) continue;
    const file = path.join(dir, name);
    const st = await fs.stat(file).catch(() => undefined);
    if (!st?.isFile()) continue;
    const world = name.replace(BACKUP_STAMP, '').replace(/\.zip$/, '');
    byWorld.set(world, [...(byWorld.get(world) ?? []), { file, at: st.mtimeMs, size: st.size }]);
  }
  for (const list of byWorld.values()) {
    list.sort((a, b) => b.at - a.at);
    for (const b of list.slice(1)) {
      if (b.at >= before) continue;
      out.paths.push(b.file);
      out.bytes += b.size;
    }
  }
  return out;
}

// ---------- the report ----------

export async function scanDisk(layout: DiskLayout, profiles: CleanupProfile[], olderThanDays: number, now = Date.now()): Promise<DiskReport> {
  const before = now - Math.max(1, olderThanDays) * DAY;
  const notes: string[] = [];
  const items: CleanupItem[] = [];
  const gameDirs = new Map<string, CleanupProfile[]>();
  for (const p of profiles) {
    const k = key(path.resolve(p.gameDir));
    gameDirs.set(k, [...(gameDirs.get(k) ?? []), p]);
  }

  const gameVersions = new Set(profiles.map((p) => p.gameVersion).filter((v): v is string => !!v));
  const versionsKnown = profiles.every((p) => p.gameVersion);
  if (!versionsKnown) notes.push(t('Nie udało się ustalić wersji gry każdego profilu (brak internetu?), więc wersje, biblioteki i Java zostają bez zmian.'));
  const versions = await readVersions(layout.versions);

  // versions: those built on a game version no profile plays
  const keptVersions: LocalVersion[] = [];
  for (const v of versions.values()) {
    const base = baseVersion(v.id, versions);
    if (versionsKnown && base && !gameVersions.has(base)) {
      const size = await sizeOf(path.join(layout.versions, v.id));
      items.push({ id: `version:${v.id}`, group: 'versions', label: v.id, detail: base === v.id ? t('wersja gry') : t('na wersji {0}', base),
        bytes: size.bytes, files: size.files, paths: [path.join(layout.versions, v.id)], selected: true });
    } else keptVersions.push(v);
  }

  // libraries: files none of the kept versions lists
  if (versionsKnown) {
    if (keptVersions.some((v) => !v.readable)) notes.push(t('Któraś wersja ma uszkodzony plik JSON, więc biblioteki zostają bez zmian.'));
    else {
      const used = new Set(keptVersions.flatMap(libraryPaths).map(key));
      const libs = await unusedLibraries(layout.libraries, used);
      if (libs.files) {
        items.push({ id: 'libraries', group: 'libraries', label: t('Pliki w folderze libraries'), detail: t('{0} plików, których nie potrzebuje żadna zostająca wersja', libs.files),
          bytes: libs.bytes, files: libs.files, paths: libs.paths, selected: true });
      }
    }
  }

  // Java: runtimes no profile's version asks for
  const components = profiles.map((p) => p.javaComponent);
  if (components.every(Boolean)) {
    const needed = new Set(components as string[]);
    for (const v of keptVersions) if (v.javaComponent) needed.add(v.javaComponent);
    for (const e of await fs.readdir(layout.runtimes, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory() || needed.has(e.name)) continue;
      const dir = path.join(layout.runtimes, e.name);
      const size = await sizeOf(dir);
      items.push({ id: `runtime:${e.name}`, group: 'runtimes', label: t('Java {0}', e.name), detail: t('nie używa jej żaden profil'),
        bytes: size.bytes, files: size.files, paths: [dir], selected: true });
    }
  } else if (versionsKnown) notes.push(t('Nie udało się ustalić, której Javy potrzebuje każdy profil, więc pobrane Javy zostają.'));

  // logs: the game's logs and crash reports, and the launcher's copies of the console
  const profileIds = new Set(profiles.map((p) => p.id));
  for (const [, owners] of gameDirs) {
    const p = owners[0];
    if (owners.some((o) => o.running)) continue;
    const game = await oldFiles(path.join(p.gameDir, 'logs'), before, new Set(['latest.log', 'debug.log']));
    const crashes = await oldFiles(path.join(p.gameDir, 'crash-reports'), before);
    const consoles = { paths: [] as string[], bytes: 0 };
    for (const o of owners) {
      const c = await oldFiles(path.join(layout.console, o.id), before);
      consoles.paths.push(...c.paths);
      consoles.bytes += c.bytes;
    }
    const paths = [...game.paths, ...crashes.paths, ...consoles.paths];
    if (paths.length) {
      items.push({ id: `logs:${p.id}`, group: 'logs', label: owners.map((o) => o.name).join(', '), detail: t('{0} plików logów i raportów awarii', paths.length),
        bytes: game.bytes + crashes.bytes + consoles.bytes, files: paths.length, paths, selected: true });
    }
  }
  const orphanConsoles: string[] = [];
  let orphanBytes = 0;
  let orphanFiles = 0;
  for (const e of await fs.readdir(layout.console, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory() || profileIds.has(e.name)) continue;
    const dir = path.join(layout.console, e.name);
    const size = await sizeOf(dir);
    orphanConsoles.push(dir);
    orphanBytes += size.bytes;
    orphanFiles += size.files;
  }
  if (orphanConsoles.length) {
    items.push({ id: 'logs:deleted', group: 'logs', label: t('Usunięte profile'), detail: t('konsole gier profili, których już nie ma'),
      bytes: orphanBytes, files: orphanFiles, paths: orphanConsoles, selected: true });
  }

  // backups: older copies of each world
  for (const [, owners] of gameDirs) {
    const p = owners[0];
    const old = await oldBackups(path.join(p.gameDir, 'backups'), before);
    if (old.paths.length) {
      items.push({ id: `backups:${p.id}`, group: 'backups', label: owners.map((o) => o.name).join(', '), detail: t('{0} starszych kopii (najnowsza kopia każdego świata zostaje)', old.paths.length),
        bytes: old.bytes, files: old.paths.length, paths: old.paths, selected: true });
    }
  }

  // caches: Fabric API for versions no profile plays, Forge/NeoForge installers of those versions
  if (versionsKnown) {
    const fabricApi = path.join(layout.hudCache, 'fabric-api');
    for (const e of await fs.readdir(fabricApi, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory() || gameVersions.has(e.name)) continue;
      const dir = path.join(fabricApi, e.name);
      const size = await sizeOf(dir);
      if (size.files) items.push({ id: `cache:fabric-api:${e.name}`, group: 'caches', label: t('Fabric API dla {0}', e.name), detail: t('pobierze się znowu, jeśli będzie potrzebne'),
        bytes: size.bytes, files: size.files, paths: [dir], selected: true });
    }
    for (const name of await fs.readdir(layout.tmp).catch(() => [] as string[])) {
      const m = name.match(/^slashclient-(forge|neoforge)-(.+?)-(.+)-installer\.jar$/);
      if (!m || gameVersions.has(m[2])) continue;
      const file = path.join(layout.tmp, name);
      const size = await sizeOf(file);
      if (size.files) items.push({ id: `cache:installer:${name}`, group: 'caches', label: t('Instalator {0} {1}', m[1] === 'forge' ? 'Forge' : 'NeoForge', m[2]), detail: name,
        bytes: size.bytes, files: 1, paths: [file], selected: true });
    }
  }

  // folders in instances/ no profile plays in any more (a profile deleted without its files): may hold worlds
  const ownDirs = new Set([...gameDirs.keys()]);
  for (const e of await fs.readdir(layout.instances, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory()) continue;
    const dir = path.join(layout.instances, e.name);
    if (profileIds.has(e.name) || ownDirs.has(key(path.resolve(dir)))) continue;
    const size = await sizeOf(dir);
    items.push({ id: `orphan:${e.name}`, group: 'orphans', label: e.name, detail: t('folder gry usuniętego profilu: mogą w nim być światy'),
      bytes: size.bytes, files: size.files, paths: [dir], selected: false });
  }

  // what each kind of data takes
  const sum = async (dirs: string[]) => (await Promise.all(dirs.map(sizeOf))).reduce((a, b) => a + b.bytes, 0);
  const uniqueDirs = [...gameDirs.values()].map((o) => o[0].gameDir);
  const outsideInstances = uniqueDirs.filter((d) => !key(path.resolve(d)).startsWith(key(path.resolve(layout.instances)) + '/'));
  const categories: DiskCategory[] = [
    { key: 'assets', label: t('Assety (dźwięki, tekstury)'), bytes: await sum([layout.assets]) },
    { key: 'libraries', label: t('Biblioteki'), bytes: await sum([layout.libraries]) },
    { key: 'versions', label: t('Wersje gry'), bytes: await sum([layout.versions]) },
    { key: 'runtimes', label: t('Java pobrana przez launcher'), bytes: await sum([layout.runtimes]) },
    { key: 'instances', label: t('Profile (światy, mody, ustawienia)'), bytes: await sum([layout.instances, ...outsideInstances]) },
    { key: 'logs', label: t('Logi i raporty awarii'), bytes: await sum([layout.console, ...uniqueDirs.flatMap((d) => [path.join(d, 'logs'), path.join(d, 'crash-reports')])]) },
    { key: 'backups', label: t('Kopie zapasowe światów'), bytes: await sum(uniqueDirs.map((d) => path.join(d, 'backups'))) },
    { key: 'caches', label: t('Pamięć podręczna'), bytes: await sum([layout.hudCache]) },
  ];
  return { categories, items, notes, olderThanDays, scannedAt: now };
}

/**
 * Moves the chosen items' files to the trash. Every path must be inside one of `allowed`
 * (the launcher's folder, the profiles' folders, the installers' temporary folder).
 */
export async function removeItems(items: CleanupItem[], allowed: string[], trash: (file: string) => Promise<void>): Promise<{ removed: number; bytes: number; failed: string[] }> {
  const roots = allowed.map((r) => key(path.resolve(r)));
  let removed = 0;
  let bytes = 0;
  const failed: string[] = [];
  for (const item of items) {
    for (const p of item.paths) {
      const full = key(path.resolve(p));
      if (!roots.some((r) => full.startsWith(`${r}/`))) {
        failed.push(p);
        continue;
      }
      if (!(await exists(p))) continue;
      const size = await sizeOf(p);
      try {
        await trash(p);
        removed += size.files;
        bytes += size.bytes;
      } catch {
        failed.push(p);
      }
    }
  }
  return { removed, bytes, failed };
}
