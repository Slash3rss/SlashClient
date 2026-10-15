import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadAll, fetchJson, type ProgressFn } from './download';
import { paths } from './paths';
import type { VersionJson } from './versions';

const RUNTIMES_URL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

type RuntimeIndex = Record<string, Record<string, { manifest: { url: string; sha1: string }; version: { name: string } }[]>>;

interface RuntimeManifest {
  files: Record<
    string,
    | { type: 'directory' }
    | { type: 'file'; executable?: boolean; downloads: { raw: { url: string; sha1: string; size: number } } }
    | { type: 'link'; target: string }
  >;
}

/** Mojang's platform key for this machine. */
function platformKeys(): string[] {
  const { platform, arch } = process;
  if (platform === 'darwin') return arch === 'arm64' ? ['mac-os-arm64', 'mac-os'] : ['mac-os'];
  if (platform === 'win32') return arch === 'arm64' ? ['windows-arm64', 'windows-x64'] : arch === 'ia32' ? ['windows-x86'] : ['windows-x64'];
  return arch === 'ia32' ? ['linux-i386'] : ['linux'];
}

function javaExecutable(home: string): string {
  if (process.platform === 'darwin') return path.join(home, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  if (process.platform === 'win32') return path.join(home, 'bin', 'javaw.exe');
  return path.join(home, 'bin', 'java');
}

/**
 * Makes sure the Java runtime that Mojang recommends for this version is
 * installed (versions without `javaVersion` are old and use Java 8) and
 * returns the path to its java executable.
 */
export async function ensureJava(version: VersionJson, onProgress?: ProgressFn): Promise<string> {
  const component = version.javaVersion?.component ?? 'jre-legacy';
  const index = await fetchJson<RuntimeIndex>(RUNTIMES_URL);

  // Apple Silicon has no native build of some old runtimes; fall back to x64 (Rosetta).
  const platform = platformKeys().find((key) => (index[key]?.[component]?.length ?? 0) > 0);
  if (!platform) throw new Error(`Mojang nie udostępnia Javy „${component}” dla tej platformy`);
  const release = index[platform][component][0];

  const home = path.join(paths.runtimes, component, platform);
  const java = javaExecutable(home);
  const marker = path.join(home, '.version');
  const installed = await fs.readFile(marker, 'utf8').catch(() => '');
  if (installed === release.manifest.sha1 && (await javaWorks(java))) return java;

  // Fresh install, update, or repair: downloadAll re-hashes every file that is
  // already on disk and only re-downloads the ones that are missing or corrupted.
  await fs.rm(marker, { force: true });
  await installRuntime(home, release.manifest.url, onProgress);
  if (!(await javaWorks(java))) {
    throw new Error(`Pobrana Java (${component}) nie uruchamia się. Usuń folder ${home} i spróbuj ponownie.`);
  }
  await fs.writeFile(marker, release.manifest.sha1);
  return java;
}

async function installRuntime(home: string, manifestUrl: string, onProgress?: ProgressFn): Promise<void> {
  const manifest = await fetchJson<RuntimeManifest>(manifestUrl);
  const tasks = [];
  const links: [string, string][] = [];
  for (const [rel, entry] of Object.entries(manifest.files)) {
    const dest = path.join(home, rel);
    if (entry.type === 'directory') await fs.mkdir(dest, { recursive: true });
    else if (entry.type === 'link') links.push([dest, entry.target]);
    else tasks.push({ url: entry.downloads.raw.url, dest, sha1: entry.downloads.raw.sha1, size: entry.downloads.raw.size, executable: entry.executable });
  }
  await downloadAll(tasks, onProgress, { verifyHash: true });
  for (const [dest, target] of links) {
    await fs.rm(dest, { force: true });
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.symlink(target, dest);
  }
}

/**
 * Runs `java -version` as a smoke test. A damaged runtime (e.g. a dylib whose
 * code signature no longer matches) gets killed by macOS before printing anything.
 */
function javaWorks(java: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(java, ['-version'], { timeout: 20_000 }, (err) => resolve(!err));
  });
}
