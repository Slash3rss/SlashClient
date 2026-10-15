import { fetchJson } from './download';

const BASE = 'https://launchercontent.mojang.com';

export interface NewsItem {
  id: string;
  title: string;
  version: string;
  type: 'release' | 'snapshot' | string;
  date: string;
  imageUrl?: string;
  text: string;
}

let cache: { at: number; items: NewsItem[] } | undefined;

/** Latest Java Edition patch notes from Mojang's launcher content feed. */
export async function latestNews(limit = 6): Promise<NewsItem[]> {
  if (!cache || Date.now() - cache.at > 30 * 60_000) {
    const feed = await fetchJson<{ entries: Record<string, any>[] }>(`${BASE}/v2/javaPatchNotes.json`);
    cache = {
      at: Date.now(),
      items: feed.entries
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((e) => ({
          id: String(e.id),
          title: String(e.title),
          version: String(e.version),
          type: String(e.type),
          date: String(e.date),
          imageUrl: typeof e.image?.url === 'string' && e.image.url.startsWith('/') ? BASE + e.image.url : undefined,
          text: String(e.shortText ?? ''),
        })),
    };
  }
  return cache.items.slice(0, limit);
}
