// The bug tracker: the list (/zgloszenia), one report (/zgloszenia/<n>) and a new one (?nowe=1).
// Anyone can read; signed-in players write; admins change the status.
import { go } from '/router.js';
import { $, api, ago, el, fmtDate, guard, icon, toast, token } from './common.js';

const STATUS = {
  open: ['Otwarte', 'fa-regular fa-circle'],
  confirmed: ['Potwierdzone', 'fa-solid fa-circle-exclamation'],
  fixed: ['Naprawione', 'fa-solid fa-circle-check'],
  closed: ['Zamknięte', 'fa-solid fa-circle-xmark'],
  duplicate: ['Duplikat', 'fa-regular fa-clone'],
};
const statusChip = (s) => el('span', { class: `chip st-${s}` }, icon(STATUS[s]?.[1] ?? 'fa-regular fa-circle'), STATUS[s]?.[0] ?? s);
const author = (handle) => (handle ? `@${handle}` : 'usunięte konto');

let me;
const params = new URLSearchParams(location.search);
const bugId = Number(location.pathname.split('/')[2] ?? 0);

function renderNav() {
  $('#nav-account .label').textContent = me ? me.name : 'Zaloguj się';
  $('#nav-admin').classList.toggle('hidden', !me?.admin);
}

const signInHint = (what) => el('div', { class: 'glass card row' }, icon('fa-solid fa-right-to-bracket'),
  el('span', { class: 'grow' }, `Żeby ${what}, zaloguj się na `, el('a', { href: '/konto', textContent: 'stronie konta' }), '.'));

// ---------- the list ----------

async function renderList() {
  const box = $('#bugs');
  const q = el('input', { type: 'search', placeholder: 'Szukaj zgłoszeń…', value: params.get('q') ?? '' });
  const status = el('select', {}, el('option', { value: '', textContent: 'Wszystkie' }),
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
  const add = el('a', { class: 'btn primary', href: '/zgloszenia?nowe=1' }, icon('fa-solid fa-plus'), 'Nowe zgłoszenie');
  const list = el('div', { class: 'bug-list' });
  const pager = el('div', { class: 'pager' });
  box.replaceChildren(el('div', { class: 'bug-bar' }, q, status, add), list, pager);

  async function load(p) {
    const res = await guard(() => api('GET', `/v1/bugs?${p}`));
    if (!res) return;
    list.replaceChildren(...res.bugs.map((b) => el('a', { class: 'glass bug-row', href: `/zgloszenia/${b.id}` },
      statusChip(b.status),
      el('div', { class: 'grow' }, el('h4', { textContent: b.title }),
        el('p', { class: 'muted small', textContent: `#${b.id} · ${author(b.authorHandle)} · ${ago(b.createdAt)}${b.version ? ` · ${b.version}` : ''}` })),
      el('span', { class: 'count' }, icon('fa-regular fa-comment'), ` ${b.comments}`))));
    if (!res.bugs.length) list.append(el('div', { class: 'glass card muted', textContent: p.size ? 'Nic nie pasuje.' : 'Nie ma jeszcze zgłoszeń.' }));
    const pages = Math.ceil(res.total / res.pageSize);
    pager.replaceChildren();
    if (pages > 1) {
      if (res.page > 0) pager.append(el('button', { onclick: () => go(res.page - 1) }, icon('fa-solid fa-chevron-left'), 'Nowsze'));
      pager.append(el('span', { class: 'muted small', textContent: `${res.page + 1} / ${pages}` }));
      if (res.page + 1 < pages) pager.append(el('button', { onclick: () => go(res.page + 1) }, 'Starsze', icon('fa-solid fa-chevron-right')));
    }
  }
  load(new URLSearchParams([...params].filter(([k]) => ['q', 'status', 'page'].includes(k))));
}

// ---------- a new report ----------

function renderNew() {
  const box = $('#bugs');
  const back = el('a', { href: '/zgloszenia' }, icon('fa-solid fa-arrow-left'), ' Wszystkie zgłoszenia');
  if (!me) return box.replaceChildren(back, el('br'), el('br'), signInHint('zgłosić błąd'));
  const title = el('input', { type: 'text', maxLength: 120, placeholder: 'Krótko: co nie działa? (np. „Gra wyłącza się po wejściu na serwer”)', required: true });
  const body = el('textarea', { maxLength: 8000, required: true,
    placeholder: 'Co robiłeś, co się stało, a co powinno się stać? Czy dzieje się to za każdym razem?' });
  const log = el('input', { type: 'text', maxLength: 80, placeholder: 'Link do logu (opcjonalnie), np. client.slash3rss.dev/logi/…', value: params.get('log') ? `${location.origin}/logi/${params.get('log')}` : '' });
  const version = el('input', { type: 'text', maxLength: 40, placeholder: 'Wersja launchera (opcjonalnie)', value: params.get('wersja') ?? '' });
  const send = el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-paper-plane'), 'Wyślij zgłoszenie');
  const form = el('form', { class: 'glass card bug-form', onsubmit: async (e) => {
    e.preventDefault();
    const logId = /([A-Za-z0-9]{10})\/?$/.exec(log.value.trim())?.[1] ?? '';
    if (log.value.trim() && !logId) return toast('To nie wygląda na link do logu SlashClient.', true);
    send.disabled = true;
    const res = await guard(() => api('POST', '/v1/bugs', { title: title.value, body: body.value, logId, version: version.value, os: navigator.platform }));
    send.disabled = false;
    if (res) go(`/zgloszenia/${res.bug.id}`);
  } }, el('h3', { textContent: 'Nowe zgłoszenie' }), title, body, el('div', { class: 'row' }, log, version), el('div', { class: 'row' }, send));
  box.replaceChildren(back, el('br'), el('br'), form);
  title.focus();
}

// ---------- one report ----------

async function renderBug() {
  const box = $('#bugs');
  const back = el('a', { href: '/zgloszenia' }, icon('fa-solid fa-arrow-left'), ' Wszystkie zgłoszenia');
  let res;
  try {
    res = await api('GET', `/v1/bugs/${bugId}`);
  } catch (err) {
    return box.replaceChildren(back, el('br'), el('br'), el('div', { class: 'glass card muted', textContent: err.code === 'not_found' ? 'Nie ma takiego zgłoszenia.' : 'Nie udało się wczytać zgłoszenia.' }));
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
        toast('Zmieniono status');
        renderBug();
      }
    });
    const remove = el('button', { class: 'danger', onclick: async () => {
      if (!confirm('Usunąć to zgłoszenie razem z komentarzami?')) return;
      if (await guard(() => api('DELETE', `/v1/bugs/${bug.id}`))) go('/zgloszenia');
    } }, icon('fa-solid fa-trash'), 'Usuń');
    card.append(el('div', { class: 'row', style: 'margin-top:14px' }, el('span', { class: 'muted small', textContent: 'Status:' }), pick, remove));
  }

  const comments = el('div', { class: 'comments' }, ...res.comments.map((c) => {
    const { staff } = c;
    const del = me && (res.canModerate || c.author === me.id) ? el('button', { class: 'chip', title: 'Usuń komentarz', onclick: async () => {
      if (confirm('Usunąć komentarz?') && await guard(() => api('DELETE', `/v1/bugs/${bug.id}/comments/${c.id}`))) renderBug();
    } }, icon('fa-solid fa-xmark')) : '';
    return el('div', { class: `glass comment${staff ? ' staff' : ''}` },
      el('div', { class: 'who' }, el('b', { textContent: author(c.authorHandle) }), staff ? el('span', { class: 'chip blue', textContent: 'Zespół' }) : '',
        el('span', { class: 'muted small', title: fmtDate(c.createdAt), textContent: ago(c.createdAt) }), el('span', { class: 'push' }), del),
      el('p', { textContent: c.body }));
  }));
  let reply;
  if (me) {
    const text = el('textarea', { maxLength: 4000, placeholder: 'Odpowiedz…', style: 'min-height:90px' });
    reply = el('form', { class: 'glass card bug-form', style: 'margin-top:10px', onsubmit: async (e) => {
      e.preventDefault();
      if (!text.value.trim()) return;
      if (await guard(() => api('POST', `/v1/bugs/${bug.id}/comments`, { body: text.value }))) renderBug();
    } }, text, el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-reply'), 'Odpowiedz')));
  } else reply = el('div', { style: 'margin-top:10px' }, signInHint('odpowiedzieć'));
  box.replaceChildren(back, el('br'), el('br'), card,
    el('h4', { style: 'margin-top:22px', textContent: res.comments.length ? `Odpowiedzi (${res.comments.length})` : 'Brak odpowiedzi' }), comments, reply);
}

me = token.get() ? await api('GET', '/v1/me').catch(() => undefined) : undefined;
renderNav();
if (bugId) renderBug();
else if (params.get('nowe')) renderNew();
else renderList();
