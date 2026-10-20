import { t } from '../shared/i18n';
import { sparks, sparkAmount } from '../shared/sparks';
import { confirmDialog, el } from './dialog';

/**
 * Buying cosmetics with sparks (the currency of achievements): the question before a purchase and
 * the purchase itself, shared by the achievements view's shop and the cosmetics menu. The server
 * decides everything (price, balance, whether it is for sale); this only asks and shows the answer.
 */

export interface ShopItem { id: string; slot: string; name: string; price?: number; owned?: boolean }

export interface ShopDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

/** The player's balance now (0 when signed out or the server is older). */
export async function balanceOf(api: any): Promise<number> {
  const w: { balance?: number } | undefined = await api.socialApi('GET', '/v1/wallet').catch(() => undefined);
  return w?.balance ?? 0;
}

/** What a missing amount reads as, or '' when the balance covers the price. */
export function shortBy(price: number, balance: number): string {
  return balance >= price ? '' : t('Brakuje Ci {0}.', sparks(price - balance));
}

/**
 * Asks, then buys. Resolves the new balance after a purchase, undefined when the player said no or
 * it failed (the toast says why).
 */
export async function buyWithConfirm(item: ShopItem, balance: number, deps: ShopDeps, picture?: Node): Promise<number | undefined> {
  const price = item.price ?? 0;
  const missing = shortBy(price, balance);
  if (missing) {
    deps.toast(t('Za mało Iskier na {0}. {1}', item.name, missing), true);
    return undefined;
  }
  const yes = await confirmDialog({
    title: t('Kupić {0}?', item.name),
    body: [
      ...(picture ? [el('div', { className: 'shop-confirm-picture' }, picture)] : []),
      el('p', { textContent: t('Cena: {0}. Po zakupie zostanie Ci {1}.', sparks(price), sparks(balance - price)) }),
      el('p', { className: 'muted', textContent: t('Przedmiot zostaje na Twoim koncie SlashClient na zawsze. Iskier nie da się odzyskać.') }),
    ],
    ok: t('Kup za {0}', sparkAmount(price)),
    okIcon: 'fa-cart-shopping',
  });
  if (!yes) return undefined;
  try {
    const res: { balance: number } = await deps.api.socialApi('POST', `/v1/shop/${item.id}/buy`, {});
    deps.toast(t('Kupiono: {0}. Zostało Ci {1}.', item.name, sparks(res.balance)));
    return res.balance;
  } catch (err) {
    deps.toast(deps.errorText(err), true);
    return undefined;
  }
}
