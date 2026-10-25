import { t } from '../shared/i18n';
import { control, el, icon } from './dialog';
import { createSkyupWiki } from './skyupWiki';

/**
 * The "Wiki" view: minecraft.wiki search and articles (recipes, mobs, blocks) without a browser.
 * The main process fetches, caches and sanitizes everything (src/shared/wikiHtml.ts), so the HTML
 * put in here has no scripts, styles or handlers; links to articles open in this panel, other links
 * in the browser. Sections load when opened. A switch in the view's header leads to the SkyUp.pl
 * wiki (skyupWiki.ts).
 */

interface Hit { title: string; snippet: string; thumbnail?: string }
interface Section { index: string; title: string; level: number }
interface Article { title: string; url: string; intro: string; sections: Section[] }

export interface WikiDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

/** Ideas shown before the first search (the wiki is in English, so are its titles). */
const SUGGESTIONS = ['Crafting Table', 'Creeper', 'Diamond', 'Enchanting', 'Brewing', 'Villager', 'Netherite Ingot', 'Redstone Dust'];
/** Opened by themselves: that's where recipes and drops are. */
const OPEN_FIRST = /^(obtaining|crafting|recipe|drops|usage)$/i;

const TAB_KEY = 'wiki.tab';
/** "Wczytywanie…" only when loading takes longer than this (what was read before comes at once). */
const LOADING_AFTER_MS = 150;

export function createWiki(root: HTMLElement, deps: WikiDeps) {
  const mc = el('div', { className: 'wiki-pane' });
  const skyPane = el('div', { className: 'wiki-pane wiki-skyup hidden' });
  root.append(mc, skyPane);
  const mcWiki = createMinecraftWiki(mc, deps);
  const sky = createSkyupWiki(skyPane, deps);

  // the switch between the two wikis, in the view's header
  const tabMc = el('button', { type: 'button', title: t('Wiki Minecrafta') }, icon('fa-cube'), ' minecraft.wiki');
  const tabSky = el('button', { type: 'button', title: t('Wiki serwera SkyUp.pl') }, icon('fa-cloud'), ' SkyUp.pl');
  const tabs = el('div', { className: 'segmented wiki-tabs' }, tabMc, tabSky);
  (root.closest('.view')?.querySelector('.view-head') ?? root).append(tabs);

  let tab: 'mc' | 'skyup' = 'mc';
  try {
    if (localStorage.getItem(TAB_KEY) === 'skyup') tab = 'skyup';
  } catch { /* storage may be unavailable */ }
  function select(next: 'mc' | 'skyup', focus = true) {
    tab = next;
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch { /* storage may be unavailable */ }
    tabMc.classList.toggle('active', next === 'mc');
    tabSky.classList.toggle('active', next === 'skyup');
    mc.classList.toggle('hidden', next !== 'mc');
    skyPane.classList.toggle('hidden', next !== 'skyup');
    if (next === 'skyup') sky.show(focus);
    else if (focus) mcWiki.focus();
  }
  tabMc.addEventListener('click', () => select('mc'));
  tabSky.addEventListener('click', () => select('skyup'));
  select(tab, false);

  return {
    /** Called when the view opens. */
    focus: () => select(tab),
  };
}

/** The minecraft.wiki tab. */
function createMinecraftWiki(root: HTMLElement, deps: WikiDeps) {
  const { api, errorText } = deps;
  const input = control<HTMLInputElement>('input', { type: 'search', placeholder: t('Szukaj na minecraft.wiki, np. Crafting Table, Creeper…'), maxLength: 200 });
  const results = el('div', { className: 'wiki-results' });
  const article = el('div', { className: 'wiki-article' });
  article.dataset.noI18n = '';
  const back = el('button', { type: 'button', className: 'icon-btn', title: t('Wstecz') }, icon('fa-arrow-left'));
  back.disabled = true;

  root.append(
    el('div', { className: 'row wiki-bar' },
      back,
      el('label', { className: 'search' }, icon('fa-magnifying-glass'), input)),
    el('p', { className: 'muted wiki-note' }, icon('fa-circle-info'), ' ', t('Treści pochodzą z minecraft.wiki (po angielsku, licencja CC BY-NC-SA 3.0). Szukaj angielskich nazw.')),
    el('div', { className: 'wiki-split' }, results, article),
  );

  const history: string[] = [];
  let current: string | undefined;
  let searchSeq = 0;
  let articleSeq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function showSuggestions() {
    results.replaceChildren(
      el('p', { className: 'muted wiki-hint', textContent: t('Na przykład:') }),
      el('div', { className: 'wiki-chips' }, ...SUGGESTIONS.map((s) => {
        const b = el('button', { type: 'button', className: 'wiki-chip', textContent: s });
        b.addEventListener('click', () => void openArticle(s));
        return b;
      })),
    );
    article.replaceChildren(el('div', { className: 'wiki-empty' }, icon('fa-book-open'), el('p', { className: 'muted', textContent: t('Wpisz nazwę bloku, przedmiotu lub moba, żeby zobaczyć recepturę i opis.') })));
  }

  async function search(query: string) {
    const q = query.trim();
    const mine = ++searchSeq;
    if (!q) return showSuggestions();
    results.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Szukanie…') }));
    try {
      const hits = (await api.wikiSearch(q)) as Hit[];
      if (mine !== searchSeq) return;
      if (!hits.length) return results.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Nic nie znaleziono. Spróbuj angielskiej nazwy.') }));
      results.replaceChildren(...hits.map((h) => {
        const row = el('button', { type: 'button', className: `wiki-hit${h.title === current ? ' selected' : ''}` },
          h.thumbnail ? el('img', { src: h.thumbnail, alt: '', loading: 'lazy' }) : el('span', { className: 'wiki-thumb' }, icon('fa-cube')),
          el('span', { className: 'wiki-hit-text' }, el('b', { textContent: h.title }), el('small', { textContent: h.snippet })));
        row.dataset.title = h.title;
        row.dataset.noI18n = '';
        row.addEventListener('click', () => void openArticle(h.title));
        return row;
      }));
    } catch (err) {
      if (mine === searchSeq) results.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: errorText(err) }));
    }
  }

  /** Puts sanitized wiki HTML into a node and wires its links. */
  function fillHtml(node: HTMLElement, html: string) {
    // safe: the main process allow-lists tags and attributes (no scripts, styles or handlers)
    node.innerHTML = html;
    node.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
  }

  async function openArticle(title: string, fromHistory = false) {
    const mine = ++articleSeq;
    if (!fromHistory && current && current !== title) history.push(current);
    back.disabled = !history.length;
    // an article read before comes at once (the main process keeps it): no "Wczytywanie…" flashing in between
    const wait = setTimeout(() => mine === articleSeq && article.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Wczytywanie…') })), LOADING_AFTER_MS);
    results.querySelectorAll<HTMLElement>('.wiki-hit').forEach((r) => r.classList.toggle('selected', r.dataset.title === title));
    try {
      const a = (await api.wikiArticle(title).finally(() => clearTimeout(wait))) as Article;
      if (mine !== articleSeq) return;
      current = a.title;
      const open = el('a', { href: a.url, className: 'button-link', title: t('Otwórz w przeglądarce') }, icon('fa-arrow-up-right-from-square'), ' minecraft.wiki');
      open.dataset.external = '1';
      const intro = el('div', { className: 'wiki-content' });
      fillHtml(intro, a.intro);
      // only top-level sections: each one loads with its subsections
      const top = a.sections.filter((s) => s.level === 2);
      let opened = false;
      const sections = top.map((s) => {
        const content = el('div', { className: 'wiki-content' });
        const details = el('details', { className: 'wiki-section' }, el('summary', { textContent: s.title }), content);
        let loaded = false;
        details.addEventListener('toggle', async () => {
          if (!details.open || loaded) return;
          loaded = true;
          const wait = setTimeout(() => content.replaceChildren(el('p', { className: 'muted', textContent: t('Wczytywanie…') })), LOADING_AFTER_MS);
          try {
            const html = (await api.wikiSection(a.title, s.index).finally(() => clearTimeout(wait))) as string;
            fillHtml(content, html);
            // the section's own heading repeats the summary (newer MediaWiki wraps it in a div)
            const heading = content.querySelector('h2');
            (heading?.parentElement?.classList.contains('w-mw-heading') ? heading.parentElement : heading)?.remove();
          } catch (err) {
            loaded = false;
            content.replaceChildren(el('p', { className: 'muted', textContent: errorText(err) }));
          }
        });
        if (!opened && OPEN_FIRST.test(s.title)) {
          opened = true;
          details.open = true;
          details.dispatchEvent(new Event('toggle'));
        }
        return details;
      });
      article.replaceChildren(el('div', { className: 'wiki-head' }, el('h2', { textContent: a.title }), open), intro, ...sections);
      article.scrollTop = 0;
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
    if (prev) void openArticle(prev, true);
  });
  // links inside articles: other articles open here, the rest in the browser
  article.addEventListener('click', (e) => {
    const link = (e.target as Element).closest('a');
    if (!link) return;
    e.preventDefault();
    if (link.dataset.wiki) void openArticle(link.dataset.wiki);
    else if (link.dataset.external && link.href.startsWith('https://')) window.open(link.href);
  });

  // the wiki's animated slots (e.g. "any planks" in a recipe) cycle through their items; some keep
  // them in groups ("subframes", e.g. any log, then any stripped log…): all of them go round as one
  setInterval(() => {
    if (!root.offsetParent) return;
    root.querySelectorAll('.w-invslot.w-animated').forEach((slot) => {
      const items = [...slot.querySelectorAll('.w-invslot-item')];
      if (items.length < 2) return;
      // the hidden ones load now, not when shown (lazy pictures shown for a moment would stay blank)
      slot.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
      // the one shown: in the group shown, if the slot has groups
      const i = items.findIndex((x) => x.classList.contains('w-animated-active') && !x.closest('.w-animated-subframe:not(.w-animated-active)'));
      items.forEach((x) => x.classList.remove('w-animated-active'));
      items[(i + 1) % items.length].classList.add('w-animated-active');
      // from now on the groups are one list: none of them hidden as a whole
      slot.querySelectorAll('.w-animated-subframe').forEach((g) => g.classList.add('w-animated-active'));
    });
  }, 1500);

  showSuggestions();
  return { focus: () => input.focus() };
}
