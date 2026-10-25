import { locale, t } from '../shared/i18n';
import { confirmDialog, control, el, icon, modalWindow } from './dialog';

/**
 * "Szyfrowanie czatu" in the account window, the question about a new device of the account, and the
 * line above a chat whose older messages this launcher cannot read yet (src/main/chatKeys.ts does
 * the work; nothing secret comes to the page: only names, dates and fingerprints).
 */

interface DeviceView { device: string; name: string; createdAt?: number; lastSeen: number; handover: string; fingerprint: string; own: boolean }
export interface ChatKeysView {
  supported: boolean; device: string; fingerprint: string; devices: DeviceView[];
  backup: { device: string; createdAt: number; updatedAt: number; unlocked: boolean } | null;
  revoked: boolean;
  sharing: { device: string; done: number; backup?: boolean; own?: boolean }[];
}

export interface ChatKeysDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** messages became readable here: the open chats are fetched again */
  historyChanged: () => void;
}

/** The checks' words from the main process ("chatkeys:wrong_password:30") as a sentence. */
export function chatKeysErrorText(raw: string): string | undefined {
  const m = /chatkeys:(\w+)(?::(\d+))?/.exec(raw);
  if (!m) return undefined;
  switch (m[1]) {
    case 'wrong_password': return t('To nie jest hasło czatu. Spróbuj jeszcze raz.');
    case 'wait': return t('Za dużo prób. Spróbuj ponownie za {0} s.', m[2] ?? '30');
    case 'too_short': return t('Hasło czatu musi mieć co najmniej 10 znaków.');
    case 'too_long': return t('Hasło czatu jest za długie.');
    case 'too_simple': return t('Hasło czatu jest zbyt proste – dodaj cyfry lub inne znaki albo je wydłuż.');
    case 'too_common': return t('To hasło jest zbyt popularne. Wymyśl inne.');
    case 'bad_backup': return t('Kopia klucza na serwerze nie pasuje do konta. Nie użyto jej.');
    case 'changed': return t('Klucz tego urządzenia zmienił się. Sprawdź kod jeszcze raz.');
    case 'not_found': return t('Tego urządzenia już nie ma.');
    default: return undefined;
  }
}

export function createChatKeys(deps: ChatKeysDeps) {
  let view: ChatKeysView | undefined;
  const box = el('div', { className: 'fr-chatkeys' });
  let boxOpen = false;
  /** new devices waiting to be asked about (one window at a time) */
  const queue: DeviceView[] = [];
  let asking = false;

  const errorText = (err: unknown) => chatKeysErrorText(String((err as Error)?.message ?? err)) ?? deps.errorText(err);
  const date = (at: number | undefined) => (at ? new Date(at).toLocaleString(locale(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const nameOf = (d: DeviceView) => d.name || t('Urządzenie bez nazwy (telefon lub starszy launcher)');

  function set(next: ChatKeysView | undefined) {
    view = next;
    if (boxOpen) draw();
    // the line above an open chat follows (progress, the backup opened)
    for (const old of document.querySelectorAll('.fr-chatkeys-notice')) {
      const fresh = notice(true);
      if (fresh) old.replaceWith(fresh);
      else old.remove();
    }
  }

  async function load() {
    try {
      set(await deps.api.chatKeysState());
    } catch {
      set(undefined);
    }
  }

  /** "Nowe urządzenie: <nazwa>, <data>. Udostępnić mu historię czatu?" with its fingerprint to compare. */
  function askNext() {
    if (asking) return;
    const d = queue.shift();
    if (!d) return;
    asking = true;
    const yes = el('button', { type: 'button', className: 'primary' }, icon('fa-share-nodes'), ` ${t('Udostępnij')}`);
    const no = el('button', { type: 'button' }, t('Nie'));
    let answered = false;
    const close = modalWindow(t('Nowe urządzenie'), [
      el('p', { textContent: t('Nowe urządzenie: {0}, {1}. Udostępnić mu historię czatu?', nameOf(d), date(d.createdAt)) }),
      el('div', { className: 'fr-chatkeys-code' }, el('small', { className: 'muted', textContent: t('Kod urządzenia') }), el('b', { textContent: d.fingerprint })),
      el('p', { className: 'muted', textContent: t('Sprawdź, czy na nowym urządzeniu widać ten sam kod (Znajomi → Konto i profil → Szyfrowanie czatu). Jeśli to nie Twoje urządzenie, wybierz „Nie” i usuń je z listy urządzeń.') }),
    ], [no, yes], () => {
      asking = false;
      // closed without an answer: asked again next time the launcher starts
      setTimeout(askNext, 300);
    }, 'fr-group-modal fr-chatkeys-ask');
    const answer = async (share: boolean) => {
      if (answered) return;
      answered = true;
      yes.disabled = no.disabled = true;
      try {
        set(await deps.api.chatKeysDecide(d.device, share, d.fingerprint));
        if (share) deps.toast(t('Udostępniam historię czatu urządzeniu {0}…', nameOf(d)));
      } catch (err) {
        deps.toast(errorText(err), true);
      }
      close();
    };
    yes.addEventListener('click', () => void answer(true));
    no.addEventListener('click', () => void answer(false));
  }

  /** A password typed twice, with the warning and the rule; resolves with it (or undefined). */
  function passwordWindow(opts: { title: string; intro: string[]; current?: boolean; repeat: boolean; ok: string; run: (pw: string, current: string) => Promise<unknown> }) {
    const field = (placeholder: string) => control<HTMLInputElement>('input', { type: 'password', placeholder, autocomplete: 'new-password', className: 'fr-chatkeys-pw', maxLength: 256 });
    const current = opts.current ? field(t('Obecne hasło czatu')) : undefined;
    const pw = field(opts.repeat ? t('Nowe hasło czatu') : t('Hasło czatu'));
    const again = opts.repeat ? field(t('Powtórz hasło')) : undefined;
    const error = el('p', { className: 'fr-error fr-chatkeys-error' });
    const ok = el('button', { type: 'button', className: 'primary' }, opts.ok);
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const close = modalWindow(opts.title, [
      ...opts.intro.map((line, i) => el('p', { className: i ? 'muted' : '', textContent: line })),
      ...(current ? [current] : []), pw, ...(again ? [again] : []), error,
    ], [cancel, ok], undefined, 'fr-group-modal fr-chatkeys-window');
    cancel.addEventListener('click', () => close());
    const submit = async () => {
      error.textContent = '';
      if (again && pw.value !== again.value) {
        error.textContent = t('Hasła się różnią.');
        return;
      }
      ok.disabled = true;
      ok.replaceChildren(el('span', { className: 'spinner' }), ` ${opts.ok}`);
      try {
        await opts.run(pw.value, current?.value ?? '');
        close();
      } catch (err) {
        error.textContent = errorText(err);
        ok.disabled = false;
        ok.replaceChildren(opts.ok);
      }
    };
    ok.addEventListener('click', () => void submit());
    for (const input of [current, pw, again]) input?.addEventListener('keydown', (e) => e.key === 'Enter' && void submit());
    (current ?? pw).focus();
  }

  const WARNING = () => t('Bez hasła czatu kopii nie da się odzyskać: nie zna go nikt poza Tobą – ani serwer, ani SlashClient. Zapisz je w bezpiecznym miejscu.');
  const RULE = () => t('Co najmniej 10 znaków; krótsze niż 14 – z cyfrą albo innym znakiem.');

  function setBackup() {
    passwordWindow({
      title: t('Kopia klucza czatu'),
      intro: [t('Zaszyfrowana Twoim hasłem kopia klucza trafi na serwer. Na nowym komputerze wpiszesz to hasło i odczytasz całą historię czatu.'), WARNING(), RULE()],
      repeat: true, ok: t('Zapisz kopię'),
      run: async (pw) => {
        set(await deps.api.chatKeysSetBackup(pw));
        deps.toast(t('Kopia klucza czatu zapisana. Historia jest do niej dopisywana w tle.'));
      },
    });
  }

  function changeBackup() {
    passwordWindow({
      title: t('Zmień hasło czatu'), intro: [WARNING(), RULE()], current: true, repeat: true, ok: t('Zmień hasło'),
      run: async (pw, current) => {
        set(await deps.api.chatKeysChangeBackup(current, pw));
        deps.toast(t('Hasło czatu zmienione.'));
      },
    });
  }

  async function removeBackup() {
    const ok = await confirmDialog({
      title: t('Usunąć kopię klucza czatu?'),
      body: [el('p', { className: 'muted', textContent: t('Kopia zniknie z serwera, a nowe wiadomości nie będą już dla niej szyfrowane. Hasło czatu przestanie cokolwiek otwierać.') })],
      ok: t('Usuń kopię'), danger: true, okIcon: 'fa-trash',
    });
    if (!ok) return;
    try {
      set(await deps.api.chatKeysRemoveBackup());
    } catch (err) {
      deps.toast(errorText(err), true);
    }
  }

  /** "Masz kopię klucza – wpisz hasło czatu, żeby odczytać historię". */
  function unlock() {
    passwordWindow({
      title: t('Odczytaj historię czatu'), intro: [t('Masz kopię klucza – wpisz hasło czatu, żeby odczytać historię.')], repeat: false, ok: t('Odczytaj'),
      run: async (pw) => {
        set(await deps.api.chatKeysUnlock(pw));
        deps.toast(t('Hasło czatu poprawne. Historia czatu otwiera się na tym urządzeniu.'));
      },
    });
  }

  async function revoke(d: DeviceView) {
    const ok = await confirmDialog({
      title: t('Usunąć urządzenie {0}?', nameOf(d)),
      body: [el('p', { className: 'muted', textContent: t('Nowe wiadomości nie będą już dla niego szyfrowane, a ono samo nie wróci z tym samym kluczem. To, co już na nim przeczytano, zostaje na nim. Jeśli zgubiłeś to urządzenie, wyloguj się też na nim ze SlashClient.') })],
      ok: t('Usuń urządzenie'), danger: true, okIcon: 'fa-trash',
    });
    if (!ok) return;
    try {
      set(await deps.api.chatKeysRevoke(d.device));
    } catch (err) {
      deps.toast(errorText(err), true);
    }
  }

  function deviceRow(d: DeviceView): HTMLElement {
    const sharing = view?.sharing.find((s) => s.device === d.device);
    const status = d.own ? t('To urządzenie') : sharing ? t('Udostępniam historię… ({0})', sharing.done)
      : d.handover === 'pending' ? t('Czeka na potwierdzenie') : d.handover === 'declined' ? t('Bez historii') : t('Ostatnio: {0}', date(d.lastSeen));
    const actions: HTMLElement[] = [];
    if (!d.own && d.handover === 'pending' && !sharing) {
      const share = el('button', { type: 'button', className: 'fr-chip-btn' }, icon('fa-share-nodes'), ` ${t('Udostępnij historię')}`);
      share.addEventListener('click', () => {
        queue.unshift(d);
        askNext();
      });
      actions.push(share);
    }
    if (!d.own) {
      const remove = el('button', { type: 'button', className: 'icon-btn', title: t('Usuń urządzenie') }, icon('fa-trash'));
      remove.addEventListener('click', () => void revoke(d));
      actions.push(remove);
    }
    return el('div', { className: `fr-chatkeys-device${d.own ? ' own' : ''}` },
      icon(d.name ? (d.name.startsWith('macOS') ? 'fa-laptop' : 'fa-desktop') : 'fa-mobile-screen'),
      el('div', { className: 'grow' }, el('b', { textContent: nameOf(d) }), el('small', { className: 'muted', textContent: `${status} · ${t('kod')} ${d.fingerprint}` })),
      ...actions);
  }

  function draw() {
    if (!view?.supported) {
      box.replaceChildren();
      return;
    }
    const nodes: Node[] = [
      el('div', { className: 'fr-account-section', textContent: t('Szyfrowanie czatu') }),
      el('small', { className: 'muted', textContent: t('Wiadomości do znajomych są szyfrowane na Twoich urządzeniach. Kod tego urządzenia: {0}', view.fingerprint) }),
    ];
    if (view.revoked) {
      const fresh = el('button', { type: 'button', className: 'fr-chip-btn' }, icon('fa-key'), ` ${t('Utwórz nowy klucz')}`);
      fresh.addEventListener('click', async () => {
        fresh.disabled = true;
        try {
          set(await deps.api.chatKeysNewKey());
        } catch (err) {
          deps.toast(errorText(err), true);
        }
      });
      nodes.push(el('div', { className: 'fr-chatkeys-warn' }, icon('fa-triangle-exclamation'),
        el('span', { textContent: t('To urządzenie zostało usunięte z czatu na innym Twoim urządzeniu – nowe wiadomości nie są dla niego szyfrowane.') }), fresh));
    }
    nodes.push(el('div', { className: 'fr-chatkeys-sub', textContent: t('Urządzenia') }), ...view.devices.map(deviceRow));

    nodes.push(el('div', { className: 'fr-chatkeys-sub', textContent: t('Kopia klucza czatu') }));
    const row = el('div', { className: 'row fr-chatkeys-actions' });
    if (!view.backup) {
      nodes.push(el('small', { className: 'muted', textContent: t('Hasło czatu pozwala odczytać całą historię na nowym komputerze, nawet gdy nie masz pod ręką innego urządzenia.') }));
      const setup = el('button', { type: 'button', className: 'fr-chip-btn' }, icon('fa-key'), ` ${t('Ustaw hasło czatu')}`);
      setup.addEventListener('click', setBackup);
      row.append(setup);
    } else {
      const backupSharing = view.sharing.find((s) => s.backup);
      nodes.push(el('small', { className: 'muted', textContent: backupSharing ? t('Kopia klucza włączona. Dopisuję do niej historię… ({0})', backupSharing.done)
        : t('Kopia klucza włączona od {0}.', date(view.backup.createdAt)) }));
      if (!view.backup.unlocked) {
        const read = el('button', { type: 'button', className: 'fr-chip-btn' }, icon('fa-unlock'), ` ${t('Odczytaj historię hasłem')}`);
        read.addEventListener('click', unlock);
        row.append(read);
      }
      const change = el('button', { type: 'button', className: 'fr-chip-btn' }, icon('fa-pen'), ` ${t('Zmień hasło')}`);
      change.addEventListener('click', changeBackup);
      const remove = el('button', { type: 'button', className: 'fr-chip-btn' }, icon('fa-trash'), ` ${t('Usuń kopię')}`);
      remove.addEventListener('click', () => void removeBackup());
      row.append(change, remove);
    }
    nodes.push(row);
    box.replaceChildren(...nodes);
  }

  /**
   * The line above a chat with messages this launcher cannot read: the history comes after a yes on
   * another device (this one's code to compare), or now with the chat password when there is a backup.
   */
  function notice(unreadable: boolean): HTMLElement | null {
    if (!unreadable || !view?.supported) return null;
    const ownShare = view.sharing.find((s) => s.own);
    const parts: Node[] = [icon('fa-clock-rotate-left'), el('div', { className: 'grow' },
      el('span', { textContent: ownShare ? t('Odczytuję historię czatu… ({0})', ownShare.done) : t('Historia czatu pojawi się, gdy potwierdzisz to na innym swoim urządzeniu.') }),
      el('small', { className: 'muted', textContent: ` ${t('Kod tego urządzenia: {0}', view.fingerprint)}` }))];
    if (view.backup && !view.backup.unlocked && !ownShare) {
      const read = el('button', { type: 'button', className: 'fr-chip-btn' }, icon('fa-unlock'), ` ${t('Wpisz hasło czatu')}`);
      read.title = t('Masz kopię klucza – wpisz hasło czatu, żeby odczytać historię.');
      read.addEventListener('click', unlock);
      parts.push(read);
    }
    return el('div', { className: 'fr-chatkeys-notice' }, ...parts);
  }

  /** The main process's news; true when it was one of ours. */
  function onEvent(e: any): boolean {
    switch (e?.type) {
      case 'chat-keys-state':
        set(e.state);
        return true;
      case 'chat-device-new':
        if (!queue.some((d) => d.device === e.device.device)) queue.push(e.device);
        askNext();
        return true;
      case 'chat-history':
        deps.historyChanged();
        return true;
      case 'chat-share-progress':
        if (view) {
          const s = view.sharing.find((x) => x.device === e.device);
          if (s) s.done = e.done;
          set(view);
        }
        return true;
      case 'chat-share-done': {
        if (e.own) deps.toast(t('Historia czatu jest już na tym urządzeniu.'));
        else if (e.backup) deps.toast(t('Historia czatu dopisana do kopii klucza.'));
        else deps.toast(t('Historia czatu udostępniona nowemu urządzeniu ({0}).', e.done));
        void load();
        return true;
      }
      default:
        return false;
    }
  }

  return {
    load,
    onEvent,
    notice,
    /** The section of the account window, drawn while it is open. */
    section() {
      boxOpen = true;
      draw();
      void load();
      return box;
    },
    closeSection() {
      boxOpen = false;
    },
    clear() {
      view = undefined;
      queue.length = 0;
    },
  };
}
