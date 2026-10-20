// The admin panel's "Wsparcie" → "Zwroty": the players' refund requests, waiting ones first, with
// the payment, the account, the reason and how old the payment was. "Zwróć" refunds through the
// provider's API (the webhook that follows takes the perks back), "Odrzuć" asks for a reason the
// player sees, "Oznacz jako zwrócone ręcznie" is for money returned outside. Each goes to the log.
import { api, el, errorText, fmtDate, icon, toast } from './common.js';

const ERRORS = {
  not_pending: 'Ta prośba już nie czeka (ktoś ją obsłużył?). Odśwież.',
  provider_error: 'Operator płatności odmówił albo nie odpowiedział. Szczegóły są w dzienniku; prośba dalej czeka.',
  provider_not_configured: 'Brak kluczy operatora dla trybu tej płatności.',
  not_refundable: 'Tej płatności nie da się zwrócić przez API (nie jest opłacona albo nie ma identyfikatora).',
  reason_required: 'Podaj powód (co najmniej 3 znaki): zobaczy go gracz.',
};
const STATUS = { pending: ['czeka', 'gold'], approved: ['zwrot w drodze', 'blue'], rejected: ['odrzucona', 'red'], refunded: ['zwrócono', 'green'], cancelled: ['anulowana przez gracza', ''] };
const PAY = { paid: 'opłacona', refunded: 'zwrócona', disputed: 'chargeback', mismatch: 'zła kwota', pending: 'w toku', failed: 'nieudana' };
const money = (minor, currency = 'PLN') => new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(minor / 100);
const call = (...args) => api(...args).catch((err) => { toast(ERRORS[err?.code] ?? errorText(err), true); return undefined; });
const ageOf = (ms) => {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  return days < 1 ? 'dziś' : days === 1 ? '1 dzień temu' : `${days} dni temu`;
};

let filter = '';

/** Fills `box` with the queue; `tierName` maps tier ids to names; `done` runs after an action. */
export async function refundsSection(box, tierName, done = () => {}) {
  const q = filter ? `?status=${filter}` : '';
  const res = await call('GET', `/v1/admin/support/refunds${q}`);
  if (!res || !box.isConnected) return;
  const pick = el('select', {}, el('option', { value: '', textContent: 'Wszystkie (czekające na górze)' }), ...Object.entries(STATUS).map(([k, [name]]) => el('option', { value: k, textContent: name, selected: filter === k })));
  pick.addEventListener('change', () => { filter = pick.value; refundsSection(box, tierName, done); });
  const reload = () => { refundsSection(box, tierName, done); done(); };
  const act = async (r, path, body, ok) => {
    if (await call('POST', `/v1/admin/support/refunds/${r.id}/${path}`, body)) { toast(ok); reload(); }
  };

  const card = (r) => {
    const p = r.payment;
    const [label, color] = STATUS[r.status] ?? [r.status, ''];
    const what = p ? `${tierName[p.tier] ?? p.tier} · ${p.kind === 'monthly' ? 'miesiąc subskrypcji' : `${p.days} dni`}` : 'płatność nieznana';
    return el('div', { class: `glass card sup-refund ${r.status}` },
      el('div', { class: 'row' }, el('b', { textContent: `@${r.handle || r.user.slice(0, 8)}` }), el('span', { class: `chip ${color}`, textContent: label }),
        r.guardian ? el('span', { class: 'chip red', title: 'Rodzic lub opiekun mówi, że nie wyraził zgody' }, icon('fa-solid fa-child-reaching'), 'rodzic/opiekun') : '',
        el('span', { class: 'grow' }), el('span', { class: 'muted small', textContent: `prośba ${fmtDate(r.createdAt)}` })),
      p ? el('div', { class: 'row small' },
        el('b', { textContent: money(p.amount, p.currency) }), el('span', { textContent: what }), el('span', { class: 'muted', textContent: p.provider }),
        el('span', { class: 'muted', textContent: `zapłacono ${fmtDate(p.paidAt)} (${ageOf(p.paidAt)})` }),
        p.inWindow ? el('span', { class: 'chip green', textContent: 'w 14 dniach' }) : el('span', { class: 'chip gold', textContent: 'po 14 dniach' }),
        p.mode === 'test' ? el('span', { class: 'chip gold', textContent: 'TEST' }) : '',
        el('span', { class: 'muted', textContent: `płatność: ${PAY[p.status] ?? p.status}` })) : '',
      p ? el('div', { class: 'muted small sup-code', textContent: [p.id, p.intent, p.subscription, r.providerRef ? `zwrot ${r.providerRef}` : ''].filter(Boolean).join(' · ') }) : '',
      r.reason ? el('p', { class: 'sup-reason', textContent: `„${r.reason}”` }) : el('p', { class: 'muted small', textContent: 'Bez podanego powodu.' }),
      r.answer ? el('p', { class: 'small', textContent: `Odpowiedź dla gracza: ${r.answer}` }) : '',
      r.decidedBy ? el('p', { class: 'muted small', textContent: `Obsłużył(a): @${r.decidedBy}` }) : '',
      el('div', { class: 'row' },
        r.status === 'pending' ? el('button', { class: 'primary', onclick: () => {
          if (confirm(`Zwrócić ${p ? money(p.amount, p.currency) : ''} graczowi @${r.handle} przez ${p?.provider ?? 'operatora'}? Korzyści skończą się, gdy operator potwierdzi zwrot.`)) act(r, 'refund', {}, 'Zwrot zlecony.');
        } }, icon('fa-solid fa-rotate-left'), 'Zwróć') : '',
        r.status === 'pending' ? el('button', { onclick: () => {
          const reason = prompt('Powód odrzucenia (zobaczy go gracz):', '');
          if (reason !== null) act(r, 'reject', { reason }, 'Odrzucono.');
        } }, icon('fa-solid fa-xmark'), 'Odrzuć') : '',
        r.status === 'pending' || r.status === 'approved' ? el('button', { onclick: () => {
          const note = prompt('Oznaczyć jako zwrócone ręcznie? Korzyści z tej płatności skończą się od razu. Notatka do dziennika (np. „przelew”):', '');
          if (note !== null) act(r, 'manual', { note }, 'Oznaczono jako zwrócone.');
        } }, icon('fa-solid fa-hand-holding-dollar'), 'Oznacz jako zwrócone ręcznie') : ''));
  };

  box.replaceChildren(
    el('div', { class: 'row' }, pick, el('span', { class: 'grow muted small', textContent: `${res.pending} czeka` })),
    res.refunds.length ? el('div', { class: 'sup-refunds' }, ...res.refunds.map(card)) : el('div', { class: 'glass card' }, el('p', { class: 'muted', textContent: filter ? 'Brak próśb w tym stanie.' : 'Nikt nie prosił o zwrot.' })));
}
