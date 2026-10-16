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
api('GET', '/v1/cosmetics').then(({ capes }) => {
  $('#cape-strip').replaceChildren(...capes.map((c) => {
    const d = el('div', { class: 'cape', title: c.exclusive ? `${c.name} (ekskluzywna)` : c.name });
    d.style.backgroundImage = `url(vendor/capes/${c.id}.png)`;
    return d;
  }));
}).catch(() => {});

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
  ['fa-solid fa-users-gear', 'Wiele kont', 'Kilka kont Microsoft i offline naraz; przełączasz je nawet w grze.'],
  ['fa-solid fa-puzzle-piece', 'Mody z Modrinth', 'Wyszukiwarka modów, paczek i zasobów, dobranych do wersji profilu.'],
  ['fa-solid fa-file-import', 'Import profili', 'Przenieś profile z innych launcherów jednym kliknięciem.'],
  ['fa-solid fa-shirt', 'Skiny i peleryny', 'Edytor skina, biblioteka skinów i podgląd 3D z peleryną.'],
  ['fa-solid fa-server', 'Lista serwerów', 'Serwery z opisem, liczbą graczy i pingiem; wejście jednym kliknięciem.'],
  ['fa-solid fa-earth-europe', 'Światy i kopie', 'Kopie zapasowe światów, zrzuty ekranu i klipy w jednym miejscu.'],
  ['fa-solid fa-triangle-exclamation', 'Pomoc przy crashach', 'Launcher czyta log i mówi, co poszło nie tak i jak to naprawić.'],
  ['fa-brands fa-discord', 'Status na Discordzie', 'Znajomi widzą, w co i gdzie grasz.'],
];
$('#features').replaceChildren(...FEATURES.map(([i, t, p]) => el('div', { class: 'gf reveal' }, icon(i), el('h3', { textContent: t }), el('p', { textContent: p }))));

// ---------- faq ----------
const FAQ = [
  ['Czy SlashClient jest darmowy?', 'Tak, w całości i na zawsze. Launcher, HUD, znajomi i peleryny nic nie kosztują.'],
  ['Czy mogę dostać bana za SlashClient?', 'HUD pokazuje tylko informacje, które gra i tak ma, i nie daje przewagi jak cheaty. Każdy serwer ma jednak własne zasady; jeśli zabrania modów (np. minimapy czy freelooka), wyłącz je w ustawieniach HUD.'],
  ['Na jakich wersjach Minecrafta działa?', 'HUD działa na Minecrafcie 1.21.11 oraz 26.1–26.3, z Fabricem albo na czystym Minecrafcie; launcher uruchamia też starsze wersje, wtedy bez HUD-u.'],
  ['Czy działa z innymi modami, np. Sodium?', 'Tak. SlashClient HUD to zwykły mod Fabric; Sodium, Lithium i inne mody wydajności działają razem z nim, a launcher sam je podpowiada.'],
  ['Czy moje konto Microsoft jest bezpieczne?', 'Logujesz się oficjalnym oknem Microsoftu; launcher nie widzi Twojego hasła. Konto SlashClient do znajomych jest osobne i nie zmienia logowania do gry.'],
  ['Kto widzi moją pelerynę?', 'Wszyscy gracze, którzy grają z SlashClient, na dowolnym serwerze. Gracze bez SlashClienta widzą Twój zwykły wygląd.'],
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
