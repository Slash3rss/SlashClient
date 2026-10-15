import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Profile } from './store';

/** An instance found in another launcher, ready to be copied into a SlashClient profile. */
export interface ForeignInstance {
  source: 'prism' | 'multimc' | 'curseforge' | 'modrinth' | 'official';
  name: string;
  versionId: string;
  loader: Profile['loader'];
  loaderVersion: string;
  /** The folder with mods/, saves/, options.txt… */
  gameDir: string;
  /** The official launcher shares one .minecraft between profiles: copy only the player's own files then. */
  sharedDir: boolean;
  icon?: string;
  mods: number;
}

export const SOURCE_NAMES: Record<ForeignInstance['source'], string> = {
  prism: 'Prism Launcher', multimc: 'MultiMC', curseforge: 'CurseForge', modrinth: 'Modrinth App', official: 'Minecraft Launcher',
};

/** What gets copied from a shared .minecraft (never versions/, libraries/ or assets/). */
export const SHARED_DIR_ITEMS = ['mods', 'config', 'saves', 'resourcepacks', 'shaderpacks', 'screenshots', 'options.txt', 'servers.dat', 'hotbar.nbt', 'optionsof.txt', 'optionsshaders.txt'];

/** Launcher files and caches inside an instance folder that are not worth copying. */
const SKIP = new Set(['logs', 'crash-reports', '.cache', '.fabric', '.quilt', '.mixin.out', 'natives', 'downloads', 'debug', '.slashclient', 'minecraftinstance.json', 'instance.cfg', 'mmc-pack.json', 'profile.json', 'usercache.json', 'usernamecache.json']);

export function shouldCopy(name: string, shared: boolean): boolean {
  return shared ? SHARED_DIR_ITEMS.includes(name) : !SKIP.has(name);
}

const home = os.homedir();
const appData = (...p: string[]) => {
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', ...p);
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), ...p);
  return path.join(home, '.local', 'share', ...p);
};

const exists = (p: string) => fs.access(p).then(() => true, () => false);
const readText = (p: string) => fs.readFile(p, 'utf8').catch(() => undefined);
async function countMods(gameDir: string): Promise<number> {
  return (await fs.readdir(path.join(gameDir, 'mods')).catch(() => [] as string[])).filter((f) => /\.jar$/.test(f)).length;
}

/** key=value files (instance.cfg, prismlauncher.cfg). */
export function parseCfg(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([^=#[]+)=(.*)$/.exec(line);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

// ---------- Prism Launcher / MultiMC ----------

/** mmc-pack.json components → game version and loader. */
export function fromMmcPack(pack: { components?: { uid: string; version?: string; cachedVersion?: string }[] }) {
  const v = (uid: string) => {
    const c = pack.components?.find((x) => x.uid === uid);
    return c ? c.version ?? c.cachedVersion ?? '' : undefined;
  };
  const versionId = v('net.minecraft') ?? '';
  const loaders: [string, Profile['loader']][] = [
    ['net.fabricmc.fabric-loader', 'fabric'], ['org.quiltmc.quilt-loader', 'quilt'], ['net.neoforged', 'neoforge'], ['net.minecraftforge', 'forge'],
  ];
  for (const [uid, loader] of loaders) {
    const version = v(uid);
    if (version !== undefined) return { versionId, loader, loaderVersion: version };
  }
  return { versionId, loader: 'vanilla' as const, loaderVersion: '' };
}

async function mmcInstance(dir: string, source: 'prism' | 'multimc', iconsDir?: string): Promise<ForeignInstance | undefined> {
  const cfg = await readText(path.join(dir, 'instance.cfg'));
  const pack = await readText(path.join(dir, 'mmc-pack.json'));
  if (!cfg || !pack) return undefined;
  const c = parseCfg(cfg);
  const info = fromMmcPack(JSON.parse(pack));
  if (!info.versionId) return undefined;
  let gameDir = path.join(dir, '.minecraft');
  if (!(await exists(gameDir))) gameDir = path.join(dir, 'minecraft');
  let icon: string | undefined;
  if (iconsDir && c.iconKey && c.iconKey !== 'default') {
    for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '']) {
      if (await exists(path.join(iconsDir, c.iconKey + ext))) { icon = path.join(iconsDir, c.iconKey + ext); break; }
    }
  }
  return { source, name: c.name || path.basename(dir), ...info, gameDir, sharedDir: false, icon, mods: await countMods(gameDir) };
}

async function prismLike(root: string, source: 'prism' | 'multimc'): Promise<ForeignInstance[]> {
  const cfg = parseCfg((await readText(path.join(root, source === 'prism' ? 'prismlauncher.cfg' : 'multimc.cfg'))) ?? '');
  const instancesDir = cfg.InstanceDir ? path.resolve(root, cfg.InstanceDir) : path.join(root, 'instances');
  const iconsDir = cfg.IconsDir ? path.resolve(root, cfg.IconsDir) : path.join(root, 'icons');
  const names = await fs.readdir(instancesDir).catch(() => [] as string[]);
  const found = await Promise.all(names.filter((n) => !n.startsWith('.') && n !== '_MMC_TEMP' && n !== '_LAUNCHER_TEMP')
    .map((n) => mmcInstance(path.join(instancesDir, n), source, iconsDir).catch(() => undefined)));
  return found.filter((x): x is ForeignInstance => !!x);
}

// ---------- CurseForge ----------

/** baseModLoader.name: "fabric-0.16.9", "forge-47.3.0", "neoforge-21.1.77", "quilt-0.27.1". */
export function fromCurseForge(json: { name?: string; gameVersion?: string; baseModLoader?: { name?: string; minecraftVersion?: string } }) {
  const loaderName = json.baseModLoader?.name ?? '';
  const m = /^(fabric|quilt|forge|neoforge)-(.+)$/.exec(loaderName);
  let loaderVersion = m?.[2] ?? '';
  // some CurseForge exports write "forge-1.20.1-47.3.0"
  const versionId = json.baseModLoader?.minecraftVersion || json.gameVersion || '';
  if (versionId && loaderVersion.startsWith(`${versionId}-`)) loaderVersion = loaderVersion.slice(versionId.length + 1);
  return { versionId, loader: (m?.[1] ?? 'vanilla') as Profile['loader'], loaderVersion };
}

async function curseForge(root: string): Promise<ForeignInstance[]> {
  const names = await fs.readdir(root).catch(() => [] as string[]);
  const found = await Promise.all(names.map(async (n): Promise<ForeignInstance | undefined> => {
    const dir = path.join(root, n);
    const text = await readText(path.join(dir, 'minecraftinstance.json'));
    if (!text) return undefined;
    const json = JSON.parse(text);
    const info = fromCurseForge(json);
    if (!info.versionId) return undefined;
    return { source: 'curseforge', name: json.name || n, ...info, gameDir: dir, sharedDir: false, mods: await countMods(dir) };
  }).map((p) => p.catch(() => undefined)));
  return found.filter((x): x is ForeignInstance => !!x);
}

// ---------- Modrinth App ----------

async function modrinthApp(root: string): Promise<ForeignInstance[]> {
  const dbFile = path.join(root, 'app.db');
  if (!(await exists(dbFile))) return [];
  // node:sqlite is built into Electron's Node; loaded lazily so a missing module only skips this source
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const tables = new Set((db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((r) => r.name));
    let rows: { path: string; name: string; game_version: string; loader: string; loader_version: string | null; icon_path: string | null }[] = [];
    if (tables.has('instances') && tables.has('instance_content_sets')) {
      rows = db.prepare(`SELECT i.path, i.name, s.game_version, s.loader, s.loader_version, i.icon_path
        FROM instances i JOIN instance_content_sets s ON s.id = i.applied_content_set_id`).all() as typeof rows;
    } else if (tables.has('profiles')) {
      // older Modrinth App versions
      rows = db.prepare(`SELECT path, name, game_version, mod_loader AS loader, mod_loader_version AS loader_version, icon_path FROM profiles`).all() as typeof rows;
    }
    const loaders = ['fabric', 'quilt', 'forge', 'neoforge'];
    return Promise.all(rows.map(async (r) => {
      const gameDir = path.join(root, 'profiles', r.path);
      return {
        source: 'modrinth' as const, name: r.name, versionId: r.game_version,
        loader: (loaders.includes(r.loader) ? r.loader : 'vanilla') as Profile['loader'], loaderVersion: r.loader_version ?? '',
        gameDir, sharedDir: false, icon: r.icon_path ?? undefined, mods: await countMods(gameDir),
      };
    }));
  } finally {
    db.close();
  }
}

// ---------- official Minecraft Launcher ----------

/** "fabric-loader-0.16.9-1.21.4", "1.20.1-forge-47.3.0", "neoforge-21.1.77", "1.21.4" → game version and loader. */
export function fromLauncherVersion(id: string, inheritsFrom?: string) {
  let m = /^(fabric|quilt)-loader-([^-]+)-(.+)$/.exec(id);
  if (m) return { versionId: m[3], loader: m[1] as Profile['loader'], loaderVersion: m[2] };
  m = /^(.+?)-forge-(.+)$/.exec(id);
  if (m) return { versionId: m[1], loader: 'forge' as const, loaderVersion: m[2] };
  m = /^neoforge-(.+)$/.exec(id);
  if (m) return { versionId: inheritsFrom ?? '', loader: 'neoforge' as const, loaderVersion: m[1] };
  return { versionId: inheritsFrom ?? id, loader: 'vanilla' as const, loaderVersion: '' };
}

async function official(root: string): Promise<ForeignInstance[]> {
  const text = await readText(path.join(root, 'launcher_profiles.json'));
  if (!text) return [];
  const profiles = Object.values(JSON.parse(text).profiles ?? {}) as { name?: string; type?: string; lastVersionId?: string; gameDir?: string }[];
  const out: ForeignInstance[] = [];
  for (const p of profiles) {
    if (!p.lastVersionId) continue;
    const json = await readText(path.join(root, 'versions', p.lastVersionId, `${p.lastVersionId}.json`));
    const info = fromLauncherVersion(p.lastVersionId, json ? JSON.parse(json).inheritsFrom : undefined);
    if (!info.versionId) continue;
    const gameDir = p.gameDir || root;
    const name = p.name || (p.type === 'latest-release' ? 'Minecraft' : p.type === 'latest-snapshot' ? 'Minecraft Snapshot' : p.lastVersionId);
    out.push({ source: 'official', name, ...info, gameDir, sharedDir: !p.gameDir, mods: await countMods(gameDir) });
  }
  return out;
}

// ---------- everything ----------

function defaultRoots() {
  const officialRoot = process.platform === 'darwin' ? appData('minecraft') : process.platform === 'win32' ? appData('.minecraft') : path.join(home, '.minecraft');
  return {
    prism: [appData('PrismLauncher'), path.join(home, '.var', 'app', 'org.prismlauncher.PrismLauncher', 'data', 'PrismLauncher')],
    multimc: [appData('MultiMC')],
    curseforge: [path.join(home, 'Documents', 'curseforge', 'minecraft', 'Instances'), path.join(home, 'curseforge', 'minecraft', 'Instances')],
    modrinth: [appData('ModrinthApp'), appData('com.modrinth.theseus')],
    official: [officialRoot],
  };
}

/** Looks for instances of every known launcher in their usual places. */
export async function findInstances(): Promise<ForeignInstance[]> {
  const roots = defaultRoots();
  const tasks: Promise<ForeignInstance[]>[] = [
    ...roots.prism.map((r) => prismLike(r, 'prism')),
    ...roots.multimc.map((r) => prismLike(r, 'multimc')),
    ...roots.curseforge.map(curseForge),
    ...roots.modrinth.map(modrinthApp),
    ...roots.official.map(official),
  ];
  const all = (await Promise.all(tasks.map((t) => t.catch(() => [] as ForeignInstance[])))).flat();
  // the same folder can be reached twice (e.g. a Prism portable install); keep the first
  const seen = new Set<string>();
  return all.filter((i) => {
    const key = `${i.gameDir}|${i.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A folder the player picked: an instance of any of the supported launchers. */
export async function instanceFromFolder(dir: string): Promise<ForeignInstance[]> {
  const mmc = await mmcInstance(dir, 'prism').catch(() => undefined);
  if (mmc) return [mmc];
  const parent = path.dirname(dir);
  const cf = (await curseForge(parent)).filter((i) => i.gameDir === dir);
  if (cf.length) return cf;
  const mr = await modrinthApp(path.dirname(parent)).catch(() => [] as ForeignInstance[]);
  const fromApp = mr.filter((i) => i.gameDir === dir);
  if (fromApp.length) return fromApp;
  // a whole launcher folder (Prism root, .minecraft, CurseForge Instances)
  const lists = await Promise.all([prismLike(dir, 'prism'), curseForge(dir), modrinthApp(dir).catch(() => []), official(dir)]);
  return lists.flat();
}

/** Copies an instance's files into a profile folder, reporting progress per top-level item. */
export async function copyInstance(inst: ForeignInstance, dest: string, onProgress?: (done: number, total: number, item: string) => void): Promise<void> {
  const items = (await fs.readdir(inst.gameDir)).filter((n) => shouldCopy(n, inst.sharedDir));
  await fs.mkdir(dest, { recursive: true });
  for (const [i, item] of items.entries()) {
    onProgress?.(i, items.length, item);
    await fs.cp(path.join(inst.gameDir, item), path.join(dest, item), { recursive: true, force: false, errorOnExist: false });
  }
  onProgress?.(items.length, items.length, '');
}
