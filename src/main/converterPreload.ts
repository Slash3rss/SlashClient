import { contextBridge, ipcRenderer } from 'electron';

/** The hidden clip converter's page (renderer/converter.ts) and the main process (clipConvert.ts). */
contextBridge.exposeInMainWorld('converter', {
  onJob: (fn: (job: unknown) => void) => ipcRenderer.on('conv:job', (_e, job) => fn(job)),
  onCancel: (fn: (id: number) => void) => ipcRenderer.on('conv:cancel', (_e, id) => fn(id)),
  jpegs: (id: number, from: number, count: number) => ipcRenderer.invoke('conv:jpegs', id, from, count),
  chunks: (id: number, from: number, count: number) => ipcRenderer.invoke('conv:chunks', id, from, count),
  progress: (id: number, done: number) => ipcRenderer.send('conv:progress', id, done),
  done: (id: number, data: Uint8Array, probe: unknown) => ipcRenderer.invoke('conv:done', id, data, probe),
  failed: (id: number, message: string) => ipcRenderer.send('conv:failed', id, message),
});
