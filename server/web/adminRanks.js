// The admin panel's "Rangi": the ranks with their colour (the Slash logo next to the nick is drawn
// in it), name, order, description and own icon; new ranks for admins to give. And in a player's
// drawer: the ranks they hold, given (optionally until a day) and taken back (ranks.ts).
import { $, ApiError, api, el, fmtDate, guard, icon, toast, token } from './common.js';
import { rankBadge, rankChip } from './ranks.js';

const AUTO = { role: 'automatyczna: rola admina', payment: 'automatyczna: aktywne wsparcie (kolor i nazwa z poziomu wsparcia)' };
const SOURCES = { admin: 'nadana', migration: 'sprzed wielu rang', payment: 'wsparcie', role: 'rola admina', achievement: 'osiągnięcie' };

/** The ranks there are, for the drawer's picker (loaded with the tab or the drawer). */
let defs = [];
async function loadDefs() {
  const res = await guard(() => api('GET', '/v1/admin/ranks'));
  if (res) defs = res.ranks;
  return res;
}

/** Sends a 16×16 or 32×32 PNG as it is. */
async function uploadIcon(id, file) {
  const res = await fetch(`/v1/admin/ranks/${encodeURIComponent(id)}/icon`, { method: 'PUT', headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token.get()}` }, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'server_error', res.status);
  return data;
}

export async function ranksPage() {
  const res = await loadDefs();
  if (!res) return;
  $('#main').replaceChildren(
    el('div', { class: 'page-head' }, el('h1', { textContent: 'Rangi' })),
    el('p', { class: 'muted', textContent: 'Gracz może mieć kilka rang: profil publiczny pokazuje wszystkie, a przy nicku (gra, launcher, lista znajomych) jest odznaka jednej, którą gracz wybiera sam (domyślnie najważniejsza, czyli z najwyższą kolejnością). Rangi nadaje się w szufladzie konta (Konta). Kosmetyki rang są dla każdego, kto ma daną rangę.' }),
    el('p', { class: 'muted small', textContent: 'Gra rysuje logo Slash w kolorze rangi (gry sprzed 0.9.23 znają tylko pierwsze rangi i ich stałe kolory). Własna ikona (PNG 16×16 albo 32×32) zastępuje logo w launcherze i na stronie.' }),
    el('div', { class: 'rank-list' }, ...res.ranks.map((r) => rankCard(r)), rankCard(undefined)));
}

function rankCard(r) {
  const isNew = !r;
  r ??= { id: '', name: '', nameEn: '', color: '#60a5fa', priority: 50, description: '', descriptionEn: '', enabled: true, auto: '', builtin: false, holders: 0 };
  const f = {
    id: el('input', { type: 'text', value: r.id, placeholder: 'np. vip', maxLength: 24, disabled: !isNew }),
    name: el('input', { type: 'text', value: r.name, maxLength: 32 }), nameEn: el('input', { type: 'text', value: r.nameEn, maxLength: 32 }),
    color: el('input', { type: 'color', value: r.color }),
    priority: el('input', { type: 'number', min: 0, max: 1000, value: r.priority }),
    description: el('input', { type: 'text', value: r.description, maxLength: 200 }), descriptionEn: el('input', { type: 'text', value: r.descriptionEn, maxLength: 200 }),
    enabled: el('input', { type: 'checkbox', checked: r.enabled }),
  };
  const field = (label, input) => el('label', { class: 'st-field' }, el('span', { textContent: label }), input);
  const preview = el('span', { class: 'row' });
  const drawPreview = () => preview.replaceChildren(rankChip({ ...r, name: f.name.value || '…', color: f.color.value, icon: r.iconUrl }));
  f.color.addEventListener('input', drawPreview);
  f.name.addEventListener('input', drawPreview);
  drawPreview();
  const save = async () => {
    const body = { name: f.name.value.trim(), nameEn: f.nameEn.value.trim(), color: f.color.value, priority: Number(f.priority.value), description: f.description.value.trim(), descriptionEn: f.descriptionEn.value.trim(), enabled: f.enabled.checked };
    const done = isNew ? await guard(() => api('POST', '/v1/admin/ranks', { id: f.id.value.trim().toLowerCase(), ...body }))
      : await guard(() => api('POST', `/v1/admin/ranks/${encodeURIComponent(r.id)}`, body));
    if (done) { toast(isNew ? 'Dodano rangę.' : 'Zapisano rangę.'); ranksPage(); }
  };
  const file = el('input', { type: 'file', accept: 'image/png', class: 'hidden' });
  file.addEventListener('change', async () => {
    const picked = file.files?.[0];
    if (picked && await guard(() => uploadIcon(r.id, picked))) { toast('Ikona zapisana.'); ranksPage(); }
  });
  const iconTools = isNew ? '' : el('div', { class: 'row' },
    el('span', { class: 'small muted', textContent: 'Ikona:' }), rankBadge({ color: r.color, icon: r.iconUrl }),
    el('button', { onclick: () => file.click() }, icon('fa-solid fa-upload'), r.iconUrl ? 'Zmień (PNG 16/32 px)' : 'Wgraj (PNG 16/32 px)'), file,
    r.iconUrl ? el('button', { onclick: async () => {
      if (await guard(() => api('DELETE', `/v1/admin/ranks/${encodeURIComponent(r.id)}/icon`))) { toast('Ikona usunięta: znowu logo w kolorze rangi.'); ranksPage(); }
    } }, icon('fa-solid fa-eraser'), 'Usuń ikonę') : '');
  const card = el('details', { class: 'glass card sup-tier' },
    el('summary', { class: 'row' }, isNew ? el('b', { class: 'grow', textContent: '+ Nowa ranga' }) : el('span', { class: 'grow row' }, rankChip({ ...r, icon: r.iconUrl }), el('span', { class: 'muted small', textContent: `${r.id} · kolejność ${r.priority}` })),
      isNew ? '' : el('span', { class: 'muted small', textContent: r.auto ? AUTO[r.auto] : `${r.holders} graczy` }),
      isNew || r.enabled ? '' : el('span', { class: 'chip', textContent: 'wyłączona' })),
    el('div', { class: 'sup-grid' },
      field('Id (małe litery, cyfry, _)', f.id), field('Kolor logo przy nicku', f.color), field('Kolejność (wyżej = ważniejsza)', f.priority),
      field('Nazwa', f.name), field('Nazwa po angielsku', f.nameEn), field('Podgląd', preview)),
    el('div', { class: 'sup-grid two' }, field('Opis', f.description), field('Opis po angielsku', f.descriptionEn)),
    iconTools,
    el('div', { class: 'row' }, el('label', { class: 'row small' }, el('span', { class: 'switch' }, f.enabled, el('span')), 'Włączona (wyłączona nie pokazuje się nigdzie i nie daje kosmetyków)')),
    el('div', { class: 'row' }, el('button', { class: 'primary', onclick: save }, icon('fa-solid fa-check'), isNew ? 'Dodaj' : 'Zapisz'),
      isNew || r.builtin ? '' : el('button', { class: 'danger', onclick: async () => {
        if (!confirm(`Usunąć rangę ${r.name}? ${r.holders} graczy ją straci.`)) return;
        if (await guard(() => api('DELETE', `/v1/admin/ranks/${encodeURIComponent(r.id)}`))) { toast('Usunięto.'); ranksPage(); }
      } }, icon('fa-solid fa-trash-can'), 'Usuń'),
      r.builtin ? el('span', { class: 'muted small', textContent: 'Wbudowanej rangi nie da się usunąć, można ją wyłączyć.' }) : ''));
  card.style.setProperty('--tier', r.color);
  return card;
}

/** The drawer's section: what the player holds and shows, giving (until a day or for good) and taking back. */
export function userRanksSection(userId, changed) {
  const box = el('div', {}, el('h4', { textContent: 'Rangi' }), el('p', { class: 'muted small', textContent: 'Ładowanie…' }));
  const draw = async (res) => {
    if (!defs.length) await loadDefs();
    const byId = Object.fromEntries(defs.map((d) => [d.id, { ...d, icon: d.iconUrl }]));
    const held = Object.fromEntries(res.held.map((h) => [h.id, h]));
    const rows = res.grants.map((g) => el('div', { class: `rank-grant${g.expired ? ' expired' : ''}` },
      byId[g.rank] ? rankChip(byId[g.rank]) : el('span', { class: 'chip', textContent: g.rank }),
      el('span', { class: 'muted grow', textContent: [SOURCES[g.source] ?? g.source, g.grantedByHandle ? `przez @${g.grantedByHandle}` : '', fmtDate(g.grantedAt),
        g.expiresAt ? `${g.expired ? 'wygasła' : 'do'} ${fmtDate(g.expiresAt)}` : 'na zawsze'].filter(Boolean).join(' · ') }),
      el('button', { class: 'icon-btn', title: 'Odbierz', onclick: async () => {
        if (!confirm(`Odebrać rangę ${byId[g.rank]?.name ?? g.rank}?`)) return;
        const r = await guard(() => api('DELETE', `/v1/admin/users/${userId}/ranks/${encodeURIComponent(g.rank)}`));
        if (r) { toast('Ranga odebrana.'); draw(r); changed?.(); }
      } }, icon('fa-solid fa-xmark'))));
    // the automatic ones (admin role, supporters) are listed, not given
    const auto = res.held.filter((h) => h.source === 'role' || h.source === 'payment').map((h) => el('div', { class: 'rank-grant' }, rankChip(h), el('span', { class: 'muted', textContent: SOURCES[h.source] })));
    const pick = el('select', {}, ...defs.filter((d) => !d.auto).map((d) => el('option', { value: d.id, textContent: `${d.name} (${d.id})${d.enabled ? '' : ' – wyłączona'}`, disabled: !!held[d.id] })));
    const until = el('input', { type: 'date', title: 'Do kiedy (puste: na zawsze)' });
    const give = el('button', { class: 'primary', onclick: async () => {
      const expiresAt = until.value ? new Date(`${until.value}T23:59:59`).getTime() : null;
      const r = await guard(() => api('POST', `/v1/admin/users/${userId}/ranks`, { rank: pick.value, expiresAt }));
      if (r) { toast('Ranga nadana.'); draw(r); changed?.(); }
    } }, icon('fa-solid fa-plus'), 'Nadaj');
    const shown = res.shown ? byId[res.shown] ?? held[res.shown] : undefined;
    box.replaceChildren(el('h4', { textContent: 'Rangi' }),
      el('p', { class: 'muted small', textContent: 'Gracz może mieć kilka rang; przy nicku jest odznaka tej, którą wybierze (domyślnie najważniejszej).' }),
      el('div', { class: 'rank-grants' }, ...auto, ...rows, !rows.length && !auto.length ? el('span', { class: 'muted small', textContent: 'Brak rang.' }) : ''),
      el('p', { class: 'small' }, 'Przy nicku: ', shown ? rankChip(shown) : el('span', { class: 'muted', textContent: res.choice === 'none' ? 'nic (gracz wyłączył)' : 'nic' }),
        res.choice && res.choice !== 'none' ? el('span', { class: 'muted', textContent: ' (wybór gracza)' }) : ''),
      el('div', { class: 'row' }, pick, until, give));
  };
  guard(() => api('GET', `/v1/admin/users/${userId}/ranks`)).then((res) => res && draw(res));
  return box;
}

/** The list's chips: the ranks a player holds (ids from the list), in their colours. */
export function rankChips(ids) {
  return (ids ?? []).filter((id) => id !== 'admin').map((id) => {
    const d = defs.find((x) => x.id === id);
    return d ? rankChip({ ...d, icon: d.iconUrl }) : el('span', { class: 'chip', textContent: id });
  });
}

/** For the list: the definitions once (the chips need their colours). */
export const ranksReady = () => (defs.length ? Promise.resolve() : loadDefs());
