package dev.slash3rss.slashclient.hud.ui;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;

import java.util.HashMap;
import java.util.Map;

/**
 * Drawing helpers in the launcher's look: dark glass panels, the blue accent, the Outfit
 * font (assets/slashclient-hud/font). Colours are the launcher's CSS tokens.
 */
public final class Ui {
	private Ui() {}

	public static final int BG = 0xF00A0D14;
	public static final int PANEL = 0xFF111622;
	/** Cards and rows inside a panel: a step lighter than the panel, fully opaque so nothing shows through. */
	public static final int CARD = 0xFF161C2A;
	public static final int CARD_HOVER = 0xFF1C2435;
	public static final int GLASS = 0x0DFFFFFF;
	public static final int GLASS_HOVER = 0x1AFFFFFF;
	public static final int BORDER = 0x1CFFFFFF;
	public static final int ACCENT = 0xFF3B82F6;
	public static final int ACCENT_LIGHT = 0xFF60A5FA;
	public static final int ACCENT_DARK = 0xFF1D4ED8;
	public static final int TEXT = 0xFFF3F4F6;
	public static final int TEXT_2 = 0xFFB4BCC8;
	public static final int MUTED = 0xFF6B7280;
	public static final int DANGER = 0xFFEF4444;
	public static final int GREEN = 0xFF4ADE80;

	private static final FontDescription OUTFIT = new FontDescription.Resource(Identifier.fromNamespaceAndPath("slashclient-hud", "outfit"));
	private static final FontDescription OUTFIT_BOLD = new FontDescription.Resource(Identifier.fromNamespaceAndPath("slashclient-hud", "outfit_bold"));

	// ---------- layout audit (for the screenshot test) ----------

	/** Set by the in-game test: every drawn piece is checked against the screen and its box. */
	public static boolean audit;
	public static final java.util.Set<String> PROBLEMS = new java.util.LinkedHashSet<>();
	/** x, y, w, h, clip (1 = contents may be cut by a scissor and are not checked) */
	private static final java.util.ArrayDeque<int[]> BOXES = new java.util.ArrayDeque<>();
	private static final java.util.ArrayDeque<String> NAMES = new java.util.ArrayDeque<>();

	/** Things drawn until `end()` must stay inside this box. */
	public static void begin(String name, int x, int y, int w, int h) {
		BOXES.push(new int[] { x, y, w, h, 0 });
		NAMES.push(name);
	}

	/** A scrolled area: its contents may be cut at its edges, so only what is fully inside counts. */
	public static void beginClip(String name, int x, int y, int w, int h) {
		BOXES.push(new int[] { x, y, w, h, 1 });
		NAMES.push(name);
	}

	public static void end() {
		BOXES.pop();
		NAMES.pop();
	}

	private static void check(GuiGraphicsExtractor g, String what, float x, float y, float w, float h) {
		if (!audit) return;
		// to screen pixels, through any scale or move of the pose
		org.joml.Vector2f a = g.pose().transformPosition(new org.joml.Vector2f(x, y));
		org.joml.Vector2f b = g.pose().transformPosition(new org.joml.Vector2f(x + w, y + h));
		int x1 = Math.round(Math.min(a.x, b.x)), y1 = Math.round(Math.min(a.y, b.y));
		int x2 = Math.round(Math.max(a.x, b.x)), y2 = Math.round(Math.max(a.y, b.y));
		String size = g.guiWidth() + "x" + g.guiHeight();
		// cut by a scroll area: hidden on purpose, nothing to report
		for (int[] box : BOXES) {
			if (box[4] == 1 && !(x1 >= box[0] && y1 >= box[1] && x2 <= box[0] + box[2] && y2 <= box[1] + box[3])) return;
		}
		if (x1 < 0 || y1 < 0 || x2 > g.guiWidth() || y2 > g.guiHeight()) PROBLEMS.add(size + ": off screen: " + what + " [" + x1 + "," + y1 + "-" + x2 + "," + y2 + "]");
		var names = NAMES.iterator();
		for (int[] box : BOXES) {
			String name = names.next();
			if (box[4] == 1) continue;
			boolean inside = x1 >= box[0] && y1 >= box[1] && x2 <= box[0] + box[2] && y2 <= box[1] + box[3];
			if (!inside) PROBLEMS.add(size + ": sticks out of " + name + ": " + what + " [" + x1 + "," + y1 + "-" + x2 + "," + y2 + "] box [" + box[0] + "," + box[1] + "-" + (box[0] + box[2]) + "," + (box[1] + box[3]) + "]");
			return;
		}
	}

	/** A rule the layout must keep; broken ones are listed by the test. */
	public static void expect(boolean ok, String what) {
		if (audit && !ok) PROBLEMS.add(what);
	}

	// ---------- text ----------

	/** Text broken into lines of at most `w` pixels; returns the y below the last line. */
	public static int wrapped(GuiGraphicsExtractor g, Component c, int x, int y, int w, int color) {
		for (var line : Minecraft.getInstance().font.split(c, w)) {
			check(g, "wrapped line", x, y, Minecraft.getInstance().font.width(line), 8);
			g.text(Minecraft.getInstance().font, line, x, y, color, false);
			y += 11;
		}
		return y;
	}

	public static MutableComponent text(String s) {
		return Component.literal(s).withStyle(Style.EMPTY.withFont(OUTFIT));
	}

	public static MutableComponent bold(String s) {
		return Component.literal(s).withStyle(Style.EMPTY.withFont(OUTFIT_BOLD));
	}

	/** A translated text in the launcher font. */
	public static MutableComponent tr(String key, Object... args) {
		return Component.translatable(key, args).withStyle(Style.EMPTY.withFont(OUTFIT));
	}

	public static MutableComponent trBold(String key, Object... args) {
		return Component.translatable(key, args).withStyle(Style.EMPTY.withFont(OUTFIT_BOLD));
	}

	public static int width(Component c) {
		return Minecraft.getInstance().font.width(c);
	}

	public static void draw(GuiGraphicsExtractor g, Component c, int x, int y, int color) {
		check(g, "text \"" + c.getString() + "\"", x, y, width(c), 8);
		g.text(Minecraft.getInstance().font, c, x, y, color, false);
	}

	public static void centered(GuiGraphicsExtractor g, Component c, int cx, int y, int color) {
		draw(g, c, cx - width(c) / 2, y, color);
	}

	/** Text cut with "…" to fit `max` pixels. */
	public static Component fit(Component c, int max) {
		if (width(c) <= max) return c;
		String s = c.getString();
		Style style = c.getStyle();
		while (s.length() > 1 && width(Component.literal(s + "…").withStyle(style)) > max) s = s.substring(0, s.length() - 1);
		return Component.literal(s + "…").withStyle(style);
	}

	// ---------- shapes ----------

	/** A rectangle with corners rounded by `r` pixels (stepped, like the game's own art). */
	public static void round(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int color) {
		if (w <= 0 || h <= 0) return;
		check(g, "shape " + w + "x" + h, x, y, w, h);
		r = Math.min(r, Math.min(w, h) / 2);
		g.fill(x + r, y, x + w - r, y + h, color);
		for (int i = 0; i < r; i++) {
			// how far this column is cut at the top and bottom
			int cut = r - (int) Math.round(Math.sqrt(r * r - (r - i - 0.5) * (r - i - 0.5)));
			g.fill(x + i, y + cut, x + i + 1, y + h - cut, color);
			g.fill(x + w - i - 1, y + cut, x + w - i, y + h - cut, color);
		}
	}

	/** A rounded outline, one pixel wide. */
	public static void roundOutline(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int color) {
		r = Math.min(r, Math.min(w, h) / 2);
		g.fill(x + r, y, x + w - r, y + 1, color);
		g.fill(x + r, y + h - 1, x + w - r, y + h, color);
		g.fill(x, y + r, x + 1, y + h - r, color);
		g.fill(x + w - 1, y + r, x + w, y + h - r, color);
		for (int i = 1; i < r; i++) {
			int cut = r - (int) Math.round(Math.sqrt(r * r - (r - i) * (r - i)));
			g.fill(x + i, y + cut, x + i + 1, y + cut + 1, color);
			g.fill(x + w - i - 1, y + cut, x + w - i, y + cut + 1, color);
			g.fill(x + i, y + h - cut - 1, x + i + 1, y + h - cut, color);
			g.fill(x + w - i - 1, y + h - cut - 1, x + w - i, y + h - cut, color);
		}
	}

	/** A card like the launcher's glass panels. */
	public static void panel(GuiGraphicsExtractor g, int x, int y, int w, int h) {
		round(g, x, y, w, h, 6, PANEL);
		roundOutline(g, x, y, w, h, 6, BORDER);
	}

	/** The accent gradient of the launcher's primary buttons, top to bottom. */
	public static void accent(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, float strength) {
		round(g, x, y, w, h, r, blend(ACCENT_DARK, ACCENT, 0.5f));
		g.fillGradient(x + r, y + 1, x + w - r, y + h - 1, blend(ACCENT_DARK, ACCENT_LIGHT, 0.55f + strength * 0.2f), ACCENT_DARK);
	}

	// ---------- controls ----------

	/** Hover fade per control id, so buttons light up smoothly. */
	private static final Map<String, Float> HOVER = new HashMap<>();

	public static float hover(String id, boolean over) {
		float v = HOVER.getOrDefault(id, 0f);
		v += (over ? 1 : -1) * 0.18f;
		v = Math.max(0, Math.min(1, v));
		HOVER.put(id, v);
		return v;
	}

	public static boolean inside(double mx, double my, int x, int y, int w, int h) {
		return mx >= x && my >= y && mx < x + w && my < y + h;
	}

	/** A button; `primary` is the blue one. Returns nothing: clicks are checked with `inside`. */
	public static void button(GuiGraphicsExtractor g, String id, int x, int y, int w, int h, Component label, boolean primary, int mx, int my) {
		button(g, id, x, y, w, h, null, label, primary, mx, my);
	}

	/** A button with one of the launcher's icons before the label (or alone when the label is empty). */
	public static void button(GuiGraphicsExtractor g, String id, int x, int y, int w, int h, String iconName, Component label, boolean primary, int mx, int my) {
		float t = hover(id, inside(mx, my, x, y, w, h));
		if (primary) accent(g, x, y, w, h, 4, t);
		else {
			round(g, x, y, w, h, 4, blend(CARD, CARD_HOVER, t));
			roundOutline(g, x, y, w, h, 4, blend(BORDER, 0x40FFFFFF, t));
		}
		begin("button " + id, x, y, w, h);
		int color = primary ? 0xFFFFFFFF : blend(TEXT_2, TEXT, t);
		int iconSize = Math.min(10, h - 6);
		boolean hasLabel = !label.getString().isEmpty();
		int iconW = iconName == null ? 0 : iconSize + (hasLabel ? 5 : 0);
		Component fitted = fit(label, w - 10 - iconW);
		int total = iconW + (hasLabel ? width(fitted) : 0);
		int left = x + (w - total) / 2;
		if (iconName != null) icon(g, iconName, left, y + (h - iconSize) / 2, iconSize, color);
		if (hasLabel) draw(g, fitted, left + iconW, y + (h - 8) / 2, color);
		end();
	}

	/** An on/off switch, 20×10. */
	public static void toggle(GuiGraphicsExtractor g, String id, int x, int y, boolean on) {
		float t = HOVER.compute("toggle:" + id, (k, v) -> {
			float cur = v == null ? (on ? 1f : 0f) : v;
			return cur + ((on ? 1f : 0f) - cur) * 0.3f;
		});
		round(g, x, y, 20, 10, 5, blend(0xFF2A3142, ACCENT, t));
		int knob = x + 1 + Math.round(t * 10);
		round(g, knob, y + 1, 8, 8, 4, 0xFFFFFFFF);
	}

	/** A slider for 0..1 with the value written next to it. */
	public static void slider(GuiGraphicsExtractor g, int x, int y, int w, float value) {
		round(g, x, y + 3, w, 4, 2, 0xFF2A3142);
		int filled = Math.round(w * Math.max(0, Math.min(1, value)));
		round(g, x, y + 3, Math.max(4, filled), 4, 2, ACCENT);
		round(g, x + filled - 4, y, 9, 10, 4, 0xFFFFFFFF);
	}

	public static int blend(int a, int b, float t) {
		int aa = a >>> 24, ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255;
		int ba = b >>> 24, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
		return Math.round(aa + (ba - aa) * t) << 24 | Math.round(ar + (br - ar) * t) << 16 | Math.round(ag + (bg - ag) * t) << 8 | Math.round(ab + (bb - ab) * t);
	}

	// ---------- icons ----------

	/**
	 * One of the launcher's icons (Font Awesome, rendered to textures/icon/*.png by the
	 * build helper), drawn `size` pixels wide in `color`.
	 */
	public static void icon(GuiGraphicsExtractor g, String name, int x, int y, int size, int color) {
		check(g, "icon " + name, x, y, size, size);
		Identifier id = Identifier.fromNamespaceAndPath("slashclient-hud", "textures/icon/" + name + ".png");
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, id, x, y, 0, 0, size, size, 64, 64, 64, 64, color);
	}

	/** Text with a soft shadow, for places where it sits on the game or the panorama. */
	public static void drawOnWorld(GuiGraphicsExtractor g, Component c, int x, int y, int color) {
		check(g, "text \"" + c.getString() + "\"", x, y, width(c), 8);
		g.text(Minecraft.getInstance().font, c, x, y, color, true);
	}

	private static final Map<net.minecraft.world.item.Item, net.minecraft.world.item.ItemStack> STACKS = new HashMap<>();

	/**
	 * One of an item, cached; null until items can be made (their components are bound
	 * only once a world has loaded, so not in the main menu at start).
	 */
	public static net.minecraft.world.item.ItemStack stack(net.minecraft.world.item.Item item) {
		net.minecraft.world.item.ItemStack stack = STACKS.get(item);
		if (stack == null && Minecraft.getInstance().level != null) {
			try {
				stack = new net.minecraft.world.item.ItemStack(item);
				STACKS.put(item, stack);
			} catch (RuntimeException e) {
				stack = null;
			}
		}
		return stack;
	}

	/**
	 * An item as an icon. Before the game has finished loading (main menu at start) items
	 * cannot be made yet, so a symbol on an accent badge stands in for them.
	 */
	public static void icon(GuiGraphicsExtractor g, net.minecraft.world.item.Item item, String fallback, int x, int y) {
		net.minecraft.world.item.ItemStack stack = stack(item);
		if (stack != null) {
			g.item(stack, x, y);
			return;
		}
		round(g, x, y, 16, 16, 4, 0x332563EB);
		Component c = Component.literal(fallback);
		draw(g, c, x + 8 - width(c) / 2, y + 4, ACCENT_LIGHT);
	}

	/** "Slash" in white and "Client" in the accent, as in the launcher's sidebar. */
	public static void brand(GuiGraphicsExtractor g, int x, int y, float scale) {
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x, y);
		pose.scale(scale, scale);
		Component slash = bold("Slash");
		draw(g, slash, 0, 0, 0xFFFFFFFF);
		draw(g, bold("Client"), width(slash), 0, ACCENT_LIGHT);
		pose.popMatrix();
	}

	public static int brandWidth(float scale) {
		return Math.round((width(bold("Slash")) + width(bold("Client"))) * scale);
	}
}
