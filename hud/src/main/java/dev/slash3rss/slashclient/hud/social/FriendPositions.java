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
 * chosen in the launcher's account window or here; with all friends or only some) sends it while
 * they play on a server: at most every 2 seconds when they move or turn, otherwise every 5 seconds
 * so friends know they are still there; the SlashClient server passes it on only to friends on
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
	public static final long STALE_MS = 8_000;
	/** Checked this often whether ours should go out. */
	private static final int EVERY_TICKS = 10;
	/** Ours goes out at most this often while moving, and at least this often standing still (well below STALE_MS). */
	public static final long MOVING_MS = 2_000, STILL_MS = 5_000;
	/** Moved this far (blocks) or turned this much (degrees) since the last one sent: a new one goes out. */
	private static final double MOVED = 0.5, TURNED = 10;
	/**
	 * The server would not take ours (we are not on that server for it yet, or too many): asked again
	 * after BACKOFF_MS, then twice as long each time, at most MAX_BACKOFF_MS; a success or another server
	 * starts over. Right after joining it is only the launcher not having said where we are yet, so
	 * then the usual wait applies.
	 */
	static final long BACKOFF_MS = 30_000, MAX_BACKOFF_MS = 5 * 60_000, JOIN_GRACE_MS = 20_000;
	/** What went out last (server, dimension, x, y, z, yaw) and when; null: nothing yet. */
	private static volatile Object[] lastSent;
	private static volatile long lastSentAt, joinedAt, backoff, retryAt;
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

	/** Joined a server or world: a wait after the server's refusals starts over. */
	public static void joined() {
		joinedAt = System.currentTimeMillis();
		backoff = 0;
		retryAt = 0;
		lastSent = null;
	}

	/**
	 * Every tick: while sharing and on a server, where we are goes out (one request at a time) when we
	 * moved, turned or changed place (at most every 2 seconds), or 5 seconds after the last one.
	 */
	public static void tick(Minecraft mc) {
		if (++ticks % EVERY_TICKS != 0 || !sharing() || !available() || sending || mc.player == null || mc.level == null) return;
		String server = Social.currentServer();
		if (server == null) return;
		String key = server.toLowerCase(Locale.ROOT), dimension = Waypoints.dimensionId(Waypoints.dimension(mc));
		double x = Math.round(mc.player.getX() * 10) / 10.0, y = Math.round(mc.player.getY() * 10) / 10.0, z = Math.round(mc.player.getZ() * 10) / 10.0;
		double yaw = Math.round(mc.player.getYRot() * 10) / 10.0;
		long now = System.currentTimeMillis();
		Object[] last = lastSent;
		// another server: the server's refusals there say nothing about this one
		if (last != null && !key.equals(last[0])) {
			backoff = 0;
			retryAt = 0;
		}
		if (now < retryAt || !due(last, lastSentAt, now, key, dimension, x, y, z, yaw)) return;
		JsonObject body = new JsonObject();
		body.addProperty("server", key);
		body.addProperty("dimension", dimension);
		body.addProperty("x", x);
		body.addProperty("y", y);
		body.addProperty("z", z);
		body.addProperty("yaw", yaw);
		lastSent = new Object[] { key, dimension, x, y, z, yaw };
		lastSentAt = now;
		sending = true;
		Thread.ofVirtual().start(() -> {
			try {
				Social.api("POST", "/v1/mc/position", body);
				backoff = 0;
				retryAt = 0;
			} catch (Exception e) {
				String msg = String.valueOf(e.getMessage());
				// an older launcher's bridge does not know the path: nothing more this run
				if (msg.contains("HTTP 403") && msg.contains("forbidden")) unsupported = true;
				// switched off elsewhere (the launcher): asked again
				else if (msg.contains("not_sharing")) mode = "off";
				else if (refused(msg)) {
					long at = System.currentTimeMillis();
					// just joined: the launcher has not told the server where we are yet, so the usual wait
					if (at - joinedAt >= JOIN_GRACE_MS || msg.contains("rate_limited") || msg.contains("slow_down")) {
						backoff = backoff == 0 ? BACKOFF_MS : Math.min(MAX_BACKOFF_MS, backoff * 2);
						retryAt = at + backoff;
					}
				}
				SlashHud.LOG.debug("SlashClient: position: {}", msg);
			} finally {
				sending = false;
			}
		});
	}

	/** The server would not take it: not on that server for it (409) or too many (429). */
	static boolean refused(String msg) {
		return msg.contains("not_on_server") || msg.contains("other_server") || msg.contains("rate_limited") || msg.contains("slow_down")
			|| msg.contains("HTTP 409") || msg.contains("HTTP 429") || msg.contains("\"status\":409") || msg.contains("\"status\":429");
	}

	/** Whether ours goes out now, after `last` (null: none yet) sent at `lastAt`. */
	static boolean due(Object[] last, long lastAt, long now, String server, String dimension, double x, double y, double z, double yaw) {
		if (last == null || !server.equals(last[0]) || !dimension.equals(last[1])) return true;
		long since = now - lastAt;
		if (since >= STILL_MS) return true;
		if (since < MOVING_MS) return false;
		double dx = x - (double) last[2], dy = y - (double) last[3], dz = z - (double) last[4];
		double turn = Math.abs(((yaw - (double) last[5]) % 360 + 540) % 360 - 180);
		return dx * dx + dy * dy + dz * dz >= MOVED * MOVED || turn >= TURNED;
	}

	/** For the in-game test: whether a position goes out now, after one sent `ago` ms before at the first place. */
	public static boolean dueForTest(long ago, String server, String dimension, double x, double y, double z, double yaw, double x2, double y2, double z2, double yaw2, String server2, String dimension2) {
		long now = System.currentTimeMillis();
		return due(new Object[] { server, dimension, x, y, z, yaw }, now - ago, now, server2, dimension2, x2, y2, z2, yaw2);
	}

	/** For the in-game test: whether an error from the server makes ours wait. */
	public static boolean refusedForTest(String msg) {
		return refused(msg);
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
