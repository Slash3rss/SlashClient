/**
 * Screenshots of the launcher for the wiki (server/src/wiki/seed/img/launcher-*.webp).
 *
 * Everything runs in isolation: a local SlashClient server on port 8821 with a fresh database in a
 * temporary folder, test players only (Gracz, Steve, Alex, Szef, Tester), and the launcher with its
 * own SLASHCLIENT_HOME and --user-data-dir in that folder. Nothing touches the real player's data or
 * production; the launcher still reads public pages (Mojang's news and versions, Modrinth, the server
 * list, minecraft.wiki) the way it does for every player.
 *
 * How to run it (from the repository's root):
 *   npm run build
 *   git checkout -- server/web/vendor/fa/css/all.min.css
 *   node scripts/wiki/launcher-shots.mjs              all screenshots
 *   node scripts/wiki/launcher-shots.mjs graj sklep   only these (names without "launcher-")
 *
 * Needs: server/node_modules (cd server && npm ci), Electron from the root's node_modules, and
 * Python 3 with Pillow (pip install pillow) for the WebP files. Options in the environment:
 *   SHOTS_TMP      the temporary folder (default: <system temp>/slashclient-wiki-launcher), wiped first
 *   SHOTS_VERSION  the version the built launcher reports to the server (default 0.9.70), so the newest
 *                  cosmetics show; only dist/main.js is changed (ignored by git), never package.json
 *   SHOTS_HUD_BUNDLE  a folder with slashclient-hud-*.jar to copy into dist/hud when the build had no mod
 *   SHOTS_KEEP=1   leave the server and the launcher running at the end (to look around)
 */

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'server', 'src', 'wiki', 'seed', 'img');
const TMP = process.env.SHOTS_TMP ?? path.join(os.tmpdir(), 'slashclient-wiki-launcher');
const PORT = 8821;
const DEBUG_PORT = 9341;
const API = `http://localhost:${PORT}`;
const WIDTH = 1280;
const HEIGHT = 800;
const only = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;
const NOW = Date.now();

const children = [];
function cleanup() {
  if (process.env.SHOTS_KEEP === '1') return;
  for (const c of children) {
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
      else c.kill();
    } catch { /* gone already */ }
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(1));

// ---------------------------------------------------------------- the server

async function startServer() {
  if (!existsSync(path.join(ROOT, 'server', 'node_modules', 'ws'))) throw new Error('server/node_modules is missing: cd server && npm ci');
  const db = path.join(TMP, 'social.db');
  const server = spawn(process.execPath, ['src/index.ts'], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, PORT: String(PORT), DB_FILE: db, ALLOW_DEV_LOGIN: '1', ADMIN_HANDLES: 'Szef', PUBLIC_URL: API },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(server);
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(`[serwer] ${d}`));
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${API}/v1/health`).then((r) => r.ok).catch(() => false)) return db;
    await sleep(200);
  }
  throw new Error('the server did not start');
}

async function api(token, method, url, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-SlashClient': `launcher/${process.env.SHOTS_VERSION ?? '0.9.70'}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/** A player kept connected, so friends see them online or in game. */
function connect(token, activity) {
  const ws = new WebSocket(`ws://localhost:${PORT}/v1/ws`);
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'auth', token, presence: { status: 'online', ...(activity ? { activity: { ...activity, since: NOW - 40 * 60_000 } } : {}) } })));
  ws.addEventListener('error', () => {});
  return ws;
}

async function seed(dbFile) {
  const users = {};
  for (const name of ['Gracz', 'Steve', 'Alex', 'Szef', 'Tester']) users[name] = await api(undefined, 'POST', '/v1/auth/dev', { name });
  const tok = (n) => users[n].token;
  const id = (n) => users[n].user.id;
  // friends: each asks the other, which makes them friends at once; Tester's request waits
  for (const f of ['Steve', 'Alex', 'Szef']) {
    await api(tok('Gracz'), 'POST', '/v1/friends/requests', { handle: f });
    await api(tok(f), 'POST', '/v1/friends/requests', { handle: 'Gracz' });
  }
  await api(tok('Steve'), 'POST', '/v1/friends/requests', { handle: 'Alex' });
  await api(tok('Alex'), 'POST', '/v1/friends/requests', { handle: 'Steve' });
  await api(tok('Tester'), 'POST', '/v1/friends/requests', { handle: 'Gracz' });

  // days played, servers and a gift of sparks, straight into the database (as if Gracz had played for two weeks)
  const sql = new DatabaseSync(dbFile);
  sql.exec('PRAGMA busy_timeout = 5000');
  const day = (n) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
  for (let n = 1; n <= 14; n++) sql.prepare('INSERT OR REPLACE INTO play_days (uuid, day, seconds) VALUES (?, ?, ?)').run(id('Gracz'), day(n), 2400 + (n % 4) * 900);
  for (const [i, s] of ['play.example.pl', 'survival.example.pl', 'minigry.example.pl'].entries()) {
    sql.prepare('INSERT OR IGNORE INTO play_servers (uuid, server, first_at) VALUES (?, ?, ?)').run(id('Gracz'), s, NOW - (10 - i) * DAY);
  }
  const balance = 2600;
  sql.prepare('INSERT INTO sparks_ledger (uuid, amount, reason, ref, note, by_uuid, balance, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id('Gracz'), balance, 'admin', '', 'Na start', id('Szef'), balance, NOW - 5 * DAY);
  sql.prepare('INSERT INTO sparks_wallets (uuid, balance) VALUES (?, ?) ON CONFLICT (uuid) DO UPDATE SET balance = excluded.balance').run(id('Gracz'), balance);
  sql.close();

  // a few things bought in the shop: the wolf set whole and one cape
  const { items } = await api(tok('Gracz'), 'GET', '/v1/cosmetics');
  for (const want of ['wolfears', 'wolftail', 'desert']) {
    const it = items.find((i) => i.id === want);
    if (it?.price) await api(tok('Gracz'), 'POST', `/v1/shop/${want}/buy`, {}).catch((e) => console.warn(e.message));
  }
  await api(tok('Gracz'), 'POST', '/v1/me', { cape: 'desert', loadout: { ears: 'wolfears', tail: 'wolftail' } }).catch((e) => console.warn(e.message));

  // a group, a clan and a community
  const { group } = await api(tok('Gracz'), 'POST', '/v1/groups', { name: 'Wieczorne granie', members: [id('Steve'), id('Alex')] });
  await api(tok('Steve'), 'POST', `/v1/groups/${group.id}/messages`, { text: 'Gramy dziś o 20?' });
  await api(tok('Alex'), 'POST', `/v1/groups/${group.id}/messages`, { text: 'Jasne, biorę mapę 😄' });
  await api(tok('Gracz'), 'POST', '/v1/clans', { tag: 'SLSH', name: 'Slashowcy' });
  await api(tok('Gracz'), 'POST', '/v1/clans/invites', { handle: 'Steve' }).catch((e) => console.warn(e.message));
  const com = await api(tok('Szef'), 'POST', '/v1/communities', { name: 'Budowniczowie', description: 'Wspólne budowanie, zrzuty budowli i projekty na serwerach.', visibility: 'public', joinMode: 'open' });
  const comId = com.community.id;
  for (const n of ['Gracz', 'Steve', 'Alex']) await api(tok(n), 'POST', `/v1/communities/${comId}/join`, {});
  const channels = (await api(tok('Szef'), 'GET', `/v1/communities/${comId}`)).community.channels;
  const general = channels.find((c) => c.kind === 'general') ?? channels.find((c) => c.kind !== 'announcements') ?? channels[0];
  for (const [n, text] of [['Szef', 'Witajcie w Budowniczych! Wrzucajcie zrzuty swoich budowli.'], ['Steve', 'Skończyłem właśnie zamek nad rzeką, zrzut wieczorem.'], ['Alex', 'Ktoś chętny na wspólną wioskę na serwerze?'], ['Steve', 'Ja! Mam wolny weekend.']]) {
    await api(tok(n), 'POST', `/v1/communities/${comId}/channels/${general.id}/messages`, { text });
    await sleep(50);
  }
  // direct messages from Steve (sent as plain text, like from a launcher without a chat key)
  await api(tok('Steve'), 'POST', `/v1/messages/${id('Gracz')}`, { text: 'Hej! Wbijasz na serwer?' });
  await api(tok('Steve'), 'POST', `/v1/messages/${id('Gracz')}`, { text: 'Jestem przy spawnie, mam dla Ciebie diamenty 💎' });

  // friends online: Steve on a server, Alex in the menu, Szef in the launcher
  connect(tok('Steve'), { kind: 'server', version: '1.21.4 · Fabric', server: 'play.example.pl' });
  connect(tok('Alex'), { kind: 'menu', version: '26.3 · Fabric' });
  connect(tok('Szef'));
  return { users };
}

// ---------------------------------------------------------------- the launcher's data

const PROFILES = [
  { id: 'p-slash', name: 'SlashClient 26.3', versionId: '26.3', loader: 'fabric', icon: 'block:diamond-ore', hud: true, playTimeMs: 31 * 3600_000, lastPlayedAt: NOW - 3 * 3600_000, lastTarget: { kind: 'server', address: 'play.example.pl' } },
  { id: 'p-survival', name: 'Survival z ekipą', versionId: '1.21.4', loader: 'fabric', icon: 'block:grass', hud: true, playTimeMs: 12 * 3600_000, lastPlayedAt: NOW - 2 * DAY },
  { id: 'p-vanilla', name: 'Czysty Minecraft', versionId: 'latest-release', loader: 'vanilla', icon: 'block:stone', hud: false, playTimeMs: 2 * 3600_000, lastPlayedAt: NOW - 6 * DAY },
];

function writeLauncherHome(home, slashId) {
  const config = path.join(home, 'config');
  mkdirSync(config, { recursive: true });
  const version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const profiles = PROFILES.map((p) => ({
    loaderVersion: '', iconVersion: 0, syncOptions: true, gameDir: '', memoryMb: 4096, jvmArgs: '', jvmPreset: 'g1', javaPath: '', width: 854, height: 480, ...p,
  }));
  const store = {
    // an offline account shows the skin of the premium player with its nick: this one has none (the default skin)
    accounts: [{ id: 'acc-gracz', type: 'offline', name: 'TestowyGracz', uuid: '5f1c2a7e0b9d4c3e8a6f1b2d3c4e5f60' }],
    profiles,
    settings: {
      msClientId: '', closeOnLaunch: false, discordEnabled: false, language: 'pl', socialUrl: API, socialStatus: 'online',
      selectedProfileId: 'p-slash', selectedAccountId: 'acc-gracz', firstRunDone: true, seasonalLook: false,
      whatsNewAfterUpdate: false, lastRunVersion: process.env.SHOTS_VERSION ?? version, changelogSeen: process.env.SHOTS_VERSION ?? version,
      launcherWindow: `${WIDTH}x${HEIGHT}`, systemNotifications: false,
      // still 3D figures (the skin faces the camera); the box is shown unticked on the settings screenshot
      reduceMotion: true,
      // no "Masz kod od znajomego?" over the screenshots
      referralPromptSkipped: [slashId],
    },
  };
  writeFileSync(path.join(config, 'launcher.json'), JSON.stringify(store, null, 2));

  // statistics and the last sessions' summaries
  const sessions = [];
  const summaries = [];
  const places = ['play.example.pl', 'survival.example.pl', '', 'minigry.example.pl'];
  for (let n = 1; n <= 24; n++) {
    const p = PROFILES[n % 3 === 0 ? 1 : 0];
    const start = NOW - n * DAY * 0.6 - (n % 5) * 3600_000;
    const end = start + (35 + (n * 17) % 80) * 60_000;
    const address = places[n % places.length];
    sessions.push({ start, end, profileId: p.id, profileName: p.name, versionId: p.versionId, loader: p.loader, servers: address ? [{ address, at: start + 60_000 }] : [] });
    summaries.push({
      id: String(start), start, end, profileId: p.id, profileName: p.name, versionId: p.versionId, loader: p.loader, crashed: n === 5,
      places: address ? [{ kind: 'server', name: address, address, ms: end - start - 60_000 }] : [{ kind: 'world', name: 'Nowy świat', ms: end - start }],
      stats: {
        complete: true, playMs: end - start, deaths: n % 4, kills: { players: n % 3 === 0 ? 4 : 1, mobs: 20 + n }, damage: { dealt: 310 + n * 7, taken: 120 + n * 3 },
        blocks: { mined: 640 + n * 31, placed: 220 + n * 12 }, distance: { walk: 2100, sprint: 3400, swim: 120, fly: 0, elytra: n % 2 ? 1800 : 0, ride: 0 },
        messages: 6 + (n % 7), commands: 3, screenshots: 0, clips: 0, fps: { avg: 142 - n, low1: 71, frames: 300000 }, longestLifeMs: 30 * 60_000,
      },
      screenshots: [], screenshotCount: 0, clips: [], clipCount: 0,
      context: { todayMs: end - start, streak: 14 - Math.min(n, 13), longestIn30Days: n === 2 },
    });
  }
  sessions.sort((a, b) => a.start - b.start);
  summaries.sort((a, b) => a.start - b.start);
  writeFileSync(path.join(home, 'stats.json'), JSON.stringify(sessions));
  writeFileSync(path.join(home, 'session-summaries.json'), JSON.stringify(summaries));

  // one earlier console session, so the Console tab has something to show
  const consoleDir = path.join(home, 'console', 'p-slash');
  mkdirSync(consoleDir, { recursive: true });
  const t0 = NOW - 3 * 3600_000;
  const clock = (s) => new Date(t0 + s * 1000).toTimeString().slice(0, 8);
  const log = [
    [0, 'main/INFO', 'Loading Minecraft 26.3 with Fabric Loader 0.17.2'],
    [1, 'main/INFO', 'Loading 34 mods: slashclient-hud, sodium, lithium, fabric-api, modmenu…'],
    [2, 'main/WARN', 'Mod resolution: modmenu recommends a newer fabric-api'],
    [4, 'Render thread/INFO', 'Setting user: Gracz'],
    [6, 'Render thread/INFO', 'OpenGL 4.6 · NVIDIA GeForce RTX 3060'],
    [9, 'Render thread/INFO', 'SlashClient HUD: connected to the SlashClient server'],
    [11, 'Render thread/INFO', 'Reloading ResourceManager: vanilla, fabric, slashclient-hud'],
    [15, 'Render thread/INFO', 'Connecting to play.example.pl, 25565'],
    [16, 'Render thread/INFO', '[CHAT] Steve dołączył do gry'],
    [18, 'Render thread/WARN', 'Received passengers for unknown entity'],
    [21, 'Render thread/INFO', '[CHAT] <Steve> Witaj na serwerze!'],
    [24, 'Render thread/ERROR', 'Failed to load texture: minecraft:textures/entity/unknown.png'],
    [30, 'Render thread/INFO', 'Saved screenshot as 2026-11-04_18.12.44.png'],
    [52, 'Render thread/INFO', 'Stopping!'],
  ].map(([s, lvl, text]) => `[${clock(s)}] [${lvl}]: ${text}`).join('\n');
  writeFileSync(path.join(consoleDir, `${t0}.log`), `${log}\n`);
  writeFileSync(path.join(consoleDir, `${t0}.json`), JSON.stringify({ id: String(t0), start: t0, end: t0 + 52_000, code: 0, crashed: false }));

  // a couple of config files for the Configs tab
  const cfg = path.join(home, 'instances', 'p-slash', 'config');
  mkdirSync(cfg, { recursive: true });
  writeFileSync(path.join(cfg, 'sodium-options.json'), JSON.stringify({ quality: { weather_quality: 'DEFAULT', leaves_quality: 'FANCY', enable_vignette: true }, advanced: { enable_memory_tracing: false, use_advanced_staging_buffers: true, cpu_render_ahead_limit: 3 }, performance: { chunk_builder_threads: 0, always_defer_chunk_updates_v2: true, animate_only_visible_textures: true } }, null, 2));
  writeFileSync(path.join(cfg, 'modmenu.json'), JSON.stringify({ sorting: 'ascending', count_libraries: true, compact_list: false, show_libraries: false }, null, 2));
  writeFileSync(path.join(cfg, 'lithium.properties'), '# Lithium configuration\nmixin.ai.pathing=true\nmixin.entity.collisions=true\n');
}

/** The built launcher reports a newer version, so the server sends it the newest cosmetics (dist/ is not in git). */
function patchVersion() {
  const file = path.join(ROOT, 'dist', 'main.js');
  if (!existsSync(file)) throw new Error('dist/main.js is missing: npm run build first');
  const want = process.env.SHOTS_VERSION ?? '0.9.70';
  const src = readFileSync(file, 'utf8');
  const next = src.replace(/var APP_VERSION = true \? "[^"]+"/, `var APP_VERSION = true ? "${want}"`);
  if (next !== src) writeFileSync(file, next);
}

/**
 * The launcher lists the versions with SlashClient HUD from its jars in dist/hud (npm run build copies them from
 * hud/build/bundle). In a worktree without a built mod SHOTS_HUD_BUNDLE points at a folder with the jars.
 */
function hudJars() {
  const dist = path.join(ROOT, 'dist', 'hud');
  const has = existsSync(dist) && readdirSync(dist).some((f) => f.endsWith('.jar'));
  const from = process.env.SHOTS_HUD_BUNDLE;
  if (!has && from) {
    mkdirSync(dist, { recursive: true });
    for (const f of readdirSync(from)) if (/^slashclient-hud-.+\.jar$/.test(f)) copyFileSync(path.join(from, f), path.join(dist, f));
  } else if (!has) console.warn('dist/hud has no mod: the launcher will say SlashClient HUD is missing (hud/build-all.sh, or SHOTS_HUD_BUNDLE)');
}

function startLauncher(home) {
  // the electron package's main export is the path to its executable
  const electron = createRequire(path.join(ROOT, 'package.json'))('electron');
  const proc = spawn(electron, ['.', `--user-data-dir=${path.join(TMP, 'electron-data')}`, `--remote-debugging-port=${DEBUG_PORT}`], {
    cwd: ROOT,
    env: { ...process.env, SLASHCLIENT_SOCIAL_URL: API, SLASHCLIENT_HOME: home, ELECTRON_ENABLE_LOGGING: '0' },
    stdio: 'ignore',
  });
  children.push(proc);
  return proc;
}

// ---------------------------------------------------------------- the DevTools protocol

async function devtools() {
  for (let i = 0; i < 150; i++) {
    const pages = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((r) => r.json()).catch(() => []);
    const page = pages.find((p) => p.type === 'page' && /index\.html/.test(p.url));
    if (page) {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
      let next = 0;
      const waiting = new Map();
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && waiting.has(msg.id)) {
          waiting.get(msg.id)(msg);
          waiting.delete(msg.id);
        }
      });
      const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++next;
        waiting.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
        ws.send(JSON.stringify({ id, method, params }));
      });
      return send;
    }
    await sleep(200);
  }
  throw new Error('no launcher window on the debugging port');
}

let cdp;
/** Runs code in the page (an async function body, with the helpers below) and returns its value. */
async function run(code, tries = 20) {
  try {
    return await evaluate(`${HELPERS}; ${code}`);
  } catch (err) {
    // the page reloads once while starting (and after a language switch): tried again on the new page
    if (tries > 0 && /context was destroyed|Cannot find context/.test(err.message)) {
      await sleep(1000);
      return run(code, tries - 1);
    }
    throw err;
  }
}

async function evaluate(code) {
  const res = await cdp('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  return res.result.value;
}

// helpers available in the page as window.__w
const HELPERS = `
window.__w = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  async wait(sel, ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const e = typeof sel === 'function' ? sel() : document.querySelector(sel);
      if (e && (typeof sel === 'function' || e.offsetParent !== null || e.getClientRects().length)) return e;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('not found: ' + sel);
  },
  nav(v) { document.querySelector('.nav[data-view="' + v + '"]').click(); },
  byText(sel, text) { return [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text)); },
  closeModals() {
    document.querySelectorAll('.modal:not(.hidden) .modal-close, .modal:not(.hidden) [id$="-close"]').forEach((b) => b.click());
    document.querySelectorAll('body > .modal').forEach((m) => { if (!m.id) m.remove(); });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelectorAll('.notif').forEach((n) => n.remove());
  },
};`;

/** What must not get into a picture: this computer's name and folders, and the test server's address. */
const REPLACE = [
  [os.hostname(), 'MOJ-KOMPUTER'],
  [path.join(TMP, 'home'), String.raw`C:\Users\Gracz\AppData\Roaming\SlashClient`],
  [path.resolve(TMP), String.raw`C:\Users\Gracz\AppData\Local\Temp`],
  [os.homedir(), String.raw`C:\Users\Gracz`],
  [`localhost:${PORT}`, 'slashclient.pl'],
].filter(([from]) => from && from.length > 3)
  // the same folders written with forward slashes
  .flatMap(([a, b]) => (a.includes('\\') ? [[a, b], [a.replaceAll('\\', '/'), b]] : [[a, b]]));

async function shoot(name, selector, debugOnly = false) {
  await run(`document.querySelectorAll('.notif').forEach((n) => n.remove());
    const reps = ${JSON.stringify(REPLACE)};
    const fix = (t) => reps.reduce((s, [a, b]) => s.split(a).join(b), t);
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    document.querySelectorAll('input, textarea').forEach((i) => { const v = fix(i.value); if (v !== i.value) i.value = v; });
    // the window's own buttons (minimise, maximise, close) are drawn by Windows over the page and never get
    // into a page screenshot: drawn here the same way, so the top right does not look empty
    if (!document.getElementById('__shot-controls')) {
      const bar = document.createElement('div');
      bar.id = '__shot-controls';
      bar.style.cssText = 'position:fixed;top:0;right:0;height:36px;display:flex;z-index:2147483647;pointer-events:none;color:#c7cbe0;font:10px "Segoe Fluent Icons","Segoe MDL2 Assets"';
      for (const glyph of ['\\uE921', '\\uE922', '\\uE8BB']) {
        const b = document.createElement('span');
        b.style.cssText = 'width:46px;display:grid;place-items:center';
        b.textContent = glyph;
        bar.append(b);
      }
      document.body.append(bar);
    }
    await __w.sleep(300);`);
  let clip;
  if (selector) {
    const r = await run(`const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height };`);
    if (r) {
      const pad = 12;
      const x = Math.max(0, r.x - pad);
      const y = Math.max(0, r.y - pad);
      clip = { x, y, width: Math.min(WIDTH - x, r.w + 2 * pad), height: Math.min(HEIGHT - y, r.h + 2 * pad), scale: 1 };
    }
  }
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  const png = path.join(TMP, 'png', `launcher-${name}.png`);
  mkdirSync(path.dirname(png), { recursive: true });
  writeFileSync(png, Buffer.from(data, 'base64'));
  if (debugOnly) return;
  const out = path.join(OUT, `launcher-${name}.webp`);
  const py = spawnSync('python', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
if im.width > 1280:
    im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
q = 82
while True:
    im.save(sys.argv[2], 'WEBP', quality=q, method=6)
    import os
    if os.path.getsize(sys.argv[2]) < 120000 or q <= 60: break
    q -= 6
`, png, out], { encoding: 'utf8' });
  if (py.status !== 0) throw new Error(`Pillow: ${py.stderr}`);
  console.log(`  ${path.relative(ROOT, out)}`);
}

// ---------------------------------------------------------------- the screenshots

/** [name, what to do in the page before it, an element to crop to (optional)] */
const SHOTS = [
  ['graj', `__w.nav('play'); document.querySelector('#play-tabs [data-tab="news"]').click(); await __w.wait('#news .news-card, #news article, #news > *'); await __w.sleep(2500);`],
  ['nowosci-launchera', `__w.nav('play'); const b = document.querySelector('#play-tabs [data-tab="launcher"]'); b.classList.remove('hidden'); b.click(); await __w.wait('#launcher-news > *'); await __w.sleep(800);`],
  ['konsola', `__w.nav('play'); document.querySelector('#play-tabs [data-tab="console"]').click(); await __w.wait('#log > *'); await __w.sleep(500);`],
  ['profile', `__w.nav('profiles'); __w.byText('#profile-list li', 'SlashClient 26.3')?.click(); document.querySelector('#profile-tabs [data-pane="settings"]').click(); await __w.sleep(1200); document.querySelector('main').scrollTop = 0;`],
  ['nowy-profil', `__w.nav('profiles'); document.getElementById('profile-add').click(); await __w.sleep(1500);`],
  ['mody', `__w.closeModals(); __w.nav('profiles'); __w.byText('#profile-list li', 'SlashClient 26.3')?.click(); document.querySelector('#profile-tabs [data-pane="content"]').click(); await __w.wait('#content-list .project'); await __w.sleep(2500);`],
  ['szczegoly-projektu', `const b = await __w.wait('#content-list .project .pd-open, #content-list .project [title="Szczegóły"]'); b.click(); await __w.sleep(3500);`],
  ['configi', `__w.closeModals(); document.querySelector('#profile-tabs [data-pane="configs"]').click(); await __w.sleep(800); __w.byText('#config-pane button, #config-pane li, #config-pane .cfg-file', 'sodium-options')?.click(); await __w.sleep(1000);`],
  ['statystyki', `document.getElementById('stats-entry').click(); await __w.wait('#stat-cards > *'); await __w.sleep(1200);`],
  ['podsumowanie-sesji', `const r = await __w.wait('.ss-history-row'); r.click(); await __w.sleep(1500);`],
  ['benchmark', `__w.closeModals(); __w.byText('#profile-list li', 'SlashClient 26.3')?.click(); document.querySelector('#profile-tabs [data-pane="settings"]').click(); await __w.sleep(600); document.getElementById('bench-card').scrollIntoView({ block: 'center' }); await __w.sleep(600);`, '#bench-card'],
  ['profil-na-koncie', `document.getElementById('cloud-card').scrollIntoView({ block: 'center' }); await __w.sleep(800);`, '#cloud-card'],
  ['przenies-wersje', `document.getElementById('move-card').scrollIntoView({ block: 'center' }); await __w.sleep(800);`, '#move-card'],
  ['udostepnij-kodem', `document.querySelector('main').scrollTop = 0; document.getElementById('profile-share').click(); await __w.sleep(1500);`],
  ['importuj-profil', `__w.closeModals(); document.getElementById('profile-import').click(); await __w.sleep(1500);`],
  ['odkrywaj', `__w.closeModals(); __w.nav('discover'); document.querySelector('#content-type [data-type="shader"]')?.click(); await __w.sleep(800); await __w.wait('#content-list .project'); await __w.sleep(2500);`],
  ['serwery', `__w.nav('servers'); await __w.wait('#server-list .server'); await __w.sleep(2500);`],
  ['serwer-strona', `document.querySelectorAll('#server-list .server .server-name')[1].click(); await __w.sleep(3500);`],
  ['znajomi', `__w.closeModals(); __w.nav('friends'); const f = await __w.wait(() => __w.byText('.fr-friend', 'Steve')); f.click(); await __w.sleep(1500);
    const box = document.querySelector('.fr-composer textarea'); if (box && !document.querySelector('.fr-messages')?.textContent.includes('Już lecę')) { box.value = 'Już lecę, daj 2 minuty!'; box.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.fr-composer').requestSubmit(); await __w.sleep(1500); }`],
  ['grupa', `__w.byText('.fr-group:not(.fr-community)', 'Wieczorne')?.click(); await __w.sleep(1500);`],
  ['spolecznosc', `__w.byText('.fr-community', 'Budowniczowie')?.click(); await __w.sleep(2000);`],
  ['konto-i-profil', `document.querySelector('.fr-me button[title="Konto i profil"]').click(); await __w.sleep(1500);`],
  ['polec', `__w.closeModals(); const b = document.getElementById('friends-invite-btn'); b.classList.remove('hidden'); b.click(); await __w.sleep(2000);`],
  ['osiagniecia', `__w.closeModals(); __w.nav('achievements'); await __w.wait('#achievements-root .ach-card'); await __w.sleep(1500);`],
  ['wyzwania', `[...document.querySelectorAll('#achievements-root .ach-tab')].find((b) => b.textContent.includes('Wyzwania')).click(); await __w.sleep(2000);`],
  ['sklep', `document.getElementById('top-sparks').click(); await __w.wait('#shop-root .shop-card'); await __w.sleep(2500);`],
  ['sklep-zestawy', `[...document.querySelectorAll('#shop-root .ach-tab')].find((b) => b.textContent.includes('Zestawy')).click(); await __w.wait('#shop-root .set-card'); await __w.sleep(2500);`],
  ['sklep-historia', `[...document.querySelectorAll('#shop-root .ach-tab')].find((b) => b.textContent.includes('Historia')).click(); await __w.wait('#shop-root .ledger-row'); await __w.sleep(1000);`],
  ['konta', `__w.nav('accounts'); await __w.wait('#slash-cape-grid .cape-choice'); await __w.sleep(3000);`],
  ['kosmetyki-zestawy', `document.querySelector('#slot-tabs .set-tab')?.click(); await __w.sleep(2500);`],
  ['edytor-skina', `document.getElementById('skin-editor').click(); await __w.sleep(2500);`],
  ['biblioteka-skinow', `__w.closeModals(); if (!document.querySelector('#lib-grid > *')) { document.getElementById('lib-save').click(); await __w.wait('#lib-grid > *'); await __w.sleep(800); document.querySelector('#lib-grid > *').click(); await __w.sleep(800); } document.getElementById('skin-library').scrollIntoView({ block: 'center' }); await __w.sleep(800);`, '#skin-library'],
  ['konta-logowanie', `document.getElementById('offline-form').scrollIntoView({ block: 'end' }); await __w.sleep(800);`],
  ['wiki', `__w.nav('wiki'); await __w.sleep(1500); const first = document.querySelectorAll('.wiki-tabs button')[0]; first?.click(); await __w.sleep(1500); __w.byText('#wiki-root button', 'Crafting Table')?.click(); await __w.sleep(5000);`],
  ['ustawienia', `__w.nav('settings'); document.querySelector('main').scrollTop = 0; document.querySelector('#settings-form [name="reduceMotion"]').checked = false; await __w.sleep(1500);`],
  ['sprzatanie', `const b = __w.byText('#disk-card button', 'Sprawdź'); b?.click(); await __w.sleep(4000); document.getElementById('disk-card').scrollIntoView({ block: 'center' }); await __w.sleep(500);`, '#disk-card'],
  ['wsparcie', `document.getElementById('support-card').scrollIntoView({ block: 'center' }); await __w.sleep(800);`, '#support-card'],
  ['kreator', `__w.closeModals(); document.getElementById('wizard-open').click(); await __w.wait('#wizard'); await __w.sleep(1500);`],
  ['historia-zmian', `__w.closeModals(); document.querySelector('#wizard .wz-skip-all')?.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await __w.sleep(800); document.querySelector('main').scrollTop = 0; document.getElementById('changelog-open').click(); await __w.sleep(2500);`],
];

async function main() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  console.log(`Folder tymczasowy: ${TMP}`);
  const dbFile = await startServer();
  const { users } = await seed(dbFile);
  const home = path.join(TMP, 'home');
  writeLauncherHome(home, users.Gracz.user.id);
  hudJars();
  patchVersion();
  startLauncher(home);
  cdp = await devtools();
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await run(`await __w.wait(() => !document.body.classList.contains('booting') && document.getElementById('play-profile')?.options.length); await __w.sleep(2000);`);

  // sign in to SlashClient in Friends (the test server's nick field)
  await run(`__w.nav('friends'); const input = await __w.wait('.fr-dev input'); input.value = 'Gracz'; document.querySelector('.fr-dev button').click();
    await __w.wait('.fr-friend', 20000); await __w.sleep(3000);`);

  for (const [name, code, crop] of SHOTS) {
    if (only.length && !only.includes(name)) continue;
    try {
      await run(code);
      await shoot(name, crop);
    } catch (err) {
      console.error(`  ${name}: ${err.message}`);
      await shoot(`${name}-blad`, undefined, true).catch(() => {});
    }
  }
  if (process.env.SHOTS_KEEP === '1') console.log('SHOTS_KEEP=1: serwer i launcher działają dalej.');
  else process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
