import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

/** A servers.dat as the game writes it: an uncompressed root compound with a `servers` list. */
function serversDat(...servers: [name: string, ip: string][]): Buffer {
  const str = (v: string) => { const b = Buffer.from(v); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); return Buffer.concat([l, b]); };
  const tag = (type: number, name: string, payload: Buffer) => Buffer.concat([Buffer.from([type]), str(name), payload]);
  const count = Buffer.alloc(4);
  count.writeInt32BE(servers.length);
  const entries = servers.map(([name, ip]) => Buffer.concat([tag(8, 'name', str(name)), tag(8, 'ip', str(ip)), Buffer.from([0])]));
  const list = Buffer.concat([Buffer.from([servers.length ? 10 : 0]), count, ...entries]);
  return tag(10, '', Buffer.concat([tag(9, 'servers', list), Buffer.from([0])]));
}

/** Two fresh profile folders and an empty shared folder (the module keeps the first test's root). */
async function twoProfiles() {
  process.env.SLASHCLIENT_HOME ??= await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-sync-'));
  const sync = await import('../src/main/sync.js');
  const { paths } = await import('../src/main/paths.js');
  const shared = path.join(paths.root, 'shared');
  await fs.rm(shared, { recursive: true, force: true });
  const dir = await fs.mkdtemp(path.join(paths.root, 'p-'));
  const a = path.join(dir, 'a');
  const b = path.join(dir, 'b');
  await fs.mkdir(a, { recursive: true });
  await fs.mkdir(b, { recursive: true });
  return { ...sync, a, b, shared };
}

describe('shared game settings', () => {
  it('passes options and the server list from one profile to another', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-sync-'));
    // paths are resolved when the module loads, so point it at a temp folder first
    process.env.SLASHCLIENT_HOME = root;
    const { pullShared, pushShared } = await import('../src/main/sync.js');
    const a = path.join(root, 'instances', 'a');
    const b = path.join(root, 'instances', 'b');
    await fs.mkdir(a, { recursive: true });
    await fs.mkdir(b, { recursive: true });

    // nothing shared yet: the first profile keeps its own files
    assert.deepEqual(await pullShared(a), []);
    await fs.writeFile(path.join(a, 'options.txt'), 'fov:0.5\nkey_key.jump:key.keyboard.space\n');
    await fs.writeFile(path.join(a, 'servers.dat'), serversDat(['Hypixel', 'mc.hypixel.net']));
    await pushShared(a);

    // the second profile starts with them
    assert.deepEqual((await pullShared(b)).sort(), ['options.txt', 'servers.dat']);
    assert.equal(await fs.readFile(path.join(b, 'options.txt'), 'utf8'), 'fov:0.5\nkey_key.jump:key.keyboard.space\n');

    // and changes made there come back to the first one; what the second one does not know stays
    await fs.writeFile(path.join(b, 'options.txt'), 'fov:1.0\n');
    await pushShared(b);
    await pullShared(a);
    assert.equal(await fs.readFile(path.join(a, 'options.txt'), 'utf8'), 'fov:1.0\nkey_key.jump:key.keyboard.space\n');
  });

  it("keeps a mod's key bindings when a profile without that mod is played", async () => {
    const { mergeOptions } = await import('../src/main/sync.js');
    const withMod = 'fov:0.5\nkey_key.slashclient-hud.zoom:key.keyboard.c\nkey_key.jump:key.keyboard.space\n';
    // a vanilla profile wrote its options: it knows nothing of the mod's key
    const vanilla = 'fov:0.7\nkey_key.jump:key.keyboard.j\n';
    const shared = mergeOptions(withMod, vanilla);
    assert.equal(shared, 'fov:0.7\nkey_key.jump:key.keyboard.j\nkey_key.slashclient-hud.zoom:key.keyboard.c\n');
    // the modded profile changes its key: that wins next time
    assert.match(mergeOptions(shared, 'key_key.slashclient-hud.zoom:key.keyboard.z\n'), /zoom:key\.keyboard\.z/);
  });

  it('never empties the shared server list with a broken or empty file', async () => {
    const { pullShared, pushShared, readServerList, a, b, shared } = await twoProfiles();
    const good = serversDat(['Hypixel', 'mc.hypixel.net'], ['SkyUp', 'skyup.pl']);
    await fs.writeFile(path.join(a, 'servers.dat'), good);
    await pushShared(a);

    // the game crashed while writing: a 0-byte file, then one cut in half
    await fs.writeFile(path.join(b, 'servers.dat'), '');
    await pushShared(b);
    await fs.writeFile(path.join(b, 'servers.dat'), good.subarray(0, 20));
    await pushShared(b);
    // a list that lost every server does not wipe the others' either
    await fs.writeFile(path.join(b, 'servers.dat'), serversDat());
    await pushShared(b);
    assert.deepEqual(await fs.readFile(path.join(shared, 'servers.dat')), good);

    // and the shared list goes back into the profile that lost it
    assert.ok((await pullShared(b)).includes('servers.dat'));
    assert.equal(readServerList(await fs.readFile(path.join(b, 'servers.dat')))?.entries.length, 2);
  });

  it('keeps the previous shared list as a backup when it changes', async () => {
    const { pushShared, a, shared } = await twoProfiles();
    const first = serversDat(['Hypixel', 'mc.hypixel.net']);
    await fs.writeFile(path.join(a, 'servers.dat'), first);
    await pushShared(a);
    await fs.writeFile(path.join(a, 'servers.dat'), serversDat(['SkyUp', 'skyup.pl']));
    await pushShared(a);
    assert.deepEqual(await fs.readFile(path.join(shared, 'servers.dat.bak')), first);
  });

  it('keeps the servers added in two synced profiles played at the same time', async () => {
    const { pullShared, pushShared, readServerList, a, b, shared } = await twoProfiles();
    await fs.writeFile(path.join(a, 'servers.dat'), serversDat(['Hypixel', 'mc.hypixel.net']));
    await pushShared(a);
    await pullShared(b);
    const startedB = Date.now() - 1000;
    // a closes first with a new server; b, started before that, closes with another one
    await fs.writeFile(path.join(a, 'servers.dat'), serversDat(['Hypixel', 'mc.hypixel.net'], ['SkyUp', 'skyup.pl']));
    await pushShared(a, Date.now() - 2000);
    await fs.writeFile(path.join(b, 'servers.dat'), serversDat(['Hypixel', 'mc.hypixel.net'], ['Wynn', 'play.wynncraft.com']));
    await pushShared(b, startedB);
    const list = readServerList(await fs.readFile(path.join(shared, 'servers.dat')));
    assert.deepEqual(list?.entries.map((e) => e.ip), ['mc.hypixel.net', 'play.wynncraft.com', 'skyup.pl']);
  });

  it('skips a hotbar file that is not NBT', async () => {
    const { pushShared, a, shared } = await twoProfiles();
    await fs.writeFile(path.join(a, 'hotbar.nbt'), 'garbage');
    await pushShared(a);
    await assert.rejects(fs.stat(path.join(shared, 'hotbar.nbt')));
  });
});
