import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decrypt, encrypt, isEncrypted, newDeviceKey } from '../src/main/chatCrypto';

describe('chat encryption', () => {
  const alaLaptop = newDeviceKey();
  const alaPc = newDeviceKey();
  const bob = newDeviceKey();
  const eve = newDeviceKey();
  const devices = [alaLaptop, alaPc, bob].map((k) => ({ device: k.device, pub: k.publicKey }));

  it('opens for every device it was sealed for, and nobody else', () => {
    const text = encrypt('cześć, wbijasz na skyup? 🎮', alaLaptop, devices, 'ala|bob');
    assert.ok(isEncrypted(text));
    assert.ok(!text.includes('skyup'));
    // the friend, and the sender's own launchers (also the one that sent it)
    for (const k of [bob, alaPc, alaLaptop]) assert.equal(decrypt(text, k, 'ala|bob'), 'cześć, wbijasz na skyup? 🎮');
    assert.equal(decrypt(text, eve, 'ala|bob'), undefined);
  });

  it('notices a message moved to another conversation or changed', () => {
    const text = encrypt('tajne', alaLaptop, devices, 'ala|bob');
    assert.equal(decrypt(text, bob, 'eve|bob'), undefined);
    const envelope = JSON.parse(Buffer.from(text.slice(5), 'base64').toString());
    const ct = Buffer.from(envelope.ct, 'base64');
    ct[0] ^= 1;
    envelope.ct = ct.toString('base64');
    assert.equal(decrypt('e2e1:' + Buffer.from(JSON.stringify(envelope)).toString('base64'), bob, 'ala|bob'), undefined);
    assert.equal(decrypt('e2e1:not base64 json', bob, 'ala|bob'), undefined);
  });

  it('uses a new key and nonce for each message', () => {
    assert.notEqual(encrypt('to samo', alaLaptop, devices, 'a|b'), encrypt('to samo', alaLaptop, devices, 'a|b'));
    assert.ok(!isEncrypted('zwykły tekst'));
  });
});
