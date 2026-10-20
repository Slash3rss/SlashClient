// The admin panel's achievement creator: the list of achievements (built-in and made here), an
// editor with a live preview of the card, the reward picked from the catalog (with how each item can
// be got now), and the players who have one (given and taken by hand for the manual ones). The
// server checks everything again (achievementsAdmin.ts); this only asks.
import { $, cosmeticEl, el, fmtDate, guard, icon, api, toast } from './common.js';
import { sparks } from './sparks.js';

const CATEGORY_NAMES = {
  play: 'Gra', streak: 'Serie', social: 'Znajomi', community: 'Grupy i klany', explore: 'Serwery', sharing: 'Udostępnianie', style: 'Styl', secret: 'Ukryte',
};
const SLOT_NAMES = {
  cape: 'Peleryna', wings: 'Skrzydła', elytra: 'Elytra', trail: 'Ślad', aura: 'Aura', pet: 'Zwierzak', hat: 'Czapka', top: 'Góra', shoes: 'Buty', hands: 'Rękawice',
  face: 'Twarz', ears: 'Uszy', back: 'Plecy', tail: 'Ogon', kill: 'Efekt zabicia', ring: 'Krąg', move: 'Ruch', spray: 'Spray', prop: 'Rekwizyt', shield: 'Tarcza', weapon: 'Broń',
};

let data;
/** The address this page set itself (going back and forth in the browser's history is not one). */
let own = '';
const go = (hash) => {
  own = `#${hash}`;
  location.hash = hash;
};
/** Whether the address changed by the browser (back, a pasted link), so the page should follow it. */
export const foreignHash = () => location.hash !== own;
/** What the list shows. */
const filter = { q: '', category: '', kind: '' };

const load = async () => (data = await guard(() => api('GET', '/v1/admin/achievements')));
const metricOf = (id) => data.metrics.find((m) => m.id === id);
const itemOf = (id) => data.items.find((i) => i.id === id);
const goalText = (a) => (a.manual ? 'przyznawane ręcznie' : `${metricOf(a.metric)?.name ?? a.metric}: ${a.goal}`);

/** "How to get" as a line, achievements as links to their editor (`skip`: the one being edited). */
export function obtainLine(obtain, open, skip) {
  const parts = obtain.ways.map((w) => {
    if (w.kind === 'free') return el('span', { class: 'chip green', textContent: 'za darmo' });
    if (w.kind === 'shop') return el('span', { class: 'chip gold' }, el('span', { class: 'spark-sign', textContent: '✦' }), ` sklep: ${w.price}`);
    if (w.kind === 'rank') return el('span', { class: 'chip sky', textContent: `ranga ${w.rank}` });
    if (w.kind === 'grant') return el('span', { class: 'chip', textContent: 'tylko przyznanie' });
    const label = `${w.custom ? 'własne' : 'osiągnięcie'}: ${w.name}${w.manual ? ' (ręczne)' : ''}${w.enabled ? '' : ' (wyłączone)'}`;
    if (w.id === skip || !open) return el('span', { class: `chip purple${w.enabled ? '' : ' off'}`, textContent: label });
    return el('a', { class: `chip purple link${w.enabled ? '' : ' off'}`, href: `#achievements:${w.id}`, title: 'Otwórz w kreatorze osiągnięć', onclick: (e) => { e.preventDefault(); open(w.id); } }, icon('fa-solid fa-trophy'), ` ${label}`);
  });
  return el('div', { class: 'obtain' }, obtain.disabled ? el('span', { class: 'chip red', textContent: 'wyłączony' }) : '', ...parts);
}

// ---------- the list ----------

export async function achievementsPage() {
  const focus = location.hash.split(':')[1];
  if (!(await load())) return;
  if (focus && data.achievements.some((a) => a.id === focus)) return editor(focus);
  renderList();
}

function renderList() {
  const q = el('input', { type: 'search', placeholder: 'Szukaj (nazwa, id)', value: filter.q, oninput: () => { filter.q = q.value; draw(); } });
  const cat = el('select', { onchange: () => { filter.category = cat.value; draw(); } },
    el('option', { value: '', textContent: 'Wszystkie kategorie' }), ...data.categories.map((c) => el('option', { value: c, textContent: CATEGORY_NAMES[c] ?? c, selected: filter.category === c })));
  const kind = el('select', { onchange: () => { filter.kind = kind.value; draw(); } },
    ...[['', 'Wszystkie'], ['builtin', 'Wbudowane'], ['custom', 'Własne'], ['changed', 'Zmienione'], ['off', 'Wyłączone']].map(([v, t]) => el('option', { value: v, textContent: t, selected: filter.kind === v })));
  const list = el('div', { class: 'ach-admin-list' });
  const total = data.achievements.filter((a) => a.enabled).reduce((n, a) => n + a.sparks, 0);
  const draw = () => {
    const s = filter.q.trim().toLowerCase();
    const shown = data.achievements.filter((a) => (!s || a.name.toLowerCase().includes(s) || a.id.includes(s) || a.nameEn.toLowerCase().includes(s))
      && (!filter.category || a.category === filter.category)
      && (!filter.kind || (filter.kind === 'builtin' ? !a.custom : filter.kind === 'custom' ? a.custom : filter.kind === 'changed' ? a.overridden : !a.enabled)));
    list.replaceChildren(...shown.map((a) => {
      const reward = a.reward ? itemOf(a.reward) : undefined;
      return el('button', { type: 'button', class: `glass ach-admin-row${a.enabled ? '' : ' off'}`, onclick: () => { go(`achievements:${a.id}`); editor(a.id); } },
        el('span', { class: 'ach-admin-icon' }, icon(`fa-solid ${a.icon}`)),
        el('span', { class: 'grow' }, el('b', { textContent: a.name }), el('small', { class: 'muted', textContent: ` ${a.id} · ${CATEGORY_NAMES[a.category] ?? a.category} · ${goalText(a)}` })),
        a.custom ? el('span', { class: 'chip purple', textContent: 'własne' }) : '',
        a.overridden ? el('span', { class: 'chip sky', textContent: 'zmienione' }) : '',
        a.hidden ? el('span', { class: 'chip', textContent: 'ukryte' }) : '',
        a.enabled ? '' : el('span', { class: 'chip red', textContent: 'wyłączone' }),
        reward ? el('span', { class: 'ach-admin-reward', title: reward.name }, cosmeticEl(reward.id, reward.slot, true)) : '',
        el('span', { class: 'chip gold', title: 'Iskry za odblokowanie' }, el('span', { class: 'spark-sign', textContent: '✦' }), ` ${a.sparks}`),
        el('span', { class: 'chip', title: 'Ile osób ma', textContent: `${a.holders} ma` }));
    }));
    if (!shown.length) list.append(el('p', { class: 'muted', textContent: 'Nic nie pasuje.' }));
  };
  draw();
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Osiągnięcia' }),
      el('button', { class: 'primary', onclick: () => { go('achievements:new'); editor(); } }, icon('fa-solid fa-plus'), 'Nowe osiągnięcie')),
    el('p', { class: 'muted', textContent: `Wszystkich: ${data.achievements.length}, włączone płacą razem ${sparks(total)}. Liczy się tylko to, co widzi serwer (czas gry, znajomi, serwery, udostępnienia…); własne osiągnięcia biorą metrykę z listy albo są przyznawane ręcznie.` }),
    el('div', { class: 'row ach-admin-filters' }, q, cat, kind),
    list);
}

// ---------- the editor ----------

function editor(id) {
  const now = id ? data.achievements.find((a) => a.id === id) : undefined;
  const isNew = !now;
  const a = now ? { ...now } : { id: '', metric: 'hours', goal: 10, sparks: 50, category: 'play', icon: '', ownIcon: '', name: '', nameEn: '', description: '', descriptionEn: '', hidden: false, enabled: true, reward: '', custom: true, manual: false };
  let icon_ = now ? now.ownIcon : '';
  let lang = 'pl';

  const field = (label, input, hint) => el('label', { class: 'field' }, el('span', { textContent: label }), input, hint ? el('small', { class: 'muted', textContent: hint }) : '');
  const text = (key, max, placeholder) => el('input', { type: 'text', value: a[key] ?? '', maxLength: max, placeholder, oninput: (e) => { a[key] = e.target.value; preview(); } });
  const area = (key, placeholder) => el('textarea', { rows: 2, maxLength: 200, placeholder, value: a[key] ?? '', oninput: (e) => { a[key] = e.target.value; preview(); } });

  const slug = el('input', { type: 'text', value: a.id, maxLength: 40, placeholder: 'np. pomocnik_2026', pattern: '[a-z][a-z0-9_]{2,39}', disabled: !isNew, oninput: () => { a.id = slug.value; } });
  const metric = el('select', { disabled: !a.custom, onchange: () => { a.metric = metric.value; a.manual = a.metric === 'manual'; syncGoal(); preview(); } },
    ...(a.custom ? [el('option', { value: 'manual', textContent: 'Przyznawane ręcznie (admin wybiera graczy)', selected: a.metric === 'manual' })] : []),
    ...data.metrics.map((m) => el('option', { value: m.id, textContent: `${m.name} (najwyżej ${m.max})`, selected: a.metric === m.id })));
  const goal = el('input', { type: 'number', min: 1, step: 1, value: a.goal, oninput: () => { a.goal = Number(goal.value); preview(); } });
  const goalHint = el('small', { class: 'muted' });
  const syncGoal = () => {
    const m = metricOf(a.metric);
    goal.disabled = !m;
    goal.max = m?.max ?? 1;
    goalHint.textContent = m ? `Od 1 do ${m.max}. Obniżenie odblokuje osiągnięcie od razu wszystkim, którzy już tyle mają (z wypłatą); podwyższenie nikomu go nie zabierze.` : 'Ręczne: gracze dostają je od admina poniżej.';
  };
  syncGoal();
  const sparksIn = el('input', { type: 'number', min: 0, max: data.maxSparks, step: 1, value: a.sparks, oninput: () => { a.sparks = Number(sparksIn.value); preview(); } });
  const category = el('select', { onchange: () => { a.category = category.value; preview(); } }, ...data.categories.map((c) => el('option', { value: c, textContent: CATEGORY_NAMES[c] ?? c, selected: a.category === c })));
  const check = (key, label, hint) => {
    const box = el('input', { type: 'checkbox', checked: !!a[key], onchange: () => { a[key] = box.checked; preview(); } });
    return el('label', { class: 'opt', title: hint }, label, el('span', { class: 'switch' }, box, el('span')));
  };

  // the icon: one of those every client can draw
  const icons = el('div', { class: 'icon-grid' });
  const drawIcons = () => icons.replaceChildren(
    el('button', { type: 'button', class: `icon-pick${icon_ ? '' : ' active'}`, title: 'Domyślna dla metryki', onclick: () => { icon_ = ''; drawIcons(); preview(); } }, icon('fa-solid fa-rotate-left')),
    ...data.icons.map((ic) => el('button', { type: 'button', class: `icon-pick${icon_ === ic ? ' active' : ''}`, title: ic, onclick: () => { icon_ = ic; drawIcons(); preview(); } }, icon(`fa-solid ${ic}`))));
  drawIcons();

  // the reward: any item of the catalog, with how it can be got now
  const rewardBox = el('div', { class: 'reward-pick' });
  const rq = el('input', { type: 'search', placeholder: 'Szukaj przedmiotu' });
  const rslot = el('select', {}, el('option', { value: '', textContent: 'Wszystkie miejsca' }), ...[...new Set(data.items.map((i) => i.slot))].map((s) => el('option', { value: s, textContent: SLOT_NAMES[s] ?? s })));
  const rgrid = el('div', { class: 'reward-grid' });
  const chosen = el('div', { class: 'reward-chosen' });
  const drawReward = () => {
    const it = a.reward ? itemOf(a.reward) : undefined;
    const elsewhere = it ? it.obtain.ways.filter((w) => w.kind === 'achievement' && w.id !== a.id) : [];
    chosen.replaceChildren(it
      ? el('div', { class: 'row' }, cosmeticEl(it.id, it.slot, true),
        el('div', { class: 'grow' }, el('b', { textContent: it.name }), el('small', { class: 'muted', textContent: ` ${SLOT_NAMES[it.slot] ?? it.slot}` }), obtainLine(it.obtain, openOther, a.id),
          it.obtain.ways.some((w) => w.kind === 'free') ? el('small', { class: 'warn', textContent: 'Ten przedmiot jest dostępny za darmo: nagroda niczego nie odblokuje. Żeby był tylko za osiągnięcie, oznacz go jako ekskluzywny w zakładce Kosmetyki.' }) : '',
          elsewhere.length ? el('small', { class: 'muted', textContent: `Jest już nagrodą także w: ${elsewhere.map((w) => w.name).join(', ')}.` }) : ''),
        el('button', { type: 'button', class: 'icon-btn', title: 'Bez przedmiotu', onclick: () => { a.reward = ''; drawReward(); preview(); } }, icon('fa-solid fa-xmark')))
      : el('small', { class: 'muted', textContent: 'Bez przedmiotu (tylko Iskry).' }));
    const s = rq.value.trim().toLowerCase();
    const list = data.items.filter((i) => (!rslot.value || i.slot === rslot.value) && (!s || i.name.toLowerCase().includes(s) || i.id.includes(s))).slice(0, 60);
    rgrid.replaceChildren(...list.map((i) => el('button', { type: 'button', class: `reward-tile${a.reward === i.id ? ' active' : ''}`, title: `${i.name}: ${i.obtain.text}`, onclick: () => { a.reward = i.id; drawReward(); preview(); } },
      cosmeticEl(i.id, i.slot, true), el('small', { textContent: i.name }), el('small', { class: 'muted tiny', textContent: i.obtain.text }))));
  };
  rq.addEventListener('input', drawReward);
  rslot.addEventListener('change', drawReward);
  rewardBox.append(chosen, el('div', { class: 'row' }, rq, rslot), rgrid);
  drawReward();

  // the card as players will see it, in Polish or English
  const card = el('div', { class: 'ach-preview' });
  const langBtn = (code, label) => el('button', { type: 'button', class: `chip${lang === code ? ' active' : ''}`, onclick: () => { lang = code; preview(); } }, label);
  const langs = el('div', { class: 'row' });
  function preview() {
    langs.replaceChildren(el('small', { class: 'muted', textContent: 'Podgląd:' }), langBtn('pl', 'PL'), langBtn('en', 'EN'));
    const name = (lang === 'en' ? a.nameEn || a.name : a.name) || (lang === 'en' ? 'Name' : 'Nazwa');
    const desc = (lang === 'en' ? a.descriptionEn || a.description : a.description) || (lang === 'en' ? 'Description' : 'Opis');
    const ic = icon_ || (a.metric === 'manual' ? 'fa-award' : now?.defaults?.icon ?? data.achievements.find((x) => x.metric === a.metric && !x.custom)?.defaults?.icon ?? 'fa-trophy');
    const it = a.reward ? itemOf(a.reward) : undefined;
    const m = metricOf(a.metric);
    const unit = m ? `0 / ${a.goal || 0}` : '';
    card.replaceChildren(
      el('div', { class: 'ach-preview-card' },
        el('div', { class: 'ach-preview-icon' }, icon(`fa-solid ${ic}`)),
        el('div', { class: 'grow' }, el('b', { textContent: name }), el('small', { class: 'muted', textContent: desc }),
          m ? el('div', { class: 'ach-preview-bar' }, el('span')) : '', m ? el('small', { class: 'muted', textContent: unit }) : ''),
        el('div', { class: 'ach-preview-side' }, el('span', { class: 'chip gold' }, el('span', { class: 'spark-sign', textContent: '✦' }), ` ${a.sparks || 0}`),
          it ? el('div', { class: 'ach-preview-reward' }, cosmeticEl(it.id, it.slot, true), el('small', { textContent: it.name })) : '')),
      a.hidden ? el('div', { class: 'ach-preview-card secret' }, el('div', { class: 'ach-preview-icon' }, icon('fa-solid fa-question')),
        el('div', { class: 'grow' }, el('b', { textContent: '???' }), el('small', { class: 'muted', textContent: lang === 'en' ? 'A hidden achievement. Find it yourself!' : 'Ukryte osiągnięcie. Odkryj je sam!' })),
        el('small', { class: 'muted', textContent: lang === 'en' ? 'before unlocking' : 'przed odblokowaniem' })) : '',
      el('small', { class: 'muted', textContent: `${CATEGORY_NAMES[a.category] ?? a.category} · ${a.manual || a.metric === 'manual' ? 'przyznawane ręcznie' : `${m?.name ?? ''}: ${a.goal}`}${a.enabled ? '' : ' · wyłączone'}` }));
  }
  preview();

  const body = () => ({
    ...(isNew ? { id: a.id.trim(), metric: a.metric } : a.custom ? { metric: a.metric } : {}),
    name: a.name, nameEn: a.nameEn, description: a.description, descriptionEn: a.descriptionEn, icon: icon_, category: a.category,
    hidden: !!a.hidden, enabled: !!a.enabled, sparks: a.sparks, reward: a.reward,
    ...(a.metric === 'manual' ? {} : { goal: a.goal }),
  });
  const save = async (e) => {
    e.preventDefault();
    const rewardChanged = now && ((now.reward ?? '') !== (a.reward ?? '') || now.sparks !== a.sparks);
    if (rewardChanged && now.holders && !confirm(`Nowa nagroda dotyczy tylko tych, którzy odblokują osiągnięcie od teraz. ${now.holders} graczy, którzy już je mają, nie dostanie nic więcej. Zapisać?`)) return;
    if (now && now.enabled && !a.enabled && !confirm('Wyłączone osiągnięcie przestanie być przyznawane i zniknie z listy u tych, którzy go nie mają. Kto je ma, zachowuje je. Zapisać?')) return;
    const res = await guard(() => api('POST', isNew ? '/v1/admin/achievements' : `/v1/admin/achievements/${a.id}`, body()));
    if (!res) return;
    data = res;
    toast(res.unlocked ? `Zapisano. Odblokowano od razu: ${res.unlocked}.` : 'Zapisano.');
    go(`achievements:${isNew ? a.id.trim() : a.id}`);
    editor(isNew ? a.id.trim() : a.id);
  };
  const reset = async () => {
    if (!confirm('Przywrócić domyślne ustawienia tego osiągnięcia (nazwy, opisy, ikonę, cel, nagrodę)? Kto je ma, zachowuje je.')) return;
    const res = await guard(() => api('POST', `/v1/admin/achievements/${a.id}/reset`));
    if (!res) return;
    data = res;
    toast('Przywrócono domyślne.');
    editor(a.id);
  };
  const remove = async () => {
    if (!confirm(`Usunąć osiągnięcie „${a.name}”?`)) return;
    const res = await guard(() => api('DELETE', `/v1/admin/achievements/${a.id}`));
    if (!res) return;
    data = res;
    toast('Usunięto.');
    go('achievements');
    renderList();
  };
  const back = () => { go('achievements'); renderList(); };

  const form = el('form', { class: 'glass card ach-editor', onsubmit: save },
    el('div', { class: 'ach-editor-cols' },
      el('div', { class: 'ach-editor-main' },
        isNew || a.custom ? field('Id', slug, isNew ? 'Małe litery, cyfry i _, 3–40 znaków. Nie da się go później zmienić.' : 'Id nie da się zmienić.') : el('p', { class: 'muted small', textContent: `Wbudowane osiągnięcie ${a.id}. Zmiany są zapisywane osobno; „Przywróć domyślne” je cofa.` }),
        el('div', { class: 'row two' }, field('Nazwa (PL)', text('name', 60, 'Pomocnik')), field('Nazwa (EN)', text('nameEn', 60, 'Helper'))),
        el('div', { class: 'row two' }, field('Opis (PL)', area('description', 'Za co się je dostaje')), field('Opis (EN)', area('descriptionEn', 'What it is for'))),
        el('div', { class: 'row two' }, field('Kategoria', category), field(`Iskry (0–${data.maxSparks})`, sparksIn, 'Wypłacane raz, przy odblokowaniu.')),
        el('div', { class: 'row two' }, field('Warunek', metric, a.custom ? 'Tylko liczby, które serwer sprawdza sam.' : 'Wbudowane liczą zawsze to samo.'), field('Cel', goal)),
        goalHint,
        el('div', { class: 'row' }, check('enabled', 'Włączone', 'Wyłączone nie jest przyznawane'), check('hidden', 'Ukryte', 'Do odblokowania widać „???”')),
        field('Ikona', icons),
        field('Nagroda: przedmiot', rewardBox, 'Zmiana nagrody nie wypłaca jej ponownie tym, którzy już mają osiągnięcie.')),
      el('div', { class: 'ach-editor-side' }, langs, card)),
    el('div', { class: 'row' },
      el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-check'), isNew ? 'Utwórz' : 'Zapisz'),
      now && !now.custom && now.overridden ? el('button', { type: 'button', onclick: reset }, icon('fa-solid fa-rotate-left'), 'Przywróć domyślne') : '',
      now?.custom ? (now.holders
        ? el('small', { class: 'muted', textContent: `Ma je ${now.holders} graczy: nie da się go usunąć, można je wyłączyć.` })
        : el('button', { type: 'button', class: 'danger', onclick: remove }, icon('fa-solid fa-trash'), 'Usuń')) : ''));

  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: isNew ? 'Nowe osiągnięcie' : a.name }), el('button', { onclick: back }, icon('fa-solid fa-arrow-left'), 'Wszystkie')),
    form, now ? holdersSection(now) : '');
}

/** From a link in "how to get": another achievement's editor. */
function openOther(id) {
  go(`achievements:${id}`);
  editor(id);
}

/** Who has it; for a manual one also giving and taking. */
function holdersSection(a) {
  const box = el('div', { class: 'glass card' }, el('h3', { textContent: 'Kto ma to osiągnięcie' }), el('p', { class: 'muted small', textContent: 'Wczytywanie…' }));
  const claw = el('input', { type: 'checkbox' });
  const show = (holders) => {
    const rows = holders.map((h) => el('div', { class: 'row holder' },
      el('span', { class: 'grow' }, el('b', { textContent: h.name }), el('small', { class: 'muted', textContent: ` @${h.handle} · ${fmtDate(h.at)}` })),
      a.manual ? el('button', { type: 'button', class: 'icon-btn', title: 'Odbierz', onclick: () => revoke(h) }, icon('fa-solid fa-user-minus')) : ''));
    const parts = [el('h3', { textContent: `Kto ma to osiągnięcie (${holders.length})` })];
    if (a.manual) {
      const who = el('textarea', { rows: 2, placeholder: '@nick, nick z Minecrafta… (po przecinku lub w nowych liniach)' });
      parts.push(el('form', { class: 'row', onsubmit: async (e) => {
        e.preventDefault();
        const players = who.value.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
        if (!players.length) return;
        const res = await guard(() => api('POST', `/v1/admin/achievements/${a.id}/grant`, { players }));
        if (!res) return;
        toast([res.granted.length ? `Przyznano: ${res.granted.join(', ')}` : '', res.had.length ? `Już mieli: ${res.had.join(', ')}` : '', res.unknown.length ? `Nie znaleziono: ${res.unknown.join(', ')}` : ''].filter(Boolean).join('. ') || 'Nic do zrobienia.', !!res.unknown.length && !res.granted.length);
        who.value = '';
        show(res.holders);
      } }, who, el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-user-plus'), 'Przyznaj')));
      parts.push(el('p', { class: 'muted small', textContent: `Przyznanie wypłaca ${sparks(a.sparks)}${a.reward ? ' i daje przedmiot' : ''} (raz na gracza, także po odebraniu i ponownym przyznaniu).` }),
        el('label', { class: 'opt small' }, `Przy odbieraniu zabierz też wypłacone Iskry${a.reward ? ' i przedmiot' : ''} (saldo nie spadnie poniżej zera)`, el('span', { class: 'switch' }, claw, el('span'))));
    }
    parts.push(...(rows.length ? rows : [el('p', { class: 'muted small', textContent: 'Nikt.' })]));
    box.replaceChildren(...parts);
  };
  const revoke = async (h) => {
    const clawback = claw.checked;
    if (!confirm(`Odebrać osiągnięcie @${h.handle}? ${clawback ? `Zabierzesz też wypłacone Iskry${a.reward ? ' i przedmiot' : ''}.` : 'Iskry zostają u gracza.'}`)) return;
    const res = await guard(() => api('POST', `/v1/admin/achievements/${a.id}/revoke`, { player: h.id, clawback }));
    if (!res) return;
    toast(clawback ? `Odebrano. Iskry: −${res.taken}.` : 'Odebrano.');
    show(res.holders);
  };
  api('GET', `/v1/admin/achievements/${a.id}/holders`).then((r) => show(r.holders)).catch(() => box.replaceChildren(el('p', { class: 'muted', textContent: 'Nie udało się wczytać.' })));
  return box;
}
