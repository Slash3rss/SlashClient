import type { CosmeticSetting } from './db.ts';

/**
 * The SlashClient cosmetics. Their pictures live in the HUD mod (textures/cape, textures/emote)
 * and on the website (web/capes); the server checks choices against these and the admin's settings.
 */
export const CAPES = ['slash', 'ocean', 'ember', 'forest', 'galaxy', 'rose', 'gold', 'mono'];
export const CAPE_NAMES: Record<string, string> = {
  slash: 'SlashClient', ocean: 'Ocean', ember: 'Ember', forest: 'Forest', galaxy: 'Galaxy', rose: 'Rose', gold: 'Gold', mono: 'Mono',
};
export const EMOTES = ['wave', 'heart', 'laugh', 'gg', 'like', 'angry', 'question', 'fire'];

/** What the admin set for a cape; capes never touched are on and for everyone. */
export function capeSetting(settings: Map<string, CosmeticSetting>, id: string): CosmeticSetting {
  return settings.get(id) ?? { id, enabled: true, exclusive: false };
}

/** Whether a player may wear a cape now: it exists, is on, and is not exclusive to others. */
export function mayWear(settings: Map<string, CosmeticSetting>, granted: string[], cape: string): boolean {
  if (!CAPES.includes(cape)) return false;
  const s = capeSetting(settings, cape);
  return s.enabled && (!s.exclusive || granted.includes(cape));
}
