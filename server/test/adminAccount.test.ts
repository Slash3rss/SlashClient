import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-account-'));
const web = path.join(dir, 'web');
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method, redirect: 'manual',
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
  return { status: res.status, body: json, location: res.headers.get('location') ?? '' };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; handle: string } };
const befriend = async (a: { token: string }, b: { token: string; user: { handle: string } }, aHandle: string) => {
  await call('POST', '/v1/friends/requests', a.token, { handle: b.user.handle });
  await call('POST', '/v1/friends/requests', b.token, { handle: aHandle });
};

before(async () => {
  mkdirSync(web, { recursive: true });
  writeFileSync(path.join(web, 'profil.html'), '<!doctype html><title>profil</title><!--preview-->');
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'], webDir: web });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('admin: account details', () => {
  it('changes the name and the nick; the old profile address leads to the new one; nicks stay unique', async () => {
    const boss = await login('Szef');
    const ala = await login('Ala');
    await login('Bartek');
    const path = `/v1/admin/users/${ala.user.id}/account`;
    // only admins
    assert.equal((await call('GET', path, ala.token)).body.error, 'not_admin');
    assert.equal((await call('POST', path, boss.token, { handle: 'bad nick!' })).body.error, 'bad_handle');
    assert.equal((await call('POST', path, boss.token, { handle: 'bartek' })).body.error, 'handle_taken');
    // nobody becomes an admin by taking a configured admin's nick, and theirs stays
    assert.equal((await call('POST', path, boss.token, { handle: 'szef' })).body.error, 'handle_reserved');
    assert.equal((await call('POST', `/v1/admin/users/${boss.user.id}/account`, boss.token, { handle: 'Szefuncio' })).body.error, 'config_admin');
    assert.equal((await call('POST', path, boss.token, { name: '   ' })).body.error, 'bad_name');
    const done = (await call('POST', path, boss.token, { name: 'Ala Nowa', handle: 'AlaNowa', showServer: false })).body;
    assert.equal(done.handle, 'AlaNowa');
    assert.equal(done.name, 'Ala Nowa');
    assert.equal(done.showServer, false);
    assert.deepEqual(done.formerHandles, ['Ala']);
    const me = (await call('GET', '/v1/me', ala.token)).body;
    assert.equal(me.handle, 'AlaNowa');
    // the old address of the profile leads to the new one
    const moved = await call('GET', '/u/Ala');
    assert.equal(moved.status, 301);
    assert.equal(moved.location, '/u/AlaNowa');
    // the account's log has the change, by its id
    assert.ok(done.log.some((e: any) => e.action === 'account_edit' && e.detail.includes('@Ala → @AlaNowa')));
    // a nick differing only in case is the same nick for anyone else, but the owner may change its case
    assert.equal((await call('POST', `/v1/admin/users/${(await login('Cyryl')).user.id}/account`, boss.token, { handle: 'alanowa' })).body.error, 'handle_taken');
    assert.equal((await call('POST', path, boss.token, { handle: 'alanowa' })).body.handle, 'alanowa');
  });

  it('sets what the player wears, only what they own or may wear, per Minecraft account too', async () => {
    const boss = await login('Szef');
    const ola = await login('Ola');
    const path = `/v1/admin/users/${ola.user.id}/account`;
    // a shop cape nobody gave her
    const refused = (await call('POST', path, boss.token, { loadout: { cape: 'waves' } })).body;
    assert.equal(refused.error, 'bad_cape');
    assert.equal((await call('POST', path, boss.token, { loadout: { wings: 'nope' } })).body.error, 'bad_item');
    const set = (await call('POST', path, boss.token, { loadout: { wings: 'angel' } })).body;
    assert.equal(set.loadout.wings, 'angel');
    assert.ok(set.wearable.some((i: any) => i.id === 'angel'));
    assert.ok(!set.wearable.some((i: any) => i.id === 'waves'));
    // once she owns it, the admin may put it on
    await call('POST', '/v1/admin/cosmetics/waves/grants', boss.token, { handle: 'Ola' });
    const worn = (await call('POST', path, boss.token, { loadout: { cape: 'waves', wings: '' } })).body;
    assert.equal(worn.loadout.cape, 'waves');
    assert.equal(worn.loadout.wings, undefined);
    assert.equal((await call('GET', '/v1/me', ola.token)).body.cape, 'waves');
    // a Minecraft account's own set
    app.db.link('minecraft', 'a'.repeat(32), ola.user.id, 'OlaMC');
    assert.equal((await call('POST', path, boss.token, { character: 'b'.repeat(32), loadout: {} })).body.error, 'not_linked');
    const own = (await call('POST', path, boss.token, { character: 'a'.repeat(32), loadout: { wings: 'demon' } })).body;
    assert.deepEqual(own.characters[0].loadout, { cape: 'waves', wings: 'demon' });
    const back = (await call('POST', path, boss.token, { character: 'a'.repeat(32), own: false })).body;
    assert.equal(back.characters[0].loadout, null);
    // the avatar: that Minecraft account's face, then the default again
    assert.equal((await call('POST', path, boss.token, { avatarSource: 'c'.repeat(32) })).body.error, 'bad_avatar');
    assert.equal((await call('POST', path, boss.token, { avatarSource: 'a'.repeat(32) })).body.avatarSource, 'a'.repeat(32));
    assert.equal((await call('POST', path, boss.token, { avatarSource: '' })).body.avatarSource, '');
  });

  it('lists sign-ins and unlinks one, never the last; ends one session or one phone', async () => {
    const boss = await login('Szef');
    const ewa = await login('Ewa');
    const ewa2 = await login('Ewa');
    const path = `/v1/admin/users/${ewa.user.id}`;
    app.db.link('discord', '123', ewa.user.id);
    let d = (await call('GET', `${path}/account`, boss.token)).body;
    assert.deepEqual(d.identities.map((i: any) => i.provider), ['dev', 'discord']);
    assert.equal(d.sessions.length, 2);
    // never the admin's own, nor a configured admin's
    assert.equal((await call('DELETE', `/v1/admin/users/${boss.user.id}/identities/dev/szef`, boss.token)).body.error, 'self');
    d = (await call('DELETE', `${path}/identities/discord/123`, boss.token)).body;
    assert.deepEqual(d.identities.map((i: any) => i.provider), ['dev']);
    assert.equal((await call('DELETE', `${path}/identities/dev/ewa`, boss.token)).body.error, 'last_provider');
    assert.equal((await call('DELETE', `${path}/identities/discord/123`, boss.token)).status, 404);
    // one session ends, the other stays; the hash of the token is never shown
    assert.ok(!JSON.stringify(d.sessions).includes('hash'));
    const first = d.sessions[d.sessions.length - 1].id;
    d = (await call('DELETE', `${path}/sessions/${first}`, boss.token)).body;
    assert.equal(d.sessions.length, 1);
    const statuses = [(await call('GET', '/v1/me', ewa.token)).status, (await call('GET', '/v1/me', ewa2.token)).status].sort();
    assert.deepEqual(statuses, [200, 401]);
    // a phone's notifications
    app.phones!.store.save(ewa.user.id, { endpoint: 'https://fcm.googleapis.com/x', p256dh: 'p', auth: 'a', vapid: 'v', prefs: { dm: true, group: true, clan: true, mention: true, invite: true }, lang: 'pl', label: 'Pixel' }, 5);
    d = (await call('GET', `${path}/account`, boss.token)).body;
    assert.equal(d.phones.length, 1);
    assert.equal(d.phones[0].label, 'Pixel');
    assert.equal(d.phones[0].endpoint, undefined);
    d = (await call('DELETE', `${path}/phones/${d.phones[0].id}`, boss.token)).body;
    assert.equal(d.phones.length, 0);
    assert.ok(d.log.some((e: any) => e.action === 'unlink') && d.log.some((e: any) => e.action === 'session_revoke') && d.log.some((e: any) => e.action === 'push_revoke'));
  });
});

describe('admin: bans with a reason and an end', () => {
  it('tells the player why and until when; the old switch still works; an ended ban lifts itself', async () => {
    const boss = await login('Szef');
    const jan = await login('Jan');
    const path = `/v1/admin/users/${jan.user.id}`;
    assert.equal((await call('POST', path, boss.token, { banned: true, banUntil: Date.now() - 1000 })).body.error, 'bad_until');
    const until = Date.now() + 3_600_000;
    const banned = (await call('POST', path, boss.token, { banned: true, banReason: 'Spam', banUntil: until })).body;
    assert.equal(banned.banned, true);
    assert.equal(banned.banReason, 'Spam');
    assert.equal(banned.banUntil, until);
    const refused = await call('POST', '/v1/auth/dev', undefined, { name: 'Jan' });
    assert.equal(refused.status, 403);
    assert.deepEqual(refused.body, { reason: 'Spam', until, error: 'banned' });
    // the reason changes while banned
    assert.equal((await call('POST', path, boss.token, { banned: true, banReason: 'Spam i obelgi' })).body.banReason, 'Spam i obelgi');
    // the old panel's switch: no reason, for good
    await call('POST', path, boss.token, { banned: false });
    await call('POST', path, boss.token, { banned: true });
    assert.deepEqual((await call('POST', '/v1/auth/dev', undefined, { name: 'Jan' })).body, { error: 'banned' });
    await call('POST', path, boss.token, { banned: false });
    // a ban that ended: signing in works at once, the minute's tick lifts it and writes it down
    await call('POST', path, boss.token, { banned: true, banReason: 'Na chwilę', banUntil: Date.now() + 60_000 });
    app.db.sql.prepare('UPDATE users SET ban_until = ? WHERE uuid = ?').run(Date.now() - 1, jan.user.id);
    assert.equal((await call('POST', '/v1/auth/dev', undefined, { name: 'Jan' })).status, 200);
    app.accounts.tick();
    const d = (await call('GET', `${path}/account`, boss.token)).body;
    assert.equal(d.ban, null);
    assert.equal(app.db.sql.prepare('SELECT banned FROM users WHERE uuid = ?').get(jan.user.id)!.banned, 0);
    assert.deepEqual(d.log.slice(0, 2).map((e: any) => e.action), ['unban_auto', 'ban']);
  });
});

describe('admin: export, delete and restore', () => {
  it('exports the account without secrets or what messages say', async () => {
    const boss = await login('Szef');
    const kuba = await login('Kuba');
    const lena = await login('Lena');
    await befriend(kuba, lena, 'Kuba');
    await call('POST', `/v1/messages/${lena.user.id}`, kuba.token, { text: 'tajemnica' });
    const out = (await call('GET', `/v1/admin/users/${kuba.user.id}/export`, boss.token)).body;
    assert.equal(out.account.handle, 'Kuba');
    assert.equal(out.tables.users[0].uuid, kuba.user.id);
    assert.equal(out.tables.friendships.length, 1);
    assert.equal(out.tables.messages.length, 1);
    assert.equal(out.tables.messages[0].text, undefined);
    assert.equal(out.tables.sessions[0].token_hash, undefined);
    assert.ok(!JSON.stringify(out).includes('tajemnica'));
    assert.equal((await call('GET', `/v1/admin/users/${kuba.user.id}/export`, kuba.token)).status, 403);
  });

  it('keeps a deleted account for a while and puts it back, unless its nick was taken meanwhile', async () => {
    const boss = await login('Szef');
    const zosia = await login('Zosia');
    const piotr = await login('Piotr');
    await befriend(zosia, piotr, 'Zosia');
    await call('POST', '/v1/admin/cosmetics/waves/grants', boss.token, { handle: 'Zosia' });
    assert.equal((await call('DELETE', `/v1/admin/users/${boss.user.id}`, boss.token)).body.error, 'self');
    assert.equal((await call('DELETE', `/v1/admin/users/${zosia.user.id}`, boss.token)).body.restorable, true);
    assert.equal((await call('GET', `/v1/admin/users/${zosia.user.id}`, boss.token)).status, 404);
    assert.equal((await call('GET', '/v1/friends', piotr.token)).body.friends.length, 0);
    let list = (await call('GET', '/v1/admin/deleted-accounts', boss.token)).body;
    const entry = list.accounts.find((a: any) => a.uuid === zosia.user.id);
    assert.equal(entry.handle, 'Zosia');
    assert.equal(list.days, 30);
    // someone took the nick meanwhile: refused with the reason
    const taker = await login('Zosia');
    const taken = await call('POST', `/v1/admin/deleted-accounts/${entry.id}/restore`, boss.token);
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error, 'handle_taken');
    await call('DELETE', `/v1/admin/users/${taker.user.id}`, boss.token);
    // (the newcomer took the same test sign-in too: it is free again now)
    const back = (await call('POST', `/v1/admin/deleted-accounts/${entry.id}/restore`, boss.token)).body;
    assert.equal(back.ok, true);
    const again = await login('Zosia');
    assert.equal(again.user.id, zosia.user.id);
    assert.equal((await call('GET', '/v1/friends', piotr.token)).body.friends[0].id, zosia.user.id);
    assert.ok((await call('GET', `/v1/admin/users/${zosia.user.id}`, boss.token)).body.grants.includes('waves'));
    list = (await call('GET', '/v1/admin/deleted-accounts', boss.token)).body;
    assert.ok(!list.accounts.some((a: any) => a.uuid === zosia.user.id));
    const d = (await call('GET', `/v1/admin/users/${zosia.user.id}/account`, boss.token)).body;
    assert.ok(d.log.some((e: any) => e.action === 'restore') && d.log.some((e: any) => e.action === 'delete'));
  });

  it('forgets deleted accounts after their time, or at once when asked', async () => {
    const boss = await login('Szef');
    const a = await login('Stary');
    const b = await login('Nowy');
    await call('DELETE', `/v1/admin/users/${a.user.id}`, boss.token);
    await call('DELETE', `/v1/admin/users/${b.user.id}`, boss.token);
    const ids = (await call('GET', '/v1/admin/deleted-accounts', boss.token)).body.accounts.filter((x: any) => ['Stary', 'Nowy'].includes(x.handle));
    const stary = ids.find((x: any) => x.handle === 'Stary');
    const nowy = ids.find((x: any) => x.handle === 'Nowy');
    assert.equal((await call('DELETE', `/v1/admin/deleted-accounts/${nowy.id}`, boss.token)).body.ok, true);
    app.db.sql.prepare('UPDATE deleted_accounts SET deleted_at = ? WHERE id = ?').run(Date.now() - 31 * 86_400_000, stary.id);
    app.accounts.tick();
    const left = (await call('GET', '/v1/admin/deleted-accounts', boss.token)).body.accounts;
    assert.ok(!left.some((x: any) => x.id === stary.id || x.id === nowy.id));
    assert.equal((await call('POST', `/v1/admin/deleted-accounts/${stary.id}/restore`, boss.token)).status, 404);
  });
});
