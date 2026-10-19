import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { item, type Slot } from './cosmetics.ts';

/**
 * SlashClient achievements ("Osiągnięcia"): a daily play streak, hours played, the first friend and
 * message, and how many servers one has played on. Some of them give a cosmetic that can only be
 * earned (a cape); it is stored as a grant, like the ones the admin gives, so wearing it goes through
 * the usual checks (cosmetics.ts: items with `achievement` need the grant).
 *
 * Play time comes only from what the server sees itself, never from a number a client sends: every
 * minute (`tick`) each account whose launcher is connected (WebSocket answering pings), whose game
 * reported in the last minutes (/v1/mc/link, which the launcher sends every 4 minutes while the game
 * runs) and which is in a world (singleplayer or on a server, not the menu) gets the time since the
 * previous tick, at most two ticks' worth, and once per account however many launchers it has open.
 * A day counts for the streak with at least 10 minutes; at most 12 hours a day count at all.
 *
 * Days are UTC days (00:00 UTC, 1–2 a.m. in Poland): the same for every player and every server
 * restart, with no time zone a client could pick to stretch a day.
 */

export type Group = 'streak' | 'hours' | 'friends' | 'messages' | 'servers';

export interface Achievement {
  id: string;
  group: Group;
  /** What the group's number must reach: days, hours, friends, messages or servers. */
  goal: number;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  /** The cosmetic it unlocks (cosmetics.ts item with `achievement` set to this id). */
  reward?: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'streak_3', group: 'streak', goal: 3, name: 'Trzy dni z rzędu', nameEn: 'Three in a row', description: 'Graj co najmniej 10 minut dziennie przez 3 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 3 days in a row.' },
  { id: 'streak_7', group: 'streak', goal: 7, name: 'Tydzień z rzędu', nameEn: 'A week in a row', description: 'Graj co najmniej 10 minut dziennie przez 7 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 7 days in a row.' },
  { id: 'streak_30', group: 'streak', goal: 30, name: 'Seria 30 dni', nameEn: '30-day streak', description: 'Graj co najmniej 10 minut dziennie przez 30 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 30 days in a row.', reward: 'streak30' },
  { id: 'hours_10', group: 'hours', goal: 10, name: 'Rozgrzewka', nameEn: 'Warming up', description: 'Zagraj 10 godzin ze SlashClient.', descriptionEn: 'Play 10 hours with SlashClient.' },
  { id: 'hours_50', group: 'hours', goal: 50, name: 'Stały bywalec', nameEn: 'Regular', description: 'Zagraj 50 godzin ze SlashClient.', descriptionEn: 'Play 50 hours with SlashClient.' },
  { id: 'hours_100', group: 'hours', goal: 100, name: 'Weteran', nameEn: 'Veteran', description: 'Zagraj 100 godzin ze SlashClient.', descriptionEn: 'Play 100 hours with SlashClient.', reward: 'veteran' },
  { id: 'hours_500', group: 'hours', goal: 500, name: 'Legenda', nameEn: 'Legend', description: 'Zagraj 500 godzin ze SlashClient.', descriptionEn: 'Play 500 hours with SlashClient.' },
  { id: 'friend_1', group: 'friends', goal: 1, name: 'Pierwszy znajomy', nameEn: 'First friend', description: 'Dodaj pierwszego znajomego.', descriptionEn: 'Add your first friend.' },
  { id: 'friends_10', group: 'friends', goal: 10, name: 'Paczka znajomych', nameEn: 'The squad', description: 'Miej 10 znajomych.', descriptionEn: 'Have 10 friends.' },
  { id: 'message_1', group: 'messages', goal: 1, name: 'Pierwsza wiadomość', nameEn: 'First message', description: 'Napisz do znajomego.', descriptionEn: 'Send a message to a friend.' },
  { id: 'servers_5', group: 'servers', goal: 5, name: 'Podróżnik', nameEn: 'Traveller', description: 'Zagraj na 5 różnych serwerach.', descriptionEn: 'Play on 5 different servers.' },
  { id: 'servers_20', group: 'servers', goal: 20, name: 'Obieżyświat', nameEn: 'Globetrotter', description: 'Zagraj na 20 różnych serwerach.', descriptionEn: 'Play on 20 different servers.' },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export const TICK_MS = 60_000;
/** A tick late by more than this (the server was busy or asleep) credits only this much. */
const MAX_CREDIT_MS = 2 * TICK_MS;
/** Minutes a day must have to count for the streak. */
export const DAY_MIN_SECONDS = 10 * 60;
/** More than this a day is not counted (a game left running all night). */
export const DAY_CAP_SECONDS = 12 * 3600;
/** Counted for hours only after this long in one place, so a quick look at a server is not a visit. */
const SERVER_MIN_TICKS = 2;

/** The UTC day of a moment, as YYYY-MM-DD. */
export const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const prevDay = (day: string) => dayOf(Date.parse(`${day}T00:00:00Z`) - 86_400_000);

/**
 * The streak still going (ending today or yesterday: today may not have its 10 minutes yet) and the
 * longest one ever, from the days that count, in any order.
 */
export function streaks(days: string[], today: string): { current: number; best: number } {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let last = '';
  for (const d of sorted) {
    run = last && prevDay(d) === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = d;
  }
  const alive = last === today || last === prevDay(today);
  return { current: alive ? run : 0, best };
}

/** Addresses that are not a server one can "visit": this computer, a home network, a friend's LAN world through the relay. */
const LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i;
export function serverKey(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const a = address.trim().toLowerCase().replace(/\.$/, '').replace(/:25565$/, '');
  return a && !LOCAL.test(a) && /[a-z0-9]\.[a-z0-9]/.test(a) ? a.slice(0, 260) : undefined;
}

export interface Stats { totalSeconds: number; todaySeconds: number; streak: number; bestStreak: number; servers: number; friends: number; messages: number }

/** The tables (added on start, nothing else changes) and their queries. */
export class AchievementStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS play_days (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, day TEXT NOT NULL, seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uuid, day));
CREATE TABLE IF NOT EXISTS play_servers (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, server TEXT NOT NULL, first_at INTEGER NOT NULL, PRIMARY KEY (uuid, server));
CREATE TABLE IF NOT EXISTS achievements (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, id TEXT NOT NULL, unlocked_at INTEGER NOT NULL, PRIMARY KEY (uuid, id));
`);
  }

  /** Adds play time to a day, never past the day's cap. */
  addPlay(uuid: string, day: string, seconds: number) {
    const s = Math.max(0, Math.min(DAY_CAP_SECONDS, Math.round(seconds)));
    if (!s) return;
    this.sql.prepare(`INSERT INTO play_days (uuid, day, seconds) VALUES (?, ?, ?)
      ON CONFLICT (uuid, day) DO UPDATE SET seconds = MIN(${DAY_CAP_SECONDS}, seconds + excluded.seconds)`).run(uuid, day, s);
  }

  addServer(uuid: string, server: string, at: number) {
    this.sql.prepare('INSERT OR IGNORE INTO play_servers (uuid, server, first_at) VALUES (?, ?, ?)').run(uuid, server, at);
  }

  stats(uuid: string, now: number): Stats {
    const today = dayOf(now);
    const total = this.sql.prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM play_days WHERE uuid = ?').get(uuid) as { s: number };
    const todayRow = this.sql.prepare('SELECT seconds FROM play_days WHERE uuid = ? AND day = ?').get(uuid, today) as { seconds: number } | undefined;
    const days = (this.sql.prepare('SELECT day FROM play_days WHERE uuid = ? AND seconds >= ?').all(uuid, DAY_MIN_SECONDS) as { day: string }[]).map((r) => r.day);
    const { current, best } = streaks(days, today);
    const count = (q: string, ...args: string[]) => (this.sql.prepare(q).get(...args) as { n: number }).n;
    return {
      totalSeconds: total.s,
      todaySeconds: todayRow?.seconds ?? 0,
      streak: current,
      bestStreak: best,
      servers: count('SELECT COUNT(*) AS n FROM play_servers WHERE uuid = ?', uuid),
      friends: count('SELECT COUNT(*) AS n FROM friendships WHERE a = ? OR b = ?', uuid, uuid),
      // only "has written at all" and the like matter: no need to count a long chat history
      messages: count('SELECT COUNT(*) AS n FROM (SELECT 1 FROM messages WHERE from_uuid = ? LIMIT 100)', uuid),
    };
  }

  unlocked(uuid: string): Map<string, number> {
    return new Map((this.sql.prepare('SELECT id, unlocked_at FROM achievements WHERE uuid = ?').all(uuid) as { id: string; unlocked_at: number }[]).map((r) => [r.id, r.unlocked_at]));
  }

  /** Records an achievement and grants its cosmetic; false when it was there already. */
  unlock(uuid: string, a: Achievement, at: number): boolean {
    const added = this.sql.prepare('INSERT OR IGNORE INTO achievements (uuid, id, unlocked_at) VALUES (?, ?, ?)').run(uuid, a.id, at).changes > 0;
    if (a.reward) this.sql.prepare('INSERT OR IGNORE INTO cape_grants (uuid, cape) VALUES (?, ?)').run(uuid, a.reward);
    return added;
  }
}

/** How far a player is in an achievement's group. */
function value(a: Achievement, s: Stats): number {
  switch (a.group) {
    case 'streak': return s.bestStreak;
    case 'hours': return Math.floor(s.totalSeconds / 360) / 10;
    case 'friends': return s.friends;
    case 'messages': return s.messages;
    case 'servers': return s.servers;
  }
}

/** What an achievement's reward is, for the pages and the game. */
function rewardOf(a: Achievement): { id: string; slot: Slot; name: string } | undefined {
  const it = a.reward ? item(a.reward) : undefined;
  return it ? { id: it.id, slot: it.slot, name: it.name } : undefined;
}

/** One achievement as the launcher, the game and the website get it. */
export function view(a: Achievement, unlockedAt: number | undefined, s?: Stats) {
  const v = s ? value(a, s) : undefined;
  return {
    id: a.id, group: a.group, tier: ACHIEVEMENTS.filter((x) => x.group === a.group).indexOf(a) + 1, goal: a.goal,
    name: a.name, nameEn: a.nameEn, description: a.description, descriptionEn: a.descriptionEn,
    ...(v === undefined ? {} : { value: v, progress: Math.min(1, v / a.goal) }),
    unlockedAt: unlockedAt ?? null, reward: rewardOf(a),
  };
}

/** How to get a cosmetic that only an achievement gives (the cosmetics menus show it under the lock). */
export function hintFor(achievementId: string): { hint: string; hintEn: string } | undefined {
  const a = BY_ID.get(achievementId);
  return a && { hint: `Osiągnięcie „${a.name}”: ${a.description}`, hintEn: `Achievement "${a.nameEn}": ${a.descriptionEn}` };
}

interface Deps {
  sql: DatabaseSync;
  /** Who plays right now: account → the server address (undefined in singleplayer). */
  playing: (now: number) => Map<string, string | undefined>;
  /** Sends an event to the account's connected launchers (and from there to its game). */
  push: (userId: string, event: unknown) => void;
  authed: (req: http.IncomingMessage) => string;
  areFriends: (a: string, b: string) => boolean;
  fail: (status: number, code: string) => never;
}

export function createAchievements(deps: Deps) {
  const store = new AchievementStore(deps.sql);
  /** When each player was last credited, and where, for how many ticks in a row. */
  const last = new Map<string, { at: number; server?: string; ticks: number }>();

  /** Unlocks what the player has reached and tells their launchers; returns the new ones. */
  function check(userId: string, now = Date.now()) {
    const s = store.stats(userId, now);
    const have = store.unlocked(userId);
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (have.has(a.id) || value(a, s) < a.goal) continue;
      if (!store.unlock(userId, a, now)) continue;
      const v = view(a, now, s);
      fresh.push(v);
      deps.push(userId, { type: 'achievement', achievement: v });
    }
    return fresh;
  }

  /** Once a minute: play time for everyone in a game (see the top of this file). */
  function tick(now = Date.now()) {
    const playing = deps.playing(now);
    for (const id of last.keys()) if (!playing.has(id)) last.delete(id);
    for (const [userId, address] of playing) {
      const server = serverKey(address);
      const before = last.get(userId);
      const ticks = before && before.server === server ? before.ticks + 1 : 1;
      last.set(userId, { at: now, server, ticks });
      // the first tick only starts the clock: nothing is known about the time before it
      if (!before) continue;
      store.addPlay(userId, dayOf(now), Math.min(MAX_CREDIT_MS, Math.max(0, now - before.at)) / 1000);
      if (server && ticks >= SERVER_MIN_TICKS) store.addServer(userId, server, now);
      check(userId, now);
    }
  }

  function list(userId: string, now = Date.now()) {
    check(userId, now);
    const s = store.stats(userId, now);
    const have = store.unlocked(userId);
    return {
      achievements: ACHIEVEMENTS.map((a) => view(a, have.get(a.id), s)),
      stats: {
        hours: Math.floor(s.totalSeconds / 360) / 10, todayMinutes: Math.floor(s.todaySeconds / 60), streak: s.streak, bestStreak: s.bestStreak,
        servers: s.servers, friends: s.friends, messages: s.messages,
      },
      rules: { dayStartsAt: '00:00 UTC', minMinutesPerDay: DAY_MIN_SECONDS / 60, maxHoursPerDay: DAY_CAP_SECONDS / 3600 },
    };
  }

  const routes: [string, RegExp, (req: http.IncomingMessage, params: string[]) => unknown][] = [
    ['GET', /^\/v1\/achievements$/, (req) => list(deps.authed(req))],
    // a friend's unlocked achievements (without their hours and the rest)
    ['GET', /^\/v1\/achievements\/([\w-]{1,64})$/, (req, [other]) => {
      const me = deps.authed(req);
      if (other !== me && !deps.areFriends(me, other)) deps.fail(403, 'not_friends');
      const have = store.unlocked(other);
      return { achievements: ACHIEVEMENTS.map((a) => view(a, have.get(a.id))) };
    }],
  ];

  return { routes, tick, check, list, store };
}
