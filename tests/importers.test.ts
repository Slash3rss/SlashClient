import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fromCurseForge, fromLauncherVersion, fromMmcPack, parseCfg, shouldCopy } from '../src/main/importers';

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
});
