import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/**
 * The legal documents (terms of service, privacy policy, support terms), Polish and English, kept in
 * the database so admins edit them in the panel. Every save is a new version: a draft (published_at 0)
 * or a published one. The site shows the newest published version; a draft newer than it is what
 * the editor opens. Nothing is ever overwritten, so the history can be viewed and restored.
 *
 * On the first start each document is seeded from seed/<doc>.<lang>.md as its first published version.
 */

export const LANGS = ['pl', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export interface DocMeta { name: string; pl: { path: string; title: string }; en: { path: string; title: string } }
export const DOCS: Record<string, DocMeta> = {
  terms: { name: 'Regulamin', pl: { path: '/regulamin', title: 'Regulamin SlashClient' }, en: { path: '/terms', title: 'SlashClient Terms of Service' } },
  privacy: { name: 'Polityka prywatności', pl: { path: '/polityka-prywatnosci', title: 'Polityka prywatności SlashClient' }, en: { path: '/privacy', title: 'SlashClient Privacy Policy' } },
  'support-terms': { name: 'Regulamin wsparcia', pl: { path: '/wsparcie/regulamin', title: 'Regulamin wsparcia SlashClient' }, en: { path: '/support/terms', title: 'SlashClient Support Terms' } },
};
export const isDoc = (id: string): boolean => Object.hasOwn(DOCS, id);
export const isLang = (l: string): l is Lang => (LANGS as readonly string[]).includes(l);

/** Longest document accepted (characters). */
export const MAX_BODY = 200_000;

export interface Version { id: number; doc: string; lang: Lang; createdAt: number; by: string; byHandle: string | null; publishedAt: number; major: boolean; note: string; restoredFrom: number }
export interface FullVersion extends Version { body: string }

const COLUMNS = `v.id, v.doc, v.lang, v.created_at AS createdAt, v.by_uuid AS "by", u.handle AS byHandle, v.published_at AS publishedAt,
  v.major, v.note, v.restored_from AS restoredFrom`;

const toVersion = <T extends { major: unknown }>(r: T) => ({ ...r, major: !!r.major });

export class LegalStore {
  private readonly sql: DatabaseSync;
  private readonly now: () => number;

  constructor(sql: DatabaseSync, opts: { seedDir?: string; now?: () => number } = {}) {
    this.sql = sql;
    this.now = opts.now ?? Date.now;
    // tables of their own, added next to the others: an older database just gains them
    sql.exec(`
CREATE TABLE IF NOT EXISTS legal_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, doc TEXT NOT NULL, lang TEXT NOT NULL, body TEXT NOT NULL,
  created_at INTEGER NOT NULL, by_uuid TEXT NOT NULL DEFAULT '', published_at INTEGER NOT NULL DEFAULT 0, major INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '', restored_from INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS legal_versions_doc ON legal_versions (doc, lang, id);
CREATE TABLE IF NOT EXISTS legal_settings (doc TEXT PRIMARY KEY, banner INTEGER);
CREATE TABLE IF NOT EXISTS legal_vars (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS legal_acks (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, doc TEXT NOT NULL, version INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uuid, doc));`);
    const dir = opts.seedDir ?? path.join(import.meta.dirname, 'seed');
    for (const doc of Object.keys(DOCS)) {
      for (const lang of LANGS) {
        if (this.sql.prepare('SELECT 1 FROM legal_versions WHERE doc = ? AND lang = ?').get(doc, lang)) continue;
        let body: string;
        try {
          body = readFileSync(path.join(dir, `${doc}.${lang}.md`), 'utf8');
        } catch {
          continue;
        }
        const at = this.now();
        this.sql.prepare("INSERT INTO legal_versions (doc, lang, body, created_at, published_at, note) VALUES (?, ?, ?, ?, ?, 'Wersja początkowa')").run(doc, lang, body, at, at);
      }
    }
  }

  /** The version the site shows. */
  published(doc: string, lang: Lang): FullVersion | undefined {
    const r = this.sql.prepare(`SELECT ${COLUMNS}, v.body FROM legal_versions v LEFT JOIN users u ON u.uuid = v.by_uuid
      WHERE v.doc = ? AND v.lang = ? AND v.published_at > 0 ORDER BY v.published_at DESC, v.id DESC LIMIT 1`).get(doc, lang) as FullVersion | undefined;
    return r && toVersion(r);
  }

  /** A draft saved after the published version, if any (what the editor opens). */
  draft(doc: string, lang: Lang): FullVersion | undefined {
    const pub = this.published(doc, lang)?.id ?? 0;
    const r = this.sql.prepare(`SELECT ${COLUMNS}, v.body FROM legal_versions v LEFT JOIN users u ON u.uuid = v.by_uuid
      WHERE v.doc = ? AND v.lang = ? AND v.published_at = 0 AND v.id > ? ORDER BY v.id DESC LIMIT 1`).get(doc, lang, pub) as FullVersion | undefined;
    return r && toVersion(r);
  }

  version(id: number): FullVersion | undefined {
    const r = this.sql.prepare(`SELECT ${COLUMNS}, v.body FROM legal_versions v LEFT JOIN users u ON u.uuid = v.by_uuid WHERE v.id = ?`).get(id) as FullVersion | undefined;
    return r && toVersion(r);
  }

  /** The history, newest first, without the texts. */
  versions(doc: string, lang: Lang, limit = 100): Version[] {
    return (this.sql.prepare(`SELECT ${COLUMNS} FROM legal_versions v LEFT JOIN users u ON u.uuid = v.by_uuid
      WHERE v.doc = ? AND v.lang = ? ORDER BY v.id DESC LIMIT ?`).all(doc, lang, limit) as unknown as Version[]).map(toVersion);
  }

  saveDraft(doc: string, lang: Lang, body: string, by: string, restoredFrom = 0): FullVersion {
    const id = Number(this.sql.prepare('INSERT INTO legal_versions (doc, lang, body, created_at, by_uuid, restored_from) VALUES (?, ?, ?, ?, ?, ?)')
      .run(doc, lang, body, this.now(), by, restoredFrom).lastInsertRowid);
    return this.version(id)!;
  }

  publish(doc: string, lang: Lang, body: string, by: string, major: boolean, note: string): FullVersion {
    const at = this.now();
    const id = Number(this.sql.prepare('INSERT INTO legal_versions (doc, lang, body, created_at, by_uuid, published_at, major, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(doc, lang, body, at, by, at, major ? 1 : 0, note).lastInsertRowid);
    return this.version(id)!;
  }

  /** The "draft" banner: the admin's choice for this document, or `fallback` (LEGAL_DRAFT) when they made none. */
  banner(doc: string, fallback: boolean): boolean {
    const r = this.sql.prepare('SELECT banner FROM legal_settings WHERE doc = ?').get(doc) as { banner: number | null } | undefined;
    return r?.banner === null || r?.banner === undefined ? fallback : !!r.banner;
  }
  bannerChoice(doc: string): boolean | null {
    const r = this.sql.prepare('SELECT banner FROM legal_settings WHERE doc = ?').get(doc) as { banner: number | null } | undefined;
    return r?.banner === null || r?.banner === undefined ? null : !!r.banner;
  }
  setBanner(doc: string, banner: boolean | null) {
    this.sql.prepare('INSERT INTO legal_settings (doc, banner) VALUES (?, ?) ON CONFLICT (doc) DO UPDATE SET banner = excluded.banner')
      .run(doc, banner === null ? null : banner ? 1 : 0);
  }

  vars(): Record<string, string> {
    return Object.fromEntries((this.sql.prepare('SELECT key, value FROM legal_vars').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  }
  setVar(key: string, value: string) {
    this.sql.prepare('INSERT INTO legal_vars (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(key, value, this.now());
  }

  /** The newest published change marked "important" of a document (any language). */
  lastMajor(doc: string): { id: number; at: number; note: string } | undefined {
    return this.sql.prepare('SELECT id, published_at AS at, note FROM legal_versions WHERE doc = ? AND major = 1 AND published_at > 0 ORDER BY published_at DESC, id DESC LIMIT 1')
      .get(doc) as { id: number; at: number; note: string } | undefined;
  }

  acked(uuid: string, doc: string): number {
    return (this.sql.prepare('SELECT version FROM legal_acks WHERE uuid = ? AND doc = ?').get(uuid, doc) as { version: number } | undefined)?.version ?? 0;
  }
  ack(uuid: string, doc: string, version: number) {
    this.sql.prepare('INSERT INTO legal_acks (uuid, doc, version, at) VALUES (?, ?, ?, ?) ON CONFLICT (uuid, doc) DO UPDATE SET version = MAX(version, excluded.version), at = excluded.at')
      .run(uuid, doc, version, this.now());
  }
}
