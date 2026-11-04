import { decodeHref, sanitizeWikiHtml, type WikiSite } from './wikiHtml';

/**
 * The SlashClient wiki (the server's /wiki, edited in its admin panel) in the launcher's Wiki view:
 * the server's API answers (GET /v1/wiki, /v1/wiki/<slug>) cleaned for the page. Its HTML is made
 * by the server from escaped Markdown already, but goes through the same allow-list as minecraft.wiki's
 * (sanitizeWikiHtml): links to other wiki pages open in the panel, places on the page scroll, other
 * links open in the browser, and pictures may only come from the server's /wiki/img/.
 */

export interface SlashWikiPageRef { slug: string; title: string; description: string; icon: string; order: number; headings: string[] }
export interface SlashWikiSection { id: string; title: string; icon: string; pages: SlashWikiPageRef[] }
export interface SlashWikiIndex { url: string; sections: SlashWikiSection[] }
export interface SlashWikiArticle {
  slug: string; title: string; description: string; icon: string; section: { id: string; title: string }; url: string; html: string;
  toc: { anchor: string; title: string }[]; prev: { slug: string; title: string } | null; next: { slug: string; title: string } | null;
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const isSlashWikiSlug = (s: unknown): s is string => typeof s === 'string' && SLUG.test(s);
const ICON = /^fa-[a-z0-9-]{1,60}$/;
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const icon = (v: unknown) => (typeof v === 'string' && ICON.test(v) ? v : 'fa-file-lines');

/** "https://slashclient.pl/" → "https://slashclient.pl" (only http(s) addresses). */
export function serverBase(socialUrl: string): string | undefined {
  try {
    const u = new URL(socialUrl.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

/** The wiki page a link leads to: "/wiki/hud-mapa#minimapa", "/en/wiki/…", or the same on the server (or on any SlashClient address it answers with). */
export function slashWikiLink(href: string, base: string, origins: string[] = []): { page: string; anchor?: string } | undefined {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return undefined;
  }
  if (url.origin !== new URL(base).origin && !origins.includes(url.origin)) return undefined;
  const m = /^\/(?:en\/)?wiki\/([a-z0-9-]{1,64})\/?$/.exec(url.pathname);
  if (!m || !isSlashWikiSlug(m[1])) return undefined;
  const anchor = url.hash.length > 1 ? decodeHref(url.hash.slice(1)) : undefined;
  return anchor ? { page: m[1], anchor } : { page: m[1] };
}

/** A picture's address on the server ("/wiki/img/x.webp" from wherever the server says it lives), or undefined. */
export function slashWikiImage(src: string, base: string): string | undefined {
  try {
    const u = new URL(src, base);
    const m = /^\/wiki\/img\/([a-z0-9][a-z0-9_-]{0,80}\.(?:webp|png|jpg))$/.exec(u.pathname);
    return m ? `${base}/wiki/img/${m[1]}` : undefined;
  } catch {
    return undefined;
  }
}

export function slashWikiSite(base: string, origins: string[] = []): WikiSite {
  return {
    origin: base,
    page: (href) => slashWikiLink(href, base, origins),
    image: (src) => slashWikiImage(src, base),
    anchors: true,
  };
}

/** The server's list, kept to what the panel draws. */
export function cleanIndex(raw: unknown): SlashWikiIndex {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { url?: unknown; sections?: unknown };
  const sections = Array.isArray(r.sections) ? r.sections : [];
  return {
    url: str(r.url, 500),
    sections: sections.slice(0, 50).map((s) => {
      const x = (s ?? {}) as Record<string, unknown>;
      return {
        id: str(x.id, 30), title: str(x.title, 100), icon: icon(x.icon),
        pages: (Array.isArray(x.pages) ? x.pages : []).slice(0, 500).flatMap((p) => {
          const y = (p ?? {}) as Record<string, unknown>;
          if (!isSlashWikiSlug(y.slug)) return [];
          return [{
            slug: y.slug, title: str(y.title, 200) || y.slug, description: str(y.description), icon: icon(y.icon), order: Number(y.order) || 0,
            headings: (Array.isArray(y.headings) ? y.headings : []).slice(0, 100).map((h) => str(h, 200)).filter(Boolean),
          }];
        }),
      };
    }).filter((s) => s.pages.length),
  };
}

/** One page from the server, its HTML sanitized; `origins`: other addresses of the same server (its public address). */
export function cleanArticle(raw: unknown, base: string): SlashWikiArticle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!isSlashWikiSlug(r.slug)) throw new Error('bad page');
  const ref = (v: unknown) => {
    const x = (v ?? {}) as Record<string, unknown>;
    return v && isSlashWikiSlug(x.slug) ? { slug: x.slug, title: str(x.title, 200) || x.slug } : null;
  };
  let origins: string[] = [];
  try {
    origins = [new URL(str(r.url, 500)).origin];
  } catch { /* no public address given */ }
  const sec = (r.section ?? {}) as Record<string, unknown>;
  // the server keeps a section's anchor on the element around it: on its heading here, for scrolling to it
  const html = str(r.html, 2_000_000).replace(/<section id="([\w-]{1,60})"><h2>/g, '<section><h2 id="$1">');
  return {
    slug: r.slug, title: str(r.title, 200) || r.slug, description: str(r.description), icon: icon(r.icon),
    section: { id: str(sec.id, 30), title: str(sec.title, 100) }, url: str(r.url, 500),
    html: sanitizeWikiHtml(html, slashWikiSite(base, origins)),
    toc: (Array.isArray(r.toc) ? r.toc : []).slice(0, 100).flatMap((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      return typeof x.id === 'string' && /^[\w-]{1,60}$/.test(x.id) ? [{ anchor: x.id, title: str(x.text, 200) }] : [];
    }),
    prev: ref(r.prev), next: ref(r.next),
  };
}

/** Lower case without accents, for the search ("Mapa" and "mape" find "mapa"). */
export const foldText = (s: string) => s.toLocaleLowerCase('pl').replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** The pages matching a search, best first: the title counts most, then the description, then the headings (as on the website). */
export function searchSlashWiki(index: SlashWikiIndex, q: string): SlashWikiPageRef[] {
  const words = foldText(q).split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  return index.sections.flatMap((s) => s.pages).map((p) => {
    const title = foldText(p.title);
    const desc = foldText(p.description);
    const heads = foldText(p.headings.join(' '));
    let score = 0;
    for (const w of words) {
      const one = (title.includes(w) ? 10 : 0) + (desc.includes(w) ? 4 : 0) + (heads.includes(w) ? 2 : 0) + (p.slug.includes(w) ? 1 : 0);
      if (!one) return { p, score: 0 };
      score += one;
    }
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.p);
}
