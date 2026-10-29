import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';

// Messages nobody signed in can send must not take the server down for everyone.

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-ws-robust-'));
let base = '';
let app: ReturnType<typeof createApp>;

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {} });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  // the last socket's close is handled first
  await new Promise((r) => setTimeout(r, 200));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Opens a socket, sends what is given, and waits until the server closes it (or a moment passes). */
async function send(at: string, data: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + at);
  ws.on('error', () => {});
  await new Promise<void>((r) => ws.once('open', () => r()));
  ws.send(data);
  await new Promise<void>((r) => {
    ws.once('close', () => r());
    setTimeout(() => {
      ws.terminate();
      r();
    }, 500);
  });
}

const healthy = async () => (await fetch(base + '/v1/health')).status === 200;

describe('websockets with bad messages', () => {
  it('null, a number and a list do not end the process', async () => {
    for (const at of ['/v1/ws', '/v1/lan']) for (const bad of ['null', '42', '[]', '"x"']) await send(at, bad);
    assert.ok(await healthy());
  });

  it('a frame over the size limit only closes that connection', async () => {
    await send('/v1/ws', 'x'.repeat(9000));
    assert.ok(await healthy());
  });

  it('a request body over the limit is refused without ending the process', async () => {
    const big = await fetch(base + '/v1/auth/dev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(40_000) }) }).catch(() => undefined);
    if (big) assert.equal(big.status, 413);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(await healthy());
  });

  it('signs in afterwards as usual', async () => {
    const { token } = (await (await fetch(base + '/v1/auth/dev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ola' }) })).json()) as { token: string };
    const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
    await new Promise<void>((r) => ws.once('open', () => r()));
    ws.send(JSON.stringify({ type: 'auth', token }));
    const ready = await new Promise<{ type: string }>((r) => ws.once('message', (m) => r(JSON.parse(String(m)))));
    assert.equal(ready.type, 'ready');
    ws.close();
  });
});
