/**
 * Picking several rows of a list at once (the Installed list's mods, packs and shaders): Shift+click
 * for a range, "select all" and the actions only ever touch the rows the search shows.
 */

/** Shift+click: every row between the last clicked one and this one gets this one's new state. */
export function selectRange(order: string[], selected: Set<string>, anchor: string | undefined, target: string, on: boolean): Set<string> {
  const next = new Set(selected);
  const a = anchor === undefined ? -1 : order.indexOf(anchor);
  const b = order.indexOf(target);
  if (b < 0) return next;
  const [from, to] = a < 0 ? [b, b] : [Math.min(a, b), Math.max(a, b)];
  for (const key of order.slice(from, to + 1)) {
    if (on) next.add(key);
    else next.delete(key);
  }
  return next;
}

/** The selected rows the player can see now, in list order: what the action bar counts and acts on. */
export const visibleSelection = (order: string[], selected: Set<string>) => order.filter((k) => selected.has(k));

/** "Zaznacz wszystkie" / Ctrl+A: the visible rows join the selection (hidden ones keep their state). */
export function selectAllVisible(order: string[], selected: Set<string>): Set<string> {
  return new Set([...selected, ...order]);
}
