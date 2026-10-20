/**
 * What the home page (/ and /en) says, edited in the admin panel's "Strona główna": the schema the
 * editor is built from and the server checks against, the defaults (exactly what the page said
 * before it could be edited), and the tiny inline markup the longer texts may use.
 *
 * Admin text is plain text: everything is escaped when the page is made. Fields marked `md` also
 * understand **bold** and [text](link) with the same links as the link fields (#anchor, /path, https://…).
 */

export const LANGS = ['pl', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (l: string): l is Lang => (LANGS as readonly string[]).includes(l);

export type Field =
  | { t: 'text'; label: string; max: number; lines?: number; md?: boolean; req?: boolean; hint?: string }
  | { t: 'link' | 'image' | 'icon'; label: string; req?: boolean; hint?: string }
  | { t: 'anchor'; label: string; hint?: string }
  | { t: 'bool'; label: string; hint?: string }
  | { t: 'choice'; label: string; options: [string, string][]; hint?: string }
  | { t: 'strings'; label: string; max: number; itemMax: number; hint?: string }
  | { t: 'list'; label: string; max: number; item: Fields; title: string; hint?: string };
/** The fields of a section or a list's item, in the editor's order. */
export type Fields = Record<string, Field>;
export interface Section { id: string; name: string; icon: string; hint?: string; fields: Fields }

export type Value = string | boolean | string[] | Item[];
export type Item = Record<string, Value>;
export type Content = Record<string, Item>;

const text = (label: string, max: number, extra: Partial<Extract<Field, { t: 'text' }>> = {}): Field => ({ t: 'text', label, max, ...extra });
const MD = 'Można użyć **pogrubienia** i [linków](/adres).';

export const SECTIONS: Section[] = [
  {
    id: 'meta', name: 'Wyszukiwarki i podgląd linku', icon: 'fa-solid fa-magnifying-glass',
    hint: 'Tytuł karty, opis w Google i to, co pokazuje Discord, Facebook czy X po wklejeniu linku.',
    fields: {
      title: text('Tytuł strony', 120, { req: true }),
      description: text('Opis (Google, podgląd linku)', 300, { lines: 2, req: true }),
      appDescription: text('Opis aplikacji (dane strukturalne dla Google)', 300, { lines: 2 }),
      keywords: text('Słowa kluczowe (po przecinku)', 300),
      image: { t: 'image', label: 'Obrazek podglądu linku', hint: 'Najlepiej 1200×630 px.' },
      imageAlt: text('Opis obrazka podglądu', 200),
    },
  },
  {
    id: 'nav', name: 'Pasek nawigacji', icon: 'fa-solid fa-bars',
    fields: {
      links: { t: 'list', label: 'Linki', max: 10, title: 'label', item: {
        label: text('Tekst', 40, { req: true }),
        href: { t: 'link', label: 'Adres', req: true, hint: '#sekcja na tej stronie, /adres w serwisie albo https://…' },
        icon: { t: 'icon', label: 'Ikona (opcjonalnie)' },
        accent: { t: 'bool', label: 'Wyróżniony (kolor jak „Wesprzyj”)' },
      } },
      admin: text('Przycisk panelu admina (widzą go tylko admini)', 40, { req: true }),
      account: text('Przycisk konta (niezalogowany)', 40, { req: true }),
      accountTitle: text('Podpowiedź przycisku konta', 60),
      download: text('Przycisk „Pobierz”', 40, { req: true }),
    },
  },
  {
    id: 'hero', name: 'Nagłówek (na górze strony)', icon: 'fa-solid fa-heading',
    fields: {
      pillShow: { t: 'bool', label: 'Pokaż plakietkę „Nowość” nad tytułem' },
      pillText: text('Plakietka: tekst', 80),
      pillHref: { t: 'link', label: 'Plakietka: link' },
      titleBefore: text('Tytuł: początek', 60, { hint: 'Spacje na końcu się liczą.' }),
      titleHighlight: text('Tytuł: wyróżnione słowo (gradient)', 40),
      titleAfter: text('Tytuł: koniec', 60),
      lead: text('Opis pod tytułem', 400, { lines: 3, md: true, hint: MD }),
      download: text('Przycisk pobierania', 60, { req: true, hint: '{os} zamienia się na system odwiedzającego (Windows, macOS, Linux).' }),
      otherSystems: text('Linki do innych systemów: początek', 40),
      phoneLabel: text('Przycisk na telefonie', 60, { req: true }),
      phoneNote: text('Notka na telefonie', 200, { lines: 2 }),
      secondaryLabel: text('Drugi przycisk: tekst', 40, { hint: 'Pusty ukrywa przycisk.' }),
      secondaryHref: { t: 'link', label: 'Drugi przycisk: link' },
      secondaryIcon: { t: 'icon', label: 'Drugi przycisk: ikona' },
      image: { t: 'image', label: 'Zrzut ekranu', req: true, hint: 'Najlepiej 1600×900 px.' },
      imageAlt: text('Opis zrzutu ekranu', 200),
    },
  },
  {
    id: 'showcase', name: 'Funkcje (bloki ze zrzutami)', icon: 'fa-solid fa-table-columns',
    hint: 'Bloki układają się na przemian: tekst z lewej, potem z prawej. Blok „Kosmetyki” pokazuje peleryny ze sklepu i postać 3D (może być tylko jeden).',
    fields: {
      eyebrow: text('Nadtytuł', 40),
      title: text('Tytuł', 80),
      blocks: { t: 'list', label: 'Bloki', max: 12, title: 'title', item: {
        kind: { t: 'choice', label: 'Rodzaj', options: [['media', 'Tekst i zrzuty ekranu'], ['cosmetics', 'Kosmetyki (peleryny i postać 3D)']] },
        anchor: { t: 'anchor', label: 'Kotwica (#adres)', hint: 'Małe litery, cyfry i myślniki; np. „hud” daje link #hud.' },
        icon: { t: 'icon', label: 'Ikona plakietki', req: true },
        tag: text('Plakietka', 40),
        title: text('Tytuł', 120, { req: true }),
        text: text('Tekst', 600, { lines: 3, md: true, hint: MD }),
        bullets: { t: 'strings', label: 'Punkty z ptaszkiem (każdy w nowej linii)', max: 8, itemMax: 160 },
        image: { t: 'image', label: 'Zrzut ekranu (duży)', hint: 'Dla „Kosmetyki” pomijany.' },
        imageAlt: text('Opis dużego zrzutu', 200),
        image2: { t: 'image', label: 'Drugi zrzut (mały, na dużym)' },
        image2Alt: text('Opis drugiego zrzutu', 200),
        buttonLabel: text('Przycisk: tekst', 40, { hint: 'Pusty ukrywa przycisk.' }),
        buttonHref: { t: 'link', label: 'Przycisk: link' },
        buttonIcon: { t: 'icon', label: 'Przycisk: ikona' },
      } },
    },
  },
  {
    id: 'modules', name: 'Moduły HUD (przewijane paski)', icon: 'fa-solid fa-grip',
    hint: 'Moduły dzielą się na dwa paski przewijane w przeciwne strony.',
    fields: {
      eyebrow: text('Nadtytuł', 40),
      title: text('Tytuł', 80),
      items: { t: 'list', label: 'Moduły', max: 80, title: 'name', item: {
        icon: { t: 'icon', label: 'Ikona', req: true },
        name: text('Nazwa', 40, { req: true }),
      } },
    },
  },
  {
    id: 'features', name: 'Więcej w launcherze (kafelki)', icon: 'fa-solid fa-table-cells-large',
    fields: {
      eyebrow: text('Nadtytuł', 40),
      title: text('Tytuł', 80),
      items: { t: 'list', label: 'Kafelki', max: 24, title: 'title', item: {
        icon: { t: 'icon', label: 'Ikona', req: true },
        title: text('Tytuł', 80, { req: true }),
        text: text('Tekst', 300, { lines: 2, md: true, hint: MD }),
      } },
    },
  },
  {
    id: 'faq', name: 'FAQ', icon: 'fa-solid fa-circle-question',
    fields: {
      eyebrow: text('Nadtytuł', 40),
      title: text('Tytuł', 80),
      openFirst: { t: 'bool', label: 'Pierwsze pytanie rozwinięte' },
      items: { t: 'list', label: 'Pytania', max: 40, title: 'q', item: {
        q: text('Pytanie', 200, { req: true }),
        a: text('Odpowiedź', 1500, { lines: 4, md: true, req: true, hint: MD }),
      } },
    },
  },
  {
    id: 'final', name: 'Pobieranie (na dole strony)', icon: 'fa-solid fa-download',
    fields: {
      title: text('Tytuł', 80, { req: true }),
      text: text('Tekst', 300, { lines: 2, md: true, hint: MD }),
      button: text('Przycisk', 60, { req: true }),
    },
  },
  {
    id: 'footer', name: 'Stopka', icon: 'fa-solid fa-shoe-prints',
    hint: 'Linki do regulaminu i polityki prywatności są zawsze w stopce; tu zmienisz tylko ich nazwy.',
    fields: {
      note: text('Notka', 200),
      links: { t: 'list', label: 'Linki', max: 10, title: 'label', item: {
        label: text('Tekst', 40, { req: true }),
        href: { t: 'link', label: 'Adres', req: true },
        icon: { t: 'icon', label: 'Ikona (opcjonalnie)' },
      } },
      terms: text('Nazwa linku do regulaminu', 60, { req: true }),
      privacy: text('Nazwa linku do polityki prywatności', 60, { req: true }),
      langShow: { t: 'bool', label: 'Link do drugiej wersji językowej' },
      langLabel: text('Tekst linku do drugiej wersji językowej', 40),
    },
  },
];
export const SECTION_IDS = SECTIONS.map((s) => s.id);
export const sectionOf = (id: string) => SECTIONS.find((s) => s.id === id);

// ---------- the defaults: what the page said before it could be edited ----------

const nav = (label: string, href: string, icon = '', accent = false): Item => ({ label, href, icon, accent });
const link = (label: string, href: string, icon = ''): Item => ({ label, href, icon });
const block = (b: Partial<Record<string, Value>>): Item => ({
  kind: 'media', anchor: '', icon: 'fa-solid fa-star', tag: '', title: '', text: '', bullets: [], image: '', imageAlt: '', image2: '', image2Alt: '',
  buttonLabel: '', buttonHref: '', buttonIcon: '', ...b,
} as Item);
const MODULE_ICONS = [
  'gauge-high', 'wifi', 'computer-mouse', 'keyboard', 'shield-halved', 'flask', 'location-crosshairs', 'compass',
  'crosshairs', 'magnifying-glass-plus', 'eye', 'circle-half-stroke', 'skull', 'burst', 'ruler', 'bullseye',
  'microchip', 'display', 'memory', 'stopwatch', 'chart-line', 'network-wired', 'clock', 'hourglass-half',
  'plane', 'feather-pointed', 'screwdriver-wrench', 'cube', 'sun', 'tree', 'person-running', 'location-dot',
  'comments', 'camera', 'user-group', 'list-ol',
];
const modules = (names: string[]): Item[] => names.map((name, i) => ({ icon: `fa-solid fa-${MODULE_ICONS[i]}`, name }));
const FEATURE_ICONS = ['users-gear', 'puzzle-piece', 'file-import', 'shirt', 'server', 'earth-europe', 'triangle-exclamation', 'rotate'];
const features = (list: [string, string][]): Item[] => list.map(([title, t], i) => ({ icon: `fa-solid fa-${FEATURE_ICONS[i]}`, title, text: t }));
const faq = (list: [string, string][]): Item[] => list.map(([q, a]) => ({ q, a }));

export const DEFAULTS: Record<Lang, Content> = {
  pl: {
    meta: {
      title: 'SlashClient – Launcher Minecraft z HUD-em i znajomymi',
      description: 'Darmowy launcher Minecraft z własnym HUD-em, znajomymi, kosmetykami, benchmarkiem FPS i klipami. Windows, macOS i Linux.',
      appDescription: 'Darmowy launcher Minecraft z własnym HUD-em, znajomymi, kosmetykami, benchmarkiem FPS i klipami.',
      keywords: 'launcher minecraft, minecraft client, hud minecraft, fabric, peleryny minecraft, kosmetyki minecraft, benchmark fps, slashclient',
      image: '/img/og.jpg',
      imageAlt: 'SlashClient – Minecraft, tylko lepiej. Launcher z HUD-em, znajomymi i kosmetykami.',
    },
    nav: {
      links: [nav('Funkcje', '#funkcje'), nav('HUD', '#hud'), nav('Kosmetyki', '#kosmetyki'), nav('FAQ', '#faq'), nav('Zgłoszenia', '/zgloszenia'),
        nav('Wesprzyj', '/wsparcie', 'fa-solid fa-heart', true)],
      admin: 'Panel admina', account: 'Zaloguj się', accountTitle: 'Twoje konto', download: 'Pobierz',
    },
    hero: {
      pillShow: true, pillText: 'Nowość: peleryny, emotki i klipy', pillHref: '#kosmetyki',
      titleBefore: 'Minecraft, tylko ', titleHighlight: 'lepiej', titleAfter: '.',
      lead: 'Darmowy launcher Minecraft z własnym HUD-em, znajomymi, pelerynami, benchmarkiem FPS i klipami. Bez szukania i instalowania modów.',
      download: 'Pobierz dla {os}', otherSystems: 'Inne systemy:',
      phoneLabel: 'SlashClient działa na komputerze', phoneNote: 'Otwórz tę stronę na komputerze z Windows, macOS lub Linuksem, żeby pobrać launcher.',
      secondaryLabel: 'Zobacz, co potrafi', secondaryHref: '#funkcje', secondaryIcon: 'fa-solid fa-play',
      image: '/img/hero-menu.jpg', imageAlt: 'Menu główne SlashClient w grze',
    },
    showcase: {
      eyebrow: 'Funkcje', title: 'Co jest w środku',
      blocks: [
        block({ anchor: 'hud', icon: 'fa-solid fa-gauge-high', tag: 'HUD', title: 'HUD, który ustawisz po swojemu',
          text: 'Ponad 40 modułów: FPS, ping, CPS, zbroja, efekty, klawisze, kompas, zabójstwa i więcej. Ustawiasz je myszką w edytorze (prawy Shift), a układ udostępniasz kodem.',
          bullets: ['Własne celowniki, zoom, freelook, fullbright', 'Zakładki czatu z filtrami i wyszukiwaniem'],
          image: '/img/hud-game.jpg', imageAlt: 'HUD SlashClient w grze', image2: '/img/hud-editor.jpg', image2Alt: 'Edytor HUD' }),
        block({ anchor: 'znajomi', icon: 'fa-solid fa-user-group', tag: 'Znajomi', title: 'Znajomi i zaproszenia do gry',
          text: 'Widzisz, kto jest online i na jakim serwerze gra. Piszesz w launcherze albo w grze, a „Zaproś” daje znajomemu przycisk „Dołącz”, który przenosi go na Twój serwer.',
          bullets: ['Konto zakłada się samo, razem z kontem Minecraft', 'Wiadomości szyfrowane od nadawcy do odbiorcy', 'Czat w grze pod klawiszem O'],
          image: '/img/friends-launcher.jpg', imageAlt: 'Znajomi i zaproszenia w launcherze', image2: '/img/friends-game.jpg', image2Alt: 'Zaproszenie w grze' }),
        block({ kind: 'cosmetics', anchor: 'kosmetyki', icon: 'fa-solid fa-wand-magic-sparkles', tag: 'Kosmetyki', title: 'Peleryny, skrzydła, pupile i emotki',
          text: 'Peleryny (też animowane), skrzydła, elytry, ślady, aury i pupile widzą gracze z SlashClient na każdym serwerze. Emotki wybierasz z koła pod klawiszem N. Obróć postać myszką.',
          buttonLabel: 'Wybierz pelerynę', buttonHref: '/konto', buttonIcon: 'fa-solid fa-wand-magic-sparkles' }),
        block({ anchor: 'benchmark', icon: 'fa-solid fa-chart-column', tag: 'Wydajność', title: 'Benchmark FPS z poradami',
          text: '30-sekundowy test w Twoim świecie: średnie FPS, 1% low i przycięcia. Launcher porównuje wyniki, mówi, co poprawić, i instaluje brakujące mody wydajności jednym kliknięciem.',
          bullets: ['Wykres czasów klatek i porównanie wyników', 'Sodium, Lithium i inne mody jednym kliknięciem'],
          image: '/img/bench-launcher.jpg', imageAlt: 'Porady po benchmarku w launcherze', image2: '/img/bench-game.jpg', image2Alt: 'Wynik benchmarku w grze' }),
        block({ anchor: 'klipy', icon: 'fa-solid fa-film', tag: 'Klipy', title: 'Klipy pod F8',
          text: 'F8 zapisuje ostatnie 10–60 sekund gry jako film, bez OBS-a. Klipy są w launcherze, w zakładce profilu.',
          image: '/img/clips-launcher.jpg', imageAlt: 'Klipy w launcherze' }),
      ],
    },
    modules: {
      eyebrow: 'Moduły', title: 'Moduły HUD',
      items: modules(['FPS', 'Ping', 'CPS', 'Keystrokes', 'Zbroja', 'Efekty', 'Koordynaty', 'Kompas', 'Celowniki', 'Zoom', 'Freelook', 'Fullbright',
        'K/D', 'Combo', 'Reach', 'Cel', 'CPU', 'GPU', 'RAM', 'TPS', 'Wykres FPS', 'Sieć', 'Zegar', 'Sesja',
        'Elytra', 'Strzały', 'Wytrzymałość', 'Blok', 'Pora dnia', 'Biom', 'Sprint', 'Punkty drogi', 'Zakładki czatu', 'Zrzuty do schowka', 'Znajomi online', 'Scoreboard']),
    },
    features: {
      eyebrow: 'Launcher', title: 'Więcej w launcherze',
      items: features([
        ['Wiele kont', 'Konta Microsoft i offline; przełączasz je także w grze, bez restartu.'],
        ['Mody z Modrinth', 'Mody, paczki i zasoby dobrane do wersji profilu.'],
        ['Import profili', 'Profile z Prism, MultiMC, CurseForge, Modrinth App i oficjalnego launchera.'],
        ['Skiny', 'Edytor skina, biblioteka skinów i podgląd 3D.'],
        ['Serwery', 'Opis, liczba graczy i ping; wejście jednym kliknięciem.'],
        ['Światy', 'Kopie zapasowe światów, zrzuty ekranu i klipy.'],
        ['Crashe', 'Launcher czyta log i mówi, co poszło nie tak.'],
        ['Aktualizacje', 'Launcher sam sprawdza i instaluje nowe wersje.'],
      ]),
    },
    faq: {
      eyebrow: 'FAQ', title: 'Częste pytania', openFirst: true,
      items: faq([
        ['Ile kosztuje SlashClient?', 'Nic. Launcher, HUD, znajomi i peleryny są darmowe.'],
        ['Czy dostanę bana za SlashClient?', 'HUD pokazuje tylko to, co gra i tak wie, i nie daje przewagi jak cheaty. Serwery mają jednak własne zasady: jeśli serwer zabrania np. freelooka, wyłącz go w ustawieniach HUD.'],
        ['Na jakich wersjach działa HUD?', 'Minecraft 1.21.11 oraz 26.1–26.3, z Fabricem albo bez. Starsze wersje launcher też uruchomi, ale bez HUD-u.'],
        ['Czy działa z Sodium i innymi modami?', 'Tak. HUD to zwykły mod Fabric i działa razem z modami wydajności.'],
        ['Czy moje konto jest bezpieczne?', 'Do Microsoftu logujesz się na jego stronie, launcher nie widzi hasła. Konto SlashClient potwierdza Mojang, tak jak serwery Minecrafta, więc Twój token Minecrafta nie trafia na serwer SlashClient. Wiadomości do znajomych są szyfrowane i serwer nie może ich przeczytać.'],
        ['macOS mówi, że nie może sprawdzić aplikacji. Co zrobić?', 'SlashClient nie jest jeszcze podpisany przez Apple. Kliknij aplikację prawym przyciskiem, wybierz Otwórz i potwierdź. Wystarczy raz.'],
        ['Jak zaktualizować launcher?', 'Na Windowsie i Linuksie nowa wersja pobiera się sama i instaluje przy ponownym uruchomieniu. Na Macu launcher pokaże przycisk Pobierz.'],
        ['Kto widzi moją pelerynę?', 'Gracze z SlashClient, na każdym serwerze. Pozostali widzą Twój zwykły wygląd.'],
      ]),
    },
    final: { title: 'Pobierz SlashClient', text: 'Za darmo, na Windows, macOS i Linux.', button: 'Pobierz SlashClient' },
    footer: {
      note: 'Nie jest powiązany z Mojang ani Microsoft.',
      links: [link('Zgłoś błąd', '/zgloszenia'), link('Twoje konto', '/konto'), link('Wesprzyj projekt', '/wsparcie', 'fa-solid fa-heart')],
      terms: 'Regulamin', privacy: 'Polityka prywatności', langShow: true, langLabel: 'English',
    },
  },
  en: {
    meta: {
      title: 'SlashClient – Minecraft launcher with a HUD and friends',
      description: 'A free Minecraft launcher with its own HUD, friends, cosmetics, an FPS benchmark and clips. Windows, macOS and Linux.',
      appDescription: 'A free Minecraft launcher with its own HUD, friends, cosmetics, an FPS benchmark and clips.',
      keywords: 'minecraft launcher, minecraft client, minecraft hud, fabric, minecraft capes, minecraft cosmetics, fps benchmark, slashclient',
      image: '/img/og.jpg',
      imageAlt: 'SlashClient – Minecraft, only better. A launcher with a HUD, friends and cosmetics.',
    },
    nav: {
      links: [nav('Features', '#funkcje'), nav('HUD', '#hud'), nav('Cosmetics', '#kosmetyki'), nav('FAQ', '#faq'), nav('Bug reports', '/bugs'),
        nav('Support us', '/support', 'fa-solid fa-heart', true)],
      admin: 'Admin panel', account: 'Sign in', accountTitle: 'Your account', download: 'Download',
    },
    hero: {
      pillShow: true, pillText: 'New: capes, emotes and clips', pillHref: '#kosmetyki',
      titleBefore: 'Minecraft, only ', titleHighlight: 'better', titleAfter: '.',
      lead: 'A free Minecraft launcher with its own HUD, friends, capes, an FPS benchmark and clips. No hunting for mods and installing them.',
      download: 'Download for {os}', otherSystems: 'Other systems:',
      phoneLabel: 'SlashClient runs on a computer', phoneNote: 'Open this page on a Windows, macOS or Linux computer to download the launcher.',
      secondaryLabel: 'See what it can do', secondaryHref: '#funkcje', secondaryIcon: 'fa-solid fa-play',
      image: '/img/hero-menu.jpg', imageAlt: 'SlashClient main menu in the game',
    },
    showcase: {
      eyebrow: 'Features', title: 'What is inside',
      blocks: [
        block({ anchor: 'hud', icon: 'fa-solid fa-gauge-high', tag: 'HUD', title: 'A HUD you set up your way',
          text: 'Over 40 modules: FPS, ping, CPS, armour, effects, keystrokes, compass, kills and more. Arrange them with the mouse in the editor (right Shift) and share the layout as a code.',
          bullets: ['Custom crosshairs, zoom, freelook, fullbright', 'Chat tabs with filters and search'],
          image: '/img/hud-game.jpg', imageAlt: 'SlashClient HUD in the game', image2: '/img/hud-editor.jpg', image2Alt: 'HUD editor' }),
        block({ anchor: 'znajomi', icon: 'fa-solid fa-user-group', tag: 'Friends', title: 'Friends and game invites',
          text: 'See who is online and which server they play on. Chat in the launcher or in the game, and “Invite” gives a friend a “Join” button that takes them to your server.',
          bullets: ['Your account sets itself up with your Minecraft account', 'Messages encrypted end to end', 'In-game chat under the O key'],
          image: '/img/friends-launcher.jpg', imageAlt: 'Friends and invites in the launcher', image2: '/img/friends-game.jpg', image2Alt: 'An invite in the game' }),
        block({ kind: 'cosmetics', anchor: 'kosmetyki', icon: 'fa-solid fa-wand-magic-sparkles', tag: 'Cosmetics', title: 'Capes, wings, pets and emotes',
          text: 'Capes (animated ones too), wings, elytras, trails, auras and pets are seen by SlashClient players on every server. Pick emotes from the wheel under the N key. Turn the figure with the mouse.',
          buttonLabel: 'Choose a cape', buttonHref: '/account', buttonIcon: 'fa-solid fa-wand-magic-sparkles' }),
        block({ anchor: 'benchmark', icon: 'fa-solid fa-chart-column', tag: 'Performance', title: 'FPS benchmark with tips',
          text: 'A 30-second test in your world: average FPS, 1% lows and stutters. The launcher compares the results, tells you what to improve and installs missing performance mods in one click.',
          bullets: ['Frame time chart and result comparison', 'Sodium, Lithium and other mods in one click'],
          image: '/img/bench-launcher.jpg', imageAlt: 'Benchmark tips in the launcher', image2: '/img/bench-game.jpg', image2Alt: 'Benchmark result in the game' }),
        block({ anchor: 'klipy', icon: 'fa-solid fa-film', tag: 'Clips', title: 'Clips on F8',
          text: 'F8 saves the last 10–60 seconds of play as a video, no OBS needed. Clips are in the launcher, in the profile tab.',
          image: '/img/clips-launcher.jpg', imageAlt: 'Clips in the launcher' }),
      ],
    },
    modules: {
      eyebrow: 'Modules', title: 'HUD modules',
      items: modules(['FPS', 'Ping', 'CPS', 'Keystrokes', 'Armour', 'Effects', 'Coordinates', 'Compass', 'Crosshairs', 'Zoom', 'Freelook', 'Fullbright',
        'K/D', 'Combo', 'Reach', 'Target', 'CPU', 'GPU', 'RAM', 'TPS', 'FPS graph', 'Network', 'Clock', 'Session',
        'Elytra', 'Arrows', 'Durability', 'Block', 'Time of day', 'Biome', 'Sprint', 'Waypoints', 'Chat tabs', 'Screenshots to clipboard', 'Friends online', 'Scoreboard']),
    },
    features: {
      eyebrow: 'Launcher', title: 'More in the launcher',
      items: features([
        ['Many accounts', 'Microsoft and offline accounts; switch them in the game too, without a restart.'],
        ['Mods from Modrinth', 'Mods, modpacks and resources matched to the profile’s version.'],
        ['Profile import', 'Profiles from Prism, MultiMC, CurseForge, Modrinth App and the official launcher.'],
        ['Skins', 'A skin editor, a skin library and a 3D preview.'],
        ['Servers', 'Description, player count and ping; join in one click.'],
        ['Worlds', 'World backups, screenshots and clips.'],
        ['Crashes', 'The launcher reads the log and tells you what went wrong.'],
        ['Updates', 'The launcher checks for and installs new versions itself.'],
      ]),
    },
    faq: {
      eyebrow: 'FAQ', title: 'Frequently asked questions', openFirst: true,
      items: faq([
        ['How much does SlashClient cost?', 'Nothing. The launcher, the HUD, friends and capes are free.'],
        ['Will I get banned for SlashClient?', 'The HUD only shows what the game already knows and gives no advantage like cheats do. Servers have their own rules though: if a server forbids e.g. freelook, turn it off in the HUD settings.'],
        ['Which versions does the HUD work on?', 'Minecraft 1.21.11 and 26.1–26.3, with or without Fabric. The launcher also runs older versions, but without the HUD.'],
        ['Does it work with Sodium and other mods?', 'Yes. The HUD is a regular Fabric mod and works together with performance mods.'],
        ['Is my account safe?', 'You sign in to Microsoft on its own page, the launcher never sees your password. Your SlashClient account is confirmed by Mojang, just like Minecraft servers do, so your Minecraft token never reaches the SlashClient server. Messages to friends are encrypted and the server cannot read them.'],
        ['macOS says it cannot check the app. What do I do?', 'SlashClient is not signed by Apple yet. Right-click the app, choose Open and confirm. You only need to do it once.'],
        ['How do I update the launcher?', 'On Windows and Linux the new version downloads itself and installs on the next start. On a Mac the launcher shows a Download button.'],
        ['Who can see my cape?', 'SlashClient players, on every server. Everyone else sees your usual look.'],
      ]),
    },
    final: { title: 'Download SlashClient', text: 'Free, for Windows, macOS and Linux.', button: 'Download SlashClient' },
    footer: {
      note: 'Not affiliated with Mojang or Microsoft.',
      links: [link('Report a bug', '/bugs'), link('Your account', '/account'), link('Support the project', '/support', 'fa-solid fa-heart')],
      terms: 'Terms of Service', privacy: 'Privacy Policy', langShow: true, langLabel: 'Polski',
    },
  },
};

// ---------- checking what the editor sends ----------

/** A problem with one field: its place ("faq.items.3.a") and what is wrong. */
export class ContentError extends Error {
  readonly path: string;
  readonly reason: string;
  constructor(path: string, reason: string) {
    super(`${reason}: ${path}`);
    this.path = path;
    this.reason = reason;
  }
}

const LINK = /^(#[A-Za-z0-9_-]{1,60}|\/(?!\/)[^\s"'<>\\`]{0,300}|https:\/\/[^\s"'<>\\`/][^\s"'<>\\`]{0,300}|mailto:[^\s"'<>\\`]{3,200})$/;
const IMAGE = /^(\/(?!\/)[^\s"'<>\\`]{1,300}|https:\/\/[^\s"'<>\\`/][^\s"'<>\\`]{0,300})$/;
const ICON = /^fa-(solid|regular|brands) fa-[a-z0-9-]{1,60}$/;
const ANCHOR = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Ids the page's own parts use: a block's anchor must not take one. */
export const RESERVED_IDS = new Set(['nav', 'funkcje', 'faq', 'pobierz', 'hero-shot', 'features', 'faq-list', 'mq1', 'mq2', 'cape-strip', 'cosmetic-3d',
  'cosmetic-3d-caption', 'download-main', 'download-final', 'download-note', 'os-icon', 'os-label', 'nav-admin', 'nav-account', 'toasts', 'root', 'main']);

export const isLink = (s: string): boolean => LINK.test(s);
export const isImage = (s: string): boolean => IMAGE.test(s);

/** Control characters out (a newline stays where the field has lines). */
function clean(s: string, lines: boolean): string {
  const t = s.replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  return (lines ? t : t.replace(/\n+/g, ' ')).replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g, '');
}

export interface CheckOptions { icons?: Set<string> }

/**
 * One field's value checked and cleaned; `fallback` (the default) when it is missing, so content
 * saved before a field existed still works. Throws ContentError for anything else that is wrong.
 */
function checkField(f: Field, v: unknown, fallback: Value | undefined, at: string, o: CheckOptions): Value {
  if (v === undefined) {
    if (fallback !== undefined) return structuredClone(fallback);
    v = f.t === 'bool' ? false : f.t === 'list' || f.t === 'strings' ? [] : f.t === 'choice' ? f.options[0][0] : '';
  }
  switch (f.t) {
    case 'bool':
      if (typeof v !== 'boolean') throw new ContentError(at, 'type');
      return v;
    case 'choice':
      if (typeof v !== 'string' || !f.options.some(([o2]) => o2 === v)) throw new ContentError(at, 'choice');
      return v;
    case 'strings': {
      if (!Array.isArray(v)) throw new ContentError(at, 'type');
      if (v.length > f.max) throw new ContentError(at, 'too_many');
      return v.map((s, i) => {
        if (typeof s !== 'string') throw new ContentError(`${at}.${i}`, 'type');
        const c = clean(s, false).trim();
        if (!c) throw new ContentError(`${at}.${i}`, 'empty');
        if (c.length > f.itemMax) throw new ContentError(`${at}.${i}`, 'too_long');
        return c;
      });
    }
    case 'list': {
      if (!Array.isArray(v)) throw new ContentError(at, 'type');
      if (v.length > f.max) throw new ContentError(at, 'too_many');
      return v.map((item, i) => checkFields(f.item, item, undefined, `${at}.${i}`, o));
    }
    default: {
      if (typeof v !== 'string') throw new ContentError(at, 'type');
      const s = f.t === 'text' ? clean(v, !!f.lines) : v.trim();
      if (f.t === 'text' && s.length > f.max) throw new ContentError(at, 'too_long');
      if (!s.trim()) {
        if ('req' in f && f.req) throw new ContentError(at, 'empty');
        return f.t === 'text' ? s : '';
      }
      if (f.t === 'link' && !isLink(s)) throw new ContentError(at, 'bad_link');
      if (f.t === 'image' && !isImage(s)) throw new ContentError(at, 'bad_image');
      if (f.t === 'icon' && (!ICON.test(s) || (o.icons && !o.icons.has(s.split(' ')[1].slice(3))))) throw new ContentError(at, 'bad_icon');
      if (f.t === 'anchor' && (!ANCHOR.test(s) || RESERVED_IDS.has(s))) throw new ContentError(at, 'bad_anchor');
      return s;
    }
  }
}

function checkFields(fields: Fields, v: unknown, fallback: Item | undefined, at: string, o: CheckOptions): Item {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ContentError(at, 'type');
  const out: Item = {};
  for (const [key, f] of Object.entries(fields)) out[key] = checkField(f, (v as Record<string, unknown>)[key], fallback?.[key], at ? `${at}.${key}` : key, o);
  return out;
}

/** The whole page's content for one language, checked; sections left out come from the defaults. */
export function checkContent(v: unknown, lang: Lang, o: CheckOptions = {}): Content {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ContentError('', 'type');
  const out: Content = {};
  for (const s of SECTIONS) {
    const given = (v as Record<string, unknown>)[s.id];
    out[s.id] = given === undefined ? structuredClone(DEFAULTS[lang][s.id]) : checkFields(s.fields, given, DEFAULTS[lang][s.id], s.id, o);
  }
  // the blocks' anchors are the page's ids: each once, and one cosmetics block at most (it has the 3D figure)
  const blocks = out.showcase.blocks as Item[];
  const seen = new Set<string>();
  blocks.forEach((b, i) => {
    const a = b.anchor as string;
    if (a && seen.has(a)) throw new ContentError(`showcase.blocks.${i}.anchor`, 'duplicate');
    if (a) seen.add(a);
  });
  if (blocks.filter((b) => b.kind === 'cosmetics').length > 1) throw new ContentError('showcase.blocks', 'one_cosmetics');
  return out;
}

/** Stored content read back: anything that no longer passes falls back to the defaults section by section. */
export function storedContent(v: unknown, lang: Lang): Content {
  const out: Content = {};
  const given = v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  for (const s of SECTIONS) {
    try {
      out[s.id] = given[s.id] === undefined ? structuredClone(DEFAULTS[lang][s.id]) : checkFields(s.fields, given[s.id], DEFAULTS[lang][s.id], s.id, {});
    } catch {
      out[s.id] = structuredClone(DEFAULTS[lang][s.id]);
    }
  }
  return out;
}

// ---------- making it HTML ----------

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A link's attributes: another site's opens in a new tab and is told nothing about this one. */
export const linkAttrs = (href: string): string =>
  `href="${escapeHtml(href)}"${/^https:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}`;

/** The longer texts: escaped, with **bold**, [text](link) and line breaks; nothing else becomes HTML. */
export function inline(s: string): string {
  let out = '';
  let last = 0;
  const re = /\*\*([^*\n][^*]*?)\*\*|\[([^\]\n]{1,200})\]\(([^)\s]{1,300})\)/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    out += escapeHtml(s.slice(last, m.index));
    if (m[1] !== undefined) out += `<strong>${escapeHtml(m[1])}</strong>`;
    else if (isLink(m[3])) out += `<a ${linkAttrs(m[3])}>${escapeHtml(m[2])}</a>`;
    else out += escapeHtml(m[0]);
    last = m.index + m[0].length;
  }
  out += escapeHtml(s.slice(last));
  return out.replace(/\n/g, '<br>');
}
