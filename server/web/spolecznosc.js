// A public community's page (/s/<tag or id>): its logo, name, description, how many are in it and
// who runs it, with how to join (in the launcher, Friends → Społeczności). Private communities have
// no page (communities.ts answers 404 for them).
import { $, api, el, icon } from './common.js';

const slug = decodeURIComponent(location.pathname.split('/')[2] ?? '');
const EN = !/^pl\b/i.test(navigator.language || 'pl');
const L = (pl, en) => (EN ? en : pl);
const LOCALE = EN ? 'en-GB' : 'pl-PL';
const day = (ms) => new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

async function main() {
  const box = $('#community');
  let off = false;
  const res = await api('GET', `/v1/public/communities/${encodeURIComponent(slug)}`).catch((err) => {
    // communities switched off in the admin panel for a while
    off = err?.code === 'feature_disabled';
    return undefined;
  });
  if (off) {
    box.replaceChildren(el('div', { class: 'glass card' }, el('h1', { textContent: L('Społeczności są chwilowo wyłączone', 'Communities are switched off for now') }),
      el('p', { class: 'muted', textContent: L('Spróbuj później.', 'Try again later.') })));
    return;
  }
  if (!res?.community) {
    document.title = L('Nie znaleziono – SlashClient', 'Not found – SlashClient');
    box.replaceChildren(el('div', { class: 'glass card' }, el('h1', { textContent: L('Nie ma takiej społeczności', 'No such community') }),
      el('p', { class: 'muted', textContent: L('Może została usunięta albo jest prywatna.', 'It may have been deleted, or it is private.') })));
    return;
  }
  const c = res.community;
  document.title = `${c.name} – SlashClient`;
  const logo = c.logoUrl ? el('img', { class: 'avatar big community-logo', src: c.logoUrl, alt: '' }) : el('div', { class: 'avatar big' }, icon('fa-solid fa-users'));
  const chips = [el('span', { class: 'chip purple' }, icon('fa-solid fa-users'), ' ', L(`${c.members} członków`, `${c.members} members`))];
  if (c.tag) chips.push(el('span', { class: 'chip' }, `#${c.tag}`));
  chips.push(el('span', { class: 'chip' }, icon(c.joinMode === 'open' ? 'fa-solid fa-door-open' : 'fa-solid fa-hand'), ' ',
    c.joinMode === 'open' ? L('Otwarta: dołącza każdy', 'Open: anyone can join') : L('Dołączenie na prośbę', 'Join on request')));
  const owner = c.owner?.handle ? el('a', { href: `/u/${encodeURIComponent(c.owner.handle)}`, textContent: c.owner.name || c.owner.handle }) : el('span', { textContent: '—' });
  box.replaceChildren(
    el('div', { class: 'glass card' },
      el('div', { class: 'row profile-name' }, logo, el('div', {}, el('h1', { textContent: c.name }), el('div', { class: 'row' }, ...chips))),
      c.description ? el('p', { class: 'community-description', textContent: c.description }) : '',
      el('p', { class: 'muted' }, icon('fa-solid fa-crown'), ' ', L('Założyciel: ', 'Owner: '), owner, ' · ', L(`od ${day(c.createdAt)}`, `since ${day(c.createdAt)}`))),
    el('div', { class: 'glass card' },
      el('h2', {}, icon('fa-solid fa-right-to-bracket'), ' ', L('Jak dołączyć?', 'How to join?')),
      el('p', { textContent: L('Otwórz launcher SlashClient, wejdź w Znajomi → Społeczności → Odkrywaj i wyszukaj tę społeczność.', 'Open the SlashClient launcher, go to Friends → Communities → Discover and search for this community.') }),
      el('p', { class: 'muted small', textContent: L('Czat społeczności nie jest szyfrowany od nadawcy do odbiorcy: moderatorzy społeczności i administracja SlashClient mogą czytać i usuwać wiadomości.', 'Community chat is not end-to-end encrypted: the community\'s moderators and SlashClient staff can read and remove messages.') }),
      el('a', { class: 'btn primary', href: '/#pobierz' }, icon('fa-solid fa-download'), ' ', L('Pobierz SlashClient', 'Download SlashClient'))));
}

main();
