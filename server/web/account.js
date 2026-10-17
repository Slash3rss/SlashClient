// The account page (/konto): sign in, pick a cape, privacy, sign out.
import { $, PROVIDERS, api, avatarEl, capeEl, el, errorText, guard, icon, signInDev, signInWith, signOut, toast, token } from './common.js';

let me;
let health = { providers: [], dev: false };
let cosmetics = { capes: [] };

function renderNav() {
  $('#nav-account .label').textContent = me ? me.name : 'Zaloguj się';
  $('#nav-admin').classList.toggle('hidden', !me?.admin);
}

function renderSignIn() {
  const box = el('div', { class: 'glass card signin' },
    el('h3', { textContent: 'Zaloguj się' }),
    el('p', { class: 'muted small', textContent: 'Konto SlashClient zakłada się samo w launcherze, razem z kontem Minecraft. Tutaj zalogujesz się sposobem, który do niego podpiąłeś w zakładce Znajomi.' }));
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
    el('div', { class: 'row' }, ...me.providers.filter((p) => p !== 'minecraft').map((p) => el('span', { class: 'chip' }, icon((PROVIDERS[p] ?? ['', 'fa-solid fa-flask'])[1]), (PROVIDERS[p] ?? ['Test'])[0])),
      me.admin ? el('span', { class: 'chip red' }, icon('fa-solid fa-shield-halved'), 'Admin') : '',
      me.badge === 'support' ? el('span', { class: 'chip sky' }, icon('fa-solid fa-certificate'), 'Support') : '',
      me.badge === 'partner' ? el('span', { class: 'chip gold' }, icon('fa-solid fa-certificate'), 'Partner') : ''));
  const share = el('input', { type: 'checkbox', checked: me.showServer });
  share.addEventListener('change', async () => {
    const u = await guard(() => api('POST', '/v1/me', { showServer: share.checked }));
    if (u) me = u;
  });
  // the Minecraft accounts of this account; one can go while another way to sign in is left
  if (me.minecraft?.length) {
    profile.append(el('div', { class: 'row small mc-accounts' }, el('span', { class: 'muted', textContent: 'Minecraft:' }),
      ...me.minecraft.map((mc) => el('button', { class: 'chip', title: 'Kliknij, żeby odłączyć', onclick: async () => {
        if (!confirm(`Odłączyć konto Minecraft ${mc.name}?`)) return;
        const u = await guard(() => api('DELETE', `/v1/me/minecraft/${mc.uuid}`));
        if (u) {
          me = u;
          renderAccount();
        }
      } }, icon('fa-solid fa-cube'), mc.name))));
  }
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
  renderAccount();
}

health = await api('GET', '/v1/health').catch(() => health);
refresh().catch((err) => toast(errorText(err), true));
