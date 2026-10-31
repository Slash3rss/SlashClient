import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';
import { MC_WIKIS, mcWikiLang, titleFromId, withoutEmptySections } from '../src/shared/mcWikiGame';
import { gameArticle, pictureId, type GameBlock } from '../src/shared/skyupWikiGame';
import { articleFromHref, sanitizeWikiHtml, wikiLink } from '../src/shared/wikiHtml';

// The game's "Minecraft Wiki" screen: minecraft.wiki (and the Polish wiki on Fandom) as blocks, and the bridge's routes for it.

describe('Minecraft Wiki for the game', () => {
  it('turns a minecraft.wiki article into blocks with links between articles, anchors and pictures', () => {
    const raw = `<div class="mw-parser-output"><p><a class="mw-selflink selflink">Diamond</a> is a <a href="/w/Mineral">mineral</a>
      from <a href="/w/Diamond_Ore#Natural_generation">diamond ore</a>, see <a href="#Mining">below</a>,
      <a href="/w/Nothing_yet?action=edit&amp;redlink=1">a missing page</a>, <a href="/w/File:Diamond.png">its file</a>
      and <a href="https://example.com/x">elsewhere</a>.
      <img src="/images/Diamond.png?7a1b2" width="16" height="16"><img src="https://evil.example/x.png" width="16" height="16"></p>
      <div class="mw-heading mw-heading2"><h2 id="Obtaining">Obtaining</h2></div>
      <h3 id="Mining">Mining</h3><p>Use an iron pickaxe.</p>
      <div class="navbox"><a href="/w/Ores">Ores</a></div></div>`;
    const { blocks, pictures } = gameArticle(sanitizeWikiHtml(raw, MC_WIKIS.en.site));
    const id = pictureId('https://minecraft.wiki/images/Diamond.png?7a1b2');
    assert.deepEqual(blocks[0], { k: 'p', spans: [
      { t: 'Diamond is a ' }, { wiki: 'Mineral', t: 'mineral' }, { t: ' from ' },
      { wiki: 'Diamond Ore', anchor: 'Natural_generation', t: 'diamond ore' }, { t: ', see ' }, { anchor: 'Mining', t: 'below' },
      { t: ', ' }, { url: 'https://minecraft.wiki/w/Nothing_yet?action=edit&redlink=1', t: 'a missing page' }, { t: ', ' },
      { url: 'https://minecraft.wiki/w/File:Diamond.png', t: 'its file' }, { t: ' and ' }, { url: 'https://example.com/x', t: 'elsewhere' },
      { t: '. ' }, { img: { id, w: 16, h: 16 } },
    ] });
    assert.deepEqual(blocks.slice(1), [
      { k: 'h', level: 1, text: 'Obtaining', anchor: 'Obtaining' },
      { k: 'h', level: 2, text: 'Mining', anchor: 'Mining' },
      { k: 'p', spans: [{ t: 'Use an iron pickaxe.' }] },
    ]);
    assert.deepEqual(pictures, { [id]: 'https://minecraft.wiki/images/Diamond.png?7a1b2' });
  });

  it('reads the Polish wiki on Fandom: anchors on the heading span, its article links and its lazy pictures as PNG', () => {
    const raw = `<h2><span class="mw-headline" id="Otrzymywanie">Otrzymywanie</span></h2>
      <p>Z <a href="/pl/wiki/Z%C5%82o%C5%BCe_diamentu" title="Złoże diamentu">złoża</a>, <a href="/pl/wiki/Plik:Diament.png">plik</a>,
      <a href="https://minecraft.wiki/w/Diamond">angielska</a>.
      <img src="data:image/gif;base64,R0lGODlhAQABAIABAAAAAP" data-src="https://static.wikia.nocookie.net/minecraft_pl_gamepedia/images/a/a9/Kilof.png/revision/latest?cb=2012" width="19" height="15" class="lazyload"></p>`;
    const { blocks, pictures } = gameArticle(sanitizeWikiHtml(raw, MC_WIKIS.pl.site));
    const url = 'https://static.wikia.nocookie.net/minecraft_pl_gamepedia/images/a/a9/Kilof.png/revision/latest?cb=2012&format=original';
    assert.deepEqual(blocks[0], { k: 'h', level: 1, text: 'Otrzymywanie', anchor: 'Otrzymywanie' });
    assert.deepEqual(blocks[1], { k: 'p', spans: [
      { t: 'Z ' }, { wiki: 'Złoże diamentu', t: 'złoża' }, { t: ', ' }, { url: 'https://minecraft.fandom.com/pl/wiki/Plik:Diament.png', t: 'plik' },
      { t: ', ' }, { url: 'https://minecraft.wiki/w/Diamond', t: 'angielska' }, { t: '. ' }, { img: { id: pictureId(url), w: 19, h: 15 } },
    ] });
    assert.deepEqual(Object.values(pictures), [url]);
    assert.equal(MC_WIKIS.pl.url('Stół rzemieślniczy'), 'https://minecraft.fandom.com/pl/wiki/St%C3%B3%C5%82_rzemie%C5%9Blniczy');
    assert.equal(MC_WIKIS.en.url('Crafting Table'), 'https://minecraft.wiki/w/Crafting_Table');
  });

  it('keeps only the shown frame of crafting slots and infobox picture tabs', () => {
    const img = (n: string) => `<img src="/images/${n}.png" width="32" height="32">`;
    const raw = `<div class="infobox-imagearea animated-container"><div class="tabber"><div class="tabbertab" data-title="Oak">${img('Oak')}</div>
      <div class="tabbertab" data-title="Spruce">${img('Spruce')}</div></div></div>
      <table><tr><td><span class="invslot animated"><span class="invslot-item animated-active">${img('A')}</span><span class="invslot-item">${img('B')}</span><span class="invslot-item">${img('C')}</span></span>
      <span class="invslot">${img('D')}</span></td></tr></table>`;
    const shown = (html: string) => Object.values(gameArticle(html).pictures).map((u) => u.replace(/^.*\/|\.png$/g, ''));
    assert.deepEqual(shown(sanitizeWikiHtml(raw, MC_WIKIS.en.site)), ['Oak', 'A', 'D']);
    // the launcher's panel runs the frames itself
    assert.deepEqual(shown(sanitizeWikiHtml(raw)), ['Oak', 'Spruce', 'A', 'B', 'C', 'D']);
  });

  it('keeps the launcher\'s own Wiki view as it was', () => {
    assert.equal(articleFromHref('/w/Crafting_Table#Usage'), 'Crafting Table');
    assert.equal(articleFromHref('/pl/wiki/Deski', 'https://minecraft.fandom.com', '/pl/wiki/'), 'Deski');
    assert.equal(articleFromHref('/pl/wiki/U%C5%BCytkownik:Kto%C5%9B', 'https://minecraft.fandom.com', '/pl/wiki/'), undefined);
    assert.deepEqual(wikiLink('/w/Oak_Planks#Crafting'), { page: 'Oak Planks', anchor: 'Crafting' });
    // the launcher's panel has no anchors, and a wiki link has no place on the page there
    assert.equal(sanitizeWikiHtml('<h2 id="Usage">Usage</h2><a href="/w/Stick#Usage">stick</a>'), '<h2>Usage</h2><a href="#" data-wiki="Stick">stick</a>');
  });

  it('names articles from game ids and drops sections left empty', () => {
    assert.equal(titleFromId('minecraft:oak_planks'), 'Oak Planks');
    assert.equal(titleFromId('crafting_table'), 'Crafting Table');
    assert.equal(titleFromId('minecraft:block/diamond_ore'), 'Diamond Ore');
    assert.equal(titleFromId('Minecraft:Oak Planks'), undefined);
    assert.equal(titleFromId(''), undefined);
    assert.equal(mcWikiLang('pl'), 'pl');
    assert.equal(mcWikiLang('de'), 'en');
    assert.equal(mcWikiLang(undefined), 'en');
    const h = (level: 1 | 2 | 3, text: string): GameBlock => ({ k: 'h', level, text });
    const p: GameBlock = { k: 'p', spans: [{ t: 'x' }] };
    assert.deepEqual(withoutEmptySections([h(1, 'A'), h(2, 'A1'), p, h(1, 'Videos'), h(1, 'B'), p, h(1, 'Navigation')]),
      [h(1, 'A'), h(2, 'A1'), p, h(1, 'B'), p]);
  });

  it('answers the game on its routes, in the language it asks for', async () => {
    const asked: string[] = [];
    const bridge = new GameBridge({
      call: async () => ({}),
      state: () => ({}),
      mcWikiSearch: async (lang, q) => (asked.push(`search ${lang} ${q}`), [{ title: 'Diament', snippet: '' }]),
      mcWikiArticle: async (lang, title) => {
        asked.push(`article ${lang} ${title}`);
        if (title === 'Brak') throw new Error('Na wiki nie ma takiej strony.');
        return { title, url: '', lang, blocks: [] };
      },
      mcWikiLookup: async (lang, id, name) => (asked.push(`lookup ${lang} ${id} ${name}`), id === 'minecraft:air' ? null : { title: 'Deski', lang }),
      mcWikiPicture: async (id) => {
        if (id !== 'a'.repeat(20)) throw new Error('not_found');
        return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      },
    });
    const { url, key } = await bridge.start();
    const req = (path: string, k = key) => fetch(url + path, { headers: { Authorization: `Bearer ${k}` } });
    assert.equal((await req('/mc-wiki/search?lang=pl&q=diament', 'wrong')).status, 401);
    assert.deepEqual(await (await req('/mc-wiki/search?lang=pl&q=' + encodeURIComponent('złoże diamentu'))).json(), [{ title: 'Diament', snippet: '' }]);
    assert.equal((await (await req('/mc-wiki/article?lang=xx&title=' + encodeURIComponent('Crafting Table'))).json()).lang, 'en');
    const missing = await req('/mc-wiki/article?lang=pl&title=Brak');
    assert.equal(missing.status, 502);
    assert.equal((await missing.json()).error, 'Na wiki nie ma takiej strony.');
    const found = await req('/mc-wiki/lookup?lang=pl&id=minecraft:oak_planks&name=' + encodeURIComponent('Deski dębowe'));
    assert.deepEqual(await found.json(), { title: 'Deski', lang: 'pl' });
    const none = await req('/mc-wiki/lookup?id=minecraft:air&name=Powietrze');
    assert.equal(none.status, 404);
    assert.deepEqual(await none.json(), { error: 'not_found' });
    const picture = await req('/mc-wiki/image/' + 'a'.repeat(20));
    assert.equal(picture.headers.get('content-type'), 'image/png');
    assert.equal((await req('/mc-wiki/image/' + 'b'.repeat(20))).status, 502);
    // no paths of its own choosing
    assert.equal((await req('/mc-wiki/image/https%3A%2F%2Fexample.com')).status, 403);
    assert.equal((await req('/mc-wiki/admin')).status, 403);
    assert.deepEqual(asked, [
      'search pl złoże diamentu', 'article en Crafting Table', 'article pl Brak',
      'lookup pl minecraft:oak_planks Deski dębowe', 'lookup en minecraft:air Powietrze',
    ]);
    bridge.stop();

    // an older launcher's bridge: the screen says the launcher needs updating
    const plain = new GameBridge({ call: async () => ({}), state: () => ({}) });
    const p = await plain.start();
    for (const path of ['/mc-wiki/search?lang=pl&q=diament', '/mc-wiki/article?lang=en&title=Diamond']) {
      assert.equal((await fetch(p.url + path, { headers: { Authorization: `Bearer ${p.key}` } })).status, 404);
    }
    plain.stop();
  });
});
