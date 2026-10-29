import type http from 'node:http';
import type { Db } from './db.ts';
import type { SettingDef } from './settings.ts';

/**
 * Chat history for a new device of the same account (0.9.47+). The chat is end-to-end encrypted
 * (src/main/chatCrypto.ts in the launcher): each message key is wrapped only for the devices that
 * existed when it was sent, so a new launcher could not read anything older. Two ways fix that,
 * both done by the player's own devices; this server never sees a message key or a text:
 *
 * 1. Hand-over: when a new device registers its key, the account's other launchers ask the player
 *    ("Nowe urządzenie … Udostępnić mu historię czatu?", with the device's fingerprint to compare).
 *    Only after a yes there, that launcher walks the history (`/history`), opens each message key
 *    itself and wraps it once more for the new device's public key; the extra wraps are stored here
 *    (`chat_wraps`) and given only to the account that owns that device.
 * 2. Password backup: a launcher makes an extra X25519 key, the "backup device", whose public half
 *    is one more device of the account (so every friend's launcher, old ones too, wraps new messages
 *    for it) and whose private half is encrypted with the player's chat password (scrypt in the
 *    launcher). Only that encrypted blob, its salt and KDF parameters are stored here; the password
 *    never comes to the server, so it is never checked here either.
 *
 * Threat model, in short: the server (or someone with access to it) could add a key of its own as
 * a "new device". It still gets no history, because the hand-over waits for the player on a device
 * they trust, and the fingerprint shown there is computed by that launcher from the very key it
 * then wraps for (the server's word about a device is never enough: the launcher keeps its own
 * yes-list). What the server can do is what it could before: list the keys new messages are
 * wrapped for (now visible to the player as "Urządzenia" with "Usuń urządzenie"), and try the
 * backup blob offline against guessed passwords, which the strong KDF and a minimum password
 * strength in the launcher make slow. Extra wraps can only be added by the account for its own
 * devices and only to messages it took part in; one that is wrong just does not open.
 */

export const CHAT_KEY_LIMITS = {
  /** launchers an account keeps keys of (the backup does not count) */
  maxDevices: 10,
  /** extra wraps in one upload */
  wrapsPerRequest: 200,
  /** messages in one page of the history walk */
  historyPerRequest: 200,
  /** extra wraps kept for one device in all */
  wrapsPerDevice: 200_000,
  /** how long other launchers ask about a new device */
  handoverDays: 30,
};

export const CHAT_KEY_SETTING_DEFS: Omit<SettingDef, 'category'>[] = [
  { key: 'chatKeys.maxDevices', label: 'Urządzeń z kluczem czatu na konto', labelEn: 'Chat devices per account', description: 'Tyle ostatnio używanych launcherów (i telefonów) konta dostaje szyfrowane wiadomości; starsze wypadają. Kopia klucza z hasłem się nie liczy.', type: 'int', default: CHAT_KEY_LIMITS.maxDevices, min: 2, max: 50 },
  { key: 'chatKeys.wrapsPerRequest', label: 'Kluczy historii w jednym przesłaniu', labelEn: 'History keys per upload', description: 'Udostępnianie historii nowemu urządzeniu idzie paczkami; to największa paczka.', type: 'int', default: CHAT_KEY_LIMITS.wrapsPerRequest, min: 10, max: 2000 },
  { key: 'chatKeys.historyPerRequest', label: 'Wiadomości w jednej stronie historii', labelEn: 'History messages per page', description: 'Ile wiadomości launcher dostaje naraz, gdy przepakowuje klucze historii.', type: 'int', default: CHAT_KEY_LIMITS.historyPerRequest, min: 10, max: 2000 },
  { key: 'chatKeys.wrapsPerDevice', label: 'Kluczy historii na urządzenie', labelEn: 'History keys per device', description: 'Najwięcej przepakowanych kluczy wiadomości zapisanych dla jednego urządzenia (lub kopii z hasłem).', type: 'int', default: CHAT_KEY_LIMITS.wrapsPerDevice, min: 1000, max: 10_000_000 },
  { key: 'chatKeys.handoverDays', label: 'Pytanie o nowe urządzenie', labelEn: 'New device prompt', description: 'Przez tyle dni inne launchery gracza pytają, czy udostępnić historię czatu nowemu urządzeniu.', type: 'duration', default: CHAT_KEY_LIMITS.handoverDays, min: 1, max: 365, unit: 'dni' },
  { key: 'chatKeys.requestsPerMinute', label: 'Przepakowywanie historii na minutę', labelEn: 'History re-wrapping per minute', description: 'Zapytania o historię i przesłania kluczy, na konto.', type: 'int', default: 120, min: 1, max: 10_000, unit: '/min' },
  { key: 'chatKeys.devicesPerMinute', label: 'Zapisy klucza urządzenia na minutę', labelEn: 'Device key saves per minute', description: 'Launcher zapisuje klucz swojego urządzenia po zalogowaniu, a znajomi dostają wtedy powiadomienie; na konto.', type: 'int', default: 10, min: 1, max: 1000, unit: '/min' },
  { key: 'chatKeys.backupChangesPerMinute', label: 'Zmiany kopii klucza na minutę', labelEn: 'Key backup changes per minute', description: 'Ustawienie, zmiana hasła i usunięcie kopii klucza czatu, na konto.', type: 'int', default: 6, min: 1, max: 1000, unit: '/min' },
];

const DEVICE = /^[0-9a-f]{24}$/;
// an X25519 public key in DER (spki) is 44 bytes: 60 characters of base64
const PUB = /^[A-Za-z0-9+/=]{40,80}$/;
const B64 = (min: number, max: number) => new RegExp(`^[A-Za-z0-9+/=]{${min},${max}}$`);
const IV = B64(16, 16);
// a 32-byte message key and GCM's 16-byte tag
const CT = B64(64, 64);
const CURSOR = /^[mg]\d{1,15}$/;
/** The encrypted backup: a small JSON (the KDF's parameters, salt, iv and the sealed private key). */
const MAX_BLOB = 4096;
const NAME_MAX = 60;

export type Kind = 'm' | 'g';
export type Field = 'text' | 'image';
export interface ExtraWrap { by: string; pub: string; iv: string; ct: string }
export interface HistoryItem { kind: Kind; id: number; from: string; to?: string; group?: string; text?: string; image?: string }

/** A device's name as the launcher sends it ("Windows · DESKTOP-1"): plain text, short. */
export function cleanDeviceName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** The backup's blob, when it looks like one the launcher makes (the server cannot check more: it has no password). */
export function cleanBackupBlob(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > MAX_BLOB) return undefined;
  try {
    const b = JSON.parse(raw) as Record<string, unknown>;
    const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
    if (b.v !== 1 || b.kdf !== 'scrypt') return undefined;
    // N a power of two; the launcher refuses parameters that would take too long or too much memory
    if (!int(b.N, 2 ** 14, 2 ** 20) || ((b.N as number) & ((b.N as number) - 1)) !== 0 || !int(b.r, 1, 32) || !int(b.p, 1, 16)) return undefined;
    if (typeof b.salt !== 'string' || !B64(22, 88).test(b.salt) || typeof b.iv !== 'string' || !IV.test(b.iv) || typeof b.ct !== 'string' || !B64(40, 3000).test(b.ct)) return undefined;
    if (typeof b.device !== 'string' || !DEVICE.test(b.device)) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

/** One extra wrap from an upload, or undefined when something in it is off. */
function cleanWrap(raw: unknown): ({ kind: Kind; id: number; field: Field } & ExtraWrap) | undefined {
  const w = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (w.kind !== 'm' && w.kind !== 'g') return undefined;
  if (w.field !== 'text' && w.field !== 'image') return undefined;
  if (typeof w.id !== 'number' || !Number.isSafeInteger(w.id) || w.id < 1) return undefined;
  if (typeof w.by !== 'string' || !DEVICE.test(w.by) || typeof w.pub !== 'string' || !PUB.test(w.pub)) return undefined;
  if (typeof w.iv !== 'string' || !IV.test(w.iv) || typeof w.ct !== 'string' || !CT.test(w.ct)) return undefined;
  return { kind: w.kind, id: w.id, field: w.field, by: w.by, pub: w.pub, iv: w.iv, ct: w.ct };
}

/** The devices an envelope's own wraps are for (no secret: the server stores the envelope as it is). */
function envelopeDevices(text: string): string[] {
  try {
    const e = JSON.parse(Buffer.from(text.slice(5), 'base64').toString('utf8')) as { keys?: Record<string, unknown> };
    return e.keys && typeof e.keys === 'object' ? Object.keys(e.keys) : [];
  } catch {
    return [];
  }
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

interface Context {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  push: (userId: string, event: unknown) => void;
  /** a setting's number now (the admin panel's) */
  num: (key: string) => number;
  /** throws 429 when the account went over the per-minute number */
  limitRequests: (key: string) => void;
  limitBackup: (key: string) => void;
  fail: (status: number, code: string) => never;
}

interface DeviceRow { device: string; pub: string; name: string; at: number; created_at: number; kind: string; handover: string }

export function chatKeyRoutes(ctx: Context) {
  const { db, authed, body, push, fail } = ctx;
  const sql = db.sql;

  const deviceOf = (me: string, device: string) =>
    sql.prepare('SELECT device, pub, name, at, created_at, kind, handover FROM device_keys WHERE uuid = ? AND device = ?').get(me, device) as DeviceRow | undefined;

  /** Every launcher of the player and friends drop the keys they keep of this account. */
  function keysChanged(me: string) {
    push(me, { type: 'keys', user: me });
    for (const f of db.friends(me)) push(f.id, { type: 'keys', user: me });
    push(me, { type: 'chat-keys' });
  }

  /** Whether `me` took part in a message: sent or got it, or was in the group when it came. */
  function takesPart(me: string, kind: Kind, id: number): boolean {
    if (kind === 'm') return !!sql.prepare('SELECT 1 FROM messages WHERE id = ? AND (from_uuid = ? OR to_uuid = ?) AND deleted_at IS NULL').get(id, me, me);
    return !!sql.prepare(`SELECT 1 FROM chat_group_messages x JOIN chat_group_members m ON m.group_id = x.group_id AND m.uuid = ?
      WHERE x.id = ? AND x.id > m.since_id AND x.deleted_at IS NULL`).get(me, id);
  }

  const hasImages = () => !!sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'chat_images'").get();

  /** One page of the history `me` can see, from `after` on: direct messages first, then the groups'. */
  function history(me: string, after: string, limit: number, forDevice?: string): { items: HistoryItem[]; next: string | null } {
    const kind = after[0] as Kind;
    const from = Number(after.slice(1));
    const images = hasImages();
    let rows: { id: number; from: string; to?: string; group?: string; text: string; image: string | null }[];
    if (kind === 'm') {
      rows = sql.prepare(`SELECT m.id, m.from_uuid AS "from", m.to_uuid AS "to", m.text, ${images ? 'ci.key' : 'NULL'} AS image FROM messages m
        ${images ? "LEFT JOIN chat_images ci ON ci.message_id = m.id AND ci.owner = m.from_uuid AND ci.recipient NOT LIKE 'g:%' AND ci.removed_at IS NULL" : ''}
        WHERE (m.from_uuid = ? OR m.to_uuid = ?) AND m.id > ? AND m.deleted_at IS NULL ORDER BY m.id LIMIT ?`).all(me, me, from, limit) as typeof rows;
    } else {
      rows = sql.prepare(`SELECT x.id, x.group_id AS "group", x.from_uuid AS "from", x.text, ${images ? 'ci.key' : 'NULL'} AS image FROM chat_group_messages x
        JOIN chat_group_members gm ON gm.group_id = x.group_id AND gm.uuid = ?
        ${images ? "LEFT JOIN chat_images ci ON ci.message_id = x.id AND ci.recipient = 'g:' || x.group_id AND ci.removed_at IS NULL" : ''}
        WHERE x.id > gm.since_id AND x.id > ? AND x.deleted_at IS NULL AND x.event IS NULL ORDER BY x.id LIMIT ?`).all(me, from, limit) as typeof rows;
    }
    // what the device has already (in the envelope, or handed over before) is left out
    const done = new Set<string>();
    if (forDevice && rows.length) {
      for (const w of sql.prepare('SELECT msg, field FROM chat_wraps WHERE uuid = ? AND device = ? AND kind = ? AND msg BETWEEN ? AND ?')
        .all(me, forDevice, kind, rows[0].id, rows[rows.length - 1].id) as { msg: number; field: string }[]) done.add(`${w.msg}:${w.field}`);
    }
    const wanted = (env: string | null, field: Field, id: number) => !!env && env.startsWith('e2e1:') && !done.has(`${id}:${field}`) && !(forDevice && envelopeDevices(env).includes(forDevice));
    const items: HistoryItem[] = [];
    for (const r of rows) {
      const text = wanted(r.text, 'text', r.id) ? r.text : undefined;
      const image = wanted(r.image, 'image', r.id) ? r.image! : undefined;
      if (!text && !image) continue;
      items.push({ kind, id: r.id, from: r.from, ...(kind === 'm' ? { to: r.to } : { group: r.group }), ...(text ? { text } : {}), ...(image ? { image } : {}) });
    }
    const next = rows.length === limit ? `${kind}${rows[rows.length - 1].id}` : kind === 'm' ? 'g0' : null;
    return { items, next };
  }

  function state(me: string) {
    const devices = (sql.prepare("SELECT device, pub, name, at, created_at, kind, handover FROM device_keys WHERE uuid = ? AND kind = '' ORDER BY created_at, at").all(me) as unknown as DeviceRow[])
      .map((d) => ({ device: d.device, pub: d.pub, name: d.name, createdAt: d.created_at || undefined, lastSeen: d.at, handover: d.handover }));
    const b = sql.prepare('SELECT b.device, b.blob, b.created_at AS createdAt, b.updated_at AS updatedAt, k.pub FROM chat_backups b JOIN device_keys k ON k.uuid = b.uuid AND k.device = b.device WHERE b.uuid = ?')
      .get(me) as { device: string; blob: string; createdAt: number; updatedAt: number; pub: string } | undefined;
    return {
      devices,
      backup: b ? { device: b.device, pub: b.pub, blob: b.blob, createdAt: b.createdAt, updatedAt: b.updatedAt } : null,
      limits: { wrapsPerRequest: ctx.num('chatKeys.wrapsPerRequest'), historyPerRequest: ctx.num('chatKeys.historyPerRequest'), handoverDays: ctx.num('chatKeys.handoverDays') },
    };
  }

  const routes: [string, RegExp, Handler][] = [
    // the account's devices and its backup, for "Szyfrowanie czatu" and the new-device question
    ['GET', /^\/v1\/chat-keys$/, (req) => state(authed(req))],

    // what the player answered about a new device (only what the launchers show: the yes itself is kept by the launcher that said it)
    ['POST', /^\/v1\/chat-keys\/devices\/([0-9a-f]{24})$/, async (req, [device]) => {
      const me = authed(req);
      const { handover } = await body(req);
      if (handover !== 'sharing' && handover !== 'done' && handover !== 'declined') fail(400, 'bad_request');
      const d = deviceOf(me, device);
      if (!d || d.kind) fail(404, 'not_found');
      sql.prepare('UPDATE device_keys SET handover = ? WHERE uuid = ? AND device = ?').run(handover as string, me, device);
      push(me, { type: 'chat-keys' });
      return { ok: true };
    }],
    // "Usuń urządzenie": nothing is encrypted for it any more, and it cannot come back with the same key
    ['DELETE', /^\/v1\/chat-keys\/devices\/([0-9a-f]{24})$/, (req, [device]) => {
      const me = authed(req);
      const d = deviceOf(me, device);
      if (!d || d.kind) fail(404, 'not_found');
      db.dropDevice(me, device);
      sql.prepare('INSERT OR REPLACE INTO device_revoked (uuid, device, at) VALUES (?, ?, ?)').run(me, device, Date.now());
      keysChanged(me);
      return { ok: true };
    }],

    // the history's envelopes, page by page, for a launcher that re-wraps them (`for`: leave out what that device has)
    ['GET', /^\/v1\/chat-keys\/history$/, (req, _p, url) => {
      const me = authed(req);
      ctx.limitRequests(me);
      const after = url.searchParams.get('after') || 'm0';
      if (!CURSOR.test(after)) fail(400, 'bad_request');
      const max = ctx.num('chatKeys.historyPerRequest');
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || max, 1), max);
      const forDevice = url.searchParams.get('for') ?? undefined;
      if (forDevice !== undefined && !DEVICE.test(forDevice)) fail(400, 'bad_request');
      return history(me, after, limit, forDevice);
    }],

    // extra wraps for one of the account's own devices (or its backup), only on messages the account took part in
    ['POST', /^\/v1\/chat-keys\/wraps$/, async (req) => {
      const me = authed(req);
      ctx.limitRequests(me);
      const { device, wraps } = await body(req);
      if (typeof device !== 'string' || !DEVICE.test(device) || !Array.isArray(wraps)) fail(400, 'bad_request');
      if ((wraps as unknown[]).length > ctx.num('chatKeys.wrapsPerRequest')) fail(413, 'too_many');
      if (!deviceOf(me, device as string)) fail(404, 'not_found');
      const clean = (wraps as unknown[]).map(cleanWrap);
      if (clean.some((w) => !w)) fail(400, 'bad_request');
      const kept = (sql.prepare('SELECT COUNT(*) AS n FROM chat_wraps WHERE uuid = ? AND device = ?').get(me, device as string) as { n: number }).n;
      if (kept + clean.length > ctx.num('chatKeys.wrapsPerDevice')) fail(413, 'too_many');
      const insert = sql.prepare(`INSERT INTO chat_wraps (uuid, device, kind, msg, field, wrap, at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (uuid, device, kind, msg, field) DO UPDATE SET wrap = excluded.wrap, at = excluded.at`);
      let stored = 0;
      let refused = 0;
      const now = Date.now();
      for (const w of clean) {
        if (!takesPart(me, w!.kind, w!.id)) {
          refused++;
          continue;
        }
        insert.run(me, device as string, w!.kind, w!.id, w!.field, JSON.stringify({ by: w!.by, pub: w!.pub, iv: w!.iv, ct: w!.ct }), now);
        stored++;
      }
      if (stored) push(me, { type: 'chat-wraps', device });
      return { stored, refused };
    }],
    // the extra wraps of one of the account's devices, in the order they came
    ['GET', /^\/v1\/chat-keys\/wraps$/, (req, _p, url) => {
      const me = authed(req);
      ctx.limitRequests(me);
      const device = url.searchParams.get('device') ?? '';
      if (!DEVICE.test(device)) fail(400, 'bad_request');
      if (!deviceOf(me, device)) fail(404, 'not_found');
      const after = Math.max(Number(url.searchParams.get('after')) || 0, 0);
      const limit = 1000;
      const rows = sql.prepare('SELECT seq, kind, msg, field, wrap FROM chat_wraps WHERE uuid = ? AND device = ? AND seq > ? ORDER BY seq LIMIT ?')
        .all(me, device, after, limit) as { seq: number; kind: Kind; msg: number; field: Field; wrap: string }[];
      return {
        wraps: rows.map((r) => ({ seq: r.seq, kind: r.kind, id: r.msg, field: r.field, ...(JSON.parse(r.wrap) as ExtraWrap) })),
        next: rows.length === limit ? rows[rows.length - 1].seq : null,
      };
    }],

    // "Kopia klucza czatu": set up, or a new password for the same key (same device and public key)
    ['POST', /^\/v1\/chat-keys\/backup$/, async (req) => {
      const me = authed(req);
      ctx.limitBackup(me);
      const { device, pub, blob } = await body(req);
      if (typeof device !== 'string' || !DEVICE.test(device) || typeof pub !== 'string' || !PUB.test(pub)) fail(400, 'bad_request');
      const clean = cleanBackupBlob(blob);
      if (!clean || (JSON.parse(clean) as { device: string }).device !== device) fail(400, 'bad_backup');
      const now = Date.now();
      const old = sql.prepare('SELECT device FROM chat_backups WHERE uuid = ?').get(me) as { device: string } | undefined;
      const existing = deviceOf(me, device as string);
      if (old?.device === device) {
        if (existing?.pub !== pub) fail(409, 'conflict');
        sql.prepare('UPDATE chat_backups SET blob = ?, updated_at = ? WHERE uuid = ?').run(clean!, now, me);
        push(me, { type: 'chat-keys' });
        return state(me);
      }
      // a launcher's id (or a removed one) cannot become the backup
      if (existing || sql.prepare('SELECT 1 FROM device_revoked WHERE uuid = ? AND device = ?').get(me, device as string)) fail(409, 'conflict');
      if (old) db.dropDevice(me, old.device);
      sql.prepare("INSERT INTO device_keys (uuid, device, pub, at, name, created_at, kind, handover) VALUES (?, ?, ?, ?, '', ?, 'backup', 'none')").run(me, device as string, pub as string, now, now);
      sql.prepare('INSERT OR REPLACE INTO chat_backups (uuid, device, blob, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(me, device as string, clean!, now, now);
      keysChanged(me);
      return state(me);
    }],
    // the backup removed: its blob, its key and what was wrapped for it are gone; nothing new is wrapped for it
    ['DELETE', /^\/v1\/chat-keys\/backup$/, (req) => {
      const me = authed(req);
      ctx.limitBackup(me);
      const old = sql.prepare('SELECT device FROM chat_backups WHERE uuid = ?').get(me) as { device: string } | undefined;
      if (!old) return state(me);
      sql.prepare('DELETE FROM chat_backups WHERE uuid = ?').run(me);
      db.dropDevice(me, old.device);
      keysChanged(me);
      return state(me);
    }],
  ];
  return { routes };
}
