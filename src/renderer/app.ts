import { SkinViewer, WalkingAnimation, IdleAnimation } from 'skinview3d';
import { createFriends, socialErrorText } from './friends';
import { openSkinEditor } from './skinEditor';
import { getLang, LANGUAGES, locale, lookup, setLang, t } from '../shared/i18n';
import type { SlashApi } from '../main/preload';

declare global {
  interface Window {
    slash: SlashApi;
  }
}

interface PublicAccount { id: string; type: 'offline' | 'msa'; name: string; uuid: string }
interface Profile {
  id: string; name: string; versionId: string; loader: 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'; loaderVersion: string; gameDir: string; memoryMb: number;
  jvmArgs: string; javaPath: string; width: number; height: number;
  icon: string; iconVersion: number; syncOptions: boolean; iconFile?: string;
  modpack?: { projectId: string; versionId: string; versionNumber: string; title: string };
  playTimeMs?: number; lastPlayedAt?: number; jvmPreset?: 'default' | 'g1' | 'zgc';
  lastTarget?: { kind: 'server'; address: string } | { kind: 'world'; folder: string; name: string };
}

/** "12 h 30 min", "45 min", "mniej niż minuta". */
function fmtPlaytime(ms = 0): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t('mniej niż minuta');
  const h = Math.floor(minutes / 60);
  return h ? t('{0} h {1} min', h, minutes % 60) : t('{0} min', minutes);
}

/** "2 godziny temu" in the UI language. */
function fmtAgo(at: number): string {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const s = (at - Date.now()) / 1000;
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  }
  return rtf.format(0, 'minute');
}
interface PublicStore {
  accounts: PublicAccount[];
  profiles: Profile[];
  settings: { msClientId: string; selectedProfileId?: string; selectedAccountId?: string; closeOnLaunch: boolean; discordEnabled: boolean; language: string; serverProfiles?: Record<string, string>; socialUrl: string };
  running: boolean;
  dataDir: string;
  systemMemoryMb: number;
}
interface VersionInfo { id: string; type: string }

const api = window.slash;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

let store: PublicStore;
let versions: VersionInfo[] = [];
let editingId: string | undefined;
let launching = false;

// ---------- helpers ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ---------- translation of the page ----------

/**
 * Translates plain texts in the page (static HTML and texts set from code) by
 * looking them up in the dictionary. Originals are remembered so switching back
 * to Polish works without a restart. Game logs, MOTDs and articles are left alone.
 */
const originals = new WeakMap<Text, string>();
/** What we last wrote into each node/attribute, to tell our own changes apart from the app's (observer callbacks run later). */
const written = new WeakMap<Text, string>();
const writtenAttrs = new WeakMap<Element, Record<string, string>>();
const attrOriginals = new WeakMap<Element, Record<string, string>>();
const SKIP = '.log, .motd, .article, code, [data-no-i18n]';
const ATTRS = ['placeholder', 'title'] as const;

function translateText(node: Text) {
  // new text from the app (not our own translation) becomes the original
  if (!originals.has(node) || written.get(node) !== node.data) originals.set(node, node.data);
  if (node.parentElement?.closest(SKIP)) return;
  const orig = originals.get(node)!;
  const trimmed = orig.trim();
  if (!trimmed) return;
  const translated = lookup(trimmed);
  const next = translated ? orig.replace(trimmed, translated) : orig;
  written.set(node, next);
  if (node.data !== next) node.data = next;
}

function translateAttrs(elm: Element) {
  if (elm.closest(SKIP)) return;
  const orig = attrOriginals.get(elm) ?? {};
  const mine = writtenAttrs.get(elm) ?? {};
  for (const attr of ATTRS) {
    const value = elm.getAttribute(attr);
    if (value === null) continue;
    if (orig[attr] === undefined || mine[attr] !== value) orig[attr] = value;
    const next = lookup(orig[attr]) ?? orig[attr];
    mine[attr] = next;
    if (value !== next) elm.setAttribute(attr, next);
  }
  attrOriginals.set(elm, orig);
  writtenAttrs.set(elm, mine);
}

function translateTree(root: Node) {
  if (root instanceof Text) return translateText(root);
  if (!(root instanceof Element)) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n instanceof Text) translateText(n);
    else translateAttrs(n as Element);
  }
}

new MutationObserver((records) => {
  for (const r of records) {
    if (r.type === 'characterData') {
      const node = r.target as Text;
      if (written.get(node) !== node.data) translateText(node);
    } else if (r.type === 'attributes') {
      const elm = r.target as Element;
      if (writtenAttrs.get(elm)?.[r.attributeName!] !== elm.getAttribute(r.attributeName!)) translateAttrs(elm);
    } else r.addedNodes.forEach(translateTree);
  }
}).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });

/** Switches the UI language and refreshes the texts kept outside the DOM. */
function applyLanguage(lang: string) {
  setLang(lang);
  document.documentElement.lang = getLang();
  translateTree(document.body);
  $('#log').dataset.empty = t('Tu pojawią się logi gry.');
  $('#news-lang-hint').textContent = getLang() === 'pl' ? t('Nowości z Minecrafta są dostępne tylko po angielsku.') : '';
}

// ---------- loading & entrance animations ----------

/** Staggered fade/slide-in for freshly rendered items. */
function appear<T extends Element>(nodes: T[], start = 0): T[] {
  nodes.forEach((n, i) => {
    n.classList.add('appear');
    (n as unknown as HTMLElement).style.setProperty('--i', String(Math.min(start + i, 14)));
  });
  return nodes;
}

const sk = (cls = '') => el('div', { className: `sk ${cls}` });

/** Placeholder rows with a shimmer, shaped like the content that is loading. */
function skeletons(kind: 'server' | 'project' | 'news' | 'shot', n: number): HTMLElement[] {
  return Array.from({ length: n }, (_, i) => {
    const card =
      kind === 'server' ? el('div', { className: 'server skeleton-card' }, sk('icon big'), el('div', { className: 'server-main' }, sk('title'), sk('short'), sk('line')), el('div', { className: 'server-side' }, sk('short'), sk('btn')))
      : kind === 'project' ? el('div', { className: 'project skeleton-card' }, sk('icon'), el('div', { className: 'project-main' }, sk('title'), sk('line'), sk('short')), el('div', { className: 'project-actions' }, sk('btn')))
      : kind === 'news' ? el('div', { className: 'news-card skeleton-card' }, sk('thumb'), el('div', {}, sk('short'), sk('title'), sk('line'), sk('line')))
      : el('div', { className: 'shot skeleton-card' }, sk('thumb'));
    card.style.setProperty('--i', String(i));
    card.classList.add('appear');
    return card;
  });
}

/** Every <img> fades in once loaded instead of popping in. */
function fadeImage(img: HTMLImageElement) {
  if (img.classList.contains('fade')) return;
  img.classList.add('fade');
  const done = () => img.classList.add('loaded');
  if (img.complete && img.naturalWidth) done();
  else {
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  }
}
new MutationObserver((records) => {
  for (const r of records) r.addedNodes.forEach((n) => {
    if (n instanceof HTMLImageElement) fadeImage(n);
    else if (n instanceof HTMLElement) n.querySelectorAll('img').forEach(fadeImage);
  });
}).observe(document.body, { childList: true, subtree: true });

/** Shows a spinner in a button while `work` runs. */
async function busy<T>(button: HTMLButtonElement, work: () => Promise<T>, label?: string): Promise<T> {
  const before = [...button.childNodes];
  button.classList.add('busy');
  button.disabled = true;
  button.replaceChildren(el('span', { className: 'spinner' }), ...(label ? [label] : before.filter((n) => n.nodeType === Node.TEXT_NODE)));
  try {
    return await work();
  } finally {
    button.classList.remove('busy');
    button.disabled = false;
    button.replaceChildren(...before);
  }
}

/** Strips Electron's "Error invoking remote method 'x': Error:" prefix. */
function errorText(err: unknown): string {
  const text = String((err as Error)?.message ?? err)
    .replace(/^Error invoking remote method '[^']+': /, '')
    .replace(/^(?:[A-Z][A-Za-z]*Error|Error): /, '');
  if (text.startsWith('social:')) return socialErrorText(text.slice(7));
  // a raw network failure that slipped through: say it in words
  if (/^fetch failed$|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/.test(text)) return t('Brak połączenia z internetem. Sprawdź połączenie i spróbuj ponownie.');
  return text;
}

/** Slides a notification out, then removes it. */
function dismiss(card: HTMLElement) {
  if (card.classList.contains('leaving')) return;
  card.classList.add('leaving');
  card.addEventListener('animationend', () => card.remove(), { once: true });
  setTimeout(() => card.remove(), 400); // in case animations are off
}

/** Removes a notification after `ms`, with a shrinking bar; the countdown waits while the mouse is over it. */
function dismissLater(card: HTMLElement, ms: number) {
  const bar = el('div', { className: 'notif-timer' });
  bar.style.animationDuration = `${ms}ms`;
  bar.addEventListener('animationend', () => dismiss(card));
  card.append(bar);
}

/**
 * Notifications stack in the top right corner. Running tasks always stay; finished
 * cards and toasts beyond the newest few go away, so a burst never overflows the window.
 */
const MAX_CARDS = 5;
function trimStack() {
  const cards = [...document.querySelectorAll<HTMLElement>('#tasks .task:not(.leaving)')];
  let room = MAX_CARDS - cards.filter((c) => !c.classList.contains('notif') && !c.classList.contains('done') && !c.classList.contains('failed')).length;
  for (const c of cards) {
    const running = !c.classList.contains('notif') && !c.classList.contains('done') && !c.classList.contains('failed');
    if (running) continue;
    if (room > 0) room--;
    else dismiss(c);
  }
}
function toast(message: string, isError = false) {
  const close = el('button', { type: 'button', className: 'notif-close', title: t('Zamknij') }, el('i', { className: 'fa-solid fa-xmark' }));
  const card = el('div', { className: `task notif${isError ? ' failed' : ''}`, role: isError ? 'alert' : 'status' },
    el('i', { className: `notif-icon fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}` }),
    el('div', { className: 'notif-text', textContent: message }),
    close);
  close.addEventListener('click', () => dismiss(card));
  $('#tasks').prepend(card);
  dismissLater(card, isError ? 9000 : 4500);
  trimStack();
}

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    toast(errorText(err), true);
    return undefined;
  }
}

// ---------- player heads, cut from the real skin ----------

/**
 * Heads are drawn from the skin texture the launcher already gets from Mojang
 * (face 8×8 at (8,8) plus the hat/hair overlay at (40,8)), instead of relying on
 * a third-party avatar service that sometimes answers with Steve.
 */
const heads = new Map<string, string>();
const headRequests = new Map<string, Promise<string | undefined>>();

function headFor(accountId: string): Promise<string | undefined> {
  if (!headRequests.has(accountId)) {
    headRequests.set(accountId, (async () => {
      const skin = await api.getSkin(accountId).catch(() => undefined);
      if (!skin) return undefined;
      const img = new Image();
      img.src = skin.dataUrl;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64);
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64);
      const url = canvas.toDataURL('image/png');
      heads.set(accountId, url);
      return url;
    })());
  }
  return headRequests.get(accountId)!;
}

/** An <img> that shows the account's head as soon as it has been cut from the skin. */
function avatar(account: { id: string }) {
  const img = el('img', { alt: '' });
  img.style.imageRendering = 'pixelated';
  const known = heads.get(account.id);
  if (known) img.src = known;
  else headFor(account.id).then((url) => url && (img.src = url));
  return img;
}

function versionLabel(id: string): string {
  if (id === 'latest-release') return t('Najnowsze wydanie');
  if (id === 'latest-snapshot') return t('Najnowszy snapshot');
  return id;
}

const LOADER_NAMES = { vanilla: '', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' } as const;

function profileLabel(p: Profile): string {
  const loader = LOADER_NAMES[p.loader ?? 'vanilla'];
  return loader ? `${versionLabel(p.versionId)} · ${loader}${p.loaderVersion ? ` ${p.loaderVersion}` : ''}` : versionLabel(p.versionId);
}

// ---------- navigation ----------

document.querySelectorAll<HTMLButtonElement>('.nav').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${btn.dataset.view}`));
  }),
);

// ---------- rendering ----------

function render() {
  renderPlay();
  renderContentProfiles();
  renderProfiles();
  renderAccounts();
  renderSettings();
}

function fillSelect(select: HTMLSelectElement, items: { value: string; label: string }[], selected?: string) {
  select.replaceChildren(...items.map(({ value, label }) => el('option', { value, textContent: label, selected: value === selected })));
}

// ---------- memory recommendation ----------

let memoryRecommendation: { mb: number; mods: number } | undefined;
const gb = (mb: number) => (mb / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 });

function renderMemoryHint(currentMb: number) {
  const system = store.systemMemoryMb;
  const parts = [t('Komputer ma {0} GB RAM', gb(system))];
  if (memoryRecommendation) {
    parts.push(memoryRecommendation.mods
      ? t('zalecane {0} GB ({1} modów)', gb(memoryRecommendation.mb), memoryRecommendation.mods)
      : t('zalecane {0} GB', gb(memoryRecommendation.mb)));
  }
  const tooMuch = currentMb > system - 4096;
  if (tooMuch) parts.push(t('zostaw co najmniej 4 GB dla systemu'));
  $('#memory-hint-text').textContent = parts.join(' · ');
  $('#memory-hint').classList.toggle('warn', tooMuch);
  $('#memory-recommended').classList.toggle('hidden', !memoryRecommendation || memoryRecommendation.mb === currentMb);
}

$('#memory-recommended').addEventListener('click', () => {
  if (!memoryRecommendation) return;
  const slider = $<HTMLFormElement>('#profile-form').elements.namedItem('memoryMb') as HTMLInputElement;
  slider.value = String(memoryRecommendation.mb);
  $('#memory-value').textContent = `${memoryRecommendation.mb} MB`;
  renderMemoryHint(memoryRecommendation.mb);
});

// ---------- modpack of a profile ----------

let modpackLatest: ProjectVersion | undefined;

function renderModpackBox(profile: Profile) {
  const pack = profile.modpack;
  $('#modpack-box').classList.toggle('hidden', !pack);
  if (!pack) return;
  $('#modpack-title').textContent = pack.title;
  $('#modpack-version').textContent = pack.versionNumber;
  const upd = $<HTMLButtonElement>('#modpack-update');
  const newer = modpackLatest && modpackLatest.projectId === pack.projectId && modpackLatest.id !== pack.versionId ? modpackLatest : undefined;
  upd.classList.toggle('hidden', !newer);
  if (newer) upd.replaceChildren(el('i', { className: 'fa-solid fa-circle-arrow-up' }), t('Aktualizuj do {0}', newer.versionNumber));
  if (!modpackLatest || modpackLatest.projectId !== pack.projectId) $('#modpack-status').textContent = '';
}

$('#modpack-check').addEventListener('click', () => {
  const profile = store.profiles.find((p) => p.id === editingId);
  if (!profile?.modpack) return;
  busy($<HTMLButtonElement>('#modpack-check'), async () => {
    const res = await guard(() => api.checkModpack(profile.id));
    if (!res) return;
    modpackLatest = res.latest;
    $('#modpack-status').textContent = res.latest && res.latest.id !== profile.modpack!.versionId
      ? t('Dostępna nowa wersja: {0}', res.latest.versionNumber)
      : t('Masz najnowszą wersję.');
    renderModpackBox(profile);
  });
});
$('#modpack-update').addEventListener('click', () => {
  const profile = store.profiles.find((p) => p.id === editingId);
  if (profile && modpackLatest) guard(() => api.updateModpack(profile.id, modpackLatest!.id)).then(() => ($('#modpack-status').textContent = ''));
});
$('#modpack-versions').addEventListener('click', async () => {
  const profile = store.profiles.find((p) => p.id === editingId);
  if (!profile?.modpack) return;
  const v = await chooseVersion({ title: profile.modpack.title, projectId: profile.modpack.projectId, type: 'modpack', currentVersionId: profile.modpack.versionId, profileId: profile.id });
  if (v) guard(() => api.updateModpack(profile.id, v.id));
});

// ---------- profile icons ----------

const BLOCKS = ['grass', 'dirt', 'stone', 'sand', 'planks', 'log', 'diamond-ore', 'obsidian', 'netherrack'];

function profileIconUrl(p: Profile): string {
  if (p.icon === 'custom' && p.iconFile) return `slash-media://local/?path=${encodeURIComponent(p.iconFile)}&v=${p.iconVersion}`;
  const kind = p.icon?.startsWith('block:') ? p.icon.slice(6) : 'grass';
  return `img/blocks/${BLOCKS.includes(kind) ? kind : 'grass'}.png`;
}

function profileIconImg(p: Profile): HTMLImageElement {
  const img = el('img', { className: 'profile-icon', alt: '' });
  img.src = profileIconUrl(p);
  return img;
}

/** Block buttons, the profile's own picture (if any) and an upload button. */
function renderIconChoices(profile: Profile) {
  const current = profile.icon || 'block:grass';
  const choice = (value: string, src: string, title: string) => {
    const b = el('button', { type: 'button', className: `icon-choice${value === current ? ' selected' : ''}`, title }, el('img', { src, alt: '' }));
    b.addEventListener('click', () => guard(async () => {
      await api.setProfileIcon(profile.id, value === 'block:grass' ? '' : value);
    }));
    return b;
  };
  const items = BLOCKS.map((k) => choice(`block:${k}`, `img/blocks/${k}.png`, k));
  if (profile.icon === 'custom') items.push(choice('custom', profileIconUrl(profile), t('Własny obrazek')));
  const upload = el('button', { type: 'button', className: 'icon-choice upload' }, el('i', { className: 'fa-regular fa-image' }), ` ${t('Własny obrazek…')}`);
  upload.addEventListener('click', () => guard(() => busy(upload, () => api.chooseProfileIcon(profile.id))));
  $('#icon-choices').replaceChildren(...items, upload);
}

// ---------- back to the game ----------

function renderContinue(profile: Profile | undefined) {
  const box = $('#continue');
  const target = profile?.lastTarget;
  box.classList.toggle('hidden', !target || store.running || launching);
  if (!target || !profile) return;
  $('#continue-icon').className = target.kind === 'server' ? 'fa-solid fa-server' : 'fa-solid fa-earth-europe';
  $('#continue-where').textContent = target.kind === 'server'
    ? t('{0} · serwer', servers.find((s) => s.ip.toLowerCase() === target.address.toLowerCase())?.name ?? target.address)
    : t('{0} · świat', target.name);
  $('#continue-when').textContent = profile.lastPlayedAt ? t('Ostatnio {0}', fmtAgo(profile.lastPlayedAt)) : '';
}

$('#continue-play').addEventListener('click', () => {
  const profile = store.profiles.find((p) => p.id === $<HTMLSelectElement>('#play-profile').value);
  const target = profile?.lastTarget;
  if (!target) return;
  if (target.kind === 'server') startGame(target.address);
  else startGame(undefined, target.folder);
});

// ---------- dropdowns with pictures ----------

interface PickItem { value: string; label: string; sub?: string; img: string; pixelated?: boolean }

/**
 * Replaces a <select>'s look with a list that can show pictures. The real
 * <select> stays (hidden) and keeps the value, so the rest of the code reads it as before.
 */
function picker(select: HTMLSelectElement, items: PickItem[], empty = 'Brak') {
  let box = select.nextElementSibling as HTMLElement | null;
  if (!box?.classList.contains('picker')) {
    box = el('div', { className: 'picker' });
    select.classList.add('native-hidden');
    select.after(box);
  }
  const current = items.find((i) => i.value === select.value);
  const face = (item: PickItem | undefined) => {
    const img = el('img', { alt: '', className: item?.pixelated ? 'pixelated' : '' });
    img.src = item?.img ?? 'logo.png';
    return [img, el('span', { className: 'picker-text' }, el('b', { textContent: item?.label ?? empty }), el('small', { textContent: item?.sub ?? '' }))];
  };
  const button = el('button', { type: 'button', className: 'picker-button', disabled: !items.length }, ...face(current), el('i', { className: 'fa-solid fa-chevron-up' }));
  const menu = el('div', { className: 'picker-menu hidden' }, ...items.map((item) => {
    const row = el('button', { type: 'button', className: `picker-item${item.value === select.value ? ' selected' : ''}` }, ...face(item));
    row.addEventListener('click', () => {
      select.value = item.value;
      select.dispatchEvent(new Event('change'));
      menu.classList.add('hidden');
    });
    return row;
  }));
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.picker-menu').forEach((m) => m !== menu && m.classList.add('hidden'));
    menu.classList.toggle('hidden');
  });
  box.replaceChildren(button, menu);
}

document.addEventListener('click', () => document.querySelectorAll('.picker-menu').forEach((m) => m.classList.add('hidden')));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.picker-menu').forEach((m) => m.classList.add('hidden'));
});

/** Head for the account picker; until it is ready the picker shows a placeholder and redraws once it is. */
function avatarUrl(accountId: string): string {
  const known = heads.get(accountId);
  if (!known) headFor(accountId).then((url) => url && renderPlay());
  return known ?? 'logo.png';
}

function renderPlay() {
  const profileSel = $<HTMLSelectElement>('#play-profile');
  const accountSel = $<HTMLSelectElement>('#play-account');
  fillSelect(profileSel, store.profiles.map((p) => ({ value: p.id, label: p.name })), store.settings.selectedProfileId);
  fillSelect(accountSel, store.accounts.map((a) => ({ value: a.id, label: `${a.name}${a.type === 'offline' ? ' (offline)' : ''}` })), store.settings.selectedAccountId);
  if (store.accounts.length === 0) accountSel.append(el('option', { value: '', textContent: 'Brak kont' }));
  picker(profileSel, store.profiles.map((p) => ({ value: p.id, label: p.name, sub: profileLabel(p), img: profileIconUrl(p), pixelated: p.icon !== 'custom' })));
  picker(accountSel, store.accounts.map((a) => ({ value: a.id, label: a.name, sub: a.type === 'msa' ? 'Microsoft' : 'Offline', img: avatarUrl(a.id), pixelated: true })), 'Brak kont');

  const profile = store.profiles.find((p) => p.id === profileSel.value) ?? store.profiles[0];
  $('#hero-title').textContent = profile?.name ?? 'Minecraft';
  const heroIcon = $<HTMLImageElement>('#hero-icon');
  if (profile && heroIcon.getAttribute('src') !== profileIconUrl(profile)) heroIcon.src = profileIconUrl(profile);
  heroIcon.classList.toggle('custom', profile?.icon === 'custom');
  $('#hero-sub').textContent = profile
    ? [profileLabel(profile), `${profile.memoryMb} MB RAM`, profile.playTimeMs ? t('{0} gry', fmtPlaytime(profile.playTimeMs)) : ''].filter(Boolean).join(' · ')
    : '';
  renderContinue(profile);

  const btn = $<HTMLButtonElement>('#play-btn');
  btn.textContent = store.running ? 'ZATRZYMAJ' : 'GRAJ';
  btn.classList.toggle('stop', store.running);
  btn.disabled = launching;

}

function renderProfiles() {
  if (!store.profiles.some((p) => p.id === editingId)) editingId = store.settings.selectedProfileId ?? store.profiles[0]?.id;
  $('#profile-list').replaceChildren(
    ...store.profiles.map((p) => {
      const li = el('li', { className: p.id === editingId ? 'selected' : '' },
        profileIconImg(p),
        el('div', { className: 'grow' }, p.name, el('small', { textContent: [profileLabel(p), p.playTimeMs ? fmtPlaytime(p.playTimeMs) : ''].filter(Boolean).join(' · ') })));
      li.addEventListener('click', () => {
        editingId = p.id;
        renderProfiles();
      });
      return li;
    }),
  );
  const profile = store.profiles.find((p) => p.id === editingId);
  if (profile) loadProfileForm(profile);
}

function renderVersionOptions(selected: string) {
  const snapshots = $<HTMLInputElement>('#show-snapshots').checked;
  const old = $<HTMLInputElement>('#show-old').checked;
  const list = versions.filter((v) => v.type === 'release' || (snapshots && v.type === 'snapshot') || (old && v.type.startsWith('old_')) || v.id === selected);
  fillSelect(
    $<HTMLSelectElement>('#version-select'),
    [
      { value: 'latest-release', label: t('Najnowsze wydanie') },
      { value: 'latest-snapshot', label: t('Najnowszy snapshot') },
      ...list.map((v) => ({ value: v.id, label: v.type === 'release' ? v.id : `${v.id} (${v.type.replace('old_', '')})` })),
    ],
    selected,
  );
}

function loadProfileForm(profile: Profile) {
  const form = $<HTMLFormElement>('#profile-form');
  for (const key of ['name', 'gameDir', 'jvmArgs', 'javaPath', 'memoryMb', 'width', 'height'] as const) {
    (form.elements.namedItem(key) as HTMLInputElement).value = String(profile[key]);
  }
  renderVersionOptions(profile.versionId);
  renderIconChoices(profile);
  renderModpackBox(profile);
  (form.elements.namedItem('syncOptions') as HTMLInputElement).checked = profile.syncOptions ?? false;
  $<HTMLSelectElement>('#loader-select').value = profile.loader ?? 'vanilla';
  renderLoaderVersions(profile.loaderVersion ?? '');
  $('#memory-value').textContent = `${profile.memoryMb} MB`;
  (form.elements.namedItem('jvmPreset') as HTMLSelectElement).value = profile.jvmPreset ?? 'default';
  // the slider goes up to what this computer has (leaving 2 GB), the hint suggests a value
  const slider = form.elements.namedItem('memoryMb') as HTMLInputElement;
  slider.max = String(Math.max(4096, Math.floor((store.systemMemoryMb - 2048) / 512) * 512));
  slider.value = String(profile.memoryMb);
  memoryRecommendation = undefined;
  renderMemoryHint(profile.memoryMb);
  api.recommendedMemory(profile.id).then((r: { mb: number; mods: number }) => {
    if (editingId !== profile.id) return;
    memoryRecommendation = r;
    renderMemoryHint(Number(slider.value));
  });
}

/** Fills the loader-version dropdown for the chosen loader and game version. */
let loaderRequest = 0;
async function renderLoaderVersions(selected: string) {
  const loader = $<HTMLSelectElement>('#loader-select').value;
  const select = $<HTMLSelectElement>('#loader-version-select');
  $('#loader-version-field').classList.toggle('hidden', loader === 'vanilla');
  // Quilt is no longer actively developed and its loaders can't read Java 25 class files (MC 26.x).
  $('#loader-hint').classList.toggle('hidden', loader !== 'quilt');
  if (loader === 'vanilla') return;
  const request = ++loaderRequest;
  fillSelect(select, [{ value: selected, label: selected || t('Najnowsza stabilna') }], selected);
  try {
    const list: { version: string; stable: boolean }[] = await api.loaderVersions(loader, $<HTMLSelectElement>('#version-select').value);
    if (request !== loaderRequest) return; // a newer choice replaced this one
    if (!list.length) {
      fillSelect(select, [{ value: '', label: t('Brak wsparcia dla tej wersji') }], '');
      return;
    }
    fillSelect(select, [
      { value: '', label: t('Najnowsza stabilna ({0})', (list.find((v) => v.stable) ?? list[0]).version) },
      ...list.slice(0, 40).map((v) => ({ value: v.version, label: v.stable ? v.version : `${v.version} (beta)` })),
    ], selected);
  } catch (err) {
    if (request === loaderRequest) fillSelect(select, [{ value: selected, label: t('Błąd: {0}', errorText(err)) }], selected);
  }
}

function renderAccounts() {
  if (document.querySelector('#view-accounts.active')) renderSkin();
  const list = $('#account-list');
  list.replaceChildren(
    ...store.accounts.map((a) => {
      const current = a.id === (store.settings.selectedAccountId ?? store.accounts[0]?.id);
      const remove = el('button', { className: 'danger', textContent: 'Usuń' });
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        guard(() => api.deleteAccount(a.id));
      });
      const use = current
        ? el('span', { className: 'in-use' }, el('i', { className: 'fa-solid fa-check' }), t(' W użyciu'))
        : el('button', { className: 'use', textContent: t('Użyj') });
      const li = el('li', { className: current ? 'current' : 'switchable', title: current ? '' : t('Przełącz na to konto') },
        avatar(a), el('div', { className: 'grow' }, a.name, el('small', { textContent: a.uuid })),
        el('span', { className: `badge ${a.type}`, textContent: a.type === 'msa' ? 'Microsoft' : 'Offline' }), use, remove);
      if (!current) li.addEventListener('click', () => selectAccount(a.id));
      return li;
    }),
  );
  if (store.accounts.length === 0) list.append(el('li', { className: 'muted', textContent: 'Nie dodano jeszcze żadnego konta.' }));
}

function renderSettings() {
  const form = $<HTMLFormElement>('#settings-form');
  (form.elements.namedItem('msClientId') as HTMLInputElement).value = store.settings.msClientId;
  (form.elements.namedItem('socialUrl') as HTMLInputElement).value = store.settings.socialUrl;
  fillSelect($<HTMLSelectElement>('#language-select'), LANGUAGES.map((l) => ({ value: l.code, label: l.name })), getLang());
  (form.elements.namedItem('closeOnLaunch') as HTMLInputElement).checked = store.settings.closeOnLaunch;
  (form.elements.namedItem('discordEnabled') as HTMLInputElement).checked = store.settings.discordEnabled ?? true;
  $('#data-dir').textContent = store.dataDir;
  api.appVersion().then((v: string) => ($('#app-version').textContent = v));
}

// ---------- play ----------

const log = $('#log');
/** Level of a game log line: errors (and stack traces), warnings, or plain info. */
function lineLevel(line: string): 'error' | 'warn' | '' {
  if (/\/(ERROR|FATAL)\]|^\s+at |Exception|^Caused by:/.test(line)) return 'error';
  if (/\/WARN\]/.test(line)) return 'warn';
  return '';
}

let logQuery = '';

function appendLog(line: string) {
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
  const level = lineLevel(line);
  const div = el('div', { className: `line${level ? ` lvl-${level}` : ''}`, textContent: line });
  if (logQuery && !line.toLowerCase().includes(logQuery)) div.classList.add('miss');
  log.append(div);
  // Keep the DOM small during long sessions.
  while (log.childElementCount > 2000) log.firstElementChild?.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

const logText = () => [...log.children].map((l) => l.textContent).join('\n');

$('#log-search').addEventListener('input', () => {
  logQuery = $<HTMLInputElement>('#log-search').value.trim().toLowerCase();
  for (const line of log.children) line.classList.toggle('miss', Boolean(logQuery) && !(line.textContent ?? '').toLowerCase().includes(logQuery));
});
document.querySelectorAll<HTMLButtonElement>('#log-level button').forEach((b) =>
  b.addEventListener('click', () => {
    log.dataset.level = b.dataset.level;
    document.querySelectorAll('#log-level button').forEach((x) => x.classList.toggle('active', x === b));
  }));
$('#log-copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(logText());
  toast(t('Skopiowano log'));
});
$('#log-share').addEventListener('click', () => busy($<HTMLButtonElement>('#log-share'), async () => {
  try {
    const url: string | undefined = await api.shareLog(logText());
    if (url) toast(t('Link do logu skopiowany: {0}', url));
  } catch (err) {
    toast(errorText(err), true);
  }
}));

function setProgress(label: string, fraction: number, stats = '', indeterminate = false) {
  $('.progress').classList.toggle('indeterminate', indeterminate);
  $('#progress-label').textContent = label;
  $('#progress-stats').textContent = stats;
  $('#progress-bar').style.width = `${(fraction * 100).toFixed(1)}%`;
}

const MB = 1024 * 1024;
const fmtMb = (bytes: number) => (bytes / MB).toLocaleString(locale(), { maximumFractionDigits: bytes < 10 * MB ? 1 : 0 });
function fmtSpeed(bps: number): string {
  if (bps >= MB) return `${(bps / MB).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB/s`;
  return `${Math.round(bps / 1024)} KB/s`;
}

interface StageEvent { stage: string; done: number; total: number; bytes?: number; totalBytes?: number; speed?: number }

function showStage({ stage, done, total, bytes, totalBytes, speed }: StageEvent) {
  // single-step stages have no meaningful percentage: show a moving bar instead
  if (total <= 1 && !totalBytes) return setProgress(`${stage}…`, 0, '', done < total || total === 0 || !/Gra|Gotowe/.test(stage));
  // Byte-based progress when sizes are known; otherwise fall back to file count.
  const fraction = totalBytes ? Math.min(1, (bytes ?? 0) / totalBytes) : done / total;
  const pct = (fraction * 100).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const parts = [t('{0} / {1} plików', done, total)];
  if (totalBytes) parts.push(`${fmtMb(bytes ?? 0)} / ${fmtMb(totalBytes)} MB`);
  if (speed && done < total) parts.push(fmtSpeed(speed));
  setProgress(t('{0}: {1}%', stage, pct), fraction, parts.join(' · '));
}

$('#play-profile').addEventListener('change', (e) => {
  store.settings.selectedProfileId = (e.target as HTMLSelectElement).value;
  api.saveSettings({ selectedProfileId: store.settings.selectedProfileId });
  renderPlay();
});
$('#play-account').addEventListener('change', (e) => selectAccount((e.target as HTMLSelectElement).value));

/** Makes an account the one used to play; the Play bar and the Accounts tab follow. */
function selectAccount(id: string) {
  store.settings.selectedAccountId = id;
  api.saveSettings({ selectedAccountId: id });
  chosenPreset = undefined;
  renderPlay();
  renderAccounts();
  renderLibrary();
}

function showView(name: string) {
  document.querySelector<HTMLButtonElement>(`.nav[data-view="${name}"]`)?.click();
}

/** Starts the selected profile with the selected account, optionally joining a server. */
async function startGame(server?: string, world?: string) {
  if (store.running || launching) return toast('Gra już działa.', true);
  launching = true;
  if (!(await confirmModsOk($<HTMLSelectElement>('#play-profile').value))) {
    launching = false;
    return;
  }
  log.replaceChildren();
  showLog(true);
  $('#crash').classList.add('hidden');
  showView('play');
  renderPlay();
  try {
    await api.launch($<HTMLSelectElement>('#play-profile').value, $<HTMLSelectElement>('#play-account').value, server, world);
    setProgress('Gra działa', 1);
  } catch (err) {
    setProgress('Błąd uruchamiania', 0);
    toast(errorText(err), true);
    appendLog(`[SlashClient] ${errorText(err)}`);
  } finally {
    launching = false;
    renderPlay();
  }
}

$('#play-btn').addEventListener('click', () => (store.running ? void api.kill() : startGame()));

interface CrashAnalysis { title: string; details: string[]; fix?: string; crashReport?: string }
let crashReport: string | undefined;

api.on('game:crash', (a: CrashAnalysis) => {
  $('#crash-title').textContent = a.title;
  $('#crash-details').replaceChildren(...a.details.map((d) => el('li', { textContent: d })));
  $('#crash-fix').textContent = a.fix ?? '';
  crashReport = a.crashReport;
  $('#crash-report').classList.toggle('hidden', !a.crashReport);
  $('#crash').classList.remove('hidden');
  showView('play');
});
$('#crash-close').addEventListener('click', () => $('#crash').classList.add('hidden'));
$('#crash-report').addEventListener('click', () => crashReport && api.revealFile(crashReport));
$('#crash-copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(logText());
  toast('Skopiowano log');
});

api.on('launch:stage', showStage);
api.on('game:log', appendLog);
api.on('game:exit', ({ code, signal, byUser }: { code: number | null; signal: string | null; byUser: boolean }) => {
  if (code === 0 || byUser) return setProgress('Gotowe do gry', 0);
  // A signal without a user request means the OS killed the game (crash, code signature, out of memory).
  const reason = signal ? t('Gra została zabita przez system ({0})', signal) : t('Gra zakończyła się z kodem {0}', String(code));
  setProgress(reason, 0);
  appendLog(`[SlashClient] ${reason}.`);
  toast(t('{0}. Sprawdź logi.', reason), true);
});
api.on('store', (s: PublicStore) => {
  store = s;
  render();
});

// ---------- profiles ----------

$('#profile-add').addEventListener('click', async () => {
  const profile = await api.newProfile();
  editingId = await guard(() => api.saveProfile(profile));
});

$('#show-snapshots').addEventListener('change', () => renderVersionOptions($<HTMLSelectElement>('#version-select').value));
$('#show-old').addEventListener('change', () => renderVersionOptions($<HTMLSelectElement>('#version-select').value));
$('#profile-form').addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.name === 'memoryMb') {
    $('#memory-value').textContent = `${target.value} MB`;
    renderMemoryHint(Number(target.value));
  }
});

$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = store.profiles.find((p) => p.id === editingId);
  if (!current) return;
  const data = new FormData(e.target as HTMLFormElement);
  const str = (k: string) => String(data.get(k) ?? '').trim();
  const updated: Profile = {
    ...current,
    name: str('name') || 'Profil',
    versionId: str('versionId'),
    loader: str('loader') as Profile['loader'],
    syncOptions: data.get('syncOptions') === 'on',
    jvmPreset: str('jvmPreset') as Profile['jvmPreset'],
    loaderVersion: str('loaderVersion'),
    gameDir: str('gameDir'),
    jvmArgs: str('jvmArgs'),
    javaPath: str('javaPath'),
    memoryMb: Number(str('memoryMb')),
    width: Number(str('width')) || 854,
    height: Number(str('height')) || 480,
  };
  if ((await guard(() => api.saveProfile(updated))) !== undefined) toast('Zapisano profil');
});

$('#profile-delete').addEventListener('click', () => {
  if (!editingId || !confirm(t('Usunąć ten profil? Pliki gry zostaną na dysku.'))) return;
  guard(async () => {
    await api.deleteProfile(editingId!);
    // the form now shows another profile: start from the top of the list
    $('#view-profiles').scrollTo({ top: 0, behavior: 'smooth' });
  });
});
$('#profile-folder').addEventListener('click', () => editingId && guard(() => api.openProfileDir(editingId!)));
$('#profile-mods').addEventListener('click', () => editingId && guard(() => api.openModsDir(editingId!)));
$('#profile-duplicate').addEventListener('click', async () => {
  if (!editingId) return;
  const id: string | undefined = await guard(() => api.duplicateProfile(editingId!));
  if (id) {
    editingId = id;
    renderProfiles();
  }
});
$('#profile-export').addEventListener('click', () => editingId && busy($<HTMLButtonElement>('#profile-export'), () => guard(() => api.exportProfile(editingId!))));
$('#loader-select').addEventListener('change', () => renderLoaderVersions(''));
$('#version-select').addEventListener('change', () => renderLoaderVersions(''));

// ---------- accounts ----------

$('#offline-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = (e.target as HTMLFormElement).elements.namedItem('nick') as HTMLInputElement;
  await guard(async () => {
    await api.addOfflineAccount(input.value);
    input.value = '';
    toast('Dodano konto offline');
  });
});

$('#ms-login').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('#ms-login');
  btn.disabled = true;
  btn.prepend(el('span', { className: 'spinner' }));
  try {
    const name = await api.loginMicrosoft();
    toast(t('Zalogowano jako {0}', name));
  } catch (err) {
    toast(errorText(err), true);
  } finally {
    btn.querySelector('.spinner')?.remove();
    btn.disabled = false;
    $('#ms-code').classList.add('hidden');
  }
});
$('#ms-cancel').addEventListener('click', () => api.cancelLogin());
$('#ms-copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('#ms-user-code').textContent ?? '');
  $('#ms-copy').replaceChildren(el('i', { className: 'fa-solid fa-check' }), t(' Skopiowano'));
  setTimeout(() => $('#ms-copy').replaceChildren(el('i', { className: 'fa-regular fa-copy' }), t(' Kopiuj kod')), 1500);
});
api.on('login:code', ({ userCode, url, copied }: { userCode: string; url: string; copied?: boolean }) => {
  $('#ms-user-code').textContent = userCode;
  $('#ms-copied').classList.toggle('hidden', !copied);
  Object.assign($<HTMLAnchorElement>('#ms-url'), { href: url, textContent: url });
  $('#ms-code').classList.remove('hidden');
});

// ---------- settings ----------

$('#settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  await guard(() =>
    api.saveSettings({
      msClientId: (form.elements.namedItem('msClientId') as HTMLInputElement).value.trim(),
      closeOnLaunch: (form.elements.namedItem('closeOnLaunch') as HTMLInputElement).checked,
      discordEnabled: (form.elements.namedItem('discordEnabled') as HTMLInputElement).checked,
      socialUrl: (form.elements.namedItem('socialUrl') as HTMLInputElement).value.trim().replace(/\/$/, '') || store.settings.socialUrl,
      language: $<HTMLSelectElement>('#language-select').value,
    }),
  );
  toast('Zapisano ustawienia');
  store = await api.getStore();
  friends.init();
});

// ---------- friends ----------

const friends = createFriends($('#friends-root'), $('#friends-badge'), {
  api,
  toast,
  errorText,
  // a friend's server is not on the list: the join window gets what we know about it
  join: (address, version) => openJoin({
    id: '', name: address, ip: address, description: '', motdHtml: [], motdClean: [], modes: [], versions: version ? [version] : [],
    votes: 0, online: true, playersOnline: 0, playersMax: 0, hasIcon: false, promoted: false, featured: false,
  }),
});
document.querySelector('.nav[data-view="friends"]')?.addEventListener('click', () => friends.show());

// ---------- servers (lista.slash3rss.dev) ----------

interface ListedServer {
  id: string; name: string; ip: string; description: string; motdHtml: string[]; motdClean: string[];
  modes: string[]; versions: string[]; votes: number; online: boolean; playersOnline: number; playersMax: number;
  hasIcon: boolean; promoted: boolean; featured: boolean; website?: string; discord?: string;
}
interface MotdSegment { text: string; color?: string; bold?: boolean; italic?: boolean }
interface PingResult { latency: number; version: string; playersOnline: number; playersMax: number; motd: MotdSegment[][]; favicon?: string }

const LIST_API = 'https://api.slash3rss.dev';
const PAGE = 30;
let servers: ListedServer[] = [];
let serverSort = 'votes';
let shown = PAGE;
const pings = new Map<string, { at: number; result?: PingResult; error?: string }>();

/**
 * Turns the API's MOTD HTML into plain segments. DOMParser builds an inert
 * document (no scripts run), and only text plus colour/bold/italic are kept.
 */
function motdFromHtml(html: string): MotdSegment[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out: MotdSegment[] = [];
  doc.body.querySelectorAll('span').forEach((span) => {
    if (span.querySelector('span')) return;
    const color = span.style.color;
    out.push({ text: span.textContent ?? '', color: color || undefined, bold: span.style.fontWeight === 'bold', italic: span.style.fontStyle === 'italic' });
  });
  return out.length ? out : [{ text: doc.body.textContent ?? '' }];
}

function renderMotd(lines: MotdSegment[][]) {
  return el('div', { className: 'motd' }, ...lines.map((line) =>
    el('div', {}, ...(line.length ? line : [{ text: ' ' }]).map((seg) => {
      const span = el('span', { textContent: seg.text });
      if (seg.color) span.style.color = seg.color;
      if (seg.bold) span.style.fontWeight = '700';
      if (seg.italic) span.style.fontStyle = 'italic';
      return span;
    }))));
}

function pingClass(ms: number) {
  return ms < 80 ? 'ping-good' : ms < 200 ? 'ping-ok' : 'ping-bad';
}

function filteredServers(): ListedServer[] {
  const q = $<HTMLInputElement>('#servers-search').value.trim().toLowerCase();
  const mode = $<HTMLSelectElement>('#servers-mode').value;
  const list = servers.filter((s) =>
    (!q || s.name.toLowerCase().includes(q) || s.ip.toLowerCase().includes(q)) && (!mode || s.modes.includes(mode)));
  const players = (s: ListedServer) => pings.get(s.ip)?.result?.playersOnline ?? s.playersOnline;
  const byKey = serverSort === 'players' ? (a: ListedServer, b: ListedServer) => players(b) - players(a)
    : serverSort === 'name' ? (a: ListedServer, b: ListedServer) => a.name.localeCompare(b.name, 'pl')
    : (a: ListedServer, b: ListedServer) => b.votes - a.votes;
  // promoted servers stay on top, like on the website
  return list.sort((a, b) => Number(b.promoted) - Number(a.promoted) || byKey(a, b));
}

function serverCard(s: ListedServer): HTMLElement {
  const ping = pings.get(s.ip);
  const live = ping?.result;
  const icon = el('img', { className: 'server-icon', alt: '', loading: 'lazy' });
  icon.src = live?.favicon ?? (s.hasIcon ? `${LIST_API}/servers/${s.id}/icon` : 'logo.png');

  const title = el('div', { className: 'server-title' }, el('b', { textContent: s.name }));
  if (s.promoted) title.append(el('span', { className: 'tag promo', textContent: 'Promowany' }));
  for (const m of s.modes.slice(0, 3)) title.append(el('span', { className: 'tag mode', textContent: m }));

  const motd = live ? live.motd : s.motdHtml.length ? s.motdHtml.map(motdFromHtml) : s.motdClean.map((t) => [{ text: t }]);

  const stats = el('div', { className: 'server-stats' });
  if (live) {
    stats.append(
      el('span', {}, el('b', { textContent: `${live.playersOnline}` }), ` / ${live.playersMax}`),
      el('span', { className: pingClass(live.latency), textContent: `${live.latency} ms` }),
    );
  } else if (ping?.error) {
    stats.append(el('span', { className: 'offline', textContent: 'Offline' }));
  } else {
    stats.append(el('span', {}, el('b', { textContent: `${s.playersOnline}` }), ` / ${s.playersMax}`), el('span', { className: 'sk ping-sk', title: 'Sprawdzanie…' }));
  }
  stats.append(el('span', { title: 'Głosy' }, el('i', { className: 'fa-solid fa-thumbs-up' }), ` ${s.votes}`));

  const play = el('button', { className: 'primary' }, el('i', { className: 'fa-solid fa-play' }), 'Graj');
  play.addEventListener('click', () => openJoin(s));
  const copy = el('button', { className: 'icon-btn', title: 'Kopiuj IP' }, el('i', { className: 'fa-regular fa-copy' }));
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(s.ip);
    toast(t('Skopiowano {0}', s.ip));
  });
  const actions = el('div', { className: 'server-actions' }, play, copy);
  for (const [url, icon, label] of [[s.website, 'fa-solid fa-globe', 'Strona'], [s.discord, 'fa-brands fa-discord', 'Discord']] as const) {
    if (!url?.startsWith('https://')) continue;
    // a plain button (not <a><button>) so it lines up with the others; the main process opens it in the browser
    const link = el('button', { className: 'icon-btn', title: label }, el('i', { className: icon }));
    link.addEventListener('click', () => window.open(url, '_blank'));
    actions.append(link);
  }

  const card = el('div', { className: `server${s.promoted ? ' promoted' : ''}` },
    icon,
    el('div', { className: 'server-main' }, title, el('span', { className: 'server-ip', textContent: s.ip }), renderMotd(motd)),
    el('div', { className: 'server-side' }, stats, actions));
  card.dataset.ip = s.ip;
  return card;
}

// ---------- joining a server: pick a profile that fits ----------

let joinServer: ListedServer | undefined;
let joinProfile: string | undefined;

/** "latest-release" and friends as the real version id, so they can be compared with a server's versions. */
function resolvedVersion(id: string): string {
  if (id === 'latest-release') return versions.find((v) => v.type === 'release')?.id ?? id;
  if (id === 'latest-snapshot') return versions[0]?.id ?? id;
  return id;
}

/** The server's versions, newest first as in Mojang's list (unknown ones at the end). */
function serverVersions(s: ListedServer): string[] {
  const order = new Map(versions.map((v, i) => [v.id, i]));
  return [...s.versions].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
}

function fitsServer(p: Profile, s: ListedServer): boolean {
  return s.versions.includes(resolvedVersion(p.versionId));
}

function openJoin(s: ListedServer) {
  if (store.running || launching) return toast('Gra już działa.', true);
  joinServer = s;
  const remembered = store.settings.serverProfiles?.[s.ip];
  joinProfile = store.profiles.find((p) => p.id === remembered)?.id
    ?? store.profiles.find((p) => fitsServer(p, s))?.id
    ?? store.settings.selectedProfileId ?? store.profiles[0]?.id;
  const live = pings.get(s.ip)?.result;
  $<HTMLImageElement>('#join-icon').src = live?.favicon ?? (s.hasIcon ? `${LIST_API}/servers/${s.id}/icon` : 'logo.png');
  $('#join-name').textContent = s.name;
  const list = serverVersions(s);
  const range = list.length > 1 ? `${list[list.length - 1]} – ${list[0]}` : list[0];
  $('#join-meta').textContent = [s.ip, range && t('Wersje: {0}', range)].filter(Boolean).join(' · ');
  renderJoin();
  $('#join-modal').classList.remove('hidden');
}

function renderJoin() {
  const s = joinServer;
  if (!s) return;
  const known = s.versions.length > 0;
  $('#join-list').replaceChildren(...store.profiles.map((p) => {
    const fit = fitsServer(p, s);
    const b = el('button', { type: 'button', className: `join-choice${p.id === joinProfile ? ' selected' : ''}` },
      profileIconImg(p),
      el('div', { className: 'grow' }, p.name, el('small', { textContent: profileLabel(p) })),
      known ? el('span', { className: fit ? 'fit' : 'unfit', textContent: t(fit ? '✓ Pasuje' : 'Inna wersja') }) : '');
    b.addEventListener('click', () => {
      joinProfile = p.id;
      renderJoin();
    });
    b.addEventListener('dblclick', () => joinGo());
    return b;
  }));
  const anyFit = store.profiles.some((p) => fitsServer(p, s));
  const newest = serverVersions(s).find((v) => versions.some((x) => x.id === v));
  $('#join-hint').textContent = !known
    ? t('Serwer nie podaje wersji. Wybierz profil, którym chcesz się połączyć.')
    : anyFit
      ? t('Wybierz profil. Te z dopiskiem „Pasuje” mają wersję obsługiwaną przez serwer.')
      : t('Żaden profil nie ma wersji obsługiwanej przez serwer. Utwórz nowy albo spróbuj innej wersji.');
  $('#join-create').classList.toggle('hidden', !known || anyFit || !newest);
  if (newest) $('#join-create-label').textContent = t('Nowy profil {0}', newest);
}

async function joinGo() {
  const s = joinServer;
  const profileId = joinProfile;
  if (!s || !profileId) return;
  closeJoin();
  store.settings.selectedProfileId = profileId;
  store.settings.serverProfiles = { ...store.settings.serverProfiles, [s.ip]: profileId };
  await guard(() => api.saveSettings({ selectedProfileId: profileId, serverProfiles: store.settings.serverProfiles }));
  renderPlay();
  startGame(s.ip);
}

function closeJoin() {
  $('#join-modal').classList.add('hidden');
  joinServer = undefined;
}

$('#join-go').addEventListener('click', () => joinGo());
$('#join-close').addEventListener('click', closeJoin);
$('#join-modal').addEventListener('click', (e) => e.target === e.currentTarget && closeJoin());
$('#join-create').addEventListener('click', () => {
  const s = joinServer;
  const version = s && serverVersions(s).find((v) => versions.some((x) => x.id === v));
  if (!s || !version) return;
  busy($<HTMLButtonElement>('#join-create'), async () => {
    const profile = { ...(await api.newProfile()), name: s.name, versionId: version };
    const id: string | undefined = await guard(() => api.saveProfile(profile));
    if (!id) return;
    joinProfile = id;
    // the store update with the new profile arrives right after the save
    setTimeout(renderJoin, 100);
  });
});

function renderServers() {
  const list = filteredServers();
  const page = list.slice(0, shown);
  $('#server-list').replaceChildren(...appear(page.map(serverCard)));
  if (!servers.length) $('#server-list').replaceChildren(...skeletons('server', 5));
  else if (!list.length) $('#server-list').append(el('p', { className: 'muted appear', textContent: 'Brak serwerów pasujących do filtrów.' }));
  $('#servers-more').classList.toggle('hidden', list.length <= shown);
  pingVisible(page);
}

/** Pings the shown servers (6 at a time) and refreshes each card as answers arrive. */
let pingQueue: ListedServer[] = [];
let pinging = 0;
function pingVisible(page: ListedServer[]) {
  const fresh = (s: ListedServer) => {
    const p = pings.get(s.ip);
    return p && Date.now() - p.at < 60_000;
  };
  pingQueue = page.filter((s) => !fresh(s));
  const next = async () => {
    const s = pingQueue.shift();
    if (!s) return;
    pinging++;
    pings.set(s.ip, { at: Date.now() });
    try {
      pings.set(s.ip, { at: Date.now(), result: await api.pingServer(s.ip) });
    } catch (err) {
      pings.set(s.ip, { at: Date.now(), error: errorText(err) });
    }
    pinging--;
    const old = document.querySelector<HTMLElement>(`.server[data-ip="${CSS.escape(s.ip)}"]`);
    old?.replaceWith(serverCard(s));
    next();
  };
  for (let i = pinging; i < 6; i++) next();
}

async function loadServers(force = false) {
  const btn = $<HTMLButtonElement>('#servers-refresh');
  btn.disabled = true;
  btn.querySelector('i')?.classList.add('spin-icon');
  if (!servers.length || force) $('#server-list').replaceChildren(...skeletons('server', 5));
  try {
    servers = await api.listServers(force);
    if (force) pings.clear();
    const modes = [...new Set(servers.flatMap((s) => s.modes))].sort((a, b) => a.localeCompare(b, 'pl'));
    const sel = $<HTMLSelectElement>('#servers-mode');
    const current = sel.value;
    fillSelect(sel, [{ value: '', label: t('Wszystkie tryby') }, ...modes.map((m) => ({ value: m, label: m }))], current);
    renderServers();
  } catch (err) {
    toast(t('Nie udało się pobrać listy serwerów: {0}', errorText(err)), true);
  } finally {
    btn.disabled = false;
    btn.querySelector('i')?.classList.remove('spin-icon');
  }
}

$('#servers-search').addEventListener('input', () => {
  shown = PAGE;
  renderServers();
});
$('#servers-mode').addEventListener('change', () => {
  shown = PAGE;
  renderServers();
});
document.querySelectorAll<HTMLButtonElement>('#servers-sort button').forEach((b) =>
  b.addEventListener('click', () => {
    serverSort = b.dataset.sort!;
    document.querySelectorAll('#servers-sort button').forEach((x) => x.classList.toggle('active', x === b));
    renderServers();
  }));
$('#servers-more').addEventListener('click', () => {
  shown += PAGE;
  renderServers();
});
$('#servers-refresh').addEventListener('click', () => loadServers(true));
// Load the list the first time the tab is opened.
document.querySelector('.nav[data-view="servers"]')?.addEventListener('click', () => {
  if (!servers.length) loadServers();
}, { once: true });

// ---------- mods, resource packs, shaders, modpacks (Modrinth) ----------

interface ProjectHit { id: string; slug: string; title: string; description: string; author: string; iconUrl?: string; downloads: number; categories: string[] }
interface InstalledItem { type: string; filename: string; enabled: boolean; title: string; projectId?: string; versionId?: string; versionNumber?: string; iconUrl?: string }
interface ProjectVersion { id: string; projectId: string; name: string; versionNumber: string; type: 'release' | 'beta' | 'alpha'; date: string; gameVersions: string[]; loaders: string[]; downloads: number }
interface UpdateInfo { type: string; filename: string; projectId: string; title: string; currentVersion: string; latestVersionId: string; latestVersion: string }

// ---------- version picker ----------

let resolvePicker: ((v: ProjectVersion | undefined) => void) | undefined;
let pickerArgs: { projectId: string; type: string; currentVersionId?: string; profileId: string } | undefined;

const TYPE_NAMES: Record<string, string> = { release: 'Wydanie', beta: 'Beta', alpha: 'Alfa' };

/** Short list of game versions, e.g. "26.3, 26.2 +4". */
function shortVersions(list: string[]): string {
  return list.length > 3 ? `${list.slice(-3).reverse().join(', ')} +${list.length - 3}` : [...list].reverse().join(', ');
}

async function renderVersionList() {
  if (!pickerArgs) return;
  const box = $('#versions-list');
  box.replaceChildren(...skeletons('project', 4));
  const onlyCompatible = $<HTMLInputElement>('#versions-compat').checked;
  const versions: ProjectVersion[] = (await guard(() => api.contentVersions(pickerArgs!.profileId, pickerArgs!.projectId, pickerArgs!.type, onlyCompatible))) ?? [];
  box.replaceChildren(...appear(versions.slice(0, 60).map((v) => {
    const current = v.id === pickerArgs?.currentVersionId;
    const choose = el('button', { type: 'button', className: current ? '' : 'primary', disabled: current, textContent: current ? t('Zainstalowana') : t('Wybierz') });
    choose.addEventListener('click', () => closePicker(v));
    return el('div', { className: `version-row${current ? ' current' : ''}` },
      el('div', {},
        el('b', {}, v.versionNumber, el('span', { className: `tag ${v.type}`, textContent: t(TYPE_NAMES[v.type] ?? v.type) })),
        el('div', { className: 'version-meta' },
          el('span', { textContent: v.name !== v.versionNumber ? v.name : '' }),
          el('span', { textContent: `MC ${shortVersions(v.gameVersions)}` }),
          el('span', { textContent: v.loaders.filter((l) => l !== 'minecraft').join(', ') }),
          el('span', { textContent: new Date(v.date).toLocaleDateString(locale(), { dateStyle: 'medium' }) }),
          el('span', {}, el('i', { className: 'fa-solid fa-download' }), ` ${fmtCount(v.downloads)}`))),
      choose);
  })));
  if (!versions.length) box.replaceChildren(el('p', { className: 'muted', textContent: onlyCompatible ? t('Brak wersji zgodnych z tym profilem. Odznacz filtr, żeby zobaczyć wszystkie.') : t('Brak wersji.') }));
}

/** Opens the version list for a project and resolves with the chosen version (or nothing). */
function chooseVersion(args: { title: string; projectId: string; type: string; currentVersionId?: string; profileId: string }): Promise<ProjectVersion | undefined> {
  closePicker(undefined);
  pickerArgs = args;
  $('#versions-title').textContent = t('Wersje: {0}', args.title);
  $('#versions-compat-wrap').classList.toggle('hidden', args.type === 'modpack');
  $<HTMLInputElement>('#versions-compat').checked = true;
  $('#versions-modal').classList.remove('hidden');
  renderVersionList();
  return new Promise((resolve) => (resolvePicker = resolve));
}

function closePicker(v: ProjectVersion | undefined) {
  $('#versions-modal').classList.add('hidden');
  resolvePicker?.(v);
  resolvePicker = undefined;
}

$('#versions-close').addEventListener('click', () => closePicker(undefined));
$('#versions-modal').addEventListener('click', (e) => e.target === e.currentTarget && closePicker(undefined));
$('#versions-compat').addEventListener('change', renderVersionList);
document.addEventListener('keydown', (e) => e.key === 'Escape' && resolvePicker && closePicker(undefined));

// ---------- updates of installed content ----------

let updates: UpdateInfo[] = [];
let updatesFor = '';
let updatesAt = 0;
let checkingUpdates = false;

/** Asks Modrinth about newer versions of everything in the profile (cached for 10 minutes). */
async function checkContentUpdates(force = false) {
  const profileId = contentProfileId();
  if (!profileId || checkingUpdates || (!force && updatesFor === profileId && Date.now() - updatesAt < 10 * 60_000)) return;
  checkingUpdates = true;
  renderContent();
  try {
    updates = await api.checkUpdates(profileId);
    updatesFor = profileId;
    updatesAt = Date.now();
    await refreshInstalled(); // recognised files now have names and icons
  } catch (err) {
    toast(errorText(err), true);
  } finally {
    checkingUpdates = false;
    renderContent();
  }
}

async function applyUpdates(items: { type: string; projectId: string; latestVersionId: string; title: string }[]) {
  if (!items.length) return;
  try {
    await api.updateContent(contentProfileId(), items);
  } catch {
    // reported in the task panel
  }
  updates = updates.filter((u) => !items.some((i) => i.projectId === u.projectId));
  await refreshInstalled(true);
}

function renderUpdatesBar(forType: InstalledItem[]) {
  const bar = $('#updates-bar');
  bar.classList.toggle('hidden', !forType.length);
  const pending = updates.filter((u) => u.type === contentType && updatesFor === contentProfileId());
  const text = $('#updates-text');
  if (checkingUpdates) text.replaceChildren(el('span', { className: 'spinner' }), t('Sprawdzanie aktualizacji…'));
  else if (updatesFor !== contentProfileId()) text.replaceChildren(t('Nie sprawdzono jeszcze aktualizacji.'));
  else if (pending.length) text.replaceChildren(el('b', { textContent: t('Dostępne aktualizacje: {0}', pending.length) }));
  else text.replaceChildren(el('i', { className: 'fa-solid fa-circle-check' }), t('Wszystko jest aktualne.'));
  $<HTMLButtonElement>('#updates-check').disabled = checkingUpdates;
  $('#updates-all').classList.toggle('hidden', !pending.length || checkingUpdates);
}

$('#updates-check').addEventListener('click', () => checkContentUpdates(true));
$('#updates-all').addEventListener('click', () => applyUpdates(updates.filter((u) => u.type === contentType)));

let contentType = 'mod';
let contentTab = 'browse';
let contentHits: ProjectHit[] = [];
let contentTotal = 0;
let contentLoading = false;
/** Index from which result cards animate in on the next render (new results only, no flicker on re-renders). */
let animateFrom: number | undefined;
let installed: InstalledItem[] = [];
const installing = new Set<string>();

const contentProfileId = () => $<HTMLSelectElement>('#content-profile').value;
const fmtCount = (n: number) => (n >= 1e6 ? t('{0} mln', (n / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1 })) : n >= 1e3 ? t('{0} tys.', Math.round(n / 1e3)) : String(n));

// ---------- mod checks: missing dependencies, wrong loader or game version, conflicts ----------

interface ModProblem { severity: 'error' | 'warning'; kind: string; file: string; mod: string; message: string; missingId?: string }
let modProblems: ModProblem[] = [];
let modProblemsFor: string | undefined;

async function runModCheck() {
  const profileId = contentProfileId();
  if (!profileId) return;
  modProblems = (await guard(() => api.checkMods(profileId))) ?? [];
  modProblemsFor = profileId;
  renderModCheck();
}

function renderModCheck() {
  const box = $('#mod-check');
  const show = contentType === 'mod' && contentTab === 'installed' && modProblemsFor === contentProfileId()
    && installed.some((i) => i.type === 'mod');
  box.classList.toggle('hidden', !show);
  if (!show) return;
  const errors = modProblems.filter((p) => p.severity === 'error').length;
  box.classList.toggle('ok', !modProblems.length);
  box.classList.toggle('bad', errors > 0);
  box.classList.toggle('warn', !errors && modProblems.length > 0);
  $('#mod-check-text').replaceChildren(...(!modProblems.length
    ? [el('i', { className: 'fa-solid fa-shield-halved' }), t('Nie wykryto problemów z modami.')]
    : [el('b', { textContent: errors ? t('Problemy z modami: {0}', modProblems.length) : t('Ostrzeżenia: {0}', modProblems.length) })]));
  $('#mod-problems').replaceChildren(...modProblems.map((p) => el('li', { className: p.severity },
    el('i', { className: p.severity === 'error' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-triangle-exclamation' }), p.message)));
  $('#mod-fix').classList.toggle('hidden', !modProblems.some((p) => p.kind === 'missing'));
}

$('#mod-fix').addEventListener('click', () => {
  const profileId = contentProfileId();
  const ids = [...new Set(modProblems.filter((p) => p.kind === 'missing').map((p) => p.missingId!))];
  busy($<HTMLButtonElement>('#mod-fix'), async () => {
    const res: { installed: string[]; notFound: string[] } | undefined = await guard(() => api.fixMissingMods(profileId, ids));
    if (res?.notFound.length) toast(t('Nie znaleziono na Modrinth: {0}. Poszukaj ich ręcznie.', res.notFound.join(', ')), true);
    await refreshInstalled(true);
  });
});

/** Before starting: real errors get a chance to stop the launch, warnings don't. */
async function confirmModsOk(profileId: string): Promise<boolean> {
  const problems: ModProblem[] = (await api.checkMods(profileId).catch(() => [])) ?? [];
  const errors = problems.filter((p) => p.severity === 'error');
  if (!errors.length) return true;
  const lines = errors.slice(0, 6).map((p) => `• ${p.message}`).join('\n') + (errors.length > 6 ? `\n• ${t('…i {0} więcej', errors.length - 6)}` : '');
  return confirm(t('Gra prawdopodobnie się nie uruchomi:\n\n{0}\n\nSzczegóły i naprawa: Mody → Zainstalowane. Uruchomić mimo to?', lines));
}

// ---------- statistics ----------

interface StatsSummary {
  totalMs: number; sessions: number; avgMs: number; longestMs: number; streak: number; allTimeMs: number;
  byDay: { date: string; ms: number }[];
  byProfile: { profileId: string; name: string; ms: number; sessions: number }[];
  byServer: { address: string; ms: number; joins: number }[];
  byHour: number[];
  names: Record<string, string>;
}
let statsDays = 30;

/** Short durations for the charts: "3 h 20 min", "45 min". */
const fmtShort = (ms: number) => (ms < 60_000 ? '0 min' : fmtPlaytime(ms));

async function renderStats() {
  const s: StatsSummary | undefined = await guard(() => api.getStats(statsDays));
  if (!s) return;
  const card = (label: string, value: string, note = '', i = 0) => {
    const c = el('div', { className: 'stat-card glass-panel' }, el('small', { textContent: label }), el('b', { textContent: value }), el('span', { textContent: note }));
    c.style.animationDelay = `${i * 40}ms`;
    return c;
  };
  const rangeName = statsDays ? t('ostatnie {0} dni', statsDays) : t('od początku');
  $('#stat-cards').replaceChildren(
    card(t('Łącznie'), fmtShort(s.allTimeMs), t('we wszystkich profilach'), 0),
    card(t('W tym okresie'), fmtShort(s.totalMs), rangeName, 1),
    card(t('Sesje'), String(s.sessions), s.sessions ? t('średnio {0}, najdłuższa {1}', fmtShort(s.avgMs), fmtShort(s.longestMs)) : '', 2),
    card(t('Seria'), t(s.streak === 1 ? '{0} dzień' : '{0} dni', s.streak), t('dni z rzędu z graniem'), 3),
  );

  // days: one bar per day; for "all time" over many months, group into weeks so bars stay readable
  let buckets = s.byDay.map((d) => ({ label: d.date, ms: d.ms }));
  if (buckets.length > 120) {
    const weeks: { label: string; ms: number }[] = [];
    for (let i = 0; i < buckets.length; i += 7) weeks.push({ label: buckets[i].label, ms: buckets.slice(i, i + 7).reduce((a, b) => a + b.ms, 0) });
    buckets = weeks;
  }
  const max = Math.max(...buckets.map((b) => b.ms), 1);
  const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  $('#day-chart').replaceChildren(...buckets.map((b, i) => {
    const bar = el('div', { className: b.ms ? '' : 'zero', title: `${fmtDate(b.label)}: ${fmtShort(b.ms)}` });
    bar.style.height = `${Math.max(3, (b.ms / max) * 100)}%`;
    bar.style.animationDelay = `${Math.min(i * 12, 600)}ms`;
    return bar;
  }));
  $('#day-axis').replaceChildren(...(buckets.length ? [el('span', { textContent: fmtDate(buckets[0].label) }), el('span', { textContent: fmtDate(buckets[buckets.length - 1].label) })] : []));

  const rank = (rows: { name: string; ms: number; note: string }[], empty: string) => {
    const top = Math.max(...rows.map((r) => r.ms), 1);
    return rows.length ? rows.slice(0, 8).map((r, i) => {
      const fill = el('i');
      fill.style.width = `${(r.ms / top) * 100}%`;
      const row = el('div', { className: 'rank-row' },
        el('div', { className: 'rank-top' }, el('span', { textContent: r.name }), el('span', { textContent: r.note })),
        el('div', { className: 'rank-bar' }, fill));
      row.style.animationDelay = `${i * 40}ms`;
      return row;
    }) : [el('p', { className: 'muted', textContent: empty })];
  };
  $('#stats-profiles').replaceChildren(...rank(s.byProfile.map((p) => ({
    name: s.names[p.profileId] ?? p.name, ms: p.ms, note: `${fmtShort(p.ms)} · ${t('sesje: {0}', p.sessions)}`,
  })), t('Brak sesji w tym okresie.')));
  $('#stats-servers').replaceChildren(...rank(s.byServer.map((v) => ({
    name: v.address, ms: v.ms, note: `${fmtShort(v.ms)} · ${t('wejścia: {0}', v.joins)}`,
  })), t('Brak gry na serwerach w tym okresie.')));

  const hourMax = Math.max(...s.byHour, 1);
  $('#hour-chart').replaceChildren(...s.byHour.map((ms, h) => {
    const cell = el('div', { title: `${h}:00–${h + 1}:00 · ${fmtShort(ms)}` });
    cell.style.setProperty('--a', String(ms ? 0.15 + (ms / hourMax) * 0.85 : 0.03));
    return cell;
  }));
}

document.querySelectorAll<HTMLButtonElement>('#stats-range button').forEach((b) =>
  b.addEventListener('click', () => {
    statsDays = Number(b.dataset.days);
    document.querySelectorAll('#stats-range button').forEach((x) => x.classList.toggle('active', x === b));
    renderStats();
  }));
document.querySelector('.nav[data-view="stats"]')?.addEventListener('click', () => renderStats());

// ---------- importing from other launchers ----------

interface FoundInstance { key: string; source: string; sourceName: string; name: string; versionId: string; loader: Profile['loader']; loaderVersion: string; mods: number; sharedDir: boolean; gameDir: string }
let foundInstances: FoundInstance[] = [];
const importChosen = new Set<string>();

$('#import-open').addEventListener('click', async () => {
  $('#import-list').replaceChildren(...skeletons('project', 3));
  $('#import-modal').classList.remove('hidden');
  foundInstances = (await guard(() => api.findInstances())) ?? [];
  importChosen.clear();
  renderImport();
});

function renderImport() {
  const list = $('#import-list');
  if (!foundInstances.length) {
    list.replaceChildren(el('p', { className: 'muted', textContent: t('Nie znaleziono instancji w znanych miejscach. Wskaż folder ręcznie.') }));
  } else {
    list.replaceChildren(...foundInstances.map((i): HTMLElement => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = importChosen.has(i.key);
      box.addEventListener('change', () => {
        if (box.checked) importChosen.add(i.key);
        else importChosen.delete(i.key);
        renderImport();
      });
      const row = document.createElement('label');
      row.className = `join-choice perf-choice${importChosen.has(i.key) ? ' selected' : ''}`;
      row.title = i.gameDir;
      const loader = LOADER_NAMES[i.loader];
      const details = [versionLabel(i.versionId), loader ? `${loader}${i.loaderVersion ? ` ${i.loaderVersion}` : ''}` : '', i.mods ? t('modów: {0}', i.mods) : '']
        .filter(Boolean).join(' · ');
      row.append(box, el('div', { className: 'grow' }, i.name, el('small', { textContent: details })), el('span', { className: 'import-src', textContent: i.sourceName }));
      return row;
    }));
  }
  $<HTMLButtonElement>('#import-go').disabled = !importChosen.size;
}

$('#import-folder').addEventListener('click', async () => {
  const more: FoundInstance[] | undefined = await guard(() => api.instancesFromFolder());
  if (!more) return;
  if (!more.length) return toast(t('W tym folderze nie ma instancji Prism, MultiMC, CurseForge, Modrinth App ani oficjalnego launchera.'), true);
  for (const i of more) {
    if (!foundInstances.some((x) => x.key === i.key)) foundInstances.push(i);
    importChosen.add(i.key);
  }
  renderImport();
});
$('#import-go').addEventListener('click', async () => {
  const keys = [...importChosen];
  $('#import-modal').classList.add('hidden');
  const created: string[] | undefined = await guard(() => api.importInstances(keys));
  if (created?.length) editingId = created[created.length - 1];
});
$('#import-close').addEventListener('click', () => $('#import-modal').classList.add('hidden'));
$('#import-modal').addEventListener('click', (e) => e.target === e.currentTarget && $('#import-modal').classList.add('hidden'));

// ---------- performance mods ----------

interface PerfPlanItem { projectId?: string; title: string; why: string; iconUrl?: string; installed: boolean }
let perfPlan: PerfPlanItem[] = [];
const perfChosen = new Set<string>();

$('#perf-open').addEventListener('click', async () => {
  const profileId = contentProfileId();
  const profile = store.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  if (profile.loader === 'vanilla') return toast(t('Mody wydajności wymagają mod loadera. Ustaw Fabric w zakładce Profile.'), true);
  $('#perf-sub').textContent = t('Sprawdzone mody przyspieszające grę, dobrane do profilu {0} ({1}).', profile.name, profileLabel(profile));
  $('#perf-list').replaceChildren(...skeletons('project', 4));
  $('#perf-modal').classList.remove('hidden');
  perfPlan = (await guard(() => api.perfPlan(profileId))) ?? [];
  perfChosen.clear();
  for (const p of perfPlan) if (p.projectId && !p.installed) perfChosen.add(p.projectId);
  renderPerf();
});

function renderPerf() {
  $('#perf-list').replaceChildren(...perfPlan.map((p): HTMLElement => {
    const available = !!p.projectId && !p.installed;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = available && perfChosen.has(p.projectId!);
    box.disabled = !available;
    box.addEventListener('change', () => {
      if (box.checked) perfChosen.add(p.projectId!);
      else perfChosen.delete(p.projectId!);
      renderPerf();
    });
    const status: Node | string = p.installed ? el('span', { className: 'fit', textContent: t('✓ Zainstalowany') })
      : !p.projectId ? el('span', { className: 'unfit', textContent: t('Brak dla tej wersji') }) : '';
    const row = document.createElement('label');
    row.className = `join-choice perf-choice${available ? '' : ' off'}`;
    row.append(box, projectIcon(p.iconUrl),
      el('div', { className: 'grow' }, p.title, el('small', { textContent: p.why })), status);
    return row;
  }));
  const go = $<HTMLButtonElement>('#perf-go');
  go.disabled = !perfChosen.size;
  if (!perfPlan.some((p) => p.projectId && !p.installed)) $('#perf-sub').textContent = t('Wszystkie dostępne mody wydajności są już zainstalowane.');
}

$('#perf-go').addEventListener('click', async () => {
  const profileId = contentProfileId();
  const items = perfPlan.filter((p) => p.projectId && perfChosen.has(p.projectId)).map((p) => ({ projectId: p.projectId!, title: p.title }));
  $('#perf-modal').classList.add('hidden');
  await guard(() => api.installPerf(profileId, items));
  await refreshInstalled(true);
});
$('#perf-close').addEventListener('click', () => $('#perf-modal').classList.add('hidden'));
$('#perf-modal').addEventListener('click', (e) => e.target === e.currentTarget && $('#perf-modal').classList.add('hidden'));

function contentNotice() {
  const profile = store.profiles.find((p) => p.id === contentProfileId());
  const box = $('#content-notice');
  let text = '';
  if (contentType === 'mod' && profile?.loader === 'vanilla') text = 'Ten profil nie ma mod loadera. Ustaw Fabric, NeoForge lub Forge w zakładce Profile, żeby instalować mody.';
  else if (contentType === 'shader') text = profile?.loader === 'fabric' || profile?.loader === 'quilt'
    ? 'Shadery wymagają moda Iris. Zainstaluj go w zakładce Mody.'
    : 'Shadery wymagają moda Iris (Fabric) albo Oculus (Forge/NeoForge).';
  else if (contentType === 'modpack') text = 'Modpack tworzy nowy profil z własnym folderem gry.';
  box.textContent = text;
  box.classList.toggle('hidden', !text);
}

function projectIcon(url?: string) {
  const img = el('img', { alt: '', loading: 'lazy' });
  img.src = url?.startsWith('https://cdn.modrinth.com/') ? url : 'logo.png';
  return img;
}

function hitCard(hit: ProjectHit): HTMLElement {
  const isInstalled = installed.some((i) => i.projectId === hit.id);
  const btn = el('button', { className: isInstalled ? '' : 'primary', disabled: installing.has(hit.id) },
    installing.has(hit.id) ? el('span', { className: 'spinner' }) : el('i', { className: isInstalled ? 'fa-solid fa-check' : 'fa-solid fa-download' }),
    installing.has(hit.id) ? 'Instaluję…' : isInstalled ? 'Zainstalowany' : contentType === 'modpack' ? 'Utwórz profil' : 'Instaluj');
  btn.addEventListener('click', () => installHit(hit));
  const pick = el('button', { type: 'button', className: 'icon-btn', title: t('Wybierz wersję') }, el('i', { className: 'fa-solid fa-code-branch' }));
  pick.addEventListener('click', async () => {
    const v = await chooseVersion({ title: hit.title, projectId: hit.id, type: contentType, profileId: contentProfileId() });
    if (v) installHit(hit, v.id);
  });
  return el('div', { className: 'project' },
    projectIcon(hit.iconUrl),
    el('div', { className: 'project-main' },
      el('b', {}, hit.title, el('small', { textContent: t('od {0}', hit.author) })),
      el('p', { textContent: hit.description, title: hit.description }),
      el('div', { className: 'project-meta' },
        el('span', {}, el('i', { className: 'fa-solid fa-download' }), ` ${fmtCount(hit.downloads)}`),
        el('span', { textContent: hit.categories.slice(0, 4).join(' · ') }))),
    el('div', { className: 'project-actions' }, btn, pick));
}

function installedCard(item: InstalledItem): HTMLElement {
  // built by hand: el('input', …) makes the TypeScript checker give up on the props union
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = item.enabled;
  const switchLabel = document.createElement('label');
  switchLabel.className = 'switch';
  switchLabel.title = item.enabled ? 'Wyłącz' : 'Włącz';
  switchLabel.append(toggle, document.createElement('span'));
  toggle.addEventListener('change', () => guard(async () => {
    await api.toggleContent(contentProfileId(), item.type, item.filename, toggle.checked);
    await refreshInstalled();
  }));
  const remove = el('button', { className: 'icon-btn danger', title: 'Usuń' }, el('i', { className: 'fa-regular fa-trash-can' }));
  remove.addEventListener('click', () => {
    if (!confirm(t('Usunąć {0}?', item.title))) return;
    guard(async () => {
      await api.removeContent(contentProfileId(), item.type, item.filename);
      await refreshInstalled();
    });
  });
  const update = updates.find((u) => u.type === item.type && u.filename === item.filename);
  const actions: HTMLElement[] = [];
  if (update) {
    const btn = el('button', { type: 'button', className: 'primary' }, el('i', { className: 'fa-solid fa-circle-arrow-up' }), t('Aktualizuj'));
    btn.addEventListener('click', () => busy(btn, () => applyUpdates([update])));
    actions.push(btn);
  }
  if (item.projectId) {
    const versions = el('button', { type: 'button', className: 'icon-btn', title: t('Zmień wersję') }, el('i', { className: 'fa-solid fa-code-branch' }));
    versions.addEventListener('click', async () => {
      const v = await chooseVersion({ title: item.title, projectId: item.projectId!, type: item.type, currentVersionId: item.versionId, profileId: contentProfileId() });
      if (v) applyUpdates([{ type: item.type, projectId: item.projectId!, latestVersionId: v.id, title: item.title }]);
    });
    actions.push(versions);
  }
  return el('div', { className: `project${item.enabled ? '' : ' disabled'}` },
    projectIcon(item.iconUrl),
    el('div', { className: 'project-main' },
      el('b', {}, item.title, el('small', { textContent: item.versionNumber ?? '' }),
        ...(update ? [el('span', { className: 'tag update', textContent: t('Nowa wersja: {0}', update.latestVersion) })] : [])),
      el('p', { textContent: item.filename })),
    el('div', { className: 'project-actions' }, ...actions, switchLabel, remove));
}

function renderContent() {
  contentNotice();
  const isPack = contentType === 'modpack';
  $('#modpack-import').classList.toggle('hidden', !isPack);
  $('#perf-open').classList.toggle('hidden', contentType !== 'mod');
  renderModCheck();
  $('#content-tab').classList.toggle('hidden', isPack);
  $('#content-search-bar').classList.toggle('hidden', contentTab === 'installed' && !isPack);
  const forType = installed.filter((i) => i.type === contentType);
  $('#installed-count').textContent = forType.length ? `(${forType.length})` : '';
  const list = $('#content-list');
  const from = animateFrom;
  animateFrom = undefined;
  renderUpdatesBar(contentTab === 'installed' && !isPack ? forType : []);
  if (contentTab === 'installed' && !isPack) {
    const cards = forType.map(installedCard);
    list.replaceChildren(...(from !== undefined ? appear(cards) : cards));
    if (!forType.length) list.append(el('p', { className: 'muted appear', textContent: 'Nic tu jeszcze nie ma.' }));
    $('#content-more').classList.add('hidden');
    return;
  }
  const cards = contentHits.map(hitCard);
  if (from !== undefined) appear(cards.slice(from));
  list.replaceChildren(...cards);
  if (contentLoading) list.append(...skeletons('project', contentHits.length ? 3 : 6));
  else if (!contentHits.length) list.append(el('p', { className: 'muted appear', textContent: 'Brak wyników.' }));
  $('#content-more').classList.toggle('hidden', contentLoading || contentHits.length >= contentTotal);
}

async function refreshInstalled(animate = false) {
  if (!contentProfileId()) return;
  installed = (await guard(() => api.listContent(contentProfileId()))) ?? [];
  if (animate) animateFrom = 0;
  renderContent();
  if (contentType === 'mod' && contentTab === 'installed') runModCheck();
}

let searchRequest = 0;
async function searchContent(append = false) {
  const request = ++searchRequest;
  contentLoading = true;
  if (!append) contentHits = [];
  renderContent();
  const res = await guard(() => api.searchContent(contentProfileId(), $<HTMLInputElement>('#content-search').value.trim(), contentType, append ? contentHits.length : 0));
  if (request !== searchRequest) return;
  contentLoading = false;
  if (!res) return renderContent();
  animateFrom = append ? contentHits.length : 0;
  contentHits = append ? [...contentHits, ...res.hits] : res.hits;
  contentTotal = res.total;
  renderContent();
}

async function installHit(hit: ProjectHit, versionId?: string) {
  installing.add(hit.id);
  renderContent();
  try {
    // progress and the result are shown in the task panel (see the task section)
    if (contentType === 'modpack') await api.installModpack(hit.id, hit.title, hit.iconUrl, versionId);
    else {
      await api.installContent(contentProfileId(), hit.id, contentType, hit.title, hit.iconUrl, versionId);
      await refreshInstalled();
    }
  } catch {
    // already reported in the task panel
  } finally {
    installing.delete(hit.id);
    renderContent();
  }
}

function renderContentProfiles() {
  for (const id of ['#content-profile', '#worlds-profile']) {
    const sel = $<HTMLSelectElement>(id);
    const current = sel.value || store.settings.selectedProfileId;
    fillSelect(sel, store.profiles.map((p) => ({ value: p.id, label: `${p.name} (${profileLabel(p)})` })), current);
  }
}

document.querySelectorAll<HTMLButtonElement>('#content-type button').forEach((b) =>
  b.addEventListener('click', () => {
    contentType = b.dataset.type!;
    document.querySelectorAll('#content-type button').forEach((x) => x.classList.toggle('active', x === b));
    contentHits = [];
    renderContent();
    searchContent();
  }));
document.querySelectorAll<HTMLButtonElement>('#content-tab button').forEach((b) =>
  b.addEventListener('click', () => {
    contentTab = b.dataset.tab!;
    document.querySelectorAll('#content-tab button').forEach((x) => x.classList.toggle('active', x === b));
    animateFrom = 0;
    renderContent();
    if (contentTab === 'installed') {
      checkContentUpdates();
      runModCheck();
    }
  }));
let searchTimer: number | undefined;
$('#content-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => searchContent(), 300);
});
$('#content-more').addEventListener('click', () => searchContent(true));
$('#content-profile').addEventListener('change', () => {
  refreshInstalled(true);
  searchContent();
});
$('#modpack-import').addEventListener('click', () => busy($<HTMLButtonElement>('#modpack-import'), () => api.importModpack().catch(() => undefined), 'Importuję…'));
document.querySelector('.nav[data-view="content"]')?.addEventListener('click', () => {
  renderContentProfiles();
  refreshInstalled(true);
  if (!contentHits.length) searchContent();
});

// ---------- worlds, backups, screenshots ----------

interface WorldInfo { folder: string; name: string; gameMode: string; hardcore: boolean; version?: string; lastPlayed: number; sizeBytes: number; icon?: string }
interface Backup { file: string; world: string; createdAt: number; sizeBytes: number }
interface Screenshot { file: string; name: string; createdAt: number; sizeBytes: number }

let worldsTab = 'worlds';
const worldsProfileId = () => $<HTMLSelectElement>('#worlds-profile').value;
const media = (file: string) => `slash-media://local/?path=${encodeURIComponent(file)}`;
const fmtDate = (ms: number) => new Date(ms).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
const fmtSize = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

function iconButton(icon: string, title: string, onClick: () => void, extra = '') {
  const b = el('button', { className: `icon-btn ${extra}`.trim(), title }, el('i', { className: icon }));
  b.addEventListener('click', onClick);
  return b;
}

async function renderWorlds() {
  const box = $('#worlds-content');
  const profileId = worldsProfileId();
  if (!profileId) return;
  box.replaceChildren(worldsTab === 'screenshots' ? el('div', { className: 'shots' }, ...skeletons('shot', 6)) : el('div', { className: 'project-list' }, ...skeletons('project', 3)));

  if (worldsTab === 'worlds') {
    const worlds: WorldInfo[] = (await guard(() => api.listWorlds(profileId))) ?? [];
    box.replaceChildren(el('div', { className: 'project-list' }, ...worlds.map((w) => {
      const icon = el('img', { className: 'world-icon', alt: '' });
      icon.src = w.icon ? media(w.icon) : 'logo.png';
      const play = el('button', { className: 'primary' }, el('i', { className: 'fa-solid fa-play' }), 'Graj');
      play.addEventListener('click', () => {
        store.settings.selectedProfileId = profileId;
        renderPlay();
        startGame(undefined, w.folder);
      });
      const backup = el('button', {}, el('i', { className: 'fa-solid fa-box-archive' }), 'Kopia');
      backup.addEventListener('click', async () => {
        const b = await busy(backup, () => guard(() => api.backupWorld(profileId, w.folder)), 'Zapisuję…');
        if (b) toast(t('Zapisano kopię „{0}” ({1})', w.name, fmtSize(b.sizeBytes)));
      });
      return el('div', { className: 'project' }, icon,
        el('div', { className: 'project-main' },
          el('b', {}, w.name, el('small', { textContent: w.folder !== w.name ? w.folder : '' })),
          el('div', { className: 'project-meta' },
            el('span', { textContent: w.hardcore ? 'Hardcore' : w.gameMode }),
            el('span', { textContent: w.version ? t('Minecraft {0}', w.version) : '' }),
            el('span', { textContent: fmtSize(w.sizeBytes) }),
            el('span', { textContent: t('Grano: {0}', fmtDate(w.lastPlayed)) }))),
        el('div', { className: 'project-actions' }, play, backup));
    })));
    if (!worlds.length) box.replaceChildren(el('p', { className: 'muted', textContent: 'Ten profil nie ma jeszcze żadnych światów.' }));
  } else if (worldsTab === 'backups') {
    const backups: Backup[] = (await guard(() => api.listBackups(profileId))) ?? [];
    box.replaceChildren(el('div', { className: 'project-list' }, ...backups.map((b) => {
      const restore = el('button', {}, el('i', { className: 'fa-solid fa-clock-rotate-left' }), 'Przywróć');
      restore.addEventListener('click', async () => {
        const name = await busy(restore, () => guard(() => api.restoreBackup(profileId, fileName(b.file))), 'Przywracam…');
        if (name) toast(t('Przywrócono jako „{0}”', name));
      });
      return el('div', { className: 'project' },
        el('img', { src: 'logo.png', alt: '' }),
        el('div', { className: 'project-main' },
          el('b', { textContent: b.world }),
          el('div', { className: 'project-meta' }, el('span', { textContent: fmtDate(b.createdAt) }), el('span', { textContent: fmtSize(b.sizeBytes) }))),
        el('div', { className: 'project-actions' }, restore,
          iconButton('fa-regular fa-folder-open', 'Pokaż w folderze', () => api.revealFile(b.file)),
          iconButton('fa-regular fa-trash-can', 'Usuń', () => {
            if (confirm(t('Usunąć kopię z {0}?', fmtDate(b.createdAt)))) guard(() => api.deleteBackup(profileId, fileName(b.file))).then(renderWorlds);
          }, 'danger')));
    })));
    if (!backups.length) box.replaceChildren(el('p', { className: 'muted', textContent: 'Brak kopii. Utworzysz je przyciskiem „Kopia” przy świecie.' }));
  } else {
    const shots: Screenshot[] = (await guard(() => api.listScreenshots(profileId))) ?? [];
    box.replaceChildren(el('div', { className: 'shots' }, ...shots.map((sh) => {
      const img = el('img', { alt: sh.name, loading: 'lazy' });
      img.src = media(sh.file);
      img.addEventListener('click', () => api.openFile(sh.file));
      return el('div', { className: 'shot' }, img,
        el('div', {}, el('span', { textContent: fmtDate(sh.createdAt) }),
          iconButton('fa-regular fa-folder-open', 'Pokaż w folderze', () => api.revealFile(sh.file)),
          iconButton('fa-regular fa-trash-can', 'Usuń', () => {
            if (confirm(t('Usunąć ten zrzut ekranu?'))) guard(() => api.deleteScreenshot(profileId, sh.name)).then(renderWorlds);
          }, 'danger')));
    })));
    if (!shots.length) box.replaceChildren(el('p', { className: 'muted', textContent: 'Brak zrzutów. W grze zrobisz je klawiszem F2.' }));
  }
  const listEl = box.firstElementChild;
  if (listEl) appear(listEl.children.length ? [...listEl.children] : [listEl]);
}

document.querySelectorAll<HTMLButtonElement>('#worlds-tab button').forEach((b) =>
  b.addEventListener('click', () => {
    worldsTab = b.dataset.tab!;
    document.querySelectorAll('#worlds-tab button').forEach((x) => x.classList.toggle('active', x === b));
    renderWorlds();
  }));
$('#worlds-profile').addEventListener('change', renderWorlds);
document.querySelector('.nav[data-view="worlds"]')?.addEventListener('click', renderWorlds);

// ---------- news (Mojang patch notes) ----------

interface NewsItem { id: string; title: string; version: string; type: string; date: string; imageUrl?: string; text: string }

const NEWS_PAGE = 9;
let newsItems: NewsItem[] = [];
let newsTotal = 0;
let newsFilter = 'all';
let newsLoading = false;

function newsCard(n: NewsItem): HTMLElement {
  const img = el('img', { alt: '', loading: 'lazy' });
  if (n.imageUrl) img.src = n.imageUrl;
  // a real button: keyboard- and screen-reader-friendly
  const card = el('button', { type: 'button', className: 'news-card', title: 'Kliknij, aby przeczytać' }, img,
    el('div', {},
      el('span', { className: `tag ${n.type}`, textContent: n.type === 'snapshot' ? 'Snapshot' : 'Wydanie' }),
      el('b', { textContent: n.title }),
      el('small', { textContent: new Date(n.date).toLocaleDateString(locale(), { dateStyle: 'long' }) }),
      el('p', { textContent: n.text })));
  card.addEventListener('click', () => openArticle(n));
  return card;
}

/** Loads the first page of news (or the next one with `more`). */
async function loadNews(more = false) {
  if (newsLoading) return;
  newsLoading = true;
  const grid = $('#news');
  const offset = more ? newsItems.length : 0;
  const placeholders = skeletons('news', more ? 3 : 6);
  if (more) {
    grid.querySelector('.more')?.remove();
    grid.append(...placeholders);
  } else {
    grid.replaceChildren(...placeholders);
  }
  try {
    const page: { items: NewsItem[]; total: number } = await api.listNews(offset, NEWS_PAGE, newsFilter);
    newsItems = more ? [...newsItems, ...page.items] : page.items;
    newsTotal = page.total;
    placeholders.forEach((p) => p.remove());
    grid.append(...appear(page.items.map(newsCard)));
    if (newsItems.length < newsTotal) {
      const btn = el('button', { className: 'more', type: 'button' }, el('i', { className: 'fa-solid fa-chevron-down' }), ` ${t('Pokaż więcej ({0})', newsTotal - newsItems.length)}`);
      btn.addEventListener('click', () => loadNews(true));
      grid.append(btn);
    }
  } catch {
    placeholders.forEach((p) => p.remove());
    if (!more) grid.replaceChildren(el('p', { className: 'muted', textContent: 'Nie udało się pobrać nowości.' }));
  } finally {
    newsLoading = false;
  }
}

document.querySelectorAll<HTMLButtonElement>('#news-filter button').forEach((b) =>
  b.addEventListener('click', () => {
    if (newsLoading) return;
    newsFilter = b.dataset.filter!;
    document.querySelectorAll('#news-filter button').forEach((x) => x.classList.toggle('active', x === b));
    loadNews();
  }));

const ARTICLE_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'CODE', 'B', 'STRONG', 'I', 'EM', 'BR', 'A', 'BLOCKQUOTE']);

/**
 * Rebuilds Mojang's article HTML from an inert DOMParser document, keeping only
 * simple text tags. Nothing from the source (attributes, scripts, styles) is copied,
 * except https links, which open in the system browser.
 */
function sanitizeArticle(html: string): DocumentFragment {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const copy = (node: Node, into: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        into.appendChild(document.createTextNode(child.textContent ?? ''));
      } else if (child instanceof Element) {
        if (!ARTICLE_TAGS.has(child.tagName)) {
          copy(child, into); // unknown wrapper: keep its text
          continue;
        }
        const out = document.createElement(child.tagName.toLowerCase());
        if (child.tagName === 'A') {
          const href = child.getAttribute('href') ?? '';
          if (/^https:\/\//.test(href)) {
            out.setAttribute('href', href);
            out.addEventListener('click', (e) => {
              e.preventDefault();
              window.open(href, '_blank');
            });
          }
        }
        copy(child, out);
        into.appendChild(out);
      }
    }
  };
  const frag = document.createDocumentFragment();
  copy(doc.body, frag);
  return frag;
}

async function openArticle(n: NewsItem) {
  const img = $<HTMLImageElement>('#news-image');
  img.classList.toggle('hidden', !n.imageUrl);
  if (n.imageUrl) img.src = n.imageUrl;
  $('#news-tag').className = `tag ${n.type}`;
  $('#news-tag').textContent = n.type === 'snapshot' ? 'Snapshot' : 'Wydanie';
  $('#news-title').textContent = n.title;
  $('#news-date').textContent = new Date(n.date).toLocaleDateString(locale(), { dateStyle: 'long' });
  $('#news-body').replaceChildren(el('p', { className: 'muted', textContent: 'Ładowanie…' }));
  $('#news-modal').classList.remove('hidden');
  const article = await guard(() => api.newsArticle(n.id));
  if (article) $('#news-body').replaceChildren(sanitizeArticle(article.body));
}

function closeArticle() {
  $('#news-modal').classList.add('hidden');
}
$('#news-close').addEventListener('click', closeArticle);
$('#news-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeArticle();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeArticle();
});

/** News while idle, the game log once a launch starts. */
function showLog(show: boolean) {
  $('#news-wrap').classList.toggle('hidden', show);
  $('#log-wrap').classList.toggle('hidden', !show);
}

// ---------- skin preview ----------

let skinViewer: SkinViewer | undefined;
let skinAccountId: string | undefined;

async function renderSkin() {
  const account = store.accounts.find((a) => a.id === store.settings.selectedAccountId) ?? store.accounts[0];
  $('.skin-card').classList.toggle('hidden', !account);
  if (!account || account.id === skinAccountId) return;
  skinAccountId = account.id;
  $('#skin-name').textContent = account.name;
  $('#skin-note').textContent = 'Ładowanie skina…';
  $('#skin-stage').classList.add('loading');
  if (!skinViewer) {
    skinViewer = new SkinViewer({ canvas: $<HTMLCanvasElement>('#skin-canvas'), width: 220, height: 300 });
    // the wheel scrolls the page; zoom has its own buttons
    skinViewer.controls.enableZoom = false;
  }
  skinViewer.autoRotate = true;
  skinViewer.autoRotateSpeed = 0.6;
  skinViewer.animation ??= new IdleAnimation();
  const skin = await guard(() => api.getSkin(account.id));
  if (!skin || skinAccountId !== account.id) return;
  await skinViewer.loadSkin(skin.dataUrl, { model: skin.model });
  skinViewer.playerObject.userData.pending = undefined;
  skinVariant = skin.model === 'slim' ? 'slim' : 'classic';
  document.querySelectorAll<HTMLButtonElement>('#skin-variant button').forEach((x) => x.classList.toggle('active', x.dataset.variant === skinVariant));
  loadSkinEditor(account);
  $('#skin-stage').classList.remove('loading');
  if (skin.cape) await skinViewer.loadCape(skin.cape, { backEquipment: 'cape' });
  else skinViewer.resetCape();
  $('#skin-back').classList.toggle('hidden', !skin.cape);
  $('#skin-back').replaceChildren(el('i', { className: 'fa-solid fa-feather' }), t(' Elytra'));
  const capeNote = skin.cape ? t(' Peleryna: {0}.', skin.capeSource ?? '') : '';
  $('#skin-note').textContent = t(account.type === 'msa'
    ? 'Skin Twojego konta Minecraft.'
    : skin.isDefault
      ? 'Konto offline nie ma własnego skina; w grze zobaczysz domyślny.'
      : 'Konto offline: to skin gracza premium o tym samym nicku. Na serwerach offline inni zobaczą domyślny skin.') + capeNote;
}

// cape ⇄ elytra, both drawn from the same cape texture
$('#skin-back').addEventListener('click', () => {
  if (!skinViewer?.playerObject.backEquipment) return;
  const elytra = skinViewer.playerObject.backEquipment === 'elytra';
  skinViewer.playerObject.backEquipment = elytra ? 'cape' : 'elytra';
  $('#skin-back').replaceChildren(el('i', { className: elytra ? 'fa-solid fa-feather' : 'fa-solid fa-flag' }), t(elytra ? ' Elytra' : ' Peleryna'));
});

// ---------- changing skin and cape (Microsoft accounts) ----------

interface OwnedCape { id: string; alias: string; active: boolean; texture?: string }
let capes: OwnedCape[] = [];
let skinVariant: 'classic' | 'slim' = 'classic';

/** Forgets the cached skin and head so the next render fetches the new look from Mojang. */
function refreshSkinCaches(accountId: string) {
  heads.delete(accountId);
  headRequests.delete(accountId);
  skinAccountId = undefined;
}

/** The cape the player picked in the grid ('' = no cape); saved only with "Apply". */
let chosenCape = '';

/** Cuts the front of a cape texture (10×16 pixels at 1,1) into a small canvas. */
function capeThumbnail(texture: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 10;
  canvas.height = 16;
  const img = new Image();
  img.onload = () => {
    // capes are 64×32, some HD ones 2× larger: scale the crop with the texture
    const scale = img.naturalWidth / 64;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, scale, scale, 10 * scale, 16 * scale, 0, 0, 10, 16);
  };
  img.src = texture;
  return canvas;
}

function renderCapeGrid() {
  const activeId = capes.find((c) => c.active)?.id ?? '';
  const tile = (id: string, title: string, content: Node) => {
    const b = el('button', {
      type: 'button',
      className: `cape-choice${id === chosenCape ? ' selected' : ''}${id === activeId ? ' active' : ''}${id ? '' : ' none'}`,
      title,
    }, content);
    b.addEventListener('click', () => {
      chosenCape = id;
      // preview on the model before anything is saved
      const cape = capes.find((c) => c.id === id);
      if (cape?.texture) skinViewer?.loadCape(cape.texture);
      else skinViewer?.resetCape();
      renderCapeGrid();
    });
    return b;
  };
  $('#cape-grid').replaceChildren(
    tile('', t('Bez peleryny'), el('i', { className: 'fa-solid fa-ban' })),
    ...capes.map((c) => tile(c.id, c.alias, c.texture ? capeThumbnail(c.texture) : el('span', { textContent: c.alias.slice(0, 2) }))),
  );
  const chosen = capes.find((c) => c.id === chosenCape);
  $('#cape-name').textContent = (chosen ? chosen.alias : t('Bez peleryny')) + (chosenCape === activeId ? ` · ${t('ustawiona')}` : '');
  $('#cape-apply').classList.toggle('hidden', chosenCape === activeId);
}

async function loadSkinEditor(account: { id: string; type: string }) {
  $('#skin-edit').classList.toggle('hidden', account.type !== 'msa');
  $('#skin-pending').classList.add('hidden');
  $('#skin-actions').classList.remove('hidden');
  $('#cape-apply').classList.add('hidden');
  if (account.type !== 'msa') return;
  $('#cape-grid').replaceChildren(...skeletons('shot', 3).map((s) => Object.assign(s, { className: 'cape-choice sk' })));
  capes = (await guard(() => api.ownedCapes(account.id))) ?? [];
  chosenCape = capes.find((c) => c.active)?.id ?? '';
  $('#cape-row').classList.toggle('hidden', !capes.length);
  renderCapeGrid();
}

$('#cape-apply').addEventListener('click', () => {
  const accountId = skinAccountId;
  if (!accountId) return;
  const id = chosenCape || null;
  busy($<HTMLButtonElement>('#cape-apply'), async () => {
    try {
      await api.setCape(accountId, id);
      toast(id ? t('Ustawiono pelerynę.') : t('Peleryna ukryta.'));
      refreshSkinCaches(accountId);
      renderSkin();
    } catch (err) {
      toast(errorText(err), true);
    }
  });
});

$('#skin-change').addEventListener('click', async () => {
  const preview: string | undefined = await guard(() => api.pickSkinFile());
  if (!preview || !skinViewer) return;
  await skinViewer.loadSkin(preview, { model: skinVariant === 'slim' ? 'slim' : 'default' });
  skinViewer.playerObject.userData.pending = preview;
  $('#skin-actions').classList.add('hidden');
  $('#skin-pending').classList.remove('hidden');
  $('#skin-note').textContent = t('Podgląd nowego skina. Zapisz, żeby ustawić go w grze.');
});
document.querySelectorAll<HTMLButtonElement>('#skin-variant button').forEach((b) =>
  b.addEventListener('click', () => {
    skinVariant = b.dataset.variant as 'classic' | 'slim';
    document.querySelectorAll('#skin-variant button').forEach((x) => x.classList.toggle('active', x === b));
    const pending = skinViewer?.playerObject.userData.pending as string | undefined;
    if (pending) skinViewer!.loadSkin(pending, { model: skinVariant === 'slim' ? 'slim' : 'default' });
  }));
$('#skin-cancel').addEventListener('click', () => {
  const accountId = skinAccountId;
  if (accountId) refreshSkinCaches(accountId);
  renderSkin();
});
$('#skin-upload').addEventListener('click', () => {
  const accountId = skinAccountId;
  if (!accountId) return;
  busy($<HTMLButtonElement>('#skin-upload'), async () => {
    try {
      await api.uploadSkin(accountId, skinVariant);
      toast(t('Skin zmieniony. W grze i na serwerach zobaczysz go od następnego wejścia.'));
      refreshSkinCaches(accountId);
      renderSkin();
    } catch (err) {
      toast(errorText(err), true);
    }
  });
});
$('#skin-reset').addEventListener('click', () => {
  const accountId = skinAccountId;
  if (!accountId || !confirm(t('Przywrócić domyślny skin na koncie Minecraft?'))) return;
  busy($<HTMLButtonElement>('#skin-reset'), async () => {
    try {
      await api.resetSkin(accountId);
      toast(t('Przywrócono domyślny skin.'));
      refreshSkinCaches(accountId);
      renderSkin();
    } catch (err) {
      toast(errorText(err), true);
    }
  });
});

// ---------- skin library ----------

interface SkinPreset { id: string; name: string; variant: 'classic' | 'slim'; capeId?: string | null; dataUrl: string }
let presets: SkinPreset[] = [];
/** The preset being previewed on the model; undefined = the account's own skin is shown. */
let chosenPreset: string | undefined;

/** Draws the front of a skin (head, body, arms, legs and their outer layers) into a 16×32 canvas. */
function skinFront(dataUrl: string, slim: boolean): HTMLCanvasElement {
  const canvas = el('canvas', { width: 16, height: 32 });
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const legacy = img.naturalHeight === 32;
    const arm = slim ? 3 : 4;
    const part = (sx: number, sy: number, w: number, h: number, dx: number, dy: number) => ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h);
    // inner layer
    part(8, 8, 8, 8, 4, 0);
    part(20, 20, 8, 12, 4, 8);
    part(44, 20, arm, 12, 4 - arm, 8);
    part(legacy ? 44 : 36, legacy ? 20 : 52, arm, 12, 12, 8);
    part(4, 20, 4, 12, 4, 20);
    part(legacy ? 4 : 20, legacy ? 20 : 52, 4, 12, 8, 20);
    // outer layer
    part(40, 8, 8, 8, 4, 0);
    if (!legacy) {
      part(20, 36, 8, 12, 4, 8);
      part(44, 36, arm, 12, 4 - arm, 8);
      part(52, 52, arm, 12, 12, 8);
      part(4, 36, 4, 12, 4, 20);
      part(4, 52, 4, 12, 8, 20);
    }
  };
  img.src = dataUrl;
  return canvas;
}

async function loadLibrary() {
  presets = (await guard(() => api.listSkinPresets())) ?? presets;
  if (chosenPreset && !presets.some((p) => p.id === chosenPreset)) chosenPreset = undefined;
  renderLibrary();
}

function renderLibrary() {
  $('#lib-empty').classList.toggle('hidden', presets.length > 0);
  $('#lib-grid').replaceChildren(...presets.map((p, i) => {
    const b = el('button', { type: 'button', className: `lib-choice${p.id === chosenPreset ? ' selected' : ''}`, title: p.name },
      skinFront(p.dataUrl, p.variant === 'slim'), el('span', { textContent: p.name }));
    b.style.animationDelay = `${Math.min(i, 12) * 25}ms`;
    b.addEventListener('click', () => (p.id === chosenPreset ? leavePreview() : previewPreset(p.id)));
    return b;
  }));
  const p = presets.find((x) => x.id === chosenPreset);
  $('#lib-detail').classList.toggle('hidden', !p);
  if (!p) return;
  const name = $<HTMLInputElement>('#lib-name');
  if (document.activeElement !== name) name.value = p.name;
  document.querySelectorAll<HTMLButtonElement>('#lib-variant button').forEach((x) => x.classList.toggle('active', x.dataset.variant === p.variant));
  const cape = capes.find((c) => c.id === p.capeId);
  $('#lib-cape').textContent = p.capeId === undefined ? '' : p.capeId === null ? t('Bez peleryny') : t('Peleryna: {0}', cape?.alias ?? t('z innego konta'));
  const account = store.accounts.find((a) => a.id === skinAccountId);
  const apply = $<HTMLButtonElement>('#lib-apply');
  apply.disabled = account?.type !== 'msa';
  apply.title = apply.disabled ? t('Skin i pelerynę można zmienić tylko na koncie Microsoft.') : '';
}

/** Shows a preset on the 3D model without changing anything on the account. */
async function previewPreset(id: string) {
  const p = presets.find((x) => x.id === id);
  if (!p || !skinViewer) return;
  chosenPreset = id;
  renderLibrary();
  await skinViewer.loadSkin(p.dataUrl, { model: p.variant === 'slim' ? 'slim' : 'default' });
  const cape = capes.find((c) => c.id === p.capeId);
  if (cape?.texture) await skinViewer.loadCape(cape.texture);
  else if (p.capeId === null) skinViewer.resetCape();
  $('#skin-note').textContent = t('Podgląd skina „{0}” z biblioteki.', p.name);
}

/** Back to the account's own skin. */
function leavePreview() {
  chosenPreset = undefined;
  renderLibrary();
  skinAccountId = undefined;
  renderSkin();
}

$('#lib-save').addEventListener('click', () => {
  const account = store.accounts.find((a) => a.id === skinAccountId);
  if (!account) return;
  // the cape it wears now goes with it; offline accounts and accounts without capes leave capes alone
  const capeId = account.type === 'msa' && capes.length ? capes.find((c) => c.active)?.id ?? null : undefined;
  busy($<HTMLButtonElement>('#lib-save'), async () => {
    try {
      const preset = await api.saveCurrentSkin(account.id, account.name, capeId);
      toast(t('Zapisano skin w bibliotece.'));
      chosenPreset = preset.id;
      await loadLibrary();
    } catch (err) {
      toast(errorText(err), true);
    }
  });
});
$('#lib-import').addEventListener('click', async () => {
  const added: { id: string }[] | undefined = await guard(() => api.importSkinPresets());
  if (!added?.length) return;
  toast(t('Dodano do biblioteki: {0}', added.length));
  await loadLibrary();
  previewPreset(added[added.length - 1].id);
});
$('#lib-name').addEventListener('change', async () => {
  const id = chosenPreset;
  if (!id) return;
  await guard(() => api.updateSkinPreset(id, { name: $<HTMLInputElement>('#lib-name').value }));
  await loadLibrary();
});
$('#lib-name').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') $<HTMLInputElement>('#lib-name').blur();
});
document.querySelectorAll<HTMLButtonElement>('#lib-variant button').forEach((b) =>
  b.addEventListener('click', async () => {
    const id = chosenPreset;
    if (!id) return;
    await guard(() => api.updateSkinPreset(id, { variant: b.dataset.variant }));
    await loadLibrary();
    previewPreset(id);
  }));
$('#lib-remove').addEventListener('click', async () => {
  const p = presets.find((x) => x.id === chosenPreset);
  if (!p || !confirm(t('Usunąć „{0}” z biblioteki?', p.name))) return;
  await guard(() => api.removeSkinPreset(p.id));
  leavePreview();
  await loadLibrary();
});
$('#lib-apply').addEventListener('click', () => {
  const accountId = skinAccountId;
  const p = presets.find((x) => x.id === chosenPreset);
  if (!accountId || !p) return;
  busy($<HTMLButtonElement>('#lib-apply'), async () => {
    try {
      await api.applySkinPreset(accountId, p.id);
      toast(t('Ustawiono skin „{0}”. W grze zobaczysz go od następnego wejścia.', p.name));
      chosenPreset = undefined;
      refreshSkinCaches(accountId);
      renderSkin();
      renderLibrary();
    } catch (err) {
      toast(errorText(err), true);
    }
  });
});

$('#skin-anim').addEventListener('click', () => {
  if (!skinViewer) return;
  const walking = skinViewer.animation instanceof WalkingAnimation;
  skinViewer.animation = walking ? new IdleAnimation() : new WalkingAnimation();
  $('#skin-anim').replaceChildren(el('i', { className: walking ? 'fa-solid fa-person-walking' : 'fa-solid fa-person' }), t(walking ? ' Chodzenie' : ' Stój'));
});
$('#skin-editor').addEventListener('click', async () => {
  const account = store.accounts.find((a) => a.id === skinAccountId);
  if (!account) return;
  // edit what the model shows: a picked file, a library preset or the account's own skin
  const pending = skinViewer?.playerObject.userData.pending as string | undefined;
  const preset = presets.find((p) => p.id === chosenPreset);
  const source = pending ?? preset?.dataUrl ?? (await guard(() => api.getSkin(account.id)))?.dataUrl;
  if (!source) return;
  const slim = preset ? preset.variant === 'slim' : skinVariant === 'slim';
  await openSkinEditor({
    dataUrl: source,
    slim,
    name: preset?.name ?? account.name,
    canUse: account.type === 'msa',
    onSave: async (dataUrl, name, isSlim) => {
      try {
        await api.addSkinPreset(dataUrl, name, isSlim ? 'slim' : 'classic');
        toast(t('Zapisano skin w bibliotece.'));
        loadLibrary();
      } catch (err) {
        toast(errorText(err), true);
        throw err;
      }
    },
    onUse: async (dataUrl, isSlim) => {
      try {
        const preview: string = await api.setPendingSkin(dataUrl);
        skinVariant = isSlim ? 'slim' : 'classic';
        document.querySelectorAll<HTMLButtonElement>('#skin-variant button').forEach((x) => x.classList.toggle('active', x.dataset.variant === skinVariant));
        await skinViewer?.loadSkin(preview, { model: isSlim ? 'slim' : 'default' });
        if (skinViewer) skinViewer.playerObject.userData.pending = preview;
        $('#skin-actions').classList.add('hidden');
        $('#skin-pending').classList.remove('hidden');
        $('#skin-note').textContent = t('Podgląd nowego skina. Zapisz, żeby ustawić go w grze.');
      } catch (err) {
        toast(errorText(err), true);
        throw err;
      }
    },
  }).catch((err) => toast(errorText(err), true));
});
/** Zoom steps for the preview buttons (skinview3d's default is 0.9). */
function zoomSkin(step: number) {
  if (!skinViewer) return;
  skinViewer.zoom = Math.min(1.4, Math.max(0.5, Math.round((skinViewer.zoom + step) * 10) / 10));
}
$('#skin-zoom-in').addEventListener('click', () => zoomSkin(0.15));
$('#skin-zoom-out').addEventListener('click', () => zoomSkin(-0.15));
$('#skin-save').addEventListener('click', () => skinAccountId && guard(() => api.saveSkin(skinAccountId!)));
document.querySelector('.nav[data-view="accounts"]')?.addEventListener('click', () => {
  renderSkin();
  loadLibrary();
});

// ---------- starfield (as on lista.slash3rss.dev) ----------

function startStars() {
  const canvas = $<HTMLCanvasElement>('#stars');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stars: { x: number; y: number; r: number; phase: number; speed: number }[] = [];

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round((innerWidth * innerHeight) / 9000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      r: Math.random() * 1.1 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
    }));
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const s of stars) {
      const alpha = still ? 0.5 : 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase + (t / 1000) * s.speed));
      ctx.fillStyle = `rgba(191, 219, 254, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // ~20 fps is plenty for a slow twinkle and keeps the launcher light while the game runs.
  let last = 0;
  const loop = (t: number) => {
    if (t - last > 50) {
      draw(t);
      last = t;
    }
    if (!still) requestAnimationFrame(loop);
  };
  addEventListener('resize', () => {
    resize();
    draw(performance.now());
  });
  resize();
  requestAnimationFrame(loop);
}

// ---------- task panel: install progress and completion ----------

interface TaskStart { id: string; title: string; icon?: string }
interface TaskProgress { id: string; stage: string; done: number; total: number; bytes?: number; totalBytes?: number; speed?: number }
interface TaskDone { id: string; ok: boolean; message: string; profileId?: string }

const taskCards = new Map<string, HTMLElement>();

api.on('task:start', ({ id, title, icon }: TaskStart) => {
  const img = el('img', { alt: '' });
  img.src = icon?.startsWith('https://cdn.modrinth.com/') ? icon : 'logo.png';
  const bar = el('div', { className: 'progress indeterminate' }, el('div'));
  const card = el('div', { className: 'task' }, img,
    el('div', { className: 'task-body' },
      el('div', { className: 'task-title', textContent: title, title }),
      el('div', { className: 'task-stage loading-text', textContent: t('Przygotowanie…') }),
      bar,
      el('div', { className: 'task-stats' })));
  taskCards.set(id, card);
  $('#tasks').prepend(card);
  trimStack();
});

api.on('task:progress', ({ id, stage, done, total, bytes, totalBytes, speed }: TaskProgress) => {
  const card = taskCards.get(id);
  if (!card) return;
  const label = card.querySelector<HTMLElement>('.task-stage')!;
  const stats = card.querySelector<HTMLElement>('.task-stats')!;
  const bar = card.querySelector<HTMLElement>('.progress')!;
  const known = total > 1 || Boolean(totalBytes);
  const fraction = totalBytes ? Math.min(1, (bytes ?? 0) / totalBytes) : total ? done / total : 0;
  label.classList.toggle('loading-text', !known);
  label.textContent = known ? `${stage} · ${Math.round(fraction * 100)}%` : `${stage}…`;
  const parts: string[] = [];
  if (total > 1) parts.push(`${done}/${total}`);
  if (totalBytes) parts.push(`${fmtMb(bytes ?? 0)}/${fmtMb(totalBytes)} MB`);
  if (speed && done < total) parts.push(fmtSpeed(speed));
  stats.textContent = parts.join(' · ');
  bar.classList.toggle('indeterminate', !known);
  (bar.firstElementChild as HTMLElement).style.width = `${(fraction * 100).toFixed(1)}%`;
});

api.on('task:done', ({ id, ok, message, profileId }: TaskDone) => {
  const card = taskCards.get(id);
  if (!card) return;
  taskCards.delete(id);
  card.classList.add(ok ? 'done' : 'failed');
  const body = card.querySelector('.task-body')!;
  const close = el('button', { type: 'button', textContent: t('Zamknij') });
  close.addEventListener('click', () => dismiss(card));
  const actions = el('div', { className: 'task-actions' });
  if (ok && profileId) {
    const play = el('button', { type: 'button', className: 'primary' }, el('i', { className: 'fa-solid fa-play' }), t('Graj teraz'));
    play.addEventListener('click', () => {
      dismiss(card);
      store.settings.selectedProfileId = profileId;
      renderPlay();
      startGame();
    });
    actions.append(close, play);
  } else actions.append(close);
  body.replaceChildren(
    body.querySelector('.task-title')!,
    el('div', { className: 'task-result' }, el('i', { className: ok ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark' }), el('span', { textContent: message })),
    actions);
  // everything goes away on its own; a modpack ("Play now") and errors stay longer to be read
  dismissLater(card, !ok ? 15000 : profileId ? 20000 : 6000);
});

// ---------- updates ----------

api.on('update:ready', (version: string) => {
  $('#update-version').textContent = version;
  $('#update-bar').classList.remove('hidden');
});
$('#update-install').addEventListener('click', () => api.installUpdate());

// switching the language takes effect immediately
$('#language-select').addEventListener('change', async () => {
  const lang = $<HTMLSelectElement>('#language-select').value;
  await api.saveSettings({ language: lang });
  applyLanguage(lang);
  render();
  renderProfiles();
  if (servers.length) renderServers();
  if (contentHits.length || installed.length) renderContent();
  if (document.querySelector('#view-worlds.active')) renderWorlds();
  skinAccountId = undefined;
  if (document.querySelector('#view-accounts.active')) renderSkin();
  loadNews();
});

// ---------- boot ----------

/** Hides the start-up screen and lets the interface slide in. */
function finishBoot() {
  $('#splash').classList.add('done');
  document.body.classList.remove('booting');
  document.body.classList.add('entering');
  setTimeout(() => {
    document.body.classList.remove('entering');
    $('#splash').remove();
  }, 900);
}

(async () => {
  const shownAt = performance.now();
  try {
    startStars();
    store = await api.getStore();
    applyLanguage(store.settings.language);
    loadNews();
    render();
    friends.init();
  } finally {
    // keep the splash until fonts are ready and for at least a moment so it doesn't flicker,
    // but never wait on the network (and always hide it, even after an error)
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, Math.max(0, 700 - (performance.now() - shownAt))));
    finishBoot();
  }
  versions = (await guard(() => api.listVersions())) ?? [];
  renderProfiles();
})();
