import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { RefundStore } from './refunds.ts';
import type { Grant, Payment, SupportStore } from './store.ts';
import { ProviderError, scrub, type StripeClient } from './stripe.ts';

/**
 * The player's payment history (the account page's "Wsparcie projektu" and the launcher's
 * "Historia płatności"): each payment with its amount, tier, provider and method, what it gave and
 * for how long, its refund request, and a confirmation (Stripe's receipt or invoice page; PayPal's
 * transaction id). Only the account's own payments; test payments only for admins.
 *
 * What the providers tell about a payment beyond support_payments (the method, the receipt's
 * address, how much was refunded, the period a month paid for) is kept in a table of its own.
 */

/** Who sees which rows: checkouts never finished, and subscription checkouts (their months are rows), are left out. */
const PENDING_SHOWN_MS = 86_400_000;

export interface PaymentInfo { method: string; receiptUrl: string; refundedAmount: number; periodEnd: number }

export class PaymentInfoStore {
  private readonly sql: DatabaseSync;
  private readonly now: () => number;

  constructor(sql: DatabaseSync, now: () => number) {
    this.sql = sql;
    this.now = now;
    sql.exec(`CREATE TABLE IF NOT EXISTS support_payment_info (
  payment TEXT PRIMARY KEY, method TEXT NOT NULL DEFAULT '', receipt_url TEXT NOT NULL DEFAULT '', refunded_amount INTEGER NOT NULL DEFAULT 0,
  period_end INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);`);
  }

  get(payment: string): PaymentInfo {
    const r = this.sql.prepare('SELECT method, receipt_url AS receiptUrl, refunded_amount AS refundedAmount, period_end AS periodEnd FROM support_payment_info WHERE payment = ?').get(payment) as PaymentInfo | undefined;
    return r ?? { method: '', receiptUrl: '', refundedAmount: 0, periodEnd: 0 };
  }

  /** Notes what is known; empty values leave what was there. */
  note(payment: string, info: Partial<PaymentInfo>) {
    const was = this.get(payment);
    const method = /^[a-z_]{2,30}$/.test(info.method ?? '') ? info.method! : was.method;
    const receiptUrl = /^https:\/\/[^\s"<>]{8,500}$/.test(info.receiptUrl ?? '') ? info.receiptUrl! : was.receiptUrl;
    const refundedAmount = Number.isInteger(info.refundedAmount) && info.refundedAmount! > 0 ? info.refundedAmount! : was.refundedAmount;
    const periodEnd = Number.isFinite(info.periodEnd) && info.periodEnd! > 0 ? info.periodEnd! : was.periodEnd;
    this.sql.prepare(`INSERT INTO support_payment_info (payment, method, receipt_url, refunded_amount, period_end, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (payment) DO UPDATE SET method = excluded.method, receipt_url = excluded.receipt_url, refunded_amount = excluded.refunded_amount,
      period_end = excluded.period_end, updated_at = excluded.updated_at`).run(payment, method, receiptUrl, refundedAmount, periodEnd, this.now());
  }
}

export interface HistoryDeps {
  sql: DatabaseSync;
  store: SupportStore;
  refunds: RefundStore;
  info: PaymentInfoStore;
  now: () => number;
  authed: (req: http.IncomingMessage) => string;
  isAdmin: (userId: string) => boolean;
  limit: (key: string) => void;
  refundable: (p: Payment) => boolean;
  until: (p: Payment) => number;
  stripe: (mode: 'test' | 'live') => StripeClient | undefined;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const COLS = `id, provider, ref, user, tier, kind, quantity, days, amount, currency, status, mode, intent, customer, subscription,
  created_at AS createdAt, paid_at AS paidAt, refunded_at AS refundedAt, note`;

export function historyRoutes(d: HistoryDeps) {
  const fail = d.fail;

  /** The rows a player sees, newest first. */
  function page(user: string, withTest: boolean, offset: number, limit: number): { payments: Payment[]; total: number } {
    const where = `WHERE user = ? AND status NOT IN ('subscribed', 'expired') AND NOT (status = 'pending' AND created_at < ?)${withTest ? '' : " AND mode = 'live'"}`;
    const args = [user, d.now() - PENDING_SHOWN_MS];
    const total = (d.sql.prepare(`SELECT COUNT(*) AS n FROM support_payments ${where}`).get(...args) as { n: number }).n;
    const payments = d.sql.prepare(`SELECT ${COLS} FROM support_payments ${where} ORDER BY COALESCE(NULLIF(paid_at, 0), created_at) DESC, id LIMIT ? OFFSET ?`)
      .all(...args, limit, offset) as unknown as Payment[];
    return { payments, total };
  }

  /** The tier's period a payment gave: a one-time payment's grant, or the month an invoice paid for. */
  function period(p: Payment, info: PaymentInfo): { from: number; to: number | null; endedAt: number | null } | null {
    if (p.kind === 'one_time') {
      const g: Grant | undefined = d.store.grantsByRef('payment', p.id)[0];
      // support bought again continues from the end of the one before: its days are the last ones
      return g ? { from: g.expiresAt === null ? g.startsAt : Math.max(g.startsAt, g.expiresAt - p.days * 86_400_000), to: g.expiresAt, endedAt: g.revokedAt || null } : null;
    }
    return p.paidAt && info.periodEnd ? { from: p.paidAt, to: info.periodEnd, endedAt: p.refundedAt || null } : null;
  }

  /** opłacona / oczekuje / nieudana / zwrócona / częściowo zwrócona / spór / do wyjaśnienia */
  function state(p: Payment, info: PaymentInfo): string {
    if (p.status === 'refunded') return info.refundedAmount && info.refundedAmount < p.amount ? 'partially_refunded' : 'refunded';
    if (p.status === 'disputed') return 'disputed';
    if (p.status === 'paid' && info.refundedAmount > 0) return 'partially_refunded';
    return p.status;
  }

  /** Whether a month is the subscription's first or a renewal. */
  const renewal = (p: Payment) => p.kind === 'monthly' && !!p.subscription
    && !!d.sql.prepare("SELECT 1 FROM support_payments WHERE subscription = ? AND kind = 'monthly' AND status NOT IN ('subscribed', 'pending') AND paid_at > 0 AND paid_at < ? LIMIT 1").get(p.subscription, p.paidAt || p.createdAt);

  function row(p: Payment) {
    const info = d.info.get(p.id);
    const r = d.refunds.latest(p.id);
    const tier = d.store.tier(p.tier);
    return {
      id: p.id, at: p.paidAt || p.createdAt, amount: p.amount, currency: p.currency, tier: p.tier, tierName: tier?.name ?? p.tier, tierNameEn: tier?.nameEn || tier?.name || p.tier, kind: p.kind, days: p.days, renewal: renewal(p),
      provider: p.provider, method: info.method || (p.provider === 'paypal' ? 'paypal' : ''), status: state(p, info), refundedAmount: info.refundedAmount || (p.status === 'refunded' ? p.amount : 0),
      period: period(p, info), test: p.mode === 'test',
      refund: r ? { id: r.id, status: r.status, answer: r.answer, createdAt: r.createdAt } : null,
      refundable: d.refundable(p), refundUntil: d.until(p) || null,
      // the confirmation: Stripe's receipt (asked for when opened) or PayPal's transaction id
      receipt: p.provider === 'stripe' && p.paidAt ? (info.receiptUrl ? 'url' : p.intent.startsWith('pi_') ? 'ask' : '') : '',
      transaction: p.provider === 'paypal' && p.paidAt ? p.intent : '',
    };
  }

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/me\/support\/payments$/, (req, _p, url) => {
      const me = d.authed(req);
      const limit = Math.min(50, Math.max(1, Math.floor(Number(url.searchParams.get('limit'))) || 20));
      const offset = Math.min(100_000, Math.max(0, Math.floor(Number(url.searchParams.get('offset'))) || 0));
      const res = page(me, d.isAdmin(me), offset, limit);
      return { payments: res.payments.map(row), total: res.total, offset, limit };
    }],
    // the confirmation of one payment: Stripe's receipt or invoice page (asked from Stripe once, then kept)
    ['GET', /^\/v1\/me\/support\/payments\/(p_[\w-]{6,20})\/receipt$/, async (req, [id]) => {
      const me = d.authed(req);
      const p = d.store.payment(id);
      if (!p || p.user !== me || (p.mode === 'test' && !d.isAdmin(me)) || !p.paidAt) fail(404, 'not_found');
      if (p!.provider === 'paypal') return { transaction: p!.intent };
      const info = d.info.get(p!.id);
      if (info.receiptUrl) return { url: info.receiptUrl };
      if (!p!.intent.startsWith('pi_')) fail(404, 'no_receipt');
      d.limit(`receipt:${me}`);
      const client = d.stripe(p!.mode) ?? fail(503, 'provider_disabled');
      try {
        const pi = await client.call<{ latest_charge?: { receipt_url?: string; payment_method_details?: { type?: string } } }>('GET', `/v1/payment_intents/${encodeURIComponent(p!.intent)}`, { expand: ['latest_charge'] });
        const charge = pi.latest_charge ?? {};
        d.info.note(p!.id, { receiptUrl: String(charge.receipt_url ?? ''), method: String(charge.payment_method_details?.type ?? '') });
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        console.error(`wsparcie: potwierdzenie ${p!.id}: ${scrub(err.message)}`);
        return fail(502, 'provider_error');
      }
      const url = d.info.get(p!.id).receiptUrl;
      return url ? { url } : fail(404, 'no_receipt');
    }],
  ];

  return { routes };
}
