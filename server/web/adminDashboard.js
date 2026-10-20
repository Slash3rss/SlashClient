// The admin panel's "Pulpit": the numbers from GET /v1/admin/stats (adminStats.ts on the server),
// in sections: the basics, activity, platforms, servers, the social side, the economy, supporters,
// streams and files. Charts follow the period picked on top (7, 30 or 90 days); tiles with a tab of
// their own open it. The server counts what is stored at most every ~45 s; "Odśwież" counts it now.
import { $, PROVIDERS, api, cosmeticEl, el, guard, icon } from './common.js';
import { platformIcon } from './profileStream.js';

const PERIODS = [7, 30, 90];
const DAY_MS = 86_400_000;
const KINDS = { launcher: 'W launcherze', menu: 'W menu gry', singleplayer: 'Świat jednoosobowy', server: 'Na serwerze' };
const STREAMS = { twitch: 'Twitch', kick: 'Kick' };

let period = 30;
try {
  period = Number(localStorage.getItem('admin.dashboard.days')) || 30;
} catch {
  // no storage: 30 days
}
if (!PERIODS.includes(period)) period = 30;

const nf = (n) => Number(n ?? 0).toLocaleString('pl-PL');
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
/** Amounts in minor units (grosze, cents) per currency: "25,00 zł + 3,00 €". */
const money = (byCurrency) => {
  const parts = Object.entries(byCurrency ?? {}).filter(([, n]) => n).map(([cur, n]) => {
    try {
      return (n / 100).toLocaleString('pl-PL', { style: 'currency', currency: cur });
    } catch {
      return `${(n / 100).toFixed(2)} ${cur}`;
    }
  });
  return parts.length ? parts.join(' + ') : '0 zł';
};
const bytes = (n) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('pl-PL', { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
};
const dayLabel = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });

/**
 * A number tile, as elsewhere in the panel; `go`: the admin tab it opens ('#tab'), or a page of the
 * site ('/path'), opened in a new card.
 */
function tile(cls, label, value, note, go, ctx) {
  const body = [el('small', {}, icon(cls), label), el('b', { class: String(value).length > 9 ? 'long' : '', textContent: String(value) }), note ? el('em', { textContent: note }) : ''];
  if (!go) return el('div', { class: 'glass stat' }, ...body);
  const external = go.startsWith('/');
  return el('a', {
    class: 'glass stat link', href: go, title: external ? 'Otwórz' : 'Przejdź do zakładki', ...(external ? { target: '_blank', rel: 'noopener' } : {}),
    onclick: external ? undefined : (e) => {
      e.preventDefault();
      ctx.go(go.slice(1));
    },
  }, ...body, icon(`fa-solid ${external ? 'fa-arrow-up-right-from-square' : 'fa-arrow-right'} go`));
}

/** A bar per day of the period, with the first and last day and the total or peak under it. */
function chartCard(title, values, from, opts = {}) {
  const max = Math.max(1, ...values);
  const start = Date.parse(`${from}T12:00:00Z`);
  const label = (i) => dayLabel(new Date(start + i * DAY_MS).toISOString().slice(0, 10));
  const chart = el('div', { class: `chart${values.length > 45 ? ' dense' : ''}${opts.tone ? ` ${opts.tone}` : ''}` }, ...values.map((n, i) => {
    const bar = el('div', { title: `${label(i)}: ${nf(n)}${opts.unit ?? ''}`, dataset: { n: String(n) } });
    bar.style.height = `${Math.max(4, (n / max) * 100)}%`;
    return bar;
  }));
  const total = values.reduce((s, n) => s + n, 0);
  const summary = opts.peak ? `najwięcej ${nf(Math.max(0, ...values))}${opts.unit ?? ''}` : `razem ${nf(Math.round(total * 10) / 10)}${opts.unit ?? ''}`;
  return el('div', { class: 'glass card dash-chart' },
    el('div', { class: 'dash-chart-head' }, el('h3', { textContent: title }), el('span', { class: 'muted small', textContent: summary })),
    chart,
    el('div', { class: 'dash-axis muted' }, el('span', { textContent: label(0) }), el('span', { textContent: label(values.length - 1) })));
}

/** Named counts as bars, biggest first; `name` and `lead` say how each is shown. */
function listCard(title, entries, opts = {}) {
  const rows = entries.filter(([, n]) => n > 0 || opts.zero);
  const top = Math.max(1, ...rows.map(([, n]) => n));
  const box = el('div', { class: 'dash-bars' }, ...(rows.length ? rows.map(([key, n, extra]) => {
    const fill = el('div');
    fill.style.width = `${(n / top) * 100}%`;
    return el('div', { class: 'dash-bar' },
      el('span', { class: 'dash-name', title: opts.name ? opts.name(key) : key }, opts.lead ? opts.lead(key) : '', el('span', { textContent: opts.name ? opts.name(key) : key })),
      el('div', { class: 'track' }, fill),
      el('b', { textContent: opts.value ? opts.value(n, extra) : nf(n) }));
  }) : [el('p', { class: 'muted small', textContent: opts.empty ?? 'Brak danych.' })]));
  return el('div', { class: 'glass card' }, el('h3', { textContent: title }), opts.note ? el('p', { class: 'muted small dash-note', textContent: opts.note }) : '', box);
}

const sorted = (obj) => Object.entries(obj ?? {}).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'pl', { numeric: true }));

function section(title, cls, ...content) {
  return el('section', { class: 'dash-section' }, el('h2', { class: 'dash-h' }, icon(cls), title), ...content.filter(Boolean));
}
const tiles = (...list) => el('div', { class: 'stats' }, ...list.filter(Boolean));
const grid = (...cards) => el('div', { class: 'dash-grid' }, ...cards.filter(Boolean));
const charts = (...cards) => el('div', { class: 'dash-grid charts' }, ...cards.filter(Boolean));

export async function dashboardPage(ctx, fresh = false) {
  const main = $('#main');
  if (!main.querySelector('.dash')) main.replaceChildren(el('p', { class: 'muted', textContent: 'Liczenie…' }));
  const s = await guard(() => api('GET', `/v1/admin/stats?days=${period}${fresh ? '&fresh=1' : ''}`));
  if (!s || !$('#main')) return;
  const days = s.days ?? period;
  const a = s.activity;
  const from = a ? s.from : new Date(Date.now() - (days - 1) * DAY_MS).toISOString().slice(0, 10);

  const switcher = el('div', { class: 'slot-tabs dash-period', role: 'group', ariaLabel: 'Okres wykresów' }, ...PERIODS.map((d) => el('button', {
    class: d === days ? 'active' : '', textContent: `${d} dni`, ariaPressed: String(d === days),
    onclick: () => {
      period = d;
      try {
        localStorage.setItem('admin.dashboard.days', String(d));
      } catch {
        // not remembered then
      }
      dashboardPage(ctx);
    },
  })));
  const counted = s.countedAt ? new Date(s.countedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  // the basics, as before
  const capes = sorted(s.capes);
  const out = [
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Pulpit' }), el('div', { class: 'grow' }),
      counted ? el('span', { class: 'muted small', textContent: `Policzone o ${counted}` }) : '', switcher,
      el('button', { onclick: () => dashboardPage(ctx, true) }, icon('fa-solid fa-rotate'), 'Odśwież')),
    tiles(
      tile('fa-solid fa-users', 'Konta', nf(s.users), s.newUsers ? `+${nf(s.newUsers)} w tym tygodniu` : '', '#users', ctx),
      tile('fa-solid fa-signal', 'Online teraz', nf(s.online), a?.peakOnline ? `szczyt dziś: ${nf(a.peakOnline.at(-1))}` : ''),
      tile('fa-solid fa-cube', 'W grze z modem', nf(s.inGame), a?.peakInGame ? `szczyt dziś: ${nf(a.peakInGame.at(-1))}` : ''),
      tile('fa-solid fa-user-clock', 'Aktywni (7 dni)', nf(a?.wau ?? s.activeUsers)),
      tile('fa-solid fa-comments', 'Wiadomości', nf(s.messages), s.newMessages ? `+${nf(s.newMessages)} w tym tygodniu` : ''),
      tile('fa-solid fa-user-group', 'Znajomości', nf(s.friendships)),
      tile('fa-solid fa-ban', 'Zablokowane', nf(s.banned), '', '#users', ctx)),
  ];

  if (a) {
    const r7 = a.retention.d7;
    const r30 = a.retention.d30;
    out.push(section('Aktywność', 'fa-solid fa-chart-line',
      tiles(
        tile('fa-solid fa-sun', 'Aktywni dziś (DAU)', nf(a.dau), a.mau ? `${pct(a.dau, a.mau)} miesięcznych` : ''),
        tile('fa-solid fa-calendar-week', 'Aktywni w tygodniu (WAU)', nf(a.wau)),
        tile('fa-solid fa-calendar', 'Aktywni w miesiącu (MAU)', nf(a.mau), s.users ? `${pct(a.mau, s.users)} wszystkich kont` : ''),
        tile('fa-solid fa-mountain', 'Rekord online', nf(a.peakBest?.n ?? 0), a.peakBest ? dayLabel(a.peakBest.day) : 'liczony od tej wersji'),
        tile('fa-solid fa-rotate-left', 'Wracają po tygodniu', pct(r7.returned, r7.cohort), `${nf(r7.returned)} z ${nf(r7.cohort)} kont z 7–14 dni temu`),
        tile('fa-solid fa-arrows-rotate', 'Wracają po miesiącu', pct(r30.returned, r30.cohort), `${nf(r30.returned)} z ${nf(r30.cohort)} kont z 30–60 dni temu`)),
      charts(
        chartCard(`Aktywne konta dziennie (${days} dni)`, a.daily, from, { peak: true }),
        chartCard(`Nowe konta (${days} dni)`, s.signups, from),
        chartCard(`Godziny gry dziennie (${days} dni)`, a.playHours, from, { unit: ' h', tone: 'green' }),
        chartCard(`Szczyt online dziennie (${days} dni)`, a.peakOnline, from, { peak: true, tone: 'violet' }))));
  }

  if (s.platforms || s.now) {
    const p = s.platforms ?? {};
    const now = s.now ?? {};
    out.push(section('Platformy', 'fa-solid fa-laptop',
      grid(
        listCard('Sposoby logowania', sorted(p.providers), {
          note: 'Konta z danym sposobem logowania (jedno konto może mieć kilka).',
          name: (k) => PROVIDERS[k]?.[0] ?? (k === 'dev' ? 'Testowe' : k), lead: (k) => icon(PROVIDERS[k]?.[1] ?? 'fa-solid fa-flask'),
        }),
        listCard(`Wersje launchera (${days} dni)`, sorted(p.launchers), {
          note: 'Konta, które w tym okresie łączyły się launcherem; ostatnia użyta wersja.', name: (k) => `v${k}`,
          empty: 'Brak danych – launcher zgłasza wersję od tej wersji serwera.',
        }),
        listCard('Co robią teraz', sorted(now.kinds), { name: (k) => KINDS[k] ?? k, empty: 'Nikt nie jest teraz połączony.' }),
        listCard('Wersje gry teraz', sorted(now.versions), { empty: 'Nikt nie gra teraz z modem.' }),
        listCard('Loadery teraz', sorted(now.loaders), { empty: 'Nikt nie gra teraz z modem.' }))));
  }

  if (s.servers || s.now?.servers) {
    const serverName = (list) => (k) => list.find((x) => x.server === k)?.name || k;
    const nowList = s.now?.servers ?? [];
    const played = s.servers?.played ?? [];
    out.push(section('Serwery', 'fa-solid fa-server',
      grid(
        listCard('Gracze na serwerach teraz', nowList.map((x) => [x.server, x.players]), { name: serverName(nowList), empty: 'Nikt nie gra teraz na serwerze.' }),
        listCard(`Czas gry na serwerach (${days} dni)`, played.map((x) => [x.server, x.hours, x.players]), {
          name: serverName(played), value: (h, players) => `${nf(h)} h · ${nf(players)} os.`, empty: 'Brak zapisanego czasu gry w tym okresie.',
        }))));
  }

  if (s.social) {
    const so = s.social;
    out.push(section('Społeczność', 'fa-solid fa-people-group',
      tiles(
        tile('fa-solid fa-user-plus', 'Zaproszenia do znajomych', nf(so.requests), 'czekające na odpowiedź'),
        tile('fa-solid fa-comments', 'Grupy czatu', nf(so.groups), `${nf(so.groupMembers)} członków · ${nf(so.groupMessages)} wiad. (${days} dni)`),
        tile('fa-solid fa-shield-halved', 'Klany', nf(so.clans), `${nf(so.clanMembers)} członków`, '#clans', ctx),
        tile('fa-solid fa-users-rectangle', 'Społeczności', nf(so.communities), `${nf(so.communityMembers)} członków · ${nf(so.communityMessages)} wiad. (${days} dni)`, '#communities', ctx),
        tile('fa-solid fa-flag', 'Zgłoszenia w społecznościach', nf(so.reports), so.reports ? 'do rozpatrzenia' : 'brak otwartych', '#communities', ctx),
        tile('fa-solid fa-gamepad', `Zaproszenia do gry (${days} dni)`, nf(so.invites), so.partyInvites ? `w tym ${nf(so.partyInvites)} drużyn` : ''),
        tile('fa-solid fa-people-arrows', 'Drużyny teraz', nf(s.now?.parties ?? 0)),
        tile('fa-solid fa-location-dot', `Udostępnione punkty (${days} dni)`, nf(so.waypoints))),
      a ? grid(chartCard(`Wiadomości dziennie (${days} dni)`, a.messages, from, { tone: 'violet' })) : null));
  }

  if (s.economy || s.achievements) {
    const e = s.economy;
    const ach = s.achievements;
    const achList = (list) => list.map((x) => [x.name, x.n]);
    out.push(section('Ekonomia', 'fa-solid fa-coins',
      e ? tiles(
        tile('fa-solid fa-arrow-trend-up', `Iskry przyznane (${days} dni)`, nf(e.issued), `łącznie ${nf(e.issuedTotal)}`),
        tile('fa-solid fa-cart-shopping', `Iskry wydane (${days} dni)`, nf(e.spent), `łącznie ${nf(e.spentTotal)}`, '#cosmetics', ctx),
        tile('fa-solid fa-wallet', 'Iskry w obiegu', nf(e.circulating), `${nf(e.wallets)} portfeli z Iskrami`),
        tile('fa-solid fa-bag-shopping', `Zakupy (${days} dni)`, nf(e.purchases), `łącznie ${nf(e.purchasesTotal)}`, '#cosmetics', ctx),
        (e.given || e.taken) ? tile('fa-solid fa-hand-holding-dollar', `Od admina (${days} dni)`, `+${nf(e.given)}`, e.taken ? `odebrano ${nf(e.taken)}` : '', '#users', ctx) : null,
        ach ? tile('fa-solid fa-trophy', `Osiągnięcia (${days} dni)`, nf(ach.period), `łącznie ${nf(ach.total)} · ${nf(ach.holders)} graczy`, '#achievements', ctx) : null) : null,
      grid(
        e ? listCard('Najczęściej kupowane', e.topItems.map((x) => [x.id, x.n]), {
          name: (id) => ctx.capeNames[id] ?? id, lead: (id) => cosmeticEl(id, ctx.capeSlots[id] ?? 'cape', true), empty: 'Nikt jeszcze nic nie kupił.',
        }) : null,
        ach ? listCard('Najczęstsze osiągnięcia', achList(ach.top), { value: (n) => `${nf(n)} · ${pct(n, ach.users)}`, empty: 'Nikt jeszcze nic nie odblokował.' }) : null,
        ach ? listCard('Najrzadsze osiągnięcia', achList(ach.rare), { zero: true, value: (n) => `${nf(n)} · ${pct(n, ach.users)}` }) : null)));
  }

  if (s.support || s.bugs) {
    const su = s.support;
    out.push(section('Wsparcie', 'fa-solid fa-heart',
      tiles(
        su ? tile('fa-solid fa-heart', 'Wspierający teraz', nf(su.active), Object.entries(su.tiers).map(([n, c]) => `${n}: ${c}`).join(' · ') || `${nf(su.ever)} kiedykolwiek`, '#support', ctx) : null,
        su ? tile('fa-solid fa-calendar-day', 'Przychód w tym miesiącu', money(su.revenueMonth), 'bez zwróconych', '#support', ctx) : null,
        su ? tile('fa-solid fa-sack-dollar', `Przychód (${days} dni)`, money(su.revenuePeriod), `${nf(su.payments)} płatności${su.testPayments ? ` (+${nf(su.testPayments)} testowych)` : ''}`, '#support', ctx) : null,
        su ? tile('fa-solid fa-piggy-bank', 'Przychód łącznie', money(su.revenueTotal), '', '#support', ctx) : null,
        su ? tile('fa-solid fa-repeat', 'Aktywne subskrypcje', nf(su.subscriptions), '', '#support', ctx) : null,
        su ? tile('fa-solid fa-rotate-left', 'Zwroty do decyzji', nf(su.refundsPending), su.refundsPending ? 'czekają na odpowiedź' : 'brak', '#support', ctx) : null,
        s.bugs ? tile('fa-solid fa-bug', 'Otwarte zgłoszenia błędów', nf(s.bugs.open), `łącznie ${nf(s.bugs.total)}`, '/zgloszenia', ctx) : null)));
  }

  if (s.streams) {
    const st = s.streams;
    const linked = Object.values(st.linked).reduce((x, n) => x + n, 0);
    const live = Object.values(st.live).reduce((x, n) => x + n, 0);
    const split = (o) => Object.entries(o).map(([p, n]) => `${STREAMS[p] ?? p}: ${n}`).join(' · ');
    out.push(section('Streamy', 'fa-solid fa-video',
      tiles(
        tile('fa-solid fa-link', 'Połączone kanały', nf(linked), split(st.linked), '#streams', ctx),
        tile('fa-solid fa-tower-broadcast', 'Na żywo teraz', nf(live), live ? `${split(st.live)} · ${nf(st.viewers)} widzów` : '', '#streams', ctx)),
      linked ? grid(listCard('Kanały według platformy', sorted(st.linked), { name: (k) => STREAMS[k] ?? k, lead: (k) => platformIcon(k) })) : null));
  }

  if (s.storage) {
    const g = s.storage;
    out.push(section('Pliki', 'fa-solid fa-hard-drive',
      tiles(
        tile('fa-solid fa-hard-drive', 'Zajęte miejsce', bytes(g.used), g.capacity && !g.unlimited ? `z ${bytes(g.capacity)} (${pct(g.used, g.capacity)})` : 'limit: miejsce na dysku', '#storage', ctx),
        tile('fa-solid fa-file', 'Pliki', nf(g.files), '', '#storage', ctx))));
  }

  // the capes worn, as before
  const top = Math.max(1, ...capes.map(([, n]) => n));
  out.push(section('Kosmetyki', 'fa-solid fa-wand-magic-sparkles', el('div', { class: 'glass card' }, el('h3', { textContent: 'Noszone peleryny' }),
    el('div', { class: 'bars' }, ...(capes.length ? capes.map(([id, n]) => {
      const fill = el('div');
      fill.style.width = `${(n / top) * 100}%`;
      return el('div', { class: 'bar' }, cosmeticEl(id, ctx.capeSlots[id] ?? 'cape', true), el('span', { textContent: ctx.capeNames[id] ?? id }), el('div', { class: 'track' }, fill), el('b', { textContent: String(n) }));
    }) : [el('p', { class: 'muted', textContent: 'Nikt jeszcze nie nosi peleryny.' })])))));

  $('#main').replaceChildren(el('div', { class: 'dash' }, ...out));
}
