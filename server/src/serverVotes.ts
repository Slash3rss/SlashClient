import type http from 'node:http';
import type { Settings } from './settings.ts';

/**
 * Voting for a Minecraft server on the server list (lista.slash3rss.dev) from the launcher's
 * "Serwery", in one click and without a captcha: this server vouches for the player. Their
 * Minecraft name was verified by Mojang when they linked the account (/v1/auth/minecraft), and
 * the list's API (api.slash3rss.dev, POST /servers/:id/vote/slashclient) trusts this server's key
 * (the admin panel's serverList.voteKey, same as SLASHCLIENT_VOTE_KEY there) with that name and the
 * player's address. The list keeps its own rules: one vote per nick and per address in 24 hours.
 *
 * Without a key (or an address) voting here is off: /voted answers { enabled: false } and the
 * launcher opens the server's page on the list instead.
 */

export interface ServerVotesContext {
  settings: Settings;
  authed: (req: http.IncomingMessage) => string;
  /** Who is asking, for the limits (an IPv6 /64 is one). */
  clientIp: (req: http.IncomingMessage) => string;
  /** The voter's own address, which the server list checks its once-a-day rule against. */
  clientAddress?: (req: http.IncomingMessage) => string;
  /** The names of the Minecraft accounts linked to an account (verified by Mojang), in link order. */
  minecraftNames: (userId: string) => string[];
  limitVotes: (key: string) => void;
  limitChecks: (key: string) => void;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

/** A server on the list: its id (or address, the list takes both). */
const SERVER_ID = /^[\w.:-]{1,100}$/;
const NICK = /^\w{3,16}$/;
const DAY = 86_400_000;
/** How long an answer of /voted/:nick is kept (a vote here updates it at once). */
const CHECK_MS = 2 * 60_000;
const MAX_IDS = 100;
const MAX_CACHED = 20_000;

export function serverVoteRoutes(ctx: ServerVotesContext): [string, RegExp, Handler][] {
  const now = ctx.now ?? Date.now;
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const fail = ctx.fail;
  /** `${id}:${nick lower}` → when the list said, and the time of the vote (0: not in the last 24 h). */
  const checked = new Map<string, { at: number; votedAt: number }>();

  const config = () => {
    const api = ctx.settings.str('serverList.apiUrl').replace(/\/+$/, '');
    const key = ctx.settings.str('serverList.voteKey');
    return /^https?:\/\//.test(api) && key ? { api, key } : undefined;
  };

  /** The name to vote as: the one asked for when it is one of the account's, else the first linked. */
  function nickOf(userId: string, asked: unknown): string {
    const names = ctx.minecraftNames(userId).filter((n) => NICK.test(n));
    if (!names.length) fail(403, 'mc_not_linked');
    if (typeof asked !== 'string' || !asked) return names[0];
    const found = names.find((n) => n.toLowerCase() === asked.toLowerCase());
    if (!found) fail(403, 'mc_account_not_linked');
    return found!;
  }

  const cacheKey = (id: string, nick: string) => `${id}:${nick.toLowerCase()}`;
  function remember(id: string, nick: string, votedAt: number) {
    if (checked.size >= MAX_CACHED) checked.clear();
    checked.set(cacheKey(id, nick), { at: now(), votedAt });
  }

  /** Whether `nick` voted for `id` in the last 24 hours (the list's public /voted/:nick); null when the list did not answer. */
  async function votedAt(api: string, id: string, nick: string): Promise<number | null> {
    const kept = checked.get(cacheKey(id, nick));
    if (kept && now() - kept.at < CHECK_MS) return kept.votedAt && now() - kept.votedAt < DAY ? kept.votedAt : 0;
    try {
      const res = await fetchImpl(`${api}/servers/${encodeURIComponent(id)}/voted/${encodeURIComponent(nick)}`, { headers: { Accept: 'application/json', 'User-Agent': 'SlashClient-server' }, signal: AbortSignal.timeout(8_000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { voted?: boolean; votedAt?: string | null };
      const at = data.voted ? Date.parse(String(data.votedAt ?? '')) || now() : 0;
      remember(id, nick, at);
      return at;
    } catch {
      return null;
    }
  }

  const checkIds = (ids: unknown): string[] => {
    if (!Array.isArray(ids) || ids.length > MAX_IDS || !ids.every((id) => typeof id === 'string' && SERVER_ID.test(id))) fail(400, 'bad_request');
    return [...new Set(ids as string[])];
  };

  return [
    // { ids, nick? } → { enabled, nick, voted: { id: votedAt | 0 } } for the list's cards; without
    // a session (or a linked Minecraft account) only whether voting from the launcher is on
    ['POST', /^\/v1\/servers\/voted$/, async (req) => {
      const me = req.headers.authorization ? ctx.authed(req) : undefined;
      ctx.limitChecks(me ?? ctx.clientIp(req));
      const b = await ctx.body(req);
      const ids = checkIds(b.ids);
      const cfg = config();
      if (!cfg) return { enabled: false, nick: null, voted: {} };
      if (!me) return { enabled: true, nick: null, voted: {} };
      let nick: string;
      try {
        nick = nickOf(me, b.nick);
      } catch (err) {
        // not linked: the launcher says so on the button
        return { enabled: true, nick: null, linked: false, error: (err as { code?: string }).code ?? 'mc_not_linked', voted: {} };
      }
      const voted: Record<string, number> = {};
      // a few at a time, so a long list does not open a hundred connections to the list at once
      const queue = [...ids];
      await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          const at = await votedAt(cfg.api, id, nick);
          if (at !== null) voted[id] = at;
        }
      }));
      return { enabled: true, nick, linked: true, voted };
    }],

    // { nick? }: votes as the account's (verified) Minecraft name from the player's address
    ['POST', /^\/v1\/servers\/([\w.:-]{1,100})\/vote$/, async (req, [id]) => {
      const me = ctx.authed(req);
      ctx.limitVotes(me);
      const b = await ctx.body(req);
      const cfg = config();
      if (!cfg) fail(503, 'votes_unavailable');
      const nick = nickOf(me, b.nick);
      const ip = (ctx.clientAddress ?? ctx.clientIp)(req);
      if (!ip) fail(400, 'no_ip');
      let res: Response;
      try {
        res = await fetchImpl(`${cfg!.api}/servers/${encodeURIComponent(id)}/vote/slashclient`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'SlashClient-server', 'X-SlashClient-Key': cfg!.key },
          body: JSON.stringify({ nick, ip }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        console.error('lista serwerów: głos:', (err as Error).message);
        fail(502, 'list_failed');
      }
      let data: { code?: string; error?: string; votes?: number } = {};
      try {
        data = (await res!.json()) as typeof data;
      } catch {
        // an HTML page: the list does not know this endpoint yet
      }
      if (res!.ok) {
        remember(id, nick, now());
        return { ok: true, nick, votes: typeof data.votes === 'number' ? data.votes : null };
      }
      const code = data.code ?? '';
      if (code === 'already_voted_nick' || code === 'already_voted_ip') {
        if (code === 'already_voted_nick') remember(id, nick, now());
        fail(409, code === 'already_voted_ip' ? 'already_voted_ip' : 'already_voted');
      }
      if (code === 'not_found') fail(404, 'server_not_found');
      if (code === 'bad_nick') fail(400, 'bad_nick');
      // a wrong key, the endpoint off or not there: to the launcher voting here is off
      if (res!.status === 401 || res!.status === 503 || res!.status === 404) {
        console.error(`lista serwerów: głos odrzucony (${res!.status} ${code || data.error || ''}), sprawdź klucz i adres w panelu (Lista serwerów)`);
        fail(503, 'votes_unavailable');
      }
      console.error(`lista serwerów: głos: ${res!.status} ${data.error ?? ''}`);
      fail(502, 'list_failed');
    }],
  ];
}
