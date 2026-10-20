/**
 * A clan's logo on the launcher's side: the page makes the 64×64 PNG (it can read every picture
 * format, Electron's own decoder only PNG and JPEG), this checks it before it goes to the server,
 * and fetches logos for the page and the game, kept by clan and version (a version never changes).
 */

export const LOGO_SIZE = 64;
export const MAX_LOGO_BYTES = 32 * 1024;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Whether bytes are what the server takes: a PNG whose header says 64×64, small enough. */
export function isLogoPng(data: Uint8Array): boolean {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return buf.length >= 33 && buf.length <= MAX_LOGO_BYTES && buf.subarray(0, 8).equals(SIGNATURE)
    && buf.toString('latin1', 12, 16) === 'IHDR' && buf.readUInt32BE(16) === LOGO_SIZE && buf.readUInt32BE(20) === LOGO_SIZE;
}

const ID = /^[\w-]{1,32}$/;

/** Logos by clan (or community, with its `prefix`) and version: the last few kept, one download at a time for each. */
export class ClanLogoCache {
  private readonly kept = new Map<string, Promise<Buffer>>();
  private readonly download: (path: string) => Promise<Buffer>;
  private readonly keep: number;
  private readonly prefix: string;

  constructor(download: (path: string) => Promise<Buffer>, keep = 64, prefix = '/v1/clans') {
    this.download = download;
    this.keep = keep;
    this.prefix = prefix;
  }

  get(id: string, version: number): Promise<Buffer> {
    if (!ID.test(id) || !Number.isSafeInteger(version) || version < 0) return Promise.reject(new Error('bad_request'));
    const key = `${id}:${version}`;
    let found = this.kept.get(key);
    if (found) {
      // used again: the newest
      this.kept.delete(key);
      this.kept.set(key, found);
      return found;
    }
    found = this.download(`${this.prefix}/${id}/logo.png?v=${version}`).then((png) => {
      if (!isLogoPng(png)) throw new Error('not_png');
      return png;
    });
    // a failed one is tried again next time
    found.catch(() => this.kept.delete(key));
    this.kept.set(key, found);
    while (this.kept.size > this.keep) this.kept.delete(this.kept.keys().next().value!);
    return found;
  }
}
