// The account page's legal bits: the note under the sign-in buttons, and a one-time notice when the
// terms or the privacy policy changed in an important way since the player last saw them.
import { api, el, icon } from './common.js';

/** "Logując się, akceptujesz Regulamin i Politykę prywatności." */
export function signInNote() {
  return el('p', { class: 'muted small legal-note' }, 'Logując się, akceptujesz ',
    el('a', { href: '/regulamin', textContent: 'Regulamin' }), ' i ',
    el('a', { href: '/polityka-prywatnosci', textContent: 'Politykę prywatności' }), '.');
}

/** Each important change not seen yet, as a card with "Zobacz zmiany" and "OK" (both mark it seen). */
export async function legalNotices() {
  const res = await api('GET', '/v1/me/legal-notices').catch(() => undefined);
  return (res?.notices ?? []).map((n) => {
    const ack = () => api('POST', '/v1/me/legal-notices/ack', { doc: n.doc, version: n.version }).catch(() => {});
    const card = el('div', { class: 'glass card legal-notice', role: 'status' });
    const close = () => { void ack(); card.remove(); };
    card.append(
      el('div', { class: 'row' }, icon('fa-solid fa-scale-balanced'),
        el('b', { class: 'grow', textContent: `Zaktualizowaliśmy ${n.doc === 'privacy' ? 'politykę prywatności' : n.doc === 'support-terms' ? 'regulamin wsparcia' : 'regulamin'}` })),
      n.note ? el('p', { class: 'muted small', textContent: n.note }) : '',
      el('div', { class: 'row' },
        el('a', { class: 'btn primary', href: n.pl.path, onclick: () => void ack() }, icon('fa-solid fa-arrow-up-right-from-square'), 'Zobacz zmiany'),
        el('button', { onclick: close }, 'OK')));
    return card;
  });
}
