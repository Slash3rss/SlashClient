package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.gui.GuiGraphicsExtractor;

/**
 * Crosshairs as a 21×21 grid of GUI pixels around the centre: a preset drawn from size and gap,
 * or one painted by hand in the editor ("custom", kept in the settings as a row-by-row string).
 */
public final class Crosshair {
	public static final int N = 21;
	public static final int MID = N / 2;
	public static final String[] PRESETS = { "plus", "plusdot", "t", "dot", "x", "xdot", "circle", "circledot", "square", "corners", "arrow" };
	public static final String CUSTOM = "custom";

	private static String cachedKey;
	private static boolean[] cached;

	private Crosshair() {}

	/** The pixels of a preset; true where the crosshair is. */
	public static boolean[] preset(String name, int size, int gap) {
		boolean[] p = new boolean[N * N];
		int s = Math.max(1, size), gp = Math.max(0, gap);
		// circle, square and corners: a box around the centre that grows with both
		int box = Math.min(MID - 1, gp + Math.max(1, s / 2) + 1);
		switch (name) {
			case "plus", "plusdot", "t" -> {
				for (int i = gp + 1; i <= gp + s; i++) {
					set(p, -i, 0);
					set(p, i, 0);
					set(p, 0, i);
					if (!name.equals("t")) set(p, 0, -i);
				}
				if (name.equals("plusdot")) set(p, 0, 0);
			}
			case "dot" -> {
				int r = (s - 1) / 3;
				for (int dy = -r; dy <= r; dy++) for (int dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) set(p, dx, dy);
			}
			case "x", "xdot" -> {
				for (int i = gp + 1; i <= gp + s; i++) {
					set(p, i, i);
					set(p, -i, i);
					set(p, i, -i);
					set(p, -i, -i);
				}
				if (name.equals("xdot")) set(p, 0, 0);
			}
			case "circle", "circledot" -> {
				for (int dy = -MID; dy <= MID; dy++) for (int dx = -MID; dx <= MID; dx++) {
					double d = Math.sqrt(dx * dx + dy * dy);
					if (d >= box - 0.5 && d < box + 0.5) set(p, dx, dy);
				}
				if (name.equals("circledot")) set(p, 0, 0);
			}
			case "square" -> {
				for (int i = -box; i <= box; i++) {
					set(p, i, -box);
					set(p, i, box);
					set(p, -box, i);
					set(p, box, i);
				}
				set(p, 0, 0);
			}
			case "corners" -> {
				int arm = Math.max(1, Math.min(box, (s + 1) / 2));
				for (int sx = -1; sx <= 1; sx += 2) for (int sy = -1; sy <= 1; sy += 2) for (int k = 0; k < arm; k++) {
					set(p, sx * box, sy * (box - k));
					set(p, sx * (box - k), sy * box);
				}
				set(p, 0, 0);
			}
			case "arrow" -> {
				// a chevron under the centre pointing up at it
				for (int i = 0; i <= s; i++) {
					set(p, i, gp + i);
					set(p, -i, gp + i);
				}
				set(p, 0, 0);
			}
			default -> set(p, 0, 0);
		}
		return p;
	}

	private static void set(boolean[] p, int dx, int dy) {
		int x = MID + dx, y = MID + dy;
		if (x >= 0 && y >= 0 && x < N && y < N) p[y * N + x] = true;
	}

	public static String encode(boolean[] p) {
		StringBuilder b = new StringBuilder(N * (N + 1));
		for (int y = 0; y < N; y++) {
			if (y > 0) b.append('/');
			for (int x = 0; x < N; x++) b.append(p[y * N + x] ? '#' : '.');
		}
		return b.toString();
	}

	public static boolean[] decode(String s) {
		boolean[] p = new boolean[N * N];
		if (s == null) return p;
		String[] rows = s.split("/");
		for (int y = 0; y < Math.min(N, rows.length); y++)
			for (int x = 0; x < Math.min(N, rows[y].length()); x++) p[y * N + x] = rows[y].charAt(x) == '#';
		return p;
	}

	/** The pixels of a style with the current size and gap: a preset, or the painted ones for "custom". */
	public static boolean[] pixels(String style) {
		HudConfig c = SlashHud.config;
		return CUSTOM.equals(style) ? decode(c.crosshairPattern) : preset(style, c.crosshairSize, c.crosshairGap);
	}

	/** The crosshair in use, or the one switched off for now (what the editor shows). */
	public static String style() {
		HudConfig c = SlashHud.config;
		return "vanilla".equals(c.crosshair) ? c.crosshairLast : c.crosshair;
	}

	/** What is drawn now. Kept between frames, so do not change the array. */
	public static boolean[] current() {
		HudConfig c = SlashHud.config;
		String style = style();
		String key = CUSTOM.equals(style) ? "c:" + c.crosshairPattern : style + ":" + c.crosshairSize + ":" + c.crosshairGap;
		if (!key.equals(cachedKey)) {
			cached = pixels(style);
			cachedKey = key;
		}
		return cached;
	}

	/** Starts painting by hand from what is shown now: a preset becomes the custom crosshair, switched on. */
	public static boolean[] editable() {
		HudConfig c = SlashHud.config;
		boolean[] p = current().clone();
		c.crosshair = CUSTOM;
		c.crosshairPattern = encode(p);
		return p;
	}

	/**
	 * The pixels with their top-left corner at x, y, each `px` GUI pixels big. The outline is a ring
	 * of dark pixels around them, so the crosshair stays visible on snow and sky.
	 */
	public static void draw(GuiGraphicsExtractor g, int x, int y, boolean[] p, int px, int color, boolean outline) {
		draw(g, x, y, p, px, color, outline ? 0x90000000 : 0);
	}

	/** As above, the outline in its own colour (one that fades with the pixels, as the hit marker's); 0 for none. */
	public static void draw(GuiGraphicsExtractor g, int x, int y, boolean[] p, int px, int color, int dark) {
		if (dark != 0) {
			for (int cy = -1; cy <= N; cy++) for (int cx = -1; cx <= N; cx++) {
				if (on(p, cx, cy)) continue;
				boolean near = false;
				for (int oy = -1; oy <= 1 && !near; oy++) for (int ox = -1; ox <= 1; ox++) if (on(p, cx + ox, cy + oy)) {
					near = true;
					break;
				}
				if (near) g.fill(x + cx * px, y + cy * px, x + (cx + 1) * px, y + (cy + 1) * px, dark);
			}
		}
		for (int cy = 0; cy < N; cy++) {
			// runs of pixels in a row go in one fill
			int cx = 0;
			while (cx < N) {
				if (!p[cy * N + cx]) {
					cx++;
					continue;
				}
				int start = cx;
				while (cx < N && p[cy * N + cx]) cx++;
				g.fill(x + start * px, y + cy * px, x + cx * px, y + (cy + 1) * px, color);
			}
		}
	}

	private static boolean on(boolean[] p, int x, int y) {
		return x >= 0 && y >= 0 && x < N && y < N && p[y * N + x];
	}
}
