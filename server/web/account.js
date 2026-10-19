// The account page (/konto): sign in, pick a cape, privacy, sign out.
import { Preview } from './preview.js';
import { $, partnerBanner, uploadPicture, PROVIDERS, SLOTS, api, avatarEl, capeEl, cosmeticEl, el, errorText, guard, icon, signInDev, signInWith, signOut, toast, token } from './common.js';

let me;
let health = { providers: [], dev: false };
let cosmetics = { capes: [] };
/** Which slot is shown, and whose set is changed: '' = the whole account, else a Minecraft account's uuid. */
const RANK_NAMES = { admin: 'Admin', support: 'Support', partner: 'Partner', friend: 'Przyjaciel', friend_pink: 'Przyjaciel' };
let slot = 'cape';
let forCharacter = '';
/** The 3D figure: made once, moved into each new render of the page. */
let preview;
let previewBox;
let previewSkin;
let previewWorn = {};

async function figure(uuid, worn) {
  previewBox ??= el('div', { class: 'figure' });
  previewWorn = worn;
  try {
    if (!preview) preview = await Preview.create(previewBox, { width: 240, height: 320, uuid });
    else if (uuid !== previewSkin) await preview.skin(uuid);
    previewSkin = uuid;
    await preview.show(worn);
  } catch {
    previewBox.classList.add('hidden');
  }
}
const tryOn = (slot, id) => preview?.show({ ...previewWorn, ...(slot === 'cape' || slot === 'wings' || slot === 'elytra' ? { cape: '', wings: '', elytra: '' } : {}), [slot]: id });

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
      me.badge === 'partner' ? el('span', { class: 'chip gold' }, icon('fa-solid fa-certificate'), 'Partner') : '',
      me.badge === 'friend' ? el('span', { class: 'chip green' }, el('img', { class: 'chip-logo', src: '/vendor/logo.png', alt: '' }), 'Przyjaciel') : '',
      me.badge === 'friend_pink' ? el('span', { class: 'chip pink' }, el('img', { class: 'chip-logo', src: '/vendor/logo.png', alt: '' }), 'Przyjaciel') : ''));
  // the avatar: the face from one of the Minecraft accounts' skins, or the sign-in provider's picture
  const faces = me.avatars?.minecraft ?? [];
  if (faces.length + (me.avatars?.provider ? 1 : 0) > 1) {
    const pick = (source, src, label) => el('button', {
      class: `avatar-pick${me.avatarSource === source ? ' selected' : ''}`, title: label,
      onclick: async () => {
        const u = await guard(() => api('POST', '/v1/me', { avatarSource: source }));
        if (!u) return;
        me = u;
        toast('Avatar zmieniony.');
        renderNav();
        renderAccount();
      },
    }, el('img', { src, alt: '' }), el('span', { textContent: label }));
    const provider = PROVIDERS[me.providers.find((p) => p !== 'minecraft' && p !== 'dev') ?? '']?.[0] ?? 'Logowanie';
    profile.append(el('div', { class: 'row small avatar-choice' }, el('span', { class: 'muted', textContent: 'Avatar:' }),
      ...faces.map((f) => pick(f.uuid, f.url, f.name)),
      me.avatars.provider ? pick('provider', me.avatars.provider, provider) : ''));
  }
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

  const items = cosmetics.items ?? cosmetics.capes.map((c) => ({ ...c, slot: 'cape' }));
  const characters = me.minecraft ?? [];
  if (!characters.some((m) => m.uuid === forCharacter)) forCharacter = '';
  const character = characters.find((m) => m.uuid === forCharacter);
  // a Minecraft account without a set of its own wears the account's
  const worn = character?.loadout ?? { ...me.loadout, ...(me.cape ? { cape: me.cape } : {}) };
  const whose = el('select', {}, el('option', { value: '', textContent: 'Całe konto (domyślny zestaw)' }),
    ...characters.map((m) => el('option', { value: m.uuid, textContent: `${m.name}${m.loadout ? '' : ' (jak konto)'}`, selected: m.uuid === forCharacter })));
  whose.addEventListener('change', () => { forCharacter = whose.value; renderAccount(); });
  const send = async (change, done) => {
    const u = await guard(() => api('POST', '/v1/me', forCharacter ? { character: forCharacter, ...change } : change));
    if (!u) return;
    me = u;
    toast(done);
    renderAccount();
  };
  const tabs = el('div', { class: 'slot-tabs' }, ...SLOTS.filter(([s]) => items.some((i) => i.slot === s)).map(([s, name, ic]) =>
    el('button', { class: `${s === slot ? 'active' : ''}${worn[s] ? ' worn' : ''}`, onclick: () => { slot = s; renderAccount(); } }, icon(ic), name)));
  const pick = el('div', { class: 'cape-picker' });
  const choice = (item) => {
    const id = item?.id ?? '';
    const name = item?.name ?? 'Nic';
    const locked = item && !item.available;
    const why = item?.rank ? `${name}: tylko dla rangi ${RANK_NAMES[item.rank] ?? item.rank}` : `${name}: ekskluzywne, przyznaje admin`;
    const b = el('button', { class: `cape-choice${(worn[slot] || '') === id ? ' selected' : ''}${id ? '' : ' none'}`, disabled: !!locked, title: locked ? why : name },
      item ? cosmeticEl(item.id, item.slot) : el('div', { class: 'cape' }, icon('fa-solid fa-ban')), el('span', { textContent: name }), locked ? el('i', { class: 'fa-solid fa-lock lock' }) : '');
    // under the mouse the figure tries it on; leaving puts back what is worn
    b.addEventListener('mouseenter', () => tryOn(slot, id));
    b.addEventListener('mouseleave', () => preview?.show(previewWorn));
    b.addEventListener('click', () => send(slot === 'cape' ? { cape: id } : { loadout: { [slot]: id } },
      id ? `${name}: założone. Widać po następnym wejściu do gry.` : 'Zdjęte.'));
    return b;
  };
  pick.append(choice(undefined));
  for (const c of items.filter((i) => i.slot === slot)) pick.append(choice(c));
  const capes = el('div', { class: 'glass card' }, el('h3', { textContent: 'Kosmetyki' }),
    el('p', { class: 'muted small', textContent: 'Widzą je gracze z SlashClient na każdym serwerze. Każde konto Minecraft może mieć własny zestaw.' }),
    characters.length ? el('div', { class: 'cosmetic-for' }, el('span', { class: 'small', textContent: 'Zestaw dla:' }), whose,
      character?.loadout ? el('button', { onclick: () => send({ own: false }, `${character.name} nosi teraz zestaw całego konta.`) }, icon('fa-solid fa-rotate-left'), 'Jak całe konto') : '') : '',
    el('div', { class: 'cosmetic-stage' }, previewBox ??= el('div', { class: 'figure' }), el('div', { class: 'grow' }, tabs, pick)));
  $('#account').replaceChildren(el('div', { class: 'account' }, profile, capes));
  // the kill effect plays on the figure only while its tab is open (every few seconds it would distract)
  // the kill effect plays only on its own tab; on the prop's the figure walks with it, seen from the side
  figure(character?.uuid ?? characters[0]?.uuid, { ...worn, ...(slot === 'kill' ? {} : { kill: '' }), walk: slot === 'prop' });
  renderPartners();
}

/** A partner account's own servers: the background shown behind them in the game's server list. */
async function renderPartners() {
  const res = await api('GET', '/v1/me/partners').catch(() => undefined);
  if (!res?.partners.length) return;
  const section = el('div', { class: 'glass card partner-own' }, el('h3', { textContent: 'Twój serwer partnerski' }),
    el('p', { class: 'muted small', textContent: 'Tło widać za Twoim serwerem na liście serwerów w grze, u graczy z SlashClient. Najlepiej szeroki obrazek, np. 1200×120 (PNG lub JPG, do 3 MB).' }));
  for (const p of res.partners) {
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'hidden' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (file && await guard(() => uploadPicture(`/v1/me/partners/${p.id}/background`, file))) { toast('Tło zapisane.'); renderAccount(); }
    });
    section.append(partnerBanner(p), el('div', { class: 'row' },
      el('label', { class: 'btn' }, icon('fa-solid fa-image'), p.background ? 'Zmień tło' : 'Wgraj tło', input),
      p.background ? el('button', { onclick: async () => { if (await guard(() => api('DELETE', `/v1/me/partners/${p.id}/background`))) renderAccount(); } }, icon('fa-solid fa-eraser'), 'Usuń tło') : ''));
  }
  $('#account').append(section);
}

async function refresh() {
  me = token.get() ? await api('GET', '/v1/me').catch(() => undefined) : undefined;
  cosmetics = await api('GET', '/v1/cosmetics').catch(() => ({ capes: [] }));
  renderNav();
  renderAccount();
}

health = await api('GET', '/v1/health').catch(() => health);
refresh().catch((err) => toast(errorText(err), true));
