import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './paths';
import { worldPlayedSince } from './sessions';
import { summarize, type SessionRecord } from './stats';
import { listClips, listScreenshots } from './worlds';

/**
 * "Podsumowanie sesji": what one game session was, shown after the game closes. The launcher
 * knows the time, the servers joined (from the log), the world saved and the screenshots and clips
 * taken; SlashClient's mod adds what only the game knows (config/slashclient-session.json, see
 * SessionStats.java): time in each world and on each server, kills, deaths, damage, blocks,
 * distance, chat messages and the FPS. The last few summaries are kept for the statistics page.
 */

export interface SummaryPlace {
  kind: 'server' | 'world';
  name: string;
  /** A server's address (the name is the one in the player's server list). */
  address?: string;
  ms: number;
  /** A world's icon.png in the profile, for the card. */
  icon?: string;
}

export interface SummaryMedia { file: string; name: string; createdAt: number }

/** What the mod counted (all numbers checked, missing ones are 0). */
export interface ModStats {
  /** The game closed normally and wrote the file one last time (false: the last minute's save). */
  complete: boolean;
  playMs: number;
  deaths: number;
  kills: { players: number; mobs: number };
  /** In health points (2 = one heart). */
  damage: { dealt: number; taken: number };
  blocks: { mined: number; placed: number };
  /** In blocks. */
  distance: { walk: number; sprint: number; swim: number; fly: number; elytra: number; ride: number };
  messages: number;
  commands: number;
  screenshots: number;
  clips: number;
  fps: { avg: number; low1: number; frames: number };
  longestLifeMs: number;
}

export interface SessionSummary {
  id: string;
  start: number;
  end: number;
  profileId: string;
  profileName: string;
  versionId: string;
  loader: string;
  /** The game ended with an error (not closed by the player or the launcher). */
  crashed: boolean;
  places: SummaryPlace[];
  /** Null when the game ran without SlashClient's mod (or it wrote nothing). */
  stats: ModStats | null;
  screenshots: SummaryMedia[];
  screenshotCount: number;
  clips: SummaryMedia[];
  clipCount: number;
  /** The day around it, from the launcher's statistics. */
  context?: { todayMs: number; streak: number; longestIn30Days: boolean };
}

/** The summaries kept ("Wszystkie sesje" on the statistics page; the page shows the last ten itself). */
export const MAX_HISTORY = 300;
const MAX_MEDIA = 12;
/** Shorter runs are crashes on start or a quick look: no summary. */
export const MIN_SESSION_MS = 30_000;

export const modSessionFile = (gameDir: string) => path.join(gameDir, 'config', 'slashclient-session.json');
export const summariesFile = (root = paths.root) => path.join(root, 'session-summaries.json');

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, max) : '');

/**
 * The mod's file, when it is from this run: written after the launcher started the game
 * (`since`, with a little slack for the clocks) and in the format we know. Undefined otherwise.
 */
export function parseModSession(text: string, since: number): { stats: ModStats; places: SummaryPlace[] } | undefined {
  let raw: Record<string, unknown>;
  try {
    raw = obj(JSON.parse(text));
  } catch {
    return undefined;
  }
  if (raw.v !== 1 || num(raw.startedAt) < since - 5_000 || num(raw.updatedAt) < num(raw.startedAt)) return undefined;
  const kills = obj(raw.kills), damage = obj(raw.damage), blocks = obj(raw.blocks), distance = obj(raw.distance), fps = obj(raw.fps);
  const places: SummaryPlace[] = (Array.isArray(raw.places) ? raw.places : []).slice(0, 30).flatMap((p): SummaryPlace[] => {
    const o = obj(p);
    const kind = o.kind === 'server' || o.kind === 'world' ? o.kind : undefined;
    const name = str(o.name) || str(o.address);
    if (!kind || !name) return [];
    const address = kind === 'server' ? str(o.address, 255) : '';
    return [{ kind, name, ...(address ? { address } : {}), ms: num(o.ms) }];
  });
  return {
    places,
    stats: {
      complete: raw.closed === true,
      playMs: num(raw.playMs),
      deaths: num(raw.deaths),
      kills: { players: num(kills.players), mobs: num(kills.mobs) },
      damage: { dealt: num(damage.dealt), taken: num(damage.taken) },
      blocks: { mined: num(blocks.mined), placed: num(blocks.placed) },
      distance: { walk: num(distance.walk), sprint: num(distance.sprint), swim: num(distance.swim), fly: num(distance.fly), elytra: num(distance.elytra), ride: num(distance.ride) },
      messages: num(raw.messages),
      commands: num(raw.commands),
      screenshots: num(raw.screenshots),
      clips: num(raw.clips),
      fps: { avg: num(fps.avg), low1: num(fps.low1), frames: num(fps.frames) },
      longestLifeMs: num(raw.longestLifeMs),
    },
  };
}

/** Servers from the launcher's log (joins in order): each counts until the next join or the end, like the statistics. */
export function placesFromJoins(joins: { address: string; at: number }[], end: number): SummaryPlace[] {
  const out = new Map<string, SummaryPlace>();
  joins.forEach((join, i) => {
    const ms = Math.max(0, (joins[i + 1]?.at ?? end) - join.at);
    const place = out.get(join.address) ?? { kind: 'server' as const, name: join.address, address: join.address, ms: 0 };
    place.ms += ms;
    out.set(join.address, place);
  });
  return [...out.values()];
}

/** The summary from what the launcher and the mod know; the mod's places (with worlds and real times) win. */
export function buildSummary(input: {
  start: number;
  end: number;
  profile: { id: string; name: string; loader: string };
  versionId: string;
  crashed: boolean;
  mod?: { stats: ModStats; places: SummaryPlace[] };
  joins: { address: string; at: number }[];
  /** The world saved during the session (the launcher's own guess, when the mod has none). */
  world?: { name: string; icon?: string };
  screenshots: SummaryMedia[];
  clips: SummaryMedia[];
}): SessionSummary {
  let places: SummaryPlace[];
  if (input.mod?.places.length) places = input.mod.places.filter((p) => p.ms >= 1000 || input.mod!.places.length === 1);
  else {
    places = placesFromJoins(input.joins, input.end);
    // without the mod the world's time is a guess: until the first server, or the whole session
    if (input.world) places.unshift({ kind: 'world', name: input.world.name, ms: Math.max(0, (input.joins[0]?.at ?? input.end) - input.start) });
  }
  if (input.world?.icon) {
    const world = places.find((p) => p.kind === 'world' && p.name === input.world!.name) ?? (places.filter((p) => p.kind === 'world').length === 1 ? places.find((p) => p.kind === 'world') : undefined);
    if (world) world.icon = input.world.icon;
  }
  // the mod starts after the launcher: its times never go past the session (a stale file could)
  const length = Math.max(0, input.end - input.start);
  for (const p of places) p.ms = Math.min(p.ms, length);
  const stats = input.mod ? { ...input.mod.stats, playMs: Math.min(input.mod.stats.playMs, length), longestLifeMs: Math.min(input.mod.stats.longestLifeMs, length) } : null;
  places.sort((a, b) => b.ms - a.ms);
  const inSession = (m: SummaryMedia) => m.createdAt >= input.start - 1000 && m.createdAt <= input.end + 60_000;
  const shots = input.screenshots.filter(inSession).sort((a, b) => b.createdAt - a.createdAt);
  const clips = input.clips.filter(inSession).sort((a, b) => b.createdAt - a.createdAt);
  return {
    id: `${input.start.toString(36)}-${input.profile.id}`,
    start: input.start,
    end: input.end,
    profileId: input.profile.id,
    profileName: input.profile.name,
    versionId: input.versionId,
    loader: input.profile.loader,
    crashed: input.crashed,
    places: places.slice(0, 12),
    stats,
    screenshots: shots.slice(0, MAX_MEDIA),
    screenshotCount: shots.length,
    clips: clips.slice(0, MAX_MEDIA),
    clipCount: clips.length,
  };
}

/**
 * The day around the session from the statistics (stats.json, which already holds this session):
 * today's play time, the streak, and whether no session in the last 30 days was longer.
 */
export function withStats(summary: SessionSummary, sessions: SessionRecord[]): SessionSummary {
  const day = summarize(sessions, summary.end, 1);
  const month = sessions.filter((s) => s.end > summary.end - 30 * 86_400_000 && s.start !== summary.start);
  const length = summary.end - summary.start;
  return {
    ...summary,
    context: { todayMs: day.totalMs, streak: day.streak, longestIn30Days: month.length > 0 && month.every((s) => s.end - s.start < length) },
  };
}

/** What to show when a game ends: the card, a section under the crash's explanation, or nothing. */
export function summaryDisplay(opts: { enabled: boolean; code: number | null; byUser: boolean; durationMs: number; benchmark: boolean }): 'card' | 'crash' | 'none' {
  if (!opts.enabled || opts.benchmark || opts.durationMs < MIN_SESSION_MS) return 'none';
  return opts.code !== 0 && !opts.byUser ? 'crash' : 'card';
}

/** Gathers the session's summary from the profile's folder once the game is gone. */
export async function collectSummary(input: {
  gameDir: string;
  start: number;
  end: number;
  profile: { id: string; name: string; loader: string };
  versionId: string;
  crashed: boolean;
  joins: { address: string; at: number }[];
}): Promise<SessionSummary> {
  const text = await fs.readFile(modSessionFile(input.gameDir), 'utf8').catch(() => '');
  const mod = text ? parseModSession(text, input.start) : undefined;
  const played = await worldPlayedSince(input.gameDir, input.start).catch(() => undefined);
  let world: { name: string; icon?: string } | undefined;
  if (played) {
    const icon = path.join(input.gameDir, 'saves', played.folder, 'icon.png');
    const named = mod?.places.find((p) => p.kind === 'world' && p.name === played.folder);
    world = { name: named?.name ?? played.folder, icon: (await fs.stat(icon).then(() => true, () => false)) ? icon : undefined };
  }
  const media = (list: { file: string; name: string; createdAt: number }[]) => list.map(({ file, name, createdAt }) => ({ file, name, createdAt }));
  return buildSummary({
    ...input,
    mod,
    world,
    screenshots: media(await listScreenshots(input.gameDir).catch(() => [])),
    clips: media(await listClips(input.gameDir).catch(() => [])),
  });
}

export async function readSummaries(file = summariesFile()): Promise<SessionSummary[]> {
  try {
    const list = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(list) ? list.filter((s) => s && typeof s.start === 'number' && typeof s.end === 'number') : [];
  } catch {
    return [];
  }
}

async function writeSummaries(list: SessionSummary[], file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, JSON.stringify(list));
  await fs.rename(`${file}.tmp`, file);
}

/** Keeps the summary among the last ones (newest first). */
export async function appendSummary(summary: SessionSummary, file = summariesFile(), max = MAX_HISTORY): Promise<void> {
  if (summary.end - summary.start < MIN_SESSION_MS) return;
  await writeSummaries([summary, ...(await readSummaries(file)).filter((s) => s.id !== summary.id)].slice(0, max), file);
}

/** A summary the player deleted from the list. */
export async function removeSummary(id: string, file = summariesFile()): Promise<void> {
  const list = await readSummaries(file);
  const left = list.filter((s) => s.id !== id);
  if (left.length !== list.length) await writeSummaries(left, file);
}
