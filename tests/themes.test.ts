import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { lookup, setLang } from '../src/shared/i18n';
import { CUSTOM, customTheme, shades, THEMES, themeCss, themeOf } from '../src/renderer/themes';

describe('the launcher themes', () => {
  it('falls back to the default for an unknown theme, and takes only a real colour as its own', () => {
    assert.equal(themeOf(undefined).id, 'blue');
    assert.equal(themeOf('from-a-newer-launcher').id, 'blue');
    assert.equal(themeOf(CUSTOM, '#FF0000').accent, '#ff0000');
    assert.equal(customTheme('red; color: x').accent, '#3b82f6');
  });
  it('makes lighter and darker shades of an accent', () => {
    const s = shades('#3b82f6');
    for (const c of [s.light, s.dark, s.pale]) assert.match(c, /^#[0-9a-f]{6}$/);
    assert.notEqual(s.light, s.dark);
  });
  it('leaves the default to style.css and keeps the seasonal looks on top', () => {
    assert.equal(themeCss(themeOf('blue')), '');
    const css = themeCss(themeOf('emerald'));
    assert.match(css, /:root:not\(\[class\*="season-"\]\) \{ --accent: #10b981/);
    assert.match(css, /\.orb-3/);
  });
  it('has an English text for every theme and the picker', () => {
    setLang('en');
    const texts = [...THEMES.map((t) => t.name), customTheme('#000000').name, 'Motyw', 'Wybierz kolor',
      'Motyw zmienia się od razu. W czasie świąt launcher może mieć świąteczny wygląd – wyłączysz go w Ustawieniach.'];
    for (const text of texts) assert.ok(lookup(text), `no English for: ${text}`);
    assert.ok(readFileSync('src/renderer/index.html', 'utf8').includes('id="top-theme"'));
    setLang('pl');
  });
});
