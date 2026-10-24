import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { fetchJson, fetchWatched, httpMessage, netFetch, type ProgressFn } from './download';
import { ensureJava, javaWorks } from './java';
import { paths } from './paths';
import { throttled } from './rateLimit';
import type { VersionJson } from './versions';
import { t } from '../shared/i18n';
import { JAVA_VENDOR_NAMES, type JavaVendor } from '../shared/javaVendors';

/**
 * Java from other vendors than Mojang, for players who want to try it: Eclipse Temurin (Adoptium
 * API), GraalVM Community Edition (its GitHub releases) and Azul Zulu (Azul's metadata API). Each
 * comes for the Java version the game version asks for, as an archive checked against the vendor's
 * SHA-256, and is unpacked next to Mojang's runtimes (runtimes/<vendor>-<major>/<release>), where the
 * disk cleanup finds it once no profile uses it. Anything that goes wrong falls back to Mojang's Java:
 * the game always starts.
 */

export type Arch = 'x64' | 'aarch64' | 'x86';
export interface HostPlatform { os: 'windows' | 'mac' | 'linux'; archs: Arch[] }

/** This computer as the vendors name it; Apple Silicon and Windows on ARM also run x64 builds (Rosetta, emulation). */
export function hostPlatform(platform: string = process.platform, arch: string = process.arch): HostPlatform {
  const os = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
  const archs: Arch[] = arch === 'arm64' ? (os === 'linux' ? ['aarch64'] : ['aarch64', 'x64']) : arch === 'ia32' ? ['x86'] : ['x64'];
  return { os, archs };
}

export interface JavaBuild {
  vendor: Exclude<JavaVendor, 'mojang'>;
  major: number;
  /** The vendor's name of the release, e.g. "jdk-21.0.5+11"; also the folder it is unpacked into. */
  release: string;
  url: string;
  sha256: string;
  archive: 'zip' | 'tar.gz';
  size?: number;
}

/** Minecraft 1.17 asks for Java 16, which no vendor keeps any more; it runs on 17 like later versions. */
export function vendorMajor(major: number): number {
  return major === 16 ? 17 : major;
}

/** The Java version a game version runs on (versions without `javaVersion` are old: Java 8), as presetArgs counts it. */
export function javaMajorOf(version: Pick<VersionJson, 'javaVersion'>): number {
  return version.javaVersion?.majorVersion ?? 8;
}

const archiveOf = (os: HostPlatform['os']): JavaBuild['archive'] => (os === 'windows' ? 'zip' : 'tar.gz');
const SHA256 = /^[0-9a-f]{64}$/i;
/** Downloads only from the vendors' own servers. */
const fromHost = (url: unknown, hosts: string[]): url is string => {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && hosts.includes(u.host);
  } catch {
    return false;
  }
};

// ---------- Eclipse Temurin (Adoptium) ----------

export function adoptiumUrl(major: number, os: HostPlatform['os'], arch: Arch, image: 'jre' | 'jdk' = 'jre'): string {
  const a = arch === 'x86' ? 'x32' : arch;
  return `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${a}&image_type=${image}&os=${os}&vendor=eclipse`;
}

interface AdoptiumAsset { release_name?: string; binary?: { image_type?: string; package?: { link?: string; checksum?: string; name?: string; size?: number } } }

export function parseAdoptium(data: unknown, major: number, archive: JavaBuild['archive']): JavaBuild | undefined {
  for (const a of Array.isArray(data) ? (data as AdoptiumAsset[]) : []) {
    const p = a?.binary?.package;
    if (!p || !p.link?.endsWith(`.${archive}`) || !SHA256.test(p.checksum ?? '') || !fromHost(p.link, ['github.com'])) continue;
    return { vendor: 'temurin', major, release: a.release_name || p.name || `temurin-${major}`, url: p.link, sha256: p.checksum!.toLowerCase(), archive, size: p.size };
  }
  return undefined;
}

// ---------- Azul Zulu ----------

export function zuluListUrl(major: number, os: HostPlatform['os'], arch: Arch): string {
  const zos = os === 'mac' ? 'macos' : os === 'linux' ? 'linux-glibc' : 'windows';
  const zarch = arch === 'x86' ? 'i686' : arch;
  return `https://api.azul.com/metadata/v1/zulu/packages/?java_version=${major}&os=${zos}&arch=${zarch}&archive_type=${archiveOf(os)}&java_package_type=jre&javafx_bundled=false&crac_supported=false&latest=true&release_status=ga&availability_types=CA&page=1&page_size=20`;
}

interface ZuluListed { package_uuid?: string; name?: string; java_version?: number[]; distro_version?: number[]; download_url?: string }

const newer = (a: number[] = [], b: number[] = []) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};

/** The newest plain package of the list (the API also lists CRaC builds and older updates as "latest"). */
export function pickZulu(data: unknown, major: number, archive: JavaBuild['archive']): string | undefined {
  const list = (Array.isArray(data) ? (data as ZuluListed[]) : [])
    .filter((p) => p?.package_uuid && p.name?.endsWith(`.${archive}`) && !/crac|fx/i.test(p.name) && p.java_version?.[0] === major)
    .sort((a, b) => newer(b.java_version, a.java_version) || newer(b.distro_version, a.distro_version));
  return list[0]?.package_uuid;
}

export const zuluPackageUrl = (uuid: string) => `https://api.azul.com/metadata/v1/zulu/packages/${encodeURIComponent(uuid)}`;

export function parseZuluPackage(data: unknown, major: number, archive: JavaBuild['archive']): JavaBuild | undefined {
  const p = data as { name?: string; download_url?: string; sha256_hash?: string; size?: number } | undefined;
  if (!p || !fromHost(p.download_url, ['cdn.azul.com']) || !SHA256.test(p.sha256_hash ?? '') || !p.download_url.endsWith(`.${archive}`)) return undefined;
  return { vendor: 'zulu', major, release: (p.name ?? `zulu-${major}`).replace(/\.(zip|tar\.gz)$/, ''), url: p.download_url, sha256: p.sha256_hash!.toLowerCase(), archive, size: p.size };
}

// ---------- GraalVM Community Edition ----------

/**
 * Only GraalVM Community Edition (GPLv2 with the Classpath Exception, like OpenJDK), from the
 * graalvm-ce-builds releases. Oracle GraalVM has other licence terms and is never downloaded.
 */
export const GRAAL_RELEASES_URL = 'https://api.github.com/repos/graalvm/graalvm-ce-builds/releases?per_page=100';

interface GhAsset { name?: string; browser_download_url?: string; size?: number; digest?: string }
interface GhRelease { tag_name?: string; draft?: boolean; prerelease?: boolean; assets?: GhAsset[] }

/** The newest release with a build for this Java version and computer; the checksum from GitHub's digest or the .sha256 file next to it. */
export function pickGraal(data: unknown, major: number, os: HostPlatform['os'], arch: Arch): (Omit<JavaBuild, 'sha256'> & { sha256?: string; sha256Url?: string }) | undefined {
  if (arch === 'x86') return undefined;
  const gos = os === 'mac' ? 'macos' : os;
  const archive = archiveOf(os);
  // e.g. graalvm-community-jdk-21.0.2_windows-x64_bin.zip, graalvm-community-jdk-25i4-25.0.4.1.1_linux-aarch64_bin.tar.gz
  const name = new RegExp(`^graalvm-community-jdk-(\\d+)[^_]*_${gos}-${arch}_bin\\.${archive.replace('.', '\\.')}$`);
  for (const r of Array.isArray(data) ? (data as GhRelease[]) : []) {
    if (!r || r.draft || r.prerelease) continue;
    const asset = r.assets?.find((a) => Number(name.exec(a.name ?? '')?.[1]) === major);
    if (!asset || !fromHost(asset.browser_download_url, ['github.com'])) continue;
    const digest = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '')?.[1];
    const side = r.assets?.find((a) => a.name === `${asset.name}.sha256`)?.browser_download_url;
    if (!digest && !fromHost(side, ['github.com'])) continue;
    return { vendor: 'graalvm', major, release: asset.name!.replace(/_[a-z]+-[a-z0-9]+_bin\.(zip|tar\.gz)$/, ''), url: asset.browser_download_url, archive, size: asset.size,
      ...(digest ? { sha256: digest.toLowerCase() } : { sha256Url: side }) };
  }
  return undefined;
}

/** A .sha256 file: the hash, maybe followed by the file's name. */
export function parseSha256File(text: string): string | undefined {
  const hash = /\b([0-9a-f]{64})\b/i.exec(text)?.[1];
  return hash?.toLowerCase();
}

// ---------- finding a build ----------

export interface VendorDeps {
  getJson: <T>(url: string) => Promise<T>;
  getText: (url: string) => Promise<string>;
}

async function getText(url: string): Promise<string> {
  const res = await netFetch(url);
  if (!res.ok) throw new Error(httpMessage(res.status, url));
  return res.text();
}

const realDeps: VendorDeps = { getJson: (url) => fetchJson(url), getText };

/** The vendor's build of Java `major` for this computer; undefined when it has none. */
export async function findBuild(vendor: Exclude<JavaVendor, 'mojang'>, major: number, host: HostPlatform = hostPlatform(), deps: VendorDeps = realDeps): Promise<JavaBuild | undefined> {
  const archive = archiveOf(host.os);
  // GraalVM's list is the same for every architecture: asked once
  const graal = vendor === 'graalvm' ? await deps.getJson<unknown>(GRAAL_RELEASES_URL) : undefined;
  for (const arch of host.archs) {
    if (vendor === 'temurin') {
      const build = parseAdoptium(await deps.getJson(adoptiumUrl(major, host.os, arch)), major, archive)
        ?? parseAdoptium(await deps.getJson(adoptiumUrl(major, host.os, arch, 'jdk')), major, archive);
      if (build) return build;
    } else if (vendor === 'zulu') {
      const uuid = pickZulu(await deps.getJson(zuluListUrl(major, host.os, arch)), major, archive);
      const build = uuid ? parseZuluPackage(await deps.getJson(zuluPackageUrl(uuid)), major, archive) : undefined;
      if (build) return build;
    } else {
      const found = pickGraal(graal, major, host.os, arch);
      if (!found) continue;
      const sha256 = found.sha256 ?? parseSha256File(await deps.getText(found.sha256Url!));
      if (sha256) return { ...found, sha256 };
    }
  }
  return undefined;
}

// ---------- installing ----------

/** The vendor has no Java of this version for this computer (e.g. GraalVM and Java 8). */
export class NoJavaBuild extends Error {}

export const vendorDirName = (vendor: JavaVendor, major: number) => `${vendor}-${vendorMajor(major)}`;

interface Installed { release: string; sha256: string; /** The java executable, relative to the vendor's folder. */ java: string }
const MARKER = 'installed.json';

async function readInstalled(dir: string): Promise<Installed | undefined> {
  const data = await fs.readFile(path.join(dir, MARKER), 'utf8').then((s) => JSON.parse(s) as Installed, () => undefined);
  return data && typeof data.java === 'string' && typeof data.sha256 === 'string' ? data : undefined;
}

/** Downloads `url` to `file` while hashing it; a file whose SHA-256 is not the vendor's is removed. */
async function downloadChecked(build: JavaBuild, file: string, onProgress?: ProgressFn): Promise<void> {
  const { res, chunks } = await fetchWatched(build.url);
  if (!res.ok || !res.body) throw new Error(httpMessage(res.status, build.url));
  const total = build.size ?? Number(res.headers.get('content-length') ?? 0);
  const hash = createHash('sha256');
  const out = createWriteStream(file);
  const started = Date.now();
  let got = 0;
  let last = 0;
  try {
    for await (const chunk of throttled(chunks)) {
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      got += chunk.length;
      if (Date.now() - last > 150) {
        last = Date.now();
        onProgress?.(0, 1, { bytes: got, totalBytes: total, speed: got / Math.max(0.2, (Date.now() - started) / 1000) });
      }
    }
  } finally {
    await new Promise<void>((resolve) => out.end(() => resolve()));
  }
  const digest = hash.digest('hex');
  if (digest !== build.sha256) {
    await fs.rm(file, { force: true });
    throw new Error(t('Pobrana Java jest uszkodzona (zła suma SHA-256).'));
  }
  onProgress?.(1, 1, { bytes: got, totalBytes: total || got, speed: 0 });
}

const run = (file: string, args: string[]) => new Promise<void>((resolve, reject) => {
  execFile(file, args, { timeout: 10 * 60_000, windowsHide: true }, (err) => (err ? reject(err) : resolve()));
});

/** Unpacks with the system's tar (Windows 10+ has one that reads zip too); a zip without it, through AdmZip. */
async function unpack(archive: string, into: string, kind: JavaBuild['archive']): Promise<void> {
  await fs.mkdir(into, { recursive: true });
  if (kind === 'tar.gz') return run('tar', ['-xzf', archive, '-C', into]);
  const winTar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  if (process.platform === 'win32' && existsSync(winTar)) {
    try {
      return await run(winTar, ['-xf', archive, '-C', into]);
    } catch {
      await fs.rm(into, { recursive: true, force: true });
      await fs.mkdir(into, { recursive: true });
    }
  }
  await new Promise<void>((resolve, reject) => new AdmZip(archive).extractAllToAsync(into, true, false, (err) => (err ? reject(err) : resolve())));
}

const javaName = () => (process.platform === 'win32' ? 'javaw.exe' : 'java');

/** The java executable in an unpacked archive: <top>/bin, or <top>/Contents/Home/bin on macOS. */
export async function findJavaIn(root: string, exe = javaName(), depth = 3): Promise<string | undefined> {
  const here = path.join(root, 'bin', exe);
  if (await fs.stat(here).then((s) => s.isFile(), () => false)) return here;
  if (depth <= 0) return undefined;
  for (const e of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory()) continue;
    const found = await findJavaIn(path.join(root, e.name), exe, depth - 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * Makes sure the vendor's newest build of Java `major` is installed and returns its java. Without
 * an answer from the vendor, the copy already on disk is used; a vendor without such a build throws NoJavaBuild.
 */
export async function ensureVendorJava(vendor: Exclude<JavaVendor, 'mojang'>, major: number, onProgress?: ProgressFn, deps: VendorDeps = realDeps): Promise<{ java: string; release: string }> {
  const want = vendorMajor(major);
  const dir = path.join(paths.runtimes, vendorDirName(vendor, want));
  const installed = await readInstalled(dir);
  const installedJava = installed && path.join(dir, installed.java);
  let build: JavaBuild | undefined;
  try {
    build = await findBuild(vendor, want, hostPlatform(), deps);
  } catch (err) {
    // offline: the copy on disk still plays
    if (installedJava && (await javaWorks(installedJava))) return { java: installedJava, release: installed.release };
    throw err;
  }
  if (!build) throw new NoJavaBuild(t('{0} nie ma Javy {1} dla tego komputera.', JAVA_VENDOR_NAMES[vendor], want));
  if (installedJava && installed.sha256 === build.sha256 && (await javaWorks(installedJava))) return { java: installedJava, release: installed.release };

  await fs.mkdir(dir, { recursive: true });
  const id = randomBytes(4).toString('hex');
  const archive = path.join(dir, `download-${id}.${build.archive}`);
  const staging = path.join(dir, `unpack-${id}`);
  const folder = build.release.replace(/[^\w.+-]/g, '_');
  const target = path.join(dir, folder);
  try {
    await downloadChecked(build, archive, onProgress);
    await unpack(archive, staging, build.archive);
    const found = await findJavaIn(staging);
    if (!found) throw new Error(t('W pobranym archiwum nie ma Javy.'));
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(staging, target);
    const java = path.join(target, path.relative(staging, found));
    if (!(await javaWorks(java))) throw new Error(t('Pobrana Java ({0}) nie uruchamia się. Usuń folder {1} i spróbuj ponownie.', build.release, dir));
    await fs.writeFile(path.join(dir, MARKER), JSON.stringify({ release: build.release, sha256: build.sha256, java: path.relative(dir, java) } satisfies Installed, null, 2));
    // older releases of the same Java go (one still used by a running game stays until next time)
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== folder) await fs.rm(path.join(dir, e.name), { recursive: true, force: true }).catch(() => {});
    }
    return { java, release: build.release };
  } finally {
    await fs.rm(archive, { force: true }).catch(() => {});
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- choosing at launch ----------

export interface JavaChoice {
  java: string;
  /** The vendor the game really plays on (Mojang after a fallback). */
  vendor: JavaVendor;
  release?: string;
}

export interface ResolveDeps {
  vendorJava: typeof ensureVendorJava;
  mojangJava: typeof ensureJava;
}

/**
 * The Java for a launch: the chosen vendor's, or Mojang's when that is the choice, the vendor has no
 * build for this version and computer, or the download fails (`onNotice` tells the player why).
 */
export async function resolveJava(vendor: JavaVendor, version: VersionJson, onProgress: ProgressFn | undefined, onNotice: (message: string) => void,
  deps: ResolveDeps = { vendorJava: ensureVendorJava, mojangJava: ensureJava }): Promise<JavaChoice> {
  if (vendor !== 'mojang') {
    try {
      const { java, release } = await deps.vendorJava(vendor, javaMajorOf(version), onProgress);
      return { java, vendor, release };
    } catch (err) {
      const why = err instanceof NoJavaBuild ? err.message : t('Nie udało się pobrać Javy {0}: {1}', JAVA_VENDOR_NAMES[vendor], (err as Error)?.message ?? String(err));
      onNotice(`${why} ${t('Gra uruchomi się na Javie od Mojang.')}`);
    }
  }
  return { java: await deps.mojangJava(version, onProgress), vendor: 'mojang' };
}
