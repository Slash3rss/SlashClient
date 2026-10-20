import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { Db, Invite, Message, Person, SharedWaypoint } from './db.ts';

/**
 * Things friends share in game besides text: waypoints and parties.
 *
 * A waypoint goes as a message with a `waypoint` attached, so it stays in the chat (older
 * launchers and HUDs show only its text). A party is one invite to several friends at once:
 * each of them gets the usual "join me" invite (a message with `invite`, now with the party's
 * id), and the party itself (who is in, who accepted) lives in memory until it expires or the
 * leader disbands it. Every change is pushed to everyone in it as a `party` event.
 */

export const PARTY_SIZE = 8;
export const PARTY_TTL_MS = 3 * 3_600_000;
const MAX_RECIPIENTS = 8;
const WAYPOINT_NAME = 32;
/** Further than the world border (30 million blocks) is no real place. */
const MAX_XZ = 30_000_000;
const SERVER_ADDRESS = /^[\w.-]{1,253}(:\d{1,5})?$/;
const DIMENSION = /^[a-z0-9_.-]{1,64}:[a-z0-9_./-]{1,64}$/;
/** As the HUD keys its waypoints: a server's address or a singleplayer world's name. */
const WORLD = /^(server:[\w.-]{1,253}(:\d{1,5})?|world:[^\u0000-\u001f]{1,64})$/;
const VERSION = /^[\w.+ -]{1,32}$/;

export type MemberStatus = 'invited' | 'accepted' | 'declined' | 'left';
interface Party { id: string; leader: string; server: string; version?: string; createdAt: number; expiresAt: number; members: Map<string, MemberStatus>; disbanded?: boolean }

interface Deps {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  push: (userId: string, event: unknown) => void;
  /** Throw `rate_limited` when the player went over the budget: one per waypoint recipient, one per party. */
  limitWaypoints: (key: string) => void;
  limitParties: (key: string) => void;
  fail: (status: number, code: string) => never;
}

/** A waypoint from a request, or undefined when something in it is off. */
export function cleanWaypoint(raw: Record<string, unknown>): SharedWaypoint | undefined {
  const { name, x, y, z, dimension, world } = raw;
  const int = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= max;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > WAYPOINT_NAME || /[\u0000-\u001f]/.test(name)) return undefined;
  if (!int(x, MAX_XZ) || !int(z, MAX_XZ) || !int(y, 4096)) return undefined;
  if (typeof dimension !== 'string' || !DIMENSION.test(dimension)) return undefined;
  if (typeof world !== 'string' || !WORLD.test(world)) return undefined;
  return { name: name.trim(), x: x as number, y: y as number, z: z as number, dimension, world: world.startsWith('server:') ? world.toLowerCase() : world };
}

export function sharingRoutes(deps: Deps) {
  const { db, authed, body, push, limitWaypoints, limitParties, fail } = deps;
  const parties = new Map<string, Party>();

  /** Friend ids from a request: a non-empty list of distinct friends of `me`, at most `max`. */
  function friendIds(me: string, raw: unknown, max: number): string[] {
    if (!Array.isArray(raw) || !raw.length || raw.some((id) => typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id))) fail(400, 'bad_request');
    const ids = [...new Set(raw as string[])];
    if (ids.length > max) fail(400, 'too_many');
    if (ids.includes(me)) fail(400, 'self');
    if (ids.some((id) => !db.areFriends(me, id))) fail(403, 'not_friends');
    return ids;
  }

  const sweep = () => {
    const now = Date.now();
    for (const [id, p] of parties) if (p.expiresAt <= now || p.disbanded) parties.delete(id);
  };

  const person = (id: string): Person => {
    const u = db.user(id);
    return { id, handle: u?.handle ?? '', name: u?.name ?? '', avatar: u?.avatar ?? '' };
  };
  const view = (p: Party) => ({
    id: p.id, leader: person(p.leader), server: p.server, ...(p.version ? { version: p.version } : {}),
    createdAt: p.createdAt, expiresAt: p.expiresAt, ...(p.disbanded ? { disbanded: true } : {}),
    members: [...p.members].map(([id, status]) => ({ ...person(id), status })),
  });
  const announce = (p: Party) => {
    const event = { type: 'party', party: view(p) };
    for (const id of p.members.keys()) push(id, event);
  };
  /** The party, if `me` is in it (invited counts); otherwise as if it did not exist. */
  function partyOf(me: string, id: string): Party {
    sweep();
    const p = parties.get(id);
    if (!p || !p.members.has(me)) fail(404, 'not_found');
    return p!;
  }
  function disband(p: Party) {
    p.disbanded = true;
    announce(p);
    parties.delete(p.id);
  }
  function setStatus(me: string, id: string, status: MemberStatus) {
    const p = partyOf(me, id);
    if (p.leader === me) fail(400, 'leader');
    p.members.set(me, status);
    announce(p);
    return { party: view(p) };
  }

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Handler][] = [
    // a waypoint to one or more friends, as a message each
    ['POST', /^\/v1\/waypoints$/, async (req) => {
      const me = authed(req);
      const raw = await body(req);
      const to = friendIds(me, raw.to, MAX_RECIPIENTS);
      const waypoint = cleanWaypoint(raw);
      if (!waypoint) fail(400, 'bad_waypoint');
      for (const _ of to) limitWaypoints(me);
      // what older launchers and HUDs show: the name and where it is
      const text = `📍 ${waypoint!.name} (${waypoint!.x}, ${waypoint!.y}, ${waypoint!.z})`;
      const messages: Message[] = to.map((other) => {
        const message = db.addMessage(me, other, text, undefined, waypoint);
        push(other, { type: 'message', message });
        push(me, { type: 'message', message });
        return message;
      });
      return { messages };
    }],

    // -- parties --
    ['GET', /^\/v1\/parties$/, (req) => {
      const me = authed(req);
      sweep();
      return { parties: [...parties.values()].filter((p) => p.members.has(me)).map(view) };
    }],
    // a new party: the leader's own earlier one ends, every member gets the usual invite
    ['POST', /^\/v1\/parties$/, async (req) => {
      const me = authed(req);
      const raw = await body(req);
      const members = friendIds(me, raw.members, PARTY_SIZE - 1);
      const { server, version } = raw;
      if (typeof server !== 'string' || !SERVER_ADDRESS.test(server)) fail(400, 'bad_server');
      limitParties(me);
      sweep();
      for (const p of [...parties.values()]) if (p.leader === me) disband(p);
      const now = Date.now();
      const party: Party = {
        id: randomBytes(9).toString('base64url'), leader: me, server: (server as string).toLowerCase(),
        ...(typeof version === 'string' && VERSION.test(version) ? { version } : {}),
        createdAt: now, expiresAt: now + PARTY_TTL_MS, members: new Map([[me, 'accepted' as MemberStatus], ...members.map((m) => [m, 'invited'] as [string, MemberStatus])]),
      };
      parties.set(party.id, party);
      const invite: Invite = { server: party.server, ...(party.version ? { version: party.version } : {}), party: party.id, expiresAt: party.expiresAt };
      const messages = members.map((other) => {
        const message = db.addMessage(me, other, party.server, invite);
        push(other, { type: 'message', message });
        push(me, { type: 'message', message });
        return message;
      });
      announce(party);
      return { party: view(party), messages };
    }],
    ['POST', /^\/v1\/parties\/([\w-]{1,32})\/accept$/, (req, [id]) => setStatus(authed(req), id, 'accepted')],
    ['POST', /^\/v1\/parties\/([\w-]{1,32})\/decline$/, (req, [id]) => setStatus(authed(req), id, 'declined')],
    // a member leaves; the leader leaving ends the party
    ['POST', /^\/v1\/parties\/([\w-]{1,32})\/leave$/, (req, [id]) => {
      const me = authed(req);
      const p = partyOf(me, id);
      if (p.leader === me) {
        disband(p);
        return { ok: true };
      }
      return setStatus(me, id, 'left');
    }],
    ['DELETE', /^\/v1\/parties\/([\w-]{1,32})$/, (req, [id]) => {
      const me = authed(req);
      const p = partyOf(me, id);
      if (p.leader !== me) fail(403, 'not_leader');
      disband(p);
      return { ok: true };
    }],
  ];
  return { routes };
}
