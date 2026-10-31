import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Results of the SlashClient benchmark, written by the HUD mod to
 * <game dir>/config/slashclient-benchmarks.json (newest last). The launcher only reads them.
 */

/** One part of the SlashClient test scene, measured on its own. */
export interface BenchmarkScene {
  /** "forest", "panorama", "village", "water", "entities", "particles", "night". */
  id: string;
  avg: number;
  low1: number;
  frames: number;
  stutters: number;
}

export interface BenchmarkResult {
  /** Epoch ms of the end of the run. */
  at: number;
  /** Minecraft version, e.g. "26.3". */
  version: string;
  world?: string;
  /** Set (e.g. "slashclient-1") when the run was on the SlashClient test scene: compared only with such runs. */
  scene?: string;
  /** The test scene's parts; only with `scene`. */
  scenes?: BenchmarkScene[];
  fps: { avg: number; low1: number; low01: number; median: number; min: number; max: number };
  frames: number;
  /** Frames that took more than twice the median: what you feel as stutter. */
  stutters: number;
  /** 0..1, average over the run, when the system reports it. */
  cpu?: number;
  /** 0..100, when the game can read the GPU. */
  gpu?: number;
  /** What the game ran on, from newer mods: the GPU it drew with, the processor and Java. */
  hardware?: { cpu?: string; gpu?: string; java?: string };
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

/** The computer, as a shared result shows it: names and sizes only, never the user, host name or paths. */
export interface DeviceSpecs {
  os: string;
  cpu?: string;
  threads: number;
  ramGb: number;
  /** The launcher's own guess, for runs from mods that did not write the GPU down. */
  gpu?: string;
}

/** "Windows 11", "macOS 15.1", the Linux distribution's name. */
export function osName(platform: string, version: string, distro?: string): string {
  if (platform === 'win32') {
    const build = Number(version.split('.')[2] ?? 0);
    return build >= 22000 ? 'Windows 11' : 'Windows 10';
  }
  if (platform === 'darwin') return `macOS ${version.split('.').slice(0, 2).join('.')}`;
  return distro || 'Linux';
}

/** PRETTY_NAME from /etc/os-release ("Ubuntu 24.04.1 LTS"). */
export function distroName(osRelease: string): string | undefined {
  const m = /^PRETTY_NAME=("?)(.*)\1$/m.exec(osRelease);
  return m?.[2] || undefined;
}

/** How much `now` is better (+) or worse (-) than `before`, in percent of average FPS. */
export function fpsChange(now: BenchmarkResult, before: BenchmarkResult | undefined): number | undefined {
  if (!before || before.fps.avg <= 0) return undefined;
  return ((now.fps.avg - before.fps.avg) / before.fps.avg) * 100;
}
