/**
 * Who is connected right now and what they are doing. Kept in memory only: after a
 * restart every launcher reconnects and sends its status again within seconds.
 */

export type Status = 'online' | 'away' | 'busy' | 'invisible';

export interface Activity {
  kind: 'launcher' | 'menu' | 'singleplayer' | 'server';
  /** "1.21.4 · Fabric" */
  version?: string;
  /** Server address; only sent to friends when the player allows it. */
  server?: string;
  since?: number;
}

export interface Presence { status: Status; activity?: Activity }

/** What friends see; 'offline' covers both disconnected and invisible players. */
export interface PublicPresence { status: Exclude<Status, 'invisible'> | 'offline'; activity?: Activity; lastSeen?: number }

const STATUSES: Status[] = ['online', 'away', 'busy', 'invisible'];
const KINDS: Activity['kind'][] = ['launcher', 'menu', 'singleplayer', 'server'];

/** Accepts only known fields with sane sizes; anything else from a client is dropped. */
export function cleanPresence(input: unknown): Presence | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const p = input as Record<string, unknown>;
  if (!STATUSES.includes(p.status as Status)) return undefined;
  const out: Presence = { status: p.status as Status };
  const a = p.activity as Record<string, unknown> | undefined;
  if (a && typeof a === 'object' && KINDS.includes(a.kind as Activity['kind'])) {
    out.activity = { kind: a.kind as Activity['kind'] };
    if (typeof a.version === 'string') out.activity.version = a.version.slice(0, 64);
    if (typeof a.server === 'string' && /^[\w.-]{1,253}(:\d{1,5})?$/.test(a.server)) out.activity.server = a.server;
    if (typeof a.since === 'number' && Number.isFinite(a.since)) out.activity.since = a.since;
  }
  return out;
}

export function publicPresence(p: Presence | undefined, showServer: boolean, lastSeen: number): PublicPresence {
  if (!p || p.status === 'invisible') return { status: 'offline', lastSeen };
  const activity = p.activity && { ...p.activity };
  if (activity && !showServer) delete activity.server;
  return { status: p.status, activity };
}
