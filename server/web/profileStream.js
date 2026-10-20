// The profile's "Stream" section (streams/streams.ts): the live stream with the platform's player,
// its title, category and viewers, or links to the player's channels when nobody is live. Only the
// Twitch and Kick players may be framed (the profile page's CSP, frame-src), nothing else.
import { el, icon } from './common.js';

const PLATFORMS = { twitch: ['Twitch', 'fa-brands fa-twitch'], kick: ['Kick', ''] };
const PLAYERS = /^https:\/\/(player\.twitch\.tv\/\?|player\.kick\.com\/)/;
const CHANNELS = /^https:\/\/(www\.twitch\.tv|kick\.com)\/[\w-]+$/;

/** The platform's mark: Twitch's icon, Kick's green "K" (Font Awesome has no Kick). */
export function platformIcon(platform) {
  return platform === 'kick' ? el('span', { class: 'kick-mark', ariaHidden: 'true', textContent: 'K' }) : icon(PLATFORMS[platform]?.[1] ?? 'fa-solid fa-video');
}

export function streamSection(s, L, locale) {
  if (!s || (!s.live?.length && !s.channels?.length)) return [];
  const name = (p) => PLATFORMS[p]?.[0] ?? p;
  const live = (s.live ?? []).filter((x) => PLAYERS.test(x.embed ?? '') && CHANNELS.test(x.url ?? ''));
  if (live.length) {
    return live.map((x) => {
      const frame = el('iframe', {
        class: 'stream-player', src: x.embed, title: `${name(x.platform)}: ${x.title || x.name}`, loading: 'lazy',
        // Twitch checks the embedding site (parent=…): the origin only, never the profile's address
        referrerPolicy: 'strict-origin', allow: 'autoplay; fullscreen', allowFullscreen: true,
      });
      const since = x.startedAt ? new Date(x.startedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';
      return el('div', { class: 'glass card profile-stream' },
        el('div', { class: 'row profile-stream-head' },
          el('span', { class: 'live-pill' }, el('i', { class: 'live-dot' }), 'LIVE'),
          el('h3', { class: 'grow' }, platformIcon(x.platform), ` ${L('Stream', 'Stream')}`),
          el('a', { class: 'btn', href: x.url, target: '_blank', rel: 'noopener noreferrer' }, icon('fa-solid fa-arrow-up-right-from-square'), ` ${L(`Oglądaj na ${name(x.platform)}`, `Watch on ${name(x.platform)}`)}`)),
        el('div', { class: 'stream-frame' }, frame),
        el('div', { class: 'profile-stream-info' },
          el('b', { textContent: x.title || L('Na żywo', 'Live now') }),
          el('div', { class: 'muted small' }, ...[
            x.category ? [icon('fa-solid fa-gamepad'), ` ${x.category}`] : [],
            [icon('fa-solid fa-eye'), ` ${Number(x.viewers || 0).toLocaleString(locale)} ${L('widzów', 'viewers')}`],
            since ? [icon('fa-regular fa-clock'), ` ${L(`od ${since}`, `since ${since}`)}`] : [],
          ].filter((p) => p.length).flatMap((p, i) => (i ? [' · ', ...p] : p)))));
    });
  }
  return [el('div', { class: 'glass card profile-channels' }, el('h3', {}, icon('fa-solid fa-video'), L(' Streamy', ' Streams')),
    el('div', { class: 'row' }, ...s.channels.filter((c) => CHANNELS.test(c.url ?? '')).map((c) =>
      el('a', { class: `chip link stream-chip ${c.platform}`, href: c.url, target: '_blank', rel: 'noopener noreferrer', title: c.name },
        platformIcon(c.platform), ` ${L(`Kanał na ${name(c.platform)}`, `${name(c.platform)} channel`)}: ${c.login}`))))];
}
