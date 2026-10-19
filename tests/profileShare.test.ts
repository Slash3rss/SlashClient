import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { readPackSummary, writeProfilePack, type LinkResolver } from '../src/main/profilePack';
import { downloadShare, findSecrets, formatCode, normalizeCode, scanSecrets, shareInfo, uploadShare } from '../src/main/profileShare';

const noLinks: LinkResolver = async () => ({ links: new Map(), manual: new Map() });

async function gameFolder(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-share-'));
  const write = async (rel: string, data: string) => {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), data);
  };
  await write('mods/own.jar', 'jar');
  await write('config/sodium.json', '{"fog": false, "quality": "high"}');
  await write('config/discord-bot.json', '{\n  "botToken": "MTE2NzY5.abcdefghijk.lmnopq",\n  "channel": 123\n}');
  await write('config/rcon.properties', 'rcon.port=25575\nrcon.password=hunter22\n');
  await write('config/chat.toml', 'apiKey = ""\ntokenCount = 5\n');
  await write('config/.hidden/secret.json', '{"password": "skipped-hidden"}');
  await write('options.txt', 'fov:90\nchatModPassword:abc12345');
  return dir;
}

describe('profile codes', () => {
  it('reads codes the way players type and paste them', () => {
    assert.equal(normalizeCode('abcd-efgh'), 'ABCDEFGH');
    assert.equal(normalizeCode('  ABCD EFGH '), 'ABCDEFGH');
    assert.equal(normalizeCode('Mój profil: ABCD-EFGH, baw się dobrze'), 'ABCDEFGH');
    assert.equal(normalizeCode('ABCD-EFG0'), undefined);
    assert.equal(normalizeCode('ABC'), undefined);
    assert.equal(normalizeCode(undefined), undefined);
    assert.equal(formatCode('ABCDEFGH'), 'ABCD-EFGH');
  });
});

describe('secrets in shared files', () => {
  it('finds settings that look like passwords and tokens, not harmless ones', () => {
    assert.deepEqual(findSecrets('{"botToken": "MTE2NzY5.abcdefghijk"}'), ['botToken']);
    assert.deepEqual(findSecrets('rcon.password=hunter22'), ['rcon.password']);
    assert.deepEqual(findSecrets('client_secret: "s3cr3t-value"'), ['client_secret']);
    assert.deepEqual(findSecrets('apiKey = ""\ntokenCount = 5\npassword = false\npassword = "changeme"'), []);
    assert.deepEqual(findSecrets('{"fog": false, "quality": "high"}'), []);
    assert.deepEqual(findSecrets('url = "https://discord.com/api/webhooks/123456/abc-DEF_ghi"'), ['webhook URL']);
  });

  it('searches only the files the chosen parts would send', async () => {
    const game = await gameFolder();
    const config = await scanSecrets(game, ['mods', 'config']);
    assert.deepEqual(config.map((h) => h.rel).sort(), ['config/discord-bot.json', 'config/rcon.properties']);
    assert.deepEqual(config.find((h) => h.rel === 'config/rcon.properties')?.keys, ['rcon.password']);
    // options.txt only when the player ticks game settings
    assert.deepEqual((await scanSecrets(game, ['options'])).map((h) => h.rel), ['options.txt']);
    assert.deepEqual(await scanSecrets(game, ['mods']), []);
  });

  it('leaves files the player unticked out of the pack', async () => {
    const game = await gameFolder();
    const out = path.join(game, '..', `${path.basename(game)}.mrpack`);
    await writeProfilePack({
      gameDir: game, out, name: 'P', gameVersion: '1.21.1', loader: 'fabric', loaderVersion: '0.16.5', parts: ['mods', 'config'], resolve: noLinks,
      skip: ['config/discord-bot.json', 'config/rcon.properties'],
    });
    const names = new AdmZip(out).getEntries().map((e) => e.entryName).filter((n) => !n.endsWith('/')).sort();
    assert.deepEqual(names, ['modrinth.index.json', 'overrides/config/chat.toml', 'overrides/config/sodium.json', 'overrides/mods/own.jar']);
  });
});

describe('sending and getting a pack by code', () => {
  let server: http.Server;
  let base = '';
  const kept = new Map<string, Buffer>();
  const seen: { auth?: string; client?: string; query?: string }[] = [];

  before(async () => {
    // stands in for the SlashClient server's /v1/profile-shares
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      seen.push({ auth: req.headers.authorization, client: String(req.headers['x-slashclient'] ?? ''), query: url.search });
      const json = (status: number, body: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
      if (req.method === 'POST') {
        if (req.headers.authorization !== 'Bearer good') return json(401, { error: 'unauthorized' });
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c);
        kept.set('ABCDEFGH', Buffer.concat(chunks));
        return json(200, { share: { code: 'ABCDEFGH', name: url.searchParams.get('name'), size: Buffer.concat(chunks).length, expiresAt: Date.now() + 1000 } });
      }
      const m = /^\/v1\/profile-shares\/(\w+)(\/file)?$/.exec(url.pathname);
      const data = m && kept.get(m[1]);
      if (!data) return json(404, { error: 'not_found' });
      if (m[2]) return res.writeHead(200, { 'Content-Length': data.length }).end(data);
      return json(200, { share: { code: m[1], ownerHandle: 'Ktos', expiresAt: Date.now() + 1000 } });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  it('uploads with the session and downloads the same pack without one', async () => {
    const game = await gameFolder();
    const out = path.join(game, '..', `${path.basename(game)}-up.mrpack`);
    await writeProfilePack({ gameDir: game, out, name: 'Wspólny', gameVersion: '1.21.1', loader: 'fabric', loaderVersion: '0.16.5', parts: ['mods'], resolve: noLinks });

    await assert.rejects(uploadShare({ server: base, token: 'bad', file: out, name: 'Wspólny', gameVersion: '1.21.1', loader: 'fabric' }), /Zaloguj się/);
    const share = await uploadShare({ server: base, token: 'good', file: out, name: 'Wspólny', gameVersion: '1.21.1', loader: 'fabric' });
    assert.equal(share.code, 'ABCDEFGH');
    assert.equal(share.name, 'Wspólny');
    assert.equal(seen.at(-1)?.auth, 'Bearer good');
    assert.match(seen.at(-1)?.client ?? '', /^launcher\//);

    assert.equal((await shareInfo(base, 'ABCDEFGH')).ownerHandle, 'Ktos');
    const back = path.join(game, '..', `${path.basename(game)}-down.mrpack`);
    await downloadShare(base, 'ABCDEFGH', back);
    assert.equal(seen.at(-1)?.auth, undefined);
    assert.deepEqual(await fs.readFile(back), await fs.readFile(out));
    assert.equal(readPackSummary(back).gameVersion, '1.21.1');
    await assert.rejects(shareInfo(base, 'ZZZZZZZZ'), /Nie ma takiego kodu/);
  });
});
