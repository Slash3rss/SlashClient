import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { type Content, ContentError, type Item, DEFAULTS, LANGS, type Lang, SECTIONS, checkContent, isLang, storedContent } from './content.ts';
import { UI, homePage } from './page.ts';

/**
 * The home page (/ and /en) made from the content edited in the admin panel's "Strona główna",
 * the editor's API (drafts, publishing, history, restoring, a preview, pictures) and the pictures.
 *
 * Like the legal documents, every save is a new version of one language's content (a JSON of every
 * section): a draft (published_at 0) or a published one. The page shows the newest published version,
 * or the defaults (content.ts) while there is none; nothing is overwritten, so any version can come back.
 */

export interface HomeContext {
  sql: DatabaseSync;
  webDir?: string;
  publicUrl: string;
  /** Where uploaded pictures are kept (next to the database). */
  imageDir: string;
  admin: (req: http.IncomingMessage) => string;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  versioned: (html: string) => string;
  /** The newest release's badge text per language (downloads.ts), for "Plakietka z najnowszego wydania". */
  news?: () => Promise<Partial<Record<Lang, { text: string; href: string }>>>;
  now?: () => number;
  fail: (status: number, code: string) => never;
}

export interface HomeVersion { id: number; lang: Lang; createdAt: number; by: string; byHandle: string | null; publishedAt: number; note: string; restoredFrom: number }
export interface FullHomeVersion extends HomeVersion { content: Content }

/** The biggest content accepted (bytes of JSON), and the biggest picture. */
const MAX_JSON = 400_000;
export const MAX_IMAGE = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

function imageType(data: Buffer): string | undefined {
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.length > 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

const CSP = "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
/** The addresses of the page: Polish at /, English at /en. */
const PATHS: Record<string, Lang> = { '/': 'pl', '/index.html': 'pl', '/en': 'en' };

const COLUMNS = `v.id, v.lang, v.created_at AS createdAt, v.by_uuid AS "by", u.handle AS byHandle, v.published_at AS publishedAt, v.note, v.restored_from AS restoredFrom`;

export class HomeStore {
  private readonly sql: DatabaseSync;
  private readonly now: () => number;

  constructor(sql: DatabaseSync, now: () => number = Date.now) {
    this.sql = sql;
    this.now = now;
    sql.exec(`
CREATE TABLE IF NOT EXISTS home_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, lang TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL,
  by_uuid TEXT NOT NULL DEFAULT '', published_at INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', restored_from INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS home_versions_lang ON home_versions (lang, id);`);
  }

  private full(r: (HomeVersion & { content: string }) | undefined): FullHomeVersion | undefined {
    if (!r) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.content);
    } catch {
      parsed = {};
    }
    return { ...r, content: storedContent(parsed, r.lang) };
  }

  published(lang: Lang): FullHomeVersion | undefined {
    return this.full(this.sql.prepare(`SELECT ${COLUMNS}, v.content FROM home_versions v LEFT JOIN users u ON u.uuid = v.by_uuid
      WHERE v.lang = ? AND v.published_at > 0 ORDER BY v.published_at DESC, v.id DESC LIMIT 1`).get(lang) as (HomeVersion & { content: string }) | undefined);
  }

  /** The newest published version's id (0 for the defaults): what the page's cache is keyed on. */
  publishedId(lang: Lang): number {
    return (this.sql.prepare('SELECT id FROM home_versions WHERE lang = ? AND published_at > 0 ORDER BY published_at DESC, id DESC LIMIT 1').get(lang) as { id: number } | undefined)?.id ?? 0;
  }

  /** A draft saved after the published version, if any (what the editor opens). */
  draft(lang: Lang): FullHomeVersion | undefined {
    return this.full(this.sql.prepare(`SELECT ${COLUMNS}, v.content FROM home_versions v LEFT JOIN users u ON u.uuid = v.by_uuid
      WHERE v.lang = ? AND v.published_at = 0 AND v.id > ? ORDER BY v.id DESC LIMIT 1`).get(lang, this.publishedId(lang)) as (HomeVersion & { content: string }) | undefined);
  }

  version(id: number): FullHomeVersion | undefined {
    return this.full(this.sql.prepare(`SELECT ${COLUMNS}, v.content FROM home_versions v LEFT JOIN users u ON u.uuid = v.by_uuid WHERE v.id = ?`)
      .get(id) as (HomeVersion & { content: string }) | undefined);
  }

  versions(lang: Lang, limit = 100): HomeVersion[] {
    return this.sql.prepare(`SELECT ${COLUMNS} FROM home_versions v LEFT JOIN users u ON u.uuid = v.by_uuid WHERE v.lang = ? ORDER BY v.id DESC LIMIT ?`)
      .all(lang, limit) as unknown as HomeVersion[];
  }

  /** What the page shows now: the published content, or the defaults. */
  live(lang: Lang): Content {
    return this.published(lang)?.content ?? structuredClone(DEFAULTS[lang]);
  }

  save(lang: Lang, content: Content, by: string, o: { publish?: boolean; note?: string; restoredFrom?: number } = {}): FullHomeVersion {
    const at = this.now();
    const id = Number(this.sql.prepare('INSERT INTO home_versions (lang, content, created_at, by_uuid, published_at, note, restored_from) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(lang, JSON.stringify(content), at, by, o.publish ? at : 0, o.note ?? '', o.restoredFrom ?? 0).lastInsertRowid);
    return this.version(id)!;
  }
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

/** The icons the vendored Font Awesome has ("gauge-high"), from its stylesheet; undefined without one. */
function iconNames(webDir?: string): Set<string> | undefined {
  if (!webDir) return undefined;
  try {
    const css = readFileSync(path.join(webDir, 'vendor/fa/css/all.min.css'), 'utf8');
    const names = new Set<string>();
    for (const rule of css.split('}')) {
      const brace = rule.indexOf('{');
      if (brace < 0 || !rule.startsWith('--fa:', brace + 1)) continue;
      for (const m of rule.slice(0, brace).matchAll(/\.fa-([a-z0-9-]+)/g)) names.add(m[1]);
    }
    return names.size ? names : undefined;
  } catch {
    return undefined;
  }
}

/** Pages the site never hides, whatever links the admin hides: the home pages, the panel, the account, the API. */
const NEVER_HIDDEN = /^\/(?:en)?$|^\/(?:admin|konto|account|v1|vendor|img|fonts|pobierz|download|aktualizacje|updates)(?:\/|$)|\.[a-z0-9]+$/i;

/** "/zgloszenia", "/wsparcie/" → the page's path; anchors, other sites and the home page are no page of their own. */
export function ownPath(href: string): string | undefined {
  if (!href.startsWith('/') || href.startsWith('//')) return undefined;
  const p = href.split(/[?#]/)[0].replace(/\/+$/, '');
  return p && !NEVER_HIDDEN.test(p) ? p.toLowerCase() : undefined;
}

/**
 * The pages hidden with their links (home page editor, both languages): a path whose links are all
 * hidden, in the menu and the footer of either language, plus the terms or the privacy policy when
 * their footer link is hidden. A path still linked somewhere visible stays reachable.
 */
export function hiddenPaths(contents: { lang: Lang; content: Content }[], legal: Record<Lang, { terms: string; privacy: string }>): Set<string> {
  const hidden = new Set<string>();
  const shown = new Set<string>();
  for (const { lang, content } of contents) {
    for (const section of ['nav', 'footer'] as const) {
      const links = (content[section]?.links ?? []) as Item[];
      for (const l of links) {
        const p = ownPath(String(l.href ?? ''));
        if (p) (l.hidden ? hidden : shown).add(p);
      }
    }
    if (content.footer?.hideTerms) hidden.add(legal[lang].terms);
    if (content.footer?.hidePrivacy) hidden.add(legal[lang].privacy);
  }
  for (const p of shown) hidden.delete(p);
  return hidden;
}

export function homeRoutes(ctx: HomeContext) {
  const store = new HomeStore(ctx.sql, ctx.now);
  const base = ctx.publicUrl.replace(/\/+$/, '');
  const icons = iconNames(ctx.webDir);
  mkdirSync(ctx.imageDir, { recursive: true });

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
  async function json(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const data = await raw(req, MAX_JSON);
    try {
      const v = data.length ? JSON.parse(data.toString('utf8')) : {};
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return ctx.fail(400, 'bad_request');
    }
  }
  const langOr404 = (lang: string): Lang => (isLang(lang) ? lang : ctx.fail(404, 'not_found'));
  /** The editor's content checked; a wrong field answers 400 "bad_content:<field>:<why>" for the editor to point at. */
  const checked = (v: unknown, lang: Lang): Content => {
    try {
      return checkContent(v, lang, { icons });
    } catch (err) {
      if (err instanceof ContentError) ctx.fail(400, `bad_content:${err.path}:${err.reason}`);
      throw err;
    }
  };
  const note = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300) : '');
  const target = (lang: Lang) => `Strona główna (${lang.toUpperCase()})`;
  /** The sections that differ between two versions, for the log ("hero, faq (domyślne)"). */
  const changed = (before: Content, after: Content, lang: Lang): string => {
    const list = SECTIONS.filter((s) => JSON.stringify(before[s.id]) !== JSON.stringify(after[s.id]))
      .map((s) => (JSON.stringify(after[s.id]) === JSON.stringify(DEFAULTS[lang][s.id]) ? `${s.name} (domyślne)` : s.name));
    return list.length ? list.join(', ') : 'bez zmian';
  };
  /** What the editor last had: the draft, else the published content, else the defaults. */
  /** Whether a page is hidden by the published home page (and the pages under it: /wsparcie hides /wsparcie/…). */
  let hiddenCache: { key: string; set: Set<string> } | undefined;
  function isHidden(pathname: string): boolean {
    const pub = LANGS.map((l) => store.published(l));
    const key = pub.map((v) => v?.id ?? 0).join(',');
    if (!hiddenCache || hiddenCache.key !== key) {
      hiddenCache = { key, set: hiddenPaths(LANGS.map((l, i) => ({ lang: l, content: pub[i]?.content ?? DEFAULTS[l] })), UI) };
    }
    if (!hiddenCache.set.size) return false;
    const p = pathname.replace(/\/+$/, '').toLowerCase();
    for (const h of hiddenCache.set) if (p === h || p.startsWith(`${h}/`)) return true;
    return false;
  }

  const current = (lang: Lang): Content => (store.draft(lang) ?? store.published(lang))?.content ?? structuredClone(DEFAULTS[lang]);
  const editorView = (lang: Lang) => {
    const published = store.published(lang);
    const draft = store.draft(lang);
    const meta = (v?: FullHomeVersion) => (v ? { id: v.id, createdAt: v.createdAt, publishedAt: v.publishedAt, by: v.by, byHandle: v.byHandle, note: v.note } : null);
    return {
      lang, path: UI[lang].path, content: (draft ?? published)?.content ?? structuredClone(DEFAULTS[lang]),
      published: meta(published), draft: meta(draft), versions: store.versions(lang),
    };
  };

  // ---- the page itself, cached per language until a publish or a new template ----
  const cache = new Map<Lang, { key: string; html: string; etag: string }>();
  async function template(): Promise<{ text: string; mtime: number } | undefined> {
    if (!ctx.webDir) return undefined;
    const file = path.join(ctx.webDir, 'index.html');
    try {
      const info = await stat(file);
      return { text: await readFile(file, 'utf8'), mtime: info.mtimeMs };
    } catch {
      return undefined;
    }
  }
  async function page(lang: Lang): Promise<{ html: string; etag: string } | undefined> {
    if (!ctx.webDir) return undefined;
    let info;
    try {
      info = await stat(path.join(ctx.webDir, 'index.html'));
    } catch {
      return undefined;
    }
    // the release's badge (GitHub may be slow or down: then the badge from the editor)
    const fresh = ctx.news ? await Promise.race([ctx.news().catch(() => ({})), new Promise<Record<string, never>>((r) => setTimeout(() => r({}), 1500))]) : {};
    const news = (fresh as Partial<Record<Lang, { text: string; href: string }>>)[lang];
    const key = `${info.mtimeMs}:${store.publishedId(lang)}:${news ? `${news.text}|${news.href}` : ''}`;
    const hit = cache.get(lang);
    if (hit?.key === key) return hit;
    const t = await template();
    if (!t) return undefined;
    const live = store.live(lang);
    const content = news && live.hero.pillAuto !== false ? { ...live, hero: { ...live.hero, pillShow: true, pillText: news.text, pillHref: news.href } } : live;
    const html = ctx.versioned(homePage(t.text, content, lang, base));
    const made = { key, html, etag: `"${createHash('sha256').update(html).digest('base64url').slice(0, 27)}"` };
    cache.set(lang, made);
    return made;
  }

  /** The hidden pages now (for every page's script, which takes their links out). */
  const hiddenList = (): string[] => {
    isHidden('/');
    return [...(hiddenCache?.set ?? [])];
  };

  const routes: [string, RegExp, Handler][] = [
    // the pages hidden with their links: siteBanner.js takes the links to them off every page
    ['GET', /^\/v1\/home\/hidden$/, () => ({ paths: hiddenList() })],
    // everything the editor is made from: the sections' fields, the defaults, the icons, each language's state
    ['GET', /^\/v1\/admin\/home$/, (req) => {
      ctx.admin(req);
      return {
        sections: SECTIONS, defaults: DEFAULTS, icons: icons ? [...icons].sort() : [], maxImage: MAX_IMAGE,
        langs: Object.fromEntries(LANGS.map((l) => {
          const pub = store.published(l);
          const draft = store.draft(l);
          return [l, { path: UI[l].path, publishedAt: pub?.publishedAt ?? 0, draftAt: draft?.createdAt ?? 0 }];
        })),
      };
    }],
    ['GET', /^\/v1\/admin\/home\/versions\/(\d{1,12})$/, (req, [id]) => {
      ctx.admin(req);
      return store.version(Number(id)) ?? ctx.fail(404, 'not_found');
    }],
    ['GET', /^\/v1\/admin\/home\/(\w+)$/, (req, [lang]) => {
      ctx.admin(req);
      return editorView(langOr404(lang));
    }],
    // the page as it would look with the editor's content (not saved), for the editor's preview
    ['POST', /^\/v1\/admin\/home\/(\w+)\/preview$/, async (req, [lang]) => {
      ctx.admin(req);
      const l = langOr404(lang);
      const content = checked((await json(req)).content, l);
      const t = await template();
      if (!t) ctx.fail(503, 'no_template');
      return { html: ctx.versioned(homePage(t!.text, content, l, base)) };
    }],
    ['POST', /^\/v1\/admin\/home\/(\w+)\/draft$/, async (req, [lang]) => {
      const me = ctx.admin(req);
      const l = langOr404(lang);
      const content = checked((await json(req)).content, l);
      const before = current(l);
      const v = store.save(l, content, me);
      ctx.audit(me, 'home_draft', target(l), `wersja ${v.id}: ${changed(before, content, l)}`);
      return editorView(l);
    }],
    ['POST', /^\/v1\/admin\/home\/(\w+)\/publish$/, async (req, [lang]) => {
      const me = ctx.admin(req);
      const l = langOr404(lang);
      const b = await json(req);
      const content = checked(b.content, l);
      const before = store.live(l);
      const v = store.save(l, content, me, { publish: true, note: note(b.note) });
      ctx.audit(me, 'home_publish', target(l), `wersja ${v.id}: ${changed(before, content, l)}${v.note ? ` – ${v.note}` : ''}`);
      return editorView(l);
    }],
    // an old version comes back as a new draft; publishing it is a separate step
    ['POST', /^\/v1\/admin\/home\/versions\/(\d{1,12})\/restore$/, async (req, [id]) => {
      const me = ctx.admin(req);
      const old = store.version(Number(id)) ?? ctx.fail(404, 'not_found');
      const before = current(old.lang);
      store.save(old.lang, old.content, me, { restoredFrom: old.id });
      ctx.audit(me, 'home_restore', target(old.lang), `z wersji ${old.id}: ${changed(before, old.content, old.lang)}`);
      return editorView(old.lang);
    }],
    // a picture for the page (PNG, JPEG or WebP), kept under its content's hash so the same file is kept once
    ['PUT', /^\/v1\/admin\/home\/images$/, async (req) => {
      const me = ctx.admin(req);
      const data = await raw(req, MAX_IMAGE);
      const kind = imageType(data);
      if (!kind) ctx.fail(400, 'bad_picture');
      const name = `${createHash('sha256').update(data).digest('hex').slice(0, 32)}.${kind}`;
      await writeFile(path.join(ctx.imageDir, name), data);
      ctx.audit(me, 'home_image', 'Strona główna', `${name} (${Math.round(data.length / 1024)} kB)`);
      return { url: `/v1/home/images/${name}` };
    }],
  ];

  /** The home page in each language and its pictures; false for any other address. */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const picture = /^\/v1\/home\/images\/([0-9a-f]{32})\.(png|jpg|webp)$/.exec(url.pathname);
    if (picture) {
      let data: Buffer;
      try {
        data = await readFile(path.join(ctx.imageDir, `${picture[1]}.${picture[2]}`));
      } catch {
        return false;
      }
      // its name is its content's hash: it never changes
      res.writeHead(200, { 'Content-Type': IMAGE_TYPES[picture[2]], 'Content-Length': data.length, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
      return true;
    }
    const lang = Object.hasOwn(PATHS, url.pathname) ? PATHS[url.pathname] : undefined;
    if (!lang) return false;
    const made = await page(lang);
    if (!made) return false;
    const headers = { 'Cache-Control': 'no-cache', ETag: made.etag, 'X-Content-Type-Options': 'nosniff' };
    if (req.headers['if-none-match'] === made.etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : made.html);
    return true;
  }

  return { routes, serve, store, isHidden, hiddenList };
}
