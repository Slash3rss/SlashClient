// The admin panel's daily and weekly challenges (challenges.ts on the server): the switch, how many
// a player gets a day and a week, the bonus for finishing all of them, the pool (switch each on and
// off, its target, reward and weight, new ones from a metric the server counts itself) and how many
// players got and finished each. The server checks everything again; this only asks.
import { $, el, fmtDate, guard, icon, api, toast } from './common.js';
import { sparks } from './sparks.js';

let data;
const PERIOD_NAMES = { daily: 'Dzienne', weekly: 'Tygodniowe' };
const metricOf = (id) => data.metrics.find((m) => m.id === id);
const render = (text, c) => (text || '').replaceAll('{n}', String(c.target)).replaceAll('{server}', c.server || '');
const load = async () => (data = await guard(() => api('GET', '/v1/admin/challenges')));
const spark = (n) => el('span', { class: 'chip gold', title: 'Iskry za ukończenie' }, el('span', { class: 'spark-sign', textContent: '✦' }), ` ${n}`);
/** "za 5 h 12 min" until a moment. */
function left(at) {
  const m = Math.max(0, Math.round((at - Date.now()) / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m % 60} min` : `${m} min`;
}

export async function challengesPage() {
  if (!(await load())) return;
  renderList();
}

/** The switch, K and M and the bonuses: the server's settings (also in Ustawienia → Osiągnięcia i Iskry). */
function settingsCard() {
  const s = data.settings;
  const enabled = el('input', { type: 'checkbox', checked: s.enabled });
  const num = (value, max) => el('input', { type: 'number', min: 0, max, step: 1, value });
  const daily = num(s.daily, 10);
  const weekly = num(s.weekly, 10);
  const dailyBonus = num(s.dailyBonus, 10000);
  const weeklyBonus = num(s.weeklyBonus, 10000);
  const field = (label, input, hint) => el('label', { class: 'field' }, el('span', { textContent: label }), input, hint ? el('small', { class: 'muted', textContent: hint }) : '');
  const save = async (e) => {
    e.preventDefault();
    if (s.enabled && !enabled.checked && !confirm('Wyłączyć wyzwania? Nikt nie dostanie nowych, postęp przestanie się liczyć, launcher schowa zakładkę.')) return;
    const res = await guard(() => api('POST', '/v1/admin/settings', { values: {
      'challenges.enabled': enabled.checked, 'challenges.daily': Number(daily.value), 'challenges.weekly': Number(weekly.value),
      'challenges.dailyBonus': Number(dailyBonus.value), 'challenges.weeklyBonus': Number(weeklyBonus.value),
    } }));
    if (!res) return;
    toast(res.changed?.length ? 'Zapisano. Liczba wyzwań zmieni się od następnego dnia lub tygodnia.' : 'Bez zmian.');
    challengesPage();
  };
  return el('form', { class: 'glass card ach-editor', onsubmit: save },
    el('h3', {}, icon('fa-solid fa-sliders'), ' Ustawienia'),
    el('label', { class: 'opt' }, 'Wyzwania włączone', el('span', { class: 'switch' }, enabled, el('span'))),
    el('div', { class: 'row two' }, field('Wyzwań dziennie (0–10)', daily, 'Nowe o północy czasu polskiego.'), field('Wyzwań tygodniowo (0–10)', weekly, 'Nowe w poniedziałek o północy.')),
    el('div', { class: 'row two' }, field('Premia za wszystkie dzienne (Iskry)', dailyBonus, '0: bez premii.'), field('Premia za wszystkie tygodniowe (Iskry)', weeklyBonus, '0: bez premii.')),
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-check'), 'Zapisz ustawienia')));
}

function statsCard() {
  const p = data.periods;
  const stat = (value, label) => el('div', { class: 'chal-stat' }, el('b', { textContent: String(value) }), el('small', { class: 'muted', textContent: label }));
  return el('div', { class: 'glass card' },
    el('h3', {}, icon('fa-solid fa-chart-simple'), ' Teraz'),
    el('div', { class: 'chal-stats' },
      stat(p.daily.players, `graczy z wyzwaniami dziś (${p.daily.key.slice(2)})`),
      stat(p.daily.allDone, 'ukończyło wszystkie dzisiejsze'),
      stat(p.weekly.players, `graczy w tym tygodniu (od ${p.weekly.key.slice(2)})`),
      stat(p.weekly.allDone, 'ukończyło wszystkie tygodniowe'),
      stat(sparks(data.sparks.day), 'wypłacono dziś'),
      stat(sparks(data.sparks.week), 'w tym tygodniu'),
      stat(sparks(data.sparks.month), 'w 30 dni')),
    el('p', { class: 'muted small', textContent: `Dzienne odnowią się za ${left(p.daily.endsAt)}, tygodniowe za ${left(p.weekly.endsAt)} (północ czasu polskiego). Zestaw gracza jest losowany raz na okres (zawsze ten sam na każdym urządzeniu) i zapisywany z celami i nagrodami: zmiany w puli działają od następnego okresu.` }));
}

function poolRow(c) {
  const m = metricOf(c.metric);
  const st = c.stats;
  const toggle = el('input', { type: 'checkbox', checked: c.enabled, title: c.enabled ? 'Włączone' : 'Wyłączone' });
  toggle.addEventListener('click', (e) => e.stopPropagation());
  toggle.addEventListener('change', async () => {
    const res = await guard(() => api('POST', `/v1/admin/challenges/${c.id}`, { enabled: toggle.checked }));
    if (!res) {
      toggle.checked = !toggle.checked;
      return;
    }
    data = res;
    toast(toggle.checked ? 'Włączone (od następnego losowania).' : 'Wyłączone (kto już je ma w tym okresie, może je ukończyć).');
    renderList();
  });
  return el('div', { class: `glass ach-admin-row chal-row${c.enabled ? '' : ' off'}`, role: 'button', tabIndex: 0, onclick: () => editor(c.id), onkeydown: (e) => { if (e.key === 'Enter') editor(c.id); } },
    el('span', { class: 'switch', title: 'Włącz / wyłącz', onclick: (e) => e.stopPropagation() }, toggle, el('span')),
    el('span', { class: 'ach-admin-icon' }, icon(`fa-solid ${c.icon || m?.icon || 'fa-list-check'}`)),
    el('span', { class: 'grow' }, el('b', { textContent: c.preview }), el('small', { class: 'muted', textContent: ` ${c.id} · ${m?.name ?? c.metric}: ${c.target}${c.server ? ` · ${c.server}` : ''}` })),
    c.custom ? el('span', { class: 'chip purple', textContent: 'własne' }) : '',
    c.overridden ? el('span', { class: 'chip sky', textContent: 'zmienione' }) : '',
    c.usable ? '' : el('span', { class: 'chip red', title: 'Nie może być teraz losowane (np. głosowanie nie jest skonfigurowane)', textContent: 'niedostępne' }),
    el('span', { class: 'chip', title: 'Waga przy losowaniu', textContent: `waga ${c.weight}` }),
    spark(c.sparks),
    el('span', { class: 'chip', title: 'Ukończyli / dostali: dziś, w tym tygodniu, w 30 dni', textContent: `${c.period === 'daily' ? `dziś ${st.today.done}/${st.today.assigned}` : `tydzień ${st.week.done}/${st.week.assigned}`} · 30 d ${st.month.done}/${st.month.assigned}` }));
}

function renderList() {
  const sections = ['daily', 'weekly'].map((period) => {
    const list = data.challenges.filter((c) => c.period === period);
    const on = list.filter((c) => c.enabled && c.usable).length;
    const want = period === 'daily' ? data.settings.daily : data.settings.weekly;
    return el('section', { class: 'chal-pool' },
      el('h2', { textContent: `${PERIOD_NAMES[period]} (${on} włączonych, gracz dostaje ${want})` }),
      on < want ? el('p', { class: 'warn small', textContent: `Włączonych jest mniej niż ${want}: gracze dostaną tylko ${on}. Wyzwania liczące to samo nie trafiają do jednego zestawu.` }) : '',
      el('div', { class: 'ach-admin-list' }, ...list.map(poolRow)));
  });
  const recent = el('div', { class: 'glass card' }, el('h3', {}, icon('fa-solid fa-clock-rotate-left'), ' Ostatnio ukończone'),
    ...(data.recent.length ? data.recent.map((r) => el('div', { class: 'row holder' },
      el('span', { class: 'grow' }, el('b', { textContent: r.name }), el('small', { class: 'muted', textContent: ` @${r.handle} · ${r.text} · ${r.period.startsWith('d:') ? 'dzień' : 'tydzień od'} ${r.period.slice(2)}` })),
      spark(r.sparks), el('small', { class: 'muted', textContent: fmtDate(r.at) }))) : [el('p', { class: 'muted small', textContent: 'Jeszcze nikt.' })]));
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Wyzwania' }),
      el('button', { class: 'primary', onclick: () => editor() }, icon('fa-solid fa-plus'), 'Nowe wyzwanie')),
    el('p', { class: 'muted', textContent: 'Codzienne i tygodniowe zadania za Iskry. Liczy się tylko to, co serwer widzi sam (czas gry z połączonym launcherem, serwery, wiadomości z limitem dziennym, udostępnienia, spraye co 30 s, drużyny, głosy), i tylko od początku dnia lub tygodnia.' }),
    el('div', { class: 'chal-top' }, settingsCard(), statsCard()),
    ...sections, recent);
}

function editor(id) {
  const now = id ? data.challenges.find((c) => c.id === id) : undefined;
  const isNew = !now;
  const c = now ? { ...now, server: now.server ?? '', icon: now.icon ?? '' } : { id: '', period: 'daily', metric: 'play_minutes', target: 30, sparks: 15, weight: 1, enabled: true, name: '', nameEn: '', icon: '', server: '', custom: true };
  const field = (label, input, hint) => el('label', { class: 'field' }, el('span', { textContent: label }), input, hint ? el('small', { class: 'muted', textContent: hint }) : '');
  const text = (key, placeholder) => el('input', { type: 'text', value: c[key] ?? '', maxLength: 80, placeholder, oninput: (e) => { c[key] = e.target.value; preview(); } });
  const num = (key, min, max) => el('input', { type: 'number', min, max, step: 1, value: c[key], oninput: (e) => { c[key] = Number(e.target.value); preview(); } });
  const slug = el('input', { type: 'text', value: c.id, maxLength: 40, placeholder: 'np. d_skyup_60', disabled: !isNew, oninput: () => { c.id = slug.value.trim(); } });
  const period = el('select', { onchange: () => { c.period = period.value; syncMetric(); preview(); } },
    ...Object.entries(PERIOD_NAMES).map(([v, t]) => el('option', { value: v, textContent: t, selected: c.period === v })));
  const metric = el('select', { onchange: () => { c.metric = metric.value; syncMetric(); preview(); } },
    ...data.metrics.map((m) => el('option', { value: m.id, textContent: `${m.name}${m.periods.length < 2 ? ' — tylko tygodniowe' : ''}${m.available ? '' : ' (teraz niedostępne)'}`, selected: c.metric === m.id })));
  const target = num('target', 1, 100000);
  const targetHint = el('small', { class: 'muted' });
  const serverIn = el('input', { type: 'text', value: c.server, maxLength: 253, placeholder: 'np. skyup.pl', oninput: () => { c.server = serverIn.value.trim().toLowerCase(); preview(); } });
  const serverField = field('Serwer', serverIn, 'Liczą się też subdomeny (skyup.pl obejmuje play.skyup.pl).');
  const syncMetric = () => {
    const m = metricOf(c.metric);
    target.max = m.max;
    targetHint.textContent = `${m.max <= 7 ? 'Dni' : /Minuty/.test(m.name) ? 'Minuty' : 'Liczba'}: od 1 do ${m.max}.${m.available ? '' : ' Ta metryka nie jest teraz dostępna (np. głosowanie wymaga ustawionego klucza listy serwerów): wyzwanie nie będzie losowane.'}`;
    serverField.style.display = m.server ? '' : 'none';
    if (!m.periods.includes(c.period)) {
      c.period = m.periods[0];
      period.value = c.period;
    }
  };
  const enabled = el('input', { type: 'checkbox', checked: c.enabled, onchange: () => { c.enabled = enabled.checked; preview(); } });
  const icons = el('div', { class: 'icon-grid' });
  const drawIcons = () => icons.replaceChildren(
    el('button', { type: 'button', class: `icon-pick${c.icon ? '' : ' active'}`, title: 'Domyślna dla metryki', onclick: () => { c.icon = ''; drawIcons(); preview(); } }, icon(`fa-solid ${metricOf(c.metric)?.icon ?? 'fa-list-check'}`)),
    ...data.icons.map((i) => el('button', { type: 'button', class: `icon-pick${c.icon === i ? ' active' : ''}`, title: i, onclick: () => { c.icon = i; drawIcons(); preview(); } }, icon(`fa-solid ${i}`))));
  drawIcons();

  const card = el('div', { class: 'ach-preview' });
  function preview() {
    const ic = c.icon || metricOf(c.metric)?.icon || 'fa-list-check';
    const one = (lang) => el('div', { class: 'ach-preview-card' },
      el('div', { class: 'ach-preview-icon' }, icon(`fa-solid ${ic}`)),
      el('div', { class: 'grow' }, el('b', { textContent: render(lang === 'en' ? c.nameEn || c.name : c.name, c) || 'Nazwa' }),
        el('div', { class: 'ach-preview-bar' }, el('span')), el('small', { class: 'muted', textContent: `0 / ${c.target || 0}` })),
      el('div', { class: 'ach-preview-side' }, spark(c.sparks || 0)));
    card.replaceChildren(el('small', { class: 'muted', textContent: 'Podgląd (PL i EN):' }), one('pl'), one('en'),
      el('small', { class: 'muted', textContent: `${PERIOD_NAMES[c.period]} · waga ${c.weight}${c.enabled ? '' : ' · wyłączone'}` }));
  }
  syncMetric();
  preview();

  const save = async (e) => {
    e.preventDefault();
    const body = { period: c.period, metric: c.metric, target: c.target, sparks: c.sparks, weight: c.weight, enabled: c.enabled, name: c.name, nameEn: c.nameEn, icon: c.icon, ...(metricOf(c.metric)?.server ? { server: c.server } : {}) };
    if (isNew && !/^[a-z][a-z0-9_]{2,39}$/.test(c.id)) return toast('Id: małe litery, cyfry i _, 3–40 znaków, zaczyna się od litery.', true);
    if (isNew && data.challenges.some((x) => x.id === c.id)) return toast('Takie id już jest.', true);
    const res = await guard(() => api('POST', `/v1/admin/challenges/${c.id}`, body));
    if (!res) return;
    data = res;
    toast('Zapisano. Zmiany działają od następnego losowania (kto już ma to wyzwanie, kończy je na starych warunkach).');
    editor(c.id);
  };
  const remove = async () => {
    const what = now.custom ? `Usunąć wyzwanie „${now.preview}”?` : 'Przywrócić domyślne ustawienia tego wyzwania?';
    if (!confirm(`${what} Kto ma je w tym okresie, nadal może je ukończyć.`)) return;
    const res = await guard(() => api('DELETE', `/v1/admin/challenges/${c.id}`));
    if (!res) return;
    data = res;
    toast(now.custom ? 'Usunięto.' : 'Przywrócono domyślne.');
    if (now.custom) renderList();
    else editor(c.id);
  };

  const form = el('form', { class: 'glass card ach-editor', onsubmit: save },
    el('div', { class: 'ach-editor-cols' },
      el('div', { class: 'ach-editor-main' },
        isNew ? field('Id', slug, 'Małe litery, cyfry i _, 3–40 znaków. Nie da się go później zmienić.') : el('p', { class: 'muted small', textContent: `${c.custom ? 'Własne' : 'Wbudowane'} wyzwanie ${c.id}.${c.custom ? '' : ' Zmiany są zapisywane osobno; „Przywróć domyślne” je cofa.'}` }),
        el('div', { class: 'row two' }, field('Nazwa (PL)', text('name', 'Graj {n} min'), '{n} to cel, {server} serwer.'), field('Nazwa (EN)', text('nameEn', 'Play for {n} min'))),
        el('div', { class: 'row two' }, field('Rodzaj', period), field('Co się liczy', metric, 'Tylko liczby, które serwer sprawdza sam.')),
        el('div', { class: 'row two' }, field('Cel', target), field('Iskry (0–10 000)', num('sparks', 0, 10000), 'Wypłacane raz, przy ukończeniu.')),
        targetHint,
        serverField,
        el('div', { class: 'row two' }, field('Waga (0–100)', num('weight', 0, 100), 'Jak często trafia do zestawu w porównaniu z innymi; 0: nigdy.'),
          el('label', { class: 'opt' }, 'Włączone', el('span', { class: 'switch' }, enabled, el('span')))),
        field('Ikona', icons)),
      el('div', { class: 'ach-editor-side' }, card,
        now ? el('div', { class: 'chal-stats small' },
          el('div', { class: 'chal-stat' }, el('b', { textContent: `${now.stats.today.done}/${now.stats.today.assigned}` }), el('small', { class: 'muted', textContent: 'dziś' })),
          el('div', { class: 'chal-stat' }, el('b', { textContent: `${now.stats.week.done}/${now.stats.week.assigned}` }), el('small', { class: 'muted', textContent: 'ten tydzień' })),
          el('div', { class: 'chal-stat' }, el('b', { textContent: `${now.stats.month.done}/${now.stats.month.assigned}` }), el('small', { class: 'muted', textContent: '30 dni' }))) : '',
        now ? el('small', { class: 'muted', textContent: 'Ukończyli / dostali.' }) : '')),
    el('div', { class: 'row' },
      el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-check'), isNew ? 'Utwórz' : 'Zapisz'),
      now && (now.custom || now.overridden) ? el('button', { type: 'button', class: now.custom ? 'danger' : '', onclick: remove }, icon(`fa-solid ${now.custom ? 'fa-trash' : 'fa-rotate-left'}`), now.custom ? 'Usuń' : 'Przywróć domyślne') : ''));

  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: isNew ? 'Nowe wyzwanie' : now.preview }), el('button', { onclick: () => renderList() }, icon('fa-solid fa-arrow-left'), 'Wszystkie')),
    form);
  window.scrollTo(0, 0);
}
