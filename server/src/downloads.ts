/**
 * /pobierz/<system>: the installer of the latest release for one system, straight to the file.
 * /aktualizacje/<file>: the same release as an update feed for the launcher (electron-updater's
 * "generic" provider): latest*.yml served from here, the files themselves as signed links.
 * The release list comes from GitHub (kept for a few minutes). With RELEASES_TOKEN set, a
 * private repository works too: GitHub hands out a short-lived signed link to the file,
 * and the visitor is sent there, so the token never leaves the server.
 */

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

const CACHE_MS = 5 * 60_000;

export function createDownloads(opts: { repo: string; token?: string; fetchImpl: typeof fetch }) {
  let cached: { at: number; assets: Asset[] } | undefined;

  const headers = (accept: string): Record<string, string> => ({
    Accept: accept,
    'User-Agent': 'SlashClient-server',
    ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
  });

  async function assets(): Promise<Asset[]> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.assets;
    const res = await opts.fetchImpl(`https://api.github.com/repos/${opts.repo}/releases/latest`, { headers: headers('application/vnd.github+json') });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const release = (await res.json()) as { assets?: Asset[] };
    cached = { at: Date.now(), assets: release.assets ?? [] };
    return cached.assets;
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
    const list = (await res.json()) as { draft?: boolean; prerelease?: boolean; assets?: Asset[] }[];
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
  /** A small text file of the latest release (latest.yml…), kept as long as the release list. */
  async function fileText(name: string): Promise<string | undefined> {
    const hit = texts.get(name);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
    const to = await fileLink(name);
    if (!to) return undefined;
    const res = await opts.fetchImpl(to, { headers: { 'User-Agent': 'SlashClient-server' } });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const text = await res.text();
    texts.set(name, { at: Date.now(), text });
    return text;
  }

  return { link, fileLink, fileText };
}
