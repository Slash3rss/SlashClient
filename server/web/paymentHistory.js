// The account page's payment history (inside "Wsparcie projektu"): each payment with its date,
// amount, tier, provider and method, status, the period it gave, a confirmation, and the refund
// request (asked for, followed and cancelled right here). Only the account's own payments come
// from /v1/me/support/payments; a refund request is seen only by the player and the admins.
import { L, api, confirmModal, el, english, guard, icon, locale, toast } from './common.js';

const PAGE = 10;
const EN = english();
export const PAY_STATUS = EN ? {
  paid: ['paid', 'green'], pending: ['pending', ''], failed: ['failed', 'red'], refunded: ['refunded', 'gold'],
  partially_refunded: ['partly refunded', 'gold'], disputed: ['disputed', 'red'], mismatch: ['being checked', 'red'],
} : {
  paid: ['opłacona', 'green'], pending: ['oczekuje', ''], failed: ['nieudana', 'red'], refunded: ['zwrócona', 'gold'],
  partially_refunded: ['częściowo zwrócona', 'gold'], disputed: ['spór', 'red'], mismatch: ['do wyjaśnienia', 'red'],
};
export const REFUND_STATUS = EN ? {
  pending: 'Refund request: waiting for a decision',
  approved: 'Refund approved – the money is on its way',
  rejected: 'Refund request rejected',
  refunded: 'Refunded',
  cancelled: 'Refund request cancelled',
} : {
  pending: 'Prośba o zwrot: oczekuje na decyzję',
  approved: 'Zwrot zaakceptowany – pieniądze są w drodze',
  rejected: 'Prośba o zwrot odrzucona',
  refunded: 'Zwrócono',
  cancelled: 'Prośba o zwrot anulowana',
};
export const METHODS = { card: L('karta', 'card'), blik: 'BLIK', p24: 'Przelewy24', link: 'Link', paypal: 'PayPal', revolut_pay: 'Revolut Pay', klarna: 'Klarna', sepa_debit: 'SEPA', bancontact: 'Bancontact', ideal: 'iDEAL', eps: 'EPS' };
const PROVIDER = { stripe: 'Stripe', paypal: 'PayPal' };
const ERRORS = EN ? {
  window_passed: 'The time to ask for a refund of this payment has passed.', not_refundable: 'This payment cannot be refunded through the site.',
  already_requested: 'A refund request for this payment is already waiting.', confirm_required: 'Tick that you understand what happens to the benefits.',
  not_pending: 'This request can no longer be cancelled.', rate_limited: 'Too many tries, try again in a moment.', no_receipt: 'The confirmation is not available yet.',
  provider_error: 'The payment provider did not answer, try later.',
} : {
  window_passed: 'Minął czas na prośbę o zwrot tej płatności.', not_refundable: 'Tej płatności nie można zwrócić przez stronę.',
  already_requested: 'Prośba o zwrot tej płatności już czeka.', confirm_required: 'Zaznacz, że rozumiesz, co się stanie z korzyściami.',
  not_pending: 'Tej prośby nie można już anulować.', rate_limited: 'Za dużo prób, spróbuj za chwilę.', no_receipt: 'Potwierdzenie nie jest jeszcze dostępne.',
  provider_error: 'Operator płatności nie odpowiedział, spróbuj później.',
};
const day = (ms) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
const money = (minor, currency) => new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(minor / 100);
const call = (...args) => api(...args).catch((err) => { toast(ERRORS[err?.code] ?? L('Coś poszło nie tak.', 'Something went wrong.'), true); return undefined; });

/** The history block; `names` maps tier ids to their names, `changed` runs after a refund request changes. */
export function paymentHistory(names, changed = () => {}) {
  const box = el('div', { class: 'pay-history' });
  let offset = 0;
  let open = '';

  async function load() {
    const res = await api('GET', `/v1/me/support/payments?limit=${PAGE}&offset=${offset}`).catch(() => undefined);
    if (!res) return box.replaceChildren(el('p', { class: 'muted small', textContent: L('Nie udało się wczytać historii płatności.', 'Could not load the payment history.') }));
    if (!res.total) return box.replaceChildren();
    box.replaceChildren(
      el('h4', {}, icon('fa-solid fa-receipt'), L(' Historia płatności', ' Payment history')),
      ...res.payments.map(row),
      res.total > PAGE ? el('div', { class: 'row pay-pager' },
        offset ? el('button', { onclick: () => { offset = Math.max(0, offset - PAGE); load(); } }, icon('fa-solid fa-chevron-left'), L('Nowsze', 'Newer')) : '',
        el('span', { class: 'grow muted small', textContent: `${offset + 1}–${offset + res.payments.length} ${L('z', 'of')} ${res.total}` }),
        offset + PAGE < res.total ? el('button', { onclick: () => { offset += PAGE; load(); } }, L('Starsze', 'Older'), icon('fa-solid fa-chevron-right')) : '') : '');
  }

  function row(p) {
    const [label, color] = PAY_STATUS[p.status] ?? [p.status, ''];
    const what = `${names[p.tier] ?? p.tier} · ${p.kind === 'monthly' ? (p.renewal ? L('odnowienie subskrypcji', 'subscription renewal') : L('co miesiąc', 'monthly')) : `${L('jednorazowo', 'one-off')}${p.days ? `, ${p.days} ${L('dni', 'days')}` : ''}`}`;
    const how = [PROVIDER[p.provider] ?? p.provider, p.method && p.method !== p.provider ? METHODS[p.method] ?? p.method : ''].filter(Boolean).join(' · ');
    const period = p.period ? `${day(p.period.from)} – ${p.period.to ? day(p.period.to) : L('bez terminu', 'no end date')}${p.period.endedAt ? L(` (zakończone ${day(p.period.endedAt)})`, ` (ended ${day(p.period.endedAt)})`) : ''}` : '';
    const item = el('div', { class: 'pay-row' },
      el('div', { class: 'row' }, el('b', { class: 'grow', textContent: what }), el('b', { textContent: money(p.amount, p.currency) })),
      el('div', { class: 'row small muted' }, el('span', { textContent: day(p.at) }), el('span', { textContent: how }),
        el('span', { class: `chip ${color}`, textContent: p.status === 'partially_refunded' ? `${label} (${money(p.refundedAmount, p.currency)})` : label }),
        p.test ? el('span', { class: 'chip gold', textContent: 'TEST' }) : ''),
      period ? el('div', { class: 'small muted' }, icon('fa-regular fa-calendar'), L(` Korzyści: ${period}`, ` Benefits: ${period}`)) : '');
    const actions = el('div', { class: 'row small pay-actions' });
    if (p.receipt) actions.append(el('button', { class: 'chip', onclick: async () => {
      // opened before the answer, so the browser does not take it for a pop-up
      const w = window.open('', '_blank');
      if (w) w.opener = null;
      const res = await call('GET', `/v1/me/support/payments/${p.id}/receipt`);
      if (res?.url && w) w.location.href = res.url;
      else w?.close();
    } }, icon('fa-solid fa-file-invoice'), L('Potwierdzenie', 'Confirmation')));
    if (p.transaction) actions.append(el('span', { class: 'muted', title: L('Identyfikator transakcji PayPal', 'PayPal transaction ID') }, icon('fa-brands fa-paypal'), L(` Transakcja: ${p.transaction}`, ` Transaction: ${p.transaction}`)));
    const r = p.refund;
    if (r && r.status !== 'cancelled' && !(r.status === 'refunded' && p.status.includes('refunded'))) {
      item.append(el('div', { class: `pay-refund ${r.status}` }, icon(r.status === 'rejected' ? 'fa-solid fa-circle-xmark' : r.status === 'pending' ? 'fa-regular fa-clock' : 'fa-solid fa-rotate-left'),
        el('span', { class: 'grow' }, REFUND_STATUS[r.status], r.status === 'rejected' && r.answer ? `: ${r.answer}` : ''),
        r.status === 'pending' ? el('button', { class: 'chip', onclick: async () => {
          if (!await confirmModal({ title: L('Anulować prośbę o zwrot?', 'Cancel the refund request?'), ok: L('Anuluj prośbę', 'Cancel the request'), cancel: L('Wróć', 'Back'), danger: true })) return;
          if (await call('POST', `/v1/me/support/refunds/${r.id}/cancel`)) { toast(L('Prośba anulowana.', 'Request cancelled.')); changed(); load(); }
        } }, L('Anuluj prośbę', 'Cancel the request')) : ''));
    }
    if (p.refundable) actions.append(el('button', { class: 'chip', onclick: () => { open = open === p.id ? '' : p.id; load(); } }, icon('fa-solid fa-rotate-left'), L('Poproś o zwrot', 'Ask for a refund')));
    if (actions.childNodes.length) item.append(actions);
    if (open === p.id && p.refundable) item.append(form(p));
    return item;
  }

  function form(p) {
    const reason = el('textarea', { rows: 3, maxLength: 500, placeholder: L('Powód (opcjonalnie)', 'Reason (optional)') });
    const sure = el('input', { type: 'checkbox' });
    const guardian = el('input', { type: 'checkbox' });
    const send = el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-paper-plane'), L('Wyślij prośbę', 'Send the request'));
    return el('form', { class: 'pay-form', onsubmit: async (e) => {
      e.preventDefault();
      if (!sure.checked) return toast(ERRORS.confirm_required, true);
      send.disabled = true;
      const res = await call('POST', '/v1/me/support/refunds', { payment: p.id, reason: reason.value, confirm: true, guardian: guardian.checked });
      send.disabled = false;
      if (!res) return;
      open = '';
      toast(L('Prośba o zwrot wysłana.', 'Refund request sent.'));
      changed();
      load();
    } },
    el('b', { textContent: L(`Prośba o zwrot: ${money(p.amount, p.currency)} z ${day(p.at)}`, `Refund request: ${money(p.amount, p.currency)} from ${day(p.at)}`) }),
    el('p', { class: 'muted small', textContent: L(`Można o nią poprosić do ${day(p.refundUntil)}. Pieniądze wrócą tą samą metodą płatności. Prośbę widzisz tylko Ty i administratorzy.`,
      `You can ask for it until ${day(p.refundUntil)}. The money goes back by the same payment method. Only you and the admins see the request.`) }),
    p.kind === 'monthly' ? el('p', { class: 'muted small', textContent: L('Zwrot za miesiąc nie anuluje subskrypcji: zrób to w „Zarządzaj subskrypcją”.', 'A refund for a month does not cancel the subscription: do that in "Manage subscription".') }) : '',
    reason,
    el('label', { class: 'row small check' }, sure, el('span', { textContent: L('Rozumiem, że korzyści z tej płatności (ranga, kosmetyki wspierających, większe limity) skończą się po zwrocie.', 'I understand that the benefits of this payment (the rank, the supporter cosmetics, the higher limits) end after the refund.') })),
    el('label', { class: 'row small check' }, guardian, el('span', { textContent: L('Jestem rodzicem/opiekunem i nie wyraziłem(-am) zgody na tę płatność.', 'I am a parent/guardian and did not agree to this payment.') })),
    el('div', { class: 'row' }, send, el('button', { type: 'button', onclick: () => { open = ''; load(); } }, L('Anuluj', 'Cancel'))));
  }

  load();
  return box;
}
