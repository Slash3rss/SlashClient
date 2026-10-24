import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CHANGED_ON_DISK, configDir, listConfigFiles, readConfigFile, restoreDefaultConfig, writeConfigFile, type SaveOptions } from './configFiles';
import { removeItems, scanDisk, type CleanupItem, type CleanupProfile, type DiskReport } from './diskUsage';
import { fetchJson } from './download';
import { resolveVersionId } from './launch';
import { paths } from './paths';
import { profileGameDir, type Profile } from './store';
import { getManifest, type VersionJson } from './versions';
import { vendorDirName } from './javaVendors';
import { effectiveJavaVendor } from '../shared/javaVendors';
import { t } from '../shared/i18n';

/**
 * IPC for the profile's config editor and the disk cleanup in Settings. Kept out of main.ts:
 * main only hands over what these need (the profiles, which games run, the system trash).
 */

type Handle = <T extends unknown[], R>(channel: string, fn: (...args: T) => Promise<R> | R) => void;

export interface MaintenanceDeps {
  handle: Handle;
  profiles: () => Profile[];
  /** Whether this profile's game runs now (then its configs are read-only). */
  running: (profileId: string) => boolean;
  anyRunning: () => boolean;
  trash: (file: string) => Promise<void>;
  openPath: (dir: string) => Promise<unknown>;
  /** The default Java vendor from Settings. */
  defaultJavaVendor?: () => string | undefined;
}

/** The Java runtime (and its version) a game version wants, from its JSON on disk or Mojang's manifest (nothing is written). */
async function javaOf(gameVersion: string): Promise<{ component: string; major: number } | undefined> {
  const local = await fs.readFile(paths.versionJson(gameVersion), 'utf8').then((s) => JSON.parse(s) as VersionJson, () => undefined);
  const json = local ?? await (async () => {
    const entry = (await getManifest()).versions.find((v) => v.id === gameVersion);
    return entry ? fetchJson<VersionJson>(entry.url) : undefined;
  })();
  if (!json) return undefined;
  // a version without javaVersion is old and runs on Java 8, like ensureJava assumes
  if (json.javaVersion?.component) return { component: json.javaVersion.component, major: json.javaVersion.majorVersion ?? 8 };
  return json.inheritsFrom ? javaOf(json.inheritsFrom) : { component: 'jre-legacy', major: 8 };
}

export function registerMaintenance(deps: MaintenanceDeps): void {
  const { handle } = deps;
  const profileById = (id: string) => {
    const profile = deps.profiles().find((p) => p.id === id);
    if (!profile) throw new Error(t('Nie znaleziono profilu.'));
    return profile;
  };
  const writable = (id: string) => {
    if (deps.running(id)) throw new Error(t('Gra tego profilu jest uruchomiona: zamknij ją, zanim zmienisz configi (gra nadpisuje je przy wyjściu).'));
    return profileGameDir(profileById(id));
  };

  // ---------- config editor ----------

  handle('configs:list', async (profileId: string) => {
    const gameDir = profileGameDir(profileById(profileId));
    return { ...(await listConfigFiles(gameDir)), running: deps.running(profileId) };
  });
  handle('configs:read', (profileId: string, rel: string) => readConfigFile(profileGameDir(profileById(profileId)), rel));
  handle('configs:save', async (profileId: string, rel: string, text: string, opts: SaveOptions = {}) => {
    try {
      return await writeConfigFile(writable(profileId), rel, text, opts);
    } catch (err) {
      // the page recognises this one and asks whether to overwrite
      if ((err as Error).message === CHANGED_ON_DISK) return { changed: true };
      throw err;
    }
  });
  handle('configs:restore', (profileId: string, rel: string) => restoreDefaultConfig(writable(profileId), rel, deps.trash));
  handle('configs:openDir', async (profileId: string) => {
    const dir = configDir(profileGameDir(profileById(profileId)));
    await fs.mkdir(dir, { recursive: true });
    await deps.openPath(dir);
  });

  // ---------- disk cleanup ----------

  /** The last scan, with the paths the page never sees: cleaning picks items from it by id. */
  let last: { report: DiskReport; items: Map<string, CleanupItem> } | undefined;
  const layout = () => ({
    root: paths.root, versions: paths.versions, libraries: paths.libraries, assets: paths.assets, runtimes: paths.runtimes,
    instances: paths.instances, console: path.join(paths.root, 'console'), hudCache: path.join(paths.root, 'hud'), tmp: os.tmpdir(),
  });

  handle('disk:scan', async (olderThanDays: number) => {
    const days = Number.isFinite(olderThanDays) ? Math.min(3650, Math.max(1, Math.round(olderThanDays))) : 30;
    const profiles: CleanupProfile[] = await Promise.all(deps.profiles().map(async (p) => {
      const gameVersion = await resolveVersionId(p.versionId).catch(() => undefined);
      const java = gameVersion ? await javaOf(gameVersion).catch(() => undefined) : undefined;
      // another vendor's Java the profile plays on stays too (Mojang's as well: it is the fallback)
      const vendor = effectiveJavaVendor(p.javaVendor, deps.defaultJavaVendor?.());
      const javaDir = java && vendor !== 'mojang' && !p.javaPath ? vendorDirName(vendor, java.major) : undefined;
      return { id: p.id, name: p.name, gameDir: profileGameDir(p), gameVersion: gameVersion || undefined, javaComponent: java?.component, javaDir, running: deps.running(p.id) };
    }));
    const report = await scanDisk(layout(), profiles, days);
    last = { report, items: new Map(report.items.map((i) => [i.id, i])) };
    // the page gets sizes and names; the file lists stay here
    return { ...report, items: report.items.map(({ paths: list, ...rest }) => ({ ...rest, count: list.length })) };
  });

  handle('disk:clean', async (ids: string[]) => {
    if (deps.anyRunning()) throw new Error(t('Zamknij grę przed sprzątaniem.'));
    if (!last || Date.now() - last.report.scannedAt > 30 * 60_000) throw new Error(t('Wynik sprawdzania jest nieaktualny: sprawdź jeszcze raz.'));
    const chosen = (Array.isArray(ids) ? ids : []).map((id) => last!.items.get(id)).filter((i): i is CleanupItem => !!i);
    const allowed = [paths.root, os.tmpdir(), ...deps.profiles().map(profileGameDir)];
    // installers in the temporary folder: only our own files there
    for (const item of chosen) {
      if (item.group === 'caches' && item.id.startsWith('cache:installer:') && !item.paths.every((p) => path.basename(p).startsWith('slashclient-'))) throw new Error(t('Nieprawidłowa ścieżka pliku.'));
    }
    const result = await removeItems(chosen, allowed, deps.trash);
    last = undefined;
    return result;
  });
}
