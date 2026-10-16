import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Results of the SlashClient benchmark, written by the HUD mod to
 * <game dir>/config/slashclient-benchmarks.json (newest last). The launcher only reads them.
 */

export interface BenchmarkResult {
  /** Epoch ms of the end of the run. */
  at: number;
  /** Minecraft version, e.g. "26.3". */
  version: string;
  world?: string;
  fps: { avg: number; low1: number; low01: number; median: number; min: number; max: number };
  frames: number;
  /** Frames that took more than twice the median: what you feel as stutter. */
  stutters: number;
  /** 0..1, average over the run, when the system reports it. */
  cpu?: number;
  /** 0..100, when the game can read the GPU. */
  gpu?: number;
  settings: {
    renderDistance: number;
    simulationDistance?: number;
    width: number;
    height: number;
    vsync: boolean;
    maxFps: number;
    fullscreen: boolean;
    mods: number;
    memoryMb?: number;
  };
}

const FILE = (gameDir: string) => path.join(gameDir, 'config', 'slashclient-benchmarks.json');

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Only well-formed results: the file is written by the game and could be edited by hand. */
function valid(r: unknown): r is BenchmarkResult {
  const x = r as BenchmarkResult;
  return !!x && num(x.at) && typeof x.version === 'string' && !!x.fps && num(x.fps.avg) && num(x.fps.low1) && num(x.frames) && !!x.settings && num(x.settings.renderDistance);
}

/** The profile's results, newest first. */
export async function readBenchmarks(gameDir: string): Promise<BenchmarkResult[]> {
  try {
    const data = JSON.parse(await fs.readFile(FILE(gameDir), 'utf8'));
    return (Array.isArray(data) ? data : []).filter(valid).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** How much `now` is better (+) or worse (-) than `before`, in percent of average FPS. */
export function fpsChange(now: BenchmarkResult, before: BenchmarkResult | undefined): number | undefined {
  if (!before || before.fps.avg <= 0) return undefined;
  return ((now.fps.avg - before.fps.avg) / before.fps.avg) * 100;
}
