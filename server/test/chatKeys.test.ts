import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { cleanBackupBlob, cleanDeviceName } from '../src/chatKeys.ts';
import { ChatKeys, type ShareTarget } from '../../src/main/chatKeys.ts';
import { encrypt, fingerprint, newDeviceKey, type DeviceKey } from '../../src/main/chatCrypto.ts';

/**
 * Chat history on a new device (0.9.47): the hand-over from a device the player confirms on, the
 * password backup, removing a device, and that nobody gets at another account's keys or wraps. The
 * launcher's own logic (src/main/chatKeys.ts) runs here against the real server.
 */

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-chat-keys-'));
let base = '';
let app: ReturnType<typeof createApp>;
const CHEAP = { N: 2 ** 14, r: 8, p: 1 };

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
type Player = { token: string; user: { id: string; handle: string; name: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Player;
async function befriend(a: Player, b: Player) {
  await call('POST', '/v1/friends/requests', a.token, { handle: b.user.handle });
  await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
}
const register = async (p: Player, k: DeviceKey, name?: string) => call('POST', '/v1/keys', p.token, { device: k.device, pub: k.publicKey, ...(name ? { name } : {}) });

/** A launcher of `p` with key `k`, as main.ts makes it (its events kept to look at). */
function launcher(p: Player, k: DeviceKey) {
  let shares: ShareTarget[] = [];
  const events: any[] = [];
  const keys = new ChatKeys({
    call: async (method, url, body) => {
      const r = await call(method, url, p.token, body);
      if (r.status >= 400) throw Object.assign(new Error(r.body.error), { code: r.body.error, httpStatus: r.status });
      return r.body;
    },
    own: () => k, me: () => p.user.id, shares: () => shares, saveShares: (l) => (shares = l), emit: (e) => events.push(e), scrypt: CHEAP,
  });
  return { keys, events, shares: () => shares };
}

/** What a friend's launcher (any version) sends: sealed for every key the server lists for both. */
async function sendDirect(from: Player, fromKey: DeviceKey, to: Player, text: string, picture = false) {
  const theirs = (await call('GET', `/v1/keys/${to.user.id}`, from.token)).body.keys;
  const mine = (await call('GET', `/v1/keys/${from.user.id}`, from.token)).body.keys;
  const devices = [...theirs, ...mine];
  const aad = `${from.user.id}|${to.user.id}`;
  let image;
  if (picture) {
    const up = await fetch(`${base}/v1/images/${to.user.id}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${from.token}` }, body: new Uint8Array(100) });
    image = { id: ((await up.json()) as any).id, key: encrypt('{"v":1,"secret":"picture key"}', fromKey, devices, aad) };
  }
  const sent = await call('POST', `/v1/messages/${to.user.id}`, from.token, { text: encrypt(text, fromKey, devices, aad), ...(image ? { image } : {}) });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  return sent.body.message;
}

/** What `k`'s launcher reads of the conversation (undefined where it cannot). */
async function readDirect(viewer: Player, keys: ChatKeys, other: Player) {
  const { messages } = (await call('GET', `/v1/messages/${other.user.id}`, viewer.token)).body;
  return messages.map((m: any) => keys.open(m.text, `${m.from}|${m.to}`, { kind: 'm', id: m.id, field: 'text' }));
}

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 10_000, oauth: {},
    imagesDir: path.join(dir, 'images'), adminHandles: ['Szef'], chatBurst: { messages: 1000, seconds: 10 }, profileViewsPerMinute: 10_000,
    imageLimits: { perDay: 1000, bytesPerDay: 100_000_000 },
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('chat keys: cleaning', () => {
  it('keeps device names plain and short, and only blobs that look like the launcher\'s', () => {
    assert.equal(cleanDeviceName('Windows · <b>PC</b>\n'), 'Windows · bPC/b');
    assert.equal(cleanDeviceName('x'.repeat(100)).length, 60);
    assert.equal(cleanDeviceName(5), '');
    const good = JSON.stringify({ v: 1, kdf: 'scrypt', N: 2 ** 17, r: 8, p: 1, salt: 'A'.repeat(24), device: 'a'.repeat(24), iv: 'B'.repeat(16), ct: 'C'.repeat(200) });
    assert.equal(cleanBackupBlob(good), good);
    assert.equal(cleanBackupBlob(good.replace('"N":131072', '"N":131071')), undefined);
    assert.equal(cleanBackupBlob(good.replace('"N":131072', '"N":4194304')), undefined);
    assert.equal(cleanBackupBlob(good.replace('scrypt', 'pbkdf2')), undefined);
    assert.equal(cleanBackupBlob('{'), undefined);
    assert.equal(cleanBackupBlob('x'.repeat(5000)), undefined);
  });
});

describe('chat keys: a new device gets the history only after a yes on another one', () => {
  it('hands over texts, pictures\' keys and group messages; strangers get nothing', async () => {
    const ala = await login('KeyAla');
    const bob = await login('KeyBob');
    const eve = await login('KeyEve');
    await befriend(ala, bob);
    const pc = newDeviceKey();
    const bobKey = newDeviceKey();
    assert.equal((await register(ala, pc, 'Windows · ALA-PC')).status, 200);
    // an older launcher sends no name: still fine
    assert.equal((await register(bob, bobKey)).status, 200);

    const first = await sendDirect(bob, bobKey, ala, 'stara wiadomość', true);
    const mine = await sendDirect(ala, pc, bob, 'moja odpowiedź');
    const made = await call('POST', '/v1/groups', ala.token, { name: 'Ekipa', members: [bob.user.id] });
    const group = made.body.group.id;
    const groupKeys = (await call('GET', `/v1/groups/${group}/keys`, bob.token)).body.keys;
    const groupText = encrypt('w grupie', bobKey, groupKeys, `group:${group}|${bob.user.id}`);
    const gm = (await call('POST', `/v1/groups/${group}/messages`, bob.token, { text: groupText })).body.message;

    // the laptop comes: it sees the conversation, but cannot read it
    const laptop = newDeviceKey();
    assert.equal((await register(ala, laptop, 'macOS · ala-laptop')).status, 200);
    const fresh = launcher(ala, laptop);
    await fresh.keys.refresh();
    assert.deepEqual(await readDirect(ala, fresh.keys, bob), [undefined, undefined]);
    const listed = fresh.keys.view();
    assert.equal(listed.supported, true);
    assert.deepEqual(listed.devices.map((d) => [d.name, d.handover, d.own]), [['Windows · ALA-PC', 'none', false], ['macOS · ala-laptop', 'pending', true]]);
    // the laptop does not ask about itself
    assert.equal(fresh.events.filter((e) => e.type === 'chat-device-new').length, 0);

    // the PC asks, with the laptop's fingerprint as the laptop itself shows it
    const old = launcher(ala, pc);
    await old.keys.refresh();
    const asked = old.events.find((e) => e.type === 'chat-device-new');
    assert.equal(asked.device.device, laptop.device);
    assert.equal(asked.device.fingerprint, fresh.keys.view().fingerprint);
    assert.equal(asked.device.fingerprint, fingerprint(laptop.publicKey));
    // nothing is handed over before the yes
    assert.equal((await call('GET', `/v1/chat-keys/wraps?device=${laptop.device}`, ala.token)).body.wraps.length, 0);
    // a key that changed since the question: refused
    await assert.rejects(old.keys.decide(laptop.device, true, '0000 0000 0000 0000'), /changed/);

    await old.keys.decide(laptop.device, true, asked.device.fingerprint);
    await old.keys.idle();
    assert.ok(old.events.some((e) => e.type === 'chat-share-done' && e.device === laptop.device && e.done === 4));
    assert.deepEqual(old.shares(), []);
    assert.equal((await call('GET', '/v1/chat-keys', ala.token)).body.devices[1].handover, 'done');

    await fresh.keys.refresh();
    assert.deepEqual(await readDirect(ala, fresh.keys, bob), ['stara wiadomość', 'moja odpowiedź']);
    const picture = (await call('GET', `/v1/messages/${bob.user.id}`, ala.token)).body.messages[0].image;
    assert.equal(fresh.keys.open(picture.key, `${bob.user.id}|${ala.user.id}`, { kind: 'm', id: first.id, field: 'image' }), '{"v":1,"secret":"picture key"}');
    assert.equal(fresh.keys.open(groupText, `group:${group}|${bob.user.id}`, { kind: 'g', id: gm.id, field: 'text' }), 'w grupie');
    // a wrap handed over for one message does not open another
    assert.equal(fresh.keys.open(groupText, `group:${group}|${bob.user.id}`, { kind: 'm', id: mine.id, field: 'text' }), undefined);
    // asked again: nothing left to hand over
    assert.equal((await call('GET', `/v1/chat-keys/history?for=${laptop.device}`, ala.token)).body.items.length, 0);

    // Eve: no wraps for Ala's devices, no wraps of hers on Ala's messages, nothing of Ala's history
    const evil = newDeviceKey();
    await register(eve, evil);
    const wrap = { kind: 'm', id: first.id, field: 'text', by: evil.device, pub: evil.publicKey, iv: 'A'.repeat(16), ct: 'B'.repeat(64) };
    assert.equal((await call('POST', '/v1/chat-keys/wraps', eve.token, { device: laptop.device, wraps: [wrap] })).status, 404);
    assert.equal((await call('GET', `/v1/chat-keys/wraps?device=${laptop.device}`, eve.token)).status, 404);
    assert.deepEqual((await call('POST', '/v1/chat-keys/wraps', eve.token, { device: evil.device, wraps: [wrap] })).body, { stored: 0, refused: 1 });
    assert.deepEqual((await call('POST', '/v1/chat-keys/wraps', eve.token, { device: evil.device, wraps: [{ ...wrap, kind: 'g', id: gm.id }] })).body, { stored: 0, refused: 1 });
    assert.equal((await call('GET', '/v1/chat-keys/history', eve.token)).body.items.length, 0);
    assert.equal((await call('POST', `/v1/chat-keys/devices/${laptop.device}`, eve.token, { handover: 'done' })).status, 404);
    assert.equal((await call('DELETE', `/v1/chat-keys/devices/${laptop.device}`, eve.token)).status, 404);
    // the same device id registered by someone else is theirs, not Ala's
    assert.equal((await register(eve, { ...evil, device: laptop.device })).status, 200);
    assert.equal((await call('GET', `/v1/chat-keys/wraps?device=${laptop.device}`, eve.token)).body.wraps.length, 0);
    // broken wraps are refused whole
    assert.equal((await call('POST', '/v1/chat-keys/wraps', ala.token, { device: laptop.device, wraps: [{ ...wrap, ct: 'x' }] })).status, 400);
  });

  it('a "no" is kept, and the limits come from the admin panel', async () => {
    const ola = await login('KeyOla');
    const admin = await login('Szef');
    const a = newDeviceKey();
    const b = newDeviceKey();
    await register(ola, a);
    await register(ola, b);
    const old = launcher(ola, a);
    await old.keys.refresh();
    assert.equal(old.keys.pending().length, 1);
    await old.keys.decide(b.device, false);
    assert.equal(old.keys.pending().length, 0);
    assert.equal((await call('GET', '/v1/chat-keys', ola.token)).body.devices[1].handover, 'declined');

    assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values: { 'chatKeys.wrapsPerRequest': 10 } })).status, 200);
    const wrap = { kind: 'm', id: 1, field: 'text', by: a.device, pub: a.publicKey, iv: 'A'.repeat(16), ct: 'B'.repeat(64) };
    assert.equal((await call('POST', '/v1/chat-keys/wraps', ola.token, { device: b.device, wraps: Array(11).fill(wrap) })).status, 413);
    assert.equal((await call('GET', '/v1/chat-keys', ola.token)).body.limits.wrapsPerRequest, 10);
    assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values: { 'chatKeys.wrapsPerRequest': 200 } })).status, 200);

    // an account keeps its most recent launchers (the setting); the oldest goes with its wraps
    assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values: { 'chatKeys.maxDevices': 2 } })).status, 200);
    await register(ola, newDeviceKey());
    const left = (await call('GET', `/v1/keys/${ola.user.id}`, ola.token)).body.keys.map((k: any) => k.device);
    assert.equal(left.length, 2);
    assert.ok(!left.includes(a.device));
    assert.equal((await call('POST', '/v1/admin/settings', admin.token, { values: { 'chatKeys.maxDevices': 10 } })).status, 200);
  });

  it('"Usuń urządzenie": its key is gone for friends, it cannot come back, its wraps are gone', async () => {
    const ula = await login('KeyUla');
    const tom = await login('KeyTom');
    await befriend(ula, tom);
    const pc = newDeviceKey();
    const stolen = newDeviceKey();
    await register(ula, pc);
    await register(ula, stolen);
    await register(tom, newDeviceKey());
    const msg = await sendDirect(tom, newDeviceKey(), ula, 'cześć');
    const old = launcher(ula, pc);
    await old.keys.refresh();
    const wrap = { kind: 'm', id: msg.id, field: 'text', by: pc.device, pub: pc.publicKey, iv: 'A'.repeat(16), ct: 'B'.repeat(64) };
    assert.equal((await call('POST', '/v1/chat-keys/wraps', ula.token, { device: stolen.device, wraps: [wrap] })).body.stored, 1);

    await assert.rejects(old.keys.revoke(pc.device), /bad_request/);
    await old.keys.revoke(stolen.device);
    assert.deepEqual((await call('GET', `/v1/keys/${ula.user.id}`, tom.token)).body.keys.map((k: any) => k.device), [pc.device]);
    assert.equal((await register(ula, stolen)).body.error, 'device_revoked');
    assert.equal((await call('GET', `/v1/chat-keys/wraps?device=${stolen.device}`, ula.token)).status, 404);
    assert.equal(app.db.sql.prepare('SELECT COUNT(*) AS n FROM chat_wraps WHERE device = ?').get(stolen.device)!.n, 0);
    assert.deepEqual(old.keys.view().devices.map((d) => d.device), [pc.device]);
  });
});

describe('chat keys: the password backup', () => {
  it('reads all history on a fresh device with the password, and then without it', async () => {
    const ela = await login('BakEla');
    const max = await login('BakMax');
    await befriend(ela, max);
    const pc = newDeviceKey();
    const maxKey = newDeviceKey();
    await register(ela, pc);
    await register(max, maxKey);
    await sendDirect(max, maxKey, ela, 'przed kopią', true);

    const a = launcher(ela, pc);
    await a.keys.refresh();
    await assert.rejects(a.keys.setBackup('krótkie'), /too_short/);
    await assert.rejects(a.keys.setBackup('aaaaaaaaaaaaaa'), /too_simple/);
    await a.keys.setBackup('Zielony-Creeper-42');
    await a.keys.idle();
    assert.ok(a.events.some((e) => e.type === 'chat-share-done' && e.backup && e.done === 2));
    // the server keeps the sealed key, its salt and the KDF's parameters, and the backup is a device to encrypt for
    const state = (await call('GET', '/v1/chat-keys', ela.token)).body;
    const blob = JSON.parse(state.backup.blob);
    assert.deepEqual([blob.kdf, blob.N, blob.r, blob.p], ['scrypt', CHEAP.N, CHEAP.r, CHEAP.p]);
    assert.equal(Buffer.from(blob.salt, 'base64').length, 16);
    assert.ok(!state.backup.blob.includes('Zielony'));
    assert.ok(!state.devices.some((d: any) => d.device === state.backup.device));
    assert.deepEqual((await call('GET', `/v1/keys/${ela.user.id}`, max.token)).body.keys.map((k: any) => k.device), [state.backup.device, pc.device]);
    // a new message from a friend (any launcher) is wrapped for the backup too
    await sendDirect(max, maxKey, ela, 'po kopii');

    // a fresh computer: nothing readable, then the password
    const fresh = newDeviceKey();
    await register(ela, fresh);
    const c = launcher(ela, fresh);
    await c.keys.refresh();
    assert.ok(c.keys.view().backup && !c.keys.view().backup!.unlocked);
    assert.deepEqual(await readDirect(ela, c.keys, max), [undefined, undefined]);
    await assert.rejects(c.keys.unlockBackup('Zly-Creeper-42'), /wrong_password/);
    await c.keys.unlockBackup('Zielony-Creeper-42');
    assert.deepEqual(await readDirect(ela, c.keys, max), ['przed kopią', 'po kopii']);
    await c.keys.idle();
    assert.ok(c.events.some((e) => e.type === 'chat-share-done' && e.own && e.done === 3));

    // the launcher restarted (the backup's key not kept): still readable, with its own key
    const again = launcher(ela, fresh);
    await again.keys.refresh();
    assert.deepEqual(await readDirect(ela, again.keys, max), ['przed kopią', 'po kopii']);

    // a new password: the old one opens nothing, the new one does; the key (and what was wrapped for it) stays
    await assert.rejects(a.keys.changeBackupPassword('nie-to-haslo-1', 'Niebieski-Szkielet-7'), /wrong_password/);
    await a.keys.changeBackupPassword('Zielony-Creeper-42', 'Niebieski-Szkielet-7');
    const d = launcher(ela, newDeviceKey());
    await d.keys.refresh();
    await assert.rejects(d.keys.unlockBackup('Zielony-Creeper-42'), /wrong_password/);
    await d.keys.unlockBackup('Niebieski-Szkielet-7');
    assert.deepEqual(await readDirect(ela, d.keys, max), ['przed kopią', 'po kopii']);
    await d.keys.idle();

    // a blob the server swapped for one sealed with another key: refused, not read
    const forged = (await call('GET', '/v1/chat-keys', ela.token)).body.backup;
    app.db.sql.prepare('UPDATE device_keys SET pub = ? WHERE device = ?').run(newDeviceKey().publicKey, forged.device);
    const e = launcher(ela, newDeviceKey());
    await e.keys.refresh();
    await assert.rejects(e.keys.unlockBackup('Niebieski-Szkielet-7'), /bad_backup/);
    app.db.sql.prepare('UPDATE device_keys SET pub = ? WHERE device = ?').run(forged.pub, forged.device);

    // removed: gone from the server and from the keys friends encrypt for
    await a.keys.removeBackup();
    assert.equal((await call('GET', '/v1/chat-keys', ela.token)).body.backup, null);
    assert.ok(!(await call('GET', `/v1/keys/${ela.user.id}`, max.token)).body.keys.some((k: any) => k.device === forged.device));
    assert.equal(app.db.sql.prepare('SELECT COUNT(*) AS n FROM chat_wraps WHERE device = ?').get(forged.device)!.n, 0);
  });

  it('refuses blobs that are not the launcher\'s and a backup taking a launcher\'s id', async () => {
    const zoe = await login('BakZoe');
    const k = newDeviceKey();
    await register(zoe, k);
    const blob = JSON.stringify({ v: 1, kdf: 'scrypt', N: 2 ** 14, r: 8, p: 1, salt: 'A'.repeat(24), device: k.device, iv: 'B'.repeat(16), ct: 'C'.repeat(200) });
    assert.equal((await call('POST', '/v1/chat-keys/backup', zoe.token, { device: k.device, pub: k.publicKey, blob })).status, 409);
    const other = newDeviceKey();
    assert.equal((await call('POST', '/v1/chat-keys/backup', zoe.token, { device: other.device, pub: other.publicKey, blob })).body.error, 'bad_backup');
    assert.equal((await call('POST', '/v1/chat-keys/backup', zoe.token, { device: other.device, pub: other.publicKey, blob: 'nope' })).body.error, 'bad_backup');
    // and a launcher cannot take the backup's id
    const ok = blob.replace(k.device, other.device);
    assert.equal((await call('POST', '/v1/chat-keys/backup', zoe.token, { device: other.device, pub: other.publicKey, blob: ok })).status, 200);
    assert.equal((await register(zoe, other)).body.error, 'device_revoked');
  });
});
