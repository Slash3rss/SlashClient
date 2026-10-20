// The admin panel's "Wsparcie": the payment providers (keys typed here go to the server once, sealed
// with STORAGE_SECRET_KEY, and are never shown again), the supporter tiers, every payment, the
// supporters with granting, extending and taking back by hand, and the money per month. Every
// change goes to the log (Dziennik); refunds and chargebacks take back what they gave by themselves.
import { refundsSection } from './adminRefunds.js';
import { $, api, el, errorText, fmtDate, guard, icon, toast } from './common.js';

const ERRORS = {
  provider_not_configured: 'Najpierw wpisz wszystkie klucze dla wybranego trybu.',
  secret_key_missing: 'Serwer nie ma ustawionego STORAGE_SECRET_KEY, więc nie może bezpiecznie zapisać kluczy. Ustaw go i zrestartuj serwer.',
  bad_secretKey: 'Klucz Stripe musi pasować do trybu: sk_test_… (albo rk_test_…) w testowym, sk_live_… w produkcyjnym.',
  bad_webhookSecret: 'Sekret webhooka Stripe zaczyna się od whsec_.',
  bad_clientId: 'Zły Client ID PayPal.', bad_clientSecret: 'Zły Secret PayPal.', bad_webhookId: 'Zły Webhook ID PayPal (wielkie litery i cyfry).',
  bad_methods: 'Nieznana metoda płatności. Dozwolone: card, blik, p24, link, paypal, revolut_pay, klarna, sepa_debit, bancontact, ideal, eps.',
  bad_tier_id: 'Id poziomu: małe litery, cyfry i _, 2–30 znaków.', bad_level: 'Poziom: liczba 1–9.', bad_color: 'Kolor w formacie #rrggbb.',
  bad_price: 'Cena: 0 (brak) albo od 2 do 10 000.', bad_days: 'Liczba dni poza zakresem.', bad_limit_factor: 'Mnożnik limitów: 1–10.',
  tier_in_use: 'Ktoś miał albo opłacił ten poziom: zamiast usuwać, wyłącz go.', no_player: 'Nie ma takiego gracza.', bad_tier: 'Wybierz poziom.',
  not_extendable: 'Tego przyznania nie da się przedłużyć (odebrane albo na zawsze).', already_revoked: 'Już odebrane.',
};
const fail = (err) => toast(ERRORS[err?.code] ?? errorText(err), true);
const call = (...args) => api(...args).catch((err) => { fail(err); return undefined; });
const money = (minor, currency = 'PLN') => new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(minor / 100);
const toMinor = (v) => Math.round(Number(String(v).replace(',', '.')) * 100) || 0;
const fromMinor = (n) => (n ? (n / 100).toFixed(2).replace(/\.00$/, '') : '');
const STATUS = {
  pending: ['w toku', ''], paid: ['opłacona', 'green'], subscribed: ['subskrypcja', 'blue'], failed: ['nieudana', 'red'], expired: ['wygasła', ''],
  refunded: ['zwrócona', 'gold'], disputed: ['chargeback', 'red'], mismatch: ['zła kwota', 'red'],
};
const SOURCES = { payment: 'płatność', subscription: 'subskrypcja', admin: 'admin' };

/** Settings of one provider: what Stripe's and PayPal's dashboards call these fields. */
const PROVIDERS = {
  stripe: {
    name: 'Stripe', icon: 'fa-brands fa-stripe', note: 'Karta, BLIK, Przelewy24, Apple Pay, Google Pay; także subskrypcje co miesiąc.',
    fields: [['secretKey', 'Secret key (sk_test_… / sk_live_…)'], ['webhookSecret', 'Signing secret webhooka (whsec_…)']],
    events: 'checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, invoice.paid, customer.subscription.updated, customer.subscription.deleted, charge.refunded, charge.dispute.created',
  },
  paypal: {
    name: 'PayPal', icon: 'fa-brands fa-paypal', note: 'Tylko wsparcie jednorazowe.',
    fields: [['clientId', 'Client ID'], ['clientSecret', 'Secret'], ['webhookId', 'Webhook ID']],
    events: 'CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.DENIED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED',
  },
};

let data;

export async function supportPage() {
  data = await guard(() => api('GET', '/v1/admin/support'));
  if (!data) return;
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = data.revenue.filter((r) => r.month === month);
  const stat = (cls, label, value, note) => el('div', { class: 'glass stat' }, el('small', {}, icon(cls), label), el('b', { textContent: String(value) }), note ? el('em', { textContent: note }) : '');
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Wsparcie' })),
    el('p', { class: 'muted', textContent: 'Dobrowolne wsparcie projektu: poziomy z rangą, kosmetykami i większymi limitami, bez przewag w grze i bez sprzedaży Iskier. Rangę przyznaje tylko potwierdzenie od operatora płatności (webhook).' }),
    data.keyReady ? '' : el('div', { class: 'glass card st-warn' }, icon('fa-solid fa-triangle-exclamation'),
      el('div', {}, el('b', { textContent: 'Brak STORAGE_SECRET_KEY' }), el('p', { class: 'muted small', textContent: data.keyError ?? 'Bez niego serwer nie zapisze kluczy operatorów płatności. Ustaw go (openssl rand -base64 32) i zrestartuj serwer.' }))),
    el('div', { class: 'stats' },
      stat('fa-solid fa-heart', 'Wspierający teraz', data.activeSupporters),
      stat('fa-solid fa-rotate', 'Subskrypcje (live)', data.activeSubscriptions),
      stat('fa-solid fa-coins', 'Ten miesiąc (live)', thisMonth.length ? thisMonth.map((r) => money(r.paid - r.refunded, r.currency)).join(' + ') : money(0), 'po zwrotach')),
    // the players' refund requests (adminRefunds.js), waiting ones first
    el('h2', { class: 'sup-h' }, 'Zwroty', data.pendingRefunds ? el('span', { class: 'chip gold', textContent: `${data.pendingRefunds} czeka` }) : ''),
    el('div', { id: 'sup-refunds' }),
    el('h2', { class: 'sup-h', textContent: 'Operatorzy płatności' }),
    el('div', { class: 'st-list' }, ...data.providers.map(providerCard)),
    el('h2', { class: 'sup-h', textContent: 'Poziomy' }),
    tiersSection(),
    el('h2', { class: 'sup-h', textContent: 'Wspierający' }),
    el('div', { id: 'sup-supporters' }),
    el('h2', { class: 'sup-h', textContent: 'Płatności' }),
    el('div', { id: 'sup-payments' }),
    el('h2', { class: 'sup-h', textContent: 'Wpływy w miesiącach (live)' }),
    revenueTable());
  refundsSection($('#sup-refunds'), Object.fromEntries(data.tiers.map((t) => [t.id, t.name])), () => { supportersSection(); paymentsSection(); });
  supportersSection();
  paymentsSection();
}

// ---------- providers ----------

function providerCard(p) {
  const info = PROVIDERS[p.id];
  const enabled = el('input', { type: 'checkbox', checked: p.enabled });
  const mode = el('select', {}, el('option', { value: 'test', textContent: 'Testowy (sandbox)', selected: p.mode === 'test' }), el('option', { value: 'live', textContent: 'Produkcyjny (prawdziwe pieniądze)', selected: p.mode === 'live' }));
  const inputs = {};
  const keyFields = (m) => el('div', { class: 'st-fields' }, el('b', { class: 'small', textContent: m === 'test' ? 'Klucze testowe' : 'Klucze produkcyjne' }),
    ...info.fields.map(([f, label]) => {
      const k = p.keys[m][f];
      const input = el('input', { type: 'password', autocomplete: 'off', placeholder: k.set ? `ustawiony${k.hint ? ` (…${k.hint})` : ''}` : 'nie ustawiony', title: k.set ? 'Puste pole nie zmienia zapisanego klucza.' : '' });
      inputs[`${m}.${f}`] = input;
      const clear = k.set ? el('button', { type: 'button', class: 'icon-btn', title: 'Usuń ten klucz', onclick: () => save({ [m]: { [f]: null } }, 'Klucz usunięty.') }, icon('fa-solid fa-eraser')) : '';
      return el('label', { class: 'st-field' }, el('span', { textContent: label }), el('div', { class: 'row' }, el('div', { class: 'grow' }, input), clear));
    }));
  const methods = p.id === 'stripe' ? el('input', { type: 'text', value: p.settings.paymentMethods ?? '', placeholder: 'puste = metody włączone w Dashboard Stripe' }) : null;
  const save = async (extra, done = 'Zapisano.') => {
    const body = { mode: mode.value, enabled: enabled.checked, ...(methods ? { paymentMethods: methods.value } : {}), ...extra };
    if (!extra) for (const m of ['test', 'live']) {
      const keys = {};
      for (const [f] of info.fields) if (inputs[`${m}.${f}`].value.trim()) keys[f] = inputs[`${m}.${f}`].value.trim();
      if (Object.keys(keys).length) body[m] = keys;
    }
    const res = await call('POST', `/v1/admin/support/providers/${p.id}`, body);
    if (res) { toast(done); supportPage(); }
  };
  const result = el('p', { class: 'small muted' });
  const test = el('button', { type: 'button', onclick: async () => {
    result.textContent = 'Sprawdzam…';
    const res = await call('POST', `/v1/admin/support/providers/${p.id}/test`);
    result.textContent = res ? (res.ok ? 'Połączenie działa.' : `Błąd: ${res.message}`) : '';
    result.style.color = res?.ok ? 'var(--green)' : '#fca5a5';
  } }, icon('fa-solid fa-plug-circle-check'), 'Test połączenia');
  const copy = el('button', { type: 'button', class: 'icon-btn', title: 'Kopiuj adres', onclick: async () => { await navigator.clipboard.writeText(p.webhookUrl).catch(() => {}); toast('Skopiowano adres webhooka.'); } }, icon('fa-regular fa-copy'));
  return el('div', { class: `glass card st-card${p.enabled ? '' : ' off'}` },
    el('div', { class: 'row' }, icon(info.icon), el('h3', { class: 'grow', textContent: info.name }),
      p.enabled ? el('span', { class: `chip ${p.mode === 'live' ? 'green' : 'gold'}`, textContent: p.mode === 'live' ? 'LIVE' : 'TEST' }) : el('span', { class: 'chip', textContent: 'wyłączony' })),
    el('p', { class: 'muted small', textContent: info.note }),
    el('label', { class: 'row small' }, el('span', { class: 'switch' }, enabled, el('span')), 'Włączony (strona „Wesprzyj” go pokazuje)'),
    el('label', { class: 'st-field' }, el('span', { textContent: 'Tryb' }), mode),
    keyFields('test'), keyFields('live'),
    methods ? el('label', { class: 'st-field' }, el('span', { textContent: 'Metody płatności (po przecinku, np. card,blik,p24)' }), methods) : '',
    el('div', { class: 'st-field' }, el('span', { textContent: 'Adres webhooka (wklej u operatora)' }), el('div', { class: 'row' }, el('code', { class: 'grow sup-code', textContent: p.webhookUrl }), copy)),
    el('details', { class: 'small' }, el('summary', { textContent: 'Zdarzenia do włączenia' }), el('p', { class: 'muted sup-code', textContent: info.events })),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'primary', onclick: () => save() }, icon('fa-solid fa-check'), 'Zapisz'), test),
    result);
}

// ---------- tiers ----------

function tiersSection() {
  const grace = el('input', { type: 'number', min: 0, max: 30, value: data.graceDays });
  const box = el('div', { class: 'sup-tiers' },
    el('div', { class: 'glass card row' }, el('span', { class: 'grow small', textContent: 'Dni karencji po nieudanym odnowieniu subskrypcji (ranga zostaje, zanim operator ponowi płatność):' }),
      el('div', { class: 'st-field' }, grace), el('button', { onclick: async () => { if (await call('POST', '/v1/admin/support/settings', { graceDays: Number(grace.value) })) toast('Zapisano.'); } }, 'Zapisz')),
    ...data.tiers.map((t) => tierCard(t)), tierCard(undefined));
  return box;
}

function tierCard(t) {
  const isNew = !t;
  t ??= { id: '', level: 1, name: '', nameEn: '', color: '#60a5fa', perks: '', perksEn: '', oneTimePln: 0, oneTimeEur: 0, days: 30, monthlyPln: 0, monthlyEur: 0, limitFactor: 1, cosmetics: true, profile: true, earlyAccess: false, enabled: true };
  const f = {
    id: el('input', { type: 'text', value: t.id, placeholder: 'np. supporter', disabled: !isNew }),
    level: el('input', { type: 'number', min: 1, max: 9, value: t.level }),
    name: el('input', { type: 'text', value: t.name, maxLength: 40 }), nameEn: el('input', { type: 'text', value: t.nameEn, maxLength: 40 }),
    color: el('input', { type: 'color', value: t.color }),
    perks: el('textarea', { value: t.perks, rows: 4, maxLength: 1000 }), perksEn: el('textarea', { value: t.perksEn, rows: 4, maxLength: 1000 }),
    oneTimePln: el('input', { type: 'text', inputMode: 'decimal', value: fromMinor(t.oneTimePln), placeholder: '—' }),
    oneTimeEur: el('input', { type: 'text', inputMode: 'decimal', value: fromMinor(t.oneTimeEur), placeholder: '—' }),
    days: el('input', { type: 'number', min: 1, max: 366, value: t.days }),
    monthlyPln: el('input', { type: 'text', inputMode: 'decimal', value: fromMinor(t.monthlyPln), placeholder: '—' }),
    monthlyEur: el('input', { type: 'text', inputMode: 'decimal', value: fromMinor(t.monthlyEur), placeholder: '—' }),
    limitFactor: el('input', { type: 'number', min: 1, max: 10, step: 0.5, value: t.limitFactor }),
  };
  const flag = (key, label) => {
    const input = el('input', { type: 'checkbox', checked: t[key] });
    f[key] = input;
    return el('label', { class: 'row small' }, el('span', { class: 'switch' }, input, el('span')), label);
  };
  const field = (label, input) => el('label', { class: 'st-field' }, el('span', { textContent: label }), input);
  const save = async () => {
    const body = {
      id: f.id.value.trim(), level: Number(f.level.value), name: f.name.value, nameEn: f.nameEn.value, color: f.color.value, perks: f.perks.value, perksEn: f.perksEn.value,
      oneTimePln: toMinor(f.oneTimePln.value), oneTimeEur: toMinor(f.oneTimeEur.value), days: Number(f.days.value),
      monthlyPln: toMinor(f.monthlyPln.value), monthlyEur: toMinor(f.monthlyEur.value), limitFactor: Number(f.limitFactor.value),
      cosmetics: f.cosmetics.checked, profile: f.profile.checked, earlyAccess: f.earlyAccess.checked, enabled: f.enabled.checked,
    };
    if (await call('POST', '/v1/admin/support/tiers', body)) { toast(isNew ? 'Dodano poziom.' : 'Zapisano poziom.'); supportPage(); }
  };
  const card = el('details', { class: 'glass card sup-tier', open: isNew ? false : undefined },
    el('summary', { class: 'row' }, el('span', { class: 'sup-dot' }), el('b', { class: 'grow', textContent: isNew ? '+ Nowy poziom' : `${t.name} (${t.id}, poziom ${t.level})` }),
      isNew ? '' : el('span', { class: 'muted small', textContent: [t.oneTimePln ? `${money(t.oneTimePln)} / ${t.days} dni` : '', t.monthlyPln ? `${money(t.monthlyPln)} / mies.` : ''].filter(Boolean).join(' · ') }),
      isNew || t.enabled ? '' : el('span', { class: 'chip', textContent: 'wyłączony' })),
    el('div', { class: 'sup-grid' },
      field('Id', f.id), field('Poziom (wyżej = więcej)', f.level), field('Kolor', f.color),
      field('Nazwa', f.name), field('Nazwa po angielsku', f.nameEn), field('Mnożnik limitów (chmura, zrzuty)', f.limitFactor),
      field('Jednorazowo: zł', f.oneTimePln), field('Jednorazowo: EUR', f.oneTimeEur), field('Na ile dni', f.days),
      field('Co miesiąc: zł', f.monthlyPln), field('Co miesiąc: EUR', f.monthlyEur)),
    el('div', { class: 'sup-grid two' }, field('Co daje (każda korzyść w osobnej linii)', f.perks), field('Co daje, po angielsku', f.perksEn)),
    el('div', { class: 'row' }, flag('cosmetics', 'Kosmetyki wspierających'), flag('profile', 'Ramka avatara na profilu'), flag('earlyAccess', 'Wcześniejszy dostęp'), flag('enabled', 'Włączony')),
    el('div', { class: 'row' }, el('button', { class: 'primary', onclick: save }, icon('fa-solid fa-check'), isNew ? 'Dodaj' : 'Zapisz'),
      isNew ? '' : el('button', { class: 'danger', onclick: async () => {
        if (!confirm(`Usunąć poziom ${t.name}?`)) return;
        if (await call('DELETE', `/v1/admin/support/tiers/${t.id}`)) { toast('Usunięto.'); supportPage(); }
      } }, icon('fa-solid fa-trash-can'), 'Usuń')));
  card.style.setProperty('--tier', t.color);
  return card;
}

// ---------- supporters ----------

async function supportersSection() {
  const res = await call('GET', '/v1/admin/support/supporters');
  const box = $('#sup-supporters');
  if (!res || !box) return;
  const tierName = Object.fromEntries(data.tiers.map((t) => [t.id, t.name]));
  const handle = el('input', { type: 'text', placeholder: 'nick (handle)' });
  const tier = el('select', {}, ...data.tiers.map((t) => el('option', { value: t.id, textContent: t.name })));
  const days = el('input', { type: 'number', min: 1, max: 3650, value: 30 });
  const lifetime = el('input', { type: 'checkbox' });
  const note = el('input', { type: 'text', placeholder: 'notatka (np. konkurs)', maxLength: 200 });
  const form = el('form', { class: 'glass card row sup-grant', onsubmit: async (e) => {
    e.preventDefault();
    const body = { handle: handle.value.trim(), tier: tier.value, note: note.value, ...(lifetime.checked ? { lifetime: true } : { days: Number(days.value) }) };
    if (await call('POST', '/v1/admin/support/grants', body)) { toast('Przyznano.'); supportersSection(); }
  } }, el('b', { textContent: 'Przyznaj ręcznie:' }), handle, tier, el('div', { class: 'st-field' }, days), el('span', { class: 'small', textContent: 'dni' }),
    el('label', { class: 'row small' }, el('span', { class: 'switch' }, lifetime, el('span')), 'na zawsze'), note, el('button', { type: 'submit', class: 'primary' }, icon('fa-solid fa-plus'), 'Przyznaj'));
  const grantRow = (g) => el('div', { class: `row small sup-grantline${g.revokedAt ? ' off' : ''}` },
    el('span', { class: 'chip', textContent: tierName[g.tier] ?? g.tier }), el('span', { textContent: SOURCES[g.source] ?? g.source }),
    el('span', { class: 'muted', textContent: `${fmtDate(g.startsAt)} → ${g.expiresAt ? fmtDate(g.expiresAt) : 'na zawsze'}` }),
    g.revokedAt ? el('span', { class: 'chip red', textContent: `odebrane: ${g.revokedReason}` }) : '',
    g.note ? el('span', { class: 'muted', textContent: `„${g.note}”` }) : '', g.by ? el('span', { class: 'muted', textContent: `przez @${g.by}` }) : '',
    el('span', { class: 'grow' }),
    !g.revokedAt && g.expiresAt ? el('button', { class: 'icon-btn', title: 'Przedłuż', onclick: async () => {
      const n = Number(prompt('O ile dni przedłużyć?', '30'));
      if (n && await call('POST', `/v1/admin/support/grants/${g.id}/extend`, { days: n })) { toast('Przedłużono.'); supportersSection(); }
    } }, icon('fa-solid fa-calendar-plus')) : '',
    !g.revokedAt ? el('button', { class: 'icon-btn danger', title: 'Odbierz', onclick: async () => {
      const reason = prompt('Powód odebrania (zapisze się w dzienniku):', '');
      if (reason !== null && await call('POST', `/v1/admin/support/grants/${g.id}/revoke`, { reason })) { toast('Odebrano.'); supportersSection(); }
    } }, icon('fa-solid fa-ban')) : '');
  box.replaceChildren(form, el('div', { class: 'glass card' }, res.supporters.length
    ? el('div', { class: 'sup-people' }, ...res.supporters.map((s) => el('details', { class: 'sup-person' },
      el('summary', { class: 'row' }, el('b', { textContent: `@${s.handle}` }), el('span', { class: 'muted', textContent: s.name }), el('span', { class: 'grow' }),
        s.active ? el('span', { class: 'chip green', textContent: `${tierName[s.active.tier] ?? s.active.tier}${s.active.expiresAt ? ` do ${fmtDate(s.active.expiresAt)}` : ', na zawsze'}` }) : el('span', { class: 'chip', textContent: 'nieaktywny' })),
      ...s.grants.map(grantRow))))
    : el('p', { class: 'muted', textContent: 'Nikt jeszcze nie wspierał.' })));
}

// ---------- payments ----------

const payments = { status: '', handle: '', offset: 0 };

async function paymentsSection() {
  const box = $('#sup-payments');
  if (!box) return;
  const q = new URLSearchParams({ limit: '50', offset: String(payments.offset), ...(payments.status ? { status: payments.status } : {}), ...(payments.handle ? { handle: payments.handle } : {}) });
  const res = await call('GET', `/v1/admin/support/payments?${q}`);
  if (!res) return;
  const status = el('select', {}, el('option', { value: '', textContent: 'Wszystkie' }), ...Object.entries(STATUS).map(([k, [name]]) => el('option', { value: k, textContent: name, selected: payments.status === k })));
  status.addEventListener('change', () => { payments.status = status.value; payments.offset = 0; paymentsSection(); });
  const handle = el('input', { type: 'search', placeholder: 'nick', value: payments.handle });
  handle.addEventListener('change', () => { payments.handle = handle.value.trim(); payments.offset = 0; paymentsSection(); });
  const tierName = Object.fromEntries(data.tiers.map((t) => [t.id, t.name]));
  const rows = res.payments.map((p) => {
    const [label, color] = STATUS[p.status] ?? [p.status, ''];
    return el('tr', {},
      el('td', { textContent: fmtDate(p.paidAt ?? p.createdAt) }),
      el('td', { textContent: p.handle ? `@${p.handle}` : p.user.slice(0, 8) }),
      el('td', { textContent: `${tierName[p.tier] ?? p.tier}${p.kind === 'monthly' ? ' · mies.' : ` · ${p.days} dni`}` }),
      el('td', { textContent: p.status === 'subscribed' ? '—' : money(p.amount, p.currency) }),
      el('td', { class: 'hide-sm', textContent: p.provider }),
      el('td', {}, el('span', { class: `chip ${color}`, textContent: label }), p.test ? el('span', { class: 'chip gold', textContent: 'TEST' }) : ''),
      el('td', { class: 'hide-sm muted sup-code', title: [p.ref, p.intent, p.subscription, p.note].filter(Boolean).join(' · '), textContent: p.note || p.ref }));
  });
  box.replaceChildren(el('div', { class: 'glass card' },
    el('div', { class: 'row' }, status, handle, el('span', { class: 'grow muted small', textContent: `${res.total} płatności` }),
      payments.offset ? el('button', { onclick: () => { payments.offset = Math.max(0, payments.offset - 50); paymentsSection(); } }, 'Nowsze') : '',
      payments.offset + 50 < res.total ? el('button', { onclick: () => { payments.offset += 50; paymentsSection(); } }, 'Starsze') : ''),
    rows.length ? el('div', { class: 'sup-scroll' }, el('table', {}, el('thead', {}, el('tr', {}, ...['Kiedy', 'Kto', 'Co', 'Kwota', 'Operator', 'Stan', 'Id'].map((h, i) => el('th', { class: i === 4 || i === 6 ? 'hide-sm' : '', textContent: h })))), el('tbody', {}, ...rows)))
      : el('p', { class: 'muted', textContent: 'Brak płatności.' })));
}

function revenueTable() {
  if (!data.revenue.length) return el('div', { class: 'glass card' }, el('p', { class: 'muted', textContent: 'Jeszcze nic nie wpłynęło (płatności testowe się nie liczą).' }));
  return el('div', { class: 'glass card' }, el('table', {}, el('thead', {}, el('tr', {}, ...['Miesiąc', 'Waluta', 'Wpłaty', 'Zwroty', 'Na czysto', 'Liczba'].map((h) => el('th', { textContent: h })))),
    el('tbody', {}, ...data.revenue.map((r) => el('tr', {},
      el('td', { textContent: r.month }), el('td', { textContent: r.currency }), el('td', { textContent: money(r.paid, r.currency) }),
      el('td', { textContent: money(r.refunded, r.currency) }), el('td', {}, el('b', { textContent: money(r.paid - r.refunded, r.currency) })), el('td', { textContent: String(r.count) }))))));
}
