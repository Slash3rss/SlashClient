import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { installMrpack } from '../src/main/modrinth';
import {
  applySettings, countParts, DEFAULT_PARTS, includePath, manualFilesOf, partOf, PROFILE_FILE, readPackSummary, settingsOf, uniqueName, writeProfilePack,
  type LinkResolver,
} from '../src/main/profilePack';
import { newProfile } from '../src/main/store';

const hash = (algo: string, b: Buffer | string) => createHash(algo).update(b).digest('hex');
const jars: Record<string, Buffer> = {
  'linked.jar': Buffer.from('mod from Modrinth'),
  'own.jar': Buffer.from('mod made by hand'),
  'byhand.jar': Buffer.from('mod kept on CurseForge'),
};

/** A profile folder with a bit of everything. */
async function gameFolder(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-profile-'));
  const write = async (rel: string, data: string | Buffer) => {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), data);
  };
  for (const [name, data] of Object.entries(jars)) await write(`mods/${name}`, data);
  await write('mods/off.jar.disabled', 'disabled mod');
  await write('resourcepacks/Faithful.zip', 'zipped pack');
  await write('resourcepacks/Folder Pack/pack.mcmeta', '{"pack":{}}');
  await write('shaderpacks/Complementary.zip', 'shader');
  await write('config/sodium.json', '{"fog":false}');
  await write('options.txt', 'fov:90');
  await write('servers.dat', 'servers');
  await write('saves/World/level.dat', 'world');
  await write('logs/latest.log', 'log');
  await write('.slashclient/icon.png', 'png');
  return dir;
}

/** Modrinth knows linked.jar, CurseForge keeps byhand.jar on its site. */
const resolver: LinkResolver = async (files) => {
  const links = new Map<string, string>();
  const manual = new Map();
  for (const f of files) {
    if (f.filename === 'linked.jar') links.set(f.sha1, 'https://local.test/linked.jar');
    if (f.filename === 'byhand.jar') manual.set(f.sha1, { title: 'By Hand', fileName: 'byhand.jar', url: 'https://www.curseforge.com/minecraft/mc-mods/by-hand/files/1', folder: 'mods' });
  }
  return { links, manual };
};

async function exportTo(game: string, parts = DEFAULT_PARTS): Promise<string> {
  const out = path.join(game, '..', `${path.basename(game)}.mrpack`);
  const profile = newProfile({ name: 'Mój profil', loader: 'fabric', icon: 'custom', memoryMb: 6144, jvmArgs: '-Dx=1', javaPath: '/secret/java', accountId: 'acc' });
  await writeProfilePack({
    gameDir: game, out, name: profile.name, gameVersion: '1.21.1', loader: 'fabric', loaderVersion: '0.16.5', parts, settings: settingsOf(profile), resolve: resolver,
  });
  return out;
}

describe('profile pack', () => {
  it('sorts paths into parts', () => {
    assert.equal(partOf('mods/a.jar'), 'mods');
    assert.equal(partOf('saves/World/level.dat'), 'worlds');
    assert.equal(partOf('options.txt'), 'options');
    assert.equal(partOf('optionsof.txt'), 'options');
    assert.equal(partOf('servers.dat'), 'servers');
    assert.equal(partOf('config/x.json'), 'config');
    assert.equal(partOf('kubejs/startup.js'), 'config');
    assert.equal(partOf('.slashclient/icon.png'), 'settings');
  });

  it('counts what a profile has', async () => {
    const counts = await countParts(await gameFolder());
    assert.deepEqual(counts, { mods: 3, resourcepacks: 2, shaderpacks: 1, config: 1, options: 1, servers: 1, worlds: 1, settings: 1 });
  });

  it('links known mods, lists CurseForge-only ones, packs the rest and leaves out worlds and machine settings', async () => {
    const game = await gameFolder();
    const zip = new AdmZip(await exportTo(game));
    const index = JSON.parse(zip.readAsText('modrinth.index.json'));
    assert.equal(index.formatVersion, 1);
    assert.deepEqual(index.dependencies, { minecraft: '1.21.1', 'fabric-loader': '0.16.5' });
    assert.equal(index.files.length, 1);
    assert.deepEqual(index.files[0], {
      path: 'mods/linked.jar', hashes: { sha1: hash('sha1', jars['linked.jar']), sha512: hash('sha512', jars['linked.jar']) },
      env: { client: 'required', server: 'required' }, downloads: ['https://local.test/linked.jar'], fileSize: jars['linked.jar'].length,
    });
    const names = zip.getEntries().map((e) => e.entryName).filter((n) => !n.endsWith('/')).sort();
    assert.deepEqual(names, [
      'modrinth.index.json',
      'overrides/.slashclient/icon.png',
      'overrides/config/sodium.json',
      'overrides/mods/own.jar',
      'overrides/options.txt',
      'overrides/resourcepacks/Faithful.zip',
      'overrides/resourcepacks/Folder Pack/pack.mcmeta',
      'overrides/servers.dat',
      'overrides/shaderpacks/Complementary.zip',
      PROFILE_FILE,
    ]);
    const settings = JSON.parse(zip.readAsText(PROFILE_FILE));
    assert.equal(settings.name, 'Mój profil');
    assert.equal(settings.memoryMb, 6144);
    assert.equal(settings.javaPath, undefined);
    assert.equal(settings.accountId, undefined);
    assert.equal(settings.gameDir, undefined);
    assert.deepEqual(settings.manualFiles.map((f: { fileName: string }) => f.fileName), ['byhand.jar']);
  });

  it('writes only the parts the player ticked', async () => {
    const game = await gameFolder();
    const zip = new AdmZip(await exportTo(game, ['mods', 'worlds']));
    const names = zip.getEntries().map((e) => e.entryName).filter((n) => !n.endsWith('/')).sort();
    assert.deepEqual(names, ['modrinth.index.json', 'overrides/mods/own.jar', 'overrides/saves/World/level.dat']);
  });

  it('summarises a pack before importing', async () => {
    const summary = readPackSummary(await exportTo(await gameFolder()));
    assert.equal(summary.kind, 'mrpack');
    assert.equal(summary.name, 'Mój profil');
    assert.equal(summary.gameVersion, '1.21.1');
    assert.equal(summary.loader, 'fabric');
    assert.equal(summary.loaderVersion, '0.16.5');
    assert.equal(summary.linked, 1);
    assert.equal(summary.manual, 1);
    assert.deepEqual(summary.parts, { mods: 2, settings: 1, config: 1, options: 1, resourcepacks: 2, servers: 1, shaderpacks: 1 });
  });

  it('reads a plain .mrpack from elsewhere', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-mrpack-'));
    const zip = new AdmZip();
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify({
      formatVersion: 1, game: 'minecraft', name: 'Other Pack', dependencies: { minecraft: '1.20.1', forge: '47.3.0' },
      files: [{ path: 'mods/x.jar', hashes: { sha1: 'a' }, downloads: ['https://cdn.modrinth.com/x.jar'], fileSize: 1 }, { path: 'mods/server.jar', env: { client: 'unsupported' }, hashes: { sha1: 'b' }, downloads: [], fileSize: 1 }],
    })));
    zip.addFile('overrides/config/a.toml', Buffer.from('a'));
    const file = path.join(dir, 'other.mrpack');
    zip.writeZip(file);
    const summary = readPackSummary(file);
    assert.equal(summary.name, 'Other Pack');
    assert.equal(summary.loader, 'forge');
    assert.equal(summary.settings, undefined);
    assert.deepEqual(summary.parts, { mods: 1, config: 1 });
  });

  it('takes only valid settings from a pack', () => {
    const profile = newProfile({ name: 'Old', memoryMb: 4096 });
    applySettings(profile, { name: 'New', memoryMb: 8192, width: 1, icon: '../../evil', jvmPreset: 'nope', hud: false, gameDir: '/etc', javaPath: '/bin/sh', loader: 'forge' });
    assert.equal(profile.name, 'New');
    assert.equal(profile.memoryMb, 8192);
    assert.equal(profile.width, newProfile().width);
    assert.equal(profile.icon, '');
    assert.equal(profile.jvmPreset, newProfile().jvmPreset);
    assert.equal(profile.hud, false);
    assert.equal(profile.gameDir, '');
    assert.equal(profile.javaPath, '');
    assert.equal(profile.loader, newProfile().loader);
    applySettings(profile, { icon: 'block:grass-block' });
    assert.equal(profile.icon, 'block:grass-block');
  });

  it('keeps "newest stable loader" while the index pins a version', async () => {
    const file = await exportTo(await gameFolder());
    const zip = new AdmZip(file);
    assert.equal(JSON.parse(zip.readAsText('modrinth.index.json')).dependencies['fabric-loader'], '0.16.5');
    assert.equal(JSON.parse(zip.readAsText(PROFILE_FILE)).loaderVersion, '');
    // what the import does: the index's loader first, then the settings
    const profile = newProfile({ loader: 'fabric', loaderVersion: '0.16.5' });
    applySettings(profile, readPackSummary(file).settings);
    assert.equal(profile.loaderVersion, '');
    // a profile pinned to a version stays pinned
    const pinned = newProfile({ loader: 'fabric', loaderVersion: '0.16.5' });
    applySettings(pinned, { ...settingsOf(newProfile({ loader: 'fabric', loaderVersion: '0.16.5' })) });
    assert.equal(pinned.loaderVersion, '0.16.5');
    // settings for another loader don't touch it
    const forge = newProfile({ loader: 'forge', loaderVersion: '47.3.0' });
    applySettings(forge, { loader: 'fabric', loaderVersion: '' });
    assert.equal(forge.loaderVersion, '47.3.0');
  });

  it('gives an imported profile a name no other profile has', () => {
    assert.equal(uniqueName('Test eksport', ['Inny']), 'Test eksport');
    assert.equal(uniqueName('Test eksport', ['Test eksport']), 'Test eksport (2)');
    assert.equal(uniqueName('Test eksport', ['test eksport', 'Test eksport (2)']), 'Test eksport (3)');
    const long = 'x'.repeat(40);
    assert.equal(uniqueName(long, [long]), `${'x'.repeat(36)} (2)`);
  });

  it('keeps only safe hand-download entries', () => {
    const files = manualFilesOf({ manualFiles: [
      { title: 'Ok', fileName: 'ok.jar', url: 'https://www.curseforge.com/minecraft/mc-mods/ok/files/1', folder: 'mods' },
      { title: 'Path', fileName: '../ok.jar', url: 'https://www.curseforge.com/x', folder: 'mods' },
      { title: 'Link', fileName: 'x.jar', url: 'https://evil.example/x', folder: 'mods' },
      { title: 'Folder', fileName: 'x.jar', url: 'https://www.curseforge.com/x', folder: '../..' },
    ] });
    assert.deepEqual(files.map((f) => f.title), ['Ok']);
  });

  it('keeps a hand-download entry\'s SHA-1 and size, and turns an old file page link into the download link', () => {
    const sha1 = 'A'.repeat(40);
    const [withHash, bad] = manualFilesOf({ manualFiles: [
      { title: 'Ok', fileName: 'ok.jar', url: 'https://www.curseforge.com/minecraft/mc-mods/ok/files/12', folder: 'mods', sha1, size: 123 },
      { title: 'Bad', fileName: 'bad.jar', url: 'https://www.curseforge.com/minecraft/mc-mods/bad/download/3', folder: 'mods', sha1: 'nope', size: -1 },
    ] });
    assert.deepEqual(withHash, { title: 'Ok', fileName: 'ok.jar', url: 'https://www.curseforge.com/minecraft/mc-mods/ok/download/12', folder: 'mods', sha1: 'a'.repeat(40), size: 123 });
    assert.deepEqual(bad, { title: 'Bad', fileName: 'bad.jar', url: 'https://www.curseforge.com/minecraft/mc-mods/bad/download/3', folder: 'mods' });
  });
});

describe('profile pack round trip', () => {
  let server: http.Server;
  let base = '';
  before(async () => {
    server = http.createServer((req, res) => res.end(jars[path.basename(req.url ?? '')] ?? ''));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  });
  after(() => server.close());

  it('imports an exported profile into a new folder, with the parts the player kept', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((url: string | URL, init?: RequestInit) => realFetch(String(url).replace('https://local.test', base), init)) as typeof fetch;
    try {
      const file = await exportTo(await gameFolder());
      const game = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-imported-'));
      const parts = DEFAULT_PARTS.filter((p) => p !== 'config');
      const info = await installMrpack(file, game, undefined, includePath(parts));
      assert.equal(info.gameVersion, '1.21.1');
      assert.equal(info.loader, 'fabric');
      assert.equal(info.loaderVersion, '0.16.5');
      // the linked mod is downloaded (and checked against its hash), the own one comes from the file
      assert.deepEqual((await fs.readdir(path.join(game, 'mods'))).sort(), ['linked.jar', 'own.jar']);
      assert.deepEqual(await fs.readFile(path.join(game, 'mods', 'linked.jar')), jars['linked.jar']);
      assert.equal(await fs.readFile(path.join(game, 'options.txt'), 'utf8'), 'fov:90');
      assert.equal(await fs.readFile(path.join(game, 'resourcepacks', 'Folder Pack', 'pack.mcmeta'), 'utf8'), '{"pack":{}}');
      assert.equal(await fs.readFile(path.join(game, '.slashclient', 'icon.png'), 'utf8'), 'png');
      // unticked
      await assert.rejects(fs.access(path.join(game, 'config')));

      const profile = newProfile();
      applySettings(profile, readPackSummary(file).settings);
      assert.equal(profile.name, 'Mój profil');
      assert.equal(profile.memoryMb, 6144);
      assert.equal(profile.jvmArgs, '-Dx=1');
      assert.equal(profile.icon, 'custom');
      assert.equal(profile.javaPath, '');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
