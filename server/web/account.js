// The account page (/konto): sign in, pick a cape, privacy, sign out.
import { Preview } from './preview.js';
import { achievementsCard, buy, priceTag, sparks } from './sparks.js';
import { privacyCard } from './profilePrivacy.js';
import { streamsCard } from './accountStreams.js';
import { legalNotices, signInNote } from './legalNotice.js';
import { chip as supporterChip, supportCard } from './supportCard.js';
import { rankBadge, rankChip } from './ranks.js';
import { $, L, partnerBanner, uploadPicture, PROVIDERS, SLOTS, api, avatarEl, capeEl, confirmModal, cosmeticEl, el, english, errorText, guard, icon, localizePage, signInDev, signInWith, signOut, toast, token, partnerIconControls } from './common.js';

localizePage('SlashClient – Your account');
const EN = english();

let me;
let health = { providers: [], dev: false };
let cosmetics = { items: [] };
/** Which slot is shown, and whose set is changed: '' = the whole account, else a Minecraft account's uuid. */
const RANK_NAMES = EN ? { admin: 'Admin', support: 'Support', partner: 'Partner', friend: 'Friend', friend_pink: 'Friend' } : { admin: 'Admin', support: 'Support', partner: 'Partner', friend: 'Przyjaciel', friend_pink: 'Przyjaciel' };
let slot = 'cape';
let forCharacter = '';
/** The 3D figure: made once, moved into each new render of the page. */
let preview;
let previewBox;
let previewSkin;
let previewWorn = {};
/** Which render of the page the achievements card (loaded after it) belongs to. */
let renders = 0;
/** The account page's tabs: id, address (#…), Polish and English name, icon. */
const ACCOUNT_TABS = [
  ['profile', 'profil', 'Profil', 'Profile', 'fa-solid fa-user'],
  ['cosmetics', 'kosmetyki', 'Kosmetyki', 'Cosmetics', 'fa-solid fa-shirt'],
  ['privacy', 'prywatnosc', 'Prywatność', 'Privacy', 'fa-solid fa-user-shield'],
  ['streams', 'streamy', 'Streamy', 'Streams', 'fa-solid fa-video'],
  ['support', 'wsparcie', 'Wsparcie', 'Support', 'fa-solid fa-heart'],
  ['partner', 'serwer', 'Serwer partnerski', 'Partner server', 'fa-solid fa-handshake'],
];
/** The first tab, at a plain /konto (its address gets no #…). */
const FIRST_TAB = 'profile';
/** The tab shown: from the address (old links to #wsparcie and #prywatnosc land on theirs), the profile at first. */
let accountTab = ACCOUNT_TABS.find(([, hash]) => location.hash === `#${hash}`)?.[0] ?? FIRST_TAB;
/**
 * The cards beside the cosmetics (channels, support, privacy, achievements, notices, partner servers):
 * loaded once and then kept, so picking a cosmetic or a tab does not ask the server for all of them again.
 * Signing in, buying or a change on a card itself loads them anew.
 */
let side;
function sideCards(reload) {
  if (reload || side?.user !== me.id) {
    side = {
      user: me.id,
      streams: streamsCard().catch(() => undefined),
      support: supportCard().catch(() => undefined),
      privacy: privacyCard().catch(() => undefined),
      achievements: achievementsCard().catch(() => undefined),
      legal: legalNotices().catch(() => []),
      partners: partnersCard().catch(() => undefined),
    };
  }
  return side;
}

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
// a back item takes the place of the cape and the wings: on their tabs it is left off
const tryOn = (slot, id) => preview?.show({ ...previewWorn, ...(slot === 'cape' || slot === 'wings' || slot === 'elytra' ? { cape: '', wings: '', elytra: '', back: '' } : {}), [slot]: id });
/** What goes with what on the back, said under the slot's tabs. */
const SLOT_NOTES = EN ? {
  back: 'It takes the place of the cape and the wings (they are hidden) and hides under a real elytra.',
  tail: 'It swings as you walk. Under a cape it hangs lower.',
} : {
  back: 'Zajmuje miejsce peleryny i skrzydeł (nie widać ich wtedy) i chowa się pod prawdziwą elytrą.',
  tail: 'Kołysze się, kiedy chodzisz. Pod peleryną zwisa niżej.',
};

function renderNav() {
  $('#nav-account .label').textContent = me ? me.name : L('Zaloguj się', 'Sign in');
  $('#nav-admin').classList.toggle('hidden', !me?.admin);
}

function renderSignIn() {
  const box = el('div', { class: 'glass card signin' },
    el('h3', { textContent: health.signup?.length ? L('Zaloguj się lub załóż konto', 'Sign in or create an account') : L('Zaloguj się', 'Sign in') }),
    el('p', { class: 'muted small', textContent: health.signup?.length
      ? L('Masz już konto SlashClient? Zaloguj się sposobem, który do niego podpiąłeś. Nie masz? Wybierz dowolny sposób – po zalogowaniu wybierzesz nick, a konto Minecraft podepniesz później w launcherze (nie jest potrzebne).',
        'Already have a SlashClient account? Sign in with the way you linked to it. No account yet? Pick any way – after signing in you choose a nick, and you can link a Minecraft account later in the launcher (it is not needed).')
      : L('Konto SlashClient zakłada się samo w launcherze, razem z kontem Minecraft. Tutaj zalogujesz się sposobem, który do niego podpiąłeś w zakładce Znajomi.',
        'Your SlashClient account is created by the launcher, together with your Minecraft account. Here you sign in with the way you linked to it in the Friends tab.') }));
  const list = el('div', { class: 'providers' });
  for (const p of health.providers) {
    const [name, cls] = PROVIDERS[p] ?? [p, 'fa-solid fa-key'];
    list.append(el('button', { onclick: () => login(() => signInWith(p, { askHandle: health.signup?.includes(p) })) }, icon(cls), L(`Zaloguj przez ${name}`, `Sign in with ${name}`)));
  }
  if (health.dev) {
    const input = el('input', { type: 'text', placeholder: L('Nick (logowanie testowe)', 'Nick (test sign-in)'), maxLength: 16 });
    const form = el('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); login(() => signInDev(input.value.trim())); } },
      input, el('button', { type: 'submit' }, icon('fa-solid fa-flask'), L('Wejdź', 'Enter')));
    list.append(form);
  }
  if (!health.providers.length && !health.dev) list.append(el('p', { class: 'muted', textContent: L('Logowanie nie jest jeszcze skonfigurowane na tym serwerze.', 'Signing in is not set up on this server yet.') }));
  box.append(list, signInNote());
  $('#account').replaceChildren(box);
}

/** One setting of the profile card: its name above, the controls under it across the card. */
const field = (label, ...controls) => el('div', { class: 'field' }, el('span', { class: 'field-label', textContent: label }), el('div', { class: 'field-body' }, ...controls));

/** The player's own nick: changed here, not more often than the server allows (null: the admin switched it off). */
function handleEditor() {
  if (me.handleChangeAt === undefined || me.handleChangeAt === null) return '';
  const input = el('input', { type: 'text', value: me.handle, maxLength: 24, pattern: '[A-Za-z0-9_.]{1,24}', title: L('Nick', 'Nick') });
  const waits = me.handleChangeAt > Date.now();
  const when = waits ? new Date(me.handleChangeAt).toLocaleDateString(EN ? 'en-GB' : 'pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const save = el('button', { type: 'submit' }, icon('fa-solid fa-pen'), L('Zmień nick', 'Change nick'));
  const form = el('form', { class: 'handle-edit', onsubmit: async (e) => {
    e.preventDefault();
    const handle = input.value.trim().replace(/^@/, '');
    if (handle === me.handle) return;
    if (handle.toLowerCase() !== me.handle.toLowerCase() && !await confirmModal({
      title: L(`Zmienić nick na @${handle}?`, `Change your nick to @${handle}?`),
      text: L('Następną zmianę zrobisz dopiero za jakiś czas. Stary adres profilu prowadzi do Ciebie, dopóki ktoś nie weźmie tego nicku.', 'The next change will have to wait a while. Your old profile address leads to you until someone takes that nick.'),
      ok: L('Zmień', 'Change'), okIcon: 'fa-solid fa-pen' })) return;
    const u = await guard(() => api('POST', '/v1/me/handle', { handle }));
    if (!u) return;
    me = { ...me, ...u };
    toast(L(`Twój nick to teraz @${me.handle}.`, `Your nick is now @${me.handle}.`));
    renderNav();
    renderAccount();
  } }, input, save);
  return field(L('Nick', 'Nick'), form,
    waits ? el('small', { class: 'muted field-note', textContent: L(`Kolejna zmiana od ${when} (wielkość liter możesz zmienić zawsze).`, `Next change from ${when} (letter case can be changed any time).`) }) : '');
}

/** "Odznaka przy nicku": the most important rank (the default), one of the others, or none. */
function badgePicker() {
  const rankName = (r) => (EN ? r.nameEn || r.name : r.name);
  const sel = el('select', { title: L('Odznaka przy nicku', 'Badge next to the nick') },
    el('option', { value: '', textContent: L(`Najważniejsza ranga (${me.ranks[0].name})`, `Most important rank (${rankName(me.ranks[0])})`), selected: !me.badgeChoice }),
    ...me.ranks.map((r) => el('option', { value: r.id, textContent: rankName(r), selected: me.badgeChoice === r.id })),
    el('option', { value: 'none', textContent: L('Bez odznaki rangi', 'No rank badge'), selected: me.badgeChoice === 'none' }));
  const shown = el('span', { class: 'row badge-preview' });
  const draw = () => shown.replaceChildren(me.badgeRank ? rankBadge(me.badgeRank) : '', el('b', { textContent: me.name }));
  draw();
  sel.addEventListener('change', async () => {
    const r = await guard(() => api('POST', '/v1/me/badge', { rank: sel.value }));
    if (!r) return;
    Object.assign(me, r, { badge: r.badgeRank?.id ?? '' });
    toast(L('Odznaka przy nicku zmieniona.', 'Badge next to the nick changed.'));
    draw();
  });
  return field(L('Odznaka przy nicku', 'Badge next to the nick'), sel, shown);
}

/** With two or more Minecraft accounts linked: the badge each one shows in game, or the same as the account's. */
function characterBadgePickers() {
  const accounts = me.minecraft ?? [];
  if (!me.characterBadges || accounts.length < 2) return [];
  const rankName = (r) => (EN ? r.nameEn || r.name : r.name);
  return accounts.map((mc) => {
    const own = me.characterBadges[mc.uuid] ?? '';
    const sel = el('select', { title: L(`Odznaka przy nicku: ${mc.name}`, `Badge next to the nick: ${mc.name}`) },
      el('option', { value: '', textContent: L('Jak całe konto', 'Same as the account'), selected: !own }),
      ...me.ranks.map((r) => el('option', { value: r.id, textContent: rankName(r), selected: own === r.id })),
      el('option', { value: 'none', textContent: L('Bez odznaki rangi', 'No rank badge'), selected: own === 'none' }));
    sel.addEventListener('change', async () => {
      const r = await guard(() => api('POST', '/v1/me/badge', { rank: sel.value, character: mc.uuid }));
      if (!r) return;
      Object.assign(me, r);
      toast(L(`Odznaka konta ${mc.name} zmieniona.`, `${mc.name}'s badge changed.`));
    });
    return field(L(`W grze jako ${mc.name}`, `In game as ${mc.name}`), sel);
  });
}

async function login(fn) {
  const user = await guard(fn);
  if (!user) return;
  await refresh();
  toast(L(`Witaj, ${me?.name ?? user.name}!`, `Welcome, ${me?.name ?? user.name}!`));
}

function renderAccount(reload = false) {
  // signed in, the page's description is not needed: only a small title stays above the profile
  document.querySelector('.account-page')?.classList.toggle('signed-in', !!me);
  if (!me) return renderSignIn();
  const profile = el('div', { class: 'glass card profile-card' },
    el('div', { class: 'row' }, avatarEl(me, true),
      el('div', { class: 'grow' }, el('h3', { textContent: me.name }), el('span', { class: 'muted', textContent: `@${me.handle}` }))),
    el('div', { class: 'row' }, ...me.providers.filter((p) => p !== 'minecraft').map((p) => el('span', { class: 'chip' }, icon((PROVIDERS[p] ?? ['', 'fa-solid fa-flask'])[1]), (PROVIDERS[p] ?? ['Test'])[0])),
      // every rank held (ranks.ts; not the ones an admin may only pick the badge of); the supporter's is the tier chip below
      ...(me.ranks ?? []).filter((r) => r.id !== 'supporter' && !r.pickOnly).map((r) => rankChip(r, EN)),
      // sparks from achievements, spent on cosmetics in the shop (sparks.js)
      cosmetics.wallet ? el('span', { class: 'chip gold', title: L('Iskry z osiągnięć', 'Sparks from achievements') }, el('span', { class: 'spark-sign', textContent: '✦' }), sparks(cosmetics.wallet.balance)) : '',
      // supporting the project (supportCard.js): the tier in its colour
      me.supporter && !me.supporter.past ? supporterChip(EN ? me.supporter.nameEn || me.supporter.name : me.supporter.name, me.supporter.color) : ''));
  // the avatar: the face from one of the Minecraft accounts' skins, or the sign-in provider's picture
  const faces = me.avatars?.minecraft ?? [];
  if (faces.length + (me.avatars?.provider ? 1 : 0) > 1) {
    const pick = (source, src, label) => el('button', {
      class: `avatar-pick${me.avatarSource === source ? ' selected' : ''}`, title: label,
      onclick: async () => {
        const u = await guard(() => api('POST', '/v1/me', { avatarSource: source }));
        if (!u) return;
        me = u;
        toast(L('Avatar zmieniony.', 'Avatar changed.'));
        renderNav();
        renderAccount();
      },
    }, el('img', { src, alt: '' }), el('span', { textContent: label }));
    const provider = PROVIDERS[me.providers.find((p) => p !== 'minecraft' && p !== 'dev') ?? '']?.[0] ?? L('Logowanie', 'Sign-in');
    profile.append(field('Avatar', ...faces.map((f) => pick(f.uuid, f.url, f.name)),
      me.avatars.provider ? pick('provider', me.avatars.provider, provider) : ''));
  }
  profile.append(handleEditor());
  // which rank's badge goes next to the nick in game, in the launcher and on the friends list
  if (me.ranks?.length) profile.append(badgePicker(), ...characterBadgePickers());
  const share = el('input', { type: 'checkbox', checked: me.showServer });
  share.addEventListener('change', async () => {
    const u = await guard(() => api('POST', '/v1/me', { showServer: share.checked }));
    if (u) me = u;
  });
  // the Minecraft accounts of this account; one can go while another way to sign in is left
  if (me.minecraft?.length) {
    profile.append(field(L('Konta Minecraft (kliknij, żeby odłączyć)', 'Minecraft accounts (click to unlink)'),
      ...me.minecraft.map((mc) => el('button', { class: 'chip', title: L('Kliknij, żeby odłączyć', 'Click to unlink'), onclick: async () => {
        if (!await confirmModal({ title: L(`Odłączyć konto Minecraft ${mc.name}?`, `Unlink the Minecraft account ${mc.name}?`), ok: L('Odłącz', 'Unlink'), okIcon: 'fa-solid fa-link-slash', danger: true })) return;
        const u = await guard(() => api('DELETE', `/v1/me/minecraft/${mc.uuid}`));
        if (u) {
          me = u;
          renderAccount();
        }
      } }, icon('fa-solid fa-cube'), mc.name))));
  }
  profile.append(
    el('label', { class: 'row small' }, el('span', { class: 'switch' }, share, el('span')), L('Pokazuj znajomym, na jakim serwerze gram', 'Show friends which server I play on')),
    el('div', { class: 'row profile-actions' },
      me.admin ? el('a', { class: 'btn', href: '/admin' }, icon('fa-solid fa-shield-halved'), L('Panel admina', 'Admin panel')) : '',
      el('button', { onclick: async () => { await signOut(); me = undefined; renderNav(); renderAccount(); } }, icon('fa-solid fa-right-from-bracket'), L('Wyloguj', 'Sign out'))));

  // `capes` only from a server before `items` had every slot (0.8)
  const items = cosmetics.items ?? cosmetics.capes?.map((c) => ({ ...c, slot: 'cape' })) ?? [];
  const characters = me.minecraft ?? [];
  if (!characters.some((m) => m.uuid === forCharacter)) forCharacter = '';
  const character = characters.find((m) => m.uuid === forCharacter);
  // a Minecraft account without a set of its own wears the account's
  const worn = character?.loadout ?? { ...me.loadout, ...(me.cape ? { cape: me.cape } : {}) };
  const whose = el('select', {}, el('option', { value: '', textContent: L('Całe konto (domyślny zestaw)', 'Whole account (default set)') }),
    ...characters.map((m) => el('option', { value: m.uuid, textContent: `${m.name}${m.loadout ? '' : L(' (jak konto)', ' (as the account)')}`, selected: m.uuid === forCharacter })));
  whose.addEventListener('change', () => { forCharacter = whose.value; renderAccount(); });
  const send = async (change, done) => {
    const u = await guard(() => api('POST', '/v1/me', forCharacter ? { character: forCharacter, ...change } : change));
    if (!u) return;
    me = u;
    toast(done);
    renderAccount();
  };
  // sets of items that go together (servers from 0.9.70): a tab of their own after the slots
  const sets = (cosmetics.sets ?? []).filter((s) => Object.keys(s.parts).length);
  if (slot === 'sets' && !sets.length) slot = 'cape';
  const tabs = el('div', { class: 'slot-tabs' }, ...SLOTS.filter(([s]) => items.some((i) => i.slot === s)).map(([s, name, ic, nameEn]) =>
    el('button', { class: `${s === slot ? 'active' : ''}${worn[s] ? ' worn' : ''}`, onclick: () => { slot = s; renderAccount(); } }, icon(ic), L(name, nameEn))),
    sets.length ? el('button', { class: slot === 'sets' ? 'active' : '', onclick: () => { slot = 'sets'; renderAccount(); } }, icon('fa-solid fa-layer-group'), L('Zestawy', 'Sets')) : '');
  const pick = el('div', { class: 'cape-picker' });
  const noteText = slot === 'sets' ? L('Przedmioty, które do siebie pasują. „Załóż zestaw” zakłada naraz wszystkie części, które masz; pod spodem widać, jak zdobyć resztę.',
    'Items that go together. “Wear the set” puts on all the parts you have at once; below it says how to get the rest.')
    : SLOT_NOTES[slot] ?? ((slot === 'cape' || slot === 'wings') && worn.back ? L('Nosisz coś na plecach: w grze widać to zamiast peleryny i skrzydeł.', 'You wear something on your back: in game it shows instead of the cape and the wings.') : '');
  const note = noteText ? el('p', { class: 'muted small', textContent: noteText }) : '';
  /** Why a locked item cannot be worn, and how to get it. */
  const lockedWhy = (item, name) => item.price && !item.owned ? L(`${name}: w sklepie za ${sparks(item.price)}`, `${name}: in the shop for ${sparks(item.price)}`)
    : item.rank ? L(`${name}: tylko dla rangi ${RANK_NAMES[item.rank] ?? item.rank}`, `${name}: only for the ${RANK_NAMES[item.rank] ?? item.rank} rank`)
    : item.supporter ? L(`${name}: dla wspierających projekt (strona Wesprzyj)`, `${name}: for supporters of the project (the Support page)`)
    : (EN ? item.hintEn ?? item.hint : item.hint) ?? L(`${name}: ekskluzywne, przyznaje admin`, `${name}: exclusive, given by the admins`);
  const choice = (item) => {
    const id = item?.id ?? '';
    const name = item?.name ?? L('Nic', 'Nothing');
    const locked = item && !item.available;
    // sold in the shop for sparks: the price on it, a click asks to buy (sparks.js)
    const forSale = locked && item.price && !item.owned;
    const why = locked ? lockedWhy(item, name) : '';
    const b = el('button', { class: `cape-choice${(worn[slot] || '') === id ? ' selected' : ''}${id ? '' : ' none'}${forSale ? ' for-sale' : ''}`, disabled: !!locked && !forSale, title: locked ? why : name },
      item ? cosmeticEl(item.id, item.slot) : el('div', { class: 'cape' }, icon('fa-solid fa-ban')), el('span', { class: 'cape-name' }, el('span', { textContent: name })), forSale ? priceTag(item.price) : '', locked ? el('i', { class: 'fa-solid fa-lock lock' }) : '');
    // under the mouse the figure tries it on; leaving puts back what is worn
    b.addEventListener('mouseenter', () => tryOn(slot, id));
    b.addEventListener('mouseleave', () => preview?.show(previewWorn));
    b.addEventListener('click', async () => forSale ? (await buy(item, cosmetics.wallet?.balance ?? 0)) && refresh() : send(slot === 'cape' ? { cape: id } : { loadout: { [slot]: id } },
      id ? L(`${name}: założone. Widać po następnym wejściu do gry.`, `${name}: put on. It shows the next time you join the game.`) : L('Zdjęte.', 'Taken off.')));
    return b;
  };
  // a set: its name, how many of its parts are ours, the parts (the missing ones dimmed, with their price or how to earn
  // them), and a button that puts on every part we have in one go; under the mouse the figure tries it on
  const setCard = (s) => {
    const parts = Object.entries(s.parts).map(([sl, id]) => items.find((i) => i.id === id && i.slot === sl)).filter(Boolean);
    const owned = parts.filter((p) => p.available);
    const missing = parts.filter((p) => !p.available);
    const wearing = owned.length > 0 && owned.every((p) => (worn[p.slot] || '') === p.id);
    const setName = L(s.name, s.nameEn);
    const part = (p) => {
      const forSale = !p.available && p.price && !p.owned;
      const b = el('button', { class: `set-part${p.available ? '' : ' locked'}${forSale ? ' for-sale' : ''}`, disabled: !p.available && !forSale, title: p.available ? p.name : lockedWhy(p, p.name) },
        cosmeticEl(p.id, p.slot, true), forSale ? priceTag(p.price) : '', p.available ? '' : el('i', { class: 'fa-solid fa-lock lock' }));
      if (forSale) b.addEventListener('click', async () => (await buy(p, cosmetics.wallet?.balance ?? 0)) && refresh());
      return b;
    };
    const wear = el('button', { class: wearing ? '' : 'primary', disabled: !owned.length || wearing, onclick: () => {
      const loadout = Object.fromEntries(owned.filter((p) => p.slot !== 'cape').map((p) => [p.slot, p.id]));
      const cape = owned.find((p) => p.slot === 'cape');
      send({ ...(cape ? { cape: cape.id } : {}), ...(Object.keys(loadout).length ? { loadout } : {}) },
        L(`Zestaw ${setName}: założone (${owned.length} z ${parts.length}). Widać po następnym wejściu do gry.`, `${setName} set: put on (${owned.length} of ${parts.length}). It shows the next time you join the game.`));
    } }, icon(wearing ? 'fa-solid fa-check' : 'fa-solid fa-shirt'), wearing ? L('Założony', 'Worn') : L('Załóż zestaw', 'Wear the set'));
    const card = el('div', { class: `set-card${wearing ? ' worn' : ''}` },
      el('div', { class: 'set-head' }, el('b', { class: 'grow', textContent: setName }),
        el('span', { class: `chip${owned.length === parts.length ? ' blue' : ''}`, title: L('Masz / wszystkie części', 'Owned / all parts'), textContent: `${owned.length}/${parts.length}` }), wear),
      el('div', { class: 'set-parts' }, ...parts.map(part)),
      missing.length ? el('ul', { class: 'set-missing muted small' }, ...missing.map((p) => el('li', { textContent: lockedWhy(p, p.name) }))) : '');
    card.addEventListener('mouseenter', () => preview?.show({ ...previewWorn, ...Object.fromEntries(owned.map((p) => [p.slot, p.id])) }));
    card.addEventListener('mouseleave', () => preview?.show(previewWorn));
    return card;
  };
  if (slot === 'sets') {
    pick.className = 'set-list';
    pick.append(...sets.map(setCard));
  } else {
    pick.append(choice(undefined));
    for (const c of items.filter((i) => i.slot === slot)) pick.append(choice(c));
  }
  // every card is as wide as the others; a name too long for it slides from end to end and back
  // (measured once the cards are on the page, when the site's font has come, and when their size changes)
  const fit = () => {
    for (const box of pick.querySelectorAll('.cape-name')) {
      const over = box.firstElementChild.scrollWidth - box.clientWidth;
      box.classList.toggle('long', over > 0);
      box.style.setProperty('--over', `-${Math.max(0, over)}px`);
      // longer names take longer, so they read at the same pace
      box.style.setProperty('--slide', `${Math.max(3, over / 12)}s`);
    }
  };
  new ResizeObserver(fit).observe(pick);
  document.fonts?.ready.then(fit);
  const capes = el('div', { class: 'glass card' }, el('h3', { textContent: L('Kosmetyki', 'Cosmetics') }),
    el('p', { class: 'muted small', textContent: L('Widzą je gracze z SlashClient na każdym serwerze. Każde konto Minecraft może mieć własny zestaw.', 'Players with SlashClient see them on every server. Each Minecraft account can have its own set.') }),
    characters.length ? el('div', { class: 'cosmetic-for' }, el('span', { class: 'small', textContent: L('Zestaw dla:', 'Set for:') }), whose,
      character?.loadout ? el('button', { onclick: () => send({ own: false }, L(`${character.name} nosi teraz zestaw całego konta.`, `${character.name} now wears the whole account's set.`)) }, icon('fa-solid fa-rotate-left'), L('Jak całe konto', 'As the whole account')) : '') : '',
    el('div', { class: 'cosmetic-stage' }, previewBox ??= el('div', { class: 'figure' }), el('div', { class: 'grow' }, tabs, note, pick)));
  // the public profile's privacy (profilePrivacy.js), filled in when the settings are here
  const privacy = el('div', { class: 'privacy-slot' });
  // supporting the project: the tier, the subscription, the history (supportCard.js)
  const support = el('div', { class: 'support-slot' });
  // linked Twitch and Kick channels (accountStreams.js), when the server has them
  const streams = el('div', { class: 'streams-slot' });
  // one tab at a time; a tab whose card the server does not have (streams, support, a partner server) stays out of the bar
  const panels = Object.fromEntries(ACCOUNT_TABS.map(([id]) => [id, el('div', { class: `account-panel account-${id}` })]));
  panels.profile.append(profile);
  panels.cosmetics.append(capes);
  panels.privacy.append(privacy);
  panels.streams.append(streams);
  panels.support.append(support);
  const partner = el('div', { class: 'partner-slot' });
  panels.partner.append(partner);
  const buttons = Object.fromEntries(ACCOUNT_TABS.map(([id, , name, nameEn, ic]) => [id, el('button', { role: 'tab', onclick: () => showTab(id) }, icon(ic), L(name, nameEn))]));
  const showTab = (id) => {
    accountTab = id;
    for (const [tab, b] of Object.entries(buttons)) {
      b.classList.toggle('active', tab === id);
      b.setAttribute('aria-selected', String(tab === id));
    }
    for (const [tab, panel] of Object.entries(panels)) panel.classList.toggle('hidden', tab !== id);
    const hash = id === FIRST_TAB ? '' : `#${ACCOUNT_TABS.find(([tab]) => tab === id)[1]}`;
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
  };
  const syncTabs = () => {
    for (const [tab, b] of Object.entries(buttons)) b.classList.toggle('hidden', !panels[tab].querySelector('.card'));
    // the tab asked for is not there (no partner server): the first one
    if (!panels[accountTab].querySelector('.card') && !panels[accountTab].querySelector('[class$="-slot"]')) showTab(FIRST_TAB);
  };
  $('#account').replaceChildren(el('div', { class: 'account-tabs', role: 'tablist' }, ...Object.values(buttons)), el('div', { class: 'account' }, ...Object.values(panels)));
  showTab(accountTab);
  syncTabs();
  // each card goes only into the render of the page it was loaded for (a newer one takes it over)
  const render = ++renders;
  const cards = sideCards(reload);
  const into = (promise, put) => promise.then((card) => card && render === renders && put(card)).catch(() => {});
  // a card the server has not got (no streams, no support, no partner server) takes its slot away, and the tab with it
  const place = (promise, slot) => promise.then((card) => {
    if (render !== renders) return;
    if (card) slot.replaceWith(card);
    else slot.remove();
    syncTabs();
  }).catch(() => {});
  place(cards.streams, streams);
  place(cards.support, support);
  place(cards.privacy, privacy);
  // the achievements and the sparks under it, once loaded, with the profile
  into(cards.achievements, (card) => panels.profile.append(card));
  // the kill and movement effects play on the figure only while their tab is open (they would distract)
  // the shield and the weapon are held only while their tabs are open
  const holding = slot === 'shield' || slot === 'weapon';
  // (on the cape's, wings' and elytra's tabs the back item steps aside, so they can be seen)
  figure(character?.uuid ?? characters[0]?.uuid, { ...worn, kill: slot === 'kill' ? worn.kill : '', move: slot === 'move' ? worn.move : '', shield: holding ? worn.shield : '', weapon: holding ? worn.weapon : '',
    ...(slot === 'cape' || slot === 'wings' || slot === 'elytra' ? { back: '' } : {}),
    // on the prop's tab the figure walks with it, seen from the side
    walk: slot === 'prop' });
  place(cards.partners, partner);
  // "Zaktualizowaliśmy regulamin": important changes not seen yet, above everything else
  into(cards.legal, (list) => $('#account').prepend(...list));
}

/** A partner account's own servers: the background shown behind them in the game's server list. */
async function partnersCard() {
  const res = await api('GET', '/v1/me/partners').catch(() => undefined);
  if (!res?.partners.length) return undefined;
  const again = () => renderAccount(true);
  const section = el('div', { class: 'glass card partner-own' }, el('h3', { textContent: L('Twój serwer partnerski', 'Your partner server') }),
    el('p', { class: 'muted small', textContent: L('Tło widać za Twoim serwerem na liście serwerów w grze, u graczy z SlashClient. Najlepiej szeroki obrazek, np. 1200×120 (PNG lub JPG, do 3 MB).',
      'Players with SlashClient see the background behind your server in the game\'s server list. A wide picture works best, e.g. 1200×120 (PNG or JPG, up to 3 MB).') }));
  for (const p of res.partners) {
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'hidden' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (file && await guard(() => uploadPicture(`/v1/me/partners/${p.id}/background`, file))) { toast(L('Tło zapisane.', 'Background saved.')); again(); }
    });
    section.append(partnerBanner(p), el('div', { class: 'row' },
      el('label', { class: 'btn' }, icon('fa-solid fa-image'), p.background ? L('Zmień tło', 'Change the background') : L('Wgraj tło', 'Upload a background'), input),
      p.background ? el('button', { onclick: async () => { if (await guard(() => api('DELETE', `/v1/me/partners/${p.id}/background`))) again(); } }, icon('fa-solid fa-eraser'), L('Usuń tło', 'Remove the background')) : ''),
      partnerIconControls(p, `/v1/me/partners/${p.id}/icon`, res.iconLimits, again));
  }
  return section;
}

/** Who is signed in and the cosmetics as they see them, asked at the same time; `first`: the sign-in ways too. */
async function refresh(first) {
  [me, cosmetics] = await Promise.all([
    token.get() ? api('GET', '/v1/me').catch(() => undefined) : undefined,
    api('GET', '/v1/cosmetics').catch(() => ({ items: [] })),
    first ? api('GET', '/v1/health').then((h) => { health = h; }, () => {}) : undefined,
  ]);
  renderNav();
  renderAccount(true);
}

refresh(true).catch((err) => toast(errorText(err), true));
