/**
 * Release notes (release-notes/vX.Y.Z.md, the description of the GitHub release) as the changelog
 * shows them: on the site (/zmiany), in the launcher ("Co nowego", "Nowości w launcherze",
 * "Historia zmian"). Kept free of imports: the launcher bundles this very file, so both read the
 * notes the same way.
 *
 * The notes are Polish; an English part may follow a line with only `<!-- en -->`:
 *
 *   ## SlashClient 0.9.40
 *   - Polish notes…
 *   <!-- en -->
 *   ## SlashClient 0.9.40
 *   - English notes…
 *
 * English readers get that part when it is there, else the Polish one. The badge lines
 * (`<!-- nowosc: … -->`, `<!-- news: … -->`) and any other comment never show.
 *
 * The Markdown is a small, safe subset: headings, lists (nested by indenting), paragraphs, **bold**,
 * *italics*, `code` and [links](https://…). Nothing of the author's text ever becomes markup: it is
 * parsed into plain blocks and inline pieces (below), which the site turns into escaped HTML and the
 * launcher into DOM nodes. Links go only to https addresses; anything else stays plain text.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export interface ListItem { children: Inline[]; list?: ListBlock }
export interface ListBlock { type: 'list'; ordered: boolean; items: ListItem[] }
export type Block =
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | ListBlock;

const EN_MARK = /^[ \t]*<!--\s*en\s*-->[ \t]*$/im;

/** The notes without HTML comments (the badge lines and the language mark go with them). */
export function stripComments(body: string): string {
  return body.replace(/<!--[\s\S]*?-->/g, '').replace(/<!--[\s\S]*$/, '');
}

/** The Polish notes and, when the author wrote one, the English part. */
export function splitNotes(body: string | undefined): { pl: string; en?: string } {
  const text = (body ?? '').replace(/\r\n?/g, '\n');
  const m = EN_MARK.exec(text);
  const tidy = (s: string) => dropTitle(stripComments(s)).trim();
  if (!m) return { pl: tidy(text) };
  const en = tidy(text.slice(m.index + m[0].length));
  return { pl: tidy(text.slice(0, m.index)), ...(en ? { en } : {}) };
}

/** The notes in a language: English when there is an English part, else the Polish ones. */
export function notesFor(body: string | undefined, lang: string): string {
  const parts = splitNotes(body);
  return lang === 'en' && parts.en ? parts.en : parts.pl;
}

/** The first heading "SlashClient 0.9.40" says what the changelog already shows next to the notes. */
function dropTitle(text: string): string {
  return text.replace(/^\s*#{1,3}[ \t]+SlashClient[ \t]+v?\d+\.\d+\.\d+[^\n]*\n?/i, '');
}

/** Only https addresses (no javascript:, data:, http: or paths): what a link may lead to. */
export function safeLink(href: string): string | undefined {
  const h = href.trim();
  return /^https:\/\/[^\s"'<>`\\]{1,500}$/i.test(h) ? h : undefined;
}

/** `code`, **bold**, *italics* and [text](https://…) in a line; everything else is text. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^`([^`]+)`/.exec(rest))) {
      flush();
      out.push({ type: 'code', text: m[1] });
      i += m[0].length;
      continue;
    }
    if ((m = /^\*\*(?=\S)([\s\S]+?)\*\*/.exec(rest))) {
      flush();
      out.push({ type: 'strong', children: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if ((m = /^\*(?=[^\s*])([^*]+?)\*(?!\w)/.exec(rest)) && !/\w$/.test(text)) {
      flush();
      out.push({ type: 'em', children: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if ((m = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(rest))) {
      const href = safeLink(m[2]);
      flush();
      // a link to anything but https: only its text
      if (href) out.push({ type: 'link', href, children: parseInline(m[1]) });
      else out.push(...parseInline(m[1]));
      i += m[0].length;
      continue;
    }
    text += src[i++];
  }
  flush();
  return out;
}

const ITEM = /^([ \t]*)([-*+]|\d{1,3}[.)])[ \t]+(.*)$/;

interface RawItem { indent: number; ordered: boolean; text: string[] }

function buildList(items: RawItem[]): ListBlock {
  const base = items[0].indent;
  const list: ListBlock = { type: 'list', ordered: items[0].ordered, items: [] };
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const children: RawItem[] = [];
    let j = i + 1;
    while (j < items.length && items[j].indent >= base + 2) children.push(items[j++]);
    list.items.push({ children: parseInline(it.text.join(' ')), ...(children.length ? { list: buildList(children) } : {}) });
    i = j;
  }
  return list;
}

/** The notes as blocks (headings, paragraphs, lists). */
export function parseNotes(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2]) });
      continue;
    }
    if (ITEM.test(line)) {
      flush();
      const items: RawItem[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s{0,3}#{1,6}[ \t]/.test(lines[i])) {
        const m = ITEM.exec(lines[i]);
        if (m) items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: [m[3].trim()] });
        else items[items.length - 1].text.push(lines[i].trim());
        i++;
      }
      i--;
      blocks.push(buildList(items));
      continue;
    }
    // a quote reads as a plain paragraph
    paragraph.push(line.replace(/^\s*>\s?/, '').trim());
  }
  flush();
  return blocks;
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inlineHtml(nodes: Inline[]): string {
  return nodes.map((n) => {
    switch (n.type) {
      case 'text': return escapeHtml(n.text);
      case 'code': return `<code>${escapeHtml(n.text)}</code>`;
      case 'strong': return `<strong>${inlineHtml(n.children)}</strong>`;
      case 'em': return `<em>${inlineHtml(n.children)}</em>`;
      case 'link': return `<a href="${escapeHtml(n.href)}" rel="noopener noreferrer nofollow" target="_blank">${inlineHtml(n.children)}</a>`;
    }
  }).join('');
}

function listHtml(list: ListBlock): string {
  const tag = list.ordered ? 'ol' : 'ul';
  return `<${tag}>${list.items.map((it) => `<li>${inlineHtml(it.children)}${it.list ? listHtml(it.list) : ''}</li>`).join('')}</${tag}>`;
}

/**
 * The notes as HTML for a page (everything escaped; only the tags made here). Headings start at
 * `minLevel` (the page's own heading of the release is above them).
 */
export function notesHtml(md: string, minLevel = 3): string {
  return parseNotes(md).map((b) => {
    if (b.type === 'heading') {
      const h = Math.min(6, Math.max(minLevel, b.level + minLevel - 2));
      return `<h${h}>${inlineHtml(b.children)}</h${h}>`;
    }
    if (b.type === 'paragraph') return `<p>${inlineHtml(b.children)}</p>`;
    return listHtml(b);
  }).join('\n');
}

/** "0.9.40" → [0, 9, 40]; anything else is not a version. */
export function parseVersion(v: string | undefined): [number, number, number] | undefined {
  const m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(v ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** Compares two versions (a version beats no version). */
export function compareVersion(a: string | undefined, b: string | undefined): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/**
 * Pausing a launcher's automatic updates after it went back to an older version: the launcher keeps
 * the version it left in electron-updater's own id (userData/.updaterId, sent with every check as
 * x-user-staging-id). Launchers released before rollbacks existed know nothing of a pause, but they
 * all send that id: the server then answers their update check with a release they are not part of
 * (`stagingPercentage: 0`) until a version newer than the one left is out.
 *   5c1a0000-0000-4000-8000-MMMMmmmmpppp   (major, minor, patch in hex)
 */
export function pauseMarker(version: string): string | undefined {
  const v = parseVersion(version);
  if (!v) return undefined;
  return `5c1a0000-0000-4000-8000-${v.map((n) => n.toString(16).padStart(4, '0')).join('')}`;
}

/** The version a paused launcher left, from its update id; undefined for any ordinary id. */
export function pausedUntil(id: string | undefined): string | undefined {
  const m = /^5c1a0000-0000-4000-8000-([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})$/i.exec(String(id ?? '').trim());
  return m ? [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join('.') : undefined;
}
