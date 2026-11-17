/**
 * A tiny WebM (Matroska) writer for one video track, so a clip turned into VP9 or VP8 by the
 * browser's own encoder (WebCodecs) can be saved as a file Discord and browsers play. The whole
 * file is built in memory (a clip for Discord is a few MB): the sizes are all known, the
 * duration is filled in and there is an index (Cues), so players can seek at once.
 */

export interface WebmChunk {
  /** The encoded frame. */
  data: Uint8Array;
  /** Microseconds from the start. */
  timestamp: number;
  key: boolean;
}

export interface WebmTrack {
  codec: 'V_VP9' | 'V_VP8';
  width: number;
  height: number;
  /** Microseconds per frame (the length of the last frame and the stream's frame rate). */
  frameDuration: number;
}

const enc = new TextEncoder();

/** An element ID as written (IDs keep their marker bits, so they are just their bytes). */
function idBytes(id: number): number[] {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return out;
}

/** A size as an EBML variable-length number; `width` forces a length (for the fixed SeekHead). */
export function vint(value: number, width?: number): Uint8Array {
  let len = width ?? 1;
  if (width === undefined) while (len < 8 && value >= 2 ** (7 * len) - 1) len++;
  const out = new Uint8Array(len);
  let v = value;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] |= 0x80 >> (len - 1);
  return out;
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const element = (id: number, ...body: Uint8Array[]) => {
  const data = concat(body);
  return concat([new Uint8Array(idBytes(id)), vint(data.length), data]);
};

const uintBytes = (v: number, width?: number) => {
  let len = width ?? 1;
  if (width === undefined) while (len < 8 && v >= 2 ** (8 * len)) len++;
  const out = new Uint8Array(len);
  for (let i = len - 1, x = v; i >= 0; i--, x = Math.floor(x / 256)) out[i] = x % 256;
  return out;
};
const uint = (id: number, v: number, width?: number) => element(id, uintBytes(v, width));
const str = (id: number, s: string) => element(id, enc.encode(s));
const float = (id: number, v: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v);
  return element(id, b);
};

// the IDs this writer uses (Matroska specification)
const ID = {
  EBML: 0x1a45dfa3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42f7, EBMLMaxIDLength: 0x42f2, EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
  Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimestampScale: 0x2ad7b1, Duration: 0x4489, MuxingApp: 0x4d80, WritingApp: 0x5741,
  Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackUID: 0x73c5, TrackType: 0x83, FlagLacing: 0x9c,
  CodecID: 0x86, DefaultDuration: 0x23e383, Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba,
  Cluster: 0x1f43b675, Timestamp: 0xe7, SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7, CueTrack: 0xf7, CueClusterPosition: 0xf1,
} as const;

/** A cluster's blocks keep their time as a 16-bit offset, so clusters stay well under 32 s. */
const CLUSTER_MS = 5_000;

/** The WebM file of encoded frames (in decoding order, as the encoder gives them). */
export function muxWebm(track: WebmTrack, chunks: WebmChunk[], app = 'SlashClient'): Uint8Array {
  if (!chunks.length || !chunks[0].key) throw new Error('the first frame must be a key frame');
  const ms = (us: number) => Math.round(us / 1000);
  const t0 = chunks[0].timestamp;
  const durationMs = ms(chunks[chunks.length - 1].timestamp - t0 + track.frameDuration);

  const header = element(ID.EBML,
    uint(ID.EBMLVersion, 1), uint(ID.EBMLReadVersion, 1), uint(ID.EBMLMaxIDLength, 4), uint(ID.EBMLMaxSizeLength, 8),
    str(ID.DocType, 'webm'), uint(ID.DocTypeVersion, 4), uint(ID.DocTypeReadVersion, 2));
  const info = element(ID.Info, uint(ID.TimestampScale, 1_000_000), float(ID.Duration, durationMs), str(ID.MuxingApp, app), str(ID.WritingApp, app));
  const tracks = element(ID.Tracks, element(ID.TrackEntry,
    uint(ID.TrackNumber, 1), uint(ID.TrackUID, 1), uint(ID.TrackType, 1), uint(ID.FlagLacing, 0), str(ID.CodecID, track.codec),
    uint(ID.DefaultDuration, Math.round(track.frameDuration * 1000)),
    element(ID.Video, uint(ID.PixelWidth, track.width), uint(ID.PixelHeight, track.height))));

  // clusters start at key frames (so each one is a place to seek to)
  const clusters: { time: number; key: boolean; body: Uint8Array[] }[] = [];
  for (const c of chunks) {
    const time = ms(c.timestamp - t0);
    let cur = clusters[clusters.length - 1];
    if (!cur || (c.key && time > cur.time) || time - cur.time >= CLUSTER_MS) {
      cur = { time, key: c.key, body: [uint(ID.Timestamp, time)] };
      clusters.push(cur);
    }
    const head = new Uint8Array(4);
    head[0] = 0x81; // track 1
    new DataView(head.buffer).setInt16(1, time - cur.time);
    head[3] = c.key ? 0x80 : 0;
    cur.body.push(element(ID.SimpleBlock, head, c.data));
  }
  const clusterBytes = clusters.map((c) => element(ID.Cluster, ...c.body));

  // positions are from the start of the Segment's data; the SeekHead has a fixed size, so they are known
  const seek = (id: number, pos: number) => element(ID.Seek, element(ID.SeekID, new Uint8Array(idBytes(id))), uint(ID.SeekPosition, pos, 8));
  const seekHeadSize = element(ID.SeekHead, seek(ID.Info, 0), seek(ID.Tracks, 0), seek(ID.Cues, 0)).length;
  const infoAt = seekHeadSize;
  const tracksAt = infoAt + info.length;
  let at = tracksAt + tracks.length;
  const points: Uint8Array[] = [];
  clusters.forEach((c, i) => {
    if (c.key) points.push(element(ID.CuePoint, uint(ID.CueTime, c.time), element(ID.CueTrackPositions, uint(ID.CueTrack, 1), uint(ID.CueClusterPosition, at))));
    at += clusterBytes[i].length;
  });
  const cues = element(ID.Cues, ...points);
  const seekHead = element(ID.SeekHead, seek(ID.Info, infoAt), seek(ID.Tracks, tracksAt), seek(ID.Cues, at));
  return concat([header, element(ID.Segment, seekHead, info, tracks, ...clusterBytes, cues)]);
}

/** One element read back: for the tests and for checking a written file. */
export interface EbmlNode { id: number; start: number; dataStart: number; size: number; children?: EbmlNode[] }

const MASTER = new Set<number>([ID.EBML, ID.Segment, ID.SeekHead, ID.Seek, ID.Info, ID.Tracks, ID.TrackEntry, ID.Video, ID.Cluster, ID.Cues, ID.CuePoint, ID.CueTrackPositions]);

/** Reads the element tree (master elements opened, others left as bytes). */
export function readEbml(buf: Uint8Array, start = 0, end = buf.length): EbmlNode[] {
  const out: EbmlNode[] = [];
  let at = start;
  while (at < end) {
    const first = buf[at];
    let idLen = 1;
    while (idLen <= 4 && !(first & (0x80 >> (idLen - 1)))) idLen++;
    if (idLen > 4) throw new Error(`bad element id at ${at}`);
    let id = 0;
    for (let i = 0; i < idLen; i++) id = id * 256 + buf[at + i];
    const s = at + idLen;
    let sizeLen = 1;
    while (sizeLen <= 8 && !(buf[s] & (0x80 >> (sizeLen - 1)))) sizeLen++;
    if (sizeLen > 8) throw new Error(`bad element size at ${s}`);
    let size = buf[s] & (0xff >> sizeLen);
    for (let i = 1; i < sizeLen; i++) size = size * 256 + buf[s + i];
    const dataStart = s + sizeLen;
    if (dataStart + size > end) throw new Error(`element at ${at} runs past its parent`);
    const node: EbmlNode = { id, start: at, dataStart, size };
    if (MASTER.has(id)) node.children = readEbml(buf, dataStart, dataStart + size);
    out.push(node);
    at = dataStart + size;
  }
  return out;
}

export const EBML_IDS = ID;

/** A WebM's video frames as they lie in the file (for trimming one: they are decoded again). */
export interface WebmIndex {
  codec: string;
  width: number;
  height: number;
  /** Microseconds per frame (DefaultDuration, else worked out from the frames). */
  frameDuration: number;
  durationMs: number;
  frames: { offset: number; length: number; timestamp: number; key: boolean }[];
}

const MAX_WEBM_FRAMES = 200_000;

/**
 * Reads a WebM with one video track written as SimpleBlocks without lacing (what muxWebm and
 * the browsers write); undefined for anything else. Cut-short files keep the frames before the cut.
 */
export function demuxWebm(buf: Uint8Array): WebmIndex | undefined {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const readId = (at: number): [number, number] | undefined => {
    const first = buf[at];
    let len = 1;
    while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++;
    if (len > 4 || at + len > buf.length) return undefined;
    let id = 0;
    for (let i = 0; i < len; i++) id = id * 256 + buf[at + i];
    return [id, len];
  };
  const readSize = (at: number): [number, number] | undefined => {
    if (at >= buf.length) return undefined;
    let len = 1;
    while (len <= 8 && !(buf[at] & (0x80 >> (len - 1)))) len++;
    if (len > 8 || at + len > buf.length) return undefined;
    let v = buf[at] & (0xff >> len);
    let allOnes = v === 0xff >> len;
    for (let i = 1; i < len; i++) {
      v = v * 256 + buf[at + i];
      allOnes &&= buf[at + i] === 0xff;
    }
    return [allOnes ? -1 : v, len];
  };
  const uintOf = (at: number, size: number) => {
    let v = 0;
    for (let i = 0; i < size; i++) v = v * 256 + buf[at + i];
    return v;
  };
  const str = (at: number, size: number) => new TextDecoder().decode(buf.subarray(at, at + size)).replace(/\0+$/, '');

  const out: WebmIndex = { codec: '', width: 0, height: 0, frameDuration: 0, durationMs: 0, frames: [] };
  let scale = 1_000_000;
  let duration = 0;
  let videoTrack = 0;
  let isWebm = false;
  let clusterTime = 0;
  // elements whose children are read; an unknown size (live recordings) runs to the parent's end
  const containers = new Set<number>([ID.EBML, ID.Segment, ID.Info, ID.Tracks, ID.TrackEntry, ID.Video, ID.Cluster]);
  const walk = (start: number, end: number, parent: number, track: { num: number; type: number; codec: string; w: number; h: number; dd: number }): number => {
    let at = start;
    while (at < end && out.frames.length < MAX_WEBM_FRAMES) {
      const idr = readId(at);
      if (!idr) return end;
      const sz = readSize(at + idr[1]);
      if (!sz) return end;
      const [id] = idr;
      const data = at + idr[1] + sz[1];
      // a cluster of unknown size ends where the next cluster starts
      if (id === ID.Cluster && parent === ID.Cluster) return at;
      const size = sz[0] < 0 ? end - data : Math.min(sz[0], end - data);
      if (containers.has(id)) {
        let stop = data + size;
        if (id === ID.TrackEntry) {
          const t = { num: 0, type: 0, codec: '', w: 0, h: 0, dd: 0 };
          walk(data, data + size, id, t);
          if (t.type === 1 && !videoTrack) {
            videoTrack = t.num;
            out.codec = t.codec;
            out.width = t.w;
            out.height = t.h;
            out.frameDuration = t.dd / 1000;
          }
        } else stop = walk(data, data + size, id, track);
        at = sz[0] < 0 ? stop : data + size;
        continue;
      } else if (id === ID.DocType) isWebm = str(data, size) === 'webm';
      else if (id === ID.TimestampScale) scale = uintOf(data, size);
      else if (id === ID.Duration && (size === 4 || size === 8)) duration = size === 8 ? dv.getFloat64(data) : dv.getFloat32(data);
      else if (id === ID.TrackNumber) track.num = uintOf(data, size);
      else if (id === ID.TrackType) track.type = uintOf(data, size);
      else if (id === ID.CodecID) track.codec = str(data, size);
      else if (id === ID.PixelWidth) track.w = uintOf(data, size);
      else if (id === ID.PixelHeight) track.h = uintOf(data, size);
      else if (id === ID.DefaultDuration) track.dd = uintOf(data, size);
      else if (id === ID.Timestamp && parent === ID.Cluster) clusterTime = uintOf(data, size);
      else if (id === ID.SimpleBlock && parent === ID.Cluster && data + size <= buf.length && size > 4) {
        const num = readSize(data);
        if (num) {
          const head = data + num[1];
          const flags = buf[head + 2];
          // laced blocks are not what video writers make: left out
          if (num[0] === videoTrack && !(flags & 0x06)) {
            const rel = dv.getInt16(head);
            out.frames.push({ offset: head + 3, length: data + size - head - 3, timestamp: Math.round(((clusterTime + rel) * scale) / 1000), key: !!(flags & 0x80) });
          }
        }
      }
      if (sz[0] < 0) return end;
      at = data + size;
    }
    return at;
  };
  walk(0, buf.length, 0, { num: 0, type: 0, codec: '', w: 0, h: 0, dd: 0 });
  if (!isWebm || !videoTrack || !out.frames.length || !out.width || !out.height) return undefined;
  if (!out.frameDuration) {
    const f = out.frames;
    out.frameDuration = f.length > 1 ? Math.max(1, (f[f.length - 1].timestamp - f[0].timestamp) / (f.length - 1)) : 33_333;
  }
  const last = out.frames.reduce((m, f) => Math.max(m, f.timestamp), 0);
  out.durationMs = duration > 0 ? Math.round((duration * scale) / 1_000_000) : Math.round((last - out.frames[0].timestamp + out.frameDuration) / 1000);
  return out;
}

// ---------- the size of a clip's WebM ----------

export type WebmQuality = 'discord' | 'high';

/** Discord's upload limit without Nitro. */
export const DISCORD_BYTES = 10 * 1024 * 1024;

export interface WebmPlan { width: number; height: number; bitrate: number; maxBytes?: number }

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The picture fitted into a box, never made bigger. */
export function fitSize(width: number, height: number, maxW: number, maxH: number): [number, number] {
  const k = Math.min(1, maxW / width, maxH / height);
  return [even(width * k), even(height * k)];
}

/**
 * Size and bitrate of the WebM. For Discord the whole file has to stay under 10 MB, so the
 * bitrate is the budget spread over the clip's length (a bit kept back for the container and
 * the encoder overshooting); a long clip gets a smaller picture rather than a mushy one.
 */
export function webmPlan(width: number, height: number, durationMs: number, quality: WebmQuality): WebmPlan {
  if (quality === 'high') {
    const [w, h] = fitSize(width, height, 1920, 1080);
    return { width: w, height: h, bitrate: 8_000_000 };
  }
  const seconds = Math.max(1, durationMs / 1000);
  const bitrate = Math.round(Math.max(150_000, Math.min(4_000_000, (DISCORD_BYTES * 8 * 0.85) / seconds)));
  const [w, h] = bitrate < 1_200_000 ? fitSize(width, height, 854, 480) : fitSize(width, height, 1280, 720);
  return { width: w, height: h, bitrate, maxBytes: DISCORD_BYTES };
}

