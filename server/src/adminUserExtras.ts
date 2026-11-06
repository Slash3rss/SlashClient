import type http from 'node:http';
import type { Db } from './db.ts';
import { DAY_MIN_SECONDS, dayOf, streaks, value, type Counter, type createAchievements } from './achievements.ts';
import { METRICS as CHALLENGE_METRICS, PERIODS, addDays, counterOf, periodOf, render, type Challenge, type createChallenges } from './challenges.ts';
import type { createReferrals } from './referrals.ts';
import type { createCommunities } from './communities.ts';
import type { createGroups } from './groups.ts';
import type { MuteStore } from './mutes.ts';
import type { profileShareRoutes } from './profileShares.ts';
import type { profileCloudRoutes } from './profileCloud.ts';
import type { mediaRoutes } from './media.ts';
import type { chatImageRoutes } from './chatImages.ts';
import type { OfflineSkinStore } from './offlineSkins.ts';
import type { SupportStore } from './payments/store.ts';
import { RefundStore } from './payments/refunds.ts';
import { capeSetting, item, priceOf } from './cosmetics.ts';
import { inTransaction, type Wallet } from './economy.ts';

/**
 * The rest of a player's account in the admin panel's drawer ("Konta"), so the owner never edits the
 * database by hand: achievements and challenges, friends, clans, communities and groups, invites,
 * support, and what the player stored on the server. Everything here goes through the features' own
 * functions and tells the player's launchers what those would; every change is written to the admin
 * log. Private messages, chat keys and tokens are never shown: of chat pictures only their size and date.
 *
 * Accounts that are admins by configuration (ADMIN_HANDLES) can only be changed here by such an admin.
 * Some actions are the panel's existing ones (a clan's member, support grants, logs, bug reports,
 * screenshots, rejecting an invite): the drawer calls those, they check and log themselves.
 */

/** Achievement counters kept by events (achievements.ts), which the admin may start again. */
export const COUNTERS: Counter[] = ['media', 'shares', 'cloud', 'parties_created', 'parties_joined', 'sprays', 'night', 'early'];
/** The longest streak the admin may set (ten years). */
export const MAX_STREAK = 3650;

const DAY_MS = 86_400_000;
/** The start of a moment's UTC day (the streak's days are UTC days). */
const dayStart = (at: number) => Date.parse(`${dayOf(at)}T00:00:00Z`);

export interface UserExtrasContext {
  db: Db;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fail: (status: number, code: string) => never;
  push: (userId: string, event: unknown) => void;
  /** Handles that are admins by configuration. */
  configAdmins: Set<string>;
  /** What a player wears changed (an achievement's reward taken back). */
  cosmeticsChanged?: (userId: string) => void;
  wallet: Wallet;
  achievements: Pick<ReturnType<typeof createAchievements>, 'store' | 'registry' | 'check'>;
  challenges: Pick<ReturnType<typeof createChallenges>, 'store' | 'registry'>;
  referrals: Pick<ReturnType<typeof createReferrals>, 'store'>;
  communities: Pick<ReturnType<typeof createCommunities>, 'store'>;
  groups: Pick<ReturnType<typeof createGroups>, 'store' | 'clanChat'>;
  mutes: { store: MuteStore };
  support: { store: SupportStore; active: (userId: string) => { tier: { id: string; name: string }; expiresAt: number | null; since: number } | undefined };
  shares: Pick<ReturnType<typeof profileShareRoutes>, 'remove'>;
  cloud: Pick<ReturnType<typeof profileCloudRoutes>, 'list' | 'remove'>;
  media: Pick<ReturnType<typeof mediaRoutes>, 'ofOwner'>;
  images: Pick<ReturnType<typeof chatImageRoutes>, 'ofOwner' | 'takeDownOne'>;
  /** Skins set for offline nicks (offlineSkins.ts; deleting one: DELETE /v1/admin/users/<id>/offline-skins/<nick>). */
  offlineSkins?: { store: Pick<OfflineSkinStore, 'list'> };
  now?: () => number;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function adminUserExtrasRoutes(ctx: UserExtrasContext): [string, RegExp, Handler][] {
  const { db, fail, wallet } = ctx;
  const sql = db.sql;
  const now = ctx.now ?? Date.now;
  const refunds = new RefundStore(sql, now);
  const ach = ctx.achievements;
  const isConfig = (handle: string | undefined) => !!handle && ctx.configAdmins.has(handle.toLowerCase());
  const userOr404 = (id: string) => db.user(id) ?? fail(404, 'not_found');
  /** An account admin by configuration is changed only by another such admin. */
  const guarded = (me: string, user: { handle: string }) => isConfig(user.handle) && !isConfig(db.user(me)?.handle);
  /** The admin and the account, for a change: 403 for an account that is protected from this admin. */
  const forChange = (req: http.IncomingMessage, id: string) => {
    const me = ctx.admin(req);
    const user = userOr404(id);
    if (guarded(me, user)) fail(403, 'config_admin');
    return { me, user };
  };
  const person = (id: string) => {
    const u = db.user(id);
    return { id, handle: u?.handle ?? '', name: u?.name ?? '' };
  };
  const handleOf = (id: string) => db.user(id)?.handle ?? id;
  const route = (rest: string) => new RegExp(`^\\/v1\\/admin\\/users\\/([\\w-]+)\\/extras\\/${rest}$`);

  // ---------- achievements, the streak and challenges ----------

  const playDays = (uuid: string) => sql.prepare('SELECT day, seconds FROM play_days WHERE uuid = ? ORDER BY day DESC').all(uuid) as { day: string; seconds: number }[];

  /**
   * What setting the streak still going to `wanted` days changes: a longer one fills the missing days
   * (DAY_MIN_SECONDS each, which counts as playing), a shorter one cuts the day that breaks it to just
   * under DAY_MIN_SECONDS (that day's play time beyond it is lost). Nothing else is touched.
   */
  function streakPlan(uuid: string, wanted: number, at: number) {
    const today = dayOf(at);
    const yesterday = addDays(today, -1);
    const rows = playDays(uuid);
    const seconds = new Map(rows.map((r) => [r.day, r.seconds]));
    const counting = rows.filter((r) => r.seconds >= DAY_MIN_SECONDS).map((r) => r.day);
    const before = streaks(counting, today);
    const anchor = seconds.get(today) !== undefined && seconds.get(today)! >= DAY_MIN_SECONDS ? today : yesterday;
    const fill: string[] = [];
    const cut: { day: string; seconds: number }[] = [];
    if (wanted > before.current) {
      // a streak that is over starts again today; one still going grows back from its last day
      const from = before.current ? anchor : today;
      for (let i = 0; i < wanted; i++) {
        const d = addDays(from, -i);
        if ((seconds.get(d) ?? 0) < DAY_MIN_SECONDS) fill.push(d);
      }
    } else if (wanted < before.current) {
      for (const d of wanted === 0 ? [today, yesterday] : [addDays(anchor, -wanted)]) {
        const s = seconds.get(d) ?? 0;
        if (s >= DAY_MIN_SECONDS) cut.push({ day: d, seconds: s });
      }
    }
    const after = new Set(counting);
    for (const d of fill) after.add(d);
    for (const c of cut) after.delete(c.day);
    const result = streaks([...after], today);
    return {
      before: before.current, best: before.best, after: result.current, bestAfter: result.best, fill, cut,
      added: fill.reduce((n, d) => n + DAY_MIN_SECONDS - (seconds.get(d) ?? 0), 0),
      lost: cut.reduce((n, c) => n + c.seconds - (DAY_MIN_SECONDS - 1), 0),
    };
  }

  /** The challenges of the periods now as they were assigned (looking does not assign or pay anything). */
  function challengesOf(uuid: string, at: number) {
    return PERIODS.map((kind) => {
      const p = periodOf(kind, at);
      const bonus = ctx.challenges.store.bonus(uuid, p.key);
      return {
        kind, key: p.key, endsAt: p.end, bonusAt: bonus?.at ?? null,
        challenges: ctx.challenges.store.assigned(uuid, p.key).flatMap((r) => {
          let c: Challenge;
          try {
            c = JSON.parse(r.data) as Challenge;
          } catch {
            return [];
          }
          const pool = ctx.challenges.registry.get(c.id) ?? c;
          const n = ctx.challenges.store.get(uuid, p.key, counterOf(c));
          return [{
            id: c.id, metric: c.metric, target: c.target, sparks: c.sparks, name: render(pool.name, c), counter: counterOf(c),
            value: CHALLENGE_METRICS[c.metric]?.seconds ? Math.floor(n / 60) : n, doneAt: r.done_at, assignedAt: r.at,
          }];
        }),
      };
    });
  }

  function achievementsView(uuid: string) {
    const at = now();
    const s = ach.store.stats(uuid, at, wallet);
    const have = ach.store.unlocked(uuid);
    const paid = new Map((sql.prepare("SELECT ref, amount FROM sparks_ledger WHERE uuid = ? AND reason = 'achievement'").all(uuid) as { ref: string; amount: number }[]).map((r) => [r.ref, r.amount]));
    const list = ach.registry.all().map((a) => {
      const v = a.group === 'manual' ? null : value(a, s);
      const it = a.reward ? item(a.reward) : undefined;
      return {
        id: a.id, name: a.name, group: a.group, category: a.category, goal: a.goal, value: v, sparks: a.sparks, paid: paid.get(a.id) ?? 0,
        unlockedAt: have.get(a.id) ?? null, reward: it ? { id: it.id, name: it.name } : null,
        manual: a.group === 'manual', enabled: a.enabled !== false, hidden: !!a.hidden,
        // still reached: taken away, it comes back at the next check (without paying again)
        reached: a.group !== 'manual' && a.enabled !== false && v !== null && v >= a.goal,
      };
    });
    const days = playDays(uuid);
    const today = dayOf(at);
    return {
      achievements: list,
      counters: COUNTERS.map((key) => ({ key, n: ach.store.counter(uuid, key), live: ach.store.live(uuid, key) })),
      streak: {
        current: s.streak, best: s.bestStreak, daysPlayed: s.daysPlayed, hours: Math.floor(s.totalSeconds / 360) / 10, minSeconds: DAY_MIN_SECONDS, today,
        // the last fortnight, for the admin to see where the streak broke
        recent: Array.from({ length: 14 }, (_, i) => addDays(today, -i)).map((day) => ({ day, seconds: days.find((d) => d.day === day)?.seconds ?? 0 })),
      },
      challenges: { periods: challengesOf(uuid, at) },
    };
  }

  /** An item taken back comes off the player (the account's cape and slots, every Minecraft account's set), as the panel's revoke does. */
  function takeOff(uuid: string, id: string) {
    const user = db.user(uuid);
    if (!user) return;
    if (user.cape === id) db.setCape(uuid, '');
    if (Object.values(user.loadout).includes(id)) db.setLoadout(uuid, Object.fromEntries(Object.entries(user.loadout).filter(([, v]) => v !== id)));
    for (const m of db.minecraftAccounts(uuid)) {
      if (m.loadout && Object.values(m.loadout).includes(id)) db.setCharacterLoadout(uuid, m.uuid, Object.fromEntries(Object.entries(m.loadout).filter(([, v]) => v !== id)));
    }
  }

  // ---------- friends ----------

  function friendsView(uuid: string) {
    const muted = ctx.mutes.store.muted(uuid);
    return {
      friends: db.friends(uuid).map((f) => ({ id: f.id, handle: f.handle, name: f.name, since: f.since, muted: muted.has(f.id) })),
      incoming: db.incoming(uuid).map((r) => ({ id: r.id, handle: r.handle, name: r.name, at: r.at })),
      outgoing: db.outgoing(uuid).map((r) => ({ id: r.id, handle: r.handle, name: r.name, at: r.at })),
    };
  }

  // ---------- memberships ----------

  function membershipsView(uuid: string) {
    const clan = sql.prepare(`SELECT c.id, c.tag, c.name, c.owner, m.role, m.joined_at AS joinedAt, (SELECT COUNT(*) FROM clan_members x WHERE x.clan_id = c.id) AS members
      FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.uuid = ?`).get(uuid) as { id: string; tag: string; name: string; owner: string; role: string; joinedAt: number; members: number } | undefined;
    const gs = ctx.groups.store;
    return {
      clan: clan ?? null,
      communities: ctx.communities.store.membershipsOf(uuid).map((c) => ({ id: c.id, name: c.name, tag: c.tag, slug: c.tag || c.id, role: c.member.role, joinedAt: c.member.joinedAt, members: c.members, owner: c.owner === uuid })),
      groups: gs.groupsOf(uuid).flatMap((id) => {
        const g = gs.group(id);
        if (!g) return [];
        const members = gs.members(id);
        return [{ id, name: g.name, clan: !!g.clan, owner: g.owner === uuid, members: members.length, joinedAt: members.find((m) => m.uuid === uuid)?.joinedAt ?? null, createdAt: g.createdAt }];
      }),
    };
  }

  // ---------- invites ----------

  function referralsView(uuid: string) {
    const rs = ctx.referrals.store;
    const code = (sql.prepare('SELECT code FROM referral_codes WHERE uuid = ?').get(uuid) as { code: string } | undefined)?.code ?? null;
    const mine = rs.redeemed(uuid);
    const row = (r: NonNullable<typeof mine>, other: string) => {
      const p = rs.progress(r.invitee);
      return {
        ...person(other), status: r.status, at: r.at, countedAt: r.counted_at, code: r.code, inviterSparks: r.inviter_sparks, inviteeSparks: r.invitee_sparks,
        hours: p.hours, days: p.days, rejectedAt: r.rejected_at, rejectedBy: r.rejected_by ? handleOf(r.rejected_by) : '', note: r.note,
      };
    };
    return {
      code,
      invitedBy: mine ? row(mine, mine.inviter) : null,
      invited: rs.invitedBy(uuid).map((r) => ({ ...row(r, r.invitee), invitee: r.invitee })),
    };
  }

  // ---------- support ----------

  function supportView(uuid: string) {
    const st = ctx.support.store;
    const tiers = st.tiers();
    const nameOf = (id: string) => tiers.find((t) => t.id === id)?.name ?? id;
    const a = ctx.support.active(uuid);
    return {
      active: a ? { tier: a.tier.id, name: a.tier.name, expiresAt: a.expiresAt, since: Number.isFinite(a.since) ? a.since : null } : null,
      tiers: tiers.map((t) => ({ id: t.id, name: t.name, level: t.level, enabled: t.enabled })),
      grants: st.grantsOf(uuid).map((g) => ({
        id: g.id, tier: g.tier, tierName: nameOf(g.tier), source: g.source, startsAt: g.startsAt, expiresAt: g.expiresAt, revokedAt: g.revokedAt || null,
        revokedReason: g.revokedReason, note: g.note, by: g.by ? handleOf(g.by) : '',
      })),
      payments: st.paymentsOf(uuid, 50).map((p) => ({
        id: p.id, provider: p.provider, tier: p.tier, tierName: nameOf(p.tier), kind: p.kind, amount: p.amount, currency: p.currency, status: p.status,
        test: p.mode === 'test', createdAt: p.createdAt, paidAt: p.paidAt || null, refundedAt: p.refundedAt || null,
      })),
      refunds: refunds.of(uuid).map((r) => ({ id: r.id, payment: r.payment, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    };
  }

  // ---------- what the player stored ----------

  function contentView(uuid: string) {
    const groupName = (id: string) => ctx.groups.store.group(id)?.name ?? '';
    return {
      shares: db.profileShares(uuid).map((s) => ({ code: s.code, name: s.name, gameVersion: s.gameVersion, loader: s.loader, size: s.size, downloads: s.downloads, createdAt: s.createdAt, expiresAt: s.expiresAt })),
      cloud: ctx.cloud.list(uuid).map((p) => ({ id: p.id, name: p.name, gameVersion: p.gameVersion, loader: p.loader, device: p.device, size: p.size, revision: p.revision, updatedAt: p.updatedAt })),
      media: ctx.media.ofOwner(uuid).map((m) => ({ id: m.id, kind: m.kind, size: m.size, width: m.width, height: m.height, durationMs: m.durationMs, title: m.title, views: m.views, createdAt: m.createdAt, expiresAt: m.expiresAt })),
      logs: sql.prepare('SELECT id, size, lines, created_at AS createdAt FROM logs WHERE owner = ? ORDER BY created_at DESC LIMIT 100').all(uuid),
      bugs: sql.prepare('SELECT id, title, status, created_at AS createdAt FROM bugs WHERE author = ? ORDER BY created_at DESC LIMIT 100').all(uuid),
      // the pictures' size and date only: whom they went to, never what they show (they are encrypted anyway)
      chatImages: ctx.images.ofOwner(uuid).map((i) => ({
        id: i.id, size: i.size, at: i.at, sent: i.message !== null, removedAt: i.removedAt,
        to: i.recipient.startsWith('g:') ? { group: groupName(i.recipient.slice(2)) } : { ...person(i.recipient) },
      })),
      offlineSkins: ctx.offlineSkins?.store.list(uuid) ?? [],
    };
  }

  const VIEWS: Record<string, (uuid: string) => unknown> = {
    achievements: achievementsView, friends: friendsView, memberships: membershipsView, referrals: referralsView, support: supportView, content: contentView,
  };

  return [
    // one section of the drawer; `protected`: this admin may only look at the account
    ['GET', route('(achievements|friends|memberships|referrals|support|content)'), (req, [id, section]) => {
      const me = ctx.admin(req);
      const user = userOr404(id);
      return { ...(VIEWS[section](id) as object), protected: guarded(me, user) };
    }],

    // -- achievements --
    // any achievement taken away; its sparks and item only with `clawback` (never below zero), the item also comes off the player
    ['POST', route('achievements\\/([a-z0-9_]{1,40})\\/revoke'), async (req, [id, aid]) => {
      const { me, user } = forChange(req, id);
      const a = ach.registry.get(aid) ?? fail(404, 'not_found');
      const { clawback } = await ctx.body(req);
      let taken = 0;
      let itemTaken = false;
      inTransaction(sql, () => {
        if (!ach.store.remove(id, aid)) fail(400, 'not_held');
        if (clawback !== true) return;
        const paid = (sql.prepare("SELECT amount FROM sparks_ledger WHERE uuid = ? AND reason = 'achievement' AND ref = ?").get(id, aid) as { amount: number } | undefined)?.amount ?? 0;
        taken = Math.min(paid, wallet.balance(id));
        if (taken > 0) wallet.change(id, -taken, 'admin', aid, `Odebrano osiągnięcie „${a.name}”`, me);
        if (a.reward && db.grants(id).includes(a.reward)) {
          db.revoke(id, a.reward);
          itemTaken = true;
          // what only the achievement gave comes off (an admin may wear everything)
          const it = item(a.reward);
          const settings = db.cosmeticSettings();
          const adminWearer = user.role === 'admin' || isConfig(user.handle);
          if (it && !adminWearer && (capeSetting(settings, it.id).exclusive || it.rank || it.achievement || it.price || priceOf(settings, it.id))) takeOff(id, it.id);
        }
      });
      db.log(me, 'ach_revoke', user.handle, `${aid}${clawback === true ? `, odebrano ${taken} Iskier${itemTaken ? ' i nagrodę' : ''}` : ''}`);
      if (taken > 0) ctx.push(id, { type: 'wallet', balance: wallet.balance(id), change: -taken, reason: 'admin', ref: aid });
      if (itemTaken) ctx.cosmeticsChanged?.(id);
      return { taken, itemTaken, ...achievementsView(id) };
    }],
    // an event counter starts again (what the tables show now still counts)
    ['POST', route('achievements\\/counters\\/([a-z_]{1,30})\\/reset'), (req, [id, key]) => {
      const { me, user } = forChange(req, id);
      if (!COUNTERS.includes(key as Counter)) fail(400, 'bad_counter');
      const was = ach.store.counter(id, key as Counter);
      ach.store.resetCounter(id, key as Counter);
      db.log(me, 'ach_counter_reset', user.handle, `${key}: ${was} → 0`);
      return achievementsView(id);
    }],
    // the streak going on now: { days, dryRun } (dryRun: only what it would change)
    ['POST', route('streak'), async (req, [id]) => {
      const { me, user } = forChange(req, id);
      const { days, dryRun } = await ctx.body(req);
      const at = now();
      const created = (sql.prepare('SELECT created_at FROM users WHERE uuid = ?').get(id) as { created_at: number }).created_at;
      // not before the account was made
      const most = Math.min(MAX_STREAK, Math.floor((dayStart(at) - dayStart(created)) / DAY_MS) + 1);
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > most) fail(400, 'bad_days');
      const plan = streakPlan(id, days as number, at);
      if (dryRun === true) return { plan };
      inTransaction(sql, () => {
        const fill = sql.prepare('INSERT INTO play_days (uuid, day, seconds) VALUES (?, ?, ?) ON CONFLICT (uuid, day) DO UPDATE SET seconds = MAX(seconds, excluded.seconds)');
        for (const d of plan.fill) fill.run(id, d, DAY_MIN_SECONDS);
        const cut = sql.prepare('UPDATE play_days SET seconds = MIN(seconds, ?) WHERE uuid = ? AND day = ?');
        for (const c of plan.cut) cut.run(DAY_MIN_SECONDS - 1, id, c.day);
      });
      if (plan.fill.length || plan.cut.length) db.log(me, 'streak_set', user.handle, `${plan.before} → ${plan.after} dni${plan.fill.length ? `, uzupełniono ${plan.fill.length} dni` : ''}${plan.cut.length ? `, przycięto ${plan.cut.map((c) => c.day).join(', ')}` : ''}`);
      // a longer streak may reach an achievement now (paid as any unlock)
      ach.check(id, at);
      return { plan, ...achievementsView(id) };
    }],
    // a challenge of the periods now starts from zero (its counter in that period: other challenges counting the same thing too)
    ['POST', route('challenges\\/reset'), async (req, [id]) => {
      const { me, user } = forChange(req, id);
      const { period, challenge } = await ctx.body(req);
      const at = now();
      const p = PERIODS.map((k) => periodOf(k, at)).find((x) => x.key === period) ?? fail(400, 'bad_period');
      const row = ctx.challenges.store.assigned(id, p.key).find((r) => r.id === challenge) ?? fail(404, 'not_found');
      // a done one was paid, once: it stays done
      if (row.done_at) fail(400, 'already_done');
      const c = JSON.parse(row.data) as Challenge;
      ctx.challenges.store.resetCounter(id, p.key, counterOf(c));
      db.log(me, 'challenge_progress_reset', user.handle, `${c.id} (${p.key})`);
      return achievementsView(id);
    }],

    // -- friends --
    ['DELETE', route('friends\\/([\\w-]{1,64})'), (req, [id, other]) => {
      const { me, user } = forChange(req, id);
      if (!db.removeFriendship(id, other)) fail(404, 'not_found');
      ctx.mutes.store.forget(id, other);
      // both lists change at once, in every launcher, game and phone
      ctx.push(id, { type: 'friends' });
      ctx.push(other, { type: 'friends' });
      db.log(me, 'friend_remove', user.handle, `@${handleOf(other)}`);
      return friendsView(id);
    }],
    // a request either way between the two
    ['DELETE', route('requests\\/([\\w-]{1,64})'), (req, [id, other]) => {
      const { me, user } = forChange(req, id);
      const from = db.removeRequest(id, other);
      const to = db.removeRequest(other, id);
      if (!from && !to) fail(404, 'not_found');
      ctx.push(id, { type: 'friends' });
      ctx.push(other, { type: 'friends' });
      db.log(me, 'friend_request_remove', user.handle, `${from ? '→' : '←'} @${handleOf(other)}`);
      return friendsView(id);
    }],
    ['DELETE', route('mutes\\/([\\w-]{1,64})'), (req, [id, friend]) => {
      const { me, user } = forChange(req, id);
      if (!ctx.mutes.store.muted(id).has(friend)) fail(404, 'not_found');
      ctx.mutes.store.set(id, friend, false);
      ctx.push(id, { type: 'friends' });
      db.log(me, 'mute_clear', user.handle, `@${handleOf(friend)}`);
      return friendsView(id);
    }],

    // -- memberships (a clan's member: DELETE /v1/admin/clans/<id>/members/<user>) --
    // as a moderator's kick; the owner hands the community over first (the Społeczności tab)
    ['DELETE', route('communities\\/([\\w-]{1,32})'), (req, [id, cid]) => {
      const { me, user } = forChange(req, id);
      const store = ctx.communities.store;
      const c = store.community(cid) ?? fail(404, 'not_found');
      const m = store.member(cid, id) ?? fail(404, 'not_found');
      if (m.role === 'owner') fail(400, 'owner_must_transfer');
      store.removeMember(cid, id);
      store.log(cid, me, 'kick', id);
      ctx.push(id, { type: 'communities', id: cid });
      ctx.push(id, { type: 'community', id: cid, kicked: { name: c.name } });
      db.log(me, 'user_community_remove', user.handle, c.name);
      return membershipsView(id);
    }],
    // a group chat (a clan's chat follows the clan); its owner's role passes on, an empty group goes
    ['DELETE', route('groups\\/([\\w-]{1,32})'), (req, [id, gid]) => {
      const { me, user } = forChange(req, id);
      const g = ctx.groups.store.group(gid) ?? fail(404, 'not_found');
      if (g.clan) fail(400, 'clan_chat');
      if (!ctx.groups.store.isMember(gid, id)) fail(404, 'not_found');
      ctx.groups.clanChat.leave(gid, id, me);
      db.log(me, 'user_group_remove', user.handle, g.name);
      return membershipsView(id);
    }],

    // -- invites (rejecting one: POST /v1/admin/referrals/<invitee>/reject) --
    // a wrong code typed in, still pending (nothing paid): taken off, so the player may type the right one while they still can
    ['POST', route('referral\\/detach'), (req, [id]) => {
      const { me, user } = forChange(req, id);
      const row = ctx.referrals.store.redeemed(id) ?? fail(404, 'not_found');
      if (row.status !== 'pending') fail(400, 'not_pending');
      sql.prepare("DELETE FROM referrals WHERE invitee = ? AND status = 'pending'").run(id);
      db.log(me, 'referral_detach', user.handle, `@${handleOf(row.inviter)} (${row.code})`);
      return referralsView(id);
    }],

    // -- what the player stored (screenshots: DELETE /v1/media/<id>; logs: DELETE /v1/admin/logs/<id>; bug reports: DELETE /v1/bugs/<id>) --
    ['DELETE', route('shares\\/([A-Z0-9]{8})'), async (req, [id, code]) => {
      const { me, user } = forChange(req, id);
      const s = db.profileShares(id).find((x) => x.code === code) ?? fail(404, 'not_found');
      await ctx.shares.remove(s.code);
      db.log(me, 'share_remove', user.handle, `${s.code}${s.name ? ` ${s.name}` : ''}`);
      return contentView(id);
    }],
    ['DELETE', route('cloud\\/([A-Za-z0-9-]{8,64})'), async (req, [id, pid]) => {
      const { me, user } = forChange(req, id);
      const p = ctx.cloud.list(id).find((x) => x.id === pid.toLowerCase()) ?? fail(404, 'not_found');
      await ctx.cloud.remove(id, p.id);
      db.log(me, 'cloud_remove', user.handle, p.name || p.id);
      return contentView(id);
    }],
    ['DELETE', route('chat-images\\/([\\w-]{22})'), async (req, [id, img]) => {
      const { me, user } = forChange(req, id);
      // only this player's, and only once
      if (!(await ctx.images.takeDownOne(img, me, id))) fail(404, 'not_found');
      db.log(me, 'chat_image_remove', user.handle, img);
      return contentView(id);
    }],
  ];
}
