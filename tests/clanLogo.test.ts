import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { ClanLogoCache, isLogoPng } from '../src/main/clanLogo';
import { squareCrop } from '../src/renderer/clanLogo';

/** A PNG's first bytes as far as the checks read them (signature and header), with an end. */
function png(w: number, h: number): Buffer {
  const header = Buffer.alloc(25);
  header.writeUInt32BE(13, 0);
  header.write('IHDR', 4, 'latin1');
  header.writeUInt32BE(w, 8);
  header.writeUInt32BE(h, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), header, deflateSync(Buffer.alloc(10)), Buffer.from('IEND')]);
}

describe('clan logos', () => {
  it('crops a picture to its centred square', () => {
    assert.deepEqual(squareCrop(64, 64), { x: 0, y: 0, side: 64 });
    assert.deepEqual(squareCrop(200, 100), { x: 50, y: 0, side: 100 });
    assert.deepEqual(squareCrop(100, 301), { x: 0, y: 100, side: 100 });
    assert.deepEqual(squareCrop(5, 2), { x: 1, y: 0, side: 2 });
  });

  it('sends only a 64×64 PNG, small enough', () => {
    assert.ok(isLogoPng(png(64, 64)));
    assert.ok(!isLogoPng(png(128, 128)));
    assert.ok(!isLogoPng(Buffer.from('not a picture at all, really not one')));
    assert.ok(!isLogoPng(Buffer.concat([png(64, 64), Buffer.alloc(33 * 1024)])));
  });

  it('fetches each version once and keeps the last few', async () => {
    const asked: string[] = [];
    const cache = new ClanLogoCache(async (p) => {
      asked.push(p);
      return png(64, 64);
    }, 2);
    await Promise.all([cache.get('wolf', 1), cache.get('wolf', 1)]);
    await cache.get('wolf', 2);
    await cache.get('bear', 5);
    await cache.get('wolf', 1);
    assert.deepEqual(asked, ['/v1/clans/wolf/logo.png?v=1', '/v1/clans/wolf/logo.png?v=2', '/v1/clans/bear/logo.png?v=5', '/v1/clans/wolf/logo.png?v=1']);
    await assert.rejects(cache.get('../x', 1));
    // what is not a logo is not kept
    const bad = new ClanLogoCache(async () => Buffer.from('<html>'));
    await assert.rejects(bad.get('wolf', 1));
  });
});
