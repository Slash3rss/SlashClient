import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchJson } from './download';
import { paths } from './paths';
import { t } from '../shared/i18n';
import { imageSrc, sanitizeWikiHtml, snippetText, WIKI_ORIGIN } from '../shared/wikiHtml';

/**
 * minecraft.wiki inside the launcher (the "Wiki" view): search and articles through the MediaWiki
 * API, cleaned by sanitizeWikiHtml before they reach the page. An article comes in parts: the
 * introduction (with the infobox) and its list of sections first, each section when opened.
 * Answers are cached in memory and on disk for a few days, and a stale copy is still shown offline.
 */

const API = `${WIKI_ORIGIN}/api.php`;
const TTL = 3 * 24 * 60 * 60 * 1000;
const MEMORY_ENTRIES = 200;

export interface WikiHit {
  title: string;
  snippet: string;
  thumbnail?: string;
}

export interface WikiSection {
  index: string;
  title: string;
  level: number;
}

export interface WikiArticle {
  title: string;
  url: string;
  /** Sanitized HTML of the introduction and infobox. */
  intro: string;
  sections: WikiSection[];
}

const cacheDir = () => path.join(paths.root, 'cache', 'wiki');
const memory = new Map<string, { at: number; value: unknown }>();

const keyFile = (key: string) => path.join(cacheDir(), `${createHash('sha1').update(key).digest('hex')}.json`);

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && now - mem.at < TTL) return mem.value as T;
  const disk = await fs.readFile(keyFile(key), 'utf8').then((s) => JSON.parse(s) as { at: number; value: T }, () => undefined);
  if (disk && now - disk.at < TTL) {
    remember(key, disk.at, disk.value);
    return disk.value;
  }
  try {
    const value = await load();
    remember(key, now, value);
    await fs.mkdir(cacheDir(), { recursive: true }).then(() => fs.writeFile(keyFile(key), JSON.stringify({ at: now, value }))).catch(() => {});
    return value;
  } catch (err) {
    // offline: an old copy is better than nothing
    if (disk) return disk.value;
    throw err;
  }
}

function remember(key: string, at: number, value: unknown) {
  memory.delete(key);
  memory.set(key, { at, value });
  while (memory.size > MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
}

const api = <T>(params: Record<string, string>) =>
  fetchJson<T & { error?: { code: string; info: string } }>(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, {
    signal: AbortSignal.timeout(15_000),
  });

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 200);

interface SearchResponse {
  query?: {
    search?: { title: string; snippet: string }[];
    pages?: { title: string; thumbnail?: { source: string } }[];
  };
}

/** Builds the hit list from the API answer (search order, thumbnails matched by title). */
export function hitsFrom(res: SearchResponse): WikiHit[] {
  const thumbs = new Map((res.query?.pages ?? []).map((p) => [p.title, p.thumbnail?.source ? imageSrc(p.thumbnail.source) : undefined]));
  return (res.query?.search ?? []).map((s) => ({ title: s.title, snippet: snippetText(s.snippet ?? ''), thumbnail: thumbs.get(s.title) }));
}

export async function wikiSearch(query: string): Promise<WikiHit[]> {
  const q = normalize(String(query ?? ''));
  if (!q) return [];
  return cached(`search:${q.toLowerCase()}`, async () => {
    const res = await api<SearchResponse>({
      action: 'query', list: 'search', srsearch: q, srnamespace: '0', srlimit: '20', srprop: 'snippet',
      generator: 'search', gsrsearch: q, gsrnamespace: '0', gsrlimit: '20', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '64',
    });
    return hitsFrom(res);
  });
}

interface ParseResponse {
  error?: { code: string; info: string };
  parse?: { title: string; text?: string; sections?: { index: string; line: string; level: string; fromtitle?: string }[] };
}

const failed = (res: ParseResponse) => {
  if (res.error?.code === 'missingtitle') throw new Error(t('Na wiki nie ma takiej strony.'));
  if (res.error || !res.parse) throw new Error(t('Wiki zwróciła błąd: {0}', res.error?.info ?? '?'));
};

/** Section list of a page: only the page's own sections (those from templates can't be loaded one by one). */
export function sectionsFrom(res: ParseResponse): WikiSection[] {
  const own = (res.parse?.title ?? '').replace(/ /g, '_');
  return (res.parse?.sections ?? [])
    .filter((s) => /^\d+$/.test(s.index) && (!s.fromtitle || s.fromtitle === own))
    .map((s) => ({ index: s.index, title: snippetText(s.line), level: Number(s.level) || 2 }));
}

export async function wikiArticle(title: string): Promise<WikiArticle> {
  const page = normalize(String(title ?? ''));
  if (!page) throw new Error(t('Na wiki nie ma takiej strony.'));
  return cached(`page:${page}`, async () => {
    const common = { action: 'parse', page, redirects: '1' };
    const [intro, outline] = await Promise.all([
      api<ParseResponse>({ ...common, prop: 'text', section: '0', disableeditsection: '1', disablelimitreport: '1' }),
      api<ParseResponse>({ ...common, prop: 'sections' }),
    ]);
    failed(intro);
    failed(outline);
    const real = intro.parse!.title;
    return {
      title: real,
      url: `${WIKI_ORIGIN}/w/${encodeURIComponent(real.replace(/ /g, '_'))}`,
      intro: sanitizeWikiHtml(intro.parse!.text ?? ''),
      sections: sectionsFrom(outline),
    };
  });
}

export async function wikiSection(title: string, index: string): Promise<string> {
  const page = normalize(String(title ?? ''));
  if (!page || !/^\d{1,3}$/.test(String(index))) throw new Error(t('Na wiki nie ma takiej strony.'));
  return cached(`section:${page}:${index}`, async () => {
    const res = await api<ParseResponse>({ action: 'parse', page, redirects: '1', prop: 'text', section: String(index), disableeditsection: '1', disablelimitreport: '1' });
    failed(res);
    return sanitizeWikiHtml(res.parse!.text ?? '');
  });
}
