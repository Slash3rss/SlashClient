import type { DatabaseSync } from 'node:sqlite';

/**
 * "Tylko dla wspierających od poziomu N" set in the admin panel's cosmetics tab: any item can be
 * made one for supporters of a tier level (or freed from it: level 0). Only the admin's choices
 * are kept here; items without a row keep cosmetics.ts's `supporter`. db.cosmeticSettings() reads
 * them into each item's setting, so everything that checks items (mayWear, the catalog, how to
 * get it, the shop) sees the same level.
 */

export const SUPPORTER_SCHEMA = 'CREATE TABLE IF NOT EXISTS cosmetic_supporter (id TEXT PRIMARY KEY, level INTEGER NOT NULL CHECK (level >= 0))';

/** The highest level the panel accepts (tiers' levels are small numbers). */
export const MAX_SUPPORTER_LEVEL = 100;

/** The admin's levels by item id (empty before the table exists). */
export function supporterLevels(sql: DatabaseSync): Map<string, number> {
  try {
    return new Map((sql.prepare('SELECT id, level FROM cosmetic_supporter').all() as { id: string; level: number }[]).map((r) => [r.id, r.level]));
  } catch {
    return new Map();
  }
}

/** A level for an item (0: for everyone, whatever cosmetics.ts says), or undefined to go back to cosmetics.ts. */
export function setSupporterLevel(sql: DatabaseSync, id: string, level: number | undefined) {
  sql.exec(SUPPORTER_SCHEMA);
  if (level === undefined) sql.prepare('DELETE FROM cosmetic_supporter WHERE id = ?').run(id);
  else sql.prepare('INSERT INTO cosmetic_supporter (id, level) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET level = excluded.level').run(id, level);
}
