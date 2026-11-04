import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { ITEMS, SETS, SLOTS, setsFor } from '../src/cosmetics.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-sets-'));
let app: ReturnType<typeof createApp>;
let base = '';

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, adminHandles: ['SzefZestaw'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('cosmetic sets', () => {
  it('can be completed by any player: no part only for a rank or for supporters', () => {
    for (const s of SETS) {
      for (const id of Object.values(s.parts)) {
        const item = ITEMS.find((i) => i.id === id);
        assert.ok(item && !item.rank && !item.supporter, `${s.id}: ${id}`);
      }
    }
  });

  it('are defined with a name in both languages and parts in real slots', () => {
    assert.equal(SETS.length, 13);
    assert.equal(new Set(SETS.map((s) => s.id)).size, SETS.length);
    for (const s of SETS) {
      assert.ok(s.name && s.nameEn, s.id);
      assert.ok(Object.keys(s.parts).length >= 2, s.id);
      for (const slot of Object.keys(s.parts)) assert.ok(SLOTS.includes(slot as never), `${s.id} ${slot}`);
      // a part that exists already is in the slot the set names
      for (const [slot, id] of Object.entries(s.parts)) {
        const it = ITEMS.find((i) => i.id === id);
        if (it) assert.equal(it.slot, slot, `${s.id} ${id}`);
      }
    }
    assert.deepEqual(SETS.find((s) => s.id === 'wolf')?.parts, { ears: 'wolfears', tail: 'wolftail' });
  });

  it('leave out parts a client does not get, and sets with none left', () => {
    const only = setsFor((slot, id) => slot === 'tail' && id === 'wolftail');
    assert.deepEqual(only.map((s) => [s.id, s.parts]), [['wolf', { tail: 'wolftail' }]]);
    assert.deepEqual(setsFor(() => false), []);
  });

  it('come with the catalogue, only with the items it lists', async () => {
    const { body } = await call('GET', '/v1/cosmetics', undefined, undefined, { 'X-SlashClient': 'launcher/0.9.70' });
    assert.ok(Array.isArray(body.sets) && body.sets.length > 0);
    const listed = new Set(body.items.map((i: { slot: string; id: string }) => `${i.slot}:${i.id}`));
    for (const s of body.sets) {
      assert.ok(s.name && s.nameEn);
      for (const [slot, id] of Object.entries(s.parts)) assert.ok(listed.has(`${slot}:${id}`), `${s.id} ${slot}:${id}`);
    }
    // the cat set's existing parts, in the set's order
    const cat = body.sets.find((s: { id: string }) => s.id === 'cat');
    assert.deepEqual(Object.keys(cat.parts).filter((k) => ['ears', 'tail', 'pet'].includes(k)), ['ears', 'tail', 'pet']);
    // a launcher from before (0.9.20) does not know the pets from 0.9.29: the cat set has no pet for it
    const old = (await call('GET', '/v1/cosmetics', undefined, undefined, { 'X-SlashClient': 'launcher/0.9.20' })).body;
    assert.equal(old.sets.find((s: { id: string }) => s.id === 'cat').parts.pet, undefined);
    // a part switched off by the admin leaves the set too
    app.db.setCosmetic('wolftail', false, false);
    const off = (await call('GET', '/v1/cosmetics')).body;
    assert.equal(off.sets.find((s: { id: string }) => s.id === 'wolf')?.parts.tail, undefined);
    app.db.setCosmetic('wolftail', true, false);
  });

  it('are worn with one request: the cape and the other slots, or nothing when a part is not ours', async () => {
    const admin = await login('SzefZestaw');
    // admins may wear everything: the whole frost set at once
    const frost = SETS.find((s) => s.id === 'frost')!;
    const { cape, ...rest } = Object.fromEntries(Object.entries(frost.parts).filter(([, id]) => ITEMS.some((i) => i.id === id)));
    const res = await call('POST', '/v1/me', admin.token, { cape, loadout: rest });
    assert.equal(res.status, 200);
    assert.equal(res.body.cape, 'ice');
    assert.equal(res.body.loadout.wings, 'frost');
    assert.equal(res.body.loadout.kill, 'shatter');
    // a player without the ice cape (an achievement's) gets nothing of it: not even the free wings
    const player = await login('ZestawGracz');
    const bad = await call('POST', '/v1/me', player.token, { cape: 'ice', loadout: { wings: 'frost' } });
    assert.equal(bad.status, 400);
    const me = (await call('GET', '/v1/me', player.token)).body;
    assert.equal(me.cape ?? '', '');
    assert.equal(me.loadout?.wings, undefined);
    // and with a slot it cannot wear the cape stays as it was
    const bad2 = await call('POST', '/v1/me', player.token, { cape: 'slash', loadout: { wings: 'obsidianwings' } });
    assert.equal(bad2.status, 400);
    assert.equal((await call('GET', '/v1/me', player.token)).body.cape ?? '', '');
  });
});
