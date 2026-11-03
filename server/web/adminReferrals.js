// The admin panel's invites (referrals.ts on the server): the program's settings, who invited most,
// the latest codes typed in with how far each friend got, and rejecting an invite that was cheated
// (a second account of one's own…). The server checks everything again; this only asks.
import { $, api, confirmModal, el, fmtDate, guard, icon, promptModal, toast } from './common.js';
import { sparks } from './sparks.js';

let data;
const filter = { q: '', status: '' };
const STATUS = { pending: ['czeka', 'chip'], counted: ['policzone', 'chip green'], rejected: ['odrzucone', 'chip red'] };

async function load() {
  const qs = new URLSearchParams();
  if (filter.q) qs.set('q', filter.q);
  if (filter.status) qs.set('status', filter.status);
  const res = await guard(() => api('GET', `/v1/admin/referrals${qs.size ? `?${qs}` : ''}`));
  if (res) data = res;
  return res;
}

export async function referralsPage() {
  if (!(await load())) return;
  render();
}

/** The program's settings (the same as in Ustawienia → Zaproszenia). */
function settingsCard() {
  const s = data.settings;
  const enabled = el('input', { type: 'checkbox', checked: s.enabled });
  const num = (value, min, max, step = 1) => el('input', { type: 'number', min, max, step, value });
  const days = num(s.redeemDays, 1, 365);
  const hours = num(s.hoursGoal, 0, 1000, 0.5);
  const playDays = num(s.daysGoal, 1, 365);
  const inviter = num(s.inviterSparks, 0, 10000);
  const invitee = num(s.inviteeSparks, 0, 10000);
  const cap = num(s.monthlyCap, 1, 1000);
  const field = (label, input, hint) => el('label', { class: 'field' }, el('span', { textContent: label }), input, hint ? el('small', { class: 'muted', textContent: hint }) : '');
  const save = async (e) => {
    e.preventDefault();
    if (s.enabled && !enabled.checked && !await confirmModal({
      title: 'Wyłączyć zaproszenia?', warning: 'Launcher schowa zaproszenia, kodów nie da się wpisać, a oczekujące zaproszenia nie będą się liczyć, dopóki ich nie włączysz.',
      ok: 'Wyłącz', danger: true, icon: 'fa-solid fa-user-plus',
    })) return;
    const res = await guard(() => api('POST', '/v1/admin/settings', { values: {
      'referrals.enabled': enabled.checked, 'referrals.redeemDays': Number(days.value), 'referrals.hoursGoal': Number(hours.value), 'referrals.daysGoal': Number(playDays.value),
      'referrals.inviterSparks': Number(inviter.value), 'referrals.inviteeSparks': Number(invitee.value), 'referrals.monthlyCap': Number(cap.value),
    } }));
    if (!res) return;
    toast(res.changed?.length ? 'Zapisano.' : 'Bez zmian.');
    referralsPage();
  };
  return el('form', { class: 'glass card ach-editor', onsubmit: save },
    el('h3', {}, icon('fa-solid fa-sliders'), ' Ustawienia'),
    el('label', { class: 'opt' }, 'Zaproszenia włączone', el('span', { class: 'switch' }, enabled, el('span'))),
    el('div', { class: 'row two' }, field('Dni na wpisanie kodu', days, 'Od założenia konta.'), field('Limit policzonych na miesiąc', cap, 'Na zapraszającego; reszta czeka do następnego miesiąca.')),
    el('div', { class: 'row two' }, field('Godziny gry zaproszonego', hours, 'Liczone jak w osiągnięciach.'), field('Dni gry zaproszonego', playDays, 'Po co najmniej 10 minut.')),
    el('div', { class: 'row two' }, field('Iskry dla zapraszającego', inviter), field('Iskry dla zaproszonego', invitee)),
    el('p', { class: 'muted small', textContent: 'Zaproszenie liczy się, gdy zaproszony połączy konto Minecraft (każde konto Minecraft liczy się tylko raz) i zagra tyle godzin w tylu różnych dniach. Wtedy obaj dostają Iskry, raz.' }),
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-check'), 'Zapisz ustawienia')));
}

function statsCard() {
  const t = data.totals;
  const stat = (value, label) => el('div', { class: 'chal-stat' }, el('b', { textContent: String(value) }), el('small', { class: 'muted', textContent: label }));
  return el('div', { class: 'glass card' },
    el('h3', {}, icon('fa-solid fa-chart-simple'), ' Razem'),
    el('div', { class: 'chal-stats' }, stat(t.counted, 'policzonych'), stat(t.pending, 'czeka'), stat(t.rejected, 'odrzuconych'), stat(sparks(t.sparks), 'wypłacono (po odebranych)')),
    el('h3', {}, icon('fa-solid fa-ranking-star'), ' Najwięcej zaproszonych'),
    ...(data.top.length ? data.top.slice(0, 15).map((r, i) => el('div', { class: 'row holder' },
      el('b', { textContent: `${i + 1}.` }),
      el('span', { class: 'grow' }, el('b', { textContent: r.name }), el('small', { class: 'muted', textContent: ` @${r.handle}` })),
      el('span', { class: 'chip green', title: 'Policzone', textContent: String(r.counted) }),
      r.pending ? el('span', { class: 'chip', title: 'Czekają', textContent: `+${r.pending}` }) : '',
      r.rejected ? el('span', { class: 'chip red', title: 'Odrzucone', textContent: `−${r.rejected}` }) : '')) : [el('p', { class: 'muted small', textContent: 'Jeszcze nikt nikogo nie zaprosił.' })]));
}

async function reject(r) {
  const counted = r.status === 'counted';
  const reason = await promptModal({
    title: `Odrzucić zaproszenie @${r.invitee.handle}?`,
    text: counted
      ? `Było policzone: serwer odbierze Iskry (@${r.inviter.handle}: ${r.inviterSparks}, @${r.invitee.handle}: ${r.inviteeSparks}) tylko temu, kto je jeszcze ma – saldo nigdy nie spada poniżej zera. Osiągnięcia zostają. Tego nie da się cofnąć.`
      : 'Czeka na policzenie: już nigdy się nie policzy. Tego nie da się cofnąć.',
    label: 'Powód (do dziennika)', placeholder: 'np. drugie konto tej samej osoby', maxLength: 200, ok: 'Odrzuć', danger: true, icon: 'fa-solid fa-ban',
  });
  if (reason === null) return;
  const res = await guard(() => api('POST', `/v1/admin/referrals/${encodeURIComponent(r.invitee.id)}/reject`, { reason }));
  if (!res) return;
  const t = res.rejected.taken;
  toast(res.rejected.was === 'counted'
    ? `Odrzucono. Iskry odebrane: ${[t.inviter ? 'zapraszającemu' : '', t.invitee ? 'zaproszonemu' : ''].filter(Boolean).join(' i ') || 'nikomu (wydane)'}.`
    : 'Odrzucono.');
  await load();
  render();
}

function row(r) {
  const [label, cls] = STATUS[r.status] ?? [r.status, 'chip'];
  return el('div', { class: 'row holder' },
    el('span', { class: 'grow' },
      el('b', { textContent: `@${r.inviter.handle}` }), ' → ', el('b', { textContent: `@${r.invitee.handle}` }),
      el('small', { class: 'muted', textContent: ` · kod ${r.code} · ${fmtDate(r.at)} · ${r.hours} h, ${r.days} ${r.days === 1 ? 'dzień' : 'dni'} · ${r.minecraft ? 'konto Minecraft' : 'bez konta Minecraft'}`
        + `${r.countedAt ? ` · policzone ${fmtDate(r.countedAt)}` : ''}${r.rejectedAt ? ` · odrzucone ${fmtDate(r.rejectedAt)}${r.rejectedBy ? ` przez @${r.rejectedBy}` : ''}${r.note ? `: ${r.note}` : ''}` : ''}` })),
    el('span', { class: cls, textContent: label }),
    r.status === 'counted' ? el('span', { class: 'chip gold', title: 'Iskry: zapraszający / zaproszony' }, el('span', { class: 'spark-sign', textContent: '✦' }), ` ${r.inviterSparks} / ${r.inviteeSparks}`) : '',
    r.status !== 'rejected' ? el('button', { class: 'icon-btn', title: 'Odrzuć (oszukane zaproszenie)', onclick: () => reject(r) }, icon('fa-solid fa-ban')) : '');
}

function render() {
  const q = el('input', { type: 'search', placeholder: 'Szukaj (nick, kod)', value: filter.q });
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { filter.q = q.value.trim(); if (await load()) drawList(); }, 300);
  });
  const status = el('select', { onchange: async () => { filter.status = status.value; if (await load()) drawList(); } },
    ...[['', 'Wszystkie'], ['pending', 'Czekają'], ['counted', 'Policzone'], ['rejected', 'Odrzucone']].map(([v, t]) => el('option', { value: v, textContent: t, selected: filter.status === v })));
  const list = el('div', { class: 'glass card' });
  const drawList = () => list.replaceChildren(el('h3', {}, icon('fa-solid fa-clock-rotate-left'), ' Ostatnio wpisane kody'),
    ...(data.recent.length ? data.recent.map(row) : [el('p', { class: 'muted small', textContent: 'Nic tu nie ma.' })]));
  drawList();
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Zaproszenia' })),
    el('p', { class: 'muted', textContent: 'Każdy gracz ma swój kod i link /z/<kod>. Nowy gracz może wpisać jeden kod w launcherze w pierwszych dniach konta (nie swój i nie kogoś, kogo sam zaprosił). Za policzone zaproszenia są Iskry i osiągnięcia z pelerynami.' }),
    el('div', { class: 'chal-top' }, settingsCard(), statsCard()),
    el('div', { class: 'row' }, q, status),
    list);
}
