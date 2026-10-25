import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb, type ScryptOptions } from 'node:crypto';
import type { DeviceKey } from './chatCrypto.ts';

/**
 * "Kopia klucza czatu": the chat password protecting an extra chat key of the account, the backup
 * key (chatKeys.ts). Its public half is one more device of the account, so new messages are also
 * wrapped for it; its private half is sealed here with a key from the player's password and only
 * that sealed blob (with the salt and the KDF's parameters) goes to the server. A new launcher that
 * knows the password opens the blob and reads the history with the backup key.
 *
 * The server keeps the blob and could try passwords against it offline, so the KDF is scrypt with a
 * high cost (about 128 MB and a fraction of a second per try) and the password must not be weak.
 * Nobody can recover the backup without the password: not the server, not SlashClient.
 */

export interface ScryptParams { N: number; r: number; p: number }
/** About 128 MB of memory per try; kept in the blob, so a later launcher can raise it for new backups. */
export const SCRYPT: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };
export const MIN_PASSWORD = 10;
const MAX_PASSWORD = 256;

interface Blob { v: 1; kdf: 'scrypt'; N: number; r: number; p: number; salt: string; device: string; iv: string; ct: string }

function scrypt(password: Buffer, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = { N: params.N, r: params.r, p: params.p, maxmem: 128 * params.N * params.r * params.p + 32 * 1024 * 1024 };
  return new Promise((resolve, reject) => scryptCb(password, salt, 32, options, (err, key) => (err ? reject(err) : resolve(key))));
}

/** The password as bytes: the same letters typed on another computer give the same bytes. */
const passwordBytes = (password: string) => Buffer.from(password.normalize('NFKC'), 'utf8');

/** Binds the sealed key to its account and device, so a blob cannot be passed off as another account's. */
const aadOf = (account: string, device: string) => Buffer.from(`slashclient-chat-backup-v1|${account}|${device}`);

/** A few passwords everybody tries first. */
const COMMON = ['1234567890', '0123456789', 'qwertyuiop', 'password123', 'haslo12345', 'minecraft1', 'minecraft123', 'slashclient', 'zaq12wsxcde', '1qaz2wsx3edc', 'qwerty1234', 'asdfghjkl1'];

/** Why a chat password is too weak (undefined: it is fine). Long passphrases pass without digits. */
export function passwordProblem(password: string): 'too_short' | 'too_long' | 'too_simple' | 'too_common' | undefined {
  const pw = password.normalize('NFKC');
  if ([...pw].length < MIN_PASSWORD) return 'too_short';
  if (pw.length > MAX_PASSWORD) return 'too_long';
  const lower = pw.toLowerCase();
  if (COMMON.includes(lower.replace(/[\s!._-]+/g, ''))) return 'too_common';
  if (new Set(lower).size < 5) return 'too_simple';
  const classes = [/[a-ząćęłńóśźż]/i, /[0-9]/, /[^a-z0-9ąćęłńóśźż]/i].filter((r) => r.test(pw)).length;
  if ([...pw].length < 14 && classes < 2) return 'too_simple';
  return undefined;
}

/** The backup key sealed with the password, as the text the server keeps. */
export async function sealBackup(key: DeviceKey, password: string, account: string, params: ScryptParams = SCRYPT): Promise<string> {
  const salt = randomBytes(16);
  const kek = await scrypt(passwordBytes(password), salt, params);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', kek, iv);
  c.setAAD(aadOf(account, key.device));
  const plain = Buffer.from(JSON.stringify({ publicKey: key.publicKey, privateKey: key.privateKey }));
  const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  const blob: Blob = { v: 1, kdf: 'scrypt', ...params, salt: salt.toString('base64'), device: key.device, iv: iv.toString('base64'), ct: ct.toString('base64') };
  return JSON.stringify(blob);
}

/** The device the blob's key is, without the password. */
export function backupDevice(blob: string): string | undefined {
  try {
    const b = JSON.parse(blob) as Partial<Blob>;
    return typeof b.device === 'string' && /^[0-9a-f]{24}$/.test(b.device) ? b.device : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The backup key again; throws `wrong_password` when the password does not open it (or the blob was
 * changed), `bad_backup` when the blob is not one this launcher makes or asks too much of the computer.
 */
export async function openBackup(blob: string, password: string, account: string): Promise<DeviceKey> {
  let b: Blob;
  try {
    b = JSON.parse(blob) as Blob;
  } catch {
    throw new Error('bad_backup');
  }
  const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  // parameters from the server are not trusted to be sane: a huge N would hang the launcher
  if (b?.v !== 1 || b.kdf !== 'scrypt' || !int(b.N, 2 ** 14, 2 ** 20) || (b.N & (b.N - 1)) !== 0 || !int(b.r, 1, 32) || !int(b.p, 1, 16) || b.N * b.r * b.p > 2 ** 22
    || typeof b.salt !== 'string' || typeof b.iv !== 'string' || typeof b.ct !== 'string' || typeof b.device !== 'string') throw new Error('bad_backup');
  const kek = await scrypt(passwordBytes(password), Buffer.from(b.salt, 'base64'), b);
  const all = Buffer.from(b.ct, 'base64');
  if (all.length < 17) throw new Error('bad_backup');
  let plain: Buffer;
  try {
    const d = createDecipheriv('aes-256-gcm', kek, Buffer.from(b.iv, 'base64'));
    d.setAAD(aadOf(account, b.device));
    d.setAuthTag(all.subarray(all.length - 16));
    plain = Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]);
  } catch {
    throw new Error('wrong_password');
  }
  const k = JSON.parse(plain.toString('utf8')) as { publicKey: string; privateKey: string };
  return { device: b.device, publicKey: k.publicKey, privateKey: k.privateKey };
}

/**
 * Wrong passwords typed in a row: after a few, the next try waits a little longer each time. It only
 * slows someone at this keyboard (the server never checks the password), which is the point here.
 */
export class PasswordTries {
  private failures = 0;
  private until = 0;
  private readonly now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }
  /** Milliseconds to wait before the next try (0: go). */
  wait(): number {
    return Math.max(0, this.until - this.now());
  }
  failed() {
    this.failures++;
    if (this.failures >= 5) this.until = this.now() + Math.min(5 * 60_000, 15_000 * 2 ** (this.failures - 5));
  }
  succeeded() {
    this.failures = 0;
    this.until = 0;
  }
}
