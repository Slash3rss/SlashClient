package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Statuses from the tab list: some servers write where the player is over the player list (SkyUp:
 * "» SkyUP - AnyBlock «" over "» S3 (Wyspy) «"). SlashClient's server keeps rules per server (the
 * admin panel, GET /v1/status-rules); each second this reads the header and footer, makes the short
 * status ("S3 (Wyspy)") with the rule for the server the game is on, and tells the launcher when it
 * changes. The launcher passes it to friends (only when they may see the server) and to Discord.
 */
public final class TabStatus {
	private TabStatus() {}

	public record Extractor(boolean footer, int line, Pattern pattern, List<String> groups) {}
	public record Rule(String server, String name, String strip, List<Extractor> extractors, Map<String, String> map, String template) {}
	public record Reading(String detail, Map<String, String> values) {}

	static final int DETAIL_MAX = 48;
	private static final int LINE_MAX = 256;
	/** Steps a pattern may take on one line before it is given up (the server already refuses slow ones). */
	private static final int STEP_BUDGET = 200_000;
	private static final Pattern GROUP_NAME = Pattern.compile("\\(\\?<([a-zA-Z][a-zA-Z0-9]{0,31})>");
	private static final Pattern PLACEHOLDER = Pattern.compile("\\{([a-zA-Z][a-zA-Z0-9]{0,31})\\}");
	private static final Pattern FORMATTING = Pattern.compile("§.");

	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
	private static final Gson GSON = new Gson();
	private static final long REFRESH_MS = 10 * 60_000;
	private static final long SEND_GAP_MS = 2_000;

	private static volatile List<Rule> rules = List.of();
	private static String etag = "";
	private static long fetchedAt;
	private static volatile boolean fetching;

	// what was read and told last
	private static String lastText;
	private static String lastServer;
	private static String sentKey;
	private static String pendingKey;
	private static JsonObject pending;
	private static long sentAt;
	private static long checkedAt;
	/** The launcher is older and does not know /status: not asked again in this run. */
	private static volatile boolean unsupported;

	// ---------- the rules ----------

	/** One rule from the server's JSON; null when it cannot be used here. */
	static Rule ruleFrom(JsonObject o) {
		try {
			List<Extractor> list = new ArrayList<>();
			for (JsonElement e : o.getAsJsonArray("extractors")) {
				JsonObject x = e.getAsJsonObject();
				String pattern = x.get("pattern").getAsString();
				if (pattern.length() > 200) continue;
				List<String> groups = new ArrayList<>();
				Matcher m = GROUP_NAME.matcher(pattern);
				while (m.find()) groups.add(m.group(1));
				list.add(new Extractor("footer".equals(x.get("source").getAsString()), x.has("line") ? x.get("line").getAsInt() : 0, Pattern.compile(pattern), groups));
			}
			Map<String, String> map = new LinkedHashMap<>();
			if (o.has("map") && o.get("map").isJsonObject()) for (var en : o.getAsJsonObject("map").entrySet()) map.put(en.getKey(), en.getValue().getAsString());
			return new Rule(o.get("server").getAsString().toLowerCase(Locale.ROOT), str(o, "name"), str(o, "strip"), List.copyOf(list), map, str(o, "template"));
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: tab status rule: {}", e.toString());
			return null;
		}
	}

	static List<Rule> rulesFrom(String json) {
		List<Rule> out = new ArrayList<>();
		JsonObject root = GSON.fromJson(json, JsonObject.class);
		if (root != null && root.has("rules") && root.get("rules").isJsonArray()) {
			for (JsonElement e : root.getAsJsonArray("rules")) {
				Rule r = e.isJsonObject() ? ruleFrom(e.getAsJsonObject()) : null;
				if (r != null) out.add(r);
			}
		}
		return List.copyOf(out);
	}

	private static String str(JsonObject o, String key) {
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
	}

	/** Asks SlashClient's server for the rules (at most every 10 minutes; mostly a 304). */
	public static void refresh() {
		String server = Badges.server;
		if (server == null || fetching || System.currentTimeMillis() - fetchedAt < REFRESH_MS) return;
		fetching = true;
		fetchedAt = System.currentTimeMillis();
		HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(server + "/v1/status-rules")).timeout(Duration.ofSeconds(8)).GET();
		if (!etag.isEmpty()) b.header("If-None-Match", etag);
		HTTP.sendAsync(b.build(), HttpResponse.BodyHandlers.ofString()).thenAccept(res -> {
			if (res.statusCode() != 200) return;
			rules = rulesFrom(res.body());
			etag = res.headers().firstValue("etag").orElse("");
			lastText = null;
		}).exceptionally(err -> {
			SlashHud.LOG.debug("SlashClient: tab status rules: {}", err.toString());
			return null;
		}).whenComplete((v, err) -> fetching = false);
	}

	// ---------- reading a tab list ----------

	/** "SkyUp.pl:25565" → "skyup.pl". */
	static String key(String address) {
		String a = address == null ? "" : address.trim().toLowerCase(Locale.ROOT);
		while (a.endsWith(".")) a = a.substring(0, a.length() - 1);
		if (a.endsWith(":25565")) a = a.substring(0, a.length() - 6);
		return a.replaceAll("\\.+(?=:\\d+$)", "");
	}

	/** The rule for an address: the server itself or a subdomain, the most precise one. */
	static Rule ruleFor(List<Rule> list, String address) {
		String key = key(address);
		if (key.isEmpty()) return null;
		String host = key.replaceAll(":\\d+$", "");
		Rule best = null;
		for (Rule r : list) {
			boolean hit = r.server().contains(":") ? key.equals(r.server()) || key.endsWith("." + r.server()) : host.equals(r.server()) || host.endsWith("." + r.server());
			if (hit && (best == null || r.server().length() > best.server().length())) best = r;
		}
		return best;
	}

	private static String trim(String line, String strip) {
		int a = 0, b = line.length();
		while (a < b && (Character.isWhitespace(line.charAt(a)) || strip.indexOf(line.charAt(a)) >= 0)) a++;
		while (b > a && (Character.isWhitespace(line.charAt(b - 1)) || strip.indexOf(line.charAt(b - 1)) >= 0)) b--;
		String s = line.substring(a, b);
		return s.length() > LINE_MAX ? s.substring(0, LINE_MAX) : s;
	}

	/** The text an extractor reads: one line of the header or footer, cleaned, or all of it (line 0). */
	static String source(String text, int line, String strip) {
		String[] lines = FORMATTING.matcher(text == null ? "" : text).replaceAll("").split("\\r?\\n", -1);
		if (line == 0) {
			StringBuilder all = new StringBuilder();
			for (int i = 0; i < lines.length; i++) all.append(i > 0 ? "\n" : "").append(trim(lines[i], strip));
			return all.toString();
		}
		return line <= lines.length ? trim(lines[line - 1], strip) : null;
	}

	/** Text that counts the pattern's reads and stops a pattern that takes too long. */
	private static final class Budget implements CharSequence {
		private final String s;
		private final int[] left;

		Budget(String s, int[] left) {
			this.s = s;
			this.left = left;
		}

		@Override
		public int length() {
			return s.length();
		}

		@Override
		public char charAt(int i) {
			if (--left[0] < 0) throw new IllegalStateException("too slow");
			return s.charAt(i);
		}

		@Override
		public CharSequence subSequence(int a, int b) {
			return new Budget(s.substring(a, b), left);
		}

		@Override
		public String toString() {
			return s;
		}
	}

	/** `{name}` from the values; "" when one is missing. */
	static String render(String template, Map<String, String> values) {
		Matcher m = PLACEHOLDER.matcher(template == null ? "" : template);
		StringBuilder out = new StringBuilder();
		while (m.find()) {
			String v = values.get(m.group(1));
			if (v == null || v.isEmpty()) return "";
			m.appendReplacement(out, Matcher.quoteReplacement(v));
		}
		m.appendTail(out);
		return out.toString();
	}

	/** One line, printable, at most 48 characters; null for nothing. */
	static String sanitize(String s) {
		if (s == null) return null;
		StringBuilder out = new StringBuilder();
		boolean space = false;
		String plain = FORMATTING.matcher(s).replaceAll("");
		for (int i = 0; i < plain.length(); ) {
			int cp = plain.codePointAt(i);
			i += Character.charCount(cp);
			int type = Character.getType(cp);
			if (type == Character.CONTROL || type == Character.FORMAT || type == Character.PRIVATE_USE || type == Character.UNASSIGNED || type == Character.SURROGATE
				|| type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR) {
				if (cp == '\n' || cp == '\t' || cp == '\r') space = out.length() > 0;
				continue;
			}
			if (Character.isWhitespace(cp) || Character.isSpaceChar(cp)) {
				space = out.length() > 0;
				continue;
			}
			if (space) out.append(' ');
			space = false;
			out.appendCodePoint(cp);
		}
		String r = out.toString();
		if (r.codePointCount(0, r.length()) > DETAIL_MAX) r = r.substring(0, r.offsetByCodePoints(0, DETAIL_MAX)).trim();
		return r.isEmpty() ? null : r;
	}

	/** What a rule makes of a header and footer. */
	public static Reading evaluate(Rule rule, String header, String footer) {
		Map<String, String> values = new LinkedHashMap<>();
		for (Extractor x : rule.extractors()) {
			String text = source(x.footer() ? footer : header, x.line(), rule.strip());
			if (text == null) continue;
			try {
				Matcher m = x.pattern().matcher(new Budget(text, new int[] {STEP_BUDGET}));
				if (!m.find()) continue;
				for (String g : x.groups()) {
					String v = m.group(g);
					if (v == null || values.containsKey(g)) continue;
					v = v.trim();
					String mapped = rule.map().get(v);
					if (mapped == null) for (var en : rule.map().entrySet()) if (en.getKey().equalsIgnoreCase(v)) mapped = en.getValue();
					if (mapped == null) mapped = v;
					if (!mapped.isEmpty()) values.put(g, mapped);
				}
			} catch (RuntimeException e) {
				// a pattern too slow for this text, or a group it does not have: this one says nothing
				SlashHud.LOG.debug("SlashClient: tab status: {}", e.toString());
			}
		}
		return new Reading(sanitize(render(rule.template(), values)), values);
	}

	// ---------- each second in the game ----------

	/** Reads the tab list and tells the launcher when the status changed (at most every 2 s). */
	public static void tick(Minecraft mc) {
		if (!dev.slash3rss.slashclient.hud.social.Social.bridged() || unsupported) return;
		// once a second is plenty (also outside a world: leaving a server is news too)
		long now = System.currentTimeMillis();
		if (now - checkedAt < 1000) return;
		checkedAt = now;
		String server = dev.slash3rss.slashclient.hud.social.Social.currentServer();
		if (server == null || mc.level == null) {
			if (lastServer != null) {
				lastServer = null;
				lastText = null;
				queue(null, null);
			}
			flush();
			return;
		}
		refresh();
		var parts = (dev.slash3rss.slashclient.hud.mixin.PlayerTabOverlayAccessor) Compat.tabList(mc);
		Component h = parts.slashclient$header(), f = parts.slashclient$footer();
		String header = h == null ? "" : h.getString(), footer = f == null ? "" : f.getString();
		List<Rule> list = rules;
		String text = server + "\u0000" + header + "\u0000" + footer + "\u0000" + System.identityHashCode(list);
		if (!text.equals(lastText)) {
			lastText = text;
			lastServer = server;
			Rule rule = ruleFor(list, server);
			queue(server, rule == null ? null : evaluate(rule, header, footer));
		}
		flush();
	}

	private static void queue(String server, Reading reading) {
		JsonObject body = new JsonObject();
		if (server == null) body.add("server", com.google.gson.JsonNull.INSTANCE);
		else {
			body.addProperty("server", server);
			if (reading != null && reading.detail() != null) {
				body.addProperty("detail", reading.detail());
				JsonObject values = new JsonObject();
				reading.values().forEach(values::addProperty);
				body.add("values", values);
			}
		}
		String k = body.toString();
		// nothing new to say (the clock in the footer ticks, the status does not)
		if (Objects.equals(k, pendingKey != null ? pendingKey : sentKey)) return;
		pendingKey = k;
		pending = body;
	}

	private static void flush() {
		if (pending == null || System.currentTimeMillis() - sentAt < SEND_GAP_MS) return;
		JsonObject body = pending;
		String k = pendingKey;
		pending = null;
		pendingKey = null;
		sentKey = k;
		sentAt = System.currentTimeMillis();
		Thread.ofVirtual().start(() -> {
			try {
				dev.slash3rss.slashclient.hud.social.Social.sendStatus(body);
			} catch (Exception e) {
				// a launcher from before 0.9.25: it has no /status
				if (String.valueOf(e.getMessage()).startsWith("HTTP 403") || String.valueOf(e.getMessage()).startsWith("HTTP 404")) unsupported = true;
				SlashHud.LOG.debug("SlashClient: tab status: {}", e.toString());
			}
		});
	}

	// ---------- the mode, for waypoints ----------

	/** SkyUp's rule as the server seeds it (statusRules.ts, SKYUP_RULE), until the server's rules came. */
	private static final List<Rule> BUILT_IN = rulesFrom("{\"rules\":[{\"server\":\"skyup.pl\",\"name\":\"SkyUp.pl\",\"strip\":\"»« \",\"extractors\":["
		+ "{\"source\":\"header\",\"line\":1,\"pattern\":\"^Sky[Uu][Pp] - (?<mode>[^»«]{1,32})$\"},"
		+ "{\"source\":\"header\",\"line\":2,\"pattern\":\"^(?<sector>LOBBY|Lobby|S\\\\d{1,2}(?: \\\\([^()]{1,24}\\\\))?)$\"}],"
		+ "\"map\":{\"LOBBY\":\"Lobby\"},\"template\":\"{sector}\"}]}");

	/**
	 * Which mode of a server network the tab list says the player is in ("AnyBlock · S3 (Wyspy)"): the
	 * `mode` and `sector` values of the server's rule, those it has; null when it says neither (no rule,
	 * or a header that is not the rule's). Waypoints keep the points of each mode apart with it.
	 */
	public static String mode(String server, String header, String footer) {
		List<Rule> list = rules.isEmpty() ? BUILT_IN : rules;
		Rule rule = ruleFor(list, server);
		if (rule == null) return null;
		Map<String, String> values = evaluate(rule, header, footer).values();
		String mode = sanitize(values.get("mode")), sector = sanitize(values.get("sector"));
		if (mode == null) return sector;
		return sector == null ? mode : mode + " · " + sector;
	}

	/** The mode the tab list the game holds now says, on `server`. */
	public static String modeOnTab(Minecraft mc, String server) {
		var parts = (dev.slash3rss.slashclient.hud.mixin.PlayerTabOverlayAccessor) Compat.tabList(mc);
		Component h = parts.slashclient$header(), f = parts.slashclient$footer();
		return mode(server, h == null ? "" : h.getString(), f == null ? "" : f.getString());
	}

	/** For the test: the rules as the server would give them, without the network. */
	public static void rulesForTest(String json) {
		rules = rulesFrom(json);
		fetchedAt = System.currentTimeMillis();
		lastText = null;
	}

	/** For the test: what the rules make of the tab list the game holds now, as if on `server`. */
	public static String readTabForTest(Minecraft mc, String server) {
		var parts = (dev.slash3rss.slashclient.hud.mixin.PlayerTabOverlayAccessor) Compat.tabList(mc);
		Component h = parts.slashclient$header(), f = parts.slashclient$footer();
		return readForTest(server, h == null ? "" : h.getString(), f == null ? "" : f.getString());
	}

	/** For the test: what the rules make of a tab list on a server ("" for nothing). */
	public static String readForTest(String server, String header, String footer) {
		Rule rule = ruleFor(rules, server);
		Reading r = rule == null ? null : evaluate(rule, header, footer);
		return r == null || r.detail() == null ? "" : r.detail();
	}
}
