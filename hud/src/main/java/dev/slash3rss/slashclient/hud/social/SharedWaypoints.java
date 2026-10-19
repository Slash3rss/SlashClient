package dev.slash3rss.slashclient.hud.social;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Waypoints;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Waypoints shared with friends through SlashClient. Sending: a point (or where the player stands)
 * to one or more friends, through the launcher to the social server. Receiving: a point for the
 * world the player is in goes straight into its waypoints, marked with the friend's name; one for
 * another server or world waits in the "received" list (kept on disk) until it is accepted.
 */
public final class SharedWaypoints {
	private SharedWaypoints() {}

	/** A point as the server sends it: `dimension` is an id ("minecraft:overworld"), `world` a key as Waypoints keeps them. */
	public record Shared(String name, int x, int y, int z, String dimension, String world) {
		static Shared from(JsonObject o) {
			try {
				return new Shared(Social.str(o, "name"), o.get("x").getAsInt(), o.get("y").getAsInt(), o.get("z").getAsInt(), Social.str(o, "dimension"), Social.str(o, "world"));
			} catch (RuntimeException e) {
				return null;
			}
		}
	}

	/** A point waiting to be accepted: who sent it, and when. */
	public static final class Received {
		public long id;
		public String from;
		public String name;
		public int x, y, z;
		public String dimension;
		public String world;
		public long at;
	}

	public static final int MAX_FRIENDS = 8;
	private static final int MAX_PENDING = 50;
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-waypoints-received.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static List<Received> pending;

	public static synchronized List<Received> pending() {
		if (pending == null) {
			List<Received> read = null;
			try {
				if (Files.exists(FILE)) read = GSON.fromJson(Files.readString(FILE), new TypeToken<ArrayList<Received>>() {}.getType());
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: received waypoints: {}", e.toString());
			}
			pending = new CopyOnWriteArrayList<>(read == null ? List.of() : read);
		}
		return pending;
	}

	private static synchronized void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(new ArrayList<>(pending())));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: received waypoints: {}", e.toString());
		}
	}

	/** "server:SkyUp.pl:25565" and "server:skyup.pl" are the same place. */
	static String normalize(String worldKey) {
		String k = worldKey == null ? "" : worldKey;
		return k.startsWith("server:") ? k.toLowerCase(Locale.ROOT).replaceAll(":25565$", "") : k;
	}

	/** "skyup.pl", or the singleplayer world's name, for the screens. */
	public static String worldName(String worldKey) {
		if (worldKey == null) return "";
		if (worldKey.startsWith("server:")) return worldKey.substring(7);
		if (worldKey.startsWith("world:")) return worldKey.substring(6);
		return worldKey;
	}

	// ---------- receiving ----------

	/** A friend's point arrived (a message with `waypoint`): into this world's list, or waiting for another. */
	static void received(Social.Message m, String fromName) {
		received(m, fromName, false);
	}

	/** `quiet`: from a muted friend, so no toast. */
	static void received(Social.Message m, String fromName, boolean quiet) {
		Shared w = m.waypoint();
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> {
			boolean here = mc.level != null && normalize(Waypoints.worldKey(mc)).equals(normalize(w.world()));
			if (here) {
				Waypoints.addShared(Waypoints.worldKey(mc), w.name(), w.x(), w.y(), w.z(), Waypoints.dimensionKey(w.dimension()), fromName);
				if (!quiet) Social.toast(fromName, Component.translatable("slashclient-hud.share.added", w.name()).getString(), null);
				return;
			}
			if (pending().stream().anyMatch(r -> r.id == m.id())) return;
			Received r = new Received();
			r.id = m.id();
			r.from = fromName;
			r.name = w.name();
			r.x = w.x();
			r.y = w.y();
			r.z = w.z();
			r.dimension = w.dimension();
			r.world = w.world();
			r.at = m.at();
			pending().add(0, r);
			while (pending().size() > MAX_PENDING) pending().remove(pending().size() - 1);
			save();
			if (!quiet) Social.toast(fromName, Component.translatable("slashclient-hud.share.pending", w.name(), worldName(w.world())).getString(), null);
		});
	}

	/**
	 * Keeps a received point: a server's goes into that server's list (it shows when the player is
	 * there); a singleplayer world's means nothing elsewhere, so it goes into the world the player is in.
	 */
	public static void accept(Received r) {
		Minecraft mc = Minecraft.getInstance();
		String key = r.world.startsWith("server:") || mc.level == null ? normalize(r.world) : Waypoints.worldKey(mc);
		// the player's own key for the server, if it is this one under another spelling
		if (mc.level != null && normalize(Waypoints.worldKey(mc)).equals(normalize(r.world))) key = Waypoints.worldKey(mc);
		Waypoints.addShared(key, r.name, r.x, r.y, r.z, Waypoints.dimensionKey(r.dimension), r.from);
		dismiss(r);
	}

	public static void dismiss(Received r) {
		pending().removeIf(x -> x.id == r.id);
		save();
	}

	/** "Add" on a point in the chat: as accepting it, whether it is still waiting or not. */
	public static void acceptMessage(Social.Message m, String fromName) {
		for (Received r : pending()) {
			if (r.id == m.id()) {
				accept(r);
				return;
			}
		}
		Shared w = m.waypoint();
		Received r = new Received();
		r.id = m.id();
		r.from = fromName;
		r.name = w.name();
		r.x = w.x();
		r.y = w.y();
		r.z = w.z();
		r.dimension = w.dimension();
		r.world = w.world();
		accept(r);
	}

	// ---------- sending ----------

	/** Whether this point can be shared: the player is in a world SlashClient can name. */
	public static boolean canShare(Minecraft mc) {
		return Social.signedIn() && Social.reachable() && mc.level != null && !"unknown".equals(Waypoints.worldKey(mc));
	}

	/** The request body for a point, in the form the server checks. */
	static JsonObject body(String name, int x, int y, int z, String dimensionKey, String worldKey, List<String> friends) {
		JsonObject body = new JsonObject();
		JsonArray to = new JsonArray();
		for (String id : friends) to.add(id);
		body.add("to", to);
		String n = name.strip();
		body.addProperty("name", n.length() > 32 ? n.substring(0, 32) : n);
		body.addProperty("x", x);
		body.addProperty("y", y);
		body.addProperty("z", z);
		body.addProperty("dimension", Waypoints.dimensionId(dimensionKey));
		// a world's name the server takes is at most 64 characters
		body.addProperty("world", worldKey.length() > 70 ? worldKey.substring(0, 70) : worldKey);
		return body;
	}

	/** Sends the point to the friends picked; the chat gets it as the server confirms (the "message" events). */
	public static void send(Waypoints.Point p, List<String> friends) {
		Minecraft mc = Minecraft.getInstance();
		if (friends.isEmpty()) return;
		JsonObject body = body(p.name, p.x, p.y, p.z, p.dimension, Waypoints.worldKey(mc), friends);
		Thread.ofVirtual().start(() -> {
			try {
				Social.api("POST", "/v1/waypoints", body);
				Social.toast(Component.translatable("slashclient-hud.share.sent", p.name).getString(),
					Component.translatable("slashclient-hud.share.sentTo", friends.size()).getString(), "share");
			} catch (Exception e) {
				Social.toast(Component.translatable("slashclient-hud.friends.notSent").getString(), e.getMessage() == null ? "" : e.getMessage(), "info");
			}
		});
	}

	/** Where the player stands, as a point to share (not kept in their own list). */
	public static Waypoints.Point here(Minecraft mc, String name) {
		var pos = mc.player.blockPosition();
		String n = name == null || name.isBlank() ? Component.translatable("slashclient-hud.share.here").getString() : name.strip();
		return new Waypoints.Point(n, pos.getX(), pos.getY(), pos.getZ(), Waypoints.dimension(mc), Waypoints.COLORS[0]);
	}

	/** Made-up received points for the screenshot test. */
	public static void sampleForTest() {
		pending = new CopyOnWriteArrayList<>();
		String[][] rows = { { "Kumpel", "Baza w górach", "server:skyup.pl" }, { "Ola", "Wioska z kowalem", "world:Nowy świat" } };
		long id = 1000;
		for (String[] row : rows) {
			Received r = new Received();
			r.id = id++;
			r.from = row[0];
			r.name = row[1];
			r.x = 412;
			r.y = 88;
			r.z = -1290;
			r.dimension = "minecraft:overworld";
			r.world = row[2];
			r.at = System.currentTimeMillis();
			pending.add(r);
		}
	}
}
