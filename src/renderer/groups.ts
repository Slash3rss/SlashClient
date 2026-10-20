import { locale, t } from '../shared/i18n';
import { confirmDialog, control, el, icon } from './dialog';

/**
 * Group chats and clans in the Friends view. Groups are conversations with several friends
 * (encrypted by the main process like direct messages); a clan is a group of players with a tag
 * shown next to their nick, and its own chat (one of the groups). This module adds their rows to
 * the friends list, draws an open group's conversation into the chat panel, and has the windows
 * for making a group or a clan and managing a clan.
 */

interface Person { id: string; handle: string; name: string; avatar: string }
export interface GroupEvent { kind: 'created' | 'added' | 'removed' | 'left' | 'renamed' | 'joined' | 'promoted' | 'demoted' | 'owner' | 'heir'; by: string; users?: string[]; name?: string }
/** A picture in a message, as the main process opened it (no key here: the page gets it by id). */
export interface GroupImage { id: string; w?: number; h?: number; size?: number; unreadable?: boolean }
export interface GroupMessage { id: number; group: string; from: string; text: string; at: number; event?: GroupEvent; encrypted?: boolean; unreadable?: boolean; image?: GroupImage }
export interface Group {
  id: string; name: string; owner: string; createdAt: number; clan?: { id: string; tag: string };
  members: (Person & { joinedAt: number })[]; unread: number; lastMessageAt: number;
}
export type ClanRole = 'owner' | 'officer' | 'member';
export interface ClanMember extends Person { role: ClanRole; joinedAt: number; status: string; online: boolean }
export interface Clan {
  id: string; tag: string; name: string; createdAt: number; chat: string; role: ClanRole;
  members: ClanMember[]; invites?: (Person & { at: number })[];
}
export interface ClanInvite { clan: { id: string; tag: string; name: string; members: number }; by: Person; at: number }

export const GROUP_SIZE = 16;
const MAX_MESSAGE = 2000;
const PAGE = 50;

/** The line a group event shows in the chat. */
export function eventText(e: GroupEvent): string {
  const users = (e.users ?? []).join(', ');
  switch (e.kind) {
    case 'created': return t('{0} tworzy grupę „{1}”', e.by, e.name ?? '');
    case 'added': return t('{0} dodaje: {1}', e.by, users);
    case 'removed': return t('{0} usuwa: {1}', e.by, users);
    case 'left': return t('{0} opuszcza grupę', e.by);
    case 'joined': return t('{0} dołącza do klanu', e.by);
    case 'renamed': return t('{0} zmienia nazwę na „{1}”', e.by, e.name ?? '');
    case 'promoted': return t('{0} awansuje {1} na oficera', e.by, users);
    case 'demoted': return t('{0} degraduje {1} do członka', e.by, users);
    case 'owner': return t('{0} przekazuje klan: {1} jest teraz założycielem', e.by, users);
    case 'heir': return t('{0} zostaje założycielem klanu', e.by);
    default: return e.by;
  }
}

/** Who may do what in a clan (the server checks it again): the same rules as clans.ts. */
export function clanMay(role: ClanRole | undefined, action: 'invite' | 'kick' | 'setRole' | 'rename' | 'delete' | 'transfer', target?: ClanRole): boolean {
  if (!role) return false;
  if (action === 'invite') return role !== 'member';
  if (action === 'kick') return target !== undefined && target !== 'owner' && (role === 'owner' || (role === 'officer' && target === 'member'));
  if (action === 'setRole' || action === 'transfer') return role === 'owner' && target !== undefined && target !== 'owner';
  return role === 'owner';
}

/** A tag as the server takes it: 2–5 letters or digits. */
export const validTag = (tag: string) => /^[A-Za-z0-9]{2,5}$/.test(tag);

/** The groups list after a new message: that group goes to the top, unread grows unless it is open (or ours). */
export function applyGroupMessage(groups: Group[], m: GroupMessage, me: string | undefined, open: string | undefined): Group[] {
  const g = groups.find((x) => x.id === m.group);
  if (!g) return groups;
  const next = { ...g, lastMessageAt: m.at, unread: m.from === me || m.group === open || m.event ? g.unread : g.unread + 1 };
  return [next, ...groups.filter((x) => x.id !== m.group)];
}

export const roleText = (r: ClanRole) => ({ owner: t('Założyciel'), officer: t('Oficer'), member: t('Członek') })[r];

interface Deps {
  api: { socialApi: (method: string, path: string, body?: unknown) => Promise<any>; socialSendGroupImage?: (groupId: string) => Promise<any>; notify?: (title: string, body: string, target?: unknown) => Promise<unknown> };
  /** A picture's card, the same as in direct messages. */
  imageCard: (image: GroupImage, mine: boolean) => HTMLElement;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  me: () => string | undefined;
  friends: () => { id: string; name: string; online: boolean }[];
  /** The avatar the friends list draws. */
  avatar: (p: Person, presence?: { status: string }) => HTMLElement;
  /** The friends list and the chat panel should be drawn again. */
  changed: () => void;
  /** A group was opened: the friends list lets go of its conversation. */
  opened: () => void;
  /** Whether the Friends view is in front (new messages are read at once). */
  visible: () => boolean;
}

export function createGroups(deps: Deps) {
  const { api } = deps;
  let groups: Group[] = [];
  let clan: Clan | null = null;
  let invites: ClanInvite[] = [];
  let open: string | undefined;
  const chats = new Map<string, { messages: GroupMessage[]; more: boolean; loading: boolean }>();
  let parts: { head: HTMLElement; messages: HTMLElement; typing: HTMLElement } | undefined;

  const group = (id: string | undefined) => groups.find((g) => g.id === id);

  async function refresh() {
    try {
      groups = (await api.socialApi('GET', '/v1/groups')).groups ?? [];
      const mine = await api.socialApi('GET', '/v1/clans/mine');
      clan = mine.clan ?? null;
      invites = mine.invites ?? [];
    } catch {
      // an older server has neither: nothing to show
      groups = [];
      clan = null;
      invites = [];
    }
    if (open && !group(open)) open = undefined;
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

  /** The clan answer (`{ clan, invites }`) most clan calls return. */
  function takeClan(res: { clan?: Clan | null; invites?: ClanInvite[] } | undefined) {
    if (!res) return;
    clan = res.clan ?? null;
    invites = res.invites ?? [];
    deps.changed();
  }

  // ---------- the rows in the friends list ----------

  function groupAvatar(g: Group) {
    const box = el('div', { className: `fr-avatar fr-group-avatar${g.clan ? ' clan' : ''}` });
    if (g.clan) box.append(el('span', { className: 'fr-clan-mark', textContent: g.clan.tag }));
    else box.append(icon('fa-users'));
    return box;
  }

  function groupRow(g: Group) {
    const names = g.members.filter((m) => m.id !== deps.me()).map((m) => m.name);
    const sub = g.clan && clan ? t('{0}/{1} online', clan.members.filter((m) => m.online).length, clan.members.length) : names.join(', ');
    const row = el('button', { type: 'button', className: `fr-row fr-group${g.id === open ? ' selected' : ''}` },
      groupAvatar(g),
      el('div', { className: 'grow fr-names' }, el('b', { textContent: g.clan ? clan?.name ?? g.name : g.name }), el('small', { className: 'muted', textContent: sub })),
      g.unread ? el('span', { className: 'fr-unread', textContent: String(g.unread) }) : '');
    row.addEventListener('click', () => void select(g.id));
    return row;
  }

  /** The clan (or the invites to one, or a button to found one) and the groups, for the friends list. */
  function sections(): Node[] {
    const out: Node[] = [];
    const clanBtn = el('button', { type: 'button', className: 'icon-btn fr-section-btn', title: clan ? t('Zarządzaj klanem') : t('Załóż klan') }, icon(clan ? 'fa-gear' : 'fa-plus'));
    clanBtn.addEventListener('click', () => (clan ? openClan() : createClan()));
    out.push(el('div', { className: 'fr-section fr-section-row' }, el('span', { textContent: t('Klan') }), clanBtn));
    for (const inv of invites) {
      const accept = el('button', { type: 'button', className: 'icon-btn primary', title: t('Dołącz') }, icon('fa-check'));
      const decline = el('button', { type: 'button', className: 'icon-btn', title: t('Odrzuć') }, icon('fa-xmark'));
      accept.addEventListener('click', async () => {
        takeClan(await act(() => api.socialApi('POST', `/v1/clans/${inv.clan.id}/accept`), t('Dołączono do klanu [{0}].', inv.clan.tag)));
        await refresh();
      });
      decline.addEventListener('click', async () => takeClan(await act(() => api.socialApi('POST', `/v1/clans/${inv.clan.id}/decline`))));
      out.push(el('div', { className: 'fr-row' },
        el('div', { className: 'fr-avatar fr-group-avatar clan' }, el('span', { className: 'fr-clan-mark', textContent: inv.clan.tag })),
        el('div', { className: 'grow fr-names' }, el('b', { textContent: inv.clan.name }), el('small', { className: 'muted', textContent: t('{0} zaprasza do klanu', inv.by.name) })),
        accept, decline));
    }
    const clanChat = clan ? group(clan.chat) : undefined;
    if (clanChat) out.push(groupRow(clanChat));
    else if (!invites.length) out.push(el('p', { className: 'muted fr-empty', textContent: t('Nie jesteś w klanie. Załóż własny albo poczekaj na zaproszenie.') }));
    const plain = groups.filter((g) => !g.clan);
    const add = el('button', { type: 'button', className: 'icon-btn fr-section-btn', title: t('Nowa grupa') }, icon('fa-plus'));
    add.addEventListener('click', () => pickFriends());
    out.push(el('div', { className: 'fr-section fr-section-row' }, el('span', { textContent: t('Grupy') }), add));
    if (!plain.length) out.push(el('p', { className: 'muted fr-empty', textContent: t('Rozmowa z kilkoma znajomymi naraz: kliknij +.') }));
    out.push(...plain.map(groupRow));
    return out;
  }

  // ---------- the conversation ----------

  async function select(id: string) {
    open = id;
    deps.opened();
    deps.changed();
    if (!chats.has(id)) await loadOlder();
    markRead();
  }

  async function loadOlder() {
    const id = open;
    if (!id) return;
    const chat = chats.get(id) ?? { messages: [], more: true, loading: false };
    chats.set(id, chat);
    if (chat.loading || !chat.more) return;
    chat.loading = true;
    try {
      const before = chat.messages[0]?.id;
      const { messages }: { messages: GroupMessage[] } = await api.socialApi('GET', `/v1/groups/${id}/messages?limit=${PAGE}${before ? `&before=${before}` : ''}`);
      chat.messages = [...messages, ...chat.messages];
      chat.more = messages.length === PAGE;
      if (id === open && parts) {
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
    const g = group(open);
    if (!g || !g.unread) return;
    g.unread = 0;
    deps.changed();
    void api.socialApi('POST', `/v1/groups/${g.id}/read`).catch(() => {});
  }

  async function send(text: string): Promise<boolean> {
    const id = open;
    if (!id || !text.trim()) return false;
    if (text.length > MAX_MESSAGE) return (deps.toast(t('Wiadomość jest za długa (maks. {0} znaków).', MAX_MESSAGE), true), false);
    const res = await act(() => api.socialApi('POST', `/v1/groups/${id}/messages`, { text }));
    if (res?.message) addMessage(res.message);
    return !!res;
  }

  /** A picture to the open group (the main process asks for the file, encrypts and sends it). */
  async function sendPicture(): Promise<void> {
    const id = open;
    if (!id || !api.socialSendGroupImage) return;
    const res = await act(() => api.socialSendGroupImage!(id));
    if (res?.message) addMessage(res.message);
  }

  function addMessage(m: GroupMessage) {
    const chat = chats.get(m.group);
    if (chat && !chat.messages.some((x) => x.id === m.id)) chat.messages.push(m);
    groups = applyGroupMessage(groups, m, deps.me(), deps.visible() ? open : undefined);
    if (m.group === open && parts) {
      const box = parts.messages;
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      renderMessages();
      if (atBottom || m.from === deps.me()) box.scrollTop = box.scrollHeight;
    }
  }

  function renderChat(head: HTMLElement, messages: HTMLElement, typing: HTMLElement) {
    parts = { head, messages, typing };
    const g = group(open);
    if (!g) return;
    typing.textContent = '';
    const actions: Node[] = [];
    if (g.clan) {
      const manage = el('button', { type: 'button', className: 'icon-btn', title: t('Członkowie klanu') }, icon('fa-users'));
      manage.addEventListener('click', () => openClan());
      actions.push(manage);
    } else {
      const add = el('button', { type: 'button', className: 'icon-btn', title: t('Dodaj znajomych') }, icon('fa-user-plus'));
      add.addEventListener('click', () => pickFriends(g));
      const rename = el('button', { type: 'button', className: 'icon-btn', title: t('Zmień nazwę') }, icon('fa-pen'));
      rename.addEventListener('click', () => renameGroup(g));
      const leave = el('button', { type: 'button', className: 'icon-btn danger', title: t('Opuść grupę') }, icon('fa-right-from-bracket'));
      leave.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: t('Opuścić grupę „{0}”?', g.name), body: [el('p', { className: 'muted', textContent: t('Nie zobaczysz już nowych wiadomości. Ktoś może Cię dodać ponownie.') })], ok: t('Opuść'), danger: true }))) return;
        if (await act(() => api.socialApi('POST', `/v1/groups/${g.id}/leave`))) {
          open = undefined;
          chats.delete(g.id);
          await refresh();
        }
      });
      actions.push(add, rename, leave);
    }
    const others = g.members.filter((m) => m.id !== deps.me());
    const subtitle = g.clan && clan
      ? t('[{0}] · {1}/{2} online', clan.tag, clan.members.filter((m) => m.online).length, clan.members.length)
      : t('Członkowie ({0}): {1}', g.members.length, others.map((m) => m.name).join(', '));
    head.replaceChildren(groupAvatar(g),
      el('div', { className: 'grow fr-names' }, el('b', { textContent: g.clan && clan ? clan.name : g.name }), el('small', { className: 'muted', textContent: subtitle })),
      ...actions);
    renderMessages();
  }

  function renderMessages() {
    if (!parts) return;
    const box = parts.messages;
    const chat = open ? chats.get(open) : undefined;
    const g = group(open);
    if (!chat || !g) return box.replaceChildren(el('div', { className: 'fr-placeholder' }, el('span', { className: 'spinner' })));
    const me = deps.me();
    const names = new Map(g.members.map((m) => [m.id, m.name]));
    const nodes: Node[] = [];
    if (!chat.messages.length) nodes.push(el('div', { className: 'fr-placeholder' }, icon('fa-users'), el('p', { className: 'muted', textContent: t('Napisz pierwszą wiadomość do grupy.') })));
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
      if (m.event) {
        nodes.push(el('div', { className: 'fr-event', textContent: eventText(m.event), title: new Date(m.at).toLocaleString(locale()) }));
        lastFrom = '';
        continue;
      }
      const mine = m.from === me;
      const grouped = m.from === lastFrom && m.at - lastAt < 5 * 60_000;
      const bubble = m.image ? deps.imageCard(m.image, mine) : el('div', { className: `fr-bubble${m.unreadable ? ' unreadable' : ''}`, textContent: m.text });
      if (m.encrypted && !m.image) bubble.append(el('i', { className: 'fa-solid fa-lock fr-lock', title: t('Zaszyfrowana od nadawcy do odbiorcy') }));
      nodes.push(el('div', { className: `fr-msg${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`, title: new Date(m.at).toLocaleString(locale()) },
        bubble,
        grouped ? '' : el('small', { className: 'fr-time', textContent: mine ? time.format(m.at) : `${names.get(m.from) ?? '?'} · ${time.format(m.at)}` })));
      lastFrom = m.from;
      lastAt = m.at;
    }
    box.replaceChildren(...nodes);
  }

  // ---------- windows ----------

  /** A small window of our own (the launcher's modal look); resolves when it closes. */
  function modal(title: string, body: Node[], buttons: HTMLButtonElement[], onClose?: () => void) {
    const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
    const box = el('div', { className: 'modal' },
      el('div', { className: 'modal-box glass-panel join-box fr-group-modal' }, close,
        el('div', { className: 'modal-body' }, el('h2', { textContent: title }), ...body, buttons.length ? el('div', { className: 'row join-actions' }, ...buttons) : '')));
    const done = () => {
      box.remove();
      document.removeEventListener('keydown', onKey, true);
      onClose?.();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done();
      }
    };
    close.addEventListener('click', done);
    box.addEventListener('click', (e) => e.target === box && done());
    document.addEventListener('keydown', onKey, true);
    document.body.append(box);
    return done;
  }

  /** A new group (name and friends), or more friends for `into`. */
  function pickFriends(into?: Group) {
    const inside = new Set(into?.members.map((m) => m.id) ?? []);
    const friends = deps.friends().filter((f) => !inside.has(f.id));
    const max = GROUP_SIZE - (into ? into.members.length : 1);
    const name = control<HTMLInputElement>('input', { placeholder: t('Nazwa grupy'), maxLength: 32 });
    const checks = friends.map((f) => ({ f, box: control<HTMLInputElement>('input', { type: 'checkbox', value: f.id }) }));
    const counter = el('small', { className: 'muted' });
    const update = () => {
      const n = checks.filter((c) => c.box.checked).length;
      counter.textContent = t('{0} z {1}', n, max);
      for (const c of checks) c.box.disabled = !c.box.checked && n >= max;
    };
    checks.forEach((c) => c.box.addEventListener('change', update));
    update();
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const go = el('button', { type: 'button', className: 'primary' }, icon(into ? 'fa-user-plus' : 'fa-users'), into ? t(' Dodaj') : t(' Utwórz grupę'));
    const done = modal(into ? t('Dodaj do „{0}”', into.name) : t('Nowa grupa'), [
      ...(into ? [] : [name]),
      el('p', { className: 'muted', textContent: t('Tylko znajomi. Każdy w grupie widzi wiadomości od chwili dołączenia; są szyfrowane jak rozmowy prywatne.') }),
      el('div', { className: 'fr-party-pick fr-group-pick' }, ...(checks.length ? checks.map(({ f, box }) => el('label', { className: f.online ? '' : 'is-offline' }, box, f.name))
        : [el('small', { className: 'muted', textContent: into ? t('Wszyscy Twoi znajomi już tu są.') : t('Nie masz jeszcze znajomych.') })])),
      counter,
    ], [cancel, go]);
    cancel.addEventListener('click', done);
    go.addEventListener('click', async () => {
      const members = checks.filter((c) => c.box.checked).map((c) => c.f.id);
      if (!members.length) return deps.toast(t('Wybierz przynajmniej jednego znajomego.'), true);
      if (!into && !name.value.trim()) return deps.toast(t('Wpisz nazwę grupy.'), true);
      go.disabled = true;
      const res = await act(() => into ? api.socialApi('POST', `/v1/groups/${into.id}/members`, { members }) : api.socialApi('POST', '/v1/groups', { name: name.value.trim(), members }));
      go.disabled = false;
      if (!res?.group) return;
      done();
      groups = [res.group, ...groups.filter((g) => g.id !== res.group.id)];
      void select(res.group.id);
    });
    (into ? checks[0]?.box : name)?.focus();
  }

  function renameGroup(g: Group) {
    const name = control<HTMLInputElement>('input', { value: g.name, maxLength: 32 });
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const go = el('button', { type: 'button', className: 'primary' }, t('Zapisz'));
    const done = modal(t('Nazwa grupy'), [name], [cancel, go]);
    cancel.addEventListener('click', done);
    const save = async () => {
      const res = await act(() => api.socialApi('POST', `/v1/groups/${g.id}/name`, { name: name.value.trim() }));
      if (res?.group) {
        done();
        await refresh();
      }
    };
    go.addEventListener('click', save);
    name.addEventListener('keydown', (e) => e.key === 'Enter' && save());
    name.focus();
    name.select();
  }

  /** Tag and name fields, for founding a clan or renaming it. */
  function clanFields(tag = '', name = '') {
    const tagInput = control<HTMLInputElement>('input', { placeholder: t('Tag, np. WOLF'), value: tag, maxLength: 5, className: 'fr-tag-input' });
    const nameInput = control<HTMLInputElement>('input', { placeholder: t('Nazwa klanu'), value: name, maxLength: 32 });
    const preview = el('small', { className: 'muted' });
    const update = () => {
      tagInput.value = tagInput.value.replace(/[^A-Za-z0-9]/g, '');
      preview.textContent = validTag(tagInput.value) ? t('Tak zobaczą Cię inni: [{0}] Twój nick', tagInput.value) : t('Tag: 2–5 liter lub cyfr, bez spacji.');
    };
    tagInput.addEventListener('input', update);
    update();
    return { tagInput, nameInput, row: el('div', { className: 'row fr-clan-fields' }, tagInput, nameInput), preview };
  }

  function createClan() {
    const f = clanFields();
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const go = el('button', { type: 'button', className: 'primary' }, icon('fa-shield-halved'), t(' Załóż klan'));
    const done = modal(t('Nowy klan'), [
      el('p', { className: 'muted', textContent: t('Tag klanu widać przy Twoim nicku w launcherze, a w grze na liście graczy i nad głową u graczy ze SlashClient. Do klanu dołącza się na zaproszenie.') }),
      f.row, f.preview,
    ], [cancel, go]);
    cancel.addEventListener('click', done);
    go.addEventListener('click', async () => {
      if (!validTag(f.tagInput.value)) return deps.toast(t('Tag: 2–5 liter lub cyfr, bez spacji.'), true);
      go.disabled = true;
      const res = await act(() => api.socialApi('POST', '/v1/clans', { tag: f.tagInput.value, name: f.nameInput.value.trim() }), t('Klan założony.'));
      go.disabled = false;
      if (!res) return;
      done();
      takeClan(res);
      await refresh();
      if (clan) void select(clan.chat);
    });
    f.tagInput.focus();
  }

  /** The clan window: members (online first within each role), invites, and what the role allows. */
  function openClan() {
    if (!clan) return;
    let done: () => void = () => {};
    const draw = () => {
      done();
      if (clan) done = clanWindow(clan, draw);
    };
    draw();
  }

  function clanWindow(c: Clan, redraw: () => void): () => void {
    const me = deps.me();
    const call = async (method: string, path: string, body?: unknown, ok?: string) => {
      const res = await act(() => api.socialApi(method, path, body), ok);
      if (res) {
        takeClan(res);
        redraw();
      }
    };
    const members = el('div', { className: 'fr-clan-members' });
    const sorted = [...c.members].sort((a, b) => Number(b.online) - Number(a.online));
    const order: ClanRole[] = ['owner', 'officer', 'member'];
    sorted.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    for (const m of sorted) {
      const buttons: Node[] = [];
      if (m.id !== me && clanMay(c.role, 'setRole', m.role)) {
        const promote = el('button', { type: 'button', className: 'icon-btn', title: m.role === 'officer' ? t('Odbierz oficera') : t('Mianuj oficerem') }, icon(m.role === 'officer' ? 'fa-angles-down' : 'fa-angles-up'));
        promote.addEventListener('click', () => call('POST', `/v1/clans/members/${m.id}/role`, { role: m.role === 'officer' ? 'member' : 'officer' }));
        const crown = el('button', { type: 'button', className: 'icon-btn', title: t('Przekaż klan') }, icon('fa-crown'));
        crown.addEventListener('click', async () => {
          if (await confirmDialog({ title: t('Przekazać klan {0}?', m.name), body: [el('p', { className: 'muted', textContent: t('{0} zostanie założycielem, a Ty oficerem.', m.name) })], ok: t('Przekaż') })) await call('POST', '/v1/clans/owner', { user: m.id });
        });
        buttons.push(promote, crown);
      }
      if (m.id !== me && clanMay(c.role, 'kick', m.role)) {
        const kick = el('button', { type: 'button', className: 'icon-btn danger', title: t('Wyrzuć z klanu') }, icon('fa-user-minus'));
        kick.addEventListener('click', async () => {
          if (await confirmDialog({ title: t('Wyrzucić {0} z klanu?', m.name), body: [], ok: t('Wyrzuć'), danger: true })) await call('DELETE', `/v1/clans/members/${m.id}`);
        });
        buttons.push(kick);
      }
      members.append(el('div', { className: `fr-row${m.online ? '' : ' is-offline'}` }, deps.avatar(m, { status: m.status }),
        el('div', { className: 'grow fr-names' }, el('b', { textContent: m.id === me ? t('{0} (Ty)', m.name) : m.name }),
          el('small', { className: `muted fr-role-${m.role}`, textContent: `${roleText(m.role)} · ${m.online ? t('online') : t('offline')}` })),
        ...buttons));
    }
    const body: Node[] = [
      el('p', { className: 'muted', textContent: t('{0}/{1} online · klan od {2}', c.members.filter((m) => m.online).length, c.members.length, new Date(c.createdAt).toLocaleDateString(locale())) }),
      members,
    ];
    if (clanMay(c.role, 'invite')) {
      const handle = control<HTMLInputElement>('input', { placeholder: t('Nick gracza'), maxLength: 32 });
      const invite = el('button', { type: 'button', className: 'primary' }, icon('fa-paper-plane'), t(' Zaproś'));
      const go = () => handle.value.trim() && call('POST', '/v1/clans/invites', { handle: handle.value.trim() }, t('Wysłano zaproszenie do klanu.'));
      invite.addEventListener('click', go);
      handle.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      body.push(el('h3', { textContent: t('Zaproś do klanu') }), el('div', { className: 'row' }, handle, invite));
      for (const inv of c.invites ?? []) {
        const cancel = el('button', { type: 'button', className: 'icon-btn', title: t('Anuluj zaproszenie') }, icon('fa-xmark'));
        cancel.addEventListener('click', () => call('DELETE', `/v1/clans/invites/${inv.id}`));
        body.push(el('div', { className: 'fr-row is-offline' }, deps.avatar(inv), el('div', { className: 'grow fr-names' }, el('b', { textContent: inv.name }), el('small', { className: 'muted', textContent: t('czeka na odpowiedź') })), cancel));
      }
    }
    if (clanMay(c.role, 'rename')) {
      const f = clanFields(c.tag, c.name);
      const save = el('button', { type: 'button' }, t('Zapisz'));
      save.addEventListener('click', () => call('POST', '/v1/clans/rename', { tag: f.tagInput.value, name: f.nameInput.value.trim() }, t('Zapisano.')));
      body.push(el('h3', { textContent: t('Tag i nazwa') }), f.row, el('div', { className: 'row' }, f.preview, save));
    }
    const leave = el('button', { type: 'button', className: 'danger' }, icon(c.role === 'owner' ? 'fa-trash' : 'fa-right-from-bracket'), c.role === 'owner' ? t(' Usuń klan') : t(' Opuść klan'));
    leave.addEventListener('click', async () => {
      const owner = c.role === 'owner';
      const ok = await confirmDialog(owner
        ? { title: t('Usunąć klan [{0}]?', c.tag), body: [el('p', { className: 'muted', textContent: t('Klan i jego czat znikną dla wszystkich członków.') })], ok: t('Usuń klan'), danger: true }
        : { title: t('Opuścić klan [{0}]?', c.tag), body: [], ok: t('Opuść'), danger: true });
      if (!ok) return;
      const res = await act(() => api.socialApi(owner ? 'DELETE' : 'POST', owner ? '/v1/clans/mine' : '/v1/clans/leave'));
      if (!res) return;
      takeClan(res);
      closeWindow();
      if (open === c.chat) open = undefined;
      await refresh();
    });
    body.push(el('div', { className: 'row fr-clan-leave' }, leave));
    const closeWindow = modal(`[${c.tag}] ${c.name}`, body, []);
    return closeWindow;
  }

  // ---------- live events ----------

  /** Handles the events about groups and clans; false for the others. */
  function onEvent(e: any): boolean {
    switch (e.type) {
      case 'groups':
        if (e.id && open === e.id) chats.delete(e.id);
        void refresh().then(() => {
          if (e.id && open === e.id) void select(e.id);
        });
        return true;
      case 'group-message': {
        const m: GroupMessage = e.message;
        if (!group(m.group)) {
          void refresh();
          return true;
        }
        addMessage(m);
        if (m.from !== deps.me()) {
          if (m.group === open && deps.visible()) markRead();
          else if (!m.event) {
            const g = group(m.group)!;
            const who = g.members.find((x) => x.id === m.from)?.name ?? '?';
            const title = g.clan ? `[${g.clan.tag}] ${clan?.name ?? g.name}` : g.name;
            if (!document.hasFocus()) void api.notify?.(title, `${who}: ${m.text}`, { view: 'friends' }).catch(() => undefined);
            else deps.toast(t('{0} · {1}: {2}', title, who, m.text.length > 100 ? `${m.text.slice(0, 97)}…` : m.text));
          }
        }
        deps.changed();
        return true;
      }
      case 'clan':
        if (e.invite) deps.toast(t('{0} zaprasza Cię do klanu [{1}] {2}.', e.invite.by?.name ?? '?', e.invite.tag, e.invite.name));
        if (e.kicked) deps.toast(t('Usunięto Cię z klanu [{0}].', e.kicked.tag), true);
        void refresh();
        return true;
    }
    return false;
  }

  return {
    refresh,
    sections,
    onEvent,
    renderChat,
    send,
    sendPicture,
    loadOlder,
    markRead,
    /** The open group, if one is open (instead of a friend). */
    active: () => (open && group(open) ? open : undefined),
    deselect: () => {
      open = undefined;
    },
    unread: () => groups.reduce((n, g) => n + g.unread, 0) + invites.length,
    myTag: () => clan?.tag,
    clear: () => {
      groups = [];
      clan = null;
      invites = [];
      open = undefined;
      chats.clear();
    },
  };
}
