import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './paths';

/** One game session, appended to stats.json when the game closes. */
export interface SessionRecord {
  start: number;
  end: number;
  profileId: string;
  profileName: string;
  versionId: string;
  loader: string;
  /** Servers joined during the session, in order. */
  servers: { address: string; at: number }[];
}

const MAX_SESSIONS = 10_000;
export const statsFile = (root = paths.root) => path.join(root, 'stats.json');

export async function readSessions(file = statsFile()): Promise<SessionRecord[]> {
  try {
    const list = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function appendSession(record: SessionRecord, file = statsFile()): Promise<void> {
  // very short runs are crashes on start, not play time
  if (record.end - record.start < 10_000) return;
  const list = [...(await readSessions(file)), record].slice(-MAX_SESSIONS);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, JSON.stringify(list));
  await fs.rename(`${file}.tmp`, file);
}

export interface StatsSummary {
  totalMs: number;
  sessions: number;
  avgMs: number;
  longestMs: number;
  /** Days in a row (ending today or yesterday) with any play. */
  streak: number;
  /** One entry per day of the range, oldest first; date = YYYY-MM-DD in local time. */
  byDay: { date: string; ms: number }[];
  byProfile: { profileId: string; name: string; ms: number; sessions: number }[];
  /** Time is counted from joining a server until the next join or the end of the session. */
  byServer: { address: string; ms: number; joins: number }[];
  byHour: number[];
}

const DAY = 86_400_000;

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Adds the part of [from, to) that falls on each local day (sessions past midnight count on both days). */
function spread(from: number, to: number, add: (day: string, ms: number) => void) {
  let t = from;
  while (t < to) {
    // midnight of the next day, in local time (DST days are 23 or 25 hours long)
    const stop = Math.min(to, new Date(t).setHours(24, 0, 0, 0));
    add(dayKey(t), stop - t);
    t = stop;
  }
}

/** Statistics for the last `days` days (0 = all time), as of `now`. */
export function summarize(all: SessionRecord[], now: number, days: number): StatsSummary {
  const from = days > 0 ? startOfDay(now) - (days - 1) * DAY : Math.min(now, ...all.map((s) => s.start));
  const sessions = all.filter((s) => s.end > from && s.start <= now);
  const dayMs = new Map<string, number>();
  const byProfile = new Map<string, { profileId: string; name: string; ms: number; sessions: number }>();
  const byServer = new Map<string, { address: string; ms: number; joins: number }>();
  const byHour = Array(24).fill(0) as number[];
  let totalMs = 0;
  let longestMs = 0;

  for (const s of sessions) {
    const start = Math.max(s.start, from);
    const end = Math.min(s.end, now);
    const ms = end - start;
    totalMs += ms;
    longestMs = Math.max(longestMs, s.end - s.start);
    spread(start, end, (day, part) => dayMs.set(day, (dayMs.get(day) ?? 0) + part));
    for (let t = start; t < end;) {
      const hourEnd = Math.min(end, new Date(t).setMinutes(60, 0, 0));
      byHour[new Date(t).getHours()] += hourEnd - t;
      t = hourEnd;
    }
    const p = byProfile.get(s.profileId) ?? { profileId: s.profileId, name: s.profileName, ms: 0, sessions: 0 };
    p.ms += ms;
    p.sessions++;
    p.name = s.profileName;
    byProfile.set(s.profileId, p);
    s.servers.forEach((join, i) => {
      const leave = Math.min(s.servers[i + 1]?.at ?? s.end, now);
      const srv = byServer.get(join.address) ?? { address: join.address, ms: 0, joins: 0 };
      srv.ms += Math.max(0, leave - Math.max(join.at, from));
      srv.joins++;
      byServer.set(join.address, srv);
    });
  }

  const byDay: { date: string; ms: number }[] = [];
  for (let t = startOfDay(from); t <= now; t = startOfDay(t + DAY + 3_600_000 * 2)) byDay.push({ date: dayKey(t), ms: dayMs.get(dayKey(t)) ?? 0 });

  // streak: count back from today (or yesterday, if nothing yet today) over every session ever
  const played = new Set<string>();
  for (const s of all) spread(s.start, s.end, (day) => played.add(day));
  let streak = 0;
  let t = played.has(dayKey(now)) ? now : now - DAY;
  while (played.has(dayKey(t))) {
    streak++;
    t = startOfDay(t) - DAY / 2;
  }

  return {
    totalMs,
    sessions: sessions.length,
    avgMs: sessions.length ? totalMs / sessions.length : 0,
    longestMs,
    streak,
    byDay,
    byProfile: [...byProfile.values()].sort((a, b) => b.ms - a.ms),
    byServer: [...byServer.values()].sort((a, b) => b.ms - a.ms),
    byHour,
  };
}
