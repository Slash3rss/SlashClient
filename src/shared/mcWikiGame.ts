import type { GameBlock } from './skyupWikiGame';
import { imageSrc, MINECRAFT_WIKI, safeAnchor, wikiLink, WIKI_ORIGIN, type WikiSite } from './wikiHtml';

/**
 * The game's "Minecraft Wiki" screen (bridge /mc-wiki/…): the English minecraft.wiki, or the Polish
 * Minecraft Wiki for players with the game in Polish. pl.minecraft.wiki has no address any more,
 * so the Polish one is the community's wiki on Fandom (minecraft.fandom.com/pl, "Minecraft Wiki Polska"),
 * with its pictures on Fandom's picture host. Articles go to the game as blocks (skyupWikiGame.ts).
 */

export type McWikiLang = 'pl' | 'en';

export interface McWiki {
  lang: McWikiLang;
  api: string;
  /** The article's address in the browser. */
  url: (title: string) => string;
  /** Links, pictures and anchors as the game reads them. */
  site: WikiSite;
}

const FANDOM = 'https://minecraft.fandom.com';
const FANDOM_PL = '/pl/wiki/';

/** A link to another article for the game: not one that opens the editor for a page nobody wrote yet. */
const gameLink = (origin: string, articlePath: string) => (href: string) => {
  if (/[?&]action=/.test(href)) return undefined;
  const link = wikiLink(href, origin, articlePath);
  if (!link) return undefined;
  const anchor = link.anchor && safeAnchor(link.anchor);
  return anchor ? { page: link.page, anchor } : { page: link.page };
};

/**
 * A picture of the Polish wiki from Fandom's picture host. Fandom sends WebP unless asked for the
 * file as uploaded, and the launcher can only shrink PNG and JPEG for the game.
 */
export function fandomImage(src: string): string | undefined {
  const ok = imageSrc(src, 'https://static.wikia.nocookie.net', '/minecraft_pl_gamepedia/images/');
  if (!ok) return undefined;
  const url = new URL(ok);
  url.searchParams.set('format', 'original');
  return url.toString();
}

const pageUrl =(base: string) => (title: string) => `${base}${encodeURIComponent(title.replace(/ /g, '_'))}`;

export const MC_WIKIS: Record<McWikiLang, McWiki> = {
  en: {
    lang: 'en',
    api: `${WIKI_ORIGIN}/api.php`,
    url: pageUrl(`${WIKI_ORIGIN}/w/`),
    site: { ...MINECRAFT_WIKI, page: gameLink(WIKI_ORIGIN, '/w/'), anchors: true, stillFrames: true },
  },
  pl: {
    lang: 'pl',
    api: `${FANDOM}/pl/api.php`,
    url: pageUrl(`${FANDOM}${FANDOM_PL}`),
    site: {
      origin: FANDOM,
      page: gameLink(FANDOM, FANDOM_PL),
      image: fandomImage,
      anchors: true,
      stillFrames: true,
    },
  },
};

/** The wiki of the language the game asks for: Polish for "pl", English for anything else. */
export const mcWikiLang = (lang: unknown): McWikiLang => (lang === 'pl' ? 'pl' : 'en');

/**
 * The blocks without headings that have nothing under them: sections whose content only works on
 * the website (videos, the navigation boxes at the end) would otherwise leave a bare title.
 */
export function withoutEmptySections(blocks: GameBlock[]): GameBlock[] {
  const out: GameBlock[] = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    const next = out[out.length - 1];
    if (b.k === 'h' && (!next || (next.k === 'h' && next.level <= b.level))) continue;
    out.push(b);
  }
  return out.reverse();
}

/** An English article title from a game id ("minecraft:oak_planks" → "Oak Planks"), or undefined for an id that isn't one. */
export function titleFromId(id: string): string | undefined {
  const m = /^(?:[a-z0-9_.-]{1,64}:)?([a-z0-9_./-]{1,100})$/.exec(String(id ?? '').trim());
  if (!m) return undefined;
  const words = m[1].split('/').pop()!.split(/[_.-]+/).filter(Boolean);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : undefined;
}
