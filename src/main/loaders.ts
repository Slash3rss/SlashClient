import fs from 'node:fs/promises';
import { fetchJson } from './download';
import { paths } from './paths';
import type { VersionJson } from './versions';

export type Loader = 'vanilla' | 'fabric' | 'quilt';

const META: Record<Exclude<Loader, 'vanilla'>, string> = {
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
export async function installLoader(loader: Loader, gameVersion: string, loaderVersion = ''): Promise<string> {
  if (loader === 'vanilla') return gameVersion;
  let version = loaderVersion;
  if (!version) {
    const all = await loaderVersions(loader, gameVersion);
    if (!all.length) throw new Error(`${loader === 'fabric' ? 'Fabric' : 'Quilt'} nie wspiera jeszcze wersji ${gameVersion}.`);
    version = (all.find((v) => v.stable) ?? all[0]).version;
  }
  const profile = await fetchJson<VersionJson>(
    `${META[loader]}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(version)}/profile/json`,
  );
  await fs.mkdir(paths.versionDir(profile.id), { recursive: true });
  await fs.writeFile(paths.versionJson(profile.id), JSON.stringify(profile, null, 2));
  return profile.id;
}
