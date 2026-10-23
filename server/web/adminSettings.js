// The admin panel's "Ustawienia": every limit and switch of the server (server/src/settingsDefs.ts),
// grouped as on the server, with the value now, the default and who changed it. Each group is saved
// on its own, after a summary of what changes (the risky ones marked, with a warning); the server logs
// every change old → new. Also the editor of "tylko dla wspierających od poziomu N" for the
// cosmetics tab.
import { $, api, confirmModal, el, fmtDate, guard, icon, toast } from './common.js';

const MB = 1024 * 1024;
const ERRORS = {
  setting_invalid: 'nieprawidłowa wartość', setting_too_small: 'za mało', setting_too_big: 'za dużo', setting_too_long: 'za długie',
  setting_too_many: 'za dużo pozycji', setting_bad_url: 'link musi zaczynać się od https:// albo /', setting_unknown: 'nieznane ustawienie',
  setting_no_secret_key: 'brak STORAGE_SECRET_KEY na serwerze, kluczy nie da się zapisać',
};

let state = { q: '', changedOnly: false };

/** A value as the panel shows it (bytes in MB or KB, lists counted, dates readable). */
function show(def, v) {
  // a key is never sent back: only whether one is set, or that a new one was typed
  if (def.type === 'secret') return v === null ? 'usunięty' : v ? 'nowy (ukryty)' : def.secretSet ? 'ustawiony' : 'nie ustawiony';
  if (Array.isArray(v)) return v.length ? `${v.length} poz.` : 'pusta';
  if (typeof v === 'boolean') return v ? 'włączone' : 'wyłączone';
  if (def.type === 'bytes') return def.bytesUnit === 'KB' ? `${round(v / 1024)} KB` : `${round(v / MB)} MB`;
  if (def.type === 'datetime') return v ? fmtDate(v) : '—';
  if (typeof v === 'string') return v ? `„${v.length > 40 ? `${v.slice(0, 40)}…` : v}”` : '(puste)';
  return `${v}${def.unit ? ` ${def.unit}` : ''}`;
}
const round = (n) => Math.round(n * 100) / 100;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A local "YYYY-MM-DDTHH:MM" for datetime-local, and back. */
const toLocal = (ms) => {
  if (!ms) return '';
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};
const fromLocal = (s) => (s ? new Date(s).getTime() : 0);

/** The input for one setting; `onValue(value | undefined)` gets the parsed value (undefined: not valid). */
function inputFor(def, value, onValue) {
  const scale = def.type === 'bytes' ? (def.bytesUnit === 'KB' ? 1024 : MB) : 1;
  switch (def.type) {
    case 'bool': {
      const box = el('input', { type: 'checkbox', checked: value });
      box.addEventListener('change', () => onValue(box.checked));
      return { node: el('span', { class: 'switch' }, box, el('span')), set: (v) => { box.checked = v; } };
    }
    case 'enum': {
      const sel = el('select', {}, ...def.options.map((o) => el('option', { value: o, textContent: o, selected: o === value })));
      sel.addEventListener('change', () => onValue(sel.value));
      return { node: sel, set: (v) => { sel.value = v; } };
    }
    case 'list': {
      const area = el('textarea', { rows: 5, value: value.join('\n'), spellcheck: false });
      area.addEventListener('input', () => onValue(area.value.split('\n').map((s) => s.trim()).filter(Boolean)));
      return { node: area, set: (v) => { area.value = v.join('\n'); } };
    }
    case 'string':
    case 'url': {
      const input = el('input', { type: 'text', value, maxLength: def.maxLength ?? 500, placeholder: def.type === 'url' ? 'https://… albo /strona' : '' });
      input.addEventListener('input', () => onValue(input.value));
      return { node: input, set: (v) => { input.value = v; } };
    }
    case 'secret': {
      // write-only: empty keeps the saved key, ↺ removes it
      const input = el('input', { type: 'password', value: '', autocomplete: 'new-password', maxLength: def.maxLength ?? 500,
        placeholder: def.secretSet ? '•••••••• (ustawiony; wpisz nowy, aby zmienić)' : 'nie ustawiony' });
      input.addEventListener('input', () => onValue(input.value.trim()));
      return { node: input, set: () => { input.value = ''; } };
    }
    case 'datetime': {
      const input = el('input', { type: 'datetime-local', value: toLocal(value) });
      input.addEventListener('change', () => onValue(fromLocal(input.value)));
      return { node: input, set: (v) => { input.value = toLocal(v); } };
    }
    default: {
      const input = el('input', { type: 'number', value: round(value / scale), step: def.type === 'float' || scale > 1 ? 'any' : 1,
        min: def.min !== undefined ? round(def.min / scale) : undefined, max: def.max !== undefined ? round(def.max / scale) : undefined });
      input.addEventListener('input', () => {
        const n = Number(input.value);
        const v = input.value.trim() === '' || !Number.isFinite(n) ? undefined : def.type === 'float' ? n : Math.round(n * scale);
        const ok = v !== undefined && (def.min === undefined || v >= def.min) && (def.max === undefined || v <= def.max);
        input.classList.toggle('bad', !ok);
        onValue(ok ? v : undefined);
      });
      return { node: input, set: (v) => { input.value = round(v / scale); input.classList.remove('bad'); } };
    }
  }
}

/** The bounds and unit, under a number's field. */
function bounds(def) {
  if (!['int', 'float', 'duration', 'bytes'].includes(def.type)) return '';
  const unit = def.type === 'bytes' ? def.bytesUnit ?? 'MB' : def.unit ?? '';
  const f = (n) => (def.type === 'bytes' ? round(n / (def.bytesUnit === 'KB' ? 1024 : MB)) : n);
  return `${def.min !== undefined ? f(def.min) : '…'}–${def.max !== undefined ? f(def.max) : '…'}${unit ? ` ${unit}` : ''}`;
}

/** What the banner will look like on the website and in the launcher (the form's values). */
function bannerPreview(values) {
  const box = el('div', { class: `site-banner ${values['banner.level'] === 'warning' ? 'warning' : 'info'}` },
    icon(values['banner.level'] === 'warning' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info'),
    el('span', { class: 'site-banner-text', textContent: values['banner.text'] || '(brak treści)' }),
    values['banner.link'] ? el('a', { href: values['banner.link'], target: '_blank', rel: 'noopener', textContent: 'Więcej' }) : '');
  return el('div', {}, el('small', { class: 'muted', textContent: values['banner.enabled'] ? 'Podgląd (tak go zobaczą gracze):' : 'Podgląd (komunikat jest wyłączony):' }), box);
}

export async function settingsPage() {
  const res = await guard(() => api('GET', '/v1/admin/settings'));
  if (!res) return;
  const byCat = new Map(res.categories.map((c) => [c.id, []]));
  for (const s of res.settings) byCat.get(s.category)?.push(s);

  const search = el('input', { type: 'search', placeholder: 'Szukaj ustawienia…', value: state.q });
  const onlyChanged = el('input', { type: 'checkbox', checked: state.changedOnly });
  const nav = el('div', { class: 'row set-nav' });
  const groups = [];

  for (const cat of res.categories) {
    const defs = byCat.get(cat.id) ?? [];
    if (!defs.length) continue;
    /** key → the value to send (null: back to the default); only what the admin touched. */
    const pending = new Map();
    const invalid = new Set();
    const rows = [];
    const saveBtn = el('button', { class: 'primary', disabled: true }, icon('fa-solid fa-floppy-disk'), 'Zapisz');
    const status = el('small', { class: 'muted' });
    const preview = cat.id === 'banner' ? el('div', { class: 'set-preview' }) : null;
    const current = () => Object.fromEntries(defs.map((d) => [d.key, pending.has(d.key) ? (pending.get(d.key) ?? d.default) : d.value]));
    const refresh = () => {
      const n = pending.size;
      saveBtn.disabled = !n || invalid.size > 0;
      status.textContent = invalid.size ? 'Popraw zaznaczone pola.' : n ? `Zmiany do zapisania: ${n}` : '';
      if (preview) preview.replaceChildren(bannerPreview(current()));
    };
    for (const def of defs) {
      const changedChip = def.overridden ? el('span', { class: 'chip sky', textContent: 'zmienione' }) : '';
      const note = (v) => {
        const changed = !same(v, def.value);
        row.classList.toggle('dirty', changed);
      };
      const field = inputFor(def, def.value, (v) => {
        if (v === undefined) {
          invalid.add(def.key);
          refresh();
          return;
        }
        invalid.delete(def.key);
        if (same(v, def.value)) pending.delete(def.key);
        else pending.set(def.key, same(v, def.default) && def.overridden ? null : v);
        note(v);
        refresh();
      });
      const reset = el('button', { type: 'button', class: 'icon-btn', title: def.type === 'secret' ? 'Usuń klucz' : `Przywróć domyślne (${show(def, def.default)})`, onclick: () => {
        field.set(def.default);
        invalid.delete(def.key);
        if (def.overridden) pending.set(def.key, null);
        else pending.delete(def.key);
        note(def.default);
        refresh();
      } }, icon('fa-solid fa-rotate-left'));
      const who = def.overridden ? `Zmienione ${fmtDate(def.updatedAt)}${def.updatedByHandle ? ` przez @${def.updatedByHandle}` : ''}.` : '';
      const row = el('div', { class: `set-row${def.type === 'list' ? ' wide' : ''}`, dataset: { key: def.key } },
        el('div', { class: 'set-text' },
          el('div', { class: 'row' }, el('b', { textContent: def.label }), changedChip, def.risky && cat.id !== 'features' ? el('span', { class: 'chip gold', title: 'Panel ostrzeże o tym przed zapisem' }, icon('fa-solid fa-triangle-exclamation'), 'ważne') : '',
            def.restart ? el('span', { class: 'chip', textContent: 'po restarcie' }) : ''),
          el('small', { class: 'muted', textContent: def.description }),
          el('small', { class: 'set-meta' }, el('code', { textContent: def.key }), def.type === 'secret' ? ' · zapisany zaszyfrowany, nie da się go odczytać' : ` · domyślnie ${show(def, def.default)}`,
            def.env ? ` (z ${def.env} na tym serwerze, jeśli ustawione)` : '', bounds(def) ? ` · zakres ${bounds(def)}` : '', who ? ` · ${who}` : '')),
        el('div', { class: 'set-input' }, field.node, el('span', { class: 'muted small', textContent: def.type === 'bytes' ? def.bytesUnit ?? 'MB' : ['int', 'float', 'duration'].includes(def.type) ? def.unit ?? '' : '' }),
          def.overridden || !['bool', 'secret'].includes(def.type) ? reset : ''));
      row.dataset.search = `${cat.label} ${cat.labelEn} ${def.label} ${def.labelEn} ${def.description} ${def.key}`.toLowerCase();
      row.dataset.changed = def.overridden ? '1' : '';
      rows.push(row);
    }

    saveBtn.addEventListener('click', async () => {
      const changes = [...pending].map(([key, v]) => {
        const def = defs.find((d) => d.key === key);
        const back = v === null && def.type !== 'secret';
        return { name: def.label, from: show(def, def.value), to: show(def, back ? def.default : v), note: back ? '(domyślne)' : '', risky: !!def.risky };
      });
      // one question: every change as "name: old → new", the risky ones marked and the warning in the same box
      const risky = changes.filter((c) => c.risky).length;
      if (!await confirmModal({
        title: `Zapisać zmiany w „${cat.label}”?`,
        text: changes.length === 1 ? 'Jedna zmiana:' : `Zmiany do zapisania: ${changes.length}`,
        list: changes,
        warning: risky ? `Uwaga, ${risky === 1 ? 'zaznaczona zmiana wpływa' : 'zaznaczone zmiany wpływają'} na graczy od razu.` : undefined,
        ok: 'Zapisz', okIcon: 'fa-solid fa-floppy-disk', icon: 'fa-solid fa-floppy-disk',
      })) return;
      try {
        const r = await api('POST', '/v1/admin/settings', { values: Object.fromEntries(pending) });
        toast(r.changed.length ? `Zapisano (${r.changed.length}).` : 'Nic się nie zmieniło.');
        settingsPage();
      } catch (err) {
        // "<code>:<key>": which field
        const [code, key] = String(err.code ?? '').split(':');
        const def = defs.find((d) => d.key === key);
        toast(def ? `${def.label}: ${ERRORS[code] ?? code}` : ERRORS[code] ?? 'Nie udało się zapisać.', true);
        rows.find((r) => r.dataset.key === key)?.querySelector('input, textarea, select')?.classList.add('bad');
      }
    });

    const card = el('section', { class: 'glass card set-group', id: `set-${cat.id}` },
      el('div', { class: 'row set-head' }, el('h2', { class: 'grow', textContent: cat.label }), status, saveBtn),
      cat.id === 'features' ? el('p', { class: 'muted small', textContent: 'Wyłączona funkcja odpowiada graczom „chwilowo wyłączona” (launcher i strona chowają ją albo wyszarzają). Dane graczy zostają.' }) : '',
      ...(preview ? [preview] : []), ...rows);
    groups.push({ card, rows });
    nav.append(el('a', { class: 'chip', href: `#settings`, onclick: (e) => { e.preventDefault(); card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, cat.label));
    refresh();
  }

  const nothing = el('p', { class: 'glass card muted', textContent: 'Nic nie pasuje.' });
  const filter = () => {
    const q = state.q.toLowerCase();
    let found = false;
    for (const g of groups) {
      let any = false;
      for (const r of g.rows) {
        const show = (!q || r.dataset.search.includes(q)) && (!state.changedOnly || r.dataset.changed);
        r.hidden = !show;
        any ||= show;
      }
      g.card.hidden = !any;
      found ||= any;
    }
    nothing.hidden = found;
  };
  search.addEventListener('input', () => { state.q = search.value.trim(); filter(); });
  onlyChanged.addEventListener('change', () => { state.changedOnly = onlyChanged.checked; filter(); });
  const overridden = res.settings.filter((s) => s.overridden).length;
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Ustawienia' }), el('div', { class: 'grow' }), search),
    el('p', { class: 'muted', textContent: `Limity i przełączniki serwera. Działają od razu po zapisaniu, bez restartu. Domyślne wartości są takie, jak w kodzie; zmienionych: ${overridden}. Każda zmiana trafia do Dziennika.` }),
    el('div', { class: 'row' }, nav, el('label', { class: 'row small' }, el('span', { class: 'switch' }, onlyChanged, el('span')), 'Tylko zmienione')),
    ...groups.map((g) => g.card), nothing);
  filter();
}

/**
 * In a cosmetic's card: "Tylko dla wspierających od poziomu N" (0: for everyone). Shows the default
 * (cosmetics.ts) and goes back to it with ↺.
 */
export function supporterEditor(c, o, done) {
  // a rank's item has its own lock (the server refuses one only an achievement gives, too)
  if (c.rank) return '';
  const level = o.supporter ?? 0;
  const def = o.supporterDefault ?? 0;
  const input = el('input', { type: 'number', min: 0, max: 100, step: 1, value: level || '', placeholder: 'wszyscy',
    title: `Pusta albo 0: dla wszystkich. Domyślnie ${def ? `od poziomu ${def}` : 'dla wszystkich'}.` });
  const send = async (value) => {
    const r = await guard(() => api('POST', `/v1/admin/cosmetics/${c.id}/supporter`, { level: value }));
    if (r) toast(`${r.supporter ? `Tylko dla wspierających od poziomu ${r.supporter}.` : 'Dla wszystkich.'}${r.removed ? ` Zdjęto u ${r.removed} graczy bez tego poziomu.` : ''}`);
    done();
  };
  input.addEventListener('change', async () => {
    const n = input.value.trim() === '' ? 0 : Number(input.value);
    if (!Number.isInteger(n) || n < 0 || n > 100 || n === level) return;
    if (n > level && c.wearing && !await confirmModal({ title: `Tylko od poziomu wsparcia ${n}?`, text: `„${c.name}” zostanie zdjęty graczom bez poziomu wsparcia ${n} (i bez przyznania).`, ok: 'Kontynuuj' })) return done();
    send(n);
  });
  return el('label', { class: 'opt', title: 'Tylko dla graczy z poziomem wsparcia co najmniej tyle (Wsparcie → poziomy). Nie jest wtedy sprzedawany za Iskry.' },
    el('span', {}, icon('fa-solid fa-heart'), ' Wspierający od poz.'),
    el('span', { class: 'row' }, input,
      level !== def ? el('button', { type: 'button', class: 'icon-btn', title: `Przywróć domyślne (${def ? `od poziomu ${def}` : 'dla wszystkich'})`, onclick: () => send(null) }, icon('fa-solid fa-rotate-left')) : ''));
}
