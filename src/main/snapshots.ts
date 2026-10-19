import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { settingsOf, type ProfileSettings } from './profilePack';
import type { Profile } from './store';
import { t } from '../shared/i18n';

/**
 * Profile snapshots: copies of a profile's mods/ and config/ (with the launcher's notes on
 * what it installed) taken before a modpack update or by hand, so one click brings the
 * profile back exactly as it was. They live in the launcher's data folder, never in the game folder.
 */

/** How many snapshots each profile keeps; the oldest go first. */
export const MAX_SNAPSHOTS = 5;
/** Folders of the game folder a snapshot holds, replaced as a whole on restore. */
export const SNAPSHOT_FOLDERS = ['mods', 'config'];
/** The launcher's own notes about installed content and modpack files, which must match the folders. */
const SNAPSHOT_FILES = ['.slashclient/content.json', '.slashclient/modpack-files.json'];

export interface SnapshotInfo {
  id: string;
  createdAt: number;
  /** 'update' = taken automatically before a modpack update. */
  reason: 'update' | 'manual';
  /** What the snapshot was taken for, e.g. the modpack version about to be installed. */
  label?: string;
  sizeBytes: number;
  files: number;
  /** The pack-related profile fields at that moment, brought back on restore. */
  profile: Pick<Profile, 'versionId' | 'loader' | 'loaderVersion' | 'modpack' | 'manualFiles'>;
  /** The rest of the profile's settings, for reference. */
  settings: ProfileSettings;
}

/** Only ids made by `createSnapshot`, so nothing outside the snapshots folder is touched. */
function snapshotDir(dir: string, id: string): string {
  if (!/^[\w-]{1,80}$/.test(id)) throw new Error(t('Nieprawidłowa migawka'));
  return path.join(dir, id);
}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

async function countFiles(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await countFiles(p);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files++;
      bytes += (await fs.stat(p).catch(() => ({ size: 0 }))).size;
    }
  }
  return { files, bytes };
}

/**
 * Copies the profile's folders into a new snapshot in `dir` (that profile's snapshots folder)
 * and drops the oldest ones beyond `keep`. A snapshot is only listed once it is complete.
 */
export async function createSnapshot(opts: {
  dir: string; gameDir: string; profile: Profile; reason: SnapshotInfo['reason']; label?: string; keep?: number; now?: number;
}): Promise<SnapshotInfo> {
  const { dir, gameDir, profile } = opts;
  const now = opts.now ?? Date.now();
  const stamp = new Date(now).toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const id = `${stamp}-${randomBytes(3).toString('hex')}`;
  const tmp = path.join(dir, `.tmp-${id}`);
  const files = path.join(tmp, 'files');
  try {
    await fs.mkdir(files, { recursive: true });
    for (const rel of [...SNAPSHOT_FOLDERS, ...SNAPSHOT_FILES]) {
      const src = path.join(gameDir, rel);
      if (!(await exists(src))) continue;
      await fs.mkdir(path.dirname(path.join(files, rel)), { recursive: true });
      await fs.cp(src, path.join(files, rel), { recursive: true });
    }
    const count = await countFiles(files);
    const info: SnapshotInfo = {
      id, createdAt: now, reason: opts.reason, ...(opts.label ? { label: opts.label.slice(0, 120) } : {}),
      sizeBytes: count.bytes, files: count.files,
      profile: { versionId: profile.versionId, loader: profile.loader, loaderVersion: profile.loaderVersion, modpack: profile.modpack, manualFiles: profile.manualFiles },
      settings: settingsOf(profile),
    };
    await fs.writeFile(path.join(tmp, 'snapshot.json'), JSON.stringify(info, null, 2));
    await fs.rename(tmp, snapshotDir(dir, id));
    await pruneSnapshots(dir, opts.keep ?? MAX_SNAPSHOTS);
    return info;
  } catch (err) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/** The profile's snapshots, newest first. */
export async function listSnapshots(dir: string): Promise<SnapshotInfo[]> {
  const out: SnapshotInfo[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      const info = JSON.parse(await fs.readFile(path.join(dir, entry.name, 'snapshot.json'), 'utf8')) as SnapshotInfo;
      // the folder name is the id: a renamed or edited file cannot point elsewhere
      out.push({ ...info, id: entry.name });
    } catch {
      // not a snapshot (or a broken one): skip it
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

async function pruneSnapshots(dir: string, keep: number): Promise<void> {
  for (const old of (await listSnapshots(dir)).slice(Math.max(0, keep))) await deleteSnapshot(dir, old.id);
  // leftovers of snapshots that never finished (the launcher closed while copying)
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    if (name.startsWith('.tmp-')) await fs.rm(path.join(dir, name), { recursive: true, force: true }).catch(() => {});
  }
}

export async function deleteSnapshot(dir: string, id: string): Promise<void> {
  await fs.rm(snapshotDir(dir, id), { recursive: true, force: true });
}

/**
 * Puts the snapshot's folders back in the game folder exactly as they were: files added since
 * are gone, removed and changed ones come back. Everything is copied next to the game folder's
 * folders first and only then swapped in, so a failed copy leaves the profile untouched.
 * Returns the snapshot, whose `profile` fields the caller puts back with `applySnapshot`.
 */
export async function restoreSnapshot(dir: string, id: string, gameDir: string): Promise<SnapshotInfo> {
  const src = snapshotDir(dir, id);
  const info = (await listSnapshots(dir)).find((s) => s.id === id);
  if (!info) throw new Error(t('Nie znaleziono migawki.'));
  const stage = path.join(gameDir, '.slashclient', `restore-${randomBytes(4).toString('hex')}`);
  const parts = [...SNAPSHOT_FOLDERS, ...SNAPSHOT_FILES];
  try {
    await fs.mkdir(path.join(stage, 'new'), { recursive: true });
    for (const rel of parts) {
      const from = path.join(src, 'files', rel);
      if (!(await exists(from))) continue;
      await fs.mkdir(path.dirname(path.join(stage, 'new', rel)), { recursive: true });
      await fs.cp(from, path.join(stage, 'new', rel), { recursive: true });
    }
  } catch (err) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  // the copy is complete: swap each folder and file in (what was there moves aside, then goes)
  const movedAside: string[] = [];
  const placed: string[] = [];
  try {
    for (const rel of parts) {
      const target = path.join(gameDir, rel);
      const fresh = path.join(stage, 'new', rel);
      if (await exists(target)) {
        await fs.mkdir(path.dirname(path.join(stage, 'old', rel)), { recursive: true });
        await fs.rename(target, path.join(stage, 'old', rel));
        movedAside.push(rel);
      }
      if (await exists(fresh)) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.rename(fresh, target);
        placed.push(rel);
      }
    }
  } catch (err) {
    // put back what was already swapped; if even that fails, the old files stay in the stage folder
    try {
      for (const rel of placed) await fs.rm(path.join(gameDir, rel), { recursive: true, force: true });
      for (const rel of movedAside) await fs.rename(path.join(stage, 'old', rel), path.join(gameDir, rel));
      await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
    } catch {
      // leave the stage folder alone: it holds the only copy of the old files
    }
    throw err;
  }
  await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
  return info;
}

/** Brings back the profile fields a modpack update changes (game version, loader, modpack version). */
export function applySnapshot(profile: Profile, info: SnapshotInfo): void {
  const p = info.profile;
  if (typeof p.versionId === 'string' && p.versionId) profile.versionId = p.versionId;
  if (['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].includes(p.loader)) profile.loader = p.loader;
  if (typeof p.loaderVersion === 'string') profile.loaderVersion = p.loaderVersion;
  profile.modpack = p.modpack;
  profile.manualFiles = p.manualFiles;
}
