// Shared by the player page and the admin panel: the API with the saved session, sign-in,
// small DOM helpers and toasts. The session token stays in this browser only (localStorage).

import { gameIconInto } from './preview.js';

const TOKEN = 'slashclient.token';

export const token = {
  get: () => localStorage.getItem(TOKEN) ?? '',
  set: (t) => (t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN)),
};

export class ApiError extends Error {
  /** `data`: the rest of the server's answer (which address, which partner), for a clearer message. */
  constructor(code, status, data = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.data = data;
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
    throw new ApiError(data.error ?? 'server_error', res.status, data);
  }
  return data;
}

/** Sends a picture as it is, for a partner server's background (PNG or JPG) or animated icon (GIF or APNG). */
export async function uploadPicture(path, file, max = 3 * 1024 * 1024) {
  if (file.size > max) throw new ApiError('too_large', 413);
  const headers = { 'Content-Type': file.type || 'application/octet-stream' };
  if (token.get()) headers.Authorization = `Bearer ${token.get()}`;
  const res = await fetch(path, { method: 'PUT', headers, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'server_error', res.status);
  return data;
}

/**
 * Plays a partner's animated icon: the server keeps it as one PNG with the frames stacked top to
 * bottom (`iconSize` square each, `iconDelays` ms each), the same strip SlashClient HUD draws in the game.
 */
export function animatedIcon(p, cls = '') {
  const canvas = el('canvas', { class: cls, width: p.iconSize, height: p.iconSize });
  const ctx = canvas.getContext('2d');
  const img = new Image();
  let frame = 0, shown = false;
  const draw = () => {
    // stops once the page is redrawn without this canvas
    if (canvas.isConnected) shown = true;
    else if (shown) return;
    ctx.clearRect(0, 0, p.iconSize, p.iconSize);
    ctx.drawImage(img, 0, frame * p.iconSize, p.iconSize, p.iconSize, 0, 0, p.iconSize, p.iconSize);
    const delay = p.iconDelays[frame] ?? 100;
    frame = (frame + 1) % Math.max(1, p.iconDelays.length);
    setTimeout(draw, delay);
  };
  img.onload = draw;
  img.src = p.icon;
  return canvas;
}

const ICON_ERRORS = { bad_icon: 'bad_icon_file', too_large: 'icon_too_large' };

/**
 * The animated icon's controls on a partner's card (the account page and the admin panel): a preview,
 * upload, remove and the limits. `path` is the icon's address in the API, `done` redraws the page.
 */
export function partnerIconControls(p, path, limits, done) {
  const preview = el('div', { class: 'partner-icon-preview' });
  const show = () => preview.replaceChildren(p.icon ? animatedIcon(p) : icon('fa-regular fa-image'));
  show();
  const input = el('input', { type: 'file', accept: 'image/gif,image/png', class: 'hidden' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // the original file while it uploads (the browser plays GIF and APNG itself)
    const url = URL.createObjectURL(file);
    preview.replaceChildren(el('img', { src: url, alt: '' }));
    const ok = await guard(async () => {
      try {
        return await uploadPicture(path, file, limits?.bytes ?? 2 * 1024 * 1024);
      } catch (e) {
        throw ICON_ERRORS[e?.code] ? new ApiError(ICON_ERRORS[e.code], e.status) : e;
      }
    });
    URL.revokeObjectURL(url);
    if (ok) {
      toast('Ikona zapisana.');
      done();
    } else show();
  });
  const mb = Math.round(((limits?.bytes ?? 2 * 1024 * 1024) / 1024 / 1024) * 10) / 10;
  return el('div', { class: 'row partner-icon' }, preview,
    el('label', { class: 'btn' }, icon('fa-solid fa-film'), p.icon ? 'Zmień animowaną ikonę' : 'Animowana ikona', input),
    p.icon ? el('button', { onclick: async () => { if (await guard(() => api('DELETE', path))) done(); } }, icon('fa-solid fa-eraser'), 'Usuń ikonę') : '',
    el('small', { class: 'muted', textContent: `GIF lub APNG, kwadrat (inne są przycinane do środka), do ${mb} MB i ${limits?.frames ?? 64} klatek; większe niż ${limits?.side ?? 128}×${limits?.side ?? 128} px są zmniejszane. W grze zastępuje ikonę serwera.` }));
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
    // the animated icon replaces the server's own one in the game
    el('div', { class: 'mc-icon' }, p.icon ? animatedIcon(p) : el('img', { src: '/vendor/logo.png', alt: '' })),
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
  bad_alias: (d) => d.alias ? `„${d.alias}” nie wygląda na adres serwera.` : 'Któryś adres nie wygląda na adres serwera.',
  alias_taken: (d) => `Adres ${d.alias ?? ''} należy już do serwera partnerskiego ${d.partner ?? ''}.`,
  too_many_aliases: (d) => `Za dużo adresów (najwięcej ${d.max ?? 20}).`,
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
  // the challenges (adminChallenges.js)
  bad_period: 'Ta metryka liczy się tylko w wyzwaniach tygodniowych.',
  bad_target: 'Cel poza zakresem dla tej metryki.',
  bad_weight: 'Waga: liczba od 0 do 100.',
  // ranks (adminRanks.js, the account page)
  bad_rank_id: 'Id rangi: małe litery, cyfry i _, 2–24 znaki, zaczyna się od litery.',
  rank_exists: 'Ranga o takim id już jest.',
  bad_rank_name: 'Podaj nazwę rangi.',
  bad_color: 'Kolor w postaci #rrggbb.',
  bad_priority: 'Kolejność: liczba od 0 do 1000.',
  builtin_rank: 'Wbudowanej rangi nie da się usunąć, można ją wyłączyć.',
  bad_rank: 'Nie ma takiej rangi.',
  auto_rank: 'Ta ranga przychodzi sama (rola admina albo wsparcie), nie nadaje się jej ręcznie.',
  bad_expiry: 'Data wygaśnięcia musi być w przyszłości.',
  not_your_rank: 'Nie masz tej rangi.',
  not_png: 'To nie jest plik PNG.',
  bad_logo_size: 'Ikona rangi: PNG 16×16 albo 32×32 piksele.',
  bad_level: 'Poziom wsparcia: liczba od 0 do 100.',
  not_for_supporters: 'Ten przedmiot daje ranga albo osiągnięcie, nie wsparcie.',
  feature_disabled: 'Ta funkcja jest chwilowo wyłączona.',
  // a partner server's animated icon (the server's 'bad_icon' and 'too_large', renamed by partnerIconControls)
  bad_icon_file: 'To nie jest animowany GIF ani PNG/APNG albo plik jest uszkodzony.',
  icon_too_large: 'Ikona jest za duża.',
  too_many_frames: 'Animacja ma za dużo klatek.',
  webp_unsupported: 'Animowany WebP nie jest obsługiwany. Zapisz animację jako GIF albo APNG.',
};
export const errorText = (err) => {
  const text = ERRORS[err?.code];
  return (typeof text === 'function' ? text(err.data ?? {}) : text) ?? (err?.message || 'Coś poszło nie tak.');
};

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

/**
 * The site's own question instead of the browser's confirm(): a title, what will happen, and the
 * buttons "Anuluj" and the action. Escape, a click beside the box or "Anuluj" says no; Enter says yes.
 * `list`: rows under the text, each a string or a change { name, from, to, note?, risky? } shown as
 * "name: old → new" (risky ones in gold); `warning`: a gold box above the buttons; `danger`: the
 * action button in red (deleting, taking away). Resolves true for yes.
 */
export function confirmModal({ title, text, list, warning, ok = 'OK', okIcon, danger = false, cancel = 'Anuluj', icon: headIcon } = {}) {
  return openModal({ title, text, list, warning, ok, okIcon, danger, cancel, headIcon }).then((v) => v !== null);
}

/**
 * The site's own prompt(): a title, a text and one field. Resolves with what was typed (as typed),
 * or null when cancelled. `required`: an empty answer is not accepted (the box says so).
 * `type`: the field's type ('text', 'number'…); `multiline`: a larger field for longer notes.
 */
export function promptModal({ title, text, label, value = '', placeholder = '', ok = 'OK', okIcon, danger = false, required = false, type = 'text', multiline = false,
  min, max, maxLength, cancel = 'Anuluj', requiredText = 'To pole jest wymagane.', icon: headIcon } = {}) {
  const input = multiline
    ? el('textarea', { rows: 3, value, placeholder, maxLength })
    : el('input', { type, value, placeholder, min, max, maxLength, autocomplete: 'off' });
  return openModal({ title, text, ok, okIcon, danger, cancel, headIcon, field: { input, label, required, requiredText } });
}

let modalSeq = 0;
/** The box behind confirmModal and promptModal: '' (or the field's value) for yes, null for no. */
function openModal({ title, text, list, warning, ok, okIcon, danger, cancel, headIcon, field }) {
  return new Promise((resolve) => {
    const id = `modal-${++modalSeq}`;
    const before = document.activeElement;
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      const gone = () => {
        back.remove();
        if (!document.querySelector('.modal-back')) document.documentElement.classList.remove('modal-open');
        if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true });
      };
      // a short fade out, unless animations are off ("Animacje: wył." or the system's setting)
      if (motionOff()) gone();
      else {
        back.classList.add('closing');
        setTimeout(gone, 140);
      }
      resolve(value);
    };
    const okBtn = el('button', { type: 'submit', class: danger ? 'modal-danger' : 'primary' }, okIcon ? icon(okIcon) : null, ok);
    const cancelBtn = el('button', { type: 'button', onclick: () => close(null) }, cancel);
    const error = field ? el('small', { class: 'modal-error', id: `${id}-error` }) : null;
    const textNode = text ? el('p', { class: 'modal-text', id: `${id}-text` }, text) : null;
    const rows = list?.length ? el('ul', { class: 'modal-list' }, ...list.map(modalRow)) : null;
    const kind = danger ? 'danger' : warning ? 'warning' : field ? 'prompt' : 'question';
    const mark = headIcon ?? { danger: 'fa-solid fa-triangle-exclamation', warning: 'fa-solid fa-triangle-exclamation', prompt: 'fa-solid fa-pen', question: 'fa-solid fa-circle-question' }[kind];
    if (field) {
      field.input.id = `${id}-field`;
      field.input.addEventListener('input', () => { error.textContent = ''; field.input.classList.remove('bad'); });
    }
    const box = el('form', { class: `glass modal is-${kind}${list?.some((r) => typeof r === 'object') ? ' wide' : ''}`, noValidate: true, onsubmit: (e) => {
      e.preventDefault();
      if (!field) return close('');
      const v = field.input.value;
      if (field.required && !v.trim()) {
        error.textContent = field.requiredText;
        field.input.classList.add('bad');
        field.input.focus();
        return;
      }
      close(v);
    } },
      el('div', { class: 'modal-head' }, el('span', { class: 'modal-mark' }, icon(mark)), el('h2', { id: `${id}-title`, textContent: title })),
      textNode, rows,
      field ? el('div', { class: 'modal-field' }, field.label ? el('label', { htmlFor: field.input.id, textContent: field.label }) : null, field.input, error) : null,
      warning ? el('div', { class: 'modal-warning', role: 'note' }, icon('fa-solid fa-triangle-exclamation'), el('span', { textContent: warning })) : null,
      el('div', { class: 'modal-actions' }, cancelBtn, okBtn));
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', `${id}-title`);
    if (textNode) box.setAttribute('aria-describedby', `${id}-text`);
    if (field) {
      field.input.setAttribute('aria-describedby', `${id}-error`);
      if (!field.label) field.input.setAttribute('aria-labelledby', `${id}-title`);
    }
    // a click beside the box cancels (only one that also started there, so selecting text in the field does not)
    let downOnBack = false;
    const back = el('div', { class: 'modal-back', onmousedown: (e) => { downOnBack = e.target === back; }, onclick: (e) => { if (downOnBack && e.target === back) close(null); } }, box);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      } else if (e.key === 'Tab') {
        // the focus stays in the box
        const items = [...box.querySelectorAll('button, input, textarea, select, a[href]')].filter((n) => !n.disabled);
        const first = items[0], last = items[items.length - 1];
        if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      } else if (e.key === 'Enter' && !field && e.target === document.body) {
        e.preventDefault();
        close('');
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.documentElement.classList.add('modal-open');
    document.body.append(back);
    (field?.input ?? okBtn).focus();
    field?.input.select?.();
  });
}

/** One row of a question's list: a plain line, or a change "name: old → new". */
function modalRow(r) {
  if (typeof r !== 'object' || r === null) return el('li', { textContent: String(r) });
  return el('li', { class: `modal-change${r.risky ? ' risky' : ''}` },
    el('span', { class: 'modal-change-name' }, r.risky ? icon('fa-solid fa-triangle-exclamation') : null, el('span', { textContent: r.name })),
    el('span', { class: 'modal-change-values' },
      el('span', { class: 'old', textContent: r.from }), el('span', { class: 'arrow', textContent: '→' }), el('span', { class: 'new', textContent: r.to }),
      r.note ? el('small', { class: 'muted', textContent: ` ${r.note}` }) : null));
}

/** A cape's front, cut from its texture; an animated one turns its frames like in the game. */
export function capeEl(id, small = false) {
  const c = el('div', { class: `cape${small ? ' sm' : ''}`, title: id });
  c.style.backgroundImage = `url(/vendor/capes/${id}.png)`;
  animateCape(c, id);
  return c;
}

/** Animated capes and how many frames each has (vendor/capes/<id>_<n>.png), from the catalog, asked once. */
let capeFrames;
const CAPE_FRAME_MS = 150;
let capeTick = 0;
let capeTimer;
/** When the capes last turned: the router stops a page's timers when it is left, so a timer that went quiet is gone. */
let capeTickAt = 0;
const framesOfCapes = () => capeFrames ??= fetch('/v1/cosmetics')
  .then((r) => (r.ok ? r.json() : {}))
  .then(({ items }) => new Map((items ?? []).filter((i) => i.slot === 'cape' && i.frames > 1).map((i) => [i.id, i.frames])))
  .catch(() => new Map());

/** Whether animations are off: "Animacje: wył." in the footer (siteBanner.js), or the system's reduced motion. */
export const motionOff = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Each animated cape's frames, loaded and decoded before it starts to turn, and kept here so the
 * browser keeps them too: a frame shown before it is there (or after the browser let it go) is a
 * moment of nothing, and the cape stutters.
 */
const capeImages = new Map();
function capeReady(id, n) {
  let ready = capeImages.get(id);
  if (!ready) {
    const images = Array.from({ length: n }, (_, f) => Object.assign(new Image(), { src: `/vendor/capes/${id}_${f}.png` }));
    ready = Promise.all(images.map((i) => i.decode().catch(() => {}))).then(() => images);
    capeImages.set(id, ready);
  }
  return ready;
}

/** Makes a cape's picture (an element with the cape as its background) play its frames while it is on the page (still with animations off). */
export function animateCape(node, id) {
  void framesOfCapes().then(async (frames) => {
    const n = frames.get(id);
    if (!n) return;
    // it turns once all its frames are there
    await capeReady(id, n);
    node.dataset.capeAnim = id;
    if (capeTimer !== undefined && Date.now() - capeTickAt > CAPE_FRAME_MS * 4 + 1000) capeTimer = undefined;
    if (capeTimer === undefined) capeTickAt = Date.now();
    capeTimer ??= setInterval(() => {
      capeTickAt = Date.now();
      if (document.hidden || motionOff()) return;
      capeTick++;
      const all = document.querySelectorAll('[data-cape-anim]');
      for (const c of all) {
        const count = frames.get(c.dataset.capeAnim);
        if (count) c.style.backgroundImage = `url(/vendor/capes/${c.dataset.capeAnim}_${capeTick % count}.png)`;
      }
      if (!all.length) {
        clearInterval(capeTimer);
        capeTimer = undefined;
      }
    }, CAPE_FRAME_MS);
  });
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
  leaves_gold: 'fa-leaf', leaves_autumn: 'fa-leaf',
  axolotl: 'fa-fish', frog: 'fa-frog', fox: 'fa-paw', cat: 'fa-cat',
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
const OUR_PETS = ['duszek_haze', 'pet_wheelbarrow', 'pet_wheelbarrow_autumn'];

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
  // the confirmation page after the provider passes by itself for a sign-in this browser started (authConfirm.js)
  try {
    localStorage.setItem('slashclient.login', state);
  } catch {}
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
    try {
      localStorage.removeItem('slashclient.login');
    } catch {}
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
