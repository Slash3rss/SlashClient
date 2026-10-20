// The account page's "Streamy" card: link a Twitch or Kick channel (not a way to sign in, only to
// show friends and the profile when the player is live), unlink it, and the two choices: hide the
// live status from friends, and be told when friends go live. The server keeps it (streams/streams.ts).
import { ApiError, api, el, errorText, guard, icon, toast } from './common.js';
import { platformIcon } from './profileStream.js';

const NAMES = { twitch: 'Twitch', kick: 'Kick' };
const ERRORS = {
  already_linked: 'Ten kanał jest już połączony z innym kontem SlashClient.',
  provider_denied: 'Łączenie zostało anulowane.',
  provider_failed: 'Nie udało się połączyć kanału. Spróbuj ponownie.',
  provider_disabled: 'Ta platforma nie jest jeszcze skonfigurowana na serwerze.',
  login_expired: 'Łączenie wygasło. Spróbuj ponownie.',
};
const say = (err) => toast(ERRORS[err?.code] ?? errorText(err), true);

/** The card, or null when the server has no "Streamy" (an older one, or switched off). */
export async function streamsCard() {
  let state = await api('GET', '/v1/me/streams').catch(() => undefined);
  if (!state) return null;
  const card = el('div', { class: 'glass card streams-card', id: 'streamy' });

  async function link(platform, button) {
    button.disabled = true;
    const popup = window.open('about:blank', 'slashclient-stream', 'width=520,height=720');
    try {
      const { state: s, url } = await api('POST', `/v1/me/streams/${platform}/start`);
      if (!/^https:\/\//.test(url)) throw new ApiError('provider_failed', 400);
      if (popup) popup.location.href = url;
      else window.open(url, '_blank', 'noopener');
      const started = Date.now();
      while (Date.now() - started < 10 * 60_000) {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await api('GET', `/v1/me/streams/poll?state=${encodeURIComponent(s)}`);
        if (res.pending) continue;
        state = res.streams;
        toast(`Połączono kanał ${NAMES[platform]}.`);
        draw();
        return;
      }
      throw new ApiError('login_expired', 400);
    } catch (err) {
      popup?.close();
      say(err);
    } finally {
      button.disabled = false;
    }
  }

  async function unlink(a) {
    if (!confirm(`Odłączyć kanał ${NAMES[a.platform]} ${a.login}? Znajomi przestaną widzieć, że nadajesz.`)) return;
    const res = await guard(() => api('DELETE', `/v1/me/streams/${a.platform}`));
    if (res) {
      state = res;
      draw();
    }
  }

  async function pref(key, value) {
    const res = await api('POST', '/v1/me/streams/prefs', { [key]: value }).catch((err) => { say(err); return undefined; });
    if (res) state = res;
    draw();
  }

  function draw() {
    const rows = ['twitch', 'kick'].map((p) => {
      const a = state.accounts.find((x) => x.platform === p);
      if (a) {
        return el('div', { class: 'row stream-row' }, platformIcon(p),
          el('a', { class: 'grow', href: a.url, target: '_blank', rel: 'noopener noreferrer', textContent: `${NAMES[p]}: ${a.name}` }),
          a.live ? el('span', { class: 'chip red', textContent: 'LIVE' }) : '',
          el('button', { type: 'button', class: 'icon-btn', title: 'Odłącz', onclick: () => unlink(a) }, icon('fa-solid fa-link-slash')));
      }
      if (!state.platforms.includes(p)) return '';
      const button = el('button', { type: 'button' }, platformIcon(p), ` Połącz ${NAMES[p]}`);
      button.addEventListener('click', () => link(p, button));
      return el('div', { class: 'row stream-row' }, button);
    });
    const check = (key, label, value) => {
      const box = el('input', { type: 'checkbox', checked: value, onchange: () => pref(key, box.checked) });
      return el('label', { class: 'row small' }, el('span', { class: 'switch' }, box, el('span')), label);
    };
    card.replaceChildren(
      el('h3', {}, icon('fa-solid fa-video'), ' Streamy'),
      el('p', { class: 'muted small', textContent: 'Połącz kanał, a znajomi zobaczą znaczek LIVE, gdy nadajesz Minecrafta, a Twój profil pokaże transmisję. To nie jest sposób logowania; SlashClient nie zachowuje dostępu do konta platformy.' }),
      ...rows,
      state.accounts.length || state.platforms.length ? '' : el('p', { class: 'muted small', textContent: 'Łączenie kanałów nie jest jeszcze skonfigurowane na tym serwerze.' }),
      check('hide', 'Ukryj przed znajomymi, że streamuję', state.prefs.hide),
      check('notify', 'Powiadamiaj, gdy znajomi zaczynają streamować', state.prefs.notify));
  }
  draw();
  return card;
}
