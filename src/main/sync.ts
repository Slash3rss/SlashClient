import fs from 'node:fs/promises';
import path from 'node:path';
import { Reader, readNbt, type NbtValue } from './nbt';
import { paths } from './paths';

/**
 * Game settings shared by every profile that has sync turned on:
 * options (video, sound, controls), the multiplayer server list and saved hotbars.
 * Minecraft accounts the player picked have a set of their own (shared/accounts/<id>);
 * the others share the common one.
 */
export const SYNCED_FILES = ['options.txt', 'servers.dat', 'hotbar.nbt'];

const commonDir = () => path.join(paths.root, 'shared');

/** Where the shared settings of games played as this account are: its own set when picked, else the common one. */
export function sharedDirFor(accountId: string | undefined, ownSets: readonly string[] | undefined): string {
  return accountId && ownSets?.includes(accountId) && /^[\w-]{1,64}$/.test(accountId) ? path.join(commonDir(), 'accounts', accountId) : commonDir();
}

/**
 * An account's own set starts as a copy of the common one (the first time only), so picking an
 * account does not leave its games with no settings; unpicking it keeps its folder for later.
 */
export async function seedShared(dir: string): Promise<void> {
  if (dir === commonDir() || (await fs.stat(dir).catch(() => undefined))) return;
  await fs.mkdir(dir, { recursive: true });
  for (const f of SYNCED_FILES) await fs.copyFile(path.join(commonDir(), f), path.join(dir, f)).catch(() => {});
}

/** One saved server: its address and its tag exactly as the game wrote it (name, icon, resource pack choice). */
interface ServerEntry { ip: string; raw: Buffer }
/** servers.dat read as entries, with where the list sits in the file so it can be replaced as a whole. */
interface ServerList { entries: ServerEntry[]; start?: number; end?: number }

/**
 * Reads servers.dat (uncompressed NBT with a `servers` list). Undefined when the file is empty,
 * cut short (the game crashed while writing it) or not NBT at all: such a file never replaces a good one.
 */
export function readServerList(buf: Buffer): ServerList | undefined {
  try {
    const r = new Reader(buf);
    if (r.byte() !== 10) return undefined;
    r.string();
    const list: ServerList = { entries: [] };
    for (;;) {
      const type = r.byte();
      if (type === 0) break;
      const name = r.string();
      if (type !== 9 || name !== 'servers') {
        r.payload(type);
        continue;
      }
      list.start = r.offset;
      const itemType = r.byte();
      const count = r.int();
      if (count > 0 && itemType !== 10) return undefined;
      for (let i = 0; i < count; i++) {
        const from = r.offset;
        const server = r.payload(10) as Record<string, NbtValue>;
        list.entries.push({ ip: typeof server.ip === 'string' ? server.ip.trim().toLowerCase() : '', raw: buf.subarray(from, r.offset) });
      }
      list.end = r.offset;
    }
    return r.offset <= buf.length ? list : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `top`'s server list with the servers only `base` has added at the end: two synced profiles played
 * at the same time each keep the servers added in them. Undefined when there is nothing to add.
 */
export function mergeServerLists(base: Buffer, top: Buffer): Buffer | undefined {
  const a = readServerList(base);
  const b = readServerList(top);
  if (!a || !b || b.start === undefined || b.end === undefined) return undefined;
  const known = new Set(b.entries.map((e) => e.ip));
  const extra = a.entries.filter((e) => e.ip && !known.has(e.ip));
  if (!extra.length) return undefined;
  const entries = [...b.entries, ...extra];
  const head = Buffer.alloc(5);
  head.writeInt8(10, 0);
  head.writeInt32BE(entries.length, 1);
  return Buffer.concat([top.subarray(0, b.start), head, ...entries.map((e) => e.raw), top.subarray(b.end)]);
}

/** A whole file or nothing: a crash halfway through never leaves a cut-off copy behind. */
async function writeAtomic(to: string, data: Buffer | string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true });
  const tmp = `${to}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, to).catch(async (err) => {
    await fs.rm(tmp, { force: true });
    throw err;
  });
}

interface SyncOptions { mergeServers: boolean; backup: boolean }

/**
 * The binary files (server list, hotbars): an empty or damaged file is skipped, and a server list
 * that lost every server does not empty the one the other profiles have. `mergeServers` keeps the
 * servers another profile added while this one was playing.
 */
async function syncBinary(file: string, from: string, to: string, opts: SyncOptions): Promise<boolean> {
  const data = await fs.readFile(from).catch(() => undefined);
  if (!data?.length) return false;
  const current = await fs.readFile(to).catch(() => undefined);
  let next: Buffer = data;
  if (file === 'servers.dat') {
    const incoming = readServerList(data);
    if (!incoming) return false;
    const existing = current && readServerList(current);
    if (!incoming.entries.length && existing?.entries.length) return false;
    if (opts.mergeServers && current) next = mergeServerLists(current, data) ?? data;
  } else {
    try {
      readNbt(data);
    } catch {
      return false;
    }
  }
  if (current?.equals(next)) return true;
  // the previous shared copy stays next to it: one bad game exit can always be undone by hand
  if (opts.backup && current?.length) await fs.copyFile(to, `${to}.bak`).catch(() => {});
  try {
    await writeAtomic(to, next);
    return true;
  } catch {
    return false;
  }
}

/**
 * options.txt line by line: `top` wins where both have a setting, and what only `base` has stays.
 * The game writes only the keys it knows at that moment (the mods and the version it runs), so a
 * profile without a mod would otherwise wipe that mod's key bindings for every profile.
 */
export function mergeOptions(base: string, top: string): string {
  const lines = (text: string) => text.split(/\r?\n/).filter((l) => l.includes(':'));
  const keyOf = (l: string) => l.slice(0, l.indexOf(':'));
  const topKeys = new Set(lines(top).map(keyOf));
  const kept = lines(base).filter((l) => !topKeys.has(keyOf(l)));
  return [...lines(top), ...kept].join('\n') + '\n';
}

/** Copies a synced file; options.txt is merged into what is there instead of replacing it. */
async function sync(file: string, from: string, to: string, opts: SyncOptions): Promise<boolean> {
  if (file !== 'options.txt') return syncBinary(file, from, to, opts);
  try {
    const top = await fs.readFile(from, 'utf8');
    const base = await fs.readFile(to, 'utf8').catch(() => '');
    const merged = mergeOptions(base, top);
    if (merged === base) return true;
    if (opts.backup && base) await fs.copyFile(to, `${to}.bak`).catch(() => {});
    await writeAtomic(to, merged);
    return true;
  } catch {
    return false;
  }
}

/** Before launch: give the profile the shared settings (if there are any yet). */
export async function pullShared(gameDir: string, dir = commonDir()): Promise<string[]> {
  await seedShared(dir);
  const copied: string[] = [];
  for (const f of SYNCED_FILES) if (await sync(f, path.join(dir, f), path.join(gameDir, f), { mergeServers: false, backup: false })) copied.push(f);
  return copied;
}

/**
 * After the game closes: what the player changed becomes the shared settings for all profiles.
 * `startedAt` is when that game started: a shared server list written after it came from another
 * synced profile played at the same time, so the two lists are merged instead of one replacing the other.
 */
export async function pushShared(gameDir: string, startedAt?: number, dir = commonDir()): Promise<void> {
  for (const f of SYNCED_FILES) {
    const to = path.join(dir, f);
    const changedMeanwhile = startedAt !== undefined && ((await fs.stat(to).catch(() => undefined))?.mtimeMs ?? 0) > startedAt;
    await sync(f, path.join(gameDir, f), to, { mergeServers: changedMeanwhile, backup: true });
  }
}
