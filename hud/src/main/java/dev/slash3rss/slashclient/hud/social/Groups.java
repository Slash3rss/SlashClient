package dev.slash3rss.slashclient.hud.social;

import com.google.gson.JsonArray;
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
 * Group chats (several friends at once) and the clan's chat, in the game. The launcher encrypts
 * and decrypts them on the way (like direct messages), so the HUD sees plain text; events come
 * through the bridge as `groups` (fetch the list again), `group-message` and `clan`. The clan
 * itself (members, who is online, roles) is only shown here; it is managed in the launcher.
 */
public final class Groups {
	private Groups() {}

	/** The most members a group may have, the creator included (as on the server). */
	public static final int SIZE = 16;

	public record Member(String id, String name) {}
	/** `clanTag`: the clan's chat (its members follow the clan), else empty. */
	public record Group(String id, String name, String owner, String clanTag, List<Member> members, int unread, long lastMessageAt) {
		public boolean clan() {
			return !clanTag.isEmpty();
		}

		public String nameOf(String userId) {
			for (Member m : members) if (m.id().equals(userId)) return m.name();
			return "?";
		}
	}
	/** `event`: a line about the group (someone joined, it was renamed…) instead of a message from someone. */
	/** `image`: a picture sent to the group (null for text and events). */
	public record Message(long id, String group, String from, String text, long at, String event, Social.Image image) {}
	public record ClanMember(String id, String name, String role, boolean online) {}
	public record Clan(String id, String tag, String name, String role, String chat, List<ClanMember> members) {
		public long online() {
			return members.stream().filter(ClanMember::online).count();
		}
	}

	private static volatile List<Group> groups = List.of();
	private static volatile Clan clan;
	private static final Map<String, List<Message>> chats = new ConcurrentHashMap<>();
	/** The group open in the friends window: its new messages are read at once and make no toast. */
	public static volatile String viewing;

	public static List<Group> groups() {
		return groups;
	}

	public static Group group(String id) {
		for (Group g : groups) if (g.id().equals(id)) return g;
		return null;
	}

	/** The player's clan, or null. */
	public static Clan clan() {
		return clan;
	}

	public static List<Message> chat(String groupId) {
		return chats.getOrDefault(groupId, List.of());
	}

	public static int unreadTotal() {
		return groups.stream().mapToInt(Group::unread).sum();
	}

	// ---------- from the launcher ----------

	private static Group groupFrom(JsonObject o) {
		List<Member> members = new ArrayList<>();
		if (o.has("members") && o.get("members").isJsonArray()) {
			for (JsonElement el : o.getAsJsonArray("members")) members.add(new Member(Social.str(el.getAsJsonObject(), "id"), Social.str(el.getAsJsonObject(), "name")));
		}
		JsonObject c = o.has("clan") && o.get("clan").isJsonObject() ? o.getAsJsonObject("clan") : null;
		return new Group(Social.str(o, "id"), Social.str(o, "name"), Social.str(o, "owner"), c == null ? "" : Social.str(c, "tag"), List.copyOf(members),
			o.has("unread") ? o.get("unread").getAsInt() : 0, o.has("lastMessageAt") ? o.get("lastMessageAt").getAsLong() : 0);
	}

	static Message messageFrom(JsonObject o) {
		JsonObject e = o.has("event") && o.get("event").isJsonObject() ? o.getAsJsonObject("event") : null;
		return new Message(o.get("id").getAsLong(), Social.str(o, "group"), Social.str(o, "from"), Social.str(o, "text"), o.get("at").getAsLong(), e == null ? "" : eventText(e), Social.imageFrom(o));
	}

	/** What happened, in the game's language: "Ala added Bob, Cyr". */
	static String eventText(JsonObject e) {
		List<String> users = new ArrayList<>();
		if (e.has("users") && e.get("users").isJsonArray()) for (JsonElement u : e.getAsJsonArray("users")) users.add(u.getAsString());
		String kind = Social.str(e, "kind");
		String key = switch (kind) {
			case "created", "added", "removed", "left", "joined", "renamed", "promoted", "demoted", "owner", "heir" -> "slashclient-hud.groups.event." + kind;
			default -> "slashclient-hud.groups.event.other";
		};
		String detail = "renamed".equals(kind) || "created".equals(kind) ? Social.str(e, "name") : String.join(", ", users);
		return Component.translatable(key, Social.str(e, "by"), detail).getString();
	}

	private static Clan clanFrom(JsonObject o) {
		List<ClanMember> members = new ArrayList<>();
		if (o.has("members") && o.get("members").isJsonArray()) {
			for (JsonElement el : o.getAsJsonArray("members")) {
				JsonObject m = el.getAsJsonObject();
				members.add(new ClanMember(Social.str(m, "id"), Social.str(m, "name"), Social.str(m, "role"), m.has("online") && m.get("online").getAsBoolean()));
			}
		}
		return new Clan(Social.str(o, "id"), Social.str(o, "tag"), Social.str(o, "name"), Social.str(o, "role"), Social.str(o, "chat"), List.copyOf(members));
	}

	/** The groups and the clan from the server (when the bridge connects and when something changed). */
	public static void refresh() {
		if (!Social.bridged()) return;
		try {
			JsonObject res = Social.api("GET", "/v1/groups", null);
			List<Group> list = new ArrayList<>();
			for (JsonElement el : res.getAsJsonArray("groups")) list.add(groupFrom(el.getAsJsonObject()));
			sort(list);
			groups = List.copyOf(list);
			JsonObject mine = Social.api("GET", "/v1/clans/mine", null);
			clan = mine.has("clan") && mine.get("clan").isJsonObject() ? clanFrom(mine.getAsJsonObject("clan")) : null;
		} catch (Exception e) {
			// an older launcher or server has no groups: nothing to show
			SlashHud.LOG.debug("SlashClient: groups: {}", e.toString());
		}
	}

	/** The clan's chat first, then the newest conversation. */
	private static void sort(List<Group> list) {
		list.sort(Comparator.comparing((Group g) -> !g.clan()).thenComparing(Comparator.comparingLong(Group::lastMessageAt).reversed()));
	}

	private static void refreshLater() {
		Thread.ofVirtual().start(Groups::refresh);
	}

	/** `groups`, `group-message` and `clan` events from the launcher. */
	static void onEvent(JsonObject e) {
		switch (Social.str(e, "type")) {
			case "groups" -> {
				String id = Social.str(e, "id");
				refresh();
				// taken out of the group (or it is gone): its chat is not ours any more
				if (!id.isEmpty() && group(id) == null) {
					chats.remove(id);
					if (id.equals(viewing)) viewing = null;
				}
			}
			case "group-message" -> {
				if (!e.has("message") || !e.get("message").isJsonObject()) return;
				Message m = messageFrom(e.getAsJsonObject("message"));
				Group g = group(m.group());
				if (g == null) {
					refresh();
					g = group(m.group());
					if (g == null) return;
				}
				List<Message> chat = chats.get(m.group());
				if (chat != null && chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				boolean mine = m.from().equals(Social.myId());
				boolean open = m.group().equals(viewing);
				bump(m.group(), mine || open || !m.event().isEmpty() ? 0 : 1, m.at());
				if (open && !mine) markRead(m.group());
				else if (!mine && m.event().isEmpty()) Social.toast(title(g) + " · " + g.nameOf(m.from()), m.text(), "m-friends");
			}
			case "clan" -> {
				JsonObject inv = e.has("invite") && e.get("invite").isJsonObject() ? e.getAsJsonObject("invite") : null;
				if (inv != null) {
					JsonObject by = inv.has("by") && inv.get("by").isJsonObject() ? inv.getAsJsonObject("by") : new JsonObject();
					Social.toast(Social.str(by, "name"), Component.translatable("slashclient-hud.clan.invited", Social.str(inv, "tag"), Social.str(inv, "name")).getString(), "m-armor");
				}
				refresh();
			}
			default -> {}
		}
	}

	/** "[WOLF] Wilki" for a clan's chat, else the group's name. */
	public static String title(Group g) {
		Clan c = clan;
		return g.clan() ? "[" + g.clanTag() + "] " + (c != null && c.chat().equals(g.id()) ? c.name() : g.name().replaceFirst("^\\[[^]]*] ", "")) : g.name();
	}

	/** A message of our own the server took (a picture sent through the launcher). */
	static void added(Message m) {
		List<Message> chat = chats.computeIfAbsent(m.group(), k -> new CopyOnWriteArrayList<>());
		if (chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
		bump(m.group(), 0, m.at());
	}

	private static void bump(String id, int unread, long at) {
		List<Group> list = new ArrayList<>();
		for (Group g : groups) {
			list.add(g.id().equals(id) ? new Group(g.id(), g.name(), g.owner(), g.clanTag(), g.members(), unread == 0 && at == 0 ? 0 : g.unread() + unread, Math.max(g.lastMessageAt(), at)) : g);
		}
		sort(list);
		groups = List.copyOf(list);
	}

	// ---------- actions from the screens (off the render thread) ----------

	/** Loads the newest messages of a group once; later ones come as events. */
	public static void open(String id) {
		viewing = id;
		Thread.ofVirtual().start(() -> {
			try {
				if (!chats.containsKey(id)) {
					JsonObject res = Social.api("GET", "/v1/groups/" + id + "/messages?limit=50", null);
					List<Message> list = new CopyOnWriteArrayList<>();
					for (JsonElement el : res.getAsJsonArray("messages")) list.add(messageFrom(el.getAsJsonObject()));
					chats.put(id, list);
				}
				markRead(id);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: group messages: {}", e.toString());
			}
		});
	}

	private static void markRead(String id) {
		Group g = group(id);
		if (g == null || g.unread() == 0) return;
		bump(id, 0, 0);
		Thread.ofVirtual().start(() -> {
			try {
				Social.api("POST", "/v1/groups/" + id + "/read", null);
			} catch (Exception ignored) {
				// shows as unread a little longer; harmless
			}
		});
	}

	/** Sends a message to the group; it shows up when the server confirms it. */
	public static void send(String id, String text) {
		String t = text.strip();
		if (t.isEmpty()) return;
		JsonObject body = new JsonObject();
		body.addProperty("text", t.length() > 2000 ? t.substring(0, 2000) : t);
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api("POST", "/v1/groups/" + id + "/messages", body);
				Message m = messageFrom(res.getAsJsonObject("message"));
				List<Message> chat = chats.computeIfAbsent(id, k -> new CopyOnWriteArrayList<>());
				if (chat.stream().noneMatch(x -> x.id() == m.id())) chat.add(m);
				bump(id, 0, m.at());
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.friends.notSent").getString(), e.getMessage() == null ? "" : e.getMessage(), "info");
			}
		});
	}

	/** A new group with these friends (the name: theirs, joined), opened in the friends window. */
	public static void create(List<String> friendIds, java.util.function.Consumer<String> opened) {
		if (friendIds.isEmpty()) return;
		JsonObject body = new JsonObject();
		JsonArray members = new JsonArray();
		List<String> names = new ArrayList<>();
		for (String id : friendIds) {
			members.add(id);
			Social.Friend f = Social.friend(id);
			if (f != null) names.add(f.name());
		}
		body.add("members", members);
		String name = String.join(", ", names);
		body.addProperty("name", name.length() > 32 ? name.substring(0, 31) + "…" : name.isEmpty() ? "Grupa" : name);
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api("POST", "/v1/groups", body);
				Group g = groupFrom(res.getAsJsonObject("group"));
				List<Group> list = new ArrayList<>(groups.stream().filter(x -> !x.id().equals(g.id())).toList());
				list.add(g);
				sort(list);
				groups = List.copyOf(list);
				opened.accept(g.id());
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.groups.notCreated").getString(), e.getMessage() == null ? "" : e.getMessage(), "info");
			}
		});
	}

	/** More friends into a group. */
	public static void add(String id, List<String> friendIds) {
		if (friendIds.isEmpty()) return;
		JsonObject body = new JsonObject();
		JsonArray members = new JsonArray();
		friendIds.forEach(members::add);
		body.add("members", members);
		Thread.ofVirtual().start(() -> {
			try {
				Social.api("POST", "/v1/groups/" + id + "/members", body);
				refresh();
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.friends.notSent").getString(), e.getMessage() == null ? "" : e.getMessage(), "info");
			}
		});
	}

	public static void leave(String id) {
		groups = groups.stream().filter(g -> !g.id().equals(id)).toList();
		chats.remove(id);
		if (id.equals(viewing)) viewing = null;
		Thread.ofVirtual().start(() -> {
			try {
				Social.api("POST", "/v1/groups/" + id + "/leave", null);
			} catch (Exception e) {
				SlashHud.LOG.debug("SlashClient: leave group: {}", e.toString());
				refresh();
			}
		});
	}

	/** Made-up groups and a clan for the screenshot test. */
	public static void sampleForTest(String me) {
		long now = System.currentTimeMillis();
		List<Member> clanMembers = List.of(new Member(me, "Ty"), new Member("kasia", "Kasia"), new Member("bartek", "Bartek"), new Member("ola", "Ola"));
		Group clanChat = new Group("clanchat", "[WOLF] Wilki Północy", me, "WOLF", clanMembers, 2, now - 60_000);
		Group ekipa = new Group("ekipa", "Ekipa na SkyUp", me, "", List.of(new Member(me, "Ty"), new Member("kumpel", "Kumpel"), new Member("ola", "Ola"), new Member("piotrek", "Piotrek")), 0, now - 30_000);
		groups = List.of(clanChat, ekipa);
		clan = new Clan("wolf", "WOLF", "Wilki Północy", "owner", "clanchat", List.of(
			new ClanMember(me, "Ty", "owner", true), new ClanMember("bartek", "Bartek", "officer", true),
			new ClanMember("kasia", "Kasia", "member", true), new ClanMember("ola", "Ola", "member", false)));
		JsonObject created = new JsonObject();
		created.addProperty("kind", "created");
		created.addProperty("by", "Ty");
		created.addProperty("name", "Ekipa na SkyUp");
		chats.put("ekipa", new CopyOnWriteArrayList<>(List.of(
			new Message(1, "ekipa", me, "", now - 600_000, eventText(created), null),
			new Message(2, "ekipa", "ola", "Siema! Ktoś ma wolny wieczór?", now - 300_000, "", null),
			new Message(3, "ekipa", "kumpel", "Ja wbijam koło 19, robimy wyspę od nowa", now - 200_000, "", null),
			new Message(5, "ekipa", "kumpel", "[Zrzut ekranu]", now - 150_000, "", new Social.Image("pic-theirs-0000000000", 1920, 1080, false)),
			new Message(4, "ekipa", me, "No to jesteśmy umówieni", now - 30_000, "", null))));
		JsonObject joined = new JsonObject();
		joined.addProperty("kind", "joined");
		joined.addProperty("by", "Ola");
		chats.put("clanchat", new CopyOnWriteArrayList<>(List.of(
			new Message(1, "clanchat", "ola", "", now - 900_000, eventText(joined), null),
			new Message(2, "clanchat", "kasia", "Kto dziś na wojnę klanów o 20?", now - 120_000, "", null),
			new Message(3, "clanchat", "bartek", "Ja będę, biorę łuk", now - 60_000, "", null))));
	}
}
