import fs from 'node:fs/promises';
import path from 'node:path';
import { readModMeta } from './modcheck';
import { findFitting, installProject } from './modrinth';

/**
 * SlashClient HUD: our own Fabric mod (folder hud/), shipped inside the launcher as
 * dist/hud/slashclient-hud-<game version>.jar. Before a Fabric game starts the launcher
 * puts the matching jar into mods/ (or takes it out when the profile has it switched off).
 */

const OURS = /^slashclient-hud-.*\.jar$/;

/** Game versions the bundled HUD supports, from the jars next to the launcher. */
export async function hudVersions(dir: string): Promise<string[]> {
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  return files.map((f) => /^slashclient-hud-(.+)\.jar$/.exec(f)?.[1]).filter((v): v is string => !!v);
}

export interface HudPlan {
  /** True when the HUD will be in the game. */
  active: boolean;
  /** Fabric API is needed and missing. */
  needsFabricApi: boolean;
}

/**
 * Puts the HUD jar for `gameVersion` into mods/ or removes ours when it should not be there.
 * Installing Fabric API (which the HUD needs) is left to the caller, who knows Modrinth.
 */
export async function syncHud(bundleDir: string, gameDir: string, opts: { enabled: boolean; loader: string; gameVersion: string }): Promise<HudPlan> {
  const mods = path.join(gameDir, 'mods');
  const source = path.join(bundleDir, `slashclient-hud-${opts.gameVersion}.jar`);
  const wanted = opts.enabled && opts.loader === 'fabric' && (await fs.access(source).then(() => true, () => false));
  const present = (await fs.readdir(mods).catch(() => [] as string[])).filter((f) => OURS.test(f));
  const target = `slashclient-hud-${opts.gameVersion}.jar`;

  for (const f of present) if (!wanted || f !== target) await fs.rm(path.join(mods, f), { force: true });
  if (!wanted) return { active: false, needsFabricApi: false };

  await fs.mkdir(mods, { recursive: true });
  const fresh = await fs.readFile(source);
  const current = await fs.readFile(path.join(mods, target)).catch(() => undefined);
  // a launcher update brings a new HUD: replace the copy when it differs
  if (!current?.equals(fresh)) await fs.writeFile(path.join(mods, target), fresh);
  return { active: true, needsFabricApi: !(await hasFabricApi(mods)) };
}

/** Whether an enabled jar in mods/ provides Fabric API. */
async function hasFabricApi(mods: string): Promise<boolean> {
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
export async function writeLauncherInfo(gameDir: string, socialUrl: string): Promise<void> {
  const dir = path.join(gameDir, 'config');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'slashclient-launcher.json'), JSON.stringify({ socialUrl }, null, 2));
}

/** Takes the HUD out again, e.g. when Fabric API could not be installed and the game would not start with it. */
export async function removeHud(gameDir: string): Promise<void> {
  const mods = path.join(gameDir, 'mods');
  for (const f of await fs.readdir(mods).catch(() => [] as string[])) if (OURS.test(f)) await fs.rm(path.join(mods, f), { force: true });
}

/**
 * Everything before a game starts: the HUD jar and, when missing, Fabric API from Modrinth.
 * Problems here never stop the game: without Fabric API the HUD is left out, since Fabric
 * would refuse to start with it.
 */
export async function prepareHud(bundleDir: string, gameDir: string, opts: { enabled: boolean; loader: string; gameVersion: string; socialUrl?: string }, onStage?: () => void): Promise<boolean> {
  try {
    const plan = await syncHud(bundleDir, gameDir, opts);
    if (plan.active && opts.socialUrl) await writeLauncherInfo(gameDir, opts.socialUrl);
    if (!plan.needsFabricApi) return plan.active;
    onStage?.();
    const api = await findFitting('fabric-api', opts.gameVersion, 'fabric');
    if (!api) throw new Error('Fabric API not found on Modrinth');
    await installProject(gameDir, api.projectId, 'mod', opts.gameVersion, 'fabric');
    return true;
  } catch (err) {
    console.error('SlashClient HUD:', err);
    await removeHud(gameDir).catch(() => {});
    return false;
  }
}
