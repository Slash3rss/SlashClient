import { locale, t } from '../shared/i18n';
import { el, icon } from './dialog';
import { openPaymentHistory } from './paymentHistory';

/**
 * "Wesprzyj projekt" in Settings: what supporting gives (and does not), the player's current
 * supporter tier from the server, and a button that opens the website's support page in the
 * browser. Payments happen only there, at the payment provider; the launcher never sees them.
 */

export interface SupportDeps {
  api: any;
  /** The SlashClient server's address (settings.socialUrl). */
  socialUrl: () => string;
  /** A note when an admin answers a refund request (optional for older callers). */
  toast?: (message: string, isError?: boolean) => void;
}

interface Supporter { tier: string; name: string; nameEn: string; color: string; expiresAt: number | null; past: boolean; since: number }

/** The website's support page for a server address; only http(s) addresses. */
export function supportPageUrl(socialUrl: string): string | undefined {
  const base = socialUrl.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+$/.test(base) ? `${base}/wsparcie` : undefined;
}

/** The website's account page at its "Wsparcie projektu" card (payments and refunds). */
export function accountSupportUrl(socialUrl: string): string | undefined {
  const page = supportPageUrl(socialUrl);
  return page && page.replace(/\/wsparcie$/, '/konto#wsparcie');
}

/** What the launcher says when a refund request changes (the server's "support-refund" event). */
export function refundNote(status: string, answer = ''): string | undefined {
  if (status === 'approved') return t('Zwrot zaakceptowany: pieniądze są w drodze.');
  if (status === 'refunded') return t('Zwrot gotowy: pieniądze wróciły na Twoją metodę płatności.');
  if (status === 'rejected') return answer ? t('Prośba o zwrot odrzucona: {0}', answer) : t('Prośba o zwrot odrzucona.');
  return undefined;
}

export function createSupportCard(root: HTMLElement, deps: SupportDeps) {
  const status = el('p', { className: 'muted support-status' });
  const open = el('button', { type: 'button', className: 'primary' }, icon('fa-heart'), ' ', t('Wesprzyj projekt'));
  open.addEventListener('click', () => {
    const url = supportPageUrl(deps.socialUrl());
    // the main process opens https pages in the system browser (setWindowOpenHandler)
    if (url) window.open(url, '_blank');
  });
  const openAccount = () => {
    const url = accountSupportUrl(deps.socialUrl());
    if (url) window.open(url, '_blank');
  };
  const history = el('button', { type: 'button' }, icon('fa-receipt'), ' ', t('Historia płatności'));
  history.addEventListener('click', () => void openPaymentHistory({ api: deps.api, openAccount, toast: deps.toast ?? (() => {}) }));
  const account = el('button', { type: 'button' }, icon('fa-arrow-up-right-from-square'), ' ', t('Płatności i zwroty na stronie'));
  account.addEventListener('click', openAccount);
  // an admin answered a refund request: said here, and the tier shown again
  deps.api.on?.('social:event', (e: { type?: string; status?: string; answer?: string }) => {
    if (e?.type !== 'support-refund') return;
    const note = refundNote(String(e.status ?? ''), String(e.answer ?? ''));
    if (note) deps.toast?.(note, e.status === 'rejected');
    void refresh();
  });
  root.append(
    el('h3', {}, icon('fa-heart'), ' ', t('Wesprzyj projekt')),
    el('p', { className: 'muted', textContent: t('SlashClient jest darmowy. Jeśli chcesz pomóc utrzymać serwer i rozwój, możesz go dobrowolnie wesprzeć na stronie: dostaniesz rangę Wspierający, kosmetyki i więcej miejsca w chmurze. Bez przewag w grze. Masz mniej niż 18 lat? Poproś rodzica lub opiekuna o zgodę.') }),
    status,
    el('div', { className: 'row' }, open, history, account),
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
