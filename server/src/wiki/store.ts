import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { LANGS, type Lang, isSlug } from './format.ts';

/**
 * The SlashClient wiki's pages, Polish and English, kept in the database so admins edit them in the
 * panel. Like the legal documents, every save is a new version (a draft, published_at 0, or a
 * published one) and nothing is overwritten, so any version can come back.
 *
 * The first texts ship with the code in seed/<lang>/<slug>.md. A page nobody edited follows them:
 * on every start, when the file differs from what the page last took from the code, it becomes the
 * page's new published version, so new content reaches the site with a deploy. Once an admin saves
 * a page (a draft or a publish), it is theirs and the code no longer changes it; the panel shows that
 * the code has another text, and "restoring the code's version" publishes it and makes the page
 * follow the code again. A page an admin deleted is not brought back by its file.
 */

/** Longest page accepted (characters). */
export const MAX_BODY = 200_000;

export interface Version {
  id: number; slug: string; lang: Lang; createdAt: number; by: string; byHandle: string | null; publishedAt: number;
  note: string; restoredFrom: number; seedHash: string;
}
export interface FullVersion extends Version { body: string }

const COLUMNS = `v.id, v.slug, v.lang, v.created_at AS createdAt, v.by_uuid AS "by", u.handle AS byHandle, v.published_at AS publishedAt,
  v.note, v.restored_from AS restoredFrom, v.seed_hash AS seedHash`;

export const hashOf = (body: string) => createHash('sha256').update(body.replace(/\r\n?/g, '\n')).digest('hex').slice(0, 32);

export class WikiStore {
  private readonly sql: DatabaseSync;
  private readonly now: () => number;
  readonly seedDir: string;
  /** Raised by every change that adds no version (deleting, renaming), for stamp(). */
  private changes = 0;

  constructor(sql: DatabaseSync, opts: { seedDir?: string; now?: () => number } = {}) {
    this.sql = sql;
    this.now = opts.now ?? Date.now;
    this.seedDir = opts.seedDir ?? path.join(import.meta.dirname, 'seed');
    sql.exec(`
CREATE TABLE IF NOT EXISTS wiki_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, lang TEXT NOT NULL, body TEXT NOT NULL,
  created_at INTEGER NOT NULL, by_uuid TEXT NOT NULL DEFAULT '', published_at INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '',
  restored_from INTEGER NOT NULL DEFAULT 0, seed_hash TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS wiki_versions_page ON wiki_versions (slug, lang, id);
CREATE TABLE IF NOT EXISTS wiki_deleted (slug TEXT PRIMARY KEY, at INTEGER NOT NULL, by_uuid TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS wiki_redirects (slug TEXT PRIMARY KEY, target TEXT NOT NULL, at INTEGER NOT NULL);`);
    this.syncSeed();
  }

  // ---------- the texts in the code ----------

  /** The slugs that have a file in the code, in either language. */
  seedSlugs(): string[] {
    const out = new Set<string>();
    for (const lang of LANGS) {
      try {
        for (const f of readdirSync(path.join(this.seedDir, lang))) {
          const slug = f.replace(/\.md$/, '');
          if (f.endsWith('.md') && isSlug(slug)) out.add(slug);
        }
      } catch { /* no folder for this language */ }
    }
    return [...out].sort();
  }

  seed(slug: string, lang: Lang): string | undefined {
    if (!isSlug(slug)) return undefined;
    try {
      return readFileSync(path.join(this.seedDir, lang, `${slug}.md`), 'utf8').replace(/\r\n?/g, '\n');
    } catch {
      return undefined;
    }
  }

  /** Brings every page that follows the code up to its file (on start; see above). Returns how many versions it added. */
  syncSeed(): number {
    let added = 0;
    for (const slug of this.seedSlugs()) {
      if (this.deleted(slug)) continue;
      for (const lang of LANGS) {
        const body = this.seed(slug, lang);
        if (body === undefined) continue;
        const hash = hashOf(body);
        const pub = this.published(slug, lang);
        const any = pub ?? this.latest(slug, lang);
        // a new page, or one that follows the code (its live version came from it and no draft waits)
        const follows = !any || (pub && pub.seedHash && !this.draft(slug, lang));
        if (!follows || pub?.seedHash === hash) continue;
        const at = this.now();
        this.sql.prepare('INSERT INTO wiki_versions (slug, lang, body, created_at, published_at, note, seed_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(slug, lang, body, at, at, any ? 'Aktualizacja z kodu' : 'Wersja początkowa', hash);
        added++;
      }
    }
    return added;
  }

  /** How a page stands against its file: whether it still follows it, and whether the code's text differs from the live one. */
  seedState(slug: string, lang: Lang): { exists: boolean; follows: boolean; differs: boolean; newer: boolean } {
    const body = this.seed(slug, lang);
    if (body === undefined) return { exists: false, follows: false, differs: false, newer: false };
    const hash = hashOf(body);
    const pub = this.published(slug, lang);
    const follows = !!pub?.seedHash && !this.draft(slug, lang);
    const differs = !pub || hashOf(pub.body) !== hash;
    // "newer": the code changed since the page last took a text from it
    const last = (this.sql.prepare("SELECT seed_hash AS h FROM wiki_versions WHERE slug = ? AND lang = ? AND seed_hash != '' ORDER BY id DESC LIMIT 1")
      .get(slug, lang) as { h: string } | undefined)?.h;
    return { exists: true, follows, differs, newer: differs && last !== hash };
  }

  // ---------- versions ----------

  published(slug: string, lang: Lang): FullVersion | undefined {
    return this.sql.prepare(`SELECT ${COLUMNS}, v.body FROM wiki_versions v LEFT JOIN users u ON u.uuid = v.by_uuid
      WHERE v.slug = ? AND v.lang = ? AND v.published_at > 0 ORDER BY v.published_at DESC, v.id DESC LIMIT 1`).get(slug, lang) as FullVersion | undefined;
  }

  /** A draft saved after the published version, if any (what the editor opens). */
  draft(slug: string, lang: Lang): FullVersion | undefined {
    const pub = this.published(slug, lang)?.id ?? 0;
    return this.sql.prepare(`SELECT ${COLUMNS}, v.body FROM wiki_versions v LEFT JOIN users u ON u.uuid = v.by_uuid
      WHERE v.slug = ? AND v.lang = ? AND v.published_at = 0 AND v.id > ? ORDER BY v.id DESC LIMIT 1`).get(slug, lang, pub) as FullVersion | undefined;
  }

  private latest(slug: string, lang: Lang): FullVersion | undefined {
    return this.sql.prepare(`SELECT ${COLUMNS}, v.body FROM wiki_versions v LEFT JOIN users u ON u.uuid = v.by_uuid
      WHERE v.slug = ? AND v.lang = ? ORDER BY v.id DESC LIMIT 1`).get(slug, lang) as FullVersion | undefined;
  }

  version(id: number): FullVersion | undefined {
    return this.sql.prepare(`SELECT ${COLUMNS}, v.body FROM wiki_versions v LEFT JOIN users u ON u.uuid = v.by_uuid WHERE v.id = ?`).get(id) as FullVersion | undefined;
  }

  versions(slug: string, lang: Lang, limit = 100): Version[] {
    return this.sql.prepare(`SELECT ${COLUMNS} FROM wiki_versions v LEFT JOIN users u ON u.uuid = v.by_uuid
      WHERE v.slug = ? AND v.lang = ? ORDER BY v.id DESC LIMIT ?`).all(slug, lang, limit) as unknown as Version[];
  }

  saveDraft(slug: string, lang: Lang, body: string, by: string, restoredFrom = 0): FullVersion {
    const id = Number(this.sql.prepare('INSERT INTO wiki_versions (slug, lang, body, created_at, by_uuid, restored_from) VALUES (?, ?, ?, ?, ?, ?)')
      .run(slug, lang, body, this.now(), by, restoredFrom).lastInsertRowid);
    this.undelete(slug);
    return this.version(id)!;
  }

  /** `seedHash` set: the code's text, published so the page follows the code again. */
  publish(slug: string, lang: Lang, body: string, by: string, note: string, seedHash = ''): FullVersion {
    const at = this.now();
    const id = Number(this.sql.prepare('INSERT INTO wiki_versions (slug, lang, body, created_at, by_uuid, published_at, note, seed_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(slug, lang, body, at, by, at, note, seedHash).lastInsertRowid);
    this.undelete(slug);
    return this.version(id)!;
  }

  // ---------- pages ----------

  /** Every page with any version (deleted ones left out). */
  slugs(): string[] {
    return (this.sql.prepare('SELECT DISTINCT slug FROM wiki_versions WHERE slug NOT IN (SELECT slug FROM wiki_deleted) ORDER BY slug').all() as { slug: string }[]).map((r) => r.slug);
  }

  exists(slug: string): boolean {
    return !this.deleted(slug) && !!this.sql.prepare('SELECT 1 FROM wiki_versions WHERE slug = ? LIMIT 1').get(slug);
  }

  deleted(slug: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM wiki_deleted WHERE slug = ?').get(slug);
  }

  /** Off the site and the panel's list; the versions stay, so making a page with the same address brings its history back. */
  remove(slug: string, by: string) {
    this.changes++;
    this.sql.prepare('INSERT INTO wiki_deleted (slug, at, by_uuid) VALUES (?, ?, ?) ON CONFLICT (slug) DO UPDATE SET at = excluded.at, by_uuid = excluded.by_uuid').run(slug, this.now(), by);
    this.sql.prepare('DELETE FROM wiki_redirects WHERE target = ?').run(slug);
  }

  /** Back on the site and the list (a deleted page brought back, or one saved again). */
  undelete(slug: string) {
    this.changes++;
    this.sql.prepare('DELETE FROM wiki_deleted WHERE slug = ?').run(slug);
    this.sql.prepare('DELETE FROM wiki_redirects WHERE slug = ?').run(slug);
  }

  /**
   * A new address for a page: its versions move with it, the old address leads to the new one, and the old
   * address's file in the code (if any) no longer makes a page of its own.
   */
  rename(from: string, to: string, by: string) {
    this.changes++;
    this.sql.exec('BEGIN');
    try {
      this.sql.prepare('UPDATE wiki_versions SET slug = ? WHERE slug = ?').run(to, from);
      this.sql.prepare('DELETE FROM wiki_deleted WHERE slug = ?').run(to);
      this.sql.prepare('DELETE FROM wiki_redirects WHERE slug = ?').run(to);
      this.sql.prepare('INSERT INTO wiki_deleted (slug, at, by_uuid) VALUES (?, ?, ?) ON CONFLICT (slug) DO UPDATE SET at = excluded.at').run(from, this.now(), by);
      this.sql.prepare('UPDATE wiki_redirects SET target = ? WHERE target = ?').run(to, from);
      this.sql.prepare('INSERT INTO wiki_redirects (slug, target, at) VALUES (?, ?, ?) ON CONFLICT (slug) DO UPDATE SET target = excluded.target, at = excluded.at').run(from, to, this.now());
      this.sql.exec('COMMIT');
    } catch (err) {
      this.sql.exec('ROLLBACK');
      throw err;
    }
  }

  /** Where an old address leads now, if it was renamed. */
  redirect(slug: string): string | undefined {
    return (this.sql.prepare('SELECT target FROM wiki_redirects WHERE slug = ?').get(slug) as { target: string } | undefined)?.target;
  }

  /** A number that changes with every save (what the pages' cache is keyed on). */
  stamp(): string {
    const r = this.sql.prepare('SELECT MAX(id) AS id FROM wiki_versions').get() as { id: number | null };
    return `${r.id ?? 0}:${this.changes}`;
  }
}
