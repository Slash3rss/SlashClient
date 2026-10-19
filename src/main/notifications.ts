/**
 * System notifications (a Windows toast, macOS Notification Center, a Linux desktop notification)
 * that bring the launcher back when clicked: the window comes to the front and, for a friend's
 * message, invite or request, the page opens Friends and that chat.
 */

/** Must match build.appId in package.json: Windows sends toast clicks back to the app with this id. */
export const APP_USER_MODEL_ID = 'dev.slash3rss.slashclient';

/** Where a click on the notification takes the player: Friends, and that friend's chat when there is one; or Achievements. */
export type NoticeTarget = { view: 'friends'; friendId?: string } | { view: 'achievements' };

export interface Notice { title: string; body: string; target?: NoticeTarget }

/** The part of Electron's Notification this needs (a stand-in in tests). */
export interface SystemNotification {
  on(event: 'click' | 'close' | 'failed', listener: () => void): unknown;
  show(): void;
}

export interface NotifierDeps {
  supported: () => boolean;
  create: (title: string, body: string) => SystemNotification;
  /** Restores (unminimizes) and focuses the launcher window. */
  focus: () => void;
  /** Tells the page where to go. */
  open: (target: NoticeTarget) => void;
}

/** How many shown notifications stay referenced (a click from the Action Center still needs its object). */
const KEPT = 20;

/** A notification body that fits a toast. */
export function shortBody(text: string, max = 120): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** A friend id the page may be sent to; anything else only opens Friends. */
export function cleanTarget(target: unknown): NoticeTarget | undefined {
  if (target && typeof target === 'object' && (target as NoticeTarget).view === 'achievements') return { view: 'achievements' };
  if (!target || typeof target !== 'object' || (target as NoticeTarget).view !== 'friends') return undefined;
  const id = (target as { friendId?: unknown }).friendId;
  return typeof id === 'string' && /^[\w-]{1,64}$/.test(id) ? { view: 'friends', friendId: id } : { view: 'friends' };
}

export class Notifier {
  /**
   * Shown notifications, kept so they aren't garbage-collected before the click: Electron drops
   * the click handler together with an object nothing references any more.
   */
  private readonly live = new Set<SystemNotification>();

  constructor(private readonly deps: NotifierDeps) {}

  show(notice: Notice): boolean {
    if (!this.deps.supported()) return false;
    const n = this.deps.create(notice.title, shortBody(notice.body));
    const target = notice.target;
    n.on('click', () => {
      this.live.delete(n);
      this.deps.focus();
      if (target) this.deps.open(target);
    });
    n.on('failed', () => this.live.delete(n));
    this.live.add(n);
    // the oldest one goes first
    for (const old of this.live) {
      if (this.live.size <= KEPT) break;
      this.live.delete(old);
    }
    n.show();
    return true;
  }

  /** How many notifications are still kept (for tests). */
  get kept() {
    return this.live.size;
  }
}
