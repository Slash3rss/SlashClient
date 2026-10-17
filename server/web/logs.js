// A shared log (/logi/<id>): numbered lines, errors and warnings coloured, search, a link to a line.
import { $, api, el, errorText, fmtDate, toast, token } from './common.js';

const id = location.pathname.split('/')[2] ?? '';
const CHUNK = 3000;
let lines = [];
let shown = CHUNK;

function kind(line) {
  if (/\b(ERROR|FATAL|SEVERE)\b|Exception|Error:|Caused by:/.test(line)) return 'error';
  if (/^\s+at |^\s+\.\.\. \d+ more/.test(line)) return 'trace';
  if (/\bWARN(ING)?\b/.test(line)) return 'warn';
  return '';
}

function lineEl(text, n, query) {
  const num = el('span', { class: 'n' }, el('a', { href: `#L${n}`, textContent: String(n) }));
  const body = el('span');
  if (query) {
    const low = text.toLowerCase();
    let at = 0;
    for (let i = low.indexOf(query); i >= 0; i = low.indexOf(query, at)) {
      body.append(text.slice(at, i), el('mark', { textContent: text.slice(i, i + query.length) }));
      at = i + query.length;
    }
    body.append(text.slice(at));
  } else body.textContent = text || ' ';
  return el('div', { class: `log-line ${kind(text)}${location.hash === `#L${n}` ? ' target' : ''}`, id: `L${n}` }, num, body);
}

function render() {
  const query = $('#log-search').value.trim().toLowerCase();
  const problems = $('#log-problems').checked;
  const box = $('#log');
  const frag = document.createDocumentFragment();
  let count = 0, total = 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (query && !text.toLowerCase().includes(query)) continue;
    if (problems && !kind(text)) continue;
    total++;
    if (count >= shown) continue;
    frag.append(lineEl(text, i + 1, query));
    count++;
  }
  box.replaceChildren(frag);
  if (!total) box.append(el('p', { class: 'muted log-more', textContent: 'Nic nie pasuje.' }));
  if (total > count) {
    box.append(el('div', { class: 'log-more' }, el('button', { type: 'button', onclick: () => { shown += CHUNK; render(); } },
      `Pokaż więcej (${total - count} linii)`)));
  }
}

async function load() {
  try {
    const log = await api('GET', `/v1/logs/${encodeURIComponent(id)}`);
    lines = log.text.replace(/\r/g, '').split('\n');
    const errors = lines.filter((l) => kind(l) === 'error').length;
    $('#log-title').textContent = /Minecraft|Fabric|LWJGL/.test(log.text.slice(0, 4000)) ? 'Log gry' : 'Log';
    $('#log-meta').textContent = `${log.lines} linii · ${(log.size / 1024).toFixed(0)} KB · wysłany ${fmtDate(log.createdAt)} · zniknie ${fmtDate(log.expiresAt)}${errors ? ` · błędów: ${errors}` : ''}`;
    $('#log-report').href = `/zgloszenia?nowe=1&log=${encodeURIComponent(id)}`;
    // a link to a line opens far enough to show it
    const target = Number(/^#L(\d+)$/.exec(location.hash)?.[1] ?? 0);
    if (target > shown) shown = target + 200;
    render();
    if (target) document.getElementById(`L${target}`)?.scrollIntoView({ block: 'center' });
    $('#log-download').onclick = () => {
      const a = el('a', { href: URL.createObjectURL(new Blob([log.text], { type: 'text/plain' })), download: `slashclient-${id}.log` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
  } catch (err) {
    $('#log-meta').textContent = err.code === 'not_found' ? 'Tego logu nie ma: link jest zły albo log już wygasł (logi są trzymane 90 dni).' : errorText(err);
    document.querySelector('.log-tools').classList.add('hidden');
    $('#log').classList.add('hidden');
  }
}

let timer;
$('#log-search').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => { shown = CHUNK; render(); }, 200);
});
$('#log-problems').addEventListener('change', () => { shown = CHUNK; render(); });
$('#log-copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href.split('#')[0]).catch(() => {});
  toast('Skopiowano link');
});
window.addEventListener('hashchange', () => {
  document.querySelectorAll('.log-line.target').forEach((n) => n.classList.remove('target'));
  document.getElementById(location.hash.slice(1))?.classList.add('target');
});
load();
// the header shows who is signed in, like on the other pages
if (token.get()) {
  api('GET', '/v1/me').then((me) => {
    $('#nav-account .label').textContent = me.name;
    $('#nav-admin').classList.toggle('hidden', !me.admin);
  }).catch(() => {});
}
