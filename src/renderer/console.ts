import { getLang, setLang, t } from '../shared/i18n';
import { lineLevel } from './logLevel';

/**
 * "Okno konsoli": one profile's game log in a window of its own (main/consoleWindow.ts). It starts with
 * what the running game has written so far, follows it live, and keeps the lines once the game closes.
 */

const api = window.slash;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

interface ConsoleState { profileId: string; name: string; lines: string[]; running: boolean; exit?: { code: number | null; byUser: boolean } }

const profileId = new URLSearchParams(location.search).get('profile') ?? '';
const log = $('#log');
const MAX_LINES = 2000;
let query = '';
/** Stays at the newest line while on; scrolling up turns it off, back at the bottom on again. */
let follow = true;

function line(text: string) {
  const level = lineLevel(text);
  const div = document.createElement('div');
  div.className = `line${level ? ` lvl-${level}` : ''}`;
  div.textContent = text;
  if (query && !text.toLowerCase().includes(query)) div.classList.add('miss');
  return div;
}

function append(lines: string[]) {
  if (!lines.length) return;
  const part = document.createDocumentFragment();
  for (const text of lines.slice(-MAX_LINES)) part.append(line(text));
  log.append(part);
  while (log.childElementCount > MAX_LINES) log.firstElementChild?.remove();
  if (follow) log.scrollTop = log.scrollHeight;
}

function showFollow() {
  $('#follow').classList.toggle('on', follow);
}

function showState(state: ConsoleState) {
  document.title = state.name;
  const el = $('#state');
  const failed = !state.running && !!state.exit && state.exit.code !== 0 && !state.exit.byUser;
  el.className = `console-state${state.running ? ' running' : ''}${failed ? ' failed' : ''}`;
  el.textContent = state.running ? t('Gra działa')
    : !state.exit ? t('Gra nie działa')
    : failed ? t('Gra zakończyła się z kodem {0}', String(state.exit.code ?? '?'))
    : t('Gra zamknięta');
}

/** Static texts in the page's language (the launcher's setting). */
function texts() {
  $<HTMLInputElement>('#search').placeholder = t('Szukaj w logu…');
  const levels: Record<string, string> = { all: t('Wszystko'), warn: t('Ostrzeżenia'), error: t('Błędy') };
  document.querySelectorAll<HTMLButtonElement>('#level button').forEach((b) => (b.textContent = levels[b.dataset.level!]));
  $('#follow').title = t('Przewijaj do najnowszych linii');
  $('#pin').title = t('Zawsze na wierzchu');
  $('#copy').title = t('Kopiuj log');
  log.dataset.empty = t('Tu pojawią się logi gry.');
}

async function start() {
  const store = await api.getStore().catch(() => undefined);
  setLang(store?.settings?.language ?? '');
  document.documentElement.lang = getLang();
  texts();
  showFollow();
  // what the game wrote before the window opened, then the rest as it comes
  api.on('game:logBatch', ({ profileId: id, lines }: { profileId: string; lines: string[] }) => {
    if (id === profileId) append(lines);
  });
  api.on('console:state', (state: ConsoleState) => {
    if (state.profileId !== profileId) return;
    // the profile's next game: the window starts over
    if (state.running && !state.lines.length) log.replaceChildren();
    showState(state);
  });
  const state: ConsoleState = await api.consoleLive(profileId);
  showState(state);
  log.replaceChildren();
  append(state.lines);
}

$<HTMLInputElement>('#search').addEventListener('input', (e) => {
  query = (e.target as HTMLInputElement).value.trim().toLowerCase();
  for (const l of log.children) l.classList.toggle('miss', Boolean(query) && !(l.textContent ?? '').toLowerCase().includes(query));
});
document.querySelectorAll<HTMLButtonElement>('#level button').forEach((b) =>
  b.addEventListener('click', () => {
    log.dataset.level = b.dataset.level;
    document.querySelectorAll('#level button').forEach((x) => x.classList.toggle('active', x === b));
  }));
log.addEventListener('scroll', () => {
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
  if (atBottom !== follow) {
    follow = atBottom;
    showFollow();
  }
});
$('#follow').addEventListener('click', () => {
  follow = true;
  log.scrollTop = log.scrollHeight;
  showFollow();
});
let pinned = false;
$('#pin').addEventListener('click', async () => {
  pinned = await api.pinConsoleWindow(!pinned).catch(() => pinned);
  $('#pin').classList.toggle('on', pinned);
});
$('#copy').addEventListener('click', async () => {
  // what the filter shows, or everything when nothing is filtered
  const shown = [...log.children].filter((l) => getComputedStyle(l).display !== 'none' && !l.classList.contains('miss'));
  await navigator.clipboard.writeText(shown.map((l) => l.textContent).join('\n'));
  const b = $('#copy');
  b.classList.add('on');
  setTimeout(() => b.classList.remove('on'), 900);
});

void start();
