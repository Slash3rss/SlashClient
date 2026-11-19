import type http from 'node:http';
import type { SettingDef, Settings } from './settings.ts';
import { siteLang, sitePage, type SiteLang } from './sitePages.ts';

/**
 * Where "Zgłoś błąd" leads (Ustawienia → Zgłoszenia in the admin panel): the site's own bug tracker, the
 * Discord server (or another link the admin gives), or nowhere. The launcher and the game only open
 * /zgloszenia, so this works for every launcher already out there without a new release.
 *
 * - site: the tracker as it was.
 * - discord: /zgloszenia sends players to the link; one coming from the launcher with a log sees a short
 *   page with the log's address to paste into a ticket first, so the log is not lost. Reports already
 *   written stay readable at /zgloszenia/<id>; nothing new can be written.
 * - off: the pages say reporting is off, the site's links to them disappear (siteBanner.js reads
 *   `bugs` from /v1/features), and nothing new can be written.
 */

export type BugsMode = 'site' | 'discord' | 'off';
export const BUGS_MODES: BugsMode[] = ['site', 'discord', 'off'];
export const DEFAULT_BUGS_LINK = 'https://dc.slashclient.pl';

export const BUGS_SETTING_DEFS: SettingDef[] = ([
  { key: 'bugs.mode', label: 'Zgłoszenia błędów', labelEn: 'Bug reports',
    description: 'Dokąd prowadzi „Zgłoś błąd” w launcherze, grze i na stronie. site: zgłoszenia na stronie (/zgloszenia). discord: przekierowanie na link poniżej; gracz z logiem z launchera najpierw widzi link do loga do wklejenia w tickecie. off: zgłoszenia wyłączone, linki do nich znikają ze strony. W obu ostatnich trybach nowych zgłoszeń nie da się napisać, a stare zostają w panelu.',
    descriptionEn: 'Where "Report a bug" leads in the launcher, the game and on the site. site: reports on the site (/bugs). discord: a redirect to the link below; a player with a log from the launcher first sees the log\'s link to paste into a ticket. off: reports switched off, the links to them leave the site. In both last modes no new report can be written, and the old ones stay in the panel.',
    type: 'enum', options: BUGS_MODES, default: 'site' },
  { key: 'bugs.link', label: 'Link zamiast zgłoszeń', labelEn: 'Link instead of reports',
    description: `Dokąd prowadzi tryb discord, np. zaproszenie na serwer albo kanał z ticketami. Pusty: ${DEFAULT_BUGS_LINK}.`,
    descriptionEn: `Where the discord mode leads, e.g. the server invite or the tickets channel. Empty: ${DEFAULT_BUGS_LINK}.`,
    type: 'url', default: '', maxLength: 300 },
] as Omit<SettingDef, 'category'>[]).map((d) => ({ ...d, category: 'bugs' }));

export function bugsMode(settings: Settings): BugsMode {
  const mode = settings.str('bugs.mode') as BugsMode;
  return BUGS_MODES.includes(mode) ? mode : 'site';
}

/** The discord mode's link: the admin's, only an https one, else the Discord invite. */
export function bugsLink(settings: Settings): string {
  const link = settings.str('bugs.link').trim();
  return /^https:\/\/[^\s"<>]+$/i.test(link) ? link : DEFAULT_BUGS_LINK;
}

/** The tracker's pages: the list (with ?nowe=1 from the launcher) and one report. */
const PAGE = /^\/(zgloszenia|bugs)(?:\/(\d+))?\/?$/;
/** Writing something new: a report or a comment under one. */
const WRITE = /^\/v1\/bugs(?:\/\d+\/comments)?$/;
const LOG_ID = /^[A-Za-z0-9]{10}$/;

const T = {
  pl: {
    offTitle: 'Zgłoszenia są wyłączone', offText: 'Zgłaszanie błędów przez stronę jest teraz wyłączone.', home: 'Strona główna',
    logTitle: 'Zgłoś błąd na Discordzie', logText: 'Błędy zgłaszamy teraz na naszym Discordzie. Załóż tam ticket i wklej w nim link do swojego loga z launchera:',
    go: 'Przejdź na Discorda', log: 'Otwórz log',
  },
  en: {
    offTitle: 'Bug reports are off', offText: 'Reporting bugs on the site is switched off right now.', home: 'Home page',
    logTitle: 'Report the bug on Discord', logText: 'We take bug reports on our Discord now. Open a ticket there and paste the link to your log from the launcher into it:',
    go: 'Go to Discord', log: 'Open the log',
  },
};

export interface BugsModeContext {
  settings: Settings;
  /** The site's public address, for the log's link to paste (https://slashclient.pl). */
  publicUrl?: string;
  pageHeaders: Record<string, string>;
}

/**
 * Answers the request when the mode is not the site's tracker and it is one of the tracker's pages or a
 * write to it; false: not ours, the request goes on as before.
 */
export function handleBugsMode(ctx: BugsModeContext, req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean {
  const mode = bugsMode(ctx.settings);
  if (mode === 'site') return false;
  if (req.method === 'POST' && WRITE.test(url.pathname)) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'feature_disabled', feature: 'bugs' }));
    req.resume();
    return true;
  }
  const page = PAGE.exec(url.pathname);
  if (!page || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
  const lang: SiteLang = siteLang(req, url.pathname);
  const t = T[lang];
  if (mode === 'off') {
    res.writeHead(503, ctx.pageHeaders);
    res.end(sitePage({ lang, code: '503', icon: 'fa-solid fa-bug-slash', tone: 'warning', title: t.offTitle, text: t.offText, actions: [[t.home, lang === 'en' ? '/en' : '/', true]] }));
    return true;
  }
  // a report already written stays readable (links to it in chats and on Discord keep working)
  if (page[2]) return false;
  const link = bugsLink(ctx.settings);
  const log = url.searchParams.get('log') ?? '';
  if (LOG_ID.test(log)) {
    const logUrl = `${(ctx.publicUrl ?? '').replace(/\/$/, '')}/${lang === 'en' ? 'logs' : 'logi'}/${log}`;
    res.writeHead(200, ctx.pageHeaders);
    res.end(sitePage({
      lang, icon: 'fa-brands fa-discord', title: t.logTitle, text: t.logText, note: logUrl,
      actions: [[t.go, link, true], [t.log, logUrl]],
    }));
    return true;
  }
  res.writeHead(302, { Location: link, 'Cache-Control': 'no-store' });
  res.end();
  return true;
}
