import type http from 'node:http';
import type { Db } from './db.ts';
import {
  ACHIEVEMENTS, CATEGORIES, ICONS, METRICS, OVERRIDE_KEYS, iconOf,
  type Achievement, type Category, type createAchievements, type Group, type Override,
} from './achievements.ts';
import { ITEMS, item } from './cosmetics.ts';
import { inTransaction, type Wallet } from './economy.ts';
import { howToGet } from './obtain.ts';

/**
 * The admin panel's achievement creator: new achievements (counted from a metric this server checks
 * itself, or given by hand to chosen players), changes to the built-in ones (kept apart from them,
 * so "back to default" is a delete), and who has which. Every change goes to the admin log.
 *
 * Rewards are paid once, when an achievement unlocks: a reward changed later pays nobody who has it
 * already. A goal lowered (or an achievement switched on, or a new one) unlocks at once for everyone
 * who reaches it, with the payout; a goal raised takes nothing away.
 */

/** The most sparks one achievement may pay. */
export const MAX_ACHIEVEMENT_SPARKS = 10_000;
/** An achievement made in the panel: its id (also in the ledger and the players' data). */
export const SLUG = /^[a-z][a-z0-9_]{2,39}$/;
/** At most this many players in one grant. */
const MAX_GRANT = 100;

type Achievements = ReturnType<typeof createAchievements>;

interface Deps {
  db: Db;
  wallet: Wallet;
  achievements: Achievements;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  push: (userId: string, event: unknown) => void;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/[\u0000-\u001f]/g, ' ') : undefined);

/**
 * Checks what the editor sent against what the achievement is now (`base`) and gives the achievement
 * after the change; throws the error code of the first thing wrong.
 */
export function validate(input: Record<string, unknown>, base: Achievement, fail: (code: string) => never): Achievement {
  const next: Achievement = { ...base };
  const text = (key: 'name' | 'nameEn' | 'description' | 'descriptionEn', max: number, required: boolean) => {
    if (input[key] === undefined) return;
    const v = clean(input[key]);
    if (v === undefined || v.length > max || (required && !v)) fail(`bad_${key}`);
    next[key] = v!;
  };
  text('name', 60, true);
  text('nameEn', 60, false);
  text('description', 200, true);
  text('descriptionEn', 200, false);
  if (input.icon !== undefined) {
    if (input.icon !== '' && !ICONS.includes(input.icon as string)) fail('bad_icon');
    next.icon = (input.icon as string) || undefined;
  }
  if (input.category !== undefined) {
    if (!CATEGORIES.includes(input.category as Category)) fail('bad_category');
    next.category = input.category as Category;
  }
  for (const key of ['hidden', 'enabled'] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') fail(`bad_${key}`);
    next[key] = input[key] as boolean;
  }
  if (input.sparks !== undefined) {
    const n = input.sparks;
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n > MAX_ACHIEVEMENT_SPARKS) fail('bad_sparks');
    next.sparks = n as number;
  }
  if (input.reward !== undefined) {
    if (input.reward !== '' && (typeof input.reward !== 'string' || !item(input.reward))) fail('bad_reward');
    next.reward = (input.reward as string) || undefined;
  }
  // only a panel-made achievement may count something else
  if (input.metric !== undefined && base.custom) {
    if (input.metric !== 'manual' && !(typeof input.metric === 'string' && Object.hasOwn(METRICS, input.metric))) fail('bad_metric');
    next.group = input.metric as Group;
  }
  if (next.group === 'manual') next.goal = 1;
  else if (input.goal !== undefined || next.group !== base.group) {
    const g = input.goal ?? next.goal;
    const max = METRICS[next.group as Exclude<Group, 'manual'>].max;
    if (typeof g !== 'number' || !Number.isSafeInteger(g) || g < 1 || g > max) fail('bad_goal');
    next.goal = g as number;
  }
  if (!next.name || !next.description) fail('bad_name');
  return next;
}

/** What differs from the built-in achievement (the override kept in the database). */
function diff(def: Achievement, next: Achievement): Override {
  const o: Record<string, unknown> = {};
  for (const k of OVERRIDE_KEYS) {
    const want = k === 'enabled' ? next.enabled !== false : next[k];
    const had = k === 'enabled' ? def.enabled !== false : def[k];
    if ((want ?? '') !== (had ?? '')) o[k] = want ?? '';
  }
  return o as Override;
}

export function achievementsAdminRoutes(deps: Deps): [string, RegExp, Handler][] {
  const { db, wallet, achievements, fail } = deps;
  const { registry, store } = achievements;
  const failCode = (code: string): never => fail(400, code);
  const builtIn = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
  const or404 = (id: string) => registry.get(id) ?? fail(404, 'not_found');

  /** One achievement as the editor gets it: everything (no "???"), with the defaults of a built-in one. */
  function adminView(a: Achievement, holders: Record<string, number>, overridden: Set<string>) {
    const def = a.custom ? undefined : builtIn(a.id);
    return {
      ...a, reward: a.reward ?? '', icon: iconOf(a), ownIcon: a.icon ?? '', enabled: a.enabled !== false, custom: !!a.custom, manual: a.group === 'manual',
      metric: a.group, holders: holders[a.id] ?? 0, overridden: overridden.has(a.id),
      ...(def ? { defaults: { ...def, icon: iconOf(def), reward: def.reward ?? '', enabled: true } } : {}),
    };
  }

  function state() {
    const holders = store.holderCounts();
    const overridden = new Set(registry.overrides().keys());
    const settings = db.cosmeticSettings();
    const all = registry.all();
    return {
      achievements: all.map((a) => adminView(a, holders, overridden)),
      metrics: Object.entries(METRICS).map(([id, m]) => ({ id, ...m })),
      icons: ICONS,
      categories: CATEGORIES,
      maxSparks: MAX_ACHIEVEMENT_SPARKS,
      // for the reward picker: every item and how it can be got now (to see if it is a reward elsewhere)
      items: ITEMS.map((i) => ({ id: i.id, slot: i.slot, name: i.name, obtain: howToGet(i, settings, all) })),
    };
  }

  /** After a change that may make an achievement reachable: everyone is looked at once (unlocks pay as usual). */
  const recheck = (a: Achievement) => (a.enabled !== false && a.group !== 'manual' ? achievements.checkAll() : 0);

  /** A player by account id, @handle or Minecraft nick. */
  function player(q: string): { uuid: string; handle: string } | undefined {
    const s = q.trim().replace(/^@/, '').slice(0, 64);
    if (!s) return undefined;
    const byId = db.user(s);
    if (byId) return { uuid: byId.id, handle: byId.handle };
    const byHandle = db.userByHandle(s);
    if (byHandle) return { uuid: byHandle.id, handle: byHandle.handle };
    const row = db.sql.prepare("SELECT uuid FROM identities WHERE provider = 'minecraft' AND lower(label) = lower(?) LIMIT 1").get(s) as { uuid: string } | undefined;
    const u = row ? db.user(row.uuid) : undefined;
    return u && { uuid: u.id, handle: u.handle };
  }

  return [
    ['GET', /^\/v1\/admin\/achievements$/, (req) => {
      deps.admin(req);
      return state();
    }],
    // a new one: automatic (a metric and a goal) or given by hand
    ['POST', /^\/v1\/admin\/achievements$/, async (req) => {
      const me = deps.admin(req);
      const input = await deps.body(req);
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!SLUG.test(id)) fail(400, 'bad_id');
      // the id stays in the players' data and the ledger: never one taken, built-in or made before
      if (registry.get(id) || builtIn(id)) fail(409, 'id_taken');
      const blank: Achievement = { id, group: 'manual', category: 'play', goal: 1, sparks: 0, name: '', nameEn: '', description: '', descriptionEn: '', custom: true };
      if (input.metric === undefined) failCode('bad_metric');
      const a = validate(input, blank, failCode);
      registry.saveCustom(a, me);
      db.log(me, 'ach_create', id, a.name);
      const unlocked = recheck(a);
      return { ...state(), unlocked };
    }],
    // a change: a built-in one keeps its changes apart (an override), a panel-made one is saved whole
    ['POST', /^\/v1\/admin\/achievements\/([a-z0-9_]{1,40})$/, async (req, [id]) => {
      const me = deps.admin(req);
      const now = or404(id);
      const input = await deps.body(req);
      const next = validate(input, now, failCode);
      if (now.custom) registry.saveCustom(next, me);
      else registry.setOverride(id, diff(builtIn(id)!, next), me);
      db.log(me, 'ach_edit', id, [
        next.goal !== now.goal ? `cel ${now.goal}→${next.goal}` : '',
        next.sparks !== now.sparks ? `Iskry ${now.sparks}→${next.sparks}` : '',
        (next.reward ?? '') !== (now.reward ?? '') ? `nagroda ${now.reward || '—'}→${next.reward || '—'}` : '',
        (next.enabled !== false) !== (now.enabled !== false) ? (next.enabled !== false ? 'włączone' : 'wyłączone') : '',
      ].filter(Boolean).join(', ') || next.name);
      const unlocked = recheck(next);
      return { ...state(), unlocked };
    }],
    // a built-in one back to how the code has it
    ['POST', /^\/v1\/admin\/achievements\/([a-z0-9_]{1,40})\/reset$/, (req, [id]) => {
      const me = deps.admin(req);
      const def = builtIn(id) ?? fail(404, 'not_found');
      registry.setOverride(id, undefined, me);
      db.log(me, 'ach_reset', id, def.name);
      const unlocked = recheck(def);
      return { ...state(), unlocked };
    }],
    // only a panel-made one nobody has (one players have is switched off instead)
    ['DELETE', /^\/v1\/admin\/achievements\/([a-z0-9_]{1,40})$/, (req, [id]) => {
      const me = deps.admin(req);
      const a = or404(id);
      if (!a.custom) fail(400, 'built_in');
      if (store.holders(id, 1).length) fail(409, 'has_holders');
      registry.deleteCustom(id);
      db.log(me, 'ach_delete', id, a.name);
      return state();
    }],
    ['GET', /^\/v1\/admin\/achievements\/([a-z0-9_]{1,40})\/holders$/, (req, [id]) => {
      deps.admin(req);
      or404(id);
      return { holders: store.holders(id).map((h) => ({ id: h.uuid, handle: h.handle, name: h.name, at: h.at })) };
    }],
    // given by hand to players by @handle or Minecraft nick (paid like any unlock, once)
    ['POST', /^\/v1\/admin\/achievements\/([a-z0-9_]{1,40})\/grant$/, async (req, [id]) => {
      const me = deps.admin(req);
      const a = or404(id);
      if (a.group !== 'manual') fail(400, 'not_manual');
      if (a.enabled === false) fail(400, 'disabled');
      const { players } = await deps.body(req);
      if (!Array.isArray(players) || !players.length || players.length > MAX_GRANT) fail(400, 'bad_players');
      const granted: string[] = [], had: string[] = [], unknown: string[] = [];
      for (const q of players as unknown[]) {
        const p = typeof q === 'string' ? player(q) : undefined;
        if (!p) unknown.push(String(q).slice(0, 64));
        else if (achievements.give(p.uuid, id)) {
          granted.push(p.handle);
          db.log(me, 'ach_grant', p.handle, id);
        } else had.push(p.handle);
      }
      return { granted, had, unknown, holders: store.holders(id).map((h) => ({ id: h.uuid, handle: h.handle, name: h.name, at: h.at })) };
    }],
    // taken away; the sparks it paid (and its cosmetic) only when `clawback` (never below zero)
    ['POST', /^\/v1\/admin\/achievements\/([a-z0-9_]{1,40})\/revoke$/, async (req, [id]) => {
      const me = deps.admin(req);
      const a = or404(id);
      if (a.group !== 'manual') fail(400, 'not_manual');
      const { player: who, clawback } = await deps.body(req);
      const p = typeof who === 'string' ? player(who) : undefined;
      if (!p) fail(404, 'no_player');
      let taken = 0;
      inTransaction(db.sql, () => {
        if (!store.remove(p!.uuid, id)) fail(400, 'not_held');
        if (clawback === true) {
          const paid = (db.sql.prepare("SELECT amount FROM sparks_ledger WHERE uuid = ? AND reason = 'achievement' AND ref = ?").get(p!.uuid, id) as { amount: number } | undefined)?.amount ?? 0;
          taken = Math.min(paid, wallet.balance(p!.uuid));
          if (taken > 0) wallet.change(p!.uuid, -taken, 'admin', id, `Odebrano osiągnięcie „${a.name}”`, me);
          if (a.reward) db.revoke(p!.uuid, a.reward);
        }
      });
      db.log(me, 'ach_revoke', p!.handle, `${id}${clawback === true ? `, odebrano ${taken} Iskier${a.reward ? ' i nagrodę' : ''}` : ''}`);
      if (taken > 0) deps.push(p!.uuid, { type: 'wallet', balance: wallet.balance(p!.uuid), change: -taken, reason: 'admin', ref: id });
      return { taken, holders: store.holders(id).map((h) => ({ id: h.uuid, handle: h.handle, name: h.name, at: h.at })) };
    }],
    // the cosmetics tab: how each item can be got now, and its price
    ['GET', /^\/v1\/admin\/cosmetics\/obtain$/, (req) => {
      deps.admin(req);
      const settings = db.cosmeticSettings();
      const all = registry.all();
      return {
        items: Object.fromEntries(ITEMS.map((i) => [i.id, { ...howToGet(i, settings, all), price: wallet.price(i.id) ?? null, defaultPrice: i.price ?? null }])),
      };
    }],
  ];
}
