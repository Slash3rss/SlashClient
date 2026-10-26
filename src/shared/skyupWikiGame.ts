import { createHash } from 'node:crypto';
import { decodeEntities } from './wikiHtml';

/**
 * A SkyUp.pl wiki article for the game's "Wiki SkyUp" screen: the launcher's sanitized HTML
 * (skyupArticleHtml) as simple blocks the game can draw without reading HTML — headings, paragraphs,
 * list items, tables, pictures and lines. Pictures are named by an id; the launcher keeps which
 * address each id stands for and hands the game a small PNG of it (bridge /skyup-wiki/image/<id>).
 */

/** A picture: its id and its size on the wiki, when the wiki says it (0 = as the picture is). */
export interface GamePicture { id: string; w: number; h: number }

/** A piece of text in one style, a link, a picture in the line, or a line break. */
export interface GameSpan {
  t?: string;
  b?: 1;
  i?: 1;
  u?: 1;
  s?: 1;
  code?: 1;
  /** A link to another article (its slug), and a place on it. */
  wiki?: string;
  anchor?: string;
  /** A link out of the wiki (opened in the browser after asking, as the game does with chat links). */
  url?: string;
  img?: GamePicture;
  br?: 1;
}

export interface GameCell { spans: GameSpan[]; head?: 1; cols?: number }

export type GameBlock =
  | { k: 'h'; level: 1 | 2 | 3; text: string; anchor?: string }
  | { k: 'p'; spans: GameSpan[]; center?: 1; indent?: number }
  | { k: 'li'; spans: GameSpan[]; depth: number; mark: string }
  | { k: 'table'; rows: GameCell[][] }
  | { k: 'img'; img: GamePicture; center?: 1 }
  | { k: 'hr' };

/** A picture's id: the same address always gets the same one. */
export const pictureId = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 20);

const BLOCK = new Set(['p', 'div', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'blockquote', 'pre', 'hr', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'caption']);
const STYLE: Record<string, keyof GameSpan> = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', ins: 'u', s: 's', del: 's', code: 'code', kbd: 'code', pre: 'code' };

function attrsOf(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = decodeEntities(m[2]);
  return out;
}

/** The blocks of an article and the addresses of its pictures by id. */
export function gameArticle(html: string): { blocks: GameBlock[]; pictures: Record<string, string> } {
  const blocks: GameBlock[] = [];
  const pictures: Record<string, string> = {};
  const styles: Partial<Record<keyof GameSpan, number>> = {};
  const links: { wiki?: string; anchor?: string; url?: string }[] = [];
  const lists: { ordered: boolean; n: number }[] = [];
  /** The list item being written: its depth and mark (the mark only on its first block). */
  let item: { depth: number; mark: string } | undefined;
  let spans: GameSpan[] = [];
  let center = 0;
  /** Each open div: whether it centres its content. */
  const divs: boolean[] = [];
  let quote = 0;
  let heading: { level: 1 | 2 | 3; anchor?: string; text: string } | undefined;
  let table: { rows: GameCell[][]; depth: number } | undefined;
  let tableDepth = 0;
  let cell: GameCell | undefined;

  const target = () => (cell ? cell.spans : spans);
  function add(span: GameSpan) {
    const to = target();
    const last = to[to.length - 1];
    if (span.t !== undefined && last && last.t !== undefined && !last.img && !last.br
      && JSON.stringify({ ...last, t: '' }) === JSON.stringify({ ...span, t: '' })) {
      last.t += span.t;
      return;
    }
    to.push(span);
  }
  function styled(): GameSpan {
    const s: GameSpan = {};
    for (const [k, n] of Object.entries(styles)) if (n) (s as Record<string, unknown>)[k] = 1;
    const link = links[links.length - 1];
    if (link) Object.assign(s, link);
    return s;
  }
  /** Spans without spaces at the ends and without empty text. */
  function tidy(list: GameSpan[]): GameSpan[] {
    const out = list.filter((s) => s.img || s.br || (s.t ?? '') !== '');
    // line breaks and spaces at the ends (a cell's first paragraph, the space after its last line)
    const blank = (s: GameSpan) => !s.img && (s.br || !(s.t ?? '').trim());
    while (out.length && blank(out[0])) out.shift();
    while (out.length && blank(out[out.length - 1])) out.pop();
    if (out[0]?.t !== undefined) out[0].t = out[0].t.replace(/^\s+/, '');
    const last = out[out.length - 1];
    if (last?.t !== undefined) last.t = last.t.replace(/\s+$/, '');
    return out.filter((s) => s.img || s.br || (s.t ?? '') !== '');
  }
  function flush() {
    if (table) return;
    const list = tidy(spans);
    spans = [];
    if (!list.length) return;
    // a picture alone is a block of its own
    if (list.length === 1 && list[0].img && !item) {
      blocks.push(center ? { k: 'img', img: list[0].img, center: 1 } : { k: 'img', img: list[0].img });
      return;
    }
    if (item) {
      blocks.push({ k: 'li', spans: list, depth: item.depth, mark: item.mark });
      item = { ...item, mark: '' };
      return;
    }
    const p: GameBlock = { k: 'p', spans: list };
    if (center) p.center = 1;
    if (quote) p.indent = quote;
    blocks.push(p);
  }

  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    if (m[4] !== undefined) {
      const text = decodeEntities(m[4]).replace(/\s+/g, ' ');
      if (heading) heading.text += text;
      else if (text) add({ ...styled(), t: text });
      continue;
    }
    const close = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = close ? {} : attrsOf(m[3]);
    if (STYLE[tag]) {
      if (tag === 'pre') flush();
      styles[STYLE[tag]] = (styles[STYLE[tag]] ?? 0) + (close ? -1 : 1);
      if (tag === 'pre' && close) flush();
      continue;
    }
    if (tag === 'a') {
      if (close) links.pop();
      else links.push(attrs['data-wiki'] ? { wiki: attrs['data-wiki'], ...(attrs['data-anchor'] ? { anchor: attrs['data-anchor'] } : {}) }
        : attrs['data-anchor'] ? { anchor: attrs['data-anchor'] } : attrs['data-external'] && attrs.href ? { url: attrs.href } : {});
      continue;
    }
    if (tag === 'img') {
      if (!attrs.src) continue;
      const id = pictureId(attrs.src);
      pictures[id] = attrs.src;
      const img = { id, w: Number(attrs.width) || 0, h: Number(attrs.height) || 0 };
      if (heading) continue;
      add({ img });
      continue;
    }
    if (tag === 'br') {
      if (heading) heading.text += ' ';
      else add({ br: 1 });
      continue;
    }
    if (/^h[2-6]$/.test(tag)) {
      if (table) continue;
      if (!close) {
        flush();
        const level = Math.min(3, Number(tag[1]) - 1) as 1 | 2 | 3;
        heading = { level, text: '', ...(attrs['data-anchor'] ? { anchor: attrs['data-anchor'] } : {}) };
      } else if (heading) {
        const text = heading.text.replace(/\s+/g, ' ').trim();
        if (text) blocks.push({ k: 'h', level: heading.level, text, ...(heading.anchor ? { anchor: heading.anchor } : {}) });
        heading = undefined;
      }
      continue;
    }
    if (tag === 'table') {
      if (!close) {
        tableDepth++;
        if (tableDepth === 1) {
          flush();
          table = { rows: [], depth: 1 };
        }
      } else if (--tableDepth === 0 && table) {
        const rows = table.rows.map((r) => r.map((c) => ({ ...c, spans: tidy(c.spans) }))).filter((r) => r.some((c) => c.spans.length));
        table = undefined;
        cell = undefined;
        if (rows.length) blocks.push({ k: 'table', rows });
      }
      continue;
    }
    if (table) {
      // a table in a table is read as its text
      if (tableDepth > 1) {
        if (!close && (tag === 'tr' || tag === 'p' || tag === 'div' || tag === 'li') && cell?.spans.length) add({ br: 1 });
        continue;
      }
      if (tag === 'tr' && !close) table.rows.push([]);
      else if ((tag === 'td' || tag === 'th') && !close) {
        if (!table.rows.length) table.rows.push([]);
        cell = { spans: [] };
        if (tag === 'th') cell.head = 1;
        const cols = Number(attrs.colspan);
        if (cols > 1) cell.cols = Math.min(cols, 12);
        table.rows[table.rows.length - 1].push(cell);
      } else if ((tag === 'td' || tag === 'th') && close) cell = undefined;
      else if (cell && !close && (tag === 'p' || tag === 'div' || tag === 'li' || tag === 'ul' || tag === 'ol') && cell.spans.length) add({ br: 1 });
      continue;
    }
    if (tag === 'hr') {
      flush();
      blocks.push({ k: 'hr' });
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      flush();
      if (!close) lists.push({ ordered: tag === 'ol', n: 0 });
      else {
        lists.pop();
        item = undefined;
      }
      continue;
    }
    if (tag === 'li') {
      flush();
      if (!close) {
        const list = lists[lists.length - 1];
        const depth = Math.max(1, lists.length);
        if (list) list.n++;
        item = { depth, mark: list?.ordered ? `${list.n}.` : '•' };
      } else item = undefined;
      continue;
    }
    if (BLOCK.has(tag)) {
      flush();
      if (tag === 'div' && !close) {
        const centered = /(^|\s)w-center(\s|$)/.test(attrs.class ?? '');
        divs.push(centered);
        if (centered) center++;
      }
      if (tag === 'div' && close && divs.pop()) center--;
      if (tag === 'blockquote') quote = Math.max(0, quote + (close ? -1 : 1));
      continue;
    }
  }
  flush();
  return { blocks, pictures };
}
