// The account drawer's further sections (Konta): achievements, the streak and challenges, friends, clans,
// communities and groups, invites, support and what the player stored on the server (adminUserExtras.ts).
// Each section is folded and asks the server only when opened. Some buttons use the panel's other
// endpoints (a clan's member, support grants, logs, bug reports, screenshots, rejecting an invite).
import { api, confirmModal, el, errorText, fmtDate, icon, promptModal, toast } from './common.js';

const ERRORS = {
  config_admin: 'To konto jest adminem z konfiguracji serwera (ADMIN_HANDLES): zmienia je tylko inny taki admin.',
  not_held: 'Gracz już go nie ma.', bad_counter: 'Nie ma takiego licznika.', bad_days: 'Liczba dni poza zakresem (nie dłużej niż od założenia konta).',
  bad_period: 'To wyzwanie jest już z innego okresu. Odśwież.', already_done: 'Ukończone wyzwanie zostaje ukończone (nagroda była wypłacona).',
  owner_must_transfer: 'To właściciel: najpierw przekaż własność komuś innemu.', clan_chat: 'Czat klanu idzie za klanem: wyrzuć gracza z klanu.',
  not_pending: 'Odłączyć można tylko oczekujące zaproszenie (nic jeszcze nie wypłacono). Policzone można odrzucić.',
  already_rejected: 'To zaproszenie jest już odrzucone.', not_extendable: 'Tego przyznania nie da się przedłużyć (odebrane albo na zawsze).',
  already_revoked: 'Już odebrane.', bad_tier: 'Wybierz poziom.', no_player: 'Nie ma takiego gracza.', not_found: 'Już tego nie ma. Odśwież.',
};
const fail = (err) => toast(ERRORS[err?.code] ?? errorText(err), true);
const call = (...args) => api(...args).catch((err) => { fail(err); return undefined; });

const COUNTERS = {
  media: 'Udostępnione zrzuty i klipy', shares: 'Udostępnione profile', cloud: 'Profile w chmurze', parties_created: 'Założone drużyny',
  parties_joined: 'Dołączenia do drużyn', sprays: 'Graffiti', night: 'Gra w nocy (0/1)', early: 'Gra o świcie (0/1)',
};
const ROLES = { owner: 'właściciel', officer: 'oficer', admin: 'admin', moderator: 'moderator', member: 'członek' };
const REF_STATUS = { pending: ['oczekuje', ''], counted: ['policzone', 'green'], rejected: ['odrzucone', 'red'] };
const PAY_STATUS = {
  pending: ['w toku', ''], paid: ['opłacona', 'green'], subscribed: ['subskrypcja', 'blue'], failed: ['nieudana', 'red'], expired: ['wygasła', ''],
  refunded: ['zwrócona', 'gold'], disputed: ['chargeback', 'red'], mismatch: ['zła kwota', 'red'],
};
const REFUND_STATUS = { pending: 'czeka', approved: 'zatwierdzony', rejected: 'odrzucony', refunded: 'zwrócony', cancelled: 'anulowany' };
const SOURCES = { payment: 'płatność', subscription: 'subskrypcja', admin: 'admin' };
const BUG_STATUS = { open: 'otwarte', confirmed: 'potwierdzone', fixed: 'naprawione', closed: 'zamknięte', duplicate: 'duplikat' };

const day = (ms) => (ms ? new Date(ms).toLocaleDateString('pl-PL') : '—');
const size = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const money = (minor, currency = 'PLN') => new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(minor / 100);
const hm = (s) => `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
const chip = (text, cls = '') => el('span', { class: `chip${cls ? ` ${cls}` : ''}`, textContent: text });
const empty = (text) => el('p', { class: 'muted small', textContent: text });
const sub = (text, ...extra) => el('h5', { class: 'ux-sub' }, text, ...extra);
/** A row: what it is (and a muted line under it), then its buttons. */
const line = (main, note, ...buttons) => el('div', { class: 'ux-row' },
  el('div', { class: 'grow' }, main, note ? el('small', { class: 'muted', textContent: note }) : ''), ...buttons);
const who = (p, open) => (p?.id && open
  ? el('a', { href: '#', textContent: `@${p.handle || '?'}`, title: p.name, onclick: (e) => { e.preventDefault(); open(p.id); } })
  : el('b', { textContent: `@${p?.handle || '?'}` }));
/**
 * A small button that takes something away (asks first). `off`: true when the account may not be changed by this
 * admin (the title says so), a word when there is nothing to do (the title already says why), else false.
 */
const xButton = (title, off, onclick, cls = 'fa-solid fa-xmark') => el('button', { class: 'icon-btn danger', title: off === true ? `${title} – niedostępne: konto admina z konfiguracji` : title, disabled: !!off, onclick }, icon(cls));

/**
 * One folded section: the title and a count, its content drawn from the server's answer the first time
 * it is opened. `draw(res, show)`: the content; `show(res)` draws it again from an action's answer.
 */
function section(userId, key, title, cls, draw) {
  const body = el('div', { class: 'ux-body' }, empty('Ładowanie…'));
  const count = el('span', { class: 'muted small' });
  const box = el('details', { class: 'ux-section' }, el('summary', {}, icon(cls), ' ', title, ' ', count), body);
  const show = (res) => {
    if (!res) return;
    try {
      const out = draw(res, show);
      body.replaceChildren(...(res.protected ? [el('p', { class: 'small ux-note' }, icon('fa-solid fa-lock'), ' Konto admina z konfiguracji serwera: możesz tylko podglądać.')] : []), ...out.nodes);
      count.textContent = out.count === undefined ? '' : `(${out.count})`;
    } catch (err) {
      console.error(err);
      body.replaceChildren(empty('Nie udało się pokazać tej części.'));
    }
  };
  const load = async () => show(await call('GET', `/v1/admin/users/${userId}/extras/${key}`));
  box.addEventListener('toggle', () => { if (box.open && !box.dataset.loaded) { box.dataset.loaded = '1'; load(); } });
  box.reload = load;
  return { box, show, load };
}

// ---------- achievements, the streak and challenges ----------

function achievementsSection(u, ctx) {
  const id = u.id;
  let filter = 'unlocked';
  let clawback = false;
  const s = section(id, 'achievements', 'Osiągnięcia, seria i wyzwania', 'fa-solid fa-trophy', (res, show) => {
    const off = res.protected;
    const unlocked = res.achievements.filter((a) => a.unlockedAt);
    // the streak: where it stands, the last fortnight, and setting it
    const daysInput = el('input', { type: 'number', min: 0, step: 1, value: res.streak.current, class: 'ux-num', title: 'Seria w dniach' });
    const setStreak = async (days) => {
      const dry = await call('POST', `/v1/admin/users/${id}/extras/streak`, { days, dryRun: true });
      if (!dry) return;
      const p = dry.plan;
      if (!p.fill.length && !p.cut.length) return toast(`Seria już wynosi ${p.before} dni.`);
      const list = [
        p.fill.length ? `Uzupełni ${p.fill.length} ${p.fill.length === 1 ? 'dzień' : 'dni'} po ${res.streak.minSeconds / 60} min gry (${p.fill[p.fill.length - 1]} – ${p.fill[0]})` : '',
        ...p.cut.map((c) => `${c.day}: czas gry przycięty z ${hm(c.seconds)} do ${hm(res.streak.minSeconds - 1)}`),
        p.bestAfter !== p.best ? `Najdłuższa seria: ${p.best} → ${p.bestAfter} dni` : '',
      ].filter(Boolean);
      if (!await confirmModal({ title: `Seria: ${p.before} → ${p.after} dni?`, text: 'Zmienia zapisane dni gry, z których liczy się seria. Zdobyte osiągnięcia zostają.', list,
        warning: p.cut.length ? `Gracz straci ${hm(p.lost)} zapisanego czasu gry.` : undefined, ok: 'Zmień serię', danger: p.cut.length > 0 })) return;
      const r = await call('POST', `/v1/admin/users/${id}/extras/streak`, { days });
      if (r) { toast(`Seria: ${r.streak.current} dni.`); show({ ...r, protected: off }); }
    };
    const recent = el('div', { class: 'ux-days' }, ...[...res.streak.recent].reverse().map((d) => el('span', {
      class: `ux-day${d.seconds >= res.streak.minSeconds ? ' on' : d.seconds ? ' some' : ''}`, title: `${d.day}: ${d.seconds ? hm(d.seconds) : 'bez gry'}`,
    })));
    const streak = [
      sub('Seria dni'),
      el('p', { class: 'small' }, `Teraz ${res.streak.current} dni · najdłuższa ${res.streak.best} · dni gry ${res.streak.daysPlayed} · ${res.streak.hours} h`),
      recent,
      el('div', { class: 'row' }, daysInput,
        el('button', { disabled: off, onclick: () => { const n = Number(daysInput.value); if (Number.isInteger(n) && n >= 0) setStreak(n); else toast('Podaj liczbę dni.', true); } }, icon('fa-solid fa-fire'), 'Ustaw serię'),
        el('button', { class: 'danger', disabled: off || !res.streak.current, onclick: () => setStreak(0) }, icon('fa-solid fa-rotate-left'), 'Wyzeruj')),
    ];

    // the achievements
    const revoke = async (a) => {
      const reward = [a.paid ? `${a.paid} Iskier` : '', a.reward ? `przedmiot „${a.reward.name}”` : ''].filter(Boolean).join(' i ');
      if (!await confirmModal({
        title: `Odebrać „${a.name}” graczowi @${u.handle}?`,
        text: clawback ? (reward ? `Razem z nagrodą: ${reward} (Iskier najwyżej tyle, ile gracz ma).` : 'Osiągnięcie nic nie dało.') : (reward ? `Nagroda zostaje u gracza (${reward}).` : ''),
        warning: a.reached ? 'Gracz nadal spełnia warunek: osiągnięcie wróci przy najbliższym sprawdzeniu (bez ponownej wypłaty Iskier). Najpierw wyzeruj licznik albo serię, jeśli trzeba.' : undefined,
        ok: 'Odbierz', okIcon: 'fa-solid fa-trophy', danger: true,
      })) return;
      const r = await call('POST', `/v1/admin/users/${id}/extras/achievements/${a.id}/revoke`, { clawback });
      if (r) { toast(r.taken || r.itemTaken ? `Odebrane${r.taken ? `, −${r.taken} Iskier` : ''}${r.itemTaken ? ', z przedmiotem' : ''}.` : 'Odebrane.'); show({ ...r, protected: off }); }
    };
    const shown = filter === 'unlocked' ? unlocked : filter === 'progress' ? res.achievements.filter((a) => !a.unlockedAt && a.value) : res.achievements;
    const pick = el('select', { onchange: () => { filter = pick.value; show(res); } },
      ...[['unlocked', `Zdobyte (${unlocked.length})`], ['progress', 'W trakcie'], ['all', `Wszystkie (${res.achievements.length})`]].map(([v, t]) => el('option', { value: v, textContent: t, selected: v === filter })));
    const claw = el('label', { class: 'small row', title: 'Zaznaczone: odebranie zabiera też Iskry, które osiągnięcie wypłaciło, i jego przedmiot' },
      el('input', { type: 'checkbox', checked: clawback, onchange: (e) => { clawback = e.target.checked; } }), 'odbierz też nagrodę');
    const achievements = [
      sub('Osiągnięcia', ' ', pick),
      claw,
      el('div', { class: 'ux-list' }, ...shown.slice(0, 300).map((a) => line(
        el('span', {}, a.name, a.manual ? chip('ręczne') : '', a.hidden ? chip('ukryte') : '', a.enabled ? '' : chip('wyłączone', 'off')),
        [a.unlockedAt ? `zdobyte ${fmtDate(a.unlockedAt)}` : '', a.value !== null ? `${a.value} / ${a.goal}` : '', a.sparks ? `✦ ${a.paid || a.sparks}${a.unlockedAt && !a.paid ? ' (niewypłacone)' : ''}` : '',
          a.reward ? `nagroda: ${a.reward.name}` : ''].filter(Boolean).join(' · '),
        a.unlockedAt ? xButton('Odbierz osiągnięcie', off, () => revoke(a), 'fa-solid fa-trophy') : ''))),
      shown.length ? '' : empty(filter === 'unlocked' ? 'Nic jeszcze nie zdobył(a).' : 'Brak.'),
    ];

    // the counters kept by events
    const counters = [
      sub('Liczniki osiągnięć'),
      el('div', { class: 'ux-list' }, ...res.counters.map((c) => line(el('span', {}, COUNTERS[c.key] ?? c.key), `licznik ${c.n}${c.live ? ` · teraz na serwerze ${c.live}` : ''}`,
        xButton('Wyzeruj licznik', off || (!c.n && 'empty'), async () => {
          if (!await confirmModal({ title: `Wyzerować „${COUNTERS[c.key] ?? c.key}”?`, text: `Licznik ${c.n} → 0.${c.live ? ` To, co jest teraz na serwerze (${c.live}), nadal się liczy.` : ''} Zdobyte osiągnięcia zostają.`, ok: 'Wyzeruj', danger: true })) return;
          const r = await call('POST', `/v1/admin/users/${id}/extras/achievements/counters/${c.key}/reset`);
          if (r) { toast('Licznik wyzerowany.'); show({ ...r, protected: off }); }
        }, 'fa-solid fa-rotate-left')))),
    ];

    // the challenges of the day and the week now
    const challenges = [sub('Wyzwania teraz')];
    for (const p of res.challenges.periods) {
      challenges.push(el('p', { class: 'small muted' }, `${p.kind === 'daily' ? 'Dzienne' : 'Tygodniowe'} (${p.key.slice(2)}, do ${fmtDate(p.endsAt)})${p.bonusAt ? ' · premia za komplet wypłacona' : ''}`));
      if (!p.challenges.length) challenges.push(empty('Gracz jeszcze ich nie widział (przydzielają się, gdy otworzy wyzwania).'));
      for (const c of p.challenges) {
        challenges.push(line(el('span', {}, c.name, c.doneAt ? chip('ukończone', 'green') : ''), `${Math.min(c.value, c.target)} / ${c.target}${c.sparks ? ` · ✦ ${c.sparks}` : ''}${c.doneAt ? ` · ${fmtDate(c.doneAt)}` : ''}`,
          c.doneAt ? '' : xButton('Wyzeruj postęp', off || (!c.value && 'empty'), async () => {
            const same = p.challenges.filter((x) => x.counter === c.counter && x.id !== c.id && !x.doneAt).length;
            if (!await confirmModal({ title: `Wyzerować postęp „${c.name}”?`, text: `${c.value} → 0 w tym okresie.${same ? ' Licznik jest wspólny z innym wyzwaniem tego okresu: ono też zacznie od zera.' : ''}`, ok: 'Wyzeruj', danger: true })) return;
            const r = await call('POST', `/v1/admin/users/${id}/extras/challenges/reset`, { period: p.key, challenge: c.id });
            if (r) { toast('Postęp wyzerowany.'); show({ ...r, protected: off }); }
          }, 'fa-solid fa-rotate-left')));
      }
    }
    return { nodes: [...streak, ...achievements, ...counters, ...challenges], count: unlocked.length };
  });
  return s.box;
}

// ---------- friends ----------

function friendsSection(u, ctx) {
  const id = u.id;
  const s = section(id, 'friends', 'Znajomi i zaproszenia', 'fa-solid fa-user-group', (res, show) => {
    const off = res.protected;
    const act = async (method, path, done) => {
      const r = await call(method, path);
      if (r) { toast(done); show({ ...r, protected: off }); }
    };
    const friends = res.friends.map((f) => line(el('span', {}, who(f, ctx.open), ' ', f.muted ? chip('wyciszony', 'gold') : ''), `${f.name} · od ${day(f.since)}`,
      f.muted ? xButton('Zdejmij wyciszenie', off, async () => {
        if (await confirmModal({ title: `Zdjąć wyciszenie @${f.handle}?`, text: `@${u.handle} znowu dostanie powiadomienia od tego znajomego.`, ok: 'Zdejmij' })) act('DELETE', `/v1/admin/users/${id}/extras/mutes/${f.id}`, 'Wyciszenie zdjęte.');
      }, 'fa-solid fa-bell') : '',
      xButton('Usuń ze znajomych', off, async () => {
        if (await confirmModal({ title: `Usunąć znajomość @${u.handle} i @${f.handle}?`, text: 'Obaj znikną sobie z list znajomych (rozmowa zostaje w bazie). Mogą się znowu zaprosić.', ok: 'Usuń', okIcon: 'fa-solid fa-user-minus', danger: true })) {
          act('DELETE', `/v1/admin/users/${id}/extras/friends/${f.id}`, 'Usunięto ze znajomych.');
        }
      }, 'fa-solid fa-user-minus')));
    const request = (r, dir) => line(el('span', {}, dir === 'in' ? 'od ' : 'do ', who(r, ctx.open)), `${r.name} · ${fmtDate(r.at)}`,
      xButton('Usuń zaproszenie', off, async () => {
        if (await confirmModal({ title: 'Usunąć zaproszenie do znajomych?', text: `${dir === 'in' ? `Od @${r.handle} do @${u.handle}` : `Od @${u.handle} do @${r.handle}`}.`, ok: 'Usuń', danger: true })) {
          act('DELETE', `/v1/admin/users/${id}/extras/requests/${r.id}`, 'Zaproszenie usunięte.');
        }
      }));
    return {
      count: res.friends.length,
      nodes: [
        el('div', { class: 'ux-list' }, ...friends), res.friends.length ? '' : empty('Brak znajomych.'),
        sub('Zaproszenia'),
        el('div', { class: 'ux-list' }, ...res.incoming.map((r) => request(r, 'in')), ...res.outgoing.map((r) => request(r, 'out'))),
        res.incoming.length || res.outgoing.length ? '' : empty('Brak oczekujących zaproszeń.'),
      ],
    };
  });
  return s.box;
}

// ---------- clans, communities and groups ----------

function membershipsSection(u, ctx) {
  const id = u.id;
  const s = section(id, 'memberships', 'Klan, społeczności i grupy', 'fa-solid fa-shield-halved', (res, show) => {
    const off = res.protected;
    const after = (r, done) => { if (r) { toast(done); s.load(); } };
    const goTo = (tab, title) => el('button', { class: 'icon-btn', title, onclick: () => ctx.go(tab) }, icon('fa-solid fa-arrow-up-right-from-square'));
    const clan = res.clan;
    const nodes = [sub('Klan')];
    if (!clan) nodes.push(empty('Bez klanu.'));
    else {
      nodes.push(line(el('span', {}, el('b', { textContent: `[${clan.tag}] ` }), clan.name, ' ', chip(ROLES[clan.role] ?? clan.role, clan.role === 'owner' ? 'gold' : '')),
        `${clan.members} członków · od ${day(clan.joinedAt)}`, goTo('clans', 'Zakładka Klany'),
        xButton(clan.role === 'owner' ? 'Właściciel: najpierw przekaż klan w zakładce Klany' : 'Wyrzuć z klanu', off || (clan.role === 'owner' && 'owner'), async () => {
          if (!await confirmModal({ title: `Wyrzucić @${u.handle} z [${clan.tag}]?`, text: 'Razem z czatem klanu. Gracz dostanie powiadomienie.', ok: 'Wyrzuć', danger: true })) return;
          after(await call('DELETE', `/v1/admin/clans/${clan.id}/members/${id}`), 'Wyrzucono z klanu.');
        }, 'fa-solid fa-door-open')));
    }
    nodes.push(sub('Społeczności'));
    if (!res.communities.length) nodes.push(empty('Bez społeczności.'));
    for (const c of res.communities) {
      nodes.push(line(el('span', {}, c.name, c.tag ? el('span', { class: 'muted', textContent: ` (${c.tag})` }) : '', ' ', chip(ROLES[c.role] ?? c.role, c.owner ? 'gold' : '')),
        `${c.members} członków · od ${day(c.joinedAt)}`, goTo('communities', 'Zakładka Społeczności'),
        xButton(c.owner ? 'Właściciel: najpierw przekaż społeczność w zakładce Społeczności' : 'Wyrzuć ze społeczności', off || (c.owner && 'owner'), async () => {
          if (!await confirmModal({ title: `Wyrzucić @${u.handle} z „${c.name}”?`, text: 'Jak wyrzucenie przez moderatora: trafi do dziennika społeczności, gracz dostanie powiadomienie i może dołączyć znowu.', ok: 'Wyrzuć', danger: true })) return;
          const r = await call('DELETE', `/v1/admin/users/${id}/extras/communities/${c.id}`);
          if (r) { toast('Wyrzucono ze społeczności.'); show({ ...r, protected: off }); }
        }, 'fa-solid fa-door-open')));
    }
    nodes.push(sub('Grupy czatu'));
    if (!res.groups.length) nodes.push(empty('Bez grup.'));
    for (const g of res.groups) {
      nodes.push(line(el('span', {}, g.name || '(bez nazwy)', ' ', g.clan ? chip('czat klanu', 'blue') : '', g.owner ? chip('właściciel', 'gold') : ''),
        `${g.members} członków${g.joinedAt ? ` · od ${day(g.joinedAt)}` : ''}`,
        g.clan ? '' : xButton('Wyrzuć z grupy', off, async () => {
          if (!await confirmModal({ title: `Wyrzucić @${u.handle} z grupy „${g.name}”?`, text: `${g.owner ? 'To właściciel: rolę przejmie najdłużej obecny członek. ' : ''}${g.members <= 1 ? 'To ostatni członek: grupa zniknie razem z obrazkami. ' : ''}Pozostali zobaczą w czacie, że został(a) usunięty(a).`, ok: 'Wyrzuć', danger: true })) return;
          const r = await call('DELETE', `/v1/admin/users/${id}/extras/groups/${g.id}`);
          if (r) { toast('Wyrzucono z grupy.'); show({ ...r, protected: off }); }
        }, 'fa-solid fa-door-open')));
    }
    return { nodes, count: (clan ? 1 : 0) + res.communities.length + res.groups.length };
  });
  return s.box;
}

// ---------- invites ----------

function referralsSection(u, ctx) {
  const id = u.id;
  const s = section(id, 'referrals', 'Polecenia (kody zaproszeń)', 'fa-solid fa-user-plus', (res, show) => {
    const off = res.protected;
    const status = (r) => chip(REF_STATUS[r.status]?.[0] ?? r.status, REF_STATUS[r.status]?.[1] ?? '');
    const note = (r) => [`od ${day(r.at)}`, `${r.hours} h, ${r.days} dni gry`, r.countedAt ? `policzone ${day(r.countedAt)}` : '',
      r.inviterSparks || r.inviteeSparks ? `✦ ${r.inviterSparks} + ${r.inviteeSparks}` : '', r.rejectedAt ? `odrzucone ${day(r.rejectedAt)}${r.rejectedBy ? ` przez @${r.rejectedBy}` : ''}${r.note ? `: ${r.note}` : ''}` : ''].filter(Boolean).join(' · ');
    const reject = (invitee, handle, was) => xButton('Odrzuć zaproszenie', off, async () => {
      const reason = await promptModal({ title: `Odrzucić zaproszenie @${handle}?`, text: was === 'counted' ? 'Iskry wrócą od tych, którzy je jeszcze mają. Odrzucenie jest ostateczne.' : 'Nigdy się nie policzy. Odrzucenie jest ostateczne.', label: 'Powód (zapisze się w dzienniku)', ok: 'Odrzuć', danger: true });
      if (reason === null) return;
      if (await call('POST', `/v1/admin/referrals/${invitee}/reject`, { reason })) { toast('Zaproszenie odrzucone.'); s.load(); }
    }, 'fa-solid fa-ban');
    const nodes = [el('p', { class: 'small' }, 'Kod gracza: ', res.code ? el('code', { textContent: res.code }) : el('span', { class: 'muted', textContent: 'jeszcze nie wygenerowany' })), sub('Zaprosił(a) go')];
    const by = res.invitedBy;
    if (!by) nodes.push(empty('Nikt (nie wpisał kodu).'));
    else {
      nodes.push(line(el('span', {}, who(by, ctx.open), ' ', status(by)), `${note(by)} · kod ${by.code}`,
        by.status === 'pending' ? xButton('Odłącz błędny kod (gracz może wpisać inny, jeśli jeszcze może)', off, async () => {
          if (!await confirmModal({ title: `Odłączyć @${by.handle} jako zapraszającego?`, text: 'Zaproszenie jeszcze się nie policzyło, więc nic nie było wypłacone. Gracz będzie mógł wpisać inny kod, jeśli jeszcze nie minął jego czas.', ok: 'Odłącz', okIcon: 'fa-solid fa-link-slash', danger: true })) return;
          const r = await call('POST', `/v1/admin/users/${id}/extras/referral/detach`);
          if (r) { toast('Odłączono.'); show({ ...r, protected: off }); }
        }, 'fa-solid fa-link-slash') : '',
        by.status !== 'rejected' ? reject(id, u.handle, by.status) : ''));
    }
    nodes.push(sub(`Zaprosił(a) (${res.invited.length})`));
    if (!res.invited.length) nodes.push(empty('Nikogo.'));
    for (const r of res.invited) nodes.push(line(el('span', {}, who(r, ctx.open), ' ', status(r)), note(r), r.status !== 'rejected' ? reject(r.invitee, r.handle, r.status) : ''));
    return { nodes, count: res.invited.length };
  });
  return s.box;
}

// ---------- support ----------

function supportSection(u, ctx) {
  const id = u.id;
  const s = section(id, 'support', 'Wsparcie i płatności', 'fa-solid fa-heart', (res) => {
    const off = res.protected;
    const after = (r, done) => { if (r) { toast(done); s.load(); } };
    const nodes = [el('p', { class: 'small' }, 'Teraz: ', res.active
      ? el('span', {}, chip(res.active.name, 'pink'), ` ${res.active.expiresAt ? `do ${fmtDate(res.active.expiresAt)}` : 'na zawsze'}${res.active.since ? ` · wspiera od ${day(res.active.since)}` : ''}`)
      : el('span', { class: 'muted', textContent: 'nie wspiera' }))];
    nodes.push(sub('Przyznania'));
    if (!res.grants.length) nodes.push(empty('Brak.'));
    for (const g of res.grants) {
      const live = !g.revokedAt && (g.expiresAt === null || g.expiresAt > Date.now());
      nodes.push(line(el('span', {}, chip(g.tierName, live ? 'pink' : 'off'), ' ', SOURCES[g.source] ?? g.source, g.by ? el('span', { class: 'muted', textContent: ` @${g.by}` }) : ''),
        [`${day(g.startsAt)} – ${g.expiresAt ? day(g.expiresAt) : 'na zawsze'}`, g.revokedAt ? `odebrane ${day(g.revokedAt)}: ${g.revokedReason}` : '', g.note].filter(Boolean).join(' · '),
        !g.revokedAt && g.expiresAt !== null ? el('button', { class: 'icon-btn', title: 'Przedłuż', onclick: async () => {
          const days = await promptModal({ title: `Przedłużyć ${g.tierName}?`, label: 'O ile dni', type: 'number', min: 1, max: 3650, value: '30', required: true, ok: 'Przedłuż' });
          if (days === null) return;
          after(await call('POST', `/v1/admin/support/grants/${g.id}/extend`, { days: Number(days) }), 'Przedłużono.');
        } }, icon('fa-solid fa-calendar-plus')) : '',
        !g.revokedAt ? xButton('Odbierz', off, async () => {
          const reason = await promptModal({ title: `Odebrać ${g.tierName} graczowi @${u.handle}?`, text: g.source === 'admin' ? '' : 'To przyznanie z płatności: pieniądze nie wracają same (zwrot jest w zakładce Wsparcie).', label: 'Powód', ok: 'Odbierz', danger: true });
          if (reason === null) return;
          after(await call('POST', `/v1/admin/support/grants/${g.id}/revoke`, { reason }), 'Odebrano.');
        }) : ''));
    }
    // a new grant, by the account's handle (the Wsparcie tab's endpoint)
    const tier = el('select', {}, ...res.tiers.map((t) => el('option', { value: t.id, textContent: `${t.name}${t.enabled ? '' : ' (wyłączony)'}` })));
    const days = el('input', { type: 'number', min: 1, max: 3650, value: 30, class: 'ux-num', title: 'Dni' });
    const lifetime = el('input', { type: 'checkbox', onchange: () => { days.disabled = lifetime.checked; } });
    const note = el('input', { type: 'text', placeholder: 'Notatka (opcjonalnie)', maxLength: 200, class: 'grow' });
    nodes.push(el('div', { class: 'row' }, tier, days, el('label', { class: 'small row' }, lifetime, 'na zawsze'), note,
      el('button', { class: 'primary', disabled: !res.tiers.length, onclick: async () => {
        const name = tier.selectedOptions[0]?.textContent ?? '';
        if (!await confirmModal({ title: `Przyznać ${name} graczowi @${u.handle}?`, text: lifetime.checked ? 'Na zawsze.' : `Na ${days.value} dni.`, ok: 'Przyznaj' })) return;
        after(await call('POST', '/v1/admin/support/grants', { handle: u.handle, tier: tier.value, ...(lifetime.checked ? { lifetime: true } : { days: Number(days.value) }), note: note.value.trim() }), 'Przyznano.');
      } }, icon('fa-solid fa-plus'), 'Przyznaj')));
    nodes.push(sub('Płatności', ' ', el('button', { class: 'icon-btn', title: 'Zakładka Wsparcie (zwroty, szczegóły)', onclick: () => ctx.go('support') }, icon('fa-solid fa-arrow-up-right-from-square'))));
    if (!res.payments.length) nodes.push(empty('Brak płatności.'));
    for (const p of res.payments) {
      const st = PAY_STATUS[p.status] ?? [p.status, ''];
      nodes.push(line(el('span', {}, money(p.amount, p.currency), ' ', chip(st[0], st[1]), p.test ? chip('test') : ''),
        [p.tierName, p.kind === 'monthly' ? 'co miesiąc' : 'jednorazowo', p.provider, fmtDate(p.createdAt), p.refundedAt ? `zwrot ${day(p.refundedAt)}` : ''].filter(Boolean).join(' · ')));
    }
    if (res.refunds.length) {
      nodes.push(sub('Prośby o zwrot'));
      for (const r of res.refunds) nodes.push(line(el('span', {}, REFUND_STATUS[r.status] ?? r.status), `${fmtDate(r.createdAt)} · płatność ${r.payment.slice(0, 8)}`));
    }
    return { nodes, count: res.payments.length };
  });
  return s.box;
}

// ---------- what the player stored ----------

function contentSection(u, ctx) {
  const id = u.id;
  const s = section(id, 'content', 'Pliki i treści', 'fa-solid fa-folder-open', (res, show) => {
    const off = res.protected;
    // an action of this section (answers with it) or of another tab (asked again)
    const remove = async (ask, method, path, done, own = true) => {
      if (!await confirmModal({ ...ask, ok: ask.ok ?? 'Usuń', okIcon: 'fa-solid fa-trash-can', danger: true, warning: 'Tego nie da się cofnąć.' })) return;
      const r = await call(method, path);
      if (!r) return;
      toast(done);
      if (own) show({ ...r, protected: off });
      else s.load();
    };
    const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener', textContent: text });
    const nodes = [];
    nodes.push(sub(`Udostępnione profile (${res.shares.length})`));
    for (const x of res.shares) {
      nodes.push(line(el('span', {}, el('code', { textContent: x.code }), ` ${x.name || ''}`), [size(x.size), `${x.gameVersion} ${x.loader}`.trim(), `pobrań ${x.downloads}`, `wygasa ${day(x.expiresAt)}`].filter(Boolean).join(' · '),
        xButton('Usuń', off, () => remove({ title: `Usunąć udostępniony profil ${x.code}?`, text: 'Kod przestanie działać, plik zniknie.' }, 'DELETE', `/v1/admin/users/${id}/extras/shares/${x.code}`, 'Usunięto.'), 'fa-solid fa-trash-can')));
    }
    nodes.push(sub(`Profile w chmurze (${res.cloud.length})`));
    for (const x of res.cloud) {
      nodes.push(line(el('span', {}, x.name || x.id), [size(x.size), `${x.gameVersion} ${x.loader}`.trim(), x.device, `wersja ${x.revision}`, fmtDate(x.updatedAt)].filter(Boolean).join(' · '),
        xButton('Usuń', off, () => remove({ title: `Usunąć profil „${x.name || x.id}” z chmury?`, text: 'Na komputerach gracza zostaje, znika tylko kopia na serwerze.' }, 'DELETE', `/v1/admin/users/${id}/extras/cloud/${x.id}`, 'Usunięto.'), 'fa-solid fa-trash-can')));
    }
    nodes.push(sub(`Zrzuty i klipy (${res.media.length})`));
    for (const x of res.media) {
      nodes.push(line(el('span', {}, link(`/media/${x.id}`, x.title || (x.kind === 'clip' ? 'Klip' : 'Zrzut ekranu'))),
        `${x.kind === 'clip' ? `klip ${Math.round(x.durationMs / 1000)} s` : 'obraz'} ${x.width}×${x.height} · ${size(x.size)} · wyświetleń ${x.views} · ${fmtDate(x.createdAt)}`,
        xButton('Usuń', off, () => remove({ title: 'Usunąć ten zrzut lub klip?', text: 'Link przestanie działać.' }, 'DELETE', `/v1/media/${x.id}`, 'Usunięto.', false), 'fa-solid fa-trash-can')));
    }
    nodes.push(sub(`Logi (${res.logs.length})`));
    for (const x of res.logs) {
      nodes.push(line(el('span', {}, link(`/logi/${x.id}`, x.id)), `${size(x.size)} · ${x.lines} linii · ${fmtDate(x.createdAt)}`,
        xButton('Usuń', off, () => remove({ title: `Usunąć log ${x.id}?` }, 'DELETE', `/v1/admin/logs/${x.id}`, 'Usunięto.', false), 'fa-solid fa-trash-can')));
    }
    nodes.push(sub(`Zgłoszenia błędów (${res.bugs.length})`));
    for (const x of res.bugs) {
      nodes.push(line(el('span', {}, link(`/zgloszenia/${x.id}`, `#${x.id}`), ` ${x.title}`), `${BUG_STATUS[x.status] ?? x.status} · ${fmtDate(x.createdAt)}`,
        xButton('Usuń', off, () => remove({ title: `Usunąć zgłoszenie #${x.id}?`, text: 'Razem z komentarzami.' }, 'DELETE', `/v1/bugs/${x.id}`, 'Usunięto.', false), 'fa-solid fa-trash-can')));
    }
    // only the size, the date and to whom: the pictures are encrypted, the panel never sees them
    nodes.push(sub(`Obrazki w czacie (${res.chatImages.length})`));
    for (const x of res.chatImages) {
      nodes.push(line(el('span', {}, x.to.group !== undefined ? `grupa „${x.to.group || '?'}”` : who(x.to, ctx.open), ' ', x.removedAt ? chip('usunięty', 'off') : x.sent ? '' : chip('niewysłany')),
        `${size(x.size)} · ${fmtDate(x.at)}${x.removedAt ? ` · usunięty ${day(x.removedAt)}` : ''}`,
        x.removedAt ? '' : xButton('Usuń obrazek', off, () => remove({ title: 'Usunąć ten obrazek z czatu?', text: 'Plik zniknie, w rozmowie zostanie znak, że obrazek usunięto. Treści wiadomości to nie dotyczy.' },
          'DELETE', `/v1/admin/users/${id}/extras/chat-images/${x.id}`, 'Obrazek usunięty.'), 'fa-solid fa-trash-can')));
    }
    // skins set for offline nicks in the launcher (servers before them send none)
    const offlineSkins = res.offlineSkins ?? [];
    nodes.push(sub(`Skiny offline (${offlineSkins.length})`));
    for (const x of offlineSkins) {
      nodes.push(el('div', { class: 'ux-row' },
        el('img', { class: 'ux-skin', src: `/v1/skin/${x.hash}.png`, alt: '', loading: 'lazy' }),
        el('div', { class: 'grow' }, el('b', { textContent: x.name }), el('small', { class: 'muted', textContent: `${x.slim ? 'smukły' : 'klasyczny'} · ${fmtDate(x.updatedAt)}` })),
        xButton('Usuń', off, () => remove({ title: `Usunąć skin nicku ${x.name}?`, text: 'Gracze SlashClient przestaną go widzieć; gracz może wgrać skin ponownie w launcherze.' },
          'DELETE', `/v1/admin/users/${id}/offline-skins/${encodeURIComponent(x.name)}`, 'Skin usunięty.', false), 'fa-solid fa-trash-can')));
    }
    const count = res.shares.length + res.cloud.length + res.media.length + res.logs.length + res.bugs.length + res.chatImages.length + offlineSkins.length;
    return { nodes, count };
  });
  return s.box;
}

/**
 * The drawer's further sections for the account `u` (admin.js's openUser). `ctx.go(tab)` opens another tab
 * of the panel, `ctx.open(id)` another account's drawer.
 */
export function userExtrasSections(u, ctx = {}) {
  const c = { go: ctx.go ?? (() => {}), open: ctx.open };
  return el('div', { class: 'ux' },
    achievementsSection(u, c), friendsSection(u, c), membershipsSection(u, c), referralsSection(u, c), supportSection(u, c), contentSection(u, c));
}
