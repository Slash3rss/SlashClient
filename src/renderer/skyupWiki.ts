import { getLang, t } from '../shared/i18n';
import { control, el, icon } from './dialog';

/**
 * The SkyUp.pl wiki tab of the Wiki view: the website's articles in their categories, a filter of
 * their titles and the website's search in their content, and an article with all its sections.
 * The main process fetches, caches and sanitizes it (src/main/skyupWiki.ts, src/shared/skyupWiki.ts).
 *
 * It opens with the player's first SkyUp.pl achievement (category 'skyup' on the SlashClient
 * server, e.g. "Witaj na SkyUp" for playing there); until then the tab shows how to get it. A new
 * achievement unlocks it right away. The lock is only the launcher's: the wiki itself is public.
 */

interface ArticleRef { slug: string; title: string }
interface Category { name: string; articles: ArticleRef[] }
interface Section { anchor: string; title: string }
interface Article { slug: string; title: string; url: string; html: string; sections: Section[] }
interface Hit { slug?: string; article?: string; anchor: string; title: string; snippet: string }
interface SkyupAchievement { id: string; category?: string; tier?: number; goal?: number; name: string; nameEn: string; description: string; descriptionEn: string; unlockedAt: number | null }

export interface SkyupWikiDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

/** Remembered after an unlock, so the wiki stays open while the SlashClient server can't be reached. */
const UNLOCKED_KEY = 'wiki.skyupUnlocked';
const MIN_SEARCH = 3;

type Lock =
  | { state: 'checking' }
  | { state: 'unlocked' }
  | { state: 'signed-out' }
  | { state: 'locked'; first?: SkyupAchievement }
  | { state: 'error'; message: string };

const remembered = (userId: string) => {
  try {
    return !!userId && localStorage.getItem(UNLOCKED_KEY) === userId;
  } catch {
    return false;
  }
};
const remember = (userId: string) => {
  try {
    localStorage.setItem(UNLOCKED_KEY, userId);
  } catch { /* storage may be unavailable */ }
};

/** The achievement to name on the lock screen: "Witaj na SkyUp", or the easiest SkyUp.pl one. */
function firstOf(list: SkyupAchievement[]): SkyupAchievement | undefined {
  return list.find((a) => a.id === 'skyup_visit') ?? [...list].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (a.goal ?? 0) - (b.goal ?? 0))[0];
}

/** "Polish wiki text" for searching: lower case, without accents (ą → a), so "lejow" finds "Lejów". */
const fold = (s: string) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

export function createSkyupWiki(root: HTMLElement, deps: SkyupWikiDeps) {
  const { api, errorText } = deps;
  const lockScreen = el('div', { className: 'wiki-locked hidden' });
  const body = el('div', { className: 'wiki-pane hidden' });
  root.append(lockScreen, body);

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

  let lock: Lock = { state: 'checking' };
  const lockListeners: ((locked: boolean) => void)[] = [];
  let categories: Category[] | undefined;
  const history: { slug: string; anchor?: string }[] = [];
  let current: string | undefined;
  let searchSeq = 0;
  let articleSeq = 0;
  let checkSeq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;

  // ---------- the lock ----------

  function setLock(next: Lock) {
    lock = next;
    const locked = next.state !== 'unlocked';
    lockListeners.forEach((fn) => fn(locked));
    renderLock();
  }

  function renderLock() {
    const locked = lock.state !== 'unlocked';
    lockScreen.classList.toggle('hidden', !locked);
    body.classList.toggle('hidden', locked);
    if (!locked) {
      // the website is asked only once the player looks at the tab
      if (!started && root.offsetParent) {
        started = true;
        void loadIndex();
      }
      return;
    }
    if (lock.state === 'checking') {
      lockScreen.replaceChildren(el('p', { className: 'muted wiki-hint' }, el('span', { className: 'spinner' }), t(' Sprawdzanie osiągnięć…')));
      return;
    }
    const card = el('div', { className: 'wiki-lock-card glass-panel' }, el('div', { className: 'wiki-lock-icon' }, icon('fa-lock')), el('h3', { textContent: t('Wiki SkyUp.pl jest zablokowana') }));
    if (lock.state === 'signed-out') {
      const go = el('button', { type: 'button', className: 'primary' }, icon('fa-user-group'), t(' Przejdź do Znajomych'));
      go.addEventListener('click', () => document.querySelector<HTMLButtonElement>('.nav[data-view="friends"]')?.click());
      card.append(
        el('p', { className: 'muted', textContent: t('Odblokujesz ją pierwszym osiągnięciem SkyUp.pl (np. „Witaj na SkyUp” – zagraj na SkyUp.pl). Najpierw zaloguj się na konto SlashClient w zakładce Znajomi, żeby zbierać osiągnięcia.') }),
        el('div', { className: 'row' }, go));
    } else if (lock.state === 'locked') {
      const a = lock.first;
      const name = a ? (getLang() === 'en' ? a.nameEn : a.name) : t('Witaj na SkyUp');
      const description = a ? (getLang() === 'en' ? a.descriptionEn : a.description) : t('Zagraj na serwerze SkyUp.pl.');
      const show = el('button', { type: 'button', className: 'primary' }, icon('fa-trophy'), t(' Pokaż osiągnięcia'));
      show.addEventListener('click', () => document.querySelector<HTMLButtonElement>('.nav[data-view="achievements"]')?.click());
      const copy = el('button', { type: 'button' }, icon('fa-copy'), t(' Kopiuj adres SkyUp.pl'));
      copy.addEventListener('click', () => {
        void navigator.clipboard.writeText('SkyUp.pl').then(() => deps.toast(t('Skopiowano adres SkyUp.pl.')), () => undefined);
      });
      card.append(
        el('p', { className: 'muted', textContent: t('Odblokuj, zdobywając pierwsze osiągnięcie SkyUp.pl:') }),
        el('div', { className: 'wiki-lock-ach' }, icon('fa-plane-arrival'), el('span', {}, el('b', { textContent: name }), el('small', { className: 'muted', textContent: description }))),
        el('div', { className: 'row' }, show, copy));
    } else {
      const retry = el('button', { type: 'button' }, icon('fa-rotate-right'), t(' Spróbuj ponownie'));
      retry.addEventListener('click', () => void check());
      card.append(el('p', { className: 'fr-error', textContent: lock.state === 'error' ? lock.message : '' }), el('div', { className: 'row' }, retry));
    }
    lockScreen.replaceChildren(card);
  }

  /** Asks the SlashClient server whether the player has a SkyUp.pl achievement. */
  async function check() {
    const mine = ++checkSeq;
    if (lock.state !== 'unlocked') setLock({ state: 'checking' });
    const state = await api.socialState().catch(() => undefined);
    if (mine !== checkSeq) return;
    const userId: string = state?.user?.id ?? '';
    checkedUser = userId;
    if (!state?.user) return setLock({ state: 'signed-out' });
    try {
      const { achievements }: { achievements: SkyupAchievement[] } = await api.socialApi('GET', '/v1/achievements');
      if (mine !== checkSeq) return;
      const skyup = achievements.filter((a) => a.category === 'skyup');
      if (skyup.some((a) => a.unlockedAt !== null && a.unlockedAt !== undefined)) {
        remember(userId);
        setLock({ state: 'unlocked' });
      } else setLock({ state: 'locked', first: firstOf(skyup) });
    } catch (err) {
      if (mine !== checkSeq) return;
      // offline: an unlock seen before still counts
      setLock(remembered(userId) ? { state: 'unlocked' } : { state: 'error', message: errorText(err) });
    }
  }

  /** Whose achievements the lock was last checked with. */
  let checkedUser: string | undefined;
  api.on('social:event', (e: { type?: string; achievement?: SkyupAchievement; state?: { user?: { id?: string }; connected?: boolean } }) => {
    if (e?.type === 'achievement' && e.achievement?.category === 'skyup' && lock.state !== 'unlocked') {
      void check();
    } else if (e?.type === 'state') {
      const userId = e.state?.user?.id ?? '';
      if (!userId) {
        checkedUser = '';
        if (lock.state !== 'signed-out') setLock({ state: 'signed-out' });
      } else if (userId !== checkedUser || (lock.state !== 'unlocked' && e.state?.connected)) {
        // another account may not have it; a locked one may have got it while away
        void check();
      }
    }
  });

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
    article.replaceChildren(el('p', { className: 'muted wiki-hint', textContent: t('Wczytywanie…') }));
    try {
      const a = (await api.skyupWikiArticle(slug)) as Article;
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
    /** The tab was opened: checks the lock (again, unless it is open already). */
    show(focus: boolean) {
      renderLock();
      if (lock.state !== 'unlocked') void check();
      else if (focus) input.focus();
    },
    /** Called with true while the wiki is locked (the tab shows a padlock). */
    onLockChange(fn: (locked: boolean) => void) {
      lockListeners.push(fn);
      fn(lock.state !== 'unlocked');
    },
    /** Checks the lock in the background (at start, so the tab's padlock is right). */
    check,
  };
}
