import { decodeEntities, decodeHref, safeAnchor, sanitizeWikiHtml, snippetText, type WikiSite } from './wikiHtml';

/**
 * The SkyUp.pl wiki (wiki.skyup.pl → skyup.pl/wiki) in the launcher's Wiki view. It is not a MediaWiki
 * but the server's own site: the list of articles in categories is in every wiki page's side menu
 * (`#wiki-toc`), and an article's content or a search comes as an HTML fragment from
 * /wiki/query/<JSON>. Pure string processing, so the main process and the tests share it.
 */

export const SKYUP_ORIGIN = 'https://skyup.pl';
export const SKYUP_WIKI = `${SKYUP_ORIGIN}/wiki`;

/** Where the wiki's pictures come from (looked up in all its articles); the launcher's CSP allows exactly these. */
export const SKYUP_IMAGE_HOSTS = ['skyup.pl', 'i.imgur.com', 'img.ssrv.it', 's.namemc.com', 'static.wikia.nocookie.net', 'minecraft.wiki', 'minewiki.pl'];

/** An article's identifier, as in /wiki/<slug>. */
export const isSkyupSlug = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(s);

export interface SkyupArticleRef { slug: string; title: string }
export interface SkyupCategory { name: string; articles: SkyupArticleRef[] }
export interface SkyupSection { anchor: string; title: string }
export interface SkyupArticle {
  slug: string;
  title: string;
  /** The article on the website. */
  url: string;
  /** Sanitized HTML of all its sections, each starting with an h2 that has a `data-anchor`. */
  html: string;
  sections: SkyupSection[];
}
export interface SkyupHit {
  /** The article the matching section is in, when known. */
  slug?: string;
  article?: string;
  anchor: string;
  /** The section's title. */
  title: string;
  /** A bit of its text around the first match. */
  snippet: string;
}

/** The query address for one request ("open-page" with the part, or "search"). */
export function skyupQueryUrl(query: Record<string, string>): string {
  return `${SKYUP_WIKI}/query/${encodeURIComponent(JSON.stringify(query))}`;
}

/** The article a link leads to: "/wiki/klejnoty#klejnoty-kupieckie" → klejnoty and the place on it. */
export function skyupPage(href: string): { page: string; anchor?: string } | undefined {
  let url: URL;
  try {
    url = new URL(href, SKYUP_ORIGIN);
  } catch {
    return undefined;
  }
  if (url.hostname !== 'skyup.pl' && url.hostname !== 'wiki.skyup.pl') return undefined;
  const m = /^\/wiki\/([^/]+)\/?$/.exec(url.pathname);
  const slug = m && decodeHref(m[1]).toLowerCase();
  if (!isSkyupSlug(slug)) return undefined;
  const anchor = url.hash.length > 1 ? safeAnchor(decodeHref(url.hash.slice(1))) : undefined;
  return anchor ? { page: slug, anchor } : { page: slug };
}

/** A picture from one of the wiki's hosts, over https ("imgur.com/x.png" is the picture at i.imgur.com). */
export function skyupImage(src: string): string | undefined {
  let url: URL;
  try {
    url = new URL(src, SKYUP_ORIGIN);
  } catch {
    return undefined;
  }
  if (url.protocol === 'http:' && url.hostname === 'skyup.pl') url.protocol = 'https:';
  if (url.hostname === 'imgur.com' && /^\/[A-Za-z0-9]+\.(png|jpe?g|gif|webp)$/i.test(url.pathname)) url.hostname = 'i.imgur.com';
  if (url.protocol !== 'https:' || url.port || url.username || !SKYUP_IMAGE_HOSTS.includes(url.hostname)) return undefined;
  return url.toString();
}

export const SKYUP_SITE: WikiSite = {
  origin: SKYUP_ORIGIN,
  page: skyupPage,
  image: skyupImage,
  // the sections' titles are h1 on the website; the article's own title is the panel's h2
  rename: { h1: { tag: 'h2' }, h2: { tag: 'h3' }, h3: { tag: 'h4' }, center: { tag: 'div', className: 'w-center' } },
  anchors: true,
  styleSize: true,
};

const HIGHLIGHT = /<span\s+style\s*=\s*"background-color:\s*yellow;?\s*">([\s\S]*?)<\/span>/gi;
const HIGHLIGHT_ESCAPED = /&lt;span style=&quot;background-color:\s*yellow;?\s*&quot;&gt;|&lt;\/span&gt;/gi;

/**
 * Removes the search's yellow marks. The website puts them into attributes too
 * (href="/wiki/&lt;span …&gt;klejnot&lt;/span&gt;y"), so those are cleaned inside attribute values.
 */
export function stripHighlights(html: string): string {
  return html
    .replace(HIGHLIGHT, '$1')
    .replace(/(=\s*")([^"]*)"/g, (_m, pre: string, value: string) => `${pre}${value.replace(HIGHLIGHT_ESCAPED, '')}"`);
}

/** The categories and their articles from a wiki page's side menu, in the website's order. */
export function parseSkyupToc(page: string): SkyupCategory[] {
  const start = page.indexOf('id="wiki-toc"');
  if (start < 0) return [];
  const end = page.indexOf('</div>', start);
  const toc = page.slice(start, end < 0 ? undefined : end);
  const out: SkyupCategory[] = [];
  const seen = new Set<string>();
  for (const m of toc.matchAll(/<i>([\s\S]*?)<\/i>|<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    if (m[1] !== undefined) {
      out.push({ name: snippetText(m[1]), articles: [] });
      continue;
    }
    const target = skyupPage(decodeEntities(m[2]));
    const title = snippetText(m[3]);
    if (!target || !title || seen.has(target.page)) continue;
    seen.add(target.page);
    if (!out.length) out.push({ name: '', articles: [] });
    out[out.length - 1].articles.push({ slug: target.page, title });
  }
  return out.filter((c) => c.articles.length);
}

/** The pieces of an article's (or a search's) content: each section's heading id, title and inner HTML. */
export function splitSkyupSections(html: string): { anchor: string; title: string; html: string }[] {
  const out: { anchor: string; title: string; html: string }[] = [];
  const re = /<h1\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/h1>/gi;
  const heads = [...html.matchAll(re)];
  heads.forEach((m, i) => {
    const anchor = safeAnchor(decodeEntities(m[1]));
    if (!anchor) return;
    const from = m.index! + m[0].length;
    const to = i + 1 < heads.length ? heads[i + 1].index! : html.length;
    out.push({ anchor, title: snippetText(m[2]), html: html.slice(from, to) });
  });
  return out;
}

/** The sections of an article's content (the titles of its h1s). */
export function skyupSections(html: string): SkyupSection[] {
  return splitSkyupSections(html).map(({ anchor, title }) => ({ anchor, title }));
}

/** An article's content as the panel shows it. */
export function skyupArticleHtml(html: string): string {
  return sanitizeWikiHtml(stripHighlights(html), SKYUP_SITE);
}

/** Up to ~160 characters of text around the first place the query is found. */
export function snippetAround(text: string, query: string, size = 160): string {
  const i = text.toLocaleLowerCase('pl').indexOf(query.toLocaleLowerCase('pl'));
  if (i < 0 || text.length <= size) return text.length <= size ? text : `${text.slice(0, size).trimEnd()}…`;
  const from = Math.max(0, i - Math.floor(size / 3));
  const to = Math.min(text.length, from + size);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
}

/**
 * The hits of a search answer: the matching sections, minus the heading the website puts first
 * ("Wyszukiwanie: …"). `where` names the article a section is in (from the articles' section lists).
 */
export function parseSkyupSearch(html: string, query: string, where: (anchor: string) => SkyupArticleRef | undefined): SkyupHit[] {
  const clean = stripHighlights(html);
  return splitSkyupSections(clean)
    .filter((s) => !/^wyszukiwanie:/i.test(s.anchor))
    .map((s) => {
      const text = snippetText(s.html.replace(/<(br|\/p|\/li|\/tr|\/h\d)\b[^>]*>/gi, ' $&'));
      const ref = where(s.anchor);
      return { anchor: s.anchor, title: s.title, snippet: snippetAround(text, query), ...(ref ? { slug: ref.slug, article: ref.title } : {}) };
    });
}
