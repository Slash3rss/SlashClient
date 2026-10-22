import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { decrypt, encrypt, newDeviceKey } from '../../src/main/chatCrypto.ts';

// the phone app's module (plain JS for the browser); Node has the same WebCrypto
const app = await import(String(new URL('../web/app/crypto.js', import.meta.url)));

describe('the phone app\'s chat encryption', () => {
  it('its X25519 for older browsers gives what Node\'s gives', () => {
    for (let i = 0; i < 5; i++) {
      const a = generateKeyPairSync('x25519');
      const b = generateKeyPairSync('x25519');
      const aPriv = (a.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).subarray(16);
      const bPub = (b.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).subarray(12);
      const aPub = (a.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).subarray(12);
      assert.deepEqual(Buffer.from(app.x25519(aPriv, bPub)), diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey }));
      const nine = new Uint8Array(32);
      nine[0] = 9;
      assert.deepEqual(Buffer.from(app.x25519(aPriv, nine)), aPub);
    }
  });

  for (const native of [true, false]) {
    it(`reads the launcher's messages and the launcher reads its own (${native ? 'WebCrypto' : 'its own'} X25519)`, async () => {
      const phone = await app.newDeviceKey(native);
      assert.match(phone.device, /^[0-9a-f]{24}$/);
      // the public key is what Node takes, as /v1/keys checks it
      assert.match(phone.publicKey, /^[A-Za-z0-9+/=]{40,80}$/);
      createPublicKey({ key: Buffer.from(phone.publicKey, 'base64'), format: 'der', type: 'spki' });
      const launcher = newDeviceKey();
      const devices = [{ device: phone.device, pub: phone.publicKey }, { device: launcher.device, pub: launcher.publicKey }];

      // launcher → phone
      const fromLauncher = encrypt('Cześć z launchera 👋', launcher, devices, 'ala|ola');
      assert.equal(await app.decrypt(fromLauncher, phone, 'ala|ola'), 'Cześć z launchera 👋');
      // moved to another conversation: refused
      assert.equal(await app.decrypt(fromLauncher, phone, 'ala|ewa'), undefined);

      // phone → launcher (and the phone reads its own)
      const fromPhone = await app.encrypt('Odpisuję z telefonu', phone, devices, 'ola|ala');
      assert.ok(fromPhone.startsWith('e2e1:'));
      assert.equal(decrypt(fromPhone, launcher, 'ola|ala'), 'Odpisuję z telefonu');
      assert.equal(await app.decrypt(fromPhone, phone, 'ola|ala'), 'Odpisuję z telefonu');

      // a device it was not sealed for cannot read it
      const stranger = await app.newDeviceKey(native);
      assert.equal(await app.decrypt(fromPhone, stranger, 'ola|ala'), undefined);
    });
  }

  // groupChat.ts in short (it imports chatCrypto without an extension, which Node cannot load): the aad is the group and the sender
  const groupAad = (group: string, from: string) => `group:${group}|${from}`;

  it('group messages both ways, as groupChat.ts seals them', async () => {
    const phone = await app.newDeviceKey();
    const launcher = newDeviceKey();
    const keys = [{ user: 'ola', device: phone.device, pub: phone.publicKey }, { user: 'ala', device: launcher.device, pub: launcher.publicKey }];
    const sealed = encrypt('Wbijacie?', launcher, keys, groupAad('g1', 'ala'));
    assert.equal(await app.decrypt(sealed, phone, app.groupAad('g1', 'ala')), 'Wbijacie?');
    assert.equal(app.groupAad('g1', 'ala'), groupAad('g1', 'ala'));

    const fromPhone = await app.encrypt('Za 5 min', phone, app.groupDevices(keys, phone), app.groupAad('g1', 'ola'));
    assert.equal(decrypt(fromPhone, launcher, groupAad('g1', 'ola')), 'Za 5 min');
    // the same message claimed by someone else: unreadable
    assert.equal(decrypt(fromPhone, launcher, groupAad('g1', 'ala')), undefined);
  });

  it('keeps a key made by Node (pkcs8) usable', async () => {
    const k = newDeviceKey();
    const phone = app.keyFromPkcs8(k.device, k.publicKey, k.privateKey);
    const other = newDeviceKey();
    const text = encrypt('x', other, [{ device: k.device, pub: k.publicKey }], 'a|b');
    assert.equal(await app.decrypt(text, phone, 'a|b'), 'x');
    createPrivateKey({ key: Buffer.from(k.privateKey, 'base64'), format: 'der', type: 'pkcs8' });
  });
});
