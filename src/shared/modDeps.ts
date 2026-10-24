/**
 * What depends on what among a profile's mods, for the Installed list: "Potrzebny dla", the warning
 * before disabling or removing a mod others need, and the libraries left over afterwards. Works on
 * the tree the main process reads from the jars (modcheck.ts buildModGraph), so it is plain logic.
 */

/** How a mod got into the profile: as another mod's dependency, put there by the player, or unknown (older launchers kept no note). */
export type ModOrigin = 'dependency' | 'direct' | 'unknown';

/** One dependency of a mod, as the details of the Installed list show it. */
export interface DepLink {
  id: string;
  /** Allowed versions in the mod's own words ("" = any). */
  ranges: string;
  optional: boolean;
  /** The installed jar that has it (enabled ones first). */
  provider?: string;
  /** ok, missing, the wrong version, or only in a disabled jar. */
  state: 'ok' | 'missing' | 'version' | 'disabled';
}

export interface ModNode {
  /** The jar's name without ".disabled", as in the Installed list. */
  file: string;
  enabled: boolean;
  name: string;
  version: string;
  ids: string[];
  library: boolean;
  origin: ModOrigin;
  requires: DepLink[];
}

/** The mods that list this one among their dependencies ("Potrzebny dla"), required ones first. */
export function neededBy(nodes: ModNode[], file: string): { node: ModNode; optional: boolean }[] {
  const out: { node: ModNode; optional: boolean }[] = [];
  for (const n of nodes) {
    if (n.file === file) continue;
    const links = n.requires.filter((r) => r.provider === file);
    if (links.length) out.push({ node: n, optional: links.every((l) => l.optional) });
  }
  return out.sort((a, b) => Number(a.optional) - Number(b.optional) || a.node.name.localeCompare(b.node.name));
}

const requiresId = (n: ModNode, id: string) => n.requires.some((r) => !r.optional && r.id === id);

/** Is `id` still there, in an enabled jar that is not going away? */
function stillProvided(nodes: ModNode[], id: string, gone: Set<string>): boolean {
  return nodes.some((m) => m.enabled && !gone.has(m.file) && m.ids.includes(id));
}

/**
 * Enabled mods that stop working when `away` is disabled or removed, including those that need a mod
 * that stops working (Fabric API → a library → the mods on that library). What was already broken
 * (a missing or disabled dependency) is not counted again.
 */
export function brokenBy(nodes: ModNode[], away: Iterable<string>): ModNode[] {
  const gone = new Set(away);
  const broken: ModNode[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const n of nodes) {
      if (!n.enabled || gone.has(n.file)) continue;
      const loses = n.requires.some((r) => !r.optional && (r.state === 'ok' || r.state === 'version') && !stillProvided(nodes, r.id, gone));
      if (!loses) continue;
      gone.add(n.file);
      broken.push(n);
      changed = true;
    }
  }
  return broken;
}

export interface Orphan {
  node: ModNode;
  /** Ticked in the list: put there by the launcher as a dependency, and a library. */
  ticked: boolean;
  /** Disabled mods that would still need it if turned back on. */
  neededByDisabled: string[];
}

/**
 * Libraries nothing needs any more once `away` is disabled or removed (and libraries only those
 * needed, and so on). Only what was needed before and is no longer: never a mod the player put there
 * (search, by hand), and a library from an older launcher, which kept no note, comes unticked.
 */
export function orphansAfter(nodes: ModNode[], away: Iterable<string>): Orphan[] {
  const leaving = new Set(away);
  const gone = new Set(leaving);
  const out: Orphan[] = [];
  const neededNow = (lib: ModNode, without: Set<string>) =>
    nodes.some((n) => n !== lib && n.enabled && !without.has(n.file) && lib.ids.some((id) => requiresId(n, id)));
  const neededByLeaving = (lib: ModNode) => nodes.some((n) => leaving.has(n.file) && lib.ids.some((id) => requiresId(n, id)));
  for (let changed = true; changed;) {
    changed = false;
    for (const lib of nodes) {
      if (gone.has(lib.file) || !lib.enabled || lib.origin === 'direct') continue;
      if (lib.origin === 'unknown' && !lib.library) continue;
      const wasNeeded = neededNow(lib, new Set()) || neededByLeaving(lib) || out.some((o) => lib.ids.some((id) => requiresId(o.node, id)));
      if (!wasNeeded || neededNow(lib, gone)) continue;
      const neededByDisabled = nodes.filter((n) => !n.enabled && !leaving.has(n.file) && lib.ids.some((id) => requiresId(n, id))).map((n) => n.name);
      out.push({ node: lib, ticked: lib.origin === 'dependency' && lib.library && !neededByDisabled.length, neededByDisabled });
      gone.add(lib.file);
      changed = true;
    }
  }
  return out;
}

/** The player's answer to "this breaks N mods": stop, go ahead, or take the mods that need it along. */
export type DependantsChoice = 'cancel' | 'anyway' | 'together';

/**
 * What a disable or a removal of `files` really does after the warning: with "together" the mods
 * that need them are disabled as well (never removed: those are the player's own choice).
 * `away` is everything that stops running, for the leftover-library check.
 */
export function planChange(nodes: ModNode[], kind: 'disable' | 'remove', files: string[], choice: Exclude<DependantsChoice, 'cancel'>) {
  const broken = brokenBy(nodes, files).map((n) => n.file);
  const along = choice === 'together' ? broken : [];
  return {
    disable: kind === 'disable' ? [...files, ...along] : along,
    remove: kind === 'remove' ? files : [],
    away: [...files, ...along],
  };
}
