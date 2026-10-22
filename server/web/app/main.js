// SlashClient on the phone: friends, chats, groups and clans, communities, invitations,
// achievements and notifications, on the same account and server as the launcher. Installed
// from the browser to the home screen (manifest.webmanifest, sw.js); the hash in the address says
// which screen is open (#/friends, #/chat/<friend>, #/group/<id>, #/community/<id>/<channel>…).

import { api, ApiError, Live, token, whenSignedOut } from './api.js';
import { closeChat, current as currentChat, onEvent as chatEvent, openChat, setSubtitle } from './chat.js';
import { groupsChanged, keysChanged, startKeys } from './e2e.js';
import { lang, setLang, t } from './i18n.js';
import * as push from './notify.js';
import { $, ago, avatarEl, badge, el, errorText, guard, icon, sheet, toast } from './ui.js';

const S = {
  me: undefined,
  health: { providers: [], dev: false },
  friends: [], incoming: [], outgoing: [],
  groups: [],
  clan: null, clanInvites: [],
  communities: [], communityInvites: [], communityRequests: [],
  achievements: undefined,
  connected: false,
  pushInfo: { enabled: false },
};
let live;
let installPrompt;

// ---------- what this phone remembers ----------

const pref = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode
  }
};
// ---------- statuses ----------

const STATUS = 'slashclient.app.status';
const myStatus = () => pref(STATUS, 'online');
const presence = () => ({ status: myStatus() });
const dotOf = (p) => (p.status === 'offline' ? 'offline' : p.activity && p.activity.kind !== 'launcher' ? 'ingame' : p.status);

function statusLine(p) {
  if (p.status === 'offline') return p.lastSeen ? t('Offline · {0}', ago(p.lastSeen)) : t('Offline');
  const a = p.activity;
  const version = a?.version ? `Minecraft ${a.version}` : 'Minecraft';
  if (a?.kind === 'server' && a.server && a.detail) return t('Gra na {0} · {1}', a.serverName || a.server, a.detail);
  if (a?.kind === 'server') return a.server ? t('{0} · na {1}', version, a.server) : t('{0} · na serwerze', version);
  if (a?.kind === 'singleplayer') return t('{0} · gra jednoosobowa', version);
  if (a?.kind === 'menu') return t('{0} · w menu', version);
  return { online: t('Dostępny'), away: t('Zaraz wracam'), busy: t('Nie przeszkadzać') }[p.status] ?? '';
}

// ---------- the session ----------

async function boot() {
  document.documentElement.lang = lang();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch((err) => console.error('sw:', err));
  // a tap on a notification while the app is open: the service worker says where to go
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && typeof e.data.url === 'string') location.hash = new URL(e.data.url, location.href).hash || '#/friends';
  });
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    renderInstallHint();
  });
  addEventListener('hashchange', route);
  whenSignedOut(() => signedOut());
  S.health = await api('GET', '/v1/health').catch(() => S.health);
  if (!token.get()) return renderLogin();
  await startSession();
}

async function startSession() {
  try {
    S.me = await api('GET', '/v1/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return renderLogin();
    // no connection: the shell shows, and it tries again when the phone is back online
    renderShell();
    $('#view').replaceChildren(el('div', { class: 'empty-state' }, icon('fa-solid fa-wifi'), el('p', { textContent: errorText(err) }),
      el('button', { class: 'btn', onclick: () => location.reload() }, t('Spróbuj ponownie'))));
    return;
  }
  renderShell();
  await startKeys(S.me.id);
  live = new Live({ presence, onEvent, onState: (c) => {
    S.connected = c;
    $('#offline')?.classList.toggle('hidden', c);
  } });
  live.start();
  await Promise.all([loadFriends(), loadGroups(), loadClan(), loadCommunities()]);
  S.pushInfo = await push.serverInfo();
  void push.refresh().catch((err) => console.error('powiadomienia:', err));
  route();
}

function signedOut() {
  live?.stop();
  live = undefined;
  S.me = undefined;
  closeChat();
  renderLogin();
}

async function signOut() {
  await push.forget();
  await api('POST', '/v1/auth/logout').catch(() => {});
  token.set('');
  signedOut();
}

// ---------- signing in (the same ways as the website's account page) ----------

const PROVIDERS = {
  discord: ['Discord', 'fa-brands fa-discord'],
  microsoft: ['Microsoft', 'fa-brands fa-microsoft'],
  google: ['Google', 'fa-brands fa-google'],
  github: ['GitHub', 'fa-brands fa-github'],
};

function renderLogin() {
  document.body.classList.remove('signed-in');
  const list = el('div', { class: 'stack' });
  for (const p of S.health.providers ?? []) {
    const [name, cls] = PROVIDERS[p] ?? [p, 'fa-solid fa-key'];
    list.append(el('button', { class: 'btn wide provider', onclick: () => void login(() => signInWith(p)) }, icon(cls), t('Zaloguj przez {0}', name)));
  }
  if (S.health.dev) {
    const input = el('input', { type: 'text', placeholder: t('Nick (logowanie testowe)'), maxLength: 16, autocomplete: 'username', 'aria-label': t('Nick') });
    list.append(el('form', { class: 'row', onsubmit: (e) => {
      e.preventDefault();
      void login(async () => {
        const res = await api('POST', '/v1/auth/dev', { name: input.value.trim() });
        token.set(res.token);
      });
    } }, input, el('button', { class: 'btn', type: 'submit' }, icon('fa-solid fa-flask'), t('Wejdź'))));
  }
  if (!S.health.providers?.length && !S.health.dev) list.append(el('p', { class: 'muted', textContent: t('Logowanie nie jest jeszcze skonfigurowane na tym serwerze.') }));
  document.body.replaceChildren(
    el('main', { class: 'login' },
      el('img', { class: 'logo', src: '/app/icon-192.png', alt: '' }),
      el('h1', { textContent: 'SlashClient' }),
      el('p', { class: 'muted', textContent: t('Znajomi, czaty, klany i społeczności z launchera – na telefonie.') }),
      list,
      el('p', { class: 'muted small', textContent: t('Konto SlashClient zakłada się w launcherze, razem z kontem Minecraft. Tutaj zalogujesz się sposobem, który do niego podpiąłeś (Znajomi → konto w launcherze).') }),
      langSwitch()),
    el('div', { id: 'toast', class: 'toast', role: 'status' }));
  renderInstallHint();
}

async function login(fn) {
  const ok = await guard(async () => {
    await fn();
    return true;
  });
  if (ok) await startSession();
}

/** A provider's page in a new window (on a phone: a browser tab over the app); the server is asked until it is done. */
async function signInWith(provider) {
  const popup = window.open('about:blank', '_blank');
  const { state, url, code } = await api('POST', `/v1/auth/${provider}/start`);
  if (popup) popup.location.href = url;
  else window.open(url, '_blank', 'noopener');
  const box = code ? loginCode(code, url) : undefined;
  try {
    const started = Date.now();
    while (Date.now() - started < 10 * 60_000) {
      await new Promise((r) => setTimeout(r, 1500));
      if (box?.cancelled) throw new ApiError('cancelled', 400);
      const res = await api('GET', `/v1/auth/poll?state=${encodeURIComponent(state)}`);
      if (res.pending) continue;
      token.set(res.token);
      popup?.close();
      return;
    }
    throw new ApiError('login_expired', 400);
  } finally {
    box?.remove();
  }
}

/** Microsoft: a code to type on its page. */
function loginCode(code, url) {
  const state = { cancelled: false };
  const node = el('div', { class: 'sheet-back' }, el('div', { class: 'sheet' },
    el('h2', { textContent: t('Wpisz kod u Microsoftu') }),
    el('p', { class: 'muted' }, t('Otwórz stronę i wpisz kod:'), ' ', el('a', { href: url, target: '_blank', rel: 'noopener', textContent: url.replace(/^https:\/\/(www\.)?/, '') })),
    el('div', { class: 'code', textContent: code }),
    el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: () => navigator.clipboard?.writeText(code).then(() => toast(t('Skopiowano kod'))) }, icon('fa-regular fa-copy'), t('Kopiuj kod')),
      el('button', { class: 'btn ghost', onclick: () => {
        state.cancelled = true;
      } }, t('Anuluj'))),
    el('p', { class: 'muted small', textContent: t('Czekam na zalogowanie…') })));
  document.body.append(node);
  return Object.assign(state, { remove: () => node.remove() });
}

// ---------- the shell: tabs at the bottom, the screen above ----------

const TABS = [
  ['friends', 'fa-solid fa-user-group', 'Znajomi'],
  ['chats', 'fa-solid fa-comments', 'Czaty'],
  ['communities', 'fa-solid fa-users', 'Społeczności'],
  ['invites', 'fa-solid fa-envelope-open-text', 'Zaproszenia'],
  ['me', 'fa-solid fa-circle-user', 'Ja'],
];

function renderShell() {
  document.body.classList.add('signed-in');
  document.body.replaceChildren(
    el('div', { id: 'install' }),
    el('div', { id: 'offline', class: 'offline-bar hidden', role: 'status' }, icon('fa-solid fa-plug-circle-xmark'), ' ', t('Łączenie z serwerem…')),
    el('main', { id: 'view' }),
    el('nav', { class: 'tabs', 'aria-label': t('Zakładki') }, ...TABS.map(([id, cls, label]) => el('a', { href: `#/${id}`, class: 'tab', dataset: { tab: id } },
      el('span', { class: 'tab-icon' }, icon(cls), el('span', { class: 'tab-badge' })), el('span', { class: 'tab-label', textContent: t(label) })))),
    el('div', { id: 'toast', class: 'toast', role: 'status' }));
  renderInstallHint();
}

function route() {
  if (!S.me) return;
  const [, screen = 'friends', a, b] = location.hash.split('/');
  const tab = { chat: 'friends', group: 'chats', community: 'communities' }[screen] ?? screen;
  for (const node of document.querySelectorAll('.tab')) node.classList.toggle('active', node.dataset.tab === tab);
  document.body.classList.toggle('in-chat', ['chat', 'group', 'community'].includes(screen));
  if (screen !== 'chat' && screen !== 'group' && screen !== 'community') closeChat();
  const view = $('#view');
  if (screen === 'chat') return openFriendChat(view, a);
  if (screen === 'group') return openGroupChat(view, a);
  if (screen === 'community') return openCommunityChat(view, a, b);
  ({ friends: renderFriends, chats: renderChats, communities: renderCommunities, invites: renderInvites, me: renderMe }[screen] ?? renderFriends)(view);
  updateBadges();
}
const rerender = () => {
  if (!currentChat()) route();
  else updateBadges();
};

function updateBadges() {
  const counts = {
    friends: S.friends.reduce((n, f) => n + (f.muted ? 0 : f.unread), 0),
    chats: S.groups.reduce((n, g) => n + g.unread, 0),
    communities: S.communities.reduce((n, c) => n + (c.mentions || 0), 0),
    invites: S.incoming.length + S.clanInvites.length + S.communityInvites.length,
  };
  for (const node of document.querySelectorAll('.tab')) {
    const n = counts[node.dataset.tab] ?? 0;
    const b = node.querySelector('.tab-badge');
    b.textContent = n > 99 ? '99+' : n ? String(n) : '';
    b.classList.toggle('on', n > 0);
  }
  // the number on the app's icon (Android, iOS 16.4+ installed)
  const total = counts.friends + counts.chats + counts.communities + counts.invites;
  if ('setAppBadge' in navigator) (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {});
}

const header = (title, ...actions) => el('header', { class: 'top' }, el('h1', { textContent: title }), el('div', { class: 'row' }, ...actions));

// ---------- data ----------

async function loadFriends() {
  const res = await api('GET', '/v1/friends').catch(() => undefined);
  if (!res) return;
  S.friends = res.friends;
  S.incoming = res.incoming;
  S.outgoing = res.outgoing;
}
async function loadGroups() {
  const res = await api('GET', '/v1/groups').catch(() => undefined);
  if (res) S.groups = res.groups;
}
async function loadClan() {
  const res = await api('GET', '/v1/clans/mine').catch(() => undefined);
  if (!res) return;
  S.clan = res.clan;
  S.clanInvites = res.invites ?? [];
}
async function loadCommunities() {
  const res = await api('GET', '/v1/communities/mine').catch(() => undefined);
  if (!res) return;
  S.communities = res.communities;
  S.communityInvites = res.invites ?? [];
  S.communityRequests = res.requests ?? [];
}

const friend = (id) => S.friends.find((f) => f.id === id);
const byActivity = (a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0);

// ---------- live events ----------

async function onEvent(e) {
  if (e.type === 'ready') {
    S.me = { ...S.me, ...e.me };
    // reconnected after a while away: anything may have changed
    await Promise.all([loadFriends(), loadGroups(), loadClan(), loadCommunities()]);
    return rerender();
  }
  const handled = await chatEvent(e);
  switch (e.type) {
    case 'presence': {
      const f = friend(e.id);
      if (!f) return;
      f.presence = e.presence;
      if (currentChat()?.kind === 'dm' && currentChat().id === e.id) setSubtitle(statusLine(f.presence));
      return rerender();
    }
    case 'message': {
      const m = e.message;
      const other = m.from === S.me.id ? m.to : m.from;
      const f = friend(other);
      if (!f) return;
      f.lastMessageAt = m.at;
      if (m.from !== S.me.id && !handled) f.unread++;
      return rerender();
    }
    case 'group-message': {
      const g = S.groups.find((x) => x.id === e.message.group);
      if (!g) return loadGroups().then(rerender);
      g.lastMessageAt = e.message.at;
      if (e.message.from !== S.me.id && !e.message.event && !handled) g.unread++;
      return rerender();
    }
    case 'community-message': {
      const m = e.message;
      const c = S.communities.find((x) => x.id === m.community);
      const ch = c?.channels.find((x) => x.id === m.channel);
      if (!ch || m.from === S.me.id || handled) return;
      ch.unread = (ch.unread ?? 0) + 1;
      c.unread = (c.unread ?? 0) + 1;
      if (m.mentions?.includes(S.me.id)) {
        ch.mentions = (ch.mentions ?? 0) + 1;
        c.mentions = (c.mentions ?? 0) + 1;
      }
      return rerender();
    }
    case 'friends':
      await loadFriends();
      if (e.request) toast(t('{0} zaprasza Cię do znajomych.', e.request.name));
      if (e.accepted) toast(t('{0} przyjmuje zaproszenie.', e.accepted.name));
      return rerender();
    case 'keys':
      return keysChanged(e.user);
    case 'groups':
      groupsChanged();
      await loadGroups();
      return rerender();
    case 'clan':
      await Promise.all([loadClan(), loadGroups()]);
      if (e.invite) toast(t('{0} zaprasza Cię do klanu [{1}]', e.invite.by?.name ?? '', e.invite.tag));
      return rerender();
    case 'communities':
    case 'community':
      await loadCommunities();
      if (e.invite) toast(t('{0} zaprasza Cię do społeczności {1}', e.invite.by?.name ?? '', e.invite.name));
      return rerender();
    case 'features':
      S.pushInfo = await push.serverInfo();
      return rerender();
    default:
  }
}

// ---------- Znajomi ----------

function renderFriends(view) {
  const list = [...S.friends].sort((a, b) => {
    const rank = (f) => ({ ingame: 0, online: 1, away: 2, busy: 2, offline: 3 })[dotOf(f.presence)] ?? 2;
    return (b.unread > 0) - (a.unread > 0) || rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  view.replaceChildren(
    header(t('Znajomi'), el('button', { class: 'icon-btn', 'aria-label': t('Dodaj znajomego'), onclick: addFriend }, icon('fa-solid fa-user-plus'))),
    S.incoming.length ? el('a', { class: 'banner', href: '#/invites' }, icon('fa-solid fa-envelope'), t('Zaproszenia do znajomych: {0}', S.incoming.length)) : '',
    list.length ? el('ul', { class: 'list' }, ...list.map((f) => el('li', {}, el('a', { class: 'item', href: `#/chat/${f.id}` },
      avatarEl(f, dotOf(f.presence)),
      el('div', { class: 'grow' },
        el('div', { class: 'name' }, f.clan ? el('span', { class: 'tag', textContent: `[${f.clan}]` }) : '', f.name, f.muted ? icon('fa-solid fa-bell-slash muted') : ''),
        el('div', { class: 'muted small ellipsis', textContent: statusLine(f.presence) })),
      badge(f.muted ? 0 : f.unread)))))
      : el('div', { class: 'empty-state' }, icon('fa-solid fa-user-group'), el('p', { textContent: t('Nie masz jeszcze znajomych. Dodaj kogoś po nicku.') }),
        el('button', { class: 'btn', onclick: addFriend }, icon('fa-solid fa-user-plus'), t('Dodaj znajomego'))));
}

async function addFriend() {
  const handle = await sheet(t('Dodaj znajomego'), (body, close) => {
    const input = el('input', { type: 'text', placeholder: t('Nick w SlashClient'), maxLength: 32, autocapitalize: 'off', autocomplete: 'off', 'aria-label': t('Nick') });
    body.append(el('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault();
      if (input.value.trim()) close(input.value.trim());
    } }, input, el('button', { class: 'btn wide', type: 'submit' }, icon('fa-solid fa-paper-plane'), t('Wyślij zaproszenie'))));
  });
  if (!handle) return;
  const res = await guard(() => api('POST', '/v1/friends/requests', { handle }));
  if (!res) return;
  S.friends = res.friends;
  S.incoming = res.incoming;
  S.outgoing = res.outgoing;
  toast(res.status === 'friends' ? t('Jesteście teraz znajomymi.') : t('Zaproszenie wysłane.'));
  rerender();
}

async function openFriendChat(view, id) {
  const f = friend(id);
  if (!f) {
    location.hash = '#/friends';
    return;
  }
  const people = new Map([[f.id, f], [S.me.id, S.me]]);
  await openChat(view, 'dm', id, undefined, {
    title: f.name, subtitle: statusLine(f.presence), avatar: avatarEl(f, dotOf(f.presence)), me: S.me.id, people,
    onBack: () => history.length > 1 ? history.back() : (location.hash = '#/friends'),
    onRead: () => {
      f.unread = 0;
      updateBadges();
    },
    typing: () => live?.send({ type: 'typing', to: id }),
  });
}

// ---------- Czaty: groups and the clan ----------

function renderChats(view) {
  const groups = [...S.groups].sort((a, b) => (b.clan ? 1 : 0) - (a.clan ? 1 : 0) || byActivity(a, b));
  view.replaceChildren(
    header(t('Czaty'), el('button', { class: 'icon-btn', 'aria-label': t('Nowa grupa'), onclick: newGroup }, icon('fa-solid fa-plus'))),
    S.clan ? clanCard() : '',
    groups.length ? el('ul', { class: 'list' }, ...groups.map((g) => el('li', {}, el('a', { class: 'item', href: `#/group/${g.id}` },
      groupIcon(g),
      el('div', { class: 'grow' },
        el('div', { class: 'name', textContent: g.name }),
        el('div', { class: 'muted small ellipsis', textContent: g.members.map((m) => m.name).join(', ') })),
      badge(g.unread)))))
      : el('div', { class: 'empty-state' }, icon('fa-solid fa-comments'), el('p', { textContent: t('Nie masz jeszcze czatów grupowych.') }),
        el('button', { class: 'btn', onclick: newGroup }, icon('fa-solid fa-plus'), t('Nowa grupa'))));
}

function groupIcon(g) {
  if (g.clan?.logo !== undefined) return el('span', { class: 'avatar square' }, el('img', { src: `/v1/clans/${g.clan.id}/logo.png?v=${g.clan.logo}`, alt: '' }));
  return el('span', { class: `avatar square${g.clan ? ' clan' : ''}` }, icon(g.clan ? 'fa-solid fa-shield-halved' : 'fa-solid fa-user-group'));
}

function clanCard() {
  const c = S.clan;
  const online = c.members.filter((m) => m.online).length;
  const mayInvite = c.role === 'owner' || c.role === 'officer';
  return el('section', { class: 'card clan-card' },
    el('div', { class: 'row' },
      el('span', { class: 'tag big', textContent: `[${c.tag}]` }),
      el('div', { class: 'grow' }, el('b', { textContent: c.name }), el('div', { class: 'muted small', textContent: t('{0} członków · {1} online', c.members.length, online) })),
      mayInvite ? el('button', { class: 'icon-btn', 'aria-label': t('Zaproś do klanu'), onclick: inviteToClan }, icon('fa-solid fa-user-plus')) : ''),
    el('div', { class: 'members' }, ...c.members.map((m) => el('span', { class: 'member', title: m.name }, avatarEl(m, m.status === 'offline' ? 'offline' : m.status), el('span', { class: 'small ellipsis', textContent: m.name })))));
}

async function inviteToClan() {
  const handle = await sheet(t('Zaproś do klanu'), (body, close) => {
    const input = el('input', { type: 'text', placeholder: t('Nick w SlashClient'), maxLength: 32, autocapitalize: 'off', 'aria-label': t('Nick') });
    body.append(el('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault();
      if (input.value.trim()) close(input.value.trim());
    } }, input, el('button', { class: 'btn wide', type: 'submit' }, t('Zaproś'))));
  });
  if (!handle) return;
  if (await guard(() => api('POST', '/v1/clans/invites', { handle }))) toast(t('Zaproszenie wysłane.'));
}

async function newGroup() {
  if (!S.friends.length) return toast(t('Najpierw dodaj znajomych.'), true);
  const picked = await sheet(t('Nowa grupa'), (body, close) => {
    const name = el('input', { type: 'text', placeholder: t('Nazwa grupy'), maxLength: 32, 'aria-label': t('Nazwa grupy') });
    const boxes = S.friends.map((f) => el('input', { type: 'checkbox', value: f.id }));
    body.append(el('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault();
      const members = boxes.filter((b) => b.checked).map((b) => b.value);
      if (!name.value.trim() || !members.length) return toast(t('Podaj nazwę i wybierz znajomych.'), true);
      close({ name: name.value.trim(), members });
    } }, name,
    el('div', { class: 'pick' }, ...S.friends.map((f, i) => el('label', { class: 'item' }, boxes[i], avatarEl(f), el('span', { class: 'grow', textContent: f.name })))),
    el('button', { class: 'btn wide', type: 'submit' }, t('Utwórz grupę'))));
  });
  if (!picked) return;
  const res = await guard(() => api('POST', '/v1/groups', picked));
  if (!res) return;
  await loadGroups();
  location.hash = `#/group/${res.group.id}`;
}

async function openGroupChat(view, id) {
  let g = S.groups.find((x) => x.id === id);
  if (!g) {
    await loadGroups();
    g = S.groups.find((x) => x.id === id);
  }
  if (!g) {
    location.hash = '#/chats';
    return;
  }
  const people = new Map(g.members.map((m) => [m.id, m]));
  const leave = !g.clan ? el('button', { class: 'icon-btn', 'aria-label': t('Opuść grupę'), onclick: async () => {
    if (!confirm(t('Opuścić grupę „{0}”?', g.name))) return;
    if (await guard(() => api('POST', `/v1/groups/${id}/leave`))) {
      await loadGroups();
      location.hash = '#/chats';
    }
  } }, icon('fa-solid fa-right-from-bracket')) : '';
  await openChat(view, 'group', id, undefined, {
    title: g.name, subtitle: t('{0} osób · szyfrowane', g.members.length), avatar: groupIcon(g), me: S.me.id, people, actions: [leave],
    onBack: () => (location.hash = '#/chats'),
    onRead: () => {
      g.unread = 0;
      updateBadges();
    },
  });
}

// ---------- Społeczności ----------

function renderCommunities(view) {
  const list = [...S.communities].sort(byActivity);
  view.replaceChildren(
    header(t('Społeczności')),
    list.length ? el('div', { class: 'stack' }, ...list.map((c) => el('section', { class: 'card' },
      el('div', { class: 'row' },
        c.logo !== undefined ? el('span', { class: 'avatar square' }, el('img', { src: `/v1/communities/${c.id}/logo.png?v=${c.logo}`, alt: '' })) : el('span', { class: 'avatar square' }, icon('fa-solid fa-users')),
        el('div', { class: 'grow' }, el('b', { textContent: c.name }), el('div', { class: 'muted small', textContent: t('{0} członków', c.members) }))),
      el('ul', { class: 'channels' }, ...c.channels.map((ch) => el('li', {}, el('a', { class: 'channel', href: `#/community/${c.id}/${ch.id}` },
        icon(ch.kind === 'announcements' ? 'fa-solid fa-bullhorn' : 'fa-solid fa-hashtag'),
        el('span', { class: 'grow', textContent: ch.name }),
        ch.mentions ? el('span', { class: 'badge mention', textContent: `@${ch.mentions}` }) : badge(ch.unread))))))))
      : el('div', { class: 'empty-state' }, icon('fa-solid fa-users'), el('p', { textContent: t('Nie należysz jeszcze do żadnej społeczności. Dołączysz do nich w launcherze albo z zaproszenia.') })));
}

async function openCommunityChat(view, id, channel) {
  const c = S.communities.find((x) => x.id === id);
  const ch = c?.channels.find((x) => x.id === channel);
  if (!ch) {
    location.hash = '#/communities';
    return;
  }
  await openChat(view, 'community', id, channel, {
    title: `#${ch.name}`, subtitle: c.name, me: S.me.id,
    onBack: () => (location.hash = '#/communities'),
    onRead: () => {
      c.mentions = Math.max(0, (c.mentions ?? 0) - (ch.mentions ?? 0));
      c.unread = Math.max(0, (c.unread ?? 0) - (ch.unread ?? 0));
      ch.unread = 0;
      ch.mentions = 0;
      updateBadges();
    },
  });
}

// ---------- Zaproszenia ----------

function renderInvites(view) {
  const sections = [];
  const act = (fn, reload) => async () => {
    if (await guard(fn)) {
      await reload();
      rerender();
    }
  };
  if (S.incoming.length) sections.push(el('h2', { textContent: t('Do znajomych') }), el('ul', { class: 'list' }, ...S.incoming.map((p) => el('li', { class: 'item' },
    avatarEl(p), el('div', { class: 'grow' }, el('div', { class: 'name', textContent: p.name }), el('div', { class: 'muted small', textContent: `@${p.handle}` })),
    el('button', { class: 'btn small', onclick: act(() => api('POST', `/v1/friends/requests/${p.id}/accept`), loadFriends) }, icon('fa-solid fa-check'), t('Przyjmij')),
    el('button', { class: 'icon-btn', 'aria-label': t('Odrzuć'), onclick: act(() => api('DELETE', `/v1/friends/requests/${p.id}`), loadFriends) }, icon('fa-solid fa-xmark'))))));
  if (S.clanInvites.length) sections.push(el('h2', { textContent: t('Do klanu') }), el('ul', { class: 'list' }, ...S.clanInvites.map((i) => el('li', { class: 'item' },
    el('span', { class: 'tag big', textContent: `[${i.clan.tag}]` }),
    el('div', { class: 'grow' }, el('div', { class: 'name', textContent: i.clan.name }), el('div', { class: 'muted small', textContent: t('od {0} · {1} członków', i.by.name, i.clan.members) })),
    el('button', { class: 'btn small', onclick: act(() => api('POST', `/v1/clans/${i.clan.id}/accept`), async () => Promise.all([loadClan(), loadGroups()])) }, icon('fa-solid fa-check'), t('Dołącz')),
    el('button', { class: 'icon-btn', 'aria-label': t('Odrzuć'), onclick: act(() => api('POST', `/v1/clans/${i.clan.id}/decline`), loadClan) }, icon('fa-solid fa-xmark'))))));
  if (S.communityInvites.length) sections.push(el('h2', { textContent: t('Do społeczności') }), el('ul', { class: 'list' }, ...S.communityInvites.map((i) => el('li', { class: 'item' },
    el('span', { class: 'avatar square' }, icon('fa-solid fa-users')),
    el('div', { class: 'grow' }, el('div', { class: 'name', textContent: i.community.name }), el('div', { class: 'muted small', textContent: t('od {0} · {1} członków', i.by.name, i.community.members) })),
    el('button', { class: 'btn small', onclick: act(() => api('POST', `/v1/communities/${i.community.id}/invites/accept`), loadCommunities) }, icon('fa-solid fa-check'), t('Dołącz')),
    el('button', { class: 'icon-btn', 'aria-label': t('Odrzuć'), onclick: act(() => api('POST', `/v1/communities/${i.community.id}/invites/decline`), loadCommunities) }, icon('fa-solid fa-xmark'))))));
  if (S.outgoing.length) sections.push(el('h2', { textContent: t('Wysłane') }), el('ul', { class: 'list' }, ...S.outgoing.map((p) => el('li', { class: 'item' },
    avatarEl(p), el('div', { class: 'grow' }, el('div', { class: 'name', textContent: p.name }), el('div', { class: 'muted small', textContent: t('czeka na odpowiedź') })),
    el('button', { class: 'btn small ghost', onclick: act(() => api('DELETE', `/v1/friends/requests/${p.id}`), loadFriends) }, t('Anuluj'))))));
  if (S.communityRequests.length) sections.push(el('h2', { textContent: t('Prośby o dołączenie') }), el('ul', { class: 'list' }, ...S.communityRequests.map((r) => el('li', { class: 'item' },
    el('span', { class: 'avatar square' }, icon('fa-solid fa-users')), el('div', { class: 'grow' }, el('div', { class: 'name', textContent: r.community.name }), el('div', { class: 'muted small', textContent: t('czeka na odpowiedź') })),
    el('button', { class: 'btn small ghost', onclick: act(() => api('DELETE', `/v1/communities/${r.community.id}/requests/mine`), loadCommunities) }, t('Anuluj'))))));
  view.replaceChildren(
    header(t('Zaproszenia'), el('button', { class: 'icon-btn', 'aria-label': t('Dodaj znajomego'), onclick: addFriend }, icon('fa-solid fa-user-plus'))),
    ...(sections.length ? sections : [el('div', { class: 'empty-state' }, icon('fa-solid fa-envelope-open'), el('p', { textContent: t('Brak zaproszeń.') }),
      el('button', { class: 'btn', onclick: addFriend }, icon('fa-solid fa-user-plus'), t('Dodaj znajomego')))]));
}

// ---------- Ja: account, status, achievements, notifications, look ----------

function renderMe(view) {
  const statuses = [['online', 'Dostępny'], ['away', 'Zaraz wracam'], ['busy', 'Nie przeszkadzać'], ['invisible', 'Niewidoczny']];
  const statusSel = el('select', { 'aria-label': t('Status'), onchange: () => {
    save(STATUS, statusSel.value);
    live?.send({ type: 'presence', presence: presence() });
  } }, ...statuses.map(([v, l]) => el('option', { value: v, textContent: t(l), selected: myStatus() === v })));
  const achievements = el('section', { class: 'card' }, el('h2', { textContent: t('Osiągnięcia') }), el('p', { class: 'muted small', textContent: t('Wczytywanie…') }));
  const notifications = el('section', { class: 'card', id: 'notifications' });
  view.replaceChildren(
    header(t('Ja')),
    el('section', { class: 'card row' }, avatarEl(S.me), el('div', { class: 'grow' }, el('b', { textContent: S.me.name }), el('div', { class: 'muted small', textContent: `@${S.me.handle}` })),
      el('button', { class: 'btn small ghost', onclick: () => void signOut() }, icon('fa-solid fa-right-from-bracket'), t('Wyloguj'))),
    el('section', { class: 'card stack' },
      el('label', { class: 'field' }, el('span', { textContent: t('Status dla znajomych') }), statusSel),
      el('div', { class: 'field' }, el('span', { textContent: t('Język') }), langSwitch())),
    notifications,
    achievements);
  void renderNotifications(notifications);
  void renderAchievements(achievements);
}


const KIND_NAMES = { dm: 'Wiadomości od znajomych', group: 'Czaty grupowe', clan: 'Czat klanu', mention: 'Wzmianki w społecznościach', invite: 'Zaproszenia' };

async function renderNotifications(box) {
  const title = el('h2', { textContent: t('Powiadomienia') });
  if (!S.pushInfo.enabled) return box.replaceChildren(title, el('p', { class: 'muted small', textContent: t('Powiadomienia są wyłączone na serwerze.') }));
  if (!push.supported()) {
    // iOS gives notifications only to apps added to the home screen
    const text = push.isIos() && !push.standalone()
      ? t('Na iPhonie powiadomienia działają po dodaniu aplikacji do ekranu początkowego: Udostępnij → Do ekranu początkowego (iOS 16.4 lub nowszy).')
      : t('Ta przeglądarka nie obsługuje powiadomień.');
    return box.replaceChildren(title, el('p', { class: 'muted small', textContent: text }));
  }
  const on = await push.active();
  const state = push.permission();
  const body = [title];
  if (state === 'denied') body.push(el('p', { class: 'muted small', textContent: t('Powiadomienia są zablokowane w ustawieniach przeglądarki lub telefonu. Zezwól na nie tam i wróć tutaj.') }));
  else if (!on) {
    body.push(el('p', { class: 'muted small', textContent: t('Dostaniesz powiadomienie o nowej wiadomości, wzmiance lub zaproszeniu, także gdy aplikacja jest zamknięta. Treść szyfrowanych wiadomości nigdy nie trafia do powiadomień.') }),
      el('button', { class: 'btn wide', onclick: async () => {
        try {
          await push.enable();
          toast(t('Powiadomienia włączone.'));
        } catch (err) {
          toast(err.code === 'denied' ? t('Nie zezwolono na powiadomienia.') : errorText(err), true);
        }
        void renderNotifications(box);
      } }, icon('fa-solid fa-bell'), t('Włącz powiadomienia')));
  } else {
    const prefs = push.prefs();
    body.push(...push.KINDS.map((k) => el('label', { class: 'switch-row' }, el('span', { class: 'grow', textContent: t(KIND_NAMES[k]) }),
      el('input', { type: 'checkbox', role: 'switch', checked: prefs[k], onchange: (e) => void guard(() => push.setPref(k, e.target.checked)) }))),
    el('div', { class: 'row' },
      el('button', { class: 'btn small', onclick: () => void guard(async () => {
        await api('POST', '/v1/push/test');
        toast(t('Wysłano powiadomienie testowe.'));
      }) }, icon('fa-solid fa-paper-plane'), t('Wyślij testowe')),
      el('button', { class: 'btn small ghost', onclick: async () => {
        await guard(() => push.disable());
        void renderNotifications(box);
      } }, icon('fa-solid fa-bell-slash'), t('Wyłącz na tym telefonie'))));
  }
  box.replaceChildren(...body);
}

async function renderAchievements(box) {
  const res = S.achievements ?? await api('GET', '/v1/achievements').catch(() => undefined);
  if (!res) return box.replaceChildren(el('h2', { textContent: t('Osiągnięcia') }), el('p', { class: 'muted small', textContent: t('Nie udało się wczytać osiągnięć.') }));
  S.achievements = res;
  const en = lang() === 'en';
  const done = res.achievements.filter((a) => a.unlockedAt);
  const next = res.achievements.filter((a) => !a.unlockedAt && !a.hidden).sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));
  const row = (a) => el('li', { class: `achievement${a.unlockedAt ? ' done' : ''}` },
    el('span', { class: 'ach-icon' }, icon(`fa-solid ${a.icon}`)),
    el('div', { class: 'grow' },
      el('div', { class: 'name', textContent: en ? a.nameEn : a.name }),
      el('div', { class: 'muted small', textContent: en ? a.descriptionEn : a.description }),
      !a.unlockedAt && a.progress !== undefined ? el('progress', { max: 1, value: a.progress }) : ''),
    el('span', { class: 'sparks', title: t('Iskry') }, `✦ ${a.sparks}`));
  box.replaceChildren(
    el('div', { class: 'row' }, el('h2', { class: 'grow', textContent: t('Osiągnięcia') }), el('span', { class: 'chip gold', title: t('Iskry') }, `✦ ${res.sparks.balance}`)),
    el('p', { class: 'muted small', textContent: t('Zdobyte: {0} z {1} · {2} godz. gry · seria {3} dni', done.length, res.achievements.length, res.stats.hours, res.stats.streak) }),
    el('ul', { class: 'achievements' }, ...next.slice(0, 6).map(row), ...done.sort((a, b) => b.unlockedAt - a.unlockedAt).map(row)));
}

function langSwitch() {
  return el('div', { class: 'seg', role: 'group', 'aria-label': t('Język') }, ...[['pl', 'Polski'], ['en', 'English']].map(([v, l]) => el('button', { type: 'button', class: lang() === v ? 'on' : '', 'aria-pressed': String(lang() === v), onclick: () => {
    setLang(v);
    document.documentElement.lang = v;
    if (S.me) {
      renderShell();
      route();
      void push.refresh();
    } else renderLogin();
  } }, l)));
}

// ---------- "Dodaj do ekranu głównego" ----------

const HINT = 'slashclient.app.installHint';
function renderInstallHint() {
  const box = $('#install') ?? (() => {
    const b = el('div', { id: 'install' });
    document.body.prepend(b);
    return b;
  })();
  if (push.standalone() || pref(HINT, '') === 'closed') return box.replaceChildren();
  const close = el('button', { class: 'icon-btn', 'aria-label': t('Zamknij'), onclick: () => {
    save(HINT, 'closed');
    box.replaceChildren();
  } }, icon('fa-solid fa-xmark'));
  if (installPrompt) {
    return box.replaceChildren(el('div', { class: 'install' }, icon('fa-solid fa-mobile-screen'), el('span', { class: 'grow', textContent: t('Zainstaluj SlashClient na telefonie.') }),
      el('button', { class: 'btn small', onclick: async () => {
        installPrompt.prompt();
        await installPrompt.userChoice.catch(() => {});
        installPrompt = undefined;
        box.replaceChildren();
      } }, t('Zainstaluj')), close));
  }
  if (push.isIos()) {
    return box.replaceChildren(el('div', { class: 'install' }, icon('fa-solid fa-arrow-up-from-bracket'),
      el('span', { class: 'grow', textContent: t('Dodaj aplikację do ekranu: Udostępnij → Do ekranu początkowego. Dopiero wtedy działają powiadomienia.') }), close));
  }
  box.replaceChildren();
}

void boot();
