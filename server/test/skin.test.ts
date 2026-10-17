import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-skin-'));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const UUID = '0123456789abcdef0123456789abcdef';
let base = '';
let asked = 0;
let app: ReturnType<typeof createApp>;

const fake = (async (url: string | URL) => {
  const u = String(url);
  asked++;
  if (u === `https://sessionserver.mojang.com/session/minecraft/profile/${UUID}`) {
    const value = Buffer.from(JSON.stringify({ textures: { SKIN: { url: 'http://textures.minecraft.net/texture/abc', metadata: { model: 'slim' } } } })).toString('base64');
    return new Response(JSON.stringify({ id: UUID, properties: [{ name: 'textures', value }] }));
  }
  if (u === 'https://textures.minecraft.net/texture/abc') return new Response(PNG);
  return new Response('', { status: 404 });
}) as typeof fetch;

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, fetchImpl: fake });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('skins for the site', () => {
  it('passes the Mojang skin on, says whether it is slim, and keeps it', async () => {
    const res = await fetch(`${base}/v1/skin/01234567-89ab-cdef-0123-456789abcdef`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-skin-model'), 'slim');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
    const before = asked;
    assert.equal((await fetch(`${base}/v1/skin/${UUID}`)).status, 200);
    assert.equal(asked, before);
    assert.equal((await fetch(`${base}/v1/skin/ffffffffffffffffffffffffffffffff`)).status, 404);
  });
});

describe('cosmetics for older launchers', () => {
  it('leaves out what launchers before 0.9.1 have no pictures for, the page and newer ones see all', async () => {
    const ids = async (headers: Record<string, string>) => ((await (await fetch(`${base}/v1/cosmetics`, { headers })).json()) as { items: { id: string }[] }).items.map((i) => i.id);
    const old = await ids({});
    assert.ok(old.includes('aurora') && !old.includes('sakura') && !old.includes('phantom'));
    assert.ok((await ids({ 'X-SlashClient': 'launcher/0.9.1' })).includes('sakura'));
    assert.ok((await ids({ 'User-Agent': 'Mozilla/5.0' })).includes('phantom'));
  });
});
