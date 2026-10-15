import AdmZip from 'adm-zip';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { downloadAll, fetchJson } from './download';
import { installVersion, type StageFn } from './install';
import { ensureJava } from './java';
import { paths } from './paths';
import { resolveVersion, type VersionJson } from './versions';

export type Loader = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge';

export const LOADER_NAMES: Record<Loader, string> = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

const META: Record<'fabric' | 'quilt', string> = {
  fabric: 'https://meta.fabricmc.net/v2',
  quilt: 'https://meta.quiltmc.org/v3',
};

export interface LoaderVersion {
  version: string;
  stable: boolean;
}

/** Loader versions available for a game version, newest first. */
export async function loaderVersions(loader: Loader, gameVersion: string): Promise<LoaderVersion[]> {
  if (loader === 'vanilla') return [];
  if (loader === 'forge') return forgeVersions(gameVersion);
  if (loader === 'neoforge') return neoforgeVersions(gameVersion);
  const list = await fetchJson<{ loader: { version: string; stable?: boolean } }[]>(
    `${META[loader]}/versions/loader/${encodeURIComponent(gameVersion)}`,
  );
  return list
    .map(({ loader: l }) => ({
      version: l.version,
      // Quilt's meta has no "stable" flag; treat pre-releases as unstable.
      stable: l.stable ?? !/-(beta|alpha|pre|rc)/.test(l.version),
    }))
    // Quilt's meta isn't sorted, so order newest first ourselves.
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** Compares "0.20.0-beta.9"-style versions; a release sorts above its pre-releases. */
export function compareVersions(a: string, b: string): number {
  const [coreA, preA = ''] = a.split('-', 2);
  const [coreB, preB = ''] = b.split('-', 2);
  const na = coreA.split('.').map(Number), nb = coreB.split('.').map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0);
    if (d) return d;
  }
  if (!preA || !preB) return preA ? -1 : preB ? 1 : 0;
  return preA.localeCompare(preB, 'en', { numeric: true });
}

/**
 * Makes sure the loader's version JSON (which inherits from the vanilla
 * version) is on disk and returns its version id, e.g. "fabric-loader-0.19.5-26.3".
 * An empty `loaderVersion` means the newest stable one.
 */
export interface InstallContext {
  gameDir: string;
  onStage: StageFn;
  onLog: (line: string) => void;
}

export async function installLoader(loader: Loader, gameVersion: string, loaderVersion: string, ctx: InstallContext): Promise<string> {
  if (loader === 'vanilla') return gameVersion;
  let version = loaderVersion;
  if (!version) {
    const all = await loaderVersions(loader, gameVersion);
    if (!all.length) throw new Error(`${LOADER_NAMES[loader]} nie wspiera jeszcze wersji ${gameVersion}.`);
    version = (all.find((v) => v.stable) ?? all[0]).version;
  }
  if (loader === 'forge' || loader === 'neoforge') return installForgeLike(loader, gameVersion, version, ctx);
  const profile = await fetchJson<VersionJson>(
    `${META[loader]}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(version)}/profile/json`,
  );
  await fs.mkdir(paths.versionDir(profile.id), { recursive: true });
  await fs.writeFile(paths.versionJson(profile.id), JSON.stringify(profile, null, 2));
  return profile.id;
}

// ---------- Forge and NeoForge (installer-based) ----------

const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';

async function forgeVersions(gameVersion: string): Promise<LoaderVersion[]> {
  const [meta, promos] = await Promise.all([
    fetchJson<Record<string, string[]>>('https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json'),
    fetchJson<{ promos: Record<string, string> }>('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'),
  ]);
  const recommended = promos.promos[`${gameVersion}-recommended`];
  return (meta[gameVersion] ?? [])
    .map((full) => full.slice(gameVersion.length + 1))
    .map((version) => ({ version, stable: recommended ? version === recommended || compareVersions(version, recommended) < 0 : true }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** NeoForge numbers follow the game: MC 1.21.1 → 21.1.x, MC 26.3 → 26.3.x. */
async function neoforgeVersions(gameVersion: string): Promise<LoaderVersion[]> {
  const prefix = `${gameVersion.replace(/^1\./, '')}${gameVersion.split('.').length === 2 && gameVersion.startsWith('1.') ? '.0' : ''}.`;
  const { versions } = await fetchJson<{ versions: string[] }>('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
  return versions
    .filter((v) => v.startsWith(prefix))
    .map((version) => ({ version, stable: !/beta|alpha/.test(version) }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

function installerUrl(loader: 'forge' | 'neoforge', gameVersion: string, version: string): string {
  return loader === 'forge'
    ? `${FORGE_MAVEN}/${gameVersion}-${version}/forge-${gameVersion}-${version}-installer.jar`
    : `${NEOFORGE_MAVEN}/${version}/neoforge-${version}-installer.jar`;
}

/**
 * Runs the official Forge/NeoForge installer headless into the launcher's
 * folder (it uses the same versions/ and libraries/ layout as Mojang's launcher)
 * and returns the version id it created. Already installed versions are reused.
 */
async function installForgeLike(loader: 'forge' | 'neoforge', gameVersion: string, version: string, ctx: InstallContext): Promise<string> {
  const name = LOADER_NAMES[loader];
  if (loader === 'forge' && compareVersions(gameVersion, '1.13') < 0 && /^1\./.test(gameVersion)) {
    throw new Error('Forge jest obsługiwany od Minecraft 1.13.');
  }
  const installer = path.join(os.tmpdir(), `slashclient-${loader}-${gameVersion}-${version}-installer.jar`);
  ctx.onStage(`Pobieranie instalatora ${name}`, 0, 1);
  await downloadAll([{ url: installerUrl(loader, gameVersion, version), dest: installer }]);

  const profileEntry = new AdmZip(installer).getEntry('install_profile.json');
  if (!profileEntry) throw new Error(`Nieobsługiwany instalator ${name} (brak install_profile.json).`);
  const versionId = String(JSON.parse(profileEntry.getData().toString('utf8')).version);
  try {
    await fs.access(paths.versionJson(versionId));
    return versionId; // installed earlier
  } catch {
    // not installed yet
  }

  // the installer needs the vanilla client and a launcher_profiles.json next to it
  await installVersion(gameVersion, ctx.gameDir, ctx.onStage);
  const java = await ensureJava(await resolveVersion(gameVersion), (d, t, s) => ctx.onStage('Java', d, t, s));
  const profiles = path.join(paths.root, 'launcher_profiles.json');
  await fs.access(profiles).catch(() => fs.writeFile(profiles, JSON.stringify({ profiles: {} })));

  ctx.onStage(`Instalowanie ${name} ${version} (to może potrwać kilka minut)`, 0, 1);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), `slashclient-${loader}-`));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(java, ['-Djava.awt.headless=true', '-jar', installer, '--installClient', paths.root], { cwd: work });
    const forward = (d: Buffer) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => ctx.onLog(`[${name}] ${l}`));
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Instalator ${name} zakończył się błędem (kod ${code}). Szczegóły są w logu.`))));
  });
  await fs.rm(work, { recursive: true, force: true });
  await fs.access(paths.versionJson(versionId)).catch(() => {
    throw new Error(`Instalator ${name} nie utworzył wersji ${versionId}.`);
  });
  return versionId;
}
