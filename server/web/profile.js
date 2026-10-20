// A player's public profile (/u/<handle>): the 3D figure with what they wear, ranks, clan, numbers
// from the server and achievements. The server sends only what the owner lets this visitor see
// (profiles.ts); the owner and admins get the whole profile and tools for it.
import { Preview } from './preview.js';
import { $, SLOTS, ApiError, api, cosmeticEl, el, errorText, guard, icon, toast, token } from './common.js';

const handle = decodeURIComponent(location.pathname.split('/')[2] ?? '');
const asPublic = new URLSearchParams(location.search).get('view') === 'public';
/** The page is Polish; a browser in another language gets the English texts. */
const EN = !/^pl\b/i.test(navigator.language || 'pl');
const L = (pl, en) => (EN ? en : pl);
const LOCALE = EN ? 'en-GB' : 'pl-PL';

const RANKS = {
  admin: ['Admin', 'red', 'fa-solid fa-shield-halved'], support: ['Support', 'sky', 'fa-solid fa-certificate'], partner: ['Partner', 'gold', 'fa-solid fa-certificate'],
  friend: [L('Przyjaciel', 'Friend'), 'green', ''], friend_pink: [L('Przyjaciel', 'Friend'), 'pink', ''],
};
const GROUP_ICONS = { streak: 'fa-fire', hours: 'fa-clock', friends: 'fa-user-group', messages: 'fa-comment', servers: 'fa-server' };
const SLOT_NAMES_EN = {
  cape: 'Cape', wings: 'Wings', elytra: 'Elytra', trail: 'Trail', aura: 'Aura', pet: 'Pet', hat: 'Headwear', top: 'Clothing', kill: 'Kill effect', suit: 'Suit',
  shield: 'Shield', weapon: 'Weapon skin', shoes: 'Shoes', hands: 'Hands', face: 'Face', ears: 'Ears & horns', back: 'Back', tail: 'Tail', ring: 'Ring', move: 'Movement effect',
  spray: 'Spray', prop: 'Prop',
};
const ROLES = { owner: L('założyciel', 'owner'), officer: L('oficer', 'officer'), member: L('członek', 'member') };

const day = (ms) => new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtNumber = (n) => Number(n).toLocaleString(LOCALE, { maximumFractionDigits: 1 });

/** "dziś", "wczoraj", "3 dni temu" from a day (the server sends others only the day). */
function seenDay(ms) {
  const days = Math.floor(Date.now() / 86_400_000) - Math.floor(ms / 86_400_000);
  if (days <= 0) return L('dziś', 'today');
  if (days === 1) return L('wczoraj', 'yesterday');
  if (days < 30) return L(`${days} dni temu`, `${days} days ago`);
  return day(ms);
}

async function renderNav() {
  if (!token.get()) return;
  const me = await api('GET', '/v1/me').catch(() => undefined);
  if (!me) return;
  $('#nav-account .label').textContent = me.name;
  $('#nav-admin').classList.toggle('hidden', !me.admin);
}

/** The 3D figure: the player's skin (or ours) with what they wear. */
async function figure(box, p) {
  try {
    const small = window.innerWidth < 720;
    const preview = await Preview.create(box, small ? { width: 200, height: 260 } : { width: 240, height: 320 });
    if (p.skin) {
      const res = await fetch(p.skin).catch(() => undefined);
      if (res?.ok) await preview.viewer.loadSkin(p.skin, { model: res.headers.get('x-skin-model') === 'slim' ? 'slim' : 'default' });
    }
    // the effects that play now and then would distract here; held things only on the shield's and weapon's own tabs
    const worn = p.cosmetics ?? {};
    await preview.show({ ...worn, kill: '', move: '', shield: '', weapon: '' });
  } catch {
    box.classList.add('hidden');
  }
}

function message(iconName, title, text, ...extra) {
  document.title = `${title} – SlashClient`;
  $('#profile').replaceChildren(el('div', { class: 'glass card profile-message' },
    el('div', { class: 'profile-message-icon' }, icon(iconName)), el('h2', { textContent: title }), el('p', { class: 'muted', textContent: text }), ...extra));
}

function stat(iconName, value, label) {
  return el('div', { class: 'profile-stat' }, icon(`fa-solid ${iconName}`), el('b', { textContent: value }), el('span', { class: 'muted small', textContent: label }));
}

async function copyLink(url) {
  await navigator.clipboard.writeText(url).then(() => toast(L('Skopiowano link do profilu.', 'Profile link copied.')), () => toast(url));
}

/** The owner's and the admins' bar: what this view is, and what can be done with the profile. */
function toolsBar(p) {
  const link = `${location.origin}${p.url}`;
  const items = [];
  if (p.viewer === 'self' || p.adminView) {
    items.push(el('span', { class: 'grow small' }, icon(p.adminView ? 'fa-solid fa-shield-halved' : 'fa-solid fa-user'), ' ',
      p.adminView ? L('Widok admina: widzisz cały profil, bez względu na prywatność.', 'Admin view: you see the whole profile whatever its privacy.')
        : L('To Twój profil. Widzisz go w całości; inni widzą tylko to, na co pozwalasz.', 'This is your profile. You see all of it; others see what you allow.')));
    items.push(el('a', { class: 'btn', href: `${p.url}?view=public` }, icon('fa-solid fa-eye'), el('span', { class: 'label', textContent: L(' Jak widzą inni', ' As others see it') })));
    if (p.viewer === 'self') items.push(el('a', { class: 'btn', href: '/konto#prywatnosc' }, icon('fa-solid fa-user-lock'), el('span', { class: 'label', textContent: L(' Prywatność', ' Privacy') })));
  } else if (p.viewer === 'anonymous' && asPublic) {
    items.push(el('span', { class: 'grow small' }, icon('fa-solid fa-eye'), ' ', L('Tak ten profil widzi ktoś niezalogowany.', 'This is how a visitor who is not signed in sees this profile.')));
    items.push(el('a', { class: 'btn', href: p.url }, icon('fa-solid fa-arrow-left'), el('span', { class: 'label', textContent: L(' Wróć', ' Back') })));
  }
  items.push(el('button', { type: 'button', onclick: () => copyLink(link) }, icon('fa-regular fa-copy'), el('span', { class: 'label', textContent: L(' Kopiuj link', ' Copy link') })));
  if (p.adminView) {
    const hidden = p.moderation?.hidden;
    items.push(el('button', { type: 'button', class: hidden ? '' : 'danger', onclick: async () => {
      const reason = hidden ? '' : prompt(L('Powód ukrycia profilu (zapisze się w dzienniku):', 'Why hide this profile (goes into the log):'), '');
      if (reason === null) return;
      const res = await guard(() => api('POST', `/v1/admin/profiles/${encodeURIComponent(p.handle)}`, { hidden: !hidden, reason }));
      if (!res) return;
      toast(hidden ? L('Profil znowu widoczny.', 'Profile visible again.') : L('Profil ukryty.', 'Profile hidden.'));
      render(res.profile);
    } }, icon(hidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'), el('span', { class: 'label', textContent: hidden ? L(' Pokaż profil', ' Unhide') : L(' Ukryj profil', ' Hide profile') })));
  }
  return el('div', { class: 'glass profile-tools row' }, ...items);
}

/** A supporter's avatar in a frame of their tier's colour (when the tier gives it). */
function framed(avatar, sup) {
  if (!sup?.active || !sup.frame) return avatar;
  const box = el('span', { class: 'avatar-frame', title: L(sup.name, sup.nameEn || sup.name) }, avatar);
  box.style.setProperty('--tier', sup.color);
  return box;
}

function render(p) {
  document.title = `${p.name} (@${p.handle}) – SlashClient`;
  const rank = RANKS[p.badge];
  const chips = [];
  if (rank) chips.push(el('span', { class: `chip ${rank[1]}` }, rank[2] ? icon(rank[2]) : el('img', { class: 'chip-logo', src: '/vendor/logo.png', alt: '' }), rank[0]));
  // a supporter of the project: the tier in its colour, or "supported" for one who did (payments/support.ts)
  const sup = p.supporter;
  if (sup) {
    const c = el('span', { class: 'chip supporter', title: L(`Wspiera SlashClient od ${day(sup.since)}`, `Supporting SlashClient since ${day(sup.since)}`) },
      icon('fa-solid fa-heart'), sup.active ? L(sup.name, sup.nameEn || sup.name) : L('Wspierał(a)', 'Supported'));
    if (sup.active) c.style.setProperty('--tier', sup.color);
    chips.push(c);
  }
  if (p.clan) {
    const logo = p.clan.logo ? el('img', { class: 'profile-clan-logo', src: p.clan.logo, alt: '' }) : icon('fa-solid fa-people-group');
    if (p.clan.logo) logo.addEventListener('error', () => logo.replaceWith(icon('fa-solid fa-people-group')));
    chips.push(el('span', { class: 'chip blue', title: `${p.clan.name} · ${ROLES[p.clan.role] ?? ''}` }, logo, `[${p.clan.tag}] ${p.clan.name}`));
  }
  // public communities the player shows (communities.ts): a link to each one's page
  for (const c of p.communities ?? []) {
    const logo = c.logo ? el('img', { class: 'profile-clan-logo', src: c.logo, alt: '' }) : icon('fa-solid fa-users');
    if (c.logo) logo.addEventListener('error', () => logo.replaceWith(icon('fa-solid fa-users')));
    chips.push(el('a', { class: 'chip purple link', href: `/s/${encodeURIComponent(c.slug)}`, title: L(`Społeczność · ${c.members} członków`, `Community · ${c.members} members`) }, logo, c.tag ? `#${c.tag} ${c.name}` : c.name));
  }
  for (const name of p.minecraft ?? []) chips.push(el('span', { class: 'chip', title: L('Konto Minecraft', 'Minecraft account') }, icon('fa-solid fa-cube'), name));

  const facts = [el('span', {}, icon('fa-regular fa-calendar'), ' ', L(`W SlashClient od ${day(p.memberSince)}`, `On SlashClient since ${day(p.memberSince)}`))];
  if (sup?.active) facts.push(el('span', { class: 'profile-supporting' }, icon('fa-solid fa-heart'), ' ', L(`Wspiera od ${day(sup.since)}`, `Supporting since ${day(sup.since)}`)));
  if (p.lastOnline) {
    facts.push(p.lastOnline.online
      ? el('span', { class: 'profile-online' }, icon('fa-solid fa-circle'), ' ', L('Teraz online', 'Online now'))
      : el('span', {}, icon('fa-regular fa-clock'), ' ', L(`Ostatnio online: ${seenDay(p.lastOnline.at)}`, `Last online: ${seenDay(p.lastOnline.at)}`)));
  }

  const figureBox = el('div', { class: 'figure profile-figure' });
  const head = el('div', { class: 'glass card profile-head' }, figureBox,
    el('div', { class: 'profile-who' },
      el('div', { class: 'row profile-name' }, framed(p.avatar ? el('img', { class: 'avatar big', src: p.avatar, alt: '', referrerPolicy: 'no-referrer' }) : el('div', { class: 'avatar big', textContent: p.name.slice(0, 1).toUpperCase() }), sup),
        el('div', { class: 'grow' }, el('h1', { textContent: p.name }), el('span', { class: 'muted', textContent: `@${p.handle}` }))),
      chips.length ? el('div', { class: 'row profile-chips' }, ...chips) : '',
      el('div', { class: 'profile-facts muted small' }, ...facts),
      p.moderation?.hidden ? el('div', { class: 'profile-flag' }, icon('fa-solid fa-eye-slash'), ' ',
        L('Profil ukryty przez moderację', 'Profile hidden by moderators'), p.moderation.reason ? `: ${p.moderation.reason}` : '', p.moderation.by ? ` (${p.moderation.by})` : '') : '',
      p.banned ? el('div', { class: 'profile-flag' }, icon('fa-solid fa-ban'), ' ', L('Konto zablokowane', 'Account banned')) : '',
      p.privacy && p.privacy.visibility !== 'public' ? el('div', { class: 'profile-note small muted' }, icon('fa-solid fa-lock'), ' ',
        p.privacy.visibility === 'private' ? L('Profil prywatny: inni go nie widzą.', 'Private profile: nobody else sees it.') : L('Profil widzą tylko znajomi.', 'Only friends see this profile.')) : ''));

  const sections = [head];

  const tiles = [];
  if (p.stats) {
    tiles.push(stat('fa-clock', fmtNumber(p.stats.hours), L('godzin gry', 'hours played')));
    tiles.push(stat('fa-fire', String(p.stats.streak), L('dni z rzędu teraz', 'day streak now')));
    tiles.push(stat('fa-trophy', String(p.stats.bestStreak), L('najdłuższa seria', 'best streak')));
    tiles.push(stat('fa-calendar-check', String(p.stats.daysPlayed), L('dni gry', 'days played')));
    tiles.push(stat('fa-server', String(p.stats.servers), L('serwerów', 'servers played on')));
    if (p.stats.sparks !== undefined) tiles.push(stat('fa-bolt', fmtNumber(p.stats.sparks), L('Iskry', 'Sparks')));
  }
  if (p.friends !== undefined) tiles.push(stat('fa-user-group', String(p.friends), L('znajomych', 'friends')));
  if (p.achievements) tiles.push(stat('fa-medal', `${p.achievements.unlocked}/${p.achievements.total}`, L('osiągnięć', 'achievements')));
  if (tiles.length) sections.push(el('div', { class: 'profile-stats' }, ...tiles));

  if (p.achievements?.list.length) {
    const list = [...p.achievements.list].sort((a, b) => (b.unlockedAt ? 1 : 0) - (a.unlockedAt ? 1 : 0) || (a.unlockedAt && b.unlockedAt ? b.unlockedAt - a.unlockedAt : 0));
    sections.push(el('div', { class: 'glass card' }, el('h3', {}, icon('fa-solid fa-medal'), L(' Osiągnięcia', ' Achievements')),
      el('div', { class: 'profile-achievements' }, ...list.map((a) => {
        const done = !!a.unlockedAt;
        return el('div', { class: `profile-ach${done ? ' done' : ''}`, title: EN ? a.descriptionEn : a.description },
          el('div', { class: 'profile-ach-icon' }, icon(`fa-solid ${done ? (/^fa-[a-z0-9-]+$/.test(a.icon ?? '') ? a.icon : GROUP_ICONS[a.group] ?? 'fa-trophy') : 'fa-lock'}`)),
          el('div', { class: 'grow' },
            el('b', { textContent: EN ? a.nameEn : a.name }),
            el('div', { class: 'muted small', textContent: EN ? a.descriptionEn : a.description }),
            done ? el('div', { class: 'small profile-ach-date' }, icon('fa-solid fa-check'), ` ${day(a.unlockedAt)}`)
              : a.progress !== undefined ? el('div', { class: 'profile-progress' }, el('i', { style: `width:${Math.round(a.progress * 100)}%` })) : '',
            a.reward ? el('div', { class: 'small muted' }, icon('fa-solid fa-gift'), ` ${a.reward.name}`) : ''));
      }))));
  }

  const worn = SLOTS.filter(([slot]) => p.cosmetics?.[slot]);
  if (worn.length) {
    sections.push(el('div', { class: 'glass card' }, el('h3', {}, icon('fa-solid fa-wand-magic-sparkles'), L(' Kosmetyki', ' Cosmetics')),
      el('div', { class: 'profile-cosmetics' }, ...worn.map(([slot, name, ic]) => el('div', { class: 'profile-cosmetic' },
        cosmeticEl(p.cosmetics[slot], slot, true), el('div', { class: 'profile-cosmetic-text' }, el('b', { textContent: p.cosmeticNames?.[p.cosmetics[slot]] ?? p.cosmetics[slot] }),
          el('span', { class: 'small muted' }, icon(ic), ` ${EN ? SLOT_NAMES_EN[slot] ?? name : name}`)))))));
  }

  if (p.servers?.length) {
    sections.push(el('div', { class: 'glass card' }, el('h3', {}, icon('fa-solid fa-server'), L(' Serwery', ' Servers')),
      el('div', { class: 'profile-servers' }, ...p.servers.map((s) => el('div', { class: 'row' },
        el('b', { class: 'grow', textContent: s.address }), el('span', { class: 'muted small', textContent: L(`od ${day(s.since)}`, `since ${day(s.since)}`) }))))));
  }

  if (sections.length === 1 && !p.privacy) sections.push(el('p', { class: 'muted small profile-empty', textContent: L('Gracz nie pokazuje nic więcej na swoim profilu.', 'This player shows nothing else on their profile.') }));

  const tools = p.viewer === 'self' || p.adminView || asPublic ? [toolsBar(p)] : [];
  $('#profile').replaceChildren(...tools, ...sections,
    !tools.length ? el('div', { class: 'row profile-share' }, el('button', { type: 'button', onclick: () => copyLink(`${location.origin}${p.url}`) }, icon('fa-regular fa-copy'), L(' Kopiuj link', ' Copy link'))) : '');
  figure(figureBox, p);
}

async function load() {
  renderNav();
  try {
    const { profile } = await api('GET', `/v1/profiles/${encodeURIComponent(handle)}${asPublic ? '?view=public' : ''}`);
    render(profile);
  } catch (err) {
    const signIn = !token.get() ? el('a', { class: 'btn primary', href: '/konto' }, icon('fa-solid fa-right-to-bracket'), L(' Zaloguj się', ' Sign in')) : '';
    if (err instanceof ApiError && err.code === 'profile_private') {
      message('fa-solid fa-lock', L('Profil prywatny', 'Private profile'), L(`@${handle} nie pokazuje swojego profilu.`, `@${handle} keeps their profile private.`));
    } else if (err instanceof ApiError && err.code === 'profile_friends_only') {
      message('fa-solid fa-user-group', L('Tylko dla znajomych', 'Friends only'),
        L(`Profil @${handle} widzą tylko jego znajomi${token.get() ? '.' : ': zaloguj się, jeśli nim jesteś.'}`, `Only @${handle}'s friends see this profile${token.get() ? '.' : ': sign in if you are one.'}`), signIn);
    } else if (err instanceof ApiError && err.code === 'not_found') {
      message('fa-solid fa-user-slash', L('Nie znaleziono gracza', 'Player not found'), L('Nie ma takiego profilu w SlashClient.', 'There is no such profile on SlashClient.'));
    } else {
      message('fa-solid fa-triangle-exclamation', L('Nie udało się wczytać profilu', 'Could not load the profile'), errorText(err));
    }
  }
}

load();
