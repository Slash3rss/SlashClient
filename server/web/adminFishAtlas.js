// The admin panel's "Atlas ryb": the SkyUp fish atlases the game sends, put together (players see
// nothing of it). A table of every species, sortable by any column, and a species in detail on a
// click: sizes and qualities with their average price, weights, the hours fish are caught (Warsaw
// time), the heaviest catches and the best players. The switch and limits are in Ustawienia → Atlas ryb.
import { $, api, el, fmtDate, guard, icon } from './common.js';

const nf = (n, digits = 0) => (n == null ? '—' : Number(n).toLocaleString('pl-PL', { maximumFractionDigits: digits }));
const grams = (g) => (g == null ? '—' : g >= 1000 ? `${nf(g / 1000, 2)} kg` : `${nf(g)} g`);
const price = (p) => (p == null || p < 0 ? '—' : `${nf(p, 2)} SC`);
const who = (handle) => (handle ? el('a', { href: `/u/${encodeURIComponent(handle)}`, target: '_blank', textContent: `@${handle}` }) : '');

const COLUMNS = [
  { id: 'name', label: 'Gatunek', value: (s) => s.name },
  { id: 'players', label: 'Graczy', value: (s) => s.players, show: (s) => nf(s.players) },
  { id: 'caught', label: 'Złowiono', value: (s) => s.caught, show: (s) => nf(s.caught) },
  { id: 'catches', label: 'Połowów', title: 'Pojedyncze połowy zapisane z gry (od kiedy atlas je zbiera)', value: (s) => s.catches, show: (s) => nf(s.catches) },
  { id: 'recordGrams', label: 'Rekord wagi', value: (s) => s.recordGrams, show: (s) => el('span', {}, grams(s.recordGrams), ' ', el('span', { class: 'muted small' }, who(s.recordGramsBy))) },
  { id: 'recordPrice', label: 'Rekord ceny', value: (s) => s.recordPrice, show: (s) => el('span', {}, price(s.recordPrice), ' ', el('span', { class: 'muted small' }, who(s.recordPriceBy))) },
  { id: 'maxGrams', label: 'Maks. waga', title: 'Największa waga gatunku według SkyUp', value: (s) => s.maxGrams, show: (s) => grams(s.maxGrams) },
  { id: 'avgGrams', label: 'Śr. waga', value: (s) => s.avgGrams ?? -1, show: (s) => grams(s.avgGrams) },
  { id: 'avgPrice', label: 'Śr. cena', value: (s) => s.avgPrice ?? -1, show: (s) => price(s.avgPrice) },
  { id: 'at', label: 'Ostatnio', value: (s) => s.at, show: (s) => el('span', { class: 'small muted', textContent: fmtDate(s.at) }) },
];

let data;
let sort = { id: 'caught', desc: true };

export async function fishAtlasPage() {
  data = await guard(() => api('GET', '/v1/admin/fish-atlas'));
  if (!data) return;
  drawList();
}

function drawList() {
  const col = COLUMNS.find((c) => c.id === sort.id) ?? COLUMNS[0];
  const list = [...data.species].sort((a, b) => {
    const x = col.value(a), y = col.value(b);
    const d = typeof x === 'string' ? x.localeCompare(y, 'pl') : x - y;
    return (sort.desc ? -d : d) || a.name.localeCompare(b.name, 'pl');
  });
  const head = COLUMNS.map((c) => el('th', {
    class: 'fish-sort', title: c.title ?? 'Sortuj', onclick: () => {
      sort = { id: c.id, desc: sort.id === c.id ? !sort.desc : c.id !== 'name' };
      drawList();
    },
  }, c.label, sort.id === c.id ? icon(`fa-solid fa-caret-${sort.desc ? 'down' : 'up'}`) : ''));
  const rows = list.map((s) => el('tr', { class: 'fish-row', title: s.facts.length ? s.facts[0].fact : '', onclick: () => species(s.key) },
    ...COLUMNS.map((c) => el('td', {}, c.show ? c.show(s) : el('b', { textContent: s.name })))));
  const total = data.species.reduce((n, s) => n + s.caught, 0);
  const catches = data.species.reduce((n, s) => n + s.catches, 0);
  const caughtSpecies = data.species.filter((s) => s.players).length;

  $('#main').replaceChildren(el('div', { class: 'dash' },
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Atlas ryb' }),
      el('button', { type: 'button', onclick: fishAtlasPage }, icon('fa-solid fa-rotate'), 'Odśwież')),
    el('p', { class: 'muted', textContent: 'Atlasy ryb SkyUp z gry (26.3) wszystkich graczy razem: rekordy z okna „Moje okazy” i pojedyncze połowy. Gracze tego nie widzą. Wyłącznik i limity są w Ustawienia → Atlas ryb. Kliknij gatunek, żeby zobaczyć szczegóły.' }),
    data.enabled ? '' : el('div', { class: 'glass card st-warn' }, icon('fa-solid fa-power-off'), el('div', {}, el('b', { textContent: 'Zbieranie atlasu ryb jest wyłączone' }), el('p', { class: 'muted small', textContent: 'Gra nic nie wysyła; zebrane dane zostają.' }))),
    el('div', { class: 'stats' },
      tile('fa-solid fa-fish', 'Gatunki', nf(data.species.length), `złowione: ${nf(caughtSpecies)}`),
      tile('fa-solid fa-hashtag', 'Złowiono razem', nf(total)),
      tile('fa-solid fa-list', 'Zapisane połowy', nf(catches))),
    list.length ? el('div', { class: 'glass card scroll-x' }, el('table', { class: 'fish-table' }, el('thead', {}, el('tr', {}, ...head)), el('tbody', {}, ...rows)))
      : el('p', { class: 'muted', textContent: 'Nikt jeszcze nie wysłał atlasu.' })));
}

function tile(cls, label, value, note) {
  return el('div', { class: 'glass stat' }, el('small', {}, icon(cls), label), el('b', { textContent: value }), note ? el('em', { textContent: note }) : '');
}

/** Bars of named counts, with the average price next to each. */
function splitCard(title, entries) {
  const top = Math.max(1, ...entries.map((e) => e.count));
  return el('div', { class: 'glass card' }, el('h3', { textContent: title }), el('div', { class: 'dash-bars' }, ...(entries.length ? entries.map((e) => {
    const fill = el('div');
    fill.style.width = `${(e.count / top) * 100}%`;
    return el('div', { class: 'dash-bar' }, el('span', { class: 'dash-name', textContent: e.value || '(brak)' }), el('div', { class: 'track' }, fill),
      el('b', { textContent: `${nf(e.count)} · ${price(e.avgPrice)}`, title: 'Połowów · średnia cena' }));
  }) : [el('p', { class: 'muted small', textContent: 'Brak połowów.' })])));
}

function chartCard(title, values, labels, first, last, note) {
  const max = Math.max(1, ...values);
  return el('div', { class: 'glass card dash-chart' },
    el('div', { class: 'dash-chart-head' }, el('h3', { textContent: title }), el('span', { class: 'muted small', textContent: note })),
    el('div', { class: 'chart' }, ...values.map((n, i) => {
      const bar = el('div', { title: `${labels[i]}: ${nf(n)}`, dataset: { n: String(n) } });
      bar.style.height = `${Math.max(4, (n / max) * 100)}%`;
      return bar;
    })),
    el('div', { class: 'dash-axis muted' }, el('span', { textContent: first }), el('span', { textContent: last })));
}

async function species(key) {
  const d = await guard(() => api('GET', `/v1/admin/fish-atlas/${encodeURIComponent(key)}`));
  if (!d) return;
  const s = data.species.find((x) => x.key === key);
  const table = (heads, rows) => el('div', { class: 'glass card scroll-x' }, el('table', {}, el('thead', {}, el('tr', {}, ...heads.map((h) => el('th', { textContent: h })))), el('tbody', {}, ...rows)));
  const heaviest = d.heaviest.map((c, i) => el('tr', {}, el('td', { textContent: `${i + 1}.` }), el('td', {}, el('b', { textContent: grams(c.grams) })),
    el('td', { textContent: c.size || '—' }), el('td', { textContent: c.quality || '—' }), el('td', { textContent: price(c.price) }), el('td', {}, who(c.handle)), el('td', { class: 'small muted', textContent: fmtDate(c.at) })));
  const players = d.players.map((p, i) => el('tr', {}, el('td', { textContent: `${i + 1}.` }), el('td', {}, who(p.handle)), el('td', { textContent: nf(p.caught) }),
    el('td', { textContent: nf(p.catches) }), el('td', { textContent: grams(p.recordGrams) }), el('td', { textContent: price(p.recordPrice) }), el('td', { class: 'small muted', textContent: fmtDate(p.at) })));

  $('#main').replaceChildren(el('div', { class: 'dash' },
    el('div', { class: 'page-head' },
      el('button', { type: 'button', onclick: drawList }, icon('fa-solid fa-arrow-left'), 'Wszystkie gatunki'),
      el('h1', { class: 'grow', textContent: d.name })),
    s ? el('div', { class: 'stats' },
      tile('fa-solid fa-users', 'Graczy', nf(s.players)),
      tile('fa-solid fa-hashtag', 'Złowiono', nf(s.caught), `zapisanych połowów: ${nf(d.catches)}`),
      tile('fa-solid fa-weight-hanging', 'Rekord wagi', grams(s.recordGrams), s.recordGramsBy ? `@${s.recordGramsBy}` : ''),
      tile('fa-solid fa-coins', 'Rekord ceny', price(s.recordPrice), s.recordPriceBy ? `@${s.recordPriceBy}` : ''),
      tile('fa-solid fa-scale-balanced', 'Średnio', grams(s.avgGrams), `${price(s.avgPrice)} · maks. ${grams(s.maxGrams)}`)) : '',
    s?.facts.length ? el('div', { class: 'glass card' }, el('h3', { textContent: 'Ciekawostki' }),
      ...s.facts.map((f) => el('p', { class: 'small' }, f.fact, el('span', { class: 'muted', textContent: `  · u ${nf(f.count)} ${f.count === 1 ? 'gracza' : 'graczy'}` })))) : '',
    el('div', { class: 'dash-grid', style: 'margin-top:16px' }, splitCard('Rozmiar', d.sizes), splitCard('Jakość', d.qualities)),
    el('div', { class: 'dash-grid charts' },
      chartCard('Waga', d.weights.map((w) => w.count), d.weights.map((w) => `${grams(w.from)} – ${grams(w.to)}`), grams(0), grams(d.weights.at(-1)?.to ?? 0), `połowów: ${nf(d.catches)}`),
      chartCard('Godzina połowu (czas polski)', d.hours, d.hours.map((_, h) => `${h}:00`), '0:00', '23:00', `najwięcej o ${d.hours.indexOf(Math.max(...d.hours))}:00`)),
    el('h2', { class: 'sup-h', textContent: 'Najcięższe połowy' }),
    heaviest.length ? table(['', 'Waga', 'Rozmiar', 'Jakość', 'Cena', 'Gracz', 'Kiedy'], heaviest) : el('p', { class: 'muted', textContent: 'Brak zapisanych połowów.' }),
    el('h2', { class: 'sup-h', textContent: 'Najlepsi gracze' }),
    players.length ? table(['', 'Gracz', 'Złowiono', 'Połowów', 'Rekord wagi', 'Rekord ceny', 'Aktualizacja'], players) : el('p', { class: 'muted', textContent: 'Nikt jeszcze nie złowił.' })));
  window.scrollTo(0, 0);
}
