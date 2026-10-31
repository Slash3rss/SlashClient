package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/**
 * The game's own scoreboard and tab list with rounded corners, like the modules (the HUD-wide corner
 * setting, or the part's own). While the game draws one of them, its backgrounds that reach the top
 * or the bottom edge of the whole are drawn rounded there; the rest (the tab list's player rows) stay as they are.
 */
public final class GameRound {
	private GameRound() {}

	/** The part being drawn now (left, top, right, bottom, as the game lays it out), or null. */
	private static int[] box;
	private static int radius;
	/** Drawing the rounded shape itself (its own fills go through as they are). */
	private static boolean inside;

	/** The game starts drawing a part laid out in `rect` (null: nothing is rounded). */
	public static void begin(String part, int[] rect) {
		HudConfig c = SlashHud.config;
		radius = c == null ? 0 : c.placement(part).radius(c);
		box = radius > 0 ? rect : null;
	}

	public static void end() {
		box = null;
	}

	/** A background fill of the game's: drawn rounded here (true) when it is the part's top or bottom across its width. */
	public static boolean fill(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2, int color) {
		if (box == null || inside) return false;
		int l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
		if (l > box[0] + 1 || r < box[2] - 1) return false;
		boolean top = Math.abs(t - box[1]) <= 1, bottom = Math.abs(b - box[3]) <= 1;
		if (!top && !bottom) return false;
		inside = true;
		try {
			Ui.round(g, l, t, r - l, b - t, radius, top, bottom, color);
		} finally {
			inside = false;
		}
		return true;
	}
}
