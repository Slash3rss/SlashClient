// The account page's payment history (inside "Wsparcie projektu"): each payment with its date,
// amount, tier, provider and method, status, the period it gave, a confirmation, and the refund
// request (asked for, followed and cancelled right here). Only the account's own payments come
// from /v1/me/support/payments; a refund request is seen only by the player and the admins.
import { api, el, guard, icon, toast } from './common.js';

const PAGE = 10;
export const PAY_STATUS = {
  paid: ['opłacona', 'green'], pending: ['oczekuje', ''], failed: ['nieudana', 'red'], refunded: ['zwrócona', 'gold'],
  partially_refunded: ['częściowo zwrócona', 'gold'], disputed: ['spór', 'red'], mismatch: ['do wyjaśnienia', 'red'],
};
export const REFUND_STATUS = {
  pending: 'Prośba o zwrot: oczekuje na decyzję',
  approved: 'Zwrot zaakceptowany – pieniądze są w drodze',
  rejected: 'Prośba o zwrot odrzucona',
  refunded: 'Zwrócono',
  cancelled: 'Prośba o zwrot anulowana',
};
export const METHODS = { card: 'karta', blik: 'BLIK', p24: 'Przelewy24', link: 'Link', paypal: 'PayPal', revolut_pay: 'Revolut Pay', klarna: 'Klarna', sepa_debit: 'SEPA', bancontact: 'Bancontact', ideal: 'iDEAL', eps: 'EPS' };
const PROVIDER = { stripe: 'Stripe', paypal: 'PayPal' };
const ERRORS = {
  window_passed: 'Minął czas na prośbę o zwrot tej płatności.', not_refundable: 'Tej płatności nie można zwrócić przez stronę.',
  already_requested: 'Prośba o zwrot tej płatności już czeka.', confirm_required: 'Zaznacz, że rozumiesz, co się stanie z korzyściami.',
  not_pending: 'Tej prośby nie można już anulować.', rate_limited: 'Za dużo prób, spróbuj za chwilę.', no_receipt: 'Potwierdzenie nie jest jeszcze dostępne.',
  provider_error: 'Operator płatności nie odpowiedział, spróbuj później.',
};
const day = (ms) => new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
const money = (minor, currency) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(minor / 100);
const call = (...args) => api(...args).catch((err) => { toast(ERRORS[err?.code] ?? 'Coś poszło nie tak.', true); return undefined; });

/** The history block; `names` maps tier ids to their names, `changed` runs after a refund request changes. */
export function paymentHistory(names, changed = () => {}) {
  const box = el('div', { class: 'pay-history' });
  let offset = 0;
  let open = '';

  async function load() {
    const res = await api('GET', `/v1/me/support/payments?limit=${PAGE}&offset=${offset}`).catch(() => undefined);
    if (!res) return box.replaceChildren(el('p', { class: 'muted small', textContent: 'Nie udało się wczytać historii płatności.' }));
    if (!res.total) return box.replaceChildren();
    box.replaceChildren(
      el('h4', {}, icon('fa-solid fa-receipt'), ' Historia płatności'),
      ...res.payments.map(row),
      res.total > PAGE ? el('div', { class: 'row pay-pager' },
        offset ? el('button', { onclick: () => { offset = Math.max(0, offset - PAGE); load(); } }, icon('fa-solid fa-chevron-left'), 'Nowsze') : '',
        el('span', { class: 'grow muted small', textContent: `${offset + 1}–${offset + res.payments.length} z ${res.total}` }),
        offset + PAGE < res.total ? el('button', { onclick: () => { offset += PAGE; load(); } }, 'Starsze', icon('fa-solid fa-chevron-right')) : '') : '');
  }

  function row(p) {
    const [label, color] = PAY_STATUS[p.status] ?? [p.status, ''];
    const what = `${names[p.tier] ?? p.tier} · ${p.kind === 'monthly' ? (p.renewal ? 'odnowienie subskrypcji' : 'co miesiąc') : `jednorazowo${p.days ? `, ${p.days} dni` : ''}`}`;
    const how = [PROVIDER[p.provider] ?? p.provider, p.method && p.method !== p.provider ? METHODS[p.method] ?? p.method : ''].filter(Boolean).join(' · ');
    const period = p.period ? `${day(p.period.from)} – ${p.period.to ? day(p.period.to) : 'bez terminu'}${p.period.endedAt ? ` (zakończone ${day(p.period.endedAt)})` : ''}` : '';
    const item = el('div', { class: 'pay-row' },
      el('div', { class: 'row' }, el('b', { class: 'grow', textContent: what }), el('b', { textContent: money(p.amount, p.currency) })),
      el('div', { class: 'row small muted' }, el('span', { textContent: day(p.at) }), el('span', { textContent: how }),
        el('span', { class: `chip ${color}`, textContent: p.status === 'partially_refunded' ? `${label} (${money(p.refundedAmount, p.currency)})` : label }),
        p.test ? el('span', { class: 'chip gold', textContent: 'TEST' }) : ''),
      period ? el('div', { class: 'small muted' }, icon('fa-regular fa-calendar'), ` Korzyści: ${period}`) : '');
    const actions = el('div', { class: 'row small pay-actions' });
    if (p.receipt) actions.append(el('button', { class: 'chip', onclick: async () => {
      // opened before the answer, so the browser does not take it for a pop-up
      const w = window.open('', '_blank');
      if (w) w.opener = null;
      const res = await call('GET', `/v1/me/support/payments/${p.id}/receipt`);
      if (res?.url && w) w.location.href = res.url;
      else w?.close();
    } }, icon('fa-solid fa-file-invoice'), 'Potwierdzenie'));
    if (p.transaction) actions.append(el('span', { class: 'muted', title: 'Identyfikator transakcji PayPal' }, icon('fa-brands fa-paypal'), ` Transakcja: ${p.transaction}`));
    const r = p.refund;
    if (r && r.status !== 'cancelled' && !(r.status === 'refunded' && p.status.includes('refunded'))) {
      item.append(el('div', { class: `pay-refund ${r.status}` }, icon(r.status === 'rejected' ? 'fa-solid fa-circle-xmark' : r.status === 'pending' ? 'fa-regular fa-clock' : 'fa-solid fa-rotate-left'),
        el('span', { class: 'grow' }, REFUND_STATUS[r.status], r.status === 'rejected' && r.answer ? `: ${r.answer}` : ''),
        r.status === 'pending' ? el('button', { class: 'chip', onclick: async () => {
          if (!confirm('Anulować prośbę o zwrot?')) return;
          if (await call('POST', `/v1/me/support/refunds/${r.id}/cancel`)) { toast('Prośba anulowana.'); changed(); load(); }
        } }, 'Anuluj prośbę') : ''));
    }
    if (p.refundable) actions.append(el('button', { class: 'chip', onclick: () => { open = open === p.id ? '' : p.id; load(); } }, icon('fa-solid fa-rotate-left'), 'Poproś o zwrot'));
    if (actions.childNodes.length) item.append(actions);
    if (open === p.id && p.refundable) item.append(form(p));
    return item;
  }

  function form(p) {
    const reason = el('textarea', { rows: 3, maxLength: 500, placeholder: 'Powód (opcjonalnie)' });
    const sure = el('input', { type: 'checkbox' });
    const guardian = el('input', { type: 'checkbox' });
    const send = el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-paper-plane'), 'Wyślij prośbę');
    return el('form', { class: 'pay-form', onsubmit: async (e) => {
      e.preventDefault();
      if (!sure.checked) return toast(ERRORS.confirm_required, true);
      send.disabled = true;
      const res = await call('POST', '/v1/me/support/refunds', { payment: p.id, reason: reason.value, confirm: true, guardian: guardian.checked });
      send.disabled = false;
      if (!res) return;
      open = '';
      toast('Prośba o zwrot wysłana.');
      changed();
      load();
    } },
    el('b', { textContent: `Prośba o zwrot: ${money(p.amount, p.currency)} z ${day(p.at)}` }),
    el('p', { class: 'muted small', textContent: `Można o nią poprosić do ${day(p.refundUntil)}. Pieniądze wrócą tą samą metodą płatności. Prośbę widzisz tylko Ty i administratorzy.` }),
    p.kind === 'monthly' ? el('p', { class: 'muted small', textContent: 'Zwrot za miesiąc nie anuluje subskrypcji: zrób to w „Zarządzaj subskrypcją”.' }) : '',
    reason,
    el('label', { class: 'row small check' }, sure, el('span', { textContent: 'Rozumiem, że korzyści z tej płatności (ranga, kosmetyki wspierających, większe limity) skończą się po zwrocie.' })),
    el('label', { class: 'row small check' }, guardian, el('span', { textContent: 'Jestem rodzicem/opiekunem i nie wyraziłem(-am) zgody na tę płatność.' })),
    el('div', { class: 'row' }, send, el('button', { type: 'button', onclick: () => { open = ''; load(); } }, 'Anuluj')));
  }

  load();
  return box;
}
