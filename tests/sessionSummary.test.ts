import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  appendSummary, buildSummary, collectSummary, MAX_HISTORY, removeSummary, modSessionFile, parseModSession, placesFromJoins, readSummaries, summaryDisplay, withStats,
  type ModStats, type SessionSummary,
} from '../src/main/sessionSummary';
import type { SessionRecord } from '../src/main/stats';
import { earnedDuring, fmtDistance, fmtDuration, highlights, parseChallenges, placesLine } from '../src/renderer/sessionSummary';
import { setLang } from '../src/shared/i18n';
import { filterSummaries, summaryTotals } from '../src/shared/sessionTotals';

const M = 60_000;
const H = 60 * M;
const START = new Date('2026-10-20T18:00:00').getTime();

const modFile = (extra: Record<string, unknown> = {}) => JSON.stringify({
  v: 1, startedAt: START + 4000, updatedAt: START + 2 * H, closed: true, playMs: 100 * M,
  places: [{ kind: 'server', name: 'SkyUp', address: 'skyup.pl', ms: 70 * M, visits: 2 }, { kind: 'world', name: 'Nowy świat', ms: 30 * M, visits: 1 }],
  deaths: 3, kills: { players: 4, mobs: 20 }, damage: { dealt: 151.5, taken: 60 }, blocks: { mined: 320, placed: 140 },
  distance: { walk: 900, sprint: 1500, swim: 20, fly: 0, elytra: 0, ride: 0 }, messages: 12, commands: 3, screenshots: 2, clips: 1,
  fps: { avg: 144, low1: 61, frames: 800_000 }, longestLifeMs: 40 * M, ...extra,
});

const stats = (patch: Partial<ModStats> = {}): ModStats => ({ ...parseModSession(modFile(), START)!.stats, ...patch });

describe('session summary: the mod file', () => {
  it('reads the counters and places of this run', () => {
    const s = parseModSession(modFile(), START)!;
    assert.equal(s.stats.complete, true);
    assert.deepEqual(s.stats.kills, { players: 4, mobs: 20 });
    assert.equal(s.stats.fps.low1, 61);
    assert.deepEqual(s.places.map((p) => [p.kind, p.name, p.address, p.ms]), [['server', 'SkyUp', 'skyup.pl', 70 * M], ['world', 'Nowy świat', undefined, 30 * M]]);
  });
  it('ignores a file from an earlier run, another format, or garbage', () => {
    assert.equal(parseModSession(modFile({ startedAt: START - H }), START), undefined);
    assert.equal(parseModSession(modFile({ v: 2 }), START), undefined);
    assert.equal(parseModSession('{"v":1', START), undefined);
    assert.equal(parseModSession('[]', START), undefined);
  });
  it('turns bad numbers into zeros and drops broken places', () => {
    const s = parseModSession(modFile({ deaths: -5, kills: { players: 'x' }, damage: null, places: [{ kind: 'nether', name: 'x' }, { kind: 'world', name: '' }, { kind: 'server', address: 'a.pl', ms: 5 }], closed: 'yes' }), START)!;
    assert.equal(s.stats.deaths, 0);
    assert.deepEqual(s.stats.kills, { players: 0, mobs: 0 });
    assert.deepEqual(s.stats.damage, { dealt: 0, taken: 0 });
    assert.equal(s.stats.complete, false);
    assert.deepEqual(s.places, [{ kind: 'server', name: 'a.pl', address: 'a.pl', ms: 5 }]);
  });
});

describe('session summary: building it', () => {
  const base = { start: START, end: START + 2 * H, profile: { id: 'p1', name: 'Fabric', loader: 'fabric' }, versionId: '1.21.4', crashed: false };

  it('counts servers from the log until the next join, like the statistics', () => {
    const places = placesFromJoins([{ address: 'a.pl', at: START }, { address: 'b.pl', at: START + H }, { address: 'a.pl', at: START + 90 * M }], START + 2 * H);
    assert.deepEqual(places.map((p) => [p.name, p.ms / M]), [['a.pl', 90], ['b.pl', 30]]);
  });
  it('prefers the mod places and keeps only this session\'s screenshots', () => {
    const shot = (min: number) => ({ file: `/g/screenshots/${min}.png`, name: `${min}.png`, createdAt: START + min * M });
    const s = buildSummary({
      ...base, mod: parseModSession(modFile(), START), joins: [{ address: 'skyup.pl', at: START }],
      world: { name: 'Nowy świat', icon: '/g/saves/Nowy świat/icon.png' },
      screenshots: [shot(-30), shot(10), shot(50), shot(60 * 24)], clips: [],
    });
    assert.deepEqual(s.places.map((p) => p.name), ['SkyUp', 'Nowy świat']);
    assert.equal(s.places[1].icon, '/g/saves/Nowy świat/icon.png');
    assert.deepEqual(s.screenshots.map((m) => m.name), ['50.png', '10.png']);
    assert.equal(s.screenshotCount, 2);
    assert.equal(s.stats?.blocks.mined, 320);
  });
  it('never counts more time than the session had', () => {
    const s = buildSummary({ ...base, end: START + 20 * M, mod: parseModSession(modFile(), START), joins: [], screenshots: [], clips: [] });
    assert.deepEqual(s.places.map((p) => p.ms), [20 * M, 20 * M]);
    assert.equal(s.stats?.playMs, 20 * M);
    assert.equal(s.stats?.longestLifeMs, 20 * M);
  });
  it('works without the mod: servers from the log, the saved world before them', () => {
    const s = buildSummary({ ...base, joins: [{ address: 'skyup.pl', at: START + 30 * M }], world: { name: 'Dom' }, screenshots: [], clips: [] });
    assert.equal(s.stats, null);
    assert.deepEqual(s.places.map((p) => [p.kind, p.name, p.ms / M]), [['server', 'skyup.pl', 90], ['world', 'Dom', 30]]);
  });
  it('adds the day from the statistics', () => {
    const rec = (start: number, ms: number): SessionRecord => ({ start, end: start + ms, profileId: 'p1', profileName: 'Fabric', versionId: '1.21.4', loader: 'fabric', servers: [] });
    const day = 86_400_000;
    const sessions = [rec(START - 2 * day, H), rec(START - day, H), rec(START - 3 * H, 30 * M), rec(START, 2 * H)];
    const s = withStats(buildSummary({ ...base, joins: [], screenshots: [], clips: [] }), sessions);
    assert.equal(s.context?.todayMs, 2.5 * H);
    assert.equal(s.context?.streak, 3);
    assert.equal(s.context?.longestIn30Days, true);
    assert.equal(withStats(s, [...sessions, rec(START - 5 * day, 3 * H)]).context?.longestIn30Days, false);
  });
});

describe('session summary: when it shows', () => {
  const o = { enabled: true, code: 0 as number | null, byUser: false, durationMs: 20 * M, benchmark: false };
  it('shows the card after a normal close or a stop from the launcher', () => {
    assert.equal(summaryDisplay(o), 'card');
    assert.equal(summaryDisplay({ ...o, code: 1, byUser: true }), 'card');
  });
  it('goes under the crash after a crash', () => {
    assert.equal(summaryDisplay({ ...o, code: -1 }), 'crash');
    assert.equal(summaryDisplay({ ...o, code: null }), 'crash');
  });
  it('stays hidden when turned off, for short runs and benchmarks', () => {
    assert.equal(summaryDisplay({ ...o, enabled: false }), 'none');
    assert.equal(summaryDisplay({ ...o, durationMs: 10_000 }), 'none');
    assert.equal(summaryDisplay({ ...o, benchmark: true }), 'none');
  });
});

describe('session summary: files', () => {
  it('keeps the last ones, newest first, and skips short runs', async () => {
    const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'summaries-')), 'session-summaries.json');
    const make = (i: number, length = H) => buildSummary({ start: START + i * 3 * H, end: START + i * 3 * H + length, profile: { id: 'p', name: 'P', loader: 'fabric' }, versionId: '1.21.4', crashed: false, joins: [], screenshots: [], clips: [] });
    assert.equal(MAX_HISTORY, 300);
    for (let i = 0; i < 12; i++) await appendSummary(make(i), file, 10);
    await appendSummary(make(20, 5000), file, 10);
    const list = await readSummaries(file);
    assert.equal(list.length, 10);
    assert.equal(list[0].start, START + 11 * 3 * H);
    assert.equal(list.at(-1)!.start, START + 2 * 3 * H);
    assert.deepEqual(await readSummaries(path.join(path.dirname(file), 'missing.json')), []);
    // one deleted from the list; the totals add up the time of the rest
    await removeSummary(list[0].id, file);
    const left = await readSummaries(file);
    assert.equal(left.length, 9);
    assert.ok(!left.some((s) => s.id === list[0].id));
    const totals = summaryTotals(left);
    assert.equal(totals.sessions, 9);
    assert.equal(totals.ms, 9 * H);
    assert.equal(filterSummaries(left, 'p', '').length, 9);
    assert.equal(filterSummaries(left, 'other', '').length, 0);
    assert.equal(filterSummaries(left, '', 'skyup.pl').length, 0);
  });
  it('gathers the mod file, the world and the media from the profile folder', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'game-'));
    const now = Date.now();
    await fs.mkdir(path.join(dir, 'config'), { recursive: true });
    await fs.writeFile(modSessionFile(dir), modFile({ startedAt: now - 10 * M + 3000, updatedAt: now }));
    await fs.mkdir(path.join(dir, 'saves', 'Nowy świat'), { recursive: true });
    await fs.writeFile(path.join(dir, 'saves', 'Nowy świat', 'level.dat'), '');
    await fs.writeFile(path.join(dir, 'saves', 'Nowy świat', 'icon.png'), '');
    await fs.mkdir(path.join(dir, 'screenshots'));
    await fs.writeFile(path.join(dir, 'screenshots', 'a.png'), '');
    const s = await collectSummary({ gameDir: dir, start: now - 10 * M, end: now + 1000, profile: { id: 'p', name: 'P', loader: 'fabric' }, versionId: '1.21.4', crashed: false, joins: [] });
    assert.equal(s.stats?.kills.mobs, 20);
    assert.equal(s.places.find((p) => p.kind === 'world')?.icon, path.join(dir, 'saves', 'Nowy świat', 'icon.png'));
    assert.equal(s.screenshotCount, 1);
    // a file from the run before is not this session's
    const older = await collectSummary({ gameDir: dir, start: now + H, end: now + 2 * H, profile: { id: 'p', name: 'P', loader: 'fabric' }, versionId: '1.21.4', crashed: false, joins: [] });
    assert.equal(older.stats, null);
  });
});

describe('session summary: the card\'s texts', () => {
  it('formats time and distance', () => {
    setLang('pl');
    assert.equal(fmtDuration(45_000), '45 s');
    assert.equal(fmtDuration(12 * M), '12 min');
    assert.equal(fmtDuration(2 * H + 5 * M), '2 h 05 min');
    assert.equal(fmtDistance(850.4), '850 m');
    assert.equal(fmtDistance(12_400), '12,4 km');
    setLang('en');
    assert.equal(fmtDistance(12_400), '12.4 km');
    setLang('pl');
  });
  it('picks the highlights that happened', () => {
    const all = highlights(stats());
    assert.deepEqual(all.map((h) => h.id), ['kills', 'deaths', 'kd', 'damage', 'blocks', 'distance', 'messages', 'fps']);
    assert.equal(all.find((h) => h.id === 'kd')!.value, '8');
    assert.equal(all.find((h) => h.id === 'damage')!.value, '75,8 ❤');
    assert.match(all.find((h) => h.id === 'distance')!.note!, /^biegiem 1,5 km · pieszo 900 m$/);
    const quiet = stats({ deaths: 0, kills: { players: 0, mobs: 0 }, damage: { dealt: 0, taken: 0 }, blocks: { mined: 0, placed: 0 }, distance: { walk: 0.4, sprint: 0, swim: 0, fly: 0, elytra: 0, ride: 0 }, messages: 0, fps: { avg: 60, low1: 30, frames: 10 } });
    assert.deepEqual(highlights(quiet), []);
    assert.deepEqual(highlights(null), []);
  });
  it('lists the places in one line', () => {
    assert.equal(placesLine([]), 'w menu');
    assert.equal(placesLine([{ kind: 'server', name: 'a', ms: 1 }, { kind: 'world', name: 'b', ms: 1 }, { kind: 'world', name: 'c', ms: 1 }]), 'a, b +1');
  });
  it('takes the sparks and achievements of the session only', () => {
    const s = { start: START, end: START + H };
    const earned = earnedDuring(s, [
      { amount: 50, reason: 'achievement', at: START + 10 * M }, { amount: -100, reason: 'purchase', at: START + 20 * M },
      { amount: 25, reason: 'achievement', at: START + H + 2 * M }, { amount: 30, reason: 'achievement', at: START - M },
    ], [
      { id: 'a', name: 'A', nameEn: 'A', unlockedAt: START + 10 * M }, { id: 'b', name: 'B', nameEn: 'B', unlockedAt: null }, { id: 'c', name: 'C', nameEn: 'C', unlockedAt: START - H },
    ]);
    assert.equal(earned.sparks, 75);
    assert.deepEqual(earned.achievements.map((a) => a.id), ['a']);
  });
  it('reads challenges in the shapes a server may send, or none', () => {
    assert.deepEqual(parseChallenges(undefined), []);
    assert.deepEqual(parseChallenges({ error: 'not_found' }), []);
    assert.deepEqual(parseChallenges({ challenges: [{ name: 'Zabij 10 mobów', progress: 4, goal: 10 }, { title: 'Bez celu' }] }), [{ name: 'Zabij 10 mobów', progress: 4, goal: 10, done: false }]);
    assert.deepEqual(parseChallenges([{ name: 'Graj godzinę', value: 90, target: 60 }]), [{ name: 'Graj godzinę', progress: 60, goal: 60, done: true }]);
  });
});

// the type is used by the renderer as the IPC payload: it must stay plain data
const _plain: SessionSummary = JSON.parse(JSON.stringify(buildSummary({ start: 0, end: 1, profile: { id: '', name: '', loader: '' }, versionId: '', crashed: false, joins: [], screenshots: [], clips: [] })));
void _plain;
