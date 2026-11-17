import { muxWebm, type WebmChunk } from '../shared/webm';

/**
 * Turning a game clip (Motion-JPEG AVI, which Discord does not play) into a WebM it plays:
 * the frames' JPEGs come from the main process (clipTrim.ts index), the page decodes them and
 * the browser's own encoder (WebCodecs) makes VP9, or VP8 where VP9 is missing. No ffmpeg.
 */

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

export interface EncodeJob {
  /** JPEGs of frames [from, from + count) of the chosen part. */
  frames: (from: number, count: number) => Promise<Uint8Array[]>;
  count: number;
  fps: number;
  plan: WebmPlan;
  /** 0..1 */
  onProgress: (done: number) => void;
  signal: AbortSignal;
}

const CODECS = [
  { codec: 'vp09.00.10.08', track: 'V_VP9' as const },
  { codec: 'vp8', track: 'V_VP8' as const },
];

/** Encodes the frames once; the result is the WebM file's bytes. */
export async function encodeWebm(job: EncodeJob): Promise<Uint8Array> {
  const { plan, fps } = job;
  const usPerFrame = 1_000_000 / fps;
  let chosen: (typeof CODECS)[number] | undefined;
  let config: VideoEncoderConfig | undefined;
  for (const c of CODECS) {
    // 'realtime' makes libvpx take its faster settings: much quicker than playing the clip
    const cfg: VideoEncoderConfig = { codec: c.codec, width: plan.width, height: plan.height, bitrate: plan.bitrate, bitrateMode: 'variable', framerate: fps, latencyMode: 'realtime' };
    if ((await VideoEncoder.isConfigSupported(cfg).catch(() => undefined))?.supported) {
      chosen = c;
      config = cfg;
      break;
    }
  }
  if (!chosen || !config) throw new Error('no-encoder');

  const chunks: WebmChunk[] = [];
  let failed: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, timestamp: chunk.timestamp, key: chunk.type === 'key' });
    },
    error: (err) => (failed = err instanceof Error ? err : new Error(String(err))),
  });
  encoder.configure(config);
  const keyEvery = Math.max(1, Math.round(fps * 2));
  const aborted = () => job.signal.aborted || !!failed;
  try {
    const BATCH = 24;
    for (let from = 0; from < job.count && !aborted(); from += BATCH) {
      const jpegs = await job.frames(from, Math.min(BATCH, job.count - from));
      // decoding runs off the page's thread, all of a batch at once
      const bitmaps = await Promise.all(jpegs.map((j) => createImageBitmap(new Blob([j as BlobPart], { type: 'image/jpeg' }), { resizeWidth: plan.width, resizeHeight: plan.height, resizeQuality: 'high' })));
      for (let i = 0; i < bitmaps.length; i++) {
        const n = from + i;
        if (!aborted()) {
          const frame = new VideoFrame(bitmaps[i], { timestamp: Math.round(n * usPerFrame), duration: Math.round(usPerFrame) });
          encoder.encode(frame, { keyFrame: n % keyEvery === 0 });
          frame.close();
        }
        bitmaps[i].close();
        // the encoder keeps up; frames are not piled up in memory
        while (encoder.encodeQueueSize > 4 && !aborted()) await new Promise((r) => setTimeout(r, 1));
      }
      job.onProgress(Math.min(job.count, from + BATCH) / job.count);
    }
    if (!aborted()) await encoder.flush();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (failed) throw failed;
  if (job.signal.aborted) throw new DOMException('aborted', 'AbortError');
  return muxWebm({ codec: chosen.track, width: plan.width, height: plan.height, frameDuration: usPerFrame }, chunks);
}

/**
 * Encodes; when a Discord-sized file still came out too big (the encoder can overshoot on a
 * busy clip), goes once more with the bitrate scaled down by how much it missed.
 */
export async function clipToWebm(job: EncodeJob): Promise<Uint8Array> {
  const progress = job.onProgress;
  let out = await encodeWebm({ ...job, onProgress: (p) => progress(job.plan.maxBytes ? p * 0.999 : p) });
  const max = job.plan.maxBytes;
  if (max && out.length > max) {
    const bitrate = Math.max(100_000, Math.floor(job.plan.bitrate * (max / out.length) * 0.9));
    out = await encodeWebm({ ...job, plan: { ...job.plan, bitrate } });
  }
  progress(1);
  return out;
}
