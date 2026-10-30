/**
 * Presets for slower computers ("Tryb dla słabszych komputerów", per profile): what the game's settings,
 * memory and mods become with each, and which parts of it the player switched off. Plain code shared by
 * the launcher's main process (applied at launch, perfPreset.ts) and its pages (the profile's settings).
 */

export type PerfPreset = 'off' | 'light' | 'lighter' | 'pi';
export const PERF_PRESETS: PerfPreset[] = ['off', 'light', 'lighter', 'pi'];

/** The parts of a preset, each of which can be switched off on its own. */
export type PerfPart = 'graphics' | 'memory' | 'mods' | 'saver' | 'gl';
export const PERF_PARTS: PerfPart[] = ['graphics', 'memory', 'mods', 'saver', 'gl'];

export const isPerfPreset = (v: unknown): v is PerfPreset => typeof v === 'string' && (PERF_PRESETS as string[]).includes(v);

/** A part used by a profile: its preset is on, the part belongs to it, and the player did not switch it off. */
export function partOn(preset: PerfPreset | undefined, off: string[] | undefined, part: PerfPart): boolean {
  if (!preset || preset === 'off' || off?.includes(part)) return false;
  // the graphics driver fix only on the Raspberry Pi's preset
  return part !== 'gl' || preset === 'pi';
}

/**
 * The game's settings (options.txt) each preset writes: a shorter view, fast graphics, fewer particles and
 * clouds, a frame limit; the game's own names, each version reads those it knows.
 */
export function presetOptions(preset: PerfPreset): Record<string, string> {
  // 26.x: the game's own graphics preset (Fancy by default) sets the view, particles and clouds again
  // at every start; "custom" keeps ours
  const options = presetValues(preset);
  return Object.keys(options).length ? { ...options, graphicsPreset: '"custom"' } : options;
}

function presetValues(preset: PerfPreset): Record<string, string> {
  switch (preset) {
    case 'light':
      return { renderDistance: '8', simulationDistance: '6', graphicsMode: '0', renderClouds: '"fast"', particles: '1', entityShadows: 'false', biomeBlendRadius: '1', mipmapLevels: '2' };
    case 'lighter':
      return {
        renderDistance: '6', simulationDistance: '5', graphicsMode: '0', renderClouds: '"false"', particles: '2', entityShadows: 'false', ao: 'false',
        biomeBlendRadius: '0', mipmapLevels: '0', entityDistanceScaling: '0.75', maxFps: '60',
      };
    case 'pi':
      // OpenGL: the Pi's own driver lacks what the game's Vulkan needs (26.x), and the game would take a Vulkan
      // drawn by the processor instead, many times slower
      return {
        renderDistance: '4', simulationDistance: '5', graphicsMode: '0', renderClouds: '"false"', particles: '2', entityShadows: 'false', ao: 'false',
        biomeBlendRadius: '0', mipmapLevels: '0', entityDistanceScaling: '0.5', maxFps: '30', enableVsync: 'true', preferredGraphicsBackend: '"opengl"',
      };
    default:
      return {};
  }
}

/** The most memory the game gets with a preset (MB), or undefined: as the profile says. Less memory leaves more to the system. */
export function presetMemoryCap(preset: PerfPreset, systemMb: number): number | undefined {
  if (preset === 'lighter') return systemMb <= 8 * 1024 ? 2048 : 3072;
  if (preset === 'pi') return systemMb <= 4 * 1024 ? 1536 : 2048;
  return undefined;
}

/**
 * The Raspberry Pi's graphics driver tells an older OpenGL than it can run, and the newer Minecraft does
 * not start on it: the version asked for instead (as other launchers do there), on Linux only. On a Wayland
 * desktop the game's window (SDL, 26.x) also opens on Wayland itself: through XWayland it finds no OpenGL
 * on the Pi and draws with a Vulkan done by the processor, many times slower.
 */
export function presetEnv(preset: PerfPreset, off: string[] | undefined, platform: string, wayland = false): Record<string, string> {
  if (platform !== 'linux' || !partOn(preset, off, 'gl')) return {};
  return { MESA_GL_VERSION_OVERRIDE: '3.3', MESA_GLSL_VERSION_OVERRIDE: '330', ...(wayland ? { SDL_VIDEO_DRIVER: 'wayland' } : {}) };
}

/** The preset suggested for this computer: the Pi's on Linux on ARM, a lighter one for little memory or few cores, else none. */
export function suggestedPreset(systemMb: number, cores: number, platform: string, arch: string): PerfPreset {
  if (platform === 'linux' && (arch === 'arm64' || arch === 'arm')) return 'pi';
  if ((systemMb > 0 && systemMb <= 4.5 * 1024) || (cores > 0 && cores <= 2)) return 'lighter';
  if ((systemMb > 0 && systemMb <= 8.5 * 1024) || (cores > 0 && cores <= 4)) return 'light';
  return 'off';
}
