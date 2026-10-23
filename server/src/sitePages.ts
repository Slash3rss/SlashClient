import type http from 'node:http';

/**
 * The website's own small pages: "not found" (also a page the admin hid), "switched off", a
 * server error, and the end of a sign-in or of linking a channel. They look like the rest of the
 * site (its styles, logo and background, web/sitePage.css), in Polish or English, with no scripts.
 */

export type SiteLang = 'pl' | 'en';

/** English for /en and the English pages' addresses, else the browser's first language. */
const EN_PATHS = /^\/(?:en|account|bugs|support|terms|privacy|download|community|profile|changelog)(?:\/|$)/;
export function siteLang(req: http.IncomingMessage, pathname: string): SiteLang {
  if (EN_PATHS.test(pathname)) return 'en';
  const first = String(req.headers['accept-language'] ?? '').split(',')[0].trim().toLowerCase();
  return first && first !== '*' && !first.startsWith('pl') ? 'en' : 'pl';
}

/** The cookie the home page's language link sets: the visitor's own choice beats the browser's language. */
export const LANG_COOKIE = 'slash_lang';

/** Where "/" sends a visitor: "/en" for a browser in another language than Polish, unless they chose Polish. */
export function homeRedirect(req: http.IncomingMessage): string | undefined {
  const chosen = /(?:^|;\s*)slash_lang=(pl|en)(?:;|$)/.exec(String(req.headers.cookie ?? ''))?.[1];
  if (chosen) return chosen === 'en' ? '/en' : undefined;
  const first = String(req.headers['accept-language'] ?? '').split(',')[0].trim().toLowerCase();
  // no language (search engines, scripts): the Polish page
  return first && first !== '*' && !first.startsWith('pl') ? '/en' : undefined;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface SitePage {
  lang: SiteLang;
  /** A big number on top (404, 503, 500); none for the sign-in and linking pages. */
  code?: string;
  icon: string;
  /** 'error' red, 'warning' amber, 'ok' green, else the site's blue. */
  tone?: 'error' | 'warning' | 'ok' | 'info';
  title: string;
  text: string;
  /** Buttons: [label, address, primary?]. */
  actions?: [string, string, boolean?][];
  /** Small grey line under the buttons. */
  note?: string;
}

export function sitePage(p: SitePage): string {
  const home = p.lang === 'en' ? '/en' : '/';
  const actions = (p.actions ?? []).map(([label, href, primary]) => `<a class="btn${primary ? ' primary' : ''}" href="${esc(href)}">${esc(label)}</a>`).join('\n        ');
  return `<!doctype html>
<html lang="${p.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#07090f">
  <title>${esc(p.code ? `${p.code} · ${p.title}` : p.title)} · SlashClient</title>
  <link rel="icon" href="/vendor/logo.png">
  <link rel="stylesheet" href="/vendor/fa/css/all.min.css">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/landing.css">
  <link rel="stylesheet" href="/sitePage.css">
</head>
<body class="landing site-page">
  <div class="bg" aria-hidden="true"><div class="bg-grid"></div><div class="bg-glow g1"></div></div>
  <header class="nav scrolled">
    <div class="wrap">
      <a class="brand" href="${home}"><img src="/vendor/logo.png" alt=""><span>Slash<b>Client</b></span></a>
    </div>
  </header>
  <main class="sp-main">
    <section class="sp-card glass ${p.tone ?? 'info'}">
      <div class="sp-icon"><i class="${esc(p.icon)}"></i></div>
      ${p.code ? `<div class="sp-code grad">${esc(p.code)}</div>` : ''}
      <h1>${esc(p.title)}</h1>
      <p class="muted">${esc(p.text)}</p>
      ${actions ? `<div class="sp-actions">
        ${actions}
      </div>` : ''}
      ${p.note ? `<p class="sp-note">${esc(p.note)}</p>` : ''}
    </section>
  </main>
</body>
</html>`;
}

const T = {
  pl: {
    home: 'Strona główna', report: 'Zgłoś problem', account: 'Twoje konto',
    notFound: ['Nie ma takiej strony', 'Ten adres nie prowadzi nigdzie – może link jest stary albo jest w nim literówka.'],
    disabled: ['Chwilowo niedostępne', 'Ta część SlashClient jest teraz wyłączona. Zajrzyj później.'],
    error: ['Coś poszło nie tak', 'Serwer nie dał rady obsłużyć tej strony. Spróbuj za chwilę – jeśli to się powtarza, zgłoś nam to.'],
  },
  en: {
    home: 'Home page', report: 'Report a problem', account: 'Your account',
    notFound: ['Page not found', 'This address leads nowhere – the link may be old or have a typo in it.'],
    disabled: ['Temporarily unavailable', 'This part of SlashClient is switched off right now. Check back later.'],
    error: ['Something went wrong', 'The server could not show this page. Try again in a moment – if it keeps happening, let us know.'],
  },
};

/** 404: an address that is not there, or a page the admin hid. */
export function notFoundPage(lang: SiteLang): string {
  const t = T[lang];
  return sitePage({ lang, code: '404', icon: 'fa-solid fa-compass', title: t.notFound[0], text: t.notFound[1], actions: [[t.home, lang === 'en' ? '/en' : '/', true]] });
}

/** 503: a feature the admin switched off. */
export function disabledPage(lang: SiteLang = 'pl'): string {
  const t = T[lang];
  return sitePage({ lang, code: '503', icon: 'fa-solid fa-person-digging', tone: 'warning', title: t.disabled[0], text: t.disabled[1], actions: [[t.home, lang === 'en' ? '/en' : '/', true]] });
}

/** 500: the server failed at a page. */
export function errorPage(lang: SiteLang): string {
  const t = T[lang];
  return sitePage({
    lang, code: '500', icon: 'fa-solid fa-plug-circle-exclamation', tone: 'error', title: t.error[0], text: t.error[1],
    actions: [[t.home, lang === 'en' ? '/en' : '/', true], [t.report, lang === 'en' ? '/bugs' : '/zgloszenia']],
  });
}
