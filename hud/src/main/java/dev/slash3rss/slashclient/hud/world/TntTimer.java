package dev.slash3rss.slashclient.hud.world;

import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.PrimedTnt;

import java.util.Locale;

/**
 * The seconds left above lit TNT, green, then yellow, then red: written as the TNT's name, so the
 * game draws it where the TNT is (only on our side; the server never hears of it).
 */
public final class TntTimer {
	private TntTimer() {}

	private static final double RANGE_SQ = 64 * 64;

	public static void tick(Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.tntTimer || mc.level == null || mc.player == null) return;
		for (Entity e : mc.level.entitiesForRendering()) {
			if (!(e instanceof PrimedTnt tnt) || tnt.distanceToSqr(mc.player) > RANGE_SQ) continue;
			float seconds = Math.max(0, tnt.getFuse()) / 20f;
			int color = seconds > 2 ? 0x55FF55 : seconds > 1 ? 0xFFFF55 : 0xFF5555;
			tnt.setCustomName(Component.literal(String.format(Locale.ROOT, "%.1f s", seconds)).withStyle(Style.EMPTY.withColor(color)));
			tnt.setCustomNameVisible(true);
		}
	}
}
