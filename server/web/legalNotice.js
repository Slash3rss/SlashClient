// The account page's legal bits: the note under the sign-in buttons, and a one-time notice when the
// terms or the privacy policy changed in an important way since the player last saw them.
import { L, api, el, english, icon } from './common.js';

/** "Logując się, akceptujesz Regulamin i Politykę prywatności." */
export function signInNote() {
  if (english()) {
    return el('p', { class: 'muted small legal-note' }, 'By signing in, you accept the ',
      el('a', { href: '/terms', textContent: 'Terms of Service' }), ' and the ',
      el('a', { href: '/privacy', textContent: 'Privacy Policy' }), '.');
  }
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
        el('b', { class: 'grow', textContent: L(`Zaktualizowaliśmy ${n.doc === 'privacy' ? 'politykę prywatności' : n.doc === 'support-terms' ? 'regulamin wsparcia' : 'regulamin'}`,
          `We have updated the ${n.doc === 'privacy' ? 'Privacy Policy' : n.doc === 'support-terms' ? 'Support Terms' : 'Terms of Service'}`) })),
      n.note ? el('p', { class: 'muted small', textContent: n.note }) : '',
      el('div', { class: 'row' },
        // the English document when there is one (an older server sends only the Polish one)
        el('a', { class: 'btn primary', href: english() && n.en?.path ? n.en.path : n.pl.path, onclick: () => void ack() }, icon('fa-solid fa-arrow-up-right-from-square'), L('Zobacz zmiany', 'See the changes')),
        el('button', { onclick: close }, 'OK')));
    return card;
  });
}
