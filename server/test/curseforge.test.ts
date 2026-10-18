import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { createCurseForge } from '../src/curseforge.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-curseforge-'));
const seen: { url: string; method: string; key: string | null; body?: string }[] = [];

/** CurseForge as it answers a valid key ("test-key"); anything else is refused. */
const fakeCurseForge = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const key = new Headers(init?.headers).get('x-api-key');
  seen.push({ url, method: init?.method ?? 'GET', key, body: init?.body as string | undefined });
  if (key !== 'test-key') return new Response('', { status: 403 });
  if (url.startsWith('https://api.curseforge.com/v1/mods/search')) return Response.json({ data: [{ id: 238222, name: 'JEI' }], pagination: { totalCount: 1 } });
  if (url === 'https://api.curseforge.com/v1/mods/files') return Response.json({ data: JSON.parse(String(init?.body)).fileIds.map((id: number) => ({ id })) });
  if (url === 'https://api.curseforge.com/v1/mods/1') return new Response('', { status: 404 });
  return new Response('', { status: 500 });
}) as typeof fetch;

let withKey: ReturnType<typeof createApp>;
let noKey: ReturnType<typeof createApp>;
const base = (app: ReturnType<typeof createApp>) => `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

before(async () => {
  withKey = createApp({ dbFile: path.join(dir, 'a.db'), publicUrl: 'http://localhost', allowDevLogin: false, oauth: {}, fetchImpl: fakeCurseForge, curseforgeKey: 'test-key' });
  noKey = createApp({ dbFile: path.join(dir, 'b.db'), publicUrl: 'http://localhost', allowDevLogin: false, oauth: {}, fetchImpl: fakeCurseForge });
  await new Promise<void>((r) => withKey.server.listen(0, r));
  await new Promise<void>((r) => noKey.server.listen(0, r));
});
after(async () => {
  await withKey.close();
  await noKey.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('curseforge proxy', () => {
  it('without a key answers a clear error and never asks CurseForge', async () => {
    const before = seen.length;
    const res = await fetch(`${base(noKey)}/v1/curseforge/mods/search?searchFilter=jei`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'curseforge_unavailable' });
    assert.equal(seen.length, before);
  });

  it('passes a search on with the key, Minecraft only, and keeps the answer', async () => {
    const before = seen.length;
    const url = `${base(withKey)}/v1/curseforge/mods/search?searchFilter=jei&classId=6&gameId=1&apiKey=x`;
    const first = await fetch(url);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { data: [{ id: 238222, name: 'JEI' }], pagination: { totalCount: 1 } });
    const second = await fetch(url);
    assert.equal((await second.json()).data[0].name, 'JEI');
    const asked = seen.slice(before);
    assert.equal(asked.length, 1, 'the second search comes from the cache');
    assert.equal(asked[0].key, 'test-key');
    const params = new URL(asked[0].url).searchParams;
    assert.equal(params.get('gameId'), '432');
    assert.equal(params.get('searchFilter'), 'jei');
    assert.equal(params.get('apiKey'), null, 'unknown parameters are dropped');
  });

  it('passes bulk file lookups on, the same ids in another order come from the cache', async () => {
    const before = seen.length;
    const post = (ids: unknown) => fetch(`${base(withKey)}/v1/curseforge/mods/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileIds: ids }) });
    assert.deepEqual((await (await post([3, 1, 2])).json()).data.map((f: { id: number }) => f.id), [1, 2, 3]);
    assert.equal((await post([2, 3, 1])).status, 200);
    assert.equal(seen.length - before, 1);
    assert.equal((await post(['../x'])).status, 400);
    assert.equal((await post([])).status, 400);
  });

  it('refuses everything that is not a read-only endpoint the launcher uses', async () => {
    const before = seen.length;
    assert.equal((await fetch(`${base(withKey)}/v1/curseforge/games`)).status, 404);
    assert.equal((await fetch(`${base(withKey)}/v1/curseforge/mods/search`, { method: 'DELETE' })).status, 404);
    assert.equal((await fetch(`${base(withKey)}/v1/curseforge/mods/1/../../games`)).status, 404);
    assert.equal(seen.length, before);
    assert.equal((await fetch(`${base(withKey)}/v1/curseforge/mods/1`)).status, 404);
  });

  it('a refused key looks like no key to the launcher', async () => {
    const cf = createCurseForge({ apiKey: 'revoked', fetchImpl: fakeCurseForge });
    const answer = await cf.request('GET', '/mods/238222', new URLSearchParams());
    assert.equal(answer.status, 503);
    assert.equal(JSON.parse(answer.body).error, 'curseforge_unavailable');
  });
});
