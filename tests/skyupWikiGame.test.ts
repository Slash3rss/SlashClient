import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';
import { skyupArticleHtml } from '../src/shared/skyupWiki';
import { gameArticle, pictureId } from '../src/shared/skyupWikiGame';

// The game's "Wiki SkyUp" screen: an article as blocks the game draws, and the bridge's routes for it.

describe('SkyUp wiki for the game', () => {
  it('turns an article into headings, paragraphs, lists, tables and pictures', () => {
    const raw = `<h1 id="inkubatory">Inkubatory</h1>
      <p>Inkubator <b>przyspiesza</b> uprawy. Zobacz <a href="/wiki/klejnoty#klejnoty-kupieckie">klejnoty</a> i <a href="https://example.com/x">stronę</a>.</p>
      <center><img src="https://i.imgur.com/abc.png" style="width:120px;height:60px"></center>
      <ul><li>Kaktus<ul><li>ziemniak</li></ul></li><li>Dynia <img src="https://skyup.pl/i/dynia.png" width="16" height="16"></li></ul>
      <ol><li>pierwszy</li><li>drugi</li></ol>
      <table><tr><th>Rodzaj</th><th>Koszt</th></tr><tr><td>Kaktus</td><td>redstone<br>pień</td></tr></table>
      <hr><script>alert(1)</script><p>  </p>`;
    const { blocks, pictures } = gameArticle(skyupArticleHtml(raw));
    assert.deepEqual(blocks[0], { k: 'h', level: 1, text: 'Inkubatory', anchor: 'inkubatory' });
    assert.deepEqual(blocks[1], { k: 'p', spans: [
      { t: 'Inkubator ' }, { b: 1, t: 'przyspiesza' }, { t: ' uprawy. Zobacz ' },
      { wiki: 'klejnoty', anchor: 'klejnoty-kupieckie', t: 'klejnoty' }, { t: ' i ' }, { url: 'https://example.com/x', t: 'stronę' }, { t: '.' },
    ] });
    const big = pictureId('https://i.imgur.com/abc.png');
    assert.deepEqual(blocks[2], { k: 'img', img: { id: big, w: 120, h: 60 }, center: 1 });
    assert.deepEqual(blocks.filter((b) => b.k === 'li').map((b) => b.k === 'li' && [b.depth, b.mark, b.spans.map((s) => s.t ?? (s.img ? 'img' : '')).join('|')]), [
      [1, '•', 'Kaktus'], [2, '•', 'ziemniak'], [1, '•', 'Dynia |img'], [1, '1.', 'pierwszy'], [1, '2.', 'drugi'],
    ]);
    const table = blocks.find((b) => b.k === 'table');
    assert.deepEqual(table, { k: 'table', rows: [
      [{ spans: [{ t: 'Rodzaj' }], head: 1 }, { spans: [{ t: 'Koszt' }], head: 1 }],
      [{ spans: [{ t: 'Kaktus' }] }, { spans: [{ t: 'redstone' }, { br: 1 }, { t: 'pień' }] }],
    ] });
    assert.equal(blocks[blocks.length - 1].k, 'hr');
    assert.ok(!JSON.stringify(blocks).includes('alert'));
    assert.deepEqual(Object.values(pictures).sort(), ['https://i.imgur.com/abc.png', 'https://skyup.pl/i/dynia.png']);
  });

  it('answers the game only on its own routes, with the key', async () => {
    const asked: string[] = [];
    const bridge = new GameBridge({
      call: async () => ({}),
      state: () => ({}),
      skyupWikiIndex: async () => [{ name: 'Wyspa', articles: [{ slug: 'inkubatory', title: 'Inkubatory' }] }],
      skyupWikiArticle: async (slug) => (asked.push(`article ${slug}`), { slug, blocks: [] }),
      skyupWikiSearch: async (q) => (asked.push(`search ${q}`), []),
      skyupWikiPicture: async (id) => {
        if (id !== 'a'.repeat(20)) throw new Error('not_found');
        return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      },
    });
    const { url, key } = await bridge.start();
    const req = (path: string, k = key) => fetch(url + path, { headers: { Authorization: `Bearer ${k}` } });
    assert.equal((await req('/skyup-wiki/index', 'wrong')).status, 401);
    assert.equal((await (await req('/skyup-wiki/index')).json())[0].name, 'Wyspa');
    assert.equal((await (await req('/skyup-wiki/article/inkubatory')).json()).slug, 'inkubatory');
    assert.equal((await req('/skyup-wiki/search?q=' + encodeURIComponent('łupkowa ruda'))).status, 200);
    const picture = await req('/skyup-wiki/image/' + 'a'.repeat(20));
    assert.equal(picture.headers.get('content-type'), 'image/png');
    assert.equal((await req('/skyup-wiki/image/' + 'b'.repeat(20))).status, 502);
    // no paths of its own choosing
    assert.equal((await req('/skyup-wiki/article/..%2Fadmin')).status, 403);
    assert.equal((await req('/skyup-wiki/image/https%3A%2F%2Fexample.com')).status, 403);
    assert.deepEqual(asked, ['article inkubatory', 'search łupkowa ruda']);
    bridge.stop();

    // an older launcher's bridge: the screen says the launcher needs updating
    const plain = new GameBridge({ call: async () => ({}), state: () => ({}) });
    const p = await plain.start();
    assert.equal((await fetch(p.url + '/skyup-wiki/index', { headers: { Authorization: `Bearer ${p.key}` } })).status, 404);
    plain.stop();
  });
});
