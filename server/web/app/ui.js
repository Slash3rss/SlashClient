// Small DOM helpers of the phone app: elements, icons, toasts, avatars, times.

import { lang, t } from './i18n.js';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else if (k in node && ['textContent', 'value', 'placeholder', 'type', 'href', 'src', 'alt', 'title', 'name', 'id'].includes(k)) node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== undefined && c !== null && c !== false && c !== '') node.append(c instanceof Node ? c : String(c));
  return node;
}

export const icon = (name) => el('i', { class: name, 'aria-hidden': 'true' });
export const $ = (sel, root = document) => root.querySelector(sel);

let toastTimer;
export function toast(text, isError = false) {
  const box = $('#toast');
  box.textContent = text;
  box.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 3200);
}

const ERRORS = {
  offline: 'Brak połączenia z serwerem.',
  not_found: 'Nie znaleziono.',
  self: 'To Ty.',
  already_friends: 'Już jesteście znajomymi.',
  rate_limited: 'Za szybko. Spróbuj za chwilę.',
  gifs_unavailable: 'GIF-y są chwilowo niedostępne.',
  gifs_disabled: 'GIF-y są wyłączone na tym serwerze.',
  gifs_failed: 'Nie udało się wczytać GIF-ów. Spróbuj za chwilę.',
  bad_gif: 'Tego GIF-a nie można wysłać.',
  slow_down: 'Za dużo wiadomości naraz. Zwolnij na chwilę.',
  slow_mode: 'Tryb powolny: poczekaj chwilę przed kolejną wiadomością.',
  too_long: 'Wiadomość jest za długa.',
  empty: 'Wiadomość jest pusta.',
  not_friends: 'Nie jesteście znajomymi.',
  feature_disabled: 'Ta funkcja jest chwilowo wyłączona.',
  push_disabled: 'Powiadomienia są wyłączone na serwerze.',
  no_devices: 'Ten telefon nie ma jeszcze włączonych powiadomień.',
  banned: 'To konto jest zablokowane.',
  not_linked: 'To konto nie jest połączone z kontem SlashClient. Połącz je w launcherze (Znajomi → konto).',
  bad_name: 'Nick: 3–16 liter, cyfr lub _.',
  community_muted: 'Masz wyciszenie w tej społeczności.',
  read_only_channel: 'Na tym kanale nie możesz pisać.',
  clan_full: 'Klan jest pełny.',
  too_many: 'Osiągnięto limit.',
  bad_group_name: 'Nazwa grupy: do 32 znaków.',
  already_member: 'Już jest w środku.',
  not_allowed: 'Nie masz do tego uprawnień.',
};
export const errorText = (err) => t(ERRORS[err?.code] ?? 'Coś poszło nie tak.');

/** Runs an action, a toast with the error when it fails; its result, or undefined. */
export async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(errorText(err), true);
    return undefined;
  }
}

/** `mobile`: they are here on the phone app, so the dot is a small phone in the status' colour. */
export function avatarEl(user, status, mobile = false) {
  const box = el('span', { class: 'avatar' });
  if (user?.avatar) box.append(el('img', { src: user.avatar, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' }));
  else box.append(el('span', { class: 'initial', textContent: (user?.name || user?.handle || '?').slice(0, 1).toUpperCase() }));
  if (status && mobile) box.append(el('span', { class: `dot mobile ${status}` }, icon('fa-solid fa-mobile-screen-button')));
  else if (status) box.append(el('span', { class: `dot ${status}` }));
  return box;
}

export const locale = () => (lang() === 'en' ? 'en-GB' : 'pl-PL');

export function ago(at) {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const s = (at - Date.now()) / 1000;
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  }
  return t('przed chwilą');
}

/** "14:05" today, "wt. 14:05" this week, else the date. */
export function when(at) {
  const d = new Date(at);
  const now = new Date();
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  if (now - d < 6 * 86_400_000) return `${d.toLocaleDateString(locale(), { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} ${time}`;
}

export const badge = (n) => (n > 0 ? el('span', { class: 'badge', textContent: n > 99 ? '99+' : String(n) }) : '');

let confirmSeq = 0;
/**
 * The app's own question instead of the browser's confirm(): a sheet from the bottom with the question,
 * an optional line of what happens, "Anuluj" and the action (red with `danger`). A tap beside it, Escape
 * or "Anuluj" says no; Enter says yes. Resolves true for yes.
 */
export function confirmSheet({ title, text, ok, danger = false }) {
  return new Promise((resolve) => {
    const id = `confirm-${++confirmSeq}`;
    const before = document.activeElement;
    let done = false;
    const close = (yes) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true });
      resolve(yes);
    };
    const okBtn = el('button', { type: 'button', class: `btn${danger ? ' danger' : ''}`, onclick: () => close(true) }, ok);
    const cancelBtn = el('button', { type: 'button', class: 'btn ghost', onclick: () => close(false) }, t('Anuluj'));
    const box = el('div', { class: 'sheet confirm-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-title`, 'aria-describedby': text ? `${id}-text` : undefined },
      el('h2', { id: `${id}-title`, textContent: title }),
      text ? el('p', { id: `${id}-text`, class: 'confirm-text', textContent: text }) : '',
      el('div', { class: 'confirm-actions' }, cancelBtn, okBtn));
    const back = el('div', { class: 'sheet-back confirm-back', onclick: (e) => e.target === back && close(false) }, box);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Tab') {
        // the focus stays on the two buttons
        e.preventDefault();
        (document.activeElement === okBtn ? cancelBtn : okBtn).focus();
      } else if (e.key === 'Enter' && !box.contains(document.activeElement)) {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(back);
    okBtn.focus({ preventScroll: true });
  });
}

/** A sheet from the bottom of the screen; resolves with what the form gives, or undefined when closed. */
export function sheet(title, build) {
  return new Promise((resolve) => {
    const close = (value) => {
      back.remove();
      resolve(value);
    };
    const body = el('div', { class: 'sheet-body' });
    const back = el('div', { class: 'sheet-back', onclick: (e) => e.target === back && close(undefined) },
      el('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
        el('div', { class: 'sheet-head' }, el('h2', { textContent: title }), el('button', { class: 'icon-btn', 'aria-label': t('Zamknij'), onclick: () => close(undefined) }, icon('fa-solid fa-xmark'))),
        body));
    build(body, close);
    document.body.append(back);
    body.querySelector('input, textarea')?.focus();
  });
}
