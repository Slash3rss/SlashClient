import { locale, t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * "Historia płatności" from Settings → "Wesprzyj projekt": the account's own payments as the
 * website's account page lists them (/v1/me/support/payments through the main process), with the
 * period each gave, its refund request, and links to the website for a confirmation or a refund.
 */

export interface HistoryDeps {
  api: any;
  /** Opens the website's account page at its "Wsparcie projektu" card (the refund form is there). */
  openAccount: () => void;
  toast: (message: string, isError?: boolean) => void;
}

export interface HistoryRow {
  id: string;
  at: number;
  amount: number;
  currency: string;
  tier: string;
  tierName: string;
  tierNameEn: string;
  kind: 'one_time' | 'monthly';
  days: number;
  renewal: boolean;
  provider: string;
  method: string;
  status: string;
  refundedAmount: number;
  period: { from: number; to: number | null; endedAt: number | null } | null;
  test: boolean;
  refund: { id: string; status: string; answer: string } | null;
  refundable: boolean;
  refundUntil: number | null;
  receipt: '' | 'url' | 'ask';
  transaction: string;
}

const PAGE = 10;
export const STATUS: Record<string, string> = {
  paid: 'opłacona', pending: 'oczekuje', failed: 'nieudana', refunded: 'zwrócona', partially_refunded: 'częściowo zwrócona', disputed: 'spór', mismatch: 'do wyjaśnienia',
};
export const REFUND_STATUS: Record<string, string> = {
  pending: 'Prośba o zwrot: oczekuje na decyzję', approved: 'Zwrot zaakceptowany – pieniądze są w drodze', rejected: 'Prośba o zwrot odrzucona', refunded: 'Zwrócono', cancelled: 'Prośba o zwrot anulowana',
};
const METHODS: Record<string, string> = { card: 'karta', blik: 'BLIK', p24: 'Przelewy24', paypal: 'PayPal', link: 'Link', klarna: 'Klarna', revolut_pay: 'Revolut Pay', sepa_debit: 'SEPA' };
const PROVIDERS: Record<string, string> = { stripe: 'Stripe', paypal: 'PayPal' };

export const money = (minor: number, currency: string) => new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(minor / 100);
const day = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

/** The row's lines as text: what, how, and the period (kept apart from the DOM for the tests). */
export function describePayment(p: HistoryRow) {
  const name = locale().startsWith('pl') ? p.tierName : p.tierNameEn;
  const what = `${name} · ${p.kind === 'monthly' ? (p.renewal ? t('odnowienie subskrypcji') : t('co miesiąc')) : p.days ? t('jednorazowo, {0} dni', p.days) : t('jednorazowo')}`;
  const how = [PROVIDERS[p.provider] ?? p.provider, p.method && p.method !== p.provider ? (METHODS[p.method] ? t(METHODS[p.method]) : p.method) : ''].filter(Boolean).join(' · ');
  const status = p.status === 'partially_refunded' ? `${t(STATUS[p.status])} (${money(p.refundedAmount, p.currency)})` : t(STATUS[p.status] ?? p.status);
  const period = p.period ? `${day(p.period.from)} – ${p.period.to ? day(p.period.to) : t('bez terminu')}${p.period.endedAt ? ` (${t('zakończone {0}', day(p.period.endedAt))})` : ''}` : '';
  const refund = p.refund && p.refund.status !== 'cancelled' && !(p.refund.status === 'refunded' && p.status.includes('refunded'))
    ? `${t(REFUND_STATUS[p.refund.status] ?? p.refund.status)}${p.refund.status === 'rejected' && p.refund.answer ? `: ${p.refund.answer}` : ''}` : '';
  return { what, how, status, period, refund };
}

export async function openPaymentHistory(deps: HistoryDeps) {
  const body = el('div', { className: 'ph-body' });
  const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
  const modal = el('div', { className: 'modal' }, el('div', { className: 'modal-box glass-panel ph-box' }, close, body));
  const done = () => {
    modal.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      done();
    }
  };
  close.addEventListener('click', done);
  modal.addEventListener('click', (e) => e.target === modal && done());
  document.addEventListener('keydown', onKey, true);
  let offset = 0;

  const button = (label: string, ic: string, run: () => void) => {
    const b = el('button', { type: 'button', className: 'ph-chip' }, icon(ic), ' ', label);
    b.addEventListener('click', run);
    return b;
  };

  function row(p: HistoryRow) {
    const d = describePayment(p);
    const item = el('div', { className: 'ph-row' },
      el('div', { className: 'row' }, el('b', { className: 'grow', textContent: d.what }), el('b', { textContent: money(p.amount, p.currency) })),
      el('div', { className: 'row muted small' }, el('span', { textContent: day(p.at) }), el('span', { textContent: d.how }),
        el('span', { className: `ph-status ${p.status}`, textContent: d.status }), p.test ? el('span', { className: 'ph-status test', textContent: 'TEST' }) : ''));
    if (d.period) item.append(el('div', { className: 'muted small' }, icon('fa-calendar'), ' ', t('Korzyści: {0}', d.period)));
    if (d.refund) item.append(el('div', { className: `ph-refund ${p.refund!.status}` }, icon(p.refund!.status === 'rejected' ? 'fa-circle-xmark' : p.refund!.status === 'pending' ? 'fa-clock' : 'fa-rotate-left'), ' ', d.refund));
    const actions = el('div', { className: 'row small' });
    if (p.receipt) actions.append(button(t('Potwierdzenie'), 'fa-file-invoice', async () => {
      try {
        const res = await deps.api.socialApi('GET', `/v1/me/support/payments/${p.id}/receipt`) as { url?: string };
        // only the providers' https pages; the main process opens them in the system browser
        if (res.url && /^https:\/\//.test(res.url)) window.open(res.url, '_blank');
      } catch {
        deps.toast(t('Potwierdzenie nie jest jeszcze dostępne.'), true);
      }
    }));
    if (p.transaction) actions.append(el('span', { className: 'muted', title: t('Identyfikator transakcji PayPal') }, t('Transakcja: {0}', p.transaction)));
    if (p.refundable) actions.append(button(t('Poproś o zwrot'), 'fa-rotate-left', () => deps.openAccount()));
    if (actions.childNodes.length) item.append(actions);
    return item;
  }

  async function load() {
    let res: { payments: HistoryRow[]; total: number };
    try {
      res = await deps.api.socialApi('GET', `/v1/me/support/payments?limit=${PAGE}&offset=${offset}`);
    } catch {
      body.replaceChildren(el('h2', {}, icon('fa-receipt'), ' ', t('Historia płatności')), el('p', { className: 'muted', textContent: t('Nie udało się wczytać historii płatności. Zaloguj się w zakładce Znajomi.') }));
      return;
    }
    const pager = el('div', { className: 'row ph-pager' });
    if (offset) pager.append(button(t('Nowsze'), 'fa-chevron-left', () => { offset = Math.max(0, offset - PAGE); void load(); }));
    pager.append(el('span', { className: 'grow muted small', textContent: res.total ? `${offset + 1}–${offset + res.payments.length} / ${res.total}` : '' }));
    if (offset + PAGE < res.total) pager.append(button(t('Starsze'), 'fa-chevron-right', () => { offset += PAGE; void load(); }));
    body.replaceChildren(
      el('h2', {}, icon('fa-receipt'), ' ', t('Historia płatności')),
      el('p', { className: 'muted small', textContent: t('Zwrot (w ciągu 14 dni): „Poproś o zwrot” otwiera stronę konta w przeglądarce.') }),
      res.payments.length ? el('div', { className: 'ph-list' }, ...res.payments.map(row)) : el('p', { className: 'muted', textContent: t('Nie ma jeszcze żadnych płatności.') }),
      res.total > PAGE ? pager : '');
  }

  await load();
  document.body.append(modal);
}
