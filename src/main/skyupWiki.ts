import { httpMessage, netFetch } from './download';
import { cached } from './wiki';
import { t } from '../shared/i18n';
import { decodeEntities } from '../shared/wikiHtml';
import {
  isSkyupSlug, parseSkyupSearch, parseSkyupToc, skyupArticleHtml, skyupQueryUrl, skyupSections, SKYUP_WIKI,
  type SkyupArticle, type SkyupArticleRef, type SkyupCategory, type SkyupHit,
} from '../shared/skyupWiki';
import { gameArticle } from '../shared/skyupWikiGame';

/**
 * The SkyUp.pl wiki in the launcher (the Wiki view's second tab): the list of articles from the
 * website's side menu, an article's content and the website's own search, fetched only when the
 * player looks, cached like minecraft.wiki's answers (wiki.ts: a few days, an old copy offline)
 * and sanitized (src/shared/skyupWiki.ts) before they reach the page.
 */

/** The website's search wants at least this many letters. */
export const SKYUP_MIN_SEARCH = 3;

async function fetchText(url: string): Promise<string> {
  const res = await netFetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'text/html' } });
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${url}`);
    throw new Error(httpMessage(res.status, url));
  }
  return res.text();
}

const query = (q: Record<string, string>) => fetchText(skyupQueryUrl(q));

export function skyupIndex(): Promise<SkyupCategory[]> {
  return cached('skyup:index', async () => {
    const categories = parseSkyupToc(await fetchText(SKYUP_WIKI));
    if (!categories.length) throw new Error(t('Nie udało się odczytać spisu wiki SkyUp.pl.'));
    return categories;
  });
}

const articles = async () => (await skyupIndex()).flatMap((c) => c.articles);

export async function skyupArticle(slug: string): Promise<SkyupArticle> {
  const id = String(slug ?? '').toLowerCase();
  if (!isSkyupSlug(id)) throw new Error(t('Na wiki nie ma takiej strony.'));
  return cached(`skyup:page:${id}`, async () => {
    const [raw, list] = await Promise.all([query({ type: 'open-page', part: 'content', identifier: id }), articles().catch(() => [] as SkyupArticleRef[])]);
    const sections = skyupSections(raw);
    if (!sections.length && !raw.trim()) throw new Error(t('Na wiki nie ma takiej strony.'));
    const title = list.find((a) => a.slug === id)?.title ?? sections[0]?.title ?? id;
    return { slug: id, title, url: `${SKYUP_WIKI}/${id}`, html: skyupArticleHtml(raw), sections };
  });
}

/**
 * Which article each section is in (a search answer only has the sections): from every article's
 * list of sections, asked a few at a time, once in a few days and only when the player searches.
 */
function sectionIndex(): Promise<Record<string, SkyupArticleRef>> {
  return cached('skyup:sections', async () => {
    const list = await articles();
    const index: Record<string, SkyupArticleRef> = {};
    let next = 0;
    let failures = 0;
    const worker = async () => {
      while (next < list.length) {
        const a = list[next++];
        try {
          const toc = await query({ type: 'open-page', part: 'toc', identifier: a.slug });
          for (const m of toc.matchAll(/href="#([^"]+)"/g)) index[decodeEntities(m[1])] ??= a;
        } catch {
          failures++;
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (failures > list.length / 2) throw new Error(t('Nie udało się wczytać wiki SkyUp.pl.'));
    return index;
  });
}

export async function skyupSearch(text: string): Promise<SkyupHit[]> {
  const q = String(text ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (q.length < SKYUP_MIN_SEARCH) return [];
  return cached(`skyup:search:${q.toLocaleLowerCase('pl')}`, async () => {
    const [html, index] = await Promise.all([
      query({ type: 'search', part: 'content', search: q }),
      sectionIndex().catch(() => ({}) as Record<string, SkyupArticleRef>),
    ]);
    return parseSkyupSearch(html, q, (anchor) => index[anchor]).slice(0, 40);
  });
}

// ---------- for the game's "Wiki SkyUp" screen (bridge /skyup-wiki/…) ----------

/**
 * The pictures of the articles the game opened, id → address: the game asks for a picture by its
 * id only, so it cannot make the launcher fetch any other address.
 */
const gamePictures = new Map<string, string>();
const MAX_PICTURE_BYTES = 4 * 1024 * 1024;

/** An article as blocks the game draws itself (src/shared/skyupWikiGame.ts). */
export async function skyupGameArticle(slug: string) {
  const a = await skyupArticle(slug);
  const { blocks, pictures } = gameArticle(a.html);
  for (const [id, url] of Object.entries(pictures)) gamePictures.set(id, url);
  return { slug: a.slug, title: a.title, url: a.url, sections: a.sections, blocks };
}

/** A picture of an article the game opened, as it comes from the wiki's host. */
export async function skyupPictureBytes(id: string): Promise<Buffer> {
  const url = gamePictures.get(id);
  if (!url) throw new Error('not_found');
  const res = await netFetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(httpMessage(res.status, url));
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_PICTURE_BYTES) throw new Error('too_big');
  return data;
}
