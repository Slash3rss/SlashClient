import fs from 'node:fs/promises';
import path from 'node:path';

export interface CrashAnalysis {
  /** One-line summary shown as the heading. */
  title: string;
  /** What was found, in plain language. */
  details: string[];
  /** What the player can do about it. */
  fix?: string;
  /** Crash report written by the game for this run, if any. */
  crashReport?: string;
}

interface Rule {
  test: RegExp;
  explain: (m: RegExpMatchArray, text: string) => Omit<CrashAnalysis, 'crashReport'>;
}

/** Mod names Fabric/Quilt list as missing dependencies, e.g. "requires any version of fabric-api". */
function missingDependencies(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/requires (?:any version|version [^\n]*?) of (?:mod )?'?([\w\- ]+?)'?(?: \(([\w\-]+)\))?(?:,|\n| which is missing)/g)) out.add(m[2] ?? m[1].trim());
  return [...out].slice(0, 8);
}

const RULES: Rule[] = [
  {
    test: /java\.lang\.OutOfMemoryError/,
    explain: () => ({
      title: 'Grze zabrakło pamięci RAM',
      details: ['Java zgłosiła OutOfMemoryError, czyli przydzielona pamięć się skończyła.'],
      fix: 'Zwiększ ilość RAM w ustawieniach profilu (np. do 6–8 GB przy modpackach) albo zmniejsz liczbę modów i zasięg renderowania.',
    }),
  },
  {
    test: /Unsupported class file major version (\d+)/,
    explain: (m) => ({
      title: 'Mod loader nie obsługuje tej wersji Javy',
      details: [`Gra wymaga Javy ${Number(m[1]) - 44}, a loader albo któryś mod jest starszy i nie potrafi jej odczytać.`],
      fix: 'Zaktualizuj mod loader w profilu (np. Fabric zamiast Quilta dla wersji 26.x) i mody do wersji pod tę wersję gry.',
    }),
  },
  {
    test: /Incompatible mods? (?:found|set)|incompatible mod set|Mod resolution failed/i,
    explain: (_m, text) => {
      const missing = missingDependencies(text);
      return {
        title: 'Mody nie pasują do siebie',
        details: missing.length
          ? [`Brakuje wymaganych modów: ${missing.join(', ')}.`]
          : ['Loader wykrył niezgodne wersje modów albo brakującą zależność. Szczegóły są w logu poniżej.'],
        fix: missing.length
          ? 'Zainstaluj brakujące mody w zakładce Mody (Modrinth dociąga zależności sam przy instalacji).'
          : 'Zaktualizuj mody do wersji zgodnych z tą wersją gry albo wyłącz ostatnio dodane.',
      };
    },
  },
  {
    test: /Found duplicate mods?|Duplicate mods?/i,
    explain: () => ({
      title: 'Ten sam mod jest zainstalowany dwa razy',
      details: ['W folderze mods są dwie wersje tego samego moda.'],
      fix: 'Usuń starszą kopię w zakładce Mody → Zainstalowane.',
    }),
  },
  {
    test: /Mixin (?:apply|transformation) (?:failed|error)[^\n]*?(?:from mod |mod )([\w\-]+)/i,
    explain: (m) => ({
      title: `Mod „${m[1]}” nie działa z tą wersją gry`,
      details: [`Mod ${m[1]} próbował zmienić kod gry, który wygląda inaczej niż oczekiwał.`],
      fix: `Zaktualizuj albo wyłącz mod ${m[1]}.`,
    }),
  },
  {
    test: /zip END header not found|is not a valid mod file|ZipException|Invalid or corrupt jarfile/i,
    explain: () => ({
      title: 'Uszkodzony plik',
      details: ['Któryś plik .jar (mod albo biblioteka) jest uszkodzony lub niepełny.'],
      fix: 'Usuń i zainstaluj ponownie ostatnio dodane mody. Jeśli to nie pomoże, uruchom grę jeszcze raz, a launcher sprawdzi pliki.',
    }),
  },
  {
    test: /Could not find or load main class|ClassNotFoundException: net\.minecraft\.client\.main\.Main/,
    explain: () => ({
      title: 'Niepełna instalacja gry',
      details: ['Java nie znalazła głównej klasy Minecrafta.'],
      fix: 'Uruchom grę ponownie, żeby launcher dociągnął brakujące pliki.',
    }),
  },
  {
    test: /GLFW error 65542|Pixel format not accelerated|does not appear to support OpenGL|GLFW error 65543/i,
    explain: () => ({
      title: 'Problem ze sterownikami grafiki',
      details: ['Karta graficzna lub jej sterownik nie udostępnia wymaganej wersji OpenGL.'],
      fix: 'Zaktualizuj sterowniki karty graficznej. Na laptopach z dwiema kartami ustaw dla Javy kartę dedykowaną.',
    }),
  },
  {
    test: /EXCEPTION_ACCESS_VIOLATION|SIGSEGV|A fatal error has been detected by the Java Runtime/,
    explain: () => ({
      title: 'Gra wysypała się w kodzie natywnym',
      details: ['Błąd wystąpił poza Javą: najczęściej w sterowniku grafiki albo w modzie z kodem natywnym.'],
      fix: 'Zaktualizuj sterowniki grafiki. Jeśli używasz shaderów lub modów graficznych (Sodium, Iris), spróbuj bez nich.',
    }),
  },
];

/** Newest crash report written since `since` (epoch ms). */
async function latestCrashReport(gameDir: string, since: number): Promise<string | undefined> {
  const dir = path.join(gameDir, 'crash-reports');
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  let best: { file: string; mtime: number } | undefined;
  for (const f of files) {
    if (!f.endsWith('.txt')) continue;
    const file = path.join(dir, f);
    const { mtimeMs } = await fs.stat(file);
    if (mtimeMs >= since && (!best || mtimeMs > best.mtime)) best = { file, mtime: mtimeMs };
  }
  return best?.file;
}

/** Explains why the game stopped, using its output and any crash report from this run. */
export async function analyzeCrash(opts: {
  log: string[];
  gameDir: string;
  startedAt: number;
  code: number | null;
  signal: string | null;
}): Promise<CrashAnalysis> {
  const crashReport = await latestCrashReport(opts.gameDir, opts.startedAt);
  const reportText = crashReport ? await fs.readFile(crashReport, 'utf8').catch(() => '') : '';
  const text = `${opts.log.join('\n')}\n${reportText}`;

  for (const rule of RULES) {
    const m = text.match(rule.test);
    if (m) return { ...rule.explain(m, text), crashReport };
  }

  if (opts.signal === 'SIGKILL') {
    return {
      title: 'System zamknął grę',
      details: ['Proces gry został zabity przez system (SIGKILL), zwykle przez brak pamięci albo uszkodzoną Javę.'],
      fix: 'Zamknij inne programy albo zmniejsz RAM w profilu. Launcher sam sprawdza Javę przy następnym starcie.',
      crashReport,
    };
  }

  // Fabric crash reports name the mods that appear in the stack trace.
  const suspected = reportText.match(/Suspected Mods?: ([^\n]+)/)?.[1];
  const description = reportText.match(/Description: ([^\n]+)/)?.[1];
  const exception = text.match(/^([\w.$]+(?:Exception|Error))(?::\s*([^\n]+))?/m);
  const details: string[] = [];
  if (description) details.push(`Opis z crash reportu: ${description}`);
  if (exception) details.push(`Błąd: ${exception[1].split('.').pop()}${exception[2] ? `: ${exception[2].slice(0, 160)}` : ''}`);
  if (suspected && !/^None$/i.test(suspected.trim())) details.push(`Podejrzane mody: ${suspected.trim()}`);
  return {
    title: `Gra zakończyła się błędem${opts.code !== null ? ` (kod ${opts.code})` : opts.signal ? ` (${opts.signal})` : ''}`,
    details: details.length ? details : ['Nie rozpoznałem przyczyny. Szczegóły są w logu poniżej i w crash reporcie.'],
    fix: suspected && !/^None$/i.test(suspected.trim()) ? 'Wyłącz podejrzane mody w zakładce Mody i spróbuj ponownie.' : undefined,
    crashReport,
  };
}
