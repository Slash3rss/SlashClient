import { SkinViewer, WalkingAnimation, IdleAnimation } from 'skinview3d';
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
}
interface PublicStore {
  accounts: PublicAccount[];
  profiles: Profile[];
  settings: { msClientId: string; selectedProfileId?: string; selectedAccountId?: string; closeOnLaunch: boolean; discordClientId: string; discordEnabled: boolean; language: string };
  running: boolean;
  dataDir: string;
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
  $('#news-lang-hint').textContent = getLang() === 'pl' ? t('Nowości Mojanga są dostępne tylko po angielsku.') : '';
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
  return String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

let toastTimer: number | undefined;
function toast(message: string, isError = false) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.toggle('error', isError);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.add('hidden'), isError ? 8000 : 3000);
}

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    toast(errorText(err), true);
    return undefined;
  }
}

const avatar = (uuid: string) => el('img', { src: `https://mc-heads.net/avatar/${uuid.replace(/-/g, '')}/32`, alt: '' });

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

const avatarUrl = (uuid: string) => `https://mc-heads.net/avatar/${uuid.replace(/-/g, '')}/64`;

function renderPlay() {
  const profileSel = $<HTMLSelectElement>('#play-profile');
  const accountSel = $<HTMLSelectElement>('#play-account');
  fillSelect(profileSel, store.profiles.map((p) => ({ value: p.id, label: p.name })), store.settings.selectedProfileId);
  fillSelect(accountSel, store.accounts.map((a) => ({ value: a.id, label: `${a.name}${a.type === 'offline' ? ' (offline)' : ''}` })), store.settings.selectedAccountId);
  if (store.accounts.length === 0) accountSel.append(el('option', { value: '', textContent: 'Brak kont' }));
  picker(profileSel, store.profiles.map((p) => ({ value: p.id, label: p.name, sub: profileLabel(p), img: 'img/grass.png' })));
  picker(accountSel, store.accounts.map((a) => ({ value: a.id, label: a.name, sub: a.type === 'msa' ? 'Microsoft' : 'Offline', img: avatarUrl(a.uuid), pixelated: true })), 'Brak kont');

  const profile = store.profiles.find((p) => p.id === profileSel.value) ?? store.profiles[0];
  $('#hero-title').textContent = profile?.name ?? 'Minecraft';
  $('#hero-sub').textContent = profile ? `${profileLabel(profile)} · ${profile.memoryMb} MB RAM` : '';

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
        el('div', { className: 'grow' }, p.name, el('small', { textContent: profileLabel(p) })));
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
  $<HTMLSelectElement>('#loader-select').value = profile.loader ?? 'vanilla';
  renderLoaderVersions(profile.loaderVersion ?? '');
  $('#memory-value').textContent = `${profile.memoryMb} MB`;
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
      const remove = el('button', { className: 'danger', textContent: 'Usuń' });
      remove.addEventListener('click', () => guard(() => api.deleteAccount(a.id)));
      return el('li', {}, avatar(a.uuid), el('div', { className: 'grow' }, a.name, el('small', { textContent: a.uuid })),
        el('span', { className: `badge ${a.type}`, textContent: a.type === 'msa' ? 'Microsoft' : 'Offline' }), remove);
    }),
  );
  if (store.accounts.length === 0) list.append(el('li', { className: 'muted', textContent: 'Nie dodano jeszcze żadnego konta.' }));
}

function renderSettings() {
  const form = $<HTMLFormElement>('#settings-form');
  (form.elements.namedItem('msClientId') as HTMLInputElement).value = store.settings.msClientId;
  fillSelect($<HTMLSelectElement>('#language-select'), LANGUAGES.map((l) => ({ value: l.code, label: l.name })), getLang());
  (form.elements.namedItem('closeOnLaunch') as HTMLInputElement).checked = store.settings.closeOnLaunch;
  (form.elements.namedItem('discordClientId') as HTMLInputElement).value = store.settings.discordClientId ?? '';
  (form.elements.namedItem('discordEnabled') as HTMLInputElement).checked = store.settings.discordEnabled ?? true;
  $('#data-dir').textContent = store.dataDir;
}

// ---------- play ----------

const log = $('#log');
function appendLog(line: string) {
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
  log.append(line + '\n');
  // Keep the DOM small during long sessions.
  while (log.childNodes.length > 2000) log.firstChild?.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

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
$('#play-account').addEventListener('change', (e) => {
  store.settings.selectedAccountId = (e.target as HTMLSelectElement).value;
  api.saveSettings({ selectedAccountId: store.settings.selectedAccountId });
  renderPlay();
});

function showView(name: string) {
  document.querySelector<HTMLButtonElement>(`.nav[data-view="${name}"]`)?.click();
}

/** Starts the selected profile with the selected account, optionally joining a server. */
async function startGame(server?: string, world?: string) {
  if (store.running || launching) return toast('Gra już działa.', true);
  launching = true;
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
  await navigator.clipboard.writeText(log.textContent ?? '');
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
  if (target.name === 'memoryMb') $('#memory-value').textContent = `${target.value} MB`;
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
  if (editingId && confirm(t('Usunąć ten profil? Pliki gry zostaną na dysku.'))) guard(() => api.deleteProfile(editingId!));
});
$('#profile-folder').addEventListener('click', () => editingId && guard(() => api.openProfileDir(editingId!)));
$('#profile-mods').addEventListener('click', () => editingId && guard(() => api.openModsDir(editingId!)));
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
api.on('login:code', ({ userCode, url }: { userCode: string; url: string }) => {
  $('#ms-user-code').textContent = userCode;
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
      discordClientId: (form.elements.namedItem('discordClientId') as HTMLInputElement).value.trim(),
      discordEnabled: (form.elements.namedItem('discordEnabled') as HTMLInputElement).checked,
      language: $<HTMLSelectElement>('#language-select').value,
    }),
  );
  toast('Zapisano ustawienia');
});

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
  play.addEventListener('click', () => startGame(s.ip));
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
interface InstalledItem { type: string; filename: string; enabled: boolean; title: string; projectId?: string; versionNumber?: string; iconUrl?: string }

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
  return el('div', { className: 'project' },
    projectIcon(hit.iconUrl),
    el('div', { className: 'project-main' },
      el('b', {}, hit.title, el('small', { textContent: t('od {0}', hit.author) })),
      el('p', { textContent: hit.description, title: hit.description }),
      el('div', { className: 'project-meta' },
        el('span', {}, el('i', { className: 'fa-solid fa-download' }), ` ${fmtCount(hit.downloads)}`),
        el('span', { textContent: hit.categories.slice(0, 4).join(' · ') }))),
    el('div', { className: 'project-actions' }, btn));
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
  return el('div', { className: `project${item.enabled ? '' : ' disabled'}` },
    projectIcon(item.iconUrl),
    el('div', { className: 'project-main' },
      el('b', {}, item.title, el('small', { textContent: item.versionNumber ?? '' })),
      el('p', { textContent: item.filename })),
    el('div', { className: 'project-actions' }, switchLabel, remove));
}

function renderContent() {
  contentNotice();
  const isPack = contentType === 'modpack';
  $('#modpack-import').classList.toggle('hidden', !isPack);
  $('#content-tab').classList.toggle('hidden', isPack);
  $('#content-search-bar').classList.toggle('hidden', contentTab === 'installed' && !isPack);
  const forType = installed.filter((i) => i.type === contentType);
  $('#installed-count').textContent = forType.length ? `(${forType.length})` : '';
  const list = $('#content-list');
  const from = animateFrom;
  animateFrom = undefined;
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

async function installHit(hit: ProjectHit) {
  installing.add(hit.id);
  renderContent();
  try {
    if (contentType === 'modpack') {
      const id = await api.installModpack(hit.id);
      toast(t('Utworzono profil „{0}”', hit.title));
      store.settings.selectedProfileId = id;
      showView('play');
    } else {
      const titles: string[] = await api.installContent(contentProfileId(), hit.id, contentType);
      toast(titles.length > 1 ? t('Zainstalowano {0} i zależności: {1}', titles[0], titles.slice(1).join(', ')) : t('Zainstalowano {0}', titles[0]));
      await refreshInstalled();
    }
  } catch (err) {
    toast(errorText(err), true);
  } finally {
    installing.delete(hit.id);
    setProgress('Gotowe do gry', 0);
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
$('#modpack-import').addEventListener('click', () => guard(async () => {
  const id = await busy($<HTMLButtonElement>('#modpack-import'), () => api.importModpack(), 'Importuję…');
  if (!id) return;
  toast('Zaimportowano modpack jako nowy profil');
  store.settings.selectedProfileId = id;
  showView('play');
}));
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
  $('#log').classList.toggle('hidden', !show);
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
  skinViewer ??= new SkinViewer({ canvas: $<HTMLCanvasElement>('#skin-canvas'), width: 220, height: 300 });
  skinViewer.autoRotate = true;
  skinViewer.autoRotateSpeed = 0.6;
  skinViewer.animation ??= new IdleAnimation();
  const skin = await guard(() => api.getSkin(account.id));
  if (!skin || skinAccountId !== account.id) return;
  await skinViewer.loadSkin(skin.dataUrl, { model: skin.model });
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

$('#skin-anim').addEventListener('click', () => {
  if (!skinViewer) return;
  const walking = skinViewer.animation instanceof WalkingAnimation;
  skinViewer.animation = walking ? new IdleAnimation() : new WalkingAnimation();
  $('#skin-anim').replaceChildren(el('i', { className: walking ? 'fa-solid fa-person-walking' : 'fa-solid fa-person' }), t(walking ? ' Chodzenie' : ' Stój'));
});
$('#skin-save').addEventListener('click', () => skinAccountId && guard(() => api.saveSkin(skinAccountId!)));
document.querySelector('.nav[data-view="accounts"]')?.addEventListener('click', () => renderSkin());

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

(async () => {
  startStars();
  store = await api.getStore();
  applyLanguage(store.settings.language);
  loadNews();
  render();
  versions = (await guard(() => api.listVersions())) ?? [];
  renderProfiles();
})();
