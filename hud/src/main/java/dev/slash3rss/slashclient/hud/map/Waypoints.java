package dev.slash3rss.slashclient.hud.map;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.world.phys.Vec3;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.Extras;

/**
 * Waypoints: named points kept per server or singleplayer world, shown in the world as a
 * marker with their name and distance. B opens the list.
 */
public final class Waypoints {
	private Waypoints() {}

	public static final class Point {
		public String name;
		public int x, y, z;
		public String dimension;
		public int color;
		public boolean visible = true;
		/** The friend who shared it (SlashClient), or null for the player's own. */
		public String from;
		/** Placed by itself where the player last died (DeathPoint): the next death replaces it. */
		public boolean death;

		public Point(String name, int x, int y, int z, String dimension, int color) {
			this.name = name;
			this.x = x;
			this.y = y;
			this.z = z;
			this.dimension = dimension;
			this.color = color;
		}
	}

	public static final int[] COLORS = { 0xFF60A5FA, 0xFF4ADE80, 0xFFFACC15, 0xFFF87171, 0xFFA855F7, 0xFFFFFFFF };
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-waypoints.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Map<String, List<Point>> all;

	/** The file as it was before keys were first written another way (WaypointKeys), kept once. */
	private static final Path BACKUP = FILE.resolveSibling("slashclient-waypoints-before-keys.json");

	private static Map<String, List<Point>> all() {
		if (all == null) {
			try {
				all = Files.exists(FILE) ? GSON.fromJson(Files.readString(FILE), new TypeToken<LinkedHashMap<String, List<Point>>>() {}.getType()) : null;
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: waypoints: {}", e.toString());
				// a file that cannot be read is kept aside, not written over with an empty list
				try {
					Files.copy(FILE, FILE.resolveSibling("slashclient-waypoints-unreadable-" + System.currentTimeMillis() + ".json"));
				} catch (Exception ignored) {
					// nothing more to save
				}
			}
			if (all == null) all = new LinkedHashMap<>();
			all.values().removeIf(java.util.Objects::isNull);
			// server addresses written one way ("SkyUp.pl:25565" is "skyup.pl"): lists of one server put together
			if (WaypointKeys.normalizeKeys(all)) save();
		}
		return all;
	}

	/** For the test: the file read again at the next look. */
	static void reloadForTest() {
		all = null;
		all();
	}

	/** Every list, by key (WaypointKeys moves points between them). */
	static Map<String, List<Point>> lists() {
		return all();
	}

	/** Copies the file before the first change of its keys, once. */
	static void backupOnce() {
		try {
			if (Files.exists(FILE) && !Files.exists(BACKUP)) Files.copy(FILE, BACKUP);
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: waypoints backup: {}", e.toString());
		}
	}

	public static void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(all()));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: waypoints: {}", e.toString());
		}
	}

	/**
	 * Where new points of the place the player is in go: the server (its address written one way, and
	 * its mode when the server has modes), or the singleplayer world's folder (WaypointKeys).
	 */
	public static String worldKey(Minecraft mc) {
		return WaypointKeys.key(mc);
	}

	public static String dimension(Minecraft mc) {
		return mc.level == null ? "" : String.valueOf(mc.level.dimension());
	}

	/** The list new points of this place go into (a live list: changes stick after save()). */
	public static List<Point> here(Minecraft mc) {
		return all().computeIfAbsent(worldKey(mc), k -> new ArrayList<>());
	}

	/**
	 * The points shown here, without making an entry for the place (the minimap reads them every
	 * frame): in a server's mode its own and the server's from before, which show in every mode.
	 */
	public static List<Point> points(Minecraft mc) {
		String key = worldKey(mc), base = WaypointKeys.base(key);
		List<Point> list = all().get(key);
		if (key.equals(base)) {
			// modes there, but not kept apart (switched off): every mode's points too, none hidden
			if (WaypointKeys.split(base)) return list == null ? List.of() : list;
			List<Point> every = new ArrayList<>();
			for (var e : all().entrySet()) if (WaypointKeys.base(e.getKey()).equals(base)) every.addAll(e.getValue());
			return every;
		}
		List<Point> shared = all().get(base);
		if (shared == null || shared.isEmpty()) return list == null ? List.of() : list;
		List<Point> both = new ArrayList<>(list == null ? List.of() : list);
		both.addAll(shared);
		return both;
	}

	/** Deletes a point from whichever list holds it. */
	public static void remove(Point p) {
		for (List<Point> list : all().values()) list.removeIf(q -> q == p);
		save();
	}

	public static Point add(Minecraft mc, String name) {
		var pos = mc.player.blockPosition();
		List<Point> list = here(mc);
		Point p = new Point(name.isBlank() ? Component.translatable("slashclient-hud.waypoints.point", list.size() + 1).getString() : name.strip(),
			pos.getX(), pos.getY(), pos.getZ(), dimension(mc), COLORS[list.size() % COLORS.length]);
		list.add(p);
		save();
		return p;
	}

	/** A point at given coordinates (from the chat) in the dimension the player is in, into this place's list. */
	public static Point addAt(Minecraft mc, String name, int x, int y, int z, int color) {
		List<Point> list = here(mc);
		String n = name == null || name.isBlank() ? Component.translatable("slashclient-hud.waypoints.point", list.size() + 1).getString() : name.strip();
		Point p = new Point(n.length() > 32 ? n.substring(0, 32) : n, x, y, z, dimension(mc), color);
		list.add(p);
		save();
		return p;
	}

	/** A point a friend shared, put into the list of `worldKey` (not necessarily the world the player is in). */
	public static Point addShared(String worldKey, String name, int x, int y, int z, String dimension, String from) {
		List<Point> list = all().computeIfAbsent(WaypointKeys.normalize(worldKey), k -> new ArrayList<>());
		for (Point p : list) if (p.x == x && p.y == y && p.z == z && p.name.equals(name) && dimension.equals(p.dimension)) return p;
		Point p = new Point(name, x, y, z, dimension, COLORS[list.size() % COLORS.length]);
		p.from = from;
		list.add(p);
		save();
		return p;
	}

	private static final java.util.regex.Pattern DIMENSION_KEY = java.util.regex.Pattern.compile("^ResourceKey\\[.* / (.+)]$");

	/** "minecraft:overworld" from the key this file keeps ("ResourceKey[minecraft:dimension / minecraft:overworld]"). */
	public static String dimensionId(String key) {
		var m = DIMENSION_KEY.matcher(key == null ? "" : key);
		return m.matches() ? m.group(1) : key == null ? "" : key;
	}

	/** The other way: the key this file keeps for a dimension id. */
	public static String dimensionKey(String id) {
		return "ResourceKey[minecraft:dimension / " + id + "]";
	}

	public static double distance(Minecraft mc, Point p) {
		return mc.player == null ? 0 : Math.sqrt(mc.player.distanceToSqr(p.x + 0.5, p.y + 0.5, p.z + 0.5));
	}

	/**
	 * Every visible point of this dimension, placed where it is in the world: the direction to it
	 * turned into the camera's view and projected with the current field of view.
	 */
	public static void draw(GuiGraphicsExtractor g, Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.waypoints || mc.player == null || mc.level == null) return;
		List<Point> list = points(mc);
		if (list.isEmpty()) return;
		int w = g.guiWidth(), h = g.guiHeight();
		String dim = dimension(mc);
		for (Point p : list) {
			if (!p.visible || !dim.equals(p.dimension)) continue;
			int[] at = project(mc, p.x + 0.5, p.y + 1.0, p.z + 0.5, w, h);
			if (at == null) continue;
			int sx = at[0], sy = at[1];
			if (sx < -50 || sx > w + 50 || sy < -20 || sy > h + 20) continue;
			drawMarker(g, mc, p, sx, sy);
		}
	}

	/**
	 * Where a point of the world is on the screen (GUI pixels): the direction to it turned into the
	 * camera's view and projected with the current field of view; null when it is behind the camera.
	 */
	public static int[] project(Minecraft mc, double x, double y, double z, int w, int h) {
		var camera = Compat.camera(mc);
		Vec3 eye = camera.position();
		double yaw = Math.toRadians(camera.yRot()), pitch = Math.toRadians(camera.xRot());
		// camera axes: forward, right and up
		double fx = -Math.sin(yaw) * Math.cos(pitch), fy = -Math.sin(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
		double rx = -Math.cos(yaw), rz = -Math.sin(yaw);
		// up = right × forward (right has no height)
		double ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
		double f = (h / 2.0) / Math.tan(Math.toRadians(Extras.lastFov) / 2);
		double dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
		double cz = dx * fx + dy * fy + dz * fz;
		if (cz < 0.5) return null;
		double cx = dx * rx + dz * rz, cy = dx * ux + dy * uy + dz * uz;
		return new int[] { (int) Math.round(w / 2.0 + cx / cz * f), (int) Math.round(h / 2.0 - cy / cz * f) };
	}

	private static void drawMarker(GuiGraphicsExtractor g, Minecraft mc, Point p, int sx, int sy) {
		String label = p.name + "  " + Math.round(distance(mc, p)) + " m";
		int tw = mc.font.width(label);
		// a small diamond on the point and the name above it
		for (int i = 0; i < 4; i++) g.fill(sx - i, sy - 4 + i, sx + i + 1, sy - 3 + i, p.color);
		for (int i = 0; i < 4; i++) g.fill(sx - 3 + i, sy + i, sx + 4 - i, sy + 1 + i, p.color);
		Ui.round(g, sx - tw / 2 - 4, sy - 18, tw + 8, 12, 3, 0xB0000000);
		g.text(mc.font, label, sx - tw / 2, sy - 16, p.color, false);
	}
}
