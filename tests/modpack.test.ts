import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { installMrpack, updateMrpack } from '../src/main/modrinth';

const files: Record<string, Buffer> = { 'a.jar': Buffer.from('mod A'), 'b.jar': Buffer.from('mod B'), 'c.jar': Buffer.from('mod C') };
const sha1 = (b: Buffer) => createHash('sha1').update(b).digest('hex');

describe('modpack update', () => {
  let server: http.Server;
  let base = '';
  before(async () => {
    server = http.createServer((req, res) => res.end(files[path.basename(req.url ?? '')] ?? ''));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  });
  after(() => server.close());

  async function pack(dir: string, name: string, mods: string[], config: string): Promise<string> {
    const zip = new AdmZip();
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify({
      name: 'Test Pack', dependencies: { minecraft: '26.3', 'fabric-loader': '0.19.5' },
      files: mods.map((m) => ({ path: `mods/${m}`, hashes: { sha1: sha1(files[m]) }, downloads: [`https://local.test/${m}`], fileSize: files[m].length })),
    })));
    zip.addFile('overrides/config/pack.txt', Buffer.from(config));
    const file = path.join(dir, name);
    zip.writeZip(file);
    return file;
  }

  it('removes mods the new version dropped, adds new ones and keeps the player\'s files', async () => {
    // route https://local.test/* to the local server
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((url: string | URL, init?: RequestInit) => realFetch(String(url).replace('https://local.test', base), init)) as typeof fetch;
    try {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-pack-'));
      const game = path.join(dir, 'game');
      const v1 = await pack(dir, 'v1.mrpack', ['a.jar', 'b.jar'], 'v1');
      const v2 = await pack(dir, 'v2.mrpack', ['a.jar', 'c.jar'], 'v2');

      await installMrpack(v1, game);
      await fs.mkdir(path.join(game, 'saves', 'World'), { recursive: true });
      await fs.writeFile(path.join(game, 'saves', 'World', 'level.dat'), 'world');

      const info = await updateMrpack(v2, game);
      assert.equal(info.loader, 'fabric');
      assert.deepEqual((await fs.readdir(path.join(game, 'mods'))).sort(), ['a.jar', 'c.jar']);
      assert.equal(await fs.readFile(path.join(game, 'config', 'pack.txt'), 'utf8'), 'v2');
      assert.equal(await fs.readFile(path.join(game, 'saves', 'World', 'level.dat'), 'utf8'), 'world');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
