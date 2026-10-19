import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMMON_BLOCKS, comparePack, descriptionText, packRoot } from '../src/main/packPreview';
import { textureLabel } from '../src/renderer/packPreview';

/** A "PNG": the signature and a marker, enough for the comparison (pictures are not decoded). */
const png = (tag: string) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(tag)]);

function zip(files: Record<string, Buffer | string>): AdmZip {
  const z = new AdmZip();
  for (const [name, data] of Object.entries(files)) z.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data));
  // read back as a file would be
  return new AdmZip(z.toBuffer());
}

const vanilla = () => {
  const files: Record<string, Buffer> = {};
  for (const b of [...COMMON_BLOCKS, 'amethyst_block', 'lava_still']) files[`assets/minecraft/textures/block/${b}.png`] = png(`v-${b}`);
  for (const i of ['diamond_sword', 'apple', 'stick', 'apple_golden_old']) files[`assets/minecraft/textures/item/${i}.png`] = png(`v-${i}`);
  files['assets/minecraft/textures/item/golden_apple.png'] = png('v-golden_apple');
  return zip(files);
};

describe('resource pack preview', () => {
  it('finds the pack inside a folder of the zip', () => {
    assert.equal(packRoot(['pack.mcmeta', 'assets/x']), '');
    assert.equal(packRoot(['My Pack/pack.mcmeta', 'My Pack/assets/x', 'My Pack/old/pack.mcmeta']), 'My Pack/');
    assert.equal(packRoot(['assets/x']), undefined);
  });

  it('reads descriptions as text', () => {
    assert.equal(descriptionText('§6Faithful §r32x'), 'Faithful 32x');
    assert.equal(descriptionText([{ text: 'A ' }, { text: 'B', extra: [' C'] }]), 'A B C');
    assert.equal(descriptionText({ translate: 'pack.x' }), 'pack.x');
  });

  it('puts the textures the pack changes next to the game’s, common ones first', () => {
    const pack = zip({
      'Pack/pack.mcmeta': JSON.stringify({ pack: { pack_format: 34, description: [{ text: 'Ładne ' }, { text: 'bloki' }] } }),
      'Pack/pack.png': png('icon'),
      'Pack/assets/minecraft/textures/block/amethyst_block.png': png('p-amethyst'),
      'Pack/assets/minecraft/textures/block/stone.png': png('p-stone'),
      'Pack/assets/minecraft/textures/block/dirt.png': png('v-dirt'), // the same picture as the game's
      'Pack/assets/minecraft/textures/block/not_in_the_game.png': png('p-x'),
      'Pack/assets/minecraft/textures/item/diamond_sword.png': png('p-sword'),
      'Pack/assets/minecraft/textures/block/broken.png': 'not a png',
    });
    const p = comparePack(pack, vanilla());
    assert.deepEqual(p.pairs.map((x) => `${x.kind}/${x.name}`), ['item/diamond_sword', 'block/stone', 'block/amethyst_block']);
    const stone = p.pairs.find((x) => x.name === 'stone')!;
    assert.equal(Buffer.from(stone.pack.split(',')[1], 'base64').toString('latin1').slice(8), 'p-stone');
    assert.equal(Buffer.from(stone.vanilla.split(',')[1], 'base64').toString('latin1').slice(8), 'v-stone');
    // dirt is in the pack (counted) but looks the same (not shown)
    assert.deepEqual(p.changed, { blocks: 3, items: 1 });
    assert.equal(p.total.blocks, COMMON_BLOCKS.length + 2);
    assert.equal(p.description, 'Ładne bloki');
    assert.match(p.icon ?? '', /^data:image\/png;base64,/);
  });

  it('understands packs made for 1.12 and older', () => {
    const pack = zip({
      'pack.mcmeta': '{"pack":{"pack_format":3,"description":"old"}}',
      'assets/minecraft/textures/blocks/grass_top.png': png('p-grass'),
      'assets/minecraft/textures/items/apple_golden.png': png('p-gapple'),
    });
    const p = comparePack(pack, vanilla());
    assert.deepEqual(p.pairs.map((x) => x.name).sort(), ['golden_apple', 'grass_block_top']);
  });

  it('says what a pack without block or item textures changes', () => {
    const pack = zip({
      'pack.mcmeta': '{"pack":{"pack_format":34,"description":"sounds"}}',
      'assets/minecraft/sounds/random/click.ogg': 'x',
      'assets/minecraft/textures/gui/widgets.png': png('gui'),
    });
    const p = comparePack(pack, vanilla());
    assert.equal(p.pairs.length, 0);
    assert.deepEqual(p.other, ['gui', 'sounds']);
  });

  it('shows at most the given number of pairs', () => {
    const files: Record<string, Buffer | string> = { 'pack.mcmeta': '{"pack":{"description":""}}' };
    for (const b of COMMON_BLOCKS) files[`assets/minecraft/textures/block/${b}.png`] = png(`p-${b}`);
    assert.equal(comparePack(zip(files), vanilla(), 5).pairs.length, 5);
    assert.equal(textureLabel('oak_planks'), 'Oak planks');
  });
});
