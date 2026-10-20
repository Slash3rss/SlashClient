import fs from 'node:fs/promises';
import path from 'node:path';
import { t } from '../shared/i18n';
import { clearDedicatedGpu, dedicatedGpuEnv, gpuOptionSupported, preferDedicatedGpu } from './gpuPreference';
import {
  actionLabel, applyKeyChanges, findConflicts, freeKeys, isKeyName, isVanillaAction, keyLabel, modKeyNames, parseKeybinds, suggestFixes,
} from './keybinds';
import { paths } from './paths';
import { setDownloadLimit } from './rateLimit';
import { profileGameDir, type Profile, type Settings } from './store';
import { wikiArticle, wikiSearch, wikiSection } from './wiki';
import { skyupArticle, skyupIndex, skyupSearch } from './skyupWiki';

/**
 * IPC and launch hooks of four smaller launcher tools, kept out of main.ts: key conflicts in a
 * profile's options.txt, the minecraft.wiki panel, the download speed limit and the dedicated GPU.
 */

type Handle = <T extends unknown[], R>(channel: string, fn: (...args: T) => Promise<R> | R) => void;

export interface LauncherToolsDeps {
  handle: Handle;
  profiles: () => Profile[];
  /** Whether this profile's game runs now. */
  running: (profileId: string) => boolean;
}

const sharedOptions = () => path.join(paths.root, 'shared', 'options.txt');

/**
 * The options.txt that will really be used: a profile with shared settings gets the shared copy
 * at the next launch, so that one counts when it exists.
 */
async function optionsFiles(profile: Profile): Promise<{ read: string; write: string[] }> {
  const own = path.join(profileGameDir(profile), 'options.txt');
  if (profile.syncOptions && (await fs.access(sharedOptions()).then(() => true, () => false))) {
    return { read: sharedOptions(), write: [sharedOptions(), own] };
  }
  return { read: own, write: [own] };
}

export function registerLauncherTools(deps: LauncherToolsDeps): void {
  const { handle } = deps;
  const profileById = (id: string) => {
    const profile = deps.profiles().find((p) => p.id === id);
    if (!profile) throw new Error(t('Nie znaleziono profilu.'));
    return profile;
  };
  /** Shared settings are written back by every synced profile when its game closes. */
  const busy = (profile: Profile) =>
    deps.running(profile.id) || (profile.syncOptions && deps.profiles().some((p) => p.syncOptions && deps.running(p.id)));

  // ---------- key conflicts ----------

  handle('keys:conflicts', async (profileId: string) => {
    const profile = profileById(profileId);
    const files = await optionsFiles(profile);
    const text = await fs.readFile(files.read, 'utf8').catch(() => undefined);
    if (text === undefined) return { exists: false, running: busy(profile), conflicts: [], fixes: [], free: [] };
    const binds = parseKeybinds(text);
    const conflicts = findConflicts(binds);
    const fixes = suggestFixes(binds, conflicts);
    const modActions = new Set(conflicts.flatMap((c) => c.actions).filter((a) => !isVanillaAction(a)));
    const names = await modKeyNames(path.join(profileGameDir(profile), 'mods'), modActions).catch(() => new Map<string, string>());
    const label = (action: string) => ({ action, label: actionLabel(action, names), vanilla: isVanillaAction(action) });
    return {
      exists: true,
      running: busy(profile),
      shared: files.read === sharedOptions(),
      conflicts: conflicts.map((c) => ({ key: c.key, keyLabel: keyLabel(c.key, c.modifier), actions: c.actions.map(label) })),
      fixes: fixes.map((f) => ({ ...label(f.action), to: f.to, toLabel: keyLabel(f.to) })),
      free: freeKeys(binds).map((k) => ({ key: k, label: keyLabel(k) })),
    };
  });

  /** Rebinds actions in options.txt (only while the game is closed: it writes the file when it quits). */
  handle('keys:apply', async (profileId: string, changes: { action: string; to: string }[]) => {
    const profile = profileById(profileId);
    if (busy(profile)) throw new Error(t('Gra jest uruchomiona: zamknij ją, zanim zmienisz klawisze (gra nadpisuje options.txt przy wyjściu).'));
    if (!Array.isArray(changes) || !changes.length) return 0;
    const clean = changes.filter((c) => c && typeof c.action === 'string' && /^[\w.\-:/]+$/.test(c.action) && isKeyName(c.to));
    const files = await optionsFiles(profile);
    for (const file of files.write) {
      const text = await fs.readFile(file, 'utf8').catch(() => undefined);
      if (text === undefined) continue;
      const next = applyKeyChanges(text, clean);
      if (next === text) continue;
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, next);
      await fs.rename(tmp, file);
    }
    return clean.length;
  });

  // ---------- minecraft.wiki ----------

  handle('wiki:search', (query: string) => wikiSearch(query));
  handle('wiki:article', (title: string) => wikiArticle(title));
  handle('wiki:section', (title: string, index: string) => wikiSection(title, index));
  // the SkyUp.pl wiki (skyup.pl/wiki)
  handle('wiki:skyupIndex', () => skyupIndex());
  handle('wiki:skyupArticle', (slug: string) => skyupArticle(slug));
  handle('wiki:skyupSearch', (query: string) => skyupSearch(query));
  handle('gpu:supported', () => gpuOptionSupported());
}

/** Puts the tools' settings into effect: at start and after every save of Settings. */
export async function applyToolSettings(settings: Settings, previous?: Settings): Promise<void> {
  setDownloadLimit(settings.downloadLimitMBps);
  // turned off: the registry values the launcher wrote go away again
  if (process.platform === 'win32' && !settings.dedicatedGpu && (previous === undefined || previous.dedicatedGpu)) {
    await clearDedicatedGpu().catch((err) => console.error('GPU preference:', err));
  }
}

/** What launch() gets for the dedicated GPU: environment (Linux) and the registry step for the Java (Windows). */
export async function gpuLaunchOptions(settings: Settings): Promise<{ extraEnv?: Record<string, string>; prepareJava?: (java: string) => Promise<unknown> }> {
  if (!settings.dedicatedGpu || !gpuOptionSupported()) return {};
  if (process.platform === 'win32') return { prepareJava: (java) => preferDedicatedGpu(java) };
  return { extraEnv: await dedicatedGpuEnv() };
}
