import { BENCH_SCENES } from './benchTips';
import { t } from './i18n';

/**
 * A benchmark run as text to paste on Discord or a forum: the result, the game's settings and
 * the computer it ran on. Only names and sizes go in, never the user, the host name or paths.
 */

export interface SharedRun {
  version: string;
  scene?: string;
  scenes?: { id: string; avg: number; low1: number }[];
  fps: { avg: number; low1: number; low01: number };
  stutters: number;
  hardware?: { cpu?: string; gpu?: string; java?: string };
  settings: { renderDistance: number; width: number; height: number; vsync: boolean; mods: number; memoryMb?: number };
}

export interface SharedSpecs {
  os: string;
  cpu?: string;
  threads: number;
  ramGb: number;
  gpu?: string;
}

/** "NVIDIA GeForce RTX 3070/PCIe/SSE2" and ANGLE's "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)" both as the card's name. */
export function gpuName(raw: string | undefined): string | undefined {
  let s = (raw ?? '').trim();
  const angle = /^ANGLE \((.*)\)$/.exec(s);
  if (angle) {
    const parts = angle[1].split(', ');
    s = (parts.length >= 2 ? parts[1] : parts[0]).replace(/\s+(Direct3D\S*|vs_\S+|ps_\S+)(?=\s|$)/g, '').replace(/^ANGLE Metal Renderer: /, '');
  }
  s = s.replace(/\/(PCIe|PCI|AGP)?\/?SSE2$/i, '').replace(/\s*\(TM\)|\s*\(R\)/gi, '').replace(/\s+/g, ' ').trim();
  return s || undefined;
}

/** "Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz" as "Intel Core i7-9700K CPU @ 3.60GHz". */
export function cpuName(raw: string | undefined): string | undefined {
  const s = (raw ?? '').replace(/\((TM|R)\)/gi, '').replace(/\s+/g, ' ').trim();
  return s || undefined;
}

/** The computer of a run: the mod's names first (the GPU the game really drew with), the launcher's for runs from older mods. */
export function benchDevice(run: SharedRun, specs: SharedSpecs | undefined) {
  return {
    os: specs?.os, cpu: cpuName(run.hardware?.cpu) ?? specs?.cpu, threads: specs?.threads, ramGb: specs?.ramGb,
    gpu: gpuName(run.hardware?.gpu) ?? specs?.gpu,
    // "25.0.1+8-LTS (Eclipse Adoptium)" as "25.0.1 (Eclipse Adoptium)"
    java: run.hardware?.java?.replace(/^(\d+(?:\.\d+)*)[^ ]*/, '$1'),
  };
}

/** What the server keeps for a link (server/src/benchmarkShares.ts): the run without the world's name, and the computer. */
export function benchSharePayload(run: SharedRun & { at: number; frames: number; cpu?: number; gpu?: number; settings: { fullscreen: boolean } }, specs: SharedSpecs | undefined) {
  const s = run.settings;
  return {
    kind: run.scene ? 'scene' : 'world', version: run.version, at: run.at, frames: run.frames, stutters: run.stutters,
    fps: { avg: run.fps.avg, low1: run.fps.low1, low01: run.fps.low01 },
    cpuUse: run.cpu === undefined ? undefined : run.cpu * 100, gpuUse: run.gpu === undefined || run.gpu < 0 ? undefined : run.gpu,
    scenes: run.scenes?.map((x) => ({ id: x.id, avg: x.avg, low1: x.low1 })),
    settings: { renderDistance: s.renderDistance, width: s.width, height: s.height, vsync: s.vsync, fullscreen: s.fullscreen, mods: s.mods, memoryMb: s.memoryMb },
    device: benchDevice(run, specs),
  };
}

/** The same as text, for a server without links (older, or with them switched off). */
export function benchShareText(run: SharedRun, specs: SharedSpecs | undefined): string {
  const n = (v: number) => String(Math.round(v));
  const s = run.settings;
  const d = benchDevice(run, specs);
  const lines = [
    `SlashClient Benchmark · ${run.scene ? t('Scena testowa') : t('Własny świat')}`,
    t('{0} FPS średnio · 1% low {1} · 0,1% low {2} · przycięcia: {3}', n(run.fps.avg), n(run.fps.low1), n(run.fps.low01), run.stutters),
  ];
  if (run.scenes?.length) lines.push(run.scenes.map((x) => `${t(BENCH_SCENES[x.id] ?? x.id)} ${n(x.avg)}`).join(' · '));
  lines.push([`Minecraft ${run.version}`, t('zasięg {0}', s.renderDistance), `${s.width}×${s.height}`, t('modów: {0}', s.mods), s.vsync ? 'VSync' : ''].filter(Boolean).join(' · '));
  if (d.cpu) lines.push(`CPU: ${d.cpu}${d.threads ? ` (${t('{0} wątków', d.threads)})` : ''}`);
  if (d.gpu) lines.push(`GPU: ${d.gpu}`);
  const ram = [specs?.ramGb ? `${specs.ramGb} GB` : '', s.memoryMb ? t('dla gry {0} GB', +(s.memoryMb / 1024).toFixed(1)) : ''].filter(Boolean);
  if (ram.length) lines.push(`RAM: ${ram.join(', ')}`);
  lines.push([d.os ? t('System: {0}', d.os) : '', d.java ? `Java ${d.java}` : ''].filter(Boolean).join(' · '));
  lines.push('slashclient.pl');
  return lines.filter(Boolean).join('\n');
}
