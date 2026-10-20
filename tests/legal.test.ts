import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legalUrl } from '../src/renderer/legal';
import { setLang, t } from '../src/shared/i18n';

test('the legal documents are the server\'s own pages, in the launcher\'s language', () => {
  assert.equal(legalUrl('https://client.slash3rss.dev', 'terms', 'pl'), 'https://client.slash3rss.dev/regulamin');
  assert.equal(legalUrl('https://client.slash3rss.dev/', 'privacy', 'pl'), 'https://client.slash3rss.dev/polityka-prywatnosci');
  assert.equal(legalUrl('https://client.slash3rss.dev', 'terms', 'en'), 'https://client.slash3rss.dev/terms');
  assert.equal(legalUrl('http://localhost:8787', 'privacy', 'en'), 'http://localhost:8787/privacy');
  assert.equal(legalUrl('https://client.slash3rss.dev', 'support-terms', 'pl'), 'https://client.slash3rss.dev/wsparcie/regulamin');
  assert.equal(legalUrl('javascript:alert(1)', 'terms', 'pl'), undefined);
  assert.equal(legalUrl('https://evil.example/path', 'terms', 'pl'), undefined);
  assert.equal(legalUrl('', 'terms', 'pl'), undefined);
});

test('the legal texts speak English too', () => {
  setLang('en');
  assert.equal(t('Logując się, akceptujesz '), 'By signing in you accept the ');
  assert.equal(t('O programie / Informacje prawne'), 'About / Legal information');
  assert.equal(t('Zaktualizowaliśmy regulamin'), 'We have updated the Terms of Service');
  setLang('pl');
  assert.equal(t('Regulamin'), 'Regulamin');
});
