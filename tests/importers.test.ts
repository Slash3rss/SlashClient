import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { copyInstance, fromCurseForge, fromDawnProfile, fromFeatherVersion, fromLauncherVersion, fromMmcPack, instanceFromFolder, isClientMod, parseCfg, shouldCopy } from '../src/main/importers';

describe('importing other launchers', () => {
  it('reads Prism/MultiMC instances', () => {
    assert.deepEqual(parseCfg('[General]\nname=My pack\niconKey=flame\n'), { name: 'My pack', iconKey: 'flame' });
    assert.deepEqual(fromMmcPack({ components: [{ uid: 'net.minecraft', version: '1.21.4' }, { uid: 'net.fabricmc.fabric-loader', version: '0.16.9' }] }),
      { versionId: '1.21.4', loader: 'fabric', loaderVersion: '0.16.9' });
    assert.deepEqual(fromMmcPack({ components: [{ uid: 'net.minecraft', version: '1.20.1' }, { uid: 'net.minecraftforge', version: '47.3.0' }] }),
      { versionId: '1.20.1', loader: 'forge', loaderVersion: '47.3.0' });
    assert.equal(fromMmcPack({ components: [{ uid: 'net.minecraft', cachedVersion: '1.8.9' }] }).loader, 'vanilla');
  });
  it('reads CurseForge instances', () => {
    assert.deepEqual(fromCurseForge({ gameVersion: '1.20.1', baseModLoader: { name: 'forge-47.3.0', minecraftVersion: '1.20.1' } }),
      { versionId: '1.20.1', loader: 'forge', loaderVersion: '47.3.0' });
    assert.deepEqual(fromCurseForge({ baseModLoader: { name: 'neoforge-1.21.1-21.1.77', minecraftVersion: '1.21.1' } }),
      { versionId: '1.21.1', loader: 'neoforge', loaderVersion: '21.1.77' });
    assert.equal(fromCurseForge({ gameVersion: '1.21.4' }).loader, 'vanilla');
  });
  it('reads official launcher version ids', () => {
    assert.deepEqual(fromLauncherVersion('fabric-loader-0.16.9-1.21.4'), { versionId: '1.21.4', loader: 'fabric', loaderVersion: '0.16.9' });
    assert.deepEqual(fromLauncherVersion('1.20.1-forge-47.3.0'), { versionId: '1.20.1', loader: 'forge', loaderVersion: '47.3.0' });
    assert.deepEqual(fromLauncherVersion('neoforge-21.1.77', '1.21.1'), { versionId: '1.21.1', loader: 'neoforge', loaderVersion: '21.1.77' });
    assert.deepEqual(fromLauncherVersion('latest-release'), { versionId: 'latest-release', loader: 'vanilla', loaderVersion: '' });
  });
  it('copies only player files from a shared .minecraft', () => {
    assert.equal(shouldCopy('saves', true), true);
    assert.equal(shouldCopy('versions', true), false);
    assert.equal(shouldCopy('libraries', true), false);
    assert.equal(shouldCopy('kubejs', false), true);
    assert.equal(shouldCopy('logs', false), false);
  });

  it('reads Dawn profiles and Feather versions', () => {
    assert.deepEqual(fromDawnProfile({ profile: { name: 'Dawn Fabric 26.3', minecraftVersion: '26.3', loader: { kind: 'Fabric', version: '0.19.5' } } }),
      { name: 'Dawn Fabric 26.3', versionId: '26.3', loader: 'fabric', loaderVersion: '0.19.5' });
    assert.equal(fromDawnProfile({ profile: { minecraftVersion: '1.20.1', loader: { kind: 'NeoForge', version: '20.1' } } }).loader, 'neoforge');
    assert.deepEqual(fromDawnProfile({ profile: { minecraftVersion: '1.8.9', loader: { kind: 'Vanilla' } } }), { name: '', versionId: '1.8.9', loader: 'vanilla', loaderVersion: '' });
    assert.deepEqual(fromFeatherVersion('1.21.4-fabric'), { versionId: '1.21.4', loader: 'fabric' });
    assert.deepEqual(fromFeatherVersion('1.8.9'), { versionId: '1.8.9', loader: 'vanilla' });
    assert.ok(isClientMod('dawn-client.jar') && isClientMod('feather-client-1.21.jar') && !isClientMod('sodium.jar'));
    assert.equal(shouldCopy('.dawn', false), false);
    assert.equal(shouldCopy('content-index.json', false), false);
  });

  it("copies a Dawn profile without Dawn's own mod, with its synced settings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dawn-'));
    const profile = path.join(root, 'profiles', 'dawn-fabric-26-3');
    const game = path.join(profile, 'private-game-content');
    await fs.mkdir(path.join(game, 'mods'), { recursive: true });
    await fs.mkdir(path.join(root, 'auto-sync', 'groups', 'default', 'config'), { recursive: true });
    await fs.mkdir(path.join(profile, '.dawn'), { recursive: true });
    await fs.writeFile(path.join(profile, 'profile.json'), JSON.stringify({ schemaVersion: 4, profile: { id: 'dawn-fabric-26-3', name: 'Dawn Fabric 26.3', minecraftVersion: '26.3', loader: { kind: 'Fabric', version: '0.19.5' }, settings: { autoSyncMembership: { kind: 'Member', groupId: 'default' } } } }));
    await fs.writeFile(path.join(profile, 'dawn-managed-client-mods.json'), JSON.stringify({ schemaVersion: 1, mods: [{ fileName: 'dawn-client.jar' }] }));
    await fs.writeFile(path.join(game, 'mods', 'dawn-client.jar'), 'x');
    await fs.writeFile(path.join(game, 'mods', 'fabric-api.jar'), 'x');
    await fs.writeFile(path.join(game, 'options.txt'), 'fov:0.5');
    await fs.writeFile(path.join(root, 'auto-sync', 'groups', 'default', 'options.txt'), 'fov:0.9');
    await fs.writeFile(path.join(root, 'auto-sync', 'groups', 'default', 'config', 'sodium-options.json'), '{}');
    const found = await instanceFromFolder(root);
    assert.equal(found.length, 1);
    assert.deepEqual([found[0].source, found[0].name, found[0].versionId, found[0].loader, found[0].mods], ['dawn', 'Dawn Fabric 26.3', '26.3', 'fabric', 1]);
    const dest = path.join(root, 'out');
    await copyInstance(found[0], dest);
    assert.deepEqual((await fs.readdir(path.join(dest, 'mods'))).sort(), ['fabric-api.jar']);
    // the profile's own options win over the synced ones
    assert.equal(await fs.readFile(path.join(dest, 'options.txt'), 'utf8'), 'fov:0.5');
    assert.ok(await fs.stat(path.join(dest, 'config', 'sodium-options.json')));
    await fs.rm(root, { recursive: true, force: true });
  });

  it("copies a Feather version: the shared .minecraft without its mods, Feather's own mods for the version", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'feather-'));
    const mc = path.join(root, 'mc');
    await fs.mkdir(path.join(mc, 'mods'), { recursive: true });
    await fs.mkdir(path.join(mc, 'saves', 'World'), { recursive: true });
    await fs.writeFile(path.join(mc, 'mods', 'official-only.jar'), 'x');
    await fs.mkdir(path.join(root, 'user-mods', '1.21.4-fabric'), { recursive: true });
    await fs.writeFile(path.join(root, 'user-mods', '1.21.4-fabric', 'xaero.jar'), 'x');
    await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify({ mcPath: mc }));
    const found = (await instanceFromFolder(root)).filter((i) => i.source === 'feather');
    assert.deepEqual(found.map((i) => [i.name, i.versionId, i.loader, i.mods]), [['Feather 1.21.4', '1.21.4', 'fabric', 1]]);
    const dest = path.join(root, 'out');
    await copyInstance(found[0], dest);
    assert.deepEqual(await fs.readdir(path.join(dest, 'mods')), ['xaero.jar']);
    assert.ok(await fs.stat(path.join(dest, 'saves', 'World')));
    await fs.rm(root, { recursive: true, force: true });
  });
});
