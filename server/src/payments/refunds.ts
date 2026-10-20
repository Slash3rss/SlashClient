import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { paypalValue, type PayPalClient } from './paypal.ts';
import type { Payment, SupportStore } from './store.ts';
import { ProviderError, scrub, type StripeClient } from './stripe.ts';

/**
 * Refund requests: a player asks for a refund of one of their payments on the account page
 * ("Wsparcie projektu" → "Poproś o zwrot"), an admin refunds it through the provider's API,
 * rejects it with a reason, or marks it as refunded by hand.
 *
 * A request is seen only by the player who made it and by admins: it is never part of a profile,
 * the supporters wall, the bug tracker or anything else other players can read.
 *
 * The refund itself takes the perks back when the provider's webhook comes (support.ts takeBack),
 * as for a refund made in the provider's dashboard; a refund marked by hand takes them back here.
 * Either way takeBack does it once: a payment already "refunded" is left as it is.
 */

/** How long after paying a player can ask for a refund on their own (the terms say 14 days). */
export const REFUND_WINDOW_DAYS = 14;
const DAY = 86_400_000;
/** Requests one account may make in a day (on top of the per-minute limit). */
export const MAX_PER_DAY = 6;

export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled';

export interface RefundRequest {
  id: string;
  payment: string;
  user: string;
  reason: string;
  /** The parent or guardian says they did not agree to the payment. */
  guardian: boolean;
  status: RefundStatus;
  /** Why an admin said no (shown to the player). */
  answer: string;
  decidedBy: string;
  /** The provider's refund id, once the refund was asked for there. */
  providerRef: string;
  createdAt: number;
  updatedAt: number;
}

const COLS = `id, payment, user, reason, guardian, status, answer, decided_by AS decidedBy, provider_ref AS providerRef, created_at AS createdAt, updated_at AS updatedAt`;
const OPEN: RefundStatus[] = ['pending', 'approved'];

export class RefundStore {
  private readonly sql: DatabaseSync;
  private readonly now: () => number;

  constructor(sql: DatabaseSync, now: () => number) {
    this.sql = sql;
    this.now = now;
    sql.exec(`
CREATE TABLE IF NOT EXISTS support_refunds (
  id TEXT PRIMARY KEY, payment TEXT NOT NULL, user TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', guardian INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '', decided_by TEXT NOT NULL DEFAULT '', provider_ref TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS support_refunds_open ON support_refunds (payment) WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS support_refunds_user ON support_refunds (user, created_at);`);
  }

  private row(r: RefundRequest | undefined) {
    if (r) r.guardian = !!r.guardian;
    return r;
  }

  add(r: { payment: string; user: string; reason: string; guardian: boolean }): RefundRequest {
    const id = `r_${randomBytes(9).toString('base64url')}`;
    this.sql.prepare('INSERT INTO support_refunds (id, payment, user, reason, guardian, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, r.payment, r.user, r.reason, r.guardian ? 1 : 0, 'pending', this.now(), this.now());
    return this.get(id)!;
  }

  get(id: string): RefundRequest | undefined {
    return this.row(this.sql.prepare(`SELECT ${COLS} FROM support_refunds WHERE id = ?`).get(id) as unknown as RefundRequest | undefined);
  }

  /** The request of a payment still waiting or on its way, if any. */
  open(payment: string): RefundRequest | undefined {
    return this.row(this.sql.prepare(`SELECT ${COLS} FROM support_refunds WHERE payment = ? AND status IN ('pending', 'approved')`).get(payment) as unknown as RefundRequest | undefined);
  }

  /** The newest request of a payment (the history shows its state). */
  latest(payment: string): RefundRequest | undefined {
    return this.row(this.sql.prepare(`SELECT ${COLS} FROM support_refunds WHERE payment = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(payment) as unknown as RefundRequest | undefined);
  }

  of(user: string): RefundRequest[] {
    return (this.sql.prepare(`SELECT ${COLS} FROM support_refunds WHERE user = ? ORDER BY created_at DESC LIMIT 100`).all(user) as unknown as RefundRequest[]).map((r) => this.row(r)!);
  }

  madeSince(user: string, since: number): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM support_refunds WHERE user = ? AND created_at >= ?').get(user, since) as { n: number }).n;
  }

  /** The admin's queue: waiting first (oldest first), then the rest, newest first. */
  queue(status: string, limit: number): RefundRequest[] {
    const where = status ? 'WHERE status = ?' : '';
    const rows = this.sql.prepare(`SELECT ${COLS} FROM support_refunds ${where}
      ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, CASE WHEN status = 'pending' THEN created_at ELSE -updated_at END LIMIT ?`)
      .all(...(status ? [status, limit] : [limit])) as unknown as RefundRequest[];
    return rows.map((r) => this.row(r)!);
  }

  pendingCount(): number {
    return (this.sql.prepare("SELECT COUNT(*) AS n FROM support_refunds WHERE status = 'pending'").get() as { n: number }).n;
  }

  /** Moves a request on, only from one of the states given (false: it was not in one). */
  update(id: string, from: RefundStatus[], change: { status: RefundStatus; answer?: string; decidedBy?: string; providerRef?: string }): boolean {
    return this.sql.prepare(`UPDATE support_refunds SET status = ?, answer = COALESCE(?, answer), decided_by = COALESCE(?, decided_by), provider_ref = COALESCE(?, provider_ref), updated_at = ?
      WHERE id = ? AND status IN (${from.map(() => '?').join(', ')})`)
      .run(change.status, change.answer ?? null, change.decidedBy ?? null, change.providerRef ?? null, this.now(), id, ...from).changes > 0;
  }
}

export interface RefundDeps {
  sql: DatabaseSync;
  store: SupportStore;
  now: () => number;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  isAdmin: (userId: string) => boolean;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  /** Asking and cancelling, per account. */
  limit: (key: string) => void;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  /** A live event to the player's launchers (app.ts push). */
  notify: (userId: string, event: Record<string, unknown>) => void;
  handleOf: (userId: string) => string;
  /** The provider's API client for the payment's mode, or undefined when its keys are missing. */
  stripe: (mode: 'test' | 'live') => StripeClient | undefined;
  paypal: (mode: 'test' | 'live') => PayPalClient | undefined;
  /** support.ts: the payment is refunded and what it gave taken back (does nothing a second time). */
  takeBack: (p: Payment) => boolean;
  changed: (userId: string) => void;
  fail: (status: number, code: string) => never;
  /** The admin panel's settings, read when used: the window in days (never under 14) and requests a day. */
  windowDays?: () => number;
  perDay?: () => number;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '');

export function refundRoutes(d: RefundDeps) {
  const refunds = new RefundStore(d.sql, d.now);
  const fail = d.fail;
  const windowDays = () => d.windowDays?.() ?? REFUND_WINDOW_DAYS;
  const windowMsOf = () => windowDays() * DAY;

  /** Why the player cannot ask for this payment's refund on their own; '' when they can. */
  function blocked(p: Payment): string {
    if (p.mode !== 'live' || p.status !== 'paid' || p.refundedAt || !p.intent || (p.provider !== 'stripe' && p.provider !== 'paypal')) return 'not_refundable';
    if (!p.paidAt || d.now() - p.paidAt > windowMsOf()) return 'window_passed';
    return '';
  }

  const refundable = (p: Payment) => !blocked(p) && !refunds.open(p.id);
  const until = (p: Payment) => (p.paidAt ? p.paidAt + windowMsOf() : 0);

  /** What the player sees of their request: never who decided it. */
  const mine = (r: RefundRequest) => ({ id: r.id, payment: r.payment, reason: r.reason, guardian: r.guardian, status: r.status, answer: r.answer, createdAt: r.createdAt, updatedAt: r.updatedAt });

  function adminView(r: RefundRequest) {
    const p = d.store.payment(r.payment);
    return {
      ...mine(r), user: r.user, handle: d.handleOf(r.user), decidedBy: r.decidedBy ? d.handleOf(r.decidedBy) : '', providerRef: r.providerRef,
      payment: p ? {
        id: p.id, provider: p.provider, tier: p.tier, kind: p.kind, days: p.days, amount: p.amount, currency: p.currency, status: p.status, mode: p.mode,
        paidAt: p.paidAt || null, refundedAt: p.refundedAt || null, intent: p.intent, subscription: p.subscription, inWindow: !!p.paidAt && r.createdAt - p.paidAt <= windowMsOf(),
      } : null,
    };
  }

  function tell(r: RefundRequest) {
    d.notify(r.user, { type: 'support-refund', id: r.id, payment: r.payment, status: r.status, answer: r.answer });
  }

  /** support.ts: a payment was refunded (webhook or by hand): its open request is done. */
  function refunded(p: Payment) {
    const r = refunds.open(p.id);
    if (r && refunds.update(r.id, OPEN, { status: 'refunded' })) tell(refunds.get(r.id)!);
  }

  const requestOr404 = (id: string) => refunds.get(id) ?? fail(404, 'not_found');

  /** Asks the provider for the whole payment back; the request's id keeps a repeated call one refund. */
  async function issue(r: RefundRequest, p: Payment): Promise<string> {
    if (p.provider === 'stripe') {
      const client = d.stripe(p.mode) ?? fail(400, 'provider_not_configured');
      const res = await client.call<{ id?: string }>('POST', '/v1/refunds', {
        payment_intent: p.intent, amount: p.amount, reason: 'requested_by_customer', metadata: { payment: p.id, refund_request: r.id },
      }, r.id);
      return String(res.id ?? '');
    }
    const client = d.paypal(p.mode) ?? fail(400, 'provider_not_configured');
    if (!/^[A-Z0-9]{5,64}$/i.test(p.intent)) fail(400, 'not_refundable');
    const res = await client.call<{ id?: string }>('POST', `/v2/payments/captures/${p.intent}/refund`, {
      amount: { value: paypalValue(p.amount), currency_code: p.currency }, invoice_id: r.id, note_to_payer: 'SlashClient: zwrot wsparcia',
    }, r.id);
    return String(res.id ?? '');
  }

  const routes: [string, RegExp, Handler][] = [
    // the player's own requests
    ['GET', /^\/v1\/me\/support\/refunds$/, (req) => {
      const me = d.authed(req);
      return { refunds: refunds.of(me).map(mine), windowDays: windowDays() };
    }],
    ['GET', /^\/v1\/me\/support\/refunds\/(r_[\w-]{6,20})$/, (req, [id]) => {
      const me = d.authed(req);
      const r = refunds.get(id);
      // another player's request does not exist for them
      if (!r || (r.user !== me && !d.isAdmin(me))) fail(404, 'not_found');
      return { refund: r!.user === me ? mine(r!) : adminView(r!) };
    }],
    /**
     * A request for one payment: the player's own, live, paid, not refunded, at most
     * REFUND_WINDOW_DAYS old, without another request waiting; the end of its perks confirmed.
     */
    ['POST', /^\/v1\/me\/support\/refunds$/, async (req) => {
      const me = d.authed(req);
      d.limit(`refund:${me}`);
      const b = await d.body(req);
      const p = d.store.payment(String(b.payment ?? ''));
      if (!p || p.user !== me) fail(404, 'not_found');
      const why = blocked(p!);
      if (why) fail(400, why);
      if (refunds.open(p!.id)) fail(409, 'already_requested');
      if (b.confirm !== true) fail(400, 'confirm_required');
      if (refunds.madeSince(me, d.now() - DAY) >= (d.perDay?.() ?? MAX_PER_DAY)) fail(429, 'rate_limited');
      let r: RefundRequest;
      try {
        r = refunds.add({ payment: p!.id, user: me, reason: cleanText(b.reason, 500), guardian: b.guardian === true });
      } catch {
        // two at once: the unique index lets one in
        return fail(409, 'already_requested');
      }
      return { refund: mine(r) };
    }],
    ['POST', /^\/v1\/me\/support\/refunds\/(r_[\w-]{6,20})\/cancel$/, (req, [id]) => {
      const me = d.authed(req);
      d.limit(`refund:${me}`);
      const r = refunds.get(id);
      if (!r || r.user !== me) fail(404, 'not_found');
      if (!refunds.update(id, ['pending'], { status: 'cancelled' })) fail(409, 'not_pending');
      return { refund: mine(refunds.get(id)!) };
    }],

    // ---- the admin panel's "Wsparcie" → "Zwroty" ----
    ['GET', /^\/v1\/admin\/support\/refunds$/, (req, _p, url) => {
      d.admin(req);
      const status = url.searchParams.get('status') ?? '';
      if (status && !['pending', 'approved', 'rejected', 'refunded', 'cancelled'].includes(status)) fail(400, 'bad_status');
      return { refunds: refunds.queue(status, 200).map(adminView), pending: refunds.pendingCount(), windowDays: windowDays() };
    }],
    // "Zwróć": the refund at the provider; the webhook that follows takes the perks back
    ['POST', /^\/v1\/admin\/support\/refunds\/(r_[\w-]{6,20})\/refund$/, async (req, [id]) => {
      const me = d.admin(req);
      const r = requestOr404(id);
      if (r.status !== 'pending') fail(409, 'not_pending');
      const p = d.store.payment(r.payment) ?? fail(404, 'not_found');
      if (p.status === 'refunded') {
        refunded(p);
        return { refund: adminView(refunds.get(id)!) };
      }
      if (p.status !== 'paid' || !p.intent) fail(400, 'not_refundable');
      let ref: string;
      try {
        ref = await issue(r, p);
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        const message = scrub((err as Error).message);
        console.error(`wsparcie: zwrot ${r.id}: ${message}`);
        d.audit(me, 'support_refund_error', d.handleOf(r.user), `${r.id} (${p.id}): ${message.slice(0, 200)}`);
        return fail(424, 'provider_error');
      }
      // the webhook may have come already (it marks the request as refunded)
      refunds.update(id, ['pending'], { status: 'approved', decidedBy: me, providerRef: ref });
      const now = refunds.get(id)!;
      d.audit(me, 'support_refund', d.handleOf(r.user), `${r.id}: ${p.provider} ${p.id}, ${p.amount / 100} ${p.currency}${ref ? `, ${ref}` : ''}`);
      tell(now);
      return { refund: adminView(now) };
    }],
    ['POST', /^\/v1\/admin\/support\/refunds\/(r_[\w-]{6,20})\/reject$/, async (req, [id]) => {
      const me = d.admin(req);
      const r = requestOr404(id);
      const b = await d.body(req);
      const answer = cleanText(b.reason, 300);
      if (answer.length < 3) fail(400, 'reason_required');
      if (!refunds.update(id, ['pending'], { status: 'rejected', answer, decidedBy: me })) fail(409, 'not_pending');
      d.audit(me, 'support_refund_reject', d.handleOf(r.user), `${r.id} (${r.payment}): ${answer}`);
      tell(refunds.get(id)!);
      return { refund: adminView(refunds.get(id)!) };
    }],
    // "Oznacz jako zwrócone ręcznie": money returned outside the API; the perks end here
    ['POST', /^\/v1\/admin\/support\/refunds\/(r_[\w-]{6,20})\/manual$/, async (req, [id]) => {
      const me = d.admin(req);
      const r = requestOr404(id);
      const b = await d.body(req);
      const note = cleanText(b.note, 200);
      if (!OPEN.includes(r.status)) fail(409, 'not_pending');
      const p = d.store.payment(r.payment) ?? fail(404, 'not_found');
      let taken = false;
      d.store.transaction(() => {
        refunds.update(id, OPEN, { status: 'refunded', decidedBy: me });
        taken = d.takeBack(p);
      });
      d.audit(me, 'support_refund_manual', d.handleOf(r.user), `${r.id} (${p.id})${taken ? '' : ', płatność już była zwrócona'}${note ? `: ${note}` : ''}`);
      if (taken) d.changed(r.user);
      tell(refunds.get(id)!);
      return { refund: adminView(refunds.get(id)!) };
    }],
  ];

  return { routes, refunds, refundable, until, refunded, mine };
}
