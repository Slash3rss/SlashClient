/**
 * /pobierz/<system>: the installer of the latest release for one system, straight to the file.
 * /aktualizacje/<file>: the same release as an update feed for the launcher (electron-updater's
 * "generic" provider): latest*.yml served from here, the files themselves as signed links.
 * /aktualizacje/v/<version>/<file>: the same for one older release (going back to a previous version).
 * /aktualizacje/beta/<file>: the beta update channel: the newest release, a beta (a GitHub pre-release,
 * v0.9.57-beta.1) or not, by its version. The installers, the stable feed and the changelog never
 * see a beta.
 * /v1/changelog: the releases' notes, for the site's /zmiany and the launcher.
 * The release list comes from GitHub (kept for a few minutes). With RELEASES_TOKEN set, a
 * private repository works too: GitHub hands out a short-lived signed link to the file,
 * and the visitor is sent there, so the token never leaves the server.
 */

import type http from 'node:http';
import { compareVersion, notesFor, parseVersion, pausedUntil } from './releaseNotes.ts';

export type DownloadOs = 'windows' | 'mac' | 'mac-intel' | 'linux';

/** Which file of a release is for which system (names from electron-builder). */
const FILES: Record<DownloadOs, RegExp> = {
  windows: /^SlashClient-Setup-[\d.]+\.exe$/,
  mac: /^SlashClient-[\d.]+-arm64\.dmg$/,
  'mac-intel': /^SlashClient-[\d.]+\.dmg$/,
  linux: /^SlashClient-[\d.]+\.AppImage$/,
};

export function isDownloadOs(os: string): os is DownloadOs {
  return Object.hasOwn(FILES, os);
}

interface Asset { name: string; url: string; browser_download_url: string }

/** A release as GitHub lists it. */
interface GhRelease { tag_name?: string; body?: string; draft?: boolean; prerelease?: boolean; published_at?: string; created_at?: string; html_url?: string; assets?: Asset[] }

/** What a release says is new, for the home page's badge: per language its text and where it leads. */
export type ReleaseNews = Partial<Record<'pl' | 'en', { text: string; href: string }>>;

/** A badge's own link: a place on the site (#section, /path) or a web page; anything else is not used. */
const safeHref = (href: string) => (/^(#[\w-]{1,60}|\/[\w\-/.#?=&%]{0,200}|https:\/\/[^\s"'<>]{1,300})$/.test(href) ? href : undefined);

/** Where a release's notes are on the site: /zmiany#0.9.40 (Polish), /changelog#0.9.40 (English). */
export function changelogLinks(tag: string | undefined): { pl: string; en: string } | undefined {
  const v = parseVersion(tag);
  return v ? { pl: `/zmiany#${v.join('.')}`, en: `/changelog#${v.join('.')}` } : undefined;
}

/**
 * The badge a release's notes carry (release-notes/vX.md, the release's description):
 * `<!-- nowosc: … -->` in Polish, `<!-- news: … -->` in English, each optionally with its own link
 * after ` | ` (`<!-- nowosc: Nowość: pupile | #kosmetyki -->`); without one the badge leads to the
 * release's notes in the changelog (`releaseUrl`: one address, or one per language). Releases with
 * nothing worth a badge have none, and the badge stays as it was.
 */
export function releaseNews(body: string | undefined, releaseUrl?: string | Partial<Record<'pl' | 'en', string>>): ReleaseNews {
  const out: ReleaseNews = {};
  const pick = (re: RegExp, lang: 'pl' | 'en') => {
    const raw = re.exec(body ?? '')?.[1]?.replace(/\s+/g, ' ').trim();
    if (!raw) return undefined;
    const [text, link] = raw.split(/\s+\|\s+/, 2);
    const fallback = typeof releaseUrl === 'string' ? releaseUrl : releaseUrl?.[lang];
    const href = (link && safeHref(link.trim())) || (fallback && safeHref(fallback)) || '#funkcje';
    return text ? { text: text.slice(0, 80), href } : undefined;
  };
  const pl = pick(/<!--\s*nowo(?:ść|sc)\s*:([^>]*?)-->/i, 'pl');
  const en = pick(/<!--\s*news\s*:([^>]*?)-->/i, 'en');
  if (pl) out.pl = pl;
  if (en) out.en = en;
  return out;
}

/** The systems a release can update (its update feed files). */
export type FeedPlatform = 'windows' | 'mac' | 'linux';
const FEEDS: Record<string, FeedPlatform> = { 'latest.yml': 'windows', 'latest-mac.yml': 'mac', 'latest-linux.yml': 'linux' };

/** One release in the changelog. */
export interface ChangelogEntry {
  version: string;
  /** When it was published (ISO). */
  date: string;
  /** Its notes (Markdown, releaseNotes.ts) in the asked language, without the badge lines. */
  notes: string;
  /** The "Nowość" badge's text, when the release has one. */
  title?: string;
  /** The systems it has an update for (latest.yml, latest-mac.yml, latest-linux.yml). */
  platforms: FeedPlatform[];
}

export function changelogEntry(r: GhRelease, lang: 'pl' | 'en'): ChangelogEntry | undefined {
  const v = parseVersion(r.tag_name);
  if (!v || r.draft || r.prerelease) return undefined;
  const news = releaseNews(r.body);
  const title = (news[lang] ?? news.pl ?? news.en)?.text;
  const platforms = [...new Set((r.assets ?? []).map((a) => FEEDS[a.name]).filter(Boolean))];
  return { version: v.join('.'), date: r.published_at ?? r.created_at ?? '', notes: notesFor(r.body, lang).slice(0, 40_000), ...(title ? { title } : {}), platforms };
}

/**
 * A launcher that went back to an older version keeps its automatic updates paused until a release
 * newer than the one it left (its update id says which, releaseNotes.ts): its update check gets the
 * release with `stagingPercentage: 0`, which electron-updater takes as "not for you yet".
 */
export function holdForPaused(yml: string, stagingId: string | string[] | undefined): string {
  const until = pausedUntil(Array.isArray(stagingId) ? stagingId[0] : stagingId);
  if (!until) return yml;
  const version = /^version:\s*['"]?([^\s'"]+)/m.exec(yml)?.[1];
  if (version && compareVersion(version, until) > 0) return yml;
  return `${yml.replace(/^stagingPercentage:.*$\n?/m, '').trimEnd()}\nstagingPercentage: 0\n`;
}

/** A release's version with a beta's part ("0.9.57-beta.1" → [0, 9, 57], ["beta", 1]); undefined when it is none. */
export function parseBeta(v: string | undefined): { nums: [number, number, number]; pre: (string | number)[] } | undefined {
  const m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:-([0-9A-Za-z.]{1,40}))?$/.exec(String(v ?? '').trim());
  if (!m) return undefined;
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre };
}

/** Compares two versions as semver does: 0.9.56 < 0.9.57-beta.1 < 0.9.57-beta.2 < 0.9.57 (a version beats none). */
export function compareBeta(a: string | undefined, b: string | undefined): number {
  const x = parseBeta(a);
  const y = parseBeta(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  // the release itself comes after its betas
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? 0 : 1) - (y.pre.length ? 0 : 1);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    if (p === q) continue;
    if (typeof p === 'number' && typeof q === 'number') return p - q;
    if (typeof p === 'number' || typeof q === 'number') return typeof p === 'number' ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

const CACHE_MS = 5 * 60_000;
const PER_PAGE = 100;

export function createDownloads(opts: { repo: string; token?: string; fetchImpl: typeof fetch }) {
  let cached: { at: number; assets: Asset[]; news: ReleaseNews } | undefined;
  /** The badge text of the newest release that has one (kept until a newer one says otherwise). */
  let lastNews: ReleaseNews = {};

  const headers = (accept: string): Record<string, string> => ({
    Accept: accept,
    'User-Agent': 'SlashClient-server',
    ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
  });

  async function assets(): Promise<Asset[]> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.assets;
    const res = await opts.fetchImpl(`https://api.github.com/repos/${opts.repo}/releases/latest`, { headers: headers('application/vnd.github+json') });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const release = (await res.json()) as GhRelease;
    // without a link of its own, the badge leads to the release's notes on the site
    cached = { at: Date.now(), assets: release.assets ?? [], news: releaseNews(release.body, changelogLinks(release.tag_name) ?? release.html_url) };
    if (cached.news.pl || cached.news.en) lastNews = cached.news;
    return cached.assets;
  }

  /** What the latest release with a badge says is new (empty until GitHub has answered once). */
  async function news(): Promise<ReleaseNews> {
    await assets();
    return lastNews;
  }

  /**
   * A short-lived link to one file of the latest release (the visitor or the launcher goes there),
   * or of the newest release that has it while the latest is still being built.
   */
  async function fileLink(name: string): Promise<string | undefined> {
    let asset = (await assets()).find((a) => a.name === name);
    if (!asset) for (const release of await recentReleases()) if ((asset = release.find((a) => a.name === name))) break;
    return asset && signed(asset);
  }

  async function signed(asset: Asset): Promise<string> {
    if (!opts.token) return asset.browser_download_url;
    // a private repository: the API answers with a redirect to a signed link, valid for a few minutes
    const res = await opts.fetchImpl(asset.url, { headers: headers('application/octet-stream'), redirect: 'manual' });
    const location = res.headers.get('location');
    if (!location) throw new Error(`GitHub ${res.status}`);
    return location;
  }

  let recent: { at: number; releases: Asset[][] } | undefined;
  /** The assets of the last few published releases, newest first. */
  async function recentReleases(): Promise<Asset[][]> {
    if (recent && Date.now() - recent.at < CACHE_MS) return recent.releases;
    const res = await opts.fetchImpl(`https://api.github.com/repos/${opts.repo}/releases?per_page=10`, { headers: headers('application/vnd.github+json') });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const list = (await res.json()) as GhRelease[];
    recent = { at: Date.now(), releases: list.filter((r) => !r.draft && !r.prerelease).map((r) => r.assets ?? []) };
    return recent.releases;
  }

  /**
   * Where to send the visitor for this system's installer: from the latest release, or, while that
   * one is still being built (its files go up one system at a time), from the newest that has it.
   */
  async function link(os: DownloadOs): Promise<string | undefined> {
    let asset = (await assets()).find((a) => FILES[os].test(a.name));
    if (!asset) for (const release of await recentReleases()) if ((asset = release.find((a) => FILES[os].test(a.name)))) break;
    return asset && signed(asset);
  }

  const texts = new Map<string, { at: number; text: string }>();
  /** A small text file (latest.yml…), kept as long as the release list. */
  async function cachedText(key: string, to: () => Promise<string | undefined>): Promise<string | undefined> {
    const hit = texts.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
    const url = await to();
    if (!url) return undefined;
    const res = await opts.fetchImpl(url, { headers: { 'User-Agent': 'SlashClient-server' } });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const text = await res.text();
    texts.set(key, { at: Date.now(), text });
    return text;
  }
  /** A small text file of the latest release (latest.yml…). */
  const fileText = (name: string) => cachedText(name, () => fileLink(name));

  // ---- the whole list of releases, for the changelog ----

  const pages = new Map<number, { at: number; list: GhRelease[] }>();
  async function page(n: number): Promise<GhRelease[]> {
    const hit = pages.get(n);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
    const res = await opts.fetchImpl(`https://api.github.com/repos/${opts.repo}/releases?per_page=${PER_PAGE}&page=${n}`, { headers: headers('application/vnd.github+json') });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const list = (await res.json()) as GhRelease[];
    pages.set(n, { at: Date.now(), list: Array.isArray(list) ? list : [] });
    return pages.get(n)!.list;
  }

  /**
   * Published releases (no drafts, no prereleases), newest version first: as many pages as it
   * takes to have `want` of them older than `before`. `complete`: there are no more.
   */
  async function published(want: number, before?: string): Promise<{ list: GhRelease[]; complete: boolean }> {
    const all: GhRelease[] = [];
    for (let n = 1; n <= 20; n++) {
      const list = await page(n);
      all.push(...list.filter((r) => !r.draft && !r.prerelease && parseVersion(r.tag_name)));
      const older = before ? all.filter((r) => compareVersion(r.tag_name, before) < 0).length : all.length;
      if (list.length < PER_PAGE) return { list: sortReleases(all), complete: true };
      if (older > want) break;
    }
    return { list: sortReleases(all), complete: false };
  }
  const sortReleases = (list: GhRelease[]) => list.sort((a, b) => compareVersion(b.tag_name, a.tag_name));

  /** A page of the changelog: up to `limit` releases older than `before` (or the newest ones). */
  async function changelog(o: { limit: number; before?: string; lang: 'pl' | 'en' }): Promise<{ releases: ChangelogEntry[]; more: boolean }> {
    const { list, complete } = await published(o.limit, o.before);
    const older = o.before ? list.filter((r) => compareVersion(r.tag_name, o.before) < 0) : list;
    const shown = older.slice(0, o.limit).map((r) => changelogEntry(r, o.lang)!);
    return { releases: shown, more: older.length > o.limit || !complete };
  }

  const tagged = new Map<string, { at: number; release?: GhRelease }>();
  /** One published release by its version (undefined: there is none, or it is a draft or a prerelease). */
  async function release(version: string): Promise<GhRelease | undefined> {
    const v = parseVersion(version)?.join('.');
    if (!v) return undefined;
    const hit = tagged.get(v);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.release;
    const res = await opts.fetchImpl(`https://api.github.com/repos/${opts.repo}/releases/tags/v${v}`, { headers: headers('application/vnd.github+json') });
    if (!res.ok && res.status !== 404) throw new Error(`GitHub ${res.status}`);
    const r = res.ok ? ((await res.json()) as GhRelease) : undefined;
    const ok = r && !r.draft && !r.prerelease ? r : undefined;
    tagged.set(v, { at: Date.now(), release: ok });
    return ok;
  }

  /** One release's notes. */
  async function changelogOf(version: string, lang: 'pl' | 'en'): Promise<ChangelogEntry | undefined> {
    const r = await release(version);
    return r && changelogEntry(r, lang);
  }

  /** A short-lived link to one file of one release (going back to it). */
  async function versionFileLink(version: string, name: string): Promise<string | undefined> {
    const asset = (await release(version))?.assets?.find((a) => a.name === name);
    return asset && signed(asset);
  }
  /** A small text file of one release (its latest.yml…). */
  const versionFileText = (version: string, name: string) => cachedText(`${version}/${name}`, () => versionFileLink(version, name));

  /**
   * The beta channel's file: from the newest release, a beta or not, that has it (by version: while
   * a release is still being built its files go up one system at a time, the one before serves the rest).
   */
  async function betaFileLink(name: string): Promise<string | undefined> {
    const releases = (await page(1)).filter((r) => !r.draft && parseBeta(r.tag_name)).sort((a, b) => compareBeta(b.tag_name, a.tag_name));
    for (const r of releases) {
      const asset = r.assets?.find((a) => a.name === name);
      if (asset) return signed(asset);
    }
    return undefined;
  }
  /** A small text file of the beta channel (its latest.yml…). */
  const betaFileText = (name: string) => cachedText(`beta/${name}`, () => betaFileLink(name));

  return { link, fileLink, fileText, news, changelog, changelogOf, versionFileLink, versionFileText, betaFileLink, betaFileText };
}

export type Downloads = ReturnType<typeof createDownloads>;

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

/**
 * GET /v1/changelog?limit=20&before=<version>&lang=en: the releases' notes, newest first, a page at
 * a time (`more`: older ones follow). GET /v1/changelog/<version>: one release.
 */
export function changelogRoutes(downloads: () => Downloads, fail: (status: number, code: string) => never): [string, RegExp, Handler][] {
  const langOf = (url: URL): 'pl' | 'en' => (url.searchParams.get('lang') === 'en' ? 'en' : 'pl');
  const unavailable = (err: unknown) => {
    console.error('zmiany:', (err as Error).message);
    return fail(503, 'changelog_unavailable');
  };
  return [
    ['GET', /^\/v1\/changelog$/, async (_req, _p, url) => {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
      const before = url.searchParams.get('before') ?? undefined;
      if (before !== undefined && !parseVersion(before)) fail(400, 'bad_version');
      return downloads().changelog({ limit, before, lang: langOf(url) }).catch(unavailable);
    }],
    ['GET', /^\/v1\/changelog\/v?(\d{1,4}\.\d{1,4}\.\d{1,4})$/, async (_req, [version], url) => {
      const entry = await downloads().changelogOf(version, langOf(url)).catch(unavailable);
      return entry ?? fail(404, 'not_found');
    }],
  ];
}
