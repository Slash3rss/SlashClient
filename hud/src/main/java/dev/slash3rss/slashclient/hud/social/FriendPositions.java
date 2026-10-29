package dev.slash3rss.slashclient.hud.social;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.map.Waypoints;
import net.minecraft.client.Minecraft;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Friends on the minimap (and the full map). A friend who shares their position (off by default,
 * chosen in the launcher's account window or here; with all friends or only some) sends it every
 * 2 seconds while they play on a server; the SlashClient server passes it on only to friends on
 * the same server, and keeps nothing. Here: what came, shown only for the server and dimension the
 * player is in, and forgotten after a few seconds without news. Sending ours works the same way.
 *
 * An older launcher passes neither on (its bridge refuses the path): then nothing is sent again
 * for this run.
 */
public final class FriendPositions {
	private FriendPositions() {}

	public record Pos(String id, String name, String server, String dimension, double x, double y, double z, float yaw, List<UUID> uuids, long at) {}

	/** A position older than this is no longer shown (the friend left, or stopped sharing). */
	static final long STALE_MS = 8_000;
	private static final int EVERY_TICKS = 40;
	private static final Map<String, Pos> positions = new ConcurrentHashMap<>();
	/** Our own choice as the server keeps it: "off", "all" or "some" (null: not asked yet). */
	private static volatile String mode;
	/** Friends picked in the launcher: switched on here, it is "some" again. */
	private static volatile boolean picked;
	/** The launcher or server is older and has none of this. */
	private static volatile boolean unsupported;
	private static volatile boolean sending;
	private static int ticks;
	/** Made-up friends for the screenshot test: shown although no launcher knows them, on this server (the test plays singleplayer). */
	private static volatile boolean sample;
	private static volatile String sampleServer;

	private static final java.util.regex.Pattern DEFAULT_PORT = java.util.regex.Pattern.compile(":25565$"),
		TRAILING_DOTS = java.util.regex.Pattern.compile("\\.+(?=:\\d+$|$)");

	/** The server's key for an address, as it compares them ("Play.Example.com:25565" is "play.example.com"). */
	static String serverKey(String address) {
		if (address == null) return "";
		return TRAILING_DOTS.matcher(DEFAULT_PORT.matcher(address.strip().toLowerCase(Locale.ROOT)).replaceAll("")).replaceAll("");
	}

	// ---------- receiving ----------

	/** A `friend-position` event: a friend's place, or `gone` when they stopped sharing with us. */
	static void onEvent(JsonObject e) {
		String from = Social.str(e, "from");
		if (from.isEmpty()) return;
		if (Social.bool(e, "gone")) {
			positions.remove(from);
			return;
		}
		try {
			List<UUID> uuids = new ArrayList<>();
			if (e.has("uuids") && e.get("uuids").isJsonArray()) {
				for (JsonElement u : e.getAsJsonArray("uuids")) {
					try {
						uuids.add(UUID.fromString(u.getAsString()));
					} catch (IllegalArgumentException ignored) {
						// not a uuid: no face for it
					}
				}
			}
			positions.put(from, new Pos(from, Social.str(e, "name"), serverKey(Social.str(e, "server")), Social.str(e, "dimension"),
				e.get("x").getAsDouble(), e.get("y").getAsDouble(), e.get("z").getAsDouble(), e.has("yaw") ? e.get("yaw").getAsFloat() : 0f,
				List.copyOf(uuids), System.currentTimeMillis()));
		} catch (RuntimeException ex) {
			SlashHud.LOG.debug("SlashClient: friend position: {}", ex.toString());
		}
	}

	/** The friends to draw now: fresh, on this server, in this dimension, still friends; nearest first. */
	public static List<Pos> visible(Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.friendsOnMap || mc.level == null || mc.player == null || positions.isEmpty()) return List.of();
		String server = serverKey(sample ? sampleServer : Social.currentServer());
		if (server.isEmpty()) return List.of();
		String dim = Waypoints.dimensionId(Waypoints.dimension(mc));
		long now = System.currentTimeMillis();
		List<Pos> out = new ArrayList<>();
		for (Pos p : positions.values()) {
			if (now - p.at() > STALE_MS) {
				positions.remove(p.id());
				continue;
			}
			if (!p.server().equals(server) || !p.dimension().equals(dim)) continue;
			if (!sample && Social.friend(p.id()) == null) continue;
			out.add(p);
		}
		double px = mc.player.getX(), pz = mc.player.getZ();
		out.sort(java.util.Comparator.comparingDouble(p -> (p.x() - px) * (p.x() - px) + (p.z() - pz) * (p.z() - pz)));
		return out;
	}

	/** A friend's player in the world, when they are close enough for the game to know them (for their face). */
	public static net.minecraft.client.player.AbstractClientPlayer player(Minecraft mc, Pos p) {
		if (mc.level == null) return null;
		for (UUID u : p.uuids()) {
			var player = mc.level.getPlayerByUUID(u);
			if (player instanceof net.minecraft.client.player.AbstractClientPlayer c) return c;
		}
		return null;
	}

	// ---------- sharing ours ----------

	/** Whether we share our position now (as the server last said). */
	public static boolean sharing() {
		return mode != null && !"off".equals(mode);
	}

	/** Whether this launcher and server can share at all (signed in, new enough). */
	public static boolean available() {
		return Social.bridged() && Social.signedIn() && !unsupported;
	}

	/** Asks the server for our choice (when the game starts, and after the launcher reconnects). */
	static void refresh() {
		if (!Social.bridged() || unsupported) return;
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api("GET", "/v1/me/position-sharing", null);
				mode = Social.str(res, "mode");
				picked = res.has("friends") && res.get("friends").isJsonArray() && !res.getAsJsonArray("friends").isEmpty();
			} catch (Exception e) {
				// an older launcher (its bridge refuses the path) or server (it does not know it): nothing of this for this run
				String msg = String.valueOf(e.getMessage());
				if (msg.contains("forbidden") || msg.contains("not_found")) unsupported = true;
				SlashHud.LOG.debug("SlashClient: position sharing: {}", e.toString());
			}
		});
	}

	/** The switch in the settings: on is "all" (or the friends picked in the launcher, if there are any), off is off. */
	public static void setSharing(boolean on) {
		String next = !on ? "off" : picked ? "some" : "all";
		String before = mode;
		mode = next;
		if (!Social.bridged()) return;
		JsonObject body = new JsonObject();
		body.addProperty("mode", next);
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject res = Social.api("POST", "/v1/me/position-sharing", body);
				mode = Social.str(res, "mode");
			} catch (Exception e) {
				mode = before;
				Social.toast(net.minecraft.network.chat.Component.translatable("slashclient-hud.friendMap.failed").getString(), Social.errorText(e), "info");
			}
		});
	}

	/** Every tick: every 2 seconds, while sharing and on a server, where we are goes out (one request at a time). */
	public static void tick(Minecraft mc) {
		if (++ticks % EVERY_TICKS != 0 || !sharing() || !available() || sending || mc.player == null || mc.level == null) return;
		String server = Social.currentServer();
		if (server == null) return;
		JsonObject body = new JsonObject();
		body.addProperty("server", server.toLowerCase(Locale.ROOT));
		body.addProperty("dimension", Waypoints.dimensionId(Waypoints.dimension(mc)));
		body.addProperty("x", Math.round(mc.player.getX() * 10) / 10.0);
		body.addProperty("y", Math.round(mc.player.getY() * 10) / 10.0);
		body.addProperty("z", Math.round(mc.player.getZ() * 10) / 10.0);
		body.addProperty("yaw", Math.round(mc.player.getYRot() * 10) / 10.0);
		sending = true;
		Thread.ofVirtual().start(() -> {
			try {
				Social.api("POST", "/v1/mc/position", body);
			} catch (Exception e) {
				String msg = String.valueOf(e.getMessage());
				// an older launcher's bridge does not know the path: nothing more this run
				if (msg.contains("HTTP 403") && msg.contains("forbidden")) unsupported = true;
				// switched off elsewhere (the launcher): asked again
				else if (msg.contains("not_sharing")) mode = "off";
				SlashHud.LOG.debug("SlashClient: position: {}", msg);
			} finally {
				sending = false;
			}
		});
	}

	// ---------- for the in-game test ----------

	/** A made-up friend's position, as if it came from the launcher (shown although no launcher knows the friend). */
	public static void sampleForTest(String id, String name, String server, String dimension, double x, double y, double z, float yaw) {
		sample = true;
		sampleServer = server;
		JsonObject e = new JsonObject();
		e.addProperty("type", "friend-position");
		e.addProperty("from", id);
		e.addProperty("name", name);
		e.addProperty("server", server);
		e.addProperty("dimension", dimension);
		e.addProperty("x", x);
		e.addProperty("y", y);
		e.addProperty("z", z);
		e.addProperty("yaw", yaw);
		onEvent(e);
	}

	public static void clearForTest() {
		positions.clear();
		sample = false;
	}
}
