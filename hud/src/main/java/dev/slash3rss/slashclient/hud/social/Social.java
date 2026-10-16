package dev.slash3rss.slashclient.hud.social;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.toasts.SystemToast;
import net.minecraft.network.chat.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Friends and messages in the game. The launcher passes the address of its local bridge and a
 * key for this run (-Dslashclient.bridge, -Dslashclient.bridgeKey); the SlashClient account token
 * never reaches the game. Events arrive by long polling on a background thread; the screens only
 * read the lists kept here.
 */
public final class Social {
	private Social() {}

	public record Friend(String id, String name, String handle, String status, String activity, String server, int unread, long lastMessageAt) {}
	public record Message(long id, String from, String to, String text, long at, boolean read) {}

	private static final String URL = System.getProperty("slashclient.bridge", "");
	private static final String KEY = System.getProperty("slashclient.bridgeKey", "");
	// HTTP/1.1: on plain http Java would otherwise try an "h2c" upgrade first
	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(3)).build();
	private static final Gson GSON = new Gson();

	private static volatile boolean signedIn;
	private static volatile boolean reachable;
	private static volatile String myId = "";
	private static volatile String myName = "";
	private static volatile List<Friend> friends = List.of();
	private static final Map<String, List<Message>> chats = new ConcurrentHashMap<>();
	private static final Map<String, Long> typingUntil = new ConcurrentHashMap<>();
	/** The conversation open on screen: its new messages are read at once and make no toast. */
	public static volatile String viewing;
	private static long seq;

	/** Whether the game was started by the launcher with friends available. */
	public static boolean available() {
		return !URL.isEmpty() && !KEY.isEmpty();
	}

	public static boolean signedIn() {
		return signedIn;
	}

	public static boolean reachable() {
		return reachable;
	}

	public static String myId() {
		return myId;
	}

	public static List<Friend> friends() {
		return friends;
	}

	public static int onlineCount() {
		return (int) friends.stream().filter(f -> !"offline".equals(f.status())).count();
	}

	public static int unreadTotal() {
		return friends.stream().mapToInt(Friend::unread).sum();
	}

	public static List<Message> chat(String friendId) {
		return chats.getOrDefault(friendId, List.of());
	}

	public static boolean typing(String friendId) {
		return typingUntil.getOrDefault(friendId, 0L) > System.currentTimeMillis();
	}

	public static Friend friend(String id) {
		for (Friend f : friends) if (f.id().equals(id)) return f;
		return null;
	}

	// ---------- talking to the launcher ----------

	private static JsonObject request(String method, String path, JsonObject body, int timeoutSec) throws Exception {
		HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(URL + path))
			.timeout(Duration.ofSeconds(timeoutSec))
			.header("Authorization", "Bearer " + KEY)
			.header("Content-Type", "application/json");
		b.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(GSON.toJson(body)));
		HttpResponse<String> res = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
		if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode() + " " + res.body());
		return GSON.fromJson(res.body(), JsonObject.class);
	}

	/** Starts the background thread; does nothing when the launcher gave no bridge. */
	public static void start() {
		if (!available()) return;
		Thread t = new Thread(Social::run, "SlashClient friends");
		t.setDaemon(true);
		t.start();
	}

	private static void run() {
		int failures = 0;
		while (true) {
			try {
				if (!reachable) {
					refreshState();
					if (signedIn) refreshFriends();
					reachable = true;
				}
				JsonObject res = request("GET", "/events?after=" + seq, null, 35);
				long newSeq = res.get("seq").getAsLong();
				// the launcher was restarted: its numbering starts again, so catch up from scratch
				if (newSeq < seq) reachable = false;
				seq = newSeq;
				for (JsonElement e : res.getAsJsonArray("events")) handle(e.getAsJsonObject());
				failures = 0;
			} catch (Exception e) {
				reachable = false;
				if (failures++ == 0) SlashHud.LOG.info("SlashClient: launcher bridge not reachable: {}", e.toString());
				sleep(Math.min(30_000, 2_000L * failures));
			}
		}
	}

	private static void sleep(long ms) {
		try {
			Thread.sleep(ms);
		} catch (InterruptedException ignored) {
			Thread.currentThread().interrupt();
		}
	}

	private static void refreshState() throws Exception {
		JsonObject s = request("GET", "/state", null, 5);
		signedIn = s.has("signedIn") && s.get("signedIn").getAsBoolean();
		JsonObject user = s.has("user") && s.get("user").isJsonObject() ? s.getAsJsonObject("user") : null;
		myId = user != null ? str(user, "id") : "";
		myName = user != null ? str(user, "name") : "";
		if (!signedIn) friends = List.of();
	}

	private static void refreshFriends() throws Exception {
		JsonObject res = request("GET", "/v1/friends", null, 8);
		List<Friend> list = new ArrayList<>();
		for (JsonElement el : res.getAsJsonArray("friends")) list.add(friendFrom(el.getAsJsonObject()));
		sort(list);
		friends = List.copyOf(list);
	}

	/** Online first, then whoever wrote last, then by name. */
	private static void sort(List<Friend> list) {
		list.sort(Comparator.comparing((Friend f) -> "offline".equals(f.status()))
			.thenComparing(Comparator.comparingLong(Friend::lastMessageAt).reversed())
			.thenComparing(f -> f.name().toLowerCase()));
	}

	private static Friend friendFrom(JsonObject o) {
		JsonObject p = o.has("presence") && o.get("presence").isJsonObject() ? o.getAsJsonObject("presence") : new JsonObject();
		JsonObject a = p.has("activity") && p.get("activity").isJsonObject() ? p.getAsJsonObject("activity") : null;
		return new Friend(str(o, "id"), str(o, "name"), str(o, "handle"), p.has("status") ? str(p, "status") : "offline",
			a != null ? str(a, "kind") : "", a != null ? str(a, "server") : "",
			o.has("unread") ? o.get("unread").getAsInt() : 0, o.has("lastMessageAt") ? o.get("lastMessageAt").getAsLong() : 0);
	}

	private static Message messageFrom(JsonObject o) {
		return new Message(o.get("id").getAsLong(), str(o, "from"), str(o, "to"), str(o, "text"), o.get("at").getAsLong(),
			o.has("readAt") && !o.get("readAt").isJsonNull());
	}

	private static String str(JsonObject o, String key) {
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
	}

	private static void handle(JsonObject e) throws Exception {
		switch (str(e, "type")) {
			case "message" -> {
				Message m = messageFrom(e.getAsJsonObject("message"));
				String other = m.from().equals(myId) ? m.to() : m.from();
				List<Message> chat = chats.get(other);
				if (chat != null && chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				if (m.from().equals(myId)) return;
				typingUntil.remove(other);
				if (other.equals(viewing)) markRead(other);
				else {
					bump(other, 1, m.at());
					Friend f = friend(other);
					toast(f != null ? f.name() : "?", m.text());
				}
			}
			case "presence" -> {
				String id = str(e, "id");
				JsonObject p = e.getAsJsonObject("presence");
				JsonObject a = p.has("activity") && p.get("activity").isJsonObject() ? p.getAsJsonObject("activity") : null;
				List<Friend> list = new ArrayList<>();
				for (Friend f : friends) {
					list.add(f.id().equals(id) ? new Friend(f.id(), f.name(), f.handle(), str(p, "status"),
						a != null ? str(a, "kind") : "", a != null ? str(a, "server") : "", f.unread(), f.lastMessageAt()) : f);
				}
				sort(list);
				friends = List.copyOf(list);
			}
			case "typing" -> typingUntil.put(str(e, "from"), System.currentTimeMillis() + 6_000);
			case "friends" -> {
				refreshFriends();
				if (e.has("request") && e.get("request").isJsonObject()) toast(str(e.getAsJsonObject("request"), "name"), Component.translatable("slashclient-hud.friends.invite").getString());
			}
			case "state" -> {
				refreshState();
				if (signedIn) refreshFriends();
			}
			default -> {}
		}
	}

	private static void bump(String friendId, int unread, long at) {
		List<Friend> list = new ArrayList<>();
		for (Friend f : friends) {
			list.add(f.id().equals(friendId) ? new Friend(f.id(), f.name(), f.handle(), f.status(), f.activity(), f.server(),
				unread == 0 ? 0 : f.unread() + unread, Math.max(f.lastMessageAt(), at)) : f);
		}
		sort(list);
		friends = List.copyOf(list);
	}

	private static void toast(String title, String text) {
		Minecraft mc = Minecraft.getInstance();
		String shortText = text.length() > 60 ? text.substring(0, 59) + "…" : text;
		mc.execute(() -> SystemToast.add(dev.slash3rss.slashclient.hud.Compat.toasts(mc), dev.slash3rss.slashclient.hud.Compat.friendToast(), Component.literal(title), Component.literal(shortText)));
	}

	// ---------- actions from the screens (off the render thread) ----------

	/** Loads the newest messages with a friend once; later ones come as events. */
	public static void open(String friendId) {
		viewing = friendId;
		Thread.ofVirtual().start(() -> {
			try {
				if (!chats.containsKey(friendId)) {
					JsonObject res = request("GET", "/v1/messages/" + friendId + "?limit=50", null, 8);
					List<Message> list = new CopyOnWriteArrayList<>();
					for (JsonElement el : res.getAsJsonArray("messages")) list.add(messageFrom(el.getAsJsonObject()));
					chats.put(friendId, list);
				}
				markRead(friendId);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: messages: {}", e.toString());
			}
		});
	}

	private static void markRead(String friendId) {
		Thread.ofVirtual().start(() -> {
			try {
				request("POST", "/v1/messages/" + friendId + "/read", null, 5);
				bump(friendId, 0, 0);
			} catch (Exception ignored) {
				// shows as unread a little longer; harmless
			}
		});
	}

	/** Sends a message; it shows up when the server confirms it (the "message" event). */
	public static void send(String friendId, String text) {
		String t = text.strip();
		if (t.isEmpty()) return;
		JsonObject body = new JsonObject();
		body.addProperty("text", t.length() > 2000 ? t.substring(0, 2000) : t);
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = request("POST", "/v1/messages/" + friendId, body, 8);
				Message m = messageFrom(res.getAsJsonObject("message"));
				List<Message> chat = chats.computeIfAbsent(friendId, k -> new CopyOnWriteArrayList<>());
				if (chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				bump(friendId, 0, m.at());
			} catch (Exception e) {
				toast(Component.translatable("slashclient-hud.friends.notSent").getString(), e.getMessage() == null ? "" : e.getMessage());
			}
		});
	}

	/** The friend's activity in a few words: "on mc.example.com", "in singleplayer"… */
	public static Component activity(Friend f) {
		if ("offline".equals(f.status())) return Component.translatable("slashclient-hud.friends.offline");
		return switch (f.activity()) {
			case "server" -> f.server().isEmpty() ? Component.translatable("slashclient-hud.friends.onServer") : Component.translatable("slashclient-hud.friends.onServerName", f.server());
			case "singleplayer" -> Component.translatable("slashclient-hud.friends.singleplayer");
			case "menu" -> Component.translatable("slashclient-hud.friends.menu");
			default -> Component.translatable("slashclient-hud.friends.launcher");
		};
	}
}
