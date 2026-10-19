import type { DatabaseSync } from 'node:sqlite';
import type http from 'node:http';

/**
 * Muted friends: they stay on the list and their messages still arrive, but the player's
 * launchers and games show no toast or notification for them (messages, invites, joining a
 * game). Kept on the account, so every launcher and game of the player knows it.
 */

export interface MuteContext {
  sql: DatabaseSync;
  authed: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  areFriends: (a: string, b: string) => boolean;
  /** The player's friends list as GET /v1/friends answers it. */
  friendList: (me: string) => unknown;
  push: (userId: string, event: unknown) => void;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export class MuteStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec('CREATE TABLE IF NOT EXISTS friend_mutes (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, friend TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uuid, friend))');
  }

  /** The friends this player muted. */
  muted(uuid: string): Set<string> {
    return new Set((this.sql.prepare('SELECT friend FROM friend_mutes WHERE uuid = ?').all(uuid) as { friend: string }[]).map((r) => r.friend));
  }

  set(uuid: string, friend: string, muted: boolean) {
    if (muted) this.sql.prepare('INSERT OR IGNORE INTO friend_mutes (uuid, friend, at) VALUES (?, ?, ?)').run(uuid, friend, Date.now());
    else this.sql.prepare('DELETE FROM friend_mutes WHERE uuid = ? AND friend = ?').run(uuid, friend);
  }

  /** A friendship ended: neither side's mute stays behind for a later one. */
  forget(a: string, b: string) {
    this.sql.prepare('DELETE FROM friend_mutes WHERE (uuid = ? AND friend = ?) OR (uuid = ? AND friend = ?)').run(a, b, b, a);
  }
}

export function muteRoutes(ctx: MuteContext) {
  const store = new MuteStore(ctx.sql);
  const routes: [string, RegExp, Handler][] = [
    // { muted: true | false }; answers with the friends list, and the player's other launchers and games hear it
    ['POST', /^\/v1\/friends\/([\w-]+)\/mute$/, async (req, [other]) => {
      const me = ctx.authed(req);
      if (!ctx.areFriends(me, other)) ctx.fail(403, 'not_friends');
      const { muted } = await ctx.body(req);
      if (typeof muted !== 'boolean') ctx.fail(400, 'bad_request');
      store.set(me, other, muted);
      ctx.push(me, { type: 'friends' });
      return ctx.friendList(me);
    }],
  ];
  return { routes, store };
}
