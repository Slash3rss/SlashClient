package dev.slash3rss.slashclient.hud.streams;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Kick chat, read as a guest the way kick.com's own page does: Pusher's public WebSocket,
 * subscribed to the chat room's channel (chatrooms.&lt;id&gt;.v2). The room's number comes from
 * kick.com/api/v2/channels/&lt;name&gt;, which Cloudflare sometimes refuses to a program: then
 * the number can be typed in by hand. Pusher's key is asked from Kick too (it has changed
 * before), with the last known one when that fails. Nothing is ever sent but the subscription
 * and Pusher's pong.
 */
public final class KickChat extends StreamChat {
	public static final KickChat INSTANCE = new KickChat();
	/** Kick's public Pusher app (October 2026); used when Kick's own answer about it does not come. */
	static final String FALLBACK_KEY = "34bf7a0ff419a2a775b9", FALLBACK_CLUSTER = "us2";
	private static final Pattern EMOTE = Pattern.compile("\\[emote:(\\d+):([^\\]]*)]");
	/** Channel name → chat room number, so connecting again does not ask Kick each time. */
	private static final Map<String, Long> ROOMS = new ConcurrentHashMap<>();
	private volatile long room;

	private KickChat() {
		super("Kick");
	}

	@Override
	protected Prepared prepare(Target target) throws Exception {
		long id;
		String typed = target.extra() == null ? "" : target.extra().trim();
		if (!typed.isEmpty()) {
			try {
				id = Long.parseLong(typed);
			} catch (NumberFormatException e) {
				return new Prepared(null, "kick.badId");
			}
		} else {
			Long known = ROOMS.get(target.channel());
			if (known == null) {
				status(State.CONNECTING, "kick.lookup", target.channel());
				HttpResponse<String> r = HTTP.send(get("https://kick.com/api/v2/channels/" + target.channel()), HttpResponse.BodyHandlers.ofString());
				if (r.statusCode() == 404) return new Prepared(null, "kick.noChannel");
				// Cloudflare's challenge: 403 (or 429, 503 with a page instead of JSON)
				if (r.statusCode() == 403 || r.statusCode() == 429 || r.statusCode() == 503 || !r.body().trim().startsWith("{")) return new Prepared(null, "kick.blocked");
				if (r.statusCode() != 200) throw new java.io.IOException("HTTP " + r.statusCode());
				known = roomOf(r.body());
				if (known == null) return new Prepared(null, "kick.noChannel");
				ROOMS.put(target.channel(), known);
			}
			id = known;
		}
		room = id;
		String[] app = pusherApp();
		return new Prepared("wss://ws-" + app[1] + ".pusher.com/app/" + app[0] + "?protocol=7&client=js&version=8.4.0&flash=false", null);
	}

	private static HttpRequest get(String url) {
		return HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
			.header("User-Agent", USER_AGENT).header("Accept", "application/json").GET().build();
	}

	/** The chat room's number in kick.com's answer about a channel. */
	static Long roomOf(String body) {
		JsonObject o = JsonParser.parseString(body).getAsJsonObject();
		JsonObject room = obj(o, "chatroom");
		return room != null && room.has("id") ? room.get("id").getAsLong() : null;
	}

	private static String[] pusherApp;

	/** Kick's Pusher key and cluster, as its page asks for them; the last known ones when that fails. */
	private static String[] pusherApp() {
		if (pusherApp != null) return pusherApp;
		try {
			String body = "{\"client\":{\"id\":\"" + UUID.randomUUID() + "\",\"type\":\"web\"},\"capabilities\":{\"accepted_providers\":[{\"provider\":\"pusher\"}]}}";
			HttpRequest req = HttpRequest.newBuilder(URI.create("https://web.kick.com/api/v1/realtime/connection")).timeout(Duration.ofSeconds(10))
				.header("User-Agent", USER_AGENT).header("Content-Type", "application/json").header("Accept", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(body)).build();
			HttpResponse<String> r = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
			if (r.statusCode() == 200) {
				for (JsonElement c : obj(JsonParser.parseString(r.body()).getAsJsonObject(), "data").getAsJsonArray("connections")) {
					JsonObject conn = c.getAsJsonObject();
					JsonObject cred = obj(conn, "credentials");
					if ("pusher".equals(str(conn, "provider")) && cred != null && str(cred, "app_key") != null) {
						String cluster = str(cred, "cluster");
						return pusherApp = new String[] { str(cred, "app_key"), cluster == null ? FALLBACK_CLUSTER : cluster };
					}
				}
			}
		} catch (Exception e) {
			// the last known key below
		}
		return new String[] { FALLBACK_KEY, FALLBACK_CLUSTER };
	}

	@Override
	protected void opened() {
		// Pusher says hello first (pusher:connection_established); the subscription goes then
	}

	@Override
	protected long idleMillis() {
		// Pusher's activity_timeout is 120 s
		return 100_000;
	}

	@Override
	protected void ping() {
		send("{\"event\":\"pusher:ping\",\"data\":{}}");
	}

	@Override
	public String receive(String frame) {
		JsonObject m = JsonParser.parseString(frame).getAsJsonObject();
		String event = str(m, "event");
		if (event == null) return null;
		Target t = target();
		String channel = t == null ? "" : t.channel();
		switch (event) {
			case "pusher:connection_established" -> send("{\"event\":\"pusher:subscribe\",\"data\":{\"auth\":\"\",\"channel\":\"chatrooms." + room + ".v2\"}}");
			case "pusher:ping" -> send("{\"event\":\"pusher:pong\",\"data\":{}}");
			case "pusher_internal:subscription_succeeded" -> status(State.LIVE, "live", channel);
			case "pusher:error" -> {
				JsonObject d = data(m);
				int code = d != null && d.has("code") && !d.get("code").isJsonNull() ? d.get("code").getAsInt() : 0;
				// 4000-4099: Pusher says not to try again (a wrong key); 4200+: connect again at once
				if (code >= 4000 && code < 4100) {
					pusherApp = null;
					return "kick.pusher";
				}
				if (code >= 4200) return AGAIN;
			}
			case "App\\Events\\ChatMessageEvent" -> {
				Line line = line(data(m));
				if (line != null) add(line);
			}
			case "App\\Events\\MessageDeletedEvent" -> {
				JsonObject msg = obj(data(m), "message");
				String id = msg == null ? null : str(msg, "id");
				if (id != null) remove(l -> id.equals(l.id()));
			}
			case "App\\Events\\UserBannedEvent" -> {
				JsonObject user = obj(data(m), "user");
				String name = user == null ? null : str(user, "username");
				if (name != null) remove(l -> name.equalsIgnoreCase(l.login()));
			}
			case "App\\Events\\ChatroomClearEvent" -> clear();
			default -> {}
		}
		return null;
	}

	/** Pusher sends an event's data as a JSON string inside the JSON. */
	static JsonObject data(JsonObject m) {
		JsonElement d = m.get("data");
		if (d == null || d.isJsonNull()) return null;
		if (d.isJsonObject()) return d.getAsJsonObject();
		JsonElement inner = JsonParser.parseString(d.getAsString());
		return inner.isJsonObject() ? inner.getAsJsonObject() : null;
	}

	/** A ChatMessageEvent's data made a chat line; public for the tests. */
	public static Line line(JsonObject d) {
		if (d == null) return null;
		JsonObject sender = obj(d, "sender");
		String content = str(d, "content");
		if (sender == null || content == null) return null;
		String name = str(sender, "username");
		if (name == null) name = "?";
		JsonObject identity = obj(sender, "identity");
		int color = identity == null ? -1 : parseColor(str(identity, "color"));
		List<Badge> badges = new ArrayList<>();
		if (identity != null) {
			for (String list : new String[] { "badges", "badges_v2" }) {
				JsonElement arr = identity.get(list);
				if (arr == null || !arr.isJsonArray()) continue;
				for (JsonElement b : (JsonArray) arr) {
					if (!b.isJsonObject()) continue;
					String kind = str(b.getAsJsonObject(), "type");
					if (kind == null) kind = str(b.getAsJsonObject(), "name");
					Badge badge = badge(kind);
					if (badge != null && !badges.contains(badge)) badges.add(badge);
				}
			}
		}
		String id = str(d, "id");
		return new Line(id == null ? "" : id, name, name, color, badges, emotes(content), false, System.currentTimeMillis());
	}

	static Badge badge(String kind) {
		if (kind == null) return null;
		return switch (kind) {
			case "broadcaster" -> ChatBadges.HOST;
			case "moderator" -> ChatBadges.MOD;
			case "vip" -> ChatBadges.VIP;
			case "subscriber", "founder" -> ChatBadges.SUB;
			case "og" -> ChatBadges.OG;
			case "staff" -> ChatBadges.STAFF;
			case "verified" -> ChatBadges.VERIFIED;
			default -> null;
		};
	}

	/** "[emote:37226:KEKW]" → ":KEKW:", the emote's name as text. */
	public static String emotes(String content) {
		Matcher m = EMOTE.matcher(content);
		StringBuilder out = new StringBuilder();
		while (m.find()) m.appendReplacement(out, Matcher.quoteReplacement(":" + m.group(2) + ":"));
		m.appendTail(out);
		return out.toString();
	}

	private static JsonObject obj(JsonObject o, String key) {
		if (o == null) return null;
		JsonElement e = o.get(key);
		return e != null && e.isJsonObject() ? e.getAsJsonObject() : null;
	}

	private static String str(JsonObject o, String key) {
		if (o == null) return null;
		JsonElement e = o.get(key);
		return e != null && e.isJsonPrimitive() ? e.getAsString() : null;
	}
}
