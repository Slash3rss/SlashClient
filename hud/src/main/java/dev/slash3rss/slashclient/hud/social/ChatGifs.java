package dev.slash3rss.slashclient.hud.social;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.util.regex.Pattern;

/**
 * GIFs and stickers from the launcher's and the phone app's chats (server 0.9.40+). Such a message
 * is "[GIF] title" and, on the next line, a reference to the provider's CDN (the server's gifs.ts):
 * the game shows the first line, and a click opens the GIF's still frame big (PictureScreen), which
 * the launcher fetches the way the server says (through it, so GIPHY and Tenor do not see the
 * player's address). Only addresses on the providers' CDN hosts are ever asked for.
 */
public final class ChatGifs {
	private ChatGifs() {}

	private static final String MARK = "\nslashgif:";
	private static final Pattern HOSTS = Pattern.compile("^((media\\d?|i)\\.giphy\\.com|(media\\d?|c)\\.tenor\\.com)$");

	/** What the game needs of a GIF: what to show in the bubble and which picture opens on a click. */
	public record Gif(String line, boolean sticker, String still) {}

	/** Whether a message's text is a GIF (valid or not): it is not edited or copied as a text. */
	public static boolean isGif(String text) {
		return text != null && text.startsWith("[GIF]") && text.contains(MARK);
	}

	/** An https address on the providers' CDN hosts. */
	static boolean cdn(String url) {
		if (url == null || url.length() > 500) return false;
		try {
			URI u = URI.create(url);
			return "https".equals(u.getScheme()) && u.getRawUserInfo() == null && u.getPort() == -1 && u.getHost() != null && HOSTS.matcher(u.getHost()).matches();
		} catch (IllegalArgumentException e) {
			return false;
		}
	}

	/** The GIF a message carries, or null for any other text (and for a broken reference). */
	public static Gif parse(String text) {
		if (!isGif(text) || text.length() > 2000) return null;
		int at = text.indexOf(MARK);
		try {
			JsonObject r = JsonParser.parseString(text.substring(at + MARK.length())).getAsJsonObject();
			if (!r.has("v") || r.get("v").getAsInt() != 1) return null;
			String kind = r.has("k") ? r.get("k").getAsString() : "";
			if (!"gif".equals(kind) && !"sticker".equals(kind)) return null;
			// the still frame (a GIF or PNG the game reads); without one, the animation's first frame
			String still = r.has("s") ? r.get("s").getAsString() : r.has("a") ? r.get("a").getAsString() : null;
			if (!cdn(still)) return null;
			return new Gif(text.substring(0, at), "sticker".equals(kind), still);
		} catch (RuntimeException e) {
			return null;
		}
	}

	/** What a bubble or a toast shows for a text: a GIF's first line, any other text as it is. */
	public static String shown(String text) {
		return isGif(text) ? text.substring(0, text.indexOf(MARK)) : text;
	}
}
