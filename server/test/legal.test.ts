import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { renderMarkdown, slug } from '../src/legal/markdown.ts';

const WEB = path.resolve(import.meta.dirname, '../web');
const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-legal-'));
const apps: ReturnType<typeof createApp>[] = [];

async function start(legalDraft?: boolean) {
  const app = createApp({ dbFile: path.join(dir, `test-${apps.length}.db`), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'], webDir: WEB, legalDraft });
  apps.push(app);
  await new Promise<void>((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  async function call(method: string, url: string, token?: string, body?: unknown) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, body: json, text, type: res.headers.get('content-type') ?? '', csp: res.headers.get('content-security-policy') ?? '' };
  }
  const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body.token as string;
  return { call, login };
}

let site: Awaited<ReturnType<typeof start>>;
before(async () => {
  site = await start();
});
after(async () => {
  for (const app of apps) await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('legal Markdown', () => {
  it('keeps out HTML, scripts and unsafe links', () => {
    const { html } = renderMarkdown([
      '## Tytuł <script>alert(1)</script>',
      'Tekst <img src=x onerror="alert(1)"> i <iframe src="https://evil"></iframe>',
      '[zły](javascript:alert(1)) [też zły](data:text/html,x) [//obcy](//evil.example) [dobry](https://uodo.gov.pl/) [strona](/regulamin) [mail](mailto:a@b.pl)',
      '[cudzysłów](/x"onmouseover="alert(1))',
    ].join('\n'));
    assert.doesNotMatch(html, /<script|<img|<iframe/i);
    assert.doesNotMatch(html, /href="(javascript|data):|href="\/\//i);
    assert.doesNotMatch(html, /\son\w+="/i);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /<a href="https:\/\/uodo.gov.pl\/" rel="noopener noreferrer">dobry<\/a>/);
    assert.match(html, /<a href="\/regulamin">strona<\/a>/);
    assert.match(html, /<a href="mailto:a@b.pl"/);
    assert.match(html, /zły/);
    assert.doesNotMatch(html, /<a [^>]*href="[^"/#hm]/);
  });

  it('reads headings, lists, tables, notes and inline marks', () => {
    const { html, toc } = renderMarkdown([
      '## 1. Postanowienia ogólne',
      '1. **ważne** i *pochyłe* z `kodem`',
      '2. dalej',
      '  - zagnieżdżone',
      '',
      '## Własna kotwica {#moja}',
      '> notka',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      'linia  ',
      'druga',
    ].join('\n'));
    assert.deepEqual(toc, [{ id: '1-postanowienia-ogolne', text: '1. Postanowienia ogólne' }, { id: 'moja', text: 'Własna kotwica' }]);
    assert.match(html, /<section id="1-postanowienia-ogolne"><h2>/);
    assert.match(html, /<ol><li><strong>ważne<\/strong> i <em>pochyłe<\/em> z <code>kodem<\/code><\/li><li>dalej<ul><li>zagnieżdżone<\/li><\/ul><\/li><\/ol>/);
    assert.match(html, /<p class="note">notka<\/p>/);
    assert.match(html, /<th>A<\/th><th>B<\/th>.*<td>1<\/td><td>2<\/td>/s);
    assert.match(html, /<p>linia<br>druga<\/p>/);
    assert.equal(slug('Łódź – żółć'), 'lodz-zolc');
  });

  it('fills variables (escaped) and marks the missing ones', () => {
    const { html } = renderMarkdown('Administrator: {{admin.name}}, e-mail {{admin.email}}. [UZUPEŁNIJ: data]', { 'admin.name': 'Jan <b>Kowalski</b>' });
    assert.match(html, /Jan &lt;b&gt;Kowalski&lt;\/b&gt;/);
    assert.match(html, /<span class="fill">\[UZUPEŁNIJ: adres e-mail do kontaktu\]<\/span>/);
    assert.match(html, /<span class="fill">\[UZUPEŁNIJ: data\]<\/span>/);
  });
});

describe('legal pages', () => {
  it('serves every document in Polish and English with its contents list, footer links and the draft banner', async () => {
    for (const [url, lang, title] of [
      ['/regulamin', 'pl', 'Regulamin SlashClient'], ['/terms', 'en', 'SlashClient Terms of Service'],
      ['/polityka-prywatnosci', 'pl', 'Polityka prywatności SlashClient'], ['/privacy', 'en', 'SlashClient Privacy Policy'],
      ['/wsparcie/regulamin', 'pl', 'Regulamin wsparcia SlashClient'], ['/support/terms', 'en', 'SlashClient Support Terms'],
    ]) {
      const r = await site.call('GET', url);
      assert.equal(r.status, 200, url);
      assert.equal(r.type, 'text/html; charset=utf-8');
      assert.match(r.csp, /script-src 'self'/);
      assert.match(r.text, new RegExp(`<html lang="${lang}">`));
      assert.match(r.text, new RegExp(`<h1>${title}</h1>`));
      assert.match(r.text, /class="legal-toc"/);
      assert.match(r.text, /class="legal-draft"/, `${url}: banner on by default`);
      assert.match(r.text, /href="\/(regulamin|terms)"/);
      assert.match(r.text, /href="\/(polityka-prywatnosci|privacy)"/);
    }
    const terms = (await site.call('GET', '/regulamin')).text;
    assert.match(terms, /NOT AN OFFICIAL MINECRAFT PRODUCT/);
    assert.match(terms, /Ostatnia aktualizacja: <time/);
    // the support terms with the refund wording of the account page
    assert.match((await site.call('GET', '/wsparcie/regulamin')).text, /Zwrot: <a href="\/konto#wsparcie">konto<\/a> → Wsparcie projektu → Poproś o zwrot/);
  });

  it('leaves the banner out with LEGAL_DRAFT=0', async () => {
    const other = await start(false);
    const r = await other.call('GET', '/regulamin');
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.text, /class="legal-draft"/);
  });

  it('links both documents from the footer of the main pages and the sign-in', async () => {
    for (const page of ['index.html', 'konto.html', 'zgloszenia.html', 'logi.html', 'media.html', 'profil.html', 'wsparcie.html']) {
      const html = readFileSync(path.join(WEB, page), 'utf8');
      assert.match(html, /<footer[\s\S]*href="\/regulamin"[\s\S]*<\/footer>/, page);
      assert.match(html, /<footer[\s\S]*href="\/polityka-prywatnosci"[\s\S]*<\/footer>/, page);
    }
    assert.match(readFileSync(path.join(WEB, 'legalNotice.js'), 'utf8'), /Logując się, akceptujesz/);
    assert.equal((await site.call('GET', '/')).status, 200);
  });
});

describe('legal documents in the admin panel', () => {
  it('is for admins only', async () => {
    const player = await site.login('Gracz');
    assert.equal((await site.call('GET', '/v1/admin/legal')).status, 401);
    assert.equal((await site.call('GET', '/v1/admin/legal', player)).status, 403);
    assert.equal((await site.call('POST', '/v1/admin/legal/terms/pl/publish', player, { body: '## x' })).status, 403);
    assert.equal((await site.call('POST', '/v1/admin/legal/vars', player, { vars: { 'admin.email': 'x@y.pl' } })).status, 403);
  });

  it('keeps drafts off the site until published, with history, restore and the audit log', async () => {
    const boss = await site.login('Szef');
    const list = await site.call('GET', '/v1/admin/legal', boss);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.docs.map((d: any) => d.id), ['terms', 'privacy', 'support-terms']);
    const first = await site.call('GET', '/v1/admin/legal/terms/pl', boss);
    const seeded = first.body.published;
    assert.ok(seeded.body.includes('NOT AN OFFICIAL MINECRAFT PRODUCT'));

    // a draft: the editor has it, the site does not
    const draft = await site.call('POST', '/v1/admin/legal/terms/pl/draft', boss, { body: '## Szkic\nTekst szkicu' });
    assert.equal(draft.status, 200);
    assert.equal(draft.body.draft.body, '## Szkic\nTekst szkicu');
    assert.doesNotMatch((await site.call('GET', '/regulamin')).text, /Tekst szkicu/);

    // published: the site shows it, the draft is gone, the date is the publishing time
    const pub = await site.call('POST', '/v1/admin/legal/terms/pl/publish', boss, { body: '## Nowe\nTekst <script>x</script> opublikowany', note: 'Nowa wersja' });
    assert.equal(pub.status, 200);
    assert.equal(pub.body.draft, null);
    const page = (await site.call('GET', '/regulamin')).text;
    assert.match(page, /Tekst &lt;script&gt;x&lt;\/script&gt; opublikowany/);
    assert.doesNotMatch(page, /NOT AN OFFICIAL/);
    assert.equal(pub.body.versions.length, 3);

    // restoring the seeded version makes it a draft; publishing it brings it back
    const restored = await site.call('POST', `/v1/admin/legal/versions/${seeded.id}/restore`, boss);
    assert.equal(restored.body.draft.body, seeded.body);
    assert.equal(restored.body.draft.restoredFrom, seeded.id);
    assert.equal((await site.call('GET', `/v1/admin/legal/versions/${seeded.id}`, boss)).body.body, seeded.body);
    await site.call('POST', '/v1/admin/legal/terms/pl/publish', boss, { body: restored.body.draft.body });
    assert.match((await site.call('GET', '/regulamin')).text, /NOT AN OFFICIAL MINECRAFT PRODUCT/);

    // the banner per document: off, then back to the server's default
    assert.equal((await site.call('POST', '/v1/admin/legal/terms/banner', boss, { banner: false })).body.bannerShown, false);
    assert.doesNotMatch((await site.call('GET', '/regulamin')).text, /class="legal-draft"/);
    assert.match((await site.call('GET', '/polityka-prywatnosci')).text, /class="legal-draft"/);
    assert.equal((await site.call('POST', '/v1/admin/legal/terms/banner', boss, { banner: null })).body.bannerShown, true);

    // the administrator's details fill every document
    assert.match((await site.call('GET', '/polityka-prywatnosci')).text, /\[UZUPEŁNIJ: adres e-mail do kontaktu\]/);
    const vars = await site.call('POST', '/v1/admin/legal/vars', boss, { vars: { 'admin.email': 'kontakt@slash3rss.dev', 'admin.name': 'Jan Testowy', other: 'x' } });
    assert.deepEqual(vars.body.vars, { 'admin.email': 'kontakt@slash3rss.dev', 'admin.name': 'Jan Testowy' });
    for (const url of ['/regulamin', '/privacy', '/wsparcie/regulamin']) {
      const text = (await site.call('GET', url)).text;
      assert.match(text, /kontakt@slash3rss\.dev/, url);
      assert.match(text, /Jan Testowy/, url);
    }
    // the preview uses them too
    assert.match((await site.call('POST', '/v1/admin/legal/preview', boss, { body: '{{admin.email}}' })).body.html, /kontakt@slash3rss\.dev/);

    // bad requests
    assert.equal((await site.call('POST', '/v1/admin/legal/nope/pl/draft', boss, { body: 'x' })).status, 404);
    assert.equal((await site.call('POST', '/v1/admin/legal/terms/de/draft', boss, { body: 'x' })).status, 404);
    assert.equal((await site.call('POST', '/v1/admin/legal/terms/pl/draft', boss, { body: '   ' })).status, 400);
    assert.equal((await site.call('POST', '/v1/admin/legal/terms/pl/draft', boss, { body: 'x'.repeat(200_001) })).status, 413);

    const log = (await site.call('GET', '/v1/admin/log', boss)).body;
    const actions = (log.entries ?? log.log ?? log).map((e: any) => e.action);
    for (const a of ['legal_draft', 'legal_publish', 'legal_restore', 'legal_banner', 'legal_vars']) assert.ok(actions.includes(a), a);
  });

  it('tells signed-in players once about an important change', async () => {
    const boss = await site.login('Szef');
    const player = await site.login('Czytelnik');
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual((await site.call('GET', '/v1/me/legal-notices', player)).body.notices, []);
    const body = (await site.call('GET', '/v1/admin/legal/privacy/pl', boss)).body.published.body;
    await site.call('POST', '/v1/admin/legal/privacy/pl/publish', boss, { body, major: true, note: 'Nowi odbiorcy danych' });
    const notices = (await site.call('GET', '/v1/me/legal-notices', player)).body.notices;
    assert.equal(notices.length, 1);
    assert.equal(notices[0].doc, 'privacy');
    assert.equal(notices[0].note, 'Nowi odbiorcy danych');
    assert.equal(notices[0].pl.path, '/polityka-prywatnosci');
    assert.equal((await site.call('POST', '/v1/me/legal-notices/ack', player, { doc: 'privacy', version: notices[0].version })).status, 200);
    assert.deepEqual((await site.call('GET', '/v1/me/legal-notices', player)).body.notices, []);
    // an account made after the change is not told about it
    const later = await site.login('Nowy');
    assert.deepEqual((await site.call('GET', '/v1/me/legal-notices', later)).body.notices, []);
    // the public list says when it changed
    const docs = (await site.call('GET', '/v1/legal')).body.docs;
    assert.ok(docs.find((d: any) => d.id === 'privacy').majorAt > 0);
    assert.equal(docs.find((d: any) => d.id === 'terms').majorAt, 0);
  });
});
