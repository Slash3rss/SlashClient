import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { SettingDef } from './settings.ts';

/**
 * The shared SkyUp fish atlas, seen only in the admin panel ("Atlas ryb"): what players caught of
 * each species, their records and the single catches, put together from everyone's atlas.
 *
 * What the game sends (POST /v1/mc/fish-atlas, through the launcher, at most every few minutes after
 * the atlas changed): each species' summary as the fisherman's "Moje okazy" window shows it (how
 * many caught, the weight and price records, the species' largest weight, its fun fact) and the
 * catches it has not sent yet (time, weight, size, quality, price). Players see nothing new. With the
 * switch off the server answers `enabled: false` and the game stops sending for the session; older
 * launchers do not let the route through and older mods send nothing.
 */

export const FISH_ATLAS_SETTING_DEFS: SettingDef[] = ([
  { key: 'fishAtlas.enabled', label: 'Zbieranie atlasu ryb', labelEn: 'Collect fish atlases', description: 'Mod wysyła atlas ryb SkyUp (rekordy i pojedyncze połowy), widoczny tylko w panelu admina (Atlas ryb). Wyłączone: gra przestaje wysyłać, zebrane dane zostają.', type: 'bool', default: true },
  { key: 'fishAtlas.uploadsPerMinute', label: 'Wysyłki atlasu na minutę', labelEn: 'Atlas uploads per minute', description: 'Na konto: gra wysyła atlas po zmianie, najwyżej co kilka minut (duży atlas w kilku częściach).', type: 'int', default: 12, min: 1, max: 600, unit: '/min' },
  { key: 'fishAtlas.maxCatches', label: 'Najwięcej połowów w jednej wysyłce', labelEn: 'Most catches per upload', description: 'Reszta jest pomijana (gra i tak wysyła je w częściach).', type: 'int', default: 200, min: 1, max: 2000 },
  { key: 'fishAtlas.keepPerSpecies', label: 'Połowy gracza na gatunek', labelEn: 'Catches kept per player and species', description: 'Starsze połowy gracza danego gatunku ponad tę liczbę są usuwane.', type: 'int', default: 500, min: 10, max: 100_000 },
] as Omit<SettingDef, 'category'>[]).map((d) => ({ ...d, category: 'fishAtlas' as const }));

export interface FishAtlasSettings { enabled: boolean; maxCatches: number; keepPerSpecies: number }

export interface SpeciesSummary { key: string; name: string; caught: number; recordGrams: number; recordSize: string; recordPrice: number; maxGrams: number; fact: string }
export interface FishCatch { species: string; at: number; grams: number; size: string; quality: string; price: number }

/** SkyAtlas.key(name): lower case, no Polish letters, no spaces. */
export const SPECIES_KEY = /^[a-z0-9]{1,48}$/;
const MAX_GRAMS = 10_000_000;
const MAX_PRICE = 1e9;
/** Catches from before SkyUp's fishing (and the atlas) are not real. */
const FIRST_CATCH = Date.UTC(2025, 0, 1);

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

/** An upload, cleaned: an entry with anything odd is dropped; past the limit the rest is dropped. */
export function cleanUpload(raw: Record<string, unknown>, s: Pick<FishAtlasSettings, 'maxCatches'>, now = Date.now()) {
  const species = new Map<string, SpeciesSummary>();
  for (const r of Array.isArray(raw.species) ? raw.species : []) {
    if (species.size >= 500) break;
    const f = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (typeof f.key !== 'string' || !SPECIES_KEY.test(f.key)) continue;
    const name = text(f.name, 48);
    const caught = num(f.caught, 10_000_000), recordGrams = num(f.recordGrams, MAX_GRAMS), recordPrice = num(f.recordPrice, MAX_PRICE), maxGrams = num(f.maxGrams, MAX_GRAMS);
    if (!name || caught === null || recordGrams === null || recordPrice === null || maxGrams === null) continue;
    species.set(f.key, { key: f.key, name, caught: Math.floor(caught), recordGrams, recordSize: text(f.recordSize, 32), recordPrice, maxGrams, fact: text(f.fact, 600) });
  }
  const catches: FishCatch[] = [];
  for (const r of Array.isArray(raw.catches) ? raw.catches : []) {
    if (catches.length >= s.maxCatches) break;
    const c = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (typeof c.species !== 'string' || !SPECIES_KEY.test(c.species)) continue;
    const at = num(c.at, now + 86_400_000), grams = num(c.grams, MAX_GRAMS);
    // -1: the price was not known
    const price = c.price === -1 ? -1 : num(c.price, MAX_PRICE);
    if (at === null || at < FIRST_CATCH || grams === null || price === null) continue;
    catches.push({ species: c.species, at: Math.floor(at), grams, size: text(c.size, 32), quality: text(c.quality, 32), price });
  }
  return { species: [...species.values()], catches };
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' });

/** Everyone's atlas rows and catches. */
export class FishAtlasStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS fish_atlas (
  uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, species TEXT NOT NULL, name TEXT NOT NULL,
  caught INTEGER NOT NULL DEFAULT 0, record_grams REAL NOT NULL DEFAULT 0, record_size TEXT NOT NULL DEFAULT '',
  record_price REAL NOT NULL DEFAULT 0, max_grams REAL NOT NULL DEFAULT 0, fact TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL,
  PRIMARY KEY (uuid, species));
CREATE TABLE IF NOT EXISTS fish_catches (
  uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, species TEXT NOT NULL, at INTEGER NOT NULL,
  grams REAL NOT NULL, size TEXT NOT NULL DEFAULT '', quality TEXT NOT NULL DEFAULT '', price REAL NOT NULL DEFAULT -1,
  PRIMARY KEY (uuid, species, at));
CREATE INDEX IF NOT EXISTS fish_catches_species ON fish_catches (species, grams);`);
  }

  /** The player's summaries in place of the old ones, and their new catches (ones already there stay). */
  save(uuid: string, upload: ReturnType<typeof cleanUpload>, keepPerSpecies: number, now = Date.now()) {
    this.sql.exec('BEGIN');
    try {
      const put = this.sql.prepare(`INSERT INTO fish_atlas (uuid, species, name, caught, record_grams, record_size, record_price, max_grams, fact, at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (uuid, species) DO UPDATE SET name = excluded.name, caught = excluded.caught,
        record_grams = excluded.record_grams, record_size = excluded.record_size, record_price = excluded.record_price,
        max_grams = excluded.max_grams, fact = excluded.fact, at = excluded.at`);
      for (const f of upload.species) put.run(uuid, f.key, f.name, f.caught, f.recordGrams, f.recordSize, f.recordPrice, f.maxGrams, f.fact, now);
      const add = this.sql.prepare('INSERT OR IGNORE INTO fish_catches (uuid, species, at, grams, size, quality, price) VALUES (?, ?, ?, ?, ?, ?, ?)');
      let added = 0;
      for (const c of upload.catches) added += Number(add.run(uuid, c.species, c.at, c.grams, c.size, c.quality, c.price).changes);
      const trim = this.sql.prepare(`DELETE FROM fish_catches WHERE uuid = ? AND species = ? AND at NOT IN
        (SELECT at FROM fish_catches WHERE uuid = ? AND species = ? ORDER BY at DESC LIMIT ?)`);
      for (const species of new Set(upload.catches.map((c) => c.species))) trim.run(uuid, species, uuid, species, keepPerSpecies);
      this.sql.exec('COMMIT');
      return added;
    } catch (err) {
      this.sql.exec('ROLLBACK');
      throw err;
    }
  }

  /** Every species anyone has, with the totals the panel's table shows. */
  list() {
    const rows = this.sql.prepare(`SELECT a.species, a.name, a.caught, a.record_grams, a.record_price, a.max_grams, a.fact, a.at, u.handle
      FROM fish_atlas a LEFT JOIN users u ON u.uuid = a.uuid`).all() as {
      species: string; name: string; caught: number; record_grams: number; record_price: number; max_grams: number; fact: string; at: number; handle: string | null;
    }[];
    const stats = new Map((this.sql.prepare(`SELECT species, COUNT(*) AS n, AVG(grams) AS grams, AVG(CASE WHEN price >= 0 THEN price END) AS price, MAX(at) AS at
      FROM fish_catches GROUP BY species`).all() as { species: string; n: number; grams: number | null; price: number | null; at: number | null }[]).map((s) => [s.species, s]));
    const out = new Map<string, {
      key: string; name: string; players: number; caught: number; catches: number; recordGrams: number; recordGramsBy: string;
      recordPrice: number; recordPriceBy: string; maxGrams: number; avgGrams: number | null; avgPrice: number | null; facts: Map<string, number>; at: number;
    }>();
    for (const r of rows) {
      const s = out.get(r.species) ?? {
        key: r.species, name: r.name, players: 0, caught: 0, catches: 0, recordGrams: 0, recordGramsBy: '', recordPrice: 0, recordPriceBy: '',
        maxGrams: 0, avgGrams: null, avgPrice: null, facts: new Map<string, number>(), at: 0,
      };
      if (r.caught > 0) s.players++;
      s.caught += r.caught;
      if (r.record_grams > s.recordGrams) Object.assign(s, { recordGrams: r.record_grams, recordGramsBy: r.handle ?? '' });
      if (r.record_price > s.recordPrice) Object.assign(s, { recordPrice: r.record_price, recordPriceBy: r.handle ?? '' });
      s.maxGrams = Math.max(s.maxGrams, r.max_grams);
      if (r.fact) s.facts.set(r.fact, (s.facts.get(r.fact) ?? 0) + 1);
      s.at = Math.max(s.at, r.at);
      out.set(r.species, s);
    }
    return [...out.values()].map((s) => {
      const c = stats.get(s.key);
      return {
        ...s, catches: c?.n ?? 0, avgGrams: c?.grams == null ? null : round(c.grams), avgPrice: c?.price == null ? null : round(c.price, 2),
        facts: [...s.facts].map(([fact, count]) => ({ fact, count })).sort((a, b) => b.count - a.count), at: Math.max(s.at, c?.at ?? 0),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }

  /** One species in detail: sizes, qualities, weights, hours, the heaviest catches and the best players. */
  species(key: string) {
    const name = (this.sql.prepare('SELECT name FROM fish_atlas WHERE species = ? GROUP BY name ORDER BY COUNT(*) DESC LIMIT 1').get(key) as { name: string } | undefined)?.name;
    const catches = this.sql.prepare('SELECT at, grams, size, quality, price FROM fish_catches WHERE species = ?').all(key) as { at: number; grams: number; size: string; quality: string; price: number }[];
    if (!name && !catches.length) return null;
    const split = (by: 'size' | 'quality') => {
      const m = new Map<string, { count: number; priced: number; sum: number }>();
      for (const c of catches) {
        const s = m.get(c[by]) ?? { count: 0, priced: 0, sum: 0 };
        s.count++;
        if (c.price >= 0) {
          s.priced++;
          s.sum += c.price;
        }
        m.set(c[by], s);
      }
      return [...m].map(([value, s]) => ({ value, count: s.count, avgPrice: s.priced ? round(s.sum / s.priced, 2) : null })).sort((a, b) => b.count - a.count);
    };
    const top = Math.max(0, ...catches.map((c) => c.grams));
    const bins = 12;
    const width = top > 0 ? top / bins : 1;
    const weights = Array.from({ length: bins }, (_, i) => ({ from: round(i * width, 0), to: round((i + 1) * width, 0), count: 0 }));
    for (const c of catches) weights[Math.min(bins - 1, Math.floor(c.grams / width))].count++;
    const hours = Array.from({ length: 24 }, () => 0);
    for (const c of catches) hours[Number(HOUR.format(c.at)) % 24]++;
    const heaviest = this.sql.prepare(`SELECT c.at, c.grams, c.size, c.quality, c.price, u.handle FROM fish_catches c LEFT JOIN users u ON u.uuid = c.uuid
      WHERE c.species = ? ORDER BY c.grams DESC, c.at LIMIT 10`).all(key) as { at: number; grams: number; size: string; quality: string; price: number; handle: string | null }[];
    const players = this.sql.prepare(`SELECT u.handle, a.caught, a.record_grams AS recordGrams, a.record_price AS recordPrice, a.at,
      (SELECT COUNT(*) FROM fish_catches c WHERE c.uuid = a.uuid AND c.species = a.species) AS catches
      FROM fish_atlas a LEFT JOIN users u ON u.uuid = a.uuid WHERE a.species = ? AND a.caught > 0 ORDER BY a.caught DESC, a.record_grams DESC LIMIT 20`).all(key) as Record<string, unknown>[];
    return {
      key, name: name ?? key, catches: catches.length, sizes: split('size'), qualities: split('quality'), weights, hours,
      heaviest: heaviest.map((h) => ({ ...h, handle: h.handle ?? '' })), players: players.map((p) => ({ ...p, handle: p.handle ?? '' })),
    };
  }
}

interface Deps {
  sql: DatabaseSync;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  settings: () => FishAtlasSettings;
  limitUploads: (key: string) => void;
  fail: (status: number, code: string) => never;
}

export function fishAtlasRoutes(deps: Deps) {
  const { sql, authed, admin, body, settings, limitUploads, fail } = deps;
  const store = new FishAtlasStore(sql);

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Handler][] = [
    // the game's atlas: summaries replace the player's old ones, catches are added
    ['POST', /^\/v1\/mc\/fish-atlas$/, async (req) => {
      const me = authed(req);
      const s = settings();
      if (!s.enabled) return { enabled: false };
      limitUploads(me);
      const upload = cleanUpload(await body(req), s);
      const added = store.save(me, upload, s.keepPerSpecies);
      return { enabled: true, species: upload.species.length, catches: added };
    }],
    ['GET', /^\/v1\/admin\/fish-atlas$/, (req) => {
      admin(req);
      return { enabled: settings().enabled, species: store.list() };
    }],
    ['GET', /^\/v1\/admin\/fish-atlas\/([a-z0-9]{1,48})$/, (req, params) => {
      admin(req);
      return store.species(params[0]) ?? fail(404, 'not_found');
    }],
  ];
  return { routes, store };
}
