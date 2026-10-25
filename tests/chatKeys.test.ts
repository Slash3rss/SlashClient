import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backupDevice, openBackup, passwordProblem, PasswordTries, sealBackup, SCRYPT } from '../src/main/chatBackup';
import { decrypt, encrypt, envelopeDevices, fingerprint, messageKey, newDeviceKey, openWithKey, rewrap } from '../src/main/chatCrypto';

const CHEAP = { N: 2 ** 14, r: 8, p: 1 };

describe('chat history hand-over (re-wrapping)', () => {
  const pc = newDeviceKey();
  const laptop = newDeviceKey();
  const bob = newDeviceKey();
  const eve = newDeviceKey();
  const text = encrypt('stara wiadomość', bob, [bob, pc].map((k) => ({ device: k.device, pub: k.publicKey })), 'bob|ala');

  it('lets a device that reads a message hand its key to a new one', () => {
    assert.deepEqual(envelopeDevices(text).sort(), [bob.device, pc.device].sort());
    assert.equal(decrypt(text, laptop, 'bob|ala'), undefined);
    const key = messageKey(text, pc, 'bob|ala')!;
    assert.equal(key.length, 32);
    const extra = rewrap(key, pc, { device: laptop.device, pub: laptop.publicKey }, 'bob|ala');
    assert.equal(extra.by, pc.device);
    // the wrap holds no key in the clear
    assert.ok(!JSON.stringify(extra).includes(key.toString('base64')));
    assert.equal(decrypt(text, laptop, 'bob|ala', extra), 'stara wiadomość');
    assert.equal(openWithKey(text, messageKey(text, laptop, 'bob|ala', extra)!, 'bob|ala'), 'stara wiadomość');
    // not for another device, nor for another conversation
    assert.equal(decrypt(text, eve, 'bob|ala', extra), undefined);
    assert.equal(decrypt(text, laptop, 'eve|ala', extra), undefined);
    // a wrap from someone else's key (a server slipping one in) does not open the real message
    const fake = rewrap(Buffer.alloc(32, 7), eve, { device: laptop.device, pub: laptop.publicKey }, 'bob|ala');
    assert.equal(decrypt(text, laptop, 'bob|ala', fake), undefined);
    // a changed wrap does not open
    assert.equal(decrypt(text, laptop, 'bob|ala', { ...extra, ct: Buffer.alloc(48, 1).toString('base64') }), undefined);
  });

  it('shows the same short fingerprint for the same key on both devices', () => {
    assert.match(fingerprint(laptop.publicKey), /^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
    assert.equal(fingerprint(laptop.publicKey), fingerprint(laptop.publicKey));
    assert.notEqual(fingerprint(laptop.publicKey), fingerprint(pc.publicKey));
  });
});

describe('chat key backup with a password', () => {
  const backup = newDeviceKey();

  it('seals the key with scrypt and opens it only with the password and the same account', async () => {
    const blob = await sealBackup(backup, 'Zielony-Creeper-42', 'ala', CHEAP);
    const b = JSON.parse(blob);
    // what the server keeps: the KDF and its parameters, a random salt, the sealed key; never the password or the key
    assert.deepEqual([b.v, b.kdf, b.N, b.r, b.p, b.device], [1, 'scrypt', CHEAP.N, CHEAP.r, CHEAP.p, backup.device]);
    assert.equal(Buffer.from(b.salt, 'base64').length, 16);
    assert.ok(!blob.includes('Zielony') && !blob.includes(backup.privateKey));
    assert.equal(backupDevice(blob), backup.device);
    assert.notEqual(JSON.parse(await sealBackup(backup, 'Zielony-Creeper-42', 'ala', CHEAP)).salt, b.salt);

    assert.deepEqual(await openBackup(blob, 'Zielony-Creeper-42', 'ala'), backup);
    await assert.rejects(openBackup(blob, 'zielony-creeper-42', 'ala'), /wrong_password/);
    await assert.rejects(openBackup(blob, 'Zielony-Creeper-42', 'ola'), /wrong_password/);
    // parameters a server could set to hang the launcher are refused before any work
    await assert.rejects(openBackup(JSON.stringify({ ...b, N: 2 ** 24 }), 'Zielony-Creeper-42', 'ala'), /bad_backup/);
    await assert.rejects(openBackup('{', 'x', 'ala'), /bad_backup/);
    // the same letters typed another way (NFC/NFD) are the same password
    const pl = await sealBackup(backup, 'Zażółć-gęślą-1', 'ala', CHEAP);
    assert.deepEqual(await openBackup(pl, 'Zażółć-gęślą-1'.normalize('NFD'), 'ala'), backup);
  });

  it('opens what was sent to the backup key, as any device would', async () => {
    const opened = await openBackup(await sealBackup(backup, 'Zielony-Creeper-42', 'ala', CHEAP), 'Zielony-Creeper-42', 'ala');
    const bob = newDeviceKey();
    const text = encrypt('po kopii', bob, [{ device: backup.device, pub: backup.publicKey }], 'bob|ala');
    assert.equal(decrypt(text, opened, 'bob|ala'), 'po kopii');
  });

  it('uses a strong KDF by default', () => {
    assert.ok(SCRYPT.N >= 2 ** 17 && SCRYPT.r >= 8);
  });

  it('wants a password that is not weak', () => {
    assert.equal(passwordProblem('krótkie1'), 'too_short');
    assert.equal(passwordProblem('aaaaaaaaaaaaaaaa'), 'too_simple');
    assert.equal(passwordProblem('abcdefghij'), 'too_simple');
    assert.equal(passwordProblem('1234567890'), 'too_common');
    assert.equal(passwordProblem('Minecraft123'), 'too_common');
    assert.equal(passwordProblem('Zielony-Creeper-42'), undefined);
    // a long passphrase of words is fine without digits
    assert.equal(passwordProblem('zielony creeper skacze wysoko'), undefined);
    assert.equal(passwordProblem('x'.repeat(300)), 'too_long');
  });

  it('slows down wrong passwords typed in a row', () => {
    let now = 0;
    const tries = new PasswordTries(() => now);
    for (let i = 0; i < 4; i++) tries.failed();
    assert.equal(tries.wait(), 0);
    tries.failed();
    assert.equal(tries.wait(), 15_000);
    now += 15_000;
    assert.equal(tries.wait(), 0);
    tries.failed();
    assert.equal(tries.wait(), 30_000);
    tries.succeeded();
    assert.equal(tries.wait(), 0);
  });
});
