// A Minecraft server's own icon (the picture in the game's server list), for servers we know nothing else about:
// the website's /dolacz page and, through the launcher, the Discord status of a player on such a server
// (partner servers have their pictures in the status rules). Read here with the game's status ping, enlarged
// 4× without smoothing (Discord shows it big), and kept a while.
import dns from 'node:dns/promises';
import net from 'node:net';
import { decodePng, encodePng, pngSize, type Picture } from './png.ts';

const ADDRESS = /^[a-z0-9](?:[a-z0-9-]{0,62}\.)*[a-z0-9-]{1,63}(?::\d{1,5})?$/;
/** The status answer, at most: a 64×64 icon is a few KB, the text around it small. */
const MAX_ANSWER = 256 * 1024;
const SCALE = 4;

/** A server address as kept (lower case, no default port), or undefined when it is not one on the internet. */
export function iconAddress(raw: string): string | undefined {
  const a = raw.trim().toLowerCase().replace(/:25565$/, '').replace(/\.+(?=:\d+$|$)/, '');
  if (!ADDRESS.test(a)) return undefined;
  const host = a.replace(/:\d+$/, '');
  if (host === 'localhost' || !host.includes('.') || /\.(local|lan|internal|home)$/.test(host)) return undefined;
  if (net.isIP(host) && !publicIp(host)) return undefined;
  return a;
}

/** An address on the internet: not this machine, a home or company network, or a cloud's own addresses. */
export function publicIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)));
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return publicIp(v.slice(7));
    return !(v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff'));
  }
  return false;
}

export interface IconDeps {
  /** Where an address leads (the SRV record first), as the game connects; tests give their own. */
  resolve?: (address: string) => Promise<{ ip: string; host: string; port: number }>;
  /** The status ping's JSON; tests give their own. */
  status?: (ip: string, host: string, port: number, timeoutMs: number) => Promise<unknown>;
  now?: () => number;
}

async function resolve(address: string): Promise<{ ip: string; host: string; port: number }> {
  let [host, portText] = address.split(':');
  let port = Number(portText) || 25565;
  if (!portText) {
    const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`).catch(() => []);
    if (srv[0]) {
      host = srv[0].name;
      port = srv[0].port;
    }
  }
  // the address it leads to is checked, and that one connected to (not looked up again)
  const ip = net.isIP(host) ? host : (await dns.lookup(host)).address;
  if (!publicIp(ip)) throw new Error('not public');
  return { ip, host, port };
}

function varint(value: number): Buffer {
  const out: number[] = [];
  do {
    let b = value & 0x7f;
    value >>>= 7;
    if (value) b |= 0x80;
    out.push(b);
  } while (value);
  return Buffer.from(out);
}
const packet = (...fields: Buffer[]) => {
  const body = Buffer.concat(fields);
  return Buffer.concat([varint(body.length), body]);
};
function readVarint(buf: Buffer, at: number): [number, number] | undefined {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (at + i >= buf.length) return undefined;
    const b = buf[at + i];
    value |= (b & 0x7f) << (7 * i);
    if (!(b & 0x80)) return [value, at + i + 1];
  }
  throw new Error('bad varint');
}

/** The game's status ping (handshake "just asking", then the status request): its JSON. */
function status(ip: string, host: string, port: number, timeoutMs: number): Promise<unknown> {
  return new Promise((done, fail) => {
    const socket = net.connect({ host: ip, port });
    let buf = Buffer.alloc(0);
    const stop = (err?: Error, value?: unknown) => {
      socket.destroy();
      if (err) fail(err);
      else done(value);
    };
    socket.setTimeout(timeoutMs, () => stop(new Error('timeout')));
    socket.on('error', (err) => stop(err));
    socket.on('connect', () => {
      const p = Buffer.alloc(2);
      p.writeUInt16BE(port);
      const name = Buffer.from(host, 'utf8');
      socket.write(Buffer.concat([packet(varint(0), varint(-1 >>> 0), varint(name.length), name, p, varint(1)), packet(varint(0))]));
    });
    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > MAX_ANSWER) return stop(new Error('too big'));
      try {
        const len = readVarint(buf, 0);
        if (!len || buf.length < len[1] + len[0]) return;
        const body = buf.subarray(len[1], len[1] + len[0]);
        const [id, at] = readVarint(body, 0)!;
        if (id !== 0) return stop(new Error('unexpected packet'));
        const [size, from] = readVarint(body, at)!;
        stop(undefined, JSON.parse(body.subarray(from, from + size).toString('utf8')));
      } catch (err) {
        stop(err as Error);
      }
    });
    socket.on('close', () => stop(new Error('closed')));
  });
}

/** The icon enlarged without smoothing, as a fresh PNG (nothing of the server's file goes out as it came). */
export function enlarge(icon: Picture, scale = SCALE): Buffer {
  const w = icon.width * scale, h = icon.height * scale;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const from = (Math.floor(y / scale) * icon.width + Math.floor(x / scale)) * 4;
    icon.rgba.copy(rgba, (y * w + x) * 4, from, from + 4);
  }
  return encodePng({ width: w, height: h, rgba });
}

export function createServerIcons(deps: IconDeps = {}) {
  const now = deps.now ?? Date.now;
  const lookup = deps.resolve ?? resolve;
  const ping = deps.status ?? status;
  /** Address → its icon (null: none, or the server did not answer), and until when that holds. */
  const kept = new Map<string, { png: Buffer | null; until: number }>();
  const asking = new Map<string, Promise<Buffer | null>>();

  async function read(address: string, timeoutMs: number): Promise<Buffer | null> {
    try {
      const to = await lookup(address);
      const json = (await ping(to.ip, to.host, to.port, timeoutMs)) as { favicon?: unknown };
      const favicon = typeof json?.favicon === 'string' ? json.favicon : '';
      if (!favicon.startsWith('data:image/png;base64,')) return null;
      const file = Buffer.from(favicon.slice('data:image/png;base64,'.length), 'base64');
      // the game's icons are 64×64; anything else is not one
      const size = pngSize(file);
      if (size?.width !== 64 || size.height !== 64) return null;
      try {
        return enlarge(decodePng(file));
      } catch {
        // a palette or other kind this server does not read: the file as it came (a browser and Discord read it)
        return file;
      }
    } catch {
      return null;
    }
  }

  return {
    /** What is known of a server's icon now, without asking it (undefined: nothing yet, or it is time to ask again). */
    known(raw: string): { png: Buffer | null } | undefined {
      const address = iconAddress(raw);
      const hit = address ? kept.get(address) : undefined;
      return hit && hit.until > now() ? { png: hit.png } : undefined;
    },
    /** The icon of a server (PNG), or null when it has none or does not answer; kept `hours`, a failure 10 minutes. */
    async icon(raw: string, o: { hours: number; timeoutMs?: number; maxKept?: number }): Promise<Buffer | null> {
      const address = iconAddress(raw);
      if (!address) return null;
      const hit = kept.get(address);
      if (hit && hit.until > now()) return hit.png;
      let pending = asking.get(address);
      if (!pending) {
        pending = read(address, o.timeoutMs ?? 4000).finally(() => asking.delete(address));
        asking.set(address, pending);
      }
      const png = await pending;
      kept.delete(address);
      kept.set(address, { png, until: now() + (png ? o.hours * 3_600_000 : 600_000) });
      // the oldest go first
      const max = o.maxKept ?? 500;
      while (kept.size > max) kept.delete(kept.keys().next().value!);
      return png;
    },
  };
}
