import { getLang, locale, t } from '../shared/i18n';
import type { ModStats, SessionSummary, SummaryPlace } from '../main/sessionSummary';
import { control, el, icon, modalWindow } from './dialog';

/**
 * "Podsumowanie sesji": a card after the game closes (sessionSummary.ts in main gathers it) with
 * the session's time, where it was played, its highlights from SlashClient's mod, the screenshots
 * and clips taken, and the sparks and achievements earned meanwhile (read from the server, when
 * signed in). After a crash a short version sits under the crash's explanation. The statistics
 * page lists the last ten; Settings (and "Nie pokazuj więcej" on the card) turn the card off.
 */

export interface SessionSummaryDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  /** Opens a profile's screenshots or clips (Profiles → Worlds). */
  openGallery: (profileId: string, tab: 'screenshots' | 'clips') => void;
}

export interface Highlight { id: string; icon: string; label: string; value: string; note?: string }

const nf = (n: number, digits = 0) => n.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** "2 h 05 min", "12 min", "40 s". */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t('{0} s', s);
  const m = Math.floor(s / 60);
  if (m < 60) return t('{0} min', m);
  return t('{0} h {1} min', Math.floor(m / 60), String(m % 60).padStart(2, '0'));
}

/** Blocks as "850 m" or "12,4 km" (a block is a metre). */
export function fmtDistance(blocks: number): string {
  return blocks >= 1000 ? t('{0} km', nf(blocks / 1000, 1)) : t('{0} m', nf(Math.round(blocks)));
}

/** Health points as hearts ("12,5 ❤"). */
const hearts = (hp: number) => `${nf(hp / 2, 1)} ❤`;

export const totalDistance = (d: ModStats['distance']) => d.walk + d.sprint + d.swim + d.fly + d.elytra + d.ride;

/** The tiles of the card, from the mod's numbers; only what happened (a quiet session has few). */
export function highlights(stats: ModStats | null): Highlight[] {
  if (!stats) return [];
  const out: Highlight[] = [];
  const kills = stats.kills.players + stats.kills.mobs;
  if (kills) out.push({ id: 'kills', icon: 'fa-skull-crossbones', label: t('Zabójstwa'), value: nf(kills), note: t('gracze: {0} · moby: {1}', stats.kills.players, stats.kills.mobs) });
  if (stats.deaths || kills) out.push({ id: 'deaths', icon: 'fa-skull', label: t('Śmierci'), value: nf(stats.deaths), note: stats.longestLifeMs >= 60_000 ? t('najdłuższe życie: {0}', fmtDuration(stats.longestLifeMs)) : undefined });
  if (kills || stats.deaths) out.push({ id: 'kd', icon: 'fa-scale-balanced', label: t('K/D'), value: nf(stats.deaths ? kills / stats.deaths : kills, 2) });
  if (stats.damage.dealt || stats.damage.taken) out.push({ id: 'damage', icon: 'fa-burst', label: t('Zadane obrażenia'), value: hearts(stats.damage.dealt), note: t('otrzymane: {0}', hearts(stats.damage.taken)) });
  if (stats.blocks.mined || stats.blocks.placed) out.push({ id: 'blocks', icon: 'fa-cube', label: t('Bloki'), value: nf(stats.blocks.mined + stats.blocks.placed), note: t('wykopane: {0} · postawione: {1}', nf(stats.blocks.mined), nf(stats.blocks.placed)) });
  const distance = totalDistance(stats.distance);
  if (distance >= 1) {
    const parts = ([['walk', 'pieszo'], ['sprint', 'biegiem'], ['swim', 'wpław'], ['fly', 'w locie'], ['elytra', 'na elytrze'], ['ride', 'wierzchem']] as const)
      .filter(([k]) => stats.distance[k] >= 1).sort((a, b) => stats.distance[b[0]] - stats.distance[a[0]]).slice(0, 2)
      .map(([k, name]) => `${t(name)} ${fmtDistance(stats.distance[k])}`);
    out.push({ id: 'distance', icon: 'fa-shoe-prints', label: t('Dystans'), value: fmtDistance(distance), note: parts.join(' · ') });
  }
  if (stats.messages) out.push({ id: 'messages', icon: 'fa-comment', label: t('Wiadomości'), value: nf(stats.messages) });
  if (stats.fps.frames >= 100 && stats.fps.avg) out.push({ id: 'fps', icon: 'fa-gauge-high', label: t('Średnie FPS'), value: nf(stats.fps.avg), note: t('1% low: {0}', nf(stats.fps.low1)) });
  return out;
}

/** The places' line in the history: "skyup.pl, Nowy świat +2". */
export function placesLine(places: SummaryPlace[]): string {
  if (!places.length) return t('w menu');
  const names = places.slice(0, 2).map((p) => p.name);
  return places.length > 2 ? `${names.join(', ')} +${places.length - 2}` : names.join(', ');
}

interface LedgerEntry { amount: number; reason: string; label?: string; labelEn?: string; note?: string; at: number }
interface Unlocked { id: string; name: string; nameEn: string; sparks?: number; icon?: string; unlockedAt: number | null }

/** What the server paid and unlocked during the session (a couple of minutes after it too: unlocks come late). */
export function earnedDuring(summary: Pick<SessionSummary, 'start' | 'end'>, ledger: LedgerEntry[], achievements: Unlocked[]) {
  const within = (at: number | null | undefined) => typeof at === 'number' && at >= summary.start && at <= summary.end + 3 * 60_000;
  const entries = ledger.filter((e) => within(e.at) && e.amount > 0);
  return {
    sparks: entries.reduce((n, e) => n + e.amount, 0),
    entries,
    achievements: achievements.filter((a) => within(a.unlockedAt)).sort((a, b) => (a.unlockedAt ?? 0) - (b.unlockedAt ?? 0)),
  };
}

interface Challenge { name: string; progress: number; goal: number; done: boolean }
/** Daily and weekly challenges, if the server has them (any of the shapes it may answer with). */
export function parseChallenges(res: unknown): Challenge[] {
  const list = Array.isArray(res) ? res : Array.isArray((res as { challenges?: unknown })?.challenges) ? (res as { challenges: unknown[] }).challenges : [];
  return list.slice(0, 8).flatMap((c): Challenge[] => {
    const o = (c ?? {}) as Record<string, unknown>;
    const name = String((getLang() === 'en' ? o.nameEn ?? o.titleEn : undefined) ?? o.name ?? o.title ?? '').slice(0, 80);
    const goal = Number(o.goal ?? o.target);
    const progress = Number(o.progress ?? o.value ?? 0);
    if (!name || !Number.isFinite(goal) || goal <= 0 || !Number.isFinite(progress)) return [];
    return [{ name, goal, progress: Math.min(goal, Math.max(0, progress)), done: Boolean(o.done ?? o.completed ?? o.completedAt) || progress >= goal }];
  });
}

/** Names of servers and worlds stay as the player wrote them (the page's translator skips them). */
const raw = <T extends HTMLElement>(node: T) => {
  node.dataset.noI18n = '';
  return node;
};
const media = (file: string) => `slash-media://local/?path=${encodeURIComponent(file)}`;
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const dateOf = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

export function createSessionSummary(deps: SessionSummaryDeps) {
  const { api } = deps;
  /** Server icons from a ping, once per address. */
  const favicons = new Map<string, Promise<string | undefined>>();
  const favicon = (address: string) => {
    if (!favicons.has(address)) favicons.set(address, Promise.resolve(api.pingServer(address)).then((s: { favicon?: string }) => s?.favicon, () => undefined));
    return favicons.get(address)!;
  };

  function placeRow(p: SummaryPlace, longest: number) {
    const pic = el('span', { className: 'ss-place-icon' }, icon(p.kind === 'server' ? 'fa-server' : 'fa-earth-europe'));
    const setImage = (src: string) => pic.replaceChildren(el('img', { src, alt: '' }));
    if (p.kind === 'world' && p.icon) setImage(media(p.icon));
    if (p.kind === 'server' && p.address) void favicon(p.address).then((src) => src && setImage(src));
    const fill = el('i');
    fill.style.width = `${longest ? Math.max(3, (p.ms / longest) * 100) : 0}%`;
    return el('div', { className: 'ss-place' }, pic,
      el('div', { className: 'ss-place-main' },
        el('div', { className: 'ss-place-top' },
          raw(el('b', { textContent: p.name })),
          el('span', { className: 'muted', textContent: p.address && p.address !== p.name ? p.address : p.kind === 'world' ? t('świat') : t('serwer') }),
          el('span', { className: 'ss-place-time', textContent: p.ms ? fmtDuration(p.ms) : '' })),
        el('div', { className: 'ss-bar' }, fill)));
  }

  function tiles(list: Highlight[]) {
    return el('div', { className: 'ss-tiles' }, ...list.map((h, i) => {
      // hearts in their colour
      const value = h.value.endsWith(' ❤') ? el('b', {}, h.value.slice(0, -2), el('span', { className: 'ss-heart', textContent: ' ❤' })) : el('b', { textContent: h.value });
      const tile = el('div', { className: `ss-tile ss-${h.id}` }, el('small', {}, icon(h.icon), ` ${h.label}`), value, el('span', { textContent: h.note ?? '' }));
      tile.style.animationDelay = `${i * 35}ms`;
      return tile;
    }));
  }

  function mediaSection(s: SessionSummary) {
    if (!s.screenshotCount && !s.clipCount) return [];
    const thumbs = s.screenshots.slice(0, 6).map((m) => {
      const b = el('button', { type: 'button', className: 'ss-thumb', title: m.name }, el('img', { src: media(m.file), alt: '', loading: 'lazy' }));
      b.addEventListener('click', () => open('screenshots'));
      return b;
    });
    const open = (tab: 'screenshots' | 'clips') => {
      closeCard?.();
      deps.openGallery(s.profileId, tab);
    };
    const buttons: HTMLButtonElement[] = [];
    if (s.screenshotCount) {
      const b = el('button', { type: 'button' }, icon('fa-images'), ' ', t('Zrzuty ekranu: {0}', s.screenshotCount));
      b.addEventListener('click', () => open('screenshots'));
      buttons.push(b);
    }
    if (s.clipCount) {
      const b = el('button', { type: 'button' }, icon('fa-film'), ' ', t('Klipy: {0}', s.clipCount));
      b.addEventListener('click', () => open('clips'));
      buttons.push(b);
    }
    return [el('h3', {}, icon('fa-camera'), ' ', t('Zrzuty i klipy')), thumbs.length ? el('div', { className: 'ss-thumbs' }, ...thumbs) : '', el('div', { className: 'row ss-media-buttons' }, ...buttons)];
  }

  /** Sparks, achievements and challenges from the server: filled in when they arrive (signed in only). */
  function serverSection(s: SessionSummary) {
    const box = el('div', { className: 'ss-server hidden' });
    void (async () => {
      const state = await Promise.resolve(api.socialState()).catch(() => undefined);
      if (!state?.user) return;
      const [wallet, mine, challenges] = await Promise.all([
        Promise.resolve(api.socialApi('GET', '/v1/wallet?limit=50')).catch(() => undefined),
        Promise.resolve(api.socialApi('GET', '/v1/achievements')).catch(() => undefined),
        Promise.resolve(api.socialApi('GET', '/v1/challenges')).catch(() => undefined),
      ]);
      const earned = earnedDuring(s, wallet?.ledger ?? [], mine?.achievements ?? []);
      const active = parseChallenges(challenges);
      const parts: Node[] = [];
      if (earned.sparks || earned.achievements.length) {
        parts.push(el('h3', {}, icon('fa-trophy'), ' ', t('Iskry i osiągnięcia')));
        if (earned.sparks) parts.push(el('div', { className: 'ss-sparks' }, el('span', { className: 'spark-sign', textContent: '✦' }), el('b', { textContent: `+${nf(earned.sparks)}` }), el('span', { className: 'muted', textContent: t('iskier w tej sesji') })));
        for (const a of earned.achievements.slice(0, 5)) {
          const name = getLang() === 'en' ? a.nameEn : a.name;
          parts.push(el('div', { className: 'ss-achievement' }, icon(a.icon && /^fa-[a-z0-9-]{1,40}$/.test(a.icon) ? a.icon : 'fa-trophy'), el('span', { textContent: name }), a.sparks ? el('small', { className: 'muted', textContent: `+${a.sparks} ✦` }) : ''));
        }
      }
      if (active.length) {
        parts.push(el('h3', {}, icon('fa-flag-checkered'), ' ', t('Wyzwania')));
        for (const c of active) {
          const fill = el('i');
          fill.style.width = `${(c.progress / c.goal) * 100}%`;
          parts.push(el('div', { className: `ss-challenge${c.done ? ' done' : ''}` },
            el('div', { className: 'ss-place-top' }, el('span', { textContent: c.name }), el('span', { className: 'ss-place-time', textContent: c.done ? '✓' : `${nf(c.progress)}/${nf(c.goal)}` })),
            el('div', { className: 'ss-bar' }, fill)));
        }
      }
      if (!parts.length) return;
      box.replaceChildren(...parts);
      box.classList.remove('hidden');
    })();
    return box;
  }

  function contextLine(s: SessionSummary) {
    const c = s.context;
    if (!c) return '';
    const bits = [t('dziś łącznie {0}', fmtDuration(c.todayMs))];
    if (c.streak > 1) bits.push(t('seria: {0} dni z rzędu', c.streak));
    if (c.longestIn30Days) bits.push(t('najdłuższa sesja od 30 dni'));
    return el('p', { className: 'ss-context' }, icon('fa-fire'), ' ', bits.join(' · '));
  }

  /** The card's body (also the crash section's "more"). */
  function body(s: SessionSummary) {
    const length = s.end - s.start;
    const head = el('div', { className: 'ss-head' },
      el('div', { className: 'ss-duration' }, el('b', { textContent: fmtDuration(length) }), el('span', { className: 'muted', textContent: s.stats?.playMs ? t('w tym w grze: {0}', fmtDuration(s.stats.playMs)) : '' })),
      el('div', { className: 'ss-meta muted' },
        el('span', { textContent: `${s.profileName} · ${s.versionId}` }),
        el('span', { textContent: `${dateOf(s.start)}, ${timeOf(s.start)}–${timeOf(s.end)}` })));
    const longest = Math.max(...s.places.map((p) => p.ms), 0);
    const list = highlights(s.stats);
    const nodes: (Node | string)[] = [head, contextLine(s)];
    nodes.push(el('h3', {}, icon('fa-location-dot'), ' ', t('Gdzie grałeś')),
      s.places.length ? el('div', { className: 'ss-places' }, ...s.places.slice(0, 6).map((p) => placeRow(p, longest))) : el('p', { className: 'muted', textContent: t('Tym razem bez wchodzenia do świata ani na serwer.') }));
    if (list.length) nodes.push(el('h3', {}, icon('fa-star'), ' ', t('Najważniejsze')), tiles(list));
    else if (!s.stats) nodes.push(el('p', { className: 'muted ss-note', textContent: t('Zabójstwa, bloki, dystans i FPS liczy mod SlashClient: ta sesja była bez niego.') }));
    else if (s.places.length) nodes.push(el('p', { className: 'muted ss-note', textContent: t('Spokojna sesja: bez walki, kopania i dalekich wypraw.') }));
    if (s.stats && !s.stats.complete) nodes.push(el('p', { className: 'muted ss-note', textContent: t('Gra nie zamknęła się normalnie: liczby są z ostatniego zapisu (co minutę).') }));
    nodes.push(...mediaSection(s), serverSection(s));
    return el('div', { className: 'ss-body' }, ...nodes.filter(Boolean));
  }

  let closeCard: (() => void) | undefined;
  /** Which card is open: a card replaced by another must not bring up the waiting ones. */
  let shown = 0;
  /** Summaries of other games that closed while a card was open: each comes up once the one before is closed. */
  const waiting: SessionSummary[] = [];

  /** The card; `fromHistory` leaves out "Nie pokazuj więcej". */
  function show(s: SessionSummary, fromHistory = false) {
    const mine = ++shown;
    closeCard?.();
    const buttons: HTMLButtonElement[] = [];
    if (!fromHistory) {
      const never = el('button', { type: 'button', className: 'ss-never' }, icon('fa-eye-slash'), ' ', t('Nie pokazuj więcej'));
      never.addEventListener('click', async () => {
        await Promise.resolve(api.saveSettings({ sessionSummary: false })).catch(() => undefined);
        syncCheckbox(false);
        waiting.length = 0;
        closeCard?.();
        deps.toast(t('Podsumowanie sesji wyłączone. Włączysz je w Ustawieniach.'));
      });
      buttons.push(never);
    }
    const ok = el('button', { type: 'button', className: 'primary' }, t('Zamknij'));
    ok.addEventListener('click', () => closeCard?.());
    buttons.push(ok);
    const title = s.crashed ? t('Podsumowanie sesji (przed awarią)') : t('Podsumowanie sesji');
    closeCard = modalWindow(title, [body(s)], buttons, () => {
      if (mine !== shown) return;
      closeCard = undefined;
      const next = waiting.shift();
      if (next) show(next);
    }, 'session-summary-modal');
  }

  /** A short version under the crash's explanation. */
  function crashSection(s: SessionSummary) {
    document.querySelector('#crash .ss-crash')?.remove();
    const crash = document.querySelector('#crash');
    if (!crash) return;
    const top = highlights(s.stats).slice(0, 3).map((h) => `${h.label}: ${h.value}`);
    const more = el('button', { type: 'button' }, icon('fa-chart-simple'), ' ', t('Całe podsumowanie'));
    more.addEventListener('click', () => show(s));
    crash.append(el('div', { className: 'ss-crash' },
      el('b', {}, icon('fa-clock-rotate-left'), ' ', t('Sesja przed awarią: {0}', fmtDuration(s.end - s.start))),
      raw(el('span', { className: 'muted', textContent: [placesLine(s.places), ...top].join(' · ') })),
      more));
  }

  api.on('game:exit', () => document.querySelector('#crash .ss-crash')?.remove());
  api.on('session:summary', ({ summary, display }: { summary: SessionSummary; display: 'card' | 'crash' }) => {
    if (display === 'crash') crashSection(summary);
    // several games closed one after another: one card at a time, none closes another
    else if (closeCard) waiting.push(summary);
    else show(summary);
  });

  // Settings: the switch under "Chowaj launcher podczas gry", saved at once
  const checkbox = control<HTMLInputElement>('input', { type: 'checkbox', name: 'sessionSummary', checked: true });
  const syncCheckbox = (on: boolean) => (checkbox.checked = on);
  const label = el('label', { className: 'check' }, checkbox, ` ${t('Pokazuj podsumowanie sesji po zamknięciu gry')}`);
  const after = document.querySelector('#settings-form input[name="closeOnLaunch"]')?.closest('label');
  after?.after(label);
  checkbox.addEventListener('change', () => void Promise.resolve(api.saveSettings({ sessionSummary: checkbox.checked })).catch(() => undefined));
  api.on('store', (s: { settings?: { sessionSummary?: boolean } }) => syncCheckbox(s?.settings?.sessionSummary !== false));
  void Promise.resolve(api.getStore()).then((s: { settings?: { sessionSummary?: boolean } }) => syncCheckbox(s?.settings?.sessionSummary !== false), () => undefined);

  /** "Ostatnie sesje" at the end of the statistics page. */
  async function renderHistory(pane: Element | null) {
    if (!pane) return;
    let card = pane.querySelector<HTMLElement>('.ss-history');
    if (!card) {
      card = el('div', { className: 'card glass-panel ss-history' });
      pane.append(card);
    }
    const list: SessionSummary[] = (await Promise.resolve(api.sessionSummaries()).catch(() => [])) ?? [];
    const rows = list.map((s, i) => {
      const top = highlights(s.stats).filter((h) => ['kills', 'deaths', 'blocks', 'distance'].includes(h.id)).slice(0, 3);
      const row = el('button', { type: 'button', className: 'ss-history-row' },
        el('span', { className: 'ss-history-date' }, el('b', { textContent: dateOf(s.start) }), el('small', { className: 'muted', textContent: timeOf(s.start) })),
        el('span', { className: 'ss-history-main' },
          raw(el('b', { textContent: placesLine(s.places) })),
          el('small', { className: 'muted', textContent: [s.profileName, ...top.map((h) => `${h.label} ${h.value}`)].join(' · ') })),
        s.crashed ? el('span', { className: 'ss-history-crash', title: t('Awaria') }, icon('fa-triangle-exclamation')) : '',
        el('span', { className: 'ss-history-time', textContent: fmtDuration(s.end - s.start) }));
      row.style.animationDelay = `${i * 30}ms`;
      row.addEventListener('click', () => show(s, true));
      return row;
    });
    card.replaceChildren(el('h3', {}, icon('fa-clock-rotate-left'), ' ', t('Ostatnie sesje')),
      rows.length ? el('div', { className: 'ss-history-list' }, ...rows) : el('p', { className: 'muted', textContent: t('Po zamknięciu gry pojawi się tu jej podsumowanie.') }));
  }

  return { show, renderHistory };
}
