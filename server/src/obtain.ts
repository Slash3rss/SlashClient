import type { Achievement } from './achievements.ts';
import type { CosmeticSetting } from './db.ts';
import { capeSetting, priceOf, sellable, type Item } from './cosmetics.ts';

/**
 * How a cosmetic can be got, worked out from the catalog (cosmetics.ts), the admin's settings
 * (switched off, exclusive, the shop's price) and the achievements as they are now (their rewards):
 * one place the admin panel's cosmetics tab and the achievement editor's reward picker both use.
 */

export type Way =
  | { kind: 'free' }
  | { kind: 'shop'; price: number }
  | { kind: 'achievement'; id: string; name: string; custom: boolean; manual: boolean; enabled: boolean }
  | { kind: 'rank'; rank: string }
  /** Nothing else: only an admin's grant gives it. */
  | { kind: 'grant' };

export interface Obtain {
  ways: Way[];
  /** Switched off: nobody can pick it (admins still may). */
  disabled: boolean;
  exclusive: boolean;
  /** Whether the shop may sell it (not a rank's, not one only an achievement of cosmetics.ts gives). */
  sellable: boolean;
  /** The ways in a line of Polish, for the panel. */
  text: string;
}

const RANKS: Record<string, string> = { admin: 'Admin', support: 'Support', partner: 'Partner', friend: 'Przyjaciel', friend_pink: 'Przyjaciel (różowy)' };

export function howToGet(it: Item, settings: Map<string, CosmeticSetting>, achievements: Achievement[]): Obtain {
  const s = capeSetting(settings, it.id);
  const price = priceOf(settings, it.id);
  const ways: Way[] = [];
  // free when nothing locks it: no achievement of its own, no price, not exclusive, not a rank's
  if (!it.achievement && price === undefined && !s.exclusive && !it.rank) ways.push({ kind: 'free' });
  if (price !== undefined) ways.push({ kind: 'shop', price });
  for (const a of achievements.filter((x) => x.reward === it.id)) {
    ways.push({ kind: 'achievement', id: a.id, name: a.name, custom: !!a.custom, manual: a.group === 'manual', enabled: a.enabled !== false });
  }
  if (it.rank) ways.push({ kind: 'rank', rank: it.rank });
  if (!ways.some((w) => w.kind !== 'achievement' || w.enabled)) ways.push({ kind: 'grant' });
  const words = ways.map((w) => {
    switch (w.kind) {
      case 'free': return 'za darmo';
      case 'shop': return `sklep: ${w.price} ✦`;
      case 'achievement': return `osiągnięcie „${w.name}”${w.manual ? ' (przyznawane ręcznie)' : ''}${w.enabled ? '' : ' (wyłączone)'}`;
      case 'rank': return `ranga ${RANKS[w.rank] ?? w.rank}`;
      case 'grant': return 'tylko przyznanie przez admina';
    }
  });
  const text = (s.enabled ? '' : 'wyłączony · ') + words.join(' · ');
  return { ways, disabled: !s.enabled, exclusive: s.exclusive, sellable: sellable(it), text: text.charAt(0).toUpperCase() + text.slice(1) };
}
