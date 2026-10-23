// GIFs and stickers in the phone app's chats (server 0.9.40+): the same messages as the launcher's
// (see the server's gifs.ts: "[GIF] title" and, on the next line, a reference to the provider's CDN),
// the picker as a sheet from the bottom, and a GIF's card in the chat. The search goes through the
// server (its key stays there); with "Multimedia przez serwer" on the files come through it too, so
// GIPHY and Tenor do not see the phone's address.

import { api } from './api.js';
import { t } from './i18n.js';
import { el, errorText, icon } from './ui.js';

const MARK = 'slashgif:';
const HOSTS = [/^(media\d?|i)\.giphy\.com$/, /^(media\d?|c)\.tenor\.com$/];
const ATTRIBUTION = { giphy: 'Powered by GIPHY', tenor: 'Powered by Tenor' };

/** An https address on one of the providers' CDN hosts; nothing else is ever shown. */
export function isGifUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 500) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

const side = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(4096, Math.max(1, Math.round(n))) : undefined);
const cleanTitle = (s) => (typeof s === 'string' ? s.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) : '');

/** A reference checked and written in the one order every client uses. */
function valid(r) {
  if (!r || typeof r !== 'object' || r.v !== 1 || !['giphy', 'tenor'].includes(r.p) || !['gif', 'sticker'].includes(r.k)) return undefined;
  if (typeof r.id !== 'string' || !/^[\w-]{1,64}$/.test(r.id)) return undefined;
  const w = side(r.w);
  const h = side(r.h);
  if (!w || !h || !isGifUrl(r.a) || !isGifUrl(r.f) || (r.s !== undefined && !isGifUrl(r.s)) || (r.m !== undefined && !isGifUrl(r.m))) return undefined;
  return { v: 1, p: r.p, k: r.k, id: r.id, t: cleanTitle(r.t), w, h, ...(r.s ? { s: r.s } : {}), a: r.a, f: r.f, ...(r.m ? { m: r.m } : {}) };
}

/** The GIF a message's text carries, or undefined. */
export function parseGif(text) {
  if (typeof text !== 'string' || text.length > 2000 || !text.startsWith('[GIF]')) return undefined;
  const at = text.indexOf(`\n${MARK}`);
  if (at < 0) return undefined;
  try {
    return valid(JSON.parse(text.slice(at + 1 + MARK.length)));
  } catch {
    return undefined;
  }
}

/** A message's text for a GIF; the mp4 and the still go first when it would be too long. */
export function gifText(ref) {
  const r = valid(ref);
  const head = `[GIF]${r.t ? ` ${r.t}` : ''}`;
  const text = () => `${head}\n${MARK}${JSON.stringify(r)}`;
  if (text().length > 2000) delete r.m;
  if (text().length > 2000) delete r.s;
  return text();
}

/** A notification's or a list's line for a text: a GIF's first line. */
export const gifLine = (text) => (typeof text === 'string' && text.includes(`\n${MARK}`) ? text.slice(0, text.indexOf(`\n${MARK}`)) : text);

let config;
/** Whether the server has GIFs (the button hides without), asked once in a while. */
export function gifConfig() {
  if (!config || Date.now() - config.at > 5 * 60_000) {
    config = { at: Date.now(), value: api('GET', '/v1/gifs').then((c) => ({ enabled: c?.enabled === true, provider: c?.provider === 'tenor' ? 'tenor' : 'giphy', proxy: c?.proxy === true }), () => ({ enabled: false, provider: 'giphy', proxy: false })) };
  }
  return config.value;
}
let proxied = false;
void gifConfig().then((c) => (proxied = c.proxy));

/** Where an <img> loads a CDN file from: through the server, or the CDN itself when the admin turned that off. */
const src = (url) => (proxied ? `/v1/gifs/media?u=${encodeURIComponent(url)}` : url);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function image(ref, alt, w, h) {
  const still = reduced() && ref.s;
  return el('img', { src: src(still ? ref.s : ref.a), alt: alt || 'GIF', width: w, height: h, loading: 'lazy', draggable: 'false' });
}

/** A GIF or sticker message: a tap shows it big (moving, even with reduced motion: it was asked for). */
export function gifCard(ref) {
  const max = ref.k === 'sticker' ? 150 : 230;
  const scale = Math.min(max / ref.w, (ref.k === 'sticker' ? 150 : 220) / ref.h, ref.k === 'sticker' ? 1 : 2);
  const w = Math.round(ref.w * scale);
  const h = Math.round(ref.h * scale);
  const card = el('button', { class: `gif-card${ref.k === 'sticker' ? ' sticker' : ''}`, type: 'button', 'aria-label': ref.t || 'GIF', onclick: () => {
    const back = el('div', { class: 'gif-big', onclick: () => back.remove() }, el('img', { src: src(ref.f), alt: ref.t || 'GIF' }), ref.t ? el('div', { class: 'muted small', textContent: ref.t }) : '');
    document.body.append(back);
  } }, image(ref, ref.t, w, h));
  if (ref.k === 'gif') card.append(el('span', { class: 'gif-tag', textContent: 'GIF' }));
  return card;
}

/** The picker as a sheet: GIF-y / Naklejki, a search (popular when empty), more on scrolling; a tap sends. */
export async function openGifSheet(send) {
  const c = await gifConfig();
  if (!c.enabled) return;
  let kind = 'gif';
  let query = '';
  let next;
  let busy = false;
  let round = 0;
  let timer;
  const grid = el('div', { class: 'gif-grid' });
  const status = el('p', { class: 'muted small center' });
  const scroll = el('div', { class: 'gif-scroll', onscroll: () => scroll.scrollTop + scroll.clientHeight > scroll.scrollHeight - 300 && load(false) }, grid, status);
  const tabs = el('div', { class: 'seg' });
  const search = el('input', { type: 'search', placeholder: t('Szukaj GIF-ów…'), maxLength: 50, 'aria-label': t('Szukaj GIF-ów…'), oninput: () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = search.value;
      load(true);
    }, 400);
  } });
  const close = () => {
    clearTimeout(timer);
    back.remove();
  };
  for (const [k, label] of [['gif', t('GIF-y')], ['sticker', t('Naklejki')]]) {
    tabs.append(el('button', { type: 'button', class: k === kind ? 'on' : '', textContent: label, onclick: (e) => {
      kind = k;
      for (const b of tabs.children) b.classList.toggle('on', b === e.currentTarget);
      search.placeholder = k === 'sticker' ? t('Szukaj naklejek…') : t('Szukaj GIF-ów…');
      load(true);
    } }));
  }
  const back = el('div', { class: 'sheet-back', onclick: (e) => e.target === back && close() },
    el('div', { class: 'sheet gif-sheet', role: 'dialog', 'aria-label': t('GIF-y i naklejki') },
      el('div', { class: 'sheet-head' }, tabs, el('button', { class: 'icon-btn', 'aria-label': t('Zamknij'), onclick: close }, icon('fa-solid fa-xmark'))),
      search, scroll, el('div', { class: 'gif-attribution', textContent: ATTRIBUTION[c.provider] })));
  document.body.append(back);

  async function load(fresh) {
    const mine = fresh ? ++round : round;
    if (fresh) {
      next = undefined;
      grid.replaceChildren();
    } else if (!next || busy) return;
    busy = true;
    status.textContent = t('Wczytywanie…');
    const q = new URLSearchParams({ kind });
    if (query.trim()) q.set('q', query.trim().slice(0, 50));
    if (!fresh) q.set('pos', next);
    try {
      const res = await api('GET', `/v1/gifs/search?${q}`);
      if (mine !== round) return;
      next = res.next;
      for (const r of res.results) {
        const ref = valid({ v: 1, p: res.provider, k: r.kind, id: r.id, t: r.title, w: r.w, h: r.h, s: r.still, a: r.preview, f: r.full, m: r.mp4 });
        if (!ref) continue;
        grid.append(el('button', { type: 'button', class: `gif-item${ref.k === 'sticker' ? ' sticker' : ''}`, 'aria-label': ref.t || 'GIF', onclick: async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          if (await send(gifText(ref))) close();
          else b.disabled = false;
        } }, image(ref, ref.t, 160, Math.round((160 * ref.h) / ref.w))));
      }
      status.textContent = grid.childElementCount ? '' : query.trim() ? t('Nic nie znaleziono.') : t('Brak wyników.');
    } catch (err) {
      if (mine === round) status.textContent = errorText(err);
    } finally {
      if (mine === round) busy = false;
    }
  }
  await load(true);
}
