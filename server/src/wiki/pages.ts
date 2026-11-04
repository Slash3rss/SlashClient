import { siteFooter, siteNav } from '../siteFooter.ts';
import { escapeHtml, type Lang, type PageMeta, pagePath, SECTIONS, OTHER_SECTION } from './format.ts';
import type { TocEntry } from '../legal/markdown.ts';

/**
 * The wiki's pages on the site: the start page (/wiki, /en/wiki) with every part and its pages and a
 * search, and one page (/wiki/<slug>) with the menu of parts on the left, the page's contents on the
 * right and the previous and next page under it. The search works without the script too (?q=);
 * web/wiki.js makes it answer while typing, from /v1/wiki.
 */

export interface PageRef { slug: string; title: string; meta: PageMeta; lang: Lang; headings: string[] }
export interface SectionRefs { id: string; title: string; icon: string; pages: PageRef[] }

export const UI = {
  pl: {
    nav: [['/#funkcje', 'Funkcje'], ['/#kosmetyki', 'Kosmetyki'], ['/wiki', 'Wiki'], ['/zgloszenia', 'Zgłoszenia'], ['/wsparcie', 'Wesprzyj']],
    home: '/', title: 'Wiki SlashClient', eyebrow: 'Wiki', other: 'English', menu: 'Spis stron', toc: 'Na tej stronie',
    lead: 'Wszystko o launcherze, HUD-zie, kosmetykach i funkcjach społecznościowych SlashClient: gdzie co jest, jak to włączyć i co można ustawić.',
    description: 'Wiki SlashClient: opis wszystkich funkcji launchera, moda HUD, kosmetyków i konta, ze zrzutami ekranu.',
    search: 'Szukaj w wiki…', searchLabel: 'Szukaj', results: 'Wyniki wyszukiwania', none: 'Nic nie znaleziono. Spróbuj innego słowa.',
    prev: 'Poprzednia', next: 'Następna', updated: 'Ostatnia zmiana:', empty: 'Wiki jest jeszcze pusta.', pages: (n: number) => `${n} ${n === 1 ? 'strona' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'strony' : 'stron'}`,
    untranslated: 'Ta strona nie ma jeszcze polskiej wersji, poniżej jest angielska.', locale: 'pl-PL', download: 'Pobierz SlashClient',
  },
  en: {
    nav: [['/en#funkcje', 'Features'], ['/en#kosmetyki', 'Cosmetics'], ['/en/wiki', 'Wiki'], ['/bugs', 'Bug reports'], ['/support', 'Support us']],
    home: '/en', title: 'SlashClient Wiki', eyebrow: 'Wiki', other: 'Polski', menu: 'Pages', toc: 'On this page',
    lead: 'Everything about the SlashClient launcher, HUD, cosmetics and community features: where things are, how to turn them on and what you can set.',
    description: 'The SlashClient wiki: every feature of the launcher, the HUD mod, cosmetics and your account explained, with screenshots.',
    search: 'Search the wiki…', searchLabel: 'Search', results: 'Search results', none: 'Nothing found. Try another word.',
    prev: 'Previous', next: 'Next', updated: 'Last changed:', empty: 'The wiki is still empty.', pages: (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`,
    untranslated: 'This page has no English version yet, the Polish one is shown below.', locale: 'en-GB', download: 'Download SlashClient',
  },
} as const;

const CSS = ['/vendor/fa/css/all.min.css', '/style.css', '/landing.css', '/legal.css', '/wiki.css'];
const icon = (cls: string) => `<i class="fa-solid ${escapeHtml(cls)}" aria-hidden="true"></i>`;

function shell(o: {
  lang: Lang; title: string; description: string; path: string; otherPath: string; publicUrl: string; noindex?: boolean;
  hidden?: (path: string) => boolean; body: string;
}): string {
  const u = UI[o.lang];
  const other: Lang = o.lang === 'pl' ? 'en' : 'pl';
  const base = o.publicUrl.replace(/\/+$/, '');
  return `<!doctype html>
<html lang="${o.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(o.title)}</title>
  <meta name="description" content="${escapeHtml(o.description)}">
  <link rel="canonical" href="${base}${o.path}">
  <link rel="alternate" hreflang="${o.lang}" href="${base}${o.path}">
  <link rel="alternate" hreflang="${other}" href="${base}${o.otherPath}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="SlashClient">
  <meta property="og:title" content="${escapeHtml(o.title)}">
  <meta property="og:description" content="${escapeHtml(o.description)}">
  <meta property="og:url" content="${base}${o.path}">
  <meta property="og:image" content="${base}/vendor/logo.png">
  <meta name="theme-color" content="#3b82f6" media="not all"><meta name="theme-color" content="#07090f">
  ${o.noindex ? '<meta name="robots" content="noindex">' : ''}
  <link rel="icon" href="/vendor/logo.png">
  ${CSS.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n  ')}
  <script type="module" src="/router.js"></script>
  <script type="module" src="/wiki.js"></script>
</head>
<body class="landing">
  <div class="bg" aria-hidden="true"><div class="bg-grid"></div><div class="bg-glow g1"></div></div>
  <header class="nav scrolled">
    <div class="wrap">
      <a class="brand" href="${u.home}"><img src="/vendor/logo.png" alt=""><span>Slash<b>Client</b></span></a>
      ${siteNav(o.lang, u.nav.filter(([h]) => !o.hidden?.(h)))}
    </div>
  </header>
  <main>
${o.body}
  </main>
  ${siteFooter(o.lang)}
</body>
</html>
`;
}

/** The search box: a plain form to /wiki?q= that wiki.js turns into results while typing. */
function searchBox(lang: Lang, q = '', big = false): string {
  const u = UI[lang];
  return `<form class="wiki-search${big ? ' wiki-search-big' : ''}" action="${pagePath(lang)}" method="get" role="search">
          <label class="search">${icon('fa-magnifying-glass')}<input type="search" name="q" value="${escapeHtml(q)}" placeholder="${escapeHtml(u.search)}" aria-label="${escapeHtml(u.searchLabel)}" autocomplete="off" maxlength="100" data-lang="${lang}"></label>
          <div class="wiki-hits" hidden></div>
        </form>`;
}

/** The menu of parts and pages beside a page (folded on narrow screens). */
function menu(lang: Lang, sections: SectionRefs[], current?: string): string {
  const u = UI[lang];
  return `<aside class="wiki-side">
        ${searchBox(lang)}
        <details class="wiki-menu" id="wiki-menu" open>
          <summary>${icon('fa-bars')} ${escapeHtml(u.menu)}</summary>
          <nav aria-label="${escapeHtml(u.menu)}">
            <a class="wiki-home${current ? '' : ' current'}" href="${pagePath(lang)}">${icon('fa-house')} ${escapeHtml(u.title)}</a>
${sections.map((s) => `            <p class="wiki-sec">${icon(s.icon)} ${escapeHtml(s.title)}</p>
            <ul>
${s.pages.map((p) => `              <li><a href="${pagePath(lang, p.slug)}"${p.slug === current ? ' class="current" aria-current="page"' : ''}>${escapeHtml(p.title)}</a></li>`).join('\n')}
            </ul>`).join('\n')}
          </nav>
        </details>
      </aside>`;
}

export function sectionTitle(id: string, lang: Lang) {
  const s = SECTIONS.find((x) => x.id === id) ?? OTHER_SECTION;
  return { id: s.id, title: s[lang], icon: s.icon };
}

/** A page's place in the search: its title counts most, then its description, then its headings. */
export function searchPages(sections: SectionRefs[], q: string): PageRef[] {
  const fold = (s: string) => s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = fold(q).split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const scored = sections.flatMap((s) => s.pages).map((p) => {
    const title = fold(p.title);
    const desc = fold(p.meta.description);
    const heads = fold(p.headings.join(' '));
    let score = 0;
    for (const w of words) {
      const s = (title.includes(w) ? 10 : 0) + (desc.includes(w) ? 4 : 0) + (heads.includes(w) ? 2 : 0) + (p.slug.includes(w) ? 1 : 0);
      if (!s) return { p, score: 0 };
      score += s;
    }
    return { p, score };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.p);
}

export function wikiIndexPage(o: { lang: Lang; sections: SectionRefs[]; q?: string; publicUrl: string; hidden?: (path: string) => boolean }): string {
  const u = UI[o.lang];
  const q = (o.q ?? '').trim().slice(0, 100);
  const hits = q ? searchPages(o.sections, q) : [];
  const card = (p: PageRef) => `<a class="wiki-card" href="${pagePath(o.lang, p.slug)}"${p.lang !== o.lang ? ` lang="${p.lang}"` : ''}>
              <span class="wiki-card-icon">${icon(p.meta.icon)}</span>
              <span class="wiki-card-text"><b>${escapeHtml(p.title)}</b>${p.meta.description ? `<small>${escapeHtml(p.meta.description)}</small>` : ''}</span>
            </a>`;
  const results = q ? `<div class="wiki-results" role="region" aria-label="${escapeHtml(u.results)}">
          <h2>${escapeHtml(u.results)}: „${escapeHtml(q)}”</h2>
          ${hits.length ? `<div class="wiki-cards">${hits.slice(0, 30).map(card).join('\n')}</div>` : `<p class="muted">${escapeHtml(u.none)}</p>`}
        </div>` : '';
  const sections = o.sections.length ? o.sections.map((s) => `<div class="wiki-part" id="${escapeHtml(s.id)}">
          <h2>${icon(s.icon)} ${escapeHtml(s.title)} <small class="muted">${escapeHtml(u.pages(s.pages.length))}</small></h2>
          <div class="wiki-cards">
            ${s.pages.map(card).join('\n            ')}
          </div>
        </div>`).join('\n        ') : `<p class="muted">${escapeHtml(u.empty)}</p>`;
  const body = `    <section class="legal-page wiki-page">
      <div class="wrap wiki-index">
        <header class="legal-head wiki-hero">
          <span class="eyebrow">${escapeHtml(u.eyebrow)}</span>
          <h1>${escapeHtml(u.title)}</h1>
          <p class="muted wiki-lead">${escapeHtml(u.lead)}</p>
          ${searchBox(o.lang, q, true)}
          <p class="legal-meta"><a class="lang-switch" href="${pagePath(o.lang === 'pl' ? 'en' : 'pl')}" hreflang="${o.lang === 'pl' ? 'en' : 'pl'}">${escapeHtml(u.other)}</a></p>
        </header>
        ${results}
        ${sections}
      </div>
    </section>`;
  return shell({
    lang: o.lang, title: `${u.title}`, description: u.description, path: pagePath(o.lang), otherPath: pagePath(o.lang === 'pl' ? 'en' : 'pl'),
    publicUrl: o.publicUrl, hidden: o.hidden, noindex: !!q, body,
  });
}

export function wikiArticlePage(o: {
  lang: Lang; page: PageRef; html: string; toc: TocEntry[]; updatedAt: number; sections: SectionRefs[]; prev?: PageRef; next?: PageRef;
  publicUrl: string; hidden?: (path: string) => boolean;
}): string {
  const u = UI[o.lang];
  const p = o.page;
  const other: Lang = o.lang === 'pl' ? 'en' : 'pl';
  const sec = sectionTitle(p.meta.section, o.lang);
  const date = new Intl.DateTimeFormat(u.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' }).format(o.updatedAt);
  const fallback = p.lang !== o.lang;
  const step = (r: PageRef | undefined, dir: 'prev' | 'next') => (r
    ? `<a class="wiki-step ${dir}" href="${pagePath(o.lang, r.slug)}"><small>${dir === 'prev' ? `${icon('fa-arrow-left')} ${escapeHtml(u.prev)}` : `${escapeHtml(u.next)} ${icon('fa-arrow-right')}`}</small><b>${escapeHtml(r.title)}</b></a>`
    : '<span></span>');
  const toc = o.toc.length > 1 ? `<nav class="legal-toc wiki-toc" aria-label="${escapeHtml(u.toc)}">
          <details id="legal-toc" open>
            <summary>${escapeHtml(u.toc)}</summary>
            <ol>
              ${o.toc.map((e) => `<li><a href="#${e.id}">${e.text}</a></li>`).join('\n              ')}
            </ol>
          </details>
        </nav>` : '';
  const body = `    <section class="legal-page wiki-page">
      <div class="wrap wiki${toc ? '' : ' no-toc'}">
      ${menu(o.lang, o.sections, p.slug)}
        <article class="wiki-main"${fallback ? ` lang="${p.lang}"` : ''}>
          <nav class="wiki-crumbs" aria-label="Wiki"><a href="${pagePath(o.lang)}">Wiki</a> <span aria-hidden="true">›</span> <a href="${pagePath(o.lang)}#${escapeHtml(sec.id)}">${escapeHtml(sec.title)}</a></nav>
          <header class="wiki-head">
            <h1>${icon(p.meta.icon)} ${escapeHtml(p.title)}</h1>
            ${p.meta.description ? `<p class="wiki-lead muted">${escapeHtml(p.meta.description)}</p>` : ''}
            <div class="legal-meta">
              <span>${escapeHtml(u.updated)} <time datetime="${new Date(o.updatedAt).toISOString()}">${date}</time></span>
              <a class="lang-switch" href="${pagePath(other, p.slug)}" hreflang="${other}">${escapeHtml(u.other)}</a>
            </div>
            ${fallback ? `<p class="wiki-untranslated" lang="${o.lang}">${icon('fa-language')} ${escapeHtml(u.untranslated)}</p>` : ''}
          </header>
          ${toc}
          <div class="legal-body wiki-body">
${o.html}
          </div>
          <nav class="wiki-steps">
            ${step(o.prev, 'prev')}
            ${step(o.next, 'next')}
          </nav>
        </article>
      </div>
    </section>`;
  return shell({
    lang: o.lang, title: `${p.title} – ${u.title}`, description: p.meta.description || u.description, path: pagePath(o.lang, p.slug),
    otherPath: pagePath(other, p.slug), publicUrl: o.publicUrl, hidden: o.hidden, noindex: fallback, body,
  });
}
