import { muxWebm, type WebmChunk, type WebmPlan } from '../shared/webm';

export { DISCORD_BYTES, fitSize, webmPlan, type WebmPlan, type WebmQuality } from '../shared/webm';

/**
 * Making a WebM (which Discord plays) from a clip, in a page: from the game's Motion-JPEG AVI
 * (each frame's JPEG decoded) or from a WebM being trimmed (its frames decoded again). The
 * browser's own encoder (WebCodecs) makes VP9, or VP8 where VP9 is missing. No ffmpeg.
 */

/** Pictures of the chosen part, in order, already at the WebM's size. */
export type FrameSource = AsyncGenerator<ImageBitmap>;

export interface EncodeJob {
  source: () => FrameSource;
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

const resize = (plan: WebmPlan) => ({ resizeWidth: plan.width, resizeHeight: plan.height, resizeQuality: 'high' as const });
const tick = () => new Promise((r) => setTimeout(r, 1));

/** Frames of a game clip: their JPEGs come in batches and are decoded a batch at once. */
export async function* aviFrames(jpegs: (from: number, count: number) => Promise<Uint8Array[]>, count: number, plan: WebmPlan, signal: AbortSignal): FrameSource {
  const BATCH = 24;
  for (let from = 0; from < count && !signal.aborted; from += BATCH) {
    const list = await jpegs(from, Math.min(BATCH, count - from));
    const bitmaps = await Promise.all(list.map((j) => createImageBitmap(new Blob([j as BlobPart], { type: 'image/jpeg' }), resize(plan))));
    for (let i = 0; i < bitmaps.length; i++) {
      if (signal.aborted) bitmaps[i].close();
      else yield bitmaps[i];
    }
  }
}

/**
 * Frames [from, to] of a WebM: decoding starts at the key frame before `from` (VP8 and VP9 have
 * no reordered frames, so the n-th picture out is the n-th frame in the file).
 */
export async function* webmFrames(opts: {
  codec: string; width: number; height: number; keyFrom: number; from: number; to: number; plan: WebmPlan; signal: AbortSignal;
  chunks: (from: number, count: number) => Promise<{ data: Uint8Array; key: boolean }[]>;
}): FrameSource {
  const ready: Promise<ImageBitmap>[] = [];
  let failed: Error | undefined;
  let outIndex = opts.keyFrom;
  const decoder = new VideoDecoder({
    output: (frame) => {
      const n = outIndex++;
      if (n >= opts.from && n <= opts.to) ready.push(createImageBitmap(frame, resize(opts.plan)).finally(() => frame.close()));
      else frame.close();
    },
    error: (err) => (failed = err instanceof Error ? err : new Error(String(err))),
  });
  decoder.configure({ codec: opts.codec === 'V_VP8' ? 'vp8' : 'vp09.00.10.08', codedWidth: opts.width, codedHeight: opts.height });
  try {
    const BATCH = 30;
    let fed = opts.keyFrom;
    let given = opts.from;
    while (given <= opts.to && !opts.signal.aborted && !failed) {
      // keep a few pictures ready, no more: decoded frames are big
      if (fed <= opts.to && ready.length < 8 && decoder.decodeQueueSize < 8) {
        const list = await opts.chunks(fed, Math.min(BATCH, opts.to - fed + 1));
        if (!list.length) break;
        for (const c of list) decoder.decode(new EncodedVideoChunk({ type: c.key ? 'key' : 'delta', timestamp: fed++ * 1000, data: c.data }));
        if (fed > opts.to) await decoder.flush();
      }
      if (ready.length) {
        given++;
        yield await ready.shift()!;
      } else if (fed > opts.to) break;
      else await tick();
    }
  } finally {
    for (const p of ready) void p.then((b) => b.close(), () => {});
    if (decoder.state !== 'closed') decoder.close();
  }
  if (failed) throw failed;
}

/** Encodes the pictures once; the result is the WebM file's bytes. */
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
  let n = 0;
  const source = job.source();
  try {
    for await (const bitmap of source) {
      if (aborted()) {
        bitmap.close();
        break;
      }
      const frame = new VideoFrame(bitmap, { timestamp: Math.round(n * usPerFrame), duration: Math.round(usPerFrame) });
      encoder.encode(frame, { keyFrame: n % keyEvery === 0 });
      frame.close();
      bitmap.close();
      n++;
      if (n % 8 === 0) job.onProgress(n / job.count);
      // the encoder keeps up; frames are not piled up in memory
      while (encoder.encodeQueueSize > 4 && !aborted()) await tick();
    }
    if (!aborted()) await encoder.flush();
  } finally {
    await source.return(undefined);
    if (encoder.state !== 'closed') encoder.close();
  }
  if (failed) throw failed;
  if (job.signal.aborted) throw new DOMException('aborted', 'AbortError');
  if (n < 2 || !chunks.length) throw new Error('no frames');
  return muxWebm({ codec: chosen.track, width: plan.width, height: plan.height, frameDuration: usPerFrame }, chunks);
}

/**
 * Encodes; when a Discord-sized file still came out too big (the encoder can overshoot on a
 * busy clip), goes once more with the bitrate scaled down by how much it missed.
 */
export async function clipToWebm(job: EncodeJob): Promise<Uint8Array> {
  const max = job.plan.maxBytes;
  let out = await encodeWebm({ ...job, onProgress: (p) => job.onProgress(max ? p * 0.999 : p) });
  if (max && out.length > max) {
    const bitrate = Math.max(100_000, Math.floor(job.plan.bitrate * (max / out.length) * 0.9));
    out = await encodeWebm({ ...job, plan: { ...job.plan, bitrate } });
  }
  job.onProgress(1);
  return out;
}

/** What Chromium itself makes of a WebM: its length and picture size, read by a <video>. */
export async function probeWebm(data: Uint8Array): Promise<{ durationMs: number; width: number; height: number }> {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'video/webm' }));
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((ok, fail) => {
      video.onloadeddata = () => ok();
      video.onerror = () => fail(new Error(`the WebM does not play (${video.error?.code ?? '?'})`));
      setTimeout(() => fail(new Error('the WebM did not open in time')), 15_000);
      video.src = url;
    });
    return { durationMs: Math.round(video.duration * 1000), width: video.videoWidth, height: video.videoHeight };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
