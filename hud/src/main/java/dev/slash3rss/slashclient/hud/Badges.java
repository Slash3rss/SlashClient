package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The SlashClient logo next to the names of players who also play with it, on the tab
 * list and above their heads. The game reports "this player uses SlashClient" to the
 * SlashClient server every few minutes and asks it about the players on the tab list.
 * The server's address comes from the launcher (config/slashclient-launcher.json).
 */
/* The logo is a vector glyph (font/badge.ttf, from scripts/icon/badge-font.py): white, no text shadow. */
public final class Badges {
	private Badges() {}

	private static final String GLYPH = "\uE000";
	private static final Style BADGE_STYLE = Style.EMPTY.withFont(Compat.font(Identifier.fromNamespaceAndPath(SlashHud.ID, "badge"))).withoutShadow();
	private static final MutableComponent BADGE = badge(0xFFFFFF);
	/** The logo's colour by rank: SlashClient's admins red, support light blue, partners gold, friends green or pink. */
	private static final Map<String, MutableComponent> RANK_BADGES = Map.of(
		"admin", badge(0xEF4444),
		"support", badge(0x38BDF8),
		"partner", badge(0xFACC15),
		"friend", badge(0x22C55E),
		"friend_pink", badge(0xEC4899),
		// supporters of the project: pink unless the server says their tier's colour
		"supporter", badge(0xF472B6));
	/** uuid → the colour of a supporter's tier (servers from 0.9.23 send it with the rank). */
	private static final Map<UUID, MutableComponent> tierBadges = new ConcurrentHashMap<>();
	/** uuid → rank, from the server (only Minecraft accounts proven to belong to that SlashClient account). */
	private static final Map<UUID, String> ranks = new ConcurrentHashMap<>();
	/** uuid → the tag of that player's SlashClient clan, shown as [TAG] after the logo. */
	private static final Map<UUID, String> clans = new ConcurrentHashMap<>();
	private static final int CLAN_COLOR = 0xFBBF24;

	/** For the in-game test: as if the server had said this player is in a clan with this tag (null: in none). */
	static void setClan(UUID id, String tag) {
		if (tag == null) clans.remove(id);
		else clans.put(id, tag);
	}

	private static MutableComponent badge(int color) {
		return Component.literal(GLYPH).withStyle(BADGE_STYLE.withColor(color));
	}

	/** The rank the server gave a player, or null (for the test). */
	static String rank(UUID id) {
		return ranks.get(id);
	}

	/** For the in-game test: as if the server had answered with this rank. */
	static void setRank(UUID id, String rank) {
		if (rank == null) ranks.remove(id);
		else ranks.put(id, rank);
	}

	/** For the in-game test: as if the server had sent this supporter tier colour (0xRRGGBB, or -1 for none). */
	static void setSupporterColor(UUID id, int color) {
		if (color < 0) tierBadges.remove(id);
		else tierBadges.put(id, badge(color));
	}

	private static final long HEARTBEAT_MS = 4 * 60_000;
	/** How long an answer about a player is trusted before asking again. */
	private static final long RECHECK_MS = 2 * 60_000;
	/**
	 * SlashClient players in sight, when changes of what they wear do not come live (no launcher, an older
	 * one, or it is not connected to the server): asked again this often, so a new cape shows soon anyway.
	 */
	private static final long IN_VIEW_RECHECK_MS = 30_000;

	/** uuid → when it was last checked, and whether it uses SlashClient. */
	private static final Map<UUID, Long> checkedAt = new ConcurrentHashMap<>();
	private static final Set<UUID> slash = ConcurrentHashMap.newKeySet();
	// HTTP/1.1: on plain http Java would try an "h2c" upgrade, which a server with WebSockets takes for one and drops
	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
	private static boolean warned;
	private static final Gson GSON = new Gson();
	static String server;
	private static long lastHeartbeat;
	private static int tick;
	private static boolean busy;

	/** Reads the server address the launcher left for the mod; without it only your own logo shows. */
	static void load() {
		try {
			var file = FabricLoader.getInstance().getConfigDir().resolve("slashclient-launcher.json");
			if (!Files.exists(file)) return;
			JsonObject o = GSON.fromJson(Files.readString(file), JsonObject.class);
			if (o != null && o.has("socialUrl")) server = o.get("socialUrl").getAsString().replaceAll("/+$", "");
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: nie udało się wczytać adresu serwera: {}", e.toString());
		}
	}

	public static boolean enabled() {
		return SlashHud.config != null && SlashHud.config.badges;
	}

	public static boolean usesSlash(UUID id) {
		if (!enabled() || id == null) return false;
		Minecraft mc = Minecraft.getInstance();
		return slash.contains(id) || (mc.player != null && id.equals(mc.player.getUUID()));
	}

	/** What the server answered about a player (for the test). */
	static boolean knownFromServer(UUID id) {
		return slash.contains(id);
	}

	/** `name` with the logo in front, when that player plays with SlashClient, and their clan's [TAG]. */
	public static Component decorate(UUID id, Component name) {
		if (name == null || !usesSlash(id)) return name;
		String rank = ranks.getOrDefault(id, "");
		MutableComponent logo = "supporter".equals(rank) && tierBadges.containsKey(id) ? tierBadges.get(id) : RANK_BADGES.getOrDefault(rank, BADGE);
		MutableComponent out = Component.empty().append(logo).append(" ");
		String tag = clans.get(id);
		if (tag != null) out.append(Component.literal("[" + tag + "] ").withStyle(Style.EMPTY.withColor(CLAN_COLOR).withBold(true)));
		return out.append(name);
	}

	/** Once a second: report ourselves now and then, and ask about players we know nothing recent of. */
	static void tick(Minecraft mc) {
		if (++tick % 20 != 0 || !enabled() || server == null || mc.player == null || mc.getConnection() == null || busy) return;
		long now = System.currentTimeMillis();
		if (now - lastHeartbeat > HEARTBEAT_MS) {
			lastHeartbeat = now;
			post("/v1/mc/heartbeat", "{\"uuid\":\"" + mc.player.getUUID() + "\"}", null);
			// ask a second later, so our own report is already in when we ask
			return;
		}
		// ourselves first, then the players around us, then the tab list: many servers fill the
		// tab list with their own entries, and the real players (us included) are not on it
		java.util.LinkedHashSet<UUID> seen = new java.util.LinkedHashSet<>();
		seen.add(mc.player.getUUID());
		if (mc.level != null) for (var p : mc.level.players()) seen.add(p.getUUID());
		for (PlayerInfo p : mc.getConnection().getOnlinePlayers()) seen.add(p.getProfile().id());
		java.util.Set<UUID> inView = new java.util.HashSet<>();
		if (mc.level != null && !dev.slash3rss.slashclient.hud.social.Social.liveCosmetics()) {
			for (var p : mc.level.players()) if (slash.contains(p.getUUID())) inView.add(p.getUUID());
		}
		List<UUID> ask = new ArrayList<>();
		for (UUID id : seen) {
			if (id != null && now - checkedAt.getOrDefault(id, 0L) > (inView.contains(id) ? IN_VIEW_RECHECK_MS : RECHECK_MS)) ask.add(id);
			if (ask.size() >= 200) break;
		}
		if (ask.isEmpty()) return;
		ask.forEach(id -> checkedAt.put(id, now));
		JsonObject body = new JsonObject();
		var arr = new com.google.gson.JsonArray();
		ask.forEach(id -> arr.add(id.toString()));
		body.add("uuids", arr);
		// ranks newer than the server's first ones: without this it sends the pink friend as the green one
		var known = new com.google.gson.JsonArray();
		known.add("friend_pink");
		known.add("supporter");
		body.add("knownRanks", known);
		busy = true;
		post("/v1/mc/lookup", GSON.toJson(body), response -> {
			JsonObject o = GSON.fromJson(response, JsonObject.class);
			Set<UUID> active = ConcurrentHashMap.newKeySet();
			o.getAsJsonArray("active").forEach(e -> active.add(UUID.fromString(e.getAsString())));
			JsonObject capes = o.has("capes") && o.get("capes").isJsonObject() ? o.getAsJsonObject("capes") : new JsonObject();
			JsonObject wornBy = o.has("cosmetics") && o.get("cosmetics").isJsonObject() ? o.getAsJsonObject("cosmetics") : new JsonObject();
			JsonObject rankOf = o.has("ranks") && o.get("ranks").isJsonObject() ? o.getAsJsonObject("ranks") : new JsonObject();
			// clan tags (servers before clans send none)
			JsonObject clanOf = o.has("clans") && o.get("clans").isJsonObject() ? o.getAsJsonObject("clans") : new JsonObject();
			// supporters' tier colours (servers before 0.9.23 send none)
			JsonObject tierColorOf = o.has("supporterColors") && o.get("supporterColors").isJsonObject() ? o.getAsJsonObject("supporterColors") : new JsonObject();
			for (UUID id : ask) {
				if (active.contains(id)) slash.add(id);
				else slash.remove(id);
				// the server answers with the uuid as it was asked
				var items = wornBy.get(id.toString());
				// a live change that came while this answer was on its way is newer: it stays
				boolean newer = Cosmetics.changedSince(id, now);
				if (newer) SlashHud.LOG.debug("SlashClient: kept the live cosmetics of {}", id);
				else if (items != null && items.isJsonObject()) {
					Map<String, String> all = new java.util.HashMap<>();
					items.getAsJsonObject().entrySet().forEach(e -> { if (e.getValue().isJsonPrimitive()) all.put(e.getKey(), e.getValue().getAsString()); });
					Cosmetics.setAll(id, all);
				} else {
					// an older server: only the cape
					var cape = capes.get(id.toString());
					Cosmetics.setAll(id, cape != null && cape.isJsonPrimitive() ? Map.of("cape", cape.getAsString()) : Map.of());
				}
				var rank = rankOf.get(id.toString());
				if (rank != null && rank.isJsonPrimitive() && RANK_BADGES.containsKey(rank.getAsString())) ranks.put(id, rank.getAsString());
				else ranks.remove(id);
				var tierColor = tierColorOf.get(id.toString());
				if (tierColor != null && tierColor.isJsonPrimitive() && tierColor.getAsString().matches("#[0-9a-fA-F]{6}")) tierBadges.put(id, badge(Integer.parseInt(tierColor.getAsString().substring(1), 16)));
				else tierBadges.remove(id);
				var tag = clanOf.get(id.toString());
				if (tag != null && tag.isJsonPrimitive() && tag.getAsString().matches("[A-Za-z0-9]{2,5}")) clans.put(id, tag.getAsString());
				else clans.remove(id);
			}
		});
	}

	/** In the background; the server being away only means no logos, never a stutter. */
	private static void post(String path, String json, java.util.function.Consumer<String> onOk) {
		HttpRequest request = HttpRequest.newBuilder(URI.create(server + path)).timeout(Duration.ofSeconds(8))
			.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json)).build();
		HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString()).whenComplete((res, err) -> {
			try {
				// said once per session, so a server that is away does not flood the log
				if ((err != null || res.statusCode() != 200) && !warned) {
					warned = true;
					SlashHud.LOG.info("SlashClient: serwer {} nie odpowiada ({}), logo innych graczy nie będzie widać", server, err != null ? err.toString() : "HTTP " + res.statusCode());
				}
				if (err == null && res.statusCode() == 200 && onOk != null) onOk.accept(res.body());
			} catch (RuntimeException e) {
				SlashHud.LOG.debug("SlashClient: zła odpowiedź serwera: {}", e.toString());
			} finally {
				if (onOk != null) busy = false;
			}
		});
	}

	/** Asked of the server again at the next lookup (within a second): a live change without the new set. */
	static void recheck(UUID id) {
		checkedAt.remove(id);
	}

	/** For the in-game test: as if the server had just answered about a player, and whether it did. */
	static void markChecked(UUID id) {
		checkedAt.put(id, System.currentTimeMillis());
	}

	static boolean checked(UUID id) {
		return checkedAt.containsKey(id);
	}

	/** Everyone asked about again at the next lookups (their logos stay meanwhile). */
	static void recheckAll() {
		checkedAt.clear();
	}

	/** A new server or world: what we knew about its players does not count any more. */
	static void reset() {
		checkedAt.clear();
		slash.clear();
		lastHeartbeat = 0;
	}
}
