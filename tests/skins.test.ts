import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { mcLinkBody, offlineSkinArgs, offlineSkinError, offlineSkinOf, offlineSkinUpload, readSkinFile } from '../src/main/skins';
import { lookup, setLang } from '../src/shared/i18n';

/** The first bytes of a PNG: signature + IHDR with the given size (enough for the size check). */
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe('skin files', () => {
  setLang('pl');
  it('accepts 64×64 and legacy 64×32 skins', () => {
    assert.match(readSkinFile(pngHeader(64, 64)), /^data:image\/png;base64,/);
    assert.match(readSkinFile(pngHeader(64, 32)), /^data:image\/png;base64,/);
  });
  it('rejects other sizes and non-PNG files with a clear message', () => {
    assert.throws(() => readSkinFile(pngHeader(128, 128)), /64×64 albo 64×32 piksele \(ten ma 128×128\)/);
    assert.throws(() => readSkinFile(Buffer.from('GIF89a......................')), /PNG/);
  });
});

describe('offline skins for SlashClient players', () => {
  setLang('pl');
  const list = [{ name: 'Gracz_1', hash: 'abc123', slim: true }];
  it('finds the skin of a nick without case', () => {
    assert.equal(offlineSkinOf(list, 'gracz_1')?.hash, 'abc123');
    assert.equal(offlineSkinOf(list, 'Gracz_2'), undefined);
  });
  it('tells the game the own skin of the player, and nothing odd', () => {
    assert.deepEqual(offlineSkinArgs({ name: 'Gracz_1', hash: 'abcdef12', slim: true }), ['-Dslashclient.offlineSkin=abcdef12', '-Dslashclient.offlineSkinSlim=true']);
    assert.deepEqual(offlineSkinArgs({ name: 'Gracz_1', hash: 'abcdef12', slim: false }), ['-Dslashclient.offlineSkin=abcdef12']);
    assert.deepEqual(offlineSkinArgs({ name: 'Gracz_1', hash: 'x -Dbad=1', slim: false }), []);
    assert.deepEqual(offlineSkinArgs(undefined), []);
  });
  it('sends only nicks and files the server takes', () => {
    const png = pngHeader(64, 64);
    assert.deepEqual(offlineSkinUpload('Gracz_1', png, true), { png: png.toString('base64'), slim: true });
    assert.throws(() => offlineSkinUpload('zły nick', png, false), /liter, cyfr i _/);
    assert.throws(() => offlineSkinUpload('A'.repeat(17), png, false), /16 znaków/);
    assert.throws(() => offlineSkinUpload('Gracz', pngHeader(128, 128), false), /64×64/);
    assert.throws(() => offlineSkinUpload('Gracz', Buffer.concat([png, Buffer.alloc(64 * 1024)]), false), /64 KB/);
  });
  it("says the server's refusals in plain words", () => {
    assert.match(offlineSkinError('too_many', 400) ?? '', /Usuń skin z innego konta/);
    assert.match(offlineSkinError('too_large', 413) ?? '', /64 KB/);
    assert.match(offlineSkinError('feature_disabled', 503) ?? '', /wyłączone/);
    assert.match(offlineSkinError('rate_limited', 429) ?? '', /minutę/);
    assert.equal(offlineSkinError('offline', 0), undefined);
  });
  it('links an offline account with its nick and a Microsoft one as before', () => {
    assert.deepEqual(mcLinkBody({ type: 'offline', uuid: 'u-1', name: 'Gracz' }), { uuid: 'u-1', name: 'Gracz', offline: true });
    assert.deepEqual(mcLinkBody({ type: 'msa', uuid: 'u-2', name: 'Premium' }), { uuid: 'u-2' });
  });
  it('has every text in English', () => {
    const keys = new Set<string>();
    const app = readFileSync('src/renderer/app.ts', 'utf8');
    const part = app.slice(app.indexOf('// ---------- the skin of an offline account'), app.indexOf('// ---------- skin library ----------'));
    for (const src of [part, readFileSync('src/main/skins.ts', 'utf8')]) for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
    const html = readFileSync('src/renderer/index.html', 'utf8');
    const section = html.slice(html.indexOf('id="offline-skin"'), html.indexOf('capes-box'));
    for (const m of section.matchAll(/>\s*([^<>]*\S)\s*</g)) keys.add(m[1].trim());
    keys.add('Konto offline: skin ustawiony dla graczy SlashClient. Gracze bez SlashClient zobaczą domyślny skin.');
    assert.ok(keys.size > 20);
    setLang('en');
    try {
      assert.deepEqual([...keys].filter((k) => !lookup(k)), []);
    } finally {
      setLang('pl');
    }
  });
});
