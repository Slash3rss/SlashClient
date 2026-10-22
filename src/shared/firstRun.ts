/**
 * The first-run wizard's decisions, kept apart from the page so they can be tested:
 * whether to show it at all, whether the computer looks slow, which version to offer.
 */

interface ProfileLike {
  name?: string;
  versionId?: string;
  loader?: string;
  playTimeMs?: number;
  lastPlayedAt?: number;
  modpack?: unknown;
  gameDir?: string;
}

interface StoreLike {
  accounts: unknown[];
  profiles: ProfileLike[];
  settings: { firstRunDone?: boolean };
}

/** The profile a fresh install starts with ("Najnowsza wersja", latest release, vanilla), never played or changed. */
export function isPristineProfile(p: ProfileLike): boolean {
  return p.name === 'Najnowsza wersja' && p.versionId === 'latest-release' && (p.loader ?? 'vanilla') === 'vanilla'
    && !p.playTimeMs && !p.lastPlayedAt && !p.modpack && !p.gameDir;
}

/** A brand new installation: no accounts, only the starting profile, and the wizard not done or skipped yet. */
export function needsFirstRun(store: StoreLike): boolean {
  if (store.settings.firstRunDone) return false;
  return store.accounts.length === 0 && store.profiles.length <= 1 && store.profiles.every(isPristineProfile);
}

/**
 * On upgrade: players who already use the launcher (an account, their own profiles) never see the
 * wizard; the flag is set for them once. Returns whether the flag was set now (the store needs saving).
 */
export function markExistingUser(store: StoreLike): boolean {
  if (store.settings.firstRunDone !== undefined || needsFirstRun(store)) return false;
  store.settings.firstRunDone = true;
  return true;
}

/**
 * A slower computer, where fewer animations help: at most 8 GB of memory (8 GB shows as a bit
 * less, so up to 8.5) or at most 4 logical cores. Unknown values do not count.
 */
export function isLowEndMachine(systemMemoryMb: number | undefined, cpuCores: number | undefined): boolean {
  const lowMemory = !!systemMemoryMb && systemMemoryMb > 0 && systemMemoryMb <= 8.5 * 1024;
  const fewCores = !!cpuCores && cpuCores > 0 && cpuCores <= 4;
  return lowMemory || fewCores;
}

/** The newest release in the version list (the manifest lists newest first); undefined when there are none. */
export function newestRelease(versions: { id: string; type: string }[]): string | undefined {
  return versions.find((v) => v.type === 'release')?.id;
}

/**
 * Releases to choose from in the wizard, newest first: the newest ones, plus every version the
 * SlashClient HUD supports (marked), so a supported one is always on the list.
 */
export function wizardVersions(versions: { id: string; type: string }[], hudVersions: string[], limit = 12): { id: string; hud: boolean }[] {
  const releases = versions.filter((v) => v.type === 'release');
  const hud = new Set(hudVersions);
  return releases.filter((v, i) => i < limit || hud.has(v.id)).map((v) => ({ id: v.id, hud: hud.has(v.id) }));
}
