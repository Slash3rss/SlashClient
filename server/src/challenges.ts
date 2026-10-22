import { createHash } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { ICONS, SPRAY_COUNT_GAP_MS, DAY_MIN_SECONDS, serverRule } from './achievements.ts';
import { inTransaction, type Wallet } from './economy.ts';
import type { SettingDef, SettingValue } from './settings.ts';

/**
 * Daily and weekly challenges ("Wyzwania", server 0.9.36+): every day at 00:00 Europe/Warsaw each
 * player gets K challenges, every Monday M weekly ones, picked from the pool the admin keeps in the
 * panel (enabled ones, by weight, at most one per thing counted) deterministically from the account
 * and the period, so every device shows the same set and two players usually get different ones.
 * The set is written down the first time it is needed (the player looks, or does something that
 * counts) together with its targets and rewards, so changes in the panel apply from the next period.
 *
 * Progress counts only from the period's start: everything is counted per period (rows keyed by the
 * day or the week), from what this server sees itself, like the achievements (achievements.ts):
 * play time from the same ticks (a launcher connected, the game in a world), the servers played on
 * for two ticks in a row, messages only as the achievements count them (to friends and real groups,
 * a few a day: chatLimits.ts), screenshots, sprays (one in 30 seconds), waypoints, parties and votes
 * from requests that succeeded. Completing one pays its sparks once (the ledger has one row per
 * player and challenge and period, `reason = 'challenge'`); all of a period's done pays a bonus once.
 */

export type Period = 'daily' | 'weekly';
export const PERIODS: Period[] = ['daily', 'weekly'];

/** What a challenge counts. Minutes are kept as seconds. */
export type Metric = 'play_minutes' | 'play_days' | 'launcher_days' | 'servers' | 'server_minutes' | 'party_minutes'
  | 'messages' | 'media' | 'sprays' | 'waypoints' | 'parties' | 'votes';

export const METRICS: Record<Metric, { name: string; nameEn: string; max: number; icon: string; periods?: Period[]; server?: true; seconds?: true }> = {
  play_minutes: { name: 'Minuty gry (w świecie, launcher połączony)', nameEn: 'Minutes played (in a world, launcher connected)', max: 6000, icon: 'fa-clock', seconds: true },
  play_days: { name: 'Dni z co najmniej 10 min gry', nameEn: 'Days with 10+ minutes played', max: 7, icon: 'fa-calendar-check', periods: ['weekly'] },
  launcher_days: { name: 'Dni z włączonym launcherem (zalogowanym)', nameEn: 'Days with the launcher signed in', max: 7, icon: 'fa-rocket', periods: ['weekly'] },
  servers: { name: 'Różne serwery (po 2 min)', nameEn: 'Different servers (2+ min each)', max: 50, icon: 'fa-server' },
  server_minutes: { name: 'Minuty gry na serwerze (z subdomenami)', nameEn: 'Minutes played on a server (with subdomains)', max: 6000, icon: 'fa-cloud-sun', server: true, seconds: true },
  party_minutes: { name: 'Minuty gry ze znajomym z drużyny (ten sam serwer)', nameEn: 'Minutes played with a party friend (same server)', max: 6000, icon: 'fa-handshake', seconds: true },
  messages: { name: 'Wiadomości (jak w osiągnięciach: limit dzienny)', nameEn: 'Messages (as for achievements: a daily cap)', max: 500, icon: 'fa-comment' },
  media: { name: 'Zrzuty i klipy udostępnione linkiem', nameEn: 'Screenshots and clips shared', max: 50, icon: 'fa-camera' },
  sprays: { name: 'Spraye (najwyżej 1 na 30 s)', nameEn: 'Sprays (at most 1 per 30 s)', max: 500, icon: 'fa-spray-can' },
  waypoints: { name: 'Punkty wysłane znajomym', nameEn: 'Waypoints sent to friends', max: 50, icon: 'fa-location-dot' },
  parties: { name: 'Drużyny założone lub przyjęte', nameEn: 'Parties started or joined', max: 20, icon: 'fa-bullhorn' },
  votes: { name: 'Głosy na serwery (z launchera)', nameEn: 'Server votes (from the launcher)', max: 20, icon: 'fa-check-to-slot' },
};

export interface Challenge {
  id: string;
  period: Period;
  metric: Metric;
  /** What the metric must reach within the period (minutes for the minute ones). */
  target: number;
  sparks: number;
  /** How often it is picked compared with the others of its period (1–100). */
  weight: number;
  enabled: boolean;
  /** Texts: "{n}" is the target, "{server}" the server. */
  name: string;
  nameEn: string;
  icon?: string;
  /** For `server_minutes`: the server (as `serverRule` keeps it); its subdomains count too. */
  server?: string;
  custom?: boolean;
}

type Def = Omit<Challenge, 'enabled' | 'weight'> & { enabled?: boolean; weight?: number };
const d = (id: string, metric: Metric, target: number, sparks: number, name: string, nameEn: string, more: Partial<Def> = {}): Def =>
  ({ id, period: 'daily', metric, target, sparks, name, nameEn, ...more });
const w = (id: string, metric: Metric, target: number, sparks: number, name: string, nameEn: string, more: Partial<Def> = {}): Def =>
  ({ id, period: 'weekly', metric, target, sparks, name, nameEn, ...more });

/** The pool the server starts with (the admin changes it in the panel, kept apart: "back to default" is a delete). */
const DEFAULTS: Def[] = [
  d('d_play_30', 'play_minutes', 30, 15, 'Graj {n} min', 'Play for {n} min', { weight: 3 }),
  d('d_play_60', 'play_minutes', 60, 25, 'Graj {n} min', 'Play for {n} min', { weight: 2 }),
  d('d_play_120', 'play_minutes', 120, 40, 'Maraton: graj {n} min', 'Marathon: play for {n} min'),
  d('d_servers_2', 'servers', 2, 15, 'Zagraj na {n} różnych serwerach', 'Play on {n} different servers'),
  d('d_skyup_30', 'server_minutes', 30, 25, 'Graj {n} min na {server}', 'Play for {n} min on {server}', { server: 'skyup.pl', icon: 'fa-cloud-sun' }),
  d('d_party_20', 'party_minutes', 20, 25, 'Graj {n} min ze znajomym w drużynie', 'Play for {n} min with a friend in a party'),
  d('d_party_1', 'parties', 1, 10, 'Załóż drużynę albo dołącz do niej', 'Start or join a party'),
  d('d_messages_5', 'messages', 5, 10, 'Wyślij {n} wiadomości znajomym', 'Send {n} messages to friends'),
  d('d_media_1', 'media', 1, 15, 'Udostępnij zrzut ekranu lub klip', 'Share a screenshot or a clip'),
  d('d_sprays_3', 'sprays', 3, 10, 'Namaluj {n} spraye', 'Paint {n} sprays'),
  d('d_waypoint_1', 'waypoints', 1, 10, 'Wyślij znajomemu punkt nawigacyjny', 'Send a friend a waypoint'),
  d('d_vote_1', 'votes', 1, 15, 'Zagłosuj na serwer w launcherze', 'Vote for a server in the launcher'),
  w('w_play_300', 'play_minutes', 300, 100, 'Graj {n} min w tym tygodniu', 'Play for {n} min this week', { weight: 2 }),
  w('w_days_4', 'play_days', 4, 80, 'Graj co najmniej 10 min w {n} różnych dniach', 'Play at least 10 min on {n} different days', { weight: 2 }),
  w('w_launcher_5', 'launcher_days', 5, 50, 'Włącz launcher w {n} różnych dniach', 'Open the launcher on {n} different days'),
  w('w_servers_5', 'servers', 5, 60, 'Zagraj na {n} różnych serwerach', 'Play on {n} different servers'),
  w('w_skyup_180', 'server_minutes', 180, 100, 'Graj {n} min na {server}', 'Play for {n} min on {server}', { server: 'skyup.pl', icon: 'fa-cloud-sun' }),
  w('w_party_120', 'party_minutes', 120, 100, 'Graj {n} min ze znajomymi w drużynie', 'Play for {n} min with friends in a party'),
  w('w_messages_50', 'messages', 50, 50, 'Wyślij {n} wiadomości', 'Send {n} messages'),
  w('w_media_5', 'media', 5, 60, 'Udostępnij {n} zrzutów lub klipów', 'Share {n} screenshots or clips'),
  w('w_sprays_15', 'sprays', 15, 40, 'Namaluj {n} sprayów', 'Paint {n} sprays'),
  w('w_votes_3', 'votes', 3, 60, 'Zagłosuj na serwery {n} razy', 'Vote for servers {n} times'),
];
export const DEFAULT_CHALLENGES: Challenge[] = DEFAULTS.map((c) => ({ weight: 1, enabled: true, ...c }));

/** The settings of the challenges (the admin panel: "Osiągnięcia i Iskry" and the challenges' page). */
export const CHALLENGE_SETTING_DEFS: SettingDef[] = [
  { key: 'challenges.enabled', category: 'sparks', label: 'Wyzwania włączone', labelEn: 'Challenges on', description: 'Codzienne i tygodniowe wyzwania za Iskry. Wyłączone: nikt nie dostaje nowych, nic się nie liczy.', type: 'bool', default: true },
  { key: 'challenges.daily', category: 'sparks', label: 'Wyzwań dziennie', labelEn: 'Challenges a day', description: 'Ile wyzwań dostaje gracz każdego dnia (od północy czasu polskiego). Zmiana działa od następnego dnia.', type: 'int', default: 3, min: 0, max: 10 },
  { key: 'challenges.weekly', category: 'sparks', label: 'Wyzwań tygodniowo', labelEn: 'Challenges a week', description: 'Ile wyzwań dostaje gracz w poniedziałek (na cały tydzień). Zmiana działa od następnego tygodnia.', type: 'int', default: 3, min: 0, max: 10 },
  { key: 'challenges.dailyBonus', category: 'sparks', label: 'Premia za wszystkie wyzwania dnia', labelEn: 'Bonus for all of a day', description: 'Iskry za ukończenie wszystkich wyzwań danego dnia (0: bez premii).', type: 'int', default: 30, min: 0, max: 10_000 },
  { key: 'challenges.weeklyBonus', category: 'sparks', label: 'Premia za wszystkie wyzwania tygodnia', labelEn: 'Bonus for all of a week', description: 'Iskry za ukończenie wszystkich wyzwań tygodnia (0: bez premii).', type: 'int', default: 100, min: 0, max: 10_000 },
];

export const MAX_CHALLENGE_SPARKS = 10_000;
export const CHALLENGE_SLUG = /^[a-z][a-z0-9_]{2,39}$/;
/** How long the counts of past periods are kept (what was assigned and done is kept longer, for the panel's numbers). */
const KEEP_PROGRESS_DAYS = 21;
const KEEP_ASSIGNED_DAYS = 400;

// ---------- time: days and weeks in Poland ----------

export const TIME_ZONE = 'Europe/Warsaw';
const DAY_MS = 86_400_000;
const wallFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The wall clock in Warsaw at a moment, as if it were UTC (ms). */
function wall(at: number): number {
  const p: Record<string, number> = {};
  for (const part of wallFormat.formatToParts(at)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** The day in Warsaw at a moment, YYYY-MM-DD. */
export const localDay = (at: number) => new Date(wall(at)).toISOString().slice(0, 10);
/** A day plus `n` days (calendar days, no time zone involved). */
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** The moment a Warsaw day starts (midnight is never skipped nor repeated there: the clocks change at 2–3 a.m.). */
export function dayStart(day: string): number {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  let at = midnight - 3_600_000;
  for (let i = 0; i < 3; i++) at += midnight - wall(at);
  return at;
}
/** The Monday of a day's week. */
export const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

/** A period's key ('d:2026-10-22', 'w:2026-10-19': the Monday), its start and its end. */
export function periodOf(kind: Period, at: number): { key: string; day: string; start: number; end: number } {
  const today = localDay(at);
  const day = kind === 'daily' ? today : mondayOf(today);
  return { key: `${kind === 'daily' ? 'd' : 'w'}:${day}`, day, start: dayStart(day), end: dayStart(addDays(day, kind === 'daily' ? 1 : 7)) };
}

// ---------- the picks ----------

/** A number in (0, 1) from the player, the period and the challenge: the same everywhere, every time. */
function unit(uuid: string, period: string, id: string): number {
  const h = createHash('sha256').update(`${uuid}\n${period}\n${id}`).digest();
  return (h.readUIntBE(0, 6) + 1) / (2 ** 48 + 2);
}

/** The progress counter a challenge reads ("server_minutes:skyup.pl" for one of a server). */
export const counterOf = (c: Pick<Challenge, 'metric' | 'server'>) => (c.metric === 'server_minutes' ? `server_minutes:${c.server ?? ''}` : c.metric);

/**
 * `count` challenges of the pool for a player and a period: weighted random without repeats
 * (exponential keys), seeded by the account and the period, never two counting the same thing.
 */
export function pick(pool: Challenge[], uuid: string, period: string, count: number): Challenge[] {
  const keyed = pool.filter((c) => c.weight > 0).map((c) => ({ c, k: -Math.log(unit(uuid, period, c.id)) / c.weight }))
    .sort((a, b) => a.k - b.k || (a.c.id < b.c.id ? -1 : 1));
  const out: Challenge[] = [];
  const counters = new Set<string>();
  for (const { c } of keyed) {
    if (out.length >= count) break;
    if (counters.has(counterOf(c))) continue;
    counters.add(counterOf(c));
    out.push(c);
  }
  return out;
}

/** A challenge's text with its numbers. */
export const render = (text: string, c: Pick<Challenge, 'target' | 'server'>) => text.replaceAll('{n}', String(c.target)).replaceAll('{server}', c.server ?? '');

/** Whether a server key (achievements.ts `serverKey`) is a rule's server or one of its subdomains. */
export function onServer(key: string, rule: string): boolean {
  const host = rule.includes(':') ? key : key.replace(/:\d+$/, '');
  return host === rule || host.endsWith(`.${rule}`);
}

const parse = <T>(json: string): T | undefined => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
};

// ---------- the pool ----------

export const EDIT_KEYS = ['period', 'metric', 'target', 'sparks', 'weight', 'enabled', 'name', 'nameEn', 'icon', 'server'] as const;

export class ChallengeRegistry {
  private readonly sql: DatabaseSync;
  private cache?: Challenge[];

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec('CREATE TABLE IF NOT EXISTS challenge_defs (id TEXT PRIMARY KEY, data TEXT NOT NULL, custom INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, by_uuid TEXT NOT NULL DEFAULT \'\')');
  }

  all(): Challenge[] {
    if (this.cache) return this.cache;
    const rows = this.sql.prepare('SELECT id, data, custom FROM challenge_defs ORDER BY updated_at, id').all() as { id: string; data: string; custom: number }[];
    const over = new Map(rows.filter((r) => !r.custom).map((r) => [r.id, parse<Partial<Challenge>>(r.data) ?? {}]));
    const list = DEFAULT_CHALLENGES.map((c) => {
      const o = over.get(c.id);
      if (!o) return c;
      const next = { ...c };
      for (const k of EDIT_KEYS) if (o[k] !== undefined) (next as Record<string, unknown>)[k] = o[k];
      if (!next.icon) delete next.icon;
      return next;
    });
    for (const r of rows.filter((x) => x.custom)) {
      const c = parse<Challenge>(r.data);
      if (c) list.push({ ...c, id: r.id, custom: true });
    }
    return (this.cache = list);
  }

  get(id: string) {
    return this.all().find((c) => c.id === id);
  }

  overridden(): Set<string> {
    return new Set((this.sql.prepare('SELECT id FROM challenge_defs WHERE custom = 0').all() as { id: string }[]).map((r) => r.id));
  }

  /** Saves a challenge: for a built-in one only what differs from the default, a custom one whole. */
  save(c: Challenge, by = '', at = Date.now()) {
    const builtIn = DEFAULT_CHALLENGES.find((x) => x.id === c.id);
    let data: Record<string, unknown>;
    if (builtIn) {
      data = {};
      for (const k of EDIT_KEYS) if ((c[k] ?? '') !== (builtIn[k] ?? '')) data[k] = c[k] ?? '';
      if (!Object.keys(data).length) return this.remove(c.id);
    } else {
      const { custom: _custom, id: _id, ...rest } = c;
      data = rest;
    }
    this.sql.prepare('INSERT INTO challenge_defs (id, data, custom, updated_at, by_uuid) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, by_uuid = excluded.by_uuid')
      .run(c.id, JSON.stringify(data), builtIn ? 0 : 1, at, by);
    this.cache = undefined;
  }

  /** A built-in one back to the default, a custom one gone. */
  remove(id: string) {
    this.sql.prepare('DELETE FROM challenge_defs WHERE id = ?').run(id);
    this.cache = undefined;
  }
}

// ---------- the counts ----------

interface Assigned { id: string; data: string; at: number; done_at: number | null }

export class ChallengeStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS challenge_progress (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, period TEXT NOT NULL, counter TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uuid, period, counter));
CREATE TABLE IF NOT EXISTS challenge_keys (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, period TEXT NOT NULL, counter TEXT NOT NULL, key TEXT NOT NULL, PRIMARY KEY (uuid, period, counter, key));
CREATE TABLE IF NOT EXISTS challenge_assigned (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, period TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL, done_at INTEGER, PRIMARY KEY (uuid, period, id));
CREATE INDEX IF NOT EXISTS challenge_assigned_period ON challenge_assigned(period);
CREATE TABLE IF NOT EXISTS challenge_bonus (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, period TEXT NOT NULL, sparks INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uuid, period));
CREATE UNIQUE INDEX IF NOT EXISTS sparks_ledger_challenge ON sparks_ledger(uuid, ref) WHERE reason = 'challenge';
`);
  }

  add(uuid: string, period: string, counter: string, n: number): { before: number; after: number } {
    const before = this.get(uuid, period, counter);
    this.sql.prepare('INSERT INTO challenge_progress (uuid, period, counter, n) VALUES (?, ?, ?, ?) ON CONFLICT (uuid, period, counter) DO UPDATE SET n = n + excluded.n').run(uuid, period, counter, n);
    return { before, after: before + n };
  }

  /** Counts `key` once per period (a server, a day). */
  addOnce(uuid: string, period: string, counter: string, key: string): boolean {
    if (!this.sql.prepare('INSERT OR IGNORE INTO challenge_keys (uuid, period, counter, key) VALUES (?, ?, ?, ?)').run(uuid, period, counter, key).changes) return false;
    this.add(uuid, period, counter, 1);
    return true;
  }

  get(uuid: string, period: string, counter: string): number {
    return (this.sql.prepare('SELECT n FROM challenge_progress WHERE uuid = ? AND period = ? AND counter = ?').get(uuid, period, counter) as { n: number } | undefined)?.n ?? 0;
  }

  assigned(uuid: string, period: string): Assigned[] {
    return this.sql.prepare('SELECT id, data, at, done_at FROM challenge_assigned WHERE uuid = ? AND period = ? ORDER BY rowid').all(uuid, period) as unknown as Assigned[];
  }

  assign(uuid: string, period: string, list: Challenge[], at: number) {
    const ins = this.sql.prepare('INSERT OR IGNORE INTO challenge_assigned (uuid, period, id, data, at) VALUES (?, ?, ?, ?, ?)');
    for (const c of list) ins.run(uuid, period, c.id, JSON.stringify(c), at);
  }

  /** Marks one done; false when it was already. */
  finish(uuid: string, period: string, id: string, at: number): boolean {
    return this.sql.prepare('UPDATE challenge_assigned SET done_at = ? WHERE uuid = ? AND period = ? AND id = ? AND done_at IS NULL').run(at, uuid, period, id).changes > 0;
  }

  bonus(uuid: string, period: string): { sparks: number; at: number } | undefined {
    return this.sql.prepare('SELECT sparks, at FROM challenge_bonus WHERE uuid = ? AND period = ?').get(uuid, period) as { sparks: number; at: number } | undefined;
  }

  addBonus(uuid: string, period: string, sparks: number, at: number): boolean {
    return this.sql.prepare('INSERT OR IGNORE INTO challenge_bonus (uuid, period, sparks, at) VALUES (?, ?, ?, ?)').run(uuid, period, sparks, at).changes > 0;
  }

  /** Drops the counts of old periods (and what was assigned long ago). */
  prune(today: string) {
    const counts = addDays(today, -KEEP_PROGRESS_DAYS);
    const assigned = addDays(today, -KEEP_ASSIGNED_DAYS);
    this.sql.prepare('DELETE FROM challenge_progress WHERE substr(period, 3) < ?').run(counts);
    this.sql.prepare('DELETE FROM challenge_keys WHERE substr(period, 3) < ?').run(counts);
    this.sql.prepare('DELETE FROM challenge_assigned WHERE substr(period, 3) < ?').run(assigned);
    this.sql.prepare('DELETE FROM challenge_bonus WHERE substr(period, 3) < ?').run(assigned);
  }

  /** For the panel: per challenge, how many got it and finished it in the given periods (or since a day). */
  counts(where: string, ...args: string[]): Record<string, { assigned: number; done: number }> {
    const rows = this.sql.prepare(`SELECT id, COUNT(*) AS assigned, COUNT(done_at) AS done FROM challenge_assigned WHERE ${where} GROUP BY id`).all(...args) as { id: string; assigned: number; done: number }[];
    return Object.fromEntries(rows.map((r) => [r.id, { assigned: r.assigned, done: r.done }]));
  }

  periodTotals(period: string): { players: number; allDone: number } {
    const players = (this.sql.prepare('SELECT COUNT(DISTINCT uuid) AS n FROM challenge_assigned WHERE period = ?').get(period) as { n: number }).n;
    const allDone = (this.sql.prepare('SELECT COUNT(*) AS n FROM challenge_bonus WHERE period = ?').get(period) as { n: number }).n;
    return { players, allDone };
  }

  recent(limit = 30): { uuid: string; handle: string; name: string; period: string; id: string; data: string; at: number }[] {
    return this.sql.prepare('SELECT a.uuid, u.handle, u.name, a.period, a.id, a.data, a.done_at AS at FROM challenge_assigned a JOIN users u ON u.uuid = a.uuid WHERE a.done_at IS NOT NULL ORDER BY a.done_at DESC LIMIT ?').all(limit) as never;
  }
}

// ---------- the feature ----------

/** One tick's play of a player (achievements.ts `tick`): the time credited, and where. */
export interface PlayCredit {
  seconds: number;
  /** The server key now (undefined: singleplayer or LAN). */
  server?: string;
  /** Whether the player was on this server at the tick before too (the time was there). */
  stayed: boolean;
  /** Ticks in a row on this server. */
  ticks: number;
}

interface Deps {
  sql: DatabaseSync;
  wallet: Wallet;
  push: (userId: string, event: unknown) => void;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fail: (status: number, code: string) => never;
  setting: (key: string) => SettingValue;
  audit?: (who: string, action: string, target: string, detail: string) => void;
  /** The friends in the player's party (accepted, the party alive), for the minutes played together. */
  partyMates?: (uuid: string) => string[];
  /** Whether a metric can be done on this server now (voting needs the server list set up). */
  available?: (metric: Metric) => boolean;
}

/** Requests that count once they succeed. */
const EVENTS: [string, RegExp, Metric][] = [
  ['POST', /^\/v1\/media$/, 'media'],
  ['POST', /^\/v1\/parties$/, 'parties'],
  ['POST', /^\/v1\/parties\/[\w-]+\/accept$/, 'parties'],
  ['POST', /^\/v1\/mc\/spray$/, 'sprays'],
  ['POST', /^\/v1\/waypoints$/, 'waypoints'],
  ['POST', /^\/v1\/servers\/[\w.:-]{1,100}\/vote$/, 'votes'],
];

/** Servers count after this many ticks in a row there (as for the achievements). */
const SERVER_MIN_TICKS = 2;

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function createChallenges(deps: Deps) {
  const { sql, wallet } = deps;
  const store = new ChallengeStore(sql);
  const registry = new ChallengeRegistry(sql);
  const lastSpray = new Map<string, number>();
  /** The last Warsaw day each account was seen with a launcher, so a day is written once. */
  const launcherDay = new Map<string, string>();
  let prunedOn = '';

  const on = () => deps.setting('challenges.enabled') !== false;
  const countOf = (kind: Period) => Math.max(0, Number(deps.setting(kind === 'daily' ? 'challenges.daily' : 'challenges.weekly')) || 0);
  const bonusOf = (kind: Period) => Math.max(0, Number(deps.setting(kind === 'daily' ? 'challenges.dailyBonus' : 'challenges.weeklyBonus')) || 0);
  const usable = (c: Challenge) => c.enabled && (METRICS[c.metric]?.periods ?? PERIODS).includes(c.period) && (deps.available?.(c.metric) ?? true)
    && (c.metric !== 'server_minutes' || !!c.server);

  /** The player's challenges of the period now, assigned on the first call. */
  function setOf(uuid: string, kind: Period, now: number) {
    const p = periodOf(kind, now);
    let rows = store.assigned(uuid, p.key);
    if (!rows.length && on()) {
      const count = countOf(kind);
      if (count > 0) {
        store.assign(uuid, p.key, pick(registry.all().filter((c) => c.period === kind && usable(c)), uuid, p.key, count), now);
        rows = store.assigned(uuid, p.key);
      }
    }
    return { period: p, rows: rows.map((r) => ({ c: parse<Challenge>(r.data)!, at: r.at, doneAt: r.done_at })).filter((r) => r.c) };
  }

  function valueOf(uuid: string, period: string, c: Challenge): number {
    const n = store.get(uuid, period, counterOf(c));
    return METRICS[c.metric]?.seconds ? Math.floor(n / 60) : n;
  }

  /** A challenge as the launcher and the game get it: texts from the pool now, numbers from when it was assigned. */
  function view(uuid: string, period: string, c: Challenge, doneAt: number | null) {
    const now = registry.get(c.id) ?? c;
    const value = Math.min(c.target, valueOf(uuid, period, c));
    const icon = now.icon && ICONS.includes(now.icon) ? now.icon : METRICS[c.metric]?.icon ?? 'fa-list-check';
    return {
      id: c.id, period: c.period, metric: c.metric, icon, target: c.target, sparks: c.sparks,
      name: render(now.name, c), nameEn: render(now.nameEn || now.name, c), ...(c.server ? { server: c.server } : {}),
      value: doneAt ? c.target : value, progress: doneAt ? 1 : Math.min(1, value / c.target), completedAt: doneAt,
    };
  }

  /** Pays what the player has reached in the periods now; pushes the events. */
  function check(uuid: string, now = Date.now()) {
    if (!on()) return [];
    const fresh: ReturnType<typeof view>[] = [];
    for (const kind of PERIODS) {
      const { period, rows } = setOf(uuid, kind, now);
      if (!rows.length) continue;
      for (const r of rows) {
        if (r.doneAt || valueOf(uuid, period.key, r.c) < r.c.target) continue;
        const name = render(r.c.name, r.c);
        const paid = inTransaction(sql, () => {
          if (!store.finish(uuid, period.key, r.c.id, now)) return false;
          if (r.c.sparks > 0) wallet.change(uuid, r.c.sparks, 'challenge', `${period.key}:${r.c.id}`, `Wyzwanie: ${name}`, '', now);
          return true;
        });
        if (!paid) continue;
        r.doneAt = now;
        const v = view(uuid, period.key, r.c, now);
        fresh.push(v);
        deps.push(uuid, { type: 'challenge', challenge: v });
      }
      // all of the period's done: the bonus, once
      const bonus = bonusOf(kind);
      if (rows.every((r) => r.doneAt) && !store.bonus(uuid, period.key)) {
        const paid = inTransaction(sql, () => {
          if (!store.addBonus(uuid, period.key, bonus, now)) return false;
          if (bonus > 0) wallet.change(uuid, bonus, 'challenge', `${period.key}:*`, kind === 'daily' ? 'Wszystkie wyzwania dnia' : 'Wszystkie wyzwania tygodnia', '', now);
          return true;
        });
        if (paid && bonus > 0) deps.push(uuid, { type: 'challenges-bonus', period: kind, sparks: bonus });
      }
    }
    if (fresh.length) deps.push(uuid, { type: 'wallet', balance: wallet.balance(uuid), change: fresh.reduce((n, v) => n + v.sparks, 0), reason: 'challenge', ref: '' });
    return fresh;
  }

  const keys = (now: number) => PERIODS.map((k) => periodOf(k, now).key);

  /** Adds to a counter in today's and this week's periods. */
  function add(uuid: string, counter: string, n: number, now: number) {
    for (const key of keys(now)) store.add(uuid, key, counter, n);
  }

  /** Once per tick (achievements.ts): the play time of everyone in a game. */
  function played(credits: Map<string, PlayCredit>, now = Date.now()) {
    if (!on()) return;
    const today = localDay(now);
    if (prunedOn !== today) {
      prunedOn = today;
      store.prune(today);
    }
    const [daily, weekly] = keys(now);
    const rules = [...new Set(registry.all().filter((c) => c.enabled && c.metric === 'server_minutes' && c.server).map((c) => c.server!))];
    for (const [uuid, p] of credits) {
      if (p.seconds > 0) {
        const { before, after } = store.add(uuid, daily, 'play_minutes', p.seconds);
        store.add(uuid, weekly, 'play_minutes', p.seconds);
        // a day of the week with its 10 minutes
        if (before < DAY_MIN_SECONDS && after >= DAY_MIN_SECONDS) store.addOnce(uuid, weekly, 'play_days', today);
        if (p.server && p.stayed) {
          for (const rule of rules) if (onServer(p.server, rule)) add(uuid, `server_minutes:${rule}`, p.seconds, now);
          // a friend from the party on the same server, the tick before too
          const mates = deps.partyMates?.(uuid) ?? [];
          if (mates.some((m) => { const o = credits.get(m); return o && o.server === p.server && o.stayed; })) add(uuid, 'party_minutes', p.seconds, now);
        }
      }
      if (p.server && p.ticks >= SERVER_MIN_TICKS) for (const key of keys(now)) store.addOnce(uuid, key, 'servers', p.server);
      check(uuid, now);
    }
  }

  /** A launcher signed in and connected (on connecting, and every tick for those connected). */
  function online(uuid: string, now = Date.now()) {
    if (!on()) return;
    const today = localDay(now);
    if (launcherDay.get(uuid) === today) return;
    launcherDay.set(uuid, today);
    if (launcherDay.size > 50_000) launcherDay.clear();
    store.addOnce(uuid, periodOf('weekly', now).key, 'launcher_days', today);
    check(uuid, now);
  }

  /** A message that counted (chatLimits.ts `MessageCounter`: the daily cap is applied there). */
  function message(uuid: string, now = Date.now()) {
    if (!on()) return;
    add(uuid, 'messages', 1, now);
    check(uuid, now);
  }

  /** After a request succeeded (app.ts). */
  function after(method: string, path: string, uuid: string | undefined, now = Date.now()) {
    if (!uuid || !on()) return;
    const hit = EVENTS.find(([m, re]) => m === method && re.test(path));
    if (!hit) return;
    if (hit[2] === 'sprays') {
      if (now - (lastSpray.get(uuid) ?? 0) < SPRAY_COUNT_GAP_MS) return;
      lastSpray.set(uuid, now);
    }
    add(uuid, hit[2], 1, now);
    check(uuid, now);
  }

  /** What the player sees: today's and this week's challenges, with when they reset. */
  function list(uuid: string, now = Date.now()) {
    if (!on()) return { enabled: false };
    check(uuid, now);
    const part = (kind: Period) => {
      const { period, rows } = setOf(uuid, kind, now);
      const bonus = store.bonus(uuid, period.key);
      return {
        key: period.key, startsAt: period.start, endsAt: period.end,
        bonus: bonus ? bonus.sparks : rows.length ? bonusOf(kind) : 0, bonusAt: bonus?.at ?? null,
        challenges: rows.map((r) => view(uuid, period.key, r.c, r.doneAt)),
      };
    };
    return { enabled: true, timeZone: TIME_ZONE, now, daily: part('daily'), weekly: part('weekly') };
  }

  // ---------- the admin panel ----------

  const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/[\u0000-\u001f]/g, ' ') : undefined);

  /** What the panel sent over what the challenge is now; throws the first thing wrong. */
  function validate(input: Record<string, unknown>, base: Challenge): Challenge {
    const fail = (code: string): never => deps.fail(400, code);
    const next: Challenge = { ...base };
    for (const key of ['name', 'nameEn'] as const) {
      if (input[key] === undefined) continue;
      const v = clean(input[key]);
      if (v === undefined || v.length > 80 || (key === 'name' && !v)) fail(`bad_${key}`);
      next[key] = v!;
    }
    if (input.period !== undefined) {
      if (!PERIODS.includes(input.period as Period)) fail('bad_period');
      next.period = input.period as Period;
    }
    if (input.metric !== undefined) {
      if (!Object.hasOwn(METRICS, input.metric as string)) fail('bad_metric');
      next.metric = input.metric as Metric;
    }
    const int = (key: 'target' | 'sparks' | 'weight', min: number, max: number) => {
      if (input[key] === undefined) return;
      const n = input[key];
      if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > max) fail(`bad_${key}`);
      next[key] = n as number;
    };
    int('target', 1, METRICS[next.metric].max);
    int('sparks', 0, MAX_CHALLENGE_SPARKS);
    int('weight', 0, 100);
    if (input.enabled !== undefined) {
      if (typeof input.enabled !== 'boolean') fail('bad_enabled');
      next.enabled = input.enabled as boolean;
    }
    if (input.icon !== undefined) {
      if (input.icon !== '' && !ICONS.includes(input.icon as string)) fail('bad_icon');
      next.icon = (input.icon as string) || undefined;
    }
    if (input.server !== undefined) next.server = input.server === '' ? undefined : serverRule(input.server) ?? fail('bad_server');
    if (METRICS[next.metric].server) {
      if (!next.server) fail('bad_server');
    } else delete next.server;
    if (!(METRICS[next.metric].periods ?? PERIODS).includes(next.period)) fail('bad_period');
    if (next.target > METRICS[next.metric].max) fail('bad_target');
    if (!next.name) fail('bad_name');
    return next;
  }

  function adminView() {
    const now = Date.now();
    const daily = periodOf('daily', now).key;
    const weekly = periodOf('weekly', now).key;
    const today = localDay(now);
    const over = registry.overridden();
    const todayCounts = store.counts('period = ?', daily);
    const weekCounts = store.counts('period = ?', weekly);
    const monthCounts = store.counts('substr(period, 3) >= ?', addDays(today, -30));
    const sparksSince = (since: number) => Number((sql.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM sparks_ledger WHERE reason = 'challenge' AND at >= ?").get(since) as { n: number }).n);
    const zero = { assigned: 0, done: 0 };
    return {
      challenges: registry.all().map((c) => ({
        ...c, custom: !!c.custom, overridden: over.has(c.id), usable: usable({ ...c, enabled: true }),
        preview: render(c.name, c), previewEn: render(c.nameEn || c.name, c),
        stats: { today: todayCounts[c.id] ?? zero, week: weekCounts[c.id] ?? zero, month: monthCounts[c.id] ?? zero },
      })),
      metrics: Object.entries(METRICS).map(([id, m]) => ({ id, ...m, periods: m.periods ?? PERIODS, available: deps.available?.(id as Metric) ?? true })),
      icons: ICONS,
      settings: {
        enabled: on(), daily: countOf('daily'), weekly: countOf('weekly'), dailyBonus: bonusOf('daily'), weeklyBonus: bonusOf('weekly'),
      },
      periods: {
        daily: { key: daily, endsAt: periodOf('daily', now).end, ...store.periodTotals(daily) },
        weekly: { key: weekly, endsAt: periodOf('weekly', now).end, ...store.periodTotals(weekly) },
      },
      sparks: { day: sparksSince(periodOf('daily', now).start), week: sparksSince(periodOf('weekly', now).start), month: sparksSince(now - 30 * DAY_MS) },
      recent: store.recent(30).map((r) => {
        const c = parse<Challenge>(r.data);
        return { uuid: r.uuid, handle: r.handle, name: r.name, period: r.period, id: r.id, text: c ? render(c.name, c) : r.id, sparks: c?.sparks ?? 0, at: r.at };
      }),
    };
  }

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/challenges$/, (req) => list(deps.authed(req))],
    ['GET', /^\/v1\/admin\/challenges$/, (req) => {
      deps.admin(req);
      return adminView();
    }],
    // a challenge saved: a built-in one (only what differs is kept) or a new one made here
    ['POST', /^\/v1\/admin\/challenges\/([\w-]{1,40})$/, async (req, [id]) => {
      const me = deps.admin(req);
      const input = await deps.body(req);
      const was = registry.get(id);
      if (!was && !CHALLENGE_SLUG.test(id)) deps.fail(400, 'bad_id');
      const base: Challenge = was ?? { id, period: 'daily', metric: 'play_minutes', target: 30, sparks: 15, weight: 1, enabled: true, name: '', nameEn: '', custom: true };
      const next = validate(input, base);
      registry.save(next, me);
      deps.audit?.(me, was ? 'challenge_edit' : 'challenge_create', id, `${render(next.name, next)} (${next.period}, ${next.sparks} Iskier${next.enabled ? '' : ', wyłączone'})`);
      return adminView();
    }],
    // a built-in one back to the default, a custom one deleted (who has it this period keeps it)
    ['DELETE', /^\/v1\/admin\/challenges\/([\w-]{1,40})$/, (req, [id]) => {
      const me = deps.admin(req);
      const was = registry.get(id);
      if (!was) deps.fail(404, 'not_found');
      registry.remove(id);
      deps.audit?.(me, was!.custom ? 'challenge_delete' : 'challenge_reset', id, render(was!.name, was!));
      return adminView();
    }],
  ];

  /** A ledger row's label ('d:2026-10-22:d_play_30', or ':*' for a bonus). */
  function label(ref: string, note: string): { label: string; labelEn: string } {
    const [kind, , id] = ref.split(':');
    if (id === '*') return kind === 'd' ? { label: 'Wszystkie wyzwania dnia', labelEn: 'All of the day\'s challenges' } : { label: 'Wszystkie wyzwania tygodnia', labelEn: 'All of the week\'s challenges' };
    const c = id ? registry.get(id) : undefined;
    const pl = note.replace(/^Wyzwanie: /, '');
    return { label: pl || id || ref, labelEn: c ? render(c.nameEn || c.name, c) : pl || id || ref };
  }

  return { routes, check, played, online, message, after, list, label, store, registry };
}
