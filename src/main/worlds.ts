import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readNbt } from './nbt';

export interface WorldInfo {
  folder: string;
  name: string;
  gameMode: string;
  hardcore: boolean;
  version?: string;
  lastPlayed: number;
  sizeBytes: number;
  icon?: string;
}

export interface Backup {
  file: string;
  world: string;
  createdAt: number;
  sizeBytes: number;
}

export interface Screenshot {
  file: string;
  name: string;
  createdAt: number;
  sizeBytes: number;
}

const GAME_MODES = ['Przetrwanie', 'Kreatywny', 'Przygoda', 'Obserwator'];

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(p) : (await fs.stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

/** Only plain folder/file names, never paths, so nothing outside the instance is touched. */
function plainName(name: string): string {
  if (!name || name !== path.basename(name) || name.startsWith('.')) throw new Error('Nieprawidłowa nazwa');
  return name;
}

export async function listWorlds(gameDir: string): Promise<WorldInfo[]> {
  const saves = path.join(gameDir, 'saves');
  const out: WorldInfo[] = [];
  for (const entry of await fs.readdir(saves, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(saves, entry.name);
    const levelDat = path.join(dir, 'level.dat');
    try {
      const data = (readNbt(await fs.readFile(levelDat)).Data ?? {}) as Record<string, any>;
      const icon = path.join(dir, 'icon.png');
      out.push({
        folder: entry.name,
        name: String(data.LevelName ?? entry.name),
        gameMode: GAME_MODES[Number(data.GameType ?? 0)] ?? 'Przetrwanie',
        hardcore: Boolean(data.hardcore),
        version: data.Version?.Name,
        lastPlayed: Number(data.LastPlayed ?? (await fs.stat(levelDat)).mtimeMs),
        sizeBytes: await dirSize(dir),
        icon: (await fs.access(icon).then(() => true, () => false)) ? icon : undefined,
      });
    } catch {
      // not a world (or unreadable level.dat): skip it
    }
  }
  return out.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

export async function backupWorld(gameDir: string, folder: string): Promise<Backup> {
  const src = path.join(gameDir, 'saves', plainName(folder));
  const dir = path.join(gameDir, 'backups');
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = path.join(dir, `${folder}_${stamp}.zip`);
  const zip = new AdmZip();
  // session.lock is held open by a running game and isn't needed in a backup
  await zip.addLocalFolderPromise(src, { zipPath: folder, filter: (p) => !/session\.lock$/.test(p) });
  await zip.writeZipPromise(file);
  const { size } = await fs.stat(file);
  return { file, world: folder, createdAt: Date.now(), sizeBytes: size };
}

export async function listBackups(gameDir: string): Promise<Backup[]> {
  const dir = path.join(gameDir, 'backups');
  const out: Backup[] = [];
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!name.endsWith('.zip')) continue;
    const file = path.join(dir, name);
    const st = await fs.stat(file);
    out.push({ file, world: name.replace(/_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/, ''), createdAt: st.mtimeMs, sizeBytes: st.size });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Restores a backup next to the original world (never overwrites) and returns the new folder name. */
export async function restoreBackup(gameDir: string, backupName: string): Promise<string> {
  const file = path.join(gameDir, 'backups', plainName(backupName));
  const zip = new AdmZip(file);
  const saves = path.join(gameDir, 'saves');
  const stamp = backupName.match(/_(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-\d{2}\.zip$/);
  const world = backupName.replace(/_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/, '').replace(/\.zip$/, '');
  const base = stamp ? `${world} (kopia ${stamp[3]}.${stamp[2]} ${stamp[4]}.${stamp[5]})` : `${world} (kopia)`;
  let target = base;
  for (let i = 2; await fs.access(path.join(saves, target)).then(() => true, () => false); i++) target = `${base} ${i}`;
  const dest = path.join(saves, target);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    // drop the top-level world folder from the zip path and refuse anything escaping dest
    const rel = entry.entryName.split('/').slice(1).join('/');
    const out = path.resolve(dest, rel);
    if (!rel || !out.startsWith(dest + path.sep)) continue;
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, entry.getData());
  }
  return target;
}

export async function deleteFile(gameDir: string, folder: 'backups' | 'screenshots', name: string): Promise<void> {
  await fs.rm(path.join(gameDir, folder, plainName(name)), { force: true });
}

export async function listScreenshots(gameDir: string): Promise<Screenshot[]> {
  const dir = path.join(gameDir, 'screenshots');
  const out: Screenshot[] = [];
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!/\.(png|jpe?g)$/i.test(name)) continue;
    const file = path.join(dir, name);
    const st = await fs.stat(file);
    out.push({ file, name, createdAt: st.mtimeMs, sizeBytes: st.size });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
