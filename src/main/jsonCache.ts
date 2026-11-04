import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchJson } from './download';
import { paths } from './paths';

/** Where the lists from the internet are kept between starts (loader versions, Mojang's Java index). */
export const jsonCacheDir = () => path.join(paths.root, 'cache', 'meta');

/**
 * A list from the internet that changes rarely, kept on disk: a Play click within `maxAgeMs` of the last
 * one asks nothing, and without a network the last copy is used, so a game that is all installed starts
 * offline. Only a list that came whole and parsed is kept; with neither network nor copy the error stays.
 */
export async function cachedJson<T>(url: string, name: string, maxAgeMs: number, deps: { fetch?: (url: string) => Promise<T>; dir?: string; now?: () => number } = {}): Promise<T> {
  const dir = deps.dir ?? jsonCacheDir();
  const file = path.join(dir, `${name.replace(/[^\w.-]/g, '_')}.json`);
  const now = deps.now?.() ?? Date.now();
  const kept = await readKept<T>(file);
  if (kept && now - kept.at >= 0 && now - kept.at < maxAgeMs) return kept.data;
  let data: T;
  try {
    data = await (deps.fetch ?? fetchJson<T>)(url);
  } catch (err) {
    if (kept) return kept.data;
    throw err;
  }
  // written next to it, then renamed: a launcher closed halfway never leaves half a file
  try {
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ at: now, url, data }));
    await fs.rename(tmp, file);
  } catch {
    // no copy this time: the next click asks again
  }
  return data;
}

async function readKept<T>(file: string): Promise<{ at: number; data: T } | undefined> {
  try {
    const kept = JSON.parse(await fs.readFile(file, 'utf8')) as { at?: unknown; data?: T };
    return typeof kept.at === 'number' && kept.data !== undefined ? { at: kept.at, data: kept.data } : undefined;
  } catch {
    return undefined;
  }
}
