// Sparks ("Iskry", the achievements' currency) on the website: the balance, the achievements in
// categories, the history, and buying a cosmetic from the shop (the account page uses these).
import { L, api, confirmModal, el, english, guard, icon, locale, toast } from './common.js';
import { featureOn, siteFeatures } from './siteBanner.js';

/** The currency's names, in one place here (the server's economy.ts and the launcher's sparks.ts have theirs). */
export const CURRENCY = { forms: ['Iskra', 'Iskry', 'Iskier'], formsEn: ['Spark', 'Sparks'], sign: '✦' };

/** "1 Iskra", "3 Iskry", "12 Iskier"; in English "1 Spark", "12 Sparks". */
export function sparks(n) {
  const a = Math.abs(n);
  if (english()) return `${n.toLocaleString('en-GB')} ${CURRENCY.formsEn[a === 1 ? 0 : 1]}`;
  const form = a === 1 ? 0 : a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14) ? 1 : 2;
  return `${n.toLocaleString('pl-PL')} ${CURRENCY.forms[form]}`;
}

/** The sign and the amount, for tight spots. */
export const priceTag = (n) => el('span', { class: 'spark-price' }, el('span', { class: 'spark-sign', textContent: CURRENCY.sign }), ` ${n.toLocaleString(locale())}`);

/** Each category's name, icon and English name (as in the launcher). */
const CATEGORIES = {
  play: ['Gra', 'fa-gamepad', 'Play'], streak: ['Serie', 'fa-fire', 'Streaks'], social: ['Znajomi', 'fa-user-group', 'Friends'], community: ['Grupy i klany', 'fa-people-group', 'Groups and clans'],
  explore: ['Serwery', 'fa-compass', 'Servers'], skyup: ['SkyUp.pl', 'fa-cloud-sun', 'SkyUp.pl'], sharing: ['Udostępnianie', 'fa-share-nodes', 'Sharing'], style: ['Styl', 'fa-wand-magic-sparkles', 'Style'], secret: ['Ukryte', 'fa-mask', 'Hidden'],
};

/**
 * Asks and buys an item from the shop; resolves true when bought. `balance` is the one last known
 * (the server checks it again).
 */
export async function buy(item, balance) {
  // the shop may be switched off for a while in the admin panel
  if (!featureOn((await siteFeatures).features, 'shop')) {
    toast(L('Sklep jest chwilowo wyłączony. Spróbuj później.', 'The shop is switched off for now. Try later.'), true);
    return false;
  }
  if (balance < item.price) {
    toast(L(`Za mało Iskier na ${item.name}: brakuje ${sparks(item.price - balance)}.`, `Not enough Sparks for ${item.name}: you need ${sparks(item.price - balance)} more.`), true);
    return false;
  }
  if (!await confirmModal({ title: L(`Kupić ${item.name} za ${sparks(item.price)}?`, `Buy ${item.name} for ${sparks(item.price)}?`),
    text: L(`Zostanie Ci ${sparks(balance - item.price)}. Przedmiot zostaje na koncie na zawsze.`, `You will have ${sparks(balance - item.price)} left. The item stays on your account for good.`), ok: L('Kup', 'Buy'), okIcon: 'fa-solid fa-cart-shopping' })) return false;
  const res = await guard(() => api('POST', `/v1/shop/${item.id}/buy`, {}));
  if (!res) return false;
  toast(L(`Kupiono: ${item.name}. Zostało Ci ${sparks(res.balance)}.`, `Bought: ${item.name}. You have ${sparks(res.balance)} left.`));
  return true;
}

/** The card with the balance, the achievements in categories and the latest changes of the balance. */
export async function achievementsCard() {
  const [mine, wallet] = await Promise.all([api('GET', '/v1/achievements').catch(() => undefined), api('GET', '/v1/wallet?limit=20').catch(() => undefined)]);
  if (!mine) return '';
  const order = mine.categories ?? Object.keys(CATEGORIES);
  const unlocked = mine.achievements.filter((a) => a.unlockedAt).length;
  const EN = english();
  const card = el('div', { class: 'glass card sparks-card' },
    el('div', { class: 'row' },
      el('h3', { class: 'grow', textContent: L('Osiągnięcia i Iskry', 'Achievements and Sparks') }),
      mine.sparks ? el('span', { class: 'chip gold spark-balance', title: L('Saldo', 'Balance') }, el('span', { class: 'spark-sign', textContent: CURRENCY.sign }), sparks(mine.sparks.balance)) : ''),
    el('p', { class: 'muted small', textContent: EN
      ? `Unlocked: ${unlocked} of ${mine.achievements.length}.${mine.sparks ? ` Earned from achievements: ${sparks(mine.sparks.earned)} of ${mine.sparks.total.toLocaleString('en-GB')} possible.` : ''} Spend Sparks in the shop: the cosmetics with a price below.`
      : `Odblokowane: ${unlocked} z ${mine.achievements.length}.${mine.sparks ? ` Zdobyte z osiągnięć: ${sparks(mine.sparks.earned)} z ${mine.sparks.total.toLocaleString('pl-PL')} możliwych.` : ''} Iskry wydasz w sklepie: kosmetyki z ceną poniżej.` }));
  for (const c of order) {
    const items = mine.achievements.filter((a) => (a.category ?? 'other') === c);
    if (!items.length) continue;
    const [namePl, ic, nameEn] = CATEGORIES[c] ?? ['Inne', 'fa-star', 'Other'];
    const name = EN ? nameEn : namePl;
    card.append(el('div', { class: 'ach-cat' },
      el('h4', {}, icon(`fa-solid ${ic}`), ` ${name} `, el('span', { class: 'muted small', textContent: `${items.filter((a) => a.unlockedAt).length}/${items.length}` })),
      el('div', { class: 'ach-list' }, ...items.map((a) => {
        const done = !!a.unlockedAt;
        const bar = el('span', { class: 'ach-progress' });
        bar.style.width = `${Math.round((a.progress ?? 0) * 100)}%`;
        const description = EN ? a.descriptionEn || a.description : a.description;
        return el('div', { class: `ach-item${done ? ' done' : ''}`, title: description },
          icon(`fa-solid ${done ? (/^fa-[a-z0-9-]+$/.test(a.icon ?? '') ? a.icon : 'fa-trophy') : a.hidden ? 'fa-question' : 'fa-lock'}`),
          el('div', { class: 'grow' }, el('b', { textContent: EN ? a.nameEn || a.name : a.name }), el('span', { class: 'muted small', textContent: description }),
            !done && a.progress !== undefined ? el('div', { class: 'ach-bar' }, bar) : ''),
          a.sparks ? el('span', { class: `ach-reward${done ? ' got' : ''}`, textContent: `${CURRENCY.sign} ${a.sparks}` }) : '');
      }))));
  }
  if (wallet?.ledger?.length) {
    card.append(el('div', { class: 'ach-cat' }, el('h4', {}, icon('fa-solid fa-clock-rotate-left'), L(' Ostatnie zmiany', ' Latest changes')),
      el('div', { class: 'ledger' }, ...wallet.ledger.map((e) => {
        const label = (EN && e.labelEn) || e.label || e.ref;
        return el('div', { class: 'ledger-row' },
        el('span', { class: 'grow', textContent: e.reason === 'achievement' ? L(`Osiągnięcie: ${label}`, `Achievement: ${label}`) : e.reason === 'purchase' ? L(`Zakup: ${label}`, `Purchase: ${label}`)
          : e.reason === 'challenge' ? L(`Wyzwanie: ${label}`, `Challenge: ${label}`) : L(`Od administracji: ${e.note}`, `From the admins: ${e.note}`) }),
        el('span', { class: 'muted small', textContent: new Date(e.at).toLocaleDateString(locale()) }),
        el('b', { class: e.amount > 0 ? 'plus' : 'minus', textContent: `${e.amount > 0 ? '+' : '−'}${Math.abs(e.amount)}` }));
      }))));
  }
  return card;
}
