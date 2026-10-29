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
let cosmetics = { capes: [] };
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
let scrolledToPrivacy = false;
let scrolledToSupport = false;
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
    el('h3', { textContent: L('Zaloguj się', 'Sign in') }),
    el('p', { class: 'muted small', textContent: L('Konto SlashClient zakłada się samo w launcherze, razem z kontem Minecraft. Tutaj zalogujesz się sposobem, który do niego podpiąłeś w zakładce Znajomi.',
      'Your SlashClient account is created by the launcher, together with your Minecraft account. Here you sign in with the way you linked to it in the Friends tab.') }));
  const list = el('div', { class: 'providers' });
  for (const p of health.providers) {
    const [name, cls] = PROVIDERS[p] ?? [p, 'fa-solid fa-key'];
    list.append(el('button', { onclick: () => login(() => signInWith(p)) }, icon(cls), L(`Zaloguj przez ${name}`, `Sign in with ${name}`)));
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

/** "Odznaka przy nicku": the most important rank (the default), one of the others, or none. */
function badgePicker() {
  const rankName = (r) => (EN ? r.nameEn || r.name : r.name);
  const sel = el('select', { title: L('Odznaka przy nicku', 'Badge next to the nick') },
    el('option', { value: '', textContent: L(`Najważniejsza ranga (${me.ranks[0].name})`, `Most important rank (${rankName(me.ranks[0])})`), selected: !me.badgeChoice }),
    ...me.ranks.map((r) => el('option', { value: r.id, textContent: rankName(r), selected: me.badgeChoice === r.id })),
    el('option', { value: 'none', textContent: L('Bez odznaki rangi', 'No rank badge'), selected: me.badgeChoice === 'none' }));
  const shown = el('span', { class: 'row' });
  const draw = () => shown.replaceChildren(me.badgeRank ? rankBadge(me.badgeRank) : '', el('b', { textContent: me.name }));
  draw();
  sel.addEventListener('change', async () => {
    const r = await guard(() => api('POST', '/v1/me/badge', { rank: sel.value }));
    if (!r) return;
    Object.assign(me, r, { badge: r.badgeRank?.id ?? '' });
    toast(L('Odznaka przy nicku zmieniona.', 'Badge next to the nick changed.'));
    draw();
  });
  return el('div', { class: 'row small badge-choice' }, el('span', { class: 'muted', textContent: L('Odznaka przy nicku:', 'Badge next to the nick:') }), sel, el('span', { class: 'muted', textContent: L('wygląda tak:', 'looks like this:') }), shown);
}

async function login(fn) {
  const user = await guard(fn);
  if (!user) return;
  await refresh();
  toast(L(`Witaj, ${me?.name ?? user.name}!`, `Welcome, ${me?.name ?? user.name}!`));
}

function renderAccount(reload = false) {
  if (!me) return renderSignIn();
  const profile = el('div', { class: 'glass card profile-card' },
    el('div', { class: 'row' }, avatarEl(me, true),
      el('div', { class: 'grow' }, el('h3', { textContent: me.name }), el('span', { class: 'muted', textContent: `@${me.handle}` }))),
    el('div', { class: 'row' }, ...me.providers.filter((p) => p !== 'minecraft').map((p) => el('span', { class: 'chip' }, icon((PROVIDERS[p] ?? ['', 'fa-solid fa-flask'])[1]), (PROVIDERS[p] ?? ['Test'])[0])),
      // every rank held (ranks.ts); the supporter's is the tier chip below
      ...(me.ranks ?? []).filter((r) => r.id !== 'supporter').map((r) => rankChip(r, EN)),
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
    profile.append(el('div', { class: 'row small avatar-choice' }, el('span', { class: 'muted', textContent: 'Avatar:' }),
      ...faces.map((f) => pick(f.uuid, f.url, f.name)),
      me.avatars.provider ? pick('provider', me.avatars.provider, provider) : ''));
  }
  // which rank's badge goes next to the nick in game, in the launcher and on the friends list
  if (me.ranks?.length) profile.append(badgePicker());
  const share = el('input', { type: 'checkbox', checked: me.showServer });
  share.addEventListener('change', async () => {
    const u = await guard(() => api('POST', '/v1/me', { showServer: share.checked }));
    if (u) me = u;
  });
  // the Minecraft accounts of this account; one can go while another way to sign in is left
  if (me.minecraft?.length) {
    profile.append(el('div', { class: 'row small mc-accounts' }, el('span', { class: 'muted', textContent: 'Minecraft:' }),
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
    el('div', { class: 'row' },
      me.admin ? el('a', { class: 'btn', href: '/admin' }, icon('fa-solid fa-shield-halved'), L('Panel admina', 'Admin panel')) : '',
      el('button', { onclick: async () => { await signOut(); me = undefined; renderNav(); renderAccount(); } }, icon('fa-solid fa-right-from-bracket'), L('Wyloguj', 'Sign out'))));

  const items = cosmetics.items ?? cosmetics.capes.map((c) => ({ ...c, slot: 'cape' }));
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
  const tabs = el('div', { class: 'slot-tabs' }, ...SLOTS.filter(([s]) => items.some((i) => i.slot === s)).map(([s, name, ic, nameEn]) =>
    el('button', { class: `${s === slot ? 'active' : ''}${worn[s] ? ' worn' : ''}`, onclick: () => { slot = s; renderAccount(); } }, icon(ic), L(name, nameEn))));
  const pick = el('div', { class: 'cape-picker' });
  const noteText = SLOT_NOTES[slot] ?? ((slot === 'cape' || slot === 'wings') && worn.back ? L('Nosisz coś na plecach: w grze widać to zamiast peleryny i skrzydeł.', 'You wear something on your back: in game it shows instead of the cape and the wings.') : '');
  const note = noteText ? el('p', { class: 'muted small', textContent: noteText }) : '';
  const choice = (item) => {
    const id = item?.id ?? '';
    const name = item?.name ?? L('Nic', 'Nothing');
    const locked = item && !item.available;
    // sold in the shop for sparks: the price on it, a click asks to buy (sparks.js)
    const forSale = locked && item.price && !item.owned;
    const why = forSale ? L(`${name}: w sklepie za ${sparks(item.price)}`, `${name}: in the shop for ${sparks(item.price)}`)
      : item?.rank ? L(`${name}: tylko dla rangi ${RANK_NAMES[item.rank] ?? item.rank}`, `${name}: only for the ${RANK_NAMES[item.rank] ?? item.rank} rank`)
      : item?.supporter ? L(`${name}: dla wspierających projekt (strona Wesprzyj)`, `${name}: for supporters of the project (the Support page)`)
      : (EN ? item?.hintEn ?? item?.hint : item?.hint) ?? L(`${name}: ekskluzywne, przyznaje admin`, `${name}: exclusive, given by the admins`);
    const b = el('button', { class: `cape-choice${(worn[slot] || '') === id ? ' selected' : ''}${id ? '' : ' none'}${forSale ? ' for-sale' : ''}`, disabled: !!locked && !forSale, title: locked ? why : name },
      item ? cosmeticEl(item.id, item.slot) : el('div', { class: 'cape' }, icon('fa-solid fa-ban')), el('span', { class: 'cape-name' }, el('span', { textContent: name })), forSale ? priceTag(item.price) : '', locked ? el('i', { class: 'fa-solid fa-lock lock' }) : '');
    // under the mouse the figure tries it on; leaving puts back what is worn
    b.addEventListener('mouseenter', () => tryOn(slot, id));
    b.addEventListener('mouseleave', () => preview?.show(previewWorn));
    b.addEventListener('click', async () => forSale ? (await buy(item, cosmetics.wallet?.balance ?? 0)) && refresh() : send(slot === 'cape' ? { cape: id } : { loadout: { [slot]: id } },
      id ? L(`${name}: założone. Widać po następnym wejściu do gry.`, `${name}: put on. It shows the next time you join the game.`) : L('Zdjęte.', 'Taken off.')));
    return b;
  };
  pick.append(choice(undefined));
  for (const c of items.filter((i) => i.slot === slot)) pick.append(choice(c));
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
  $('#account').replaceChildren(el('div', { class: 'account' }, el('div', { class: 'account-side' }, profile, privacy, streams, support), capes));
  // each card goes only into the render of the page it was loaded for (a newer one takes it over)
  const render = ++renders;
  const cards = sideCards(reload);
  const into = (promise, put) => promise.then((card) => card && render === renders && put(card)).catch(() => {});
  into(cards.streams, (card) => streams.replaceWith(card));
  into(cards.support, (card) => {
    support.replaceWith(card);
    if (location.hash === '#wsparcie' && !scrolledToSupport) {
      scrolledToSupport = true;
      card.scrollIntoView({ block: 'start' });
    }
  });
  into(cards.privacy, (card) => {
    privacy.replaceWith(card);
    if (location.hash === '#prywatnosc' && !scrolledToPrivacy) {
      scrolledToPrivacy = true;
      card.scrollIntoView({ block: 'start' });
    }
  });
  // the achievements and the sparks under it, once loaded
  into(cards.achievements, (card) => $('#account .account')?.append(card));
  // the kill and movement effects play on the figure only while their tab is open (they would distract)
  // the shield and the weapon are held only while their tabs are open
  const holding = slot === 'shield' || slot === 'weapon';
  // (on the cape's, wings' and elytra's tabs the back item steps aside, so they can be seen)
  figure(character?.uuid ?? characters[0]?.uuid, { ...worn, kill: slot === 'kill' ? worn.kill : '', move: slot === 'move' ? worn.move : '', shield: holding ? worn.shield : '', weapon: holding ? worn.weapon : '',
    ...(slot === 'cape' || slot === 'wings' || slot === 'elytra' ? { back: '' } : {}),
    // on the prop's tab the figure walks with it, seen from the side
    walk: slot === 'prop' });
  into(cards.partners, (card) => $('#account').append(card));
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

async function refresh() {
  me = token.get() ? await api('GET', '/v1/me').catch(() => undefined) : undefined;
  cosmetics = await api('GET', '/v1/cosmetics').catch(() => ({ capes: [] }));
  renderNav();
  renderAccount(true);
}

health = await api('GET', '/v1/health').catch(() => health);
refresh().catch((err) => toast(errorText(err), true));
