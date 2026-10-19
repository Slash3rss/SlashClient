// The admin panel's "Miejsce na pliki": how full each storage backend is (the server's disk, R2, B2,
// other S3 buckets), the biggest users, and adding, testing, switching off, removing and emptying
// backends. Keys typed here go to the server once and are never shown again (only "set" and the
// key id's last 4 characters).
import { $, api, el, errorText, fmtDate, guard, icon, toast } from './common.js';

const TYPES = { r2: ['Cloudflare R2', 'fa-brands fa-cloudflare'], b2: ['Backblaze B2', 'fa-solid fa-fire'], s3: ['Inne S3', 'fa-solid fa-bucket'], local: ['Folder na serwerze', 'fa-solid fa-hard-drive'] };
const KINDS = { image: ['Zrzuty', 'fa-solid fa-image'], clip: ['Klipy', 'fa-solid fa-film'], profile: ['Profile', 'fa-solid fa-box-archive'] };
/** Backblaze B2 regions (the part of the S3 endpoint after "s3."). */
const B2_REGIONS = ['us-west-000', 'us-west-001', 'us-west-002', 'us-west-004', 'us-east-005', 'eu-central-003', 'ca-east-006'];
/** What the connection check's error codes usually mean. */
const CHECK_HINTS = {
  SignatureDoesNotMatch: 'Zły sekret klucza (Secret Access Key / applicationKey).',
  InvalidAccessKeyId: 'Nieznany identyfikator klucza (Access Key ID / keyID).',
  AccessDenied: 'Klucz nie ma dostępu do tego bucketu (uprawnienia odczytu i zapisu, ograniczenie do bucketu).',
  NoSuchBucket: 'Nie ma takiego bucketu pod tym adresem (nazwa bucketu albo endpoint/region).',
  AuthorizationHeaderMalformed: 'Zły region dla tego endpointu.',
  ENOTFOUND: 'Nie ma takiego adresu (sprawdź endpoint, w R2 identyfikator konta).',
  ECONNREFUSED: 'Serwer pod tym adresem nie odpowiada.',
  storage_no_key: 'Zapisanego klucza nie da się odczytać. Wpisz klucze ponownie.',
};
const ERRORS = {
  storage_bad_type: 'Wybierz rodzaj miejsca.',
  storage_bad_name: 'Podaj nazwę (do 40 znaków).',
  storage_bad_endpoint: 'Endpoint musi być adresem https:// bez ścieżki, np. https://<konto>.r2.cloudflarestorage.com.',
  storage_bad_region: 'Zły region (R2: auto, B2: np. eu-central-003).',
  storage_bad_bucket: 'Zła nazwa bucketu.',
  storage_bad_prefix: 'Prefiks: litery, cyfry, . _ - i ukośniki.',
  storage_bad_dir: 'Podaj pełną ścieżkę folderu na serwerze.',
  storage_bad_capacity: 'Zły limit miejsca.',
  storage_bad_priority: 'Priorytet: liczba od -1000 do 1000.',
  storage_need_keys: 'Podaj identyfikator klucza i sekret.',
  storage_no_key: 'Serwer nie ma ustawionego STORAGE_SECRET_KEY, więc nie może bezpiecznie zapisać kluczy. Ustaw go (instrukcja: server/docs/przechowywanie.md) i zrestartuj serwer.',
  storage_duplicate: 'To miejsce pokrywa się z innym (ten sam bucket i prefiks albo ten sam folder).',
  storage_in_use: 'W tym miejscu są pliki. Przenieś je najpierw albo tylko je wyłącz.',
  storage_builtin: 'Dysku serwera nie można usunąć, można go wyłączyć.',
  storage_moving: 'Trwa przenoszenie plików.',
  storage_bad_target: 'Wybierz inne miejsce docelowe.',
  storage_unavailable: 'To miejsce jest teraz niedostępne.',
  storage_full: 'Brak miejsca.',
};
const fail = (err) => toast(ERRORS[err?.code] ?? errorText(err), true);
const call = (...args) => api(...args).catch((err) => { fail(err); return undefined; });

export function bytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString('pl-PL', { maximumFractionDigits: i >= 3 ? 2 : i ? 1 : 0 })} ${units[i]}`;
}
const GB = 1024 ** 3;

/** A bar: used of total (a share over 90% turns red, over 75% gold). */
function meter(used, total) {
  const fill = el('div');
  const share = total ? Math.min(1, used / total) : 0;
  fill.style.width = `${Math.max(total ? 1 : 0, share * 100)}%`;
  return el('div', { class: `st-meter${share > 0.9 ? ' red' : share > 0.75 ? ' gold' : ''}` }, fill);
}

let timer;

export async function storagePage() {
  clearTimeout(timer);
  const s = await guard(() => api('GET', '/v1/admin/storage'));
  if (!s || !$('#main')) return;
  const others = (b) => s.backends.filter((x) => x.id !== b.id && x.available);

  const cards = s.backends.map((b) => {
    const [typeName, typeIcon] = TYPES[b.type] ?? [b.type, 'fa-solid fa-box'];
    const where = b.type === 'local' ? b.dir : `${b.endpoint.replace(/^https?:\/\//, '')} · ${b.bucket}${b.prefix ? `/${b.prefix}` : ''}`;
    const kinds = Object.entries(KINDS).map(([k, [name, ic]]) => {
      const v = b.kinds[k];
      return v ? el('span', { class: 'chip', title: name }, icon(ic), `${v.files} · ${bytes(v.bytes)}`) : '';
    });
    const capacity = b.capacity ? `${bytes(b.used)} z ${bytes(b.capacity)}` : `${bytes(b.used)} (bez limitu)`;
    const moveTo = el('select', {}, el('option', { value: '', textContent: 'Przenieś pliki do…' }), ...others(b).map((o) => el('option', { value: o.id, textContent: o.name })));
    moveTo.addEventListener('change', async () => {
      const to = s.backends.find((o) => o.id === moveTo.value);
      if (!to) return;
      if (!confirm(`Przenieść wszystkie pliki (${b.files}, ${bytes(b.used)}) z „${b.name}” do „${to.name}”? Trwa to w tle; linki działają cały czas.`)) { moveTo.value = ''; return; }
      if (await call('POST', `/v1/admin/storage/${b.id}/move`, { to: to.id })) toast('Przenoszenie ruszyło.');
      storagePage();
    });
    const toggle = async () => {
      if (await call('POST', `/v1/admin/storage/${b.id}`, { enabled: !b.enabled })) toast(b.enabled ? 'Wyłączone: nowe pliki tu nie trafią, obecne dalej działają.' : 'Włączone.');
      storagePage();
    };
    const remove = async () => {
      if (b.files) {
        if (confirm(`„${b.name}” trzyma ${b.files} plików (${bytes(b.used)}), więc nie można go usunąć. Najpierw przenieś pliki.\n\nWyłączyć je zamiast tego (nowe pliki nie będą tu trafiać)?`) && b.enabled) await toggle();
        return;
      }
      if (!confirm(`Usunąć „${b.name}” z listy? Bucket i jego zawartość zostają nietknięte.`)) return;
      if (await call('DELETE', `/v1/admin/storage/${b.id}`)) toast('Usunięto.');
      storagePage();
    };
    const testBtn = el('button', { onclick: () => runTest({ id: b.id }, testBtn) }, icon('fa-solid fa-plug-circle-check'), 'Test połączenia');
    return el('div', { class: `glass card st-card${b.enabled ? '' : ' off'}` },
      el('div', { class: 'row' },
        el('h3', { class: 'grow' }, icon(typeIcon), ' ', b.name),
        el('span', { class: 'chip', title: 'Niższy priorytet = pierwszy wybór dla nowych plików' }, `priorytet ${b.priority}`),
        b.enabled ? el('span', { class: 'chip green', textContent: 'włączone' }) : el('span', { class: 'chip', textContent: 'wyłączone' }),
        b.available ? '' : el('span', { class: 'chip red', title: b.problem ?? '' }, icon('fa-solid fa-triangle-exclamation'), 'niedostępne')),
      el('div', { class: 'muted small st-where', textContent: `${typeName} · ${where}` }),
      b.problem ? el('p', { class: 'small st-problem', textContent: b.problem }) : '',
      el('div', { class: 'row small' }, el('b', { textContent: capacity }), el('span', { class: 'muted', textContent: `${b.files} plików` })),
      meter(b.used, b.capacity),
      b.disk ? el('div', { class: 'small muted' }, `Dysk: wolne ${bytes(b.disk.free)} z ${bytes(b.disk.total)}`, b.disk.free < s.disk.minFree ? el('span', { class: 'chip red', textContent: ` poniżej progu ${bytes(s.disk.minFree)}` }) : '') : '',
      el('div', { class: 'row' }, ...kinds),
      b.type === 'local' ? '' : el('div', { class: 'small muted', textContent: `Klucz: ${b.keyIdSet ? `ustawiony (…${b.keyIdHint})` : 'brak'} · sekret: ${b.secretSet ? 'ustawiony' : 'brak'}` }),
      el('div', { class: 'row wrap st-actions' },
        el('button', { onclick: () => openForm(s, b) }, icon('fa-solid fa-pen'), 'Edytuj'),
        testBtn,
        el('button', { onclick: toggle }, icon(b.enabled ? 'fa-solid fa-pause' : 'fa-solid fa-play'), b.enabled ? 'Wyłącz' : 'Włącz'),
        b.files && others(b).length ? moveTo : '',
        b.builtin ? '' : el('button', { class: 'danger', onclick: remove }, icon('fa-solid fa-trash-can'), 'Usuń')));
  });

  const totals = Object.entries(KINDS).map(([k, [name, ic]]) => el('div', { class: 'glass stat' }, el('small', {}, icon(ic), name),
    el('b', { textContent: bytes(s.kinds[k]?.bytes ?? 0) }), el('em', { class: 'muted', textContent: `${s.kinds[k]?.files ?? 0} plików` })));
  const diskCard = el('div', { class: 'glass stat' }, el('small', {}, icon('fa-solid fa-server'), 'Dysk VPS'),
    el('b', { textContent: `${bytes(s.disk.free)} wolne` }), meter(s.disk.total - s.disk.free, s.disk.total),
    el('em', { class: 'muted', textContent: `z ${bytes(s.disk.total)} · nowe pliki nie trafią na dysk poniżej ${bytes(s.disk.minFree)} wolnego` }));

  const move = s.move ? moveCard(s) : '';
  const top = el('div', { class: 'glass card' }, el('h3', { textContent: 'Najwięcej miejsca zajmują' }), s.top.length
    ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Gracz' }), el('th', { textContent: 'Plików' }), el('th', { textContent: 'Rozmiar' }))),
      el('tbody', {}, ...s.top.map((t) => el('tr', {}, el('td', { textContent: t.handle ? `@${t.handle}` : 'usunięte konto' }), el('td', { textContent: String(t.files) }), el('td', { textContent: bytes(t.bytes) })))))
    : el('p', { class: 'muted', textContent: 'Nikt jeszcze niczego nie wrzucił.' }));

  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Miejsce na pliki' }), el('div', { class: 'grow' }),
      el('button', { onclick: storagePage }, icon('fa-solid fa-rotate'), 'Odśwież'),
      el('button', { class: 'primary', onclick: () => openForm(s) }, icon('fa-solid fa-plus'), 'Dodaj miejsce')),
    el('p', { class: 'muted', textContent: 'Zrzuty, klipy i profile w chmurze trafiają do pierwszego włączonego miejsca (według priorytetu), które ma na nie miejsce. Istniejące pliki zostają tam, gdzie są, i dalej działają; serwer zawsze przesyła je sam, bez linków do bucketów.' }),
    s.secretKey.set ? '' : el('div', { class: 'glass card st-warn' }, icon('fa-solid fa-key'),
      el('span', { textContent: s.secretKey.error ?? 'Serwer nie ma ustawionego STORAGE_SECRET_KEY, więc nie zapisze kluczy R2/B2. Ustaw go w /etc/slashclient/env (openssl rand -base64 32) i zrestartuj serwer; instrukcja w server/docs/przechowywanie.md.' })),
    s.orphaned.length ? el('div', { class: 'glass card st-warn' }, icon('fa-solid fa-triangle-exclamation'),
      el('span', { textContent: `Pliki w miejscach, których już nie ma na liście: ${s.orphaned.map((o) => `${o.id} (${o.files})`).join(', ')}. Nie da się ich wyświetlić.` })) : '',
    el('div', { class: 'stats' }, diskCard, ...totals),
    move,
    el('div', { class: 'st-list' }, ...cards),
    top);

  // the move's progress comes in by itself
  if (s.move?.running) timer = setTimeout(() => { if (location.hash === '#storage' && !document.querySelector('.drawer')) storagePage(); }, 2000);
}

function moveCard(s) {
  const m = s.move;
  const name = (id) => s.backends.find((b) => b.id === id)?.name ?? id;
  const reason = { storage_full: 'w miejscu docelowym skończyło się miejsce', stopped: 'zatrzymane' }[m.error] ?? m.error;
  return el('div', { class: 'glass card st-move' },
    el('div', { class: 'row' }, el('h3', { class: 'grow' }, icon('fa-solid fa-truck-ramp-box'), ` Przenoszenie: ${name(m.from)} → ${name(m.to)}`),
      m.running ? el('button', { onclick: async () => { await call('POST', '/v1/admin/storage/move/stop'); storagePage(); } }, icon('fa-solid fa-stop'), 'Zatrzymaj') : ''),
    meter(m.done + m.failed, m.total || 1),
    el('div', { class: 'small muted', textContent: `${m.done + m.failed} z ${m.total} plików · przeniesiono ${bytes(m.bytes)}${m.failed ? ` · błędy: ${m.failed}` : ''}`
      + (m.running ? ' · trwa…' : ` · zakończone ${fmtDate(m.finishedAt)}${reason ? ` (${reason})` : ''}`) }));
}

/** Runs the connection check and says what came of it. */
async function runTest(body, button) {
  const old = button.innerHTML;
  button.disabled = true;
  button.replaceChildren(icon('fa-solid fa-circle-notch fa-spin'), 'Sprawdzam…');
  const r = await call('POST', '/v1/admin/storage/test', body);
  button.disabled = false;
  button.innerHTML = old;
  if (!r) return;
  if (r.ok) toast(`Działa: zapis, odczyt i usunięcie pliku testowego (${r.ms} ms).`);
  else toast(`Nie działa: ${CHECK_HINTS[r.code] ? `${CHECK_HINTS[r.code]} ` : ''}(${r.error})`, true);
}

function closeForm() {
  document.querySelector('.drawer')?.remove();
  document.querySelector('.shade')?.remove();
}

/** The add / edit form, in a drawer. */
function openForm(s, b) {
  closeForm();
  const editing = !!b;
  const field = (label, input, hint) => el('label', { class: 'st-field' }, el('span', { textContent: label }), input, hint ? el('small', { class: 'muted', textContent: hint }) : '');
  const text = (value = '', placeholder = '', type = 'text') => el('input', { type, value, placeholder, autocomplete: 'off', spellcheck: false });

  const type = el('select', { disabled: editing && b.files > 0 || b?.builtin }, ...Object.entries(TYPES).map(([id, [name]]) => el('option', { value: id, textContent: name, selected: (b?.type ?? 'r2') === id })));
  const name = text(b?.name ?? '', 'np. R2 darmowe 10 GB');
  name.maxLength = 40;
  const account = text('', '32 znaki z panelu Cloudflare');
  const eu = el('input', { type: 'checkbox' });
  const region = el('select', {}, ...B2_REGIONS.map((r) => el('option', { value: r, textContent: r, selected: b?.region === r })));
  const endpoint = text(b?.endpoint ?? '', 'https://…');
  const s3region = text(b?.region ?? '', 'np. us-east-1');
  const bucket = text(b?.bucket ?? '', 'nazwa bucketu');
  const prefix = text(b?.prefix ?? (editing ? '' : 'slashclient/'), 'np. slashclient/');
  const keyId = text('', b?.keyIdSet ? `ustawiony (…${b.keyIdHint}), zostaw puste, żeby nie zmieniać` : 'Access Key ID / keyID');
  const secret = text('', b?.secretSet ? 'ustawiony, zostaw puste, żeby nie zmieniać' : 'Secret Access Key / applicationKey', 'password');
  secret.autocomplete = 'new-password';
  const dir = text(b?.type === 'local' && !b.builtin ? b.dir : '', '/mnt/dysk/slashclient');
  const capacity = text(b?.capacity ? String(+(b.capacity / GB).toFixed(3)) : '', 'bez limitu', 'number');
  capacity.min = '0';
  capacity.step = 'any';
  const priority = text(String(b?.priority ?? 10), '', 'number');
  const enabled = el('input', { type: 'checkbox', checked: b?.enabled ?? true });
  const pathStyle = el('input', { type: 'checkbox', checked: b?.pathStyle ?? true });

  // R2: the account id gives the endpoint; B2: the region does
  const r2Endpoint = () => { if (/^[0-9a-f]{32}$/i.test(account.value.trim())) endpoint.value = `https://${account.value.trim().toLowerCase()}.${eu.checked ? 'eu.' : ''}r2.cloudflarestorage.com`; };
  account.addEventListener('input', r2Endpoint);
  eu.addEventListener('change', r2Endpoint);
  const b2Endpoint = () => { endpoint.value = `https://s3.${region.value}.backblazeb2.com`; };
  region.addEventListener('change', b2Endpoint);
  if (b?.type === 'r2') account.value = /^https:\/\/([0-9a-f]{32})\./.exec(b.endpoint)?.[1] ?? '';
  if (b?.type === 'r2') eu.checked = /\.eu\.r2\./.test(b.endpoint);

  const sections = {
    r2: [field('Identyfikator konta Cloudflare', account, 'Panel Cloudflare → R2 → po prawej „Account ID”. Endpoint uzupełni się sam.'),
      el('label', { class: 'row small' }, el('span', { class: 'switch' }, eu, el('span')), 'Bucket w jurysdykcji UE')],
    b2: [field('Region', region, 'Z adresu „Endpoint” przy buckecie w Backblaze, np. s3.eu-central-003.backblazeb2.com.')],
    s3: [field('Region', s3region)],
  };
  const bucketFields = el('div', { class: 'st-fields' });
  const localFields = el('div', { class: 'st-fields' }, b?.builtin
    ? el('p', { class: 'muted small', textContent: `Foldery z MEDIA_DIR i CLOUD_DIR: ${b.dir}` })
    : field('Folder na serwerze', dir, 'Pełna ścieżka; usługa musi mieć do niego zapis (ReadWritePaths w slashclient.service).'));
  const show = () => {
    const t = type.value;
    localFields.classList.toggle('hidden', t !== 'local');
    bucketFields.classList.toggle('hidden', t === 'local');
    bucketFields.replaceChildren(...(sections[t] ?? []),
      field('Endpoint', endpoint, t === 'r2' ? 'https://<konto>.r2.cloudflarestorage.com' : t === 'b2' ? 'https://s3.<region>.backblazeb2.com' : 'adres S3 tego dostawcy'),
      field('Bucket', bucket), field('Prefiks kluczy', prefix, 'Pliki trafią do <prefiks>media/… i <prefiks>cloud/…'),
      field('Identyfikator klucza', keyId), field('Sekret klucza', secret, 'Trafia na serwer zaszyfrowany i nie da się go już odczytać w panelu.'),
      el('label', { class: 'row small' }, el('span', { class: 'switch' }, pathStyle, el('span')), 'Adresy w stylu ścieżki (bucket w ścieżce, zalecane)'));
    if (t === 'b2' && !endpoint.value) b2Endpoint();
  };
  type.addEventListener('change', () => { if (!editing) endpoint.value = ''; show(); });
  show();

  const form = () => {
    const t = type.value;
    const body = { type: t, name: name.value.trim(), enabled: enabled.checked, priority: Number(priority.value) || 0,
      capacity: capacity.value.trim() ? Math.round(Number(capacity.value) * GB) : 0 };
    if (t === 'local') { if (!b?.builtin) body.dir = dir.value.trim(); } else {
      Object.assign(body, { endpoint: endpoint.value.trim(), bucket: bucket.value.trim(), prefix: prefix.value.trim(), pathStyle: pathStyle.checked,
        region: t === 'r2' ? 'auto' : t === 'b2' ? region.value : s3region.value.trim() });
      if (keyId.value.trim()) body.keyId = keyId.value.trim();
      if (secret.value) body.secret = secret.value;
    }
    return body;
  };
  const testBtn = el('button', { type: 'button', onclick: () => runTest({ ...form(), ...(editing ? { id: b.id } : {}) }, testBtn) }, icon('fa-solid fa-plug-circle-check'), 'Test połączenia');
  const save = el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-check'), editing ? 'Zapisz' : 'Dodaj');

  const drawer = el('aside', { class: 'glass drawer' },
    el('div', { class: 'row' }, el('h2', { class: 'grow', textContent: editing ? `Edytuj: ${b.name}` : 'Nowe miejsce na pliki' }),
      el('button', { class: 'icon-btn', title: 'Zamknij', onclick: closeForm }, icon('fa-solid fa-xmark'))),
    el('form', { class: 'st-form', onsubmit: async (e) => {
      e.preventDefault();
      save.disabled = true;
      const r = await call('POST', editing ? `/v1/admin/storage/${b.id}` : '/v1/admin/storage', form());
      save.disabled = false;
      if (!r) return;
      toast(editing ? 'Zapisano.' : 'Dodano. Nowe pliki trafią tu według priorytetu.');
      closeForm();
      storagePage();
    } },
    field('Rodzaj', type, editing && b.files > 0 ? 'W tym miejscu są pliki, więc rodzaju, bucketu ani prefiksu nie można zmienić.' : ''),
    field('Nazwa', name),
    localFields, bucketFields,
    field('Limit miejsca (GB)', capacity, 'Puste = bez limitu. Darmowe R2 i B2: 10 GB.'),
    field('Priorytet', priority, 'Niższy = wybierany pierwszy dla nowych plików. Dysk serwera ma domyślnie 100.'),
    el('label', { class: 'row small' }, el('span', { class: 'switch' }, enabled, el('span')), 'Włączone (przyjmuje nowe pliki)'),
    s.secretKey.set || type.value === 'local' ? '' : el('p', { class: 'small st-problem', textContent: ERRORS.storage_no_key }),
    el('div', { class: 'row' }, testBtn, el('div', { class: 'grow' }), save)));
  document.body.append(el('div', { class: 'shade', onclick: closeForm }), drawer);
  name.focus();
}
