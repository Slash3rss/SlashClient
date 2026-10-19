/**
 * Sprays: a player presses a key in the game and their picture (a cosmetic, slot 'spray') shows on
 * the block face they look at for a minute. The mod draws it at once for its own player and sends
 * it here (through the launcher); the server passes it on to the launchers of players who may be
 * there to see it (the same server, or friends in a game for a world opened to LAN), which hand it
 * to their games. Nothing is stored.
 */

export const SPRAY_FACES = ['down', 'up', 'north', 'south', 'east', 'west'] as const;
export type SprayFace = (typeof SPRAY_FACES)[number];

/** One spray as the game sent it, checked. */
export interface Spray {
  /** The sprayer's Minecraft uuid in that game (dashed, lower case). */
  uuid: string;
  spray: string;
  /** The server's address as the game typed it ('' in a singleplayer or LAN world). */
  server: string;
  /** "minecraft:overworld" and the like. */
  dimension: string;
  x: number;
  y: number;
  z: number;
  face: SprayFace;
  /** On a floor or a ceiling: which way the picture's top points (quarter turns, 0 to 3). */
  rot: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIMENSION = /^[a-z0-9_.-]{1,64}:[a-z0-9_./-]{1,64}$/;
const SERVER = /^[\w.-]{1,253}(:\d{1,5})?$/;
/** The world's border is 30 million blocks out; heights stay within what data packs allow. */
const MAX_XZ = 30_000_000;
const MIN_Y = -2048;
const MAX_Y = 4096;

const coord = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Accepts only a well-formed spray; anything else from a client is dropped (undefined). */
export function cleanSpray(input: unknown): Spray | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const s = input as Record<string, unknown>;
  if (typeof s.uuid !== 'string' || !UUID.test(s.uuid)) return undefined;
  if (typeof s.spray !== 'string' || !/^[a-z0-9_]{1,32}$/.test(s.spray)) return undefined;
  if (typeof s.dimension !== 'string' || !DIMENSION.test(s.dimension)) return undefined;
  const server = s.server ?? '';
  if (typeof server !== 'string' || (server && !SERVER.test(server))) return undefined;
  if (!coord(s.x, -MAX_XZ, MAX_XZ) || !coord(s.z, -MAX_XZ, MAX_XZ) || !coord(s.y, MIN_Y, MAX_Y)) return undefined;
  if (!SPRAY_FACES.includes(s.face as SprayFace)) return undefined;
  const rot = s.rot ?? 0;
  if (!coord(rot, 0, 3)) return undefined;
  return { uuid: s.uuid.toLowerCase(), spray: s.spray, server, dimension: s.dimension, x: s.x, y: s.y, z: s.z, face: s.face as SprayFace, rot };
}

/**
 * How often one account may spray: at most one every `gapMs` and `perMinute` in any minute
 * (the game waits as long between sprays itself; this only stops a modified one from flooding).
 */
export class SprayLimit {
  private readonly last = new Map<string, number[]>();
  private readonly gapMs: number;
  private readonly perMinute: number;

  constructor(gapMs = 3000, perMinute = 20) {
    this.gapMs = gapMs;
    this.perMinute = perMinute;
  }

  /** Whether `user` may spray now; when yes, it counts. */
  allow(user: string, now = Date.now()): boolean {
    const times = (this.last.get(user) ?? []).filter((t) => now - t < 60_000);
    if (times.length && now - times[times.length - 1] < this.gapMs) return false;
    if (times.length >= this.perMinute) return false;
    times.push(now);
    this.last.set(user, times);
    if (this.last.size > 1000) this.sweep(now);
    return true;
  }

  /** Forgets accounts that have not sprayed for a minute (the map stays small). */
  private sweep(now: number) {
    for (const [user, times] of this.last) if (!times.length || now - times[times.length - 1] >= 60_000) this.last.delete(user);
  }
}
