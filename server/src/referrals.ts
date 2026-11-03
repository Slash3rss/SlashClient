import { createHash, randomInt } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { DAY_MIN_SECONDS, type Achievement } from './achievements.ts';
import { item } from './cosmetics.ts';
import { inTransaction, sparksText, type Wallet } from './economy.ts';
import { escapeHtml } from './releaseNotes.ts';
import type { SettingDef, SettingValue } from './settings.ts';
import { siteFooter, siteNav } from './siteFooter.ts';
import { disabledPage, sitePage, siteLang, type SiteLang } from './sitePages.ts';

/**
 * "Zaproś znajomych" (server 0.9.69+): every account has its own invite code (made the first time it
 * is asked for, the same for good) and a link to a page of the site, /z/<code>, that tells a friend
 * what they get and where to download SlashClient. A new player types one code into the launcher,
 * once, within a few days of making the account; never their own, never the code of someone they
 * invited (or someone that one invited, and so on). Typing it in is final.
 *
 * The invite only counts (and pays both: the inviter and the friend, sparks once each) when the
 * friend's account has a Minecraft account linked that never counted for an invite before (one
 * Minecraft account counts once, ever, also after it is linked to another SlashClient account) and
 * has played long enough on enough different days, measured as the achievements measure play time
 * (achievements.ts: a launcher connected, the game in a world). So a second account of one's own
 * made only for the sparks is not worth it. At most so many invites of one player count a month;
 * the rest wait for the next month. The admin may reject an invite that was cheated (see `reject`).
 *
 * Pending invites are looked at every few minutes (`tick`) and whenever either player opens the
 * invites (GET /v1/referrals). Everything here is in the admin panel's settings ("Zaproszenia").
 *
 * The page /z/<code> remembers for a day which address opened which code (in memory only, never
 * in the database): a player who then signs in from the same address and may still type a code is
 * offered that one (`suggested`), so they do not have to copy it.
 */

export type ReferralStatus = 'pending' | 'counted' | 'rejected';

/** Letters and digits nobody mixes up (no I, L, O, 0, 1): read aloud or copied from a phone without mistakes. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
/** What a code typed in may be (spaces and dashes are dropped, letters made upper case first). */
const CODE = /^[A-HJKMNP-Z2-9]{4,12}$/;
/** What a code typed in becomes before it is looked up ("ab12-cd" → "AB12CD"). */
export const normalizeCode = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[\s-]/g, '').slice(0, 32) : '');

/** How long the page's address → code is remembered, and how many addresses at most. */
const SUGGEST_MS = 24 * 3_600_000;
const SUGGEST_MAX = 5000;
/** How far up the chain of "who invited whom" a cycle is looked for. */
const CHAIN_MAX = 100;
const DAY_MS = 86_400_000;

const def = (key: string, label: string, labelEn: string, description: string, descriptionEn: string, more: Partial<SettingDef>): SettingDef =>
  ({ key, category: 'invites', label, labelEn, description, descriptionEn, type: 'int', default: 0, ...more });

/** The settings of the invites (the admin panel: "Zaproszenia", also on the invites' own page). */
export const REFERRAL_SETTING_DEFS: SettingDef[] = [
  def('referrals.enabled', 'Zaproszenia włączone', 'Invites on', 'Kody zaproszeń, strona /z/<kod> i nagrody za zaproszonych znajomych. Wyłączone: launcher chowa zaproszenia, kodów nie da się wpisać, oczekujące zaproszenia czekają.', 'Invite codes, the /z/<code> page and the rewards for friends invited. Off: the launcher hides the invites, codes cannot be typed in, pending invites wait.', { type: 'bool', default: true }),
  def('referrals.redeemDays', 'Czas na wpisanie kodu', 'Time to type in a code', 'Ile dni od założenia konta nowy gracz może wpisać kod znajomego.', 'How many days after making the account a new player may type in a friend\'s code.', { type: 'duration', default: 7, min: 1, max: 365, unit: 'dni' }),
  def('referrals.hoursGoal', 'Godziny gry zaproszonego', 'Hours the friend plays', 'Ile godzin musi zagrać zaproszony (liczone jak w osiągnięciach), żeby zaproszenie się liczyło.', 'How many hours the friend must play (counted as for achievements) for the invite to count.', { type: 'float', default: 3, min: 0, max: 1000, unit: 'h' }),
  def('referrals.daysGoal', 'Dni gry zaproszonego', 'Days the friend plays', 'W ilu różnych dniach zaproszony musi grać co najmniej 10 minut.', 'On how many different days the friend must play at least 10 minutes.', { default: 2, min: 1, max: 365, unit: 'dni' }),
  def('referrals.inviterSparks', 'Iskry dla zapraszającego', 'Sparks for the inviter', 'Wypłacane raz za każde policzone zaproszenie.', 'Paid once for every invite that counts.', { default: 100, min: 0, max: 10_000 }),
  def('referrals.inviteeSparks', 'Iskry dla zaproszonego', 'Sparks for the friend', 'Wypłacane raz, gdy zaproszenie się policzy.', 'Paid once, when the invite counts.', { default: 50, min: 0, max: 10_000 }),
  def('referrals.monthlyCap', 'Policzone zaproszenia na miesiąc', 'Invites counted a month', 'Najwięcej zaproszeń jednego gracza, które liczą się w miesiącu kalendarzowym (UTC); kolejne czekają do następnego miesiąca.', 'The most invites of one player that count in a calendar month (UTC); more wait for the next month.', { default: 20, min: 1, max: 1000 }),
  def('referrals.redeemsPerMinute', 'Próby wpisania kodu na minutę', 'Code attempts per minute', 'Na konto: wpisywanie kodu zaproszenia w launcherze (także nietrafione).', 'Per account: typing in an invite code in the launcher (wrong ones too).', { default: 6, min: 1, max: 1000, unit: '/min' }),
];

interface Row {
  invitee: string; inviter: string; code: string; at: number; status: ReferralStatus; counted_at: number | null;
  inviter_sparks: number; invitee_sparks: number; rejected_at: number | null; rejected_by: string; note: string;
}
interface Person { uuid: string; handle: string; name: string }

/** A Minecraft account as kept here: hashed, so the list of the ones that counted says nothing by itself. */
export const minecraftKey = (mc: string) => createHash('sha256').update(`slashclient-referral:${mc.toLowerCase().replace(/-/g, '')}`).digest('hex');

/** The first moment of the UTC month of `at`. */
const monthStart = (at: number) => {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

/** The tables and their queries. */
export class ReferralStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS referral_codes (uuid TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS referrals (invitee TEXT PRIMARY KEY REFERENCES users(uuid) ON DELETE CASCADE, inviter TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  code TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', counted_at INTEGER, inviter_sparks INTEGER NOT NULL DEFAULT 0, invitee_sparks INTEGER NOT NULL DEFAULT 0,
  minecraft TEXT NOT NULL DEFAULT '', rejected_at INTEGER, rejected_by TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS referrals_inviter ON referrals(inviter, at);
CREATE INDEX IF NOT EXISTS referrals_status ON referrals(status, at);
CREATE TABLE IF NOT EXISTS referral_minecraft (key TEXT PRIMARY KEY, invitee TEXT NOT NULL, at INTEGER NOT NULL);
`);
  }

  /** The player's code, made the first time (random, never one taken). */
  codeOf(uuid: string, now = Date.now()): string {
    const had = this.sql.prepare('SELECT code FROM referral_codes WHERE uuid = ?').get(uuid) as { code: string } | undefined;
    if (had) return had.code;
    for (let i = 0; i < 50; i++) {
      const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (this.sql.prepare('INSERT OR IGNORE INTO referral_codes (uuid, code, created_at) VALUES (?, ?, ?)').run(uuid, code, now).changes > 0) return code;
      // made meanwhile for this player (another request): that one
      const now2 = this.sql.prepare('SELECT code FROM referral_codes WHERE uuid = ?').get(uuid) as { code: string } | undefined;
      if (now2) return now2.code;
    }
    throw new Error('no free invite code');
  }

  /** Whose code it is (a banned account's code does not work). */
  owner(code: string): Person | undefined {
    if (!CODE.test(code)) return undefined;
    return this.sql.prepare('SELECT u.uuid, u.handle, u.name FROM referral_codes c JOIN users u ON u.uuid = c.uuid WHERE c.code = ? AND u.banned = 0').get(code) as Person | undefined;
  }

  person(uuid: string): Person | undefined {
    return this.sql.prepare('SELECT uuid, handle, name FROM users WHERE uuid = ?').get(uuid) as Person | undefined;
  }

  createdAt(uuid: string): number | undefined {
    return (this.sql.prepare('SELECT created_at FROM users WHERE uuid = ?').get(uuid) as { created_at: number } | undefined)?.created_at;
  }

  /** The code the player typed in, when they did. */
  redeemed(invitee: string): Row | undefined {
    return this.sql.prepare('SELECT * FROM referrals WHERE invitee = ?').get(invitee) as Row | undefined;
  }

  add(invitee: string, inviter: string, code: string, at: number): boolean {
    return this.sql.prepare('INSERT OR IGNORE INTO referrals (invitee, inviter, code, at) VALUES (?, ?, ?, ?)').run(invitee, inviter, code, at).changes > 0;
  }

  /** Whether `who` is up the chain of `from` (who invited `from`, who invited that one…). */
  above(from: string, who: string): boolean {
    let cur = from;
    for (let i = 0; i < CHAIN_MAX; i++) {
      const up = (this.sql.prepare('SELECT inviter FROM referrals WHERE invitee = ?').get(cur) as { inviter: string } | undefined)?.inviter;
      if (!up) return false;
      if (up === who) return true;
      cur = up;
    }
    return true;
  }

  invitedBy(inviter: string, limit = 200): Row[] {
    return this.sql.prepare('SELECT * FROM referrals WHERE inviter = ? ORDER BY at DESC LIMIT ?').all(inviter, limit) as unknown as Row[];
  }

  pending(limit = 5000): Row[] {
    return this.sql.prepare("SELECT * FROM referrals WHERE status = 'pending' ORDER BY at LIMIT ?").all(limit) as unknown as Row[];
  }

  countedBy(inviter: string, since = 0): number {
    return (this.sql.prepare("SELECT COUNT(*) AS n FROM referrals WHERE inviter = ? AND status = 'counted' AND counted_at >= ?").get(inviter, since) as { n: number }).n;
  }

  /** The friend's play (as the achievements count it) and whether they have a Minecraft account that may still count. */
  progress(invitee: string): { seconds: number; hours: number; days: number; minecraft: string | undefined } {
    const total = (this.sql.prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM play_days WHERE uuid = ?').get(invitee) as { s: number }).s;
    const days = (this.sql.prepare('SELECT COUNT(*) AS n FROM play_days WHERE uuid = ? AND seconds >= ?').get(invitee, DAY_MIN_SECONDS) as { n: number }).n;
    let minecraft: string | undefined;
    for (const r of this.sql.prepare("SELECT subject FROM identities WHERE uuid = ? AND provider = 'minecraft' ORDER BY rowid").all(invitee) as { subject: string }[]) {
      const key = minecraftKey(r.subject);
      const used = this.sql.prepare('SELECT invitee FROM referral_minecraft WHERE key = ?').get(key) as { invitee: string } | undefined;
      if (!used || used.invitee === invitee) {
        minecraft = key;
        break;
      }
    }
    return { seconds: total, hours: Math.floor(total / 360) / 10, days, minecraft };
  }

  /** Marks an invite counted (with what it pays) and its Minecraft account used; false when it was not pending or the account counted already. */
  markCounted(invitee: string, minecraft: string, inviterSparks: number, inviteeSparks: number, at: number): boolean {
    if (this.sql.prepare('INSERT OR IGNORE INTO referral_minecraft (key, invitee, at) VALUES (?, ?, ?)').run(minecraft, invitee, at).changes === 0) {
      const used = this.sql.prepare('SELECT invitee FROM referral_minecraft WHERE key = ?').get(minecraft) as { invitee: string };
      if (used.invitee !== invitee) return false;
    }
    return this.sql.prepare("UPDATE referrals SET status = 'counted', counted_at = ?, minecraft = ?, inviter_sparks = ?, invitee_sparks = ? WHERE invitee = ? AND status = 'pending'")
      .run(at, minecraft, inviterSparks, inviteeSparks, invitee).changes > 0;
  }

  markRejected(invitee: string, by: string, note: string, at: number): boolean {
    return this.sql.prepare("UPDATE referrals SET status = 'rejected', rejected_at = ?, rejected_by = ?, note = ? WHERE invitee = ? AND status != 'rejected'").run(at, by, note, invitee).changes > 0;
  }

  /** The admin panel's lists: who invited most, and the latest invites. */
  top(limit = 50): (Person & { counted: number; pending: number; rejected: number })[] {
    return this.sql.prepare(`SELECT u.uuid, u.handle, u.name, SUM(r.status = 'counted') AS counted, SUM(r.status = 'pending') AS pending, SUM(r.status = 'rejected') AS rejected
      FROM referrals r JOIN users u ON u.uuid = r.inviter GROUP BY r.inviter ORDER BY counted DESC, pending DESC, u.handle_lower LIMIT ?`).all(limit) as never;
  }

  recent(q: string, status: string, limit = 100): Row[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (status === 'pending' || status === 'counted' || status === 'rejected') {
      where.push('r.status = ?');
      args.push(status);
    }
    if (q) {
      where.push('(a.handle_lower LIKE ? OR b.handle_lower LIKE ? OR r.code = ?)');
      args.push(`%${q.toLowerCase().replace(/[%_]/g, '')}%`, `%${q.toLowerCase().replace(/[%_]/g, '')}%`, q.toUpperCase());
    }
    return this.sql.prepare(`SELECT r.* FROM referrals r JOIN users a ON a.uuid = r.inviter JOIN users b ON b.uuid = r.invitee
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.at DESC LIMIT ?`).all(...args, limit) as unknown as Row[];
  }

  totals(): { pending: number; counted: number; rejected: number; sparks: number } {
    const row = this.sql.prepare(`SELECT SUM(status = 'pending') AS pending, SUM(status = 'counted') AS counted, SUM(status = 'rejected') AS rejected FROM referrals`).get() as Record<string, number | null>;
    const sparks = (this.sql.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM sparks_ledger WHERE reason = 'referral'").get() as { n: number }).n;
    return { pending: row.pending ?? 0, counted: row.counted ?? 0, rejected: row.rejected ?? 0, sparks };
  }
}

interface Deps {
  sql: DatabaseSync;
  wallet: Wallet;
  publicUrl: string;
  setting: (key: string) => SettingValue;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  /** The visitor's address, as the rate limits key it. */
  clientIp: (req: http.IncomingMessage) => string;
  /** Sends an event to the account's connected launchers. */
  push: (userId: string, event: unknown) => void;
  fail: (status: number, code: string) => never;
  /** The achievements for invites as they are now (their goals and rewards, shown as the program's rewards). */
  milestones: () => Achievement[];
  /** After an invite counted: the achievements of both look again. */
  counted?: (inviter: string, invitee: string) => void;
  audit?: (who: string, action: string, target: string, detail: string) => void;
  /** Per account, for typing in codes; per address, for the page (each throws when over). */
  limitRedeem?: (key: string) => void;
  limitViews?: (key: string) => void;
  /** Pages the admin hid on the site (the header leaves their links out). */
  hidden?: (path: string) => boolean;
  /** Turns a page's links to the site's files into versioned ones (web.ts). */
  versioned?: (html: string) => string;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function createReferrals(deps: Deps) {
  const { sql, wallet } = deps;
  const store = new ReferralStore(sql);
  /** Address → the code its page showed last, and when (see the top of this file). */
  const seen = new Map<string, { code: string; at: number }>();

  const on = () => deps.setting('referrals.enabled') !== false;
  const num = (key: string) => Math.max(0, Number(deps.setting(key)) || 0);
  const windowMs = () => num('referrals.redeemDays') * DAY_MS;
  const goals = () => ({ hours: num('referrals.hoursGoal'), days: Math.max(1, num('referrals.daysGoal')) });

  /** Until when the player may type in a code (undefined: they did, or it is too late). */
  function redeemUntil(uuid: string, now: number): number | undefined {
    if (store.redeemed(uuid)) return undefined;
    const created = store.createdAt(uuid);
    if (created === undefined) return undefined;
    const until = created + windowMs();
    return now < until ? until : undefined;
  }

  /**
   * Counts an invite when it is pending and the friend got far enough (see the top of this file):
   * marks it, pays both once and tells them. False when it does not count (yet).
   */
  function tryCount(row: Row, now = Date.now()): boolean {
    if (row.status !== 'pending' || !on()) return false;
    const p = store.progress(row.invitee);
    const g = goals();
    if (!p.minecraft || p.seconds < g.hours * 3600 || p.days < g.days) return false;
    // a month's invites past the cap wait for the next month
    if (store.countedBy(row.inviter, monthStart(now)) >= Math.max(1, num('referrals.monthlyCap'))) return false;
    const inviterSparks = num('referrals.inviterSparks');
    const inviteeSparks = num('referrals.inviteeSparks');
    const inviter = store.person(row.inviter);
    const invitee = store.person(row.invitee);
    if (!inviter || !invitee) return false;
    const done = inTransaction(sql, () => {
      if (!store.markCounted(row.invitee, p.minecraft!, inviterSparks, inviteeSparks, now)) return false;
      // once each, ever (the ledger's unique refs): `in:` the inviter's for this friend, `by:` the friend's own
      if (inviterSparks > 0) wallet.change(row.inviter, inviterSparks, 'referral', `in:${row.invitee}`, `@${invitee.handle}`, '', now);
      if (inviteeSparks > 0) wallet.change(row.invitee, inviteeSparks, 'referral', `by:${row.invitee}`, `@${inviter.handle}`, '', now);
      return true;
    });
    if (!done) return false;
    const tell = (to: string, role: 'inviter' | 'invitee', friend: Person, sparks: number) => {
      deps.push(to, { type: 'referral', status: 'counted', role, friend: { handle: friend.handle, name: friend.name }, sparks });
      if (sparks > 0) deps.push(to, { type: 'wallet', balance: wallet.balance(to), change: sparks, reason: 'referral', ref: '' });
    };
    tell(row.inviter, 'inviter', invitee, inviterSparks);
    tell(row.invitee, 'invitee', inviter, inviteeSparks);
    try {
      deps.counted?.(row.inviter, row.invitee);
    } catch (err) {
      console.error('zaproszenia:', (err as Error).message);
    }
    return true;
  }

  /** Looks at the player's own invite (as the friend) and the invites they sent. */
  function check(uuid: string, now = Date.now()) {
    if (!on()) return 0;
    let n = 0;
    const mine = store.redeemed(uuid);
    if (mine && tryCount(mine, now)) n++;
    for (const r of store.invitedBy(uuid)) if (r.status === 'pending' && tryCount(r, now)) n++;
    return n;
  }

  /** Every few minutes: all pending invites. */
  function tick(now = Date.now()) {
    if (!on()) return 0;
    let n = 0;
    for (const r of store.pending()) if (tryCount(r, now)) n++;
    return n;
  }

  /** The page /z/<code> was opened from this address: offered to a player signing in from it (in memory, a day). */
  function remember(ip: string, code: string, now = Date.now()) {
    seen.delete(ip);
    if (seen.size >= SUGGEST_MAX) {
      for (const [k, v] of seen) if (now - v.at > SUGGEST_MS) seen.delete(k);
      if (seen.size >= SUGGEST_MAX) seen.delete(seen.keys().next().value!);
    }
    seen.set(ip, { code, at: now });
  }

  function suggestion(ip: string, me: string, now: number): { code: string; handle: string; name: string } | null {
    const s = seen.get(ip);
    if (!s || now - s.at > SUGGEST_MS) return null;
    const owner = store.owner(s.code);
    if (!owner || owner.uuid === me || store.above(owner.uuid, me)) return null;
    return { code: s.code, handle: owner.handle, name: owner.name };
  }

  /** The invites' rewards: the achievements for invites players can get (not the hidden ones), by goal. */
  function rewards(counted: number) {
    return deps.milestones().filter((a) => a.group === 'invites' && a.enabled !== false && !a.hidden).sort((a, b) => a.goal - b.goal).map((a) => {
      const it = a.reward ? item(a.reward) : undefined;
      return { count: a.goal, item: it?.id ?? null, itemName: it?.name ?? null, sparks: a.sparks, reached: counted >= a.goal };
    });
  }

  function view(me: string, ip: string, now = Date.now()) {
    if (!on()) return { enabled: false };
    check(me, now);
    const code = store.codeOf(me, now);
    const mine = store.redeemed(me);
    const by = mine ? store.person(mine.inviter) : undefined;
    const until = redeemUntil(me, now);
    const g = goals();
    const invited = store.invitedBy(me).map((r) => {
      const friend = store.person(r.invitee);
      const p = store.progress(r.invitee);
      return {
        handle: friend?.handle ?? '', name: friend?.name ?? '', at: r.at, status: r.status,
        hours: p.hours, days: p.days, minecraft: r.status === 'counted' || !!p.minecraft,
      };
    });
    const counted = invited.filter((r) => r.status === 'counted').length;
    return {
      enabled: true, code, link: `${deps.publicUrl.replace(/\/+$/, '')}/z/${code}`,
      canRedeem: until !== undefined, redeemUntil: until ?? null,
      redeemed: by ? { handle: by.handle, name: by.name } : null,
      suggested: until !== undefined ? suggestion(ip, me, now) : null,
      hoursGoal: g.hours, daysGoal: g.days, inviterSparks: num('referrals.inviterSparks'), inviteeSparks: num('referrals.inviteeSparks'),
      counted, invited, rewards: rewards(counted),
    };
  }

  /** A new player types in a friend's code (see the top of this file for the rules). */
  function redeem(me: string, raw: unknown, now = Date.now()) {
    if (!on()) deps.fail(503, 'disabled');
    deps.limitRedeem?.(me);
    if (store.redeemed(me)) deps.fail(409, 'already_redeemed');
    if (redeemUntil(me, now) === undefined) deps.fail(400, 'too_late');
    const code = normalizeCode(raw);
    const inviter = store.owner(code);
    if (!inviter) return deps.fail(404, 'bad_code');
    if (inviter.uuid === me) deps.fail(400, 'own_code');
    // never the code of someone this player invited (or of someone further down that line)
    if (store.above(inviter.uuid, me)) deps.fail(400, 'cycle');
    if (!store.add(me, inviter.uuid, code, now)) deps.fail(409, 'already_redeemed');
    const friend = store.person(me);
    if (friend) deps.push(inviter.uuid, { type: 'referral', status: 'pending', role: 'inviter', friend: { handle: friend.handle, name: friend.name }, sparks: 0 });
    // a friend who already played enough counts at once
    check(me, now);
    return { ok: true, inviter: { handle: inviter.handle, name: inviter.name } };
  }

  /**
   * The admin rejects a cheated invite. A pending one simply never counts. One that counted already
   * gets its sparks taken back from each side only when that side still has them (the balance never
   * goes below zero): otherwise it is only marked rejected and the sparks stay spent. The achievements
   * it unlocked stay too (achievements are never taken away), but it no longer counts for new ones.
   * Its Minecraft account stays used, so it cannot count for another invite. Rejecting is final.
   */
  function reject(invitee: string, by: string, note: string, now = Date.now()) {
    const row = store.redeemed(invitee);
    if (!row) return deps.fail(404, 'not_found');
    if (row.status === 'rejected') deps.fail(409, 'already_rejected');
    const taken = { inviter: false, invitee: false };
    inTransaction(sql, () => {
      if (!store.markRejected(invitee, by, note, now)) deps.fail(409, 'already_rejected');
      if (row.status !== 'counted') return;
      const back = `Cofnięte zaproszenie${note ? `: ${note}` : ''}`;
      if (row.inviter_sparks > 0) taken.inviter = wallet.change(row.inviter, -row.inviter_sparks, 'referral', `x:in:${invitee}`, back, by, now) !== undefined;
      if (row.invitee_sparks > 0) taken.invitee = wallet.change(invitee, -row.invitee_sparks, 'referral', `x:by:${invitee}`, back, by, now) !== undefined;
    });
    if (taken.inviter) deps.push(row.inviter, { type: 'wallet', balance: wallet.balance(row.inviter), change: -row.inviter_sparks, reason: 'referral', ref: '' });
    if (taken.invitee) deps.push(invitee, { type: 'wallet', balance: wallet.balance(invitee), change: -row.invitee_sparks, reason: 'referral', ref: '' });
    return { was: row.status, taken };
  }

  /** A ledger row's label: `in:<friend>` a friend invited, `by:<friend>` joining with a code, `x:` either taken back. */
  function label(ref: string, note: string): { label: string; labelEn: string } {
    const back = ref.startsWith('x:');
    const [kind, uuid] = (back ? ref.slice(2) : ref).split(':');
    const row = uuid ? store.redeemed(uuid) : undefined;
    const other = row ? store.person(kind === 'in' ? row.invitee : row.inviter) : undefined;
    const who = other ? `@${other.handle}` : note.startsWith('@') ? note : '';
    if (back) return { label: `Cofnięte zaproszenie ${who}`.trim(), labelEn: `Invite taken back ${who}`.trim() };
    return kind === 'in'
      ? { label: `Zaproszony znajomy ${who}`.trim(), labelEn: `Friend invited ${who}`.trim() }
      : { label: `Dołączenie z zaproszenia ${who}`.trim(), labelEn: `Joined with an invite ${who}`.trim() };
  }

  /** What the admin panel shows. */
  function adminView(q = '', status = '') {
    const handle = (uuid: string) => store.person(uuid);
    const g = goals();
    return {
      settings: {
        enabled: on(), redeemDays: num('referrals.redeemDays'), hoursGoal: g.hours, daysGoal: g.days,
        inviterSparks: num('referrals.inviterSparks'), inviteeSparks: num('referrals.inviteeSparks'), monthlyCap: num('referrals.monthlyCap'),
      },
      totals: store.totals(),
      top: store.top().map((t) => ({ id: t.uuid, handle: t.handle, name: t.name, counted: t.counted ?? 0, pending: t.pending ?? 0, rejected: t.rejected ?? 0 })),
      recent: store.recent(q.trim().slice(0, 64), status).map((r) => {
        const a = handle(r.inviter);
        const b = handle(r.invitee);
        const p = store.progress(r.invitee);
        return {
          invitee: { id: r.invitee, handle: b?.handle ?? '', name: b?.name ?? '' }, inviter: { id: r.inviter, handle: a?.handle ?? '', name: a?.name ?? '' },
          code: r.code, at: r.at, status: r.status, countedAt: r.counted_at, hours: p.hours, days: p.days, minecraft: r.status === 'counted' || !!p.minecraft,
          inviterSparks: r.inviter_sparks, inviteeSparks: r.invitee_sparks, rejectedAt: r.rejected_at, rejectedBy: r.rejected_by ? handle(r.rejected_by)?.handle ?? '' : '', note: r.note,
        };
      }),
    };
  }

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/referrals$/, (req) => view(deps.authed(req), deps.clientIp(req))],
    ['POST', /^\/v1\/referrals\/redeem$/, async (req) => {
      const me = deps.authed(req);
      const { code } = await deps.body(req);
      return redeem(me, code);
    }],
    // -- the admin panel --
    ['GET', /^\/v1\/admin\/referrals$/, (req, _p, url) => {
      deps.admin(req);
      return adminView(url.searchParams.get('q') ?? '', url.searchParams.get('status') ?? '');
    }],
    ['POST', /^\/v1\/admin\/referrals\/([\w-]{1,64})\/reject$/, async (req, [invitee]) => {
      const me = deps.admin(req);
      const { reason } = await deps.body(req);
      const note = typeof reason === 'string' ? reason.trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, 200) : '';
      const res = reject(invitee, me, note);
      const who = store.person(invitee)?.handle ?? invitee;
      deps.audit?.(me, 'referral_reject', who, `${res.was === 'counted' ? 'policzone' : 'oczekujące'}${res.taken.inviter || res.taken.invitee ? `, odebrano Iskry${res.taken.inviter ? ' zapraszającemu' : ''}${res.taken.invitee ? ' zaproszonemu' : ''}` : ''}${note ? `: ${note}` : ''}`);
      return { ...adminView(), rejected: res };
    }],
  ];

  // ---------- the page /z/<code> ----------

  const T = {
    pl: {
      title: (n: string) => `${n} zaprasza Cię do SlashClient`, eyebrow: 'Zaproszenie',
      lead: 'SlashClient to darmowy launcher Minecrafta z własnym HUD-em, znajomymi i czatem w grze, kosmetykami i osiągnięciami.',
      perks: (sparks: string, h: string, d: number) => [
        ['fa-solid fa-gift', `${sparks} na start – wydasz je w sklepie z pelerynami i innymi kosmetykami.`],
        ['fa-solid fa-user-group', 'Od razu masz z kim grać: znajomi, czat i drużyny prosto w grze.'],
        ['fa-solid fa-trophy', 'Osiągnięcia, wyzwania i nagrody za granie – za darmo.'],
        ['fa-solid fa-circle-info', `Nagroda przychodzi, gdy połączysz konto Minecraft i zagrasz ${h}${d > 1 ? ` w co najmniej ${d} różnych dniach` : ''}.`],
      ],
      download: 'Pobierz SlashClient', code: 'Twój kod zaproszenia', copy: 'Kopiuj', copied: 'Skopiowano',
      hint: (days: number) => `Wpisz go w launcherze po zalogowaniu (masz na to ${days} ${days === 1 ? 'dzień' : 'dni'} od założenia konta).`,
      nav: [['/#funkcje', 'Funkcje'], ['/#kosmetyki', 'Kosmetyki'], ['/#faq', 'FAQ'], ['/wsparcie', 'Wesprzyj']] as [string, string][],
      home: '/', downloadHref: '/#pobierz',
      // "1 godzinę", "3 godziny", "2,5 godziny", "5 godzin", "12 godzin"
      hours: (n: number) => `${String(n).replace('.', ',')} ${n === 1 ? 'godzinę' : n % 1 !== 0 || (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'godziny' : 'godzin'}`,
      unknown: ['Nie ma takiego zaproszenia', 'Ten kod nie należy do nikogo – może jest w nim literówka. Poproś znajomego o link jeszcze raz albo po prostu pobierz SlashClient.'],
      homeLabel: 'Strona główna', description: (n: string) => `${n} zaprasza Cię do SlashClient – darmowego launchera Minecrafta ze znajomymi, czatem w grze i kosmetykami.`,
    },
    en: {
      title: (n: string) => `${n} invites you to SlashClient`, eyebrow: 'Invite',
      lead: 'SlashClient is a free Minecraft launcher with its own HUD, friends and chat in the game, cosmetics and achievements.',
      perks: (sparks: string, h: string, d: number) => [
        ['fa-solid fa-gift', `${sparks} to start with – spend them in the shop on capes and other cosmetics.`],
        ['fa-solid fa-user-group', 'Someone to play with right away: friends, chat and parties right in the game.'],
        ['fa-solid fa-trophy', 'Achievements, challenges and rewards for playing – for free.'],
        ['fa-solid fa-circle-info', `The reward comes once you link a Minecraft account and play ${h}${d > 1 ? ` on at least ${d} different days` : ''}.`],
      ],
      download: 'Download SlashClient', code: 'Your invite code', copy: 'Copy', copied: 'Copied',
      hint: (days: number) => `Type it into the launcher after signing in (you have ${days} ${days === 1 ? 'day' : 'days'} from making the account).`,
      nav: [['/en#funkcje', 'Features'], ['/en#kosmetyki', 'Cosmetics'], ['/en#faq', 'FAQ'], ['/support', 'Support us']] as [string, string][],
      home: '/en', downloadHref: '/en#pobierz', hours: (n: number) => `${n} ${n === 1 ? 'hour' : 'hours'}`,
      unknown: ['No such invite', 'This code belongs to nobody – it may have a typo in it. Ask your friend for the link again, or just download SlashClient.'],
      homeLabel: 'Home', description: (n: string) => `${n} invites you to SlashClient – a free Minecraft launcher with friends, chat in the game and cosmetics.`,
    },
  };

  function page(lang: SiteLang, code: string, inviter: Person): string {
    const t = T[lang];
    const g = goals();
    const sparks = num('referrals.inviteeSparks');
    const perks = t.perks(sparksText(sparks, lang), t.hours(g.hours), g.days).filter((_, i) => i !== 0 || sparks > 0);
    const base = deps.publicUrl.replace(/\/+$/, '');
    const title = t.title(inviter.name);
    const e = escapeHtml;
    return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${e(title)}</title>
  <meta name="description" content="${e(t.description(inviter.name))}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="SlashClient">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(t.description(inviter.name))}">
  <meta property="og:url" content="${base}/z/${e(code)}">
  <meta property="og:image" content="${base}/vendor/logo.png">
  <meta name="theme-color" content="#3b82f6" media="not all"><meta name="theme-color" content="#07090f">
  <link rel="icon" href="/vendor/logo.png">
  <link rel="stylesheet" href="/vendor/fa/css/all.min.css">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/landing.css">
  <link rel="stylesheet" href="/sitePage.css">
  <link rel="stylesheet" href="/referral.css">
  <script type="module" src="/router.js"></script>
  <script type="module" src="/referral.js"></script>
</head>
<body class="landing site-page">
  <div class="bg" aria-hidden="true"><div class="bg-grid"></div><div class="bg-glow g1"></div></div>
  <header class="nav scrolled">
    <div class="wrap">
      <a class="brand" href="${t.home}"><img src="/vendor/logo.png" alt=""><span>Slash<b>Client</b></span></a>
      ${siteNav(lang, t.nav.filter(([h]) => !deps.hidden?.(h)))}
    </div>
  </header>
  <main class="sp-main">
    <section class="sp-card glass info ref-card">
      <div class="sp-icon"><i class="fa-solid fa-user-plus"></i></div>
      <span class="eyebrow">${e(t.eyebrow)}</span>
      <h1>${e(title)}</h1>
      <p class="muted">${e(t.lead)}</p>
      <ul class="ref-perks">
        ${perks.map(([icon, text]) => `<li><i class="${e(icon)}"></i><span>${e(text)}</span></li>`).join('\n        ')}
      </ul>
      <a class="btn primary ref-download" href="${t.downloadHref}"><i class="fa-solid fa-download"></i> ${e(t.download)}</a>
      <div class="ref-code-box">
        <small class="muted">${e(t.code)}</small>
        <div class="ref-code-row">
          <code class="ref-code" id="ref-code">${e(code)}</code>
          <button type="button" class="btn ref-copy" id="ref-copy" data-copied="${e(t.copied)}"><i class="fa-solid fa-copy"></i> <span>${e(t.copy)}</span></button>
        </div>
        <p class="sp-note">${e(t.hint(num('referrals.redeemDays')))}</p>
      </div>
    </section>
  </main>
  ${siteFooter(lang)}
</body>
</html>
`;
  }

  /** The invite page for /z/<code>; false for any other address. */
  function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const m = /^\/z\/([A-Za-z0-9-]{1,32})\/?$/.exec(url.pathname);
    if (!m) return false;
    const asked = url.searchParams.get('lang');
    const lang: SiteLang = asked === 'en' || asked === 'pl' ? asked : siteLang(req, url.pathname);
    const headers = {
      'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    };
    const send = (status: number, html: string) => {
      res.writeHead(status, headers);
      res.end(req.method === 'HEAD' ? undefined : (deps.versioned ? deps.versioned(html) : html));
      return true;
    };
    if (!on()) return send(503, disabledPage(lang));
    const ip = deps.clientIp(req);
    try {
      deps.limitViews?.(ip);
    } catch {
      res.writeHead(429, { ...headers, 'Retry-After': '60' });
      res.end();
      return true;
    }
    const code = normalizeCode(m[1]);
    const inviter = store.owner(code);
    if (!inviter) {
      const t = T[lang];
      return send(404, sitePage({ lang, code: '404', icon: 'fa-solid fa-user-plus', tone: 'warning', title: t.unknown[0], text: t.unknown[1], actions: [[t.download, t.downloadHref, true], [t.homeLabel, t.home]] }));
    }
    remember(ip, code);
    return send(200, page(lang, code, inviter));
  }

  return { routes, serve, tick, check, redeem, reject, view, label, store, remember };
}
