// The account page's "Wsparcie projektu" card: the tier in force and until when, the subscription
// (managed on Stripe's customer portal), the player's choices (supporters wall, profile badge) and
// the payment history with refund requests (paymentHistory.js). Everything comes from
// /v1/me/support; the webhooks decide what is granted.
import { api, el, guard, icon, toast } from './common.js';
import { paymentHistory } from './paymentHistory.js';

const SUB_STATUS = { active: 'aktywna', trialing: 'aktywna', past_due: 'zaległa płatność', canceled: 'anulowana', unpaid: 'nieopłacona', incomplete: 'niedokończona' };
const day = (ms) => new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
const money = (minor, currency) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(minor / 100);

/** The card, filled once the data is here; null when it cannot be read. */
export async function supportCard() {
  const [state, offer] = await Promise.all([api('GET', '/v1/me/support').catch(() => undefined), api('GET', '/v1/support').catch(() => ({ tiers: [] }))]);
  if (!state) return null;
  const names = Object.fromEntries(offer.tiers.map((t) => [t.id, t.name]));
  const card = el('div', { class: 'glass card support-card', id: 'wsparcie' });
  let prefs = state.prefs;

  const draw = () => {
    const s = state.supporter;
    const now = s && !s.past
      ? el('div', { class: 'row' }, chip(s.name, s.color), el('span', { class: 'muted small', textContent: s.expiresAt ? `do ${day(s.expiresAt)}` : 'bez terminu' }))
      : s?.past ? el('p', { class: 'muted small', textContent: `Wspierałeś(-aś) projekt od ${day(s.since)}. Dziękujemy!` })
      : el('p', { class: 'muted small', textContent: 'Wsparcie jest dobrowolne i nie daje przewag w grze: rangę przy nicku, kosmetyki i więcej miejsca na pliki.' });
    const sub = state.subscriptions.find((x) => ['active', 'trialing', 'past_due'].includes(x.status)) ?? state.subscriptions[0];
    const subLine = sub ? el('p', { class: 'small' }, icon('fa-solid fa-rotate'), ` Co miesiąc: ${names[sub.tier] ?? sub.tier}, ${money(sub.amount, sub.currency)} · ${SUB_STATUS[sub.status] ?? sub.status}`,
      sub.periodEnd ? (sub.cancelAtPeriodEnd || sub.status === 'canceled' ? ` · do ${day(sub.periodEnd)}` : ` · odnowienie ${day(sub.periodEnd)}`) : '', sub.test ? ' · TEST' : '') : '';
    const portal = state.portal ? el('button', { onclick: async () => {
      const res = await guard(() => api('POST', '/v1/support/portal'));
      if (res?.url) location.href = res.url;
    } }, icon('fa-solid fa-credit-card'), sub ? 'Zarządzaj subskrypcją' : 'Płatności w Stripe') : '';
    const toggle = (key, label) => {
      const input = el('input', { type: 'checkbox', checked: prefs[key] });
      input.addEventListener('change', async () => {
        const res = await guard(() => api('POST', '/v1/me/support/prefs', { [key]: input.checked }));
        if (res) {
          prefs = res.prefs;
          toast('Zapisano.');
        } else input.checked = prefs[key];
      });
      return el('label', { class: 'row small' }, el('span', { class: 'switch' }, input, el('span')), label);
    };
    card.replaceChildren(
      el('h3', {}, icon('fa-solid fa-heart'), ' Wsparcie projektu'),
      now, subLine,
      el('div', { class: 'row' }, el('a', { class: 'btn', href: '/wsparcie' }, icon('fa-solid fa-heart'), s && !s.past ? 'Wesprzyj ponownie' : 'Wesprzyj projekt'), portal),
      toggle('profile', 'Pokazuj odznakę wsparcia na moim profilu'),
      toggle('wall', 'Pokaż mnie na ścianie wspierających'),
      // the payments with their refund requests (paymentHistory.js)
      history);
  };
  const history = paymentHistory(names);
  draw();
  return card;
}

/** A chip in a tier's colour. */
export function chip(text, color) {
  const c = el('span', { class: 'chip supporter' }, icon('fa-solid fa-heart'), text);
  if (color) c.style.setProperty('--tier', color);
  return c;
}
