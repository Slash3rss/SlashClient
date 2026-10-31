import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { distroName, fpsChange, osName, readBenchmarks, type BenchmarkResult } from '../src/main/benchmark';
import { benchSharePayload, benchShareText, cpuName, gpuName } from '../src/shared/benchShare';
import { BENCH_SCENES, benchTips, comparableBefore } from '../src/shared/benchTips';

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

  it('keeps the test scene mark and its scenes, and compares like with like', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-bench-'));
    await fs.mkdir(path.join(dir, 'config'));
    const scene = (at: number, avg: number): BenchmarkResult => ({ ...run(at, avg), scene: 'slashclient-1', world: 'SlashClient Benchmark',
      scenes: [{ id: 'forest', avg, low1: avg / 2, frames: 600, stutters: 1 }, { id: 'night', avg: avg * 0.9, low1: avg / 3, frames: 650, stutters: 0 }] });
    // an old run without the new fields, two on the test scene and one in an own world between them
    await fs.writeFile(path.join(dir, 'config', 'slashclient-benchmarks.json'), JSON.stringify([run(1, 90), scene(2, 200), run(3, 100), scene(4, 220)]));
    const runs = await readBenchmarks(dir);
    assert.deepEqual(runs.map((r) => r.at), [4, 3, 2, 1]);
    assert.deepEqual(runs[0].scenes?.map((s) => s.id), ['forest', 'night']);
    assert.equal(comparableBefore(runs, 0)?.at, 2);
    assert.equal(comparableBefore(runs, 1)?.at, 1);
    assert.equal(comparableBefore(runs, 2), undefined);
    assert.equal(comparableBefore(runs, 3), undefined);
    await fs.rm(dir, { recursive: true });
  });

  it('names every scene of the test scene', () => {
    for (const id of ['forest', 'panorama', 'village', 'water', 'entities', 'particles', 'night']) assert.ok(BENCH_SCENES[id], id);
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

describe('sharing a benchmark run', () => {
  it('cleans GPU and CPU names from the game, ANGLE and the system', () => {
    assert.equal(gpuName('NVIDIA GeForce RTX 3070/PCIe/SSE2'), 'NVIDIA GeForce RTX 3070');
    assert.equal(gpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'NVIDIA GeForce RTX 3070');
    assert.equal(gpuName('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'), 'Apple M2');
    assert.equal(gpuName('AMD Radeon(TM) Graphics'), 'AMD Radeon Graphics');
    assert.equal(gpuName('  '), undefined);
    assert.equal(cpuName('Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz '), 'Intel Core i7-9700K CPU @ 3.60GHz');
  });

  it('names the system without anything about the user', () => {
    assert.equal(osName('win32', '10.0.26200'), 'Windows 11');
    assert.equal(osName('win32', '10.0.19045'), 'Windows 10');
    assert.equal(osName('darwin', '15.1.0'), 'macOS 15.1');
    assert.equal(osName('linux', '6.8.0', distroName('NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n')), 'Ubuntu 24.04.1 LTS');
    assert.equal(osName('linux', '6.8.0', distroName('')), 'Linux');
  });

  it('puts the result, the settings and the computer in the text, the mod\'s GPU before the launcher\'s', () => {
    const r: BenchmarkResult = { ...run(1, 143.4), scene: 'slashclient-1', scenes: [{ id: 'forest', avg: 150, low1: 90, frames: 100, stutters: 0 }],
      hardware: { cpu: 'AMD Ryzen 7 5800X 8-Core Processor', gpu: 'NVIDIA GeForce RTX 3070/PCIe/SSE2', java: '21.0.5+11-LTS (Eclipse Adoptium)' } };
    r.settings.memoryMb = 4096;
    const text = benchShareText(r, { os: 'Windows 11', cpu: 'other', threads: 16, ramGb: 32, gpu: 'Intel UHD' });
    assert.match(text, /^SlashClient Benchmark · Scena testowa\n143 FPS średnio · 1% low 72/);
    assert.match(text, /Las 150/);
    assert.match(text, /Minecraft 26\.3 · zasięg 12 · 1920×1080 · modów: 3/);
    assert.match(text, /CPU: AMD Ryzen 7 5800X 8-Core Processor \(16 wątków\)/);
    assert.match(text, /GPU: NVIDIA GeForce RTX 3070\n/);
    assert.match(text, /RAM: 32 GB, dla gry 4 GB/);
    assert.match(text, /System: Windows 11 · Java 21\.0\.5 \(Eclipse Adoptium\)/);
    // a run from an older mod: the launcher's names
    assert.match(benchShareText(run(2, 60), { os: 'Linux', cpu: 'Intel Core i5', threads: 8, ramGb: 16, gpu: 'Intel UHD' }), /CPU: Intel Core i5 \(8 wątków\)\nGPU: Intel UHD/);
    assert.doesNotMatch(text, /Users|home|\\/);
  });
});

describe('a benchmark link', () => {
  it('sends the run without the world\'s name, the mod\'s names first and the launcher\'s for the rest', () => {
    const r: BenchmarkResult = { ...run(5, 90), world: 'Mój świat Jana', cpu: 0.4, gpu: 88, hardware: { gpu: 'AMD Radeon(TM) RX 6600/PCIe/SSE2', java: '21.0.5+11-LTS (Microsoft)' } };
    const p = benchSharePayload(r, { os: 'Windows 11', cpu: 'Intel Core i5', threads: 12, ramGb: 16, gpu: 'Intel UHD' });
    assert.equal(JSON.stringify(p).includes('Jana'), false);
    assert.equal(p.kind, 'world');
    assert.equal(p.cpuUse, 40);
    assert.equal(p.gpuUse, 88);
    assert.deepEqual(p.device, { os: 'Windows 11', cpu: 'Intel Core i5', threads: 12, ramGb: 16, gpu: 'AMD Radeon RX 6600', java: '21.0.5 (Microsoft)' });
  });
});
