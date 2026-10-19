import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { applySnapshot, createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from '../src/main/snapshots';
import { newProfile } from '../src/main/store';

async function write(root: string, rel: string, data: string) {
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), data);
}
const read = (root: string, rel: string) => fs.readFile(path.join(root, rel), 'utf8');
const exists = (p: string) => fs.access(p).then(() => true, () => false);

async function setup() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-snap-'));
  const game = path.join(base, 'game');
  const dir = path.join(base, 'snapshots', 'profile');
  await write(game, 'mods/a.jar', 'a v1');
  await write(game, 'mods/b.jar', 'b v1');
  await write(game, 'mods/off.jar.disabled', 'off');
  await write(game, 'config/a.json', '{"v":1}');
  await write(game, 'config/sub/deep.toml', 'x=1');
  await write(game, '.slashclient/content.json', '[]');
  await write(game, 'saves/World/level.dat', 'world');
  const profile = newProfile({
    name: 'Pack', versionId: '1.21.1', loader: 'fabric', loaderVersion: '0.16.5',
    modpack: { projectId: 'p', versionId: 'v1', versionNumber: '1.0', title: 'Pack' },
  });
  return { base, game, dir, profile };
}

describe('profile snapshots', () => {
  it('restores mods and config exactly, and the modpack version', async () => {
    const { game, dir, profile } = await setup();
    const snap = await createSnapshot({ dir, gameDir: game, profile, reason: 'update', label: '1.0 → 2.0' });
    assert.equal(snap.files, 6);
    assert.ok(snap.sizeBytes > 0);
    // the update: one mod changed, one removed, one added, config changed and added, the loader moved on
    await write(game, 'mods/a.jar', 'a v2');
    await fs.rm(path.join(game, 'mods/b.jar'));
    await write(game, 'mods/new.jar', 'new');
    await write(game, 'config/a.json', '{"v":2}');
    await write(game, 'config/added.json', '{}');
    await write(game, '.slashclient/modpack-files.json', '["mods/new.jar"]');
    Object.assign(profile, { versionId: '1.21.4', loaderVersion: '0.17.0', modpack: { ...profile.modpack!, versionId: 'v2', versionNumber: '2.0' } });

    const info = await restoreSnapshot(dir, snap.id, game);
    applySnapshot(profile, info);
    assert.deepEqual((await fs.readdir(path.join(game, 'mods'))).sort(), ['a.jar', 'b.jar', 'off.jar.disabled']);
    assert.equal(await read(game, 'mods/a.jar'), 'a v1');
    assert.equal(await read(game, 'config/a.json'), '{"v":1}');
    assert.equal(await read(game, 'config/sub/deep.toml'), 'x=1');
    assert.equal(await exists(path.join(game, 'config/added.json')), false);
    // a file the snapshot did not have is gone as well
    assert.equal(await exists(path.join(game, '.slashclient/modpack-files.json')), false);
    // worlds are not part of a snapshot
    assert.equal(await read(game, 'saves/World/level.dat'), 'world');
    assert.equal(profile.versionId, '1.21.1');
    assert.equal(profile.loaderVersion, '0.16.5');
    assert.equal(profile.modpack?.versionNumber, '1.0');
    // nothing left over from the swap
    assert.deepEqual((await fs.readdir(path.join(game, '.slashclient'))).filter((n) => n.startsWith('restore-')), []);
  });

  it('keeps only the newest snapshots and deletes on request', async () => {
    const { game, dir, profile } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await createSnapshot({ dir, gameDir: game, profile, reason: 'manual', keep: 3, now: 1_700_000_000_000 + i * 1000 })).id);
    const list = await listSnapshots(dir);
    assert.deepEqual(list.map((s) => s.id), [ids[3], ids[2], ids[1]]);
    await deleteSnapshot(dir, ids[2]);
    assert.deepEqual((await listSnapshots(dir)).map((s) => s.id), [ids[3], ids[1]]);
  });

  it('refuses ids that are paths', async () => {
    const { game, dir } = await setup();
    await assert.rejects(restoreSnapshot(dir, '../game', game));
    await assert.rejects(deleteSnapshot(dir, '..'));
  });

  it('a profile without mods or config still gets a snapshot that restores to empty', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-snap-'));
    const game = path.join(base, 'game');
    const dir = path.join(base, 'snaps');
    const snap = await createSnapshot({ dir, gameDir: game, profile: newProfile({}), reason: 'manual' });
    assert.equal(snap.files, 0);
    await write(game, 'mods/later.jar', 'x');
    await restoreSnapshot(dir, snap.id, game);
    assert.equal(await exists(path.join(game, 'mods')), false);
  });
});
