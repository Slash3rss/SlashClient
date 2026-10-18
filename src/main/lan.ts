import net from 'node:net';
import type { AddressInfo } from 'node:net';

/**
 * Worlds opened to LAN, for friends anywhere: each Minecraft connection goes through the
 * SlashClient server's relay (/v1/lan, a WebSocket over HTTPS), so nobody opens a port.
 *
 * The host's launcher learns the LAN port from the game and tells the server the world is open;
 * when a friend joins, the server asks it ('lan-connect') and it connects a relay socket to the
 * game's LAN port. The friend's launcher opens a port on 127.0.0.1 for its game, and carries each
 * connection to it through a relay socket of its own.
 */

interface Options {
  url: () => string;
  token: () => string | undefined;
  /** A message on the launcher's /v1/ws connection (to say the world is open or closed). */
  send: (message: Record<string, unknown>) => void;
}

/** A socket's chunk as a WebSocket frame. */
const bytes = (chunk: Buffer) => new Uint8Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);

/** Bytes waiting to go to the relay before the game's side is paused. */
const HIGH_WATER = 4 << 20;

export class LanTunnels {
  private hostPort?: number;
  private proxies = new Map<string, net.Server>();

  private readonly opts: Options;

  // a plain field (not a parameter property), so the server's tests can load this file as it is
  constructor(opts: Options) {
    this.opts = opts;
  }

  private relayUrl() {
    return this.opts.url().replace(/^http/, 'ws').replace(/\/$/, '') + '/v1/lan';
  }

  // ---------- hosting ----------

  /** The game opened its world to LAN on `port`, or closed it (undefined). */
  setHost(port: number | undefined) {
    if (port === this.hostPort) return;
    this.hostPort = port;
    this.opts.send({ type: 'lan', open: port !== undefined });
  }

  /** After reconnecting to the server: it forgot, so say again. */
  resend() {
    if (this.hostPort !== undefined) this.opts.send({ type: 'lan', open: true });
  }

  hosting(): number | undefined {
    return this.hostPort;
  }

  /** A friend joins: one relay socket for them, joined to the game's LAN port. */
  accept(id: string) {
    const port = this.hostPort;
    const token = this.opts.token();
    if (port === undefined || !token) return;
    const game = net.connect(port, '127.0.0.1');
    this.carry(game, { type: 'accept', token, id });
  }

  // ---------- joining ----------

  /** A port on this computer the game connects to, to play in `host`'s world. */
  async join(host: string): Promise<number> {
    const open = this.proxies.get(host);
    if (open) return (open.address() as AddressInfo).port;
    const server = net.createServer((game) => {
      const token = this.opts.token();
      if (!token) return game.destroy();
      this.carry(game, { type: 'join', token, host });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    this.proxies.set(host, server);
    return (server.address() as AddressInfo).port;
  }

  /** Closes the joining ports (the game ended). */
  stop() {
    for (const server of this.proxies.values()) server.close();
    this.proxies.clear();
    this.setHost(undefined);
  }

  /**
   * One game connection through the relay: the first message says who and what; once the
   * server answers 'ok', bytes go both ways. What the game sends before that waits.
   */
  private carry(game: net.Socket, first: Record<string, unknown>) {
    const ws = new WebSocket(this.relayUrl());
    ws.binaryType = 'arraybuffer';
    const early: Buffer[] = [];
    let paired = false;
    const end = () => {
      game.destroy();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    };
    game.on('data', (chunk: Buffer) => {
      if (!paired) return void early.push(chunk);
      ws.send(bytes(chunk));
      // the relay is slower than the game: wait for it to catch up
      if (ws.bufferedAmount > HIGH_WATER) {
        game.pause();
        const wait = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return clearInterval(wait);
          if (ws.bufferedAmount < HIGH_WATER / 2) {
            clearInterval(wait);
            game.resume();
          }
        }, 20);
      }
    });
    game.on('close', end);
    game.on('error', end);
    ws.addEventListener('open', () => ws.send(JSON.stringify(first)));
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        if (!paired && (JSON.parse(e.data) as { type?: string }).type === 'ok') {
          paired = true;
          for (const chunk of early.splice(0)) ws.send(bytes(chunk));
        }
        return;
      }
      game.write(Buffer.from(e.data as ArrayBuffer));
    });
    ws.addEventListener('close', end);
    ws.addEventListener('error', end);
  }
}
