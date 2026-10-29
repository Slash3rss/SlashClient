// The admin panel: numbers, accounts (ban, sign out, role, cape, delete), cosmetics and the log.
import { $, PROVIDERS, partnerBanner, uploadPicture, SLOTS, ago, api, avatarEl, capeEl, confirmModal, cosmeticEl, el, errorText, fmtDate, guard, icon, promptModal, signInDev, signInWith, signOut, toast, token, partnerIconControls } from './common.js';
import { storagePage } from './adminStorage.js';
import { shopSection, walletSection } from './adminSparks.js';
import { achievementsPage, foreignHash, obtainLine } from './adminAchievements.js';
import { challengesPage } from './adminChallenges.js';
import { clansPage } from './adminClans.js';
import { communitiesPage } from './adminCommunities.js';
import { supportPage } from './adminSupport.js';
import { legalPage } from './adminLegal.js';
import { homePage } from './adminHome.js';
import { rankChips, ranksPage, ranksReady, userRanksSection } from './adminRanks.js';
import { settingsPage, supporterEditor } from './adminSettings.js';
import { streamsPage } from './adminStreams.js';
import { fishAtlasPage } from './adminFishAtlas.js';
import { statusRulesSection } from './adminStatusRules.js';
import { dashboardPage } from './adminDashboard.js';

// the menu in groups, so a page is found by what it is about
const GROUPS = [
  ['Przegląd', [
    ['dashboard', 'Pulpit', 'fa-solid fa-chart-line'],
    ['log', 'Dziennik', 'fa-solid fa-clock-rotate-left'],
  ]],
  ['Gracze', [
    ['users', 'Konta', 'fa-solid fa-users'],
    ['ranks', 'Rangi', 'fa-solid fa-certificate'],
    ['support', 'Wsparcie', 'fa-solid fa-heart'],
  ]],
  ['Nagrody i wygląd', [
    ['cosmetics', 'Kosmetyki', 'fa-solid fa-wand-magic-sparkles'],
    ['achievements', 'Osiągnięcia', 'fa-solid fa-trophy'],
    ['challenges', 'Wyzwania', 'fa-solid fa-list-check'],
  ]],
  ['Społeczność', [
    ['clans', 'Klany', 'fa-solid fa-shield-halved'],
    ['communities', 'Społeczności', 'fa-solid fa-users-rectangle'],
    ['partners', 'Partnerzy', 'fa-solid fa-handshake'],
    ['streams', 'Streamy', 'fa-solid fa-video'],
  ]],
  ['Treści', [
    ['home', 'Strona główna', 'fa-solid fa-house'],
    ['legal', 'Dokumenty', 'fa-solid fa-scale-balanced'],
    ['fishAtlas', 'Atlas ryb', 'fa-solid fa-fish'],
  ]],
  ['System', [
    ['settings', 'Ustawienia', 'fa-solid fa-sliders'],
    ['storage', 'Miejsce na pliki', 'fa-solid fa-hard-drive'],
    ['requests', 'Zapytania', 'fa-solid fa-satellite-dish'],
    ['logs', 'Logi graczy', 'fa-solid fa-file-lines'],
  ]],
];
const TABS = GROUPS.flatMap(([, tabs]) => tabs);
const ACTIONS = {
  ban: 'zablokował(a)', unban: 'odblokował(a)', make_admin: 'nadał(a) admina', remove_admin: 'odebrał(a) admina',
  set_cape: 'zmienił(a) pelerynę', logout: 'wylogował(a)', delete: 'usunął(ęła) konto', cape_settings: 'zmienił(a) ustawienia peleryny',
  grant: 'przyznał(a) pelerynę', revoke: 'odebrał(a) pelerynę',
  log_remove: 'usunął(ęła) log', bug_status: 'zmienił(a) status zgłoszenia', bug_remove: 'usunął(ęła) zgłoszenie',
  partner_add: 'dodał(a) serwer partnerski', partner_edit: 'zmienił(a) serwer partnerski', partner_remove: 'usunął(ęła) serwer partnerski',
  partner_background: 'zmienił(a) tło serwera', partner_aliases: 'zmienił(a) alternatywne adresy serwera', partner_icon: 'zmienił(a) animowaną ikonę serwera',set_rank: 'zmienił(a) rangę',
  storage_add: 'dodał(a) miejsce na pliki', storage_edit: 'zmienił(a) miejsce na pliki', storage_remove: 'usunął(ęła) miejsce na pliki',
  storage_move: 'przenosi pliki z', storage_move_stop: 'zatrzymał(a) przenoszenie plików z',
  sparks_give: 'dodał(a) Iskry', sparks_take: 'odebrał(a) Iskry', shop_price: 'zmienił(a) cenę w sklepie',
  ach_create: 'utworzył(a) osiągnięcie', ach_edit: 'zmienił(a) osiągnięcie', ach_reset: 'przywrócił(a) domyślne osiągnięcie', ach_delete: 'usunął(ęła) osiągnięcie',
  ach_grant: 'przyznał(a) osiągnięcie', ach_revoke: 'odebrał(a) osiągnięcie',
  challenge_create: 'utworzył(a) wyzwanie', challenge_edit: 'zmienił(a) wyzwanie', challenge_reset: 'przywrócił(a) domyślne wyzwanie', challenge_delete: 'usunął(ęła) wyzwanie',
  profile_hide: 'ukrył(a) profil', profile_show: 'przywrócił(a) profil',
  'clan.delete': 'usunął(ęła) klan', 'clan.logo_remove': 'usunął(ęła) logo klanu', 'clan.rename': 'zmienił(a) nazwę klanu', 'clan.kick': 'wyrzucił(a) z klanu',
  'clan.role': 'zmienił(a) rolę w klanie', 'clan.transfer': 'przekazał(a) klan',
  'community.delete': 'usunął(ęła) społeczność', 'community.logo_remove': 'usunął(ęła) logo społeczności', 'community.description_remove': 'usunął(ęła) opis społeczności',
  'community.transfer': 'przekazał(a) społeczność', 'community.message_delete': 'usunął(ęła) zgłoszoną wiadomość w', 'community.report_dismiss': 'odrzucił(a) zgłoszenie w',
  support_provider: 'zmienił(a) operatora płatności', support_test: 'sprawdził(a) połączenie z', support_settings: 'zmienił(a) ustawienia wsparcia',
  support_tier: 'zapisał(a) poziom wsparcia', support_tier_delete: 'usunął(ęła) poziom wsparcia',
  legal_draft: 'zapisał(a) szkic dokumentu', legal_publish: 'opublikował(a) dokument', legal_restore: 'przywrócił(a) wersję dokumentu',
  home_draft: 'zapisał(a) szkic:', home_publish: 'opublikował(a) nową wersję:', home_restore: 'przywrócił(a) starszą wersję jako szkic:', home_image: 'wgrał(a) obrazek:',
  legal_banner: 'zmienił(a) baner wersji roboczej', legal_vars: 'zmienił(a) dane administratora w dokumentach',
  rank_create: 'dodał(a) rangę', rank_update: 'zmienił(a) rangę', rank_delete: 'usunął(ęła) rangę', rank_icon: 'zmienił(a) ikonę rangi',
  rank_grant: 'nadał(a) rangę', rank_revoke: 'odebrał(a) rangę',
  support_grant: 'przyznał(a) wsparcie', support_extend: 'przedłużył(a) wsparcie', support_revoke: 'odebrał(a) wsparcie',
  streams_provider: 'zmienił(a) aplikację streamów', streams_test: 'sprawdził(a) połączenie z', streams_reconcile: 'sprawdził(a) teraz kanały:',
  streams_unlink: 'odłączył(a) kanał streamu gracza',
  partner_status_add: 'dodał(a) regułę statusów z listy graczy dla', partner_status_edit: 'zmienił(a) regułę statusów z listy graczy dla', partner_status_remove: 'usunął(ęła) regułę statusów z listy graczy dla', partner_status_defaults: 'zmienił(a) domyślny wygląd',
  setting: 'zmienił(a) ustawienie', setting_reset: 'przywrócił(a) domyślne ustawienie', cosmetic_supporter: 'zmienił(a) poziom wsparcia dla',
};

let me;
// "#achievements:<id>" opens that achievement in the creator
let tab = location.hash.slice(1).split(':')[0] || 'dashboard';
const users = { q: '', offset: 0, limit: 25 };
let capeNames = {};
let capeSlots = {};

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
  capeNames = Object.fromEntries((cos.items ?? cos.capes).map((c) => [c.id, c.name]));
  capeSlots = Object.fromEntries((cos.items ?? cos.capes).map((c) => [c.id, c.slot ?? 'cape']));
  layout();
}

// ---------- layout ----------

function layout() {
  closeDrawer();
  const side = el('aside', { class: 'side' }, el('a', { class: 'brand', href: '/' }, el('img', { src: 'vendor/logo.png', alt: '' }), el('span', {}, 'Slash', el('b', { textContent: 'Admin' }))));
  for (const [group, tabs] of GROUPS) {
    side.append(el('small', { class: 'side-group', textContent: group }));
    for (const [id, name, cls] of tabs) {
      side.append(el('button', { class: `tab${tab === id ? ' active' : ''}`, onclick: () => { tab = id; location.hash = id; layout(); } }, icon(cls), name));
    }
  }
  side.append(el('div', { class: 'me' }, avatarEl(me), el('div', { class: 'grow' }, el('b', { textContent: me.name }), el('small', { class: 'muted', textContent: ` @${me.handle}` })),
    el('button', { class: 'icon-btn', title: 'Wyloguj', onclick: async () => { await signOut(); me = undefined; gate(); } }, icon('fa-solid fa-right-from-bracket'))));
  const main = el('main', { class: 'main', id: 'main' });
  $('#root').replaceChildren(el('div', { class: 'admin' }, side, main));
  ({ dashboard, users: usersPage, ranks: ranksPage, cosmetics: cosmeticsPage, achievements: achievementsPage, challenges: challengesPage, partners: partnersPage, clans: clansPage, communities: communitiesPage, requests: requestsPage, logs: logsPage, storage: storagePage, support: supportPage, streams: streamsPage, fishAtlas: fishAtlasPage, home: homePage, legal: legalPage, settings: settingsPage, log: logPage })[tab]?.();
}

const head = (title, ...extra) => el('div', { class: 'page-head' }, el('h1', { textContent: title }), ...extra);
const stat = (cls, label, value, note) => el('div', { class: 'glass stat' }, el('small', {}, icon(cls), label), el('b', { textContent: String(value) }), note ? el('em', { textContent: note }) : '');

// ---------- dashboard (adminDashboard.js) ----------

function dashboard() {
  return dashboardPage({ go: (id) => { tab = id; location.hash = id; layout(); }, capeNames, capeSlots });
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
  // the ranks' colours for the chips (adminRanks.js)
  await ranksReady();
  const box = $('#users-box');
  if (!res || !box) return;
  if (!res.users.length) return box.replaceChildren(el('p', { class: 'muted', textContent: 'Brak kont.' }));
  const rows = res.users.map((u) => el('tr', { onclick: () => openUser(u.id) },
    el('td', {}, el('div', { class: 'who' }, avatarEl(u), el('div', {}, el('b', { textContent: u.name }), el('small', { textContent: `@${u.handle}` })))),
    el('td', { class: 'hide-sm' }, ...u.providers.map((p) => el('span', { class: 'chip', title: p }, icon((PROVIDERS[p] ?? ['', 'fa-solid fa-flask'])[1])))),
    el('td', {}, capeCell(u)),
    el('td', { class: 'hide-sm', textContent: ago(u.lastSeen) }),
    el('td', {}, badges(u))));
  const pages = el('div', { class: 'pager' },
    `${users.offset + 1}–${Math.min(res.total, users.offset + users.limit)} z ${res.total}`,
    el('button', { class: 'icon-btn', disabled: users.offset === 0, onclick: () => { users.offset = Math.max(0, users.offset - users.limit); loadUsers(); } }, icon('fa-solid fa-chevron-left')),
    el('button', { class: 'icon-btn', disabled: users.offset + users.limit >= res.total, onclick: () => { users.offset += users.limit; loadUsers(); } }, icon('fa-solid fa-chevron-right')));
  box.replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Gracz' }), el('th', { class: 'hide-sm', textContent: 'Logowanie' }), el('th', { textContent: 'Peleryna' }), el('th', { class: 'hide-sm', textContent: 'Ostatnio' }), el('th', { textContent: 'Status' }))), el('tbody', {}, ...rows)), pages);
}

/** The cape worn in game: set in the client per Minecraft account, else the account's own. */
function capeCell(u) {
  const worn = (u.worn ?? []).filter((w) => w.cape);
  const capes = [...new Set(worn.map((w) => w.cape))];
  if (!worn.length && u.cape) capes.push(u.cape);
  if (!capes.length) return el('span', { class: 'muted', textContent: '—' });
  const one = (cape, who) => el('div', { class: 'row' }, capeEl(cape, true), el('span', {}, capeNames[cape] ?? cape, who ? el('span', { class: 'muted', textContent: ` (${who})` }) : ''));
  if (capes.length === 1) return one(capes[0]);
  return el('div', { class: 'worn' }, ...worn.map((w) => one(w.cape, w.name)));
}

const badges = (u) => el('div', { class: 'row' },
  u.banned ? el('span', { class: 'chip red' }, icon('fa-solid fa-ban'), 'Zablokowany') : '',
  u.role === 'admin' || u.configAdmin ? el('span', { class: 'chip red' }, icon('fa-solid fa-shield-halved'), 'Admin') : '',
  ...rankChips(u.ranks),
  !u.banned && !(u.role === 'admin' || u.configAdmin) ? el('span', { class: 'chip green', textContent: 'Aktywny' }) : '');

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
    // sparks from achievements: the balance, giving and taking with a reason (adminSparks.js)
    walletSection(id),
    // several ranks, each until a day or for good (adminRanks.js)
    userRanksSection(id, loadUsers),
    el('div', { class: 'actions' },
      el('button', { disabled: self, onclick: () => update({ banned: !u.banned }, u.banned ? 'Konto odblokowane.' : 'Konto zablokowane i wylogowane.'), class: u.banned ? '' : 'danger' },
        icon(u.banned ? 'fa-solid fa-unlock' : 'fa-solid fa-ban'), u.banned ? 'Odblokuj' : 'Zablokuj'),
      el('a', { class: 'btn', href: `/u/${encodeURIComponent(u.handle)}`, target: '_blank', rel: 'noopener' }, icon('fa-solid fa-id-card'), 'Profil publiczny'),
      profileHideButton(u),
      el('button', { onclick: async () => { if (await guard(() => api('POST', `/v1/admin/users/${id}/logout`))) { toast('Wylogowano ze wszystkich urządzeń.'); openUser(id); } } },
        icon('fa-solid fa-right-from-bracket'), 'Wyloguj wszędzie'),
      el('button', { disabled: self || u.configAdmin, title: u.configAdmin ? 'Admin z konfiguracji serwera (ADMIN_HANDLES)' : '', onclick: () => update({ role: u.role === 'admin' ? '' : 'admin' }, u.role === 'admin' ? 'Odebrano uprawnienia admina.' : 'Nadano uprawnienia admina.') },
        icon('fa-solid fa-shield-halved'), u.role === 'admin' || u.configAdmin ? 'Odbierz admina' : 'Nadaj admina'),
      el('button', { class: 'danger', disabled: self || u.configAdmin, onclick: async () => {
        if (!await confirmModal({ title: `Usunąć konto ${u.name} (@${u.handle})?`, text: 'Razem ze znajomymi i wiadomościami.', warning: 'Tego nie da się cofnąć.', ok: 'Usuń konto', okIcon: 'fa-solid fa-trash-can', danger: true })) return;
        if (await guard(() => api('DELETE', `/v1/admin/users/${id}`))) { toast('Konto usunięte.'); closeDrawer(); loadUsers(); }
      } }, icon('fa-solid fa-trash-can'), 'Usuń konto')));
  document.body.append(el('div', { class: 'shade', onclick: closeDrawer }), drawer);
}

/** Hiding a public profile (moderation): it is then "not found" for everyone but its owner and admins. */
function profileHideButton(u) {
  const b = el('button', { disabled: true }, icon('fa-solid fa-eye-slash'), 'Ukryj profil');
  const path = `/v1/profiles/${encodeURIComponent(u.handle)}`;
  api('GET', path).then(({ profile }) => {
    const hidden = !!profile.moderation?.hidden;
    b.disabled = false;
    b.className = hidden ? '' : 'danger';
    b.replaceChildren(icon(hidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'), hidden ? 'Przywróć profil' : 'Ukryj profil');
    if (hidden && profile.moderation.reason) b.title = `Ukryty: ${profile.moderation.reason}`;
    b.onclick = async () => {
      const reason = hidden ? '' : await promptModal({ title: `Ukryć profil @${u.handle}?`, label: 'Dlaczego? (zapisze się w dzienniku)', ok: 'Ukryj', okIcon: 'fa-solid fa-eye-slash', danger: true });
      if (reason === null) return;
      if (await guard(() => api('POST', `/v1/admin/profiles/${encodeURIComponent(u.handle)}`, { hidden: !hidden, reason }))) {
        toast(hidden ? 'Profil znowu widoczny.' : 'Profil ukryty.');
        openUser(u.id);
      }
    };
  }).catch(() => {});
  return b;
}

// ---------- cosmetics ----------

/** From the cosmetics tab: an achievement that gives an item, in the creator. */
const openAchievement = (id) => {
  // the hash change switches the tab (below)
  location.hash = `achievements:${id}`;
};

/** An item's shop price, editable: a number puts it on sale, empty takes it off, ↺ back to the default. */
function priceEditor(c, o, done) {
  if (!o.sellable) return '';
  const input = el('input', { type: 'number', min: 1, step: 1, value: o.price ?? '', placeholder: 'brak', title: `Pusta: poza sklepem. ${o.defaultPrice ? `Domyślnie ${o.defaultPrice}` : 'Domyślnie poza sklepem'}` });
  const send = async (body, ask) => {
    if (ask && !await confirmModal(ask)) return done();
    const r = await guard(() => api('POST', `/v1/admin/shop/${c.id}`, body));
    if (r) toast(r.price ? `Cena: ${r.price}.${r.kept ? ` ${r.kept} graczy, którzy go noszą, zachowuje go.` : ''}` : 'Poza sklepem.');
    done();
  };
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (v === '') {
      return o.price === null ? undefined : send({ price: null }, { title: `Zdjąć „${c.name}” ze sprzedaży?`, text: 'Przedmiot stanie się dostępny za darmo (chyba że jest ekskluzywny). Kupione zostają u kupujących.', ok: 'Zdejmij' });
    }
    const n = Number(v);
    if (n === o.price) return;
    send({ price: n }, o.price === null ? { title: `Wystawić „${c.name}” w sklepie za ${n} Iskier?`, text: 'Odtąd tylko kupujący (i ci, którzy go teraz noszą) będą mogli go założyć.', ok: 'Wystaw' } : null);
  });
  return el('label', { class: 'opt', title: 'Cena w sklepie za Iskry' }, el('span', {}, el('span', { class: 'spark-sign', textContent: '✦' }), ' Sklep'),
    el('span', { class: 'row' }, input,
      o.price !== o.defaultPrice ? el('button', { type: 'button', class: 'icon-btn', title: `Przywróć domyślną (${o.defaultPrice ?? 'poza sklepem'})`, onclick: () => send({ reset: true }) }, icon('fa-solid fa-rotate-left')) : ''));
}

async function cosmeticsPage() {
  const [res, obtain] = await Promise.all([guard(() => api('GET', '/v1/admin/cosmetics')), api('GET', '/v1/admin/cosmetics/obtain').catch(() => undefined)]);
  if (!res) return;
  const all = res.items ?? res.capes;
  const cards = all.map((c) => {
    const toggle = (label, key, hint) => {
      const box = el('input', { type: 'checkbox', checked: c[key] });
      box.addEventListener('change', async () => {
        const warn = key === 'enabled' && !box.checked ? { title: `Wyłączyć „${c.name}”?`, text: 'Wyłączona peleryna zniknie wszystkim, którzy ją noszą.', ok: 'Wyłącz', danger: true }
          : key === 'exclusive' && box.checked ? { title: `„${c.name}” tylko z przyznania?`, text: 'Peleryna zostanie zdjęta tym, którzy jej nie mają przyznanej.', ok: 'Kontynuuj' } : null;
        // "Anuluj" puts the switch back where it was
        if (warn && c.wearing && !await confirmModal(warn)) { box.checked = !box.checked; return; }
        if (await guard(() => api('POST', `/v1/admin/cosmetics/${c.id}`, { [key]: box.checked }))) { toast('Zapisano.'); cosmeticsPage(); } else box.checked = !box.checked;
      });
      return el('label', { class: 'opt', title: hint }, label, el('span', { class: 'switch' }, box, el('span')));
    };
    const handle = el('input', { type: 'text', placeholder: '@nick' });
    const grant = el('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      if (await guard(() => api('POST', `/v1/admin/cosmetics/${c.id}/grants`, { handle: handle.value.trim() }))) { toast('Przyznano.'); cosmeticsPage(); }
    } }, handle, el('button', { type: 'submit', class: 'icon-btn', title: 'Przyznaj' }, icon('fa-solid fa-plus')));
    return el('div', { class: 'glass cos' }, cosmeticEl(c.id, c.slot ?? 'cape'),
      el('div', { class: 'opts' },
        el('div', { class: 'row' }, el('h3', { class: 'grow', textContent: c.name }), c.rank ? el('span', { class: `chip ${{ admin: 'red', support: 'sky', partner: 'gold', friend: 'green', friend_pink: 'pink' }[c.rank] ?? ''}`, textContent: c.rank }) : '', el('span', { class: 'chip', textContent: `${c.wearing} nosi` })),
        // how it can be got now (obtain.ts on the server: free, shop, achievements, rank, grant only)
        obtain?.items[c.id] ? obtainLine(obtain.items[c.id], openAchievement) : '',
        toggle('Włączona', 'enabled', 'Wyłączonej nie można wybrać i nikt jej nie widzi'),
        toggle('Ekskluzywna', 'exclusive', 'Tylko dla graczy, którym ją przyznasz'),
        obtain?.items[c.id] ? priceEditor(c, obtain.items[c.id], cosmeticsPage) : '',
        // only for supporters from a tier level (adminSettings.js)
        obtain?.items[c.id] ? supporterEditor(c, obtain.items[c.id], cosmeticsPage) : '',
        c.exclusive ? el('div', {}, el('small', { class: 'muted', textContent: 'Przyznana:' }),
          el('div', { class: 'grantees' }, ...(c.grantees.length ? c.grantees.map((g) => el('span', { class: 'chip blue' }, `@${g.handle}`,
            el('button', { title: 'Odbierz', onclick: async () => { if (await guard(() => api('DELETE', `/v1/admin/cosmetics/${c.id}/grants/${g.id}`))) cosmeticsPage(); } }, icon('fa-solid fa-xmark'))))
            : [el('span', { class: 'muted small', textContent: 'nikomu' })])), grant) : ''));
  });
  $('#main').replaceChildren(head('Kosmetyki'),
    el('p', { class: 'muted', textContent: 'Kosmetyki są wbudowane w mod SlashClient; tutaj decydujesz, które są dostępne i dla kogo. Przedmioty rang noszą tylko gracze z tą rangą (admini wszystkie) albo ci, którym je przyznasz. Emotki są dostępne dla wszystkich. Przy każdym przedmiocie widać, jak można go zdobyć; osiągnięcia otwierają się w kreatorze.' }),
    shopSection(),
    el('div', { class: 'cosmetics' }, ...SLOTS.flatMap(([slot, name, ic]) => {
      const mine = cards.filter((_, i) => (all[i].slot ?? 'cape') === slot);
      return mine.length ? [el('h3', { class: 'slot-head' }, icon(ic), name), ...mine] : [];
    })));
}

// ---------- partner servers ----------

/** A file picker that sends the chosen picture to `path`. */
function pictureButton(label, path, done) {
  const input = el('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'hidden' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (file && await guard(() => uploadPicture(path, file))) done();
  });
  return el('label', { class: 'btn' }, icon('fa-solid fa-image'), label, input);
}

async function partnersPage() {
  const res = await guard(() => api('GET', '/v1/admin/partners'));
  if (!res) return;
  const address = el('input', { type: 'text', placeholder: 'Adres, np. skyup.pl' });
  const name = el('input', { type: 'text', placeholder: 'Nazwa (opcjonalnie)', maxLength: 48 });
  const owner = el('input', { type: 'text', placeholder: '@właściciel (opcjonalnie)' });
  const add = el('form', { class: 'glass card row partner-add', onsubmit: async (e) => {
    e.preventDefault();
    if (await guard(() => api('POST', '/v1/admin/partners', { address: address.value, name: name.value, owner: owner.value }))) { toast('Dodano serwer partnerski.'); partnersPage(); }
  } }, address, name, owner, el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-plus'), 'Dodaj'));

  const cards = res.partners.map((p) => {
    const ownerInput = el('input', { type: 'text', value: p.owner ? `@${p.owner}` : '', placeholder: '@właściciel' });
    const save = el('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      if (await guard(() => api('POST', `/v1/admin/partners/${p.id}`, { owner: ownerInput.value }))) { toast('Zapisano.'); partnersPage(); }
    } }, el('small', { class: 'muted', textContent: 'Właściciel (konto partnera) może sam zmieniać tło na stronie Konto:' }), ownerInput, el('button', { type: 'submit', class: 'icon-btn', title: 'Zapisz' }, icon('fa-solid fa-check')));
    // pinned: always on top of the game's server list (it cannot be removed there); rotating: the
    // pinned ones with it take turns at the very top
    const pinning = async (change, done) => { if (await guard(() => api('POST', `/v1/admin/partners/${p.id}`, change))) { toast(done); partnersPage(); } };
    const pin = el('input', { type: 'checkbox', checked: !!p.pinned });
    pin.addEventListener('change', () => pinning({ pinned: pin.checked }, pin.checked ? 'Przypięty na górze listy serwerów.' : 'Już nie jest przypięty.'));
    const rot = el('input', { type: 'checkbox', checked: !!p.rotate, disabled: !p.pinned });
    rot.addEventListener('change', () => pinning({ rotate: rot.checked }, rot.checked ? 'Rotuje na pierwszym miejscu.' : 'Stałe miejsce.'));
    const toggles = el('div', { class: 'row partner-pins' },
      el('label', { class: 'row small', title: 'Mod sam dodaje ten serwer na górę listy serwerów; gracz nie może go usunąć ani zmienić nazwy i adresu (tylko paczkę zasobów).' },
        el('span', { class: 'switch' }, pin, el('span')), 'Przypinaj na górze listy'),
      el('label', { class: `row small${p.pinned ? '' : ' muted'}`, title: 'Przypięte serwery z tą opcją zmieniają się na pierwszym miejscu przy każdym otwarciu listy.' },
        el('span', { class: 'switch' }, rot, el('span')), 'Rotuj na pierwszym miejscu'));
    // other addresses players add the same server under: the game shows those as the partner too
    const aliases = p.aliases ?? [];
    const addresses = el('div', { class: 'row partner-addresses' },
      el('small', { class: 'muted', textContent: 'Adresy:' }),
      el('span', { class: 'chip gold', title: 'Główny adres (przypinanie zostaje na nim)', textContent: p.address }),
      ...aliases.map((a) => el('span', { class: 'chip', textContent: a })));
    const aliasInput = el('textarea', { rows: Math.min(8, Math.max(3, aliases.length + 1)), placeholder: 'np.\nskyup.eu\n51.38.10.20\nmc.skyup.net:25566', value: aliases.join('\n'), spellcheck: false });
    const aliasError = el('p', { class: 'partner-alias-error', role: 'alert', hidden: true });
    const aliasForm = el('form', { class: 'partner-aliases', onsubmit: async (e) => {
      e.preventDefault();
      aliasError.hidden = true;
      try {
        await api('PUT', `/v1/admin/partners/${p.id}/aliases`, { aliases: aliasInput.value.split('\n') });
        toast('Zapisano alternatywne adresy.');
        partnersPage();
      } catch (err) {
        aliasError.textContent = errorText(err);
        aliasError.hidden = false;
        aliasInput.focus();
      }
    } },
      el('label', { class: 'small', textContent: 'Alternatywne adresy' }),
      el('small', { class: 'muted', textContent: 'Inne domeny, IP lub zapisy tego serwera, po jednym w linii. Gracz, który doda serwer pod takim adresem (albo jego subdomeną), też zobaczy ramkę, znak „Partner”, tło i ikonę.' }),
      aliasInput, aliasError,
      el('div', { class: 'row' }, el('button', { type: 'submit' }, icon('fa-solid fa-check'), 'Zapisz adresy')));
    return el('div', { class: 'glass card partner-card' },
      partnerBanner(p), addresses, toggles,
      el('div', { class: 'row' },
        pictureButton(p.background ? 'Zmień tło' : 'Wgraj tło', `/v1/admin/partners/${p.id}/background`, partnersPage),
        p.background ? el('button', { onclick: async () => { if (await guard(() => api('DELETE', `/v1/admin/partners/${p.id}/background`))) partnersPage(); } }, icon('fa-solid fa-eraser'), 'Usuń tło') : '',
        el('div', { class: 'grow' }),
        el('button', { class: 'danger', onclick: async () => {
          if (!await confirmModal({ title: `Usunąć ${p.address} z serwerów partnerskich?`, ok: 'Usuń', okIcon: 'fa-solid fa-trash-can', danger: true })) return;
          if (await guard(() => api('DELETE', `/v1/admin/partners/${p.id}`))) partnersPage();
        } }, icon('fa-solid fa-trash-can'), 'Usuń')),
      partnerIconControls(p, `/v1/admin/partners/${p.id}/icon`, res.iconLimits, partnersPage),
      aliasForm,
      save);
  });
  $('#main').replaceChildren(head('Serwery partnerskie'),
    el('p', { class: 'muted', textContent: 'Tło pojawia się za tym serwerem na liście serwerów w grze, u graczy z modem SlashClient. Najlepiej obrazek 1200×120 albo podobnie szeroki (PNG lub JPG, do 3 MB).' }),
    add,
    el('div', { class: 'partner-list' }, ...(cards.length ? cards : [el('p', { class: 'muted', textContent: 'Nie ma jeszcze serwerów partnerskich.' })])),
    statusRulesSection());
}

// ---------- requests from launchers, games and pages ----------

const reqState = { q: '', errors: false, client: '', user: '', handle: '', live: true };
const CLIENTS = { launcher: ['Launcher', 'fa-solid fa-rocket'], mod: ['Gra (mod)', 'fa-solid fa-cube'], strona: ['Strona', 'fa-solid fa-globe'], inne: ['Inne', 'fa-solid fa-question'] };
const statusClass = (s) => (s >= 500 ? 'red' : s >= 400 ? 'gold' : s >= 300 ? 'sky' : 'green');
const clock = (ms) => new Date(ms).toLocaleTimeString('pl-PL');
let reqTimer;

async function requestsPage() {
  clearInterval(reqTimer);
  const q = el('input', { type: 'search', placeholder: 'Ścieżka albo kod błędu…', value: reqState.q });
  const client = el('select', {}, el('option', { value: '', textContent: 'Wszyscy klienci' }),
    ...Object.entries(CLIENTS).map(([k, [name]]) => el('option', { value: k, textContent: name, selected: reqState.client === k })));
  const errors = el('input', { type: 'checkbox', checked: reqState.errors });
  const live = el('input', { type: 'checkbox', checked: reqState.live });
  const who = el('div', { class: 'row' });
  const stats = el('div', { class: 'stats' });
  const routesBox = el('div', { class: 'glass card req-card' });
  const list = el('div', { class: 'glass card' }, el('p', { class: 'muted', textContent: 'Wczytuję…' }));
  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { reqState.q = q.value.trim(); load(); }, 250); });
  client.addEventListener('change', () => { reqState.client = client.value; load(); });
  errors.addEventListener('change', () => { reqState.errors = errors.checked; load(); });
  live.addEventListener('change', () => { reqState.live = live.checked; });
  const toggle = (input, text) => el('label', { class: 'row small' }, el('span', { class: 'switch' }, input, el('span')), text);
  $('#main').replaceChildren(head('Zapytania', el('span', { class: 'muted small', textContent: 'Na żywo z serwera, bez treści i tokenów. Po restarcie serwera lista zaczyna się od nowa.' })),
    el('div', { class: 'row req-bar' }, q, client, toggle(errors, 'Tylko błędy'), toggle(live, 'Odświeżaj co 5 s'), who), stats, routesBox, list);

  async function load() {
    if (!document.body.contains(list)) return clearInterval(reqTimer);
    const p = new URLSearchParams({ q: reqState.q, client: reqState.client, user: reqState.user, errors: reqState.errors ? '1' : '' });
    const res = await api('GET', `/v1/admin/requests?${p}`).catch((err) => { toast(errorText(err), true); return undefined; });
    if (!res) return;
    const s = res.summary;
    stats.replaceChildren(
      stat('fa-solid fa-gauge-high', 'Na minutę', s.lastMinute),
      stat('fa-solid fa-clock', 'Ostatnia godzina', s.lastHour),
      stat('fa-solid fa-triangle-exclamation', 'Błędy (godzina)', s.errors, s.serverErrors ? `w tym ${s.serverErrors} po stronie serwera` : ''),
      stat('fa-solid fa-users-viewfinder', 'Klienci (godzina)', Object.values(s.clients).reduce((a, b) => a + b, 0),
        Object.entries(s.clients).map(([k, n]) => `${(CLIENTS[k] ?? [k])[0]} ${n}`).join(' · ')));
    routesBox.replaceChildren(el('h3', { textContent: 'Najczęstsze w ostatniej godzinie' }), s.routes.length
      ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Zapytanie' }), el('th', { textContent: 'Ile' }), el('th', { textContent: 'Błędy' }), el('th', { class: 'hide-sm', textContent: 'Śr. czas' }), el('th', { class: 'hide-sm', textContent: 'Najdłużej' }))),
        el('tbody', {}, ...s.routes.map((r) => el('tr', {},
          el('td', {}, el('code', { textContent: r.route })),
          el('td', { textContent: String(r.count) }),
          el('td', {}, r.errors ? el('span', { class: 'chip gold', textContent: String(r.errors) }) : el('span', { class: 'muted', textContent: '0' })),
          el('td', { class: 'hide-sm', textContent: `${r.avgMs} ms` }),
          el('td', { class: 'hide-sm', textContent: `${r.maxMs} ms` })))))
      : el('p', { class: 'muted', textContent: 'Jeszcze nic.' }));
    who.replaceChildren(reqState.user ? el('button', { class: 'chip blue', title: 'Pokaż wszystkich', onclick: () => { reqState.user = ''; reqState.handle = ''; load(); } },
      icon('fa-solid fa-user'), `@${reqState.handle}`, icon('fa-solid fa-xmark')) : '');
    const rows = res.entries.map((e) => {
      const [cname, cicon] = CLIENTS[e.client] ?? [e.client, 'fa-solid fa-question'];
      return el('tr', {},
        el('td', { title: fmtDate(e.at), textContent: clock(e.at) }),
        el('td', {}, e.handle ? el('button', { class: 'chip', title: 'Tylko zapytania tego konta', onclick: () => { reqState.user = e.user; reqState.handle = e.handle; load(); } }, `@${e.handle}`)
          : el('span', { class: 'muted small', textContent: e.ip })),
        el('td', { class: 'hide-sm' }, el('span', { class: 'chip', title: e.version ? `${cname} ${e.version}` : cname }, icon(cicon), e.version || cname)),
        el('td', { class: 'req-path' }, el('b', { textContent: e.method }), ' ', el('code', { textContent: e.path })),
        el('td', {}, el('span', { class: `chip ${statusClass(e.status)}`, title: e.error, textContent: e.error ? `${e.status} ${e.error}` : String(e.status) })),
        el('td', { class: 'hide-sm', textContent: `${e.ms} ms` }));
    });
    list.replaceChildren(el('h3', { textContent: `Ostatnie zapytania (${res.entries.length} z ${res.kept} zapamiętanych od ${clock(res.since)})` }), rows.length
      ? el('div', { class: 'scroll-x' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Kiedy' }), el('th', { textContent: 'Kto' }), el('th', { class: 'hide-sm', textContent: 'Klient' }), el('th', { textContent: 'Zapytanie' }), el('th', { textContent: 'Status' }), el('th', { class: 'hide-sm', textContent: 'Czas' }))), el('tbody', {}, ...rows)))
      : el('p', { class: 'muted', textContent: 'Nic nie pasuje.' }));
  }
  await load();
  reqTimer = setInterval(() => { if (reqState.live && !document.hidden) load(); }, 5000);
}

// ---------- players' logs ----------

const logsState = { q: '', offset: 0 };
/** 1 log, 3 logi, 5 logów. */
const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

async function logsPage() {
  const q = el('input', { type: 'search', placeholder: 'Szukaj po nicku albo id logu…', value: logsState.q });
  const box = el('div', { class: 'glass card' }, el('p', { class: 'muted', textContent: 'Wczytuję…' }));
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { logsState.q = q.value.trim(); logsState.offset = 0; load(); }, 250);
  });
  $('#main').replaceChildren(head('Logi graczy', q), box);

  async function load() {
    const res = await guard(() => api('GET', `/v1/admin/logs?q=${encodeURIComponent(logsState.q)}&offset=${logsState.offset}`));
    if (!res) return;
    const rows = res.logs.map((l) => el('tr', {},
      el('td', { title: fmtDate(l.createdAt), textContent: ago(l.createdAt) }),
      el('td', { textContent: l.ownerHandle ? `@${l.ownerHandle}` : l.owner ? 'usunięte konto' : 'bez konta' }),
      el('td', { class: 'hide-sm', textContent: `${l.lines} linii · ${(l.size / 1024).toFixed(0)} KB` }),
      el('td', {}, l.bugs ? el('span', { class: 'chip blue', title: 'Zgłoszenia z tym logiem' }, icon('fa-solid fa-bug'), String(l.bugs)) : el('span', { class: 'muted', textContent: '—' })),
      el('td', { class: 'row' },
        el('a', { class: 'btn', href: `/logi/${l.id}`, target: '_blank', rel: 'noopener' }, icon('fa-solid fa-up-right-from-square'), el('span', { class: 'hide-sm', textContent: ' Otwórz' })),
        el('button', { class: 'icon-btn danger', title: 'Usuń log', onclick: async () => {
          if (!await confirmModal({ title: `Usunąć log ${l.id}?`, text: 'Link przestanie działać.', ok: 'Usuń', okIcon: 'fa-solid fa-trash', danger: true })) return;
          if (await guard(() => api('DELETE', `/v1/admin/logs/${l.id}`))) { toast('Usunięto log'); load(); }
        } }, icon('fa-solid fa-trash')))));
    const pages = el('div', { class: 'row pager' });
    if (res.offset > 0) pages.append(el('button', { onclick: () => { logsState.offset = Math.max(0, res.offset - res.limit); load(); } }, icon('fa-solid fa-chevron-left'), 'Nowsze'));
    pages.append(el('span', { class: 'muted small', textContent: `${res.total} ${plural(res.total, 'log', 'logi', 'logów')} · trzymane ${res.days} dni` }));
    if (res.offset + res.limit < res.total) pages.append(el('button', { onclick: () => { logsState.offset += res.limit; load(); } }, 'Starsze', icon('fa-solid fa-chevron-right')));
    box.replaceChildren(res.logs.length
      ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Kiedy' }), el('th', { textContent: 'Kto' }), el('th', { class: 'hide-sm', textContent: 'Rozmiar' }), el('th', { textContent: 'Zgłoszenia' }), el('th', { textContent: '' }))), el('tbody', {}, ...rows))
      : el('p', { class: 'muted', textContent: logsState.q ? 'Nic nie pasuje.' : 'Gracze nie wysłali jeszcze żadnego logu.' }), pages);
  }
  load();
}

// ---------- log ----------

async function logPage() {
  const res = await guard(() => api('GET', '/v1/admin/log'));
  if (!res) return;
  const people = {};
  // the lookup itself is kept, so the rows of one admin ask for them once, not once a row
  const nameOf = (id) => (people[id] ??= api('GET', `/v1/admin/users/${id}`).then((u) => u?.handle ?? id.slice(0, 8), () => id.slice(0, 8)));
  const rows = await Promise.all(res.entries.map(async (e) => el('tr', {},
    el('td', { textContent: fmtDate(e.at) }),
    el('td', { textContent: `@${await nameOf(e.admin)}` }),
    el('td', {}, ACTIONS[e.action] ?? e.action, ' ', el('b', { textContent: e.action === 'cape_settings' || e.action === 'shop_price' || e.action === 'cosmetic_supporter' ? capeNames[e.target] ?? e.target : /^(partner|log_|bug_|storage_|clan\.|community\.|ach_(create|edit|reset|delete)|home_|support_(provider|test|settings|tier)|setting)/.test(e.action) ? e.target : `@${e.target}` })),
    el('td', { class: 'log-detail', textContent: ['grant', 'revoke', 'set_cape'].includes(e.action) ? capeNames[e.detail] ?? e.detail : e.detail }))));
  $('#main').replaceChildren(head('Dziennik'),
    el('div', { class: 'glass card' }, res.entries.length
      ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Kiedy' }), el('th', { textContent: 'Kto' }), el('th', { textContent: 'Co' }), el('th', { textContent: 'Szczegóły' }))), el('tbody', {}, ...rows))
      : el('p', { class: 'muted', textContent: 'Jeszcze nic się nie wydarzyło.' })));
}

addEventListener('hashchange', () => {
  const next = location.hash.slice(1).split(':')[0];
  if (me?.admin && next && next !== tab && TABS.some(([id]) => id === next)) {
    tab = next;
    layout();
  } else if (me?.admin && next === 'achievements' && tab === 'achievements' && foreignHash()) achievementsPage();
});
start().catch((err) => toast(errorText(err), true));
