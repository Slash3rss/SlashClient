import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { RankUser } from './ranks.ts';
import type { SettingDef, Settings } from './settings.ts';

/**
 * SlashClient ranks as roles on the owner's Discord server. An admin picks a Discord role for a rank
 * in the panel ("Rangi"); a player whose SlashClient account has a Discord login gets the roles of the
 * ranks they hold, and loses them when the rank goes or the Discord login is unlinked. Only roles that
 * are picked for some rank are ever touched: whatever else a member has on the server stays as it is.
 *
 * The bot itself runs elsewhere; this only uses its token for Discord's REST API, one request at a
 * time (a queue), waiting when Discord says so (429 with retry_after). A full pass over everyone runs
 * every few minutes, so players who join the Discord server later, ranks that come by themselves
 * (supporters, admins) and roles someone changed by hand on Discord come right in the end.
 */

export const DISCORD_ROLE_SETTING_DEFS: SettingDef[] = ([
  { key: 'discordRoles.enabled', label: 'Role na Discordzie za rangi', labelEn: 'Discord roles for ranks',
    description: 'Gracze z połączonym kontem Discord dostają na serwerze Discord role przypisane do ich rang (przypisania w zakładce „Rangi”). Wyłączone: bot niczego nie zmienia.',
    descriptionEn: 'Players with a linked Discord account get the Discord roles picked for their ranks (picked in "Ranks"). Off: the bot changes nothing.', type: 'bool', default: false },
  { key: 'discordRoles.guildId', label: 'ID serwera Discord', labelEn: 'Discord server ID',
    description: 'Prawy klik na serwer w Discordzie → „Kopiuj ID serwera” (tryb dewelopera). Bot musi być na tym serwerze.',
    descriptionEn: 'Right-click the server in Discord → "Copy Server ID" (developer mode). The bot has to be on that server.', type: 'string', default: '', maxLength: 20 },
  { key: 'discordRoles.botToken', label: 'Token bota Discord', labelEn: 'Discord bot token',
    description: 'Token bota z discord.com/developers (Bot → Reset Token). Bot potrzebuje uprawnienia „Zarządzanie rolami”, a jego rola musi być nad przypisanymi rolami. Zapisany zaszyfrowany, nigdy nie wraca do panelu.',
    descriptionEn: 'The bot\'s token from discord.com/developers (Bot → Reset Token). The bot needs "Manage Roles", and its role has to be above the roles picked. Stored sealed, never sent back to the panel.', type: 'secret', default: '', maxLength: 200 },
  { key: 'discordRoles.syncMinutes', label: 'Pełna synchronizacja ról co', labelEn: 'Full role sync every',
    description: 'Co ile minut serwer sprawdza wszystkich graczy z połączonym Discordem (łapie też tych, którzy weszli na serwer Discord później). Zmiany rang i połączeń idą od razu.',
    descriptionEn: 'How often the server checks every player with a linked Discord (also catches those who joined the Discord server later). Rank and link changes go at once.', type: 'duration', default: 10, min: 2, max: 1440, unit: 'min' },
] as Omit<SettingDef, 'category'>[]).map((d) => ({ ...d, category: 'discord' }));

const SNOWFLAKE = /^\d{17,20}$/;
const API = 'https://discord.com/api/v10';
/** Longest wait Discord may ask for that is still waited out; past it the pass stops and tries next time. */
const MAX_WAIT_MS = 60_000;
const TRIES = 5;

export interface DiscordRoleDeps {
  sql: DatabaseSync;
  settings: Settings;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  user: (uuid: string) => (RankUser & { banned?: boolean }) | undefined;
  /** The ranks a player holds now (ranks.ts's held: given and automatic, enabled ones). */
  held: (user: RankUser) => { id: string }[];
  /** Whether a rank exists (a mapping of a deleted rank is cleaned up). */
  rankExists: (id: string) => boolean;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  fail: (status: number, code: string) => never;
  fetchImpl?: typeof fetch;
  /** Tests: Discord elsewhere, no timers, a quick wait. */
  apiBase?: string;
  timers?: boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** A request Discord refused, with what the panel shows. */
export class DiscordError extends Error {
  readonly status: number;
  readonly code: number;
  constructor(status: number, code: number, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RunStats { at: number; finishedAt: number; full: boolean; checked: number; onServer: number; added: number; removed: number; errors: number }
interface Member { roles: string[] }

export function createDiscordRoles(deps: DiscordRoleDeps) {
  const { sql, settings, fail } = deps;
  const now = deps.now ?? Date.now;
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref?.()));
  const base = deps.apiBase ?? API;

  sql.exec(`
CREATE TABLE IF NOT EXISTS discord_rank_roles (rank TEXT PRIMARY KEY, role_id TEXT NOT NULL, role_name TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS discord_retired_roles (role_id TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS discord_role_members (
  discord_id TEXT PRIMARY KEY, uuid TEXT NOT NULL DEFAULT '', on_server INTEGER NOT NULL DEFAULT 0, target TEXT NOT NULL DEFAULT '', checked_at INTEGER);
`);
  // discord_rank_roles has no link to ranks on purpose: a deleted rank's role is still known, so its holders lose it

  const guildId = () => settings.str('discordRoles.guildId').trim();
  const token = () => settings.str('discordRoles.botToken');
  /** Why nothing is done now ('' when it can run). */
  function blocked(): string {
    if (!settings.bool('discordRoles.enabled')) return 'disabled';
    if (!token()) return 'no_token';
    if (!SNOWFLAKE.test(guildId())) return 'no_guild';
    return '';
  }

  let lastSync: RunStats | null = null;
  let lastPlayer: RunStats | null = null;
  let lastError: { at: number; text: string } | null = null;
  const noteError = (text: string) => {
    lastError = { at: now(), text };
    console.error('role Discorda:', text);
  };

  // ---------- Discord's REST API, one request at a time ----------

  /** Not before this moment (Discord said the bucket is empty). */
  let quietUntil = 0;
  async function discord(method: string, path: string, reason?: string): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      const wait = quietUntil - now();
      if (wait > 0) await sleep(Math.min(wait, MAX_WAIT_MS));
      let res: Response;
      try {
        res = await doFetch(`${base}${path}`, {
          method,
          headers: {
            Authorization: `Bot ${token()}`, 'User-Agent': 'DiscordBot (https://slashclient.pl, 1.0)',
            ...(reason ? { 'X-Audit-Log-Reason': encodeURIComponent(reason) } : {}),
          },
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        throw new DiscordError(0, 0, `Discord nie odpowiada (${(err as Error).name === 'TimeoutError' ? 'minął czas' : (err as Error).message}).`);
      }
      // the bucket ran out: the next request waits until it fills again
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        const after = Number(res.headers.get('x-ratelimit-reset-after'));
        if (Number.isFinite(after) && after > 0) quietUntil = now() + Math.min(after * 1000, MAX_WAIT_MS);
      }
      const data = (await res.json().catch(() => ({}))) as { retry_after?: number; code?: number; message?: string };
      if (res.status === 429) {
        const ms = Math.ceil((Number(data.retry_after ?? res.headers.get('retry-after')) || 1) * 1000);
        if (attempt >= TRIES || ms > MAX_WAIT_MS) throw new DiscordError(429, 0, 'Discord ogranicza liczbę zapytań (429); spróbuję przy następnej synchronizacji.');
        quietUntil = now() + ms;
        continue;
      }
      if (res.status >= 500 && attempt < 2) {
        await sleep(1000);
        continue;
      }
      if (!res.ok) throw new DiscordError(res.status, Number(data.code) || 0, data.message ?? `HTTP ${res.status}`);
      return data;
    }
  }

  /** What the panel shows for a refusal, `role` being the role it was about. */
  function explain(err: unknown, role?: string): string {
    if (!(err instanceof DiscordError)) return `Błąd: ${(err as Error).message}`;
    if (err.status === 401) return 'Discord nie przyjmuje tokenu bota (401): wpisz nowy token w Ustawienia → Discord.';
    if (err.status === 403 && role) return `Bot nie może zmienić roli „${roleName(role)}” (Discord odpowiada 403): rola bota musi być nad przypisaną rolą w Ustawieniach serwera → Role, a bot musi mieć „Zarządzanie rolami”.`;
    if (err.status === 403) return 'Bot nie ma dostępu do serwera Discord (403): sprawdź ID serwera i czy bot jest na serwerze.';
    if (err.code === 10011) return `Rola „${role ? roleName(role) : '?'}” nie istnieje już na serwerze Discord: wybierz inną przy randze.`;
    if (err.code === 10004) return 'Nie ma takiego serwera Discord albo bota na nim nie ma: sprawdź ID serwera.';
    if (err.status === 0 || err.status === 429) return err.message;
    return `Discord odpowiada ${err.status}: ${err.message}`;
  }

  // ---------- who should have what ----------

  const mappings = () => sql.prepare('SELECT rank, role_id AS roleId, role_name AS roleName FROM discord_rank_roles').all() as { rank: string; roleId: string; roleName: string }[];
  const roleName = (id: string) => mappings().find((m) => m.roleId === id)?.roleName || id;
  /** Every role this may add or take: the ones picked for ranks, and ones picked before (until a full pass took them). */
  function managed(): Set<string> {
    const out = new Set(mappings().map((m) => m.roleId));
    for (const r of sql.prepare('SELECT role_id FROM discord_retired_roles').all() as { role_id: string }[]) out.add(r.role_id);
    return out;
  }
  /** The roles a SlashClient account should have: those of its ranks (none for a banned or deleted one). */
  function targetOf(uuid: string): string[] {
    const u = uuid ? deps.user(uuid) : undefined;
    if (!u || u.banned) return [];
    const byRank = new Map(mappings().filter((m) => deps.rankExists(m.rank)).map((m) => [m.rank, m.roleId]));
    return [...new Set(deps.held(u).map((h) => byRank.get(h.id)).filter((r): r is string => !!r))].sort();
  }
  const ownerOf = (discordId: string) => (sql.prepare("SELECT uuid FROM identities WHERE provider = 'discord' AND subject = ?").get(discordId) as { uuid: string } | undefined)?.uuid ?? '';
  const linkedIds = () => (sql.prepare("SELECT subject FROM identities WHERE provider = 'discord'").all() as { subject: string }[]).map((r) => r.subject);
  const trackedIds = () => (sql.prepare('SELECT discord_id FROM discord_role_members').all() as { discord_id: string }[]).map((r) => r.discord_id);
  const tracked = (id: string) => sql.prepare('SELECT uuid, on_server AS onServer, target, checked_at AS checkedAt FROM discord_role_members WHERE discord_id = ?').get(id) as
    { uuid: string; onServer: number; target: string; checkedAt: number | null } | undefined;
  /** Remembered, so a login unlinked anywhere (or an account deleted) still loses its roles. */
  const track = (id: string, uuid: string) => sql.prepare(`INSERT INTO discord_role_members (discord_id, uuid) VALUES (?, ?)
    ON CONFLICT (discord_id) DO UPDATE SET uuid = CASE WHEN excluded.uuid != '' THEN excluded.uuid ELSE discord_role_members.uuid END`).run(id, uuid);

  /** Puts one member's picked roles right; `member` undefined: not on the server. */
  async function reconcile(id: string, member: Member | undefined, stats: RunStats, all = managed()) {
    stats.checked++;
    const errorsBefore = stats.errors;
    const owner = ownerOf(id);
    const target = targetOf(owner);
    if (member) {
      stats.onServer++;
      const has = new Set(member.roles);
      const changes = [
        ...target.filter((r) => !has.has(r)).map((role) => ['PUT', role] as const),
        ...member.roles.filter((r) => all.has(r) && !target.includes(r)).map((role) => ['DELETE', role] as const),
      ];
      for (const [method, role] of changes) {
        try {
          await discord(method, `/guilds/${guildId()}/members/${id}/roles/${role}`, method === 'PUT' ? 'SlashClient: ranga gracza' : 'SlashClient: gracz nie ma już rangi');
          if (method === 'PUT') stats.added++;
          else stats.removed++;
        } catch (err) {
          // a member who left meanwhile is not an error
          if (err instanceof DiscordError && err.code === 10007) break;
          stats.errors++;
          noteError(explain(err, role));
          if (err instanceof DiscordError && (err.status === 401 || err.status === 429)) throw err;
        }
      }
    }
    // an unlinked login whose roles are gone: nothing more to remember about it (kept while Discord refused something)
    if (!owner && stats.errors === errorsBefore) sql.prepare('DELETE FROM discord_role_members WHERE discord_id = ?').run(id);
    else {
      track(id, owner);
      sql.prepare('UPDATE discord_role_members SET on_server = ?, target = ?, checked_at = ? WHERE discord_id = ?')
        .run(member ? 1 : 0, stats.errors === errorsBefore ? target.join(',') : '', now(), id);
    }
  }

  /** One member, asked for on their own; 404: not on the server. */
  async function member(id: string): Promise<Member | undefined> {
    try {
      return (await discord('GET', `/guilds/${guildId()}/members/${id}`)) as Member;
    } catch (err) {
      if (err instanceof DiscordError && err.code === 10007) return undefined;
      throw err;
    }
  }

  const fresh = (full: boolean): RunStats => ({ at: now(), finishedAt: 0, full, checked: 0, onServer: 0, added: 0, removed: 0, errors: 0 });

  async function syncOne(id: string) {
    const stats = fresh(false);
    try {
      await reconcile(id, await member(id), stats);
    } catch (err) {
      stats.errors++;
      noteError(explain(err));
    }
    stats.finishedAt = now();
    lastPlayer = stats;
  }

  /** Everyone linked or remembered: the server's member list page by page (or one by one when the bot may not list). */
  async function syncAll() {
    const stats = fresh(true);
    try {
      const ids = new Set([...linkedIds(), ...trackedIds()]);
      const found = new Map<string, Member>();
      let listed = true;
      try {
        for (let after = '0'; ;) {
          const page = (await discord('GET', `/guilds/${guildId()}/members?limit=1000&after=${after}`)) as { user: { id: string }; roles: string[] }[];
          for (const m of page) if (ids.has(m.user.id)) found.set(m.user.id, { roles: m.roles });
          if (page.length < 1000) break;
          after = page[page.length - 1].user.id;
        }
      } catch (err) {
        // without the Server Members intent Discord refuses the list: each member is asked for instead
        if (!(err instanceof DiscordError) || err.status !== 403) throw err;
        listed = false;
      }
      const all = managed();
      for (const id of ids) await reconcile(id, listed ? found.get(id) : await member(id), stats, all);
      // a pass with nothing refused: the roles no rank has any more are forgotten
      if (!stats.errors) {
        sql.prepare('DELETE FROM discord_retired_roles WHERE at <= ?').run(stats.at);
        for (const m of mappings()) if (!deps.rankExists(m.rank)) sql.prepare('DELETE FROM discord_rank_roles WHERE rank = ?').run(m.rank);
        lastError = null;
      }
    } catch (err) {
      stats.errors++;
      noteError(explain(err));
    }
    stats.finishedAt = now();
    lastSync = stats;
  }

  // ---------- the queue ----------

  const pending = new Set<string>();
  let fullPending = false;
  let running: Promise<void> | undefined;
  function kick() {
    running ??= (async () => {
      try {
        while (fullPending || pending.size) {
          if (blocked()) {
            pending.clear();
            fullPending = false;
            break;
          }
          if (fullPending) {
            fullPending = false;
            // a full pass covers whoever was waiting
            pending.clear();
            await syncAll();
          } else {
            const id = pending.values().next().value as string;
            pending.delete(id);
            await syncOne(id);
          }
        }
      } catch (err) {
        noteError(`Błąd: ${(err as Error).message}`);
      } finally {
        running = undefined;
      }
    })();
    return running;
  }

  /** A player's ranks or logins may have changed: their Discord accounts (linked now or before) are checked, when their roles should differ. */
  function player(uuid: string) {
    if (blocked()) return;
    try {
      const linked = (sql.prepare("SELECT subject FROM identities WHERE provider = 'discord' AND uuid = ?").all(uuid) as { subject: string }[]).map((r) => r.subject);
      const before = (sql.prepare('SELECT discord_id FROM discord_role_members WHERE uuid = ?').all(uuid) as { discord_id: string }[]).map((r) => r.discord_id);
      const target = targetOf(uuid).join(',');
      for (const id of new Set([...linked, ...before])) {
        const t = tracked(id);
        const owner = linked.includes(id) ? uuid : '';
        // nothing new for this one (cosmetics change often; the full pass catches the rest)
        if (owner && t?.checkedAt && t.uuid === uuid && t.target === target) continue;
        if (owner) track(id, uuid);
        pending.add(id);
      }
      if (pending.size) void kick();
    } catch (err) {
      noteError(`Błąd: ${(err as Error).message}`);
    }
  }

  /** Every member again (the timer, the panel's button, a changed pick). */
  function syncNow() {
    if (blocked()) return undefined;
    fullPending = true;
    return kick();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (ms: number) => {
    if (deps.timers === false) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void syncNow();
      schedule(settings.num('discordRoles.syncMinutes') * 60_000);
    }, ms);
    timer.unref?.();
  };
  // the first pass soon after a start, then every few minutes
  schedule(20_000);
  settings.onChange((changes) => {
    if (changes.some((c) => c.key.startsWith('discordRoles.'))) schedule(2_000);
  });

  // ---------- the admin panel ----------

  async function roles() {
    const g = guildId();
    const list = (await discord('GET', `/guilds/${g}/roles`)) as { id: string; name: string; color: number; position: number; managed: boolean }[];
    // the bot's highest role: roles above it cannot be given
    let botTop = -1;
    try {
      const me = (await discord('GET', '/users/@me')) as { id: string };
      const mine = new Set(((await discord('GET', `/guilds/${g}/members/${me.id}`)) as Member).roles);
      botTop = Math.max(-1, ...list.filter((r) => mine.has(r.id)).map((r) => r.position));
    } catch {
      // only the hint is lost
    }
    return list.filter((r) => r.id !== g && !r.managed).sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '', ...(botTop >= 0 ? { assignable: r.position < botTop } : {}) }));
  }

  function stats() {
    const one = (q: string) => Number((sql.prepare(q).get() as { n: number }).n);
    return {
      linkedPlayers: one("SELECT COUNT(DISTINCT uuid) AS n FROM identities WHERE provider = 'discord'"),
      linkedAccounts: one("SELECT COUNT(*) AS n FROM identities WHERE provider = 'discord'"),
      onServer: one("SELECT COUNT(*) AS n FROM discord_role_members m JOIN identities i ON i.provider = 'discord' AND i.subject = m.discord_id WHERE m.on_server = 1"),
    };
  }

  async function view() {
    const why = blocked();
    let list: Awaited<ReturnType<typeof roles>> | undefined;
    let rolesError = '';
    if (!why) {
      try {
        list = await roles();
      } catch (err) {
        rolesError = explain(err);
      }
    }
    return {
      blocked: why, guildId: guildId(), mappings: Object.fromEntries(mappings().map((m) => [m.rank, { roleId: m.roleId, roleName: m.roleName }])),
      roles: list, rolesError, stats: stats(), lastSync, lastPlayer, lastError, running: !!running,
    };
  }

  const routes: [string, RegExp, (req: http.IncomingMessage, params: string[]) => Promise<unknown> | unknown][] = [
    ['GET', /^\/v1\/admin\/discord-roles$/, (req) => {
      deps.admin(req);
      return view();
    }],
    // { roleId: '' (none) | a role's id, roleName? }: the Discord role for a rank
    ['POST', /^\/v1\/admin\/discord-roles\/ranks\/([\w-]+)$/, async (req, [rank]) => {
      const me = deps.admin(req);
      if (!deps.rankExists(rank)) fail(404, 'not_found');
      const { roleId, roleName } = await deps.body(req);
      const id = typeof roleId === 'string' ? roleId.trim() : '';
      if (id && (!SNOWFLAKE.test(id) || id === guildId())) fail(400, 'bad_role');
      const name = typeof roleName === 'string' ? roleName.trim().slice(0, 100) : '';
      const before = mappings().find((m) => m.rank === rank);
      if (before?.roleId !== id) {
        if (id) sql.prepare(`INSERT INTO discord_rank_roles (rank, role_id, role_name, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (rank) DO UPDATE SET role_id = excluded.role_id, role_name = excluded.role_name, updated_at = excluded.updated_at`).run(rank, id, name, now());
        else sql.prepare('DELETE FROM discord_rank_roles WHERE rank = ?').run(rank);
        // the old role is still taken from those who no longer should have it, on the next full pass
        if (before) sql.prepare('INSERT OR REPLACE INTO discord_retired_roles (role_id, at) VALUES (?, ?)').run(before.roleId, now());
        deps.audit(me, 'discord_role', rank, id ? `${name || id}` : '—');
        void syncNow();
      } else if (id && name) sql.prepare('UPDATE discord_rank_roles SET role_name = ? WHERE rank = ?').run(name, rank);
      return view();
    }],
    ['POST', /^\/v1\/admin\/discord-roles\/sync$/, async (req) => {
      const me = deps.admin(req);
      const why = blocked();
      if (why) fail(400, `discord_${why}`);
      deps.audit(me, 'discord_sync', 'Discord');
      // the answer waits for the pass (a few seconds), so the panel shows its numbers
      await Promise.race([syncNow(), sleep(15_000)]);
      return view();
    }],
  ];

  return {
    routes, player, syncNow,
    /** For tests: waits until the queue is empty. */
    idle: async () => {
      while (running) await running;
    },
    close: () => clearTimeout(timer),
  };
}

export type DiscordRoles = ReturnType<typeof createDiscordRoles>;
