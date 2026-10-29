// The admin panel's "Klany": every clan (search by tag, name or owner) and one clan in detail: its
// members and their roles, taking a member out, a new owner, a new name or tag (an offensive one that
// got through), the logo off, or the whole clan removed. Everything goes to the log, and the clan's
// members see the change at once in the launcher.
import { $, api, confirmModal, el, fmtDate, guard, icon, linkRow, toast } from './common.js';

const ROLES = { owner: 'lider', officer: 'oficer', member: 'członek' };

const logoOf = (c) => (c.logo
  ? el('img', { class: 'clan-logo', src: `/v1/clans/${encodeURIComponent(c.id)}/logo.png?v=${c.logo}`, alt: '', width: 32, height: 32 })
  : el('span', { class: 'clan-logo clan-logo-none', textContent: c.tag.slice(0, 3) }));

export async function clansPage(q = '') {
  const res = await guard(() => api('GET', `/v1/admin/clans?q=${encodeURIComponent(q)}`));
  if (!res) return;
  const search = el('input', { type: 'search', placeholder: 'Szukaj: tag, nazwa, @lider', value: q, 'aria-label': 'Szukaj klanu' });
  search.addEventListener('keydown', (e) => e.key === 'Enter' && clansPage(search.value.trim()));
  const rows = res.clans.map((c) => linkRow(() => clanPage(c.id),
    el('td', {}, logoOf(c)),
    el('td', {}, el('b', { textContent: `[${c.tag}]` }), ' ', c.name),
    el('td', { textContent: String(c.members) }),
    el('td', { class: 'hide-sm', textContent: c.ownerHandle ? `@${c.ownerHandle}` : '—' }),
    el('td', { class: 'hide-sm', textContent: fmtDate(c.createdAt) }),
    el('td', {}, el('button', { onclick: () => clanPage(c.id) }, icon('fa-solid fa-magnifying-glass'), el('span', { class: 'hide-sm', textContent: ' Szczegóły' })))));
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Klany' })),
    el('p', { class: 'muted', textContent: 'Tag i logo klanu widać przy nicku jego członków w launcherze i w grze. Obraźliwy tag, nazwę albo logo można zmienić lub usunąć bez usuwania klanu.' }),
    el('div', { class: 'glass card' }, el('div', { class: 'row' }, search, el('button', { onclick: () => clansPage(search.value.trim()) }, icon('fa-solid fa-magnifying-glass'), ' Szukaj')),
      rows.length
        ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Logo' }), el('th', { textContent: 'Klan' }), el('th', { textContent: 'Członkowie' }), el('th', { class: 'hide-sm', textContent: 'Lider' }), el('th', { class: 'hide-sm', textContent: 'Od' }), el('th', { textContent: '' }))), el('tbody', {}, ...rows))
        : el('p', { class: 'muted', textContent: q ? 'Nic nie pasuje.' : 'Nie ma jeszcze klanów.' })));
}

async function clanPage(id) {
  const res = await guard(() => api('GET', `/v1/admin/clans/${encodeURIComponent(id)}`));
  if (!res) return;
  const c = res.clan;
  const again = () => clanPage(id);
  const back = el('button', { onclick: () => clansPage() }, icon('fa-solid fa-arrow-left'), ' Wszystkie');

  // a new name and/or tag
  const tag = el('input', { type: 'text', value: c.tag, maxLength: 5, size: 6, 'aria-label': 'Tag klanu' });
  const name = el('input', { type: 'text', value: c.name, maxLength: res.limits?.nameMax ?? 32, 'aria-label': 'Nazwa klanu' });
  const rename = el('form', { class: 'row', onsubmit: async (e) => {
    e.preventDefault();
    const next = { tag: tag.value.trim(), name: name.value.trim() };
    if (next.tag === c.tag && next.name === c.name) return;
    if (await confirmModal({ title: `Zmienić klan na [${next.tag}] ${next.name}?`, text: 'Członkowie zobaczą nowy tag przy nicku od razu.', ok: 'Zmień', okIcon: 'fa-solid fa-pen' })
      && (await guard(() => api('POST', `/v1/admin/clans/${id}/rename`, next)))) {
      toast('Zmieniono.');
      again();
    }
  } }, tag, name, el('button', { type: 'submit' }, icon('fa-solid fa-pen'), ' Zmień tag i nazwę'));

  const tools = [];
  if (c.logo) tools.push(el('button', { onclick: async () => (await confirmModal({ title: `Usunąć logo klanu [${c.tag}]?`, ok: 'Usuń logo', okIcon: 'fa-solid fa-eraser', danger: true })) && (await guard(() => api('DELETE', `/v1/admin/clans/${id}/logo`))) && (toast('Logo usunięte.'), again()) }, icon('fa-solid fa-eraser'), ' Usuń logo'));
  tools.push(el('button', { class: 'danger', onclick: async () => {
    if (await confirmModal({ title: `Usunąć klan [${c.tag}] ${c.name}?`, text: `Zniknie razem z czatem dla wszystkich ${res.members.length} członków.`, ok: 'Usuń klan', okIcon: 'fa-solid fa-trash-can', danger: true })
      && (await guard(() => api('DELETE', `/v1/admin/clans/${id}`)))) {
      toast('Klan usunięty.');
      clansPage();
    }
  } }, icon('fa-solid fa-trash-can'), ' Usuń klan'));

  const members = res.members.map((m) => {
    const who = el('td', {}, el('b', { textContent: m.name || m.handle }), el('span', { class: 'muted', textContent: ` @${m.handle}` }), m.tagHidden ? el('div', { class: 'muted small', textContent: 'ukrywa tag przy nicku' }) : '');
    if (m.role === 'owner') return el('tr', {}, who, el('td', {}, el('span', { class: 'chip blue' }, icon('fa-solid fa-crown'), ' lider')), el('td', { class: 'hide-sm', textContent: fmtDate(m.joinedAt) }), el('td', {}));
    const role = el('select', { 'aria-label': `Rola gracza @${m.handle}` }, ...['officer', 'member'].map((r) => el('option', { value: r, textContent: ROLES[r], selected: m.role === r })));
    role.addEventListener('change', async () => {
      if (await guard(() => api('POST', `/v1/admin/clans/${id}/members/${m.id}/role`, { role: role.value }))) toast('Rola zmieniona.');
      again();
    });
    const lead = el('button', { title: 'Zrób liderem', 'aria-label': `Zrób liderem: @${m.handle}`, onclick: async () => {
      if (await confirmModal({ title: `Przekazać klan graczowi @${m.handle}?`, text: `Obecny lider @${c.owner.handle} zostanie oficerem.`, ok: 'Przekaż', okIcon: 'fa-solid fa-crown' })
        && (await guard(() => api('POST', `/v1/admin/clans/${id}/owner`, { user: m.id })))) {
        toast('Przekazano.');
        again();
      }
    } }, icon('fa-solid fa-crown'), el('span', { class: 'hide-sm', textContent: ' Lider' }));
    const kick = el('button', { class: 'danger', title: 'Wyrzuć z klanu', 'aria-label': `Wyrzuć z klanu: @${m.handle}`, onclick: async () => {
      if (await confirmModal({ title: `Wyrzucić @${m.handle} z klanu [${c.tag}]?`, ok: 'Wyrzuć', okIcon: 'fa-solid fa-user-minus', danger: true })
        && (await guard(() => api('DELETE', `/v1/admin/clans/${id}/members/${m.id}`)))) {
        toast('Wyrzucono.');
        again();
      }
    } }, icon('fa-solid fa-user-minus'));
    return el('tr', {}, who, el('td', {}, role), el('td', { class: 'hide-sm', textContent: fmtDate(m.joinedAt) }), el('td', {}, el('div', { class: 'row' }, lead, kick)));
  });
  const invites = res.invites.map((i) => el('tr', {}, el('td', {}, el('b', { textContent: i.name || i.handle }), el('span', { class: 'muted', textContent: ` @${i.handle}` })),
    el('td', { class: 'muted small', textContent: `zaprosił(a) @${i.by.handle}` }), el('td', { class: 'muted small hide-sm', textContent: fmtDate(i.at) })));

  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, back, el('h1', {}, logoOf(c), ' ', `[${c.tag}] ${c.name}`)),
    el('div', { class: 'glass card' },
      el('p', { class: 'muted', textContent: `${res.members.length} / ${res.limits?.members ?? '?'} członków · lider @${c.owner.handle} · od ${fmtDate(c.createdAt)}` }),
      rename,
      el('div', { class: 'row' }, ...tools)),
    el('div', { class: 'glass card' }, el('h2', {}, icon('fa-solid fa-users'), ` Członkowie (${res.members.length})`),
      el('div', { class: 'scroll-x' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Gracz' }), el('th', { textContent: 'Rola' }), el('th', { class: 'hide-sm', textContent: 'Od' }), el('th', { textContent: '' }))), el('tbody', {}, ...members)))),
    el('div', { class: 'glass card' }, el('h2', {}, icon('fa-solid fa-envelope'), ` Zaproszenia (${res.invites.length})`),
      invites.length ? el('table', {}, el('tbody', {}, ...invites)) : el('p', { class: 'muted', textContent: 'Brak oczekujących zaproszeń.' })));
}
