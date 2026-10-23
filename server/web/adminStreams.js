// The admin panel's "Streamy": the Twitch and Kick apps (the Client Secret typed here goes to the
// server once, sealed with STORAGE_SECRET_KEY, and is never shown again), the addresses to paste in
// the platforms' consoles, every linked channel with its live state, unlinking one by force and
// asking the platforms right now. Intervals and limits are in Ustawienia → Streamy, the switch in
// Ustawienia → Funkcje. Every change goes to the log (Dziennik).
import { $, api, confirmModal, el, errorText, fmtDate, guard, icon, toast } from './common.js';
import { platformIcon } from './profileStream.js';

const ERRORS = {
  secret_key_missing: 'Serwer nie ma ustawionego STORAGE_SECRET_KEY, więc nie może bezpiecznie zapisać sekretu. Ustaw go i zrestartuj serwer.',
  bad_clientId: 'Zły Client ID (litery, cyfry, - i _).', bad_clientSecret: 'Zły Client Secret.',
  provider_not_configured: 'Najpierw wpisz Client ID i Client Secret.',
};
const fail = (err) => toast(ERRORS[err?.code] ?? errorText(err), true);
const call = (...args) => api(...args).catch((err) => { fail(err); return undefined; });

/** What each platform's developer console calls things, and what to set there. */
const INFO = {
  twitch: {
    console: 'https://dev.twitch.tv/console/apps', consoleName: 'dev.twitch.tv → Console → Applications',
    steps: 'Kategoria: Website Integration. OAuth Redirect URL: adres poniżej. Bez zakresów (scope): serwer pyta tylko, kim jest gracz, i od razu oddaje token. Webhooki EventSub serwer zakłada sam (stream.online, stream.offline, channel.update) na adres poniżej.',
  },
  kick: {
    console: 'https://kick.com/settings/developer', consoleName: 'kick.com → Settings → Developer',
    steps: 'Redirect URL: adres poniżej. Zakresy aplikacji: user:read i channel:read (serwer prosi tylko o nie, token oddaje od razu). Włącz webhooki i wpisz adres webhooka poniżej; serwer sam subskrybuje livestream.status.updated i livestream.metadata.updated dla połączonych kanałów.',
  },
};

let data;

export async function streamsPage() {
  data = await guard(() => api('GET', '/v1/admin/streams'));
  if (!data) return;
  draw();
}

function draw() {
  const copy = (text) => el('button', { type: 'button', class: 'icon-btn', title: 'Kopiuj', onclick: async () => { await navigator.clipboard.writeText(text).catch(() => {}); toast('Skopiowano.'); } }, icon('fa-regular fa-copy'));
  const address = (label, value) => el('div', { class: 'st-field' }, el('span', { textContent: label }), el('div', { class: 'row' }, el('code', { class: 'grow sup-code', textContent: value }), copy(value)));
  const reconcile = el('button', { type: 'button', onclick: async () => {
    reconcile.disabled = true;
    const res = await call('POST', '/v1/admin/streams/reconcile');
    reconcile.disabled = false;
    if (!res) return;
    data = res;
    const parts = Object.entries(res.result).map(([p, r]) => `${p}: ${r.checked}${r.ok ? '' : ` (${r.message})`}`);
    toast(parts.length ? `Sprawdzono kanały – ${parts.join(', ')}.` : 'Żadna platforma nie jest skonfigurowana.');
    draw();
  } }, icon('fa-solid fa-rotate'), 'Sprawdź teraz');

  const card = (p) => {
    const info = INFO[p.id];
    const enabled = el('input', { type: 'checkbox', checked: p.enabled });
    const clientId = el('input', { type: 'text', value: p.clientId, autocomplete: 'off', placeholder: 'Client ID' });
    const secret = el('input', { type: 'password', autocomplete: 'off', placeholder: p.secretSet ? `ustawiony (…${p.hint})` : 'nie ustawiony', title: p.secretSet ? 'Puste pole nie zmienia zapisanego sekretu.' : '' });
    const save = async (extra) => {
      const body = { enabled: enabled.checked, clientId: clientId.value.trim(), ...(secret.value.trim() ? { clientSecret: secret.value.trim() } : {}), ...extra };
      const res = await call('POST', `/v1/admin/streams/providers/${p.id}`, body);
      if (res) { data = res; toast('Zapisano.'); draw(); }
    };
    const result = el('p', { class: 'small muted' });
    const test = el('button', { type: 'button', onclick: async () => {
      result.textContent = 'Sprawdzam…';
      const res = await call('POST', `/v1/admin/streams/providers/${p.id}/test`);
      result.textContent = res ? (res.ok ? 'Połączenie działa (token aplikacji i jedno zapytanie).' : `Błąd: ${res.message}`) : '';
      result.style.color = res?.ok ? 'var(--green)' : '#fca5a5';
    } }, icon('fa-solid fa-plug-circle-check'), 'Test połączenia');
    const run = p.lastRun?.at ? `Ostatnie sprawdzenie: ${fmtDate(p.lastRun.at)} · kanałów ${p.lastRun.checked}${p.lastRun.ok ? '' : ` · ${p.lastRun.message}`}` : 'Jeszcze nie sprawdzano.';
    return el('div', { class: `glass card st-card${p.enabled ? '' : ' off'}` },
      el('div', { class: 'row' }, platformIcon(p.id), el('h3', { class: 'grow', textContent: p.name }),
        p.ready ? el('span', { class: 'chip green', textContent: 'działa' }) : el('span', { class: 'chip', textContent: p.enabled ? 'brak kluczy' : 'wyłączony' }),
        p.paused ? el('span', { class: 'chip gold', title: 'Platforma odpowiedziała 429: serwer czeka do podanego czasu.', textContent: 'limit zapytań' }) : ''),
      el('p', { class: 'muted small' }, 'Aplikacja: ', el('a', { href: info.console, target: '_blank', rel: 'noopener', textContent: info.consoleName }), `. ${info.steps}`),
      el('label', { class: 'row small' }, el('span', { class: 'switch' }, enabled, el('span')), 'Włączony (gracze mogą łączyć kanały)'),
      el('label', { class: 'st-field' }, el('span', { textContent: 'Client ID' }), clientId),
      el('label', { class: 'st-field' }, el('span', { textContent: 'Client Secret' }), el('div', { class: 'row' }, el('div', { class: 'grow' }, secret),
        p.secretSet ? el('button', { type: 'button', class: 'icon-btn', title: 'Usuń sekret', onclick: () => save({ clientSecret: null, enabled: false }) }, icon('fa-solid fa-eraser')) : '')),
      address('OAuth Redirect URL (wklej w konsoli)', p.redirectUrl),
      address(p.id === 'twitch' ? 'Adres EventSub (serwer podaje go sam)' : 'Adres webhooka (wklej w ustawieniach aplikacji)', p.webhookUrl),
      data.webhooksPossible ? '' : el('p', { class: 'small', style: 'color:#fbbf24', textContent: 'Adres serwera nie jest https: webhooki nie zadziałają, zostaje sprawdzanie co kilka minut.' }),
      el('p', { class: 'small muted', textContent: run }),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'primary', onclick: () => save() }, icon('fa-solid fa-check'), 'Zapisz'), test),
      result);
  };

  const rows = data.accounts.map((a) => el('tr', {},
    el('td', {}, el('a', { href: `/u/${encodeURIComponent(a.handle)}`, target: '_blank', textContent: a.handle ? `@${a.handle}` : a.uuid })),
    el('td', {}, platformIcon(a.platform), ' ', el('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer', textContent: a.login })),
    el('td', {}, a.live ? el('span', { class: 'chip red', title: a.title, textContent: `LIVE · ${a.viewers}` }) : el('span', { class: 'muted small', textContent: 'offline' })),
    el('td', { class: 'small muted', textContent: a.live ? a.title : '' }),
    el('td', { class: 'small muted', textContent: a.webhooks ? 'tak' : 'nie' }),
    el('td', { class: 'small muted', textContent: fmtDate(a.linkedAt) }),
    el('td', {}, el('button', { type: 'button', class: 'icon-btn danger', title: 'Odłącz kanał (w dzienniku)', onclick: async () => {
      if (!await confirmModal({ title: `Odłączyć kanał ${a.login} od @${a.handle}?`, text: 'Gracz może go połączyć ponownie.', ok: 'Odłącz', okIcon: 'fa-solid fa-link-slash', danger: true })) return;
      const res = await call('DELETE', `/v1/admin/streams/accounts/${a.uuid}/${a.platform}`);
      if (res) { data = res; toast('Odłączono.'); draw(); }
    } }, icon('fa-solid fa-link-slash')))));

  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Streamy' }), reconcile),
    el('p', { class: 'muted', textContent: 'Gracze łączą kanały Twitch i Kick (to nie jest sposób logowania). Znajomi widzą znaczek LIVE i dostają jedno powiadomienie na stream, profil pokazuje transmisję. Liczą się tylko streamy z grami z listy (domyślnie Minecraft); lista, częstotliwość sprawdzania, limity i czas bez ponownych powiadomień są w Ustawienia → Streamy, wyłącznik w Ustawienia → Funkcje.' }),
    data.enabled ? '' : el('div', { class: 'glass card st-warn' }, icon('fa-solid fa-power-off'), el('div', {}, el('b', { textContent: 'Funkcja „Streamy” jest wyłączona' }), el('p', { class: 'muted small', textContent: 'Webhooki są dalej przyjmowane, ale nic nie trafia do graczy.' }))),
    data.keyReady ? '' : el('div', { class: 'glass card st-warn' }, icon('fa-solid fa-triangle-exclamation'),
      el('div', {}, el('b', { textContent: 'Brak STORAGE_SECRET_KEY' }), el('p', { class: 'muted small', textContent: data.keyError ?? 'Bez niego serwer nie zapisze sekretów aplikacji. Ustaw go (openssl rand -base64 32) i zrestartuj serwer.' }))),
    el('div', { class: 'st-list' }, ...data.providers.map(card)),
    el('h2', { class: 'sup-h' }, `Połączone kanały (${data.accounts.length})`, data.live ? el('span', { class: 'chip red', textContent: `${data.live} LIVE` }) : ''),
    data.accounts.length ? el('div', { class: 'glass card scroll-x' }, el('table', {},
      el('thead', {}, el('tr', {}, ...['Gracz', 'Kanał', 'Stan', 'Tytuł', 'Webhook', 'Połączono', ''].map((h) => el('th', { textContent: h })))),
      el('tbody', {}, ...rows))) : el('p', { class: 'muted', textContent: 'Nikt jeszcze nie połączył kanału.' }));
}
