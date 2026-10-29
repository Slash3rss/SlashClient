import type http from 'node:http';
import type { ChangelogEntry, Downloads } from './downloads.ts';
import { escapeHtml, notesHtml, parseVersion } from './releaseNotes.ts';

/**
 * The changelog page: /zmiany in Polish, /changelog in English. Every launcher release with its
 * date, its "Nowość" badge and its notes (the same list the launcher shows, /v1/changelog),
 * rendered here so search engines read it too. Each release has its own anchor (/zmiany#0.9.40),
 * where the home page's badge leads. Older releases a page further (?przed=0.9.20).
 */

type Lang = 'pl' | 'en';
const PATHS: Record<string, Lang> = { '/zmiany': 'pl', '/changelog': 'en' };
const PAGE = 25;

const UI = {
  pl: {
    path: '/zmiany', home: '/', title: 'Historia zmian', eyebrow: 'Launcher SlashClient',
    lead: 'Co nowego w każdym wydaniu launchera SlashClient i moda SlashClient HUD. Launcher aktualizuje się sam – najnowsza wersja jest zawsze na górze.',
    description: 'Historia zmian launchera SlashClient: nowe funkcje, poprawki i daty kolejnych wydań.',
    nav: [['/#funkcje', 'Funkcje'], ['/#kosmetyki', 'Kosmetyki'], ['/#faq', 'FAQ'], ['/zgloszenia', 'Zgłoszenia'], ['/wsparcie', 'Wesprzyj']],
    other: 'English', older: 'Starsze wydania', newest: 'Najnowsze wydania', download: 'Pobierz SlashClient', homeLabel: 'Strona główna',
    empty: 'Nie ma jeszcze żadnych wydań.', unavailable: 'Historia zmian jest chwilowo niedostępna. Spróbuj za chwilę.',
    unofficial: 'SlashClient · nie jest powiązany z Mojang ani Microsoft.', locale: 'pl-PL', param: 'przed',
  },
  en: {
    path: '/changelog', home: '/en', title: 'Changelog', eyebrow: 'SlashClient launcher',
    lead: 'What is new in every release of the SlashClient launcher and the SlashClient HUD mod. The launcher updates itself – the newest version is always on top.',
    description: 'The SlashClient launcher changelog: new features, fixes and the dates of every release.',
    nav: [['/en#funkcje', 'Features'], ['/en#kosmetyki', 'Cosmetics'], ['/en#faq', 'FAQ'], ['/bugs', 'Bug reports'], ['/support', 'Support us']],
    other: 'Polski', older: 'Older releases', newest: 'Newest releases', download: 'Download SlashClient', homeLabel: 'Home',
    empty: 'There are no releases yet.', unavailable: 'The changelog is unavailable right now. Try again in a moment.',
    unofficial: 'SlashClient · not affiliated with Mojang or Microsoft.', locale: 'en-GB', param: 'before',
  },
} as const;

function release(r: ChangelogEntry, lang: Lang): string {
  const u = UI[lang];
  const date = Date.parse(r.date);
  const when = Number.isNaN(date) ? '' : `<time datetime="${escapeHtml(new Date(date).toISOString())}">${escapeHtml(new Intl.DateTimeFormat(u.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' }).format(date))}</time>`;
  const id = escapeHtml(r.version);
  return `<article class="cl-release glass" id="${id}">
          <header class="cl-head">
            <h2><a href="#${id}">SlashClient ${id}</a></h2>
            ${when}
          </header>
          ${r.title ? `<p class="cl-badge"><span class="dot"></span> ${escapeHtml(r.title)}</p>` : ''}
          <div class="legal-body cl-notes">
${notesHtml(r.notes)}
          </div>
        </article>`;
}

export function changelogPage(o: { lang: Lang; releases: ChangelogEntry[]; more: boolean; before?: string; publicUrl: string; failed?: boolean; hidden?: (path: string) => boolean }): string {
  const u = UI[o.lang];
  const other: Lang = o.lang === 'pl' ? 'en' : 'pl';
  const base = o.publicUrl.replace(/\/+$/, '');
  const self = `${u.path}${o.before ? `?${u.param}=${encodeURIComponent(o.before)}` : ''}`;
  const last = o.releases[o.releases.length - 1];
  const body = o.failed
    ? `<p class="cl-empty muted">${escapeHtml(u.unavailable)}</p>`
    : o.releases.length ? o.releases.map((r) => release(r, o.lang)).join('\n        ') : `<p class="cl-empty muted">${escapeHtml(u.empty)}</p>`;
  const pager = [
    o.before ? `<a class="btn" href="${u.path}"><i class="fa-solid fa-angles-up"></i> ${escapeHtml(u.newest)}</a>` : '',
    o.more && last ? `<a class="btn primary" href="${u.path}?${u.param}=${encodeURIComponent(last.version)}">${escapeHtml(u.older)} <i class="fa-solid fa-chevron-right"></i></a>` : '',
  ].filter(Boolean).join('\n          ');
  const title = `${u.title} – SlashClient`;
  return `<!doctype html>
<html lang="${o.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(u.description)}">
  <link rel="canonical" href="${base}${escapeHtml(self)}">
  <link rel="alternate" hreflang="${o.lang}" href="${base}${u.path}">
  <link rel="alternate" hreflang="${other}" href="${base}${UI[other].path}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="SlashClient">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(u.description)}">
  <meta property="og:url" content="${base}${escapeHtml(self)}">
  <meta property="og:image" content="${base}/vendor/logo.png">
  <meta name="theme-color" content="#3b82f6" media="not all"><meta name="theme-color" content="#07090f">
  ${o.failed ? '<meta name="robots" content="noindex">' : ''}
  <link rel="icon" href="/vendor/logo.png">
  <link rel="stylesheet" href="/vendor/fa/css/all.min.css">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/landing.css">
  <link rel="stylesheet" href="/legal.css">
  <link rel="stylesheet" href="/changelog.css">
</head>
<body class="landing">
  <div class="bg" aria-hidden="true"><div class="bg-grid"></div><div class="bg-glow g1"></div></div>
  <header class="nav scrolled">
    <div class="wrap">
      <a class="brand" href="${u.home}"><img src="/vendor/logo.png" alt=""><span>Slash<b>Client</b></span></a>
      <nav class="nav-links">
        ${u.nav.filter(([h]) => !o.hidden?.(h)).map(([h, l]) => `<a href="${h}">${l}</a>`).join('\n        ')}
      </nav>
      <div class="push row">
        <a class="btn lang-switch" href="${UI[other].path}" hreflang="${other}"><i class="fa-solid fa-language"></i> <span class="label">${u.other}</span></a>
      </div>
    </div>
  </header>
  <main>
    <section class="legal-page">
      <div class="wrap changelog">
        <header class="legal-head">
          <span class="eyebrow">${escapeHtml(u.eyebrow)}</span>
          <h1>${escapeHtml(u.title)}</h1>
          <p class="muted cl-lead">${escapeHtml(u.lead)}</p>
          <p class="cl-actions"><a class="btn primary" href="${u.home}#pobierz"><i class="fa-solid fa-download"></i> ${escapeHtml(u.download)}</a></p>
        </header>
        ${body}
        ${pager ? `<nav class="cl-pager">
          ${pager}
        </nav>` : ''}
      </div>
    </section>
  </main>
  <footer class="foot">
    <div class="wrap foot-row">
      <span class="muted small">${u.unofficial}</span>
      <a class="push foot-link" href="${u.home}">${u.homeLabel}</a>
    </div>
  </footer>
</body>
</html>
`;
}

const CSP = "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** The changelog page for /zmiany and /changelog; false for any other address. */
export async function serveChangelog(req: http.IncomingMessage, res: http.ServerResponse, url: URL, o: { downloads: Downloads; publicUrl: string; versioned: (html: string) => string; hidden?: (path: string) => boolean }): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const lang = PATHS[url.pathname.replace(/\/+$/, '')];
  if (!lang) return false;
  const raw = url.searchParams.get('przed') ?? url.searchParams.get('before') ?? undefined;
  const before = raw && parseVersion(raw) ? parseVersion(raw)!.join('.') : undefined;
  let page: { releases: ChangelogEntry[]; more: boolean } = { releases: [], more: false };
  let failed = false;
  try {
    page = await o.downloads.changelog({ limit: PAGE, before, lang });
  } catch (err) {
    console.error('zmiany:', (err as Error).message);
    failed = true;
  }
  const html = o.versioned(changelogPage({ lang, ...page, before, publicUrl: o.publicUrl, failed, hidden: o.hidden }));
  res.writeHead(failed ? 503 : 200, {
    'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
    'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer',
  });
  res.end(req.method === 'HEAD' ? undefined : html);
  return true;
}
