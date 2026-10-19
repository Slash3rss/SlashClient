import { getLang, locale, t } from '../shared/i18n';

/**
 * The "Achievements" view: SlashClient achievements of the signed-in account (play streak, hours
 * played, friends, servers) with progress bars and the cosmetics they unlock, and a friend's
 * unlocked ones. Unlocks arrive live from the server ('achievement' events): a toast, and a system
 * notification while the launcher is in the background.
 */

interface Reward { id: string; slot: string; name: string }
export interface Achievement {
  id: string; group: string; tier: number; goal: number;
  name: string; nameEn: string; description: string; descriptionEn: string;
  value?: number; progress?: number; unlockedAt: number | null; reward?: Reward;
}
interface Mine {
  achievements: Achievement[];
  stats: { hours: number; todayMinutes: number; streak: number; bestStreak: number; servers: number; friends: number; messages: number };
  rules: { dayStartsAt: string; minMinutesPerDay: number; maxHoursPerDay: number };
}

export interface AchievementsDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

const GROUP_ICONS: Record<string, string> = { streak: 'fa-fire', hours: 'fa-clock', friends: 'fa-user-group', messages: 'fa-comment', servers: 'fa-server' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const icon = (name: string) => el('i', { className: `fa-solid ${name}` });

const nameOf = (a: Achievement) => (getLang() === 'en' ? a.nameEn : a.name);
const descriptionOf = (a: Achievement) => (getLang() === 'en' ? a.descriptionEn : a.description);

/** The toast and notification text of an unlock (exported for the tests of the wording). */
export function unlockText(a: Pick<Achievement, 'name' | 'nameEn' | 'reward'>): { title: string; body: string } {
  const name = getLang() === 'en' ? a.nameEn : a.name;
  return {
    title: t('Osiągnięcie odblokowane: {0}', name),
    body: a.reward ? t('Nagroda: peleryna {0}. Załóż ją w menu kosmetyków.', a.reward.name) : t('Zobacz swoje osiągnięcia w SlashClient.'),
  };
}

export function createAchievements(root: HTMLElement, deps: AchievementsDeps) {
  const { api } = deps;
  /** Whose achievements are shown: undefined = mine. */
  let friend: { id: string; name: string } | undefined;
  let loading = 0;

  /** The cape's front from its texture (10×16 at 1,1 of the 64×32 layout, at 4×). */
  function rewardPicture(r: Reward) {
    const box = el('div', { className: 'ach-cape', title: r.name });
    if (r.slot === 'cape') box.style.backgroundImage = `url(img/capes/${r.id}.png)`;
    return box;
  }

  function card(a: Achievement, mine: boolean) {
    const done = a.unlockedAt !== null;
    const fill = el('span');
    fill.style.width = `${Math.round((a.progress ?? 0) * 100)}%`;
    const parts: Node[] = [
      el('div', { className: 'ach-icon' }, icon(done ? GROUP_ICONS[a.group] ?? 'fa-trophy' : 'fa-lock')),
      el('div', { className: 'grow ach-text' },
        el('b', { textContent: nameOf(a) }),
        el('small', { className: 'muted', textContent: descriptionOf(a) }),
        mine && !done && a.progress !== undefined
          ? el('div', { className: 'ach-bar', title: `${a.value} / ${a.goal}` }, fill)
          : '',
        mine && !done && a.value !== undefined ? el('small', { className: 'muted ach-count', textContent: `${a.value} / ${a.goal}` }) : '',
        done ? el('small', { className: 'ach-date', textContent: t('Odblokowano {0}', new Date(a.unlockedAt!).toLocaleDateString(locale())) }) : ''),
    ];
    if (a.reward) {
      parts.push(el('div', { className: 'ach-reward', title: done ? t('Nagroda odblokowana: {0}', a.reward.name) : t('Nagroda: {0}', a.reward.name) },
        rewardPicture(a.reward), el('small', { textContent: a.reward.name })));
    }
    return el('div', { className: `ach-card glass-panel${done ? ' done' : ''}` }, ...parts);
  }

  function renderList(achievements: Achievement[], mine: boolean) {
    const unlocked = achievements.filter((a) => a.unlockedAt !== null).length;
    const grid = el('div', { className: 'ach-grid' });
    for (const a of achievements) grid.append(card(a, mine));
    return { grid, unlocked };
  }

  async function render() {
    const ticket = ++loading;
    root.replaceChildren(el('p', { className: 'muted' }, el('span', { className: 'spinner' }), t(' Wczytywanie…')));
    const state = await api.socialState().catch(() => undefined);
    if (ticket !== loading) return;
    if (!state?.user) {
      const go = el('button', { type: 'button', className: 'primary' }, icon('fa-user-group'), t(' Przejdź do Znajomych'));
      go.addEventListener('click', () => document.querySelector<HTMLButtonElement>('.nav[data-view="friends"]')?.click());
      root.replaceChildren(el('div', { className: 'card glass-panel' },
        el('h3', {}, icon('fa-trophy'), t(' Osiągnięcia SlashClient')),
        el('p', { className: 'muted', textContent: t('Zaloguj się na konto SlashClient w zakładce Znajomi, żeby zbierać osiągnięcia: serie dni gry, godziny, znajomych i serwery. Niektóre dają wyjątkowe peleryny.') }),
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
          void render();
        });
        const { grid, unlocked } = renderList(achievements, false);
        root.replaceChildren(
          el('div', { className: 'ach-head' }, el('h3', {}, icon('fa-trophy'), t(' Osiągnięcia: {0}', f.name)),
            el('span', { className: 'muted', textContent: t('{0} z {1} odblokowanych', unlocked, achievements.length) }), back),
          grid);
        return;
      }
      const mine: Mine = await api.socialApi('GET', '/v1/achievements');
      if (ticket !== loading) return;
      const s = mine.stats;
      const stat = (iconName: string, value: string, label: string) =>
        el('div', { className: 'ach-stat glass-panel' }, icon(iconName), el('b', { textContent: value }), el('small', { className: 'muted', textContent: label }));
      const { grid, unlocked } = renderList(mine.achievements, true);
      root.replaceChildren(
        el('div', { className: 'ach-stats' },
          stat('fa-fire', String(s.streak), t('dni z rzędu (rekord {0})', s.bestStreak)),
          stat('fa-clock', String(s.hours), t('godzin gry')),
          stat('fa-calendar-day', String(s.todayMinutes), t('minut dzisiaj')),
          stat('fa-server', String(s.servers), t('serwerów')),
          stat('fa-trophy', `${unlocked}/${mine.achievements.length}`, t('odblokowanych'))),
        el('p', { className: 'muted ach-rules', textContent: t('Liczy się czas w świecie lub na serwerze, gdy launcher jest połączony z SlashClient. Dzień do serii: co najmniej {0} min gry; dni zaczynają się o północy UTC; najwyżej {1} h dziennie.', mine.rules.minMinutesPerDay, mine.rules.maxHoursPerDay) }),
        grid);
    } catch (err) {
      if (ticket !== loading) return;
      const retry = el('button', { type: 'button' }, icon('fa-rotate-right'), t(' Spróbuj ponownie'));
      retry.addEventListener('click', () => void render());
      root.replaceChildren(el('div', { className: 'card glass-panel' }, el('p', { className: 'fr-error', textContent: deps.errorText(err) }), el('div', { className: 'row' }, retry)));
    }
  }

  const isVisible = () => root.closest('.view')?.classList.contains('active');

  // an achievement unlocked (in the game or here): a toast, a notification in the background, a fresh list
  api.on('social:event', (e: { type?: string; achievement?: Achievement }) => {
    if (e?.type === 'achievement' && e.achievement) {
      const { title, body } = unlockText(e.achievement);
      if (document.hasFocus()) deps.toast(`${title}. ${body}`);
      else void api.notify(title, body, { view: 'achievements' }).catch(() => undefined);
      if (isVisible() && !friend) void render();
    } else if (e?.type === 'state' && isVisible()) void render();
  });
  api.on('notify:open', (target: { view?: string }) => {
    if (target?.view === 'achievements') document.querySelector<HTMLButtonElement>('.nav[data-view="achievements"]')?.click();
  });

  return {
    /** Called when the view opens: the player's own achievements. */
    show() {
      friend = undefined;
      void render();
    },
    /** A friend's unlocked achievements (from the friends list). */
    showFriend(id: string, name: string) {
      document.querySelector<HTMLButtonElement>('.nav[data-view="achievements"]')?.click();
      friend = { id, name };
      void render();
    },
  };
}
