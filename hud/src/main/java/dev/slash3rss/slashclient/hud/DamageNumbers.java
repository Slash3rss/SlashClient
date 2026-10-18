package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * Damage indicators: when a mob or player near you loses health, the amount rises from above it
 * for a second (yellow, orange for a hard hit, red for a big one). Health is read from what the
 * server sends every client; drawn on the HUD where the entity is.
 */
final class DamageNumbers {
	private DamageNumbers() {}

	private static final double RANGE_SQ = 32 * 32;
	private static final long LIFE_MS = 1000;
	private record Pop(double x, double y, double z, String text, int color, long at) {}

	private static final Map<Integer, Float> health = new HashMap<>();
	private static final List<Pop> pops = new ArrayList<>();
	private static final Random RANDOM = new Random();

	static void tick(Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.damageNumbers || mc.level == null || mc.player == null) {
			health.clear();
			pops.clear();
			return;
		}
		Set<Integer> seen = new HashSet<>();
		for (Entity e : mc.level.entitiesForRendering()) {
			if (!(e instanceof LivingEntity living) || living.distanceToSqr(mc.player) > RANGE_SQ) continue;
			seen.add(living.getId());
			float now = living.getHealth();
			Float before = health.put(living.getId(), now);
			// your own, in first person, would rise into your eyes
			if (before == null || before - now < 0.05f || (living == mc.player && mc.options.getCameraType().isFirstPerson())) continue;
			float lost = before - now;
			String text = lost >= 10 || Math.abs(lost - Math.round(lost)) < 0.05f ? String.valueOf(Math.round(lost)) : String.format(Locale.ROOT, "%.1f", lost);
			int color = lost >= 8 ? 0xFF5555 : lost >= 4 ? 0xFFAA00 : 0xFFFF55;
			pops.add(new Pop(living.getX() + (RANDOM.nextDouble() - 0.5) * 0.6, living.getY() + living.getBbHeight() + 0.25,
				living.getZ() + (RANDOM.nextDouble() - 0.5) * 0.6, "-" + text, color, System.currentTimeMillis()));
		}
		health.keySet().retainAll(seen);
		long now = System.currentTimeMillis();
		pops.removeIf(p -> now - p.at() > LIFE_MS);
	}

	/** For the test. */
	static int count() {
		return pops.size();
	}

	/** On the HUD, every frame: each number rises a little and fades. */
	static void draw(GuiGraphicsExtractor g, Minecraft mc) {
		if (pops.isEmpty() || mc.level == null) return;
		long now = System.currentTimeMillis();
		int w = g.guiWidth(), h = g.guiHeight();
		for (Pop p : pops) {
			float t = Math.min(1f, (now - p.at()) / (float) LIFE_MS);
			int[] at = Waypoints.project(mc, p.x(), p.y() + t * 0.7, p.z(), w, h);
			if (at == null) continue;
			int alpha = t < 0.6f ? 255 : Math.max(8, Math.round(255 * (1 - (t - 0.6f) / 0.4f)));
			g.text(mc.font, p.text(), at[0] - mc.font.width(p.text()) / 2, at[1], (alpha << 24) | p.color(), true);
		}
	}
}
