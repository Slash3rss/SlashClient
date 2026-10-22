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
 *
 * Server 0.9.27+ (an older one sends none of it): reactions under a message (counts; the six quick
 * ones toggled from the message's menu or by clicking a count), the quote of the message a reply
 * answers, pinned messages marked, a channel's slow mode (a countdown above the field) and the
 * timeout ("Wyciszony do …"); `community-reaction` and `community-pin` keep them current.
 *
 * Server 0.9.30+: pictures (not encrypted: the launcher fetches the JPEG and hands over a PNG) and
 * polls, kept beside the messages by id (`image`, `poll`); a screenshot is sent from the picker, a
 * vote by clicking an answer, and `community-poll` moves the results live. Closing a poll and
 * making one stay in the launcher.
 *
 * Server 0.9.30+: own channels (`kind` "custom", by their name; one we may not read never comes) and
 * custom roles: an author's or a member's `customRole` { name, color } shows by their nick, in its
 * colour. Managing channels and roles stays in the launcher.
 */
public final class Communities {
	private Communities() {}

	/** `slowMode`: seconds between our messages there (0: off; moderators and up are not held back). */
	public record Channel(String id, String kind, String name, boolean canPost, int unread, int mentions, int slowMode) {
		public Channel(String id, String kind, String name, boolean canPost, int unread, int mentions) {
			this(id, kind, name, canPost, unread, mentions, 0);
		}

		public boolean announcements() {
			return "announcements".equals(kind);
		}
	}

	/** One emoji under a message: how many, and whether we are one of them. */
	public record Reaction(String emoji, int count, boolean me) {}

	/** The quick reactions (the server's first six); the game offers only these. */
	public static final List<String> QUICK = List.of("👍", "❤️", "😂", "😮", "😢", "🔥");

	/** An emoji as the game's font can draw it: without the colour-emoji selector (U+FE0F), which it has no glyph for. */
	public static String glyph(String emoji) {
		return emoji.replace("️", "");
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

	/**
	 * `author`: the name then; `authorRole`: their role now ("" when not a member any more); `moderated`: deleted by a moderator;
	 * `replyId` (0: none), `replyAuthor` and `replyText`: the message this one answers (`replyGone` when it was deleted).
	 */
	public record Message(long id, String community, String channel, String from, String author, String authorRole, String text, long at, long editedAt, boolean deleted, boolean moderated, List<String> mentions,
		long replyId, String replyAuthor, String replyText, boolean replyGone, List<Reaction> reactions, boolean pinned) {
		public Message(long id, String community, String channel, String from, String author, String authorRole, String text, long at, long editedAt, boolean deleted, boolean moderated, List<String> mentions) {
			this(id, community, channel, from, author, authorRole, text, at, editedAt, deleted, moderated, mentions, 0, "", "", false, List.of(), false);
		}

		Message withReactions(List<Reaction> next) {
			return new Message(id, community, channel, from, author, authorRole, text, at, editedAt, deleted, moderated, mentions, replyId, replyAuthor, replyText, replyGone, List.copyOf(next), pinned);
		}

		Message withPinned(boolean p) {
			return new Message(id, community, channel, from, author, authorRole, text, at, editedAt, deleted, moderated, mentions, replyId, replyAuthor, replyText, replyGone, reactions, p);
		}

		Message withReplyGone() {
			return new Message(id, community, channel, from, author, authorRole, text, at, editedAt, deleted, moderated, mentions, replyId, "", "", true, reactions, pinned);
		}

		public boolean plainText() {
			return !deleted;
		}

		public boolean mentionsMe() {
			return mentions.contains(Social.myId());
		}
	}

	public record Member(String id, String name, String role, boolean online) {}

	/** A custom role by a nick (server 0.9.30+): its name and colour (0xRRGGBB). */
	public record RoleTag(String name, int color) {}

	/** The custom role of each member we have seen ("community/user"), from their messages and the members' list. */
	private static final Map<String, RoleTag> customRoles = new ConcurrentHashMap<>();

	/** Their custom role in that community, or null. */
	public static RoleTag customRole(String communityId, String userId) {
		return customRoles.get(communityId + "/" + userId);
	}

	/** What the server says of someone's custom role now (an author or a member): kept, or gone when it sends none. */
	static void noteRole(String communityId, String userId, JsonObject holder) {
		if (communityId.isEmpty() || userId.isEmpty()) return;
		JsonObject r = holder.has("customRole") && holder.get("customRole").isJsonObject() ? holder.getAsJsonObject("customRole") : null;
		String key = communityId + "/" + userId;
		if (r == null || Social.str(r, "name").isEmpty()) {
			customRoles.remove(key);
			return;
		}
		int color = 0x94A3B8;
		String hex = Social.str(r, "color");
		if (hex.matches("#[0-9a-fA-F]{6}")) color = Integer.parseInt(hex.substring(1), 16);
		customRoles.put(key, new RoleTag(Social.str(r, "name"), color));
	}

	private static volatile List<Community> list = List.of();
	private static final Map<String, List<Message>> chats = new ConcurrentHashMap<>();
	private static final Map<String, Long> editWindows = new ConcurrentHashMap<>();
	private static final Map<String, Boolean> moderators = new ConcurrentHashMap<>();
	private static final Map<String, List<Member>> members = new ConcurrentHashMap<>();
	private static final Map<String, Integer> memberTotals = new ConcurrentHashMap<>();
	/** When slow mode lets us write again in a channel (from the history, a message sent, or a refusal). */
	private static final Map<String, Long> nextPostAt = new ConcurrentHashMap<>();
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
				channels.add(new Channel(Social.str(c, "id"), Social.str(c, "kind"), Social.str(c, "name"), Social.bool(c, "canPost"), (int) Social.longOf(c, "unread"), (int) Social.longOf(c, "mentions"), (int) Social.longOf(c, "slowMode")));
			}
		}
		return new Community(Social.str(o, "id"), Social.str(o, "name"), Social.str(o, "tag"), Social.longOf(o, "logo"), Social.str(o, "role"), Social.str(o, "notify"),
			(int) Social.longOf(o, "unread"), (int) Social.longOf(o, "mentions"), (int) Social.longOf(o, "members"), Social.longOf(o, "mutedUntil"), Social.longOf(o, "lastMessageAt"), List.copyOf(channels));
	}

	static Message messageFrom(JsonObject o) {
		extrasFrom(o, o.get("id").getAsLong());
		JsonObject a = o.has("author") && o.get("author").isJsonObject() ? o.getAsJsonObject("author") : new JsonObject();
		List<String> mentions = new ArrayList<>();
		if (o.has("mentions") && o.get("mentions").isJsonArray()) for (JsonElement m : o.getAsJsonArray("mentions")) mentions.add(m.getAsString());
		// the answered message's quote, reactions and the pin (server 0.9.27+)
		JsonObject q = o.has("replyTo") && o.get("replyTo").isJsonObject() ? o.getAsJsonObject("replyTo") : null;
		JsonObject qa = q != null && q.has("author") && q.get("author").isJsonObject() ? q.getAsJsonObject("author") : new JsonObject();
		List<Reaction> reactions = new ArrayList<>();
		if (o.has("reactions") && o.get("reactions").isJsonArray()) {
			for (JsonElement r : o.getAsJsonArray("reactions")) {
				JsonObject x = r.getAsJsonObject();
				reactions.add(new Reaction(Social.str(x, "emoji"), (int) Social.longOf(x, "count"), Social.bool(x, "me")));
			}
		}
		// the author's custom role now (server 0.9.30+)
		noteRole(Social.str(o, "community"), Social.str(o, "from"), a);
		return new Message(o.get("id").getAsLong(), Social.str(o, "community"), Social.str(o, "channel"), Social.str(o, "from"), Social.str(a, "name"), Social.str(a, "role"),
			Social.str(o, "text"), o.get("at").getAsLong(), Social.longOf(o, "editedAt"), Social.bool(o, "deleted"), Social.bool(o, "moderated"), List.copyOf(mentions),
			q == null ? 0 : Social.longOf(q, "id"), Social.str(qa, "name"), q == null ? "" : Social.str(q, "text"), q != null && (Social.bool(q, "deleted") || !q.has("author")), List.copyOf(reactions), Social.bool(o, "pinned"));
	}

	// ---------- pictures and polls (server 0.9.30+) ----------

	/** A picture in a channel: its size, or that it expired on the server. */
	/** `removed`: taken down by its sender or a moderator (server 0.9.36+; `expired` is then set too). */
	public record Image(String id, int w, int h, boolean expired, boolean removed) {}

	/** A poll: the answers with their votes, one or several choices, its end (0: none), and our own choices. */
	public record Poll(String question, List<String> options, List<Integer> votes, boolean multiple, int voters, long endsAt, boolean closed, List<Integer> mine) {
		public boolean open() {
			return !closed && (endsAt == 0 || endsAt > System.currentTimeMillis());
		}

		/** An answer's share in whole percent (several choices: of the voters). */
		public int percent(int i) {
			int total = total();
			return total == 0 ? 0 : Math.round(votes.get(i) * 100f / total);
		}

		/** All votes cast (several choices: the voters). */
		public int total() {
			return multiple ? voters : votes.stream().mapToInt(Integer::intValue).sum();
		}
	}

	private static final Map<Long, Image> images = new ConcurrentHashMap<>();
	private static final Map<Long, Poll> polls = new ConcurrentHashMap<>();
	/** The server has pictures in communities (its list says how big one may be). */
	private static volatile boolean pictures;

	/** A message's picture, or null. */
	public static Image image(long messageId) {
		return images.get(messageId);
	}

	/** A message's poll, or null. */
	public static Poll poll(long messageId) {
		return polls.get(messageId);
	}

	/** Whether we may send pictures to communities here (a launcher, and a server that has them). */
	public static boolean picturesAllowed() {
		return pictures && Social.bridged() && Social.communityMedia();
	}

	private static List<Integer> ints(JsonObject o, String key) {
		List<Integer> out = new ArrayList<>();
		if (o.has(key) && o.get(key).isJsonArray()) for (JsonElement x : o.getAsJsonArray(key)) out.add(x.getAsInt());
		return List.copyOf(out);
	}

	/** A poll from the server; `old`: our choices when this one (pushed) has none. */
	static Poll pollFrom(JsonObject p, Poll old) {
		List<String> options = new ArrayList<>();
		List<Integer> votes = new ArrayList<>();
		if (p.has("options") && p.get("options").isJsonArray()) {
			for (JsonElement el : p.getAsJsonArray("options")) {
				JsonObject o = el.getAsJsonObject();
				options.add(Social.str(o, "text"));
				votes.add((int) Social.longOf(o, "votes"));
			}
		}
		List<Integer> mine = p.has("mine") ? ints(p, "mine") : old != null ? old.mine() : List.of();
		return new Poll(Social.str(p, "question"), List.copyOf(options), List.copyOf(votes), Social.bool(p, "multiple"), (int) Social.longOf(p, "voters"), Social.longOf(p, "endsAt"), Social.bool(p, "closed"), mine);
	}

	/** What a message carries besides its text, kept by its id (a deleted one has none). */
	private static void extrasFrom(JsonObject o, long id) {
		if (o.has("image") && o.get("image").isJsonObject()) {
			JsonObject i = o.getAsJsonObject("image");
			images.put(id, new Image(Social.str(i, "id"), (int) Social.longOf(i, "w"), (int) Social.longOf(i, "h"), Social.bool(i, "expired"), Social.bool(i, "removed")));
		} else images.remove(id);
		if (o.has("poll") && o.get("poll").isJsonObject()) polls.put(id, pollFrom(o.getAsJsonObject("poll"), polls.get(id)));
		else polls.remove(id);
	}

	/** A screenshot to a channel: the launcher makes it a JPEG and sends it (not encrypted: the community's members see it). */
	public static void sendImage(String communityId, String channelId, java.io.File png) {
		JsonObject body = new JsonObject();
		body.addProperty("community", communityId);
		body.addProperty("channel", channelId);
		body.addProperty("path", png.getAbsolutePath());
		Thread.ofVirtual().start(() -> {
			try {
				if (!Social.bridged()) throw new IllegalStateException("no launcher");
				JsonObject res = Social.call("POST", "/chat/image", body, 60);
				Message m = messageFrom(res.getAsJsonObject("message"));
				List<Message> chat = chats.computeIfAbsent(channelId, k -> new CopyOnWriteArrayList<>());
				if (chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				bump(m, false);
			} catch (Exception e) {
				String msg = e.getMessage() == null ? "" : e.getMessage();
				String key = msg.contains("image_quota") ? "slashclient-hud.picture.quota" : msg.contains("chat_media_full") ? "slashclient-hud.picture.chatFull"
					: msg.contains("chat_media_daily") ? "slashclient-hud.picture.chatDaily" : msg.contains("too_large") ? "slashclient-hud.picture.tooLarge" : "slashclient-hud.picture.failed";
				boolean told = msg.contains("slow_") || msg.contains("community_muted");
				Social.toast(Component.translatable("slashclient-hud.picture.notSent").getString(), told ? Social.errorText(e) : Component.translatable(key).getString(), "info");
			}
		});
	}

	/** A click on an answer: one choice swaps (or is taken back), several toggle; the results come back at once. */
	public static void vote(Message m, int option) {
		Poll p = poll(m.id());
		if (p == null || !p.open()) return;
		List<Integer> next = new ArrayList<>(p.mine());
		if (next.contains(option)) next.remove(Integer.valueOf(option));
		else {
			if (!p.multiple()) next.clear();
			next.add(option);
		}
		next.sort(null);
		JsonObject body = new JsonObject();
		com.google.gson.JsonArray options = new com.google.gson.JsonArray();
		for (int o : next) options.add(o);
		body.add("options", options);
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api("POST", "/v1/communities/" + m.community() + "/channels/" + m.channel() + "/messages/" + m.id() + "/vote", body);
				JsonObject msg = res.getAsJsonObject("message");
				if (msg != null && msg.has("poll") && msg.get("poll").isJsonObject()) polls.put(m.id(), pollFrom(msg.getAsJsonObject("poll"), null));
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.poll.notVoted").getString(), Social.errorText(e), "info");
			}
		});
	}

	/** Our reactions after someone's change (`count`: that emoji's number now); emoji nobody has any more go. */
	static List<Reaction> applyReaction(List<Reaction> list, String emoji, int count, boolean mine, boolean on) {
		List<Reaction> next = new ArrayList<>();
		boolean found = false;
		for (Reaction r : list) {
			if (!r.emoji().equals(emoji)) next.add(r);
			else {
				found = true;
				next.add(new Reaction(emoji, count, mine ? on : r.me()));
			}
		}
		if (!found) next.add(new Reaction(emoji, count, mine && on));
		next.removeIf(r -> r.count() <= 0);
		return next;
	}

	/** The list from the server (when the bridge connects and when something changed); an older launcher or server has none. */
	public static void refresh() {
		if (!Social.bridged()) return;
		try {
			JsonObject res = Social.api("GET", "/v1/communities/mine", null);
			List<Community> next = new ArrayList<>();
			for (JsonElement el : res.getAsJsonArray("communities")) next.add(communityFrom(el.getAsJsonObject()));
			// pictures in communities: a server that has them says how big one may be (0.9.30+)
			JsonObject limits = res.has("limits") && res.get("limits").isJsonObject() ? res.getAsJsonObject("limits") : new JsonObject();
			pictures = Social.longOf(limits, "imageBytes") > 0;
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
				else if (!mine && ("all".equals(c.notifyMode()) || "mentions".equals(c.notifyMode()) && m.mentionsMe())) Social.toast(c.name() + " · " + m.author(), toastText(m), "m-players");
			}
			case "community-message-edit", "community-message-delete" -> {
				if (e.has("message") && e.get("message").isJsonObject()) replaced(messageFrom(e.getAsJsonObject("message")));
			}
			case "community-reaction" -> {
				// someone's emoji under a message we have (ours too, from the launcher)
				String emoji = Social.str(e, "emoji");
				boolean mine = Social.str(e, "user").equals(Social.myId());
				update(Social.str(e, "channel"), Social.longOf(e, "message"), m -> m.withReactions(applyReaction(m.reactions(), emoji, (int) Social.longOf(e, "count"), mine, Social.bool(e, "on"))));
			}
			case "community-poll" -> {
				// a poll's results after someone's vote, or it was closed (our choices kept: the pushed one has none)
				long id = Social.longOf(e, "message");
				if (e.has("poll") && e.get("poll").isJsonObject() && polls.containsKey(id)) polls.put(id, pollFrom(e.getAsJsonObject("poll"), polls.get(id)));
			}
			case "community-pin" -> {
				if (!e.has("message") || !e.get("message").isJsonObject()) return;
				JsonObject m = e.getAsJsonObject("message");
				boolean pinned = Social.bool(e, "pinned");
				update(Social.str(m, "channel"), Social.longOf(m, "id"), x -> x.withPinned(pinned));
			}
			case "community" -> {
				String key = e.has("invite") ? "invited" : e.has("kicked") ? "kicked" : e.has("banned") ? "banned" : e.has("accepted") ? "accepted" : "";
				if (!key.isEmpty()) {
					JsonObject o = e.getAsJsonObject(e.has("invite") ? "invite" : key);
					Social.toast(Component.translatable("slashclient-hud.communities.title").getString(), Component.translatable("slashclient-hud.communities." + key, Social.str(o, "name")).getString(), "m-players");
				}
				// a timeout (server 0.9.27+): until when, or lifted
				if (e.has("muted") && e.get("muted").isJsonObject()) {
					JsonObject o = e.getAsJsonObject("muted");
					long until = Social.longOf(o, "until");
					String text = until > 0
						? Component.translatable("slashclient-hud.communities.timedOut", Social.str(o, "name"), java.time.format.DateTimeFormatter.ofPattern("dd.MM HH:mm").withZone(java.time.ZoneId.systemDefault()).format(java.time.Instant.ofEpochMilli(until))).getString()
						: Component.translatable("slashclient-hud.communities.timeoutLifted", Social.str(o, "name")).getString();
					Social.toast(Component.translatable("slashclient-hud.communities.title").getString(), text, "m-players");
				}
				refresh();
			}
			default -> {}
		}
	}

	/** A message as a toast says it: a picture and a poll in the game's language. */
	private static String toastText(Message m) {
		if (image(m.id()) != null) return Component.translatable("slashclient-hud.picture.community").getString();
		Poll p = poll(m.id());
		return p != null ? Component.translatable("slashclient-hud.poll.toast", p.question()).getString() : m.text();
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
			List<Channel> channels = c.channels().stream().map(ch -> ch.id().equals(m.channel()) && unread ? new Channel(ch.id(), ch.kind(), ch.name(), ch.canPost(), ch.unread() + 1, ch.mentions() + mention, ch.slowMode()) : ch).toList();
			next.add(new Community(c.id(), c.name(), c.tag(), c.logo(), c.role(), c.notifyMode(), c.unread() + (unread ? 1 : 0), c.mentions() + mention, c.members(), c.mutedUntil(), Math.max(c.lastMessageAt(), m.at()), channels));
		}
		sort(next);
		list = List.copyOf(next);
	}

	static void replaced(Message m) {
		List<Message> chat = chats.get(m.channel());
		if (chat == null) return;
		for (int i = 0; i < chat.size(); i++) {
			Message old = chat.get(i);
			if (old.id() == m.id()) {
				// a pushed version says nothing of our reactions: our marks kept from the one we had
				List<Reaction> next = new ArrayList<>();
				for (Reaction r : m.reactions()) next.add(new Reaction(r.emoji(), r.count(), r.me() || old.reactions().stream().anyMatch(o -> o.emoji().equals(r.emoji()) && o.me())));
				chat.set(i, m.deleted() ? m : m.withReactions(next));
			} else if (m.deleted() && old.replyId() == m.id() && !old.replyGone()) chat.set(i, old.withReplyGone());
		}
	}

	/** One message of a channel we have, changed in place. */
	private static void update(String channelId, long id, java.util.function.UnaryOperator<Message> change) {
		List<Message> chat = chats.get(channelId);
		if (chat == null) return;
		for (int i = 0; i < chat.size(); i++) if (chat.get(i).id() == id) chat.set(i, change.apply(chat.get(i)));
	}

	/** Seconds until slow mode lets us write in this channel again (0: now). */
	public static long slowWait(String channelId) {
		long at = nextPostAt.getOrDefault(channelId, 0L);
		return Math.max(0, (at - System.currentTimeMillis() + 999) / 1000);
	}

	/** We may react while not timed out (the server checks it again). */
	public static boolean canReact(Message m) {
		Community c = community(m.community());
		return !m.deleted() && c != null && c.mutedUntil() <= System.currentTimeMillis();
	}

	/** Adds our emoji, or takes it off when it is there. */
	public static void react(Message m, String emoji) {
		boolean on = m.reactions().stream().noneMatch(r -> r.emoji().equals(emoji) && r.me());
		JsonObject body = new JsonObject();
		body.addProperty("emoji", emoji);
		body.addProperty("on", on);
		Thread.ofVirtual().start(() -> {
			try {
				Message next = messageFrom(Social.api("POST", "/v1/communities/" + m.community() + "/channels/" + m.channel() + "/messages/" + m.id() + "/reactions", body).getAsJsonObject("message"));
				update(m.channel(), m.id(), x -> x.withReactions(next.reactions()));
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.communities.notReacted").getString(), Social.errorText(e), "info");
			}
		});
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
					if (Social.longOf(res, "nextPostAt") > 0) nextPostAt.put(channelId, Social.longOf(res, "nextPostAt"));
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
			List<Channel> channels = x.channels().stream().map(y -> y.id().equals(channelId) ? new Channel(y.id(), y.kind(), y.name(), y.canPost(), 0, 0, y.slowMode())
 : y).toList();
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
					noteRole(communityId, Social.str(m, "id"), m);
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
				JsonObject res = Social.api("POST", "/v1/communities/" + communityId + "/channels/" + channelId + "/messages", body);
				Message m = messageFrom(res.getAsJsonObject("message"));
				List<Message> chat = chats.computeIfAbsent(channelId, k -> new CopyOnWriteArrayList<>());
				if (chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				if (Social.longOf(res, "nextPostAt") > 0) nextPostAt.put(channelId, Social.longOf(res, "nextPostAt"));
				bump(m, false);
			} catch (Exception e) {
				// slow mode ("slow_mode:30"): the countdown from now
				java.util.regex.Matcher slow = java.util.regex.Pattern.compile("slow_mode:(\\d+)").matcher(String.valueOf(e.getMessage()));
				if (slow.find()) nextPostAt.put(channelId, System.currentTimeMillis() + Long.parseLong(slow.group(1)) * 1000);
				Social.toast(Component.translatable("slashclient-hud.friends.notSent").getString(), Social.errorText(e), "info");
			}

		});
	}

	/** Our own text, within the window the server gave with the history. */
	public static boolean canEdit(Message m) {
		long window = editWindows.getOrDefault(m.channel(), 0L);
		// a picture or a poll is not edited
		return window > 0 && m.from().equals(Social.myId()) && !m.deleted() && System.currentTimeMillis() - m.at() < window && image(m.id()) == null && poll(m.id()) == null;
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

	/** For the in-game test: custom roles ("community/user" → role) as the server would send them. */
	public static void sampleRolesForTest(Map<String, RoleTag> roles) {
		customRoles.clear();
		customRoles.putAll(roles);
	}

	/** For the in-game test: an event as the launcher passes it on. */
	public static void eventForTest(JsonObject e) {
		onEvent(e);
	}
}
