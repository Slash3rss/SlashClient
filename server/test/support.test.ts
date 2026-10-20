import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { minorUnits, paypalValue } from '../src/payments/paypal.ts';
import { formEncode, signStripe, verifyStripeSignature } from '../src/payments/stripe.ts';

// Supporting the project: checkouts, webhooks, grants, perks and the admin's tools, against fake
// Stripe and PayPal servers (never the real ones, never real keys).

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-support-'));
const DAY = 86_400_000;
const SK = `sk_test_${'a'.repeat(20)}WXYZ`;
const WHSEC = `whsec_${'b'.repeat(24)}`;
const PP_ID = `ppclient_${'c'.repeat(16)}`;
const PP_SECRET = `ppsecret_${'d'.repeat(16)}`;
const PP_HOOK = 'WH1234567890ABCDEF';
/** What the fake PayPal signs webhooks with (only it and this test know it). */
const PP_SIGNING = 'fake-paypal-signing';

let clock = Date.now();
let base = '';
let app: ReturnType<typeof createApp>;

// ---------- fake Stripe ----------

const stripeCalls: { method: string; path: string; params: URLSearchParams; auth: string; idem: string }[] = [];
let sessions = 0;
const fakeStripe = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const url = new URL(req.url ?? '/', 'http://x');
  const params = new URLSearchParams(req.method === 'GET' ? url.search : raw);
  stripeCalls.push({ method: req.method ?? '', path: url.pathname, params, auth: String(req.headers.authorization ?? ''), idem: String(req.headers['idempotency-key'] ?? '') });
  const send = (status: number, body: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (req.headers.authorization !== `Bearer ${SK}`) return send(401, { error: { message: 'Invalid API Key provided: sk_test_****WXYZ' } });
  if (url.pathname === '/v1/checkout/sessions') {
    const n = ++sessions;
    return send(200, { id: `cs_test_${n}`, url: `https://checkout.stripe.test/c/${n}` });
  }
  if (url.pathname === '/v1/billing_portal/sessions') return send(200, { url: 'https://billing.stripe.test/p/1' });
  if (url.pathname === '/v1/balance') return send(200, { livemode: false });
  send(404, { error: { message: 'no such route' } });
});

// ---------- fake PayPal ----------

const paypalCalls: { path: string; body: string; requestId: string }[] = [];
const paypalSig = (id: string, time: string, hook: string, event: string) => createHash('sha256').update(`${PP_SIGNING}|${id}|${time}|${hook}|${event}`).digest('hex');
const fakePayPal = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const url = new URL(req.url ?? '/', 'http://x');
  paypalCalls.push({ path: url.pathname, body: raw, requestId: String(req.headers['paypal-request-id'] ?? '') });
  const send = (status: number, body: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (url.pathname === '/v1/oauth2/token') {
    if (req.headers.authorization !== `Basic ${Buffer.from(`${PP_ID}:${PP_SECRET}`).toString('base64')}`) return send(401, { error: 'invalid_client', error_description: 'Client Authentication failed' });
    return send(200, { access_token: 'A21-token', expires_in: 3600 });
  }
  if (req.headers.authorization !== 'Bearer A21-token') return send(401, { name: 'AUTHENTICATION_FAILURE' });
  if (url.pathname === '/v2/checkout/orders') return send(201, { id: 'ORDER1', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.test/checkoutnow?token=ORDER1' }] });
  if (/^\/v2\/checkout\/orders\/ORDER1\/capture$/.test(url.pathname)) return send(201, { status: 'COMPLETED' });
  if (url.pathname === '/v1/notifications/verify-webhook-signature') {
    const b = JSON.parse(raw);
    const ok = b.webhook_id === PP_HOOK && b.transmission_sig === paypalSig(b.transmission_id, b.transmission_time, b.webhook_id, JSON.stringify(b.webhook_event));
    return send(200, { verification_status: ok ? 'SUCCESS' : 'FAILURE' });
  }
  send(404, { name: 'NOT_FOUND' });
});

// ---------- helpers ----------

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text, headers: res.headers };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; handle: string } };

let events = 0;
const stripeEvent = (type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id: `evt_${++events}`, type, livemode: false, data: { object }, ...extra });
async function sendStripe(event: unknown, o: { secret?: string; at?: number; header?: string } = {}) {
  const raw = JSON.stringify(event);
  const header = o.header ?? signStripe(raw, o.secret ?? WHSEC, Math.floor((o.at ?? clock) / 1000));
  return call('POST', '/v1/payments/stripe/webhook', undefined, raw, { 'Stripe-Signature': header });
}
let ppEvents = 0;
async function sendPayPal(event: Record<string, unknown>, o: { badSig?: boolean; time?: string } = {}) {
  const raw = JSON.stringify(event);
  const id = `tx-${++ppEvents}`;
  const time = o.time ?? new Date(clock).toISOString();
  return call('POST', '/v1/payments/paypal/webhook', undefined, raw, {
    'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
    'paypal-transmission-id': id, 'paypal-transmission-time': time,
    'paypal-transmission-sig': o.badSig ? 'nope' : paypalSig(id, time, PP_HOOK, raw),
  });
}

/** A one-time checkout at Stripe and the session id the fake made for it. */
async function stripeCheckout(token: string, body: Record<string, unknown> = {}) {
  const res = await call('POST', '/v1/support/checkout', token, { tier: 'supporter', kind: 'one_time', provider: 'stripe', quantity: 1, terms: true, consent: true, ...body });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const created = stripeCalls.filter((c) => c.path === '/v1/checkout/sessions').at(-1)!;
  return { payment: res.body.payment as string, url: res.body.url as string, session: `cs_test_${sessions}`, params: created.params };
}
const paidSession = (session: string, payment: string, amount: number, extra: Record<string, unknown> = {}) =>
  stripeEvent('checkout.session.completed', { id: session, object: 'checkout.session', mode: 'payment', client_reference_id: payment, metadata: { payment }, amount_total: amount, currency: 'pln', payment_status: 'paid', payment_intent: `pi_${session}`, customer: 'cus_one', ...extra });

const me = async (token: string) => (await call('GET', '/v1/me', token)).body;
const mySupport = async (token: string) => (await call('GET', '/v1/me/support', token)).body;

let admin: Awaited<ReturnType<typeof login>>;
let alice: Awaited<ReturnType<typeof login>>;
let bob: Awaited<ReturnType<typeof login>>;

before(async () => {
  await new Promise<void>((r) => fakeStripe.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => fakePayPal.listen(0, '127.0.0.1', r));
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: true, oauth: {}, adminHandles: ['SupAdmin'], loginsPerMinute: 1000,
    profileViewsPerMinute: 10_000, storage: { secretKey: randomBytes(32).toString('base64') },
    payments: { stripeApi: `http://127.0.0.1:${(fakeStripe.address() as AddressInfo).port}`, paypalApi: `http://127.0.0.1:${(fakePayPal.address() as AddressInfo).port}`, now: () => clock, checkoutsPerMinute: 1000 },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  admin = await login('SupAdmin');
  alice = await login('Alice');
  bob = await login('Bobby');
});
after(async () => {
  await app.close();
  fakeStripe.close();
  fakePayPal.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('payment helpers', () => {
  it('encodes nested parameters as Stripe reads them', () => {
    assert.equal(decodeURIComponent(formEncode({ a: 1, b: { c: 'x', d: [{ e: 2 }] }, skip: undefined })), 'a=1&b[c]=x&b[d][0][e]=2');
  });
  it('checks Stripe signatures: the HMAC, any of several v1, and the time', () => {
    const raw = Buffer.from('{"id":"evt_1"}');
    const t = 1_700_000_000;
    const good = signStripe(raw, WHSEC, t);
    assert.equal(verifyStripeSignature(raw, good, WHSEC, t * 1000).ok, true);
    assert.equal(verifyStripeSignature(raw, `t=${t},v1=${'0'.repeat(64)},${good.split(',')[1]}`, WHSEC, t * 1000).ok, true);
    assert.deepEqual(verifyStripeSignature(raw, good, 'whsec_other', t * 1000), { ok: false, reason: 'signature' });
    assert.deepEqual(verifyStripeSignature(Buffer.from('{"id":"evt_2"}'), good, WHSEC, t * 1000), { ok: false, reason: 'signature' });
    assert.deepEqual(verifyStripeSignature(raw, good, WHSEC, (t + 301) * 1000), { ok: false, reason: 'timestamp' });
    assert.deepEqual(verifyStripeSignature(raw, 'garbage', WHSEC, t * 1000), { ok: false, reason: 'malformed' });
    assert.deepEqual(verifyStripeSignature(raw, undefined, WHSEC, t * 1000), { ok: false, reason: 'missing' });
  });
  it('turns PayPal amounts into minor units without floating point', () => {
    assert.equal(paypalValue(1500), '15.00');
    assert.equal(paypalValue(1205), '12.05');
    assert.equal(minorUnits('15.00'), 1500);
    assert.equal(minorUnits('12.5'), 1250);
    assert.equal(minorUnits('7'), 700);
    assert.ok(Number.isNaN(minorUnits('1e3')));
    assert.ok(Number.isNaN(minorUnits(15)));
  });
});

describe('providers in the admin panel', () => {
  it('keeps the keys write-only and sealed in the database', async () => {
    assert.equal((await call('POST', '/v1/admin/support/providers/stripe', alice.token, { test: { secretKey: SK } })).status, 403);
    // enabling needs the keys of the mode in use
    assert.equal((await call('POST', '/v1/admin/support/providers/stripe', admin.token, { enabled: true })).body.error, 'provider_not_configured');
    // a live key cannot go in as a test one
    assert.equal((await call('POST', '/v1/admin/support/providers/stripe', admin.token, { test: { secretKey: `sk_live_${'a'.repeat(20)}` } })).body.error, 'bad_secretKey');
    const saved = await call('POST', '/v1/admin/support/providers/stripe', admin.token, { mode: 'test', test: { secretKey: SK, webhookSecret: WHSEC }, enabled: true, paymentMethods: 'card,blik,p24' });
    assert.equal(saved.status, 200, saved.text);
    assert.ok(!saved.text.includes(SK) && !saved.text.includes(WHSEC) && !saved.text.includes('aaaaaaaa'));
    assert.deepEqual(saved.body.provider.keys.test.secretKey, { set: true, hint: 'WXYZ' });
    assert.deepEqual(saved.body.provider.keys.test.webhookSecret, { set: true, hint: '' });
    assert.equal(saved.body.provider.enabled, true);
    assert.equal(saved.body.provider.webhookUrl, 'https://client.example/v1/payments/stripe/webhook');
    const overview = await call('GET', '/v1/admin/support', admin.token);
    assert.ok(!overview.text.includes(SK) && !overview.text.includes(WHSEC));
    // at rest: sealed, never the key itself
    const sql = new DatabaseSync(path.join(dir, 'test.db'));
    const row = sql.prepare("SELECT secrets FROM support_providers WHERE id = 'stripe'").get() as { secrets: string };
    const log = sql.prepare("SELECT detail FROM admin_log WHERE action = 'support_provider'").all() as { detail: string }[];
    sql.close();
    assert.ok(!row.secrets.includes(SK) && !row.secrets.includes(WHSEC));
    assert.match(JSON.parse(row.secrets)['test.secretKey'], /^v1:[0-9a-f]{8}:/);
    assert.ok(log.length && log.every((l) => !l.detail.includes('sk_test_') && !l.detail.includes('whsec_')));
    // the connection test, at the fake
    assert.deepEqual((await call('POST', '/v1/admin/support/providers/stripe/test', admin.token)).body, { ok: true });
    // keys left empty stay as they were
    assert.equal((await call('POST', '/v1/admin/support/providers/stripe', admin.token, { test: { secretKey: '' } })).body.provider.keys.test.secretKey.set, true);
  });

  it('sets PayPal up and tells a wrong secret apart', async () => {
    await call('POST', '/v1/admin/support/providers/paypal', admin.token, { test: { clientId: PP_ID, clientSecret: `ppsecret_${'x'.repeat(16)}`, webhookId: PP_HOOK }, enabled: true });
    const bad = await call('POST', '/v1/admin/support/providers/paypal/test', admin.token);
    assert.equal(bad.body.ok, false);
    assert.ok(!bad.text.includes('xxxxxxxx'));
    await call('POST', '/v1/admin/support/providers/paypal', admin.token, { test: { clientSecret: PP_SECRET } });
    assert.deepEqual((await call('POST', '/v1/admin/support/providers/paypal/test', admin.token)).body, { ok: true });
  });

  it('offers the tiers with prices from the server and the providers that are ready', async () => {
    const res = await call('GET', '/v1/support');
    assert.deepEqual(res.body.tiers.map((t: any) => t.id), ['supporter', 'supporter_plus', 'patron']);
    assert.deepEqual(res.body.tiers[0].oneTime, { PLN: 1500, days: 30 });
    assert.deepEqual(res.body.providers, [{ id: 'stripe', monthly: true, test: true }, { id: 'paypal', monthly: false, test: true }]);
    assert.equal(res.body.test, true);
  });
});

describe('checkouts', () => {
  it('asks Stripe for the tier\'s price, whatever the page says', async () => {
    assert.equal((await call('POST', '/v1/support/checkout', undefined, { tier: 'supporter', kind: 'one_time', provider: 'stripe', terms: true, consent: true })).status, 401);
    const c = await stripeCheckout(alice.token, { quantity: 2, amount: 1, price: 1, currency: 'PLN' });
    assert.equal(c.url, `https://checkout.stripe.test/c/${sessions}`);
    assert.equal(c.params.get('mode'), 'payment');
    assert.equal(c.params.get('line_items[0][price_data][unit_amount]'), '3000');
    assert.equal(c.params.get('line_items[0][price_data][currency]'), 'pln');
    assert.equal(c.params.get('metadata[payment]'), c.payment);
    assert.equal(c.params.get('client_reference_id'), c.payment);
    assert.equal(c.params.get('success_url'), `https://client.example/wsparcie/dziekujemy?p=${c.payment}`);
    assert.equal(c.params.get('payment_method_types[1]'), 'blik');
    assert.equal(stripeCalls.at(-1)!.idem, `checkout-${c.payment}`);
  });

  it('refuses what is not offered, without consent, or monthly through PayPal', async () => {
    const ask = (b: Record<string, unknown>) => call('POST', '/v1/support/checkout', alice.token, { tier: 'supporter', kind: 'one_time', provider: 'stripe', terms: true, consent: true, ...b });
    assert.equal((await ask({ consent: false })).body.error, 'consent_required');
    assert.equal((await ask({ terms: undefined })).body.error, 'consent_required');
    assert.equal((await ask({ tier: 'nope' })).body.error, 'bad_tier');
    assert.equal((await ask({ currency: 'EUR' })).body.error, 'not_offered');
    assert.equal((await ask({ quantity: 13 })).body.error, 'bad_quantity');
    assert.equal((await ask({ quantity: 1.5 })).body.error, 'bad_quantity');
    assert.equal((await ask({ provider: 'paypal', kind: 'monthly' })).body.error, 'monthly_unsupported');
    assert.equal((await ask({ provider: 'kofi' })).body.error, 'bad_provider');
  });
});

describe('Stripe webhooks', () => {
  it('grants only from a signed webhook, once, and lets a one-time tier run out', async () => {
    const c = await stripeCheckout(bob.token, { quantity: 2 });
    // coming back to the thank-you page grants nothing
    const pending = await call('GET', `/v1/support/payments/${c.payment}`, bob.token);
    assert.equal(pending.body.payment.status, 'pending');
    assert.equal(pending.body.granted, false);
    assert.equal((await call('GET', `/v1/support/payments/${c.payment}`, alice.token)).status, 404);

    const event = paidSession(c.session, c.payment, 3000, { customer: 'cus_bob' });
    // a wrong secret, an old signature, no signature
    assert.equal((await sendStripe(event, { secret: 'whsec_wrongwrongwrong' })).status, 400);
    assert.equal((await sendStripe(event, { at: clock - 10 * 60_000 })).status, 400);
    assert.equal((await sendStripe(event, { header: '' })).status, 400);
    assert.equal((await me(bob.token)).supporter, null);

    assert.equal((await sendStripe(event)).status, 200);
    const s = await me(bob.token);
    assert.equal(s.supporter.tier, 'supporter');
    assert.equal(s.badge, 'supporter');
    assert.equal(s.supporter.expiresAt, clock + 60 * DAY);
    // the same event again (Stripe retries), and the async "succeeded" for the same payment: still one grant
    assert.equal((await sendStripe(event)).status, 200);
    assert.equal((await sendStripe(stripeEvent('checkout.session.async_payment_succeeded', (event.data as any).object))).status, 200);
    const mine = await mySupport(bob.token);
    assert.equal(mine.grants.length, 1);
    assert.equal(mine.payments[0].status, 'paid');
    assert.equal(mine.portal, true);
    assert.equal((await call('GET', `/v1/support/payments/${c.payment}`, bob.token)).body.granted, true);

    // bought again: continues from the end of the first
    const again = await stripeCheckout(bob.token);
    await sendStripe(paidSession(again.session, again.payment, 1500));
    assert.equal((await me(bob.token)).supporter.expiresAt, clock + 90 * DAY);

    clock += 91 * DAY;
    const later = await me(bob.token);
    assert.equal(later.supporter.past, true);
    assert.equal(later.supporter.tier, '');
    assert.equal(later.badge, '');
    clock -= 91 * DAY;
  });

  it('keeps a paid amount that differs without granting', async () => {
    const c = await stripeCheckout(alice.token);
    assert.equal((await sendStripe(paidSession(c.session, c.payment, 100))).status, 200);
    const mine = await mySupport(alice.token);
    assert.equal(mine.payments.find((p: any) => p.id === c.payment).status, 'mismatch');
    assert.equal(mine.supporter, null);
    // a session that is not the payment's own does nothing either
    const d = await stripeCheckout(alice.token);
    await sendStripe(paidSession('cs_test_other', d.payment, 1500));
    assert.equal((await mySupport(alice.token)).payments.find((p: any) => p.id === d.payment).status, 'pending');
  });

  it('ignores an event of the other mode', async () => {
    const c = await stripeCheckout(alice.token);
    const res = await sendStripe({ ...paidSession(c.session, c.payment, 1500), livemode: true });
    assert.equal(res.body.ignored, 'mode');
    assert.equal((await mySupport(alice.token)).supporter, null);
  });

  it('takes back what a refunded payment gave, and its cosmetics with it', async () => {
    const carol = await login('Carol');
    const c = await stripeCheckout(carol.token);
    // supporter-only cape: not before
    assert.equal((await call('POST', '/v1/me', carol.token, { cape: 'supporter_heart' })).body.error, 'bad_cape');
    await sendStripe(paidSession(c.session, c.payment, 1500));
    assert.equal((await call('POST', '/v1/me', carol.token, { cape: 'supporter_heart' })).status, 200);
    // the patron's cape needs level 3
    assert.equal((await call('POST', '/v1/me', carol.token, { cape: 'supporter_patron' })).body.error, 'bad_cape');
    const items = (await call('GET', '/v1/cosmetics', carol.token, undefined, { 'X-SlashClient': 'launcher/0.9.23' })).body.items;
    assert.deepEqual(items.filter((i: any) => i.supporter).map((i: any) => [i.id, i.available]), [['supporter_heart', true], ['supporter_patron', false], ['supporter_wings', false]]);
    // older launchers do not get them
    assert.ok(!(await call('GET', '/v1/cosmetics', carol.token, undefined, { 'X-SlashClient': 'launcher/0.9.22' })).body.items.some((i: any) => i.supporter));

    assert.equal((await sendStripe(stripeEvent('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: `pi_${c.session}`, refunded: true, amount_refunded: 1500 }))).status, 200);
    const mine = await mySupport(carol.token);
    assert.equal(mine.payments[0].status, 'refunded');
    assert.ok(mine.grants[0].revokedAt);
    assert.equal(mine.supporter, null);
    // the cape stays chosen but is not worn any more, and cannot be put on again
    assert.equal((await call('POST', '/v1/me', carol.token, { cape: 'supporter_heart' })).body.error, 'bad_cape');
  });

  it('keeps a monthly tier while the subscription is paid, with grace days, until it is cancelled', async () => {
    const dave = await login('Davey');
    const res = await call('POST', '/v1/support/checkout', dave.token, { tier: 'supporter_plus', kind: 'monthly', provider: 'stripe', terms: true, consent: true });
    assert.equal(res.status, 200);
    const session = `cs_test_${sessions}`;
    const params = stripeCalls.filter((c) => c.path === '/v1/checkout/sessions').at(-1)!.params;
    assert.equal(params.get('mode'), 'subscription');
    assert.equal(params.get('line_items[0][price_data][recurring][interval]'), 'month');
    assert.equal(params.get('line_items[0][price_data][unit_amount]'), '2500');
    assert.equal(params.get('subscription_data[metadata][payment]'), res.body.payment);
    // BLIK and Przelewy24 cannot renew: only the card is asked for
    assert.equal(params.get('payment_method_types[0]'), 'card');
    assert.equal(params.get('payment_method_types[1]'), null);

    // the first invoice before the checkout's own event (Stripe does not keep the order)
    const periodEnd = Math.floor((clock + 30 * DAY) / 1000);
    const invoice = (id: string, end: number, amount = 2500) => stripeEvent('invoice.paid', {
      id, object: 'invoice', amount_paid: amount, currency: 'pln', customer: 'cus_dave', subscription: 'sub_1', payment_intent: `pi_${id}`,
      subscription_details: { metadata: { payment: res.body.payment } }, lines: { data: [{ period: { end } }] },
    });
    assert.equal((await sendStripe(invoice('in_1', periodEnd))).status, 200);
    await sendStripe(stripeEvent('checkout.session.completed', { id: session, object: 'checkout.session', mode: 'subscription', client_reference_id: res.body.payment, metadata: { payment: res.body.payment }, subscription: 'sub_1', customer: 'cus_dave', payment_status: 'paid', amount_total: 2500, currency: 'pln' }));
    let s = await me(dave.token);
    assert.equal(s.supporter.tier, 'supporter_plus');
    assert.equal(s.supporter.expiresAt, periodEnd * 1000 + 3 * DAY);
    let mine = await mySupport(dave.token);
    assert.equal(mine.subscriptions[0].status, 'active');
    assert.equal(mine.payments.filter((p: any) => p.status === 'paid').length, 1);
    // a second subscription is refused: changes go through the portal
    assert.equal((await call('POST', '/v1/support/checkout', dave.token, { tier: 'patron', kind: 'monthly', provider: 'stripe', terms: true, consent: true })).body.error, 'already_subscribed');
    assert.equal((await call('POST', '/v1/support/portal', dave.token)).body.url, 'https://billing.stripe.test/p/1');
    assert.equal(stripeCalls.at(-1)!.params.get('customer'), 'cus_dave');

    // the renewal is late: the grace days keep the tier
    clock += 31 * DAY;
    assert.equal((await me(dave.token)).supporter.tier, 'supporter_plus');
    clock += 3 * DAY;
    assert.equal((await me(dave.token)).supporter.past, true);
    // then it is paid
    const next = Math.floor((clock + 30 * DAY) / 1000);
    await sendStripe(invoice('in_2', next));
    assert.equal((await me(dave.token)).supporter.tier, 'supporter_plus');
    // cancelled: what was paid for stays to the end of the period, without the grace days
    await sendStripe(stripeEvent('customer.subscription.deleted', { id: 'sub_1', object: 'subscription', status: 'canceled', current_period_end: next, cancel_at_period_end: false }));
    s = await me(dave.token);
    assert.equal(s.supporter.expiresAt, next * 1000);
    mine = await mySupport(dave.token);
    assert.equal(mine.subscriptions[0].status, 'canceled');
    clock = next * 1000 + 1;
    assert.equal((await me(dave.token)).supporter.past, true);
    clock = Date.now();
  });
});

describe('PayPal', () => {
  it('creates an order for the tier\'s price, captures on the way back and grants only from the webhook', async () => {
    const erin = await login('Erin');
    const res = await call('POST', '/v1/support/checkout', erin.token, { tier: 'supporter', kind: 'one_time', provider: 'paypal', terms: true, consent: true, quantity: 2 });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.url, 'https://www.sandbox.paypal.test/checkoutnow?token=ORDER1');
    const order = JSON.parse(paypalCalls.find((c) => c.path === '/v2/checkout/orders')!.body);
    assert.deepEqual(order.purchase_units[0].amount, { currency_code: 'PLN', value: '30.00' });
    assert.equal(order.purchase_units[0].custom_id, res.body.payment);
    // the way back: captured, not granted
    const back = await call('GET', `/v1/payments/paypal/return?p=${res.body.payment}&token=ORDER1`);
    assert.equal(back.status, 302);
    assert.equal(back.headers.get('location'), `/wsparcie/dziekujemy?p=${res.body.payment}`);
    assert.equal(paypalCalls.filter((c) => c.path === '/v2/checkout/orders/ORDER1/capture').length, 1);
    assert.equal(paypalCalls.find((c) => c.path === '/v2/checkout/orders/ORDER1/capture')!.requestId, `capture-${res.body.payment}`);
    assert.equal((await me(erin.token)).supporter, null);

    const completed = { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP1', custom_id: res.body.payment, amount: { currency_code: 'PLN', value: '30.00' }, supplementary_data: { related_ids: { order_id: 'ORDER1' } } } };
    assert.equal((await sendPayPal(completed, { badSig: true })).status, 400);
    assert.equal((await sendPayPal(completed, { time: new Date(clock - 3_600_000).toISOString() })).status, 400);
    assert.equal((await me(erin.token)).supporter, null);
    assert.equal((await sendPayPal(completed)).status, 200);
    assert.equal((await sendPayPal(completed)).status, 200);
    const mine = await mySupport(erin.token);
    assert.equal(mine.supporter.tier, 'supporter');
    assert.equal(mine.grants.length, 1);
    assert.equal(mine.supporter.expiresAt, clock + 60 * DAY);

    // refunded at PayPal: the refund names its capture
    await sendPayPal({ id: 'WH-2', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'REF1', links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAP1' }] } });
    const after = await mySupport(erin.token);
    assert.equal(after.payments[0].status, 'refunded');
    assert.equal(after.supporter, null);
  });
});

describe('admin tools, profile and limits', () => {
  it('grants, extends and takes back by hand, each in the log', async () => {
    const frank = await login('Frank');
    assert.equal((await call('POST', '/v1/admin/support/grants', alice.token, { handle: 'Frank', tier: 'patron', days: 10 })).status, 403);
    const g = await call('POST', '/v1/admin/support/grants', admin.token, { handle: 'Frank', tier: 'patron', days: 10, note: 'konkurs' });
    assert.equal(g.status, 200);
    assert.equal((await me(frank.token)).supporter.tier, 'patron');
    // the patron's cape now
    assert.equal((await call('POST', '/v1/me', frank.token, { cape: 'supporter_patron' })).status, 200);
    const ext = await call('POST', `/v1/admin/support/grants/${g.body.grant.id}/extend`, admin.token, { days: 5 });
    assert.equal(ext.body.grant.expiresAt, g.body.grant.expiresAt + 5 * DAY);
    const list = (await call('GET', '/v1/admin/support/supporters', admin.token)).body.supporters;
    assert.equal(list.find((s: any) => s.handle === 'Frank').active.tier, 'patron');
    await call('POST', `/v1/admin/support/grants/${g.body.grant.id}/revoke`, admin.token, { reason: 'pomyłka' });
    assert.equal((await me(frank.token)).supporter, null);
    assert.equal((await me(frank.token)).badge, '');
    const lifetime = await call('POST', '/v1/admin/support/grants', admin.token, { handle: 'Frank', tier: 'supporter', lifetime: true });
    assert.equal(lifetime.body.grant.expiresAt, null);
    clock += 5000 * DAY;
    assert.equal((await me(frank.token)).supporter.tier, 'supporter');
    clock = Date.now();
    const log = (await call('GET', '/v1/admin/log', admin.token)).body.entries.map((e: any) => e.action);
    for (const a of ['support_grant', 'support_extend', 'support_revoke']) assert.ok(log.includes(a), a);
    // payments list and the money per month (test payments are not counted)
    const pays = (await call('GET', '/v1/admin/support/payments?handle=Bobby', admin.token)).body;
    assert.ok(pays.total >= 2 && pays.payments.every((p: any) => p.handle === 'Bobby'));
    assert.deepEqual((await call('GET', '/v1/admin/support', admin.token)).body.revenue, []);
  });

  it('edits tiers and keeps ones somebody had', async () => {
    const bad = await call('POST', '/v1/admin/support/tiers', admin.token, { id: 'x', level: 1, name: 'X', color: '#fff' });
    assert.equal(bad.body.error, 'bad_tier_id');
    assert.equal((await call('POST', '/v1/admin/support/tiers', admin.token, { id: 'mini', level: 1, name: 'Mini', color: '#00ff00', oneTimePln: 150 })).body.error, 'bad_price');
    const ok = await call('POST', '/v1/admin/support/tiers', admin.token, { id: 'mini', level: 1, name: 'Mini', color: '#00FF00', oneTimePln: 500, days: 7 });
    assert.equal(ok.status, 200);
    assert.equal((await call('DELETE', '/v1/admin/support/tiers/mini', admin.token)).status, 200);
    assert.equal((await call('DELETE', '/v1/admin/support/tiers/supporter', admin.token)).body.error, 'tier_in_use');
    // a price change reaches the next checkout
    await call('POST', '/v1/admin/support/tiers', admin.token, { id: 'supporter', oneTimePln: 2000 });
    const c = await stripeCheckout(alice.token);
    assert.equal(c.params.get('line_items[0][price_data][unit_amount]'), '2000');
    await call('POST', '/v1/admin/support/tiers', admin.token, { id: 'supporter', oneTimePln: 1500 });
  });

  it('shows the badge on the public profile only as its privacy allows, and only if the player wants', async () => {
    const gina = await login('Gina');
    await call('POST', '/v1/admin/support/grants', admin.token, { handle: 'Gina', tier: 'supporter_plus', days: 30 });
    const pub = await call('GET', '/v1/profiles/Gina');
    assert.equal(pub.body.profile.supporter.tier, 'supporter_plus');
    assert.equal(pub.body.profile.supporter.color, '#a78bfa');
    assert.equal(pub.body.profile.supporter.frame, true);
    assert.equal(pub.body.profile.badge, 'supporter');
    await call('POST', '/v1/me/profile-privacy', gina.token, { visibility: 'private' });
    const closed = await call('GET', '/v1/profiles/Gina', alice.token);
    assert.equal(closed.status, 403);
    assert.ok(!closed.text.includes('supporter'));
    await call('POST', '/v1/me/profile-privacy', gina.token, { visibility: 'public' });
    await call('POST', '/v1/me/support/prefs', gina.token, { profile: false });
    assert.equal((await call('GET', '/v1/profiles/Gina')).body.profile.supporter, undefined);
    // the wall: only who chose it
    assert.ok(!(await call('GET', '/v1/support/wall')).body.supporters.some((s: any) => s.handle === 'Gina'));
    await call('POST', '/v1/me/support/prefs', gina.token, { wall: true });
    const wall = (await call('GET', '/v1/support/wall')).body.supporters;
    assert.deepEqual(wall.find((s: any) => s.handle === 'Gina'), { name: 'Gina', handle: 'Gina', active: true, tier: 'supporter_plus', tierName: 'Wspierający+', tierNameEn: 'Supporter+', color: '#a78bfa', level: 2, since: wall.find((s: any) => s.handle === 'Gina').since });
  });

  it('gives supporters more room for cloud profiles and shared screenshots', async () => {
    const hank = await login('Hank');
    const cloudBefore = (await call('GET', '/v1/cloud-profiles', hank.token)).body.limits;
    const mediaBefore = (await call('GET', '/v1/media', hank.token)).body.limits;
    await call('POST', '/v1/admin/support/grants', admin.token, { handle: 'Hank', tier: 'patron', days: 30 });
    const cloud = (await call('GET', '/v1/cloud-profiles', hank.token)).body.limits;
    const media = (await call('GET', '/v1/media', hank.token)).body.limits;
    assert.equal(cloud.maxProfiles, cloudBefore.maxProfiles * 4);
    assert.equal(cloud.quotaBytes, cloudBefore.quotaBytes * 4);
    assert.equal(cloud.maxBytes, cloudBefore.maxBytes);
    assert.equal(media.maxActive, mediaBefore.maxActive * 4);
    assert.equal(media.quotaBytes, mediaBefore.quotaBytes * 4);
    assert.equal(media.days, mediaBefore.days);
  });
});
