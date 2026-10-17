// Shared by the player page and the admin panel: the API with the saved session, sign-in,
// small DOM helpers and toasts. The session token stays in this browser only (localStorage).

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

const ERRORS = {
  unauthorized: 'Sesja wygasła, zaloguj się ponownie.',
  banned: 'To konto jest zablokowane.',
  not_admin: 'To konto nie ma dostępu do panelu admina.',
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
  last_provider: 'To jedyny sposób logowania. Najpierw podepnij inny.',
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
  c.style.backgroundImage = `url(vendor/capes/${id}.png)`;
  return c;
}

/** The cosmetics' slots: name and icon, in the order they are shown. */
export const SLOTS = [
  ['cape', 'Peleryna', 'fa-solid fa-flag'], ['wings', 'Skrzydła', 'fa-solid fa-dove'], ['elytra', 'Elytra', 'fa-solid fa-feather'],
  ['trail', 'Ślad', 'fa-solid fa-shoe-prints'], ['aura', 'Aura', 'fa-solid fa-wand-sparkles'], ['pet', 'Pupil', 'fa-solid fa-paw'],
];
/** Particles and pets are the game's own: on the site they get an icon. */
const ITEM_ICONS = {
  hearts: 'fa-heart', sparks: 'fa-bolt', snow: 'fa-snowflake', notes: 'fa-music', flames: 'fa-fire',
  enchant: 'fa-book-open', portal: 'fa-circle-notch', cherry: 'fa-spa', souls: 'fa-ghost', royal: 'fa-crown',
  allay: 'fa-feather-pointed', vex: 'fa-skull', bat: 'fa-moon', parrot: 'fa-crow', bee: 'fa-bug',
};

/** A picture of any cosmetic: the cape's front, a wing's back, or an icon. */
export function cosmeticEl(id, slot = 'cape', small = false) {
  if (slot === 'cape') return capeEl(id, small);
  if (slot === 'wings' || slot === 'elytra') {
    const c = el('div', { class: `cape wing${small ? ' sm' : ''}`, title: id });
    c.style.backgroundImage = `url(vendor/${slot}/${id}.png)`;
    return c;
  }
  return el('div', { class: `cape icon-item${small ? ' sm' : ''}`, title: id }, icon(`fa-solid ${ITEM_ICONS[id] ?? 'fa-star'}`));
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
