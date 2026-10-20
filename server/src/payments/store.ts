import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { inTransaction } from '../economy.ts';

/**
 * Everything about supporting the project in one place of the database: the tiers the admin set
 * up, the payment providers' settings (their keys sealed, see providers.ts), each payment and the
 * provider events already handled (so a repeated webhook does nothing twice), what each payment
 * gave (grants with a start, an end and who or what gave them), subscriptions and the players'
 * own choices (the supporters wall, the profile badge).
 *
 * Tables of their own, made here if missing: older databases get them on the first start.
 */

export type Currency = 'PLN' | 'EUR';
export const CURRENCIES: Currency[] = ['PLN', 'EUR'];
export type Kind = 'one_time' | 'monthly';
export type PaymentStatus = 'pending' | 'paid' | 'subscribed' | 'failed' | 'expired' | 'refunded' | 'disputed' | 'mismatch';

export interface Tier {
  id: string;
  /** Higher is more; supporter-only cosmetics ask for a level (cosmetics.ts `supporter`). */
  level: number;
  name: string;
  nameEn: string;
  /** The colour of the badge, the avatar frame and the logo in game ('#rrggbb'). */
  color: string;
  perks: string;
  perksEn: string;
  /** One-time support: the price in minor units (grosze, cents) for `days` days; 0 = not offered. */
  oneTimePln: number;
  oneTimeEur: number;
  days: number;
  /** Monthly support (a subscription): the price per month; 0 = not offered. */
  monthlyPln: number;
  monthlyEur: number;
  /** The cloud profiles' and shared screenshots' limits are this many times larger (1 = as for everyone). */
  limitFactor: number;
  /** Which perks this tier gives. */
  cosmetics: boolean;
  profile: boolean;
  earlyAccess: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Payment {
  id: string;
  provider: string;
  /** The provider's id of it: the Checkout Session, the PayPal order, the invoice of a month. */
  ref: string;
  user: string;
  tier: string;
  kind: Kind;
  quantity: number;
  days: number;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  mode: 'test' | 'live';
  /** The provider's charge-side id (Stripe PaymentIntent, PayPal capture), for refunds. */
  intent: string;
  customer: string;
  subscription: string;
  createdAt: number;
  paidAt: number;
  refundedAt: number;
  note: string;
}

export interface Grant {
  id: number;
  user: string;
  tier: string;
  source: 'payment' | 'subscription' | 'admin';
  /** The payment's id (one-time), the subscription's id, or '' for an admin's grant. */
  ref: string;
  startsAt: number;
  /** null: for good (an admin's lifetime grant). */
  expiresAt: number | null;
  revokedAt: number;
  revokedReason: string;
  note: string;
  by: string;
  createdAt: number;
}

export interface Subscription {
  id: string;
  provider: string;
  user: string;
  tier: string;
  status: string;
  amount: number;
  currency: Currency;
  periodEnd: number;
  cancelAtPeriodEnd: boolean;
  customer: string;
  payment: string;
  mode: 'test' | 'live';
  createdAt: number;
  updatedAt: number;
}

/** The tiers a fresh server starts with; the admin changes them in the panel. */
export const DEFAULT_TIERS: Omit<Tier, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'supporter', level: 1, name: 'Wspierający', nameEn: 'Supporter', color: '#f472b6',
    perks: 'Ranga „Wspierający” przy nicku w grze, w launcherze i na profilu\nPeleryna „Serce SlashClient”\nRamka avatara i odznaka „Wspiera od …” na profilu\n2× więcej miejsca na profile w chmurze i zrzuty ekranu',
    perksEn: 'The “Supporter” rank next to your name in game, in the launcher and on your profile\nThe “SlashClient Heart” cape\nAn avatar frame and a “Supporting since …” badge on your profile\n2× more room for cloud profiles and screenshots',
    oneTimePln: 1500, oneTimeEur: 0, days: 30, monthlyPln: 1200, monthlyEur: 0, limitFactor: 2, cosmetics: true, profile: true, earlyAccess: false, enabled: true,
  },
  {
    id: 'supporter_plus', level: 2, name: 'Wspierający+', nameEn: 'Supporter+', color: '#a78bfa',
    perks: 'Wszystko z „Wspierający”\nElytra „Skrzydła mecenasa”\nWcześniejszy dostęp do nowych wersji (testy)\n3× więcej miejsca na profile w chmurze i zrzuty ekranu',
    perksEn: 'Everything from “Supporter”\nThe “Patron’s wings” elytra\nEarly access to new versions (testing)\n3× more room for cloud profiles and screenshots',
    oneTimePln: 3000, oneTimeEur: 0, days: 30, monthlyPln: 2500, monthlyEur: 0, limitFactor: 3, cosmetics: true, profile: true, earlyAccess: true, enabled: true,
  },
  {
    id: 'patron', level: 3, name: 'Mecenas', nameEn: 'Patron', color: '#fbbf24',
    perks: 'Wszystko z „Wspierający+”\nZłota peleryna „Mecenas”\nZłota ramka avatara\n4× więcej miejsca na profile w chmurze i zrzuty ekranu',
    perksEn: 'Everything from “Supporter+”\nThe golden “Patron” cape\nA golden avatar frame\n4× more room for cloud profiles and screenshots',
    oneTimePln: 6000, oneTimeEur: 0, days: 30, monthlyPln: 5000, monthlyEur: 0, limitFactor: 4, cosmetics: true, profile: true, earlyAccess: true, enabled: true,
  },
];

const TIER_COLS = `id, level, name, name_en AS nameEn, color, perks, perks_en AS perksEn, one_time_pln AS oneTimePln, one_time_eur AS oneTimeEur, days,
  monthly_pln AS monthlyPln, monthly_eur AS monthlyEur, limit_factor AS limitFactor, cosmetics, profile, early_access AS earlyAccess, enabled, created_at AS createdAt, updated_at AS updatedAt`;
const PAYMENT_COLS = `id, provider, ref, user, tier, kind, quantity, days, amount, currency, status, mode, intent, customer, subscription,
  created_at AS createdAt, paid_at AS paidAt, refunded_at AS refundedAt, note`;
const GRANT_COLS = `id, user, tier, source, ref, starts_at AS startsAt, expires_at AS expiresAt, revoked_at AS revokedAt, revoked_reason AS revokedReason, note, granted_by AS "by", created_at AS createdAt`;
const SUB_COLS = `id, provider, user, tier, status, amount, currency, period_end AS periodEnd, cancel_at_period_end AS cancelAtPeriodEnd, customer, payment, mode,
  created_at AS createdAt, updated_at AS updatedAt`;

const bool = <T,>(row: T, keys: (keyof T)[]): T => {
  for (const k of keys) (row as Record<keyof T, unknown>)[k] = !!row[k];
  return row;
};

export class SupportStore {
  readonly sql: DatabaseSync;
  private readonly now: () => number;

  constructor(sql: DatabaseSync, now: () => number) {
    this.sql = sql;
    this.now = now;
    sql.exec(`
CREATE TABLE IF NOT EXISTS support_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS support_providers (
  id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT 'test', settings TEXT NOT NULL DEFAULT '{}',
  secrets TEXT NOT NULL DEFAULT '{}', hints TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS support_tiers (
  id TEXT PRIMARY KEY, level INTEGER NOT NULL, name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', color TEXT NOT NULL, perks TEXT NOT NULL DEFAULT '',
  perks_en TEXT NOT NULL DEFAULT '', one_time_pln INTEGER NOT NULL DEFAULT 0, one_time_eur INTEGER NOT NULL DEFAULT 0, days INTEGER NOT NULL DEFAULT 30,
  monthly_pln INTEGER NOT NULL DEFAULT 0, monthly_eur INTEGER NOT NULL DEFAULT 0, limit_factor REAL NOT NULL DEFAULT 1, cosmetics INTEGER NOT NULL DEFAULT 1,
  profile INTEGER NOT NULL DEFAULT 1, early_access INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS support_payments (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', user TEXT NOT NULL, tier TEXT NOT NULL, kind TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1, days INTEGER NOT NULL DEFAULT 0, amount INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL,
  mode TEXT NOT NULL, intent TEXT NOT NULL DEFAULT '', customer TEXT NOT NULL DEFAULT '', subscription TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, paid_at INTEGER NOT NULL DEFAULT 0, refunded_at INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', consent_at INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS support_payments_ref ON support_payments (provider, ref) WHERE ref != '';
CREATE INDEX IF NOT EXISTS support_payments_user ON support_payments (user, created_at);
CREATE INDEX IF NOT EXISTS support_payments_intent ON support_payments (provider, intent) WHERE intent != '';
CREATE TABLE IF NOT EXISTS support_events (provider TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (provider, id));
CREATE TABLE IF NOT EXISTS support_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, tier TEXT NOT NULL, source TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL, expires_at INTEGER, revoked_at INTEGER NOT NULL DEFAULT 0, revoked_reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '', granted_by TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS support_grants_user ON support_grants (user);
CREATE INDEX IF NOT EXISTS support_grants_ref ON support_grants (source, ref);
CREATE TABLE IF NOT EXISTS support_subscriptions (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, user TEXT NOT NULL, tier TEXT NOT NULL, status TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL,
  period_end INTEGER NOT NULL DEFAULT 0, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, customer TEXT NOT NULL DEFAULT '', payment TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS support_customers (user TEXT NOT NULL, provider TEXT NOT NULL, mode TEXT NOT NULL, customer TEXT NOT NULL, PRIMARY KEY (user, provider, mode));
CREATE TABLE IF NOT EXISTS support_prefs (user TEXT PRIMARY KEY, wall INTEGER NOT NULL DEFAULT 0, profile INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);`);
    // the default tiers, once: a server that removed them keeps them removed
    if (!this.config('tiers_seeded')) {
      for (const t of DEFAULT_TIERS) if (!this.tier(t.id)) this.saveTier({ ...t, createdAt: now(), updatedAt: now() });
      this.setConfig('tiers_seeded', '1');
    }
  }

  transaction<T>(fn: () => T): T {
    return inTransaction(this.sql, fn);
  }

  // ---- settings ----

  config(key: string): string | undefined {
    return (this.sql.prepare('SELECT value FROM support_config WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  }

  setConfig(key: string, value: string) {
    this.sql.prepare('INSERT INTO support_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  // ---- tiers ----

  tiers(): Tier[] {
    return (this.sql.prepare(`SELECT ${TIER_COLS} FROM support_tiers ORDER BY level, id`).all() as unknown as Tier[]).map((t) => bool(t, ['cosmetics', 'profile', 'earlyAccess', 'enabled']));
  }

  tier(id: string): Tier | undefined {
    const t = this.sql.prepare(`SELECT ${TIER_COLS} FROM support_tiers WHERE id = ?`).get(id) as unknown as Tier | undefined;
    return t && bool(t, ['cosmetics', 'profile', 'earlyAccess', 'enabled']);
  }

  saveTier(t: Tier) {
    this.sql.prepare(`INSERT INTO support_tiers (id, level, name, name_en, color, perks, perks_en, one_time_pln, one_time_eur, days, monthly_pln, monthly_eur, limit_factor,
      cosmetics, profile, early_access, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET level = excluded.level, name = excluded.name, name_en = excluded.name_en, color = excluded.color, perks = excluded.perks,
      perks_en = excluded.perks_en, one_time_pln = excluded.one_time_pln, one_time_eur = excluded.one_time_eur, days = excluded.days, monthly_pln = excluded.monthly_pln,
      monthly_eur = excluded.monthly_eur, limit_factor = excluded.limit_factor, cosmetics = excluded.cosmetics, profile = excluded.profile,
      early_access = excluded.early_access, enabled = excluded.enabled, updated_at = excluded.updated_at`)
      .run(t.id, t.level, t.name, t.nameEn, t.color, t.perks, t.perksEn, t.oneTimePln, t.oneTimeEur, t.days, t.monthlyPln, t.monthlyEur, t.limitFactor,
        t.cosmetics ? 1 : 0, t.profile ? 1 : 0, t.earlyAccess ? 1 : 0, t.enabled ? 1 : 0, t.createdAt, t.updatedAt);
  }

  removeTier(id: string) {
    this.sql.prepare('DELETE FROM support_tiers WHERE id = ?').run(id);
  }

  tierInUse(id: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM support_grants WHERE tier = ? UNION SELECT 1 FROM support_payments WHERE tier = ? LIMIT 1').get(id, id);
  }

  // ---- providers ----

  providerRow(id: string): { enabled: boolean; mode: 'test' | 'live'; settings: Record<string, unknown>; secrets: Record<string, string>; hints: Record<string, string>; updatedAt: number } {
    const r = this.sql.prepare('SELECT enabled, mode, settings, secrets, hints, updated_at AS updatedAt FROM support_providers WHERE id = ?').get(id) as
      { enabled: number; mode: string; settings: string; secrets: string; hints: string; updatedAt: number } | undefined;
    const parse = (s: string | undefined) => {
      try {
        const v = JSON.parse(s ?? '{}');
        return v && typeof v === 'object' ? v : {};
      } catch {
        return {};
      }
    };
    return { enabled: !!r?.enabled, mode: r?.mode === 'live' ? 'live' : 'test', settings: parse(r?.settings), secrets: parse(r?.secrets), hints: parse(r?.hints), updatedAt: r?.updatedAt ?? 0 };
  }

  saveProvider(id: string, p: { enabled: boolean; mode: 'test' | 'live'; settings: Record<string, unknown>; secrets: Record<string, string>; hints: Record<string, string> }) {
    this.sql.prepare(`INSERT INTO support_providers (id, enabled, mode, settings, secrets, hints, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled, mode = excluded.mode, settings = excluded.settings, secrets = excluded.secrets, hints = excluded.hints, updated_at = excluded.updated_at`)
      .run(id, p.enabled ? 1 : 0, p.mode, JSON.stringify(p.settings), JSON.stringify(p.secrets), JSON.stringify(p.hints), this.now());
  }

  // ---- events: each provider event is handled once ----

  /** Notes the event as handled; false when it was already (a repeated webhook). */
  claimEvent(provider: string, id: string, type: string): boolean {
    return this.sql.prepare('INSERT OR IGNORE INTO support_events (provider, id, type, at) VALUES (?, ?, ?, ?)').run(provider, id, type, this.now()).changes > 0;
  }

  // ---- payments ----

  newPayment(p: Omit<Payment, 'id' | 'createdAt' | 'paidAt' | 'refundedAt' | 'note' | 'intent' | 'subscription' | 'status'> & { status?: PaymentStatus; consentAt?: number }): Payment {
    const id = `p_${randomBytes(9).toString('base64url')}`;
    this.sql.prepare(`INSERT INTO support_payments (id, provider, ref, user, tier, kind, quantity, days, amount, currency, status, mode, customer, created_at, consent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, p.provider, p.ref, p.user, p.tier, p.kind, p.quantity, p.days, p.amount, p.currency, p.status ?? 'pending', p.mode, p.customer, this.now(), p.consentAt ?? 0);
    return this.payment(id)!;
  }

  payment(id: string): Payment | undefined {
    return this.sql.prepare(`SELECT ${PAYMENT_COLS} FROM support_payments WHERE id = ?`).get(id) as unknown as Payment | undefined;
  }

  paymentByRef(provider: string, ref: string): Payment | undefined {
    if (!ref) return undefined;
    return this.sql.prepare(`SELECT ${PAYMENT_COLS} FROM support_payments WHERE provider = ? AND ref = ?`).get(provider, ref) as unknown as Payment | undefined;
  }

  paymentByIntent(provider: string, intent: string): Payment | undefined {
    if (!intent) return undefined;
    return this.sql.prepare(`SELECT ${PAYMENT_COLS} FROM support_payments WHERE provider = ? AND intent = ?`).get(provider, intent) as unknown as Payment | undefined;
  }

  updatePayment(id: string, change: Partial<Pick<Payment, 'ref' | 'status' | 'intent' | 'customer' | 'subscription' | 'paidAt' | 'refundedAt' | 'note'>>) {
    const cols: Record<string, string> = { ref: 'ref', status: 'status', intent: 'intent', customer: 'customer', subscription: 'subscription', paidAt: 'paid_at', refundedAt: 'refunded_at', note: 'note' };
    const keys = Object.keys(change).filter((k) => k in cols);
    if (!keys.length) return;
    this.sql.prepare(`UPDATE support_payments SET ${keys.map((k) => `${cols[k]} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => (change as Record<string, string | number>)[k]), id);
  }

  paymentsOf(user: string, limit = 100): Payment[] {
    return this.sql.prepare(`SELECT ${PAYMENT_COLS} FROM support_payments WHERE user = ? ORDER BY created_at DESC LIMIT ?`).all(user, limit) as unknown as Payment[];
  }

  payments(o: { status?: string; user?: string; limit: number; offset: number }): { payments: Payment[]; total: number } {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (o.status) {
      where.push('status = ?');
      args.push(o.status);
    }
    if (o.user) {
      where.push('user = ?');
      args.push(o.user);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (this.sql.prepare(`SELECT COUNT(*) AS n FROM support_payments ${w}`).get(...args) as { n: number }).n;
    const payments = this.sql.prepare(`SELECT ${PAYMENT_COLS} FROM support_payments ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, o.limit, o.offset) as unknown as Payment[];
    return { payments, total };
  }

  /** Money that came in (and went back) per month, live payments only. */
  revenue(): { month: string; currency: string; paid: number; refunded: number; count: number }[] {
    return this.sql.prepare(`SELECT strftime('%Y-%m', paid_at / 1000, 'unixepoch') AS month, currency,
      SUM(amount) AS paid, SUM(CASE WHEN status IN ('refunded', 'disputed') THEN amount ELSE 0 END) AS refunded, COUNT(*) AS count
      FROM support_payments WHERE mode = 'live' AND paid_at > 0 GROUP BY month, currency ORDER BY month DESC LIMIT 36`).all() as { month: string; currency: string; paid: number; refunded: number; count: number }[];
  }

  // ---- customers (Stripe), for subscriptions and the customer portal ----

  customer(user: string, provider: string, mode: string): string {
    return (this.sql.prepare('SELECT customer FROM support_customers WHERE user = ? AND provider = ? AND mode = ?').get(user, provider, mode) as { customer: string } | undefined)?.customer ?? '';
  }

  setCustomer(user: string, provider: string, mode: string, customer: string) {
    this.sql.prepare('INSERT INTO support_customers (user, provider, mode, customer) VALUES (?, ?, ?, ?) ON CONFLICT (user, provider, mode) DO UPDATE SET customer = excluded.customer')
      .run(user, provider, mode, customer);
  }

  // ---- grants ----

  addGrant(g: Omit<Grant, 'id' | 'createdAt' | 'revokedAt' | 'revokedReason'>): Grant {
    const r = this.sql.prepare(`INSERT INTO support_grants (user, tier, source, ref, starts_at, expires_at, note, granted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(g.user, g.tier, g.source, g.ref, g.startsAt, g.expiresAt, g.note, g.by, this.now());
    return this.grant(Number(r.lastInsertRowid))!;
  }

  grant(id: number): Grant | undefined {
    return this.sql.prepare(`SELECT ${GRANT_COLS} FROM support_grants WHERE id = ?`).get(id) as unknown as Grant | undefined;
  }

  grantsOf(user: string): Grant[] {
    return this.sql.prepare(`SELECT ${GRANT_COLS} FROM support_grants WHERE user = ? ORDER BY starts_at DESC, id DESC`).all(user) as unknown as Grant[];
  }

  grantsByRef(source: string, ref: string): Grant[] {
    return this.sql.prepare(`SELECT ${GRANT_COLS} FROM support_grants WHERE source = ? AND ref = ?`).all(source, ref) as unknown as Grant[];
  }

  setGrantExpiry(id: number, expiresAt: number | null) {
    this.sql.prepare('UPDATE support_grants SET expires_at = ? WHERE id = ?').run(expiresAt, id);
  }

  revokeGrant(id: number, reason: string) {
    this.sql.prepare('UPDATE support_grants SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at = 0').run(this.now(), reason, id);
  }

  /** Accounts with any grant, newest first (the admin's list of supporters). */
  grantedUsers(limit: number): string[] {
    return (this.sql.prepare('SELECT user, MAX(created_at) AS last FROM support_grants GROUP BY user ORDER BY last DESC LIMIT ?').all(limit) as { user: string }[]).map((r) => r.user);
  }

  // ---- subscriptions ----

  subscription(id: string): Subscription | undefined {
    const s = this.sql.prepare(`SELECT ${SUB_COLS} FROM support_subscriptions WHERE id = ?`).get(id) as unknown as Subscription | undefined;
    return s && bool(s, ['cancelAtPeriodEnd']);
  }

  subscriptionsOf(user: string): Subscription[] {
    return (this.sql.prepare(`SELECT ${SUB_COLS} FROM support_subscriptions WHERE user = ? ORDER BY created_at DESC`).all(user) as unknown as Subscription[]).map((s) => bool(s, ['cancelAtPeriodEnd']));
  }

  saveSubscription(s: Subscription) {
    this.sql.prepare(`INSERT INTO support_subscriptions (id, provider, user, tier, status, amount, currency, period_end, cancel_at_period_end, customer, payment, mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET status = excluded.status, period_end = excluded.period_end, cancel_at_period_end = excluded.cancel_at_period_end,
      customer = excluded.customer, updated_at = excluded.updated_at`)
      .run(s.id, s.provider, s.user, s.tier, s.status, s.amount, s.currency, s.periodEnd, s.cancelAtPeriodEnd ? 1 : 0, s.customer, s.payment, s.mode, s.createdAt, s.updatedAt);
  }

  // ---- the player's own choices ----

  prefs(user: string): { wall: boolean; profile: boolean } {
    const r = this.sql.prepare('SELECT wall, profile FROM support_prefs WHERE user = ?').get(user) as { wall: number; profile: number } | undefined;
    return { wall: !!r?.wall, profile: r ? !!r.profile : true };
  }

  setPrefs(user: string, p: { wall: boolean; profile: boolean }) {
    this.sql.prepare('INSERT INTO support_prefs (user, wall, profile, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user) DO UPDATE SET wall = excluded.wall, profile = excluded.profile, updated_at = excluded.updated_at')
      .run(user, p.wall ? 1 : 0, p.profile ? 1 : 0, this.now());
  }

  /** Who chose to be on the supporters wall. */
  wallUsers(): string[] {
    return (this.sql.prepare('SELECT user FROM support_prefs WHERE wall = 1').all() as { user: string }[]).map((r) => r.user);
  }
}
