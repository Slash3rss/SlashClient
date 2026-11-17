import { aviFrames, clipToWebm, probeWebm, webmFrames } from './clipWebm';
import type { ConvertJob } from '../main/clipConvert';

/**
 * The hidden page that turns clips into WebM (main/clipConvert.ts hands it the jobs, one at a
 * time): it asks for the frames, encodes them and hands the file back with what a <video>
 * made of it, so the main process only keeps a WebM that really plays.
 */

interface ConverterApi {
  onJob: (fn: (job: ConvertJob) => void) => void;
  onCancel: (fn: (id: number) => void) => void;
  jpegs: (id: number, from: number, count: number) => Promise<Uint8Array[]>;
  chunks: (id: number, from: number, count: number) => Promise<{ data: Uint8Array; key: boolean }[]>;
  progress: (id: number, done: number) => void;
  done: (id: number, data: Uint8Array, probe: { durationMs: number; width: number; height: number }) => Promise<void>;
  failed: (id: number, message: string) => void;
}

const api = (window as unknown as { converter: ConverterApi }).converter;
const running = new Map<number, AbortController>();

api.onCancel((id) => running.get(id)?.abort());
api.onJob(async (job) => {
  const abort = new AbortController();
  running.set(job.id, abort);
  const { signal } = abort;
  const count = job.to - job.from + 1;
  try {
    if (typeof VideoEncoder === 'undefined') throw new Error('no-encoder');
    const data = await clipToWebm({
      count, fps: job.fps, plan: job.plan, signal,
      onProgress: (p) => api.progress(job.id, p),
      source: () => job.source === 'avi'
        ? aviFrames((from, n) => api.jpegs(job.id, job.from + from, n), count, job.plan, signal)
        : webmFrames({ codec: job.codec, width: job.width, height: job.height, keyFrom: job.keyFrom, from: job.from, to: job.to, plan: job.plan, signal, chunks: (from, n) => api.chunks(job.id, from, n) }),
    });
    await api.done(job.id, data, await probeWebm(data));
  } catch (err) {
    api.failed(job.id, (err as Error)?.name === 'AbortError' ? 'aborted' : String((err as Error)?.message ?? err));
  } finally {
    running.delete(job.id);
  }
});
