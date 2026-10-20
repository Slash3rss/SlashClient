import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { VARS, renderMarkdown } from './markdown.ts';
import { legalPage } from './pages.ts';
import { DOCS, LANGS, LegalStore, MAX_BODY, isDoc, isLang, type Lang } from './store.ts';

/**
 * The legal documents on the site (/regulamin, /terms, /polityka-prywatnosci, /privacy,
 * /wsparcie/regulamin, /support/terms) rendered from the database, the admin panel's
 * "Dokumenty" (drafts, publishing, history, restoring, the draft banner, the administrator's
 * details), and the notice of an important change shown once to signed-in players.
 */

export interface LegalContext {
  sql: DatabaseSync;
  publicUrl: string;
  /** The draft banner when an admin has not chosen (LEGAL_DRAFT, on unless "0"). */
  bannerDefault: boolean;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  /** Whether a page is hidden in the home page's editor (its link leaves the documents' menu too). */
  hidden?: (path: string) => boolean;
  /** When the account was made (notices are only for changes after that). */
  createdAt: (uuid: string) => number;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  versioned: (html: string) => string;
  seedDir?: string;
  now?: () => number;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

/** Which document and language an address shows. */
const BY_PATH = new Map<string, { doc: string; lang: Lang }>(
  Object.entries(DOCS).flatMap(([doc, m]) => LANGS.map((lang) => [m[lang].path, { doc, lang }] as [string, { doc: string; lang: Lang }])));

export function legalRoutes(ctx: LegalContext) {
  const store = new LegalStore(ctx.sql, { seedDir: ctx.seedDir, now: ctx.now });

  /** A JSON body up to the longest document (the server's usual reader stops at 16 kB). */
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
      return v && typeof v === 'object' ? v : {};
    } catch {
      return ctx.fail(400, 'bad_request');
    }
  }
  const docOr404 = (doc: string, lang?: string): Lang => {
    if (!isDoc(doc) || (lang !== undefined && !isLang(lang))) ctx.fail(404, 'not_found');
    return (lang ?? 'pl') as Lang;
  };
  const text = (v: unknown): string => {
    if (typeof v !== 'string') ctx.fail(400, 'bad_request');
    const s = (v as string).replace(/\r\n?/g, '\n');
    if (s.length > MAX_BODY) ctx.fail(413, 'too_large');
    if (!s.trim()) ctx.fail(400, 'empty');
    return s;
  };
  const note = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
  const target = (doc: string, lang: Lang) => `${DOCS[doc].name} (${lang.toUpperCase()})`;
  /** The editor's view of one document in one language. */
  const editorView = (doc: string, lang: Lang) => ({
    doc, lang, name: DOCS[doc].name, path: DOCS[doc][lang].path,
    published: store.published(doc, lang) ?? null,
    draft: store.draft(doc, lang) ?? null,
    versions: store.versions(doc, lang),
  });

  const routes: [string, RegExp, Handler][] = [
    // for the launcher and the pages: where the documents are and when they changed
    ['GET', /^\/v1\/legal$/, () => ({
      docs: Object.entries(DOCS).map(([id, m]) => ({
        id, name: m.name,
        ...Object.fromEntries(LANGS.map((l) => [l, { url: m[l].path, title: m[l].title, updatedAt: store.published(id, l)?.publishedAt ?? 0 }])),
        majorAt: store.lastMajor(id)?.at ?? 0,
      })),
    })],
    // important changes the signed-in player has not seen yet ("Zaktualizowaliśmy regulamin")
    ['GET', /^\/v1\/me\/legal-notices$/, (req) => {
      const me = ctx.authed(req);
      const since = ctx.createdAt(me);
      const notices = Object.entries(DOCS).flatMap(([doc, m]) => {
        const major = store.lastMajor(doc);
        if (!major || major.at <= since || store.acked(me, doc) >= major.id) return [];
        return [{ doc, version: major.id, at: major.at, note: major.note, name: m.name, pl: m.pl, en: m.en }];
      });
      return { notices };
    }],
    ['POST', /^\/v1\/me\/legal-notices\/ack$/, async (req) => {
      const me = ctx.authed(req);
      const { doc, version } = await body(req);
      if (typeof doc !== 'string' || !isDoc(doc) || !Number.isInteger(version)) ctx.fail(400, 'bad_request');
      store.ack(me, doc as string, version as number);
      return { ok: true };
    }],

    // ---- the admin panel ----
    ['GET', /^\/v1\/admin\/legal$/, (req) => {
      ctx.admin(req);
      return {
        bannerDefault: ctx.bannerDefault,
        vars: store.vars(),
        varLabels: VARS,
        docs: Object.entries(DOCS).map(([id, m]) => ({
          id, name: m.name, banner: store.bannerChoice(id), bannerShown: store.banner(id, ctx.bannerDefault),
          ...Object.fromEntries(LANGS.map((l) => {
            const pub = store.published(id, l);
            const draft = store.draft(id, l);
            return [l, { path: m[l].path, title: m[l].title, publishedAt: pub?.publishedAt ?? 0, draftAt: draft?.createdAt ?? 0 }];
          })),
        })),
      };
    }],
    // (before the document's own address, which would take "versions" for a document)
    ['GET', /^\/v1\/admin\/legal\/versions\/(\d{1,12})$/, (req, [id]) => {
      ctx.admin(req);
      return store.version(Number(id)) ?? ctx.fail(404, 'not_found');
    }],
    ['GET', /^\/v1\/admin\/legal\/([\w-]+)\/(\w+)$/, (req, [doc, lang]) => {
      ctx.admin(req);
      return editorView(doc, docOr404(doc, lang));
    }],
    // the editor's live preview, rendered here so it matches the site exactly
    ['POST', /^\/v1\/admin\/legal\/preview$/, async (req) => {
      ctx.admin(req);
      const b = await body(req);
      const source = typeof b.body === 'string' ? b.body.slice(0, MAX_BODY) : '';
      return renderMarkdown(source, store.vars());
    }],
    ['POST', /^\/v1\/admin\/legal\/([\w-]+)\/(\w+)\/draft$/, async (req, [doc, lang]) => {
      const me = ctx.admin(req);
      const l = docOr404(doc, lang);
      const v = store.saveDraft(doc, l, text((await body(req)).body), me);
      ctx.audit(me, 'legal_draft', target(doc, l), `wersja ${v.id}`);
      return editorView(doc, l);
    }],
    ['POST', /^\/v1\/admin\/legal\/([\w-]+)\/(\w+)\/publish$/, async (req, [doc, lang]) => {
      const me = ctx.admin(req);
      const l = docOr404(doc, lang);
      const b = await body(req);
      const v = store.publish(doc, l, text(b.body), me, b.major === true, note(b.note));
      ctx.audit(me, 'legal_publish', target(doc, l), `wersja ${v.id}${v.major ? ', zmiana istotna' : ''}${v.note ? `: ${v.note}` : ''}`);
      return editorView(doc, l);
    }],
    // an old version comes back as a new draft (publishing it is a separate step)
    ['POST', /^\/v1\/admin\/legal\/versions\/(\d{1,12})\/restore$/, (req, [id]) => {
      const me = ctx.admin(req);
      const old = store.version(Number(id)) ?? ctx.fail(404, 'not_found');
      store.saveDraft(old.doc, old.lang, old.body, me, old.id);
      ctx.audit(me, 'legal_restore', target(old.doc, old.lang), `z wersji ${old.id}`);
      return editorView(old.doc, old.lang);
    }],
    ['POST', /^\/v1\/admin\/legal\/([\w-]+)\/banner$/, async (req, [doc]) => {
      const me = ctx.admin(req);
      docOr404(doc);
      const { banner } = await body(req);
      if (banner !== null && typeof banner !== 'boolean') ctx.fail(400, 'bad_request');
      store.setBanner(doc, banner as boolean | null);
      ctx.audit(me, 'legal_banner', DOCS[doc].name, banner === null ? 'domyślnie' : banner ? 'włączony' : 'wyłączony');
      return { banner: store.bannerChoice(doc), bannerShown: store.banner(doc, ctx.bannerDefault) };
    }],
    ['POST', /^\/v1\/admin\/legal\/vars$/, async (req) => {
      const me = ctx.admin(req);
      const { vars } = await body(req);
      if (!vars || typeof vars !== 'object' || Array.isArray(vars)) ctx.fail(400, 'bad_request');
      const changed: string[] = [];
      const now = store.vars();
      for (const key of Object.keys(VARS)) {
        const v = (vars as Record<string, unknown>)[key];
        if (v === undefined) continue;
        if (typeof v !== 'string') ctx.fail(400, 'bad_request');
        const value = (v as string).trim().slice(0, 300);
        if ((now[key] ?? '') === value) continue;
        store.setVar(key, value);
        changed.push(key);
      }
      if (changed.length) ctx.audit(me, 'legal_vars', 'Dane administratora', changed.join(', '));
      return { vars: store.vars() };
    }],
  ];

  /** The documents' pages; false for any other address. */
  function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const at = BY_PATH.get(url.pathname.replace(/\/+$/, '') || '/');
    if (!at) return false;
    const v = store.published(at.doc, at.lang);
    if (!v) return false;
    const html = ctx.versioned(legalPage({
      doc: at.doc, lang: at.lang, rendered: renderMarkdown(v.body, store.vars()), updatedAt: v.publishedAt,
      banner: store.banner(at.doc, ctx.bannerDefault), publicUrl: ctx.publicUrl, hidden: ctx.hidden,
    }));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : html);
    return true;
  }

  return { routes, serve, store };
}
