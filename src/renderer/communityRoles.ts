import { locale, t } from '../shared/i18n';
import { confirmDialog, control, el, icon, modalWindow } from './dialog';

/**
 * A community's own channels, custom roles and the moderation log in the Friends view (server
 * 0.9.30+; the rules are the server's communityRoles.ts, which checks everything again).
 *
 * Custom roles ("VIP", "Pomocnik"…) have a name, a colour and permissions, and are ordered: a member
 * has their built-in role (owner, admin, moderator, member) and at most one custom role on top of
 * it. Power is the built-in role first, then the custom role's place: higher ones manage lower ones.
 * Own channels (#handel, #pvp…) say who reads and who writes them: from a built-in role up, and
 * custom roles let in besides. An older server sends none of it, and nothing of it is offered.
 */

export type BaseRole = 'owner' | 'admin' | 'moderator' | 'member';
const RANK: Record<BaseRole, number> = { owner: 3, admin: 2, moderator: 1, member: 0 };

/** What shows by a nick. */
export interface RoleTag { id: string; name: string; color: string }
/** A custom role as the community's list has it (the highest first). */
export interface CustomRole extends RoleTag { position: number; permissions: string[]; members?: number; manage?: boolean }
/** Who reads and writes a channel (absent on an older server: everyone reads, `canPost` says the rest). */
export interface ChannelAccess { readRole?: BaseRole; postRole?: BaseRole; readRoles?: string[]; writeRoles?: string[] }

/** What a custom role may be given, in the server's order. */
export const ROLE_PERMISSIONS = ['postReadOnly', 'pin', 'deleteMessage', 'mute', 'kick', 'ban', 'invite', 'requests', 'reports', 'log', 'slowMode', 'manageChannels', 'manageRoles'] as const;
/** The lowest built-in role that has each without a custom role (the server's BASE). */
const BASE: Record<string, BaseRole> = {
  postReadOnly: 'admin', pin: 'moderator', deleteMessage: 'moderator', mute: 'moderator', kick: 'moderator', ban: 'admin', invite: 'moderator',
  requests: 'moderator', reports: 'moderator', log: 'moderator', slowMode: 'admin', manageChannels: 'admin', manageRoles: 'admin',
};

export const permissionText = (p: string) => ({
  postReadOnly: t('Pisanie w kanałach tylko do odczytu'), pin: t('Przypinanie wiadomości'), deleteMessage: t('Usuwanie wiadomości'), mute: t('Wyciszanie (timeout)'),
  kick: t('Wyrzucanie'), ban: t('Banowanie'), invite: t('Zapraszanie'), requests: t('Przyjmowanie próśb'), reports: t('Zgłoszenia'), log: t('Dziennik moderacji'),
  slowMode: t('Tryb powolny'), manageChannels: t('Zarządzanie kanałami'), manageRoles: t('Zarządzanie rolami'),
}[p] ?? p);

/** The member side of a community these rules need. */
export interface RoleHolder { role: BaseRole; customRole?: RoleTag; roles?: CustomRole[]; permissions?: Record<string, boolean> }

const positionOf = (roles: CustomRole[] | undefined, tag: { id: string } | undefined) => (tag ? roles?.find((r) => r.id === tag.id)?.position ?? 0 : 0);
/** Built-in role first, then the custom role's place. */
export const rolePower = (role: BaseRole, position = 0) => RANK[role] * 1000 + position;

/**
 * Whether I may do it in this community (to that member, who must be below me): the server's
 * `permissions` (with my custom role's), else what my built-in role has.
 */
export function communityCan(c: RoleHolder, perm: string, target?: { role?: BaseRole; customRole?: { id: string } }): boolean {
  const has = c.permissions?.[perm] ?? (BASE[perm] ? RANK[c.role] >= RANK[BASE[perm]] : false);
  if (!has) return false;
  if (!target) return true;
  return rolePower(c.role, positionOf(c.roles, c.customRole)) > rolePower(target.role ?? 'member', positionOf(c.roles, target.customRole));
}

/** Whether I may change, delete, give or take this custom role: admins any, others only those below their own. */
export function mayManageRole(c: RoleHolder, r: Pick<CustomRole, 'position'>): boolean {
  if (!communityCan(c, 'manageRoles')) return false;
  return RANK[c.role] >= RANK.admin || r.position < positionOf(c.roles, c.customRole);
}

/** A channel not everyone reads (a lock by its name). */
export const channelClosed = (ch: ChannelAccess) => (!!ch.readRole && ch.readRole !== 'member') || !!ch.readRoles?.length;

/** "Handel ludzi" → "handel-ludzi", as the server will keep it (2–24 letters, digits, - and _). */
export function channelSlug(raw: string): string {
  return raw.normalize('NFC').trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 24);
}

/** A custom role's name in its colour, by a nick. */
export function roleChip(tag: RoleTag): HTMLElement {
  const chip = el('span', { className: 'fr-com-custom-role', textContent: tag.name, title: t('Rola: {0}', tag.name) });
  chip.style.setProperty('--role-color', /^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : '#94a3b8');
  return chip;
}

/** Who a channel's read or write starts from, in words. */
const fromText = (r: BaseRole | undefined) => (r === 'admin' || r === 'owner' ? t('administratorzy') : r === 'moderator' ? t('moderatorzy i wyżej') : t('wszyscy'));
/** "Czytają: wszyscy · Piszą: administratorzy + VIP" */
export function accessText(ch: ChannelAccess, roles: CustomRole[] = []): string {
  const extra = (ids?: string[]) => (ids ?? []).map((id) => roles.find((r) => r.id === id)?.name).filter(Boolean).map((n) => ` + ${n}`).join('');
  return t('Czytają: {0} · Piszą: {1}', fromText(ch.readRole) + extra(ch.readRoles), fromText(ch.postRole) + extra(ch.writeRoles));
}

/** The moderation log's kinds (the server's LOG_GROUPS). */
export const LOG_GROUPS = ['moderation', 'roles', 'settings', 'members'] as const;
const groupText = (g: string) => ({ '': t('Wszystko'), moderation: t('Moderacja'), roles: t('Role'), settings: t('Ustawienia i kanały'), members: t('Członkowie') })[g] ?? g;

/** What someone did, as the log says it ("Ala wyrzuca Bartka"). */
export const logActionText = (action: string) => ({
  create: t('zakłada społeczność'), join: t('dołącza'), accept: t('przyjmuje prośbę'), decline: t('odrzuca prośbę'), leave: t('odchodzi'), kick: t('wyrzuca'),
  ban: t('banuje'), unban: t('zdejmuje bana'), mute: t('wycisza'), unmute: t('zdejmuje wyciszenie'), role: t('zmienia rolę'), transfer: t('przekazuje społeczność'),
  invite: t('zaprasza'), edit: t('zmienia ustawienia'), logo: t('zmienia logo'), logo_remove: t('usuwa logo'), heir: t('przejmuje społeczność'),
  message_delete: t('usuwa wiadomość'), report_delete: t('usuwa zgłoszoną wiadomość'), report_dismiss: t('odrzuca zgłoszenie'),
  pin: t('przypina wiadomość od'), unpin: t('odpina wiadomość od'), slowmode: t('zmienia tryb powolny'),
  channel_create: t('tworzy kanał'), channel_edit: t('zmienia kanał'), channel_delete: t('usuwa kanał'), channel_order: t('zmienia kolejność kanałów'),
  role_create: t('tworzy rolę'), role_edit: t('zmienia rolę'), role_delete: t('usuwa rolę'), role_order: t('zmienia kolejność ról'), member_role: t('nadaje rolę'),
})[action];

interface Community extends RoleHolder { id: string; name: string; channels: (ChannelAccess & { id: string; kind: string; name: string })[] }
export interface ManageDeps {
  api: { socialApi: (method: string, path: string, body?: unknown) => Promise<any> };
  act: <T>(fn: () => Promise<T>, done?: string) => Promise<T | undefined>;
  /** The list again (after a change), and the community as it is now. */
  refresh: () => Promise<void>;
  community: (id: string) => Community | undefined;
  channelName: (ch: { kind: string; name: string }) => string;
}

/** Up and down by a row, a click moving it in `ids`; undefined when it cannot move that way. */
function moved(ids: string[], i: number, by: number): string[] | undefined {
  const j = i + by;
  if (j < 0 || j >= ids.length) return undefined;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const arrow = (name: string, title: string, run: (() => void) | undefined) => {
  const b = el('button', { type: 'button', className: 'icon-btn', title, disabled: !run }, icon(name));
  if (run) b.addEventListener('click', run);
  return b;
};

/** Checkboxes of the community's custom roles (for a channel's access). */
function roleChecks(roles: CustomRole[], picked: string[]) {
  const boxes = roles.map((r) => {
    const box = control<HTMLInputElement>('input', { type: 'checkbox', checked: picked.includes(r.id) });
    return { r, box, node: el('label', { className: 'fr-com-check' }, box, roleChip(r)) };
  });
  return { node: el('div', { className: 'fr-com-checks' }, ...boxes.map((b) => b.node)), value: () => boxes.filter((b) => b.box.checked).map((b) => b.r.id) };
}

function baseSelect(value: BaseRole | undefined, everyone: string) {
  const s = control<HTMLSelectElement>('select', {});
  s.append(el('option', { value: 'member', textContent: everyone }), el('option', { value: 'moderator', textContent: t('Moderatorzy i wyżej') }), el('option', { value: 'admin', textContent: t('Tylko administratorzy') }));
  s.value = value === 'owner' ? 'admin' : value ?? 'member';
  return s;
}

/** The channels: order, who reads and writes, rename, delete; a new one (admins, or `manageChannels`). */
export function channelsWindow(d: ManageDeps, c: Community) {
  const rows = el('div', { className: 'fr-clan-members fr-com-manage' }, el('div', { className: 'fr-placeholder' }, el('span', { className: 'spinner' })));
  const counter = el('p', { className: 'muted' });
  const add = el('button', { type: 'button', className: 'primary' }, icon('fa-plus'), t(' Nowy kanał'));
  let roles: CustomRole[] = [];
  let limit = 20;
  let channels: (ChannelAccess & { id: string; kind: string; name: string })[] = [];
  const load = async () => {
    const res = await d.act(() => d.api.socialApi('GET', `/v1/communities/${c.id}/channels`));
    if (!res) return;
    ({ channels, roles, limit } = res);
    counter.textContent = t('Kanały: {0} z {1}. Administratorzy czytają i piszą wszędzie.', channels.length, limit);
    add.disabled = channels.length >= limit;
    const ids = channels.map((ch) => ch.id);
    rows.replaceChildren(...channels.map((ch, i) => {
      const order = async (next?: string[]) => {
        if (next && (await d.act(() => d.api.socialApi('POST', `/v1/communities/${c.id}/channels/order`, { order: next })))) {
          await d.refresh();
          void load();
        }
      };
      const up = moved(ids, i, -1), down = moved(ids, i, 1);
      const edit = el('button', { type: 'button', className: 'icon-btn', title: t('Zmień kanał') }, icon('fa-pen'));
      edit.addEventListener('click', () => editor(ch));
      const buttons: Node[] = [arrow('fa-arrow-up', t('Wyżej'), up && (() => void order(up))), arrow('fa-arrow-down', t('Niżej'), down && (() => void order(down))), edit];
      if (ch.kind === 'custom') {
        const remove = el('button', { type: 'button', className: 'icon-btn danger', title: t('Usuń kanał') }, icon('fa-trash'));
        remove.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: t('Usunąć kanał #{0}?', ch.name), body: [el('p', { className: 'muted', textContent: t('Kanał i wszystkie jego wiadomości znikną dla wszystkich. Tego nie da się cofnąć.') })], ok: t('Usuń'), danger: true }))) return;
          if (await d.act(() => d.api.socialApi('DELETE', `/v1/communities/${c.id}/channels/${ch.id}`), t('Usunięto kanał.'))) {
            await d.refresh();
            void load();
          }
        });
        buttons.push(remove);
      }
      return el('div', { className: 'fr-row' }, el('div', { className: 'fr-com-channel-icon' }, icon(ch.kind === 'announcements' ? 'fa-bullhorn' : channelClosed(ch) ? 'fa-lock' : 'fa-hashtag')),
        el('div', { className: 'grow fr-names' }, el('b', { textContent: d.channelName(ch) }), el('small', { className: 'muted', textContent: accessText(ch, roles) })), ...buttons);
    }));
  };

  /** A channel's name and who reads and writes it; a new one when `ch` is not given. */
  function editor(ch?: ChannelAccess & { id: string; kind: string; name: string }) {
    const builtIn = !!ch && ch.kind !== 'custom';
    const name = control<HTMLInputElement>('input', { placeholder: t('nazwa-kanału, np. handel'), value: ch?.name ?? '', maxLength: 30, disabled: builtIn });
    const preview = el('small', { className: 'muted' });
    const update = () => (preview.textContent = builtIn ? t('Wbudowanego kanału nie można przemianować ani ukryć.') : name.value.trim() ? t('Będzie widoczny jako #{0}', channelSlug(name.value)) : t('2–24 znaki: litery, cyfry, - i _.'));
    name.addEventListener('input', update);
    update();
    const readRole = baseSelect(ch?.readRole, t('Wszyscy członkowie'));
    readRole.disabled = builtIn;
    const postRole = baseSelect(ch?.postRole ?? 'member', t('Wszyscy, którzy czytają'));
    const reads = roleChecks(roles, ch?.readRoles ?? []);
    const writes = roleChecks(roles, ch?.writeRoles ?? []);
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const save = el('button', { type: 'button', className: 'primary' }, icon('fa-check'), ch ? t(' Zapisz') : t(' Utwórz kanał'));
    const body: Node[] = [el('label', { className: 'fr-com-field' }, el('span', { textContent: t('Nazwa') }), name), preview,
      el('h3', { textContent: t('Kto czyta') }), readRole];
    if (!builtIn && roles.length) body.push(el('small', { className: 'muted', textContent: t('…oraz te role (nawet poniżej wybranej):') }), reads.node);
    body.push(el('h3', { textContent: t('Kto pisze') }), postRole);
    if (roles.length) body.push(el('small', { className: 'muted', textContent: t('…oraz te role (jeśli czytają):') }), writes.node);
    if (!roles.length) body.push(el('small', { className: 'muted', textContent: t('Własne role (np. VIP) dodasz w „Role”, a potem wpuścisz je tutaj.') }));
    const close = modalWindow(ch ? t('Kanał: {0}', d.channelName(ch)) : t('Nowy kanał'), body, [cancel, save], undefined, 'fr-group-modal fr-com-modal');
    cancel.addEventListener('click', close);
    save.addEventListener('click', async () => {
      save.disabled = true;
      const access = { postRole: postRole.value, writeRoles: writes.value(), ...(builtIn ? {} : { name: name.value, readRole: readRole.value, readRoles: reads.value() }) };
      const res = await d.act(() => (ch ? d.api.socialApi('POST', `/v1/communities/${c.id}/channels/${ch.id}`, access) : d.api.socialApi('POST', `/v1/communities/${c.id}/channels`, access)),
        ch ? t('Zapisano kanał.') : t('Utworzono kanał.'));
      save.disabled = false;
      if (!res) return;
      close();
      await d.refresh();
      void load();
    });
    if (!builtIn) name.focus();
  }

  add.addEventListener('click', () => editor());
  modalWindow(t('Kanały: {0}', c.name), [counter, rows, el('div', { className: 'row' }, add)], [], undefined, 'fr-group-modal fr-com-modal');
  void load();
}

/** The custom roles: order, colour, permissions, delete; a new one (admins, or `manageRoles` below one's own). */
export function rolesWindow(d: ManageDeps, c: Community) {
  const rows = el('div', { className: 'fr-clan-members fr-com-manage' }, el('div', { className: 'fr-placeholder' }, el('span', { className: 'spinner' })));
  const counter = el('p', { className: 'muted' });
  const add = el('button', { type: 'button', className: 'primary' }, icon('fa-plus'), t(' Nowa rola'));
  let mine: Record<string, boolean> = {};
  const load = async () => {
    const res = await d.act(() => d.api.socialApi('GET', `/v1/communities/${c.id}/roles`));
    if (!res) return;
    const roles: CustomRole[] = res.roles;
    mine = Object.fromEntries((res.permissions as { id: string; mine: boolean }[]).map((p) => [p.id, p.mine]));
    counter.textContent = t('Role: {0} z {1}. Wyższa rola zarządza niższymi; każda działa tylko na członków poniżej siebie, a moderatorzy i administratorzy są ponad nimi.', roles.length, res.limit);
    add.disabled = !res.manage || roles.length >= res.limit;
    const ids = roles.map((r) => r.id);
    rows.replaceChildren(...roles.map((r, i) => {
      const order = async (next?: string[]) => {
        if (next && (await d.act(() => d.api.socialApi('POST', `/v1/communities/${c.id}/roles/order`, { order: next })))) {
          await d.refresh();
          void load();
        }
      };
      // only among the roles one manages
      const up = r.manage && roles[i - 1]?.manage ? moved(ids, i, -1) : undefined;
      const down = r.manage && roles[i + 1]?.manage ? moved(ids, i, 1) : undefined;
      const buttons: Node[] = [];
      if (r.manage) {
        const edit = el('button', { type: 'button', className: 'icon-btn', title: t('Zmień rolę') }, icon('fa-pen'));
        edit.addEventListener('click', () => editor(r));
        const remove = el('button', { type: 'button', className: 'icon-btn danger', title: t('Usuń rolę') }, icon('fa-trash'));
        remove.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: t('Usunąć rolę {0}?', r.name), body: [el('p', { className: 'muted', textContent: t('Członkowie z tą rolą ({0}) ją stracą, a kanały przestaną ją wpuszczać.', r.members ?? 0) })], ok: t('Usuń'), danger: true }))) return;
          if (await d.act(() => d.api.socialApi('DELETE', `/v1/communities/${c.id}/roles/${r.id}`), t('Usunięto rolę.'))) {
            await d.refresh();
            void load();
          }
        });
        buttons.push(arrow('fa-arrow-up', t('Wyżej'), up && (() => void order(up))), arrow('fa-arrow-down', t('Niżej'), down && (() => void order(down))), edit, remove);
      }
      const perms = r.permissions.length ? r.permissions.map(permissionText).join(', ') : t('bez uprawnień (tylko kolor i nazwa)');
      const dot = el('div', { className: 'fr-com-role-dot' });
      dot.style.background = r.color;
      return el('div', { className: 'fr-row' }, dot,
        el('div', { className: 'grow fr-names' }, el('span', {}, roleChip(r), el('small', { className: 'muted', textContent: ` · ${t('{0} os.', r.members ?? 0)}` })), el('small', { className: 'muted', textContent: perms })), ...buttons);
    }));
    if (!roles.length) rows.replaceChildren(el('p', { className: 'muted fr-empty', textContent: t('Nie ma jeszcze własnych ról. Dodaj np. „VIP” z kolorem i uprawnieniami, potem nadaj ją w „Członkowie”.') }));
  };

  function editor(r?: CustomRole) {
    const name = control<HTMLInputElement>('input', { placeholder: t('Nazwa roli, np. VIP'), value: r?.name ?? '', maxLength: 24 });
    const color = control<HTMLInputElement>('input', { type: 'color', value: r?.color ?? '#22c55e', className: 'fr-com-color' });
    const preview = el('span', {});
    const update = () => preview.replaceChildren(roleChip({ id: '', name: name.value.trim() || t('Rola'), color: color.value }));
    name.addEventListener('input', update);
    color.addEventListener('input', update);
    update();
    // one gives only what one has oneself
    const boxes = ROLE_PERMISSIONS.map((p) => {
      const box = control<HTMLInputElement>('input', { type: 'checkbox', checked: !!r?.permissions.includes(p), disabled: !mine[p] && !r?.permissions.includes(p) });
      return { p, box, node: el('label', { className: 'fr-com-check', title: box.disabled ? t('Sam nie masz tego uprawnienia.') : '' }, box, el('span', { textContent: permissionText(p) })) };
    });
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const save = el('button', { type: 'button', className: 'primary' }, icon('fa-check'), r ? t(' Zapisz') : t(' Utwórz rolę'));
    const close = modalWindow(r ? t('Rola: {0}', r.name) : t('Nowa rola'), [
      el('div', { className: 'row fr-com-role-fields' }, color, name), el('div', { className: 'row' }, el('small', { className: 'muted', textContent: t('Tak wygląda przy nicku:') }), preview),
      el('h3', { textContent: t('Uprawnienia') }), el('div', { className: 'fr-com-checks columns' }, ...boxes.map((b) => b.node)),
      el('small', { className: 'muted', textContent: t('Wyrzucanie, wyciszanie, banowanie i usuwanie działają tylko na członków poniżej tej roli.') }),
    ], [cancel, save], undefined, 'fr-group-modal fr-com-modal');
    cancel.addEventListener('click', close);
    save.addEventListener('click', async () => {
      save.disabled = true;
      const value = { name: name.value.trim(), color: color.value, permissions: boxes.filter((b) => b.box.checked).map((b) => b.p) };
      const res = await d.act(() => (r ? d.api.socialApi('POST', `/v1/communities/${c.id}/roles/${r.id}`, value) : d.api.socialApi('POST', `/v1/communities/${c.id}/roles`, value)),
        r ? t('Zapisano rolę.') : t('Utworzono rolę.'));
      save.disabled = false;
      if (!res) return;
      close();
      await d.refresh();
      void load();
    });
    name.focus();
  }

  add.addEventListener('click', () => editor());
  modalWindow(t('Role: {0}', c.name), [counter, rows, el('div', { className: 'row' }, add)], [], undefined, 'fr-group-modal fr-com-modal');
  void load();
}

export interface LogEntry { id: number; at: number; by: string; byName: string; action: string; target: string; targetName: string; detail: string }

/** The moderation log: the newest first, in pages, by kind (an older server: its newest 100, no filter). */
export function logWindow(d: ManageDeps, c: Community) {
  const rows = el('div', { className: 'fr-clan-members fr-com-log-list' });
  const more = el('button', { type: 'button', className: 'hidden' }, t('Pokaż starsze'));
  const filter = control<HTMLSelectElement>('select', { className: 'fr-com-log-filter' });
  filter.append(...['', ...LOG_GROUPS].map((g) => el('option', { value: g, textContent: groupText(g) })));
  let last: number | undefined;
  const time = new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'short' });
  const row = (e: LogEntry) => el('div', { className: 'fr-com-log' },
    el('small', { className: 'muted', textContent: time.format(e.at) }),
    el('span', {}, el('b', { textContent: e.byName || t('Administracja') }), ` ${logActionText(e.action) ?? t('(administracja) {0}', e.action)} `, el('b', { textContent: e.targetName }), e.detail ? ` (${e.detail})` : ''));
  const load = async (reset: boolean) => {
    if (reset) {
      last = undefined;
      rows.replaceChildren(el('div', { className: 'fr-placeholder' }, el('span', { className: 'spinner' })));
    }
    const q = `limit=50${last ? `&before=${last}` : ''}${filter.value ? `&group=${filter.value}` : ''}`;
    const res = await d.act(() => d.api.socialApi('GET', `/v1/communities/${c.id}/log?${q}`));
    if (!res) return;
    if (reset) rows.replaceChildren();
    const log = res.log as LogEntry[];
    rows.append(...log.map(row));
    last = log.at(-1)?.id ?? last;
    // an older server gives no `more` (and no pages): what came is all
    more.classList.toggle('hidden', !res.more);
    filter.classList.toggle('hidden', !res.groups);
    if (!rows.childElementCount) rows.append(el('p', { className: 'muted fr-empty', textContent: t('Nic tu jeszcze nie ma.') }));
  };
  filter.addEventListener('change', () => void load(true));
  more.addEventListener('click', () => void load(false));
  modalWindow(t('Dziennik moderacji'), [el('div', { className: 'row' }, el('small', { className: 'muted grow', textContent: t('Kto kogo wyrzucił, zbanował, wyciszył, czyje wiadomości usunął i co zmienił. Widzą to moderatorzy i wyżej.') }), filter), rows, more], [], undefined, 'fr-group-modal fr-com-modal');
  void load(true);
}

/** The pick of a member's custom role in the members' window: none, or one I manage (theirs stays if I do not). */
export function customRolePick(c: RoleHolder, member: { role: BaseRole; customRole?: RoleTag }, set: (role: string | null) => void): HTMLSelectElement | undefined {
  const roles = c.roles ?? [];
  if (!roles.length || !communityCan(c, 'manageRoles', member)) return undefined;
  const current = roles.find((r) => r.id === member.customRole?.id);
  if (current && !mayManageRole(c, current)) return undefined;
  const pick = control<HTMLSelectElement>('select', { className: 'fr-role-pick fr-custom-role-pick', title: t('Własna rola') });
  pick.append(el('option', { value: '', textContent: t('— bez roli —') }), ...roles.filter((r) => mayManageRole(c, r)).map((r) => el('option', { value: r.id, textContent: r.name })));
  pick.value = current?.id ?? '';
  pick.addEventListener('change', () => set(pick.value || null));
  return pick;
}
