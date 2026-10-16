// The admin panel: numbers, accounts (ban, sign out, role, cape, delete), cosmetics and the log.
import { $, PROVIDERS, ago, api, avatarEl, capeEl, el, errorText, fmtDate, guard, icon, signInDev, signInWith, signOut, toast, token } from './common.js';

const TABS = [
  ['dashboard', 'Pulpit', 'fa-solid fa-chart-line'],
  ['users', 'Konta', 'fa-solid fa-users'],
  ['cosmetics', 'Kosmetyki', 'fa-solid fa-wand-magic-sparkles'],
  ['log', 'Dziennik', 'fa-solid fa-clock-rotate-left'],
];
const ACTIONS = {
  ban: 'zablokował(a)', unban: 'odblokował(a)', make_admin: 'nadał(a) admina', remove_admin: 'odebrał(a) admina',
  set_cape: 'zmienił(a) pelerynę', logout: 'wylogował(a)', delete: 'usunął(ęła) konto', cape_settings: 'zmienił(a) ustawienia peleryny',
  grant: 'przyznał(a) pelerynę', revoke: 'odebrał(a) pelerynę',
};

let me;
let tab = location.hash.slice(1) || 'dashboard';
const users = { q: '', offset: 0, limit: 25 };
let capeNames = {};

// ---------- the gate: signed in as an admin ----------

async function gate(message) {
  const health = await api('GET', '/v1/health').catch(() => ({ providers: [], dev: false }));
  const card = el('div', { class: 'glass card' },
    el('img', { src: 'vendor/logo.png', alt: '', width: 64, height: 64 }),
    el('h2', { textContent: 'Panel admina' }),
    el('p', { class: 'muted', textContent: message ?? 'Zaloguj się kontem z uprawnieniami admina.' }));
  for (const p of health.providers) {
    const [name, cls] = PROVIDERS[p] ?? [p, 'fa-solid fa-key'];
    card.append(el('button', { onclick: () => enter(() => signInWith(p)) }, icon(cls), `Zaloguj przez ${name}`));
  }
  if (health.dev) {
    const input = el('input', { type: 'text', placeholder: 'Nick (logowanie testowe)', maxLength: 16 });
    card.append(el('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); enter(() => signInDev(input.value.trim())); } },
      input, el('button', { type: 'submit' }, icon('fa-solid fa-flask'), 'Wejdź')));
  }
  if (me) card.append(el('button', { onclick: async () => { await signOut(); me = undefined; gate(); } }, icon('fa-solid fa-right-from-bracket'), `Wyloguj ${me.name}`));
  card.append(el('a', { href: '/', class: 'small', textContent: '← Strona SlashClient' }));
  $('#root').replaceChildren(el('div', { class: 'gate' }, card));
}

async function enter(fn) {
  if (!(await guard(fn))) return;
  start();
}

async function start() {
  me = token.get() ? await api('GET', '/v1/me').catch(() => undefined) : undefined;
  if (!me) return gate();
  if (!me.admin) return gate(`Konto ${me.name} (@${me.handle}) nie ma uprawnień admina.`);
  const cos = await api('GET', '/v1/cosmetics').catch(() => ({ capes: [] }));
  capeNames = Object.fromEntries(cos.capes.map((c) => [c.id, c.name]));
  layout();
}

// ---------- layout ----------

function layout() {
  closeDrawer();
  const side = el('aside', { class: 'side' }, el('a', { class: 'brand', href: '/' }, el('img', { src: 'vendor/logo.png', alt: '' }), el('span', {}, 'Slash', el('b', { textContent: 'Admin' }))));
  for (const [id, name, cls] of TABS) {
    side.append(el('button', { class: `tab${tab === id ? ' active' : ''}`, onclick: () => { tab = id; location.hash = id; layout(); } }, icon(cls), name));
  }
  side.append(el('div', { class: 'me' }, avatarEl(me), el('div', { class: 'grow' }, el('b', { textContent: me.name }), el('small', { class: 'muted', textContent: ` @${me.handle}` })),
    el('button', { class: 'icon-btn', title: 'Wyloguj', onclick: async () => { await signOut(); me = undefined; gate(); } }, icon('fa-solid fa-right-from-bracket'))));
  const main = el('main', { class: 'main', id: 'main' });
  $('#root').replaceChildren(el('div', { class: 'admin' }, side, main));
  ({ dashboard, users: usersPage, cosmetics: cosmeticsPage, log: logPage })[tab]?.();
}

const head = (title, ...extra) => el('div', { class: 'page-head' }, el('h1', { textContent: title }), ...extra);
const stat = (cls, label, value, note) => el('div', { class: 'glass stat' }, el('small', {}, icon(cls), label), el('b', { textContent: String(value) }), note ? el('em', { textContent: note }) : '');

// ---------- dashboard ----------

async function dashboard() {
  const s = await guard(() => api('GET', '/v1/admin/stats'));
  if (!s) return;
  const max = Math.max(1, ...s.signups);
  const chart = el('div', { class: 'chart' }, ...s.signups.map((n, i) => {
    const bar = el('div', { title: `${new Date(Date.now() - (29 - i) * 86_400_000).toLocaleDateString('pl-PL')}: ${n}`, dataset: { n: String(n) } });
    bar.style.height = `${Math.max(4, (n / max) * 100)}%`;
    return bar;
  }));
  const worn = Object.entries(s.capes).sort((a, b) => b[1] - a[1]);
  const top = Math.max(1, ...worn.map(([, n]) => n));
  const bars = el('div', { class: 'bars' }, ...(worn.length ? worn.map(([id, n]) => {
    const fill = el('div');
    fill.style.width = `${(n / top) * 100}%`;
    return el('div', { class: 'bar' }, capeEl(id, true), el('span', { textContent: capeNames[id] ?? id }), el('div', { class: 'track' }, fill), el('b', { textContent: String(n) }));
  }) : [el('p', { class: 'muted', textContent: 'Nikt jeszcze nie nosi peleryny.' })]));
  $('#main').replaceChildren(
    head('Pulpit', el('button', { onclick: dashboard }, icon('fa-solid fa-rotate'), 'Odśwież')),
    el('div', { class: 'stats' },
      stat('fa-solid fa-users', 'Konta', s.users, s.newUsers ? `+${s.newUsers} w tym tygodniu` : ''),
      stat('fa-solid fa-signal', 'Online teraz', s.online),
      stat('fa-solid fa-cube', 'W grze z modem', s.inGame),
      stat('fa-solid fa-user-clock', 'Aktywni (7 dni)', s.activeUsers),
      stat('fa-solid fa-comments', 'Wiadomości', s.messages, s.newMessages ? `+${s.newMessages} w tym tygodniu` : ''),
      stat('fa-solid fa-user-group', 'Znajomości', s.friendships),
      stat('fa-solid fa-ban', 'Zablokowane', s.banned)),
    el('div', { class: 'two' },
      el('div', { class: 'glass card' }, el('h3', { textContent: 'Nowe konta (30 dni)' }), chart),
      el('div', { class: 'glass card' }, el('h3', { textContent: 'Noszone peleryny' }), bars)));
}

// ---------- accounts ----------

async function usersPage() {
  const search = el('input', { type: 'search', placeholder: 'Szukaj: nick, nazwa albo id…', value: users.q });
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { users.q = search.value.trim(); users.offset = 0; loadUsers(); }, 250);
  });
  $('#main').replaceChildren(head('Konta', el('div', { class: 'grow' }), search), el('div', { class: 'glass card', id: 'users-box' }, el('p', { class: 'muted', textContent: 'Ładowanie…' })));
  search.focus();
  loadUsers();
}

async function loadUsers() {
  const res = await guard(() => api('GET', `/v1/admin/users?q=${encodeURIComponent(users.q)}&limit=${users.limit}&offset=${users.offset}`));
  const box = $('#users-box');
  if (!res || !box) return;
  if (!res.users.length) return box.replaceChildren(el('p', { class: 'muted', textContent: 'Brak kont.' }));
  const rows = res.users.map((u) => el('tr', { onclick: () => openUser(u.id) },
    el('td', {}, el('div', { class: 'who' }, avatarEl(u), el('div', {}, el('b', { textContent: u.name }), el('small', { textContent: `@${u.handle}` })))),
    el('td', { class: 'hide-sm' }, ...u.providers.map((p) => el('span', { class: 'chip', title: p }, icon((PROVIDERS[p] ?? ['', 'fa-solid fa-flask'])[1])))),
    el('td', {}, u.cape ? el('div', { class: 'row' }, capeEl(u.cape, true), capeNames[u.cape] ?? u.cape) : el('span', { class: 'muted', textContent: '—' })),
    el('td', { class: 'hide-sm', textContent: ago(u.lastSeen) }),
    el('td', {}, badges(u))));
  const pages = el('div', { class: 'pager' },
    `${users.offset + 1}–${Math.min(res.total, users.offset + users.limit)} z ${res.total}`,
    el('button', { class: 'icon-btn', disabled: users.offset === 0, onclick: () => { users.offset = Math.max(0, users.offset - users.limit); loadUsers(); } }, icon('fa-solid fa-chevron-left')),
    el('button', { class: 'icon-btn', disabled: users.offset + users.limit >= res.total, onclick: () => { users.offset += users.limit; loadUsers(); } }, icon('fa-solid fa-chevron-right')));
  box.replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Gracz' }), el('th', { class: 'hide-sm', textContent: 'Logowanie' }), el('th', { textContent: 'Peleryna' }), el('th', { class: 'hide-sm', textContent: 'Ostatnio' }), el('th', { textContent: 'Status' }))), el('tbody', {}, ...rows)), pages);
}

const badges = (u) => el('div', { class: 'row' },
  u.banned ? el('span', { class: 'chip red' }, icon('fa-solid fa-ban'), 'zablokowany') : '',
  u.role === 'admin' || u.configAdmin ? el('span', { class: 'chip blue' }, icon('fa-solid fa-shield-halved'), 'admin') : '',
  !u.banned && !(u.role === 'admin' || u.configAdmin) ? el('span', { class: 'chip green', textContent: 'aktywny' }) : '');

function closeDrawer() {
  document.querySelector('.drawer')?.remove();
  document.querySelector('.shade')?.remove();
}

async function openUser(id) {
  const u = await guard(() => api('GET', `/v1/admin/users/${id}`));
  if (!u) return;
  closeDrawer();
  const update = async (body, done) => {
    const r = await guard(() => api('POST', `/v1/admin/users/${id}`, body));
    if (!r) return;
    toast(done);
    loadUsers();
    openUser(id);
  };
  const capeSel = el('select', {}, el('option', { value: '', textContent: 'Bez peleryny' }), ...Object.entries(capeNames).map(([cid, name]) => el('option', { value: cid, textContent: name, selected: u.cape === cid })));
  capeSel.addEventListener('change', () => update({ cape: capeSel.value }, 'Peleryna zmieniona.'));
  const self = u.id === me.id;
  const drawer = el('aside', { class: 'glass drawer' },
    el('div', { class: 'row' }, avatarEl(u, true), el('div', { class: 'grow' }, el('h2', { textContent: u.name }), el('span', { class: 'muted', textContent: `@${u.handle}` })),
      el('button', { class: 'icon-btn', title: 'Zamknij', onclick: closeDrawer }, icon('fa-solid fa-xmark'))),
    badges(u),
    el('dl', { class: 'facts' },
      el('dt', { textContent: 'Id' }), el('dd', { textContent: u.id }),
      el('dt', { textContent: 'Logowanie' }), el('dd', { textContent: u.providers.map((p) => (PROVIDERS[p] ?? ['Test'])[0]).join(', ') || '—' }),
      el('dt', { textContent: 'Założone' }), el('dd', { textContent: fmtDate(u.createdAt) }),
      el('dt', { textContent: 'Ostatnio' }), el('dd', { textContent: `${fmtDate(u.lastSeen)} (${ago(u.lastSeen)})` }),
      el('dt', { textContent: 'Znajomi' }), el('dd', { textContent: String(u.friends) }),
      el('dt', { textContent: 'Sesje' }), el('dd', { textContent: String(u.sessions) }),
      el('dt', { textContent: 'Serwer' }), el('dd', { textContent: u.showServer ? 'widoczny dla znajomych' : 'ukryty' }),
      el('dt', { textContent: 'Przyznane' }), el('dd', { textContent: u.grants.map((g) => capeNames[g] ?? g).join(', ') || '—' })),
    el('div', {}, el('h4', { textContent: 'Peleryna' }), el('div', { class: 'row' }, u.cape ? capeEl(u.cape, true) : '', capeSel)),
    el('div', { class: 'actions' },
      el('button', { disabled: self, onclick: () => update({ banned: !u.banned }, u.banned ? 'Konto odblokowane.' : 'Konto zablokowane i wylogowane.'), class: u.banned ? '' : 'danger' },
        icon(u.banned ? 'fa-solid fa-unlock' : 'fa-solid fa-ban'), u.banned ? 'Odblokuj' : 'Zablokuj'),
      el('button', { onclick: async () => { if (await guard(() => api('POST', `/v1/admin/users/${id}/logout`))) { toast('Wylogowano ze wszystkich urządzeń.'); openUser(id); } } },
        icon('fa-solid fa-right-from-bracket'), 'Wyloguj wszędzie'),
      el('button', { disabled: self || u.configAdmin, title: u.configAdmin ? 'Admin z konfiguracji serwera (ADMIN_HANDLES)' : '', onclick: () => update({ role: u.role === 'admin' ? '' : 'admin' }, u.role === 'admin' ? 'Odebrano uprawnienia admina.' : 'Nadano uprawnienia admina.') },
        icon('fa-solid fa-shield-halved'), u.role === 'admin' || u.configAdmin ? 'Odbierz admina' : 'Nadaj admina'),
      el('button', { class: 'danger', disabled: self || u.configAdmin, onclick: async () => {
        if (!confirm(`Usunąć konto ${u.name} (@${u.handle}) razem ze znajomymi i wiadomościami? Tego nie da się cofnąć.`)) return;
        if (await guard(() => api('DELETE', `/v1/admin/users/${id}`))) { toast('Konto usunięte.'); closeDrawer(); loadUsers(); }
      } }, icon('fa-solid fa-trash-can'), 'Usuń konto')));
  document.body.append(el('div', { class: 'shade', onclick: closeDrawer }), drawer);
}

// ---------- cosmetics ----------

async function cosmeticsPage() {
  const res = await guard(() => api('GET', '/v1/admin/cosmetics'));
  if (!res) return;
  const cards = res.capes.map((c) => {
    const toggle = (label, key, hint) => {
      const box = el('input', { type: 'checkbox', checked: c[key] });
      box.addEventListener('change', async () => {
        const warn = key === 'enabled' && !box.checked ? 'Wyłączona peleryna zniknie wszystkim, którzy ją noszą. Kontynuować?'
          : key === 'exclusive' && box.checked ? 'Peleryna zostanie zdjęta tym, którzy jej nie mają przyznanej. Kontynuować?' : '';
        if (warn && c.wearing && !confirm(warn)) { box.checked = !box.checked; return; }
        if (await guard(() => api('POST', `/v1/admin/cosmetics/${c.id}`, { [key]: box.checked }))) { toast('Zapisano.'); cosmeticsPage(); } else box.checked = !box.checked;
      });
      return el('label', { class: 'opt', title: hint }, label, el('span', { class: 'switch' }, box, el('span')));
    };
    const handle = el('input', { type: 'text', placeholder: '@nick' });
    const grant = el('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      if (await guard(() => api('POST', `/v1/admin/cosmetics/${c.id}/grants`, { handle: handle.value.trim() }))) { toast('Przyznano.'); cosmeticsPage(); }
    } }, handle, el('button', { type: 'submit', class: 'icon-btn', title: 'Przyznaj' }, icon('fa-solid fa-plus')));
    return el('div', { class: 'glass cos' }, capeEl(c.id),
      el('div', { class: 'opts' },
        el('div', { class: 'row' }, el('h3', { class: 'grow', textContent: c.name }), el('span', { class: 'chip', textContent: `${c.wearing} nosi` })),
        toggle('Włączona', 'enabled', 'Wyłączonej nie można wybrać i nikt jej nie widzi'),
        toggle('Ekskluzywna', 'exclusive', 'Tylko dla graczy, którym ją przyznasz'),
        c.exclusive ? el('div', {}, el('small', { class: 'muted', textContent: 'Przyznana:' }),
          el('div', { class: 'grantees' }, ...(c.grantees.length ? c.grantees.map((g) => el('span', { class: 'chip blue' }, `@${g.handle}`,
            el('button', { title: 'Odbierz', onclick: async () => { if (await guard(() => api('DELETE', `/v1/admin/cosmetics/${c.id}/grants/${g.id}`))) cosmeticsPage(); } }, icon('fa-solid fa-xmark'))))
            : [el('span', { class: 'muted small', textContent: 'nikomu' })])), grant) : ''));
  });
  $('#main').replaceChildren(head('Kosmetyki'),
    el('p', { class: 'muted', textContent: 'Peleryny są wbudowane w mod SlashClient HUD; tutaj decydujesz, które są dostępne i dla kogo. Emotki są dostępne dla wszystkich.' }),
    el('div', { class: 'cosmetics' }, ...cards));
}

// ---------- log ----------

async function logPage() {
  const res = await guard(() => api('GET', '/v1/admin/log'));
  if (!res) return;
  const people = {};
  const nameOf = async (id) => (people[id] ??= (await api('GET', `/v1/admin/users/${id}`).catch(() => undefined))?.handle ?? id.slice(0, 8));
  const rows = await Promise.all(res.entries.map(async (e) => el('tr', {},
    el('td', { textContent: fmtDate(e.at) }),
    el('td', { textContent: `@${await nameOf(e.admin)}` }),
    el('td', {}, ACTIONS[e.action] ?? e.action, ' ', el('b', { textContent: e.action === 'cape_settings' ? capeNames[e.target] ?? e.target : `@${e.target}` })),
    el('td', { class: 'log-detail', textContent: ['grant', 'revoke', 'set_cape'].includes(e.action) ? capeNames[e.detail] ?? e.detail : e.detail }))));
  $('#main').replaceChildren(head('Dziennik'),
    el('div', { class: 'glass card' }, res.entries.length
      ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Kiedy' }), el('th', { textContent: 'Kto' }), el('th', { textContent: 'Co' }), el('th', { textContent: 'Szczegóły' }))), el('tbody', {}, ...rows))
      : el('p', { class: 'muted', textContent: 'Jeszcze nic się nie wydarzyło.' })));
}

addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (me?.admin && next && next !== tab && TABS.some(([id]) => id === next)) {
    tab = next;
    layout();
  }
});
start().catch((err) => toast(errorText(err), true));
