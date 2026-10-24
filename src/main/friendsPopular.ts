import type { InstalledItem } from './modrinth';
import type { SessionRecord } from './stats';

/**
 * What this launcher tells the server for "Popularne wśród znajomych" (server/src/friendsPopular.ts):
 * the Modrinth and CurseForge projects in the profiles (by site and project id, with the profile's
 * loader and game version) and the servers played on in the last 30 days. Never file names, and
 * nothing the sites do not recognise (jars added by hand stay on this computer). Who of the friends
 * gets to count it is the player's choice on the server ("Pokazuj znajomym, czego używam").
 *
 * The report goes only when it changed, a while after the last change (installing several mods is
 * one report) and at most every few minutes. An older server without the route answers 404: the
 * launcher stops sending until it restarts.
 */

export interface ReportedContent { source: 'modrinth' | 'curseforge'; id: string; type: InstalledItem['type']; loader: string; gameVersion: string }
export interface ReportedServer { address: string; at: number }
export interface PopularReport { content: ReportedContent[]; servers: ReportedServer[] }

/** Servers count this long after the last game on them. */
export const SERVER_DAYS = 30;
/** As the server keeps them at most (it drops the rest anyway). */
const MAX_CONTENT = 400;
const MAX_SERVERS = 30;
const SERVER_ADDRESS = /^[\w.-]{1,253}(:\d{1,5})?$/;

/** The recognised projects of every profile: enabled, with a project id from the site they came from. */
export function contentOf(profiles: { loader: string; gameVersion: string; items: InstalledItem[] }[]): ReportedContent[] {
  const out = new Map<string, ReportedContent>();
  for (const p of profiles) {
    for (const i of p.items) {
      // a file without a project id was added by hand (or the sites do not know it): it stays private
      if (!i.projectId || !i.enabled) continue;
      const source = i.source === 'curseforge' ? 'curseforge' : 'modrinth';
      const loader = p.loader === 'vanilla' ? '' : p.loader;
      const key = `${source}:${i.projectId}|${loader}|${p.gameVersion}`;
      if (!out.has(key)) out.set(key, { source, id: i.projectId, type: i.type, loader, gameVersion: p.gameVersion });
    }
  }
  return [...out.values()].sort((a, b) => `${a.source}:${a.id}|${a.loader}|${a.gameVersion}`.localeCompare(`${b.source}:${b.id}|${b.loader}|${b.gameVersion}`)).slice(0, MAX_CONTENT);
}

/** Servers joined in the last days (from the play history), each once with the last time, newest first. */
export function recentServers(sessions: Pick<SessionRecord, 'servers'>[], now = Date.now(), extra: ReportedServer[] = []): ReportedServer[] {
  const since = now - SERVER_DAYS * 86_400_000;
  const last = new Map<string, number>();
  for (const s of [...sessions.flatMap((x) => x.servers ?? []), ...extra]) {
    const address = String(s?.address ?? '').trim().toLowerCase().replace(/:25565$/, '');
    if (!SERVER_ADDRESS.test(address) || !(s.at >= since)) continue;
    last.set(address, Math.max(last.get(address) ?? 0, Math.min(s.at, now)));
  }
  return [...last].map(([address, at]) => ({ address, at })).sort((a, b) => b.at - a.at || a.address.localeCompare(b.address)).slice(0, MAX_SERVERS);
}

/** What says whether two reports are the same (times of servers rounded to the day, so a replay is not a change). */
export function reportKey(r: PopularReport): string {
  return JSON.stringify([r.content.map((c) => `${c.source}:${c.id}|${c.type}|${c.loader}|${c.gameVersion}`),
    r.servers.map((s) => `${s.address}|${Math.floor(s.at / 86_400_000)}`).sort()]);
}

export interface ReporterDeps {
  collect: () => Promise<PopularReport>;
  send: (report: PopularReport) => Promise<unknown>;
  /** Whether there is an account to send it as (signed out: nothing goes). */
  signedIn: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Quiet time after the last change before the report goes. */
  delayMs?: number;
  /** The least time between two reports. */
  minGapMs?: number;
}

/** Sends the report when it changed: `poke()` after anything that may have changed it. */
export class PopularReporter {
  private timer: unknown;
  private lastKey = '';
  private lastSentAt = -Infinity;
  private running = false;
  private again = false;
  /** The server has no such route (older): nothing more is sent. */
  unsupported = false;
  private readonly d: Required<ReporterDeps>;

  constructor(deps: ReporterDeps) {
    this.d = {
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      delayMs: 30_000,
      minGapMs: 5 * 60_000,
      ...deps,
    } as Required<ReporterDeps>;
  }

  /** Something may have changed: a report goes after the quiet time (and the gap since the last one). */
  poke() {
    if (this.unsupported) return;
    if (this.running) {
      this.again = true;
      return;
    }
    if (this.timer !== undefined) this.d.clearTimer(this.timer);
    const wait = Math.max(this.d.delayMs, this.lastSentAt + this.d.minGapMs - this.d.now());
    this.timer = this.d.setTimer(() => void this.run(), wait);
  }

  /** The account changed (signed out or in as someone else): the next report goes even if the same. */
  reset() {
    this.lastKey = '';
  }

  /** Collects and sends now if it changed; resolves when done. */
  async run() {
    this.timer = undefined;
    if (this.unsupported || !this.d.signedIn()) return;
    this.running = true;
    try {
      const report = await this.d.collect();
      const key = reportKey(report);
      if (key === this.lastKey) return;
      this.lastSentAt = this.d.now();
      await this.d.send(report);
      this.lastKey = key;
    } catch (err) {
      const status = (err as { httpStatus?: number }).httpStatus;
      if (status === 404) this.unsupported = true;
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.poke();
      }
    }
  }
}
