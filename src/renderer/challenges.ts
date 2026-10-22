import { getLang, locale, t } from '../shared/i18n';
import { signedSparks, sparks } from '../shared/sparks';

/**
 * Daily and weekly challenges ("Wyzwania", server 0.9.36+) in the Achievements view: today's and this
 * week's challenges of the signed-in account with their progress, reward and the time left until
 * they change (midnight in Poland; weeks on Monday), and the bonus for finishing all of them. The
 * server picks them, counts them and pays them (challenges.ts there); this only shows them.
 */

export interface Challenge {
  id: string; period: 'daily' | 'weekly'; metric: string; icon?: string; target: number; sparks: number;
  name: string; nameEn: string; server?: string; value: number; progress: number; completedAt: number | null;
}
export interface ChallengePeriod { key: string; startsAt: number; endsAt: number; bonus: number; bonusAt: number | null; challenges: Challenge[] }
export interface Challenges { enabled: boolean; now?: number; timeZone?: string; daily?: ChallengePeriod; weekly?: ChallengePeriod }

const nameOf = (c: Pick<Challenge, 'name' | 'nameEn'>) => (getLang() === 'en' ? c.nameEn || c.name : c.name);
const fmt = (n: number) => n.toLocaleString(locale());

/** "5 h 12 min", "2 d 3 h", "4 min" until a moment (exported for the tests). */
export function timeLeft(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return t('{0} d {1} h', d, h);
  if (h) return t('{0} h {1} min', h, m % 60);
  return t('{0} min', m);
}

/** The toast and notification of a completed challenge (exported for the tests). */
export function completedText(c: Pick<Challenge, 'name' | 'nameEn' | 'sparks' | 'period'>): { title: string; body: string } {
  return {
    title: t('Wyzwanie ukończone: {0}', nameOf(c)),
    body: c.sparks ? t('{0}. Pozostałe wyzwania znajdziesz w zakładce Osiągnięcia.', signedSparks(c.sparks)) : t('Pozostałe wyzwania znajdziesz w zakładce Osiągnięcia.'),
  };
}

/** All of a day's or a week's done: the bonus (exported for the tests). */
export function bonusText(period: string, amount: number): { title: string; body: string } {
  return {
    title: period === 'weekly' ? t('Wszystkie wyzwania tygodnia ukończone!') : t('Wszystkie wyzwania dnia ukończone!'),
    body: t('Premia: {0}.', signedSparks(amount)),
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const icon = (name: string) => el('i', { className: `fa-solid ${name}` });
const spark = () => el('span', { className: 'spark-sign', textContent: '✦' });

function card(c: Challenge) {
  const done = c.completedAt !== null;
  const fill = el('span');
  fill.style.width = `${Math.round(Math.min(1, c.progress) * 100)}%`;
  const count = `${fmt(Math.min(c.value, c.target))} / ${fmt(c.target)}`;
  return el('div', { className: `ach-card chal-card glass-panel${done ? ' done' : ''}` },
    el('div', { className: 'ach-icon' }, icon(done ? 'fa-check' : c.icon && /^fa-[a-z0-9-]{1,40}$/.test(c.icon) ? c.icon : 'fa-list-check')),
    el('div', { className: 'grow ach-text' },
      el('b', { textContent: nameOf(c) }),
      el('div', { className: 'ach-bar', title: count }, fill),
      el('small', { className: 'muted ach-count', textContent: done ? t('Ukończone {0}', new Date(c.completedAt!).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })) : count })),
    el('div', { className: 'ach-side' },
      el('span', { className: `ach-sparks${done ? ' earned' : ''}`, title: done ? t('Zdobyte: {0}', sparks(c.sparks)) : t('Do zdobycia: {0}', sparks(c.sparks)) }, spark(), ` ${fmt(c.sparks)}`)));
}

/** One period's section: its challenges, the time left and the bonus. `skew`: the server's clock minus ours. */
function section(kind: 'daily' | 'weekly', p: ChallengePeriod, skew: number) {
  const done = p.challenges.filter((c) => c.completedAt !== null).length;
  const bar = el('span');
  bar.style.width = `${p.challenges.length ? Math.round((done / p.challenges.length) * 100) : 0}%`;
  const left = el('small', { className: 'muted chal-left' }, icon('fa-hourglass-half'), ` ${t('Nowe za {0}', timeLeft(p.endsAt - (Date.now() + skew)))}`);
  const bonus = p.bonus > 0 && p.challenges.length
    ? el('div', { className: `chal-bonus glass-panel${p.bonusAt ? ' done' : ''}` },
      icon(p.bonusAt ? 'fa-gift' : 'fa-box'),
      el('span', { className: 'grow', textContent: p.bonusAt ? t('Premia za wszystkie odebrana') : kind === 'daily' ? t('Ukończ wszystkie dzisiejsze, żeby dostać premię') : t('Ukończ wszystkie w tym tygodniu, żeby dostać premię') }),
      el('span', { className: `ach-sparks${p.bonusAt ? ' earned' : ''}` }, spark(), ` ${fmt(p.bonus)}`))
    : '';
  const grid = el('div', { className: 'ach-grid' }, ...p.challenges.map(card));
  return el('section', { className: 'ach-section chal-section' },
    el('div', { className: 'ach-section-head' }, icon(kind === 'daily' ? 'fa-sun' : 'fa-calendar-week'),
      el('h3', { textContent: kind === 'daily' ? t('Dzisiaj') : t('Ten tydzień') }),
      el('div', { className: 'ach-bar ach-section-bar', title: `${done} / ${p.challenges.length}` }, bar),
      el('small', { className: 'muted', textContent: `${done}/${p.challenges.length}` }), left),
    p.challenges.length ? grid : el('p', { className: 'muted', textContent: t('Brak wyzwań w tym okresie.') }),
    bonus);
}

/** The challenges' tab, from the server's answer. */
export function renderChallenges(data: Challenges, fetchedAt = Date.now()): Node[] {
  if (!data.enabled || !data.daily || !data.weekly) return [el('div', { className: 'card glass-panel' }, el('p', { className: 'muted', textContent: t('Wyzwania są teraz wyłączone.') }))];
  const skew = data.now ? data.now - fetchedAt : 0;
  return [
    el('p', { className: 'muted ach-rules', textContent: t('Codzienne wyzwania zmieniają się o północy czasu polskiego, tygodniowe w poniedziałek. Liczy się to, co zrobisz od ich początku, z launcherem połączonym z SlashClient; każde płaci raz.') }),
    section('daily', data.daily, skew),
    section('weekly', data.weekly, skew),
  ];
}
