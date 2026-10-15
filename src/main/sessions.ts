import fs from 'node:fs/promises';
import path from 'node:path';

/** Where the player was last: a server (to rejoin) or a singleplayer world (to reopen). */
export type LastTarget =
  | { kind: 'server'; address: string }
  | { kind: 'world'; folder: string; name: string };

/** "[12:00:00] [Render thread/INFO]: Connecting to skyup.pl, 25565" → "skyup.pl" (port only when not 25565). */
export function serverFromLog(line: string): string | undefined {
  const m = line.match(/Connecting to ([^,\s]+), (\d+)/);
  if (!m) return undefined;
  return m[2] === '25565' ? m[1] : `${m[1]}:${m[2]}`;
}

/**
 * The world played in this session: the one whose level.dat was saved after the
 * session started (the game saves it on exit and every few minutes).
 */
export async function worldPlayedSince(gameDir: string, since: number): Promise<{ folder: string; savedAt: number } | undefined> {
  const saves = path.join(gameDir, 'saves');
  let best: { folder: string; savedAt: number } | undefined;
  for (const entry of await fs.readdir(saves, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const stat = await fs.stat(path.join(saves, entry.name, 'level.dat')).catch(() => undefined);
    if (stat && stat.mtimeMs >= since && (!best || stat.mtimeMs > best.savedAt)) best = { folder: entry.name, savedAt: stat.mtimeMs };
  }
  return best;
}

/** Decides where the player was last: whichever of "joined a server" and "saved a world" happened later. */
export function lastTarget(
  server: { address: string; at: number } | undefined,
  world: { folder: string; name: string; savedAt: number } | undefined,
): LastTarget | undefined {
  if (world && (!server || world.savedAt > server.at)) return { kind: 'world', folder: world.folder, name: world.name };
  if (server) return { kind: 'server', address: server.address };
  return undefined;
}
