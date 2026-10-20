import { escapeHtml, type Rendered } from './markdown.ts';
import { DOCS, type Lang } from './store.ts';

/** The page of one legal document: the site's header and footer, the contents list, the text. */

const UI = {
  pl: {
    nav: [['/#funkcje', 'Funkcje'], ['/#kosmetyki', 'Kosmetyki'], ['/#faq', 'FAQ'], ['/zgloszenia', 'Zgłoszenia'], ['/wsparcie', 'Wesprzyj']],
    other: 'English', toc: 'Spis treści', updated: 'Ostatnia aktualizacja:', print: 'Drukuj', home: 'Strona główna',
    draft: 'Projekt / wersja robocza — do weryfikacji przez prawnika przed publikacją jako wiążące. Fragmenty oznaczone [UZUPEŁNIJ: …] uzupełnia właściciel serwisu.',
    unofficial: 'SlashClient · nie jest powiązany z Mojang ani Microsoft.', locale: 'pl-PL',
  },
  en: {
    nav: [['/en#funkcje', 'Features'], ['/en#kosmetyki', 'Cosmetics'], ['/en#faq', 'FAQ'], ['/bugs', 'Bug reports'], ['/support', 'Support us']],
    other: 'Polski', toc: 'Contents', updated: 'Last updated:', print: 'Print', home: 'Home',
    draft: 'Draft — to be reviewed by a lawyer before it is published as binding. Parts marked [UZUPEŁNIJ: …] (to be filled in) are completed by the owner of the service. The Polish version prevails.',
    unofficial: 'SlashClient · not affiliated with Mojang or Microsoft.', locale: 'en-GB',
  },
} as const;

export function legalPage(o: { doc: string; lang: Lang; rendered: Rendered; updatedAt: number; banner: boolean; publicUrl: string }): string {
  const meta = DOCS[o.doc];
  const u = UI[o.lang];
  const other: Lang = o.lang === 'pl' ? 'en' : 'pl';
  const self = meta[o.lang];
  const date = new Intl.DateTimeFormat(u.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' }).format(o.updatedAt);
  const base = o.publicUrl.replace(/\/$/, '');
  const t = escapeHtml(self.title);
  const footer = (['terms', 'privacy', 'support-terms'] as const)
    .map((d, i) => `<a class="${i === 0 ? 'push ' : ''}foot-link" href="${DOCS[d][o.lang].path}">${escapeHtml(o.lang === 'pl' ? DOCS[d].name : DOCS[d].en.title.replace(/^SlashClient /, ''))}</a>`).join('\n      ');
  return `<!doctype html>
<html lang="${o.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t} – SlashClient</title>
  <link rel="canonical" href="${base}${self.path}">
  <link rel="alternate" hreflang="${o.lang}" href="${base}${self.path}">
  <link rel="alternate" hreflang="${other}" href="${base}${meta[other].path}">
  <meta name="theme-color" content="#07090f">
  <link rel="icon" href="/vendor/logo.png">
  <link rel="stylesheet" href="/vendor/fa/css/all.min.css">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/landing.css">
  <link rel="stylesheet" href="/legal.css">
  <script type="module" src="/legal.js"></script>
</head>
<body class="landing">
  <div class="bg" aria-hidden="true"><div class="bg-grid"></div><div class="bg-glow g1"></div></div>
  <header class="nav scrolled">
    <div class="wrap">
      <a class="brand" href="/"><img src="/vendor/logo.png" alt=""><span>Slash<b>Client</b></span></a>
      <nav class="nav-links">
        ${u.nav.map(([h, l]) => `<a href="${h}">${l}</a>`).join('\n        ')}
      </nav>
      <div class="push row">
        <a class="btn lang-switch" href="${meta[other].path}" hreflang="${other}"><i class="fa-solid fa-language"></i> <span class="label">${u.other}</span></a>
      </div>
    </div>
  </header>
  <main>
    <section class="legal-page">
      <div class="wrap legal">
        <header class="legal-head">
          <span class="eyebrow">SlashClient</span>
          <h1>${t}</h1>
          <div class="legal-meta">
            <span>${u.updated} <time datetime="${new Date(o.updatedAt).toISOString()}">${date}</time></span>
            <a class="lang-switch" href="${meta[other].path}" hreflang="${other}">${u.other}</a>
            <button type="button" class="print-btn" id="legal-print"><i class="fa-solid fa-print"></i> ${u.print}</button>
          </div>
          ${o.banner ? `<p class="legal-draft" role="note"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(u.draft)}</p>` : ''}
        </header>
        <nav class="legal-toc" aria-label="${u.toc}">
          <details id="legal-toc" open>
            <summary>${u.toc}</summary>
            <ol>
              ${o.rendered.toc.map((e) => `<li><a href="#${e.id}">${e.text}</a></li>`).join('\n              ')}
            </ol>
          </details>
        </nav>
        <article class="legal-body">
${o.rendered.html}
        </article>
      </div>
    </section>
  </main>
  <footer class="foot">
    <div class="wrap foot-row">
      <span class="muted small">${u.unofficial}</span>
      ${footer}
      <a class="foot-link" href="${o.lang === 'en' ? '/en' : '/'}">${u.home}</a>
    </div>
  </footer>
</body>
</html>
`;
}
