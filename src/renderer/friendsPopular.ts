import { t } from '../shared/i18n';
import { control, el, icon } from './dialog';
import { cleanSharing, togglePicked, type PositionSharing, type ShareMode } from './positionSharing';

/**
 * "Popularne wśród znajomych" (server/src/friendsPopular.ts): mods, resource packs, shaders and
 * servers the player's friends use, on Mody / Odkrywaj and on Serwery, each card with how many
 * friends and, on hover, which. The server counts only friends who share it with this player
 * ("Pokazuj znajomym, czego używam" in the account window, below) and never gives anyone's list.
 * An older server without it, the admin's switch off, or no account: the sections are not shown.
 */

export type Source = 'modrinth' | 'curseforge';
export interface FriendRef { id: string; handle: string; name: string; avatar?: string }
export interface PopularContent { source: Source; id: string; type: string; count: number; friends: FriendRef[] }
export interface PopularServer { address: string; name?: string; count: number; friends: FriendRef[] }
export interface Popular { content: PopularContent[]; servers: PopularServer[] }

const ID = /^[\w-]{1,64}$/;

function cleanFriends(raw: unknown): FriendRef[] {
  return (Array.isArray(raw) ? raw : []).flatMap((f) => {
    const r = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.name !== 'string') return [];
    return [{ id: r.id, handle: typeof r.handle === 'string' ? r.handle : r.name, name: r.name, avatar: typeof r.avatar === 'string' ? r.avatar : undefined }];
  });
}

const count = (v: unknown, friends: FriendRef[]) => (typeof v === 'number' && Number.isFinite(v) && v >= friends.length ? Math.floor(v) : friends.length);

/** The server's answer as the page uses it; undefined when the feature is off (or the answer is odd). */
export function cleanPopular(raw: unknown): Popular | undefined {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (r.enabled !== true) return undefined;
  const content = (Array.isArray(r.content) ? r.content : []).flatMap((c): PopularContent[] => {
    const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    if ((x.source !== 'modrinth' && x.source !== 'curseforge') || typeof x.id !== 'string' || !/^[A-Za-z0-9]{1,16}$/.test(x.id) || typeof x.type !== 'string') return [];
    const friends = cleanFriends(x.friends);
    return [{ source: x.source, id: x.id, type: x.type, count: count(x.count, friends), friends }];
  });
  const servers = (Array.isArray(r.servers) ? r.servers : []).flatMap((s): PopularServer[] => {
    const x = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    if (typeof x.address !== 'string' || !/^[\w.-]{1,253}(:\d{1,5})?$/.test(x.address)) return [];
    const friends = cleanFriends(x.friends);
    return [{ address: x.address, name: typeof x.name === 'string' && x.name ? x.name : undefined, count: count(x.count, friends), friends }];
  });
  return { content, servers };
}

/** One server however it was typed, as the server keys it ("Mc.Example.com:25565" is "mc.example.com"). */
export const serverKey = (address: string) => address.trim().toLowerCase().replace(/:25565$/, '').replace(/\.+(?=:\d+$|$)/, '');

/** "używa 4 znajomych" / "gra 3 znajomych". */
export function friendsCountText(kind: 'content' | 'server', n: number): string {
  if (kind === 'server') return n === 1 ? t('gra {0} znajomy', n) : t('gra {0} znajomych', n);
  return n === 1 ? t('używa {0} znajomy', n) : t('używa {0} znajomych', n);
}

/** Who, for the hover: the nicks the server gave and how many more. */
export function friendsWho(item: { count: number; friends: FriendRef[] }): string {
  const names = item.friends.map((f) => f.name).join(', ');
  const rest = item.count - item.friends.length;
  return rest > 0 ? t('{0} i {1} innych', names, rest) : names;
}

/** The tag on a card: the count, with the friends' nicks on hover. */
export function friendsBadge(kind: 'content' | 'server', item: { count: number; friends: FriendRef[] }): HTMLElement {
  const badge = el('span', { className: 'friends-used', tabIndex: 0 }, icon('fa-user-group'), ` ${friendsCountText(kind, item.count)}`);
  // the nicks in our own bubble on hover or focus (a title would wait a second and look like the system's)
  badge.dataset.who = friendsWho(item);
  badge.setAttribute('aria-label', `${friendsCountText(kind, item.count)}: ${badge.dataset.who}`);
  return badge;
}

export interface PopularDeps { api: any }

/**
 * The answer, kept for a couple of minutes per loader (the server caches it too). `get` gives
 * undefined when there is nothing to show: no account, an older server, the switch off.
 */
export function createPopularSource(deps: PopularDeps, freshMs = 2 * 60_000) {
  const kept = new Map<string, { at: number; value: Promise<Popular | undefined> }>();
  /** The site's details of the projects (title, icon, author), by site and ids. */
  const projects = new Map<string, Promise<any[]>>();

  function get(loader = ''): Promise<Popular | undefined> {
    const k = loader === 'vanilla' ? '' : loader;
    const hit = kept.get(k);
    if (hit && Date.now() - hit.at < freshMs) return hit.value;
    const value = Promise.resolve()
      .then(() => deps.api.socialApi('GET', `/v1/friends/popular${k ? `?loader=${encodeURIComponent(k)}` : ''}`))
      .then(cleanPopular, () => undefined);
    kept.set(k, { at: Date.now(), value });
    return value;
  }

  function hits(source: Source, ids: string[]): Promise<any[]> {
    const k = `${source}|${ids.join(',')}`;
    if (!projects.has(k)) {
      projects.set(k, Promise.resolve().then(() => deps.api.popularProjects(source, ids)).then((r) => (Array.isArray(r) ? r : []), () => {
        projects.delete(k);
        return [];
      }));
    }
    return projects.get(k)!;
  }

  return { get, hits, clear: () => kept.clear() };
}

/** The account window's choice: who of the friends counts what I use. */
export function popularSharingSummary(s: PositionSharing, friends: { id: string; name: string }[]): string {
  if (s.mode === 'all') return t('Wszyscy znajomi widzą, jakich modów, paczek, shaderów i serwerów używasz.');
  if (s.mode === 'some') {
    const names = friends.filter((f) => s.friends.includes(f.id)).map((f) => f.name);
    return names.length ? t('Widzą, czego używasz: {0}.', names.join(', ')) : t('Nikt nie jest wybrany: nikt nie widzi, czego używasz.');
  }
  return t('Nie wysyłasz znajomym, czego używasz.');
}

export interface PopularSharingDeps extends PopularDeps {
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

/**
 * "Pokazuj znajomym, czego używam" in the account window: all friends, picked ones, or nobody, as
 * the minimap position's choice looks. Hidden with an older server or with the admin's switch off.
 */
export function createPopularSharing(deps: PopularSharingDeps, friends: () => { id: string; name: string }[], changed: () => void = () => {}) {
  const box = el('div', { className: 'fr-positions fr-popular-sharing' });
  let state: PositionSharing | undefined;

  const read = (raw: unknown) => ((raw as { enabled?: unknown } | undefined)?.enabled === false ? undefined : cleanSharing(raw));

  async function load() {
    try {
      state = read(await deps.api.socialApi('GET', '/v1/me/popular-sharing'));
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
      state = read(await deps.api.socialApi('POST', '/v1/me/popular-sharing', next));
      changed();
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
    for (const [value, label] of [['off', t('Nikomu')], ['all', t('Wszystkim znajomym')], ['some', t('Wybranym znajomym')]] as const) {
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
      el('label', { className: 'fr-positions-row' }, el('span', { textContent: t('Pokazuj znajomym, czego używam:') }), select),
      el('div', { className: 'fr-positions-friends' }, ...rows),
      el('small', { className: 'muted', textContent: popularSharingSummary(s, friends()) }),
      el('small', { className: 'muted', textContent: t('Tylko mody, paczki zasobów i shadery rozpoznane na Modrinth i CurseForge (bez nazw plików i bez plików dodanych ręcznie) oraz serwery z ostatnich 30 dni. Nikt nie dostaje całej Twojej listy: przy modzie czy serwerze znajomi widzą, ilu z nich go używa i kto.') }));
  }

  return { element: box, load };
}
