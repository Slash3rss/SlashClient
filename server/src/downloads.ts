/**
 * /pobierz/<system>: the installer of the latest release for one system, straight to the file.
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

  /** Where to send the visitor for this system's installer; undefined when the release has none. */
  async function link(os: DownloadOs): Promise<string | undefined> {
    const asset = (await assets()).find((a) => FILES[os].test(a.name));
    if (!asset) return undefined;
    if (!opts.token) return asset.browser_download_url;
    // a private repository: the API answers with a redirect to a signed link, valid for a few minutes
    const res = await opts.fetchImpl(asset.url, { headers: headers('application/octet-stream'), redirect: 'manual' });
    const location = res.headers.get('location');
    if (!location) throw new Error(`GitHub ${res.status}`);
    return location;
  }

  return { link };
}
