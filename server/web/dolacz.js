// "Dołącz do gry" under a player's Discord status (/dolacz?serwer=…&wersja=…, the launcher's joinLink.ts): the page
// opens SlashClient by its own address (slashclient://join), which shows its "join a server" window. The browser
// asks first, and says nothing when the launcher is not installed: so the download and the address are right here.
import { $, el, icon } from './common.js';

const EN = location.pathname.startsWith('/join') || !/^pl\b/i.test(navigator.language || 'pl');
const L = (pl, en) => (EN ? en : pl);
const query = new URLSearchParams(location.search);
const ADDRESS = /^[a-z0-9](?:[a-z0-9-]{0,62}\.)*[a-z0-9-]{1,63}(?::\d{1,5})?$/i;
const server = (query.get('serwer') ?? query.get('server') ?? '').trim().toLowerCase();
const version = (query.get('wersja') ?? query.get('version') ?? '').trim();
const goodVersion = /^[\w.-]{1,32}$/.test(version) ? version : '';

function copyButton(text) {
  const label = () => [icon('fa-regular fa-copy'), ' ', L('Kopiuj adres', 'Copy address')];
  const b = el('button', { class: 'btn', type: 'button' }, ...label());
  b.addEventListener('click', async () => {
    if (!await navigator.clipboard.writeText(text).then(() => true, () => false)) return;
    b.replaceChildren(icon('fa-solid fa-check'), ' ', L('Skopiowano', 'Copied'));
    setTimeout(() => b.replaceChildren(...label()), 1800);
  });
  return b;
}

function main() {
  if (!ADDRESS.test(server)) {
    document.title = L('Nieprawidłowy link – SlashClient', 'Invalid link – SlashClient');
    $('#invite').replaceChildren(el('div', { class: 'glass card' }, el('h1', { textContent: L('Nieprawidłowy link', 'Invalid link') }),
      el('p', { class: 'muted', textContent: L('W linku brakuje adresu serwera.', 'The link has no server address.') }),
      el('a', { class: 'btn', href: EN ? '/en' : '/' }, icon('fa-solid fa-house'), ' ', L('Strona główna', 'Home page'))));
    return;
  }
  document.title = L(`Dołącz do gry na ${server} – SlashClient`, `Join the game on ${server} – SlashClient`);
  const link = `slashclient://join?${new URLSearchParams({ server, ...(goodVersion ? { version: goodVersion } : {}) })}`;
  const open = el('a', { class: 'btn primary', href: link }, icon('fa-solid fa-right-to-bracket'), ' ', L('Otwórz w SlashClient', 'Open in SlashClient'));
  $('#invite').replaceChildren(
    el('div', { class: 'glass card' },
      el('p', { class: 'invite-kicker', textContent: L('Zaproszenie do gry', 'You are invited to play') }),
      el('h1', { textContent: server }),
      el('div', { class: 'invite-server' }, icon('fa-solid fa-cube'), el('span', {}, L('Serwer Minecraft', 'Minecraft server'),
        ...(goodVersion ? [' · ', L('wersja ', 'version '), el('b', { textContent: goodVersion })] : []))),
      el('div', { class: 'row join-actions' }, open, copyButton(server)),
      el('p', { class: 'muted small', textContent: L('Przeglądarka zapyta, czy otworzyć SlashClient. W launcherze wybierasz profil i klikasz „Dołącz”.',
        'Your browser asks whether to open SlashClient. In the launcher you pick a profile and click “Join”.') })),
    el('div', { class: 'glass card' },
      el('h2', {}, icon('fa-solid fa-download'), ' ', L('Nie masz SlashClient?', 'No SlashClient yet?')),
      el('p', { class: 'muted', textContent: L('Pobierz darmowy launcher, zainstaluj go i wróć do tego linku. Możesz też dodać serwer w zwykłym Minecrafcie: Tryb wieloosobowy → Dodaj serwer → wklej adres.',
        'Get the free launcher, install it and come back to this link. You can also add the server in plain Minecraft: Multiplayer → Add Server → paste the address.') }),
      el('div', { class: 'row' }, el('a', { class: 'btn primary', href: EN ? '/en#pobierz' : '/#pobierz' }, icon('fa-solid fa-download'), ' ', L('Pobierz SlashClient', 'Download SlashClient')))));
  // straight away, as from the button (the browser asks; nothing happens without the launcher)
  setTimeout(() => {
    location.href = link;
  }, 300);
}

main();
