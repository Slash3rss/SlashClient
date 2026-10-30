import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { compareBeta, releaseNews } from '../src/downloads.ts';

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
  // the beta's
  if (url === 'https://objects.githubusercontent.com/signed/20') return new Response('version: 0.5.1-beta.2\npath: SlashClient-Setup-0.5.1-beta.2.exe\n');
  if (auth !== 'Bearer sekret') return new Response('{"message":"Not Found"}', { status: 404 });
  if (url.endsWith('/releases/latest')) {
    const asset = (name: string, id: number) => ({ name, url: `https://api.github.com/repos/x/y/releases/assets/${id}`, browser_download_url: `https://github.com/x/y/releases/download/v0.5.0/${name}` });
    return Response.json({ tag_name: 'v0.5.0', body: '<!-- nowosc: Nowość: jesienne liście | #kosmetyki -->\n<!-- news: New: autumn leaves -->\n## SlashClient 0.5.0', html_url: 'https://github.com/x/y/releases/tag/v0.5.0', assets: [asset('SlashClient-Setup-0.5.0.exe', 1), asset('SlashClient-0.5.0-arm64.dmg', 2), asset('SlashClient-0.5.0.dmg', 3), asset('SlashClient-0.5.0-arm64.dmg.blockmap', 4), asset('latest.yml', 5), asset('SlashClient-0.5.0-win-app.zip', 6), asset('win-update-0.5.0.json', 7)] });
  }
  // every release, a beta's (a pre-release) and a draft too, for the beta channel
  if (url.endsWith('/releases?per_page=100&page=1')) {
    const asset = (name: string, id: number) => ({ name, url: `https://api.github.com/repos/x/y/releases/assets/${id}`, browser_download_url: '' });
    return Response.json([
      { tag_name: 'v0.6.0-beta.1', draft: true, assets: [asset('latest.yml', 30)] },
      { tag_name: 'v0.5.1-beta.1', prerelease: true, assets: [asset('latest.yml', 22), asset('SlashClient-0.5.1-beta.1-win.zip', 23)] },
      { tag_name: 'v0.5.1-beta.2', prerelease: true, assets: [asset('latest.yml', 20), asset('SlashClient-0.5.1-beta.2-win.zip', 21)] },
      { tag_name: 'v0.5.0', assets: [asset('latest.yml', 5), asset('latest-linux.yml', 24)] },
    ]);
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
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: false, oauth: {}, fetchImpl: fakeGitHub, releasesRepo: 'x/y', releasesToken: 'sekret', webDir: path.resolve(import.meta.dirname, '../web') });
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
    assert.equal((await fetch(`${base}/aktualizacje/latest-mac.yml`)).status, 404);
    // Windows updates in place: the release's description and its zips come the same way
    for (const [name, id] of [['win-update-0.5.0.json', 7], ['SlashClient-0.5.0-win-app.zip', 6]] as const) {
      assert.equal((await fetch(`${base}/aktualizacje/${name}`, { redirect: 'manual' })).headers.get('location'), `https://objects.githubusercontent.com/signed/${id}`);
    }
    assert.equal((await fetch(`${base}/aktualizacje/..%2Fsecret`, { redirect: 'manual' })).status, 404);
    // the same under English names
    assert.match(await (await fetch(`${base}/updates/latest.yml`)).text(), /version: 0\.6\.0/);
    assert.equal((await fetch(`${base}/download/windows`, { redirect: 'manual' })).headers.get('location'), 'https://objects.githubusercontent.com/signed/1');
  });

  it('has a beta channel: the newest release, a beta or not, never a draft; the stable feed and the site never see it', async () => {
    const beta = await fetch(`${base}/aktualizacje/beta/latest.yml`);
    assert.equal(beta.status, 200);
    assert.match(await beta.text(), /version: 0\.5\.1-beta\.2/);
    assert.equal((await fetch(`${base}/aktualizacje/beta/SlashClient-0.5.1-beta.2-win.zip`, { redirect: 'manual' })).headers.get('location'), 'https://objects.githubusercontent.com/signed/21');
    // a file the newest beta has not got: from the newest release that has it
    assert.equal((await fetch(`${base}/aktualizacje/beta/SlashClient-0.5.1-beta.1-win.zip`, { redirect: 'manual' })).headers.get('location'), 'https://objects.githubusercontent.com/signed/23');
    assert.match(await (await fetch(`${base}/aktualizacje/latest.yml`)).text(), /version: 0\.6\.0/);
    // switched off in the admin panel: the beta channel is the stable one
    app.settings.set({ 'feature.betaUpdates': false }, 'test');
    try {
      assert.match(await (await fetch(`${base}/aktualizacje/beta/latest.yml`)).text(), /version: 0\.6\.0/);
    } finally {
      app.settings.set({ 'feature.betaUpdates': null }, 'test');
    }
  });

  it('orders betas as semver does', () => {
    const sorted = ['0.9.57', '0.9.56', '0.9.57-beta.10', '0.9.57-beta.2', '0.9.57-alpha.1', 'x'].sort(compareBeta);
    assert.deepEqual(sorted, ['x', '0.9.56', '0.9.57-alpha.1', '0.9.57-beta.2', '0.9.57-beta.10', '0.9.57']);
  });

  it('falls back to the newest release that has the system\'s installer, and knows only real systems', async () => {
    // the latest release has no Linux file yet: the newest published one that has it (not a draft)
    const linux = await fetch(`${base}/pobierz/linux`, { redirect: 'manual' });
    assert.equal(linux.status, 302);
    assert.equal(linux.headers.get('location'), 'https://objects.githubusercontent.com/signed/9');
    assert.equal((await fetch(`${base}/pobierz/android`, { redirect: 'manual' })).status, 404);
    // Linux on ARM has a build of its own (none in these releases yet)
    const arm = await fetch(`${base}/pobierz/linux-arm`, { redirect: 'manual' });
    assert.equal(arm.status, 404);
    // the site's own page for a browser, naming the system, with the other systems' downloads
    const page = await arm.text();
    assert.match(arm.headers.get('content-type') ?? '', /text\/html/);
    assert.match(page, /Linux \(ARM\)/);
    assert.match(page, /#pobierz/);
  });

  it('puts the newest release badge on the home page, in each language', async () => {
    const pl = await (await fetch(`${base}/`, { headers: { 'Accept-Language': 'pl' } })).text();
    assert.match(pl, /<a class="pill" href="#kosmetyki"><span class="dot"><\/span> Nowość: jesienne liście /);
    const en = await (await fetch(`${base}/en`)).text();
    // without a link of its own: to the release's notes in the site's changelog (GitHub's page is a 404 for a private repository)
    assert.match(en, /<a class="pill" href="\/changelog#0.5.0"[^>]*><span class="dot"><\/span> New: autumn leaves /);
  });
});

describe('release badge', () => {
  it('reads the badge lines of the release notes, and nothing when there are none', () => {
    const page = 'https://github.com/x/y/releases/tag/v1';
    assert.deepEqual(releaseNews('<!-- nowość: Nowość: pupile | #kosmetyki -->\n<!--news:New: pets-->\n## x', page),
      { pl: { text: 'Nowość: pupile', href: '#kosmetyki' }, en: { text: 'New: pets', href: page } });
    // a link that is not a place on the site or a web page is not used
    assert.equal(releaseNews('<!-- nowosc: X | javascript:alert(1) -->', page).pl?.href, page);
    assert.deepEqual(releaseNews('## SlashClient 0.9.29\n- fix'), {});
    assert.deepEqual(releaseNews(undefined), {});
    assert.equal(releaseNews(`<!-- nowosc: ${'a'.repeat(200)} -->`).pl?.text.length, 80);
  });
});
