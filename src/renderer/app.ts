import { SkinViewer, WalkingAnimation, IdleAnimation } from 'skinview3d';
import { CosmeticPreview, cosmeticIcon } from './cosmeticPreview';
import { MOVE_ICONS, ringThumbnail } from './ringMovePreview';
import { OUR_PET_MODELS } from './ourPetModels';
import { gameIcon } from './gameIcon';
import { createFriends, socialErrorText } from './friends';
import { createProfileFiles } from './profileFiles';
import { initProfileSharing } from './profileShare';
import { createMediaTools } from './mediaTools';
import { openPackPreview } from './packPreview';
import { initCloudProfiles } from './cloudProfiles';
import { initVersionMove } from './versionMove';
import { createAchievements } from './achievements';
import { buyWithConfirm } from './sparkShop';
import { currencyName, sparks } from '../shared/sparks';
import { openSkinEditor } from './skinEditor';
import { getLang, LANGUAGES, locale, lookup, setLang, t } from '../shared/i18n';
import type { SlashApi } from '../main/preload';
import { benchTips, type BenchTip } from '../shared/benchTips';
import { createConfigEditor } from './configEditor';
import { createDiskCleanup } from './diskCleanup';
import { createKeyConflicts } from './keyConflicts';
import { createToolSettings } from './toolSettings';
import { createSupportCard } from './support';
import { initFeatures } from './features';
import { checkLegalNotices, createLegalCard } from './legal';
import { createWiki } from './wiki';
import { confirmDialog, modalWindow } from './dialog';

declare global {
  interface Window {
    slash: SlashApi;
  }
}

interface PublicAccount { id: string; type: 'offline' | 'msa'; name: string; uuid: string }
interface Profile {
  /** The Minecraft account this profile always plays as. */
  accountId?: string;
  id: string; name: string; versionId: string; loader: 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'; loaderVersion: string; gameDir: string; memoryMb: number;
  jvmArgs: string; javaPath: string; width: number; height: number;
  icon: string; iconVersion: number; syncOptions: boolean; hud?: boolean; iconFile?: string;
  modpack?: { projectId: string; versionId: string; versionNumber: string; title: string; source?: 'curseforge' };
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
  settings: { msClientId: string; selectedProfileId?: string; selectedAccountId?: string; closeOnLaunch: boolean; defaultMemoryMb?: number; discordEnabled: boolean; language: string; serverProfiles?: Record<string, string>; socialUrl: string };
  running: boolean;
  /** Profiles whose game runs now (several can at once). */
  runningProfiles?: string[];
  dataDir: string;
  systemMemoryMb: number;
  hudVersions?: string[];
}
interface VersionInfo { id: string; type: string }

const api = window.slash;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

let store: PublicStore;
let versions: VersionInfo[] = [];
let editingId: string | undefined;
let launching = false;
/** The game of the profile picked on the Play tab runs now (other profiles may run too). */
const selectedRunning = () => (store.runningProfiles ?? []).includes($<HTMLSelectElement>('#play-profile').value);

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

/**
 * Removes a notification after `ms`; the countdown waits while the mouse is over it. A timer does
 * the counting: the shrinking bar is only a picture, and animations stop with "reduce motion" or
 * in a window in the background, which used to leave notifications on screen for good.
 */
function dismissLater(card: HTMLElement, ms: number) {
  const bar = el('div', { className: 'notif-timer' });
  bar.style.animationDuration = `${ms}ms`;
  card.append(bar);
  let left = ms;
  let startedAt = Date.now();
  let timer = setTimeout(() => dismiss(card), left);
  card.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    left = Math.max(800, left - (Date.now() - startedAt));
  });
  card.addEventListener('mouseleave', () => {
    startedAt = Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => dismiss(card), left);
  });
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
function toast(message: string, isError = false, action?: { label: string; run: () => void }) {
  const close = el('button', { type: 'button', className: 'notif-close', title: t('Zamknij') }, el('i', { className: 'fa-solid fa-xmark' }));
  const text = el('div', { className: 'notif-text', textContent: message });
  const card = el('div', { className: `task notif${isError ? ' failed' : ''}`, role: isError ? 'alert' : 'status' },
    el('i', { className: `notif-icon fa-solid ${isError ? 'fa-circle-exclamation' : action ? 'fa-gamepad' : 'fa-circle-check'}` }),
    text,
    close);
  if (action) {
    const go = el('button', { type: 'button', className: 'primary notif-action' }, action.label);
    go.addEventListener('click', () => {
      dismiss(card);
      action.run();
    });
    text.append(go);
  }
  close.addEventListener('click', () => dismiss(card));
  $('#tasks').prepend(card);
  // an invite stays long enough to be seen
  dismissLater(card, isError ? 9000 : action ? 20000 : 4500);
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

// ---------- SlashClient HUD in the profile form ----------

/** Says whether the HUD will be in the game with the loader and version picked in the form. */
function renderHudHint() {
  const form = $<HTMLFormElement>('#profile-form');
  const loader = (form.elements.namedItem('loader') as HTMLSelectElement).value;
  const version = resolvedVersion((form.elements.namedItem('versionId') as HTMLSelectElement | HTMLInputElement).value);
  const supported = store.hudVersions ?? [];
  // vanilla profiles get it through a hidden Fabric, like Feather; Forge/NeoForge/Quilt can't
  const hint = loader !== 'fabric' && loader !== 'vanilla'
    ? t('działa w profilach vanilla i Fabric ({0})', supported.join(', ') || '—')
    : supported.includes(version)
      ? t('FPS, ping, CPS, pancerz, klawisze i więcej. W grze Prawy Shift otwiera edycję.')
      : t('jeszcze nie dla {0}; dostępny dla {1}', version, supported.join(', ') || '—');
  $('#hud-hint').textContent = hint;
}
$('#hud-copy').addEventListener('click', async () => {
  if (!editingId) return;
  if ((await guard(() => api.copyHudCode(editingId!))) !== undefined) toast(t('Skopiowano kod HUD. Wklej go znajomemu albo w innym profilu.'));
});
$('#hud-paste').addEventListener('click', async () => {
  if (!editingId) return;
  if ((await guard(() => api.pasteHudCode(editingId!))) !== undefined) toast(t('Wczytano ustawienia HUD z kodu. Zobaczysz je przy następnym uruchomieniu gry.'));
});
$('#profile-form').addEventListener('change', (e) => {
  const name = (e.target as HTMLInputElement).name;
  if (name === 'loader' || name === 'versionId') renderHudHint();
});

// ---------- navigation ----------

document.querySelectorAll<HTMLButtonElement>('.nav').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${btn.dataset.view}`));
    updateSkinRendering();
  }),
);

/**
 * The 3D skin preview renders every frame (~8% CPU): only while it can be seen and
 * the launcher is the active window; in the background it stops on its last frame.
 */
function updateSkinRendering() {
  if (!skinViewer) return;
  // paused only when nobody can see it (a window in the background still shows the preview)
  skinViewer.renderPaused = !$('#view-accounts').classList.contains('active') || document.hidden;
}
document.addEventListener('visibilitychange', updateSkinRendering);

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
  if (profile && modpackLatest) guard(() => api.updateModpack(profile.id, modpackLatest!.id)).then(() => {
    $('#modpack-status').textContent = '';
    offerManual(profile.id);
  });
});
$('#modpack-versions').addEventListener('click', async () => {
  const profile = store.profiles.find((p) => p.id === editingId);
  if (!profile?.modpack) return;
  const v = await chooseVersion({ title: profile.modpack.title, projectId: profile.modpack.projectId, type: 'modpack', currentVersionId: profile.modpack.versionId, profileId: profile.id, source: profile.modpack.source ?? 'modrinth' });
  if (v) guard(() => api.updateModpack(profile.id, v.id)).then(() => offerManual(profile.id));
});

// ---------- profile icons ----------

/** Blocks with a drawn fallback picture (img/blocks), used until a game has been downloaded. */
const FALLBACK_BLOCKS = ['grass', 'dirt', 'stone', 'sand', 'planks', 'log', 'diamond-ore', 'obsidian', 'netherrack'];
/** 3D icons drawn from the game's own textures, once the launcher has a game jar (blocks:textures). */
let blockIcons: Record<string, string> = {};

const blockNames = () => (Object.keys(blockIcons).length ? Object.keys(blockIcons) : FALLBACK_BLOCKS);

function blockIconUrl(kind: string): string {
  return blockIcons[kind] ?? `img/blocks/${FALLBACK_BLOCKS.includes(kind) ? kind : 'grass'}.png`;
}

function profileIconUrl(p: Profile): string {
  if (p.icon === 'custom' && p.iconFile) return `slash-media://local/?path=${encodeURIComponent(p.iconFile)}&v=${p.iconVersion}`;
  return blockIconUrl(p.icon?.startsWith('block:') ? p.icon.slice(6) : 'grass');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Plains grass colour: the game's grass texture is grey and tinted per biome. */
const GRASS_TINT = '#91bd59';

/** A 16×16 face, tinted like the game does for grass. */
function face(img: HTMLImageElement, tint?: string): CanvasImageSource {
  if (!tint) return img;
  const c = el('canvas', { width: 16, height: 16 });
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, 16, 16);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 16, 16);
  // multiply fills the transparent pixels too: keep only the texture's own shape
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0, 16, 16);
  return c;
}

/**
 * An isometric block like in the game's inventory: the top and two sides, the sides shaded,
 * every texel kept square-edged (no smoothing). Returns a PNG data URL.
 */
function drawBlock(top: CanvasImageSource, left: CanvasImageSource, right: CanvasImageSource): string {
  const size = 128;
  const c = el('canvas', { width: size, height: size });
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const w = 54, half = 31, h = 62, top0 = 2;
  const T = [size / 2, top0], R = [size / 2 + w, top0 + half], B = [size / 2, top0 + half * 2], L = [size / 2 - w, top0 + half];
  const paint = (src: CanvasImageSource, a: number, b: number, cc: number, d: number, e: number, f: number, shade: number) => {
    ctx.setTransform(a / 16, b / 16, cc / 16, d / 16, e, f);
    ctx.drawImage(src, 0, 0, 16, 16);
    if (shade) {
      ctx.fillStyle = `rgba(0, 0, 0, ${shade})`;
      ctx.fillRect(0, 0, 16, 16);
    }
  };
  // a hair of overlap closes the seams between faces
  paint(left, B[0] - L[0] + 0.5, B[1] - L[1], 0, h, L[0], L[1], 0.22);
  paint(right, R[0] - B[0], R[1] - B[1], 0, h, B[0] - 0.5, B[1], 0.42);
  paint(top, R[0] - T[0], R[1] - T[1], L[0] - T[0], L[1] - T[1], T[0], T[1] - 0.3, 0);
  return c.toDataURL('image/png');
}

/** Builds the 3D icons once the main process has found textures in a downloaded game. */
async function loadBlockIcons() {
  const res: { faces: Record<string, { top: string; side: string; front?: string; tint?: string }>; textures: Record<string, string> } | null =
    await api.blockTextures().catch(() => null);
  if (!res) return;
  const images: Record<string, HTMLImageElement> = {};
  await Promise.all(Object.entries(res.textures).map(async ([name, src]) => (images[name] = await loadImage(src))));
  const icons: Record<string, string> = {};
  for (const [kind, f] of Object.entries(res.faces)) {
    const tint = f.tint === 'grass' ? GRASS_TINT : undefined;
    icons[kind] = drawBlock(face(images[f.top], tint), images[f.front ?? f.side], images[f.side]);
  }
  blockIcons = icons;
  render();
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
  const items = blockNames().map((k) => choice(`block:${k}`, blockIconUrl(k), k));
  if (profile.icon === 'custom') items.push(choice('custom', profileIconUrl(profile), t('Własny obrazek')));
  const upload = el('button', { type: 'button', className: 'icon-choice upload' }, el('i', { className: 'fa-regular fa-image' }), ` ${t('Własny obrazek…')}`);
  upload.addEventListener('click', () => guard(() => busy(upload, () => api.chooseProfileIcon(profile.id))));
  $('#icon-choices').replaceChildren(...items, upload);
}

// ---------- back to the game ----------

function renderContinue(profile: Profile | undefined) {
  const box = $('#continue');
  const target = profile?.lastTarget;
  box.classList.toggle('hidden', !target || selectedRunning() || launching);
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
  // a profile with its own account plays as it: the account picker follows the profile
  const own = store.profiles.find((p) => p.id === store.settings.selectedProfileId)?.accountId;
  const accountId = own && store.accounts.some((a) => a.id === own) ? own : store.settings.selectedAccountId;
  fillSelect(accountSel, store.accounts.map((a) => ({ value: a.id, label: `${a.name}${a.type === 'offline' ? ' (offline)' : ''}` })), accountId);
  if (store.accounts.length === 0) accountSel.append(el('option', { value: '', textContent: 'Brak kont' }));
  const runningIds = store.runningProfiles ?? [];
  picker(profileSel, store.profiles.map((p) => ({ value: p.id, label: p.name, sub: runningIds.includes(p.id) ? `${profileLabel(p)} · ${t('działa')}` : profileLabel(p), img: profileIconUrl(p), pixelated: p.icon !== 'custom' })));
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
  const running = selectedRunning();
  btn.textContent = running ? 'ZATRZYMAJ' : launching ? t('URUCHAMIANIE…') : 'GRAJ';
  btn.classList.toggle('stop', running);
  btn.classList.toggle('starting', launching && !running);
  btn.disabled = launching;

}

function renderProfiles() {
  // the remembered profile may have been deleted: fall back to one that exists
  const exists = (id?: string) => !!id && store.profiles.some((p) => p.id === id);
  if (!exists(editingId)) editingId = exists(store.settings.selectedProfileId) ? store.settings.selectedProfileId : store.profiles[0]?.id;
  $('#profile-list').replaceChildren(
    ...store.profiles.map((p) => {
      const li = el('li', { className: p.id === editingId && profilePane !== 'stats' ? 'selected' : '' },
        profileIconImg(p),
        el('div', { className: 'grow' }, p.name, el('small', { textContent: [profileLabel(p), p.playTimeMs ? fmtPlaytime(p.playTimeMs) : ''].filter(Boolean).join(' · ') })));
      li.title = p.name;
      li.addEventListener('click', () => {
        const changed = editingId !== p.id;
        editingId = p.id;
        if (profilePane === 'stats') showPane('settings');
        renderProfiles();
        if (changed) refreshPane();
      });
      return li;
    }),
  );
  const profile = store.profiles.find((p) => p.id === editingId);
  if (profile) loadProfileForm(profile);
}

// ---------- profile panes: settings, mods, worlds, and the statistics of all profiles ----------

type ProfilePane = 'settings' | 'content' | 'worlds' | 'configs' | 'stats';
let profilePane: ProfilePane = 'settings';
const configEditor = createConfigEditor($('#config-pane'), { api, toast, errorText });
createDiskCleanup($('#disk-card'), { api, toast, errorText });
const keyConflicts = createKeyConflicts($('#keys-card'), { api, toast, errorText });
createToolSettings($('#tools-card'), { api, toast, errorText });
const wiki = createWiki($('#wiki-root'), { api, toast, errorText });
document.querySelector('.nav[data-view="wiki"]')?.addEventListener('click', () => wiki.focus());
// "Wesprzyj projekt": opens the website's support page; the tier shown is asked again on each visit to Settings
const supportCard = createSupportCard($('#support-card'), { api, socialUrl: () => store?.settings.socialUrl ?? '', toast });
// the admin's feature switches and announcement banner (features.ts)
initFeatures({ api, socialUrl: () => store?.settings.socialUrl ?? '', openUrl: (url) => window.open(url, '_blank') });
document.querySelector('.nav[data-view="settings"]')?.addEventListener('click', () => void supportCard.refresh());
// "O programie / Informacje prawne": the terms and the privacy policy on the website
createLegalCard($('#legal-card'), { socialUrl: () => store?.settings.socialUrl ?? '' });

function showPane(pane: ProfilePane) {
  profilePane = pane;
  document.querySelectorAll<HTMLElement>('.profile-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== pane));
  document.querySelectorAll<HTMLButtonElement>('#profile-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.pane === pane));
  $('#profile-tabs').classList.toggle('hidden', pane === 'stats');
  $('#stats-entry').classList.toggle('selected', pane === 'stats');
  // mods, worlds and stats need the width: the profile list shrinks to icons
  $('.split.profiles').classList.toggle('compact', pane !== 'settings');
  renderProfiles();
  refreshPane();
}

/** Loads what the open pane shows, for the profile picked on the left. */
function refreshPane() {
  if (profilePane === 'content') openContentPane(true);
  else if (profilePane === 'worlds') {
    renderContentProfiles();
    renderWorlds();
  } else if (profilePane === 'configs') configEditor.open(editingId);
  else if (profilePane === 'stats') renderStats();
}

document.querySelectorAll<HTMLButtonElement>('#profile-tabs button').forEach((b) =>
  b.addEventListener('click', () => showPane(b.dataset.pane as ProfilePane)));
$('#stats-entry').addEventListener('click', () => showPane('stats'));
// coming back to Profiles shows the open pane up to date
document.querySelector('.nav[data-view="profiles"]')?.addEventListener('click', () => refreshPane());

/** Opens Profiles on one pane, e.g. Mods from a hint elsewhere. */
function openProfilePane(pane: ProfilePane, profileId?: string) {
  if (profileId) editingId = profileId;
  showView('profiles');
  showPane(pane);
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

// ---------- benchmark: results of the profile and starting a run ----------

interface BenchmarkResult {
  at: number; version: string; world?: string;
  fps: { avg: number; low1: number; low01: number; median: number; min: number; max: number };
  frames: number; stutters: number; cpu?: number; gpu?: number;
  settings: { renderDistance: number; simulationDistance?: number; width: number; height: number; vsync: boolean; maxFps: number; fullscreen: boolean; mods: number; memoryMb?: number };
}

const fmtFps = (v: number) => Math.round(v).toLocaleString(locale());

/** What was different between two runs, so a change in FPS has its likely reason next to it. */
function benchDiff(now: BenchmarkResult, before: BenchmarkResult): string[] {
  const out: string[] = [];
  const a = now.settings, b = before.settings;
  if (a.renderDistance !== b.renderDistance) out.push(t('zasięg {0} → {1}', b.renderDistance, a.renderDistance));
  if (a.mods !== b.mods) out.push(t('mody {0} → {1}', b.mods, a.mods));
  if (a.width !== b.width || a.height !== b.height) out.push(`${b.width}×${b.height} → ${a.width}×${a.height}`);
  if (a.vsync !== b.vsync) out.push(a.vsync ? t('VSync włączony') : t('VSync wyłączony'));
  if (now.version !== before.version) out.push(`${before.version} → ${now.version}`);
  return out;
}

async function renderBenchmarks(profileId: string) {
  const list = $('#bench-list');
  const runs: BenchmarkResult[] = (await guard(() => api.listBenchmarks(profileId))) ?? [];
  if (profileId !== editingId) return;
  if (!runs.length) {
    list.replaceChildren(el('p', { className: 'muted', textContent: t('Jeszcze nie było pomiaru w tym profilu.') }));
    return;
  }
  const best = Math.max(...runs.map((r) => r.fps.avg));
  list.replaceChildren(...runs.slice(0, 8).map((r, i) => {
    const before = runs[i + 1];
    const change = before && before.fps.avg > 0 ? ((r.fps.avg - before.fps.avg) / before.fps.avg) * 100 : undefined;
    const bar = el('div', { className: 'bench-bar' }, el('div'));
    (bar.firstElementChild as HTMLElement).style.width = `${Math.max(4, (r.fps.avg / best) * 100).toFixed(1)}%`;
    const low = el('div', { className: 'bench-bar low' }, el('div'));
    (low.firstElementChild as HTMLElement).style.width = `${Math.max(2, (r.fps.low1 / best) * 100).toFixed(1)}%`;
    const details = [
      t('1% low {0}', fmtFps(r.fps.low1)), t('0,1% low {0}', fmtFps(r.fps.low01)), t('przycięcia: {0}', r.stutters),
      r.cpu !== undefined ? t('CPU {0}%', Math.round(r.cpu * 100)) : '', r.gpu !== undefined && r.gpu >= 0 ? t('GPU {0}%', Math.round(r.gpu)) : '',
    ].filter(Boolean).join(' · ');
    const setup = [`Minecraft ${r.version}`, t('zasięg {0}', r.settings.renderDistance), `${r.settings.width}×${r.settings.height}`, t('modów: {0}', r.settings.mods), r.settings.vsync ? 'VSync' : ''].filter(Boolean).join(' · ');
    const diff = before ? benchDiff(r, before) : [];
    return el('div', { className: 'bench-run' },
      el('div', { className: 'bench-top' },
        el('b', { className: 'bench-fps', textContent: t('{0} FPS', fmtFps(r.fps.avg)) }),
        change === undefined ? '' : el('span', { className: `bench-change ${change >= 0 ? 'up' : 'down'}`, textContent: `${change >= 0 ? '+' : ''}${change.toFixed(0)}%` }),
        el('small', { className: 'muted', textContent: new Date(r.at).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) })),
      bar, low,
      el('small', { textContent: details }),
      el('small', { className: 'muted', textContent: setup + (diff.length ? ` · ${t('zmiana: {0}', diff.join(', '))}` : '') }));
  }));
  renderBenchTips(profileId, runs[0]);
}

/** What the newest run says about the profile, with the missing performance mods one click away. */
async function renderBenchTips(profileId: string, run: BenchmarkResult) {
  const profile = store.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  const box = el('div', { className: 'bench-tips' });
  $('#bench-list').prepend(box);
  // the mod list asks Modrinth: tips without mods first, then again once it is known
  const draw = (plan: PerfPlanItem[] | null) => {
    const missing = plan ? plan.filter((p) => p.projectId && !p.installed).map((p) => p.slug) : profile.loader === 'vanilla' ? null : [];
    box.replaceChildren(el('h4', { textContent: t('Co poprawić') }), ...benchTips(run, missing).map((tip) => benchTipRow(profileId, tip, plan ?? [])));
  };
  draw(null);
  if (profile.loader === 'vanilla') return;
  const plan: PerfPlanItem[] | undefined = await api.perfPlan(profileId).catch(() => undefined);
  if (plan && profileId === editingId && box.isConnected) draw(plan);
}

function benchTipRow(profileId: string, tip: BenchTip, plan: PerfPlanItem[]): HTMLElement {
  const icon = tip.level === 'good' ? 'fa-circle-check' : tip.level === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-info';
  const items = (tip.mods ?? []).map((slug) => plan.find((p) => p.slug === slug && p.projectId && !p.installed)).filter((p): p is PerfPlanItem => !!p);
  const row = el('div', { className: `bench-tip ${tip.level}` }, el('i', { className: `fa-solid ${icon}` }),
    el('div', { className: 'grow' }, el('span', { textContent: t(tip.text, ...(tip.args ?? [])) })));
  if (items.length) {
    const install = el('button', { className: 'small' }, el('i', { className: 'fa-solid fa-download' }), t('Zainstaluj: {0}', items.map((p) => p.title).join(', ')));
    install.addEventListener('click', async () => {
      install.disabled = true;
      await guard(() => api.installPerf(profileId, items.map((p) => ({ projectId: p.projectId!, title: p.title }))));
      if (profileId === editingId) renderBenchmarks(profileId);
    });
    row.querySelector('.grow')!.append(install);
  }
  return row;
}

/** The world for a run from the profile card: the last one played, or the first one there is. */
async function benchmarkFromProfile(profileId: string) {
  const profile = store.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  let folder = profile.lastTarget?.kind === 'world' ? profile.lastTarget.folder : undefined;
  if (!folder) {
    const worlds: WorldInfo[] = (await guard(() => api.listWorlds(profileId))) ?? [];
    folder = worlds[0]?.folder;
  }
  // no world yet: the game opens on its menu and the benchmark starts in whatever world the player enters
  if (!folder) toast(t('Ten profil nie ma jeszcze świata: stwórz go w grze albo wejdź na serwer, a benchmark ruszy sam.'));
  store.settings.selectedProfileId = profileId;
  renderPlay();
  startGame(undefined, folder, true);
}

$('#bench-run').addEventListener('click', () => editingId && benchmarkFromProfile(editingId));

api.on('benchmark:done', ({ profileId, result, before }: { profileId: string; result: BenchmarkResult; before?: BenchmarkResult }) => {
  const change = before && before.fps.avg > 0 ? ((result.fps.avg - before.fps.avg) / before.fps.avg) * 100 : undefined;
  toast(t('Benchmark: średnio {0} FPS, 1% low {1} FPS', fmtFps(result.fps.avg), fmtFps(result.fps.low1)) + (change === undefined ? '' : ` (${change >= 0 ? '+' : ''}${change.toFixed(0)}%)`));
  if (profileId === editingId) renderBenchmarks(profileId);
});

function loadProfileForm(profile: Profile) {
  renderBenchmarks(profile.id);
  profileFiles.renderSnapshots(profile.id, $('#snapshot-list'));
  keyConflicts.open(profile.id, (store.runningProfiles ?? []).length > 0);
  void cloudCard.render(profile.id);
  void moveCard.render(profile);
  const form = $<HTMLFormElement>('#profile-form');
  for (const key of ['name', 'gameDir', 'jvmArgs', 'javaPath', 'memoryMb', 'width', 'height'] as const) {
    (form.elements.namedItem(key) as HTMLInputElement).value = String(profile[key]);
  }
  renderVersionOptions(profile.versionId);
  renderIconChoices(profile);
  renderModpackBox(profile);
  fillSelect($<HTMLSelectElement>('#profile-account'), [
    { value: '', label: t('Wybrane na karcie Graj') },
    ...store.accounts.map((a) => ({ value: a.id, label: `${a.name}${a.type === 'offline' ? ' (offline)' : ''}` })),
  ], store.accounts.some((a) => a.id === profile.accountId) ? profile.accountId : '');
  (form.elements.namedItem('syncOptions') as HTMLInputElement).checked = profile.syncOptions ?? false;
  (form.elements.namedItem('hud') as HTMLInputElement).checked = profile.hud ?? true;
  renderHudHint();
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
  fillSelect($<HTMLSelectElement>('#language-select'), LANGUAGES.map((l) => ({ value: l.code, label: l.name })), getLang());
  (form.elements.namedItem('closeOnLaunch') as HTMLInputElement).checked = store.settings.closeOnLaunch;
  const memory = form.elements.namedItem('defaultMemoryMb') as HTMLInputElement;
  memory.max = String(Math.max(4096, Math.floor((store.systemMemoryMb - 2048) / 512) * 512));
  // (the same limit as each profile's own slider: some memory is left to the system)
  memory.value = String(store.settings.defaultMemoryMb ?? 4096);
  $('#default-memory-value').textContent = `${memory.value} MB`;
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

/** Each profile's game log (several games can run at once); the console shows the picked profile's. */
const logs = new Map<string, string[]>();
const pickedProfile = () => $<HTMLSelectElement>('#play-profile').value;
function logTo(profileId: string, line: string) {
  const lines = logs.get(profileId) ?? [];
  lines.push(line);
  if (lines.length > 2000) lines.splice(0, lines.length - 2000);
  logs.set(profileId, lines);
  if (profileId === pickedProfile() && consoleView === 'live') {
    appendLog(line);
    $('#log-empty').classList.add('hidden');
  }
}

/** What the console shows: the picked profile's game as it runs ('live'), or one of its saved sessions (its id). */
let consoleView = 'live';
type ConsoleSession = { id: string; start: number; end: number; code: number | null; crashed: boolean };

/** The session picker: "now" while the game runs, then the saved sessions, newest first. */
async function renderSessions() {
  const profileId = pickedProfile();
  const sessions: ConsoleSession[] = await api.consoleSessions(profileId).catch(() => []);
  if (profileId !== pickedProfile()) return;
  const live = selectedRunning() || launching;
  if (!live && consoleView === 'live') consoleView = sessions[0]?.id ?? 'live';
  if (consoleView !== 'live' && !sessions.some((s) => s.id === consoleView)) consoleView = live ? 'live' : sessions[0]?.id ?? 'live';
  const when = (s: ConsoleSession) => {
    const date = new Date(s.start).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `${date}${s.crashed ? ` · ${t('błąd')}` : ''}`;
  };
  const length = (s: ConsoleSession) => t('{0} min', String(Math.max(1, Math.round((s.end - s.start) / 60000))));
  const sel = $<HTMLSelectElement>('#log-session');
  sel.replaceChildren(
    ...(live ? [el('option', { value: 'live', textContent: t('Teraz') })] : []),
    ...sessions.map((s) => el('option', { value: s.id, textContent: when(s), title: length(s) })));
  sel.value = consoleView;
  sel.classList.toggle('hidden', !sel.options.length);
}

/** The lines of what the console shows now. */
async function renderConsole() {
  const profileId = pickedProfile();
  log.replaceChildren();
  if (consoleView === 'live') {
    for (const line of logs.get(profileId) ?? []) appendLog(line);
  } else {
    const text: string = await api.consoleRead(profileId, consoleView).catch(() => '');
    if (profileId !== pickedProfile()) return;
    for (const line of text.split('\n')) if (line) appendLog(line);
    log.scrollTop = log.scrollHeight;
  }
  $('#log-empty').classList.toggle('hidden', log.childElementCount > 0 || consoleView === 'live');
}

/** News or console; the console is always there, with the running game or the saved sessions. */
async function setPlayTab(tab: 'news' | 'console') {
  $('#news-wrap').classList.toggle('hidden', tab !== 'news');
  $('#log-wrap').classList.toggle('hidden', tab !== 'console');
  document.querySelectorAll<HTMLButtonElement>('#play-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'console') {
    await renderSessions();
    await renderConsole();
  }
}
document.querySelectorAll<HTMLButtonElement>('#play-tabs button').forEach((b) => b.addEventListener('click', () => void setPlayTab(b.dataset.tab as 'news' | 'console')));
$('#log-session').addEventListener('change', () => {
  consoleView = $<HTMLSelectElement>('#log-session').value;
  void renderConsole();
});

/** After picking a profile: its running game's console, else the news. */
function showProfileLog() {
  $('#console-live').classList.toggle('hidden', !selectedRunning());
  consoleView = 'live';
  void setPlayTab(selectedRunning() ? 'console' : 'news');
}

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

const MB = 1024 * 1024;
const fmtMb = (bytes: number) => (bytes / MB).toLocaleString(locale(), { maximumFractionDigits: bytes < 10 * MB ? 1 : 0 });
function fmtSpeed(bps: number): string {
  if (bps >= MB) return `${(bps / MB).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB/s`;
  return `${Math.round(bps / 1024)} KB/s`;
}

interface StageEvent { stage: string; done: number; total: number; bytes?: number; totalBytes?: number; speed?: number }

/** Launch progress goes to its own card, like installs: the Play bar stays uncluttered. */
const LAUNCH_CARD = 'launch';
function showStage(stage: StageEvent) {
  if (!taskCards.has(LAUNCH_CARD)) return;
  progressTaskCard({ id: LAUNCH_CARD, ...stage });
}

$('#play-profile').addEventListener('change', (e) => {
  store.settings.selectedProfileId = (e.target as HTMLSelectElement).value;
  api.saveSettings({ selectedProfileId: store.settings.selectedProfileId });
  // the profile's own account becomes the chosen one (Accounts tab and skin follow)
  const own = store.profiles.find((p) => p.id === store.settings.selectedProfileId)?.accountId;
  if (own && own !== store.settings.selectedAccountId && store.accounts.some((a) => a.id === own)) selectAccount(own);
  renderPlay();
  showProfileLog();
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
async function startGame(server?: string, world?: string, benchmark = false) {
  if (launching) return;
  if (selectedRunning()) return toast(t('Ten profil już działa.'), true);
  launching = true;
  if (!(await confirmModsOk($<HTMLSelectElement>('#play-profile').value))) {
    launching = false;
    return;
  }
  logs.set(pickedProfile(), []);
  consoleView = 'live';
  void setPlayTab('console');
  $('#console-live').classList.remove('hidden');
  $('#crash').classList.add('hidden');
  showView('play');
  renderPlay();
  const profile = store.profiles.find((p) => p.id === $<HTMLSelectElement>('#play-profile').value);
  startTaskCard(LAUNCH_CARD, t(benchmark ? 'Benchmark: {0}' : 'Uruchamianie: {0}', profile?.name ?? 'Minecraft'), profile ? profileIconUrl(profile) : 'logo.png');
  try {
    await api.launch($<HTMLSelectElement>('#play-profile').value, $<HTMLSelectElement>('#play-account').value, server, world, benchmark);
    finishTaskCard({ id: LAUNCH_CARD, ok: true, message: t('Gra uruchomiona') }, 3500);
  } catch (err) {
    finishTaskCard({ id: LAUNCH_CARD, ok: false, message: errorText(err) });
    logTo(profile?.id ?? pickedProfile(), `[SlashClient] ${errorText(err)}`);
  } finally {
    launching = false;
    renderPlay();
  }
}

$('#play-btn').addEventListener('click', () => (selectedRunning() ? void api.kill($<HTMLSelectElement>('#play-profile').value) : startGame()));

interface CrashAnalysis { title: string; details: string[]; fix?: string; crashReport?: string; missing?: string[]; profileId?: string }
let crashReport: string | undefined;
/** The mods the loader said are missing, and in which profile: "Zainstaluj brakujące" gets them. */
let crashMissing: { profileId: string; ids: string[] } | undefined;

api.on('game:crash', (a: CrashAnalysis) => {
  $('#crash-title').textContent = a.title;
  $('#crash-details').replaceChildren(...a.details.map((d) => el('li', { textContent: d })));
  $('#crash-fix').textContent = a.fix ?? '';
  crashReport = a.crashReport;
  $('#crash-report').classList.toggle('hidden', !a.crashReport);
  crashMissing = a.missing?.length && a.profileId ? { profileId: a.profileId, ids: a.missing } : undefined;
  $('#crash-install').classList.toggle('hidden', !crashMissing);
  $('#crash').classList.remove('hidden');
  showView('play');
});
$('#crash-close').addEventListener('click', () => $('#crash').classList.add('hidden'));
$('#crash-report').addEventListener('click', () => crashReport && api.revealFile(crashReport));
$('#crash-install').addEventListener('click', () => busy($<HTMLButtonElement>('#crash-install'), async () => {
  if (!crashMissing) return;
  const ok = await installMissing(crashMissing.profileId, crashMissing.ids);
  if (ok) $('#crash').classList.add('hidden');
}));
$('#crash-bug').addEventListener('click', () => busy($<HTMLButtonElement>('#crash-bug'), async () => {
  try {
    await api.reportBug(logText());
  } catch (err) {
    toast(errorText(err), true);
  }
}));
$('#crash-copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(logText());
  toast('Skopiowano log');
});

api.on('launch:stage', showStage);
api.on('game:log', ({ profileId, line }: { profileId: string; line: string }) => logTo(profileId, line));
// the first game download brings the textures for the 3D profile icons
api.on('game:exit', () => {
  if (!Object.keys(blockIcons).length) loadBlockIcons();
});
api.on('game:exit', ({ code, byUser, profileId }: { code: number | null; byUser: boolean; profileId: string }) => {
  if (profileId !== pickedProfile()) return;
  $('#console-live').classList.add('hidden');
  // a game that closed normally: back to the news (its console stays in the Console tab's history);
  // after a crash the console stays, under the crash's explanation
  if ((code === 0 || byUser) && !$('#log-wrap').classList.contains('hidden') && consoleView === 'live') {
    setTimeout(() => {
      if (!selectedRunning() && profileId === pickedProfile()) void setPlayTab('news');
    }, 1500);
  }
});
// the session just ended is saved: the picker lists it (and shows it in place of "now")
api.on('console:saved', ({ profileId }: { profileId: string }) => {
  if (profileId === pickedProfile() && !$('#log-wrap').classList.contains('hidden')) void renderSessions();
});
api.on('game:exit', ({ code, signal, byUser, profileId }: { code: number | null; signal: string | null; byUser: boolean; profileId: string }) => {
  if (code === 0 || byUser) return;
  // A signal without a user request means the OS killed the game (crash, code signature, out of memory).
  const reason = signal ? t('Gra została zabita przez system ({0})', signal) : t('Gra zakończyła się z kodem {0}', String(code));
  logTo(profileId, `[SlashClient] ${reason}.`);
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
    accountId: str('accountId') || undefined,
    syncOptions: data.get('syncOptions') === 'on',
    hud: data.get('hud') === 'on',
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

// deleting a profile: its own game folder (instances/<id>) may go to the system trash too; an imported one never
let deleting: string | undefined;
$('#profile-delete').addEventListener('click', async () => {
  if (!editingId) return;
  deleting = editingId;
  const profile = store.profiles.find((p) => p.id === deleting);
  $('#delete-name').textContent = profile ? `„${profile.name}”` : '';
  $<HTMLInputElement>('#delete-files').checked = false;
  $('#delete-files-row').classList.add('hidden');
  $('#delete-foreign').classList.add('hidden');
  $('#delete-size').textContent = '';
  $('#delete-modal').classList.remove('hidden');
  const info: { own: boolean; exists: boolean; sizeBytes: number } | undefined = await guard(() => api.profileFolderInfo(deleting!));
  if (!info || deleting !== profile?.id) return;
  $('#delete-files-row').classList.toggle('hidden', !info.own || !info.exists);
  $('#delete-foreign').classList.toggle('hidden', info.own || !info.exists);
  if (info.exists) $('#delete-size').textContent = fmtSize(info.sizeBytes);
});
const closeDelete = () => {
  deleting = undefined;
  $('#delete-modal').classList.add('hidden');
};
$('#delete-close').addEventListener('click', closeDelete);
$('#delete-cancel').addEventListener('click', closeDelete);
$('#delete-modal').addEventListener('click', (e) => e.target === e.currentTarget && closeDelete());
$('#delete-go').addEventListener('click', () => {
  const id = deleting;
  if (!id) return;
  const trash = $<HTMLInputElement>('#delete-files').checked;
  closeDelete();
  guard(async () => {
    await api.deleteProfile(id, trash);
    if (trash) toast(t('Folder gry jest w koszu'));
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

// ---------- exporting and importing a profile as one file (.mrpack) ----------

type PackPart = 'mods' | 'resourcepacks' | 'shaderpacks' | 'config' | 'options' | 'servers' | 'worlds' | 'settings';
const PACK_PARTS: { part: PackPart; icon: string; title: string; hint: string }[] = [
  { part: 'mods', icon: 'fa-puzzle-piece', title: 'Mody', hint: 'z Modrinth i CurseForge jako linki, pozostałe w pliku' },
  { part: 'resourcepacks', icon: 'fa-palette', title: 'Paczki zasobów', hint: 'tekstury i dźwięki' },
  { part: 'shaderpacks', icon: 'fa-sun', title: 'Shadery', hint: 'paczki shaderów' },
  { part: 'config', icon: 'fa-sliders', title: 'Konfiguracja modów', hint: 'folder config i skrypty' },
  { part: 'options', icon: 'fa-gamepad', title: 'Ustawienia gry', hint: 'grafika, dźwięk, sterowanie (options.txt)' },
  { part: 'servers', icon: 'fa-server', title: 'Lista serwerów', hint: 'servers.dat' },
  { part: 'worlds', icon: 'fa-earth-europe', title: 'Światy', hint: 'mogą zajmować dużo miejsca' },
  { part: 'settings', icon: 'fa-user-gear', title: 'Ustawienia profilu', hint: 'nazwa, ikona, pamięć RAM, flagi JVM, rozmiar okna' },
];

/** Checkbox rows for the parts of a pack; `counts` hides parts that have nothing and shows how many files each has. */
function packPartRows(list: HTMLElement, counts: Partial<Record<PackPart, number>>, chosen: Set<PackPart>, onChange: () => void) {
  const rows = PACK_PARTS.filter((p) => counts[p.part]).map((p): HTMLElement => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = chosen.has(p.part);
    const row = document.createElement('label');
    row.className = `join-choice perf-choice${box.checked ? ' selected' : ''}`;
    box.addEventListener('change', () => {
      if (box.checked) chosen.add(p.part);
      else chosen.delete(p.part);
      row.classList.toggle('selected', box.checked);
      onChange();
    });
    row.append(box, el('i', { className: `fa-solid ${p.icon} pack-part-icon` }), el('div', { className: 'grow' }, t(p.title), el('small', { textContent: t(p.hint) })));
    if (p.part !== 'settings') row.append(el('span', { className: 'import-src', textContent: String(counts[p.part]) }));
    return row;
  });
  list.replaceChildren(...(rows.length ? rows : [el('p', { className: 'muted', textContent: t('Ten profil jest pusty: w pliku będzie tylko wersja gry i loader.') })]));
}

let exportingId: string | undefined;
const exportChosen = new Set<PackPart>();

$('#profile-export').addEventListener('click', async () => {
  if (!editingId) return;
  exportingId = editingId;
  $('#export-parts').replaceChildren(...skeletons('project', 3));
  $('#export-modal').classList.remove('hidden');
  const counts: Record<PackPart, number> | undefined = await guard(() => api.exportPreview(exportingId!));
  if (!counts) return closeExport();
  // everything there is, but never the worlds unless the player asks
  exportChosen.clear();
  for (const p of PACK_PARTS) if (counts[p.part] && p.part !== 'worlds') exportChosen.add(p.part);
  const sync = () => ($<HTMLButtonElement>('#export-go').disabled = !exportChosen.size && Object.values(counts).some(Boolean));
  packPartRows($('#export-parts'), counts, exportChosen, sync);
  sync();
});
function closeExport() {
  $('#export-modal').classList.add('hidden');
}
$('#export-go').addEventListener('click', () => {
  const id = exportingId;
  closeExport();
  if (id) guard(() => api.exportProfile(id, [...exportChosen]));
});
$('#export-cancel').addEventListener('click', closeExport);
$('#export-close').addEventListener('click', closeExport);
$('#export-modal').addEventListener('click', (e) => e.target === e.currentTarget && closeExport());

interface PackSummary {
  kind: 'mrpack' | 'curseforge';
  name: string;
  gameVersion: string;
  loader: Profile['loader'];
  loaderVersion: string;
  parts: Partial<Record<PackPart, number>>;
  linked: number;
  bundled: number;
  settings?: unknown;
  manual: number;
}
let pickedPack: { key: string; summary: PackSummary } | undefined;
const importParts = new Set<PackPart>();

/** What a pack holds and which parts to take, before importing it (from a file or from a code). */
function showPackImport(picked: NonNullable<typeof pickedPack>, from?: string) {
  pickedPack = picked;
  const s = picked.summary;
  const loader = LOADER_NAMES[s.loader];
  $('#pack-import-meta').textContent = [
    `Minecraft ${s.gameVersion}`, loader ? `${loader} ${s.loaderVersion}`.trim() : '',
    s.kind === 'curseforge' ? t('modpack CurseForge') : s.settings ? t('profil SlashClient') : t('modpack Modrinth'),
  ].filter(Boolean).join(' · ');
  $<HTMLInputElement>('#pack-import-name').value = s.name;
  importParts.clear();
  for (const p of PACK_PARTS) if (s.parts[p.part]) importParts.add(p.part);
  const notes = [
    s.linked ? t('Do pobrania z Modrinth i CurseForge: {0}.', s.linked) : '',
    s.manual ? t('Do pobrania ręcznie z CurseForge: {0} (lista pojawi się w zakładce Mody).', s.manual) : '',
    from ?? '',
  ];
  if (s.kind === 'curseforge') {
    // a CurseForge zip installs whole, the way its author made it
    $('#pack-import-parts').replaceChildren();
    notes.push(t('Modpack CurseForge instaluje się w całości.'));
  } else packPartRows($('#pack-import-parts'), s.parts, importParts, () => {});
  $('#pack-import-note').textContent = notes.filter(Boolean).join(' ');
  $('#pack-import-modal').classList.remove('hidden');
  $<HTMLInputElement>('#pack-import-name').focus();
}
// a file or a code: see profileShare.ts
$('#profile-import').addEventListener('click', () => {
  $<HTMLInputElement>('#pack-source-code').value = '';
  $('#pack-source-modal').classList.remove('hidden');
  $<HTMLInputElement>('#pack-source-code').focus();
});
function closePackImport() {
  $('#pack-import-modal').classList.add('hidden');
  pickedPack = undefined;
}
$('#pack-import-go').addEventListener('click', async () => {
  const picked = pickedPack;
  if (!picked) return;
  const name = $<HTMLInputElement>('#pack-import-name').value.trim();
  const parts = [...importParts];
  closePackImport();
  const id: string | undefined = await guard(() => api.importProfilePack(picked.key, { name, parts }));
  if (id) {
    editingId = id;
    renderProfiles();
    offerManual(id);
  }
});
$('#pack-import-cancel').addEventListener('click', closePackImport);
$('#pack-import-close').addEventListener('click', closePackImport);
$('#pack-import-modal').addEventListener('click', (e) => e.target === e.currentTarget && closePackImport());

initProfileSharing({ api, $, el, guard, toast, skeletons, packPartRows, showPackImport, editing: () => editingId });
// profiles on the account and moving to another Minecraft version: see cloudProfiles.ts and versionMove.ts
const cloudCard = initCloudProfiles({
  api, $, guard, toast, busy, editing: () => editingId,
  profileName: (id) => store.profiles.find((p) => p.id === id)?.name,
  openProfile: (id) => {
    openProfilePane('settings', id);
    renderProfiles();
  },
});
const moveCard = initVersionMove({ api, $, guard, toast, busy, editing: () => editingId, versions: () => versions, resolve: resolvedVersion, projectIcon });

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

$('#settings-form').addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.name === 'defaultMemoryMb') $('#default-memory-value').textContent = `${target.value} MB`;
});
$('#settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  await guard(() =>
    api.saveSettings({
      closeOnLaunch: (form.elements.namedItem('closeOnLaunch') as HTMLInputElement).checked,
      defaultMemoryMb: Number((form.elements.namedItem('defaultMemoryMb') as HTMLInputElement).value),
      discordEnabled: (form.elements.namedItem('discordEnabled') as HTMLInputElement).checked,
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
  // the cape choice in Accounts unlocks (or locks) with the SlashClient account
  accountChanged: () => {
    void renderSlashCapes();
    // "Zaktualizowaliśmy regulamin": important changes not seen yet, once
    void checkLegalNotices(api, toast);
  },
  hasMinecraft: () => store.accounts.some((a) => a.type === 'msa'),
  showAchievements: (id, name) => achievements.showFriend(id, name),
  gameRunning: () => (store.runningProfiles ?? []).length > 0,
  // a friend's server is not on the list: the join window gets what we know about it
  inviteTarget: async () => {
    // on a server now: that one; otherwise the server the chosen profile played last
    const now: { kind: string; server?: string; version?: string } | undefined = await api.socialActivity();
    if (now?.kind === 'server' && now.server) return { server: now.server, version: now.version?.split(' · ')[0] };
    const profile = store.profiles.find((p) => p.id === store.settings.selectedProfileId);
    if (profile?.lastTarget?.kind === 'server') return { server: profile.lastTarget.address, version: resolvedVersion(profile.versionId) };
    return undefined;
  },
  join: (address, version) => openJoin({
    id: '', name: address, ip: address, description: '', motdHtml: [], motdClean: [], modes: [], versions: version ? [version] : [],
    votes: 0, online: true, playersOnline: 0, playersMax: 0, hasIcon: false, promoted: false, featured: false,
  }),
});
document.querySelector('.nav[data-view="friends"]')?.addEventListener('click', () => friends.show());

// ---------- achievements ----------

const achievements = createAchievements($('#achievements-root'), {
  api, toast, errorText, badge: $('#sparks-badge'),
  // the shop shows the cosmetics as the cosmetics menu does
  picture: (slot, id) => cosmeticPicture(slot as Slot, id),
  slotName: (slot) => t(SLOTS.find(([s]) => s === slot)?.[1] ?? slot),
});
document.querySelector('.nav[data-view="achievements"]')?.addEventListener('click', () => achievements.show());

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
/** A colour from the server list's MOTD markup, only in the forms it uses. */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i;

function motdFromHtml(html: string): MotdSegment[] {
  // The page's CSP blocks style attributes even in a parsed document (and logs every one),
  // so they are renamed before parsing and read as plain text.
  const doc = new DOMParser().parseFromString(`<div>${html.replace(/\sstyle=/gi, ' data-style=')}</div>`, 'text/html');
  const out: MotdSegment[] = [];
  doc.body.querySelectorAll('span').forEach((span) => {
    if (span.querySelector('span')) return;
    const style = span.getAttribute('data-style') ?? '';
    const prop = (name: string) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(style)?.[1].trim().toLowerCase();
    const color = prop('color');
    out.push({ text: span.textContent ?? '', color: color && SAFE_COLOR.test(color) ? color : undefined, bold: prop('font-weight') === 'bold', italic: prop('font-style') === 'italic' });
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
  if (selectedRunning()) {
    // a game with our HUD switches servers by itself
    api.joinInGame(s.ip).then((ok: boolean) => toast(ok ? t('Gra łączy się z {0}.', s.ip) : t('Gra już działa.'), !ok));
    return;
  }
  if (launching) return toast(t('Gra już działa.'), true);
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
      const result = await api.pingServer(s.ip);
      pings.set(s.ip, 'offline' in result ? { at: Date.now(), error: result.offline } : { at: Date.now(), result });
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

// ---------- mods, resource packs, shaders, modpacks (Modrinth, CurseForge) ----------

type Source = 'modrinth' | 'curseforge';
interface ProjectHit { id: string; slug: string; title: string; description: string; author: string; iconUrl?: string; downloads: number; categories: string[]; pageUrl?: string; manualOnly?: boolean }
interface InstalledItem { type: string; filename: string; enabled: boolean; title: string; projectId?: string; versionId?: string; versionNumber?: string; iconUrl?: string; source?: 'curseforge' }
interface ProjectVersion { id: string; projectId: string; name: string; versionNumber: string; type: 'release' | 'beta' | 'alpha'; date: string; gameVersions: string[]; loaders: string[]; downloads: number; manualUrl?: string }
interface UpdateInfo { type: string; filename: string; projectId: string; title: string; currentVersion: string; latestVersionId: string; latestVersion: string; source?: 'curseforge' }
interface ManualFile { title: string; fileName: string; url: string; folder: string; sha1?: string; size?: number }

/** Modrinth or CurseForge: the same page searches either. */
let contentSource: Source = 'modrinth';
/** The SlashClient server has no CurseForge key: CurseForge is shown as unavailable. */
let curseforgeUnavailable = false;

// ---------- version picker ----------

let resolvePicker: ((v: ProjectVersion | undefined) => void) | undefined;
let pickerArgs: { projectId: string; type: string; currentVersionId?: string; profileId: string; source?: Source } | undefined;

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
  const versions: ProjectVersion[] = (await guard(() => api.contentVersions(pickerArgs!.profileId, pickerArgs!.projectId, pickerArgs!.type, onlyCompatible, pickerArgs!.source))) ?? [];
  box.replaceChildren(...appear(versions.slice(0, 60).map((v) => {
    const current = v.id === pickerArgs?.currentVersionId;
    let choose: HTMLElement;
    if (v.manualUrl && !current) {
      // the author keeps this file on CurseForge: the player downloads it from the file's page
      choose = el('a', { className: 'button-link', href: v.manualUrl, target: '_blank', title: t('Autor pozwala pobrać ten plik tylko ze strony CurseForge') },
        el('i', { className: 'fa-solid fa-arrow-up-right-from-square' }), t('Pobierz ręcznie'));
    } else {
      choose = el('button', { type: 'button', className: current ? '' : 'primary', disabled: current, textContent: current ? t('Zainstalowana') : t('Wybierz') });
      choose.addEventListener('click', () => closePicker(v));
    }
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
function chooseVersion(args: { title: string; projectId: string; type: string; currentVersionId?: string; profileId: string; source?: Source }): Promise<ProjectVersion | undefined> {
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

/** Asks Modrinth (and CurseForge, for what came from there) about newer versions of everything in the profile (cached for 10 minutes). */
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

async function applyUpdates(items: { type: string; projectId: string; latestVersionId: string; title: string; source?: 'curseforge' }[]) {
  if (!items.length) return;
  try {
    await api.updateContent(contentProfileId(), items);
  } catch {
    // reported in the task panel
  }
  updates = updates.filter((u) => !items.some((i) => i.projectId === u.projectId && i.source === u.source));
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

/** The browser is on Odkrywaj (else in a profile's "Mody i zasoby"). */
let discovering = false;
const contentProfileId = () => $<HTMLSelectElement>(discovering ? '#discover-profile' : '#content-profile').value;
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

/** Installs the missing mods (Modrinth, then CurseForge); true when none is left missing. */
async function installMissing(profileId: string, ids: string[]): Promise<boolean> {
  const res: { installed: string[]; notFound: string[] } | undefined = await guard(() => api.fixMissingMods(profileId, [...new Set(ids)]));
  if (!res) return false;
  if (res.installed.length) toast(t('Zainstalowano: {0}', res.installed.join(', ')));
  if (res.notFound.length) toast(t('Nie znaleziono na Modrinth ani CurseForge: {0}. Poszukaj ich ręcznie.', res.notFound.join(', ')), true);
  if (contentProfileId() === profileId) await refreshInstalled(true);
  return !res.notFound.length;
}

$('#mod-fix').addEventListener('click', () => {
  const profileId = contentProfileId();
  const ids = modProblems.filter((p) => p.kind === 'missing').map((p) => p.missingId!);
  busy($<HTMLButtonElement>('#mod-fix'), async () => {
    await installMissing(profileId, ids);
  });
});

/**
 * Before starting: real errors get a chance to stop the launch, warnings don't. Missing mods can
 * be installed right there, and the game then starts with them.
 */
async function confirmModsOk(profileId: string): Promise<boolean> {
  let problems: ModProblem[] = (await api.checkMods(profileId).catch(() => [])) ?? [];
  let errors = problems.filter((p) => p.severity === 'error');
  if (!errors.length) return true;
  const missing = errors.filter((p) => p.kind === 'missing' && p.missingId).map((p) => p.missingId!);
  const answer = await new Promise<'fix' | 'run' | 'cancel'>((resolve) => {
    let picked: 'fix' | 'run' | 'cancel' = 'cancel';
    const list = el('ul', { className: 'mod-launch-problems' }, ...errors.slice(0, 6).map((p) => el('li', { textContent: p.message })),
      ...(errors.length > 6 ? [el('li', { textContent: t('…i {0} więcej', errors.length - 6) })] : []));
    const run = el('button', { type: 'button' }, t('Uruchom mimo to'));
    const fix = el('button', { type: 'button', className: 'primary' }, el('i', { className: 'fa-solid fa-wand-magic-sparkles' }), ` ${t('Zainstaluj brakujące i uruchom')}`);
    const close = modalWindow(t('Gra prawdopodobnie się nie uruchomi'), [list, el('p', { className: 'muted', textContent: missing.length ? t('Brakuje wymaganych modów. Launcher może je doinstalować z Modrinth albo CurseForge.') : t('Szczegóły i naprawa: Profile → Mody i zasoby → Zainstalowane.') })],
      missing.length ? [run, fix] : [run], () => resolve(picked), 'fr-group-modal mod-launch-check');
    run.addEventListener('click', () => { picked = 'run'; close(); });
    fix.addEventListener('click', () => { picked = 'fix'; close(); });
  });
  if (answer === 'cancel') return false;
  if (answer === 'run') return true;
  await installMissing(profileId, missing);
  // what is still wrong after installing asks once more
  problems = (await api.checkMods(profileId).catch(() => [])) ?? [];
  errors = problems.filter((p) => p.severity === 'error');
  if (!errors.length) return true;
  return confirmDialog({ title: t('Nadal są problemy z modami'), body: [el('ul', {}, ...errors.slice(0, 6).map((p) => el('li', { textContent: p.message })))], ok: t('Uruchom mimo to') });
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

interface PerfPlanItem { slug: string; projectId?: string; title: string; why: string; iconUrl?: string; installed: boolean }
let perfPlan: PerfPlanItem[] = [];
const perfChosen = new Set<string>();

$('#perf-open').addEventListener('click', async () => {
  const profileId = contentProfileId();
  const profile = store.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  if (profile.loader === 'vanilla') return toast(t('Mody wydajności wymagają mod loadera. Ustaw Fabric w ustawieniach profilu.'), true);
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
  if (contentType === 'mod' && profile?.loader === 'vanilla') text = 'Ten profil nie ma mod loadera. Ustaw Fabric, NeoForge lub Forge w ustawieniach profilu, żeby instalować mody.';
  else if (contentType === 'shader') text = profile?.loader === 'fabric' || profile?.loader === 'quilt'
    ? 'Shadery wymagają moda Iris. Znajdziesz go wyżej, w „Mody”.'
    : 'Shadery wymagają moda Iris (Fabric) albo Oculus (Forge/NeoForge).';
  else if (contentType === 'modpack') text = 'Modpack tworzy nowy profil z własnym folderem gry.';
  else if (contentType === 'datapack') text = 'Datapack instaluje się do wybranego świata. Zainstalowane datapacki znajdziesz w „Światy i zrzuty”, przy świecie.';
  box.textContent = text;
  box.classList.toggle('hidden', !text);
}

/** Pictures the page may show (see the Content-Security-Policy in index.html). */
const isProjectIcon = (url: string) => url.startsWith('https://cdn.modrinth.com/') || url.startsWith('https://media.forgecdn.net/');

function projectIcon(url?: string) {
  const img = el('img', { alt: '', loading: 'lazy' });
  img.src = url && isProjectIcon(url) ? url : 'logo.png';
  return img;
}

/** Whether an installed item is this search hit (the same project on the same site). */
const sameProject = (i: InstalledItem, hit: ProjectHit) => i.projectId === hit.id && (i.source ?? 'modrinth') === contentSource;

function hitCard(hit: ProjectHit): HTMLElement {
  const isInstalled = installed.some((i) => sameProject(i, hit));
  const btn = el('button', { className: isInstalled ? '' : 'primary', disabled: installing.has(hit.id) },
    installing.has(hit.id) ? el('span', { className: 'spinner' }) : el('i', { className: isInstalled ? 'fa-solid fa-check' : 'fa-solid fa-download' }),
    installing.has(hit.id) ? 'Instaluję…' : isInstalled ? 'Zainstalowany' : contentType === 'modpack' ? 'Utwórz profil' : 'Instaluj');
  btn.addEventListener('click', () => installHit(hit));
  const pick = el('button', { type: 'button', className: 'icon-btn', title: t('Wybierz wersję') }, el('i', { className: 'fa-solid fa-code-branch' }));
  pick.addEventListener('click', async () => {
    const v = await chooseVersion({ title: hit.title, projectId: hit.id, type: contentType, profileId: contentProfileId(), source: contentSource });
    if (v) installHit(hit, v.id);
  });
  const extra: HTMLElement[] = [];
  const preview: HTMLElement[] = [];
  // a resource pack's textures next to the game's, before installing it (packPreview.ts)
  if (contentType === 'resourcepack' && !hit.manualOnly) {
    const eye = el('button', { type: 'button', className: 'icon-btn', title: t('Podgląd tekstur') }, el('i', { className: 'fa-solid fa-eye' }));
    eye.addEventListener('click', () => openPackPreview({ api, profileId: contentProfileId, source: () => contentSource, install: () => installHit(hit) }, hit));
    preview.push(eye);
  }
  if (hit.manualOnly) extra.push(el('span', { className: 'tag beta', textContent: t('Pobieranie tylko ze strony CurseForge'), title: t('Autor nie pozwala pobierać plików poza CurseForge: launcher pokaże link do strony pliku') }));
  return el('div', { className: 'project' },
    projectIcon(hit.iconUrl),
    el('div', { className: 'project-main' },
      el('b', {}, hit.title, el('small', { textContent: t('od {0}', hit.author) })),
      el('p', { textContent: hit.description, title: hit.description }),
      el('div', { className: 'project-meta' },
        el('span', {}, el('i', { className: 'fa-solid fa-download' }), ` ${fmtCount(hit.downloads)}`),
        el('span', { textContent: hit.categories.slice(0, 4).join(' · ') }), ...extra)),
    el('div', { className: 'project-actions' }, btn, ...preview, pick));
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
      const v = await chooseVersion({ title: item.title, projectId: item.projectId!, type: item.type, currentVersionId: item.versionId, profileId: contentProfileId(), source: item.source ?? 'modrinth' });
      if (v) applyUpdates([{ type: item.type, projectId: item.projectId!, latestVersionId: v.id, title: item.title, source: item.source }]);
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
  // datapacks live in worlds (listed in Worlds), so like modpacks they only have the browser; they come from Modrinth only
  const browseOnly = isPack || contentType === 'datapack';
  $('#content-source').classList.toggle('hidden', contentType === 'datapack');
  // a modpack makes a profile of its own: on Odkrywaj there is no profile to pick for it
  $('#discover-target').classList.toggle('hidden', isPack);
  $('#modpack-import').classList.toggle('hidden', !isPack);
  $('#perf-open').classList.toggle('hidden', contentType !== 'mod');
  renderModCheck();
  $('#content-tab').classList.toggle('hidden', browseOnly);
  $('#content-search-bar').classList.toggle('hidden', contentTab === 'installed' && !browseOnly);
  const forType = installed.filter((i) => i.type === contentType);
  $('#installed-count').textContent = forType.length ? `(${forType.length})` : '';
  const list = $('#content-list');
  const from = animateFrom;
  animateFrom = undefined;
  renderUpdatesBar(contentTab === 'installed' && !browseOnly ? forType : []);
  if (contentTab === 'installed' && !browseOnly) {
    const query = $<HTMLInputElement>('#installed-search').value;
    const shown = forType.filter((i) => matchesInstalled(i, query));
    const cards = shown.map(installedCard);
    list.replaceChildren(...(from !== undefined ? appear(cards) : cards));
    if (!forType.length) list.append(el('p', { className: 'muted appear', textContent: 'Nic tu jeszcze nie ma.' }));
    else if (!shown.length) list.append(el('p', { className: 'muted appear', textContent: t('Nic nie pasuje do „{0}”.', query.trim()) }));
    $('#content-more').classList.add('hidden');
    return;
  }
  if (contentSource === 'curseforge' && contentType !== 'datapack' && curseforgeUnavailable && !contentLoading) {
    list.replaceChildren(el('div', { className: 'notice content-unavailable appear' },
      el('i', { className: 'fa-solid fa-plug-circle-xmark' }), ' ',
      t('CurseForge jest teraz niedostępny w SlashClient (serwer nie ma klucza API CurseForge). Modrinth działa normalnie.')));
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

/** Folds case and Polish letters, so "zrodla" finds "Źródła". */
function folded(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

/** The installed-tab search: every word must be in the name, the file name or the version. */
function matchesInstalled(item: { title: string; filename: string; versionNumber?: string }, query: string): boolean {
  const hay = folded(`${item.title} ${item.filename} ${item.versionNumber ?? ''}`);
  return folded(query).split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

async function refreshInstalled(animate = false) {
  if (!contentProfileId()) return;
  installed = (await guard(() => api.listContent(contentProfileId()))) ?? [];
  if (animate) animateFrom = 0;
  renderContent();
  refreshManual();
  if (contentType === 'mod' && contentTab === 'installed') runModCheck();
}

let searchRequest = 0;
async function searchContent(append = false) {
  const request = ++searchRequest;
  contentLoading = true;
  if (!append) contentHits = [];
  renderContent();
  const source = contentType === 'datapack' ? 'modrinth' : contentSource;
  const res: { hits: ProjectHit[]; total: number; unavailable?: boolean } | undefined =
    await guard(() => api.searchContent(contentProfileId(), $<HTMLInputElement>('#content-search').value.trim(), contentType, append ? contentHits.length : 0, source));
  if (request !== searchRequest) return;
  contentLoading = false;
  if (source === 'curseforge') curseforgeUnavailable = !!res?.unavailable;
  if (!res) return renderContent();
  animateFrom = append ? contentHits.length : 0;
  contentHits = append ? [...contentHits, ...res.hits] : res.hits;
  contentTotal = res.total;
  renderContent();
}

async function installHit(hit: ProjectHit, versionId?: string) {
  // a datapack goes into one world: ask which before anything starts
  const world = contentType === 'datapack' ? await profileFiles.pickWorld(contentProfileId(), hit.title) : undefined;
  if (contentType === 'datapack' && !world) return;
  installing.add(hit.id);
  renderContent();
  try {
    // progress and the result are shown in the task panel (see the task section)
    if (contentType === 'modpack') offerManual(await api.installModpack(hit.id, hit.title, hit.iconUrl, versionId, contentSource));
    else if (world) await api.installDatapack(contentProfileId(), world, hit.id, hit.title, hit.iconUrl, versionId);
    else {
      const res: { manual: ManualFile[] } = await api.installContent(contentProfileId(), hit.id, contentType, hit.title, hit.iconUrl, versionId, contentSource);
      await refreshInstalled();
      if (res.manual.length) await openManual(contentProfileId());
    }
  } catch {
    // already reported in the task panel
  } finally {
    installing.delete(hit.id);
    renderContent();
  }
}

/** Mods and Worlds work on the profile picked in Profiles; their (hidden) pickers follow it. */
function renderContentProfiles() {
  for (const id of ['#content-profile', '#worlds-profile']) {
    const sel = $<HTMLSelectElement>(id);
    fillSelect(sel, store.profiles.map((p) => ({ value: p.id, label: p.name })), editingId ?? store.settings.selectedProfileId ?? '');
  }
}

/** Switches between Modrinth and CurseForge (the page's texts and the search follow). */
function setContentSource(source: Source) {
  contentSource = source;
  document.querySelectorAll<HTMLButtonElement>('#content-source button').forEach((x) => x.classList.toggle('active', x.dataset.source === source));
  const site = $<HTMLAnchorElement>('#content-site');
  site.href = source === 'curseforge' ? 'https://www.curseforge.com/minecraft' : 'https://modrinth.com';
  site.textContent = source === 'curseforge' ? 'CurseForge' : 'Modrinth';
  $<HTMLInputElement>('#content-search').placeholder = source === 'curseforge' ? t('Szukaj na CurseForge…') : t('Szukaj na Modrinth…');
  contentHits = [];
  renderContent();
  searchContent();
}
document.querySelectorAll<HTMLButtonElement>('#content-source button').forEach((b) =>
  b.addEventListener('click', () => b.dataset.source !== contentSource && setContentSource(b.dataset.source as Source)));

// ---------- files to download by hand (CurseForge authors who keep them on their site) ----------

let manualFiles: ManualFile[] = [];

async function refreshManual() {
  const profileId = contentProfileId();
  if (!profileId) return;
  manualFiles = (await api.manualFiles(profileId).catch(() => [])) ?? [];
  const bar = $('#manual-bar');
  bar.classList.toggle('hidden', !manualFiles.length);
  $('#manual-text').replaceChildren(el('i', { className: 'fa-solid fa-hand-pointer' }),
    t('Plików do pobrania ręcznie ze strony CurseForge: {0}', manualFiles.length));
}

/**
 * The "blocked files" dialog, like Prism Launcher's: the files with their download links and
 * SHA-1, found live in the watched folders (or dropped on the dialog); OK copies them into the profile.
 */
type ManualStatus = { profileId: string; files: (ManualFile & { foundAt?: string })[]; folders: string[] };
let manualState: ManualStatus | undefined;
/** Shown under the list after a drop that matched nothing. */
let manualHint = '';

function setManualTab(tab: 'files' | 'folders') {
  document.querySelectorAll<HTMLButtonElement>('#manual-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#manual-pane-files').classList.toggle('hidden', tab !== 'files');
  $('#manual-pane-folders').classList.toggle('hidden', tab !== 'folders');
}

function renderManual() {
  const s = manualState;
  if (!s) return;
  $('#manual-list').replaceChildren(...s.files.map((f) => {
    const link = el('a', { className: 'manual-link', href: f.url, target: '_blank', textContent: f.url });
    const folder = el('button', { type: 'button' }, el('i', { className: 'fa-regular fa-folder-open' }), f.folder);
    folder.title = t('Otwórz folder {0} tego profilu', f.folder);
    folder.addEventListener('click', () => guard(() => api.openProfileFolder(s.profileId, f.folder)));
    const state = f.foundAt
      ? el('div', { className: 'manual-state' }, el('i', { className: 'fa-solid fa-circle-check' }), t('Znaleziono w {0}', f.foundAt))
      : el('div', { className: 'manual-state' }, el('i', { className: 'fa-regular fa-hourglass-half' }), t('Jeszcze nie znaleziono'));
    return el('div', { className: `version-row manual-row${f.foundAt ? ' found' : ''}` },
      el('div', {},
        el('b', { textContent: f.title }),
        el('div', { className: 'version-meta' }, el('span', { textContent: f.fileName }), el('span', { textContent: `→ ${f.folder}/` })),
        link,
        el('div', { className: 'manual-hash', textContent: f.sha1 ? `SHA-1: ${f.sha1}` : t('Bez sumy SHA-1: plik zostanie rozpoznany po nazwie') }),
        state),
      el('div', { className: 'actions' }, folder));
  }));
  const found = s.files.filter((f) => f.foundAt).length;
  const all = found === s.files.length;
  const summary = $('#manual-summary');
  summary.classList.toggle('done', all && s.files.length > 0);
  if (!s.files.length) summary.replaceChildren(t('Wszystkie pliki są na miejscu.'));
  else if (all) summary.replaceChildren(el('i', { className: 'fa-solid fa-circle-check' }), t('Wszystkie modyfikacje zostały znalezione'));
  else summary.replaceChildren(t('Znaleziono {0} z {1}. Brakujące pliki pobierz ze strony CurseForge.', found, s.files.length));
  if (manualHint) summary.append(el('div', { className: 'muted', textContent: manualHint }));
  $<HTMLButtonElement>('#manual-open-missing').disabled = all;

  $('#manual-folders').replaceChildren(...s.folders.map((dir) => {
    const remove = el('button', { type: 'button', className: 'icon-btn', title: t('Przestań obserwować') }, el('i', { className: 'fa-solid fa-trash' }));
    remove.addEventListener('click', () => guard(async () => {
      await api.manualRemoveFolder(dir);
      if (manualState) manualState = { ...manualState, folders: await api.manualFolders() };
      renderManual();
    }));
    return el('div', { className: 'version-row' }, el('div', { className: 'manual-folder' }, el('i', { className: 'fa-regular fa-folder' }), ` ${dir}`), el('div', { className: 'actions' }, remove));
  }));
  if (!s.folders.length) $('#manual-folders').replaceChildren(el('p', { className: 'muted', textContent: t('Żaden folder nie jest obserwowany: przeciągnij pobrane pliki na okno albo dodaj folder.') }));
}

/** Opens the dialog for a profile's missing files (watching its folders until it closes). */
async function openManual(profileId: string) {
  manualHint = '';
  setManualTab('files');
  const status: ManualStatus | undefined = await guard(() => api.manualOpen(profileId));
  if (!status?.files.length) {
    api.manualClose();
    return refreshManual();
  }
  manualState = status;
  renderManual();
  $('#manual-modal').classList.remove('hidden');
}
/** After installing a pack or a project: the dialog when its authors keep files on CurseForge. */
async function offerManual(profileId?: string) {
  if (!profileId) return;
  const files: ManualFile[] = (await api.manualFiles(profileId).catch(() => [])) ?? [];
  if (files.length) await openManual(profileId);
}
function closeManual() {
  $('#manual-modal').classList.add('hidden');
  manualState = undefined;
  api.manualClose();
  refreshManual();
}

api.on('manual:status', (s: ManualStatus) => {
  if (!manualState || s.profileId !== manualState.profileId) return;
  manualState = s;
  renderManual();
});
document.querySelectorAll<HTMLButtonElement>('#manual-tabs button').forEach((b) => b.addEventListener('click', () => setManualTab(b.dataset.tab as 'files' | 'folders')));
$('#manual-show').addEventListener('click', () => openManual(contentProfileId()));
$('#manual-close').addEventListener('click', closeManual);
$('#manual-cancel').addEventListener('click', closeManual);
$('#manual-modal').addEventListener('click', (e) => e.target === e.currentTarget && closeManual());
$('#manual-open-missing').addEventListener('click', () => guard(() => api.manualOpenMissing()));
$('#manual-add-folder').addEventListener('click', () => guard(async () => {
  const folders: string[] = await api.manualAddFolder();
  if (manualState) manualState = { ...manualState, folders };
  renderManual();
}));
$('#manual-ok').addEventListener('click', () => guard(async () => {
  const res: { copied: number; left: number } = await api.manualAccept();
  $('#manual-modal').classList.add('hidden');
  manualState = undefined;
  if (res.copied) toast(res.left ? t('Skopiowano do profilu: {0}. Brakuje jeszcze: {1}.', res.copied, res.left) : t('Skopiowano do profilu: {0}. Wszystkie pliki są na miejscu.', res.copied));
  await refreshInstalled();
  refreshManual();
}));
$('#manual-dismiss').addEventListener('click', () => guard(async () => {
  const profileId = manualState?.profileId ?? contentProfileId();
  closeManual();
  await api.dismissManualFiles(profileId);
  refreshManual();
}));
// downloaded files dropped anywhere on the dialog
{
  const box = $('#manual-modal');
  let depth = 0;
  const overlay = (on: boolean) => $('#manual-drop').classList.toggle('hidden', !on);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  box.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    overlay(true);
  });
  box.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  });
  box.addEventListener('dragleave', () => {
    if (--depth <= 0) (depth = 0), overlay(false);
  });
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    overlay(false);
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length || !manualState) return;
    const before = manualState.files.filter((f) => f.foundAt).length;
    guard(async () => {
      const status: ManualStatus | undefined = await api.manualDrop(files);
      if (!status) return;
      manualState = status;
      const after = status.files.filter((f) => f.foundAt).length;
      manualHint = after > before ? '' : t('Upuszczone pliki nie pasują do żadnego z brakujących (inna suma SHA-1 lub nazwa).');
      renderManual();
    });
  });
}
// the player comes back from the browser with the file in place: the list shrinks
window.addEventListener('focus', () => manualFiles.length && refreshManual());

document.querySelectorAll<HTMLButtonElement>('#content-type button').forEach((b) =>
  b.addEventListener('click', () => {
    contentType = b.dataset.type!;
    document.querySelectorAll('#content-type button').forEach((x) => x.classList.toggle('active', x === b));
    $<HTMLInputElement>('#installed-search').value = '';
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
$('#installed-search').addEventListener('input', () => renderContent());
$('#content-more').addEventListener('click', () => searchContent(true));
$('#content-profile').addEventListener('change', () => {
  refreshInstalled(true);
  searchContent();
});
$('#modpack-import').addEventListener('click', () => busy($<HTMLButtonElement>('#modpack-import'), () => api.importModpack().then(offerManual, () => undefined), 'Importuję…'));
/** The Mods pane opened, or its profile changed: installed list and search for that profile. */
function openContentPane(profileChanged: boolean) {
  renderContentProfiles();
  refreshInstalled(true);
  if (profileChanged || !contentHits.length) searchContent();
}

// ---------- Odkrywaj: the same browser on a page of its own, for any profile ----------

const contentPane = document.querySelector<HTMLElement>('.profile-pane[data-pane="content"]')!;
const contentHome = contentPane.parentElement!;
const contentAfter = contentPane.nextSibling;

function openDiscover() {
  const sel = $<HTMLSelectElement>('#discover-profile');
  fillSelect(sel, store.profiles.map((p) => ({ value: p.id, label: p.name })), sel.value || store.settings.selectedProfileId || store.profiles[0]?.id || '');
  if (!discovering) {
    discovering = true;
    $('#discover-body').append(contentPane);
    contentPane.classList.remove('hidden');
  }
  openContentPane(true);
}

/** Back in Profiles: the browser goes home, shown only when its pane is the open one. */
function closeDiscover() {
  if (!discovering) return;
  discovering = false;
  contentHome.insertBefore(contentPane, contentAfter);
  contentPane.classList.toggle('hidden', profilePane !== 'content');
  if (profilePane === 'content') openContentPane(true);
}

document.querySelectorAll<HTMLButtonElement>('.nav').forEach((b) =>
  b.addEventListener('click', () => (b.dataset.view === 'discover' ? openDiscover() : closeDiscover())));
$('#discover-profile').addEventListener('change', () => openContentPane(true));

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

const profileFiles = createProfileFiles({
  api, toast, guard, busy, fmtSize, fmtDate, projectIcon,
  worldIcon: (w) => {
    const img = el('img', { className: 'world-icon', alt: '' });
    img.src = w.icon ? media(w.icon) : 'logo.png';
    return img;
  },
  profileChanged: async () => {
    store = await api.getStore();
    render();
  },
  browseDatapacks: (profileId) => {
    openProfilePane('content', profileId);
    document.querySelector<HTMLButtonElement>('#content-type button[data-type="datapack"]')?.click();
  },
});
$('#snapshot-make').addEventListener('click', () => editingId && profileFiles.makeSnapshot(editingId, $<HTMLButtonElement>('#snapshot-make'), $('#snapshot-list')));
// a modpack update takes a snapshot: the list shows it once the update is done
api.on('task:done', (d: TaskDone) => d.profileId && d.profileId === editingId && profileFiles.renderSnapshots(d.profileId, $('#snapshot-list')));
$('#world-import').addEventListener('click', async () => {
  if (await profileFiles.importWorld(worldsProfileId(), $<HTMLButtonElement>('#world-import'))) renderWorlds();
});

// trimming clips and sharing screenshots and clips by link (mediaTools.ts)
const mediaTools = createMediaTools({ api, guard, toast, refresh: () => renderWorlds() });
const myLinksButton = () => {
  const b = el('button', { type: 'button', className: 'media-links-open' }, el('i', { className: 'fa-solid fa-link' }), t(' Moje linki'));
  b.addEventListener('click', () => mediaTools.openMine());
  return b;
};

async function renderWorlds() {
  const box = $('#worlds-content');
  const profileId = worldsProfileId();
  if (!profileId) return;
  $('#world-import').classList.toggle('hidden', worldsTab !== 'worlds');
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
      const bench = el('button', { className: 'icon-btn', title: t('Benchmark w tym świecie') }, el('i', { className: 'fa-solid fa-gauge-high' }));
      bench.setAttribute('aria-label', t('Benchmark w tym świecie'));
      bench.addEventListener('click', () => {
        store.settings.selectedProfileId = profileId;
        renderPlay();
        startGame(undefined, w.folder, true);
      });
      const backup = el('button', {}, el('i', { className: 'fa-solid fa-box-archive' }), 'Kopia');
      backup.addEventListener('click', async () => {
        const b = await busy(backup, () => guard(() => api.backupWorld(profileId, w.folder)), 'Zapisuję…');
        if (b) toast(t('Zapisano kopię „{0}” ({1})', w.name, fmtSize(b.sizeBytes)));
      });
      const card = el('div', { className: 'project' }, icon,
        el('div', { className: 'project-main' },
          el('b', {}, w.name, el('small', { textContent: w.folder !== w.name ? w.folder : '' })),
          el('div', { className: 'project-meta' },
            el('span', { textContent: w.hardcore ? 'Hardcore' : w.gameMode }),
            el('span', { textContent: w.version ? t('Minecraft {0}', w.version) : '' }),
            el('span', { textContent: fmtSize(w.sizeBytes) }),
            el('span', { textContent: t('Grano: {0}', fmtDate(w.lastPlayed)) }))),
        el('div', { className: 'project-actions' }, play, bench, backup));
      card.lastElementChild!.append(...profileFiles.worldButtons(profileId, w, card));
      return card;
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
  } else if (worldsTab === 'clips') {
    const clips: Screenshot[] = (await guard(() => api.listClips(profileId))) ?? [];
    box.replaceChildren(el('div', { className: 'project-list' }, ...clips.map((c) => {
      const play = el('button', { className: 'primary' }, el('i', { className: 'fa-solid fa-play' }), t(' Odtwórz'));
      play.addEventListener('click', () => api.openFile(c.file));
      return el('div', { className: 'project' },
        el('div', { className: 'clip-icon' }, el('i', { className: 'fa-solid fa-film' })),
        el('div', { className: 'project-main' },
          el('b', { textContent: c.name.replace(/\.(avi|mp4)$/i, '') }),
          el('div', { className: 'project-meta' }, el('span', { textContent: fmtDate(c.createdAt) }), el('span', { textContent: fmtSize(c.sizeBytes) }))),
        el('div', { className: 'project-actions' }, play,
          // only the game's own clips (MJPEG .avi) can be cut and shared
          ...(/\.avi$/i.test(c.name) ? [
            iconButton('fa-solid fa-scissors', t('Przytnij'), () => mediaTools.openTrim(profileId, c)),
            iconButton('fa-solid fa-share-nodes', t('Udostępnij linkiem'), () => mediaTools.shareFile(profileId, 'clips', c.name), 'feature-media'),
          ] : []),
          iconButton('fa-regular fa-folder-open', t('Pokaż w folderze'), () => api.revealFile(c.file)),
          iconButton('fa-regular fa-trash-can', t('Usuń'), () => {
            if (confirm(t('Usunąć ten klip?'))) guard(() => api.deleteClip(profileId, c.name)).then(renderWorlds);
          }, 'danger')));
    })));
    if (!clips.length) box.replaceChildren(el('p', { className: 'muted', textContent: t('Brak klipów. Włącz „Klipy” w ustawieniach HUD w grze (Prawy Shift), a F8 zapisze ostatnie sekundy gry.') }));
    box.prepend(myLinksButton());
  } else {
    const shots: Screenshot[] = (await guard(() => api.listScreenshots(profileId))) ?? [];
    box.replaceChildren(el('div', { className: 'shots' }, ...shots.map((sh) => {
      const img = el('img', { alt: sh.name, loading: 'lazy' });
      img.src = media(sh.file);
      img.addEventListener('click', () => api.openFile(sh.file));
      return el('div', { className: 'shot' }, img,
        el('div', {}, el('span', { textContent: fmtDate(sh.createdAt) }),
          iconButton('fa-solid fa-share-nodes', t('Udostępnij linkiem'), () => mediaTools.shareFile(profileId, 'screenshots', sh.name), 'feature-media'),
          iconButton('fa-regular fa-folder-open', 'Pokaż w folderze', () => api.revealFile(sh.file)),
          iconButton('fa-regular fa-trash-can', 'Usuń', () => {
            if (confirm(t('Usunąć ten zrzut ekranu?'))) guard(() => api.deleteScreenshot(profileId, sh.name)).then(renderWorlds);
          }, 'danger')));
    })));
    if (!shots.length) box.replaceChildren(el('p', { className: 'muted', textContent: 'Brak zrzutów. W grze zrobisz je klawiszem F2.' }));
    box.prepend(myLinksButton());
  }
  // the last child: the gallery tabs put the "My links" button before the list
  const listEl = box.lastElementChild;
  if (listEl) appear(listEl.children.length ? [...listEl.children] : [listEl]);
}

document.querySelectorAll<HTMLButtonElement>('#worlds-tab button').forEach((b) =>
  b.addEventListener('click', () => {
    worldsTab = b.dataset.tab!;
    document.querySelectorAll('#worlds-tab button').forEach((x) => x.classList.toggle('active', x === b));
    renderWorlds();
  }));
$('#worlds-profile').addEventListener('change', renderWorlds);

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
    grid.querySelector('.news-failed')?.remove();
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
    // what failed can be tried again: the first page, or the next one under those already shown
    const retry = el('button', { type: 'button' }, el('i', { className: 'fa-solid fa-rotate-right' }), ` ${t('Spróbuj ponownie')}`);
    retry.addEventListener('click', () => loadNews(more));
    const failed = el('div', { className: 'news-failed' }, el('p', { className: 'muted', textContent: t('Nie udało się pobrać nowości.') }), retry);
    if (more) grid.append(failed);
    else grid.replaceChildren(failed);
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
  void setPlayTab(show ? 'console' : 'news');
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
    updateSkinRendering();
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
  stopCapeAnimation();
  if (skin.cape) await skinViewer.loadCape(skin.cape, { backEquipment: 'cape' });
  else skinViewer.resetCape();
  // a SlashClient cape is what other players see, so the preview wears it over the Mojang one
  void renderSlashCapes();
  $('#skin-back').classList.toggle('hidden', !skin.cape);
  $('#skin-back').replaceChildren(el('i', { className: 'fa-solid fa-feather' }), t(' Elytra'));
  const capeNote = skin.cape ? t(' Peleryna: {0}.', skin.capeSource ?? '') : '';
  const note = $('#skin-note');
  note.dataset.base = t(account.type === 'msa'
    ? 'Skin Twojego konta Minecraft.'
    : skin.isDefault
      ? 'Konto offline nie ma własnego skina; w grze zobaczysz domyślny.'
      : 'Konto offline: to skin gracza premium o tym samym nicku. Na serwerach offline inni zobaczą domyślny skin.');
  note.dataset.cape = capeNote;
  note.textContent = note.dataset.base + capeNote;
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
/** Animated SlashClient capes and their frame count (img/capes/<id>_<n>.png), from the server's catalog. */
const capeFrames = new Map<string, number>();
const FRAME_MS = 150;
let capeTimer: ReturnType<typeof setInterval> | undefined;

/** Puts a cape on the preview; an animated one keeps turning its frames, as in the game. */
async function wearCape(id: string) {
  clearInterval(capeTimer);
  await skinViewer?.loadCape(`img/capes/${id}.png`, { backEquipment: 'cape' });
  const frames = capeFrames.get(id);
  if (!frames) return;
  let f = 0;
  capeTimer = setInterval(() => {
    if (!document.hidden) void skinViewer?.loadCape(`img/capes/${id}_${(f = (f + 1) % frames)}.png`, { backEquipment: 'cape' });
  }, FRAME_MS);
}

/** Anything else on the back stops an animated cape. */
function stopCapeAnimation() {
  clearInterval(capeTimer);
}

/** A cape's tile: animated ones play their frames while the tile is on the page. */
function animatedCapeThumbnail(id: string): HTMLCanvasElement {
  const canvas = capeThumbnail(`img/capes/${id}.png`);
  const frames = capeFrames.get(id);
  if (!frames) return canvas;
  let f = 0;
  const timer = setInterval(() => {
    if (!canvas.isConnected && f > 0) return clearInterval(timer);
    if (document.hidden) return;
    f = (f + 1) % frames;
    const img = new Image();
    img.onload = () => {
      const scale = img.naturalWidth / 64;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, scale, scale, 10 * scale, 16 * scale, 0, 0, 10 * scale, 16 * scale);
    };
    img.src = `img/capes/${id}_${f}.png`;
  }, FRAME_MS);
  return canvas;
}

function capeThumbnail(texture: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 10;
  canvas.height = 16;
  const img = new Image();
  img.onload = () => {
    // capes are 64×32, HD ones (like SlashClient's, 4×) larger: the picture keeps all its pixels,
    // squeezing it into 10×16 turned the logo and the patterns into a smudge
    const scale = img.naturalWidth / 64;
    canvas.width = 10 * scale;
    canvas.height = 16 * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, scale, scale, 10 * scale, 16 * scale, 0, 0, 10 * scale, 16 * scale);
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
      if (cape?.texture) {
        stopCapeAnimation();
        skinViewer?.loadCape(cape.texture);
      }
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

// ---------- SlashClient cosmetics (seen by other players with the launcher) ----------

type Slot = 'cape' | 'wings' | 'elytra' | 'trail' | 'aura' | 'pet' | 'hat' | 'top' | 'kill' | 'suit' | 'shield' | 'weapon' | 'shoes' | 'hands' | 'face' | 'ears' | 'back' | 'tail' | 'ring' | 'move' | 'spray' | 'prop';
const SLOTS: [Slot, string, string][] = [
  ['cape', 'Peleryna', 'fa-flag'], ['wings', 'Skrzydła', 'fa-dove'], ['elytra', 'Elytra', 'fa-feather'],
  ['trail', 'Ślad', 'fa-shoe-prints'], ['aura', 'Aura', 'fa-wand-sparkles'], ['pet', 'Pupil', 'fa-paw'],
  ['hat', 'Na głowę', 'fa-hat-cowboy'], ['top', 'Ubranie', 'fa-shirt'], ['kill', 'Efekt zabójstwa', 'fa-skull-crossbones'],
  ['suit', 'Strój', 'fa-user-astronaut'],
  ['shield', 'Tarcza', 'fa-shield'], ['weapon', 'Skórka broni', 'fa-crosshairs'],
  ['shoes', 'Buty', 'fa-socks'], ['hands', 'Dłonie', 'fa-mitten'],
  ['face', 'Twarz', 'fa-glasses'], ['ears', 'Uszy i rogi', 'fa-cat'],
  ['back', 'Na plecy', 'fa-person-hiking'], ['tail', 'Ogon', 'fa-cat'],
  ['ring', 'Krąg pod stopami', 'fa-circle-dot'], ['move', 'Efekt ruchu', 'fa-person-running'],
  ['spray', 'Spray', 'fa-spray-can'],
  ['prop', 'Rekwizyt', 'fa-dolly'],
];
/** Without the server (or before 0.8) only the first eight capes are known. */
const SLASH_CAPES: [string, string][] = [
  ['slash', 'SlashClient'], ['ocean', 'Ocean'], ['ember', 'Ember'], ['forest', 'Forest'],
  ['galaxy', 'Galaxy'], ['rose', 'Rose'], ['gold', 'Gold'], ['mono', 'Mono'],
];
/** Particles and pets are the game's own: in the launcher they get an icon. */
const ITEM_ICONS: Record<string, string> = {
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
  // movement effects (ringMovePreview.ts has their colours)
  move_steps: 'fa-shoe-prints', move_jump: 'fa-cloud', move_landing: 'fa-burst', move_arrows: 'fa-location-arrow',
  move_sprint: 'fa-bolt', move_bubbles: 'fa-circle-dot', move_petals: 'fa-spa',
};
/** The kill effects' icons in their own colours (the other icons are the accent's). */
const KILL_ICON_COLORS: Record<string, string> = {
  lightning: '#bfe6ff', blood: '#d32f2f', heartburst: '#ff5c7a', firework: '#ffd93b', soulrise: '#5fe3f0', enderpoof: '#c070ff',
  confetti: '#ff7ad9', blast: '#ffa21f', shatter: '#9fd8ff', coins: '#ffd23f', ghost: '#f4f6ff', flamering: '#ff6a1f',
};
const RANK_NAMES: Record<string, string> = { admin: 'Admin', support: 'Support', partner: 'Partner', friend: 'Przyjaciel', friend_pink: 'Przyjaciel' };
let cosmeticSlot: Slot = 'cape';
/** The Minecraft account (uuid without dashes) shown in the Accounts tab: it may have a set of its own. */
let cosmeticCharacter = '';

/** The back of a wing (64×32 elytra layout, HD 4×), twice, mirrored: a pair of wings. */
function wingsThumbnail(texture: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 20;
  const img = new Image();
  img.onload = () => {
    const s = img.naturalWidth / 64;
    canvas.width = 24 * s;
    canvas.height = 20 * s;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 34 * s, 2 * s, 12 * s, 20 * s, 12 * s, 0, 12 * s, 20 * s);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 34 * s, 2 * s, 12 * s, 20 * s, -12 * s, 0, 12 * s, 20 * s);
  };
  img.src = texture;
  return canvas;
}

/** A shield's face, cut from its picture (the game's shield layout at 4×). */
function heldShieldThumbnail(texture: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  // tall like the shield itself (12×22 pixels), not the square tiles' wide picture size
  canvas.className = 'shield-icon';
  canvas.width = 48;
  canvas.height = 88;
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 4, 4, 48, 88, 0, 0, 48, 88);
  };
  img.src = texture;
  return canvas;
}

/** The game's own pictures (spawn eggs, particles), from a downloaded game; {} until one is. */
let gamePictures: Record<string, string> | undefined;
async function loadGamePictures(): Promise<Record<string, string>> {
  if (gamePictures && Object.keys(gamePictures).length) return gamePictures;
  const found: Record<string, string> = (await api.cosmeticTextures().catch(() => null)) ?? {};
  gamePictures = found;
  return found;
}
let cosmeticPreview: CosmeticPreview | undefined;
/** The figure was set walking for the tail's tab (and stands again after it). */
let walkingForTail = false;


function cosmeticPicture(slot: Slot, id: string): Node {
  if (slot === 'cape') return animatedCapeThumbnail(id);
  if (slot === 'wings' || slot === 'elytra') return wingsThumbnail(`img/${slot}/${id}.png`);
  // clothing: a view of it from the front, a little from above (made with its pictures)
  if (slot === 'hat' || slot === 'top' || slot === 'shoes' || slot === 'hands' || slot === 'face' || slot === 'ears') return el('img', { className: 'clothing-icon', src: `img/clothing/icon/${id}.png`, alt: '' });
  if (slot === 'suit') return el('img', { className: 'clothing-icon', src: `img/suits/icon/${id}.png`, alt: '' });
  // back items and tails: a view from behind (made with their pictures)
  if (slot === 'back' || slot === 'tail') return el('img', { className: 'clothing-icon', src: `img/gear/icon/${id}.png`, alt: '' });
  // our own pets (not the game's mobs) have a picture of their own
  if (slot === 'pet' && OUR_PET_MODELS[id]) return el('img', { className: 'clothing-icon', src: `img/pets/icon/${id}.png`, alt: '' });
  // shields: the face of the shield (12×22 at 1,1 of the game's 64×64 layout, ours are 4×); weapons: their own picture
  if (slot === 'shield') return heldShieldThumbnail(`img/held/${id}.png`);
  if (slot === 'weapon') return el('img', { className: 'clothing-icon', src: `img/held/${id}.png`, alt: '' });
  // a spray is its picture
  if (slot === 'spray') return el('img', { className: 'clothing-icon', src: `img/spray/${id}.png`, alt: '' });
  // props: a view of it from its side
  if (slot === 'prop') return el('img', { className: 'clothing-icon', src: `img/props/icon/${id}.png`, alt: '' });
  if (slot === 'kill') {
    const i = el('i', { className: `fa-solid ${ITEM_ICONS[id] ?? 'fa-skull-crossbones'} cosmetic-icon` });
    i.style.color = KILL_ICON_COLORS[id] ?? '';
    return i;
  }
  // a ring is our own picture; a movement effect gets its icon in its colour
  if (slot === 'ring') return ringThumbnail('img/rings/', id);
  if (slot === 'move') {
    const i = el('i', { className: `fa-solid ${ITEM_ICONS[id] ?? 'fa-person-running'} cosmetic-icon` });
    i.style.color = MOVE_ICONS[id]?.[1] ?? '';
    return i;
  }
  const icon = gamePictures && cosmeticIcon(gamePictures, id);
  if (icon) return gameIcon(icon.srcs, icon.tint);
  return el('i', { className: `fa-solid ${ITEM_ICONS[id] ?? 'fa-star'} cosmetic-icon` });
}

async function renderSlashCapes() {
  const pictures = await loadGamePictures();
  // what is worn is read fresh: the launcher's copy of the account may predate the last change
  const state: { user?: unknown } | undefined = await api.socialState().catch(() => undefined);
  type Me = { cape?: string; loadout?: Partial<Record<Slot, string>>; minecraft?: { uuid: string; name: string; loadout: Partial<Record<Slot, string>> | null }[] };
  const me: Me | undefined = state?.user ? await api.socialApi('GET', '/v1/me').catch(() => undefined) : undefined;
  // a Minecraft account linked to the SlashClient account has a set of its own; others wear the account's
  const character = me?.minecraft?.find((m) => m.uuid === cosmeticCharacter);
  const worn: Partial<Record<Slot, string>> = character?.loadout ? { ...character.loadout } : { ...me?.loadout, cape: me?.cape ?? '' };
  $('#cosmetic-owner').textContent = character ? t('Zestaw postaci {0}', character.name) + (character.loadout ? '' : t(' (jak całe konto)')) : me ? t('Zestaw całego konta') : '';
  $('#cosmetic-shared').classList.toggle('hidden', !character?.loadout);
  const signedIn = !!me;
  // what the server offers now: switched-off items are left out, exclusive and rank ones say if they are ours
  type CatalogItem = { id: string; slot: Slot; name: string; rank?: string; exclusive: boolean; available: boolean; frames?: number; price?: number; owned?: boolean; hint?: string; hintEn?: string; supporter?: number };
  let walletBalance: number | undefined;
  const catalog: CatalogItem[] = (await api.socialApi('GET', '/v1/cosmetics').then((r: { capes: CatalogItem[]; items?: CatalogItem[]; wallet?: { balance: number } }) => {
    walletBalance = r.wallet?.balance;
    return r.items ?? r.capes.map((c) => ({ ...c, slot: 'cape' as Slot }));
  }).catch(() => undefined))
    ?? SLASH_CAPES.map(([id, name]) => ({ id, slot: 'cape' as Slot, name, exclusive: false, available: true }));
  if (walletBalance !== undefined) achievements.setBalance(walletBalance);
  // the balance and the way to the shop (in the Achievements view), while signed in to a server that has it
  $('#cosmetic-shop').classList.toggle('hidden', walletBalance === undefined);
  $('#cosmetic-sparks').textContent = (walletBalance ?? 0).toLocaleString(locale());
  $('#cosmetic-shop').title = t('Twoje {0}: {1}', currencyName(), sparks(walletBalance ?? 0));
  for (const c of catalog) if (c.frames) capeFrames.set(c.id, c.frames);
  const slots = SLOTS.filter(([slot]) => catalog.some((c) => c.slot === slot));
  if (!slots.some(([slot]) => slot === cosmeticSlot)) cosmeticSlot = 'cape';
  $('#slot-tabs').replaceChildren(...slots.map(([slot, name, icon]) => {
    const b = el('button', { type: 'button', className: `slot-tab${slot === cosmeticSlot ? ' active' : ''}${worn[slot] ? ' worn' : ''}`, title: t(name) },
      el('i', { className: `fa-solid ${icon}` }), ` ${t(name)}`);
    b.addEventListener('click', () => {
      cosmeticSlot = slot;
      renderSlashCapes();
    });
    return b;
  }));
  $('#slot-tabs').classList.toggle('hidden', slots.length < 2);
  // the tabs scroll after a few rows (style.css): the picked one stays in view
  const activeTab = $('#slot-tabs').querySelector<HTMLElement>('.slot-tab.active');
  if (activeTab) $('#slot-tabs').scrollTop = Math.max(0, Math.min($('#slot-tabs').scrollTop, activeTab.offsetTop - $('#slot-tabs').offsetTop),
    activeTab.offsetTop - $('#slot-tabs').offsetTop + activeTab.offsetHeight - $('#slot-tabs').clientHeight);
  $('#slash-cape-note').textContent = !signedIn
    ? t('Zaloguj się w zakładce Znajomi (konto SlashClient), żeby nosić pelerynę SlashClient.')
    : cosmeticSlot === 'cape' ? t('Widzą ją inni gracze z SlashClient, na każdym serwerze. Zastępuje pelerynę Minecraft.')
    : cosmeticSlot === 'wings' ? t('Skrzydła zastępują pelerynę na plecach; z prawdziwą elytrą widać elytrę.')
    : cosmeticSlot === 'elytra' ? t('Wygląd elytry, gdy ją założysz (bez tego elytra ma wzór peleryny).')
    : cosmeticSlot === 'trail' ? t('Cząsteczki za Tobą, kiedy chodzisz.')
    : cosmeticSlot === 'aura' ? t('Cząsteczki wokół Ciebie, kiedy stoisz.')
    : cosmeticSlot === 'hat' ? t('Coś na głowę. Chowa się pod prawdziwym hełmem.')
    : cosmeticSlot === 'top' ? t('Ubranie na skinie. Chowa się pod prawdziwym napierśnikiem.')
    : cosmeticSlot === 'suit' ? t('Strój na całe ciało. Chowa czapkę i ubranie, a prawdziwa zbroja chowa część, którą zakrywa.')
    : cosmeticSlot === 'shoes' ? t('Buty na obu stopach. Chowają się pod prawdziwymi butami.')
    : cosmeticSlot === 'hands' ? t('Coś na dłonie lub nadgarstek, widać to też w pierwszej osobie.')
    : cosmeticSlot === 'face' ? t('Okulary, maska albo wąsy. Okulary zostają pod hełmem, maski i gogle się chowają.')
    : cosmeticSlot === 'ears' ? t('Uszy albo rogi na głowie; uszy co chwilę drgają. Chowają się pod hełmem i tam, gdzie przeszłyby przez czapkę.')
    : cosmeticSlot === 'kill' ? t('Krótki pokaz cząsteczek tam, gdzie pada pokonany przez Ciebie mob lub gracz. Widzą go gracze z SlashClient.')
    : cosmeticSlot === 'shield' ? t('Wygląd tarczy w Twojej ręce (ekwipunek i działanie bez zmian). Inni gracze widzą go tylko, jeśli włączą skórki innych graczy w ustawieniach gry – domyślnie nie, dla uczciwego PvP.')
    : cosmeticSlot === 'weapon' ? t('Wygląd wszystkich mieczy (skórki mieczy) albo łuku (skórki łuków) w Twojej ręce; ekwipunek, nazwa i działanie bez zmian. Inni gracze widzą go tylko, jeśli włączą skórki innych graczy w ustawieniach gry – domyślnie nie, dla uczciwego PvP.')
    : cosmeticSlot === 'back' ? t('Coś na plecy. Zajmuje miejsce peleryny i skrzydeł (nie widać ich wtedy) i chowa się pod prawdziwą elytrą.')
    : cosmeticSlot === 'tail' ? t('Ogon kołysze się, kiedy chodzisz. Pod peleryną zwisa niżej.')
    : cosmeticSlot === 'ring' ? t('Świecący krąg na ziemi pod Twoimi stopami, powoli się obraca. Widzą go gracze z SlashClient.')
    : cosmeticSlot === 'move' ? t('Cząsteczki, gdy chodzisz, skaczesz, lądujesz, biegasz, pływasz lub strzelasz. Widzą je gracze z SlashClient.')
    : cosmeticSlot === 'spray' ? t('Obrazek, który klawiszem malujesz na bloku przed sobą (w grze: Klawisze SlashClient). Znika po minucie; widzą go gracze z SlashClient na tym samym serwerze.')
    : cosmeticSlot === 'prop' ? t('Pchasz go przed sobą, gdy masz wolne ręce. Z przedmiotem w ręce, przy jedzeniu, pływaniu czy lataniu się chowa.')
    : t('Mały towarzysz lata przy Twoim ramieniu.');
  if (signedIn && worn.back && (cosmeticSlot === 'cape' || cosmeticSlot === 'wings')) $('#slash-cape-note').textContent += t(' Nosisz coś na plecach: w grze widać to zamiast peleryny i skrzydeł.');
  const current = worn[cosmeticSlot] ?? '';
  const tile = (item: CatalogItem | undefined, content: Node) => {
    const id = item?.id ?? '';
    const title = item ? item.name : t('Nic');
    const locked = !!item && !item.available;
    // sold in the shop for sparks: the price on it, a click asks to buy (sparkShop.ts)
    const forSale = locked && !!item?.price && !item.owned;
    const why = forSale ? t('{0}: w sklepie za {1}', title, sparks(item!.price!))
      : item?.rank ? t('{0}: tylko dla rangi {1}', title, RANK_NAMES[item.rank] ?? item.rank)
      : item?.supporter ? t('{0}: dla wspierających projekt (Ustawienia → Wesprzyj projekt)', title)
      : item?.hint ? `${title}: ${getLang() === 'en' ? item.hintEn ?? item.hint : item.hint}`
      : t('{0}: ekskluzywna, przyznaje ją admin', title);
    const b = el('button', { type: 'button', className: `cape-choice${cosmeticSlot === 'cape' ? '' : ' square'}${id === current ? ' selected active' : ''}${id ? '' : ' none'}${forSale ? ' for-sale' : ''}`, title: locked ? why : title }, content);
    if (forSale) b.append(el('span', { className: 'cape-price' }, el('span', { className: 'spark-sign', textContent: '✦' }), ` ${item!.price!.toLocaleString(locale())}`));
    if (locked) b.append(el('i', { className: 'fa-solid fa-lock cape-lock' }));
    else if (item?.rank) b.append(el('i', { className: `fa-solid fa-shield-halved cape-lock rank-${item.rank}` }));
    b.disabled = !signedIn || (locked && !forSale);
    b.addEventListener('click', async () => {
      if (forSale) {
        if ((await buyWithConfirm(item!, walletBalance ?? achievements.balance(), { api, toast, errorText }, cosmeticPicture(item!.slot, item!.id))) !== undefined) renderSlashCapes();
        return;
      }
      const slot = cosmeticSlot;
      const change = slot === 'cape' ? { cape: id } : { loadout: { [slot]: id } };
      const me = await guard(() => api.socialApi('POST', '/v1/me', character ? { character: character.uuid, ...change } : change));
      if (!me) return;
      if (slot === 'cape' && id) {
        await wearCape(id);
        $('#skin-back').classList.remove('hidden');
      }
      if (slot === 'elytra' && id) {
        stopCapeAnimation();
        await skinViewer?.loadCape(`img/elytra/${id}.png`, { backEquipment: 'elytra' });
        $('#skin-back').classList.remove('hidden');
      }
      toast(id ? t('{0} założone.', title) : t('Zdjęte.'));
      renderSlashCapes();
    });
    return b;
  };
  $('#slash-cape-grid').replaceChildren(
    tile(undefined, el('i', { className: 'fa-solid fa-ban' })),
    ...catalog.filter((c) => c.slot === cosmeticSlot).map((c) => tile(c, cosmeticPicture(c.slot, c.id))));
  // the preview wears what other players will see, and the note says which cape that is
  const capeId = worn.cape ?? '';
  const note = $('#skin-note');
  if (note.dataset.base !== undefined) {
    const name = catalog.find((c) => c.slot === 'cape' && c.id === capeId)?.name;
    note.textContent = note.dataset.base + (capeId ? t(' Peleryna: {0}.', !name || name === 'SlashClient' ? 'SlashClient' : `SlashClient · ${name}`) : note.dataset.cape ?? '');
  }
  if (!skinViewer) return;
  // the preview wears all of it: wings in the cape's place, the pet, trail and aura around
  cosmeticPreview ??= new CosmeticPreview(skinViewer, pictures);
  cosmeticPreview.pictures = pictures;
  // a back item takes the place of the cape and the wings (on their own tabs they show; on the elytra's, the elytra)
  const back = cosmeticSlot === 'cape' || cosmeticSlot === 'wings' || cosmeticSlot === 'elytra' ? undefined : worn.back;
  // the kill and movement effects play on the figure only while their tab is open (they would distract)
  const holding = cosmeticSlot === 'shield' || cosmeticSlot === 'weapon';
  // on its own tab the prop is seen from the side, the figure walking with it
  cosmeticPreview.show({ ...worn, back, kill: cosmeticSlot === 'kill' ? worn.kill : undefined, move: cosmeticSlot === 'move' ? worn.move : undefined,
    shield: holding ? worn.shield : undefined, weapon: holding ? worn.weapon : undefined, walk: cosmeticSlot === 'prop' });
  // the figure shows its back for a back item, its back and side for a tail, walking so the tail swings
  // (on the prop's tab the prop's own view turns it: propPreview.ts)
  if (cosmeticSlot !== 'prop') skinViewer.playerWrapper.rotation.y = cosmeticSlot === 'back' ? Math.PI : cosmeticSlot === 'tail' ? Math.PI * 0.7 : 0;
  const walking = skinViewer.animation instanceof WalkingAnimation;
  if (cosmeticSlot === 'tail' && !walking) {
    $('#skin-anim').click();
    walkingForTail = true;
  } else if (cosmeticSlot !== 'tail' && walkingForTail) {
    if (walking) $('#skin-anim').click();
    walkingForTail = false;
  }
  stopCapeAnimation();
  if (back) skinViewer.loadCape(null);
  else if (worn.wings) await skinViewer.loadCape(`img/wings/${worn.wings}.png`, { backEquipment: 'elytra' });
  else if (cosmeticSlot === 'elytra' && worn.elytra) await skinViewer.loadCape(`img/elytra/${worn.elytra}.png`, { backEquipment: 'elytra' });
  else if (capeId) await wearCape(capeId);
}

$('#cosmetic-shop').addEventListener('click', () => achievements.showShop());
$('#cosmetic-shared').addEventListener('click', async () => {
  if (!cosmeticCharacter || !(await guard(() => api.socialApi('POST', '/v1/me', { character: cosmeticCharacter, own: false })))) return;
  toast(t('Ta postać nosi teraz zestaw całego konta.'));
  renderSlashCapes();
});

/** Which capes are shown: SlashClient's, or the Minecraft account's own (Microsoft accounts only). */
function showCapeTab(tab: 'slash' | 'mojang') {
  $('#slash-cape-row').classList.toggle('hidden', tab !== 'slash');
  $('#cape-row').classList.toggle('hidden', tab !== 'mojang');
  document.querySelectorAll<HTMLButtonElement>('#cape-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}
document.querySelectorAll<HTMLButtonElement>('#cape-tabs button').forEach((b) => b.addEventListener('click', () => showCapeTab(b.dataset.tab as 'slash' | 'mojang')));

async function loadSkinEditor(account: { id: string; type: string; uuid?: string }) {
  cosmeticCharacter = (account.uuid ?? '').toLowerCase().replace(/-/g, '');
  renderSlashCapes();
  $('#skin-edit').classList.toggle('hidden', account.type !== 'msa');
  // an offline account has no Minecraft capes: only SlashClient's
  $('#cape-tabs').classList.toggle('hidden', account.type !== 'msa');
  if (account.type !== 'msa') showCapeTab('slash');
  $('#skin-pending').classList.add('hidden');
  $('#skin-actions').classList.remove('hidden');
  $('#cape-apply').classList.add('hidden');
  if (account.type !== 'msa') return;
  $('#cape-grid').replaceChildren(...skeletons('shot', 3).map((s) => Object.assign(s, { className: 'cape-choice sk' })));
  capes = (await guard(() => api.ownedCapes(account.id))) ?? [];
  chosenCape = capes.find((c) => c.active)?.id ?? '';
  // no Minecraft capes on this account: no tab to switch to
  $('#cape-tabs').classList.toggle('hidden', !capes.length);
  if (!capes.length) showCapeTab('slash');
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
  if (cape?.texture) {
    stopCapeAnimation();
    await skinViewer.loadCape(cape.texture);
  }
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

  // A slow twinkle needs few frames: 15 fps in front, 4 fps when another window has focus
  // (e.g. the game), none while minimised. A timer instead of requestAnimationFrame, so
  // the page is not woken up 60 times a second just to skip most frames.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    draw(performance.now());
    timer = document.hidden || still ? undefined : setTimeout(tick, document.hasFocus() ? 66 : 250);
  };
  const wake = () => {
    if (timer === undefined && !still) tick();
  };
  addEventListener('resize', () => {
    resize();
    draw(performance.now());
  });
  document.addEventListener('visibilitychange', wake);
  addEventListener('focus', () => {
    clearTimeout(timer);
    timer = undefined;
    wake();
  });
  resize();
  tick();
}

// ---------- task panel: install progress and completion ----------

interface TaskStart { id: string; title: string; icon?: string }
interface TaskProgress { id: string; stage: string; done: number; total: number; bytes?: number; totalBytes?: number; speed?: number }
interface TaskDone { id: string; ok: boolean; message: string; profileId?: string }

const taskCards = new Map<string, HTMLElement>();

api.on('task:start', ({ id, title, icon }: TaskStart) => startTaskCard(id, title, icon && isProjectIcon(icon) ? icon : 'logo.png'));
api.on('task:progress', (p: TaskProgress) => progressTaskCard(p));
api.on('task:done', (d: TaskDone) => finishTaskCard(d));

/** A progress card in the top right corner; `iconSrc` is a safe local or Modrinth picture. */
function startTaskCard(id: string, title: string, iconSrc: string) {
  const img = el('img', { alt: '' });
  img.src = iconSrc;
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
}

function progressTaskCard({ id, stage, done, total, bytes, totalBytes, speed }: TaskProgress) {
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
}

/** Turns a card into its result; `stayMs` overrides how long it stays. */
function finishTaskCard({ id, ok, message, profileId }: TaskDone, stayMs?: number) {
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
  dismissLater(card, stayMs ?? (!ok ? 15000 : profileId ? 20000 : 6000));
}

// ---------- updates ----------

type UpdateStatus = { state: string; version?: string; percent?: number; manual?: boolean; reason?: string; error?: string };
let updateClosed = '';
/** The bar at the top (a new version: downloading, ready, or to download on macOS) and the line in Settings. */
function showUpdate(u: UpdateStatus) {
  const bar = $('#update-bar');
  const text: Record<string, string> = {
    available: t('Dostępna nowa wersja SlashClient: {0}', u.version ?? ''),
    downloading: t('Pobieram nową wersję SlashClient {0}… {1}%', u.version ?? '', u.percent ?? 0),
    ready: t('Nowa wersja SlashClient jest gotowa: {0}', u.version ?? ''),
  };
  // macOS when it could not update itself: why, and the way out (moving to Applications, trying again)
  const outside = u.reason === 'translocated' || u.reason === 'disk-image';
  if (u.state === 'available' && u.manual) {
    text.available = outside
      ? t('Nowa wersja {0}. SlashClient działa spoza folderu Aplikacje, więc nie może zaktualizować się sam — przenieś go tam.', u.version ?? '')
      : u.reason === 'read-only'
        ? t('Nowa wersja {0}. SlashClient nie ma prawa zapisu w swoim folderze — pobierz nową wersję ręcznie.', u.version ?? '')
        : u.reason === 'failed'
          ? t('Nowa wersja {0}. Nie udało się jej zainstalować ({1}) — spróbuj ponownie albo pobierz ją ze strony.', u.version ?? '', u.error || t('nieznany błąd'))
          : text.available;
  }
  const key = `${u.state}:${u.version}`;
  bar.classList.toggle('hidden', !text[u.state] || updateClosed === key);
  $('#update-text').textContent = text[u.state] ?? '';
  $('#update-install').classList.toggle('hidden', u.state !== 'ready');
  const manual = u.state === 'available' && !!u.manual;
  $('#update-move').classList.toggle('hidden', !(manual && outside));
  $('#update-retry').classList.toggle('hidden', !(manual && u.reason === 'failed'));
  // the website's download: only when nothing else can help
  $('#update-download').classList.toggle('hidden', !(manual && !outside));
  const settings: Record<string, string> = {
    dev: t('(wersja deweloperska, bez aktualizacji)'),
    checking: t('· sprawdzam…'),
    none: t('· najnowsza'),
    available: t('· dostępna {0}', u.version ?? ''),
    downloading: t('· pobieram {0} ({1}%)', u.version ?? '', u.percent ?? 0),
    ready: t('· {0} gotowa, uruchom ponownie', u.version ?? ''),
    error: t('· nie udało się sprawdzić'),
  };
  $('#update-state').textContent = settings[u.state] ?? '';
  $('#update-state').title = u.error ?? '';
}
api.on('update:status', showUpdate);
api.updateStatus().then(showUpdate);
$('#update-install').addEventListener('click', () => api.installUpdate());
$('#update-download').addEventListener('click', () => api.downloadUpdate());
$('#update-retry').addEventListener('click', () => api.retryUpdate());
$('#update-move').addEventListener('click', async () => {
  if (!(await api.moveToApplications())) toast(t('Nie udało się przenieść SlashClient do Aplikacji. Przeciągnij go tam w Finderze i uruchom ponownie.'), true);
});
$('#update-close').addEventListener('click', async () => {
  const u: UpdateStatus = await api.updateStatus();
  updateClosed = `${u.state}:${u.version}`;
  $('#update-bar').classList.add('hidden');
});
$('#update-check').addEventListener('click', async () => {
  const b = $<HTMLButtonElement>('#update-check');
  b.disabled = true;
  updateClosed = '';
  showUpdate(await api.checkForUpdates());
  b.disabled = false;
});

// switching the language takes effect immediately
$('#language-select').addEventListener('change', async () => {
  const lang = $<HTMLSelectElement>('#language-select').value;
  await api.saveSettings({ language: lang });
  applyLanguage(lang);
  render();
  renderProfiles();
  if (servers.length) renderServers();
  if (contentHits.length || installed.length) renderContent();
  if (document.querySelector('#view-profiles.active') && profilePane === 'worlds') renderWorlds();
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
  loadBlockIcons();
  renderProfiles();
})();
