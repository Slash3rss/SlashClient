package dev.slash3rss.slashclient.hud.social;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * "A friend started playing": from the stream of statuses, the moments worth a toast. A friend
 * coming online, or starting a game (a world or a server); not a launcher reconnecting after the
 * network dropped for a moment, not someone hopping between servers, and not the same friend
 * over and over. The launcher decides the same way (src/renderer/friendActivity.ts).
 */
public final class FriendActivity {
	/** Offline (or not in a game) shorter than this is a reconnect, not news. */
	public static final long RECONNECT_MS = 3 * 60_000;
	/** The same news about one friend at most this often. */
	public static final long COOLDOWN_MS = 10 * 60_000;

	/** What to tell: they came online, or started playing (on `server`, empty for a world of their own). */
	public record News(boolean playing, String server) {}

	private static final class Seen {
		boolean online, playing;
		long lastOnline, lastPlaying, toldOnline, toldPlaying;
	}

	private final Map<String, Seen> seen = new ConcurrentHashMap<>();

	private static boolean playing(String status, String activity) {
		return !"offline".equals(status) && ("singleplayer".equals(activity) || "server".equals(activity));
	}

	/** The friend's status as it is now, with nothing to say (the list loaded: who is online already is not news). */
	public void know(String id, String status, String activity, long now) {
		Seen s = seen.computeIfAbsent(id, k -> new Seen());
		s.online = !"offline".equals(status);
		s.playing = playing(status, activity);
		if (s.online) s.lastOnline = now;
		if (s.playing) s.lastPlaying = now;
	}

	/** A status that just came: what to tell the player, or null. */
	public News update(String id, String status, String activity, String server, long now) {
		Seen s = seen.get(id);
		if (s == null) {
			// a friend this list did not know (just added): only remembered
			know(id, status, activity, now);
			return null;
		}
		boolean online = !"offline".equals(status);
		boolean playing = playing(status, activity);
		News news = null;
		// starting a game says more than coming online, so a launcher started straight into a game is one toast
		if (playing && !s.playing && now - s.lastPlaying >= RECONNECT_MS && now - s.toldPlaying >= COOLDOWN_MS) {
			news = new News(true, "server".equals(activity) && server != null ? server : "");
			s.toldPlaying = now;
		} else if (online && !s.online && !playing && now - s.lastOnline >= RECONNECT_MS && now - s.toldOnline >= COOLDOWN_MS) {
			news = new News(false, "");
			s.toldOnline = now;
		}
		// the moment they were last seen online (playing): a drop shorter than RECONNECT_MS counts from here
		if (s.online || online) s.lastOnline = now;
		if (s.playing || playing) s.lastPlaying = now;
		s.online = online;
		s.playing = playing;
		return news;
	}

	/** Signed out, or another account. */
	public void clear() {
		seen.clear();
	}
}
