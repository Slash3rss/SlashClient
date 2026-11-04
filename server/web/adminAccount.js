// The admin panel's account management in the "Konta" drawer (adminAccount.ts on the server): the account's
// name, nick, avatar and what it wears, its ways to sign in, sessions and phones, a ban with a reason and an
// end, its own log, a copy of its data (GDPR), deleting it with a copy kept for a while, and the list of
// deleted accounts to restore from.
import { PROVIDERS, SLOTS, ApiError, api, confirmModal, el, errorText, fmtDate, ago, icon, promptModal, toast } from './common.js';

/** What the server's refusals mean here (the site's own texts do not know these). */
const ERRORS = {
  bad_name: () => 'Nazwa musi mieć od 1 do 32 znaków.',
  bad_handle: () => 'Nick: od 1 do 24 znaków, tylko litery bez polskich znaków, cyfry, _ i kropka.',
  handle_taken: (d) => `Nick @${d.handle ?? ''} ma już inne konto.`,
  handle_reserved: () => 'Ten nick należy do admina z konfiguracji serwera (ADMIN_HANDLES).',
  config_admin: () => 'To admin z konfiguracji serwera (ADMIN_HANDLES): tego nie można zmienić w panelu.',
  self: () => 'Tego nie zrobisz na własnym koncie.',
  last_provider: () => 'To jedyny sposób logowania: po odłączeniu nikt nie otworzyłby konta.',
  bad_cape: (d) => `Gracz nie ma peleryny ${d.item ?? ''} (nie kupił jej, nie dostał ani nie jest darmowa).`,
  bad_item: (d) => `Gracz nie może założyć ${d.item ?? 'tego przedmiotu'} (nie ma go ani nie jest darmowy).`,
  bad_avatar: () => 'Takiego awatara to konto nie ma.',
  not_linked: () => 'To konto Minecraft nie jest już podłączone.',
  bad_reason: () => 'Powód blokady może mieć najwyżej 300 znaków.',
  bad_until: () => 'Koniec blokady musi być w przyszłości.',
  exists: () => 'To konto już istnieje (zostało przywrócone wcześniej).',
  identity_taken: (d) => `Logowanie ${PROVIDERS[d.provider]?.[0] ?? d.provider ?? ''}${d.label ? ` (${d.label})` : ''} należy teraz do konta @${d.handle ?? '?'}. Odłącz je tam albo usuń tamto konto, i spróbuj ponownie.`,
  not_found: () => 'Już tego nie ma – odśwież listę.',
};
const explain = (err) => (err instanceof ApiError && ERRORS[err.code] ? ERRORS[err.code](err.data ?? {}) : errorText(err));
/** Runs a request; a refusal is told in the panel's words. Resolves undefined when it failed. */
async function run(fn) {
  try {
    return await fn();
  } catch (err) {
    toast(explain(err), true);
    return undefined;
  }
}

const SLOT_NAMES = Object.fromEntries(SLOTS.map(([id, name]) => [id, name]));
const providerName = (p) => (PROVIDERS[p] ?? [p === 'dev' ? 'Test' : p])[0];
const providerIcon = (p) => icon((PROVIDERS[p] ?? ['', p === 'dev' ? 'fa-solid fa-flask' : 'fa-solid fa-key'])[1]);
/** A section of the drawer that opens and closes (the drawer stays short). */
const section = (title, cls, open, ...body) => el('details', { class: 'acc-sec', open }, el('summary', {}, icon(cls), title), ...body);
const dt = (ms) => (ms ? `${fmtDate(ms)} (${ago(ms)})` : '—');

/**
 * The drawer's extra sections for one account (loaded here, drawn when they come). `ctx`: `me` (the admin
 * signed in), `actions` (the log's labels) and `changed()` (the list and the drawer are drawn again).
 */
export function accountSections(u, ctx) {
  const box = el('div', { class: 'acc' }, el('p', { class: 'muted small', textContent: 'Wczytywanie szczegółów konta…' }));
  const load = () => api('GET', `/v1/admin/users/${u.id}/account`).then((d) => draw(d), (err) => box.replaceChildren(el('p', { class: 'muted small', textContent: `Nie udało się wczytać szczegółów: ${explain(err)}` })));
  const self = u.id === ctx.me.id;
  /**
   * A change saved: the sections show the answer (those open stay open) and the list's row follows; a change of
   * the name or nick (`whole`) draws the whole drawer again, its head shows them.
   */
  const send = async (method, path, body, done, whole = false) => {
    const d = await run(() => api(method, path, body));
    if (!d) return;
    toast(done);
    if (whole) return ctx.changed();
    draw(d);
    ctx.relist?.();
  };

  function details(d) {
    const name = el('input', { type: 'text', value: d.name, maxLength: 32, required: true });
    const handle = el('input', { type: 'text', value: d.handle, maxLength: 24, required: true, disabled: u.configAdmin, title: u.configAdmin ? 'Admin z konfiguracji serwera (ADMIN_HANDLES)' : '' });
    const shown = el('input', { type: 'checkbox', checked: d.showServer });
    const avatar = el('select', {},
      el('option', { value: '', textContent: d.avatars.minecraft.length ? `Twarz Minecrafta (${d.avatars.minecraft[0].name || 'pierwsze konto'})` : 'Domyślny (litera)', selected: d.avatarSource === '' }),
      ...d.avatars.minecraft.slice(1).map((m) => el('option', { value: m.uuid, textContent: `Twarz Minecrafta: ${m.name || m.uuid.slice(0, 8)}`, selected: d.avatarSource === m.uuid })),
      d.avatars.provider ? el('option', { value: 'provider', textContent: 'Obrazek z logowania (Discord, Google…)', selected: d.avatarSource === 'provider' }) : '');
    const form = el('form', { class: 'acc-form', onsubmit: async (e) => {
      e.preventDefault();
      const body = {};
      if (name.value.trim() !== d.name) body.name = name.value.trim();
      const nick = handle.value.trim().replace(/^@/, '');
      if (nick !== d.handle) body.handle = nick;
      if (shown.checked !== d.showServer) body.showServer = shown.checked;
      if (avatar.value !== d.avatarSource) body.avatarSource = avatar.value;
      if (!Object.keys(body).length) return toast('Nic się nie zmieniło.');
      if (body.handle && !await confirmModal({ title: `Zmienić nick @${d.handle} na @${nick}?`, text: `Znajomi zobaczą nowy nick od razu. Stary adres profilu /u/${d.handle} będzie prowadził do nowego, dopóki nikt nie zajmie starego nicku.`, ok: 'Zmień nick' })) return;
      await send('POST', `/v1/admin/users/${u.id}/account`, body, 'Dane konta zapisane.', !!(body.name || body.handle));
    } },
    el('label', {}, 'Nazwa', name),
    el('label', {}, 'Nick', handle),
    d.formerHandles.length ? el('small', { class: 'muted', textContent: `Wcześniej: ${d.formerHandles.map((h) => `@${h}`).join(', ')}` }) : '',
    el('label', {}, 'Awatar', avatar),
    el('label', { class: 'opt' }, 'Serwer widoczny dla znajomych', el('span', { class: 'switch' }, shown, el('span'))),
    el('button', { type: 'submit' }, icon('fa-solid fa-floppy-disk'), 'Zapisz dane'));
    return section('Dane konta', 'fa-solid fa-id-badge', false, form);
  }

  /** One set's editor: a list per slot of what the player may wear (and what they wear now). */
  function setEditor(d, set, target) {
    const bySlot = {};
    for (const i of d.wearable) (bySlot[i.slot] ??= []).push(i);
    const selects = {};
    const rows = SLOTS.map(([slot]) => slot).filter((slot) => bySlot[slot]?.length || set?.[slot]).map((slot) => {
      const options = bySlot[slot] ?? [];
      const worn = set?.[slot] ?? '';
      const sel = el('select', {}, el('option', { value: '', textContent: '—' }),
        ...options.map((i) => el('option', { value: i.id, textContent: i.name, selected: worn === i.id })),
        // worn but not allowed any more (the next save takes it off unless it is left as it is)
        worn && !options.some((i) => i.id === worn) ? el('option', { value: worn, textContent: `${worn} (niedostępny)`, selected: true }) : '');
      selects[slot] = sel;
      return el('label', {}, SLOT_NAMES[slot] ?? slot, sel);
    });
    const save = async (e) => {
      e.preventDefault();
      const loadout = {};
      for (const [slot, sel] of Object.entries(selects)) if (sel.value !== (set?.[slot] ?? '')) loadout[slot] = sel.value;
      if (!Object.keys(loadout).length) return toast('Nic się nie zmieniło.');
      await send('POST', `/v1/admin/users/${u.id}/account`, { ...(target ? { character: target } : {}), loadout }, 'Wygląd zapisany.');
    };
    return el('form', { class: 'acc-form acc-set', onsubmit: save }, ...rows, el('button', { type: 'submit' }, icon('fa-solid fa-floppy-disk'), 'Zapisz wygląd'));
  }

  function looks(d) {
    const parts = [el('p', { class: 'muted small', textContent: 'Tylko to, co gracz ma (kupione, przyznane, z rangi lub wsparcia) albo co jest darmowe. Kosmetyk do przyznania dodasz w zakładce Kosmetyki.' }),
      el('h5', { textContent: 'Zestaw konta' }), setEditor(d, d.loadout)];
    for (const c of d.characters) {
      parts.push(el('div', { class: 'row acc-char' }, el('h5', { class: 'grow', textContent: `Minecraft: ${c.name || c.uuid.slice(0, 8)}` }),
        c.loadout ? el('button', { type: 'button', onclick: () => send('POST', `/v1/admin/users/${u.id}/account`, { character: c.uuid, own: false }, 'Postać nosi teraz zestaw konta.') }, icon('fa-solid fa-rotate-left'), 'Jak konto')
          : el('span', { class: 'chip', textContent: 'jak konto' })));
      parts.push(c.loadout ? setEditor(d, c.loadout, c.uuid)
        : el('button', { type: 'button', onclick: () => send('POST', `/v1/admin/users/${u.id}/account`, { character: c.uuid, loadout: {} }, 'Postać ma teraz własny zestaw.') }, icon('fa-solid fa-plus'), 'Własny zestaw tej postaci'));
    }
    return section('Wygląd', 'fa-solid fa-shirt', false, ...parts);
  }

  function logins(d) {
    const last = d.identities.length < 2;
    const rows = d.identities.map((i) => el('div', { class: 'acc-row' }, providerIcon(i.provider),
      el('div', { class: 'grow' }, el('b', { textContent: providerName(i.provider) }), el('small', { class: 'muted', textContent: i.label ? ` ${i.label}` : ` ${i.subject}` })),
      el('button', { class: 'icon-btn danger', title: last ? 'To jedyny sposób logowania' : self ? 'Nie na własnym koncie' : 'Odłącz', disabled: last || self || u.configAdmin, onclick: async () => {
        if (!await confirmModal({ title: `Odłączyć ${providerName(i.provider)}${i.label ? ` (${i.label})` : ''}?`, text: i.provider === 'minecraft' ? 'Gracz nie zaloguje się tym kontem Minecraft, a jego postać straci wygląd ze SlashClient, dopóki znów jej nie podłączy.' : 'Gracz nie zaloguje się już w ten sposób, dopóki znów go nie podłączy.', ok: 'Odłącz', danger: true })) return;
        await send('DELETE', `/v1/admin/users/${u.id}/identities/${encodeURIComponent(i.provider)}/${encodeURIComponent(i.subject)}`, undefined, 'Odłączono.');
      } }, icon('fa-solid fa-link-slash'))));
    return section('Logowanie i konta Minecraft', 'fa-solid fa-key', false, ...rows);
  }

  function devices(d) {
    const sessions = d.sessions.map((s) => el('div', { class: 'acc-row' }, icon('fa-solid fa-desktop'),
      el('div', { class: 'grow' }, el('b', { textContent: `Sesja ${s.id}` }), el('small', { class: 'muted', textContent: ` od ${fmtDate(s.createdAt)}, ostatnio ${ago(s.lastUsed)}` })),
      el('button', { class: 'icon-btn danger', title: 'Wyloguj tę sesję', onclick: async () => {
        if (!await confirmModal({ title: 'Wylogować tę sesję?', text: 'Launcher albo przeglądarka z tą sesją od razu się wyloguje. Inne zostają.', ok: 'Wyloguj', danger: true })) return;
        await send('DELETE', `/v1/admin/users/${u.id}/sessions/${s.id}`, undefined, 'Sesja zakończona.');
      } }, icon('fa-solid fa-right-from-bracket'))));
    const phones = d.phones.map((p) => el('div', { class: 'acc-row' }, icon('fa-solid fa-mobile-screen'),
      el('div', { class: 'grow' }, el('b', { textContent: p.label || 'Telefon' }), el('small', { class: 'muted', textContent: ` ${p.lang}, ostatnio ${ago(p.usedAt)}` })),
      el('button', { class: 'icon-btn danger', title: 'Wyłącz powiadomienia na tym telefonie', onclick: async () => {
        if (!await confirmModal({ title: `Wyłączyć powiadomienia na „${p.label || 'telefonie'}”?`, text: 'Telefon przestanie dostawać powiadomienia, dopóki gracz znów ich nie włączy.', ok: 'Wyłącz', danger: true })) return;
        await send('DELETE', `/v1/admin/users/${u.id}/phones/${encodeURIComponent(p.id)}`, undefined, 'Powiadomienia wyłączone.');
      } }, icon('fa-solid fa-bell-slash'))));
    return section(`Urządzenia (${d.sessions.length + d.phones.length})`, 'fa-solid fa-laptop', false,
      sessions.length ? el('div', {}, ...sessions) : el('p', { class: 'muted small', textContent: 'Nigdzie nie jest zalogowany.' }),
      phones.length ? el('div', {}, el('h5', { textContent: 'Powiadomienia na telefonie' }), ...phones) : '',
      el('p', { class: 'muted small', textContent: `Klucze szyfrowania czatu: ${d.chatDevices} (zarządza nimi gracz w launcherze; usunięcie odcięłoby mu historię).` }));
  }

  function log(d) {
    const rows = d.log.map((e) => el('tr', {},
      el('td', { class: 'nowrap', textContent: new Date(e.at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) }),
      el('td', { textContent: e.admin ? `@${e.adminHandle ?? e.admin.slice(0, 8)}` : 'automat' }),
      el('td', {}, ctx.actions[e.action] ?? e.action, e.detail ? el('small', { class: 'muted', textContent: ` ${e.detail}` }) : '')));
    return section(`Dziennik konta (${d.log.length})`, 'fa-solid fa-clock-rotate-left', false,
      rows.length ? el('table', { class: 'ledger-table' }, el('tbody', {}, ...rows)) : el('p', { class: 'muted small', textContent: 'Żaden admin nic tu jeszcze nie zmieniał.' }));
  }

  function draw(d) {
    // the sections open now stay open (by their place: the same ones are drawn each time)
    const open = [...box.querySelectorAll(':scope > details')].map((s) => s.open);
    box.replaceChildren(
      d.ban ? el('div', { class: 'acc-ban' }, icon('fa-solid fa-ban'), el('div', { class: 'grow' },
        el('b', { textContent: d.ban.until ? `Zablokowany do ${fmtDate(d.ban.until)}` : 'Zablokowany na zawsze' }),
        el('small', { textContent: d.ban.reason ? `Powód: ${d.ban.reason}` : 'Bez podanego powodu' })),
      el('button', { disabled: self || u.configAdmin, onclick: () => banFlow(u, ctx.changed, d.ban) }, icon('fa-solid fa-pen'), 'Zmień')) : '',
      details(d), looks(d), logins(d), devices(d), log(d),
      el('button', { onclick: () => exportAccount(u) }, icon('fa-solid fa-file-arrow-down'), 'Pobierz dane konta (RODO)'));
    box.querySelectorAll(':scope > details').forEach((s, i) => { if (open[i]) s.open = true; });
  }

  load();
  return box;
}

/**
 * A ban with a reason (the player sees it when signing in) and an optional end; `ban` given: the
 * reason and end of the ban there is now are changed. An unban needs only a yes.
 */
export async function banFlow(u, done, ban) {
  if (u.banned && !ban) {
    if (!await confirmModal({ title: `Odblokować @${u.handle}?`, text: 'Gracz znów będzie mógł się zalogować.', ok: 'Odblokuj' })) return;
    if (await run(() => api('POST', `/v1/admin/users/${u.id}`, { banned: false }))) { toast('Konto odblokowane.'); done(); }
    return;
  }
  const reason = await promptModal({ title: ban ? `Blokada @${u.handle}` : `Zablokować @${u.handle}?`, text: 'Gracz zobaczy powód, gdy spróbuje się zalogować.', label: 'Powód (można zostawić puste)', value: ban?.reason ?? '', maxLength: 300, ok: 'Dalej' });
  if (reason === null) return;
  const local = (ms) => {
    const t = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
    return t.toISOString().slice(0, 16);
  };
  const end = await promptModal({ title: 'Do kiedy?', text: 'Puste pole: na zawsze. Po tym czasie konto odblokuje się samo.', label: 'Koniec blokady', type: 'datetime-local', value: ban?.until ? local(ban.until) : '', min: local(Date.now()),
    ok: ban ? 'Zapisz' : 'Zablokuj', okIcon: 'fa-solid fa-ban', danger: true });
  if (end === null) return;
  const until = end ? new Date(end).getTime() : 0;
  if (end && !(until > Date.now())) return toast('Koniec blokady musi być w przyszłości.', true);
  if (await run(() => api('POST', `/v1/admin/users/${u.id}`, { banned: true, banReason: reason.trim(), banUntil: until }))) {
    toast(ban ? 'Blokada zmieniona.' : 'Konto zablokowane i wylogowane.');
    done();
  }
}

/** Everything the account has here as one JSON file (GDPR): asked with the admin's session, saved by the browser. */
export async function exportAccount(u) {
  const data = await run(() => api('GET', `/v1/admin/users/${u.id}/export`));
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `slashclient-${u.handle}-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  toast('Dane konta pobrane.');
}

/** Deleting, after a yes: the server keeps a copy for the days the settings say, restorable in "Usunięte konta". */
export async function deleteAccount(u, done) {
  if (!await confirmModal({ title: `Usunąć konto ${u.name} (@${u.handle})?`, text: 'Konto zniknie od razu, razem ze znajomymi, wiadomościami i udostępnionymi plikami.',
    list: ['Przez 30 dni (lub krócej, jak w Ustawieniach) da się je przywrócić w Konta → Usunięte konta: wróci z kosmetykami, Iskrami, osiągnięciami, znajomymi i klanem.', 'Wiadomości, sesje i udostępnione pliki nie wrócą.'],
    warning: 'Właściciel klanu, grupy lub społeczności traci ją na rzecz najstarszego członka.', ok: 'Usuń konto', okIcon: 'fa-solid fa-trash-can', danger: true })) return;
  if (await run(() => api('DELETE', `/v1/admin/users/${u.id}`))) { toast('Konto usunięte. Możesz je przywrócić w „Usunięte konta”.'); done(); }
}

/** The "Usunięte konta" list: when each went and by whom, restore or forget now. `restored(id)` opens the account. */
export function deletedAccounts(restored) {
  const box = el('div', { class: 'glass card' }, el('p', { class: 'muted', textContent: 'Ładowanie…' }));
  const load = async () => {
    const res = await run(() => api('GET', '/v1/admin/deleted-accounts'));
    if (!res) return;
    const rows = res.accounts.map((a) => el('tr', {},
      el('td', {}, el('b', { textContent: a.name }), el('small', { class: 'muted', textContent: ` @${a.handle}` })),
      el('td', { class: 'hide-sm', textContent: `${fmtDate(a.deletedAt)}${a.byHandle ? ` · @${a.byHandle}` : ''}` }),
      el('td', { textContent: `do ${fmtDate(a.expiresAt)}` }),
      el('td', {}, el('div', { class: 'row' },
        el('button', { onclick: async () => {
          if (!await confirmModal({ title: `Przywrócić konto @${a.handle}?`, text: 'Wróci z tym, co miało w chwili usunięcia (bez wiadomości, sesji i plików). Gracz musi się zalogować ponownie.', ok: 'Przywróć', okIcon: 'fa-solid fa-trash-arrow-up' })) return;
          const r = await run(() => api('POST', `/v1/admin/deleted-accounts/${a.id}/restore`));
          if (!r) return;
          toast(`Konto przywrócone${r.skipped ? ` (pominięto ${r.skipped} wpisów, których nie dało się odtworzyć)` : ''}.`);
          restored(r.id);
        } }, icon('fa-solid fa-trash-arrow-up'), 'Przywróć'),
        el('button', { class: 'icon-btn danger', title: 'Usuń kopię na zawsze', onclick: async () => {
          if (!await confirmModal({ title: `Usunąć kopię konta @${a.handle} na zawsze?`, text: 'Konta nie będzie już można przywrócić.', ok: 'Usuń na zawsze', danger: true })) return;
          if (await run(() => api('DELETE', `/v1/admin/deleted-accounts/${a.id}`))) { toast('Kopia usunięta.'); load(); }
        } }, icon('fa-solid fa-trash-can'))))));
    box.replaceChildren(el('p', { class: 'muted small', textContent: `Usunięte w panelu konta można przywrócić przez ${res.days} dni, potem ich kopia znika na zawsze.` }),
      rows.length ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Konto' }), el('th', { class: 'hide-sm', textContent: 'Usunięte' }), el('th', { textContent: 'Przywrócisz' }), el('th'))), el('tbody', {}, ...rows))
        : el('p', { class: 'muted', textContent: 'Nie ma usuniętych kont do przywrócenia.' }));
  };
  load();
  return box;
}
