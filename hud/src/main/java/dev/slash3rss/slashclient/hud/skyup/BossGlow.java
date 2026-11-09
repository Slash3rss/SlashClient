package dev.slash3rss.slashclient.hud.skyup;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Mob;

import java.util.HashMap;
import java.util.Map;

/**
 * In a SkyUp dungeon the mini bosses (and the elites, when wanted) glow the game's own way: an
 * outline seen through walls, in their class's colour, so in a crowd of spawned mobs the player
 * sees at once whether the boss is still alive and where. With names written in the settings
 * ("Czyken, Żniwiarz") only the mobs with one of them in their name glow, whatever their class.
 * Worked out once a tick (DropGlowMixin asks every frame).
 */
public final class BossGlow {
	private BossGlow() {}

	public static final int BOSS = 0xDC2626, ELITE = 0xF97316, OTHER = 0xFACC15;
	/** How far mobs glow: about as far as a dungeon's room or two. */
	private static final double RANGE = 64;
	/** The mobs glowing now: entity id → colour (0xRRGGBB). */
	private static Map<Integer, Integer> glowing = Map.of();

	/** The glow colour of a mob (0xRRGGBB), or -1 when it does not glow. */
	public static int glowColor(Entity entity) {
		if (glowing.isEmpty()) return -1;
		Integer c = glowing.get(entity.getId());
		return c == null ? -1 : c;
	}

	/** The mobs glowing now (for the test). */
	public static Map<Integer, Integer> glowing() {
		return glowing;
	}

	public static void tick(Minecraft mc) {
		HudConfig c = SlashHud.config;
		java.util.List<String> names = names(c == null ? "" : c.dungeonGlowNames);
		if (c == null || !c.dungeonBossGlow && !c.dungeonEliteGlow && names.isEmpty() || mc.level == null || mc.player == null || !DungeonMap.active()) {
			glowing = Map.of();
			return;
		}
		Map<Integer, Integer> out = new HashMap<>();
		double r2 = RANGE * RANGE;
		for (Entity e : mc.level.entitiesForRendering()) {
			if (!(e instanceof Mob) && !(e instanceof AbstractClientPlayer) || e == mc.player || !e.isAlive() || e.distanceToSqr(mc.player) > r2) continue;
			int kind = DungeonMap.kind(e);
			if (!names.isEmpty()) {
				// only the mobs named, in their class's colour
				if (named(DungeonMap.namesOf(e), names)) out.put(e.getId(), kind == 3 ? BOSS : kind == 2 ? ELITE : OTHER);
				continue;
			}
			if (kind == 3 && c.dungeonBossGlow) out.put(e.getId(), BOSS);
			else if (kind == 2 && c.dungeonEliteGlow) out.put(e.getId(), ELITE);
		}
		glowing = out;
	}

	/** The names written in the settings, split by commas, without case. */
	static java.util.List<String> names(String text) {
		java.util.List<String> out = new java.util.ArrayList<>();
		if (text != null) for (String n : text.split(",")) {
			String s = n.strip().toLowerCase(java.util.Locale.ROOT);
			if (!s.isEmpty()) out.add(s);
		}
		return out;
	}

	/** Whether a mob's names have one of those written in them. */
	static boolean named(String mobNames, java.util.List<String> names) {
		String lower = mobNames.toLowerCase(java.util.Locale.ROOT);
		for (String n : names) if (lower.contains(n)) return true;
		return false;
	}
}
