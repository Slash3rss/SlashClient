import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  CurseForgeUnavailable, installCurseForgePack, installCurseForgeProject, parseCurseManifest, searchCurseForge, setCurseForgeServer, updateCurseForgePack,
  type CfFile, type CfMod,
} from '../src/main/curseforge';
import { listInstalled } from '../src/main/modrinth';

const sha1 = (b: Buffer) => createHash('sha1').update(b).digest('hex');
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-cf-'));

/** What the fake CurseForge (behind the fake SlashClient server) knows. */
const blobs: Record<string, Buffer> = {
  'jei.jar': Buffer.from('JEI'),
  'lib.jar': Buffer.from('library'),
  'faithful.zip': Buffer.from('resource pack'),
  'new.jar': Buffer.from('new mod'),
};
const mods: CfMod[] = [
  { id: 1, name: 'JEI', slug: 'jei', summary: '', downloadCount: 0, classId: 6, links: { websiteUrl: 'https://www.curseforge.com/minecraft/mc-mods/jei' } },
  { id: 2, name: 'Library', slug: 'lib', summary: '', downloadCount: 0, classId: 6, links: { websiteUrl: 'https://www.curseforge.com/minecraft/mc-mods/lib' } },
  { id: 3, name: 'Kept Mod', slug: 'kept', summary: '', downloadCount: 0, classId: 6, allowModDistribution: false, links: { websiteUrl: 'https://www.curseforge.com/minecraft/mc-mods/kept' } },
  { id: 4, name: 'Faithful', slug: 'faithful', summary: '', downloadCount: 0, classId: 12, links: { websiteUrl: 'https://www.curseforge.com/minecraft/texture-packs/faithful' } },
  { id: 5, name: 'New Mod', slug: 'new', summary: '', downloadCount: 0, classId: 6, links: { websiteUrl: 'https://www.curseforge.com/minecraft/mc-mods/new' } },
];
const file = (id: number, modId: number, name: string, extra: Partial<CfFile> = {}): CfFile => ({
  id, modId, displayName: name, fileName: name, releaseType: 1, fileDate: '2026-01-01T00:00:00Z', fileLength: blobs[name]?.length ?? 1, downloadCount: 0,
  downloadUrl: `https://edge.test/files/${name}`, gameVersions: ['1.20.1', 'Fabric'], hashes: [{ value: sha1(blobs[name] ?? Buffer.from('')), algo: 1 }], dependencies: [], ...extra,
});
let files: CfFile[] = [];
let keyMissing = false;
const asked: string[] = [];

const realFetch = globalThis.fetch;
beforeEach(() => {
  keyMissing = false;
  asked.length = 0;
  files = [
    file(11, 1, 'jei.jar', { dependencies: [{ modId: 2, relationType: 3 }, { modId: 5, relationType: 2 }] }),
    file(21, 2, 'lib.jar'),
    // the author keeps this one on CurseForge: no link
    file(31, 3, 'kept.jar', { downloadUrl: null }),
    file(41, 4, 'faithful.zip'),
    file(51, 5, 'new.jar'),
  ];
  setCurseForgeServer('https://slash.test');
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    asked.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.host === 'edge.test') {
      const blob = blobs[path.basename(url.pathname)];
      return blob ? new Response(new Uint8Array(blob)) : new Response('', { status: 404 });
    }
    assert.equal(url.host, 'slash.test', 'CurseForge is only reached through the SlashClient server');
    if (keyMissing) return Response.json({ error: 'curseforge_unavailable' }, { status: 503 });
    const p = url.pathname.replace('/v1/curseforge', '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (p === '/mods/search') return Response.json({ data: mods, pagination: { totalCount: mods.length } });
    if (p === '/mods') return Response.json({ data: mods.filter((m) => body.modIds.includes(m.id)) });
    if (p === '/mods/files') return Response.json({ data: files.filter((f) => body.fileIds.includes(f.id)) });
    let m = /^\/mods\/(\d+)$/.exec(p);
    if (m) return Response.json({ data: mods.find((x) => x.id === Number(m![1])) });
    m = /^\/mods\/(\d+)\/files$/.exec(p);
    if (m) return Response.json({ data: files.filter((f) => f.modId === Number(m![1])) });
    m = /^\/mods\/(\d+)\/files\/(\d+)$/.exec(p);
    if (m) return Response.json({ data: files.find((f) => f.id === Number(m![2])) });
    return new Response('', { status: 404 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function packZip(dir: string, name: string, list: { projectID: number; fileID: number; required?: boolean }[], extra: (zip: AdmZip) => void = () => {}) {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({
    manifestType: 'minecraftModpack', manifestVersion: 1, name: 'Test CF Pack', version: '1.0',
    minecraft: { version: '1.20.1', modLoaders: [{ id: 'fabric-0.15.7', primary: true }] },
    files: list.map((f) => ({ required: true, ...f })), overrides: 'overrides',
  })));
  zip.addFile('overrides/config/pack.txt', Buffer.from(name));
  extra(zip);
  const out = path.join(dir, `${name}.zip`);
  zip.writeZip(out);
  return out;
}

describe('curseforge manifest', () => {
  it('reads the game version, loader and files of a modpack', () => {
    const m = parseCurseManifest(JSON.stringify({
      manifestType: 'minecraftModpack', name: 'All the Mods', version: '1.2',
      minecraft: { version: '1.20.1', modLoaders: [{ id: 'fabric-0.15.0' }, { id: 'forge-47.2.0', primary: true }] },
      files: [{ projectID: 1, fileID: 11, required: true }, { projectID: 2, fileID: 21, required: false }, { projectID: 'x', fileID: 3 }],
      overrides: 'overrides',
    }));
    assert.equal(m.name, 'All the Mods');
    assert.equal(m.gameVersion, '1.20.1');
    assert.equal(m.loader, 'forge');
    assert.equal(m.loaderVersion, '47.2.0');
    assert.deepEqual(m.files, [{ projectID: 1, fileID: 11, required: true }, { projectID: 2, fileID: 21, required: false }]);
    assert.equal(m.overrides, 'overrides');
  });

  it('understands NeoForge ids with the game version inside, and packs without a loader', () => {
    const neo = parseCurseManifest(JSON.stringify({ manifestType: 'minecraftModpack', minecraft: { version: '1.20.1', modLoaders: [{ id: 'neoforge-1.20.1-47.1.84', primary: true }] } }));
    assert.equal(neo.loader, 'neoforge');
    assert.equal(neo.loaderVersion, '47.1.84');
    const vanilla = parseCurseManifest(JSON.stringify({ manifestType: 'minecraftModpack', minecraft: { version: '1.21.1', modLoaders: [] } }));
    assert.equal(vanilla.loader, 'vanilla');
  });

  it('refuses what is not a CurseForge modpack', () => {
    assert.throws(() => parseCurseManifest('{"formatVersion":1}'), /To nie jest modpack CurseForge/);
    assert.throws(() => parseCurseManifest('not json'), /To nie jest modpack CurseForge/);
  });
});

describe('curseforge modpack install', () => {
  it('installs the files by class, checks them by SHA1, copies overrides and lists the files kept on CurseForge', async () => {
    const dir = await tmp();
    const game = path.join(dir, 'game');
    const zip = await packZip(dir, 'v1', [{ projectID: 1, fileID: 11 }, { projectID: 3, fileID: 31 }, { projectID: 4, fileID: 41 }, { projectID: 2, fileID: 21, required: false }]);
    const info = await installCurseForgePack(zip, game);
    assert.equal(info.loader, 'fabric');
    assert.equal(info.loaderVersion, '0.15.7');
    assert.equal(info.gameVersion, '1.20.1');
    assert.deepEqual(await fs.readdir(path.join(game, 'mods')), ['jei.jar']);
    assert.deepEqual(await fs.readdir(path.join(game, 'resourcepacks')), ['faithful.zip']);
    assert.equal(await fs.readFile(path.join(game, 'config', 'pack.txt'), 'utf8'), 'v1');
    assert.deepEqual(info.manual, [{ title: 'Kept Mod', fileName: 'kept.jar', url: 'https://www.curseforge.com/minecraft/mc-mods/kept/files/31', folder: 'mods' }]);
    // the file without a link is never fetched some other way
    assert.ok(!asked.some((a) => a.includes('kept.jar')));
  });

  it('a file whose SHA1 does not match fails the install', async () => {
    const dir = await tmp();
    files[0].hashes = [{ value: '0'.repeat(40), algo: 1 }];
    const zip = await packZip(dir, 'bad', [{ projectID: 1, fileID: 11 }]);
    await assert.rejects(installCurseForgePack(zip, path.join(dir, 'game')), /SHA1/);
  });

  it('refuses overrides and file names that would escape the game folder', async () => {
    const dir = await tmp();
    const zip = await packZip(dir, 'evil', [], (z) => {
      // AdmZip cleans "../" on add, so the name is set on the entry itself
      z.addFile('overrides/x.txt', Buffer.from('evil'));
      z.getEntry('overrides/x.txt')!.entryName = 'overrides/../../outside.txt';
    });
    await assert.rejects(installCurseForgePack(zip, path.join(dir, 'game')), /Niebezpieczna ścieżka/);
    await assert.rejects(fs.access(path.join(dir, 'outside.txt')));

    // a file name from the API with a path in it lands in mods/ by its base name only
    files[0].fileName = '../../jei.jar';
    const safe = await packZip(dir, 'names', [{ projectID: 1, fileID: 11 }]);
    await installCurseForgePack(safe, path.join(dir, 'game2'));
    assert.deepEqual(await fs.readdir(path.join(dir, 'game2', 'mods')), ['jei.jar']);
  });

  it('an update removes files the new version dropped and keeps the player\'s files', async () => {
    const dir = await tmp();
    const game = path.join(dir, 'game');
    await installCurseForgePack(await packZip(dir, 'v1', [{ projectID: 1, fileID: 11 }, { projectID: 2, fileID: 21 }]), game);
    await fs.mkdir(path.join(game, 'saves', 'World'), { recursive: true });
    await fs.writeFile(path.join(game, 'saves', 'World', 'level.dat'), 'world');
    await updateCurseForgePack(await packZip(dir, 'v2', [{ projectID: 1, fileID: 11 }, { projectID: 5, fileID: 51 }]), game);
    assert.deepEqual((await fs.readdir(path.join(game, 'mods'))).sort(), ['jei.jar', 'new.jar']);
    assert.equal(await fs.readFile(path.join(game, 'config', 'pack.txt'), 'utf8'), 'v2');
    assert.equal(await fs.readFile(path.join(game, 'saves', 'World', 'level.dat'), 'utf8'), 'world');
  });
});

describe('curseforge content', () => {
  it('installs a mod with its required dependencies and tracks them as CurseForge items', async () => {
    const game = await tmp();
    const res = await installCurseForgeProject(game, '1', 'mod', '1.20.1', 'fabric');
    assert.deepEqual(res.installed, ['JEI', 'Library']);
    assert.deepEqual(res.manual, []);
    const items = await listInstalled(game);
    assert.deepEqual(items.map((i) => [i.filename, i.projectId, i.source]), [['jei.jar', '1', 'curseforge'], ['lib.jar', '2', 'curseforge']]);
    assert.ok(asked.some((a) => a.startsWith('GET /v1/curseforge/mods/1/files')));
  });

  it('a file the author keeps on CurseForge comes back as "download manually" with its page', async () => {
    const game = await tmp();
    const res = await installCurseForgeProject(game, '3', 'mod', '1.20.1', 'fabric');
    assert.deepEqual(res.installed, []);
    assert.deepEqual(res.manual, [{ title: 'Kept Mod', fileName: 'kept.jar', url: 'https://www.curseforge.com/minecraft/mc-mods/kept/files/31', folder: 'mods' }]);
    assert.deepEqual(await fs.readdir(path.join(game, 'mods')).catch(() => []), []);
  });

  it('without a key on the server, CurseForge says it is unavailable', async () => {
    keyMissing = true;
    await assert.rejects(searchCurseForge({ query: 'jei', type: 'mod' }), (err) => err instanceof CurseForgeUnavailable);
    keyMissing = false;
    const res = await searchCurseForge({ query: 'jei', type: 'mod', gameVersion: '1.20.1', loader: 'fabric' });
    assert.equal(res.hits[0].title, 'JEI');
    assert.equal(res.hits[2].manualOnly, true);
  });
});
