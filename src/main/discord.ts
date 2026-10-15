import { randomUUID } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { t } from '../shared/i18n';

/**
 * Minimal Discord Rich Presence client over Discord's local IPC socket.
 * Frames are: int32 LE opcode, int32 LE length, JSON payload.
 */

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;

export interface Presence {
  details?: string;
  state?: string;
  startTimestamp?: number;
  largeImageKey?: string;
  largeImageText?: string;
}

function socketPaths(): string[] {
  if (process.platform === 'win32') return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  const dirs = [process.env.XDG_RUNTIME_DIR, process.env.TMPDIR, process.env.TMP, process.env.TEMP, os.tmpdir(), '/tmp'].filter(Boolean) as string[];
  // Flatpak and Snap builds of Discord put the socket in a subfolder
  const subdirs = ['', 'app/com.discordapp.Discord', 'snap.discord'];
  return [...new Set(dirs.flatMap((d) => subdirs.flatMap((s) => Array.from({ length: 10 }, (_, i) => path.join(d, s, `discord-ipc-${i}`)))))];
}

function encode(op: number, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

function connectAny(paths: string[]): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const tryNext = (i: number) => {
      if (i >= paths.length) return reject(new Error('Discord nie jest uruchomiony'));
      const socket = net.connect(paths[i]);
      socket.once('connect', () => resolve(socket));
      socket.once('error', () => tryNext(i + 1));
    };
    tryNext(0);
  });
}

export class DiscordPresence {
  private socket?: net.Socket;
  private ready = false;
  private pending?: Presence | null;
  private connecting?: Promise<void>;

  constructor(readonly clientId: string, private paths: string[] = socketPaths()) {}

  /** Shows `presence`, or clears it with null. Fails silently when Discord isn't running. */
  async set(presence: Presence | null): Promise<void> {
    this.pending = presence;
    try {
      await this.connect();
      this.flush();
    } catch {
      // Discord closed or not installed: nothing to show it on
    }
  }

  close(): void {
    this.socket?.destroy();
    this.socket = undefined;
    this.ready = false;
  }

  private connect(): Promise<void> {
    if (this.ready) return Promise.resolve();
    this.connecting ??= (async () => {
      const socket = await connectAny(this.paths);
      this.socket = socket;
      let buf = Buffer.alloc(0);
      await new Promise<void>((resolve, reject) => {
        socket.on('data', (chunk: Buffer) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 8) {
            const len = buf.readInt32LE(4);
            if (buf.length < 8 + len) break;
            const msg = JSON.parse(buf.subarray(8, 8 + len).toString('utf8'));
            buf = buf.subarray(8 + len);
            if (msg.evt === 'READY') {
              this.ready = true;
              resolve();
            } else if (msg.evt === 'ERROR' && !this.ready) {
              reject(new Error(msg.data?.message ?? 'Discord odrzucił połączenie'));
            }
          }
        });
        socket.on('close', () => {
          this.ready = false;
          this.socket = undefined;
          reject(new Error('Discord zamknął połączenie'));
        });
        socket.write(encode(OP_HANDSHAKE, { v: 1, client_id: this.clientId }));
      });
    })().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  private flush(): void {
    if (!this.socket || !this.ready || this.pending === undefined) return;
    const p = this.pending;
    this.pending = undefined;
    const activity = p && {
      details: p.details,
      state: p.state,
      timestamps: p.startTimestamp ? { start: Math.floor(p.startTimestamp / 1000) } : undefined,
      assets: p.largeImageKey ? { large_image: p.largeImageKey, large_text: p.largeImageText } : undefined,
      instance: false,
    };
    this.socket.write(encode(OP_FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: randomUUID() }));
  }
}

/** Reads what the player is doing from the game's log lines. */
export function presenceFromLog(line: string): { state: string } | undefined {
  const server = line.match(/Connecting to ([^,\s]+), (\d+)/);
  if (server) return { state: t('Na serwerze {0}', `${server[1]}${server[2] === '25565' ? '' : `:${server[2]}`}`) };
  if (/Starting integrated minecraft server/.test(line)) return { state: t('Gra jednoosobowa') };
  if (/Stopping server|Disconnected from server|Lost connection/i.test(line)) return { state: t('W menu') };
  return undefined;
}
