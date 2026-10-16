import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fpsChange, readBenchmarks, type BenchmarkResult } from '../src/main/benchmark';

const run = (at: number, avg: number): BenchmarkResult => ({
  at, version: '26.3', fps: { avg, low1: avg / 2, low01: avg / 3, median: avg, min: 10, max: avg * 2 }, frames: 3000, stutters: 4,
  settings: { renderDistance: 12, width: 1920, height: 1080, vsync: false, maxFps: 260, fullscreen: false, mods: 3 },
});

describe('benchmark results', () => {
  it('reads the runs the mod wrote, newest first, and skips broken ones', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-bench-'));
    assert.deepEqual(await readBenchmarks(dir), []);
    await fs.mkdir(path.join(dir, 'config'));
    await fs.writeFile(path.join(dir, 'config', 'slashclient-benchmarks.json'), JSON.stringify([run(1, 100), { at: 'x' }, run(3, 150), null]));
    const runs = await readBenchmarks(dir);
    assert.deepEqual(runs.map((r) => r.at), [3, 1]);
    await fs.writeFile(path.join(dir, 'config', 'slashclient-benchmarks.json'), 'not json');
    assert.deepEqual(await readBenchmarks(dir), []);
    await fs.rm(dir, { recursive: true });
  });

  it('tells how much faster or slower a run was', () => {
    assert.equal(fpsChange(run(2, 150), run(1, 100)), 50);
    assert.equal(fpsChange(run(2, 50), run(1, 100)), -50);
    assert.equal(fpsChange(run(2, 50), undefined), undefined);
  });
});
