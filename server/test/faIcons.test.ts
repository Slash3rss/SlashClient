import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const fa = path.join(import.meta.dirname, '../web/vendor/fa');

/** The names the vendored stylesheet draws (read as the server reads them). */
function cssNames(): Set<string> {
  const css = readFileSync(path.join(fa, 'css/all.min.css'), 'utf8');
  const names = new Set<string>();
  for (const rule of css.split('}')) {
    const brace = rule.indexOf('{');
    if (brace < 0 || !rule.startsWith('--fa:', brace + 1)) continue;
    for (const m of rule.slice(0, brace).matchAll(/\.fa-([a-z0-9-]+)/g)) names.add(m[1]);
  }
  return names;
}

describe('the admin panel icon picker list', () => {
  it('has only icons the vendored Font Awesome draws, each with a style (else run scripts/make-fa-icons.mjs)', () => {
    const { icons } = JSON.parse(readFileSync(path.join(fa, 'icons.json'), 'utf8')) as { icons: [string, string, string][] };
    const css = cssNames();
    assert.ok(icons.length > 1000);
    for (const [name, styles] of icons) {
      assert.ok(css.has(name), `${name} is not in all.min.css`);
      assert.match(styles, /^s?r?b?$/);
      assert.ok(styles.length > 0);
    }
    for (const common of ['star', 'heart', 'house', 'discord', 'gear']) assert.ok(icons.some(([n]) => n === common), common);
  });
});
