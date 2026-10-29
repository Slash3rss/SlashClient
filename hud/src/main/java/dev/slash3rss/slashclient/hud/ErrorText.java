package dev.slash3rss.slashclient.hud;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.network.chat.Component;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What went wrong, in a few words in the game's language for a toast or a screen: the player never
 * sees "HTTP 429 {...}", a Java exception or a stack. The launcher's bridge answers either a code
 * ({"error":"rate_limited"}, "http_503", "slow_down:5") or, from older launchers, its raw error text;
 * a code we know gets its words, a plain sentence is shown as it is, and anything technical becomes
 * a general message. The details go to the log.
 */
public final class ErrorText {
	private static final String P = "slashclient-hud.error.";
	/** The message our requests throw: "HTTP <status> <body>". */
	private static final Pattern HTTP = Pattern.compile("HTTP (\\d{3})(?: (.*))?", Pattern.DOTALL);
	/** A code from the server or the launcher, with seconds to wait after it sometimes ("slow_down:5"). */
	private static final Pattern CODE = Pattern.compile("([a-z][a-z0-9_]*)(?::\\d+)?");
	private static final Pattern HTTP_CODE = Pattern.compile("http_(\\d{3})");

	private static final Map<String, String> CODES = Map.ofEntries(
		Map.entry("rate_limited", "tooMany"), Map.entry("too_many", "tooMany"), Map.entry("slow_down", "tooMany"),
		Map.entry("slow_mode", "tooMany"),
		Map.entry("unauthorized", "signIn"), Map.entry("bad_session", "signIn"),
		Map.entry("forbidden", "forbidden"), Map.entry("not_allowed", "forbidden"), Map.entry("not_admin", "forbidden"),
		Map.entry("not_owner", "forbidden"), Map.entry("not_member", "forbidden"),
		Map.entry("offline", "unavailable"), Map.entry("server_error", "unavailable"), Map.entry("retry_later", "unavailable"),
		Map.entry("provider_error", "unavailable"), Map.entry("storage_unavailable", "unavailable"),
		Map.entry("feature_disabled", "disabled"), Map.entry("provider_disabled", "disabled"), Map.entry("disabled", "disabled"),
		Map.entry("not_found", "notFound"), Map.entry("no_such_user", "notFound"),
		Map.entry("not_friends", "notFriends"),
		Map.entry("no_launcher", "noLauncher"));

	/** Words in an older launcher's raw text that mean the network failed (Node's fetch and sockets). */
	private static final List<String> NETWORK = List.of("fetch failed", "econnrefused", "econnreset", "enotfound", "etimedout",
		"eai_again", "getaddrinfo", "socket hang up", "timed out", "timeout", "aborted", "network");
	/** Words that give a text away as technical rather than meant for the player. */
	private static final List<String> TECHNICAL = List.of("error", "exception", "json", "undefined", "null", "cannot read",
		"is not a function", "unexpected", "status code", "enoent", "eacces", "eperm", "://");

	private ErrorText() {
	}

	/** The words for a failure: what the request answered, or what kind of thing broke. The details are logged. */
	public static String of(Throwable e) {
		String text = describe(e);
		SlashHud.LOG.info("SlashClient: told the player \"{}\" for: {}", text, String.valueOf(e));
		return text;
	}

	/** The words for an answer other than 200: its status and its body (JSON with "error", or anything). */
	public static String ofAnswer(int status, String body) {
		String said = said(body);
		if (said != null) {
			Matcher code = CODE.matcher(said);
			if (code.matches()) {
				String key = CODES.get(code.group(1));
				if (key != null) return tr(key);
				Matcher http = HTTP_CODE.matcher(said);
				if (http.matches()) return byStatus(Integer.parseInt(http.group(1)));
				// the launcher passes the server's refusals on as 502: a code we have no words for is no outage
				if (status == 502) return tr("generic");
			} else {
				String plain = plain(said);
				if (plain != null) return plain;
			}
		}
		return byStatus(status);
	}

	private static String describe(Throwable e) {
		int depth = 0;
		for (Throwable t = e; t != null && depth++ < 8; t = t.getCause() == t ? null : t.getCause()) {
			String msg = t.getMessage() == null ? "" : t.getMessage().trim();
			Matcher http = HTTP.matcher(msg);
			if (http.matches()) return ofAnswer(Integer.parseInt(http.group(1)), http.group(2));
			if (msg.equals("no launcher")) return tr("noLauncher");
			// the network (the launcher's bridge or the internet): connect, timeout, reset, unknown host
			if (t.getClass().getName().startsWith("java.net.") || t instanceof java.nio.channels.ClosedChannelException) return tr("unavailable");
			if (t instanceof java.nio.file.FileSystemException) return tr("file");
		}
		return tr("generic");
	}

	private static String byStatus(int status) {
		if (status == 429) return tr("tooMany");
		if (status == 401) return tr("signIn");
		if (status == 403) return tr("forbidden");
		if (status == 404) return tr("notFound");
		if (status >= 500 || status == 408) return tr("unavailable");
		return tr("generic");
	}

	/** What the body says went wrong: its "error" text, or null. */
	private static String said(String body) {
		if (body == null || body.isBlank()) return null;
		try {
			JsonElement json = JsonParser.parseString(body);
			if (!json.isJsonObject()) return null;
			JsonObject o = json.getAsJsonObject();
			if (o.has("error") && o.get("error").isJsonPrimitive()) return o.get("error").getAsString().trim();
		} catch (RuntimeException ignored) {
			// not JSON (a proxy's page): nothing to read from it
		}
		return null;
	}

	/** An older launcher's own text: shown when it reads like a sentence for the player, else words of ours. */
	private static String plain(String text) {
		if (text.isEmpty()) return null;
		String lower = text.toLowerCase(Locale.ROOT);
		if (NETWORK.stream().anyMatch(lower::contains)) return tr("unavailable");
		if (text.length() > 160 || text.contains("\n") || text.contains("{") || text.contains("[") || text.contains("<")
			|| text.contains("\\") || text.matches(".*\\b[A-Z][A-Z_]{2,}\\b.*") || text.matches(".*\\w\\(.*")
			|| TECHNICAL.stream().anyMatch(lower::contains)) return tr("generic");
		return text;
	}

	private static String tr(String key) {
		return Component.translatable(P + key).getString();
	}
}
