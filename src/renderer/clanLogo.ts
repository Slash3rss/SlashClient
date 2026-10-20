/**
 * A clan's logo in the page: the owner's picture made into the 64×64 PNG the server takes (a
 * centred square, see-through parts kept; GIFs give their first frame), and logos to show, fetched
 * through the main process and kept by clan and version.
 */

export const LOGO_SIZE = 64;
/** What the server takes (a 64×64 PNG is well under it). */
export const MAX_LOGO_BYTES = 32 * 1024;

/** The centred square of a w × h picture: where it starts and its side. */
export function squareCrop(w: number, h: number): { x: number; y: number; side: number } {
  const side = Math.max(1, Math.min(w, h));
  return { x: Math.floor((w - side) / 2), y: Math.floor((h - side) / 2), side };
}

/** A picture file (PNG, JPEG, WebP, GIF) as the logo's PNG bytes. */
export async function logoFromFile(file: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const { x, y, side } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = LOGO_SIZE;
    canvas.height = LOGO_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, x, y, side, side, 0, 0, LOGO_SIZE, LOGO_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('not_png');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

type Fetch = (id: string, version: number) => Promise<string>;
const urls = new Map<string, string | null>();

/**
 * The logo as an address for <img>, once it is here; undefined while it loads (then `ready` is
 * called) or when it could not be had. `fetch` is the main process' call.
 */
export function logoUrl(fetch: Fetch | undefined, id: string, version: number, ready: () => void): string | undefined {
  const key = `${id}:${version}`;
  const known = urls.get(key);
  if (known !== undefined || !fetch) return known ?? undefined;
  urls.set(key, null);
  fetch(id, version).then((url) => {
    urls.set(key, url);
    ready();
  }, () => {
    // tried again the next time it is drawn after a while
    setTimeout(() => urls.delete(key), 60_000);
  });
  return undefined;
}
