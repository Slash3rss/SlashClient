import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  LANGS, type Lang, type PageMeta, SECTIONS, composePage, isImageName, isLang, isSlug, pagePath, parsePage, renderPage, sectionOf,
} from './format.ts';
import { type PageRef, type SectionRefs, sectionTitle, wikiArticlePage, wikiIndexPage } from './pages.ts';
import { MAX_BODY, WikiStore, hashOf } from './store.ts';

/**
 * The SlashClient wiki: its pages on the site (/wiki, /wiki/<slug>, English under /en/wiki), its
 * pictures (/wiki/img/<name>), the API the launcher's Wiki view and the site's search read
 * (/v1/wiki, /v1/wiki/<slug>), the sitemap of its pages and the admin panel's "Wiki" editor.
 * The feature switch "Wiki" (features.ts) turns all but the editor off.
 */

export interface WikiContext {
  sql: DatabaseSync;
  publicUrl: string;
  /** Where pictures uploaded in the panel are kept (next to the database). */
  imageDir: string;
  admin: (req: http.IncomingMessage) => string;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  versioned: (html: string) => string;
  /** The biggest picture an admin may upload (setting wiki.maxImageBytes). */
  maxImage: () => number;
  /** Whether a page is hidden in the home page's editor (its link leaves the wiki's menu too). */
  hidden?: (path: string) => boolean;
  seedDir?: string;
  now?: () => number;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
function imageType(data: Buffer): string | undefined {
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.length > 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

const CSP = "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const PAGE = /^\/(en\/)?wiki(?:\/([a-z0-9-]{1,64}))?\/?$/;

/** Text from the renderer's escaped HTML, for the search index and the launcher's lists. */
const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

interface Live { slug: string; lang: Lang; body: string; publishedAt: number; title: string; meta: PageMeta; content: string }

export function wikiRoutes(ctx: WikiContext) {
  const store = new WikiStore(ctx.sql, { seedDir: ctx.seedDir, now: ctx.now });
  const base = ctx.publicUrl.replace(/\/+$/, '');
  const seedImages = path.join(store.seedDir, 'img');
  mkdirSync(ctx.imageDir, { recursive: true });

  // ---------- pictures ----------

  /** Uploaded pictures and the code's, by name (an upload never takes a name the code uses). */
  let pictureCount = 0;
  const imageFile = (name: string): string | undefined => {
    if (!isImageName(name)) return undefined;
    for (const dir of [ctx.imageDir, seedImages]) {
      const file = path.join(dir, name);
      if (existsSync(file)) return file;
    }
    return undefined;
  };
  function images(): { name: string; size: number; source: 'seed' | 'upload'; at: number }[] {
    const out = new Map<string, { name: string; size: number; source: 'seed' | 'upload'; at: number }>();
    for (const [dir, source] of [[seedImages, 'seed'], [ctx.imageDir, 'upload']] as const) {
      let names: string[] = [];
      try {
        names = readdirSync(dir);
      } catch { /* none yet */ }
      for (const name of names) {
        if (!isImageName(name)) continue;
        try {
          const s = statSync(path.join(dir, name));
          out.set(name, { name, size: s.size, source, at: s.mtimeMs });
        } catch { /* gone meanwhile */ }
      }
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------- the live pages ----------

  /** What a language shows: each page's own version, else the other language's (a page not translated yet). */
  let liveCache: { key: string; pages: Record<Lang, Live[]> } | undefined;
  function live(lang: Lang): Live[] {
    const key = store.stamp();
    if (liveCache?.key !== key) {
      const all = { pl: [] as Live[], en: [] as Live[] };
      for (const slug of store.slugs()) {
        const pub = { pl: store.published(slug, 'pl'), en: store.published(slug, 'en') };
        for (const l of LANGS) {
          const v = pub[l] ?? pub[l === 'pl' ? 'en' : 'pl'];
          if (!v) continue;
          const parsed = parsePage(v.body, slug);
          all[l].push({ slug, lang: v.lang, body: v.body, publishedAt: v.publishedAt, ...parsed });
        }
      }
      const rank = (id: string) => {
        const i = SECTIONS.findIndex((s) => s.id === id);
        return i < 0 ? SECTIONS.length : i;
      };
      for (const l of LANGS) all[l].sort((a, b) => rank(a.meta.section) - rank(b.meta.section) || a.meta.order - b.meta.order || a.title.localeCompare(b.title, l));
      liveCache = { key, pages: all };
    }
    return liveCache.pages[lang];
  }

  const renderCache = new Map<string, ReturnType<typeof renderPage>>();
  function rendered(p: Live, lang: Lang, absolute = false) {
    const key = `${hashOf(p.body)}:${lang}:${absolute ? 1 : 0}:${pictureCount}`;
    let r = renderCache.get(key);
    if (!r) {
      r = renderPage(p.content, lang, { image: (n) => !!imageFile(n), base: absolute ? base : undefined });
      if (renderCache.size > 500) renderCache.clear();
      renderCache.set(key, r);
    }
    return r;
  }

  function sectionsOf(lang: Lang): SectionRefs[] {
    const out: SectionRefs[] = [];
    for (const p of live(lang)) {
      const s = sectionTitle(sectionOf(p.meta.section).id, lang);
      let group = out.find((g) => g.id === s.id);
      if (!group) out.push(group = { ...s, pages: [] });
      group.pages.push({ slug: p.slug, title: p.title, meta: p.meta, lang: p.lang, headings: rendered(p, lang).headings.map(plain) });
    }
    return out;
  }

  const ref = (p: Live | undefined) => (p ? { slug: p.slug, title: p.title } : null);
  const find = (slug: string, lang: Lang) => {
    const pages = live(lang);
    const i = pages.findIndex((p) => p.slug === slug);
    return i < 0 ? undefined : { page: pages[i], prev: pages[i - 1], next: pages[i + 1] };
  };

  // ---------- the admin panel ----------

  async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY * 4 + 4096) ctx.fail(413, 'too_large');
      chunks.push(chunk);
    }
    try {
      const v = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return ctx.fail(400, 'bad_request');
    }
  }
  async function raw(req: http.IncomingMessage, max: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    // the rest of a too big upload is read and dropped, so the sender gets the answer instead of a broken connection
    for await (const chunk of req) {
      size += chunk.length;
      if (size <= max) chunks.push(chunk);
    }
    if (size > max) ctx.fail(413, 'too_large');
    return Buffer.concat(chunks);
  }
  const text = (v: unknown): string => {
    if (typeof v !== 'string') ctx.fail(400, 'bad_request');
    const s = (v as string).replace(/\r\n?/g, '\n');
    if (s.length > MAX_BODY) ctx.fail(413, 'too_large');
    if (!s.trim()) ctx.fail(400, 'empty');
    return s;
  };
  const note = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300) : '');
  const pageOr404 = (slug: string, lang?: string): Lang => {
    if (!isSlug(slug) || !store.exists(slug) || (lang !== undefined && !isLang(lang))) ctx.fail(404, 'not_found');
    return (lang ?? 'pl') as Lang;
  };
  const titleOf = (slug: string) => {
    const v = store.draft(slug, 'pl') ?? store.published(slug, 'pl') ?? store.draft(slug, 'en') ?? store.published(slug, 'en');
    return v ? parsePage(v.body, slug).title : slug;
  };
  const target = (slug: string, lang?: Lang) => `Wiki: ${titleOf(slug)}${lang ? ` (${lang.toUpperCase()})` : ''}`;

  /** The editor's view of one page: both languages, their versions and how they stand against the code. */
  const editorView = (slug: string) => ({
    slug, path: pagePath('pl', slug),
    langs: Object.fromEntries(LANGS.map((l) => [l, {
      path: pagePath(l, slug),
      published: store.published(slug, l) ?? null,
      draft: store.draft(slug, l) ?? null,
      versions: store.versions(slug, l),
      seed: store.seedState(slug, l),
    }])),
  });

  /** The panel's list: every page with its details (from the newest text, draft or not) and each language's state. */
  const adminList = () => store.slugs().map((slug) => {
    const langs = Object.fromEntries(LANGS.map((l) => {
      const pub = store.published(slug, l);
      const draft = store.draft(slug, l);
      const seed = store.seedState(slug, l);
      return [l, { publishedAt: pub?.publishedAt ?? 0, draftAt: draft?.createdAt ?? 0, follows: seed.follows, seedNewer: seed.newer && !seed.follows, seed: seed.exists }];
    }));
    const v = store.draft(slug, 'pl') ?? store.published(slug, 'pl') ?? store.draft(slug, 'en') ?? store.published(slug, 'en');
    const p = parsePage(v?.body ?? '', slug);
    return { slug, title: p.title, ...p.meta, langs };
  });

  const routes: [string, RegExp, Handler][] = [
    // ---- for the launcher and the site's search ----
    ['GET', /^\/v1\/wiki$/, (_req, _p, url) => {
      const lang: Lang = url.searchParams.get('lang') === 'en' ? 'en' : 'pl';
      return {
        lang,
        url: `${base}${pagePath(lang)}`,
        sections: sectionsOf(lang).map((s) => ({
          id: s.id, title: s.title, icon: s.icon,
          pages: s.pages.map((p) => ({ slug: p.slug, title: p.title, description: p.meta.description, icon: p.meta.icon, order: p.meta.order, lang: p.lang, headings: p.headings })),
        })),
      };
    }],
    ['GET', /^\/v1\/wiki\/([a-z0-9-]{1,64})$/, (_req, [asked], url) => {
      const lang: Lang = url.searchParams.get('lang') === 'en' ? 'en' : 'pl';
      const slug = find(asked, lang) ? asked : store.redirect(asked) ?? asked;
      const at = find(slug, lang) ?? ctx.fail(404, 'not_found');
      const p = at.page;
      const r = rendered(p, lang, true);
      return {
        slug: p.slug, lang: p.lang, title: p.title, description: p.meta.description, icon: p.meta.icon,
        section: sectionTitle(sectionOf(p.meta.section).id, lang), html: r.html, toc: r.toc.map((e) => ({ id: e.id, text: plain(e.text) })),
        updatedAt: p.publishedAt, url: `${base}${pagePath(lang, p.slug)}`, prev: ref(at.prev), next: ref(at.next),
      };
    }],

    // ---- the admin panel ----
    ['GET', /^\/v1\/admin\/wiki$/, (req) => {
      ctx.admin(req);
      const deleted = (ctx.sql.prepare('SELECT slug, at FROM wiki_deleted WHERE slug IN (SELECT slug FROM wiki_versions) AND slug NOT IN (SELECT slug FROM wiki_redirects) ORDER BY at DESC').all() as { slug: string; at: number }[]);
      return { sections: SECTIONS, pages: adminList(), deleted, maxImage: ctx.maxImage() };
    }],
    ['GET', /^\/v1\/admin\/wiki\/images$/, (req) => {
      ctx.admin(req);
      return { images: images(), maxImage: ctx.maxImage() };
    }],
    // a picture for the wiki (PNG, JPEG or WebP) under a name made from the file's ("Mapa 1.png" → "mapa-1.png");
    // the same picture again keeps its name, another one with a taken name gets "-2", "-3"…
    ['PUT', /^\/v1\/admin\/wiki\/images$/, async (req, _p, url) => {
      const me = ctx.admin(req);
      const data = await raw(req, ctx.maxImage());
      const kind = imageType(data);
      if (!kind) ctx.fail(400, 'bad_picture');
      const wanted = (url.searchParams.get('name') ?? '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 60) || 'obrazek';
      const hash = createHash('sha256').update(data).digest('hex');
      let name = '';
      for (let n = 1; n < 1000; n++) {
        const candidate = `${wanted}${n > 1 ? `-${n}` : ''}.${kind}`;
        const file = imageFile(candidate);
        if (!file) {
          name = candidate;
          await writeFile(path.join(ctx.imageDir, candidate), data);
          pictureCount++;
          break;
        }
        if (createHash('sha256').update(await readFile(file)).digest('hex') === hash) {
          name = candidate;
          break;
        }
      }
      if (!name) ctx.fail(409, 'name_taken');
      ctx.audit(me, 'wiki_image', 'Wiki', `${name} (${Math.round(data.length / 1024)} kB)`);
      return { name, url: `/wiki/img/${name}` };
    }],
    ['GET', /^\/v1\/admin\/wiki\/versions\/(\d{1,12})$/, (req, [id]) => {
      ctx.admin(req);
      return store.version(Number(id)) ?? ctx.fail(404, 'not_found');
    }],
    // an old version comes back as a new draft (publishing it is a separate step)
    ['POST', /^\/v1\/admin\/wiki\/versions\/(\d{1,12})\/restore$/, (req, [id]) => {
      const me = ctx.admin(req);
      const old = store.version(Number(id)) ?? ctx.fail(404, 'not_found');
      if (!store.exists(old.slug)) ctx.fail(404, 'not_found');
      store.saveDraft(old.slug, old.lang, old.body, me, old.id);
      ctx.audit(me, 'wiki_restore', target(old.slug, old.lang), `z wersji ${old.id}`);
      return editorView(old.slug);
    }],
    // the editor's live preview, rendered here so it matches the site exactly
    ['POST', /^\/v1\/admin\/wiki\/preview$/, async (req) => {
      ctx.admin(req);
      const b = await body(req);
      const source = typeof b.body === 'string' ? b.body.slice(0, MAX_BODY) : '';
      const lang: Lang = b.lang === 'en' ? 'en' : 'pl';
      const p = parsePage(source);
      const r = renderPage(p.content, lang, { image: (n) => !!imageFile(n) });
      return { title: p.title, meta: p.meta, html: r.html, toc: r.toc };
    }],
    // a new page: a draft in both languages with its details (published when the admin publishes it)
    ['POST', /^\/v1\/admin\/wiki\/pages$/, async (req) => {
      const me = ctx.admin(req);
      const b = await body(req);
      if (!isSlug(b.slug)) ctx.fail(400, 'bad_slug');
      const slug = b.slug as string;
      if (store.exists(slug)) ctx.fail(409, 'exists');
      const section = typeof b.section === 'string' && /^[a-z0-9-]{1,30}$/.test(b.section) ? b.section : 'inne';
      const titles = { pl: typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '', en: typeof b.titleEn === 'string' ? b.titleEn.trim().slice(0, 200) : '' };
      if (!titles.pl) ctx.fail(400, 'empty');
      const order = (Math.max(0, ...live('pl').filter((p) => p.meta.section === section).map((p) => p.meta.order)) || 0) + 10;
      for (const l of LANGS) {
        store.saveDraft(slug, l, composePage({ section, order, icon: 'fa-file-lines', description: '' }, titles[l] || titles.pl, l === 'pl' ? 'Treść strony…\n' : 'Page content…\n'), me);
      }
      ctx.audit(me, 'wiki_create', target(slug), slug);
      return editorView(slug);
    }],
    ['GET', /^\/v1\/admin\/wiki\/pages\/([a-z0-9-]{1,64})$/, (req, [slug]) => {
      ctx.admin(req);
      pageOr404(slug);
      return editorView(slug);
    }],
    ['DELETE', /^\/v1\/admin\/wiki\/pages\/([a-z0-9-]{1,64})$/, (req, [slug]) => {
      const me = ctx.admin(req);
      pageOr404(slug);
      const what = target(slug);
      store.remove(slug, me);
      ctx.audit(me, 'wiki_delete', what, slug);
      return { ok: true };
    }],
    // a deleted page back (its versions were kept)
    ['POST', /^\/v1\/admin\/wiki\/pages\/([a-z0-9-]{1,64})\/undelete$/, (req, [slug]) => {
      const me = ctx.admin(req);
      if (!isSlug(slug) || !store.deleted(slug) || !ctx.sql.prepare('SELECT 1 FROM wiki_versions WHERE slug = ?').get(slug)) ctx.fail(404, 'not_found');
      store.undelete(slug);
      store.syncSeed();
      ctx.audit(me, 'wiki_undelete', target(slug), slug);
      return editorView(slug);
    }],
    ['POST', /^\/v1\/admin\/wiki\/pages\/([a-z0-9-]{1,64})\/rename$/, async (req, [slug]) => {
      const me = ctx.admin(req);
      pageOr404(slug);
      const { to } = await body(req);
      if (!isSlug(to)) ctx.fail(400, 'bad_slug');
      if (to === slug) return editorView(slug);
      if (store.exists(to as string)) ctx.fail(409, 'exists');
      store.rename(slug, to as string, me);
      ctx.audit(me, 'wiki_rename', target(to as string), `${slug} → ${to}`);
      return editorView(to as string);
    }],
    // the text in the code, for the editor to load and compare
    ['GET', /^\/v1\/admin\/wiki\/pages\/([a-z0-9-]{1,64})\/(\w+)\/seed$/, (req, [slug, lang]) => {
      ctx.admin(req);
      const body = store.seed(slug, pageOr404(slug, lang));
      return body === undefined ? ctx.fail(404, 'not_found') : { body };
    }],
    // the code's version published, and the page follows the code again (new texts from deploys reach it)
    ['POST', /^\/v1\/admin\/wiki\/pages\/([a-z0-9-]{1,64})\/(\w+)\/seed$/, (req, [slug, lang]) => {
      const me = ctx.admin(req);
      const l = pageOr404(slug, lang);
      const seed = store.seed(slug, l) ?? ctx.fail(404, 'not_found');
      const v = store.publish(slug, l, seed, me, 'Wersja z kodu', hashOf(seed));
      ctx.audit(me, 'wiki_seed', target(slug, l), `wersja ${v.id}`);
      return editorView(slug);
    }],
    ['POST', /^\/v1\/admin\/wiki\/pages\/([a-z0-9-]{1,64})\/(\w+)\/draft$/, async (req, [slug, lang]) => {
      const me = ctx.admin(req);
      const l = pageOr404(slug, lang);
      const v = store.saveDraft(slug, l, text((await body(req)).body), me);
      ctx.audit(me, 'wiki_draft', target(slug, l), `wersja ${v.id}`);
      return editorView(slug);
    }],
    ['POST', /^\/v1\/admin\/wiki\/pages\/([a-z0-9-]{1,64})\/(\w+)\/publish$/, async (req, [slug, lang]) => {
      const me = ctx.admin(req);
      const l = pageOr404(slug, lang);
      const b = await body(req);
      const v = store.publish(slug, l, text(b.body), me, note(b.note));
      ctx.audit(me, 'wiki_publish', target(slug, l), `wersja ${v.id}${v.note ? `: ${v.note}` : ''}`);
      return editorView(slug);
    }],
  ];

  const html = (res: http.ServerResponse, req: http.IncomingMessage, status: number, page: string) => {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
      'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : ctx.versioned(page));
  };

  /** The wiki's pages, its pictures and its sitemap; false for any other address (and a page that does not exist). */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const picture = /^\/wiki\/img\/([^/]+)$/.exec(url.pathname);
    if (picture) {
      const file = imageFile(picture[1]);
      if (!file) return false;
      const data = await readFile(file).catch(() => undefined);
      if (!data) return false;
      const etag = `"${createHash('sha256').update(data).digest('base64url').slice(0, 22)}"`;
      // a name can get a new picture with a deploy (the code's) or never (uploads): a day, then asked again with the ETag
      const headers = { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers).end();
        return true;
      }
      res.writeHead(200, { ...headers, 'Content-Type': IMAGE_TYPES[path.extname(file).slice(1)], 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
      return true;
    }
    if (url.pathname === '/sitemap-wiki.xml') {
      const urls = LANGS.flatMap((l) => [pagePath(l), ...live(l).filter((p) => p.lang === l).map((p) => pagePath(l, p.slug))])
        .map((p) => `  <url><loc>${base}${p}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>`);
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
      return true;
    }
    const m = PAGE.exec(url.pathname);
    if (!m) return false;
    const lang: Lang = m[1] ? 'en' : 'pl';
    const slug = m[2];
    if (!slug) {
      html(res, req, 200, wikiIndexPage({ lang, sections: sectionsOf(lang), q: url.searchParams.get('q') ?? undefined, publicUrl: ctx.publicUrl, hidden: ctx.hidden }));
      return true;
    }
    const at = find(slug, lang);
    if (!at) {
      // a renamed page: its new address
      const to = store.redirect(slug);
      if (to && find(to, lang)) {
        res.writeHead(301, { Location: pagePath(lang, to), 'Cache-Control': 'no-cache' }).end();
        return true;
      }
      return false;
    }
    const r = rendered(at.page, lang);
    const ref = (p?: Live): PageRef | undefined => (p ? { slug: p.slug, title: p.title, meta: p.meta, lang: p.lang, headings: [] } : undefined);
    html(res, req, 200, wikiArticlePage({
      lang, page: ref(at.page)!, html: r.html, toc: r.toc, updatedAt: at.page.publishedAt, sections: sectionsOf(lang),
      prev: ref(at.prev), next: ref(at.next), publicUrl: ctx.publicUrl, hidden: ctx.hidden,
    }));
    return true;
  }

  return { routes, serve, store };
}
