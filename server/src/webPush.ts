import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto';

/**
 * Web Push without a library: the notification's text encrypted for the phone's browser
 * (RFC 8291, "aes128gcm") and the request signed with the server's VAPID key (RFC 8292), so the
 * push service (Google's, Apple's, Mozilla's) only carries bytes it cannot read and knows the
 * notifications come from us.
 *
 * VAPID keys are P-256: the public one as the browser wants it (65 bytes, uncompressed, base64url),
 * the private one as its 32-byte scalar (base64url) – the same form `web-push generate-vapid-keys`
 * prints, so an owner may paste keys made elsewhere.
 */

export interface VapidKeys { publicKey: string; privateKey: string }
export interface PushTarget { endpoint: string; p256dh: string; auth: string }

const b64u = (b: Buffer) => b.toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url');

export function newVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x!), unb64u(pub.y!)])), privateKey: priv.d! };
}

/** Whether a pair (typed into the panel) is usable: a point on the curve and its own private scalar. */
export function validVapidKeys(k: VapidKeys): boolean {
  try {
    const pub = unb64u(k.publicKey);
    const d = unb64u(k.privateKey);
    if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) return false;
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    return ecdh.getPublicKey().equals(pub);
  } catch {
    return false;
  }
}

function vapidPrivateKey(k: VapidKeys) {
  const pub = unb64u(k.publicKey);
  return createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)), d: k.privateKey } });
}

/** The Authorization header for one push service (`aud` is its origin), valid for 12 hours. */
export function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: vapidPrivateKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${keys.publicKey}`;
}

/**
 * `payload` encrypted for one browser's subscription (its p256dh key and auth secret): a single
 * aes128gcm record whose header carries our one-time public key.
 */
export function encryptPayload(target: Pick<PushTarget, 'p256dh' | 'auth'>, payload: Buffer, salt = randomBytes(16)): Buffer {
  const uaPublic = unb64u(target.p256dh);
  const authSecret = unb64u(target.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad_subscription');
  const ecdh = createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02: the last (and only) record
  const body = Buffer.concat([c.update(Buffer.concat([payload, Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export interface SendOptions { keys: VapidKeys; subject: string; ttlSeconds: number; urgency?: 'normal' | 'high'; topic?: string; fetchImpl?: typeof fetch }

/** One notification to one subscription; the push service's status (201 sent, 404/410 the subscription is gone). */
export async function sendPush(target: PushTarget, payload: unknown, o: SendOptions): Promise<number> {
  const body = encryptPayload(target, Buffer.from(JSON.stringify(payload)));
  const res = await (o.fetchImpl ?? fetch)(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidHeader(target.endpoint, o.keys, o.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(o.ttlSeconds),
      Urgency: o.urgency ?? 'high',
      // a newer notification for the same conversation replaces one not delivered yet (a phone that was off)
      ...(o.topic ? { Topic: o.topic } : {}),
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(15_000),
  });
  await res.arrayBuffer().catch(() => undefined);
  return res.status;
}
