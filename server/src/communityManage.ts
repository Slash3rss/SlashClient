import type http from 'node:http';
import type { Db } from './db.ts';
import { RANK, type ChannelRow, type CommunityLimits, type CommunityRole, type CommunityRow, type CommunityStore, type MemberRow } from './communityStore.ts';
import {
  CHANNEL_ROLES, ROLE_PERMISSIONS, allowed, allowedOn, cleanChannelName, cleanColor, cleanPermissions, cleanRoleName, mayManageRole, offensiveName,
  type Actor, type CommunityRoleStore, type CustomRoleRow, type RolePermission,
} from './communityRoles.ts';

/**
 * The routes of a community's own channels and custom roles (0.9.30; the rules are in
 * communityRoles.ts). Every change goes to the moderation log and makes the members fetch their
 * list again (`communities` event), as the community's settings do.
 *
 * - GET  /v1/communities/:id/channels                every channel with who reads and writes it (`manageChannels`)
 * - POST /v1/communities/:id/channels                a new text channel { name, readRole?, postRole?, readRoles?, writeRoles? }
 * - POST /v1/communities/:id/channels/order          { order: every channel's id, the top first }
 * - POST /v1/communities/:id/channels/:ch            renamed, or who reads and writes it (the built-in two: only who writes)
 * - DELETE /v1/communities/:id/channels/:ch          an own channel and its messages
 * - GET  /v1/communities/:id/roles                   the custom roles (any member), the permissions they may have
 * - POST /v1/communities/:id/roles                   a new role { name, color, permissions } (at the bottom)
 * - POST /v1/communities/:id/roles/order             { order: every role's id, the highest first }
 * - POST /v1/communities/:id/roles/:rid              changed { name?, color?, permissions? }
 * - DELETE /v1/communities/:id/roles/:rid            gone from its members and channels
 * - POST /v1/communities/:id/members/:user/custom-role  { role: id | null }
 */

interface Ctx {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fail: (status: number, code: string) => never;
  push: (userId: string, event: unknown) => void;
  store: CommunityStore;
  roles: CommunityRoleStore;
  limits: CommunityLimits;
  membership: (id: string, me: string) => { c: CommunityRow; m: MemberRow };
  actorOf: (id: string, m: MemberRow | undefined) => Actor;
  listChanged: (id: string, users?: Iterable<string>) => void;
  limitChanges: (key: string) => void;
  memberView: (c: CommunityRow, m: MemberRow, me: string) => unknown;
  toReaders: (id: string, ch: string, event: unknown) => void;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
const ID = '([\\w-]{1,32})';
const USER = '([\\w-]{1,64})';
const route = (path: string) => new RegExp(`^/v1/communities${path}$`);

export function communityManageRoutes(ctx: Ctx): [string, RegExp, Handler][] {
  const { authed, body, fail, store, roles, membership, actorOf, listChanged } = ctx;
  const L = ctx.limits;

  /** The member, who must have this permission. */
  function manager(id: string, me: string, p: RolePermission) {
    const { c, m } = membership(id, me);
    const a = actorOf(id, m);
    if (!allowed(a, p)) fail(403, 'not_allowed');
    return { c, m, a };
  }

  /** A channel as its managers see it. */
  const channelView = (ch: ChannelRow) => ({
    id: ch.id, kind: ch.kind, name: ch.name, position: ch.position, readRole: ch.readRole, postRole: ch.postRole, readRoles: ch.readRoles, writeRoles: ch.writeRoles,
    ...(ch.slowMode ? { slowMode: ch.slowMode } : {}),
  });
  const roleView = (r: CustomRoleRow, counts?: Map<string, number>) => ({
    id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions, ...(counts ? { members: counts.get(r.id) ?? 0 } : {}),
  });

  /** A built-in role a channel's read or write starts from, or the one it had. */
  function channelRole(raw: unknown, current: CommunityRole): CommunityRole {
    if (raw === undefined) return current;
    if (!CHANNEL_ROLES.includes(raw as CommunityRole)) fail(400, 'bad_request');
    return raw as CommunityRole;
  }
  /** Custom roles let in: ids of this community's roles, each once. */
  function roleList(id: string, raw: unknown, current: string[]): string[] {
    if (raw === undefined) return current;
    if (!Array.isArray(raw) || raw.length > L.roles || raw.some((r) => typeof r !== 'string' || !roles.role(id, r))) fail(400, 'bad_request');
    return [...new Set(raw as string[])];
  }
  /** A name for an own channel, not taken by another one of this community. */
  function channelName(id: string, raw: unknown, except = ''): string {
    const name = cleanChannelName(raw);
    if (!name) fail(400, 'bad_channel_name');
    if (offensiveName(name!)) fail(400, 'offensive_name');
    if (store.channels(id).some((ch) => ch.id !== except && ch.kind === 'custom' && ch.name === name)) fail(409, 'channel_taken');
    return name!;
  }

  /** Name, colour and permissions of a role from a request, over the current ones. */
  function roleFrom(id: string, a: Actor, raw: Record<string, unknown>, current?: CustomRoleRow) {
    const name = raw.name === undefined && current ? current.name : cleanRoleName(raw.name);
    if (!name) fail(400, 'bad_role_name');
    if (offensiveName(name!)) fail(400, 'offensive_name');
    if (roles.nameTaken(id, name!, current?.id)) fail(409, 'role_taken');
    const color = raw.color === undefined && current ? current.color : cleanColor(raw.color);
    if (!color) fail(400, 'bad_color');
    const permissions = raw.permissions === undefined ? current?.permissions ?? [] : cleanPermissions(raw.permissions);
    if (!permissions) fail(400, 'bad_request');
    // no one gives what they do not have themselves (admins and the owner have it all)
    const added = permissions!.filter((p) => !current?.permissions.includes(p));
    if (added.some((p) => !allowed(a, p))) fail(403, 'not_allowed');
    return { name: name!, color: color!, permissions: permissions! };
  }

  /** An order of every one of these ids (each once); 400 otherwise. */
  function orderFrom(raw: unknown, ids: string[]): string[] {
    if (!Array.isArray(raw) || raw.length !== ids.length || new Set(raw).size !== ids.length || raw.some((x) => typeof x !== 'string' || !ids.includes(x))) fail(400, 'bad_request');
    return raw as string[];
  }

  const done = (c: CommunityRow, me: string) => {
    listChanged(c.id);
    return { community: ctx.memberView(store.community(c.id)!, store.member(c.id, me)!, me) };
  };

  return [
    // -- own channels --
    ['GET', route(`/${ID}/channels`), (req, [id]) => {
      const me = authed(req);
      manager(id, me, 'manageChannels');
      return { channels: store.channels(id).map(channelView), roles: roles.list(id).map((r) => roleView(r)), limit: L.channels };
    }],
    ['POST', route(`/${ID}/channels`), async (req, [id]) => {
      const me = authed(req);
      const { c } = manager(id, me, 'manageChannels');
      const raw = await body(req);
      if (roles.channelCount(id) >= L.channels) fail(400, 'too_many_channels');
      const name = channelName(id, raw.name);
      const access = {
        readRole: channelRole(raw.readRole, 'member'), postRole: channelRole(raw.postRole, 'member'),
        readRoles: roleList(id, raw.readRoles, []), writeRoles: roleList(id, raw.writeRoles, []),
      };
      ctx.limitChanges(me);
      const ch = roles.addChannel(id, { name, ...access });
      store.log(id, me, 'channel_create', '', `#${name}`);
      return { channel: channelView(store.channel(id, ch)!), ...done(c, me) };
    }],
    // before the one with a channel's id ("order" is not one)
    ['POST', route(`/${ID}/channels/order`), async (req, [id]) => {
      const me = authed(req);
      const { c } = manager(id, me, 'manageChannels');
      const order = orderFrom((await body(req)).order, store.channels(id).map((ch) => ch.id));
      ctx.limitChanges(me);
      if (order.some((ch, i) => store.channels(id)[i].id !== ch)) {
        roles.reorderChannels(id, order);
        store.log(id, me, 'channel_order');
      }
      return done(c, me);
    }],
    ['POST', route(`/${ID}/channels/${ID}`), async (req, [id, chId]) => {
      const me = authed(req);
      const { c } = manager(id, me, 'manageChannels');
      const ch = store.channel(id, chId) ?? fail(404, 'not_found');
      const raw = await body(req);
      const custom = ch.kind === 'custom';
      // the built-in two keep their names and stay readable by everyone
      if (!custom && ((raw.name !== undefined && raw.name !== ch.name) || (raw.readRole !== undefined && raw.readRole !== 'member') || (Array.isArray(raw.readRoles) && raw.readRoles.length))) fail(400, 'builtin_channel');
      const name = custom && raw.name !== undefined ? channelName(id, raw.name, ch.id) : ch.name;
      const next = {
        name, readRole: channelRole(raw.readRole, ch.readRole), postRole: channelRole(raw.postRole, ch.postRole),
        readRoles: roleList(id, raw.readRoles, ch.readRoles), writeRoles: roleList(id, raw.writeRoles, ch.writeRoles),
      };
      ctx.limitChanges(me);
      const same = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.includes(v));
      const renamed = name !== ch.name;
      const access = next.readRole !== ch.readRole || next.postRole !== ch.postRole || !same(next.readRoles, ch.readRoles) || !same(next.writeRoles, ch.writeRoles);
      if (renamed || access) {
        roles.updateChannel(ch.id, next);
        const label = (n: string, x: ChannelRow) => (x.kind === 'custom' ? `#${n}` : x.kind);
        store.log(id, me, 'channel_edit', '', renamed ? `${label(ch.name, ch)} → #${name}` : label(name, ch));
      }
      return { channel: channelView(store.channel(id, ch.id)!), ...done(c, me) };
    }],
    ['DELETE', route(`/${ID}/channels/${ID}`), (req, [id, chId]) => {
      const me = authed(req);
      const { c } = manager(id, me, 'manageChannels');
      const ch = store.channel(id, chId) ?? fail(404, 'not_found');
      if (ch.kind !== 'custom') fail(400, 'builtin_channel');
      ctx.limitChanges(me);
      // those who had it open hear it is gone (then the list comes without it)
      ctx.toReaders(id, ch.id, { type: 'community-channel-delete', community: id, channel: ch.id });
      roles.removeChannel(id, ch.id);
      store.log(id, me, 'channel_delete', '', `#${ch.name}`);
      return done(c, me);
    }],

    // -- custom roles --
    ['GET', route(`/${ID}/roles`), (req, [id]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      const a = actorOf(id, m);
      const counts = roles.counts(id);
      return {
        roles: roles.list(id).map((r) => ({ ...roleView(r, counts), manage: mayManageRole(a, r) })),
        permissions: ROLE_PERMISSIONS.map((p) => ({ id: p, mine: allowed(a, p) })), limit: L.roles, manage: allowed(a, 'manageRoles'),
      };
    }],
    ['POST', route(`/${ID}/roles`), async (req, [id]) => {
      const me = authed(req);
      const { c, a } = manager(id, me, 'manageRoles');
      if (roles.list(id).length >= L.roles) fail(400, 'too_many_roles');
      const r = roleFrom(id, a, await body(req));
      ctx.limitChanges(me);
      const rid = roles.create(id, r);
      store.log(id, me, 'role_create', '', r.name);
      return { role: roleView(roles.role(id, rid)!), ...done(c, me) };
    }],
    ['POST', route(`/${ID}/roles/order`), async (req, [id]) => {
      const me = authed(req);
      const { c, a } = manager(id, me, 'manageRoles');
      const list = roles.list(id);
      const order = orderFrom((await body(req)).order, list.map((r) => r.id));
      const n = order.length;
      // below admins: the roles at and above one's own stay where they are
      if (RANK[a.role] < RANK.admin) {
        const own = a.custom?.position ?? 0;
        for (const r of list) {
          const next = n - order.indexOf(r.id);
          if ((r.position >= own || next >= own) && next !== r.position) fail(403, 'not_allowed');
        }
      }
      ctx.limitChanges(me);
      if (list.some((r) => n - order.indexOf(r.id) !== r.position)) {
        roles.reorder(id, order);
        store.log(id, me, 'role_order');
      }
      return done(c, me);
    }],
    ['POST', route(`/${ID}/roles/${ID}`), async (req, [id, rid]) => {
      const me = authed(req);
      const { c, a } = manager(id, me, 'manageRoles');
      const current = roles.role(id, rid) ?? fail(404, 'not_found');
      if (!mayManageRole(a, current)) fail(403, 'not_allowed');
      const r = roleFrom(id, a, await body(req), current);
      ctx.limitChanges(me);
      if (r.name !== current.name || r.color !== current.color || r.permissions.join() !== current.permissions.join()) {
        roles.update(id, rid, r);
        store.log(id, me, 'role_edit', '', r.name === current.name ? r.name : `${current.name} → ${r.name}`);
      }
      return { role: roleView(roles.role(id, rid)!), ...done(c, me) };
    }],
    ['DELETE', route(`/${ID}/roles/${ID}`), (req, [id, rid]) => {
      const me = authed(req);
      const { c, a } = manager(id, me, 'manageRoles');
      const r = roles.role(id, rid) ?? fail(404, 'not_found');
      if (!mayManageRole(a, r)) fail(403, 'not_allowed');
      ctx.limitChanges(me);
      roles.remove(id, rid);
      store.log(id, me, 'role_delete', '', r.name);
      return done(c, me);
    }],
    // a member's custom role given or taken away (null): one below one, a role one manages
    ['POST', route(`/${ID}/members/${USER}/custom-role`), async (req, [id, user]) => {
      const me = authed(req);
      const { c, a } = manager(id, me, 'manageRoles');
      const t = store.member(id, user) ?? fail(404, 'not_found');
      const { role } = await body(req);
      if (role !== null && typeof role !== 'string') fail(400, 'bad_request');
      const next = role === null ? undefined : roles.role(id, role as string) ?? fail(404, 'not_found');
      const target = actorOf(id, t);
      // oneself: admins and the owner only (their power does not change what they may do)
      const mayTouch = user === me ? RANK[a.role] >= RANK.admin : allowedOn(a, 'manageRoles', target);
      if (!mayTouch || (next && !mayManageRole(a, next)) || (target.custom && !mayManageRole(a, target.custom))) fail(403, 'not_allowed');
      ctx.limitChanges(me);
      if ((t.customRole ?? null) !== (next?.id ?? null)) {
        roles.setMemberRole(id, user, next?.id ?? null);
        store.log(id, me, 'member_role', user, next?.name ?? '');
        ctx.push(user, { type: 'communities', id });
        // their messages show the new role once the others fetch again; the channels they read may have changed
        listChanged(id, [user, me]);
      }
      return { ok: true, ...(next ? { customRole: { id: next.id, name: next.name, color: next.color } } : {}), community: ctx.memberView(c, store.member(id, me)!, me) };
    }],
  ];
}
