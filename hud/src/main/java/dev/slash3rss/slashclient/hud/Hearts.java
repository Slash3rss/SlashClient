package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Player;

/**
 * Compact hearts: however much health, one row. The first 20 health are the game's red hearts;
 * each further 20 fill the row again in the next colour, over the full row of the one before,
 * and a small "×3" says how many rows that is. Absorption shows as a golden "+4" on the left.
 */
public final class Hearts {
	private Hearts() {}

	private static final Identifier CONTAINER = Identifier.withDefaultNamespace("hud/heart/container");
	private static final Identifier CONTAINER_BLINK = Identifier.withDefaultNamespace("hud/heart/container_blinking");
	private static final Identifier FULL = Identifier.withDefaultNamespace("hud/heart/full");
	private static final Identifier HALF = Identifier.withDefaultNamespace("hud/heart/half");
	// pale hearts take a colour well
	private static final Identifier PALE_FULL = Identifier.withDefaultNamespace("hud/heart/frozen_full");
	private static final Identifier PALE_HALF = Identifier.withDefaultNamespace("hud/heart/frozen_half");
	/** The rows' colours after the first (red) one. */
	static final int[] LAYERS = { 0xFFFFB627, 0xFF5BE35B, 0xFF4FD4FF, 0xFFC084FC, 0xFFFF6FB5, 0xFFFFFFFF };

	static int layerColor(int layer) {
		return layer == 0 ? 0xFFFF5555 : LAYERS[(layer - 1) % LAYERS.length];
	}

	public static void draw(GuiGraphicsExtractor g, Player player, int x, int y, int regen, int health, int absorption, boolean blink) {
		int layer = Math.max(0, (health - 1) / 20);
		int top = health - layer * 20;
		for (int i = 0; i < 10; i++) {
			int hx = x + i * 8;
			// the regeneration wave runs along the row as in the game
			int hy = y + (regen >= 0 && regen % 10 == i ? -2 : 0);
			g.blitSprite(RenderPipelines.GUI_TEXTURED, blink ? CONTAINER_BLINK : CONTAINER, hx, hy, 9, 9);
			if (layer > 0) heart(g, layer - 1, true, hx, hy);
			int value = top - i * 2;
			if (value >= 2) heart(g, layer, true, hx, hy);
			else if (value == 1) heart(g, layer, false, hx, hy);
		}
		var font = Minecraft.getInstance().font;
		if (layer > 0) g.text(font, Component.literal("×" + (layer + 1)), x + 82, y + 1, layerColor(layer), true);
		// absorption on the left of the row: on the right the food bar is close
		if (absorption > 0) {
			Component extra = Component.literal("+" + (absorption + 1) / 2);
			g.text(font, extra, x - 3 - font.width(extra), y + 1, 0xFFFFD84A, true);
		}
	}

	private static void heart(GuiGraphicsExtractor g, int layer, boolean full, int x, int y) {
		if (layer == 0) g.blitSprite(RenderPipelines.GUI_TEXTURED, full ? FULL : HALF, x, y, 9, 9);
		else g.blitSprite(RenderPipelines.GUI_TEXTURED, full ? PALE_FULL : PALE_HALF, x, y, 9, 9, layerColor(layer));
	}
}
