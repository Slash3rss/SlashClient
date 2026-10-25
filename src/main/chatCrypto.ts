import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';

/**
 * End-to-end encryption of the chat with friends. Every launcher (device) has its own X25519 key;
 * the private half never leaves the computer, the public half is on the SlashClient server so
 * friends can encrypt for it. A message is encrypted once with a fresh key (AES-256-GCM), and that
 * key is wrapped for every device of the friend and of the sender (so the sender's other launchers
 * can read their own history), each wrap with a key from X25519 between the two devices.
 *
 * The server stores and passes on only the envelope. `aad` ties a message to its sender and
 * recipient, so the server cannot move it to another conversation unnoticed.
 *
 * A device added later gets older messages only from another device of the same account that can
 * read them (chatKeys.ts): that device opens the message key and wraps it once more for the new
 * device (`ExtraWrap`), with a key from X25519 between the two of them. Those wraps are stored next
 * to the message, not in the envelope, so older launchers never see them.
 */

export interface DeviceKey { device: string; publicKey: string; privateKey: string }
export interface PublicDevice { device: string; pub: string }
/** A message key wrapped later for one more device of the account, by device `by` (public key `pub`) that could open it. */
export interface ExtraWrap { by: string; pub: string; iv: string; ct: string }

/** What travels in the `text` of an encrypted message. */
export const PREFIX = 'e2e1:';

interface Envelope {
  /** the sender's device and its public key */
  from: string;
  pub: string;
  iv: string;
  ct: string;
  /** device → the message key, wrapped for that device */
  keys: Record<string, { iv: string; ct: string }>;
}

const b64 = (b: Buffer) => b.toString('base64');
const unb64 = (s: string) => Buffer.from(s, 'base64');

/** A new key for this launcher; both halves as base64 DER. */
export function newDeviceKey(): DeviceKey {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return {
    device: randomBytes(12).toString('hex'),
    publicKey: b64(publicKey.export({ type: 'spki', format: 'der' })),
    privateKey: b64(privateKey.export({ type: 'pkcs8', format: 'der' })),
  };
}

const pub = (der: string) => createPublicKey({ key: unb64(der), format: 'der', type: 'spki' });
const priv = (der: string) => createPrivateKey({ key: unb64(der), format: 'der', type: 'pkcs8' });

/** The key that wraps message keys between two devices (the same from both sides). */
function wrapKey(own: DeviceKey, otherDevice: string, otherPub: string, senderDevice: string, recipientDevice: string): Buffer {
  const shared = diffieHellman({ privateKey: priv(own.privateKey), publicKey: pub(otherPub) });
  return Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), `slashclient-chat-v1|${senderDevice}|${recipientDevice}`, 32));
}

function seal(key: Buffer, data: Buffer, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
  return { iv: b64(iv), ct: b64(ct) };
}

function open(key: Buffer, box: { iv: string; ct: string }, aad: string): Buffer {
  const all = unb64(box.ct);
  const d = createDecipheriv('aes-256-gcm', key, unb64(box.iv));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(all.subarray(all.length - 16));
  return Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]);
}

/** The key that wraps a handed-over message key, between the device that had it and the new one. */
function rewrapKey(own: DeviceKey, otherPub: string, by: string, to: string): Buffer {
  const shared = diffieHellman({ privateKey: priv(own.privateKey), publicKey: pub(otherPub) });
  return Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), `slashclient-chat-rewrap-v1|${by}|${to}`, 32));
}

function parse(text: string): Envelope | undefined {
  try {
    const e = JSON.parse(Buffer.from(text.slice(PREFIX.length), 'base64').toString('utf8')) as Envelope;
    return e && typeof e === 'object' && typeof e.iv === 'string' && typeof e.ct === 'string' ? e : undefined;
  } catch {
    return undefined;
  }
}

/** The devices the envelope itself was sealed for. */
export function envelopeDevices(text: string): string[] {
  const e = parse(text);
  return e?.keys && typeof e.keys === 'object' ? Object.keys(e.keys) : [];
}

/**
 * The message key of `text` for this device: from its own wrap in the envelope, or else from a wrap
 * handed over to it later (`extra`). Undefined when neither opens.
 */
export function messageKey(text: string, own: DeviceKey, aad: string, extra?: ExtraWrap): Buffer | undefined {
  const e = parse(text);
  if (!e) return undefined;
  try {
    const wrapped = e.keys?.[own.device];
    if (wrapped) {
      const key = open(wrapKey(own, e.from, e.pub, e.from, own.device), wrapped, aad);
      if (key.length === 32) return key;
    }
  } catch {
    // not this one; maybe the handed-over wrap opens
  }
  if (!extra) return undefined;
  try {
    const key = open(rewrapKey(own, extra.pub, extra.by, own.device), extra, aad);
    return key.length === 32 ? key : undefined;
  } catch {
    return undefined;
  }
}

/** The text of an envelope whose message key is known; undefined when the key is not its own or it was changed. */
export function openWithKey(text: string, key: Buffer, aad: string): string | undefined {
  const e = parse(text);
  if (!e) return undefined;
  try {
    return open(key, e, aad).toString('utf8');
  } catch {
    return undefined;
  }
}

/** A message key (opened by this device) wrapped for another device of the same account; `aad` is the message's. */
export function rewrap(key: Buffer, own: DeviceKey, target: PublicDevice, aad: string): ExtraWrap {
  return { by: own.device, pub: own.publicKey, ...seal(rewrapKey(own, target.pub, own.device, target.device), key, aad) };
}

/**
 * A short code of a device's public key ("3FA2 91C0 77DE 0B14"), shown on the new device and on the
 * one that asks about it: when both show the same, the key is really that device's and not one the
 * server slipped in.
 */
export function fingerprint(publicKey: string): string {
  const hex = createHash('sha256').update(Buffer.from(`slashclient-device|${publicKey}`)).digest('hex').slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g)!.join(' ');
}

/** `text` encrypted for these devices; `aad` names the conversation ("from|to" user ids). */
export function encrypt(text: string, own: DeviceKey, devices: PublicDevice[], aad: string): string {
  const messageKey = randomBytes(32);
  const body = seal(messageKey, Buffer.from(text, 'utf8'), aad);
  const keys: Envelope['keys'] = {};
  for (const d of devices) keys[d.device] = seal(wrapKey(own, d.device, d.pub, own.device, d.device), messageKey, aad);
  const envelope: Envelope = { from: own.device, pub: own.publicKey, ...body, keys };
  return PREFIX + Buffer.from(JSON.stringify(envelope)).toString('base64');
}

export function isEncrypted(text: unknown): text is string {
  return typeof text === 'string' && text.startsWith(PREFIX);
}

/** The text of a message for this device (or handed over to it: `extra`); undefined when it was not encrypted for it or was changed. */
export function decrypt(text: string, own: DeviceKey, aad: string, extra?: ExtraWrap): string | undefined {
  const key = messageKey(text, own, aad, extra);
  return key && openWithKey(text, key, aad);
}
