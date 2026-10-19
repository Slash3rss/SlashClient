import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { exportWorld, folderNameFor, importWorldZip, listDatapacks, readWorldZip, removeDatapack, safeEntryName } from '../src/main/worldFiles';
import { levelDat } from './helpers';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-worldzip-'));
const exists = (p: string) => fs.access(p).then(() => true, () => false);

async function gameWithWorld(): Promise<string> {
  const game = await tmp();
  const world = path.join(game, 'saves', 'Moj Swiat');
  await fs.mkdir(path.join(world, 'region'), { recursive: true });
  await fs.writeFile(path.join(world, 'level.dat'), levelDat('Mój świat', 0));
  await fs.writeFile(path.join(world, 'region', 'r.0.0.mca'), 'chunks');
  await fs.writeFile(path.join(world, 'session.lock'), 'lock');
  return game;
}

/** A zip written by hand, entry names exactly as given. */
async function zipOf(entries: Record<string, Buffer | string>): Promise<string> {
  const zip = new AdmZip();
  for (const [i, [name, data]] of Object.entries(entries).entries()) {
    // addFile cleans "../" out of names: set the name afterwards, like a crafted zip would have it
    zip.addFile(`entry${i}`, Buffer.isBuffer(data) ? data : Buffer.from(data));
    zip.getEntry(`entry${i}`)!.entryName = name;
  }
  const file = path.join(await tmp(), 'world.zip');
  zip.writeZip(file);
  return file;
}

describe('world export and import', () => {
  it('exports with the world folder at the root and without session.lock, then imports next to it', async () => {
    const game = await gameWithWorld();
    const out = path.join(await tmp(), 'out.zip');
    assert.ok((await exportWorld(game, 'Moj Swiat', out)) > 0);
    const names = new AdmZip(out).getEntries().map((e) => e.entryName).filter((n) => !n.endsWith('/')).sort();
    assert.deepEqual(names, ['Moj Swiat/level.dat', 'Moj Swiat/region/r.0.0.mca']);

    const summary = (await readWorldZip(out)).summary;
    assert.equal(summary.name, 'Mój świat');
    assert.equal(summary.folder, 'Moj Swiat');
    // the folder is taken already: the import gets a new one and leaves the old world alone
    const folder = await importWorldZip(game, out);
    assert.equal(folder, 'Moj Swiat (2)');
    assert.equal(await fs.readFile(path.join(game, 'saves', folder, 'region', 'r.0.0.mca'), 'utf8'), 'chunks');
    assert.ok(await exists(path.join(game, 'saves', 'Moj Swiat', 'session.lock')));
    assert.deepEqual((await fs.readdir(path.join(game, 'saves'))).filter((n) => n.startsWith('.')), []);
  });

  it('finds a world nested one level down, or at the zip root', async () => {
    const nested = await zipOf({ 'Pobrane/Wyspa/level.dat': levelDat('Wyspa', 1), 'Pobrane/Wyspa/data/x.dat': 'x', 'Pobrane/readme.txt': 'hi', '__MACOSX/Pobrane/Wyspa/level.dat': 'junk' });
    const game = await tmp();
    assert.equal(await importWorldZip(game, nested), 'Wyspa');
    assert.deepEqual((await fs.readdir(path.join(game, 'saves', 'Wyspa'))).sort(), ['data', 'level.dat']);

    const flat = await zipOf({ 'level.dat': levelDat('Flat', 0), 'region/r.0.0.mca': 'c' });
    const folder = await importWorldZip(game, flat);
    // a world at the root takes the zip's name
    assert.equal(folder, 'world');
    assert.ok(await exists(path.join(game, 'saves', 'world', 'region', 'r.0.0.mca')));
  });

  it('refuses zips without a world, with unsafe paths or a broken level.dat', async () => {
    const game = await tmp();
    await assert.rejects(importWorldZip(game, await zipOf({ 'readme.txt': 'no world' })), /level\.dat/);
    await assert.rejects(importWorldZip(game, await zipOf({ 'W/level.dat': levelDat('W', 0), 'W/../../evil.txt': 'x' })), /niebezpieczne|unsafe/);
    await assert.rejects(importWorldZip(game, await zipOf({ 'W/level.dat': 'not nbt' })), /uszkodzony|damaged/);
    assert.equal(await exists(path.join(game, 'evil.txt')), false);
    assert.deepEqual(await fs.readdir(path.join(game, 'saves')).catch(() => []), []);
  });

  it('checks names', () => {
    assert.equal(safeEntryName('World/region/r.0.0.mca'), true);
    for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:/x', 'a\\..\\x', '']) assert.equal(safeEntryName(bad), false, bad);
    assert.equal(folderNameFor('A: world?'), 'A_ world_');
    assert.equal(folderNameFor('..'), 'Świat');
    assert.equal(folderNameFor('CON'), 'Świat');
  });
});

describe('datapacks in a world', () => {
  it('lists zips and folder packs, and removes them', async () => {
    const game = await gameWithWorld();
    const packs = path.join(game, 'saves', 'Moj Swiat', 'datapacks');
    await fs.mkdir(path.join(packs, 'Folder Pack'), { recursive: true });
    await fs.writeFile(path.join(packs, 'Folder Pack', 'pack.mcmeta'), '{}');
    await fs.writeFile(path.join(packs, 'terralith.zip'), 'zip');
    await fs.writeFile(path.join(packs, 'notes.txt'), 'not a pack');
    await fs.mkdir(path.join(game, '.slashclient'), { recursive: true });
    await fs.writeFile(path.join(game, '.slashclient', 'datapacks.json'), JSON.stringify([
      { world: 'Moj Swiat', filename: 'terralith.zip', projectId: 'p', versionId: 'v', versionNumber: '2.5.8', title: 'Terralith' },
    ]));
    const list = await listDatapacks(game, 'Moj Swiat');
    assert.deepEqual(list.map((d) => [d.title, d.folder, d.versionNumber]), [['Folder Pack', true, undefined], ['Terralith', false, '2.5.8']]);
    await removeDatapack(game, 'Moj Swiat', 'terralith.zip');
    await removeDatapack(game, 'Moj Swiat', 'Folder Pack');
    assert.deepEqual(await listDatapacks(game, 'Moj Swiat'), []);
    assert.equal(JSON.parse(await fs.readFile(path.join(game, '.slashclient', 'datapacks.json'), 'utf8')).length, 0);
    await assert.rejects(removeDatapack(game, '..', 'x.zip'));
    await assert.rejects(removeDatapack(game, 'Moj Swiat', '../level.dat'));
  });
});
