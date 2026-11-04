import { getLang, t } from '../shared/i18n';
import { searchSlashWiki, type SlashWikiArticle, type SlashWikiIndex, type SlashWikiPageRef } from '../shared/slashWiki';
import { control, el, icon } from './dialog';

/** "Wczytywanie…" only when loading takes longer than this (what was read before comes at once). */
const LOADING_AFTER_MS = 150;

/**
 * The SlashClient tab of the Wiki view: the SlashClient wiki from the launcher's server (its /wiki,
 * edited in the admin panel), its parts and pages, a search of titles, descriptions and headings, and
 * a page with its pictures. The main process fetches and sanitizes it (src/main/slashWiki.ts). A server
 * without the wiki answers null: `onAvailable(false)` hides the tab.
 */

export interface SlashWikiDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** Whether the server has the wiki (asked once the view is made, and again when the server changes). */
  onAvailable: (yes: boolean) => void;
}

export function createSlashWiki(root: HTMLElement, deps: SlashWikiDeps) {
  const { api, errorText } = deps;
  const input = control<HTMLInputElement>('input', { type: 'search', placeholder: t('Szukaj w wiki SlashClient, np. mapa, peleryna, profile…'), maxLength: 100 });
  const results = el('div', { className: 'wiki-results' });
  results.dataset.noI18n = '';
  const article = el('div', { className: 'wiki-article' });
  article.dataset.noI18n = '';
  const back = el('button', { type: 'button', className: 'icon-btn', title: t('Wstecz') }, icon('fa-arrow-left'));
  back.disabled = true;
  root.append(
    el('div', { className: 'row wiki-bar' }, back, el('label', { className: 'search' }, icon('fa-magnifying-glass'), input)),
    el('p', { className: 'muted wiki-note' }, icon('fa-circle-info'), ' ', t('Wiki SlashClient: opis wszystkich funkcji launchera, HUD-u i kosmetyków.')),
    el('div', { className: 'wiki-split' }, results, article),
  );

  let index: SlashWikiIndex | undefined;
  let indexLang = '';
  const history: string[] = [];
  let current: string | undefined;
  let articleSeq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function pageButton(p: SlashWikiPageRef) {
    const row = el('button', { type: 'button', className: `wiki-hit wiki-sky-item${p.slug === current ? ' selected' : ''}` },
      el('span', { className: 'wiki-thumb wiki-slash-icon' }, icon(p.icon)),
      el('span', { className: 'wiki-hit-text' }, el('b', { textContent: p.title }), p.description ? el('small', { textContent: p.description }) : ''));
    row.dataset.slug = p.slug;
    row.addEventListener('click', () => void openPage(p.slug));
    return row;
  }

  function showIndex() {
    if (!index) return;
    const q = input.value.trim();
    if (q) {
      const hits = searchSlashWiki(index, q);
      results.replaceChildren(...(hits.length ? hits.map(pageButton) : [el('p', { className: 'muted wiki-hint', textContent: t('Nic nie znaleziono.') })]));
      return;
    }
    results.replaceChildren(...index.sections.flatMap((s) => [el('p', { className: 'wiki-cat' }, icon(s.icon), ' ', s.title), ...s.pages.map(pageButton)]));
  }

  /** Asks the server for the list; `quiet`: only to know whether the tab is there (nothing drawn on errors). */
  async function loadIndex(quiet = false): Promise<boolean> {
    const lang = getLang();
    if (!quiet) results.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Wczytywanie…') }));
    try {
      const got = (await api.slashWikiIndex(lang)) as SlashWikiIndex | null;
      deps.onAvailable(!!got);
      if (!got) return false;
      index = got;
      indexLang = lang;
      showIndex();
      // the first page until another one is picked
      const first = got.sections[0]?.pages[0];
      if (!current && first && !quiet) void openPage(first.slug, undefined, true);
      return true;
    } catch (err) {
      if (quiet) return false;
      const retry = el('button', { type: 'button' }, icon('fa-rotate-right'), t(' Spróbuj ponownie'));
      retry.addEventListener('click', () => void loadIndex());
      results.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: errorText(err) }), retry);
      return false;
    }
  }

  function scrollTo(anchor: string) {
    const target = [...article.querySelectorAll<HTMLElement>('[data-anchor]')].find((h) => h.dataset.anchor === anchor && /^H\d$/.test(h.tagName));
    if (!target) return;
    article.scrollTo({ top: target.offsetTop - article.offsetTop - 8, behavior: 'smooth' });
    target.classList.add('wiki-flash');
    setTimeout(() => target.classList.remove('wiki-flash'), 1600);
  }

  async function openPage(slug: string, anchor?: string, fromHistory = false) {
    const mine = ++articleSeq;
    if (!fromHistory && current && current !== slug) history.push(current);
    back.disabled = !history.length;
    results.querySelectorAll<HTMLElement>('.wiki-sky-item').forEach((r) => r.classList.toggle('selected', r.dataset.slug === slug));
    if (current === slug && article.querySelector('.wiki-content')) {
      if (anchor) scrollTo(anchor);
      return;
    }
    const wait = setTimeout(() => mine === articleSeq && article.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Wczytywanie…') })), LOADING_AFTER_MS);
    try {
      const a = (await api.slashWikiArticle(slug, getLang()).finally(() => clearTimeout(wait))) as SlashWikiArticle;
      if (mine !== articleSeq) return;
      current = a.slug;
      results.querySelectorAll<HTMLElement>('.wiki-sky-item').forEach((r) => r.classList.toggle('selected', r.dataset.slug === a.slug));
      const open = el('a', { href: a.url, className: 'button-link', title: t('Otwórz w przeglądarce') }, icon('fa-arrow-up-right-from-square'), ' ', t('Na stronie'));
      open.dataset.external = '1';
      const content = el('div', { className: 'wiki-content wiki-sky-content wiki-slash-content' });
      // safe: the main process allow-lists tags and attributes (no scripts, styles or handlers)
      content.innerHTML = a.html;
      const jump = a.toc.length > 1
        ? el('div', { className: 'wiki-chips wiki-sky-jump' }, ...a.toc.map((s) => {
          const b = el('button', { type: 'button', className: 'wiki-chip', textContent: s.title });
          b.addEventListener('click', () => scrollTo(s.anchor));
          return b;
        }))
        : '';
      const step = (r: { slug: string; title: string } | null, dir: 'prev' | 'next') => {
        if (!r) return el('span');
        const b = el('button', { type: 'button', className: `wiki-slash-step ${dir}` },
          el('small', {}, dir === 'prev' ? icon('fa-arrow-left') : '', ' ', dir === 'prev' ? t('Poprzednia') : t('Następna'), ' ', dir === 'next' ? icon('fa-arrow-right') : ''),
          el('b', { textContent: r.title }));
        b.addEventListener('click', () => void openPage(r.slug));
        return b;
      };
      article.replaceChildren(
        el('div', { className: 'wiki-head' }, el('h2', {}, icon(a.icon), ' ', a.title), open),
        a.description ? el('p', { className: 'muted wiki-slash-lead', textContent: a.description }) : '',
        jump, content,
        el('div', { className: 'wiki-slash-steps' }, step(a.prev, 'prev'), step(a.next, 'next')));
      article.scrollTop = 0;
      if (anchor) requestAnimationFrame(() => scrollTo(anchor));
    } catch (err) {
      if (mine === articleSeq) article.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: errorText(err) }));
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(showIndex, 150);
  });
  back.addEventListener('click', () => {
    const prev = history.pop();
    if (prev) void openPage(prev, undefined, true);
  });
  // links in a page: other wiki pages open here, places on it scroll, the rest opens in the browser
  article.addEventListener('click', (e) => {
    const link = (e.target as Element).closest('a');
    if (!link) return;
    e.preventDefault();
    if (link.dataset.wiki) void openPage(link.dataset.wiki, link.dataset.anchor);
    else if (link.dataset.anchor) scrollTo(link.dataset.anchor);
    else if (link.dataset.external && /^https?:\/\//.test(link.href)) window.open(link.href);
  });

  return {
    /** Whether the server has the wiki (for the switch), without drawing anything. */
    probe: () => loadIndex(true),
    /** The tab was opened: the list (again when the language changed), and the first page. */
    show(focus: boolean) {
      if (!index || indexLang !== getLang()) {
        if (indexLang && indexLang !== getLang()) current = undefined;
        void loadIndex();
      } else if (!current) void loadIndex();
      if (focus) input.focus();
    },
  };
}
