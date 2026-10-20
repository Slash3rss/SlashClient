import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describePayment, type HistoryRow } from '../src/renderer/paymentHistory';
import { accountSupportUrl, refundNote, supportPageUrl } from '../src/renderer/support';
import { t, setLang } from '../src/shared/i18n';

test('the support page is the server\'s own, only for web addresses', () => {
  assert.equal(supportPageUrl('https://client.slash3rss.dev'), 'https://client.slash3rss.dev/wsparcie');
  assert.equal(supportPageUrl('https://client.slash3rss.dev/'), 'https://client.slash3rss.dev/wsparcie');
  assert.equal(supportPageUrl('http://localhost:8787'), 'http://localhost:8787/wsparcie');
  assert.equal(supportPageUrl('javascript:alert(1)'), undefined);
  assert.equal(supportPageUrl('file:///C:/x'), undefined);
  assert.equal(supportPageUrl('https://evil.example/path'), undefined);
  assert.equal(supportPageUrl(''), undefined);
});

test('the support card speaks English too', () => {
  setLang('en');
  assert.equal(t('Wesprzyj projekt'), 'Support the project');
  assert.equal(t('{0}: dla wspierających projekt (Ustawienia → Wesprzyj projekt)', 'Mecenas'), 'Mecenas: for supporters of the project (Settings → Support the project)');
  setLang('pl');
});

test('payments and refunds open the server\'s own account page', () => {
  assert.equal(accountSupportUrl('https://client.slash3rss.dev/'), 'https://client.slash3rss.dev/konto#wsparcie');
  assert.equal(accountSupportUrl('javascript:alert(1)'), undefined);
  assert.equal(refundNote('approved'), 'Zwrot zaakceptowany: pieniądze są w drodze.');
  assert.equal(refundNote('rejected', 'za późno'), 'Prośba o zwrot odrzucona: za późno');
  assert.equal(refundNote('pending'), undefined);
});

test('a payment history row says what, how, the status, the period and the refund request', () => {
  setLang('pl');
  const row: HistoryRow = {
    id: 'p_1', at: Date.UTC(2026, 9, 1), amount: 1500, currency: 'PLN', tier: 'supporter', tierName: 'Wspierający', tierNameEn: 'Supporter', kind: 'one_time', days: 30,
    renewal: false, provider: 'stripe', method: 'blik', status: 'partially_refunded', refundedAmount: 500,
    period: { from: Date.UTC(2026, 9, 1), to: Date.UTC(2026, 9, 31), endedAt: null }, test: false,
    refund: { id: 'r_1', status: 'rejected', answer: 'Płatność starsza niż 14 dni.' }, refundable: false, refundUntil: null, receipt: 'ask', transaction: '',
  };
  const d = describePayment(row);
  assert.equal(d.what, 'Wspierający · jednorazowo, 30 dni');
  assert.equal(d.how, 'Stripe · BLIK');
  assert.match(d.status, /^częściowo zwrócona \(5,00/);
  assert.ok(d.period.includes('–'));
  assert.equal(d.refund, 'Prośba o zwrot odrzucona: Płatność starsza niż 14 dni.');
  assert.equal(describePayment({ ...row, kind: 'monthly', renewal: true, provider: 'paypal', method: 'paypal', refund: { id: 'r', status: 'cancelled', answer: '' } }).what, 'Wspierający · odnowienie subskrypcji');
  assert.equal(describePayment({ ...row, provider: 'paypal', method: 'paypal' }).how, 'PayPal');
  assert.equal(describePayment({ ...row, refund: { id: 'r', status: 'cancelled', answer: '' } }).refund, '');
  setLang('en');
  assert.equal(describePayment(row).what, 'Supporter · one-time, 30 days');
  assert.equal(describePayment(row).how, 'Stripe · BLIK');
  assert.equal(t('Historia płatności'), 'Payment history');
  setLang('pl');
});
