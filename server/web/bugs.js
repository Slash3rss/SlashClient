// The bug tracker: the list (/zgloszenia), one report (/zgloszenia/<n>) and a new one (?nowe=1).
// Anyone can read; signed-in players write; admins change the status.
import { go } from '/router.js';
import { $, L, api, ago, confirmModal, el, english, fmtDate, guard, icon, localizePage, toast, token } from './common.js';

localizePage('SlashClient – Bug reports');
const STATUS = english() ? {
  open: ['Open', 'fa-regular fa-circle'],
  confirmed: ['Confirmed', 'fa-solid fa-circle-exclamation'],
  fixed: ['Fixed', 'fa-solid fa-circle-check'],
  closed: ['Closed', 'fa-solid fa-circle-xmark'],
  duplicate: ['Duplicate', 'fa-regular fa-clone'],
} : {
  open: ['Otwarte', 'fa-regular fa-circle'],
  confirmed: ['Potwierdzone', 'fa-solid fa-circle-exclamation'],
  fixed: ['Naprawione', 'fa-solid fa-circle-check'],
  closed: ['Zamknięte', 'fa-solid fa-circle-xmark'],
  duplicate: ['Duplikat', 'fa-regular fa-clone'],
};
const statusChip = (s) => el('span', { class: `chip st-${s}` }, icon(STATUS[s]?.[1] ?? 'fa-regular fa-circle'), STATUS[s]?.[0] ?? s);
const author = (handle) => (handle ? `@${handle}` : L('usunięte konto', 'deleted account'));

let me;
const params = new URLSearchParams(location.search);
const bugId = Number(location.pathname.split('/')[2] ?? 0);

function renderNav() {
  $('#nav-account .label').textContent = me ? me.name : L('Zaloguj się', 'Sign in');
  $('#nav-admin').classList.toggle('hidden', !me?.admin);
}

const signInHint = (what) => el('div', { class: 'glass card row' }, icon('fa-solid fa-right-to-bracket'),
  el('span', { class: 'grow' }, L(`Żeby ${what}, zaloguj się na `, `To ${what}, sign in on the `), el('a', { href: L('/konto', '/account'), textContent: L('stronie konta', 'account page') }), '.'));

// ---------- the list ----------

async function renderList() {
  const box = $('#bugs');
  const q = el('input', { type: 'search', placeholder: L('Szukaj zgłoszeń…', 'Search reports…'), value: params.get('q') ?? '' });
  const status = el('select', {}, el('option', { value: '', textContent: L('Wszystkie', 'All') }),
    ...Object.entries(STATUS).map(([k, [name]]) => el('option', { value: k, textContent: name, selected: params.get('status') === k })));
  const go = (page = 0) => {
    const p = new URLSearchParams();
    if (q.value.trim()) p.set('q', q.value.trim());
    if (status.value) p.set('status', status.value);
    if (page) p.set('page', String(page));
    history.replaceState(null, '', `/zgloszenia${p.size ? `?${p}` : ''}`);
    load(p);
  };
  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => go(), 250); });
  status.addEventListener('change', () => go());
  const add = el('a', { class: 'btn primary', href: '/zgloszenia?nowe=1' }, icon('fa-solid fa-plus'), L('Nowe zgłoszenie', 'New report'));
  const list = el('div', { class: 'bug-list' });
  const pager = el('div', { class: 'pager' });
  box.replaceChildren(el('div', { class: 'bug-bar' }, q, status, add), list, pager);

  // answers can come back out of order (typing, then a status): only the newest one is shown
  let loads = 0;
  async function load(p) {
    const mine = ++loads;
    const res = await guard(() => api('GET', `/v1/bugs?${p}`));
    if (!res || mine !== loads) return;
    list.replaceChildren(...res.bugs.map((b) => el('a', { class: 'glass bug-row', href: `/zgloszenia/${b.id}` },
      statusChip(b.status),
      el('div', { class: 'grow' }, el('h4', { textContent: b.title }),
        el('p', { class: 'muted small', textContent: `#${b.id} · ${author(b.authorHandle)} · ${ago(b.createdAt)}${b.version ? ` · ${b.version}` : ''}` })),
      el('span', { class: 'count' }, icon('fa-regular fa-comment'), ` ${b.comments}`))));
    if (!res.bugs.length) list.append(el('div', { class: 'glass card muted', textContent: p.size ? L('Nic nie pasuje.', 'Nothing matches.') : L('Nie ma jeszcze zgłoszeń.', 'No reports yet.') }));
    const pages = Math.ceil(res.total / res.pageSize);
    pager.replaceChildren();
    if (pages > 1) {
      if (res.page > 0) pager.append(el('button', { onclick: () => go(res.page - 1) }, icon('fa-solid fa-chevron-left'), L('Nowsze', 'Newer')));
      pager.append(el('span', { class: 'muted small', textContent: `${res.page + 1} / ${pages}` }));
      if (res.page + 1 < pages) pager.append(el('button', { onclick: () => go(res.page + 1) }, L('Starsze', 'Older'), icon('fa-solid fa-chevron-right')));
    }
  }
  load(new URLSearchParams([...params].filter(([k]) => ['q', 'status', 'page'].includes(k))));
}

// ---------- a new report ----------

function renderNew() {
  const box = $('#bugs');
  const back = el('a', { href: '/zgloszenia' }, icon('fa-solid fa-arrow-left'), L(' Wszystkie zgłoszenia', ' All reports'));
  if (!me) return box.replaceChildren(back, el('br'), el('br'), signInHint(L('zgłosić błąd', 'report a bug')));
  const title = el('input', { type: 'text', maxLength: 120, placeholder: L('Krótko: co nie działa? (np. „Gra wyłącza się po wejściu na serwer”)', 'In short: what does not work? (e.g. "The game closes after joining a server")'), required: true });
  const body = el('textarea', { maxLength: 8000, required: true,
    placeholder: L('Co robiłeś, co się stało, a co powinno się stać? Czy dzieje się to za każdym razem?', 'What were you doing, what happened, and what should have happened? Does it happen every time?') });
  const log = el('input', { type: 'text', maxLength: 80, placeholder: L('Link do logu (opcjonalnie), np. client.slash3rss.dev/logi/…', 'Link to a log (optional), e.g. client.slash3rss.dev/logs/…'), value: params.get('log') ? `${location.origin}/logi/${params.get('log')}` : '' });
  const version = el('input', { type: 'text', maxLength: 40, placeholder: L('Wersja launchera (opcjonalnie)', 'Launcher version (optional)'), value: params.get('wersja') ?? '' });
  const send = el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-paper-plane'), L('Wyślij zgłoszenie', 'Send the report'));
  const form = el('form', { class: 'glass card bug-form', onsubmit: async (e) => {
    e.preventDefault();
    const logId = /([A-Za-z0-9]{10})\/?$/.exec(log.value.trim())?.[1] ?? '';
    if (log.value.trim() && !logId) return toast(L('To nie wygląda na link do logu SlashClient.', 'This does not look like a link to a SlashClient log.'), true);
    send.disabled = true;
    const res = await guard(() => api('POST', '/v1/bugs', { title: title.value, body: body.value, logId, version: version.value, os: navigator.platform }));
    send.disabled = false;
    if (res) go(`/zgloszenia/${res.bug.id}`);
  } }, el('h3', { textContent: L('Nowe zgłoszenie', 'New report') }), title, body, el('div', { class: 'row' }, log, version), el('div', { class: 'row' }, send));
  box.replaceChildren(back, el('br'), el('br'), form);
  title.focus();
}

// ---------- one report ----------

async function renderBug() {
  const box = $('#bugs');
  const back = el('a', { href: '/zgloszenia' }, icon('fa-solid fa-arrow-left'), L(' Wszystkie zgłoszenia', ' All reports'));
  let res;
  try {
    res = await api('GET', `/v1/bugs/${bugId}`);
  } catch (err) {
    return box.replaceChildren(back, el('br'), el('br'), el('div', { class: 'glass card muted', textContent: err.code === 'not_found' ? L('Nie ma takiego zgłoszenia.', 'There is no such report.') : L('Nie udało się wczytać zgłoszenia.', 'Could not load the report.') }));
  }
  const { bug } = res;
  document.title = `#${bug.id} ${bug.title} – SlashClient`;
  const facts = el('div', { class: 'bug-facts' },
    el('span', { class: 'chip' }, icon('fa-regular fa-user'), author(bug.authorHandle)),
    el('span', { class: 'chip', title: fmtDate(bug.createdAt) }, icon('fa-regular fa-clock'), ago(bug.createdAt)),
    bug.version ? el('span', { class: 'chip' }, icon('fa-solid fa-code-branch'), bug.version) : '',
    bug.os ? el('span', { class: 'chip' }, icon('fa-solid fa-desktop'), bug.os) : '',
    bug.logId ? el('a', { class: 'chip blue', href: `/logi/${bug.logId}` }, icon('fa-solid fa-file-lines'), 'Log') : '');
  const head = el('div', { class: 'bug-head' }, el('h3', { textContent: bug.title }), statusChip(bug.status));
  const card = el('div', { class: 'glass card' }, head, el('span', { class: 'muted small', textContent: `#${bug.id}` }), el('p', { class: 'bug-body', textContent: bug.body }), facts);
  if (res.canModerate) {
    const pick = el('select', {}, ...Object.entries(STATUS).map(([k, [name]]) => el('option', { value: k, textContent: name, selected: k === bug.status })));
    pick.addEventListener('change', async () => {
      if (await guard(() => api('PATCH', `/v1/bugs/${bug.id}`, { status: pick.value }))) {
        toast(L('Zmieniono status', 'Status changed'));
        renderBug();
      }
    });
    const remove = el('button', { class: 'danger', onclick: async () => {
      if (!await confirmModal({ title: L('Usunąć to zgłoszenie?', 'Delete this report?'), text: L('Razem z komentarzami.', 'Together with its comments.'), ok: L('Usuń', 'Delete'), okIcon: 'fa-solid fa-trash', danger: true })) return;
      if (await guard(() => api('DELETE', `/v1/bugs/${bug.id}`))) go('/zgloszenia');
    } }, icon('fa-solid fa-trash'), L('Usuń', 'Delete'));
    card.append(el('div', { class: 'row', style: 'margin-top:14px' }, el('span', { class: 'muted small', textContent: 'Status:' }), pick, remove));
  }

  const comments = el('div', { class: 'comments' }, ...res.comments.map((c) => {
    const { staff } = c;
    const del = me && (res.canModerate || c.author === me.id) ? el('button', { class: 'chip', title: L('Usuń komentarz', 'Delete the comment'), onclick: async () => {
      if (await confirmModal({ title: L('Usunąć komentarz?', 'Delete the comment?'), ok: L('Usuń', 'Delete'), danger: true }) && await guard(() => api('DELETE', `/v1/bugs/${bug.id}/comments/${c.id}`))) renderBug();
    } }, icon('fa-solid fa-xmark')) : '';
    return el('div', { class: `glass comment${staff ? ' staff' : ''}` },
      el('div', { class: 'who' }, el('b', { textContent: author(c.authorHandle) }), staff ? el('span', { class: 'chip blue', textContent: L('Zespół', 'Team') }) : '',
        el('span', { class: 'muted small', title: fmtDate(c.createdAt), textContent: ago(c.createdAt) }), el('span', { class: 'push' }), del),
      el('p', { textContent: c.body }));
  }));
  let reply;
  if (me) {
    const text = el('textarea', { maxLength: 4000, placeholder: L('Odpowiedz…', 'Reply…'), style: 'min-height:90px' });
    reply = el('form', { class: 'glass card bug-form', style: 'margin-top:10px', onsubmit: async (e) => {
      e.preventDefault();
      if (!text.value.trim()) return;
      if (await guard(() => api('POST', `/v1/bugs/${bug.id}/comments`, { body: text.value }))) renderBug();
    } }, text, el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-reply'), L('Odpowiedz', 'Reply'))));
  } else reply = el('div', { style: 'margin-top:10px' }, signInHint(L('odpowiedzieć', 'reply')));
  box.replaceChildren(back, el('br'), el('br'), card,
    el('h4', { style: 'margin-top:22px', textContent: res.comments.length ? L(`Odpowiedzi (${res.comments.length})`, `Replies (${res.comments.length})`) : L('Brak odpowiedzi', 'No replies') }), comments, reply);
}

me = token.get() ? await api('GET', '/v1/me').catch(() => undefined) : undefined;
renderNav();
if (bugId) renderBug();
else if (params.get('nowe')) renderNew();
else renderList();
