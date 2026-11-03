/**
 * The site's footer, as the home page has it by default: the logo, the note and the same links, so every page
 * ends the same way. The pages written in HTML (web/*.html) carry the same, with data-en for English.
 */
export function siteFooter(lang: 'pl' | 'en'): string {
  const en = lang === 'en';
  const links: [string, string][] = en
    ? [['/bugs', 'Report a bug'], ['/account', 'Your account'], ['/support', '<i class="fa-solid fa-heart"></i> Support the project'], ['/terms', 'Terms of Service'], ['/privacy', 'Privacy Policy']]
    : [['/zgloszenia', 'Zgłoś błąd'], ['/konto', 'Twoje konto'], ['/wsparcie', '<i class="fa-solid fa-heart"></i> Wesprzyj projekt'], ['/regulamin', 'Regulamin'], ['/polityka-prywatnosci', 'Polityka prywatności']];
  return `<footer class="foot">
    <div class="wrap foot-row">
      <a class="brand" href="${en ? '/en' : '/'}"><img src="/vendor/logo.png" alt=""><span>Slash<b>Client</b></span></a>
      <span class="muted small">${en ? 'Not affiliated with Mojang or Microsoft.' : 'Nie jest powiązany z Mojang ani Microsoft.'}</span>
      ${links.map(([href, label], i) => `<a class="${i === 0 ? 'push ' : ''}foot-link" href="${href}">${label}</a>`).join('\n      ')}
      <a class="foot-link" href="${en ? '/' : '/en'}" hreflang="${en ? 'pl' : 'en'}" lang="${en ? 'pl' : 'en'}">${en ? 'Polski' : 'English'}</a>
    </div>
  </footer>`;
}

/**
 * The header's links and buttons as the pages written in HTML have them (the admin panel's button, the account
 * button with the player's name put in by navState.js, the download), so the header does not change between pages.
 */
export function siteNav(lang: 'pl' | 'en', links: readonly (readonly [string, string])[]): string {
  const en = lang === 'en';
  const link = ([href, label]: readonly [string, string]) => /^\/(wsparcie|support)$/.test(href)
    ? `<a href="${href}" class="nav-support"><i class="fa-solid fa-heart"></i> ${label}</a>`
    : `<a href="${href}">${label}</a>`;
  return `<nav class="nav-links">
        ${links.map(link).join('\n        ')}
      </nav>
      <div class="push row">
        <a class="btn hidden" id="nav-admin" href="/admin" title="${en ? 'Admin panel' : 'Panel admina'}"><i class="fa-solid fa-shield-halved"></i> <span class="label">${en ? 'Admin panel' : 'Panel admina'}</span></a>
        <a class="btn" id="nav-account" href="${en ? '/account' : '/konto'}" title="${en ? 'Your account' : 'Twoje konto'}"><i class="fa-solid fa-user"></i> <span class="label">${en ? 'Sign in' : 'Zaloguj się'}</span></a>
        <a class="btn primary" href="${en ? '/en' : '/'}#pobierz"><i class="fa-solid fa-download"></i> <span class="label">${en ? 'Download' : 'Pobierz'}</span></a>
      </div>`;
}
