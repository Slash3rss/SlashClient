package dev.slash3rss.slashclient.hud.social;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Friends live on Twitch or Kick (the server's "Streamy", 0.9.24+): who is live now, from the
 * friends list ("stream") and the 'stream' events the launcher passes on, for the red LIVE badge
 * in the friends window. A toast only when the server marks the start as news (`notify`): it
 * already left out muted friends, players who turned it off and a stream that restarted a moment
 * ago; a friend muted here a moment ago is left out too. Nametags stay as they are.
 */
public final class FriendStreams {
	private FriendStreams() {}

	/** A live stream: the platform ("twitch", "kick"), its title, category and viewers, and where it is watched. */
	public record Live(String platform, String title, String category, int viewers, String url) {
		public String platformName() {
			return "kick".equals(platform) ? "Kick" : "Twitch";
		}
	}

	/** Only links to the platforms themselves. */
	private static final Pattern CHANNEL = Pattern.compile("^https://(www\\.twitch\\.tv|kick\\.com)/[\\w-]{1,40}$");
	private static final Map<String, Live> live = new ConcurrentHashMap<>();
	/** The red of the badge (as in the launcher). */
	public static final int RED = 0xFFE11D48;
	/** The status line of a live friend: a light red. */
	public static final int LINE = 0xFFFDA4AF;

	/** The friend's stream now, or null. */
	public static Live of(String friendId) {
		return live.get(friendId);
	}

	static Live parse(JsonElement e) {
		if (e == null || !e.isJsonObject()) return null;
		JsonObject o = e.getAsJsonObject();
		String platform = Social.str(o, "platform"), url = Social.str(o, "url");
		if (!("twitch".equals(platform) || "kick".equals(platform)) || !CHANNEL.matcher(url).matches()) return null;
		String title = Social.str(o, "title").replaceAll("[\\p{Cntrl}]", " ").trim();
		return new Live(platform, title.length() > 140 ? title.substring(0, 140) : title, Social.str(o, "category"),
			o.has("viewers") && o.get("viewers").isJsonPrimitive() ? Math.max(0, o.get("viewers").getAsInt()) : 0, url);
	}

	/** One friend of the list as it loaded (the server leaves "stream" out when they are not live or hide it). */
	static void fromFriend(String id, JsonObject friend) {
		set(id, parse(friend.get("stream")));
	}

	private static void set(String id, Live l) {
		if (id.isEmpty()) return;
		if (l == null) live.remove(id);
		else live.put(id, l);
	}

	/** The server's 'stream' event: { id, stream | null, notify? }. */
	static void onEvent(JsonObject e) {
		String id = Social.str(e, "id");
		Live l = parse(e.get("stream"));
		set(id, l);
		if (l == null || !Social.bool(e, "notify")) return;
		Social.Friend f = Social.friend(id);
		if (f == null || f.muted()) return;
		Social.toastFrom(f, toastText(l), FriendToast.Kind.LIVE);
	}

	/** "nadaje na żywo na Twitch: Budujemy zamek". */
	public static String toastText(Live l) {
		return l.title().isEmpty() ? Component.translatable("slashclient-hud.stream.toastNoTitle", l.platformName()).getString()
			: Component.translatable("slashclient-hud.stream.toast", l.platformName(), l.title()).getString();
	}

	/** "LIVE na Twitch · Budujemy zamek", under the friend's name. */
	public static Component line(Live l) {
		return l.title().isEmpty() ? Ui.tr("slashclient-hud.stream.lineNoTitle", l.platformName()) : Ui.tr("slashclient-hud.stream.line", l.platformName(), l.title());
	}

	/** How wide the badge is. */
	public static int badgeWidth() {
		return Ui.width(Ui.bold("LIVE")) + 13;
	}

	/** The red badge: a white dot and LIVE, 9 high, at (x, y); returns its width. */
	public static int badge(GuiGraphicsExtractor g, int x, int y) {
		int w = badgeWidth();
		Ui.round(g, x, y, w, 10, 2, RED);
		Ui.round(g, x + 3, y + 3, 4, 4, 1, 0xFFFFFFFF);
		Ui.draw(g, Ui.bold("LIVE"), x + 9, y + 1, 0xFFFFFFFF);
		return w;
	}

	/** Signed out, or another account. */
	static void clear() {
		live.clear();
	}

	/** For the in-game test: a friend live (or not, with null) as if the friends list said so. */
	public static void setForTest(String friendId, Live l) {
		set(friendId, l);
	}

	/** For the in-game test: the server's event as the launcher passes it on. */
	public static void eventForTest(JsonObject e) {
		onEvent(e);
	}
}
