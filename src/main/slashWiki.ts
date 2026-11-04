import { httpMessage, netFetch } from './download';
import { t } from '../shared/i18n';
import { cleanArticle, cleanIndex, isSlashWikiSlug, serverBase, type SlashWikiArticle, type SlashWikiIndex } from '../shared/slashWiki';

/**
 * The SlashClient wiki in the launcher (the Wiki view's "SlashClient" tab), from the SlashClient
 * server the launcher uses (Settings → server address): its list of pages and a page, sanitized
 * (src/shared/slashWiki.ts). Admins change the wiki in the server's panel, so answers are kept only
 * for a few minutes; the last good one is still shown when the server cannot be reached. Pictures
 * come as data: addresses, because the page may load pictures only from a few known sites.
 */

const TTL = 5 * 60 * 1000;
const MAX_PICTURE = 4 * 1024 * 1024;
const memory = new Map<string, { at: number; value: unknown }>();

/** Raised for a server without the wiki (older, or the admin switched it off): the tab is hidden. */
export class NoWikiError extends Error {}

async function getJson(url: string): Promise<unknown> {
  const res = await netFetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } });
  if (res.status === 404 || res.status === 503) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    // 404 on the list: a server from before the wiki; 503 feature_disabled: switched off
    if (res.status === 503 && body.error !== 'feature_disabled') throw new Error(httpMessage(res.status, url));
    throw new NoWikiError(res.status === 404 ? 'not_found' : 'feature_disabled');
  }
  if (!res.ok) throw new Error(httpMessage(res.status, url));
  return res.json();
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const kept = memory.get(key);
  if (kept && Date.now() - kept.at < TTL) return kept.value as T;
  try {
    const value = await load();
    memory.set(key, { at: Date.now(), value });
    if (memory.size > 200) memory.delete(memory.keys().next().value!);
    return value;
  } catch (err) {
    // offline: the last copy is better than nothing (but a server without the wiki is believed at once)
    if (kept && !(err instanceof NoWikiError)) return kept.value as T;
    throw err;
  }
}

const langOf = (lang: unknown) => (lang === 'en' ? 'en' : 'pl');

/** The list of pages, or null when the server has no wiki (the launcher hides the tab). */
export async function slashWikiIndex(socialUrl: string, lang: unknown): Promise<SlashWikiIndex | null> {
  const base = serverBase(socialUrl);
  if (!base) return null;
  const l = langOf(lang);
  try {
    return await cached(`index:${base}:${l}`, async () => cleanIndex(await getJson(`${base}/v1/wiki?lang=${l}`)));
  } catch (err) {
    if (err instanceof NoWikiError) return null;
    throw err;
  }
}

async function picture(url: string): Promise<string | undefined> {
  return cached(`img:${url}`, async () => {
    const res = await netFetch(url, { signal: AbortSignal.timeout(15_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(webp|png|jpeg)$/.test(type)) return undefined;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length <= MAX_PICTURE ? `data:${type};base64,${data.toString('base64')}` : undefined;
  }).catch(() => undefined);
}

export async function slashWikiArticle(socialUrl: string, slug: unknown, lang: unknown): Promise<SlashWikiArticle> {
  const base = serverBase(socialUrl);
  if (!base || !isSlashWikiSlug(slug)) throw new Error(t('Na wiki nie ma takiej strony.'));
  const l = langOf(lang);
  return cached(`page:${base}:${l}:${slug}`, async () => {
    let raw: unknown;
    try {
      raw = await getJson(`${base}/v1/wiki/${slug}?lang=${l}`);
    } catch (err) {
      if (err instanceof NoWikiError) throw new Error(t('Na wiki nie ma takiej strony.'));
      throw err;
    }
    const a = cleanArticle(raw, base);
    // the pictures (only the server's own /wiki/img/, as the sanitizer left them) put in as data
    const prefix = `${base}/wiki/img/`;
    const urls = [...new Set([...a.html.matchAll(/ src="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith(prefix)))];
    const data = new Map(await Promise.all(urls.map(async (u) => [u, await picture(u)] as const)));
    a.html = a.html.replace(/<img [^>]*src="([^"]+)"[^>]*>/g, (tag, u: string) => {
      const d = data.get(u);
      return d ? tag.replace(` src="${u}"`, ` src="${d}"`) : '';
    });
    return a;
  });
}
