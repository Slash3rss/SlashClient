// Adds the links of the home page defaults (the top bar and the footer) that the published home page
// lacks, in both languages, as a new published version: e.g. "Wiki", added to the defaults after the
// owner had saved the page in the editor. A link the page has (shown or hidden, by its address) stays
// as the owner left it; a new one goes right after the default link before it. The owner can still edit
// or roll it back in the admin panel's history.
//   node deploy/home-add-links.ts <db file>
import { DatabaseSync } from 'node:sqlite';
import { checkContent, DEFAULTS, type Item } from '../src/home/content.ts';
import { HomeStore } from '../src/home/routes.ts';

const [file] = process.argv.slice(2);
if (!file) throw new Error('usage: home-add-links.ts <db file>');
const sql = new DatabaseSync(file);
const store = new HomeStore(sql, () => Date.now());
for (const lang of ['pl', 'en'] as const) {
  const live = store.live(lang);
  const added: string[] = [];
  for (const section of ['nav', 'footer'] as const) {
    const links = (live[section].links ?? []) as Item[];
    const defaults = (DEFAULTS[lang][section].links ?? []) as Item[];
    defaults.forEach((d, i) => {
      if (links.some((l) => l.href === d.href)) return;
      // after the nearest default link before it that the page has, or first
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const k = links.findIndex((l) => l.href === defaults[j].href);
        if (k >= 0) {
          at = k + 1;
          break;
        }
      }
      links.splice(at, 0, structuredClone(d));
      added.push(`${section}: ${d.label}`);
    });
    live[section].links = links;
  }
  if (!added.length) {
    console.log(lang, 'has every default link');
    continue;
  }
  const v = store.save(lang, checkContent(live, lang), '', { publish: true, note: `Nowe linki: ${added.join(', ')}` });
  console.log(lang, 'published version', v.id, 'with', added.join(', '));
}
