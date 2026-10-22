package dev.slash3rss.slashclient.hud.social;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
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

	/** `muted`: kept on the account; their messages come, but no toast (servers before 0.9.21 do not say). */
	public record Friend(String id, String name, String handle, String status, String activity, String server, int unread, long lastMessageAt, boolean muted) {
		public Friend(String id, String name, String handle, String status, String activity, String server, int unread, long lastMessageAt) {
			this(id, name, handle, status, activity, server, unread, lastMessageAt, false);
		}

		Friend with(String status, String activity, String server, int unread, long lastMessageAt) {
			return new Friend(id, name, handle, status, activity, server, unread, lastMessageAt, muted);
		}
	}
	/** A picture in the chat (the launcher decrypts it); `unreadable`: its key was for another launcher. */
	public record Image(String id, int w, int h, boolean unreadable) {}
	/**
	 * `invite` is a server address when the message is a "join me" invite, else empty; `party` the
	 * party it belongs to (several friends invited at once), else empty. `waypoint`: a shared point, or null.
	 * `image`: a picture (a screenshot), or null.
	 */
	/** `editedAt`: when the author changed the text (0: never); `deleted`: taken back, nothing left of it (servers 0.9.23+). */
	public record Message(long id, String from, String to, String text, long at, boolean read, String invite, String inviteVersion, String party, SharedWaypoints.Shared waypoint, Image image, long editedAt, boolean deleted) {
		public Message(long id, String from, String to, String text, long at, boolean read, String invite, String inviteVersion, String party, SharedWaypoints.Shared waypoint, Image image) {
			this(id, from, to, text, at, read, invite, inviteVersion, party, waypoint, image, 0, false);
		}

		public Message(long id, String from, String to, String text, long at, boolean read, String invite, String inviteVersion, String party, SharedWaypoints.Shared waypoint) {
			this(id, from, to, text, at, read, invite, inviteVersion, party, waypoint, null);
		}

		/** Plain text (not a picture, invite or waypoint) that is still there: what may be edited or copied. */
		public boolean plainText() {
			return !deleted && image == null && invite.isEmpty() && waypoint == null;
		}

		public Message(long id, String from, String to, String text, long at, boolean read, String invite, String inviteVersion) {
			this(id, from, to, text, at, read, invite, inviteVersion, "", null, null);
		}
	}

	private static final String URL = System.getProperty("slashclient.bridge", "");
	private static final String KEY = System.getProperty("slashclient.bridgeKey", "");
	// HTTP/1.1: on plain http Java would otherwise try an "h2c" upgrade first
	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(3)).build();
	private static final Gson GSON = new Gson();

	private static volatile boolean signedIn;
	/** The launcher passes on the server's 'cosmetics' events and is connected to the server. */
	private static volatile boolean cosmeticsEvents;
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

	/** For the in-game test: several made-up friends (the first with `chat`), in the list's order. */
	public static void sampleForTest(List<Friend> list, List<Message> chat, String me) {
		sampleForTest(list.get(0), chat, me);
		List<Friend> sorted = new ArrayList<>(list);
		sort(sorted);
		friends = List.copyOf(sorted);
	}

	public static boolean signedIn() {
		return signedIn;
	}

	/**
	 * Whether changes of what other players wear come live (through the launcher): then the HUD asks the
	 * server about players in sight only now and then; otherwise more often.
	 */
	public static boolean liveCosmetics() {
		return bridged() && reachable && signedIn && cosmeticsEvents;
	}

	public static boolean reachable() {
		return reachable;
	}

	public static String myId() {
		return myId;
	}

	public static String myName() {
		return myName;
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
					// group chats and the clan (an older launcher has neither: nothing happens)
					if (signedIn) Groups.refresh();
					// communities (an older launcher or server has none: nothing happens)
					if (signedIn) Communities.refresh();
					// whether we share our position with friends (an older launcher or server: nothing happens)
					if (signedIn) FriendPositions.refresh();
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

	/** The launcher sends screenshots to communities and shows their pictures (0.9.30+). */
	private static volatile boolean communityMedia;

	static boolean communityMedia() {
		return communityMedia;
	}

	private static void refreshState() throws Exception {
		JsonObject s = request("GET", "/state", null, 5);
		signedIn = s.has("signedIn") && s.get("signedIn").getAsBoolean();
		// older launchers do not say which events they pass on, and do not pass these on
		boolean connected = !s.has("connected") || s.get("connected").isJsonNull() || s.get("connected").getAsBoolean();
		boolean passes = false;
		boolean media = false;
		if (s.has("events") && s.get("events").isJsonArray()) for (JsonElement e : s.getAsJsonArray("events")) {
			passes |= "cosmetics".equals(e.getAsString());
			// a launcher that passes on poll results also sends screenshots to communities (0.9.30+)
			media |= "community-poll".equals(e.getAsString());
		}
		communityMedia = media;
		boolean was = cosmeticsEvents && reachable;
		cosmeticsEvents = connected && passes;
		// connected again (launcher or server): changes made meanwhile did not come, so everyone in sight is asked about anew
		if (cosmeticsEvents && !was) dev.slash3rss.slashclient.hud.Cosmetics.missedChanges();
		JsonObject user = s.has("user") && s.get("user").isJsonObject() ? s.getAsJsonObject("user") : null;
		myId = user != null ? str(user, "id") : "";
		myName = user != null ? str(user, "name") : "";
		if (!signedIn) {
			friends = List.of();
			playing.clear();
			FriendStreams.clear();
		}
	}

	private static void refreshFriends() throws Exception {
		JsonObject res = request("GET", "/v1/friends", null, 8);
		List<Friend> list = new ArrayList<>();
		for (JsonElement el : res.getAsJsonArray("friends")) list.add(friendFrom(el.getAsJsonObject()));
		sort(list);
		friends = List.copyOf(list);
		// whoever is online or playing now is not news
		long now = System.currentTimeMillis();
		for (Friend f : list) playing.know(f.id(), f.status(), f.activity(), now);
	}

	/** Online first, then whoever wrote last, then by name. */
	private static void sort(List<Friend> list) {
		list.sort(Comparator.comparing((Friend f) -> "offline".equals(f.status()))
			.thenComparing(Comparator.comparingLong(Friend::lastMessageAt).reversed())
			.thenComparing(f -> f.name().toLowerCase()));
	}

	private static Friend friendFrom(JsonObject o) {
		JsonObject p = o.has("presence") && o.get("presence").isJsonObject() ? o.getAsJsonObject("presence") : new JsonObject();
		lanFrom(str(o, "id"), p);
		// live on Twitch or Kick (servers 0.9.24+): the LIVE badge
		FriendStreams.fromFriend(str(o, "id"), o);
		JsonObject a = p.has("activity") && p.get("activity").isJsonObject() ? p.getAsJsonObject("activity") : null;
		detailFrom(str(o, "id"), a);
		return new Friend(str(o, "id"), str(o, "name"), str(o, "handle"), p.has("status") ? str(p, "status") : "offline",
			a != null ? str(a, "kind") : "", a != null ? str(a, "server") : "",
			o.has("unread") ? o.get("unread").getAsInt() : 0, o.has("lastMessageAt") ? o.get("lastMessageAt").getAsLong() : 0,
			o.has("muted") && o.get("muted").isJsonPrimitive() && o.get("muted").getAsBoolean());
	}

	/** When each invite (by its message's id) runs out; none: it does not (a server before 0.9.25). */
	private static final Map<Long, Long> inviteExpiry = new ConcurrentHashMap<>();

	/** An invite whose time is up: no Join any more. */
	public static boolean inviteExpired(Message m) {
		Long at = inviteExpiry.get(m.id());
		return at != null && System.currentTimeMillis() >= at;
	}

	public static void inviteExpiresForTest(long id, long at) {
		inviteExpiry.put(id, at);
	}

	private static Message messageFrom(JsonObject o) {
		JsonObject inv = o.has("invite") && o.get("invite").isJsonObject() ? o.getAsJsonObject("invite") : null;
		if (inv != null && longOf(inv, "expiresAt") > 0) inviteExpiry.put(o.get("id").getAsLong(), longOf(inv, "expiresAt"));
		JsonObject wp = o.has("waypoint") && o.get("waypoint").isJsonObject() ? o.getAsJsonObject("waypoint") : null;
		Image image = imageFrom(o);
		return new Message(o.get("id").getAsLong(), str(o, "from"), str(o, "to"), str(o, "text"), o.get("at").getAsLong(),
			o.has("readAt") && !o.get("readAt").isJsonNull(), inv == null ? "" : str(inv, "server"), inv == null ? "" : str(inv, "version"),
			inv == null ? "" : str(inv, "party"), wp == null ? null : SharedWaypoints.Shared.from(wp), image, longOf(o, "editedAt"), bool(o, "deleted"));
	}

	static long longOf(JsonObject o, String key) {
		return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsLong() : 0;
	}

	static boolean bool(JsonObject o, String key) {
		return o.has(key) && o.get(key).isJsonPrimitive() && o.get(key).getAsBoolean();
	}

	/** A message's picture (direct or group), as the launcher opened it; null when it has none. */
	static Image imageFrom(JsonObject o) {
		JsonObject img = o.has("image") && o.get("image").isJsonObject() ? o.getAsJsonObject("image") : null;
		return img == null || str(img, "id").isEmpty() ? null : new Image(str(img, "id"), num(img, "w"), num(img, "h"), img.has("unreadable") && img.get("unreadable").getAsBoolean());
	}

	private static int num(JsonObject o, String key) {
		return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsInt() : 0;
	}

	static String str(JsonObject o, String key) {
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
	}

	private static void handle(JsonObject e) throws Exception {
		switch (str(e, "type")) {
			case "message" -> {
				Message m = messageFrom(e.getAsJsonObject("message"));
				// who we are not known yet (the game just started): ask first, or our own message would look like someone else's
				if (myId.isEmpty()) {
					try {
						refreshState();
					} catch (Exception ex) {
						SlashHud.LOG.debug("SlashClient: friends: {}", ex.toString());
					}
				}
				String other = m.from().equals(myId) ? m.to() : m.from();
				List<Message> chat = chats.get(other);
				if (chat != null && chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				if (m.from().equals(myId)) return;
				typingUntil.remove(other);
				// a shared waypoint goes into the waypoints (or waits) even with the chat open
				if (m.waypoint() != null && other.equals(viewing)) {
					Friend f = friend(other);
					SharedWaypoints.received(m, f != null ? f.name() : "?");
				}
				if (other.equals(viewing)) markRead(other);
				else {
					// a friend this game does not know yet (the list is from before they were added, or not loaded): the list anew
					if (friend(other) == null) {
						try {
							refreshFriends();
						} catch (Exception ex) {
							SlashHud.LOG.debug("SlashClient: friends: {}", ex.toString());
						}
					}
					bump(other, 1, m.at());
					Friend f = friend(other);
					// muted: the message waits on the list (a waypoint among the received ones), without a toast
					if (m.waypoint() != null) SharedWaypoints.received(m, f != null ? f.name() : "?", f != null && f.muted());
					else if (f != null && f.muted()) return;
					else if (m.image() != null) toast(f != null ? f.name() : "?", Component.translatable("slashclient-hud.picture.toast").getString(), null);
					else if (!m.party().isEmpty()) toast(f != null ? f.name() : "?", Component.translatable("slashclient-hud.party.toast", m.invite()).getString(), null);
					else if (!m.invite().isEmpty()) toast(f != null ? f.name() : "?", Component.translatable("slashclient-hud.invite.toast", m.invite()).getString(), null);
					else toast(f != null ? f.name() : "?", m.text(), null);
				}
			}
			case "presence" -> {
				String id = str(e, "id");
				JsonObject p = e.getAsJsonObject("presence");
				lanFrom(id, p);
				JsonObject a = p.has("activity") && p.get("activity").isJsonObject() ? p.getAsJsonObject("activity") : null;
				String status = str(p, "status"), kind = a != null ? str(a, "kind") : "", server = a != null ? str(a, "server") : "";
				detailFrom(id, "offline".equals(status) ? null : a);
				List<Friend> list = new ArrayList<>();
				for (Friend f : friends) list.add(f.id().equals(id) ? f.with(status, kind, server, f.unread(), f.lastMessageAt()) : f);
				sort(list);
				friends = List.copyOf(list);
				Friend f = friend(id);
				FriendActivity.News news = playing.update(id, status, kind, server, System.currentTimeMillis());
				if (news != null && f != null && !f.muted() && dev.slash3rss.slashclient.hud.SlashHud.config != null && dev.slash3rss.slashclient.hud.SlashHud.config.friendPlayingToasts) playingToast(f, news);
			}
			// a friend's position on the same server (the minimap), or that they stopped sharing it
			case "friend-position" -> FriendPositions.onEvent(e);
			case "party" -> {
				if (e.has("party") && e.get("party").isJsonObject()) Party.onEvent(e.getAsJsonObject("party"));
			}
			// a friend went live on Twitch or Kick (a toast when the server says it is news), changed the title, or ended
			case "stream" -> FriendStreams.onEvent(e);
			// edited or deleted (here, in the launcher or another game): only the new version, no toast
			case "message-edit", "message-delete" -> {
				if (e.has("message") && e.get("message").isJsonObject()) replaced(messageFrom(e.getAsJsonObject("message")));
			}
			// group chats and the clan
			case "groups", "group-message", "clan", "group-message-edit", "group-message-delete" -> Groups.onEvent(e);
			// communities: the list, their chat, and news (invited, accepted, kicked…)
			case "communities", "community-message", "community-message-edit", "community-message-delete", "community", "community-reaction", "community-pin", "community-poll" -> Communities.onEvent(e);
			case "typing" -> typingUntil.put(str(e, "from"), System.currentTimeMillis() + 6_000);
			// "Join" on a friend's invite in the launcher while this game runs
			case "join" -> join(str(e, "server"));
			// someone in sight changed what they wear (in the launcher, on the website or in their game's menu)
			case "cosmetics" -> dev.slash3rss.slashclient.hud.Cosmetics.live(e);
			case "emote" -> {
				try {
					dev.slash3rss.slashclient.hud.Cosmetics.show(java.util.UUID.fromString(str(e, "uuid")), str(e, "emote"));
				} catch (IllegalArgumentException ignored) {
					// not a uuid: nothing to show it on
				}
			}
			// someone with SlashClient sprayed on a block where we may see it
			case "spray" -> dev.slash3rss.slashclient.hud.Sprays.received(e);
			// a SlashClient achievement unlocked (play streak, hours…): "Achievement unlocked" and its name, with the reward
			case "achievement" -> {
				// "quiet": one of several unlocked at once; the 'achievements-summary' after them makes the toast
				if (e.has("achievement") && e.get("achievement").isJsonObject() && !quiet(e) && !quiet(e.getAsJsonObject("achievement")))
					achievement(e.getAsJsonObject("achievement"));
			}
			// several at once (e.g. earned before the server counted them): one toast for all, with the Sparks they paid
			case "achievements-summary" -> achievementsSummary(num(e, "count"), num(e, "sparks"));
			// a daily or weekly challenge completed (server 0.9.36+): its name and the Sparks it paid
			case "challenge" -> {
				if (e.has("challenge") && e.get("challenge").isJsonObject()) challenge(e.getAsJsonObject("challenge"));
			}
			// all of a day's or a week's challenges done: the bonus
			case "challenges-bonus" -> challengesBonus("weekly".equals(str(e, "period")), num(e, "sparks"));
			// the Sparks balance changed (an achievement, a purchase, an admin): the cosmetics menu shows it
			case "wallet" -> dev.slash3rss.slashclient.hud.CosmeticsScreen.walletChanged(num(e, "balance"));
			case "friends" -> {
				refreshFriends();
				if (e.has("request") && e.get("request").isJsonObject()) toast(str(e.getAsJsonObject("request"), "name"), Component.translatable("slashclient-hud.friends.invite").getString(), null);
			}
			case "state" -> {
				refreshState();
				if (signedIn) refreshFriends();
				if (signedIn) Groups.refresh();
				if (signedIn) Communities.refresh();
			}
			default -> {}
		}
	}

	/** For the in-game test: an event as if it came from the launcher. */
	public static void eventForTest(JsonObject e) throws Exception {
		handle(e);
	}

	private static void bump(String friendId, int unread, long at) {
		List<Friend> list = new ArrayList<>();
		for (Friend f : friends) {
			list.add(f.id().equals(friendId) ? f.with(f.status(), f.activity(), f.server(), unread == 0 ? 0 : f.unread() + unread, Math.max(f.lastMessageAt(), at)) : f);
		}
		sort(list);
		friends = List.copyOf(list);
	}

	/** "Achievement unlocked" with its name in the game's language, and the cosmetic it gives (the server's 'achievement' event). */
	public static void achievement(JsonObject a) {
		boolean polish = Minecraft.getInstance().options.languageCode.startsWith("pl");
		String name = str(a, polish ? "name" : "nameEn");
		JsonObject reward = a.has("reward") && a.get("reward").isJsonObject() ? a.getAsJsonObject("reward") : null;
		// a cape says so; another item (the admin may pick any) is "a new cosmetic"
		String text = reward == null ? name : Component.translatable("cape".equals(str(reward, "slot")) || str(reward, "slot").isEmpty()
			? "slashclient-hud.achievement.reward" : "slashclient-hud.achievement.rewardItem", name).getString();
		// the Sparks it paid on a line of their own (servers before 0.9.22 pay none)
		int sparks = num(a, "sparks");
		toast(Component.translatable("slashclient-hud.achievement.unlocked").getString(), text, "m-advancements",
			sparks > 0 ? "+" + dev.slash3rss.slashclient.hud.Sparks.format(sparks) : null);
	}

	/** "Daily challenge completed", its name in the game's language and the Sparks it paid (the server's 'challenge' event). */
	public static void challenge(JsonObject c) {
		boolean polish = Minecraft.getInstance().options.languageCode.startsWith("pl");
		String name = str(c, polish ? "name" : "nameEn");
		if (name.isEmpty()) name = str(c, "name");
		int sparks = num(c, "sparks");
		toast(Component.translatable("weekly".equals(str(c, "period")) ? "slashclient-hud.challenge.doneWeekly" : "slashclient-hud.challenge.done").getString(), name, "m-advancements",
			sparks > 0 ? "+" + dev.slash3rss.slashclient.hud.Sparks.format(sparks) : null);
	}

	/** "All of today's challenges done!" and the bonus (the server's 'challenges-bonus' event). */
	public static void challengesBonus(boolean weekly, int sparks) {
		toast(Component.translatable(weekly ? "slashclient-hud.challenge.bonusWeekly" : "slashclient-hud.challenge.bonus").getString(),
			Component.translatable("slashclient-hud.challenge.bonusHint").getString(), "m-advancements",
			sparks > 0 ? "+" + dev.slash3rss.slashclient.hud.Sparks.format(sparks) : null);
	}

	/** Marked "quiet": shown by the summary that follows (on the event or on the achievement in it). */
	private static boolean quiet(JsonObject o) {
		return o.has("quiet") && o.get("quiet").isJsonPrimitive() && o.get("quiet").getAsBoolean();
	}

	/** "5 achievements unlocked", where to spend them, and "+320 Sparks" (the server's 'achievements-summary' event). */
	public static void achievementsSummary(int count, int sparks) {
		toast(Component.translatable("slashclient-hud.achievement.summary", count).getString(),
			Component.translatable("slashclient-hud.achievement.summaryHint", dev.slash3rss.slashclient.hud.Sparks.name()).getString(), "m-advancements",
			sparks > 0 ? "+" + dev.slash3rss.slashclient.hud.Sparks.format(sparks) : null);
	}

	// ---------- friends starting to play, muted friends ----------

	/** Who started playing: toasts only for news, not for reconnects. */
	private static final FriendActivity playing = new FriendActivity();

	/** "Ala is playing on skyup.pl" / "Ala is online now". */
	private static void playingToast(Friend f, FriendActivity.News news) {
		String text = !news.playing() ? Component.translatable("slashclient-hud.playing.online").getString()
			: news.server().isEmpty() ? Component.translatable("slashclient-hud.playing.world").getString()
			: Component.translatable("slashclient-hud.playing.server", news.server()).getString();
		toast(f.name(), text, null);
	}

	/** For the in-game test: a status as if it came from the launcher, with the toast it makes. */
	public static FriendActivity.News presenceForTest(String id, String status, String kind, String server, long now) {
		List<Friend> list = new ArrayList<>();
		for (Friend f : friends) list.add(f.id().equals(id) ? f.with(status, kind, server, f.unread(), f.lastMessageAt()) : f);
		friends = List.copyOf(list);
		Friend f = friend(id);
		FriendActivity.News news = playing.update(id, status, kind, server, now);
		if (news != null && f != null && !f.muted() && dev.slash3rss.slashclient.hud.SlashHud.config.friendPlayingToasts) playingToast(f, news);
		return news;
	}

	/** For the in-game test: the friends list as just loaded. */
	public static void knowForTest(long now) {
		for (Friend f : friends) playing.know(f.id(), f.status(), f.activity(), now);
	}

	/** Mutes (or unmutes) a friend, on the account: the launcher and other games follow. */
	public static void mute(String friendId, boolean muted) {
		// at once on screen; the server's answer (and its 'friends' event) confirms it
		setMuted(friendId, muted);
		if (!bridged()) return;
		JsonObject body = new JsonObject();
		body.addProperty("muted", muted);
		Thread.ofVirtual().start(() -> {
			try {
				request("POST", "/v1/friends/" + friendId + "/mute", body, 8);
				refreshFriends();
			} catch (Exception e) {
				setMuted(friendId, !muted);
				toast(Component.translatable("slashclient-hud.mute.failed").getString(), e.getMessage() == null ? "" : e.getMessage(), "info");
			}
		});
	}

	private static void setMuted(String friendId, boolean muted) {
		List<Friend> list = new ArrayList<>();
		for (Friend f : friends) list.add(f.id().equals(friendId) ? new Friend(f.id(), f.name(), f.handle(), f.status(), f.activity(), f.server(), f.unread(), f.lastMessageAt(), muted) : f);
		friends = List.copyOf(list);
	}

	// ---------- pictures in the chat ----------

	/**
	 * Sends a screenshot to a friend. The launcher checks it is one of a profile's screenshots,
	 * encrypts it and sends it; the message shows when the server confirms it.
	 */
	public static void sendImage(String friendId, java.io.File png, Runnable sent) {
		sendImage(friendId, null, png, sent);
	}

	/** The same to a group (or the clan's) chat: the launcher encrypts it for the members. */
	public static void sendGroupImage(String groupId, java.io.File png) {
		sendImage(null, groupId, png, null);
	}

	private static void sendImage(String friendId, String groupId, java.io.File png, Runnable sent) {
		JsonObject body = new JsonObject();
		if (groupId != null) body.addProperty("group", groupId);
		else body.addProperty("friend", friendId);
		body.addProperty("path", png.getAbsolutePath());
		Thread.ofVirtual().start(() -> {
			try {
				if (!bridged()) throw new IllegalStateException("no launcher");
				JsonObject res = request("POST", "/chat/image", body, 60);
				if (groupId != null) {
					Groups.added(Groups.messageFrom(res.getAsJsonObject("message")));
					return;
				}
				Message m = messageFrom(res.getAsJsonObject("message"));
				List<Message> chat = chats.computeIfAbsent(friendId, k -> new CopyOnWriteArrayList<>());
				if (chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				bump(friendId, 0, m.at());
				if (sent != null) Minecraft.getInstance().execute(sent);
			} catch (Exception e) {
				String msg = e.getMessage() == null ? "" : e.getMessage();
				String key = msg.contains("no_keys") ? "slashclient-hud.picture.noKeys" : msg.contains("image_quota") ? "slashclient-hud.picture.quota"
					: msg.contains("too_large") ? "slashclient-hud.picture.tooLarge" : "slashclient-hud.picture.failed";
				// too many in a row: how long to wait
				toast(Component.translatable("slashclient-hud.picture.notSent").getString(), msg.contains("slow_down") ? errorText(e) : Component.translatable(key).getString(), "info");
			}
		});
	}

	/** A picture from the chat as PNG bytes (the launcher downloads and decrypts it); blocks. */
	static byte[] imageBytes(String imageId) {
		if (!bridged()) throw new IllegalStateException("no launcher");
		try {
			HttpRequest req = HttpRequest.newBuilder(URI.create(URL + "/chat/image/" + imageId))
				.timeout(Duration.ofSeconds(30)).header("Authorization", "Bearer " + KEY).GET().build();
			HttpResponse<byte[]> res = HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
			if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode());
			return res.body();
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(e);
		} catch (java.io.IOException e) {
			throw new IllegalStateException(e);
		}
	}

	/** A call to the launcher's own bridge (not the server's API), for the other social classes; blocks. */
	static JsonObject call(String method, String path, JsonObject body, int timeoutSec) throws Exception {
		return request(method, path, body, timeoutSec);
	}

	/** A picture from a community's chat as PNG bytes (the launcher fetches it; not encrypted); blocks. */
	static byte[] communityImageBytes(String communityId, String imageId) {
		if (!bridged() || !communityId.matches("[\\w-]{1,32}") || !imageId.matches("[\\w-]{22}")) throw new IllegalStateException("no launcher");
		try {
			HttpRequest req = HttpRequest.newBuilder(URI.create(URL + "/community/image/" + communityId + "/" + imageId))
				.timeout(Duration.ofSeconds(30)).header("Authorization", "Bearer " + KEY).GET().build();
			HttpResponse<byte[]> res = HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
			if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode());
			return res.body();
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(e);
		} catch (java.io.IOException e) {
			throw new IllegalStateException(e);
		}
	}

	/** A clan's logo as PNG bytes (the launcher fetches and keeps it by version); blocks. */
	static byte[] clanLogoBytes(String clanId, long version) {
		return logoBytes("clan", clanId, version);
	}

	/** A clan's ("clan") or a community's ("community") logo as PNG bytes; blocks. */
	static byte[] logoBytes(String kind, String id, long version) {
		if (!bridged() || !id.matches("[\\w-]{1,32}")) throw new IllegalStateException("no launcher");
		try {
			HttpRequest req = HttpRequest.newBuilder(URI.create(URL + "/" + kind + "/logo/" + id + "?v=" + version))
				.timeout(Duration.ofSeconds(15)).header("Authorization", "Bearer " + KEY).GET().build();
			HttpResponse<byte[]> res = HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
			if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode());
			return res.body();
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(e);
		} catch (java.io.IOException e) {
			throw new IllegalStateException(e);
		}
	}

	/** How many toasts were shown (for the in-game test). */
	private static volatile int toasts;

	public static int toastsForTest() {
		return toasts;
	}

	/** In SlashClient's own look; `icon` instead of the initial when it is not from a person. */
	public static void toast(String title, String text, String icon) {
		toast(title, text, icon, null);
	}

	/** With a third line in gold for Sparks paid (null: none). */
	static void toast(String title, String text, String icon, String sparks) {
		toasts++;
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> dev.slash3rss.slashclient.hud.Compat.toasts(mc).addToast(new FriendToast(title, text, icon, sparks)));
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
					// how long our messages may be edited (servers before 0.9.23 say nothing: no editing or deleting)
					editWindowMs = longOf(res, "editWindowMs");
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
				toast(Component.translatable("slashclient-hud.friends.notSent").getString(), errorText(e), "info");
			}
		});
	}

	// ---------- editing and deleting messages (servers 0.9.23+) ----------

	/** How long our messages may be edited, from the server with the history (0: an older server, no editing or deleting). */
	private static volatile long editWindowMs;

	public static long editWindowMs() {
		return editWindowMs;
	}

	/** Our own plain text, within the window. */
	public static boolean canEdit(Message m) {
		return editWindowMs > 0 && m.from().equals(myId) && m.plainText() && System.currentTimeMillis() - m.at() < editWindowMs;
	}

	/** Our own, any time (in direct messages nobody else's). */
	public static boolean canDelete(Message m) {
		return editWindowMs > 0 && m.from().equals(myId) && !m.deleted();
	}

	/** A message's new version (edited or deleted) in its conversation. */
	static void replaced(Message m) {
		String other = m.from().equals(myId) ? m.to() : m.from();
		List<Message> chat = chats.get(other);
		if (chat == null) return;
		for (int i = 0; i < chat.size(); i++) {
			Message old = chat.get(i);
			// the server's edit does not repeat the picture; a deleted message has none any more
			if (old.id() == m.id()) chat.set(i, !m.deleted() && m.image() == null && old.image() != null
				? new Message(m.id(), m.from(), m.to(), m.text(), m.at(), m.read(), m.invite(), m.inviteVersion(), m.party(), m.waypoint(), old.image(), m.editedAt(), false) : m);
		}
	}

	/** The new text of our message; the launcher encrypts it like a new one. */
	public static void edit(String friendId, long id, String text) {
		String t = text.strip();
		if (t.isEmpty()) return;
		JsonObject body = new JsonObject();
		body.addProperty("text", t.length() > 2000 ? t.substring(0, 2000) : t);
		Thread.ofVirtual().start(() -> {
			try {
				replaced(messageFrom(request("POST", "/v1/messages/" + friendId + "/" + id + "/edit", body, 8).getAsJsonObject("message")));
			} catch (Exception e) {
				toast(Component.translatable("slashclient-hud.message.notEdited").getString(), errorText(e), "info");
			}
		});
	}

	/** Takes our message back, for both of us. */
	public static void delete(String friendId, long id) {
		Thread.ofVirtual().start(() -> {
			try {
				replaced(messageFrom(request("DELETE", "/v1/messages/" + friendId + "/" + id, null, 8).getAsJsonObject("message")));
			} catch (Exception e) {
				toast(Component.translatable("slashclient-hud.message.notDeleted").getString(), errorText(e), "info");
			}
		});
	}

	/** For the in-game test: how long messages may be edited, as a server would say. */
	public static void editWindowForTest(long ms) {
		editWindowMs = ms;
	}

	/**
	 * What went wrong, in the game's language where we know the server's code: too many messages in a
	 * row ("slow_down:5", the seconds to wait), an edit too late or not ours; else the launcher's text.
	 */
	public static String errorText(Exception e) {
		String msg = e.getMessage() == null ? "" : e.getMessage();
		java.util.regex.Matcher slow = java.util.regex.Pattern.compile("slow_down(?::(\\d+))?").matcher(msg);
		if (slow.find()) return Component.translatable("slashclient-hud.message.slowDown", slow.group(1) == null ? "5" : slow.group(1)).getString();
		// a community channel's slow mode (server 0.9.27+): "slow_mode:30"
		java.util.regex.Matcher slowMode = java.util.regex.Pattern.compile("slow_mode(?::(\\d+))?").matcher(msg);
		if (slowMode.find()) return Component.translatable("slashclient-hud.communities.slowMode", slowMode.group(1) == null ? "?" : slowMode.group(1)).getString();
		if (msg.contains("community_muted")) return Component.translatable("slashclient-hud.communities.mutedShort").getString();

		for (String code : List.of("edit_expired", "not_editable", "not_author", "not_allowed")) {
			if (msg.contains(code)) return Component.translatable("slashclient-hud.message." + code).getString();
		}
		return msg;
	}

	// ---------- worlds opened to LAN, for friends anywhere ----------

	/** Friends whose world is open to LAN (their presence says "lan"). */
	private static final java.util.Set<String> lanOpen = ConcurrentHashMap.newKeySet();
	/** The LAN port this game told the launcher, or -1. */
	private static int lanPort = -1;

	private static void lanFrom(String id, JsonObject presence) {
		if (presence.has("lan") && presence.get("lan").getAsBoolean()) lanOpen.add(id);
		else lanOpen.remove(id);
	}

	/** The friend's world is open: they can be joined from the friends list. */
	public static boolean lanOpen(String friendId) {
		return lanOpen.contains(friendId);
	}

	/**
	 * Each second: is this game's world open to LAN ("Open to LAN" in the pause menu)? The
	 * launcher is told the port, and friends can join through SlashClient from anywhere.
	 */
	public static void watchLan(Minecraft mc) {
		if (!bridged()) return;
		var server = mc.getSingleplayerServer();
		int port = server != null && server.isPublished() ? server.getPort() : -1;
		if (port == lanPort) return;
		boolean opened = port > 0 && lanPort <= 0;
		lanPort = port;
		JsonObject body = new JsonObject();
		if (port > 0) body.addProperty("port", port);
		else body.add("port", com.google.gson.JsonNull.INSTANCE);
		Thread.ofVirtual().start(() -> {
			try {
				request("POST", "/lan/host", body, 5);
				if (opened && signedIn) toast(Component.translatable("slashclient-hud.lan.open").getString(), Component.translatable("slashclient-hud.lan.openHint").getString(), "world");
			} catch (Exception e) {
				SlashHud.LOG.info("SlashClient: LAN for friends: {}", e.toString());
			}
		});
	}

	/** Joins a friend's LAN world: the launcher opens a way there on this computer. */
	public static void joinLan(String friendId) {
		JsonObject body = new JsonObject();
		body.addProperty("host", friendId);
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = request("POST", "/lan/join", body, 10);
				join("127.0.0.1:" + res.get("port").getAsInt());
			} catch (Exception e) {
				toast(Component.translatable("slashclient-hud.lan.failed").getString(), e.getMessage() == null ? "" : e.getMessage(), "info");
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
				toast(Component.translatable("slashclient-hud.friends.notSent").getString(), errorText(e), "info");
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

	/** A spray on a block, to launcher players around (through the launcher, which knows the account). */
	public static void spray(java.util.UUID player, String spray, String server, String dimension, int x, int y, int z, String face, int rot) {
		JsonObject body = new JsonObject();
		body.addProperty("uuid", player.toString());
		body.addProperty("spray", spray);
		body.addProperty("server", server);
		body.addProperty("dimension", dimension);
		body.addProperty("x", x);
		body.addProperty("y", y);
		body.addProperty("z", z);
		body.addProperty("face", face);
		body.addProperty("rot", rot);
		Thread.ofVirtual().start(() -> {
			try {
				request("POST", "/v1/mc/spray", body, 5);
			} catch (Exception e) {
				SlashHud.LOG.debug("SlashClient: spray: {}", e.toString());
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
			//#if MC >= 1.20.2
			net.minecraft.client.gui.screens.ConnectScreen.startConnecting(parent, mc, net.minecraft.client.multiplayer.resolver.ServerAddress.parseString(address), data, false, null);
			//#else
			//$ net.minecraft.client.gui.screens.ConnectScreen.startConnecting(parent, mc, net.minecraft.client.multiplayer.resolver.ServerAddress.parseString(address), data, false);
			//#endif
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
				toast(Component.translatable("slashclient-hud.accounts.failed").getString(), String.valueOf(e.getMessage()), "info");
			}
		});
	}

	/** Asks the launcher to put a picture file on the clipboard; false without a launcher. */
	public static boolean copyImage(String path) {
		// only a real launcher can (the screenshot tests' made-up friends have no address to ask)
		if (!bridged()) return false;
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

	// ---------- statuses from servers' tab lists (TabStatus) ----------

	/** Friend id → {server's name or address, status} ("SkyUp.pl", "S3 (Wyspy)"), from servers 0.9.25+. */
	private static final Map<String, String[]> details = new ConcurrentHashMap<>();

	private static void detailFrom(String id, JsonObject activity) {
		String detail = activity == null ? "" : str(activity, "detail"), server = activity == null ? "" : str(activity, "server");
		if (detail.isEmpty() || server.isEmpty() || !"server".equals(str(activity, "kind"))) details.remove(id);
		else {
			String name = str(activity, "serverName");
			details.put(id, new String[] {name.isEmpty() ? server : name, detail});
		}
	}

	/** The tab list's status on this server, to the launcher (for friends and Discord); blocks. */
	public static void sendStatus(JsonObject body) throws Exception {
		if (!bridged()) return;
		request("POST", "/status", body, 5);
	}

	/** For the in-game test: a friend on a server with a status from its tab list. */
	public static void detailForTest(String friendId, String serverName, String detail) {
		details.put(friendId, new String[] {serverName, detail});
	}

	/** The friend's activity in a few words: "on mc.example.com", "in singleplayer"… */
	public static Component activity(Friend f) {
		if ("offline".equals(f.status())) return Component.translatable("slashclient-hud.friends.offline");
		if (lanOpen(f.id())) return Component.translatable("slashclient-hud.lan.friend");
		String[] detail = "server".equals(f.activity()) ? details.get(f.id()) : null;
		if (detail != null) return Component.translatable("slashclient-hud.friends.onServerDetail", detail[0], detail[1]);
		return switch (f.activity()) {
			case "server" -> f.server().isEmpty() ? Component.translatable("slashclient-hud.friends.onServer") : Component.translatable("slashclient-hud.friends.onServerName", f.server());
			case "singleplayer" -> Component.translatable("slashclient-hud.friends.singleplayer");
			case "menu" -> Component.translatable("slashclient-hud.friends.menu");
			default -> Component.translatable("slashclient-hud.friends.launcher");
		};
	}
}
