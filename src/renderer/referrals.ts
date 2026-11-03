import { getLang, locale, t } from '../shared/i18n';
import { currencyName, polishForm, sparks } from '../shared/sparks';
import { control, el, icon, modalWindow } from './dialog';

/**
 * Inviting friends ("Zaproś znajomych", the server's /v1/referrals): every player has a code and a
 * link to share; a new player can enter one friend's code within a few days of making the account.
 * The invite counts once the friend has a Minecraft account linked and has played long enough on
 * enough different days; then both get sparks, and the inviter capes for 1, 3, 5… counted invites.
 * The server decides and counts all of it; this shows it in the Achievements view ("Zaproś" tab) and
 * asks a freshly signed-in player once whether a friend gave them a code. A server without it (404)
 * or with it switched off hides all of it.
 */

export interface ReferralReward { count: number; item: string | null; itemName: string | null; sparks: number; reached: boolean }
export interface InvitedFriend { handle: string; name: string; at: number; status: 'pending' | 'counted' | 'rejected'; hours: number; days: number; minecraft: boolean }
export interface Referrals {
  enabled: boolean;
  code: string;
  link: string;
  canRedeem: boolean;
  /** Until when a code can still be entered (ms); null: no limit known. */
  redeemUntil: number | null;
  redeemed: { handle: string; name: string } | null;
  /** The code of the link the player came by (the site remembers it), offered in the question. */
  suggested: { code: string; handle: string; name: string } | null;
  hoursGoal: number;
  daysGoal: number;
  inviterSparks: number;
  inviteeSparks: number;
  counted: number;
  invited: InvitedFriend[];
  rewards: ReferralReward[];
}

/** What a player typed or pasted as a code: upper case, no spaces; a pasted link gives its code (exported for the tests). */
export function normalizeCode(input: string): string {
  const text = String(input ?? '').trim();
  const fromLink = /\/z\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/.exec(text);
  return (fromLink ? fromLink[1] : text).replace(/[\s-]+/g, '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 32);
}

/** Whether to ask "Masz kod od znajomego?": the server lets this account enter one, it has none and the player did not skip it (exported for the tests). */
export function shouldPrompt(r: Referrals | undefined, skipped: boolean, now = Date.now()): boolean {
  if (!r?.enabled || skipped || !r.canRedeem || r.redeemed) return false;
  return r.redeemUntil === null || r.redeemUntil === undefined || r.redeemUntil > now;
}

const num = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 1 });

/** "1 dzień", "2 dni"; English "1 day", "2 days". */
export function daysText(n: number): string {
  if (getLang() === 'en') return `${num(n)} ${n === 1 ? 'day' : 'days'}`;
  return `${num(n)} ${n === 1 ? 'dzień' : 'dni'}`;
}

/** "1 zaproszenie", "3 zaproszenia", "5 zaproszeń"; English "1 invite", "3 invites". */
export function invitesText(n: number): string {
  if (getLang() === 'en') return `${num(n)} ${n === 1 ? 'invite' : 'invites'}`;
  return `${num(n)} ${['zaproszenie', 'zaproszenia', 'zaproszeń'][polishForm(n)]}`;
}

/** A friend's way to a counted invite: "1,5/3 h · 1/2 dni" (never past the goal; exported for the tests). */
export function progressText(hours: number, days: number, hoursGoal: number, daysGoal: number): string {
  const h = Math.max(0, Math.min(hours, hoursGoal));
  const d = Math.max(0, Math.min(days, daysGoal));
  const unit = getLang() === 'en' ? (daysGoal === 1 ? 'day' : 'days') : daysGoal === 1 ? 'dzień' : 'dni';
  return `${num(h)}/${num(hoursGoal)} h · ${num(d)}/${num(daysGoal)} ${unit}`;
}

/** The next cape to get and how many counted invites are still missing, or undefined when all are reached (exported for the tests). */
export function nextReward(rewards: ReferralReward[], counted: number): { reward: ReferralReward; missing: number } | undefined {
  const reward = [...rewards].sort((a, b) => a.count - b.count).find((r) => !r.reached && r.count > counted);
  return reward && { reward, missing: reward.count - counted };
}

/** What an entered code's refusal says (exported for the tests); undefined for codes that are not about the code. */
export function redeemErrorText(code: string): string | undefined {
  const texts: Record<string, string> = {
    bad_code: t('Nie ma takiego kodu.'),
    own_code: t('To Twój własny kod.'),
    too_late: t('Kod można wpisać tylko w ciągu kilku dni od założenia konta.'),
    already_redeemed: t('Na tym koncie jest już wpisany kod znajomego.'),
    cycle: t('Nie możesz wpisać kodu kogoś, kogo sam zaprosiłeś.'),
    disabled: t('Zaproszenia są teraz wyłączone.'),
  };
  return texts[code];
}

/** The server's code in a failed call ("social:bad_code" in the IPC error's text). */
export function errorCode(err: unknown): string {
  const text = String((err as { code?: string })?.code ?? (err as Error)?.message ?? err ?? '');
  // the last one: the IPC wrapper names its channel ("social:api") before it
  return /social:([\w:]+)\s*$/.exec(text)?.[1] ?? text;
}

/** What the player reads after entering a friend's code (exported for the tests). */
export function connectedText(name: string, r: Pick<Referrals, 'hoursGoal' | 'daysGoal'>): string {
  return t('Połączono z {0}. Gdy pograsz {1} h w {2}, oboje dostaniecie {3}.', name, num(r.hoursGoal), daysText(r.daysGoal), currencyName());
}

/** The rules with the server's numbers now (exported for the tests). */
export function rulesText(r: Pick<Referrals, 'hoursGoal' | 'daysGoal' | 'inviterSparks' | 'inviteeSparks'>): string {
  return t('Znajomy wpisuje Twój kod w ciągu kilku dni od założenia konta. Gdy połączy konto Minecraft i pogra {0} h w co najmniej {1}, dostaniesz {2}, a on {3}.', num(r.hoursGoal), daysText(r.daysGoal), sparks(r.inviterSparks), sparks(r.inviteeSparks));
}

export interface ReferralsDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** A cosmetic's picture, as the cosmetics menu draws it (the capes for invites). */
  picture?: (slot: string, id: string) => Node;
  /** Whether this SlashClient account already skipped the question. */
  skipped: (account: string) => boolean;
  /** Remembers that it did, for good. */
  skip: (account: string) => void;
}

export function createReferrals(deps: ReferralsDeps) {
  const { api } = deps;
  /** Whether the server has invites for this account; undefined until asked. */
  let available: boolean | undefined;
  /** Told when that changes: the Achievements tab and the side menu entry. */
  const changed = new Set<() => void>();
  const tell = () => changed.forEach((fn) => fn());
  /** The question is asked at most once per launch. */
  let asked = false;
  /** The account signed in, as the last 'state' event said. */
  let account: string | undefined;

  function setAvailable(on: boolean) {
    if (available === on) return;
    available = on;
    tell();
  }

  /** The player's invites, or undefined when the server has none (older server: 404) or they are switched off. */
  async function load(): Promise<Referrals | undefined> {
    let res: Referrals;
    try {
      res = await api.socialApi('GET', '/v1/referrals');
    } catch (err) {
      if (/not_found|404/.test(errorCode(err))) {
        setAvailable(false);
        return undefined;
      }
      throw err;
    }
    setAvailable(!!res?.enabled);
    return res?.enabled ? res : undefined;
  }

  /** Sends a code; resolves the inviter, or throws the words to show. */
  async function redeem(raw: string): Promise<{ handle: string; name: string }> {
    const code = normalizeCode(raw);
    if (!code) throw new Error(t('Wpisz kod znajomego.'));
    try {
      const res: { ok: true; inviter: { handle: string; name: string } } = await api.socialApi('POST', '/v1/referrals/redeem', { code });
      return res.inviter;
    } catch (err) {
      throw new Error(redeemErrorText(errorCode(err)) ?? deps.errorText(err));
    }
  }

  /** A code field with its button; `done` gets the inviter after a good code. */
  function codeForm(prefill: string, okLabel: string, done: (inviter: { handle: string; name: string }) => void) {
    const input = control<HTMLInputElement>('input', { value: prefill, placeholder: t('Kod znajomego, np. ABC123'), maxLength: 64, spellcheck: false, className: 'ref-input' });
    const submit = el('button', { type: 'submit', className: 'primary' }, icon('fa-check'), ` ${okLabel}`);
    const error = el('p', { className: 'fr-error ref-error hidden' });
    // typed in upper case as it is shown everywhere, without moving the cursor
    input.addEventListener('input', () => {
      const at = input.selectionStart;
      input.value = input.value.toUpperCase();
      if (at !== null) input.setSelectionRange(at, at);
      error.classList.add('hidden');
    });
    const form = el('form', { className: 'ref-form' }, el('div', { className: 'row' }, input, submit), error);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      error.classList.add('hidden');
      try {
        const inviter = await redeem(input.value);
        input.value = normalizeCode(input.value);
        done(inviter);
      } catch (err) {
        error.textContent = (err as Error).message;
        error.classList.remove('hidden');
      } finally {
        submit.disabled = false;
      }
    });
    return { form, input, submit };
  }

  /** Another window is open now (the page keeps its own hidden ones around): the question waits. */
  const busy = () => [...document.querySelectorAll('.modal, #wizard')].some((m) => m.getClientRects().length > 0);

  /** "Masz kod od znajomego?": once per launch, only to a player who can still enter one and did not skip it. */
  async function maybeAsk() {
    const who = account;
    if (asked || !who || deps.skipped(who)) return;
    // after the start's own windows (the first-run wizard, "Co nowego") and never on top of another one
    for (let i = 0; i < 40 && (busy() || !document.hasFocus()); i++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (account !== who || asked) return;
    }
    if (busy()) return;
    const r = await load().catch(() => undefined);
    if (asked || account !== who || !shouldPrompt(r, deps.skipped(who))) return;
    asked = true;
    const s = r!.suggested && r!.suggested.code !== r!.code ? r!.suggested : null;
    const later = el('button', { type: 'button' }, t('Pomiń'));
    let success = false;
    const { form, input, submit } = codeForm(s?.code ?? '', s ? t('Tak') : t('Zatwierdź'), (inviter) => {
      success = true;
      const ok = el('button', { type: 'button', className: 'primary' }, t('OK'));
      ok.addEventListener('click', () => close());
      body.replaceChildren(
        el('div', { className: 'ref-success' }, icon('fa-handshake'), el('span', { textContent: connectedText(inviter.name, r!) })),
        el('div', { className: 'row join-actions' }, ok));
      ok.focus();
      tell();
    });
    // the field on its own line, the two buttons under it as in the launcher's other questions
    form.append(el('div', { className: 'row join-actions' }, later, submit));
    const until = r!.redeemUntil ? t('Kod możesz wpisać do {0}. Później znajdziesz go też w Osiągnięcia → Zaproś.', new Date(r!.redeemUntil).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })) : t('Kod możesz wpisać też później w Osiągnięcia → Zaproś.');
    const body = el('div', { className: 'ref-prompt' },
      el('p', { textContent: s ? t('{0} zaprosił Cię do SlashClient – użyć kodu {1}?', s.name, s.code) : t('Jeśli ktoś zaprosił Cię do SlashClient, wpisz jego kod. Gdy pograsz {0} h w {1}, oboje dostaniecie {2}.', num(r!.hoursGoal), daysText(r!.daysGoal), currencyName()) }),
      s ? el('p', { className: 'muted', textContent: t('Gdy pograsz {0} h w {1}, oboje dostaniecie {2}.', num(r!.hoursGoal), daysText(r!.daysGoal), currencyName()) }) : '',
      form,
      el('small', { className: 'muted', textContent: until }));
    // closing it any way but with a code counts as "Pomiń": it is not asked again on this account
    const close = modalWindow(t('Masz kod od znajomego?'), [body], [], () => {
      if (!success) deps.skip(who);
    }, 'ref-modal');
    later.addEventListener('click', () => close());
    (s ? submit : input).focus();
  }

  api.on('social:event', (e: { type?: string; state?: { user?: { id?: string }; connected?: boolean } }) => {
    if (e?.type !== 'state') return;
    const user = e.state?.user?.id;
    if (user !== account) {
      account = user;
      available = undefined;
      if (!user) tell();
    }
    if (user && e.state?.connected) {
      // a moment after connecting, so it does not open in the middle of the start
      setTimeout(() => {
        void load().catch(() => undefined);
        void maybeAsk();
      }, 4000);
    }
  });
  // the launcher may have connected before this was made
  void api.socialState().then((s: { user?: { id?: string }; connected?: boolean } | undefined) => {
    if (!s?.user?.id || account) return;
    account = s.user.id;
    if (s.connected) setTimeout(() => {
      void load().catch(() => undefined);
      void maybeAsk();
    }, 4000);
  }).catch(() => undefined);

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

  function copyButton(text: string, label: string, done: string) {
    const b = el('button', { type: 'button' }, icon('fa-copy'), ` ${label}`);
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        deps.toast(done);
      } catch (err) {
        deps.toast(deps.errorText(err), true);
      }
    });
    return b;
  }

  function rewardCard(rw: ReferralReward) {
    const pic = el('div', { className: 'ref-cape' }, rw.item ? deps.picture?.('cape', rw.item) ?? icon('fa-gift') : icon('fa-gift'));
    return el('div', { className: `ach-card glass-panel ref-reward${rw.reached ? ' done' : ''}`, title: rw.itemName ? t('Peleryna {0}', rw.itemName) : '' },
      pic,
      el('div', { className: 'grow ach-text' },
        el('b', { textContent: invitesText(rw.count) }),
        el('small', { className: 'muted', textContent: rw.itemName ? t('Peleryna {0}', rw.itemName) : t('Nagroda') }),
        rw.reached ? el('small', { className: 'ach-date' }, icon('fa-check'), ` ${t('Zdobyte')}`) : ''),
      rw.sparks ? el('div', { className: 'ach-side' }, el('span', { className: `ach-sparks${rw.reached ? ' earned' : ''}` }, el('span', { className: 'spark-sign', textContent: '✦' }), ` ${num(rw.sparks)}`)) : '');
  }

  function friendRow(f: InvitedFriend, r: Referrals) {
    const [label, cls, ic] = f.status === 'counted' ? [t('Zaliczone'), 'counted', 'fa-check'] : f.status === 'rejected' ? [t('Odrzucone'), 'rejected', 'fa-xmark'] : [t('Czeka'), 'pending', 'fa-hourglass-half'];
    const fill = el('span');
    const done = f.status === 'counted' ? 1 : (Math.min(1, f.hours / Math.max(r.hoursGoal, 0.01)) + Math.min(1, f.days / Math.max(r.daysGoal, 1))) / 2;
    fill.style.width = `${Math.round(done * 100)}%`;
    return el('div', { className: `ref-friend ${cls}` },
      el('div', { className: 'grow ach-text' },
        el('b', {}, f.name, el('small', { className: 'muted', textContent: ` @${f.handle}` })),
        f.status === 'pending' ? el('div', { className: 'ach-bar' }, fill) : '',
        el('small', { className: 'muted' },
          el('span', { className: 'ach-count', textContent: progressText(f.hours, f.days, r.hoursGoal, r.daysGoal) }),
          ` · ${t('od {0}', fmtDate(f.at))}`),
        !f.minecraft && f.status === 'pending' ? el('small', { className: 'ref-hint' }, icon('fa-cube'), ` ${t('brak konta Minecraft – liczy się dopiero po jego połączeniu')}`) : ''),
      el('span', { className: `ref-status ${cls}` }, icon(ic), ` ${label}`));
  }

  /** The "Zaproś" tab, from the server's answer; `refresh` asks again (after a code was entered). */
  function render(r: Referrals, refresh: () => void): Node[] {
    const linkText = r.link.replace(/^https?:\/\/(www\.)?/, '');
    const hero = el('div', { className: 'card glass-panel ref-hero' },
      el('div', { className: 'ref-hero-text' },
        el('h3', {}, icon('fa-user-plus'), ` ${t('Zaproś znajomych')}`),
        el('p', { className: 'muted', textContent: rulesText(r) })),
      el('div', { className: 'ref-share' },
        el('div', { className: 'ref-share-item' },
          el('small', { className: 'muted', textContent: t('Twój kod') }),
          el('div', { className: 'code-row' }, el('div', { className: 'code ref-code', textContent: r.code }), copyButton(r.code, t('Kopiuj kod'), t('Skopiowano kod')))),
        el('div', { className: 'ref-share-item ref-share-link' },
          el('small', { className: 'muted', textContent: t('Twój link') }),
          el('div', { className: 'code-row' }, el('div', { className: 'ref-link', textContent: linkText, title: r.link }), copyButton(r.link, t('Kopiuj link'), t('Skopiowano link'))))));

    const next = nextReward(r.rewards, r.counted);
    const bar = el('span');
    const goal = next?.reward.count ?? Math.max(1, ...r.rewards.map((x) => x.count));
    bar.style.width = `${Math.round(Math.min(1, r.counted / goal) * 100)}%`;
    const rewards = r.rewards.length
      ? el('section', { className: 'ach-section' },
        el('div', { className: 'ach-section-head' }, icon('fa-gift'), el('h3', { textContent: t('Peleryny za zaproszenia') }),
          el('div', { className: 'ach-bar ach-section-bar', title: `${r.counted} / ${goal}` }, bar),
          el('small', { className: 'muted', textContent: `${r.counted}/${goal}` }),
          el('small', { className: 'muted ref-next', textContent: next
            ? t('Do następnej: {0}', invitesText(next.missing))
            : t('Wszystkie peleryny zdobyte!') })),
        el('div', { className: 'ach-grid ref-rewards' }, ...[...r.rewards].sort((a, b) => a.count - b.count).map(rewardCard)))
      : '';

    const counted = r.invited.filter((f) => f.status === 'counted').length;
    const invited = el('section', { className: 'ach-section' },
      el('div', { className: 'ach-section-head' }, icon('fa-user-group'), el('h3', { textContent: t('Zaproszeni znajomi') }),
        el('small', { className: 'muted', textContent: t('Zaliczone: {0} z {1}', counted, r.invited.length) })),
      r.invited.length
        ? el('div', { className: 'ledger glass-panel ref-friends' }, ...[...r.invited].sort((a, b) => b.at - a.at).map((f) => friendRow(f, r)))
        : el('p', { className: 'muted', textContent: t('Nikt jeszcze nie wpisał Twojego kodu. Wyślij znajomym link – po założeniu konta wpiszą kod sami.') }));

    let mine: Node | '' = '';
    if (r.redeemed) {
      mine = el('div', { className: 'chal-bonus glass-panel done ref-mine' }, icon('fa-handshake'),
        el('span', { className: 'grow', textContent: t('Zaprosił Cię: {0}', r.redeemed.name) }));
    } else if (r.canRedeem && shouldPrompt(r, false)) {
      const { form } = codeForm(r.suggested && r.suggested.code !== r.code ? r.suggested.code : '', t('Zatwierdź'), (inviter) => {
        deps.toast(connectedText(inviter.name, r));
        refresh();
      });
      mine = el('div', { className: 'card glass-panel ref-enter' },
        el('h3', {}, icon('fa-ticket'), ` ${t('Masz kod od znajomego?')}`),
        el('p', { className: 'muted', textContent: r.redeemUntil
          ? t('Możesz wpisać jeden kod do {0}. Gdy pograsz {1} h w {2}, oboje dostaniecie {3}.', fmtDate(r.redeemUntil), num(r.hoursGoal), daysText(r.daysGoal), currencyName())
          : t('Możesz wpisać jeden kod. Gdy pograsz {0} h w {1}, oboje dostaniecie {2}.', num(r.hoursGoal), daysText(r.daysGoal), currencyName()) }),
        form);
    }
    return [hero, mine, rewards, invited].filter((n): n is HTMLElement => n !== '');
  }

  return {
    load,
    render,
    /** Whether the "Zaproś" tab shows: only once the server said it has invites for this account. */
    available: () => available === true,
    /** Called when that changes (the tab appears or goes) or a code was entered. */
    onChange(fn: () => void) {
      changed.add(fn);
    },
  };
}
