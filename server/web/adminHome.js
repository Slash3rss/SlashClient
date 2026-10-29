// The admin panel's "Strona główna": everything the home page says, Polish (/) and English (/en),
// edited section by section in a form made from the server's schema (src/home/content.ts): texts,
// links, icons, pictures, and lists (features, FAQ, modules, blocks) to add, remove and reorder.
// A live preview shows the page as it would be; changes are saved as a draft or published, every
// version stays in the history to restore, and each section can go back to its defaults.
import { $, ApiError, api, confirmModal, el, errorText, fmtDate, guard, icon, toast, token, watchUnsaved } from './common.js';

/** The question before leaving the editor's changes behind. */
const DISCARD = { title: 'Porzucić niezapisane zmiany?', text: 'Zmiany z edytora przepadną.', ok: 'Porzuć', danger: true };

const LANG_NAMES = { pl: 'polski', en: 'angielski' };
const REASONS = {
  too_long: 'tekst jest za długi', empty: 'to pole nie może być puste', bad_link: 'adres musi zaczynać się od #, / albo https://',
  bad_image: 'obrazek: adres na stronie (/…) albo https://…', bad_icon: 'nie ma takiej ikony', duplicate: 'ta kotwica już jest w innym bloku',
  bad_anchor: 'kotwica: małe litery, cyfry i myślniki, inna niż części strony (np. faq, pobierz)', one_cosmetics: 'blok „Kosmetyki” może być tylko jeden',
  too_many: 'za dużo pozycji', type: 'zła wartość', choice: 'zła wartość',
};

let meta;
let lang = 'pl';

export async function homePage() {
  meta = await guard(() => api('GET', '/v1/admin/home'));
  if (meta) await editor();
}

const clone = (v) => structuredClone(v);
/** A new list item: empty texts, the first choice, a star for a required icon. */
function blank(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, f]) => [k,
    f.t === 'bool' ? false : f.t === 'list' || f.t === 'strings' ? [] : f.t === 'choice' ? f.options[0][0] : f.t === 'icon' && f.req ? 'fa-solid fa-star' : '']));
}
/** Where a field's place ("faq.items.3.a") is in the schema, for the error's words. */
function describe(path) {
  const [sid, ...rest] = path.split('.');
  const s = meta.sections.find((x) => x.id === sid);
  if (!s) return path;
  const words = [s.name];
  let fields = s.fields;
  for (let i = 0; i < rest.length; i++) {
    const f = fields?.[rest[i]];
    if (!f) break;
    words.push(f.label);
    if (f.t === 'list' && /^\d+$/.test(rest[i + 1] ?? '')) {
      words.push(`#${Number(rest[++i]) + 1}`);
      fields = f.item;
    } else fields = undefined;
  }
  return words.join(' → ');
}

async function upload(file) {
  if (file.size > meta.maxImage) throw new ApiError('too_large', 413);
  const headers = { 'Content-Type': file.type || 'application/octet-stream' };
  if (token.get()) headers.Authorization = `Bearer ${token.get()}`;
  const res = await fetch('/v1/admin/home/images', { method: 'PUT', headers, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'server_error', res.status);
  return data.url;
}

async function editor() {
  let state = await guard(() => api('GET', `/v1/admin/home/${lang}`));
  if (!state) return;
  let content = clone(state.content);
  let base = JSON.stringify(content);
  const dirty = () => JSON.stringify(content) !== base;

  const status = el('span', { class: 'muted small' });
  const showStatus = () => {
    const pub = state.published;
    status.textContent = `${pub ? `Opublikowana: ${fmtDate(pub.publishedAt)}${pub.byHandle ? ` (@${pub.byHandle})` : ''}` : 'Strona pokazuje treść domyślną'}${state.draft ? ` · szkic z ${fmtDate(state.draft.createdAt)}` : ''}${dirty() ? ' · niezapisane zmiany' : ''}`;
  };

  // ---- the preview: the whole page as the server would make it, scaled into the pane ----
  // sandboxed without scripts: the editor's content cannot run anything with the admin's session; same origin
  // only so the preview keeps its scroll position (nothing in it can use that without scripts)
  const frame = el('iframe', { class: 'hm-frame', title: 'Podgląd strony głównej', sandbox: 'allow-same-origin' });
  const frameBox = el('div', { class: 'hm-frame-box' }, frame);
  const previewNote = el('span', { class: 'muted small' });
  const fit = () => {
    const w = frameBox.clientWidth;
    if (!w) return;
    const scale = Math.min(1, w / 1280);
    frame.style.transform = `scale(${scale})`;
    frame.style.height = `${Math.round(frameBox.clientHeight / scale)}px`;
  };
  new ResizeObserver(fit).observe(frameBox);
  let previewTimer;
  async function preview() {
    clearTimeout(previewTimer);
    try {
      const r = await api('POST', `/v1/admin/home/${lang}/preview`, { content });
      const y = frame.contentWindow?.scrollY ?? 0;
      frame.onload = () => { try { frame.contentWindow.scrollTo(0, y); } catch { /* not ready */ } };
      frame.srcdoc = r.html;
      previewNote.textContent = dirty() ? 'niezapisane zmiany' : '';
      previewNote.classList.remove('hm-bad-note');
    } catch (err) {
      previewNote.textContent = err.code?.startsWith('bad_content:') ? `Błąd: ${explain(err.code)}` : errorText(err);
      previewNote.classList.add('hm-bad-note');
    }
  }
  const changed = () => {
    showStatus();
    for (const id of Object.keys(chips)) markChip(id);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(preview, 700);
  };

  // ---- errors from the server point at their field ----
  function explain(code) {
    const [, path = '', reason = ''] = code.split(':');
    return `${describe(path)}: ${REASONS[reason] ?? reason}`;
  }
  function markError(code) {
    const [, path = ''] = code.split(':');
    for (const b of document.querySelectorAll('.hm-field.bad')) b.classList.remove('bad');
    // the field itself, else the nearest list or section around it
    const parts = path.split('.');
    let target;
    while (parts.length && !target) {
      target = document.querySelector(`[data-path="${CSS.escape(parts.join('.'))}"]`);
      parts.pop();
    }
    if (!target) return;
    target.classList.add('bad');
    for (let d = target.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function send(what, body) {
    try {
      return await api('POST', `/v1/admin/home/${lang}/${what}`, body);
    } catch (err) {
      if (err.code?.startsWith('bad_content:')) {
        markError(err.code);
        toast(explain(err.code), true);
      } else toast(errorText(err), true);
      return undefined;
    }
  }

  // ---- one field ----
  function fieldEl(f, obj, key, path) {
    const box = el('div', { class: `hm-field hm-${f.t}`, dataset: { path } });
    const label = el('span', { class: 'hm-label' }, f.label, f.req ? el('b', { class: 'hm-req', textContent: ' *' }) : '');
    const hint = f.hint ? el('small', { class: 'muted', textContent: f.hint }) : '';
    const touched = () => {
      box.classList.remove('bad');
      changed();
    };
    switch (f.t) {
      case 'text': {
        const input = f.lines ? el('textarea', { rows: f.lines, maxLength: f.max }) : el('input', { type: 'text', maxLength: f.max });
        input.value = obj[key] ?? '';
        const count = el('small', { class: 'hm-count muted' });
        const counted = () => { count.textContent = `${input.value.length}/${f.max}`; };
        counted();
        input.addEventListener('input', () => { obj[key] = input.value; counted(); touched(); });
        box.append(el('div', { class: 'row hm-label-row' }, label, count), input, hint);
        return box;
      }
      case 'link':
      case 'anchor': {
        const input = el('input', { type: 'text', maxLength: 300, placeholder: f.t === 'link' ? '#sekcja, /adres albo https://…' : 'np. hud' });
        input.value = obj[key] ?? '';
        input.addEventListener('input', () => { obj[key] = input.value.trim(); touched(); });
        box.append(label, input, hint);
        return box;
      }
      case 'icon': {
        const input = el('input', { type: 'text', maxLength: 80, placeholder: 'fa-solid fa-star' });
        input.setAttribute('list', 'hm-icons');
        input.value = obj[key] ?? '';
        const shown = el('i', { class: obj[key] || 'fa-regular fa-square' });
        input.addEventListener('input', () => { obj[key] = input.value.trim(); shown.className = obj[key] || 'fa-regular fa-square'; touched(); });
        box.append(label, el('div', { class: 'row hm-icon-row' }, el('span', { class: 'hm-icon-preview' }, shown), input), hint);
        return box;
      }
      case 'image': {
        const input = el('input', { type: 'text', maxLength: 320, placeholder: '/img/… albo https://…' });
        input.value = obj[key] ?? '';
        const thumb = el('img', { class: 'hm-thumb', alt: '' });
        const showThumb = () => {
          thumb.classList.toggle('hidden', !obj[key]);
          if (obj[key]) thumb.src = obj[key];
        };
        showThumb();
        input.addEventListener('input', () => { obj[key] = input.value.trim(); showThumb(); touched(); });
        const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'hidden' });
        file.addEventListener('change', async () => {
          const f2 = file.files?.[0];
          file.value = '';
          if (!f2) return;
          const url = await guard(() => upload(f2));
          if (!url) return;
          obj[key] = url;
          input.value = url;
          showThumb();
          touched();
          toast('Obrazek wgrany. Zapisz szkic albo opublikuj, żeby go użyć.');
        });
        const pick = el('button', { type: 'button', onclick: () => file.click() }, icon('fa-solid fa-upload'), 'Wgraj');
        box.append(label, el('div', { class: 'row hm-image-row' }, input, pick, file), thumb, hint || el('small', { class: 'muted', textContent: `PNG, JPEG albo WebP, do ${Math.round(meta.maxImage / 1048576)} MB.` }));
        return box;
      }
      case 'bool': {
        const input = el('input', { type: 'checkbox', checked: !!obj[key] });
        input.addEventListener('change', () => { obj[key] = input.checked; touched(); });
        box.append(el('label', { class: 'row hm-bool' }, el('span', { class: 'switch' }, input, el('span')), f.label), hint);
        return box;
      }
      case 'choice': {
        const select = el('select', {}, ...f.options.map(([v, l]) => el('option', { value: v, textContent: l, selected: obj[key] === v })));
        select.addEventListener('change', () => { obj[key] = select.value; touched(); });
        box.append(label, select, hint);
        return box;
      }
      case 'strings': {
        const area = el('textarea', { rows: Math.max(2, Math.min(6, (obj[key] ?? []).length + 1)) });
        area.value = (obj[key] ?? []).join('\n');
        area.addEventListener('input', () => {
          obj[key] = area.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, f.max).map((s) => s.slice(0, f.itemMax));
          touched();
        });
        box.append(el('div', { class: 'row hm-label-row' }, label, el('small', { class: 'muted', textContent: `do ${f.max}, każdy do ${f.itemMax} znaków` })), area, hint);
        return box;
      }
      case 'list':
        return listEl(f, obj, key, path);
      default:
        return box;
    }
  }

  /** A list: each item folded under its title, with up, down and remove; "Dodaj" at the end. */
  function listEl(f, obj, key, path) {
    const box = el('div', { class: 'hm-field hm-list', dataset: { path } });
    const open = new Set();
    function render() {
      const list = obj[key];
      const rows = list.map((item, i) => {
        const title = el('span', { class: 'hm-item-title' });
        const titled = () => {
          const iconField = Object.entries(f.item).find(([, x]) => x.t === 'icon');
          title.replaceChildren(iconField && item[iconField[0]] ? icon(item[iconField[0]]) : '', ` ${String(item[f.title] ?? '').trim() || '(bez nazwy)'}`,
            item.hidden ? el('span', { class: 'chip', textContent: 'ukryty' }) : '');
        };
        titled();
        const move = (d) => (e) => {
          e.preventDefault();
          const j = i + d;
          if (j < 0 || j >= list.length) return;
          [list[i], list[j]] = [list[j], list[i]];
          const wasOpen = open.has(i);
          open.delete(i);
          if (wasOpen) open.add(j);
          render();
          changed();
        };
        const remove = async (e) => {
          e.preventDefault();
          if (!await confirmModal({ title: `Usunąć „${String(item[f.title] ?? '').trim() || `#${i + 1}`}”?`, ok: 'Usuń', okIcon: 'fa-solid fa-trash-can', danger: true })) return;
          list.splice(i, 1);
          open.clear();
          render();
          changed();
        };
        const body = el('div', { class: 'hm-item-body' }, ...Object.entries(f.item).map(([k, sub]) => fieldEl(sub, item, k, `${path}.${i}.${k}`)));
        body.addEventListener('input', titled);
        const d = el('details', { class: 'hm-item', open: open.has(i), dataset: { path: `${path}.${i}` } },
          el('summary', {}, el('span', { class: 'hm-item-n', textContent: `${i + 1}.` }), title,
            el('span', { class: 'row hm-item-actions' },
              el('button', { type: 'button', title: 'W górę', disabled: i === 0, onclick: move(-1) }, icon('fa-solid fa-arrow-up')),
              el('button', { type: 'button', title: 'W dół', disabled: i === list.length - 1, onclick: move(1) }, icon('fa-solid fa-arrow-down')),
              el('button', { type: 'button', class: 'danger', title: 'Usuń', onclick: remove }, icon('fa-solid fa-trash')))),
          body);
        d.addEventListener('toggle', () => { if (d.open) open.add(i); else open.delete(i); });
        return d;
      });
      const add = el('button', { type: 'button', disabled: list.length >= f.max, onclick: () => {
        list.push(blank(f.item));
        open.add(list.length - 1);
        render();
        changed();
        box.querySelector('.hm-item:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } }, icon('fa-solid fa-plus'), 'Dodaj');
      box.replaceChildren(
        el('div', { class: 'row hm-label-row' }, el('span', { class: 'hm-label', textContent: f.label }), el('small', { class: 'muted', textContent: `${list.length}/${f.max}` })),
        f.hint ? el('small', { class: 'muted', textContent: f.hint }) : '',
        ...rows, el('div', { class: 'row' }, add));
    }
    render();
    return box;
  }

  // ---- the sections ----
  const cards = {};
  const chips = {};
  function sectionCard(s) {
    const reset = el('button', { type: 'button', title: 'Wróć do tego, co strona mówiła na początku', onclick: async () => {
      if (!await confirmModal({ title: `Przywrócić domyślną treść sekcji „${s.name}” (${LANG_NAMES[lang]})?`, text: 'Zmiana trafi na stronę po zapisaniu lub opublikowaniu.', ok: 'Przywróć', okIcon: 'fa-solid fa-rotate-left' })) return;
      content[s.id] = clone(meta.defaults[lang][s.id]);
      const fresh = sectionCard(s);
      cards[s.id].replaceWith(fresh);
      cards[s.id] = fresh;
      changed();
    } }, icon('fa-solid fa-rotate-left'), 'Przywróć domyślne');
    const chip = el('span', { class: 'chip hm-state' });
    chips[s.id] = chip;
    const card = el('section', { class: 'glass card hm-section', id: `hm-${s.id}`, dataset: { path: s.id } },
      el('div', { class: 'row hm-section-head' }, el('h2', {}, icon(s.icon), ' ', s.name), chip, reset),
      s.hint ? el('p', { class: 'muted small', textContent: s.hint }) : '',
      el('div', { class: 'hm-fields' }, ...Object.entries(s.fields).map(([k, f]) => fieldEl(f, content[s.id], k, `${s.id}.${k}`))));
    markChip(s.id);
    return card;
  }
  /** "domyślna" while a section says what it said at first, "zmieniona" once it differs. */
  function markChip(id) {
    const same = JSON.stringify(content[id]) === JSON.stringify(meta.defaults[lang][id]);
    chips[id].textContent = same ? 'domyślna' : 'zmieniona';
    chips[id].classList.toggle('blue', !same);
  }

  // ---- saving, publishing, history ----
  function load(next) {
    state = next;
    content = clone(state.content);
    base = JSON.stringify(content);
    for (const s of meta.sections) {
      const fresh = sectionCard(s);
      cards[s.id]?.replaceWith(fresh);
      cards[s.id] = fresh;
    }
    showStatus();
    renderHistory();
    void preview();
  }
  const note = el('input', { type: 'text', maxLength: 300, placeholder: 'Krótko: co się zmieniło (do historii i dziennika)' });
  const saveDraft = el('button', { onclick: async () => {
    const r = await send('draft', { content });
    if (r) { toast('Szkic zapisany. Strona pokazuje dalej opublikowaną wersję.'); load(r); }
  } }, icon('fa-solid fa-floppy-disk'), 'Zapisz szkic');
  const publish = el('button', { class: 'primary', onclick: async () => {
    // what goes live: the sections edited since the last save, the draft, the note for the history
    const saved = JSON.parse(base);
    const edited = meta.sections.filter((s) => JSON.stringify(content[s.id]) !== JSON.stringify(saved[s.id])).map((s) => s.name);
    const rows = [
      edited.length ? `Niezapisane zmiany w sekcjach: ${edited.join(', ')}` : state.draft ? `Szkic z ${fmtDate(state.draft.createdAt)}` : 'Treść bez zmian względem tego, co jest w edytorze.',
      note.value.trim() ? `Notatka: „${note.value.trim()}”` : 'Bez notatki do historii.',
    ];
    if (!await confirmModal({
      title: `Opublikować stronę główną (${LANG_NAMES[lang]})?`, text: 'Odwiedzający od razu zobaczą tę treść.', list: rows,
      ok: 'Opublikuj', okIcon: 'fa-solid fa-upload', icon: 'fa-solid fa-upload',
    })) return;
    const r = await send('publish', { content, note: note.value });
    if (r) { toast('Opublikowano. Strona główna pokazuje już nową treść.'); note.value = ''; load(r); }
  } }, icon('fa-solid fa-upload'), 'Opublikuj');
  const resetAll = el('button', { onclick: async () => {
    if (!await confirmModal({ title: `Przywrócić domyślną treść wszystkich sekcji (${LANG_NAMES[lang]})?`, text: 'Zmiana trafi na stronę po zapisaniu lub opublikowaniu.', ok: 'Przywróć wszystko', okIcon: 'fa-solid fa-rotate-left', danger: true })) return;
    content = clone(meta.defaults[lang]);
    for (const s of meta.sections) {
      const fresh = sectionCard(s);
      cards[s.id].replaceWith(fresh);
      cards[s.id] = fresh;
    }
    changed();
  } }, icon('fa-solid fa-rotate-left'), 'Wszystko domyślne');

  const history = el('div', { class: 'hm-history' });
  function renderHistory() {
    const pubId = state.published?.id;
    const rows = state.versions.map((v) => {
      const kind = v.publishedAt
        ? el('span', { class: `chip ${v.id === pubId ? 'green' : ''}`, textContent: v.id === pubId ? 'Opublikowana (na stronie)' : 'Opublikowana' })
        : el('span', { class: 'chip gold', textContent: v.restoredFrom ? `Szkic (przywrócona #${v.restoredFrom})` : 'Szkic' });
      const restore = el('button', { title: 'Przywróć jako nowy szkic', onclick: async () => {
        if (dirty() && !await confirmModal({ title: `Przywrócić wersję #${v.id}?`, text: 'W edytorze są niezapisane zmiany. Przepadną, a ta wersja wróci jako nowy szkic.', ok: 'Przywróć', okIcon: 'fa-solid fa-clock-rotate-left', danger: true })) return;
        const r = await guard(() => api('POST', `/v1/admin/home/versions/${v.id}/restore`));
        if (r) { toast(`Wersja #${v.id} przywrócona jako szkic — opublikuj, żeby trafiła na stronę.`); load(r); }
      } }, icon('fa-solid fa-clock-rotate-left'));
      return el('tr', {},
        el('td', { textContent: `#${v.id}` }),
        el('td', { textContent: fmtDate(v.publishedAt || v.createdAt) }),
        el('td', { textContent: v.byHandle ? `@${v.byHandle}` : v.by ? '(usunięte konto)' : 'system' }),
        el('td', {}, kind),
        el('td', { class: 'hide-sm hm-note', textContent: v.note }),
        el('td', {}, restore));
    });
    history.replaceChildren(el('h3', {}, icon('fa-solid fa-clock-rotate-left'), ' Historia wersji'),
      rows.length
        ? el('div', { class: 'sup-scroll' }, el('table', {},
          el('thead', {}, el('tr', {}, ...['#', 'Kiedy', 'Kto', 'Stan', 'Opis', ''].map((h, i) => el('th', { class: i === 4 ? 'hide-sm' : '', textContent: h })))),
          el('tbody', {}, ...rows)))
        : el('p', { class: 'muted small', textContent: 'Jeszcze nic nie zapisano: strona pokazuje treść domyślną.' }));
  }

  const langs = el('div', { class: 'row hm-langs' }, ...Object.keys(LANG_NAMES).map((l) => el('button', {
    class: l === lang ? 'primary' : '', onclick: async () => {
      if (l === lang || (dirty() && !await confirmModal(DISCARD))) return;
      lang = l;
      editor();
    },
  }, icon('fa-solid fa-language'), `${l.toUpperCase()} — ${LANG_NAMES[l]}`, meta.langs[l].draftAt > meta.langs[l].publishedAt ? el('span', { class: 'chip gold', textContent: 'szkic' }) : '')));
  const jump = el('div', { class: 'row hm-jump' }, ...meta.sections.map((s) => el('button', { class: 'chip', onclick: () => cards[s.id].scrollIntoView({ behavior: 'smooth', block: 'start' }) }, icon(s.icon), s.name)));

  for (const s of meta.sections) cards[s.id] = sectionCard(s);
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Strona główna' }), langs,
      el('a', { class: 'btn', href: state.path, target: '_blank', rel: 'noopener' }, icon('fa-solid fa-arrow-up-right-from-square'), 'Na stronie')),
    el('p', { class: 'muted', textContent: 'Wszystko, co mówi strona główna, po polsku (/) i po angielsku (/en). Zmiany widzisz od razu w podglądzie; strona pokaże je po opublikowaniu. Każdy zapis zostaje w historii i w dzienniku. Tekst jest zwykłym tekstem — dłuższe pola rozumieją tylko **pogrubienie** i [link](/adres).' }),
    status,
    el('div', { class: 'glass card hm-publish' },
      el('div', { class: 'row' }, saveDraft, resetAll, el('span', { class: 'grow' })),
      el('div', { class: 'row' }, el('div', { class: 'grow' }, note), publish)),
    jump,
    el('datalist', { id: 'hm-icons' }, ...meta.icons.map((n) => el('option', { value: `fa-solid fa-${n}` }))),
    el('div', { class: 'hm-editor' },
      el('div', { class: 'hm-sections' }, ...meta.sections.map((s) => cards[s.id])),
      el('div', { class: 'glass card hm-preview' },
        el('div', { class: 'row hm-preview-head' }, el('b', {}, icon('fa-solid fa-eye'), ' Podgląd'), previewNote, el('span', { class: 'grow' }),
          el('button', { class: 'small', onclick: () => preview() }, icon('fa-solid fa-rotate'), 'Odśwież')),
        frameBox)),
    el('div', { class: 'glass card' }, history));
  showStatus();
  renderHistory();
  void preview();
  window.addEventListener('beforeunload', (e) => { if (document.contains(frame) && dirty()) e.preventDefault(); });
  // and before another tab of the panel replaces the editor
  watchUnsaved(frame, dirty);
}
