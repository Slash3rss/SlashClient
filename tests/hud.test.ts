import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { hudVersions, syncHud } from '../src/main/hud';
import { decodeHud, encodeHud, exportHud, importHud } from '../src/main/hudShare';
import { setLang } from '../src/shared/i18n';

setLang('pl');

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

describe('HUD share codes', () => {
  // made by the mod itself (ShareCode.java) during the in-game test
  const fromMod = 'SCHUD1:lZRNb9swDIb_SqBTgiWDncQLlksLDOhOAwZkt7oH2qZt1ZZpSHJT5-O_T1KXwMkQNDpZovSI5GuSeyYo62pUbL1nees-2EBSY8bWWnY4ZfDO1sHXwCz6f4vMWObmY_bz45S1vCl8uXBlwNTf38I6TIlk5o0urUvVor3uR66WlkT5hvImGl2hwUCfGnqUyhd1EiWcBPqSTqQMes39WadSzYtS-5LfrFcFupOgOTW--MpVRE1pdYMM__s9s0ERChQke2_UiaxQqdsR34adzpjnmGrlDTuhQZqoP0ejq3wDg3KN4lOv4bXXmQ1Zgyzwjv8bXVZG4FpPJHQ3uTiVsvUqEdLybnR2wVbYKy2pwju6ProcUDZqQW8osNG-sFHL5lyC_gOJcf28Zw3YnmKPzPQ1aI2ysXa2b3haHdmLTbNA80IOtcLj9Az8_nVFjB_4ZLwtuZlIUo00jXrqDmqHbbrDQxw_C1XE8cthFndBsMDRw1jg4RUmcZyY0ySXJEZxvP2yngyc2pSOZqvxXf-g2pbWLDRDBNKqkNQ156zthU0JGW1Plh2RGK6fINWWX1ptrGEjiHR5upJ3dZ3IjzHhUjVDg7ZPXOJ572QzE0hpEHbQf4CpJKVK4OZpMxg7lZFmA-s56jBchvPv4eBow3fm8Whg-Qmtbf6_';

  it('reads codes made in the game', () => {
    const settings = decodeHud(fromMod);
    assert.equal((settings.modules as Record<string, { enabled: boolean }>).fps.enabled, true);
    assert.ok(Array.isArray(settings.chatTabs));
  });

  it('round-trips and refuses things that are not codes', () => {
    const json = JSON.stringify({ modules: { fps: { enabled: false, ax: 0, ay: 0, dx: 2, dy: 2 } }, chatTabs: [] });
    assert.deepEqual(decodeHud(encodeHud(json)), JSON.parse(json));
    assert.throws(() => decodeHud('hello'), /nie jest kod/);
    assert.throws(() => decodeHud('SCHUD1:@@@'), /uszkodzony/);
    assert.throws(() => decodeHud(encodeHud('[1,2]')), /uszkodzony/);
  });

  it('copies settings between profiles through a code', async () => {
    const a = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-hud-a-'));
    const b = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-hud-b-'));
    await assert.rejects(exportHud(a), /nie ma jeszcze ustawień/);
    await importHud(a, fromMod);
    await importHud(b, await exportHud(a));
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(b, 'config', 'slashclient-hud.json'), 'utf8')), decodeHud(fromMod));
    await fs.rm(a, { recursive: true });
    await fs.rm(b, { recursive: true });
  });
});
