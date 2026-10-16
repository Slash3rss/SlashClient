// The page for players: what SlashClient is, and the account (sign in, pick a cape, privacy).
import { $, PROVIDERS, api, avatarEl, capeEl, el, errorText, guard, icon, signInDev, signInWith, signOut, toast, token } from './common.js';

const FEATURES = [
  ['fa-solid fa-gauge-high', 'HUD jak w Lunarze', 'FPS, ping, CPS, zbroja, efekty, klawisze i dziesiątki innych modułów, ustawiane w edytorze przeciągnij-upuść.'],
  ['fa-solid fa-user-group', 'Znajomi i czat', 'Statusy, na jakim serwerze grają znajomi, wiadomości w launcherze i w grze.'],
  ['fa-solid fa-gamepad', 'Zaproszenia do gry', 'Zaproś znajomego jednym kliknięciem; „Dołącz” przenosi go na Twój serwer, nawet gdy gra już działa.'],
  ['fa-solid fa-wand-magic-sparkles', 'Peleryny i emotki', 'Peleryny widoczne dla graczy z SlashClient i koło emotek pod klawiszem N.'],
  ['fa-solid fa-chart-column', 'Benchmark', '30 sekund pomiaru w Twoim świecie, porównanie wyników i podpowiedzi, co przyspieszy grę.'],
  ['fa-solid fa-film', 'Klipy', 'F8 zapisuje ostatnie sekundy gry jako film, bez dodatkowych programów.'],
  ['fa-solid fa-users-gear', 'Wiele kont', 'Kilka kont Microsoft i offline naraz, skiny i peleryny Minecraft w launcherze.'],
  ['fa-solid fa-puzzle-piece', 'Mody z Modrinth', 'Wyszukiwarka modów, paczek i zasobów; mody wydajności dobrane do wersji.'],
];

let me;
let health = { providers: [], dev: false };
let cosmetics = { capes: [] };

function renderFeatures() {
  $('#features').replaceChildren(...FEATURES.map(([i, title, text]) =>
    el('div', { class: 'glass feature' }, icon(i), el('h3', { textContent: title }), el('p', { textContent: text }))));
  for (const c of document.querySelectorAll('.hero-art .cape')) c.style.backgroundImage = `url(vendor/capes/${c.dataset.cape}.png)`;
}

function renderCapesRow() {
  const capes = cosmetics.capes.length ? cosmetics.capes : [];
  $('#capes-row').replaceChildren(...capes.map((c) =>
    el('figure', {}, capeEl(c.id), el('figcaption', {}, c.name, c.exclusive ? el('span', { class: 'chip gold', textContent: 'ekskluzywna' }) : ''))));
}

function renderNav() {
  $('#nav-account .label').textContent = me ? me.name : 'Zaloguj się';
  $('#nav-admin').classList.toggle('hidden', !me?.admin);
}

function renderSignIn() {
  const box = el('div', { class: 'glass card signin' },
    el('h3', { textContent: 'Zaloguj się' }),
    el('p', { class: 'muted small', textContent: 'Tym samym kontem co w zakładce Znajomi w launcherze.' }));
  const list = el('div', { class: 'providers' });
  for (const p of health.providers) {
    const [name, cls] = PROVIDERS[p] ?? [p, 'fa-solid fa-key'];
    list.append(el('button', { onclick: () => login(() => signInWith(p)) }, icon(cls), `Zaloguj przez ${name}`));
  }
  if (health.dev) {
    const input = el('input', { type: 'text', placeholder: 'Nick (logowanie testowe)', maxLength: 16 });
    const form = el('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); login(() => signInDev(input.value.trim())); } },
      input, el('button', { type: 'submit' }, icon('fa-solid fa-flask'), 'Wejdź'));
    list.append(form);
  }
  if (!health.providers.length && !health.dev) list.append(el('p', { class: 'muted', textContent: 'Logowanie nie jest jeszcze skonfigurowane na tym serwerze.' }));
  box.append(list);
  $('#account').replaceChildren(box);
}

async function login(fn) {
  const user = await guard(fn);
  if (!user) return;
  await refresh();
  toast(`Witaj, ${me?.name ?? user.name}!`);
}

function renderAccount() {
  if (!me) return renderSignIn();
  const profile = el('div', { class: 'glass card profile-card' },
    el('div', { class: 'row' }, avatarEl(me, true),
      el('div', { class: 'grow' }, el('h3', { textContent: me.name }), el('span', { class: 'muted', textContent: `@${me.handle}` }))),
    el('div', { class: 'row' }, ...me.providers.map((p) => el('span', { class: 'chip' }, icon((PROVIDERS[p] ?? ['', 'fa-solid fa-flask'])[1]), (PROVIDERS[p] ?? ['Test'])[0])),
      me.admin ? el('span', { class: 'chip blue' }, icon('fa-solid fa-shield-halved'), 'admin') : ''));
  const share = el('input', { type: 'checkbox', checked: me.showServer });
  share.addEventListener('change', async () => {
    const u = await guard(() => api('POST', '/v1/me', { showServer: share.checked }));
    if (u) me = u;
  });
  profile.append(
    el('label', { class: 'row small' }, el('span', { class: 'switch' }, share, el('span')), 'Pokazuj znajomym, na jakim serwerze gram'),
    el('div', { class: 'row' },
      me.admin ? el('a', { class: 'btn', href: '/admin' }, icon('fa-solid fa-shield-halved'), 'Panel admina') : '',
      el('button', { onclick: async () => { await signOut(); me = undefined; renderNav(); renderAccount(); } }, icon('fa-solid fa-right-from-bracket'), 'Wyloguj')));

  const pick = el('div', { class: 'cape-picker' });
  const choice = (id, name, content, available = true, locked = false) => {
    const b = el('button', { class: `cape-choice${(me.cape || '') === id ? ' selected' : ''}${id ? '' : ' none'}`, disabled: !available, title: locked ? 'Ekskluzywna: przyznaje ją admin' : name },
      content, el('span', { textContent: name }), locked ? el('i', { class: 'fa-solid fa-lock lock' }) : '');
    b.addEventListener('click', async () => {
      const u = await guard(() => api('POST', '/v1/me', { cape: id }));
      if (!u) return;
      me = u;
      toast(id ? `Peleryna ${name} założona. Widać ją po następnym wejściu do gry.` : 'Peleryna zdjęta.');
      renderAccount();
    });
    return b;
  };
  pick.append(choice('', 'Bez peleryny', el('div', { class: 'cape' }, icon('fa-solid fa-ban'))));
  for (const c of cosmetics.capes) pick.append(choice(c.id, c.name, capeEl(c.id), c.available, c.exclusive && !c.available));
  const capes = el('div', { class: 'glass card' }, el('h3', { textContent: 'Peleryna' }),
    el('p', { class: 'muted small', textContent: 'Widzą ją gracze z SlashClient na każdym serwerze. Zastępuje pelerynę Minecraft.' }), pick);
  $('#account').replaceChildren(el('div', { class: 'account' }, profile, capes));
}

async function refresh() {
  me = token.get() ? await api('GET', '/v1/me').catch(() => undefined) : undefined;
  cosmetics = await api('GET', '/v1/cosmetics').catch(() => ({ capes: [] }));
  renderNav();
  renderCapesRow();
  renderAccount();
}

renderFeatures();
health = await api('GET', '/v1/health').catch(() => health);
refresh().catch((err) => toast(errorText(err), true));
