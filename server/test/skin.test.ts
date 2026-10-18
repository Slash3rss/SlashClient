import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { decodePng } from '../src/png.ts';
import { testSkin } from './png.test.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-skin-'));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const UUID = '0123456789abcdef0123456789abcdef';
const FACE = 'fedcba9876543210fedcba9876543210';
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
  if (u === `https://sessionserver.mojang.com/session/minecraft/profile/${FACE}`) {
    const value = Buffer.from(JSON.stringify({ textures: { SKIN: { url: 'https://textures.minecraft.net/texture/face' } } })).toString('base64');
    return new Response(JSON.stringify({ id: FACE, properties: [{ name: 'textures', value }] }));
  }
  if (u === 'https://textures.minecraft.net/texture/face') return new Response(new Uint8Array(testSkin()));
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

describe('avatars from Minecraft skins', () => {
  it('cuts the face out of the player\'s skin, 64×64', async () => {
    const res = await fetch(`${base}/v1/head/${FACE}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const face = decodePng(Buffer.from(await res.arrayBuffer()));
    assert.equal(face.width, 64);
    assert.deepEqual([...face.rgba.subarray(0, 4)], [20, 40, 220, 255]);
    // a skin that is no picture, or no player: nothing
    assert.equal((await fetch(`${base}/v1/head/${UUID}`)).status, 404);
    assert.equal((await fetch(`${base}/v1/head/ffffffffffffffffffffffffffffffff`)).status, 404);
  });
});

describe('cosmetics for older launchers', () => {
  it('leaves out what older launchers have no pictures for (by their version), the page sees all', async () => {
    const ids = async (headers: Record<string, string>) => ((await (await fetch(`${base}/v1/cosmetics`, { headers })).json()) as { items: { id: string }[] }).items.map((i) => i.id);
    const old = await ids({});
    assert.ok(old.includes('aurora') && !old.includes('sakura') && !old.includes('phantom'));
    const v091 = await ids({ 'X-SlashClient': 'launcher/0.9.1' });
    assert.ok(v091.includes('sakura') && v091.includes('phantom') && !v091.includes('fox') && !v091.includes('vortex'));
    const v092 = await ids({ 'X-SlashClient': 'launcher/0.9.2' });
    assert.ok(v092.includes('sakura') && v092.includes('fox') && v092.includes('vortex'));
    assert.ok((await ids({ 'X-SlashClient': 'launcher/0.10.0' })).includes('fox'));
    // a launcher's own window says Mozilla too: its version still counts
    assert.ok(!(await ids({ 'X-SlashClient': 'launcher/0.9.1', 'User-Agent': 'Mozilla/5.0' })).includes('fox'));
    const page = await ids({ 'User-Agent': 'Mozilla/5.0' });
    assert.ok(page.includes('phantom') && page.includes('fox'));

    // the ranks' capes move from 0.9.4; older launchers have the still picture only
    const frames = async (headers: Record<string, string>) => ((await (await fetch(`${base}/v1/cosmetics`, { headers })).json()) as { items: { id: string; frames?: number }[] }).items
      .find((i) => i.id === 'staff_admin')?.frames;
    assert.equal(await frames({ 'X-SlashClient': 'launcher/0.9.3' }), undefined);
    assert.equal(await frames({ 'X-SlashClient': 'launcher/0.9.4' }), 16);
    assert.equal(await frames({ 'User-Agent': 'Mozilla/5.0' }), 16);
    // the friends' rank and its cape are new in 0.9.4
    assert.ok(!(await ids({ 'X-SlashClient': 'launcher/0.9.3' })).includes('staff_friend'));
    assert.ok((await ids({ 'X-SlashClient': 'launcher/0.9.4' })).includes('staff_friend'));
    // the pink friend's cape is new in 0.9.12
    assert.ok(!(await ids({ 'X-SlashClient': 'launcher/0.9.11' })).includes('staff_friend_pink'));
    assert.ok((await ids({ 'X-SlashClient': 'launcher/0.9.12' })).includes('staff_friend_pink'));
  });
});
