import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-partners-'));
let base = '';
let app: ReturnType<typeof createApp>;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

async function call(method: string, url: string, token?: string, body?: unknown, raw?: Buffer) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(raw ? { 'Content-Type': 'image/png' } : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ? new Uint8Array(raw) : body === undefined ? undefined : JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: any;
  try {
    json = JSON.parse(buf.toString('utf8'));
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, buf, type: res.headers.get('content-type') ?? '' };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('partner servers', () => {
  it('lets the admin add one with a picture the game can fetch', async () => {
    const boss = await login('Szef');
    const owner = await login('Wlasciciel');
    const stranger = await login('Obcy');
    assert.equal((await call('POST', '/v1/admin/partners', stranger.token, { address: 'skyup.pl' })).body.error, 'not_admin');
    assert.equal((await call('POST', '/v1/admin/partners', boss.token, { address: 'zly adres' })).body.error, 'bad_server');
    const p = (await call('POST', '/v1/admin/partners', boss.token, { address: ' SkyUp.pl:25565 ', name: 'SkyUp', owner: '@Wlasciciel' })).body;
    assert.equal(p.address, 'skyup.pl');
    assert.equal(p.owner, 'Wlasciciel');
    assert.equal(p.background, null);
    assert.equal((await call('POST', '/v1/admin/partners', boss.token, { address: 'skyup.pl' })).body.error, 'exists');

    // not a picture (nor WebP, which the game cannot read): refused
    assert.equal((await call('PUT', `/v1/admin/partners/${p.id}/background`, boss.token, undefined, Buffer.from('<svg/>'))).body.error, 'bad_picture');
    assert.equal((await call('PUT', `/v1/admin/partners/${p.id}/background`, boss.token, undefined, Buffer.concat([Buffer.from('RIFF0000WEBPVP8 '), Buffer.alloc(16)]))).body.error, 'bad_picture');
    const withPic = (await call('PUT', `/v1/admin/partners/${p.id}/background`, boss.token, undefined, PNG)).body;
    assert.ok(withPic.background.startsWith(`/v1/partners/${p.id}/background?v=`), withPic.background);

    const listed = (await call('GET', '/v1/partners')).body.partners;
    assert.deepEqual(listed.map((x: any) => x.address), ['skyup.pl']);
    assert.equal(listed[0].owner, undefined);
    const pic = await call('GET', listed[0].background);
    assert.equal(pic.status, 200);
    assert.equal(pic.type, 'image/png');
    assert.ok(pic.buf.equals(PNG));

    // the owner changes it, someone else may not
    assert.deepEqual((await call('GET', '/v1/me/partners', owner.token)).body.partners.map((x: any) => x.id), [p.id]);
    assert.equal((await call('PUT', `/v1/me/partners/${p.id}/background`, stranger.token, undefined, PNG)).body.error, 'not_owner');
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
    const changed = (await call('PUT', `/v1/me/partners/${p.id}/background`, owner.token, undefined, jpg)).body;
    assert.notEqual(changed.background, withPic.background);
    assert.equal((await call('GET', changed.background)).type, 'image/jpeg');
    assert.equal((await call('GET', withPic.background.replace(/\?.*/, ''))).type, 'image/jpeg');
    assert.equal((await call('DELETE', `/v1/me/partners/${p.id}/background`, owner.token)).body.background, null);
    // a second owner: both may change it, the first one stays in `owner`
    const second = await login('DrugiWlasciciel');
    const both = (await call('POST', `/v1/admin/partners/${p.id}`, boss.token, { owners: '@Wlasciciel, DrugiWlasciciel' })).body;
    assert.equal(both.owner, 'Wlasciciel');
    assert.deepEqual(both.owners, ['Wlasciciel', 'DrugiWlasciciel']);
    assert.deepEqual((await call('GET', '/v1/me/partners', second.token)).body.partners.map((x: any) => x.id), [p.id]);
    assert.notEqual((await call('PUT', `/v1/me/partners/${p.id}/background`, second.token, undefined, jpg)).body.background, null);
    // an older panel changing only `owner` keeps the second one
    const older = (await call('POST', `/v1/admin/partners/${p.id}`, boss.token, { owner: '@Wlasciciel' })).body;
    assert.deepEqual(older.owners, ['Wlasciciel', 'DrugiWlasciciel']);
    assert.equal((await call('POST', `/v1/admin/partners/${p.id}`, boss.token, { owners: '@Wlasciciel @nikt_taki' })).body.error, 'no_such_user');
    // back to one: the second one may not any more
    await call('POST', `/v1/admin/partners/${p.id}`, boss.token, { owners: ['Wlasciciel'] });
    assert.equal((await call('DELETE', `/v1/me/partners/${p.id}/background`, second.token)).body.error, 'not_owner');
    await call('DELETE', `/v1/me/partners/${p.id}/background`, owner.token);
    assert.equal((await call('GET', `/v1/partners/${p.id}/background`)).status, 404);

    // too big
    assert.equal((await call('PUT', `/v1/admin/partners/${p.id}/background`, boss.token, undefined, Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)]))).status, 413);

    assert.equal((await call('DELETE', `/v1/admin/partners/${p.id}`, boss.token)).status, 200);
    assert.deepEqual((await call('GET', '/v1/partners')).body.partners, []);
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries.map((e: any) => e.action);
    assert.ok(['partner_add', 'partner_background', 'partner_remove'].every((a) => log.includes(a)));
  });

  it('pins chosen partners for the game, and only pinned ones rotate', async () => {
    const boss = await login('Szef');
    const p = (await call('POST', '/v1/admin/partners', boss.token, { address: 'pin.example.pl', name: 'Pin' })).body;
    assert.equal(p.pinned, false);
    assert.equal((await call('POST', `/v1/admin/partners/${p.id}`, boss.token, { rotate: true })).body.rotate, false);
    const pinned = (await call('POST', `/v1/admin/partners/${p.id}`, boss.token, { pinned: true, rotate: true })).body;
    assert.equal(pinned.pinned, true);
    assert.equal(pinned.rotate, true);
    const listed = (await call('GET', '/v1/partners')).body.partners.find((x: any) => x.address === 'pin.example.pl');
    assert.equal(listed.pinned, true);
    assert.equal(listed.rotate, true);
    assert.equal((await call('POST', `/v1/admin/partners/${p.id}`, boss.token, { pinned: false })).body.rotate, false);
  });

  it('keeps other addresses of a partner, checked and only set by the admin', async () => {
    const boss = await login('Szef');
    const owner = await login('WlascicielAlias');
    const p = (await call('POST', '/v1/admin/partners', boss.token, { address: 'alias.example.pl', name: 'Alias', owner: '@WlascicielAlias' })).body;
    const other = (await call('POST', '/v1/admin/partners', boss.token, { address: 'other.example.pl', name: 'Inny' })).body;
    assert.deepEqual(p.aliases, []);
    const url = `/v1/admin/partners/${p.id}/aliases`;

    // not the owner, nor anyone else: only the admin
    assert.equal((await call('PUT', url, owner.token, { aliases: ['alias.eu'] })).body.error, 'not_admin');
    assert.equal((await call('PUT', `/v1/me/partners/${p.id}/aliases`, owner.token, { aliases: ['alias.eu'] })).status, 404);

    // normalized, repeats and the partner's own address dropped; one per line works too
    const saved = (await call('PUT', url, boss.token, { aliases: [' Alias.EU:25565 ', 'alias.eu', '51.38.10.20', 'ALIAS.example.pl', '', '51.38.10.20:25566'] })).body;
    assert.deepEqual(saved.aliases, ['alias.eu', '51.38.10.20', '51.38.10.20:25566']);
    assert.deepEqual((await call('PUT', url, boss.token, { aliases: 'alias.eu\n\nmc.alias.net.\n' })).body.aliases, ['alias.eu', 'mc.alias.net']);
    const listed = (await call('GET', '/v1/partners')).body.partners.find((x: any) => x.id === p.id);
    assert.deepEqual(listed.aliases, ['alias.eu', 'mc.alias.net']);
    assert.deepEqual((await call('GET', '/v1/me/partners', owner.token)).body.partners[0].aliases, ['alias.eu', 'mc.alias.net']);

    // not an address, too many: refused with what was wrong, the list unchanged
    const bad = (await call('PUT', url, boss.token, { aliases: ['ok.pl', 'zly adres'] }));
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'bad_alias');
    assert.equal(bad.body.alias, 'zly adres');
    const many = (await call('PUT', url, boss.token, { aliases: Array.from({ length: 21 }, (_, i) => `a${i}.pl`) })).body;
    assert.equal(many.error, 'too_many_aliases');
    assert.equal(many.max, 20);

    // another partner's address or other address is taken, and a new partner cannot take an alias as its address
    const taken = await call('PUT', url, boss.token, { aliases: ['alias.eu', 'Other.Example.pl'] });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error, 'alias_taken');
    assert.equal(taken.body.alias, 'other.example.pl');
    assert.equal(taken.body.partner, 'Inny');
    assert.equal((await call('PUT', `/v1/admin/partners/${other.id}/aliases`, boss.token, { aliases: ['mc.alias.net'] })).body.partner, 'Alias');
    assert.equal((await call('POST', '/v1/admin/partners', boss.token, { address: 'alias.eu' })).body.error, 'alias_taken');
    assert.deepEqual((await call('GET', '/v1/partners')).body.partners.find((x: any) => x.id === p.id).aliases, ['alias.eu', 'mc.alias.net']);

    // cleared with an empty list; every change is in the admin log
    assert.deepEqual((await call('PUT', url, boss.token, { aliases: [] })).body.aliases, []);
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries.filter((e: any) => e.action === 'partner_aliases');
    assert.ok(log.some((e: any) => e.detail === 'alias.eu, mc.alias.net'), JSON.stringify(log));
    assert.ok(log.some((e: any) => e.detail === '—'));
  });
});
