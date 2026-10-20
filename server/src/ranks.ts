import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { LogoStore, logoProblem, readLogo, serveLogo } from './clanLogos.ts';

/**
 * Ranks: what a player is (Admin, Support, Partner, Friend, Supporter, and whatever the admins add
 * in the panel). A rank has a colour, the Slash logo next to the nick is drawn in, and optionally a
 * small icon of its own (16×16 or 32×32) the launcher and the website show instead of the logo
 * (the game keeps the logo in the rank's colour). A player may hold several ranks: the public
 * profile shows them all, and the player picks which one's badge goes next to their nick (or none;
 * by default the most important one).
 *
 * Most ranks are given by admins (user_ranks, optionally until a day); two come by themselves:
 * 'admin' with the admin role, 'supporter' while a supporter tier is active (payments/support.ts;
 * then in the tier's colour and with its name). Rank-only cosmetics (cosmetics.ts `rank`) are for
 * anyone holding that rank.
 *
 * Before ranks lived here an account had one, users.rank; it still mirrors the given rank shown
 * (or the first of them) for whatever reads it.
 */

/** How a rank comes: given by an admin (''), with the admin role, or with an active supporter tier. */
export type RankAuto = '' | 'role' | 'payment';
/** Where a player's rank came from. */
export type RankSource = 'admin' | 'payment' | 'achievement' | 'role' | 'migration';

export interface RankDef {
  id: string; name: string; nameEn: string; color: string; priority: number;
  description: string; descriptionEn: string; auto: RankAuto; enabled: boolean;
  /** Seeded from the first ranks: cannot be deleted (only switched off). */
  builtin: boolean;
  /** The custom icon's version, when it has one (its address: /v1/ranks/<id>/logo.png?v=). */
  icon?: number;
}

/** A rank a player holds now, as the clients get it. */
export interface HeldRank {
  id: string; name: string; nameEn: string; color: string; priority: number;
  /** The custom icon's address, when the rank has one. */
  icon?: string;
  source: RankSource;
  grantedAt?: number;
  expiresAt?: number | null;
}

/** The first ranks, as the game drew them before ranks could be edited (hud Badges.java's colours). */
export const SEED: Omit<RankDef, 'builtin' | 'enabled' | 'icon'>[] = [
  { id: 'admin', name: 'Admin', nameEn: 'Admin', color: '#ef4444', priority: 100, description: 'Administrator SlashClient (z roli admina).', descriptionEn: 'SlashClient administrator (from the admin role).', auto: 'role' },
  { id: 'support', name: 'Support', nameEn: 'Support', color: '#38bdf8', priority: 90, description: 'Pomoc dla graczy.', descriptionEn: 'Player support.', auto: '' },
  { id: 'partner', name: 'Partner', nameEn: 'Partner', color: '#facc15', priority: 80, description: 'Partner projektu.', descriptionEn: 'Project partner.', auto: '' },
  { id: 'friend', name: 'Przyjaciel', nameEn: 'Friend', color: '#22c55e', priority: 70, description: 'Przyjaciel projektu (zielony).', descriptionEn: 'Friend of the project (green).', auto: '' },
  { id: 'friend_pink', name: 'Przyjaciel', nameEn: 'Friend', color: '#ec4899', priority: 60, description: 'Przyjaciel projektu (różowy).', descriptionEn: 'Friend of the project (pink).', auto: '' },
  { id: 'supporter', name: 'Wspierający', nameEn: 'Supporter', color: '#f472b6', priority: 10, description: 'Aktywne wsparcie projektu; kolor i nazwa z progu wsparcia.', descriptionEn: 'Active support of the project; colour and name from the support tier.', auto: 'payment' },
];
/** The ranks HUDs knew before ranks could be edited (old HUDs draw only these, in their own colours). */
const OLD_HUD_RANKS = ['admin', 'support', 'partner', 'friend'];
/** What users.rank could hold. */
const LEGACY_RANKS = ['support', 'partner', 'friend', 'friend_pink'];

export const RANK_ID = /^[a-z][a-z0-9_]{1,23}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
export const ICON_SIZES = [16, 32];

/** Why these bytes are not a rank icon: a PNG 16×16 or 32×32 (checked like clan logos), or undefined. */
export function iconProblem(data: Buffer): 'not_png' | 'bad_logo_size' | 'too_large' | undefined {
  const problem = logoProblem(data);
  // logoProblem checks the size last and wants 64×64: past that only ours count
  if (problem !== 'bad_logo_size' && problem !== undefined) return problem;
  const w = data.readUInt32BE(16);
  return w === data.readUInt32BE(20) && ICON_SIZES.includes(w) ? undefined : 'bad_logo_size';
}

/**
 * The badge the game draws for a player, for a HUD that knows `known` ranks (its knownRanks).
 * HUDs from 0.9.23 say 'colors': they get any rank with its colour. Older ones get the shown rank
 * if they know it (the pink friend as the green one when they know only that), else the supporter's
 * logo in the rank's colour if they tint that one, else the most important rank they know, else
 * nothing (the white logo).
 */
export function gameBadge(shown: HeldRank | undefined, held: HeldRank[], known: string[]): { rank: string; color?: string; supporterColor?: string } | undefined {
  if (!shown) return undefined;
  if (known.includes('colors')) return { rank: shown.id, color: shown.color };
  const knows = (id: string) => OLD_HUD_RANKS.includes(id) || known.includes(id);
  const as = (r: HeldRank) => (r.id === 'supporter' ? (knows('supporter') ? { rank: 'supporter', supporterColor: r.color } : undefined)
    : knows(r.id) ? { rank: r.id } : r.id === 'friend_pink' ? { rank: 'friend' } : undefined);
  // a rank it does not know: drawn as the supporter's logo in its colour by a HUD that tints that one
  const own = as(shown) ?? (knows('supporter') ? { rank: 'supporter', supporterColor: shown.color } : undefined);
  if (own) return own;
  for (const r of held) {
    const other = r === shown ? undefined : as(r);
    if (other) return other;
  }
  return undefined;
}

interface DefRow { id: string; name: string; name_en: string; color: string; priority: number; description: string; description_en: string; auto: string; enabled: number; builtin: number }
const toDef = (r: DefRow, icon?: number): RankDef => ({
  id: r.id, name: r.name, nameEn: r.name_en, color: r.color, priority: r.priority, description: r.description, descriptionEn: r.description_en,
  auto: r.auto as RankAuto, enabled: !!r.enabled, builtin: !!r.builtin, ...(icon ? { icon } : {}),
});

/** The ranks, who holds which, and what each player picked to show. */
export class RankStore {
  readonly sql: DatabaseSync;
  readonly icons: LogoStore;
  private now: () => number;

  constructor(sql: DatabaseSync, now: () => number = Date.now) {
    this.sql = sql;
    this.now = now;
    // the first start with ranks: the one rank each account had moves over below
    const fresh = !sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user_ranks'").get();
    sql.exec(`
CREATE TABLE IF NOT EXISTS ranks (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', color TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '', auto TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
  builtin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS user_ranks (
  uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, rank TEXT NOT NULL REFERENCES ranks(id) ON DELETE CASCADE,
  granted_by TEXT NOT NULL DEFAULT '', granted_at INTEGER NOT NULL, expires_at INTEGER, source TEXT NOT NULL DEFAULT 'admin',
  PRIMARY KEY (uuid, rank));
CREATE INDEX IF NOT EXISTS user_ranks_rank ON user_ranks(rank);
CREATE TABLE IF NOT EXISTS rank_badge_choice (uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, rank TEXT NOT NULL);
`);
    const at = now();
    const seed = sql.prepare(`INSERT OR IGNORE INTO ranks (id, name, name_en, color, priority, description, description_en, auto, enabled, builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`);
    for (const r of SEED) seed.run(r.id, r.name, r.nameEn, r.color, r.priority, r.description, r.descriptionEn, r.auto, at, at);
    this.icons = new LogoStore(sql, 'rank_icons', 'ranks', '/v1/ranks', 'rank_id');
    if (fresh) {
      sql.prepare(`INSERT OR IGNORE INTO user_ranks (uuid, rank, granted_by, granted_at, expires_at, source)
        SELECT uuid, rank, '', ?, NULL, 'migration' FROM users WHERE rank IN (${LEGACY_RANKS.map(() => '?').join(', ')})`).run(at, ...LEGACY_RANKS);
    }
  }

  defs(): RankDef[] {
    const rows = this.sql.prepare('SELECT * FROM ranks ORDER BY priority DESC, id').all() as unknown as DefRow[];
    return rows.map((r) => toDef(r, this.icons.version(r.id)));
  }

  def(id: string): RankDef | undefined {
    const r = this.sql.prepare('SELECT * FROM ranks WHERE id = ?').get(id) as DefRow | undefined;
    return r ? toDef(r, this.icons.version(r.id)) : undefined;
  }

  /** A new rank (always one admins give) or changes to one; `patch` is already checked. */
  save(id: string, patch: Partial<Pick<RankDef, 'name' | 'nameEn' | 'color' | 'priority' | 'description' | 'descriptionEn' | 'enabled'>>): RankDef {
    const at = this.now();
    const cur = this.def(id);
    const next = { name: '', nameEn: '', color: '#9ca3af', priority: 50, description: '', descriptionEn: '', enabled: true, ...cur, ...patch };
    this.sql.prepare(`INSERT INTO ranks (id, name, name_en, color, priority, description, description_en, auto, enabled, builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, 0, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, name_en = excluded.name_en, color = excluded.color, priority = excluded.priority,
        description = excluded.description, description_en = excluded.description_en, enabled = excluded.enabled, updated_at = excluded.updated_at`)
      .run(id, next.name, next.nameEn, next.color.toLowerCase(), next.priority, next.description, next.descriptionEn, next.enabled ? 1 : 0, at, at);
    return this.def(id)!;
  }

  /** Deletes a rank and every grant of it (and choices of it fall back to the default). */
  remove(id: string): boolean {
    this.sql.prepare('DELETE FROM rank_badge_choice WHERE rank = ?').run(id);
    return Number(this.sql.prepare('DELETE FROM ranks WHERE id = ?').run(id).changes) > 0;
  }

  holders(id: string): string[] {
    const at = this.now();
    return (this.sql.prepare('SELECT uuid FROM user_ranks WHERE rank = ? AND (expires_at IS NULL OR expires_at > ?)').all(id, at) as { uuid: string }[]).map((r) => r.uuid);
  }

  holderCounts(): Record<string, number> {
    const rows = this.sql.prepare('SELECT rank, COUNT(*) AS n FROM user_ranks WHERE expires_at IS NULL OR expires_at > ? GROUP BY rank').all(this.now()) as { rank: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.rank, r.n]));
  }

  /** Every grant of a player, expired ones too (the admin panel). */
  grants(uuid: string): { rank: string; grantedBy: string; grantedAt: number; expiresAt: number | null; source: RankSource }[] {
    return this.sql.prepare('SELECT rank, granted_by AS grantedBy, granted_at AS grantedAt, expires_at AS expiresAt, source FROM user_ranks WHERE uuid = ? ORDER BY granted_at')
      .all(uuid) as { rank: string; grantedBy: string; grantedAt: number; expiresAt: number | null; source: RankSource }[];
  }

  /** Gives a rank (again: a new expiry replaces the old one). */
  grant(uuid: string, rank: string, by: string, expiresAt: number | null, source: RankSource = 'admin') {
    this.sql.prepare(`INSERT INTO user_ranks (uuid, rank, granted_by, granted_at, expires_at, source) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (uuid, rank) DO UPDATE SET granted_by = excluded.granted_by, granted_at = excluded.granted_at, expires_at = excluded.expires_at, source = excluded.source`)
      .run(uuid, rank, by, this.now(), expiresAt, source);
  }

  revoke(uuid: string, rank: string): boolean {
    return Number(this.sql.prepare('DELETE FROM user_ranks WHERE uuid = ? AND rank = ?').run(uuid, rank).changes) > 0;
  }

  /** What the player picked to show: '' (the default, the most important rank), 'none', or a rank's id. */
  choice(uuid: string): string {
    return (this.sql.prepare('SELECT rank FROM rank_badge_choice WHERE uuid = ?').get(uuid) as { rank: string } | undefined)?.rank ?? '';
  }

  setChoice(uuid: string, rank: string) {
    if (!rank) this.sql.prepare('DELETE FROM rank_badge_choice WHERE uuid = ?').run(uuid);
    else this.sql.prepare('INSERT INTO rank_badge_choice (uuid, rank) VALUES (?, ?) ON CONFLICT (uuid) DO UPDATE SET rank = excluded.rank').run(uuid, rank);
  }

  /** The ids of the ranks given to a player that are in force now. */
  givenNow(uuid: string): { rank: string; source: RankSource; grantedAt: number; expiresAt: number | null }[] {
    return this.sql.prepare('SELECT rank, source, granted_at AS grantedAt, expires_at AS expiresAt FROM user_ranks WHERE uuid = ? AND (expires_at IS NULL OR expires_at > ?)')
      .all(uuid, this.now()) as { rank: string; source: RankSource; grantedAt: number; expiresAt: number | null }[];
  }

  /** users.rank, for what still reads one rank: the given rank shown, else the most important given one of the old ones. */
  mirror(uuid: string, shown: string | undefined) {
    const given = this.givenNow(uuid).map((g) => g.rank);
    const old = LEGACY_RANKS.filter((r) => given.includes(r));
    const value = shown && old.includes(shown) ? shown : old.sort((a, b) => (this.def(b)?.priority ?? 0) - (this.def(a)?.priority ?? 0))[0] ?? '';
    this.sql.prepare('UPDATE users SET rank = ? WHERE uuid = ? AND rank != ?').run(value, uuid, value);
  }
}

export interface RankUser { id: string; handle: string; role: string; banned?: boolean }

export interface RankDeps {
  sql: DatabaseSync;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  user: (uuid: string) => RankUser | undefined;
  /** By role or by the configuration. */
  isAdmin: (user: RankUser) => boolean;
  /** The active supporter tier's colour and name (payments/support.ts), undefined when none. */
  supporter: (uuid: string) => { color: string; name?: string; nameEn?: string } | undefined;
  /** A player's ranks changed: what they show in game is sent again. */
  changed: (uuid: string) => void;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  fail: (status: number, code: string) => never;
  now?: () => number;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

export function createRanks(deps: RankDeps) {
  const now = deps.now ?? Date.now;
  const store = new RankStore(deps.sql, now);
  const { fail } = deps;
  const iconUrl = (d: RankDef) => (d.icon ? store.icons.url(d.id, d.icon) : undefined);

  /** Every rank the player holds now, given or automatic, most important first (switched-off ones only with `all`). */
  function held(user: RankUser, all = false): HeldRank[] {
    const defs = new Map(store.defs().map((d) => [d.id, d]));
    const out: HeldRank[] = [];
    const add = (d: RankDef | undefined, extra: Partial<HeldRank> & { source: RankSource }) => {
      if (!d || (!d.enabled && !all) || out.some((h) => h.id === d.id)) return;
      out.push({ id: d.id, name: d.name, nameEn: d.nameEn || d.name, color: d.color, priority: d.priority, ...(iconUrl(d) ? { icon: iconUrl(d) } : {}), ...extra });
    };
    for (const d of defs.values()) {
      if (d.auto === 'role' && deps.isAdmin(user)) add(d, { source: 'role' });
      if (d.auto === 'payment') {
        const tier = deps.supporter(user.id);
        // in the tier's colour and with its name, as the supporters' pages show it
        if (tier) add({ ...d, color: COLOR.test(tier.color) ? tier.color.toLowerCase() : d.color, name: tier.name || d.name, nameEn: tier.nameEn || tier.name || d.nameEn }, { source: 'payment' });
      }
    }
    for (const g of store.givenNow(user.id)) {
      const d = defs.get(g.rank);
      if (d && !d.auto) add(d, { source: g.source, grantedAt: g.grantedAt, expiresAt: g.expiresAt });
    }
    return out.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  }

  /** The rank whose badge goes next to the nick: the one picked, else the most important; undefined for none. */
  function shown(user: RankUser, list = held(user)): HeldRank | undefined {
    if (user.banned) return undefined;
    const choice = store.choice(user.id);
    if (choice === 'none') return undefined;
    return list.find((h) => h.id === choice) ?? list[0];
  }

  /** The ranks that let a player wear rank cosmetics (an admin's role always counts, even with the rank switched off). */
  function wear(user: RankUser): string[] {
    const ids = held(user).map((h) => h.id);
    return deps.isAdmin(user) && !ids.includes('admin') ? [...ids, 'admin'] : ids;
  }

  const sync = (uuid: string) => {
    const u = deps.user(uuid);
    if (u) store.mirror(uuid, shown(u)?.id);
    deps.changed(uuid);
  };

  /** The public view of rank definitions (enabled ones). */
  const publicDef = (d: RankDef) => ({ id: d.id, name: d.name, nameEn: d.nameEn || d.name, color: d.color, priority: d.priority, description: d.description, descriptionEn: d.descriptionEn || d.description, auto: d.auto, ...(iconUrl(d) ? { icon: iconUrl(d) } : {}) });

  /** What /v1/me adds: the ranks held, the choice and the rank shown. */
  function forMe(user: RankUser) {
    const list = held(user);
    const s = shown(user, list);
    return { ranks: list, badgeChoice: store.choice(user.id), badgeRank: s ?? null };
  }

  /** The panel's (and the old API's) "this player has exactly this given rank" ('' = none): admin.ts's `rank`. */
  function setOnly(uuid: string, rank: string, by: string): boolean {
    const d = rank ? store.def(rank) : undefined;
    if (rank && (!d || d.auto)) return false;
    for (const g of store.givenNow(uuid)) if (g.rank !== rank) store.revoke(uuid, g.rank);
    if (rank && !store.givenNow(uuid).some((g) => g.rank === rank)) store.grant(uuid, rank, by, null);
    sync(uuid);
    return true;
  }

  /** The fields of a rank from the panel, checked. */
  function patchOf(b: Record<string, unknown>, creating: boolean) {
    const patch: Parameters<RankStore['save']>[1] = {};
    const name = text(b.name, 32);
    if (name !== undefined) patch.name = name;
    if (creating && !patch.name) fail(400, 'bad_name');
    if (name === '') fail(400, 'bad_name');
    const nameEn = text(b.nameEn, 32);
    if (nameEn !== undefined) patch.nameEn = nameEn;
    if (b.color !== undefined) {
      if (typeof b.color !== 'string' || !COLOR.test(b.color)) fail(400, 'bad_color');
      patch.color = b.color as string;
    }
    if (b.priority !== undefined) {
      if (!Number.isInteger(b.priority) || (b.priority as number) < 0 || (b.priority as number) > 1000) fail(400, 'bad_priority');
      patch.priority = b.priority as number;
    }
    const description = text(b.description, 200);
    if (description !== undefined) patch.description = description;
    const descriptionEn = text(b.descriptionEn, 200);
    if (descriptionEn !== undefined) patch.descriptionEn = descriptionEn;
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== 'boolean') fail(400, 'bad_request');
      patch.enabled = b.enabled as boolean;
    }
    return patch;
  }

  const defOr404 = (id: string) => store.def(id) ?? fail(404, 'not_found');
  const userOr404 = (id: string) => deps.user(id) ?? fail(404, 'not_found');
  /** Everyone a change of a rank's look reaches (given holders; automatic ones change by themselves). */
  const touchHolders = (id: string) => {
    for (const uuid of store.holders(id)) sync(uuid);
  };
  const adminView = (d: RankDef, counts: Record<string, number>) => ({ ...d, iconUrl: iconUrl(d), holders: counts[d.id] ?? 0 });

  /** The ranks of a player as the admin panel shows them: every grant (expired too) and what is shown. */
  function adminUserRanks(id: string) {
    const u = userOr404(id);
    const list = held(u, true);
    return {
      grants: store.grants(id).map((g) => ({ ...g, grantedByHandle: g.grantedBy ? deps.user(g.grantedBy)?.handle ?? '' : '', expired: g.expiresAt !== null && g.expiresAt <= now() })),
      held: list, shown: shown(u, held(u))?.id ?? '', choice: store.choice(id),
    };
  }

  const routes: [string, RegExp, Handler][] = [
    // the ranks there are (enabled ones), for the pages' and the launcher's names, colours and icons
    ['GET', /^\/v1\/ranks$/, () => ({ ranks: store.defs().filter((d) => d.enabled).map(publicDef) })],
    // the player's pick of the badge next to their nick: '' = the most important rank, 'none', or a rank they hold
    ['POST', /^\/v1\/me\/badge$/, async (req) => {
      const me = deps.authed(req);
      const { rank } = await deps.body(req);
      if (typeof rank !== 'string') fail(400, 'bad_request');
      const u = userOr404(me);
      if (rank && rank !== 'none' && !held(u).some((h) => h.id === rank)) fail(400, 'not_your_rank');
      store.setChoice(me, rank as string);
      sync(me);
      return forMe(u);
    }],

    // -- the admin panel: rank definitions --
    ['GET', /^\/v1\/admin\/ranks$/, (req) => {
      deps.admin(req);
      const counts = store.holderCounts();
      return { ranks: store.defs().map((d) => adminView(d, counts)) };
    }],
    ['POST', /^\/v1\/admin\/ranks$/, async (req) => {
      const me = deps.admin(req);
      const b = await deps.body(req);
      const id = typeof b.id === 'string' ? b.id.trim().toLowerCase() : '';
      if (!RANK_ID.test(id) || id === 'none' || id === 'colors') fail(400, 'bad_id');
      if (store.def(id)) fail(409, 'exists');
      const d = store.save(id, patchOf(b, true));
      deps.audit(me, 'rank_create', id, `${d.name} ${d.color}`);
      return adminView(d, {});
    }],
    ['POST', /^\/v1\/admin\/ranks\/([\w-]+)$/, async (req, [id]) => {
      const me = deps.admin(req);
      const before = defOr404(id);
      const patch = patchOf(await deps.body(req), false);
      const d = store.save(id, patch);
      const changed = Object.keys(patch).filter((k) => (before as unknown as Record<string, unknown>)[k] !== (d as unknown as Record<string, unknown>)[k]);
      if (changed.length) {
        deps.audit(me, 'rank_update', id, changed.map((k) => `${k}: ${String((d as unknown as Record<string, unknown>)[k])}`).join(', '));
        touchHolders(id);
      }
      return adminView(d, store.holderCounts());
    }],
    ['DELETE', /^\/v1\/admin\/ranks\/([\w-]+)$/, (req, [id]) => {
      const me = deps.admin(req);
      const d = defOr404(id);
      // the first ones (rank cosmetics and the game rely on them) are only switched off
      if (d.builtin) fail(400, 'builtin');
      const who = store.holders(id);
      store.remove(id);
      for (const uuid of who) sync(uuid);
      deps.audit(me, 'rank_delete', id, d.name);
      return { ok: true };
    }],
    // the rank's own icon: a 16×16 or 32×32 PNG, the raw body
    ['PUT', /^\/v1\/admin\/ranks\/([\w-]+)\/icon$/, async (req, [id]) => {
      let me = '';
      try {
        me = deps.admin(req);
        defOr404(id);
      } catch (err) {
        req.resume();
        throw err;
      }
      const png = await readLogo(req, fail);
      const problem = iconProblem(png);
      if (problem) fail(problem === 'too_large' ? 413 : 400, problem);
      store.icons.set(id, png, now());
      deps.audit(me, 'rank_icon', id, `${png.readUInt32BE(16)}px`);
      touchHolders(id);
      return adminView(store.def(id)!, store.holderCounts());
    }],
    ['DELETE', /^\/v1\/admin\/ranks\/([\w-]+)\/icon$/, (req, [id]) => {
      const me = deps.admin(req);
      defOr404(id);
      if (store.icons.remove(id)) {
        deps.audit(me, 'rank_icon', id, '—');
        touchHolders(id);
      }
      return adminView(store.def(id)!, store.holderCounts());
    }],

    // -- the admin panel: a player's ranks --
    ['GET', /^\/v1\/admin\/users\/([\w-]+)\/ranks$/, (req, [id]) => {
      deps.admin(req);
      return adminUserRanks(id);
    }],
    // { rank, expiresAt?: ms or null (for good) }: gives it (again)
    ['POST', /^\/v1\/admin\/users\/([\w-]+)\/ranks$/, async (req, [id]) => {
      const me = deps.admin(req);
      const u = userOr404(id);
      const { rank, expiresAt } = await deps.body(req);
      const d = typeof rank === 'string' ? store.def(rank) : undefined;
      if (!d) fail(400, 'bad_rank');
      if (d!.auto) fail(400, 'auto_rank');
      if (expiresAt !== undefined && expiresAt !== null && (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= now())) fail(400, 'bad_expiry');
      store.grant(id, d!.id, me, (expiresAt as number | null | undefined) ?? null);
      deps.audit(me, 'rank_grant', u.handle, `${d!.id}${typeof expiresAt === 'number' ? ` do ${new Date(expiresAt).toISOString().slice(0, 10)}` : ''}`);
      sync(id);
      return adminUserRanks(id);
    }],
    ['DELETE', /^\/v1\/admin\/users\/([\w-]+)\/ranks\/([\w-]+)$/, (req, [id, rank]) => {
      const me = deps.admin(req);
      const u = userOr404(id);
      if (!store.revoke(id, rank)) fail(404, 'not_found');
      deps.audit(me, 'rank_revoke', u.handle, rank);
      sync(id);
      return adminUserRanks(id);
    }],
  ];

  return {
    store, routes, held, shown, wear, forMe, setOnly,
    /** The ids of a player's ranks, for the panel's list. */
    ids: (user: RankUser) => held(user).map((h) => h.id),
    /** GET /v1/ranks/<id>/logo.png for anyone; true when the request was this. */
    serveIcon: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => serveLogo(store.icons, req, res, url),
  };
}

export type Ranks = ReturnType<typeof createRanks>;
