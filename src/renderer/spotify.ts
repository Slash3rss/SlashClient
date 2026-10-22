import { t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * Spotify in the account window (server 0.9.36+, spotify.ts there): link or unlink the account
 * whose music the game's "Spotify" module shows. Hidden when the server has no Spotify app set up
 * (and nothing is linked), or is older.
 */

interface MySpotify { available: boolean; linked: boolean; name: string }

export interface SpotifyDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

/** Error codes of linking Spotify, in the player's words (the rest go to errorText). */
export function spotifyError(err: unknown, fallback: (err: unknown) => string): string {
  const code = (err as { code?: string })?.code;
  if (code === 'spotify_not_allowed') return t('Aplikacja SlashClient w Spotify działa na razie tylko dla kont dodanych przez administratora.');
  if (code === 'provider_disabled') return t('Spotify nie jest jeszcze skonfigurowany na serwerze.');
  if (code === 'provider_denied') return t('Łączenie Spotify zostało anulowane.');
  if (code === 'provider_failed') return t('Nie udało się połączyć Spotify. Spróbuj ponownie.');
  return fallback(err);
}

export function createSpotifySection(deps: SpotifyDeps) {
  const box = el('div', { className: 'fr-spotify' });
  let state: MySpotify | undefined;
  let busy = false;

  async function load() {
    try {
      state = await deps.api.socialApi('GET', '/v1/me/spotify');
    } catch {
      // an older server without Spotify: the section stays empty
      state = undefined;
    }
    draw();
  }

  async function link() {
    busy = true;
    draw();
    try {
      state = await deps.api.socialLinkSpotify();
      deps.toast(t('Połączono Spotify. Włącz moduł „Spotify” w ustawieniach HUD w grze.'));
    } catch (err) {
      deps.toast(spotifyError(err, deps.errorText), true);
    } finally {
      busy = false;
      draw();
    }
  }

  async function unlink() {
    if (!confirm(t('Odłączyć Spotify? Moduł „Spotify” w grze przestanie pokazywać, czego słuchasz.'))) return;
    try {
      state = await deps.api.socialApi('DELETE', '/v1/me/spotify');
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    }
    draw();
  }

  function draw() {
    const s = state;
    if (!s || (!s.available && !s.linked)) return box.replaceChildren();
    const mark = () => el('i', { className: 'fa-brands fa-spotify spotify-mark' });
    let chip: HTMLElement;
    if (s.linked) {
      chip = el('button', { type: 'button', className: 'fr-chip on spotify', title: t('Połączone: Spotify ({0}). Kliknij, żeby odłączyć.', s.name) }, mark(), s.name || 'Spotify');
      chip.addEventListener('click', () => unlink());
    } else {
      chip = el('button', { type: 'button', className: 'fr-chip spotify', title: t('Połącz konto Spotify: moduł „Spotify” w grze pokaże, czego słuchasz'), disabled: busy }, mark(), icon('fa-plus'), t(' Połącz Spotify'));
      chip.addEventListener('click', () => link());
    }
    box.replaceChildren(
      el('div', { className: 'fr-linked-row' }, el('small', { className: 'muted', textContent: t('Muzyka:') }), el('div', { className: 'fr-linked' }, chip)),
      el('small', { className: 'muted fr-hint', textContent: s.linked
        ? t('Moduł „Spotify” w grze (ustawienia HUD) pokazuje utwór, który leci na Twoim koncie.')
        : t('Po połączeniu włącz w grze moduł „Spotify” w ustawieniach HUD. SlashClient tylko odczytuje, co grasz.') }));
  }

  return { element: box, load };
}
