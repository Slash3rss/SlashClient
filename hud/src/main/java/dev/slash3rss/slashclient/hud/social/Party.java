package dev.slash3rss.slashclient.hud.social;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Parties: several friends invited to a server at once. Each of them gets the usual "join me"
 * invite (with the party's id); the server keeps who is in and pushes every change as a `party`
 * event. This keeps the parties the player is in, for the friends window.
 */
public final class Party {
	private Party() {}

	public static final int SIZE = 8;

	/** `status`: invited, accepted, declined or left. */
	public record Member(String id, String name, String status) {}
	public record Info(String id, String leaderId, String leaderName, String server, String version, long expiresAt, List<Member> members) {
		public boolean mine() {
			return leaderId.equals(Social.myId());
		}

		public String statusOf(String userId) {
			for (Member m : members) if (m.id().equals(userId)) return m.status();
			return "";
		}

		public long accepted() {
			return members.stream().filter(m -> "accepted".equals(m.status())).count();
		}
	}

	private static volatile List<Info> parties = List.of();

	/** The parties the player is in (as leader, invited or accepted), newest first; expired ones and ones they left out. */
	public static List<Info> parties() {
		long now = System.currentTimeMillis();
		return parties.stream().filter(p -> p.expiresAt() > now && !"left".equals(p.statusOf(Social.myId())) && !"declined".equals(p.statusOf(Social.myId()))).toList();
	}

	/** The one to show: the player's own, else the newest they were invited to. */
	public static Info current() {
		List<Info> list = parties();
		for (Info p : list) if (p.mine()) return p;
		return list.isEmpty() ? null : list.get(0);
	}

	static Info from(JsonObject o) {
		JsonObject leader = o.has("leader") && o.get("leader").isJsonObject() ? o.getAsJsonObject("leader") : new JsonObject();
		List<Member> members = new ArrayList<>();
		if (o.has("members") && o.get("members").isJsonArray()) {
			for (JsonElement el : o.getAsJsonArray("members")) {
				JsonObject m = el.getAsJsonObject();
				members.add(new Member(Social.str(m, "id"), Social.str(m, "name"), Social.str(m, "status")));
			}
		}
		return new Info(Social.str(o, "id"), Social.str(leader, "id"), Social.str(leader, "name"), Social.str(o, "server"), Social.str(o, "version"),
			o.has("expiresAt") ? o.get("expiresAt").getAsLong() : 0, List.copyOf(members));
	}

	/** A `party` event: replaces the party (or drops it when disbanded) and says what changed. */
	static void onEvent(JsonObject o) {
		Info next = from(o);
		boolean gone = o.has("disbanded") && o.get("disbanded").getAsBoolean();
		Info before = null;
		List<Info> list = new ArrayList<>();
		for (Info p : parties) {
			if (p.id().equals(next.id())) before = p;
			else list.add(p);
		}
		if (!gone) list.add(0, next);
		parties = List.copyOf(list);
		if (gone) {
			if (before != null && !next.mine()) Social.toast(next.leaderName(), Component.translatable("slashclient-hud.party.disbanded").getString(), null);
			return;
		}
		// friends who just accepted or declined: a toast for the others in the party
		if (before == null) return;
		for (Member m : next.members()) {
			if (m.id().equals(Social.myId()) || m.status().equals(before.statusOf(m.id()))) continue;
			if ("accepted".equals(m.status())) Social.toast(m.name(), Component.translatable("slashclient-hud.party.joined").getString(), null);
			else if ("declined".equals(m.status()) && next.mine()) Social.toast(m.name(), Component.translatable("slashclient-hud.party.declined").getString(), null);
		}
	}

	/** The list from the server (when the friends window opens: events may have been missed). */
	public static void refresh() {
		if (!Social.bridged()) return;
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api("GET", "/v1/parties", null);
				List<Info> list = new ArrayList<>();
				for (JsonElement el : res.getAsJsonArray("parties")) list.add(from(el.getAsJsonObject()));
				parties = List.copyOf(list);
			} catch (Exception e) {
				SlashHud.LOG.debug("SlashClient: parties: {}", e.toString());
			}
		});
	}

	/** Invites the friends picked to the server this game is on, as one party. */
	public static void create(List<String> friendIds) {
		String server = Social.currentServer();
		if (server == null || friendIds.isEmpty()) return;
		JsonObject body = new JsonObject();
		JsonArray members = new JsonArray();
		for (String id : friendIds) members.add(id);
		body.add("members", members);
		body.addProperty("server", server.toLowerCase(java.util.Locale.ROOT));
		body.addProperty("version", net.minecraft.SharedConstants.getCurrentVersion().name());
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api("POST", "/v1/parties", body);
				Info made = from(res.getAsJsonObject("party"));
				List<Info> list = new ArrayList<>();
				list.add(made);
				for (Info p : parties) if (!p.mine() && !p.id().equals(made.id())) list.add(p);
				parties = List.copyOf(list);
				Social.toast(Component.translatable("slashclient-hud.party.sent").getString(),
					Component.translatable("slashclient-hud.party.sentTo", friendIds.size(), made.server()).getString(), "m-friends");
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.friends.notSent").getString(), e.getMessage() == null ? "" : e.getMessage(), "info");
			}
		});
	}

	private static void call(String method, String path) {
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api(method, path, null);
				if (res != null && res.has("party") && res.get("party").isJsonObject()) onEvent(res.getAsJsonObject("party"));
			} catch (Exception e) {
				// the party is over already (or the server is older): the invite still works on its own
				SlashHud.LOG.debug("SlashClient: party: {}", e.toString());
			}
		});
	}

	/** "I'm in": said when the player joins a party's server from its invite. */
	public static void accept(String id) {
		if (id != null && !id.isEmpty() && Social.bridged()) call("POST", "/v1/parties/" + id + "/accept");
	}

	public static void leave(String id) {
		parties = parties.stream().filter(p -> !p.id().equals(id)).toList();
		call("POST", "/v1/parties/" + id + "/leave");
	}

	public static void disband(String id) {
		parties = parties.stream().filter(p -> !p.id().equals(id)).toList();
		call("DELETE", "/v1/parties/" + id);
	}

	/** A made-up party for the screenshot test. */
	public static void sampleForTest(String me) {
		parties = List.of(new Info("sample", me, "Ty", "skyup.pl", "26.3", System.currentTimeMillis() + 3_600_000, List.of(
			new Member(me, "Ty", "accepted"), new Member("kumpel", "Kumpel", "accepted"), new Member("ola", "Ola", "invited"), new Member("bartek", "Bartek", "declined"))));
	}
}
