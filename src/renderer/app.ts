import type { SlashApi } from '../main/preload';

declare global {
  interface Window {
    slash: SlashApi;
  }
}

interface PublicAccount { id: string; type: 'offline' | 'msa'; name: string; uuid: string }
interface Profile {
  id: string; name: string; versionId: string; gameDir: string; memoryMb: number;
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
  $('#hero-sub').textContent = profile ? `${versionLabel(profile.versionId)} · ${profile.memoryMb} MB RAM` : '';

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
        el('div', { className: 'grow' }, p.name, el('small', { textContent: versionLabel(p.versionId) })));
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
  $('#memory-value').textContent = `${profile.memoryMb} MB`;
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

$('#play-btn').addEventListener('click', async () => {
  if (store.running) return void api.kill();
  launching = true;
  log.replaceChildren();
  renderPlay();
  try {
    await api.launch($<HTMLSelectElement>('#play-profile').value, $<HTMLSelectElement>('#play-account').value);
    setProgress('Gra działa', 1);
  } catch (err) {
    setProgress('Błąd uruchamiania', 0);
    toast(errorText(err), true);
    appendLog(`[SlashClient] ${errorText(err)}`);
  } finally {
    launching = false;
    renderPlay();
  }
});

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
