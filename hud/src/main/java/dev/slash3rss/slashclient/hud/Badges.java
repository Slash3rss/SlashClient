package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
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
public final class Badges {
	private Badges() {}

	private static final MutableComponent BADGE = Component.literal("")
		.withStyle(Style.EMPTY.withFont(new FontDescription.Resource(Identifier.fromNamespaceAndPath(SlashHud.ID, "badge"))).withColor(0xFFFFFF));
	private static final long HEARTBEAT_MS = 4 * 60_000;
	/** How long an answer about a player is trusted before asking again. */
	private static final long RECHECK_MS = 2 * 60_000;

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

	/** `name` with the logo in front, when that player plays with SlashClient. */
	public static Component decorate(UUID id, Component name) {
		if (name == null || !usesSlash(id)) return name;
		return Component.empty().append(BADGE).append(" ").append(name);
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
		List<UUID> ask = new ArrayList<>();
		for (PlayerInfo p : mc.getConnection().getOnlinePlayers()) {
			UUID id = p.getProfile().id();
			if (id != null && now - checkedAt.getOrDefault(id, 0L) > RECHECK_MS) ask.add(id);
			if (ask.size() >= 200) break;
		}
		if (ask.isEmpty()) return;
		ask.forEach(id -> checkedAt.put(id, now));
		JsonObject body = new JsonObject();
		var arr = new com.google.gson.JsonArray();
		ask.forEach(id -> arr.add(id.toString()));
		body.add("uuids", arr);
		busy = true;
		post("/v1/mc/lookup", GSON.toJson(body), response -> {
			JsonObject o = GSON.fromJson(response, JsonObject.class);
			Set<UUID> active = ConcurrentHashMap.newKeySet();
			o.getAsJsonArray("active").forEach(e -> active.add(UUID.fromString(e.getAsString())));
			for (UUID id : ask) {
				if (active.contains(id)) slash.add(id);
				else slash.remove(id);
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

	/** A new server or world: what we knew about its players does not count any more. */
	static void reset() {
		checkedAt.clear();
		slash.clear();
		lastHeartbeat = 0;
	}
}
