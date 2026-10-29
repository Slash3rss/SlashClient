package dev.slash3rss.slashclient.hud.social;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Friend suggestions: SlashClient players met recently on the same server (the SlashClient server
 * counts it; launcher's "Propozycje"). Here: the few best ones in the friends window, with "Dodaj"
 * (a friend request) and "×" (not suggested again for a long time), through the launcher's bridge.
 *
 * And what the game alone can tell: once a minute on a server, the Minecraft uuids of the players
 * in sight (the ones the game knows, within the render distance) go to the server, which keeps only
 * those who are SlashClient players on the same server now, as time "next to each other", and drops
 * the rest unread. Not while the player turned suggestions off (the server would ignore it anyway).
 *
 * An older launcher refuses these paths and an older server does not know them: nothing of this
 * for the rest of the run.
 */
public final class FriendSuggestions {
	private FriendSuggestions() {}

	public record Suggestion(String id, String handle, String name, String server, int minutes, int nearbyMinutes, long lastAt, int mutual) {}

	/** Asked again at most this often when the friends window opens. */
	private static final long REFRESH_MS = 60_000;
	/** Players in sight are reported this often (ticks: one minute). */
	private static final int NEARBY_TICKS = 1200;
	/** Most uuids one report carries (the server takes 100), nearest first. */
	private static final int MAX_NEARBY = 60;

	private static volatile List<Suggestion> list = List.of();
	/** The player lets themself be suggested (and sees suggestions): as the server last said. */
	private static volatile boolean visible = true;
	private static volatile boolean unsupported;
	private static volatile boolean nearbyUnsupported;
	private static volatile boolean loading;
	private static volatile long loadedAt;
	private static volatile boolean sending;
	private static int ticks;
	/** Rows with a request or dismissal on the way. */
	private static final Set<String> busy = ConcurrentHashMap.newKeySet();

	public static List<Suggestion> list() {
		return list;
	}

	public static boolean busy(String id) {
		return busy.contains(id);
	}

	/** An error from the bridge that means "this launcher or server has no such thing". */
	private static boolean missing(Exception e) {
		String msg = String.valueOf(e.getMessage());
		return msg.contains("forbidden") || msg.contains("not_found");
	}

	/** Asks the server for the suggestions (the friends window opened); `force` skips the minute's wait. */
	public static void refresh(boolean force) {
		if (!Social.bridged() || !Social.signedIn() || unsupported || loading) return;
		if (!force && System.currentTimeMillis() - loadedAt < REFRESH_MS) return;
		loading = true;
		Thread.ofVirtual().start(() -> {
			try {
				take(Social.api("GET", "/v1/friends/suggestions?limit=6", null));
			} catch (Exception e) {
				if (missing(e)) unsupported = true;
				SlashHud.LOG.debug("SlashClient: friend suggestions: {}", e.toString());
			} finally {
				loadedAt = System.currentTimeMillis();
				loading = false;
			}
		});
	}

	/** The server's answer: { enabled, visible, suggestions: [...] }. */
	static void take(JsonObject res) {
		visible = !res.has("visible") || Social.bool(res, "visible");
		boolean enabled = !res.has("enabled") || Social.bool(res, "enabled");
		List<Suggestion> out = new ArrayList<>();
		if (enabled && res.has("suggestions") && res.get("suggestions").isJsonArray()) {
			for (JsonElement el : res.getAsJsonArray("suggestions")) {
				if (!el.isJsonObject()) continue;
				JsonObject o = el.getAsJsonObject();
				String id = Social.str(o, "id");
				if (id.isEmpty()) continue;
				out.add(new Suggestion(id, Social.str(o, "handle"), Social.str(o, "name"), Social.str(o, "server"),
					(int) Social.longOf(o, "minutes"), (int) Social.longOf(o, "nearbyMinutes"), Social.longOf(o, "lastAt"), (int) Social.longOf(o, "mutual")));
			}
		}
		list = List.copyOf(out);
	}

	/** "Dodaj": a friend request to them. */
	public static void add(Suggestion s) {
		if (!Social.bridged() || !busy.add(s.id())) return;
		JsonObject body = new JsonObject();
		body.addProperty("handle", s.handle());
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api("POST", "/v1/friends/requests", body);
				list = list.stream().filter(x -> !x.id().equals(s.id())).toList();
				boolean friends = "friends".equals(Social.str(res, "status"));
				Social.toast(s.name(), Component.translatable(friends ? "slashclient-hud.suggestions.friends" : "slashclient-hud.suggestions.sent").getString(), null);
				// they had asked us already: now a friend, in the list at once
				if (friends) Social.refreshFriends();
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.suggestions.failed").getString(), Social.errorText(e), "info");
			} finally {
				busy.remove(s.id());
			}
		});
	}

	/** "×": not suggested again (either way) for a long time. */
	public static void dismiss(Suggestion s) {
		if (!Social.bridged() || !busy.add(s.id())) return;
		list = list.stream().filter(x -> !x.id().equals(s.id())).toList();
		Thread.ofVirtual().start(() -> {
			try {
				take(Social.api("POST", "/v1/friends/suggestions/" + s.id() + "/dismiss", null));
			} catch (Exception e) {
				SlashHud.LOG.debug("SlashClient: dismissing a suggestion: {}", e.toString());
			} finally {
				busy.remove(s.id());
			}
		});
	}

	// ---------- why ----------

	/** "Graliście razem na skyup.pl", or "Byliście obok siebie na skyup.pl". */
	public static Component reason(Suggestion s) {
		return Component.translatable(s.minutes() > 0 ? "slashclient-hud.suggestions.played" : "slashclient-hud.suggestions.nearby", s.server());
	}

	/** How long and when: "2 h · wczoraj", "dzisiaj". */
	public static Component detail(Suggestion s) {
		Component when = when(s.lastAt(), System.currentTimeMillis());
		return s.minutes() > 0 ? duration(s.minutes()).copy().append(" · ").append(when) : when;
	}

	/** "3 wspólnych znajomych", or null when none. */
	public static Component mutual(Suggestion s) {
		if (s.mutual() <= 0) return null;
		return s.mutual() == 1 ? Component.translatable("slashclient-hud.suggestions.mutual1") : Component.translatable("slashclient-hud.suggestions.mutual", s.mutual());
	}

	static Component duration(int minutes) {
		return minutes < 60 ? Component.translatable("slashclient-hud.suggestions.min", Math.max(1, minutes))
			: Component.translatable("slashclient-hud.suggestions.hours", Math.round(minutes / 60f));
	}

	/** By calendar days: today, yesterday, n days ago. */
	static Component when(long at, long now) {
		ZoneId zone = ZoneId.systemDefault();
		long days = Math.max(0, ChronoUnit.DAYS.between(LocalDate.ofInstant(java.time.Instant.ofEpochMilli(at), zone), LocalDate.ofInstant(java.time.Instant.ofEpochMilli(now), zone)));
		if (days == 0) return Component.translatable("slashclient-hud.suggestions.today");
		if (days == 1) return Component.translatable("slashclient-hud.suggestions.yesterday");
		return Component.translatable("slashclient-hud.suggestions.daysAgo", days);
	}

	// ---------- players in sight ----------

	/** Every tick: once a minute on a server, the uuids of the players the game knows go to the server (one request at a time). */
	public static void tick(Minecraft mc) {
		if (++ticks % NEARBY_TICKS != 0 || nearbyUnsupported || !visible || sending || !Social.bridged() || !Social.signedIn() || mc.player == null || mc.level == null) return;
		String server = Social.currentServer();
		if (server == null) return;
		UUID me = mc.player.getUUID();
		var self = mc.player;
		List<UUID> uuids = mc.level.players().stream()
			.filter(p -> p != self && !p.getUUID().equals(me))
			.sorted(Comparator.comparingDouble(p -> p.distanceToSqr(self)))
			.limit(MAX_NEARBY)
			.map(p -> p.getUUID())
			.toList();
		if (uuids.isEmpty()) return;
		JsonObject body = new JsonObject();
		body.addProperty("server", server.toLowerCase(Locale.ROOT));
		JsonArray arr = new JsonArray();
		for (UUID u : uuids) arr.add(u.toString());
		body.add("uuids", arr);
		sending = true;
		Thread.ofVirtual().start(() -> {
			try {
				Social.api("POST", "/v1/mc/nearby", body);
			} catch (Exception e) {
				// an older launcher's bridge or server: nothing more this run
				if (missing(e)) nearbyUnsupported = true;
				SlashHud.LOG.debug("SlashClient: players nearby: {}", e.toString());
			} finally {
				sending = false;
			}
		});
	}

	// ---------- for the in-game test ----------

	/** Made-up suggestions for the screenshot test (no launcher there). */
	public static void sampleForTest(List<Suggestion> sample) {
		list = List.copyOf(sample);
	}

	public static void clearForTest() {
		list = List.of();
	}
}
