/**
 * "A friend started playing": from the stream of statuses, the moments worth a toast. A friend
 * coming online, or starting a game (a world or a server); not a launcher reconnecting after the
 * network dropped for a moment, not someone hopping between servers, and not the same friend
 * over and over (each kind of news at most once in a while).
 */

export interface WatchedPresence { status: string; activity?: { kind: string; server?: string } }

export type PlayingNews = { kind: 'online' } | { kind: 'playing'; server?: string };

/** Offline (or not in a game) shorter than this is a reconnect, not news. */
export const RECONNECT_MS = 3 * 60_000;
/** The same news about one friend at most this often. */
export const COOLDOWN_MS = 10 * 60_000;

interface Seen { online: boolean; playing: boolean; lastOnline: number; lastPlaying: number; told: Record<PlayingNews['kind'], number> }

const isPlaying = (p: WatchedPresence) => p.status !== 'offline' && (p.activity?.kind === 'singleplayer' || p.activity?.kind === 'server');

export class PlayingWatch {
  private readonly seen = new Map<string, Seen>();

  /**
   * The friend's status as it is now, with nothing to say: the friends list loaded (or loaded
   * again), so whoever is already online or playing is not news.
   */
  know(id: string, p: WatchedPresence, now = Date.now()) {
    const online = p.status !== 'offline';
    const playing = isPlaying(p);
    const s = this.seen.get(id);
    this.seen.set(id, {
      online, playing,
      lastOnline: online ? now : s?.lastOnline ?? 0,
      lastPlaying: playing ? now : s?.lastPlaying ?? 0,
      told: s?.told ?? { online: 0, playing: 0 },
    });
  }

  /** A status that just came: what to tell the player, if anything. */
  update(id: string, p: WatchedPresence, now = Date.now()): PlayingNews | undefined {
    const s = this.seen.get(id);
    if (!s) {
      // a friend this list did not know (just added): only remembered
      this.know(id, p, now);
      return undefined;
    }
    const online = p.status !== 'offline';
    const playing = isPlaying(p);
    let news: PlayingNews | undefined;
    // starting a game says more than coming online, so a launcher started straight into a game is one toast
    if (playing && !s.playing && now - s.lastPlaying >= RECONNECT_MS && now - s.told.playing >= COOLDOWN_MS) {
      news = { kind: 'playing', server: p.activity?.kind === 'server' ? p.activity.server : undefined };
    } else if (online && !s.online && !playing && now - s.lastOnline >= RECONNECT_MS && now - s.told.online >= COOLDOWN_MS) {
      news = { kind: 'online' };
    }
    if (news) s.told[news.kind] = now;
    // the moment they were last seen online (playing): a drop shorter than RECONNECT_MS counts from here
    if (s.online || online) s.lastOnline = now;
    if (s.playing || playing) s.lastPlaying = now;
    s.online = online;
    s.playing = playing;
    return news;
  }

  /** Signed out, or another account: nobody is known any more. */
  clear() {
    this.seen.clear();
  }
}
