import dns from 'node:dns/promises';
import net from 'node:net';
import { fetchJson } from './download';

export const LIST_API = 'https://api.slash3rss.dev';

/** A server as returned by api.slash3rss.dev (only the fields the launcher uses). */
export interface ListedServer {
  id: string;
  name: string;
  ip: string;
  description: string;
  motdHtml: string[];
  motdClean: string[];
  modes: string[];
  versions: string[];
  votes: number;
  online: boolean;
  playersOnline: number;
  playersMax: number;
  hasIcon: boolean;
  promoted: boolean;
  featured: boolean;
  website?: string;
  discord?: string;
}

let cache: { at: number; servers: ListedServer[] } | undefined;

/** Server list from lista.slash3rss.dev, cached for a minute. */
export async function listServers(force = false): Promise<ListedServer[]> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.servers;
  const raw = await fetchJson<Record<string, unknown>[]>(`${LIST_API}/servers`);
  const servers = raw.map((s) => ({
    id: String(s.id ?? s._id),
    name: String(s.customName || s.name || s.ip),
    ip: String(s.ip),
    description: String(s.customDescription || s.description || ''),
    motdHtml: (s.motdHtml as string[]) ?? [],
    motdClean: (s.motdClean as string[]) ?? [],
    modes: (s.modes as string[]) ?? [],
    versions: (s.versions as string[]) ?? [],
    votes: Number(s.votes ?? 0),
    online: Boolean(s.online),
    playersOnline: Number(s.playersOnline ?? 0),
    playersMax: Number(s.playersMax ?? 0),
    hasIcon: Boolean(s.hasIcon),
    promoted: Boolean(s.promoted),
    featured: Boolean(s.featured),
    website: (s.website as string) || undefined,
    discord: (s.discord as string) || undefined,
  }));
  cache = { at: Date.now(), servers };
  return servers;
}

// ---------- Server List Ping (the protocol the multiplayer screen uses) ----------

export interface MotdSegment {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface PingResult {
  online: true;
  latency: number;
  version: string;
  protocol: number;
  playersOnline: number;
  playersMax: number;
  motd: MotdSegment[][];
  /** data:image/png;base64,... or undefined */
  favicon?: string;
}

const LEGACY_COLORS: Record<string, string> = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA', '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', a: '#55FF55', b: '#55FFFF', c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF',
};
const NAMED_COLORS: Record<string, string> = {
  black: '0', dark_blue: '1', dark_green: '2', dark_aqua: '3', dark_red: '4', dark_purple: '5', gold: '6', gray: '7',
  dark_gray: '8', blue: '9', green: 'a', aqua: 'b', red: 'c', light_purple: 'd', yellow: 'e', white: 'f',
};

type Chat = string | { text?: string; translate?: string; color?: string; bold?: boolean; italic?: boolean; extra?: Chat[] };

/** Flattens a chat component (with legacy § codes inside) into styled segments. */
function flattenChat(chat: Chat, inherited: Omit<MotdSegment, 'text'> = {}, out: MotdSegment[] = []): MotdSegment[] {
  if (typeof chat === 'string') chat = { text: chat };
  const style = {
    color: chat.color ? (chat.color.startsWith('#') ? chat.color : LEGACY_COLORS[NAMED_COLORS[chat.color]]) ?? inherited.color : inherited.color,
    bold: chat.bold ?? inherited.bold,
    italic: chat.italic ?? inherited.italic,
  };
  // legacy formatting codes such as "§bSky§fUP"
  let current: Omit<MotdSegment, 'text'> = { ...style };
  for (const [i, part] of (chat.text ?? chat.translate ?? '').split('§').entries()) {
    if (i > 0 && part.length) {
      const code = part[0].toLowerCase();
      if (LEGACY_COLORS[code]) current = { color: LEGACY_COLORS[code] };
      else if (code === 'l') current = { ...current, bold: true };
      else if (code === 'o') current = { ...current, italic: true };
      else if (code === 'r') current = { ...style };
    }
    const text = i > 0 ? part.slice(1) : part;
    if (text) out.push({ text, ...current });
  }
  for (const child of chat.extra ?? []) flattenChat(child, style, out);
  return out;
}

/** Splits segments into lines on "\n". */
function toLines(segments: MotdSegment[]): MotdSegment[][] {
  const lines: MotdSegment[][] = [[]];
  for (const seg of segments) {
    seg.text.split('\n').forEach((text, i) => {
      if (i > 0) lines.push([]);
      if (text) lines[lines.length - 1].push({ ...seg, text });
    });
  }
  return lines.slice(0, 2);
}

function varint(value: number): Buffer {
  const bytes: number[] = [];
  do {
    let b = value & 0x7f;
    value >>>= 7;
    if (value) b |= 0x80;
    bytes.push(b);
  } while (value);
  return Buffer.from(bytes);
}

function packet(id: number, ...fields: Buffer[]): Buffer {
  const body = Buffer.concat([varint(id), ...fields]);
  return Buffer.concat([varint(body.length), body]);
}

function mcString(s: string): Buffer {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([varint(b.length), b]);
}

/** Reads a varint at `offset`; returns undefined when the buffer is incomplete. */
function readVarint(buf: Buffer, offset: number): [number, number] | undefined {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return undefined;
    const b = buf[offset + i];
    value |= (b & 0x7f) << (7 * i);
    if (!(b & 0x80)) return [value, offset + i + 1];
  }
  throw new Error('Nieprawidłowa odpowiedź serwera');
}

/** "host", "host:port" → where to actually connect, following the _minecraft._tcp SRV record. */
export async function resolveAddress(address: string): Promise<{ host: string; port: number }> {
  const [host, portText] = address.trim().split(':');
  if (portText) return { host, port: Number(portText) || 25565 };
  try {
    const [srv] = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (srv) return { host: srv.name, port: srv.port };
  } catch {
    // no SRV record: default port
  }
  return { host, port: 25565 };
}

export async function pingServer(address: string, timeoutMs = 6000): Promise<PingResult> {
  const { host, port } = await resolveAddress(address);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let status: Omit<PingResult, 'latency'> | undefined;
    let pingSentAt = 0;
    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error('Serwer nie odpowiada')));
    socket.on('error', (err) => fail(new Error(`Brak połączenia: ${err.message}`)));
    socket.on('connect', () => {
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port);
      // handshake (protocol -1 = "just asking"), next state 1 = status; then status request
      socket.write(Buffer.concat([packet(0x00, varint(-1 >>> 0), mcString(host), portBuf, varint(1)), packet(0x00)]));
    });
    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const len = readVarint(buf, 0);
        if (!len || buf.length < len[1] + len[0]) return;
        const body = buf.subarray(len[1], len[1] + len[0]);
        buf = buf.subarray(len[1] + len[0]);
        const [id, at] = readVarint(body, 0)!;
        if (id === 0x00 && !status) {
          const [strLen, strAt] = readVarint(body, at)!;
          const json = JSON.parse(body.subarray(strAt, strAt + strLen).toString('utf8'));
          status = {
            online: true,
            version: String(json.version?.name ?? '').replace(/§./g, ''),
            protocol: Number(json.version?.protocol ?? 0),
            playersOnline: Number(json.players?.online ?? 0),
            playersMax: Number(json.players?.max ?? 0),
            motd: toLines(flattenChat(json.description ?? '')),
            favicon: typeof json.favicon === 'string' && json.favicon.startsWith('data:image/png;base64,') ? json.favicon : undefined,
          };
          const payload = Buffer.alloc(8);
          payload.writeBigInt64BE(BigInt(Date.now()));
          pingSentAt = performance.now();
          socket.write(packet(0x01, payload));
        } else if (id === 0x01 && status) {
          socket.end();
          resolve({ ...status, latency: Math.round(performance.now() - pingSentAt) });
          return;
        }
      }
    });
    socket.on('close', () => {
      // some servers close without answering the ping packet; status alone is still useful
      if (status) resolve({ ...status, latency: Math.round(performance.now() - pingSentAt) });
    });
  });
}
