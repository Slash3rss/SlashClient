import { t } from '../shared/i18n';
import { control, el, icon } from './dialog';

/** "Wczytywanie…" only when loading takes longer than this (what was read before comes at once). */
const LOADING_AFTER_MS = 150;

/**
 * The SkyUp.pl wiki tab of the Wiki view: the website's articles in their categories, a filter of
 * their titles and the website's search in their content, and an article with all its sections.
 * The main process fetches, caches and sanitizes it (src/main/skyupWiki.ts, src/shared/skyupWiki.ts).
 */

interface ArticleRef { slug: string; title: string }
interface Category { name: string; articles: ArticleRef[] }
interface Section { anchor: string; title: string }
interface Article { slug: string; title: string; url: string; html: string; sections: Section[] }
interface Hit { slug?: string; article?: string; anchor: string; title: string; snippet: string }

export interface SkyupWikiDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

const MIN_SEARCH = 3;

/** "Polish wiki text" for searching: lower case, without accents (ą → a), so "lejow" finds "Lejów". */
const fold = (s: string) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

export function createSkyupWiki(root: HTMLElement, deps: SkyupWikiDeps) {
  const { api, errorText } = deps;
  const body = el('div', { className: 'wiki-pane' });
  root.append(body);

  const input = control<HTMLInputElement>('input', { type: 'search', placeholder: t('Szukaj na wiki SkyUp.pl, np. klejnoty, pety, lej…'), maxLength: 100 });
  const results = el('div', { className: 'wiki-results' });
  results.dataset.noI18n = '';
  const article = el('div', { className: 'wiki-article' });
  article.dataset.noI18n = '';
  const back = el('button', { type: 'button', className: 'icon-btn', title: t('Wstecz') }, icon('fa-arrow-left'));
  back.disabled = true;
  body.append(
    el('div', { className: 'row wiki-bar' }, back, el('label', { className: 'search' }, icon('fa-magnifying-glass'), input)),
    el('p', { className: 'muted wiki-note' }, icon('fa-circle-info'), ' ', t('Treści pochodzą z wiki serwera SkyUp.pl (skyup.pl/wiki) i mogą się zmieniać razem z serwerem.')),
    el('div', { className: 'wiki-split' }, results, article),
  );

  let categories: Category[] | undefined;
  const history: { slug: string; anchor?: string }[] = [];
  let current: string | undefined;
  let searchSeq = 0;
  let articleSeq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;

  // ---------- the list ----------

  function articleButton(a: ArticleRef) {
    const row = el('button', { type: 'button', className: `wiki-hit wiki-sky-item${a.slug === current ? ' selected' : ''}` },
      el('span', { className: 'wiki-hit-text' }, el('b', { textContent: a.title })));
    row.dataset.slug = a.slug;
    row.addEventListener('click', () => void openArticle(a.slug));
    return row;
  }

  function showIndex() {
    if (!categories) return;
    results.replaceChildren(...categories.flatMap((c) => [
      el('p', { className: 'wiki-cat', textContent: c.name }),
      ...c.articles.map(articleButton),
    ]));
  }

  async function loadIndex() {
    results.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Wczytywanie…') }));
    showWelcome();
    try {
      categories = (await api.skyupWikiIndex()) as Category[];
      if (input.value.trim()) void search(input.value);
      else showIndex();
    } catch (err) {
      const retry = el('button', { type: 'button' }, icon('fa-rotate-right'), t(' Spróbuj ponownie'));
      retry.addEventListener('click', () => void loadIndex());
      results.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: errorText(err) }), retry);
    }
  }

  function showWelcome() {
    if (current) return;
    article.replaceChildren(el('div', { className: 'wiki-empty' }, icon('fa-cloud'),
      el('p', { className: 'muted', textContent: t('Wybierz artykuł z listy albo wyszukaj, np. klejnoty, inkubatory, pety.') })));
  }

  async function search(query: string) {
    const q = query.trim();
    const mine = ++searchSeq;
    if (!q) return showIndex();
    // titles first, at once; the website's search in the content after them
    const f = fold(q);
    const titles = (categories ?? []).flatMap((c) => c.articles).filter((a) => fold(a.title).includes(f) || a.slug.includes(f.replace(/\s+/g, '-')));
    const content = el('div', { className: 'wiki-sky-hits' });
    results.replaceChildren(
      ...(titles.length ? [el('p', { className: 'wiki-cat', textContent: t('Artykuły') }), ...titles.map(articleButton)] : []),
      el('p', { className: 'wiki-cat', textContent: t('W treści') }),
      content);
    if (q.length < MIN_SEARCH) {
      content.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Wpisz co najmniej {0} litery, żeby szukać w treści.', MIN_SEARCH) }));
      return;
    }
    content.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Szukanie…') }));
    try {
      const hits = (await api.skyupWikiSearch(q)) as Hit[];
      if (mine !== searchSeq) return;
      if (!hits.length) return content.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Nic nie znaleziono.') }));
      content.replaceChildren(...hits.map((h) => {
        const row = el('button', { type: 'button', className: 'wiki-hit' },
          el('span', { className: 'wiki-thumb' }, icon('fa-paragraph')),
          el('span', { className: 'wiki-hit-text' },
            el('b', { textContent: h.title }),
            h.article ? el('em', { className: 'wiki-hit-where', textContent: h.article }) : '',
            el('small', { textContent: h.snippet })));
        if (h.slug) {
          row.dataset.slug = h.slug;
          row.addEventListener('click', () => void openArticle(h.slug!, h.anchor));
        } else row.disabled = true;
        return row;
      }));
    } catch (err) {
      if (mine === searchSeq) content.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: errorText(err) }));
    }
  }

  // ---------- the article ----------

  function scrollTo(anchor: string) {
    const target = [...article.querySelectorAll<HTMLElement>('h2[data-anchor], h3[data-anchor], h4[data-anchor]')].find((h) => h.dataset.anchor === anchor);
    if (!target) return;
    article.scrollTo({ top: target.offsetTop - article.offsetTop - 8, behavior: 'smooth' });
    target.classList.add('wiki-flash');
    setTimeout(() => target.classList.remove('wiki-flash'), 1600);
  }

  async function openArticle(slug: string, anchor?: string, fromHistory = false) {
    const mine = ++articleSeq;
    if (!fromHistory && current && current !== slug) history.push({ slug: current });
    back.disabled = !history.length;
    results.querySelectorAll<HTMLElement>('.wiki-sky-item').forEach((r) => r.classList.toggle('selected', r.dataset.slug === slug));
    if (current === slug && article.querySelector('.wiki-content')) {
      if (anchor) scrollTo(anchor);
      return;
    }
    // an article read before comes at once (the main process keeps it): no "Wczytywanie…" flashing in between
    const wait = setTimeout(() => mine === articleSeq && article.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Wczytywanie…') })), LOADING_AFTER_MS);
    try {
      const a = (await api.skyupWikiArticle(slug).finally(() => clearTimeout(wait))) as Article;
      if (mine !== articleSeq) return;
      current = a.slug;
      const open = el('a', { href: a.url, className: 'button-link', title: t('Otwórz w przeglądarce') }, icon('fa-arrow-up-right-from-square'), ' skyup.pl');
      open.dataset.external = '1';
      const content = el('div', { className: 'wiki-content wiki-sky-content' });
      // safe: the main process allow-lists tags and attributes (no scripts, styles or handlers)
      content.innerHTML = a.html;
      content.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
      const jump = a.sections.length > 1
        ? el('div', { className: 'wiki-chips wiki-sky-jump' }, ...a.sections.map((s) => {
          const b = el('button', { type: 'button', className: 'wiki-chip', textContent: s.title });
          b.addEventListener('click', () => scrollTo(s.anchor));
          return b;
        }))
        : '';
      article.replaceChildren(el('div', { className: 'wiki-head' }, el('h2', { textContent: a.title }), open), jump, content);
      article.scrollTop = 0;
      if (anchor) requestAnimationFrame(() => scrollTo(anchor));
    } catch (err) {
      if (mine === articleSeq) article.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: errorText(err) }));
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void search(input.value), 350);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    clearTimeout(timer);
    void search(input.value);
  });
  back.addEventListener('click', () => {
    const prev = history.pop();
    if (prev) void openArticle(prev.slug, prev.anchor, true);
  });
  // links in an article: other articles open here, places in it scroll, the rest opens in the browser
  article.addEventListener('click', (e) => {
    const link = (e.target as Element).closest('a');
    if (!link) return;
    e.preventDefault();
    if (link.dataset.wiki) void openArticle(link.dataset.wiki, link.dataset.anchor);
    else if (link.dataset.anchor) scrollTo(link.dataset.anchor);
    else if (link.dataset.external && link.href.startsWith('https://')) window.open(link.href);
  });

  return {
    /** The tab was opened: the website is asked only once the player looks at it. */
    show(focus: boolean) {
      if (!started) {
        started = true;
        void loadIndex();
      }
      if (focus) input.focus();
    },
  };
}
