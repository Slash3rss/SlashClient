/**
 * Makes minecraft.wiki's article HTML (from the MediaWiki parse API) safe to show in the launcher:
 * an allow-list of tags and attributes, no scripts, styles, forms or event handlers. Links to other
 * articles become `data-wiki` links the panel opens itself; other links point at full https URLs,
 * which the launcher opens in the browser. Images may only come from the wiki itself.
 * Class names get a `w-` prefix, so the wiki's classes never pick up the launcher's own styles.
 *
 * Plain string processing (no DOM), so it runs in the main process and in tests.
 */

export const WIKI_ORIGIN = 'https://minecraft.wiki';

/** Tags that are kept (their attributes are filtered). */
const ALLOWED = new Set([
  'a', 'abbr', 'b', 'bdi', 'blockquote', 'br', 'caption', 'code', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure',
  'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub',
  'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);
/** Tags removed together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'noscript', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option',
  'svg', 'math', 'template', 'audio', 'video', 'canvas', 'link', 'meta', 'head', 'title', 'frame', 'frameset', 'applet', 'base',
]);
const VOID = new Set(['br', 'hr', 'img', 'wbr', 'col', 'area', 'source', 'track', 'input', 'link', 'meta', 'base', 'embed', 'param']);
/** Parts of an article that make no sense outside the wiki (edit links, navigation boxes, references). */
const DROP_CLASSES = new Set([
  'mw-editsection', 'navbox', 'navbox-wrapper', 'reference', 'mw-references-wrap', 'references', 'noprint', 'toc', 'mw-empty-elt',
  'printfooter', 'catlinks', 'mw-cite-backlink', 'hidden-alt-text', 'msgbox',
]);

const KEEP_ATTRS: Record<string, string[]> = {
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  img: ['alt', 'width', 'height'],
};

/** Decodes the entities that appear in attribute values. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39|nbsp);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    if (lower === 'nbsp') return ' ';
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Text between tags: entities stay, anything that could start markup is escaped. */
const escapeText = (s: string) => s.replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of src.matchAll(/([^\s"'=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** An article title from a wiki link ("/w/Oak_Planks#Crafting" → "Oak Planks"), or undefined for other pages. */
export function articleFromHref(href: string): string | undefined {
  let url: URL;
  try {
    url = new URL(href, WIKI_ORIGIN);
  } catch {
    return undefined;
  }
  if (url.origin !== WIKI_ORIGIN || !url.pathname.startsWith('/w/')) return undefined;
  let title: string;
  try {
    title = decodeURIComponent(url.pathname.slice(3)).replace(/_/g, ' ');
  } catch {
    return undefined;
  }
  // only articles: files, categories, special and talk pages open in the browser
  if (!title || /^[A-Za-z ]+:/.test(title)) return undefined;
  return title;
}

/** A link target that is safe to open in the browser: a full https URL, or undefined. */
export function externalHref(href: string): string | undefined {
  if (href.startsWith('#')) return undefined;
  try {
    const url = new URL(href, WIKI_ORIGIN);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** An image address from the wiki itself, made absolute; anything else is refused. */
export function imageSrc(src: string): string | undefined {
  try {
    const url = new URL(src, WIKI_ORIGIN);
    return url.origin === WIKI_ORIGIN && url.pathname.startsWith('/images/') ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const safeClass = (cls: string) =>
  cls.split(/\s+/).filter((c) => /^[A-Za-z0-9_-]+$/.test(c)).map((c) => `w-${c}`).join(' ');

function sanitizeTag(name: string, attrs: Record<string, string>): string | undefined {
  const out: string[] = [];
  const cls = attrs.class ? safeClass(attrs.class) : '';
  if (cls) out.push(`class="${escapeHtml(cls)}"`);
  for (const a of KEEP_ATTRS[name] ?? []) {
    const v = attrs[a];
    if (v === undefined) continue;
    if ((a === 'width' || a === 'height' || a === 'colspan' || a === 'rowspan') && !/^\d{1,4}$/.test(v)) continue;
    out.push(`${a}="${escapeHtml(v)}"`);
  }
  if (attrs.title && name !== 'img') out.push(`title="${escapeHtml(attrs.title)}"`);
  if (name === 'img') {
    const src = imageSrc(attrs.src ?? '');
    if (!src) return undefined;
    out.push(`src="${escapeHtml(src)}"`, 'loading="lazy"');
  }
  if (name === 'a') {
    const href = attrs.href ?? '';
    const article = articleFromHref(href);
    if (article) out.push('href="#"', `data-wiki="${escapeHtml(article)}"`);
    else {
      const ext = externalHref(href);
      if (ext) out.push(`href="${escapeHtml(ext)}"`, 'data-external="1"');
    }
  }
  // the infobox's image tabs carry their names here
  if (attrs['data-title'] && name === 'div') out.push(`data-title="${escapeHtml(attrs['data-title'])}"`);
  return `<${name}${out.length ? ` ${out.join(' ')}` : ''}>`;
}

/** The safe version of a piece of wiki HTML. */
export function sanitizeWikiHtml(html: string): string {
  const out: string[] = [];
  /** Open elements: name, and whether they were kept (an unknown tag drops only itself, not its text). */
  const stack: { name: string; kept: boolean }[] = [];
  /** While set, everything is skipped until this element closes (depth counts nested ones of the same name). */
  let skip: { name: string; depth: number } | undefined;
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<!?\/?([A-Za-z][A-Za-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [token, rawName, rawAttrs, text] = m;
    if (text !== undefined || token === '<') {
      if (!skip) out.push(escapeText(text ?? token));
      continue;
    }
    if (!rawName || token.startsWith('<!')) continue; // comments, doctype, CDATA
    const name = rawName.toLowerCase();
    const closing = token.startsWith('</');
    const selfClosing = VOID.has(name) || /\/\s*$/.test(rawAttrs ?? '');
    if (skip) {
      if (name === skip.name && !selfClosing) {
        if (closing) skip.depth--;
        else skip.depth++;
        if (skip.depth === 0) skip = undefined;
      }
      continue;
    }
    if (closing) {
      // close up to the matching open element; stray end tags are ignored
      const i = stack.map((s) => s.name).lastIndexOf(name);
      if (i < 0) continue;
      while (stack.length > i) {
        const top = stack.pop()!;
        if (top.kept) out.push(`</${top.name}>`);
      }
      continue;
    }
    const attrs = parseAttrs(rawAttrs ?? '');
    const dropByClass = (attrs.class ?? '').split(/\s+/).some((c) => DROP_CLASSES.has(c));
    if (DROP_WITH_CONTENT.has(name) || dropByClass) {
      if (!selfClosing) skip = { name, depth: 1 };
      continue;
    }
    const tag = ALLOWED.has(name) ? sanitizeTag(name, attrs) : undefined;
    if (tag) out.push(tag);
    if (!selfClosing) stack.push({ name, kept: !!tag });
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.kept) out.push(`</${top.name}>`);
  }
  return out.join('');
}

/** Plain text of a search snippet (the API marks the matches with spans), entities decoded. */
export function snippetText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}
