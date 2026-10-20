import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import AdmZip from 'adm-zip';
import {
  canWrite, cleanupWinUpdate, downloadVerified, findUninstallKey, parseManifest, pickWinArtifact, psQuote, stageWinUpdate,
  startSwap, swapScript, unpackZip, winArg, winInstall, workDirs, type WinInstall, type WinManifest,
} from '../src/main/winUpdate';

const WINDOWS = process.platform === 'win32';
const sha = (b: Buffer) => createHash('sha512').update(b).digest('base64');
const MANIFEST: WinManifest = {
  version: '0.9.91',
  electronVersion: '44.7.2',
  full: { url: 'SlashClient-0.9.91-win.zip', sha512: 'f'.repeat(88), size: 190_000_000 },
  app: { url: 'SlashClient-0.9.91-win-app.zip', sha512: 'a'.repeat(88), size: 40_000_000 },
};

async function tmp(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/** A fake installation: the executable, Electron's files, resources and the NSIS uninstaller. */
async function fakeInstall(root: string, version: string): Promise<WinInstall> {
  const dir = path.join(root, 'Programs', 'Slash Client – zażółć');
  await fs.mkdir(path.join(dir, 'resources'), { recursive: true });
  await fs.mkdir(path.join(dir, 'locales'), { recursive: true });
  await fs.writeFile(path.join(dir, 'SlashClient.exe'), `exe ${version}`);
  await fs.writeFile(path.join(dir, 'ffmpeg.dll'), `dll ${version}`);
  await fs.writeFile(path.join(dir, 'locales', 'pl.pak'), 'pl');
  await fs.writeFile(path.join(dir, 'resources', 'app.asar'), `asar ${version}`);
  await fs.writeFile(path.join(dir, 'Uninstall SlashClient.exe'), 'uninstaller');
  return { dir, exe: path.join(dir, 'SlashClient.exe'), uninstaller: 'Uninstall SlashClient.exe', registryKey: 'HKCU:\\Software\\SlashClient-none' };
}

describe('Windows updates in place', () => {
  it('reads only a release description for this version', () => {
    assert.deepEqual(parseManifest(MANIFEST, '0.9.91'), MANIFEST);
    assert.equal(parseManifest(MANIFEST, '0.9.92'), undefined);
    assert.equal(parseManifest({ ...MANIFEST, full: { url: '../x.zip', sha512: 'f'.repeat(88) } }, '0.9.91'), undefined);
    assert.equal(parseManifest({ ...MANIFEST, app: { url: 'x.exe', sha512: 'a'.repeat(88) } }, '0.9.91'), undefined);
    assert.equal(parseManifest(null, '0.9.91'), undefined);
    const { app: _, ...noApp } = MANIFEST;
    assert.ok(parseManifest(noApp, '0.9.91'));
  });

  it('downloads only the app when Electron has not changed', () => {
    assert.deepEqual(pickWinArtifact(MANIFEST, '44.7.2'), { file: MANIFEST.app, appOnly: true });
    assert.deepEqual(pickWinArtifact(MANIFEST, '44.7.1'), { file: MANIFEST.full, appOnly: false });
    assert.deepEqual(pickWinArtifact({ ...MANIFEST, app: undefined }, '44.7.2'), { file: MANIFEST.full, appOnly: false });
    assert.deepEqual(pickWinArtifact({ ...MANIFEST, electronVersion: undefined }, '44.7.2'), { file: MANIFEST.full, appOnly: false });
  });

  it('finds the installation’s entry in "Apps"', () => {
    const dir = 'C:\\Users\\Łukasz Ż\\AppData\\Local\\Programs\\SlashClient';
    const entries = [
      { key: 'Other', uninstallString: '"C:\\Program Files\\Other\\uninst.exe" /S' },
      { key: 'NoString' },
      { key: 'a1b2c3d4-0000-5000-8000-123456789abc', uninstallString: `"${dir}\\Uninstall SlashClient.exe" /currentuser` },
    ];
    assert.equal(findUninstallKey(entries, `${dir}\\Uninstall SlashClient.exe`), 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\a1b2c3d4-0000-5000-8000-123456789abc');
    // the same path in other letters' case
    assert.ok(findUninstallKey(entries, `${dir.toUpperCase()}\\uninstall slashclient.exe`));
    // another installation of the launcher is not this one
    assert.equal(findUninstallKey(entries, 'D:\\Gry\\SlashClient\\Uninstall SlashClient.exe'), undefined);
    // a key name that could break out of the script's string is ignored
    assert.equal(findUninstallKey([{ key: "x'; rm", uninstallString: `"${dir}\\Uninstall SlashClient.exe"` }], `${dir}\\Uninstall SlashClient.exe`), undefined);
  });

  it('updates in place only an installation it may write to, with its "Apps" entry', async () => {
    const root = await tmp('slash-wininst-');
    const install = await fakeInstall(root, '1');
    const entries = async () => [{ key: 'guid-1', uninstallString: `"${path.join(install.dir, install.uninstaller)}" /currentuser` }];
    const found = await winInstall(install.exe, entries);
    assert.equal(typeof found, 'object');
    assert.equal((found as WinInstall).registryKey, 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\guid-1');
    // installed for all users: no entry of the current user
    assert.equal(typeof (await winInstall(install.exe, async () => [])), 'string');
    // not installed by the installer (a development run, an unpacked copy)
    await fs.rm(path.join(install.dir, install.uninstaller));
    assert.equal(typeof (await winInstall(install.exe, entries)), 'string');
    assert.equal(await canWrite(install.dir), true);
    assert.equal(await canWrite(path.join(root, 'missing')), false);
    await fs.rm(root, { recursive: true });
  });

  it('checks the download against the release’s SHA-512', async () => {
    const body = Buffer.alloc(300_000, 7);
    const server = createServer((_req, res) => res.end(body));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/x.zip`;
    const root = await tmp('slash-windl-');
    const seen: number[] = [];
    await downloadVerified(url, { url: 'x.zip', sha512: sha(body), size: body.length }, path.join(root, 'a.zip'), (p) => seen.push(p));
    assert.deepEqual(await fs.readFile(path.join(root, 'a.zip')), body);
    assert.equal(seen.at(-1), 100);
    await assert.rejects(downloadVerified(url, { url: 'x.zip', sha512: sha(Buffer.from('other')) }, path.join(root, 'b.zip'), () => {}), /suma kontrolna/);
    server.close();
    await fs.rm(root, { recursive: true });
  });

  it('stages the whole new version, or the installed one with new resources', async () => {
    const root = await tmp('slash-winstage-');
    const install = await fakeInstall(root, '1');
    // the whole app (as electron-builder zips win-unpacked: no folder on top, no uninstaller)
    const full = new AdmZip();
    full.addFile('SlashClient.exe', Buffer.from('exe 2'));
    full.addFile('ffmpeg.dll', Buffer.from('dll 2'));
    full.addFile('resources/app.asar', Buffer.from('asar 2'));
    full.writeZip(path.join(root, 'full.zip'));
    const next = await stageWinUpdate(install, path.join(root, 'full.zip'), false);
    assert.equal(next, `${install.dir}.new`);
    assert.equal(await fs.readFile(path.join(next, 'SlashClient.exe'), 'utf8'), 'exe 2');
    assert.equal(await fs.readFile(path.join(next, 'Uninstall SlashClient.exe'), 'utf8'), 'uninstaller');
    // a file only the old version had does not come along
    await assert.rejects(fs.access(path.join(next, 'locales', 'pl.pak')));
    // only the resources folder: everything else is the installed version's
    const app = new AdmZip();
    app.addFile('resources/app.asar', Buffer.from('asar 3'));
    app.writeZip(path.join(root, 'app.zip'));
    await stageWinUpdate(install, path.join(root, 'app.zip'), true);
    assert.equal(await fs.readFile(path.join(next, 'resources', 'app.asar'), 'utf8'), 'asar 3');
    assert.equal(await fs.readFile(path.join(next, 'SlashClient.exe'), 'utf8'), 'exe 1');
    assert.equal(await fs.readFile(path.join(next, 'locales', 'pl.pak'), 'utf8'), 'pl');
    // the installed folder is untouched
    assert.equal(await fs.readFile(path.join(install.dir, 'resources', 'app.asar'), 'utf8'), 'asar 1');
    // a zip without the app is refused
    const empty = new AdmZip();
    empty.addFile('readme.txt', Buffer.from('x'));
    empty.writeZip(path.join(root, 'empty.zip'));
    await assert.rejects(stageWinUpdate(install, path.join(root, 'empty.zip'), false), /SlashClient\.exe/);
    // what an update leaves behind goes at the next start
    for (const d of Object.values(workDirs(install.dir))) await fs.mkdir(d, { recursive: true });
    await cleanupWinUpdate(install.dir);
    for (const d of Object.values(workDirs(install.dir))) await assert.rejects(fs.access(d));
    await fs.access(install.dir);
    await fs.rm(root, { recursive: true });
  });

  it('refuses entries that would land outside the folder', async () => {
    const root = await tmp('slash-winslip-');
    const zip = new AdmZip();
    zip.addFile('ok.txt', Buffer.from('x'));
    zip.writeZip(path.join(root, 'evil.zip'));
    // AdmZip cleans names it adds, so the bad one is written into the archive afterwards
    const raw = await fs.readFile(path.join(root, 'evil.zip'));
    await fs.writeFile(path.join(root, 'evil.zip'), Buffer.from(raw.toString('latin1').replaceAll('ok.txt', '../a.t'), 'latin1'));
    await assert.rejects(unpackZip(path.join(root, 'evil.zip'), path.join(root, 'out')), /zła ścieżka/);
    await assert.rejects(fs.access(path.join(root, 'a.t')));
    await fs.rm(root, { recursive: true });
  });

  it('quotes paths for PowerShell and arguments for Windows programs', () => {
    assert.equal(psQuote("C:\\Users\\O'Brien\\Zażółć gęślą"), "'C:\\Users\\O''Brien\\Zażółć gęślą'");
    assert.equal(psQuote('a\u2019b'), "'a\u2019\u2019b'");
    assert.equal(winArg('--user-data-dir=C:\\a b\\'), '"--user-data-dir=C:\\a b\\\\"');
    assert.equal(winArg('plain'), 'plain');
    assert.equal(winArg('say "hi"'), '"say \\"hi\\""');
    assert.equal(winArg(''), '""');
  });

  it('writes a script that waits for the launcher, swaps, and can roll back', () => {
    const install: WinInstall = { dir: "C:\\Users\\Łu'kasz\\Programs\\SlashClient", exe: "C:\\Users\\Łu'kasz\\Programs\\SlashClient\\SlashClient.exe", uninstaller: 'Uninstall SlashClient.exe', registryKey: 'HKCU:\\Software\\X' };
    const script = swapScript({ pid: 4242, install, next: `${install.dir}.new`, version: '0.9.91', log: 'C:\\logs\\update.log', relaunch: ['--user-data-dir=C:\\x y'] });
    assert.match(script, /Wait-Process -Id 4242 -Timeout 60/);
    assert.ok(script.includes("$dir = 'C:\\Users\\Łu''kasz\\Programs\\SlashClient'"));
    assert.match(script, /Move-Item -LiteralPath \$old -Destination \$dir/);
    assert.match(script, /Set-ItemProperty -LiteralPath \$key -Name DisplayVersion -Value \$version/);
    assert.ok(script.includes(`-ArgumentList '"--user-data-dir=C:\\x y"'`));
    assert.doesNotMatch(swapScript({ pid: 1, install, next: 'n', version: 'v', log: 'l', relaunch: null }), /Start-Process/);
  });
});

/** Runs the swap script for real (Windows PowerShell), in a temporary folder with a Polish name. */
describe('Windows update swap script', { skip: !WINDOWS }, () => {
  const KEY = `HKCU:\\Software\\SlashClient-update-test-${process.pid}`;
  const ps = (command: string) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' }).trim();
  const run = async (script: string, dir: string) => {
    const file = path.join(dir, 'swap.ps1');
    await fs.writeFile(file, `\uFEFF${script}`, 'utf8');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { stdio: 'ignore' });
  };

  it('waits for the launcher, swaps the folders and updates the shown version', async () => {
    const root = await tmp('slash-swap-');
    const install = { ...(await fakeInstall(root, '1')), registryKey: KEY };
    ps(`New-Item -Path '${KEY}' -Force | Out-Null; Set-ItemProperty -LiteralPath '${KEY}' -Name DisplayVersion -Value '0.9.90'`);
    const next = `${install.dir}.new`;
    await fs.mkdir(path.join(next, 'resources'), { recursive: true });
    await fs.writeFile(path.join(next, 'SlashClient.exe'), 'exe 2');
    await fs.writeFile(path.join(next, 'resources', 'app.asar'), 'asar 2');
    const log = path.join(root, 'logi', 'update.log');
    await fs.mkdir(path.dirname(log));
    // a process that lives a little longer stands for the launcher
    const launcher = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1500)']);
    const started = Date.now();
    await run(swapScript({ pid: launcher.pid!, install, next, version: '0.9.91', log, relaunch: null, retries: 3 }), root);
    assert.ok(Date.now() - started >= 1000, 'the script waited for the launcher');
    assert.equal(await fs.readFile(install.exe, 'utf8'), 'exe 2');
    // the zip has no uninstaller: the installed one comes along
    assert.equal(await fs.readFile(path.join(install.dir, install.uninstaller), 'utf8'), 'uninstaller');
    await assert.rejects(fs.access(next));
    await assert.rejects(fs.access(`${install.dir}.old`));
    assert.equal(ps(`(Get-ItemProperty -LiteralPath '${KEY}').DisplayVersion`), '0.9.91');
    assert.match(await fs.readFile(log, 'utf8'), /zaktualizowano do 0\.9\.91/);
    ps(`Remove-Item -LiteralPath '${KEY}' -Recurse -Force`);
    await fs.rm(root, { recursive: true });
  });

  it('starts the script in the background, in its own console', async () => {
    const root = await tmp('slash-swapstart-');
    const install = await fakeInstall(root, '1');
    const next = `${install.dir}.new`;
    await fs.mkdir(next, { recursive: true });
    await fs.writeFile(path.join(next, 'SlashClient.exe'), 'exe 2');
    const log = path.join(root, 'logi', 'update.log');
    const launcher = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 500)']);
    startSwap({ pid: launcher.pid!, install, next, version: '0.9.91', log, relaunch: null, retries: 3 });
    for (let i = 0; i < 100 && !(await fs.readFile(log, 'utf8').catch(() => '')).includes('zaktualizowano'); i++) await new Promise((r) => setTimeout(r, 200));
    assert.equal(await fs.readFile(install.exe, 'utf8'), 'exe 2');
    await new Promise((r) => setTimeout(r, 1500));
    // the script cleans up after itself, its own folder too
    await assert.rejects(fs.access(`${install.dir}.old`));
    await assert.rejects(fs.access(workDirs(install.dir).download));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  });

  it('puts the old version back when the new one cannot be moved in', async () => {
    const root = await tmp('slash-swapfail-');
    const install = await fakeInstall(root, '1');
    const next = `${install.dir}.new`;
    await fs.mkdir(next, { recursive: true });
    await fs.writeFile(path.join(next, 'SlashClient.exe'), 'exe 2');
    const log = path.join(root, 'update.log');
    // a file of the new version held open without sharing (as a scanner might): the folder cannot be renamed
    const lock = spawn('powershell.exe', ['-NoProfile', '-Command', `$f = [IO.File]::Open('${path.join(next, 'SlashClient.exe').replace(/'/g, "''")}', 'Open', 'Read', 'None'); Write-Output locked; Start-Sleep 30`]);
    await new Promise<void>((r) => lock.stdout.once('data', () => r()));
    try {
      await run(swapScript({ pid: 999_999, install, next, version: '0.9.91', log, relaunch: null, retries: 2, waitSeconds: 1 }), root);
    } finally {
      lock.kill();
    }
    assert.equal(await fs.readFile(install.exe, 'utf8'), 'exe 1');
    assert.equal(await fs.readFile(path.join(install.dir, 'resources', 'app.asar'), 'utf8'), 'asar 1');
    await assert.rejects(fs.access(`${install.dir}.old`));
    const text = await fs.readFile(log, 'utf8');
    assert.match(text, /wycofywanie/);
    assert.match(text, /przywrócono poprzednią wersję/);
    await new Promise((r) => setTimeout(r, 300));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  });

  it('leaves everything as it was when the installed folder is in use', async () => {
    const root = await tmp('slash-swapbusy-');
    const install = await fakeInstall(root, '1');
    const next = `${install.dir}.new`;
    await fs.mkdir(next, { recursive: true });
    await fs.writeFile(path.join(next, 'SlashClient.exe'), 'exe 2');
    const log = path.join(root, 'update.log');
    const lock = spawn('powershell.exe', ['-NoProfile', '-Command', `$f = [IO.File]::Open('${path.join(install.dir, 'ffmpeg.dll').replace(/'/g, "''")}', 'Open', 'Read', 'None'); Write-Output locked; Start-Sleep 30`]);
    await new Promise<void>((r) => lock.stdout.once('data', () => r()));
    try {
      await run(swapScript({ pid: 999_999, install, next, version: '0.9.91', log, relaunch: null, retries: 2, waitSeconds: 1 }), root);
    } finally {
      lock.kill();
    }
    assert.equal(await fs.readFile(install.exe, 'utf8'), 'exe 1');
    assert.equal(await fs.readFile(path.join(next, 'SlashClient.exe'), 'utf8'), 'exe 2');
    assert.match(await fs.readFile(log, 'utf8'), /bez zmian/);
    await new Promise((r) => setTimeout(r, 300));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  });
});
