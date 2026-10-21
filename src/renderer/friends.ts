import { getLang, locale, t } from '../shared/i18n';
import { createGroups } from './groups';
import { createCommunities, waitText } from './communities';
import { PlayingWatch, type PlayingNews } from './friendActivity';
import { createParty, type Party } from './party';
import { waypointCard, type SharedWaypoint } from './sharedWaypoint';
import { openProfilePrivacy, profileLink } from './profilePrivacy';
import { confirmDialog } from './dialog';
import { onFeatures } from './features';
import { legalNote } from './legal';
import { badgeChoices, rankBadge, rankName, safeColor, type RankView } from './rankBadge';
import { cleanStream, createStreamsSection, liveBadge, noticeText, streamLine, type FriendStream } from './streams';
import { canDelete, canEdit, editHint, editedLabel, replaceMessage, slowDownSeconds, slowDownText, tombstone, withMenu, type MenuItem } from './chatEdits';

/**
 * The "Friends" view: signing in to the social server, the friends list with live
 * statuses, friend requests and direct messages.
 */

type Status = 'online' | 'away' | 'busy' | 'invisible';
/** `detail`: what the server's tab list says ("S3 (Wyspy)"), `serverName` its name from the admin's rule (server 0.9.25+). */
interface Activity { kind: 'launcher' | 'menu' | 'singleplayer' | 'server'; version?: string; server?: string; detail?: string; serverName?: string; since?: number }
interface Presence { status: 'online' | 'away' | 'busy' | 'offline'; activity?: Activity; lastSeen?: number; /** their world is open to LAN: joinable through SlashClient */ lan?: boolean }
interface Person { id: string; handle: string; name: string; avatar: string }
/** `clan`: their clan's tag; `muted`: on the account, their messages come, but no toast or notification (server 0.9.21+). */
interface Friend extends Person { presence: Presence; unread: number; lastMessageAt: number; since: number; clan?: string; muted?: boolean; /** the rank badge they show next to the nick (server 0.9.23+) */ badgeRank?: RankView; /** live on Twitch or Kick now (server 0.9.24+, streams.ts) */ stream?: FriendStream }
interface Request extends Person { at: number }
interface Me extends Person {
  showServer: boolean; providers: string[]; minecraft?: { uuid: string; name: string }[];
  /** every rank held, the pick of the badge ('' = the most important, 'none') and the rank shown (server 0.9.23+) */
  ranks?: RankView[]; badgeChoice?: string; badgeRank?: RankView | null;
}
/** `expiresAt`: after it Join is gone (server 0.9.25+; none: it does not expire). */
interface Invite { server: string; version?: string; party?: string; expiresAt?: number }
export const inviteExpired = (inv: { expiresAt?: number }, now = Date.now()) => !!inv.expiresAt && now >= inv.expiresAt;
/** A picture in the chat (the launcher decrypts it); `unreadable`: its key was for another launcher. */
interface ChatImage { id: string; w?: number; h?: number; unreadable?: boolean }
/** `editedAt`, `deleted`: changed or taken back by the author (server 0.9.23+). */
interface Message { id: number; from: string; to: string; text: string; at: number; readAt: number | null; invite?: Invite; waypoint?: SharedWaypoint; image?: ChatImage; encrypted?: boolean; unreadable?: boolean; editedAt?: number; deleted?: boolean }
interface SocialState { url: string; user?: Me; connected: boolean; status: Status }
interface FriendList { friends: Friend[]; incoming: Request[]; outgoing: Request[] }

export interface FriendsDeps {
  api: any;
  toast: (message: string, isError?: boolean, action?: { label: string; run: () => void }) => void;
  /** Where the player is now (or played last): the server a "Join me" invite offers. */
  inviteTarget: () => Promise<Invite | undefined>;
  errorText: (err: unknown) => string;
  /** Opens the usual "join server" window. */
  join: (address: string, version?: string) => void;
  /** Signed in or out of the SlashClient account (other parts of the launcher, like capes, depend on it). */
  accountChanged?: () => void;
  /** Whether the launcher has a Microsoft (Minecraft) account to sign in with. */
  hasMinecraft?: () => boolean;
  /** Opens a friend's achievements. */
  showAchievements?: (id: string, name: string) => void;
  /** A game is running: "started playing" stays in the game's own toast instead of a system notification. */
  gameRunning?: () => boolean;
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
  // too many messages in a row (server 0.9.23+): how long to wait
  const wait = slowDownSeconds(code);
  if (wait) return slowDownText(wait);
  // a community channel's slow mode (server 0.9.27+): "slow_mode:30"
  const slow = /^slow_mode(?::(\d+))?$/.exec(code);
  if (slow) return t('Tryb powolny: możesz napisać za {0}.', waitText(Number(slow[1] ?? 0) || 1));
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
    // the admin switched this part off for a while (server 0.9.23+), or new accounts
    feature_disabled: t('Ta funkcja jest chwilowo wyłączona przez administratora.'),
    bad_name: t('Nick musi mieć 3–16 znaków: litery, cyfry lub _.'),
    provider_disabled: t('Ten sposób logowania jest wyłączony na serwerze.'),
    login_expired: t('Logowanie wygasło. Spróbuj ponownie.'),
    provider_denied: t('Logowanie zostało anulowane.'),
    provider_failed: t('Nie udało się potwierdzić logowania. Spróbuj ponownie.'),
    already_linked: t('To konto jest już połączone z innym kontem SlashClient.'),
    last_provider: t('To jedyny sposób logowania. Najpierw połącz inny.'),
    cancelled: t('Logowanie anulowane.'),
    not_linked: t('To konto nie jest podpięte do żadnego konta SlashClient. Zaloguj się kontem Minecraft i podepnij je w zakładce Znajomi.'),
    not_verified: t('Mojang nie potwierdził konta Minecraft. Spróbuj ponownie.'),
    too_many: t('Za dużo osób naraz (maks. 7 znajomych).'),
    bad_server: t('To nie wygląda na adres serwera.'),
    not_leader: t('Tylko lider może rozwiązać drużynę.'),
    // group chats and clans
    bad_group_name: t('Nazwa grupy: 1–32 znaki.'),
    too_many_groups: t('Jesteś już w zbyt wielu grupach.'),
    not_owner: t('Tylko założyciel grupy może usuwać innych.'),
    clan_chat: t('Członków czatu klanu zmienia się w klanie.'),
    bad_tag: t('Tag: 2–5 liter lub cyfr, bez spacji.'),
    offensive_tag: t('Ten tag jest niedozwolony. Wybierz inny.'),
    offensive_name: t('Ta nazwa jest niedozwolona. Wybierz inną.'),
    bad_clan_name: t('Nazwa klanu: 3–32 znaki.'),
    tag_taken: t('Ten tag jest już zajęty.'),
    already_in_clan: t('Jesteś już w klanie. Najpierw go opuść.'),
    already_member: t('Ten gracz już jest w klanie.'),
    clan_full: t('Klan jest pełny.'),
    no_clan: t('Nie jesteś w klanie.'),
    not_allowed: t('Nie masz do tego uprawnień w klanie.'),
    owner_must_transfer: t('Założyciel nie może odejść: przekaż klan komuś albo go usuń.'),
    no_keys: t('Znajomy ma starszy launcher bez szyfrowania: obraz nie został wysłany.'),
    too_large: t('Obraz jest za duży.'),
    image_quota: t('Wysłano dziś za dużo obrazów. Spróbuj jutro.'),
    not_an_image: t('To nie jest obraz.'),
    bad_image: t('Nie udało się wysłać obrazu. Spróbuj ponownie.'),
    // editing and deleting messages
    not_author: t('Możesz zmieniać tylko swoje wiadomości.'),
    not_editable: t('Tej wiadomości nie można edytować.'),
    edit_expired: t('Minął czas na edycję tej wiadomości.'),
    // communities (communities.ts)
    bad_community_name: t('Nazwa społeczności: 3–40 znaków.'),
    bad_description: t('Opis jest za długi albo ma niedozwolone znaki.'),
    offensive_description: t('Ten opis jest niedozwolony.'),
    too_many_communities: t('Jesteś już w zbyt wielu społecznościach. Opuść którąś.'),
    too_many_owned: t('Masz już najwięcej społeczności, ile można założyć.'),
    community_full: t('Społeczność jest pełna.'),
    community_banned: t('Masz bana w tej społeczności.'),
    banned_user: t('Ten gracz ma bana w tej społeczności. Najpierw go zdejmij.'),
    already_requested: t('Prośba już czeka na moderatorów.'),
    invite_only: t('Do tej społeczności dołącza się tylko na zaproszenie.'),
    too_many_requests: t('Za dużo osób czeka na przyjęcie. Spróbuj później.'),
    community_muted: t('Wyciszono Cię w tej społeczności.'),
    read_only_channel: t('Tu piszą tylko administratorzy społeczności.'),
    already_reported: t('Ta wiadomość jest już przez Ciebie zgłoszona.'),
    not_member: t('Ten gracz nie jest w społeczności.'),
    bad_reply: t('Można odpowiedzieć tylko na wiadomość z tego samego kanału.'),
    reply_deleted: t('Ta wiadomość została usunięta — nie można na nią odpowiedzieć.'),
    bad_reaction: t('Tej reakcji nie można dodać.'),
    too_many_reactions: t('Pod tą wiadomością jest już najwięcej różnych reakcji.'),
    too_many_pins: t('W tym kanale przypięto już najwięcej wiadomości. Najpierw odepnij którąś.'),
    // polls in communities (communityMedia.ts)
    bad_poll: t('Ankieta: pytanie i 2–10 różnych odpowiedzi.'),
    bad_poll_end: t('Koniec ankiety: od minuty do miesiąca od teraz.'),
    poll_closed: t('Ta ankieta jest już zakończona.'),
    bad_vote: t('Nie udało się oddać głosu.'),
    // the shop (sparks from achievements)
    not_enough_sparks: t('Za mało Iskier.'),
    owned: t('Masz już ten przedmiot.'),
    not_for_sale: t('Tego nie ma w sklepie.'),
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
  /** `editWindowMs`: how long one's messages may be edited, from the server (none: an older one, no editing). */
  const chats = new Map<string, { messages: Message[]; more: boolean; loading: boolean; editWindowMs?: number }>();
  /** A message being edited in the composer instead of a new one (direct, in a group, or in a community's channel). */
  let editing: { id: number; group?: string; friend?: string; community?: string; channel?: string } | undefined;
  const typing = new Map<string, ReturnType<typeof setTimeout>>();
  let lastTypingSent = 0;
  let signingIn = false;
  /** Who started playing: toasts only for news, not for reconnects (friendActivity.ts). */
  const watch = new PlayingWatch();
  /** Launcher setting: a toast when a friend comes online or starts playing. */
  let notifyPlaying = true;
  /** Pictures already decrypted, as data: addresses. */
  const pictures = new Map<string, Promise<string>>();
  /** The code of a "type this code" sign-in (Microsoft) while it waits. */
  let loginCode: { code: string; url: string } | undefined;
  api.on('social:loginCode', (c: { code: string; url: string }) => {
    loginCode = c;
    if (signingIn) render();
  });

  const party = createParty({
    api, toast: deps.toast, errorText: deps.errorText, inviteTarget: deps.inviteTarget, join: deps.join,
    me: () => state?.user?.id,
    friends: () => list.friends.map((f) => ({ id: f.id, name: f.name, online: f.presence.status !== 'offline' })),
  });
  /** Join on an invite: a party's says "I'm in" first, so the leader sees it. */
  const joinInvite = (inv: Invite) => {
    // one that ran out while its card or toast was still up
    if (inviteExpired(inv)) {
      deps.toast(t('Zaproszenie wygasło.'), true);
      renderChat();
      return;
    }
    if (inv.party) void party.accept(inv.party);
    deps.join(inv.server, inv.version);
  };

  const isVisible = () => !!root.closest('.view')?.classList.contains('active') && document.hasFocus();
  /** Group chats and the clan (groups.ts): their rows in the list, and their conversation in the chat panel. */
  const groups = createGroups({
    api, toast: deps.toast, errorText: deps.errorText, avatar: (p, presence) => avatar(p, presence as Presence | undefined), visible: isVisible,
    imageCard: (image, mine) => imageCard(image, mine),
    me: () => state?.user?.id,
    friends: () => list.friends.map((f) => ({ id: f.id, name: f.name, online: f.presence.status !== 'offline' })),
    changed: () => {
      renderList();
      renderChat();
    },
    opened: () => {
      selected = undefined;
      communities.deselect();
      stopEditing();
      if (input) input.value = '';
    },
    // editing a group message happens in the same composer
    edit: (m) => startEditing({ id: m.id, group: m.group }, m.text),
    editGone: () => stopEditing(),
  });
  /** Communities (communities.ts): their section in the list, and an open one's chat in the chat panel. */
  const communities = createCommunities({
    api, toast: deps.toast, errorText: deps.errorText, avatar: (p, presence) => avatar(p, presence as Presence | undefined), visible: isVisible,
    me: () => (state?.user ? { id: state.user.id, handle: state.user.handle } : undefined),
    changed: () => {
      renderList();
      renderChat();
    },
    opened: () => {
      selected = undefined;
      groups.deselect();
      stopEditing();
      if (input) input.value = '';
    },
    edit: (m) => startEditing({ id: m.id, community: m.community, channel: m.channel }, m.text),
    editGone: () => stopEditing(),
    focus: () => input?.focus(),
  });
  const friend = (id: string | undefined) => list.friends.find((f) => f.id === id);
  /** A friends list from the server with each stream checked (streams.ts). */
  const withStreams = (l: FriendList): FriendList => {
    for (const f of l.friends) f.stream = cleanStream(f.stream);
    return l;
  };
  /** The account window's "Streamy" (streams.ts), while the window is open. */
  let streamsBox: ReturnType<typeof createStreamsSection> | undefined;

  // ---------- avatars: the face from the Minecraft skin (from the SlashClient server), Discord's, Google's or GitHub's picture, or a letter ----------

  function avatar(p: Person, presence?: Presence) {
    const box = el('div', { className: 'fr-avatar' });
    const dot = presence ? el('span', { className: `fr-dot ${presenceClass(presence)}` }) : undefined;
    const letter = el('span', { textContent: (p.name || p.handle).slice(0, 1).toUpperCase() });
    box.append(letter);
    const src = /^\/v1\/head\/[0-9a-f]{32}$/.test(p.avatar) && state?.url ? `${state.url.replace(/\/$/, '')}${p.avatar}`
      : /^https:\/\/(cdn\.discordapp\.com|lh3\.googleusercontent\.com|avatars\.githubusercontent\.com)\//.test(p.avatar) ? p.avatar : '';
    if (src) {
      const img = el('img', { alt: '', src, className: p.avatar.startsWith('/v1/head/') ? 'pixel' : '' });
      img.onerror = () => img.replaceWith(letter);
      box.replaceChildren(img);
    }
    if (dot) box.append(dot);
    return box;
  }

  // ---------- statuses ----------

  const STATUS_NAMES: Record<string, string> = { online: t('Dostępny'), away: t('Zaraz wracam'), busy: t('Nie przeszkadzać'), invisible: t('Niewidoczny') };
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
    // "Gra na SkyUp.pl · S3 (Wyspy)": the sector says more than the game's version
    if (a?.kind === 'server' && a.server && a.detail) return t('Gra na {0} · {1}', a.serverName || a.server, a.detail);
    if (a?.kind === 'server') return a.server ? t('{0} · na {1}', version, a.server) : t('{0} · na serwerze', version);
    if (a?.kind === 'singleplayer') return p.lan ? t('{0} · świat otwarty w LAN', version) : t('{0} · gra jednoosobowa', version);
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
    notifyPlaying = (await api.getStore().catch(() => undefined))?.settings?.notifyFriendsPlaying !== false;
    state = await api.socialState();
    health = await api.socialHealth().catch(() => undefined);
    healthError = !health;
    if (state?.user) await refreshList();
    render();
    if (state?.user) void party.refresh();
    if (state?.user) void groups.refresh();
    if (state?.user) void communities.refresh();
  }

  async function refreshList() {
    try {
      list = withStreams(await api.socialApi('GET', '/v1/friends'));
      // whoever is online or playing now is not news
      for (const f of list.friends) watch.know(f.id, f.presence);
    } catch (err) {
      if (!String((err as Error).message).includes('social:offline')) deps.toast(deps.errorText(err), true);
    }
    updateBadge();
  }

  function updateBadge() {
    const n = list.friends.reduce((sum, f) => sum + f.unread, 0) + list.incoming.length + groups.unread() + communities.unread();
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

  /** The Minecraft accounts of this SlashClient account; one can be unlinked while another way to sign in is left. */
  function minecraftRow(me: Me) {
    const row = el('div', { className: 'fr-linked' });
    for (const mc of me.minecraft ?? []) {
      const chip = el('button', { type: 'button', className: 'fr-chip on', title: t('Konto Minecraft {0}. Kliknij, żeby odłączyć.', mc.name) }, icon('fa-cube'), mc.name);
      chip.addEventListener('click', async () => {
        if (!confirm(t('Odłączyć konto Minecraft {0} od konta SlashClient?', mc.name))) return;
        try {
          state!.user = await api.socialApi('DELETE', `/v1/me/minecraft/${mc.uuid}`);
          renderMe();
        } catch (err) {
          deps.toast(deps.errorText(err), true);
        }
      });
      row.append(chip);
    }
    if (!row.childElementCount) row.append(el('small', { className: 'muted', textContent: t('Wybierz konto Microsoft w zakładce Konta, żeby je podpiąć.') }));
    return el('div', { className: 'fr-linked-row' }, el('small', { className: 'muted', textContent: t('Minecraft:') }), row);
  }

  function renderSignIn() {
    const card = el('div', { className: 'card glass-panel fr-signin' },
      el('h3', {}, icon('fa-user-group'), t(' Znajomi w SlashClient')),
      el('p', { className: 'muted', textContent: t('Zaloguj się, żeby dodawać znajomych, widzieć, w co grają, i pisać do nich prosto z launchera. To osobne konto SlashClient: nie zmienia kont Minecraft, którymi grasz.') }));
    if (healthError) {
      const retry = el('button', { type: 'button' }, icon('fa-rotate-right'), t(' Spróbuj ponownie'));
      retry.addEventListener('click', () => refreshState());
      card.append(el('p', { className: 'fr-error', textContent: t('Serwer znajomych jest chwilowo niedostępny. Spróbuj ponownie za chwilę.') }), el('div', { className: 'row' }, retry));
      root.replaceChildren(card);
      return;
    }
    const buttons = el('div', { className: 'fr-providers' });
    if (signingIn) {
      const cancel = el('button', { type: 'button', textContent: t('Anuluj') });
      cancel.addEventListener('click', () => api.socialCancelLogin());
      if (loginCode) {
        // the same box as the Minecraft sign-in: the code (already copied) to paste on the provider's page
        const copy = el('button', { type: 'button' }, icon('fa-copy'), t(' Kopiuj kod'));
        copy.addEventListener('click', async () => {
          await navigator.clipboard.writeText(loginCode!.code);
          deps.toast(t('Skopiowano kod'));
        });
        const link = el('a', { href: loginCode.url, target: '_blank', textContent: loginCode.url.replace(/^https:\/\/(www\.)?/, '') });
        buttons.append(el('div', { className: 'ms-code' },
          el('p', {}, t('Otwórz '), link, t(' i wpisz kod:')),
          el('div', { className: 'code-row' }, el('div', { className: 'code', textContent: loginCode.code }), copy),
          el('p', { className: 'muted' }, icon('fa-check'), t(' Kod jest już w schowku, wystarczy go wkleić.')),
          el('p', { className: 'muted' }, el('span', { className: 'spinner' }), t(' Czekam na zalogowanie…')),
          cancel));
      } else buttons.append(el('p', { className: 'muted' }, el('span', { className: 'spinner' }), t(' Dokończ logowanie w przeglądarce…')), cancel);
    } else {
      // the account comes with the Minecraft account; the rest only opens an account they were linked to
      if (deps.hasMinecraft?.()) {
        const mc = el('button', { type: 'button', className: 'primary' }, icon('fa-cube'), t(' Zaloguj kontem Minecraft'));
        mc.addEventListener('click', () => signIn(() => api.socialLoginMinecraft()));
        buttons.append(mc);
      } else buttons.append(el('p', { className: 'muted', textContent: t('Dodaj konto Microsoft w zakładce Konta: konto SlashClient założy się samo i będzie logować się razem z nim.') }));
      if (health?.providers?.length) buttons.append(el('small', { className: 'muted fr-other', textContent: t('Masz już konto SlashClient? Zaloguj się sposobem, który wcześniej do niego podpiąłeś:') }));
      for (const provider of health?.providers ?? []) {
        const b = el('button', { type: 'button', className: `fr-${provider}` }, providerIcon(provider), t(' Zaloguj przez {0}', PROVIDERS[provider] ?? provider));
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

    }
    card.append(buttons, legalNote());
    root.replaceChildren(card);
  }

  async function signIn(fn: () => Promise<SocialState>) {
    signingIn = true;
    render();
    try {
      state = await fn();
      await refreshList();
      void groups.refresh();
      void communities.refresh();
      deps.toast(t('Zalogowano jako {0}', state.user?.name ?? ''));
      deps.accountChanged?.();
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      signingIn = false;
      loginCode = undefined;
      render();
    }
  }

  // the layout is built once, so the message box keeps its text and focus
  let meBox: HTMLElement, listBox: HTMLElement, chatBox: HTMLElement, messagesBox: HTMLElement, chatHead: HTMLElement, typingBox: HTMLElement;
  let inviteBar: HTMLFormElement;
  let input: HTMLTextAreaElement, counter: HTMLElement, sendBtn: HTMLButtonElement, composer: HTMLFormElement, editBar: HTMLElement, pictureBtn: HTMLButtonElement;

  function buildLayout() {
    meBox = el('div', { className: 'fr-me' });
    const addInput = control<HTMLInputElement>('input', { placeholder: t('Nick znajomego'), maxLength: 32 });
    const addBtn = el('button', { type: 'submit', className: 'primary', title: t('Zaproś') }, icon('fa-user-plus'));
    const partyBtn = el('button', { type: 'button', title: t('Zaproś drużynę: kilku znajomych naraz') }, icon('fa-people-group'));
    partyBtn.addEventListener('click', () => party.open());
    const addForm = el('form', { className: 'row fr-add' }, addInput, addBtn, partyBtn);
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
      if (messagesBox.scrollTop < 60 && communities.active()) void communities.loadOlder();
      else if (messagesBox.scrollTop < 60 && groups.active()) void groups.loadOlder();
      else if (messagesBox.scrollTop < 60 && selected) loadOlder(selected);
    });
    typingBox = el('div', { className: 'fr-typing' });
    input = control<HTMLTextAreaElement>('textarea', { rows: 1, placeholder: t('Napisz wiadomość…'), maxLength: MAX_MESSAGE });
    counter = el('small', { className: 'fr-counter' });
    sendBtn = el('button', { type: 'submit', className: 'primary', title: t('Wyślij') }, icon('fa-paper-plane'));
    pictureBtn = el('button', { type: 'button', className: 'icon-btn feature-chatImages', title: t('Wyślij obraz (zaszyfrowany)') }, icon('fa-image'));
    pictureBtn.addEventListener('click', () => sendPicture(pictureBtn));
    // a picture pasted from the clipboard (Ctrl+V): shown first, sent on "Wyślij"
    input.addEventListener('paste', (e) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      // no picture button here (an older server's community, or pictures switched off by the owner): no pasted pictures either
      if (!file || pictureBtn.offsetParent === null) return;
      e.preventDefault();
      void pastePicture(file);
    });
    composer = el('form', { className: 'fr-composer' }, pictureBtn, input, counter, sendBtn);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        composer.requestSubmit();
      } else if (e.key === 'Escape' && editing) {
        e.preventDefault();
        e.stopPropagation();
        stopEditing();
      } else if (e.key === 'Escape' && communities.active() && communities.cancelReply()) {
        e.preventDefault();
        e.stopPropagation();
      }

    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(140, input.scrollHeight)}px`;
      const left = MAX_MESSAGE - input.value.length;
      counter.textContent = left < 200 ? String(left) : '';
      if (selected && !groups.active() && input.value && Date.now() - lastTypingSent > 3000) {
        lastTypingSent = Date.now();
        api.socialTyping(selected);
      }
    });
    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      send();
    });
    inviteBar = el('form', { className: 'fr-invite-bar hidden' });
    // editing a message: the composer holds its text, Enter saves, Esc (or ×) cancels
    const cancelEdit = el('button', { type: 'button', className: 'icon-btn', title: t('Anuluj edycję (Esc)') }, icon('fa-xmark'));
    cancelEdit.addEventListener('click', () => stopEditing());
    editBar = el('div', { className: 'fr-edit-bar hidden' }, icon('fa-pen'), el('span', { className: 'grow', textContent: t('Edytujesz wiadomość · Enter zapisuje, Esc anuluje') }), cancelEdit);
    chatBox = el('div', { className: 'fr-chat glass-panel' }, chatHead, messagesBox, typingBox, inviteBar, editBar, composer);
    root.replaceChildren(el('div', { className: 'fr-layout' },
      el('div', { className: 'fr-side glass-panel' }, meBox, addForm, party.element, listBox),
      chatBox));
  }

  function renderMe() {
    const me = state!.user!;
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
      deps.accountChanged?.();
    });
    const self: Presence = state!.connected ? { status: state!.status === 'invisible' ? 'offline' : state!.status } : { status: 'offline' };
    const linked = el('div', { className: 'fr-linked' });
    for (const provider of new Set([...(me.providers ?? []), ...(health?.providers ?? [])])) {
      // Minecraft accounts have their own row below
      if (provider === 'minecraft') continue;
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
    // the rest of the account in a window of its own: the side panel keeps room for the list
    const options = el('button', { type: 'button', className: 'icon-btn', title: t('Konto i profil') }, icon('fa-gear'));
    options.addEventListener('click', () => openAccount());
    // the status: a click on the dot by the avatar opens the choice
    const face = avatar(me, self);
    const dot = face.querySelector<HTMLElement>('.fr-dot');
    if (dot) {
      dot.classList.add('fr-dot-btn');
      dot.title = t('Twój status: {0}. Kliknij, żeby zmienić.', STATUS_NAMES[state!.status] ?? state!.status);
      dot.tabIndex = 0;
      dot.setAttribute('role', 'button');
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        statusMenu(face);
      });
      dot.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), statusMenu(face)));
    }
    meBox.replaceChildren(
      el('div', { className: 'fr-me-row' }, face,
        el('div', { className: 'grow fr-names' }, el('b', {}, ...rankTag(me.badgeRank ?? undefined), ...clanTag(groups.myTag()), me.name),
          state!.connected ? el('small', { className: 'muted', textContent: `@${me.handle}` }) : el('small', { className: 'fr-error', textContent: t('Łączenie…') })),
        options, logout));
    accountBody?.replaceChildren(
      el('div', { className: 'fr-account-section', textContent: t('Prywatność i powiadomienia') }),
      el('label', { className: 'check fr-share' }, share, t(' Pokazuj znajomym, na jakim serwerze gram')),
      el('label', { className: 'check fr-share' }, playingBox(), t(' Powiadamiaj, gdy znajomi zaczynają grać')),
      el('div', { className: 'fr-account-section', textContent: t('Konta') }),
      el('div', { className: 'fr-linked-row' }, el('small', { className: 'muted', textContent: t('Logowanie:') }), linked),
      minecraftRow(me),
      // linked Twitch and Kick channels and their two choices (streams.ts; servers before 0.9.24 have none)
      ...(streamsBox ? [el('div', { className: 'fr-account-section feature-streams', textContent: t('Streamy') }), streamsBox.element] : []),
      el('div', { className: 'fr-account-section', textContent: t('Profil na stronie') }),
      profileRow(me),
      ...badgeRow(me));
  }

  /** The four statuses, under the avatar; one click sets it, a click elsewhere or Esc closes. */
  function statusMenu(anchor: HTMLElement) {
    meBox.querySelector('.fr-status-menu')?.remove();
    const menu = el('div', { className: 'fr-status-menu' });
    const close = () => {
      menu.remove();
      document.removeEventListener('click', outside, true);
      document.removeEventListener('keydown', onKey, true);
    };
    const outside = (e: MouseEvent) => !menu.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close());
    for (const value of ['online', 'away', 'busy', 'invisible'] as const) {
      const item = el('button', { type: 'button', className: `fr-status-item${state!.status === value ? ' active' : ''}` },
        el('span', { className: `fr-dot-inline ${value === 'invisible' ? 'offline' : value}` }), STATUS_NAMES[value]);
      item.addEventListener('click', async () => {
        close();
        if (state!.status === value) return;
        await api.socialSetStatus(value);
        state!.status = value as Status;
        renderMe();
      });
      menu.append(item);
    }
    menu.style.top = `${anchor.offsetTop + anchor.offsetHeight + 6}px`;
    menu.style.left = `${anchor.offsetLeft}px`;
    meBox.append(menu);
    (menu.querySelector('.active') as HTMLElement | null ?? menu.firstElementChild as HTMLElement)?.focus();
    setTimeout(() => {
      document.addEventListener('click', outside, true);
      document.addEventListener('keydown', onKey, true);
    });
  }

  /** The account's window ("Konto i profil"), drawn again by renderMe while it is open. */
  let accountBody: HTMLElement | undefined;
  function openAccount() {
    if (accountBody) return;
    const body = el('div', { className: 'fr-account-body' });
    const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
    const modal = el('div', { className: 'modal' }, el('div', { className: 'modal-box glass-panel fr-account-box' }, close,
      el('h3', { className: 'fr-account-title' }, icon('fa-user-gear'), t(' Konto i profil')), body));
    const done = () => {
      modal.remove();
      accountBody = undefined;
      streamsBox = undefined;
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      done();
    };
    close.addEventListener('click', done);
    modal.addEventListener('click', (e) => e.target === modal && done());
    document.addEventListener('keydown', onKey, true);
    accountBody = body;
    streamsBox = createStreamsSection(deps);
    void streamsBox.load();
    document.body.append(modal);
    renderMe();
  }

  /** The player's public profile on the site: open it, copy its link, choose who sees what. */
  function profileRow(me: Me) {
    const own = el('button', { type: 'button', className: 'fr-chip-btn feature-profiles' }, icon('fa-id-card'), t(' Mój profil'));
    own.addEventListener('click', () => profileLink(deps, me.handle, 'open'));
    const copy = el('button', { type: 'button', className: 'icon-btn feature-profiles', title: t('Kopiuj link do profilu') }, icon('fa-copy'));
    copy.addEventListener('click', () => profileLink(deps, me.handle, 'copy'));
    const privacy = el('button', { type: 'button', className: 'fr-chip-btn' }, icon('fa-user-lock'), t(' Prywatność profilu'));
    privacy.addEventListener('click', () => openProfilePrivacy(deps, me.handle));
    return el('div', { className: 'row fr-profile-row' }, own, copy, privacy);
  }

  /** "Ranga przy nicku": which rank's badge shows next to the nick (in game, here and on the friends list), or none. */
  function badgeRow(me: Me): Node[] {
    const choices = badgeChoices(me.ranks ?? [], getLang() === 'en', t);
    if (!choices.length) return [];
    const pick = control<HTMLSelectElement>('select', { className: 'fr-badge-pick' });
    for (const c of choices) pick.append(control<HTMLOptionElement>('option', { value: c.value, textContent: c.label, selected: (me.badgeChoice ?? '') === c.value }));
    pick.addEventListener('change', async () => {
      try {
        const res = await api.socialApi('POST', '/v1/me/badge', { rank: pick.value });
        Object.assign(state!.user!, res);
        renderMe();
      } catch (err) {
        deps.toast(deps.errorText(err), true);
        renderMe();
      }
    });
    const ranks = (me.ranks ?? []).map((r) => {
      const chip = el('span', { className: 'fr-rank-chip' }, rankBadge(r, api.socialRankIcon, renderMe), rankName(r, getLang() === 'en'));
      chip.style.setProperty('--rank', safeColor(r.color));
      return chip;
    });
    return [
      el('div', { className: 'fr-account-section', textContent: t('Ranga przy nicku') }),
      el('div', { className: 'fr-rank-chips' }, ...ranks),
      el('div', { className: 'row fr-badge-row' }, pick, el('span', { className: 'fr-names' }, el('b', {}, ...rankTag(me.badgeRank ?? undefined), me.name))),
      el('small', { className: 'muted', textContent: t('Odznaka widoczna w grze, na liście znajomych i na czacie. Profil publiczny pokazuje wszystkie rangi.') }),
    ];
  }

  /** The launcher's own setting (not the account's): toasts about friends coming online and starting a game. */
  function playingBox() {
    const box = control<HTMLInputElement>('input', { type: 'checkbox', checked: notifyPlaying });
    box.addEventListener('change', async () => {
      notifyPlaying = box.checked;
      await api.saveSettings({ notifyFriendsPlaying: box.checked }).catch(() => undefined);
    });
    return box;
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
    sections.push(...groups.sections());
    sections.push(...communities.sections());
    const sorted = [...list.friends].sort((a, b) => rank(a) - rank(b) || b.lastMessageAt - a.lastMessageAt || a.name.localeCompare(b.name));
    const online = sorted.filter((f) => f.presence.status !== 'offline').length;
    sections.push(el('div', { className: 'fr-section', textContent: t('Znajomi · {0} online', online) }));
    if (!sorted.length) sections.push(el('p', { className: 'muted fr-empty', textContent: t('Nie masz jeszcze znajomych. Wpisz nick powyżej, żeby kogoś zaprosić.') }));
    for (const f of sorted) {
      const row = el('button', { type: 'button', className: `fr-row fr-friend${f.id === selected ? ' selected' : ''}${f.presence.status === 'offline' ? ' is-offline' : ''}` },
        avatar(f, f.presence),
        el('div', { className: 'grow fr-names' }, el('b', {}, ...rankTag(f.badgeRank), ...clanTag(f.clan), f.name, ...(f.stream ? [' ', liveBadge(f.stream)] : [])),
          el('small', { className: `muted${f.stream && !typing.has(f.id) ? ' fr-live-line' : ''}`, textContent: typing.has(f.id) ? t('pisze…') : f.stream ? streamLine(f.stream) : statusLine(f.presence) })),
        f.muted ? el('i', { className: 'fa-solid fa-bell-slash fr-muted', title: t('Wyciszony') }) : '',
        f.unread ? el('span', { className: `fr-unread${f.muted ? ' muted' : ''}`, textContent: String(f.unread) }) : '');
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

  /** A clan's tag in front of a name, as in game: [TAG]. */
  /** The rank badge before a nick (rankBadge.ts); a custom icon that arrives later draws the list again. */
  function rankTag(r: RankView | undefined): (Node | string)[] {
    return r ? [rankBadge(r, api.socialRankIcon, () => { renderList(); if (state?.user) renderMe(); }, rankName(r, getLang() === 'en')), ' '] : [];
  }

  function clanTag(tag: string | undefined): (Node | string)[] {
    return tag ? [el('span', { className: 'fr-clan-tag', textContent: `[${tag}]` }), ' '] : [];
  }

  async function act(fn: () => Promise<FriendList>, done?: string) {
    try {
      list = withStreams(await fn());
      for (const f of list.friends) watch.know(f.id, f.presence);
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
    groups.deselect();
    communities.deselect();
    selected = id;
    stopEditing();
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
      const { messages, editWindowMs }: { messages: Message[]; editWindowMs?: number } = await api.socialApi('GET', `/v1/messages/${id}?limit=${PAGE}${before ? `&before=${before}` : ''}`);
      chat.messages = [...messages, ...chat.messages];
      chat.editWindowMs = editWindowMs;
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

  /** `fresh`: a message just came into the open chat; it never counted as unread here, but the server has it so. */
  async function markRead(id: string, fresh = false) {
    const f = friend(id);
    if (!f || (!f.unread && !fresh)) return;
    f.unread = 0;
    renderList();
    await api.socialApi('POST', `/v1/messages/${id}/read`).catch(() => {});
  }

  // ---------- editing and deleting messages (server 0.9.23+, chatEdits.ts) ----------

  function startEditing(target: { id: number; group?: string; friend?: string; community?: string; channel?: string }, text: string) {
    if (!input) return;
    editing = target;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    editBar.classList.remove('hidden');
    composer.classList.add('editing');
    sendBtn.replaceChildren(icon('fa-check'));
    sendBtn.title = t('Zapisz zmiany');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    // the message is marked in the chat and stays in sight above the editing bar
    if (!target.group && !target.community) renderMessages();
    requestAnimationFrame(() => messagesBox.querySelector('.fr-msg.editing')?.scrollIntoView({ block: 'nearest' }));
  }

  function stopEditing() {
    if (!editing) return;
    const wasGroup = !!editing.group;
    const wasCommunity = !!editing.community;
    editing = undefined;
    if (wasGroup) groups.stopEditing();
    else if (wasCommunity) communities.stopEditing();
    else if (selected) renderMessages();
    if (!input) return;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    editBar.classList.add('hidden');
    composer.classList.remove('editing');
    sendBtn.replaceChildren(icon('fa-paper-plane'));
    sendBtn.title = t('Wyślij');
  }

  async function saveEdit() {
    const target = editing!;
    const text = input.value.trim();
    if (!text) return deps.toast(t('Wiadomość jest pusta.'), true);
    sendBtn.disabled = true;
    try {
      if (target.group) {
        if (await groups.saveEdit(target.group, target.id, text)) stopEditing();
        return;
      }
      if (target.community) {
        if (await communities.saveEdit(target.community, target.channel!, target.id, text)) stopEditing();
        return;
      }
      const { message }: { message: Message } = await api.socialApi('POST', `/v1/messages/${target.friend}/${target.id}/edit`, { text });
      replaced(message);
      stopEditing();
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  async function deleteMessage(m: Message) {
    const other = m.from === state?.user?.id ? m.to : m.from;
    if (!(await confirmDialog({ title: t('Usunąć wiadomość?'), body: [el('p', { className: 'muted', textContent: t('Zniknie u Ciebie i u znajomego. Tego nie da się cofnąć.') })], ok: t('Usuń'), danger: true }))) return;
    try {
      const { message }: { message: Message } = await api.socialApi('DELETE', `/v1/messages/${other}/${m.id}`);
      replaced(message);
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    }
  }

  /** A message changed (edited or deleted, here or elsewhere): its new version in its conversation. */
  function replaced(m: Message) {
    const other = m.from === state?.user?.id ? m.to : m.from;
    const chat = chats.get(other);
    if (chat) chat.messages = replaceMessage(chat.messages, m);
    if (m.deleted && editing?.id === m.id && !editing.group && !editing.community) stopEditing();
    if (other === selected && !groups.active()) renderMessages();
  }

  /** What the "…" by a direct message offers: editing for a while and deleting, both one's own only. */
  function messageMenu(m: Message, windowMs: number | undefined): MenuItem[] {
    const me = state?.user?.id;
    const other = m.from === me ? m.to : m.from;
    const items: MenuItem[] = [];
    if (canEdit(m, me, windowMs)) items.push({ label: t('Edytuj'), icon: 'fa-pen', hint: editHint(m, windowMs!), run: () => startEditing({ id: m.id, friend: other }, m.text) });
    if (canDelete(m, me, windowMs)) items.push({ label: t('Usuń'), icon: 'fa-trash', danger: true, run: () => void deleteMessage(m) });
    return items;
  }

  async function send() {
    if (editing) return saveEdit();
    if (groups.active() || communities.active()) {
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      if (await (communities.active() ? communities.send(text) : groups.send(text))) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
      }
      sendBtn.disabled = false;
      input.focus();
      return;
    }
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

  /** A picture file to the open chat: the launcher scales it, encrypts it and sends it. */
  async function sendPicture(btn: HTMLButtonElement) {
    // a community's channel: not encrypted, kept on the server for its members (communities.ts)
    if (communities.active()) {
      btn.disabled = true;
      await communities.sendPicture();
      btn.disabled = false;
      return;
    }
    if (groups.active()) {
      btn.disabled = true;
      await groups.sendPicture();
      btn.disabled = false;
      return;
    }
    const id = selected;
    if (!id) return;
    btn.disabled = true;
    try {
      const res: { message: Message } | undefined = await api.socialSendImage(id);
      if (res) addMessage(res.message);
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      btn.disabled = false;
    }
  }

  /** A pasted picture's bytes as PNG or JPEG (what the main process reads); others drawn again as PNG. */
  async function pastedBytes(file: File): Promise<Uint8Array | undefined> {
    if (file.type === 'image/png' || file.type === 'image/jpeg') return new Uint8Array(await file.arrayBuffer());
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = el('canvas', { width: bitmap.width, height: bitmap.height }) as HTMLCanvasElement;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
    } catch {
      return undefined;
    }
  }

  /** A pasted picture: a look at it first, then sent like a picked one. */
  async function pastePicture(file: File) {
    const url = URL.createObjectURL(file);
    const community = !!communities.active();
    const ok = await confirmDialog({
      title: t('Wysłać obraz?'),
      body: [el('img', { className: 'fr-paste-preview', src: url, alt: '' }), el('p', { className: 'muted', textContent: community ? t('Obraz zobaczą wszyscy członkowie społeczności (czat społeczności nie jest szyfrowany).') : t('Obraz zostanie zaszyfrowany i wysłany do tej rozmowy.') })],
      ok: t('Wyślij'), okIcon: 'fa-paper-plane',
    });
    URL.revokeObjectURL(url);
    if (!ok) return input.focus();
    const bytes = await pastedBytes(file);
    if (!bytes) return deps.toast(t('Nie udało się odczytać obrazka.'), true);
    if (community && communities.active()) {
      pictureBtn.disabled = true;
      await communities.sendPicture(bytes);
      pictureBtn.disabled = false;
      return input.focus();
    }
    if (groups.active()) {
      pictureBtn.disabled = true;
      await groups.sendPicture(bytes);
      pictureBtn.disabled = false;
      return input.focus();
    }
    const id = selected;
    if (!id) return;
    pictureBtn.disabled = true;
    try {
      const res: { message: Message } | undefined = await api.socialSendImage(id, bytes);
      if (res) addMessage(res.message);
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    } finally {
      pictureBtn.disabled = false;
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
    // a community: pictures where its server has them (not end-to-end encrypted there), and the composer says when one cannot write
    const com = communities.active() ? communities.composerState() : undefined;
    pictureBtn.classList.toggle('hidden', !!com && !communities.picturesHere());
    pictureBtn.title = com ? t('Wyślij obraz (widzą go członkowie społeczności)') : t('Wyślij obraz (zaszyfrowany)');
    input.disabled = !!com && !com.canPost;
    sendBtn.disabled = !!com && !com.canPost;
    input.placeholder = com?.reason ?? t('Napisz wiadomość…');
    if (com) {
      chatBox.classList.remove('empty');
      inviteBar.classList.add('hidden');
      return communities.renderChat(chatHead, messagesBox, typingBox);
    }
    if (groups.active()) {
      chatBox.classList.remove('empty');
      inviteBar.classList.add('hidden');
      return groups.renderChat(chatHead, messagesBox, typingBox);
    }
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
    // their world is open to LAN: the same relay the game uses, then the game started on it
    if (f.presence.status !== 'offline' && f.presence.lan) {
      const join = el('button', { type: 'button', className: 'primary' }, icon('fa-right-to-bracket'), t(' Dołącz do świata'));
      join.addEventListener('click', async () => {
        join.disabled = true;
        try {
          const port = await api.lanJoin(f.id);
          deps.join(`127.0.0.1:${port}`, a?.version?.split(' · ')[0]);
        } catch (err) {
          deps.toast(t('Nie udało się dołączyć do świata: {0}', deps.errorText(err)), true);
        } finally {
          join.disabled = false;
        }
      });
      actions.push(join);
    }
    // live on Twitch or Kick: the stream in the browser
    if (f.stream) {
      const s = f.stream;
      const watch = el('button', { type: 'button', className: 'icon-btn fr-watch', title: `${t('Oglądaj')}: ${s.url}` }, icon('fa-play'));
      watch.addEventListener('click', () => window.open(s.url, '_blank'));
      actions.push(watch);
    }
    // their public profile on the site (server 0.9.22+; an older one answers 404 there)
    const profile = el('button', { type: 'button', className: 'icon-btn feature-profiles', title: t('Pokaż profil') }, icon('fa-id-card'));
    profile.addEventListener('click', () => profileLink(deps, f.handle, 'open'));
    actions.push(profile);
    if (deps.showAchievements) {
      const trophies = el('button', { type: 'button', className: 'icon-btn', title: t('Osiągnięcia') }, icon('fa-trophy'));
      trophies.addEventListener('click', () => deps.showAchievements!(f.id, f.name));
      actions.push(trophies);
    }
    const invite = el('button', { type: 'button', className: 'icon-btn', title: t('Zaproś do gry') }, icon('fa-gamepad'));
    invite.addEventListener('click', () => openInvite(f));
    actions.push(invite);
    // muted: still a friend, messages still come, but no toasts or notifications (on the account, so everywhere)
    const mute = el('button', { type: 'button', className: `icon-btn${f.muted ? ' on' : ''}`, title: f.muted ? t('Wyłącz wyciszenie') : t('Wycisz powiadomienia') }, icon(f.muted ? 'fa-bell-slash' : 'fa-bell'));
    mute.addEventListener('click', () => act(() => api.socialApi('POST', `/v1/friends/${f.id}/mute`, { muted: !f.muted }),
      f.muted ? t('{0} znowu może Cię powiadamiać.', f.name) : t('Wyciszono {0}: wiadomości przyjdą bez powiadomień.', f.name)));
    actions.push(mute);
    const remove = el('button', { type: 'button', className: 'icon-btn danger', title: t('Usuń ze znajomych') }, icon('fa-user-minus'));
    remove.addEventListener('click', () => {
      if (confirm(t('Usunąć {0} ze znajomych?', f.name))) act(() => api.socialApi('DELETE', `/v1/friends/${f.id}`), t('Usunięto {0} ze znajomych.', f.name));
    });
    actions.push(remove);
    chatHead.replaceChildren(avatar(f, f.presence),
      el('div', { className: 'grow fr-names' }, el('b', {}, ...rankTag(f.badgeRank), f.name, ...(f.stream ? [' ', liveBadge(f.stream)] : [])),
        el('small', { className: 'muted', textContent: `@${f.handle} · ${f.stream ? streamLine(f.stream) : statusLine(f.presence)}` })),
      ...actions);
    renderMessages();
    typingBox.textContent = typing.has(f.id) ? t('{0} pisze…', f.name) : '';
  }

  /** "Join me": the server to invite to, filled in with where the player is or played last. */
  async function openInvite(f: Friend) {
    const target = await deps.inviteTarget().catch(() => undefined);
    const address = control<HTMLInputElement>('input', { placeholder: t('Adres serwera, np. skyup.pl'), value: target?.server ?? '', maxLength: 253 });
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const go = el('button', { type: 'submit', className: 'primary' }, icon('fa-paper-plane'), t(' Zaproś'));
    inviteBar.replaceChildren(el('div', { className: 'fr-invite-title' }, icon('fa-gamepad'), el('span', { textContent: t('Zaproś {0} na serwer', f.name) })), address, cancel, go);
    inviteBar.classList.remove('hidden');
    address.focus();
    address.select();
    cancel.addEventListener('click', () => inviteBar.classList.add('hidden'));
    inviteBar.onsubmit = async (e) => {
      e.preventDefault();
      const server = address.value.trim().toLowerCase();
      if (!/^[\w.-]{1,253}(:\d{1,5})?$/.test(server)) return deps.toast(t('To nie wygląda na adres serwera.'), true);
      go.disabled = true;
      try {
        const { message }: { message: Message } = await api.socialApi('POST', `/v1/invites/${f.id}`, { server, version: server === target?.server ? target?.version : undefined });
        addMessage(message);
        inviteBar.classList.add('hidden');
        renderMessages();
      } catch (err) {
        deps.toast(deps.errorText(err), true);
      } finally {
        go.disabled = false;
      }
    };
  }

  /** A picture: decrypted by the launcher on first sight, bigger on click. */
  function imageCard(image: ChatImage, mine: boolean): HTMLElement {
    const card = el('div', { className: `fr-bubble fr-image${mine ? ' mine' : ''}` });
    if (image.unreadable) {
      card.append(icon('fa-image'), el('span', { textContent: t('Obraz zaszyfrowany dla innego urządzenia.') }));
      card.classList.add('unreadable');
      return card;
    }
    // the box keeps the picture's shape while it loads, so the chat does not jump
    const w = image.w && image.h ? Math.min(260, image.w) : 260;
    const h = image.w && image.h ? Math.round((w * image.h) / image.w) : 146;
    const img = el('img', { alt: t('Zrzut ekranu'), width: w, height: h });
    card.append(img, el('i', { className: 'fa-solid fa-lock fr-lock', title: t('Zaszyfrowana od nadawcy do odbiorcy') }));
    let url = pictures.get(image.id);
    if (!url) {
      url = api.socialImage(image.id) as Promise<string>;
      pictures.set(image.id, url);
      // a failed one is asked for again next time
      url.catch(() => pictures.delete(image.id));
    }
    url.then((src) => {
      img.src = src;
      img.addEventListener('click', () => showPicture(src));
    }, () => {
      card.replaceChildren(icon('fa-image'), el('span', { textContent: t('Obrazu już nie ma na serwerze.') }));
      card.classList.add('unreadable');
    });
    return card;
  }

  /** The picture over the whole window; a click or Esc closes it. */
  function showPicture(src: string) {
    const close = () => {
      box.remove();
      removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const box = el('div', { className: 'fr-lightbox' }, el('img', { src, alt: '' }));
    box.addEventListener('click', close);
    addEventListener('keydown', onKey);
    document.body.append(box);
  }

  /** A message; encrypted ones carry a small lock, ones for another launcher say so, edited ones "(edytowano)". */
  function bubble(m: Message) {
    if (m.deleted) return tombstone();
    const b = el('div', { className: `fr-bubble${m.unreadable ? ' unreadable' : ''}`, textContent: m.text });
    if (m.editedAt) b.append(editedLabel(m.editedAt));
    if (m.encrypted) b.append(el('i', { className: 'fa-solid fa-lock fr-lock', title: t('Zaszyfrowana od nadawcy do odbiorcy') }));
    return b;
  }

  function inviteCard(m: Message, mine: boolean): HTMLElement {
    const inv = m.invite!;
    const expired = inviteExpired(inv);
    const card = el('div', { className: `fr-bubble fr-invite${expired ? ' expired' : ''}` }, icon(expired ? 'fa-clock' : 'fa-gamepad'),
      el('div', { className: 'grow' }, el('b', { textContent: expired ? t('Zaproszenie wygasło') : mine ? t('Zaproszenie wysłane') : t('Zaproszenie do gry') }),
        el('small', { textContent: [inv.server, inv.version].filter(Boolean).join(' · ') })));
    if (!mine && !expired) {
      const join = el('button', { type: 'button', className: 'primary' }, icon('fa-right-to-bracket'), t(' Dołącz'));
      join.addEventListener('click', () => joinInvite(inv));
      card.append(join);
    }
    return card;
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
      const content = m.deleted ? bubble(m) : m.invite ? inviteCard(m, m.from === me) : m.waypoint ? waypointCard(m.waypoint, m.from === me, deps.toast) : m.image ? imageCard(m.image, m.from === me) : bubble(m);
      nodes.push(el('div', { className: `fr-msg${m.from === me ? ' mine' : ''}${grouped ? ' grouped' : ''}${editing?.id === m.id && !editing.group ? ' editing' : ''}`, title: new Date(m.at).toLocaleString(locale()) },
        withMenu(content, messageMenu(m, chat.editWindowMs)),
        grouped ? '' : el('small', { className: 'fr-time', textContent: time.format(m.at) })));
      if (m === lastMineRead) nodes.push(el('small', { className: 'fr-read', textContent: t('Przeczytano') }));
      lastDay = d;
      lastFrom = m.from;
      lastAt = m.at;
    }
    messagesBox.replaceChildren(...nodes);
    // the next invite to run out: drawn again then, without its Join
    clearTimeout(inviteTimer);
    const next = Math.min(...chat.messages.map((m) => (m.invite?.expiresAt && !inviteExpired(m.invite) ? m.invite.expiresAt : Infinity)));
    if (next !== Infinity) inviteTimer = setTimeout(renderChat, Math.min(next - Date.now() + 50, 2 ** 31 - 1));
  }
  let inviteTimer: ReturnType<typeof setTimeout> | undefined;

  // ---------- live events ----------

  // a switch in the server's admin panel: the clan, group and community sections are drawn again
  onFeatures(() => {
    if (state?.user) renderList();
  });

  api.on('social:event', async (e: any) => {
    if (groups.onEvent(e)) return updateBadge();
    if (communities.onEvent(e)) return updateBadge();
    switch (e.type) {
      case 'state': {
        const was = state?.user?.id;
        state = e.state;
        if (state?.user?.id !== was) {
          // another SlashClient account (a Minecraft account of someone else was picked): nothing of the old one stays
          selected = undefined;
          chats.clear();
          groups.clear();
          communities.clear();
          watch.clear();
          if (was && state?.user) root.replaceChildren();
          deps.accountChanged?.();
        }
        if (state?.user && state.user.id !== was) await refreshList();
        if (state?.user) void party.refresh();
        if (state?.user && state.user.id !== was) void groups.refresh();
        if (state?.user && state.user.id !== was) void communities.refresh();
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
        const news = watch.update(f.id, f.presence);
        if (news && notifyPlaying && !f.muted) playingNotice(f, news);
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
        if (m.from === selected && isVisible()) markRead(m.from, true);
        else if (f?.muted) f.unread++;
        else if (f) {
          f.unread++;
          if (m.invite) {
            const inv = m.invite;
            deps.toast(t('{0} zaprasza Cię na {1}', f.name, inv.server), false, { label: t('Dołącz'), run: () => joinInvite(inv) });
            if (!document.hasFocus()) systemNotify(f.name, t('{0} zaprasza Cię na {1}', f.name, inv.server), f.id);
          } else if (m.waypoint) notify(f, t('udostępnia punkt {0} ({1}, {2}, {3})', m.waypoint.name, m.waypoint.x, m.waypoint.y, m.waypoint.z));
          else if (m.image) notify(f, t('wysyła zrzut ekranu'));
          else notify(f, m.text);
        }
        renderList();
        if (m.from === selected) renderChat();
        return;
      }
      // edited or deleted, by the author here or on another launcher or in the game: no toast, only the new version
      case 'message-edit':
      case 'message-delete':
        if (e.message) replaced(e.message as Message);
        return;
      case 'party':
        if (e.party) party.onEvent(e.party as Party);
        return;
      // a friend went live, changed the title or ended (streams.ts); `notify`: the server says this one is worth telling
      case 'stream': {
        const f = friend(e.id);
        if (!f) return;
        f.stream = cleanStream(e.stream);
        if (e.notify && f.stream && !f.muted) streamNotice(f, f.stream);
        renderList();
        if (e.id === selected) renderChat();
        return;
      }
      // one's own channels changed (linked here, on the site, or by an admin)
      case 'streams':
        void streamsBox?.refresh();
        return;
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
        if (e.request) {
          const text = t('{0} zaprasza Cię do znajomych.', e.request.name);
          deps.toast(text);
          if (!document.hasFocus()) systemNotify('SlashClient', text);
        }
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
    if (!document.hasFocus()) systemNotify(f.name, text, f.id);
    else deps.toast(t('{0}: {1}', f.name, short));
  }

  /**
   * A friend came online or started a game: a toast in the launcher, or a system notification when
   * it is in the background, unless a game runs (the game shows its own toast then).
   */
  function playingNotice(f: Friend, news: PlayingNews) {
    const text = news.kind === 'online' ? t('{0} jest teraz online', f.name)
      : news.server ? t('{0} gra na {1}', f.name, news.server) : t('{0} zaczyna grać w Minecraft', f.name);
    if (document.hasFocus()) deps.toast(text, false, { label: t('Napisz'), run: () => openChat(f.id) });
    else if (!deps.gameRunning?.()) systemNotify(f.name, text, f.id);
  }

  /** "Ala nadaje na żywo na Twitch: …": a toast with "Oglądaj", or a system notification (the game shows its own). */
  function streamNotice(f: Friend, s: FriendStream) {
    const text = noticeText(f.name, s);
    if (document.hasFocus()) deps.toast(text, false, { label: t('Oglądaj'), run: () => window.open(s.url, '_blank') });
    else if (!deps.gameRunning?.()) systemNotify(f.name, text, f.id);
  }

  function openChat(id: string) {
    document.querySelector<HTMLButtonElement>('.nav[data-view="friends"]')?.click();
    if (friend(id)) void select(id);
  }

  /** A system notification (made in the main process); clicking it opens Friends, and that friend's chat. */
  function systemNotify(title: string, body: string, friendId?: string) {
    void deps.api.notify(title, body, { view: 'friends', friendId }).catch(() => undefined);
  }

  // the player clicked one of those notifications: the launcher is in front again
  deps.api.on('notify:open', (target: { view?: string; friendId?: string }) => {
    if (target?.view !== 'friends') return;
    document.querySelector<HTMLButtonElement>('.nav[data-view="friends"]')?.click();
    if (target.friendId && friend(target.friendId)) void select(target.friendId);
  });

  // marking a chat read when the player comes back to it
  addEventListener('focus', () => {
    if (communities.active() && isVisible()) communities.markRead();
    else if (groups.active() && isVisible()) groups.markRead();
    else if (selected && isVisible()) markRead(selected);
  });

  return {
    /** Called when the view opens. */
    show() {
      if (!state) return refreshState();
      if (!state.user) return refreshState();
      render();
      if (communities.active()) communities.markRead();
      else if (groups.active()) groups.markRead();
      else if (selected) markRead(selected);
    },
    init: refreshState,
  };
}
