import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supportPageUrl } from '../src/renderer/support';
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
