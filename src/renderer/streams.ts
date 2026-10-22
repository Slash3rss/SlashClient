import { t } from '../shared/i18n';
import { ask, control, el, icon } from './dialog';

/**
 * "Streamy" in Friends (server 0.9.24+, server/src/streams): a friend live on Twitch or Kick gets
 * a red LIVE badge on the list and in the chat's header, one notification when the stream starts
 * (the server decides who gets it: not muted friends, not players who turned it off, not a stream
 * that restarted a moment ago), and the account window links one's own channels.
 */

export type Platform = 'twitch' | 'kick';
export interface FriendStream { platform: Platform; login: string; name: string; url: string; title: string; category: string; viewers: number; startedAt: number }
interface Account { platform: Platform; login: string; name: string; url: string; live: boolean }
interface MyStreams { enabled: boolean; platforms: Platform[]; accounts: Account[]; prefs: { hide: boolean; notify: boolean } }

export const PLATFORM_NAMES: Record<Platform, string> = { twitch: 'Twitch', kick: 'Kick' };
const CHANNEL = /^https:\/\/(www\.twitch\.tv|kick\.com)\/[\w-]{1,40}$/;

/** A stream from the server as the launcher keeps it; anything odd (or a link elsewhere) is dropped. */
export function cleanStream(raw: unknown): FriendStream | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  if ((s.platform !== 'twitch' && s.platform !== 'kick') || typeof s.url !== 'string' || !CHANNEL.test(s.url)) return undefined;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
  return {
    platform: s.platform, login: text(s.login, 40), name: text(s.name, 40) || text(s.login, 40), url: s.url,
    title: text(s.title, 140), category: text(s.category, 80), viewers: Math.max(0, Math.floor(Number(s.viewers) || 0)), startedAt: Number(s.startedAt) || 0,
  };
}

/** "LIVE na Twitch · Budujemy zamek" for the status line under a friend's name. */
export function streamLine(s: FriendStream): string {
  return s.title ? t('LIVE na {0} · {1}', PLATFORM_NAMES[s.platform], s.title) : t('LIVE na {0}', PLATFORM_NAMES[s.platform]);
}

/** The notification's text: "Ala nadaje na żywo na Twitch: Budujemy zamek". */
export function noticeText(name: string, s: FriendStream): string {
  return s.title ? t('{0} nadaje na żywo na {1}: {2}', name, PLATFORM_NAMES[s.platform], s.title) : t('{0} nadaje na żywo na {1}', name, PLATFORM_NAMES[s.platform]);
}

/** The platform's mark: Twitch's icon, Kick's green "K". */
export function platformMark(p: Platform): HTMLElement {
  return p === 'kick' ? el('span', { className: 'kick-mark', textContent: 'K' }) : el('i', { className: 'fa-brands fa-twitch twitch-mark' });
}

/** The red pill by a friend's name (a dot and LIVE, with the platform's mark). */
export function liveBadge(s: FriendStream): HTMLElement {
  const viewers = s.viewers ? ` · ${t('{0} widzów', s.viewers)}` : '';
  return el('span', { className: 'live-badge', title: `${PLATFORM_NAMES[s.platform]}${s.title ? `: ${s.title}` : ''}${viewers}` }, el('i', { className: 'live-dot' }), 'LIVE', platformMark(s.platform));
}

export interface StreamsDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

/**
 * The account window's "Streamy": link or unlink one's Twitch and Kick channels, hide being live
 * from friends, and be told when friends go live (on the account: every launcher and game follows).
 * Loaded once per window; `refresh` draws it again after a change elsewhere (the server's 'streams').
 */
export function createStreamsSection(deps: StreamsDeps) {
  const box = el('div', { className: 'fr-streams feature-streams' });
  let state: MyStreams | undefined;
  let busy = false;

  async function load() {
    try {
      state = await deps.api.socialApi('GET', '/v1/me/streams');
    } catch {
      // an older server without streams, or the feature switched off: the section stays empty
      state = undefined;
    }
    draw();
  }

  async function link(p: Platform) {
    busy = true;
    draw();
    try {
      state = await deps.api.socialLinkStream(p);
      deps.toast(t('Połączono kanał {0}.', PLATFORM_NAMES[p]));
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      busy = false;
      draw();
    }
  }

  async function unlink(a: Account) {
    if (!(await ask(t('Odłączyć kanał {0} {1}? Znajomi przestaną widzieć, że nadajesz.', PLATFORM_NAMES[a.platform], a.login), t('Odłącz'), { danger: true, okIcon: 'fa-link-slash' }))) return;
    try {
      state = await deps.api.socialApi('DELETE', `/v1/me/streams/${a.platform}`);
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    }
    draw();
  }

  async function pref(key: 'hide' | 'notify', value: boolean) {
    try {
      state = await deps.api.socialApi('POST', '/v1/me/streams/prefs', { [key]: value });
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    }
    draw();
  }

  function draw() {
    if (!state) return box.replaceChildren();
    const s = state;
    const chips: Node[] = [];
    for (const p of ['twitch', 'kick'] as Platform[]) {
      const a = s.accounts.find((x) => x.platform === p);
      if (a) {
        const chip = el('button', { type: 'button', className: `fr-chip on stream-${p}`, title: t('Połączone: {0} ({1}). Kliknij, żeby odłączyć.', PLATFORM_NAMES[p], a.login) }, platformMark(p), a.name, a.live ? el('span', { className: 'live-badge small' }, 'LIVE') : '');
        chip.addEventListener('click', () => unlink(a));
        chips.push(chip);
      } else if (s.platforms.includes(p)) {
        const chip = el('button', { type: 'button', className: `fr-chip stream-${p}`, title: t('Połącz kanał {0}', PLATFORM_NAMES[p]), disabled: busy }, platformMark(p), icon('fa-plus'), t(' Połącz {0}', PLATFORM_NAMES[p]));
        chip.addEventListener('click', () => link(p));
        chips.push(chip);
      }
    }
    const check = (key: 'hide' | 'notify', label: string) => {
      const input = control<HTMLInputElement>('input', { type: 'checkbox', checked: s.prefs[key] });
      input.addEventListener('change', () => pref(key, input.checked));
      return el('label', { className: 'check fr-share' }, input, label);
    };
    box.replaceChildren(
      el('div', { className: 'fr-linked-row' }, el('small', { className: 'muted', textContent: t('Streamy:') }),
        chips.length ? el('div', { className: 'fr-linked' }, ...chips) : el('small', { className: 'muted', textContent: t('Łączenie kanałów nie jest jeszcze włączone na serwerze.') })),
      check('notify', t(' Powiadamiaj, gdy znajomi zaczynają streamować')),
      check('hide', t(' Ukryj przed znajomymi, że streamuję')));
  }

  return { element: box, load, refresh: () => (state ? load() : undefined) };
}
