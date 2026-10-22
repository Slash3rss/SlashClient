import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from './db.ts';
import { serverKeyOf, type Presence } from './presence.ts';
import type { SettingDef } from './settings.ts';

/**
 * Friend suggestions from players met recently ("Propozycje" in the Friends view and the game).
 *
 * What counts as meeting: two SlashClient players connected at the same moment, both in a game on
 * the same server (the same normalised address: a network counts as one place), neither invisible
 * and both letting themselves be suggested. Once a minute (`tick`) every such pair gets the minute
 * added to its row for that server, with the time it last happened. On top of that the game may say,
 * a few times a minute at most, which players are near it in the world (the entities it knows,
 * within the render distance): the server keeps only those who are linked SlashClient players on
 * the same server right now, as "nearby" time of the pair; any other uuid is dropped unread.
 *
 * Rows older than the admin's number of days are pruned. A suggestion is a player met within that
 * time, for long enough (or nearby), not a friend, without a request either way, not dismissed by
 * either of the two (a dismissed one stays hidden for a long time), ranked by the time together,
 * time nearby, how recent it was and the friends they share. The switch "Pokazuj mnie w propozycjach
 * znajomych" (on unless the player turns it off) is both ways: off, the player meets nobody, shows
 * up for nobody and sees no suggestions, and what was gathered about them is deleted.
 */

const ID = /^[\w-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const SERVER_ADDRESS = /^[\w.-]{1,253}(:\d{1,5})?$/;
/** Most uuids one report from the game may carry (players in sight). */
export const MAX_NEARBY = 100;
/** A nearby pair counts once in this long, however often the game reports. */
export const NEARBY_GAP_MS = 50_000;
/** How much one report of a pair nearby is worth. */
export const NEARBY_SECONDS = 60;
/** At most this many suggestions in one answer. */
export const MAX_LIST = 30;

export const SUGGESTION_SETTING_DEFS: SettingDef[] = ([
  { key: 'suggestions.enabled', label: 'Propozycje znajomych', labelEn: 'Friend suggestions', description: 'Zapisywanie, z kim gracze grali na tym samym serwerze, i propozycje znajomych z tego w launcherze i w grze. Wyłączone: nic nowego nie jest zapisywane, propozycje znikają (zapisane spotkania wygasają same).', type: 'bool', default: true },
  { key: 'suggestions.keepDays', label: 'Pamiętaj spotkania przez', labelEn: 'Keep encounters for', description: 'Po tylu dniach od ostatniej wspólnej gry para jest usuwana i nie jest już proponowana.', type: 'duration', default: 14, min: 1, max: 90, unit: 'dni' },
  { key: 'suggestions.minMinutes', label: 'Najmniej wspólnej gry', labelEn: 'Least time together', description: 'Tyle minut na jednym serwerze naraz (razem, w ostatnich dniach), żeby ktoś był proponowany. Gracze widziani obok siebie w świecie liczą się od razu.', type: 'duration', default: 15, min: 1, max: 1440, unit: 'min' },
  { key: 'suggestions.dismissDays', label: 'Ukryta propozycja wraca po', labelEn: 'A dismissed suggestion comes back after', description: 'Gracz odrzucony przyciskiem × nie jest proponowany (w żadną stronę) przez tyle dni.', type: 'duration', default: 180, min: 1, max: 3650, unit: 'dni' },
  { key: 'suggestions.maxPerServer', label: 'Najwięcej graczy na serwerze w parach', labelEn: 'Most players per server in pairs', description: 'Na serwerze z większą liczbą graczy SlashClient naraz czas na tym samym serwerze nie jest liczony (za dużo par); liczą się tylko gracze widziani obok siebie.', type: 'int', default: 150, min: 2, max: 2000 },
  { key: 'suggestions.listPerMinute', label: 'Pobrania propozycji na minutę', labelEn: 'Suggestion lists per minute', description: 'Na konto.', type: 'int', default: 30, min: 1, max: 10_000, unit: '/min' },
  { key: 'suggestions.dismissPerMinute', label: 'Ukrycia propozycji na minutę', labelEn: 'Dismissals per minute', description: 'Na konto.', type: 'int', default: 30, min: 1, max: 10_000, unit: '/min' },
  { key: 'suggestions.nearbyPerMinute', label: 'Raporty „obok” z gry na minutę', labelEn: 'Nearby reports per minute', description: 'Na konto: gra wysyła listę graczy w zasięgu wzroku co minutę.', type: 'int', default: 6, min: 1, max: 600, unit: '/min' },
] as Omit<SettingDef, 'category'>[]).map((d) => ({ ...d, category: 'suggestions' as const }));

export interface SuggestionSettings { keepDays: number; minMinutes: number; dismissDays: number; maxPerServer: number }

/** One suggested player, as clients get it. `server`: the place they met most (its name from a status rule, else the address). */
export interface Suggestion {
  id: string; handle: string; name: string; avatar: string;
  server: string; minutes: number; nearbyMinutes: number; lastAt: number; mutual: number;
}

/** A player in a game on a server right now, for the minute's tick. */
export interface Playing { user: string; server: string }

/** The two ids of a pair in a fixed order, so a pair is one row. */
const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/**
 * A suggestion's place in the list: time together counts less with every hour (two hours are not
 * twice one), nearby time counts three times, each shared friend as much as half an hour, and a
 * meeting today more than one from two weeks ago.
 */
export function score(s: { seconds: number; nearby: number; lastAt: number; mutual: number }, now: number, keepMs: number): number {
  const minutes = (s.seconds + 3 * s.nearby) / 60;
  const fresh = keepMs > 0 ? Math.max(0, 1 - (now - s.lastAt) / keepMs) : 0;
  return Math.log2(1 + minutes) * 10 + Math.min(s.mutual, 10) * 6 + fresh * 12;
}

export class SuggestionStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS encounters (
  a TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, b TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  server TEXT NOT NULL, seconds INTEGER NOT NULL DEFAULT 0, nearby INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL, last_at INTEGER NOT NULL, PRIMARY KEY (a, b, server));
CREATE INDEX IF NOT EXISTS encounters_b ON encounters(b);
CREATE INDEX IF NOT EXISTS encounters_last ON encounters(last_at);
CREATE TABLE IF NOT EXISTS suggestion_prefs (
  uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, visible INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS suggestion_dismissals (
  uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, other TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  at INTEGER NOT NULL, PRIMARY KEY (uuid, other));
CREATE INDEX IF NOT EXISTS suggestion_dismissals_other ON suggestion_dismissals(other);`);
  }

  /** "Pokazuj mnie w propozycjach znajomych": on unless the player turned it off. */
  visible(uuid: string): boolean {
    const r = this.sql.prepare('SELECT visible FROM suggestion_prefs WHERE uuid = ?').get(uuid) as { visible: number } | undefined;
    return r ? !!r.visible : true;
  }

  /** Turned off: everything gathered about the player goes too. */
  setVisible(uuid: string, visible: boolean, now = Date.now()) {
    this.sql.prepare(`INSERT INTO suggestion_prefs (uuid, visible, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (uuid) DO UPDATE SET visible = excluded.visible, updated_at = excluded.updated_at`).run(uuid, visible ? 1 : 0, now);
    if (!visible) this.sql.prepare('DELETE FROM encounters WHERE a = ? OR b = ?').run(uuid, uuid);
  }

  /** Those of `uuids` who turned suggestions off. */
  hidden(uuids: string[]): Set<string> {
    if (!uuids.length) return new Set();
    const out = new Set<string>();
    for (let i = 0; i < uuids.length; i += 500) {
      const part = uuids.slice(i, i + 500);
      const rows = this.sql.prepare(`SELECT uuid FROM suggestion_prefs WHERE visible = 0 AND uuid IN (${part.map(() => '?').join(',')})`).all(...part) as { uuid: string }[];
      for (const r of rows) out.add(r.uuid);
    }
    return out;
  }

  /** `seconds` together on `server` for each pair. */
  meet(pairs: [string, string][], server: string, seconds: number, now: number) {
    if (!pairs.length) return;
    const up = this.sql.prepare(`INSERT INTO encounters (a, b, server, seconds, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (a, b, server) DO UPDATE SET seconds = seconds + excluded.seconds, last_at = excluded.last_at`);
    this.sql.exec('BEGIN');
    try {
      for (const [x, y] of pairs) {
        const [a, b] = pair(x, y);
        up.run(a, b, server, seconds, now, now);
      }
      this.sql.exec('COMMIT');
    } catch (err) {
      this.sql.exec('ROLLBACK');
      throw err;
    }
  }

  /** The pair was seen next to each other in the world. */
  near(x: string, y: string, server: string, seconds: number, now: number) {
    const [a, b] = pair(x, y);
    this.sql.prepare(`INSERT INTO encounters (a, b, server, nearby, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (a, b, server) DO UPDATE SET nearby = nearby + excluded.nearby, last_at = excluded.last_at`).run(a, b, server, seconds, now, now);
  }

  dismiss(uuid: string, other: string, now = Date.now()) {
    this.sql.prepare('INSERT INTO suggestion_dismissals (uuid, other, at) VALUES (?, ?, ?) ON CONFLICT (uuid, other) DO UPDATE SET at = excluded.at').run(uuid, other, now);
  }

  /** Ids `uuid` dismissed, or who dismissed `uuid`, since `since`. */
  dismissed(uuid: string, since: number): Set<string> {
    const rows = this.sql.prepare(`SELECT other AS id FROM suggestion_dismissals WHERE uuid = ? AND at >= ?
      UNION SELECT uuid AS id FROM suggestion_dismissals WHERE other = ? AND at >= ?`).all(uuid, since, uuid, since) as { id: string }[];
    return new Set(rows.map((r) => r.id));
  }

  /** Every place `uuid` met someone since `since`. */
  encounters(uuid: string, since: number): { other: string; server: string; seconds: number; nearby: number; lastAt: number }[] {
    return this.sql.prepare(`SELECT CASE WHEN a = ? THEN b ELSE a END AS other, server, seconds, nearby, last_at AS lastAt FROM encounters
      WHERE (a = ? OR b = ?) AND last_at >= ?`).all(uuid, uuid, uuid, since) as { other: string; server: string; seconds: number; nearby: number; lastAt: number }[];
  }

  /** Drops encounters and dismissals past their time; returns how many encounters went. */
  prune(now: number, keepMs: number, dismissMs: number): number {
    const gone = Number(this.sql.prepare('DELETE FROM encounters WHERE last_at < ?').run(now - keepMs).changes);
    this.sql.prepare('DELETE FROM suggestion_dismissals WHERE at < ?').run(now - dismissMs);
    return gone;
  }

  /** How many pairs are kept (the admin panel, tests). */
  count(): number {
    return Number((this.sql.prepare('SELECT COUNT(*) AS n FROM encounters').get() as { n: number }).n);
  }
}

interface Deps {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  /** The admin's switch and numbers. */
  enabled: () => boolean;
  settings: () => SuggestionSettings;
  /** Who is in a game on a server now: connected, not invisible (the caller leaves out the rest). */
  playing: () => Playing[];
  /** What a connected launcher says the player is doing (undefined: not connected). */
  presenceOf: (userId: string) => Presence | undefined;
  /** The SlashClient account playing as this Minecraft uuid now, or linked to it; undefined for anyone else. */
  accountOf: (uuid: string) => string | undefined;
  /** A server's name from its status rule ("SkyUp.pl"), for the reason line. */
  serverName: (server: string) => string | undefined;
  /** One of the two blocked the other (no blocking yet: never). */
  blocked?: (a: string, b: string) => boolean;
  limitList: (userId: string) => void;
  limitDismiss: (userId: string) => void;
  limitNearby: (userId: string) => void;
  fail: (status: number, code: string) => never;
}

export function createSuggestions(deps: Deps) {
  const { db, authed, body, fail } = deps;
  const store = new SuggestionStore(db.sql);
  /** When a nearby pair last counted (in memory: a restart only lets one more minute through). */
  const lastNear = new Map<string, number>();

  /** The server a player is on now, as a key ('' when not on one, invisible or not connected). */
  const serverOf = (userId: string) => {
    const p = deps.presenceOf(userId);
    if (!p || p.status === 'invisible' || p.activity?.kind !== 'server') return '';
    return serverKeyOf(p.activity.server);
  };

  /**
   * The minute's count: every pair of players in a game on the same server now gets `seconds`
   * together. A server with more SlashClient players than the admin's number is skipped (nearby still counts).
   */
  function tick(now = Date.now(), seconds = 60) {
    if (!deps.enabled()) return { pairs: 0 };
    const { maxPerServer } = deps.settings();
    const byServer = new Map<string, Set<string>>();
    for (const p of deps.playing()) {
      const key = serverKeyOf(p.server);
      if (!key) continue;
      if (!byServer.has(key)) byServer.set(key, new Set());
      byServer.get(key)!.add(p.user);
    }
    const everyone = [...byServer.values()].flatMap((s) => [...s]);
    const hidden = store.hidden(everyone);
    let pairs = 0;
    for (const [server, set] of byServer) {
      const users = [...set].filter((u) => !hidden.has(u));
      if (users.length < 2 || users.length > maxPerServer) continue;
      const list: [string, string][] = [];
      for (let i = 0; i < users.length; i++) for (let j = i + 1; j < users.length; j++) list.push([users[i], users[j]]);
      store.meet(list, server, seconds, now);
      pairs += list.length;
    }
    return { pairs };
  }

  /** Old encounters and dismissals out (hourly). */
  function prune(now = Date.now()) {
    const s = deps.settings();
    for (const [k, at] of lastNear) if (now - at > NEARBY_GAP_MS) lastNear.delete(k);
    return store.prune(now, s.keepDays * 86_400_000, s.dismissDays * 86_400_000);
  }

  /** `me`'s suggestions now, best first. */
  function list(me: string, limit = MAX_LIST, now = Date.now()): Suggestion[] {
    if (!deps.enabled() || !store.visible(me)) return [];
    const s = deps.settings();
    const keepMs = s.keepDays * 86_400_000;
    const byOther = new Map<string, { seconds: number; nearby: number; lastAt: number; places: Map<string, number> }>();
    for (const e of store.encounters(me, now - keepMs)) {
      const o = byOther.get(e.other) ?? { seconds: 0, nearby: 0, lastAt: 0, places: new Map<string, number>() };
      o.seconds += e.seconds;
      o.nearby += e.nearby;
      o.lastAt = Math.max(o.lastAt, e.lastAt);
      o.places.set(e.server, (o.places.get(e.server) ?? 0) + e.seconds + 3 * e.nearby);
      byOther.set(e.other, o);
    }
    if (!byOther.size) return [];
    const dismissed = store.dismissed(me, now - s.dismissDays * 86_400_000);
    const hidden = store.hidden([...byOther.keys()]);
    const friends = new Set(db.friends(me).map((f) => f.id));
    const pending = new Set([...db.incoming(me), ...db.outgoing(me)].map((r) => r.id));
    const candidates: { id: string; seconds: number; nearby: number; lastAt: number; places: Map<string, number> }[] = [];
    for (const [id, o] of byOther) {
      if (id === me || friends.has(id) || pending.has(id) || dismissed.has(id) || hidden.has(id) || deps.blocked?.(me, id)) continue;
      // long enough on the same server, or seen next to each other
      if (o.seconds < s.minMinutes * 60 && o.nearby < NEARBY_SECONDS) continue;
      candidates.push({ id, ...o });
    }
    // the shared friends of the best ones only (one query each)
    candidates.sort((a, b) => score({ ...b, mutual: 0 }, now, keepMs) - score({ ...a, mutual: 0 }, now, keepMs));
    const out: (Suggestion & { score: number })[] = [];
    for (const c of candidates.slice(0, Math.max(limit, 1) * 3)) {
      const user = db.user(c.id);
      if (!user || user.banned) continue;
      const mutual = friends.size ? db.friends(c.id).filter((f) => friends.has(f.id)).length : 0;
      const top = [...c.places].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      out.push({
        id: c.id, handle: user.handle, name: user.name, avatar: user.avatar,
        server: deps.serverName(top) || top, minutes: Math.round(c.seconds / 60), nearbyMinutes: Math.round(c.nearby / 60), lastAt: c.lastAt, mutual,
        score: score({ ...c, mutual }, now, keepMs),
      });
    }
    out.sort((a, b) => b.score - a.score || b.lastAt - a.lastAt);
    return out.slice(0, limit).map(({ score: _score, ...rest }) => rest);
  }

  /** The game says who is near it in the world: only linked SlashClient players on the same server count. */
  function nearby(me: string, server: string, uuids: string[], now = Date.now()): number {
    if (!deps.enabled() || !store.visible(me)) return 0;
    const here = serverOf(me);
    if (!here || here !== serverKeyOf(server)) return 0;
    const others = new Set<string>();
    for (const u of uuids) {
      const id = deps.accountOf(u);
      if (id && id !== me) others.add(id);
    }
    const hidden = store.hidden([...others]);
    let n = 0;
    for (const other of others) {
      if (hidden.has(other) || serverOf(other) !== here) continue;
      const key = pair(me, other).join(' ') + ' ' + here;
      if (now - (lastNear.get(key) ?? 0) < NEARBY_GAP_MS) continue;
      lastNear.set(key, now);
      store.near(me, other, here, NEARBY_SECONDS, now);
      n++;
    }
    return n;
  }

  const view = (me: string, limit?: number) => ({ enabled: deps.enabled(), visible: store.visible(me), suggestions: list(me, limit) });

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Handler][] = [
    // { enabled, visible, suggestions: [...] }; `limit` up to 30
    ['GET', /^\/v1\/friends\/suggestions$/, (req, _p, url) => {
      const me = authed(req);
      deps.limitList(me);
      const limit = Math.min(MAX_LIST, Math.max(1, Number(url.searchParams.get('limit')) || 12));
      return view(me, limit);
    }],
    // "×": this player is not suggested again (either way) for a long time
    ['POST', /^\/v1\/friends\/suggestions\/([\w-]{1,64})\/dismiss$/, (req, [other]) => {
      const me = authed(req);
      deps.limitDismiss(me);
      if (!ID.test(other) || other === me || !db.user(other)) fail(404, 'not_found');
      store.dismiss(me, other);
      return view(me);
    }],
    ['GET', /^\/v1\/me\/suggestions$/, (req) => {
      const me = authed(req);
      return { visible: store.visible(me), enabled: deps.enabled() };
    }],
    // the privacy switch; off also forgets every encounter of the player
    ['POST', /^\/v1\/me\/suggestions$/, async (req) => {
      const me = authed(req);
      const { visible } = await body(req);
      if (typeof visible !== 'boolean') fail(400, 'bad_request');
      store.setVisible(me, visible as boolean);
      return { visible: store.visible(me), enabled: deps.enabled() };
    }],
    // from the game (through the launcher's bridge): the Minecraft uuids of players in sight, on this server
    ['POST', /^\/v1\/mc\/nearby$/, async (req) => {
      const me = authed(req);
      deps.limitNearby(me);
      const { server, uuids } = await body(req);
      if (typeof server !== 'string' || !SERVER_ADDRESS.test(server) || !Array.isArray(uuids) || uuids.length > MAX_NEARBY) fail(400, 'bad_request');
      const valid = (uuids as unknown[]).filter((u): u is string => typeof u === 'string' && UUID.test(u));
      // nothing about who was found: that would tell the game which players use SlashClient
      nearby(me, server as string, valid);
      return { ok: true };
    }],
  ];

  return { routes, store, tick, prune, list, nearby };
}
