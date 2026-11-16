// "Dołącz do gry" on Discord: a button under the player's status opens the website's /dolacz page with the server.
// The page opens the launcher by its own address (slashclient://join?server=…&version=…), which shows the usual
// "join a server" window (pick a profile, start); someone without the launcher gets the download and the address.

const ADDRESS = /^[a-z0-9](?:[a-z0-9-]{0,62}\.)*[a-z0-9-]{1,63}(?::\d{1,5})?$/i;
const VERSION = /^[\w.-]{1,32}$/;

/** The launcher's own address (the browser asks before it opens the launcher). */
export const PROTOCOL = 'slashclient';

export interface JoinTarget { server: string; version?: string }

/** A server others can join: a name or an address on the internet, not this computer or a home network. */
export function publicServer(address: string | undefined): string | undefined {
  const a = (address ?? '').trim().toLowerCase().replace(/:25565$/, '').replace(/\.+(?=:\d+$|$)/, '');
  if (!ADDRESS.test(a)) return undefined;
  const host = a.replace(/:\d+$/, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan') || !host.includes('.')) return undefined;
  const ip = host.split('.').map(Number);
  if (ip.length === 4 && ip.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [x, y] = ip;
    if (x === 10 || x === 127 || x === 0 || (x === 192 && y === 168) || (x === 172 && y >= 16 && y <= 31) || (x === 169 && y === 254) || (x === 100 && y >= 64 && y <= 127)) return undefined;
  }
  return a;
}

/** The game version of an activity ("26.3 · Fabric" → "26.3"). */
export const gameVersion = (activityVersion: string | undefined): string | undefined => {
  const v = activityVersion?.split(' · ')[0]?.trim();
  return v && VERSION.test(v) ? v : undefined;
};

/** The website's page for the Discord button. */
export function joinPageUrl(site: string, target: JoinTarget): string {
  const q = new URLSearchParams({ serwer: target.server, ...(target.version ? { wersja: target.version } : {}) });
  return `${site.replace(/\/+$/, '')}/dolacz?${q}`;
}

/** The server's own icon, read by the SlashClient server (serverIcons.ts there; 404 when it has none). */
export const serverIconUrl = (site: string, server: string): string => `${site.replace(/\/+$/, '')}/v1/public/server-icon/${encodeURIComponent(server)}.png`;

/** The join a `slashclient://join?…` link asks for (from the command line on Windows and Linux, `open-url` on macOS). */
export function parseJoinLink(link: string | undefined): JoinTarget | undefined {
  if (!link?.toLowerCase().startsWith(`${PROTOCOL}://`)) return undefined;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  if (url.hostname.toLowerCase() !== 'join') return undefined;
  const server = publicServer(url.searchParams.get('server') ?? undefined);
  if (!server) return undefined;
  const version = url.searchParams.get('version') ?? '';
  return VERSION.test(version) ? { server, version } : { server };
}

/** The link among a launcher's command line arguments. */
export const joinLinkIn = (argv: string[]): JoinTarget | undefined => parseJoinLink(argv.find((a) => a.toLowerCase().startsWith(`${PROTOCOL}://`)));
