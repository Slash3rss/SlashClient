import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { netFetch } from './download';
import { installMrpack } from './modrinth';
import { applySettings, CONFIG_ITEMS, includePath, manualFilesOf, OPTION_FILES, readPackSummary, settingsOf, uniqueName, type PackPart } from './profilePack';
import { shareErrorText } from './profileShare';
import { newProfile, type Profile } from './store';
import { APP_VERSION } from '../shared/version';
import { t } from '../shared/i18n';

/**
 * Profiles kept on the player's SlashClient account (server: profileCloud.ts), so the same
 * profile works on a second computer. A profile is uploaded as the same .mrpack a share code
 * uses (mods as links, configs and the HUD layout inside, the launcher's settings of the
 * profile), without worlds. Which local profile is which cloud profile, and the revision each
 * last saw, is kept in cloud-profiles.json in the launcher's folder (never in the game folder,
 * so copying a profile does not copy the link).
 */

/** What goes to the account: everything but the worlds. */
export const CLOUD_PARTS: PackPart[] = ['mods', 'resourcepacks', 'shaderpacks', 'config', 'options', 'servers', 'settings'];
/** The server's limit; checked here first so a too big pack is not sent at all. */
export const CLOUD_MAX_BYTES = 50 * 1024 * 1024;

export interface CloudProfile {
  id: string;
  name: string;
  gameVersion: string;
  loader: string;
  device: string;
  size: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface CloudLimits { maxBytes: number; maxProfiles: number; quotaBytes: number; used: number }

/** A local profile's link to its copy on the account. */
export interface CloudLink {
  cloudId: string;
  /** The revision last uploaded from or downloaded to this computer. */
  revision: number;
  /** When that happened: files changed later count as local changes. */
  syncedAt: number;
  /** The profile's launcher settings at that moment (a hash), so changing e.g. the memory counts too. */
  settingsHash: string;
  /** Upload by itself after each game session. */
  auto: boolean;
}

/**
 * What to do with a profile:
 * - upload: only this computer changed it (or the account has no copy)
 * - download: only the account's copy is newer
 * - conflict: both changed since the last sync, the player picks which one wins
 * - none: both are the same
 */
export type CloudAction = 'upload' | 'download' | 'conflict' | 'none';

export function cloudAction(link: CloudLink | undefined, remote: CloudProfile | undefined, localChanged: boolean): CloudAction {
  if (!link || !remote) return 'upload';
  // the account went back (its copy was deleted and uploaded again elsewhere): this one is at least as good
  if (remote.revision < link.revision) return localChanged ? 'conflict' : 'download';
  if (remote.revision === link.revision) return localChanged ? 'upload' : 'none';
  return localChanged ? 'conflict' : 'download';
}

export const settingsHash = (profile: Profile) => createHash('sha1').update(JSON.stringify(settingsOf(profile))).digest('hex');

/** The newest modification time among the files a cloud copy carries (0 when there are none). */
export async function newestChange(gameDir: string): Promise<number> {
  let newest = 0;
  let seen = 0;
  const walk = async (rel: string, depth: number) => {
    if (seen > 20_000 || depth > 12) return;
    const full = path.join(gameDir, rel);
    const stat = await fs.stat(full).catch(() => undefined);
    if (!stat) return;
    seen++;
    if (stat.isFile()) {
      newest = Math.max(newest, stat.mtimeMs);
      return;
    }
    if (!stat.isDirectory()) return;
    // a deleted file changes its folder's time
    newest = Math.max(newest, stat.mtimeMs);
    for (const name of await fs.readdir(full).catch(() => [] as string[])) {
      if (name.startsWith('.')) continue;
      await walk(path.join(rel, name), depth + 1);
    }
  };
  for (const rel of ['mods', 'resourcepacks', 'shaderpacks', ...CONFIG_ITEMS, ...OPTION_FILES, 'servers.dat']) await walk(rel, 0);
  return newest;
}

/** Whether the profile changed on this computer since its last sync. */
export async function changedSince(gameDir: string, profile: Profile, link: CloudLink): Promise<boolean> {
  if (settingsHash(profile) !== link.settingsHash) return true;
  // a second of slack: some file systems keep times coarser than the clock
  return (await newestChange(gameDir)) > link.syncedAt + 1000;
}

// ---------- the links, on disk ----------

export class CloudLinks {
  private links: Record<string, CloudLink> = {};
  private loaded?: Promise<void>;
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  private load(): Promise<void> {
    this.loaded ??= fs.readFile(this.file, 'utf8').then((text) => {
      const raw = JSON.parse(text) as Record<string, CloudLink>;
      for (const [id, l] of Object.entries(raw ?? {})) {
        if (l && typeof l.cloudId === 'string' && typeof l.revision === 'number') this.links[id] = { ...l, auto: !!l.auto, syncedAt: Number(l.syncedAt) || 0, settingsHash: String(l.settingsHash ?? '') };
      }
    }, () => {});
    return this.loaded;
  }

  async get(profileId: string): Promise<CloudLink | undefined> {
    await this.load();
    return this.links[profileId];
  }

  async all(): Promise<Record<string, CloudLink>> {
    await this.load();
    return { ...this.links };
  }

  async set(profileId: string, link: CloudLink | undefined): Promise<void> {
    await this.load();
    if (link) this.links[profileId] = link;
    else delete this.links[profileId];
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.links, null, 2));
    await fs.rename(tmp, this.file);
  }
}

// ---------- talking to the server ----------

/** The server's error codes in words (the share codes' texts for the rest). */
export function cloudErrorText(code: string | undefined, status: number): string {
  const texts: Record<string, string> = {
    unauthorized: t('Zaloguj się do SlashClient (zakładka Znajomi), żeby zapisywać profile na koncie.'),
    too_large: t('Profil jest za duży, żeby zapisać go na koncie (do {0} MB).', CLOUD_MAX_BYTES / 1024 / 1024),
    cloud_limit: t('Na koncie jest już najwięcej profili, ile można trzymać. Usuń któryś i spróbuj ponownie.'),
    cloud_quota: t('Profile na koncie zajmują już cały limit miejsca. Usuń któryś i spróbuj ponownie.'),
    cloud_conflict: t('Kopia na koncie zmieniła się na innym komputerze.'),
    not_found: t('Tego profilu nie ma już na koncie.'),
    storage_full: t('Serwerowi SlashClient skończyło się miejsce na pliki. Spróbuj później.'),
    storage_unavailable: t('Miejsce na pliki na serwerze SlashClient jest chwilowo niedostępne. Spróbuj za chwilę.'),
  };
  return (code && texts[code]) || shareErrorText(code, status);
}

/** An error with the server's code, so the page can tell a conflict from other failures. */
export class CloudError extends Error {
  readonly code: string | undefined;
  constructor(code: string | undefined, status: number) {
    super(cloudErrorText(code, status));
    this.code = code;
  }
}

const base = (server: string) => server.replace(/\/$/, '');
const headers = (token: string) => ({ 'X-SlashClient': `launcher/${APP_VERSION}`, Authorization: `Bearer ${token}` });

async function failed(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new CloudError(body.error ?? (res.status === 413 ? 'too_large' : undefined), res.status);
}

export async function listCloud(server: string, token: string): Promise<{ profiles: CloudProfile[]; limits?: CloudLimits }> {
  const res = await netFetch(`${base(server)}/v1/cloud-profiles`, { headers: headers(token), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) await failed(res);
  return (await res.json()) as { profiles: CloudProfile[]; limits?: CloudLimits };
}

/** The account's copy, or undefined when it has none. */
export async function cloudInfo(server: string, token: string, id: string): Promise<CloudProfile | undefined> {
  const res = await netFetch(`${base(server)}/v1/cloud-profiles/${id}`, { headers: headers(token), signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return undefined;
  if (!res.ok) await failed(res);
  return ((await res.json()) as { profile: CloudProfile }).profile;
}

export async function uploadCloud(opts: {
  server: string; token: string; id: string; file: string; name: string; gameVersion: string; loader: string; base: number; force?: boolean;
}): Promise<CloudProfile> {
  const data = await fs.readFile(opts.file);
  if (data.length > CLOUD_MAX_BYTES) throw new CloudError('too_large', 413);
  const query = new URLSearchParams({
    name: opts.name, game: opts.gameVersion, loader: opts.loader, device: os.hostname().slice(0, 60), base: String(opts.base), ...(opts.force ? { force: '1' } : {}),
  });
  const res = await netFetch(`${base(opts.server)}/v1/cloud-profiles/${opts.id}?${query}`, {
    method: 'PUT',
    headers: { ...headers(opts.token), 'Content-Type': 'application/x-modrinth-modpack+zip' },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok) await failed(res);
  return ((await res.json()) as { profile: CloudProfile }).profile;
}

/** Downloads the account's copy into `dest`; answers its revision. */
export async function downloadCloud(server: string, token: string, id: string, dest: string): Promise<number> {
  const res = await netFetch(`${base(server)}/v1/cloud-profiles/${id}/file`, { headers: headers(token), signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok) await failed(res);
  if (Number(res.headers.get('content-length')) > CLOUD_MAX_BYTES) throw new CloudError('too_large', 413);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > CLOUD_MAX_BYTES) throw new CloudError('too_large', 413);
    chunks.push(chunk);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.concat(chunks));
  return Number(res.headers.get('x-cloud-revision')) || 0;
}

export async function deleteCloud(server: string, token: string, id: string): Promise<void> {
  const res = await netFetch(`${base(server)}/v1/cloud-profiles/${id}`, { method: 'DELETE', headers: headers(token), signal: AbortSignal.timeout(15_000) });
  if (!res.ok && res.status !== 404) await failed(res);
}

export const newCloudId = () => randomUUID();
export const validCloudId = (raw: unknown): raw is string => typeof raw === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(raw);

// ---------- installing the account's copy ----------

/**
 * Makes the profile what the pack says: mods and configs are replaced as a whole (a file deleted
 * on the other computer goes here too; both are in the snapshot taken before), resource packs,
 * shaders and game settings are written over, and the launcher's settings of the profile follow.
 */
export async function installInto(profile: Profile, gameDir: string, file: string, onStage?: Stage): Promise<void> {
  const summary = readPackSummary(file);
  if (summary.kind !== 'mrpack') throw new Error(t('To nie jest modpack Modrinth (.mrpack).'));
  for (const rel of ['mods', ...CONFIG_ITEMS]) await fs.rm(path.join(gameDir, rel), { recursive: true, force: true });
  // the list of what was installed from where: rebuilt by the next update check
  await fs.rm(path.join(gameDir, '.slashclient', 'content.json'), { force: true });
  const info = await installMrpack(file, gameDir, onStage, includePath(CLOUD_PARTS));
  Object.assign(profile, { versionId: info.gameVersion, loader: info.loader, loaderVersion: info.loaderVersion });
  if (summary.settings) {
    applySettings(profile, summary.settings);
    if (profile.icon === 'custom') profile.iconVersion = Date.now();
  }
  if (!summary.settings?.name) profile.name = summary.name.slice(0, 40);
  // a custom icon whose picture was not in the pack falls back to the default one
  if (profile.icon === 'custom' && !['png', 'webp', 'gif'].some((ext) => existsSync(path.join(gameDir, '.slashclient', `icon.${ext}`)))) profile.icon = '';
  const manual = manualFilesOf(summary.settings);
  profile.manualFiles = manual.length ? manual : undefined;
}

// ---------- the launcher's side (IPC) ----------

type Handle = <T extends unknown[], R>(channel: string, fn: (...args: T) => Promise<R> | R) => void;
type Stage = (stage: string, done: number, total: number) => void;
interface Task { progress: Stage; finish: (ok: boolean, message: string, profileId?: string) => void }

export interface CloudDeps {
  handle: Handle;
  profiles: () => Profile[];
  gameDir: (profile: Profile) => string;
  /** Whether this profile's game runs now (its files are in use and change). */
  running: (profileId: string) => boolean;
  persist: () => Promise<void>;
  startTask: (title: string) => Task;
  /** The SlashClient server and the signed-in session; throws when nobody is signed in. */
  session: () => { server: string; token: string };
  signedIn: () => boolean;
  /** Writes the profile as a .mrpack with these parts (the same as export and share codes). */
  pack: (profile: Profile, out: string, parts: PackPart[], onStage: Stage) => Promise<{ gameVersion: string }>;
  /** Takes a snapshot of mods and config before the account's copy replaces them. */
  snapshot: (profile: Profile, label: string) => Promise<unknown>;
  /** Settings a new profile starts with (the default memory). */
  defaults: () => Partial<Profile>;
  /** Puts a new profile into the list and selects it. */
  add: (profile: Profile) => void;
  linksFile: string;
  tempDir: string;
}

export interface CloudStatus {
  signedIn: boolean;
  link?: CloudLink;
  remote?: CloudProfile;
  action?: CloudAction;
  localChanged?: boolean;
}

export function registerCloudProfiles(deps: CloudDeps) {
  const { handle } = deps;
  const links = new CloudLinks(deps.linksFile);
  /** Profiles being uploaded or downloaded: a second click waits for the first. */
  const busy = new Set<string>();
  const profileById = (id: string) => {
    const profile = deps.profiles().find((p) => p.id === id);
    if (!profile) throw new Error(t('Nie znaleziono profilu.'));
    return profile;
  };
  const tempFile = async () => {
    await fs.mkdir(deps.tempDir, { recursive: true });
    return path.join(deps.tempDir, `${randomUUID()}.mrpack`);
  };
  async function locked<T>(profileId: string, work: () => Promise<T>): Promise<T> {
    if (busy.has(profileId)) throw new Error(t('Ten profil właśnie się synchronizuje.'));
    busy.add(profileId);
    try {
      return await work();
    } finally {
      busy.delete(profileId);
    }
  }

  async function status(profileId: string): Promise<CloudStatus> {
    const profile = profileById(profileId);
    const link = await links.get(profileId);
    if (!deps.signedIn()) return { signedIn: false, link };
    if (!link) return { signedIn: true };
    const { server, token } = deps.session();
    const remote = await cloudInfo(server, token, link.cloudId);
    const localChanged = await changedSince(deps.gameDir(profile), profile, link);
    return { signedIn: true, link, remote, localChanged, action: cloudAction(link, remote, localChanged) };
  }

  /** Packs and uploads; a conflict is an answer (the page asks the player), not an error. */
  async function upload(profileId: string, force: boolean): Promise<{ conflict?: CloudProfile; profile?: CloudProfile }> {
    const profile = profileById(profileId);
    if (deps.running(profileId)) throw new Error(t('Zamknij grę tego profilu przed synchronizacją.'));
    const session = deps.session();
    return locked(profileId, async () => {
      const link = (await links.get(profileId)) ?? { cloudId: newCloudId(), revision: 0, syncedAt: 0, settingsHash: '', auto: true };
      const task = deps.startTask(t('Zapisywanie na koncie: {0}', profile.name));
      const file = await tempFile();
      // changes made while packing count as newer than this copy
      const startedAt = Date.now();
      try {
        const { gameVersion } = await deps.pack(profile, file, CLOUD_PARTS, task.progress);
        task.progress(t('Wysyłanie na serwer'), 0, 1);
        const saved = await uploadCloud({ ...session, id: link.cloudId, file, name: profile.name, gameVersion, loader: profile.loader, base: link.revision, force });
        await links.set(profileId, { ...link, revision: saved.revision, syncedAt: startedAt, settingsHash: settingsHash(profile) });
        task.finish(true, t('Profil {0} jest zapisany na koncie.', profile.name));
        return { profile: saved };
      } catch (err) {
        if (err instanceof CloudError && err.code === 'cloud_conflict') {
          task.finish(false, t('Profil {0} zmienił się na koncie z innego komputera: wybierz, którą wersję zostawić.', profile.name));
          return { conflict: await cloudInfo(session.server, session.token, link.cloudId) };
        }
        task.finish(false, t('Nie udało się zapisać profilu na koncie: {0}', (err as Error).message));
        throw err;
      } finally {
        await fs.rm(file, { force: true }).catch(() => {});
      }
    });
  }

  /** Replaces the local profile with the account's copy (after a snapshot of mods and config). */
  async function download(profileId: string): Promise<void> {
    const profile = profileById(profileId);
    if (deps.running(profileId)) throw new Error(t('Zamknij grę tego profilu przed synchronizacją.'));
    const link = await links.get(profileId);
    if (!link) throw new Error(t('Ten profil nie jest zapisany na koncie.'));
    const { server, token } = deps.session();
    await locked(profileId, async () => {
      const task = deps.startTask(t('Pobieranie z konta: {0}', profile.name));
      const file = await tempFile();
      try {
        task.progress(t('Pobieranie z serwera'), 0, 1);
        const revision = await downloadCloud(server, token, link.cloudId, file);
        task.progress(t('Zapisywanie migawki profilu'), 0, 1);
        await deps.snapshot(profile, t('Przed pobraniem z konta'));
        await installInto(profile, deps.gameDir(profile), file, task.progress);
        await deps.persist();
        await links.set(profileId, { ...link, revision, syncedAt: Date.now(), settingsHash: settingsHash(profile) });
        task.finish(true, t('Profil {0} ma teraz wersję z konta.', profile.name), profile.id);
      } catch (err) {
        task.finish(false, t('Nie udało się pobrać profilu z konta: {0}', (err as Error).message));
        throw err;
      } finally {
        await fs.rm(file, { force: true }).catch(() => {});
      }
    });
  }

  handle('cloud:status', (profileId: string) => status(profileId));
  handle('cloud:upload', (profileId: string, force?: boolean) => upload(profileId, !!force));
  handle('cloud:download', (profileId: string) => download(profileId));
  /** Turns the automatic upload after each game session on or off. */
  handle('cloud:setAuto', async (profileId: string, on: boolean) => {
    profileById(profileId);
    const link = await links.get(profileId);
    if (link) await links.set(profileId, { ...link, auto: !!on });
    return links.get(profileId);
  });

  /** The account's profiles, with the local profile each one is (when it is on this computer). */
  handle('cloud:list', async () => {
    const { server, token } = deps.session();
    const res = await listCloud(server, token);
    const ids = new Set(deps.profiles().map((p) => p.id));
    const local: Record<string, string> = {};
    for (const [profileId, link] of Object.entries(await links.all())) if (ids.has(profileId)) local[link.cloudId] = profileId;
    return { ...res, local };
  });
  /** A profile of the account as a new profile on this computer, synced from now on. */
  handle('cloud:restore', async (cloudId: string) => {
    if (!validCloudId(cloudId)) throw new Error(t('Tego profilu nie ma już na koncie.'));
    const ids = new Set(deps.profiles().map((p) => p.id));
    for (const [profileId, link] of Object.entries(await links.all())) {
      if (link.cloudId === cloudId && ids.has(profileId)) throw new Error(t('Ten profil jest już na tym komputerze: {0}.', profileById(profileId).name));
    }
    const { server, token } = deps.session();
    const task = deps.startTask(t('Pobieranie profilu z konta'));
    const file = await tempFile();
    try {
      task.progress(t('Pobieranie z serwera'), 0, 1);
      const revision = await downloadCloud(server, token, cloudId, file);
      const profile = newProfile(deps.defaults());
      await installInto(profile, deps.gameDir(profile), file, task.progress);
      profile.name = uniqueName(profile.name, deps.profiles().map((p) => p.name));
      deps.add(profile);
      await deps.persist();
      await links.set(profile.id, { cloudId, revision, syncedAt: Date.now(), settingsHash: settingsHash(profile), auto: true });
      task.finish(true, t('Pobrano profil {0} z konta.', profile.name), profile.id);
      return profile.id;
    } catch (err) {
      task.finish(false, t('Nie udało się pobrać profilu z konta: {0}', (err as Error).message));
      throw err;
    } finally {
      await fs.rm(file, { force: true }).catch(() => {});
    }
  });
  handle('cloud:delete', async (cloudId: string) => {
    if (!validCloudId(cloudId)) return;
    const { server, token } = deps.session();
    await deleteCloud(server, token, cloudId);
    for (const [profileId, link] of Object.entries(await links.all())) if (link.cloudId === cloudId) await links.set(profileId, undefined);
  });

  return {
    /** After a game session: profiles with automatic sync go to the account (a conflict is left for the player). */
    async afterGame(profileId: string): Promise<void> {
      const link = await links.get(profileId);
      if (!link?.auto || !deps.signedIn() || busy.has(profileId)) return;
      const now = await status(profileId);
      if (now.action === 'upload') await upload(profileId, false);
      else if (now.action === 'conflict' || now.action === 'download') {
        const profile = profileById(profileId);
        deps.startTask(t('Synchronizacja: {0}', profile.name)).finish(false, t('Profil {0} zmienił się na koncie z innego komputera: wybierz, którą wersję zostawić.', profile.name), profileId);
      }
    },
  };
}
