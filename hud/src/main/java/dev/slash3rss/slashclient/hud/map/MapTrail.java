package dev.slash3rss.slashclient.hud.map;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Where the player walked, per dimension of this world: a point each few blocks, the last MAX of them, drawn as dots
 * on the minimap and the full map (fainter the older they are). Saved with the map (MapStore).
 */
public final class MapTrail {
	private MapTrail() {}

	static final int MAX = 4000;
	/** A new point once the player is this far (in blocks) from the last one. */
	private static final int STEP = 3;
	private static final int COLOR = 0xFFE8C468;
	/** Each dimension's points as x, z pairs, the oldest first. */
	static final Map<String, List<int[]>> trails = new HashMap<>();

	static void clear() {
		trails.clear();
	}

	static List<int[]> of(String dimension) {
		return trails.computeIfAbsent(dimension, k -> new ArrayList<>());
	}

	public static void tick(Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.mapTrail || mc.player == null || mc.level == null) return;
		String dim = Waypoints.dimension(mc);
		List<int[]> list = of(dim);
		int x = mc.player.getBlockX(), z = mc.player.getBlockZ();
		if (!list.isEmpty()) {
			int[] last = list.get(list.size() - 1);
			int dx = x - last[0], dz = z - last[1];
			if (dx * dx + dz * dz < STEP * STEP) return;
		}
		list.add(new int[] { x, z });
		if (list.size() > MAX) list.subList(0, list.size() - MAX).clear();
		MapStore.changed(dim);
	}

	/** Prepends points loaded from disk (older than those walked now). */
	static void merge(String dimension, List<int[]> loaded) {
		List<int[]> now = of(dimension);
		List<int[]> all = new ArrayList<>(loaded);
		all.addAll(now);
		if (all.size() > MAX) all = new ArrayList<>(all.subList(all.size() - MAX, all.size()));
		trails.put(dimension, all);
	}

	/** The points walked in this dimension (none when the trail is off). */
	public static List<int[]> shown(Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.mapTrail) return List.of();
		List<int[]> list = trails.get(Waypoints.dimension(mc));
		return list == null ? List.of() : list;
	}

	/** A dot of the trail, the `i`th of `n` (the newest brightest). */
	static void dot(GuiGraphicsExtractor g, float x, float y, int size, int i, int n) {
		int alpha = 70 + Math.round(170f * (i + 1) / n);
		int px = Math.round(x - size / 2f), py = Math.round(y - size / 2f);
		g.fill(px, py, px + size, py + size, alpha << 24 | COLOR & 0xFFFFFF);
	}
}
