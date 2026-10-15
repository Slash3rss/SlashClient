import type { SlashApi } from '../main/preload';

declare global {
  interface Window {
    slash: SlashApi;
  }
}

interface PublicAccount { id: string; type: 'offline' | 'msa'; name: string; uuid: string }
interface Profile {
  id: string; name: string; versionId: string; loader: 'vanilla' | 'fabric' | 'quilt'; loaderVersion: string; gameDir: string; memoryMb: number;
  jvmArgs: string; javaPath: string; width: number; height: number;
}
interface PublicStore {
  accounts: PublicAccount[];
  profiles: Profile[];
  settings: { msClientId: string; selectedProfileId?: string; selectedAccountId?: string; closeOnLaunch: boolean };
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
  if (id === 'latest-release') return 'Najnowsze wydanie';
  if (id === 'latest-snapshot') return 'Najnowszy snapshot';
  return id;
}

const LOADER_NAMES = { vanilla: '', fabric: 'Fabric', quilt: 'Quilt' } as const;

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

function renderPlay() {
  const profileSel = $<HTMLSelectElement>('#play-profile');
  const accountSel = $<HTMLSelectElement>('#play-account');
  fillSelect(profileSel, store.profiles.map((p) => ({ value: p.id, label: p.name })), store.settings.selectedProfileId);
  fillSelect(accountSel, store.accounts.map((a) => ({ value: a.id, label: `${a.name}${a.type === 'offline' ? ' (offline)' : ''}` })), store.settings.selectedAccountId);
  if (store.accounts.length === 0) accountSel.append(el('option', { value: '', textContent: 'Brak kont' }));

  const profile = store.profiles.find((p) => p.id === profileSel.value) ?? store.profiles[0];
  $('#hero-title').textContent = profile?.name ?? 'Minecraft';
  $('#hero-sub').textContent = profile ? `${profileLabel(profile)} · ${profile.memoryMb} MB RAM` : '';

  const btn = $<HTMLButtonElement>('#play-btn');
  btn.textContent = store.running ? 'ZATRZYMAJ' : 'GRAJ';
  btn.classList.toggle('stop', store.running);
  btn.disabled = launching;

  const account = store.accounts.find((a) => a.id === accountSel.value);
  const chip = $('#account-chip');
  chip.replaceChildren();
  if (account) chip.append(avatar(account.uuid), el('div', {}, account.name, el('small', { textContent: account.type === 'msa' ? 'Microsoft' : 'Offline' })));
  else chip.append(el('div', { className: 'muted', textContent: 'Nie zalogowano' }));
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
      { value: 'latest-release', label: 'Najnowsze wydanie' },
      { value: 'latest-snapshot', label: 'Najnowszy snapshot' },
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
  fillSelect(select, [{ value: selected, label: selected || 'Najnowsza stabilna' }], selected);
  try {
    const list: { version: string; stable: boolean }[] = await api.loaderVersions(loader, $<HTMLSelectElement>('#version-select').value);
    if (request !== loaderRequest) return; // a newer choice replaced this one
    if (!list.length) {
      fillSelect(select, [{ value: '', label: 'Brak wsparcia dla tej wersji' }], '');
      return;
    }
    fillSelect(select, [
      { value: '', label: `Najnowsza stabilna (${(list.find((v) => v.stable) ?? list[0]).version})` },
      ...list.slice(0, 40).map((v) => ({ value: v.version, label: v.stable ? v.version : `${v.version} (beta)` })),
    ], selected);
  } catch (err) {
    if (request === loaderRequest) fillSelect(select, [{ value: selected, label: `Błąd: ${errorText(err)}` }], selected);
  }
}

function renderAccounts() {
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
  (form.elements.namedItem('closeOnLaunch') as HTMLInputElement).checked = store.settings.closeOnLaunch;
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

function setProgress(label: string, fraction: number, stats = '') {
  $('#progress-label').textContent = label;
  $('#progress-stats').textContent = stats;
  $('#progress-bar').style.width = `${(fraction * 100).toFixed(1)}%`;
}

const MB = 1024 * 1024;
const fmtMb = (bytes: number) => (bytes / MB).toLocaleString('pl-PL', { maximumFractionDigits: bytes < 10 * MB ? 1 : 0 });
function fmtSpeed(bps: number): string {
  if (bps >= MB) return `${(bps / MB).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} MB/s`;
  return `${Math.round(bps / 1024)} KB/s`;
}

interface StageEvent { stage: string; done: number; total: number; bytes?: number; totalBytes?: number; speed?: number }

function showStage({ stage, done, total, bytes, totalBytes, speed }: StageEvent) {
  if (total <= 1 && !totalBytes) return setProgress(`${stage}…`, total ? done / total : 0);
  // Byte-based progress when sizes are known; otherwise fall back to file count.
  const fraction = totalBytes ? Math.min(1, (bytes ?? 0) / totalBytes) : done / total;
  const pct = (fraction * 100).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const parts = [`${done} / ${total} plików`];
  if (totalBytes) parts.push(`${fmtMb(bytes ?? 0)} / ${fmtMb(totalBytes)} MB`);
  if (speed && done < total) parts.push(fmtSpeed(speed));
  setProgress(`${stage}: ${pct}%`, fraction, parts.join(' · '));
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
async function startGame(server?: string) {
  if (store.running || launching) return toast('Gra już działa.', true);
  launching = true;
  log.replaceChildren();
  showView('play');
  renderPlay();
  try {
    await api.launch($<HTMLSelectElement>('#play-profile').value, $<HTMLSelectElement>('#play-account').value, server);
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

api.on('launch:stage', showStage);
api.on('game:log', appendLog);
api.on('game:exit', ({ code, signal, byUser }: { code: number | null; signal: string | null; byUser: boolean }) => {
  if (code === 0 || byUser) return setProgress('Gotowe do gry', 0);
  // A signal without a user request means the OS killed the game (crash, code signature, out of memory).
  const reason = signal ? `została zabita przez system (${signal})` : `zakończyła się z kodem ${code}`;
  setProgress(`Gra ${reason}`, 0);
  appendLog(`[SlashClient] Gra ${reason}.`);
  toast(`Gra ${reason}. Sprawdź logi.`, true);
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
  if (editingId && confirm('Usunąć ten profil? Pliki gry zostaną na dysku.')) guard(() => api.deleteProfile(editingId!));
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
  try {
    const name = await api.loginMicrosoft();
    toast(`Zalogowano jako ${name}`);
  } catch (err) {
    toast(errorText(err), true);
  } finally {
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
    stats.append(el('span', {}, el('b', { textContent: `${s.playersOnline}` }), ` / ${s.playersMax}`), el('span', { textContent: '… ms' }));
  }
  stats.append(el('span', { title: 'Głosy' }, el('i', { className: 'fa-solid fa-thumbs-up' }), ` ${s.votes}`));

  const play = el('button', { className: 'primary' }, el('i', { className: 'fa-solid fa-play' }), 'Graj');
  play.addEventListener('click', () => startGame(s.ip));
  const copy = el('button', { className: 'icon-btn', title: 'Kopiuj IP' }, el('i', { className: 'fa-regular fa-copy' }));
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(s.ip);
    toast(`Skopiowano ${s.ip}`);
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
  $('#server-list').replaceChildren(...page.map(serverCard));
  if (!list.length) $('#server-list').append(el('p', { className: 'muted', textContent: servers.length ? 'Brak serwerów pasujących do filtrów.' : 'Ładowanie listy…' }));
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
  try {
    servers = await api.listServers(force);
    if (force) pings.clear();
    const modes = [...new Set(servers.flatMap((s) => s.modes))].sort((a, b) => a.localeCompare(b, 'pl'));
    const sel = $<HTMLSelectElement>('#servers-mode');
    const current = sel.value;
    fillSelect(sel, [{ value: '', label: 'Wszystkie tryby' }, ...modes.map((m) => ({ value: m, label: m }))], current);
    renderServers();
  } catch (err) {
    toast(`Nie udało się pobrać listy serwerów: ${errorText(err)}`, true);
  } finally {
    btn.disabled = false;
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
let installed: InstalledItem[] = [];
const installing = new Set<string>();

const contentProfileId = () => $<HTMLSelectElement>('#content-profile').value;
const fmtCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} mln` : n >= 1e3 ? `${Math.round(n / 1e3)} tys.` : String(n));

function contentNotice() {
  const profile = store.profiles.find((p) => p.id === contentProfileId());
  const box = $('#content-notice');
  let text = '';
  if (contentType === 'mod' && profile?.loader === 'vanilla') text = 'Ten profil nie ma mod loadera. Ustaw Fabric w zakładce Profile, żeby instalować mody.';
  else if (contentType === 'shader') text = 'Shadery wymagają moda Iris (Fabric). Zainstaluj go w zakładce Mody.';
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
    el('i', { className: isInstalled ? 'fa-solid fa-check' : 'fa-solid fa-download' }),
    installing.has(hit.id) ? 'Instaluję…' : isInstalled ? 'Zainstalowany' : contentType === 'modpack' ? 'Utwórz profil' : 'Instaluj');
  btn.addEventListener('click', () => installHit(hit));
  return el('div', { className: 'project' },
    projectIcon(hit.iconUrl),
    el('div', { className: 'project-main' },
      el('b', {}, hit.title, el('small', { textContent: `od ${hit.author}` })),
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
    if (!confirm(`Usunąć ${item.title}?`)) return;
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
  if (contentTab === 'installed' && !isPack) {
    list.replaceChildren(...forType.map(installedCard));
    if (!forType.length) list.append(el('p', { className: 'muted', textContent: 'Nic tu jeszcze nie ma.' }));
    $('#content-more').classList.add('hidden');
    return;
  }
  list.replaceChildren(...contentHits.map(hitCard));
  if (!contentHits.length) list.append(el('p', { className: 'muted', textContent: contentLoading ? 'Ładowanie…' : 'Brak wyników.' }));
  $('#content-more').classList.toggle('hidden', contentLoading || contentHits.length >= contentTotal);
}

async function refreshInstalled() {
  if (!contentProfileId()) return;
  installed = (await guard(() => api.listContent(contentProfileId()))) ?? [];
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
      toast(`Utworzono profil „${hit.title}”`);
      store.settings.selectedProfileId = id;
      showView('play');
    } else {
      const titles: string[] = await api.installContent(contentProfileId(), hit.id, contentType);
      toast(titles.length > 1 ? `Zainstalowano ${titles[0]} i zależności: ${titles.slice(1).join(', ')}` : `Zainstalowano ${titles[0]}`);
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
  const sel = $<HTMLSelectElement>('#content-profile');
  const current = sel.value || store.settings.selectedProfileId;
  fillSelect(sel, store.profiles.map((p) => ({ value: p.id, label: `${p.name} (${profileLabel(p)})` })), current);
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
    renderContent();
  }));
let searchTimer: number | undefined;
$('#content-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => searchContent(), 300);
});
$('#content-more').addEventListener('click', () => searchContent(true));
$('#content-profile').addEventListener('change', () => {
  refreshInstalled();
  searchContent();
});
$('#modpack-import').addEventListener('click', () => guard(async () => {
  const id = await api.importModpack();
  if (!id) return;
  toast('Zaimportowano modpack jako nowy profil');
  store.settings.selectedProfileId = id;
  showView('play');
}));
document.querySelector('.nav[data-view="content"]')?.addEventListener('click', () => {
  renderContentProfiles();
  refreshInstalled();
  if (!contentHits.length) searchContent();
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

// ---------- boot ----------

(async () => {
  startStars();
  store = await api.getStore();
  render();
  versions = (await guard(() => api.listVersions())) ?? [];
  renderProfiles();
})();
