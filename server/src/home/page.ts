import { type Content, type Item, type Lang, escapeHtml as esc, inline, linkAttrs } from './content.ts';

/**
 * The home page made from web/index.html and the published content: the parts between
 * <!--home:name--> and <!--/home:name--> are made here, everything else (the look, the scripts,
 * the floating capes) stays as the file has it. A file without the marks is sent as it is.
 *
 * web/index.html holds what these make from the defaults (a test keeps the two the same), so the
 * file alone still shows the page as it was.
 */

/** The fixed words around the editable ones, and where each language's pages are. */
export const UI = {
  pl: {
    path: '/', locale: 'pl_PL', account: '/konto', download: '/pobierz/', terms: '/regulamin', privacy: '/polityka-prywatnosci',
    figure: 'Podgląd kosmetyków 3D',
  },
  en: {
    path: '/en', locale: 'en_GB', account: '/account', download: '/download/', terms: '/terms', privacy: '/privacy',
    figure: '3D cosmetics preview',
  },
} as const;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const items = (v: unknown): Item[] => (Array.isArray(v) ? v as Item[] : []);
/** An icon element, or nothing for an empty icon. */
const ic = (cls: unknown, extra = ''): string => (str(cls) ? `<i class="${esc(str(cls))}"${extra}></i>` : '');
/** An icon followed by a space and the text, the way the page's buttons have them. */
const withIcon = (cls: unknown, label: string): string => (str(cls) ? `${ic(cls)} ${label}` : label);
/** A picture's address on the site made absolute (for link previews). */
const absolute = (src: string, base: string): string => (src.startsWith('/') ? base + src : src);

function head(c: Content, lang: Lang, base: string): string {
  const m = c.meta;
  const url = base + UI[lang].path;
  const title = esc(str(m.title));
  const desc = esc(str(m.description));
  const image = esc(absolute(str(m.image) || '/img/og.jpg', base));
  // the JSON's "<" written out, so no text in it can end the script
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SlashClient',
    url,
    image: absolute(str(m.image) || '/img/og.jpg', base),
    screenshot: absolute(str(c.hero.image), base),
    description: str(m.appDescription) || str(m.description),
    applicationCategory: 'GameApplication',
    operatingSystem: 'Windows, macOS, Linux',
    inLanguage: lang,
    author: { '@type': 'Person', name: 'Slash3rss' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'PLN' },
  }, null, 2).replace(/</g, '\\u003c').replace(/\n/g, '\n  ');
  return `
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${esc(url)}">
  <link rel="alternate" hreflang="pl" href="${esc(base + UI.pl.path)}">
  <link rel="alternate" hreflang="en" href="${esc(base + UI.en.path)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="SlashClient">
  <meta property="og:locale" content="${UI[lang].locale}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${image}">
  <meta property="og:logo" content="${esc(base)}/vendor/logo.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(str(m.imageAlt))}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${image}">
  <meta name="robots" content="index, follow">
  <meta name="keywords" content="${esc(str(m.keywords))}">
  <meta name="author" content="Slash3rss">
  <meta name="apple-mobile-web-app-title" content="SlashClient">
  <link rel="apple-touch-icon" href="/vendor/logo.png">
  <script type="application/ld+json">
  ${ld}
  </script>
  `;
}

function nav(c: Content, lang: Lang): string {
  const n = c.nav;
  const links = items(n.links).map((l) => `<a ${linkAttrs(str(l.href))}${l.accent ? ' class="nav-support"' : ''}>${withIcon(l.icon, esc(str(l.label)))}</a>`);
  return `
      <nav class="nav-links">
        ${links.join('\n        ')}
      </nav>
      <div class="push row">
        <a class="btn hidden" id="nav-admin" href="/admin" title="${esc(str(n.admin))}"><i class="fa-solid fa-shield-halved"></i> <span class="label">${esc(str(n.admin))}</span></a>
        <a class="btn" id="nav-account" href="${UI[lang].account}" title="${esc(str(n.accountTitle) || str(n.account))}"><i class="fa-solid fa-user"></i> <span class="label">${esc(str(n.account))}</span></a>
        <a class="btn primary" href="#pobierz"><i class="fa-solid fa-download"></i> <span class="label">${esc(str(n.download))}</span></a>
      </div>
      `;
}

function hero(c: Content, lang: Lang): string {
  const h = c.hero;
  const pill = h.pillShow && str(h.pillText)
    ? `
        <a class="pill" ${linkAttrs(str(h.pillHref) || '#funkcje')}><span class="dot"></span> ${esc(str(h.pillText))} <i class="fa-solid fa-arrow-right"></i></a>`
    : '';
  const secondary = str(h.secondaryLabel)
    ? `
          <a class="btn huge ghost" ${linkAttrs(str(h.secondaryHref) || '#funkcje')}>${withIcon(h.secondaryIcon, esc(str(h.secondaryLabel)))}</a>`
    : '';
  // the scripts put the visitor's system in place of {os} (home.js), and the other systems below
  const data = `data-label="${esc(str(h.download))}" data-other="${esc(str(h.otherSystems))}" data-phone="${esc(str(h.phoneLabel))}" data-phone-note="${esc(str(h.phoneNote))}" data-path="${UI[lang].download}"`;
  return `
    <section class="hero2">
      <div class="wrap center">${pill}
        <h1>${esc(str(h.titleBefore))}<span class="grad">${esc(str(h.titleHighlight))}</span>${esc(str(h.titleAfter))}</h1>
        <p class="lead">${inline(str(h.lead))}</p>
        <div class="cta">
          <a class="btn primary huge glow" id="download-main" href="${UI[lang].download}windows" ${data}><i class="fa-brands fa-windows" id="os-icon"></i> <span id="os-label">${esc(str(h.download).replaceAll('{os}', 'Windows'))}</span></a>${secondary}
        </div>
        <p class="download-note" id="download-note"></p>
      </div>
      <div class="wrap shot-stage">
        <div class="float-cape fc1 cape" data-cape="galaxy" aria-hidden="true"></div>
        <div class="float-cape fc2 cape" data-cape="ember" aria-hidden="true"></div>
        <figure class="hero-shot" id="hero-shot">
          <img src="${esc(str(h.image))}" alt="${esc(str(h.imageAlt))}" width="1600" height="900">
        </figure>
      </div>
    </section>
    `;
}

function block(b: Item, i: number, lang: Lang): string {
  const cosmetics = b.kind === 'cosmetics';
  const bullets = (b.bullets as string[]).length
    ? `
            <ul class="checks">
              ${(b.bullets as string[]).map((t) => `<li>${esc(t)}</li>`).join('\n              ')}
            </ul>`
    : '';
  const button = str(b.buttonLabel)
    ? `
            <a class="btn" ${linkAttrs(str(b.buttonHref) || '#pobierz')}>${withIcon(b.buttonIcon, esc(str(b.buttonLabel)))}</a>`
    : '';
  const pictures = [[b.image, b.imageAlt, 'frame'], [b.image2, b.image2Alt, 'frame small']].filter(([src]) => str(src));
  const media = cosmetics
    ? `
          <div class="show-media figure-stage">
            <div class="figure" id="cosmetic-3d" aria-label="${UI[lang].figure}"></div>
            <div class="figure-caption" id="cosmetic-3d-caption"></div>
          </div>`
    : pictures.length
      ? `
          <div class="show-media${pictures.length > 1 ? ' stack' : ''}">
            ${pictures.map(([src, alt, cls]) => `<img class="${cls}" src="${esc(str(src))}" alt="${esc(str(alt))}" loading="lazy">`).join('\n            ')}
          </div>`
      : '';
  return `
        <div class="show${i % 2 ? ' reverse' : ''} reveal"${str(b.anchor) ? ` id="${esc(str(b.anchor))}"` : ''}>
          <div class="show-text">
            <span class="tag">${withIcon(b.icon, esc(str(b.tag)))}</span>
            <h3>${esc(str(b.title))}</h3>${str(b.text) ? `
            <p>${inline(str(b.text))}</p>` : ''}${bullets}${cosmetics ? `
            <div class="cape-strip" id="cape-strip"></div>` : ''}${button}
          </div>${media}
        </div>
`;
}

/** A section's small heading: the eyebrow and the title (each left out when empty). */
function heading(s: Item, cls = 'head center reveal', indent = '        '): string {
  return `<div class="${cls}">${str(s.eyebrow) ? `
${indent}  <span class="eyebrow">${esc(str(s.eyebrow))}</span>` : ''}${str(s.title) ? `
${indent}  <h2>${esc(str(s.title))}</h2>` : ''}
${indent}</div>`;
}

function showcase(c: Content, lang: Lang): string {
  return `
    <section id="funkcje">
      <div class="wrap">
        ${heading(c.showcase)}
${items(c.showcase.blocks).map((b, i) => block(b, i, lang)).join('')}      </div>
    </section>
    `;
}

function modules(c: Content): string {
  const list = items(c.modules.items);
  const half = Math.ceil(list.length / 2);
  const pill = (m: Item) => `<span class="mod">${ic(m.icon)}${esc(str(m.name))}</span>`;
  // each row twice, so the loop has no seam
  const row = (part: Item[]) => [...part, ...part].map(pill).join('');
  return `
    <section class="modules">
      ${heading(c.modules, 'wrap head center reveal', '      ')}
      <div class="marquee" aria-hidden="true"><div class="track" id="mq1">${row(list.slice(0, half))}</div></div>
      <div class="marquee reverse" aria-hidden="true"><div class="track" id="mq2">${row(list.slice(half))}</div></div>
    </section>
    `;
}

function features(c: Content): string {
  const cards = items(c.features.items).map((f) => `<div class="gf reveal">${ic(f.icon)}<h3>${esc(str(f.title))}</h3><p>${inline(str(f.text))}</p></div>`);
  return `
    <section>
      <div class="wrap">
        ${heading(c.features)}
        <div class="grid-features" id="features">
          ${cards.join('\n          ')}
        </div>
      </div>
    </section>
    `;
}

function faq(c: Content): string {
  const list = items(c.faq.items).map((q, i) => `<details${i === 0 && c.faq.openFirst ? ' open' : ''}><summary>${esc(str(q.q))}</summary><p>${inline(str(q.a))}</p></details>`);
  return `
    <section id="faq">
      <div class="wrap narrow">
        ${heading(c.faq)}
        <div class="faq reveal" id="faq-list">
          ${list.join('\n          ')}
        </div>
      </div>
    </section>
    `;
}

function final(c: Content, lang: Lang): string {
  const f = c.final;
  return `
    <section id="pobierz">
      <div class="wrap">
        <div class="final reveal">
          <img src="/vendor/logo.png" alt="" width="72" height="72">
          <h2>${esc(str(f.title))}</h2>${str(f.text) ? `
          <p>${inline(str(f.text))}</p>` : ''}
          <div class="cta">
            <a class="btn huge light" id="download-final" href="${UI[lang].download}windows"><i class="fa-solid fa-download"></i> ${esc(str(f.button))}</a>
          </div>
        </div>
      </div>
    </section>
    `;
}

function footer(c: Content, lang: Lang): string {
  const f = c.footer;
  const other: Lang = lang === 'pl' ? 'en' : 'pl';
  const links = [
    ...items(f.links).map((l) => [str(l.href), withIcon(l.icon, esc(str(l.label))), '']),
    [UI[lang].terms, esc(str(f.terms)), ''],
    [UI[lang].privacy, esc(str(f.privacy)), ''],
    ...(f.langShow && str(f.langLabel) ? [[UI[other].path, esc(str(f.langLabel)), ` hreflang="${other}" lang="${other}"`]] : []),
  ].map(([href, label, extra], i) => `<a class="${i === 0 ? 'push ' : ''}foot-link" ${linkAttrs(href)}${extra}>${label}</a>`);
  return `
      <span class="muted small">${esc(str(f.note))}</span>
      ${links.join('\n      ')}
    `;
}

/** Each marked part of the page, made from the content. */
export function regions(c: Content, lang: Lang, base: string): Record<string, string> {
  return {
    head: head(c, lang, base), nav: nav(c, lang), hero: hero(c, lang), showcase: showcase(c, lang), modules: modules(c),
    features: features(c), faq: faq(c), final: final(c, lang), footer: footer(c, lang),
  };
}

const MARK = /<!--home:([a-z]+)-->[\s\S]*?<!--\/home:\1-->/g;

/** The page: the template with its marked parts made from the content, in the content's language. */
export function homePage(template: string, c: Content, lang: Lang, base: string, keepMarks = false): string {
  const parts = regions(c, lang, base.replace(/\/+$/, ''));
  return template
    .replace(/<html lang="[a-z]{2}">/, `<html lang="${lang}">`)
    .replace(MARK, (whole, name: string) => (name in parts ? (keepMarks ? `<!--home:${name}-->${parts[name]}<!--/home:${name}-->` : parts[name]) : whole));
}

/** The marked parts of a template, as they are written there (for the test that keeps the file and the defaults the same). */
export function templateRegions(template: string): Record<string, string> {
  return Object.fromEntries([...template.matchAll(MARK)].map((m) => [m[1], m[0].slice(`<!--home:${m[1]}-->`.length, -`<!--/home:${m[1]}-->`.length)]));
}
