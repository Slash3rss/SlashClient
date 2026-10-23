import { t } from '../shared/i18n';
import { gifText, type GifKind, type GifProvider, type GifRef, type GifResult } from '../shared/gifMessage';
import { control, el, icon } from './dialog';

/**
 * GIFs and stickers in the chat (server 0.9.40+): the "GIF" button's picker (GIF-y / Naklejki, a
 * search, what is popular when it is empty, more on scrolling down) and a GIF message's card. The
 * search goes through the server (its key stays there); the files come through slash-gif:, which
 * the main process gets through the server or from the CDN, as the server says (gifMedia.ts).
 * With reduced motion a GIF stands still until the pointer is over it.
 */

type Api = { socialApi: (method: string, path: string, body?: unknown) => Promise<any> };
export interface GifConfig { enabled: boolean; provider: GifProvider; proxy: boolean }

const CONFIG_MS = 5 * 60_000;
const OFF: GifConfig = { enabled: false, provider: 'giphy', proxy: false };
let known: { at: number; value: Promise<GifConfig> } | undefined;

/** Whether the server has GIFs (an older one, or one without a key, has not: the button stays hidden). */
export function gifConfig(api: Api): Promise<GifConfig> {
  if (!known || Date.now() - known.at > CONFIG_MS) {
    known = {
      at: Date.now(),
      value: api.socialApi('GET', '/v1/gifs').then(
        (c: Partial<GifConfig>) => ({ enabled: c?.enabled === true, provider: c?.provider === 'tenor' ? 'tenor' : 'giphy', proxy: c?.proxy === true }),
        () => OFF),
    };
  }
  return known.value;
}
/** Asked again next time (the account or the server changed). */
export const forgetGifConfig = () => {
  known = undefined;
};

/** The address the page shows a CDN file by. */
export const gifSrc = (url: string) => `slash-gif://m/?u=${encodeURIComponent(url)}`;
const reducedMotion = () => document.documentElement.classList.contains('reduce-motion');

/** The search's address on the server: no question asks for what is popular now. */
export function gifSearchPath(kind: GifKind, query: string, pos?: string): string {
  const q = new URLSearchParams({ kind });
  const text = query.trim().slice(0, 50);
  if (text) q.set('q', text);
  if (pos) q.set('pos', pos);
  // the main process takes only these characters in a path; the rest is written as %XX
  return `/v1/gifs/search?${q.toString().replace(/\+/g, '%20').replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/** A search result as a message carries it. */
export function gifRef(r: GifResult, provider: GifProvider): GifRef {
  return { v: 1, p: provider, k: r.kind, id: r.id, t: r.title, w: r.w, h: r.h, ...(r.still ? { s: r.still } : {}), a: r.preview, f: r.full, ...(r.mp4 ? { m: r.mp4 } : {}) };
}

/** The size a GIF is shown at in the chat: stickers smaller, nothing taller than the box. */
export function gifSize(w: number, h: number, kind: GifKind): { w: number; h: number } {
  const maxW = kind === 'sticker' ? 160 : 240;
  const maxH = kind === 'sticker' ? 160 : 220;
  if (!(w > 0) || !(h > 0)) return { w: maxW, h: Math.round(maxW * 0.75) };
  const scale = Math.min(maxW / w, maxH / h, kind === 'sticker' ? 1 : 2);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** An <img> of a GIF: moving, or (reduced motion) its still frame that moves under the pointer. */
function gifImage(ref: { a: string; s?: string }, alt: string, w: number, h: number, hoverRoot?: HTMLElement): HTMLImageElement {
  const still = reducedMotion() && ref.s ? gifSrc(ref.s) : undefined;
  const img = el('img', { alt, width: w, height: h, loading: 'lazy', draggable: false, src: still ?? gifSrc(ref.a) });
  if (still) {
    const on = hoverRoot ?? img;
    on.addEventListener('mouseenter', () => (img.src = gifSrc(ref.a)));
    on.addEventListener('mouseleave', () => (img.src = still));
  }
  return img;
}

/** A GIF or sticker message; a click shows it bigger. Stickers have no bubble around them. */
export function gifCard(ref: GifRef, mine: boolean, encrypted?: boolean): HTMLElement {
  const size = gifSize(ref.w, ref.h, ref.k);
  const card = el('div', { className: `fr-bubble fr-gif${ref.k === 'sticker' ? ' fr-sticker' : ''}${mine ? ' mine' : ''}`, title: ref.t || 'GIF' });
  card.append(gifImage(ref, ref.t || 'GIF', size.w, size.h, card));
  if (ref.k === 'gif') card.append(el('span', { className: 'fr-gif-tag', textContent: 'GIF' }));
  if (encrypted) card.append(el('i', { className: 'fa-solid fa-lock fr-lock', title: t('Zaszyfrowana od nadawcy do odbiorcy') }));
  card.addEventListener('click', () => {
    const close = () => {
      box.remove();
      removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    // opened on purpose: it moves even with reduced motion
    const box = el('div', { className: 'fr-lightbox fr-gif-lightbox' }, el('img', { src: gifSrc(ref.f), alt: ref.t || 'GIF' }), el('div', { className: 'fr-gif-caption', textContent: ref.t }));
    box.addEventListener('click', close);
    addEventListener('keydown', onKey);
    document.body.append(box);
  });
  return card;
}

const ATTRIBUTION: Record<GifProvider, string> = { giphy: 'Powered by GIPHY', tenor: 'Powered by Tenor' };

export interface GifPickerOptions {
  api: Api;
  /** Where the picker opens (the chat panel); it sits above the composer. */
  host: HTMLElement;
  /** Sends the GIF's message text; false keeps the picker open (it failed). */
  send: (text: string) => Promise<boolean>;
  errorText: (err: unknown) => string;
}

let openPicker: { close: () => void } | undefined;

/** Closes the picker, if it is open (the chat changed). */
export const closeGifPicker = () => openPicker?.close();

/** The picker: tabs, a search box, a grid of results in columns, more on scrolling down; a click sends. */
export async function toggleGifPicker(opts: GifPickerOptions): Promise<void> {
  if (openPicker) return openPicker.close();
  const config = await gifConfig(opts.api);
  if (!config.enabled || openPicker) return;
  let kind: GifKind = 'gif';
  let query = '';
  let next: string | undefined;
  let loading = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tab = (k: GifKind, label: string) => {
    const b = el('button', { type: 'button', className: `gif-tab${k === kind ? ' active' : ''}`, textContent: label });
    b.addEventListener('click', () => {
      if (kind === k) return;
      kind = k;
      tabs.querySelectorAll('.gif-tab').forEach((x) => x.classList.toggle('active', x === b));
      void load(true);
    });
    return b;
  };
  const tabs: HTMLElement = el('div', { className: 'gif-tabs', role: 'tablist' });
  tabs.append(tab('gif', t('GIF-y')), tab('sticker', t('Naklejki')));
  const close: HTMLButtonElement = el('button', { type: 'button', className: 'icon-btn', title: t('Zamknij (Esc)') }, icon('fa-xmark'));
  const search = control<HTMLInputElement>('input', { type: 'search', className: 'gif-search', placeholder: t('Szukaj GIF-ów…'), maxLength: 50 });
  const grid: HTMLElement = el('div', { className: 'gif-grid' });
  const status: HTMLElement = el('div', { className: 'gif-status muted' });
  const scroll: HTMLElement = el('div', { className: 'gif-scroll' }, grid, status);
  const head: HTMLElement = el('div', { className: 'gif-head' }, tabs, close);
  const foot: HTMLElement = el('div', { className: 'gif-foot' }, ATTRIBUTION[config.provider]);
  const picker = document.createElement('div');
  picker.className = 'gif-picker glass-panel';
  picker.append(head, search, scroll, foot);
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-label', t('GIF-y i naklejki'));

  async function load(fresh: boolean) {
    const mine = fresh ? ++generation : generation;
    if (fresh) {
      next = undefined;
      grid.replaceChildren();
      scroll.scrollTop = 0;
    } else if (!next || loading) return;
    loading = true;
    status.textContent = t('Wczytywanie…');
    search.placeholder = kind === 'sticker' ? t('Szukaj naklejek…') : t('Szukaj GIF-ów…');
    try {
      const res: { provider: GifProvider; results: GifResult[]; next?: string } = await opts.api.socialApi('GET', gifSearchPath(kind, query, fresh ? undefined : next));
      if (mine !== generation) return;
      next = res.next;
      for (const r of res.results) grid.append(item(r, res.provider));
      status.textContent = grid.childElementCount ? '' : query ? t('Nic nie znaleziono.') : t('Brak wyników.');
    } catch (err) {
      if (mine === generation) status.textContent = opts.errorText(err);
    } finally {
      if (mine === generation) loading = false;
    }
    // a tall window: the first page may not fill it, so the next comes at once
    if (mine === generation && next && scroll.scrollHeight <= scroll.clientHeight + 40) void load(false);
  }

  function item(r: GifResult, provider: GifProvider): HTMLElement {
    // the grid shows each at its shape, 3 columns wide
    const w = 120;
    const h = Math.max(30, Math.min(260, Math.round((w * r.h) / Math.max(1, r.w))));
    const b = el('button', { type: 'button', className: `gif-item${r.kind === 'sticker' ? ' sticker' : ''}`, title: r.title });
    b.append(gifImage({ a: r.preview, s: r.still }, r.title || 'GIF', w, h, b));
    b.addEventListener('click', async () => {
      b.disabled = true;
      if (await opts.send(gifText(gifRef(r, provider)))) finish();
      else b.disabled = false;
    });
    return b;
  }

  function finish() {
    clearTimeout(timer);
    picker.remove();
    removeEventListener('keydown', onKey, true);
    removeEventListener('mousedown', onOutside, true);
    openPicker = undefined;
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    finish();
  };
  const onOutside = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!picker.contains(target) && !(target as HTMLElement).closest?.('.fr-gif-btn')) finish();
  };

  close.addEventListener('click', finish);
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = search.value;
      void load(true);
    }, 350);
  });
  scroll.addEventListener('scroll', () => {
    if (scroll.scrollTop + scroll.clientHeight > scroll.scrollHeight - 200) void load(false);
  });
  addEventListener('keydown', onKey, true);
  addEventListener('mousedown', onOutside, true);
  openPicker = { close: finish };
  opts.host.append(picker);
  search.focus();
  await load(true);
}
