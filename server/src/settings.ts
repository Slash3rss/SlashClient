import type { DatabaseSync } from 'node:sqlite';
import type { SecretBox } from './storage.ts';

/**
 * The server's settings an admin may change in the panel ("Ustawienia"), in one registry: each has
 * a typed definition (settingsDefs.ts) with its default, bounds and a description, and only what
 * an admin changed is kept in the database (app_settings). Reads go through an in-memory copy, so
 * a change applies at once, without a restart, wherever the code reads the setting when it needs it.
 *
 * The default of a setting is, in order: what the server's configuration says (an environment
 * variable or the app's config, as before the registry; tests lower limits this way), else the
 * definition's default, which equals the constant the code had before. So nothing changes until an
 * admin saves a different value; "przywróć domyślne" deletes the row and the default applies again.
 *
 * A 'secret' (an API key) is write-only: sealed with STORAGE_SECRET_KEY (storage.ts's box) in the
 * database, never sent back to the panel (only whether it is set) and never written to the log.
 */

export type SettingType = 'int' | 'float' | 'bool' | 'string' | 'enum' | 'duration' | 'bytes' | 'list' | 'datetime' | 'url' | 'secret';
export type SettingValue = number | boolean | string | string[];
export type SettingCategory =
  | 'features' | 'banner' | 'chat' | 'chatKeys' | 'media' | 'chatMedia' | 'cloud' | 'clans' | 'groups' | 'communities' | 'sparks' | 'support' | 'profiles' | 'security' | 'storage' | 'moderation' | 'streams' | 'servers'
  | 'suggestions' | 'push' | 'gifs' | 'friendsPopular';

export interface SettingDef {
  key: string;
  category: SettingCategory;
  label: string;
  labelEn: string;
  description: string;
  descriptionEn?: string;
  type: SettingType;
  default: SettingValue;
  /** Bounds of a number (bytes, durations and datetimes too). */
  min?: number;
  max?: number;
  /** What a number counts, as the panel shows it ('dni', 'min', 's', '/min'…); bytes are shown in MB or KB. */
  unit?: string;
  /** For bytes: the unit the panel edits them in. */
  bytesUnit?: 'MB' | 'KB';
  options?: string[];
  /** Longest text, or longest entry of a list. */
  maxLength?: number;
  maxItems?: number;
  /** A list kept in lower case (word lists). */
  lower?: boolean;
  /** Applies only after the server restarts. */
  restart?: boolean;
  /** The panel asks again before saving (legal promises, things that can lock players out). */
  risky?: boolean;
  /** The environment variable that sets its default on this server, when there is one. */
  env?: string;
}

export class SettingError extends Error {
  readonly key: string;
  constructor(key: string, code: string) {
    super(code);
    this.key = key;
  }
}

export interface SettingChange { key: string; old: SettingValue; new: SettingValue; reset: boolean }

const SCHEMA = `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL DEFAULT ''
)`;

const same = (a: SettingValue, b: SettingValue) => JSON.stringify(a) === JSON.stringify(b);

/** A value from the panel (or the database) checked against its definition; throws SettingError with a code the panel shows. */
export function validateSetting(def: SettingDef, raw: unknown): SettingValue {
  const bad = (code = 'setting_invalid'): never => {
    throw new SettingError(def.key, code);
  };
  switch (def.type) {
    case 'bool':
      if (typeof raw !== 'boolean') bad();
      return raw as boolean;
    case 'int':
    case 'duration':
    case 'bytes':
    case 'datetime':
    case 'float': {
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof n !== 'number' || !Number.isFinite(n)) bad();
      const v = def.type === 'float' ? Math.round((n as number) * 1000) / 1000 : (n as number);
      if (def.type !== 'float' && !Number.isSafeInteger(v)) bad();
      if (def.min !== undefined && v < def.min) bad('setting_too_small');
      if (def.max !== undefined && v > def.max) bad('setting_too_big');
      return v;
    }
    case 'enum':
      if (typeof raw !== 'string' || !def.options?.includes(raw)) bad();
      return raw as string;
    case 'secret': {
      if (typeof raw !== 'string') bad();
      const s = (raw as string).replace(/[\u0000-\u001f\u007f]/g, '').trim();
      if (s.length > (def.maxLength ?? 500)) bad('setting_too_long');
      return s;
    }
    case 'string':
    case 'url': {
      if (typeof raw !== 'string') bad();
      const s = (raw as string).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      if (s.length > (def.maxLength ?? 500)) bad('setting_too_long');
      // a link: only http(s), or a path on this site
      if (def.type === 'url' && s && !/^(https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']*)$/i.test(s)) bad('setting_bad_url');
      return s;
    }
    case 'list': {
      const items = typeof raw === 'string' ? raw.split(/[\n,]/) : raw;
      if (!Array.isArray(items)) bad();
      const out: string[] = [];
      for (const it of items as unknown[]) {
        if (typeof it !== 'string') bad();
        let s = (it as string).replace(/[\u0000-\u001f\u007f]/g, '').trim();
        if (def.lower) s = s.toLowerCase();
        if (!s) continue;
        if (s.length > (def.maxLength ?? 64)) bad('setting_too_long');
        if (!out.includes(s)) out.push(s);
      }
      if (out.length > (def.maxItems ?? 500)) bad('setting_too_many');
      return out;
    }
  }
}

export class Settings {
  readonly defs: ReadonlyMap<string, SettingDef>;
  private readonly sql: DatabaseSync;
  private readonly base = new Map<string, SettingValue>();
  /** The admin's values (only those), as checked; filled once and kept in step by set(). */
  private overrides = new Map<string, { value: SettingValue; at: number; by: string }>();
  private readonly listeners: ((changes: SettingChange[]) => void)[] = [];
  /** Seals the secrets (STORAGE_SECRET_KEY); without it secrets cannot be saved. */
  private readonly box?: SecretBox;

  /**
   * `base`: the server's own defaults for some keys (environment variables, the app's config);
   * undefined entries are left out. A base value outside the bounds is still taken (tests set tiny limits).
   */
  constructor(sql: DatabaseSync, defs: SettingDef[], base: Record<string, SettingValue | undefined> = {}, box?: SecretBox) {
    this.sql = sql;
    this.box = box;
    this.defs = new Map(defs.map((d) => [d.key, d]));
    for (const [k, v] of Object.entries(base)) if (v !== undefined && this.defs.has(k)) this.base.set(k, v);
    sql.exec(SCHEMA);
    this.reload();
  }

  /** Reads the admin's values again from the database (one that no longer passes its definition is ignored). */
  reload() {
    const next = new Map<string, { value: SettingValue; at: number; by: string }>();
    for (const r of this.sql.prepare('SELECT key, value, updated_at AS at, updated_by AS by FROM app_settings').all() as { key: string; value: string; at: number; by: string }[]) {
      const def = this.defs.get(r.key);
      if (!def) continue;
      try {
        let raw = JSON.parse(r.value);
        if (def.type === 'secret') {
          // without the key (or with another one) the secret is as if unset
          if (!this.box) continue;
          raw = this.box.open(raw, `setting:${r.key}`);
        }
        next.set(r.key, { value: validateSetting(def, raw), at: r.at, by: r.by });
      } catch {
        // a value an older or newer definition allowed: the default applies
      }
    }
    this.overrides = next;
  }

  defaultOf(key: string): SettingValue {
    const def = this.defs.get(key);
    if (!def) throw new Error(`unknown setting ${key}`);
    return this.base.get(key) ?? def.default;
  }

  get(key: string): SettingValue {
    return this.overrides.get(key)?.value ?? this.defaultOf(key);
  }

  num(key: string): number {
    return this.get(key) as number;
  }

  bool(key: string): boolean {
    return this.get(key) as boolean;
  }

  str(key: string): string {
    return this.get(key) as string;
  }

  list(key: string): string[] {
    return this.get(key) as string[];
  }

  isOverridden(key: string): boolean {
    return this.overrides.has(key);
  }

  /** Called after every saved change (rate limiters, caches, players' launchers told). */
  onChange(fn: (changes: SettingChange[]) => void) {
    this.listeners.push(fn);
  }

  /**
   * Saves several values at once (a group in the panel): all are checked first, nothing is saved
   * when one is wrong. null (or a value equal to the default) goes back to the default.
   * Returns only what really changed.
   */
  set(values: Record<string, unknown>, by: string, now = Date.now()): SettingChange[] {
    const planned: { key: string; value: SettingValue | null }[] = [];
    for (const [key, raw] of Object.entries(values)) {
      const def = this.defs.get(key);
      if (!def) throw new SettingError(key, 'setting_unknown');
      if (raw === null) {
        planned.push({ key, value: null });
        continue;
      }
      const value = validateSetting(def, raw);
      planned.push({ key, value: same(value, this.defaultOf(key)) ? null : value });
    }
    const changes: SettingChange[] = [];
    this.sql.exec('BEGIN');
    try {
      for (const { key, value } of planned) {
        const old = this.get(key);
        if (value === null) {
          if (!this.overrides.has(key)) continue;
          this.sql.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
          this.overrides.delete(key);
          changes.push({ key, old, new: this.defaultOf(key), reset: true });
          continue;
        }
        if (this.overrides.has(key) && same(this.overrides.get(key)!.value, value)) continue;
        const def = this.defs.get(key)!;
        if (def.type === 'secret' && !this.box) throw new SettingError(key, 'setting_no_secret_key');
        const stored = def.type === 'secret' ? this.box!.seal(value as string, `setting:${key}`) : value;
        this.sql.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(key, JSON.stringify(stored), now, by);
        this.overrides.set(key, { value, at: now, by });
        if (!same(old, value)) changes.push({ key, old, new: value, reset: false });
      }
      this.sql.exec('COMMIT');
    } catch (err) {
      this.sql.exec('ROLLBACK');
      this.reload();
      throw err;
    }
    if (changes.length) for (const fn of this.listeners) {
      try {
        fn(changes);
      } catch (err) {
        console.error('ustawienia:', (err as Error).message);
      }
    }
    return changes;
  }

  /** Everything for the panel: the definitions with the value now, the default and who changed it. */
  view() {
    return [...this.defs.values()].map((d) => {
      const o = this.overrides.get(d.key);
      // a secret: only whether it is set
      if (d.type === 'secret') return { ...d, value: '', default: '', codeDefault: '', secretSet: !!this.get(d.key), overridden: !!o, updatedAt: o?.at ?? null, updatedBy: o?.by ?? null };
      return { ...d, value: this.get(d.key), default: this.defaultOf(d.key), codeDefault: d.default, overridden: !!o, updatedAt: o?.at ?? null, updatedBy: o?.by ?? null };
    });
  }
}

/**
 * A module's limits object whose every field is read when used: `over`'s field when set (a live
 * object from `liveSettings`, or a test's plain numbers), else the module's default. Spreading it
 * (`{ ...limits }`) takes the values of that moment.
 */
export function withDefaults<T extends object>(defaults: T, over?: Partial<T>): T {
  const out = {} as T;
  for (const k of Object.keys(defaults) as (keyof T)[]) {
    Object.defineProperty(out, k, {
      enumerable: true,
      get: () => {
        const v = over?.[k];
        return v === undefined ? defaults[k] : v;
      },
    });
  }
  return out;
}

/** An object whose fields read settings when used: { maxBytes: 'cloud.maxBytes', … }. */
export function liveSettings<T extends Record<string, SettingValue>>(settings: Settings, keys: { [K in keyof T]: string }): T {
  const out = {} as T;
  for (const [field, key] of Object.entries(keys)) {
    Object.defineProperty(out, field, { enumerable: true, get: () => settings.get(key) });
  }
  return out;
}

/** Bytes as the panel shows them in the audit log: 10 MB, 32 KB. */
export function formatSetting(def: SettingDef | undefined, v: SettingValue): string {
  if (def?.type === 'secret') return v ? '(ukryty)' : '—';
  if (Array.isArray(v)) return v.length > 6 ? `${v.slice(0, 6).join(', ')}… (${v.length})` : v.join(', ') || '—';
  if (typeof v === 'boolean') return v ? 'tak' : 'nie';
  if (def?.type === 'bytes' && typeof v === 'number') return def.bytesUnit === 'KB' ? `${Math.round((v / 1024) * 100) / 100} KB` : `${Math.round((v / 1024 / 1024) * 100) / 100} MB`;
  if (def?.type === 'datetime' && typeof v === 'number') return v ? new Date(v).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';
  if (typeof v === 'string') return v ? `„${v.length > 60 ? `${v.slice(0, 60)}…` : v}”` : '—';
  return `${v}${def?.unit ? ` ${def.unit}` : ''}`;
}
