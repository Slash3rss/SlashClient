import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { cachedJson } from '../src/main/jsonCache';
import { installedLoaderProfile, loaderProfileId } from '../src/main/loaders';

describe('what the Play click keeps on disk', () => {
  it('asks the internet at most every few hours, and uses the last copy offline', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-meta-'));
    let asked = 0;
    let offline = false;
    let now = 1_000_000;
    const deps = {
      dir, now: () => now,
      fetch: async () => {
        asked++;
        if (offline) throw new Error('offline');
        return { n: asked };
      },
    };
    assert.deepEqual(await cachedJson('https://x/list', 'list', 60_000, deps), { n: 1 });
    now += 30_000;
    assert.deepEqual(await cachedJson('https://x/list', 'list', 60_000, deps), { n: 1 });
    assert.equal(asked, 1);
    // older than allowed: asked again
    now += 40_000;
    assert.deepEqual(await cachedJson('https://x/list', 'list', 60_000, deps), { n: 2 });
    // no network: the copy, however old
    offline = true;
    now += 10 * 60_000;
    assert.deepEqual(await cachedJson('https://x/list', 'list', 60_000, deps), { n: 2 });
    // no network and no copy: the error
    await assert.rejects(cachedJson('https://x/other', 'other', 60_000, deps), /offline/);
    // a broken copy counts as none
    await fs.writeFile(path.join(dir, 'broken.json'), '{"at": 5, "da');
    await assert.rejects(cachedJson('https://x/broken', 'broken', 60_000, deps), /offline/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reuses a Fabric or Quilt profile only when it is whole', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-loader-'));
    const file = (id: string) => path.join(dir, `${id}.json`);
    const id = loaderProfileId('fabric', '1.21.4', '0.16.10');
    assert.equal(id, 'fabric-loader-0.16.10-1.21.4');
    // not there: fetched
    assert.equal(await installedLoaderProfile('fabric', '1.21.4', '0.16.10', file), undefined);
    const profile = { id, inheritsFrom: '1.21.4', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
      libraries: [{ name: 'org.ow2.asm:asm:9.7.1' }, { name: 'net.fabricmc:fabric-loader:0.16.10' }] };
    await fs.writeFile(file(id), JSON.stringify(profile));
    assert.equal(await installedLoaderProfile('fabric', '1.21.4', '0.16.10', file), id);
    // cut short by a crash while writing
    await fs.writeFile(file(id), JSON.stringify(profile).slice(0, 60));
    assert.equal(await installedLoaderProfile('fabric', '1.21.4', '0.16.10', file), undefined);
    // something else under that name (another game version, no loader library)
    await fs.writeFile(file(id), JSON.stringify({ ...profile, inheritsFrom: '1.21.3' }));
    assert.equal(await installedLoaderProfile('fabric', '1.21.4', '0.16.10', file), undefined);
    await fs.writeFile(file(id), JSON.stringify({ ...profile, libraries: [{ name: 'org.ow2.asm:asm:9.7.1' }] }));
    assert.equal(await installedLoaderProfile('fabric', '1.21.4', '0.16.10', file), undefined);
    const quilt = loaderProfileId('quilt', '1.21.4', '0.28.0');
    await fs.writeFile(file(quilt), JSON.stringify({ id: quilt, inheritsFrom: '1.21.4', mainClass: 'org.quiltmc.loader.impl.launch.knot.KnotClient', libraries: [{ name: 'org.quiltmc:quilt-loader:0.28.0' }] }));
    assert.equal(await installedLoaderProfile('quilt', '1.21.4', '0.28.0', file), quilt);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
