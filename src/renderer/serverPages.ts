import { locale, t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * The server list's votes and server pages in the "Serwery" view.
 *
 * Votes: one click on a card's thumbs-up votes for the server on lista.slash3rss.dev as the player's
 * Minecraft name, which the SlashClient server vouches for (server/src/serverVotes.ts), so there is
 * no captcha. The list allows one vote per nick and per address a day; "Zagłosowano dziś" comes from
 * the list too. Without a SlashClient account, or when the server's admin has not set voting up,
 * the button leads to the server's page on the list's website instead.
 *
 * The server page: banner, icon, address, MOTD, description, modes and versions, players now and over
 * the last 30 days, votes, reviews (read only) and the links, with the big "Graj" of the list's cards.
 */

/** As in app.ts: what the cards know about a server. */
export interface PagedServer {
  id: string; name: string; ip: string; description: string; motdHtml: string[]; motdClean: string[];
  modes: string[]; versions: string[]; votes: number; online: boolean; playersOnline: number; playersMax: number;
  hasIcon: boolean; promoted: boolean; featured: boolean; website?: string; discord?: string;
}
interface Live { latency: number; version: string; playersOnline: number; playersMax: number; favicon?: string }
interface Details {
  server: PagedServer & { views: number; peakPlayers: number; createdAt?: number; hasBanner: boolean; versionText: string };
  history: [number, number][];
  reviews: { user: string; avatar?: string; rating: number; content: string; at: number }[];
}

export interface ServerPagesDeps {
  api: any;
  toast: (message: string, isError?: boolean, action?: { label: string; run: () => void }) => void;
  errorText: (err: unknown) => string;
  /** The list's API, for icons and banners. */
  listApi: string;
  /** A server's MOTD as the cards show it (live from the ping, else the list's). */
  motd: (s: PagedServer) => HTMLElement;
  live: (s: PagedServer) => Live | undefined;
  /** The answer of a ping made here goes back to the cards' cache. */
  pinged: (s: PagedServer, result: Live | undefined, error?: string) => void;
  openJoin: (s: PagedServer) => void;
  /** Opens the Friends view, where one signs in to SlashClient. */
  signIn: () => void;
}

const SITE = 'https://lista.slash3rss.dev';
const DAY = 86_400_000;
/** The answers of /voted are asked again after this long. */
const RECHECK_MS = 2 * 60_000;

export function createServerPages(view: HTMLElement, deps: ServerPagesDeps) {
  const { api, toast, errorText } = deps;

  // ---------- votes ----------

  /** undefined: not asked yet (a click tries to vote); false: off on the server, the website instead. */
  let enabled: boolean | undefined;
  /** The name the server votes as; null: not signed in to SlashClient. */
  let nick: string | null | undefined;
  /** The account has no Minecraft account linked (the launcher links the chosen one when voting). */
  let linked: boolean | undefined;
  const votedAt = new Map<string, number>();
  const counts = new Map<string, number>();
  const checkedAt = new Map<string, number>();
  const voting = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = new Set<string>();

  // ---------- a server's details: kept, asked for once at a time ----------

  /** Pages seen in this run: shown again at once, refreshed behind when older than FRESH_MS. */
  const details = new Map<string, { d: Details; at: number }>();
  const asking = new Map<string, Promise<Details>>();
  /** The players' history, which the list answers slowly: asked apart, drawn into the chart when it comes. */
  const histories = new Map<string, { h: [number, number][]; at: number }>();
  const askingHistory = new Map<string, Promise<[number, number][]>>();
  function fetchHistory(id: string): Promise<[number, number][]> {
    const going = askingHistory.get(id);
    if (going) return going;
    const p = (api.serverHistory(id) as Promise<[number, number][]>).then((h) => {
      histories.set(id, { h, at: Date.now() });
      return h;
    }).finally(() => askingHistory.delete(id));
    askingHistory.set(id, p);
    return p;
  }
  const FRESH_MS = 60_000;
  const KEEP_MS = 60 * 60_000;
  function fetchDetails(id: string): Promise<Details> {
    const going = asking.get(id);
    if (going) return going;
    const p = (api.serverDetails(id, false) as Promise<Details>).then((d) => {
      details.set(id, { d, at: Date.now() });
      return d;
    }).finally(() => asking.delete(id));
    asking.set(id, p);
    return p;
  }
  /** Starts fetching a server's page before it is opened (the pointer over its card). */
  function prefetch(s: PagedServer) {
    if (!s.id) return;
    const kept = details.get(s.id);
    if (!kept || Date.now() - kept.at >= FRESH_MS) void fetchDetails(s.id).catch(() => undefined);
    const keptHistory = histories.get(s.id);
    if (!keptHistory || Date.now() - keptHistory.at >= FRESH_MS) void fetchHistory(s.id).catch(() => undefined);
  }

  const siteUrl = (s: PagedServer) => `${SITE}/server/${encodeURIComponent(s.id)}`;
  const openSite = (s: PagedServer) => window.open(siteUrl(s), '_blank');
  const countOf = (s: PagedServer) => counts.get(s.id) ?? s.votes;
  const votedToday = (id: string) => {
    const at = votedAt.get(id);
    return !!at && Date.now() - at < DAY;
  };
  const nextVote = (id: string) => {
    const left = (votedAt.get(id) ?? 0) + DAY - Date.now();
    const h = Math.floor(left / 3_600_000);
    const m = Math.max(1, Math.ceil((left % 3_600_000) / 60_000));
    return h ? t('{0} godz. {1} min', h, m) : t('{0} min', m);
  };

  function paint(btn: HTMLButtonElement, s: PagedServer) {
    const big = btn.classList.contains('vote-big');
    const done = votedToday(s.id);
    const busy = voting.has(s.id);
    btn.classList.toggle('voted', done);
    btn.classList.toggle('busy', busy);
    btn.title = done ? t('Zagłosowano dziś. Kolejny głos za {0}.', nextVote(s.id))
      : enabled === false ? t('Głosuj na stronie listy serwerów')
        : t('Głosuj na ten serwer');
    const count = el('b', { textContent: String(countOf(s)) });
    const i = icon(busy ? 'fa-spinner fa-spin' : done ? 'fa-circle-check' : 'fa-thumbs-up');
    if (big) btn.replaceChildren(i, ' ', done ? t('Zagłosowano dziś') : enabled === false ? t('Głosuj na stronie') : t('Głosuj'), el('span', { className: 'vote-count' }, count));
    else btn.replaceChildren(i, count);
  }

  function paintAll(id: string) {
    for (const b of view.querySelectorAll<HTMLButtonElement>('[data-vote-id]')) {
      if (b.dataset.voteId !== id) continue;
      const s = (b as HTMLButtonElement & { server?: PagedServer }).server;
      if (s) paint(b, s);
    }
    // the details page shows the votes as a number too
    const stat = view.querySelector<HTMLElement>(`.sp-votes[data-id="${CSS.escape(id)}"]`);
    if (stat) stat.textContent = String(counts.get(id) ?? stat.textContent);
  }

  /** The thumbs-up with the count, for a card (small) or the server page (big, "Głosuj"). */
  function voteButton(s: PagedServer, big = false): HTMLButtonElement {
    const btn = el('button', { type: 'button', className: `vote-btn${big ? ' vote-big' : ''}` }) as HTMLButtonElement & { server?: PagedServer };
    btn.dataset.voteId = s.id;
    btn.server = s;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void vote(s);
    });
    paint(btn, s);
    return btn;
  }

  /** Asks (a moment later, together) whether the player voted today for the servers shown. */
  function checkVotes(ids: string[], force = false) {
    for (const id of ids) if (id && (force || Date.now() - (checkedAt.get(id) ?? 0) > RECHECK_MS)) pending.add(id);
    if (!pending.size) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const batch = [...pending].slice(0, 100);
      pending = new Set([...pending].slice(100));
      for (const id of batch) checkedAt.set(id, Date.now());
      try {
        const res: { enabled: boolean; nick: string | null; linked?: boolean; voted: Record<string, number> } = await api.serverVoted(batch);
        enabled = res.enabled;
        nick = res.nick;
        linked = res.linked;
        for (const id of batch) {
          const at = res.voted?.[id];
          if (at) votedAt.set(id, at);
          else if (at === 0) votedAt.delete(id);
        }
      } catch {
        // offline or signed out midway: a click still tries, and says what is wrong
        for (const id of batch) checkedAt.delete(id);
      }
      for (const id of batch) paintAll(id);
      if (pending.size) checkVotes([]);
    }, 250);
  }

  async function vote(s: PagedServer) {
    if (voting.has(s.id)) return;
    if (votedToday(s.id)) return toast(t('Dziś już głosowano na {0}. Kolejny głos za {1}.', s.name, nextVote(s.id)));
    if (enabled === false) return openSite(s);
    const website = { label: t('Głosuj na stronie'), run: () => openSite(s) };
    // signed out (a signed-in account without a linked Minecraft account says linked: false and still tries:
    // the launcher links the chosen Microsoft account on the way)
    if (enabled && nick === null && linked !== false) {
      return toast(t('Zaloguj się do konta SlashClient (Znajomi), aby głosować jednym kliknięciem. Możesz też zagłosować na stronie listy.'), true, { label: t('Zaloguj się'), run: deps.signIn });
    }
    voting.add(s.id);
    paintAll(s.id);
    try {
      const res: { nick: string; votes: number | null } = await api.serverVote(s.id);
      votedAt.set(s.id, Date.now());
      counts.set(s.id, res.votes ?? countOf(s) + 1);
      nick = res.nick;
      linked = true;
      toast(t('Zagłosowano na {0} jako {1}. Dzięki!', s.name, res.nick));
    } catch (err) {
      const code = /social:([\w:]+)/.exec(String((err as Error)?.message ?? err))?.[1] ?? '';
      if (code === 'unauthorized') {
        nick = null;
        toast(t('Zaloguj się do konta SlashClient (Znajomi), aby głosować jednym kliknięciem. Możesz też zagłosować na stronie listy.'), true, { label: t('Zaloguj się'), run: deps.signIn });
      } else if (code === 'mc_not_linked' || code === 'mc_account_not_linked') {
        linked = false;
        toast(t('Twoje konto Minecraft nie jest połączone z kontem SlashClient. Wybierz w Kontach konto Microsoft (połączy się samo przy głosowaniu) albo zagłosuj na stronie listy.'), true, website);
      } else if (code === 'not_verified') {
        toast(t('Mojang nie potwierdził konta Minecraft. Zaloguj się do niego ponownie w Kontach i spróbuj jeszcze raz.'), true, website);
      } else if (code === 'already_voted') {
        votedAt.set(s.id, Date.now());
        toast(t('Dziś już głosowałeś na {0}. Kolejny głos jutro.', s.name));
      } else if (code === 'already_voted_ip') {
        toast(t('Z Twojego adresu IP ktoś już dziś głosował na {0}. Lista pozwala na jeden głos dziennie z jednego adresu.', s.name), true);
      } else if (code === 'votes_unavailable') {
        enabled = false;
        toast(t('Głosowanie z launchera jest chwilowo wyłączone. Zagłosuj na stronie listy.'), true, website);
      } else if (code === 'server_not_found') {
        toast(t('Tego serwera nie ma już na liście.'), true);
      } else {
        toast(t('Nie udało się zagłosować: {0}', errorText(err)), true, website);
      }
    } finally {
      voting.delete(s.id);
      paintAll(s.id);
    }
  }

  // ---------- the server page ----------

  const page = el('div', { className: 'server-page hidden' });
  view.append(page);
  let openId: string | undefined;
  let seq = 0;

  function close() {
    openId = undefined;
    seq++;
    view.classList.remove('server-open');
    page.classList.add('hidden');
    page.replaceChildren();
  }

  function statCard(label: string, value: Node | string, note = '', i = 0) {
    const c = el('div', { className: 'stat-card glass-panel' }, el('small', { textContent: label }), typeof value === 'string' ? el('b', { textContent: value }) : value, el('span', { textContent: note }));
    c.style.animationDelay = `${i * 40}ms`;
    return c;
  }

  const fmtNum = (n: number) => n.toLocaleString(locale());
  const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

  /** Players over a range as bars (the statistics' look): the average in each part, the most in the tooltip. */
  function playerChart(history: [number, number][], range: '24h' | '7d' | '30d') {
    const span = range === '24h' ? DAY : range === '7d' ? 7 * DAY : 30 * DAY;
    const parts = range === '24h' ? 24 : range === '7d' ? 42 : 30;
    const end = Date.now();
    const start = end - span;
    const step = span / parts;
    const buckets = Array.from({ length: parts }, (_, i) => ({ from: start + i * step, sum: 0, n: 0, max: 0 }));
    for (const [at, players] of history) {
      if (at < start || at > end) continue;
      const b = buckets[Math.min(parts - 1, Math.floor((at - start) / step))];
      b.sum += players;
      b.n++;
      b.max = Math.max(b.max, players);
    }
    const avg = buckets.map((b) => (b.n ? b.sum / b.n : 0));
    const top = Math.max(1, ...avg);
    const label = (ms: number) => range === '24h'
      ? new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
      : new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', ...(range === '7d' ? { hour: '2-digit' } : {}) });
    const chart = el('div', { className: 'day-chart sp-chart' }, ...buckets.map((b, i) => {
      const bar = el('div', { className: b.n ? '' : 'zero', title: b.n ? t('{0}: średnio {1}, najwięcej {2} graczy', label(b.from), Math.round(avg[i]), b.max) : t('{0}: brak danych', label(b.from)) });
      bar.style.height = `${Math.max(3, (avg[i] / top) * 100)}%`;
      bar.style.animationDelay = `${Math.min(i * 10, 400)}ms`;
      return bar;
    }));
    const peak = Math.max(0, ...buckets.map((b) => b.max));
    return el('div', { className: 'sp-chart-wrap' }, chart,
      el('div', { className: 'day-axis' }, el('span', { textContent: label(start) }), el('span', { textContent: peak ? t('najwięcej: {0}', peak) : '' }), el('span', { textContent: t('teraz') })));
  }

  function stars(rating: number) {
    return el('span', { className: 'sp-stars', title: t('{0} na 5', rating) }, ...Array.from({ length: 5 }, (_, i) => el('i', { className: `${i < rating ? 'fa-solid' : 'fa-regular'} fa-star` })));
  }

  function render(given: Details | undefined, base: PagedServer) {
    // not here yet: the page from what the list already says, placeholders for the rest
    const loading = !given;
    const d: Details = given ?? { server: { ...base, views: 0, peakPlayers: 0, hasBanner: false, versionText: '' }, history: [], reviews: [] };
    let history = histories.get(base.id)?.h;
    const sk = (cls = '') => el('span', { className: `sk sk-inline ${cls}` });
    const s = { ...base, ...d.server, id: base.id || d.server.id };
    const live = deps.live(s);
    const iconImg = el('img', { className: 'server-icon sp-icon', alt: '' });
    iconImg.src = live?.favicon ?? (s.hasIcon ? `${deps.listApi}/servers/${encodeURIComponent(s.id)}/icon` : 'logo.png');

    const back = el('button', { type: 'button', className: 'sp-back' }, icon('fa-arrow-left'), ' ', t('Serwery'));
    back.addEventListener('click', close);

    const copy = el('button', { type: 'button', className: 'icon-btn', title: t('Kopiuj IP') }, icon('fa-copy'));
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(s.ip);
      toast(t('Skopiowano {0}', s.ip));
    });
    const play = el('button', { type: 'button', className: 'primary sp-play' }, icon('fa-play'), ' ', t('Graj'));
    play.addEventListener('click', () => deps.openJoin(s));
    const links: HTMLButtonElement[] = [];
    for (const [url, cls, label] of [[s.website, 'fa-solid fa-globe', t('Strona serwera')], [s.discord, 'fa-brands fa-discord', 'Discord']] as const) {
      if (!url?.startsWith('https://')) continue;
      const b = el('button', { type: 'button', className: 'icon-btn', title: label }, el('i', { className: cls }));
      b.addEventListener('click', () => window.open(url, '_blank'));
      links.push(b);
    }
    const onList = el('button', { type: 'button', className: 'icon-btn', title: t('Otwórz na lista.slash3rss.dev') }, icon('fa-arrow-up-right-from-square'));
    onList.addEventListener('click', () => openSite(s));

    const title = el('div', { className: 'server-title' }, el('h2', { textContent: s.name }));
    if (s.promoted) title.append(el('span', { className: 'tag promo', textContent: t('Promowany') }));
    const hero = el('div', { className: 'sp-hero glass-panel' });
    if (d.server.hasBanner) {
      const banner = el('img', { className: 'sp-banner', alt: '' });
      banner.src = `${deps.listApi}/servers/${encodeURIComponent(s.id)}/banner`;
      banner.addEventListener('error', () => banner.remove());
      hero.append(banner);
    }
    hero.append(el('div', { className: 'sp-head' }, iconImg,
      el('div', { className: 'sp-name' }, title, el('div', { className: 'sp-ip' }, el('code', { textContent: s.ip }), copy)),
      el('div', { className: 'sp-actions' }, play, voteButton(s, true), ...links, onList)));

    const playersNow = el('b', { className: 'sp-players-now', textContent: live ? `${live.playersOnline} / ${live.playersMax}` : s.online ? `${s.playersOnline} / ${s.playersMax}` : t('Offline') });
    const pingNote = el('span', { className: 'sp-ping-note', textContent: live ? t('ping {0} ms', live.latency) : '' });
    const nowCard = statCard(t('Gracze teraz'), playersNow, '', 0);
    nowCard.lastElementChild!.replaceWith(pingNote);
    const votes = el('b', { className: 'sp-votes', textContent: String(countOf(s)) });
    votes.dataset.id = s.id;
    const stats = el('div', { className: 'stat-cards' },
      nowCard,
      statCard(t('Rekord graczy'), loading ? sk() : fmtNum(d.server.peakPlayers || 0), '', 1),
      statCard(t('Głosy'), votes, t('jeden głos dziennie'), 2),
      statCard(t('Wyświetlenia'), loading ? sk() : fmtNum(d.server.views || 0), t('na liście'), 3),
      statCard(t('Na liście od'), loading ? sk() : d.server.createdAt ? fmtDay(d.server.createdAt) : '—', '', 4));

    // about: MOTD, description, modes and versions (the server's own words: never translated)
    const about = el('div', { className: 'glass-panel sp-panel' }, el('h3', { textContent: t('O serwerze') }), deps.motd(s));
    if (s.description) {
      const text = el('p', { className: 'sp-desc', textContent: s.description });
      text.dataset.noI18n = '';
      about.append(text);
    }
    if (s.modes.length) about.append(el('small', { className: 'muted', textContent: t('Tryby') }), el('div', { className: 'sp-chips' }, ...s.modes.map((m) => el('span', { className: 'tag mode', textContent: m }))));
    const versions = s.versions.length ? s.versions : d.server.versionText ? [d.server.versionText] : [];
    if (versions.length) about.append(el('small', { className: 'muted', textContent: t('Wersje') }), el('div', { className: 'sp-chips' }, ...versions.slice(0, 40).map((v) => el('span', { className: 'tag mode', textContent: v }))));
    about.querySelectorAll('.tag').forEach((n) => ((n as HTMLElement).dataset.noI18n = ''));
    title.querySelector('h2')!.dataset.noI18n = '';

    // players over time
    let range: '24h' | '7d' | '30d' = '24h';
    const chartBox = el('div');
    const tabs = el('div', { className: 'segmented' });
    const drawChart = () => {
      chartBox.replaceChildren(!history ? el('div', { className: 'sk sp-chart-sk' })
        : history.length ? playerChart(history, range) : el('p', { className: 'muted', textContent: t('Lista nie ma jeszcze historii graczy tego serwera.') }));
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.range === range));
    };
    for (const [r, label] of [['24h', t('24 godziny')], ['7d', t('7 dni')], ['30d', t('30 dni')]] as const) {
      const b = el('button', { type: 'button', textContent: label });
      b.dataset.range = r;
      b.addEventListener('click', () => {
        range = r;
        drawChart();
      });
      tabs.append(b);
    }
    drawChart();
    // the history on its way: the chart is drawn when it comes (this page still open)
    if (!history || Date.now() - (histories.get(base.id)?.at ?? 0) >= FRESH_MS) {
      void fetchHistory(base.id).then((h) => {
        if (openId !== base.id || !chartBox.isConnected) return;
        if (history && JSON.stringify(history) === JSON.stringify(h)) return;
        history = h;
        drawChart();
      }).catch(() => {
        if (openId !== base.id || !chartBox.isConnected || history) return;
        history = [];
        drawChart();
      });
    }
    const players = el('div', { className: 'glass-panel sp-panel' }, el('div', { className: 'sp-panel-head' }, el('h3', { textContent: t('Gracze') }), tabs), chartBox);

    // reviews, read only (written on the website)
    const reviews = el('div', { className: 'glass-panel sp-panel' });
    const avg = d.reviews.length ? d.reviews.reduce((a, r) => a + r.rating, 0) / d.reviews.length : 0;
    const write = el('button', { type: 'button' }, icon('fa-pen'), ' ', t('Napisz opinię na stronie'));
    write.addEventListener('click', () => openSite(s));
    reviews.append(el('div', { className: 'sp-panel-head' },
      el('h3', { textContent: loading ? t('Opinie') : t('Opinie ({0})', d.reviews.length) }),
      d.reviews.length ? el('span', { className: 'sp-avg' }, stars(Math.round(avg)), ` ${avg.toFixed(1).replace('.', locale().startsWith('pl') ? ',' : '.')}`) : '',
      el('span', { className: 'grow' }), write));
    if (loading) reviews.append(...[0, 1].map(() => el('div', { className: 'sp-review' }, el('span', { className: 'sp-avatar sk' }), el('div', { className: 'grow' }, sk('short'), sk('line')))));
    else if (!d.reviews.length) reviews.append(el('p', { className: 'muted', textContent: t('Nikt jeszcze nie ocenił tego serwera.') }));
    for (const r of d.reviews) {
      const avatar = r.avatar ? el('img', { className: 'sp-avatar', alt: '', loading: 'lazy', src: r.avatar }) : el('span', { className: 'sp-avatar' }, icon('fa-user'));
      const text = el('p', { textContent: r.content });
      text.dataset.noI18n = '';
      const who = el('b', { textContent: r.user });
      who.dataset.noI18n = '';
      reviews.append(el('div', { className: 'sp-review' }, avatar,
        el('div', { className: 'grow' }, el('div', { className: 'sp-review-head' }, who, stars(r.rating), el('small', { className: 'muted', textContent: r.at ? fmtDay(r.at) : '' })), text)));
    }

    page.replaceChildren(el('div', { className: 'sp-top' }, back), hero, stats, el('div', { className: 'sp-grid' }, about, players), reviews);

    // the live status, when the list's cards did not ping it yet (once: not again for the full page)
    if (!live && !pinging.has(s.id)) {
      pinging.add(s.id);
      void api.pingServer(s.ip).then((res: Live | { offline: string }) => {
        if (openId !== base.id) return;
        const now = page.querySelector<HTMLElement>('.sp-players-now');
        if ('offline' in res) {
          deps.pinged(s, undefined, res.offline);
          if (now) now.textContent = t('Offline');
          return;
        }
        deps.pinged(s, res);
        if (now) now.textContent = `${res.playersOnline} / ${res.playersMax}`;
        const note = page.querySelector<HTMLElement>('.sp-ping-note');
        if (note) note.textContent = t('ping {0} ms', res.latency);
        const img = page.querySelector<HTMLImageElement>('.sp-icon');
        if (res.favicon && img) img.src = res.favicon;
      }).catch(() => {}).finally(() => pinging.delete(s.id));
    }
  }
  const pinging = new Set<string>();

  async function open(s: PagedServer) {
    if (!s.id) return;
    openId = s.id;
    const mine = ++seq;
    view.classList.add('server-open');
    page.classList.remove('hidden');
    const kept = details.get(s.id);
    const usable = kept && Date.now() - kept.at < KEEP_MS ? kept : undefined;
    render(usable?.d, s);
    view.scrollTop = 0;
    page.scrollIntoView({ block: 'start' });
    checkVotes([s.id], true);
    // seen a moment ago: nothing to ask
    if (usable && Date.now() - usable.at < FRESH_MS) return;
    try {
      const d: Details = await fetchDetails(s.id);
      if (mine !== seq) return;
      // shown from memory and nothing changed: the page stays as it is (no redraw, the chart keeps its range)
      if (usable && JSON.stringify(usable.d) === JSON.stringify(d)) return;
      render(d, s);
    } catch (err) {
      // the kept page stays when only its refresh failed
      if (usable || mine !== seq) return;
      if (mine !== seq) return;
      const retry = el('button', { type: 'button' }, icon('fa-rotate'), ' ', t('Spróbuj ponownie'));
      retry.addEventListener('click', () => void open(s));
      const site = el('button', { type: 'button' }, icon('fa-arrow-up-right-from-square'), ' ', t('Otwórz na lista.slash3rss.dev'));
      site.addEventListener('click', () => openSite(s));
      page.replaceChildren(el('div', { className: 'sp-top' }, el('button', { type: 'button', className: 'sp-back', onclick: close }, icon('fa-arrow-left'), ' ', t('Serwery'))),
        el('div', { className: 'glass-panel sp-panel' }, el('p', { textContent: t('Nie udało się wczytać strony serwera: {0}', errorText(err)) }), el('div', { className: 'row' }, retry, site)));
    }
  }

  return {
    voteButton,
    checkVotes,
    open,
    prefetch,
    close,
    isOpen: () => openId !== undefined,
    /** After signing in or out: ask again for everything shown. */
    resetVotes: () => {
      enabled = undefined;
      nick = undefined;
      linked = undefined;
      votedAt.clear();
      checkedAt.clear();
    },
    /** For tests and the page: whether the account has a Minecraft account linked (undefined: unknown). */
    linked: () => linked,
  };
}
