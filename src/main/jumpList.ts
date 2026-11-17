// Windows' jump list: the launcher's recent profiles and servers in the Start menu's search pane and on the taskbar
// button's right-click menu (as VS Code has its recent folders). A click starts the launcher (or brings the open one
// to the front) with `--play=<profile id>` and maybe `--server=<address>`, and the profile starts as from Play.
import type { Profile } from './store';
import type { SessionRecord } from './stats';

export const MAX_RECENT = 5;
const SERVER_ADDRESS = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/** What a click asks for: the profile to start, and the server it joins. */
export interface JumpTarget { profileId: string; server?: string }

/** The target in a launcher's command line (the jump list's arguments), or undefined when there is none. */
export function jumpTarget(argv: string[]): JumpTarget | undefined {
  const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const profileId = value('play');
  if (!profileId || !/^[\w-]{1,80}$/.test(profileId)) return undefined;
  const server = value('server');
  return server && SERVER_ADDRESS.test(server) ? { profileId, server } : { profileId };
}

export interface JumpEntry { title: string; description: string; args: string }
export interface JumpLists { profiles: JumpEntry[]; servers: JumpEntry[] }

/**
 * The recent profiles (by when last played) and the recent servers (with the profile last played on each, still
 * there), newest first; the entries the player removed from the list (by their arguments) are left out, as Windows
 * refuses a list that has them back.
 */
export function jumpLists(profiles: Pick<Profile, 'id' | 'name' | 'versionId' | 'lastPlayedAt'>[], sessions: Pick<SessionRecord, 'profileId' | 'servers'>[],
  removed: Set<string>, texts: { profile: (versionId: string) => string; server: (profile: string) => string }): JumpLists {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const out: JumpLists = { profiles: [], servers: [] };
  for (const p of profiles.filter((x) => x.lastPlayedAt).sort((a, b) => b.lastPlayedAt! - a.lastPlayedAt!)) {
    const args = `--play=${p.id}`;
    if (removed.has(args)) continue;
    out.profiles.push({ title: p.name, description: texts.profile(p.versionId), args });
    if (out.profiles.length >= MAX_RECENT) break;
  }
  // a server played from several profiles gets an entry for each, with the profile's name in the title,
  // so the player sees which one starts
  const last = new Map<string, { at: number; address: string; profileId: string }>();
  for (const s of sessions) {
    if (!byId.has(s.profileId)) continue;
    for (const j of s.servers ?? []) {
      const address = String(j?.address ?? '').trim().toLowerCase().replace(/:25565$/, '');
      const key = `${address} ${s.profileId}`;
      if (!SERVER_ADDRESS.test(address) || !(j.at > (last.get(key)?.at ?? 0))) continue;
      last.set(key, { at: j.at, address, profileId: s.profileId });
    }
  }
  const recent: { address: string; profileId: string; args: string }[] = [];
  for (const l of [...last.values()].sort((a, b) => b.at - a.at)) {
    const args = `--play=${l.profileId} --server=${l.address}`;
    if (removed.has(args)) continue;
    recent.push({ ...l, args });
    if (recent.length >= MAX_RECENT) break;
  }
  const profilesOn = (address: string) => new Set(recent.filter((r) => r.address === address).map((r) => r.profileId)).size;
  for (const r of recent) {
    const profile = byId.get(r.profileId)!.name;
    out.servers.push({ title: profilesOn(r.address) > 1 ? `${r.address} · ${profile}` : r.address, description: texts.server(profile), args: r.args });
  }
  return out;
}
