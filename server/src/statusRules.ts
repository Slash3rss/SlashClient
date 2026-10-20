import { createHash, randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { serverKey, serverRule } from './achievements.ts';

/**
 * Statuses from the tab list: per server, how SlashClient HUD reads the text a server puts over and
 * under the player list (e.g. SkyUp's "» S3 (Wyspy) «") and turns it into a short status friends see
 * next to the server ("Gra na SkyUp.pl · S3 (Wyspy)"), and what Discord Rich Presence shows there.
 * The admin keeps the rules (the Partnerzy tab); games and launchers ask GET /v1/status-rules (public,
 * with an ETag) and do the reading themselves, the server only keeps the short result in the presence.
 *
 * A rule's patterns run in the game (Java) and here (the admin's preview): only the part of regex both
 * understand the same way is accepted, and nothing that can backtrack for long (see `checkPattern`).
 */

export type Source = 'header' | 'footer';
export interface Extractor { source: Source; /** 1-based line; 0 = the whole text */ line: number; pattern: string }
export interface DiscordLook { details: string; state: string; largeImage: string; largeText: string; smallImage: string; smallText: string }
export interface StatusRule {
  id: string; server: string; name: string; enabled: boolean;
  /** Characters cut from both ends of every line (with spaces), e.g. SkyUp's "»« ". */
  strip: string;
  extractors: Extractor[];
  /** A value as the server writes it → as it is shown ("LOBBY" → "Lobby"). */
  map: Record<string, string>;
  /** The status from the values: "{sector}", "{mode} · {sector}". */
  template: string;
  discord: DiscordLook;
  updatedAt: number;
}

export const DETAIL_MAX = 48;
const PATTERN_MAX = 200;
const LINE_MAX = 256;
const NAME = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]{0,31})\}/g;
const EMPTY_DISCORD: DiscordLook = { details: '', state: '', largeImage: '', largeText: '', smallImage: '', smallText: '' };

/** SkyUp.pl as its tab list looks (26.3): "» SkyUP - AnyBlock «" over "» S0 (Spawn) «" or "» LOBBY «". AnyBlock is its only server, so only the sector is shown. */
export const SKYUP_RULE: Omit<StatusRule, 'id' | 'updatedAt'> = {
  server: 'skyup.pl', name: 'SkyUp.pl', enabled: true, strip: '»« ',
  extractors: [
    { source: 'header', line: 1, pattern: '^Sky[Uu][Pp] - (?<mode>[^»«]{1,32})$' },
    { source: 'header', line: 2, pattern: '^(?<sector>LOBBY|Lobby|S\\d{1,2}(?: \\([^()]{1,24}\\))?)$' },
  ],
  map: { LOBBY: 'Lobby' },
  template: '{sector}',
  discord: { ...EMPTY_DISCORD, details: 'Gra na {server}', state: '{sector}', largeText: 'SkyUp.pl' },
};

// ---------- checking what the admin typed ----------

export class RuleError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
const bad = (code: string): never => {
  throw new RuleError(code);
};

/**
 * A pattern both engines read alike and that cannot backtrack for long: short, escapes only of
 * punctuation or \d \w \s \b (and their capitals) \n \t \uXXXX, groups only (?: (?= (?! (?<= (?<! and
 * (?<name>, no backreferences, no nested classes or "&&", no group repeated more than once that holds a
 * quantifier or "|" ("(a+)+", "(a|ab)*"), and at most 3 unbounded quantifiers (* + {n,}).
 * Returns the named groups, in order.
 */
export function checkPattern(pattern: unknown): string[] {
  if (typeof pattern !== 'string' || !pattern || pattern.length > PATTERN_MAX) bad('bad_pattern_length');
  const p = pattern as string;
  const names: string[] = [];
  // per open group: whether something inside it repeats or branches
  const stack: boolean[] = [];
  // the group that just closed, when the next character may quantify it
  let closed: boolean | undefined;
  let inClass = false;
  let unbounded = 0;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    const prevClosed = closed;
    closed = undefined;
    if (c === '\\') {
      const n = p[i + 1];
      if (n === undefined) bad('bad_pattern_escape');
      if (n === 'u') {
        if (!/^[0-9a-fA-F]{4}$/.test(p.slice(i + 2, i + 6))) bad('bad_pattern_escape');
        i += 5;
      } else if (/[a-zA-Z0-9]/.test(n) && !'dDwWsSbBnt'.includes(n)) bad('bad_pattern_escape');
      else i++;
      continue;
    }
    if (inClass) {
      if (c === '[' || (c === '&' && p[i + 1] === '&')) bad('bad_pattern_class');
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      // "[]" and "[^]" mean different things in Java and JavaScript
      if (p[i + 1] === ']' || (p[i + 1] === '^' && p[i + 2] === ']')) bad('bad_pattern_class');
      inClass = true;
      continue;
    }
    if (c === '(') {
      if (p[i + 1] === '?') {
        const rest = p.slice(i + 2);
        const named = /^<([a-zA-Z][a-zA-Z0-9]{0,31})>/.exec(rest);
        if (named) {
          if (names.includes(named[1])) bad('bad_pattern_group');
          names.push(named[1]);
          i += 1 + named[0].length;
        } else if (/^(<=|<!)/.test(rest)) i += 3;
        else if (/^[:=!]/.test(rest)) i += 2;
        else bad('bad_pattern_group');
      }
      stack.push(false);
      continue;
    }
    if (c === ')') {
      if (!stack.length) bad('bad_pattern');
      const inner = stack.pop()!;
      if (inner && stack.length) stack[stack.length - 1] = true;
      closed = inner;
      continue;
    }
    if (c === '|') {
      if (stack.length) stack[stack.length - 1] = true;
      continue;
    }
    let q = '';
    if (c === '*' || c === '+' || c === '?') q = c;
    else if (c === '{') {
      const m = /^\{(\d{1,3})(,(\d{0,3}))?\}/.exec(p.slice(i));
      if (!m) bad('bad_pattern_brace');
      q = m![0];
    }
    if (!q) continue;
    const brace = /^\{(\d+)(,(\d*))?\}$/.exec(q);
    const open = q === '*' || q === '+' || (!!brace && brace[2] !== undefined && brace[3] === '');
    const many = q !== '?' && !(brace && (brace[2] === undefined ? Number(brace[1]) <= 1 : brace[3] !== '' && Number(brace[3]) <= 1));
    if (open && ++unbounded > 3) bad('bad_pattern_nested');
    // a repeated group that repeats or branches inside: the classic catastrophic backtracking
    if (prevClosed && many) bad('bad_pattern_nested');
    if (stack.length) stack[stack.length - 1] = true;
    i += q.length - 1;
    // a lazy "?" after a quantifier is fine; a possessive "+" is Java's only
    if (p[i + 1] === '+') bad('bad_pattern');
    if (p[i + 1] === '?') i++;
  }
  if (inClass || stack.length) bad('bad_pattern');
  try {
    new RegExp(p);
  } catch {
    bad('bad_pattern');
  }
  return names;
}

/** Printable, one line, at most `max` characters (code points). */
function cleanText(input: unknown, max: number, code: string): string {
  if (input === undefined || input === null) return '';
  if (typeof input !== 'string') bad(code);
  const s = (input as string).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, '').replace(/\s+/g, ' ').trim();
  if ([...s].length > max) bad(code);
  return s;
}

/** A Discord picture: an https address (Discord shows external pictures) or the app's asset key. */
function cleanImage(input: unknown): string {
  const s = cleanText(input, 256, 'bad_image');
  if (!s) return '';
  if (/^[a-z0-9_-]{1,64}$/i.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return bad('bad_image');
  }
  if (url.protocol !== 'https:' || url.username || url.password || /["'<>\s]/.test(s)) bad('bad_image');
  return s;
}

function cleanTemplate(input: unknown, max: number, code: string, known?: Set<string>): string {
  const s = cleanText(input, max, code);
  for (const m of s.matchAll(PLACEHOLDER)) if (known && !known.has(m[1])) bad(code);
  return s;
}

/** What the admin sent, checked and trimmed; throws RuleError with a code the panel explains. */
export function cleanRule(input: Record<string, unknown>, old?: StatusRule): Omit<StatusRule, 'id' | 'updatedAt'> {
  const server = input.server === undefined && old ? old.server : serverRule(input.server) ?? bad('bad_server');
  const name = input.name === undefined && old ? old.name : cleanText(input.name, 48, 'bad_name');
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : old?.enabled ?? true;
  const strip = input.strip === undefined && old ? old.strip : typeof input.strip === 'string' && input.strip.length <= 16 && !/[\p{Cc}]/u.test(input.strip) ? input.strip : input.strip === undefined ? '' : bad('bad_strip');

  const rawEx = input.extractors === undefined && old ? old.extractors : input.extractors;
  if (!Array.isArray(rawEx) || !rawEx.length || rawEx.length > 6) bad('bad_extractors');
  const groups = new Set<string>();
  const extractors = (rawEx as unknown[]).map((e) => {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    if (x.source !== 'header' && x.source !== 'footer') bad('bad_source');
    const line = Number(x.line ?? 0);
    if (!Number.isInteger(line) || line < 0 || line > 20) bad('bad_line');
    const names = checkPattern(x.pattern);
    if (!names.length) bad('bad_pattern_no_group');
    names.forEach((n) => groups.add(n));
    return { source: x.source as Source, line, pattern: x.pattern as string };
  });

  const rawMap = input.map === undefined && old ? old.map : input.map ?? {};
  const pairs: [unknown, unknown][] = Array.isArray(rawMap) ? rawMap.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [undefined, undefined])) : typeof rawMap === 'object' && rawMap ? Object.entries(rawMap) : bad('bad_map');
  if (pairs.length > 50) bad('bad_map');
  const map: Record<string, string> = {};
  for (const [k, v] of pairs) {
    const key = cleanText(k, 40, 'bad_map');
    if (!key) continue;
    map[key] = cleanText(v, 40, 'bad_map');
  }

  const template = input.template === undefined && old ? old.template : cleanTemplate(input.template, 64, 'bad_template', groups);
  if (!template || ![...template.matchAll(PLACEHOLDER)].length) bad('bad_template');
  for (const m of template.matchAll(PLACEHOLDER)) if (!groups.has(m[1])) bad('bad_template');

  const d = (input.discord === undefined && old ? old.discord : input.discord ?? {}) as Record<string, unknown>;
  if (typeof d !== 'object' || !d) bad('bad_discord');
  const discordKnown = new Set([...groups, 'server', 'detail']);
  const discord: DiscordLook = {
    details: cleanTemplate(d.details, 128, 'bad_discord_text', discordKnown),
    state: cleanTemplate(d.state, 128, 'bad_discord_text', discordKnown),
    largeImage: cleanImage(d.largeImage),
    largeText: cleanText(d.largeText, 128, 'bad_discord_text'),
    smallImage: cleanImage(d.smallImage),
    smallText: cleanText(d.smallText, 128, 'bad_discord_text'),
  };
  return { server, name, enabled, strip, extractors, map, template, discord };
}

/** The look used where no rule matches (or a rule leaves a picture out). */
export function cleanDefaults(input: Record<string, unknown>): Omit<DiscordLook, 'details' | 'state'> {
  return { largeImage: cleanImage(input.largeImage), largeText: cleanText(input.largeText, 128, 'bad_discord_text'), smallImage: cleanImage(input.smallImage), smallText: cleanText(input.smallText, 128, 'bad_discord_text') };
}

// ---------- reading a tab list (the admin's preview, and the tests; the game does the same in Java) ----------

/** "§aSkyUP" → "SkyUP": the game's formatting codes out. */
export const stripFormatting = (s: string) => s.replace(/§./g, '');

function trimLine(line: string, strip: string): string {
  let s = line.trim();
  const cut = new Set([...strip, ' ', '\t']);
  const chars = [...s];
  let a = 0, b = chars.length;
  while (a < b && (cut.has(chars[a]) || /\s/.test(chars[a]))) a++;
  while (b > a && (cut.has(chars[b - 1]) || /\s/.test(chars[b - 1]))) b--;
  s = chars.slice(a, b).join('');
  return s;
}

/** The text one extractor reads: a line of the header or footer (cleaned), or all of it. */
export function sourceText(text: string, line: number, strip: string): string | undefined {
  const lines = stripFormatting(text).split(/\r?\n/).map((l) => trimLine(l, strip).slice(0, LINE_MAX));
  if (line === 0) return lines.join('\n');
  return lines[line - 1];
}

/** A status as friends get it: printable, one line, short. */
export function sanitizeDetail(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = stripFormatting(input).replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\u2028\u2029]/gu, '').replace(/\s+/g, ' ').trim();
  const out = [...s].slice(0, DETAIL_MAX).join('').trim();
  return out || undefined;
}

/** `{name}` from the values; '' when one is missing (a half status says nothing). */
export function render(template: string, values: Record<string, string>): string {
  let missing = false;
  const out = template.replace(PLACEHOLDER, (_, n: string) => {
    const v = values[n];
    if (!v) missing = true;
    return v ?? '';
  });
  return missing ? '' : out;
}

export interface Reading { detail?: string; values: Record<string, string> }

/** What a rule makes of a tab list's header and footer. */
export function evaluate(rule: Pick<StatusRule, 'strip' | 'extractors' | 'map' | 'template'>, header: string, footer: string): Reading {
  const values: Record<string, string> = {};
  const lowerMap = new Map(Object.entries(rule.map).map(([k, v]) => [k.toLowerCase(), v]));
  for (const x of rule.extractors) {
    const text = sourceText(x.source === 'header' ? header : footer, x.line, rule.strip);
    if (text === undefined) continue;
    let m: RegExpExecArray | null;
    try {
      m = new RegExp(x.pattern).exec(text);
    } catch {
      continue;
    }
    for (const [k, v] of Object.entries(m?.groups ?? {})) {
      if (v === undefined || values[k]) continue;
      const raw = v.trim();
      const mapped = rule.map[raw] ?? lowerMap.get(raw.toLowerCase()) ?? raw;
      if (mapped) values[k] = mapped;
    }
  }
  return { detail: sanitizeDetail(render(rule.template, values)), values };
}

/** Whether an address ("play.SkyUp.pl:25565") is the rule's server or one of its subdomains. */
export function matches(rule: string, address: string | undefined): boolean {
  const key = serverKey(address);
  if (!key) return false;
  if (rule.includes(':')) return key === rule || key.endsWith(`.${rule}`);
  const host = key.replace(/:\d+$/, '');
  return host === rule || host.endsWith(`.${rule}`);
}

// ---------- the tables ----------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS status_rules (id TEXT PRIMARY KEY, server TEXT NOT NULL UNIQUE, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS status_defaults (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at INTEGER NOT NULL);`;

type Row = { id: string; server: string; data: string; updated_at: number };

export class StatusRuleStore {
  private readonly sql: DatabaseSync;
  constructor(sql: DatabaseSync) {
    this.sql = sql;
    const existed = !!sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'status_rules'").get();
    sql.exec(SCHEMA);
    // SkyUp's rule comes once, with the table; the admin may change or remove it for good
    if (!existed) this.save({ ...SKYUP_RULE, id: randomBytes(6).toString('hex'), updatedAt: Date.now() });
  }

  all(): StatusRule[] {
    return (this.sql.prepare('SELECT * FROM status_rules ORDER BY server').all() as Row[]).map((r) => ({ ...EMPTY_RULE, ...JSON.parse(r.data), id: r.id, server: r.server, updatedAt: r.updated_at }));
  }

  get(id: string): StatusRule | undefined {
    return this.all().find((r) => r.id === id);
  }

  save(r: StatusRule) {
    const { id, server, updatedAt, ...data } = r;
    this.sql.prepare('INSERT INTO status_rules (id, server, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET server = excluded.server, data = excluded.data, updated_at = excluded.updated_at')
      .run(id, server, JSON.stringify(data), updatedAt);
  }

  remove(id: string) {
    this.sql.prepare('DELETE FROM status_rules WHERE id = ?').run(id);
  }

  defaults(): Omit<DiscordLook, 'details' | 'state'> {
    const r = this.sql.prepare('SELECT data FROM status_defaults WHERE id = 1').get() as { data: string } | undefined;
    return { largeImage: '', largeText: '', smallImage: '', smallText: '', ...(r ? JSON.parse(r.data) : {}) };
  }

  setDefaults(d: Omit<DiscordLook, 'details' | 'state'>) {
    this.sql.prepare('INSERT INTO status_defaults (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(JSON.stringify(d), Date.now());
  }
}
const EMPTY_RULE = { name: '', enabled: true, strip: '', extractors: [], map: {}, template: '', discord: EMPTY_DISCORD };

// ---------- routes ----------

export interface StatusRuleContext {
  sql: DatabaseSync;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fail: (status: number, code: string) => never;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function createStatusRules(ctx: StatusRuleContext) {
  const store = new StatusRuleStore(ctx.sql);
  let cached: { body: string; etag: string } | undefined;
  const changed = () => {
    cached = undefined;
  };

  /** What games and launchers get: the enabled rules without ids, and the default Discord look. */
  function published() {
    if (cached) return cached;
    const rules = store.all().filter((r) => r.enabled).map(({ server, name, strip, extractors, map, template, discord }) => ({ server, name, strip, extractors, map, template, discord }));
    const payload = { rules, discord: store.defaults() };
    const version = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
    cached = { body: JSON.stringify({ version, ...payload }), etag: `"${version}"` };
    return cached;
  }

  /** The rule for a server address (the first by name when several match: the longest one, the most precise). */
  function ruleFor(address: string | undefined): StatusRule | undefined {
    return store.all().filter((r) => r.enabled && matches(r.server, address)).sort((a, b) => b.server.length - a.server.length)[0];
  }

  /** GET /v1/status-rules with an ETag: a game asks every few minutes and mostly gets 304. */
  function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean {
    if (req.method !== 'GET' || url.pathname !== '/v1/status-rules') return false;
    const { body, etag } = published();
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=300' }).end();
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ETag: etag, 'Cache-Control': 'public, max-age=300' });
    res.end(body);
    return true;
  }

  const attempt = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof RuleError) ctx.fail(400, err.code);
      throw err;
    }
  };
  const list = () => ({ rules: store.all(), defaults: store.defaults() });
  const taken = (server: string, id?: string) => store.all().some((r) => r.server === server && r.id !== id);

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/admin\/status-rules$/, (req) => {
      ctx.admin(req);
      return list();
    }],
    ['POST', /^\/v1\/admin\/status-rules$/, async (req) => {
      const me = ctx.admin(req);
      const input = await ctx.body(req);
      const rule = attempt(() => cleanRule(input));
      if (taken(rule.server)) ctx.fail(409, 'exists');
      store.save({ ...rule, id: randomBytes(6).toString('hex'), updatedAt: Date.now() });
      changed();
      ctx.audit(me, 'partner_status_add', rule.server);
      return list();
    }],
    ['POST', /^\/v1\/admin\/status-rules\/(\w{1,32})$/, async (req, [id]) => {
      const me = ctx.admin(req);
      const old = store.get(id) ?? ctx.fail(404, 'not_found');
      const input = await ctx.body(req);
      const rule = attempt(() => cleanRule(input, old));
      if (taken(rule.server, id)) ctx.fail(409, 'exists');
      store.save({ ...rule, id, updatedAt: Date.now() });
      changed();
      ctx.audit(me, 'partner_status_edit', rule.server);
      return list();
    }],
    ['DELETE', /^\/v1\/admin\/status-rules\/(\w{1,32})$/, (req, [id]) => {
      const me = ctx.admin(req);
      const old = store.get(id) ?? ctx.fail(404, 'not_found');
      store.remove(id);
      changed();
      ctx.audit(me, 'partner_status_remove', old.server);
      return list();
    }],
    ['POST', /^\/v1\/admin\/status-defaults$/, async (req) => {
      const me = ctx.admin(req);
      const input = await ctx.body(req);
      store.setDefaults(attempt(() => cleanDefaults(input)));
      changed();
      ctx.audit(me, 'partner_status_defaults', 'Discord');
      return list();
    }],
    // the admin's "Sprawdź": a rule (saved or not) against a header and footer typed in
    ['POST', /^\/v1\/admin\/status-preview$/, async (req) => {
      ctx.admin(req);
      const input = await ctx.body(req);
      const rule = attempt(() => cleanRule((input.rule ?? {}) as Record<string, unknown>));
      const header = typeof input.header === 'string' ? input.header.slice(0, 1024) : '';
      const footer = typeof input.footer === 'string' ? input.footer.slice(0, 1024) : '';
      const reading = evaluate(rule, header, footer);
      const values = { ...reading.values, server: rule.name || rule.server, ...(reading.detail ? { detail: reading.detail } : {}) };
      return { detail: reading.detail ?? null, values: reading.values, discord: { details: render(rule.discord.details, values), state: render(rule.discord.state, values) } };
    }],
  ];

  return {
    routes, serve, store,
    /** The server's display name for a friend's status ("SkyUp.pl"), when a rule knows it. */
    nameFor: (address: string | undefined) => ruleFor(address)?.name || undefined,
  };
}
