import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, nativeImage, net, Notification, powerMonitor, protocol, safeStorage, screen, shell } from 'electron';
import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import { completeMicrosoftLogin, createOfflineAccount, ensureFreshAccount, gameSessionMargin, pollDeviceCode, startDeviceCode } from './auth';
import { setLang } from '../shared/i18n';
import { analyzeCrash } from './crash';
import { currentIconId, iconFile, iconFromFile, iconFromLibrary, iconFromUrl, LIBRARY } from './profileIcon';
import { libraryIcons, removeFromLibrary } from './iconLibrary';
import { pullShared, pushShared } from './sync';
import { recommendedMemoryMb } from './jvm';
import { markExistingUser } from '../shared/firstRun';
import { shareLog } from './logshare';
import { clipFrameResponse, registerMediaSharing } from './mediaShare';
import { previewPack } from './packPreview';
import { lastTarget, serverFromLog, worldPlayedSince } from './sessions';
import { checkForUpdates, installUpdate, startUpdateChecks, updateStatus, moveToApplications, retryMacUpdate } from './updates';
import { initChangelog } from './changelog';
import { DiscordPresence, presenceFromLog, type Presence } from './discord';
import { activityFromLog, SocialClient, SocialError, type SocialUser, type Status } from './social';
import { decorate, serverKey, StatusRules, Throttle, type GameStatus } from './serverStatus';
import { encrypt, isEncrypted, newDeviceKey, type DeviceKey, type PublicDevice } from './chatCrypto';
import { groupAad, openGroupMessage, sealGroupText, type GroupChatMessage, type GroupKey } from './groupChat';
import { ChatKeys, type WrapRef } from './chatKeys';
import { createGifMedia } from './gifMedia';
import { ClanLogoCache, isLogoPng } from './clanLogo';
import { RankIconCache } from './rankIcons';
import { fitSize, ImageCache, keyText, MAX_BYTES, openImage, parseKey, sealImage, type ChatImageView, type ImageKey } from './chatImages';
import { removedText, thumbnail, ThumbCache, type MediaItem, type RemovedImage } from './chatMedia';
import { launch, resolveVersionId } from './launch';
import { registerJavaCompare } from './javaCompare';
import type { JavaChoice } from './javaVendors';
import { effectiveJavaVendor, type JavaVendor } from '../shared/javaVendors';
import { paths } from './paths';
import { loadStore, newProfile, orphanProfiles, profileGameDir, saveStore, secrets, setSecretCodec, storeRecovered, type MicrosoftAccount, type Profile, type Settings, type StoreData } from './store';
import { LOADER_NAMES, loaderVersions, type Loader } from './loaders';
import {
  checkUpdates, contentFile, datapackFile, downloadModpack, identifyModpack, installMrpack, installProject, latestModpackVersion, listContentVersions,
  findFitting, installedProjectIds, listInstalled, modrinthLinks, projectGallery, projectsByIds, readManifest, removeContent, search, setEnabled, updateMrpack,
  type ContentType, type InstallRole, type ModpackInfo, type ProjectType, type UpdateInfo, type VersionInfo,
} from './modrinth';
import {
  checkCurseForgeUpdates, curseForgeLinks, curseForgePackIcon, CurseForgeUnavailable, downloadCurseForgePack, installCurseForgePack, installCurseForgeProject, isCurseForgePack, readCursePack,
  curseForgeProjects, curseForgeScreenshots, latestCurseForgePack, listCurseForgeVersions, searchCurseForge, setCurseForgeServer, updateCurseForgePack, type ManualFile,
} from './curseforge';
import { copyManualFiles, downloadLink, findManualFiles, FolderWatch, manualKey } from './manualFiles';
import { listServers, pingServer, serverDetails, serverHistory } from './servers';
import {
  applySettings, countParts, DEFAULT_PARTS, includePath, manualFilesOf, PACK_PARTS, readPackSummary, settingsOf, uniqueName, writeProfilePack,
  type LinkResolver, type PackPart, type PackSummary,
} from './profilePack';
import {
  cleanShareTemp, deleteShare, downloadShare, formatCode, listShares, normalizeCode, scanSecrets, shareErrorText, shareInfo, uploadShare, type SharedProfile,
} from './profileShare';
import { getManifest } from './versions';
import { newsArticle, newsPage, type NewsFilter } from './news';
import { ownedCapes, readSkinFile, resetSkin, setCape, skinFor, uploadSkin } from './skins';
import { GameBridge } from './bridge';
import { CoverCache, NowPlayingReader } from './nowPlaying';
import { LanTunnels } from './lan';
import { BLOCK_FACES, blockTextures, cosmeticTextures } from './blockTextures';
import { ConsoleHistory } from './consoleHistory';

/** Every game session's console, kept for the Play screen (the last ones of each profile). */
const consoleHistory = new ConsoleHistory(path.join(paths.root, 'console'));
import { checkModsFolder, inspectModsFolder, installedModIds, type ModOrigin } from './modcheck';
import { binContent, emptyBin, restoreContent } from './contentBin';
import { addModsArgs, hudVersions, prepareHud } from './hud';
import { exportHud, importHud } from './hudShare';
import { readBenchmarks } from './benchmark';
import { comparableBefore } from '../shared/benchTips';
import { appendSession, readSessions, summarize } from './stats';
import { contentOf, PopularReporter, recentServers } from './friendsPopular';
import { appendSummary, collectSummary, MIN_SESSION_MS, readSummaries, summaryDisplay, withStats } from './sessionSummary';
import { copyInstance, findInstances, instanceFromFolder, SOURCE_NAMES, type ForeignInstance } from './importers';
import { perfModsFor } from './perfmods';
import { addPreset, listPresets, looksSlim, readPreset, removePreset, updatePreset, type SkinPreset } from './skinLibrary';
import fsp from 'node:fs/promises';
import { backupWorld, deleteFile, listBackups, listClips, listScreenshots, listWorlds, restoreBackup } from './worlds';
import { applySnapshot, createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from './snapshots';
import { exportWorld, importWorldZip, installDatapack, listDatapacks, readWorldZip, removeDatapack, type WorldZipSummary } from './worldFiles';
import { getLang, t } from '../shared/i18n';
import { APP_USER_MODEL_ID, cleanTarget, Notifier } from './notifications';
import { registerMaintenance } from './maintenance';
import { applyToolSettings, gpuLaunchOptions, registerLauncherTools } from './launcherTools';
import { registerCloudProfiles } from './cloudProfiles';
import { registerVersionMove } from './versionMove';

let win: BrowserWindow | undefined;
let store: StoreData;
/**
 * The games running now, one per profile: several profiles can play at once, one profile only
 * once (two games in the same folder would fight over its worlds and settings).
 */
interface RunningGame { child: ChildProcess; hasHud: boolean; killRequested: boolean; presence: Presence; link: () => void }
const games = new Map<string, RunningGame>();
let loginAbort: AbortController | undefined;
let discord: DiscordPresence | undefined;

/** SlashClient's Discord application (shows as "Playing SlashClient"); public, not a secret. */
const DISCORD_APP_ID = '812524751053914112';

/** Discord Rich Presence client, unless the player turned it off in Settings. */
function discordClient(): DiscordPresence | undefined {
  if (!store.settings.discordEnabled) {
    discord?.close();
    discord = undefined;
    return undefined;
  }
  discord ??= new DiscordPresence(DISCORD_APP_ID);
  return discord;
}

const launcherStartedAt = Date.now();
/** What Discord shows while no game is running. */
const idlePresence = (): Presence => ({
  details: t('W launcherze'),
  startTimestamp: launcherStartedAt,
  largeImageKey: 'logo',
  largeImageText: 'SlashClient',
});
let currentPresence: Presence | undefined;

/** Shows a status on Discord and remembers it, so it can be re-sent if Discord restarts. */
function showPresence(p: Presence) {
  currentPresence = p;
  if (store.settings.discordEnabled) discordClient()?.set(discordLook(p));
}

// the server's tab list (serverStatus.ts): its rule's lines and pictures on Discord, the status for friends
const statusRules = new StatusRules(() => store.settings.socialUrl);
let gameStatus: GameStatus | undefined;
// Discord takes about 5 changes in 20 s: a sector change waits its turn (joining a server does not)
const discordStatusThrottle = new Throttle(15_000);
function discordLook(p: Presence): Presence {
  const a = social.currentActivity();
  const user = social.state().user;
  return decorate(p, { server: a.kind === 'server' ? a.server : undefined, status: gameStatus, rules: statusRules.current(), hideServer: !!user && !user.showServer });
}
function onGameStatus(status: GameStatus | undefined) {
  void statusRules.refresh();
  const a = social.currentActivity();
  // a status about another server than the one the log says (just switched): wait for the next one
  const here = status && a.kind === 'server' && serverKey(a.server) === serverKey(status.server) ? status : undefined;
  social.setDetail(here?.detail);
  const changed = JSON.stringify(here) !== JSON.stringify(gameStatus);
  gameStatus = here;
  if (changed) discordStatusThrottle.run(() => currentPresence && showPresence(currentPresence));
}

// re-send the status regularly: picks Discord up when it starts after the launcher or reconnects after a restart
setInterval(() => {
  if (currentPresence && store?.settings.discordEnabled) discordClient()?.set(discordLook(currentPresence));
}, 30_000);

/** App icon generated by `npm run icons` (source: scripts/icon/icon.html). */
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
/** The SlashClient HUD jars built from hud/ (see build.mjs). */
const HUD_DIR = path.join(__dirname, 'hud');
let hudSupported: string[] = [];

function send(channel: string, payload: unknown) {
  // the window may be closed (the app keeps running): a friend's message then has nowhere to go
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

async function persist() {
  await saveStore(store);
  send('store', publicStore());
}

/** The store as the renderer sees it: no tokens ever leave the main process. */
function publicStore() {
  return {
    ...store,
    // secrets stay in the main process
    settings: { ...store.settings, socialToken: undefined, chatKey: undefined, chatKeysRetired: undefined, chatShares: undefined },
    accounts: store.accounts.map(({ id, type, name, uuid }) => ({ id, type, name, uuid })),
    profiles: store.profiles.map((p) => ({ ...p, iconFile: p.icon === 'custom' ? iconFile(profileGameDir(p)) : undefined })),
    running: games.size > 0,
    runningProfiles: [...games.keys()],
    dataDir: paths.root,
    systemMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    hudVersions: hudSupported,
  };
}

/** The size the window opens with, from the setting (Settings → Okno launchera). */
function windowSize(choice: string | undefined, saved: Settings['launcherBounds']): { width: number; height: number; x?: number; y?: number } {
  const m = /^(\d{3,4})x(\d{3,4})$/.exec(choice ?? '');
  if (m) return { width: Math.max(820, Number(m[1])), height: Math.max(540, Number(m[2])) };
  if (choice === 'remember' && saved && saved.width >= 820 && saved.height >= 540) {
    // a place on a screen that is still there (a monitor may have been unplugged)
    const visible = screen.getAllDisplays().some((d) => saved.x >= d.workArea.x - 50 && saved.y >= d.workArea.y - 50
      && saved.x < d.workArea.x + d.workArea.width - 100 && saved.y < d.workArea.y + d.workArea.height - 100);
    return visible ? { width: saved.width, height: saved.height, x: saved.x, y: saved.y } : { width: saved.width, height: saved.height };
  }
  return { width: 1000, height: 640 };
}

/** A new choice in Settings, at once: the window takes that size (centred), maximizes or goes full screen. */
function applyWindowChoice(choice: string | undefined) {
  if (!win || win.isDestroyed()) return;
  if (choice === 'remember') return; // the window stays as it is, and is remembered as it closes
  if (win.isFullScreen() && choice !== 'fullscreen') win.setFullScreen(false);
  if (choice === 'fullscreen') return win.setFullScreen(true);
  if (choice === 'maximized') return win.maximize();
  if (win.isMaximized()) win.unmaximize();
  const { width, height } = windowSize(choice, undefined);
  // no bigger than the screen the window is on
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const w = Math.min(width, area.width), h = Math.min(height, area.height);
  win.setBounds({ x: Math.round(area.x + (area.width - w) / 2), y: Math.round(area.y + (area.height - h) / 2), width: w, height: h });
}

function createWindow() {
  const choice = store.settings.launcherWindow;
  win = new BrowserWindow({
    ...windowSize(choice, store.settings.launcherBounds),
    minWidth: 820,
    minHeight: 540,
    title: 'SlashClient',
    backgroundColor: '#0a0d14',
    icon: ICON,
    // shown once the first frame is ready, so there's no flash of an empty window
    show: false,
    // no system title bar: the page runs to the top and the window's buttons sit on it (traffic lights
    // on macOS, an overlay on Windows and Linux), so they are one with the launcher
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 13 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#c7cbe0', height: 36 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.once('ready-to-show', () => {
    if (choice === 'maximized' || (choice === 'remember' && store.settings.launcherBounds?.maximized)) win?.maximize();
    if (choice === 'fullscreen') win?.setFullScreen(true);
    win?.show();
  });
  // 'remember': the size and place as the window closes
  win.on('close', () => {
    if (!win || store.settings.launcherWindow !== 'remember') return;
    const maximized = win.isMaximized();
    const b = maximized || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
    store.settings.launcherBounds = { ...b, maximized };
    void saveStore(store);
  });
  // closed: nothing may reach it any more (sending to a destroyed window throws in the main process)
  const opened = win;
  opened.on('closed', () => {
    if (win === opened) win = undefined;
  });
  // development: surface page errors in the terminal
  if (!app.isPackaged) {
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') console.error(`[renderer ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
    });
  }
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Open external links in the system browser instead of inside the launcher.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  // the window only ever shows the launcher's own page: a page from elsewhere would get its API (preload)
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (url.startsWith('https://')) shell.openExternal(url);
  });
}

/** Brings the launcher to the front: restored when minimized, shown when hidden, a new one when closed (macOS). */
function focusWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  if (process.platform === 'darwin') app.focus({ steal: true });
}

/** System notifications: a click brings the launcher back and opens where the notification points. */
const notifier = new Notifier({
  // both switched in Settings: off, and with or without the system's sound (off by default)
  supported: () => Notification.isSupported() && store.settings.systemNotifications !== false,
  create: (title, body) => new Notification({ title, body, icon: ICON, silent: store.settings.notificationSound !== true }),
  focus: focusWindow,
  open: (target) => {
    // a window made just now gets it once its page has loaded
    if (win?.webContents.isLoading()) win.webContents.once('did-finish-load', () => send('notify:open', target));
    else send('notify:open', target);
  },
});

function handle<T extends unknown[], R>(channel: string, fn: (...args: T) => Promise<R> | R) {
  ipcMain.handle(channel, async (_event, ...args) => fn(...(args as T)));
}

handle('store:get', () => publicStore());
handle('versions:list', async () => (await getManifest()).versions.map(({ id, type }) => ({ id, type })));

handle('settings:save', async (settings: Partial<Settings>) => {
  // the chat's keys and the history hand-overs the player agreed to are the main process's alone
  const { socialToken: _ignored, chatKey: _key, chatKeysRetired: _retired, chatShares: _shares, ...allowed } = settings;
  const urlChanged = allowed.socialUrl !== undefined && allowed.socialUrl !== store.settings.socialUrl;
  const accountChanged = allowed.selectedAccountId !== undefined && allowed.selectedAccountId !== store.settings.selectedAccountId;
  const previous = store.settings;
  store.settings = { ...store.settings, ...allowed };
  if (allowed.launcherWindow !== undefined && (allowed.launcherWindow || '') !== (previous.launcherWindow || '')) applyWindowChoice(allowed.launcherWindow);
  await applyToolSettings(store.settings, previous);
  if (accountChanged) void signInWithMinecraft();
  if (urlChanged) await social.logout();
  setLang(store.settings.language);
  if (store.settings.discordEnabled) showPresence(games.size ? currentPresence ?? idlePresence() : idlePresence());
  else discordClient(); // closes the connection, which clears the status
  await persist();
});

handle('profile:save', async (profile: Profile) => {
  const clean = newProfile(profile);
  const i = store.profiles.findIndex((p) => p.id === clean.id);
  if (i >= 0) store.profiles[i] = clean;
  else store.profiles.push(clean);
  await persist();
  return clean.id;
});
/** New profiles (made, imported, from a modpack) start with the memory set in Settings. */
const systemMemoryMb = () => Math.round(os.totalmem() / 1024 / 1024);
const newMemory = () => ({ memoryMb: store.settings.autoMemory ? recommendedMemoryMb(systemMemoryMb(), 'vanilla', 0) : store.settings.defaultMemoryMb ?? 4096 });

/** What a profile should get: by its loader, its mods and what its modpack's authors recommend. */
async function profileRecommendedMemory(profile: Profile): Promise<{ mb: number; mods: number }> {
  const mods = (await listInstalled(profileGameDir(profile))).filter((i) => i.type === 'mod' && i.enabled).length;
  return { mb: recommendedMemoryMb(systemMemoryMb(), profile.loader, mods, profile.packMemoryMb), mods };
}

/**
 * After a modpack is installed: the recommended memory with "use recommended" on, else at least it, so
 * a big pack does not crash out of memory on the default 4 GB (more chosen by the player stays).
 * A note for the finished task when it raised the memory.
 */
async function fitPackMemory(profile: Profile, raiseOnly = false): Promise<string> {
  const before = profile.memoryMb;
  const { mb } = await profileRecommendedMemory(profile).catch(() => ({ mb: before }));
  profile.memoryMb = store.settings.autoMemory && !raiseOnly ? mb : Math.max(before, mb);
  return profile.memoryMb > before
    ? ` ${t('Pamięć RAM profilu: {0} GB (zalecane dla tego modpacka).', (profile.memoryMb / 1024).toLocaleString(store.settings.language === 'en' ? 'en' : 'pl', { maximumFractionDigits: 1 }))}`
    : '';
}
handle('profile:new', () => newProfile({ versionId: 'latest-release', ...newMemory() }));
handle('console:sessions', (profileId: string) => consoleHistory.list(profileId));
handle('console:read', (profileId: string, id: string) => consoleHistory.read(profileId, id));
/** A profile's game folder is the launcher's own (instances/<id>), not one from another launcher. */
function ownsGameDir(profile: Profile): boolean {
  const own = path.join(paths.instances, profile.id);
  return !profile.gameDir || path.resolve(profile.gameDir) === path.resolve(own);
}

/** Bytes in a folder, all the way down (links are not followed). */
async function folderSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await folderSize(full);
    else if (entry.isFile()) total += (await fsp.stat(full).catch(() => undefined))?.size ?? 0;
  }
  return total;
}

handle('profile:folderInfo', async (id: string) => {
  const profile = store.profiles.find((p) => p.id === id);
  if (!profile) return { own: false, exists: false, sizeBytes: 0 };
  const dir = profileGameDir(profile);
  const exists = await fsp.stat(dir).then((s) => s.isDirectory(), () => false);
  return { own: ownsGameDir(profile), exists, sizeBytes: exists ? await folderSize(dir) : 0 };
});

/** Profiles found again at start (shown once by the page), and the folders with a game but no profile. */
let recoveredAtStart = 0;
handle('profiles:recovered', () => {
  const n = recoveredAtStart;
  recoveredAtStart = 0;
  return n;
});
handle('profiles:orphans', async () => (await orphanProfiles(store.profiles)).length);
/** The folders that could come back, with what helps tell them apart (version, mods, worlds, last change). */
handle('profiles:orphanList', async () => Promise.all((await orphanProfiles(store.profiles)).map(async (p) => {
  const dir = profileGameDir(p);
  const list = (sub: string) => fsp.readdir(path.join(dir, sub), { withFileTypes: true }).catch(() => []);
  const mods = (await list('mods')).filter((e) => e.isFile() && /\.jar$/i.test(e.name)).length;
  const worlds = (await list('saves')).filter((e) => e.isDirectory()).map((e) => e.name);
  const changedAt = (await fsp.stat(dir).catch(() => undefined))?.mtimeMs ?? 0;
  return { id: p.id, versionId: p.versionId, loader: p.loader, loaderVersion: p.loaderVersion, mods, worlds: worlds.slice(0, 3), worldCount: worlds.length, changedAt };
})));
/** "Odzyskaj profile": the chosen folders in instances/ with a game but no profile become profiles again (all of them without a choice). */
handle('profiles:recover', async (ids?: string[]) => {
  const chosen = Array.isArray(ids) ? new Set(ids) : undefined;
  const found = (await orphanProfiles(store.profiles)).filter((p) => !chosen || chosen.has(p.id));
  // a folder with a readable name keeps it, a random id gets a number; never the name of another profile
  for (const p of found) {
    const taken = store.profiles.map((x) => x.name.toLowerCase());
    let n = 1;
    while (taken.includes(t('Odzyskany profil {0}', n).toLowerCase())) n++;
    p.name = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(p.id) ? t('Odzyskany profil {0}', n) : uniqueName(p.id.slice(0, 40), taken);
    store.profiles.push(p);
  }
  if (found.length) await persist();
  return found.length;
});

handle('profile:delete', async (id: string, trashFiles = false) => {
  if (store.profiles.length <= 1) throw new Error('Musi zostać przynajmniej jeden profil.');
  const profile = store.profiles.find((p) => p.id === id);
  // the folder only when it is the launcher's own, to the system trash (it can be brought back), never while the game runs in it
  if (trashFiles && profile && ownsGameDir(profile)) {
    if (games.has(id)) throw new Error('Najpierw zamknij grę tego profilu.');
    const dir = profileGameDir(profile);
    if (await fsp.stat(dir).then(() => true, () => false)) await shell.trashItem(dir);
  }
  store.profiles = store.profiles.filter((p) => p.id !== id);
  void consoleHistory.forget(id).catch(() => {});
  // snapshots cannot be restored without their profile: they go to the trash
  if (profile && /^[\w-]+$/.test(id)) {
    const dir = snapshotsDirOf(profile);
    void fsp.stat(dir).then(() => shell.trashItem(dir), () => {}).catch(() => {});
  }
  // the Play bar and Profiles must not point at a profile that is gone
  if (store.settings.selectedProfileId === id) store.settings.selectedProfileId = store.profiles[0].id;
  await persist();
});
handle('profile:openDir', async (id: string) => {
  const profile = store.profiles.find((p) => p.id === id);
  if (!profile) return;
  const dir = profileGameDir(profile);
  await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }));
  await shell.openPath(dir);
});

handle('account:addOffline', async (name: string) => {
  const account = createOfflineAccount(name.trim());
  store.accounts.push(account);
  store.settings.selectedAccountId = account.id;
  await persist();
});
handle('account:delete', async (id: string) => {
  store.accounts = store.accounts.filter((a) => a.id !== id);
  await persist();
});

handle('account:loginMicrosoft', async () => {
  loginAbort?.abort();
  loginAbort = new AbortController();
  const clientId = store.settings.msClientId.trim();
  const code = await startDeviceCode(clientId);
  // copied right away so the player only has to paste it on the Microsoft page
  clipboard.writeText(code.user_code);
  send('login:code', { userCode: code.user_code, url: code.verification_uri, copied: true });
  if (code.verification_uri.startsWith('https://')) shell.openExternal(code.verification_uri);
  const tokens = await pollDeviceCode(clientId, code, loginAbort.signal);
  const account = await completeMicrosoftLogin(tokens, clientId);
  // Signing in again with the same Minecraft profile replaces the old entry, under the same id
  // (profiles that play as this account keep it)
  const before = store.accounts.find((a) => a.uuid === account.uuid);
  if (before) account.id = before.id;
  store.accounts = store.accounts.filter((a) => a.uuid !== account.uuid);
  store.accounts.push(account);
  store.settings.selectedAccountId = account.id;
  await persist();
  void signInWithMinecraft();
  return account.name;
});
handle('account:cancelLogin', () => loginAbort?.abort());

handle('loaders:versions', async (loader: Loader, versionId: string) => loaderVersions(loader, await resolveVersionId(versionId)));
/** One of the profile's content folders, e.g. to drop in files downloaded by hand from CurseForge. */
handle('profile:openFolder', async (id: string, folder: string) => {
  const profile = store.profiles.find((p) => p.id === id);
  if (!profile || !['mods', 'resourcepacks', 'shaderpacks', 'datapacks'].includes(folder)) return;
  const dir = path.join(profileGameDir(profile), folder);
  await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }));
  await shell.openPath(dir);
});
handle('profile:openMods', async (id: string) => {
  const profile = store.profiles.find((p) => p.id === id);
  if (!profile) return;
  const dir = path.join(profileGameDir(profile), 'mods');
  await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }));
  await shell.openPath(dir);
});
// ---------- background tasks (shown in the page's task panel) ----------

/** A long-running job the page shows with its own progress panel and a completion message. */
function startTask(title: string, icon?: string) {
  const id = randomUUID();
  send('task:start', { id, title, icon });
  return {
    progress: (stage: string, done: number, total: number, stats?: { bytes: number; totalBytes: number; speed: number }) =>
      send('task:progress', { id, stage, done, total, ...stats }),
    /** `missing`: files the player still has to download by hand (no "Play now" until they are there). */
    finish: (ok: boolean, message: string, profileId?: string, missing = 0) => {
      send('task:done', { id, ok, message, profileId, missing });
      // tell the player even when the launcher is in the background
      if (!win?.isFocused()) notifier.show({ title: 'SlashClient', body: message });
    },
  };
}

// ---------- profile icons ----------

handle('blocks:textures', async () => {
  const textures = await blockTextures();
  return textures && { faces: BLOCK_FACES, textures };
});
handle('cosmetics:textures', () => cosmeticTextures());
handle('profile:setIcon', async (id: string, icon: string) => {
  const profile = profileById(id);
  if (!/^block:[a-z-]+$/.test(icon) && icon !== '') throw new Error('Nieprawidłowa ikona');
  profile.icon = icon;
  await persist();
});
handle('profile:chooseIcon', async (id: string) => {
  const profile = profileById(id);
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: t('Wybierz ikonę profilu'), filters: [{ name: t('Obrazy'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }], properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return false;
  await iconFromFile(profileGameDir(profile), filePaths[0]);
  profile.icon = 'custom';
  profile.iconVersion = Date.now();
  await persist();
  return true;
});
/** The icons any profile got before (the library), and which of them this profile has now. */
handle('icons:library', async (id: string) => {
  const profile = profileById(id);
  const existing = store.profiles.map((p) => iconFile(profileGameDir(p))).filter((f): f is string => !!f);
  const icons = await libraryIcons(LIBRARY, existing);
  const current = profile.icon === 'custom' ? await currentIconId(profileGameDir(profile)).catch(() => undefined) : undefined;
  return { icons, current };
});
handle('icons:use', async (id: string, iconId: string) => {
  const profile = profileById(id);
  await iconFromLibrary(profileGameDir(profile), iconId);
  profile.icon = 'custom';
  profile.iconVersion = Date.now();
  await persist();
});
handle('icons:remove', (iconId: string) => removeFromLibrary(LIBRARY, iconId));

// ---------- Modrinth and CurseForge content ----------

/** Where content comes from; the page switches between the two. */
type Source = 'modrinth' | 'curseforge';
/** CurseForge goes through the SlashClient server set in Settings (it holds the API key). */
const curseforge = () => setCurseForgeServer(store.settings.socialUrl);

function profileById(id: string): Profile {
  const profile = store.profiles.find((p) => p.id === id);
  if (!profile) throw new Error('Nie znaleziono profilu.');
  return profile;
}

async function profileTarget(id: string) {
  const profile = profileById(id);
  return { profile, gameDir: profileGameDir(profile), gameVersion: await resolveVersionId(profile.versionId) };
}

handle('content:search', async (profileId: string, query: string, type: ProjectType, offset?: number, source: Source = 'modrinth') => {
  // datapacks come from Modrinth only
  const find = source === 'curseforge' && type !== 'datapack' ? (curseforge(), searchCurseForge) : search;
  try {
    if (type === 'modpack') return await find({ query, type, offset });
    const { profile, gameVersion } = await profileTarget(profileId);
    return await find({ query, type, gameVersion, loader: profile.loader === 'vanilla' ? undefined : profile.loader, offset });
  } catch (err) {
    // the page shows CurseForge as unavailable instead of an error
    if (err instanceof CurseForgeUnavailable) return { hits: [], total: 0, unavailable: true };
    throw err;
  }
});
/** Removed files whose notification is long gone (the launcher was closed meanwhile) go to the system trash. */
const BIN_KEEP_MS = 30 * 60_000;
const trashFile = (file: string) => shell.trashItem(file);
handle('content:list', async (profileId: string) => {
  const { gameDir } = await profileTarget(profileId);
  void emptyBin(gameDir, trashFile, { olderThanMs: BIN_KEEP_MS }).catch(() => {});
  return listInstalled(gameDir);
});
/** A resource pack's textures next to the game's, before installing it (packPreview.ts). */
handle('content:packPreview', async (profileId: string, projectId: string, source: Source = 'modrinth', versionId?: string) => {
  const { gameVersion } = await profileTarget(profileId);
  if (source === 'curseforge') curseforge();
  return previewPack({ projectId: String(projectId), source: source === 'curseforge' ? 'curseforge' : 'modrinth', gameVersion, versionId, temp: app.getPath('temp') });
});
/** The pictures in a project's details window (its gallery on Modrinth, its screenshots on CurseForge). */
handle('content:gallery', async (projectId: string, source: Source = 'modrinth') => {
  if (source !== 'curseforge') return projectGallery(String(projectId));
  curseforge();
  return curseForgeScreenshots(String(projectId));
});
handle('content:versions', async (profileId: string, projectId: string, type: ProjectType, onlyCompatible: boolean, source: Source = 'modrinth') => {
  const list = source === 'curseforge' && type !== 'datapack' ? (curseforge(), listCurseForgeVersions) : listContentVersions;
  if (!onlyCompatible || type === 'modpack') return list(projectId, 'modpack');
  const { profile, gameVersion } = await profileTarget(profileId);
  return list(projectId, type, gameVersion, profile.loader === 'vanilla' ? undefined : profile.loader);
});
handle('content:checkUpdates', async (profileId: string) => {
  const { profile, gameDir, gameVersion } = await profileTarget(profileId);
  const loader = profile.loader === 'vanilla' ? undefined : profile.loader;
  curseforge();
  // CurseForge being off only hides updates of what came from there
  const [modrinth, cf] = await Promise.all([
    checkUpdates(gameDir, gameVersion, loader),
    checkCurseForgeUpdates(gameDir, gameVersion, loader).catch((err) => {
      if (err instanceof CurseForgeUnavailable) return [];
      throw err;
    }),
  ]);
  return [...modrinth, ...cf];
});
/** Updates (or changes the version of) installed items, one task for the whole batch. */
handle('content:update', async (profileId: string, items: Pick<UpdateInfo, 'type' | 'projectId' | 'latestVersionId' | 'title' | 'source'>[]) => {
  const { profile, gameDir, gameVersion } = await profileTarget(profileId);
  const task = startTask(items.length === 1 ? t('Aktualizowanie: {0}', items[0].title) : t('Aktualizowanie {0} elementów', items.length));
  try {
    for (const [i, item] of items.entries()) {
      task.progress(t('{0} ({1}/{2})', item.title, i + 1, items.length), i, items.length);
      if (item.source === 'curseforge') {
        curseforge();
        await installCurseForgeProject(gameDir, item.projectId, item.type, gameVersion, profile.loader, undefined, item.latestVersionId, 'keep');
      } else await installProject(gameDir, item.projectId, item.type, gameVersion, profile.loader, undefined, item.latestVersionId, 'keep');
    }
    task.finish(true, items.length === 1 ? t('Zaktualizowano {0}.', items[0].title) : t('Zaktualizowano {0} elementów.', items.length));
  } catch (err) {
    task.finish(false, (err as Error).message);
    throw err;
  }
});
// ---------- statistics ----------

handle('stats:get', async (days: number) => {
  const sessions = await readSessions();
  const summary = summarize(sessions, Date.now(), days);
  // profiles counted play time before stats.json existed; sessions also cover deleted profiles: take the larger
  const allTimeMs = Math.max(store.profiles.reduce((sum, p) => sum + (p.playTimeMs ?? 0), 0), sessions.reduce((sum, s) => sum + s.end - s.start, 0));
  return { ...summary, allTimeMs, names: Object.fromEntries(store.profiles.map((p) => [p.id, p.name])) };
});

// the last session summaries, for the statistics page
handle('sessionSummary:list', () => readSummaries());

async function finishSessionSummary(o: { profile: Profile; versionId: string; startedAt: number; endedAt: number; joins: { address: string; at: number }[]; code: number | null; byUser: boolean; benchmark: boolean }) {
  const display = summaryDisplay({ enabled: store.settings.sessionSummary !== false, code: o.code, byUser: o.byUser, durationMs: o.endedAt - o.startedAt, benchmark: o.benchmark });
  if (o.endedAt - o.startedAt < MIN_SESSION_MS || o.benchmark) return;
  const crashed = o.code !== 0 && !o.byUser;
  const summary = withStats(await collectSummary({
    gameDir: profileGameDir(o.profile), start: o.startedAt, end: o.endedAt, profile: o.profile, versionId: o.versionId, crashed, joins: o.joins,
  }), await readSessions());
  await appendSummary(summary);
  if (display !== 'none') send('session:summary', { summary, display });
}

// ---------- importing instances from other launchers ----------

/** Instances found by the last scan; the page picks from these by key, never by path. */
let foreign = new Map<string, ForeignInstance>();
const foreignKey = (i: ForeignInstance) => `${i.source}|${i.gameDir}|${i.name}`;
function remember(list: ForeignInstance[]) {
  for (const i of list) foreign.set(foreignKey(i), i);
  return list.map((i) => ({ key: foreignKey(i), source: i.source, sourceName: SOURCE_NAMES[i.source], name: i.name, versionId: i.versionId, loader: i.loader, loaderVersion: i.loaderVersion, mods: i.mods, sharedDir: i.sharedDir, gameDir: i.gameDir }));
}
handle('import:find', async () => {
  foreign = new Map();
  return remember(await findInstances());
});
handle('import:folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, { title: t('Wybierz folder instancji'), properties: ['openDirectory'] });
  if (canceled || !filePaths[0]) return undefined;
  return remember(await instanceFromFolder(filePaths[0]));
});
handle('import:run', async (keys: string[]) => {
  const chosen = keys.map((k) => foreign.get(k)).filter((i): i is ForeignInstance => !!i);
  const created: string[] = [];
  const failed: string[] = [];
  // several instances share one progress card, so a big import does not flood the notification stack
  const many = chosen.length > 1;
  const shared = many ? startTask(t('Import profili ({0})', chosen.length)) : undefined;
  for (const [n, inst] of chosen.entries()) {
    const task = shared ?? startTask(t('Import: {0}', inst.name));
    const prefix = many ? `${inst.name} (${n + 1}/${chosen.length}) · ` : '';
    try {
      const profile = newProfile({ name: inst.name, versionId: inst.versionId, loader: inst.loader, loaderVersion: inst.loaderVersion, ...newMemory() });
      const dest = profileGameDir(profile);
      await copyInstance(inst, dest, (done, total, item) => task.progress(prefix + (item ? t('Kopiowanie: {0}', item) : t('Gotowe')), done, total));
      if (inst.icon) await iconFromFile(dest, inst.icon).then(() => { profile.icon = 'custom'; profile.iconVersion = Date.now(); }, () => {});
      store.profiles.push(profile);
      await persist();
      created.push(profile.id);
      if (!many) task.finish(true, t('Zaimportowano {0} z {1}.', inst.name, SOURCE_NAMES[inst.source]), profile.id);
    } catch (err) {
      failed.push(inst.name);
      if (!many) task.finish(false, (err as Error).message);
    }
  }
  if (shared) {
    const summary = t('Zaimportowane profile: {0} z {1}.', created.length, chosen.length);
    shared.finish(created.length > 0, failed.length ? `${summary} ${t('Nie udało się: {0}.', failed.join(', '))}` : summary);
  }
  return created;
});

// ---------- performance mods and mod checks ----------

interface PerfPlanItem { slug: string; projectId?: string; title: string; why: string; iconUrl?: string; installed: boolean }

/** Which performance mods fit this profile, and which of them are already there. */
handle('perf:plan', async (profileId: string): Promise<PerfPlanItem[]> => {
  const { profile, gameDir, gameVersion } = await profileTarget(profileId);
  const entries = perfModsFor(profile.loader);
  const have = await installedProjectIds(gameDir);
  // mods from a modpack or added by hand are not in our list: match them by mod id ("ferrite-core" ↔ "ferritecore")
  const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, '');
  const ids = new Set([...(await installedModIds(gameDir))].map(norm));
  return Promise.all(entries.map(async (e) => {
    for (const slug of e.slugs) {
      const hit = await findFitting(slug, gameVersion, profile.loader);
      if (hit) return { slug: e.slugs[0], projectId: hit.projectId, title: hit.title, why: t(e.why), iconUrl: hit.iconUrl, installed: have.has(hit.projectId) || ids.has(norm(hit.slug)) };
    }
    // nothing fits this version, but it may still be there already
    if (e.slugs.some((s) => ids.has(norm(s)))) return { slug: e.slugs[0], title: e.slugs[0], why: t(e.why), installed: true };
    return { slug: e.slugs[0], title: e.slugs[0], why: t(e.why), installed: false };
  }));
});
/** Installs several Modrinth mods (with their dependencies) as one task. */
async function installMany(profileId: string, items: { projectId: string; title: string }[], title: string, role: InstallRole = 'direct') {
  const { profile, gameDir, gameVersion } = await profileTarget(profileId);
  const task = startTask(title);
  const done: string[] = [];
  const failed: string[] = [];
  for (const [i, item] of items.entries()) {
    task.progress(t('{0} ({1}/{2})', item.title, i + 1, items.length), i, items.length);
    try {
      done.push(...(await installProject(gameDir, item.projectId, 'mod', gameVersion, profile.loader, undefined, undefined, role)));
    } catch {
      failed.push(item.title);
    }
  }
  const summary = t('Zainstalowano: {0}', [...new Set(done)].join(', ') || '—') + (failed.length ? ` · ${t('Nie udało się: {0}', failed.join(', '))}` : '');
  task.finish(!failed.length || done.length > 0, summary);
  return { done, failed };
}
handle('perf:install', (profileId: string, items: { projectId: string; title: string }[]) => installMany(profileId, items, t('Mody wydajności')));
handle('mods:check', async (profileId: string) => {
  const { profile, gameDir, gameVersion } = await profileTarget(profileId);
  return checkModsFolder(gameDir, profile.loader, gameVersion);
});
/** The Installed list's dependency tree ("Wymaga", "Potrzebny dla") with the same check as above, from one read of the jars. */
handle('mods:graph', async (profileId: string) => {
  const { profile, gameDir, gameVersion } = await profileTarget(profileId);
  const manifest = await readManifest(gameDir);
  const originOf = (file: string): ModOrigin => {
    const entry = manifest.find((m) => m.type === 'mod' && m.filename === file);
    // not in the launcher's notes at all: the player put it there by hand
    if (!entry) return 'direct';
    return entry.dependency === true ? 'dependency' : entry.dependency === false ? 'direct' : 'unknown';
  };
  return inspectModsFolder(gameDir, profile.loader, gameVersion, originOf);
});
/** Looks the missing mod ids up on Modrinth (id = slug for most mods), then CurseForge, and installs those found. */
handle('mods:fixMissing', async (profileId: string, ids: string[]) => {
  const { profile, gameDir, gameVersion } = await profileTarget(profileId);
  const aliases: Record<string, string> = { fabric: 'fabric-api', 'fabric-api-base': 'fabric-api', quilted_fabric_api: 'qsl', cloth_config: 'cloth-config', architectury: 'architectury-api' };
  const found: { projectId: string; title: string }[] = [];
  const notFound: string[] = [];
  for (const id of ids) {
    const candidates = [aliases[id], id.startsWith('fabric-') ? 'fabric-api' : undefined, id, id.replace(/_/g, '-')].filter((x): x is string => !!x);
    let hit;
    for (const c of [...new Set(candidates)]) if ((hit = await findFitting(c, gameVersion, profile.loader))) break;
    if (hit && !found.some((f) => f.projectId === hit!.projectId)) found.push({ projectId: hit.projectId, title: hit.title });
    else if (!hit) notFound.push(id);
  }
  // other mods need them: they count as dependencies (offered for removal once nothing needs them)
  if (found.length) await installMany(profileId, found, t('Brakujące mody'), 'dependency');
  // not on Modrinth: CurseForge, a project whose address name is the mod's id
  const fromCurse: string[] = [];
  for (const id of [...notFound]) {
    try {
      curseforge();
      const slugs = new Set([aliases[id], id, id.replace(/_/g, '-')].filter(Boolean));
      const { hits } = await searchCurseForge({ query: id.replace(/[_-]/g, ' '), type: 'mod', gameVersion, loader: profile.loader });
      const hit = hits.find((h) => slugs.has(h.slug));
      if (!hit) continue;
      const { installed } = await installCurseForgeProject(gameDir, hit.id, 'mod', gameVersion, profile.loader, () => {}, undefined, 'dependency');
      fromCurse.push(...installed);
      notFound.splice(notFound.indexOf(id), 1);
    } catch {
      // no CurseForge (key, network): stays among the not found
    }
  }
  return { installed: [...found.map((f) => f.title), ...fromCurse], notFound };
});

handle('content:install', async (profileId: string, projectId: string, type: ContentType, title?: string, icon?: string, versionId?: string, source: Source = 'modrinth') => {
  const { profile, gameDir, gameVersion } = await profileTarget(profileId);
  if (type === 'mod' && profile.loader === 'vanilla') throw new Error('Ten profil nie ma mod loadera. Ustaw Fabric w ustawieniach profilu.');
  const task = startTask(t('Instalowanie: {0}', title ?? ''), icon);
  try {
    const progress = (done: number, total: number, stats: { bytes: number; totalBytes: number; speed: number }) => task.progress(t('Pobieranie'), done, total, stats);
    let titles: string[];
    let manual: ManualFile[] = [];
    if (source === 'curseforge') {
      curseforge();
      ({ installed: titles, manual } = await installCurseForgeProject(gameDir, projectId, type, gameVersion, profile.loader, progress, versionId));
      if (manual.length) await rememberManual(profile, manual);
    } else titles = await installProject(gameDir, projectId, type, gameVersion, profile.loader, progress, versionId);
    const done = titles.length > 1 ? t('Zainstalowano {0} i zależności: {1}', titles[0], titles.slice(1).join(', ')) : titles.length ? t('Zainstalowano {0}', titles[0]) : '';
    const byHand = manual.length ? t('Do pobrania ręcznie ze strony CurseForge: {0}', manual.map((m) => m.title).join(', ')) : '';
    task.finish(true, [done, byHand].filter(Boolean).join(' · '));
    return { titles, manual };
  } catch (err) {
    task.finish(false, (err as Error).message);
    throw err;
  }
});
/** Adds files to download by hand to the profile's list (shown on the Mods page until they are in place). */
async function rememberManual(profile: Profile, files: ManualFile[]) {
  const known = new Map((profile.manualFiles ?? []).map((f) => [manualKey(f), f]));
  for (const f of files) known.set(manualKey(f), f);
  profile.manualFiles = [...known.values()];
  await persist();
}
/** The files still to be downloaded by hand: those the player has put in place drop off the list. */
async function missingManual(profile: Profile): Promise<ManualFile[]> {
  if (!profile.manualFiles?.length) return [];
  const gameDir = profileGameDir(profile);
  const there = (file: string) => fsp.access(file).then(() => true, () => false);
  const exists = async (f: ManualFile) => {
    const file = path.join(gameDir, f.folder, path.basename(f.fileName));
    return (await there(file)) || there(`${file}.disabled`);
  };
  const left = [];
  for (const f of profile.manualFiles) if (!(await exists(f))) left.push(f);
  if (left.length !== profile.manualFiles.length) {
    profile.manualFiles = left.length ? left : undefined;
    await persist();
  }
  // lists from older versions link to the file's page instead of its download
  return left.map((f) => ({ ...f, url: downloadLink(f.url) }));
}
handle('content:manual', (profileId: string) => missingManual(profileById(profileId)));
/** The player says they do not want these files (or got them elsewhere): forget the list. */
handle('content:manualDismiss', async (profileId: string) => {
  const profile = profileById(profileId);
  profile.manualFiles = undefined;
  await persist();
});

// ---------- finding files downloaded by hand (like Prism Launcher's "Blocked mods") ----------

/** Folders checked for downloaded files: the player's own list, else the system's Downloads folder. */
const watchedFolders = () => store.settings.manualWatchFolders ?? [app.getPath('downloads')];
type ManualStatus = { profileId: string; files: (ManualFile & { foundAt?: string })[]; folders: string[] };
let manualSession: { profileId: string; files: ManualFile[]; extra: string[]; found: Map<string, string>; last: string } | undefined;
let manualScanning: Promise<ManualStatus | undefined> | undefined;
let manualRescan = false;
const manualWatch = new FolderWatch(() => void scanManual());

function manualStatus(): ManualStatus | undefined {
  const s = manualSession;
  if (!s) return undefined;
  return { profileId: s.profileId, files: s.files.map((f) => ({ ...f, foundAt: s.found.get(manualKey(f)) })), folders: watchedFolders() };
}
/** Looks for the files again; the page hears about it (`manual:status`) when something was found or lost. */
async function scanManual(): Promise<ManualStatus | undefined> {
  if (manualScanning) {
    manualRescan = true;
    return manualScanning;
  }
  manualScanning = (async () => {
    do {
      manualRescan = false;
      const s = manualSession;
      if (!s) return undefined;
      const found = await findManualFiles(s.files, watchedFolders(), s.extra).catch(() => s.found);
      if (manualSession !== s) return manualStatus();
      s.found = found;
      const status = manualStatus()!;
      const now = JSON.stringify(status);
      if (now !== s.last) {
        s.last = now;
        send('manual:status', status);
      }
    } while (manualRescan);
    return manualStatus();
  })().finally(() => (manualScanning = undefined));
  return manualScanning;
}
function stopManual() {
  manualWatch.stop();
  manualSession = undefined;
}
/** The dialog opens: the profile's missing files, the watched folders watched until it closes. */
handle('manual:open', async (profileId: string) => {
  stopManual();
  const files = await missingManual(profileById(profileId));
  manualSession = { profileId, files, extra: [], found: new Map(), last: '' };
  manualWatch.start(watchedFolders());
  return scanManual();
});
handle('manual:close', () => stopManual());
/** Files dropped on the dialog (their paths, from the preload): checked by hash like the folders' files. */
handle('manual:drop', async (paths: unknown) => {
  const s = manualSession;
  if (!s || !Array.isArray(paths)) return manualStatus();
  for (const p of paths) if (typeof p === 'string' && path.isAbsolute(p) && !s.extra.includes(p)) s.extra.push(p);
  return scanManual();
});
/** OK: the found files are copied into the profile; what is still missing stays on the list. */
handle('manual:accept', async () => {
  const s = manualSession;
  if (!s) return { copied: 0, left: 0 };
  const profile = profileById(s.profileId);
  const copied = await copyManualFiles(profileGameDir(profile), s.files, s.found);
  stopManual();
  const left = await missingManual(profile);
  return { copied: copied.length, left: left.length };
});
/** "Open missing": every download page not found yet, in the browser. */
handle('manual:openMissing', async () => {
  const s = manualSession;
  if (!s) return;
  for (const f of s.files) {
    if (s.found.has(manualKey(f))) continue;
    const url = downloadLink(f.url);
    if (/^https:\/\/(www\.)?curseforge\.com\//.test(url)) await shell.openExternal(url);
  }
});
async function setWatchedFolders(folders: string[]) {
  store.settings.manualWatchFolders = folders;
  await persist();
  if (manualSession) {
    manualWatch.start(folders);
    await scanManual();
  }
  return folders;
}
handle('manual:folders', () => watchedFolders());
handle('manual:addFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, { title: t('Wybierz folder do obserwowania'), properties: ['openDirectory'] });
  if (canceled || !filePaths[0]) return watchedFolders();
  const dir = path.resolve(filePaths[0]);
  const now = watchedFolders();
  const norm = (d: string) => (process.platform === 'linux' ? path.resolve(d) : path.resolve(d).toLowerCase());
  return now.some((d) => norm(d) === norm(dir)) ? now : setWatchedFolders([...now, dir]);
});
handle('manual:removeFolder', (dir: string) => setWatchedFolders(watchedFolders().filter((d) => d !== dir)));
handle('content:toggle', async (profileId: string, type: ContentType, filename: string, enabled: boolean) =>
  setEnabled((await profileTarget(profileId)).gameDir, type, filename, enabled));
handle('content:remove', async (profileId: string, type: ContentType, filename: string) =>
  removeContent((await profileTarget(profileId)).gameDir, type, filename));
type ContentRef = { type: ContentType; filename: string };
const contentRefs = (items: unknown): ContentRef[] => (Array.isArray(items) ? items : [])
  .filter((i): i is ContentRef => !!i && typeof i.filename === 'string' && ['mod', 'resourcepack', 'shader'].includes(i.type));
/** Several at once (the Installed list's selection); those already in that state are left alone. */
handle('content:toggleMany', async (profileId: string, items: unknown, enabled: boolean) => {
  const { gameDir } = await profileTarget(profileId);
  let changed = 0;
  for (const { type, filename } of contentRefs(items)) {
    const file = contentFile(gameDir, type, filename);
    const on = await fsp.access(file).then(() => true, () => false);
    const off = await fsp.access(`${file}.disabled`).then(() => true, () => false);
    if ((enabled && !off) || (!enabled && !on)) continue;
    await setEnabled(gameDir, type, filename, !!enabled);
    changed++;
  }
  return changed;
});
/** Removal with a way back: the files go aside in the profile ("Cofnij"), then to the system trash. */
handle('content:bin', async (profileId: string, items: unknown) => binContent((await profileTarget(profileId)).gameDir, contentRefs(items)));
handle('content:unbin', async (profileId: string, id: string) => restoreContent((await profileTarget(profileId)).gameDir, String(id)));
handle('content:binDone', async (profileId: string, id: string) => emptyBin((await profileTarget(profileId)).gameDir, trashFile, { id: String(id) }));

/** Creates a new profile from a .mrpack file and returns its id. */
/**
 * Creates a profile from a .mrpack with a visible progress panel, a completion
 * message and (for Modrinth packs) the pack's own icon.
 */
type Pack = { file: string; version?: VersionInfo; source?: Source; iconUrl?: string };

/** Applies a modpack's game version and loader to a profile and remembers which pack/version it is. */
function applyPack(profile: Profile, info: ModpackInfo, version: VersionInfo | undefined, title: string, source?: Source) {
  Object.assign(profile, { versionId: info.gameVersion, loader: info.loader, loaderVersion: info.loaderVersion });
  if (version) profile.modpack = { projectId: version.projectId, versionId: version.id, versionNumber: version.versionNumber, title, ...(source === 'curseforge' ? { source } : {}) };
}

/** Installs (or, with `update`, moves to) a pack file of either kind; CurseForge files kept on their site are remembered. */
async function installPackFile(profile: Profile, file: string, update: boolean, onStage: Parameters<typeof installMrpack>[2]): Promise<{ info: ModpackInfo; manual: ManualFile[] }> {
  const gameDir = profileGameDir(profile);
  if (!isCurseForgePack(file)) return { info: await (update ? updateMrpack : installMrpack)(file, gameDir, onStage), manual: [] };
  curseforge();
  const info = await (update ? updateCurseForgePack : installCurseForgePack)(file, gameDir, onStage);
  // a new version of the pack has its own list
  profile.manualFiles = undefined;
  if (info.manual.length) await rememberManual(profile, info.manual);
  return { info, manual: info.manual };
}

const manualNote = (manual: ManualFile[]) => manual.length
  ? ` ${t('Autorzy {0} plików pozwalają je pobrać tylko ze strony CurseForge: lista jest w zakładce Mody tego profilu.', manual.length)}`
  : '';

async function installModpackTask(title: string, iconUrl: string | undefined, getPack: (task: ReturnType<typeof startTask>) => Promise<Pack>): Promise<string> {
  const task = startTask(t('Instalowanie modpacka: {0}', title), iconUrl);
  try {
    const pack = await getPack(task);
    const { file, version, source } = pack;
    const profile = newProfile(newMemory());
    const gameDir = profileGameDir(profile);
    const { info, manual } = await installPackFile(profile, file, false, task.progress);
    profile.name = info.name;
    applyPack(profile, info, version, info.name, source);
    const memoryNote = await fitPackMemory(profile);
    // the page's picture, else the one the site gives for the pack (a CurseForge zip: looked up by its manifest)
    let icon = iconUrl ?? pack.iconUrl;
    if (!icon && isCurseForgePack(file)) icon = await curseForgePackIcon(readCursePack(file).manifest).catch(() => undefined);
    if (icon) {
      task.progress(t('Pobieranie ikony'), 0, 1);
      // a missing icon is not worth failing the install; a CurseForge thumbnail that fails gets the full logo
      const tries = [icon, pack.iconUrl].filter((u, i, all): u is string => !!u && all.indexOf(u) === i);
      for (const url of tries) {
        if (await iconFromUrl(gameDir, url).then(() => true, (err) => (console.error(`icon ${url}: ${(err as Error).message}`), false))) {
          Object.assign(profile, { icon: 'custom', iconVersion: Date.now() });
          break;
        }
      }
    }
    store.profiles.push(profile);
    store.settings.selectedProfileId = profile.id;
    await persist();
    // ready to play only with every file there
    task.finish(true, (manual.length ? t('Zainstalowano modpack {0}.', info.name) : t('Zainstalowano modpack {0}. Profil jest gotowy do gry.', info.name)) + memoryNote + manualNote(manual), profile.id, manual.length);
    return profile.id;
  } catch (err) {
    task.finish(false, t('Nie udało się zainstalować modpacka: {0}', (err as Error).message));
    throw err;
  }
}

/** Downloads a pack from either site. */
function downloadPack(source: Source, projectId: string, task: ReturnType<typeof startTask>, versionId?: string): Promise<Pack> {
  const progress = (d: number, n: number, s: { bytes: number; totalBytes: number; speed: number }) => task.progress(t('Pobieranie modpacka'), d, n, s);
  if (source === 'curseforge') {
    curseforge();
    return downloadCurseForgePack(projectId, progress, versionId).then((p) => ({ ...p, source }));
  }
  return downloadModpack(projectId, progress, versionId);
}

handle('modpack:install', (projectId: string, title: string, iconUrl?: string, versionId?: string, source: Source = 'modrinth') =>
  installModpackTask(title, iconUrl, (task) => downloadPack(source, projectId, task, versionId)));
handle('modpack:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: t('Importuj modpack'), filters: [{ name: t('Modpack Modrinth lub CurseForge'), extensions: ['mrpack', 'zip'] }], properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return undefined;
  const file = filePaths[0];
  // a file downloaded from Modrinth is recognised, so the profile can be updated later (a CurseForge zip cannot be)
  return installModpackTask(path.basename(file).replace(/\.(mrpack|zip)$/i, ''), undefined, async () =>
    ({ file, version: isCurseForgePack(file) ? undefined : await identifyModpack(file) }));
});

/** The modpack a profile came from, and the newest version available. */
handle('modpack:check', async (profileId: string) => {
  const profile = profileById(profileId);
  if (!profile.modpack) return undefined;
  if (profile.modpack.source === 'curseforge') {
    curseforge();
    return { current: profile.modpack, latest: await latestCurseForgePack(profile.modpack.projectId) };
  }
  return { current: profile.modpack, latest: await latestModpackVersion(profile.modpack.projectId) };
});

/** Moves a modpack profile to another version (newest when none is given). */
handle('modpack:update', async (profileId: string, versionId?: string) => {
  const profile = profileById(profileId);
  const pack = profile.modpack;
  if (!pack) throw new Error(t('Ten profil nie pochodzi z modpacka Modrinth ani CurseForge.'));
  if (games.has(profile.id)) throw new Error(t('Zamknij grę przed aktualizacją modpacka.'));
  if (snapshotBusy.has(profile.id)) throw new Error(t('Poczekaj, aż skończy się zapisywanie lub przywracanie migawki.'));
  const task = startTask(t('Aktualizowanie modpacka: {0}', pack.title), undefined);
  try {
    const source: Source = pack.source ?? 'modrinth';
    const { file, version } = await downloadPack(source, pack.projectId, task, versionId);
    // mods and config as they are now, so a broken update is one click from undone
    task.progress(t('Zapisywanie migawki profilu'), 0, 1);
    await withSnapshotLock(profile, () => createSnapshot({
      dir: snapshotsDirOf(profile), gameDir: profileGameDir(profile), profile, reason: 'update', label: `${pack.versionNumber} → ${version?.versionNumber ?? '?'}`,
    }));
    const { info, manual } = await installPackFile(profile, file, true, task.progress);
    applyPack(profile, info, version, pack.title, source);
    const memoryNote = await fitPackMemory(profile, true);
    await persist();
    task.finish(true, t('Modpack {0} ma teraz wersję {1}.', pack.title, version!.versionNumber) + memoryNote + manualNote(manual), profile.id, manual.length);
  } catch (err) {
    task.finish(false, t('Nie udało się zaktualizować modpacka: {0}', (err as Error).message));
    throw err;
  }
});

handle('profile:recommendedMemory', (id: string) => profileRecommendedMemory(profileById(id)));
// ---------- copying and exporting profiles ----------

/** Folders that are never copied with a profile: per-session files and potentially huge archives. */
const NOT_COPIED = new Set(['logs', 'crash-reports', 'screenshots', 'backups', 'debug']);

/** A copy of a profile; the page asks first (with or without its worlds) in its own window. */
handle('profile:duplicate', async (id: string, worlds?: boolean) => {
  const withWorlds = worlds === true;
  const source = profileById(id);
  // everything but the identity, folder and play history comes along
  const { id: _id, gameDir: _dir, playTimeMs: _time, lastPlayedAt: _at, lastTarget: _target, ...settings } = source;
  const copy = newProfile({ ...settings, name: t('{0} (kopia)', source.name) });
  const task = startTask(t('Kopiowanie profilu: {0}', source.name));
  try {
    const from = profileGameDir(source);
    task.progress(t('Kopiowanie plików'), 0, 1);
    await fsp.cp(from, profileGameDir(copy), {
      recursive: true,
      filter: (src) => {
        const top = path.relative(from, src).split(path.sep)[0];
        return !NOT_COPIED.has(top) && (withWorlds || top !== 'saves');
      },
    }).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err; // a profile that was never started has no folder yet
    });
    store.profiles.push(copy);
    await persist();
    task.finish(true, t('Utworzono profil „{0}”', copy.name));
    return copy.id;
  } catch (err) {
    task.finish(false, (err as Error).message);
    throw err;
  }
});

/** What each part of a profile holds, for the export dialog. */
handle('profile:exportPreview', async (id: string) => countParts(profileGameDir(profileById(id))));

/** Links for mods and packs: Modrinth by hash, then CurseForge for what the launcher installed from there. Offline, files are just packed. */
const packLinks = (gameDir: string): LinkResolver => async (files) => {
  const links = await modrinthLinks(files.map((f) => f.sha1)).catch(() => new Map<string, string>());
  const rest = new Set(files.map((f) => f.sha1).filter((sha1) => !links.has(sha1)));
  curseforge();
  const cf = rest.size ? await curseForgeLinks(gameDir, rest).catch(() => undefined) : undefined;
  for (const [sha1, url] of cf?.links ?? []) links.set(sha1, url);
  return { links, manual: cf?.manual ?? new Map() };
};

const validParts = (parts: unknown): PackPart[] =>
  Array.isArray(parts) ? PACK_PARTS.filter((p) => parts.includes(p)) : DEFAULT_PARTS;

/** Writes a profile as a .mrpack with the chosen parts (export to a file, and sharing by code). */
async function packProfile(profile: Profile, out: string, parts: PackPart[], onStage: Parameters<typeof installMrpack>[2], skip?: string[]) {
  const gameVersion = await resolveVersionId(profile.versionId);
  // a pack needs an exact loader version; "newest stable" is resolved now
  let loaderVersion = profile.loaderVersion;
  if (profile.loader !== 'vanilla' && !loaderVersion) {
    const all = await loaderVersions(profile.loader, gameVersion);
    loaderVersion = (all.find((v) => v.stable) ?? all[0])?.version ?? '';
  }
  const gameDir = profileGameDir(profile);
  // the settings say "this game version" exactly, like the pack's index; an empty loader version (newest stable) stays empty
  const settings = { ...settingsOf(profile), versionId: gameVersion };
  const res = await writeProfilePack({
    gameDir, out, name: profile.name, gameVersion, loader: profile.loader, loaderVersion, parts, settings, resolve: packLinks(gameDir), onStage, skip,
  });
  return { ...res, gameVersion };
}

handle('profile:export', async (id: string, parts?: PackPart[]) => {
  const profile = profileById(id);
  const chosen = validParts(parts);
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: t('Eksportuj profil'),
    defaultPath: `${profile.name.replace(/[\\/:*?"<>|]/g, '_')}.mrpack`,
    filters: [{ name: 'Modpack Modrinth', extensions: ['mrpack'] }],
  });
  if (canceled || !filePath) return undefined;
  const task = startTask(t('Eksport: {0}', profile.name));
  try {
    const res = await packProfile(profile, filePath, chosen, task.progress);
    const manual = res.manual ? ` ${t('Do pobrania ręcznie z CurseForge: {0} (lista jest w paczce).', res.manual)}` : '';
    task.finish(true, t('Zapisano {0}: {1} plików z linkami, {2} w paczce.', path.basename(filePath), res.linked, res.bundled) + manual);
    shell.showItemInFolder(filePath);
    return filePath;
  } catch (err) {
    task.finish(false, (err as Error).message);
    throw err;
  }
});

/** Pack files picked in the import dialog: the page only gets a key, never sends a path back. */
const pickedPacks = new Map<string, string>();

handle('profile:importPick', async (): Promise<{ key: string; summary: PackSummary } | undefined> => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: t('Importuj profil'), filters: [{ name: t('Profil lub modpack (.mrpack, .zip)'), extensions: ['mrpack', 'zip'] }], properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return undefined;
  const file = filePaths[0];
  let summary: PackSummary;
  if (isCurseForgePack(file)) {
    const { manifest } = readCursePack(file);
    summary = {
      kind: 'curseforge', name: manifest.name, gameVersion: manifest.gameVersion, loader: manifest.loader, loaderVersion: manifest.loaderVersion,
      parts: {}, linked: manifest.files.length, bundled: 0, manual: 0,
    };
  } else summary = readPackSummary(file);
  const key = randomUUID();
  pickedPacks.set(key, file);
  return { key, summary };
});

/** Makes a new profile from a picked pack, with the parts the player kept ticked. */
handle('profile:importPack', async (key: string, opts: { name?: string; parts?: PackPart[] }) => {
  const file = pickedPacks.get(key);
  if (!file) throw new Error(t('Wybierz plik jeszcze raz.'));
  pickedPacks.delete(key);
  if (isCurseForgePack(file)) {
    return installModpackTask(path.basename(file).replace(/\.zip$/i, ''), undefined, async () => ({ file }));
  }
  const parts = validParts(opts?.parts);
  const summary = readPackSummary(file);
  const name = uniqueName((opts?.name ?? '').trim().slice(0, 40) || summary.name, store.profiles.map((p) => p.name));
  const task = startTask(t('Importowanie profilu: {0}', name));
  try {
    const profile = newProfile(newMemory());
    const gameDir = profileGameDir(profile);
    const info = await installMrpack(file, gameDir, task.progress, includePath(parts));
    // a pack exported by SlashClient is not a Modrinth modpack; one downloaded from Modrinth is, and can be updated later
    const version = summary.settings ? undefined : await identifyModpack(file).catch(() => undefined);
    applyPack(profile, info, version, summary.name);
    if (summary.settings && parts.includes('settings')) {
      applySettings(profile, summary.settings);
      if (profile.icon === 'custom') profile.iconVersion = Date.now();
    }
    const memoryNote = summary.settings && parts.includes('settings') ? '' : await fitPackMemory(profile);
    // a custom icon whose picture was not in the pack falls back to the default one
    if (profile.icon === 'custom' && !iconFile(gameDir)) profile.icon = '';
    // the pack's own game settings would be replaced by the shared ones at launch
    if ((parts.includes('options') && summary.parts.options) || (parts.includes('servers') && summary.parts.servers)) profile.syncOptions = false;
    profile.name = name;
    const manual = parts.includes('mods') || parts.includes('resourcepacks') || parts.includes('shaderpacks') ? manualFilesOf(summary.settings) : [];
    store.profiles.push(profile);
    store.settings.selectedProfileId = profile.id;
    if (manual.length) await rememberManual(profile, manual);
    await persist();
    task.finish(true, t('Zaimportowano profil {0}.', name) + memoryNote + manualNote(manual), profile.id, manual.length);
    return profile.id;
  } catch (err) {
    task.finish(false, t('Nie udało się zaimportować profilu: {0}', (err as Error).message));
    throw err;
  }
});

// ---------- sharing a profile by code ----------

const shareTemp = () => path.join(app.getPath('temp'), 'slashclient-shares');
function shareSession(): { server: string; token: string } {
  const token = store.settings.socialToken ? secrets.decrypt(store.settings.socialToken) : undefined;
  if (!token) throw new Error(shareErrorText('unauthorized', 401));
  return { server: store.settings.socialUrl, token };
}
const validSkip = (skip: unknown): string[] =>
  Array.isArray(skip) ? skip.filter((s): s is string => typeof s === 'string' && s.length < 500 && !s.includes('..')).slice(0, 5000) : [];

/** Files of the chosen parts that look like they hold a password or token, for the share dialog. */
handle('profile:shareScan', async (id: string, parts?: PackPart[]) => scanSecrets(profileGameDir(profileById(id)), validParts(parts)));

/** Packs the profile without the files the player unticked, uploads it and answers with the code. */
handle('profile:share', async (id: string, parts?: PackPart[], skip?: string[]) => {
  const profile = profileById(id);
  const session = shareSession();
  const task = startTask(t('Udostępnianie: {0}', profile.name));
  const dir = shareTemp();
  await fsp.mkdir(dir, { recursive: true });
  await cleanShareTemp(dir);
  const file = path.join(dir, `${randomUUID()}.mrpack`);
  try {
    const res = await packProfile(profile, file, validParts(parts), task.progress, validSkip(skip));
    task.progress(t('Wysyłanie na serwer'), 0, 1);
    const share = await uploadShare({ ...session, file, name: profile.name, gameVersion: res.gameVersion, loader: profile.loader });
    task.finish(true, t('Profil {0} udostępniony kodem {1}.', profile.name, formatCode(share.code)));
    return share;
  } catch (err) {
    task.finish(false, t('Nie udało się udostępnić profilu: {0}', (err as Error).message));
    throw err;
  } finally {
    await fsp.rm(file, { force: true }).catch(() => {});
  }
});
handle('profile:shares', async () => {
  const { server, token } = shareSession();
  return listShares(server, token);
});
handle('profile:shareDelete', async (code: string) => {
  const { server, token } = shareSession();
  const valid = normalizeCode(code);
  if (valid) await deleteShare(server, token, valid);
});

/** Downloads the pack behind a code; then it is imported like a picked file (profile:importPack). */
handle('profile:importCode', async (raw: string): Promise<{ key: string; summary: PackSummary; share: SharedProfile }> => {
  const code = normalizeCode(raw);
  if (!code) throw new Error(t('Kod ma 8 znaków, np. ABCD-EFGH.'));
  const server = store.settings.socialUrl;
  const share = await shareInfo(server, code);
  const dir = shareTemp();
  await cleanShareTemp(dir);
  const file = path.join(dir, `${randomUUID()}.mrpack`);
  await downloadShare(server, code, file);
  try {
    // a shared profile is always a SlashClient .mrpack; a CurseForge zip under a code is refused
    if (isCurseForgePack(file)) throw new Error(t('To nie jest modpack Modrinth (.mrpack).'));
    const summary = readPackSummary(file);
    const key = randomUUID();
    pickedPacks.set(key, file);
    return { key, summary, share };
  } catch (err) {
    await fsp.rm(file, { force: true }).catch(() => {});
    throw err;
  }
});

/** Publishes the log on the SlashClient server (the page has asked the player first, in its own window). */
async function shareLogText(text: string) {
  const shared = await shareLog(text, store.settings.socialUrl);
  clipboard.writeText(shared.url);
  return shared;
}
handle('log:share', async (text: string) => (await shareLogText(text)).url);
/** A bug report on the site, with the log attached when there is one and the player agrees to share it. */
handle('bug:report', async (text?: string) => {
  const params = new URLSearchParams({ nowe: '1', wersja: app.getVersion() });
  if (text?.trim()) params.set('log', (await shareLogText(text)).id);
  await shell.openExternal(`${store.settings.socialUrl.replace(/\/$/, '')}/zgloszenia?${params}`);
  return true;
});
handle('servers:list', (force?: boolean) => listServers(force));
// a server that is off is an answer, not an error: no noise in the log for every offline server
handle('servers:ping', (address: string) => pingServer(address).catch((err: Error) => ({ offline: err.message })));
handle('servers:details', (id: string, withHistory?: boolean) => serverDetails(id, withHistory !== false));
handle('servers:history', (id: string) => serverHistory(id));

// voting on the server list in one click: the SlashClient server vouches for the player's Minecraft
// name (verified by Mojang when linked) to the list (server/src/serverVotes.ts)
const SERVER_ID = /^[\w.:-]{1,100}$/;
/** The Minecraft account chosen in the launcher, when it is a Microsoft one: its name is the one to vote as. */
function votingAccount() {
  const account = store.accounts.find((a) => a.id === store.settings.selectedAccountId) ?? store.accounts[0];
  return account?.type === 'msa' ? account : undefined;
}
handle('servers:voted', (ids: string[]) => socialCall(async () => {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && SERVER_ID.test(id))) throw new SocialError('bad_request');
  const signedIn = !!store.settings.socialToken;
  try {
    return await social.call('POST', '/v1/servers/voted', { ids: ids.slice(0, 100), nick: votingAccount()?.name }, signedIn);
  } catch (err) {
    // a server from before voting (or an expired session): voting on the website
    if (err instanceof SocialError && (err.httpStatus === 404 || err.code === 'offline')) return { enabled: false, nick: null, voted: {} };
    throw err;
  }
}));
handle('servers:vote', (id: string) => socialCall(async () => {
  if (typeof id !== 'string' || !SERVER_ID.test(id)) throw new SocialError('bad_request');
  const account = votingAccount();
  const vote = () => social.call<{ ok: boolean; nick: string; votes: number | null }>('POST', `/v1/servers/${encodeURIComponent(id)}/vote`, { nick: account?.name });
  try {
    return await vote();
  } catch (err) {
    // the chosen Minecraft account is not linked yet: link it (Mojang confirms it) and vote again
    if (account && err instanceof SocialError && (err.code === 'mc_not_linked' || err.code === 'mc_account_not_linked')) {
      await linkMinecraft(account.id);
      return vote();
    }
    throw err;
  }
}));

// ---------- worlds, backups, screenshots ----------

const gameDirOf = (profileId: string) => profileGameDir(profileById(profileId));
handle('worlds:list', (profileId: string) => listWorlds(gameDirOf(profileId)));
handle('worlds:backup', (profileId: string, folder: string) => backupWorld(gameDirOf(profileId), folder));
handle('backups:list', (profileId: string) => listBackups(gameDirOf(profileId)));
handle('backups:restore', (profileId: string, name: string) => restoreBackup(gameDirOf(profileId), name));
handle('backups:delete', (profileId: string, name: string) => deleteFile(gameDirOf(profileId), 'backups', name));
handle('screenshots:list', (profileId: string) => listScreenshots(gameDirOf(profileId)));
handle('clips:list', (profileId: string) => listClips(gameDirOf(profileId)));
handle('clips:delete', (profileId: string, name: string) => deleteFile(gameDirOf(profileId), 'clips', name));
handle('screenshots:delete', (profileId: string, name: string) => deleteFile(gameDirOf(profileId), 'screenshots', name));
// trimming clips and sharing screenshots and clips by link (mediaShare.ts)
registerMediaSharing({ handle, gameDirOf, session: () => shareSession(), copy: (text) => clipboard.writeText(text) });
// ---------- config editor and disk cleanup (maintenance.ts) ----------

registerMaintenance({
  handle, profiles: () => store.profiles, running: (id) => games.has(id), anyRunning: () => games.size > 0,
  trash: (file) => shell.trashItem(file), openPath: (dir) => shell.openPath(dir), defaultJavaVendor: () => store.settings.javaVendor,
});
registerLauncherTools({ handle, profiles: () => store.profiles, running: (id) => games.has(id) });

handle('file:open', (file: string) => {
  if (isInsideInstances(file)) return shell.openPath(file);
});

// ---------- world export and import (.zip), datapacks in a world ----------

handle('worlds:export', async (profileId: string, folder: string) => {
  const gameDir = gameDirOf(profileId);
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: t('Eksportuj świat'), defaultPath: `${folder.replace(/[\\/:*?"<>|]/g, '_')}.zip`, filters: [{ name: t('Świat Minecrafta (.zip)'), extensions: ['zip'] }],
  });
  if (canceled || !filePath) return undefined;
  const task = startTask(t('Eksport świata: {0}', folder));
  try {
    task.progress(t('Pakowanie świata'), 0, 1);
    const size = await exportWorld(gameDir, folder, filePath);
    task.finish(true, t('Zapisano {0} ({1} MB).', path.basename(filePath), (size / 1024 / 1024).toFixed(1)));
    shell.showItemInFolder(filePath);
    return filePath;
  } catch (err) {
    task.finish(false, (err as Error).message);
    throw err;
  }
});

/** World zips picked in the import dialog: the page only gets a key, never sends a path back. */
const pickedWorlds = new Map<string, string>();

handle('worlds:importPick', async (): Promise<{ key: string; summary: WorldZipSummary } | undefined> => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: t('Importuj świat'), filters: [{ name: t('Świat Minecrafta (.zip)'), extensions: ['zip'] }], properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return undefined;
  const { summary } = await readWorldZip(filePaths[0]);
  const key = randomUUID();
  pickedWorlds.set(key, filePaths[0]);
  return { key, summary };
});

handle('worlds:import', async (profileId: string, key: string) => {
  const file = pickedWorlds.get(key);
  if (!file) throw new Error(t('Wybierz plik jeszcze raz.'));
  pickedWorlds.delete(key);
  const gameDir = gameDirOf(profileId);
  const task = startTask(t('Import świata: {0}', path.basename(file)));
  try {
    const folder = await importWorldZip(gameDir, file, (done, total) => task.progress(t('Rozpakowywanie'), done, total));
    task.finish(true, t('Zaimportowano świat „{0}”.', folder));
    return folder;
  } catch (err) {
    task.finish(false, t('Nie udało się zaimportować świata: {0}', (err as Error).message));
    throw err;
  }
});

handle('datapacks:list', (profileId: string, world: string) => listDatapacks(gameDirOf(profileId), world));
handle('datapacks:remove', (profileId: string, world: string, filename: string) => removeDatapack(gameDirOf(profileId), world, filename));
/** Datapacks come from Modrinth only and go into one world of the profile. */
handle('datapacks:install', async (profileId: string, world: string, projectId: string, title?: string, icon?: string, versionId?: string) => {
  const { gameDir, gameVersion } = await profileTarget(profileId);
  const task = startTask(t('Instalowanie: {0}', title ?? ''), icon);
  try {
    const file = await datapackFile(projectId, gameVersion, versionId);
    await installDatapack(gameDir, world, file, (done, total, stats) => task.progress(t('Pobieranie'), done, total, stats));
    task.finish(true, t('Zainstalowano {0} w świecie „{1}”.', file.title, world));
    return file.title;
  } catch (err) {
    task.finish(false, (err as Error).message);
    throw err;
  }
});

// ---------- profile snapshots (mods and config before a modpack update) ----------

/** A profile's snapshots live in the launcher's data folder, not in its game folder. */
function snapshotsDirOf(profile: Profile): string {
  if (!/^[\w-]+$/.test(profile.id)) throw new Error(t('Nieprawidłowy profil.'));
  return path.join(paths.root, 'snapshots', profile.id);
}
/** Profiles with a snapshot being taken or restored: the game, an update or another snapshot waits for it. */
const snapshotBusy = new Set<string>();
async function withSnapshotLock<T>(profile: Profile, work: () => Promise<T>): Promise<T> {
  if (snapshotBusy.has(profile.id)) throw new Error(t('Poczekaj, aż skończy się zapisywanie lub przywracanie migawki.'));
  snapshotBusy.add(profile.id);
  try {
    return await work();
  } finally {
    snapshotBusy.delete(profile.id);
  }
}

handle('snapshots:list', (profileId: string) => listSnapshots(snapshotsDirOf(profileById(profileId))));
handle('snapshots:create', async (profileId: string) => {
  const profile = profileById(profileId);
  if (games.has(profile.id)) throw new Error(t('Zamknij grę przed zrobieniem migawki.'));
  return withSnapshotLock(profile, () => createSnapshot({ dir: snapshotsDirOf(profile), gameDir: profileGameDir(profile), profile, reason: 'manual' }));
});
handle('snapshots:restore', async (profileId: string, id: string) => {
  const profile = profileById(profileId);
  if (games.has(profile.id)) throw new Error(t('Zamknij grę przed przywróceniem migawki.'));
  const info = await withSnapshotLock(profile, () => restoreSnapshot(snapshotsDirOf(profile), id, profileGameDir(profile)));
  applySnapshot(profile, info);
  await persist();
  return info;
});
handle('snapshots:delete', (profileId: string, id: string) => deleteSnapshot(snapshotsDirOf(profileById(profileId)), id));

// ---------- profiles on the account (cloudProfiles.ts) and moving to another Minecraft version (versionMove.ts) ----------

const snapshotBefore = (profile: Profile, label: string) =>
  withSnapshotLock(profile, () => createSnapshot({ dir: snapshotsDirOf(profile), gameDir: profileGameDir(profile), profile, reason: 'manual', label }));
const cloudProfiles = registerCloudProfiles({
  handle, profiles: () => store.profiles, gameDir: profileGameDir, running: (id) => games.has(id), persist,
  startTask: (title) => startTask(title), session: shareSession, signedIn: () => !!store.settings.socialToken,
  pack: (profile, out, parts, onStage) => packProfile(profile, out, parts, onStage),
  snapshot: snapshotBefore, defaults: newMemory,
  add: (profile) => {
    store.profiles.push(profile);
    store.settings.selectedProfileId = profile.id;
  },
  linksFile: path.join(paths.root, 'cloud-profiles.json'), tempDir: path.join(app.getPath('temp'), 'slashclient-cloud'),
});
registerVersionMove({
  handle, profiles: () => store.profiles, gameDir: profileGameDir, running: (id) => games.has(id), persist,
  startTask: (title) => startTask(title), resolveVersion: resolveVersionId, snapshot: snapshotBefore,
  loaderSupports: async (loader, gameVersion) => loader === 'vanilla' || (await loaderVersions(loader, gameVersion).catch(() => [])).length > 0,
  installMod: (gameDir, projectId, gameVersion, loader) => installProject(gameDir, projectId, 'mod', gameVersion, loader),
});

/** True for files inside one of the profiles' game folders. */
function isInsideInstances(file: string): boolean {
  const full = path.resolve(file);
  // the icon library is shown next to the profiles' own pictures
  if (full.startsWith(path.resolve(LIBRARY) + path.sep)) return true;
  return store.profiles.some((p) => full.startsWith(path.resolve(profileGameDir(p)) + path.sep));
}

// ---------- play time and "back to the game" ----------

/** Adds the session to the profile's play time and remembers where the player ended up. */
async function recordSession(profile: Profile, startedAt: number, server: { address: string; at: number } | undefined) {
  const live = store.profiles.find((p) => p.id === profile.id);
  if (!live) return;
  const now = Date.now();
  live.playTimeMs = (live.playTimeMs ?? 0) + (now - startedAt);
  live.lastPlayedAt = now;
  const gameDir = profileGameDir(live);
  const played = await worldPlayedSince(gameDir, startedAt);
  const world = played && { ...played, name: (await listWorlds(gameDir)).find((w) => w.folder === played.folder)?.name ?? played.folder };
  live.lastTarget = lastTarget(server, world) ?? live.lastTarget;
  await persist();
}

// ---------- skins and news ----------

handle('skin:get', (accountId: string) => {
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Nie znaleziono konta.');
  return skinFor(account);
});
handle('skin:save', async (accountId: string) => {
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account) return;
  const { dataUrl } = await skinFor(account);
  const { canceled, filePath } = await dialog.showSaveDialog(win!, { defaultPath: `${account.name}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (!canceled && filePath) await fsp.writeFile(filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
});
handle('update:install', () => installUpdate());
handle('update:status', () => updateStatus());
handle('update:check', () => checkForUpdates());
// macOS: the new version from the website (Apple Silicon or Intel, like this build)
handle('update:retry', () => retryMacUpdate());
handle('update:moveToApplications', () => moveToApplications());
handle('update:download', () => shell.openExternal(`${store.settings.socialUrl}/pobierz/${process.arch === 'arm64' ? 'mac' : 'mac-intel'}`));
handle('app:version', () => app.getVersion());
/** A Microsoft account with a valid Minecraft token, at least `marginMs` left (refreshed and saved if needed). */
async function freshMsa(accountId: string, marginMs = 0): Promise<MicrosoftAccount> {
  const account = store.accounts.find((a) => a.id === accountId);
  if (account?.type !== 'msa') throw new Error(t('Skin i pelerynę można zmienić tylko na koncie Microsoft.'));
  const fresh = await ensureFreshAccount(account, store.settings.msClientId.trim(), marginMs);
  if (fresh !== account) {
    store.accounts = store.accounts.map((a) => (a.id === fresh.id ? fresh : a));
    await saveStore(store);
  }
  return fresh;
}

/** The skin file the player picked, kept here until they confirm (the page only gets a preview). */
let pendingSkin: Buffer | undefined;

handle('skin:capes', async (accountId: string) => ownedCapes((await freshMsa(accountId)).accessToken));
handle('skin:pickFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: t('Wybierz skin'), filters: [{ name: 'PNG', extensions: ['png'] }], properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return undefined;
  const png = await fsp.readFile(filePaths[0]);
  const preview = readSkinFile(png);
  pendingSkin = png;
  return preview;
});
/** A skin made in the editor: checked like a picked file, then waits for "Save skin". */
handle('skin:setPending', (dataUrl: string) => {
  const png = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  const preview = readSkinFile(png);
  pendingSkin = png;
  return preview;
});
handle('skin:upload', async (accountId: string, variant: 'classic' | 'slim') => {
  if (!pendingSkin) throw new Error(t('Najpierw wybierz plik skina.'));
  await uploadSkin((await freshMsa(accountId)).accessToken, pendingSkin, variant);
  pendingSkin = undefined;
});
handle('skin:reset', async (accountId: string) => resetSkin((await freshMsa(accountId)).accessToken));
handle('skin:setCape', async (accountId: string, capeId: string | null) => setCape((await freshMsa(accountId)).accessToken, capeId));

// ---------- skin library ----------

handle('skinlib:list', () => listPresets());
/** Saves the account's current skin (and the cape it wears) as a preset. */
handle('skinlib:saveCurrent', async (accountId: string, name: string, capeId?: string | null) => {
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Nie znaleziono konta.');
  const skin = await skinFor(account);
  const png = Buffer.from(skin.dataUrl.split(',')[1], 'base64');
  return addPreset(png, { name: name || account.name, variant: skin.model === 'slim' ? 'slim' : 'classic', capeId: account.type === 'msa' ? capeId : undefined });
});
handle('skinlib:addData', (dataUrl: string, name: string, variant: 'classic' | 'slim') => {
  const png = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  readSkinFile(png);
  return addPreset(png, { name, variant });
});
handle('skinlib:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: t('Dodaj skiny do biblioteki'), filters: [{ name: 'PNG', extensions: ['png'] }], properties: ['openFile', 'multiSelections'],
  });
  if (canceled) return [];
  const added: SkinPreset[] = [];
  for (const file of filePaths) {
    const png = await fsp.readFile(file);
    const image = nativeImage.createFromBuffer(png);
    const { width, height } = image.getSize();
    const variant = looksSlim(image.toBitmap(), width, height) ? 'slim' : 'classic';
    added.push(await addPreset(png, { name: path.basename(file, path.extname(file)), variant }));
  }
  return added;
});
handle('skinlib:update', (id: string, changes: Partial<Pick<SkinPreset, 'name' | 'variant' | 'capeId'>>) => updatePreset(id, changes));
handle('skinlib:remove', (id: string) => removePreset(id));
/** Puts a preset on the account: the skin, then its cape when the account owns it. */
handle('skinlib:apply', async (accountId: string, id: string) => {
  const { preset, png } = await readPreset(id);
  const { accessToken } = await freshMsa(accountId);
  await uploadSkin(accessToken, png, preset.variant);
  if (preset.capeId === null) await setCape(accessToken, null);
  else if (preset.capeId && (await ownedCapes(accessToken)).some((c) => c.id === preset.capeId)) await setCape(accessToken, preset.capeId);
});

handle('news:list', (offset: number, limit: number, filter: NewsFilter) => newsPage(offset, limit, filter));
handle('news:article', (id: string) => newsArticle(id));

handle('game:launch', (profileId: string, accountId: string, server?: string, world?: string, benchmark: boolean | 'scene' = false) => launchGame(profileId, accountId, server, world, benchmark));
/** Launch options only the launcher itself uses (the Java comparison in javaCompare.ts). */
interface LaunchExtras { javaVendor?: JavaVendor; quitAfterBenchmark?: boolean; onJava?: (choice: JavaChoice) => void }
async function launchGame(profileId: string, accountId: string, server?: string, world?: string, benchmark: boolean | 'scene' = false, extras: LaunchExtras = {}) {
  if (games.has(profileId)) throw new Error(t('Ten profil już działa.'));
  if (snapshotBusy.has(profileId)) throw new Error(t('Poczekaj, aż skończy się zapisywanie lub przywracanie migawki.'));
  const profile = store.profiles.find((p) => p.id === profileId);
  // a profile with its own account always plays as it
  let account = store.accounts.find((a) => a.id === (profile?.accountId && store.accounts.some((x) => x.id === profile.accountId) ? profile.accountId : accountId));
  if (!profile) throw new Error('Wybierz profil.');
  if (!account) throw new Error('Dodaj i wybierz konto.');

  store.settings.selectedProfileId = profile.id;
  store.settings.selectedAccountId = account.id;
  if (account.type === 'msa') {
    send('launch:stage', { stage: t('Odświeżanie sesji Microsoft'), done: 0, total: 1 });
    const fresh = await ensureFreshAccount(account, store.settings.msClientId.trim());
    store.accounts = store.accounts.map((a) => (a.id === fresh.id ? fresh : a));
    account = fresh;
  }
  await persist();

  // shared game settings: the profile gets them before the game starts and gives them back afterwards
  if (profile.syncOptions) await pullShared(profileGameDir(profile));

  // keep the tail of the output for crash analysis
  const recentLog: string[] = [];
  let lastServer: { address: string; at: number } | undefined = server ? { address: server, at: Date.now() } : undefined;
  const joins: { address: string; at: number }[] = lastServer ? [lastServer] : [];
  const startedAt = Date.now();
  const consoleLog = await consoleHistory.start(profile.id, startedAt).catch(() => undefined);
  const loaderName = profile.loader === 'vanilla' ? '' : ` · ${LOADER_NAMES[profile.loader]}`;
  const presence: Presence = {
    details: `Minecraft ${await resolveVersionId(profile.versionId)}${loaderName}`,
    state: server ? t('Na serwerze {0}', server) : t('W menu'),
    startTimestamp: startedAt,
    largeImageKey: 'logo',
    largeImageText: 'SlashClient',
  };
  gameAccountId = account.id;
  const hud = await prepareProfileHud(profile);
  // only a game with our HUD talks to the bridge
  if (hud.jvmArgs.length) {
    await bridge.start();
    hud.jvmArgs.push(...bridge.jvmArgs());
  }
  // the benchmark runs inside SlashClient HUD: it starts by itself once the world is loaded; on the
  // test scene the mod opens (the first time makes) its own world from the menu
  if (benchmark) {
    if (!hud.jvmArgs.length) throw new Error(t('Benchmark działa z modem SlashClient: w profilu Fabric lub vanilla w wersji, którą mod obsługuje.'));
    hud.jvmArgs.push('-Dslashclient.benchmark=true');
    if (benchmark === 'scene') {
      hud.jvmArgs.push('-Dslashclient.benchmark.scene=true');
      world = undefined;
    }
    // runs one after another (the Java comparison): the game closes by itself after the run
    if (extras.quitAfterBenchmark) hud.jvmArgs.push('-Dslashclient.benchmark.quit=true');
  }
  const benchmarksBefore = benchmark ? (await readBenchmarks(profileGameDir(profile)))[0]?.at ?? 0 : 0;
  const activityVersion = `${await resolveVersionId(profile.versionId)}${loaderName}`;
  social.setActivity({ kind: server ? 'server' : 'menu', server: server || undefined, version: activityVersion, since: startedAt });
  // the servers' Discord looks and tab list rules, ready before the game is on one
  void statusRules.refresh();
  const child = await launch({
    profile: hud.profile,
    account,
    onStage: (stage, done, total, stats) => send('launch:stage', { stage, done, total, ...stats }),
    onLog: (line) => {
      recentLog.push(line);
      if (recentLog.length > 3000) recentLog.shift();
      consoleLog?.line(line);
      send('game:log', { profileId: profile.id, line });
      const joined = serverFromLog(line);
      if (joined) {
        lastServer = { address: joined, at: Date.now() };
        // Quick Play logs the same connect we already counted
        if (joins.at(-1)?.address !== joined || Date.now() - joins.at(-1)!.at > 30_000) joins.push(lastServer);
      }
      const now = activityFromLog(line);
      if (now) social.setActivity({ ...now, version: activityVersion, since: startedAt });
      const update = presenceFromLog(line);
      if (update && update.state !== presence.state) {
        presence.state = update.state;
        showPresence(presence);
      }
    },
    server,
    world,
    extraJvmArgs: hud.jvmArgs,
    ...(await gpuLaunchOptions(store.settings)),
    javaVendor: extras.javaVendor ?? effectiveJavaVendor(profile.javaVendor, store.settings.javaVendor),
    onNotice: (message) => send('launch:notice', { profileId: profile.id, message }),
    onJava: extras.onJava,
  });
  // capes and emotes: the SlashClient account says which Minecraft player it is, while the game runs
  const linkPlayer = () => {
    if (social.state().user && account.uuid) social.call('POST', '/v1/mc/link', { uuid: account.uuid }).catch(() => {});
  };
  const running: RunningGame = { child, hasHud: hud.jvmArgs.length > 0, killRequested: false, presence, link: linkPlayer };
  games.set(profile.id, running);
  linkPlayer();
  const linkTimer = setInterval(linkPlayer, 4 * 60_000);
  showPresence(presence);
  send('store', publicStore());
  if (store.settings.closeOnLaunch) win?.hide();
  child.on('exit', (code, signal) => {
    games.delete(profile.id);
    // the game is gone: its LAN world too, and the ports into friends' worlds
    if (!games.size) lan.stop();
    const killRequested = running.killRequested;
    // the console goes into the history; the Play screen lists it once it is written
    consoleLog?.end(code, code !== 0 && !killRequested).then(() => send('console:saved', { profileId: profile.id })).catch(() => {});
    clearInterval(linkTimer);
    // a finished benchmark run: tell the page, which shows the result
    if (benchmark) readBenchmarks(profileGameDir(profile)).then((runs) => {
      if (runs[0] && runs[0].at > benchmarksBefore) send('benchmark:done', { profileId: profile.id, result: runs[0], before: comparableBefore(runs, 0) });
    }).catch(() => {});
    if (profile.syncOptions) pushShared(profileGameDir(profile)).catch(() => {});
    // profiles synced with the account go there after the game
    cloudProfiles.afterGame(profile.id).catch((err) => console.error('chmura:', (err as Error).message));
    recordSession(profile, startedAt, lastServer).catch(() => {});
    // the servers of this game count for friends' "Popularne" once the session is written
    setTimeout(() => popular.poke(), 5_000);
    const endedAt = Date.now();
    resolveVersionId(profile.versionId).then(async (versionId) => {
      await appendSession({ start: startedAt, end: endedAt, profileId: profile.id, profileName: profile.name, versionId, loader: profile.loader, servers: joins }).catch(() => {});
      // "Podsumowanie sesji" (sessionSummary.ts): kept for the statistics, shown when the setting allows
      await finishSessionSummary({ profile, versionId, startedAt, endedAt, joins, code, byUser: killRequested, benchmark: !!benchmark });
    }).catch((err) => console.error('podsumowanie sesji:', (err as Error).message));
    // another game still running keeps Discord and friends up to date; the last one closing goes back to idle
    const other = [...games.values()].at(-1);
    showPresence(other ? other.presence : idlePresence());
    if (!other) social.setActivity({ kind: 'launcher' });
    send('game:exit', { code, signal, byUser: killRequested, profileId: profile.id });
    if (code !== 0 && !killRequested) {
      analyzeCrash({ log: recentLog, gameDir: profileGameDir(profile), startedAt, code, signal })
        .then((analysis) => send('game:crash', { ...analysis, profileId: profile.id }))
        .catch(() => {});
    }
    send('store', publicStore());
    if (store.settings.closeOnLaunch && !games.size) win?.show();
  });
}
handle('file:reveal', (file: string) => {
  // only crash reports inside the launcher's own folders
  if (path.resolve(file).startsWith(paths.root + path.sep) || store.profiles.some((p) => path.resolve(file).startsWith(path.resolve(profileGameDir(p)) + path.sep))) shell.showItemInFolder(file);
});
/** Stops one profile's game, or every game when no profile is given. */
handle('game:kill', (profileId?: string) => {
  for (const [id, g] of games) {
    if (profileId && id !== profileId) continue;
    g.killRequested = true;
    g.child.kill();
  }
});

// ---------- SlashClient HUD ----------

// "Porównaj w benchmarku": the test scene on the profile's Java and on another one
registerJavaCompare({
  handle, send,
  profile: (id) => store.profiles.find((p) => p.id === id),
  defaultVendor: () => store.settings.javaVendor,
  running: (id) => games.has(id),
  launch: (profileId, accountId, javaVendor, onJava) => launchGame(profileId, accountId, undefined, undefined, 'scene', { javaVendor, quitAfterBenchmark: true, onJava }),
  child: (id) => games.get(id)?.child,
  kill: (id) => {
    const g = games.get(id);
    if (!g) return;
    g.killRequested = true;
    g.child.kill();
  },
});

handle('benchmark:list', (profileId: string) => {
  const profile = profileById(profileId);
  return profile ? readBenchmarks(profileGameDir(profile)) : [];
});

/** HUD settings of a profile as a share code in the clipboard, and back. */
handle('hud:copyCode', async (profileId: string) => {
  const profile = profileById(profileId);
  if (!profile) throw new Error(t('Nie znaleziono profilu.'));
  clipboard.writeText(await exportHud(profileGameDir(profile)));
});
handle('hud:pasteCode', async (profileId: string) => {
  const profile = profileById(profileId);
  if (!profile) throw new Error(t('Nie znaleziono profilu.'));
  await importHud(profileGameDir(profile), await clipboard.readText());
});

/**
 * How a profile is started with SlashClient HUD, the way Feather does it: Fabric profiles get the
 * HUD (and Fabric API, if they lack it) injected; vanilla profiles are started through a hidden
 * Fabric Loader that loads only our jars (its mods folder points at an empty one), so the profile
 * stays vanilla for the player and nothing lands in mods/.
 */
async function prepareProfileHud(profile: Profile): Promise<{ profile: Profile; jvmArgs: string[] }> {
  const gameVersion = await resolveVersionId(profile.versionId);
  const hidden = profile.loader === 'vanilla' && (profile.hud ?? true) && hudSupported.includes(gameVersion);
  const loader = hidden ? 'fabric' : profile.loader;
  const cacheDir = path.join(paths.root, 'hud');
  const jars = await prepareHud(HUD_DIR, profileGameDir(profile), {
    enabled: profile.hud ?? true, loader, gameVersion, cacheDir, socialUrl: store.settings.socialUrl,
    // the hidden Fabric has no mods of its own: Fabric API always comes from us
    ignoreProfileMods: hidden,
  }, () => send('launch:stage', { stage: t('Pobieranie Fabric API dla moda SlashClient'), done: 0, total: 1 }));
  if (!hidden || !jars.length) return { profile, jvmArgs: addModsArgs(jars) };
  const noMods = path.join(cacheDir, 'no-mods');
  await fsp.mkdir(noMods, { recursive: true });
  return {
    profile: { ...profile, loader: 'fabric', loaderVersion: '' },
    jvmArgs: [...addModsArgs(jars), `-Dfabric.modsFolder=${noMods}`],
  };
}

// ---------- friends, statuses and messages ----------
// The SlashClient account is separate from the game accounts: signing in or out here
// never touches the Minecraft accounts or which one is selected.

const social = new SocialClient({
  url: () => store.settings.socialUrl,
  token: () => (store.settings.socialToken ? secrets.decrypt(store.settings.socialToken) : undefined),
  saveToken: async (token) => {
    store.settings.socialToken = token ? secrets.encrypt(token) : undefined;
    await persist();
  },
  status: () => store.settings.socialStatus,
  emit: (event) => {
    // the page and the game get messages already decrypted; a launcher's new key drops the cached ones
    // an edited message comes as a new one would; a deleted one has no text left to open (server 0.9.23+)
    if ((event.type === 'message' || event.type === 'message-edit' || event.type === 'message-delete') && event.message) event = { ...event, message: openMessage(event.message as ChatMessage) };
    if (event.type === 'keys' && typeof event.user === 'string') chatKeys.delete(event.user);
    // a new device of the account, a device removed, history handed over to this launcher (chatKeys.ts)
    if (event.type === 'chat-keys' || event.type === 'chat-wraps' || (event.type === 'keys' && event.user === social.state().user?.id)) refreshChatKeys();
    // group chats: the same, with the group's members' keys (who is in it may have changed)
    if ((event.type === 'group-message' || event.type === 'group-message-edit' || event.type === 'group-message-delete') && event.message) event = { ...event, message: openGroup(event.message as GroupChatMessage) };
    if (event.type === 'groups' || event.type === 'keys') groupKeys.clear();
    send('social:event', event);
    bridge.push(event as { type: string });
    // a friend joins the world this game opened to LAN
    if (event.type === 'lan-connect' && typeof event.id === 'string') lan.accept(event.id);
  },
  onReady: () => {
    // another account than before: nothing of the old one's keys stays in memory
    if (social.state().user?.id !== chatKeysUser) historyKeys.reset();
    chatKeysUser = social.state().user?.id;
    void registerChatKey();
    popularReady();
    lan.resend();
    // connected again (the server restarted, or the network was away): the running games say who plays, right away
    for (const g of games.values()) g.link();
  },
});

/**
 * "Popularne wśród znajomych" (friendsPopular.ts): the recognised projects of the profiles and the
 * servers of the last 30 days go to the server when they change, at most every few minutes.
 */
const popular = new PopularReporter({
  signedIn: () => !!social.state().user,
  collect: async () => {
    const profiles = await Promise.all(store.profiles.map(async (p) => ({
      loader: p.loader,
      gameVersion: await resolveVersionId(p.versionId).catch(() => p.versionId),
      items: await listInstalled(profileGameDir(p)).catch(() => []),
    })));
    const last = store.profiles.flatMap((p) => (p.lastTarget?.kind === 'server' && p.lastPlayedAt ? [{ address: p.lastTarget.address, at: p.lastPlayedAt }] : []));
    return { content: contentOf(profiles), servers: recentServers(await readSessions().catch(() => []), Date.now(), last) };
  },
  send: (report) => social.call('POST', '/v1/me/popular', report),
});
let popularUser: string | undefined;
/** Signed in (again): a new account sends its own list even when it is the same as the last one. */
function popularReady() {
  const id = social.state().user?.id;
  if (id !== popularUser) popular.reset();
  popularUser = id;
  popular.poke();
}
// installs, removals and new profiles are picked up within minutes; nothing goes when nothing changed
setInterval(() => popular.poke(), 10 * 60_000).unref?.();
/** The projects a friends' section shows, as search hits (titles and icons from the sites). */
handle('content:popularProjects', async (source: Source, ids: string[]) => {
  if (!Array.isArray(ids)) return [];
  const list = ids.filter((id) => typeof id === 'string');
  if (source !== 'curseforge') return projectsByIds(list);
  curseforge();
  return curseForgeProjects(list).catch((err) => {
    if (err instanceof CurseForgeUnavailable) return [];
    throw err;
  });
});

/** GIFs and stickers in the chat: their files through the server or from the CDN, as the server says (gifMedia.ts). */
const gifMedia = createGifMedia({
  config: () => social.call<{ proxy?: boolean }>('GET', '/v1/gifs', undefined, false),
  serverUrl: () => store.settings.socialUrl,
  fetch: (url) => net.fetch(url),
});

/** Friends joining worlds opened to LAN, through the server's relay. */
const lan = new LanTunnels({
  url: () => store.settings.socialUrl,
  token: () => (store.settings.socialToken ? secrets.decrypt(store.settings.socialToken) : undefined),
  send: (message) => social.send(message),
});

/** The account the running game plays as (it can change from the game's menu). */
let gameAccountId: string | undefined;
/** When the game last asked for its session to be renewed at once (a server refused it). */
let lastForcedRenew: number | undefined;
/** The last renewal asked for: the game's timer and its join may ask at the same moment, they go one after another (the second finds the fresh token). */
let renewing: Promise<unknown> | undefined;

/** The running game's session with a token that lasts (bridge `/session`); offline accounts need nothing. */
async function gameSession(force: boolean) {
  const account = store.accounts.find((a) => a.id === gameAccountId);
  if (!account) return undefined;
  if (account.type !== 'msa') return { type: 'offline' as const };
  const now = Date.now();
  const margin = gameSessionMargin(force, lastForcedRenew, now);
  if (margin === Infinity) lastForcedRenew = now;
  const run = (renewing ?? Promise.resolve()).catch(() => undefined).then(() => freshMsa(account.id, margin));
  renewing = run;
  const fresh = await run;
  return { type: 'msa' as const, name: fresh.name, uuid: fresh.uuid, accessToken: fresh.accessToken, xuid: fresh.xuid, expiresAt: fresh.expiresAt };
}

/** Friends and chat for SlashClient HUD in the game, without handing it the account token. */
const bridge = new GameBridge({
  call: (method, apiPath, body) => chatCall(method, apiPath, body),
  state: () => {
    const s = social.state();
    return { signedIn: !!s.user, user: s.user, connected: s.connected };
  },
  accounts: () => store.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, current: a.id === gameAccountId })),
  // the game renews its own Minecraft token before it runs out (about a day), with no restart
  session: (force) => gameSession(force),
  lanHost: (port) => lan.setHost(port),
  lanJoin: (host) => lan.join(host),
  // switching accounts in the game's menu: the game gets this one account's session, nothing else
  useAccount: async (id) => {
    const account = store.accounts.find((a) => a.id === id);
    if (!account) throw new Error('no_account');
    const session = account.type === 'msa'
      ? await freshMsa(id).then((a) => ({ name: a.name, uuid: a.uuid, accessToken: a.accessToken, xuid: a.xuid, type: 'msa' }))
      : { name: account.name, uuid: account.uuid, accessToken: randomBytes(16).toString('hex'), xuid: '', type: 'offline' };
    gameAccountId = id;
    store.settings.selectedAccountId = id;
    await persist();
    void signInWithMinecraft();
    return session;
  },
  // F2 in game: only a PNG in the screenshots folder of one of the profiles
  copyImage: async (file) => {
    const png = await fsp.readFile(await screenshotFile(file));
    if (nativeImage.createFromBuffer(png).isEmpty()) throw new Error('not_an_image');
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
  },
  // a screenshot sent to a friend from the game's chat: the same check, then encrypted here and sent
  sendImage: async (friendId, file) => ({ message: await sendChatImage(friendId, await screenshotFile(file)) }),
  sendGroupImage: async (groupId, file) => ({ message: await sendGroupImage(groupId, await screenshotFile(file)) }),
  // to a community's channel (not encrypted: the server keeps it as a JPEG for the members)
  sendCommunityImage: async (communityId, channelId, file) => ({ message: await sendCommunityImage(communityId, channelId, await screenshotFile(file)) }),
  communityImage: async (communityId, id) => {
    const img = nativeImage.createFromBuffer(await communityImageData(communityId, id));
    const { width, height } = img.getSize();
    const size = fitSize(width, height, 960);
    return (size.w < width ? img.resize({ width: size.w, height: size.h, quality: 'good' }) : img).toPNG();
  },
  // a picture from the chat for the game: PNG (the game reads only that), small enough for its window
  chatImage: async (id) => {
    const img = nativeImage.createFromBuffer(await chatImageData(id));
    const { width, height } = img.getSize();
    const size = fitSize(width, height, 960);
    return (size.w < width ? img.resize({ width: size.w, height: size.h, quality: 'good' }) : img).toPNG();
  },
  gifStill: (url) => gifMedia.bytes(url),
  clanLogo: (id, version) => clanLogos.get(id, version),
  communityLogo: (id, version) => communityLogos.get(id, version),
  gameStatus: (status) => onGameStatus(status),
  // the game's "Now playing" module (id "spotify"), only while it is on: what plays on this computer and its cover
  spotifyNow: (onlySpotify) => nowPlaying.get(onlySpotify),
  spotifyCover: (id) => nowPlayingCovers.get(id),
});

/** Covers for the game as small square PNGs (a browser's video frame cut to its middle square). */
const nowPlayingCovers = new CoverCache((data, size) => {
  const img = nativeImage.createFromBuffer(data);
  if (img.isEmpty()) return Buffer.alloc(0);
  const { width, height } = img.getSize();
  const side = Math.min(width, height);
  const square = width === height ? img : img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
  return square.resize({ width: size, height: size, quality: 'good' }).toPNG();
});
/** What plays on this computer (nowPlaying.ts): read from the system only while the game asks. */
const nowPlaying = new NowPlayingReader({ covers: nowPlayingCovers });
app.on('will-quit', () => nowPlaying.stop());

/** A PNG in the screenshots folder of one of the profiles (what the game may send or copy); its real path. */
async function screenshotFile(file: string): Promise<string> {
  const real = await fsp.realpath(file);
  const dirs = await Promise.all(store.profiles.map((p) => fsp.realpath(path.join(profileGameDir(p), 'screenshots')).catch(() => '')));
  if (!real.endsWith('.png') || !dirs.some((d) => d && path.dirname(real) === d)) throw new Error('not_a_screenshot');
  return real;
}

/**
 * The SlashClient account follows the Minecraft account: a Microsoft account signs in (or, when
 * already signed in, is linked to the account) the way Minecraft servers check players. The
 * launcher "joins" a random server id at Mojang with its Minecraft token, and the SlashClient
 * server asks Mojang whether this player did, so the token itself never leaves for our server.
 * Offline accounts can't be proven and are left out (Discord and the rest sign in then).
 */
let minecraftSignIn: Promise<unknown> = Promise.resolve();
function signInWithMinecraft(accountId?: string, quiet = true): Promise<unknown> {
  const run = minecraftSignIn.then(() => linkMinecraft(accountId ?? store.settings.selectedAccountId));
  minecraftSignIn = run.catch((err) => {
    if (quiet) console.error('Konto SlashClient przez Minecraft:', (err as Error).message);
  });
  return quiet ? minecraftSignIn : run;
}

async function linkMinecraft(accountId?: string) {
  const account = store.accounts.find((a) => a.id === accountId);
  if (account?.type !== 'msa') return;
  const mcUuid = account.uuid.replace(/-/g, '').toLowerCase();
  const hasSession = !!store.settings.socialToken;
  // the page may not have asked who we are yet
  if (hasSession && !social.state().user) social.updateUser(await social.call<SocialUser>('GET', '/v1/me'));
  if (social.state().user?.minecraft?.some((m) => m.uuid === mcUuid)) return;
  const fresh = await freshMsa(account.id);
  const { serverId } = await social.call<{ serverId: string }>('POST', '/v1/auth/minecraft/start', undefined, false);
  const joined = await fetch('https://sessionserver.mojang.com/session/minecraft/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: fresh.accessToken, selectedProfile: mcUuid, serverId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!joined.ok) throw new SocialError('not_verified', joined.status);
  const res = await social.call<{ linked?: boolean; user: SocialUser; token: string }>('POST', '/v1/auth/minecraft/finish', { serverId, name: fresh.name }, !!store.settings.socialToken);
  if (res.linked) social.updateUser(res.user);
  else await social.signedIn(res);
}
handle('social:loginMinecraft', () => socialCall(async () => {
  await signInWithMinecraft(undefined, false);
  return social.state();
}));

/** SocialError codes cross IPC as "social:<code>", which the page translates. */
async function socialCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SocialError) throw new Error(`social:${err.code}`);
    throw err;
  }
}

handle('social:state', () => social.state());
handle('social:health', () => socialCall(() => social.call('GET', '/v1/health', undefined, false)));
// the admin's feature switches and banner (server 0.9.23+); an older server has none: null, everything on
handle('social:features', () => socialCall(() => social.call('GET', '/v1/features', undefined, false).catch((err) => {
  if (err instanceof SocialError && err.httpStatus === 404) return null;
  throw err;
})));
/** The page's requests; only the parts of the API that work on the player's own data. */
// joining a friend's world open to LAN from the launcher: a local port through the relay, as the game's friends list does
handle('lan:join', (friendId: string) => {
  if (typeof friendId !== 'string' || !/^[\w-]{1,64}$/.test(friendId)) throw new Error('social:bad_request');
  return lan.join(friendId);
});

handle('social:api', (method: string, apiPath: string, body?: unknown) => {
  if (!['GET', 'POST', 'DELETE'].includes(method) || !/^\/v1\/(me|friends|messages|invites|cosmetics|waypoints|parties|achievements|challenges|groups|clans|communities|wallet|shop|gifs)(\/[\w-]+)*(\?[\w=&%.-]*)?$/.test(apiPath)) throw new Error('social:bad_request');
  return socialCall(() => chatCall(method, apiPath, body));
});

/** A player's public profile on the site (/u/<handle>): its address, opened in the browser when asked. */
handle('social:profileUrl', async (profileHandle: string, open?: boolean) => {
  if (typeof profileHandle !== 'string' || !/^[\w.]{1,40}$/.test(profileHandle)) throw new Error('social:bad_request');
  const url = `${store.settings.socialUrl.replace(/\/$/, '')}/u/${encodeURIComponent(profileHandle)}`;
  if (open && /^https?:\/\//.test(url)) await shell.openExternal(url);
  return url;
});

// ---------- end-to-end encrypted chat (chatCrypto.ts) ----------

interface ChatMessage { id?: number; from: string; to: string; text: string; invite?: unknown; encrypted?: boolean; unreadable?: boolean; image?: unknown }

/** This launcher's key, made on first use and kept in the config (the private half encrypted). */
function chatKey(): DeviceKey {
  if (!store.settings.chatKey) {
    const k = newDeviceKey();
    store.settings.chatKey = { device: k.device, publicKey: k.publicKey, privateKey: secrets.encrypt(k.privateKey) };
    void persist();
  }
  const k = store.settings.chatKey;
  return { device: k.device, publicKey: k.publicKey, privateKey: secrets.decrypt(k.privateKey) };
}

/** What "Urządzenia" shows for this launcher on the player's other devices: the system and the computer's name. */
function deviceName(): string {
  const system = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
  return `${system} · ${os.hostname()}`.slice(0, 60);
}

/**
 * Publishes this launcher's public key, so friends (and our other launchers) can encrypt for it.
 * A key removed on another device ("Usuń urządzenie") is refused; the player can make a new one.
 */
async function registerChatKey() {
  const k = chatKey();
  try {
    await social.call('POST', '/v1/keys', { device: k.device, pub: k.publicKey, name: deviceName() });
    historyKeys.revoked = false;
  } catch (err) {
    if (err instanceof SocialError && err.code === 'device_revoked') historyKeys.revoked = true;
    else console.error('Klucz czatu:', (err as Error).message);
  }
  refreshChatKeys();
}

/** The keys this launcher had before (removed elsewhere): kept to read what was sealed for them. */
function retiredChatKeys(): DeviceKey[] {
  return (store.settings.chatKeysRetired ?? []).map((k) => ({ device: k.device, publicKey: k.publicKey, privateKey: secrets.decrypt(k.privateKey) }));
}

/** History on a new device: hand-overs from the player's other launchers and the password backup (chatKeys.ts). */
let chatKeysUser: string | undefined;
const historyKeys = new ChatKeys({
  call: (method, apiPath, body) => social.call(method, apiPath, body),
  own: () => chatKey(),
  retired: retiredChatKeys,
  me: () => social.state().user?.id,
  shares: () => store.settings.chatShares ?? [],
  saveShares: (list) => {
    store.settings.chatShares = list;
    void persist();
  },
  emit: (event) => send('social:event', event),
});
let chatKeysRefresh: Promise<unknown> | undefined;
/** The devices, the backup and the handed-over wraps asked again (one at a time). */
function refreshChatKeys() {
  if (!social.state().user) return;
  const run = (chatKeysRefresh ?? Promise.resolve()).catch(() => undefined).then(() => historyKeys.refresh())
    .catch((err) => console.error('Klucze czatu:', (err as Error).message));
  chatKeysRefresh = run;
}
const chatKeysCall = <T>(fn: () => Promise<T>) => socialCall(async () => {
  try {
    return await fn();
  } catch (err) {
    // the checks of chatKeys.ts and chatBackup.ts say what is wrong in a word ("wrong_password", "too_short", …)
    if (err instanceof SocialError) throw err;
    const e = err as Error & { wait?: number };
    throw new Error(`chatkeys:${e.message}${e.wait ? `:${Math.ceil(e.wait / 1000)}` : ''}`);
  }
});
handle('chatKeys:state', () => chatKeysCall(async () => (social.state().user ? historyKeys.refresh() : historyKeys.view())));
handle('chatKeys:decide', (device: string, share: boolean, shown: string) => chatKeysCall(async () => {
  if (typeof device !== 'string' || !/^[0-9a-f]{24}$/.test(device) || typeof shown !== 'string') throw new SocialError('bad_request');
  return historyKeys.decide(device, share === true, shown);
}));
handle('chatKeys:revoke', (device: string) => chatKeysCall(async () => {
  if (typeof device !== 'string' || !/^[0-9a-f]{24}$/.test(device)) throw new SocialError('bad_request');
  return historyKeys.revoke(device);
}));
handle('chatKeys:setBackup', (password: string) => chatKeysCall(async () => {
  if (typeof password !== 'string') throw new SocialError('bad_request');
  return historyKeys.setBackup(password);
}));
handle('chatKeys:changeBackup', (current: string, next: string) => chatKeysCall(async () => {
  if (typeof current !== 'string' || typeof next !== 'string') throw new SocialError('bad_request');
  return historyKeys.changeBackupPassword(current, next);
}));
handle('chatKeys:removeBackup', () => chatKeysCall(() => historyKeys.removeBackup()));
handle('chatKeys:unlock', (password: string) => chatKeysCall(async () => {
  if (typeof password !== 'string') throw new SocialError('bad_request');
  return historyKeys.unlockBackup(password);
}));
/** This launcher's key was removed elsewhere: a new one (the old one kept for reading), asking for the history again. */
handle('chatKeys:newKey', () => chatKeysCall(async () => {
  const old = store.settings.chatKey;
  if (old) store.settings.chatKeysRetired = [...(store.settings.chatKeysRetired ?? []), old].slice(-5);
  store.settings.chatKey = undefined;
  chatKey();
  await persist();
  chatKeys.clear();
  groupKeys.clear();
  await registerChatKey();
  return historyKeys.refresh();
}));

const chatKeys = new Map<string, { at: number; keys: PublicDevice[] }>();
async function keysOf(userId: string): Promise<PublicDevice[]> {
  const hit = chatKeys.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.keys;
  const { keys } = await social.call<{ keys: PublicDevice[] }>('GET', `/v1/keys/${userId}`);
  chatKeys.set(userId, { at: Date.now(), keys });
  return keys;
}

/**
 * The text as it goes to the server: encrypted for the friend's launchers and ours. A friend whose
 * launcher has no key yet (an older version) gets it as it is, or they could not read it.
 */
async function sealText(to: string, text: string): Promise<string> {
  const me = social.state().user?.id;
  if (!me || text.length > 2000) return text;
  const own = chatKey();
  const [theirs, mine] = await Promise.all([keysOf(to), keysOf(me)]);
  if (!theirs.length) return text;
  const devices = [...theirs, ...mine.filter((d) => d.device !== own.device), { device: own.device, pub: own.publicKey }];
  return encrypt(text, own, devices, `${me}|${to}`);
}

/** A message as the page and the game get it; one whose picture was taken down or ran out says so (0.9.36+). */
function openMessage(m: ChatMessage): ChatMessage {
  const opened = openMessageText(m);
  const gone = opened.image ? undefined : removedText((m as { imageRemoved?: RemovedImage }).imageRemoved, t);
  return gone ? { ...opened, text: gone } : opened;
}
function openMessageText(m: ChatMessage): ChatMessage {
  const ref = (field: WrapRef['field']): WrapRef | undefined => (typeof m.id === 'number' ? { kind: 'm', id: m.id, field } : undefined);
  if (m.image) m = { ...m, image: openImageKey(m.image, `${m.from}|${m.to}`, ref('image')) };
  if (!isEncrypted(m.text)) return m;
  const text = historyKeys.open(m.text, `${m.from}|${m.to}`, ref('text'));
  return text === undefined
    ? { ...m, text: t('Wiadomość zaszyfrowana dla innego urządzenia.'), encrypted: true, unreadable: true }
    : { ...m, text, encrypted: true };
}

/** Group chats: the members' launcher keys, kept a little (dropped when the group or someone's keys change). */
const groupKeys = new Map<string, { at: number; keys: GroupKey[] }>();
async function sealGroup(group: string, text: string): Promise<string> {
  const me = social.state().user?.id;
  if (!me) return text;
  let hit = groupKeys.get(group);
  if (!hit || Date.now() - hit.at > 60_000) {
    hit = { at: Date.now(), keys: (await social.call<{ keys: GroupKey[] }>('GET', `/v1/groups/${group}/keys`)).keys };
    groupKeys.set(group, hit);
  }
  return sealGroupText(text, chatKey(), hit.keys, group, me);
}
/** A group message as the page and the game get it: its text and its picture's key opened, when this launcher can. */
function openGroup<T extends GroupChatMessage>(m: T): T {
  const id = (m as { id?: unknown }).id;
  const ref = (field: WrapRef['field']): WrapRef | undefined => (typeof id === 'number' ? { kind: 'g', id, field } : undefined);
  const opened = openGroupMessage(m, (text, aad) => historyKeys.open(text, aad, ref('text')), t('Wiadomość zaszyfrowana dla innego urządzenia.'));
  const image = (m as { image?: unknown }).image;
  if (image) return { ...opened, image: openImageKey(image, groupAad(m.group, m.from), ref('image')) };
  const gone = removedText((m as { imageRemoved?: RemovedImage }).imageRemoved, t);
  return gone ? { ...opened, text: gone } : opened;
}
// ---------- pictures in the chat (chatImages.ts): encrypted here, the key inside the message ----------

/** Keys of the pictures in messages this launcher could read; the page and the game get only the id. */
const imageKeys = new Map<string, ImageKey>();
const imageCache = new ImageCache();

/** A message's picture with its key opened (`aad`: what the key's encryption is bound to: the two people, or the group and sender). */
function openImageKey(image: unknown, aad: string, ref?: WrapRef): ChatImageView | undefined {
  const i = image as { id?: unknown; key?: unknown; size?: unknown };
  if (!i || typeof i.id !== 'string' || !/^[\w-]{22}$/.test(i.id)) return undefined;
  const text = typeof i.key === 'string' && isEncrypted(i.key) ? historyKeys.open(i.key, aad, ref) : undefined;
  const key = text === undefined ? undefined : parseKey(text);
  if (!key) return { id: i.id, unreadable: true };
  imageKeys.set(i.id, key);
  return { id: i.id, w: key.w, h: key.h, size: typeof i.size === 'number' ? i.size : undefined };
}

/** A picture from a message, downloaded and decrypted (kept for a while). */
async function chatImageData(id: string): Promise<Buffer> {
  const key = imageKeys.get(id);
  if (!key) throw new SocialError('not_found');
  const kept = imageCache.get(id);
  if (kept) return kept;
  const data = openImage(await social.download(`/v1/images/${id}`), key);
  imageCache.set(id, data);
  return data;
}

/**
 * Sends a picture file to a friend: scaled to at most 1920 px and made a JPEG, encrypted with a new
 * key, uploaded; then a message carrying that key, encrypted for the friend's launchers and ours.
 * A friend whose launcher has no chat key (an older version) cannot get one: it would not be private.
 */
async function sendChatImage(to: string, file: string | Buffer): Promise<ChatMessage> {
  const me = social.state().user?.id;
  if (!me) throw new SocialError('unauthorized');
  const { jpeg, size } = pictureFile(file);
  const own = chatKey();
  const [theirs, mine] = await Promise.all([keysOf(to), keysOf(me)]);
  if (!theirs.length) throw new SocialError('no_keys');
  const devices = [...theirs, ...mine.filter((d) => d.device !== own.device), { device: own.device, pub: own.publicKey }];
  const sealed = sealImage(jpeg, 'image/jpeg', size.w, size.h);
  const { id } = await social.upload<{ id: string }>(`/v1/images/${to}`, sealed.blob);
  // what an older launcher shows instead of the picture
  const caption = encrypt(t('[Zrzut ekranu]'), own, devices, `${me}|${to}`);
  const res = await social.call<{ message: ChatMessage }>('POST', `/v1/messages/${to}`, { text: caption, image: { id, key: encrypt(keyText(sealed.key), own, devices, `${me}|${to}`) } });
  imageCache.set(id, jpeg);
  return openMessage(res.message);
}

/** A picture (a file, or pasted bytes) ready to send: scaled to at most 1920 px and made a JPEG small enough for the server. */
function pictureFile(file: string | Buffer): { jpeg: Buffer; size: { w: number; h: number } } {
  let img = typeof file === 'string' ? nativeImage.createFromPath(file) : nativeImage.createFromBuffer(file);
  if (img.isEmpty()) throw new SocialError('not_an_image');
  const { width, height } = img.getSize();
  const size = fitSize(width, height);
  if (size.w < width) img = img.resize({ width: size.w, height: size.h, quality: 'best' });
  let jpeg = img.toJPEG(88);
  if (jpeg.length > MAX_BYTES) jpeg = img.toJPEG(70);
  if (jpeg.length > MAX_BYTES) throw new SocialError('too_large');
  return { jpeg, size };
}

/** The same to a group (or clan) chat: the picture's key and the caption encrypted for the members' launchers. */
async function sendGroupImage(group: string, file: string | Buffer): Promise<GroupChatMessage> {
  if (!social.state().user?.id) throw new SocialError('unauthorized');
  const { jpeg, size } = pictureFile(file);
  const sealed = sealImage(jpeg, 'image/jpeg', size.w, size.h);
  const { id } = await social.upload<{ id: string }>(`/v1/groups/${group}/images`, sealed.blob);
  // what an older launcher shows instead of the picture
  const caption = await sealGroup(group, t('[Zrzut ekranu]'));
  const key = await sealGroup(group, keyText(sealed.key));
  const res = await social.call<{ message: GroupChatMessage }>('POST', `/v1/groups/${group}/messages`, { text: caption, image: { id, key } });
  imageCache.set(id, jpeg);
  return openGroup(res.message);
}

/** "Send a picture" in the page: the player picks a file (the profile's screenshots first). */
async function pickPicture(): Promise<string | undefined> {
  const profile = store.profiles.find((p) => p.id === store.settings.selectedProfileId);
  const shots = profile ? path.join(profileGameDir(profile), 'screenshots') : undefined;
  const picked = await dialog.showOpenDialog(win!, {
    title: t('Wyślij obraz'),
    defaultPath: shots && (await fsp.stat(shots).then(() => true, () => false)) ? shots : undefined,
    filters: [{ name: t('Obrazy'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile'],
  });
  return picked.canceled ? undefined : picked.filePaths[0];
}
/** A picture pasted into the chat (its bytes from the page), or else one the player picks. */
async function pictureToSend(pasted: unknown): Promise<string | Buffer | undefined> {
  if (pasted === undefined) return pickPicture();
  if (!(pasted instanceof Uint8Array) || pasted.length > 40 * 1024 * 1024) throw new SocialError('not_an_image');
  return Buffer.from(pasted);
}
handle('social:sendImage', (friendId: string, pasted?: Uint8Array) => socialCall(async () => {
  if (typeof friendId !== 'string' || !/^[\w-]{1,64}$/.test(friendId)) throw new SocialError('bad_request');
  const file = await pictureToSend(pasted);
  return file ? { message: await sendChatImage(friendId, file) } : undefined;
}));
handle('social:sendGroupImage', (groupId: string, pasted?: Uint8Array) => socialCall(async () => {
  if (typeof groupId !== 'string' || !/^[\w-]{1,32}$/.test(groupId)) throw new SocialError('bad_request');
  const file = await pictureToSend(pasted);
  return file ? { message: await sendGroupImage(groupId, file) } : undefined;
}));
// ---------- pictures in a community's chat (server 0.9.30+): not encrypted, a plain JPEG for its members ----------

/** A picture (a file, or pasted bytes) to a community's channel: scaled and made a JPEG here, the server leaves out any metadata left. */
async function sendCommunityImage(community: string, channel: string, file: string | Buffer): Promise<unknown> {
  if (!social.state().user?.id) throw new SocialError('unauthorized');
  const { jpeg } = pictureFile(file);
  const { id } = await social.upload<{ id: string }>(`/v1/communities/${community}/channels/${channel}/images`, jpeg);
  // the text older launchers show instead, in this player's language
  const res = await social.call<{ message: unknown }>('POST', `/v1/communities/${community}/channels/${channel}/messages`, { image: id, lang: getLang() });
  imageCache.set(`c:${id}`, jpeg);
  return res.message;
}
/** A community's picture, downloaded (kept for a while with the others). */
async function communityImageData(community: string, id: string): Promise<Buffer> {
  const kept = imageCache.get(`c:${id}`);
  if (kept) return kept;
  const data = await social.download(`/v1/communities/${community}/images/${id}`);
  imageCache.set(`c:${id}`, data);
  return data;
}
handle('social:sendCommunityImage', (communityId: string, channelId: string, pasted?: Uint8Array) => socialCall(async () => {
  if (typeof communityId !== 'string' || !/^[\w-]{1,32}$/.test(communityId) || typeof channelId !== 'string' || !/^[\w-]{1,32}$/.test(channelId)) throw new SocialError('bad_request');
  const file = await pictureToSend(pasted);
  return file ? { message: await sendCommunityImage(communityId, channelId, file) } : undefined;
}));
handle('social:communityImage', (communityId: string, id: string) => socialCall(async () => {
  if (typeof communityId !== 'string' || !/^[\w-]{1,32}$/.test(communityId) || typeof id !== 'string' || !/^[\w-]{22}$/.test(id)) throw new SocialError('bad_request');
  return `data:image/jpeg;base64,${(await communityImageData(communityId, id)).toString('base64')}`;
}));

/** Small thumbnails for the Multimedia panel (chatMedia.ts): made here from the decrypted picture, kept a while. */
const thumbs = new ThumbCache();
async function thumbOf(cacheId: string, data: () => Promise<Buffer>): Promise<string> {
  const kept = thumbs.get(cacheId);
  if (kept) return kept;
  const url = thumbnail(await data());
  if (!url) throw new SocialError('not_an_image');
  thumbs.set(cacheId, url);
  return url;
}
handle('social:imageThumb', (id: string) => socialCall(async () => {
  if (typeof id !== 'string' || !/^[\w-]{22}$/.test(id)) throw new SocialError('bad_request');
  return thumbOf(id, () => chatImageData(id));
}));
handle('social:communityImageThumb', (communityId: string, id: string) => socialCall(async () => {
  if (typeof communityId !== 'string' || !/^[\w-]{1,32}$/.test(communityId) || typeof id !== 'string' || !/^[\w-]{22}$/.test(id)) throw new SocialError('bad_request');
  return thumbOf(`c:${id}`, () => communityImageData(communityId, id));
}));

/** A picture from the chat for the page, as a data: address. */
handle('social:image', (id: string) => socialCall(async () => {
  if (typeof id !== 'string' || !/^[\w-]{22}$/.test(id)) throw new SocialError('bad_request');
  const data = await chatImageData(id);
  return `data:${imageKeys.get(id)?.type ?? 'image/jpeg'};base64,${data.toString('base64')}`;
}));

// ---------- a clan's logo (clanLogo.ts): the page makes the 64×64 PNG, this sends it and fetches logos ----------
const clanLogos = new ClanLogoCache((apiPath) => social.download(apiPath));
handle('social:setClanLogo', (png: Uint8Array) => socialCall(async () => {
  if (!(png instanceof Uint8Array) || !isLogoPng(png)) throw new SocialError('not_png');
  return social.upload('/v1/clans/mine/logo', png);
}));
/** A clan's logo for the page, as a data: address. */
handle('social:clanLogo', (id: string, version: number) => socialCall(async () => `data:image/png;base64,${(await clanLogos.get(id, version)).toString('base64')}`));
// a community's logo: the same pipeline (its admins upload it, anyone fetches it by version)
const communityLogos = new ClanLogoCache((apiPath) => social.download(apiPath), 64, '/v1/communities');
handle('social:setCommunityLogo', (id: string, png: Uint8Array) => socialCall(async () => {
  if (typeof id !== 'string' || !/^[\w-]{1,32}$/.test(id)) throw new SocialError('bad_request');
  if (!(png instanceof Uint8Array) || !isLogoPng(png)) throw new SocialError('not_png');
  return social.upload(`/v1/communities/${id}/logo`, png);
}));
handle('social:communityLogo', (id: string, version: number) => socialCall(async () => `data:image/png;base64,${(await communityLogos.get(id, version)).toString('base64')}`));
// a rank's own icon (rankIcons.ts), by its address from the server
const rankIcons = new RankIconCache((apiPath) => social.download(apiPath));
handle('social:rankIcon', (apiPath: string) => socialCall(() => rankIcons.get(apiPath)));

/** A call to the social server with the chat encrypted on the way out and decrypted on the way in. */
async function chatCall(method: string, apiPath: string, body?: unknown) {
  // a community's chat is kept on the server as it is (not end-to-end encrypted: see the server's communityStore.ts)
  if (apiPath.startsWith('/v1/communities')) return social.call(method, apiPath, body);
  // the Multimedia panel (0.9.36+): each picture's key opened as in its conversation
  if (method === 'GET' && /^\/v1\/(messages|groups)\/[\w-]+\/media(\?.*)?$/.test(apiPath)) {
    const res = await social.call<{ media?: MediaItem[] }>(method, apiPath, body);
    const media = (res?.media ?? []).map((m) => ({ ...m, image: openImageKey(m.image, m.group ? groupAad(m.group, m.from) : `${m.from}|${m.to}`, { kind: m.group ? 'g' : 'm', id: m.id, field: 'image' }) }));
    return { ...res, media };
  }
  // a new message, or an edited one (server 0.9.23+): the new text is sealed exactly like a new message
  const send = /^\/v1\/messages\/([\w-]+)(\/\d+\/edit)?$/.exec(apiPath);
  if (method === 'POST' && send && body && typeof (body as { text?: unknown }).text === 'string') {
    body = { ...(body as object), text: await sealText(send[1], (body as { text: string }).text) };
  }
  // the group's messages, one of them edited (sealed for the members of now) or deleted
  const group = /^\/v1\/groups\/([\w-]+)\/messages(\/\d+(\/edit)?)?(\?.*)?$/.exec(apiPath);
  if (group) {
    if (method === 'POST' && body && typeof (body as { text?: unknown }).text === 'string') {
      body = { ...(body as object), text: await sealGroup(group[1], (body as { text: string }).text) };
    }
    const res = await social.call<{ messages?: GroupChatMessage[]; message?: GroupChatMessage }>(method, apiPath, body);
    if (Array.isArray(res?.messages)) return { ...res, messages: res.messages.map(openGroup) };
    if (res?.message) return { ...res, message: openGroup(res.message) };
    return res;
  }
  const res = await social.call<Record<string, unknown>>(method, apiPath, body);
  if (res && Array.isArray(res.messages)) return { ...res, messages: (res.messages as ChatMessage[]).map(openMessage) };
  if (res && res.message && typeof res.message === 'object') return { ...res, message: openMessage(res.message as ChatMessage) };
  return res;
}
/** A friend's invite while the game runs: the HUD leaves where it is and joins that server. */
handle('game:join', (address: string) => {
  if (![...games.values()].some((g) => g.hasHud) || !/^[\w.-]{1,253}(:\d{1,5})?$/.test(address)) return false;
  bridge.push({ type: 'join', server: address });
  return true;
});
handle('social:activity', () => social.currentActivity());
handle('social:loginDev', (name: string) => socialCall(async () => social.signedIn(await social.call('POST', '/v1/auth/dev', { name }, false))));
let browserLogin = 0;
/**
 * Opens Discord, Microsoft, Google or GitHub in the browser and waits (up to 10 minutes) until the
 * player is back. `link` adds that provider to the signed-in account instead.
 */
handle('social:loginOAuth', (provider: string, link: boolean) => socialCall(async () => {
  if (!['discord', 'microsoft', 'google', 'github'].includes(provider)) throw new SocialError('provider_disabled');
  const attempt = ++browserLogin;
  const { state, url, code } = await social.call<{ state: string; url: string; code?: string }>('POST', `/v1/auth/${provider}/start`, undefined, link);
  // Microsoft signs in with a code typed on its page: copied right away, and shown in Friends
  // the server says where to sign in; only a web page is opened, never another kind of link
  if (!/^https:\/\//.test(url)) throw new SocialError('provider_failed');
  if (code) {
    clipboard.writeText(code);
    send('social:loginCode', { code, url });
  }
  await shell.openExternal(url);
  const until = Date.now() + 10 * 60_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    if (attempt !== browserLogin) throw new SocialError('cancelled');
    const res = await social.call<{ pending?: boolean; linked?: boolean; token: string; user: never }>('GET', `/v1/auth/poll?state=${state}`, undefined, false);
    if (res.pending) continue;
    if (res.linked) {
      social.updateUser(res.user);
      return social.state();
    }
    return social.signedIn(res);
  }
  throw new SocialError('login_expired');
}));
/**
 * Links the player's Twitch or Kick channel (server 0.9.24+, streams): the platform's page in the
 * browser, then the server asked (up to 10 minutes) until the player is back. Not a sign-in: the
 * answer is only the account's linked channels.
 */
handle('social:linkStream', (platform: string) => socialCall(async () => {
  if (platform !== 'twitch' && platform !== 'kick') throw new SocialError('provider_disabled');
  const attempt = ++browserLogin;
  const { state, url } = await social.call<{ state: string; url: string }>('POST', `/v1/me/streams/${platform}/start`);
  if (!/^https:\/\//.test(url)) throw new SocialError('provider_failed');
  await shell.openExternal(url);
  const until = Date.now() + 10 * 60_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    if (attempt !== browserLogin) throw new SocialError('cancelled');
    const res = await social.call<{ pending?: boolean; streams?: unknown }>('GET', `/v1/me/streams/poll?state=${encodeURIComponent(state)}`);
    if (!res.pending) return res.streams;
  }
  throw new SocialError('login_expired');
}));
handle('social:cancelLogin', () => {
  browserLogin++;
});
handle('social:logout', () => social.logout());
handle('social:setStatus', async (status: Status) => {
  if (!['online', 'away', 'busy', 'invisible'].includes(status)) return;
  store.settings.socialStatus = status;
  await persist();
  social.statusChanged();
});
handle('social:typing', (friendId: string) => social.typing(friendId));
/** A friend's message, invite or request while the launcher is in the background. */
handle('notify:show', (title: unknown, body: unknown, target: unknown) => {
  if (win?.isFocused() || typeof title !== 'string' || typeof body !== 'string') return false;
  return notifier.show({ title: title.slice(0, 100), body, target: cleanTarget(target) });
});

// Windows sends a toast's click back to the app with this id: the installer's shortcut carries the
// same one (build.appId); in development there's no shortcut, so Electron's own executable stands in
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? APP_USER_MODEL_ID : process.execPath);

// Lets the page show screenshots and world icons (only images inside profile folders).
protocol.registerSchemesAsPrivileged([
  { scheme: 'slash-media', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  // GIFs and stickers in the chat (gifMedia.ts): only the providers' CDN files, through the server when it says so
  { scheme: 'slash-gif', privileges: { standard: true, secure: true } },
]);

app.whenReady().then(async () => {
  protocol.handle('slash-gif', (request) => gifMedia.handle(request));
  protocol.handle('slash-media', (request) => {
    const url = new URL(request.url);
    const file = url.searchParams.get('path') ?? '';
    // a clip's single frame, for the trim window
    if (url.host === 'clip') return isInsideInstances(file) ? clipFrameResponse(file, Number(url.searchParams.get('frame')) || 0) : new Response('Not found', { status: 404 });
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file) || !isInsideInstances(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  if (safeStorage.isEncryptionAvailable()) {
    setSecretCodec({
      encrypt: (s) => `enc:${safeStorage.encryptString(s).toString('base64')}`,
      decrypt: (s) =>
        s.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) : Buffer.from(s.replace(/^b64:/, ''), 'base64').toString(),
    });
  }
  // In development the Dock would otherwise show Electron's default icon.
  if (process.platform === 'darwin') app.dock?.setIcon(nativeImage.createFromPath(ICON));
  store = await loadStore();
  // the list of profiles could not be read: the profiles' folders on disk come back as profiles
  if (storeRecovered) {
    const found = await orphanProfiles(store.profiles);
    if (found.length) {
      recoveredAtStart = found.length;
      store.profiles.push(...found);
      await persist();
    }
  }
  // players who already use the launcher never get the first-run wizard
  if (markExistingUser(store)) await saveStore(store);
  hudSupported = await hudVersions(HUD_DIR);
  // first start: follow the system language
  if (!store.settings.language) store.settings.language = app.getLocale().toLowerCase().startsWith('pl') ? 'pl' : 'en';
  setLang(store.settings.language);
  void applyToolSettings(store.settings);
  // the launcher's changelog, "Co nowego" after an update, going back to an older version (changelog.ts)
  initChangelog({
    handle, settings: () => store.settings, persist,
    get: (p) => socialCall(() => social.call('GET', p, undefined, false).catch((err) => {
      if (err instanceof SocialError && err.httpStatus === 404) return undefined;
      throw err;
    })) as never,
  });
  createWindow();
  startUpdateChecks({
    serverUrl: () => store.settings.socialUrl, send: (status) => send('update:status', status), onLog: (m) => console.error(m),
    pause: { get: () => store.settings.updatesPausedUntil, set: (v) => { store.settings.updatesPausedUntil = v; return persist(); } },
  });
  showPresence(idlePresence());
  social.start();
  void signInWithMinecraft();
  // ten idle minutes in the launcher show as "away" to friends
  setInterval(() => social.setAway(powerMonitor.getSystemIdleTime() >= 600), 60_000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
