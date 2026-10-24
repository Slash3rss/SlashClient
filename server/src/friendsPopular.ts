import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from './db.ts';
import { cleanSharing, PositionSharingStore, type PositionSharing, type ShareMode } from './positions.ts';
import { serverKeyOf } from './presence.ts';
import type { SettingDef } from './settings.ts';

/**
 * "Popularne wśród znajomych" in the launcher: mods, resource packs, shaders and servers that the
 * player's friends use, each with how many friends and which ones.
 *
 * What a launcher sends (POST /v1/me/popular, only when it changed and at most every few minutes):
 * the Modrinth and CurseForge projects in its profiles, by site and project id (never file names,
 * and nothing added by hand that the sites do not recognise), with each profile's loader and game
 * version, and the servers it played on in the last days. The report replaces the previous one.
 *
 * Who it counts for: the choice "Pokazuj znajomym, czego używam" (all friends, picked friends or
 * nobody; the admin sets what a player who never chose gets). With "nobody" nothing is kept at all.
 * A player asking (GET /v1/friends/popular) gets, per item, only the number of their friends who
 * share with them and use it, and those friends' nicks: never anyone's own list, never the loader,
 * version or time of a friend, at most the admin's number of items. Older launchers send nothing
 * and ask nothing; an older server without these routes makes the launcher hide the section.
 */

export type Source = 'modrinth' | 'curseforge';
export type ContentKind = 'mod' | 'resourcepack' | 'shader';
export interface ReportedContent { source: Source; id: string; type: ContentKind; loader: string; gameVersion: string }
export interface ReportedServer { address: string; at: number }
export interface FriendRef { id: string; handle: string; name: string; avatar: string }
export interface PopularContent { source: Source; id: string; type: ContentKind; count: number; friends: FriendRef[] }
export interface PopularServer { address: string; name?: string; count: number; friends: FriendRef[] }

const SOURCES: Source[] = ['modrinth', 'curseforge'];
const KINDS: ContentKind[] = ['mod', 'resourcepack', 'shader'];
const PROJECT_ID: Record<Source, RegExp> = { modrinth: /^[A-Za-z0-9]{8}$/, curseforge: /^\d{1,10}$/ };
const LOADER = /^[a-z]{0,16}$/;
const GAME_VERSION = /^[\w.+-]{0,32}$/;
const SERVER_ADDRESS = /^[\w.-]{1,253}(:\d{1,5})?$/;
/** Nicks shown per item at most: the count says the rest. */
export const MAX_NAMES = 10;

export const POPULAR_SETTING_DEFS: SettingDef[] = ([
  { key: 'friendsPopular.enabled', label: 'Popularne wśród znajomych', labelEn: 'Popular among friends', description: 'Sekcja w launcherze (Mody, Odkrywaj, Serwery) z tym, czego używają znajomi. Wyłączone: launcher nic nie wysyła i sekcja się chowa (zapisane listy zostają, ale nikt ich nie widzi).', type: 'bool', default: true },
  { key: 'friendsPopular.defaultMode', label: 'Domyślnie pokazuj znajomym', labelEn: 'Shared by default with', description: 'Dla graczy, którzy sami nie wybrali „Pokazuj znajomym, czego używam”: all – wszystkim znajomym, off – nikomu.', type: 'enum', options: ['all', 'off'], default: 'all' },
  { key: 'friendsPopular.maxItems', label: 'Najwięcej projektów od gracza', labelEn: 'Most projects per player', description: 'Mody, paczki zasobów i shadery z jednego launchera; reszta jest pomijana.', type: 'int', default: 400, min: 10, max: 5000 },
  { key: 'friendsPopular.maxServers', label: 'Najwięcej serwerów od gracza', labelEn: 'Most servers per player', description: 'Ostatnio odwiedzane serwery z jednego launchera.', type: 'int', default: 30, min: 1, max: 500 },
  { key: 'friendsPopular.serverDays', label: 'Serwery z ostatnich', labelEn: 'Servers from the last', description: 'Liczą się serwery, na których znajomy grał w tylu ostatnich dniach.', type: 'duration', default: 30, min: 1, max: 365, unit: 'dni' },
  { key: 'friendsPopular.keepDays', label: 'Lista ważna przez', labelEn: 'A list stays for', description: 'Lista gracza, który tyle dni nie otworzył launchera, przestaje się liczyć i jest usuwana.', type: 'duration', default: 60, min: 1, max: 365, unit: 'dni' },
  { key: 'friendsPopular.maxResults', label: 'Najwięcej wyników', labelEn: 'Most results', description: 'Tyle najpopularniejszych pozycji każdego rodzaju (mody, paczki zasobów, shadery, serwery) dostaje gracz.', type: 'int', default: 12, min: 1, max: 100 },
  { key: 'friendsPopular.cacheSeconds', label: 'Wynik ważny przez', labelEn: 'Results cached for', description: 'Tyle sekund gracz dostaje ten sam policzony wynik, zanim serwer policzy go od nowa.', type: 'duration', default: 120, min: 0, max: 3600, unit: 's' },
  { key: 'friendsPopular.reportsPerMinute', label: 'Listy od launchera na minutę', labelEn: 'Reports per minute', description: 'Na konto: launcher wysyła listę tylko po zmianie, najwyżej co kilka minut.', type: 'int', default: 4, min: 1, max: 600, unit: '/min' },
  { key: 'friendsPopular.listPerMinute', label: 'Pobrania wyników na minutę', labelEn: 'Result lists per minute', description: 'Na konto.', type: 'int', default: 30, min: 1, max: 10_000, unit: '/min' },
] as Omit<SettingDef, 'category'>[]).map((d) => ({ ...d, category: 'friendsPopular' as const }));

export interface PopularSettings {
  enabled: boolean; defaultMode: ShareMode; maxItems: number; maxServers: number; serverDays: number; keepDays: number;
  maxResults: number; cacheSeconds: number;
}

/** A launcher's report, cleaned: anything odd in an entry drops the entry; past the limits the rest is dropped. */
export function cleanReport(raw: Record<string, unknown>, s: Pick<PopularSettings, 'maxItems' | 'maxServers' | 'serverDays'>, now = Date.now()) {
  const content: ReportedContent[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(raw.content) ? raw.content : []) {
    if (content.length >= s.maxItems) break;
    if (!c || typeof c !== 'object') continue;
    const { source, id, type, loader, gameVersion } = c as Record<string, unknown>;
    if (!SOURCES.includes(source as Source) || typeof id !== 'string' || !PROJECT_ID[source as Source].test(id)) continue;
    if (!KINDS.includes(type as ContentKind)) continue;
    const l = typeof loader === 'string' && LOADER.test(loader) ? loader : '';
    const v = typeof gameVersion === 'string' && GAME_VERSION.test(gameVersion) ? gameVersion : '';
    const key = `${source}:${id}|${l}|${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    content.push({ source: source as Source, id, type: type as ContentKind, loader: l, gameVersion: v });
  }
  const servers = new Map<string, number>();
  const since = now - s.serverDays * 86_400_000;
  for (const r of Array.isArray(raw.servers) ? raw.servers : []) {
    if (servers.size >= s.maxServers) break;
    const { address, at } = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (typeof address !== 'string' || !SERVER_ADDRESS.test(address.trim())) continue;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < since) continue;
    const key = serverKeyOf(address);
    servers.set(key, Math.max(servers.get(key) ?? 0, Math.min(at, now)));
  }
  return { content, servers: [...servers].map(([address, at]): ReportedServer => ({ address, at })) };
}

/** Each player's last report: one row per project (and loader and version) or server. */
export class PopularStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS popular_items (
  uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, kind TEXT NOT NULL, key TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '', loader TEXT NOT NULL DEFAULT '', game_version TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL,
  PRIMARY KEY (uuid, kind, key, loader, game_version));
CREATE INDEX IF NOT EXISTS popular_items_at ON popular_items (at);
CREATE TABLE IF NOT EXISTS popular_reports (
  uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, at INTEGER NOT NULL);`);
  }

  /** The player's new list in place of the old one. */
  replace(uuid: string, report: ReturnType<typeof cleanReport>, now = Date.now()) {
    this.sql.exec('BEGIN');
    try {
      this.forget(uuid);
      const add = this.sql.prepare('INSERT OR IGNORE INTO popular_items (uuid, kind, key, type, loader, game_version, at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const c of report.content) add.run(uuid, 'content', `${c.source}:${c.id}`, c.type, c.loader, c.gameVersion, now);
      for (const s of report.servers) add.run(uuid, 'server', s.address, 'server', '', '', s.at);
      this.sql.prepare('INSERT INTO popular_reports (uuid, at) VALUES (?, ?) ON CONFLICT (uuid) DO UPDATE SET at = excluded.at').run(uuid, now);
      this.sql.exec('COMMIT');
    } catch (err) {
      this.sql.exec('ROLLBACK');
      throw err;
    }
  }

  forget(uuid: string) {
    this.sql.prepare('DELETE FROM popular_items WHERE uuid = ?').run(uuid);
    this.sql.prepare('DELETE FROM popular_reports WHERE uuid = ?').run(uuid);
  }

  /** The rows of these players whose report is fresh enough (servers: played on recently enough). */
  rows(uuids: string[], keepSince: number, serverSince: number) {
    if (!uuids.length) return [];
    return this.sql.prepare(`SELECT i.uuid, i.kind, i.key, i.type, i.loader FROM popular_items i
      JOIN popular_reports r ON r.uuid = i.uuid
      WHERE i.uuid IN (SELECT value FROM json_each(?)) AND r.at >= ? AND (i.kind = 'content' OR i.at >= ?)`)
      .all(JSON.stringify(uuids), keepSince, serverSince) as { uuid: string; kind: string; key: string; type: string; loader: string }[];
  }

  /** Lists of players who have not opened a launcher for too long. */
  prune(keepSince: number) {
    const old = this.sql.prepare('SELECT uuid FROM popular_reports WHERE at < ?').all(keepSince) as { uuid: string }[];
    for (const r of old) this.forget(r.uuid);
    return old.length;
  }
}

interface Deps {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  settings: () => PopularSettings;
  serverName: (server: string) => string | undefined;
  limitReports: (key: string) => void;
  limitList: (key: string) => void;
  fail: (status: number, code: string) => never;
}

export function popularRoutes(deps: Deps) {
  const { db, authed, body, settings, serverName, limitReports, limitList, fail } = deps;
  const sharing = new PositionSharingStore(db.sql, 'popular_sharing', () => settings().defaultMode);
  const store = new PopularStore(db.sql);
  /** Counted results per player (and loader asked for), for the admin's number of seconds. */
  const cache = new Map<string, { at: number; answer: unknown }>();

  /** May `friend` count what `me` uses, by `me`'s choice? */
  const sharesWith = (s: PositionSharing, friend: string) => s.mode === 'all' || (s.mode === 'some' && s.friends.includes(friend));

  function count(me: string, loader: string) {
    const s = settings();
    const now = Date.now();
    const friends = db.friends(me).filter((f) => sharesWith(sharing.get(f.id), me));
    const byId = new Map(friends.map((f) => [f.id, { id: f.id, handle: f.handle, name: f.name, avatar: f.avatar }]));
    const rows = store.rows([...byId.keys()], now - s.keepDays * 86_400_000, now - s.serverDays * 86_400_000);
    // item -> the friends using it (a friend once, however many profiles have it)
    const items = new Map<string, { kind: string; key: string; type: string; who: Set<string> }>();
    for (const r of rows) {
      // a mod for another loader is no use in the profile asked about; packs and shaders fit any
      if (loader && r.type === 'mod' && r.loader && r.loader !== loader) continue;
      const k = `${r.kind}|${r.key}`;
      const item = items.get(k) ?? { kind: r.kind, key: r.key, type: r.type, who: new Set<string>() };
      item.who.add(r.uuid);
      items.set(k, item);
    }
    const ranked = [...items.values()].sort((a, b) => b.who.size - a.who.size || a.key.localeCompare(b.key));
    const people = (who: Set<string>) => [...who].map((id) => byId.get(id)!).sort((a, b) => a.name.localeCompare(b.name, 'pl')).slice(0, MAX_NAMES);
    const content: PopularContent[] = [];
    for (const type of KINDS) {
      for (const it of ranked.filter((i) => i.kind === 'content' && i.type === type).slice(0, s.maxResults)) {
        const [source, id] = it.key.split(':') as [Source, string];
        content.push({ source, id, type, count: it.who.size, friends: people(it.who) });
      }
    }
    const servers: PopularServer[] = ranked.filter((i) => i.kind === 'server').slice(0, s.maxResults)
      .map((it) => ({ address: it.key, name: serverName(it.key), count: it.who.size, friends: people(it.who) }));
    return { enabled: true, content, servers };
  }

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/me\/popular-sharing$/, (req) => ({ ...sharing.get(authed(req)), enabled: settings().enabled })],
    // "Pokazuj znajomym, czego używam": all friends, picked ones or nobody (then nothing of it is kept)
    ['POST', /^\/v1\/me\/popular-sharing$/, async (req) => {
      const me = authed(req);
      const raw = await body(req);
      const next = cleanSharing(raw);
      if (!next) fail(400, 'bad_request');
      if (raw.friends === undefined) next!.friends = sharing.get(me).friends;
      const friends = new Set(db.friends(me).map((f) => f.id));
      next!.friends = next!.friends.filter((id) => friends.has(id));
      sharing.set(me, next!);
      if (next!.mode === 'off') store.forget(me);
      // friends who may no longer see it do not get it from an older count either
      cache.clear();
      return { ...next!, enabled: settings().enabled };
    }],
    // the launcher's list, when it changed: kept in place of the previous one
    ['POST', /^\/v1\/me\/popular$/, async (req) => {
      const me = authed(req);
      const s = settings();
      if (!s.enabled) fail(403, 'disabled');
      limitReports(me);
      const report = cleanReport(await body(req), s);
      if (sharing.get(me).mode === 'off') {
        store.forget(me);
        return { ok: true, stored: false };
      }
      store.replace(me, report);
      return { ok: true, stored: true, content: report.content.length, servers: report.servers.length };
    }],
    // what the friends who share with me use: counts and their nicks, at most the admin's number per kind
    ['GET', /^\/v1\/friends\/popular$/, (req, _params, url) => {
      const me = authed(req);
      const s = settings();
      if (!s.enabled) return { enabled: false, content: [], servers: [] };
      limitList(me);
      const loader = url.searchParams.get('loader') ?? '';
      if (!LOADER.test(loader)) fail(400, 'bad_request');
      const key = `${me}|${loader}`;
      const kept = cache.get(key);
      if (kept && Date.now() - kept.at < s.cacheSeconds * 1000) return kept.answer;
      const answer = count(me, loader);
      if (cache.size > 5000) cache.clear();
      cache.set(key, { at: Date.now(), answer });
      return answer;
    }],
  ];
  return {
    routes, store, sharing,
    prune: (now = Date.now()) => store.prune(now - settings().keepDays * 86_400_000),
    clearCache: () => cache.clear(),
  };
}
