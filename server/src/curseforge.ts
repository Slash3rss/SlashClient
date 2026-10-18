/**
 * /v1/curseforge/...: the launcher's CurseForge searches and installs go through here, because
 * the CurseForge API needs a key (CURSEFORGE_API_KEY) that must not ship inside the launcher.
 * Only the read-only endpoints the launcher uses are passed on, Minecraft only (game 432),
 * and answers are kept for a few minutes so a popular search does not spend the key's quota.
 * Without a key every call answers 503 { error: 'curseforge_unavailable' }.
 */

const API = 'https://api.curseforge.com/v1';
const MINECRAFT = 432;
const CACHE_MS = 10 * 60_000;
const MAX_CACHED = 2000;
/** The bulk endpoints take at most this many ids per call (a big modpack is a few hundred). */
const MAX_IDS = 1000;

/** Query parameters the launcher sends, per endpoint; anything else is dropped. */
const SEARCH_PARAMS = ['classId', 'categoryId', 'gameVersion', 'searchFilter', 'sortField', 'sortOrder', 'modLoaderType', 'index', 'pageSize', 'slug'];
const FILES_PARAMS = ['gameVersion', 'modLoaderType', 'index', 'pageSize'];

interface Route { method: 'GET' | 'POST'; pattern: RegExp; params?: string[]; idsKey?: 'modIds' | 'fileIds' }

const ROUTES: Route[] = [
  { method: 'GET', pattern: /^\/mods\/search$/, params: SEARCH_PARAMS },
  { method: 'GET', pattern: /^\/mods\/\d{1,10}$/ },
  { method: 'GET', pattern: /^\/mods\/\d{1,10}\/files$/, params: FILES_PARAMS },
  { method: 'GET', pattern: /^\/mods\/\d{1,10}\/files\/\d{1,10}$/ },
  // several mods or files at once (a modpack's list): POST, but still only reading
  { method: 'POST', pattern: /^\/mods$/, idsKey: 'modIds' },
  { method: 'POST', pattern: /^\/mods\/files$/, idsKey: 'fileIds' },
];

export interface ProxyAnswer { status: number; body: string }

const error = (status: number, code: string): ProxyAnswer => ({ status, body: JSON.stringify({ error: code }) });

export function createCurseForge(opts: { apiKey?: string; fetchImpl: typeof fetch; cacheMs?: number }) {
  const cache = new Map<string, { at: number; answer: ProxyAnswer }>();
  const cacheMs = opts.cacheMs ?? CACHE_MS;

  /** `path` is what follows /v1/curseforge; `body` the parsed JSON of a POST. */
  async function request(method: string, path: string, query: URLSearchParams, body?: Record<string, unknown>): Promise<ProxyAnswer> {
    const route = ROUTES.find((r) => r.method === method && r.pattern.test(path));
    if (!route) return error(404, 'not_found');
    if (!opts.apiKey) return error(503, 'curseforge_unavailable');

    const params = new URLSearchParams();
    if (route.pattern.source.includes('search')) params.set('gameId', String(MINECRAFT));
    for (const name of route.params ?? []) {
      const value = query.get(name);
      if (value !== null && value.length <= 100) params.set(name, value);
    }
    let payload: string | undefined;
    if (route.idsKey) {
      const ids = body?.[route.idsKey];
      if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) return error(400, 'bad_request');
      // the same list in another order is the same question
      payload = JSON.stringify({ [route.idsKey]: [...new Set(ids as number[])].sort((a, b) => a - b) });
    }
    const url = `${API}${path}${params.size ? `?${params}` : ''}`;
    const key = `${method} ${url} ${payload ?? ''}`;
    const kept = cache.get(key);
    if (kept && Date.now() - kept.at < cacheMs) return kept.answer;

    let res: Response;
    try {
      res = await opts.fetchImpl(url, {
        method,
        headers: { 'x-api-key': opts.apiKey, Accept: 'application/json', 'User-Agent': 'SlashClient-server', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.error('curseforge:', (err as Error).message);
      return error(502, 'curseforge_failed');
    }
    // a wrong or revoked key: to the launcher it is the same as no key
    if (res.status === 401 || res.status === 403) {
      console.error(`curseforge: klucz odrzucony (${res.status}), sprawdź CURSEFORGE_API_KEY`);
      return error(503, 'curseforge_unavailable');
    }
    if (res.status === 404) return error(404, 'not_found');
    if (!res.ok) {
      console.error(`curseforge: ${res.status} ${path}`);
      return error(res.status === 429 ? 429 : 502, res.status === 429 ? 'rate_limited' : 'curseforge_failed');
    }
    const answer = { status: 200, body: await res.text() };
    if (cache.size >= MAX_CACHED) cache.clear();
    cache.set(key, { at: Date.now(), answer });
    return answer;
  }

  return { request, enabled: !!opts.apiKey };
}
