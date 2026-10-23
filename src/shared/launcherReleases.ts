import { compareVersion, parseVersion } from '../../server/src/releaseNotes';

/**
 * The launcher's own releases (GET /v1/changelog, server/src/downloads.ts) as the launcher uses
 * them: the "Co nowego" window after an update, the dot on "Nowości w launcherze", going back to
 * an older version and pausing automatic updates afterwards. Only decisions here, no I/O.
 */

export interface LauncherRelease {
  version: string;
  date: string;
  notes: string;
  title?: string;
  /** The systems it has an update for. */
  platforms?: ('windows' | 'mac' | 'linux')[];
}

export interface ChangelogPage { releases: LauncherRelease[]; more: boolean }

/**
 * The oldest version a launcher may go back to. Older ones could lose the player's profiles: until
 * 0.9.36 a launcher that could not read launcher.json for a moment at start (an antivirus scanning
 * it, the update swapping files) started with an empty list and saved it over the file. From 0.9.36
 * on a busy file is read again, a broken one is kept aside and launcher.json.bak is used. Every
 * version since 0.9.0 keeps the profile, account and setting fields it does not know.
 */
export const MIN_ROLLBACK_VERSION = '0.9.36';

/**
 * Versions whose own update did not work on some system: going back to one of them may leave the
 * player there (the next update fails, the installer from the website is the way out). Shown in the
 * rollback window next to the version and in its last question. Add new cases here.
 */
export interface UpdateIssue {
  /** The affected versions, both ends included. */
  from: string;
  to: string;
  /** Only these systems (platformOf); every system when left out. */
  platforms?: ('windows' | 'mac' | 'linux')[];
  /** Polish text (the English one is in i18nLauncherNews). */
  text: string;
}

export const UPDATE_ISSUES: UpdateIssue[] = [
  {
    from: '0.9.36', to: '0.9.36', platforms: ['mac'],
    // app.asar was taken for a folder while the previous update was cleared away (fixed in 0.9.37)
    text: 'Na macOS aktualizacja z tej wersji może się nie udać (błąd „ENOTEMPTY”). Jeśli utkniesz, pobierz nowszą wersję ze strony client.slash3rss.dev.',
  },
];

/** The known update problems of a version on this system (`os`: process.platform). */
export function updateIssues(version: string, os: string, issues: UpdateIssue[] = UPDATE_ISSUES): UpdateIssue[] {
  const platform = platformOf(os);
  return issues.filter((i) => compareVersion(version, i.from) >= 0 && compareVersion(version, i.to) <= 0
    && (!i.platforms || (platform !== undefined && i.platforms.includes(platform))));
}

/** How many older releases the rollback window offers. */
export const ROLLBACK_CHOICES = 5;

/** This system as the release list names it. */
export function platformOf(os: string): 'windows' | 'mac' | 'linux' | undefined {
  return os === 'win32' ? 'windows' : os === 'darwin' ? 'mac' : os === 'linux' ? 'linux' : undefined;
}

/**
 * The releases a launcher can go back to: older than the installed one, not older than
 * MIN_ROLLBACK_VERSION, with an update for this system; the newest few, newest first.
 */
export function rollbackCandidates(releases: LauncherRelease[], installed: string, os: string, max = ROLLBACK_CHOICES): LauncherRelease[] {
  const platform = platformOf(os);
  return releases
    .filter((r) => parseVersion(r.version) && compareVersion(r.version, installed) < 0 && compareVersion(r.version, MIN_ROLLBACK_VERSION) >= 0)
    .filter((r) => !r.platforms || (platform !== undefined && r.platforms.includes(platform)))
    .sort((a, b) => compareVersion(b.version, a.version))
    .slice(0, max);
}

/** Whether there is a release the player has not seen yet (the installed one counts as seen). */
export function hasUnseen(newest: string | undefined, seen: string | undefined, installed: string): boolean {
  if (!parseVersion(newest)) return false;
  const known = compareVersion(seen, installed) > 0 ? seen : installed;
  return compareVersion(newest, known) > 0;
}

/**
 * Whether "Co nowego w SlashClient X" opens now: the first start of a newer version than the
 * last one started (not after going back), unless the player turned it off. A launcher that has
 * never noted a version shows it only to players who were here before (not on a fresh install,
 * where the first-run wizard opens instead).
 */
export function shouldShowWhatsNew(o: { lastRun?: string; current: string; enabled?: boolean; existingPlayer?: boolean }): boolean {
  if (o.enabled === false || !parseVersion(o.current)) return false;
  if (!parseVersion(o.lastRun)) return !!o.existingPlayer;
  return compareVersion(o.current, o.lastRun) > 0;
}

/**
 * Whether automatic updates are paused for an offered version: after going back from `pausedUntil`,
 * only a release newer than it is installed by itself.
 */
export function pauseHolds(pausedUntil: string | undefined, offered: string): boolean {
  return !!parseVersion(pausedUntil) && compareVersion(offered, pausedUntil) <= 0;
}

/** Whether a pause is over by itself: the launcher already runs a version newer than the one it left. */
export function pauseOver(pausedUntil: string | undefined, running: string): boolean {
  return !parseVersion(pausedUntil) || compareVersion(running, pausedUntil) > 0;
}
