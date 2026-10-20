import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RankIconCache, isRankIcon } from '../src/main/rankIcons';
import { badgeChoices, rankName, safeColor } from '../src/renderer/rankBadge';

/** A PNG's first bytes as far as the checks read them (signature and header). */
function png(w: number, h: number): Buffer {
  const header = Buffer.alloc(25);
  header.writeUInt32BE(13, 0);
  header.write('IHDR', 4, 'latin1');
  header.writeUInt32BE(w, 8);
  header.writeUInt32BE(h, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), header, Buffer.from('IEND')]);
}

describe('ranks', () => {
  it('takes only 16×16 and 32×32 PNGs as rank icons', () => {
    assert.ok(isRankIcon(png(16, 16)));
    assert.ok(isRankIcon(png(32, 32)));
    assert.ok(!isRankIcon(png(64, 64)));
    assert.ok(!isRankIcon(png(16, 32)));
    assert.ok(!isRankIcon(Buffer.from('not a png at all, not a png at all, not a png')));
  });

  it('fetches icons only from rank icon addresses, once each', async () => {
    const asked: string[] = [];
    const cache = new RankIconCache(async (p) => {
      asked.push(p);
      return png(16, 16);
    });
    await assert.rejects(cache.get('/v1/clans/x/logo.png?v=1'));
    await assert.rejects(cache.get('https://evil.example/v1/ranks/vip/logo.png?v=1'));
    const url = await cache.get('/v1/ranks/vip/logo.png?v=5');
    assert.match(url, /^data:image\/png;base64,/);
    await cache.get('/v1/ranks/vip/logo.png?v=5');
    assert.deepEqual(asked, ['/v1/ranks/vip/logo.png?v=5']);
    const bad = new RankIconCache(async () => png(64, 64));
    await assert.rejects(bad.get('/v1/ranks/vip/logo.png?v=1'));
  });

  it('offers the default, every rank held and none as the badge', () => {
    const t = (s: string, ...a: (string | number)[]) => s.replace('{0}', String(a[0]));
    const ranks = [{ id: 'partner', name: 'Partner', color: '#facc15' }, { id: 'friend', name: 'Przyjaciel', nameEn: 'Friend', color: '#22c55e' }];
    assert.deepEqual(badgeChoices([], false, t), []);
    assert.deepEqual(badgeChoices(ranks, true, t).map((c) => [c.value, c.label]), [
      ['', 'Najważniejsza ranga (Partner)'], ['partner', 'Partner'], ['friend', 'Friend'], ['none', 'Bez odznaki rangi'],
    ]);
    assert.equal(rankName(ranks[1], false), 'Przyjaciel');
    assert.equal(safeColor('#ABCDEF'), '#ABCDEF');
    assert.equal(safeColor('red; background: url(x)'), '#ffffff');
  });
});
