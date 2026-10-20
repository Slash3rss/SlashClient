import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import type net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { after, before, describe, it } from 'node:test';
import {
  applyKeyChanges, findConflicts, freeKeys, isKeyName, keyLabel, parseKeybinds, prettyAction, suggestFixes, actionLabel,
} from '../src/main/keybinds';
import { RateLimiter, setDownloadLimit, throttled, throttleStream } from '../src/main/rateLimit';
import { downloadAll } from '../src/main/download';
import { clearDedicatedGpu, GPU_KEY, HIGH_PERFORMANCE, isOwnJava, preferDedicatedGpu, primeEnv, type RegRunner } from '../src/main/gpuPreference';
import { articleFromHref, decodeEntities, imageSrc, sanitizeWikiHtml, snippetText } from '../src/shared/wikiHtml';
import { hitsFrom, sectionsFrom } from '../src/main/wiki';
import { isSkyupSlug, parseSkyupSearch, parseSkyupToc, skyupArticleHtml, skyupImage, skyupPage, skyupQueryUrl, skyupSections, stripHighlights } from '../src/shared/skyupWiki';
import { setLang } from '../src/shared/i18n';

// ---------- key conflicts ----------

const OPTIONS = [
  'version:4325',
  'key_key.attack:key.mouse.left',
  'key_key.forward:key.keyboard.w',
  'key_key.pickItem:key.mouse.middle',
  'key_key.spectatorHotbar:key.mouse.middle',
  'key_key.saveToolbarActivator:key.keyboard.c',
  'key_key.debug.overlay:key.keyboard.f3',
  'key_key.debug.modifier:key.keyboard.f3',
  'key_key.debug.crash:key.keyboard.c',
  'key_key.debug.copyLocation:key.keyboard.c',
  'key_key.smoothCamera:key.keyboard.unknown',
  'key_key.zoom.mod:key.keyboard.c',
  'key_key.minimap.toggle:key.keyboard.unknown',
  'key_key.map.open:key.keyboard.w',
  'soundCategory_master:1.0',
].join('\r\n');

describe('key conflicts in options.txt', () => {
  before(() => setLang('pl'));

  it('parses key lines, with and without the Forge modifier', () => {
    const binds = parseKeybinds('key_key.jump:key.keyboard.space\nkey_key.sneak:key.keyboard.left.shift:NONE\nkey_key.x.y:key.keyboard.g:SHIFT\nfov:0.0\n');
    assert.deepEqual(binds, [
      { action: 'key.jump', key: 'key.keyboard.space', modifier: '', hasModifierField: false },
      { action: 'key.sneak', key: 'key.keyboard.left.shift', modifier: '', hasModifierField: true },
      { action: 'key.x.y', key: 'key.keyboard.g', modifier: 'SHIFT', hasModifierField: true },
    ]);
  });

  it('finds real conflicts, the game first, and skips unbound keys, F3 combinations and spectator overlaps', () => {
    const conflicts = findConflicts(parseKeybinds(OPTIONS));
    assert.deepEqual(conflicts, [
      { key: 'key.keyboard.w', modifier: '', actions: ['key.forward', 'key.map.open'] },
      { key: 'key.keyboard.c', modifier: '', actions: ['key.saveToolbarActivator', 'key.zoom.mod'] },
    ]);
  });

  it('a modifier makes a different key; a mod on the spectator key still conflicts', () => {
    const binds = parseKeybinds('key_key.a.b:key.keyboard.g:SHIFT\nkey_key.c.d:key.keyboard.g:NONE\nkey_key.spectatorHotbar:key.mouse.middle\nkey_key.e.f:key.mouse.middle\n');
    assert.deepEqual(findConflicts(binds), [{ key: 'key.mouse.middle', modifier: '', actions: ['key.spectatorHotbar', 'key.e.f'] }]);
  });

  it('suggests a different free key for every action that has to move', () => {
    const binds = parseKeybinds(`${OPTIONS}\nkey_key.other.k:key.keyboard.k`);
    const fixes = suggestFixes(binds);
    assert.deepEqual(fixes, [
      { action: 'key.map.open', from: 'key.keyboard.w', to: 'key.keyboard.j' },
      { action: 'key.zoom.mod', from: 'key.keyboard.c', to: 'key.keyboard.h' },
    ]);
    assert.ok(!freeKeys(binds).includes('key.keyboard.k'));
    assert.ok(!freeKeys(binds).includes('key.keyboard.c'));
  });

  it('rewrites only the chosen lines and keeps the line ends', () => {
    const next = applyKeyChanges(OPTIONS, [{ action: 'key.zoom.mod', to: 'key.keyboard.j' }]);
    assert.equal(next, OPTIONS.replace('key_key.zoom.mod:key.keyboard.c', 'key_key.zoom.mod:key.keyboard.j'));
    assert.ok(next.includes('\r\n'));
    const forge = applyKeyChanges('key_key.a.b:key.keyboard.g:SHIFT\nkey_key.c:key.keyboard.x\n', [{ action: 'key.a.b', to: 'key.keyboard.k' }]);
    assert.equal(forge, 'key_key.a.b:key.keyboard.k:NONE\nkey_key.c:key.keyboard.x\n');
    assert.equal(findConflicts(parseKeybinds(applyKeyChanges(OPTIONS, suggestFixes(parseKeybinds(OPTIONS))))).length, 0);
  });

  it('accepts only key names', () => {
    assert.ok(isKeyName('key.keyboard.left.shift'));
    assert.ok(isKeyName('key.mouse.4'));
    assert.ok(!isKeyName('key.keyboard.a\nkey_x:y'));
    assert.ok(!isKeyName('rm -rf'));
  });

  it('names keys and actions for people', () => {
    assert.equal(keyLabel('key.keyboard.left.shift'), 'Lewy Shift');
    assert.equal(keyLabel('key.keyboard.c'), 'C');
    assert.equal(keyLabel('key.keyboard.f3'), 'F3');
    assert.equal(keyLabel('key.keyboard.keypad.5'), 'Num 5');
    assert.equal(keyLabel('key.mouse.middle'), 'Środkowy przycisk myszy');
    assert.equal(keyLabel('key.keyboard.g', 'SHIFT'), 'Shift + G');
    assert.equal(prettyAction('key.journeymap.map_toggle'), 'journeymap: map toggle');
    assert.equal(actionLabel('key.forward', new Map()), 'Do przodu');
    assert.equal(actionLabel('key.hotbar.3', new Map()), 'Pasek szybkiego dostępu 3');
    assert.equal(actionLabel('key.zoom.mod', new Map([['key.zoom.mod', 'Przybliżenie']])), 'Przybliżenie');
  });
});

// ---------- download speed limit ----------

/** A clock that only moves when the limiter sleeps, so the test is exact and instant. */
function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return { now: () => now, sleep: async (ms: number) => { sleeps.push(ms); now += ms; }, sleeps, advance: (ms: number) => (now += ms) };
}

describe('download speed limit', () => {
  it('lets everything through at once without a limit', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);
    await limiter.take(50 * 1024 * 1024);
    assert.deepEqual(clock.sleeps, []);
  });

  it('keeps the average at the set rate', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);
    limiter.setRate(1024 * 1024);
    for (let i = 0; i < 64; i++) await limiter.take(64 * 1024); // 4 MiB
    // 4 MiB at 1 MiB/s takes 4 s (the first chunk is paid on credit, so slightly less)
    assert.ok(clock.now() >= 3900 && clock.now() <= 4000, `took ${clock.now()} ms`);
  });

  it('shares one limit between concurrent downloads', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);
    limiter.setRate(512 * 1024);
    const one = async () => { for (let i = 0; i < 16; i++) await limiter.take(32 * 1024); };
    await Promise.all([one(), one(), one(), one()]); // 2 MiB together
    assert.ok(clock.now() >= 3900 && clock.now() <= 4000, `took ${clock.now()} ms`);
  });

  it('allows a short burst after an idle time, but no more', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);
    limiter.setRate(1024 * 1024);
    clock.advance(10_000);
    await limiter.take(256 * 1024); // a quarter second's worth is saved up
    assert.deepEqual(clock.sleeps, []);
    await limiter.take(256 * 1024);
    assert.equal(Math.round(clock.sleeps[0]), 250);
  });

  it('turning the limit off frees waiting downloads', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(clock.now, clock.sleep);
    limiter.setRate(1000);
    limiter.setRate(0);
    await limiter.take(10_000_000);
    assert.deepEqual(clock.sleeps, []);
    assert.equal(limiter.bytesPerSecond, 0);
  });

  it('throttles a real stream and an async body', async () => {
    const limiter = new RateLimiter();
    limiter.setRate(200 * 1024);
    const chunks = Array.from({ length: 6 }, () => Buffer.alloc(16 * 1024, 1));
    const start = Date.now();
    let got = 0;
    await pipeline(Readable.from(chunks), throttleStream(limiter), new Writable({ write(c: Buffer, _e, cb) { got += c.length; cb(); } }));
    assert.equal(got, 96 * 1024);
    // 96 KiB at 200 KiB/s ≈ 480 ms minus the 16 KiB... first chunk on credit
    assert.ok(Date.now() - start >= 300, `took ${Date.now() - start} ms`);
    let n = 0;
    for await (const c of throttled((async function* () { yield* chunks; })(), limiter)) n += c.length;
    assert.equal(n, 96 * 1024);
  });
});

// ---------- dedicated GPU ----------

/** reg.exe stand-in over a map. */
function fakeReg(values = new Map<string, string>()) {
  const calls: string[][] = [];
  const reg: RegRunner = async (args) => {
    calls.push(args);
    assert.equal(args[1], GPU_KEY);
    const name = args[3];
    if (args[0] === 'query') {
      if (!values.has(name)) throw new Error('not found');
      return `\r\n${GPU_KEY}\r\n    ${name}    REG_SZ    ${values.get(name)}\r\n`;
    }
    if (args[0] === 'add') values.set(name, args[args.indexOf('/d') + 1]);
    if (args[0] === 'delete') values.delete(name);
    return '';
  };
  return { reg, values, calls };
}

describe('dedicated GPU preference', () => {
  let dir = '';
  before(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-gpu-')); });
  after(() => fs.rm(dir, { recursive: true, force: true }));

  it('only counts the launcher\'s own Java runtimes', () => {
    const runtimes = path.join(dir, 'runtimes');
    assert.ok(isOwnJava(path.join(runtimes, 'java-runtime-delta', 'windows-x64', 'bin', 'javaw.exe'), runtimes));
    assert.ok(!isOwnJava(path.join(dir, 'jdk', 'bin', 'javaw.exe'), runtimes));
    assert.ok(!isOwnJava(path.join(dir, 'runtimes-other', 'javaw.exe'), runtimes));
  });

  it('sets the preference for our Java, keeps the player\'s own values and removes only its own', async () => {
    const runtimes = path.join(dir, 'runtimes');
    const stateFile = path.join(dir, 'config', 'gpu.json');
    const java = path.join(runtimes, 'jre', 'bin', 'javaw.exe');
    const javaExe = path.join(runtimes, 'jre', 'bin', 'java.exe');
    const fake = fakeReg(new Map([[javaExe, 'GpuPreference=1;']]));
    const deps = { reg: fake.reg, stateFile, runtimesDir: runtimes };

    assert.equal(await preferDedicatedGpu(path.join(dir, 'custom', 'javaw.exe'), deps), false);
    assert.equal(fake.calls.length, 0);

    assert.equal(await preferDedicatedGpu(java, deps), true);
    assert.equal(fake.values.get(java), HIGH_PERFORMANCE);
    // the player chose power saving for java.exe: that stays
    assert.equal(fake.values.get(javaExe), 'GpuPreference=1;');
    assert.deepEqual(JSON.parse(await fs.readFile(stateFile, 'utf8')), [java]);

    assert.equal(await clearDedicatedGpu(deps), 1);
    assert.ok(!fake.values.has(java));
    assert.equal(fake.values.get(javaExe), 'GpuPreference=1;');
    await assert.rejects(fs.access(stateFile));
  });

  it('leaves a value alone that the player changed after the launcher set it', async () => {
    const runtimes = path.join(dir, 'runtimes');
    const stateFile = path.join(dir, 'config', 'gpu2.json');
    const java = path.join(runtimes, 'x', 'bin', 'javaw.exe');
    const fake = fakeReg();
    const deps = { reg: fake.reg, stateFile, runtimesDir: runtimes };
    await preferDedicatedGpu(java, deps);
    // java.exe next to it was set too; the player then changed javaw.exe
    fake.values.set(java, 'GpuPreference=0;');
    assert.equal(await clearDedicatedGpu(deps), 1);
    assert.equal(fake.values.get(java), 'GpuPreference=0;');
    assert.ok(!fake.values.has(path.join(runtimes, 'x', 'bin', 'java.exe')));
  });

  it('asks Linux for PRIME offload, with the NVIDIA variables when that driver runs', () => {
    assert.deepEqual(primeEnv(false), { DRI_PRIME: '1' });
    assert.equal(primeEnv(true).__NV_PRIME_RENDER_OFFLOAD, '1');
    assert.equal(primeEnv(true).__GLX_VENDOR_LIBRARY_NAME, 'nvidia');
  });
});

// ---------- minecraft.wiki ----------

describe('minecraft.wiki content', () => {
  it('removes scripts, styles, handlers and dangerous links', () => {
    const html = sanitizeWikiHtml(
      '<p onclick="steal()" style="color:red">Hi <script>alert(1)</script><b>there</b></p>' +
      '<a href="javascript:alert(1)">x</a><img src="https://evil.example/a.png" onerror="alert(1)">' +
      '<iframe src="https://evil.example"></iframe><style>body{display:none}</style><svg><script>alert(2)</script></svg>' +
      '<form action="https://evil.example"><input name="p"></form>',
    );
    assert.equal(html, '<p>Hi <b>there</b></p><a>x</a>');
  });

  it('turns article links into panel links and others into https links', () => {
    const html = sanitizeWikiHtml('<a href="/w/Oak_Planks#Crafting" title="Oak Planks">planks</a> <a href="/w/File:X.png">file</a> <a href="https://example.com/x?a=1&amp;b=2">ext</a> <a href="#Usage">here</a>');
    assert.equal(html,
      '<a title="Oak Planks" href="#" data-wiki="Oak Planks">planks</a> ' +
      '<a href="https://minecraft.wiki/w/File:X.png" data-external="1">file</a> ' +
      '<a href="https://example.com/x?a=1&amp;b=2" data-external="1">ext</a> <a>here</a>');
  });

  it('keeps wiki images (made absolute) and recipe grids, with prefixed classes', () => {
    const html = sanitizeWikiHtml('<span class="mcui mcui-Crafting&#95;Table"><span class="invslot"><img alt="Oak" src="/images/Invicon_Oak_Planks.png?53f69" width="32" height="32" srcset="/x 2x" decoding="async"/></span></span>');
    assert.equal(html, '<span class="w-mcui w-mcui-Crafting_Table"><span class="w-invslot"><img alt="Oak" width="32" height="32" src="https://minecraft.wiki/images/Invicon_Oak_Planks.png?53f69" loading="lazy"></span></span>');
  });

  it('drops edit links, navigation boxes and references with their content, nested ones too', () => {
    const html = sanitizeWikiHtml('<h2>Usage<span class="mw-editsection"><span>[<a href="/x">edit</a>]</span></span></h2><div class="navbox"><div><div>nav</div></div>tail</div><p>after<sup class="reference">[1]</sup></p>');
    assert.equal(html, '<h2>Usage</h2><p>after</p>');
  });

  it("drops the infobox's hidden history JSON", () => {
    const html = sanitizeWikiHtml('<table><tr><td>Yes</td></tr></table><pre class="history-json noexcerpt navigation-not-searchable">{ "title": "Beacon", "rows": [] }</pre><p>Text</p>');
    assert.equal(html, '<table><tr><td>Yes</td></tr></table><p>Text</p>');
  });

  it('escapes stray markup and closes what the source left open', () => {
    assert.equal(sanitizeWikiHtml('<p>1 < 2 > 0 & more'), '<p>1 &lt; 2 &gt; 0 &amp; more</p>');
    assert.equal(sanitizeWikiHtml('<table><tr><td colspan="2" rowspan="x">a</td></tr></table></div>'), '<table><tr><td colspan="2">a</td></tr></table>');
    assert.equal(sanitizeWikiHtml('<custom-tag>text</custom-tag><!-- c --><center>mid</center>'), 'textmid');
    assert.equal(sanitizeWikiHtml('<a href="/w/X" title="&quot;><script>">y</a>'), '<a title="&quot;&gt;&lt;script&gt;" href="#" data-wiki="X">y</a>');
  });

  it('reads link targets and image sources strictly', () => {
    assert.equal(articleFromHref('/w/Crafting_Table'), 'Crafting Table');
    assert.equal(articleFromHref('/w/Category:Mobs'), undefined);
    assert.equal(articleFromHref('https://other.wiki/w/Creeper'), undefined);
    assert.equal(imageSrc('//minecraft.wiki/images/a.png'), 'https://minecraft.wiki/images/a.png');
    assert.equal(imageSrc('https://minecraft.wiki.evil.example/images/a.png'), undefined);
    assert.equal(imageSrc('data:image/png;base64,AAAA'), undefined);
    assert.equal(decodeEntities('&#39;a&#x27; &amp;lt;'), "'a' &lt;");
  });

  it('builds search hits and the section list from API answers', () => {
    const hits = hitsFrom({
      query: {
        search: [
          { title: 'Creeper', snippet: 'A <span class="searchmatch">creeper</span> &amp; more' },
          { title: 'Head', snippet: '' },
        ],
        pages: [{ title: 'Creeper', thumbnail: { source: 'https://minecraft.wiki/images/thumb/C.png/64px-C.png' } }, { title: 'Head', thumbnail: { source: 'https://evil.example/x.png' } }],
      },
    });
    assert.deepEqual(hits, [
      { title: 'Creeper', snippet: 'A creeper & more', thumbnail: 'https://minecraft.wiki/images/thumb/C.png/64px-C.png' },
      { title: 'Head', snippet: '', thumbnail: undefined },
    ]);
    assert.deepEqual(sectionsFrom({
      parse: {
        title: 'Crafting Table',
        sections: [
          { index: '1', line: 'Obtaining', level: '2', fromtitle: 'Crafting_Table' },
          { index: '2', line: '<i>Breaking</i>', level: '3', fromtitle: 'Crafting_Table' },
          { index: 'T-1', line: 'From a template', level: '2', fromtitle: 'Template:X' },
        ],
      },
    }), [{ index: '1', title: 'Obtaining', level: 2 }, { index: '2', title: 'Breaking', level: 3 }]);
    assert.equal(snippetText('<b>a</b>\n  b'), 'a b');
  });
});

// ---------- the SkyUp.pl wiki ----------

describe('SkyUp.pl wiki content', () => {
  const PAGE = `<section id="wiki" class="wiki-toc"><form><input name="search"></form>
    <div id="wiki-toc" class="container">
      <i>Ogólne</i>
      <ul><li><a href="/wiki/anyblock">AnyBlock</a></li><li><a href="/wiki/plan-tygodnia">Plan tygodnia</a></li></ul>
      <i>Pusta</i><ul></ul>
      <i>Dodatki</i>
      <ul><li><a href="/wiki/inkubatory">Inkubatory</a></li><li><a href="/wiki/ulepszenia-lejow">Ulepszenia lej&#243;w</a></li>
      <li><a href="https://evil.example/wiki/x">Obcy</a></li><li><a href="/wiki/anyblock">AnyBlock again</a></li></ul>
    </div><div><a href="/wiki/poza-spisem">Poza</a></div></section>`;

  it('reads the categories and articles from the side menu', () => {
    assert.deepEqual(parseSkyupToc(PAGE), [
      { name: 'Ogólne', articles: [{ slug: 'anyblock', title: 'AnyBlock' }, { slug: 'plan-tygodnia', title: 'Plan tygodnia' }] },
      { name: 'Dodatki', articles: [{ slug: 'inkubatory', title: 'Inkubatory' }, { slug: 'ulepszenia-lejow', title: 'Ulepszenia lejów' }] },
    ]);
    assert.deepEqual(parseSkyupToc('<html>no menu</html>'), []);
  });

  it('turns an article into safe HTML with section anchors, panel links and allowed pictures', () => {
    const html = skyupArticleHtml(
      '<div class="container subpage-content wiki-page"><h1 id="czym-są-inkubatory?">Czym są Inkubatory?</h1>' +
      '<p>Przez <a href="/wiki/ulepszenia-lejow">lej</a>, <a href="/wiki/klejnoty#klejnoty-kupieckie">klejnot</a>, ' +
      '<a href="#lista-petów">niżej</a>, <a href="https://www.youtube.com/watch?v=x">film</a>, <a href="javascript:alert(1)">zło</a></p>' +
      '<table class="table table-bordered tableau-table"><tr><th class="a-c">A</th><td class="a-c" colspan="2"><img style="width: 80%; height:80%" src="https://img.ssrv.it/i/krncn.png" onerror="x()"></td></tr></table>' +
      '<center><img style="height:16px; width:auto;" src="http://skyup.pl/public/tag/a.png" alt="Tag"></center>' +
      '<img src="https://imgur.com/3Dr5pQS.png"><img src="/static/checked-checkbox-16.png"><img src="https://evil.example/a.png"><img src="http://i.imgur.com/a.png">' +
      '<iframe src="https://www.youtube.com/embed/x"></iframe><h2 id="x" onclick="y()">Pod</h2></div>',
    );
    assert.equal(html,
      '<div class="w-container w-subpage-content w-wiki-page"><h2 data-anchor="czym-są-inkubatory?">Czym są Inkubatory?</h2>' +
      '<p>Przez <a href="#" data-wiki="ulepszenia-lejow">lej</a>, <a href="#" data-wiki="klejnoty" data-anchor="klejnoty-kupieckie">klejnot</a>, ' +
      '<a href="#" data-anchor="lista-petów">niżej</a>, <a href="https://www.youtube.com/watch?v=x" data-external="1">film</a>, <a>zło</a></p>' +
      '<table class="w-table w-table-bordered w-tableau-table"><tr><th class="w-a-c">A</th><td class="w-a-c" colspan="2"><img src="https://img.ssrv.it/i/krncn.png" loading="lazy"></td></tr></table>' +
      '<div class="w-center"><img alt="Tag" height="16" src="https://skyup.pl/public/tag/a.png" loading="lazy"></div>' +
      '<img src="https://i.imgur.com/3Dr5pQS.png" loading="lazy"><img src="https://skyup.pl/static/checked-checkbox-16.png" loading="lazy">' +
      '<h3 data-anchor="x">Pod</h3></div>');
  });

  it('keeps minecraft.wiki strict: no SkyUp hosts, no anchors, no sizes from styles', () => {
    assert.equal(sanitizeWikiHtml('<h2 id="a">A</h2><a href="#a">x</a><img src="https://i.imgur.com/a.png"><img style="width:16px" src="/images/a.png"><h1>t</h1>'),
      '<h2>A</h2><a>x</a><img src="https://minecraft.wiki/images/a.png" loading="lazy">t');
  });

  it('reads link targets and pictures strictly', () => {
    assert.deepEqual(skyupPage('/wiki/pety'), { page: 'pety' });
    assert.deepEqual(skyupPage('https://wiki.skyup.pl/wiki/Pety/#lista'), { page: 'pety', anchor: 'lista' });
    assert.equal(skyupPage('/dungeony#drop'), undefined);
    assert.equal(skyupPage('https://skyup.pl.evil.example/wiki/pety'), undefined);
    assert.equal(skyupPage('/wiki/../admin'), undefined);
    assert.equal(skyupPage('/wiki/%3Cspan%3E'), undefined);
    assert.equal(skyupImage('https://skyup.pl:8443/a.png'), undefined);
    assert.equal(skyupImage('https://imgur.com/gallery/x'), undefined);
    assert.equal(skyupImage('data:image/png;base64,AAAA'), undefined);
    assert.equal(isSkyupSlug('limity-blokow'), true);
    assert.equal(isSkyupSlug('a"b'), false);
    assert.equal(skyupQueryUrl({ type: 'open-page', part: 'content', identifier: 'pety' }),
      'https://skyup.pl/wiki/query/%7B%22type%22%3A%22open-page%22%2C%22part%22%3A%22content%22%2C%22identifier%22%3A%22pety%22%7D');
  });

  it('strips the search highlight, also from inside links', () => {
    const raw = '<p>Sprzedaj <a href="/wiki/&lt;span style=&quot;background-color: yellow&quot;&gt;klejnot&lt;/span&gt;y"><span style="background-color: yellow">Klejnot</span>em</a> &lt;/span&gt;</p>';
    assert.equal(stripHighlights(raw), '<p>Sprzedaj <a href="/wiki/klejnoty">Klejnotem</a> &lt;/span&gt;</p>');
    assert.equal(skyupArticleHtml(raw), '<p>Sprzedaj <a href="#" data-wiki="klejnoty">Klejnotem</a> &lt;/span&gt;</p>');
  });

  it('builds search hits with their article and a snippet around the match', () => {
    const html = '<div class="wiki-page"><h1 id="wyszukiwanie:-klejnot">Wyszukiwanie: klejnot</h1></div>' +
      '<div class="wiki-page"><h1 id="czym-są-klejnoty?">Czym są klejnoty?</h1><p><span style="background-color: yellow">Klejnot</span>y pozwalają<br>na przyspieszenie &amp; więcej.</p></div>' +
      '<div class="wiki-page"><h1 id="nieznana">Nieznana</h1><p>' + 'a'.repeat(200) + ' klejnot ' + 'b'.repeat(200) + '</p></div>';
    const where = (anchor: string) => (anchor === 'czym-są-klejnoty?' ? { slug: 'klejnoty', title: 'Klejnoty' } : undefined);
    const hits = parseSkyupSearch(html, 'klejnot', where);
    assert.equal(hits.length, 2);
    assert.deepEqual(hits[0], { anchor: 'czym-są-klejnoty?', title: 'Czym są klejnoty?', snippet: 'Klejnoty pozwalają na przyspieszenie & więcej.', slug: 'klejnoty', article: 'Klejnoty' });
    assert.equal(hits[1].slug, undefined);
    assert.match(hits[1].snippet, /^…a+ klejnot b+…$/);
    assert.ok(hits[1].snippet.length < 170);
    assert.deepEqual(skyupSections(html).map((s) => s.anchor), ['wyszukiwanie:-klejnot', 'czym-są-klejnoty?', 'nieznana']);
  });
});

// ---------- the limiter on real downloads ----------

describe('download limit in downloadAll', () => {
  let server: http.Server;
  let base = '';
  let dir = '';
  before(async () => {
    server = http.createServer((_req, res) => res.end(Buffer.alloc(256 * 1024, 7)));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-dl-'));
  });
  after(async () => {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
    setDownloadLimit(0);
  });

  it('slows downloadAll down to the set limit', async () => {
    setDownloadLimit(1); // 1 MiB/s: 4 × 256 KiB ≈ 1 s
    const start = Date.now();
    await downloadAll(Array.from({ length: 4 }, (_, i) => ({ url: `${base}/f${i}`, dest: path.join(dir, `f${i}`) })));
    const took = Date.now() - start;
    assert.ok(took >= 700, `took ${took} ms`);
    assert.equal((await fs.stat(path.join(dir, 'f3'))).size, 256 * 1024);
  });
});
