package dev.slash3rss.slashclient.hud.ui;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
//#if MC >= 1.21.9
import net.minecraft.network.chat.FontDescription;
//#endif
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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
	/** The accent: the launcher's blue, orange for Halloween, red on Independence Day (Season sets them each tick). */
	public static int ACCENT = 0xFF3B82F6;
	public static int ACCENT_LIGHT = 0xFF60A5FA;
	public static int ACCENT_DARK = 0xFF1D4ED8;
	/** A pale one, for text on dark tints. */
	public static int ACCENT_PALE = 0xFF93C5FD;
	public static final int TEXT = 0xFFF3F4F6;
	public static final int TEXT_2 = 0xFFB4BCC8;
	public static final int MUTED = 0xFF6B7280;
	public static final int DANGER = 0xFFEF4444;
	public static final int GREEN = 0xFF4ADE80;

	/**
	 * Outfit rasterised for each GUI scale (font/outfit_s1..s6.json, "oversample" = the scale):
	 * one pixel of a letter is then exactly one pixel on screen, so text stays sharp instead of
	 * being shrunk from a bigger bitmap.
	 */
	//#if MC >= 1.21.9
	private static final FontDescription[] OUTFIT = new FontDescription[7];
	private static final FontDescription[] OUTFIT_BOLD = new FontDescription[7];
	static {
		for (int s = 1; s <= 6; s++) {
			OUTFIT[s] = dev.slash3rss.slashclient.hud.Compat.font(Identifier.fromNamespaceAndPath("slashclient-hud", "outfit_s" + s));
			OUTFIT_BOLD[s] = dev.slash3rss.slashclient.hud.Compat.font(Identifier.fromNamespaceAndPath("slashclient-hud", "outfit_bold_s" + s));
		}
	}
	//#else
	//$ // fonts were named by their id before 1.21.9
	//$ private static final Identifier[] OUTFIT = new Identifier[7];
	//$ private static final Identifier[] OUTFIT_BOLD = new Identifier[7];
	//$ static {
	//$ 	for (int s = 1; s <= 6; s++) {
	//$ 		OUTFIT[s] = Identifier.fromNamespaceAndPath("slashclient-hud", "outfit_s" + s);
	//$ 		OUTFIT_BOLD[s] = Identifier.fromNamespaceAndPath("slashclient-hud", "outfit_bold_s" + s);
	//$ 	}
	//$ }
	//#endif

	private static int scale() {
		return Math.max(1, Math.min(6, (int) Minecraft.getInstance().getWindow().getGuiScale()));
	}

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
		return Component.literal(s).withStyle(Style.EMPTY.withFont(OUTFIT[scale()]));
	}

	public static MutableComponent bold(String s) {
		return Component.literal(s).withStyle(Style.EMPTY.withFont(OUTFIT_BOLD[scale()]));
	}

	/** A translated text in the launcher font. */
	public static MutableComponent tr(String key, Object... args) {
		return Component.translatable(key, args).withStyle(Style.EMPTY.withFont(OUTFIT[scale()]));
	}

	public static MutableComponent trBold(String key, Object... args) {
		return Component.translatable(key, args).withStyle(Style.EMPTY.withFont(OUTFIT_BOLD[scale()]));
	}

	public static int width(Component c) {
		return Minecraft.getInstance().font.width(c);
	}

	public static void draw(GuiGraphicsExtractor g, Component c, int x, int y, int color) {
		// the audit's message only built for the screenshot test (this runs for every text drawn)
		if (audit) check(g, "text \"" + c.getString() + "\"", x, y, width(c), 8);
		g.text(Minecraft.getInstance().font, c, x, y, color, false);
	}

	public static void centered(GuiGraphicsExtractor g, Component c, int cx, int y, int color) {
		draw(g, c, cx - width(c) / 2, y, color);
	}

	/** Each sliding text's clock: when it started and when it was last drawn (texts gone a while are let go). */
	private static final Map<String, long[]> MARQUEE = new java.util.HashMap<>();
	private static long marqueeSwept;

	/**
	 * Text centred in `w` pixels at `cx`: cut with "…" when too long, but while `moving` (the mouse is
	 * on its card) the whole text slides through instead: a moment at its start, then along to its
	 * end at an easy reading pace, a moment there, and back to the start.
	 */
	public static void marquee(GuiGraphicsExtractor g, String key, Component c, int cx, int y, int w, int color, boolean moving) {
		int tw = width(c);
		if (tw <= w || !moving) {
			MARQUEE.remove(key);
			centered(g, tw <= w ? c : fit(c, w), cx, y, color);
			return;
		}
		int shift = marqueeShift(key, tw - w);
		int x = cx - w / 2;
		beginClip("marquee " + key, x, y - 1, w, 11);
		g.enableScissor(x, y - 1, x + w, y + 10);
		draw(g, c, x - shift, y, color);
		g.disableScissor();
		end();
	}

	/**
	 * A button's label from `x`, at most `w` pixels wide: one that does not fit is not cut, it slides to its end and
	 * bounces back (always, so the whole of it can be read without pointing at it). `key` keeps its clock.
	 */
	public static void sliding(GuiGraphicsExtractor g, String key, Component c, int x, int y, int w, int color) {
		int tw = width(c);
		if (tw <= w) {
			MARQUEE.remove(key);
			draw(g, c, x, y, color);
			return;
		}
		int shift = marqueeShift(key, tw - w);
		beginClip("sliding " + key, x, y - 1, w, 11);
		g.enableScissor(x, y - 1, x + w, y + 10);
		draw(g, c, x - shift, y, color);
		g.disableScissor();
		end();
	}

	/** How wide a label drawn by `sliding` in `w` pixels is on screen. */
	public static int slidingWidth(Component c, int w) {
		return Math.min(width(c), w);
	}

	/**
	 * How far a sliding text is moved now (0…`over` pixels), the marquee's pace: a moment at its
	 * start, along to its end at an easy reading pace, a moment there, and back the same way (it
	 * bounces between its ends instead of jumping back). `key` keeps its clock.
	 */
	public static int marqueeShift(String key, int over) {
		if (over <= 0) {
			MARQUEE.remove(key);
			return 0;
		}
		long now = System.currentTimeMillis();
		// keys hold places and names (a chat tab's spot, a server's name): without this every window size and list kept one
		if (now - marqueeSwept > 5_000) {
			marqueeSwept = now;
			MARQUEE.values().removeIf(v -> now - v[1] > 2_000);
		}
		long[] clock = MARQUEE.computeIfAbsent(key, k -> new long[] { now, now });
		clock[1] = now;
		return bounce(now - clock[0], over, 700, Math.max(600, over * 1000L / 30));
	}

	/** `ms` into a bounce between 0 and `to`: `pause` at each end, `slide` ms each way. */
	public static int bounce(long ms, int to, long pause, long slide) {
		long at = ms % (2 * (pause + slide));
		if (at < pause) return 0;
		if (at < pause + slide) return (int) (to * (at - pause) / slide);
		if (at < 2 * pause + slide) return to;
		return (int) (to - to * (at - 2 * pause - slide) / slide);
	}

	/** Text cut with "…" to fit `max` pixels. */
	public static Component fit(Component c, int max) {
		if (width(c) <= max) return c;
		// each part keeps its own style (a coloured name stays coloured up to the "…")
		List<Map.Entry<Style, String>> parts = new ArrayList<>();
		c.visit((style, text) -> {
			if (!text.isEmpty()) parts.add(Map.entry(style, text));
			return java.util.Optional.empty();
		}, c.getStyle());
		int total = 0;
		for (var p : parts) total += p.getValue().length();
		for (int keep = total - 1; keep > 1; keep--) {
			MutableComponent out = Component.empty();
			int left = keep;
			Style lastStyle = c.getStyle();
			for (var p : parts) {
				if (left <= 0) break;
				String t = p.getValue().length() > left ? p.getValue().substring(0, left) : p.getValue();
				out.append(Component.literal(t).withStyle(p.getKey()));
				left -= t.length();
				lastStyle = p.getKey();
			}
			out.append(Component.literal("…").withStyle(lastStyle));
			if (width(out) <= max) return out;
		}
		return Component.literal("…").withStyle(c.getStyle());
	}

	// ---------- shapes ----------

	/** A rectangle with corners rounded by `r` pixels (stepped, like the game's own art). */
	public static void round(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int color) {
		if (w <= 0 || h <= 0) return;
		if (audit) check(g, "shape " + w + "x" + h, x, y, w, h);
		r = Math.min(r, Math.min(w, h) / 2);
		g.fill(x + r, y, x + w - r, y + h, color);
		for (int i = 0; i < r; i++) {
			// how far this column is cut at the top and bottom
			int cut = inset(i, r);
			g.fill(x + i, y + cut, x + i + 1, y + h - cut, color);
			g.fill(x + w - i - 1, y + cut, x + w - i, y + h - cut, color);
		}
	}

	/** As `round`, with only the top corners, only the bottom ones, or both rounded (pieces of one rounded box). */
	public static void round(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, boolean top, boolean bottom, int color) {
		if (w <= 0 || h <= 0) return;
		if (top && bottom) {
			round(g, x, y, w, h, r, color);
			return;
		}
		r = Math.min(r, Math.min(w / 2, h));
		g.fill(x + r, y, x + w - r, y + h, color);
		for (int i = 0; i < r; i++) {
			int cut = inset(i, r);
			int y1 = y + (top ? cut : 0), y2 = y + h - (bottom ? cut : 0);
			g.fill(x + i, y1, x + i + 1, y2, color);
			g.fill(x + w - i - 1, y1, x + w - i, y2, color);
		}
	}

	/** How far row (or column) `k` of a corner with radius `r` is cut in; the same curve `round` fills. */
	private static int inset(int k, int r) {
		return r - (int) Math.round(Math.sqrt(r * r - (r - k - 0.5) * (r - k - 0.5)));
	}

	/**
	 * A rounded outline, one pixel wide, that follows exactly the edge of `round` with the same
	 * size: in the corners each row is filled from the outer curve to the inner one, so the line has
	 * no gaps where the curve drops several pixels at once and no pixel is drawn twice (which would
	 * show as brighter dots on see-through colours).
	 */
	public static void roundOutline(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int color) {
		if (w <= 1 || h <= 1) return;
		r = Math.min(r, Math.min(w, h) / 2);
		for (int k = 0; k < Math.min(r, h / 2 + 1); k++) {
			int o = inset(k, r);
			for (int row : k == h - 1 - k ? new int[] { k } : new int[] { k, h - 1 - k }) {
				if (k == 0) {
					g.fill(x + o, y + row, x + w - o, y + row + 1, color);
					continue;
				}
				int in = 1 + (k - 1 < r - 1 ? inset(k - 1, r - 1) : 0);
				int end = Math.max(in, o + 1);
				g.fill(x + o, y + row, x + end, y + row + 1, color);
				g.fill(x + w - end, y + row, x + w - o, y + row + 1, color);
			}
		}
		if (h - 2 * r > 0) {
			g.fill(x, y + r, x + 1, y + h - r, color);
			g.fill(x + w - 1, y + r, x + w, y + h - r, color);
		}
	}

	/** A card like the launcher's glass panels. */
	/**
	 * Starts a layer over what was drawn so far. In 1.21.2–1.21.5 text waits in a batch drawn after
	 * all shapes and items sit higher in the depth buffer, so both showed through panels laid over
	 * them: here they are drawn out first and the depth is cleared.
	 */
	public static void layer(GuiGraphicsExtractor g) {
		//#if MC >= 1.21.2 && MC < 1.21.6
		//$ g.flush();
		//#endif
		//#if MC >= 1.21.5 && MC < 1.21.6
		//$ com.mojang.blaze3d.systems.RenderSystem.getDevice().createCommandEncoder().clearDepthTexture(Minecraft.getInstance().getMainRenderTarget().getDepthTexture(), 1.0);
		//#elif MC >= 1.21.2 && MC < 1.21.5
		//$ com.mojang.blaze3d.systems.RenderSystem.clear(256);
		//#endif
	}

	public static void panel(GuiGraphicsExtractor g, int x, int y, int w, int h) {
		layer(g);
		round(g, x, y, w, h, 6, PANEL);
		roundOutline(g, x, y, w, h, 6, BORDER);
	}

	/** A colour with another alpha (0–255): the accent's tints and outlines. */
	public static int withAlpha(int color, int alpha) {
		return alpha << 24 | (color & 0xFFFFFF);
	}

	/** The accent gradient of the launcher's primary buttons, top to bottom. */
	public static void accent(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, float strength) {
		// the gradient fills the whole rounded shape (a square one on top showed a stepped darker ring
		// in the corners), with a one-pixel rim along the same curve
		// (in the season's colours, Season)
		int dark = Season.accentDark(), light = Season.accentLight();
		roundGradient(g, x, y, w, h, r, blend(dark, light, 0.55f + strength * 0.2f), dark);
		roundOutline(g, x, y, w, h, r, blend(dark, Season.accent(), 0.5f));
	}

	/** Like `round`, filled with a gradient from `top` to `bottom`: each corner column gets its own part of it. */
	public static void roundGradient(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int top, int bottom) {
		if (w <= 0 || h <= 0) return;
		if (audit) check(g, "shape " + w + "x" + h, x, y, w, h);
		r = Math.min(r, Math.min(w, h) / 2);
		g.fillGradient(x + r, y, x + w - r, y + h, top, bottom);
		for (int i = 0; i < r; i++) {
			int cut = inset(i, r);
			int from = blend(top, bottom, cut / (float) h), to = blend(top, bottom, (h - cut) / (float) h);
			g.fillGradient(x + i, y + cut, x + i + 1, y + h - cut, from, to);
			g.fillGradient(x + w - i - 1, y + cut, x + w - i, y + h - cut, from, to);
		}
	}

	// ---------- controls ----------

	/** Hover fade per control id, so buttons light up smoothly. */
	private static final Map<String, Float> HOVER = new HashMap<>();

	public static float hover(String id, boolean over) {
		float v = HOVER.getOrDefault(id, 0f);
		v += (over ? 1 : -1) * 0.18f;
		v = Math.max(0, Math.min(1, v));
		// faded out is the same as never pointed at: not kept, so ids made of places and names do not pile up
		if (v == 0) HOVER.remove(id);
		else HOVER.put(id, v);
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
		// a label too long for the button slides along and back instead of being cut
		int room = w - 10 - iconW;
		int total = iconW + (hasLabel ? slidingWidth(label, room) : 0);
		int left = x + (w - total) / 2;
		if (iconName != null) icon(g, iconName, left, y + (h - iconSize) / 2, iconSize, color);
		if (hasLabel) sliding(g, "button " + id, label, left + iconW, y + (h - 8) / 2, room, color);
		end();
	}

	/** The width a button needs to show its whole label (and icon) at height `h`, plus `pad` on each side. */
	public static int buttonWidth(Component label, String iconName, int h, int pad) {
		int iconW = iconName == null ? 0 : Math.min(10, h - 6) + (label.getString().isEmpty() ? 0 : 5);
		// the button keeps 5 px free on each side before it cuts the label
		return width(label) + iconW + 10 + pad * 2;
	}

	/** An on/off switch, 20×10. */
	public static void toggle(GuiGraphicsExtractor g, String id, int x, int y, boolean on) {
		// kept at rest too, so a click slides the knob from where it was (switch ids are settings: a fixed few)
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
		if (audit) check(g, "icon " + name, x, y, size, size);
		Identifier id = Identifier.fromNamespaceAndPath("slashclient-hud", "textures/icon/" + name + ".png");
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, id, x, y, 0, 0, size, size, 64, 64, 64, 64, color);
	}

	/** Text with a soft shadow, for places where it sits on the game or the panorama. */
	public static void drawOnWorld(GuiGraphicsExtractor g, Component c, int x, int y, int color) {
		if (audit) check(g, "text \"" + c.getString() + "\"", x, y, width(c), 8);
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
	 * An item as an icon. Out of a world (the main menu) items cannot be made yet, so the item's
	 * own picture stands in when the game has one (a block's side for a block), else `fallback`
	 * on an accent badge: one of our icons by its name, or a short symbol.
	 */
	public static void icon(GuiGraphicsExtractor g, net.minecraft.world.item.Item item, String fallback, int x, int y) {
		net.minecraft.world.item.ItemStack stack = stack(item);
		if (stack != null) {
			g.item(stack, x, y);
			return;
		}
		//#if MC < 1.21.5
		//$ if (spawnEgg(g, item, x, y)) return;
		//#endif
		Identifier picture = PICTURES.computeIfAbsent(item, Ui::picture).orElse(null);
		if (picture != null) {
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, picture, x, y, 0, 0, 16, 16, 16, 16);
			return;
		}
		round(g, x, y, 16, 16, 4, withAlpha(ACCENT_DARK, 0x33));
		if (fallback.length() > 2) {
			// a name, not a symbol: never drawn as text (it would spill out of the badge)
			icon(g, fallback, x + 2, y + 2, 12, ACCENT_LIGHT);
			return;
		}
		Component c = Component.literal(fallback);
		draw(g, c, x + 8 - width(c) / 2, y + 4, ACCENT_LIGHT);
	}

	private static final Map<net.minecraft.world.item.Item, java.util.Optional<Identifier>> PICTURES = new HashMap<>();

	/** The game's picture of an item, without making one: its item texture, else its block's (the side first). */
	private static java.util.Optional<Identifier> picture(net.minecraft.world.item.Item item) {
		Identifier key = net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(item);
		var resources = Minecraft.getInstance().getResourceManager();
		for (String path : new String[] {"item/" + key.getPath(), "block/" + key.getPath(), "block/" + key.getPath() + "_side", "block/" + key.getPath() + "_front", "block/" + key.getPath() + "_top"}) {
			Identifier id = Identifier.fromNamespaceAndPath(key.getNamespace(), "textures/" + path + ".png");
			if (resources.getResource(id).isPresent() && !animated(resources, Identifier.fromNamespaceAndPath(key.getNamespace(), "textures/" + path + ".png.mcmeta"))) return java.util.Optional.of(id);
		}
		return java.util.Optional.empty();
	}

	//#if MC < 1.21.5
	//$ private static final Map<net.minecraft.world.item.Item, int[]> EGGS = new HashMap<>();
	//$
	//$ /** Before 1.21.5 a spawn egg is one picture in two colours of its own: its two layers, tinted. */
	//$ private static boolean spawnEgg(GuiGraphicsExtractor g, net.minecraft.world.item.Item item, int x, int y) {
	//$ 	if (!(item instanceof net.minecraft.world.item.SpawnEggItem egg)) return false;
	//$ 	int[] colors = EGGS.computeIfAbsent(item, k -> eggColors(egg));
	//$ 	if (colors == null) return false;
	//$ 	g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, Identifier.fromNamespaceAndPath("minecraft", "textures/item/spawn_egg.png"), x, y, 0, 0, 16, 16, 16, 16, 0xFF000000 | colors[0]);
	//$ 	g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, Identifier.fromNamespaceAndPath("minecraft", "textures/item/spawn_egg_overlay.png"), x, y, 0, 0, 16, 16, 16, 16, 0xFF000000 | colors[1]);
	//$ 	return true;
	//$ }
	//$
	//$ private static int[] eggColors(net.minecraft.world.item.SpawnEggItem egg) {
	//#if MC >= 1.21.4
	//$ 	// the colours are in the item's model definition (items/<id>.json), as two constant tints
	//$ 	Identifier key = net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(egg);
	//$ 	var found = Minecraft.getInstance().getResourceManager().getResource(Identifier.fromNamespaceAndPath(key.getNamespace(), "items/" + key.getPath() + ".json"));
	//$ 	if (found.isEmpty()) return null;
	//$ 	try (var in = new java.io.InputStreamReader(found.get().open(), java.nio.charset.StandardCharsets.UTF_8)) {
	//$ 		var tints = com.google.gson.JsonParser.parseReader(in).getAsJsonObject().getAsJsonObject("model").getAsJsonArray("tints");
	//$ 		return new int[] {tints.get(0).getAsJsonObject().get("value").getAsInt(), tints.get(1).getAsJsonObject().get("value").getAsInt()};
	//$ 	} catch (Exception e) {
	//$ 		return null;
	//$ 	}
	//#else
	//$ 	return new int[] {egg.getColor(0), egg.getColor(1)};
	//#endif
	//$ }
	//#endif

	/** Whether a picture is animated (a strip of frames, not one square), by its .mcmeta. */
	private static boolean animated(net.minecraft.server.packs.resources.ResourceManager resources, Identifier meta) {
		var found = resources.getResource(meta);
		if (found.isEmpty()) return false;
		try (var in = found.get().open()) {
			return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).contains("\"animation\"");
		} catch (java.io.IOException e) {
			return true;
		}
	}

	/** "Slash" in white and "Client" in the accent, as in the launcher's sidebar. */
	public static void brand(GuiGraphicsExtractor g, int x, int y, float scale) {
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x, y);
		pose.scale(scale, scale);
		Component slash = bold("Slash");
		draw(g, slash, 0, 0, 0xFFFFFFFF);
		draw(g, bold("Client"), width(slash), 0, Season.accentLight());
		pose.popMatrix();
	}

	public static int brandWidth(float scale) {
		return Math.round((width(bold("Slash")) + width(bold("Client"))) * scale);
	}
}
