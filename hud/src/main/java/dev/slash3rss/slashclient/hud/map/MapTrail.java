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

	/** A dot of the trail: bright when just walked, fading out as it gets older. */
	static void dot(GuiGraphicsExtractor g, float x, float y, int size, int[] point) {
		float left = 1f - (float) (now() - point[2]) / length();
		int alpha = Math.round(240 * Math.min(1f, left));
		if (alpha < 8) return;
		int px = Math.round(x - size / 2f), py = Math.round(y - size / 2f);
		g.fill(px, py, px + size, py + size, alpha << 24 | COLOR & 0xFFFFFF);
	}

	/** For the test: the clock moved on by `seconds`, as if that much time had passed. */
	public static void passForTest(int seconds) {
		skew += seconds;
	}
}
