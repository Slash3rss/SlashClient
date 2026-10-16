import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fpsChange, readBenchmarks, type BenchmarkResult } from '../src/main/benchmark';
import { benchTips } from '../src/shared/benchTips';

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

describe('benchmark tips', () => {
  const base = { fps: { avg: 150, low1: 100, median: 150 }, frames: 4000, stutters: 10, gpu: 70,
    settings: { renderDistance: 12, simulationDistance: 12, width: 1920, height: 1080, vsync: false, maxFps: 260, memoryMb: 4096 } };
  const ids = (tips: ReturnType<typeof benchTips>) => tips.map((t) => t.id);

  it('says all is well when nothing holds the game back', () => {
    assert.deepEqual(ids(benchTips(base, [])), ['good']);
  });

  it('sees VSync and the frame limit holding the FPS', () => {
    assert.ok(ids(benchTips({ ...base, fps: { avg: 59, low1: 50, median: 60 }, settings: { ...base.settings, vsync: true } }, [])).includes('vsync'));
    assert.ok(ids(benchTips({ ...base, fps: { avg: 119, low1: 90, median: 120 }, settings: { ...base.settings, maxFps: 120 } }, [])).includes('limit'));
  });

  it('offers the missing mods that fix stutter, and only those', () => {
    const tips = benchTips({ ...base, fps: { avg: 150, low1: 40, median: 150 }, settings: { ...base.settings, memoryMb: 2048 } }, ['sodium', 'lithium']);
    const stutter = tips.find((t) => t.id === 'stutter')!;
    assert.deepEqual(stutter.mods, ['sodium']);
    assert.ok(ids(tips).includes('memory'));
    // what the stutter tip does not offer comes as its own tip
    assert.deepEqual(tips.find((t) => t.id === 'mods')?.mods, ['lithium']);
  });

  it('tells a busy graphics card from a waiting one', () => {
    assert.ok(ids(benchTips({ ...base, gpu: 98 }, [])).includes('gpu'));
    assert.ok(ids(benchTips({ ...base, fps: { avg: 70, low1: 50, median: 70 }, gpu: 30 }, [])).includes('cpu'));
  });

  it('asks for a mod loader on a vanilla profile', () => {
    assert.ok(ids(benchTips(base, null)).includes('loader'));
  });
});

describe('benchmark tips without repeats', () => {
  it('offers each mod once', () => {
    const tips = benchTips({ fps: { avg: 70, low1: 20, median: 70 }, frames: 3000, stutters: 90, gpu: 30,
      settings: { renderDistance: 12, simulationDistance: 12, width: 1920, height: 1080, vsync: false, maxFps: 260, memoryMb: 4096 } }, ['sodium', 'lithium', 'entityculling']);
    const all = tips.flatMap((t) => t.mods ?? []);
    assert.equal(all.length, new Set(all).size);
    assert.deepEqual(tips.find((t) => t.id === 'cpu')?.mods, ['lithium', 'entityculling']);
  });
});
