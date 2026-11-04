/**
 * Screenshots of the website for the SlashClient wiki (server/src/wiki/seed/img/strona-*.webp and
 * kosmetyki-*.webp), made again from scratch on a local test server, never from production.
 *
 * Run from the repository root (needs `npm install` in the root and in server/):
 *
 *   npx electron scripts/wiki/site-shots.mjs [only…]
 *
 * It starts the server on port 8831 with a fresh database in a temporary folder
 * (`PORT=8831 DB_FILE=<tmp>/social.db ALLOW_DEV_LOGIN=1 ADMIN_HANDLES=Szef node src/index.ts`),
 * signs in test players only (Gracz, Steve, Alex, Szef) with the test sign-in (POST /v1/auth/dev),
 * gives them friends, a clan, a community, a shared log, a bug report, a benchmark and a picture
 * through the API, then opens the pages in a hidden Electron window and saves each shot as WebP
 * (at most 1280 px wide). Give names (e.g. `strona-profil kosmetyki-cape`) to make only those.
 * Set WIKI_SHOTS_OUT to save somewhere else than the seed folder.
 */
import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.WIKI_SHOTS_OUT ?? path.join(ROOT, 'server/src/wiki/seed/img');
const PORT = 8831;
const BASE = `http://localhost:${PORT}`;
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.mjs'));
const want = (name) => !ONLY.length || ONLY.includes(name);

// the pages in Polish (the pictures are shared by both languages of the wiki)
app.commandLine.appendSwitch('lang', 'pl-PL');
app.commandLine.appendSwitch('hide-scrollbars');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The server on a fresh database in a temporary folder; stopped when the script ends. */
async function startServer() {
  // a server left over from an earlier run would answer instead of a fresh one
  if (await fetch(`${BASE}/v1/health`).then((r) => r.ok, () => false)) throw new Error(`port ${PORT} is taken: stop the server running there first`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slashclient-wiki-shots-'));
  const server = spawn('node', ['--disable-warning=ExperimentalWarning', 'src/index.ts'], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, PORT: String(PORT), DB_FILE: path.join(dir, 'social.db'), ALLOW_DEV_LOGIN: '1', ADMIN_HANDLES: 'Szef', PUBLIC_URL: BASE,
      // made-up app ids only so the sign-in buttons show (nobody presses them here); no real keys
      DISCORD_CLIENT_ID: 'wiki-shots', DISCORD_CLIENT_SECRET: 'wiki-shots', GOOGLE_CLIENT_ID: 'wiki-shots', GOOGLE_CLIENT_SECRET: 'wiki-shots',
      GITHUB_CLIENT_ID: 'wiki-shots', GITHUB_CLIENT_SECRET: 'wiki-shots', MICROSOFT_CLIENT_ID: 'wiki-shots' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${BASE}/v1/health`).then((r) => r.ok, () => false)) return { server, dir };
    await wait(200);
  }
  server.kill();
  throw new Error('the server did not start');
}

/** One call to the API as a player (token) or as nobody. */
async function api(token, method, url, body, type) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers['Content-Type'] = type ?? 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : type ? body : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

const signIn = async (name) => (await api('', 'POST', '/v1/auth/dev', { name })).token;

/** A made-up game log: a few lines of a normal start, a warning and an error, as the launcher would share it. */
function sampleLog() {
  const t = (s) => `[12:0${Math.floor(s / 10)}:${String(10 + (s % 50)).padStart(2, '0')}]`;
  const lines = [
    `${t(1)} [main/INFO]: Loading Minecraft 1.21.11 with Fabric Loader 0.17.2`,
    `${t(2)} [main/INFO]: Loading 14 mods:`,
    `\t- fabric-api 0.141.6+1.21.11`, `\t- slashclient-hud 0.9.70`, `\t- sodium 0.7.2+mc1.21.11`, `\t- lithium 0.20.0+mc1.21.11`,
    `${t(3)} [Render thread/INFO]: Setting user: Gracz`,
    `${t(4)} [Render thread/INFO]: Backend library: LWJGL version 3.3.3`,
    `${t(5)} [Render thread/INFO]: [SlashClient HUD] Połączono z launcherem`,
    `${t(6)} [Render thread/WARN]: Missing sound for event: minecraft:item.goat_horn.play`,
    `${t(7)} [Render thread/INFO]: Reloading ResourceManager: vanilla, fabric, slashclient-hud`,
    `${t(8)} [Render thread/INFO]: Sound engine started`,
    `${t(9)} [Render thread/INFO]: Created: 1024x1024x4 minecraft:textures/atlas/blocks.png-atlas`,
    `${t(10)} [Server thread/INFO]: Starting integrated minecraft server version 1.21.11`,
    `${t(11)} [Server thread/INFO]: Preparing level "Nowy świat"`,
    `${t(12)} [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 2034ms or 40 ticks behind`,
    `${t(13)} [Render thread/ERROR]: Failed to load texture: examplemod:textures/item/ruby.png`,
    `java.io.FileNotFoundException: examplemod:textures/item/ruby.png`,
    `\tat net.minecraft.server.packs.resources.ResourceManager.getResourceOrThrow(ResourceManager.java:42)`,
    `${t(14)} [Server thread/INFO]: Gracz joined the game`,
    `${t(15)} [Render thread/INFO]: [CHAT] Gracz joined the game`,
    `${t(16)} [Server thread/INFO]: Saving chunks for level 'ServerLevel[Nowy świat]'/minecraft:overworld`,
    `${t(17)} [Render thread/INFO]: Stopping!`,
  ];
  return lines.join('\n') + '\n';
}

/** Everything the pages show: players, friends, a clan, a community, shared things. */
async function seed() {
  const tok = {};
  for (const name of ['Szef', 'Gracz', 'Steve', 'Alex']) tok[name] = await signIn(name);
  // friends: asking each other is a yes
  for (const [a, b] of [['Gracz', 'Steve'], ['Gracz', 'Alex'], ['Gracz', 'Szef'], ['Steve', 'Alex']]) {
    await api(tok[a], 'POST', '/v1/friends/requests', { handle: b });
    await api(tok[b], 'POST', '/v1/friends/requests', { handle: a });
  }
  // what Gracz wears: free items of a few slots (whatever the catalogue offers him now)
  const catalog = await api(tok.Gracz, 'GET', '/v1/cosmetics');
  const items = catalog.items ?? [];
  const free = (slot, prefer) => (prefer.map((id) => items.find((i) => i.id === id && i.slot === slot && i.available)).find(Boolean)
    ?? items.find((i) => i.slot === slot && i.available))?.id;
  const loadout = Object.fromEntries([['wings', ['angel']], ['hat', ['crown']], ['pet', ['allay']], ['top', ['scarf']], ['aura', ['enchant']]]
    .map(([slot, prefer]) => [slot, free(slot, prefer)]).filter(([, id]) => id));
  await api(tok.Gracz, 'POST', '/v1/me', { cape: free('cape', ['ocean']) ?? '', loadout });
  // a clan and a public community
  await api(tok.Gracz, 'POST', '/v1/clans', { tag: 'SLX', name: 'Slashowcy' }).catch((e) => console.warn(String(e)));
  const community = await api(tok.Szef, 'POST', '/v1/communities', {
    name: 'Budowniczowie', tag: 'build', visibility: 'public', joinMode: 'open',
    description: 'Budujemy razem. Pokaż swoją budowlę! Wspólne budowanie i konkursy co tydzień.',
  }).catch((e) => console.warn(String(e)));
  const communityId = community?.community?.id;
  if (communityId) for (const name of ['Gracz', 'Steve', 'Alex']) await api(tok[name], 'POST', `/v1/communities/${communityId}/join`).catch((e) => console.warn(String(e)));
  // a few messages in its general channel (community chats are not end-to-end encrypted, so the API takes plain text)
  const channelId = community?.community?.channels?.find((c) => c.kind !== 'announcements')?.id ?? community?.community?.channels?.[0]?.id;
  if (communityId && channelId) {
    for (const [name, text] of [['Szef', 'Witajcie w Budowniczych! W piątek startuje konkurs: zamek w stylu średniowiecznym.'],
      ['Steve', 'Super, już zbieram kamień 😄'], ['Gracz', 'Można budować w parach?'], ['Szef', '@Gracz tak, maksymalnie dwie osoby w drużynie.'],
      ['Alex', 'To ja się zgłaszam z @Steve!']]) {
      await api(tok[name], 'POST', `/v1/communities/${communityId}/channels/${channelId}/messages`, { text }).catch((e) => console.warn(String(e)));
    }
  }
  // the community verified by the team, with an invite link for a week and 25 uses
  let communityLink;
  if (communityId) {
    await api(tok.Szef, 'POST', `/v1/admin/communities/${communityId}/verified`, { verified: true }).catch((e) => console.warn(String(e)));
    communityLink = (await api(tok.Szef, 'POST', `/v1/communities/${communityId}/links`, { minutes: 10080, uses: 25 }).catch((e) => console.warn(String(e))))?.link?.code;
  }
  // a shared log, a bug report with it (answered by the team) and a benchmark
  const log = await api(tok.Gracz, 'POST', '/v1/logs', sampleLog(), 'text/plain; charset=utf-8');
  const logId = log.id ?? String(log.url ?? '').split('/').pop();
  const bug = await api(tok.Gracz, 'POST', '/v1/bugs', {
    title: 'Gra zamyka się przy wczytywaniu świata', logId, version: '0.9.70', os: 'Windows 11',
    body: 'Po kliknięciu Graj gra się uruchamia, ale przy wczytywaniu świata „Nowy świat” zamyka się bez komunikatu. Log w załączniku. Bez moda examplemod działa.',
  });
  await api(tok.Szef, 'POST', `/v1/bugs/${bug.bug.id}/comments`, { body: 'Dzięki za log! Winny jest mod examplemod – brakuje w nim tekstury. Zgłosiliśmy to jego autorowi, a do tego czasu usuń go z profilu.' });
  await api(tok.Szef, 'PATCH', `/v1/bugs/${bug.bug.id}`, { status: 'confirmed' });
  for (const [title, status] of [['Minimapa miga po zmianie wymiaru', 'fixed'], ['Literówka w ustawieniach HUD', 'closed'], ['Czat znajomych nie przewija się do końca', 'open']]) {
    const b = await api(tok.Steve, 'POST', '/v1/bugs', { title, body: `${title}. Zdarza się od ostatniej aktualizacji, opis kroków w komentarzu.`, version: '0.9.69', os: 'Windows 10' });
    if (status !== 'open') await api(tok.Szef, 'PATCH', `/v1/bugs/${b.bug.id}`, { status });
  }
  const bench = await api('', 'POST', '/v1/benchmarks', {
    kind: 'scene', version: '1.21.11', at: Date.now(), frames: 52_000, stutters: 3, cpuUse: 46, gpuUse: 88,
    fps: { avg: 287, low1: 164, low01: 121 },
    scenes: [['forest', 262, 158], ['panorama', 241, 149], ['village', 276, 171], ['water', 318, 190], ['entities', 233, 139], ['particles', 298, 166], ['night', 341, 205]]
      .map(([id, avg, low1]) => ({ id, avg, low1 })),
    settings: { renderDistance: 12, width: 1920, height: 1080, vsync: false, fullscreen: true, mods: 14, memoryMb: 4096 },
    device: { os: 'Windows 11', cpu: 'AMD Ryzen 5 7600', threads: 12, ramGb: 32, gpu: 'NVIDIA GeForce RTX 4060', java: 'Java 21.0.8 (Mojang)' },
  });
  // a shared picture (one of the site's own game pictures)
  const media = await api(tok.Gracz, 'POST', `/v1/media?title=${encodeURIComponent('Moja baza na wyspie')}`, fs.readFileSync(path.join(ROOT, 'server/web/img/hud-game.jpg')), 'image/jpeg');
  const referral = await api(tok.Gracz, 'GET', '/v1/referrals').catch(() => undefined);
  return { tok, communityId, channelId, communityLink, communityTag: 'build', logId, bugId: bug.bug.id, benchId: bench.id, mediaId: media.media?.id, referralCode: referral?.code ?? referral?.mine?.code };
}

/** The hidden window the pages are shown in. */
function makeWindow(width = 1280, height = 860, zoomFactor = 1, partition = 'wiki-desktop') {
  // each window kind in a session of its own, kept in memory only: Chromium remembers a zoom per site within a session
  const win = new BrowserWindow({ width, height, show: false, webPreferences: { backgroundThrottling: false, zoomFactor, partition } });
  // a new window is no bigger than the screen (a small one on a test machine); a size set afterwards is kept
  win.setContentSize(width, height);
  return win;
}

async function open(win, url, token) {
  // the site keeps its sign-in in localStorage: set (or cleared) on the site first, then the page
  await win.loadURL(`${BASE}/robots.txt`);
  await win.webContents.executeJavaScript(token ? `localStorage.setItem('slashclient.token', ${JSON.stringify(token)})` : `localStorage.clear()`);
  await win.loadURL(BASE + url);
  await settle(win);
}

/** Waits until the page's own loading is done (fonts, pictures, the 3D figure). */
async function settle(win, ms = 1500) {
  await win.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true');
  await wait(ms);
}

const js = (win, code) => win.webContents.executeJavaScript(code);

/** Clicks the first element matching `selector` whose text includes `text`. */
async function click(win, selector, text = '') {
  const ok = await js(win, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)}));
    if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } return !!b; })()`);
  if (!ok) console.warn(`not found: ${selector} "${text}"`);
  await settle(win, 1200);
  return ok;
}

/**
 * Saves a shot: the whole window, the box of `selector` (with a margin), or a given rectangle; the
 * picture is made WebP by the browser itself (a canvas), at most 1280 px wide.
 */
async function shot(win, name, { selector, margin = 16, maxHeight = 1200 } = {}) {
  if (!want(name)) return;
  let rect;
  const [w0, h0] = win.getContentSize();
  if (selector) {
    // the site's bar stays at the top of the page (not over the element), the cookie-like banners away
    await js(win, `(() => { const s = document.createElement('style'); s.textContent = '.nav { position: static !important; } .site-banner, #toasts { display: none !important; } .reveal { opacity: 1 !important; transform: none !important; transition: none !important; }'; document.head.append(s); })()`);
    // the element where it is in the page; the window grows to hold all of it (up to maxHeight)
    const r = await js(win, `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
      const b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; })()`);
    if (!r || !r.width || !r.height) { console.warn(`${name}: ${selector} not found`); return; }
    const top = Math.max(0, Math.floor(r.y - margin));
    const height = Math.min(maxHeight, Math.ceil(r.height + 2 * margin) + (r.y - margin < 0 ? Math.floor(r.y - margin) : 0));
    win.setContentSize(w0, Math.max(h0, height));
    await js(win, `window.scrollTo(0, ${top})`);
    await wait(700);
    const y = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return b.top; })()`);
    const x = Math.max(0, Math.floor(r.x - margin));
    const yy = Math.max(0, Math.floor(y - margin));
    rect = { x, y: yy, width: Math.min(w0 - x, Math.ceil(r.width + 2 * margin)), height: Math.min(Math.max(h0, height) - yy, height) };
  }
  const image = await win.webContents.capturePage(rect);
  win.setContentSize(w0, h0);
  const png = image.toDataURL();
  const webp = await toWebp(png);
  const file = path.join(OUT, `${name}.webp`);
  fs.writeFileSync(file, Buffer.from(webp.split(',')[1], 'base64'));
  console.log(`${name}.webp ${Math.round(fs.statSync(file).size / 1024)} kB`);
}

let encoder;
/** PNG data URL → WebP data URL (quality 0.82, at most 1280 px wide), drawn in a hidden page. */
async function toWebp(png) {
  encoder ??= new BrowserWindow({ show: false });
  if (!encoder.webContents.getURL()) await encoder.loadURL('data:text/html,<title>enc</title>');
  return encoder.webContents.executeJavaScript(`new Promise((done) => { const img = new Image(); img.onload = () => {
    const scale = Math.min(1, 1280 / img.width); const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
    done(c.toDataURL('image/webp', 0.82)); }; img.src = ${JSON.stringify(png)}; })`);
}

/** What each wiki picture of a cosmetic slot shows: the slot's tab and an item worn by the admin (who may wear all). */
const SLOT_SHOTS = [
  ['cape', 'Peleryna', 'aurora'], ['wings', 'Skrzydła', 'dragon'], ['elytra', 'Elytra', 'nebula'], ['trail', 'Ślad', 'hearts'],
  ['aura', 'Aura', 'enchant'], ['pet', 'Pupil', 'allay'], ['hat', 'Na głowę', 'crown'], ['top', 'Ubranie', 'scarf'],
  ['kill', 'Efekt zabójstwa', 'confetti'], ['suit', 'Strój', 'astronaut'], ['shield', 'Tarcza', 'shield_dragon'], ['weapon', 'Skórka broni', 'sword_katana'],
  ['shoes', 'Buty', 'rocketboots'], ['hands', 'Dłonie', 'boxinggloves'], ['face', 'Twarz', 'sunglasses'], ['ears', 'Uszy i rogi', 'catears'],
  ['back', 'Na plecy', 'jetpack'], ['tail', 'Ogon', 'foxtail'], ['ring', 'Krąg pod stopami', 'ring_galaxy'], ['move', 'Efekt ruchu', 'move_petals'],
  ['spray', 'Spray', 'spray_gg'], ['prop', 'Rekwizyt', 'wheelbarrow_flowers'],
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server } = await startServer();
  try {
    const s = await seed();
    const win = makeWindow();

    // the home page: the top, the download block
    await open(win, '/');
    await shot(win, 'strona-glowna', { selector: '.hero2', margin: 0, maxHeight: 1000 });
    await shot(win, 'strona-pobierz', { selector: '.hero2 .wrap.center', margin: 24 });

    // the account page signed out, then Gracz's tabs
    await open(win, '/konto');
    // the test sign-in (a nick only) is this test server's, players never see it
    await js(win, `document.querySelector('input[maxlength="16"]')?.closest('form, .row, div')?.remove()`);
    await shot(win, 'strona-konto-logowanie', { selector: 'main', margin: 0, maxHeight: 640 });
    await open(win, '/konto#profil', s.tok.Gracz);
    await shot(win, 'strona-konto-profil', { selector: 'main', margin: 0 });
    for (const [hash, name, label] of [['kosmetyki', 'strona-konto-kosmetyki', 'Kosmetyki'], ['prywatnosc', 'strona-konto-prywatnosc', 'Prywatność'],
      ['streamy', 'strona-konto-streamy', 'Streamy'], ['wsparcie', 'strona-konto-wsparcie', 'Wsparcie']]) {
      if (!want(name)) continue;
      await open(win, `/konto#${hash}`, s.tok.Gracz);
      await click(win, '[role=tab]', label);
      await shot(win, name, { selector: 'main', margin: 0 });
    }
    // the sets as a player sees them: what he has, what is missing and how to get it
    if (want('kosmetyki-zestawy')) {
      await open(win, '/konto#kosmetyki', s.tok.Gracz);
      await click(win, '.slot-tabs button', 'Zestawy');
      await shot(win, 'kosmetyki-zestawy', { selector: '.account-cosmetics .card', margin: 8, maxHeight: 1100 });
    }
    // a player's cape tab: free ones, earned ones (locked) and the shop's (with prices)
    if (want('kosmetyki-zdobywanie')) {
      await open(win, '/konto#kosmetyki', s.tok.Gracz);
      await shot(win, 'kosmetyki-zdobywanie', { selector: '.account-cosmetics .card', margin: 8, maxHeight: 900 });
    }

    // every slot: the admin wears one item of it, its tab open
    for (const [slot, label, id] of SLOT_SHOTS) {
      const name = `kosmetyki-${slot}`;
      if (!want(name)) continue;
      await api(s.tok.Szef, 'POST', '/v1/me', slot === 'cape' ? { cape: id, loadout: Object.fromEntries(SLOT_SHOTS.slice(1).map(([sl]) => [sl, ''])) }
        : { cape: slot === 'back' || slot === 'tail' ? 'slash' : '', loadout: { ...Object.fromEntries(SLOT_SHOTS.slice(1).map(([sl]) => [sl, ''])), [slot]: id } });
      await open(win, '/konto#kosmetyki', s.tok.Szef);
      await click(win, '.slot-tabs button', label);
      await settle(win, slot === 'kill' || slot === 'move' || slot === 'trail' || slot === 'aura' ? 2500 : 1200);
      await shot(win, name, { selector: '.account-cosmetics .cosmetic-stage', margin: 8, maxHeight: 720 });
    }

    // the public profile, a community, the shared things
    await open(win, '/u/Gracz');
    await shot(win, 'strona-profil', { selector: 'main', margin: 0 });
    await open(win, `/s/${s.communityTag}`);
    await shot(win, 'strona-spolecznosc', { selector: 'main', margin: 0 });
    if (s.communityLink) {
      await open(win, `/c/${s.communityLink}`);
      await shot(win, 'strona-zaproszenie-spolecznosc');
    }
    if (s.mediaId) {
      await open(win, `/media/${s.mediaId}`);
      await shot(win, 'strona-media', { selector: 'main', margin: 0 });
    }
    await open(win, `/logi/${s.logId}`);
    await shot(win, 'strona-logi', { selector: 'main', margin: 0 });
    await open(win, `/benchmark/${s.benchId}`);
    await shot(win, 'strona-benchmark', { selector: 'main', margin: 0 });
    await open(win, '/zgloszenia', s.tok.Gracz);
    await shot(win, 'strona-zgloszenia', { selector: 'main', margin: 0 });
    await open(win, `/zgloszenia/${s.bugId}`, s.tok.Gracz);
    await shot(win, 'strona-zgloszenie', { selector: 'main', margin: 0 });
    await open(win, '/wsparcie');
    await shot(win, 'strona-wsparcie');
    await open(win, '/zmiany');
    await shot(win, 'strona-zmiany');
    if (s.referralCode) {
      await open(win, `/z/${s.referralCode}`);
      await shot(win, 'spolecznosc-polecenie-strona');
    }
    await open(win, '/app/');
    await shot(win, 'strona-aplikacja');

    // the phone app as on a phone (a phone's browser, a narrow window), signed in as Gracz
    // Steve and Alex online on their phones (each in a browser of its own), so Gracz's list shows them so
    const others = [];
    for (const name of ['Steve', 'Alex']) {
      const w = makeWindow(400, 700, 1, `wiki-${name}`);
      w.webContents.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
      await open(w, '/app/#/friends', s.tok[name]);
      others.push(w);
    }
    // twice the pixels of a 400 × 650 phone screen, for a sharp picture
    const phone = makeWindow(800, 1300, 2, 'wiki-phone');
    phone.webContents.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
    await open(phone, '/app/#/friends', s.tok.Gracz);
    await settle(phone, 2500);
    await shot(phone, 'strona-aplikacja-telefon');
    await shot(phone, 'spolecznosc-znajomi-telefon');
    if (s.communityId && s.channelId) {
      await phone.loadURL(`${BASE}/app/#/community/${s.communityId}/${s.channelId}`);
      await settle(phone, 2500);
      await shot(phone, 'spolecznosc-spolecznosci-czat');
    }
    await phone.loadURL(`${BASE}/app/#/communities`);
    await settle(phone, 2000);
    await shot(phone, 'spolecznosc-spolecznosci-lista');
    await phone.loadURL(`${BASE}/app/#/me`);
    await settle(phone, 2000);
    await shot(phone, 'spolecznosc-status-telefon');
  } finally {
    server.kill();
  }
}

app.whenReady().then(main).then(() => app.quit(), (err) => {
  console.error(err);
  app.exit(1);
});
