import { nativeImage } from 'electron';

/**
 * The Multimedia panel of chats (server 0.9.36+), the main process's part: small thumbnails of
 * the pictures (decrypted here like the chat's, so only a small JPEG goes to the page), and the
 * text a message keeps once its picture was taken down or ran out (the game shows that text).
 */

/** The longer side of a thumbnail. */
export const THUMB_SIDE = 320;

/** A picture's thumbnail as a JPEG data: address; undefined when it is not a picture we can read. */
export function thumbnail(data: Buffer, side = THUMB_SIDE): string | undefined {
  const img = nativeImage.createFromBuffer(data);
  if (img.isEmpty()) return undefined;
  const { width, height } = img.getSize();
  const scale = Math.min(1, side / Math.max(width, height, 1));
  const small = scale < 1 ? img.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'good' }) : img;
  return `data:image/jpeg;base64,${small.toJPEG(80).toString('base64')}`;
}

/** Thumbnails made lately, by picture id (they are small: a few hundred kept). */
export class ThumbCache {
  private readonly items = new Map<string, string>();
  constructor(private readonly max = 400) {}
  get(id: string): string | undefined {
    const hit = this.items.get(id);
    // used again: the newest
    if (hit !== undefined) this.set(id, hit);
    return hit;
  }
  set(id: string, url: string) {
    this.items.delete(id);
    this.items.set(id, url);
    while (this.items.size > this.max) this.items.delete(this.items.keys().next().value!);
  }
}

/** What a removed picture's message says (in the game and in older views): taken down, or ran out. */
export interface RemovedImage { at: number; expired?: boolean; by?: string }
export function removedText(r: RemovedImage | undefined, t: (s: string) => string): string | undefined {
  if (!r || typeof r !== 'object') return undefined;
  return r.expired ? t('Zdjęcie wygasło i zniknęło z serwera.') : t('Zdjęcie usunięte');
}

/** An item of the panel: a message's id, who sent it, when, and its picture (the key still sealed). */
export interface MediaItem { id: number; from: string; to?: string; group?: string; at: number; image: unknown }
