import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { curseForgeGallery } from '../src/main/curseforge';
import { modrinthGallery } from '../src/main/modrinth';

const cdn = (name: string) => `https://cdn.modrinth.com/data/AANobbMI/images/${name}`;

describe('modrinthGallery', () => {
  it('puts the featured picture first, then follows ordering', () => {
    const list = modrinthGallery({
      gallery: [
        { url: cdn('c.webp'), raw_url: cdn('c.png'), title: 'C', ordering: 2, featured: false },
        { url: cdn('a.webp'), raw_url: cdn('a.png'), title: 'A', ordering: 0, featured: false },
        { url: cdn('f.webp'), raw_url: cdn('f.png'), title: 'Featured', description: 'The best one', ordering: 5, featured: true },
        { url: cdn('b.webp'), raw_url: cdn('b.png'), title: 'B', ordering: 1, featured: false },
      ],
    });
    assert.deepEqual(list.map((g) => g.title), ['Featured', 'A', 'B', 'C']);
    assert.deepEqual(list[0], { thumb: cdn('f.webp'), full: cdn('f.png'), title: 'Featured', description: 'The best one' });
  });

  it('keeps the given order when ordering is equal or missing', () => {
    const list = modrinthGallery({ gallery: [{ url: cdn('1.webp') }, { url: cdn('2.webp'), ordering: 0 }, { url: cdn('3.webp') }] });
    assert.deepEqual(list.map((g) => g.thumb), [cdn('1.webp'), cdn('2.webp'), cdn('3.webp')]);
  });

  it('copes with missing fields', () => {
    const list = modrinthGallery({
      gallery: [
        { raw_url: cdn('only-raw.png') },
        { url: cdn('only-url.webp'), title: '  ', description: null },
        { title: 'no picture at all' },
        { url: 'http://insecure.example/x.png' },
        null,
      ],
    });
    assert.deepEqual(list, [
      { thumb: cdn('only-raw.png'), full: cdn('only-raw.png'), title: undefined, description: undefined },
      { thumb: cdn('only-url.webp'), full: cdn('only-url.webp'), title: undefined, description: undefined },
    ]);
    assert.deepEqual(modrinthGallery({}), []);
    assert.deepEqual(modrinthGallery({ gallery: 'nope' }), []);
  });
});

describe('curseForgeGallery', () => {
  const forge = (p: string) => `https://media.forgecdn.net/attachments/${p}`;

  it('takes the thumbnail for the strip and the full picture for the viewer, in the API order', () => {
    const list = curseForgeGallery({
      screenshots: [
        { url: forge('1/2/b.png'), thumbnailUrl: forge('thumbnails/1/2/256/256/b.png'), title: 'Second?', description: 'No, first' },
        { url: forge('1/3/a.png'), thumbnailUrl: forge('thumbnails/1/3/256/256/a.png'), title: 'A', description: '' },
      ],
    });
    assert.deepEqual(list, [
      { thumb: forge('thumbnails/1/2/256/256/b.png'), full: forge('1/2/b.png'), title: 'Second?', description: 'No, first' },
      { thumb: forge('thumbnails/1/3/256/256/a.png'), full: forge('1/3/a.png'), title: 'A', description: undefined },
    ]);
  });

  it('copes with missing fields and an older server without screenshots', () => {
    const list = curseForgeGallery({ screenshots: [{ url: forge('x.png') }, { thumbnailUrl: forge('thumbnails/y.png') }, { title: 'empty' }] });
    assert.deepEqual(list.map((g) => [g.thumb, g.full]), [[forge('x.png'), forge('x.png')], [forge('thumbnails/y.png'), forge('thumbnails/y.png')]]);
    assert.deepEqual(curseForgeGallery({}), []);
    assert.deepEqual(curseForgeGallery({ screenshots: null }), []);
  });
});
