import type { DatabaseSync } from 'node:sqlite';
import type { SettingDef } from './settings.ts';

/**
 * Limits of pictures in shared chats (server 0.9.36+): group chats, clan chats and communities.
 * Direct messages keep the per-player limits of chatImages.ts.
 *
 * Every shared chat has a store of its own: at most `quotaBytes` and `quotaCount` pictures kept at
 * once (pictures removed, expired or deleted with their message do not count), pictures older than
 * `days` go by themselves (the message stays with a placeholder), one picture at most `maxBytes`,
 * and one member sends at most `perMemberDay` pictures to it a day. The defaults are the admin
 * panel's settings (Ustawienia → Multimedia w czatach); a clan's owner, a group's owner and a
 * community's admins may set lower ones for their chat (never higher than the panel's).
 */

export interface ChatMediaLimits {
  /** Bytes of pictures kept in the chat at once. */
  quotaBytes: number;
  /** Pictures kept in the chat at once. */
  quotaCount: number;
  /** Pictures older than this go (days). */
  days: number;
  /** One picture at most. */
  maxBytes: number;
  /** Pictures one member sends to the chat a day. */
  perMemberDay: number;
}
export const LIMIT_FIELDS: (keyof ChatMediaLimits)[] = ['quotaBytes', 'quotaCount', 'days', 'maxBytes', 'perMemberDay'];

export type ChatKind = 'group' | 'clan' | 'community';

const MB = 1024 * 1024;
const GB = 1024 * MB;
export const CHAT_MEDIA_DEFAULTS: Record<ChatKind, ChatMediaLimits> = {
  group: { quotaBytes: 1 * GB, quotaCount: 2000, days: 30, maxBytes: 4 * MB, perMemberDay: 30 },
  clan: { quotaBytes: 2 * GB, quotaCount: 5000, days: 90, maxBytes: 4 * MB, perMemberDay: 50 },
  // a community's picture size and how long they are kept are the older settings communities.imageBytes / communities.imageDays
  community: { quotaBytes: 2 * GB, quotaCount: 10_000, days: 365, maxBytes: 4 * MB, perMemberDay: 50 },
};

/** The admin panel's setting of one limit of one kind of chat. */
export const settingKey = (kind: ChatKind, field: keyof ChatMediaLimits): string => {
  if (kind === 'community' && field === 'days') return 'communities.imageDays';
  if (kind === 'community' && field === 'maxBytes') return 'communities.imageBytes';
  return `chatMedia.${kind}${field[0].toUpperCase()}${field.slice(1)}`;
};

const KIND_NAMES: Record<ChatKind, [string, string]> = { group: ['grupy', 'group'], clan: ['klanu', 'clan'], community: ['społeczności', 'community'] };

/** The panel's settings of these limits (the community's size and days are among the communities' settings already). */
export function chatMediaSettingDefs(): Omit<SettingDef, 'category'>[] {
  const defs: Omit<SettingDef, 'category'>[] = [];
  for (const kind of ['group', 'clan', 'community'] as ChatKind[]) {
    const d = CHAT_MEDIA_DEFAULTS[kind];
    const [Pl, en] = KIND_NAMES[kind];
    defs.push(
      { key: settingKey(kind, 'quotaBytes'), label: `Miejsce na zdjęcia: czat ${Pl}`, labelEn: `Picture storage: ${en} chat`, description: 'Najwięcej bajtów zdjęć trzymanych naraz w jednym czacie. Gdy się zapełni, wysyłający dostaje komunikat, a starsze zdjęcia trzeba usunąć albo poczekać, aż wygasną.', descriptionEn: 'Most bytes of pictures kept at once in one chat.', type: 'bytes', default: d.quotaBytes, min: 1 * MB, max: 1024 * GB, bytesUnit: 'MB' },
      { key: settingKey(kind, 'quotaCount'), label: `Zdjęć naraz: czat ${Pl}`, labelEn: `Pictures at once: ${en} chat`, description: 'Najwięcej zdjęć trzymanych naraz w jednym czacie.', descriptionEn: 'Most pictures kept at once in one chat.', type: 'int', default: d.quotaCount, min: 1, max: 10_000_000 },
      { key: settingKey(kind, 'perMemberDay'), label: `Zdjęć dziennie na osobę: czat ${Pl}`, labelEn: `Pictures a day per member: ${en} chat`, description: 'Ile zdjęć jedna osoba może wysłać do jednego czatu w ciągu doby.', descriptionEn: 'Pictures one member may send to one chat in a day.', type: 'int', default: d.perMemberDay, min: 1, max: 10_000 },
    );
    if (kind !== 'community') {
      defs.push(
        { key: settingKey(kind, 'days'), label: `Przechowywanie zdjęć: czat ${Pl}`, labelEn: `Pictures kept: ${en} chat`, description: 'Po tylu dniach zdjęcie znika z serwera (wiadomość zostaje z napisem, że wygasło).', descriptionEn: 'After this many days a picture is removed (the message stays).', type: 'duration', default: d.days, min: 1, max: 3650, unit: 'dni', risky: true },
        { key: settingKey(kind, 'maxBytes'), label: `Największe zdjęcie: czat ${Pl}`, labelEn: `Largest picture: ${en} chat`, description: 'Zaszyfrowany zrzut ekranu (launcher zmniejsza go do 1920 px).', descriptionEn: 'An encrypted screenshot (the launcher scales it to 1920 px).', type: 'bytes', default: d.maxBytes, min: 64 * 1024, max: 50 * MB, bytesUnit: 'MB' },
      );
    }
  }
  return defs;
}

/** A chat's own lower limits, as its admins set them (none: the panel's). */
export type Overrides = Partial<ChatMediaLimits>;

/** The chats' own limits, by chat ("g:<group>" or "c:<community>"). */
export class OverrideStore {
  private readonly sql: DatabaseSync;
  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS chat_media_limits (chat TEXT PRIMARY KEY, quota_bytes INTEGER, quota_count INTEGER, days INTEGER, max_bytes INTEGER,
      per_member_day INTEGER, set_by TEXT NOT NULL DEFAULT '', set_at INTEGER NOT NULL DEFAULT 0)`);
  }

  get(chat: string): Overrides {
    const r = this.sql.prepare('SELECT quota_bytes AS quotaBytes, quota_count AS quotaCount, days, max_bytes AS maxBytes, per_member_day AS perMemberDay FROM chat_media_limits WHERE chat = ?')
      .get(chat) as Record<string, number | null> | undefined;
    if (!r) return {};
    const out: Overrides = {};
    for (const f of LIMIT_FIELDS) if (typeof r[f] === 'number') out[f] = r[f] as number;
    return out;
  }

  /** Replaces the chat's own limits (an empty object: back to the panel's). */
  set(chat: string, o: Overrides, by: string, now = Date.now()) {
    if (!LIMIT_FIELDS.some((f) => o[f] !== undefined)) {
      this.sql.prepare('DELETE FROM chat_media_limits WHERE chat = ?').run(chat);
      return;
    }
    this.sql.prepare(`INSERT INTO chat_media_limits (chat, quota_bytes, quota_count, days, max_bytes, per_member_day, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (chat) DO UPDATE SET quota_bytes = excluded.quota_bytes, quota_count = excluded.quota_count, days = excluded.days, max_bytes = excluded.max_bytes,
      per_member_day = excluded.per_member_day, set_by = excluded.set_by, set_at = excluded.set_at`)
      .run(chat, o.quotaBytes ?? null, o.quotaCount ?? null, o.days ?? null, o.maxBytes ?? null, o.perMemberDay ?? null, by, now);
  }

  remove(chat: string) {
    this.sql.prepare('DELETE FROM chat_media_limits WHERE chat = ?').run(chat);
  }

  /** The shortest own keeping time of any chat, to find pictures that may have run out (undefined: none set). */
  shortestDays(prefix: 'g:' | 'c:'): number | undefined {
    const r = this.sql.prepare('SELECT MIN(days) AS d FROM chat_media_limits WHERE chat LIKE ? AND days IS NOT NULL').get(`${prefix}%`) as { d: number | null };
    return r.d ?? undefined;
  }
}

/** The limits a chat has now: the panel's, lowered by the chat's own. */
export function effective(global: ChatMediaLimits, own: Overrides): ChatMediaLimits {
  const out = { ...global };
  for (const f of LIMIT_FIELDS) if (own[f] !== undefined) out[f] = Math.min(global[f], own[f]!);
  return out;
}

/** The global limits of one kind of chat, live from the settings. */
export function globalLimits(get: (key: string) => unknown, kind: ChatKind): ChatMediaLimits {
  const out = { ...CHAT_MEDIA_DEFAULTS[kind] };
  for (const f of LIMIT_FIELDS) {
    const v = get(settingKey(kind, f));
    if (typeof v === 'number' && Number.isFinite(v)) out[f] = v;
  }
  return out;
}

/**
 * The chat's own limits from a request: each a positive whole number no higher than the panel's
 * (null or left out: the panel's). `quotaMb` and `maxMb` come in megabytes. 'bad_limits' when wrong.
 */
export function cleanOverrides(raw: Record<string, unknown>, global: ChatMediaLimits): Overrides | 'bad_limits' {
  const out: Overrides = {};
  const take = (name: string, field: keyof ChatMediaLimits, scale = 1): boolean => {
    const v = raw[name];
    if (v === undefined || v === null || v === '') return true;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return false;
    const n = Math.round(v * scale);
    if (n < 1 || n > global[field]) return false;
    out[field] = n;
    return true;
  };
  const ok = take('quotaMb', 'quotaBytes', MB) && take('quotaCount', 'quotaCount') && take('days', 'days') && take('maxMb', 'maxBytes', MB) && take('perMemberDay', 'perMemberDay');
  return ok ? out : 'bad_limits';
}

/** What a chat's member sees of its limits (and, for those who manage it, its use and own limits). */
export interface LimitsView {
  limits: ChatMediaLimits;
  global?: ChatMediaLimits;
  own?: Overrides;
  usage?: { bytes: number; count: number };
}
