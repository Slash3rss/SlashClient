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
	/** `invite` is a server address when the message is a "join me" invite, else empty. */
	public record Message(long id, String from, String to, String text, long at, boolean read, String invite, String inviteVersion) {}

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
		return !URL.isEmpty() && !KEY.isEmpty() || sample;
	}

	/** A real launcher bridge (not the screenshot test's made-up friends). */
	public static boolean bridged() {
		return !URL.isEmpty() && !KEY.isEmpty();
	}

	/** Made-up friends and a chat for the screenshot test (no launcher there). */
	private static volatile boolean sample;

	public static void sampleForTest(Friend friend, List<Message> chat, String me) {
		sample = signedIn = reachable = true;
		myId = me;
		friends = List.of(friend);
		chats.put(friend.id(), new CopyOnWriteArrayList<>(chat));
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

	/** A call to the SlashClient server through the launcher (the cosmetics menu); blocks, so not on the game's thread. */
	public static JsonObject api(String method, String path, JsonObject body) throws Exception {
		if (!available()) throw new IllegalStateException("no launcher");
		return request(method, path, body, 8);
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
		JsonObject inv = o.has("invite") && o.get("invite").isJsonObject() ? o.getAsJsonObject("invite") : null;
		return new Message(o.get("id").getAsLong(), str(o, "from"), str(o, "to"), str(o, "text"), o.get("at").getAsLong(),
			o.has("readAt") && !o.get("readAt").isJsonNull(), inv == null ? "" : str(inv, "server"), inv == null ? "" : str(inv, "version"));
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
					if (!m.invite().isEmpty()) toast(f != null ? f.name() : "?", Component.translatable("slashclient-hud.invite.toast", m.invite()).getString());
					else toast(f != null ? f.name() : "?", m.text());
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
			// "Join" on a friend's invite in the launcher while this game runs
			case "join" -> join(str(e, "server"));
			case "emote" -> {
				try {
					dev.slash3rss.slashclient.hud.Cosmetics.show(java.util.UUID.fromString(str(e, "uuid")), str(e, "emote"));
				} catch (IllegalArgumentException ignored) {
					// not a uuid: nothing to show it on
				}
			}
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

	// ---------- "join me" invites ----------

	/** The multiplayer server this game is on, or null (singleplayer, menu, LAN). */
	public static String currentServer() {
		Minecraft mc = Minecraft.getInstance();
		var server = mc.getCurrentServer();
		return server == null || mc.isLocalServer() || server.isLan() ? null : server.ip;
	}

	/** Invites a friend to the server this game is on. */
	public static void invite(String friendId) {
		String server = currentServer();
		if (server == null) return;
		JsonObject body = new JsonObject();
		body.addProperty("server", server.toLowerCase(java.util.Locale.ROOT));
		body.addProperty("version", net.minecraft.SharedConstants.getCurrentVersion().name());
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = request("POST", "/v1/invites/" + friendId, body, 8);
				Message m = messageFrom(res.getAsJsonObject("message"));
				List<Message> chat = chats.computeIfAbsent(friendId, k -> new CopyOnWriteArrayList<>());
				if (chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				bump(friendId, 0, m.at());
			} catch (Exception e) {
				toast(Component.translatable("slashclient-hud.friends.notSent").getString(), e.getMessage() == null ? "" : e.getMessage());
			}
		});
	}

	/** An emote to launcher players around (through the launcher, which knows the account). */
	public static void emote(java.util.UUID player, String emote) {
		JsonObject body = new JsonObject();
		body.addProperty("uuid", player.toString());
		body.addProperty("emote", emote);
		Thread.ofVirtual().start(() -> {
			try {
				request("POST", "/v1/mc/emote", body, 5);
			} catch (Exception e) {
				SlashHud.LOG.debug("SlashClient: emote: {}", e.toString());
			}
		});
	}

	/** Leaves the world or server this game is in and joins `address`, as the server list would. */
	public static void join(String address) {
		if (address == null || !address.matches("[\\w.-]{1,253}(:\\d{1,5})?")) return;
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> {
			if (address.equalsIgnoreCase(currentServer())) return;
			if (mc.level != null) dev.slash3rss.slashclient.hud.Compat.leaveWorld(mc, Component.translatable("slashclient-hud.invite.leaving"));
			var parent = new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(new net.minecraft.client.gui.screens.TitleScreen());
			var data = new net.minecraft.client.multiplayer.ServerData(address, address, net.minecraft.client.multiplayer.ServerData.Type.OTHER);
			net.minecraft.client.gui.screens.ConnectScreen.startConnecting(parent, mc, net.minecraft.client.multiplayer.resolver.ServerAddress.parseString(address), data, false, null);
		});
	}

	/** An account in the launcher (no tokens: those come only for the one picked). */
	public record Account(String id, String name, String type, boolean current) {}

	public static List<Account> accounts() throws Exception {
		JsonObject res = request("GET", "/accounts", null, 5);
		List<Account> out = new ArrayList<>();
		for (JsonElement el : res.getAsJsonArray("accounts")) {
			JsonObject o = el.getAsJsonObject();
			out.add(new Account(str(o, "id"), str(o, "name"), str(o, "type"), o.has("current") && o.get("current").getAsBoolean()));
		}
		return out;
	}

	/** The picked account's session from the launcher (a fresh Microsoft token), applied to the game. */
	public static void useAccount(String id) throws Exception {
		JsonObject body = new JsonObject();
		body.addProperty("id", id);
		JsonObject s = request("POST", "/accounts/use", body, 30);
		Minecraft mc = Minecraft.getInstance();
		java.util.UUID uuid = java.util.UUID.fromString(str(s, "uuid"));
		mc.execute(() -> {
			try {
				dev.slash3rss.slashclient.hud.AccountSwitch.apply(mc, str(s, "name"), uuid, str(s, "accessToken"), str(s, "xuid"), "offline".equals(str(s, "type")));
			} catch (Exception e) {
				toast(Component.translatable("slashclient-hud.accounts.failed").getString(), String.valueOf(e.getMessage()));
			}
		});
	}

	/** Asks the launcher to put a picture file on the clipboard; false without a launcher. */
	public static boolean copyImage(String path) {
		if (!available()) return false;
		try {
			JsonObject body = new JsonObject();
			body.addProperty("path", path);
			request("POST", "/clipboard/image", body, 5);
			return true;
		} catch (Exception e) {
			SlashHud.LOG.info("SlashClient: clipboard: {}", e.toString());
			return false;
		}
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
