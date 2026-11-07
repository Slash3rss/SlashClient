import { SkinViewer } from 'skinview3d';
import { getLang, locale, t } from '../shared/i18n';
import { el, icon, modalWindow } from './dialog';

/**
 * A player's public profile in the launcher ("Pokaż profil", "Mój profil" in Friends): what the site shows
 * at /u/<handle>, from the same answer (GET /v1/profiles/<handle>, server/src/profiles.ts), so the server's
 * privacy rules hold here too. The figure wears the player's skin and SlashClient cape; "Otwórz w
 * przeglądarce" leads to the site's page with everything else (streams, admin tools).
 */

interface Achievement { id: string; group: string; icon?: string; name: string; nameEn?: string; description: string; descriptionEn?: string; unlockedAt: number | null; progress?: number }
interface Rank { id: string; name: string; nameEn?: string; color?: string }
export interface PublicProfile {
  handle: string; name: string; avatar?: string; skin?: string; memberSince?: number; url: string; viewer?: string;
  ranks?: Rank[];
  supporter?: { active?: boolean; name?: string; nameEn?: string; color?: string; since?: number };
  stats?: { hours: number; streak: number; bestStreak: number; daysPlayed: number; servers: number; sparks?: number };
  achievements?: { unlocked: number; total: number; list: Achievement[] };
  friends?: number;
  cosmetics?: Record<string, string>;
  cosmeticNames?: Record<string, string>;
  clan?: { tag: string; name: string; role?: string; logo?: string };
  communities?: { name: string; tag?: string; slug: string; members?: number }[];
  minecraft?: string[];
  servers?: { address: string; since: number }[];
  lastOnline?: { online: boolean; at: number };
  privacy?: { visibility: string };
}

interface Deps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** The cosmetics' slots: [slot, Polish name, icon], in the launcher's order. */
  slots: [string, string, string][];
}

const GROUP_ICONS: Record<string, string> = { time: 'fa-clock', streak: 'fa-fire', social: 'fa-user-group', friends: 'fa-user-group', servers: 'fa-server', cosmetics: 'fa-wand-magic-sparkles' };
/** How many achievements the window lists before "Pokaż wszystkie". */
const ACHIEVEMENTS_SHOWN = 12;

const en = () => getLang() === 'en';
const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const number = (n: number) => n.toLocaleString(locale());

/** A picture of the profile: an address on SlashClient's server goes through the launcher (signed in), others as they are. */
async function picture(deps: Deps, src: string | undefined): Promise<string | undefined> {
  if (!src) return undefined;
  if (/^https:\/\//.test(src)) return src;
  if (!src.startsWith('/v1/')) return undefined;
  return deps.api.socialProfileAsset(src).catch(() => undefined);
}

function stat(name: string, value: string, label: string) {
  return el('div', { className: 'pv-stat' }, icon(name), el('b', { textContent: value }), el('span', { className: 'muted', textContent: label }));
}

function chip(content: (Node | string)[], title = '', color?: string) {
  const c = el('span', { className: 'pv-chip', title }, ...content);
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) c.style.setProperty('--chip', color);
  return c;
}

async function figure(deps: Deps, box: HTMLElement, p: PublicProfile) {
  const skin = await picture(deps, p.skin);
  if (!skin) {
    box.classList.add('hidden');
    return;
  }
  const canvas = document.createElement('canvas');
  box.append(canvas);
  const viewer = new SkinViewer({ canvas, width: 200, height: 270 });
  viewer.controls.enableZoom = false;
  viewer.autoRotate = !document.documentElement.classList.contains('reduce-motion');
  viewer.autoRotateSpeed = 0.6;
  await viewer.loadSkin(skin, { model: 'auto-detect' }).catch(() => undefined);
  // the SlashClient cape they wear, from the launcher's own pictures
  const cape = p.cosmetics?.cape;
  if (cape && /^[\w-]{1,40}$/.test(cape)) await viewer.loadCape(`img/capes/${cape}.png`, { backEquipment: 'cape' }).catch(() => undefined);
  // the window closed: the 3D view goes with it
  const watch = new MutationObserver(() => {
    if (!canvas.isConnected) {
      watch.disconnect();
      viewer.dispose();
    }
  });
  watch.observe(document.body, { childList: true });
}

function achievements(p: PublicProfile): HTMLElement | undefined {
  const list = [...(p.achievements?.list ?? [])].sort((a, b) => (b.unlockedAt ? 1 : 0) - (a.unlockedAt ? 1 : 0) || (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0));
  if (!list.length) return undefined;
  const item = (a: Achievement) => {
    const done = !!a.unlockedAt;
    const name = en() ? a.nameEn || a.name : a.name;
    const desc = en() ? a.descriptionEn || a.description : a.description;
    const ic = done ? (/^fa-[a-z0-9-]+$/.test(a.icon ?? '') ? a.icon! : GROUP_ICONS[a.group] ?? 'fa-trophy') : 'fa-lock';
    const bar = !done && a.progress !== undefined ? el('div', { className: 'pv-progress' }, el('i')) : '';
    if (bar) (bar.firstChild as HTMLElement).style.width = `${Math.round(Math.min(1, Math.max(0, a.progress!)) * 100)}%`;
    return el('div', { className: `pv-ach${done ? ' done' : ''}`, title: desc },
      el('span', { className: 'pv-ach-icon' }, icon(ic)),
      el('div', { className: 'pv-ach-text' }, el('b', { textContent: name }), el('small', { className: 'muted', textContent: done ? day(a.unlockedAt!) : desc }), bar));
  };
  const grid = el('div', { className: 'pv-achs' }, ...list.slice(0, ACHIEVEMENTS_SHOWN).map(item));
  const section = el('section', { className: 'pv-section' }, el('h3', {}, icon('fa-medal'), ` ${t('Osiągnięcia')} `, el('span', { className: 'muted', textContent: `${p.achievements!.unlocked}/${p.achievements!.total}` })), grid);
  if (list.length > ACHIEVEMENTS_SHOWN) {
    const more = el('button', { type: 'button', className: 'pv-more' }, t('Pokaż wszystkie ({0})', list.length));
    more.addEventListener('click', () => {
      grid.replaceChildren(...list.map(item));
      more.remove();
    });
    section.append(more);
  }
  return section;
}

/** The profile's body: the head with the figure, the numbers, then what the player shows. */
export function profileBody(deps: Deps, p: PublicProfile): HTMLElement {
  const chips: HTMLElement[] = [];
  for (const r of p.ranks ?? []) chips.push(chip([icon('fa-star'), ` ${en() ? r.nameEn || r.name : r.name}`], t('Ranga'), r.color));
  const sup = p.supporter;
  if (sup) chips.push(chip([icon('fa-heart'), ` ${sup.active ? (en() ? sup.nameEn || sup.name : sup.name) ?? '' : t('Wspierał(a)')}`], t('Wspiera SlashClient od {0}', day(sup.since)), sup.active ? sup.color : undefined));
  if (p.clan) {
    const logo = el('img', { className: 'pv-logo', alt: '' });
    void picture(deps, p.clan.logo).then((src) => (src ? (logo.src = src) : logo.replaceWith(icon('fa-people-group'))));
    chips.push(chip([logo, ` [${p.clan.tag}] ${p.clan.name}`], t('Klan')));
  }
  for (const c of p.communities ?? []) chips.push(chip([icon('fa-users'), ` ${c.tag ? `#${c.tag} ` : ''}${c.name}`], t('Społeczność')));
  for (const name of p.minecraft ?? []) chips.push(chip([icon('fa-cube'), ` ${name}`], t('Konto Minecraft')));

  const facts: HTMLElement[] = [];
  if (p.memberSince) facts.push(el('span', {}, icon('fa-calendar'), ` ${t('W SlashClient od {0}', day(p.memberSince))}`));
  if (p.lastOnline) facts.push(p.lastOnline.online
    ? el('span', { className: 'pv-online' }, icon('fa-circle'), ` ${t('Teraz online')}`)
    : el('span', {}, icon('fa-clock'), ` ${t('Ostatnio online: {0}', day(p.lastOnline.at))}`));
  if (p.privacy && p.privacy.visibility !== 'public') facts.push(el('span', {}, icon('fa-lock'), ` ${p.privacy.visibility === 'private' ? t('Profil prywatny: inni go nie widzą.') : t('Profil widzą tylko znajomi.')}`));

  const avatar = el('img', { className: 'pv-avatar', alt: '' });
  void picture(deps, p.avatar).then((src) => (src ? (avatar.src = src) : avatar.replaceWith(el('span', { className: 'pv-avatar pv-letter', textContent: p.name.slice(0, 1).toUpperCase() }))));
  const figureBox = el('div', { className: 'pv-figure' });
  const head = el('div', { className: 'pv-head' }, figureBox,
    el('div', { className: 'pv-who' },
      el('div', { className: 'pv-name' }, avatar, el('div', {}, el('h2', { textContent: p.name }), el('span', { className: 'muted', textContent: `@${p.handle}` }))),
      chips.length ? el('div', { className: 'pv-chips' }, ...chips) : '',
      facts.length ? el('div', { className: 'pv-facts muted' }, ...facts) : ''));

  const tiles: HTMLElement[] = [];
  if (p.stats) {
    tiles.push(stat('fa-clock', number(p.stats.hours), t('godzin gry')));
    tiles.push(stat('fa-fire', String(p.stats.streak), t('dni z rzędu teraz')));
    tiles.push(stat('fa-trophy', String(p.stats.bestStreak), t('najdłuższa seria')));
    tiles.push(stat('fa-calendar-check', String(p.stats.daysPlayed), t('dni gry')));
    tiles.push(stat('fa-server', String(p.stats.servers), t('serwerów')));
    if (p.stats.sparks !== undefined) tiles.push(stat('fa-bolt', number(p.stats.sparks), t('Iskry')));
  }
  if (p.friends !== undefined) tiles.push(stat('fa-user-group', String(p.friends), t('znajomych')));

  const sections: (HTMLElement | undefined)[] = [head, tiles.length ? el('div', { className: 'pv-stats' }, ...tiles) : undefined, achievements(p)];
  const worn = deps.slots.filter(([slot]) => p.cosmetics?.[slot]);
  if (worn.length) sections.push(el('section', { className: 'pv-section' }, el('h3', {}, icon('fa-wand-magic-sparkles'), ` ${t('Kosmetyki')}`),
    el('div', { className: 'pv-cosmetics' }, ...worn.map(([slot, name, ic]) => {
      const id = p.cosmetics![slot];
      return el('div', { className: 'pv-cosmetic' }, icon(ic), el('div', {}, el('b', { textContent: p.cosmeticNames?.[id] ?? id }), el('small', { className: 'muted', textContent: t(name) })));
    }))));
  if (p.servers?.length) sections.push(el('section', { className: 'pv-section' }, el('h3', {}, icon('fa-server'), ` ${t('Serwery')}`),
    el('div', { className: 'pv-servers' }, ...p.servers.map((s) => el('div', { className: 'pv-server' }, el('b', { textContent: s.address }), el('small', { className: 'muted', textContent: t('od {0}', day(s.since)) }))))));
  if (sections.filter(Boolean).length === 1) sections.push(el('p', { className: 'muted', textContent: t('Gracz nie pokazuje nic więcej na swoim profilu.') }));
  void figure(deps, figureBox, p);
  return el('div', { className: 'pv-profile' }, ...sections.filter((s): s is HTMLElement => !!s));
}

/** Opens a player's profile in a window of the launcher. */
export async function openPlayerProfile(deps: Deps, handle: string) {
  let p: PublicProfile;
  try {
    p = (await deps.api.socialProfile(handle)).profile;
  } catch (err) {
    // hidden, private or not there: the server says which ("not_found", "private"…); an older server has no profiles
    deps.toast(deps.errorText(err), true);
    return;
  }
  const browser = el('button', { type: 'button' }, icon('fa-arrow-up-right-from-square'), ` ${t('Otwórz w przeglądarce')}`);
  browser.addEventListener('click', () => void deps.api.socialProfileUrl(p.handle, true).catch((err: unknown) => deps.toast(deps.errorText(err), true)));
  const copy = el('button', { type: 'button' }, icon('fa-copy'), ` ${t('Kopiuj link')}`);
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(await deps.api.socialProfileUrl(p.handle, false));
      deps.toast(t('Skopiowano link do profilu.'));
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    }
  });
  modalWindow(t('Profil gracza'), [profileBody(deps, p)], [copy, browser], undefined, 'pv-modal');
}
