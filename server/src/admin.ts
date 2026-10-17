import type http from 'node:http';
import type { Db } from './db.ts';
import { CAPE_NAMES, CAPES, capeSetting } from './cosmetics.ts';

/**
 * The admin panel's API, under /v1/admin. Only accounts with the admin role (or listed in
 * ADMIN_HANDLES) get in; every change is written to the admin log.
 */

export interface AdminContext {
  db: Db;
  /** The admin's id, or throws 401/403. */
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fail: (status: number, code: string) => never;
  /** Handles that are admins by configuration (they cannot lose the role in the panel). */
  configAdmins: Set<string>;
  /** Signs the account out everywhere right away (open launchers included). */
  kick: (userId: string) => void;
  /** Players connected now and Minecraft players in a game with the launcher. */
  live: () => { online: number; inGame: number };
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function adminRoutes(ctx: AdminContext): [string, RegExp, Handler][] {
  const { db } = ctx;
  const userOr404 = (id: string) => db.adminUser(id) ?? ctx.fail(404, 'not_found');
  const withConfig = <T extends { handle: string; role: string }>(u: T) => ({ ...u, configAdmin: ctx.configAdmins.has(u.handle.toLowerCase()) });

  return [
    ['GET', /^\/v1\/admin\/stats$/, (req) => {
      ctx.admin(req);
      const week = Date.now() - 7 * 86_400_000;
      return { ...db.stats(week), ...ctx.live(), signups: db.signupsPerDay(30) };
    }],
    ['GET', /^\/v1\/admin\/users$/, (req, _p, url) => {
      ctx.admin(req);
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 25));
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const { users, total } = db.listUsers(q, limit, offset);
      return { users: users.map(withConfig), total };
    }],
    ['GET', /^\/v1\/admin\/users\/([\w-]+)$/, (req, [id]) => {
      ctx.admin(req);
      return { ...withConfig(userOr404(id)), grants: db.grants(id) };
    }],
    ['POST', /^\/v1\/admin\/users\/([\w-]+)$/, async (req, [id]) => {
      const me = ctx.admin(req);
      const user = userOr404(id);
      const { banned, role, cape, rank } = await ctx.body(req);
      if (typeof banned === 'boolean' && banned !== user.banned) {
        if (id === me) ctx.fail(400, 'self');
        if (banned && ctx.configAdmins.has(user.handle.toLowerCase())) ctx.fail(400, 'config_admin');
        db.setBanned(id, banned);
        if (banned) ctx.kick(id);
        db.log(me, banned ? 'ban' : 'unban', user.handle);
      }
      if (typeof role === 'string') {
        if (role !== 'admin' && role !== '') ctx.fail(400, 'bad_role');
        // an admin from ADMIN_HANDLES stays one, whatever the database says
        if (role === '' && ctx.configAdmins.has(user.handle.toLowerCase())) ctx.fail(400, 'config_admin');
        if (role === '' && id === me) ctx.fail(400, 'self');
        if (role !== user.role) {
          db.setRole(id, role);
          db.log(me, role ? 'make_admin' : 'remove_admin', user.handle);
        }
      }
      // the colour of the logo in game: support (light blue) or partner (gold); admins are red without it
      if (typeof rank === 'string' && rank !== user.rank) {
        if (!['', 'support', 'partner'].includes(rank)) ctx.fail(400, 'bad_rank');
        db.setRank(id, rank);
        db.log(me, 'set_rank', user.handle, rank || '—');
      }
      // the admin may give any cape, also an exclusive one without a grant
      if (typeof cape === 'string' && cape !== user.cape) {
        if (cape !== '' && !CAPES.includes(cape)) ctx.fail(400, 'bad_cape');
        db.setCape(id, cape);
        db.log(me, 'set_cape', user.handle, cape || '—');
      }
      return { ...withConfig(userOr404(id)), grants: db.grants(id) };
    }],
    ['POST', /^\/v1\/admin\/users\/([\w-]+)\/logout$/, (req, [id]) => {
      const me = ctx.admin(req);
      const user = userOr404(id);
      db.removeSessions(id);
      ctx.kick(id);
      db.log(me, 'logout', user.handle);
      return { ok: true };
    }],
    ['DELETE', /^\/v1\/admin\/users\/([\w-]+)$/, (req, [id]) => {
      const me = ctx.admin(req);
      const user = userOr404(id);
      if (id === me) ctx.fail(400, 'self');
      if (ctx.configAdmins.has(user.handle.toLowerCase())) ctx.fail(400, 'config_admin');
      ctx.kick(id);
      db.deleteUser(id);
      db.log(me, 'delete', user.handle, user.name);
      return { ok: true };
    }],

    // -- cosmetics --
    ['GET', /^\/v1\/admin\/cosmetics$/, (req) => {
      ctx.admin(req);
      const settings = db.cosmeticSettings();
      const worn = db.stats(0).capes;
      return {
        capes: CAPES.map((id) => ({ ...capeSetting(settings, id), name: CAPE_NAMES[id], wearing: worn[id] ?? 0, grantees: db.grantees(id) })),
      };
    }],
    ['POST', /^\/v1\/admin\/cosmetics\/(\w+)$/, async (req, [id]) => {
      const me = ctx.admin(req);
      if (!CAPES.includes(id)) ctx.fail(404, 'not_found');
      const now = capeSetting(db.cosmeticSettings(), id);
      const { enabled, exclusive } = await ctx.body(req);
      const next = { enabled: typeof enabled === 'boolean' ? enabled : now.enabled, exclusive: typeof exclusive === 'boolean' ? exclusive : now.exclusive };
      db.setCosmetic(id, next.enabled, next.exclusive);
      // who may not wear it any more takes it off
      if (!next.enabled) db.clearCape(id, false);
      else if (next.exclusive) db.clearCape(id, true);
      db.log(me, 'cape_settings', id, `${next.enabled ? 'włączona' : 'wyłączona'}${next.exclusive ? ', ekskluzywna' : ''}`);
      return { ...next, id };
    }],
    ['POST', /^\/v1\/admin\/cosmetics\/(\w+)\/grants$/, async (req, [id]) => {
      const me = ctx.admin(req);
      if (!CAPES.includes(id)) ctx.fail(404, 'not_found');
      const { handle } = await ctx.body(req);
      const user = typeof handle === 'string' ? db.userByHandle(handle.replace(/^@/, '')) : undefined;
      if (!user) ctx.fail(404, 'no_such_user');
      db.grant(user.id, id);
      db.log(me, 'grant', user.handle, id);
      return { grantees: db.grantees(id) };
    }],
    ['DELETE', /^\/v1\/admin\/cosmetics\/(\w+)\/grants\/([\w-]+)$/, (req, [id, userId]) => {
      const me = ctx.admin(req);
      const user = userOr404(userId);
      db.revoke(userId, id);
      if (capeSetting(db.cosmeticSettings(), id).exclusive && user.cape === id) db.setCape(userId, '');
      db.log(me, 'revoke', user.handle, id);
      return { grantees: db.grantees(id) };
    }],

    ['GET', /^\/v1\/admin\/log$/, (req) => {
      ctx.admin(req);
      return { entries: db.logEntries(200) };
    }],
  ];
}
