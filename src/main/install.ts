import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadAll, type ByteStats, type DownloadTask } from './download';
import { paths } from './paths';
import { is64, osName } from './platform';
import { rulesAllow } from './rules';
import { mavenPath, resolveVersion, type Artifact, type Library, type VersionJson } from './versions';

export type StageFn = (stage: string, done: number, total: number, stats?: ByteStats) => void;

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
  virtual?: boolean;
  map_to_resources?: boolean;
}

const RESOURCES_URL = 'https://resources.download.minecraft.net';
const MAVEN_URL = 'https://libraries.minecraft.net/';

/** Classifier of the legacy (pre-1.19) natives jar for this OS, if the library has one. */
function nativeClassifier(lib: Library): string | undefined {
  return lib.natives?.[osName]?.replace('${arch}', is64 ? '64' : '32');
}

/** The main jar of a library, or undefined for libraries that only carry natives. */
function libraryArtifact(lib: Library): Artifact | undefined {
  if (lib.downloads) return lib.downloads.artifact;
  // Libraries without `downloads` (mod loaders) only give a Maven repository URL.
  const rel = mavenPath(lib.name);
  return { path: rel, url: (lib.url ?? MAVEN_URL) + rel };
}

export function activeLibraries(version: VersionJson): Library[] {
  return version.libraries.filter((lib) => rulesAllow(lib.rules));
}

/** Absolute paths of all jars that belong on the classpath (excluding the client jar). */
export function libraryClasspath(version: VersionJson): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const lib of activeLibraries(version)) {
    const art = libraryArtifact(lib);
    if (!art?.path) continue;
    const file = path.join(paths.libraries, art.path);
    if (!seen.has(file)) {
      seen.add(file);
      out.push(file);
    }
  }
  return out;
}

function libraryTasks(version: VersionJson): DownloadTask[] {
  const tasks: DownloadTask[] = [];
  for (const lib of activeLibraries(version)) {
    const art = libraryArtifact(lib);
    if (art?.path) tasks.push({ url: art.url, dest: path.join(paths.libraries, art.path), sha1: art.sha1, size: art.size });
    const classifier = nativeClassifier(lib);
    const native = classifier ? lib.downloads?.classifiers?.[classifier] : undefined;
    if (native?.path) tasks.push({ url: native.url, dest: path.join(paths.libraries, native.path), sha1: native.sha1, size: native.size });
  }
  return tasks;
}

/** Unpacks legacy natives jars (LWJGL 2 / early LWJGL 3) into the version's natives directory. */
async function extractNatives(version: VersionJson): Promise<void> {
  const dir = paths.natives(version.id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  for (const lib of activeLibraries(version)) {
    const classifier = nativeClassifier(lib);
    const native = classifier ? lib.downloads?.classifiers?.[classifier] : undefined;
    if (!native?.path) continue;
    const excludes = lib.extract?.exclude ?? ['META-INF/'];
    const zip = new AdmZip(path.join(paths.libraries, native.path));
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || excludes.some((ex) => entry.entryName.startsWith(ex))) continue;
      zip.extractEntryTo(entry, dir, true, true);
    }
  }
}

/** Where the game should look for assets (`${game_assets}` for old versions). */
export function gameAssetsDir(version: VersionJson, gameDir: string, index: AssetIndex): string {
  if (index.map_to_resources) return path.join(gameDir, 'resources');
  if (index.virtual) return path.join(paths.assets, 'virtual', version.assetIndex.id);
  return paths.assets;
}

async function readAssetIndex(version: VersionJson): Promise<AssetIndex> {
  return JSON.parse(await fs.readFile(path.join(paths.assets, 'indexes', `${version.assetIndex.id}.json`), 'utf8'));
}

async function installAssets(version: VersionJson, gameDir: string, onStage: StageFn): Promise<void> {
  const indexFile = path.join(paths.assets, 'indexes', `${version.assetIndex.id}.json`);
  await downloadAll([{ url: version.assetIndex.url, dest: indexFile, sha1: version.assetIndex.sha1 }], undefined, { verifyHash: true });
  const index = await readAssetIndex(version);
  const objectPath = (hash: string) => path.join(paths.assets, 'objects', hash.slice(0, 2), hash);
  const tasks = Object.values(index.objects).map(({ hash, size }) => ({
    url: `${RESOURCES_URL}/${hash.slice(0, 2)}/${hash}`,
    dest: objectPath(hash),
    sha1: hash,
    size,
  }));
  await downloadAll(tasks, (d, t, s) => onStage('Assety', d, t, s));

  // Pre-1.7 versions read assets by name instead of by hash.
  if (index.virtual || index.map_to_resources) {
    const target = gameAssetsDir(version, gameDir, index);
    for (const [name, { hash }] of Object.entries(index.objects)) {
      const dest = path.join(target, name);
      try {
        await fs.access(dest);
      } catch {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(objectPath(hash), dest);
      }
    }
  }
}

export interface InstalledVersion {
  version: VersionJson;
  clientJar: string;
  assetsDir: string;
  loggingConfig?: string;
}

/** Downloads everything a version needs and returns the resolved version. */
export async function installVersion(id: string, gameDir: string, onStage: StageFn): Promise<InstalledVersion> {
  onStage('Pobieranie informacji o wersji', 0, 1);
  const version = await resolveVersion(id);

  const jarId = version.jar ?? version.id;
  const jarVersion = jarId === version.id ? version : await resolveVersion(jarId);
  const client = jarVersion.downloads?.client;
  if (!client) throw new Error(`Wersja ${jarId} nie ma pliku klienta`);
  const clientJar = paths.versionJar(jarId);

  const tasks: DownloadTask[] = [{ url: client.url, dest: clientJar, sha1: client.sha1, size: client.size }, ...libraryTasks(version)];

  let loggingConfig: string | undefined;
  const logging = version.logging?.client;
  if (logging) {
    loggingConfig = path.join(paths.assets, 'log_configs', logging.file.id);
    tasks.push({ url: logging.file.url, dest: loggingConfig, sha1: logging.file.sha1, size: logging.file.size });
  }

  await downloadAll(tasks, (d, t, s) => onStage('Biblioteki', d, t, s));
  onStage('Rozpakowywanie natywnych bibliotek', 0, 1);
  await extractNatives(version);
  await installAssets(version, gameDir, onStage);

  const index = await readAssetIndex(version);
  return { version, clientJar, assetsDir: gameAssetsDir(version, gameDir, index), loggingConfig };
}
