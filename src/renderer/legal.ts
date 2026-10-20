import { getLang, t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * The terms and the privacy policy in the launcher: links in Settings ("Informacje prawne"), the
 * note under the SlashClient sign-in in Friends, and a one-time toast when the server says one of
 * them changed in an important way. The documents live on the website; links open in the browser
 * (the main process sends https pages there).
 */

export const LEGAL_PATHS = {
  terms: { pl: '/regulamin', en: '/terms' },
  privacy: { pl: '/polityka-prywatnosci', en: '/privacy' },
  'support-terms': { pl: '/wsparcie/regulamin', en: '/support/terms' },
} as const;
export type LegalDoc = keyof typeof LEGAL_PATHS;

let socialUrl: () => string = () => '';

/** The page of a document on the given server, in the launcher's language; only http(s) servers. */
export function legalUrl(server: string, doc: LegalDoc, lang: 'pl' | 'en' = getLang()): string | undefined {
  const base = server.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+$/.test(base) ? `${base}${LEGAL_PATHS[doc][lang]}` : undefined;
}

function link(doc: LegalDoc, text: string): HTMLAnchorElement {
  const a = el('a', { href: '#', textContent: text });
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const url = legalUrl(socialUrl(), doc);
    if (url) window.open(url, '_blank');
  });
  return a;
}

/** "Logując się, akceptujesz Regulamin i Politykę prywatności." with links. */
export function legalNote(): HTMLElement {
  return el('small', { className: 'muted legal-note' }, t('Logując się, akceptujesz '), link('terms', t('Regulamin')), t(' i '), link('privacy', t('Politykę prywatności')), '.');
}

/** "Informacje prawne" in Settings. */
export function createLegalCard(root: HTMLElement, deps: { socialUrl: () => string }) {
  socialUrl = deps.socialUrl;
  const row = (doc: LegalDoc, ic: string, text: string) => {
    const b = el('button', { type: 'button' }, icon(ic), ' ', text, ' ', icon('fa-arrow-up-right-from-square'));
    b.addEventListener('click', () => {
      const url = legalUrl(socialUrl(), doc);
      if (url) window.open(url, '_blank');
    });
    return b;
  };
  root.append(
    el('h3', {}, icon('fa-scale-balanced'), ' ', t('O programie / Informacje prawne')),
    el('p', { className: 'muted', textContent: t('SlashClient nie jest oficjalnym produktem Minecraft. Nie jest zatwierdzony przez Mojang ani Microsoft ani z nimi powiązany.') }),
    el('div', { className: 'row legal-links' }, row('terms', 'fa-file-contract', t('Regulamin')), row('privacy', 'fa-user-shield', t('Polityka prywatności')), row('support-terms', 'fa-heart', t('Regulamin wsparcia'))),
  );
}

interface Notice { doc: LegalDoc; version: number; note: string }

/** Shows each important change of a document the signed-in player has not seen yet, once. */
export async function checkLegalNotices(api: any, toast: (message: string, isError?: boolean, action?: { label: string; run: () => void }) => void) {
  let notices: Notice[] = [];
  try {
    notices = ((await api.socialApi('GET', '/v1/me/legal-notices')) as { notices?: Notice[] }).notices ?? [];
  } catch {
    // an older server, or signed out
    return;
  }
  for (const n of notices) {
    if (!(n.doc in LEGAL_PATHS)) continue;
    const what = n.doc === 'privacy' ? t('Zaktualizowaliśmy politykę prywatności') : n.doc === 'support-terms' ? t('Zaktualizowaliśmy regulamin wsparcia') : t('Zaktualizowaliśmy regulamin');
    toast(n.note ? `${what}: ${n.note}` : `${what}.`, false, {
      label: t('Zobacz zmiany'),
      run: () => {
        const url = legalUrl(socialUrl(), n.doc);
        if (url) window.open(url, '_blank');
      },
    });
    // shown once: marked seen as soon as it is shown
    void api.socialApi('POST', '/v1/me/legal-notices/ack', { doc: n.doc, version: n.version }).catch(() => {});
  }
}
