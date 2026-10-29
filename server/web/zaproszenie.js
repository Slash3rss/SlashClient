// An invite link to a community (/c/<code>, communityLinks.ts): the community (private ones too:
// the link is the invite), its game server, and how to get in. The launcher registers no address
// of its own (slashclient://), so the page gives the code to paste in the launcher:
// Znajomi → Społeczności → the link button ("Dołącz przez zaproszenie").
import { $, api, el, icon } from './common.js';

const code = decodeURIComponent(location.pathname.split('/')[2] ?? '').toLowerCase();
const EN = !/^pl\b/i.test(navigator.language || 'pl');
const L = (pl, en) => (EN ? en : pl);
const LOCALE = EN ? 'en-GB' : 'pl-PL';
const when = (ms) => new Date(ms).toLocaleString(LOCALE, { dateStyle: 'long', timeStyle: 'short' });
/** "1 członek", "3 członków" (and "2 członków" as the launcher says it). */
const membersText = (n) => (n === 1 ? L('1 członek', '1 member') : L(`${n} członków`, `${n} members`));

/** The badge of an official community, by its name. */
export const verifiedBadge = () => el('span', { class: 'verified-badge', title: L('Zweryfikowana społeczność', 'Verified community') }, icon('fa-solid fa-circle-check'));

function message(title, text) {
  $('#invite').replaceChildren(el('div', { class: 'glass card' }, el('h1', { textContent: title }), el('p', { class: 'muted', textContent: text }),
    el('a', { class: 'btn', href: '/' }, icon('fa-solid fa-house'), ' ', L('Strona główna', 'Home page'))));
}

async function main() {
  let error = '';
  const res = await api('GET', `/v1/public/communities/links/${encodeURIComponent(code)}`).catch((err) => {
    error = err?.code ?? 'offline';
    return undefined;
  });
  if (!res?.community) {
    document.title = L('Zaproszenie nieważne – SlashClient', 'Invalid invite – SlashClient');
    if (error === 'feature_disabled') return message(L('Społeczności są chwilowo wyłączone', 'Communities are switched off for now'), L('Spróbuj później.', 'Try again later.'));
    if (error === 'rate_limited') return message(L('Za dużo prób', 'Too many tries'), L('Odczekaj minutę i odśwież stronę.', 'Wait a minute and reload the page.'));
    if (error === 'invite_expired') return message(L('Zaproszenie wygasło', 'This invite has expired'), L('Ten link wygasł albo wykorzystano już wszystkie jego użycia. Poproś o nowy.', 'This link has expired or has no uses left. Ask for a new one.'));
    return message(L('Nie ma takiego zaproszenia', 'No such invite'), L('Link jest nieprawidłowy albo zaproszenie zostało cofnięte.', 'The link is wrong or the invite was revoked.'));
  }
  const c = res.community;
  document.title = L(`Zaproszenie do ${c.name} – SlashClient`, `Invite to ${c.name} – SlashClient`);
  const logo = c.logoUrl ? el('img', { class: 'avatar big community-logo', src: c.logoUrl, alt: '' }) : el('div', { class: 'avatar big' }, icon('fa-solid fa-users'));
  const chips = [el('span', { class: 'chip purple' }, icon('fa-solid fa-users'), ' ', membersText(c.members))];
  if (c.verified) chips.push(el('span', { class: 'chip verified' }, icon('fa-solid fa-circle-check'), ' ', L('Zweryfikowana', 'Verified')));
  if (c.tag) chips.push(el('span', { class: 'chip' }, `#${c.tag}`));
  if (c.visibility === 'private') chips.push(el('span', { class: 'chip' }, icon('fa-solid fa-lock'), ' ', L('Prywatna', 'Private')));
  const link = `${location.origin}/c/${code}`;
  const copy = el('button', { class: 'btn primary', type: 'button' }, icon('fa-regular fa-copy'), ' ', L('Kopiuj link', 'Copy link'));
  copy.addEventListener('click', async () => {
    // "copied" only when it was; otherwise the link is shown to copy by hand
    if (!await navigator.clipboard.writeText(link).then(() => true, () => false)) {
      copy.replaceWith(el('input', { type: 'text', value: link, readOnly: true, class: 'invite-link', onfocus: (e) => e.target.select() }));
      return;
    }
    copy.replaceChildren(icon('fa-solid fa-check'), ' ', L('Skopiowano', 'Copied'));
    setTimeout(() => copy.replaceChildren(icon('fa-regular fa-copy'), ' ', L('Kopiuj link', 'Copy link')), 1800);
  });
  const limits = [
    res.expiresAt ? L(`Ważne do ${when(res.expiresAt)}`, `Valid until ${when(res.expiresAt)}`) : L('Nie wygasa', 'Does not expire'),
    res.usesLeft !== undefined ? L(`pozostało użyć: ${res.usesLeft}`, `uses left: ${res.usesLeft}`) : '',
  ].filter(Boolean).join(' · ');
  const server = c.server
    ? el('div', { class: 'invite-server' }, icon('fa-solid fa-cube'), el('span', {}, L('Serwer społeczności: ', 'The community\'s server: '), el('b', { textContent: c.server.address }),
      c.server.version ? ` · ${c.server.version}` : ''))
    : '';
  $('#invite').replaceChildren(
    el('div', { class: 'glass card' },
      el('p', { class: 'invite-kicker', textContent: L('Zaproszenie do społeczności', 'You are invited to a community') }),
      el('div', { class: 'row profile-name' }, logo, el('div', {}, el('h1', {}, c.name, c.verified ? verifiedBadge() : ''), el('div', { class: 'row profile-chips' }, ...chips))),
      c.description ? el('p', { class: 'community-description', textContent: c.description }) : '',
      server,
      el('p', { class: 'muted small invite-meta', textContent: limits })),
    el('div', { class: 'glass card' },
      el('h2', {}, icon('fa-solid fa-right-to-bracket'), ' ', L('Otwórz w SlashClient', 'Open in SlashClient')),
      el('ol', { class: 'invite-steps' },
        el('li', {}, L('Otwórz launcher SlashClient i zaloguj się w zakładce ', 'Open the SlashClient launcher and sign in on the '), el('b', { textContent: L('Znajomi', 'Friends') }), L('.', ' tab.')),
        el('li', {}, L('Przy „Społecznościach” kliknij ', 'Next to “Communities” click '), icon('fa-solid fa-link'), ' ', el('b', { textContent: L('Dołącz przez zaproszenie', 'Join with an invite') }), '.'),
        el('li', {}, L('Wklej link albo sam kod:', 'Paste the link or just the code:'))),
      el('div', { class: 'invite-code-row' }, el('div', { class: 'invite-code', textContent: code.toUpperCase() }), copy),
      el('p', { class: 'muted small', textContent: L('Nie masz launchera? Pobierz go, zaloguj się i wklej ten sam link.', 'No launcher yet? Download it, sign in and paste the same link.') }),
      el('div', { class: 'row' }, el('a', { class: 'btn', href: '/#pobierz' }, icon('fa-solid fa-download'), ' ', L('Pobierz SlashClient', 'Download SlashClient'))),
      el('p', { class: 'muted small', textContent: L('Czat społeczności nie jest szyfrowany od nadawcy do odbiorcy: moderatorzy społeczności i administracja SlashClient mogą czytać i usuwać wiadomości.', 'Community chat is not end-to-end encrypted: the community\'s moderators and SlashClient staff can read and remove messages.') })));
}

main();
