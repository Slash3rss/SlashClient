import { rememberGamePictures } from './gamePictures';
import { cached, failed, normalize, wikiApi, type ParseResponse } from './wiki';
import { t } from '../shared/i18n';
import { MC_WIKIS, titleFromId, withoutEmptySections, type McWiki, type McWikiLang } from '../shared/mcWikiGame';
import { gameArticle, type GameBlock } from '../shared/skyupWikiGame';
import { sanitizeWikiHtml, snippetText } from '../shared/wikiHtml';

/**
 * The Minecraft Wiki for the game's "Minecraft Wiki" screen (bridge /mc-wiki/…): a search, a whole
 * article as blocks the game draws itself, and the article about what the player holds or looks at.
 * English from minecraft.wiki, Polish from the Polish wiki (mcWikiGame.ts); cached like the
 * launcher's own Wiki view (wiki.ts: a few days, an old copy offline), each language on its own.
 */

export interface McWikiHit { title: string; snippet: string }
export interface McWikiArticle { title: string; url: string; lang: McWikiLang; blocks: GameBlock[] }

/** Characters a page title can't have; a name with them is not looked up. */
const titleText = (s: unknown) => normalize(String(s ?? '').replace(/[|#<>[\]{}_]/g, ' '));

export async function mcWikiSearch(lang: McWikiLang, query: string): Promise<McWikiHit[]> {
  const wiki = MC_WIKIS[lang];
  const q = normalize(String(query ?? ''));
  if (!q) return [];
  return cached(`mc:${lang}:search:${q.toLowerCase()}`, async () => {
    const res = await wikiApi<{ query?: { search?: { title: string; snippet: string }[] } }>(
      { action: 'query', list: 'search', srsearch: q, srnamespace: '0', srlimit: '20', srprop: 'snippet' }, wiki.api);
    return (res.query?.search ?? []).map((s) => ({ title: s.title, snippet: snippetText(s.snippet ?? '') }));
  });
}

/** An article for the game: the whole page, links between its articles and its sections kept, pictures by id. */
export async function mcWikiArticle(lang: McWikiLang, title: string): Promise<McWikiArticle> {
  const wiki = MC_WIKIS[lang];
  const page = normalize(String(title ?? ''));
  if (!page) throw new Error(t('Na wiki nie ma takiej strony.'));
  const a = await cached(`mc:${lang}:game-page:${page}`, async () => {
    const res = await wikiApi<ParseResponse>({ action: 'parse', page, redirects: '1', prop: 'text', disableeditsection: '1', disablelimitreport: '1', disabletoc: '1' }, wiki.api);
    failed(res);
    const real = res.parse!.title;
    const { blocks, pictures } = gameArticle(sanitizeWikiHtml(res.parse!.text ?? '', wiki.site));
    return { title: real, url: wiki.url(real), lang, blocks: withoutEmptySections(blocks), pictures };
  });
  rememberGamePictures(a.pictures);
  return { title: a.title, url: a.url, lang: a.lang, blocks: a.blocks };
}

interface TitlesResponse {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: { title: string; missing?: boolean; invalid?: boolean; langlinks?: { lang: string; title: string }[] }[];
  };
}

/** The first of the titles that is an article on the wiki (redirects followed), with its links to other languages. */
async function firstPage(wiki: McWiki, titles: string[], langlinks?: McWikiLang) {
  const asked = [...new Set(titles.filter(Boolean))];
  if (!asked.length) return undefined;
  const res = await wikiApi<TitlesResponse>({
    action: 'query', titles: asked.join('|'), redirects: '1',
    ...(langlinks ? { prop: 'langlinks', lllang: langlinks } : {}),
  }, wiki.api);
  const step = (list: { from: string; to: string }[] | undefined, s: string) => list?.find((x) => x.from === s)?.to ?? s;
  for (const title of asked) {
    const real = step(res.query?.redirects, step(res.query?.normalized, title));
    const page = res.query?.pages?.find((p) => p.title === real && !p.missing && !p.invalid);
    if (page) return { title: page.title, other: page.langlinks?.find((l) => l.lang === langlinks)?.title };
  }
  return undefined;
}

/**
 * The article about a block, item or entity of the game, by its id and its name in the game's language.
 * In Polish: the name, then the English name from the id, on the Polish wiki; then the English article's
 * link to the Polish one; and the English article when the Polish wiki has none. Null when neither wiki has it.
 */
export async function mcWikiLookup(lang: McWikiLang, id: string, name: string): Promise<{ title: string; lang: McWikiLang } | null> {
  const english = titleFromId(id);
  const named = titleText(name);
  if (!english && !named) return null;
  return cached(`mc:${lang}:lookup:${id}:${named.toLowerCase()}`, async () => {
    if (lang === 'pl') {
      const pl = await firstPage(MC_WIKIS.pl, [named, english ?? '']);
      if (pl) return { title: pl.title, lang: 'pl' as const };
      if (!english) return null;
      const en = await firstPage(MC_WIKIS.en, [english], 'pl');
      const linked = en?.other ? await firstPage(MC_WIKIS.pl, [en.other]) : undefined;
      if (linked) return { title: linked.title, lang: 'pl' as const };
      if (en) return { title: en.title, lang: 'en' as const };
      const hit = (await mcWikiSearch('en', english))[0];
      return hit ? { title: hit.title, lang: 'en' as const } : null;
    }
    const en = await firstPage(MC_WIKIS.en, [english ?? '', named]);
    if (en) return { title: en.title, lang: 'en' as const };
    const hit = (await mcWikiSearch('en', named || english!))[0];
    return hit ? { title: hit.title, lang: 'en' as const } : null;
  });
}
