/**
 * The small Markdown the legal documents are written in (the admin panel's editor), turned into
 * HTML on the server. Everything the author typed is escaped first, so no HTML of theirs gets
 * through: only the tags made here (headings, paragraphs, lists, tables, notes, bold, italics,
 * code, links). Links go only to http(s), mailto, the site's own paths and anchors.
 *
 * What it reads:
 *   ## Heading          a section (in the contents list; `## Heading {#anchor}` sets its anchor)
 *   ### Subheading
 *   - item / * item     a list; `1. item` a numbered one; indent by 2+ spaces for a list inside an item
 *   > text              a highlighted note
 *   | a | b |           a table (the second line `|---|---|`)
 *   **bold**, *italics*, `code`, [text](https://…)
 *   {{admin.email}}     a value from "Dane administratora" (an empty one shows as a placeholder)
 *   [UZUPEŁNIJ: …]      a placeholder, highlighted until replaced
 * A line ending with two spaces or a backslash breaks the line; an empty line ends a paragraph.
 */

export interface TocEntry { id: string; text: string }
export interface Rendered { html: string; toc: TocEntry[] }

/** The administrator's details the documents refer to as {{key}}, with their labels. */
export const VARS: Record<string, string> = {
  'admin.name': 'imię i nazwisko albo nazwa firmy administratora',
  'admin.address': 'adres do doręczeń',
  'admin.email': 'adres e-mail do kontaktu',
  'admin.nip': 'NIP i REGON, jeśli są',
};

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** "1. Postanowienia ogólne" → "1-postanowienia-ogolne". */
export function slug(text: string): string {
  return text.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sekcja';
}

const SAFE_URL = /^(https?:\/\/[^\s]+|mailto:[^\s]+|\/(?!\/)[^\s]*|#[\w-]*)$/i;

function inline(raw: string, vars: Record<string, string>): string {
  let s = escapeHtml(raw);
  // code first, kept aside so nothing inside it turns into markup
  const kept: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => `\u0000${kept.push(`<code>${c}</code>`) - 1}\u0000`);
  s = s.replace(/\[UZUPEŁNIJ:[^\]]*\]/g, (m) => `\u0000${kept.push(`<span class="fill">${m}</span>`) - 1}\u0000`);
  s = s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const value = vars[key]?.trim();
    const out = value ? escapeHtml(value) : `<span class="fill">[UZUPEŁNIJ: ${escapeHtml(VARS[key] ?? key)}]</span>`;
    return `\u0000${kept.push(out) - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^()\s]+)\)/g, (_m, text: string, href: string) => {
    // the address was escaped with the rest: &amp; in it is right in an attribute
    if (!SAFE_URL.test(href.replace(/&amp;/g, '&'))) return text;
    const external = /^https?:/i.test(href) ? ' rel="noopener noreferrer"' : '';
    return `<a href="${href}"${external}>${text}</a>`;
  });
  s = s.replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)]);
}

/** The lines of a paragraph: joined with spaces, or a line break after "  " or "\". */
function joinLines(lines: string[], vars: Record<string, string>): string {
  return lines.map((l, i) => {
    const brk = i < lines.length - 1 && /( {2,}|\\)$/.test(l);
    return inline(l.replace(/( {2,}|\\)$/, '').trim(), vars) + (i < lines.length - 1 ? (brk ? '<br>' : ' ') : '');
  }).join('');
}

interface Item { indent: number; ordered: boolean; text: string[] }
const ITEM = /^(\s*)([-*]|\d{1,3}[.)])\s+(.*)$/;

function list(items: Item[], vars: Record<string, string>): string {
  let out = '';
  let i = 0;
  const base = items[0].indent;
  const ordered = items[0].ordered;
  while (i < items.length) {
    const it = items[i];
    const children: Item[] = [];
    let j = i + 1;
    while (j < items.length && items[j].indent >= base + 2) children.push(items[j++]);
    out += `<li>${joinLines(it.text, vars)}${children.length ? list(children, vars) : ''}</li>`;
    i = j;
  }
  return ordered ? `<ol>${out}</ol>` : `<ul>${out}</ul>`;
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export function renderMarkdown(source: string, vars: Record<string, string> = {}): Rendered {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const toc: TocEntry[] = [];
  const used = new Set<string>();
  const parts: string[] = [];
  let paragraph: string[] = [];
  let open = false;
  const flush = () => {
    if (paragraph.length) parts.push(`<p>${joinLines(paragraph, vars)}</p>`);
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+?)\s*(?:\{#([\w-]{1,60})\})?\s*$/.exec(line);
    if (heading) {
      flush();
      const text = heading[2];
      if (heading[1].length === 3) {
        parts.push(`<h3>${inline(text, vars)}</h3>`);
        continue;
      }
      let id = heading[3] ?? slug(text);
      for (let n = 2; used.has(id); n++) id = `${heading[3] ?? slug(text)}-${n}`;
      used.add(id);
      toc.push({ id, text: inline(text, vars).replace(/<[^>]+>/g, '') });
      // each section in its own element, for the anchor and the spacing
      parts.push(`${open ? '</section>' : ''}<section id="${id}"><h2>${inline(text, vars)}</h2>`);
      open = true;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const note: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) note.push(lines[i++].replace(/^\s*>\s?/, ''));
      i--;
      parts.push(`<p class="note">${joinLines(note, vars)}</p>`);
      continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      flush();
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      i--;
      parts.push(`<div class="legal-table"><table><thead><tr>${head.map((c) => `<th>${inline(c, vars)}</th>`).join('')}</tr></thead><tbody>${
        rows.map((r) => `<tr>${head.map((_c, k) => `<td>${inline(r[k] ?? '', vars)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (ITEM.test(line)) {
      flush();
      const items: Item[] = [];
      while (i < lines.length && lines[i].trim()) {
        const m = ITEM.exec(lines[i]);
        if (m) items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: [m[3]] });
        else items[items.length - 1].text.push(lines[i].trim());
        i++;
      }
      i--;
      parts.push(list(items, vars));
      continue;
    }
    paragraph.push(line);
  }
  flush();
  if (open) parts.push('</section>');
  return { html: parts.join('\n'), toc };
}
