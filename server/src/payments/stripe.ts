import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe through its REST API (no SDK; the server depends only on "ws"): Checkout Sessions for
 * one-time support and subscriptions, the customer portal for managing a subscription, and the
 * webhook signature (Stripe-Signature: t=<seconds>,v1=<hex HMAC-SHA256 of "t.body">).
 *
 * Payment methods: without a list Stripe shows what the owner switched on in the Dashboard for the
 * currency (cards, BLIK, Przelewy24, Apple Pay and Google Pay for PLN); with one it shows those.
 */

export const STRIPE_API = 'https://api.stripe.com';
/** How old a signed webhook may be (Stripe's own libraries use 5 minutes). */
export const STRIPE_TOLERANCE_S = 300;

export class ProviderError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

/** Keys and ids out of a message before it is logged or shown. */
export const scrub = (text: string) =>
  text.replace(/\b(sk|rk|pk)_(test|live)_[A-Za-z0-9]+/g, '$1_$2_***').replace(/\bwhsec_[A-Za-z0-9]+/g, 'whsec_***').replace(/Bearer [\w.-]+/g, 'Bearer ***');

/** Stripe's form encoding of nested parameters: a[b][0][c]=v. */
export function formEncode(params: Record<string, unknown>): string {
  const out = new URLSearchParams();
  const add = (key: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => add(`${key}[${i}]`, x));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) add(`${key}[${k}]`, x);
    else out.append(key, String(v));
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return out.toString();
}

/**
 * Checks a webhook's Stripe-Signature against the endpoint's secret: the HMAC compared in
 * constant time with every v1 in the header, and the timestamp no older (or newer) than the tolerance.
 */
export function verifyStripeSignature(raw: Buffer, header: string | undefined, secret: string, nowMs: number, toleranceS = STRIPE_TOLERANCE_S): { ok: true; timestamp: number } | { ok: false; reason: string } {
  if (!header || !secret) return { ok: false, reason: 'missing' };
  let t = NaN;
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => s?.trim());
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v && /^[0-9a-f]{64}$/i.test(v)) sigs.push(v.toLowerCase());
  }
  if (!Number.isFinite(t) || !sigs.length) return { ok: false, reason: 'malformed' };
  const expected = createHmac('sha256', secret).update(`${t}.`).update(raw).digest();
  const match = sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!match) return { ok: false, reason: 'signature' };
  if (Math.abs(nowMs / 1000 - t) > toleranceS) return { ok: false, reason: 'timestamp' };
  return { ok: true, timestamp: t };
}

/** Makes a header as Stripe would (tests, and the panel's own check of the secret). */
export function signStripe(raw: string | Buffer, secret: string, timestampS: number): string {
  const sig = createHmac('sha256', secret).update(`${timestampS}.`).update(raw).digest('hex');
  return `t=${timestampS},v1=${sig}`;
}

export interface StripeClient {
  call<T = Record<string, any>>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T>;
}

export function stripeClient(o: { secretKey: string; apiBase?: string; fetchImpl?: typeof fetch }): StripeClient {
  const base = (o.apiBase ?? STRIPE_API).replace(/\/$/, '');
  const doFetch = o.fetchImpl ?? fetch;
  return {
    async call(method, path, params, idempotencyKey) {
      const body = params && method === 'POST' ? formEncode(params) : undefined;
      const query = params && method === 'GET' ? `?${formEncode(params)}` : '';
      let res: Response;
      try {
        res = await doFetch(`${base}${path}${query}`, {
          method,
          headers: {
            Authorization: `Bearer ${o.secretKey}`,
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
          body,
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        throw new ProviderError(`stripe: ${scrub((err as Error).message)}`);
      }
      const data = (await res.json().catch(() => ({}))) as Record<string, any>;
      if (!res.ok) throw new ProviderError(`stripe ${res.status}: ${scrub(String(data?.error?.message ?? data?.error?.code ?? 'error'))}`, res.status);
      return data as never;
    },
  };
}

export interface CheckoutInput {
  paymentId: string;
  user: string;
  tier: string;
  kind: 'one_time' | 'monthly';
  /** The whole amount in minor units (one-time), or the monthly price. */
  amount: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  /** A Stripe customer of this account from before (subscriptions reuse it, so the portal shows them together). */
  customer?: string;
  /** '' or missing: the methods switched on in the Dashboard; else these (e.g. card, blik, p24). */
  paymentMethods?: string[];
  locale?: string;
}

/** Methods that can renew a subscription by themselves (BLIK and Przelewy24 cannot). */
const RECURRING_METHODS = new Set(['card', 'link', 'paypal', 'sepa_debit', 'bancontact', 'ideal']);

/** Creates a Checkout Session; the amount and currency come from here, never from the page. */
export async function createStripeCheckout(client: StripeClient, i: CheckoutInput): Promise<{ id: string; url: string }> {
  const metadata = { payment: i.paymentId, user: i.user, tier: i.tier, kind: i.kind };
  const methods = (i.paymentMethods ?? []).filter((m) => i.kind === 'one_time' || RECURRING_METHODS.has(m));
  const params: Record<string, unknown> = {
    mode: i.kind === 'monthly' ? 'subscription' : 'payment',
    client_reference_id: i.paymentId,
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
    locale: i.locale ?? 'auto',
    metadata,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: i.currency.toLowerCase(),
        unit_amount: i.amount,
        product_data: { name: i.productName },
        ...(i.kind === 'monthly' ? { recurring: { interval: 'month' } } : {}),
      },
    }],
    ...(methods.length ? { payment_method_types: methods } : {}),
    ...(i.customer ? { customer: i.customer } : {}),
  };
  if (i.kind === 'monthly') params.subscription_data = { metadata };
  else {
    params.payment_intent_data = { metadata, description: i.productName };
    // a customer is made for one-time payments too, so the account's history and portal stay together
    if (!i.customer) params.customer_creation = 'always';
  }
  const s = await client.call<{ id: string; url: string }>('POST', '/v1/checkout/sessions', params, `checkout-${i.paymentId}`);
  if (!s.id || typeof s.url !== 'string' || !/^https:\/\//.test(s.url)) throw new ProviderError('stripe: no checkout url');
  return { id: s.id, url: s.url };
}

/** The customer portal: the player manages or cancels the subscription on Stripe's page. */
export async function stripePortal(client: StripeClient, customer: string, returnUrl: string): Promise<string> {
  const s = await client.call<{ url: string }>('POST', '/v1/billing_portal/sessions', { customer, return_url: returnUrl });
  if (typeof s.url !== 'string' || !/^https:\/\//.test(s.url)) throw new ProviderError('stripe: no portal url');
  return s.url;
}

/** "Test połączenia": the key works (the balance can be read) and is of the mode it was saved for. */
export async function testStripe(client: StripeClient): Promise<{ livemode: boolean }> {
  const b = await client.call<{ livemode?: boolean }>('GET', '/v1/balance');
  return { livemode: !!b.livemode };
}
