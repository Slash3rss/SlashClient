import { locale, t } from '../shared/i18n';
import { confirmDialog, control, el, icon, modalWindow } from './dialog';

/**
 * The Multimedia panel of a chat (server 0.9.36+): direct messages, a group or clan, a community's
 * channel. Its pictures in a grid, newest first, a page at a time with small thumbnails (an
 * encrypted one is decrypted by the main process, as in the chat); a click shows the picture big,
 * who sent it and when, with "show in the chat" and, for whoever may, "delete". Several of one's
 * own (or, for moderators, anyone's they may) are selected and deleted at once. A picture deleted
 * here leaves its message with "Zdjęcie usunięte"; the server tells everyone, so open panels and
 * chats follow. Shared chats show their limits; their moderators see how full the store is, their
 * admins (a group's owner, a clan's owner, a community's admins) may set lower limits for it.
 * "Linki" lists links to shared screenshots and clips in the messages loaded in the chat.
 */

export interface MediaLimits { quotaBytes: number; quotaCount: number; days: number; maxBytes: number; perMemberDay: number }
/** What the server says of a chat's limits: everyone the limits, moderators the use, admins the panel's and their own. */
export interface LimitsInfo { limits?: MediaLimits; usage?: { bytes: number; count: number }; global?: MediaLimits; own?: Partial<MediaLimits> }
export interface PanelImage { id: string; w?: number; h?: number; size?: number; unreadable?: boolean }
/** One picture of the panel: its message's id, who sent it (and their name) and when. */
export interface PanelItem { id: number; from: string; name: string; at: number; image: PanelImage }
export interface PanelLink { id: number; from: string; name: string; at: number; url: string }

export interface MediaSource {
  /** Which chat, for the title ("Multimedia · Ala"). */
  title: string;
  load: (before?: number) => Promise<{ items: PanelItem[]; more: boolean; info?: LimitsInfo; moderator?: boolean }>;
  thumb: (item: PanelItem) => Promise<string>;
  full: (item: PanelItem) => Promise<string>;
  /** Whether I may delete this one (mine, or I moderate its sender). */
  canDelete: (item: PanelItem, moderator: boolean) => boolean;
  remove: (ids: number[]) => Promise<{ removed: number[]; refused: number[] } | undefined>;
  /** The message in the chat (the chat loads back to it). */
  jump?: (id: number) => void;
  /** The chat's own limits (only for its admins); the new view, or undefined when it failed. */
  saveLimits?: (raw: Record<string, number | null>) => Promise<LimitsInfo | undefined>;
  /** Links to screenshots and clips in the messages loaded now. */
  links?: () => PanelLink[];
  /** A pushed event of this chat: a picture that went (its message's id), or a new one. */
  onEvent?: (e: any) => { removed?: number; added?: PanelItem } | undefined;
}

interface Api { on?: (channel: string, fn: (payload: any) => void) => () => void }

const PAGE = 40;

/** "1,2 GB", "340 MB", "12 KB" in the launcher's language. */
export function bytesText(b: number): string {
  const n = (v: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v);
  if (b >= 1024 ** 3) return `${n(b / 1024 ** 3)} GB`;
  if (b >= 1024 ** 2) return `${n(b / 1024 ** 2)} MB`;
  return `${n(Math.max(b ? 1 : 0, b / 1024))} KB`;
}

/** "1,2 GB z 2 GB, 340 zdjęć" (the count of pictures with its limit). */
export function usageText(usage: { bytes: number; count: number }, limits: MediaLimits): string {
  return t('{0} z {1}, {2} z {3} zdjęć', bytesText(usage.bytes), bytesText(limits.quotaBytes), usage.count, limits.quotaCount);
}

/** How full the store is, 0–1 (the fuller of bytes and pictures). */
export const usageShare = (usage: { bytes: number; count: number }, limits: MediaLimits) =>
  Math.min(1, Math.max(usage.bytes / Math.max(1, limits.quotaBytes), usage.count / Math.max(1, limits.quotaCount)));

/** The links to shared screenshots and clips (/media/<id>) in a text. */
export function mediaLinks(text: string): string[] {
  return [...new Set(text.match(/https?:\/\/[^\s<>"']+\/media\/[A-Za-z0-9]{10}\b/g) ?? [])];
}

/** The chat's bubble of a picture that was deleted or ran out (its message stays). */
export function removedCard(r: { expired?: boolean } | undefined, mine: boolean): HTMLElement {
  return el('div', { className: `fr-bubble fr-image unreadable fr-image-removed${mine ? ' mine' : ''}` }, icon(r?.expired ? 'fa-clock' : 'fa-image'),
    el('span', { textContent: r?.expired ? t('Zdjęcie wygasło i zniknęło z serwera.') : t('Zdjęcie usunięte') }));
}

/**
 * Loads older messages until one is there (or there are no more), then scrolls to it and marks it
 * for a moment. `box`: the chat's messages; rows carry `data-mid`.
 */
export async function revealMessage(id: number, o: { has: () => boolean; more: () => boolean; loadOlder: () => Promise<void> | void; box: () => HTMLElement | undefined }) {
  for (let i = 0; i < 80 && !o.has() && o.more(); i++) {
    await o.loadOlder();
    await new Promise((r) => setTimeout(r, 60));
  }
  const row = o.box()?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
  if (!row) return false;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('fr-flash');
  setTimeout(() => row.classList.remove('fr-flash'), 2200);
  return true;
}

let styled = false;
/** The panel's look, once (its own sheet, so the launcher's style.css stays as it is). */
function ensureStyles() {
  if (styled) return;
  styled = true;
  const css = `
.fr-media-modal { width: min(860px, 100%); }
.fr-media-modal .modal-body { gap: 10px; }
.fr-media-tabs { display: flex; gap: 6px; }
.fr-media-tabs button.active { background: var(--accent-gradient); color: #fff; }
.fr-media-usage { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px; background: var(--glass-bg); border: 1px solid var(--glass-border); }
.fr-media-usage .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fr-media-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; }
.fr-media-bar > span { display: block; height: 100%; background: var(--accent); border-radius: 3px; }
.fr-media-bar.warn > span { background: var(--gold); }
.fr-media-bar.full > span { background: var(--danger); }
.fr-media-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-height: 34px; }
.fr-media-tools .grow { flex: 1; }
.fr-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; max-height: min(58vh, 560px); overflow-y: auto; padding: 2px; }
.fr-media-tile { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: rgba(0,0,0,.3); border: 1px solid var(--glass-border); cursor: zoom-in; padding: 0; box-shadow: none; }
.fr-media-tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .2s; }
.fr-media-tile:hover img { transform: scale(1.04); }
.fr-media-tile .fr-media-meta { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 7px 5px; font-size: 11px; line-height: 1.25; text-align: left; color: #fff;
  background: linear-gradient(transparent, rgba(0,0,0,.78)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fr-media-tile .fr-media-ph { position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-muted); font-size: 22px; }
.fr-media-tile .fr-media-check { position: absolute; top: 6px; left: 6px; width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center;
  background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 12px; }
.fr-media-tile.selected { outline: 2px solid var(--accent); outline-offset: -2px; }
.fr-media-tile.selected .fr-media-check { background: var(--accent); border-color: var(--accent); }
.fr-media-modal.selecting .fr-media-tile { cursor: pointer; }
.fr-media-tile.locked { opacity: .45; cursor: not-allowed; }
.fr-media-empty { grid-column: 1 / -1; padding: 30px 10px; text-align: center; color: var(--text-secondary); }
.fr-media-more { grid-column: 1 / -1; display: flex; justify-content: center; padding: 6px; }
.fr-media-links { display: flex; flex-direction: column; gap: 6px; max-height: min(58vh, 560px); overflow-y: auto; }
.fr-media-link { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px; background: var(--glass-bg); }
.fr-media-link a { color: var(--accent-light); word-break: break-all; }
.fr-media-viewer { position: fixed; inset: 0; z-index: 1200; display: flex; flex-direction: column; background: rgba(0,0,0,.88); }
.fr-media-viewer .fr-media-stage { flex: 1; min-height: 0; display: grid; place-items: center; padding: 16px 64px; }
.fr-media-viewer .fr-media-stage img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
.fr-media-viewer .fr-media-bottom { display: flex; gap: 10px; align-items: center; padding: 12px 18px; background: rgba(10,13,20,.9); border-top: 1px solid var(--glass-border); }
.fr-media-viewer .fr-media-bottom .grow { flex: 1; min-width: 0; }
.fr-media-viewer .fr-media-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 42px; height: 42px; border-radius: 50%; }
.fr-media-viewer .fr-media-nav.prev { left: 14px; }
.fr-media-viewer .fr-media-nav.next { right: 14px; }
.fr-media-limits-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fr-media-limits-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); }
.fr-msg.fr-flash > .fr-line > .fr-bubble, .fr-msg.fr-flash > .fr-bubble { box-shadow: 0 0 0 2px var(--accent), 0 0 18px var(--accent-glow); transition: box-shadow .3s; }
.fr-bubble.fr-image-removed { opacity: .8; font-style: italic; }
`;
  document.head.append(el('style', { textContent: css }));
}

const dateText = (at: number) => new Date(at).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });

/** Opens the panel; it closes with its window (Esc, ×). */
export function openMediaPanel(src: MediaSource, deps: { api?: Api; toast: (message: string, isError?: boolean) => void; errorText: (err: unknown) => string }) {
  ensureStyles();
  let items: PanelItem[] = [];
  let more = true;
  let loading = false;
  let moderator = false;
  let info: LimitsInfo | undefined;
  let selecting = false;
  const selected = new Set<number>();
  let tab: 'pictures' | 'links' = 'pictures';
  const thumbs = new Map<string, Promise<string>>();

  const grid = el('div', { className: 'fr-media-grid' });
  const usageBox = el('div', { className: 'fr-media-usage hidden' });
  const tools = el('div', { className: 'fr-media-tools' });
  const linksBox = el('div', { className: 'fr-media-links hidden' });
  const picturesTab = el('button', { type: 'button', className: 'active' }, icon('fa-images'), ` ${t('Zdjęcia')}`);
  const linksTab = el('button', { type: 'button' }, icon('fa-link'), ` ${t('Linki')}`);
  const tabs = el('div', { className: 'fr-media-tabs' }, picturesTab, ...(src.links ? [linksTab] : []));
  const off = deps.api?.on?.('social:event', (e: any) => {
    const hit = src.onEvent?.(e);
    if (hit?.removed !== undefined && items.some((i) => i.id === hit.removed)) {
      items = items.filter((i) => i.id !== hit.removed);
      selected.delete(hit.removed);
      if (info?.usage) void refreshInfo();
      draw();
    }
    if (hit?.added && !items.some((i) => i.id === hit.added!.id)) {
      items = [hit.added, ...items];
      if (info?.usage) void refreshInfo();
      draw();
    }
  });
  const done = modalWindow(t('Multimedia · {0}', src.title), [tabs, usageBox, tools, grid, linksBox], [], () => {
    off?.();
    observer.disconnect();
    viewerClose?.();
  }, 'fr-group-modal fr-media-modal');
  const modal = grid.closest('.fr-media-modal') as HTMLElement;

  // thumbnails load as they come into view, the next page when the end does
  const observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const target = en.target as HTMLElement;
      observer.unobserve(target);
      if (target.classList.contains('fr-media-more')) void loadMore();
      else loadThumb(target);
    }
  }, { root: grid, rootMargin: '200px' });

  function loadThumb(tile: HTMLElement) {
    const item = items.find((i) => i.id === Number(tile.dataset.mid));
    if (!item || item.image.unreadable) return;
    let url = thumbs.get(item.image.id);
    if (!url) {
      url = src.thumb(item);
      thumbs.set(item.image.id, url);
      url.catch(() => thumbs.delete(item.image.id));
    }
    url.then((u) => {
      const img = el('img', { src: u, alt: '', loading: 'lazy' });
      tile.querySelector('.fr-media-ph')?.replaceWith(img);
    }, () => {
      const ph = tile.querySelector('.fr-media-ph');
      if (ph) ph.replaceChildren(icon('fa-image'));
      tile.title = t('Zdjęcia nie ma już na serwerze.');
    });
  }

  async function loadMore() {
    if (loading || !more) return;
    loading = true;
    try {
      const page = await src.load(items.at(-1)?.id);
      items = [...items, ...page.items.filter((i) => !items.some((x) => x.id === i.id))];
      more = page.more;
      moderator = !!page.moderator;
      if (page.info) info = page.info;
    } catch (err) {
      more = false;
      deps.toast(deps.errorText(err), true);
    } finally {
      loading = false;
    }
    draw();
  }

  async function refreshInfo() {
    try {
      const page = await src.load();
      if (page.info) info = page.info;
      drawUsage();
    } catch {
      // the numbers stay as they were
    }
  }

  const deletable = (i: PanelItem) => src.canDelete(i, moderator);

  function drawUsage() {
    const l = info?.limits;
    if (!l) return usageBox.classList.add('hidden');
    usageBox.classList.remove('hidden');
    const rows: Node[] = [];
    if (info?.usage) {
      const share = usageShare(info.usage, l);
      const bar = el('div', { className: `fr-media-bar${share >= 1 ? ' full' : share >= 0.85 ? ' warn' : ''}` }, el('span'));
      (bar.firstElementChild as HTMLElement).style.width = `${Math.round(share * 100)}%`;
      rows.push(el('div', { className: 'row' }, icon('fa-hard-drive'), el('b', { textContent: t('Miejsce na zdjęcia') }), el('span', { className: 'grow', textContent: usageText(info.usage, l) })), bar);
      if (share >= 1) rows.push(el('small', { className: 'muted', textContent: t('Ten czat ma już pełny limit multimediów – usuń stare albo poczekaj.') }));
    }
    const line = el('div', { className: 'row' }, el('small', { className: 'muted grow', textContent: t('Zdjęcia znikają po {0} dniach · największe {1} · {2} dziennie na osobę', l.days, bytesText(l.maxBytes), l.perMemberDay) }));
    if (info?.global && src.saveLimits) {
      const edit = el('button', { type: 'button' }, icon('fa-sliders'), ` ${t('Limity czatu')}`);
      edit.addEventListener('click', () => limitsWindow());
      line.append(edit);
    }
    rows.push(line);
    usageBox.replaceChildren(...rows);
  }

  function drawTools() {
    modal?.classList.toggle('selecting', selecting);
    const nodes: Node[] = [el('small', { className: 'muted grow', textContent: items.length ? t('Najnowsze na górze · kliknij, żeby powiększyć') : '' })];
    if (tab !== 'pictures') return tools.replaceChildren();
    if (items.some(deletable)) {
      if (!selecting) {
        const select = el('button', { type: 'button' }, icon('fa-check-double'), ` ${t('Zaznacz')}`);
        select.addEventListener('click', () => {
          selecting = true;
          draw();
        });
        nodes.push(select);
      } else {
        const mine = el('button', { type: 'button' }, t('Zaznacz wszystkie, które mogę usunąć'));
        mine.addEventListener('click', () => {
          for (const i of items) if (deletable(i)) selected.add(i.id);
          draw();
        });
        const del = el('button', { type: 'button', className: 'danger', disabled: !selected.size }, icon('fa-trash'), ` ${t('Usuń zaznaczone ({0})', selected.size)}`);
        del.addEventListener('click', () => void removeItems([...selected]));
        const cancel = el('button', { type: 'button' }, t('Anuluj'));
        cancel.addEventListener('click', () => {
          selecting = false;
          selected.clear();
          draw();
        });
        nodes.push(mine, del, cancel);
      }
    }
    tools.replaceChildren(...nodes);
  }

  function tile(item: PanelItem): HTMLElement {
    const may = deletable(item);
    const b = el('button', { type: 'button', className: `fr-media-tile${selected.has(item.id) ? ' selected' : ''}${selecting && !may ? ' locked' : ''}`, title: `${item.name} · ${dateText(item.at)}` },
      el('div', { className: 'fr-media-ph' }, item.image.unreadable ? icon('fa-lock') : el('span', { className: 'spinner' })),
      el('div', { className: 'fr-media-meta', textContent: `${item.name} · ${new Date(item.at).toLocaleDateString(locale())}` }));
    b.dataset.mid = String(item.id);
    if (selecting && may) b.append(el('span', { className: 'fr-media-check' }, selected.has(item.id) ? icon('fa-check') : ''));
    b.addEventListener('click', () => {
      if (!selecting) return view(item);
      if (!may) return;
      if (selected.has(item.id)) selected.delete(item.id);
      else selected.add(item.id);
      draw();
    });
    const kept = thumbs.get(item.image.id);
    if (kept) loadThumb(b);
    else observer.observe(b);
    return b;
  }

  function draw() {
    // the tiles are made anew: those still waiting for their thumbnail are watched again
    observer.disconnect();
    drawUsage();
    drawTools();
    grid.classList.toggle('hidden', tab !== 'pictures');
    linksBox.classList.toggle('hidden', tab !== 'links');
    if (tab === 'links') return drawLinks();
    const scroll = grid.scrollTop;
    const nodes: Node[] = items.map(tile);
    if (!items.length && !loading && !more) nodes.push(el('div', { className: 'fr-media-empty' }, icon('fa-images'), el('p', { textContent: t('W tym czacie nie ma jeszcze zdjęć.') })));
    if (more) {
      const sentinel = el('div', { className: 'fr-media-more' }, loading ? el('span', { className: 'spinner' }) : el('button', { type: 'button' }, t('Wczytaj więcej')));
      sentinel.querySelector('button')?.addEventListener('click', () => void loadMore());
      nodes.push(sentinel);
      if (!loading) observer.observe(sentinel);
    }
    grid.replaceChildren(...nodes);
    grid.scrollTop = scroll;
  }

  function drawLinks() {
    const links = src.links?.() ?? [];
    linksBox.replaceChildren(...(links.length ? links.map((l) => {
      const a = el('a', { href: l.url, textContent: l.url, target: '_blank', rel: 'noreferrer' });
      const row = el('div', { className: 'fr-media-link' }, icon(l.url.includes('/media/') ? 'fa-photo-film' : 'fa-link'), el('div', { className: 'grow' }, a, el('br'), el('small', { className: 'muted', textContent: `${l.name} · ${dateText(l.at)}` })));
      if (src.jump) {
        const go = el('button', { type: 'button', className: 'icon-btn', title: t('Pokaż w czacie') }, icon('fa-arrow-right'));
        go.addEventListener('click', () => {
          done();
          src.jump!(l.id);
        });
        row.append(go);
      }
      return row;
    }) : [el('p', { className: 'muted', textContent: t('We wczytanych wiadomościach nie ma linków do zrzutów ani klipów.') })]));
  }

  async function removeItems(ids: number[]) {
    if (!ids.length) return;
    const ok = await confirmDialog({
      title: ids.length === 1 ? t('Usunąć zdjęcie?') : t('Usunąć zaznaczone zdjęcia ({0})?', ids.length),
      body: [el('p', { className: 'muted', textContent: t('Zniknie u wszystkich w tym czacie, a wiadomość zostanie z napisem „Zdjęcie usunięte”. Tego nie da się cofnąć.') })],
      ok: t('Usuń'), danger: true,
    });
    if (!ok) return false;
    let res: Awaited<ReturnType<MediaSource['remove']>>;
    try {
      res = await src.remove(ids);
    } catch (err) {
      deps.toast(deps.errorText(err), true);
      return false;
    }
    if (!res) return false;
    const gone = new Set(res.removed);
    items = items.filter((i) => !gone.has(i.id));
    for (const id of gone) selected.delete(id);
    if (!selected.size) selecting = false;
    if (res.removed.length) deps.toast(res.removed.length === 1 ? t('Usunięto zdjęcie.') : t('Usunięto zdjęcia: {0}.', res.removed.length));
    if (res.refused.length) deps.toast(t('Nie możesz usunąć {0} z zaznaczonych zdjęć.', res.refused.length), true);
    if (info?.usage) void refreshInfo();
    draw();
    return gone.size > 0;
  }

  // ---------- one picture big ----------

  let viewerClose: (() => void) | undefined;
  function view(item: PanelItem) {
    viewerClose?.();
    const img = el('img', { alt: '' });
    const stage = el('div', { className: 'fr-media-stage' }, el('span', { className: 'spinner' }));
    const who = el('div', { className: 'grow' }, el('b', { textContent: item.name }), el('br'), el('small', { className: 'muted', textContent: `${dateText(item.at)}${item.image.size ? ` · ${bytesText(item.image.size)}` : ''}` }));
    const buttons: HTMLElement[] = [];
    if (src.jump) {
      const go = el('button', { type: 'button' }, icon('fa-message'), ` ${t('Pokaż w czacie')}`);
      go.addEventListener('click', () => {
        close();
        done();
        src.jump!(item.id);
      });
      buttons.push(go);
    }
    if (deletable(item)) {
      const del = el('button', { type: 'button', className: 'danger' }, icon('fa-trash'), ` ${t('Usuń')}`);
      del.addEventListener('click', async () => {
        if (await removeItems([item.id])) close();
      });
      buttons.push(del);
    }
    const x = el('button', { type: 'button', className: 'icon-btn', title: t('Zamknij') }, icon('fa-xmark'));
    x.addEventListener('click', () => close());
    const index = items.findIndex((i) => i.id === item.id);
    const nav = (dir: -1 | 1) => {
      const next = items[index + dir];
      if (next) view(next);
    };
    const prev = el('button', { type: 'button', className: 'icon-btn fr-media-nav prev', title: t('Nowsze'), disabled: index <= 0 }, icon('fa-chevron-left'));
    const next = el('button', { type: 'button', className: 'icon-btn fr-media-nav next', title: t('Starsze'), disabled: index >= items.length - 1 }, icon('fa-chevron-right'));
    prev.addEventListener('click', () => nav(-1));
    next.addEventListener('click', () => nav(1));
    const box = el('div', { className: 'fr-media-viewer', role: 'dialog' }, stage, prev, next, el('div', { className: 'fr-media-bottom' }, who, ...buttons, x));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowLeft') nav(-1);
      else if (e.key === 'ArrowRight') nav(1);
    };
    const close = () => {
      box.remove();
      document.removeEventListener('keydown', onKey, true);
      if (viewerClose === close) viewerClose = undefined;
    };
    stage.addEventListener('click', (e) => e.target === stage && close());
    document.addEventListener('keydown', onKey, true);
    document.body.append(box);
    viewerClose = close;
    src.full(item).then((u) => {
      img.src = u;
      stage.replaceChildren(img);
    }, () => stage.replaceChildren(el('p', { className: 'muted', textContent: t('Zdjęcia nie ma już na serwerze.') })));
  }

  // ---------- the chat's own limits ----------

  function limitsWindow() {
    const g = info?.global;
    if (!g || !src.saveLimits) return;
    const own = info?.own ?? {};
    const MB = 1024 * 1024;
    const field = (label: string, value: number | undefined, max: number, step = 1) => {
      const input = control<HTMLInputElement>('input', { type: 'number', min: '1', max: String(max), step: String(step), value: value === undefined ? '' : String(value), placeholder: String(max) });
      return { input, node: el('label', {}, el('span', { textContent: label }), input, el('small', { className: 'muted', textContent: t('najwyżej {0}', max) })) };
    };
    const round = (v: number) => Math.round(v * 10) / 10;
    const quota = field(t('Miejsce (MB)'), own.quotaBytes ? round(own.quotaBytes / MB) : undefined, round(g.quotaBytes / MB), 0.1);
    const count = field(t('Zdjęć naraz'), own.quotaCount, g.quotaCount);
    const days = field(t('Przechowywanie (dni)'), own.days, g.days);
    const size = field(t('Największe zdjęcie (MB)'), own.maxBytes ? round(own.maxBytes / MB) : undefined, round(g.maxBytes / MB), 0.1);
    const perDay = field(t('Zdjęć dziennie na osobę'), own.perMemberDay, g.perMemberDay);
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const reset = el('button', { type: 'button' }, t('Jak w ustawieniach serwera'));
    const save = el('button', { type: 'button', className: 'primary' }, icon('fa-floppy-disk'), ` ${t('Zapisz')}`);
    const close = modalWindow(t('Limity multimediów czatu'), [
      el('p', { className: 'muted', textContent: t('Puste pole: limit z ustawień serwera. Można tylko obniżyć.') }),
      el('div', { className: 'fr-media-limits-form' }, quota.node, count.node, days.node, size.node, perDay.node),
    ], [cancel, reset, save], undefined, 'fr-group-modal');
    const num = (i: HTMLInputElement) => (i.value.trim() === '' ? null : Number(i.value));
    const send = async (raw: Record<string, number | null>) => {
      save.disabled = true;
      const next = await src.saveLimits!(raw);
      save.disabled = false;
      if (!next) return;
      info = { ...info, ...next };
      deps.toast(t('Zapisano limity czatu.'));
      close();
      draw();
    };
    cancel.addEventListener('click', close);
    reset.addEventListener('click', () => void send({}));
    save.addEventListener('click', () => void send({ quotaMb: num(quota.input), quotaCount: num(count.input), days: num(days.input), maxMb: num(size.input), perMemberDay: num(perDay.input) }));
  }

  picturesTab.addEventListener('click', () => {
    tab = 'pictures';
    picturesTab.classList.add('active');
    linksTab.classList.remove('active');
    draw();
  });
  linksTab.addEventListener('click', () => {
    tab = 'links';
    linksTab.classList.add('active');
    picturesTab.classList.remove('active');
    selecting = false;
    selected.clear();
    draw();
  });

  draw();
  void loadMore();
  return { close: done };
}

/** The panel's page of a direct or group conversation, from the server's answer. */
export function pageOf(res: any, name: (id: string) => string): { items: PanelItem[]; more: boolean; info?: LimitsInfo; moderator?: boolean } {
  const items: PanelItem[] = (res?.media ?? []).filter((m: any) => m?.image?.id).map((m: any) => ({ id: m.id, from: m.from, name: m.author?.name ?? name(m.from), at: m.at, image: m.image }));
  const info = res?.limits ? { limits: res.limits, usage: res.usage, global: res.global, own: res.own } : undefined;
  return { items, more: !!res?.more, info, moderator: !!res?.moderator };
}

export { PAGE as MEDIA_PAGE };
