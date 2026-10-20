// The admin panel's "Dokumenty": the terms, the privacy policy and the support terms, Polish and
// English. Each is edited as Markdown with a live preview (rendered by the server, exactly as the
// site shows it), saved as a draft or published, and every version stays in the history to view,
// compare and restore. The administrator's details fill {{admin.…}} in all of them.
import { $, api, el, fmtDate, guard, icon, toast } from './common.js';

const LANG_NAMES = { pl: 'polski', en: 'angielski' };

export async function legalPage() {
  const res = await guard(() => api('GET', '/v1/admin/legal'));
  if (!res) return;

  // ---- the administrator's details, used by every document ----
  const inputs = {};
  const fields = Object.entries(res.varLabels).map(([key, label]) => {
    inputs[key] = el('input', { type: 'text', value: res.vars[key] ?? '', placeholder: label, maxLength: 300 });
    return el('label', { class: 'st-field' }, el('span', {}, label[0].toUpperCase() + label.slice(1), ' ', el('code', { class: 'muted small', textContent: `{{${key}}}` })), inputs[key]);
  });
  const saveVars = el('button', { class: 'primary', onclick: async () => {
    const vars = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
    if (await guard(() => api('POST', '/v1/admin/legal/vars', { vars }))) toast('Dane administratora zapisane — strony już je pokazują.');
  } }, icon('fa-solid fa-floppy-disk'), 'Zapisz dane');
  const varsCard = el('div', { class: 'glass card lg-vars' },
    el('h3', {}, icon('fa-solid fa-id-card'), ' Dane administratora'),
    el('p', { class: 'muted small', textContent: 'Wpisz raz: trafią w miejsca {{admin.…}} we wszystkich dokumentach. Puste pole widać na stronie jako [UZUPEŁNIJ: …].' }),
    el('div', { class: 'lg-vars-grid' }, ...fields),
    el('div', { class: 'row' }, saveVars));

  // ---- the documents ----
  const cards = res.docs.map((d) => {
    const langRow = (l) => {
      const s = d[l];
      const draft = s.draftAt > s.publishedAt;
      return el('div', { class: 'lg-lang row' },
        el('b', { class: 'lg-code', textContent: l.toUpperCase() }),
        el('span', { class: 'grow muted small' }, s.publishedAt ? `opublikowano ${fmtDate(s.publishedAt)}` : 'nieopublikowany',
          draft ? el('span', { class: 'chip gold lg-chip', textContent: `szkic z ${fmtDate(s.draftAt)}` }) : ''),
        el('a', { class: 'btn', href: s.path, target: '_blank', rel: 'noopener', title: 'Otwórz na stronie' }, icon('fa-solid fa-arrow-up-right-from-square')),
        el('button', { class: 'primary', onclick: () => editor(d.id, l) }, icon('fa-solid fa-pen'), 'Edytuj'));
    };
    const banner = el('select', {},
      el('option', { value: 'default', textContent: `Domyślnie (LEGAL_DRAFT: ${res.bannerDefault ? 'widoczny' : 'ukryty'})`, selected: d.banner === null }),
      el('option', { value: 'on', textContent: 'Widoczny', selected: d.banner === true }),
      el('option', { value: 'off', textContent: 'Ukryty', selected: d.banner === false }));
    banner.addEventListener('change', async () => {
      const value = banner.value === 'default' ? null : banner.value === 'on';
      const r = await guard(() => api('POST', `/v1/admin/legal/${d.id}/banner`, { banner: value }));
      if (r) toast(r.bannerShown ? 'Baner „wersja robocza” jest widoczny.' : 'Baner „wersja robocza” jest ukryty.');
    });
    return el('div', { class: 'glass card st-card' },
      el('h3', {}, icon('fa-solid fa-file-contract'), ' ', d.name),
      langRow('pl'), langRow('en'),
      el('label', { class: 'st-field' }, el('span', { textContent: 'Baner „Projekt / wersja robocza — do weryfikacji przez prawnika”' }), banner));
  });

  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Dokumenty' })),
    el('p', { class: 'muted', textContent: 'Regulamin, polityka prywatności i regulamin wsparcia, po polsku i po angielsku. Strona pokazuje ostatnią opublikowaną wersję; szkice widzisz tylko tutaj. Każdy zapis zostaje w historii i w dzienniku.' }),
    varsCard,
    el('div', { class: 'st-list lg-docs' }, ...cards));
}

// ---------- the editor ----------

/** A line diff (longest common subsequence): [' ' | '+' | '-', line][]. */
export function lineDiff(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  const n = x.length;
  const m = y.length;
  // too big for the table: everything as removed and added
  if (n * m > 4_000_000) return [...x.map((l) => ['-', l]), ...y.map((l) => ['+', l])];
  const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push([' ', x[i]]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) out.push(['-', x[i++]]);
    else out.push(['+', y[j++]]);
  }
  while (i < n) out.push(['-', x[i++]]);
  while (j < m) out.push(['+', y[j++]]);
  return out;
}

function diffView(diff) {
  if (!diff.some(([k]) => k !== ' ')) return el('p', { class: 'muted', textContent: 'Bez różnic.' });
  // unchanged stretches folded to 2 lines of context around each change
  const keep = diff.map(([k], i) => k !== ' ' || diff.slice(Math.max(0, i - 2), i + 3).some(([c]) => c !== ' '));
  const rows = [];
  let skipped = 0;
  diff.forEach(([k, line], i) => {
    if (!keep[i]) { skipped++; return; }
    if (skipped) rows.push(el('div', { class: 'lg-d skip', textContent: `… ${skipped} bez zmian` }));
    skipped = 0;
    rows.push(el('div', { class: `lg-d ${k === '+' ? 'add' : k === '-' ? 'del' : ''}`, textContent: `${k} ${line}` }));
  });
  if (skipped) rows.push(el('div', { class: 'lg-d skip', textContent: `… ${skipped} bez zmian` }));
  return el('div', { class: 'lg-diff' }, ...rows);
}

const HELP = [
  ['## Tytuł sekcji', 'sekcja (w spisie treści); {#kotwica} na końcu ustawia jej adres'],
  ['### Podtytuł', 'mniejszy nagłówek'],
  ['1. punkt / - punkt', 'lista numerowana / zwykła; 2 spacje wcięcia = lista w punkcie'],
  ['**pogrubienie**, *kursywa*, `kod`', ''],
  ['[tekst](https://…) [tekst](/regulamin)', 'link (http, https, mailto albo adres na stronie)'],
  ['> tekst', 'wyróżniona notka'],
  ['| A | B |\\n|---|---|', 'tabela'],
  ['{{admin.email}}', 'dane administratora'],
  ['[UZUPEŁNIJ: …]', 'miejsce do uzupełnienia (wyróżnione)'],
  ['dwie spacje na końcu linii', 'nowa linia w akapicie'],
];

async function editor(doc, lang) {
  let state = await guard(() => api('GET', `/v1/admin/legal/${doc}/${lang}`));
  if (!state) return;
  const area = el('textarea', { class: 'lg-source', spellcheck: true });
  const preview = el('div', { class: 'legal-body lg-preview' });
  const previewTitle = el('b', { textContent: 'Podgląd' });
  const backToLive = el('button', { class: 'hidden small', onclick: () => livePreview() }, icon('fa-solid fa-eye'), 'Wróć do podglądu');
  const status = el('span', { class: 'muted small' });
  const history = el('div', { class: 'lg-history' });
  const head = el('div', { class: 'page-head' });
  let base = '';
  let timer;

  const dirty = () => area.value !== base;
  const showStatus = () => {
    const pub = state.published;
    const draft = state.draft;
    status.textContent = `${pub ? `Opublikowana: ${fmtDate(pub.publishedAt)}` : 'Nieopublikowany'}${draft ? ` · szkic z ${fmtDate(draft.createdAt)}` : ''}${dirty() ? ' · niezapisane zmiany' : ''}`;
  };
  async function render(body) {
    const r = await api('POST', '/v1/admin/legal/preview', { body }).catch(() => undefined);
    if (r) preview.innerHTML = r.html; // made safe by the server (legal/markdown.ts)
  }
  function livePreview() {
    previewTitle.textContent = 'Podgląd';
    backToLive.classList.add('hidden');
    void render(area.value);
  }
  area.addEventListener('input', () => {
    showStatus();
    clearTimeout(timer);
    timer = setTimeout(livePreview, 350);
  });

  function load(next, body) {
    state = next;
    base = body ?? (state.draft ?? state.published)?.body ?? '';
    area.value = base;
    showStatus();
    livePreview();
    renderHistory();
  }

  const major = el('input', { type: 'checkbox' });
  const note = el('input', { type: 'text', placeholder: 'Krótko: co się zmieniło (pokazywane w historii i w powiadomieniu)', maxLength: 300 });
  const saveDraft = el('button', { onclick: async () => {
    const r = await guard(() => api('POST', `/v1/admin/legal/${doc}/${lang}/draft`, { body: area.value }));
    if (r) { toast('Szkic zapisany. Strona pokazuje dalej opublikowaną wersję.'); load(r); }
  } }, icon('fa-solid fa-floppy-disk'), 'Zapisz jako szkic');
  const publish = el('button', { class: 'primary', onclick: async () => {
    const what = `${state.name} (${LANG_NAMES[lang]})`;
    if (!confirm(`Opublikować ${what}? Strona od razu pokaże ten tekst${major.checked ? ', a zalogowani gracze dostaną powiadomienie o zmianie' : ''}.`)) return;
    const r = await guard(() => api('POST', `/v1/admin/legal/${doc}/${lang}/publish`, { body: area.value, major: major.checked, note: note.value }));
    if (r) {
      toast('Opublikowano. Data „Ostatnia aktualizacja” jest już nowa.');
      major.checked = false;
      note.value = '';
      load(r);
    }
  } }, icon('fa-solid fa-upload'), 'Opublikuj');

  function renderHistory() {
    const pubId = state.published?.id;
    const rows = state.versions.map((v) => {
      const kind = v.publishedAt
        ? el('span', { class: `chip ${v.id === pubId ? 'green' : ''}`, textContent: v.id === pubId ? 'Opublikowana (na stronie)' : 'Opublikowana' })
        : el('span', { class: 'chip gold', textContent: v.restoredFrom ? `Szkic (przywrócona #${v.restoredFrom})` : 'Szkic' });
      const view = el('button', { title: 'Pokaż tę wersję', onclick: async () => {
        const full = await guard(() => api('GET', `/v1/admin/legal/versions/${v.id}`));
        if (!full) return;
        previewTitle.textContent = `Wersja #${v.id} z ${fmtDate(v.createdAt)}`;
        backToLive.classList.remove('hidden');
        await render(full.body);
      } }, icon('fa-solid fa-eye'));
      const compare = el('button', { title: 'Różnice między tą wersją a tekstem w edytorze', onclick: async () => {
        const full = await guard(() => api('GET', `/v1/admin/legal/versions/${v.id}`));
        if (!full) return;
        previewTitle.textContent = `Różnice: #${v.id} → edytor`;
        backToLive.classList.remove('hidden');
        preview.replaceChildren(diffView(lineDiff(full.body, area.value)));
      } }, icon('fa-solid fa-code-compare'));
      const restore = el('button', { title: 'Przywróć jako nowy szkic', onclick: async () => {
        if (dirty() && !confirm('W edytorze są niezapisane zmiany. Przywrócić mimo to?')) return;
        const r = await guard(() => api('POST', `/v1/admin/legal/versions/${v.id}/restore`));
        if (r) { toast(`Wersja #${v.id} przywrócona jako szkic — opublikuj, żeby trafiła na stronę.`); load(r); }
      } }, icon('fa-solid fa-clock-rotate-left'));
      return el('tr', {},
        el('td', { textContent: `#${v.id}` }),
        el('td', { textContent: fmtDate(v.publishedAt || v.createdAt) }),
        el('td', { textContent: v.byHandle ? `@${v.byHandle}` : v.by ? '(usunięte konto)' : 'system' }),
        el('td', {}, kind, v.major ? el('span', { class: 'chip red', textContent: 'istotna' }) : ''),
        el('td', { class: 'hide-sm lg-note', textContent: v.note }),
        el('td', {}, el('div', { class: 'row lg-actions' }, view, compare, restore)));
    });
    history.replaceChildren(el('h3', {}, icon('fa-solid fa-clock-rotate-left'), ' Historia wersji'),
      el('div', { class: 'sup-scroll' }, el('table', {},
        el('thead', {}, el('tr', {}, ...['#', 'Kiedy', 'Kto', 'Stan', 'Opis', ''].map((h, i) => el('th', { class: i === 4 ? 'hide-sm' : '', textContent: h })))),
        el('tbody', {}, ...rows))));
  }

  const back = el('button', { onclick: () => { if (!dirty() || confirm('Porzucić niezapisane zmiany?')) legalPage(); } }, icon('fa-solid fa-arrow-left'), 'Dokumenty');
  const other = lang === 'pl' ? 'en' : 'pl';
  head.append(back, el('h1', { textContent: `${state.name} — ${LANG_NAMES[lang]}` }),
    el('a', { class: 'btn', href: state.path, target: '_blank', rel: 'noopener' }, icon('fa-solid fa-arrow-up-right-from-square'), 'Na stronie'),
    el('button', { onclick: () => { if (!dirty() || confirm('Porzucić niezapisane zmiany?')) editor(doc, other); } }, icon('fa-solid fa-language'), `Wersja: ${LANG_NAMES[other]}`));

  $('#main').replaceChildren(
    head,
    status,
    el('div', { class: 'glass card lg-publish' },
      el('div', { class: 'row' }, saveDraft,
        el('label', { class: 'row small lg-major' }, el('span', { class: 'switch' }, major, el('span')), 'Zmiana istotna (powiadom zalogowanych graczy)')),
      el('div', { class: 'row' }, el('div', { class: 'grow' }, note), publish)),
    el('div', { class: 'lg-editor' },
      el('div', { class: 'glass card lg-pane' }, el('div', { class: 'row lg-pane-head' }, el('b', { textContent: 'Tekst (Markdown)' })), area,
        el('details', { class: 'lg-help' }, el('summary', { textContent: 'Składnia' }),
          el('table', {}, el('tbody', {}, ...HELP.map(([a, b]) => el('tr', {}, el('td', {}, el('code', { textContent: a.replace('\\n', '\n') })), el('td', { class: 'muted small', textContent: b }))))))),
      el('div', { class: 'glass card lg-pane' }, el('div', { class: 'row lg-pane-head' }, previewTitle, backToLive), preview)),
    el('div', { class: 'glass card' }, history));
  load(state);
  window.addEventListener('beforeunload', (e) => { if ($('.lg-source') === area && dirty()) e.preventDefault(); });
}
