import { locale, t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * Editing and deleting chat messages in the Friends view (server 0.9.23+), shared by direct and
 * group chats: who may do what (the server checks it again), the small menu by a bubble, the
 * "(edited)" label and the tombstone of a deleted message.
 *
 * The server says how long a message may be edited (`editWindowMs` with the history) and, in a
 * group, whose messages this player may delete (`moderator`); an older server says neither, and
 * then nothing here is offered.
 */

export interface ChatLine {
  id: number; from: string; at: number; text: string;
  editedAt?: number; deleted?: boolean; unreadable?: boolean;
  invite?: unknown; waypoint?: unknown; image?: unknown; event?: unknown;
  /** The picture was taken down or ran out (server 0.9.36+): the message stays, not editable. */
  imageRemoved?: unknown;
}
/** Whose messages a group member may delete besides their own: everyone's, or plain members' (a clan officer). */
export type Moderator = 'all' | 'members';

/** Text only, one's own, not taken back, and still within the window. */
export function canEdit(m: ChatLine, me: string | undefined, windowMs: number | undefined, now = Date.now()): boolean {
  return !!me && !!windowMs && m.from === me && !m.deleted && !m.unreadable && !m.invite && !m.waypoint && !m.image && !m.imageRemoved && !m.event && now - m.at < windowMs;
}

/** One's own any time; in a group also others' for its moderators (an officer: not the owner's or other officers'). */
export function canDelete(m: ChatLine, me: string | undefined, windowMs: number | undefined, moderator?: Moderator, authorRole?: string): boolean {
  // an older server (no window given) cannot delete either
  if (!me || !windowMs || m.deleted || m.event) return false;
  if (m.from === me) return true;
  return moderator === 'all' || (moderator === 'members' && (authorRole === undefined || authorRole === 'member'));
}

/** The list with one message replaced by its new version (edited or deleted); unknown ones are left out. */
export function replaceMessage<T extends ChatLine>(list: T[], next: T): T[] {
  return list.map((m) => {
    if (m.id !== next.id) return m;
    // the server's edit does not repeat the picture's key; a deleted message has none any more
    return { ...next, ...(!next.deleted && m.image && !next.image && !next.imageRemoved ? { image: m.image } : {}) };
  });
}

/** Seconds to wait from a "slow_down:5" code (the launcher's main process puts them there), or undefined. */
export function slowDownSeconds(code: string): number | undefined {
  const m = /^slow_down(?::(\d+))?$/.exec(code);
  return m ? Math.max(1, Number(m[1] ?? 5)) : undefined;
}

/** "Zwolnij trochę — możesz pisać za 5 s." */
export const slowDownText = (seconds: number) => t('Zwolnij trochę — możesz pisać za {0} s.', seconds);

/** The muted line in place of a deleted message. */
export function tombstone(): HTMLElement {
  return el('div', { className: 'fr-bubble deleted' }, icon('fa-ban'), el('span', { textContent: t('Wiadomość usunięta') }));
}

/** "(edytowano)" after the text, with when in the tooltip. */
export function editedLabel(editedAt: number): HTMLElement {
  return el('span', { className: 'fr-edited', textContent: t('(edytowano)'), title: t('Edytowano {0}', new Date(editedAt).toLocaleString(locale())) });
}

export interface MenuItem { label: string; icon: string; danger?: boolean; hint?: string; run: () => void }

/**
 * The small "…" button by a bubble (shown on hover) and its menu; nothing when there is nothing to do.
 * The bubble and the button share a row, the button towards the middle of the chat.
 */
export function withMenu(bubble: HTMLElement, items: MenuItem[]): HTMLElement {
  if (!items.length) return bubble;
  const btn = el('button', { type: 'button', className: 'icon-btn fr-msg-menu', title: t('Więcej') }, icon('fa-ellipsis'));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu(btn, items);
  });
  return el('div', { className: 'fr-line' }, bubble, btn);
}

let openOne: (() => void) | undefined;

export function openMenu(anchor: HTMLElement, items: MenuItem[]) {
  openOne?.();
  const menu = el('div', { className: 'fr-menu glass-panel', role: 'menu' });
  for (const item of items) {
    const b = el('button', { type: 'button', className: `fr-menu-item${item.danger ? ' danger' : ''}`, role: 'menuitem' }, icon(item.icon), el('span', { textContent: item.label }));
    if (item.hint) b.append(el('small', { className: 'muted', textContent: item.hint }));
    b.addEventListener('click', () => {
      close();
      item.run();
    });
    menu.append(b);
  }
  const close = () => {
    menu.remove();
    removeEventListener('mousedown', outside, true);
    removeEventListener('keydown', onKey, true);
    if (openOne === close) openOne = undefined;
  };
  const outside = (e: MouseEvent) => !menu.contains(e.target as Node) && close();
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  document.body.append(menu);
  // by the button, kept inside the window
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  menu.style.top = `${r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
  addEventListener('mousedown', outside, true);
  addEventListener('keydown', onKey, true);
  openOne = close;
  (menu.querySelector('button') as HTMLButtonElement | null)?.focus();
}

/** Minutes left to edit, for the menu ("jeszcze 12 min"). */
export function editHint(m: ChatLine, windowMs: number, now = Date.now()): string {
  return t('jeszcze {0} min', Math.max(1, Math.ceil((windowMs - (now - m.at)) / 60_000)));
}
