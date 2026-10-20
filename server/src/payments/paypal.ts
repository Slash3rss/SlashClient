import { ProviderError, scrub } from './stripe.ts';

/**
 * PayPal through its REST API: Orders v2 for one-time support (create, then capture once the
 * player approved it), and webhooks checked by PayPal itself (verify-webhook-signature). Monthly
 * support through PayPal would need its catalog products and billing plans kept in step with the
 * tiers; it is not offered, Stripe does subscriptions.
 */

export const PAYPAL_API = { test: 'https://api-m.sandbox.paypal.com', live: 'https://api-m.paypal.com' };
/** How old a webhook's transmission may be; PayPal sends a retry as a new transmission. */
export const PAYPAL_TOLERANCE_MS = 15 * 60_000;

/** "15.00" from 1500 (minor units). */
export const paypalValue = (amount: number) => `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`;
/** 1500 from "15.00" or "15"; NaN for anything else (no floating point on the way). */
export function minorUnits(value: unknown): number {
  const m = typeof value === 'string' ? /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value) : null;
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0')) : NaN;
}

export interface PayPalClient {
  call<T = Record<string, any>>(method: 'GET' | 'POST', path: string, body?: unknown, requestId?: string, rawBody?: string): Promise<T>;
  token(): Promise<string>;
}

export function paypalClient(o: { clientId: string; clientSecret: string; apiBase: string; fetchImpl?: typeof fetch; now: () => number }): PayPalClient {
  const base = o.apiBase.replace(/\/$/, '');
  const doFetch = o.fetchImpl ?? fetch;
  let cached: { token: string; until: number } | undefined;

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      throw new ProviderError(`paypal: ${scrub((err as Error).message)}`);
    }
  }

  async function token(): Promise<string> {
    if (cached && cached.until > o.now()) return cached.token;
    const res = await send(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${o.clientId}:${o.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !data.access_token) throw new ProviderError(`paypal token ${res.status}: ${scrub(String(data.error_description ?? 'error'))}`, res.status);
    cached = { token: data.access_token, until: o.now() + Math.max(60, (data.expires_in ?? 300) - 60) * 1000 };
    return cached.token;
  }

  return {
    token,
    async call(method, path, body, requestId, rawBody) {
      const res = await send(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          'Content-Type': 'application/json',
          ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
          Prefer: 'return=representation',
        },
        body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, any>;
      if (!res.ok) throw new ProviderError(`paypal ${res.status}: ${scrub(String(data?.name ?? data?.error ?? 'error'))}${data?.details?.[0]?.issue ? ` (${data.details[0].issue})` : ''}`, res.status);
      return data as never;
    },
  };
}

/** An order for one-time support; the player approves it on PayPal's page (`url`). */
export async function createPayPalOrder(client: PayPalClient, i: { paymentId: string; amount: number; currency: string; description: string; returnUrl: string; cancelUrl: string; locale?: string }): Promise<{ id: string; url: string }> {
  const order = await client.call<{ id: string; links?: { rel: string; href: string }[] }>('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: i.paymentId, custom_id: i.paymentId, description: i.description.slice(0, 127), amount: { currency_code: i.currency, value: paypalValue(i.amount) } }],
    payment_source: { paypal: { experience_context: {
      brand_name: 'SlashClient', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', return_url: i.returnUrl, cancel_url: i.cancelUrl,
      ...(i.locale ? { locale: i.locale } : {}),
    } } },
  }, `order-${i.paymentId}`);
  const url = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  if (!order.id || !url || !/^https:\/\//.test(url)) throw new ProviderError('paypal: no approve url');
  return { id: order.id, url };
}

/** Takes the money of an approved order (PayPal-Request-Id makes a second call the same one). */
export function capturePayPalOrder(client: PayPalClient, orderId: string, paymentId: string) {
  if (!/^[A-Z0-9-]{5,64}$/i.test(orderId)) throw new ProviderError('paypal: bad order id');
  return client.call<{ status?: string }>('POST', `/v2/checkout/orders/${orderId}/capture`, {}, `capture-${paymentId}`);
}

/**
 * Asks PayPal whether a webhook came from it. The event goes back exactly as it arrived (the raw
 * body put into the request as it is), since a re-serialised copy may not match the signature.
 */
export async function verifyPayPalWebhook(client: PayPalClient, headers: Record<string, string | string[] | undefined>, raw: string, webhookId: string, nowMs: number): Promise<{ ok: boolean; reason?: string }> {
  const h = (k: string) => String(headers[k] ?? '');
  const fields = {
    auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
    transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'), webhook_id: webhookId,
  };
  if (Object.values(fields).some((v) => !v)) return { ok: false, reason: 'missing' };
  // only PayPal's own certificates
  if (!/^https:\/\/api(-m)?\.(sandbox\.)?paypal\.com\//.test(fields.cert_url)) return { ok: false, reason: 'cert_url' };
  const sent = Date.parse(fields.transmission_time);
  if (!Number.isFinite(sent) || Math.abs(nowMs - sent) > PAYPAL_TOLERANCE_MS) return { ok: false, reason: 'timestamp' };
  try {
    JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const body = `${JSON.stringify(fields).slice(0, -1)},"webhook_event":${raw}}`;
  const res = await client.call<{ verification_status?: string }>('POST', '/v1/notifications/verify-webhook-signature', undefined, undefined, body);
  return res.verification_status === 'SUCCESS' ? { ok: true } : { ok: false, reason: 'signature' };
}
