/** SlashClient's own sites, the current one and the old address (which leads to it). */
const SITES = ['slashclient.pl', 'client.slash3rss.dev'];

/**
 * The player of a profile link (https://slashclient.pl/u/<handle>, the old /gracz/<handle> too) on SlashClient's
 * site or the server the launcher uses, or undefined for any other link.
 */
export function profileLinkHandle(url: string, socialUrl = ''): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  let own: string | undefined;
  try {
    own = socialUrl ? new URL(socialUrl).host : undefined;
  } catch {
    own = undefined;
  }
  if (!(u.protocol === 'https:' && SITES.includes(u.hostname)) && u.host !== own) return undefined;
  const m = /^\/(?:u|gracz|profil|player)\/([^/]+)\/?$/.exec(u.pathname);
  if (!m) return undefined;
  let handle = '';
  try {
    handle = decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
  return /^[\w.]{1,40}$/.test(handle) ? handle : undefined;
}
