import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-downloads-'));
let base = '';
let app: ReturnType<typeof createApp>;
const seen: { url: string; auth: string | null }[] = [];

/** GitHub as a private repository would answer: the release list, then a signed link per file. */
const fakeGitHub = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const auth = new Headers(init?.headers).get('authorization');
  seen.push({ url, auth });
  // the signed link of latest.yml, as the server downloads it
  if (url === 'https://objects.githubusercontent.com/signed/5') return new Response('version: 0.6.0\npath: SlashClient-Setup-0.6.0.exe\n');
  if (auth !== 'Bearer sekret') return new Response('{"message":"Not Found"}', { status: 404 });
  if (url.endsWith('/releases/latest')) {
    const asset = (name: string, id: number) => ({ name, url: `https://api.github.com/repos/x/y/releases/assets/${id}`, browser_download_url: `https://github.com/x/y/releases/download/v0.5.0/${name}` });
    return Response.json({ assets: [asset('SlashClient-Setup-0.5.0.exe', 1), asset('SlashClient-0.5.0-arm64.dmg', 2), asset('SlashClient-0.5.0.dmg', 3), asset('SlashClient-0.5.0-arm64.dmg.blockmap', 4), asset('latest.yml', 5)] });
  }
  // an older release, which still has a Linux build
  if (url.endsWith('/releases?per_page=10')) {
    return Response.json([
      { assets: [{ name: 'SlashClient-Setup-0.5.0.exe', url: 'https://api.github.com/repos/x/y/releases/assets/1', browser_download_url: '' }] },
      { draft: true, assets: [{ name: 'SlashClient-0.4.9.AppImage', url: 'https://api.github.com/repos/x/y/releases/assets/8', browser_download_url: '' }] },
      { assets: [{ name: 'SlashClient-0.4.0.AppImage', url: 'https://api.github.com/repos/x/y/releases/assets/9', browser_download_url: '' }] },
    ]);
  }
  const id = /assets\/(\d+)$/.exec(url)?.[1];
  if (id) return new Response(null, { status: 302, headers: { Location: `https://objects.githubusercontent.com/signed/${id}` } });
  return new Response('', { status: 500 });
}) as typeof fetch;

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: false, oauth: {}, fetchImpl: fakeGitHub, releasesRepo: 'x/y', releasesToken: 'sekret' });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('downloads', () => {
  it('sends each system to its installer through a signed link, the token stays on the server', async () => {
    for (const [os, id] of [['windows', 1], ['mac', 2], ['mac-intel', 3]] as const) {
      const res = await fetch(`${base}/pobierz/${os}`, { redirect: 'manual' });
      assert.equal(res.status, 302, os);
      assert.equal(res.headers.get('location'), `https://objects.githubusercontent.com/signed/${id}`);
    }
    // the release list is asked for once and kept
    assert.equal(seen.filter((s) => s.url.endsWith('/releases/latest')).length, 1);
  });

  it('is the launcher\'s update feed: the yml from here, the files as signed links', async () => {
    const yml = await fetch(`${base}/aktualizacje/latest.yml`);
    assert.equal(yml.status, 200);
    assert.match(await yml.text(), /version: 0\.6\.0/);
    const exe = await fetch(`${base}/aktualizacje/SlashClient-Setup-0.5.0.exe`, { redirect: 'manual' });
    assert.equal(exe.headers.get('location'), 'https://objects.githubusercontent.com/signed/1');
    assert.equal((await fetch(`${base}/aktualizacje/latest-linux.yml`)).status, 404);
    assert.equal((await fetch(`${base}/aktualizacje/..%2Fsecret`, { redirect: 'manual' })).status, 404);
  });

  it('falls back to the newest release that has the system\'s installer, and knows only real systems', async () => {
    // the latest release has no Linux file yet: the newest published one that has it (not a draft)
    const linux = await fetch(`${base}/pobierz/linux`, { redirect: 'manual' });
    assert.equal(linux.status, 302);
    assert.equal(linux.headers.get('location'), 'https://objects.githubusercontent.com/signed/9');
    assert.equal((await fetch(`${base}/pobierz/android`, { redirect: 'manual' })).status, 404);
  });
});
