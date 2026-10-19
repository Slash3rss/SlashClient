/**
 * The face and ears slots (src/shared/clothing.ts has their boxes): which boxes show with a hat,
 * and how ears twitch. The mod does the same in Clothing.java (keep the two alike).
 */
import type { ClothingBox } from './clothing';

/** How often ears twitch (seconds), and how long a twitch takes. */
export const TWITCH_EVERY = 4.2;
export const TWITCH_LENGTH = 0.45;

/**
 * How far a twitching box is turned now (radians, about its twitch axis), `t` in seconds: still
 * most of the time, then a quick wiggle that dies down, every few seconds.
 */
export function twitchAngle(t: number, twitch: NonNullable<ClothingBox['twitch']>): number {
  const local = (((t + twitch.phase) % TWITCH_EVERY) + TWITCH_EVERY) % TWITCH_EVERY;
  if (local >= TWITCH_LENGTH) return 0;
  const k = local / TWITCH_LENGTH;
  return (twitch.amp * Math.PI / 180) * Math.sin(k * Math.PI * 4) * (1 - k);
}

/** Whether a box shows with this hat on (none: always); a hat not on its list would go through it. */
export function shownWith(box: ClothingBox, hat: string | undefined): boolean {
  return !hat || !box.hats || box.hats.includes(hat);
}
