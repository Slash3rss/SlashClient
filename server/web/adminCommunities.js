// The admin panel's "Społeczności": every community (search by name, tag or owner), the reported
// messages of all of them, and one community in detail: its members, its log, its open reports, and
// moderation (logo or description off, a new owner, deleting it). Everything goes to the log.
// Community chat is not end-to-end encrypted, so a reported message's text is here to judge.
import { $, api, el, fmtDate, guard, icon, toast } from './common.js';

const ROLES = { owner: 'założyciel', admin: 'admin', moderator: 'moderator', member: 'członek' };
const ACTIONS = {
  create: 'założył(a)', join: 'dołączył(a)', accept: 'przyjął(ęła) prośbę', decline: 'odrzucił(a) prośbę', leave: 'odszedł(a)', kick: 'wyrzucił(a)',
  ban: 'zbanował(a)', unban: 'odbanował(a)', mute: 'wyciszył(a)', unmute: 'zdjął(ęła) wyciszenie', role: 'zmienił(a) rolę', transfer: 'przekazał(a) społeczność',
  invite: 'zaprosił(a)', edit: 'zmienił(a) ustawienia', logo: 'zmienił(a) logo', logo_remove: 'usunął(ęła) logo', delete: 'usunął(ęła) społeczność', heir: 'przejął(ęła) społeczność',
  message_delete: 'usunął(ęła) wiadomość', report_delete: 'usunął(ęła) zgłoszoną wiadomość', report_dismiss: 'odrzucił(a) zgłoszenie',
  pin: 'przypiął(ęła) wiadomość od', unpin: 'odpiął(ęła) wiadomość od', slowmode: 'zmienił(a) tryb powolny',
  admin_delete:
 '(admin) usunął(ęła) społeczność', admin_logo_remove: '(admin) usunął(ęła) logo', admin_description_remove: '(admin) usunął(ęła) opis',
  admin_transfer: '(admin) przekazał(a) społeczność', admin_report_delete: '(admin) usunął(ęła) zgłoszoną wiadomość', admin_report_dismiss: '(admin) odrzucił(a) zgłoszenie',
};

// invite links, the game server and the verified badge (communityLinks.ts)
Object.assign(ACTIONS, {
  link_create: 'utworzył(a) link zaproszenia', link_revoke: 'cofnął(ęła) link zaproszenia', link_join: 'dołączył(a) z linku', server: 'ustawił(a) serwer gry',
  admin_verify: '(admin) zweryfikował(a) społeczność', admin_unverify: '(admin) zdjął(ęła) weryfikację',
});
const verifiedMark = (c) => (c.verified ? el('span', { class: 'chip sky', title: 'Zweryfikowana: znaczek przy nazwie w launcherze i na stronie' }, icon('fa-solid fa-circle-check'), ' zweryfikowana') : '');

/** Verifying, the game server and the invite links of one community (its detail page). */
async function linksCard(id, c, again) {
  const res = await guard(() => api('GET', `/v1/admin/communities/${encodeURIComponent(id)}/links`));
  const verify = el('button', { class: c.verified ? '' : 'primary', onclick: async () => {
    const verified = !c.verified;
    if (!verified && !confirm(`Zdjąć weryfikację społeczności „${c.name}”?`)) return;
    if (await guard(() => api('POST', `/v1/admin/communities/${id}/verified`, { verified }))) {
      toast(verified ? 'Społeczność zweryfikowana.' : 'Zdjęto weryfikację.');
      again();
    }
  } }, icon(c.verified ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-check'), c.verified ? ' Zdejmij weryfikację' : ' Oznacz jako zweryfikowaną');
  const links = (res?.links ?? []).map((l) => el('tr', {}, el('td', {}, el('code', { textContent: l.code })), el('td', { textContent: `@${l.by.handle}` }),
    el('td', { textContent: l.maxUses ? `${l.uses} / ${l.maxUses}` : `${l.uses} / ∞` }), el('td', { class: 'muted small', textContent: l.expiresAt ? `do ${fmtDate(l.expiresAt)}` : 'bez terminu' })));
  return el('div', { class: 'glass card' }, el('h2', {}, icon('fa-solid fa-circle-check'), ' Weryfikacja, serwer i zaproszenia'),
    el('p', { class: 'muted', textContent: c.verified ? 'Oficjalna społeczność: przy nazwie widać znaczek (launcher, katalog, strona, zaproszenia).' : 'Zweryfikuj oficjalne społeczności (np. serwerów-partnerów): dostaną znaczek przy nazwie.' }),
    el('div', { class: 'row' }, verify),
    el('p', {}, 'Serwer gry: ', c.server ? el('b', { textContent: `${c.server.address}${c.server.version ? ` · ${c.server.version}` : ''}` }) : el('span', { class: 'muted', textContent: 'brak' }),
      c.server ? el('span', { class: 'muted', textContent: ` · gra teraz: ${c.server.playing}` }) : ''),
    links.length ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Kod' }), el('th', { textContent: 'Utworzył(a)' }), el('th', { textContent: 'Użycia' }), el('th', { textContent: 'Ważny' }))), el('tbody', {}, ...links))
      : el('p', { class: 'muted', textContent: 'Brak aktywnych linków zaproszeń.' }));
}

const logoOf = (c) => (c.logo
  ? el('img', { class: 'clan-logo', src: `/v1/communities/${encodeURIComponent(c.id)}/logo.png?v=${c.logo}`, alt: '', width: 32, height: 32 })
  : el('span', { class: 'clan-logo clan-logo-none' }, icon('fa-solid fa-users')));

/** Reported messages (one community's, or all), with dismiss and delete. */
function reportsTable(reports, resolve, withCommunity) {
  if (!reports.length) return el('p', { class: 'muted', textContent: 'Brak otwartych zgłoszeń.' });
  const rows = reports.map((r) => {
    const gone = !r.message.current || r.message.current.deleted;
    const dismiss = el('button', { title: 'Odrzuć zgłoszenie', onclick: () => resolve(r, 'dismiss') }, icon('fa-solid fa-check'), ' Odrzuć');
    const remove = el('button', { class: 'danger', title: 'Usuń wiadomość', disabled: gone, onclick: () => confirm('Usunąć tę wiadomość u wszystkich?') && resolve(r, 'delete') }, icon('fa-solid fa-trash-can'), ' Usuń');
    return el('tr', {},
      withCommunity ? el('td', {}, el('b', { textContent: r.communityName || r.community })) : '',
      el('td', {}, el('b', { textContent: r.message.author ? `@${r.message.author.handle}` : '?' }), el('div', { class: 'muted small', textContent: fmtDate(r.at) })),
      el('td', {}, el('div', { textContent: r.message.text || '—' }), gone ? el('div', { class: 'muted small', textContent: '(już usunięta)' }) : ''),
      el('td', {}, el('div', { textContent: r.reason || '—' }), el('div', { class: 'muted small', textContent: `@${r.reporter.handle}${r.count > 1 ? ` i ${r.count - 1} inn.` : ''}` })),
      el('td', {}, el('div', { class: 'row' }, dismiss, remove)));
  });
  return el('table', {}, el('thead', {}, el('tr', {}, withCommunity ? el('th', { textContent: 'Społeczność' }) : '', el('th', { textContent: 'Autor' }), el('th', { textContent: 'Wiadomość' }), el('th', { textContent: 'Powód, zgłaszający' }), el('th', { textContent: '' }))),
    el('tbody', {}, ...rows));
}

export async function communitiesPage(q = '') {
  const [res, reports] = await Promise.all([guard(() => api('GET', `/v1/admin/communities?q=${encodeURIComponent(q)}`)), guard(() => api('GET', '/v1/admin/communities/reports'))]);
  if (!res) return;
  const search = el('input', { type: 'search', placeholder: 'Szukaj: nazwa, tag, @założyciel', value: q });
  search.addEventListener('keydown', (e) => e.key === 'Enter' && communitiesPage(search.value.trim()));
  const rows = res.communities.map((c) => el('tr', {},
    el('td', {}, logoOf(c)),
    el('td', {}, el('b', { textContent: c.name }), c.tag ? el('span', { class: 'muted', textContent: ` #${c.tag}` }) : '', c.verified ? ' ' : '', verifiedMark(c),
      el('div', { class: 'muted small', textContent: c.visibility === 'private' ? 'prywatna' : c.joinMode === 'open' ? 'publiczna, otwarta' : 'publiczna, na prośbę' })),
    el('td', { textContent: String(c.members) }),
    el('td', { class: 'hide-sm', textContent: c.ownerHandle ? `@${c.ownerHandle}` : '—' }),
    el('td', {}, c.reports ? el('span', { class: 'chip red', textContent: `${c.reports} zgł.` }) : ''),
    el('td', { class: 'hide-sm', textContent: fmtDate(c.createdAt) }),
    el('td', {}, el('button', { onclick: () => communityPage(c.id) }, icon('fa-solid fa-magnifying-glass'), ' Szczegóły'))));
  const resolve = async (r, action) => {
    if (await guard(() => api('POST', `/v1/admin/communities/reports/${r.id}/resolve`, { action }))) {
      toast(action === 'delete' ? 'Wiadomość usunięta.' : 'Zgłoszenie odrzucone.');
      communitiesPage(q);
    }
  };
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Społeczności' })),
    el('p', { class: 'muted', textContent: `Duże grupy graczy (do ${res.limits.members} osób) z czatem przechowywanym na serwerze, bez szyfrowania od nadawcy do odbiorcy. Prywatne nie są w katalogu.` }),
    el('div', { class: 'glass card' }, el('h2', {}, icon('fa-solid fa-flag'), ' Zgłoszone wiadomości'), reportsTable(reports?.reports ?? [], resolve, true)),
    el('div', { class: 'glass card' }, el('div', { class: 'row' }, search, el('button', { onclick: () => communitiesPage(search.value.trim()) }, icon('fa-solid fa-magnifying-glass'), ' Szukaj')),
      rows.length
        ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Logo' }), el('th', { textContent: 'Społeczność' }), el('th', { textContent: 'Członkowie' }), el('th', { class: 'hide-sm', textContent: 'Założyciel' }), el('th', { textContent: '' }), el('th', { class: 'hide-sm', textContent: 'Od' }), el('th', { textContent: '' }))), el('tbody', {}, ...rows))
        : el('p', { class: 'muted', textContent: q ? 'Nic nie pasuje.' : 'Nie ma jeszcze społeczności.' })));
}

async function communityPage(id, q = '') {
  const res = await guard(() => api('GET', `/v1/admin/communities/${encodeURIComponent(id)}?q=${encodeURIComponent(q)}`));
  if (!res) return;
  const c = res.community;
  const again = () => communityPage(id, q);
  const back = el('button', { onclick: () => communitiesPage() }, icon('fa-solid fa-arrow-left'), ' Wszystkie');
  const tools = [];
  if (c.logo) tools.push(el('button', { onclick: async () => confirm('Usunąć logo tej społeczności?') && (await guard(() => api('DELETE', `/v1/admin/communities/${id}/logo`))) && (toast('Logo usunięte.'), again()) }, icon('fa-solid fa-eraser'), ' Usuń logo'));
  if (c.description) tools.push(el('button', { onclick: async () => confirm('Usunąć opis tej społeczności?') && (await guard(() => api('DELETE', `/v1/admin/communities/${id}/description`))) && (toast('Opis usunięty.'), again()) }, icon('fa-solid fa-eraser'), ' Usuń opis'));
  const heir = el('input', { placeholder: 'Nowy założyciel: @nick członka' });
  tools.push(heir, el('button', { onclick: async () => {
    const handle = heir.value.trim().replace(/^@/, '');
    if (handle && confirm(`Przekazać społeczność graczowi @${handle}?`) && (await guard(() => api('POST', `/v1/admin/communities/${id}/owner`, { handle })))) {
      toast('Przekazano.');
      again();
    }
  } }, icon('fa-solid fa-crown'), ' Przekaż'));
  tools.push(el('button', { class: 'danger', onclick: async () => {
    if (confirm(`Usunąć społeczność „${c.name}” razem z czatem dla wszystkich ${c.members} członków?`) && (await guard(() => api('DELETE', `/v1/admin/communities/${id}`)))) {
      toast('Społeczność usunięta.');
      communitiesPage();
    }
  } }, icon('fa-solid fa-trash-can'), ' Usuń społeczność'));
  const search = el('input', { type: 'search', placeholder: 'Szukaj członka', value: q });
  search.addEventListener('keydown', (e) => e.key === 'Enter' && communityPage(id, search.value.trim()));
  const members = res.members.map((m) => el('tr', {}, el('td', {}, el('b', { textContent: m.name }), el('span', { class: 'muted', textContent: ` @${m.handle}` })),
    el('td', { textContent: ROLES[m.role] ?? m.role }), el('td', { class: 'hide-sm', textContent: fmtDate(m.joinedAt) }),
    el('td', { class: 'muted small', textContent: m.mutedUntil > Date.now() ? `wyciszony do ${fmtDate(m.mutedUntil)}` : '' })));
  const log = res.log.map((e) => el('tr', {}, el('td', { class: 'muted small', textContent: fmtDate(e.at) }), el('td', { textContent: e.byName || '—' }),
    el('td', {}, ACTIONS[e.action] ?? e.action, ' ', el('b', { textContent: e.targetName || '' }), e.detail ? el('span', { class: 'muted', textContent: ` (${e.detail})` }) : '')));
  const resolve = async (r, action) => {
    if (await guard(() => api('POST', `/v1/admin/communities/reports/${r.id}/resolve`, { action }))) {
      toast(action === 'delete' ? 'Wiadomość usunięta.' : 'Zgłoszenie odrzucone.');
      again();
    }
  };
  const extra = await linksCard(id, c, again);
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, back, el('h1', {}, logoOf(c), ' ', c.name, c.tag ? el('span', { class: 'muted', textContent: ` #${c.tag}` }) : '', c.verified ? ' ' : '', verifiedMark(c))),
    el('div', { class: 'glass card' },
      el('p', { textContent: c.description || '(bez opisu)' }),
      el('p', { class: 'muted', textContent: `${c.visibility === 'private' ? 'Prywatna' : 'Publiczna'} · ${c.joinMode === 'open' ? 'otwarta' : 'na prośbę'} · ${c.members} członków · ${c.pending} próśb · ${c.bans} banów · od ${fmtDate(c.createdAt)} · założyciel @${c.owner.handle}` }),
      el('div', { class: 'row' }, ...tools)),
    extra,
    el('div', { class: 'glass card' }, el('h2', {}, icon('fa-solid fa-flag'), ' Zgłoszenia'), reportsTable(res.reports, resolve, false)),
    el('div', { class: 'glass card' }, el('h2', {}, icon('fa-solid fa-users'), ` Członkowie (${res.total})`),
      el('div', { class: 'row' }, search, el('button', { onclick: () => communityPage(id, search.value.trim()) }, icon('fa-solid fa-magnifying-glass'))),
      el('table', {}, el('tbody', {}, ...members))),
    el('div', { class: 'glass card' }, el('h2', {}, icon('fa-solid fa-clock-rotate-left'), ' Dziennik społeczności'),
      log.length ? el('table', {}, el('tbody', {}, ...log)) : el('p', { class: 'muted', textContent: 'Pusto.' })));
}
