import { createHash, randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { serverKey, serverRule } from './achievements.ts';

/**
 * Statuses from the tab list: per server, how SlashClient HUD reads the text a server puts over and
 * under the player list (e.g. SkyUp's "» S3 (Wyspy) «") and turns it into a short status friends see
 * next to the server ("Gra na SkyUp.pl · S3 (Wyspy)"), and what Discord Rich Presence shows there.
 * A rule may also read the boss bar's titles (SkyUp's "Dungeon poz. 3") and put a small picture on
 * Discord while a value is known (the dungeon's gate with "Dungeon poz. 3").
 * The admin keeps the rules (the Partnerzy tab); games and launchers ask GET /v1/status-rules (public,
 * with an ETag) and do the reading themselves, the server only keeps the short result in the presence.
 *
 * A rule's patterns run in the game (Java) and here (the admin's preview): only the part of regex both
 * understand the same way is accepted, and nothing that can backtrack for long (see `checkPattern`).
 */

export type Source = 'header' | 'footer' | 'bossbar';
/** `bossbar`: the titles of the boss bars on screen, one per line (games before 0.9.73 read the header there, where it matches nothing). */
export interface Extractor { source: Source; /** 1-based line; 0 = the whole text */ line: number; pattern: string }
/**
 * `badge*`: a small picture shown instead of `smallImage` while the value `badgeWhen` is known (in a
 * dungeon), with `badgeText` made of the values. Launchers before 0.9.73 do not know it and leave it out.
 */
export interface DiscordLook {
  details: string; state: string; largeImage: string; largeText: string; smallImage: string; smallText: string;
  badgeWhen?: string; badgeImage?: string; badgeText?: string;
}
/**
 * A status for a while (server 0.9.74+): while the value `when` is known (a job from the boss bar), the
 * status friends see is `template` and Discord's state line `state`, with the small picture `image` and
 * its `text`; the first variant whose value is known wins, before the rule's own template. The game
 * counts a value only once it has been there `hold` seconds on end, so a boss bar shown for a moment
 * does not swap the status, and keeps it `keep` seconds after it is gone (a pause between two blocks). Games and launchers from before 0.9.74 do not know variants and leave them out.
 */
export interface Variant { when: string; hold: number; keep: number; template: string; state: string; image: string; text: string }
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
  variants: Variant[];
  updatedAt: number;
}

export const DETAIL_MAX = 48;
const PATTERN_MAX = 200;
const LINE_MAX = 256;
const NAME = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]{0,31})\}/g;
export const VARIANTS_MAX = 6;
/** Seconds a value must be there before a variant counts it, and it stays after it is gone (defaults, most). */
export const HOLD_DEFAULT = 5;
export const KEEP_DEFAULT = 5;
const HOLD_MAX = 300;
const EMPTY_DISCORD: DiscordLook = { details: '', state: '', largeImage: '', largeText: '', smallImage: '', smallText: '' };

/** The extractor and Discord badge for SkyUp's dungeons: the boss bar says "Dungeon poz. 3" there. */
export const SKYUP_DUNGEON_EXTRACTOR: Extractor = { source: 'bossbar', line: 0, pattern: 'Dungeon\\s+poz\\.?\\s*(?<dungeon>\\d{1,3})' };
export const SKYUP_DUNGEON_BADGE = { badgeWhen: 'dungeon', badgeImage: 'https://slashclient.pl/img/discord/dungeon.png', badgeText: 'Dungeon poz. {dungeon}' };
/**
 * SkyUp's jobs: while working the boss bar says "Górnik (poziom 2) 744/3 599 xp (+3 xp)". The job shows
 * after 5 s of it (a log broken while mining does not make a woodcutter) and stays 5 s after the bar
 * goes (a pause between blocks), with its picture
 * (server/web/img/discord/praca_<job>.png).
 */
/** SkyUp's logo as this server keeps it, so no Discord app (the launcher's, the beta's, the dev one) needs it uploaded. */
export const SKYUP_LOGO = 'https://slashclient.pl/img/discord/skyup.png';
export const SKYUP_JOB_EXTRACTOR: Extractor = { source: 'bossbar', line: 0, pattern: '(?<job>Górnik|Farmer|Drwal|Łowca|Rybak|Budowniczy|Czarodziej) \\(poziom (?<jobLevel>\\d{1,3})\\)' };
export const SKYUP_JOB_VARIANT: Variant = {
  when: 'job', hold: HOLD_DEFAULT, keep: KEEP_DEFAULT, template: '{sector} · {job} poz. {jobLevel}', state: '{sector} · {job} poz. {jobLevel}',
  image: 'https://slashclient.pl/img/discord/praca_{job}.png', text: '{job}, poziom {jobLevel}',
};

/** SkyUp.pl as its tab list looks (26.3): "» SkyUP - AnyBlock «" over "» S0 (Spawn) «" or "» LOBBY «". AnyBlock is its only server, so only the sector is shown. */
export const SKYUP_RULE: Omit<StatusRule, 'id' | 'updatedAt' | 'variants'> & { variants?: Variant[] } = {
  server: 'skyup.pl', name: 'SkyUp.pl', enabled: true, strip: '»« ',
  extractors: [
    { source: 'header', line: 1, pattern: '^Sky[Uu][Pp] - (?<mode>[^»«]{1,32})$' },
    { source: 'header', line: 2, pattern: '^(?<sector>LOBBY|Lobby|S\\d{1,2}(?: \\([^()]{1,24}\\))?)$' },
    SKYUP_DUNGEON_EXTRACTOR,
    SKYUP_JOB_EXTRACTOR,
  ],
  map: { LOBBY: 'Lobby' },
  template: '{sector}',
  discord: { ...EMPTY_DISCORD, details: 'Gra na {server}', state: '{sector}', largeImage: SKYUP_LOGO, largeText: 'SkyUp.pl', ...SKYUP_DUNGEON_BADGE },
  variants: [SKYUP_JOB_VARIANT],
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
    if (x.source !== 'header' && x.source !== 'footer' && x.source !== 'bossbar') bad('bad_source');
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
  const badgeWhen = cleanText(d.badgeWhen, 32, 'bad_badge');
  if (badgeWhen) {
    if (!groups.has(badgeWhen)) bad('bad_badge');
    const badgeImage = cleanImage(d.badgeImage);
    if (!badgeImage) bad('bad_badge');
    Object.assign(discord, { badgeWhen, badgeImage, badgeText: cleanTemplate(d.badgeText, 128, 'bad_discord_text', discordKnown) });
  }

  const rawVariants = input.variants === undefined ? old?.variants ?? [] : input.variants;
  if (!Array.isArray(rawVariants) || rawVariants.length > VARIANTS_MAX) bad('bad_variant');
  const variants = (rawVariants as unknown[]).map((e): Variant => {
    const v = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const when = cleanText(v.when, 32, 'bad_variant');
    if (!when || !groups.has(when)) bad('bad_variant');
    const hold = v.hold === undefined || v.hold === '' ? HOLD_DEFAULT : Number(v.hold);
    if (!Number.isInteger(hold) || hold < 0 || hold > HOLD_MAX) bad('bad_variant_hold');
    const keep = v.keep === undefined || v.keep === '' ? KEEP_DEFAULT : Number(v.keep);
    if (!Number.isInteger(keep) || keep < 0 || keep > HOLD_MAX) bad('bad_variant_hold');
    const vTemplate = cleanTemplate(v.template, 64, 'bad_template', groups);
    const state = cleanTemplate(v.state, 128, 'bad_discord_text', discordKnown);
    // the picture may take values ("praca_{job}"): checked with them filled in
    const imageTemplate = cleanTemplate(v.image, 256, 'bad_image', groups);
    if (imageTemplate) cleanImage(imageTemplate.replace(PLACEHOLDER, 'x'));
    const image = imageTemplate;
    const text = cleanTemplate(v.text, 128, 'bad_discord_text', discordKnown);
    if (!vTemplate && !state && !image) bad('bad_variant_empty');
    return { when, hold, keep, template: vTemplate, state, image, text };
  });
  return { server, name, enabled, strip, extractors, map, template, discord, variants };
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

/** `variant`: the index of the variant in use, when one is. */
export interface Reading { detail?: string; values: Record<string, string>; variant?: number }

/**
 * A variant's picture with the values in it: `praca_{job}` with "Górnik" is `praca_gornik`, one asset per
 * job in the Discord app. A value goes in as lowercase letters, digits and "_" (no Polish letters);
 * '' when a value is missing.
 */
export function variantImage(template: string, values: Record<string, string>): string {
  const slug = (s: string) => s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return render(template, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, slug(v)])));
}

/**
 * The first variant whose value is known (the game passes only the values held long enough); while the
 * rule's small picture is on, only a variant of its own value (in a SkyUp dungeon a job from the boss
 * bar does not replace the dungeon).
 */
export function variantFor(rule: { variants?: Variant[]; discord?: Pick<DiscordLook, 'badgeWhen'> }, values: Record<string, string>): number | undefined {
  const badge = rule.discord?.badgeWhen && values[rule.discord.badgeWhen] ? rule.discord.badgeWhen : undefined;
  const i = (rule.variants ?? []).findIndex((v) => !!values[v.when] && (!badge || v.when === badge));
  return i < 0 ? undefined : i;
}

/** What a rule makes of a tab list's header and footer (and the boss bars' titles, one per line). */
export function evaluate(rule: Pick<StatusRule, 'strip' | 'extractors' | 'map' | 'template'> & { variants?: Variant[]; discord?: Pick<DiscordLook, 'badgeWhen'> }, header: string, footer: string, bossbar = ''): Reading {
  const values: Record<string, string> = {};
  const lowerMap = new Map(Object.entries(rule.map).map(([k, v]) => [k.toLowerCase(), v]));
  for (const x of rule.extractors) {
    const text = sourceText(x.source === 'header' ? header : x.source === 'bossbar' ? bossbar : footer, x.line, rule.strip);
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
  const variant = variantFor(rule, values);
  const template = (variant !== undefined && rule.variants![variant].template) || rule.template;
  return { detail: sanitizeDetail(render(template, values)), values, ...(variant !== undefined ? { variant } : {}) };
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
    if (!existed) this.save({ ...SKYUP_RULE, variants: SKYUP_RULE.variants ?? [], id: randomBytes(6).toString('hex'), updatedAt: Date.now() });
    this.upgrade();
  }

  /**
   * Additions to the seeded SkyUp rule, each once: a rule kept from before gets them too, and when
   * the admin takes one out later it stays out.
   */
  private upgrade() {
    this.sql.exec('CREATE TABLE IF NOT EXISTS status_rule_upgrades (name TEXT PRIMARY KEY, at INTEGER NOT NULL)');
    const once = (name: string) => !!this.sql.prepare('INSERT OR IGNORE INTO status_rule_upgrades (name, at) VALUES (?, ?)').run(name, Date.now()).changes;
    const sky = () => this.all().find((r) => r.server === SKYUP_RULE.server);
    if (once('skyup_dungeon')) {
      const r = sky();
      if (r && r.extractors.length < 6 && !r.extractors.some((x) => x.source === 'bossbar') && !r.discord.badgeWhen) {
        this.save({ ...r, extractors: [...r.extractors, SKYUP_DUNGEON_EXTRACTOR], discord: { ...r.discord, ...SKYUP_DUNGEON_BADGE }, updatedAt: Date.now() });
      }
    }
    // the logo uploaded to the Discord app before: the same picture from this server
    if (once('skyup_logo')) {
      const r = sky();
      if (r && (r.discord.largeImage === '' || r.discord.largeImage === 'skyup_logo_big')) this.save({ ...r, discord: { ...r.discord, largeImage: SKYUP_LOGO }, updatedAt: Date.now() });
    }
    if (once('skyup_jobs')) {
      const r = sky();
      const reads = (name: string) => r?.extractors.some((x) => x.pattern.includes(`(?<${name}>`));
      if (r && r.extractors.length < 6 && r.variants.length < VARIANTS_MAX && !reads('job') && !reads('jobLevel') && !r.variants.some((v) => v.when === 'job')) {
        this.save({ ...r, extractors: [...r.extractors, SKYUP_JOB_EXTRACTOR], variants: [...r.variants, SKYUP_JOB_VARIANT], updatedAt: Date.now() });
      }
    }
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
const EMPTY_RULE = { name: '', enabled: true, strip: '', extractors: [], map: {}, template: '', discord: EMPTY_DISCORD, variants: [] as Variant[] };

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
    const rules = store.all().filter((r) => r.enabled).map(({ server, name, strip, extractors, map, template, discord, variants }) => ({ server, name, strip, extractors, map, template, discord, ...(variants.length ? { variants } : {}) }));
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
      const bossbar = typeof input.bossbar === 'string' ? input.bossbar.slice(0, 1024) : '';
      const reading = evaluate(rule, header, footer, bossbar);
      const values: Record<string, string> = { ...reading.values, server: rule.name || rule.server, ...(reading.detail ? { detail: reading.detail } : {}) };
      const variant = reading.variant !== undefined ? rule.variants[reading.variant] : undefined;
      let badge = rule.discord.badgeWhen && values[rule.discord.badgeWhen] ? render(rule.discord.badgeText ?? '', values) || rule.discord.badgeWhen : '';
      const image = variant?.image ? variantImage(variant.image, values) : '';
      if (image) badge = `${render(variant!.text, values) || variant!.when} (${image})`;
      const state = (variant?.state && render(variant.state, values)) || render(rule.discord.state, values);
      return { detail: reading.detail ?? null, values: reading.values, variant: reading.variant ?? null, discord: { details: render(rule.discord.details, values), state, badge } };
    }],
  ];

  return {
    routes, serve, store,
    /** The server's display name for a friend's status ("SkyUp.pl"), when a rule knows it. */
    nameFor: (address: string | undefined) => ruleFor(address)?.name || undefined,
  };
}
