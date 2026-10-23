import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { holdForPaused, releaseNews } from '../src/downloads.ts';
import { compareVersion, notesFor, notesHtml, parseInline, pauseMarker, pausedUntil, safeLink, splitNotes } from '../src/releaseNotes.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-changelog-'));
let base = '';
let app: ReturnType<typeof createApp>;
const seen: string[] = [];

const asset = (name: string, id: number) => ({ name, url: `https://api.github.com/repos/x/y/releases/assets/${id}`, browser_download_url: `https://github.com/x/y/releases/download/${name}` });
const NOTES_40 = `<!-- nowosc: Nowość: historia zmian | #funkcje -->
<!-- news: New: changelog -->
## SlashClient 0.9.40

### Launcher
- **Historia zmian** w Ustawieniach
- link [strona](https://client.slash3rss.dev/zmiany) i [zły](javascript:alert(1))
<script>alert(1)</script>
<!-- en -->
## SlashClient 0.9.40

### Launcher
- **Changelog** in Settings`;

/** A private repository's releases, newest first (as GitHub lists them by date), with a draft and a prerelease. */
const RELEASES = [
  { tag_name: 'v0.9.41', draft: true, body: 'szkic', assets: [] },
  { tag_name: 'v0.9.41-beta.1', prerelease: true, body: 'beta', assets: [] },
  { tag_name: 'v0.9.40', published_at: '2026-10-24T10:00:00Z', body: NOTES_40, assets: [asset('latest.yml', 40), asset('latest-mac.yml', 41), asset('SlashClient-Setup-0.9.40.exe', 42)] },
  { tag_name: 'v0.9.39', published_at: '2026-10-23T10:00:00Z', body: '## SlashClient 0.9.39\n\n- Tylko po polsku', assets: [asset('latest.yml', 390), asset('latest-linux.yml', 391), asset('SlashClient-Setup-0.9.39.exe', 392), asset('win-update-0.9.39.json', 393)] },
  ...Array.from({ length: 30 }, (_, i) => ({ tag_name: `v0.8.${29 - i}`, published_at: `2026-09-${String(29 - i).padStart(2, '0')}T10:00:00Z`, body: `- zmiana ${29 - i}`, assets: [] })),
];

const fakeGitHub = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  seen.push(url);
  if (url.startsWith('https://objects.githubusercontent.com/signed/390')) return new Response('version: 0.9.39\npath: SlashClient-Setup-0.9.39.exe\n');
  if (url.startsWith('https://objects.githubusercontent.com/signed/40')) return new Response('version: 0.9.40\npath: SlashClient-Setup-0.9.40.exe\n');
  // only with the token: the repository is private
  if (new Headers(init?.headers).get('authorization') !== 'Bearer sekret') return new Response('{"message":"Not Found"}', { status: 404 });
  const list = /\/releases\?per_page=(\d+)(?:&page=(\d+))?$/.exec(url);
  if (list) {
    const per = Number(list[1]);
    const page = Number(list[2] ?? 1);
    return Response.json(RELEASES.slice((page - 1) * per, page * per));
  }
  if (url.endsWith('/releases/latest')) return Response.json(RELEASES[2]);
  const tag = /\/releases\/tags\/(.+)$/.exec(url)?.[1];
  if (tag) {
    const r = RELEASES.find((x) => x.tag_name === tag);
    return r ? Response.json(r) : new Response('{"message":"Not Found"}', { status: 404 });
  }
  const id = /assets\/(\d+)$/.exec(url)?.[1];
  if (id) return new Response(null, { status: 302, headers: { Location: `https://objects.githubusercontent.com/signed/${id}` } });
  return new Response('', { status: 500 });
}) as typeof fetch;

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: false, oauth: {}, fetchImpl: fakeGitHub, releasesRepo: 'x/y', releasesToken: 'sekret', webDir: path.resolve(import.meta.dirname, '../web') });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

type Page = { releases: { version: string; date: string; notes: string; title?: string; platforms: string[] }[]; more: boolean };

describe('changelog routes', () => {
  it('lists published releases newest first, from a private repository, without drafts and prereleases', async () => {
    const res = await fetch(`${base}/v1/changelog?limit=3`);
    assert.equal(res.status, 200);
    const page = (await res.json()) as Page;
    assert.deepEqual(page.releases.map((r) => r.version), ['0.9.40', '0.9.39', '0.8.29']);
    assert.equal(page.more, true);
    const [r40] = page.releases;
    assert.equal(r40.date, '2026-10-24T10:00:00Z');
    assert.equal(r40.title, 'Nowość: historia zmian');
    assert.deepEqual(r40.platforms.sort(), ['mac', 'windows']);
    // no badge lines, no English part, no title heading
    assert.doesNotMatch(r40.notes, /<!--|nowosc|Changelog in Settings|## SlashClient/);
    assert.match(r40.notes, /\*\*Historia zmian\*\* w Ustawieniach/);
  });

  it('gives the English part for lang=en, else the Polish notes', async () => {
    const page = (await (await fetch(`${base}/v1/changelog?limit=2&lang=en`)).json()) as Page;
    assert.equal(page.releases[0].title, 'New: changelog');
    assert.match(page.releases[0].notes, /\*\*Changelog\*\* in Settings/);
    assert.doesNotMatch(page.releases[0].notes, /Ustawieniach/);
    assert.match(page.releases[1].notes, /Tylko po polsku/);
  });

  it('pages back with before=<version>', async () => {
    const page = (await (await fetch(`${base}/v1/changelog?limit=20&before=0.8.10`)).json()) as Page;
    assert.deepEqual(page.releases.map((r) => r.version), Array.from({ length: 10 }, (_, i) => `0.8.${9 - i}`));
    assert.equal(page.more, false);
    assert.equal((await fetch(`${base}/v1/changelog?before=abc`)).status, 400);
  });

  it('shows one release, and none for a draft or an unknown version', async () => {
    const one = await fetch(`${base}/v1/changelog/0.9.39`);
    assert.equal(one.status, 200);
    assert.equal(((await one.json()) as { version: string }).version, '0.9.39');
    assert.equal((await fetch(`${base}/v1/changelog/0.9.41`)).status, 404);
    assert.equal((await fetch(`${base}/v1/changelog/1.2.3`)).status, 404);
  });

  it('asks GitHub once per few minutes', async () => {
    const before = seen.filter((u) => u.includes('/releases?per_page=100&page=1')).length;
    await fetch(`${base}/v1/changelog?limit=5`);
    await fetch(`${base}/v1/changelog?limit=5&lang=en`);
    assert.equal(seen.filter((u) => u.includes('/releases?per_page=100&page=1')).length, before);
    assert.ok(before >= 1);
  });

  it('serves an older release as an update feed of its own, through the server', async () => {
    const yml = await fetch(`${base}/aktualizacje/v/0.9.39/latest.yml`);
    assert.equal(yml.status, 200);
    assert.match(await yml.text(), /version: 0\.9\.39/);
    const exe = await fetch(`${base}/aktualizacje/v/0.9.39/SlashClient-Setup-0.9.39.exe`, { redirect: 'manual' });
    assert.equal(exe.headers.get('location'), 'https://objects.githubusercontent.com/signed/392');
    const manifest = await fetch(`${base}/updates/v/0.9.39/win-update-0.9.39.json`, { redirect: 'manual' });
    assert.equal(manifest.headers.get('location'), 'https://objects.githubusercontent.com/signed/393');
    // a draft is not offered
    assert.equal((await fetch(`${base}/aktualizacje/v/0.9.41/latest.yml`)).status, 404);
  });

  it('holds the update back from a launcher that went back, until a newer release than the one it left', async () => {
    const plain = await (await fetch(`${base}/aktualizacje/latest.yml`)).text();
    assert.doesNotMatch(plain, /stagingPercentage/);
    const held = await (await fetch(`${base}/aktualizacje/latest.yml`, { headers: { 'x-user-staging-id': pauseMarker('0.9.40')! } })).text();
    assert.match(held, /version: 0\.9\.40[\s\S]*stagingPercentage: 0/);
    const free = await (await fetch(`${base}/aktualizacje/latest.yml`, { headers: { 'x-user-staging-id': pauseMarker('0.9.39')! } })).text();
    assert.doesNotMatch(free, /stagingPercentage/);
  });
});

describe('changelog page', () => {
  it('lists the releases with their notes, safely, in Polish at /zmiany', async () => {
    const res = await fetch(`${base}/zmiany`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    const html = await res.text();
    assert.match(html, /<title>Historia zmian – SlashClient<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/client.example\/zmiany">/);
    assert.match(html, /hreflang="en" href="https:\/\/client.example\/changelog"/);
    assert.match(html, /<article class="cl-release glass" id="0.9.40">/);
    assert.match(html, /<strong>Historia zmian<\/strong> w Ustawieniach/);
    assert.match(html, /<a href="https:\/\/client.slash3rss.dev\/zmiany" rel="noopener noreferrer nofollow" target="_blank">strona<\/a>/);
    // the author's HTML is text, a javascript: link only its words
    assert.doesNotMatch(html, /<script>alert|javascript:/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Nowość: historia zmian/);
    // 25 a page, then older ones
    assert.match(html, /href="\/zmiany\?przed=0\.8\.7"/);
  });

  it('is in English at /changelog, and pages back', async () => {
    const html = await (await fetch(`${base}/changelog?before=0.8.5`)).text();
    assert.match(html, /<html lang="en">/);
    assert.match(html, /id="0.8.4"/);
    assert.doesNotMatch(html, /id="0.9.40"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/client.example\/changelog\?before=0.8.5">/);
  });

  it('is in the sitemap, and the home page badge leads to it', async () => {
    const map = readFileSync(path.resolve(import.meta.dirname, '../web/sitemap.xml'), 'utf8');
    assert.match(map, /<loc>https:\/\/client.slash3rss.dev\/zmiany<\/loc>/);
    assert.match(map, /<loc>https:\/\/client.slash3rss.dev\/changelog<\/loc>/);
    const en = await (await fetch(`${base}/en`)).text();
    assert.match(en, /<a class="pill" href="\/changelog#0.9.40"/);
  });
});

describe('release notes', () => {
  it('splits Polish and English, drops the badges and the title', () => {
    assert.deepEqual(splitNotes('<!-- nowosc: X -->\n## SlashClient 1.0.0\n- a\n<!-- en -->\n## SlashClient 1.0.0\n- b'), { pl: '- a', en: '- b' });
    assert.deepEqual(splitNotes('- a\n<!--en-->\n'), { pl: '- a' });
    assert.equal(notesFor('- a', 'en'), '- a');
    assert.equal(notesFor(undefined, 'pl'), '');
  });

  it('renders only its own tags', () => {
    assert.equal(notesHtml('### Gra\n- **a** *b* `c<d>`\n  - pod\n\n<img src=x onerror=alert(1)>'),
      '<h4>Gra</h4>\n<ul><li><strong>a</strong> <em>b</em> <code>c&lt;d&gt;</code><ul><li>pod</li></ul></li></ul>\n<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    assert.deepEqual(parseInline('[x](javascript:alert(1)) [y](http://a.b) [z](https://a.b/"q)'),
      [{ type: 'text', text: 'x' }, { type: 'text', text: ' ' }, { type: 'text', text: 'y' }, { type: 'text', text: ' ' }, { type: 'text', text: 'z' }]);
    assert.equal(safeLink('https://ok.example/a?b=1'), 'https://ok.example/a?b=1');
    assert.equal(safeLink('data:text/html,x'), undefined);
  });

  it('compares versions and reads the pause mark', () => {
    assert.ok(compareVersion('0.9.10', '0.9.9') > 0);
    assert.equal(compareVersion('v1.0.0', '1.0.0'), 0);
    assert.equal(pausedUntil(pauseMarker('0.9.40')), '0.9.40');
    assert.equal(pausedUntil('1b4e28ba-2fa1-11d2-883f-0016d3cca427'), undefined);
    assert.equal(holdForPaused('version: 1.0.0\nstagingPercentage: 50\n', pauseMarker('1.0.0')), 'version: 1.0.0\nstagingPercentage: 0\n');
    assert.equal(holdForPaused('version: 1.0.1\n', [pauseMarker('1.0.0')!]), 'version: 1.0.1\n');
  });

  it('points a badge without a link to the changelog in each language', () => {
    assert.deepEqual(releaseNews('<!-- nowosc: A -->\n<!-- news: B -->', { pl: '/zmiany#1.0.0', en: '/changelog#1.0.0' }),
      { pl: { text: 'A', href: '/zmiany#1.0.0' }, en: { text: 'B', href: '/changelog#1.0.0' } });
  });
});
