package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Player;

/**
 * Compact hearts: however much health, one row. The first 20 health are the game's red hearts;
 * each further 20 fill the row again in the next colour, over the full row of the one before,
 * and a small "×3" on the left says how many rows that is. Absorption shows as a golden "+4" left of it.
 */
public final class Hearts {
	private Hearts() {}

	private static final Identifier CONTAINER = Identifier.withDefaultNamespace("hud/heart/container");
	private static final Identifier CONTAINER_BLINK = Identifier.withDefaultNamespace("hud/heart/container_blinking");
	private static final Identifier FULL = Identifier.withDefaultNamespace("hud/heart/full");
	private static final Identifier HALF = Identifier.withDefaultNamespace("hud/heart/half");
	/** A white heart of our own (and its half), tinted to each row's colour: the game's pale hearts are blue and turn the colours green. */
	private static final Identifier TINT_FULL = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/heart_tint_full.png");
	private static final Identifier TINT_HALF = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/heart_tint_half.png");
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
		// both on the left of the row: right of it is the middle of the screen, where the game draws the
		// experience level over them, and further on the food bar
		var font = Minecraft.getInstance().font;
		int left = x - 3;
		if (layer > 0) {
			Component rows = Component.literal("×" + (layer + 1));
			left -= font.width(rows);
			g.text(font, rows, left, y + 1, layerColor(layer), true);
			left -= 3;
		}
		if (absorption > 0) {
			Component extra = Component.literal("+" + (absorption + 1) / 2);
			g.text(font, extra, left - font.width(extra), y + 1, 0xFFFFD84A, true);
		}
	}

	/**
	 * The hearts health going up to `to` would fill, flashing (FoodPreview): in the colour of the row
	 * that health reaches, from where the row shown now ends (a row filled further, or the next one).
	 */
	public static void preview(GuiGraphicsExtractor g, int x, int y, int health, int to, int flash) {
		int layer = Math.max(0, (health - 1) / 20), toLayer = Math.max(0, (to - 1) / 20);
		int from = toLayer > layer ? 0 : health - layer * 20, top = to - toLayer * 20;
		for (int i = from / 2; i * 2 < top; i++) {
			boolean full = top - i * 2 >= 2;
			if (toLayer == 0) g.blitSprite(RenderPipelines.GUI_TEXTURED, full ? FULL : HALF, x + i * 8, y, 9, 9, flash | 0xFFFFFF);
			else tinted(g, full, x + i * 8, y, flash | (layerColor(toLayer) & 0xFFFFFF));
		}
	}

	/** The rows' colours and how many hearts each reaches ("❤ 10  ❤ 20 …", each in its colour), for the settings. */
	public static Component legend() {
		var out = Component.empty();
		for (int layer = 0; layer <= LAYERS.length; layer++) {
			if (layer > 0) out.append("  ");
			int color = layerColor(layer) & 0xFFFFFF;
			out.append(Component.literal("❤ " + (layer + 1) * 10).withStyle(s -> s.withColor(color)));
		}
		return out;
	}

	private static void heart(GuiGraphicsExtractor g, int layer, boolean full, int x, int y) {
		if (layer == 0) g.blitSprite(RenderPipelines.GUI_TEXTURED, full ? FULL : HALF, x, y, 9, 9);
		else tinted(g, full, x, y, layerColor(layer));
	}

	private static void tinted(GuiGraphicsExtractor g, boolean full, int x, int y, int color) {
		g.blit(RenderPipelines.GUI_TEXTURED, full ? TINT_FULL : TINT_HALF, x, y, 0, 0, 9, 9, 9, 9, 9, 9, color);
	}
}
