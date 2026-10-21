import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from './db.ts';
import { serverKeyOf, type Presence } from './presence.ts';

/**
 * Friends on the minimap. A player who chose to share their position (off by default; with all
 * friends or only the ones picked) sends it from the game every couple of seconds while they play
 * on a server. It goes straight on, as a `friend-position` event, to those friends who are on the
 * same server right now, and is forgotten: no position is ever stored. Only the choice itself is
 * kept (position_sharing). Older launchers and HUDs neither send nor get anything.
 */

export type ShareMode = 'off' | 'all' | 'some';
export interface PositionSharing { mode: ShareMode; friends: string[] }
export interface Position { server: string; dimension: string; x: number; y: number; z: number; yaw: number }

const MODES: ShareMode[] = ['off', 'all', 'some'];
/** At most this many friends picked one by one. */
export const MAX_PICKED = 200;
/** Further than the world border (30 million blocks) is no real place. */
const MAX_XZ = 30_000_000;
const SERVER_ADDRESS = /^[\w.-]{1,253}(:\d{1,5})?$/;
const DIMENSION = /^[a-z0-9_.-]{1,64}:[a-z0-9_./-]{1,64}$/;
const ID = /^[\w-]{1,64}$/;

/** A position from the game, or undefined when something in it is off. Rounded to a tenth of a block. */
export function cleanPosition(raw: Record<string, unknown>): Position | undefined {
  const { server, dimension, x, y, z, yaw } = raw;
  const num = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
  if (typeof server !== 'string' || !SERVER_ADDRESS.test(server)) return undefined;
  if (typeof dimension !== 'string' || !DIMENSION.test(dimension)) return undefined;
  if (!num(x, MAX_XZ) || !num(z, MAX_XZ) || !num(y, 4096) || !num(yaw ?? 0, 100_000)) return undefined;
  const tenth = (v: number) => Math.round(v * 10) / 10;
  const turn = ((((yaw as number | undefined) ?? 0) % 360) + 360) % 360;
  return { server: serverKeyOf(server), dimension, x: tenth(x as number), y: tenth(y as number), z: tenth(z as number), yaw: tenth(turn) };
}

/** A sharing choice from a request; undefined when it is off. Picked friends are checked by the caller. */
export function cleanSharing(raw: Record<string, unknown>): PositionSharing | undefined {
  const { mode, friends } = raw;
  if (!MODES.includes(mode as ShareMode)) return undefined;
  if (friends !== undefined && (!Array.isArray(friends) || friends.length > MAX_PICKED || friends.some((f) => typeof f !== 'string' || !ID.test(f)))) return undefined;
  return { mode: mode as ShareMode, friends: [...new Set((friends as string[] | undefined) ?? [])] };
}

/** The choices, one row per account that ever made one (none: off). */
export class PositionSharingStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS position_sharing (
  uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, mode TEXT NOT NULL DEFAULT 'off', friends TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT 0);`);
  }

  get(uuid: string): PositionSharing {
    const r = this.sql.prepare('SELECT mode, friends FROM position_sharing WHERE uuid = ?').get(uuid) as { mode: string; friends: string } | undefined;
    if (!r || !MODES.includes(r.mode as ShareMode)) return { mode: 'off', friends: [] };
    let friends: string[] = [];
    try {
      const parsed = JSON.parse(r.friends);
      if (Array.isArray(parsed)) friends = parsed.filter((f) => typeof f === 'string');
    } catch {
      // broken JSON: nobody picked
    }
    return { mode: r.mode as ShareMode, friends };
  }

  set(uuid: string, s: PositionSharing) {
    this.sql.prepare(`INSERT INTO position_sharing (uuid, mode, friends, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (uuid) DO UPDATE SET mode = excluded.mode, friends = excluded.friends, updated_at = excluded.updated_at`)
      .run(uuid, s.mode, JSON.stringify(s.friends), Date.now());
  }
}

interface Deps {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  push: (userId: string, event: unknown) => void;
  /** What each connected launcher says the player is doing (only connected players are in it). */
  presenceOf: (userId: string) => Presence | undefined;
  /** The Minecraft uuids the account plays as in a game now (so friends can draw its face). */
  playingAs: (userId: string) => string[];
  /** Whether a position may go now (a short gap and a budget a minute per account). */
  allow: (userId: string) => boolean;
  fail: (status: number, code: string) => never;
}

export function positionRoutes(deps: Deps) {
  const { db, authed, body, push, presenceOf, playingAs, allow, fail } = deps;
  const store = new PositionSharingStore(db.sql);

  /** May `friend` see where `me` is, by `me`'s choice? */
  const sharesWith = (s: PositionSharing, friend: string) => s.mode === 'all' || (s.mode === 'some' && s.friends.includes(friend));

  /** The server a player is on now, as a key; '' when not on one (or invisible). */
  const serverOf = (userId: string) => {
    const p = presenceOf(userId);
    if (!p || p.status === 'invisible' || p.activity?.kind !== 'server') return '';
    return serverKeyOf(p.activity.server);
  };

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/me\/position-sharing$/, (req) => store.get(authed(req))],
    // the choice: off, all friends, or only those picked; friends who no longer may see it drop the dot at once
    ['POST', /^\/v1\/me\/position-sharing$/, async (req) => {
      const me = authed(req);
      const raw = await body(req);
      const next = cleanSharing(raw);
      if (!next) fail(400, 'bad_request');
      const before = store.get(me);
      // only the mode (the game's switch): the friends picked stay picked
      if (raw.friends === undefined) next!.friends = before.friends;
      const friends = db.friends(me).map((f) => f.id);
      next!.friends = next!.friends.filter((id) => friends.includes(id));
      store.set(me, next!);
      for (const f of friends) if (sharesWith(before, f) && !sharesWith(next!, f)) push(f, { type: 'friend-position', from: me, gone: true });
      return next;
    }],
    // where the player is: passed on to friends on the same server, never kept
    ['POST', /^\/v1\/mc\/position$/, async (req) => {
      const me = authed(req);
      const pos = cleanPosition(await body(req));
      if (!pos) fail(400, 'bad_request');
      const sharing = store.get(me);
      if (sharing.mode === 'off') fail(403, 'not_sharing');
      // the server the launcher saw the game join; the game may not name another one
      const server = serverOf(me);
      if (!server) fail(409, 'not_on_server');
      if (server !== pos!.server) fail(409, 'other_server');
      if (!allow(me)) fail(429, 'rate_limited');
      const user = db.user(me);
      const event = { type: 'friend-position', from: me, name: user?.name ?? '', uuids: playingAs(me), ...pos!, at: Date.now() };
      for (const f of db.friends(me)) if (sharesWith(sharing, f.id) && serverOf(f.id) === server) push(f.id, event);
      // nothing about who got it: that would say which friends are on the server
      return { ok: true };
    }],
  ];
  return { routes, store };
}
