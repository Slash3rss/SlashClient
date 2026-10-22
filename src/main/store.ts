import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ManualFile } from './manualFiles';
import { paths } from './paths';

export interface OfflineAccount {
  id: string;
  type: 'offline';
  name: string;
  uuid: string;
}

export interface MicrosoftAccount {
  id: string;
  type: 'msa';
  name: string;
  uuid: string;
  xuid: string;
  accessToken: string;
  /** Epoch ms after which the Minecraft access token must be refreshed. */
  expiresAt: number;
  /** Microsoft refresh token, encrypted with the OS keychain when available. */
  refreshToken: string;
  /** The Microsoft app the refresh token belongs to: it only refreshes with that one (older accounts lack it). */
  clientId?: string;
}

export type Account = OfflineAccount | MicrosoftAccount;

export interface Profile {
  id: string;
  name: string;
  versionId: string;
  /** Mod loader; 'vanilla' = none. */
  loader: 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge';
  /** Loader version; empty = newest stable. */
  loaderVersion: string;
  /** 'block:<kind>' (built-in picture) or 'custom' (.slashclient/icon.png in the game folder); empty = default. */
  icon: string;
  /** Bumped when a custom icon changes, so the page reloads the picture. */
  iconVersion: number;
  /** Share options.txt, servers.dat and hotbar.nbt with the other synced profiles. */
  syncOptions: boolean;
  /** SlashClient HUD in game (Fabric profiles on supported versions). */
  hud: boolean;
  /** Total time spent in game with this profile. */
  playTimeMs: number;
  lastPlayedAt?: number;
  /** Where the player was at the end of the last session, for "Back to the game". */
  lastTarget?: { kind: 'server'; address: string } | { kind: 'world'; folder: string; name: string };
  /** The modpack (Modrinth, or CurseForge with source set) this profile was created from, for updates and version changes. */
  modpack?: { projectId: string; versionId: string; versionNumber: string; title: string; source?: 'curseforge' };
  /** CurseForge files the authors keep on their site: the player downloads them by hand into `folder`. */
  manualFiles?: ManualFile[];
  /** The Minecraft account this profile always plays as; none = the one picked on the Play tab. */
  accountId?: string;
  /** Game directory; empty means instances/<id>. */
  gameDir: string;
  memoryMb: number;
  jvmArgs: string;
  /** JVM flag preset ('default' | 'g1' | 'zgc'), expanded for the game's Java at launch. */
  jvmPreset: 'default' | 'g1' | 'zgc';
  /** Overrides the automatically installed Java; empty means automatic. */
  javaPath: string;
  width: number;
  height: number;
}

export interface Settings {
  /** Azure application (client) ID used for Microsoft sign-in. */
  msClientId: string;
  selectedProfileId?: string;
  selectedAccountId?: string;
  closeOnLaunch: boolean;
  /** "Podsumowanie sesji" after the game closes; missing = on. */
  sessionSummary?: boolean;
  /** System notifications (Windows toasts, macOS Notification Center) while the launcher is in the background; missing = on. */
  systemNotifications?: boolean;
  /** Whether those notifications play the system's sound; missing = off. */
  notificationSound?: boolean;
  /** Fewer animations (slower computers): no transitions, a still starry sky, 3D previews that don't spin. */
  reduceMotion?: boolean;
  /** How much memory new profiles start with (MB); each profile can change its own. */
  defaultMemoryMb?: number;
  /** Show the game status on Discord (Rich Presence). */
  discordEnabled: boolean;
  /** UI language ('pl' | 'en'); empty = follow the system. */
  language: string;
  /** The profile last used for each server address, offered first next time. */
  serverProfiles?: Record<string, string>;
  /** Address of the friends and messages server. */
  socialUrl: string;
  /** Session on that server, encrypted like the Microsoft tokens; never sent to the page. */
  socialToken?: string;
  /** This launcher's chat encryption key; the private half encrypted like the token. */
  chatKey?: { device: string; publicKey: string; privateKey: string };
  /** The status the player picked for friends. */
  socialStatus: 'online' | 'away' | 'busy' | 'invisible';
  /** Download speed limit in MB/s for all of the launcher's downloads; 0 or missing = no limit. */
  downloadLimitMBps?: number;
  /** Start games on the dedicated GPU (Windows: registry preference for our Java, Linux: PRIME offload). */
  dedicatedGpu?: boolean;
  /** A toast when a friend comes online or starts playing (off: only messages, invites and requests). */
  notifyFriendsPlaying?: boolean;
  /** Folders checked for CurseForge files downloaded by hand (top level only); missing = the system's Downloads folder. */
  manualWatchFolders?: string[];
  /** How the launcher's window opens: 'WxH', 'remember' (as last closed), 'maximized' or 'fullscreen'; missing = 1000x640. */
  launcherWindow?: string;
  /** The window's last size and place, for 'remember'. */
  launcherBounds?: { x: number; y: number; width: number; height: number; maximized?: boolean };
  /** The first-run wizard was finished or skipped (set on upgrade for players who already had accounts or profiles). */
  firstRunDone?: boolean;
}

export interface StoreData {
  accounts: Account[];
  profiles: Profile[];
  settings: Settings;
}

export interface SecretCodec {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

/** Plain base64 fallback, used outside Electron (CLI) where no keychain is available. */
let codec: SecretCodec = {
  encrypt: (s) => `b64:${Buffer.from(s).toString('base64')}`,
  decrypt: (s) => Buffer.from(s.replace(/^b64:/, ''), 'base64').toString(),
};

export function setSecretCodec(c: SecretCodec): void {
  codec = c;
}

export const secrets = {
  encrypt: (s: string) => codec.encrypt(s),
  decrypt: (s: string) => codec.decrypt(s),
};

const FILE = () => path.join(paths.config, 'launcher.json');

export function newProfile(partial: Partial<Profile> = {}): Profile {
  return {
    id: randomUUID(),
    name: 'Nowy profil',
    versionId: '',
    loader: 'vanilla',
    loaderVersion: '',
    icon: '',
    iconVersion: 0,
    syncOptions: true,
    hud: true,
    playTimeMs: 0,
    jvmPreset: 'g1',
    gameDir: '',
    memoryMb: 4096,
    jvmArgs: '',
    javaPath: '',
    width: 854,
    height: 480,
    ...partial,
  };
}

/** SlashClient's Microsoft app, approved by Mojang for Minecraft sign-in (a public id, not a secret). */
export const DEFAULT_MS_CLIENT_ID = process.env.SLASHCLIENT_MS_CLIENT_ID ?? '956312be-af3a-4279-bdbd-1e91128b7e73';
/** The public SlashClient server; SLASHCLIENT_SOCIAL_URL points a development build at a local one. */
export const DEFAULT_SOCIAL_URL = process.env.SLASHCLIENT_SOCIAL_URL ?? 'https://client.slash3rss.dev';

function defaults(): StoreData {
  return {
    accounts: [],
    profiles: [newProfile({ name: 'Najnowsza wersja', versionId: 'latest-release' })],
    settings: { msClientId: DEFAULT_MS_CLIENT_ID, closeOnLaunch: false, discordEnabled: true, language: '',
      socialUrl: DEFAULT_SOCIAL_URL, socialStatus: 'online' },
  };
}

/** The last good list of profiles, accounts and settings: written before each save. */
const BACKUP = () => `${FILE()}.bak`;

/** One store file; a file busy for a moment (antivirus, an update swapping files) is read again. */
async function readStoreFile(file: string): Promise<Partial<StoreData>> {
  let last: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as Partial<StoreData>;
    } catch (err) {
      last = err;
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) throw err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw last;
}

/** Whether the last load could not read the store and started from a backup or from scratch (profiles are then looked for on disk). */
export let storeRecovered = false;

export async function loadStore(): Promise<StoreData> {
  let data: Partial<StoreData> | undefined;
  try {
    data = await readStoreFile(FILE());
  } catch (err) {
    // never started over silently on top of a file that is there: it is kept aside (and the profiles'
    // folders are found again), then the copy from the last good save is taken
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`launcher.json: ${(err as Error).message}`);
      await fs.rename(FILE(), `${FILE()}.broken-${Date.now()}`).catch(() => {});
    }
    data = await readStoreFile(BACKUP()).catch(() => undefined);
    storeRecovered = existsSync(paths.instances);
  }
  if (!data) return defaults();
  try {
    const base = defaults();
    // both are built in (no field in Settings any more): what an older version saved does not count
    if (data.settings) Object.assign(data.settings, { msClientId: DEFAULT_MS_CLIENT_ID, socialUrl: DEFAULT_SOCIAL_URL });
    return {
      accounts: data.accounts ?? base.accounts,
      // profiles saved before settings sync existed keep their own settings until the player turns it on
      // older profiles keep the plain JVM settings they had
      profiles: data.profiles?.length ? data.profiles.map((p) => newProfile({ ...p, syncOptions: p.syncOptions ?? false, jvmPreset: p.jvmPreset ?? 'default' })) : base.profiles,
      settings: { ...base.settings, ...data.settings },
    };
  } catch {
    storeRecovered = existsSync(paths.instances);
    return defaults();
  }
}

/**
 * Folders in instances/ that hold a game (mods, worlds, configs, packs) but belong to no profile:
 * after a lost list of profiles they come back as profiles of their own (the folder's name is the
 * profile's id, so it plays from the same folder). The game version and loader are read from the
 * folder's last game log.
 */
export async function orphanProfiles(profiles: Profile[]): Promise<Profile[]> {
  const used = new Set(profiles.map((p) => path.resolve(profileGameDir(p)).toLowerCase()));
  const out: Profile[] = [];
  for (const name of await fs.readdir(paths.instances).catch(() => [] as string[])) {
    const dir = path.join(paths.instances, name);
    if (!/^[\w-]{1,64}$/.test(name) || used.has(path.resolve(dir).toLowerCase())) continue;
    if (!(await fs.stat(dir).then((s) => s.isDirectory(), () => false))) continue;
    const parts = await Promise.all(['mods', 'saves', 'config', 'resourcepacks', 'shaderpacks', 'options.txt'].map((n) => fs.stat(path.join(dir, n)).then(() => true, () => false)));
    if (!parts.some(Boolean)) continue;
    const log = await fs.readFile(path.join(dir, 'logs', 'latest.log'), 'utf8').then((s) => s.slice(0, 20000), () => '');
    const m = /Loading Minecraft (\S+) with (Fabric|Quilt) Loader (\S+)/.exec(log);
    out.push(newProfile({
      id: name, name: `Odzyskany profil ${out.length + 1}`,
      versionId: m?.[1] ?? 'latest-release', loader: m ? (m[2].toLowerCase() as Profile['loader']) : 'vanilla', loaderVersion: m?.[3] ?? '',
      syncOptions: false, jvmPreset: 'default',
    }));
  }
  return out;
}

let saving: Promise<void> = Promise.resolve();
let saves = 0;
/**
 * Writes atomically so a crash never leaves a half-written config behind. Saves go one after
 * another, each through its own temporary file: two at once used to share one and the second
 * rename failed (ENOENT).
 */
export function saveStore(data: StoreData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const write = async () => {
    await fs.mkdir(paths.config, { recursive: true });
    const tmp = `${FILE()}.${process.pid}.${++saves}.tmp`;
    await fs.writeFile(tmp, json, { mode: 0o600 });
    // the file being replaced is the last good one: kept, for a start that cannot read the new one
    await fs.copyFile(FILE(), BACKUP()).catch(() => {});
    await fs.rename(tmp, FILE());
  };
  const next = saving.then(write, write);
  saving = next.catch(() => {});
  return next;
}

export function profileGameDir(profile: Profile): string {
  return profile.gameDir || path.join(paths.instances, profile.id);
}
