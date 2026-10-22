import { locale, t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * "Propozycje" in Friends: SlashClient players met recently on the same server (the server
 * counts it, server/src/suggestions.ts), with why each is suggested, "Dodaj" (a friend request)
 * and "×" (not suggested again for a long time). Collapsible, a few at a time with "Pokaż więcej";
 * asked again every few minutes and after friends change. An older server without suggestions,
 * or one where the admin switched them off: no section at all.
 */

export interface Suggestion {
  id: string; handle: string; name: string; avatar: string;
  /** Where they met most: the server's name from its status rule, else its address. */
  server: string;
  /** Minutes on the same server at the same time, and seen next to each other in the world. */
  minutes: number; nearbyMinutes: number;
  lastAt: number; mutual: number;
}
interface View { enabled: boolean; visible: boolean; suggestions: Suggestion[] }

/** How many show at first, and how many more each "Pokaż więcej" adds. */
export const STEP = 3;
/** Asked again this often while the launcher runs. */
export const REFRESH_MS = 10 * 60_000;
const COLLAPSED = 'friends.suggestions.collapsed';

/** "45 min", "2 h". */
export function durationText(minutes: number): string {
  return minutes < 60 ? t('{0} min', Math.max(1, Math.round(minutes))) : t('{0} h', Math.round(minutes / 60));
}

/** "dzisiaj", "wczoraj", "3 dni temu": by calendar days. */
export function whenText(at: number, now = Date.now()): string {
  const day = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const days = Math.max(0, Math.round(day(now) - day(at)));
  return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-days, 'day');
}

/** "1 wspólny znajomy", "3 wspólnych znajomych". */
export function mutualText(n: number): string {
  return n === 1 ? t('1 wspólny znajomy') : t('{0} wspólnych znajomych', n);
}

/** Why someone is suggested: "Graliście razem na skyup.pl · 2 h · wczoraj", "3 wspólnych znajomych". */
export function reasons(s: Suggestion, now = Date.now()): string[] {
  const out: string[] = [];
  const when = whenText(s.lastAt, now);
  if (s.minutes > 0) out.push(t('Graliście razem na {0} · {1} · {2}', s.server, durationText(s.minutes), when));
  else out.push(t('Byliście obok siebie na {0} · {1}', s.server, when));
  if (s.nearbyMinutes > 0 && s.minutes > 0) out.push(t('Widzieliście się w grze'));
  if (s.mutual > 0) out.push(mutualText(s.mutual));
  return out;
}

interface Deps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** The face (or letter) as everywhere in Friends. */
  avatar: (p: { id: string; handle: string; name: string; avatar: string }) => HTMLElement;
  /** Draw the list again (the section changed). */
  changed: () => void;
  /** A request went out: the friends list the server answered with. */
  sent: (list: unknown, name: string, status: string) => void;
  /** "Prywatność profilu", where the switch for being suggested is. */
  openPrivacy: () => void;
}

export function createSuggestions(deps: Deps) {
  const { api } = deps;
  let view: View | undefined;
  let shown = STEP;
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(COLLAPSED) === '1';
  } catch {
    // no storage: open
  }
  let loading: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** Rows with a request or dismissal on the way (their buttons wait). */
  const busy = new Set<string>();

  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      try {
        view = await api.socialApi('GET', '/v1/friends/suggestions?limit=24');
      } catch {
        // an older server (not_found), offline or rate limited: nothing shown, or what was there stays
      } finally {
        loading = undefined;
      }
      deps.changed();
    })();
    timer ??= setInterval(() => void refresh(), REFRESH_MS);
    return loading;
  }

  /** Signed out, or another account: nothing of the old one stays. */
  function clear() {
    view = undefined;
    shown = STEP;
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  async function add(s: Suggestion) {
    busy.add(s.id);
    deps.changed();
    try {
      const res = await api.socialApi('POST', '/v1/friends/requests', { handle: s.handle });
      if (view) view.suggestions = view.suggestions.filter((x) => x.id !== s.id);
      deps.sent(res, s.name, res?.status ?? 'sent');
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      busy.delete(s.id);
      deps.changed();
    }
  }

  async function dismiss(s: Suggestion) {
    busy.add(s.id);
    // gone at once; the server's answer is the list without them
    if (view) view.suggestions = view.suggestions.filter((x) => x.id !== s.id);
    deps.changed();
    try {
      view = await api.socialApi('POST', `/v1/friends/suggestions/${encodeURIComponent(s.id)}/dismiss`);
    } catch (err) {
      deps.toast(deps.errorText(err), true);
      void refresh();
    } finally {
      busy.delete(s.id);
      deps.changed();
    }
  }

  function toggle() {
    collapsed = !collapsed;
    try {
      localStorage.setItem(COLLAPSED, collapsed ? '1' : '0');
    } catch {
      // not remembered
    }
    deps.changed();
  }

  function row(s: Suggestion): HTMLElement {
    const why = reasons(s);
    const addBtn = el('button', { type: 'button', className: 'fr-sug-add primary', title: t('Wyślij zaproszenie do znajomych'), disabled: busy.has(s.id) }, icon('fa-user-plus'), ` ${t('Dodaj')}`);
    addBtn.addEventListener('click', () => void add(s));
    const hide = el('button', { type: 'button', className: 'icon-btn fr-sug-hide', title: t('Nie proponuj więcej'), disabled: busy.has(s.id) }, icon('fa-xmark'));
    hide.addEventListener('click', () => void dismiss(s));
    return el('div', { className: 'fr-row fr-sug-row', title: why.join('\n') },
      deps.avatar(s),
      el('div', { className: 'grow fr-names' }, el('b', { textContent: s.name }),
        el('small', { className: 'muted', textContent: why[0] }),
        why.length > 1 ? el('small', { className: 'muted fr-sug-extra', textContent: why.slice(1).join(' · ') }) : ''),
      addBtn, hide);
  }

  /** The section for the friends list: nothing when there is nobody to suggest. */
  function sections(): Node[] {
    const list = view?.enabled && view.visible ? view.suggestions : [];
    if (!list.length) return [];
    const head = el('button', { type: 'button', className: 'fr-section fr-section-row fr-sug-head', title: collapsed ? t('Pokaż propozycje') : t('Zwiń propozycje') },
      el('span', { textContent: t('Propozycje ({0})', list.length) }), icon(collapsed ? 'fa-chevron-down' : 'fa-chevron-up'));
    head.addEventListener('click', toggle);
    if (collapsed) return [head];
    const out: Node[] = [head, el('p', { className: 'muted fr-sug-hint', textContent: t('Gracze SlashClient, z którymi ostatnio grałeś na tym samym serwerze.') })];
    for (const s of list.slice(0, shown)) out.push(row(s));
    const foot = el('div', { className: 'fr-sug-foot' });
    if (list.length > shown) {
      const more = el('button', { type: 'button', className: 'fr-chip-btn' }, icon('fa-angles-down'), ` ${t('Pokaż więcej')}`);
      more.addEventListener('click', () => {
        shown += STEP;
        deps.changed();
      });
      foot.append(more);
    }
    const privacy = el('button', { type: 'button', className: 'fr-chip-btn fr-sug-privacy', title: t('Pokazuj mnie w propozycjach znajomych') }, icon('fa-user-lock'), ` ${t('Prywatność')}`);
    privacy.addEventListener('click', () => deps.openPrivacy());
    foot.append(privacy);
    out.push(foot);
    return out;
  }

  return { refresh, clear, sections, get view() { return view; } };
}

// ---------- the switch in "Prywatność profilu" ----------

/** Whether this player may be suggested to others (and sees suggestions); undefined: an older server. */
export async function suggestionPrivacy(api: any): Promise<{ visible: boolean; enabled: boolean } | undefined> {
  try {
    return await api.socialApi('GET', '/v1/me/suggestions');
  } catch {
    return undefined;
  }
}
