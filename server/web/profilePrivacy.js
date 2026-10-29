// The account page's "Profile privacy" card: who sees the public profile (/u/<handle>) and which
// parts of it. The server enforces it (profiles.ts); this only edits the settings.
import { L, api, copyText, el, english, guard, icon, toast } from './common.js';

const VISIBILITY = english() ? [
  ['public', 'Everyone', 'fa-solid fa-earth-europe', 'Anyone with the link, also without signing in.'],
  ['friends', 'Friends', 'fa-solid fa-user-group', 'Only your SlashClient friends (signed in).'],
  ['private', 'Only me', 'fa-solid fa-lock', 'Nobody but you.'],
] : [
  ['public', 'Wszyscy', 'fa-solid fa-earth-europe', 'Każdy z linkiem, także bez logowania.'],
  ['friends', 'Znajomi', 'fa-solid fa-user-group', 'Tylko Twoi znajomi z SlashClient (zalogowani).'],
  ['private', 'Tylko ja', 'fa-solid fa-lock', 'Nikt poza Tobą.'],
];
export const PRIVACY_ELEMENTS = english() ? [
  ['stats', 'Stats (hours played, streaks, days played)'],
  ['achievements', 'Achievements'],
  ['cosmetics', 'Cosmetics worn'],
  ['clan', 'Clan'],
  ['communities', 'Communities (only public ones you leave switched on in the launcher)'],
  ['minecraft', 'Minecraft accounts (nicks)'],
  ['friends', 'Number of friends'],
  ['servers', 'Servers you play on'],
  ['lastOnline', 'When you were last online'],
  ['streams', 'Streams (linked Twitch and Kick channels, the live stream)'],
] : [
  ['stats', 'Statystyki (godziny gry, serie, dni gry)'],
  ['achievements', 'Osiągnięcia'],
  ['cosmetics', 'Noszone kosmetyki'],
  ['clan', 'Klan'],
  ['communities', 'Społeczności (tylko publiczne, które zostawisz włączone w launcherze)'],
  ['minecraft', 'Konta Minecraft (nicki)'],
  ['friends', 'Liczba znajomych'],
  ['servers', 'Serwery, na których grasz'],
  ['lastOnline', 'Kiedy ostatnio byłeś online'],
  ['streams', 'Streamy (połączone kanały Twitch i Kick, transmisja na żywo)'],
];

/** The card, filled once the settings are here; empty (null) when they cannot be read. */
export async function privacyCard() {
  let state = await api('GET', '/v1/me/profile-privacy').catch(() => undefined);
  if (!state) return null;
  // "Pokazuj mnie w propozycjach znajomych" (suggestions.ts); a server without it: no switch
  let suggest = await api('GET', '/v1/me/suggestions').catch(() => undefined);
  const saveSuggest = async (visible) => {
    const next = await guard(() => api('POST', '/v1/me/suggestions', { visible }));
    if (next) {
      suggest = next;
      toast(L('Zapisano ustawienia profilu.', 'Profile settings saved.'));
    }
    draw();
  };
  const card = el('div', { class: 'glass card privacy-card', id: 'prywatnosc' });
  const save = async (change) => {
    const next = await guard(() => api('POST', '/v1/me/profile-privacy', change));
    if (!next) return draw();
    state = next;
    toast(L('Zapisano ustawienia profilu.', 'Profile settings saved.'));
    draw();
  };
  function draw() {
    const p = state.privacy;
    const link = `${location.origin}${state.url}`;
    const options = el('div', { class: 'privacy-visibility' }, ...VISIBILITY.map(([value, name, ic, hint]) => el('button', {
      type: 'button', class: p.visibility === value ? 'selected' : '', title: hint, onclick: () => p.visibility !== value && save({ visibility: value }),
    }, icon(ic), el('span', {}, el('b', { textContent: name }), el('small', { class: 'muted', textContent: hint })))));
    const switches = el('div', { class: 'privacy-elements' }, ...PRIVACY_ELEMENTS.map(([key, name]) => {
      const box = el('input', { type: 'checkbox', checked: !!p.elements[key], disabled: p.visibility === 'private' });
      box.addEventListener('change', () => save({ elements: { [key]: box.checked } }));
      return el('label', { class: 'row small' }, el('span', { class: 'switch' }, box, el('span')), name);
    }));
    const index = el('input', { type: 'checkbox', checked: p.indexable, disabled: p.visibility !== 'public' });
    index.addEventListener('change', () => save({ indexable: index.checked }));
    card.replaceChildren(
      el('h3', {}, icon('fa-solid fa-user-lock'), L(' Prywatność profilu', ' Profile privacy')),
      el('p', { class: 'muted small', textContent: L('Twój profil pokazuje statystyki, osiągnięcia i kosmetyki. Wybierz, kto go widzi i co na nim jest. Ty zawsze widzisz całość.', 'Your profile shows your stats, achievements and cosmetics. Choose who sees it and what is on it. You always see all of it.') }),
      state.hidden ? el('p', { class: 'privacy-hidden small' }, icon('fa-solid fa-eye-slash'), L(' Moderacja ukryła Twój profil: inni go nie widzą.', ' The moderators have hidden your profile: others cannot see it.')) : '',
      el('div', { class: 'row privacy-link' },
        el('input', { type: 'text', value: link, readOnly: true, class: 'grow', onfocus: (e) => e.target.select() }),
        el('a', { class: 'btn', href: state.url }, icon('fa-solid fa-id-card'), L(' Zobacz swój profil', ' See your profile')),
        el('button', { type: 'button', onclick: () => copyText(link, L('Skopiowano link do profilu.', 'Profile link copied.')) }, icon('fa-regular fa-copy'), L(' Kopiuj link', ' Copy link'))),
      el('h4', { textContent: L('Kto widzi profil', 'Who sees the profile') }), options,
      el('h4', { textContent: L('Co jest na profilu', 'What is on the profile') }), switches,
      el('label', { class: 'row small privacy-index' }, el('span', { class: 'switch' }, index, el('span')), L('Pozwól wyszukiwarkom (Google itp.) pokazywać mój profil', 'Let search engines (Google etc.) show my profile')),
      ...suggestSection());
  }
  /** Being suggested to players met on the same server, and seeing suggestions. */
  function suggestSection() {
    if (!suggest?.enabled) return [];
    const box = el('input', { type: 'checkbox', checked: suggest.visible });
    box.addEventListener('change', () => saveSuggest(box.checked));
    return [
      el('h4', { textContent: L('Propozycje znajomych', 'Friend suggestions') }),
      el('label', { class: 'row small privacy-suggest' }, el('span', { class: 'switch' }, box, el('span')), L('Pokazuj mnie w propozycjach znajomych', 'Show me in friend suggestions')),
      el('p', { class: 'muted small', textContent: english() ? 'SlashClient players you play with on the same server can see you in "Suggestions" in the launcher and in game (with the server\'s name and the time played together), and you see them. Switched off: nobody sees you, you get no suggestions, and the saved meetings are deleted. The "Invisible" status is never counted.' : 'Gracze SlashClient, z którymi grasz na tym samym serwerze, mogą zobaczyć Cię w „Propozycjach” w launcherze i w grze (z nazwą serwera i czasem wspólnej gry), a Ty ich. Wyłączone: nikt Cię nie zobaczy, Ty nie dostaniesz propozycji, a zapisane spotkania zostaną usunięte. Status „Niewidoczny” nigdy nie jest liczony.' }),
    ];
  }
  draw();
  return card;
}
