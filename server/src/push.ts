import { createHash, randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { SettingDef, Settings } from './settings.ts';
import type { SecretBox } from './storage.ts';
import { newVapidKeys, sendPush, validVapidKeys, type VapidKeys } from './webPush.ts';

/**
 * Notifications on the phone (the app at /app, installed from the browser): Web Push to every
 * device the player turned them on for, when a friend writes, a group or clan chat gets a message,
 * someone mentions them in a community, or they get an invitation (a friend request, a clan's, a
 * community's).
 *
 * Nothing new is sent around: the server already tells connected launchers about all of that
 * (`push()` in app.ts); here those same events are turned into a short notification for the
 * phones. Direct and group messages are end-to-end encrypted, so their notifications never carry
 * the text, only who wrote; a community mention (communities' chats are not encrypted) may carry
 * a fragment, as the admin decides.
 *
 * Each subscription is one browser on one phone, with its own choice of what to hear about and its
 * language. The phone's browser hands us an address at its push service (Google's, Apple's,
 * Mozilla's); only those services' addresses are accepted, so the server cannot be made to post
 * to anything else. An address the service says is gone (404/410) is forgotten.
 */

export const PUSH_KINDS = ['dm', 'group', 'clan', 'mention', 'invite'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];
export type PushPrefs = Record<PushKind, boolean>;
const ALL_ON: PushPrefs = { dm: true, group: true, clan: true, mention: true, invite: true };

/** Push services browsers use; `*.` covers any address under that domain. */
export const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com', '*.push.apple.com', '*.notify.windows.com'];

export const PUSH_SETTING_DEFS: SettingDef[] = ([
  { key: 'push.enabled', label: 'Powiadomienia na telefon', labelEn: 'Phone notifications', description: 'Powiadomienia push aplikacji na telefon (/app): wiadomości, czaty grupowe i klanu, wzmianki w społecznościach, zaproszenia. Wyłączone: nic nie jest wysyłane, a aplikacja nie proponuje włączenia (zapisane telefony zostają).', type: 'bool', default: true },
  { key: 'push.vapidPublicKey', label: 'Klucz VAPID publiczny', labelEn: 'VAPID public key', description: 'Para kluczy, którymi serwer podpisuje powiadomienia (base64url, jak z „npx web-push generate-vapid-keys”). Puste: serwer sam tworzy parę przy pierwszym użyciu i ją zapamiętuje. Po zmianie telefony zapisują się na nowo przy następnym otwarciu aplikacji.', type: 'string', default: '', maxLength: 120 },
  { key: 'push.vapidPrivateKey', label: 'Klucz VAPID prywatny', labelEn: 'VAPID private key', description: 'Do pary z publicznym (oba albo żaden). Zapisany zaszyfrowany kluczem STORAGE_SECRET_KEY, nigdy nie wraca do panelu.', type: 'secret', default: '', maxLength: 100 },
  { key: 'push.subject', label: 'Kontakt dla usług push', labelEn: 'Contact for push services', description: 'mailto:… albo https://… – usługi push (Google, Apple, Mozilla) piszą tam w razie problemów. Puste: adres serwera.', type: 'string', default: '', maxLength: 200 },
  { key: 'push.mentionText', label: 'Fragment wiadomości we wzmiankach', labelEn: 'Message fragment in mentions', description: 'Powiadomienie o wzmiance w społeczności pokazuje początek wiadomości (czaty społeczności nie są szyfrowane). Wiadomości prywatne i grupowe nigdy nie pokazują treści.', type: 'bool', default: true },
  { key: 'push.maxDevices', label: 'Najwięcej telefonów na konto', labelEn: 'Most phones per account', description: 'Nowy ponad limit zastępuje najdawniej używany.', type: 'int', default: 10, min: 1, max: 50 },
  { key: 'push.perMinute', label: 'Powiadomienia na konto na minutę', labelEn: 'Notifications per account per minute', description: 'Ponad to powiadomienia przepadają (wiadomości dalej są w aplikacji).', type: 'int', default: 30, min: 1, max: 600, unit: '/min' },
  { key: 'push.ttlHours', label: 'Ważność powiadomienia', labelEn: 'Notification kept for', description: 'Jak długo usługa push trzyma powiadomienie dla wyłączonego telefonu.', type: 'duration', default: 24, min: 0, max: 672, unit: 'godz.' },
  { key: 'push.subscribesPerMinute', label: 'Zapisy telefonów na minutę', labelEn: 'Phone sign-ups per minute', description: 'Na konto: włączanie i zmiana ustawień powiadomień, powiadomienie testowe.', type: 'int', default: 20, min: 1, max: 1000, unit: '/min' },
  { key: 'push.hosts', label: 'Dozwolone usługi push', labelEn: 'Allowed push services', description: 'Adresy, na które serwer wysyła powiadomienia; „*.” obejmuje poddomeny. Jeden na linię.', type: 'list', default: PUSH_HOSTS, lower: true, maxItems: 50, maxLength: 100 },
] as Omit<SettingDef, 'category'>[]).map((d) => ({ ...d, category: 'push' as const }));

/** What a notification says, in both languages; `key` groups notifications of one conversation. */
export interface Notice {
  kind: PushKind;
  key: string;
  url: string;
  pl: { title: string; body: string };
  en: { title: string; body: string };
}

interface Row { id: string; uuid: string; endpoint: string; p256dh: string; auth: string; vapid: string; prefs: string; lang: string; label: string; createdAt: number; usedAt: number }

export class PushStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  vapid TEXT NOT NULL, prefs TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'pl', label TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, used_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(uuid);
CREATE TABLE IF NOT EXISTS push_vapid (id INTEGER PRIMARY KEY CHECK (id = 1), public_key TEXT NOT NULL, private_key TEXT NOT NULL);`);
  }

  private static readonly COLUMNS = 'id, uuid, endpoint, p256dh, auth, vapid, prefs, lang, label, created_at AS createdAt, used_at AS usedAt';

  of(uuid: string): Row[] {
    return this.sql.prepare(`SELECT ${PushStore.COLUMNS} FROM push_subscriptions WHERE uuid = ? ORDER BY used_at DESC`).all(uuid) as unknown as Row[];
  }

  byEndpoint(endpoint: string): Row | undefined {
    return this.sql.prepare(`SELECT ${PushStore.COLUMNS} FROM push_subscriptions WHERE endpoint = ?`).get(endpoint) as unknown as Row | undefined;
  }

  /** The browser's subscription for this account (the same phone signed in to another account moves to it); the oldest beyond `max` go. */
  save(uuid: string, s: { endpoint: string; p256dh: string; auth: string; vapid: string; prefs: PushPrefs; lang: string; label: string }, max: number, now = Date.now()): Row {
    const old = this.byEndpoint(s.endpoint);
    const id = old?.id ?? randomBytes(9).toString('base64url');
    this.sql.prepare(`INSERT INTO push_subscriptions (id, uuid, endpoint, p256dh, auth, vapid, prefs, lang, label, created_at, used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET uuid = excluded.uuid, p256dh = excluded.p256dh, auth = excluded.auth, vapid = excluded.vapid, prefs = excluded.prefs,
      lang = excluded.lang, label = excluded.label, used_at = excluded.used_at`)
      .run(id, uuid, s.endpoint, s.p256dh, s.auth, s.vapid, JSON.stringify(s.prefs), s.lang, s.label, old?.createdAt ?? now, now);
    for (const extra of this.of(uuid).slice(max)) this.remove(extra.id);
    return this.byEndpoint(s.endpoint)!;
  }

  remove(id: string) {
    this.sql.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(id);
  }

  touch(id: string, now = Date.now()) {
    this.sql.prepare('UPDATE push_subscriptions SET used_at = ? WHERE id = ?').run(now, id);
  }

  /** The pair this server made for itself (the private half sealed when STORAGE_SECRET_KEY is set). */
  ownKeys(box?: SecretBox): VapidKeys {
    const row = this.sql.prepare('SELECT public_key AS publicKey, private_key AS privateKey FROM push_vapid WHERE id = 1').get() as VapidKeys | undefined;
    if (row) {
      const [how, ...rest] = row.privateKey.split(':');
      const sealed = rest.join(':');
      return { publicKey: row.publicKey, privateKey: how === 'sealed' ? box!.open(sealed, 'push:vapid') : sealed };
    }
    const keys = newVapidKeys();
    const stored = box ? `sealed:${box.seal(keys.privateKey, 'push:vapid')}` : `plain:${keys.privateKey}`;
    this.sql.prepare('INSERT INTO push_vapid (id, public_key, private_key) VALUES (1, ?, ?)').run(keys.publicKey, stored);
    return keys;
  }
}

const prefsOf = (raw: string): PushPrefs => {
  try {
    return { ...ALL_ON, ...(JSON.parse(raw) as Partial<PushPrefs>) };
  } catch {
    return { ...ALL_ON };
  }
};

/** An address at one of the allowed push services (https only). */
export function allowedEndpoint(endpoint: string, hosts: string[]): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return hosts.some((h) => (h.startsWith('*.') ? host.endsWith(h.slice(1)) && host.length > h.length - 1 : host === h));
}

// ---- which events become notifications ----

/** What the notifications need to know about people and places, from the rest of the server. */
export interface NoticeLookups {
  nameOf: (uuid: string) => string;
  /** The friends this player muted: no notifications for them. */
  muted: (uuid: string) => Set<string>;
  /** A group chat's name, and its clan's tag when it is a clan's chat. */
  group: (id: string) => { name: string; clanTag?: string } | undefined;
  /** A community's name and a channel's, and how the member wants to hear about it ('none': not at all). */
  community: (id: string, channel: string, uuid: string) => { name: string; channel: string; notify: string } | undefined;
  mentionText: () => boolean;
}

const clip = (text: string, max = 120) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The notification `userId` should get for a live event (as app.ts pushes it to launchers), or
 * undefined for events phones do not hear about: one's own messages, edits, statuses, lists…
 */
export function noticeFor(userId: string, event: unknown, l: NoticeLookups): Notice | undefined {
  const e = event as Record<string, any>;
  if (!e || typeof e !== 'object') return undefined;
  if (e.type === 'message') {
    const m = e.message;
    if (!m || m.from === userId || l.muted(userId).has(m.from)) return undefined;
    const name = l.nameOf(m.from);
    const base = { kind: 'dm' as const, key: `dm:${m.from}`, url: `/app/#/chat/${m.from}` };
    // "join me": the server's address is not part of the encrypted text
    if (m.invite?.server) return { ...base, pl: { title: name, body: `Zaprasza Cię do gry na ${m.invite.server}` }, en: { title: name, body: `Invites you to play on ${m.invite.server}` } };
    if (m.image) return { ...base, pl: { title: name, body: 'Wysyła zdjęcie' }, en: { title: name, body: 'Sent a picture' } };
    return { ...base, pl: { title: name, body: 'Nowa wiadomość' }, en: { title: name, body: 'New message' } };
  }
  if (e.type === 'group-message') {
    const m = e.message;
    // the group's own lines (someone joined, renamed) are not worth a buzz
    if (!m || m.from === userId || m.event) return undefined;
    const g = l.group(m.group);
    if (!g) return undefined;
    const name = l.nameOf(m.from);
    const title = g.clanTag ? `[${g.clanTag}] ${g.name.replace(/^\[[^\]]*\]\s*/, '')}` : g.name;
    return {
      kind: g.clanTag ? 'clan' : 'group', key: `g:${m.group}`, url: `/app/#/group/${m.group}`,
      pl: { title, body: `${name}: nowa wiadomość` }, en: { title, body: `${name}: new message` },
    };
  }
  if (e.type === 'community-message') {
    const m = e.message;
    if (!m || m.from === userId || !Array.isArray(m.mentions) || !m.mentions.includes(userId)) return undefined;
    const c = l.community(m.community, m.channel, userId);
    if (!c || c.notify === 'none') return undefined;
    const name = l.nameOf(m.from);
    const text = l.mentionText() && typeof m.text === 'string' && m.text.trim() ? `: ${clip(m.text.trim())}` : '';
    const title = `${c.name} · #${c.channel}`;
    return {
      kind: 'mention', key: `c:${m.community}:${m.channel}`, url: `/app/#/community/${m.community}/${m.channel}`,
      pl: { title, body: text ? `${name}${text}` : `${name} wspomina o Tobie` }, en: { title, body: text ? `${name}${text}` : `${name} mentioned you` },
    };
  }
  const invite = (key: string, pl: string, en: string): Notice => ({ kind: 'invite', key, url: '/app/#/invites', pl: { title: 'SlashClient', body: pl }, en: { title: 'SlashClient', body: en } });
  if (e.type === 'friends' && e.request?.name) return invite(`f:${e.request.id ?? e.request.name}`, `${e.request.name} zaprasza Cię do znajomych`, `${e.request.name} sent you a friend request`);
  if (e.type === 'friends' && e.accepted?.name) return invite(`f:${e.accepted.id ?? e.accepted.name}`, `${e.accepted.name} przyjmuje Twoje zaproszenie`, `${e.accepted.name} accepted your friend request`);
  if (e.type === 'clan' && e.invite?.tag) return invite(`clan:${e.invite.tag}`, `${e.invite.by?.name ?? '?'} zaprasza Cię do klanu [${e.invite.tag}] ${e.invite.name}`, `${e.invite.by?.name ?? '?'} invites you to the clan [${e.invite.tag}] ${e.invite.name}`);
  if (e.type === 'community' && e.invite?.name) return invite(`com:${e.id}`, `${e.invite.by?.name ?? '?'} zaprasza Cię do społeczności ${e.invite.name}`, `${e.invite.by?.name ?? '?'} invites you to the community ${e.invite.name}`);
  return undefined;
}

// ---- routes and sending ----

export interface PushContext {
  sql: DatabaseSync;
  settings: Settings;
  box?: SecretBox;
  publicUrl: string;
  authed: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  limitSubscribe: (key: string) => void;
  lookups: NoticeLookups;
  fetchImpl?: typeof fetch;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const B64U = /^[A-Za-z0-9_-]+={0,2}$/;

export function createPush(ctx: PushContext) {
  const { settings, fail } = ctx;
  const store = new PushStore(ctx.sql);

  let ownKeys: VapidKeys | undefined;
  let warned = '';
  /** The keys in use: the panel's pair when both halves are there and fit, else the server's own. */
  function keys(): VapidKeys {
    const publicKey = settings.str('push.vapidPublicKey');
    const privateKey = settings.str('push.vapidPrivateKey');
    if (publicKey || privateKey) {
      if (validVapidKeys({ publicKey, privateKey })) return { publicKey, privateKey };
      if (warned !== publicKey) console.error('powiadomienia: klucze VAPID z panelu nie pasują do siebie – używam własnych serwera');
      warned = publicKey;
    }
    ownKeys ??= store.ownKeys(ctx.box);
    return ownKeys;
  }
  const subject = () => settings.str('push.subject') || ctx.publicUrl;

  /** A small bucket per account: past the admin's number a minute, notifications are dropped. */
  const buckets = new Map<string, { tokens: number; at: number }>();
  function allow(uuid: string, now = Date.now()): boolean {
    const perMinute = settings.num('push.perMinute');
    const b = buckets.get(uuid) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
    b.at = now;
    buckets.set(uuid, b);
    if (buckets.size > 10_000) buckets.clear();
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }

  /** Sends to every phone of the player that wants this kind; resolves when all answered (tests wait for it). */
  async function deliver(uuid: string, notice: Notice): Promise<number> {
    if (!settings.bool('push.enabled')) return 0;
    const k = keys();
    const subs = store.of(uuid).filter((s) => s.vapid === k.publicKey && prefsOf(s.prefs)[notice.kind]);
    if (!subs.length || !allow(uuid)) return 0;
    const hosts = settings.list('push.hosts');
    // the Topic header: up to 32 base64url characters, the same for one conversation
    const topic = createHash('sha256').update(notice.key).digest('base64url').slice(0, 32);
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      if (!allowedEndpoint(s.endpoint, hosts)) return;
      const text = s.lang === 'en' ? notice.en : notice.pl;
      try {
        const status = await sendPush(s, { ...text, kind: notice.kind, tag: notice.key, url: notice.url, at: Date.now() }, {
          keys: k, subject: subject(), ttlSeconds: settings.num('push.ttlHours') * 3600, topic, fetchImpl: ctx.fetchImpl,
        });
        if (status === 404 || status === 410) store.remove(s.id);
        else if (status >= 200 && status < 300) {
          sent++;
          store.touch(s.id);
        } else console.error(`powiadomienia: usługa push odpowiada ${status} (${new URL(s.endpoint).hostname})`);
      } catch (err) {
        console.error('powiadomienia:', (err as Error).message);
      }
    }));
    return sent;
  }

  /** The hook in app.ts: every live event to an account, turned into a notification when it is one. */
  function onEvent(uuid: string, event: unknown): Promise<number> | undefined {
    if (!settings.bool('push.enabled')) return undefined;
    let notice: Notice | undefined;
    try {
      notice = noticeFor(uuid, event, ctx.lookups);
    } catch (err) {
      console.error('powiadomienia:', (err as Error).message);
    }
    if (!notice) return undefined;
    return deliver(uuid, notice);
  }

  const view = (s: Row) => ({ id: s.id, label: s.label, lang: s.lang, prefs: prefsOf(s.prefs), createdAt: s.createdAt, usedAt: s.usedAt });

  const routes: [string, RegExp, Handler][] = [
    // whether the app may offer notifications, and the key to subscribe with (no sign-in needed)
    ['GET', /^\/v1\/push$/, () => (settings.bool('push.enabled') ? { enabled: true, publicKey: keys().publicKey, kinds: PUSH_KINDS } : { enabled: false })],
    ['GET', /^\/v1\/push\/subscriptions$/, (req) => ({ subscriptions: store.of(ctx.authed(req)).map(view) })],
    // this phone's subscription (the browser's PushSubscription as JSON), with what it wants to hear and its language; saving again updates it
    ['POST', /^\/v1\/push\/subscriptions$/, async (req) => {
      const me = ctx.authed(req);
      ctx.limitSubscribe(me);
      if (!settings.bool('push.enabled')) fail(503, 'push_disabled');
      const raw = await ctx.body(req);
      const endpoint = raw.endpoint;
      const sub = (raw.keys ?? {}) as Record<string, unknown>;
      if (typeof endpoint !== 'string' || endpoint.length > 1000 || !allowedEndpoint(endpoint, settings.list('push.hosts'))) fail(400, 'bad_endpoint');
      const p256dh = sub.p256dh;
      const auth = sub.auth;
      if (typeof p256dh !== 'string' || !B64U.test(p256dh) || Buffer.from(p256dh, 'base64url').length !== 65) fail(400, 'bad_request');
      if (typeof auth !== 'string' || !B64U.test(auth) || Buffer.from(auth, 'base64url').length < 16 || auth.length > 64) fail(400, 'bad_request');
      const prefs = { ...ALL_ON };
      if (raw.prefs !== undefined) {
        if (!raw.prefs || typeof raw.prefs !== 'object') fail(400, 'bad_request');
        for (const k of PUSH_KINDS) {
          const v = (raw.prefs as Record<string, unknown>)[k];
          if (v !== undefined && typeof v !== 'boolean') fail(400, 'bad_request');
          if (typeof v === 'boolean') prefs[k] = v;
        }
      }
      // the key it was made with: after the keys change the phone subscribes again
      const vapid = typeof raw.vapid === 'string' ? raw.vapid : keys().publicKey;
      const label = typeof raw.label === 'string' ? raw.label.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) : '';
      const s = store.save(me, { endpoint: endpoint as string, p256dh: p256dh as string, auth: auth as string, vapid, prefs, lang: raw.lang === 'en' ? 'en' : 'pl', label }, settings.num('push.maxDevices'));
      return { subscription: view(s), current: vapid === keys().publicKey };
    }],
    // turning notifications off on this phone (or signing out of it): by its address, only one's own
    ['POST', /^\/v1\/push\/subscriptions\/remove$/, async (req) => {
      const me = ctx.authed(req);
      const { endpoint } = await ctx.body(req);
      const s = typeof endpoint === 'string' ? store.byEndpoint(endpoint) : undefined;
      if (s?.uuid === me) store.remove(s.id);
      return { ok: true };
    }],
    ['DELETE', /^\/v1\/push\/subscriptions\/([\w-]{1,32})$/, (req, [id]) => {
      const me = ctx.authed(req);
      const s = store.of(me).find((x) => x.id === id);
      if (!s) fail(404, 'not_found');
      store.remove(s!.id);
      return { ok: true };
    }],
    // "Wyślij testowe": to every phone of mine, whatever they chose
    ['POST', /^\/v1\/push\/test$/, async (req) => {
      const me = ctx.authed(req);
      ctx.limitSubscribe(me);
      if (!settings.bool('push.enabled')) fail(503, 'push_disabled');
      const k = keys();
      const subs = store.of(me).filter((s) => s.vapid === k.publicKey);
      if (!subs.length) fail(404, 'no_devices');
      const sent = await deliver(me, {
        kind: 'dm', key: 'test', url: '/app/#/settings',
        pl: { title: 'SlashClient', body: 'Powiadomienia działają.' }, en: { title: 'SlashClient', body: 'Notifications work.' },
      });
      return { sent };
    }],
  ];

  return { routes, store, onEvent, deliver, keys };
}
