import { app } from 'electron';
import { parseVersion } from '../../server/src/releaseNotes';
import { MIN_ROLLBACK_VERSION, rollbackCandidates, shouldShowWhatsNew, type ChangelogPage, type LauncherRelease } from '../shared/launcherReleases';
import { backupForRollback, type Settings } from './store';
import { resumeUpdates, rollbackTo } from './updates';

/**
 * The launcher's own changelog from the SlashClient server (GET /v1/changelog, which reads the
 * releases of the private repository with its token): "Co nowego" after an update, "Nowości w
 * launcherze" on the Play screen, "Historia zmian" and going back to an older version in Settings.
 * An older server has no changelog: every call answers null and the page hides those parts.
 */

export interface ChangelogDeps {
  handle: (channel: string, fn: (...args: any[]) => unknown) => void;
  settings: () => Settings;
  persist: () => Promise<void>;
  /** GET on the SlashClient server (no sign-in); undefined when the server has no such address. */
  get: <T>(path: string) => Promise<T | undefined>;
}

const langOf = (l: unknown) => (l === 'en' ? 'en' : 'pl');

export function initChangelog(d: ChangelogDeps): void {
  const version = app.getVersion();
  const s = d.settings();
  // decided once at start, before this version is noted as the last one started
  let whatsNew = shouldShowWhatsNew({ lastRun: s.lastRunVersion, current: version, enabled: s.whatsNewAfterUpdate, existingPlayer: s.firstRunDone === true }) ? version : null;
  if (s.lastRunVersion !== version) {
    s.lastRunVersion = version;
    void d.persist();
  }

  d.handle('changelog:list', (before?: string, limit?: number, lang?: string) => {
    const q = new URLSearchParams({ limit: String(Math.min(50, Math.max(1, Number(limit) || 20))), lang: langOf(lang) });
    if (before && parseVersion(before)) q.set('before', before);
    return d.get<ChangelogPage>(`/v1/changelog?${q}`).then((p) => p ?? null);
  });
  d.handle('changelog:get', (v: string, lang?: string) => {
    if (!parseVersion(v)) return null;
    return d.get<LauncherRelease>(`/v1/changelog/${v}?lang=${langOf(lang)}`).then((r) => r ?? null);
  });
  // the version whose "Co nowego" opens at this start (null: none); once, not again when the page reloads
  d.handle('whatsnew:pending', () => {
    const pending = whatsNew;
    whatsNew = null;
    return pending;
  });
  d.handle('changelog:prefs', async (p: { seen?: string; whatsNew?: boolean }) => {
    const settings = d.settings();
    if (typeof p?.seen === 'string' && parseVersion(p.seen)) settings.changelogSeen = p.seen;
    if (typeof p?.whatsNew === 'boolean') settings.whatsNewAfterUpdate = p.whatsNew;
    await d.persist();
  });

  /** The older releases this launcher may go back to (rollbackCandidates says which and why). */
  async function candidates(lang: string): Promise<LauncherRelease[] | undefined> {
    const page = await d.get<ChangelogPage>(`/v1/changelog?limit=30&lang=${langOf(lang)}`);
    return page && rollbackCandidates(page.releases, version, process.platform);
  }
  d.handle('update:rollbackList', async (lang?: string) => {
    const releases = await candidates(langOf(lang));
    return releases ? { current: version, min: MIN_ROLLBACK_VERSION, packaged: app.isPackaged, os: process.platform, releases } : null;
  });
  d.handle('update:rollback', async (target: string) => {
    if (!parseVersion(target)) throw new Error('update:bad_version');
    if (!app.isPackaged) throw new Error('update:dev');
    if (!(await candidates('pl'))?.some((r) => r.version === target)) throw new Error('update:not_allowed');
    // the player's profiles, accounts and settings as they are now, before an older launcher touches them
    const backup = await backupForRollback(version, target);
    const status = await rollbackTo(target);
    return { backup, status };
  });
  d.handle('update:resume', () => resumeUpdates());
}
