// Adds a block from the home page defaults to the published home page (both languages) as a new
// published version, right after another block, unless the page already has it. For a new section
// shipped in the defaults that the owner's published page should get too; the owner can still
// edit or roll it back in the admin panel's history.
//   node deploy/home-add-block.ts <db file> <anchor to add> <anchor to put it after>
import { DatabaseSync } from 'node:sqlite';
import { checkContent, DEFAULTS, type Item } from '../src/home/content.ts';
import { HomeStore } from '../src/home/routes.ts';

const [file, anchor, after] = process.argv.slice(2);
if (!file || !anchor) throw new Error('usage: home-add-block.ts <db file> <anchor> [after anchor]');
const sql = new DatabaseSync(file);
const store = new HomeStore(sql, () => Date.now());
for (const lang of ['pl', 'en'] as const) {
  const live = store.live(lang);
  const blocks = live.showcase.blocks as Item[];
  if (blocks.some((b) => b.anchor === anchor)) {
    console.log(lang, 'already has', anchor);
    continue;
  }
  const block = (DEFAULTS[lang].showcase.blocks as Item[]).find((b) => b.anchor === anchor);
  if (!block) throw new Error(`no default block ${anchor}`);
  const at = after ? blocks.findIndex((b) => b.anchor === after) : -1;
  blocks.splice(at >= 0 ? at + 1 : blocks.length, 0, structuredClone(block));
  const v = store.save(lang, checkContent(live, lang), '', { publish: true, note: `Nowa sekcja: ${block.title}` });
  console.log(lang, 'published version', v.id, 'with', anchor);
}
