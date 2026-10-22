// The account page's "Spotify" card: link a Spotify account (only to show in the game what plays:
// the HUD's "Spotify" module) or unlink it. The server keeps it (spotify.ts); without the admin's
// Spotify app the card is not shown.
import { ApiError, api, el, errorText, guard, icon, toast } from './common.js';

const ERRORS = {
  provider_denied: 'Łączenie zostało anulowane.',
  provider_failed: 'Nie udało się połączyć Spotify. Spróbuj ponownie.',
  provider_disabled: 'Spotify nie jest jeszcze skonfigurowany na serwerze.',
  spotify_not_allowed: 'Aplikacja SlashClient w Spotify działa na razie tylko dla kont dodanych przez administratora.',
  login_expired: 'Łączenie wygasło. Spróbuj ponownie.',
};
const say = (err) => toast(ERRORS[err?.code] ?? errorText(err), true);

/** The card, or null when the server has no Spotify (an older one, or not set up and nothing linked). */
export async function spotifyCard() {
  let state = await api('GET', '/v1/me/spotify').catch(() => undefined);
  if (!state || (!state.available && !state.linked)) return null;
  const card = el('div', { class: 'glass card spotify-card', id: 'spotify' });

  async function link(button) {
    button.disabled = true;
    const popup = window.open('about:blank', 'slashclient-spotify', 'width=520,height=760');
    try {
      const { state: s, url } = await api('POST', '/v1/me/spotify/start');
      if (!/^https:\/\//.test(url)) throw new ApiError('provider_failed', 400);
      if (popup) popup.location.href = url;
      else window.open(url, '_blank', 'noopener');
      const started = Date.now();
      while (Date.now() - started < 10 * 60_000) {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await api('GET', `/v1/me/spotify/poll?state=${encodeURIComponent(s)}`);
        if (res.pending) continue;
        state = res.spotify;
        toast('Połączono Spotify.');
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

  async function unlink() {
    if (!confirm('Odłączyć Spotify? Moduł „Spotify” w grze przestanie pokazywać, czego słuchasz.')) return;
    const res = await guard(() => api('DELETE', '/v1/me/spotify'));
    if (res) {
      state = res;
      draw();
    }
  }

  function draw() {
    let row;
    if (state.linked) {
      row = el('div', { class: 'row stream-row' }, icon('fa-brands fa-spotify spotify-mark'),
        el('span', { class: 'grow', textContent: `Spotify: ${state.name}` }),
        el('button', { type: 'button', class: 'icon-btn', title: 'Odłącz', onclick: unlink }, icon('fa-solid fa-link-slash')));
    } else {
      const button = el('button', { type: 'button' }, icon('fa-brands fa-spotify'), ' Połącz Spotify');
      button.addEventListener('click', () => link(button));
      row = el('div', { class: 'row stream-row' }, button);
    }
    card.replaceChildren(
      el('h3', {}, icon('fa-brands fa-spotify'), ' Spotify'),
      el('p', { class: 'muted small', textContent: 'Połącz konto, a moduł „Spotify” w grze (ustawienia HUD) pokaże utwór, który właśnie leci. SlashClient tylko odczytuje, co grasz; nie steruje odtwarzaniem. Dostęp możesz też cofnąć na spotify.com/account/apps.' }),
      row,
      state.available ? '' : el('p', { class: 'muted small', textContent: 'Spotify jest chwilowo wyłączony na serwerze.' }));
  }
  draw();
  return card;
}
