import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { User } from '../db.ts';
import type { SecretBox } from '../storage.ts';
import { PAYPAL_API, capturePayPalOrder, createPayPalOrder, minorUnits, paypalClient, verifyPayPalWebhook } from './paypal.ts';
import { PaymentInfoStore, historyRoutes } from './history.ts';
import { REFUND_WINDOW_DAYS, refundRoutes } from './refunds.ts';
import { CURRENCIES, SupportStore, type Currency, type Grant, type Kind, type Payment, type Subscription, type Tier } from './store.ts';
import { STRIPE_API, ProviderError, createStripeCheckout, scrub, stripeClient, stripePortal, testStripe, verifyStripeSignature } from './stripe.ts';

/**
 * Supporting SlashClient with money: the "Wesprzyj" page's checkouts, the providers' webhooks, the
 * supporter tiers and what they give, the player's own view (/v1/me/support) and the admin
 * panel's "Wsparcie".
 *
 * Rules kept here:
 * - a webhook checked by its signature (Stripe) or by PayPal is the only thing that grants a tier;
 *   the page the player comes back to only shows the state;
 * - the amount and currency come from the tier on the server, and a paid amount that differs is
 *   kept as "mismatch" without a grant;
 * - each provider event is handled once (support_events), in one transaction with what it does;
 * - the providers' keys are sealed with STORAGE_SECRET_KEY (storage.ts's box) and never sent back;
 * - support gives looks and room, never an advantage in a game, and Iskry are never sold.
 */

export type ProviderId = 'stripe' | 'paypal';
export const PROVIDER_IDS: ProviderId[] = ['stripe', 'paypal'];
const KINDS: Kind[] = ['one_time', 'monthly'];
const DAY = 86_400_000;
/** Keys each provider needs, per mode; all write-only. */
const SECRET_FIELDS: Record<ProviderId, string[]> = { stripe: ['secretKey', 'webhookSecret'], paypal: ['clientId', 'clientSecret', 'webhookId'] };
const SECRET_FORMATS: Record<string, (mode: 'test' | 'live') => RegExp> = {
  'stripe.secretKey': (mode) => new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]{10,250}$`),
  'stripe.webhookSecret': () => /^whsec_[A-Za-z0-9+/=]{10,200}$/,
  'paypal.clientId': () => /^[A-Za-z0-9_-]{10,200}$/,
  'paypal.clientSecret': () => /^[A-Za-z0-9_-]{10,200}$/,
  'paypal.webhookId': () => /^[A-Z0-9]{5,64}$/,
};
/** Which fields show their last 4 characters in the panel (never the webhook secret or client secret). */
const HINTED = new Set(['stripe.secretKey', 'paypal.clientId', 'paypal.webhookId']);
const STRIPE_METHODS = ['card', 'blik', 'p24', 'link', 'paypal', 'revolut_pay', 'klarna', 'sepa_debit', 'bancontact', 'ideal', 'eps'];

export interface SupportContext {
  sql: DatabaseSync;
  /** storage.ts's box (STORAGE_SECRET_KEY); without it no keys can be saved. */
  box?: SecretBox;
  keyError?: string;
  publicUrl: string;
  user: (id: string) => User | undefined;
  userByHandle: (handle: string) => User | undefined;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  clientIp: (req: http.IncomingMessage) => string;
  /** Creating checkouts: per account and per address. */
  limitCheckout: (key: string) => void;
  limitWebhooks: (key: string) => void;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  /** A player's tier changed: their rank and cosmetics are sent again (app.ts's cosmeticsChanged). */
  changed: (userId: string) => void;
  fetchImpl?: typeof fetch;
  /** Refund requests (refunds.ts): asking and cancelling per account; a live event to the player; who is an admin. */
  limitRefunds?: (key: string) => void;
  notify?: (userId: string, event: Record<string, unknown>) => void;
  isAdmin?: (userId: string) => boolean;
  /** Tests: the fake providers' addresses and the clock. */
  apiBase?: { stripe?: string; paypal?: string };
  now?: () => number;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

/** What a player has now: the highest tier among their grants in force, and until when. */
export interface Active { tier: Tier; expiresAt: number | null; since: number }

const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : undefined);

export function supportRoutes(ctx: SupportContext) {
  const now = ctx.now ?? Date.now;
  const store = new SupportStore(ctx.sql, now);
  /** The method, the receipt, the amount refunded, a month's end: for the payment history (history.ts). */
  const info = new PaymentInfoStore(ctx.sql, now);
  const fail: (status: number, code: string) => never = ctx.fail;
  const base = ctx.publicUrl.replace(/\/$/, '');

  // ---------- providers ----------

  /** A provider's settings with its keys opened (only here, never sent anywhere but to the provider). */
  function provider(id: ProviderId) {
    const row = store.providerRow(id);
    const key = (mode: 'test' | 'live', field: string): string => {
      const sealed = row.secrets[`${mode}.${field}`];
      if (!sealed || !ctx.box) return '';
      try {
        return ctx.box.open(sealed, `support:${id}:${mode}:${field}`);
      } catch (err) {
        console.error(`wsparcie: klucz ${id}.${mode}.${field}: ${(err as Error).message}`);
        return '';
      }
    };
    const has = (mode: 'test' | 'live') => SECRET_FIELDS[id].every((f) => !!row.secrets[`${mode}.${f}`]);
    return { ...row, key, configured: has(row.mode), has };
  }

  /** Providers the page may offer: switched on and with the keys of their mode. */
  function ready(id: ProviderId) {
    const p = provider(id);
    return p.enabled && p.configured && !!ctx.box ? p : undefined;
  }

  const stripeOf = (mode: 'test' | 'live') => stripeClient({ secretKey: provider('stripe').key(mode, 'secretKey'), apiBase: ctx.apiBase?.stripe ?? STRIPE_API, fetchImpl: ctx.fetchImpl });
  const paypals = new Map<string, ReturnType<typeof paypalClient>>();
  function paypalOf(mode: 'test' | 'live') {
    const p = provider('paypal');
    const clientId = p.key(mode, 'clientId');
    const clientSecret = p.key(mode, 'clientSecret');
    const k = `${mode}:${clientId}:${clientSecret.length}:${p.updatedAt}`;
    let c = paypals.get(k);
    if (!c) {
      paypals.clear();
      c = paypalClient({ clientId, clientSecret, apiBase: ctx.apiBase?.paypal ?? PAYPAL_API[mode], fetchImpl: ctx.fetchImpl, now });
      paypals.set(k, c);
    }
    return c;
  }

  // ---------- who has what ----------

  const tierMap = () => new Map(store.tiers().map((t) => [t.id, t]));
  const inForce = (g: Grant, at: number) => !g.revokedAt && g.startsAt <= at && (g.expiresAt === null || g.expiresAt > at);

  function active(userId: string): Active | undefined {
    const at = now();
    const tiers = tierMap();
    const grants = store.grantsOf(userId);
    let best: Active | undefined;
    for (const g of grants) {
      const tier = tiers.get(g.tier);
      if (!tier || !inForce(g, at)) continue;
      if (!best || tier.level > best.tier.level) best = { tier, expiresAt: g.expiresAt, since: 0 };
      else if (tier.id === best.tier.id && best.expiresAt !== null) best.expiresAt = g.expiresAt === null ? null : Math.max(best.expiresAt, g.expiresAt);
    }
    if (best) best.since = sinceOf(grants);
    return best;
  }

  /** When the player first supported (grants taken back for a refund do not count). */
  const sinceOf = (grants: Grant[]) => grants.filter((g) => !g.revokedAt).reduce((m, g) => Math.min(m, g.startsAt), Infinity);
  const pastSupporter = (userId: string) => store.grantsOf(userId).some((g) => !g.revokedAt && g.startsAt <= now());

  /** What /v1/me and the launcher show: the tier in force, or that the player supported before. */
  function summary(userId: string) {
    const a = active(userId);
    if (a) {
      return { tier: a.tier.id, level: a.tier.level, name: a.tier.name, nameEn: a.tier.nameEn, color: a.tier.color, expiresAt: a.expiresAt, since: a.since, earlyAccess: a.tier.earlyAccess, past: false };
    }
    const grants = store.grantsOf(userId);
    return pastSupporter(userId) ? { tier: '', level: 0, name: '', nameEn: '', color: '', expiresAt: 0, since: sinceOf(grants), earlyAccess: false, past: true } : null;
  }

  /** The level for supporter-only cosmetics (cosmetics.ts `supporter`); 0 without a tier that gives them. */
  const cosmeticsLevel = (userId: string) => {
    const a = active(userId);
    return a?.tier.cosmetics ? a.tier.level : 0;
  };

  /** How many times larger the cloud profiles' and shared screenshots' limits are. */
  const limitFactor = (userId: string) => Math.max(1, active(userId)?.tier.limitFactor ?? 1);

  /** The badge colour for the game and the pages (null: not a supporter now). */
  const rank = (userId: string): { color: string; tier: string; name: string; nameEn: string } | undefined => {
    const a = active(userId);
    return a ? { color: a.tier.color, tier: a.tier.id, name: a.tier.name, nameEn: a.tier.nameEn } : undefined;
  };

  /**
   * What the public profile shows (profiles.ts adds it to what the visitor may see at all): the
   * tier with its colour for the avatar frame, "supporting since", or "supported" for one who did.
   * The player can switch it off.
   */
  function profileDecor(userId: string) {
    if (!store.prefs(userId).profile) return undefined;
    const a = active(userId);
    if (a) return { active: true, tier: a.tier.id, name: a.tier.name, nameEn: a.tier.nameEn, color: a.tier.color, since: a.since, frame: a.tier.profile };
    return pastSupporter(userId) ? { active: false, past: true, since: sinceOf(store.grantsOf(userId)) } : undefined;
  }

  // ---------- grants ----------

  const graceDays = () => {
    const n = Number(store.config('grace_days') ?? 3);
    return Number.isInteger(n) && n >= 0 && n <= 30 ? n : 3;
  };

  /** The latest end of the tier's grants in force (one-time support bought again continues from there). */
  function latestEnd(userId: string, tier: string): number {
    const at = now();
    return store.grantsOf(userId).filter((g) => g.tier === tier && inForce(g, at) && g.expiresAt !== null && g.source !== 'subscription')
      .reduce((m, g) => Math.max(m, g.expiresAt!), at);
  }

  function grantForPayment(p: Payment) {
    store.addGrant({ user: p.user, tier: p.tier, source: 'payment', ref: p.id, startsAt: now(), expiresAt: latestEnd(p.user, p.tier) + p.days * DAY, note: '', by: '' });
  }

  /** A paid month: the subscription's grant runs to the end of the period, plus the grace days. */
  function extendSubscription(sub: Subscription, until: number) {
    const current = store.grantsByRef('subscription', sub.id).filter((g) => !g.revokedAt).sort((a, b) => b.id - a.id)[0];
    if (current) store.setGrantExpiry(current.id, Math.max(current.expiresAt ?? 0, until));
    else store.addGrant({ user: sub.user, tier: sub.tier, source: 'subscription', ref: sub.id, startsAt: now(), expiresAt: until, note: '', by: '' });
  }

  /** The money came: checked against what was asked for, then the tier is granted (once). */
  function settle(p: Payment, amount: number, currency: string, intent: string): boolean {
    if (p.status !== 'pending') return false;
    if (amount !== p.amount || String(currency).toUpperCase() !== p.currency) {
      store.updatePayment(p.id, { status: 'mismatch', intent, paidAt: now(), note: `zapłacono ${amount} ${String(currency).toUpperCase()}, oczekiwano ${p.amount} ${p.currency}` });
      console.error(`wsparcie: płatność ${p.id}: kwota się nie zgadza (${amount} ${currency})`);
      return false;
    }
    store.updatePayment(p.id, { status: 'paid', intent, paidAt: now() });
    grantForPayment(p);
    return true;
  }

  /** A refund or a chargeback takes back what that payment gave. */
  function takeBack(p: Payment, status: 'refunded' | 'disputed') {
    if (p.status !== 'paid' && p.status !== 'mismatch') return false;
    store.updatePayment(p.id, { status, refundedAt: now() });
    if (status === 'refunded') refunds.refunded(p);
    const reason = status === 'refunded' ? 'zwrot płatności' : 'płatność zakwestionowana';
    if (p.kind === 'one_time') for (const g of store.grantsByRef('payment', p.id)) store.revokeGrant(g.id, reason);
    else if (p.subscription) for (const g of store.grantsByRef('subscription', p.subscription)) store.revokeGrant(g.id, reason);
    return true;
  }

  // ---------- Stripe's events ----------

  type Outcome = 'done' | 'ignored' | 'retry';

  function stripeEvent(event: Record<string, any>, mode: 'test' | 'live'): { outcome: Outcome; user?: string } {
    const o = event.data?.object ?? {};
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const p = store.payment(String(o.metadata?.payment ?? o.client_reference_id ?? ''));
        if (!p || p.provider !== 'stripe' || p.ref !== o.id) return { outcome: 'ignored' };
        if (typeof o.customer === 'string' && o.customer) {
          store.setCustomer(p.user, 'stripe', mode, o.customer);
          store.updatePayment(p.id, { customer: o.customer });
        }
        if (o.mode === 'subscription') {
          const subId = typeof o.subscription === 'string' ? o.subscription : o.subscription?.id;
          if (!subId) return { outcome: 'ignored' };
          if (p.status === 'pending') store.updatePayment(p.id, { status: 'subscribed', subscription: subId });
          const was = store.subscription(subId);
          store.saveSubscription({
            id: subId, provider: 'stripe', user: p.user, tier: p.tier, status: was?.status ?? 'active', amount: p.amount, currency: p.currency,
            periodEnd: was?.periodEnd ?? 0, cancelAtPeriodEnd: was?.cancelAtPeriodEnd ?? false, customer: String(o.customer ?? ''), payment: p.id, mode,
            createdAt: was?.createdAt ?? now(), updatedAt: now(),
          });
          return { outcome: 'done', user: p.user };
        }
        if (o.payment_status !== 'paid' && event.type !== 'checkout.session.async_payment_succeeded') return { outcome: 'done' };
        const intent = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id ?? '';
        return { outcome: settle(p, Number(o.amount_total), String(o.currency ?? ''), intent) ? 'done' : 'ignored', user: p.user };
      }
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const p = store.payment(String(o.metadata?.payment ?? o.client_reference_id ?? ''));
        if (!p || p.provider !== 'stripe' || p.ref !== o.id || p.status !== 'pending') return { outcome: 'ignored' };
        store.updatePayment(p.id, { status: event.type === 'checkout.session.expired' ? 'expired' : 'failed' });
        return { outcome: 'done' };
      }
      case 'invoice.paid': {
        // the subscription's id and our metadata: where they are depends on the webhook's API version
        const subId = String(o.subscription?.id ?? o.subscription ?? o.parent?.subscription_details?.subscription ?? '');
        const meta = o.subscription_details?.metadata ?? o.parent?.subscription_details?.metadata ?? {};
        if (!subId) return { outcome: 'ignored' };
        let sub = store.subscription(subId);
        const checkout = store.payment(String(meta.payment ?? sub?.payment ?? ''));
        if (!sub) {
          // the invoice came before the checkout's own event: made from the checkout's payment
          if (!checkout || checkout.provider !== 'stripe' || checkout.kind !== 'monthly') return { outcome: 'retry' };
          sub = {
            id: subId, provider: 'stripe', user: checkout.user, tier: checkout.tier, status: 'active', amount: checkout.amount, currency: checkout.currency,
            periodEnd: 0, cancelAtPeriodEnd: false, customer: String(o.customer ?? ''), payment: checkout.id, mode, createdAt: now(), updatedAt: now(),
          };
          if (checkout.status === 'pending') store.updatePayment(checkout.id, { status: 'subscribed', subscription: subId });
        }
        if (store.paymentByRef('stripe', String(o.id))) return { outcome: 'ignored' };
        const paid = Number(o.amount_paid);
        const currency = String(o.currency ?? '').toUpperCase();
        const ok = paid === sub.amount && currency === sub.currency;
        const lineEnd = Number(o.lines?.data?.[0]?.period?.end ?? 0);
        const periodEnd = (lineEnd || Number(o.period_end ?? 0)) * 1000;
        const intent = String(o.payment_intent?.id ?? o.payment_intent ?? o.payments?.data?.[0]?.payment?.payment_intent ?? '');
        const row = store.newPayment({ provider: 'stripe', ref: String(o.id), user: sub.user, tier: sub.tier, kind: 'monthly', quantity: 1, days: 0, amount: paid, currency: currency as Currency, mode, customer: String(o.customer ?? ''), status: ok ? 'paid' : 'mismatch' });
        store.updatePayment(row.id, { paidAt: now(), intent, subscription: subId, ...(ok ? {} : { note: `zapłacono ${paid} ${currency}, oczekiwano ${sub.amount} ${sub.currency}` }) });
        info.note(row.id, { receiptUrl: String(o.hosted_invoice_url ?? ''), periodEnd });
        store.saveSubscription({ ...sub, status: 'active', periodEnd: Math.max(sub.periodEnd, periodEnd), updatedAt: now() });
        if (ok && periodEnd > now()) extendSubscription(sub, periodEnd + graceDays() * DAY);
        return { outcome: 'done', user: sub.user };
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = store.subscription(String(o.id ?? ''));
        if (!sub) return { outcome: 'ignored' };
        const periodEnd = Number(o.current_period_end ?? o.items?.data?.[0]?.current_period_end ?? 0) * 1000 || sub.periodEnd;
        const deleted = event.type === 'customer.subscription.deleted';
        store.saveSubscription({ ...sub, status: deleted ? 'canceled' : String(o.status ?? sub.status), periodEnd, cancelAtPeriodEnd: !!o.cancel_at_period_end, updatedAt: now() });
        if (deleted) {
          // what was paid for stays until the period's end; the grace days are only for a renewal on its way
          for (const g of store.grantsByRef('subscription', sub.id)) {
            if (!g.revokedAt && (g.expiresAt === null || g.expiresAt > now())) store.setGrantExpiry(g.id, Math.min(g.expiresAt ?? Infinity, Math.max(now(), periodEnd)));
          }
        }
        return { outcome: 'done', user: sub.user };
      }
      case 'charge.refunded':
      case 'charge.dispute.created': {
        const intent = String(o.payment_intent?.id ?? o.payment_intent ?? '');
        const p = store.paymentByIntent('stripe', intent) ?? store.paymentByRef('stripe', String(o.invoice?.id ?? o.invoice ?? ''));
        if (!p) {
          console.error(`wsparcie: ${event.type} bez znanej płatności (${intent || 'brak payment_intent'})`);
          return { outcome: 'ignored' };
        }
        if (event.type === 'charge.refunded') info.note(p.id, { refundedAmount: Number(o.amount_refunded), receiptUrl: String(o.receipt_url ?? ''), method: String(o.payment_method_details?.type ?? '') });
        return { outcome: takeBack(p, event.type === 'charge.refunded' ? 'refunded' : 'disputed') ? 'done' : 'ignored', user: p.user };
      }
      default:
        return { outcome: 'ignored' };
    }
  }

  // ---------- PayPal's events ----------

  function paypalEvent(event: Record<string, any>): { outcome: Outcome; user?: string } {
    const r = event.resource ?? {};
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const p = store.payment(String(r.custom_id ?? ''));
        if (!p || p.provider !== 'paypal') return { outcome: 'ignored' };
        const order = r.supplementary_data?.related_ids?.order_id;
        if (order && order !== p.ref) return { outcome: 'ignored' };
        return { outcome: settle(p, minorUnits(r.amount?.value), String(r.amount?.currency_code ?? ''), String(r.id ?? '')) ? 'done' : 'ignored', user: p.user };
      }
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED': {
        const p = store.payment(String(r.custom_id ?? ''));
        if (!p || p.provider !== 'paypal' || p.status !== 'pending') return { outcome: 'ignored' };
        store.updatePayment(p.id, { status: 'failed' });
        return { outcome: 'done' };
      }
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        // a refund names its capture in the "up" link; a reversed capture is the capture itself
        const up = (r.links as { rel: string; href: string }[] | undefined)?.find((l) => l.rel === 'up')?.href ?? '';
        const capture = /\/captures\/([A-Z0-9]+)/i.exec(up)?.[1] ?? String(r.id ?? '');
        const p = store.paymentByIntent('paypal', capture) ?? (r.custom_id ? store.payment(String(r.custom_id)) : undefined);
        if (!p || p.provider !== 'paypal') return { outcome: 'ignored' };
        if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') info.note(p.id, { refundedAmount: (p.status === 'refunded' ? info.get(p.id).refundedAmount : 0) + (minorUnits(r.amount?.value) || 0) });
        return { outcome: takeBack(p, event.event_type === 'PAYMENT.CAPTURE.REFUNDED' ? 'refunded' : 'disputed') ? 'done' : 'ignored', user: p.user };
      }
      default:
        return { outcome: 'ignored' };
    }
  }

  /** Runs an event once: noted as handled together with what it changed, or not at all. */
  function once(providerId: ProviderId, eventId: string, type: string, run: () => { outcome: Outcome; user?: string }): Outcome {
    let user: string | undefined;
    let outcome: Outcome = 'ignored';
    try {
      store.transaction(() => {
        if (!store.claimEvent(providerId, eventId, type)) {
          outcome = 'ignored';
          return;
        }
        const r = run();
        if (r.outcome === 'retry') throw new RetryLater();
        outcome = r.outcome;
        user = r.user;
      });
    } catch (err) {
      if (err instanceof RetryLater) return 'retry';
      throw err;
    }
    if (user) ctx.changed(user);
    return outcome;
  }

  // ---------- raw requests: webhooks and PayPal's way back ----------

  async function rawBody(req: http.IncomingMessage, max: number): Promise<Buffer | undefined> {
    if (Number(req.headers['content-length']) > max) {
      req.resume();
      return undefined;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) return undefined;
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const hook = /^\/v1\/payments\/(stripe|paypal)\/webhook$/.exec(url.pathname);
    if (hook && req.method === 'POST') {
      try {
        ctx.limitWebhooks(`hook:${ctx.clientIp(req)}`);
      } catch {
        json(res, 429, { error: 'rate_limited' });
        return true;
      }
      const raw = await rawBody(req, 512 * 1024);
      if (!raw) {
        json(res, 413, { error: 'too_large' });
        return true;
      }
      const id = hook[1] as ProviderId;
      const p = provider(id);
      if (!p.enabled || !p.has(p.mode) || !ctx.box) {
        json(res, 503, { error: 'provider_disabled' });
        return true;
      }
      let event: Record<string, any>;
      let outcome: Outcome;
      if (id === 'stripe') {
        const check = verifyStripeSignature(raw, req.headers['stripe-signature'] as string | undefined, p.key(p.mode, 'webhookSecret'), now());
        if (!check.ok) {
          console.error(`wsparcie: odrzucony webhook Stripe (${check.reason})`);
          json(res, 400, { error: 'bad_signature' });
          return true;
        }
        try {
          event = JSON.parse(raw.toString('utf8'));
        } catch {
          json(res, 400, { error: 'bad_request' });
          return true;
        }
        if (typeof event.id !== 'string' || typeof event.type !== 'string') {
          json(res, 400, { error: 'bad_request' });
          return true;
        }
        // an event of the other mode (a test key's webhook while live) does nothing
        if (!!event.livemode !== (p.mode === 'live')) {
          json(res, 200, { received: true, ignored: 'mode' });
          return true;
        }
        outcome = once('stripe', event.id, event.type, () => stripeEvent(event, p.mode));
      } else {
        const text = raw.toString('utf8');
        let check: { ok: boolean; reason?: string };
        try {
          check = await verifyPayPalWebhook(paypalOf(p.mode), req.headers, text, p.key(p.mode, 'webhookId'), now());
        } catch (err) {
          console.error(`wsparcie: weryfikacja webhooka PayPal: ${scrub((err as Error).message)}`);
          json(res, 503, { error: 'provider_error' });
          return true;
        }
        if (!check.ok) {
          console.error(`wsparcie: odrzucony webhook PayPal (${check.reason})`);
          json(res, 400, { error: 'bad_signature' });
          return true;
        }
        event = JSON.parse(text);
        if (typeof event.id !== 'string' || typeof event.event_type !== 'string') {
          json(res, 400, { error: 'bad_request' });
          return true;
        }
        // an approved order whose player did not come back to us: taken here (PayPal-Request-Id keeps it one capture)
        if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
          const pay = store.paymentByRef('paypal', String(event.resource?.id ?? ''));
          if (pay?.status === 'pending') {
            try {
              await capturePayPalOrder(paypalOf(p.mode), pay.ref, pay.id);
            } catch (err) {
              console.error(`wsparcie: przechwycenie zamówienia PayPal ${pay.id}: ${scrub((err as Error).message)}`);
            }
          }
        }
        outcome = once('paypal', event.id, event.event_type, () => paypalEvent(event));
      }
      if (outcome === 'retry') json(res, 503, { error: 'retry_later' });
      else json(res, 200, { received: true });
      return true;
    }

    // PayPal sends the player back here after approving: the order is captured, then the thank-you page;
    // the tier comes with PayPal's webhook, not with this visit
    if (url.pathname === '/v1/payments/paypal/return' && req.method === 'GET') {
      const pay = store.payment(url.searchParams.get('p') ?? '');
      const p = provider('paypal');
      if (pay && pay.provider === 'paypal' && pay.status === 'pending' && pay.ref === url.searchParams.get('token') && p.has(pay.mode) && ctx.box) {
        try {
          await capturePayPalOrder(paypalOf(pay.mode), pay.ref, pay.id);
        } catch (err) {
          console.error(`wsparcie: przechwycenie zamówienia PayPal ${pay.id}: ${scrub((err as Error).message)}`);
        }
      }
      res.writeHead(302, { Location: `/wsparcie/dziekujemy${pay ? `?p=${encodeURIComponent(pay.id)}` : ''}`, 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    return false;
  }

  // ---------- views ----------

  const tierPrices = (t: Tier, kind: Kind) => {
    const pln = kind === 'one_time' ? t.oneTimePln : t.monthlyPln;
    const eur = kind === 'one_time' ? t.oneTimeEur : t.monthlyEur;
    if (!pln && !eur) return null;
    return { ...(pln ? { PLN: pln } : {}), ...(eur ? { EUR: eur } : {}), ...(kind === 'one_time' ? { days: t.days } : {}) };
  };
  const publicTier = (t: Tier) => ({
    id: t.id, level: t.level, name: t.name, nameEn: t.nameEn || t.name, color: t.color,
    perks: t.perks.split('\n').map((s) => s.trim()).filter(Boolean), perksEn: (t.perksEn || t.perks).split('\n').map((s) => s.trim()).filter(Boolean),
    oneTime: tierPrices(t, 'one_time'), monthly: tierPrices(t, 'monthly'), limitFactor: t.limitFactor, earlyAccess: t.earlyAccess,
  });
  const userView = (p: Payment) => ({
    id: p.id, provider: p.provider, tier: p.tier, kind: p.kind, quantity: p.quantity, days: p.days, amount: p.amount, currency: p.currency, status: p.status,
    test: p.mode === 'test', createdAt: p.createdAt, paidAt: p.paidAt || null, refundedAt: p.refundedAt || null,
  });
  const grantView = (g: Grant) => ({ id: g.id, tier: g.tier, source: g.source, startsAt: g.startsAt, expiresAt: g.expiresAt, revokedAt: g.revokedAt || null, revokedReason: g.revokedReason, note: g.note });

  function providerView(id: ProviderId) {
    const p = provider(id);
    const keys = (mode: 'test' | 'live') => Object.fromEntries(SECRET_FIELDS[id].map((f) => [f, { set: !!p.secrets[`${mode}.${f}`], hint: p.hints[`${mode}.${f}`] ?? '' }]));
    return {
      id, enabled: p.enabled, mode: p.mode, configured: p.configured, settings: p.settings, keys: { test: keys('test'), live: keys('live') },
      monthly: id === 'stripe', webhookUrl: `${base}/v1/payments/${id}/webhook`, updatedAt: p.updatedAt,
    };
  }

  // ---------- checking the admin's input ----------

  const amountOf = (v: unknown): number => {
    const n = Number(v ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000 || (n > 0 && n < 200)) fail(400, 'bad_price');
    return n;
  };

  function tierFrom(b: Record<string, unknown>, was?: Tier): Tier {
    const id = was?.id ?? cleanText(b.id, 30) ?? '';
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(id)) fail(400, 'bad_tier_id');
    const level = Number(b.level ?? was?.level);
    if (!Number.isInteger(level) || level < 1 || level > 9) fail(400, 'bad_level');
    const name = cleanText(b.name, 40) ?? was?.name ?? '';
    if (!name) fail(400, 'bad_name');
    const color = cleanText(b.color, 7) ?? was?.color ?? '';
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) fail(400, 'bad_color');
    const days = Number(b.days ?? was?.days ?? 30);
    if (!Number.isInteger(days) || days < 1 || days > 366) fail(400, 'bad_days');
    const limitFactor = Number(b.limitFactor ?? was?.limitFactor ?? 1);
    if (!Number.isFinite(limitFactor) || limitFactor < 1 || limitFactor > 10) fail(400, 'bad_limit_factor');
    const flag = (k: keyof Tier, dflt: boolean) => (typeof b[k] === 'boolean' ? (b[k] as boolean) : ((was?.[k] as boolean | undefined) ?? dflt));
    const t: Tier = {
      id, level, name, nameEn: cleanText(b.nameEn, 40) ?? was?.nameEn ?? '', color: color.toLowerCase(),
      perks: cleanText(b.perks, 1000) ?? was?.perks ?? '', perksEn: cleanText(b.perksEn, 1000) ?? was?.perksEn ?? '',
      oneTimePln: b.oneTimePln === undefined ? was?.oneTimePln ?? 0 : amountOf(b.oneTimePln),
      oneTimeEur: b.oneTimeEur === undefined ? was?.oneTimeEur ?? 0 : amountOf(b.oneTimeEur),
      monthlyPln: b.monthlyPln === undefined ? was?.monthlyPln ?? 0 : amountOf(b.monthlyPln),
      monthlyEur: b.monthlyEur === undefined ? was?.monthlyEur ?? 0 : amountOf(b.monthlyEur),
      days, limitFactor: Math.round(limitFactor * 10) / 10,
      cosmetics: flag('cosmetics', true), profile: flag('profile', true), earlyAccess: flag('earlyAccess', false), enabled: flag('enabled', true),
      createdAt: was?.createdAt ?? now(), updatedAt: now(),
    };
    return t;
  }

  const providerOr404 = (raw: string): ProviderId => (PROVIDER_IDS.includes(raw as ProviderId) ? (raw as ProviderId) : fail(404, 'not_found'));
  const grantOr404 = (raw: string) => store.grant(Number(raw)) ?? fail(404, 'not_found');
  const handleOf = (id: string) => ctx.user(id)?.handle ?? '';

  // ---------- routes ----------

  const routes: [string, RegExp, Handler][] = [
    // what the "Wesprzyj" page offers: tiers with prices, and which providers can take them
    ['GET', /^\/v1\/support$/, () => {
      const providers = PROVIDER_IDS.flatMap((id) => {
        const p = ready(id);
        return p ? [{ id, monthly: id === 'stripe', test: p.mode === 'test' }] : [];
      });
      return { tiers: store.tiers().filter((t) => t.enabled && (t.oneTimePln || t.oneTimeEur || t.monthlyPln || t.monthlyEur)).map(publicTier), providers, test: providers.some((p) => p.test) };
    }],
    // the supporters wall: only players who chose to be on it
    ['GET', /^\/v1\/support\/wall$/, () => {
      const out = [];
      for (const id of store.wallUsers()) {
        const u = ctx.user(id);
        if (!u || u.banned) continue;
        const a = active(id);
        if (a) out.push({ name: u.name, handle: u.handle, active: true, tier: a.tier.id, tierName: a.tier.name, tierNameEn: a.tier.nameEn || a.tier.name, color: a.tier.color, level: a.tier.level, since: a.since });
        else if (pastSupporter(id)) out.push({ name: u.name, handle: u.handle, active: false, tier: '', tierName: '', tierNameEn: '', color: '', level: 0, since: sinceOf(store.grantsOf(id)) });
      }
      out.sort((a, b) => b.level - a.level || a.since - b.since);
      return { supporters: out.slice(0, 500) };
    }],
    // the player's own: tier, grants, payments, subscriptions, choices
    ['GET', /^\/v1\/me\/support$/, (req) => {
      const me = ctx.authed(req);
      const stripe = ready('stripe');
      return {
        supporter: summary(me), grants: store.grantsOf(me).map(grantView),
        // which payments can be asked back on the account page, and until when (refunds.ts)
        payments: store.paymentsOf(me).map((p) => ({ ...userView(p), refundable: refunds.refundable(p), refundUntil: refunds.until(p) || null })),
        refunds: refunds.refunds.of(me).map(refunds.mine), refundWindowDays: REFUND_WINDOW_DAYS,
        subscriptions: store.subscriptionsOf(me).map((s) => ({ id: s.id, provider: s.provider, tier: s.tier, status: s.status, amount: s.amount, currency: s.currency, periodEnd: s.periodEnd || null, cancelAtPeriodEnd: s.cancelAtPeriodEnd, test: s.mode === 'test' })),
        prefs: store.prefs(me), portal: !!stripe && !!store.customer(me, 'stripe', stripe.mode),
      };
    }],
    ['POST', /^\/v1\/me\/support\/prefs$/, async (req) => {
      const me = ctx.authed(req);
      const b = await ctx.body(req);
      const was = store.prefs(me);
      store.setPrefs(me, { wall: typeof b.wall === 'boolean' ? b.wall : was.wall, profile: typeof b.profile === 'boolean' ? b.profile : was.profile });
      return { prefs: store.prefs(me) };
    }],
    // one payment of the player's: the thank-you page asks until the webhook has come
    ['GET', /^\/v1\/support\/payments\/(p_[\w-]{6,20})$/, (req, [id]) => {
      const me = ctx.authed(req);
      const p = store.payment(id);
      if (!p || p.user !== me) fail(404, 'not_found');
      const sub = p.subscription ? store.subscription(p.subscription) : undefined;
      return { payment: userView(p), granted: p.status === 'paid' || (p.status === 'subscribed' && !!sub && store.grantsByRef('subscription', sub.id).some((g) => !g.revokedAt)), supporter: summary(me) };
    }],
    /**
     * A checkout at the provider for a tier: the price from the tier here (the page sends only
     * which tier, how, and for how many months), the player signed in (Bearer, so no CSRF through
     * cookies), the terms and the guardian's consent ticked.
     */
    ['POST', /^\/v1\/support\/checkout$/, async (req) => {
      const me = ctx.authed(req);
      ctx.limitCheckout(`checkout:${me}`);
      ctx.limitCheckout(`checkout-ip:${ctx.clientIp(req)}`);
      const b = await ctx.body(req);
      const providerId = PROVIDER_IDS.includes(b.provider as ProviderId) ? (b.provider as ProviderId) : fail(400, 'bad_provider');
      const p = ready(providerId) ?? fail(400, 'provider_disabled');
      const kind = KINDS.includes(b.kind as Kind) ? (b.kind as Kind) : fail(400, 'bad_kind');
      if (kind === 'monthly' && providerId !== 'stripe') fail(400, 'monthly_unsupported');
      const currency = (b.currency === undefined ? 'PLN' : b.currency) as Currency;
      if (!CURRENCIES.includes(currency)) fail(400, 'bad_currency');
      const tier = store.tier(String(b.tier ?? ''));
      if (!tier || !tier.enabled) fail(400, 'bad_tier');
      const price = { one_time: { PLN: tier.oneTimePln, EUR: tier.oneTimeEur }, monthly: { PLN: tier.monthlyPln, EUR: tier.monthlyEur } }[kind][currency];
      if (!price) fail(400, 'not_offered');
      const quantity = kind === 'monthly' ? 1 : b.quantity === undefined ? 1 : Number(b.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 12) fail(400, 'bad_quantity');
      if (b.terms !== true || b.consent !== true) fail(400, 'consent_required');
      const user = ctx.user(me)!;
      // one subscription at a time: a change goes through the customer portal
      if (kind === 'monthly' && store.subscriptionsOf(me).some((s) => s.mode === p.mode && ['active', 'trialing', 'past_due'].includes(s.status))) fail(409, 'already_subscribed');
      const amount = price * quantity;
      const days = kind === 'one_time' ? tier.days * quantity : 0;
      const customer = providerId === 'stripe' ? store.customer(me, 'stripe', p.mode) : '';
      const pay = store.newPayment({ provider: providerId, ref: '', user: me, tier: tier.id, kind, quantity, days, amount, currency, mode: p.mode, customer, consentAt: now() });
      const productName = kind === 'monthly' ? `SlashClient – ${tier.name} (co miesiąc)` : `SlashClient – ${tier.name} (${days} dni)`;
      const en = typeof b.lang === 'string' && b.lang === 'en';
      try {
        let made: { id: string; url: string };
        if (providerId === 'stripe') {
          const methods = String(p.settings.paymentMethods ?? '').split(',').map((s) => s.trim()).filter((m) => STRIPE_METHODS.includes(m));
          made = await createStripeCheckout(stripeOf(p.mode), {
            paymentId: pay.id, user: me, tier: tier.id, kind, amount, currency, productName,
            successUrl: `${base}/wsparcie/dziekujemy?p=${pay.id}`, cancelUrl: `${base}/wsparcie/anulowano?p=${pay.id}`,
            customer: customer || undefined, paymentMethods: methods, locale: en ? 'en' : 'pl',
          });
        } else {
          made = await createPayPalOrder(paypalOf(p.mode), {
            paymentId: pay.id, amount, currency, description: `${productName} @${user.handle}`,
            returnUrl: `${base}/v1/payments/paypal/return?p=${pay.id}`, cancelUrl: `${base}/wsparcie/anulowano?p=${pay.id}`, locale: en ? 'en-GB' : 'pl-PL',
          });
        }
        store.updatePayment(pay.id, { ref: made.id });
        return { url: made.url, payment: pay.id };
      } catch (err) {
        store.updatePayment(pay.id, { status: 'failed', note: 'nie udało się założyć płatności' });
        console.error(`wsparcie: płatność ${pay.id}: ${scrub((err as Error).message)}`);
        return fail(502, 'provider_error');
      }
    }],
    // Stripe's customer portal: the subscription, the card, the invoices, cancelling
    ['POST', /^\/v1\/support\/portal$/, async (req) => {
      const me = ctx.authed(req);
      ctx.limitCheckout(`portal:${me}`);
      const p = ready('stripe') ?? fail(400, 'provider_disabled');
      const customer = store.customer(me, 'stripe', p.mode) || fail(404, 'no_customer');
      try {
        return { url: await stripePortal(stripeOf(p.mode), customer, `${base}/konto#wsparcie`) };
      } catch (err) {
        console.error(`wsparcie: portal: ${scrub((err as Error).message)}`);
        return fail(502, 'provider_error');
      }
    }],

    // ---- the admin panel's "Wsparcie" ----
    ['GET', /^\/v1\/admin\/support$/, (req) => {
      ctx.admin(req);
      const at = now();
      let activeSupporters = 0;
      for (const id of store.grantedUsers(5000)) if (store.grantsOf(id).some((g) => inForce(g, at))) activeSupporters++;
      const subs = (ctx.sql.prepare("SELECT COUNT(*) AS n FROM support_subscriptions WHERE status IN ('active', 'trialing', 'past_due') AND mode = 'live'").get() as { n: number }).n;
      return {
        providers: PROVIDER_IDS.map(providerView), tiers: store.tiers(), graceDays: graceDays(),
        keyReady: !!ctx.box, keyError: ctx.keyError ?? null, revenue: store.revenue(), activeSupporters, activeSubscriptions: subs, pendingRefunds: refunds.refunds.pendingCount(),
      };
    }],
    // a provider's settings; keys are write-only: '' or missing keeps one, null removes it
    ['POST', /^\/v1\/admin\/support\/providers\/(\w+)$/, async (req, [raw]) => {
      const me = ctx.admin(req);
      const id = providerOr404(raw);
      const b = await ctx.body(req);
      const was = store.providerRow(id);
      const next = { enabled: was.enabled, mode: was.mode, settings: { ...was.settings }, secrets: { ...was.secrets }, hints: { ...was.hints } };
      const changed: string[] = [];
      if (b.mode !== undefined) {
        if (b.mode !== 'test' && b.mode !== 'live') fail(400, 'bad_mode');
        if (b.mode !== was.mode) changed.push(`tryb: ${b.mode}`);
        next.mode = b.mode;
      }
      if (id === 'stripe' && b.paymentMethods !== undefined) {
        const list = String(b.paymentMethods ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        if (list.some((m) => !STRIPE_METHODS.includes(m))) fail(400, 'bad_methods');
        next.settings.paymentMethods = list.join(',');
        changed.push('metody płatności');
      }
      for (const mode of ['test', 'live'] as const) {
        const given = b[mode];
        if (given === undefined || given === null) continue;
        if (typeof given !== 'object') fail(400, 'bad_request');
        for (const field of SECRET_FIELDS[id]) {
          const v = (given as Record<string, unknown>)[field];
          const k = `${mode}.${field}`;
          if (v === null) {
            delete next.secrets[k];
            delete next.hints[k];
            changed.push(`usunięto ${k}`);
            continue;
          }
          if (v === undefined || v === '') continue;
          if (typeof v !== 'string' || !SECRET_FORMATS[`${id}.${field}`](mode).test(v.trim())) fail(400, `bad_${field}`);
          if (!ctx.box) fail(503, 'secret_key_missing');
          next.secrets[k] = ctx.box.seal(v.trim(), `support:${id}:${mode}:${field}`);
          if (HINTED.has(`${id}.${field}`)) next.hints[k] = v.trim().slice(-4);
          changed.push(k);
        }
      }
      if (typeof b.enabled === 'boolean') {
        if (b.enabled && !SECRET_FIELDS[id].every((f) => !!next.secrets[`${next.mode}.${f}`])) fail(400, 'provider_not_configured');
        if (b.enabled !== was.enabled) changed.push(b.enabled ? 'włączono' : 'wyłączono');
        next.enabled = b.enabled;
      } else if (next.enabled && !SECRET_FIELDS[id].every((f) => !!next.secrets[`${next.mode}.${f}`])) next.enabled = false;
      store.saveProvider(id, next);
      paypals.clear();
      // which fields changed, never their values
      if (changed.length) ctx.audit(me, 'support_provider', id, changed.join(', '));
      return { provider: providerView(id) };
    }],
    // "Test połączenia": the keys of the mode in use work at the provider
    ['POST', /^\/v1\/admin\/support\/providers\/(\w+)\/test$/, async (req, [raw]) => {
      const me = ctx.admin(req);
      const id = providerOr404(raw);
      const p = provider(id);
      if (!ctx.box) fail(503, 'secret_key_missing');
      if (!p.has(p.mode)) fail(400, 'provider_not_configured');
      try {
        if (id === 'stripe') {
          const r = await testStripe(stripeOf(p.mode));
          if (r.livemode !== (p.mode === 'live')) return { ok: false, message: 'Klucz jest z innego trybu niż wybrany.' };
        } else await paypalOf(p.mode).token();
        ctx.audit(me, 'support_test', id, `${p.mode}: OK`);
        return { ok: true };
      } catch (err) {
        const message = scrub((err as Error).message);
        ctx.audit(me, 'support_test', id, `${p.mode}: błąd`);
        return { ok: false, message: err instanceof ProviderError ? message : 'Brak połączenia.' };
      }
    }],
    ['POST', /^\/v1\/admin\/support\/settings$/, async (req) => {
      const me = ctx.admin(req);
      const b = await ctx.body(req);
      const n = Number(b.graceDays);
      if (!Number.isInteger(n) || n < 0 || n > 30) fail(400, 'bad_days');
      store.setConfig('grace_days', String(n));
      ctx.audit(me, 'support_settings', 'grace', `${n} dni`);
      return { graceDays: graceDays() };
    }],
    // a tier, new or changed
    ['POST', /^\/v1\/admin\/support\/tiers$/, async (req) => {
      const me = ctx.admin(req);
      const b = await ctx.body(req);
      const was = typeof b.id === 'string' ? store.tier(b.id) : undefined;
      const t = tierFrom(b, was);
      store.saveTier(t);
      ctx.audit(me, 'support_tier', t.id, was ? 'zmieniono' : 'dodano');
      for (const id of store.grantedUsers(5000)) ctx.changed(id);
      return { tiers: store.tiers() };
    }],
    ['DELETE', /^\/v1\/admin\/support\/tiers\/([a-z][a-z0-9_]{1,29})$/, (req, [id]) => {
      const me = ctx.admin(req);
      if (!store.tier(id)) fail(404, 'not_found');
      // a tier someone had or paid for stays (history); it can be switched off
      if (store.tierInUse(id)) fail(409, 'tier_in_use');
      store.removeTier(id);
      ctx.audit(me, 'support_tier_delete', id);
      return { tiers: store.tiers() };
    }],
    ['GET', /^\/v1\/admin\/support\/payments$/, (req, _p, url) => {
      ctx.admin(req);
      const handle = url.searchParams.get('handle')?.trim().replace(/^@/, '');
      const user = handle ? ctx.userByHandle(handle) : undefined;
      if (handle && !user) return { payments: [], total: 0 };
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const res = store.payments({ status: url.searchParams.get('status') ?? '', user: user?.id, limit, offset });
      return { total: res.total, payments: res.payments.map((p) => ({ ...userView(p), ref: p.ref, intent: p.intent, subscription: p.subscription, note: p.note, user: p.user, handle: handleOf(p.user) })) };
    }],
    ['GET', /^\/v1\/admin\/support\/supporters$/, (req) => {
      ctx.admin(req);
      return {
        supporters: store.grantedUsers(1000).map((id) => {
          const u = ctx.user(id);
          const a = active(id);
          return { id, handle: u?.handle ?? '', name: u?.name ?? '', active: a ? { tier: a.tier.id, expiresAt: a.expiresAt } : null, since: sinceOf(store.grantsOf(id)), grants: store.grantsOf(id).map((g) => ({ ...grantView(g), by: g.by ? handleOf(g.by) : '' })) };
        }),
      };
    }],
    // the admin gives a tier: for some days or for good
    ['POST', /^\/v1\/admin\/support\/grants$/, async (req) => {
      const me = ctx.admin(req);
      const b = await ctx.body(req);
      const user = ctx.userByHandle(String(b.handle ?? '').trim().replace(/^@/, '')) ?? fail(404, 'no_player');
      const tier = store.tier(String(b.tier ?? '')) ?? fail(400, 'bad_tier');
      const lifetime = b.lifetime === true;
      const days = Number(b.days);
      if (!lifetime && (!Number.isInteger(days) || days < 1 || days > 3650)) fail(400, 'bad_days');
      const note = cleanText(b.note, 200) ?? '';
      const g = store.addGrant({ user: user.id, tier: tier.id, source: 'admin', ref: '', startsAt: now(), expiresAt: lifetime ? null : now() + days * DAY, note, by: me });
      ctx.audit(me, 'support_grant', user.handle, `${tier.name}, ${lifetime ? 'na zawsze' : `${days} dni`}${note ? `: ${note}` : ''}`);
      ctx.changed(user.id);
      return { grant: grantView(g) };
    }],
    ['POST', /^\/v1\/admin\/support\/grants\/(\d+)\/extend$/, async (req, [raw]) => {
      const me = ctx.admin(req);
      const g = grantOr404(raw);
      const b = await ctx.body(req);
      const days = Number(b.days);
      if (!Number.isInteger(days) || days < 1 || days > 3650) fail(400, 'bad_days');
      if (g.revokedAt || g.expiresAt === null) fail(400, 'not_extendable');
      store.setGrantExpiry(g.id, Math.max(now(), g.expiresAt) + days * DAY);
      ctx.audit(me, 'support_extend', handleOf(g.user), `${g.tier} #${g.id}, +${days} dni`);
      ctx.changed(g.user);
      return { grant: grantView(store.grant(g.id)!) };
    }],
    ['POST', /^\/v1\/admin\/support\/grants\/(\d+)\/revoke$/, async (req, [raw]) => {
      const me = ctx.admin(req);
      const g = grantOr404(raw);
      const b = await ctx.body(req);
      const reason = cleanText(b.reason, 200) || 'odebrane przez admina';
      if (g.revokedAt) fail(400, 'already_revoked');
      store.revokeGrant(g.id, reason);
      ctx.audit(me, 'support_revoke', handleOf(g.user), `${g.tier} #${g.id}: ${reason}`);
      ctx.changed(g.user);
      return { grant: grantView(store.grant(g.id)!) };
    }],
  ];

  // refund requests: the player's own on the account page, the admin's queue (refunds.ts)
  const providerClient = <T,>(id: ProviderId, mode: 'test' | 'live', make: () => T) => (ctx.box && provider(id).has(mode) ? make() : undefined);
  const refunds = refundRoutes({
    sql: ctx.sql, store, now, authed: ctx.authed, admin: ctx.admin, isAdmin: ctx.isAdmin ?? (() => false), body: ctx.body,
    limit: ctx.limitRefunds ?? ctx.limitCheckout, audit: ctx.audit, notify: ctx.notify ?? (() => {}), handleOf, changed: ctx.changed, fail,
    stripe: (mode) => providerClient('stripe', mode, () => stripeOf(mode)), paypal: (mode) => providerClient('paypal', mode, () => paypalOf(mode)),
    takeBack: (p) => takeBack(p, 'refunded'),
  });
  routes.push(...refunds.routes);
  // the player's payment history (history.ts)
  routes.push(...historyRoutes({
    sql: ctx.sql, store, refunds: refunds.refunds, info, now, authed: ctx.authed, isAdmin: ctx.isAdmin ?? (() => false), limit: ctx.limitRefunds ?? ctx.limitCheckout,
    refundable: refunds.refundable, until: refunds.until, stripe: (mode) => providerClient('stripe', mode, () => stripeOf(mode)), fail,
  }).routes);

  return { routes, serve, store, active, summary, cosmeticsLevel, limitFactor, rank, profileDecor };
}

class RetryLater extends Error {}
