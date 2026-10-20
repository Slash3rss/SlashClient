import { t } from '../shared/i18n';
import { control, el, icon } from './dialog';

/**
 * "Profile privacy" from Friends: who sees the player's public profile on the site (/u/<handle>)
 * and which parts of it. The server keeps and enforces the settings (server/src/profiles.ts); this
 * window only edits them, with links to see the profile and copy its address.
 */

type Visibility = 'public' | 'friends' | 'private';
interface Privacy { visibility: Visibility; elements: Record<string, boolean>; indexable: boolean }
interface State { privacy: Privacy; hidden: boolean; url: string }

interface Deps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

export const PROFILE_ELEMENTS: [string, string][] = [
  ['stats', 'Statystyki (godziny gry, serie, dni gry)'],
  ['achievements', 'Osiągnięcia'],
  ['cosmetics', 'Noszone kosmetyki'],
  ['clan', 'Klan'],
  ['communities', 'Społeczności (tylko publiczne, które zostawisz włączone)'],
  ['minecraft', 'Konta Minecraft (nicki)'],
  ['friends', 'Liczba znajomych'],
  ['servers', 'Serwery, na których grasz'],
  ['lastOnline', 'Kiedy ostatnio byłeś online'],
  ['streams', 'Streamy (połączone kanały Twitch i Kick, transmisja na żywo)'],
];

/** Opens the player's own profile in the browser, or copies its address. */
export async function profileLink(deps: Deps, handle: string, how: 'open' | 'copy') {
  try {
    const url: string = await deps.api.socialProfileUrl(handle, how === 'open');
    if (how === 'copy') {
      await navigator.clipboard.writeText(url);
      deps.toast(t('Skopiowano link do profilu.'));
    }
  } catch (err) {
    deps.toast(deps.errorText(err), true);
  }
}

export async function openProfilePrivacy(deps: Deps, handle: string) {
  let state: State;
  try {
    state = await deps.api.socialApi('GET', '/v1/me/profile-privacy');
  } catch (err) {
    // an older server without profiles
    deps.toast(deps.errorText(err), true);
    return;
  }
  const body = el('div', { className: 'pp-body' });
  const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
  const modal = el('div', { className: 'modal' }, el('div', { className: 'modal-box glass-panel pp-box' }, close, body));
  const done = () => {
    modal.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      done();
    }
  };
  close.addEventListener('click', done);
  modal.addEventListener('click', (e) => e.target === modal && done());
  document.addEventListener('keydown', onKey, true);

  const save = async (change: Record<string, unknown>) => {
    try {
      state = await deps.api.socialApi('POST', '/v1/me/profile-privacy', change);
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    }
    draw();
  };

  function draw() {
    const p = state.privacy;
    const options = el('div', { className: 'pp-visibility' });
    for (const [value, name, ic, hint] of [
      ['public', t('Wszyscy'), 'fa-earth-europe', t('Każdy z linkiem, także bez logowania.')],
      ['friends', t('Znajomi'), 'fa-user-group', t('Tylko Twoi znajomi z SlashClient.')],
      ['private', t('Tylko ja'), 'fa-lock', t('Nikt poza Tobą.')],
    ] as const) {
      const b = el('button', { type: 'button', className: p.visibility === value ? 'selected' : '' }, icon(ic),
        el('span', {}, el('b', { textContent: name }), el('small', { className: 'muted', textContent: hint })));
      b.addEventListener('click', () => p.visibility !== value && save({ visibility: value }));
      options.append(b);
    }
    const switches = el('div', { className: 'pp-elements' });
    for (const [key, name] of PROFILE_ELEMENTS) {
      const box = control<HTMLInputElement>('input', { type: 'checkbox', checked: !!p.elements[key], disabled: p.visibility === 'private' });
      box.addEventListener('change', () => save({ elements: { [key]: box.checked } }));
      switches.append(el('label', { className: 'check' }, box, ` ${t(name)}`));
    }
    const index = control<HTMLInputElement>('input', { type: 'checkbox', checked: p.indexable, disabled: p.visibility !== 'public' });
    index.addEventListener('change', () => save({ indexable: index.checked }));
    const see = el('button', { type: 'button', className: 'primary' }, icon('fa-id-card'), t(' Zobacz swój profil'));
    see.addEventListener('click', () => profileLink(deps, handle, 'open'));
    const copy = el('button', { type: 'button' }, icon('fa-copy'), t(' Kopiuj link'));
    copy.addEventListener('click', () => profileLink(deps, handle, 'copy'));
    body.replaceChildren(
      el('h2', {}, icon('fa-user-lock'), t(' Prywatność profilu')),
      el('p', { className: 'muted', textContent: t('Twój profil na stronie pokazuje statystyki, osiągnięcia i kosmetyki. Wybierz, kto go widzi i co na nim jest. Ty zawsze widzisz całość.') }),
      state.hidden ? el('p', { className: 'pp-hidden', textContent: t('Moderacja ukryła Twój profil: inni go nie widzą.') }) : '',
      el('div', { className: 'row pp-links' }, see, copy),
      el('h3', { textContent: t('Kto widzi profil') }), options,
      el('h3', { textContent: t('Co jest na profilu') }), switches,
      el('label', { className: 'check pp-index' }, index, t(' Pozwól wyszukiwarkom (Google itp.) pokazywać mój profil')));
  }
  draw();
  document.body.append(modal);
}
