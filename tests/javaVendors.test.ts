import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  adoptiumUrl, findBuild, findJavaIn, GRAAL_RELEASES_URL, hostPlatform, javaMajorOf, NoJavaBuild, parseAdoptium, parseSha256File, parseZuluPackage,
  pickGraal, pickZulu, resolveJava, vendorDirName, vendorMajor, zuluListUrl, zuluPackageUrl, type VendorDeps,
} from '../src/main/javaVendors';
import { compareRuns, type CompareRun } from '../src/main/javaCompare';
import { scanDisk, type DiskLayout } from '../src/main/diskUsage';
import type { VersionJson } from '../src/main/versions';
import { lookup, setLang } from '../src/shared/i18n';
import { effectiveJavaVendor, JAVA_VENDOR_NAMES } from '../src/shared/javaVendors';

const SHA = (c: string) => c.repeat(64);

// trimmed answers of the real APIs (October 2026)
const ADOPTIUM_21_WIN = [{
  binary: {
    architecture: 'x64', image_type: 'jre', os: 'windows',
    installer: { checksum: SHA('1'), link: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.msi', name: 'OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.msi', size: 34963456 },
    package: { checksum: 'd35f31e712f0fcf6ac5a093edc90204fbff22f720ba3950bd09d331d5e621636', link: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip', name: 'OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip', size: 48999141 },
  },
  release_name: 'jdk-21.0.12.1+1',
}];

const ZULU_21_LIST = [
  { availability_type: 'CA', distro_version: [21, 50, 19, 0], download_url: 'https://cdn.azul.com/zulu/bin/zulu21.50.19-ca-jre21.0.11-win_x64.zip', java_version: [21, 0, 11], latest: true, name: 'zulu21.50.19-ca-jre21.0.11-win_x64.zip', package_uuid: '88c3d80a-2fc2-4163-9b91-d46ea2664fce' },
  { availability_type: 'CA', distro_version: [21, 56, 1, 0], download_url: 'https://cdn.azul.com/zulu/bin/zulu21.56.1-ca-crac-jre21.0.14-win_x64.zip', java_version: [21, 0, 14], latest: true, name: 'zulu21.56.1-ca-crac-jre21.0.14-win_x64.zip', package_uuid: 'crac-0000' },
  { availability_type: 'CA', distro_version: [21, 54, 107, 0], download_url: 'https://cdn.azul.com/zulu/bin/zulu21.54.107-ca-jre21.0.13-win_x64.zip', java_version: [21, 0, 13], latest: true, name: 'zulu21.54.107-ca-jre21.0.13-win_x64.zip', package_uuid: '1953be22-1404-4175-8257-0dcb1ac0dffb' },
];
const ZULU_PACKAGE = {
  arch: 'x86', archive_type: 'zip', download_url: 'https://cdn.azul.com/zulu/bin/zulu21.54.107-ca-jre21.0.13-win_x64.zip', hw_bitness: 64, java_package_type: 'jre', java_version: [21, 0, 13],
  name: 'zulu21.54.107-ca-jre21.0.13-win_x64.zip', os: 'windows', package_uuid: '1953be22-1404-4175-8257-0dcb1ac0dffb',
  sha256_hash: '9532e56bcf2578b4bbb82507c4e38a17c0332c5918ff6c8b25cd2f71abf42cf9', size: 49364100,
};

const gh = (tag: string, files: string[], digests = true) => ({
  tag_name: tag, draft: false, prerelease: false,
  assets: files.flatMap((name) => [
    { name, browser_download_url: `https://github.com/graalvm/graalvm-ce-builds/releases/download/${tag}/${name}`, size: 1000, ...(digests ? { digest: `sha256:${SHA('a')}` } : {}) },
    { name: `${name}.sha256`, browser_download_url: `https://github.com/graalvm/graalvm-ce-builds/releases/download/${tag}/${name}.sha256`, size: 64 },
  ]),
});
const GRAAL_RELEASES = [
  { tag_name: 'jdk-26.0.0-ea', draft: false, prerelease: true, assets: [{ name: 'graalvm-community-jdk-25.9.9_windows-x64_bin.zip', browser_download_url: 'https://github.com/x', digest: `sha256:${SHA('f')}` }] },
  gh('graal-25.4.4.1.1', ['graalvm-community-jdk-25i4-25.0.4.1.1_linux-aarch64_bin.tar.gz', 'graalvm-community-jdk-25i4-25.0.4.1.1_linux-x64_bin.tar.gz', 'graalvm-community-jdk-25i4-25.0.4.1.1_macos-aarch64_bin.tar.gz', 'graalvm-community-jdk-25i4-25.0.4.1.1_windows-x64_bin.zip']),
  gh('jdk-25.0.1', ['graalvm-community-jdk-25.0.1_macos-x64_bin.tar.gz', 'graalvm-community-jdk-25.0.1_windows-x64_bin.zip']),
  gh('jdk-21.0.2', ['graalvm-community-jdk-21.0.2_macos-x64_bin.tar.gz', 'graalvm-community-jdk-21.0.2_windows-x64_bin.zip'], false),
  gh('jdk-17.0.9', ['graalvm-community-jdk-17.0.9_windows-x64_bin.zip']),
  // Oracle GraalVM and other files of the project are never picked
  gh('graal-23.0.2', ['graalvm-jdk-21.0.2_windows-x64_bin.zip', 'icu4j-installable-ce-java17-windows-amd64-23.0.2.jar']),
];

const version = (major?: number): VersionJson => ({ javaVersion: major ? { component: 'java-runtime-x', majorVersion: major } : undefined } as unknown as VersionJson);

describe('Java version for the game version', () => {
  it('uses the Java Mojang names for the version, 8 for old ones', () => {
    assert.equal(javaMajorOf(version(21)), 21);
    assert.equal(javaMajorOf(version(25)), 25);
    assert.equal(javaMajorOf(version()), 8);
  });
  it('plays 1.17 (Java 16) on 17, which the vendors still keep', () => {
    assert.equal(vendorMajor(16), 17);
    assert.equal(vendorMajor(8), 8);
    assert.equal(vendorDirName('temurin', 16), 'temurin-17');
    assert.equal(vendorDirName('zulu', 21), 'zulu-21');
  });
  it('names this computer as the vendors do', () => {
    assert.deepEqual(hostPlatform('win32', 'x64'), { os: 'windows', archs: ['x64'] });
    assert.deepEqual(hostPlatform('darwin', 'arm64'), { os: 'mac', archs: ['aarch64', 'x64'] });
    assert.deepEqual(hostPlatform('linux', 'arm64'), { os: 'linux', archs: ['aarch64'] });
  });
  it('a profile follows Settings until it picks its own', () => {
    assert.equal(effectiveJavaVendor('', undefined), 'mojang');
    assert.equal(effectiveJavaVendor(undefined, 'zulu'), 'zulu');
    assert.equal(effectiveJavaVendor('temurin', 'zulu'), 'temurin');
    assert.equal(effectiveJavaVendor('oracle', 'nonsense'), 'mojang');
  });
});

describe('Eclipse Temurin (Adoptium API)', () => {
  it('asks for the JRE of the version, OS and architecture', () => {
    assert.equal(adoptiumUrl(21, 'windows', 'x64'), 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse');
    assert.equal(adoptiumUrl(8, 'mac', 'aarch64', 'jdk'), 'https://api.adoptium.net/v3/assets/latest/8/hotspot?architecture=aarch64&image_type=jdk&os=mac&vendor=eclipse');
  });
  it('takes the archive (not the installer) with its SHA-256', () => {
    const b = parseAdoptium(ADOPTIUM_21_WIN, 21, 'zip')!;
    assert.equal(b.url, ADOPTIUM_21_WIN[0].binary.package.link);
    assert.equal(b.sha256, 'd35f31e712f0fcf6ac5a093edc90204fbff22f720ba3950bd09d331d5e621636');
    assert.equal(b.release, 'jdk-21.0.12.1+1');
    assert.equal(b.size, 48999141);
  });
  it('refuses answers without a checksum or from another server', () => {
    assert.equal(parseAdoptium([], 21, 'zip'), undefined);
    assert.equal(parseAdoptium([{ binary: { package: { ...ADOPTIUM_21_WIN[0].binary.package, checksum: '' } } }], 21, 'zip'), undefined);
    assert.equal(parseAdoptium([{ binary: { package: { ...ADOPTIUM_21_WIN[0].binary.package, link: 'https://evil.example/x.zip' } } }], 21, 'zip'), undefined);
    assert.equal(parseAdoptium(ADOPTIUM_21_WIN, 21, 'tar.gz'), undefined);
  });
});

describe('Azul Zulu (metadata API)', () => {
  it('asks for a plain JRE archive of this computer', () => {
    const url = new URL(zuluListUrl(17, 'linux', 'x64'));
    assert.equal(url.host, 'api.azul.com');
    assert.equal(url.searchParams.get('java_version'), '17');
    assert.equal(url.searchParams.get('os'), 'linux-glibc');
    assert.equal(url.searchParams.get('archive_type'), 'tar.gz');
    assert.equal(url.searchParams.get('java_package_type'), 'jre');
    assert.equal(url.searchParams.get('crac_supported'), 'false');
    assert.equal(new URL(zuluListUrl(21, 'mac', 'aarch64')).searchParams.get('os'), 'macos');
  });
  it('picks the newest package that is not a CRaC build', () => {
    assert.equal(pickZulu(ZULU_21_LIST, 21, 'zip'), '1953be22-1404-4175-8257-0dcb1ac0dffb');
    assert.equal(pickZulu(ZULU_21_LIST, 17, 'zip'), undefined);
    assert.equal(pickZulu([], 21, 'zip'), undefined);
  });
  it('reads the download and SHA-256 from the package details', () => {
    const b = parseZuluPackage(ZULU_PACKAGE, 21, 'zip')!;
    assert.equal(b.url, ZULU_PACKAGE.download_url);
    assert.equal(b.sha256, ZULU_PACKAGE.sha256_hash);
    assert.equal(b.release, 'zulu21.54.107-ca-jre21.0.13-win_x64');
    assert.equal(parseZuluPackage({ ...ZULU_PACKAGE, download_url: 'http://cdn.azul.com/x.zip' }, 21, 'zip'), undefined);
    assert.equal(parseZuluPackage({ ...ZULU_PACKAGE, sha256_hash: undefined }, 21, 'zip'), undefined);
  });
});

describe('GraalVM Community (GitHub releases)', () => {
  it('finds the newest Community build for the version, also with the new release names', () => {
    const b = pickGraal(GRAAL_RELEASES, 25, 'windows', 'x64')!;
    assert.match(b.url, /graal-25\.4\.4\.1\.1\/graalvm-community-jdk-25i4-25\.0\.4\.1\.1_windows-x64_bin\.zip$/);
    assert.equal(b.sha256, SHA('a'));
    assert.equal(b.archive, 'zip');
    // the newest release has no Intel Mac build: the one before it does
    assert.match(pickGraal(GRAAL_RELEASES, 25, 'mac', 'x64')!.url, /jdk-25\.0\.1\/graalvm-community-jdk-25\.0\.1_macos-x64_bin\.tar\.gz$/);
    assert.match(pickGraal(GRAAL_RELEASES, 17, 'windows', 'x64')!.url, /jdk-17\.0\.9/);
  });
  it('takes the .sha256 file when GitHub gives no digest', () => {
    const b = pickGraal(GRAAL_RELEASES, 21, 'windows', 'x64')!;
    assert.equal(b.sha256, undefined);
    assert.match(b.sha256Url!, /graalvm-community-jdk-21\.0\.2_windows-x64_bin\.zip\.sha256$/);
    assert.equal(parseSha256File(`${SHA('B')}  graalvm.zip\n`), SHA('b'));
    assert.equal(parseSha256File('nothing'), undefined);
  });
  it('has nothing for Java 8, 32-bit or Windows on ARM; never Oracle GraalVM', () => {
    assert.equal(pickGraal(GRAAL_RELEASES, 8, 'windows', 'x64'), undefined);
    assert.equal(pickGraal(GRAAL_RELEASES, 21, 'windows', 'x86'), undefined);
    assert.equal(pickGraal(GRAAL_RELEASES, 25, 'windows', 'aarch64'), undefined);
    assert.ok(!JSON.stringify(pickGraal(GRAAL_RELEASES, 21, 'windows', 'x64')).includes('graalvm-jdk-'));
  });
});

describe('finding a build (no network: answers by URL)', () => {
  const deps = (answers: Record<string, unknown>, texts: Record<string, string> = {}): VendorDeps & { asked: string[] } => {
    const asked: string[] = [];
    return {
      asked,
      getJson: async <T>(url: string) => {
        asked.push(url);
        return (answers[url] ?? []) as T;
      },
      getText: async (url: string) => {
        asked.push(url);
        if (!(url in texts)) throw new Error('404');
        return texts[url];
      },
    };
  };

  it('Temurin, Zulu and GraalVM each come with a SHA-256', async () => {
    const win = hostPlatform('win32', 'x64');
    const temurin = await findBuild('temurin', 21, win, deps({ [adoptiumUrl(21, 'windows', 'x64')]: ADOPTIUM_21_WIN }));
    assert.equal(temurin?.vendor, 'temurin');
    const zulu = await findBuild('zulu', 21, win, deps({ [zuluListUrl(21, 'windows', 'x64')]: ZULU_21_LIST, [zuluPackageUrl('1953be22-1404-4175-8257-0dcb1ac0dffb')]: ZULU_PACKAGE }));
    assert.equal(zulu?.sha256, ZULU_PACKAGE.sha256_hash);
    const sideUrl = pickGraal(GRAAL_RELEASES, 21, 'windows', 'x64')!.sha256Url!;
    const graal = await findBuild('graalvm', 21, win, deps({ [GRAAL_RELEASES_URL]: GRAAL_RELEASES }, { [sideUrl]: SHA('c') }));
    assert.equal(graal?.sha256, SHA('c'));
  });

  it('a Mac with Apple Silicon falls back to the Intel build (Rosetta)', async () => {
    const d = deps({ [adoptiumUrl(8, 'mac', 'x64')]: [{ release_name: 'jdk8u462-b08', binary: { package: { link: 'https://github.com/adoptium/temurin8-binaries/releases/download/x/OpenJDK8U-jre_x64_mac_hotspot.tar.gz', checksum: SHA('d'), size: 1 } } }] });
    const b = await findBuild('temurin', 8, hostPlatform('darwin', 'arm64'), d);
    assert.equal(b?.release, 'jdk8u462-b08');
    assert.deepEqual(d.asked.slice(0, 2), [adoptiumUrl(8, 'mac', 'aarch64'), adoptiumUrl(8, 'mac', 'aarch64', 'jdk')]);
  });

  it('no build: undefined, not an error', async () => {
    assert.equal(await findBuild('graalvm', 8, hostPlatform('win32', 'x64'), deps({ [GRAAL_RELEASES_URL]: GRAAL_RELEASES })), undefined);
    assert.equal(await findBuild('zulu', 21, hostPlatform('win32', 'x64'), deps({})), undefined);
  });
});

describe('falling back to Mojang\'s Java', () => {
  const mojang = async () => '/runtimes/java-runtime-delta/bin/java';

  it('uses the vendor\'s Java when it is there', async () => {
    const notices: string[] = [];
    const c = await resolveJava('temurin', version(21), undefined, (m) => notices.push(m), {
      vendorJava: async (vendor, major) => ({ java: `/runtimes/${vendor}-${major}/bin/java`, release: 'jdk-21' }), mojangJava: mojang,
    });
    assert.deepEqual(c, { java: '/runtimes/temurin-21/bin/java', vendor: 'temurin', release: 'jdk-21' });
    assert.equal(notices.length, 0);
  });

  it('a vendor without a build, or a failed download, still starts the game on Mojang\'s', async () => {
    for (const failure of [new NoJavaBuild('GraalVM Community nie ma Javy 8 dla tego komputera.'), new Error('Serwer api.adoptium.net nie odpowiada.')]) {
      const notices: string[] = [];
      const c = await resolveJava('graalvm', version(), undefined, (m) => notices.push(m), { vendorJava: async () => { throw failure; }, mojangJava: mojang });
      assert.equal(c.vendor, 'mojang');
      assert.equal(c.java, '/runtimes/java-runtime-delta/bin/java');
      assert.equal(notices.length, 1);
      assert.match(notices[0], /Javie od Mojang/);
    }
  });

  it('Mojang\'s choice never asks a vendor', async () => {
    const c = await resolveJava('mojang', version(21), undefined, () => assert.fail('no notice'), { vendorJava: async () => assert.fail('no vendor'), mojangJava: mojang });
    assert.equal(c.vendor, 'mojang');
  });
});

describe('unpacked archives and the disk cleanup', () => {
  it('finds java in <top>/bin and in a macOS bundle', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-java-'));
    await fs.mkdir(path.join(root, 'a', 'jdk-21.0.5+11-jre', 'bin'), { recursive: true });
    await fs.writeFile(path.join(root, 'a', 'jdk-21.0.5+11-jre', 'bin', 'java'), '');
    await fs.mkdir(path.join(root, 'b', 'zulu21.jre', 'Contents', 'Home', 'bin'), { recursive: true });
    await fs.writeFile(path.join(root, 'b', 'zulu21.jre', 'Contents', 'Home', 'bin', 'java'), '');
    assert.equal(await findJavaIn(path.join(root, 'a'), 'java'), path.join(root, 'a', 'jdk-21.0.5+11-jre', 'bin', 'java'));
    assert.equal(await findJavaIn(path.join(root, 'b'), 'java'), path.join(root, 'b', 'zulu21.jre', 'Contents', 'Home', 'bin', 'java'));
    assert.equal(await findJavaIn(path.join(root, 'b'), 'javaw.exe'), undefined);
  });

  it('keeps the vendor\'s Java a profile plays on and offers the rest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-java-'));
    const layout: DiskLayout = {
      root, versions: path.join(root, 'versions'), libraries: path.join(root, 'libraries'), assets: path.join(root, 'assets'), runtimes: path.join(root, 'runtimes'),
      instances: path.join(root, 'instances'), console: path.join(root, 'console'), hudCache: path.join(root, 'hud'), tmp: path.join(root, 'tmp'),
    };
    for (const dir of ['java-runtime-delta', 'temurin-21', 'zulu-21']) {
      await fs.mkdir(path.join(layout.runtimes, dir, 'bin'), { recursive: true });
      await fs.writeFile(path.join(layout.runtimes, dir, 'bin', 'java'), 'java');
    }
    const report = await scanDisk(layout, [{ id: 'p1', name: 'P', gameDir: path.join(layout.instances, 'p1'), gameVersion: '1.21.1', javaComponent: 'java-runtime-delta', javaDir: 'temurin-21', running: false }], 30);
    const runtimes = report.items.filter((i) => i.group === 'runtimes').map((i) => i.id);
    assert.deepEqual(runtimes, ['runtime:zulu-21']);
  });
});

describe('Java comparison', () => {
  const run = (vendor: CompareRun['vendor'], avg: number, low1: number): CompareRun =>
    ({ vendor, java: '', result: { at: 1, version: '26.3', fps: { avg, low1, low01: 0, median: 0, min: 0, max: 0 }, frames: 1, stutters: 0, settings: { renderDistance: 12 } } } as unknown as CompareRun);
  it('shows the change from the current Java to the chosen one', () => {
    const c = compareRuns(run('mojang', 200, 80), run('graalvm', 210, 72));
    assert.equal(c.avgChange, 5);
    assert.equal(c.low1Change, -10);
    assert.equal(c.runs[1].vendor, 'graalvm');
    assert.equal(compareRuns(run('mojang', 0, 0), run('zulu', 10, 10)).avgChange, 0);
  });
});

describe('Java texts in English', () => {
  it('every text of the Java choice has a translation', () => {
    const files = ['src/main/javaVendors.ts', 'src/main/javaCompare.ts', 'src/renderer/javaChoice.ts'];
    const keys = new Set<string>([JAVA_VENDOR_NAMES.mojang]);
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
    const html = readFileSync('src/renderer/index.html', 'utf8');
    for (const k of ['Jak w ustawieniach', 'Własna ścieżka do Javy', 'Porównaj w benchmarku', 'Java dla profili', 'plik java lub javaw']) {
      assert.ok(html.includes(k), k);
      keys.add(k);
    }
    setLang('en');
    const missing = [...keys].filter((k) => !lookup(k));
    setLang('pl');
    assert.deepEqual(missing, []);
  });
});
