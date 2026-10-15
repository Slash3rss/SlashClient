import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { t } from '../shared/i18n';

/** What a mod jar says about itself: who it is, which loaders it is for and what it needs. */
export interface ModMeta {
  file: string;
  name: string;
  version: string;
  loaders: ('fabric' | 'quilt' | 'forge' | 'neoforge')[];
  /** Its own id, the ids it "provides" and those of the jars bundled inside it. */
  ids: string[];
  /** Versions of the ids above, for checking version ranges of other mods. */
  versions: Record<string, string>;
  depends: Dependency[];
  breaks: Dependency[];
}

export interface Dependency {
  id: string;
  /** Fabric/Quilt: list of ranges (any may match). Forge: one maven range. */
  ranges: string[];
  style: 'semver' | 'maven';
}

export interface ModProblem {
  severity: 'error' | 'warning';
  kind: 'missing' | 'loader' | 'minecraft' | 'version' | 'breaks' | 'duplicate' | 'noloader';
  file: string;
  mod: string;
  message: string;
  /** For missing dependencies: the id to look up on Modrinth. */
  missingId?: string;
}

// ---------- reading metadata ----------

function json(zip: AdmZip, entry: string): any {
  const e = zip.getEntry(entry);
  if (!e) return undefined;
  try {
    // some mods put comments or trailing junk in their JSON; strip line comments as Fabric does
    return JSON.parse(e.getData().toString('utf8').replace(/^\s*\/\/.*$/gm, ''));
  } catch {
    return undefined;
  }
}

/** A tiny TOML reader, enough for mods.toml: [[tables]], key = "string" | number | bool. */
export function parseModsToml(text: string): Record<string, Record<string, string | boolean>[]> {
  const out: Record<string, Record<string, string | boolean>[]> = {};
  let current: Record<string, string | boolean> | undefined;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const table = /^\[\[\s*([^\]]+?)\s*\]\]/.exec(line);
    if (table) {
      current = {};
      (out[table[1]] ??= []).push(current);
      continue;
    }
    if (/^\[[^\[]/.test(line)) {
      current = {};
      continue;
    }
    const kv = /^([\w.-]+)\s*=\s*(.*)$/.exec(line);
    if (!kv || !current) continue;
    let value = kv[2].trim();
    // multi-line strings (descriptions): skip to the closing quotes
    const triple = value.startsWith("'''") ? "'''" : value.startsWith('"""') ? '"""' : undefined;
    if (triple) {
      let body = value.slice(3);
      while (!body.includes(triple) && i + 1 < lines.length) body += `\n${lines[++i]}`;
      current[kv[1]] = body.slice(0, body.indexOf(triple));
      continue;
    }
    const quoted = /^"((?:[^"\\]|\\.)*)"|^'([^']*)'/.exec(value);
    if (quoted) current[kv[1]] = quoted[1] ?? quoted[2];
    else if (value.startsWith('true')) current[kv[1]] = true;
    else if (value.startsWith('false')) current[kv[1]] = false;
    else current[kv[1]] = value.replace(/\s*#.*$/, '');
  }
  return out;
}

const asRanges = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined ? ['*'] : [String(v)]);

function fabricMeta(zip: AdmZip, meta: ModMeta, depth: number) {
  const f = json(zip, 'fabric.mod.json');
  if (!f?.id) return false;
  meta.loaders.push('fabric');
  meta.name ||= f.name ?? f.id;
  meta.version ||= String(f.version ?? '');
  meta.ids.push(f.id, ...((f.provides ?? []) as string[]));
  meta.versions[f.id] = String(f.version ?? '');
  if (depth === 0) {
    for (const [id, range] of Object.entries(f.depends ?? {})) meta.depends.push({ id, ranges: asRanges(range), style: 'semver' });
    for (const [id, range] of Object.entries(f.breaks ?? {})) meta.breaks.push({ id, ranges: asRanges(range), style: 'semver' });
  }
  for (const jar of (f.jars ?? []) as { file: string }[]) nested(zip, jar.file, meta, depth);
  return true;
}

function quiltMeta(zip: AdmZip, meta: ModMeta, depth: number) {
  const q = json(zip, 'quilt.mod.json')?.quilt_loader;
  if (!q?.id) return false;
  meta.loaders.push('quilt');
  meta.name ||= q.metadata?.name ?? q.id;
  meta.version ||= String(q.version ?? '');
  meta.ids.push(q.id, ...((q.provides ?? []) as (string | { id: string })[]).map((p) => (typeof p === 'string' ? p : p.id)));
  meta.versions[q.id] = String(q.version ?? '');
  if (depth === 0) {
    const deps = (list: unknown[] = []) => list.flatMap((d) => {
      if (typeof d === 'string') return [{ id: d, ranges: ['*'], style: 'semver' as const }];
      const o = d as { id?: string; versions?: unknown; optional?: boolean };
      return o.id && !o.optional ? [{ id: o.id, ranges: asRanges(o.versions), style: 'semver' as const }] : [];
    });
    meta.depends.push(...deps(q.depends));
    meta.breaks.push(...deps(q.breaks));
  }
  for (const jar of (q.jars ?? []) as string[]) nested(zip, jar, meta, depth);
  return true;
}

function forgeMeta(zip: AdmZip, meta: ModMeta, depth: number) {
  let found = false;
  for (const [file, loader] of [['META-INF/neoforge.mods.toml', 'neoforge'], ['META-INF/mods.toml', 'forge']] as const) {
    const entry = zip.getEntry(file);
    if (!entry) continue;
    found = true;
    meta.loaders.push(loader);
    const toml = parseModsToml(entry.getData().toString('utf8'));
    for (const mod of toml.mods ?? []) {
      const id = String(mod.modId ?? '');
      if (!id) continue;
      meta.name ||= String(mod.displayName ?? id);
      // "${file.jarVersion}" is filled in from the manifest at runtime; we don't need the exact value
      const version = String(mod.version ?? '');
      meta.version ||= version.startsWith('$') ? '' : version;
      meta.ids.push(id);
      meta.versions[id] = version.startsWith('$') ? '' : version;
      if (depth > 0) continue;
      for (const dep of toml[`dependencies.${id}`] ?? []) {
        const required = dep.type ? String(dep.type).toLowerCase() === 'required' : dep.mandatory === true;
        const incompatible = String(dep.type ?? '').toLowerCase() === 'incompatible';
        const d: Dependency = { id: String(dep.modId ?? ''), ranges: [String(dep.versionRange ?? '')], style: 'maven' };
        if (!d.id) continue;
        if (required) meta.depends.push(d);
        else if (incompatible) meta.breaks.push(d);
      }
    }
  }
  // Jar-in-Jar libraries bundled by Forge/NeoForge mods
  if (found) for (const e of zip.getEntries()) if (/^META-INF\/jarjar\/[^/]+\.jar$/.test(e.entryName)) nested(zip, e.entryName, meta, depth);
  return found;
}

function nested(zip: AdmZip, entry: string, meta: ModMeta, depth: number) {
  if (depth >= 2) return;
  const e = zip.getEntry(entry);
  if (!e) return;
  try {
    const inner = new AdmZip(e.getData());
    const sub: ModMeta = { file: entry, name: '', version: '', loaders: [], ids: [], versions: {}, depends: [], breaks: [] };
    fabricMeta(inner, sub, depth + 1) || quiltMeta(inner, sub, depth + 1) || forgeMeta(inner, sub, depth + 1);
    meta.ids.push(...sub.ids);
    Object.assign(meta.versions, Object.fromEntries(Object.entries(sub.versions).filter(([k]) => !(k in meta.versions))));
  } catch {
    // a broken bundled jar is the mod author's problem, not a reason to stop
  }
}

/** Reads a mod jar; undefined for jars without Fabric, Quilt or Forge metadata (plain libraries). */
export function readModMeta(data: Buffer, file: string): ModMeta | undefined {
  let zip: AdmZip;
  try {
    zip = new AdmZip(data);
  } catch {
    return undefined;
  }
  const meta: ModMeta = { file, name: '', version: '', loaders: [], ids: [], versions: {}, depends: [], breaks: [] };
  quiltMeta(zip, meta, 0);
  fabricMeta(zip, meta, 0);
  forgeMeta(zip, meta, 0);
  if (!meta.loaders.length) return undefined;
  meta.ids = [...new Set(meta.ids.filter(Boolean))];
  meta.name ||= file;
  return meta;
}

// ---------- version ranges ----------

/** "1.21.4", "0.9.2+mc1.21", "26.1-rc1" → numbers of the core part, and whether it is a pre-release. */
function parseVersion(v: string): { parts: number[]; pre: boolean } | undefined {
  const core = v.trim().replace(/^v/i, '').split('+')[0];
  const m = /^(\d+(?:\.\d+)*)(-.+)?$/.exec(core);
  if (!m) return undefined;
  return { parts: m[1].split('.').map(Number), pre: !!m[2] };
}

function compare(a: string, b: string): number | undefined {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return undefined;
  for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return x.pre === y.pre ? 0 : x.pre ? -1 : 1;
}

/** One Fabric-style predicate set ("&gt;=1.21 &lt;1.22", "~1.21.1", "1.21.x", "*"); undefined = can't tell. */
function semverMatch(version: string, range: string): boolean | undefined {
  const preds = range.trim().split(/\s+/).filter(Boolean);
  if (!preds.length) return true;
  let unknown = false;
  for (const p of preds) {
    if (p === '*' || p === 'x' || p === 'X') continue;
    const m = /^(>=|<=|>|<|=|~|\^)?(.+)$/.exec(p)!;
    const [, op = ''] = m;
    // "1.21.2-" means "1.21.2 including its pre-releases"
    const target = m[2].replace(/-$/, '');
    if (/[.-][xX*]$|^[xX*]$/.test(target) || /\.[xX*]\./.test(target)) {
      const prefix = target.replace(/([.-])?[xX*].*$/, '');
      const v = parseVersion(version);
      const pr = parseVersion(prefix);
      if (!v || !pr) { unknown = true; continue; }
      if (!pr.parts.every((n, i) => v.parts[i] === n)) return false;
      continue;
    }
    const c = compare(version, target);
    if (c === undefined) { unknown = true; continue; }
    const t = parseVersion(target)!;
    const ok =
      op === '>=' ? c >= 0
      : op === '<=' ? c <= 0
      : op === '>' ? c > 0
      : op === '<' ? c < 0
      : op === '~' ? c >= 0 && compare(version, `${t.parts[0]}.${(t.parts[1] ?? 0) + 1}`)! < 0
      : op === '^' ? c >= 0 && compare(version, `${t.parts[0] + 1}`)! < 0
      : c === 0;
    if (!ok) return false;
  }
  return unknown ? undefined : true;
}

/** Maven ranges: "[1.21,1.22)", "[47,)", "(,2]", "[1.21.1]"; a bare version means "any". */
function mavenMatch(version: string, range: string): boolean | undefined {
  const r = range.trim();
  if (!r || r === '*' || !/[[(]/.test(r)) return true;
  const re = /([[(])\s*([^,\])]*?)\s*(?:,\s*([^\])]*?)\s*)?([\])])/g;
  let any = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(r))) {
    any = true;
    const [, open, lo, hiRaw, close] = m;
    const exact = hiRaw === undefined;
    const hi = exact ? lo : hiRaw;
    const a = lo ? compare(version, lo) : 1;
    const b = hi ? compare(version, hi) : -1;
    if (a === undefined || b === undefined) return undefined;
    const lowOk = !lo || (open === '[' ? a >= 0 : a > 0);
    const highOk = !hi || (close === ']' ? b <= 0 : b < 0);
    if (lowOk && highOk) return true;
  }
  return any ? false : undefined;
}

/** Does `version` satisfy the dependency? undefined when the range or version can't be read. */
export function satisfies(version: string, dep: Pick<Dependency, 'ranges' | 'style'>): boolean | undefined {
  let unknown = false;
  for (const range of dep.ranges) {
    const r = dep.style === 'maven' ? mavenMatch(version, range) : semverMatch(version, range);
    if (r === true) return true;
    if (r === undefined) unknown = true;
  }
  return unknown ? undefined : false;
}

// ---------- the check ----------

/** Provided by the game or the loader itself, never a missing mod. */
const BUILTIN = new Set(['minecraft', 'java', 'fabricloader', 'fabric-loader', 'quilt_loader', 'forge', 'neoforge', 'javafml', 'lowcodefml', 'mixinextras', 'quilt_base']);

const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

/** Which mod loaders can run a jar in a profile with this loader. */
function runsOn(profileLoader: string): string[] {
  if (profileLoader === 'quilt') return ['quilt', 'fabric'];
  return [profileLoader];
}

export function checkMods(mods: ModMeta[], profileLoader: string, gameVersion: string): ModProblem[] {
  const problems: ModProblem[] = [];
  if (!mods.length) return problems;
  if (profileLoader === 'vanilla') {
    return [{ severity: 'warning', kind: 'noloader', file: '', mod: '', message: t('Profil nie ma mod loadera, więc gra nie wczyta żadnego z {0} modów. Ustaw Fabric, Quilt, Forge albo NeoForge w zakładce Profile.', mods.length) }];
  }
  const usable = runsOn(profileLoader);
  const active = mods.filter((m) => m.loaders.some((l) => usable.includes(l)));
  for (const m of mods) {
    if (active.includes(m)) continue;
    const forgeOnNeo = profileLoader === 'neoforge' && m.loaders.includes('forge');
    problems.push({
      severity: forgeOnNeo ? 'warning' : 'error', kind: 'loader', file: m.file, mod: m.name,
      message: t('{0} jest dla {1}, a profil używa {2}.', m.name, m.loaders.map((l) => LOADER_NAMES[l]).join('/'), LOADER_NAMES[profileLoader] ?? profileLoader),
    });
  }

  const provided = new Map<string, ModMeta>();
  for (const m of active) for (const id of m.ids) if (!provided.has(id)) provided.set(id, m);
  const versionOf = (id: string) => provided.get(id)?.versions[id] || provided.get(id)?.version || '';
  const knownGameVersion = /^\d+(\.\d+)+$/.test(gameVersion);

  // the same mod twice (e.g. two Sodium jars): Fabric refuses to start
  const owners = new Map<string, ModMeta>();
  for (const m of active) {
    const id = m.ids[0];
    const first = owners.get(id);
    if (first) problems.push({ severity: 'error', kind: 'duplicate', file: m.file, mod: m.name, message: t('{0} jest zainstalowany dwa razy: {1} i {2}.', m.name, first.file, m.file) });
    else owners.set(id, m);
  }

  for (const m of active) {
    for (const dep of m.depends) {
      if (dep.id === 'minecraft') {
        if (knownGameVersion && satisfies(gameVersion, dep) === false) {
          problems.push({ severity: 'error', kind: 'minecraft', file: m.file, mod: m.name, message: t('{0} nie działa z Minecraft {1} (wymaga {2}).', m.name, gameVersion, dep.ranges.join(' / ')) });
        }
        continue;
      }
      if (BUILTIN.has(dep.id)) continue;
      if (!provided.has(dep.id)) {
        problems.push({ severity: 'error', kind: 'missing', file: m.file, mod: m.name, missingId: dep.id, message: t('{0} wymaga moda {1}, którego brakuje.', m.name, dep.id) });
        continue;
      }
      const have = versionOf(dep.id);
      if (have && satisfies(have, dep) === false) {
        problems.push({ severity: 'warning', kind: 'version', file: m.file, mod: m.name, message: t('{0} wymaga {1} w wersji {2}, a jest {3}.', m.name, provided.get(dep.id)!.name, dep.ranges.join(' / '), have) });
      }
    }
    for (const dep of m.breaks) {
      const other = provided.get(dep.id);
      if (!other || other === m) continue;
      const have = versionOf(dep.id);
      if (!have || satisfies(have, dep) !== false) {
        problems.push({ severity: 'error', kind: 'breaks', file: m.file, mod: m.name, message: t('{0} nie działa razem z {1}.', m.name, other.name) });
      }
    }
  }
  // one line per missing mod is enough, even if several mods need it
  const seen = new Set<string>();
  return problems.filter((p) => {
    const key = p.kind === 'missing' ? `missing:${p.missingId}` : `${p.kind}:${p.file}:${p.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Every mod id found in mods/ (enabled or not), for "is this already installed?" questions. */
export async function installedModIds(gameDir: string): Promise<Set<string>> {
  const dir = path.join(gameDir, 'mods');
  const ids = new Set<string>();
  for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!/\.jar(\.disabled)?$/.test(f)) continue;
    const meta = readModMeta(await fs.readFile(path.join(dir, f)), f);
    meta?.ids.forEach((id) => ids.add(id));
  }
  return ids;
}

/** Reads every enabled jar in mods/ and checks them together. */
export async function checkModsFolder(gameDir: string, profileLoader: string, gameVersion: string): Promise<ModProblem[]> {
  const dir = path.join(gameDir, 'mods');
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.jar'));
  const mods: ModMeta[] = [];
  for (const f of files) {
    const meta = readModMeta(await fs.readFile(path.join(dir, f)), f);
    if (meta) mods.push(meta);
  }
  return checkMods(mods, profileLoader, gameVersion);
}
