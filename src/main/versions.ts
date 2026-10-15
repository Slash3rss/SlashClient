import fs from 'node:fs/promises';
import { fetchJson } from './download';
import { paths } from './paths';
import type { Rule } from './rules';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export interface ManifestEntry {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  sha1: string;
  releaseTime: string;
}

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: ManifestEntry[];
}

export interface Artifact {
  path?: string;
  url: string;
  sha1?: string;
  size?: number;
}

export interface Library {
  name: string;
  url?: string;
  downloads?: { artifact?: Artifact; classifiers?: Record<string, Artifact> };
  natives?: Partial<Record<'osx' | 'windows' | 'linux', string>>;
  extract?: { exclude?: string[] };
  rules?: Rule[];
}

export type Argument = string | { rules?: Rule[]; value: string | string[] };

export interface VersionJson {
  id: string;
  type: string;
  mainClass: string;
  inheritsFrom?: string;
  jar?: string;
  arguments?: { game?: Argument[]; jvm?: Argument[] };
  minecraftArguments?: string;
  assetIndex: { id: string; url: string; sha1: string; size: number; totalSize?: number };
  assets: string;
  downloads?: { client?: Artifact };
  libraries: Library[];
  javaVersion?: { component: string; majorVersion: number };
  logging?: { client?: { argument: string; file: { id: string; url: string; sha1: string; size: number } } };
}

let manifestCache: VersionManifest | undefined;

export async function getManifest(force = false): Promise<VersionManifest> {
  if (!manifestCache || force) manifestCache = await fetchJson<VersionManifest>(MANIFEST_URL);
  return manifestCache;
}

async function readLocal(id: string): Promise<VersionJson | undefined> {
  try {
    return JSON.parse(await fs.readFile(paths.versionJson(id), 'utf8')) as VersionJson;
  } catch {
    return undefined;
  }
}

/** Loads a version JSON, downloading it from the manifest when it is not on disk yet. */
async function loadRaw(id: string): Promise<VersionJson> {
  const local = await readLocal(id);
  if (local) return local;
  const entry = (await getManifest()).versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Nieznana wersja: ${id}`);
  const json = await fetchJson<VersionJson>(entry.url);
  await fs.mkdir(paths.versionDir(id), { recursive: true });
  await fs.writeFile(paths.versionJson(id), JSON.stringify(json, null, 2));
  return json;
}

/**
 * Resolves `inheritsFrom` chains (used by mod loaders such as Fabric) into one
 * flat version: the child's libraries come first and its fields override the parent's.
 */
export async function resolveVersion(id: string): Promise<VersionJson> {
  const version = await loadRaw(id);
  if (!version.inheritsFrom) return version;
  const parent = await resolveVersion(version.inheritsFrom);
  return {
    ...parent,
    ...version,
    jar: version.jar ?? parent.jar ?? parent.id,
    libraries: [...version.libraries, ...parent.libraries],
    arguments: {
      game: [...(parent.arguments?.game ?? []), ...(version.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(version.arguments?.jvm ?? [])],
    },
  };
}

/** Maven coordinate `group:artifact:version[:classifier]` → relative path. */
export function mavenPath(name: string): string {
  const [group, artifact, version, classifier] = name.split(':');
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.jar`;
  return [...group.split('.'), artifact, version, file].join('/');
}
