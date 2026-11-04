package dev.slash3rss.slashclient.hud.map;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The biomes the map has seen, for the full map's biome view: each biome's id ("minecraft:plains") is kept once per
 * world and chunks store its number, a colour for each (by its kind: oceans blue, deserts sand, snowy ones white…,
 * slightly apart for biomes of the same kind) and its name in the game's language.
 */
public final class MapBiomes {
	private MapBiomes() {}

	private static final List<String> names = new ArrayList<>();
	private static final Map<String, Short> numbers = new HashMap<>();

	/** Forgets the biomes' numbers (another world). */
	static void clear() {
		names.clear();
		numbers.clear();
	}

	/** A biome's number in this world (1 and up; 0 is "not known"). */
	static short number(String id) {
		Short n = numbers.get(id);
		if (n != null) return n;
		if (names.size() >= Short.MAX_VALUE - 1) return 0;
		names.add(id);
		short made = (short) names.size();
		numbers.put(id, made);
		return made;
	}

	/** The id of a number, or null. */
	static String id(short n) {
		return n <= 0 || n > names.size() ? null : names.get(n - 1);
	}

	/** All the ids in their numbers' order (for saving). */
	static List<String> ids() {
		return List.copyOf(names);
	}

	/** The colour a biome is drawn in (0xRRGGBB). */
	static int color(String id) {
		if (id == null) return 0;
		String n = id.substring(id.indexOf(':') + 1);
		int base;
		if (n.contains("deep") && n.contains("ocean")) base = 0x1E3A8A;
		else if (n.contains("frozen") || n.contains("ice") || n.contains("snowy") || n.contains("frozen_peaks")) base = 0xDDEBF5;
		else if (n.contains("ocean")) base = 0x2563EB;
		else if (n.contains("river")) base = 0x60A5FA;
		else if (n.contains("beach") || n.contains("shore")) base = 0xF1E2A8;
		else if (n.contains("desert")) base = 0xE9D58A;
		else if (n.contains("badlands")) base = 0xD9773A;
		else if (n.contains("savanna")) base = 0xBDB24A;
		else if (n.contains("jungle") || n.contains("bamboo")) base = 0x2FAE35;
		else if (n.contains("swamp") || n.contains("mangrove")) base = 0x4B6B3A;
		else if (n.contains("cherry")) base = 0xF4A6C8;
		else if (n.contains("mushroom")) base = 0xB25FB8;
		else if (n.contains("taiga") || n.contains("grove")) base = 0x3D7A5E;
		else if (n.contains("dark_forest") || n.contains("pale")) base = 0x2F4F2A;
		else if (n.contains("forest") || n.contains("birch")) base = 0x3E9442;
		else if (n.contains("peaks") || n.contains("slopes") || n.contains("hills") || n.contains("windswept") || n.contains("stony")) base = 0x8D9199;
		else if (n.contains("meadow") || n.contains("plains") || n.contains("sunflower")) base = 0x8CCB5E;
		else if (n.contains("deep_dark") || n.contains("cave") || n.contains("dripstone")) base = 0x3A3F55;
		else if (n.contains("nether") || n.contains("crimson") || n.contains("basalt") || n.contains("soul") || n.contains("warped")) base = n.contains("warped") ? 0x168F86 : n.contains("soul") ? 0x6B5546 : 0x9B2C2C;
		else if (n.contains("end") || n.contains("void")) base = 0xB59AD8;
		else base = 0x9CA3AF;
		// biomes of one kind told apart: a little lighter or darker by their name
		float f = 0.88f + (Math.floorMod(n.hashCode(), 7)) * 0.04f;
		return MinimapTerrain.shade(base, f);
	}

	/** A biome's name in the game's language ("Równiny"), or its id when the game has none. */
	public static String name(String id) {
		if (id == null) return "";
		String key = "biome." + id.replace(':', '.');
		String s = net.minecraft.client.resources.language.I18n.get(key);
		return s.equals(key) ? id : s;
	}
}
