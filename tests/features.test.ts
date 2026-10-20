import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerLink, cleanFeatures } from '../src/renderer/features';
import { setLang, t } from '../src/shared/i18n';

test('the server\'s switches and banner are kept only as they should look', () => {
  // an older server without /v1/features: everything on, no banner
  assert.deepEqual(cleanFeatures(null), { features: {}, banner: null });
  const s = cleanFeatures({
    features: { shop: false, clans: true, groups: 'no', extra: 1 },
    banner: { id: 'abc123def456', text: 'Przerwa o 22:00', level: 'warning', link: '/wsparcie', start: 0, end: 5 },
  });
  assert.deepEqual(s.features, { shop: false, clans: true });
  assert.equal(s.banner?.textEn, 'Przerwa o 22:00');
  assert.equal(s.banner?.level, 'warning');
  assert.equal(s.banner?.end, 5);
  // a level the launcher does not know is shown as info; a banner without an id is left out
  assert.equal(cleanFeatures({ banner: { id: 'x', text: 'a', level: 'danger' } }).banner?.level, 'info');
  assert.equal(cleanFeatures({ banner: { text: 'a' } }).banner, null);
});

test('the banner\'s link opens only web pages or the server\'s own paths', () => {
  assert.equal(bannerLink('https://status.example.com/x', 'https://client.slash3rss.dev'), 'https://status.example.com/x');
  assert.equal(bannerLink('/wsparcie', 'https://client.slash3rss.dev/'), 'https://client.slash3rss.dev/wsparcie');
  assert.equal(bannerLink('//evil.example', 'https://client.slash3rss.dev'), undefined);
  assert.equal(bannerLink('javascript:alert(1)', 'https://client.slash3rss.dev'), undefined);
  assert.equal(bannerLink('/wsparcie', 'file:///C:/x'), undefined);
});

test('the switched-off texts have English', () => {
  setLang('en');
  assert.equal(t('Ta funkcja jest chwilowo wyłączona przez administratora.'), 'This feature is switched off by the administrator for now.');
  assert.equal(t('Chwilowo wyłączone przez administratora.'), 'Switched off by the administrator for now.');
  setLang('pl');
});
