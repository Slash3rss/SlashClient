import { t } from '../shared/i18n';
import { control, el } from './dialog';

/**
 * "Pozycja na minimapie" in the account window (server/src/positions.ts): whether friends playing
 * on the same server see where I am on their minimap (and the full map), with all friends, only
 * the ones picked, or nobody (the default). The choice is kept on the account, so every launcher
 * and game follows it; the game sends the position itself, every 2 seconds, only while it is on.
 */

export type ShareMode = 'off' | 'all' | 'some';
export interface PositionSharing { mode: ShareMode; friends: string[] }
interface FriendRef { id: string; name: string }

/** The server's answer as the launcher keeps it; anything odd is "off". */
export function cleanSharing(raw: unknown): PositionSharing {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mode: ShareMode = r.mode === 'all' || r.mode === 'some' ? r.mode : 'off';
  const friends = Array.isArray(r.friends) ? r.friends.filter((f): f is string => typeof f === 'string' && /^[\w-]{1,64}$/.test(f)) : [];
  return { mode, friends: [...new Set(friends)] };
}

/** The friend picked or not: the new list (order kept, no duplicates). */
export function togglePicked(s: PositionSharing, friendId: string, on: boolean): PositionSharing {
  const friends = s.friends.filter((f) => f !== friendId);
  if (on) friends.push(friendId);
  return { mode: s.mode, friends };
}

/** One line saying who sees the position now. */
export function sharingSummary(s: PositionSharing, friends: FriendRef[]): string {
  if (s.mode === 'all') return t('Wszyscy znajomi na tym samym serwerze widzą Cię na minimapie.');
  if (s.mode === 'some') {
    const names = friends.filter((f) => s.friends.includes(f.id)).map((f) => f.name);
    return names.length ? t('Widzą Cię na minimapie: {0}.', names.join(', ')) : t('Nikt nie jest wybrany: nikt Cię nie widzi.');
  }
  return t('Twoja pozycja nie jest wysyłana nikomu.');
}

export interface PositionSharingDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

/**
 * The section: a choice of off / all friends / picked friends, and with "picked" a checkbox per
 * friend. Loaded when the account window opens; an older server without it leaves it empty.
 */
export function createPositionSharing(deps: PositionSharingDeps, friends: () => FriendRef[]) {
  const box = el('div', { className: 'fr-positions' });
  let state: PositionSharing | undefined;

  async function load() {
    try {
      state = cleanSharing(await deps.api.socialApi('GET', '/v1/me/position-sharing'));
    } catch {
      state = undefined;
    }
    draw();
  }

  async function save(next: PositionSharing) {
    const before = state;
    state = next;
    draw();
    try {
      state = cleanSharing(await deps.api.socialApi('POST', '/v1/me/position-sharing', next));
    } catch (err) {
      state = before;
      deps.toast(deps.errorText(err), true);
    }
    draw();
  }

  function draw() {
    if (!state) {
      box.replaceChildren();
      return;
    }
    const s = state;
    const select = control<HTMLSelectElement>('select', { className: 'fr-positions-mode' });
    for (const [value, label] of [['off', t('Nikomu (wyłączone)')], ['all', t('Wszystkim znajomym')], ['some', t('Wybranym znajomym')]] as const) {
      select.append(control<HTMLOptionElement>('option', { value, textContent: label, selected: s.mode === value }));
    }
    select.addEventListener('change', () => void save({ mode: select.value as ShareMode, friends: s.friends }));
    const rows: Node[] = [];
    if (s.mode === 'some') {
      const list = friends();
      if (!list.length) rows.push(el('small', { className: 'muted', textContent: t('Nie masz jeszcze znajomych.') }));
      for (const f of list) {
        const check = control<HTMLInputElement>('input', { type: 'checkbox', checked: s.friends.includes(f.id) });
        check.addEventListener('change', () => void save(togglePicked(s, f.id, check.checked)));
        rows.push(el('label', { className: 'check fr-positions-friend' }, check, ` ${f.name}`));
      }
    }
    box.replaceChildren(
      el('label', { className: 'fr-positions-row' }, el('span', { textContent: t('Pokazuj moją pozycję na minimapie znajomych:') }), select),
      el('div', { className: 'fr-positions-friends' }, ...rows),
      el('small', { className: 'muted', textContent: sharingSummary(s, friends()) }),
      el('small', { className: 'muted', textContent: t('Tylko gdy gracie na tym samym serwerze i w tym samym wymiarze. Pozycja nie jest nigdzie zapisywana.') }));
  }

  return { element: box, load };
}
