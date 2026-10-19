import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, nativeImage, net, Notification, powerMonitor, protocol, safeStorage, shell } from 'electron';
import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import { completeMicrosoftLogin, createOfflineAccount, ensureFreshAccount, pollDeviceCode, startDeviceCode } from './auth';
import { setLang } from '../shared/i18n';
import { analyzeCrash } from './crash';
import { iconFile, iconFromFile, iconFromUrl } from './profileIcon';
import { pullShared, pushShared } from './sync';
import { recommendedMemoryMb } from './jvm';
import { shareLog } from './logshare';
import { clipFrameResponse, registerMediaSharing } from './mediaShare';
import { previewPack } from './packPreview';
import { lastTarget, serverFromLog, worldPlayedSince } from './sessions';
import { checkForUpdates, installUpdate, startUpdateChecks, updateStatus } from './updates';
import { DiscordPresence, presenceFromLog, type Presence } from './discord';
import { activityFromLog, SocialClient, SocialError, type SocialUser, type Status } from './social';
import { decrypt, encrypt, isEncrypted, newDeviceKey, type DeviceKey, type PublicDevice } from './chatCrypto';
import { launch, resolveVersionId } from './launch';
import { paths } from './paths';
import { loadStore, newProfile, profileGameDir, saveStore, secrets, setSecretCodec, type MicrosoftAccount, type Profile, type Settings, type StoreData } from './store';
import { LOADER_NAMES, loaderVersions, type Loader } from './loaders';
import {
  checkUpdates, datapackFile, downloadModpack, identifyModpack, installMrpack, installProject, latestModpackVersion, listContentVersions,
  findFitting, modrinthLinks, installedProjectIds, listInstalled, removeContent, search, setEnabled, updateMrpack,
  type ContentType, type ModpackInfo, type ProjectType, type UpdateInfo, type VersionInfo,
} from './modrinth';
import {
  checkCurseForgeUpdates, curseForgeLinks, CurseForgeUnavailable, downloadCurseForgePack, installCurseForgePack, installCurseForgeProject, isCurseForgePack, readCursePack,
  latestCurseForgePack, listCurseForgeVersions, searchCurseForge, setCurseForgeServer, updateCurseForgePack, type ManualFile,
} from './curseforge';
import { listServers, pingServer } from './servers';
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
import { LanTunnels } from './lan';
import { BLOCK_FACES, blockTextures, cosmeticTextures } from './blockTextures';
import { ConsoleHistory } from './consoleHistory';

/** Every game session's console, kept for the Play screen (the last ones of each profile). */
const consoleHistory = new ConsoleHistory(path.join(paths.root, 'console'));
import { checkModsFolder, installedModIds } from './modcheck';
import { addModsArgs, hudVersions, prepareHud } from './hud';
import { exportHud, importHud } from './hudShare';
import { readBenchmarks } from './benchmark';
import { appendSession, readSessions, summarize } from './stats';
import { copyInstance, findInstances, instanceFromFolder, SOURCE_NAMES, type ForeignInstance } from './importers';
import { perfModsFor } from './perfmods';
import { addPreset, listPresets, looksSlim, readPreset, removePreset, updatePreset, type SkinPreset } from './skinLibrary';
import fsp from 'node:fs/promises';
import { backupWorld, deleteFile, listBackups, listClips, listScreenshots, listWorlds, restoreBackup } from './worlds';
import { applySnapshot, createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from './snapshots';
import { exportWorld, importWorldZip, installDatapack, listDatapacks, readWorldZip, removeDatapack, type WorldZipSummary } from './worldFiles';
import { t } from '../shared/i18n';
import { APP_USER_MODEL_ID, cleanTarget, Notifier } from './notifications';
import { registerMaintenance } from './maintenance';
import { applyToolSettings, gpuLaunchOptions, registerLauncherTools } from './launcherTools';

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
  if (store.settings.discordEnabled) discordClient()?.set(p);
}

// re-send the status regularly: picks Discord up when it starts after the launcher or reconnects after a restart
setInterval(() => {
  if (currentPresence && store?.settings.discordEnabled) discordClient()?.set(currentPresence);
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
    settings: { ...store.settings, socialToken: undefined, chatKey: undefined },
    accounts: store.accounts.map(({ id, type, name, uuid }) => ({ id, type, name, uuid })),
    profiles: store.profiles.map((p) => ({ ...p, iconFile: p.icon === 'custom' ? iconFile(profileGameDir(p)) : undefined })),
    running: games.size > 0,
    runningProfiles: [...games.keys()],
    dataDir: paths.root,
    systemMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    hudVersions: hudSupported,
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 640,
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
  win.once('ready-to-show', () => win?.show());
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
  supported: () => Notification.isSupported(),
  create: (title, body) => new Notification({ title, body, icon: ICON }),
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
  const { socialToken: _ignored, chatKey: _key, ...allowed } = settings;
  const urlChanged = allowed.socialUrl !== undefined && allowed.socialUrl !== store.settings.socialUrl;
  const accountChanged = allowed.selectedAccountId !== undefined && allowed.selectedAccountId !== store.settings.selectedAccountId;
  const previous = store.settings;
  store.settings = { ...store.settings, ...allowed };
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
const newMemory = () => ({ memoryMb: store.settings.defaultMemoryMb ?? 4096 });
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
    finish: (ok: boolean, message: string, profileId?: string) => {
      send('task:done', { id, ok, message, profileId });
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
handle('content:list', async (profileId: string) => listInstalled((await profileTarget(profileId)).gameDir));
/** A resource pack's textures next to the game's, before installing it (packPreview.ts). */
handle('content:packPreview', async (profileId: string, projectId: string, source: Source = 'modrinth', versionId?: string) => {
  const { gameVersion } = await profileTarget(profileId);
  if (source === 'curseforge') curseforge();
  return previewPack({ projectId: String(projectId), source: source === 'curseforge' ? 'curseforge' : 'modrinth', gameVersion, versionId, temp: app.getPath('temp') });
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
        await installCurseForgeProject(gameDir, item.projectId, item.type, gameVersion, profile.loader, undefined, item.latestVersionId);
      } else await installProject(gameDir, item.projectId, item.type, gameVersion, profile.loader, undefined, item.latestVersionId);
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
async function installMany(profileId: string, items: { projectId: string; title: string }[], title: string) {
  const { profile, gameDir, gameVersion } = await profileTarget(profileId);
  const task = startTask(title);
  const done: string[] = [];
  const failed: string[] = [];
  for (const [i, item] of items.entries()) {
    task.progress(t('{0} ({1}/{2})', item.title, i + 1, items.length), i, items.length);
    try {
      done.push(...(await installProject(gameDir, item.projectId, 'mod', gameVersion, profile.loader)));
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
/** Looks the missing mod ids up on Modrinth (id = slug for most mods) and installs those found. */
handle('mods:fixMissing', async (profileId: string, ids: string[]) => {
  const { profile, gameVersion } = await profileTarget(profileId);
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
  if (found.length) await installMany(profileId, found, t('Brakujące mody'));
  return { installed: found.map((f) => f.title), notFound };
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
  const key = (f: ManualFile) => `${f.folder}/${f.fileName}`;
  const known = new Map((profile.manualFiles ?? []).map((f) => [key(f), f]));
  for (const f of files) known.set(key(f), f);
  profile.manualFiles = [...known.values()];
  await persist();
}
/** The files still to be downloaded by hand: those the player has put in place drop off the list. */
handle('content:manual', async (profileId: string) => {
  const profile = profileById(profileId);
  if (!profile.manualFiles?.length) return [];
  const gameDir = profileGameDir(profile);
  const exists = (f: ManualFile) => fsp.access(path.join(gameDir, f.folder, path.basename(f.fileName))).then(() => true, () => false);
  const left = [];
  for (const f of profile.manualFiles) if (!(await exists(f))) left.push(f);
  if (left.length !== profile.manualFiles.length) {
    profile.manualFiles = left.length ? left : undefined;
    await persist();
  }
  return left;
});
/** The player says they do not want these files (or got them elsewhere): forget the list. */
handle('content:manualDismiss', async (profileId: string) => {
  const profile = profileById(profileId);
  profile.manualFiles = undefined;
  await persist();
});
handle('content:toggle', async (profileId: string, type: ContentType, filename: string, enabled: boolean) =>
  setEnabled((await profileTarget(profileId)).gameDir, type, filename, enabled));
handle('content:remove', async (profileId: string, type: ContentType, filename: string) =>
  removeContent((await profileTarget(profileId)).gameDir, type, filename));

/** Creates a new profile from a .mrpack file and returns its id. */
/**
 * Creates a profile from a .mrpack with a visible progress panel, a completion
 * message and (for Modrinth packs) the pack's own icon.
 */
type Pack = { file: string; version?: VersionInfo; source?: Source };

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
    const { file, version, source } = await getPack(task);
    const profile = newProfile(newMemory());
    const gameDir = profileGameDir(profile);
    const { info, manual } = await installPackFile(profile, file, false, task.progress);
    profile.name = info.name;
    applyPack(profile, info, version, info.name, source);
    if (iconUrl) {
      task.progress(t('Pobieranie ikony'), 0, 1);
      // a missing icon is not worth failing the install
      await iconFromUrl(gameDir, iconUrl).then(() => Object.assign(profile, { icon: 'custom', iconVersion: Date.now() }), () => {});
    }
    store.profiles.push(profile);
    store.settings.selectedProfileId = profile.id;
    await persist();
    task.finish(true, t('Zainstalowano modpack {0}. Profil jest gotowy do gry.', info.name) + manualNote(manual), profile.id);
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
    await persist();
    task.finish(true, t('Modpack {0} ma teraz wersję {1}.', pack.title, version!.versionNumber) + manualNote(manual), profile.id);
  } catch (err) {
    task.finish(false, t('Nie udało się zaktualizować modpacka: {0}', (err as Error).message));
    throw err;
  }
});

handle('profile:recommendedMemory', async (id: string) => {
  const profile = profileById(id);
  const mods = (await listInstalled(profileGameDir(profile))).filter((i) => i.type === 'mod' && i.enabled).length;
  return { mb: recommendedMemoryMb(Math.round(os.totalmem() / 1024 / 1024), profile.loader, mods), mods };
});
// ---------- copying and exporting profiles ----------

/** Folders that are never copied with a profile: per-session files and potentially huge archives. */
const NOT_COPIED = new Set(['logs', 'crash-reports', 'screenshots', 'backups', 'debug']);

handle('profile:duplicate', async (id: string) => {
  const source = profileById(id);
  const { response } = await dialog.showMessageBox(win!, {
    type: 'question',
    message: t('Skopiować profil „{0}”?', source.name),
    detail: t('Mody, konfiguracja, paczki zasobów i ustawienia zostaną skopiowane. Światy mogą zajmować dużo miejsca.'),
    buttons: [t('Bez światów'), t('Ze światami'), t('Anuluj')],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 2) return undefined;
  const withWorlds = response === 1;
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
    task.finish(true, t('Zaimportowano profil {0}.', name) + manualNote(manual), profile.id);
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

/** Publishes the log on the SlashClient server after the player agrees. */
async function askAndShareLog(text: string) {
  const { response } = await dialog.showMessageBox(win!, {
    type: 'question',
    message: t('Udostępnić log publicznie?'),
    detail: t('Log zostanie wysłany na serwer SlashClient (trzymany 90 dni), a link skopiowany do schowka. Każdy, kto dostanie link, zobaczy jego treść. Ścieżki z Twoją nazwą użytkownika i tokeny zostaną ukryte.'),
    buttons: [t('Udostępnij'), t('Anuluj')],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return undefined;
  const shared = await shareLog(text, store.settings.socialUrl);
  clipboard.writeText(shared.url);
  return shared;
}
handle('log:share', async (text: string) => (await askAndShareLog(text))?.url);
/** A bug report on the site, with the log attached when there is one and the player agrees to share it. */
handle('bug:report', async (text?: string) => {
  const params = new URLSearchParams({ nowe: '1', wersja: app.getVersion() });
  if (text?.trim()) {
    const shared = await askAndShareLog(text);
    if (!shared) return false;
    params.set('log', shared.id);
  }
  await shell.openExternal(`${store.settings.socialUrl.replace(/\/$/, '')}/zgloszenia?${params}`);
  return true;
});
handle('servers:list', (force?: boolean) => listServers(force));
// a server that is off is an answer, not an error: no noise in the log for every offline server
handle('servers:ping', (address: string) => pingServer(address).catch((err: Error) => ({ offline: err.message })));

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
  trash: (file) => shell.trashItem(file), openPath: (dir) => shell.openPath(dir),
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

/** True for files inside one of the profiles' game folders. */
function isInsideInstances(file: string): boolean {
  const full = path.resolve(file);
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
handle('update:download', () => shell.openExternal(`${store.settings.socialUrl}/pobierz/${process.arch === 'arm64' ? 'mac' : 'mac-intel'}`));
handle('app:version', () => app.getVersion());
/** A Microsoft account with a valid Minecraft token (refreshed and saved if needed). */
async function freshMsa(accountId: string): Promise<MicrosoftAccount> {
  const account = store.accounts.find((a) => a.id === accountId);
  if (account?.type !== 'msa') throw new Error(t('Skin i pelerynę można zmienić tylko na koncie Microsoft.'));
  const fresh = await ensureFreshAccount(account, store.settings.msClientId.trim());
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

handle('game:launch', async (profileId: string, accountId: string, server?: string, world?: string, benchmark = false) => {
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
  // the benchmark runs inside SlashClient HUD: it starts by itself once the world is loaded
  if (benchmark) {
    if (!hud.jvmArgs.length) throw new Error(t('Benchmark działa z modem SlashClient: w profilu Fabric lub vanilla w wersji, którą mod obsługuje.'));
    hud.jvmArgs.push('-Dslashclient.benchmark=true');
  }
  const benchmarksBefore = benchmark ? (await readBenchmarks(profileGameDir(profile)))[0]?.at ?? 0 : 0;
  const activityVersion = `${await resolveVersionId(profile.versionId)}${loaderName}`;
  social.setActivity({ kind: server ? 'server' : 'menu', server: server || undefined, version: activityVersion, since: startedAt });
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
      if (runs[0] && runs[0].at > benchmarksBefore) send('benchmark:done', { profileId: profile.id, result: runs[0], before: runs[1] });
    }).catch(() => {});
    if (profile.syncOptions) pushShared(profileGameDir(profile)).catch(() => {});
    recordSession(profile, startedAt, lastServer).catch(() => {});
    resolveVersionId(profile.versionId).then((versionId) => appendSession({
      start: startedAt, end: Date.now(), profileId: profile.id, profileName: profile.name, versionId, loader: profile.loader, servers: joins,
    })).catch(() => {});
    // another game still running keeps Discord and friends up to date; the last one closing goes back to idle
    const other = [...games.values()].at(-1);
    showPresence(other ? other.presence : idlePresence());
    if (!other) social.setActivity({ kind: 'launcher' });
    send('game:exit', { code, signal, byUser: killRequested, profileId: profile.id });
    if (code !== 0 && !killRequested) {
      analyzeCrash({ log: recentLog, gameDir: profileGameDir(profile), startedAt, code, signal })
        .then((analysis) => send('game:crash', analysis))
        .catch(() => {});
    }
    send('store', publicStore());
    if (store.settings.closeOnLaunch && !games.size) win?.show();
  });
});
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
    if (event.type === 'message' && event.message) event = { ...event, message: openMessage(event.message as ChatMessage) };
    if (event.type === 'keys' && typeof event.user === 'string') chatKeys.delete(event.user);
    send('social:event', event);
    bridge.push(event as { type: string });
    // a friend joins the world this game opened to LAN
    if (event.type === 'lan-connect' && typeof event.id === 'string') lan.accept(event.id);
  },
  onReady: () => {
    void registerChatKey();
    lan.resend();
    // connected again (the server restarted, or the network was away): the running games say who plays, right away
    for (const g of games.values()) g.link();
  },
});

/** Friends joining worlds opened to LAN, through the server's relay. */
const lan = new LanTunnels({
  url: () => store.settings.socialUrl,
  token: () => (store.settings.socialToken ? secrets.decrypt(store.settings.socialToken) : undefined),
  send: (message) => social.send(message),
});

/** The account the running game plays as (it can change from the game's menu). */
let gameAccountId: string | undefined;

/** Friends and chat for SlashClient HUD in the game, without handing it the account token. */
const bridge = new GameBridge({
  call: (method, apiPath, body) => chatCall(method, apiPath, body),
  state: () => {
    const s = social.state();
    return { signedIn: !!s.user, user: s.user, connected: s.connected };
  },
  accounts: () => store.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, current: a.id === gameAccountId })),
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
    const real = await fsp.realpath(file);
    const dirs = await Promise.all(store.profiles.map((p) => fsp.realpath(path.join(profileGameDir(p), 'screenshots')).catch(() => '')));
    if (!real.endsWith('.png') || !dirs.some((d) => d && path.dirname(real) === d)) throw new Error('not_a_screenshot');
    const png = await fsp.readFile(real);
    if (nativeImage.createFromBuffer(png).isEmpty()) throw new Error('not_an_image');
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
  },
});

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
/** The page's requests; only the parts of the API that work on the player's own data. */
// joining a friend's world open to LAN from the launcher: a local port through the relay, as the game's friends list does
handle('lan:join', (friendId: string) => {
  if (typeof friendId !== 'string' || !/^[\w-]{1,64}$/.test(friendId)) throw new Error('social:bad_request');
  return lan.join(friendId);
});

handle('social:api', (method: string, apiPath: string, body?: unknown) => {
  if (!['GET', 'POST', 'DELETE'].includes(method) || !/^\/v1\/(me|friends|messages|invites|cosmetics|waypoints|parties|achievements)(\/[\w-]+)*(\?[\w=&-]*)?$/.test(apiPath)) throw new Error('social:bad_request');
  return socialCall(() => chatCall(method, apiPath, body));
});

// ---------- end-to-end encrypted chat (chatCrypto.ts) ----------

interface ChatMessage { from: string; to: string; text: string; invite?: unknown; encrypted?: boolean; unreadable?: boolean }

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

/** Publishes this launcher's public key, so friends (and our other launchers) can encrypt for it. */
async function registerChatKey() {
  const k = chatKey();
  await social.call('POST', '/v1/keys', { device: k.device, pub: k.publicKey }).catch((err) => console.error('Klucz czatu:', (err as Error).message));
}

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

function openMessage(m: ChatMessage): ChatMessage {
  if (!isEncrypted(m.text)) return m;
  const text = decrypt(m.text, chatKey(), `${m.from}|${m.to}`);
  return text === undefined
    ? { ...m, text: t('Wiadomość zaszyfrowana dla innego urządzenia.'), encrypted: true, unreadable: true }
    : { ...m, text, encrypted: true };
}

/** A call to the social server with the chat encrypted on the way out and decrypted on the way in. */
async function chatCall(method: string, apiPath: string, body?: unknown) {
  const send = /^\/v1\/messages\/([\w-]+)$/.exec(apiPath);
  if (method === 'POST' && send && body && typeof (body as { text?: unknown }).text === 'string') {
    body = { ...(body as object), text: await sealText(send[1], (body as { text: string }).text) };
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
protocol.registerSchemesAsPrivileged([{ scheme: 'slash-media', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

app.whenReady().then(async () => {
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
  hudSupported = await hudVersions(HUD_DIR);
  // first start: follow the system language
  if (!store.settings.language) store.settings.language = app.getLocale().toLowerCase().startsWith('pl') ? 'pl' : 'en';
  setLang(store.settings.language);
  void applyToolSettings(store.settings);
  createWindow();
  startUpdateChecks({ serverUrl: () => store.settings.socialUrl, send: (status) => send('update:status', status), onLog: (m) => console.error(m) });
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
