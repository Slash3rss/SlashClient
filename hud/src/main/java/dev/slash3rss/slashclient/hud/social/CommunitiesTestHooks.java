package dev.slash3rss.slashclient.hud.social;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.List;
import java.util.Map;

/**
 * For the in-game test of communities (GameCommunities): made-up communities with a chat in two
 * channels and their first members (no launcher), and the server's events as the launcher passes
 * them on. We moderate the big one; in the small one we are a plain member (announcements: read only).
 */
public final class CommunitiesTestHooks {
	private CommunitiesTestHooks() {}

	public static final String BIG = "budn", GENERAL = "budn-g", NEWS = "budn-n", SMALL = "speed", SMALL_GENERAL = "speed-g", SMALL_NEWS = "speed-n";
	public static final long WINDOW = 15 * 60_000L;

	public static void sample() {
		// a friend too, so the window is signed in as without a launcher in the other tests
		long now = System.currentTimeMillis();
		Social.sampleForTest(new Social.Friend("kumpel", "Kumpel", "kumpel", "online", "launcher", "", 0, now), List.of(), "me");
		var big = new Communities.Community(BIG, "Budowniczowie Północy", "BUDN", 3, "moderator", "mentions", 3, 1, 128, 0, now - 30_000, List.of(
			new Communities.Channel(GENERAL, "general", "", true, 1, 1), new Communities.Channel(NEWS, "announcements", "", false, 2, 0)));
		var small = new Communities.Community(SMALL, "Speedrunnerzy PL", "SPEED", 0, "member", "all", 4, 0, 12, 0, now - 90_000, List.of(
			new Communities.Channel(SMALL_GENERAL, "general", "", true, 4, 0), new Communities.Channel(SMALL_NEWS, "announcements", "", false, 0, 0)));
		Communities.sampleForTest("me", List.of(big, small), Map.of(
			GENERAL, List.of(
				msg(1, BIG, GENERAL, "ala", "Ala", "owner", "Witajcie w Budowniczych Północy! Zasady są w opisie.", now - 900_000, 0, false, false, List.of()),
				msg(2, BIG, GENERAL, "ola", "Ola", "member", "Ktoś pomoże przy murach zamku? Brakuje mi kamienia.", now - 600_000, 0, false, false, List.of()),
				msg(3, BIG, GENERAL, "igor", "Igor", "member", "", now - 500_000, 0, true, true, List.of()),
				msg(4, BIG, GENERAL, "bartek", "Bartek", "admin", "Turniej w sobotę o 18:00, zapisy tutaj.", now - 400_000, now - 380_000, false, false, List.of()),
				msg(5, BIG, GENERAL, "kasia", "Kasia", "member", "@Ty czy turniej jest też dla nowych?", now - 200_000, 0, false, false, List.of("me")),
				msg(6, BIG, GENERAL, "me", "Ty", "moderator", "Tak, dla wszystkich! Zapisujcie się.", now - 60_000, 0, false, false, List.of())),
			NEWS, List.of(
				msg(10, BIG, NEWS, "bartek", "Bartek", "admin", "Turniej budowania w sobotę o 18:00! Temat: zamek nad wodą.", now - 3_600_000, 0, false, false, List.of())),
			SMALL_NEWS, List.of(
				msg(20, SMALL, SMALL_NEWS, "bartek", "Bartek", "owner", "Trening any% w piątek o 20:00.", now - 7_200_000, 0, false, false, List.of()))),
			Map.of(BIG, List.of(
				new Communities.Member("ala", "Ala", "owner", true), new Communities.Member("bartek", "Bartek", "admin", true),
				new Communities.Member("me", "Ty", "moderator", true), new Communities.Member("kasia", "Kasia", "member", true),
				new Communities.Member("ola", "Ola", "member", false), new Communities.Member("igor", "Igor", "member", false),
				new Communities.Member("piotrek", "Piotrek", "member", true), new Communities.Member("zbyszek", "Zbyszek", "member", false))),
			WINDOW);
	}

	public static Communities.Message msg(long id, String community, String channel, String from, String author, String role, String text, long at, long editedAt, boolean deleted, boolean moderated, List<String> mentions) {
		return new Communities.Message(id, community, channel, from, author, role, text, at, editedAt, deleted, moderated, mentions);
	}

	/** The big community's logo has this version (GameCommunities registers a made-up picture for it). */
	public static final long LOGO = 3;

	/** A new message in a channel as the server pushes it. */
	public static void incoming(String community, String channel, long id, String from, String author, String text, boolean mentionMe) {
		JsonObject m = new JsonObject();
		m.addProperty("id", id);
		m.addProperty("community", community);
		m.addProperty("channel", channel);
		m.addProperty("from", from);
		JsonObject a = new JsonObject();
		a.addProperty("name", author);
		a.addProperty("handle", author.toLowerCase());
		m.add("author", a);
		m.addProperty("text", text);
		m.addProperty("at", System.currentTimeMillis());
		if (mentionMe) {
			JsonArray mentions = new JsonArray();
			mentions.add("me");
			m.add("mentions", mentions);
		}
		JsonObject e = new JsonObject();
		e.addProperty("type", "community-message");
		e.add("message", m);
		Communities.eventForTest(e);
	}
}
