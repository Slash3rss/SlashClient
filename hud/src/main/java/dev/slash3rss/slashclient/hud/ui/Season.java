package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import java.time.LocalDate;

/**
 * The seasonal look, as in the launcher: around Halloween (25 October – 2 November) SlashClient's
 * menus and loading screen turn orange and violet, with bats flying over them and the logo with a
 * pumpkin. "Wygląd sezonowy" in the HUD window switches it off.
 */
public final class Season {
	private Season() {}

	/** For the tests: the season on or off whatever the date (null: the date decides). */
	public static Boolean forTest;
	/** False when the launcher said the look is off (its setting or the admin's switch, slashclient-launcher.json). */
	public static boolean launcherAllows = true;

	public static boolean halloween() {
		if (forTest != null) return forTest;
		if (!launcherAllows || SlashHud.config != null && !SlashHud.config.seasonalLook) return false;
		LocalDate d = LocalDate.now();
		return (d.getMonthValue() == 10 && d.getDayOfMonth() >= 25) || (d.getMonthValue() == 11 && d.getDayOfMonth() <= 2);
	}

	/** The accent's colours: orange in the season, the launcher's blue otherwise. */
	public static int accent() {
		return halloween() ? 0xFFF97316 : 0xFF3B82F6;
	}

	public static int accentLight() {
		return halloween() ? 0xFFFB923C : 0xFF60A5FA;
	}

	public static int accentDark() {
		return halloween() ? 0xFFC2410C : 0xFF1D4ED8;
	}

	/** Every window's accent (Ui) as the season says: called each tick, so the date, the setting or a test switch it at once. */
	public static void refresh() {
		boolean on = halloween();
		Ui.ACCENT = accent();
		Ui.ACCENT_LIGHT = accentLight();
		Ui.ACCENT_DARK = accentDark();
		Ui.ACCENT_PALE = on ? 0xFFFDBA74 : 0xFF93C5FD;
	}

	private static final net.minecraft.resources.Identifier LOGO = net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud", "icon-halloween.png");

	/** The logo: in the season orange, with a pumpkin in its corner (scripts/make-season-logo.cjs), else `usual`. */
	public static net.minecraft.resources.Identifier logo(net.minecraft.resources.Identifier usual) {
		return halloween() ? LOGO : usual;
	}

	/** A bat, 9×5 pixels, its wings up ('X' a pixel) and down. */
	private static final String[][] BAT = {
		{ "X.......X", "XX.....XX", "XXX.X.XXX", ".XXXXXXX.", "...X.X..." },
		{ "...X.X...", ".XXXXXXX.", "XXX.X.XXX", "XX.....XX", "X.......X" },
	};

	/**
	 * The season over a menu: a warm, violet tint and a few bats crossing the upper part of the screen,
	 * flapping as they go (standing still when `still`). Nothing outside the season.
	 */
	public static void sky(GuiGraphicsExtractor g, int w, int h, long ms, boolean still) {
		if (!halloween()) return;
		g.fillGradient(0, 0, w, h, 0x26EA580C, 0x307E22CE);
		int bats = Math.max(3, Math.min(7, w / 70));
		for (int i = 0; i < bats; i++) {
			// each one its own height, speed and way, from its number: the same bats every frame
			int scale = 1 + (i % 3 == 0 ? 1 : 0);
			double speed = 9 + (i * 7 % 11);
			boolean left = i % 2 == 0;
			int span = w + 40;
			int base = (int) ((i * 97L) % span);
			int run = still ? 0 : (int) (ms / 1000.0 * speed);
			int x = Math.floorMod(base + (left ? -run : run), span) - 20;
			int y = 12 + (int) ((i * 53L) % Math.max(20, h / 2)) + (still ? 0 : (int) Math.round(Math.sin(ms / 700.0 + i) * 4));
			int frame = still ? 0 : (int) ((ms / 160 + i) % 2);
			bat(g, x, y, scale, frame);
		}
	}

	private static void bat(GuiGraphicsExtractor g, int x, int y, int scale, int frame) {
		String[] rows = BAT[frame];
		for (int r = 0; r < rows.length; r++) {
			for (int c = 0; c < rows[r].length(); c++) {
				if (rows[r].charAt(c) != 'X') continue;
				g.fill(x + c * scale, y + r * scale, x + (c + 1) * scale, y + (r + 1) * scale, 0xE0140A1E);
			}
		}
	}
}
