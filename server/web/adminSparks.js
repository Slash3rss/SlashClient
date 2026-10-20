// The admin panel's sparks (the achievements' currency): a player's balance and history, giving and
// taking sparks with a reason (written to the admin log), and the shop's prices.
import { api, cosmeticEl, el, guard, icon, toast } from './common.js';
import { sparks } from './sparks.js';

/** The section in a player's drawer; loads itself. */
export function walletSection(userId) {
  const box = el('div', { class: 'wallet-admin' }, el('h4', { textContent: 'Iskry' }), el('p', { class: 'muted small', textContent: 'Wczytywanie…' }));
  const show = (w) => {
    const amount = el('input', { type: 'number', step: 1, placeholder: '+100 albo -50', required: true });
    const reason = el('input', { type: 'text', placeholder: 'Powód (widzi go gracz)', maxLength: 200, minLength: 3, required: true });
    const form = el('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      const n = Number(amount.value);
      if (!Number.isInteger(n) || !n) return toast('Podaj liczbę całkowitą różną od zera.', true);
      if (!confirm(`${n > 0 ? 'Dodać' : 'Odebrać'} ${sparks(Math.abs(n))}? Powód: ${reason.value.trim()}`)) return;
      const res = await guard(() => api('POST', `/v1/admin/users/${userId}/wallet`, { amount: n, reason: reason.value.trim() }));
      if (!res) return;
      toast(`Saldo: ${sparks(res.balance)}.`);
      show(res);
    } }, amount, reason, el('button', { type: 'submit' }, icon('fa-solid fa-coins'), 'Zapisz'));
    const rows = w.ledger.slice(0, 30).map((e) => el('tr', {},
      el('td', { class: 'nowrap', textContent: new Date(e.at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) }),
      el('td', { textContent: e.reason === 'achievement' ? `Osiągnięcie: ${e.label || e.ref}` : e.reason === 'purchase' ? `Zakup: ${e.label || e.ref}` : `Admin${e.by ? ` @${e.by}` : ''}: ${e.note}` }),
      el('td', { class: e.amount > 0 ? 'plus' : 'minus', textContent: `${e.amount > 0 ? '+' : ''}${e.amount}` }),
      el('td', { class: 'muted', textContent: String(e.balance) })));
    box.replaceChildren(el('h4', { textContent: 'Iskry' }),
      el('div', { class: 'row' }, el('span', { class: 'chip gold' }, '✦ ', sparks(w.balance))),
      form,
      rows.length ? el('table', { class: 'ledger-table' }, el('tbody', {}, ...rows)) : el('p', { class: 'muted small', textContent: 'Bez zmian salda.' }));
  };
  api('GET', `/v1/admin/users/${userId}/wallet`).then(show).catch(() => box.replaceChildren(el('h4', { textContent: 'Iskry' }), el('p', { class: 'muted small', textContent: 'Nie udało się wczytać salda.' })));
  return box;
}

/** The shop's items with their prices (changeable) and how many bought each; loads itself. */
export function shopSection() {
  const box = el('div', { class: 'glass card shop-admin' }, el('h3', { textContent: 'Sklep za Iskry' }));
  const load = async () => {
    const res = await guard(() => api('GET', '/v1/admin/shop'));
    if (!res) return;
    box.replaceChildren(el('h3', { textContent: 'Sklep za Iskry' }),
      el('p', { class: 'muted small', textContent: 'Kosmetyki kupowane za Iskry z osiągnięć. Zmiana ceny działa od razu dla kolejnych zakupów; pusta cena wraca do domyślnej.' }),
      el('div', { class: 'shop-admin-grid' }, ...res.items.map((i) => {
        const price = el('input', { type: 'number', min: 1, step: 1, value: i.price, title: `Domyślnie ${i.defaultPrice}` });
        const save = async () => {
          const value = price.value.trim() === '' ? null : Number(price.value);
          if (value === i.price) return;
          if (await guard(() => api('POST', `/v1/admin/shop/${i.id}`, { price: value }))) { toast('Cena zapisana.'); load(); }
        };
        price.addEventListener('change', save);
        return el('div', { class: 'shop-admin-item' }, cosmeticEl(i.id, i.slot, true),
          el('div', { class: 'grow' }, el('b', { textContent: i.name }), el('span', { class: 'muted small', textContent: `${i.slot} · kupiło: ${i.sold}${i.price !== i.defaultPrice ? ` · domyślnie ${i.defaultPrice}` : ''}` })),
          el('label', { class: 'row small' }, '✦', price));
      })));
  };
  load();
  return box;
}
