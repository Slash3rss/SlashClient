import net from 'node:net';

/**
 * The site is behind Cloudflare: Caddy sees Cloudflare's servers, not the players, so the address it passes on
 * is one of Cloudflare's (shared by many players, which made per-address limits and the panel's request log
 * useless). Cloudflare says who the player is in CF-Connecting-IP; that header is believed only when the
 * request really came from one of its servers (the list in the panel), since anyone reaching the server's
 * address directly could write any address there.
 */
export const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

const plain = (a: string) => (a.startsWith('::ffff:') && net.isIPv4(a.slice(7)) ? a.slice(7) : a);

/** A list of ranges ("1.2.3.0/24", a single address too); the lines that are not one are skipped. */
export function proxyList(ranges: string[]): net.BlockList {
  const list = new net.BlockList();
  for (const line of ranges) {
    const [addr, bits] = line.trim().split('/');
    const kind = net.isIPv4(addr) ? 'ipv4' : net.isIPv6(addr) ? 'ipv6' : undefined;
    if (!kind) continue;
    const max = kind === 'ipv4' ? 32 : 128;
    const prefix = bits === undefined ? max : Number(bits);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) continue;
    list.addSubnet(addr, prefix, kind);
  }
  return list;
}

/** The player's address: `peer` (who connected to Caddy) or, when that is a trusted proxy, the one it names. */
export function behindProxies(peer: string, named: unknown, trusted: net.BlockList): string {
  const p = plain(peer);
  const kind = net.isIPv4(p) ? 'ipv4' : net.isIPv6(p) ? 'ipv6' : undefined;
  if (!kind || !trusted.check(p, kind)) return peer;
  const who = plain(String(Array.isArray(named) ? named[0] : named ?? '').trim());
  return net.isIP(who) ? who : peer;
}
