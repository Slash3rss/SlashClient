// The "Wesprzyj" page (/wsparcie): why support helps, the tiers with what they give and cost, and
// a checkout at the payment provider. Also the pages the provider sends the player back to
// (/wsparcie/dziekujemy, /wsparcie/anulowano). The server sets every price and grants a tier only
// when the provider's webhook confirms the payment; this page only asks and shows.
import { $, PROVIDERS, api, el, errorText, icon, signInDev, signInWith, toast, token } from './common.js';
import { featureOn, siteFeatures } from './siteBanner.js';

/** The page is Polish; a browser in another language gets the English texts. */
const EN = !/^pl\b/i.test(navigator.language || 'pl');
const L = (pl, en) => (EN ? en : pl);
const LOCALE = EN ? 'en-GB' : 'pl-PL';
const money = (minor, currency) => new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
const day = (ms) => new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

const ERRORS = {
  consent_required: L('Zaznacz akceptację regulaminu i zgodę (albo pełnoletność).', 'Tick the terms and the consent (or that you are an adult).'),
  provider_disabled: L('Ten sposób płatności jest teraz wyłączony.', 'This payment method is switched off right now.'),
  not_offered: L('Ten poziom nie jest dostępny w tej formie.', 'This tier is not offered this way.'),
  already_subscribed: L('Masz już wsparcie co miesiąc. Zmienisz je w „Zarządzaj subskrypcją” na stronie konta.', 'You already support monthly. Change it with “Manage subscription” on your account page.'),
  provider_error: L('Operator płatności nie odpowiada. Spróbuj za chwilę.', 'The payment provider did not answer. Try again in a moment.'),
  monthly_unsupported: L('Co miesiąc można wspierać tylko kartą (Stripe).', 'Monthly support works only by card (Stripe).'),
  rate_limited: L('Za dużo prób, odczekaj chwilę.', 'Too many tries, wait a moment.'),
  unauthorized: L('Zaloguj się, żeby wesprzeć projekt.', 'Sign in to support the project.'),
  feature_disabled: L('Wsparcie jest chwilowo wyłączone. Spróbuj później.', 'Supporting is switched off for now. Try again later.'),
};
/** New payments may be switched off in the admin panel (siteBanner.js reads the switches). */
let paymentsOn = true;
const fail = (err) => toast(ERRORS[err?.code] ?? errorText(err), true);

const PROVIDER_INFO = {
  stripe: [L('Karta, BLIK, Przelewy24', 'Card, BLIK, Przelewy24'), L('także Apple Pay i Google Pay', 'also Apple Pay and Google Pay'), 'fa-solid fa-credit-card'],
  paypal: ['PayPal', L('tylko jednorazowo', 'one-time only'), 'fa-brands fa-paypal'],
};

let me;
let offer = { tiers: [], providers: [], test: false };
let health = { providers: [], dev: false };
const choice = { kind: 'one_time', tier: '', months: 1, provider: '', currency: 'PLN', terms: false, consent: false };

function renderNav() {
  $('#nav-account .label').textContent = me ? me.name : L('Zaloguj się', 'Sign in');
  $('#nav-admin').classList.toggle('hidden', !me?.admin);
}

const priceOf = (t, kind = choice.kind) => t[kind === 'one_time' ? 'oneTime' : 'monthly'];
const currencies = () => [...new Set(offer.tiers.flatMap((t) => ['oneTime', 'monthly'].flatMap((k) => Object.keys(t[k] ?? {}).filter((c) => c !== 'days'))))];

// ---------- the page ----------

function intro() {
  return el('div', { class: 'head' },
    el('span', { class: 'eyebrow', textContent: L('Wsparcie', 'Support') }),
    el('h1', { textContent: L('Wesprzyj SlashClient', 'Support SlashClient') }),
    el('p', { textContent: L(
      'SlashClient jest darmowy i taki zostanie. Serwer ze znajomymi, czatem, zrzutami i profilami w chmurze działa całą dobę i kosztuje co miesiąc. Jeśli chcesz pomóc go utrzymać, możesz dobrowolnie wesprzeć projekt.',
      'SlashClient is free and will stay free. The server with friends, chat, screenshots and cloud profiles runs around the clock and costs money every month. If you want to help keep it going, you can support the project voluntarily.') }));
}

function costs() {
  const item = (ic, title, text) => el('div', { class: 'glass card cost' }, icon(`fa-solid ${ic}`), el('b', { textContent: title }), el('span', { class: 'muted small', textContent: text }));
  return el('div', { class: 'costs' },
    item('fa-server', L('Serwer', 'Server'), L('znajomi, czat, statusy i osiągnięcia działają 24/7', 'friends, chat, statuses and achievements run 24/7')),
    item('fa-hard-drive', L('Miejsce na pliki', 'Storage'), L('zrzuty ekranu, klipy i profile w chmurze', 'screenshots, clips and cloud profiles')),
    item('fa-globe', L('Domena i sieć', 'Domain and network'), L('strona, pobieranie, aktualizacje launchera', 'the website, downloads, launcher updates')),
    item('fa-code', L('Rozwój', 'Development'), L('nowe wersje gry, funkcje i poprawki', 'new game versions, features and fixes')));
}

/** What support never does: stays on the page next to the tiers, not in small print. */
function promises() {
  const li = (ic, text) => el('li', {}, icon(`fa-solid ${ic}`), el('span', { textContent: text }));
  return el('div', { class: 'glass card promises' },
    el('h3', { textContent: L('Uczciwe zasady', 'Fair rules') }),
    el('ul', {},
      li('fa-hand-holding-heart', L('To dobrowolne wsparcie, nie zakup przewagi. Wszystko, co ważne do gry, jest za darmo dla każdego.', 'This is voluntary support, not buying an advantage. Everything that matters for playing is free for everyone.')),
      li('fa-scale-balanced', L('Żadnych przewag w grze: tylko wygląd (ranga, kosmetyki, profil) i więcej miejsca na pliki.', 'No advantages in game: only looks (rank, cosmetics, profile) and more room for files.')),
      li('fa-ban', L('Żadnych skrzynek ani losowych nagród. Iskier nie da się kupić za pieniądze.', 'No loot boxes or random rewards. Sparks (Iskry) cannot be bought with money.')),
      li('fa-lock-open', L('Darmowym graczom nic nie zabieramy i nie zabierzemy.', 'Nothing is or will be taken away from free players.')),
      li('fa-rotate-left', L('Zwrot: konto → Wsparcie projektu → Poproś o zwrot (w ciągu 14 dni). Oddamy pieniądze, a ranga wygaśnie.', 'Refund: account → Supporting the project → Ask for a refund (within 14 days). We return the money and the rank ends.'))),
    el('p', { class: 'minor-note' }, icon('fa-solid fa-child-reaching'), el('span', { textContent: L(
      'Masz mniej niż 18 lat? Poproś rodzica lub opiekuna o zgodę, zanim cokolwiek zapłacisz. Najlepiej, żeby to on dokończył płatność.',
      'Under 18? Ask a parent or guardian for permission before paying anything. Best let them complete the payment.') })));
}

function kindSwitch() {
  const anyMonthly = offer.tiers.some((t) => t.monthly);
  const b = (kind, label, ic) => el('button', { class: `seg${choice.kind === kind ? ' active' : ''}`, type: 'button', onclick: () => { choice.kind = kind; if (kind === 'monthly' && choice.provider === 'paypal') choice.provider = ''; render(); } }, icon(ic), label);
  const row = el('div', { class: 'row support-switches' },
    el('div', { class: 'segmented', role: 'group' }, b('one_time', L('Jednorazowo', 'One-time'), 'fa-solid fa-gift'), anyMonthly ? b('monthly', L('Co miesiąc', 'Monthly'), 'fa-solid fa-rotate') : ''));
  const curs = currencies();
  if (curs.length > 1) {
    row.append(el('div', { class: 'segmented', role: 'group' }, ...curs.map((c) => el('button', { class: `seg${choice.currency === c ? ' active' : ''}`, type: 'button', onclick: () => { choice.currency = c; render(); } }, c))));
  }
  return row;
}

function tierCards() {
  const list = offer.tiers.filter((t) => priceOf(t)?.[choice.currency]);
  if (!list.some((t) => t.id === choice.tier)) choice.tier = list[Math.min(1, list.length - 1)]?.id ?? '';
  return el('div', { class: 'tiers' }, ...list.map((t) => {
    const p = priceOf(t);
    const selected = t.id === choice.tier;
    const card = el('button', { type: 'button', class: `glass tier${selected ? ' selected' : ''}`, onclick: () => { choice.tier = t.id; render(); }, ariaLabel: L(t.name, t.nameEn), ariaPressed: String(selected) },
      el('div', { class: 'tier-head' }, el('span', { class: 'tier-dot' }), el('h3', { textContent: L(t.name, t.nameEn) })),
      el('div', { class: 'tier-price' }, el('b', { textContent: money(p[choice.currency], choice.currency) }),
        el('span', { class: 'muted', textContent: choice.kind === 'monthly' ? L(' / miesiąc', ' / month') : L(` / ${p.days} dni`, ` / ${p.days} days`) })),
      el('ul', { class: 'tier-perks' }, ...(EN ? t.perksEn : t.perks).map((x) => el('li', {}, icon('fa-solid fa-check'), el('span', { textContent: x })))));
    card.style.setProperty('--tier', t.color);
    return card;
  }));
}

function months() {
  if (choice.kind !== 'one_time') return '';
  const t = offer.tiers.find((x) => x.id === choice.tier);
  const p = t && priceOf(t);
  if (!p) return '';
  const select = el('select', { 'aria-label': L('Na ile', 'For how long') }, ...[1, 2, 3, 6, 12].map((n) => el('option', { value: String(n), selected: n === choice.months, textContent: `${p.days * n} ${L('dni', 'days')} · ${money(p[choice.currency] * n, choice.currency)}` })));
  select.addEventListener('change', () => { choice.months = Number(select.value); render(); });
  return el('label', { class: 'row months' }, el('span', { class: 'muted', textContent: L('Na ile:', 'For how long:') }), select,
    el('span', { class: 'muted small', textContent: L('Jednorazowo, bez odnawiania. Kolejne wsparcie przedłuża czas.', 'Once, no renewal. Supporting again adds time.') }));
}

function providerPick() {
  const usable = offer.providers.filter((p) => choice.kind === 'one_time' || p.monthly);
  if (!usable.some((p) => p.id === choice.provider)) choice.provider = usable[0]?.id ?? '';
  if (!usable.length) return el('p', { class: 'muted', textContent: L('Płatności nie są jeszcze włączone. Zajrzyj później!', 'Payments are not switched on yet. Check back later!') });
  return el('div', { class: 'providers-pick' }, ...usable.map((p) => {
    const [name, note, ic] = PROVIDER_INFO[p.id] ?? [p.id, '', 'fa-solid fa-wallet'];
    return el('button', { type: 'button', class: `glass provider${choice.provider === p.id ? ' selected' : ''}`, onclick: () => { choice.provider = p.id; render(); } },
      icon(ic), el('span', { class: 'grow' }, el('b', { textContent: name }), el('small', { class: 'muted', textContent: note })));
  }));
}

function consents() {
  const box = (key, ...label) => {
    const input = el('input', { type: 'checkbox', checked: choice[key] });
    input.addEventListener('change', () => { choice[key] = input.checked; sendButton.disabled = !ready(); });
    return el('label', { class: 'check' }, input, el('span', {}, ...label));
  };
  return el('div', { class: 'consents' },
    box('terms', L('Akceptuję ', 'I accept the '), el('a', { href: '/wsparcie/regulamin', target: '_blank', textContent: L('regulamin wsparcia', 'support terms') }),
      L(' i rozumiem, że to dobrowolne wsparcie bez przewag w grze.', ' and understand this is voluntary support with no in-game advantages.')),
    box('consent', L('Mam 18 lat albo rodzic/opiekun zgodził się na tę płatność.', 'I am 18 or older, or a parent/guardian agreed to this payment.')));
}

const ready = () => !!(me && choice.tier && choice.provider && choice.terms && choice.consent);
let sendButton;

async function send() {
  sendButton.disabled = true;
  try {
    const res = await api('POST', '/v1/support/checkout', {
      tier: choice.tier, kind: choice.kind, provider: choice.provider, currency: choice.currency,
      quantity: choice.kind === 'one_time' ? choice.months : 1, terms: choice.terms, consent: choice.consent, lang: EN ? 'en' : 'pl',
    });
    // the provider's own page; the server checked it is https
    location.href = res.url;
  } catch (err) {
    fail(err);
    sendButton.disabled = !ready();
  }
}

function signInBox() {
  const list = el('div', { class: 'row' });
  for (const p of health.providers) {
    const [name, cls] = PROVIDERS[p] ?? [p, 'fa-solid fa-key'];
    list.append(el('button', { type: 'button', onclick: () => login(() => signInWith(p)) }, icon(cls), name));
  }
  if (health.dev) {
    const input = el('input', { type: 'text', placeholder: L('Nick (logowanie testowe)', 'Name (test sign-in)'), maxLength: 16 });
    list.append(el('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); login(() => signInDev(input.value.trim())); } }, input, el('button', { type: 'submit' }, icon('fa-solid fa-flask'), L('Wejdź', 'Enter'))));
  }
  return el('div', { class: 'signin-inline' },
    el('p', { class: 'small', textContent: L('Zaloguj się kontem SlashClient, żeby wsparcie trafiło na Twoje konto (zakładasz je w launcherze).', 'Sign in with your SlashClient account so the support goes to it (you make it in the launcher).') }),
    list);
}

async function login(fn) {
  try {
    await fn();
  } catch (err) {
    return fail(err);
  }
  me = await api('GET', '/v1/me').catch(() => undefined);
  renderNav();
  render();
}

function checkout() {
  sendButton = el('button', { type: 'button', class: 'primary big', onclick: send, disabled: !ready() }, icon('fa-solid fa-heart'), L('Wesprzyj', 'Support'));
  const t = offer.tiers.find((x) => x.id === choice.tier);
  const p = t && priceOf(t);
  const total = p ? money(p[choice.currency] * (choice.kind === 'one_time' ? choice.months : 1), choice.currency) : '';
  const now = me?.supporter && !me.supporter.past
    ? el('p', { class: 'small current' }, icon('fa-solid fa-circle-check'), L(` Teraz: ${me.supporter.name}`, ` Now: ${me.supporter.nameEn || me.supporter.name}`),
      me.supporter.expiresAt ? L(` do ${day(me.supporter.expiresAt)}`, ` until ${day(me.supporter.expiresAt)}`) : '')
    : '';
  return el('div', { class: 'glass card checkout' },
    el('h3', { textContent: L('Jak chcesz zapłacić?', 'How do you want to pay?') }),
    providerPick(), months(), consents(), now,
    !paymentsOn ? el('p', { class: 'test-banner' }, icon('fa-solid fa-circle-pause'), L(' Wsparcie jest chwilowo wyłączone. Spróbuj później.', ' Supporting is switched off for now. Try again later.'))
      : me ? el('div', { class: 'row checkout-go' }, el('span', { class: 'grow small muted' }, L('Wspierasz jako ', 'Supporting as '), el('b', { textContent: `@${me.handle}` }), total ? ` · ${total}${choice.kind === 'monthly' ? L(' co miesiąc', ' monthly') : ''}` : ''), sendButton) : signInBox(),
    el('p', { class: 'muted small', textContent: L(
      'Płatność obsługuje operator (Stripe albo PayPal) na swojej stronie: nie widzimy danych Twojej karty ani konta. Rangę dostajesz, gdy operator potwierdzi płatność, zwykle po kilku sekundach.',
      'The payment is handled by the provider (Stripe or PayPal) on its own page: we never see your card or account details. The rank comes once the provider confirms the payment, usually within seconds.') }));
}

async function wall() {
  const res = await api('GET', '/v1/support/wall').catch(() => undefined);
  const list = res?.supporters ?? [];
  const box = el('div', { class: 'glass card wall' }, el('h3', {}, icon('fa-solid fa-heart'), L(' Ściana wspierających', ' Supporters wall')),
    el('p', { class: 'muted small', textContent: L('Tylko osoby, które same się na to zgodziły (ustawienie na stronie konta).', 'Only people who chose to be here (a setting on the account page).') }));
  if (!list.length) box.append(el('p', { class: 'muted', textContent: L('Jeszcze nikogo tu nie ma. Możesz być pierwszy!', 'Nobody here yet. You can be the first!') }));
  else box.append(el('div', { class: 'wall-list' }, ...list.map((s) => {
    const chip = el('a', { class: 'wall-chip', href: `/u/${encodeURIComponent(s.handle)}`, title: s.active ? L(s.tierName, s.tierNameEn) : L('Wspierał(a)', 'Supported') }, el('span', { class: 'tier-dot' }), s.name);
    chip.style.setProperty('--tier', s.color || '#6b7280');
    return chip;
  })));
  return box;
}

function render() {
  const root = $('#support');
  const body = [intro()];
  if (offer.test) body.push(el('div', { class: 'test-banner' }, icon('fa-solid fa-flask'), L(' Tryb testowy: płatności nie są prawdziwe.', ' Test mode: payments are not real.')));
  body.push(costs(), el('h2', { class: 'section-title', textContent: L('Wybierz wsparcie', 'Choose your support') }), kindSwitch(), tierCards(),
    el('div', { class: 'support-cols' }, checkout(), promises()));
  root.replaceChildren(...body);
  wall().then((w) => root.append(w));
}

// ---------- coming back from the provider ----------

async function thanks() {
  const id = new URLSearchParams(location.search).get('p') ?? '';
  const root = $('#support');
  const status = el('p', { class: 'muted', textContent: L('Sprawdzam płatność…', 'Checking the payment…') });
  root.replaceChildren(el('div', { class: 'glass card result' }, el('div', { class: 'result-icon' }, icon('fa-solid fa-heart')),
    el('h1', { textContent: L('Dziękujemy!', 'Thank you!') }), status,
    el('div', { class: 'row' }, el('a', { class: 'btn', href: '/konto#wsparcie' }, icon('fa-solid fa-user'), L('Twoje konto', 'Your account')), el('a', { class: 'btn', href: '/wsparcie' }, L('Wróć', 'Back')))));
  if (!token.get() || !/^p_[\w-]{6,20}$/.test(id)) {
    status.textContent = L('Gdy operator potwierdzi płatność, ranga pojawi się na Twoim koncie.', 'Once the provider confirms the payment, the rank shows on your account.');
    return;
  }
  // the webhook decides; this only waits for it (up to 2 minutes)
  for (let i = 0; i < 60; i++) {
    const res = await api('GET', `/v1/support/payments/${id}`).catch(() => undefined);
    if (!res) break;
    if (res.granted) {
      const s = res.supporter;
      status.textContent = s && !s.past
        ? L(`Twoja ranga: ${s.name}${s.expiresAt ? `, do ${day(s.expiresAt)}` : ''}. Widać ją w launcherze, w grze i na profilu.`, `Your rank: ${s.nameEn || s.name}${s.expiresAt ? `, until ${day(s.expiresAt)}` : ''}. It shows in the launcher, in game and on your profile.`)
        : L('Płatność potwierdzona.', 'Payment confirmed.');
      return;
    }
    if (['failed', 'expired', 'mismatch'].includes(res.payment.status)) {
      status.textContent = L('Płatność się nie udała. Nic nie zostało pobrane albo pieniądze wrócą. Napisz do nas, jeśli coś się nie zgadza.', 'The payment did not go through. Nothing was taken or it will be returned. Write to us if something looks wrong.');
      return;
    }
    status.textContent = L('Czekamy na potwierdzenie od operatora płatności… (BLIK i przelewy mogą potrwać chwilę)', 'Waiting for the payment provider to confirm… (BLIK and transfers can take a moment)');
    await new Promise((r) => setTimeout(r, 2000));
  }
  status.textContent = L('Potwierdzenie jeszcze nie przyszło. Ranga pojawi się na koncie, gdy tylko operator potwierdzi płatność.', 'No confirmation yet. The rank shows on your account as soon as the provider confirms the payment.');
}

function cancelled() {
  $('#support').replaceChildren(el('div', { class: 'glass card result' }, el('div', { class: 'result-icon muted' }, icon('fa-solid fa-circle-xmark')),
    el('h1', { textContent: L('Płatność przerwana', 'Payment cancelled') }),
    el('p', { class: 'muted', textContent: L('Nic nie zostało pobrane. Możesz spróbować ponownie, kiedy zechcesz.', 'Nothing was charged. You can try again whenever you like.') }),
    el('div', { class: 'row' }, el('a', { class: 'btn primary', href: '/wsparcie' }, L('Wróć do wsparcia', 'Back to support')))));
}

me = token.get() ? await api('GET', '/v1/me').catch(() => undefined) : undefined;
renderNav();
if (/\/dziekujemy\/?$/.test(location.pathname)) thanks();
else if (/\/anulowano\/?$/.test(location.pathname)) cancelled();
else {
  [offer, health] = await Promise.all([api('GET', '/v1/support').catch(() => offer), api('GET', '/v1/health').catch(() => health)]);
  // the admin may have switched new payments off for a while (Ustawienia → Funkcje)
  paymentsOn = featureOn((await siteFeatures).features, 'support');
  render();
}
