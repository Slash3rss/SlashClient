// The landing page: download button for the visitor's system, the screenshot that straightens
// as you scroll, sections that fade in and the capes. The words, the modules, the features and
// the FAQ come in the page from the server (edited in the admin panel's "Strona główna").
import { $, animateCape, api, el, icon, token } from './common.js';

const EN = document.documentElement.lang === 'en';

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
// the button's words from the page ({os} is the system's name)
const words = $('#download-main').dataset;
const downloadPath = words.path || '/pobierz/';
if (phone) {
  // nothing to install on a phone: say so instead of offering a file it can't open
  for (const id of ['#download-main', '#download-final']) {
    const b = $(id);
    b.removeAttribute('href');
    b.classList.add('disabled');
    b.setAttribute('aria-disabled', 'true');
  }
  $('#os-icon').className = 'fa-solid fa-desktop';
  $('#os-label').textContent = words.phone;
  $('#download-final').replaceChildren(icon('fa-solid fa-desktop'), ` ${words.phone}`);
  $('#download-note').textContent = words.phoneNote ?? '';
} else {
  $('#os-label').textContent = (words.label ?? '').replaceAll('{os}', SYSTEMS[mine][0]);
  $('#os-icon').className = SYSTEMS[mine][1];
  for (const id of ['#download-main', '#download-final']) $(id).href = `${downloadPath}${mine}`;
  // the others, and the Intel build for older Macs (the main macOS button is Apple Silicon)
  const links = [['windows', 'Windows'], ['mac', 'macOS (Apple Silicon)'], ['mac-intel', 'macOS (Intel)'], ['linux', 'Linux']]
    .filter(([os]) => os !== mine)
    .map(([os, name]) => el('a', { href: `${downloadPath}${os}` }, name));
  const note = $('#download-note');
  note.replaceChildren(words.other ? `${words.other} ` : '');
  links.forEach((a, i) => note.append(...(i ? [' · ', a] : [a])));
}

// ---------- the language ----------
// the link to the other language remembers the choice, so "/" does not send the visitor back (src/sitePages.ts)
for (const a of document.querySelectorAll('a[hreflang]')) {
  a.addEventListener('click', () => {
    document.cookie = `slash_lang=${a.getAttribute('hreflang') === 'en' ? 'en' : 'pl'}; path=/; max-age=31536000; SameSite=Lax`;
  });
}

// ---------- the account button ----------
if (token.get()) {
  api('GET', '/v1/me').then((me) => {
    // either can be hidden in the admin panel (not on the page then)
    const label = $('#nav-account .label');
    if (label) label.textContent = me.name;
    $('#nav-admin')?.classList.toggle('hidden', !me.admin);
  }).catch(() => {});
}

// ---------- capes ----------
for (const c of document.querySelectorAll('[data-cape]')) {
  c.style.backgroundImage = `url(/vendor/capes/${c.dataset.cape}.png)`;
  animateCape(c, c.dataset.cape);
}
const strip = $('#cape-strip');
if (strip) {
  api('GET', '/v1/cosmetics').then(({ capes, items }) => {
    // the shop's capes carry their price in sparks (from achievements)
    const prices = Object.fromEntries((items ?? []).filter((i) => i.price).map((i) => [i.id, i.price]));
    strip.replaceChildren(...capes.map((c) => {
      const price = prices[c.id];
      const title = price ? (EN ? `${c.name}: in the shop for ${price} Sparks from achievements` : `${c.name}: w sklepie za ${price} Iskier z osiągnięć`)
        : c.exclusive ? `${c.name} (${EN ? 'exclusive' : 'ekskluzywna'})` : c.name;
      const d = el('div', { class: `cape${price ? ' priced' : ''}`, title });
      d.style.backgroundImage = `url(/vendor/capes/${c.id}.png)`;
      animateCape(d, c.id);
      if (price) d.append(el('span', { class: 'spark-price', textContent: `✦ ${price}` }));
      return d;
    }));
  }).catch(() => {});
}

// ---------- the 3D figure: a few sets in turn ----------
const SETS = [
  [{ cape: 'aurora', trail: 'stars' }, 'Peleryna Zorza i ślad Fajerwerki', 'Aurora cape and Fireworks trail'],
  [{ wings: 'phoenix', aura: 'royal', pet: 'allay' }, 'Skrzydła Feniks, aura Królewska, pupil Allay', 'Phoenix wings, Royal aura, Allay pet'],
  [{ cape: 'matrix', pet: 'bee' }, 'Peleryna Matrix i pupil Pszczoła', 'Matrix cape and Bee pet'],
  [{ wings: 'prism', trail: 'hearts' }, 'Skrzydła Pryzmat i ślad Serca', 'Prism wings and Hearts trail'],
  [{ elytra: 'nebula', aura: 'sculk', pet: 'phantom' }, 'Elytra Mgławica, aura Sculk, pupil Fantom', 'Nebula elytra, Sculk aura, Phantom pet'],
  [{ cape: 'sakura', aura: 'cherry', pet: 'parrot' }, 'Peleryna Sakura, aura Wiśnia, pupil Papuga', 'Sakura cape, Cherry aura, Parrot pet'],
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
        const [set, pl, en] = SETS[i++ % SETS.length];
        p.show(set);
        $('#cosmetic-3d-caption').textContent = EN ? en : pl;
      };
      next();
      setInterval(() => { if (!document.hidden) next(); }, 4500);
    } catch {
      stage.classList.add('hidden');
    }
  });
  seen.observe(stage);
}

// ---------- scroll effects ----------
const nav = $('#nav');
const shot = $('#hero-shot');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
function onScroll() {
  nav.classList.toggle('scrolled', scrollY > 10);
  if (reduced() || !shot) return;
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
