import { escapeHtml, renderMarkdown, type TocEntry } from '../legal/markdown.ts';

/**
 * One wiki page's text as it is kept (in the database and in seed/<lang>/<slug>.md): a comment with
 * its details on the first line, its title on the second, then the same small Markdown as the legal
 * documents plus pictures on their own line:
 *
 *   <!-- dzial: hud | kolejnosc: 30 | ikona: fa-map | opis: Minimapa, pełna mapa, punkty i tryb jaskiń -->
 *   # Mapa i minimapa
 *
 * Keeping the details in the text means a version in the history is the whole page, title included.
 */

export const LANGS = ['pl', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (l: unknown): l is Lang => l === 'pl' || l === 'en';

/** The wiki's parts, in the menu's order (a page with another part goes to "Inne" at the end). */
export const SECTIONS: { id: string; pl: string; en: string; icon: string }[] = [
  { id: 'start', pl: 'Pierwsze kroki', en: 'Getting started', icon: 'fa-flag-checkered' },
  { id: 'launcher', pl: 'Launcher', en: 'Launcher', icon: 'fa-rocket' },
  { id: 'hud', pl: 'HUD (mod)', en: 'HUD (mod)', icon: 'fa-gauge-high' },
  { id: 'kosmetyki', pl: 'Kosmetyki', en: 'Cosmetics', icon: 'fa-wand-magic-sparkles' },
  { id: 'spolecznosc', pl: 'Społeczność', en: 'Community', icon: 'fa-users' },
  { id: 'strona', pl: 'Strona i konto', en: 'Website and account', icon: 'fa-globe' },
  { id: 'faq', pl: 'Częste pytania', en: 'FAQ', icon: 'fa-circle-question' },
];
export const OTHER_SECTION = { id: 'inne', pl: 'Inne', en: 'Other', icon: 'fa-folder' };
export const sectionOf = (id: string) => SECTIONS.find((s) => s.id === id) ?? OTHER_SECTION;

/** "launcher-profile": lower case letters, digits and dashes. */
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const isSlug = (s: unknown): s is string => typeof s === 'string' && SLUG.test(s);
/** A picture's file name: "hud-mapa-jaskinie.webp". */
export const IMAGE_NAME = /^[a-z0-9][a-z0-9_-]{0,80}\.(webp|png|jpg)$/;
export const isImageName = (s: unknown): s is string => typeof s === 'string' && IMAGE_NAME.test(s);
const ICON = /^fa-[a-z0-9-]{1,60}$/;

export interface PageMeta { section: string; order: number; icon: string; description: string }
export interface ParsedPage { meta: PageMeta; title: string; content: string }

const KEYS: Record<string, keyof PageMeta> = { dzial: 'section', kolejnosc: 'order', ikona: 'icon', opis: 'description' };

/** The details, title and content of a page's text; anything missing gets a harmless default. */
export function parsePage(body: string, fallbackTitle = ''): ParsedPage {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const meta: PageMeta = { section: 'inne', order: 1000, icon: 'fa-file-lines', description: '' };
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const comment = /^\s*<!--([\s\S]*?)-->\s*$/.exec(lines[i] ?? '');
  if (comment) {
    // "key: value" pairs split at " | " that starts another known key, so a "|" inside the description stays
    for (const part of comment[1].split(/\|(?=\s*(?:dzial|kolejnosc|ikona|opis)\s*:)/)) {
      const m = /^\s*(\w+)\s*:\s*([\s\S]*?)\s*$/.exec(part);
      const key = m && KEYS[m[1]];
      if (!key) continue;
      const v = m[2].replace(/\s+/g, ' ').slice(0, 300);
      if (key === 'order') meta.order = Number.isFinite(Number(v)) && v !== '' ? Math.max(-100_000, Math.min(100_000, Math.round(Number(v)))) : 1000;
      else if (key === 'icon') meta.icon = ICON.test(v) ? v : meta.icon;
      else if (key === 'section') meta.section = /^[a-z0-9-]{1,30}$/.test(v) ? v : meta.section;
      else meta.description = v;
    }
    i++;
  }
  while (i < lines.length && !lines[i].trim()) i++;
  let title = fallbackTitle;
  const h1 = /^#\s+(.+?)\s*$/.exec(lines[i] ?? '');
  if (h1) {
    title = h1[1].slice(0, 200);
    i++;
  }
  return { meta, title, content: lines.slice(i).join('\n').replace(/^\n+/, '') };
}

/** The text of a page from its parts (what the admin panel's fields save). */
export function composePage(meta: PageMeta, title: string, content: string): string {
  const one = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/-->/g, '—>').trim();
  return `<!-- dzial: ${one(meta.section)} | kolejnosc: ${meta.order} | ikona: ${one(meta.icon)} | opis: ${one(meta.description)} -->\n# ${one(title)}\n\n${content.replace(/^\n+/, '')}`;
}

/** The address of a page on the site, Polish or English. */
export const pagePath = (lang: Lang, slug?: string): string => `${lang === 'en' ? '/en' : ''}/wiki${slug ? `/${slug}` : ''}`;

export interface RenderedPage { html: string; toc: TocEntry[]; headings: string[] }

/**
 * A page's content as HTML: links to other pages (/wiki/slug) lead to the page in the same language,
 * pictures come from `imageUrl` (only names of pictures that exist). `base` makes every address absolute (the launcher's API).
 */
export function renderPage(content: string, lang: Lang, o: { image: (name: string) => boolean; base?: string }): RenderedPage {
  const base = o.base?.replace(/\/+$/, '') ?? '';
  const rendered = renderMarkdown(content, {}, {
    image: (name) => (isImageName(name) && o.image(name) ? `${base}/wiki/img/${name}` : undefined),
    href: (href) => {
      const m = /^\/(?:en\/)?wiki(\/[a-z0-9-]*)?(#[\w-]*)?$/.exec(href);
      if (m) return `${pagePath(lang, m[1]?.slice(1) || undefined)}${m[2] ?? ''}`;
      return href;
    },
  });
  // the smaller headings too, for the search
  const headings = [...rendered.toc.map((t) => t.text), ...[...rendered.html.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))];
  return { ...rendered, headings };
}

export { escapeHtml };
