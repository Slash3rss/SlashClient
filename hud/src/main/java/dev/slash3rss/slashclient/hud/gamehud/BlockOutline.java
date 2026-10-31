package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * The outline of the block looked at in its own colour, opacity and thickness
 * (mixin.BlockOutlineMixin, mixin.LineWidthMixin). Off, everything stays the game's.
 *
 * The thickness is a multiple of the game's own line width. From 1.21.11 on that width is passed
 * with the lines and is changed right there; before, the lines shader takes it from
 * RenderSystem.lineWidth, which the lines' render type sets when its batch is drawn: the outline
 * marks the next such call as its own ({@link #widthPending}).
 */
public final class BlockOutline {
	private BlockOutline() {}

	/** How many outlines were drawn in our colour (for the tests). */
	public static int drawn;
	/** Before 1.21.11: the next line width set (not the reset to 1) is the outline's. */
	public static boolean widthPending;

	public static boolean on() {
		return SlashHud.config != null && SlashHud.config.blockOutline;
	}

	/** Our colour with its opacity as ARGB, or the game's. */
	public static int color(int vanilla) {
		if (!on()) return vanilla;
		drawn++;
		HudConfig c = SlashHud.config;
		int alpha = Math.round(Math.max(0, Math.min(100, c.blockOutlineOpacity)) * 2.55f);
		return alpha << 24 | (c.blockOutlineColor & 0xFFFFFF);
	}

	/** The line width times our thickness, or the game's. */
	public static float width(float vanilla) {
		return on() ? vanilla * Math.max(0.1f, SlashHud.config.blockOutlineWidth) : vanilla;
	}

	/** RenderSystem.lineWidth's value: the outline's batch gets our thickness. */
	public static float lineWidth(float width) {
		if (!widthPending || width == 1f) return width;
		widthPending = false;
		return width(width);
	}

	/** The outline is about to be drawn: its batch's line width is ours. */
	public static void markWidth() {
		widthPending = on() && SlashHud.config.blockOutlineWidth != 1f;
	}
}
