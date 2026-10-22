import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';

const appDir = new URL('../web/app/', import.meta.url);
const { EN } = await import(String(new URL('i18n.js', appDir)));

/** Every Polish text the app shows: t('…') calls, and the lists of texts passed to t() later. */
function texts(): string[] {
  const out = new Set<string>();
  for (const file of readdirSync(appDir).filter((f) => f.endsWith('.js') && f !== 'i18n.js' && f !== 'sw.js')) {
    const s = readFileSync(new URL(file, appDir), 'utf8');
    for (const m of s.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) out.add(m[1]);
    // ERRORS in ui.js; the tabs, statuses, kinds of notifications and cosmetics' slots in main.js
    if (file === 'ui.js') for (const m of s.matchAll(/^ {2}\w+: '((?:[^'\\]|\\.)*)',$/gm)) out.add(m[1]);
    if (file === 'main.js') {
      for (const m of s.matchAll(/\['\w+', 'fa-[^']*', '([^']*)'\]/g)) out.add(m[1]);
      for (const m of s.matchAll(/\['(?:online|away|busy|invisible)', '([^']*)'\]/g)) out.add(m[1]);
      for (const names of s.matchAll(/(?:KIND|SLOT)_NAMES = \{(.*?)\};/g)) for (const m of names[1].matchAll(/: '([^']*)'/g)) out.add(m[1]);
    }
  }
  return [...out];
}

describe('the phone app', () => {
  it('has every text in English too', () => {
    const all = texts();
    assert.ok(all.length > 100);
    const missing = all.filter((k) => typeof EN[k] !== 'string' || !EN[k]);
    assert.deepEqual(missing, []);
    // the same {0} {1} in both
    for (const k of all) assert.deepEqual((EN[k].match(/\{\d\}/g) ?? []).sort(), (k.match(/\{\d\}/g) ?? []).sort(), k);
  });

  describe('served by the server', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-app-'));
    let base = '';
    let app: ReturnType<typeof createApp>;
    before(async () => {
      app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, webDir: fileURLToPath(new URL('../web', import.meta.url)) });
      await new Promise<void>((r) => app.server.listen(0, r));
      base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    });
    after(async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it('at /app, with its manifest, service worker and icons', async () => {
      for (const at of ['/app', '/app/']) {
        const page = await fetch(base + at);
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.match(html, /<link rel="manifest" href="\/app\/manifest\.webmanifest">/);
        assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
      }
      const manifest = await fetch(`${base}/app/manifest.webmanifest`);
      assert.equal(manifest.headers.get('content-type'), 'application/manifest+json');
      const m = await manifest.json();
      assert.equal(m.scope, '/app/');
      assert.equal(m.display, 'standalone');
      assert.ok(m.icons.some((i: any) => i.purpose === 'maskable'));
      for (const icon of m.icons) assert.equal((await fetch(base + icon.src)).status, 200, icon.src);
      const sw = await fetch(`${base}/app/sw.js`);
      assert.equal(sw.status, 200);
      assert.match(sw.headers.get('content-type') ?? '', /javascript/);
      // the API is never kept by the service worker
      assert.match(await sw.text(), /pathname\.startsWith\('\/v1\/'\)\) return;/);
    });
  });
});
