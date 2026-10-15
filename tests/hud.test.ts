import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { hudVersions, syncHud } from '../src/main/hud';

/** A mod jar with just a fabric.mod.json. */
function fabricJar(id: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('fabric.mod.json', Buffer.from(JSON.stringify({ schemaVersion: 1, id, version: '1.0.0' })));
  return zip.toBuffer();
}

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-hud-'));
  const bundle = path.join(root, 'bundle');
  const game = path.join(root, 'game');
  await fs.mkdir(bundle);
  await fs.mkdir(path.join(game, 'mods'), { recursive: true });
  await fs.writeFile(path.join(bundle, 'slashclient-hud-26.3.jar'), fabricJar('slashclient-hud'));
  return { root, bundle, game, mods: path.join(game, 'mods') };
}

describe('SlashClient HUD', () => {
  it('knows its versions from the bundled jars', async () => {
    const { root, bundle } = await setup();
    assert.deepEqual(await hudVersions(bundle), ['26.3']);
    await fs.rm(root, { recursive: true });
  });

  it('puts the matching jar in, replaces old ones and asks for Fabric API', async () => {
    const { root, bundle, game, mods } = await setup();
    await fs.writeFile(path.join(mods, 'slashclient-hud-26.2.jar'), 'old');
    const plan = await syncHud(bundle, game, { enabled: true, loader: 'fabric', gameVersion: '26.3' });
    assert.deepEqual(plan, { active: true, needsFabricApi: true });
    assert.deepEqual(await fs.readdir(mods), ['slashclient-hud-26.3.jar']);

    await fs.writeFile(path.join(mods, 'fabric-api-0.162.0.jar'), fabricJar('fabric-api'));
    assert.equal((await syncHud(bundle, game, { enabled: true, loader: 'fabric', gameVersion: '26.3' })).needsFabricApi, false);
    await fs.rm(root, { recursive: true });
  });

  it('takes it out when switched off, on other loaders and on versions it does not support', async () => {
    for (const opts of [
      { enabled: false, loader: 'fabric', gameVersion: '26.3' },
      { enabled: true, loader: 'neoforge', gameVersion: '26.3' },
      { enabled: true, loader: 'fabric', gameVersion: '1.21.4' },
    ]) {
      const { root, bundle, game, mods } = await setup();
      await fs.writeFile(path.join(mods, 'slashclient-hud-26.3.jar'), 'x');
      await fs.writeFile(path.join(mods, 'sodium.jar'), 'keep');
      assert.deepEqual(await syncHud(bundle, game, opts), { active: false, needsFabricApi: false });
      assert.deepEqual(await fs.readdir(mods), ['sodium.jar']);
      await fs.rm(root, { recursive: true });
    }
  });
});
