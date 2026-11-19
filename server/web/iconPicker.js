// The admin panel's Font Awesome icon picker, in place of typing a class by hand: a button with the
// icon that opens a panel with a search (English names and words, Polish ones for the common icons),
// the styles, the last used icons and a grid to click. Mouse, finger and keyboard; a sheet on a phone.
// The list is the vendored Font Awesome's (vendor/fa/icons.json, made by scripts/make-fa-icons.mjs).
import { popover } from './adminPopover.js';
import { ASSET_V, L, el, icon } from './common.js';

const RECENT_KEY = 'slashclient-admin-recent-icons';
const RECENT_MAX = 14;
/** How many icons the grid draws at once ("show more" adds as many again). */
const PAGE = 160;
const STYLE = { s: 'solid', r: 'regular', b: 'brands' };

/** Polish words for the common icons (a word, then the icons it finds). Missing names are skipped. */
const PL = {
  gwiazda: 'star star-half-stroke', serce: 'heart heart-pulse', dom: 'house house-chimney', 'strona glowna': 'house',
  gracz: 'user user-astronaut', osoba: 'user', uzytkownik: 'user user-gear', gracze: 'users user-group people-group', ludzie: 'users people-group',
  znajomi: 'user-group users', przyjaciel: 'user-group handshake', zaproszenie: 'user-plus envelope-open-text', konto: 'user circle-user id-card',
  ustawienia: 'gear gears sliders', zebatka: 'gear', suwaki: 'sliders', szukaj: 'magnifying-glass', lupa: 'magnifying-glass',
  kosz: 'trash trash-can', usun: 'trash trash-can xmark', edytuj: 'pen pencil pen-to-square', olowek: 'pencil pen', dodaj: 'plus circle-plus square-plus',
  plus: 'plus circle-plus', zamknij: 'xmark circle-xmark', krzyzyk: 'xmark', tak: 'check circle-check', ptaszek: 'check square-check', gotowe: 'check circle-check',
  strzalka: 'arrow-right arrow-left arrow-up arrow-down arrow-right-long', gora: 'arrow-up mountain mountain-sun', dol: 'arrow-down',
  kalendarz: 'calendar calendar-days calendar-week', data: 'calendar-days', zegar: 'clock stopwatch', czas: 'clock hourglass-half stopwatch',
  klepsydra: 'hourglass hourglass-half', dzwonek: 'bell', powiadomienia: 'bell', poczta: 'envelope', mail: 'envelope at', wiadomosc: 'message comment envelope',
  czat: 'comments comment message', rozmowa: 'comments', komentarz: 'comment', telefon: 'phone mobile-screen', komorka: 'mobile-screen',
  aparat: 'camera camera-retro', zdjecie: 'image camera images', obraz: 'image images', galeria: 'images', film: 'film video clapperboard', wideo: 'video film',
  muzyka: 'music headphones', sluchawki: 'headphones', glosnik: 'volume-high', dzwiek: 'volume-high music', mikrofon: 'microphone', gra: 'gamepad dice puzzle-piece',
  pad: 'gamepad', puchar: 'trophy', trofeum: 'trophy', nagroda: 'award trophy medal gift', medal: 'medal award', osiagniecie: 'trophy award medal',
  korona: 'crown', krol: 'crown chess-king', prezent: 'gift gifts', ogien: 'fire fire-flame-curved', plomien: 'fire', blyskawica: 'bolt', piorun: 'bolt',
  energia: 'bolt battery-full', tarcza: 'shield shield-halved', ochrona: 'shield shield-halved lock', bezpieczenstwo: 'shield-halved lock user-shield',
  klucz: 'key', klodka: 'lock lock-open', zamek: 'lock dungeon fort-awesome', oko: 'eye eye-slash', widok: 'eye', ukryj: 'eye-slash', link: 'link',
  pobierz: 'download cloud-arrow-down', wyslij: 'paper-plane upload', przeslij: 'upload cloud-arrow-up', chmura: 'cloud cloud-sun', slonce: 'sun',
  ksiezyc: 'moon cloud-moon', noc: 'moon', snieg: 'snowflake', zima: 'snowflake', drzewo: 'tree', las: 'tree', lisc: 'leaf', roslina: 'seedling leaf',
  ryba: 'fish fish-fins', wedka: 'fish', pies: 'dog', kot: 'cat', zwierze: 'paw dog cat', lapa: 'paw', smok: 'dragon', czaszka: 'skull skull-crossbones',
  smierc: 'skull', miecz: 'khanda', bron: 'gun crosshairs', celownik: 'crosshairs', mlotek: 'hammer', narzedzia: 'screwdriver-wrench wrench toolbox',
  klucz_francuski: 'wrench', kod: 'code terminal', programowanie: 'code laptop-code', terminal: 'terminal', blad: 'bug circle-exclamation', robak: 'bug',
  rakieta: 'rocket', mapa: 'map map-location-dot', kompas: 'compass', flaga: 'flag flag-checkered', meta: 'flag-checkered', lokalizacja: 'location-dot map-pin',
  pinezka: 'map-pin thumbtack location-dot', swiat: 'globe earth-europe', globus: 'globe', internet: 'globe wifi', serwer: 'server', baza: 'database',
  ksiazka: 'book book-open', poradnik: 'book-open circle-question', dokument: 'file file-lines', plik: 'file file-lines', folder: 'folder folder-open',
  zakladka: 'bookmark', regulamin: 'scale-balanced file-contract', prawo: 'scale-balanced gavel', sklep: 'store cart-shopping bag-shopping', koszyk: 'cart-shopping basket-shopping',
  zakupy: 'bag-shopping cart-shopping', pieniadze: 'coins money-bill sack-dollar', monety: 'coins', kasa: 'coins cash-register', diament: 'gem', klejnot: 'gem',
  karta: 'credit-card id-card', wykres: 'chart-line chart-simple chart-pie', statystyki: 'chart-simple chart-line', lista: 'list list-check list-ul',
  zadania: 'list-check clipboard-list', wyzwanie: 'list-check flag-checkered bullseye', cel: 'bullseye crosshairs', informacja: 'circle-info info',
  pytanie: 'circle-question question', pomoc: 'circle-question life-ring hand-holding-heart', wsparcie: 'hand-holding-heart heart life-ring',
  uwaga: 'triangle-exclamation circle-exclamation', ostrzezenie: 'triangle-exclamation', blokada: 'ban lock', zakaz: 'ban', wspolpraca: 'handshake',
  partner: 'handshake', kciuk: 'thumbs-up thumbs-down', lubie: 'thumbs-up heart', usmiech: 'face-smile face-grin', buzka: 'face-smile face-laugh',
  paleta: 'palette', kolor: 'palette droplet', pedzel: 'paintbrush brush', farba: 'paint-roller spray-can', magia: 'wand-magic-sparkles wand-sparkles hat-wizard',
  rozdzka: 'wand-magic-sparkles wand-sparkles', czarodziej: 'hat-wizard', kostka: 'dice cube', szescian: 'cube cubes', blok: 'cube cubes', puzzle: 'puzzle-piece',
  transmisja: 'tower-broadcast video satellite-dish', stream: 'tower-broadcast video', 'na zywo': 'tower-broadcast circle', koszulka: 'shirt', ubranie: 'shirt vest',
  kosmetyki: 'wand-magic-sparkles shirt hat-wizard', peleryna: 'shirt', samochod: 'car', auto: 'car', samolot: 'plane plane-arrival', statek: 'ship anchor',
  kotwica: 'anchor', woda: 'water droplet', kropla: 'droplet', wiatr: 'wind', zasilanie: 'power-off plug', wylacz: 'power-off toggle-off', wlacz: 'toggle-on power-off',
  odswiez: 'rotate arrows-rotate', cofnij: 'rotate-left arrow-rotate-left', kopiuj: 'copy clone', wklej: 'paste', zapisz: 'floppy-disk', dyskietka: 'floppy-disk',
  drukuj: 'print', filtr: 'filter', sortuj: 'sort arrow-down-wide-short', menu: 'bars', wiecej: 'ellipsis ellipsis-vertical', siatka: 'table-cells grip',
  forum: 'comments', klan: 'shield-halved users flag', druzyna: 'people-group users', spolecznosc: 'users people-group', komputer: 'computer desktop laptop',
  laptop: 'laptop', ekran: 'display desktop', monitor: 'desktop display', klawiatura: 'keyboard', mysz: 'computer-mouse', bateria: 'battery-full battery-half',
  bot: 'robot', robot: 'robot', mozg: 'brain', zarowka: 'lightbulb', pomysl: 'lightbulb', nowosc: 'certificate star bolt', ogloszenie: 'bullhorn', megafon: 'bullhorn',
  urodziny: 'cake-candles', tort: 'cake-candles', swieta: 'gift tree snowflake', choinka: 'tree', duch: 'ghost', halloween: 'ghost skull', skrzynia: 'box box-open boxes-stacked',
  paczka: 'box box-open', pudelko: 'box box-open', ziemia: 'earth-europe', kursor: 'arrow-pointer', reka: 'hand hand-pointer', dlon: 'hand', kubek: 'mug-hot',
  kawa: 'mug-hot', jedzenie: 'utensils burger', pizza: 'pizza-slice', burger: 'burger', szkola: 'graduation-cap school', nauka: 'graduation-cap book',
  zdrowie: 'heart-pulse kit-medical', apteczka: 'kit-medical', mikser: 'sliders', uklad: 'table-columns grip', hud: 'gauge-high table-columns', fps: 'gauge-high',
  licznik: 'gauge-high gauge', predkosc: 'gauge-high', wydajnosc: 'gauge-high bolt', launcher: 'rocket', mody: 'puzzle-piece cubes', mod: 'puzzle-piece',
  wersja: 'code-branch tag', etykieta: 'tag tags', tag: 'tag tags', historia: 'clock-rotate-left', dziennik: 'clock-rotate-left book', logi: 'file-lines terminal',
  zgloszenie: 'flag bug', raport: 'flag file-lines', sztuczna: 'robot brain', jezyk: 'language', tlumaczenie: 'language', wyjscie: 'right-from-bracket door-open',
  wejscie: 'right-to-bracket door-open', drzwi: 'door-open door-closed', loch: 'dungeon', lochy: 'dungeon', wyspa: 'umbrella-beach', plaza: 'umbrella-beach',
};

/** "Zażółć" → "zazolc": Polish letters typed with or without their marks find the same. */
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

let catalog;
/** The icon list, fetched once on the first open: [{ name, styles, words }]. */
function loadIcons() {
  catalog ??= fetch(`vendor/fa/icons.json${ASSET_V}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((data) => {
    const pl = {};
    for (const [word, names] of Object.entries(PL)) for (const n of names.split(' ')) (pl[n] ??= []).push(fold(word.replace(/_/g, ' ')));
    return data.icons.map(([name, styles, words]) => ({ name, styles, words: fold(words), pl: pl[name] ?? [] }));
  }).catch((err) => { catalog = undefined; throw err; });
  return catalog;
}

/** How well an icon fits the search (higher first); 0 = it does not. */
function score(ic, q) {
  // no search: the common icons (those with Polish words) first, then the rest by name
  if (!q) return ic.pl.length ? 2 : 1;
  if (ic.name === q) return 100;
  if (ic.name.startsWith(q)) return 80;
  if (ic.pl.some((w) => w === q)) return 70;
  if (ic.pl.some((w) => w.startsWith(q))) return 60;
  if (ic.name.includes(q)) return 50;
  if (` ${ic.words}`.includes(` ${q}`)) return 30;
  if (ic.words.includes(q) || ic.pl.some((w) => w.includes(q))) return 10;
  return 0;
}

function recentIcons() {
  try { return (JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []).filter((c) => typeof c === 'string' && /^fa-(solid|regular|brands) fa-[a-z0-9-]+$/.test(c)).slice(0, RECENT_MAX); } catch { return []; }
}
function rememberIcon(cls) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([cls, ...recentIcons().filter((c) => c !== cls)].slice(0, RECENT_MAX))); } catch { /* private mode: no history */ }
}

/**
 * An icon field: acts like a text input for the code around it – `.value` reads and sets the icon,
 * "input" and "change" fire once one is picked. `format` is how the value is written: 'full'
 * ("fa-solid fa-star", any of `styles`) or 'name' ("fa-star", always drawn solid).
 * `empty` (a label) lets the admin pick no icon; `fallback` is drawn on the button when there is none.
 */
export function iconField(value = '', { title = L('Ikona', 'Icon'), format = 'full', styles = format === 'name' ? 's' : 'srb', empty, fallback = 'fa-regular fa-square' } = {}) {
  /** The current icon as "fa-style fa-name", or '' for none. */
  let cls = '';
  const parse = (v) => {
    const t = String(v ?? '').trim();
    if (!t) return '';
    if (format === 'name') return /^fa-[a-z0-9-]+$/.test(t) ? `fa-solid ${t}` : '';
    return /^fa-(solid|regular|brands) fa-[a-z0-9-]+$/.test(t) ? t : '';
  };
  const out = (c) => (format === 'name' ? c.split(' ')[1] ?? '' : c);
  // what was typed before but is not an icon class stays, so saving changes nothing by surprise
  let raw = String(value ?? '');
  cls = parse(raw);
  let atOpen = cls, rawAtOpen = raw;

  const shown = el('i');
  const code = el('span', { class: 'ip-code' });
  const root = el('button', { type: 'button', class: 'cp-trigger ip-trigger' }, el('span', { class: 'ip-shown' }, shown), code, icon('fa-solid fa-chevron-down cp-caret'));

  const search = el('input', { type: 'search', class: 'ip-search', placeholder: L('Szukaj: np. gwiazda, serce, discord…', 'Search: e.g. star, heart, discord…'), autocomplete: 'off', spellcheck: false, 'aria-label': L('Szukaj ikony', 'Search icons') });
  let style = '';
  const tabs = styles.length > 1 ? el('div', { class: 'ip-tabs', role: 'tablist' }) : '';
  const STYLE_NAMES = { '': L('Wszystkie', 'All'), s: L('Pełne', 'Solid'), r: L('Kontur', 'Outline'), b: L('Marki', 'Brands') };
  const drawTabs = () => tabs && tabs.replaceChildren(...['', ...styles].map((s) => el('button', { type: 'button', role: 'tab', class: style === s ? 'active' : '', 'aria-selected': String(style === s), onclick: () => { style = s; drawTabs(); drawGrid(); } }, STYLE_NAMES[s])));
  const recentLabel = el('div', { class: 'cp-label', textContent: L('Ostatnio używane', 'Recently used') });
  const recentRow = el('div', { class: 'ip-grid ip-recent' });
  const grid = el('div', { class: 'ip-grid', role: 'listbox', 'aria-label': title });
  const gridWrap = el('div', { class: 'ip-scroll' }, grid);
  const count = el('span', { class: 'cp-label ip-count' });
  const picked = el('span', { class: 'ip-picked' });
  const none = empty ? el('button', { type: 'button', class: 'icon-btn ip-none', title: empty, onclick: () => { set(''); pop.close(true); } }, icon('fa-solid fa-ban')) : '';
  const panel = el('div', { class: 'cp-panel ip-panel glass', role: 'dialog', 'aria-label': title },
    el('div', { class: 'cp-head' }, el('b', { textContent: title }), el('button', { type: 'button', class: 'icon-btn cp-close', title: L('Zamknij', 'Close'), onclick: () => pop.close(true) }, icon('fa-solid fa-xmark'))),
    search, tabs, recentLabel, recentRow, count, gridWrap,
    el('div', { class: 'ip-foot' }, picked, none,
      el('button', { type: 'button', onclick: () => { undo(); pop.close(true); } }, L('Anuluj', 'Cancel')),
      el('button', { type: 'button', class: 'primary', onclick: () => pop.close(true) }, icon('fa-solid fa-check'), L('Gotowe', 'Done'))));

  function draw() {
    shown.className = cls || (raw.trim() ? 'fa-solid fa-question' : fallback);
    code.textContent = cls ? out(cls) : raw.trim() || (empty ?? L('Wybierz ikonę', 'Pick an icon'));
    code.classList.toggle('muted', !cls);
    picked.replaceChildren(...(cls ? [icon(cls), el('span', { textContent: out(cls) })] : [el('span', { class: 'muted', textContent: '—' })]));
    for (const b of panel.querySelectorAll('.ip-cell')) b.setAttribute('aria-selected', String(b.dataset.cls === cls));
  }
  /** Back to what the field had when the panel opened. */
  function undo() {
    const was = cls;
    cls = atOpen;
    raw = rawAtOpen;
    draw();
    if (cls !== was) emit('input');
  }
  const emit = (type) => root.dispatchEvent(new Event(type, { bubbles: true }));
  function set(next) {
    if (next === cls && raw === out(next)) return;
    cls = next;
    raw = out(next);
    draw();
    emit('input');
  }
  const cell = (c, label) => el('button', { type: 'button', class: 'ip-cell', role: 'option', tabIndex: -1, title: label, 'aria-label': label, dataset: { cls: c }, 'aria-selected': String(c === cls),
    onclick: () => { set(c); pop.close(true); } }, icon(c));

  let shownCount = PAGE;
  let list = [];
  async function drawGrid(more = false) {
    let icons;
    try { icons = await loadIcons(); } catch {
      grid.replaceChildren(el('p', { class: 'muted small', textContent: L('Nie udało się wczytać listy ikon. Wpisz klasę ręcznie w polu wyszukiwania i naciśnij Enter.', 'Could not load the icons. Type the class in the search box and press Enter.') }));
      return;
    }
    if (!more) shownCount = PAGE;
    const q = fold(search.value.trim()).replace(/^fa-(solid|regular|brands)\s+/, '').replace(/^fa-/, '');
    list = [];
    for (const ic of icons) {
      const s = score(ic, q);
      if (!s) continue;
      for (const st of ic.styles) if (styles.includes(st) && (!style || style === st)) list.push([s, ic.name, st]);
    }
    list.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
    const cells = list.slice(0, shownCount).map(([, name, st]) => cell(`fa-${STYLE[st]} fa-${name}`, `${name}${st === 's' || format === 'name' ? '' : ` (${STYLE_NAMES[st].toLowerCase()})`}`));
    if (list.length > shownCount) cells.push(el('button', { type: 'button', class: 'ip-more', onclick: () => { shownCount += PAGE; drawGrid(true); } }, L(`Pokaż więcej (${list.length - shownCount})`, `Show more (${list.length - shownCount})`)));
    if (!list.length) cells.push(el('p', { class: 'muted small ip-empty', textContent: L('Nic nie pasuje. Spróbuj po angielsku (np. „sword”, „house”).', 'Nothing matches. Try another word.') }));
    grid.replaceChildren(...cells);
    count.textContent = q ? L(`Znaleziono: ${list.length}`, `Found: ${list.length}`) : L(`Wszystkie ikony: ${list.length}`, `All icons: ${list.length}`);
    if (!more) gridWrap.scrollTop = 0;
  }
  function drawRecent() {
    const recent = recentIcons().filter((c) => styles.includes(c.split(' ')[0].slice(3, 4)));
    recentRow.replaceChildren(...recent.map((c) => cell(c, out(c))));
    recentRow.hidden = recentLabel.hidden = !recent.length;
  }

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => drawGrid(), 80); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); grid.querySelector('.ip-cell')?.focus(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      // a class typed in full is taken as it is; else the best match
      const typed = parse(search.value.trim().toLowerCase());
      const first = grid.querySelector('.ip-cell');
      if (typed && (format === 'name' || styles.includes(typed.split(' ')[0].slice(3, 4)))) set(typed); else if (first) set(first.dataset.cls); else return;
      pop.close(true);
    }
  });
  // arrows walk the grid (by its columns), Home/End jump to its ends, typing goes back to the search
  panel.addEventListener('keydown', (e) => {
    const at = e.target.closest?.('.ip-cell');
    if (!at) return;
    const cells = [...at.parentElement.querySelectorAll('.ip-cell')];
    const i = cells.indexOf(at);
    const cols = Math.max(1, Math.round(at.parentElement.clientWidth / at.offsetWidth));
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: cells.length - 1 }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      if (to < 0 && at.parentElement === grid) { search.focus(); return; }
      cells[Math.max(0, Math.min(cells.length - 1, to))].focus();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      search.focus();
    }
  });

  const pop = popover(root, panel, {
    onOpen: () => {
      atOpen = cls;
      rawAtOpen = raw;
      search.value = '';
      style = '';
      drawTabs();
      drawRecent();
      draw();
      grid.replaceChildren(el('p', { class: 'muted small', textContent: L('Ładowanie ikon…', 'Loading icons…') }));
      drawGrid().then(() => pop.place());
    },
    onClose: () => {
      clearTimeout(timer);
      if (cls !== atOpen || raw !== rawAtOpen) { if (cls) rememberIcon(cls); emit('change'); }
    },
    onCancel: undo,
    // on a phone the keyboard would cover half the icons: the search waits for a tap there
    focus: () => (innerWidth < 560 ? panel.querySelector('.cp-close') : search),
  });
  Object.defineProperty(root, 'value', { get: () => (cls ? out(cls) : raw.trim() ? raw : ''), set: (v) => { raw = String(v ?? ''); cls = parse(raw); draw(); } });
  draw();
  return root;
}
