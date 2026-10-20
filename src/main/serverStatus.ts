import { t } from '../shared/i18n';
import type { Presence } from './discord';

/**
 * Statuses from the tab list (server 0.9.25+, statusRules.ts there): SlashClient HUD reads what the
 * server writes over the player list ("» S3 (Wyspy) «") with the admin's rules and tells the launcher
 * the short status and the values it found. Friends get the status with the presence (social.ts);
 * Discord gets the rule's own look: its pictures and lines made of the same values.
 */

export interface DiscordLook { details?: string; state?: string; largeImage?: string; largeText?: string; smallImage?: string; smallText?: string }
export interface PublishedRule { server: string; name?: string; discord?: DiscordLook }
export interface PublishedRules { version?: string; rules: PublishedRule[]; discord?: DiscordLook }

/** What the game said last: the server it is on, the status, and the values behind it. */
export interface GameStatus { server: string; detail?: string; values: Record<string, string> }

export const DETAIL_MAX = 48;

/** One line, printable, short (the server cleans it again). */
export function cleanDetail(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = input.replace(/§./g, '').replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\u2028\u2029]/gu, '').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, DETAIL_MAX).join('').trim() || undefined;
}

/** The values the game found ({sector: "S3 (Wyspy)"}): a few short ones with simple names. */
export function cleanValues(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, 8)) {
    const value = cleanDetail(v);
    if (/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(k) && value) out[k] = value;
  }
  return out;
}

/** "Play.SkyUp.pl.:25565" → "play.skyup.pl". */
export function serverKey(address: string | undefined): string {
  return (address ?? '').trim().toLowerCase().replace(/:25565$/, '').replace(/\.+(?=:\d+$|$)/, '');
}

/** The rule for an address: the server itself or a subdomain, the most precise one first. */
export function ruleFor(rules: PublishedRule[], address: string | undefined): PublishedRule | undefined {
  const key = serverKey(address);
  if (!key) return undefined;
  const host = key.replace(/:\d+$/, '');
  return rules.filter((r) => (r.server.includes(':') ? key === r.server || key.endsWith(`.${r.server}`) : host === r.server || host.endsWith(`.${r.server}`)))
    .sort((a, b) => b.server.length - a.server.length)[0];
}

/** `{name}` from the values; '' when one is missing. */
export function render(template: string | undefined, values: Record<string, string>): string {
  if (!template) return '';
  let missing = false;
  const out = template.replace(/\{([a-zA-Z][a-zA-Z0-9]{0,31})\}/g, (_, n: string) => {
    if (!values[n]) missing = true;
    return values[n] ?? '';
  });
  return missing ? '' : out.trim().slice(0, 128);
}

/** Discord wants 2 to 128 characters in a line, or none. */
const discordText = (s: string | undefined) => (s && s.trim().length >= 2 ? s.trim().slice(0, 128) : undefined);

export interface DecorateOptions {
  /** The game is on this server now (from its log), or undefined. */
  server?: string;
  /** What the game said about it (dropped when it was about another server). */
  status?: GameStatus;
  rules?: PublishedRules;
  /** Signed in to SlashClient and hiding the server from friends: Discord does not show it either. */
  hideServer: boolean;
}

/**
 * What Discord shows: `base` (the version, "Na serwerze …"), with the matching rule's lines and
 * pictures, or the admin's default pictures; without the server and its status when it is hidden.
 */
export function decorate(base: Presence, o: DecorateOptions): Presence {
  const out: Presence = { ...base };
  const defaults = o.rules?.discord ?? {};
  const pictures = (look: DiscordLook) => {
    if (look.largeImage) {
      out.largeImageKey = look.largeImage;
      out.largeImageText = discordText(look.largeText) ?? out.largeImageText;
    } else if (look.largeText && out.largeImageKey) out.largeImageText = discordText(look.largeText) ?? out.largeImageText;
    if (look.smallImage) {
      out.smallImageKey = look.smallImage;
      out.smallImageText = discordText(look.smallText);
    }
  };
  pictures(defaults);
  if (!o.server) return out;
  if (o.hideServer) {
    out.state = t('Gra w Minecraft');
    return out;
  }
  const rule = o.rules && ruleFor(o.rules.rules, o.server);
  if (!rule) return out;
  const status = o.status && serverKey(o.status.server) === serverKey(o.server) ? o.status : undefined;
  const values: Record<string, string> = { ...(status?.values ?? {}), server: rule.name || o.server, ...(status?.detail ? { detail: status.detail } : {}) };
  const look = rule.discord ?? {};
  out.details = discordText(render(look.details, values)) ?? out.details;
  out.state = discordText(render(look.state, values)) ?? (status?.detail ? discordText(`${out.state ?? ''} · ${status.detail}`) : out.state);
  pictures(look);
  return out;
}

/**
 * At most one call per `gapMs` (Discord allows about 5 changes in 20 s; the sector may change faster):
 * the first goes at once, the rest wait and only the last of them goes.
 */
export class Throttle {
  private last = -Infinity;
  private timer?: ReturnType<typeof setTimeout>;
  private next?: () => void;

  constructor(private readonly gapMs: number, private readonly now: () => number = Date.now) {}

  run(fn: () => void) {
    const wait = this.last + this.gapMs - this.now();
    if (wait <= 0 && !this.timer) {
      this.last = this.now();
      fn();
      return;
    }
    this.next = fn;
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.last = this.now();
      const f = this.next;
      this.next = undefined;
      f?.();
    }, Math.max(0, wait));
  }

  cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.next = undefined;
  }
}

/** The rules from the SlashClient server, asked again at most every 10 minutes (304 mostly). */
export class StatusRules {
  private rules?: PublishedRules;
  private etag = '';
  private at = 0;
  private loading?: Promise<void>;

  constructor(private readonly url: () => string, private readonly fetchImpl: typeof fetch = fetch) {}

  current(): PublishedRules | undefined {
    return this.rules;
  }

  refresh(force = false): Promise<void> {
    if (!force && Date.now() - this.at < 10 * 60_000) return Promise.resolve();
    this.loading ??= (async () => {
      this.at = Date.now();
      try {
        const res = await this.fetchImpl(this.url().replace(/\/$/, '') + '/v1/status-rules', { headers: this.etag ? { 'If-None-Match': this.etag } : {}, signal: AbortSignal.timeout(10_000) });
        if (res.status === 304) return;
        if (!res.ok) return;
        const body = (await res.json()) as PublishedRules;
        if (!Array.isArray(body?.rules)) return;
        this.rules = { version: body.version, rules: body.rules.filter((r) => r && typeof r.server === 'string'), discord: body.discord ?? {} };
        this.etag = res.headers.get('etag') ?? '';
      } catch {
        // an older server has no rules, or it is not reachable: Discord shows what it did before
      }
    })().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }
}
