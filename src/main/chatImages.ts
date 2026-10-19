import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Pictures in the chat with friends (a screenshot from the game), encrypted end to end like the
 * text. The picture is encrypted here with a fresh AES-256-GCM key and only that blob goes to the
 * SlashClient server; the key (with the picture's size) travels in the message, encrypted for the
 * friend's launchers and ours by chatCrypto. The server keeps bytes it cannot read.
 */

/** What the message carries, once decrypted: how to open the blob, and how big the picture is. */
export interface ImageKey { key: string; iv: string; type: string; w: number; h: number }

/** The picture shown in the page and the game: no key, only what to ask for. */
export interface ChatImageView { id: string; w?: number; h?: number; size?: number; unreadable?: boolean }

/** The largest side a sent picture keeps; a 4K screenshot is scaled down to this first. */
export const MAX_SIDE = 1920;
/** What the server accepts (IMAGE_LIMITS.maxBytes), less the tag. */
export const MAX_BYTES = 4 * 1024 * 1024 - 64;

const TYPES = ['image/jpeg', 'image/png'];

/** The picture's bytes encrypted with a new key; the blob is the ciphertext with GCM's tag at the end. */
export function sealImage(data: Buffer, type: string, w: number, h: number): { blob: Buffer; key: ImageKey } {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const blob = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
  return { blob, key: { key: key.toString('base64'), iv: iv.toString('base64'), type, w, h } };
}

/** The picture's bytes again; throws when the blob was changed or the key is not its own. */
export function openImage(blob: Buffer, key: ImageKey): Buffer {
  if (blob.length < 17) throw new Error('bad_image');
  const d = createDecipheriv('aes-256-gcm', Buffer.from(key.key, 'base64'), Buffer.from(key.iv, 'base64'));
  d.setAuthTag(blob.subarray(blob.length - 16));
  return Buffer.concat([d.update(blob.subarray(0, blob.length - 16)), d.final()]);
}

/** The key as it goes into the message (before chatCrypto encrypts it). */
export function keyText(key: ImageKey): string {
  return JSON.stringify({ v: 1, ...key });
}

/** The key from a decrypted message; undefined when it is not one. */
export function parseKey(text: string): ImageKey | undefined {
  try {
    const k = JSON.parse(text) as Record<string, unknown>;
    if (k.v !== 1 || typeof k.key !== 'string' || typeof k.iv !== 'string' || !TYPES.includes(k.type as string)) return undefined;
    if (Buffer.from(k.key, 'base64').length !== 32 || Buffer.from(k.iv, 'base64').length !== 12) return undefined;
    const side = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 16384 ? n : 0);
    return { key: k.key, iv: k.iv, type: k.type as string, w: side(k.w), h: side(k.h) };
  } catch {
    return undefined;
  }
}

/** The size a picture is sent at: the longer side at most `max`, the shape kept. */
export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** A few pictures opened lately, so scrolling the chat does not download and decrypt them again. */
export class ImageCache {
  private readonly items = new Map<string, Buffer>();
  constructor(private readonly maxBytes = 48 * 1024 * 1024) {}

  get(id: string): Buffer | undefined {
    const hit = this.items.get(id);
    if (hit) {
      // used again: the newest
      this.items.delete(id);
      this.items.set(id, hit);
    }
    return hit;
  }

  set(id: string, data: Buffer) {
    this.items.delete(id);
    this.items.set(id, data);
    let total = 0;
    for (const d of this.items.values()) total += d.length;
    for (const [key, d] of this.items) {
      if (total <= this.maxBytes || this.items.size <= 1) break;
      this.items.delete(key);
      total -= d.length;
    }
  }

  get size() {
    return this.items.size;
  }
}
