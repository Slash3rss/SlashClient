import { getLang, locale, t } from '../shared/i18n';
import { currencyName, currencyOf, signedSparks, sparkAmount, sparks } from '../shared/sparks';
import { buyWithConfirm, shortBy, type ShopItem } from './sparkShop';

/**
 * The "Achievements" view: SlashClient achievements of the signed-in account in categories (play
 * time, streaks, friends, clans, servers, sharing, style and hidden ones) with progress bars, the
 * sparks each one pays and the cosmetics some unlock; the shop where sparks buy cosmetics; and the
 * history of the sparks. A friend's unlocked achievements too. Unlocks arrive live from the server
 * ('achievement' events): a toast, and a system notification while the launcher is in the
 * background; many at once (an old player after an update) come as one summary.
 */

interface Reward { id: string; slot: string; name: string }
export interface Achievement {
  id: string; group: string; category?: string; tier: number; goal: number; sparks?: number; hidden?: boolean;
  /** Its icon as the server says (achievements made in the admin panel pick theirs); older servers send none. */
  icon?: string; custom?: boolean; manual?: boolean;
  name: string; nameEn: string; description: string; descriptionEn: string;
  value?: number; progress?: number; unlockedAt: number | null; reward?: Reward;
}
interface Mine {
  achievements: Achievement[];
  stats: { hours: number; todayMinutes: number; streak: number; bestStreak: number; servers: number; friends: number; messages: number; daysPlayed?: number };
  rules: { dayStartsAt: string; minMinutesPerDay: number; maxHoursPerDay: number };
  categories?: string[];
  sparks?: { balance: number; earned: number; total: number };
}
interface LedgerEntry { id: number; amount: number; reason: string; ref: string; label: string; labelEn: string; note: string; balance: number; at: number; by?: string }
interface Wallet { balance: number; ledger: LedgerEntry[]; unseen: { count: number; amount: number } }

export interface AchievementsDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** A cosmetic's picture, as the cosmetics menu draws it. */
  picture?: (slot: string, id: string) => Node;
  /** A slot's name in the player's language ("Peleryna"). */
  slotName?: (slot: string) => string;
  /** The balance next to the menu entry (hidden while signed out). */
  badge?: HTMLElement;
}

const GROUP_ICONS: Record<string, string> = {
  streak: 'fa-fire', hours: 'fa-clock', friends: 'fa-user-group', messages: 'fa-comment', servers: 'fa-server',
  days: 'fa-calendar-check', longday: 'fa-hourglass-half', weekends: 'fa-umbrella-beach', anniversary: 'fa-cake-candles',
  night: 'fa-moon', newyear: 'fa-champagne-glasses', halloween: 'fa-ghost', friday13: 'fa-cat',
  groups_joined: 'fa-people-group', groups_created: 'fa-comments', group_size: 'fa-users', clan_joined: 'fa-shield-halved', clan_founded: 'fa-chess-rook', clan_size: 'fa-flag',
  waypoints: 'fa-location-dot', parties_created: 'fa-bullhorn', parties_joined: 'fa-handshake', media: 'fa-camera', shares: 'fa-share-nodes', cloud: 'fa-cloud',
  sprays: 'fa-spray-can', worn: 'fa-shirt', bought: 'fa-bag-shopping', spent: 'fa-gem', manual: 'fa-award',
};
/** An achievement's icon: the server's (a Font Awesome name), else its group's, else a trophy (exported for the tests). */
export const iconFor = (a: Pick<Achievement, 'icon' | 'group'>) => (a.icon && /^fa-[a-z0-9-]{1,40}$/.test(a.icon) ? a.icon : GROUP_ICONS[a.group] ?? 'fa-trophy');
/** The categories in the server's order, with names and icons; unknown ones fall back to "other". */
const CATEGORY: Record<string, [string, string]> = {
  play: ['Gra', 'fa-gamepad'], streak: ['Serie', 'fa-fire'], social: ['Znajomi', 'fa-user-group'], community: ['Grupy i klany', 'fa-people-group'],
  explore: ['Serwery', 'fa-compass'], sharing: ['Udostępnianie', 'fa-share-nodes'], style: ['Styl', 'fa-wand-magic-sparkles'], secret: ['Ukryte', 'fa-mask'],
};
const categoryName = (c: string) => t(CATEGORY[c]?.[0] ?? 'Inne');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const icon = (name: string) => el('i', { className: `fa-solid ${name}` });
/** The currency's sign in its colour. */
const spark = () => el('span', { className: 'spark-sign', textContent: '✦' });

const nameOf = (a: Pick<Achievement, 'name' | 'nameEn'>) => (getLang() === 'en' ? a.nameEn : a.name);
const descriptionOf = (a: Achievement) => (getLang() === 'en' ? a.descriptionEn : a.description);
const fmt = (n: number) => n.toLocaleString(locale());

/** The toast and notification text of an unlock (exported for the tests of the wording). */
export function unlockText(a: Pick<Achievement, 'name' | 'nameEn' | 'reward' | 'sparks'>): { title: string; body: string } {
  const paid = a.sparks ? `${signedSparks(a.sparks)}. ` : '';
  return {
    title: t('Osiągnięcie odblokowane: {0}', nameOf(a)),
    body: paid + (!a.reward ? t('Zobacz swoje osiągnięcia w SlashClient.')
      : a.reward.slot === 'cape' ? t('Nagroda: peleryna {0}. Załóż ją w menu kosmetyków.', a.reward.name)
      // the admin may give any cosmetic for an achievement
      : t('Nagroda: {0}. Znajdziesz ją w menu kosmetyków.', a.reward.name)),
  };
}

/** One notice for many unlocks (exported for the tests): "+320 Iskier za 5 osiągnięć". */
export function summaryText(count: number, amount: number): { title: string; body: string } {
  return {
    title: count === 1 ? t('Odblokowano 1 osiągnięcie') : t('Odblokowano osiągnięcia: {0}', count),
    body: t('{0} za osiągnięcia. Wydaj je w sklepie w zakładce Osiągnięcia.', signedSparks(amount)),
  };
}

/** Achievements grouped by category in the order given, each sorted: the ones in progress by how far, then the rest. */
export function byCategory(list: Achievement[], order: string[]): { category: string; items: Achievement[]; unlocked: number }[] {
  const known = [...order, ...new Set(list.map((a) => a.category ?? 'other').filter((c) => !order.includes(c)))];
  return known.map((category) => {
    const items = list.filter((a) => (a.category ?? 'other') === category);
    return { category, items, unlocked: items.filter((a) => a.unlockedAt !== null).length };
  }).filter((g) => g.items.length);
}

type Tab = 'list' | 'shop' | 'history';

export function createAchievements(root: HTMLElement, deps: AchievementsDeps) {
  const { api } = deps;
  /** Whose achievements are shown: undefined = mine. */
  let friend: { id: string; name: string } | undefined;
  let loading = 0;
  let tab: Tab = 'list';
  /** The category picked in the list ('' = all). */
  let filter = '';
  let balance = 0;
  /** When a toast about unlocks was last shown, so the "unseen" summary does not repeat it. */
  let lastNoticeAt = 0;

  function setBalance(n: number | undefined) {
    if (n === undefined) {
      deps.badge?.classList.add('hidden');
      return;
    }
    balance = n;
    if (deps.badge) {
      deps.badge.textContent = sparkAmount(n);
      deps.badge.title = t('Twoje {0}: {1}', currencyName(), sparks(n));
      deps.badge.classList.remove('hidden');
    }
    root.querySelectorAll('.spark-balance-value').forEach((b) => (b.textContent = fmt(n)));
  }

  /** The cape's front from its texture (10×16 at 1,1 of the 64×32 layout, at 4×). */
  function rewardPicture(r: Reward) {
    const box = el('div', { className: 'ach-cape', title: r.name });
    if (r.slot === 'cape') box.style.backgroundImage = `url(img/capes/${r.id}.png)`;
    return box;
  }

  function card(a: Achievement, mine: boolean) {
    const done = a.unlockedAt !== null;
    const secret = a.hidden && !done;
    const fill = el('span');
    fill.style.width = `${Math.round((a.progress ?? 0) * 100)}%`;
    const value = a.value !== undefined ? `${fmt(a.value)} / ${fmt(a.goal)}` : '';
    const parts: Node[] = [
      el('div', { className: 'ach-icon' }, icon(done ? iconFor(a) : secret ? 'fa-question' : 'fa-lock')),
      el('div', { className: 'grow ach-text' },
        el('b', { textContent: nameOf(a) }),
        el('small', { className: 'muted', textContent: descriptionOf(a) }),
        mine && !done && a.progress !== undefined ? el('div', { className: 'ach-bar', title: value }, fill) : '',
        mine && !done && value ? el('small', { className: 'muted ach-count', textContent: value }) : '',
        done ? el('small', { className: 'ach-date', textContent: t('Odblokowano {0}', new Date(a.unlockedAt!).toLocaleDateString(locale())) }) : ''),
    ];
    const side = el('div', { className: 'ach-side' });
    if (a.sparks) side.append(el('span', { className: `ach-sparks${done ? ' earned' : ''}`, title: done ? t('Zdobyte: {0}', sparks(a.sparks)) : t('Do zdobycia: {0}', sparks(a.sparks)) }, spark(), ` ${fmt(a.sparks)}`));
    if (a.reward) {
      side.append(el('div', { className: 'ach-reward', title: done ? t('Nagroda odblokowana: {0}', a.reward.name) : t('Nagroda: {0}', a.reward.name) },
        rewardPicture(a.reward), el('small', { textContent: a.reward.name })));
    }
    if (side.childNodes.length) parts.push(side);
    return el('div', { className: `ach-card glass-panel${done ? ' done' : ''}${secret ? ' secret' : ''}` }, ...parts);
  }

  /** The list in categories, with a bar for each category and chips to show just one. */
  function renderList(achievements: Achievement[], mine: boolean, order: string[]) {
    const groups = byCategory(achievements, order);
    const chips = el('div', { className: 'ach-filter' });
    const chip = (key: string, label: string, iconName: string, count: string) => {
      const b = el('button', { type: 'button', className: `ach-chip${filter === key ? ' active' : ''}` }, icon(iconName), ` ${label} `, el('small', { textContent: count }));
      b.addEventListener('click', () => {
        filter = key;
        void render();
      });
      return b;
    };
    const unlocked = achievements.filter((a) => a.unlockedAt !== null).length;
    chips.append(chip('', t('Wszystkie'), 'fa-trophy', `${unlocked}/${achievements.length}`));
    for (const g of groups) chips.append(chip(g.category, categoryName(g.category), CATEGORY[g.category]?.[1] ?? 'fa-star', `${g.unlocked}/${g.items.length}`));
    const sections = groups.filter((g) => !filter || g.category === filter).map((g) => {
      const bar = el('span');
      bar.style.width = `${Math.round((g.unlocked / g.items.length) * 100)}%`;
      const earned = g.items.filter((a) => a.unlockedAt !== null).reduce((n, a) => n + (a.sparks ?? 0), 0);
      const all = g.items.reduce((n, a) => n + (a.sparks ?? 0), 0);
      const grid = el('div', { className: 'ach-grid' });
      for (const a of g.items) grid.append(card(a, mine));
      return el('section', { className: 'ach-section' },
        el('div', { className: 'ach-section-head' }, icon(CATEGORY[g.category]?.[1] ?? 'fa-star'), el('h3', { textContent: categoryName(g.category) }),
          el('div', { className: 'ach-bar ach-section-bar', title: `${g.unlocked} / ${g.items.length}` }, bar),
          el('small', { className: 'muted', textContent: `${g.unlocked}/${g.items.length}` }),
          all ? el('small', { className: 'ach-section-sparks', title: t('Zdobyte z tej kategorii') }, spark(), ` ${fmt(earned)} / ${fmt(all)}`) : ''),
        grid);
    });
    return { chips, sections, unlocked };
  }

  function tabs() {
    const bar = el('div', { className: 'ach-tabs' });
    for (const [key, label, iconName] of [['list', t('Osiągnięcia'), 'fa-trophy'], ['shop', t('Sklep'), 'fa-store'], ['history', t('Historia {0}', currencyOf()), 'fa-clock-rotate-left']] as [Tab, string, string][]) {
      const b = el('button', { type: 'button', className: `ach-tab${tab === key ? ' active' : ''}` }, icon(iconName), ` ${label}`);
      b.addEventListener('click', () => {
        tab = key;
        void render();
      });
      bar.append(b);
    }
    return bar;
  }

  function balanceCard(earned?: number, total?: number) {
    return el('div', { className: 'spark-card glass-panel' },
      el('div', { className: 'spark-big' }, spark()),
      el('div', { className: 'grow' },
        el('small', { className: 'muted', textContent: t('Twoje {0}', currencyName()) }),
        el('b', { className: 'spark-balance-value', textContent: fmt(balance) }),
        earned !== undefined && total ? el('small', { className: 'muted', textContent: t('Z osiągnięć: {0} z {1} do zdobycia', fmt(earned), sparks(total)) }) : ''));
  }

  async function renderShop(ticket: number) {
    const res: { items: (ShopItem & { available: boolean })[]; wallet?: { balance: number } } = await api.socialApi('GET', '/v1/cosmetics');
    if (ticket !== loading) return [];
    if (res.wallet) setBalance(res.wallet.balance);
    const items = res.items.filter((i) => i.price);
    if (!items.length) return [el('p', { className: 'muted', textContent: t('Sklep jest jeszcze pusty.') })];
    const grid = el('div', { className: 'shop-grid' });
    for (const it of items.sort((a, b) => Number(!!a.owned) - Number(!!b.owned) || (a.price ?? 0) - (b.price ?? 0))) {
      const pic = el('div', { className: 'shop-picture' }, deps.picture?.(it.slot, it.id) ?? icon('fa-star'));
      const action = el('button', { type: 'button', className: it.owned ? '' : 'primary' });
      if (it.owned) {
        action.append(icon('fa-shirt'), t(' Załóż'));
        action.addEventListener('click', async () => {
          try {
            await api.socialApi('POST', '/v1/me', it.slot === 'cape' ? { cape: it.id } : { loadout: { [it.slot]: it.id } });
            deps.toast(t('{0} założone.', it.name));
          } catch (err) {
            deps.toast(deps.errorText(err), true);
          }
        });
      } else {
        const missing = shortBy(it.price!, balance);
        action.append(spark(), ` ${fmt(it.price!)}`);
        if (missing) {
          action.classList.remove('primary');
          action.title = missing;
        }
        action.addEventListener('click', async () => {
          const next = await buyWithConfirm(it, balance, deps, deps.picture?.(it.slot, it.id));
          if (next === undefined) return;
          setBalance(next);
          void render();
        });
      }
      grid.append(el('div', { className: `shop-card glass-panel${it.owned ? ' owned' : ''}` }, pic,
        el('b', { textContent: it.name }),
        el('small', { className: 'muted', textContent: deps.slotName?.(it.slot) ?? it.slot }),
        it.owned ? el('small', { className: 'shop-owned' }, icon('fa-check'), t(' Kupione')) : el('small', { className: 'muted shop-missing', textContent: shortBy(it.price!, balance) || ' ' }),
        action));
    }
    return [el('p', { className: 'muted ach-rules', textContent: t('Kosmetyki ze sklepu kupuje się za {0} z osiągnięć. Kupione zostają na koncie na zawsze; załóż je tutaj albo w menu kosmetyków.', currencyName()) }), grid];
  }

  async function renderHistory(ticket: number) {
    const w: Wallet = await api.socialApi('GET', '/v1/wallet');
    if (ticket !== loading) return [];
    setBalance(w.balance);
    if (!w.ledger.length) return [el('p', { className: 'muted', textContent: t('Jeszcze nic. {0} dostajesz za osiągnięcia.', currencyName()) })];
    const what = (e: LedgerEntry) => {
      const label = getLang() === 'en' ? e.labelEn : e.label;
      if (e.reason === 'achievement') return [icon('fa-trophy'), t(' Osiągnięcie: {0}', label || e.ref)];
      if (e.reason === 'purchase') return [icon('fa-bag-shopping'), t(' Zakup: {0}', label || e.ref)];
      return [icon('fa-user-shield'), t(' Od administracji: {0}', e.note)];
    };
    const rows = w.ledger.map((e) => el('div', { className: 'ledger-row' },
      el('span', { className: 'grow' }, ...what(e)),
      el('small', { className: 'muted', textContent: new Date(e.at).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) }),
      el('b', { className: `ledger-amount ${e.amount > 0 ? 'plus' : 'minus'}`, textContent: `${e.amount > 0 ? '+' : '−'}${fmt(Math.abs(e.amount))}` }),
      el('small', { className: 'muted ledger-after', title: t('Saldo po zmianie'), textContent: fmt(e.balance) })));
    return [el('div', { className: 'ledger glass-panel' }, ...rows)];
  }

  async function render() {
    const ticket = ++loading;
    root.replaceChildren(el('p', { className: 'muted' }, el('span', { className: 'spinner' }), t(' Wczytywanie…')));
    const state = await api.socialState().catch(() => undefined);
    if (ticket !== loading) return;
    if (!state?.user) {
      setBalance(undefined);
      const go = el('button', { type: 'button', className: 'primary' }, icon('fa-user-group'), t(' Przejdź do Znajomych'));
      go.addEventListener('click', () => document.querySelector<HTMLButtonElement>('.nav[data-view="friends"]')?.click());
      root.replaceChildren(el('div', { className: 'card glass-panel' },
        el('h3', {}, icon('fa-trophy'), t(' Osiągnięcia SlashClient')),
        el('p', { className: 'muted', textContent: t('Zaloguj się na konto SlashClient w zakładce Znajomi, żeby zbierać osiągnięcia: serie dni gry, godziny, znajomych i serwery. Każde daje {0} na kosmetyki w sklepie, a niektóre wyjątkowe peleryny.', currencyName()) }),
        el('div', { className: 'row' }, go)));
      return;
    }
    try {
      if (friend) {
        const f = friend;
        const { achievements }: { achievements: Achievement[] } = await api.socialApi('GET', `/v1/achievements/${f.id}`);
        if (ticket !== loading) return;
        const back = el('button', { type: 'button' }, icon('fa-arrow-left'), t(' Moje osiągnięcia'));
        back.addEventListener('click', () => {
          friend = undefined;
          filter = '';
          void render();
        });
        const { chips, sections, unlocked } = renderList(achievements, false, Object.keys(CATEGORY));
        root.replaceChildren(
          el('div', { className: 'ach-head' }, el('h3', {}, icon('fa-trophy'), t(' Osiągnięcia: {0}', f.name)),
            el('span', { className: 'muted', textContent: t('{0} z {1} odblokowanych', unlocked, achievements.length) }), back),
          chips, ...sections);
        return;
      }
      if (tab === 'shop' || tab === 'history') {
        const body = tab === 'shop' ? await renderShop(ticket) : await renderHistory(ticket);
        if (ticket !== loading) return;
        root.replaceChildren(el('div', { className: 'ach-top' }, balanceCard(), tabs()), ...body);
        return;
      }
      const mine: Mine = await api.socialApi('GET', '/v1/achievements');
      if (ticket !== loading) return;
      if (mine.sparks) setBalance(mine.sparks.balance);
      const s = mine.stats;
      const stat = (iconName: string, value: string, label: string) =>
        el('div', { className: 'ach-stat glass-panel' }, icon(iconName), el('b', { textContent: value }), el('small', { className: 'muted', textContent: label }));
      const { chips, sections } = renderList(mine.achievements, true, mine.categories ?? Object.keys(CATEGORY));
      root.replaceChildren(
        el('div', { className: 'ach-top' }, mine.sparks ? balanceCard(mine.sparks.earned, mine.sparks.total) : '', tabs()),
        el('div', { className: 'ach-stats' },
          stat('fa-fire', String(s.streak), t('dni z rzędu (rekord {0})', s.bestStreak)),
          stat('fa-clock', String(s.hours), t('godzin gry')),
          stat('fa-calendar-day', String(s.todayMinutes), t('minut dzisiaj')),
          s.daysPlayed !== undefined ? stat('fa-calendar-check', String(s.daysPlayed), t('dni gry')) : '',
          stat('fa-server', String(s.servers), t('serwerów'))),
        el('p', { className: 'muted ach-rules', textContent: t('Liczy się czas w świecie lub na serwerze, gdy launcher jest połączony z SlashClient. Dzień do serii: co najmniej {0} min gry; dni zaczynają się o północy UTC; najwyżej {1} h dziennie.', mine.rules.minMinutesPerDay, mine.rules.maxHoursPerDay) }),
        chips, ...sections);
    } catch (err) {
      if (ticket !== loading) return;
      const retry = el('button', { type: 'button' }, icon('fa-rotate-right'), t(' Spróbuj ponownie'));
      retry.addEventListener('click', () => void render());
      root.replaceChildren(el('div', { className: 'card glass-panel' }, el('p', { className: 'fr-error', textContent: deps.errorText(err) }), el('div', { className: 'row' }, retry)));
    }
  }

  const isVisible = () => root.closest('.view')?.classList.contains('active');

  /** Shows a notice in the window or, in the background, as a system notification. */
  function notice(title: string, body: string) {
    lastNoticeAt = Date.now();
    if (document.hasFocus()) deps.toast(`${title}. ${body}`);
    else void api.notify(title, body, { view: 'achievements' }).catch(() => undefined);
    // what was just shown is not shown again as "new" at the next start
    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => void api.socialApi('POST', '/v1/wallet/seen', {}).catch(() => undefined), 1500);
  }
  let seenTimer: ReturnType<typeof setTimeout> | undefined;

  /** After connecting: the sparks paid while the launcher was away (old achievements after the update), as one notice. */
  async function catchUp() {
    await new Promise((r) => setTimeout(r, 2500));
    const w: Wallet | undefined = await api.socialApi('GET', '/v1/wallet?limit=1').catch(() => undefined);
    if (!w) return;
    setBalance(w.balance);
    if (!w.unseen.count) return;
    if (Date.now() - lastNoticeAt < 6000) {
      void api.socialApi('POST', '/v1/wallet/seen', {}).catch(() => undefined);
      return;
    }
    const { title, body } = summaryText(w.unseen.count, w.unseen.amount);
    notice(title, body);
  }

  api.on('social:event', (e: { type?: string; achievement?: Achievement; quiet?: boolean; count?: number; sparks?: number; balance?: number; state?: { user?: unknown; connected?: boolean } }) => {
    if (e?.type === 'achievement' && e.achievement) {
      // one of many at once: the summary that follows says it
      if (!e.quiet) {
        const { title, body } = unlockText(e.achievement);
        notice(title, body);
      }
      if (isVisible() && !friend) void render();
    } else if (e?.type === 'achievements-summary' && e.count) {
      const { title, body } = summaryText(e.count, e.sparks ?? 0);
      notice(title, body);
    } else if (e?.type === 'wallet' && typeof e.balance === 'number') {
      setBalance(e.balance);
    } else if (e?.type === 'state') {
      if (e.state?.user && e.state.connected) void catchUp();
      else if (!e.state?.user) setBalance(undefined);
      if (isVisible()) void render();
    }
  });
  api.on('notify:open', (target: { view?: string }) => {
    if (target?.view === 'achievements') document.querySelector<HTMLButtonElement>('.nav[data-view="achievements"]')?.click();
  });
  // the launcher may have connected before this view existed
  void api.socialState().then((s: { user?: unknown; connected?: boolean } | undefined) => s?.user && s.connected && catchUp()).catch(() => undefined);

  return {
    /** Called when the view opens: the player's own achievements. */
    show() {
      friend = undefined;
      void render();
    },
    /** Opens the shop tab (from the cosmetics menu). */
    showShop() {
      document.querySelector<HTMLButtonElement>('.nav[data-view="achievements"]')?.click();
      friend = undefined;
      tab = 'shop';
      void render();
    },
    /** A friend's unlocked achievements (from the friends list). */
    showFriend(id: string, name: string) {
      document.querySelector<HTMLButtonElement>('.nav[data-view="achievements"]')?.click();
      friend = { id, name };
      filter = '';
      void render();
    },
    /** The balance as last known (the cosmetics menu asks before a purchase). */
    balance: () => balance,
    setBalance,
  };
}
