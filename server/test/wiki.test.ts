import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { renderMarkdown } from '../src/legal/markdown.ts';
import { composePage, parsePage, renderPage } from '../src/wiki/format.ts';
import { WikiStore, hashOf } from '../src/wiki/store.ts';

// The SlashClient wiki: pages from the code and from the admin panel, the site's pages, the launcher's API.

const WEB = path.resolve(import.meta.dirname, '../web');
const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-wiki-'));

let app: ReturnType<typeof createApp>;
let base = '';
let adminToken = '';
let playerToken = '';
async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const raw = body instanceof Uint8Array;
  const res = await fetch(base + url, {
    method, redirect: 'manual',
    headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : raw ? Buffer.from(body) : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'app.db'), publicUrl: 'https://slashclient.example', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'], webDir: WEB });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  adminToken = (await call('POST', '/v1/auth/dev', undefined, { name: 'Szef' })).body.token;
  playerToken = (await call('POST', '/v1/auth/dev', undefined, { name: 'Gracz' })).body.token;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('wiki text', () => {
  it('reads and writes a page\'s details, title and content', () => {
    const p = parsePage('<!-- dzial: hud | kolejnosc: 30 | ikona: fa-map | opis: Mapa | minimapa i punkty -->\n# Mapa i minimapa\n\nTreść');
    assert.deepEqual(p.meta, { section: 'hud', order: 30, icon: 'fa-map', description: 'Mapa | minimapa i punkty' });
    assert.equal(p.title, 'Mapa i minimapa');
    assert.equal(p.content, 'Treść');
    assert.deepEqual(parsePage(composePage(p.meta, p.title, p.content)), p);
    // odd details fall back to safe ones
    const bad = parsePage('<!-- dzial: <b> | kolejnosc: x | ikona: fa-x" onclick="y -->\nbez tytułu', 'slug');
    assert.deepEqual(bad.meta, { section: 'inne', order: 1000, icon: 'fa-file-lines', description: '' });
    assert.equal(bad.title, 'slug');
    // a comment end in a field cannot end the details early
    assert.equal(parsePage(composePage({ ...p.meta, description: 'a --> b' }, 'T', 'x')).meta.description, 'a —> b');
  });

  it('renders pictures, links in the page\'s language, and escapes everything typed', () => {
    const r = renderPage([
      '## Sekcja',
      '![Opis "zrzutu" <b>](hud-mapa.webp)',
      '![Brak](nie-ma.webp)',
      '![x](../../etc/passwd)',
      '[mapa](/wiki/hud-mapa#minimapa) [start](/wiki) [obca](https://modrinth.com) [zła](javascript:void0)',
      '<img src=x onerror=alert(1)>',
      '### Podsekcja',
    ].join('\n'), 'en', { image: (n) => n === 'hud-mapa.webp' });
    assert.match(r.html, /<figure class="wiki-figure"><img src="\/wiki\/img\/hud-mapa.webp" alt="Opis &quot;zrzutu&quot; &lt;b&gt;" loading="lazy" decoding="async"><figcaption>Opis &quot;zrzutu&quot; &lt;b&gt;<\/figcaption><\/figure>/);
    assert.match(r.html, /<figure class="wiki-figure missing"><figcaption>nie-ma.webp – Brak<\/figcaption><\/figure>/);
    assert.match(r.html, /<figure class="wiki-figure missing"><figcaption>..\/..\/etc\/passwd – x<\/figcaption>/);
    assert.match(r.html, /<a href="\/en\/wiki\/hud-mapa#minimapa">mapa<\/a> <a href="\/en\/wiki">start<\/a> <a href="https:\/\/modrinth.com" rel="noopener noreferrer">obca<\/a> zła/);
    assert.doesNotMatch(r.html, /<img src=x|href="javascript:/);
    assert.deepEqual(r.headings, ['Sekcja', 'Podsekcja']);
    // absolute addresses for the launcher
    assert.match(renderPage('![a](hud-mapa.webp)', 'pl', { image: () => true, base: 'https://slashclient.pl/' }).html, /src="https:\/\/slashclient.pl\/wiki\/img\/hud-mapa.webp"/);
    // the legal documents have no pictures: the line stays text
    assert.doesNotMatch(renderMarkdown('![a](hud-mapa.webp)').html, /<img|<figure/);
  });
});

describe('wiki pages from the code', () => {
  function setup() {
    const seed = mkdtempSync(path.join(dir, 'seed-'));
    for (const l of ['pl', 'en']) mkdirSync(path.join(seed, l));
    const sql = new DatabaseSync(':memory:');
    sql.exec('CREATE TABLE users (uuid TEXT PRIMARY KEY, handle TEXT)');
    let now = 1000;
    const write = (lang: string, slug: string, text: string) => writeFileSync(path.join(seed, lang, `${slug}.md`), text);
    const open = () => new WikiStore(sql, { seedDir: seed, now: () => ++now });
    return { write, open };
  }

  it('follows the files until an admin saves the page, then keeps the admin\'s text', () => {
    const { write, open } = setup();
    write('pl', 'hud-mapa', '# Mapa\n\nv1');
    write('en', 'hud-mapa', '# Map\n\nv1');
    let s = open();
    assert.equal(s.published('hud-mapa', 'pl')?.body, '# Mapa\n\nv1');
    assert.equal(s.published('hud-mapa', 'pl')?.note, 'Wersja początkowa');
    assert.equal(open().syncSeed(), 0, 'nothing new: nothing added');
    // a deploy brings new text: the untouched page takes it
    write('pl', 'hud-mapa', '# Mapa\n\nv2');
    s = open();
    assert.equal(s.published('hud-mapa', 'pl')?.body, '# Mapa\n\nv2');
    assert.equal(s.published('hud-mapa', 'pl')?.note, 'Aktualizacja z kodu');
    assert.deepEqual(s.seedState('hud-mapa', 'pl'), { exists: true, follows: true, differs: false, newer: false });
    // an admin's draft: the code no longer changes the page (the published one stays too)
    s.saveDraft('hud-mapa', 'pl', '# Mapa\n\nmoja', 'admin');
    write('pl', 'hud-mapa', '# Mapa\n\nv3');
    s = open();
    assert.equal(s.published('hud-mapa', 'pl')?.body, '# Mapa\n\nv2');
    assert.equal(s.draft('hud-mapa', 'pl')?.body, '# Mapa\n\nmoja');
    assert.deepEqual(s.seedState('hud-mapa', 'pl'), { exists: true, follows: false, differs: true, newer: true });
    // published by the admin: still theirs
    s.publish('hud-mapa', 'pl', '# Mapa\n\nmoja', 'admin', '');
    write('pl', 'hud-mapa', '# Mapa\n\nv4');
    s = open();
    assert.equal(s.published('hud-mapa', 'pl')?.body, '# Mapa\n\nmoja');
    // the code's version restored: follows again, and the next deploy updates it
    s.publish('hud-mapa', 'pl', s.seed('hud-mapa', 'pl')!, 'admin', 'Wersja z kodu', hashOf(s.seed('hud-mapa', 'pl')!));
    write('pl', 'hud-mapa', '# Mapa\n\nv5');
    s = open();
    assert.equal(s.published('hud-mapa', 'pl')?.body, '# Mapa\n\nv5');
    // the other language was never touched and kept following
    assert.equal(s.seedState('hud-mapa', 'en').follows, true);
  });

  it('does not bring back a deleted or renamed page', () => {
    const { write, open } = setup();
    write('pl', 'a', '# A');
    write('pl', 'b', '# B');
    let s = open();
    s.remove('a', 'admin');
    s.rename('b', 'c', 'admin');
    write('pl', 'a', '# A2');
    s = open();
    assert.deepEqual(s.slugs(), ['c']);
    assert.equal(s.redirect('b'), 'c');
    assert.equal(s.published('c', 'pl')?.body, '# B');
    // brought back with its history
    s.undelete('a');
    assert.deepEqual(s.slugs(), ['a', 'c']);
  });
});

describe('wiki on the site and for the launcher', () => {
  it('shows the index, a page and the English version', async () => {
    const pl = await call('GET', '/wiki');
    assert.equal(pl.status, 200);
    assert.match(pl.headers.get('content-type') ?? '', /text\/html/);
    assert.match(pl.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    assert.match(pl.text, /<html lang="pl">/);
    assert.match(pl.text, /<h1>Wiki SlashClient<\/h1>/);
    assert.match(pl.text, /href="\/wiki\/start-witaj"/);
    assert.match(pl.text, /<meta name="description"/);
    const page = await call('GET', '/wiki/start-witaj');
    assert.equal(page.status, 200);
    assert.match(page.text, /Witaj w SlashClient/);
    assert.match(page.text, /<img src="\/wiki\/img\/strona-glowna.webp"/);
    assert.match(page.text, /class="legal-toc wiki-toc"/);
    assert.match(page.text, /href="\/en\/wiki\/start-witaj" hreflang="en"/);
    assert.match(page.text, /class="wiki-step next" href="\/wiki\/start-o-wiki"/);
    const en = await call('GET', '/en/wiki/start-witaj');
    assert.match(en.text, /<html lang="en">/);
    assert.match(en.text, /Welcome to SlashClient/);
    assert.match(en.text, /href="\/en\/wiki\/start-o-wiki"/);
    assert.equal((await call('GET', '/wiki/nie-ma-takiej')).status, 404);
    // the search without the script
    const q = await call('GET', '/wiki?q=wyszukiwarka');
    assert.match(q.text, /Wyniki wyszukiwania/);
    assert.match(q.text, /noindex/);
    const sitemap = await call('GET', '/sitemap-wiki.xml');
    assert.match(sitemap.text, /<loc>https:\/\/slashclient.example\/en\/wiki\/start-witaj<\/loc>/);
  });

  it('serves pictures with caching and nothing outside its folders', async () => {
    const r = await fetch(`${base}/wiki/img/start-wiki-baner.webp`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/webp');
    assert.match(r.headers.get('cache-control') ?? '', /max-age=86400/);
    const etag = r.headers.get('etag')!;
    assert.equal((await fetch(`${base}/wiki/img/start-wiki-baner.webp`, { headers: { 'If-None-Match': etag } })).status, 304);
    assert.equal((await fetch(`${base}/wiki/img/..%2F..%2Fstore.ts`)).status, 404);
    assert.equal((await fetch(`${base}/wiki/img/nie-ma.webp`)).status, 404);
  });

  it('gives the launcher the list and a page in both languages', async () => {
    const list = await call('GET', '/v1/wiki?lang=en');
    assert.equal(list.status, 200);
    const start = list.body.sections.find((s: any) => s.id === 'start');
    assert.equal(start.title, 'Getting started');
    const page = start.pages.find((p: any) => p.slug === 'start-witaj');
    assert.equal(page.title, 'Welcome to SlashClient');
    assert.ok(page.headings.includes('What you get'));
    const a = await call('GET', '/v1/wiki/start-witaj?lang=en');
    assert.equal(a.body.lang, 'en');
    assert.match(a.body.html, /src="https:\/\/slashclient.example\/wiki\/img\/strona-glowna.webp"/);
    assert.match(a.body.html, /href="\/en\/wiki\/start-o-wiki"/);
    assert.equal(a.body.url, 'https://slashclient.example/en/wiki/start-witaj');
    assert.deepEqual(a.body.next, { slug: 'start-o-wiki', title: 'How to use the wiki' });
    assert.ok(a.body.toc.some((e: any) => e.id === 'what-you-get'));
    assert.equal((await call('GET', '/v1/wiki/start-witaj')).body.title, 'Witaj w SlashClient');
    assert.equal((await call('GET', '/v1/wiki/nie-ma')).status, 404);
  });

  it('is switched off with its feature switch (the editor stays)', async () => {
    app.settings.set({ 'feature.wiki': false }, 'test');
    try {
      assert.equal((await call('GET', '/wiki')).status, 503);
      assert.equal((await call('GET', '/v1/wiki')).body.error, 'feature_disabled');
      assert.equal((await call('GET', '/v1/admin/wiki', adminToken)).status, 200);
    } finally {
      app.settings.set({ 'feature.wiki': null }, 'test');
    }
    assert.equal((await call('GET', '/wiki')).status, 200);
  });
});

describe('wiki in the admin panel', () => {
  it('is only for admins', async () => {
    assert.equal((await call('GET', '/v1/admin/wiki')).status, 401);
    assert.equal((await call('GET', '/v1/admin/wiki', playerToken)).status, 403);
    assert.equal((await call('POST', '/v1/admin/wiki/pages', playerToken, { slug: 'x', title: 'x' })).status, 403);
    assert.equal((await call('POST', '/v1/admin/wiki/pages/start-witaj/pl/publish', playerToken, { body: '# x' })).status, 403);
    assert.equal((await call('PUT', '/v1/admin/wiki/images', playerToken, new Uint8Array([1, 2]))).status, 403);
    assert.equal((await call('DELETE', '/v1/admin/wiki/pages/start-witaj', playerToken)).status, 403);
  });

  it('creates, edits, publishes, restores, renames and deletes a page', async () => {
    const created = await call('POST', '/v1/admin/wiki/pages', adminToken, { slug: 'hud-test', section: 'hud', title: 'Test HUD', titleEn: 'HUD test' });
    assert.equal(created.status, 200);
    assert.ok(created.body.langs.pl.draft);
    assert.equal(created.body.langs.pl.published, null);
    assert.equal((await call('POST', '/v1/admin/wiki/pages', adminToken, { slug: 'hud-test', title: 'x' })).status, 409);
    assert.equal((await call('POST', '/v1/admin/wiki/pages', adminToken, { slug: 'Zły Adres', title: 'x' })).status, 400);
    // a draft is not on the site
    assert.equal((await call('GET', '/wiki/hud-test')).status, 404);
    const body = '<!-- dzial: hud | kolejnosc: 5 | ikona: fa-vial | opis: Strona testowa -->\n# Test HUD\n\n## Część\n\n<script>alert(1)</script>';
    const pub = await call('POST', '/v1/admin/wiki/pages/hud-test/pl/publish', adminToken, { body, note: 'pierwsza' });
    assert.equal(pub.status, 200);
    const shown = await call('GET', '/wiki/hud-test');
    assert.equal(shown.status, 200);
    assert.match(shown.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(shown.text, /<script>alert/);
    // not translated yet: the English address shows the Polish text, not indexed
    const en = await call('GET', '/en/wiki/hud-test');
    assert.match(en.text, /<article class="wiki-main" lang="pl">/);
    assert.match(en.text, /noindex/);
    // the preview
    const preview = await call('POST', '/v1/admin/wiki/preview', adminToken, { body, lang: 'pl' });
    assert.equal(preview.body.title, 'Test HUD');
    assert.equal(preview.body.meta.icon, 'fa-vial');
    // history and restoring
    const v1 = pub.body.langs.pl.published.id;
    await call('POST', '/v1/admin/wiki/pages/hud-test/pl/publish', adminToken, { body: body.replace('Część', 'Druga') });
    const restored = await call('POST', `/v1/admin/wiki/versions/${v1}/restore`, adminToken);
    assert.equal(restored.body.langs.pl.draft.restoredFrom, v1);
    assert.match((await call('GET', '/wiki/hud-test')).text, /Druga/);
    // a new address; the old one leads there
    const renamed = await call('POST', '/v1/admin/wiki/pages/hud-test/rename', adminToken, { to: 'hud-proba' });
    assert.equal(renamed.body.slug, 'hud-proba');
    const moved = await call('GET', '/wiki/hud-test');
    assert.equal(moved.status, 301);
    assert.equal(moved.headers.get('location'), '/wiki/hud-proba');
    assert.equal((await call('GET', '/v1/wiki/hud-test')).body.slug, 'hud-proba');
    assert.equal((await call('POST', '/v1/admin/wiki/pages/hud-proba/rename', adminToken, { to: 'start-witaj' })).status, 409);
    // deleted: gone from the site and the list, back with its history
    assert.equal((await call('DELETE', '/v1/admin/wiki/pages/hud-proba', adminToken)).status, 200);
    assert.equal((await call('GET', '/wiki/hud-proba')).status, 404);
    const list = await call('GET', '/v1/admin/wiki', adminToken);
    assert.ok(!list.body.pages.some((p: any) => p.slug === 'hud-proba'));
    assert.ok(list.body.deleted.some((d: any) => d.slug === 'hud-proba'));
    const back = await call('POST', '/v1/admin/wiki/pages/hud-proba/undelete', adminToken);
    assert.ok(back.body.langs.pl.versions.length >= 3);
    assert.equal((await call('GET', '/wiki/hud-proba')).status, 200);
    const log = (await call('GET', '/v1/admin/log', adminToken)).body.entries as { action: string }[];
    for (const action of ['wiki_create', 'wiki_publish', 'wiki_restore', 'wiki_rename', 'wiki_delete', 'wiki_undelete']) assert.ok(log.some((e) => e.action === action), action);
  });

  it('restores the code\'s version of a page an admin changed', async () => {
    await call('POST', '/v1/admin/wiki/pages/start-o-wiki/pl/publish', adminToken, { body: '# Zmieniona\n\nmoja' });
    let view = (await call('GET', '/v1/admin/wiki/pages/start-o-wiki', adminToken)).body;
    assert.deepEqual(view.langs.pl.seed, { exists: true, follows: false, differs: true, newer: false });
    const seed = await call('GET', '/v1/admin/wiki/pages/start-o-wiki/pl/seed', adminToken);
    assert.match(seed.body.body, /# Jak korzystać z wiki/);
    view = (await call('POST', '/v1/admin/wiki/pages/start-o-wiki/pl/seed', adminToken)).body;
    assert.equal(view.langs.pl.seed.follows, true);
    assert.match((await call('GET', '/wiki/start-o-wiki')).text, /Jak korzystać z wiki/);
  });

  it('takes pictures up to the size limit under their own names', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const up = await call('PUT', '/v1/admin/wiki/images?name=Moja%20Mapa%201.PNG', adminToken, png);
    assert.equal(up.status, 200);
    assert.equal(up.body.name, 'moja-mapa-1.png');
    // the same file again keeps its name; another one with that name gets "-2"
    assert.equal((await call('PUT', '/v1/admin/wiki/images?name=moja-mapa-1.png', adminToken, png)).body.name, 'moja-mapa-1.png');
    assert.equal((await call('PUT', '/v1/admin/wiki/images?name=moja-mapa-1.png', adminToken, new Uint8Array([...png, 5]))).body.name, 'moja-mapa-1-2.png');
    // a name the code uses is never taken
    const webp = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP'), 1, 2]);
    assert.equal((await call('PUT', '/v1/admin/wiki/images?name=start-wiki-baner.webp', adminToken, webp)).body.name, 'start-wiki-baner-2.webp');
    const img = await fetch(`${base}/wiki/img/moja-mapa-1.png`);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal((await call('PUT', '/v1/admin/wiki/images', adminToken, new TextEncoder().encode('<svg onload=alert(1)>'))).body.error, 'bad_picture');
    const list = await call('GET', '/v1/admin/wiki/images', adminToken);
    assert.ok(list.body.images.some((i: any) => i.name === 'start-wiki-baner.webp' && i.source === 'seed'));
    assert.ok(list.body.images.some((i: any) => i.name === 'moja-mapa-1.png' && i.source === 'upload'));
    // the limit is a setting
    app.settings.set({ 'wiki.maxImageBytes': 100 * 1024 }, 'test');
    try {
      const big = new Uint8Array(150 * 1024);
      big.set(png);
      assert.equal((await call('PUT', '/v1/admin/wiki/images?name=duzy.png', adminToken, big)).status, 413);
    } finally {
      app.settings.set({ 'wiki.maxImageBytes': null }, 'test');
    }
  });
});
