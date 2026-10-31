import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { cleanBenchmark, shortName } from '../src/benchmarkShares.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-bench-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text };
}

const run = {
  kind: 'scene', version: '26.3', at: 1761900000000, fps: { avg: 143.4, low1: 78.6, low01: 52.3 }, frames: 12000, stutters: 6, cpuUse: 38, gpuUse: 92,
  scenes: [{ id: 'forest', avg: 140, low1: 77 }, { id: 'nope', avg: 1, low1: 1 }],
  settings: { renderDistance: 12, width: 1920, height: 1080, vsync: false, fullscreen: true, mods: 6, memoryMb: 4096 },
  device: { os: 'Windows 11', cpu: 'AMD Ryzen 7 5800X 8-Core Processor', threads: 16, ramGb: 32, gpu: 'NVIDIA GeForce RTX 3070', java: '25.0.1 (Eclipse Adoptium)' },
};

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'], webDir: path.join(import.meta.dirname, '..', 'web') });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('shared benchmark results', () => {
  it('keeps only known fields, cut short, and refuses what is not a run', () => {
    const r = cleanBenchmark({ ...run, user: 'Jan', path: 'C:\\Users\\Jan', device: { ...run.device, cpu: 'C:\\Users\\Jan\\cpu', extra: 1 }, settings: { ...run.settings, renderDistance: 999 } })!;
    assert.equal((r as any).user, undefined);
    assert.equal((r as any).path, undefined);
    assert.equal((r.device as any).extra, undefined);
    assert.equal(r.device.cpu, 'C:UsersJancpu');
    assert.equal(r.settings.renderDistance, 64);
    assert.deepEqual(r.scenes, [{ id: 'forest', avg: 140, low1: 77 }]);
    assert.equal(cleanBenchmark({ version: '26.3' }), undefined);
    assert.equal(cleanBenchmark('x'), undefined);
    assert.equal(shortName('NVIDIA GeForce RTX 3070'), 'RTX 3070');
    assert.equal(shortName('AMD Ryzen 7 5800X 8-Core Processor'), 'Ryzen 7 5800X');
    assert.equal(shortName('Intel Core i7-9700K CPU @ 3.60GHz'), 'Core i7-9700K');
  });

  it('gives a link anyone can open, with a preview for Discord', async () => {
    const sent = await call('POST', '/v1/benchmarks', undefined, run);
    assert.equal(sent.status, 200);
    assert.match(sent.body.id, /^[A-Za-z0-9]{10}$/);
    assert.equal(sent.body.url, `/benchmark/${sent.body.id}`);
    const back = (await call('GET', `/v1/benchmarks/${sent.body.id}`)).body;
    assert.equal(back.run.fps.avg, 143.4);
    assert.equal(back.run.device.gpu, 'NVIDIA GeForce RTX 3070');
    const page = await call('GET', `/benchmark/${sent.body.id}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /<meta property="og:title" content="143 FPS · scena testowa · Minecraft 26.3">/);
    assert.match(page.text, /og:description" content="1% low 79 · RTX 3070 · Ryzen 7 5800X · 32 GB RAM/);
    assert.equal((await call('GET', '/benchmark/nieistniej')).status, 404);
    assert.equal((await call('GET', '/v1/benchmarks/nieistniej')).status, 404);
    assert.equal((await call('POST', '/v1/benchmarks', undefined, { fps: {} })).status, 400);
  });

  it('takes no new results while the admin has the feature off, old links keep working', async () => {
    const id = (await call('POST', '/v1/benchmarks', undefined, run)).body.id;
    const boss = (await call('POST', '/v1/auth/dev', undefined, { name: 'Szef' })).body.token;
    assert.equal((await call('POST', '/v1/admin/settings', boss, { values: { 'feature.benchmarks': false } })).status, 200);
    const refused = await call('POST', '/v1/benchmarks', undefined, run);
    assert.equal(refused.status, 503);
    assert.equal(refused.body.error, 'feature_disabled');
    assert.equal((await call('GET', `/v1/benchmarks/${id}`)).status, 200);
    assert.equal((await call('POST', '/v1/admin/settings', boss, { values: { 'feature.benchmarks': true } })).status, 200);
  });
});
