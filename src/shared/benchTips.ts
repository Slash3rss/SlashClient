/**
 * Advice from a benchmark run: what held the FPS back and what would help, with the
 * performance mods (Modrinth slugs from perfmods.ts) that fix it, when they are missing.
 */

export interface BenchRun {
  fps: { avg: number; low1: number; median: number };
  frames: number;
  stutters: number;
  cpu?: number;
  gpu?: number;
  settings: { renderDistance: number; simulationDistance?: number; width: number; height: number; vsync: boolean; maxFps: number; memoryMb?: number };
}

/** The SlashClient test scene's parts, by the id the mod writes; Polish names, keys for t(). */
export const BENCH_SCENES: Record<string, string> = {
  forest: 'Las',
  panorama: 'Panorama',
  village: 'Wioska',
  water: 'Woda',
  entities: 'Stworzenia',
  particles: 'Cząsteczki',
  night: 'Noc',
};

/**
 * The run before `runs[index]` (newest first) that it can be compared with: test scene runs only
 * with test scene runs (`scene` set by the mod), runs in the player's own worlds with each other.
 */
export function comparableBefore<R extends { scene?: string }>(runs: R[], index: number): R | undefined {
  const kind = runs[index]?.scene ?? '';
  return runs.slice(index + 1).find((r) => (r.scene ?? '') === kind);
}

export interface BenchTip {
  id: string;
  level: 'good' | 'info' | 'warn';
  /** Polish text, the key for t(); {0}… filled from `args`. */
  text: string;
  args?: (string | number)[];
  /** Mods that help, by Modrinth slug; shown only while they are not installed. */
  mods?: string[];
}

/** Common refresh rates: a median right at one of them means VSync holds the FPS. */
const REFRESH = [30, 60, 75, 90, 100, 120, 144, 165, 170, 180, 240];

/**
 * `missing`: slugs of the profile's performance mods that are not installed (empty when all
 * are there); null when the profile has no mod loader, so no mods can be offered.
 */
export function benchTips(run: BenchRun, missing: string[] | null): BenchTip[] {
  const tips: BenchTip[] = [];
  const s = run.settings;
  const lacks = (slugs: string[]) => (missing ? slugs.filter((m) => missing.includes(m)) : []);
  const capped = s.vsync && REFRESH.some((r) => Math.abs(run.fps.median - r) <= r * 0.04);
  const limited = s.maxFps < 260 && run.fps.median >= s.maxFps * 0.95;

  if (capped) tips.push({ id: 'vsync', level: 'info', text: 'FPS trzyma VSync na częstotliwości monitora ({0} Hz). Wyłącz go w opcjach grafiki, żeby zobaczyć pełną wydajność.', args: [Math.round(run.fps.median)] });
  else if (limited) tips.push({ id: 'limit', level: 'info', text: 'FPS trzyma limit klatek z opcji gry ({0}). Ustaw „Bez limitu”, żeby zmierzyć pełną wydajność.', args: [s.maxFps] });

  const stuttery = run.fps.low1 < run.fps.avg * 0.45 || run.stutters > run.frames * 0.02;
  if (stuttery) {
    const mods = lacks(['sodium', 'ferrite-core', 'immediatelyfast']);
    tips.push({ id: 'stutter', level: 'warn', text: 'Gra często się przycina: 1% low ({0} FPS) jest dużo niżej niż średnia.', args: [Math.round(run.fps.low1)], mods });
    if (s.memoryMb !== undefined && s.memoryMb < 3072) tips.push({ id: 'memory', level: 'warn', text: 'Gra ma tylko {0} MB pamięci. Daj jej 4096 MB w ustawieniach profilu: mniej przycięć od sprzątania pamięci.', args: [s.memoryMb] });
  }

  if (!capped && !limited) {
    if (run.gpu !== undefined && run.gpu >= 90) {
      tips.push({ id: 'gpu', level: 'warn', text: 'Karta graficzna pracuje na {0}%: to ona ogranicza FPS. Zmniejsz zasięg renderowania albo rozdzielczość.', args: [Math.round(run.gpu)], mods: lacks(['sodium', 'entityculling']) });
    } else if (run.gpu !== undefined && run.gpu > 0 && run.gpu < 55 && run.fps.avg < 120) {
      const sim = s.simulationDistance !== undefined && s.simulationDistance > 8;
      tips.push({ id: 'cpu', level: 'warn', text: sim ? 'Karta graficzna czeka (GPU {0}%): ogranicza procesor. Pomoże mniejszy zasięg symulacji ({1}) i lżejsza logika gry.' : 'Karta graficzna czeka (GPU {0}%): ogranicza procesor. Pomoże lżejsza logika gry.',
        args: sim ? [Math.round(run.gpu), s.simulationDistance!] : [Math.round(run.gpu)], mods: lacks(['lithium', 'sodium', 'entityculling']) });
    }
  }

  if (run.fps.avg < 60 && s.renderDistance > 12 && !tips.some((t) => t.id === 'gpu')) {
    tips.push({ id: 'distance', level: 'warn', text: 'Zasięg renderowania {0} przy niskim FPS: spróbuj 10–12 chunków.', args: [s.renderDistance] });
  }

  // each mod is offered once, by the first tip it helps with
  const seen = new Set<string>();
  for (const tip of tips) {
    if (!tip.mods) continue;
    tip.mods = tip.mods.filter((m) => !seen.has(m));
    tip.mods.forEach((m) => seen.add(m));
  }

  if (missing === null) {
    tips.push({ id: 'loader', level: 'info', text: 'Ten profil nie ma mod loadera. Ustaw Fabric w ustawieniach profilu, żeby dodać mody wydajności (Sodium, Lithium…), zwykle dają kilkadziesiąt procent FPS.' });
  } else {
    // the big one: offered on its own when nothing above already offers it
    const offered = new Set(tips.flatMap((t) => t.mods ?? []));
    const rest = lacks(['sodium', 'lithium', 'ferrite-core', 'entityculling']).filter((m) => !offered.has(m));
    if (rest.length) tips.push({ id: 'mods', level: 'info', text: 'Brakuje modów wydajności, które zwykle dają najwięcej FPS.', mods: rest });
  }

  if (!tips.some((t) => t.level === 'warn')) tips.unshift({ id: 'good', level: 'good', text: 'Wygląda dobrze: równe klatki i nic wyraźnie nie hamuje gry.' });
  return tips;
}
