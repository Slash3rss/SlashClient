import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './paths';

/**
 * "Wymuś dedykowaną kartę graficzną" (Settings): laptops otherwise often start Java on the
 * integrated GPU. On Windows the per-app choice of Settings → Display → Graphics lives in
 * HKCU\Software\Microsoft\DirectX\UserGpuPreferences (value name = the program's path, data
 * "GpuPreference=2;" = high performance); on Linux PRIME offload is asked for through the game's
 * environment. macOS switches GPUs by itself, so the option is hidden there.
 *
 * The registry is only touched for Java runtimes the launcher installed itself (under runtimes/),
 * and only values the launcher wrote are removed again: they are remembered in a small file.
 */

export const GPU_KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
export const HIGH_PERFORMANCE = 'GpuPreference=2;';

/** Whether this platform has the option at all. */
export const gpuOptionSupported = (platform: NodeJS.Platform = process.platform) => platform === 'win32' || platform === 'linux';

/** Runs reg.exe; resolves with stdout, rejects when it exits with an error (e.g. a value that isn't there). */
export type RegRunner = (args: string[]) => Promise<string>;

const realReg: RegRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile('reg', args, { windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });

export interface GpuDeps {
  reg: RegRunner;
  /** The file that lists the registry values the launcher wrote. */
  stateFile: string;
  /** Folder of the launcher's own Java runtimes. */
  runtimesDir: string;
}

const defaultDeps = (): GpuDeps => ({ reg: realReg, stateFile: path.join(paths.config, 'gpu-preferences.json'), runtimesDir: paths.runtimes });

/** Whether `java` is one of the launcher's own runtimes (a custom Java path of the player is left alone). */
export function isOwnJava(java: string, runtimesDir: string): boolean {
  const rel = path.relative(path.resolve(runtimesDir), path.resolve(java));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** The registry value of one program, or undefined when there is none. */
export async function readPreference(reg: RegRunner, program: string): Promise<string | undefined> {
  try {
    const out = await reg(['query', GPU_KEY, '/v', program]);
    // "    C:\...\javaw.exe    REG_SZ    GpuPreference=2;"
    const m = out.match(/REG_SZ\s+(.*)$/m);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

async function readState(file: string): Promise<string[]> {
  try {
    const list = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function writeState(file: string, list: string[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (list.length) await fs.writeFile(file, JSON.stringify(list, null, 2));
  else await fs.rm(file, { force: true });
}

/**
 * Before a game starts on Windows: asks for the high-performance GPU for the Java it runs, when
 * the option is on. A value the player (or Windows) already set for that program is kept as it is.
 */
export async function preferDedicatedGpu(java: string, partial: Partial<GpuDeps> = {}): Promise<boolean> {
  const deps = { ...defaultDeps(), ...partial };
  if (!isOwnJava(java, deps.runtimesDir)) return false;
  // javaw.exe starts the game; java.exe next to it is set too, in case something starts that one
  const programs = [java];
  const dir = path.dirname(java);
  const base = path.basename(java).toLowerCase();
  if (base === 'javaw.exe') programs.push(path.join(dir, 'java.exe'));
  else if (base === 'java.exe') programs.push(path.join(dir, 'javaw.exe'));
  const ours = await readState(deps.stateFile);
  let changed = false;
  for (const program of programs) {
    const current = await readPreference(deps.reg, program);
    if (current !== undefined) continue;
    await deps.reg(['add', GPU_KEY, '/v', program, '/t', 'REG_SZ', '/d', HIGH_PERFORMANCE, '/f']);
    if (!ours.includes(program)) ours.push(program);
    changed = true;
  }
  if (changed) await writeState(deps.stateFile, ours);
  return true;
}

/**
 * The option was turned off: removes every value the launcher wrote, as long as it still says what
 * the launcher put there (a value the player changed since is theirs now).
 */
export async function clearDedicatedGpu(partial: Partial<GpuDeps> = {}): Promise<number> {
  const deps = { ...defaultDeps(), ...partial };
  const ours = await readState(deps.stateFile);
  let removed = 0;
  const left: string[] = [];
  for (const program of ours) {
    const current = await readPreference(deps.reg, program);
    if (current === HIGH_PERFORMANCE) {
      try {
        await deps.reg(['delete', GPU_KEY, '/v', program, '/f']);
        removed++;
      } catch {
        left.push(program);
      }
    }
  }
  await writeState(deps.stateFile, left);
  return removed;
}

/** Whether the NVIDIA proprietary driver is loaded (it then needs its own offload variables). */
async function hasNvidiaDriver(): Promise<boolean> {
  return fs.access('/proc/driver/nvidia/version').then(() => true, () => false);
}

/**
 * Linux: the environment that asks for PRIME render offload. DRI_PRIME=1 works for Mesa drivers
 * (AMD, Intel, nouveau); the NVIDIA driver reads its own two variables.
 */
export function primeEnv(nvidia: boolean): Record<string, string> {
  return nvidia
    ? { DRI_PRIME: '1', __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __VK_LAYER_NV_optimus: 'NVIDIA_only' }
    : { DRI_PRIME: '1' };
}

/** Environment variables a game gets with the option on (none outside Linux). */
export async function dedicatedGpuEnv(platform: NodeJS.Platform = process.platform): Promise<Record<string, string>> {
  if (platform !== 'linux') return {};
  return primeEnv(await hasNvidiaDriver());
}
