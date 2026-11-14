package dev.slash3rss.slashclient.hud.map;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Where the player walked lately, per dimension of this world: a point each few blocks, drawn as dots on the minimap
 * and the full map that fade out over the trail's length in minutes (mapTrailMinutes) and then go away, so the trail
 * follows the player instead of covering the whole map. Kept only in memory, never with the map on disk.
 */
public final class MapTrail {
	private MapTrail() {}

	/** At most this many points, even when the player sprints for the whole length. */
	static final int MAX = 2000;
	/** A new point once the player is this far (in blocks) from the last one. */
	private static final int STEP = 3;
	private static final int COLOR = 0xFFE8C468;
	public static final int MIN_MINUTES = 1, MAX_MINUTES = 30;
	private static final long START = System.currentTimeMillis();
	/** For the test: how many seconds the clock is moved on. */
	private static int skew;
	/** Each dimension's points as x, z and the second they were walked, the oldest first. */
	static final Map<String, List<int[]>> trails = new HashMap<>();

	static void clear() {
		trails.clear();
	}

	private static int now() {
		return (int) ((System.currentTimeMillis() - START) / 1000) + skew;
	}

	private static int length() {
		int minutes = SlashHud.config == null ? 5 : SlashHud.config.mapTrailMinutes;
		return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, minutes)) * 60;
	}

	/** Drops the points older than the trail's length. */
	private static void expire(List<int[]> list) {
		int oldest = now() - length(), gone = 0;
		while (gone < list.size() && list.get(gone)[2] < oldest) gone++;
		if (gone > 0) list.subList(0, gone).clear();
	}

	public static void tick(Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.mapTrail || mc.player == null || mc.level == null) return;
		List<int[]> list = trails.computeIfAbsent(Waypoints.dimension(mc), k -> new ArrayList<>());
		expire(list);
		int x = mc.player.getBlockX(), z = mc.player.getBlockZ();
		if (!list.isEmpty()) {
			int[] last = list.get(list.size() - 1);
			int dx = x - last[0], dz = z - last[1];
			if (dx * dx + dz * dz < STEP * STEP) return;
		}
		list.add(new int[] { x, z, now() });
		if (list.size() > MAX) list.subList(0, list.size() - MAX).clear();
	}

	/** The points walked lately in this dimension (none when the trail is off). */
	public static List<int[]> shown(Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.mapTrail) return List.of();
		List<int[]> list = trails.get(Waypoints.dimension(mc));
		if (list == null) return List.of();
		expire(list);
		return list;
	}

	/**
	 * The map's area cut in cells of a dot's size, each taken by the first (newest) dot drawn in it: a long walk
	 * around one place puts hundreds of points on the same few pixels, and drawing each of them cost frames.
	 */
	private static final java.util.BitSet taken = new java.util.BitSet();
	private static int areaX, areaY, cols, rows, cell = 1;
	/** For the test: the dots drawn in the last map drawn. */
	static int drawn;

	/** Before the dots of one map: its area on the screen and the dots' size. */
	static void start(int x, int y, int w, int h, int size) {
		taken.clear();
		cell = Math.max(1, size);
		areaX = x;
		areaY = y;
		cols = w / cell + 2;
		rows = h / cell + 2;
		drawn = 0;
	}

	/** How strong a point shows: 240 when just walked, fading to 0 over the trail's length. */
	static int alpha(int[] point) {
		float left = 1f - (float) (now() - point[2]) / length();
		return Math.round(240 * Math.max(0f, Math.min(1f, left)));
	}

	/** The trail's colour at this strength, laid over `under` (both 0xAARRGGBB), for a picture painted by hand. */
	static int over(int under, int alpha) {
		int r = ((under >> 16 & 0xFF) * (255 - alpha) + (COLOR >> 16 & 0xFF) * alpha) / 255;
		int gr = ((under >> 8 & 0xFF) * (255 - alpha) + (COLOR >> 8 & 0xFF) * alpha) / 255;
		int b = ((under & 0xFF) * (255 - alpha) + (COLOR & 0xFF) * alpha) / 255;
		return under & 0xFF000000 | r << 16 | gr << 8 | b;
	}

	/**
	 * What the trail looks like now, for the minimap to paint it again only when this changes: a point added or gone,
	 * and every two seconds as the dots fade.
	 */
	static long look(Minecraft mc) {
		List<int[]> list = shown(mc);
		if (list.isEmpty()) return 0;
		int[] first = list.get(0), last = list.get(list.size() - 1);
		return ((long) list.size() * 31 + first[2]) * 31 * 31 + (long) last[2] * 31 + now() / 2 + 1;
	}

	/** A dot of the trail: bright when just walked, fading out as it gets older; none where a newer one is drawn. */
	static void dot(GuiGraphicsExtractor g, float x, float y, int size, int[] point) {
		int alpha = alpha(point);
		if (alpha < 8) return;
		int px = Math.round(x - size / 2f), py = Math.round(y - size / 2f);
		int col = Math.floorDiv(px - areaX, cell) + 1, row = Math.floorDiv(py - areaY, cell) + 1;
		if (col >= 0 && row >= 0 && col < cols && row < rows) {
			int at = row * cols + col;
			if (taken.get(at)) return;
			taken.set(at);
		}
		drawn++;
		g.fill(px, py, px + size, py + size, alpha << 24 | COLOR & 0xFFFFFF);
	}

	/** For the test: the dots drawn in the last map drawn. */
	public static int drawnForTest() {
		return drawn;
	}

	/** For the test: a long walk round and round one place, `count` points (a few minutes of running in circles). */
	public static void walkInCirclesForTest(Minecraft mc, int count) {
		List<int[]> list = trails.computeIfAbsent(Waypoints.dimension(mc), k -> new ArrayList<>());
		int x = mc.player.getBlockX(), z = mc.player.getBlockZ(), t = now();
		for (int i = 0; i < count; i++) {
			double a = i * 0.21;
			int r = 6 + i % 20;
			list.add(new int[] { x + (int) Math.round(Math.cos(a) * r), z + (int) Math.round(Math.sin(a) * r), t });
		}
		if (list.size() > MAX) list.subList(0, list.size() - MAX).clear();
	}

	/** For the test: the clock moved on by `seconds`, as if that much time had passed. */
	public static void passForTest(int seconds) {
		skew += seconds;
	}
}
