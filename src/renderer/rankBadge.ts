/**
 * A rank's badge next to a nick (the server's ranks.ts): the Slash logo in the rank's colour, as
 * the game draws it, or the rank's own icon (fetched through the main process, kept by address).
 */

export interface RankView { id: string; name: string; nameEn?: string; color: string; icon?: string }

type Fetch = (path: string) => Promise<string>;
const icons = new Map<string, string | null>();

/** Only '#rrggbb' goes into the style. */
export const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#ffffff');

/** The rank's name in the launcher's language. */
export const rankName = (r: RankView, english: boolean) => (english ? r.nameEn || r.name : r.name);

/**
 * The badge as an element; `ready` is called once a custom icon that was still loading is here
 * (draw again then). Without the fetch (an older main process) the logo in the colour stays.
 */
export function rankBadge(r: RankView, fetch: Fetch | undefined, ready: () => void, title = ''): HTMLElement {
  const src = r.icon && fetch ? iconUrl(fetch, r.icon, ready) : undefined;
  if (src) {
    const img = document.createElement('img');
    img.className = 'rank-icon';
    img.src = src;
    img.alt = '';
    img.title = title;
    return img;
  }
  const logo = document.createElement('span');
  logo.className = 'rank-logo';
  logo.title = title;
  logo.style.setProperty('--rank', safeColor(r.color));
  return logo;
}

function iconUrl(fetch: Fetch, path: string, ready: () => void): string | undefined {
  const known = icons.get(path);
  if (known !== undefined) return known ?? undefined;
  icons.set(path, null);
  fetch(path).then((url) => {
    icons.set(path, url);
    ready();
  }, () => setTimeout(() => icons.delete(path), 60_000));
  return undefined;
}

/** The choices for "the badge next to my nick": the default (the most important rank), each rank held, none. */
export function badgeChoices(ranks: RankView[], english: boolean, t: (s: string, ...a: (string | number)[]) => string): { value: string; label: string }[] {
  if (!ranks.length) return [];
  return [
    { value: '', label: t('Najważniejsza ranga ({0})', rankName(ranks[0], english)) },
    ...ranks.map((r) => ({ value: r.id, label: rankName(r, english) })),
    { value: 'none', label: t('Bez odznaki rangi') },
  ];
}
