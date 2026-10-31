// A shared benchmark result (/benchmark/<id>): the FPS, the test scene's parts, the computer and the game's settings.
import { $, L, api, copyText, el, errorText, fmtDate, icon, localizePage } from './common.js';

localizePage();

const id = location.pathname.split('/')[2] ?? '';
const SCENES = {
  forest: ['Las', 'Forest'], panorama: ['Panorama', 'Panorama'], village: ['Wioska', 'Village'], water: ['Woda', 'Water'],
  entities: ['Stworzenia', 'Entities'], particles: ['Cząsteczki', 'Particles'], night: ['Noc', 'Night'],
};
const n = (v) => String(Math.round(v));
// "NVIDIA GeForce RTX 3070" as "RTX 3070", "AMD Ryzen 7 5800X 8-Core Processor" as "Ryzen 7 5800X" (as the preview's line, benchmarkShares.ts)
const short = (s) => (s ?? '').replace(/^(NVIDIA|AMD|Intel|Apple)\s+/i, '').replace(/^GeForce\s+/i, '')
  .replace(/\s+\d+-Core Processor$/i, '').replace(/\s+(CPU\s+)?@.*$/, '').replace(/\s+Processor$/i, '').trim();

function stat(value, label, big = false) {
  return el('div', { class: `bench-stat${big ? ' big' : ''}` }, el('b', { textContent: value }), el('span', { class: 'muted small', textContent: label }));
}

function rows(title, faIcon, list) {
  const shown = list.filter(([, v]) => v);
  if (!shown.length) return '';
  return el('div', { class: 'glass bench-card' }, el('h3', {}, icon(faIcon), ` ${title}`),
    el('dl', { class: 'bench-rows' }, ...shown.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })])));
}

function scenes(r) {
  if (!r.scenes?.length) return '';
  const max = Math.max(1, ...r.scenes.map((s) => s.avg));
  return el('div', { class: 'glass bench-card wide' }, el('h3', {}, icon('fa-solid fa-film'), ` ${L('Sceny: FPS średnio · 1% low', 'Scenes: FPS average · 1% low')}`),
    ...r.scenes.map((s) => {
      const bar = el('div', { class: 'bench-bar' }, el('div'), el('div', { class: 'low' }));
      bar.children[0].style.width = `${Math.max(2, (s.avg / max) * 100).toFixed(1)}%`;
      bar.children[1].style.width = `${Math.max(1, (Math.min(s.low1, s.avg) / max) * 100).toFixed(1)}%`;
      return el('div', { class: 'bench-scene' }, el('span', { textContent: L(...(SCENES[s.id] ?? [s.id, s.id])) }), bar, el('span', { class: 'bench-num', textContent: `${n(s.avg)} · ${n(s.low1)}` }));
    }));
}

async function load() {
  try {
    const { run: r, expiresAt } = await api('GET', `/v1/benchmarks/${encodeURIComponent(id)}`);
    const d = r.device ?? {}, s = r.settings;
    $('#bench-kind').textContent = r.kind === 'scene' ? L('Benchmark · scena testowa', 'Benchmark · test scene') : L('Benchmark · własny świat', 'Benchmark · own world');
    $('#bench-title').textContent = [short(d.gpu), short(d.cpu)].filter(Boolean).join(' + ') || `Minecraft ${r.version}`;
    $('#bench-meta').textContent = L(`Zmierzony ${fmtDate(r.at)} · link działa do ${fmtDate(expiresAt)}`, `Measured ${fmtDate(r.at)} · the link works until ${fmtDate(expiresAt)}`);
    const fps = el('div', { class: 'glass bench-card wide bench-fps' },
      stat(n(r.fps.avg), L('FPS średnio', 'FPS average'), true), stat(n(r.fps.low1), '1% low'), stat(n(r.fps.low01), L('0,1% low', '0.1% low')),
      stat(String(r.stutters), L('przycięcia', 'stutters')),
      r.cpuUse !== undefined ? stat(`${n(r.cpuUse)}%`, 'CPU') : '', r.gpuUse !== undefined ? stat(`${n(r.gpuUse)}%`, 'GPU') : '');
    const ram = [d.ramGb ? `${d.ramGb} GB` : '', s.memoryMb ? L(`dla gry ${+(s.memoryMb / 1024).toFixed(1)} GB`, `${+(s.memoryMb / 1024).toFixed(1)} GB for the game`) : ''].filter(Boolean).join(', ');
    $('#bench-view').replaceChildren(fps, scenes(r),
      rows(L('Komputer', 'Computer'), 'fa-solid fa-microchip', [
        [L('Procesor', 'Processor'), d.cpu ? `${d.cpu}${d.threads ? L(` (${d.threads} wątków)`, ` (${d.threads} threads)`) : ''}` : ''],
        [L('Karta graficzna', 'Graphics card'), d.gpu], ['RAM', ram], ['System', d.os], ['Java', d.java],
      ]),
      rows(L('Gra', 'Game'), 'fa-solid fa-cube', [
        ['Minecraft', r.version], [L('Zasięg renderowania', 'Render distance'), String(s.renderDistance)],
        [L('Rozdzielczość', 'Resolution'), s.width && s.height ? `${s.width}×${s.height}${s.fullscreen ? L(', pełny ekran', ', full screen') : ''}` : ''],
        ['VSync', s.vsync ? L('włączony', 'on') : L('wyłączony', 'off')], [L('Mody', 'Mods'), String(s.mods)],
      ]));
    $('#bench-view').classList.remove('hidden');
    $('#bench-tools').classList.remove('hidden');
  } catch (err) {
    $('#bench-title').textContent = L('Nie znaleziono', 'Not found');
    $('#bench-meta').textContent = err.code === 'not_found' ? L('Tego wyniku nie ma: link jest zły albo już wygasł.', 'This result is not here: the link is wrong or has expired.') : errorText(err);
  }
}

$('#bench-copy').addEventListener('click', () => copyText(location.href.split('#')[0], L('Skopiowano link', 'Link copied')));
load();
