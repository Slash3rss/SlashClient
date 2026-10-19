import { t } from '../shared/i18n';

/**
 * Parties in the Friends view: one invite to several friends at once. Each of them gets the usual
 * "join me" invite (with the party's id); this box shows the parties the player is in, who
 * accepted, and lets the leader disband. The server keeps a party for 3 hours.
 */

export type MemberStatus = 'invited' | 'accepted' | 'declined' | 'left';
interface PartyPerson { id: string; handle: string; name: string; avatar: string }
export interface Party {
  id: string; leader: PartyPerson; server: string; version?: string; createdAt: number; expiresAt: number; disbanded?: boolean;
  members: (PartyPerson & { status: MemberStatus })[];
}

export const PARTY_SIZE = 8;

interface PartyDeps {
  api: { socialApi: (method: string, path: string, body?: unknown) => Promise<any> };
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  me: () => string | undefined;
  /** Friends who can be invited (online first is nicer, but any friend may come later). */
  friends: () => { id: string; name: string; online: boolean }[];
  inviteTarget: () => Promise<{ server: string; version?: string } | undefined>;
  join: (address: string, version?: string) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const icon = (name: string) => el('i', { className: `fa-solid ${name}` });

const STATUS_ICON: Record<MemberStatus, string> = { accepted: 'fa-circle-check', invited: 'fa-hourglass-half', declined: 'fa-circle-xmark', left: 'fa-person-walking-arrow-right' };
export const statusText = (s: MemberStatus) => ({ accepted: t('jest w drużynie'), invited: t('zaproszony'), declined: t('odmówił'), left: t('odszedł') })[s];

/** Applies one `party` event to the list: a disbanded or expired party goes away, the rest is replaced or added. */
export function applyPartyEvent(list: Party[], party: Party, now = Date.now()): Party[] {
  const rest = list.filter((p) => p.id !== party.id && p.expiresAt > now);
  return party.disbanded || party.expiresAt <= now ? rest : [party, ...rest];
}

export function createParty(deps: PartyDeps) {
  let parties: Party[] = [];
  let picking = false;
  const box = el('div', { className: 'fr-party' });

  async function refresh() {
    try {
      parties = (await deps.api.socialApi('GET', '/v1/parties')).parties ?? [];
    } catch {
      // an older server has no parties: nothing to show
      parties = [];
    }
    render();
  }

  /** "I'm in": said before joining a party's server (from an invite card, a toast or this box). */
  async function accept(id: string) {
    try {
      const { party } = await deps.api.socialApi('POST', `/v1/parties/${id}/accept`);
      parties = applyPartyEvent(parties, party);
      render();
    } catch {
      // the party is over (or the server is older): the invite still works as a plain one
    }
  }

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    }
    await refresh();
  }

  /** The friends to pick and the server, filled in with where the player is or played last. */
  async function openPicker() {
    picking = true;
    render();
    const target = await deps.inviteTarget().catch(() => undefined);
    const friends = deps.friends();
    const checks = friends.map((f) => {
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', value: f.id });
      return { f, box };
    });
    const address = Object.assign(document.createElement('input'), { placeholder: t('Adres serwera, np. skyup.pl'), value: target?.server ?? '', maxLength: 253 });
    const counter = el('small', { className: 'muted' });
    const update = () => {
      const n = checks.filter((c) => c.box.checked).length;
      counter.textContent = t('{0} z {1}', n, PARTY_SIZE - 1);
      for (const c of checks) c.box.disabled = !c.box.checked && n >= PARTY_SIZE - 1;
    };
    checks.forEach((c) => c.box.addEventListener('change', update));
    update();
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    cancel.addEventListener('click', () => {
      picking = false;
      render();
    });
    const go = el('button', { type: 'submit', className: 'primary' }, icon('fa-paper-plane'), t(' Zaproś drużynę'));
    const form = el('form', { className: 'fr-party-form' },
      el('div', { className: 'fr-invite-title' }, icon('fa-people-group'), el('span', { textContent: t('Zaproś kilku znajomych naraz') })),
      el('div', { className: 'fr-party-pick' }, ...(checks.length ? checks.map(({ f, box }) => el('label', { className: f.online ? '' : 'is-offline' }, box, f.name))
        : [el('small', { className: 'muted', textContent: t('Nie masz jeszcze znajomych.') })])),
      counter, address, el('div', { className: 'row' }, cancel, go));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const members = checks.filter((c) => c.box.checked).map((c) => c.f.id);
      const server = address.value.trim().toLowerCase();
      if (!members.length) return deps.toast(t('Wybierz przynajmniej jednego znajomego.'), true);
      if (!/^[\w.-]{1,253}(:\d{1,5})?$/.test(server)) return deps.toast(t('To nie wygląda na adres serwera.'), true);
      go.disabled = true;
      try {
        const { party } = await deps.api.socialApi('POST', '/v1/parties', { members, server, version: server === target?.server ? target?.version : undefined });
        parties = applyPartyEvent(parties.filter((p) => p.leader.id !== deps.me()), party);
        picking = false;
        deps.toast(t('Wysłano zaproszenie do drużyny ({0}).', members.length));
        render();
      } catch (err) {
        deps.toast(deps.errorText(err), true);
        go.disabled = false;
      }
    });
    box.replaceChildren(form);
    box.classList.remove('hidden');
    address.focus();
  }

  function card(p: Party): HTMLElement {
    const me = deps.me();
    const mine = p.leader.id === me;
    const myStatus = p.members.find((m) => m.id === me)?.status;
    const accepted = p.members.filter((m) => m.status === 'accepted').length;
    const actions: Node[] = [];
    if (mine) {
      const disband = el('button', { type: 'button', className: 'danger' }, icon('fa-xmark'), t(' Rozwiąż'));
      disband.addEventListener('click', () => act(() => deps.api.socialApi('DELETE', `/v1/parties/${p.id}`)));
      actions.push(disband);
    } else {
      if (myStatus !== 'accepted') {
        const join = el('button', { type: 'button', className: 'primary' }, icon('fa-right-to-bracket'), t(' Dołącz'));
        join.addEventListener('click', () => {
          void accept(p.id);
          deps.join(p.server, p.version);
        });
        actions.push(join);
      }
      if (myStatus === 'invited') {
        const decline = el('button', { type: 'button' }, t('Odrzuć'));
        decline.addEventListener('click', () => act(() => deps.api.socialApi('POST', `/v1/parties/${p.id}/decline`)));
        actions.push(decline);
      } else if (myStatus === 'accepted') {
        const leave = el('button', { type: 'button' }, t('Opuść'));
        leave.addEventListener('click', () => act(() => deps.api.socialApi('POST', `/v1/parties/${p.id}/leave`)));
        actions.push(leave);
      }
    }
    return el('div', { className: 'fr-party-card' },
      el('div', { className: 'fr-party-head' }, icon('fa-people-group'),
        el('div', { className: 'grow' },
          el('b', { textContent: mine ? t('Twoja drużyna') : t('Drużyna {0}', p.leader.name) }),
          el('small', { className: 'muted', textContent: `${[p.server, p.version].filter(Boolean).join(' · ')} · ${t('{0}/{1} w drużynie', accepted, p.members.length)}` }))),
      el('div', { className: 'fr-party-members' }, ...p.members.map((m) =>
        el('span', { className: `fr-chip fr-party-${m.status}`, title: statusText(m.status) }, icon(STATUS_ICON[m.status]), m.id === p.leader.id ? `${m.name} ★` : m.name))),
      actions.length ? el('div', { className: 'row' }, ...actions) : '');
  }

  function render() {
    if (picking) return;
    parties = parties.filter((p) => p.expiresAt > Date.now());
    box.replaceChildren(...parties.map(card));
    box.classList.toggle('hidden', !parties.length);
  }

  return {
    element: box,
    refresh,
    accept,
    open: () => void openPicker(),
    /** A `party` event from the server. */
    onEvent(party: Party) {
      parties = applyPartyEvent(parties, party);
      render();
    },
  };
}
