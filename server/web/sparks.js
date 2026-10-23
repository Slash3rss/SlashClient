// Sparks ("Iskry", the achievements' currency) on the website: the balance, the achievements in
// categories, the history, and buying a cosmetic from the shop (the account page uses these).
import { api, confirmModal, el, guard, icon, toast } from './common.js';
import { featureOn, siteFeatures } from './siteBanner.js';

/** The currency's names, in one place here (the server's economy.ts and the launcher's sparks.ts have theirs). */
export const CURRENCY = { forms: ['Iskra', 'Iskry', 'Iskier'], sign: '✦' };

/** "1 Iskra", "3 Iskry", "12 Iskier". */
export function sparks(n) {
  const a = Math.abs(n);
  const form = a === 1 ? 0 : a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14) ? 1 : 2;
  return `${n.toLocaleString('pl-PL')} ${CURRENCY.forms[form]}`;
}

/** The sign and the amount, for tight spots. */
export const priceTag = (n) => el('span', { class: 'spark-price' }, el('span', { class: 'spark-sign', textContent: CURRENCY.sign }), ` ${n.toLocaleString('pl-PL')}`);

const CATEGORIES = {
  play: ['Gra', 'fa-gamepad'], streak: ['Serie', 'fa-fire'], social: ['Znajomi', 'fa-user-group'], community: ['Grupy i klany', 'fa-people-group'],
  explore: ['Serwery', 'fa-compass'], skyup: ['SkyUp.pl', 'fa-cloud-sun'], sharing: ['Udostępnianie', 'fa-share-nodes'], style: ['Styl', 'fa-wand-magic-sparkles'], secret: ['Ukryte', 'fa-mask'],
};

/**
 * Asks and buys an item from the shop; resolves true when bought. `balance` is the one last known
 * (the server checks it again).
 */
export async function buy(item, balance) {
  // the shop may be switched off for a while in the admin panel
  if (!featureOn((await siteFeatures).features, 'shop')) {
    toast('Sklep jest chwilowo wyłączony. Spróbuj później.', true);
    return false;
  }
  if (balance < item.price) {
    toast(`Za mało Iskier na ${item.name}: brakuje ${sparks(item.price - balance)}.`, true);
    return false;
  }
  if (!await confirmModal({ title: `Kupić ${item.name} za ${sparks(item.price)}?`, text: `Zostanie Ci ${sparks(balance - item.price)}. Przedmiot zostaje na koncie na zawsze.`, ok: 'Kup', okIcon: 'fa-solid fa-cart-shopping' })) return false;
  const res = await guard(() => api('POST', `/v1/shop/${item.id}/buy`, {}));
  if (!res) return false;
  toast(`Kupiono: ${item.name}. Zostało Ci ${sparks(res.balance)}.`);
  return true;
}

/** The card with the balance, the achievements in categories and the latest changes of the balance. */
export async function achievementsCard() {
  const [mine, wallet] = await Promise.all([api('GET', '/v1/achievements').catch(() => undefined), api('GET', '/v1/wallet?limit=20').catch(() => undefined)]);
  if (!mine) return '';
  const order = mine.categories ?? Object.keys(CATEGORIES);
  const unlocked = mine.achievements.filter((a) => a.unlockedAt).length;
  const card = el('div', { class: 'glass card sparks-card' },
    el('div', { class: 'row' },
      el('h3', { class: 'grow', textContent: 'Osiągnięcia i Iskry' }),
      mine.sparks ? el('span', { class: 'chip gold spark-balance', title: 'Saldo' }, el('span', { class: 'spark-sign', textContent: CURRENCY.sign }), sparks(mine.sparks.balance)) : ''),
    el('p', { class: 'muted small', textContent: `Odblokowane: ${unlocked} z ${mine.achievements.length}.${mine.sparks ? ` Zdobyte z osiągnięć: ${sparks(mine.sparks.earned)} z ${mine.sparks.total.toLocaleString('pl-PL')} możliwych.` : ''} Iskry wydasz w sklepie: kosmetyki z ceną poniżej.` }));
  for (const c of order) {
    const items = mine.achievements.filter((a) => (a.category ?? 'other') === c);
    if (!items.length) continue;
    const [name, ic] = CATEGORIES[c] ?? ['Inne', 'fa-star'];
    card.append(el('div', { class: 'ach-cat' },
      el('h4', {}, icon(`fa-solid ${ic}`), ` ${name} `, el('span', { class: 'muted small', textContent: `${items.filter((a) => a.unlockedAt).length}/${items.length}` })),
      el('div', { class: 'ach-list' }, ...items.map((a) => {
        const done = !!a.unlockedAt;
        const bar = el('span', { class: 'ach-progress' });
        bar.style.width = `${Math.round((a.progress ?? 0) * 100)}%`;
        return el('div', { class: `ach-item${done ? ' done' : ''}`, title: a.description },
          icon(`fa-solid ${done ? (/^fa-[a-z0-9-]+$/.test(a.icon ?? '') ? a.icon : 'fa-trophy') : a.hidden ? 'fa-question' : 'fa-lock'}`),
          el('div', { class: 'grow' }, el('b', { textContent: a.name }), el('span', { class: 'muted small', textContent: a.description }),
            !done && a.progress !== undefined ? el('div', { class: 'ach-bar' }, bar) : ''),
          a.sparks ? el('span', { class: `ach-reward${done ? ' got' : ''}`, textContent: `${CURRENCY.sign} ${a.sparks}` }) : '');
      }))));
  }
  if (wallet?.ledger?.length) {
    card.append(el('div', { class: 'ach-cat' }, el('h4', {}, icon('fa-solid fa-clock-rotate-left'), ' Ostatnie zmiany'),
      el('div', { class: 'ledger' }, ...wallet.ledger.map((e) => el('div', { class: 'ledger-row' },
        el('span', { class: 'grow', textContent: e.reason === 'achievement' ? `Osiągnięcie: ${e.label || e.ref}` : e.reason === 'purchase' ? `Zakup: ${e.label || e.ref}` : e.reason === 'challenge' ? `Wyzwanie: ${e.label || e.ref}` : `Od administracji: ${e.note}` }),
        el('span', { class: 'muted small', textContent: new Date(e.at).toLocaleDateString('pl-PL') }),
        el('b', { class: e.amount > 0 ? 'plus' : 'minus', textContent: `${e.amount > 0 ? '+' : '−'}${Math.abs(e.amount)}` }))))));
  }
  return card;
}
