import { locale, t } from '../shared/i18n';
import { logoFromFile, logoUrl } from './clanLogo';
import { confirmDialog, control, el, icon, modalWindow } from './dialog';
import { editHint, editedLabel, openMenu, replaceMessage, tombstone, withMenu, type MenuItem } from './chatEdits';
import { disabledText, featureOn } from './features';

/**
 * Communities ("Społeczności") in the Friends view: like a clan but big (up to a thousand players),
 * and a player may be in several. This module adds their section to the friends list (with
 * invites, one's requests, + to found one and "Odkrywaj" for the directory of public ones), draws
 * an open community's chat into the chat panel (channels as tabs: "Ogólny" and "Ogłoszenia",
 * where only admins write), and has the windows for members, requests, reports and settings.
 *
 * The community chat is NOT end-to-end encrypted (a key for every member's launcher on every
 * message does not scale to a thousand people): it is kept on the server like a forum's posts, and
 * moderators can read and remove it. The chat says so above the composer.
 *
 * Big rooms: no toast for every message, only per the member's choice (all / mentions / none,
 * mentions by default); members come in pages; messages say who wrote them (no member list here).
 */

interface Person { id: string; handle: string; name: string; avatar: string }
export type CommunityRole = 'owner' | 'admin' | 'moderator' | 'member';
export const RANK: Record<CommunityRole, number> = { owner: 3, admin: 2, moderator: 1, member: 0 };
export type Notify = 'all' | 'mentions' | 'none';
export interface Channel { id: string; kind: 'general' | 'announcements' | 'custom'; name: string; canPost: boolean; unread: number; mentions: number }
export interface CommunitySummary {
  id: string; name: string; tag: string; slug: string; description: string; visibility: 'public' | 'private'; joinMode: 'open' | 'request';
  members: number; owner: Person; createdAt: number; logo?: number;
  /** In the directory: how I may get in. */
  state?: 'member' | 'invited' | 'open' | 'request' | 'requested' | 'invite' | 'banned' | 'full';
}
export interface Community extends CommunitySummary {
  role: CommunityRole; notify: Notify; onProfile: boolean; joinedAt: number; lastMessageAt: number; mutedUntil?: number;
  unread: number; mentions: number; channels: Channel[]; permissions: Record<string, boolean>;
  /** Waiting requests and open reports, for those who handle them. */
  pending?: number; reports?: number;
}
export interface CommunityMessage {
  id: number; community: string; channel: string; from: string; author: { name: string; handle: string; role?: CommunityRole };
  text: string; at: number; editedAt?: number; deleted?: boolean; moderated?: boolean; mentions?: string[];
}
interface Member extends Person { role: CommunityRole; joinedAt: number; status: string; online: boolean; mutedUntil?: number }

const PAGE = 50;

/** Who may do what to whom (the server checks it again): the same table as communityStore.ts's `may`. */
export function communityMay(role: CommunityRole | undefined, action: string, target?: CommunityRole, next?: CommunityRole): boolean {
  if (!role) return false;
  const r = RANK[role];
  const below = target !== undefined && RANK[target] < r;
  switch (action) {
    case 'invite': case 'requests': case 'reports': return r >= 1;
    case 'kick': case 'mute': case 'deleteMessage': return r >= 1 && below;
    case 'ban': return r >= 2 && below;
    case 'edit': case 'announce': case 'log': return r >= 2;
    case 'setRole': return r >= 2 && below && next !== undefined && next !== 'owner' && RANK[next] < r;
    case 'transfer': return role === 'owner' && target !== undefined && target !== 'owner';
    case 'delete': return role === 'owner';
    default: return false;
  }
}

/** A channel's name in the player's language: the two every community has, or its own. */
export const channelName = (ch: Pick<Channel, 'kind' | 'name'>) => (ch.kind === 'general' ? t('Ogólny') : ch.kind === 'announcements' ? t('Ogłoszenia') : ch.name);
/** "1 członek", "25 członków". */
export const membersText = (n: number) => (n === 1 ? t('{0} członek', n) : t('{0} członków', n));
export const communityRoleText = (r: CommunityRole) => ({ owner: t('Założyciel'), admin: t('Administrator'), moderator: t('Moderator'), member: t('Członek') })[r];

/** Whether a new message should make a toast or a notification: not one's own, and as the member chose (mentions by default). */
export function shouldNotify(c: Pick<Community, 'notify'>, m: Pick<CommunityMessage, 'from' | 'mentions'>, me: string | undefined): boolean {
  if (!me || m.from === me || c.notify === 'none') return false;
  return c.notify === 'all' || !!m.mentions?.includes(me);
}

/** The list after a new message: that community first, unread (and mentions) up unless that channel is open or it is ours. */
export function applyCommunityMessage(list: Community[], m: CommunityMessage, me: string | undefined, open?: { community: string; channel: string }): Community[] {
  const c = list.find((x) => x.id === m.community);
  if (!c) return list;
  const seen = m.from === me || (open?.community === m.community && open.channel === m.channel);
  const mention = !seen && !!me && !!m.mentions?.includes(me);
  const channels = c.channels.map((ch) => (ch.id === m.channel && !seen ? { ...ch, unread: ch.unread + 1, mentions: ch.mentions + (mention ? 1 : 0) } : ch));
  const next = { ...c, lastMessageAt: m.at, channels, unread: seen ? c.unread : Math.min(99, c.unread + 1), mentions: c.mentions + (mention ? 1 : 0) };
  return [next, ...list.filter((x) => x.id !== m.community)];
}

/** What counts on the Friends tab's badge: unread where the member wants to hear of everything, mentions where only of those, and invites. */
export function communityBadge(list: Pick<Community, 'notify' | 'unread' | 'mentions'>[], invites: number): number {
  return list.reduce((n, c) => n + (c.notify === 'all' ? c.unread : c.notify === 'mentions' ? c.mentions : 0), 0) + invites;
}

/** "@ala" parts of a text as their own spans (one's own handle stands out). */
export function mentionParts(text: string, myHandle: string | undefined): { text: string; mention?: boolean; me?: boolean }[] {
  const out: { text: string; mention?: boolean; me?: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/(^|[^\w.@])(@[\w.]{1,40})/g)) {
    const at = m.index! + m[1].length;
    if (at > last) out.push({ text: text.slice(last, at) });
    const handle = m[2].replace(/\.+$/, '');
    out.push({ text: handle, mention: true, me: !!myHandle && handle.slice(1).toLowerCase() === myHandle.toLowerCase() });
    last = at + handle.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

interface Deps {
  api: {
    socialApi: (method: string, path: string, body?: unknown) => Promise<any>;
    notify?: (title: string, body: string, target?: unknown) => Promise<unknown>;
    socialSetCommunityLogo?: (id: string, png: Uint8Array) => Promise<any>;
    socialCommunityLogo?: (id: string, version: number) => Promise<string>;
    socialProfileUrl?: (handle: string, open?: boolean) => Promise<string>;
  };
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  me: () => { id: string; handle: string } | undefined;
  avatar: (p: Person, presence?: { status: string }) => HTMLElement;
  /** The friends list and the chat panel should be drawn again. */
  changed: () => void;
  /** A community was opened: the friends list and the groups let go of theirs. */
  opened: () => void;
  visible: () => boolean;
  /** Edit one's message in the Friends view's composer (it calls saveEdit with the new text). */
  edit: (m: CommunityMessage) => void;
  editGone: () => void;
}

export function createCommunities(deps: Deps) {
  const { api } = deps;
  let list: Community[] = [];
  let invites: { community: CommunitySummary; by: Person; at: number }[] = [];
  let requests: { community: CommunitySummary; at: number }[] = [];
  let limits = { members: 1000, perPlayer: 10, owned: 3, message: 2000, description: 500 };
  let open: { community: string; channel: string } | undefined;
  let editingId: number | undefined;
  const chats = new Map<string, { messages: CommunityMessage[]; more: boolean; loading: boolean; editWindowMs?: number; moderator?: boolean; canPost?: boolean; mutedUntil?: number }>();
  let parts: { head: HTMLElement; messages: HTMLElement; typing: HTMLElement } | undefined;

  const community = (id: string | undefined) => list.find((c) => c.id === id);
  const me = () => deps.me()?.id;

  async function refresh() {
    try {
      const res = await api.socialApi('GET', '/v1/communities/mine');
      list = res.communities ?? [];
      invites = res.invites ?? [];
      requests = res.requests ?? [];
      if (res.limits) limits = { ...limits, ...res.limits };
    } catch {
      // an older server has no communities: nothing to show
      list = [];
      invites = [];
      requests = [];
    }
    if (open && !community(open.community)) open = undefined;
    deps.changed();
  }

  async function act<T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> {
    try {
      const res = await fn();
      if (done) deps.toast(done);
      return res;
    } catch (err) {
      deps.toast(deps.errorText(err), true);
      return undefined;
    }
  }
  /** The answers that carry my list again. */
  function take(res: { communities?: Community[]; invites?: typeof invites; requests?: typeof requests } | undefined) {
    if (!res?.communities) return;
    list = res.communities;
    invites = res.invites ?? [];
    requests = res.requests ?? [];
    deps.changed();
  }

  // ---------- the rows in the friends list ----------

  /** A community's square: its logo when it has one (and it is here), else people on teal. */
  function communityAvatar(c: { id: string; logo?: number }, ready: () => void = deps.changed) {
    const url = c.logo ? logoUrl(api.socialCommunityLogo, c.id, c.logo, ready) : undefined;
    const box = el('div', { className: `fr-avatar fr-group-avatar community${url ? ' has-logo' : ''}` });
    box.append(url ? el('img', { src: url, alt: '', className: 'fr-clan-logo' }) : icon('fa-users'));
    return box;
  }

  /** "#TAG · 123 członków" */
  const subline = (c: CommunitySummary) => [c.tag ? `#${c.tag}` : '', membersText(c.members)].filter(Boolean).join(' · ');

  function row(c: Community) {
    const selected = open?.community === c.id;
    // a mention stands out; the rest is quiet when the member does not want to hear of everything
    const quiet = c.notify !== 'all' && !c.mentions;
    const badge = c.mentions ? el('span', { className: 'fr-unread fr-mention-badge', textContent: `@${c.mentions > 9 ? '9+' : c.mentions}` })
      : c.unread ? el('span', { className: `fr-unread${quiet ? ' muted' : ''}`, textContent: c.unread >= 99 ? '99+' : String(c.unread) }) : '';
    const staff = (c.pending ?? 0) + (c.reports ?? 0);
    const r = el('button', { type: 'button', className: `fr-row fr-group fr-community${selected ? ' selected' : ''}` },
      communityAvatar(c),
      el('div', { className: 'grow fr-names' }, el('b', { textContent: c.name }), el('small', { className: 'muted', textContent: subline(c) })),
      staff ? el('i', { className: 'fa-solid fa-user-clock fr-staff-dot', title: t('Prośby lub zgłoszenia czekają: {0}', staff) }) : '',
      c.notify === 'none' ? el('i', { className: 'fa-solid fa-bell-slash fr-muted', title: t('Bez powiadomień') }) : '',
      badge);
    r.addEventListener('click', () => void select(c.id));
    return r;
  }

  function sections(): Node[] {
    const out: Node[] = [];
    // switched off in the server's admin panel for a while: only a note
    if (!featureOn('communities')) {
      return [el('div', { className: 'fr-section fr-section-row' }, el('span', { textContent: t('Społeczności') })), el('p', { className: 'muted fr-empty', textContent: disabledText() })];
    }
    const discover = el('button', { type: 'button', className: 'icon-btn fr-section-btn', title: t('Odkrywaj społeczności') }, icon('fa-compass'));
    discover.addEventListener('click', () => discoverWindow());
    const add = el('button', { type: 'button', className: 'icon-btn fr-section-btn', title: t('Załóż społeczność') }, icon('fa-plus'));
    add.addEventListener('click', () => createWindow());
    out.push(el('div', { className: 'fr-section fr-section-row' }, el('span', { textContent: t('Społeczności') }), el('span', { className: 'row fr-section-btns' }, discover, add)));
    for (const inv of invites) {
      const accept = el('button', { type: 'button', className: 'icon-btn primary', title: t('Dołącz') }, icon('fa-check'));
      const decline = el('button', { type: 'button', className: 'icon-btn', title: t('Odrzuć') }, icon('fa-xmark'));
      accept.addEventListener('click', async () => take(await act(() => api.socialApi('POST', `/v1/communities/${inv.community.id}/invites/accept`), t('Dołączono do społeczności {0}.', inv.community.name))));
      decline.addEventListener('click', async () => take(await act(() => api.socialApi('POST', `/v1/communities/${inv.community.id}/invites/decline`))));
      out.push(el('div', { className: 'fr-row' }, communityAvatar(inv.community),
        el('div', { className: 'grow fr-names' }, el('b', { textContent: inv.community.name }), el('small', { className: 'muted', textContent: t('{0} zaprasza do społeczności', inv.by.name) })),
        accept, decline));
    }
    out.push(...list.map(row));
    for (const r of requests) {
      const cancel = el('button', { type: 'button', className: 'icon-btn', title: t('Wycofaj prośbę') }, icon('fa-xmark'));
      cancel.addEventListener('click', async () => take(await act(() => api.socialApi('DELETE', `/v1/communities/${r.community.id}/requests/mine`))));
      out.push(el('div', { className: 'fr-row is-offline' }, communityAvatar(r.community),
        el('div', { className: 'grow fr-names' }, el('b', { textContent: r.community.name }), el('small', { className: 'muted', textContent: t('prośba czeka na moderatorów') })), cancel));
    }
    if (!list.length && !invites.length && !requests.length) out.push(el('p', { className: 'muted fr-empty', textContent: t('Duże grupy graczy z własnym czatem. Znajdź jakąś w „Odkrywaj” albo załóż własną.') }));
    return out;
  }

  // ---------- the conversation ----------

  async function select(id: string, channel?: string) {
    const c = community(id);
    if (!c) return;
    open = { community: id, channel: channel ?? c.channels.find((ch) => ch.kind === 'general')?.id ?? c.channels[0]?.id ?? '' };
    editingId = undefined;
    deps.opened();
    deps.changed();
    if (!chats.has(open.channel)) await loadOlder();
    markRead();
  }

  async function loadOlder() {
    const at = open;
    if (!at?.channel) return;
    const chat = chats.get(at.channel) ?? { messages: [], more: true, loading: false };
    chats.set(at.channel, chat);
    if (chat.loading || !chat.more) return;
    chat.loading = true;
    try {
      const before = chat.messages[0]?.id;
      const res = await api.socialApi('GET', `/v1/communities/${at.community}/channels/${at.channel}/messages?limit=${PAGE}${before ? `&before=${before}` : ''}`);
      const messages: CommunityMessage[] = res.messages ?? [];
      chat.messages = [...messages, ...chat.messages];
      Object.assign(chat, { editWindowMs: res.editWindowMs, moderator: !!res.moderator, canPost: res.canPost !== false, mutedUntil: res.mutedUntil, more: messages.length === PAGE });
      if (open?.channel === at.channel && parts) {
        const box = parts.messages;
        const fromBottom = box.scrollHeight - box.scrollTop;
        renderMessages();
        box.scrollTop = before ? box.scrollHeight - fromBottom : box.scrollHeight;
      }
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      chat.loading = false;
    }
  }

  function markRead() {
    const c = community(open?.community);
    const ch = c?.channels.find((x) => x.id === open?.channel);
    if (!c || !ch || (!ch.unread && !ch.mentions)) return;
    const unread = Math.max(0, c.unread - ch.unread);
    list = list.map((x) => (x.id === c.id ? { ...x, unread, mentions: Math.max(0, x.mentions - ch.mentions), channels: x.channels.map((y) => (y.id === ch.id ? { ...y, unread: 0, mentions: 0 } : y)) } : x));
    deps.changed();
    void api.socialApi('POST', `/v1/communities/${c.id}/channels/${ch.id}/read`).catch(() => {});
  }

  async function send(text: string): Promise<boolean> {
    const at = open;
    if (!at || !text.trim()) return false;
    if (text.length > limits.message) return (deps.toast(t('Wiadomość jest za długa (maks. {0} znaków).', limits.message), true), false);
    const res = await act(() => api.socialApi('POST', `/v1/communities/${at.community}/channels/${at.channel}/messages`, { text }));
    if (res?.message) addMessage(res.message);
    return !!res;
  }

  function addMessage(m: CommunityMessage) {
    const chat = chats.get(m.channel);
    if (chat && !chat.messages.some((x) => x.id === m.id)) chat.messages.push(m);
    list = applyCommunityMessage(list, m, me(), deps.visible() ? open : undefined);
    if (m.channel === open?.channel && parts) {
      const box = parts.messages;
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      renderMessages();
      if (atBottom || m.from === me()) box.scrollTop = box.scrollHeight;
    }
  }

  function replaced(m: CommunityMessage) {
    const chat = chats.get(m.channel);
    if (chat) chat.messages = replaceMessage(chat.messages, m);
    if (editingId === m.id) {
      editingId = undefined;
      if (m.deleted) deps.editGone();
    }
    if (m.channel === open?.channel && parts) renderMessages();
  }

  /** The "…" by a message: edit one's own for a while, delete one's own (or below one's role), report others'. */
  function messageMenu(c: Community, m: CommunityMessage, chat: { editWindowMs?: number }): MenuItem[] {
    const mine = m.from === me();
    const items: MenuItem[] = [];
    if (m.deleted) return items;
    if (mine && chat.editWindowMs && Date.now() - m.at < chat.editWindowMs) {
      items.push({ label: t('Edytuj'), icon: 'fa-pen', hint: editHint(m, chat.editWindowMs), run: () => {
        editingId = m.id;
        renderMessages();
        deps.edit(m);
      } });
    }
    items.push({ label: t('Kopiuj'), icon: 'fa-copy', run: () => void navigator.clipboard.writeText(m.text).then(() => deps.toast(t('Skopiowano'))) });
    if (mine || communityMay(c.role, 'deleteMessage', m.author.role ?? 'member')) {
      items.push({ label: mine ? t('Usuń') : t('Usuń (moderacja)'), icon: 'fa-trash', danger: true, run: () => void deleteMessage(m, !mine) });
    }
    if (!mine) items.push({ label: t('Zgłoś'), icon: 'fa-flag', danger: true, run: () => reportWindow(m) });
    return items;
  }

  async function saveEdit(communityId: string, channel: string, id: number, text: string): Promise<boolean> {
    if (text.length > limits.message) return (deps.toast(t('Wiadomość jest za długa (maks. {0} znaków).', limits.message), true), false);
    const res = await act(() => api.socialApi('POST', `/v1/communities/${communityId}/channels/${channel}/messages/${id}/edit`, { text }));
    if (res?.message) replaced(res.message);
    return !!res;
  }

  async function deleteMessage(m: CommunityMessage, theirs: boolean) {
    const ok = await confirmDialog({
      title: t('Usunąć wiadomość?'),
      body: [el('p', { className: 'muted', textContent: theirs ? t('Wiadomość od {0} zniknie u wszystkich w społeczności. Trafi to do dziennika moderacji.', m.author.name) : t('Zniknie u wszystkich w społeczności. Tego nie da się cofnąć.') })],
      ok: t('Usuń'), danger: true,
    });
    if (!ok) return;
    const res = await act(() => api.socialApi('DELETE', `/v1/communities/${m.community}/channels/${m.channel}/messages/${m.id}`));
    if (res?.message) replaced(res.message);
  }

  function reportWindow(m: CommunityMessage) {
    const reason = control<HTMLTextAreaElement>('textarea', { rows: 3, maxLength: 300, placeholder: t('Co jest nie tak? (opcjonalnie)') });
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const go = el('button', { type: 'button', className: 'danger' }, icon('fa-flag'), t(' Zgłoś'));
    const done = modalWindow(t('Zgłoś wiadomość'), [
      el('blockquote', { className: 'fr-quote', textContent: `${m.author.name}: ${m.text.length > 300 ? `${m.text.slice(0, 297)}…` : m.text}` }),
      el('p', { className: 'muted', textContent: t('Zgłoszenie zobaczą moderatorzy tej społeczności i administracja SlashClient.') }),
      reason,
    ], [cancel, go], undefined, 'fr-group-modal fr-com-modal');
    cancel.addEventListener('click', done);
    go.addEventListener('click', async () => {
      go.disabled = true;
      const res = await act(() => api.socialApi('POST', `/v1/communities/${m.community}/channels/${m.channel}/messages/${m.id}/report`, { reason: reason.value.trim() }), t('Zgłoszono. Dziękujemy!'));
      go.disabled = false;
      if (res) done();
    });
    reason.focus();
  }

  function renderChat(head: HTMLElement, messages: HTMLElement, typing: HTMLElement) {
    parts = { head, messages, typing };
    const c = community(open?.community);
    if (!c) return;
    const actions: Node[] = [];
    const button = (name: string, title: string, run: (b: HTMLButtonElement) => void, count = 0, extra = '') => {
      const b = el('button', { type: 'button', className: `icon-btn${extra}`, title }, icon(name));
      if (count) b.append(el('span', { className: 'fr-btn-count', textContent: count > 99 ? '99+' : String(count) }));
      b.addEventListener('click', () => run(b));
      actions.push(b);
    };
    button('fa-users', t('Członkowie'), () => membersWindow(c));
    if (communityMay(c.role, 'requests') && c.joinMode === 'request' || (c.pending ?? 0) > 0) button('fa-user-clock', t('Prośby o dołączenie'), () => requestsWindow(c), c.pending ?? 0);
    if (communityMay(c.role, 'reports')) button('fa-flag', t('Zgłoszenia'), () => reportsWindow(c), c.reports ?? 0);
    button(c.notify === 'none' ? 'fa-bell-slash' : 'fa-bell', t('Powiadomienia'), (b) => notifyMenu(c, b), 0, c.notify === 'all' ? ' on' : '');
    if (communityMay(c.role, 'edit') || communityMay(c.role, 'ban', 'member') || communityMay(c.role, 'delete')) button('fa-gear', t('Ustawienia społeczności'), () => settingsWindow(c));
    if (c.role !== 'owner') {
      button('fa-right-from-bracket', t('Opuść społeczność'), async () => {
        if (!(await confirmDialog({ title: t('Opuścić „{0}”?', c.name), body: [el('p', { className: 'muted', textContent: c.visibility === 'private' ? t('To prywatna społeczność: wrócić można tylko na zaproszenie.') : t('Możesz wrócić później przez „Odkrywaj”.') })], ok: t('Opuść'), danger: true }))) return;
        const res = await act(() => api.socialApi('POST', `/v1/communities/${c.id}/leave`));
        if (res) {
          open = undefined;
          take(res);
        }
      }, 0, ' danger');
    }
    const tabs = el('div', { className: 'fr-com-tabs' }, ...c.channels.map((ch) => {
      const b = el('button', { type: 'button', className: `fr-com-tab${ch.id === open?.channel ? ' active' : ''}` }, icon(ch.kind === 'announcements' ? 'fa-bullhorn' : 'fa-hashtag'), ` ${channelName(ch)}`);
      if (ch.id !== open?.channel && (ch.unread || ch.mentions)) b.append(el('span', { className: `fr-tab-dot${ch.mentions ? ' mention' : ''}` }));
      b.addEventListener('click', () => void select(c.id, ch.id));
      return b;
    }));
    head.replaceChildren(communityAvatar(c),
      el('div', { className: 'grow fr-names' }, el('b', { textContent: c.name }),
        el('small', { className: 'muted', textContent: `${subline(c)} · ${communityRoleText(c.role)}` }), tabs),
      ...actions);
    // where one writes: this chat is not end-to-end encrypted (moderators see it)
    typing.replaceChildren(el('span', { className: 'fr-plain-note' }, icon('fa-lock-open'), ` ${t('Czat społeczności nie jest szyfrowany od nadawcy do odbiorcy — widzą go moderatorzy.')}`));
    renderMessages();
  }

  function renderMessages() {
    if (!parts) return;
    const box = parts.messages;
    const c = community(open?.community);
    const chat = open ? chats.get(open.channel) : undefined;
    if (!chat || !c) return box.replaceChildren(el('div', { className: 'fr-placeholder' }, el('span', { className: 'spinner' })));
    const my = deps.me();
    const nodes: Node[] = [];
    const channel = c.channels.find((x) => x.id === open?.channel);
    if (!chat.messages.length) {
      nodes.push(el('div', { className: 'fr-placeholder' }, icon(channel?.kind === 'announcements' ? 'fa-bullhorn' : 'fa-users'),
        el('p', { className: 'muted', textContent: channel?.kind === 'announcements' ? t('Tu administratorzy piszą ogłoszenia dla wszystkich.') : t('Napisz pierwszą wiadomość w społeczności.') })));
    }
    const day = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
    const time = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' });
    let lastDay = '';
    let lastFrom = '';
    let lastAt = 0;
    for (const m of chat.messages) {
      const d = day.format(m.at);
      if (d !== lastDay) {
        nodes.push(el('div', { className: 'fr-day', textContent: d }));
        lastFrom = '';
      }
      lastDay = d;
      const mine = m.from === my?.id;
      const grouped = m.from === lastFrom && m.at - lastAt < 5 * 60_000;
      let bubble: HTMLElement;
      if (m.deleted) {
        bubble = tombstone();
        if (m.moderated) bubble.title = t('Usunięta przez moderację');
      } else {
        const toMe = !!my && !!m.mentions?.includes(my.id);
        bubble = el('div', { className: `fr-bubble${toMe ? ' fr-mention' : ''}` }, ...mentionParts(m.text, my?.handle).map((p) => (p.mention ? el('b', { className: `fr-at${p.me ? ' me' : ''}`, textContent: p.text }) : p.text)));
        if (m.editedAt) bubble.append(editedLabel(m.editedAt));
      }
      const role = m.author.role && m.author.role !== 'member' ? m.author.role : undefined;
      const who = mine ? time.format(m.at) : `${m.author.name} · ${time.format(m.at)}`;
      nodes.push(el('div', { className: `fr-msg${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}${editingId === m.id ? ' editing' : ''}`, title: new Date(m.at).toLocaleString(locale()) },
        withMenu(bubble, messageMenu(c, m, chat)),
        grouped ? '' : el('small', { className: 'fr-time' }, role && !mine ? el('span', { className: `fr-com-role ${role}`, textContent: communityRoleText(role) }) : '', who)));
      lastFrom = m.from;
      lastAt = m.at;
    }
    box.replaceChildren(...nodes);
  }

  /** Whether the composer may write here, and why not (muted, announcements). */
  function composerState(): { canPost: boolean; reason?: string } {
    const c = community(open?.community);
    const ch = c?.channels.find((x) => x.id === open?.channel);
    if (!c || !ch) return { canPost: false };
    if (!ch.canPost) return { canPost: false, reason: t('Tu piszą tylko administratorzy społeczności.') };
    const until = c.mutedUntil ?? chats.get(ch.id)?.mutedUntil;
    if (until && until > Date.now()) return { canPost: false, reason: t('Wyciszono Cię tu do {0}.', new Date(until).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })) };
    return { canPost: true };
  }

  // ---------- windows ----------

  function notifyMenu(c: Community, anchor: HTMLElement) {
    const set = async (body: unknown, path: string) => take(await act(() => api.socialApi('POST', `/v1/communities/${c.id}/${path}`, body)));
    const mark = (on: boolean) => (on ? 'fa-circle-dot' : 'fa-circle');
    const items: MenuItem[] = [
      { label: t('Wszystkie wiadomości'), icon: mark(c.notify === 'all'), run: () => void set({ notify: 'all' }, 'notify') },
      { label: t('Tylko wzmianki (@nick)'), icon: mark(c.notify === 'mentions'), run: () => void set({ notify: 'mentions' }, 'notify') },
      { label: t('Bez powiadomień'), icon: mark(c.notify === 'none'), run: () => void set({ notify: 'none' }, 'notify') },
    ];
    // only a public community can be on one's profile
    if (c.visibility === 'public') items.push({ label: c.onProfile ? t('Ukryj na moim profilu') : t('Pokazuj na moim profilu'), icon: 'fa-id-card', run: () => void set({ show: !c.onProfile }, 'profile') });
    openMenu(anchor, items);
  }

  function createWindow() {
    const f = settingsFields();
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const go = el('button', { type: 'button', className: 'primary' }, icon('fa-users'), t(' Załóż społeczność'));
    const done = modalWindow(t('Nowa społeczność'), [
      el('p', { className: 'muted', textContent: t('Społeczność to duża grupa (do {0} osób) z czatem. Możesz być w kilku naraz, niezależnie od klanu. Jej tag nie pojawia się przy nicku.', limits.members) }),
      ...f.nodes,
      el('p', { className: 'muted fr-plain-note' }, icon('fa-lock-open'), ` ${t('Czat społeczności nie jest szyfrowany od nadawcy do odbiorcy — widzą go moderatorzy.')}`),
    ], [cancel, go], undefined, 'fr-group-modal fr-com-modal');
    cancel.addEventListener('click', done);
    go.addEventListener('click', async () => {
      go.disabled = true;
      const res = await act(() => api.socialApi('POST', '/v1/communities', f.value()), t('Społeczność założona.'));
      go.disabled = false;
      if (!res?.community) return;
      done();
      take(res);
      void select(res.community.id);
    });
    f.name.focus();
  }

  /** Name, tag, description, who sees it and how one joins: for a new community and its settings. */
  function settingsFields(c?: Community) {
    const name = control<HTMLInputElement>('input', { placeholder: t('Nazwa społeczności'), value: c?.name ?? '', maxLength: 40 });
    const tag = control<HTMLInputElement>('input', { placeholder: '#TAG', value: c?.tag ?? '', maxLength: 6, className: 'fr-tag-input' });
    const description = control<HTMLTextAreaElement>('textarea', { rows: 3, maxLength: limits.description, placeholder: t('Opis: o czym jest, zasady…'), value: c?.description ?? '' });
    const visibility = control<HTMLSelectElement>('select', {});
    visibility.append(el('option', { value: 'public', textContent: t('Publiczna: widać ją w „Odkrywaj”') }), el('option', { value: 'private', textContent: t('Prywatna: tylko na zaproszenie, ukryta') }));
    visibility.value = c?.visibility ?? 'public';
    const joinMode = control<HTMLSelectElement>('select', {});
    joinMode.append(el('option', { value: 'open', textContent: t('Otwarta: każdy dołącza od razu') }), el('option', { value: 'request', textContent: t('Na prośbę: moderatorzy przyjmują') }));
    joinMode.value = c?.joinMode ?? 'open';
    const hint = el('small', { className: 'muted' });
    const update = () => {
      tag.value = tag.value.replace(/[^A-Za-z0-9]/g, '');
      joinMode.disabled = visibility.value === 'private';
      hint.textContent = tag.value ? t('Lista pokaże #{0}; strona: /s/{0}. Tag klanu [ABC] to co innego.', tag.value) : t('Tag: 2–6 liter lub cyfr, bez spacji. Nie jest wymagany.');
    };
    tag.addEventListener('input', update);
    visibility.addEventListener('change', update);
    update();
    return {
      name,
      nodes: [el('div', { className: 'row fr-clan-fields' }, tag, name), hint, description, el('div', { className: 'row fr-com-selects' }, visibility, joinMode)] as Node[],
      value: () => ({ name: name.value.trim(), tag: tag.value.trim(), description: description.value, visibility: visibility.value, joinMode: joinMode.value }),
    };
  }

  /** The directory of public communities: the biggest first, or by name or tag. */
  function discoverWindow() {
    const search = control<HTMLInputElement>('input', { type: 'search', placeholder: t('Szukaj po nazwie lub tagu') });
    const results = el('div', { className: 'fr-clan-members fr-com-directory' });
    const more = el('button', { type: 'button', className: 'hidden' }, t('Pokaż więcej'));
    let offset = 0;
    let q = '';
    const load = async (reset: boolean) => {
      if (reset) {
        offset = 0;
        results.replaceChildren(el('div', { className: 'fr-placeholder' }, el('span', { className: 'spinner' })));
      }
      const res = await act(() => api.socialApi('GET', `/v1/communities/discover?q=${encodeURIComponent(q)}&offset=${offset}&limit=20`));
      if (!res) return;
      if (reset) results.replaceChildren();
      for (const c of res.communities as CommunitySummary[]) results.append(directoryRow(c, () => void load(true), () => close()));
      offset += res.communities.length;
      more.classList.toggle('hidden', offset >= res.total);
      if (!results.childElementCount) results.append(el('p', { className: 'muted fr-empty', textContent: q ? t('Nic nie pasuje.') : t('Nie ma jeszcze publicznych społeczności. Załóż pierwszą!') }));
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        q = search.value.trim();
        void load(true);
      }, 300);
    });
    more.addEventListener('click', () => void load(false));
    const close = modalWindow(t('Odkrywaj społeczności'), [search, results, more], [], undefined, 'fr-group-modal fr-com-modal');
    void load(true);
    search.focus();
  }

  function directoryRow(c: CommunitySummary, reload: () => void, close: () => void) {
    const state = c.state ?? 'open';
    const label: Record<string, [string, string, boolean]> = {
      open: [t('Dołącz'), 'fa-right-to-bracket', true], request: [t('Poproś o dołączenie'), 'fa-hand', true], invited: [t('Przyjmij zaproszenie'), 'fa-check', true],
      member: [t('Otwórz'), 'fa-comments', true], requested: [t('Prośba wysłana'), 'fa-hourglass-half', false], banned: [t('Zablokowano Cię'), 'fa-ban', false],
      full: [t('Pełna'), 'fa-circle-xmark', false], invite: [t('Tylko na zaproszenie'), 'fa-lock', false],
    };
    const [text, ico, enabled] = label[state] ?? label.open;
    const go = el('button', { type: 'button', className: state === 'member' ? '' : 'primary', disabled: !enabled }, icon(ico), ` ${text}`);
    go.addEventListener('click', async () => {
      if (state === 'member') {
        close();
        return void select(c.id);
      }
      go.disabled = true;
      const res = await act(() => api.socialApi('POST', `/v1/communities/${c.id}/join`));
      if (!res) {
        go.disabled = false;
        return;
      }
      take(res);
      deps.toast(res.status === 'requested' ? t('Wysłano prośbę do moderatorów {0}.', c.name) : t('Dołączono do społeczności {0}.', c.name));
      reload();
    });
    return el('div', { className: 'fr-row fr-com-dir-row' }, communityAvatar(c),
      el('div', { className: 'grow fr-names' }, el('b', { textContent: c.name }), el('small', { className: 'muted', textContent: subline(c) }),
        c.description ? el('small', { className: 'fr-com-desc', textContent: c.description }) : ''),
      go);
  }

  /** Members in pages, searchable; what one's role allows to each of them. */
  function membersWindow(c: Community) {
    const search = control<HTMLInputElement>('input', { type: 'search', placeholder: t('Szukaj członka') });
    const rows = el('div', { className: 'fr-clan-members' });
    const more = el('button', { type: 'button', className: 'hidden' }, t('Pokaż więcej'));
    const counter = el('p', { className: 'muted' });
    let offset = 0;
    let q = '';
    const call = async (method: string, path: string, body?: unknown, ok?: string) => {
      const res = await act(() => api.socialApi(method, path, body), ok);
      if (res) void load(true);
      return res;
    };
    const memberRow = (m: Member) => {
      const buttons: Node[] = [];
      const mine = m.id === me();
      if (!mine) {
        const roles = (['admin', 'moderator', 'member'] as CommunityRole[]).filter((r) => r === m.role || communityMay(c.role, 'setRole', m.role, r));
        if (roles.length > 1) {
          const pick = control<HTMLSelectElement>('select', { className: 'fr-role-pick', title: t('Rola') });
          for (const r of roles) pick.append(el('option', { value: r, textContent: communityRoleText(r) }));
          pick.value = m.role;
          pick.addEventListener('change', () => void call('POST', `/v1/communities/${c.id}/members/${m.id}/role`, { role: pick.value }, t('Zmieniono rolę.')));
          buttons.push(pick);
        }
        if (communityMay(c.role, 'mute', m.role)) {
          const mute = el('button', { type: 'button', className: 'icon-btn', title: m.mutedUntil ? t('Wyciszony do {0}', new Date(m.mutedUntil).toLocaleString(locale())) : t('Wycisz na czacie') }, icon(m.mutedUntil ? 'fa-comment-slash' : 'fa-volume-xmark'));
          mute.addEventListener('click', () => openMenu(mute, [
            ...([[10, t('10 minut')], [60, t('1 godzina')], [1440, t('1 dzień')], [10080, t('7 dni')]] as [number, string][]).map(([minutes, label]) => ({ label, icon: 'fa-volume-xmark', run: () => void call('POST', `/v1/communities/${c.id}/members/${m.id}/mute`, { minutes }, t('Wyciszono {0}.', m.name)) })),
            ...(m.mutedUntil ? [{ label: t('Zdejmij wyciszenie'), icon: 'fa-volume-high', run: () => void call('POST', `/v1/communities/${c.id}/members/${m.id}/mute`, { minutes: 0 }) }] : []),
          ]));
          buttons.push(mute);
        }
        if (communityMay(c.role, 'transfer', m.role)) {
          const crown = el('button', { type: 'button', className: 'icon-btn', title: t('Przekaż społeczność') }, icon('fa-crown'));
          crown.addEventListener('click', async () => {
            if (!(await confirmDialog({ title: t('Przekazać społeczność {0}?', m.name), body: [el('p', { className: 'muted', textContent: t('{0} zostanie założycielem, a Ty administratorem.', m.name) })], ok: t('Przekaż') }))) return;
            const res = await call('POST', `/v1/communities/${c.id}/owner`, { user: m.id });
            take(res);
          });
          buttons.push(crown);
        }
        if (communityMay(c.role, 'kick', m.role)) {
          const kick = el('button', { type: 'button', className: 'icon-btn danger', title: t('Wyrzuć ze społeczności') }, icon('fa-user-minus'));
          kick.addEventListener('click', async () => {
            if (await confirmDialog({ title: t('Wyrzucić {0}?', m.name), body: [el('p', { className: 'muted', textContent: t('Może wrócić później. Żeby nie mógł, zbanuj.') })], ok: t('Wyrzuć'), danger: true })) await call('DELETE', `/v1/communities/${c.id}/members/${m.id}`);
          });
          buttons.push(kick);
        }
        if (communityMay(c.role, 'ban', m.role)) {
          const ban = el('button', { type: 'button', className: 'icon-btn danger', title: t('Zbanuj') }, icon('fa-ban'));
          ban.addEventListener('click', () => banWindow(c, m, () => void load(true)));
          buttons.push(ban);
        }
      }
      return el('div', { className: `fr-row${m.online ? '' : ' is-offline'}` }, deps.avatar(m, { status: m.status }),
        el('div', { className: 'grow fr-names' }, el('b', { textContent: mine ? t('{0} (Ty)', m.name) : m.name }),
          el('small', { className: `muted fr-com-role-line ${m.role}`, textContent: `${communityRoleText(m.role)} · ${m.online ? t('online') : t('offline')}${m.mutedUntil ? ` · ${t('wyciszony')}` : ''}` })),
        ...buttons);
    };
    const load = async (reset: boolean) => {
      if (reset) offset = 0;
      const res = await act(() => api.socialApi('GET', `/v1/communities/${c.id}/members?offset=${offset}&limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`));
      if (!res) return;
      if (reset) rows.replaceChildren();
      for (const m of res.members as Member[]) rows.append(memberRow(m));
      offset += res.members.length;
      counter.textContent = q ? t('Znaleziono: {0}', res.total) : t('Członkowie: {0} z {1}', res.total, limits.members);
      more.classList.toggle('hidden', offset >= res.total);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        q = search.value.trim();
        void load(true);
      }, 300);
    });
    more.addEventListener('click', () => void load(false));
    const body: Node[] = [counter, search, rows, more];
    if (communityMay(c.role, 'invite')) body.push(...inviteSection(c));
    modalWindow(t('Członkowie: {0}', c.name), body, [], undefined, 'fr-group-modal fr-com-modal');
    void load(true);
  }

  /** "Zaproś": a nick, and the invites waiting (moderators and up). */
  function inviteSection(c: Community): Node[] {
    const handle = control<HTMLInputElement>('input', { placeholder: t('Nick gracza'), maxLength: 40 });
    const send = el('button', { type: 'button', className: 'primary' }, icon('fa-paper-plane'), t(' Zaproś'));
    const pending = el('div', { className: 'fr-clan-members' });
    const loadPending = async () => {
      const res = await api.socialApi('GET', `/v1/communities/${c.id}/invites`).catch(() => undefined);
      pending.replaceChildren(...(res?.invites ?? []).map((inv: Person & { at: number }) => {
        const cancel = el('button', { type: 'button', className: 'icon-btn', title: t('Anuluj zaproszenie') }, icon('fa-xmark'));
        cancel.addEventListener('click', async () => (await act(() => api.socialApi('DELETE', `/v1/communities/${c.id}/invites/${inv.id}`))) && loadPending());
        return el('div', { className: 'fr-row is-offline' }, deps.avatar(inv), el('div', { className: 'grow fr-names' }, el('b', { textContent: inv.name }), el('small', { className: 'muted', textContent: t('czeka na odpowiedź') })), cancel);
      }));
    };
    const go = async () => {
      if (!handle.value.trim()) return;
      if (await act(() => api.socialApi('POST', `/v1/communities/${c.id}/invites`, { handle: handle.value.trim() }), t('Wysłano zaproszenie.'))) {
        handle.value = '';
        void loadPending();
      }
    };
    send.addEventListener('click', go);
    handle.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    void loadPending();
    return [el('h3', { textContent: t('Zaproś do społeczności') }), el('div', { className: 'row' }, handle, send), pending];
  }

  function banWindow(c: Community, m: Person, done: () => void) {
    const reason = control<HTMLInputElement>('input', { placeholder: t('Powód (widzą go moderatorzy)'), maxLength: 200 });
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const go = el('button', { type: 'button', className: 'danger' }, icon('fa-ban'), t(' Zbanuj'));
    const close = modalWindow(t('Zbanować {0}?', m.name), [el('p', { className: 'muted', textContent: t('Wypadnie ze społeczności i nie wróci (ani na prośbę, ani z zaproszenia), dopóki nie zdejmiesz bana.') }), reason], [cancel, go], undefined, 'fr-group-modal fr-com-modal');
    cancel.addEventListener('click', close);
    go.addEventListener('click', async () => {
      if (await act(() => api.socialApi('POST', `/v1/communities/${c.id}/bans`, { user: m.id, reason: reason.value.trim() }), t('Zbanowano {0}.', m.name))) {
        close();
        done();
      }
    });
  }

  function requestsWindow(c: Community) {
    const rows = el('div', { className: 'fr-clan-members' });
    const load = async () => {
      const res = await act(() => api.socialApi('GET', `/v1/communities/${c.id}/requests`));
      if (!res) return;
      rows.replaceChildren(...(res.requests as (Person & { at: number })[]).map((r) => {
        const accept = el('button', { type: 'button', className: 'icon-btn primary', title: t('Przyjmij') }, icon('fa-check'));
        const decline = el('button', { type: 'button', className: 'icon-btn', title: t('Odrzuć') }, icon('fa-xmark'));
        accept.addEventListener('click', async () => (await act(() => api.socialApi('POST', `/v1/communities/${c.id}/requests/${r.id}/accept`), t('Przyjęto {0}.', r.name))) && load());
        decline.addEventListener('click', async () => (await act(() => api.socialApi('POST', `/v1/communities/${c.id}/requests/${r.id}/decline`))) && load());
        return el('div', { className: 'fr-row' }, deps.avatar(r), el('div', { className: 'grow fr-names' }, el('b', { textContent: r.name }), el('small', { className: 'muted', textContent: `@${r.handle} · ${new Date(r.at).toLocaleDateString(locale())}` })), accept, decline);
      }));
      if (!rows.childElementCount) rows.append(el('p', { className: 'muted fr-empty', textContent: t('Nikt nie czeka.') }));
    };
    modalWindow(t('Prośby o dołączenie'), [rows], [], () => void refresh(), 'fr-group-modal fr-com-modal');
    void load();
  }

  function reportsWindow(c: Community) {
    const rows = el('div', { className: 'fr-clan-members' });
    const show = (reports: any[]) => {
      rows.replaceChildren(...reports.map((r) => {
        const dismiss = el('button', { type: 'button' }, icon('fa-check'), t(' Odrzuć'));
        const remove = el('button', { type: 'button', className: 'danger', disabled: !r.message.current || r.message.current.deleted }, icon('fa-trash'), t(' Usuń wiadomość'));
        const resolve = async (action: string) => {
          const res = await act(() => api.socialApi('POST', `/v1/communities/${c.id}/reports/${r.id}/resolve`, { action }));
          if (res) show(res.reports);
        };
        dismiss.addEventListener('click', () => void resolve('dismiss'));
        remove.addEventListener('click', () => void resolve('delete'));
        return el('div', { className: 'fr-com-report' },
          el('blockquote', { className: 'fr-quote', textContent: `${r.message.author?.name ?? '?'}: ${r.message.text}` }),
          el('small', { className: 'muted', textContent: t('Zgłasza {0}{1}: {2}', r.reporter.name, r.count > 1 ? t(' (i {0} innych)', r.count - 1) : '', r.reason || t('bez powodu')) }),
          el('div', { className: 'row' }, dismiss, remove));
      }));
      if (!rows.childElementCount) rows.append(el('p', { className: 'muted fr-empty', textContent: t('Brak zgłoszeń.') }));
    };
    modalWindow(t('Zgłoszenia wiadomości'), [el('p', { className: 'muted', textContent: t('Zgłoszenia widzą też administratorzy SlashClient.') }), rows], [], () => void refresh(), 'fr-group-modal fr-com-modal');
    void act(() => api.socialApi('GET', `/v1/communities/${c.id}/reports`)).then((res) => res && show(res.reports));
  }

  function settingsWindow(c: Community) {
    const body: Node[] = [];
    let close = () => {};
    if (communityMay(c.role, 'edit')) {
      const f = settingsFields(c);
      const save = el('button', { type: 'button', className: 'primary' }, t('Zapisz'));
      save.addEventListener('click', async () => {
        if (await act(() => api.socialApi('POST', `/v1/communities/${c.id}/settings`, f.value()), t('Zapisano.'))) await refresh();
      });
      body.push(...f.nodes, el('div', { className: 'row fr-clan-leave' }, save), ...logoSection(c, () => {
        close();
        const fresh = community(c.id);
        if (fresh) settingsWindow(fresh);
      }));
    }
    if (communityMay(c.role, 'ban', 'member')) {
      const bans = el('div', { className: 'fr-clan-members' });
      const loadBans = async () => {
        const res = await api.socialApi('GET', `/v1/communities/${c.id}/bans`).catch(() => undefined);
        bans.replaceChildren(...(res?.bans ?? []).map((b: Person & { reason: string; at: number }) => {
          const lift = el('button', { type: 'button', className: 'icon-btn', title: t('Zdejmij bana') }, icon('fa-unlock'));
          lift.addEventListener('click', async () => (await act(() => api.socialApi('DELETE', `/v1/communities/${c.id}/bans/${b.id}`), t('Zdjęto bana.'))) && loadBans());
          return el('div', { className: 'fr-row is-offline' }, deps.avatar(b), el('div', { className: 'grow fr-names' }, el('b', { textContent: b.name }), el('small', { className: 'muted', textContent: b.reason || new Date(b.at).toLocaleDateString(locale()) })), lift);
        }));
        if (!bans.childElementCount) bans.append(el('p', { className: 'muted fr-empty', textContent: t('Nikt nie ma bana.') }));
      };
      void loadBans();
      body.push(el('h3', { textContent: t('Bany') }), bans);
    }
    if (communityMay(c.role, 'log')) {
      const show = el('button', { type: 'button' }, icon('fa-clock-rotate-left'), t(' Dziennik moderacji'));
      show.addEventListener('click', () => void logWindow(c));
      body.push(el('div', { className: 'row' }, show));
    }
    if (communityMay(c.role, 'delete')) {
      const remove = el('button', { type: 'button', className: 'danger' }, icon('fa-trash'), t(' Usuń społeczność'));
      remove.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: t('Usunąć „{0}”?', c.name), body: [el('p', { className: 'muted', textContent: t('Społeczność i cały jej czat znikną dla wszystkich {0} członków. Żeby odejść bez usuwania, najpierw przekaż ją komuś (Członkowie → korona).', c.members) })], ok: t('Usuń'), danger: true }))) return;
        const res = await act(() => api.socialApi('DELETE', `/v1/communities/${c.id}`));
        if (!res) return;
        close();
        open = undefined;
        take(res);
      });
      body.push(el('div', { className: 'row fr-clan-leave' }, remove));
    }
    close = modalWindow(t('Ustawienia: {0}', c.name), body, [], undefined, 'fr-group-modal fr-com-modal');
  }

  async function logWindow(c: Community) {
    const res = await act(() => api.socialApi('GET', `/v1/communities/${c.id}/log`));
    if (!res) return;
    const names: Record<string, string> = {
      create: t('zakłada społeczność'), join: t('dołącza'), accept: t('przyjmuje prośbę'), decline: t('odrzuca prośbę'), leave: t('odchodzi'), kick: t('wyrzuca'),
      ban: t('banuje'), unban: t('zdejmuje bana'), mute: t('wycisza'), unmute: t('zdejmuje wyciszenie'), role: t('zmienia rolę'), transfer: t('przekazuje społeczność'),
      invite: t('zaprasza'), edit: t('zmienia ustawienia'), logo: t('zmienia logo'), logo_remove: t('usuwa logo'), heir: t('przejmuje społeczność'),
      message_delete: t('usuwa wiadomość'), report_delete: t('usuwa zgłoszoną wiadomość'), report_dismiss: t('odrzuca zgłoszenie'),
    };
    const rows = (res.log as { at: number; byName: string; action: string; targetName: string; detail: string }[]).map((e) => el('div', { className: 'fr-com-log' },
      el('small', { className: 'muted', textContent: new Date(e.at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) }),
      el('span', {}, el('b', { textContent: e.byName || t('Administracja') }), ` ${names[e.action] ?? t('(administracja) {0}', e.action)} `, el('b', { textContent: e.targetName }), e.detail ? ` (${e.detail})` : '')));
    modalWindow(t('Dziennik moderacji'), [el('div', { className: 'fr-clan-members' }, ...rows)], [], undefined, 'fr-group-modal fr-com-modal');
  }

  /** The logo: the clans' pipeline (a square scaled to 64×64 here, checked again by the main process and the server). */
  function logoSection(c: Community, redraw: () => void): Node[] {
    const preview = communityAvatar(c, () => {
      deps.changed();
      preview.replaceWith(communityAvatar(c));
    });
    preview.classList.add('fr-clan-logo-preview');
    const file = control<HTMLInputElement>('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', className: 'hidden' });
    const change = el('button', { type: 'button' }, icon('fa-image'), c.logo ? t(' Zmień logo') : t(' Dodaj logo'));
    change.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const picked = file.files?.[0];
      file.value = '';
      if (!picked || !api.socialSetCommunityLogo) return;
      change.disabled = true;
      const png = await logoFromFile(picked).catch(() => undefined);
      if (!png) {
        change.disabled = false;
        return deps.toast(t('Nie udało się odczytać obrazka.'), true);
      }
      const res = await act(() => api.socialSetCommunityLogo!(c.id, png), t('Zapisano logo.'));
      change.disabled = false;
      if (res) {
        await refresh();
        redraw();
      }
    });
    const tools: Node[] = [change, file];
    if (c.logo) {
      const remove = el('button', { type: 'button', className: 'danger' }, icon('fa-trash'), t(' Usuń logo'));
      remove.addEventListener('click', async () => {
        if (await act(() => api.socialApi('DELETE', `/v1/communities/${c.id}/logo`))) {
          await refresh();
          redraw();
        }
      });
      tools.push(remove);
    }
    return [el('h3', { textContent: t('Logo') }), el('div', { className: 'row fr-clan-logo-row' }, preview, el('small', { className: 'muted grow', textContent: t('Kwadratowy obrazek, zmniejszany do 64×64.') }), ...tools)];
  }

  // ---------- live events ----------

  function onEvent(e: any): boolean {
    switch (e.type) {
      case 'communities':
        if (e.removed && open?.community === e.id) {
          open = undefined;
          deps.toast(t('Społeczność została usunięta.'), true);
        }
        void refresh();
        return true;
      case 'community-message': {
        const m: CommunityMessage = e.message;
        const c = community(m.community);
        if (!c) return true;
        addMessage(m);
        const seen = open?.channel === m.channel && deps.visible();
        if (seen) markRead();
        else if (shouldNotify(c, m, me())) {
          const title = `${c.name} · ${m.author.name}`;
          const text = m.text.length > 120 ? `${m.text.slice(0, 117)}…` : m.text;
          if (!document.hasFocus()) void api.notify?.(title, text, { view: 'friends' }).catch(() => undefined);
          else deps.toast(t('{0}: {1}', title, text));
        }
        deps.changed();
        return true;
      }
      case 'community-message-edit':
      case 'community-message-delete':
        if (e.message) replaced(e.message as CommunityMessage);
        return true;
      case 'community':
        if (e.invite) deps.toast(t('{0} zaprasza Cię do społeczności {1}.', e.invite.by?.name ?? '?', e.invite.name));
        if (e.accepted) deps.toast(t('Przyjęto Cię do społeczności {0}.', e.accepted.name));
        if (e.kicked) deps.toast(t('Usunięto Cię ze społeczności {0}.', e.kicked.name), true);
        if (e.banned) deps.toast(t('Zbanowano Cię w społeczności {0}.', e.banned.name), true);
        if (e.request) deps.toast(t('{0} prosi o dołączenie do {1}.', e.request.name, e.request.community));
        if (e.report) deps.toast(t('Nowe zgłoszenie wiadomości w społeczności.'));
        if ((e.kicked || e.banned) && open?.community === e.id) open = undefined;
        void refresh();
        return true;
    }
    return false;
  }

  return {
    refresh, sections, onEvent, renderChat, send, saveEdit, loadOlder, markRead, composerState,
    /** The composer let go of the message it was editing. */
    stopEditing: () => {
      if (editingId === undefined) return;
      editingId = undefined;
      renderMessages();
    },
    /** The open community's channel, if one is open (instead of a friend or a group). */
    active: () => (open && community(open.community) ? open : undefined),
    deselect: () => {
      open = undefined;
    },
    unread: () => communityBadge(list, invites.length),
    clear: () => {
      list = [];
      invites = [];
      requests = [];
      open = undefined;
      chats.clear();
    },
  };
}
