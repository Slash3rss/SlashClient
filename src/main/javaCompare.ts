import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readBenchmarks, type BenchmarkResult } from './benchmark';
import type { JavaChoice } from './javaVendors';
import { profileGameDir, type Profile } from './store';
import { t } from '../shared/i18n';
import { effectiveJavaVendor, isJavaVendor, JAVA_VENDOR_NAMES, type JavaVendor } from '../shared/javaVendors';

/**
 * "Porównaj w benchmarku": the SlashClient test scene twice in a row, on the profile's Java and on
 * the one picked, then the measured difference (average FPS and 1% low). The game closes by itself
 * after each run. The last comparisons are kept in the profile's config folder.
 */

export interface CompareRun {
  vendor: JavaVendor;
  release?: string;
  java: string;
  result: BenchmarkResult;
}

export interface JavaComparison {
  at: number;
  version: string;
  runs: [CompareRun, CompareRun];
  /** Percent change from the first run to the second one. */
  avgChange: number;
  low1Change: number;
}

const pct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : 0);

export function compareRuns(first: CompareRun, second: CompareRun): JavaComparison {
  return {
    at: second.result.at, version: second.result.version, runs: [first, second],
    avgChange: pct(second.result.fps.avg, first.result.fps.avg), low1Change: pct(second.result.fps.low1, first.result.fps.low1),
  };
}

const FILE = (gameDir: string) => path.join(gameDir, 'config', 'slashclient-java-compare.json');

export async function readComparisons(gameDir: string): Promise<JavaComparison[]> {
  try {
    const data = JSON.parse(await fs.readFile(FILE(gameDir), 'utf8'));
    return (Array.isArray(data) ? data : []).filter((c) => c && Array.isArray(c.runs) && c.runs.length === 2 && isJavaVendor(c.runs[0]?.vendor) && isJavaVendor(c.runs[1]?.vendor));
  } catch {
    return [];
  }
}

async function saveComparison(gameDir: string, c: JavaComparison): Promise<void> {
  const list = [c, ...(await readComparisons(gameDir))].slice(0, 5);
  await fs.mkdir(path.dirname(FILE(gameDir)), { recursive: true });
  await fs.writeFile(FILE(gameDir), JSON.stringify(list, null, 2));
}

type Handle = <T extends unknown[], R>(channel: string, fn: (...args: T) => Promise<R> | R) => void;

export interface CompareDeps {
  handle: Handle;
  send: (channel: string, payload: unknown) => void;
  profile: (id: string) => Profile | undefined;
  defaultVendor: () => string | undefined;
  running: (profileId: string) => boolean;
  /** Starts the test scene on that Java (the game closes after the run). */
  launch: (profileId: string, accountId: string, vendor: JavaVendor, onJava: (choice: JavaChoice) => void) => Promise<void>;
  child: (profileId: string) => ChildProcess | undefined;
  /** Stops the game as the player would (no crash report). */
  kill: (profileId: string) => void;
}

export function registerJavaCompare(d: CompareDeps): void {
  const busy = new Set<string>();

  /** One test scene run on `vendor`: its result, once the game has closed. */
  async function runOnce(profile: Profile, accountId: string, vendor: JavaVendor): Promise<CompareRun> {
    const gameDir = profileGameDir(profile);
    const before = (await readBenchmarks(gameDir))[0]?.at ?? 0;
    let choice: JavaChoice | undefined;
    await d.launch(profile.id, accountId, vendor, (c) => (choice = c));
    const child = d.child(profile.id);
    // the Java asked for was not there (the launch said why): a run on Mojang's again would compare nothing
    if (choice && choice.vendor !== vendor) {
      d.kill(profile.id);
      throw new Error(t('Porównanie przerwane: gra uruchomiła się na Javie od Mojang zamiast {0}.', t(JAVA_VENDOR_NAMES[vendor])));
    }
    if (child && child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve));
    const result = (await readBenchmarks(gameDir))[0];
    if (!result || result.at <= before || !result.scene) throw new Error(t('Pomiar na Javie {0} się nie skończył (gra zamknięta przed końcem sceny?).', t(JAVA_VENDOR_NAMES[vendor])));
    return { vendor, release: choice?.release, java: choice?.java ?? '', result };
  }

  d.handle('javaCompare:run', async (profileId: string, accountId: string, other: string) => {
    const profile = d.profile(profileId);
    if (!profile) throw new Error(t('Nie znaleziono profilu.'));
    if (profile.javaPath) throw new Error(t('Ten profil ma własną ścieżkę do Javy: porównanie działa z Javą pobieraną przez launcher.'));
    if (!isJavaVendor(other)) throw new Error(t('Wybierz Javę do porównania.'));
    const current = effectiveJavaVendor(profile.javaVendor, d.defaultVendor());
    if (other === current) throw new Error(t('Wybierz inną Javę niż ta, na której gra ten profil.'));
    if (d.running(profileId) || busy.has(profileId)) throw new Error(t('Ten profil już działa.'));
    busy.add(profileId);
    try {
      const runs: CompareRun[] = [];
      for (const [i, vendor] of [current, other].entries()) {
        d.send('javaCompare:progress', { profileId, step: i + 1, steps: 2, vendor });
        runs.push(await runOnce(profile, accountId, vendor));
      }
      const comparison = compareRuns(runs[0], runs[1]);
      await saveComparison(profileGameDir(profile), comparison).catch(() => {});
      return comparison;
    } finally {
      busy.delete(profileId);
    }
  });

  d.handle('javaCompare:list', (profileId: string) => {
    const profile = d.profile(profileId);
    return profile ? readComparisons(profileGameDir(profile)) : [];
  });
}
