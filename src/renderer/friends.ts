import { locale, t } from '../shared/i18n';

/**
 * The "Friends" view: signing in to the social server, the friends list with live
 * statuses, friend requests and direct messages.
 */

type Status = 'online' | 'away' | 'busy' | 'invisible';
interface Activity { kind: 'launcher' | 'menu' | 'singleplayer' | 'server'; version?: string; server?: string; since?: number }
interface Presence { status: 'online' | 'away' | 'busy' | 'offline'; activity?: Activity; lastSeen?: number }
interface Person { id: string; handle: string; name: string; avatar: string }
interface Friend extends Person { presence: Presence; unread: number; lastMessageAt: number; since: number }
interface Request extends Person { at: number }
interface Me extends Person { showServer: boolean; providers: string[] }
interface Message { id: number; from: string; to: string; text: string; at: number; readAt: number | null }
interface SocialState { url: string; user?: Me; connected: boolean; status: Status }
interface FriendList { friends: Friend[]; incoming: Request[]; outgoing: Request[] }

export interface FriendsDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** Opens the usual "join server" window. */
  join: (address: string, version?: string) => void;
}

const MAX_MESSAGE = 2000;
const PROVIDERS: Record<string, string> = { discord: 'Discord', microsoft: 'Microsoft', google: 'Google', github: 'GitHub', dev: 'Test' };
const providerIcon = (p: string) => el('i', { className: p in PROVIDERS && p !== 'dev' ? `fa-brands fa-${p}` : 'fa-solid fa-flask' });
const PAGE = 50;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
/** Form controls: their prop types are too large for `el`'s inference. */
const control = <T extends HTMLElement>(tag: string, props: Record<string, unknown>) => Object.assign(document.createElement(tag), props) as unknown as T;
const icon = (name: string) => el('i', { className: `fa-solid ${name}` });

/** Error codes of the social server in the player's language. */
export function socialErrorText(code: string): string {
  const texts: Record<string, string> = {
    offline: t('Nie można połączyć się z serwerem znajomych.'),
    unauthorized: t('Sesja wygasła. Zaloguj się ponownie.'),
    not_found: t('Nie ma takiego gracza w SlashClient.'),
    self: t('Nie możesz zaprosić samego siebie.'),
    already_friends: t('Jesteście już znajomymi.'),
    not_friends: t('Możecie pisać tylko do znajomych.'),
    too_long: t('Wiadomość jest za długa (maks. {0} znaków).', MAX_MESSAGE),
    empty: t('Wiadomość jest pusta.'),
    rate_limited: t('Za szybko. Odczekaj chwilę.'),
    bad_name: t('Nick musi mieć 3–16 znaków: litery, cyfry lub _.'),
    provider_disabled: t('Ten sposób logowania jest wyłączony na serwerze.'),
    login_expired: t('Logowanie wygasło. Spróbuj ponownie.'),
    provider_denied: t('Logowanie zostało anulowane.'),
    provider_failed: t('Nie udało się potwierdzić logowania. Spróbuj ponownie.'),
    already_linked: t('To konto jest już połączone z innym kontem SlashClient.'),
    last_provider: t('To jedyny sposób logowania. Najpierw połącz inny.'),
    cancelled: t('Logowanie anulowane.'),
  };
  return texts[code] ?? t('Błąd serwera znajomych ({0}).', code);
}

export function createFriends(root: HTMLElement, badge: HTMLElement, deps: FriendsDeps) {
  const { api } = deps;
  let state: SocialState | undefined;
  let health: { providers: string[]; dev: boolean } | undefined;
  let healthError = false;
  let list: FriendList = { friends: [], incoming: [], outgoing: [] };
  let selected: string | undefined;
  const chats = new Map<string, { messages: Message[]; more: boolean; loading: boolean }>();
  const typing = new Map<string, ReturnType<typeof setTimeout>>();
  let lastTypingSent = 0;
  let signingIn = false;

  const isVisible = () => root.closest('.view')?.classList.contains('active') && document.hasFocus();
  const friend = (id: string | undefined) => list.friends.find((f) => f.id === id);

  // ---------- avatars: the picture from Discord, Google or GitHub, or a letter ----------

  function avatar(p: Person, presence?: Presence) {
    const box = el('div', { className: 'fr-avatar' });
    const dot = presence ? el('span', { className: `fr-dot ${presenceClass(presence)}` }) : undefined;
    const letter = el('span', { textContent: (p.name || p.handle).slice(0, 1).toUpperCase() });
    box.append(letter);
    if (/^https:\/\/(cdn\.discordapp\.com|lh3\.googleusercontent\.com|avatars\.githubusercontent\.com)\//.test(p.avatar)) {
      const img = el('img', { alt: '', src: p.avatar });
      img.onerror = () => img.replaceWith(letter);
      box.replaceChildren(img);
    }
    if (dot) box.append(dot);
    return box;
  }

  // ---------- statuses ----------

  const presenceClass = (p: Presence) => (p.status === 'offline' ? 'offline' : p.activity && p.activity.kind !== 'launcher' ? 'ingame' : p.status);

  function ago(at: number): string {
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    const s = (at - Date.now()) / 1000;
    for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
      if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
    }
    return t('przed chwilą');
  }

  function statusLine(p: Presence): string {
    if (p.status === 'offline') return p.lastSeen ? t('Offline · {0}', ago(p.lastSeen)) : t('Offline');
    const a = p.activity;
    const version = a?.version ? `Minecraft ${a.version}` : 'Minecraft';
    if (a?.kind === 'server') return a.server ? t('{0} · na {1}', version, a.server) : t('{0} · na serwerze', version);
    if (a?.kind === 'singleplayer') return t('{0} · gra jednoosobowa', version);
    if (a?.kind === 'menu') return t('{0} · w menu', version);
    return { online: t('Dostępny w launcherze'), away: t('Zaraz wracam'), busy: t('Nie przeszkadzać') }[p.status];
  }

  /** In game first, then online, then by name. */
  function rank(f: Friend) {
    const c = presenceClass(f.presence);
    return c === 'ingame' ? 0 : c === 'online' ? 1 : c === 'offline' ? 3 : 2;
  }

  // ---------- loading ----------

  async function refreshState() {
    state = await api.socialState();
    health = await api.socialHealth().catch(() => undefined);
    healthError = !health;
    if (state?.user) await refreshList();
    render();
  }

  async function refreshList() {
    try {
      list = await api.socialApi('GET', '/v1/friends');
    } catch (err) {
      if (!String((err as Error).message).includes('social:offline')) deps.toast(deps.errorText(err), true);
    }
    updateBadge();
  }

  function updateBadge() {
    const n = list.friends.reduce((sum, f) => sum + f.unread, 0) + list.incoming.length;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.toggle('hidden', !n || !state?.user);
  }

  // ---------- rendering ----------

  function render() {
    if (!state?.user) return renderSignIn();
    if (!root.querySelector('.fr-layout')) buildLayout();
    renderMe();
    renderList();
    renderChat();
  }

  function renderSignIn() {
    const card = el('div', { className: 'card glass-panel fr-signin' },
      el('h3', {}, icon('fa-user-group'), t(' Znajomi w SlashClient')),
      el('p', { className: 'muted', textContent: t('Zaloguj się, żeby dodawać znajomych, widzieć, w co grają, i pisać do nich prosto z launchera. To osobne konto SlashClient: nie zmienia kont Minecraft, którymi grasz.') }));
    if (healthError) {
      const retry = el('button', { type: 'button' }, icon('fa-rotate-right'), t(' Spróbuj ponownie'));
      retry.addEventListener('click', () => refreshState());
      card.append(el('p', { className: 'fr-error', textContent: t('Serwer znajomych ({0}) jest niedostępny. Adres możesz zmienić w Ustawieniach.', state?.url ?? '') }), el('div', { className: 'row' }, retry));
      root.replaceChildren(card);
      return;
    }
    const buttons = el('div', { className: 'fr-providers' });
    if (signingIn) {
      const cancel = el('button', { type: 'button', textContent: t('Anuluj') });
      cancel.addEventListener('click', () => api.socialCancelLogin());
      buttons.append(el('p', { className: 'muted' }, el('span', { className: 'spinner' }), t(' Dokończ logowanie w przeglądarce…')), cancel);
    } else {
      for (const provider of health?.providers ?? []) {
        const b = el('button', { type: 'button', className: `primary fr-${provider}` }, providerIcon(provider), t(' Zaloguj przez {0}', PROVIDERS[provider] ?? provider));
        b.addEventListener('click', () => signIn(() => api.socialLoginOAuth(provider)));
        buttons.append(b);
      }
      if (health?.dev) {
        const input = control<HTMLInputElement>('input', { placeholder: t('Nick (tryb testowy)') });
        const b = el('button', { type: 'button', textContent: t('Zaloguj') });
        const go = () => signIn(() => api.socialLoginDev(input.value.trim()));
        b.addEventListener('click', go);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        buttons.append(el('div', { className: 'row fr-dev' }, input, b), el('small', { className: 'muted', textContent: t('Tryb testowy serwera: logowanie samym nickiem, bez hasła.') }));
      }
      if (!buttons.childElementCount) buttons.append(el('p', { className: 'muted', textContent: t('Serwer nie ma włączonego żadnego sposobu logowania.') }));
    }
    card.append(buttons);
    root.replaceChildren(card);
  }

  async function signIn(fn: () => Promise<SocialState>) {
    signingIn = true;
    render();
    try {
      state = await fn();
      await refreshList();
      deps.toast(t('Zalogowano jako {0}', state.user?.name ?? ''));
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      signingIn = false;
      render();
    }
  }

  // the layout is built once, so the message box keeps its text and focus
  let meBox: HTMLElement, listBox: HTMLElement, chatBox: HTMLElement, messagesBox: HTMLElement, chatHead: HTMLElement, typingBox: HTMLElement;
  let input: HTMLTextAreaElement, counter: HTMLElement, sendBtn: HTMLButtonElement, composer: HTMLFormElement;

  function buildLayout() {
    meBox = el('div', { className: 'fr-me' });
    const addInput = control<HTMLInputElement>('input', { placeholder: t('Nick znajomego'), maxLength: 32 });
    const addBtn = el('button', { type: 'submit', className: 'primary', title: t('Zaproś') }, icon('fa-user-plus'));
    const addForm = el('form', { className: 'row fr-add' }, addInput, addBtn);
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const handle = addInput.value.trim();
      if (!handle) return;
      addBtn.disabled = true;
      try {
        const res: FriendList & { status: string } = await api.socialApi('POST', '/v1/friends/requests', { handle });
        list = res;
        addInput.value = '';
        deps.toast(res.status === 'friends' ? t('Jesteście teraz znajomymi.') : t('Wysłano zaproszenie do {0}.', handle.replace(/^@/, '')));
        renderList();
      } catch (err) {
        deps.toast(deps.errorText(err), true);
      } finally {
        addBtn.disabled = false;
      }
    });
    listBox = el('div', { className: 'fr-list' });
    chatHead = el('div', { className: 'fr-chat-head' });
    messagesBox = el('div', { className: 'fr-messages' });
    messagesBox.addEventListener('scroll', () => {
      if (messagesBox.scrollTop < 60 && selected) loadOlder(selected);
    });
    typingBox = el('div', { className: 'fr-typing' });
    input = control<HTMLTextAreaElement>('textarea', { rows: 1, placeholder: t('Napisz wiadomość…'), maxLength: MAX_MESSAGE });
    counter = el('small', { className: 'fr-counter' });
    sendBtn = el('button', { type: 'submit', className: 'primary', title: t('Wyślij') }, icon('fa-paper-plane'));
    composer = el('form', { className: 'fr-composer' }, input, counter, sendBtn);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        composer.requestSubmit();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(140, input.scrollHeight)}px`;
      const left = MAX_MESSAGE - input.value.length;
      counter.textContent = left < 200 ? String(left) : '';
      if (selected && input.value && Date.now() - lastTypingSent > 3000) {
        lastTypingSent = Date.now();
        api.socialTyping(selected);
      }
    });
    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      send();
    });
    chatBox = el('div', { className: 'fr-chat glass-panel' }, chatHead, messagesBox, typingBox, composer);
    root.replaceChildren(el('div', { className: 'fr-layout' },
      el('div', { className: 'fr-side glass-panel' }, meBox, addForm, listBox),
      chatBox));
  }

  function renderMe() {
    const me = state!.user!;
    const status = control<HTMLSelectElement>('select', { className: 'fr-status', title: t('Twój status') });
    for (const [value, label] of [['online', t('Dostępny')], ['away', t('Zaraz wracam')], ['busy', t('Nie przeszkadzać')], ['invisible', t('Niewidoczny')]] as const) {
      status.append(control<HTMLOptionElement>('option', { value, textContent: label, selected: state!.status === value }));
    }
    status.addEventListener('change', async () => {
      await api.socialSetStatus(status.value);
      state!.status = status.value as Status;
      renderMe();
    });
    const share = control<HTMLInputElement>('input', { type: 'checkbox', checked: me.showServer });
    share.addEventListener('change', async () => {
      try {
        state!.user = await api.socialApi('POST', '/v1/me', { showServer: share.checked });
      } catch (err) {
        share.checked = !share.checked;
        deps.toast(deps.errorText(err), true);
      }
    });
    const logout = el('button', { type: 'button', className: 'icon-btn', title: t('Wyloguj') }, icon('fa-right-from-bracket'));
    logout.addEventListener('click', async () => {
      if (!confirm(t('Wylogować się ze znajomych?'))) return;
      await api.socialLogout();
      selected = undefined;
      chats.clear();
      root.replaceChildren();
      await refreshState();
    });
    const self: Presence = state!.connected ? { status: state!.status === 'invisible' ? 'offline' : state!.status } : { status: 'offline' };
    const linked = el('div', { className: 'fr-linked' });
    for (const provider of new Set([...(me.providers ?? []), ...(health?.providers ?? [])])) {
      const has = (me.providers ?? []).includes(provider);
      const chip = el('button', {
        type: 'button',
        className: `fr-chip${has ? ' on' : ''}`,
        title: has ? t('Połączone: {0}. Kliknij, żeby odłączyć.', PROVIDERS[provider] ?? provider) : t('Połącz konto {0}', PROVIDERS[provider] ?? provider),
      }, providerIcon(provider), has ? icon('fa-check') : icon('fa-plus'));
      chip.addEventListener('click', async () => {
        if (has) {
          if (!confirm(t('Odłączyć {0} od konta SlashClient?', PROVIDERS[provider] ?? provider))) return;
          try {
            state!.user = await api.socialApi('DELETE', `/v1/me/providers/${provider}`);
            renderMe();
          } catch (err) {
            deps.toast(deps.errorText(err), true);
          }
        } else if (provider !== 'dev') {
          chip.disabled = true;
          try {
            state = await api.socialLoginOAuth(provider, true);
            deps.toast(t('Połączono konto {0}.', PROVIDERS[provider] ?? provider));
            renderMe();
          } catch (err) {
            deps.toast(deps.errorText(err), true);
          } finally {
            chip.disabled = false;
          }
        }
      });
      linked.append(chip);
    }
    meBox.replaceChildren(
      el('div', { className: 'fr-me-row' }, avatar(me, self),
        el('div', { className: 'grow fr-names' }, el('b', { textContent: me.name }), el('small', { className: 'muted', textContent: `@${me.handle}` })),
        logout),
      el('div', { className: 'row' }, status, state!.connected ? '' : el('small', { className: 'fr-error', textContent: t('Łączenie…') })),
      el('label', { className: 'check fr-share' }, share, t(' Pokazuj znajomym, na jakim serwerze gram')),
      el('div', { className: 'fr-linked-row' }, el('small', { className: 'muted', textContent: t('Logowanie:') }), linked));
  }

  function renderList() {
    if (!listBox) return;
    const sections: Node[] = [];
    if (list.incoming.length) {
      sections.push(el('div', { className: 'fr-section', textContent: t('Zaproszenia ({0})', list.incoming.length) }));
      for (const r of list.incoming) {
        const accept = el('button', { type: 'button', className: 'icon-btn primary', title: t('Przyjmij') }, icon('fa-check'));
        const decline = el('button', { type: 'button', className: 'icon-btn', title: t('Odrzuć') }, icon('fa-xmark'));
        accept.addEventListener('click', () => act(() => api.socialApi('POST', `/v1/friends/requests/${r.id}/accept`), t('{0} jest teraz Twoim znajomym.', r.name)));
        decline.addEventListener('click', () => act(() => api.socialApi('DELETE', `/v1/friends/requests/${r.id}`)));
        sections.push(el('div', { className: 'fr-row' }, avatar(r), el('div', { className: 'grow fr-names' }, el('b', { textContent: r.name }), el('small', { className: 'muted', textContent: `@${r.handle}` })), accept, decline));
      }
    }
    const sorted = [...list.friends].sort((a, b) => rank(a) - rank(b) || b.lastMessageAt - a.lastMessageAt || a.name.localeCompare(b.name));
    const online = sorted.filter((f) => f.presence.status !== 'offline').length;
    sections.push(el('div', { className: 'fr-section', textContent: t('Znajomi · {0} online', online) }));
    if (!sorted.length) sections.push(el('p', { className: 'muted fr-empty', textContent: t('Nie masz jeszcze znajomych. Wpisz nick powyżej, żeby kogoś zaprosić.') }));
    for (const f of sorted) {
      const row = el('button', { type: 'button', className: `fr-row fr-friend${f.id === selected ? ' selected' : ''}${f.presence.status === 'offline' ? ' is-offline' : ''}` },
        avatar(f, f.presence),
        el('div', { className: 'grow fr-names' }, el('b', { textContent: f.name }), el('small', { className: 'muted', textContent: typing.has(f.id) ? t('pisze…') : statusLine(f.presence) })),
        f.unread ? el('span', { className: 'fr-unread', textContent: String(f.unread) }) : '');
      row.addEventListener('click', () => select(f.id));
      sections.push(row);
    }
    if (list.outgoing.length) {
      sections.push(el('div', { className: 'fr-section', textContent: t('Wysłane zaproszenia') }));
      for (const r of list.outgoing) {
        const cancel = el('button', { type: 'button', className: 'icon-btn', title: t('Anuluj zaproszenie') }, icon('fa-xmark'));
        cancel.addEventListener('click', () => act(() => api.socialApi('DELETE', `/v1/friends/requests/${r.id}`)));
        sections.push(el('div', { className: 'fr-row is-offline' }, avatar(r), el('div', { className: 'grow fr-names' }, el('b', { textContent: r.name }), el('small', { className: 'muted', textContent: t('czeka na odpowiedź') })), cancel));
      }
    }
    listBox.replaceChildren(...sections);
    updateBadge();
  }

  async function act(fn: () => Promise<FriendList>, done?: string) {
    try {
      list = await fn();
      if (done) deps.toast(done);
      if (selected && !friend(selected)) selected = undefined;
      renderList();
      renderChat();
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    }
  }

  // ---------- conversation ----------

  async function select(id: string) {
    selected = id;
    input.value = '';
    renderList();
    renderChat();
    if (!chats.has(id)) await loadOlder(id);
    markRead(id);
    input.focus();
  }

  async function loadOlder(id: string) {
    const chat = chats.get(id) ?? { messages: [], more: true, loading: false };
    chats.set(id, chat);
    if (chat.loading || !chat.more) return;
    chat.loading = true;
    try {
      const before = chat.messages[0]?.id;
      const { messages }: { messages: Message[] } = await api.socialApi('GET', `/v1/messages/${id}?limit=${PAGE}${before ? `&before=${before}` : ''}`);
      chat.messages = [...messages, ...chat.messages];
      chat.more = messages.length === PAGE;
      // keep the view where it was when older messages come in on top
      const fromBottom = messagesBox.scrollHeight - messagesBox.scrollTop;
      if (id === selected) {
        renderMessages();
        messagesBox.scrollTop = before ? messagesBox.scrollHeight - fromBottom : messagesBox.scrollHeight;
      }
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      chat.loading = false;
    }
  }

  async function markRead(id: string) {
    const f = friend(id);
    if (!f?.unread) return;
    f.unread = 0;
    renderList();
    await api.socialApi('POST', `/v1/messages/${id}/read`).catch(() => {});
  }

  async function send() {
    const id = selected;
    const text = input.value.trim();
    if (!id || !text) return;
    sendBtn.disabled = true;
    try {
      const { message }: { message: Message } = await api.socialApi('POST', `/v1/messages/${id}`, { text });
      addMessage(message);
      input.value = '';
      input.dispatchEvent(new Event('input'));
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function addMessage(m: Message) {
    const other = m.from === state?.user?.id ? m.to : m.from;
    const chat = chats.get(other);
    if (chat && !chat.messages.some((x) => x.id === m.id)) chat.messages.push(m);
    const f = friend(other);
    if (f) f.lastMessageAt = m.at;
    if (other === selected) {
      const atBottom = messagesBox.scrollHeight - messagesBox.scrollTop - messagesBox.clientHeight < 80;
      renderMessages();
      if (atBottom || m.from === state?.user?.id) messagesBox.scrollTop = messagesBox.scrollHeight;
    }
  }

  function renderChat() {
    if (!chatBox) return;
    const f = friend(selected);
    chatBox.classList.toggle('empty', !f);
    if (!f) {
      chatHead.replaceChildren();
      messagesBox.replaceChildren(el('div', { className: 'fr-placeholder' }, icon('fa-comments'), el('p', { className: 'muted', textContent: t('Wybierz znajomego, żeby zacząć rozmowę.') })));
      typingBox.textContent = '';
      return;
    }
    const actions: Node[] = [];
    const a = f.presence.activity;
    if (f.presence.status !== 'offline' && a?.kind === 'server' && a.server) {
      const join = el('button', { type: 'button', className: 'primary' }, icon('fa-right-to-bracket'), t(' Dołącz'));
      join.addEventListener('click', () => deps.join(a.server!, a.version?.split(' · ')[0]));
      actions.push(join);
    }
    const remove = el('button', { type: 'button', className: 'icon-btn danger', title: t('Usuń ze znajomych') }, icon('fa-user-minus'));
    remove.addEventListener('click', () => {
      if (confirm(t('Usunąć {0} ze znajomych?', f.name))) act(() => api.socialApi('DELETE', `/v1/friends/${f.id}`), t('Usunięto {0} ze znajomych.', f.name));
    });
    actions.push(remove);
    chatHead.replaceChildren(avatar(f, f.presence),
      el('div', { className: 'grow fr-names' }, el('b', { textContent: f.name }), el('small', { className: 'muted', textContent: `@${f.handle} · ${statusLine(f.presence)}` })),
      ...actions);
    renderMessages();
    typingBox.textContent = typing.has(f.id) ? t('{0} pisze…', f.name) : '';
  }

  function renderMessages() {
    const chat = selected ? chats.get(selected) : undefined;
    if (!chat) return messagesBox.replaceChildren(el('div', { className: 'fr-placeholder' }, el('span', { className: 'spinner' })));
    const me = state?.user?.id;
    const nodes: Node[] = [];
    if (!chat.messages.length) nodes.push(el('div', { className: 'fr-placeholder' }, icon('fa-hand'), el('p', { className: 'muted', textContent: t('To początek Waszej rozmowy. Napisz coś!') })));
    const day = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
    const time = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' });
    let lastDay = '';
    let lastFrom = '';
    let lastAt = 0;
    const lastMineRead = [...chat.messages].reverse().find((m) => m.from === me && m.readAt);
    for (const m of chat.messages) {
      const d = day.format(m.at);
      if (d !== lastDay) {
        nodes.push(el('div', { className: 'fr-day', textContent: d }));
        lastFrom = '';
      }
      // messages sent close together stick to each other
      const grouped = m.from === lastFrom && m.at - lastAt < 5 * 60_000;
      nodes.push(el('div', { className: `fr-msg${m.from === me ? ' mine' : ''}${grouped ? ' grouped' : ''}`, title: new Date(m.at).toLocaleString(locale()) },
        el('div', { className: 'fr-bubble', textContent: m.text }),
        grouped ? '' : el('small', { className: 'fr-time', textContent: time.format(m.at) })));
      if (m === lastMineRead) nodes.push(el('small', { className: 'fr-read', textContent: t('Przeczytano') }));
      lastDay = d;
      lastFrom = m.from;
      lastAt = m.at;
    }
    messagesBox.replaceChildren(...nodes);
  }

  // ---------- live events ----------

  api.on('social:event', async (e: any) => {
    switch (e.type) {
      case 'state': {
        const was = state?.user?.id;
        state = e.state;
        if (state?.user && state.user.id !== was) await refreshList();
        if (!state?.user) {
          root.replaceChildren();
          return refreshState();
        }
        if (root.querySelector('.fr-layout')) renderMe();
        else render();
        return;
      }
      case 'presence': {
        const f = friend(e.id);
        if (!f) return;
        f.presence = e.presence;
        renderList();
        if (e.id === selected) renderChat();
        return;
      }
      case 'message': {
        const m: Message = e.message;
        addMessage(m);
        if (m.from === state?.user?.id) return;
        clearTimeout(typing.get(m.from));
        typing.delete(m.from);
        const f = friend(m.from);
        if (m.from === selected && isVisible()) markRead(m.from);
        else if (f) {
          f.unread++;
          notify(f, m.text);
        }
        renderList();
        if (m.from === selected) renderChat();
        return;
      }
      case 'read': {
        const chat = chats.get(e.by);
        chat?.messages.forEach((m) => m.from === state?.user?.id && !m.readAt && (m.readAt = e.at));
        if (e.by === selected) renderMessages();
        return;
      }
      case 'typing': {
        clearTimeout(typing.get(e.from));
        typing.set(e.from, setTimeout(() => {
          typing.delete(e.from);
          renderList();
          if (e.from === selected) renderChat();
        }, 5000));
        renderList();
        if (e.from === selected) typingBox.textContent = t('{0} pisze…', friend(e.from)?.name ?? '');
        return;
      }
      case 'friends': {
        await refreshList();
        if (e.request) deps.toast(t('{0} zaprasza Cię do znajomych.', e.request.name));
        if (e.accepted) deps.toast(t('{0} przyjmuje zaproszenie.', e.accepted.name));
        if (selected && !friend(selected)) selected = undefined;
        renderList();
        renderChat();
        return;
      }
    }
  });

  /** New message while the chat is not in front: a toast, and a system notification when the window is in the background. */
  function notify(f: Friend, text: string) {
    const short = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    if (!document.hasFocus() && 'Notification' in window) {
      const n = new Notification(f.name, { body: short, silent: false });
      n.onclick = () => {
        window.focus();
        document.querySelector<HTMLButtonElement>('.nav[data-view="friends"]')?.click();
        select(f.id);
      };
    } else deps.toast(t('{0}: {1}', f.name, short));
  }

  // marking a chat read when the player comes back to it
  addEventListener('focus', () => selected && isVisible() && markRead(selected));

  return {
    /** Called when the view opens. */
    show() {
      if (!state) return refreshState();
      if (!state.user) return refreshState();
      render();
      if (selected) markRead(selected);
    },
    init: refreshState,
  };
}
