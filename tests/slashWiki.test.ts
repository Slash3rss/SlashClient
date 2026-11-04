import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanArticle, cleanIndex, searchSlashWiki, serverBase, slashWikiImage, slashWikiLink } from '../src/shared/slashWiki';

// The SlashClient wiki in the launcher's Wiki view: the server's answers, cleaned and sanitized.

const BASE = 'http://localhost:8841';

describe('SlashClient wiki', () => {
  it('knows the server and the wiki\'s links and pictures', () => {
    assert.equal(serverBase('https://slashclient.pl/'), 'https://slashclient.pl');
    assert.equal(serverBase('file:///etc'), undefined);
    assert.deepEqual(slashWikiLink('/wiki/hud-mapa', BASE), { page: 'hud-mapa' });
    assert.deepEqual(slashWikiLink('/en/wiki/hud-mapa#minimapa', BASE), { page: 'hud-mapa', anchor: 'minimapa' });
    assert.deepEqual(slashWikiLink('https://slashclient.pl/wiki/start', BASE, ['https://slashclient.pl']), { page: 'start' });
    // another site's /wiki/ is not ours, nor the wiki's start page or a picture
    assert.equal(slashWikiLink('https://skyup.pl/wiki/klejnoty', BASE), undefined);
    assert.equal(slashWikiLink('/wiki', BASE), undefined);
    assert.equal(slashWikiLink('/wiki/img/a.webp', BASE), undefined);
    // pictures from wherever the server says, loaded from the server the launcher uses
    assert.equal(slashWikiImage('https://slashclient.pl/wiki/img/hud-mapa.webp', BASE), `${BASE}/wiki/img/hud-mapa.webp`);
    assert.equal(slashWikiImage('https://evil.example/x.png', BASE), undefined);
    assert.equal(slashWikiImage('/wiki/img/../admin.png', BASE), undefined);
  });

  it('keeps only what the panel draws from the list', () => {
    const index = cleanIndex({
      url: 'https://slashclient.pl/wiki',
      sections: [
        { id: 'hud', title: 'HUD', icon: 'fa-gauge-high', pages: [
          { slug: 'hud-mapa', title: 'Mapa', description: 'Minimapa i pełna mapa', icon: 'fa-map', order: 10, headings: ['Minimapa', 'Tryb jaskiń'] },
          { slug: '../zle', title: 'x' },
          { slug: 'hud-czat', title: 'Czat', icon: 'fa-solid fa-x" onclick="y' },
        ] },
        { id: 'pusty', title: 'Pusty', pages: [] },
      ],
    });
    assert.equal(index.sections.length, 1);
    assert.deepEqual(index.sections[0].pages.map((p) => p.slug), ['hud-mapa', 'hud-czat']);
    assert.equal(index.sections[0].pages[1].icon, 'fa-file-lines');
    assert.deepEqual(searchSlashWiki(index, 'jaskin').map((p) => p.slug), ['hud-mapa']);
    assert.deepEqual(searchSlashWiki(index, 'czat').map((p) => p.slug), ['hud-czat']);
    assert.deepEqual(searchSlashWiki(index, 'mapa nic'), []);
    assert.deepEqual(cleanIndex(null), { url: '', sections: [] });
  });

  it('sanitizes a page: wiki links open in the panel, places scroll, pictures only from the server', () => {
    const a = cleanArticle({
      slug: 'hud-mapa', title: 'Mapa', description: 'd', icon: 'fa-map', section: { id: 'hud', title: 'HUD' }, url: 'https://slashclient.pl/wiki/hud-mapa',
      html: '<section id="minimapa"><h2>Minimapa</h2><p>Zobacz <a href="/wiki/hud-czat">czat</a>, <a href="#minimapa">tu</a> i <a href="https://modrinth.com/x" rel="noopener">Modrinth</a>.</p>'
        + '<figure class="wiki-figure"><img src="https://slashclient.pl/wiki/img/hud-mapa.webp" alt="Mapa" loading="lazy"><figcaption>Mapa</figcaption></figure>'
        + '<img src="https://evil.example/a.png"><script>alert(1)</script><p onclick="x()">t</p></section>',
      toc: [{ id: 'minimapa', text: 'Minimapa' }, { id: 'bad id"', text: 'x' }], prev: null, next: { slug: 'hud-czat', title: 'Czat' },
    }, BASE);
    assert.match(a.html, /<h2 data-anchor="minimapa">Minimapa<\/h2>/);
    assert.match(a.html, /<a href="#" data-wiki="hud-czat">czat<\/a>/);
    assert.match(a.html, /<a href="#" data-anchor="minimapa">tu<\/a>/);
    assert.match(a.html, /<a href="https:\/\/modrinth.com\/x" data-external="1">Modrinth<\/a>/);
    assert.match(a.html, new RegExp(`<figure class="w-wiki-figure"><img alt="Mapa" src="${BASE}/wiki/img/hud-mapa.webp" loading="lazy"><figcaption>Mapa</figcaption></figure>`));
    assert.doesNotMatch(a.html, /evil|<script|onclick|<section/);
    assert.deepEqual(a.toc, [{ anchor: 'minimapa', title: 'Minimapa' }]);
    assert.deepEqual(a.next, { slug: 'hud-czat', title: 'Czat' });
    assert.throws(() => cleanArticle({ slug: '../x' }, BASE));
  });
});
