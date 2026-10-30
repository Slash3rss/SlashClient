import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readModMeta } from './modcheck';
import { cachedModFile } from './modrinth';

/**
 * SlashClient HUD: our own Fabric mod (folder hud/), shipped inside the launcher as
 * dist/hud/slashclient-hud-<game version>.jar. It is not put into the player's mods/:
 * the launcher keeps it (and Fabric API, when the profile has none) in its own folder
 * and hands both to Fabric at start with -Dfabric.addMods. Vanilla profiles get a hidden
 * Fabric Loader for it (see prepareProfileHud in main.ts).
 */

const OURS = /^slashclient-hud-.*\.jar$/;

/** Game versions the bundled HUD supports, from the jars next to the launcher. */
export async function hudVersions(dir: string): Promise<string[]> {
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  return files.map((f) => /^slashclient-hud-(.+)\.jar$/.exec(f)?.[1]).filter((v): v is string => !!v);
}

export interface HudOptions { enabled: boolean; loader: string; gameVersion: string }

/** The bundled jar for this profile, or undefined when the HUD should not run there. */
export async function hudJarFor(bundleDir: string, opts: HudOptions): Promise<string | undefined> {
  if (!opts.enabled || opts.loader !== 'fabric') return undefined;
  const jar = path.join(bundleDir, `slashclient-hud-${opts.gameVersion}.jar`);
  return (await fs.access(jar).then(() => true, () => false)) ? jar : undefined;
}

/**
 * Copies the jar out of the launcher (inside app.asar Java could not read it) into
 * `cacheDir`, rewriting it only when a launcher update brought a different one.
 */
/**
 * Copies the HUD jar for a game to start with. Each build gets its own file name (with a hash of
 * its content) and is written next to it first, then renamed: a game that is still running keeps
 * reading its own jar. Overwriting it in place (as before) broke a running game the moment it
 * loaded a class it had not loaded yet ("ZipFile invalid LOC header").
 */
export async function stageJar(source: string, cacheDir: string): Promise<string> {
  await fs.mkdir(cacheDir, { recursive: true });
  const fresh = await fs.readFile(source);
  const base = path.basename(source, '.jar');
  const name = `${base}-${createHash('sha256').update(fresh).digest('hex').slice(0, 12)}.jar`;
  const dest = path.join(cacheDir, name);
  if (!(await fs.stat(dest).catch(() => undefined))) {
    const tmp = `${dest}.${process.pid}.tmp`;
    await fs.writeFile(tmp, fresh);
    await fs.rename(tmp, dest);
  }
  // older builds of the same jar go after two days, when no game started with them is still running
  const old = Date.now() - 2 * 24 * 3_600_000;
  for (const f of await fs.readdir(cacheDir).catch(() => [] as string[])) {
    const same = f === `${base}.jar` || (f.startsWith(`${base}-`) && /^[0-9a-f]{12}\.jar$/.test(f.slice(base.length + 1)));
    if (f === name || !same) continue;
    const file = path.join(cacheDir, f);
    const stat = await fs.stat(file).catch(() => undefined);
    if (stat && stat.mtimeMs < old) await fs.rm(file, { force: true }).catch(() => {});
  }
  return dest;
}

/** Older launchers copied the HUD into mods/; with the injected one it would load twice. */
export async function removeOldHud(gameDir: string): Promise<void> {
  const mods = path.join(gameDir, 'mods');
  for (const f of await fs.readdir(mods).catch(() => [] as string[])) if (OURS.test(f)) await fs.rm(path.join(mods, f), { force: true });
}

/** Whether an enabled jar in mods/ provides Fabric API (then ours must not be added: Fabric refuses duplicates). */
export async function hasFabricApi(gameDir: string): Promise<boolean> {
  const mods = path.join(gameDir, 'mods');
  for (const f of await fs.readdir(mods).catch(() => [] as string[])) {
    if (!f.endsWith('.jar') || OURS.test(f)) continue;
    const meta = readModMeta(await fs.readFile(path.join(mods, f)), f);
    if (meta?.ids.includes('fabric-api')) return true;
  }
  return false;
}

/**
 * What the mod needs from the launcher: the SlashClient server, for the logo next to
 * other SlashClient players. Separate from the HUD settings, which the player edits.
 */
export async function writeLauncherInfo(gameDir: string, socialUrl: string, seasonal = true): Promise<void> {
  const dir = path.join(gameDir, 'config');
  await fs.mkdir(dir, { recursive: true });
  // the seasonal look switched off in the launcher's settings or by the admin: off in the game too
  await fs.writeFile(path.join(dir, 'slashclient-launcher.json'), JSON.stringify({ socialUrl, ...(seasonal ? {} : { seasonal: false }) }, null, 2));
}

/** The -Dfabric.addMods argument for these jars (none when the list is empty). */
export function addModsArgs(jars: string[]): string[] {
  return jars.length ? [`-Dfabric.addMods=${jars.join(path.delimiter)}`] : [];
}

/**
 * Everything before a game starts. Returns the jars to inject: the HUD and, when the
 * profile has no Fabric API of its own, ours. Problems here never stop the game: without
 * Fabric API the HUD is left out, since Fabric would refuse to start with it.
 */
export async function prepareHud(
  bundleDir: string,
  gameDir: string,
  opts: HudOptions & { cacheDir: string; socialUrl?: string; ignoreProfileMods?: boolean; seasonal?: boolean },
  onStage?: () => void,
): Promise<string[]> {
  try {
    await removeOldHud(gameDir);
    const source = await hudJarFor(bundleDir, opts);
    if (!source) return [];
    const jars = [await stageJar(source, opts.cacheDir)];
    if (opts.socialUrl) await writeLauncherInfo(gameDir, opts.socialUrl, opts.seasonal !== false);
    if (opts.ignoreProfileMods || !(await hasFabricApi(gameDir))) {
      onStage?.();
      jars.push(await cachedModFile('fabric-api', opts.gameVersion, 'fabric', path.join(opts.cacheDir, 'fabric-api', opts.gameVersion)));
    }
    return jars;
  } catch (err) {
    console.error('SlashClient HUD:', err);
    return [];
  }
}
