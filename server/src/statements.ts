import type { DatabaseSync, StatementSync } from 'node:sqlite';

/**
 * Prepared statements kept per connection: compiling the same SQL on every call (a player's
 * account, their friends, the game's lookup) costs more than running it. One cache per
 * connection, shared by every store that asks, and bounded, so SQL built from a list's length
 * (an IN with N places) cannot grow it for good.
 *
 * Only for SQL that names its columns: a cached `SELECT *` keeps the columns the table had
 * when it was first prepared, so a column added later would be missing from its rows.
 */
const caches = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

export function statements(sql: DatabaseSync, max = 1000): (text: string) => StatementSync {
  let cache = caches.get(sql);
  if (!cache) caches.set(sql, (cache = new Map()));
  const kept = cache;
  return (text) => {
    let s = kept.get(text);
    if (!s) {
      // a statement that cannot be prepared (its table not there yet) throws as before and is not kept
      s = sql.prepare(text);
      if (kept.size >= max) kept.delete(kept.keys().next().value as string);
      kept.set(text, s);
    }
    return s;
  };
}
