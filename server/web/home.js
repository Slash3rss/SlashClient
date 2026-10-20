// The landing page: download button for the visitor's system, the screenshot that straightens
// as you scroll, sections that fade in, the modules marquee, features and FAQ.
import { $, api, el, icon, token } from './common.js';

// ---------- download for this system ----------
// /pobierz/<system> on this server sends the installer of the latest release straight away
const ua = navigator.userAgent;
// an iPad says it is a Mac, but a Mac has no touch screen
const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
const SYSTEMS = {
  windows: ['Windows', 'fa-brands fa-windows'],
  mac: ['macOS', 'fa-brands fa-apple'],
  linux: ['Linux', 'fa-brands fa-linux'],
};
const mine = /Mac/i.test(ua) ? 'mac' : /Linux|X11|CrOS/i.test(ua) ? 'linux' : 'windows';
if (phone) {
  // nothing to install on a phone: say so instead of offering a file it can't open
  for (const id of ['#download-main', '#download-final']) {
    const b = $(id);
    b.removeAttribute('href');
    b.classList.add('disabled');
    b.setAttribute('aria-disabled', 'true');
  }
  $('#os-icon').className = 'fa-solid fa-desktop';
  $('#os-label').textContent = 'SlashClient działa na komputerze';
  $('#download-final').replaceChildren(icon('fa-solid fa-desktop'), ' SlashClient działa na komputerze');
  $('#download-note').textContent = 'Otwórz tę stronę na komputerze z Windows, macOS lub Linuksem, żeby pobrać launcher.';
} else {
  $('#os-label').textContent = `Pobierz dla ${SYSTEMS[mine][0]}`;
  $('#os-icon').className = SYSTEMS[mine][1];
  for (const id of ['#download-main', '#download-final']) $(id).href = `/pobierz/${mine}`;
  // the others, and the Intel build for older Macs (the main macOS button is Apple Silicon)
  const links = [['windows', 'Windows'], ['mac', 'macOS (Apple Silicon)'], ['mac-intel', 'macOS (Intel)'], ['linux', 'Linux']]
    .filter(([os]) => os !== mine)
    .map(([os, name]) => el('a', { href: `/pobierz/${os}` }, name));
  const note = $('#download-note');
  note.replaceChildren('Inne systemy: ');
  links.forEach((a, i) => note.append(...(i ? [' · ', a] : [a])));
}

// ---------- the account button ----------
if (token.get()) {
  api('GET', '/v1/me').then((me) => {
    $('#nav-account .label').textContent = me.name;
    $('#nav-admin').classList.toggle('hidden', !me.admin);
  }).catch(() => {});
}

// ---------- capes ----------
for (const c of document.querySelectorAll('[data-cape]')) c.style.backgroundImage = `url(vendor/capes/${c.dataset.cape}.png)`;
api('GET', '/v1/cosmetics').then(({ capes, items }) => {
  // the shop's capes carry their price in sparks (from achievements)
  const prices = Object.fromEntries((items ?? []).filter((i) => i.price).map((i) => [i.id, i.price]));
  $('#cape-strip').replaceChildren(...capes.map((c) => {
    const price = prices[c.id];
    const d = el('div', { class: `cape${price ? ' priced' : ''}`, title: price ? `${c.name}: w sklepie za ${price} Iskier z osiągnięć` : c.exclusive ? `${c.name} (ekskluzywna)` : c.name });
    d.style.backgroundImage = `url(vendor/capes/${c.id}.png)`;
    if (price) d.append(el('span', { class: 'spark-price', textContent: `✦ ${price}` }));
    return d;
  }));
}).catch(() => {});

// ---------- the 3D figure: a few sets in turn ----------
const SETS = [
  [{ cape: 'aurora', trail: 'stars' }, 'Peleryna Zorza i ślad Fajerwerki'],
  [{ wings: 'phoenix', aura: 'royal', pet: 'allay' }, 'Skrzydła Feniks, aura Królewska, pupil Allay'],
  [{ cape: 'matrix', pet: 'bee' }, 'Peleryna Matrix i pupil Pszczoła'],
  [{ wings: 'prism', trail: 'hearts' }, 'Skrzydła Pryzmat i ślad Serca'],
  [{ elytra: 'nebula', aura: 'sculk', pet: 'phantom' }, 'Elytra Mgławica, aura Sculk, pupil Fantom'],
  [{ cape: 'sakura', aura: 'cherry', pet: 'parrot' }, 'Peleryna Sakura, aura Wiśnia, pupil Papuga'],
];
/** Whose skin wears the showcase: Slash3rss, SlashClient's author (Mojang uuid; ours if it cannot be had). */
const SHOWCASE_PLAYER = '5018a794ee17437ea5da36e64bd1e59c';
const stage = $('#cosmetic-3d');
if (stage) {
  const seen = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    seen.disconnect();
    try {
      const { Preview } = await import('./preview.js');
      const p = await Preview.create(stage, { width: 300, height: 380, uuid: SHOWCASE_PLAYER });
      let i = 0;
      const next = () => {
        const [set, label] = SETS[i++ % SETS.length];
        p.show(set);
        $('#cosmetic-3d-caption').textContent = label;
      };
      next();
      setInterval(() => { if (!document.hidden) next(); }, 4500);
    } catch {
      stage.classList.add('hidden');
    }
  });
  seen.observe(stage);
}

// ---------- modules marquee ----------
const MODULES = [
  ['fa-solid fa-gauge-high', 'FPS'], ['fa-solid fa-wifi', 'Ping'], ['fa-solid fa-computer-mouse', 'CPS'], ['fa-solid fa-keyboard', 'Keystrokes'],
  ['fa-solid fa-shield-halved', 'Zbroja'], ['fa-solid fa-flask', 'Efekty'], ['fa-solid fa-location-crosshairs', 'Koordynaty'], ['fa-solid fa-compass', 'Kompas'],
  ['fa-solid fa-crosshairs', 'Celowniki'], ['fa-solid fa-magnifying-glass-plus', 'Zoom'], ['fa-solid fa-eye', 'Freelook'], ['fa-solid fa-circle-half-stroke', 'Fullbright'],
  ['fa-solid fa-skull', 'K/D'], ['fa-solid fa-burst', 'Combo'], ['fa-solid fa-ruler', 'Reach'], ['fa-solid fa-bullseye', 'Cel'],
  ['fa-solid fa-microchip', 'CPU'], ['fa-solid fa-display', 'GPU'], ['fa-solid fa-memory', 'RAM'], ['fa-solid fa-stopwatch', 'TPS'],
  ['fa-solid fa-chart-line', 'Wykres FPS'], ['fa-solid fa-network-wired', 'Sieć'], ['fa-solid fa-clock', 'Zegar'], ['fa-solid fa-hourglass-half', 'Sesja'],
  ['fa-solid fa-plane', 'Elytra'], ['fa-solid fa-feather-pointed', 'Strzały'], ['fa-solid fa-screwdriver-wrench', 'Wytrzymałość'], ['fa-solid fa-cube', 'Blok'],
  ['fa-solid fa-sun', 'Pora dnia'], ['fa-solid fa-tree', 'Biom'], ['fa-solid fa-person-running', 'Sprint'], ['fa-solid fa-location-dot', 'Punkty drogi'],
  ['fa-solid fa-comments', 'Zakładki czatu'], ['fa-solid fa-camera', 'Zrzuty do schowka'], ['fa-solid fa-user-group', 'Znajomi online'], ['fa-solid fa-list-ol', 'Scoreboard'],
];
const pill = ([i, name]) => el('span', { class: 'mod' }, icon(i), name);
const half = Math.ceil(MODULES.length / 2);
// each row twice, so the loop has no seam
for (const [id, list] of [['#mq1', MODULES.slice(0, half)], ['#mq2', MODULES.slice(half)]]) $(id).replaceChildren(...[...list, ...list].map(pill));

// ---------- more features ----------
const FEATURES = [
  ['fa-solid fa-users-gear', 'Wiele kont', 'Konta Microsoft i offline; przełączasz je także w grze, bez restartu.'],
  ['fa-solid fa-puzzle-piece', 'Mody z Modrinth', 'Mody, paczki i zasoby dobrane do wersji profilu.'],
  ['fa-solid fa-file-import', 'Import profili', 'Profile z Prism, MultiMC, CurseForge, Modrinth App i oficjalnego launchera.'],
  ['fa-solid fa-shirt', 'Skiny', 'Edytor skina, biblioteka skinów i podgląd 3D.'],
  ['fa-solid fa-server', 'Serwery', 'Opis, liczba graczy i ping; wejście jednym kliknięciem.'],
  ['fa-solid fa-earth-europe', 'Światy', 'Kopie zapasowe światów, zrzuty ekranu i klipy.'],
  ['fa-solid fa-triangle-exclamation', 'Crashe', 'Launcher czyta log i mówi, co poszło nie tak.'],
  ['fa-solid fa-rotate', 'Aktualizacje', 'Launcher sam sprawdza i instaluje nowe wersje.'],
];
$('#features').replaceChildren(...FEATURES.map(([i, t, p]) => el('div', { class: 'gf reveal' }, icon(i), el('h3', { textContent: t }), el('p', { textContent: p }))));

// ---------- faq ----------
const FAQ = [
  ['Ile kosztuje SlashClient?', 'Nic. Launcher, HUD, znajomi i peleryny są darmowe.'],
  ['Czy dostanę bana za SlashClient?', 'HUD pokazuje tylko to, co gra i tak wie, i nie daje przewagi jak cheaty. Serwery mają jednak własne zasady: jeśli serwer zabrania np. freelooka, wyłącz go w ustawieniach HUD.'],
  ['Na jakich wersjach działa HUD?', 'Minecraft 1.21.11 oraz 26.1–26.3, z Fabricem albo bez. Starsze wersje launcher też uruchomi, ale bez HUD-u.'],
  ['Czy działa z Sodium i innymi modami?', 'Tak. HUD to zwykły mod Fabric i działa razem z modami wydajności.'],
  ['Czy moje konto jest bezpieczne?', 'Do Microsoftu logujesz się na jego stronie, launcher nie widzi hasła. Konto SlashClient potwierdza Mojang, tak jak serwery Minecrafta, więc Twój token Minecrafta nie trafia na serwer SlashClient. Wiadomości do znajomych są szyfrowane i serwer nie może ich przeczytać.'],
  ['macOS mówi, że nie może sprawdzić aplikacji. Co zrobić?', 'SlashClient nie jest jeszcze podpisany przez Apple. Kliknij aplikację prawym przyciskiem, wybierz Otwórz i potwierdź. Wystarczy raz.'],
  ['Jak zaktualizować launcher?', 'Na Windowsie i Linuksie nowa wersja pobiera się sama i instaluje przy ponownym uruchomieniu. Na Macu launcher pokaże przycisk Pobierz.'],
  ['Kto widzi moją pelerynę?', 'Gracze z SlashClient, na każdym serwerze. Pozostali widzą Twój zwykły wygląd.'],
];
$('#faq-list').replaceChildren(...FAQ.map(([q, a], i) => el('details', { open: i === 0 }, el('summary', { textContent: q }), el('p', { textContent: a }))));

// ---------- scroll effects ----------
const nav = $('#nav');
const shot = $('#hero-shot');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function onScroll() {
  nav.classList.toggle('scrolled', scrollY > 10);
  if (reduced) return;
  // the screenshot lies back at first and stands up as the page moves
  const t = Math.min(1, scrollY / 420);
  shot.style.setProperty('--tilt', `${(14 * (1 - t)).toFixed(2)}deg`);
  shot.style.setProperty('--zoom', (0.96 + 0.04 * t).toFixed(3));
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    e.target.classList.add('in');
    io.unobserve(e.target);
  }
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
for (const r of document.querySelectorAll('.reveal')) io.observe(r);
