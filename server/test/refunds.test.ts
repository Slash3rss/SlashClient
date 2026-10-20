import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.ts';
import { REFUND_WINDOW_DAYS } from '../src/payments/refunds.ts';
import { signStripe } from '../src/payments/stripe.ts';

// Refund requests and the payment history: private to the player and the admins, refunded through
// fake Stripe and PayPal servers (never the real ones, never real keys), the perks taken back once.

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-refunds-'));
const DAY = 86_400_000;
const SK = `sk_live_${'a'.repeat(20)}LIVE`;
const SK_TEST = `sk_test_${'a'.repeat(20)}TEST`;
const WHSEC = `whsec_${'b'.repeat(24)}`;
const PP_ID = `ppclient_${'c'.repeat(16)}`;
const PP_SECRET = `ppsecret_${'d'.repeat(16)}`;
const PP_HOOK = 'WH1234567890ABCDEF';
const PP_SIGNING = 'fake-paypal-signing';

let clock = Date.now();
let base = '';
let app: ReturnType<typeof createApp>;

// ---------- fake Stripe ----------

const stripeCalls: { method: string; path: string; params: URLSearchParams; idem: string }[] = [];
let sessions = 0;
let refundsMade = 0;
let stripeDown = false;
const fakeStripe = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const url = new URL(req.url ?? '/', 'http://x');
  const params = new URLSearchParams(req.method === 'GET' ? url.search : raw);
  stripeCalls.push({ method: req.method ?? '', path: url.pathname, params, idem: String(req.headers['idempotency-key'] ?? '') });
  const send = (status: number, body: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (req.headers.authorization !== `Bearer ${SK}` && req.headers.authorization !== `Bearer ${SK_TEST}`) return send(401, { error: { message: 'Invalid API Key' } });
  if (url.pathname === '/v1/checkout/sessions') {
    const n = ++sessions;
    return send(200, { id: `cs_live_${n}`, url: `https://checkout.stripe.test/c/${n}` });
  }
  if (url.pathname === '/v1/refunds') {
    if (stripeDown) return send(402, { error: { message: `charge already refunded (${SK})` } });
    return send(200, { id: `re_${++refundsMade}`, status: 'succeeded', amount: Number(params.get('amount')) });
  }
  const pi = /^\/v1\/payment_intents\/(pi_\w+)$/.exec(url.pathname);
  if (pi) return send(200, { id: pi[1], latest_charge: { id: 'ch_x', receipt_url: `https://pay.stripe.test/receipts/${pi[1]}`, payment_method_details: { type: 'blik' } } });
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
  if (url.pathname === '/v1/oauth2/token') return send(200, { access_token: 'A21-token', expires_in: 3600 });
  if (req.headers.authorization !== 'Bearer A21-token') return send(401, { name: 'AUTHENTICATION_FAILURE' });
  if (url.pathname === '/v2/checkout/orders') return send(201, { id: 'ORDER9', links: [{ rel: 'payer-action', href: 'https://www.paypal.test/checkoutnow?token=ORDER9' }] });
  if (/^\/v2\/payments\/captures\/\w+\/refund$/.test(url.pathname)) return send(201, { id: 'PPREF1', status: 'COMPLETED' });
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
  return { status: res.status, body: json, text };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; handle: string } };

let events = 0;
const stripeEvent = (type: string, object: Record<string, unknown>, livemode = true) => ({ id: `evt_${++events}`, type, livemode, data: { object } });
async function sendStripe(event: unknown) {
  const raw = JSON.stringify(event);
  return call('POST', '/v1/payments/stripe/webhook', undefined, raw, { 'Stripe-Signature': signStripe(raw, WHSEC, Math.floor(clock / 1000)) });
}
let ppEvents = 0;
async function sendPayPal(event: Record<string, unknown>) {
  const raw = JSON.stringify(event);
  const id = `tx-${++ppEvents}`;
  const time = new Date(clock).toISOString();
  return call('POST', '/v1/payments/paypal/webhook', undefined, raw, {
    'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-1',
    'paypal-transmission-id': id, 'paypal-transmission-time': time, 'paypal-transmission-sig': paypalSig(id, time, PP_HOOK, raw),
  });
}

/** A paid live one-time payment at Stripe (checkout, then its signed webhook). */
async function paidStripe(token: string, livemode = true) {
  const res = await call('POST', '/v1/support/checkout', token, { tier: 'supporter', kind: 'one_time', provider: 'stripe', terms: true, consent: true });
  assert.equal(res.status, 200, res.text);
  const session = `cs_live_${sessions}`;
  const payment = res.body.payment as string;
  const hook = await sendStripe(stripeEvent('checkout.session.completed', {
    id: session, object: 'checkout.session', mode: 'payment', client_reference_id: payment, metadata: { payment }, amount_total: 1500, currency: 'pln',
    payment_status: 'paid', payment_intent: `pi_${session}`, customer: 'cus_x',
  }, livemode));
  assert.equal(hook.status, 200);
  return { payment, intent: `pi_${session}` };
}
const refunded = (intent: string, extra: Record<string, unknown> = {}) => stripeEvent('charge.refunded', { id: `ch_${intent}`, object: 'charge', payment_intent: intent, refunded: true, amount_refunded: 1500, ...extra });
const ask = (token: string, payment: string, extra: Record<string, unknown> = {}) => call('POST', '/v1/me/support/refunds', token, { payment, confirm: true, ...extra });
const mine = async (token: string) => (await call('GET', '/v1/me/support', token)).body;
const log = async () => (await call('GET', '/v1/admin/log', admin.token)).body.entries as { action: string; target: string; detail: string }[];

async function connect(token: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const got: any[] = [];
  ws.on('message', (d) => got.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token }));
  const waitFor = async (pred: (e: any) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const hit = got.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('event did not come');
  };
  await waitFor((e) => e.type === 'ready');
  return { ws, waitFor };
}

let admin: Awaited<ReturnType<typeof login>>;
let alice: Awaited<ReturnType<typeof login>>;
let bob: Awaited<ReturnType<typeof login>>;

before(async () => {
  await new Promise<void>((r) => fakeStripe.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => fakePayPal.listen(0, '127.0.0.1', r));
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: true, oauth: {}, adminHandles: ['RefAdmin'], loginsPerMinute: 1000,
    profileViewsPerMinute: 10_000, storage: { secretKey: randomBytes(32).toString('base64') },
    payments: { stripeApi: `http://127.0.0.1:${(fakeStripe.address() as AddressInfo).port}`, paypalApi: `http://127.0.0.1:${(fakePayPal.address() as AddressInfo).port}`, now: () => clock, checkoutsPerMinute: 1000, refundsPerMinute: 1000 },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  admin = await login('RefAdmin');
  alice = await login('Alice');
  bob = await login('Bobby');
  // both providers live (against the fakes), with the test keys kept too
  const s = await call('POST', '/v1/admin/support/providers/stripe', admin.token, { mode: 'live', live: { secretKey: SK, webhookSecret: WHSEC }, test: { secretKey: SK_TEST, webhookSecret: WHSEC }, enabled: true });
  assert.equal(s.status, 200, s.text);
  const p = await call('POST', '/v1/admin/support/providers/paypal', admin.token, { mode: 'live', live: { clientId: PP_ID, clientSecret: PP_SECRET, webhookId: PP_HOOK }, enabled: true });
  assert.equal(p.status, 200, p.text);
});
after(async () => {
  await app.close();
  fakeStripe.close();
  fakePayPal.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('asking for a refund', () => {
  it('is offered for the player\'s own live paid payments within the window', async () => {
    const { payment } = await paidStripe(alice.token);
    const s = await mine(alice.token);
    const row = s.payments.find((p: any) => p.id === payment);
    assert.equal(row.refundable, true);
    assert.equal(row.refundUntil, clock + REFUND_WINDOW_DAYS * DAY);
    assert.equal(s.refundWindowDays, 14);
    // a checkout not paid is not
    await call('POST', '/v1/support/checkout', alice.token, { tier: 'supporter', kind: 'one_time', provider: 'stripe', terms: true, consent: true });
    const pending = (await mine(alice.token)).payments.find((p: any) => p.status === 'pending');
    assert.equal(pending.refundable, false);
    assert.equal((await ask(alice.token, pending.id)).body.error, 'not_refundable');
    // without saying the perks end, or for somebody else's payment
    assert.equal((await ask(alice.token, payment, { confirm: false })).body.error, 'confirm_required');
    assert.equal((await ask(bob.token, payment)).status, 404);
    assert.equal((await call('POST', '/v1/me/support/refunds', undefined, { payment, confirm: true })).status, 401);
  });

  it('refuses after the window and for test payments', async () => {
    const carl = await login('Carl');
    const { payment } = await paidStripe(carl.token);
    clock += REFUND_WINDOW_DAYS * DAY + 1;
    assert.equal((await ask(carl.token, payment)).body.error, 'window_passed');
    assert.equal((await mine(carl.token)).payments[0].refundable, false);
    clock = Date.now();
    // a payment made in test mode (the provider switched to its test keys)
    await call('POST', '/v1/admin/support/providers/stripe', admin.token, { mode: 'test' });
    const t = await paidStripe(carl.token, false);
    await call('POST', '/v1/admin/support/providers/stripe', admin.token, { mode: 'live' });
    assert.equal((await ask(carl.token, t.payment)).body.error, 'not_refundable');
  });

  it('keeps one open request per payment, private to the player and the admins, and can be cancelled', async () => {
    const dana = await login('Dana');
    const { payment } = await paidStripe(dana.token);
    const r = await ask(dana.token, payment, { reason: 'Pomyłkowy zakup PRYWATNE-123', guardian: true });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.refund.status, 'pending');
    assert.equal(r.body.refund.guardian, true);
    assert.equal((await ask(dana.token, payment)).body.error, 'already_requested');
    assert.equal((await mine(dana.token)).payments[0].refundable, false);
    const id = r.body.refund.id;
    // only the player and admins see it
    assert.equal((await call('GET', `/v1/me/support/refunds/${id}`, dana.token)).body.refund.reason, 'Pomyłkowy zakup PRYWATNE-123');
    assert.equal((await call('GET', `/v1/me/support/refunds/${id}`, bob.token)).status, 404);
    assert.equal((await call('GET', `/v1/me/support/refunds/${id}`)).status, 401);
    assert.equal((await call('GET', `/v1/me/support/refunds/${id}`, admin.token)).body.refund.handle, 'Dana');
    assert.ok(!(await call('GET', '/v1/me/support/refunds', bob.token)).text.includes(id));
    assert.equal((await call('GET', '/v1/admin/support/refunds', bob.token)).status, 403);
    assert.equal((await call('POST', `/v1/me/support/refunds/${id}/cancel`, bob.token)).status, 404);
    // nothing public says it
    await call('POST', '/v1/me/support/prefs', dana.token, { wall: true });
    for (const url of ['/v1/profiles/Dana', '/v1/support/wall', '/v1/bugs', '/v1/support']) {
      const res = await call('GET', url);
      assert.ok(!res.text.includes('PRYWATNE-123') && !res.text.includes(id), url);
    }
    assert.ok(!(await call('GET', '/v1/profiles/Dana', bob.token)).text.includes(id));
    // cancelled, then asked again
    assert.equal((await call('POST', `/v1/me/support/refunds/${id}/cancel`, dana.token)).body.refund.status, 'cancelled');
    assert.equal((await call('POST', `/v1/me/support/refunds/${id}/cancel`, dana.token)).body.error, 'not_pending');
    assert.equal((await mine(dana.token)).payments[0].refundable, true);
    assert.equal((await ask(dana.token, payment)).status, 200);
  });

  it('is rate limited', async () => {
    const app2 = createApp({ dbFile: path.join(dir, 'limit.db'), publicUrl: 'https://client.example', allowDevLogin: true, oauth: {}, payments: { refundsPerMinute: 3 } });
    await new Promise<void>((r) => app2.server.listen(0, r));
    const b2 = `http://127.0.0.1:${(app2.server.address() as AddressInfo).port}`;
    const tok = ((await (await fetch(`${b2}/v1/auth/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Spammer' }) })).json()) as any).token;
    const codes = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${b2}/v1/me/support/refunds`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ payment: 'p_nonexistent', confirm: true }) });
      codes.push(res.status);
    }
    await app2.close();
    assert.deepEqual(codes, [404, 404, 404, 429, 429]);
  });
});

describe('the admin\'s queue', () => {
  it('refunds through Stripe with the request as the idempotency key, and the webhook takes the perks back once', async () => {
    const erin = await login('Erin');
    const { ws, waitFor } = await connect(erin.token);
    const { payment, intent } = await paidStripe(erin.token);
    assert.equal((await mine(erin.token)).supporter.tier, 'supporter');
    const r = (await ask(erin.token, payment, { reason: 'nie chcę' })).body.refund;
    const queue = await call('GET', '/v1/admin/support/refunds', admin.token);
    assert.equal(queue.body.refunds[0].status, 'pending');
    const item = queue.body.refunds.find((x: any) => x.id === r.id);
    assert.equal(item.handle, 'Erin');
    assert.equal(item.reason, 'nie chcę');
    assert.equal(item.payment.amount, 1500);
    assert.equal(item.payment.inWindow, true);
    assert.ok(queue.body.pending >= 1);
    assert.equal((await call('POST', `/v1/admin/support/refunds/${r.id}/refund`, alice.token)).status, 403);

    const done = await call('POST', `/v1/admin/support/refunds/${r.id}/refund`, admin.token);
    assert.equal(done.status, 200, done.text);
    assert.equal(done.body.refund.status, 'approved');
    const made = stripeCalls.filter((c) => c.path === '/v1/refunds').at(-1)!;
    assert.equal(made.params.get('payment_intent'), intent);
    assert.equal(made.params.get('amount'), '1500');
    assert.equal(made.idem, r.id);
    assert.equal((await waitFor((e) => e.type === 'support-refund' && e.status === 'approved')).id, r.id);
    // once only
    assert.equal((await call('POST', `/v1/admin/support/refunds/${r.id}/refund`, admin.token)).body.error, 'not_pending');
    assert.equal(stripeCalls.filter((c) => c.path === '/v1/refunds' && c.idem === r.id).length, 1);
    // the perks stay until the provider says the money went back
    assert.equal((await mine(erin.token)).supporter.tier, 'supporter');

    assert.equal((await sendStripe(refunded(intent))).status, 200);
    let s = await mine(erin.token);
    assert.equal(s.supporter, null);
    assert.equal(s.refunds[0].status, 'refunded');
    const revokedAt = s.grants[0].revokedAt;
    assert.ok(revokedAt);
    await waitFor((e) => e.type === 'support-refund' && e.status === 'refunded');
    // another refund event for the same charge: nothing taken twice
    clock += 1000;
    assert.equal((await sendStripe(refunded(intent))).status, 200);
    s = await mine(erin.token);
    assert.equal(s.grants[0].revokedAt, revokedAt);
    assert.equal(s.grants.filter((g: any) => g.revokedAt).length, 1);
    clock = Date.now();
    assert.ok((await log()).some((e) => e.action === 'support_refund' && e.target === 'Erin' && e.detail.includes(r.id)));
    ws.close();
  });

  it('refunds through PayPal on the capture with the request as PayPal-Request-Id', async () => {
    const finn = await login('Finn');
    const res = await call('POST', '/v1/support/checkout', finn.token, { tier: 'supporter', kind: 'one_time', provider: 'paypal', terms: true, consent: true });
    assert.equal(res.status, 200, res.text);
    const payment = res.body.payment;
    await sendPayPal({ id: 'WH-P1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAPF1', custom_id: payment, amount: { currency_code: 'PLN', value: '15.00' }, supplementary_data: { related_ids: { order_id: 'ORDER9' } } } });
    const r = (await ask(finn.token, payment)).body.refund;
    assert.ok(r, 'request made');
    assert.equal((await call('POST', `/v1/admin/support/refunds/${r.id}/refund`, admin.token)).body.refund.status, 'approved');
    const made = paypalCalls.find((c) => c.path === '/v2/payments/captures/CAPF1/refund')!;
    assert.equal(made.requestId, r.id);
    assert.deepEqual(JSON.parse(made.body).amount, { value: '15.00', currency_code: 'PLN' });
    await sendPayPal({ id: 'WH-P2', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'PPREF1', amount: { value: '15.00', currency_code: 'PLN' }, links: [{ rel: 'up', href: 'https://api.paypal.com/v2/payments/captures/CAPF1' }] } });
    const s = await mine(finn.token);
    assert.equal(s.refunds[0].status, 'refunded');
    assert.equal(s.supporter, null);
  });

  it('keeps a request waiting when the provider refuses, and says so in the log without keys', async () => {
    const gil = await login('Gilly');
    const { payment } = await paidStripe(gil.token);
    const r = (await ask(gil.token, payment)).body.refund;
    stripeDown = true;
    const res = await call('POST', `/v1/admin/support/refunds/${r.id}/refund`, admin.token);
    stripeDown = false;
    assert.equal(res.body.error, 'provider_error');
    assert.equal((await call('GET', `/v1/me/support/refunds/${r.id}`, gil.token)).body.refund.status, 'pending');
    const entry = (await log()).find((e) => e.action === 'support_refund_error' && e.target === 'Gilly')!;
    assert.ok(entry && !entry.detail.includes(SK));
  });

  it('rejects with a reason the player sees', async () => {
    const hal = await login('Hal');
    const { payment } = await paidStripe(hal.token);
    const r = (await ask(hal.token, payment)).body.refund;
    assert.equal((await call('POST', `/v1/admin/support/refunds/${r.id}/reject`, admin.token, { reason: '' })).body.error, 'reason_required');
    const res = await call('POST', `/v1/admin/support/refunds/${r.id}/reject`, admin.token, { reason: 'Płatność starsza niż 14 dni.' });
    assert.equal(res.body.refund.status, 'rejected');
    const own = (await call('GET', `/v1/me/support/refunds/${r.id}`, hal.token)).body.refund;
    assert.equal(own.status, 'rejected');
    assert.equal(own.answer, 'Płatność starsza niż 14 dni.');
    assert.equal(own.decidedBy, undefined);
    assert.equal((await mine(hal.token)).supporter.tier, 'supporter');
    assert.equal((await call('POST', `/v1/admin/support/refunds/${r.id}/refund`, admin.token)).body.error, 'not_pending');
    assert.ok((await log()).some((e) => e.action === 'support_refund_reject' && e.target === 'Hal'));
  });

  it('marks a refund made outside by hand: the perks end, and a later webhook takes nothing twice', async () => {
    const ivy = await login('Ivy');
    const { payment, intent } = await paidStripe(ivy.token);
    const r = (await ask(ivy.token, payment)).body.refund;
    const res = await call('POST', `/v1/admin/support/refunds/${r.id}/manual`, admin.token, { note: 'przelew' });
    assert.equal(res.body.refund.status, 'refunded');
    let s = await mine(ivy.token);
    assert.equal(s.supporter, null);
    assert.equal(s.payments[0].status, 'refunded');
    const revokedAt = s.grants[0].revokedAt;
    clock += 1000;
    await sendStripe(refunded(intent));
    s = await mine(ivy.token);
    assert.equal(s.grants[0].revokedAt, revokedAt);
    clock = Date.now();
    assert.equal((await call('POST', `/v1/admin/support/refunds/${r.id}/manual`, admin.token)).body.error, 'not_pending');
    assert.ok((await log()).some((e) => e.action === 'support_refund_manual' && e.target === 'Ivy' && e.detail.includes('przelew')));
  });
});

describe('payment history', () => {
  it('lists only the account\'s own payments, live ones unless an admin looks, page by page', async () => {
    const jo = await login('Jojo');
    for (let i = 0; i < 3; i++) {
      await paidStripe(jo.token);
      clock += 1000;
    }
    await call('POST', '/v1/admin/support/providers/stripe', admin.token, { mode: 'test' });
    await paidStripe(jo.token, false);
    await call('POST', '/v1/admin/support/providers/stripe', admin.token, { mode: 'live' });
    const first = (await call('GET', '/v1/me/support/payments?limit=2', jo.token)).body;
    assert.equal(first.total, 3);
    assert.equal(first.payments.length, 2);
    const second = (await call('GET', '/v1/me/support/payments?limit=2&offset=2', jo.token)).body;
    assert.equal(second.payments.length, 1);
    assert.ok(![...first.payments, ...second.payments].some((p: any) => p.test));
    const row = first.payments[0];
    assert.equal(row.status, 'paid');
    assert.equal(row.amount, 1500);
    assert.equal(row.currency, 'PLN');
    assert.equal(row.provider, 'stripe');
    assert.equal(row.period.to - row.period.from, 30 * DAY);
    assert.equal(row.receipt, 'ask');
    assert.equal(row.refundable, true);
    // someone else's payments never; the list is per account
    assert.equal((await call('GET', '/v1/me/support/payments', bob.token)).body.payments.some((p: any) => first.payments.some((q: any) => q.id === p.id)), false);
    assert.equal((await call('GET', '/v1/me/support/payments')).status, 401);
    // the receipt: from Stripe once, then kept; the method with it
    const receipt = await call('GET', `/v1/me/support/payments/${row.id}/receipt`, jo.token);
    assert.match(receipt.body.url, /^https:\/\/pay\.stripe\.test\/receipts\/pi_/);
    assert.equal((await call('GET', `/v1/me/support/payments/${row.id}/receipt`, bob.token)).status, 404);
    const again = (await call('GET', '/v1/me/support/payments?limit=1', jo.token)).body.payments[0];
    assert.equal(again.method, 'blik');
    assert.equal(again.receipt, 'url');
    clock = Date.now();
  });

  it('shows test payments to an admin, a partial refund, a refund request, and a PayPal transaction', async () => {
    await call('POST', '/v1/admin/support/providers/stripe', admin.token, { mode: 'test' });
    await paidStripe(admin.token, false);
    await call('POST', '/v1/admin/support/providers/stripe', admin.token, { mode: 'live' });
    assert.equal((await call('GET', '/v1/me/support/payments', admin.token)).body.payments[0].test, true);

    const kim = await login('Kimmy');
    const { payment, intent } = await paidStripe(kim.token);
    await ask(kim.token, payment);
    let row = (await call('GET', '/v1/me/support/payments', kim.token)).body.payments[0];
    assert.equal(row.refund.status, 'pending');
    await sendStripe(refunded(intent, { refunded: false, amount_refunded: 500, receipt_url: 'https://pay.stripe.test/receipts/r1', payment_method_details: { type: 'card' } }));
    row = (await call('GET', '/v1/me/support/payments', kim.token)).body.payments[0];
    assert.equal(row.status, 'partially_refunded');
    assert.equal(row.refundedAmount, 500);
    assert.equal(row.method, 'card');
    assert.equal(row.refund.status, 'refunded');

    const finn = await login('Finn');
    const pp = (await call('GET', '/v1/me/support/payments', finn.token)).body.payments[0];
    assert.equal(pp.provider, 'paypal');
    assert.equal(pp.transaction, 'CAPF1');
    assert.equal(pp.status, 'refunded');
    assert.equal((await call('GET', `/v1/me/support/payments/${pp.id}/receipt`, finn.token)).body.transaction, 'CAPF1');
  });
});
