// Shared by the player page and the admin panel: the API with the saved session, sign-in,
// small DOM helpers and toasts. The session token stays in this browser only (localStorage).

import { gameIconInto } from './preview.js';

const TOKEN = 'slashclient.token';

export const token = {
  get: () => localStorage.getItem(TOKEN) ?? '',
  set: (t) => (t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN)),
};

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token.get()) headers.Authorization = `Bearer ${token.get()}`;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // a session that ended (signed out elsewhere, banned) is forgotten here too
    if (res.status === 401) token.set('');
    throw new ApiError(data.error ?? 'server_error', res.status);
  }
  return data;
}

/** Sends a picture (PNG or JPG) as it is, for a partner server's background. */
export async function uploadPicture(path, file) {
  if (file.size > 3 * 1024 * 1024) throw new ApiError('too_large', 413);
  const headers = { 'Content-Type': file.type || 'application/octet-stream' };
  if (token.get()) headers.Authorization = `Bearer ${token.get()}`;
  const res = await fetch(path, { method: 'PUT', headers, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'server_error', res.status);
  return data;
}

/** A partner server's card: its background as it shows behind the server in the game's list. */
/**
 * A partner server as the game's server list shows it with SlashClient: one row of the list
 * (300×32 in the game, drawn here twice as large), the picture filling it dimmed by half, the
 * server's icon, name with the gold "Partner" badge, its description, players and ping, in a gold frame.
 */
export function partnerBanner(p, extra = []) {
  const bars = el('span', { class: 'mc-bars' }, ...[1, 2, 3, 4, 5].map((n) => el('i', { style: `height:${n * 2 + 2}px` })));
  const row = el('div', { class: `partner-banner${p.background ? '' : ' empty'}` },
    el('div', { class: 'mc-icon' }, el('img', { src: '/vendor/logo.png', alt: '' })),
    el('div', { class: 'mc-text' },
      el('div', { class: 'mc-name' }, el('span', { textContent: p.name || p.address }), el('span', { class: 'mc-badge' }, icon('fa-solid fa-handshake'), 'Partner')),
      el('div', { class: 'mc-motd', textContent: p.address })),
    el('div', { class: 'mc-status' }, el('span', { textContent: '123/500' }), bars),
    ...extra);
  if (p.background) row.style.backgroundImage = `linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,.5)), url("${p.background}")`;
  return el('div', { class: 'partner-row-wrap' }, row);
}

const ERRORS = {
  unauthorized: 'Sesja wygasła, zaloguj się ponownie.',
  banned: 'To konto jest zablokowane.',
  not_admin: 'To konto nie ma dostępu do panelu admina.',
  bad_picture: 'To nie jest obrazek PNG ani JPG.',
  too_large: 'Obrazek jest za duży (do 3 MB).',
  bad_server: 'To nie wygląda na adres serwera.',
  exists: 'Ten serwer już jest na liście.',
  not_owner: 'To nie Twój serwer.',
  bad_name: 'Nick: 3–16 znaków, litery, cyfry i _.',
  bad_cape: 'Tej peleryny nie możesz teraz założyć.',
  provider_disabled: 'Ten sposób logowania jest wyłączony.',
  provider_failed: 'Logowanie się nie udało, spróbuj ponownie.',
  provider_denied: 'Logowanie przerwane.',
  login_expired: 'Logowanie wygasło, spróbuj ponownie.',
  rate_limited: 'Za dużo prób, odczekaj chwilę.',
  self: 'Nie możesz zrobić tego swojemu kontu.',
  config_admin: 'To konto jest adminem z konfiguracji serwera (ADMIN_HANDLES).',
  no_such_user: 'Nie ma takiego gracza.',
  not_found: 'Nie znaleziono.',
  cancelled: 'Logowanie anulowane.',
  not_linked: 'To konto nie jest podpięte do żadnego konta SlashClient. Załóż konto w launcherze (kontem Minecraft) i podepnij ten sposób logowania w zakładce Znajomi.',
  title_too_short: 'Tytuł jest za krótki.',
  body_too_short: 'Opisz problem trochę dokładniej.',
  bad_log: 'Nie ma takiego logu (może już wygasł).',
  empty: 'Nic nie wpisano.',
  forbidden: 'Nie możesz tego zrobić.',
  last_provider: 'To jedyny sposób logowania. Najpierw podepnij inny.',
  not_enough_sparks: 'Za mało Iskier.',
  owned: 'Masz już ten przedmiot.',
  not_for_sale: 'Tego nie ma w sklepie.',
  bad_amount: 'Podaj liczbę Iskier różną od zera (najwyżej 100 000).',
  bad_reason: 'Podaj powód (3–200 znaków).',
  bad_price: 'Cena: liczba od 1 do 100 000.',
  not_sellable: 'Tego przedmiotu nie można sprzedawać (ranga albo nagroda za osiągnięcie).',
  // the achievement creator
  bad_id: 'Id: małe litery, cyfry i _, 3–40 znaków, zaczyna się od litery.',
  id_taken: 'Takie id już jest (także wśród wbudowanych).',
  bad_metric: 'Wybierz warunek z listy.',
  bad_goal: 'Cel poza zakresem dla tej metryki.',
  bad_icon: 'Wybierz ikonę z listy.',
  bad_reward: 'Nie ma takiego przedmiotu.',
  bad_sparks: 'Iskry: liczba od 0 do 10 000.',
  bad_name: 'Podaj nazwę i opis (po polsku).',
  bad_nameEn: 'Nazwa po angielsku: najwyżej 60 znaków.',
  bad_description: 'Opis: 1–200 znaków.',
  bad_descriptionEn: 'Opis po angielsku: najwyżej 200 znaków.',
  bad_category: 'Wybierz kategorię z listy.',
  has_holders: 'Ktoś już ma to osiągnięcie: wyłącz je zamiast usuwać.',
  built_in: 'Wbudowanych osiągnięć nie da się usunąć, można je wyłączyć.',
  not_manual: 'To osiągnięcie jest liczone automatycznie.',
  not_held: 'Ten gracz go nie ma.',
  no_player: 'Nie ma takiego gracza.',
  bad_players: 'Podaj od 1 do 100 graczy.',
  disabled: 'Osiągnięcie jest wyłączone.',
};
export const errorText = (err) => ERRORS[err?.code] ?? (err?.message || 'Coś poszło nie tak.');

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node[k] = v;
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
export const icon = (name) => el('i', { class: name });
export const $ = (sel) => document.querySelector(sel);

export function toast(text, isError = false) {
  let box = document.getElementById('toasts');
  if (!box) document.body.append(box = el('div', { id: 'toasts' }));
  const t = el('div', { class: `toast${isError ? ' error' : ''}`, role: isError ? 'alert' : 'status' },
    icon(`fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}`), el('span', { textContent: text }));
  box.append(t);
  setTimeout(() => t.remove(), isError ? 7000 : 3500);
}

export async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    toast(errorText(err), true);
    return undefined;
  }
}

/** A cape's front, cut from its texture. */
export function capeEl(id, small = false) {
  const c = el('div', { class: `cape${small ? ' sm' : ''}`, title: id });
  c.style.backgroundImage = `url(/vendor/capes/${id}.png)`;
  return c;
}

/** The cosmetics' slots: name and icon, in the order they are shown. */
export const SLOTS = [
  ['cape', 'Peleryna', 'fa-solid fa-flag'], ['wings', 'Skrzydła', 'fa-solid fa-dove'], ['elytra', 'Elytra', 'fa-solid fa-feather'],
  ['trail', 'Ślad', 'fa-solid fa-shoe-prints'], ['aura', 'Aura', 'fa-solid fa-wand-sparkles'], ['pet', 'Pupil', 'fa-solid fa-paw'],
  ['hat', 'Na głowę', 'fa-solid fa-hat-cowboy'], ['top', 'Ubranie', 'fa-solid fa-shirt'], ['kill', 'Efekt zabójstwa', 'fa-solid fa-skull-crossbones'],
  ['suit', 'Strój', 'fa-solid fa-user-astronaut'],
  ['shield', 'Tarcza', 'fa-solid fa-shield'], ['weapon', 'Skórka broni', 'fa-solid fa-crosshairs'],
  ['shoes', 'Buty', 'fa-solid fa-socks'], ['hands', 'Dłonie', 'fa-solid fa-mitten'],
  ['face', 'Twarz', 'fa-solid fa-glasses'], ['ears', 'Uszy i rogi', 'fa-solid fa-cat'],
  ['back', 'Na plecy', 'fa-solid fa-person-hiking'], ['tail', 'Ogon', 'fa-solid fa-cat'],
  ['ring', 'Krąg pod stopami', 'fa-solid fa-circle-dot'], ['move', 'Efekt ruchu', 'fa-solid fa-person-running'],
  ['spray', 'Spray', 'fa-solid fa-spray-can'],
  ['prop', 'Rekwizyt', 'fa-solid fa-dolly'],
];
/** Particles and pets are the game's own: on the site they get an icon. */
const ITEM_ICONS = {
  hearts: 'fa-heart', sparks: 'fa-bolt', snow: 'fa-snowflake', notes: 'fa-music', flames: 'fa-fire',
  enchant: 'fa-book-open', portal: 'fa-circle-notch', cherry: 'fa-spa', souls: 'fa-ghost', royal: 'fa-crown',
  allay: 'fa-feather-pointed', vex: 'fa-skull', bat: 'fa-moon', parrot: 'fa-crow', bee: 'fa-bug',
  clouds: 'fa-cloud', stars: 'fa-star', bubbles: 'fa-circle', emerald: 'fa-gem', soulfire: 'fa-fire-flame-curved',
  glow: 'fa-lightbulb', magic: 'fa-hat-wizard', amber: 'fa-droplet', sculk: 'fa-ghost',
  blaze: 'fa-fire', phantom: 'fa-dragon',
  crits: 'fa-burst', witch: 'fa-flask', ink: 'fa-droplet', ash: 'fa-smog',
  spores: 'fa-seedling', nautilus: 'fa-water', tears: 'fa-face-sad-tear', fireflies: 'fa-lightbulb',
  axolotl: 'fa-fish', frog: 'fa-frog', fox: 'fa-paw',
  // kill effects
  lightning: 'fa-bolt-lightning', blood: 'fa-droplet', heartburst: 'fa-heart-crack', firework: 'fa-wand-magic-sparkles',
  soulrise: 'fa-fire-flame-curved', enderpoof: 'fa-eye', confetti: 'fa-champagne-glasses', blast: 'fa-explosion',
  shatter: 'fa-icicles', coins: 'fa-coins', ghost: 'fa-ghost', flamering: 'fa-ring',
  // movement effects
  move_steps: 'fa-shoe-prints', move_jump: 'fa-cloud', move_landing: 'fa-burst', move_arrows: 'fa-location-arrow',
  move_sprint: 'fa-bolt', move_bubbles: 'fa-circle-dot', move_petals: 'fa-spa',
};
/** The movement effects' icons in their own colours (as in the launcher). */
const MOVE_ICON_COLORS = {
  move_steps: '#9fe4ff', move_jump: '#f4f4f4', move_landing: '#fff1a0', move_arrows: '#ffd84a', move_sprint: '#fff6b0',
  move_bubbles: '#7fd4ff', move_petals: '#ffb7d5',
};
/** The animated rings and how many frames each has (vendor/rings/<id>_<n>.png; the others <id>.png). */
const RING_FRAMES = { ring_runes: 8, ring_flame: 8, ring_rainbow: 8, ring_galaxy: 8, ring_toxic: 8 };
/** The kill effects' icons in their own colours (as in the launcher). */
const KILL_ICON_COLORS = {
  lightning: '#bfe6ff', blood: '#d32f2f', heartburst: '#ff5c7a', firework: '#ffd93b', soulrise: '#5fe3f0', enderpoof: '#c070ff',
  confetti: '#ff7ad9', blast: '#ffa21f', shatter: '#9fd8ff', coins: '#ffd23f', ghost: '#f4f6ff', flamering: '#ff6a1f',
};

/** Pets of our own (not the game's mobs). */
const OUR_PETS = ['duszek_haze'];

/** A picture of any cosmetic: the cape's front, a wing's back, a view of the clothing (or a back item or tail), or an icon. */
export function cosmeticEl(id, slot = 'cape', small = false) {
  if (slot === 'cape') return capeEl(id, small);
  // our own pets have a picture of their own (vendor/pets/icon), like the clothing
  // back items and tails too (vendor/gear/icon), seen from behind
  if (slot === 'hat' || slot === 'top' || slot === 'shoes' || slot === 'hands' || slot === 'face' || slot === 'ears' || slot === 'back' || slot === 'tail' || OUR_PETS.includes(id)) {
    const c = el('div', { class: `cape clothing${small ? ' sm' : ''}`, title: id });
    c.style.backgroundImage = `url(/vendor/${slot === 'pet' ? 'pets' : slot === 'back' || slot === 'tail' ? 'gear' : 'clothing'}/icon/${id}.png)`;
    return c;
  }
  // a suit: the whole of it from the front (vendor/suits/icon)
  if (slot === 'suit') {
    const c = el('div', { class: `cape clothing${small ? ' sm' : ''}`, title: id });
    c.style.backgroundImage = `url(/vendor/suits/icon/${id}.png)`;
    return c;
  }
  // a shield's face (12×22 at 1,1 of the game's 64×64 layout, ours 4×), a weapon's own picture
  if (slot === 'shield') {
    const c = el('div', { class: `cape held${small ? ' sm' : ''}`, title: id });
    const h = small ? 48 : 96, w = small ? 30 : 60, s = h / 88;
    c.style.backgroundImage = `url(/vendor/held/${id}.png)`;
    c.style.backgroundSize = `${256 * s}px ${256 * s}px`;
    c.style.backgroundPosition = `${(w - 48 * s) / 2 - 4 * s}px ${-4 * s}px`;
    return c;
  }
  if (slot === 'weapon') {
    const c = el('div', { class: `cape clothing${small ? ' sm' : ''}`, title: id });
    c.style.backgroundImage = `url(/vendor/held/${id}.png)`;
    c.style.backgroundSize = small ? '24px 24px' : '48px 48px';
    return c;
  }
  // a spray is its picture (pixel art: kept sharp)
  if (slot === 'spray') {
    const c = el('div', { class: `cape clothing spray${small ? ' sm' : ''}`, title: id });
    c.style.backgroundImage = `url(/vendor/spray/${id}.png)`;
    return c;
  }
  // props: a view of it from its side
  if (slot === 'prop') {
    const c = el('div', { class: `cape clothing${small ? ' sm' : ''}`, title: id });
    c.style.backgroundImage = `url(/vendor/props/icon/${id}.png)`;
    return c;
  }
  if (slot === 'wings' || slot === 'elytra') {
    const c = el('div', { class: `cape wing${small ? ' sm' : ''}`, title: id });
    c.style.backgroundImage = `url(/vendor/${slot}/${id}.png)`;
    return c;
  }
  // a ring: the left half of its picture (the right one is see-through)
  if (slot === 'ring') {
    const c = el('div', { class: `cape ring${small ? ' sm' : ''}`, title: id });
    c.style.backgroundImage = `url(/vendor/rings/${RING_FRAMES[id] ? `${id}_0` : id}.png)`;
    return c;
  }
  // movement effects are the game's particles: their icon, in its colour
  if (slot === 'move') {
    const box = el('div', { class: `cape icon-item${small ? ' sm' : ''}`, title: id }, icon(`fa-solid ${ITEM_ICONS[id] ?? 'fa-person-running'}`));
    box.style.color = MOVE_ICON_COLORS[id] ?? '';
    return box;
  }
  // kill effects are bursts of particles: their icon, in its colour
  if (slot === 'kill') {
    const box = el('div', { class: `cape icon-item${small ? ' sm' : ''}`, title: id }, icon(`fa-solid ${ITEM_ICONS[id] ?? 'fa-skull-crossbones'}`));
    box.style.color = KILL_ICON_COLORS[id] ?? '';
    return box;
  }
  // the game's own pictures (the launcher's icons) replace the Font Awesome one once loaded
  const box = el('div', { class: `cape icon-item${small ? ' sm' : ''}`, title: id }, icon(`fa-solid ${ITEM_ICONS[id] ?? 'fa-star'}`));
  gameIconInto(box, id);
  return box;
}

export function avatarEl(user, big = false) {
  if (user.avatar) return el('img', { class: `avatar${big ? ' big' : ''}`, src: user.avatar, alt: '', referrerPolicy: 'no-referrer' });
  return el('div', { class: `avatar${big ? ' big' : ''}`, textContent: (user.name || user.handle || '?').slice(0, 1).toUpperCase() });
}

export const PROVIDERS = {
  discord: ['Discord', 'fa-brands fa-discord'],
  microsoft: ['Microsoft', 'fa-brands fa-microsoft'],
  google: ['Google', 'fa-brands fa-google'],
  github: ['GitHub', 'fa-brands fa-github'],
  minecraft: ['Minecraft', 'fa-solid fa-cube'],
};

/**
 * Signs in through Discord, Microsoft, Google or GitHub: the provider opens in a new window and
 * this page asks the server until that window is done (the same flow the launcher uses).
 */
export async function signInWith(provider) {
  const popup = window.open('about:blank', 'slashclient-login', 'width=520,height=720');
  const { state, url, code } = await api('POST', `/v1/auth/${provider}/start`);
  if (popup) popup.location.href = url;
  else window.open(url, '_blank', 'noopener');
  // Microsoft: a code to type on its page, shown here until the sign-in is done
  const box = code ? showLoginCode(code, url) : undefined;
  try {
    const started = Date.now();
    while (Date.now() - started < 10 * 60_000) {
      await new Promise((r) => setTimeout(r, 1500));
      if (box?.cancelled) throw new ApiError('cancelled', 400);
      const res = await api('GET', `/v1/auth/poll?state=${encodeURIComponent(state)}`);
      if (res.pending) continue;
      token.set(res.token);
      popup?.close();
      return res.user;
    }
    throw new ApiError('login_expired', 400);
  } finally {
    box?.remove();
  }
}

/** The box with a sign-in code: copy it, paste it on the provider's page. */
function showLoginCode(code, url) {
  const copy = el('button', { type: 'button', onclick: async () => {
    await navigator.clipboard.writeText(code).catch(() => {});
    toast('Skopiowano kod');
  } }, icon('fa-regular fa-copy'), ' Kopiuj kod');
  const state = { cancelled: false };
  const cancel = el('button', { type: 'button', onclick: () => { state.cancelled = true; } }, 'Anuluj');
  const box = el('div', { class: 'login-code-backdrop' },
    el('div', { class: 'glass card login-code', role: 'dialog' },
      el('h3', { textContent: 'Wpisz kod u Microsoftu' }),
      el('p', { class: 'muted' }, 'Otwórz ', el('a', { href: url, target: '_blank', rel: 'noopener', textContent: url.replace(/^https:\/\/(www\.)?/, '') }), ' i wpisz kod:'),
      el('div', { class: 'login-code-value', textContent: code }),
      el('div', { class: 'row' }, copy, cancel),
      el('p', { class: 'muted small', textContent: 'Czekam na zalogowanie…' })));
  document.body.append(box);
  navigator.clipboard?.writeText(code).catch(() => {});
  return Object.assign(state, { remove: () => box.remove() });
}

export async function signInDev(name) {
  const res = await api('POST', '/v1/auth/dev', { name });
  token.set(res.token);
  return res.user;
}

export async function signOut() {
  await api('POST', '/v1/auth/logout').catch(() => {});
  token.set('');
}

export const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export function ago(ms) {
  if (!ms) return '—';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'przed chwilą';
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 86_400) return `${Math.floor(s / 3600)} godz. temu`;
  return `${Math.floor(s / 86_400)} dni temu`;
}
