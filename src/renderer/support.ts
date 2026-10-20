import { locale, t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * "Wesprzyj projekt" in Settings: what supporting gives (and does not), the player's current
 * supporter tier from the server, and a button that opens the website's support page in the
 * browser. Payments happen only there, at the payment provider; the launcher never sees them.
 */

export interface SupportDeps {
  api: any;
  /** The SlashClient server's address (settings.socialUrl). */
  socialUrl: () => string;
}

interface Supporter { tier: string; name: string; nameEn: string; color: string; expiresAt: number | null; past: boolean; since: number }

/** The website's support page for a server address; only http(s) addresses. */
export function supportPageUrl(socialUrl: string): string | undefined {
  const base = socialUrl.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+$/.test(base) ? `${base}/wsparcie` : undefined;
}

export function createSupportCard(root: HTMLElement, deps: SupportDeps) {
  const status = el('p', { className: 'muted support-status' });
  const open = el('button', { type: 'button', className: 'primary' }, icon('fa-heart'), ' ', t('Wesprzyj projekt'));
  open.addEventListener('click', () => {
    const url = supportPageUrl(deps.socialUrl());
    // the main process opens https pages in the system browser (setWindowOpenHandler)
    if (url) window.open(url, '_blank');
  });
  root.append(
    el('h3', {}, icon('fa-heart'), ' ', t('Wesprzyj projekt')),
    el('p', { className: 'muted', textContent: t('SlashClient jest darmowy. Jeśli chcesz pomóc utrzymać serwer i rozwój, możesz go dobrowolnie wesprzeć na stronie: dostaniesz rangę Wspierający, kosmetyki i więcej miejsca w chmurze. Bez przewag w grze. Masz mniej niż 18 lat? Poproś rodzica lub opiekuna o zgodę.') }),
    status,
    el('div', { className: 'row' }, open),
  );

  /** The tier the server says the signed-in account has now (nothing when signed out). */
  async function refresh() {
    let s: Supporter | null = null;
    try {
      s = ((await deps.api.socialApi('GET', '/v1/me')) as { supporter?: Supporter | null }).supporter ?? null;
    } catch {
      s = null;
    }
    status.replaceChildren();
    status.classList.toggle('hidden', !s);
    if (!s) return;
    if (s.past) {
      status.textContent = t('Dziękujemy za wcześniejsze wsparcie!');
      return;
    }
    const chip = el('span', { className: 'support-chip' }, icon('fa-heart'), ' ', locale().startsWith('pl') ? s.name : s.nameEn || s.name);
    chip.style.setProperty('--tier', s.color);
    status.append(chip, ' ', s.expiresAt ? t('do {0}', new Date(s.expiresAt).toLocaleDateString(locale())) : t('bez terminu'));
  }

  void refresh();
  return { refresh };
}
