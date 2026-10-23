// One conversation on the phone: a friend (end-to-end encrypted), a group or clan chat (encrypted
// for its members), or a community's channel (kept on the server as it is, like in the launcher).

import { api } from './api.js';
import { openDirect, openGroup, pictureUrl, sealDirect, sealGroup } from './e2e.js';
import { gifCard, gifConfig, openGifSheet, parseGif } from './gif.js';
import { t } from './i18n.js';
import { $, avatarEl, el, errorText, guard, icon, toast, when } from './ui.js';

let chat;

/** What the open conversation is, for the rest of the app (unread counts, notifications). */
export const current = () => chat && { kind: chat.kind, id: chat.id, channel: chat.channel };

const paths = {
  dm: (c) => `/v1/messages/${c.id}`,
  group: (c) => `/v1/groups/${c.id}/messages`,
  community: (c) => `/v1/communities/${c.id}/channels/${c.channel}/messages`,
};
const readPaths = {
  dm: (c) => `/v1/messages/${c.id}/read`,
  group: (c) => `/v1/groups/${c.id}/read`,
  community: (c) => `/v1/communities/${c.id}/channels/${c.channel}/read`,
};
const open = (m) => (chat.kind === 'dm' ? openDirect(m) : chat.kind === 'group' ? openGroup(m) : m);

/**
 * Opens a conversation in `root`. `info`: { title, subtitle, avatar, me, people (id → person),
 * canPost, onBack, send(live): typing }.
 */
export async function openChat(root, kind, id, channel, info) {
  const list = el('div', { class: 'messages', role: 'log', 'aria-live': 'polite' });
  const typing = el('div', { class: 'typing muted small' });
  const input = el('textarea', { rows: 1, placeholder: t('Napisz wiadomość…'), maxLength: 2000, 'aria-label': t('Wiadomość') });
  const sendBtn = el('button', { class: 'send', type: 'submit', 'aria-label': t('Wyślij') }, icon('fa-solid fa-paper-plane'));
  // GIFs and stickers (gif.js): shown when the server has a provider's key
  const gifBtn = el('button', { class: 'gif-btn hidden', type: 'button', 'aria-label': t('GIF-y i naklejki'), textContent: 'GIF', onclick: () => void openGifSheet((text) => post(text)) });
  void gifConfig().then((c) => gifBtn.classList.toggle('hidden', !c.enabled));
  const form = el('form', { class: 'composer', onsubmit: (e) => {
    e.preventDefault();
    void send();
  } }, gifBtn, input, sendBtn);
  const more = el('button', { class: 'more-btn hidden', onclick: () => void older() }, t('Wcześniejsze wiadomości'));
  const head = el('header', { class: 'chat-head' },
    el('button', { class: 'icon-btn', 'aria-label': t('Wstecz'), onclick: info.onBack }, icon('fa-solid fa-chevron-left')),
    info.avatar ?? '',
    el('div', { class: 'grow' }, el('h1', { textContent: info.title }), el('div', { class: 'muted small sub', textContent: info.subtitle ?? '' })),
    ...(info.actions ?? []));
  root.replaceChildren(el('div', { class: 'chat' }, head, el('div', { class: 'scroll' }, more, list, typing), form));

  chat = { kind, id, channel, info, messages: [], list, typing, input, more, form, head, editWindowMs: 0, typingTimer: 0, lastTyping: 0 };
  // Enter sends on a keyboard; on a phone the button does
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) {
      e.preventDefault();
      void send();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(140, input.scrollHeight)}px`;
    if (kind === 'dm' && Date.now() - chat.lastTyping > 3000) {
      chat.lastTyping = Date.now();
      info.typing?.();
    }
  });
  list.append(el('p', { class: 'muted center small', textContent: t('Wczytywanie…') }));
  const res = await guard(() => api('GET', `${paths[kind](chat)}?limit=40`));
  if (!res || chat?.list !== list) return;
  chat.editWindowMs = res.editWindowMs ?? 0;
  if (kind === 'community' && res.canPost === false) {
    form.replaceChildren(el('p', { class: 'muted small center', textContent: t('Na tym kanale nie możesz pisać.') }));
  }
  chat.messages = await Promise.all(res.messages.map(open));
  more.classList.toggle('hidden', res.messages.length < 40);
  render(true);
  markRead();
}

export function closeChat() {
  chat = undefined;
}

async function older() {
  const c = chat;
  const first = c.messages[0];
  if (!first) return;
  const res = await guard(() => api('GET', `${paths[c.kind](c)}?limit=40&before=${first.id}`));
  if (!res || chat !== c) return;
  const scroll = c.list.parentElement;
  const from = scroll.scrollHeight - scroll.scrollTop;
  c.messages = [...(await Promise.all(res.messages.map(open))), ...c.messages];
  c.more.classList.toggle('hidden', res.messages.length < 40);
  render(false);
  scroll.scrollTop = scroll.scrollHeight - from;
}

function markRead() {
  if (!chat || document.visibilityState !== 'visible') return;
  const c = chat;
  void api('POST', readPaths[c.kind](c)).catch(() => {});
  c.info.onRead?.();
}

async function send() {
  const c = chat;
  const text = c.input.value.trim();
  if (!text) return;
  c.input.disabled = true;
  if (await post(text) && chat === c) {
    c.input.value = '';
    c.input.style.height = 'auto';
  }
  c.input.disabled = false;
  c.input.focus();
}

/** A text (or a GIF's) to the open conversation, sealed for a friend or a group; true when it went. */
async function post(text) {
  const c = chat;
  if (!c) return false;
  try {
    const body = c.kind === 'dm' ? await sealDirect(c.id, text) : c.kind === 'group' ? await sealGroup(c.id, text) : text;
    const res = await api('POST', paths[c.kind](c), { text: body });
    if (chat !== c) return true;
    // the live event may have come first
    if (!c.messages.some((m) => m.id === res.message.id)) c.messages.push(c.kind === 'community' ? res.message : { ...(await open(res.message)), text });
    render(true);
    return true;
  } catch (err) {
    const wait = err.retryAfter ? ` (${err.retryAfter} s)` : '';
    toast(errorText(err) + wait, true);
    return false;
  }
}

/** A live event for the open conversation; true when it was its. */
export async function onEvent(e) {
  const c = chat;
  if (!c) return false;
  const m = e.message;
  if (c.kind === 'dm' && (e.type === 'message' || e.type === 'message-edit' || e.type === 'message-delete')) {
    if (m.from !== c.id && m.to !== c.id) return false;
    upsert(await open(m));
    if (e.type === 'message' && m.from === c.id) {
      c.typing.textContent = '';
      markRead();
    }
    return true;
  }
  if (c.kind === 'dm' && e.type === 'read' && e.by === c.id) {
    for (const x of c.messages) if (x.from !== c.id && !x.readAt) x.readAt = e.at;
    render(false);
    return true;
  }
  if (c.kind === 'dm' && e.type === 'typing' && e.from === c.id) {
    c.typing.textContent = t('{0} pisze…', c.info.title);
    clearTimeout(c.typingTimer);
    c.typingTimer = setTimeout(() => {
      c.typing.textContent = '';
    }, 5000);
    return true;
  }
  if (c.kind === 'group' && e.type?.startsWith('group-message') && m?.group === c.id) {
    upsert(await open(m));
    if (e.type === 'group-message' && m.from !== c.info.me) markRead();
    return true;
  }
  if (c.kind === 'community' && e.type?.startsWith('community-message') && m?.channel === c.channel) {
    upsert(m);
    if (e.type === 'community-message' && m.from !== c.info.me) markRead();
    return true;
  }
  return false;
}

function upsert(m) {
  if (!chat) return;
  const i = chat.messages.findIndex((x) => x.id === m.id);
  if (i >= 0) chat.messages[i] = { ...chat.messages[i], ...m, ...(m.deleted ? { text: '' } : {}) };
  else chat.messages.push(m);
  const scroll = chat.list.parentElement;
  const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
  render(atBottom || m.from === chat.info.me);
}

/** "Ala dodaje Olę": a group's own line. */
function eventText(e) {
  const users = (e.users ?? []).join(', ');
  switch (e.kind) {
    case 'created': return t('{0} tworzy grupę „{1}”', e.by, e.name ?? '');
    case 'added': return t('{0} dodaje: {1}', e.by, users);
    case 'removed': return t('{0} usuwa: {1}', e.by, users);
    case 'left': return t('{0} wychodzi', e.by);
    case 'joined': return t('{0} dołącza', e.by);
    case 'renamed': return t('{0} zmienia nazwę na „{1}”', e.by, e.name ?? '');
    case 'promoted': return t('{0} awansuje: {1}', e.by, users);
    case 'demoted': return t('{0} zmienia rolę: {1}', e.by, users);
    case 'owner': case 'heir': return t('{0} przekazuje klan: {1}', e.by, users);
    case 'logo': return t('{0} zmienia logo', e.by);
    default: return '';
  }
}

function bubble(m, prev) {
  const c = chat;
  if (m.event) return el('div', { class: 'event muted small', textContent: eventText(m.event) });
  const mine = m.from === c.info.me;
  const author = m.author ?? c.info.people?.get(m.from);
  const showName = !mine && c.kind !== 'dm' && (!prev || prev.from !== m.from || prev.event || m.at - prev.at > 5 * 60_000);
  const body = el('div', { class: 'text' });
  const gif = !m.deleted && !m.unreadable ? parseGif(m.text) : undefined;
  if (m.deleted) body.append(el('i', { class: 'muted', textContent: t('Wiadomość usunięta') }));
  else if (m.invite) {
    body.append(el('div', { class: 'invite-card' }, icon('fa-solid fa-gamepad'), el('div', {},
      el('b', { textContent: t('Zaproszenie do gry') }), el('div', { textContent: m.invite.server + (m.invite.version ? ` · ${m.invite.version}` : '') }),
      el('div', { class: 'muted small', textContent: t('Dołączysz z launchera na komputerze.') }))));
  } else if (m.waypoint) body.append(icon('fa-solid fa-location-dot'), ` ${m.waypoint.name} (${m.waypoint.x}, ${m.waypoint.y}, ${m.waypoint.z})`);
  else if (m.image) body.append(picture(m.image));
  else if (m.poll) body.append(icon('fa-solid fa-square-poll-vertical'), ` ${m.poll.question ?? m.text}`);
  else if (gif) body.append(gifCard(gif));
  else body.append(...linkify(m.text ?? ''));
  if (m.unreadable && !m.deleted) body.classList.add('unreadable');
  const meta = el('div', { class: 'meta' }, when(m.at), m.editedAt && !m.deleted ? ` · ${t('edytowano')}` : '', m.encrypted ? el('span', { title: t('Zaszyfrowana') }, ' ', icon('fa-solid fa-lock')) : '',
    mine && c.kind === 'dm' && m.readAt ? ` · ${t('przeczytano')}` : '');
  return el('div', { class: `msg${mine ? ' mine' : ''}${m.mentions?.includes(c.info.me) ? ' mention' : ''}${gif ? ` has-gif${gif.k === 'sticker' ? ' has-sticker' : ''}` : ''}` },
    showName ? el('div', { class: 'author', textContent: author?.name ?? '?' }) : '', body, meta);
}

/** A chat picture: decrypted on tap (it is downloaded only then). */
function picture(image) {
  if (image.unreadable || !image.id) return el('span', { class: 'muted' }, icon('fa-regular fa-image'), ` ${t('Zdjęcie zaszyfrowane dla innego urządzenia')}`);
  const box = el('button', { class: 'picture', onclick: async () => {
    box.disabled = true;
    box.replaceChildren(t('Wczytywanie…'));
    try {
      box.replaceWith(el('img', { class: 'picture-img', src: await pictureUrl(image.id), alt: t('Zdjęcie') }));
    } catch (err) {
      box.replaceChildren(t('Nie udało się otworzyć zdjęcia'));
      console.error(err);
    }
  } }, icon('fa-regular fa-image'), ` ${t('Pokaż zdjęcie')}`);
  return box;
}

/** Text with links that open in the browser (only http and https). */
function linkify(text) {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    out.push(text.slice(at, m.index));
    out.push(el('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer', textContent: m[0] }));
    at = m.index + m[0].length;
  }
  out.push(text.slice(at));
  return out;
}

function render(toBottom) {
  const c = chat;
  if (!c) return;
  const nodes = [];
  let day = '';
  c.messages.forEach((m, i) => {
    const d = new Date(m.at).toDateString();
    if (d !== day) {
      day = d;
      nodes.push(el('div', { class: 'day muted small', textContent: new Date(m.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) }));
    }
    nodes.push(bubble(m, c.messages[i - 1]));
  });
  if (!nodes.length) nodes.push(el('p', { class: 'muted center small empty', textContent: c.kind === 'dm' ? t('Napisz pierwszą wiadomość. Rozmowa jest szyfrowana.') : t('Jeszcze nic tu nie ma.') }));
  c.list.replaceChildren(...nodes);
  if (toBottom) {
    const scroll = c.list.parentElement;
    scroll.scrollTop = scroll.scrollHeight;
  }
}

/** The open chat's header line (a friend's status changed). */
export function setSubtitle(text) {
  const sub = chat && $('.sub', chat.head);
  if (sub) sub.textContent = text;
}

export { avatarEl };
