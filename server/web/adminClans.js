// The admin panel's "Klany": every clan with its tag, name, members and logo. An offensive logo can
// be taken off (the clan stays), or the whole clan removed; both go to the log.
import { $, api, el, fmtDate, guard, icon, toast } from './common.js';

export async function clansPage() {
  const res = await guard(() => api('GET', '/v1/admin/clans'));
  if (!res) return;
  const rows = res.clans.map((c) => {
    const logo = c.logo
      ? el('img', { class: 'clan-logo', src: `/v1/clans/${encodeURIComponent(c.id)}/logo.png?v=${c.logo}`, alt: '', width: 32, height: 32 })
      : el('span', { class: 'clan-logo clan-logo-none', textContent: c.tag.slice(0, 3) });
    const removeLogo = c.logo ? el('button', { title: 'Usuń logo', onclick: async () => {
      if (!confirm(`Usunąć logo klanu [${c.tag}]?`)) return;
      if (await guard(() => api('DELETE', `/v1/admin/clans/${c.id}/logo`))) { toast('Logo usunięte.'); clansPage(); }
    } }, icon('fa-solid fa-eraser'), 'Usuń logo') : '';
    const remove = el('button', { class: 'danger', title: 'Usuń klan', onclick: async () => {
      if (!confirm(`Usunąć klan [${c.tag}] ${c.name}? Zniknie razem z czatem dla wszystkich członków.`)) return;
      if (await guard(() => api('DELETE', `/v1/admin/clans/${c.id}`))) { toast('Klan usunięty.'); clansPage(); }
    } }, icon('fa-solid fa-trash-can'));
    return el('tr', {},
      el('td', {}, logo),
      el('td', {}, el('b', { textContent: `[${c.tag}]` }), ' ', c.name),
      el('td', { textContent: String(c.members) }),
      el('td', { class: 'hide-sm', textContent: fmtDate(c.createdAt) }),
      el('td', {}, el('div', { class: 'row' }, removeLogo, remove)));
  });
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Klany' })),
    el('p', { class: 'muted', textContent: 'Tag i logo klanu widać przy nicku jego członków w launcherze i w grze. Obraźliwe logo można usunąć bez usuwania klanu.' }),
    el('div', { class: 'glass card' }, rows.length
      ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Logo' }), el('th', { textContent: 'Klan' }), el('th', { textContent: 'Członkowie' }), el('th', { class: 'hide-sm', textContent: 'Od' }), el('th', { textContent: '' }))), el('tbody', {}, ...rows))
      : el('p', { class: 'muted', textContent: 'Nie ma jeszcze klanów.' })));
}
