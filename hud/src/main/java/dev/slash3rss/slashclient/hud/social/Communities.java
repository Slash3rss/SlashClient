package dev.slash3rss.slashclient.hud.social;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Communities ("Społeczności") in the game: big groups of players (up to a thousand) with a chat in
 * channels ("Ogólny", and "Ogłoszenia" where only admins write). The game lists them, reads and
 * writes their chat, edits and deletes its own messages (others' as a moderator), reports a message,
 * and shows the first members; managing a community stays in the launcher, as with clans.
 *
 * The chat is NOT end-to-end encrypted (server-stored; moderators see it), so the launcher passes it
 * through as it is. Events come through the bridge as `communities` (fetch the list again),
 * `community-message`, `community-message-edit`/`-delete` and `community` (invites, kicks…). A new
 * message makes a toast only as the member chose: all, mentions (the default) or none.
 */
public final class Communities {
	private Communities() {}

	public record Channel(String id, String kind, String name, boolean canPost, int unread, int mentions) {
		public boolean announcements() {
			return "announcements".equals(kind);
		}
	}

	/** `logo`: its version (0: none); `notifyMode`: "all", "mentions" or "none"; `mutedUntil`: when we may write again (0: not muted). */
	public record Community(String id, String name, String tag, long logo, String role, String notifyMode, int unread, int mentions, int members, long mutedUntil, long lastMessageAt, List<Channel> channels) {
		public Channel channel(String channelId) {
			for (Channel c : channels) if (c.id().equals(channelId)) return c;
			return null;
		}

		/** The general channel (the first one when there is none such). */
		public Channel general() {
			for (Channel c : channels) if ("general".equals(c.kind())) return c;
			return channels.isEmpty() ? null : channels.get(0);
		}
	}

	/** `author`: the name then; `authorRole`: their role now ("" when not a member any more); `moderated`: deleted by a moderator. */
	public record Message(long id, String community, String channel, String from, String author, String authorRole, String text, long at, long editedAt, boolean deleted, boolean moderated, List<String> mentions) {
		public boolean plainText() {
			return !deleted;
		}

		public boolean mentionsMe() {
			return mentions.contains(Social.myId());
		}
	}

	public record Member(String id, String name, String role, boolean online) {}

	private static volatile List<Community> list = List.of();
	private static final Map<String, List<Message>> chats = new ConcurrentHashMap<>();
	private static final Map<String, Long> editWindows = new ConcurrentHashMap<>();
	private static final Map<String, Boolean> moderators = new ConcurrentHashMap<>();
	private static final Map<String, List<Member>> members = new ConcurrentHashMap<>();
	private static final Map<String, Integer> memberTotals = new ConcurrentHashMap<>();
	/** The channel open in the friends window: its new messages are read at once and make no toast. */
	public static volatile String viewing;

	public static List<Community> list() {
		return list;
	}

	public static Community community(String id) {
		for (Community c : list) if (c.id().equals(id)) return c;
		return null;
	}

	public static List<Message> chat(String channelId) {
		return chats.getOrDefault(channelId, List.of());
	}

	/** The first members (read-only here), and how many there are in all. */
	public static List<Member> members(String communityId) {
		return members.getOrDefault(communityId, List.of());
	}

	public static int memberTotal(String communityId) {
		return memberTotals.getOrDefault(communityId, 0);
	}

	/** The logo, when it has one and it is here; else null. */
	public static ChatImages.Texture logo(Community c) {
		return ClanLogos.community(c.id(), c.logo());
	}

	/** What the badge counts: unread where the member wants everything, mentions where only those. */
	public static int badge(Community c) {
		return "all".equals(c.notifyMode()) ? c.unread() : "mentions".equals(c.notifyMode()) ? c.mentions() : 0;
	}

	private static final List<String> RANKS = List.of("member", "moderator", "admin", "owner");

	static int rank(String role) {
		return Math.max(0, RANKS.indexOf(role));
	}

	// ---------- from the launcher ----------

	private static Community communityFrom(JsonObject o) {
		List<Channel> channels = new ArrayList<>();
		if (o.has("channels") && o.get("channels").isJsonArray()) {
			for (JsonElement el : o.getAsJsonArray("channels")) {
				JsonObject c = el.getAsJsonObject();
				channels.add(new Channel(Social.str(c, "id"), Social.str(c, "kind"), Social.str(c, "name"), Social.bool(c, "canPost"), (int) Social.longOf(c, "unread"), (int) Social.longOf(c, "mentions")));
			}
		}
		return new Community(Social.str(o, "id"), Social.str(o, "name"), Social.str(o, "tag"), Social.longOf(o, "logo"), Social.str(o, "role"), Social.str(o, "notify"),
			(int) Social.longOf(o, "unread"), (int) Social.longOf(o, "mentions"), (int) Social.longOf(o, "members"), Social.longOf(o, "mutedUntil"), Social.longOf(o, "lastMessageAt"), List.copyOf(channels));
	}

	static Message messageFrom(JsonObject o) {
		JsonObject a = o.has("author") && o.get("author").isJsonObject() ? o.getAsJsonObject("author") : new JsonObject();
		List<String> mentions = new ArrayList<>();
		if (o.has("mentions") && o.get("mentions").isJsonArray()) for (JsonElement m : o.getAsJsonArray("mentions")) mentions.add(m.getAsString());
		return new Message(o.get("id").getAsLong(), Social.str(o, "community"), Social.str(o, "channel"), Social.str(o, "from"), Social.str(a, "name"), Social.str(a, "role"),
			Social.str(o, "text"), o.get("at").getAsLong(), Social.longOf(o, "editedAt"), Social.bool(o, "deleted"), Social.bool(o, "moderated"), List.copyOf(mentions));
	}

	/** The list from the server (when the bridge connects and when something changed); an older launcher or server has none. */
	public static void refresh() {
		if (!Social.bridged()) return;
		try {
			JsonObject res = Social.api("GET", "/v1/communities/mine", null);
			List<Community> next = new ArrayList<>();
			for (JsonElement el : res.getAsJsonArray("communities")) next.add(communityFrom(el.getAsJsonObject()));
			sort(next);
			list = List.copyOf(next);
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: communities: {}", e.toString());
		}
	}

	/** The newest conversation first. */
	private static void sort(List<Community> l) {
		l.sort(Comparator.comparingLong(Community::lastMessageAt).reversed());
	}

	static void onEvent(JsonObject e) {
		switch (Social.str(e, "type")) {
			case "communities" -> {
				String id = Social.str(e, "id");
				refresh();
				// taken out, or it is gone: its chats are not ours any more
				Community c = community(id);
				if (!id.isEmpty() && c == null) members.remove(id);
			}
			case "community-message" -> {
				if (!e.has("message") || !e.get("message").isJsonObject()) return;
				Message m = messageFrom(e.getAsJsonObject("message"));
				Community c = community(m.community());
				if (c == null) return;
				List<Message> chat = chats.get(m.channel());
				if (chat != null && chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				boolean mine = m.from().equals(Social.myId());
				boolean open = m.channel().equals(viewing);
				bump(m, !mine && !open);
				if (open && !mine) markRead(c.id(), m.channel());
				else if (!mine && ("all".equals(c.notifyMode()) || "mentions".equals(c.notifyMode()) && m.mentionsMe())) Social.toast(c.name() + " · " + m.author(), m.text(), "m-players");
			}
			case "community-message-edit", "community-message-delete" -> {
				if (e.has("message") && e.get("message").isJsonObject()) replaced(messageFrom(e.getAsJsonObject("message")));
			}
			case "community" -> {
				String key = e.has("invite") ? "invited" : e.has("kicked") ? "kicked" : e.has("banned") ? "banned" : e.has("accepted") ? "accepted" : "";
				if (!key.isEmpty()) {
					JsonObject o = e.getAsJsonObject(e.has("invite") ? "invite" : key);
					Social.toast(Component.translatable("slashclient-hud.communities.title").getString(), Component.translatable("slashclient-hud.communities." + key, Social.str(o, "name")).getString(), "m-players");
				}
				refresh();
			}
			default -> {}
		}
	}

	/** One more message: up the list, unread (and a mention) unless it is open or ours. */
	private static void bump(Message m, boolean unread) {
		List<Community> next = new ArrayList<>();
		for (Community c : list) {
			if (!c.id().equals(m.community())) {
				next.add(c);
				continue;
			}
			int mention = unread && m.mentionsMe() ? 1 : 0;
			List<Channel> channels = c.channels().stream().map(ch -> ch.id().equals(m.channel()) && unread ? new Channel(ch.id(), ch.kind(), ch.name(), ch.canPost(), ch.unread() + 1, ch.mentions() + mention) : ch).toList();
			next.add(new Community(c.id(), c.name(), c.tag(), c.logo(), c.role(), c.notifyMode(), c.unread() + (unread ? 1 : 0), c.mentions() + mention, c.members(), c.mutedUntil(), Math.max(c.lastMessageAt(), m.at()), channels));
		}
		sort(next);
		list = List.copyOf(next);
	}

	static void replaced(Message m) {
		List<Message> chat = chats.get(m.channel());
		if (chat == null) return;
		for (int i = 0; i < chat.size(); i++) if (chat.get(i).id() == m.id()) chat.set(i, m);
	}

	// ---------- actions from the screens (off the render thread) ----------

	/** Opens a channel: its newest messages once (later ones come as events), and it is read. */
	public static void open(String communityId, String channelId) {
		viewing = channelId;
		Thread.ofVirtual().start(() -> {
			try {
				if (!chats.containsKey(channelId)) {
					JsonObject res = Social.api("GET", "/v1/communities/" + communityId + "/channels/" + channelId + "/messages?limit=50", null);
					List<Message> l = new CopyOnWriteArrayList<>();
					for (JsonElement el : res.getAsJsonArray("messages")) l.add(messageFrom(el.getAsJsonObject()));
					editWindows.put(channelId, Social.longOf(res, "editWindowMs"));
					moderators.put(channelId, Social.bool(res, "moderator"));
					chats.put(channelId, l);
				}
				markRead(communityId, channelId);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: community messages: {}", e.toString());
			}
		});
	}

	private static void markRead(String communityId, String channelId) {
		Community c = community(communityId);
		Channel ch = c == null ? null : c.channel(channelId);
		if (ch == null || ch.unread() == 0 && ch.mentions() == 0) return;
		List<Community> next = new ArrayList<>();
		for (Community x : list) {
			if (!x.id().equals(communityId)) {
				next.add(x);
				continue;
			}
			List<Channel> channels = x.channels().stream().map(y -> y.id().equals(channelId) ? new Channel(y.id(), y.kind(), y.name(), y.canPost(), 0, 0) : y).toList();
			next.add(new Community(x.id(), x.name(), x.tag(), x.logo(), x.role(), x.notifyMode(), Math.max(0, x.unread() - ch.unread()), Math.max(0, x.mentions() - ch.mentions()), x.members(), x.mutedUntil(), x.lastMessageAt(), channels));
		}
		list = List.copyOf(next);
		Thread.ofVirtual().start(() -> {
			try {
				Social.api("POST", "/v1/communities/" + communityId + "/channels/" + channelId + "/read", null);
			} catch (Exception ignored) {
				// shows as unread a little longer; harmless
			}
		});
	}

	/** The first page of members, for the read-only view. */
	public static void loadMembers(String communityId) {
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api("GET", "/v1/communities/" + communityId + "/members?limit=50", null);
				List<Member> l = new ArrayList<>();
				for (JsonElement el : res.getAsJsonArray("members")) {
					JsonObject m = el.getAsJsonObject();
					l.add(new Member(Social.str(m, "id"), Social.str(m, "name"), Social.str(m, "role"), Social.bool(m, "online")));
				}
				members.put(communityId, List.copyOf(l));
				memberTotals.put(communityId, (int) Social.longOf(res, "total"));
			} catch (Exception e) {
				SlashHud.LOG.debug("SlashClient: community members: {}", e.toString());
			}
		});
	}

	public static void send(String communityId, String channelId, String text) {
		String t = text.strip();
		if (t.isEmpty()) return;
		JsonObject body = new JsonObject();
		body.addProperty("text", t.length() > 2000 ? t.substring(0, 2000) : t);
		Thread.ofVirtual().start(() -> {
			try {
				Message m = messageFrom(Social.api("POST", "/v1/communities/" + communityId + "/channels/" + channelId + "/messages", body).getAsJsonObject("message"));
				List<Message> chat = chats.computeIfAbsent(channelId, k -> new CopyOnWriteArrayList<>());
				if (chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				bump(m, false);
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.friends.notSent").getString(), Social.errorText(e), "info");
			}
		});
	}

	/** Our own text, within the window the server gave with the history. */
	public static boolean canEdit(Message m) {
		long window = editWindows.getOrDefault(m.channel(), 0L);
		return window > 0 && m.from().equals(Social.myId()) && !m.deleted() && System.currentTimeMillis() - m.at() < window;
	}

	/** Our own any time; others' when our role is above the author's (the server checks it again). */
	public static boolean canDelete(Message m) {
		if (m.deleted() || editWindows.getOrDefault(m.channel(), 0L) <= 0) return false;
		if (m.from().equals(Social.myId())) return true;
		Community c = community(m.community());
		return moderators.getOrDefault(m.channel(), false) && c != null && rank(c.role()) >= 1 && rank(c.role()) > rank(m.authorRole());
	}

	/** Others' messages may be reported (to the community's moderators and the site's admins). */
	public static boolean canReport(Message m) {
		return !m.deleted() && !m.from().equals(Social.myId());
	}

	public static void edit(String communityId, String channelId, long id, String text) {
		String t = text.strip();
		if (t.isEmpty()) return;
		JsonObject body = new JsonObject();
		body.addProperty("text", t.length() > 2000 ? t.substring(0, 2000) : t);
		Thread.ofVirtual().start(() -> {
			try {
				replaced(messageFrom(Social.api("POST", "/v1/communities/" + communityId + "/channels/" + channelId + "/messages/" + id + "/edit", body).getAsJsonObject("message")));
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.message.notEdited").getString(), Social.errorText(e), "info");
			}
		});
	}

	public static void delete(String communityId, String channelId, long id) {
		Thread.ofVirtual().start(() -> {
			try {
				replaced(messageFrom(Social.api("DELETE", "/v1/communities/" + communityId + "/channels/" + channelId + "/messages/" + id, null).getAsJsonObject("message")));
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.message.notDeleted").getString(), Social.errorText(e), "info");
			}
		});
	}

	public static void report(String communityId, String channelId, long id) {
		JsonObject body = new JsonObject();
		body.addProperty("reason", "");
		Thread.ofVirtual().start(() -> {
			try {
				Social.api("POST", "/v1/communities/" + communityId + "/channels/" + channelId + "/messages/" + id + "/report", body);
				Social.toast(Component.translatable("slashclient-hud.communities.title").getString(), Component.translatable("slashclient-hud.communities.reported").getString(), "m-players");
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.communities.notReported").getString(), Social.errorText(e), "info");
			}
		});
	}

	// ---------- the in-game test ----------

	/** Made-up communities, a chat and members (no launcher). */
	public static void sampleForTest(String me, List<Community> communities, Map<String, List<Message>> sampleChats, Map<String, List<Member>> sampleMembers, long windowMs) {
		list = List.copyOf(communities);
		chats.clear();
		for (var e : sampleChats.entrySet()) {
			chats.put(e.getKey(), new CopyOnWriteArrayList<>(e.getValue()));
			editWindows.put(e.getKey(), windowMs);
			moderators.put(e.getKey(), true);
		}
		members.clear();
		members.putAll(sampleMembers);
		for (var e : sampleMembers.entrySet()) memberTotals.put(e.getKey(), communities.stream().filter(c -> c.id().equals(e.getKey())).mapToInt(Community::members).findFirst().orElse(e.getValue().size()));
	}

	/** For the in-game test: an event as the launcher passes it on. */
	public static void eventForTest(JsonObject e) {
		onEvent(e);
	}
}
