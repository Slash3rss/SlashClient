// The account page's "Profile privacy" card: who sees the public profile (/u/<handle>) and which
// parts of it. The server enforces it (profiles.ts); this only edits the settings.
import { api, el, guard, icon, toast } from './common.js';

const VISIBILITY = [
  ['public', 'Wszyscy', 'fa-solid fa-earth-europe', 'Każdy z linkiem, także bez logowania.'],
  ['friends', 'Znajomi', 'fa-solid fa-user-group', 'Tylko Twoi znajomi z SlashClient (zalogowani).'],
  ['private', 'Tylko ja', 'fa-solid fa-lock', 'Nikt poza Tobą.'],
];
export const PRIVACY_ELEMENTS = [
  ['stats', 'Statystyki (godziny gry, serie, dni gry)'],
  ['achievements', 'Osiągnięcia'],
  ['cosmetics', 'Noszone kosmetyki'],
  ['clan', 'Klan'],
  ['minecraft', 'Konta Minecraft (nicki)'],
  ['friends', 'Liczba znajomych'],
  ['servers', 'Serwery, na których grasz'],
  ['lastOnline', 'Kiedy ostatnio byłeś online'],
];

/** The card, filled once the settings are here; empty (null) when they cannot be read. */
export async function privacyCard() {
  let state = await api('GET', '/v1/me/profile-privacy').catch(() => undefined);
  if (!state) return null;
  const card = el('div', { class: 'glass card privacy-card', id: 'prywatnosc' });
  const save = async (change) => {
    const next = await guard(() => api('POST', '/v1/me/profile-privacy', change));
    if (!next) return draw();
    state = next;
    toast('Zapisano ustawienia profilu.');
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
      el('h3', {}, icon('fa-solid fa-user-lock'), ' Prywatność profilu'),
      el('p', { class: 'muted small', textContent: 'Twój profil pokazuje statystyki, osiągnięcia i kosmetyki. Wybierz, kto go widzi i co na nim jest. Ty zawsze widzisz całość.' }),
      state.hidden ? el('p', { class: 'privacy-hidden small' }, icon('fa-solid fa-eye-slash'), ' Moderacja ukryła Twój profil: inni go nie widzą.') : '',
      el('div', { class: 'row privacy-link' },
        el('input', { type: 'text', value: link, readOnly: true, class: 'grow', onfocus: (e) => e.target.select() }),
        el('a', { class: 'btn', href: state.url }, icon('fa-solid fa-id-card'), ' Zobacz swój profil'),
        el('button', { type: 'button', onclick: async () => { await navigator.clipboard.writeText(link).catch(() => {}); toast('Skopiowano link do profilu.'); } }, icon('fa-regular fa-copy'), ' Kopiuj link')),
      el('h4', { textContent: 'Kto widzi profil' }), options,
      el('h4', { textContent: 'Co jest na profilu' }), switches,
      el('label', { class: 'row small privacy-index' }, el('span', { class: 'switch' }, index, el('span')), 'Pozwól wyszukiwarkom (Google itp.) pokazywać mój profil'));
  }
  draw();
  return card;
}
