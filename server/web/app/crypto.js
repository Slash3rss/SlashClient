// End-to-end encryption of chats on the phone, the same envelope as the launcher's (src/main/chatCrypto.ts):
// every device has its own X25519 key; a message is sealed once with a fresh AES-256-GCM key, and that
// key is wrapped for each device of the friend (or the group's members) and of the sender, with a key
// from X25519 between the two devices (HKDF-SHA256). The server only ever stores the envelope.
//
// The private key never leaves the phone: with WebCrypto's X25519 (Chrome 133+, Safari 17+, Firefox
// 130+) it is a key the page itself cannot even read; older browsers (iOS 16.4) use the small X25519
// below, with the key's bytes kept in the phone's own storage.

export const PREFIX = 'e2e1:';
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- base64 (standard, as Node writes it) ----

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

// DER wrappers of a raw X25519 key, as Node exports them (spki for the public half, pkcs8 for the private)
const SPKI = Uint8Array.of(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00);
const PKCS8 = Uint8Array.of(0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20);
export const spkiOf = (raw) => concat(SPKI, raw);
export const rawOfSpki = (der) => der.subarray(der.length - 32);

// ---- X25519 for browsers without it (RFC 7748, with BigInt) ----

const P = (1n << 255n) - 19n;
const A24 = 121665n;
const mod = (a) => ((a % P) + P) % P;
function inverse(a) {
  let r = 1n;
  let b = mod(a);
  for (let e = P - 2n; e > 0n; e >>= 1n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
  }
  return r;
}
const toBig = (bytes) => bytes.reduceRight((n, b) => (n << 8n) | BigInt(b), 0n);
const toBytes = (n) => {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++, n >>= 8n) out[i] = Number(n & 0xffn);
  return out;
};

/** X25519(scalar, u): both 32 bytes, little-endian, the scalar clamped as the RFC says. */
export function x25519(scalar, u) {
  const k = Uint8Array.from(scalar);
  k[0] &= 248;
  k[31] &= 127;
  k[31] |= 64;
  const kn = toBig(k);
  const x1 = toBig(u) & ((1n << 255n) - 1n);
  let [x2, z2, x3, z3] = [1n, 0n, x1, 1n];
  let swap = 0n;
  for (let t = 254n; t >= 0n; t--) {
    const bit = (kn >> t) & 1n;
    if (swap ^ bit) [x2, x3, z2, z3] = [x3, x2, z3, z2];
    swap = bit;
    const a = x2 + z2;
    const aa = (a * a) % P;
    const b = x2 - z2;
    const bb = mod(b * b);
    const e = mod(aa - bb);
    const c = x3 + z3;
    const d = x3 - z3;
    const da = mod(d * a);
    const cb = mod(c * b);
    x3 = mod((da + cb) ** 2n);
    z3 = mod(x1 * mod((da - cb) ** 2n));
    x2 = (aa * bb) % P;
    z2 = mod(e * (aa + A24 * e));
  }
  if (swap) [x2, z2] = [x3, z3];
  return toBytes((x2 * inverse(z2)) % P);
}
const BASE = toBytes(9n);

let native;
/** Whether this browser has X25519 in WebCrypto (asked once). */
export async function hasNativeX25519() {
  native ??= subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']).then(() => true, () => false);
  return native;
}

/**
 * A new key for this phone: `device` (24 hex characters, as the server wants), the public half as
 * base64 spki (what /v1/keys takes), and the private half – a CryptoKey that cannot be exported,
 * or 32 bytes on browsers without X25519. Both can be kept in IndexedDB as they are.
 */
export async function newDeviceKey(useNative) {
  const device = hex(globalThis.crypto.getRandomValues(new Uint8Array(12)));
  if (useNative ?? (await hasNativeX25519())) {
    const pair = await subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
    const spki = new Uint8Array(await subtle.exportKey('spki', pair.publicKey));
    return { device, publicKey: b64(spki), privateKey: pair.privateKey };
  }
  const priv = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return { device, publicKey: b64(spkiOf(x25519(priv, BASE))), privateKey: priv };
}

/** A key made elsewhere (a test's, from Node's pkcs8) in the shape newDeviceKey gives. */
export function keyFromPkcs8(device, publicKey, pkcs8) {
  return { device, publicKey, privateKey: unb64(pkcs8).subarray(PKCS8.length) };
}

async function shared(own, otherPub) {
  const der = unb64(otherPub);
  if (own.privateKey instanceof Uint8Array) return x25519(own.privateKey, rawOfSpki(der));
  const pub = await subtle.importKey('spki', der, { name: 'X25519' }, false, []);
  return new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: pub }, own.privateKey, 256));
}

/** The key that wraps message keys between two devices (the same from both sides). */
async function wrapKey(own, otherPub, senderDevice, recipientDevice) {
  const ikm = await subtle.importKey('raw', await shared(own, otherPub), 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(`slashclient-chat-v1|${senderDevice}|${recipientDevice}`) }, ikm, 256);
  return subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(key, data, aad) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, data));
  return { iv: b64(iv), ct: b64(ct) };
}

async function open(key, box, aad) {
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: enc.encode(aad) }, key, unb64(box.ct)));
}

export const isEncrypted = (text) => typeof text === 'string' && text.startsWith(PREFIX);

/** `text` encrypted for these devices ({ device, pub }); `aad` names the conversation ("from|to", or a group's). */
export async function encrypt(text, own, devices, aad) {
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const messageKey = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const body = await seal(messageKey, enc.encode(text), aad);
  const keys = {};
  for (const d of devices) keys[d.device] = await seal(await wrapKey(own, d.pub, own.device, d.device), raw, aad);
  return PREFIX + b64(enc.encode(JSON.stringify({ from: own.device, pub: own.publicKey, ...body, keys })));
}

/** The text for this device; undefined when it was not encrypted for it or was changed on the way. */
export async function decrypt(text, own, aad) {
  try {
    const e = JSON.parse(dec.decode(unb64(text.slice(PREFIX.length))));
    const wrapped = e.keys?.[own.device];
    if (!wrapped) return undefined;
    const raw = await open(await wrapKey(own, e.pub, e.from, own.device), wrapped, aad);
    const messageKey = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    return dec.decode(await open(messageKey, e, aad));
  } catch {
    return undefined;
  }
}

// ---- groups (src/main/groupChat.ts) ----

export const groupAad = (group, from) => `group:${group}|${from}`;

/** Every member's devices (ours included), each once, this phone last with its own key. */
export function groupDevices(keys, own) {
  const seen = new Set([own.device]);
  const out = [];
  for (const k of keys) {
    if (seen.has(k.device)) continue;
    seen.add(k.device);
    out.push({ device: k.device, pub: k.pub });
  }
  return [...out, { device: own.device, pub: own.publicKey }];
}

// ---- pictures in the chat (src/main/chatImages.ts): the key travels encrypted in the message ----

export function parseImageKey(text) {
  try {
    const k = JSON.parse(text);
    if (k.v !== 1 || typeof k.key !== 'string' || typeof k.iv !== 'string' || !['image/jpeg', 'image/png'].includes(k.type)) return undefined;
    return { key: k.key, iv: k.iv, type: k.type, w: k.w | 0, h: k.h | 0 };
  } catch {
    return undefined;
  }
}

/** The picture's bytes from the blob the server keeps (ciphertext with GCM's tag at the end). */
export async function openImage(blob, key) {
  const k = await subtle.importKey('raw', unb64(key.key), 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(key.iv) }, k, blob));
}
