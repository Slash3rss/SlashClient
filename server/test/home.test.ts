import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { DEFAULTS, inline } from '../src/home/content.ts';
import { regions, templateRegions } from '../src/home/page.ts';

const WEB = path.resolve(import.meta.dirname, '../web');
const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-home-'));
let app: ReturnType<typeof createApp>;
let base = '';

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : body instanceof Uint8Array ? Buffer.from(body) : JSON.stringify(body),
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
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body.token as string;
const clone = <T>(v: T): T => structuredClone(v);

let adminToken = '';
let player = '';
before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'], webDir: WEB });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  adminToken = await login('Szef');
  player = await login('Gracz');
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('home page defaults', () => {
  it('web/index.html holds exactly what the defaults make', () => {
    const file = readFileSync(path.join(WEB, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    const inFile = templateRegions(file);
    const made = regions(DEFAULTS.pl, 'pl', 'https://client.slash3rss.dev');
    assert.deepEqual(Object.keys(inFile).sort(), Object.keys(made).sort());
    for (const [name, html] of Object.entries(made)) assert.equal(inFile[name], html, `region ${name}`);
  });

  it('serves the Polish page at / and the English one at /en, in the HTML (not filled in by scripts)', async () => {
    const pl = await call('GET', '/');
    assert.equal(pl.status, 200);
    assert.match(pl.headers.get('content-type') ?? '', /text\/html/);
    assert.match(pl.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.match(pl.text, /<html lang="pl">/);
    assert.match(pl.text, /<h1>Minecraft, tylko <span class="grad">lepiej<\/span>.<\/h1>/);
    assert.match(pl.text, /<summary>Ile kosztuje SlashClient\?<\/summary>/);
    assert.match(pl.text, /<h3>Mody z Modrinth<\/h3>/);
    assert.match(pl.text, /<link rel="canonical" href="http:\/\/localhost\/">/);
    assert.doesNotMatch(pl.text, /<!--home:/);
    const en = await call('GET', '/en');
    assert.equal(en.status, 200);
    assert.match(en.text, /<html lang="en">/);
    assert.match(en.text, /Minecraft, only <span class="grad">better<\/span>/);
    assert.match(en.text, /<link rel="canonical" href="http:\/\/localhost\/en">/);
    assert.match(en.text, /href="\/terms"/);
    assert.match(en.text, /<a class="foot-link" href="\/" hreflang="pl" lang="pl">Polski<\/a>/);
    // a browser that has it gets a 304
    const again = await call('GET', '/', undefined, undefined, { 'If-None-Match': pl.headers.get('etag')! });
    assert.equal(again.status, 304);
  });
});

describe('home page editor permissions', () => {
  it('is for admins only', async () => {
    assert.equal((await call('GET', '/v1/admin/home')).status, 401);
    for (const [method, url, body] of [
      ['GET', '/v1/admin/home'], ['GET', '/v1/admin/home/pl'], ['POST', '/v1/admin/home/pl/draft', { content: {} }],
      ['POST', '/v1/admin/home/pl/publish', { content: {} }], ['POST', '/v1/admin/home/pl/preview', { content: {} }],
      ['POST', '/v1/admin/home/versions/1/restore'], ['GET', '/v1/admin/home/versions/1'],
    ] as [string, string, unknown?][]) {
      assert.equal((await call(method, url, player, body)).status, 403, `${method} ${url}`);
    }
    assert.equal((await call('PUT', '/v1/admin/home/images', player, new Uint8Array([0x89, 0x50]))).status, 403);
  });

  it('gives admins the schema, the defaults and the icons', async () => {
    const r = await call('GET', '/v1/admin/home', adminToken);
    assert.equal(r.status, 200);
    assert.ok(r.body.sections.some((s: any) => s.id === 'faq'));
    assert.deepEqual(r.body.defaults.pl.faq, DEFAULTS.pl.faq);
    assert.ok(r.body.icons.includes('gauge-high'));
    const pl = await call('GET', '/v1/admin/home/pl', adminToken);
    assert.deepEqual(pl.body.content, DEFAULTS.pl);
    assert.equal(pl.body.published, null);
    assert.equal((await call('GET', '/v1/admin/home/de', adminToken)).status, 404);
  });
});

describe('home page validation', () => {
  const bad = async (content: unknown, expected: string, lang = 'pl') => {
    const r = await call('POST', `/v1/admin/home/${lang}/draft`, adminToken, { content });
    assert.equal(r.status, 400, expected);
    assert.equal(r.body.error, expected);
  };

  it('refuses what does not fit, naming the field', async () => {
    const c = () => clone(DEFAULTS.pl) as any;
    let x = c();
    x.meta.title = 'x'.repeat(121);
    await bad(x, 'bad_content:meta.title:too_long');
    x = c();
    x.meta.title = '   ';
    await bad(x, 'bad_content:meta.title:empty');
    x = c();
    x.nav.links[0].href = 'javascript:alert(1)';
    await bad(x, 'bad_content:nav.links.0.href:bad_link');
    x = c();
    x.nav.links[0].href = '//evil.example';
    await bad(x, 'bad_content:nav.links.0.href:bad_link');
    x = c();
    x.hero.image = 'http://insecure.example/a.png';
    await bad(x, 'bad_content:hero.image:bad_image');
    x = c();
    x.features.items[2].icon = 'fa-solid fa-no-such-icon-here';
    await bad(x, 'bad_content:features.items.2.icon:bad_icon');
    x = c();
    x.features.items[2].icon = 'fa-solid" onclick="x';
    await bad(x, 'bad_content:features.items.2.icon:bad_icon');
    x = c();
    x.faq.items = Array.from({ length: 41 }, () => ({ q: 'q', a: 'a' }));
    await bad(x, 'bad_content:faq.items:too_many');
    x = c();
    x.faq.items[1].a = '';
    await bad(x, 'bad_content:faq.items.1.a:empty');
    x = c();
    x.showcase.blocks[1].anchor = 'hud';
    await bad(x, 'bad_content:showcase.blocks.1.anchor:duplicate');
    x = c();
    x.showcase.blocks[1].anchor = 'faq';
    await bad(x, 'bad_content:showcase.blocks.1.anchor:bad_anchor');
    x = c();
    x.showcase.blocks[0].kind = 'cosmetics';
    await bad(x, 'bad_content:showcase.blocks:one_cosmetics');
    x = c();
    x.showcase.blocks[0].kind = 'video';
    await bad(x, 'bad_content:showcase.blocks.0.kind:choice');
    x = c();
    x.faq.openFirst = 'yes';
    await bad(x, 'bad_content:faq.openFirst:type');
    await bad('nope', 'bad_content::type');
    assert.equal((await call('POST', '/v1/admin/home/xx/draft', adminToken, { content: {} })).status, 404);
  });

  it('takes sections left out from the defaults and drops unknown fields', async () => {
    const r = await call('POST', '/v1/admin/home/pl/preview', adminToken, { content: { final: { title: 'Bierz!', button: 'Klik', extra: 'EXTRA-FIELD' } } });
    assert.equal(r.status, 200);
    assert.match(r.body.html, /<h2>Bierz!<\/h2>/);
    assert.match(r.body.html, /<summary>Ile kosztuje SlashClient\?<\/summary>/);
    assert.doesNotMatch(r.body.html, /EXTRA-FIELD/);
  });
});

describe('home page drafts and publishing', () => {
  it('keeps a draft off the page until it is published, and logs both', async () => {
    const draft = clone(DEFAULTS.pl) as any;
    draft.hero.titleHighlight = 'szybciej';
    const d = await call('POST', '/v1/admin/home/pl/draft', adminToken, { content: draft });
    assert.equal(d.status, 200);
    assert.ok(d.body.draft);
    assert.equal(d.body.content.hero.titleHighlight, 'szybciej');
    assert.match((await call('GET', '/')).text, /<span class="grad">lepiej<\/span>/);

    const published = clone(draft);
    published.faq.items.unshift({ q: 'Nowe pytanie?', a: 'Nowa odpowiedź.' });
    published.features.items.reverse();
    const p = await call('POST', '/v1/admin/home/pl/publish', adminToken, { content: published, note: 'Nowy tytuł' });
    assert.equal(p.status, 200);
    assert.equal(p.body.draft, null);
    assert.ok(p.body.published.publishedAt > 0);
    const page = (await call('GET', '/')).text;
    assert.match(page, /<span class="grad">szybciej<\/span>/);
    assert.match(page, /<details open><summary>Nowe pytanie\?<\/summary><p>Nowa odpowiedź.<\/p><\/details>/);
    assert.ok(page.indexOf('Aktualizacje') < page.indexOf('Wiele kont'), 'features in the new order');
    // the English page is its own
    assert.match((await call('GET', '/en')).text, /<span class="grad">better<\/span>/);

    const log = (await call('GET', '/v1/admin/log', adminToken)).body.entries as { action: string; target: string; detail: string }[];
    const pub = log.find((e) => e.action === 'home_publish');
    assert.ok(pub);
    assert.equal(pub.target, 'Strona główna (PL)');
    assert.match(pub.detail, /Nagłówek.*FAQ.*Nowy tytuł/);
    assert.ok(log.some((e) => e.action === 'home_draft'));
  });

  it('brings an old version back as a draft, and a section back to its defaults', async () => {
    const state = (await call('GET', '/v1/admin/home/pl', adminToken)).body;
    const first = state.versions.at(-1);
    const r = await call('POST', `/v1/admin/home/versions/${first.id}/restore`, adminToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.draft.id > first.id, true);
    assert.equal(r.body.content.hero.titleHighlight, 'szybciej');
    assert.equal(r.body.content.faq.items[0].q, 'Ile kosztuje SlashClient?');

    // "Przywróć domyślne" for a section: the editor sends the defaults; the log says so
    const back = clone(r.body.content);
    back.hero = clone(DEFAULTS.pl.hero);
    await call('POST', '/v1/admin/home/pl/publish', adminToken, { content: back });
    assert.match((await call('GET', '/')).text, /<span class="grad">lepiej<\/span>/);
    const log = (await call('GET', '/v1/admin/log', adminToken)).body.entries as { action: string; detail: string }[];
    assert.ok(log.some((e) => e.action === 'home_restore'));
    assert.match(log.find((e) => e.action === 'home_publish')!.detail, /Nagłówek \(na górze strony\) \(domyślne\)/);
  });
});

describe('home page escaping', () => {
  it('shows admin text as text, with only **bold** and safe links', async () => {
    const c = clone(DEFAULTS.en) as any;
    c.hero.titleHighlight = '<script>alert(1)</script>';
    c.hero.imageAlt = '" onerror="alert(1)';
    c.meta.title = '</title><script>alert(2)</script>';
    c.meta.appDescription = '</script><script>alert(3)</script>';
    c.faq.items[0].a = '**Free** [docs](https://example.com/a?b=1&c=2) [bad](javascript:alert(1)) <img src=x onerror=alert(4)>\nnew line';
    c.nav.links[0].label = '<b>Features</b>';
    const r = await call('POST', '/v1/admin/home/en/publish', adminToken, { content: c });
    assert.equal(r.status, 200);
    const page = (await call('GET', '/en')).text;
    assert.doesNotMatch(page, /<script>alert/);
    assert.doesNotMatch(page, /<img src=x/);
    assert.doesNotMatch(page, /href="javascript:/i);
    assert.doesNotMatch(page, /<b>Features/);
    assert.match(page, /<span class="grad">&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/span>/);
    assert.match(page, /alt="&quot; onerror=&quot;alert\(1\)"/);
    assert.match(page, /<title>&lt;\/title&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt;<\/title>/);
    assert.match(page, /\\u003c\/script>\\u003cscript>alert\(3\)/);
    assert.match(page, /<strong>Free<\/strong> <a href="https:\/\/example.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">docs<\/a> \[bad\]\(javascript:alert\(1\)\) &lt;img src=x onerror=alert\(4\)&gt;<br>new line/);
  });

  it('leaves hidden navigation links, buttons and footer links off the page, kept in the content', async () => {
    const c = clone(DEFAULTS.pl) as any;
    c.nav.links.find((l: any) => l.href === '/zgloszenia').hidden = true;
    c.nav.hideAccount = true;
    c.nav.hideDownload = true;
    c.footer.hideTerms = true;
    c.footer.hidePrivacy = true;
    assert.equal((await call('POST', '/v1/admin/home/pl/publish', adminToken, { content: c })).status, 200);
    const page = (await call('GET', '/')).text;
    const navPart = page.slice(page.indexOf('<nav class="nav-links">'), page.indexOf('</nav>'));
    assert.doesNotMatch(navPart, /\/zgloszenia/);
    assert.match(navPart, /#faq/);
    assert.doesNotMatch(page, /id="nav-account"/);
    assert.doesNotMatch(page, /class="btn primary" href="#pobierz"/);
    assert.match(page, /id="nav-admin"/);
    assert.doesNotMatch(page, /class="[^"]*foot-link" href="\/regulamin"/);
    assert.doesNotMatch(page, /class="[^"]*foot-link" href="\/polityka-prywatnosci"/);
    // still there for the editor
    const saved = (await call('GET', '/v1/admin/home/pl', adminToken)).body;
    const content = saved.published?.content ?? saved.content ?? saved.current?.content;
    assert.ok(JSON.stringify(content ?? saved).includes('/zgloszenia'));
    assert.equal((await call('POST', '/v1/admin/home/pl/publish', adminToken, { content: clone(DEFAULTS.pl) })).status, 200);
  });

  it('inline markup never lets HTML through', () => {
    assert.equal(inline('a <i>b</i> **c<d>** [e](/f"g)'), 'a &lt;i&gt;b&lt;/i&gt; <strong>c&lt;d&gt;</strong> [e](/f&quot;g)');
    assert.equal(inline('[x](#faq) [y](mailto:a@b.pl)'), '<a href="#faq">x</a> <a href="mailto:a@b.pl">y</a>');
  });
});

describe('home page pictures', () => {
  it('keeps uploaded PNG, JPEG and WebP pictures and serves them for good', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const r = await call('PUT', '/v1/admin/home/images', adminToken, png, { 'Content-Type': 'image/png' });
    assert.equal(r.status, 200);
    assert.match(r.body.url, /^\/v1\/home\/images\/[0-9a-f]{32}\.png$/);
    const img = await fetch(base + r.body.url);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.match(img.headers.get('cache-control') ?? '', /immutable/);
    assert.deepEqual(new Uint8Array(await img.arrayBuffer()), png);
    // usable as a picture of the page
    const c = clone(DEFAULTS.pl) as any;
    c.hero.image = r.body.url;
    assert.match((await call('POST', '/v1/admin/home/pl/preview', adminToken, { content: c })).body.html, new RegExp(`<img src="${r.body.url}"`));
    assert.equal((await call('PUT', '/v1/admin/home/images', adminToken, new TextEncoder().encode('<svg onload=alert(1)>'))).body.error, 'bad_picture');
    assert.equal((await fetch(`${base}/v1/home/images/${'0'.repeat(32)}.png`)).status, 404);
    const log = (await call('GET', '/v1/admin/log', adminToken)).body.entries as { action: string }[];
    assert.ok(log.some((e) => e.action === 'home_image'));
  });
});
