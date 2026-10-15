import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { appendSession, dayKey, readSessions, summarize, type SessionRecord } from '../src/main/stats';

const at = (d: string) => new Date(d).getTime();
const H = 3_600_000;
const rec = (start: number, hours: number, extra: Partial<SessionRecord> = {}): SessionRecord =>
  ({ start, end: start + hours * H, profileId: 'p1', profileName: 'Fabric', versionId: '1.21.4', loader: 'fabric', servers: [], ...extra });

describe('statistics', () => {
  it('splits sessions over midnight and counts streaks', () => {
    const now = at('2026-10-15T20:00:00');
    const sessions = [
      rec(at('2026-10-13T23:00:00'), 2), // 1 h on the 13th, 1 h on the 14th
      rec(at('2026-10-15T10:00:00'), 1.5, { profileId: 'p2', profileName: 'Vanilla' }),
    ];
    const s = summarize(sessions, now, 7);
    assert.equal(s.byDay.length, 7);
    const day = (d: string) => s.byDay.find((x) => x.date === d)!.ms;
    assert.equal(day('2026-10-13'), H);
    assert.equal(day('2026-10-14'), H);
    assert.equal(day('2026-10-15'), 1.5 * H);
    assert.equal(s.totalMs, 3.5 * H);
    assert.equal(s.streak, 3);
    assert.equal(s.longestMs, 2 * H);
    assert.deepEqual(s.byProfile.map((p) => p.profileId), ['p1', 'p2']);
    assert.equal(s.byHour[23] + s.byHour[0], 2 * H);
  });
  it('counts server time until the next join', () => {
    const start = at('2026-10-15T10:00:00');
    const s = summarize([rec(start, 3, { servers: [{ address: 'a.pl', at: start }, { address: 'b.pl', at: start + 2 * H }] })], at('2026-10-15T20:00:00'), 30);
    assert.deepEqual(s.byServer.map((x) => [x.address, x.ms / H, x.joins]), [['a.pl', 2, 1], ['b.pl', 1, 1]]);
    assert.equal(dayKey(start), '2026-10-15');
  });
  it('stores sessions and skips crashes on start', async () => {
    const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'stats-')), 'stats.json');
    await appendSession(rec(at('2026-10-15T10:00:00'), 1), file);
    await appendSession({ ...rec(at('2026-10-15T12:00:00'), 0), end: at('2026-10-15T12:00:03') }, file);
    assert.equal((await readSessions(file)).length, 1);
  });
});
