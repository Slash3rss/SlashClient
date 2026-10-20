// The admin panel's "Statusy z listy graczy" (under Partnerzy): per server, how SlashClient HUD reads
// the text over and under the tab list (a line, a regex with named groups, a table of names) into the
// short status friends see ("Gra na SkyUp.pl · S3 (Wyspy)"), and what Discord shows there. The
// server checks every pattern (both the game's Java and JavaScript must read it alike, and nothing
// that backtracks for long); "Sprawdź" runs a rule against a pasted header. Changes go to the log.
import { api, el, errorText, icon, toast } from './common.js';

const ERRORS = {
  bad_server: 'Zły adres serwera (np. skyup.pl).', bad_name: 'Nazwa do 48 znaków.', bad_strip: 'Znaki do obcięcia: do 16.',
  bad_extractors: 'Od 1 do 6 odczytów.', bad_source: 'Źródło: nagłówek albo stopka.', bad_line: 'Linia od 0 (cały tekst) do 20.',
  bad_pattern: 'Wzorzec się nie kompiluje albo używa czegoś, czego gra nie odczyta tak samo.', bad_pattern_length: 'Wzorzec: od 1 do 200 znaków.',
  bad_pattern_escape: 'Dozwolone są tylko \\d \\w \\s \\b (i wielkie), \\n \\t, \\uXXXX i znaki interpunkcyjne po \\.',
  bad_pattern_group: 'Grupy: (?: (?= (?! (?<= (?<! i (?<nazwa> (litery i cyfry, bez powtórzeń nazw).',
  bad_pattern_class: 'Zbiór znaków bez zagnieżdżonych [ ] i bez &&.', bad_pattern_brace: 'Zły kwantyfikator {n,m}.',
  bad_pattern_nested: 'Wzorzec mógłby długo się wykonywać: powtarzana grupa z kwantyfikatorem lub | w środku, albo więcej niż 3 * + {n,}.',
  bad_pattern_no_group: 'Każdy odczyt potrzebuje grupy z nazwą, np. (?<sector>…).',
  bad_map: 'Tabela nazw: do 50 par, każda strona do 40 znaków.', bad_template: 'Szablon (do 64 znaków) z co najmniej jednym {nazwa} z grup odczytów.',
  bad_discord: 'Zły opis Discorda.', bad_discord_text: 'Teksty Discorda do 128 znaków; w szablonach tylko {server}, {detail} i nazwy grup.',
  bad_image: 'Obrazek: adres https (do 256 znaków) albo klucz zasobu aplikacji Discord.', exists: 'Ten serwer ma już regułę.',
};
const fail = (err) => toast(ERRORS[err?.code] ?? errorText(err), true);
const call = (...args) => api(...args).catch((err) => { fail(err); return undefined; });

const EMPTY = { server: '', name: '', enabled: true, strip: '»« ', extractors: [{ source: 'header', line: 1, pattern: '' }], map: {}, template: '', discord: {} };
const SAMPLE = '§8» §b§lSkyUP §7- §fAnyBlock §8«\n§8» §eS3 (Wyspy) §8«';

let data;
let box;

/** The section, filled once the rules come. */
export function statusRulesSection() {
  box = el('section', { class: 'status-rules' });
  load();
  return box;
}

async function load() {
  data = await call('GET', '/v1/admin/status-rules');
  if (data) draw();
}

const field = (label, input, hint) => el('label', { class: 'st-field' }, el('span', { textContent: label }), input, hint ? el('small', { class: 'muted', textContent: hint }) : '');
const text = (value, placeholder, max) => el('input', { type: 'text', value: value ?? '', placeholder: placeholder ?? '', maxLength: max ?? 256 });

function draw() {
  const add = el('button', { type: 'button', onclick: () => box.querySelector('.sr-list').prepend(card(EMPTY)) }, icon('fa-solid fa-plus'), 'Nowa reguła');
  box.replaceChildren(
    el('div', { class: 'row' }, el('h2', { class: 'grow sup-h', textContent: 'Statusy z listy graczy (Tab)' }), add),
    el('p', { class: 'muted', textContent: 'Mod czyta tekst nad i pod listą graczy serwera i robi z niego krótki status, który znajomi widzą obok serwera (launcher i okno znajomych w grze), np. „Gra na SkyUp.pl · S3 (Wyspy)”. Tylko u graczy, którzy pokazują znajomym serwer. Kody kolorów (§) są usuwane, linie przycinane ze znaków z pola „Obcinaj” i spacji. Wzorzec to wyrażenie regularne z grupami z nazwą, np. (?<sector>…); wartości można przemianować w tabeli nazw; szablon składa status z grup. Reguła działa też na subdomenach (play.skyup.pl).' }),
    defaultsCard(),
    el('div', { class: 'sr-list partner-list' }, ...(data.rules.length ? data.rules.map(card) : [el('p', { class: 'muted', textContent: 'Nie ma jeszcze reguł.' })])));
}

function defaultsCard() {
  const d = data.defaults;
  const largeImage = text(d.largeImage, 'https://… albo klucz, np. logo'), largeText = text(d.largeText, 'SlashClient', 128);
  const smallImage = text(d.smallImage, 'https://… (opcjonalnie)'), smallText = text(d.smallText, '', 128);
  return el('div', { class: 'glass card' },
    el('h3', { textContent: 'Discord: domyślny wygląd' }),
    el('p', { class: 'muted small', textContent: 'Obrazki w Rich Presence, gdy żadna reguła nie pasuje do serwera (albo reguła nie ma własnych). Puste: logo SlashClient. Obrazek to adres https (Discord pokazuje obrazki z zewnątrz) albo klucz zasobu z aplikacji Discord.' }),
    el('div', { class: 'sr-grid' }, field('Duży obrazek', largeImage), field('Tekst dużego obrazka', largeText), field('Mały obrazek', smallImage), field('Tekst małego obrazka', smallText)),
    el('button', { type: 'button', class: 'primary', onclick: async () => {
      const res = await call('POST', '/v1/admin/status-defaults', { largeImage: largeImage.value, largeText: largeText.value, smallImage: smallImage.value, smallText: smallText.value });
      if (res) { data = res; toast('Zapisano.'); draw(); }
    } }, icon('fa-solid fa-check'), 'Zapisz'));
}

function card(r) {
  const server = text(r.server, 'skyup.pl', 253), name = text(r.name, 'SkyUp.pl', 48), strip = text(r.strip, '»« ', 16), template = text(r.template, '{sector}', 64);
  const enabled = el('input', { type: 'checkbox', checked: r.enabled !== false });
  const rows = el('div', { class: 'sr-extractors' });
  const extractorRow = (x) => {
    const source = el('select', {}, el('option', { value: 'header', textContent: 'Nagłówek' }), el('option', { value: 'footer', textContent: 'Stopka' }));
    source.value = x.source;
    const line = el('input', { type: 'number', min: 0, max: 20, value: x.line ?? 1, title: 'Linia (0: cały tekst)', class: 'sr-line' });
    const pattern = el('input', { type: 'text', value: x.pattern ?? '', placeholder: '^(?<sector>S\\d{1,2}(?: \\([^()]{1,24}\\))?)$', maxLength: 200, class: 'grow sr-pattern', spellcheck: false });
    const row = el('div', { class: 'row sr-extractor' }, source, line, pattern, el('button', { type: 'button', class: 'icon-btn danger', title: 'Usuń odczyt', onclick: () => row.remove() }, icon('fa-solid fa-xmark')));
    row.read = () => ({ source: source.value, line: Number(line.value), pattern: pattern.value });
    return row;
  };
  for (const x of r.extractors) rows.append(extractorRow(x));
  const map = el('textarea', { rows: 3, placeholder: 'LOBBY = Lobby', value: Object.entries(r.map ?? {}).map(([k, v]) => `${k} = ${v}`).join('\n') });
  const d = r.discord ?? {};
  const details = text(d.details, 'Gra na {server}', 128), state = text(d.state, '{sector}', 128);
  const largeImage = text(d.largeImage, 'https://…/logo.png'), largeText = text(d.largeText, 'SkyUp.pl', 128), smallImage = text(d.smallImage, ''), smallText = text(d.smallText, '', 128);

  const read = () => ({
    server: server.value, name: name.value, enabled: enabled.checked, strip: strip.value, template: template.value,
    extractors: [...rows.children].map((row) => row.read()),
    map: map.value.split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2 && p[0].trim()).map(([k, ...v]) => [k.trim(), v.join('=').trim()]),
    discord: { details: details.value, state: state.value, largeImage: largeImage.value, largeText: largeText.value, smallImage: smallImage.value, smallText: smallText.value },
  });

  const header = el('textarea', { rows: 2, value: r.server === 'skyup.pl' || !r.id ? SAMPLE : '', placeholder: 'Nagłówek listy graczy (linie jak w grze, kody § mogą zostać)' });
  const footer = el('textarea', { rows: 2, placeholder: 'Stopka (opcjonalnie)' });
  const result = el('div', { class: 'small sr-result' });
  const preview = el('button', { type: 'button', onclick: async () => {
    const res = await call('POST', '/v1/admin/status-preview', { rule: read(), header: header.value, footer: footer.value });
    if (!res) return;
    const vals = Object.entries(res.values).map(([k, v]) => `${k} = ${v}`).join(', ') || 'nic';
    result.replaceChildren(
      el('div', {}, 'Status: ', el('b', { textContent: res.detail ?? '(brak — nic nie pasuje)' })),
      el('div', { class: 'muted', textContent: `Grupy: ${vals}` }),
      el('div', { class: 'muted', textContent: `Discord: ${res.discord.details || '(domyślnie)'} · ${res.discord.state || '(domyślnie)'}` }));
  } }, icon('fa-solid fa-flask'), 'Sprawdź');

  const save = el('button', { type: 'button', class: 'primary', onclick: async () => {
    const res = await call('POST', r.id ? `/v1/admin/status-rules/${r.id}` : '/v1/admin/status-rules', read());
    if (res) { data = res; toast('Zapisano.'); draw(); }
  } }, icon('fa-solid fa-check'), 'Zapisz');
  const remove = el('button', { type: 'button', class: 'danger', onclick: async () => {
    if (!r.id) return draw();
    if (!confirm(`Usunąć regułę statusów dla ${r.server}?`)) return;
    const res = await call('DELETE', `/v1/admin/status-rules/${r.id}`);
    if (res) { data = res; draw(); }
  } }, icon('fa-solid fa-trash-can'), r.id ? 'Usuń' : 'Anuluj');

  return el('div', { class: `glass card sr-card${r.enabled === false ? ' off' : ''}` },
    el('div', { class: 'row' }, el('h3', { class: 'grow', textContent: r.id ? (r.name || r.server) : 'Nowa reguła' }),
      el('label', { class: 'row small' }, el('span', { class: 'switch' }, enabled, el('span')), 'Włączona')),
    el('div', { class: 'sr-grid' }, field('Serwer', server, 'Z subdomenami.'), field('Nazwa u znajomych', name, '„Gra na …”; puste: adres.'), field('Obcinaj z brzegów linii', strip), field('Szablon statusu', template, 'np. {sector} albo {mode} · {sector}')),
    el('div', { class: 'st-field' }, el('span', { textContent: 'Odczyty (źródło, linia, wzorzec)' }), rows,
      el('button', { type: 'button', class: 'sr-add', onclick: () => rows.children.length < 6 && rows.append(extractorRow({ source: 'header', line: 1, pattern: '' })) }, icon('fa-solid fa-plus'), 'Odczyt')),
    field('Tabela nazw (jedna para na linię: z serwera = do pokazania)', map),
    el('h4', { textContent: 'Discord Rich Presence' }),
    el('div', { class: 'sr-grid' }, field('Górna linia (details)', details, '{server}, {detail}, grupy; puste: wersja gry'), field('Dolna linia (state)', state, 'puste: „Na serwerze …”'),
      field('Duży obrazek', largeImage, 'https://… albo klucz zasobu'), field('Tekst dużego obrazka', largeText), field('Mały obrazek', smallImage), field('Tekst małego obrazka', smallText)),
    el('details', { class: 'sr-preview' }, el('summary', { textContent: 'Sprawdź na przykładzie' }), header, footer, preview, result),
    el('div', { class: 'row' }, save, el('div', { class: 'grow' }), remove));
}
