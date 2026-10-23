import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { setLang, t } from '../src/shared/i18n';
import { hasUnseen, MIN_ROLLBACK_VERSION, pauseHolds, pauseOver, rollbackCandidates, shouldShowWhatsNew, type LauncherRelease } from '../src/shared/launcherReleases';
import { parseNotes, pauseMarker, pausedUntil } from '../server/src/releaseNotes';

/** Just enough of a page for building elements: tags, attributes, children, text. */
class FakeElement {
  tagName: string;
  children: (FakeElement | { text: string })[] = [];
  dataset: Record<string, string> = {};
  listeners: string[] = [];
  [key: string]: unknown;
  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  append(...nodes: (FakeElement | string | { text: string })[]) {
    for (const n of nodes) this.children.push(typeof n === 'string' ? { text: n } : n);
  }
  addEventListener(type: string) {
    this.listeners.push(type);
  }
}
(globalThis as Record<string, unknown>).document = {
  createElement: (tag: string) => new FakeElement(tag),
  createTextNode: (text: string) => ({ text }),
};

function walk(node: FakeElement | { text: string }, visit: (n: FakeElement | { text: string }) => void) {
  visit(node);
  if (node instanceof FakeElement) for (const c of node.children) walk(c, visit);
}

const release = (version: string, platforms?: LauncherRelease['platforms']): LauncherRelease => ({ version, date: '2026-10-01T00:00:00Z', notes: '', ...(platforms ? { platforms } : {}) });

describe('release notes in the launcher', () => {
  it('builds only its own elements: no HTML of the author, no javascript: links', async () => {
    const { notesView } = await import('../src/renderer/launcherNews.js');
    const view = notesView([
      '### Gra <img src=x onerror=alert(1)>',
      '- **ważne** i *ładne* `kod<b>`',
      '  - <script>alert(1)</script>',
      '[strona](https://client.slash3rss.dev/zmiany) [zły](javascript:alert(1)) [http](http://a.b) [dane](data:text/html,x)',
      '<iframe src="https://evil"></iframe>',
    ].join('\n')) as unknown as FakeElement;
    const tags = new Set<string>();
    const texts: string[] = [];
    const links: string[] = [];
    walk(view, (n) => {
      if (n instanceof FakeElement) {
        tags.add(n.tagName);
        if (n.tagName === 'A') links.push(String(n.href));
      } else texts.push(n.text);
    });
    for (const tag of tags) assert.ok(['DIV', 'H3', 'H4', 'UL', 'OL', 'LI', 'P', 'STRONG', 'EM', 'CODE', 'A'].includes(tag), tag);
    assert.deepEqual(links, ['https://client.slash3rss.dev/zmiany']);
    const all = texts.join('');
    // the author's tags are there as words to read, never as elements
    assert.match(all, /<img src=x onerror=alert\(1\)>/);
    assert.match(all, /<script>alert\(1\)<\/script>/);
    assert.match(all, /<iframe/);
    assert.match(all, /zły http dane/);
    // not translated by the page
    assert.equal(view.dataset.noI18n, '');
  });

  it('parses headings, nested lists and paragraphs', () => {
    const blocks = parseNotes('## A\n\n- x\n  - y\n- z\n\ntekst\ndalej');
    assert.deepEqual(blocks.map((b) => b.type), ['heading', 'list', 'paragraph']);
    const list = blocks[1] as Extract<(typeof blocks)[number], { type: 'list' }>;
    assert.equal(list.items.length, 2);
    assert.equal(list.items[0].list?.items.length, 1);
  });
});

describe('launcher releases', () => {
  it('marks a release not seen yet (the installed one counts as seen)', () => {
    assert.equal(hasUnseen('0.9.41', undefined, '0.9.40'), true);
    assert.equal(hasUnseen('0.9.40', undefined, '0.9.40'), false);
    assert.equal(hasUnseen('0.9.41', '0.9.41', '0.9.40'), false);
    assert.equal(hasUnseen('0.9.42', '0.9.41', '0.9.40'), true);
    // after going back, the release left was seen already
    assert.equal(hasUnseen('0.9.41', '0.9.41', '0.9.38'), false);
    assert.equal(hasUnseen(undefined, undefined, '0.9.40'), false);
  });

  it('offers going back only to older releases kept safe for the player\'s data, with a build for this system', () => {
    const list = [release('0.9.41'), release('0.9.40'), release('0.9.39', ['windows', 'mac']), release('0.9.38', ['linux']), release('0.9.37'), release('0.9.36'), release('0.9.35'), release('0.8.0')];
    assert.deepEqual(rollbackCandidates(list, '0.9.40', 'win32').map((r) => r.version), ['0.9.39', '0.9.37', '0.9.36']);
    assert.deepEqual(rollbackCandidates(list, '0.9.40', 'linux').map((r) => r.version), ['0.9.38', '0.9.37', '0.9.36']);
    assert.deepEqual(rollbackCandidates(list, '0.9.41', 'darwin', 2).map((r) => r.version), ['0.9.40', '0.9.39']);
    assert.deepEqual(rollbackCandidates(list, '0.9.36', 'win32'), []);
    assert.equal(MIN_ROLLBACK_VERSION, '0.9.36');
  });

  it('shows "Co nowego" at the first start of a newer version only', () => {
    assert.equal(shouldShowWhatsNew({ lastRun: '0.9.39', current: '0.9.40' }), true);
    assert.equal(shouldShowWhatsNew({ lastRun: '0.9.40', current: '0.9.40' }), false);
    assert.equal(shouldShowWhatsNew({ lastRun: '0.9.41', current: '0.9.40' }), false, 'not after going back');
    assert.equal(shouldShowWhatsNew({ lastRun: '0.9.39', current: '0.9.40', enabled: false }), false);
    // upgrading from a launcher that never noted its version: players who were here, not a fresh install
    assert.equal(shouldShowWhatsNew({ current: '0.9.40', existingPlayer: true }), true);
    assert.equal(shouldShowWhatsNew({ current: '0.9.40', existingPlayer: false }), false);
  });

  it('pauses automatic updates until a release newer than the one left', () => {
    assert.equal(pauseHolds('0.9.40', '0.9.40'), true);
    assert.equal(pauseHolds('0.9.40', '0.9.39'), true);
    assert.equal(pauseHolds('0.9.40', '0.9.41'), false);
    assert.equal(pauseHolds(undefined, '0.9.41'), false);
    assert.equal(pauseOver('0.9.40', '0.9.38'), false);
    assert.equal(pauseOver('0.9.40', '0.9.41'), true);
    assert.equal(pauseOver(undefined, '0.9.38'), true);
    // the id older launchers send with their update check says which version they left
    const id = pauseMarker('0.9.40')!;
    assert.match(id, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    assert.equal(id[14], '4');
    assert.equal(pausedUntil(id), '0.9.40');
    assert.equal(pausedUntil('6b8f2e7c-4b0e-4d8e-9a3c-2f1e0d9c8b7a'), undefined);
  });

  it('copies the player\'s settings before going back, and keeps fields it does not know', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-rollback-'));
    process.env.SLASHCLIENT_HOME = root;
    const store = await import('../src/main/store.js');
    const data = await store.loadStore();
    const later = data as unknown as { profiles: Record<string, unknown>[]; settings: Record<string, unknown> };
    later.profiles[0].fromTheFuture = { x: 1 };
    later.settings.futureSetting = 'tak';
    await store.saveStore(data);
    await fs.writeFile(path.join(root, 'config', 'gpu-preferences.json'), '{}');
    const again = (await store.loadStore()) as unknown as typeof later;
    assert.deepEqual(again.profiles[0].fromTheFuture, { x: 1 });
    assert.equal(again.settings.futureSetting, 'tak');
    const dir = await store.backupForRollback('0.9.40', '0.9.38');
    assert.match(path.basename(dir), /-0\.9\.40-to-0\.9\.38$/);
    assert.deepEqual((await fs.readdir(dir)).sort(), ['gpu-preferences.json', 'launcher.json']);
    assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'launcher.json'), 'utf8')).settings.futureSetting, 'tak');
    // only the last three copies are kept
    for (let i = 0; i < 4; i++) await store.backupForRollback('0.9.40', `0.9.3${i}`);
    assert.equal((await fs.readdir(path.join(root, 'config', 'rollback-backups'))).length, 3);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('has every text in English', () => {
    setLang('en');
    try {
      const texts = [...readFileSync('src/renderer/launcherNews.ts', 'utf8').matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]);
      texts.push('Nowości z Minecrafta', 'Nowości w launcherze', 'Automatyczne aktualizacje', 'Pokazuj „Co nowego” po aktualizacjach', 'Historia zmian', 'Wróć do poprzedniej wersji',
        'Pobieram SlashClient {0} (powrót do starszej wersji)… {1}%', 'SlashClient {0} jest gotowy – uruchom ponownie, żeby wrócić do tej wersji.', '· automatyczne aktualizacje wstrzymane');
      assert.ok(texts.length > 40);
      for (const text of texts) assert.notEqual(t(text), text, text);
      assert.equal(t('Nowości z Minecrafta'), 'Minecraft news');
      assert.equal(t('Nowości w launcherze'), 'Launcher news');
    } finally {
      setLang('pl');
    }
  });
});
