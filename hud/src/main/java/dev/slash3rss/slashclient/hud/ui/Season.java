package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import java.time.LocalDate;

/**
 * The seasonal looks, as in the launcher: around Halloween (25 October – 2 November) SlashClient's menus
 * and loading screen turn orange and violet, with bats flying over them and the logo with a pumpkin; around
 * Poland's Independence Day (8 – 12 November) they turn white and red, with confetti drifting down, the logo
 * in white and red and "POLSKA GUROM!" on fire in the main menu. "Wygląd sezonowy" in the HUD window switches it off.
 */
public final class Season {
	private Season() {}

	public static final String HALLOWEEN = "halloween", INDEPENDENCE = "independence";

	/** For the tests: this season ("" none) whatever the date (null: the date decides). */
	public static String forTest;
	/** False when the launcher said the look is off (its setting or the admin's switch, slashclient-launcher.json). */
	public static boolean launcherAllows = true;

	/** The season now (HALLOWEEN, INDEPENDENCE), or null outside them or when the look is off. */
	public static String current() {
		if (forTest != null) return forTest.isEmpty() ? null : forTest;
		if (!launcherAllows || SlashHud.config != null && !SlashHud.config.seasonalLook) return null;
		LocalDate d = LocalDate.now();
		if ((d.getMonthValue() == 10 && d.getDayOfMonth() >= 25) || (d.getMonthValue() == 11 && d.getDayOfMonth() <= 2)) return HALLOWEEN;
		if (d.getMonthValue() == 11 && d.getDayOfMonth() >= 8 && d.getDayOfMonth() <= 12) return INDEPENDENCE;
		return null;
	}

	public static boolean halloween() {
		return HALLOWEEN.equals(current());
	}

	public static boolean independence() {
		return INDEPENDENCE.equals(current());
	}

	/** The accent's colours: orange for Halloween, red for Independence Day, the launcher's blue otherwise. */
	public static int accent() {
		String s = current();
		return HALLOWEEN.equals(s) ? 0xFFF97316 : INDEPENDENCE.equals(s) ? 0xFFDC2626 : 0xFF3B82F6;
	}

	public static int accentLight() {
		String s = current();
		return HALLOWEEN.equals(s) ? 0xFFFB923C : INDEPENDENCE.equals(s) ? 0xFFF87171 : 0xFF60A5FA;
	}

	public static int accentDark() {
		String s = current();
		return HALLOWEEN.equals(s) ? 0xFFC2410C : INDEPENDENCE.equals(s) ? 0xFFB91C1C : 0xFF1D4ED8;
	}

	/** Every window's accent (Ui) as the season says: called each tick, so the date, the setting or a test switch it at once. */
	public static void refresh() {
		String s = current();
		Ui.ACCENT = accent();
		Ui.ACCENT_LIGHT = accentLight();
		Ui.ACCENT_DARK = accentDark();
		Ui.ACCENT_PALE = HALLOWEEN.equals(s) ? 0xFFFDBA74 : INDEPENDENCE.equals(s) ? 0xFFFECACA : 0xFF93C5FD;
	}

	private static final net.minecraft.resources.Identifier LOGO = net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud", "icon-halloween.png");
	private static final net.minecraft.resources.Identifier LOGO_PL = net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud", "icon-independence.png");

	/** The logo: orange with a pumpkin, or red with the flag (scripts/make-season-logo.cjs), else `usual`. */
	public static net.minecraft.resources.Identifier logo(net.minecraft.resources.Identifier usual) {
		String s = current();
		return HALLOWEEN.equals(s) ? LOGO : INDEPENDENCE.equals(s) ? LOGO_PL : usual;
	}

	/** The main menu's greeting: "POLSKA GUROM, <nick>!" (a Polish meme) on Independence Day, else null (the usual one). */
	public static net.minecraft.network.chat.Component greeting(String name) {
		if (!independence()) return null;
		return net.minecraft.network.chat.Component.translatable("slashclient-hud.menu.helloIndependence", name);
	}

	/**
	 * A line on fire, centred on `cx`: one rolling edge of fire behind it (lower at its ends), orange-red with
	 * a shorter yellow heart, rising above the letters; the letters outlined dark red, flickering from
	 * yellow to orange one by one.
	 */
	public static void burning(GuiGraphicsExtractor g, String text, int cx, int y, long ms, boolean still) {
		var font = net.minecraft.client.Minecraft.getInstance().font;
		int w = font.width(text), x0 = cx - w / 2, left = x0 - 3, right = x0 + w + 3, foot = y + 6;
		for (int x = left; x < right; x++) {
			double n = still ? 0.6 * Math.sin(x * 0.35) + 0.4 * Math.sin(x * 0.9)
				: 0.5 * Math.sin(x * 0.35 + ms / 110.0) + 0.3 * Math.sin(x * 0.8 - ms / 70.0) + 0.2 * Math.sin(x * 1.7 + ms / 45.0);
			double taper = Math.sqrt(Math.max(0, Math.sin(Math.PI * (x - left + 0.5) / (right - left))));
			int outer = (int) Math.round((8 + 6 * (0.5 + 0.5 * n)) * taper), inner = (int) Math.round(outer * 0.5);
			for (int j = 0; j < outer; j++) {
				float t = j / (float) Math.max(1, outer);
				int c = t < 0.45f ? 0xDC2626 : t < 0.8f ? 0xF97316 : 0xFB923C;
				g.fill(x, foot - j, x + 1, foot - j + 1, (int) (0xE0 * (1 - t * 0.85f)) << 24 | c);
			}
			for (int j = 0; j < inner; j++) {
				float t = j / (float) Math.max(1, inner);
				g.fill(x, foot - j, x + 1, foot - j + 1, (int) (0xF0 * (1 - t * 0.8f)) << 24 | 0xFDE047);
			}
		}
		int at = x0;
		for (int i = 0; i < text.length(); i++) {
			String ch = text.substring(i, i + 1);
			double heat = still ? 0.5 : 0.5 + 0.5 * Math.sin(ms / 110.0 + i * 0.9);
			int color = heat > 0.5 ? 0xFFFEF08A : 0xFFFDBA74;
			// a dark red outline keeps the letters readable in the fire
			for (int[] o : new int[][] { { -1, 0 }, { 1, 0 }, { 0, -1 }, { 0, 1 } }) g.text(font, ch, at + o[0], y + o[1], 0xFF450A0A, false);
			g.text(font, ch, at, y, color, false);
			at += font.width(ch);
		}
	}

	/** A bat, 9×5 pixels, its wings up ('X' a pixel) and down. */
	private static final String[][] BAT = {
		{ "X.......X", "XX.....XX", "XXX.X.XXX", ".XXXXXXX.", "...X.X..." },
		{ "...X.X...", ".XXXXXXX.", "XXX.X.XXX", "XX.....XX", "X.......X" },
	};

	/**
	 * The season over a menu: Halloween's warm, violet tint and a few bats crossing the upper part of the
	 * screen, flapping as they go; Independence Day's white-to-red tint and white and red confetti drifting
	 * down. Standing still when `still`; nothing outside the seasons.
	 */
	public static void sky(GuiGraphicsExtractor g, int w, int h, long ms, boolean still) {
		String s = current();
		if (INDEPENDENCE.equals(s)) {
			confetti(g, w, h, ms, still);
			return;
		}
		if (!HALLOWEEN.equals(s)) return;
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

	/** White and red scraps falling, each its own column, speed and sway; turning (thinner, wider) as they fall. */
	private static void confetti(GuiGraphicsExtractor g, int w, int h, long ms, boolean still) {
		g.fillGradient(0, 0, w, h, 0x14F8FAFC, 0x28DC2626);
		int count = Math.max(12, Math.min(40, w / 14));
		for (int i = 0; i < count; i++) {
			int span = h + 20;
			double speed = 12 + (i * 13 % 17);
			int fall = still ? 0 : (int) (ms / 1000.0 * speed);
			int y = Math.floorMod((int) ((i * 131L) % span) + fall, span) - 10;
			int x = (int) ((i * 211L) % Math.max(1, w)) + (still ? 0 : (int) Math.round(Math.sin(ms / 900.0 + i) * 6));
			int size = 2 + i % 2;
			int turn = still ? size : Math.max(1, (int) Math.round(size * Math.abs(Math.cos(ms / 400.0 + i))));
			int color = i % 2 == 0 ? 0xB0F8FAFC : 0xC0DC2626;
			g.fill(x, y, x + size, y + turn, color);
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
