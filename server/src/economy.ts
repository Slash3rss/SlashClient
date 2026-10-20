import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from './db.ts';
import { ITEMS, capeSetting, item, sellable, supporterLevel } from './cosmetics.ts';
import { supporterLevels } from './supporterItems.ts';

/**
 * The SlashClient currency, earned with achievements (achievements.ts pays each one once, when it
 * unlocks) and spent in the shop on cosmetics that are sold (cosmetics.ts items with a `price`).
 *
 * A balance per account and an append-only ledger of every change (what for, how much, the balance
 * after it). Every change goes through `Wallet.change` in one transaction: the ledger row and the
 * balance move together, the balance never goes below zero (a CHECK on the table besides the test
 * in the code), and an achievement is paid at most once (a unique index on its ledger rows). The
 * database is used synchronously by one process, so two purchases cannot interleave; the
 * transaction keeps a failure halfway from leaving half a change.
 */

/** The currency's names, in one place (a rename only changes these and the clients' texts). */
export const CURRENCY = {
  /** Polish forms: 1 Iskra, 2–4 Iskry (not 12–14), 5+ Iskier. */
  pl: ['Iskra', 'Iskry', 'Iskier'] as const,
  en: ['Spark', 'Sparks'] as const,
};

/** "1 Iskra", "3 Iskry", "12 Iskier"; English "1 Spark", "5 Sparks". */
export function sparksText(n: number, lang: 'pl' | 'en' = 'pl'): string {
  if (lang === 'en') return `${n} ${Math.abs(n) === 1 ? CURRENCY.en[0] : CURRENCY.en[1]}`;
  const a = Math.abs(n);
  const form = a === 1 ? 0 : a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14) ? 1 : 2;
  return `${n} ${CURRENCY.pl[form]}`;
}

/** Why the balance changed. */
export type Reason = 'achievement' | 'purchase' | 'admin';

export interface LedgerEntry { id: number; amount: number; reason: Reason; ref: string; note: string; by: string; balance: number; at: number }

/** Runs `fn` in a transaction, or in the one already open (an unlock pays inside its own). */
export function inTransaction<T>(sql: DatabaseSync, fn: () => T): T {
  if (sql.isTransaction) return fn();
  sql.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    sql.exec('COMMIT');
    return out;
  } catch (err) {
    sql.exec('ROLLBACK');
    throw err;
  }
}

/** Admin changes are kept within this (a typo of three zeros should not mint a fortune). */
export const MAX_ADMIN_CHANGE = 100_000;

export class Wallet {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    // tables of their own, added next to the others: an older database just gains them
    sql.exec(`
CREATE TABLE IF NOT EXISTS sparks_wallets (uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0), seen_id INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sparks_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, amount INTEGER NOT NULL,
  reason TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', by_uuid TEXT NOT NULL DEFAULT '', balance INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sparks_ledger_user ON sparks_ledger(uuid, id);
CREATE UNIQUE INDEX IF NOT EXISTS sparks_ledger_achievement ON sparks_ledger(uuid, ref) WHERE reason = 'achievement';
CREATE TABLE IF NOT EXISTS shop_prices (id TEXT PRIMARY KEY, price INTEGER CHECK (price IS NULL OR price > 0));
`);
  }

  balance(uuid: string): number {
    return (this.sql.prepare('SELECT balance FROM sparks_wallets WHERE uuid = ?').get(uuid) as { balance: number } | undefined)?.balance ?? 0;
  }

  /**
   * Adds `amount` (below zero takes) and writes it down. Undefined when it would take the balance
   * below zero, or when the achievement `ref` was paid already; otherwise the new balance.
   */
  change(uuid: string, amount: number, reason: Reason, ref = '', note = '', by = '', at = Date.now()): number | undefined {
    if (!Number.isSafeInteger(amount) || amount === 0) return undefined;
    return inTransaction(this.sql, () => {
      const next = this.balance(uuid) + amount;
      if (next < 0) return undefined;
      const added = this.sql.prepare(`INSERT ${reason === 'achievement' ? 'OR IGNORE ' : ''}INTO sparks_ledger (uuid, amount, reason, ref, note, by_uuid, balance, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuid, amount, reason, ref, note.slice(0, 200), by, next, at).changes > 0;
      if (!added) return undefined;
      this.sql.prepare('INSERT INTO sparks_wallets (uuid, balance) VALUES (?, ?) ON CONFLICT (uuid) DO UPDATE SET balance = excluded.balance').run(uuid, next);
      return next;
    });
  }

  /** Whether an achievement was paid already. */
  paid(uuid: string, achievement: string): boolean {
    return !!this.sql.prepare("SELECT 1 FROM sparks_ledger WHERE uuid = ? AND reason = 'achievement' AND ref = ?").get(uuid, achievement);
  }

  ledger(uuid: string, limit = 100): LedgerEntry[] {
    return this.sql.prepare('SELECT id, amount, reason, ref, note, by_uuid AS by, balance, at FROM sparks_ledger WHERE uuid = ? ORDER BY id DESC LIMIT ?').all(uuid, limit) as unknown as LedgerEntry[];
  }

  /** Achievements paid since the player last looked (the launcher shows them once, as one notice). */
  unseen(uuid: string): { count: number; amount: number } {
    const seen = (this.sql.prepare('SELECT seen_id FROM sparks_wallets WHERE uuid = ?').get(uuid) as { seen_id: number } | undefined)?.seen_id ?? 0;
    const row = this.sql.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM sparks_ledger WHERE uuid = ? AND reason = 'achievement' AND id > ?").get(uuid, seen) as { count: number; amount: number };
    return { count: row.count, amount: row.amount };
  }

  markSeen(uuid: string) {
    const last = (this.sql.prepare('SELECT MAX(id) AS id FROM sparks_ledger WHERE uuid = ?').get(uuid) as { id: number | null }).id ?? 0;
    this.sql.prepare('INSERT INTO sparks_wallets (uuid, seen_id) VALUES (?, ?) ON CONFLICT (uuid) DO UPDATE SET seen_id = MAX(seen_id, excluded.seen_id)').run(uuid, last);
  }

  /** Items bought and sparks spent, for the achievements about the shop. */
  purchases(uuid: string): { count: number; spent: number } {
    const row = this.sql.prepare("SELECT COUNT(*) AS count, COALESCE(-SUM(amount), 0) AS spent FROM sparks_ledger WHERE uuid = ? AND reason = 'purchase'").get(uuid) as { count: number; spent: number };
    return row;
  }

  /**
   * What an item costs now: the admin's price (null there: taken off sale), or the one in
   * cosmetics.ts; undefined when it is not sold (the same as cosmetics.ts `priceOf`).
   */
  price(id: string): number | undefined {
    const it = item(id);
    // the supporters' items are never sold (also those the admin made so: supporterItems.ts)
    if (!it || !sellable(it, supporterLevels(this.sql).get(id) ?? it.supporter ?? 0)) return undefined;
    const row = this.sql.prepare('SELECT price FROM shop_prices WHERE id = ?').get(id) as { price: number | null } | undefined;
    return row ? row.price ?? undefined : it.price;
  }

  /** The admin's price: a number, null = not sold, undefined = back to cosmetics.ts. */
  setPrice(id: string, price: number | null | undefined) {
    if (price === undefined) this.sql.prepare('DELETE FROM shop_prices WHERE id = ?').run(id);
    else this.sql.prepare('INSERT INTO shop_prices (id, price) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET price = excluded.price').run(id, price);
  }

  /** The items sold now. */
  shopItems() {
    return ITEMS.filter((i) => this.price(i.id) !== undefined);
  }

  /** How many accounts bought each item. */
  sold(): Record<string, number> {
    const rows = this.sql.prepare("SELECT ref, COUNT(*) AS n FROM sparks_ledger WHERE reason = 'purchase' GROUP BY ref").all() as { ref: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.ref, r.n]));
  }
}

interface Deps {
  db: Db;
  wallet: Wallet;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  push: (userId: string, event: unknown) => void;
  /** What a ledger row was for, in both languages (an achievement's or an item's name). */
  label: (reason: Reason, ref: string) => { label: string; labelEn: string };
  /** After a purchase: the achievements about the shop. */
  bought: (userId: string) => void;
  /** An item went on sale: who wears it now keeps it (a grant), so nothing is taken from them. */
  keepWorn: (id: string) => number;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function economyRoutes(deps: Deps): [string, RegExp, Handler][] {
  const { db, wallet, fail } = deps;
  const entries = (uuid: string, limit: number) => wallet.ledger(uuid, limit).map((e) => {
    const by = e.by ? db.user(e.by)?.handle ?? '' : '';
    return { id: e.id, amount: e.amount, reason: e.reason, ref: e.ref, ...deps.label(e.reason, e.ref), note: e.note, balance: e.balance, at: e.at, ...(by ? { by } : {}) };
  });
  const userOr404 = (id: string) => db.user(id) ?? fail(404, 'not_found');

  return [
    // the player's balance, what changed it, and the payouts not seen yet (one notice for many)
    ['GET', /^\/v1\/wallet$/, (req, _p, url) => {
      const me = deps.authed(req);
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));
      return { balance: wallet.balance(me), ledger: entries(me, limit), unseen: wallet.unseen(me) };
    }],
    ['POST', /^\/v1\/wallet\/seen$/, (req) => {
      wallet.markSeen(deps.authed(req));
      return { ok: true };
    }],
    // buying an item: the price comes off and the item is the player's (a grant, like an achievement's)
    ['POST', /^\/v1\/shop\/(\w{1,64})\/buy$/, (req, [id]) => {
      const me = deps.authed(req);
      const it = item(id);
      if (!it) fail(404, 'not_found');
      const price = wallet.price(id);
      // sold only while it is on: achievement and rank items are never for sale
      if (!price || !capeSetting(db.cosmeticSettings(), id).enabled) fail(400, 'not_for_sale');
      if (db.grants(me).includes(id)) fail(409, 'owned');
      // all of it at once: the check, the payment and the grant (see the top of this file)
      inTransaction(db.sql, () => {
        if (wallet.change(me, -price!, 'purchase', id) === undefined) fail(402, 'not_enough_sparks');
        db.grant(me, id);
      });
      // the shop's own achievements pay at once; the answer has the balance after them
      deps.bought(me);
      const after = wallet.balance(me);
      deps.push(me, { type: 'wallet', balance: after, change: -price!, reason: 'purchase', ref: id });
      return { balance: after, item: { id: it!.id, slot: it!.slot, name: it!.name } };
    }],

    // -- the admin panel --
    ['GET', /^\/v1\/admin\/users\/([\w-]+)\/wallet$/, (req, [id]) => {
      deps.admin(req);
      userOr404(id);
      return { balance: wallet.balance(id), ledger: entries(id, 200) };
    }],
    // giving (amount > 0) or taking (< 0) sparks, always with a reason; both go to the admin log
    ['POST', /^\/v1\/admin\/users\/([\w-]+)\/wallet$/, async (req, [id]) => {
      const me = deps.admin(req);
      const user = userOr404(id);
      const { amount, reason } = await deps.body(req);
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADMIN_CHANGE) fail(400, 'bad_amount');
      const note = typeof reason === 'string' ? reason.trim().replace(/[\u0000-\u001f]/g, ' ') : '';
      if (note.length < 3 || note.length > 200) fail(400, 'bad_reason');
      const balance = wallet.change(id, amount as number, 'admin', '', note, me);
      if (balance === undefined) fail(400, 'not_enough_sparks');
      db.log(me, (amount as number) > 0 ? 'sparks_give' : 'sparks_take', user.handle, `${(amount as number) > 0 ? '+' : ''}${amount}: ${note}`);
      deps.push(id, { type: 'wallet', balance, change: amount, reason: 'admin', ref: '' });
      return { balance, ledger: entries(id, 200) };
    }],
    ['GET', /^\/v1\/admin\/shop$/, (req) => {
      deps.admin(req);
      const sold = wallet.sold();
      return { items: wallet.shopItems().map((i) => ({ id: i.id, slot: i.slot, name: i.name, price: wallet.price(i.id), defaultPrice: i.price ?? null, sold: sold[i.id] ?? 0 })) };
    }],
    // the price: a number (also puts an item on sale), null = off sale, `reset` = back to cosmetics.ts
    ['POST', /^\/v1\/admin\/shop\/(\w{1,64})$/, async (req, [id]) => {
      const me = deps.admin(req);
      const it = item(id);
      if (!it) fail(404, 'not_found');
      // a rank's item and one only an achievement gives are never sold
      if (!sellable(it!, supporterLevel(db.cosmeticSettings(), it!))) fail(400, 'not_sellable');
      const { price, reset } = await deps.body(req);
      if (reset !== true && price !== null && (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 1 || price > MAX_ADMIN_CHANGE)) fail(400, 'bad_price');
      const before = wallet.price(id);
      wallet.setPrice(id, reset === true ? undefined : price as number | null);
      const now = wallet.price(id);
      // put on sale: who wears it already keeps it
      const kept = before === undefined && now !== undefined ? deps.keepWorn(id) : 0;
      db.log(me, 'shop_price', id, now === undefined ? 'poza sklepem' : `${now}${reset === true ? ' (domyślna)' : ''}${kept ? `, zachowało ${kept}` : ''}`);
      return { id, price: now ?? null, defaultPrice: it!.price ?? null, kept };
    }],
  ];
}
