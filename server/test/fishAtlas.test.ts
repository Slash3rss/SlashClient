import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { cleanUpload } from '../src/fishAtlas.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-fish-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
type Login = { token: string; user: { id: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Login;

const PIKE = { key: 'szczupak', name: 'Szczupak', caught: 3, recordGrams: 4200, recordSize: 'spory', recordPrice: 31.5, maxGrams: 25000, fact: 'Szczupak poluje z zasadzki.' };
// 12:00 UTC on 1 July is 14:00 in Warsaw
const NOON = Date.UTC(2026, 6, 1, 12);
const pike = (at: number, grams: number, size = 'spory', quality = 'dobra', price = 10) => ({ species: 'szczupak', at, grams, size, quality, price });

describe('fish atlas', () => {
  let szef: Login, ala: Login, bob: Login;

  before(async () => {
    app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, adminHandles: ['Szef'], oauth: {} });
    await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    szef = await login('Szef');
    ala = await login('Ala');
    bob = await login('Bob');
  });

  after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('drops anything odd from an upload', () => {
    const now = NOON + 1000;
    const up = cleanUpload({
      species: [PIKE, { ...PIKE, key: 'Szczupak!' }, { ...PIKE, key: 'okon', caught: -1 }, { ...PIKE, key: 'lin', name: '' }, { ...PIKE, key: 'sum', fact: 'x'.repeat(900), recordSize: 7 }],
      catches: [pike(NOON, 900), pike(NOON + 2 * 86_400_000, 1), pike(Date.UTC(2020, 0, 1), 1), { ...pike(NOON, 1), species: 'a b' }, pike(NOON - 1, Number.NaN), pike(NOON - 2, 5, '', '', -1), pike(NOON - 3, 5, '', '', -2), pike(NOON - 4, 7)],
    }, { maxCatches: 2 }, now);
    assert.deepEqual(up.species.map((s) => s.key), ['szczupak', 'sum']);
    assert.equal(up.species[1].fact.length, 600);
    assert.equal(up.species[1].recordSize, '');
    assert.deepEqual(up.catches.map((c) => [c.at, c.price]), [[NOON, 10], [NOON - 2, -1]]);
    assert.deepEqual(cleanUpload({ species: 'x', catches: null }, { maxCatches: 5 }), { species: [], catches: [] });
  });

  it('keeps summaries and catches and shows them only to admins', async () => {
    let res = await call('POST', '/v1/mc/fish-atlas', ala.token, { species: [PIKE], catches: [pike(NOON, 4200, 'spory', 'dobra', 31.5), pike(NOON + 1000, 800, 'mały', 'słaba', 4)] });
    assert.deepEqual(res.body, { enabled: true, species: 1, catches: 2 });
    // the same catch again is not counted twice
    res = await call('POST', '/v1/mc/fish-atlas', ala.token, { species: [PIKE], catches: [pike(NOON + 1000, 800, 'mały', 'słaba', 4)] });
    assert.equal(res.body.catches, 0);
    await call('POST', '/v1/mc/fish-atlas', bob.token, {
      species: [{ ...PIKE, caught: 1, recordGrams: 6000, recordPrice: 20, fact: 'Inna ciekawostka.' }, { ...PIKE, key: 'okon', name: 'Okoń', caught: 0, recordGrams: 0, recordPrice: 0 }],
      catches: [pike(NOON + 3_600_000, 6000, 'okazały', 'dobra', -1)],
    });

    assert.equal((await call('GET', '/v1/admin/fish-atlas', ala.token)).status, 403);
    assert.equal((await call('GET', '/v1/admin/fish-atlas')).status, 401);
    const list = (await call('GET', '/v1/admin/fish-atlas', szef.token)).body;
    assert.equal(list.enabled, true);
    assert.deepEqual(list.species.map((s: any) => s.key), ['okon', 'szczupak']);
    const s = list.species[1];
    assert.equal(s.players, 2);
    assert.equal(s.caught, 4);
    assert.equal(s.catches, 3);
    assert.equal(s.recordGrams, 6000);
    assert.equal(s.recordGramsBy, 'Bob');
    assert.equal(s.recordPrice, 31.5);
    assert.equal(s.recordPriceBy, 'Ala');
    assert.equal(s.avgGrams, Math.round((4200 + 800 + 6000) / 3 * 10) / 10);
    // the catch without a known price is left out of the average
    assert.equal(s.avgPrice, round((31.5 + 4) / 2));
    assert.deepEqual(s.facts.map((f: any) => f.count), [1, 1]);
    assert.equal(list.species[0].players, 0);

    const d = (await call('GET', '/v1/admin/fish-atlas/szczupak', szef.token)).body;
    assert.equal(d.name, 'Szczupak');
    assert.equal(d.catches, 3);
    assert.deepEqual(d.sizes.map((x: any) => x.value).sort(), ['mały', 'okazały', 'spory']);
    assert.equal(d.sizes.find((x: any) => x.value === 'okazały').avgPrice, null);
    assert.deepEqual(d.qualities.find((x: any) => x.value === 'dobra'), { value: 'dobra', count: 2, avgPrice: 31.5 });
    assert.equal(d.weights.reduce((n: number, w: any) => n + w.count, 0), 3);
    assert.equal(d.weights.at(-1).count, 1);
    assert.equal(d.hours[14], 2);
    assert.equal(d.hours[15], 1);
    assert.deepEqual(d.heaviest.map((h: any) => [h.handle, h.grams]), [['Bob', 6000], ['Ala', 4200], ['Ala', 800]]);
    assert.deepEqual(d.players.map((p: any) => [p.handle, p.caught, p.catches]), [['Ala', 3, 2], ['Bob', 1, 1]]);
    assert.equal((await call('GET', '/v1/admin/fish-atlas/nieznany', szef.token)).status, 404);
    assert.equal((await call('GET', '/v1/admin/fish-atlas/szczupak', bob.token)).status, 403);
  });

  it('keeps only the newest catches of a species per player', async () => {
    app.settings.set({ 'fishAtlas.keepPerSpecies': 10 }, 'test');
    const many = Array.from({ length: 15 }, (_, i) => pike(NOON + 86_400_000 + i * 1000, 100 + i));
    await call('POST', '/v1/mc/fish-atlas', bob.token, { catches: many });
    const players = (await call('GET', '/v1/admin/fish-atlas/szczupak', szef.token)).body.players;
    assert.equal(players.find((p: any) => p.handle === 'Bob').catches, 10);
    app.settings.set({ 'fishAtlas.keepPerSpecies': 500 }, 'test');
  });

  it('tells the game to stop when switched off, and limits uploads', async () => {
    app.settings.set({ 'fishAtlas.enabled': false }, 'test');
    assert.deepEqual((await call('POST', '/v1/mc/fish-atlas', ala.token, { species: [PIKE] })).body, { enabled: false });
    app.settings.set({ 'fishAtlas.enabled': true, 'fishAtlas.uploadsPerMinute': 1 }, 'test');
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await call('POST', '/v1/mc/fish-atlas', bob.token, { species: [PIKE] })).status);
    assert.ok(codes.includes(429), codes.join());
    assert.equal((await call('POST', '/v1/mc/fish-atlas', undefined, {})).status, 401);
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}
