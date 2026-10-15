import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { DiscordPresence, presenceFromLog } from '../src/main/discord';
import { downloadAll } from '../src/main/download';
import { installMrpack } from '../src/main/modrinth';
import { pingServer } from '../src/main/servers';
import { backupWorld, listWorlds, restoreBackup } from '../src/main/worlds';
import { setLang } from '../src/shared/i18n';
import { levelDat } from './helpers';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-test-'));
const sha1 = (b: Buffer) => createHash('sha1').update(b).digest('hex');

describe('downloadAll', () => {
  const body = Buffer.from('x'.repeat(50_000));
  let server: http.Server;
  let url = '';
  before(async () => {
    server = http.createServer((_req, res) => res.end(body));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/file`;
  });
  after(() => server.close());

  it('downloads, verifies SHA1 and reports bytes', async () => {
    const dir = await tmp();
    let last = { bytes: 0, totalBytes: 0 };
    await downloadAll([{ url, dest: path.join(dir, 'a.bin'), sha1: sha1(body), size: body.length }], (_d, _t, s) => (last = s));
    assert.deepEqual(await fs.readFile(path.join(dir, 'a.bin')), body);
    assert.equal(last.bytes, body.length);
    assert.equal(last.totalBytes, body.length);
  });

  it('rejects a file whose SHA1 does not match and leaves nothing behind', async () => {
    const dir = await tmp();
    await assert.rejects(downloadAll([{ url, dest: path.join(dir, 'b.bin'), sha1: '0'.repeat(40) }]), /SHA1/);
    assert.deepEqual(await fs.readdir(dir), []);
  });
});

describe('modpacks', () => {
  it('refuses files that would escape the game folder', async () => {
    const dir = await tmp();
    const zip = new AdmZip();
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify({
      name: 'Evil', dependencies: { minecraft: '26.3' },
      files: [{ path: '../../outside.txt', hashes: { sha1: '0'.repeat(40) }, downloads: ['https://example.invalid/x'], fileSize: 1 }],
    })));
    const pack = path.join(dir, 'evil.mrpack');
    zip.writeZip(pack);
    setLang('pl');
    await assert.rejects(installMrpack(pack, path.join(dir, 'game')), /Niebezpieczna ścieżka/);
  });
});

describe('worlds', () => {
  it('lists, backs up and restores a world without overwriting it', async () => {
    const dir = await tmp();
    const world = path.join(dir, 'saves', 'Test');
    await fs.mkdir(world, { recursive: true });
    await fs.writeFile(path.join(world, 'level.dat'), levelDat('Testowy', 0));
    await fs.writeFile(path.join(world, 'session.lock'), 'lock');
    const [info] = await listWorlds(dir);
    assert.equal(info.name, 'Testowy');
    const backup = await backupWorld(dir, 'Test');
    const restored = await restoreBackup(dir, path.basename(backup.file));
    assert.notEqual(restored, 'Test');
    assert.deepEqual(await fs.readFile(path.join(dir, 'saves', restored, 'level.dat')), await fs.readFile(path.join(world, 'level.dat')));
    // the lock file is left out of backups
    await assert.rejects(fs.access(path.join(dir, 'saves', restored, 'session.lock')));
  });
});

describe('server list ping', () => {
  it('reads status, MOTD colours and latency from a server', async () => {
    const varint = (v: number) => { const o = []; do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; o.push(b); } while (v); return Buffer.from(o); };
    const packet = (id: number, body: Buffer) => { const p = Buffer.concat([varint(id), body]); return Buffer.concat([varint(p.length), p]); };
    const status = JSON.stringify({ version: { name: '§a26.3', protocol: 775 }, players: { online: 7, max: 100 }, description: { text: '§bSky§fUP', extra: [{ text: '\nline two', color: 'gold' }] } });
    const server = net.createServer((c) => {
      let n = 0;
      c.on('data', (d: Buffer) => {
        n++;
        if (n === 1) c.write(packet(0, Buffer.concat([varint(Buffer.byteLength(status)), Buffer.from(status)])));
        else c.write(packet(1, d.subarray(d.length - 8)));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as net.AddressInfo).port;
    const res = await pingServer(`127.0.0.1:${port}`);
    server.close();
    assert.equal(res.version, '26.3');
    assert.equal(res.playersOnline, 7);
    assert.equal(res.motd[0].map((s) => s.text).join(''), 'SkyUP');
    assert.equal(res.motd[0][0].color, '#55FFFF');
    assert.equal(res.motd[1][0].color, '#FFAA00');
    assert.ok(res.latency >= 0);
  });
});

describe('Discord presence', () => {
  it('reads the game state from log lines', () => {
    setLang('pl');
    assert.deepEqual(presenceFromLog('[x] Connecting to skyup.pl, 25565'), { state: 'Na serwerze skyup.pl' });
    assert.deepEqual(presenceFromLog('[x] Starting integrated minecraft server version 26.3'), { state: 'Gra jednoosobowa' });
    assert.equal(presenceFromLog('[x] something else'), undefined);
  });
  it('fails quietly when Discord is not running', async () => {
    await new DiscordPresence('1', ['/nonexistent/discord-ipc-0']).set({ details: 'x' });
  });
});
