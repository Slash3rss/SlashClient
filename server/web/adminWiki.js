// The admin panel's "Wiki": the pages of the SlashClient wiki (/wiki), Polish and English. The list
// shows every page by its part, with each language's state and whether it still follows the text in
// the code. A page is edited as Markdown with its details (part, order, icon, description) above it
// and a live preview (rendered by the server, exactly as the site shows it); it is saved as a draft
// or published, and every version stays in the history to view, compare and restore. Pictures are
// uploaded here and put into the text with the picker.
import { $, ApiError, api, confirmModal, el, fmtDate, guard, icon, promptModal, toast, token, watchUnsaved } from './common.js';
import { diffView, lineDiff } from './adminLegal.js';

const DISCARD = { title: 'Porzucić niezapisane zmiany?', text: 'Zmiany z edytora przepadną.', ok: 'Porzuć', danger: true };
const LANG_NAMES = { pl: 'polski', en: 'angielski' };
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`);

/** A page's text from its parts, in the same form as the seed files (src/wiki/format.ts composePage). */
function compose(meta, title, content) {
  const one = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/-->/g, '—>').trim();
  return `<!-- dzial: ${one(meta.section)} | kolejnosc: ${meta.order} | ikona: ${one(meta.icon)} | opis: ${one(meta.description)} -->\n# ${one(title)}\n\n${content.replace(/^\n+/, '')}`;
}

/** The parts of a page's text (the same reading as src/wiki/format.ts parsePage). */
function parse(body) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const meta = { section: 'inne', order: 1000, icon: 'fa-file-lines', description: '' };
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const comment = /^\s*<!--([\s\S]*?)-->\s*$/.exec(lines[i] ?? '');
  if (comment) {
    const keys = { dzial: 'section', kolejnosc: 'order', ikona: 'icon', opis: 'description' };
    for (const part of comment[1].split(/\|(?=\s*(?:dzial|kolejnosc|ikona|opis)\s*:)/)) {
      const m = /^\s*(\w+)\s*:\s*([\s\S]*?)\s*$/.exec(part);
      const key = m && keys[m[1]];
      if (!key) continue;
      meta[key] = key === 'order' ? (Number.isFinite(Number(m[2])) && m[2] !== '' ? Math.round(Number(m[2])) : 1000) : m[2];
    }
    i++;
  }
  while (i < lines.length && !lines[i].trim()) i++;
  let title = '';
  const h1 = /^#\s+(.+?)\s*$/.exec(lines[i] ?? '');
  if (h1) { title = h1[1]; i++; }
  return { meta, title, content: lines.slice(i).join('\n').replace(/^\n+/, '') };
}

const stateChip = (s) => {
  if (!s.publishedAt && !s.draftAt) return el('span', { class: 'chip', textContent: 'brak' });
  const chips = [s.publishedAt ? el('span', { class: 'chip green', textContent: 'opublikowana' }) : el('span', { class: 'chip', textContent: 'nieopublikowana' })];
  if (s.draftAt > s.publishedAt) chips.push(el('span', { class: 'chip gold', textContent: 'szkic' }));
  if (s.seedNewer) chips.push(el('span', { class: 'chip sky', title: 'Kod ma nowszy tekst tej strony niż ten, który widać na stronie.', textContent: 'nowsza w kodzie' }));
  return el('span', { class: 'wk-chips' }, ...chips);
};

export async function wikiPage() {
  const res = await guard(() => api('GET', '/v1/admin/wiki'));
  if (!res) return;
  const sections = [...res.sections, { id: 'inne', pl: 'Inne', icon: 'fa-folder' }];

  // ---- a new page ----
  const slug = el('input', { type: 'text', placeholder: 'adres, np. launcher-profile', maxLength: 64, autocomplete: 'off' });
  const titlePl = el('input', { type: 'text', placeholder: 'Tytuł po polsku', maxLength: 200 });
  const titleEn = el('input', { type: 'text', placeholder: 'Tytuł po angielsku', maxLength: 200 });
  const section = el('select', {}, ...sections.map((s) => el('option', { value: s.id, textContent: s.pl })));
  const create = el('button', { class: 'primary', onclick: async () => {
    if (!SLUG.test(slug.value.trim())) return toast('Adres: małe litery, cyfry i myślniki, np. launcher-profile.', true);
    if (!titlePl.value.trim()) return toast('Wpisz polski tytuł.', true);
    const r = await guard(() => api('POST', '/v1/admin/wiki/pages', { slug: slug.value.trim(), section: section.value, title: titlePl.value, titleEn: titleEn.value }));
    if (r) { toast('Strona utworzona jako szkic. Uzupełnij treść i opublikuj.'); editor(r.slug); }
  } }, icon('fa-solid fa-plus'), 'Utwórz');
  const newCard = el('div', { class: 'glass card wk-new' },
    el('h3', {}, icon('fa-solid fa-file-circle-plus'), ' Nowa strona'),
    el('div', { class: 'wk-new-grid' }, slug, section, titlePl, titleEn, create),
    el('p', { class: 'muted small', textContent: 'Adres zaczynaj od działu (launcher-…, hud-…, kosmetyki-…). Strona powstaje jako szkic w obu językach i pojawi się na stronie po opublikowaniu.' }));

  // ---- the pages by part ----
  const groups = sections.map((s) => {
    const pages = res.pages.filter((p) => (s.id === 'inne' ? !res.sections.some((x) => x.id === p.section) : p.section === s.id)).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    if (!pages.length) return null;
    return el('div', { class: 'glass card wk-group' },
      el('h3', {}, icon(`fa-solid ${s.icon}`), ` ${s.pl} `, el('span', { class: 'muted small', textContent: `${pages.length}` })),
      el('div', { class: 'sup-scroll' }, el('table', { class: 'wk-table' },
        el('thead', {}, el('tr', {}, ...['', 'Strona', 'PL', 'EN', ''].map((h) => el('th', { textContent: h })))),
        el('tbody', {}, ...pages.map((p) => el('tr', {},
          el('td', { class: 'wk-icon' }, icon(`fa-solid ${p.icon}`)),
          el('td', {}, el('b', { textContent: p.title }), el('div', { class: 'muted small' }, el('code', { textContent: p.slug }), ` · kolejność ${p.order}`,
            p.langs.pl.seed ? (p.langs.pl.follows && p.langs.en.follows ? ' · z kodu' : ' · zmieniona w panelu') : '')),
          el('td', {}, stateChip(p.langs.pl)),
          el('td', {}, stateChip(p.langs.en)),
          el('td', {}, el('div', { class: 'row wk-actions' },
            el('a', { class: 'btn', href: `/wiki/${p.slug}`, target: '_blank', rel: 'noopener', title: 'Otwórz na stronie' }, icon('fa-solid fa-arrow-up-right-from-square')),
            el('button', { class: 'primary', onclick: () => editor(p.slug) }, icon('fa-solid fa-pen'), 'Edytuj')))))))));
  }).filter(Boolean);

  const deleted = res.deleted.length ? el('details', { class: 'glass card wk-deleted' },
    el('summary', {}, icon('fa-solid fa-trash-can-arrow-up'), ` Usunięte strony (${res.deleted.length})`),
    ...res.deleted.map((d) => el('div', { class: 'row' }, el('code', { class: 'grow', textContent: d.slug }), el('span', { class: 'muted small', textContent: fmtDate(d.at) }),
      el('button', { onclick: async () => {
        const r = await guard(() => api('POST', `/v1/admin/wiki/pages/${d.slug}/undelete`));
        if (r) { toast('Strona przywrócona razem z historią.'); wikiPage(); }
      } }, icon('fa-solid fa-rotate-left'), 'Przywróć')))) : '';

  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Wiki' }),
      el('a', { class: 'btn', href: '/wiki', target: '_blank', rel: 'noopener' }, icon('fa-solid fa-book-open'), 'Otwórz wiki')),
    el('p', { class: 'muted', textContent: 'Strony wiki po polsku i po angielsku. Strona pokazuje ostatnią opublikowaną wersję. Strony z kodu, których nikt nie zmieniał, aktualizują się same po wdrożeniu nowej wersji serwera; zmieniona w panelu zostaje taka, jak ją zapisano, aż przywrócisz wersję z kodu. Wiki włącza się i wyłącza w Ustawienia → Funkcje.' }),
    newCard,
    el('div', { class: 'st-list wk-groups' }, ...groups),
    deleted);
}

// ---------- pictures ----------

async function upload(file, max) {
  if (file.size > max) throw new ApiError('too_large', 413);
  const headers = { 'Content-Type': file.type || 'application/octet-stream' };
  if (token.get()) headers.Authorization = `Bearer ${token.get()}`;
  const res = await fetch(`/v1/admin/wiki/images?name=${encodeURIComponent(file.name)}`, { method: 'PUT', headers, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'server_error', res.status);
  return data;
}

/** The picture picker: the pictures (the code's and uploaded ones) to click, and an upload button; `insert` gets a name. */
function picker(insert) {
  const grid = el('div', { class: 'wk-pics' });
  const filter = el('input', { type: 'search', placeholder: 'Szukaj obrazka…' });
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'hidden' });
  let all = [];
  let max = 0;
  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    const shown = all.filter((i) => !q || i.name.includes(q));
    grid.replaceChildren(...(shown.length ? shown.map((i) => el('button', { type: 'button', class: 'wk-pic', title: `${i.name} (${kb(i.size)}${i.source === 'seed' ? ', z kodu' : ''})`, onclick: () => insert(i.name) },
      el('img', { src: `/wiki/img/${i.name}`, alt: '', loading: 'lazy' }), el('span', { textContent: i.name }))) : [el('p', { class: 'muted small', textContent: 'Brak obrazków.' })]));
  };
  const load = async () => {
    const r = await guard(() => api('GET', '/v1/admin/wiki/images'));
    if (!r) return;
    all = r.images;
    max = r.maxImage;
    hint.textContent = `PNG, JPEG albo WebP, najwyżej ${kb(max)} (Ustawienia → Wiki). Zrzuty najlepiej jako WebP, do ok. 120 kB.`;
    draw();
  };
  const hint = el('p', { class: 'muted small' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    const r = await guard(() => upload(f, max));
    if (!r) return;
    toast(`Wgrano ${r.name}.`);
    await load();
    insert(r.name);
  });
  filter.addEventListener('input', draw);
  const box = el('div', { class: 'wk-picker hidden' },
    el('div', { class: 'row' }, el('div', { class: 'grow' }, filter), el('button', { type: 'button', onclick: () => file.click() }, icon('fa-solid fa-upload'), 'Wgraj obrazek'), file),
    hint, grid);
  let loaded = false;
  return {
    box,
    toggle() {
      box.classList.toggle('hidden');
      if (!loaded && !box.classList.contains('hidden')) { loaded = true; void load(); }
    },
  };
}

// ---------- the editor ----------

const HELP = [
  ['## Sekcja', 'sekcja (w spisie treści po prawej)'],
  ['### Podsekcja', 'mniejszy nagłówek'],
  ['- punkt / 1. punkt', 'lista; 2 spacje wcięcia = lista w punkcie'],
  ['**pogrubienie**, *kursywa*, `kod`', ''],
  ['[tekst](/wiki/hud-mapa)', 'link do innej strony wiki (po angielsku sam prowadzi do /en/wiki/…)'],
  ['[tekst](https://…)', 'link do innej strony internetowej'],
  ['![Podpis](nazwa.webp)', 'obrazek w osobnej linii; podpis jest pod obrazkiem'],
  ['> wskazówka', 'wyróżniona notka'],
  ['| A | B |\\n|---|---|', 'tabela'],
];

async function editor(slug) {
  let state = await guard(() => api('GET', `/v1/admin/wiki/pages/${slug}`));
  if (!state) return;
  const index = await guard(() => api('GET', '/v1/admin/wiki'));
  const sections = [...(index?.sections ?? []), { id: 'inne', pl: 'Inne' }];
  let lang = 'pl';
  /** Each language's text in the editor (kept when switching tabs) and what was last saved. */
  const work = {};
  const base = {};

  // ---- the details shared by both languages, and each language's own ----
  const sectionSel = el('select', {}, ...sections.map((s) => el('option', { value: s.id, textContent: s.pl })));
  const order = el('input', { type: 'number', min: -100000, max: 100000, step: 1 });
  const iconIn = el('input', { type: 'text', maxLength: 60, placeholder: 'fa-map' });
  const iconPreview = el('span', { class: 'hm-icon-preview' });
  const title = el('input', { type: 'text', maxLength: 200 });
  const desc = el('input', { type: 'text', maxLength: 300 });
  const area = el('textarea', { class: 'lg-source', spellcheck: true });
  const preview = el('div', { class: 'legal-body wiki-body lg-preview' });
  const previewTitle = el('b', { class: 'grow', textContent: 'Podgląd' });
  const backToLive = el('button', { class: 'hidden small', onclick: () => livePreview() }, icon('fa-solid fa-eye'), 'Wróć do podglądu');
  const status = el('div', { class: 'wk-status' });
  const seedBox = el('div', { class: 'wk-seed' });
  const history = el('div', { class: 'lg-history' });
  const tabs = el('div', { class: 'segmented wk-tabs' });
  const note = el('input', { type: 'text', placeholder: 'Krótko: co się zmieniło (pokazywane w historii)', maxLength: 300 });
  let timer;

  const shared = () => ({ section: sectionSel.value, order: Number(order.value) || 0, icon: iconIn.value.trim() || 'fa-file-lines' });
  const textOf = (l) => compose({ ...shared(), description: work[l].description }, work[l].title, work[l].content);
  const dirty = (l) => textOf(l) !== base[l];
  const anyDirty = () => ['pl', 'en'].some((l) => dirty(l));

  /** The language's text as last saved (draft, else published), or a fresh one. */
  function loadLang(l, body) {
    const s = state.langs[l];
    const text = body ?? (s.draft ?? s.published)?.body ?? compose(shared(), '', '');
    base[l] = text.replace(/\r\n?/g, '\n');
    const p = parse(base[l]);
    work[l] = { title: p.title, description: p.meta.description, content: p.content, meta: p.meta };
  }
  function fill() {
    const w = work[lang];
    title.value = w.title;
    desc.value = w.description;
    area.value = w.content;
    showStatus();
    livePreview();
    renderHistory();
    renderSeed();
  }
  const read = () => {
    work[lang].title = title.value;
    work[lang].description = desc.value;
    work[lang].content = area.value;
  };
  function showStatus() {
    const s = state.langs[lang];
    const pub = s.published;
    const draft = s.draft;
    const other = lang === 'pl' ? 'en' : 'pl';
    status.replaceChildren(
      el('span', { class: 'muted small', textContent: `${pub ? `Opublikowana: ${fmtDate(pub.publishedAt)}` : 'Nieopublikowana'}${draft ? ` · szkic z ${fmtDate(draft.createdAt)}` : ''}` }),
      dirty(lang) ? el('span', { class: 'chip gold', textContent: 'niezapisane zmiany' }) : '',
      dirty(other) ? el('span', { class: 'chip gold', textContent: `niezapisane zmiany: ${LANG_NAMES[other]}` }) : '');
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('dirty', dirty(b.dataset.lang)));
  }

  async function render(body) {
    const r = await api('POST', '/v1/admin/wiki/preview', { body, lang }).catch(() => undefined);
    if (!r) return;
    const head = el('div', { class: 'wk-preview-head' }, el('h1', {}, icon(`fa-solid ${r.meta.icon}`), ' ', r.title || '(bez tytułu)'), r.meta.description ? el('p', { class: 'muted', textContent: r.meta.description }) : '');
    const content = el('div');
    content.innerHTML = r.html; // made safe by the server (legal/markdown.ts escapes everything typed)
    preview.replaceChildren(head, content);
  }
  function livePreview() {
    previewTitle.textContent = 'Podgląd';
    backToLive.classList.add('hidden');
    void render(textOf(lang));
  }
  const changed = () => {
    read();
    showStatus();
    clearTimeout(timer);
    timer = setTimeout(livePreview, 350);
  };
  for (const input of [title, desc, area]) input.addEventListener('input', changed);
  // the shared details: both languages' texts take them (the other language then has unsaved changes too)
  for (const input of [sectionSel, order, iconIn]) input.addEventListener('input', () => {
    iconPreview.replaceChildren(icon(`fa-solid ${iconIn.value.trim()}`));
    changed();
  });

  function load(next, keepOther = true) {
    // what the other language had in the editor stays, unless it was saved meanwhile
    const kept = keepOther && work.pl ? { ...work } : undefined;
    state = next;
    for (const l of ['pl', 'en']) {
      const unsaved = kept && kept[l] && textOf(l) !== base[l];
      if (unsaved && l !== lang) continue;
      loadLang(l);
    }
    applyShared(work[lang].meta);
    fill();
  }
  function applyShared(m) {
    sectionSel.value = sections.some((s) => s.id === m.section) ? m.section : 'inne';
    order.value = String(m.order);
    iconIn.value = m.icon;
    iconPreview.replaceChildren(icon(`fa-solid ${m.icon}`));
  }

  const save = (publish) => async () => {
    read();
    const body = textOf(lang);
    if (publish) {
      const s = state.langs[lang];
      const diff = lineDiff((s.published?.body ?? '').replace(/\r\n?/g, '\n'), body);
      const added = diff.filter(([k]) => k === '+').length;
      const removed = diff.filter(([k]) => k === '-').length;
      if (!await confirmModal({
        title: `Opublikować „${work[lang].title}” (${LANG_NAMES[lang]})?`, text: 'Strona i launcher od razu pokażą ten tekst.', icon: 'fa-solid fa-upload',
        list: [s.published ? (added || removed ? `Względem opublikowanej: +${added} / −${removed} linii` : 'Tekst jak w opublikowanej wersji.') : 'Pierwsza publikacja w tym języku.',
          s.seed.exists ? 'Po publikacji strona przestaje się aktualizować z kodu (do przywrócenia wersji z kodu).' : '',
          note.value.trim() ? `Notatka: „${note.value.trim()}”` : 'Bez notatki.'].filter(Boolean),
        ok: 'Opublikuj', okIcon: 'fa-solid fa-upload',
      })) return;
    }
    const r = await guard(() => api('POST', `/v1/admin/wiki/pages/${state.slug}/${lang}/${publish ? 'publish' : 'draft'}`, { body, note: note.value }));
    if (!r) return;
    toast(publish ? 'Opublikowano.' : 'Szkic zapisany. Strona pokazuje dalej opublikowaną wersję.');
    if (publish) note.value = '';
    base[lang] = body;
    load(r);
  };

  function renderSeed() {
    const s = state.langs[lang].seed;
    if (!s.exists) { seedBox.replaceChildren(); return; }
    const parts = [s.follows
      ? el('span', { class: 'chip green', title: 'Nikt nie zmieniał tej strony w panelu: po wdrożeniu nowej wersji serwera pokaże nowy tekst z kodu.' }, icon('fa-solid fa-code'), 'Aktualizuje się z kodu')
      : el('span', { class: 'chip', title: 'Strona zapisana w panelu: nowe teksty z kodu jej nie zmieniają.' }, icon('fa-solid fa-pen'), 'Zmieniona w panelu')];
    if (!s.follows && s.differs) {
      parts.push(s.newer ? el('span', { class: 'chip sky', textContent: 'W kodzie jest nowsza wersja' }) : el('span', { class: 'chip', textContent: 'Kod ma inny tekst' }),
        el('button', { class: 'small', title: 'Tylko do edytora: przejrzyj, porównaj i opublikuj sam(a).', onclick: async () => {
          const r = await guard(() => api('GET', `/v1/admin/wiki/pages/${state.slug}/${lang}/seed`));
          if (!r) return;
          if (dirty(lang) && !await confirmModal(DISCARD)) return;
          const p = parse(r.body);
          work[lang] = { title: p.title, description: p.meta.description, content: p.content, meta: p.meta };
          applyShared(p.meta);
          fill();
          toast('Wczytano tekst z kodu do edytora. Przejrzyj podgląd i opublikuj.');
        } }, icon('fa-solid fa-file-import'), 'Wczytaj do edytora'),
        el('button', { class: 'small', title: 'Publikuje tekst z kodu; strona znów będzie się sama aktualizować po wdrożeniach.', onclick: async () => {
          if (!await confirmModal({ title: 'Przywrócić wersję z kodu?', text: `Strona (${LANG_NAMES[lang]}) od razu pokaże tekst z kodu i znów będzie się aktualizować po wdrożeniach. Obecny tekst zostaje w historii.`, ok: 'Przywróć z kodu', okIcon: 'fa-solid fa-code', danger: dirty(lang) })) return;
          const r = await guard(() => api('POST', `/v1/admin/wiki/pages/${state.slug}/${lang}/seed`));
          if (r) { toast('Przywrócono wersję z kodu.'); loadLang(lang, r.langs[lang].published.body); load(r); }
        } }, icon('fa-solid fa-code'), 'Przywróć wersję z kodu'));
    }
    seedBox.replaceChildren(...parts);
  }

  function renderHistory() {
    const s = state.langs[lang];
    const pubId = s.published?.id;
    const rows = s.versions.map((v) => {
      const kind = v.publishedAt
        ? el('span', { class: `chip ${v.id === pubId ? 'green' : ''}`, textContent: v.id === pubId ? 'Opublikowana (na stronie)' : 'Opublikowana' })
        : el('span', { class: 'chip gold', textContent: v.restoredFrom ? `Szkic (przywrócona #${v.restoredFrom})` : 'Szkic' });
      const view = el('button', { title: 'Pokaż tę wersję', onclick: async () => {
        const full = await guard(() => api('GET', `/v1/admin/wiki/versions/${v.id}`));
        if (!full) return;
        previewTitle.textContent = `Wersja #${v.id} z ${fmtDate(v.createdAt)}`;
        backToLive.classList.remove('hidden');
        await render(full.body);
      } }, icon('fa-solid fa-eye'));
      const compare = el('button', { title: 'Różnice między tą wersją a tekstem w edytorze', onclick: async () => {
        const full = await guard(() => api('GET', `/v1/admin/wiki/versions/${v.id}`));
        if (!full) return;
        previewTitle.textContent = `Różnice: #${v.id} → edytor`;
        backToLive.classList.remove('hidden');
        preview.replaceChildren(diffView(lineDiff(full.body.replace(/\r\n?/g, '\n'), textOf(lang))));
      } }, icon('fa-solid fa-code-compare'));
      const restore = el('button', { title: 'Przywróć jako nowy szkic', onclick: async () => {
        if (dirty(lang) && !await confirmModal({ title: `Przywrócić wersję #${v.id}?`, text: 'W edytorze są niezapisane zmiany. Przepadną, a ta wersja wróci jako nowy szkic.', ok: 'Przywróć', okIcon: 'fa-solid fa-clock-rotate-left', danger: true })) return;
        const r = await guard(() => api('POST', `/v1/admin/wiki/versions/${v.id}/restore`));
        if (r) { toast(`Wersja #${v.id} przywrócona jako szkic — opublikuj, żeby trafiła na stronę.`); loadLang(lang, r.langs[lang].draft?.body); load(r); }
      } }, icon('fa-solid fa-clock-rotate-left'));
      return el('tr', {},
        el('td', { textContent: `#${v.id}` }),
        el('td', { textContent: fmtDate(v.publishedAt || v.createdAt) }),
        el('td', { textContent: v.byHandle ? `@${v.byHandle}` : v.by ? '(usunięte konto)' : 'z kodu' }),
        el('td', {}, kind, v.seedHash ? el('span', { class: 'chip sky', textContent: 'z kodu' }) : ''),
        el('td', { class: 'hide-sm lg-note', textContent: v.note }),
        el('td', {}, el('div', { class: 'row lg-actions' }, view, compare, restore)));
    });
    history.replaceChildren(el('h3', {}, icon('fa-solid fa-clock-rotate-left'), ` Historia wersji (${LANG_NAMES[lang]})`),
      el('div', { class: 'sup-scroll' }, el('table', {},
        el('thead', {}, el('tr', {}, ...['#', 'Kiedy', 'Kto', 'Stan', 'Opis', ''].map((h, i) => el('th', { class: i === 4 ? 'hide-sm' : '', textContent: h })))),
        el('tbody', {}, ...rows))));
  }

  // the language tabs: what was typed in the other one stays
  for (const l of ['pl', 'en']) {
    tabs.append(el('button', { type: 'button', dataset: { lang: l }, class: l === lang ? 'active' : '', onclick: () => {
      read();
      lang = l;
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.lang === l));
      fill();
    } }, el('b', { textContent: l.toUpperCase() }), ` ${LANG_NAMES[l]}`));
  }

  // pictures: put on their own line where the cursor is
  const pics = picker((name) => {
    const at = area.selectionStart ?? area.value.length;
    const before = area.value.slice(0, at);
    const after = area.value.slice(at);
    const line = `![Opis obrazka](${name})`;
    const text = `${before && !before.endsWith('\n') ? '\n' : ''}${before && !before.endsWith('\n\n') ? '\n' : ''}${line}\n${after.startsWith('\n') ? '' : '\n'}`;
    area.value = before + text + after;
    const start = before.length + text.indexOf('Opis obrazka');
    area.focus();
    area.setSelectionRange(start, start + 'Opis obrazka'.length);
    changed();
  });

  const rename = el('button', { onclick: async () => {
    if (anyDirty() && !await confirmModal(DISCARD)) return;
    const to = await promptModal({ title: 'Nowy adres strony', text: 'Stary adres będzie przekierowywał na nowy. Linki w innych stronach wiki zmień ręcznie.', label: 'Adres', value: state.slug, required: true, maxLength: 64, ok: 'Zmień adres' });
    if (to === null || to.trim() === state.slug) return;
    if (!SLUG.test(to.trim())) return toast('Adres: małe litery, cyfry i myślniki.', true);
    const r = await guard(() => api('POST', `/v1/admin/wiki/pages/${state.slug}/rename`, { to: to.trim() }));
    if (r) { toast(`Nowy adres: /wiki/${r.slug}`); editor(r.slug); }
  } }, icon('fa-solid fa-i-cursor'), 'Zmień adres');
  const remove = el('button', { class: 'danger', onclick: async () => {
    if (!await confirmModal({ title: `Usunąć stronę „${work.pl.title}”?`, text: 'Zniknie ze strony, z launchera i z listy w obu językach. Historia zostaje: stronę można przywrócić z listy „Usunięte strony”.', ok: 'Usuń', okIcon: 'fa-solid fa-trash', danger: true, icon: 'fa-solid fa-trash' })) return;
    if (await guard(() => api('DELETE', `/v1/admin/wiki/pages/${state.slug}`))) { toast('Strona usunięta.'); wikiPage(); }
  } }, icon('fa-solid fa-trash'), 'Usuń');
  const back = el('button', { onclick: async () => { if (!anyDirty() || await confirmModal(DISCARD)) wikiPage(); } }, icon('fa-solid fa-arrow-left'), 'Wiki');
  const open = el('a', { class: 'btn', target: '_blank', rel: 'noopener', onclick: (e) => { e.currentTarget.href = state.langs[lang].path; } }, icon('fa-solid fa-arrow-up-right-from-square'), 'Na stronie');
  const field = (label, input, cls = '') => el('label', { class: `hm-field ${cls}` }, el('span', { class: 'hm-label', textContent: label }), input);

  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, back, el('h1', { textContent: `Wiki: ${state.slug}` }), open, rename, remove),
    el('div', { class: 'glass card wk-meta' },
      el('div', { class: 'wk-meta-grid' },
        field('Dział', sectionSel), field('Kolejność w dziale', order),
        field('Ikona (Font Awesome)', el('div', { class: 'row hm-icon-row' }, iconPreview, iconIn))),
      el('p', { class: 'muted small', textContent: 'Dział, kolejność i ikona są wspólne dla obu języków (zapisz oba). Tytuł, opis i treść każdy język ma swoje.' })),
    el('div', { class: 'row wk-langbar' }, tabs, status, seedBox),
    el('div', { class: 'glass card lg-publish' },
      el('div', { class: 'wk-meta-grid two' }, field('Tytuł', title), field('Opis (na liście stron i w wynikach wyszukiwania)', desc)),
      el('div', { class: 'row' }, el('button', { onclick: save(false) }, icon('fa-solid fa-floppy-disk'), 'Zapisz jako szkic'), el('div', { class: 'grow' }, note),
        el('button', { class: 'primary', onclick: save(true) }, icon('fa-solid fa-upload'), 'Opublikuj'))),
    el('div', { class: 'lg-editor' },
      el('div', { class: 'glass card lg-pane' },
        el('div', { class: 'row lg-pane-head' }, el('b', { class: 'grow', textContent: 'Treść (Markdown)' }),
          el('button', { class: 'small', onclick: () => pics.toggle() }, icon('fa-solid fa-image'), 'Obrazki')),
        pics.box, area,
        el('details', { class: 'lg-help' }, el('summary', { textContent: 'Składnia' }),
          el('table', {}, el('tbody', {}, ...HELP.map(([a, b]) => el('tr', {}, el('td', {}, el('code', { textContent: a.replace('\\n', '\n') })), el('td', { class: 'muted small', textContent: b }))))))),
      el('div', { class: 'glass card lg-pane' }, el('div', { class: 'row lg-pane-head' }, previewTitle, backToLive), preview)),
    el('div', { class: 'glass card' }, history));
  load(state, false);
  window.addEventListener('beforeunload', (e) => { if ($('.lg-source') === area && anyDirty()) e.preventDefault(); });
  watchUnsaved(area, anyDirty);
}
