import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('the list of profiles is never lost', () => {
  it('keeps an unreadable list aside, takes the last good copy, and finds profiles on disk again', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-store-'));
    // paths are resolved when the module loads, so point it at a temp folder first
    process.env.SLASHCLIENT_HOME = root;
    const store = await import('../src/main/store.js');
    const config = path.join(root, 'config');
    const file = path.join(config, 'launcher.json');

    // two saves: the second keeps the first as the backup
    const first = await store.loadStore();
    const modded = store.newProfile({ id: 'mod-profile', name: 'Mody', versionId: '1.21.4', loader: 'fabric' });
    first.profiles = [modded];
    await store.saveStore(first);
    first.profiles[0].name = 'Mody 2';
    await store.saveStore(first);
    assert.equal(JSON.parse(await fs.readFile(`${file}.bak`, 'utf8')).profiles[0].name, 'Mody');

    // the list broken (a half-written or locked file): the backup comes back, the broken file is kept
    await fs.writeFile(file, '{ "profiles": [ broken');
    const back = await store.loadStore();
    assert.equal(back.profiles[0].id, 'mod-profile');
    assert.ok((await fs.readdir(config)).some((n) => n.startsWith('launcher.json.broken-')));
    assert.equal(store.storeRecovered, false, 'no instances folder yet');

    // a profile's folder with a game but no entry on the list: found again, from the same folder,
    // with the version and loader of its last game
    const lost = path.join(root, 'instances', 'lost-one');
    await fs.mkdir(path.join(lost, 'mods'), { recursive: true });
    await fs.mkdir(path.join(lost, 'logs'), { recursive: true });
    await fs.writeFile(path.join(lost, 'logs', 'latest.log'), '[12:00:00] [main/INFO]: Loading Minecraft 1.21.4 with Fabric Loader 0.16.10\n');
    // an empty folder is no profile
    await fs.mkdir(path.join(root, 'instances', 'empty'), { recursive: true });
    await fs.mkdir(path.join(root, 'instances', 'mod-profile', 'mods'), { recursive: true });
    const found = await store.orphanProfiles(back.profiles);
    assert.deepEqual(found.map((p) => [p.id, p.versionId, p.loader, p.loaderVersion]), [['lost-one', '1.21.4', 'fabric', '0.16.10']]);
    assert.equal(store.profileGameDir(found[0]), lost);

    await fs.rm(root, { recursive: true, force: true });
  });
});
