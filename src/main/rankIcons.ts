/**
 * A rank's own icon (the server's ranks.ts: a 16×16 or 32×32 PNG the admins upload), fetched for
 * the page by its address, which carries the version (/v1/ranks/<id>/logo.png?v=…), so an address
 * once fetched is kept for good (the last few).
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const ICON_PATH = /^\/v1\/ranks\/[\w-]{1,32}\/logo\.png\?v=\d{1,16}$/;
const MAX_BYTES = 32 * 1024;

/** Whether bytes are a rank icon: a PNG whose header says 16×16 or 32×32, small enough. */
export function isRankIcon(data: Uint8Array): boolean {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buf.length < 33 || buf.length > MAX_BYTES || !buf.subarray(0, 8).equals(SIGNATURE) || buf.toString('latin1', 12, 16) !== 'IHDR') return false;
  const w = buf.readUInt32BE(16);
  return w === buf.readUInt32BE(20) && (w === 16 || w === 32);
}

export class RankIconCache {
  private readonly kept = new Map<string, Promise<string>>();
  constructor(private readonly download: (path: string) => Promise<Buffer>, private readonly keep = 32) {}

  /** The icon as a data: address for <img>. */
  get(path: string): Promise<string> {
    if (typeof path !== 'string' || !ICON_PATH.test(path)) return Promise.reject(new Error('bad_request'));
    let found = this.kept.get(path);
    if (found) return found;
    found = this.download(path).then((png) => {
      if (!isRankIcon(png)) throw new Error('not_png');
      return `data:image/png;base64,${png.toString('base64')}`;
    });
    found.catch(() => this.kept.delete(path));
    this.kept.set(path, found);
    while (this.kept.size > this.keep) this.kept.delete(this.kept.keys().next().value!);
    return found;
  }
}
