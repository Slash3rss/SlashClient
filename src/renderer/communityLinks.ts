import { locale, t } from '../shared/i18n';
import { control, el, icon, modalWindow } from './dialog';

/**
 * Communities, more of them (server 0.9.30+; an older one sends none of it, and nothing of it shows):
 *
 * - Invite links: admins and the owner make links (an expiry and a number of uses), copy them and
 *   revoke them; anyone joins by pasting a link or its code ("Dołącz przez zaproszenie", the link
 *   button by "Społeczności"). The website's page of a link (/c/<code>) says to paste it here: the
 *   launcher registers no slashclient:// address.
 * - Its game server: admins set it in the settings; the header and the catalog show it with a live
 *   ping (players, latency), how many members play there now, and "Dołącz", which opens the usual
 *   join window (a profile with a fitting version picked, or one to make).
 * - Verified: a badge by the name of official communities (set in the site's admin panel).
 */

/** The link's lives the server takes, in minutes (0: never), and its uses (0: unlimited): communityLinks.ts. */
export const LINK_EXPIRIES = [30, 60, 1440, 10080, 0];
export const LINK_USES = [1, 5, 10, 25, 100, 0];

export interface CommunityServer { address: string; version?: string; playing: number }
export interface InviteLink { code: string; url: string; by: { id: string; name: string; handle: string }; createdAt: number; expiresAt: number; maxUses: number; uses: number }
interface PingResult { latency: number; version: string; playersOnline: number; playersMax: number }

/** The code from a code or a whole link pasted (".../c/<code>"), lower case; undefined when it is neither. */
export function linkCodeOf(text: string): string | undefined {
  const m = /(?:^|\/c\/)([A-Za-z0-9]{6,16})\/?(?:[?#].*)?$/.exec(text.trim());
  return m ? m[1].toLowerCase() : undefined;
}

/** "30 min", "1 godz.", "1 dzień", "7 dni", "Nigdy": a link's life to pick. */
export function expiryText(minutes: number): string {
  if (!minutes) return t('Nigdy');
  if (minutes < 60) return t('{0} min', minutes);
  if (minutes < 1440) return t('{0} godz.', minutes / 60);
  return minutes === 1440 ? t('1 dzień') : t('{0} dni', minutes / 1440);
}

/** "1 użycie", "5 użyć", "Bez limitu". */
export const usesText = (n: number) => (!n ? t('Bez limitu') : n === 1 ? t('1 użycie') : t('{0} użyć', n));

/** "wygasa za 3 dni" / "za 25 min" / "bez terminu" and "użyto 2 z 5": a link in the list. */
export function linkStatusText(l: Pick<InviteLink, 'expiresAt' | 'maxUses' | 'uses'>, now = Date.now()): string {
  let left = '';
  if (!l.expiresAt) left = t('bez terminu');
  else {
    const min = Math.max(1, Math.ceil((l.expiresAt - now) / 60_000));
    left = min < 60 ? t('wygasa za {0} min', min) : min < 2880 ? t('wygasa za {0} godz.', Math.ceil(min / 60)) : t('wygasa za {0} dni', Math.ceil(min / 1440));
  }
  const used = l.maxUses ? t('użyto {0} z {1}', l.uses, l.maxUses) : t('użyto {0}', l.uses);
  return `${used} · ${left}`;
}

/** A Minecraft version from what a server says of itself ("Paper 1.21.4", "Velocity 1.8-1.21.4"): the newest; undefined when none. */
export function versionFromPing(text: string | undefined): string | undefined {
  const all = [...(text ?? '').matchAll(/\b1\.(\d{1,2})(?:\.(\d{1,2}))?\b/g)];
  if (!all.length) return undefined;
  const key = (m: RegExpMatchArray) => Number(m[1]) * 100 + Number(m[2] ?? 0);
  return all.reduce((a, b) => (key(b) > key(a) ? b : a))[0];
}

/** "1 członek gra teraz", "3 członków gra teraz". */
export const playingText = (n: number) => (n === 1 ? t('1 członek gra teraz') : t('{0} członków gra teraz', n));

/** The moderation log's words for what this adds. */
export function linkLogName(action: string): string | undefined {
  return ({
    link_create: t('tworzy link zaproszenia'), link_revoke: t('cofa link zaproszenia'), link_join: t('dołącza z linku zaproszenia'), server: t('ustawia serwer gry'),
    admin_verify: t('(administracja) weryfikuje społeczność'), admin_unverify: t('(administracja) zdejmuje weryfikację'),
  } as Record<string, string>)[action];
}

/** The server's errors for this, in the player's language. */
export function linkErrorText(code: string): string | undefined {
  return ({
    invite_not_found: t('Nie ma takiego zaproszenia albo zostało cofnięte.'),
    invite_expired: t('To zaproszenie wygasło albo wykorzystano już wszystkie jego użycia.'),
    too_many_links: t('Ta społeczność ma już najwięcej aktywnych linków. Cofnij któryś.'),
    bad_version: t('Wersja: np. 1.21.4.'),
  } as Record<string, string>)[code];
}

/** Server pings, shared by every place that shows one server (a minute each). */
const pings = new Map<string, { at: number; result?: PingResult; error?: boolean; pending?: boolean }>();
const PING_MS = 60_000;

interface Summary { id: string; name: string; verified?: boolean; server?: CommunityServer; members: number; description: string; logo?: number; visibility: string }

interface Deps {
  api: { socialApi: (method: string, path: string, body?: unknown) => Promise<any>; pingServer?: (address: string) => Promise<PingResult | { offline: string }> };
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** The usual "join server" window (a profile with a fitting version); none: no Dołącz. */
  join?: (address: string, version?: string) => void;
  avatar: (c: { id: string; logo?: number }) => HTMLElement;
  membersText: (n: number) => string;
  /** An answer that carries my list again. */
  take: (res: any) => void;
  /** Opens a community I am in. */
  open: (id: string) => void;
}

export function createCommunityLinks(deps: Deps) {
  const { api } = deps;

  /** The badge of an official community. */
  const badge = () => el('i', { className: 'fa-solid fa-circle-check fr-verified', title: t('Zweryfikowana społeczność') });

  /** The name, with the badge when it is verified. */
  const name = (c: Pick<Summary, 'name' | 'verified'>) => el('b', { className: 'fr-com-name' }, el('span', { className: 'fr-com-name-text', textContent: c.name }), c.verified ? badge() : '');

  /** Ping text into every strip of this server on the screen. */
  function paint(address: string) {
    const p = pings.get(address);
    for (const node of document.querySelectorAll<HTMLElement>('.fr-com-server')) {
      if (node.dataset.address !== address) continue;
      const box = node.querySelector<HTMLElement>('.fr-ping');
      if (!box) continue;
      if (p?.result) {
        box.className = `fr-ping ${p.result.latency < 80 ? 'good' : p.result.latency < 200 ? 'ok' : 'bad'}`;
        box.title = t('{0}/{1} graczy', p.result.playersOnline, p.result.playersMax);
        box.replaceChildren(icon('fa-user'), ` ${p.result.playersOnline}/${p.result.playersMax}`, el('span', { className: 'fr-ping-ms' }, icon('fa-signal'), ` ${p.result.latency} ms`));
      } else if (p?.error) {
        box.className = 'fr-ping off';
        box.textContent = t('Offline');
      } else box.replaceChildren(el('span', { className: 'spinner fr-ping-spin' }));
    }
  }

  async function ping(address: string) {
    const old = pings.get(address);
    if (old && (old.pending || Date.now() - old.at < PING_MS)) return;
    if (!api.pingServer) return;
    pings.set(address, { at: Date.now(), pending: true });
    try {
      const res = await api.pingServer(address);
      pings.set(address, 'offline' in res ? { at: Date.now(), error: true } : { at: Date.now(), result: res });
    } catch {
      pings.set(address, { at: Date.now(), error: true });
    }
    paint(address);
  }

  /** The version to join with: the community's hint, else what the server says it runs. */
  const versionOf = (s: CommunityServer) => s.version || versionFromPing(pings.get(s.address)?.result?.version);

  /** The game server's strip (the header, the catalog, a link's preview): address, live ping, members playing, Dołącz. */
  function serverStrip(s: CommunityServer | undefined, compact = false, joinable = true): HTMLElement | '' {
    if (!s) return '';
    const go = deps.join && joinable ? el('button', { type: 'button', className: 'primary fr-com-server-join', title: t('Uruchom grę i połącz z {0}', s.address) }, icon('fa-play'), ` ${compact ? t('Graj') : t('Dołącz')}`) : '';
    if (go) {
      go.addEventListener('click', (e) => {
        e.stopPropagation();
        deps.join!(s.address, versionOf(s));
      });
    }
    const node = el('div', { className: `fr-com-server${compact ? ' compact' : ''}` },
      icon('fa-cube'),
      el('span', { className: 'fr-com-server-address', textContent: s.address, title: s.version ? `${s.address} · ${s.version}` : s.address }),
      el('span', { className: 'fr-ping' }),
      s.playing > 0 ? el('span', { className: 'fr-com-playing' }, el('span', { className: 'fr-com-playing-dot' }), playingText(s.playing)) : '',
      go);
    node.dataset.address = s.address;
    // drawn first, then filled in (from the cache at once)
    queueMicrotask(() => {
      paint(s.address);
      void ping(s.address);
    });
    return node;
  }

  // ---------- joining with a link or code ----------

  /** "Dołącz przez zaproszenie": a link or a code pasted, the community shown, then in. */
  function joinWindow(prefill = '') {
    const input = control<HTMLInputElement>('input', { placeholder: t('Link zaproszenia albo kod'), maxLength: 200, value: prefill, className: 'grow' });
    const check = el('button', { type: 'button' }, icon('fa-magnifying-glass'), ` ${t('Sprawdź')}`);
    const result = el('div', { className: 'fr-com-invite-preview' });
    let asked = '';
    const look = async () => {
      const code = linkCodeOf(input.value);
      if (!code) {
        if (input.value.trim()) result.replaceChildren(el('p', { className: 'muted', textContent: t('To nie wygląda na link ani kod zaproszenia.') }));
        return;
      }
      if (code === asked) return;
      asked = code;
      result.replaceChildren(el('div', { className: 'fr-placeholder' }, el('span', { className: 'spinner' })));
      try {
        const res = await api.socialApi('GET', `/v1/communities/links/${code}`);
        if (asked === code) show(code, res);
      } catch (err) {
        if (asked !== code) return;
        asked = '';
        result.replaceChildren(el('p', { className: 'fr-com-invite-error', textContent: deps.errorText(err) }));
      }
    };
    const show = (code: string, res: { community: Summary & { state: string }; expiresAt: number; usesLeft?: number }) => {
      const c = res.community;
      const states: Record<string, [string, string, boolean]> = {
        open: [t('Dołącz'), 'fa-right-to-bracket', true], member: [t('Otwórz'), 'fa-comments', true],
        banned: [t('Zablokowano Cię'), 'fa-ban', false], full: [t('Pełna'), 'fa-circle-xmark', false],
      };
      const [label, ico, enabled] = states[c.state] ?? states.open;
      const go = el('button', { type: 'button', className: c.state === 'member' ? '' : 'primary', disabled: !enabled }, icon(ico), ` ${label}`);
      go.addEventListener('click', async () => {
        if (c.state === 'member') {
          close();
          return deps.open(c.id);
        }
        go.disabled = true;
        try {
          const joined = await api.socialApi('POST', `/v1/communities/links/${code}/join`);
          deps.take(joined);
          deps.toast(t('Dołączono do społeczności {0}.', c.name));
          close();
          deps.open(joined.id ?? c.id);
        } catch (err) {
          go.disabled = false;
          deps.toast(deps.errorText(err), true);
        }
      });
      const limits = [res.expiresAt ? t('ważne do {0}', new Date(res.expiresAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })) : '', res.usesLeft !== undefined ? t('pozostało użyć: {0}', res.usesLeft) : ''].filter(Boolean).join(' · ');
      result.replaceChildren(el('div', { className: 'fr-row fr-com-dir-row' }, deps.avatar(c),
        el('div', { className: 'grow fr-names' }, name(c),
          el('small', { className: 'muted', textContent: [deps.membersText(c.members), c.visibility === 'private' ? t('prywatna') : ''].filter(Boolean).join(' · ') }),
          c.description ? el('small', { className: 'fr-com-desc', textContent: c.description }) : '',
          serverStrip(c.server, true, false)),
        go), limits ? el('small', { className: 'muted', textContent: limits }) : '');
    };
    check.addEventListener('click', () => {
      asked = '';
      void look();
    });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && check.click());
    // a pasted link is looked up at once
    input.addEventListener('input', () => linkCodeOf(input.value) && void look());
    const close = modalWindow(t('Dołącz przez zaproszenie'), [
      el('p', { className: 'muted', textContent: t('Wklej link (np. slashclient.pl/c/abcd2345) albo sam kod. Zaproszenie działa też do prywatnych społeczności.') }),
      el('div', { className: 'row' }, input, check), result,
    ], [], undefined, 'fr-group-modal fr-com-modal');
    input.focus();
    if (prefill) void look();
  }

  // ---------- managing links ----------

  /** The community's invite links: make one (expiry, uses), copy, revoke. */
  function linksWindow(c: { id: string; name: string }) {
    const expiry = control<HTMLSelectElement>('select', { title: t('Wygasa po') });
    for (const m of LINK_EXPIRIES) expiry.append(el('option', { value: String(m), textContent: expiryText(m) }));
    expiry.value = '10080';
    const uses = control<HTMLSelectElement>('select', { title: t('Liczba użyć') });
    for (const n of LINK_USES) uses.append(el('option', { value: String(n), textContent: usesText(n) }));
    uses.value = '0';
    const make = el('button', { type: 'button', className: 'primary' }, icon('fa-link'), ` ${t('Utwórz link')}`);
    const rows = el('div', { className: 'fr-clan-members fr-com-links' });
    const copy = async (url: string) => {
      await navigator.clipboard.writeText(url).catch(() => undefined);
      deps.toast(t('Skopiowano link zaproszenia.'));
    };
    const load = async () => {
      let res: { links: InviteLink[] };
      try {
        res = await api.socialApi('GET', `/v1/communities/${c.id}/links`);
      } catch (err) {
        return rows.replaceChildren(el('p', { className: 'muted fr-empty', textContent: deps.errorText(err) }));
      }
      rows.replaceChildren(...res.links.map((l) => {
        const copyBtn = el('button', { type: 'button', className: 'icon-btn', title: t('Kopiuj link') }, icon('fa-copy'));
        copyBtn.addEventListener('click', () => void copy(l.url));
        const revoke = el('button', { type: 'button', className: 'icon-btn danger', title: t('Cofnij link') }, icon('fa-xmark'));
        revoke.addEventListener('click', async () => {
          try {
            await api.socialApi('DELETE', `/v1/communities/${c.id}/links/${l.code}`);
            deps.toast(t('Link cofnięty: już nikogo nie wpuści.'));
          } catch (err) {
            deps.toast(deps.errorText(err), true);
          }
          void load();
        });
        return el('div', { className: 'fr-row fr-com-link' },
          el('div', { className: 'grow fr-names' }, el('b', { className: 'fr-com-link-code', textContent: l.url.replace(/^https?:\/\//, '') }),
            el('small', { className: 'muted', textContent: `${linkStatusText(l)} · ${t('utworzył(a) {0}', l.by.name)}` })),
          copyBtn, revoke);
      }));
      if (!rows.childElementCount) rows.append(el('p', { className: 'muted fr-empty', textContent: t('Brak aktywnych linków. Utwórz pierwszy i wyślij go znajomym.') }));
    };
    make.addEventListener('click', async () => {
      make.disabled = true;
      try {
        const res = await api.socialApi('POST', `/v1/communities/${c.id}/links`, { minutes: Number(expiry.value), uses: Number(uses.value) });
        await navigator.clipboard.writeText(res.link.url).catch(() => undefined);
        deps.toast(t('Link utworzony i skopiowany: {0}', res.link.url));
        void load();
      } catch (err) {
        deps.toast(deps.errorText(err), true);
      } finally {
        make.disabled = false;
      }
    });
    modalWindow(t('Linki zaproszeń: {0}', c.name), [
      el('p', { className: 'muted', textContent: t('Kto ma link, dołącza od razu, także do prywatnej społeczności lub takiej „na prośbę” (bany dalej działają). Link otwiera stronę z kodem do wklejenia w launcherze.') }),
      el('div', { className: 'row fr-com-link-make' }, el('label', { className: 'fr-com-link-pick' }, el('small', { className: 'muted', textContent: t('Wygasa po') }), expiry),
        el('label', { className: 'fr-com-link-pick' }, el('small', { className: 'muted', textContent: t('Liczba użyć') }), uses), make),
      el('h3', { textContent: t('Aktywne linki') }), rows,
    ], [], undefined, 'fr-group-modal fr-com-modal');
    void load();
  }

  // ---------- the game server in the settings ----------

  /** "Serwer gry" in the settings: its address and a version hint (admins and the owner). */
  function serverSection(c: { id: string; server?: CommunityServer }, saved: () => void): Node[] {
    const address = control<HTMLInputElement>('input', { placeholder: t('Adres serwera, np. mc.example.pl'), value: c.server?.address ?? '', maxLength: 260, className: 'grow' });
    const version = control<HTMLInputElement>('input', { placeholder: t('Wersja (opcjonalnie), np. 1.21.4'), value: c.server?.version ?? '', maxLength: 10, className: 'fr-com-version' });
    const save = el('button', { type: 'button', className: 'primary' }, t('Zapisz serwer'));
    const send = async (body: { address: string; version?: string }, done: string) => {
      save.disabled = true;
      try {
        await api.socialApi('POST', `/v1/communities/${c.id}/server`, body);
        deps.toast(done);
        saved();
      } catch (err) {
        deps.toast(deps.errorText(err), true);
      } finally {
        save.disabled = false;
      }
    };
    save.addEventListener('click', () => void send({ address: address.value.trim(), version: version.value.trim() }, address.value.trim() ? t('Zapisano serwer gry.') : t('Usunięto serwer gry.')));
    const tools: Node[] = [save];
    if (c.server) {
      const remove = el('button', { type: 'button', className: 'danger' }, icon('fa-trash'), ` ${t('Usuń serwer')}`);
      remove.addEventListener('click', () => void send({ address: '' }, t('Usunięto serwer gry.')));
      tools.push(remove);
    }
    return [el('h3', { textContent: t('Serwer gry') }),
      el('small', { className: 'muted', textContent: t('Członkowie zobaczą go w nagłówku i w katalogu, z liczbą graczy i przyciskiem „Dołącz”, który od razu uruchamia grę na tym serwerze.') }),
      el('div', { className: 'row' }, address, version), el('div', { className: 'row fr-clan-leave' }, ...tools)];
  }

  return { name, badge, serverStrip, joinWindow, linksWindow, serverSection };
}
